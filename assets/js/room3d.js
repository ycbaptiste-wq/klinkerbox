// ===================== KLINKERBOX · 3D-INNENRAUM =====================
// Echter WebGL-Wohnraum für den Innen-Konfigurator: Klinkerwand (hinten +
// rechts), Bodenplatten, Fensterfront mit Vorhang, Sofa, Couchtisch,
// Stehleuchte, Deko. Per Maus/Touch drehbar (Orbit mit Grenzen), Zoom per
// Rad. Environment-Lighting + Soft-Shadows für einen fotonahen Look.
import * as THREE from './three.module.min.js';
import { buildEnv } from './scene3d-lib.js?v=35';

let renderer=null, scene=null, camera=null, host=null, ro=null;
let wallMat=null, wallSideMat=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

// Orbit-Zustand (gedämpft): Azimut, Polarwinkel, Radius um das Ziel
const TARGET=new THREE.Vector3(0.10,1.10,0.90);
let az=0.06, po=1.50, rad=6.15;
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.60, AZ_MAX=0.65, PO_MIN=1.36, PO_MAX=1.60, R_MIN=4.4, R_MAX=7.4;

const ROOM={W:6.4, H:3.0, D:8.4};

// ---------- Geometrie-/Material-Helfer ----------
// weich gerundeter Quader (Kissen, Polster, Lehnen): Unterkante auf y=0
function rbox(w,d,h,rPlan,rBevel){
  const hw=w/2-rPlan, hd=d/2-rPlan;
  const s=new THREE.Shape();
  s.moveTo(-hw,-hd-rPlan);
  s.lineTo(hw,-hd-rPlan); s.absarc(hw,-hd,rPlan,-Math.PI/2,0,false);
  s.lineTo(hw+rPlan,hd);  s.absarc(hw,hd,rPlan,0,Math.PI/2,false);
  s.lineTo(-hw,hd+rPlan); s.absarc(-hw,hd,rPlan,Math.PI/2,Math.PI,false);
  s.lineTo(-hw-rPlan,-hd);s.absarc(-hw,-hd,rPlan,Math.PI,Math.PI*1.5,false);
  const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(0.01,h-2*rBevel),bevelEnabled:true,
    bevelThickness:rBevel,bevelSize:rBevel,bevelSegments:5,curveSegments:8});
  g.rotateX(-Math.PI/2); g.translate(0,rBevel,0);
  g.computeVertexNormals();
  return g;
}
function mat(c,rough,metal){ return new THREE.MeshStandardMaterial({color:c,roughness:rough!=null?rough:0.9,metalness:metal||0}); }
// feines Rausch-Bump für Textil (Leinen-Anmutung)
function fabricBump(){
  const cv=document.createElement('canvas'); cv.width=cv.height=256;
  const c=cv.getContext('2d'), id=c.createImageData(256,256);
  for(let i=0;i<id.data.length;i+=4){ const v=118+Math.random()*20; id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255; }
  c.putImageData(id,0,0);
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(6,6);
  return t;
}
// Holz-Maserung (Konsole/Regal)
function woodTex(){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=256;
  const c=cv.getContext('2d');
  c.fillStyle='#5e422c'; c.fillRect(0,0,512,256);
  for(let i=0;i<70;i++){ c.strokeStyle=`rgba(${30+Math.random()*40|0},${18+Math.random()*26|0},${10+Math.random()*16|0},${0.12+Math.random()*0.22})`;
    c.lineWidth=1+Math.random()*2.4; c.beginPath();
    const y=Math.random()*256; c.moveTo(0,y);
    c.bezierCurveTo(170,y+(Math.random()*14-7),340,y+(Math.random()*14-7),512,y+(Math.random()*10-5)); c.stroke(); }
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}
// weicher runder Kontaktschatten
function shadowBlob(w,d,strength){
  const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
  const c=cv.getContext('2d');
  const g=c.createRadialGradient(128,128,12,128,128,124);
  g.addColorStop(0,'rgba(0,0,0,'+strength+')'); g.addColorStop(0.65,'rgba(0,0,0,'+(strength*0.38)+')'); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.fillRect(0,0,256,256);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false}));
  m.rotation.x=-Math.PI/2; m.renderOrder=1;
  return m;
}

// ---------- Environment (Image-Based Lighting) ----------
function makeEnvironment(){
  const es=new THREE.Scene();
  const P=(w,h,c,x,y,z,ry,rx)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
    new THREE.MeshBasicMaterial({color:c})); m.position.set(x,y,z);
    if(ry) m.rotation.y=ry; if(rx) m.rotation.x=rx; es.add(m); };
  P(14,8,0xffffff,-6,3,0, Math.PI/2,0);          // helle Fensterseite
  P(14,8,0x8f8b85, 6,3,0,-Math.PI/2,0);          // gedämpfte Gegenseite
  P(14,14,0xe8e6e2, 0,7,0, 0,Math.PI/2);         // Decke hell
  P(14,14,0x5e5a55, 0,-1,0, 0,-Math.PI/2);       // Boden dunkler
  P(14,8,0xbdb9b3, 0,3,-7, 0,0);                 // Rückwand
  const pm=new THREE.PMREMGenerator(renderer);
  const env=pm.fromScene(es,0.06).texture;
  pm.dispose();
  return env;
}

// ---------- Szene ----------
function buildScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf1f0ee);
  scene.environment=buildEnv(renderer);

  const {W,H,D}=ROOM;
  const bump=fabricBump();

  // Licht: Tageslicht von links + Aufhellung + zwei warme Wand-Spots
  scene.add(new THREE.HemisphereLight(0xffffff,0x8f8a83,0.42));
  scene.add(new THREE.AmbientLight(0xffffff,0.16));
  const sun=new THREE.DirectionalLight(0xfff2df,2.3);
  sun.position.set(-7,3.8,4.2);
  sun.target.position.set(1.8,0.3,0.6);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-7; sun.shadow.camera.right=7;
  sun.shadow.camera.top=5;   sun.shadow.camera.bottom=-2;
  sun.shadow.camera.near=0.5; sun.shadow.camera.far=22;
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.03;
  scene.add(sun); scene.add(sun.target);
  const fill=new THREE.DirectionalLight(0xe9edf4,0.38);
  fill.position.set(5,2.6,5); scene.add(fill);
  [[-0.8],[1.55]].forEach(([x])=>{                 // Spots waschen die Klinkerwand (weich)
    const sp=new THREE.SpotLight(0xffe7c6,13,7.5,0.68,0.85,1.25);
    sp.position.set(x,H-0.06,1.35);
    sp.target.position.set(x,0.3,0.0);
    scene.add(sp); scene.add(sp.target);
  });

  // ---- Wände: hinten + rechts = Klinker (Produkt-Textur), keine Fugenlinien ----
  wallMat=new THREE.MeshStandardMaterial({color:0xd9d5d0,roughness:0.96});
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(W,H),wallMat);
  wall.position.set(0,H/2,0); wall.receiveShadow=true; scene.add(wall);
  wallSideMat=new THREE.MeshStandardMaterial({color:0xd6d2cc,roughness:0.96});
  const rw=new THREE.Mesh(new THREE.PlaneGeometry(D,H),wallSideMat);
  rw.rotation.y=-Math.PI/2; rw.position.set(W/2,H/2,D/2); rw.receiveShadow=true; scene.add(rw);

  // ---- Boden ----
  floorMat=new THREE.MeshStandardMaterial({color:0xd3d0cb,roughness:0.72,envMapIntensity:0.55});
  // Boden läuft hinter der Kamera weiter (kein Void beim Umschauen)
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(W,D+3),floorMat);
  floor.rotation.x=-Math.PI/2; floor.position.set(0,0,(D+3)/2);
  floor.receiveShadow=true; scene.add(floor);

  // ---- Decke (flat) + Spot-Blenden ----
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(W,D+3),
    new THREE.MeshBasicMaterial({color:0xefeeec}));
  ceil.rotation.x=Math.PI/2; ceil.position.set(0,H,(D+3)/2); scene.add(ceil);
  [[-0.8,1.35],[1.55,1.35],[-0.8,3.6],[1.55,3.6]].forEach(([x,z])=>{
    const d=new THREE.Mesh(new THREE.CircleGeometry(0.05,20),mat(0x4c4a47,0.5,0.3));
    d.rotation.x=Math.PI/2; d.position.set(x,H-0.004,z); scene.add(d);
  });

  // ---- Fensterfront links: Rahmen, Glas, heller Aussenraum, Vorhang ----
  const frameM=mat(0x53575c,0.45,0.4);
  const fx=-W/2;
  for(let z=0.08; z<=D; z+=2.06){
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.09,H,0.07),frameM);
    m.position.set(fx,H/2,Math.min(z,D-0.05)); scene.add(m);
  }
  const railT=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.09,D),frameM);
  railT.position.set(fx,H-0.045,D/2); scene.add(railT);
  const railB=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.07,D),frameM);
  railB.position.set(fx,0.035,D/2); scene.add(railB);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(D,H),
    new THREE.MeshPhysicalMaterial({color:0xe8eef2,transparent:true,opacity:0.10,roughness:0.04,metalness:0}));
  glass.rotation.y=Math.PI/2; glass.position.set(fx,H/2,D/2); scene.add(glass);
  const outside=new THREE.Mesh(new THREE.PlaneGeometry(D+10,H+4),
    new THREE.MeshBasicMaterial({color:0xf7f7f5}));
  outside.rotation.y=Math.PI/2; outside.position.set(fx-2.0,H/2+0.5,D/2); scene.add(outside);
  const hedge=new THREE.Mesh(new THREE.PlaneGeometry(D+8,1.0),
    new THREE.MeshBasicMaterial({color:0xdcdbd6}));
  hedge.rotation.y=Math.PI/2; hedge.position.set(fx-1.9,0.5,D/2); scene.add(hedge);
  // leichter Voile-Vorhang im hinteren Fensterbereich
  const cw=2.8, cg=new THREE.PlaneGeometry(cw,H-0.16,72,1);
  { const pos=cg.attributes.position;
    for(let i=0;i<pos.count;i++){ const x=pos.getX(i);
      pos.setZ(i, 0.055*Math.sin(x*9.5)+0.03*Math.sin(x*21+1.7)); }
    cg.computeVertexNormals(); }
  const curtain=new THREE.Mesh(cg,new THREE.MeshStandardMaterial({
    color:0xffffff,transparent:true,opacity:0.42,roughness:1,side:THREE.DoubleSide}));
  curtain.rotation.y=Math.PI/2;
  curtain.position.set(fx+0.16,(H-0.16)/2+0.02,1.75);
  scene.add(curtain);

  // ---- Sofa ----
  const sofa=new THREE.Group();
  const fabric=new THREE.MeshStandardMaterial({color:0xe9e6e0,roughness:0.94,bumpMap:bump,bumpScale:0.25});
  const fabricLite=new THREE.MeshStandardMaterial({color:0xefece6,roughness:0.94,bumpMap:bump,bumpScale:0.25});
  const SW=2.62, SD=1.04;
  const base=new THREE.Mesh(rbox(SW,SD,0.24,0.06,0.03),fabric);
  base.position.y=0.14; base.castShadow=true; base.receiveShadow=true; sofa.add(base);
  [[-SW/2+0.16,-SD/2+0.10],[SW/2-0.16,-SD/2+0.10],[-SW/2+0.16,SD/2-0.10],[SW/2-0.16,SD/2-0.10]].forEach(([x,z])=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.019,0.14,16),mat(0xd9d5cf,0.5,0.1));
    leg.position.set(x,0.07,z); leg.castShadow=true; sofa.add(leg);
  });
  for(let i=-1;i<=1;i++){
    const c=new THREE.Mesh(rbox(0.84,0.94,0.20,0.09,0.055),fabricLite);
    c.position.set(i*0.855,0.355,0.02); c.castShadow=true; c.receiveShadow=true; sofa.add(c);
  }
  for(let i=-1;i<=1;i++){
    const b=new THREE.Mesh(rbox(0.85,0.54,0.24,0.11,0.075),fabricLite);
    b.rotation.x=-1.45;
    b.position.set(i*0.855,0.76,-SD/2+0.20);
    b.castShadow=true; b.receiveShadow=true; sofa.add(b);
  }
  [-1,1].forEach(s=>{
    const a=new THREE.Mesh(rbox(0.22,SD,0.44,0.05,0.05),fabric);
    a.position.set(s*(SW/2+0.02),0.24,0); a.castShadow=true; a.receiveShadow=true; sofa.add(a);
  });
  // zwei ordentliche Zierkissen (Terrakotta + Greige) statt des schiefen Kissens
  const pilA=new THREE.Mesh(rbox(0.48,0.48,0.15,0.13,0.055),
    new THREE.MeshStandardMaterial({color:0xb26e52,roughness:0.92,bumpMap:bump,bumpScale:0.3}));
  pilA.rotation.set(-1.42,0,0.06);
  pilA.position.set(-0.86,0.71,-SD/2+0.30); pilA.castShadow=true; sofa.add(pilA);
  const pilB=new THREE.Mesh(rbox(0.44,0.44,0.14,0.12,0.05),
    new THREE.MeshStandardMaterial({color:0xb5aca0,roughness:0.92,bumpMap:bump,bumpScale:0.3}));
  pilB.rotation.set(-1.40,0,-0.05);
  pilB.position.set(0.90,0.70,-SD/2+0.32); pilB.castShadow=true; sofa.add(pilB);
  // gefaltete Decke über der rechten Armlehne (zwei Lagen + hängendes Ende)
  const wool=new THREE.MeshStandardMaterial({color:0xb7b1a8,roughness:1,bumpMap:bump,bumpScale:0.35});
  const th1=new THREE.Mesh(rbox(0.34,0.86,0.055,0.03,0.024),wool);
  th1.position.set(1.33,0.675,0); th1.castShadow=true; sofa.add(th1);
  const th2=new THREE.Mesh(rbox(0.28,0.72,0.045,0.03,0.02),wool);
  th2.position.set(1.335,0.728,0.02); th2.rotation.y=0.05; th2.castShadow=true; sofa.add(th2);
  const th3=new THREE.Mesh(rbox(0.055,0.68,0.40,0.024,0.022),wool);
  th3.position.set(1.475,0.30,0.03); th3.castShadow=true; sofa.add(th3);
  sofa.position.set(-0.15,0,0.94);
  scene.add(sofa);
  const sofaShadow=shadowBlob(SW+0.55,SD+0.5,0.34);
  sofaShadow.position.set(-0.15,0.004,0.94); scene.add(sofaShadow);

  // ---- Couchtisch (Travertin-Zylinder) + Deko ----
  const table=new THREE.Mesh(new THREE.CylinderGeometry(0.44,0.44,0.35,48),
    new THREE.MeshStandardMaterial({color:0xd8cfc2,roughness:0.65,envMapIntensity:0.5}));
  table.position.set(-0.30,0.175,2.85); table.castShadow=true; table.receiveShadow=true; scene.add(table);
  const tShadow=shadowBlob(1.35,1.35,0.30); tShadow.position.set(-0.30,0.0045,2.85); scene.add(tShadow);
  const bookColors=[0x7c4436,0x384049];
  bookColors.forEach((c,i)=>{
    const b=new THREE.Mesh(new THREE.BoxGeometry(0.30-i*0.03,0.028,0.22-i*0.02),mat(c,0.7));
    b.position.set(-0.42,0.35+0.033+i*0.030,2.72); b.rotation.y=0.28-i*0.35; b.castShadow=true; scene.add(b);
  });
  const bowlPts=[]; [[0.002,0],[0.075,0.008],[0.105,0.05],[0.092,0.085]].forEach(([r,y])=>bowlPts.push(new THREE.Vector2(r,y)));
  const bowl=new THREE.Mesh(new THREE.LatheGeometry(bowlPts,26),mat(0x27292c,0.5,0.2));
  bowl.position.set(-0.10,0.352,3.02); bowl.castShadow=true; scene.add(bowl);

  // ---- Stehleuchte rechts ----
  const lampBase=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.16,0.02,32),mat(0x232426,0.5,0.5));
  lampBase.position.set(2.45,0.01,2.1); scene.add(lampBase);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,1.55,12),mat(0x232426,0.45,0.6));
  pole.position.set(2.45,0.79,2.1); pole.castShadow=true; scene.add(pole);
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.19,0.24,32,1,true),
    new THREE.MeshStandardMaterial({color:0x2b2c2e,roughness:0.8,side:THREE.DoubleSide}));
  shade.position.set(2.45,1.62,2.1); scene.add(shade);
  const glow=new THREE.Mesh(new THREE.CircleGeometry(0.155,24),
    new THREE.MeshBasicMaterial({color:0xffdfae}));
  glow.rotation.x=Math.PI/2; glow.position.set(2.45,1.505,2.1); scene.add(glow);
  const lampLight=new THREE.PointLight(0xffd9a0,6,3.6,2);
  lampLight.position.set(2.45,1.45,2.1); scene.add(lampLight);
  const lShadow=shadowBlob(0.7,0.7,0.22); lShadow.position.set(2.45,0.005,2.1); scene.add(lShadow);

  // ---- Pampas-Deko links neben dem Sofa ----
  const potPts=[]; [[0.002,0],[0.13,0.01],[0.155,0.18],[0.125,0.40],[0.115,0.44]].forEach(([r,y])=>potPts.push(new THREE.Vector2(r,y)));
  const pot=new THREE.Mesh(new THREE.LatheGeometry(potPts,28),
    new THREE.MeshStandardMaterial({color:0x9c8f7e,roughness:0.95,bumpMap:bump,bumpScale:0.2}));
  pot.position.set(-2.35,0,0.75); pot.castShadow=true; scene.add(pot);
  const plume=mat(0xd9c9a8,1);
  for(let i=0;i<7;i++){
    const a=(i/7)*Math.PI*2, lean=0.10+Math.random()*0.16, hgt=0.85+Math.random()*0.45;
    const p0=new THREE.Vector3(-2.35,0.35,0.75);
    const p1=new THREE.Vector3(-2.35+Math.cos(a)*lean*0.4,0.35+hgt*0.55,0.75+Math.sin(a)*lean*0.4);
    const p2=new THREE.Vector3(-2.35+Math.cos(a)*lean,0.35+hgt,0.75+Math.sin(a)*lean);
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p0,p1,p2]),8,0.006,6),mat(0xb59f78,1));
    scene.add(tube);
    const pl=new THREE.Mesh(new THREE.SphereGeometry(0.055,10,10),plume);
    pl.scale.set(1,2.6,1); pl.position.copy(p2); pl.position.y+=0.10;
    pl.rotation.z=Math.cos(a)*0.35; pl.rotation.x=-Math.sin(a)*0.35;
    scene.add(pl);
  }
  const pShadow=shadowBlob(0.6,0.6,0.2); pShadow.position.set(-2.35,0.0045,0.75); scene.add(pShadow);

  // ---- Konsole + Vase + Bücher rechts an der Klinkerwand ----
  const wood=new THREE.MeshStandardMaterial({map:woodTex(),roughness:0.62,envMapIntensity:0.4});
  const conTop=new THREE.Mesh(new THREE.BoxGeometry(0.95,0.055,0.34),wood);
  conTop.position.set(2.55,0.78,0.24); conTop.castShadow=true; scene.add(conTop);
  const conLeg=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.78,0.34),wood);
  conLeg.position.set(2.12,0.39,0.24); conLeg.castShadow=true; scene.add(conLeg);
  const pts=[];
  [[0.001,0],[0.07,0.005],[0.095,0.05],[0.115,0.12],[0.10,0.19],[0.055,0.23],[0.05,0.27],[0.065,0.30],[0.058,0.315]]
    .forEach(([r,y])=>pts.push(new THREE.Vector2(r,y)));
  const vase=new THREE.Mesh(new THREE.LatheGeometry(pts,28),mat(0xcac0b4,0.85));
  vase.position.set(2.62,0.808,0.24); scene.add(vase);
  const cb=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.20,0.15),mat(0x6e5a43,0.75));
  cb.position.set(2.33,0.908,0.22); cb.rotation.z=0.09; scene.add(cb);
  const cb2=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.17,0.13),mat(0x3c4750,0.75));
  cb2.position.set(2.39,0.893,0.22); cb2.rotation.z=0.14; scene.add(cb2);

  camera=new THREE.PerspectiveCamera(48,16/10,0.1,50);
  applyCam(true);
}

function applyCam(hard){
  const k=hard?1:0.12;
  az+=(azT-az)*k; po+=(poT-po)*k; rad+=(radT-rad)*k;
  camera.position.set(
    TARGET.x+rad*Math.sin(po)*Math.sin(az),
    TARGET.y+rad*Math.cos(po),
    TARGET.z+rad*Math.sin(po)*Math.cos(az));
  camera.lookAt(TARGET);
}

// ---------- Renderer / API ----------
function ensureRenderer(){
  if(renderer||failed) return !failed;
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.02;
    maxAniso=renderer.capabilities.getMaxAnisotropy()||8;
    buildScene();
    const el=renderer.domElement;
    el.style.cssText='width:100%;height:100%;display:block;border-radius:inherit;cursor:grab;touch-action:none';
    // Orbit: ziehen = drehen · Rad = zoomen (mit Grenzen)
    let drag=false,lx=0,ly=0;
    el.addEventListener('pointerdown',e=>{ drag=true; lx=e.clientX; ly=e.clientY;
      el.setPointerCapture(e.pointerId); el.style.cursor='grabbing'; });
    el.addEventListener('pointermove',e=>{ if(!drag) return;
      azT=Math.min(AZ_MAX,Math.max(AZ_MIN,azT-(e.clientX-lx)*0.0042));
      poT=Math.min(PO_MAX,Math.max(PO_MIN,poT+(e.clientY-ly)*0.0032));
      lx=e.clientX; ly=e.clientY; });
    const end=e=>{ drag=false; el.style.cursor='grab'; };
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
    el.addEventListener('wheel',e=>{ e.preventDefault();
      radT=Math.min(R_MAX,Math.max(R_MIN,radT+e.deltaY*0.0028)); },{passive:false});
  }catch(e){ failed=true; console.warn('Room3D deaktiviert:',e); return false; }
  return true;
}
function sizeToHost(){
  if(!renderer||!host) return;
  const w=Math.max(220,host.clientWidth||300), h=Math.max(220,host.clientHeight||240);
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.fov=(camera.aspect>1.45)?44:(camera.aspect>1.1?52:58);
  camera.updateProjectionMatrix();
}
// rAF-Loop + Timer-Watchdog: rendert auch weiter, wenn der Browser rAF drosselt
let wdId=0, lastRaf=0;
function step(){ if(!renderer||!host) return; applyCam(false); renderer.render(scene,camera); }
function loop(){ rafId=requestAnimationFrame(loop); lastRaf=performance.now(); step(); }
function startLoops(){
  if(!rafId) loop();
  if(!wdId) wdId=setInterval(()=>{ if(performance.now()-lastRaf>200) step(); },120);
}
function texFromCanvas(cv){
  if(!cv) return null;
  const t=new THREE.CanvasTexture(cv);
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=maxAniso;
  return t;
}
function applyTex(m,cv,fallback,rough){
  if(m.map) m.map.dispose();
  m.map=texFromCanvas(cv);
  m.color.set(cv?0xffffff:fallback);
  if(rough!=null) m.roughness=cv?rough:0.9;
  m.needsUpdate=true;
}
window.Room3D={
  available(){ return !failed; },
  mount(h){
    if(!ensureRenderer()) return false;
    host=h;
    if(renderer.domElement.parentNode!==host){ host.innerHTML=''; host.appendChild(renderer.domElement); }
    if(ro) ro.disconnect();
    ro=new ResizeObserver(()=>sizeToHost()); ro.observe(host);
    sizeToHost();
    startLoops();
    return true;
  },
  // Wand hinten, Wand rechts, Boden — je ein Canvas (null → neutrale Fläche)
  setTextures(wallCv,wallSideCv,floorCv){
    if(!renderer) return;
    applyTex(wallMat,wallCv,0xd9d5d0);
    applyTex(wallSideMat,wallSideCv||wallCv,0xd6d2cc);
    applyTex(floorMat,floorCv,0xd3d0cb,0.72);
  },
  // hochaufgelöstes Standbild der AKTUELLEN Ansicht (für Export PNG)
  snapshot(w,h){
    if(!renderer) return null;
    const pr=renderer.getPixelRatio(), sz=new THREE.Vector2(); renderer.getSize(sz);
    renderer.setPixelRatio(1); renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.fov=(camera.aspect>1.45)?44:(camera.aspect>1.1?52:58);
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    const url=renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(pr); renderer.setSize(sz.x,sz.y,false);
    camera.aspect=sz.x/sz.y;
    camera.fov=(camera.aspect>1.45)?44:(camera.aspect>1.1?52:58);
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    return url;
  }
};
window.dispatchEvent(new Event('room3d-ready'));
