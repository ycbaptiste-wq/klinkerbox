// ===================== KLINKERBOX · 3D-INNENRAUM =====================
// Echter WebGL-Wohnraum für den Innen-Konfigurator: Klinkerwand (hinten +
// rechts), Bodenplatten, Fensterfront mit Vorhang, Sofa, Couchtisch,
// Stehleuchte, Deko. Per Maus/Touch drehbar (Orbit mit Grenzen), Zoom per
// Rad. Environment-Lighting + Soft-Shadows für einen fotonahen Look.
import * as THREE from './three.module.min.js';
import { buildEnv, normalFromCanvas, addVignette } from './scene3d-lib.js?v=37';

const MOBILE=matchMedia('(pointer:coarse)').matches;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let wallMat=null, wallSideMat=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

// Orbit-Zustand (gedämpft): Azimut, Polarwinkel, Radius um das Ziel
const TARGET=new THREE.Vector3(0.10,1.10,0.90);
let az=0.02, po=1.50, rad=6.2;
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.80, AZ_MAX=0.66, PO_MIN=1.34, PO_MAX=1.60, R_MIN=4.4, R_MAX=7.6;

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

// ---------- Deko-Helfer: Wandkunst, Teppich, Sky ----------
function artTex(kind){
  const cv=document.createElement('canvas'); cv.width=340; cv.height=440;
  const c=cv.getContext('2d');
  if(kind==='arch'){                              // beruhigtes Bogen-Motiv (Terrakotta)
    const g=c.createLinearGradient(0,0,0,440); g.addColorStop(0,'#efe7da'); g.addColorStop(1,'#e6dccb');
    c.fillStyle=g; c.fillRect(0,0,340,440);
    c.fillStyle='#c0764f'; c.beginPath(); c.moveTo(80,360); c.lineTo(80,220);
    c.arc(170,220,90,Math.PI,0); c.lineTo(260,360); c.closePath(); c.fill();
    c.fillStyle='#8a5a3c'; c.beginPath(); c.arc(170,232,44,Math.PI,0); c.lineTo(214,300); c.lineTo(126,300); c.closePath(); c.fill();
  } else if(kind==='lines'){                      // ruhige Linien (Greige)
    c.fillStyle='#e5ddd0'; c.fillRect(0,0,340,440);
    c.strokeStyle='rgba(96,80,64,0.55)'; c.lineWidth=3;
    for(let i=0;i<6;i++){ const y=70+i*62; c.beginPath(); c.moveTo(28,y);
      c.bezierCurveTo(130,y-34,220,y+40,312,y-8); c.stroke(); }
  } else {                                        // sanftes Farbfeld
    c.fillStyle='#ddd5c8'; c.fillRect(0,0,340,440);
    c.fillStyle='rgba(150,108,78,0.42)'; c.beginPath(); c.arc(150,285,86,0,7); c.fill();
    c.fillStyle='rgba(70,84,92,0.30)'; c.fillRect(48,66,244,120);
  }
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}
// gerahmtes Bild (Gruppe, Vorderseite +z)
function framedArt(w,h,kind,frameCol){
  const g=new THREE.Group();
  const fr=new THREE.Mesh(new THREE.BoxGeometry(w+0.07,h+0.07,0.035),mat(frameCol!=null?frameCol:0x241f1b,0.5,0.25));
  fr.castShadow=true; g.add(fr);
  const cvs=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
    new THREE.MeshStandardMaterial({map:artTex(kind),roughness:0.9,envMapIntensity:0.3}));
  cvs.position.z=0.02; g.add(cvs);
  return g;
}
// Teppich-Textur (feiner Flor + Bordüre)
function rugTex(){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=384;
  const c=cv.getContext('2d');
  c.fillStyle='#c9bda9'; c.fillRect(0,0,512,384);
  const id=c.getImageData(0,0,512,384);
  for(let i=0;i<id.data.length;i+=4){ const v=(Math.random()-0.5)*16; id.data[i]+=v; id.data[i+1]+=v; id.data[i+2]+=v; }
  c.putImageData(id,0,0);
  c.strokeStyle='rgba(120,104,84,0.55)'; c.lineWidth=10; c.strokeRect(26,26,460,332);
  c.strokeStyle='rgba(150,134,112,0.4)'; c.lineWidth=3; c.strokeRect(44,44,424,296);
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}
// vertikaler Verlauf (Himmel hinter dem Garten)
function skyTex(){
  const cv=document.createElement('canvas'); cv.width=8; cv.height=256;
  const c=cv.getContext('2d'); const g=c.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#aecbe0'); g.addColorStop(0.55,'#d6e2e6'); g.addColorStop(1,'#eef0e9');
  c.fillStyle=g; c.fillRect(0,0,8,256);
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}
// gefaltete Fläche (Vorhang/Voile) mit vertikalen Falten
function foldGeo(w,h,folds,depth){
  const g=new THREE.PlaneGeometry(w,h,folds*4,1);
  const pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){ const x=pos.getX(i);
    pos.setZ(i, depth*Math.sin(x*folds*Math.PI/(w*0.5)) ); }
  g.computeVertexNormals(); return g;
}

// ---------- Szene ----------
function buildScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xdfe7ea);
  scene.environment=buildEnv(renderer);

  const {W,H,D}=ROOM;
  const bump=fabricBump();
  const woodM=new THREE.MeshStandardMaterial({map:woodTex(),roughness:0.5,envMapIntensity:0.5});
  const brass=r=>new THREE.MeshStandardMaterial({color:0xb08d57,roughness:r!=null?r:0.32,metalness:0.9,envMapIntensity:1.0});
  const blackM=new THREE.MeshStandardMaterial({color:0x25262a,roughness:0.5,metalness:0.35});

  // ---------- LICHT (Tageslicht vom Garten + warme Leuchten) ----------
  scene.add(new THREE.HemisphereLight(0xfdfbf6,0x8f8a83,0.5));
  scene.add(new THREE.AmbientLight(0xffffff,0.17));
  const sun=new THREE.DirectionalLight(0xfff1da,2.15);
  sun.position.set(-7,4.0,4.6); sun.target.position.set(1.4,0.3,1.4);
  sun.castShadow=true; sun.shadow.mapSize.set(MOBILE?2048:4096,MOBILE?2048:4096);
  sun.shadow.camera.left=-7; sun.shadow.camera.right=7; sun.shadow.camera.top=5; sun.shadow.camera.bottom=-2;
  sun.shadow.camera.near=0.5; sun.shadow.camera.far=24; sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.03;
  scene.add(sun); scene.add(sun.target);
  const fill=new THREE.DirectionalLight(0xe9edf4,0.3); fill.position.set(5,2.6,5); scene.add(fill);
  [[-0.9],[1.5]].forEach(([x])=>{                  // Wandfluter für die Klinkerwand
    const sp=new THREE.SpotLight(0xffe7c6,9,7.5,0.7,0.9,1.2);
    sp.position.set(x,H-0.06,1.2); sp.target.position.set(x,0.3,0.0); scene.add(sp); scene.add(sp.target);
  });

  // ---------- WÄNDE (hinten + rechts = Klinker) / BODEN / DECKE ----------
  wallMat=new THREE.MeshStandardMaterial({color:0xd9d5d0,roughness:0.96});
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(W,H),wallMat);
  wall.position.set(0,H/2,0); wall.receiveShadow=true; scene.add(wall);
  wallSideMat=new THREE.MeshStandardMaterial({color:0xd6d2cc,roughness:0.96});
  const rw=new THREE.Mesh(new THREE.PlaneGeometry(D,H),wallSideMat);
  rw.rotation.y=-Math.PI/2; rw.position.set(W/2,H/2,D/2); rw.receiveShadow=true; scene.add(rw);
  floorMat=new THREE.MeshStandardMaterial({color:0xd3d0cb,roughness:0.66,envMapIntensity:0.55});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(W,D+3),floorMat);
  floor.rotation.x=-Math.PI/2; floor.position.set(0,0,(D+3)/2); floor.receiveShadow=true; scene.add(floor);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(W,D+3),new THREE.MeshStandardMaterial({color:0xf1efec,roughness:1}));
  ceil.rotation.x=Math.PI/2; ceil.position.set(0,H,(D+3)/2); scene.add(ceil);
  // Decken-Einbauspots (leuchten dezent)
  [[-1.5,1.3],[1.3,1.3],[-1.5,3.9],[1.3,3.9]].forEach(([x,z])=>{
    const ring=new THREE.Mesh(new THREE.CircleGeometry(0.065,20),blackM); ring.rotation.x=Math.PI/2; ring.position.set(x,H-0.006,z); scene.add(ring);
    const em=new THREE.Mesh(new THREE.CircleGeometry(0.048,18),new THREE.MeshStandardMaterial({color:0xfff0d4,emissive:0xffe4b4,emissiveIntensity:2.4}));
    em.rotation.x=Math.PI/2; em.position.set(x,H-0.005,z); scene.add(em);
  });

  // ---------- GARTEN hinter der Fensterfront (x < -W/2) ----------
  const gx=-W/2;
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(34,18),new THREE.MeshBasicMaterial({map:skyTex()}));
  sky.rotation.y=Math.PI/2; sky.position.set(gx-13,4,D/2); scene.add(sky);
  const glawn=new THREE.Mesh(new THREE.PlaneGeometry(40,30),new THREE.MeshStandardMaterial({color:0x7e9060,roughness:1}));
  glawn.rotation.x=-Math.PI/2; glawn.position.set(gx-20.5,-0.06,D/2); scene.add(glawn);  // beginnt erst hinter dem Fenster
  const terr=new THREE.Mesh(new THREE.PlaneGeometry(1.7,D+5),new THREE.MeshStandardMaterial({color:0xbcb7af,roughness:0.9}));
  terr.rotation.x=-Math.PI/2; terr.position.set(gx-0.85,0.008,D/2); scene.add(terr);
  const ghedge=new THREE.Mesh(new THREE.BoxGeometry(0.7,1.15,18),new THREE.MeshStandardMaterial({color:0x556b3f,roughness:1}));
  ghedge.position.set(gx-4.3,0.57,D/2); scene.add(ghedge);
  [[-3.4,1.0,0.6,0x63784a],[-4.2,5.6,0.72,0x5a7043],[-3.1,7.6,0.5,0x6b7f52],[-4.7,-0.8,0.62,0x5f7548],[-3.0,3.4,0.5,0x6c8150]].forEach(([xx,zz,r,col])=>{
    const b=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),new THREE.MeshStandardMaterial({color:col,roughness:1}));
    b.position.set(gx+xx,r*0.75,zz); scene.add(b);
  });
  [[-7.5,1.0],[-9,6.8],[-9.5,-1.2]].forEach(([xx,zz])=>{
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,1.8,8),mat(0x6a5238,1)); tr.position.set(gx+xx,0.9,zz); scene.add(tr);
    const fo=new THREE.Mesh(new THREE.IcosahedronGeometry(1.5,1),new THREE.MeshStandardMaterial({color:0x5f7448,roughness:1})); fo.scale.set(1,1.2,1); fo.position.set(gx+xx,2.65,zz); scene.add(fo);
  });

  // ---------- FENSTERFRONT: Rahmen + Glas + Gardinenstange + Voile + Leinen-Vorhänge ----------
  const frameM=mat(0x3f4348,0.4,0.5);
  for(let z=0.06; z<=D; z+=2.08){ const m=new THREE.Mesh(new THREE.BoxGeometry(0.08,H,0.06),frameM);
    m.position.set(gx,H/2,Math.min(z,D-0.04)); scene.add(m); }
  const railT=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,D),frameM); railT.position.set(gx,H-0.04,D/2); scene.add(railT);
  const railB=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.06,D),frameM); railB.position.set(gx,0.03,D/2); scene.add(railB);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(D,H),
    new THREE.MeshPhysicalMaterial({color:0xdfe8ec,transparent:true,opacity:0.07,roughness:0.03,metalness:0,envMapIntensity:1.2}));
  glass.rotation.y=Math.PI/2; glass.position.set(gx,H/2,D/2); scene.add(glass);
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,D-0.1,12),brass(0.35));
  rod.rotation.x=Math.PI/2; rod.position.set(gx+0.22,H-0.11,D/2); scene.add(rod);
  const voile=new THREE.Mesh(foldGeo(D-0.25,H-0.2,24,0.045),
    new THREE.MeshStandardMaterial({color:0xf3f0ea,transparent:true,opacity:0.32,roughness:1,side:THREE.DoubleSide}));
  voile.rotation.y=Math.PI/2; voile.position.set(gx+0.12,(H-0.2)/2+0.02,D/2); scene.add(voile);
  const drapeM=new THREE.MeshStandardMaterial({color:0xc8bda8,roughness:1,bumpMap:bump,bumpScale:0.3,side:THREE.DoubleSide});
  [0.55,D/2,D-0.55].forEach(z=>{
    const dr=new THREE.Mesh(foldGeo(1.0,H-0.14,7,0.085),drapeM);
    dr.rotation.y=Math.PI/2; dr.position.set(gx+0.20,(H-0.14)/2+0.02,z); dr.castShadow=true; scene.add(dr);
  });

  // ---------- TEPPICH ----------
  const rug=new THREE.Mesh(new THREE.PlaneGeometry(3.4,2.5),
    new THREE.MeshStandardMaterial({map:rugTex(),roughness:0.98}));
  rug.rotation.x=-Math.PI/2; rug.position.set(-0.35,0.006,2.55); rug.receiveShadow=true; scene.add(rug);

  // ---------- SOFA ----------
  const sofa=new THREE.Group();
  const fabric=new THREE.MeshStandardMaterial({color:0xd3bf98,roughness:0.94,bumpMap:bump,bumpScale:0.25});     // Beige-Creme
  const fabricLite=new THREE.MeshStandardMaterial({color:0xdecaa6,roughness:0.94,bumpMap:bump,bumpScale:0.25});
  const SW=2.62, SD=1.04;
  const base=new THREE.Mesh(rbox(SW,SD,0.24,0.06,0.03),fabric);
  base.position.y=0.14; base.castShadow=true; base.receiveShadow=true; sofa.add(base);
  [[-SW/2+0.16,-SD/2+0.10],[SW/2-0.16,-SD/2+0.10],[-SW/2+0.16,SD/2-0.10],[SW/2-0.16,SD/2-0.10]].forEach(([x,z])=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.019,0.14,16),brass(0.4));
    leg.position.set(x,0.07,z); leg.castShadow=true; sofa.add(leg);
  });
  for(let i=-1;i<=1;i++){
    const c=new THREE.Mesh(rbox(0.84,0.94,0.20,0.09,0.055),fabricLite);
    c.position.set(i*0.855,0.355,0.02); c.castShadow=true; c.receiveShadow=true; sofa.add(c);
  }
  for(let i=-1;i<=1;i++){
    const b=new THREE.Mesh(rbox(0.85,0.54,0.24,0.11,0.075),fabricLite);
    b.rotation.x=-1.45; b.position.set(i*0.855,0.76,-SD/2+0.20); b.castShadow=true; b.receiveShadow=true; sofa.add(b);
  }
  [-1,1].forEach(s=>{
    const a=new THREE.Mesh(rbox(0.22,SD,0.44,0.05,0.05),fabric);
    a.position.set(s*(SW/2+0.02),0.24,0); a.castShadow=true; a.receiveShadow=true; sofa.add(a);
  });
  const pilA=new THREE.Mesh(rbox(0.48,0.48,0.15,0.13,0.055),
    new THREE.MeshStandardMaterial({color:0xb26e52,roughness:0.92,bumpMap:bump,bumpScale:0.3}));
  pilA.rotation.set(-1.42,0,0.06); pilA.position.set(-0.86,0.71,-SD/2+0.30); pilA.castShadow=true; sofa.add(pilA);
  const pilB=new THREE.Mesh(rbox(0.44,0.44,0.14,0.12,0.05),
    new THREE.MeshStandardMaterial({color:0x8b98a0,roughness:0.92,bumpMap:bump,bumpScale:0.3}));
  pilB.rotation.set(-1.40,0,-0.05); pilB.position.set(0.90,0.70,-SD/2+0.32); pilB.castShadow=true; sofa.add(pilB);
  const wool=new THREE.MeshStandardMaterial({color:0xb7b1a8,roughness:1,bumpMap:bump,bumpScale:0.35});
  const th1=new THREE.Mesh(rbox(0.34,0.86,0.055,0.03,0.024),wool); th1.position.set(1.33,0.675,0); th1.castShadow=true; sofa.add(th1);
  const th3=new THREE.Mesh(rbox(0.055,0.68,0.40,0.024,0.022),wool); th3.position.set(1.475,0.30,0.03); th3.castShadow=true; sofa.add(th3);
  sofa.position.set(-0.4,0,0.95); scene.add(sofa);
  const sofaShadow=shadowBlob(SW+0.55,SD+0.5,0.34); sofaShadow.position.set(-0.4,0.004,0.95); scene.add(sofaShadow);

  // ---------- LOUNGE-SESSEL (rechts vorne, zum Sofa gedreht) ----------
  const chair=new THREE.Group();
  const cFab=new THREE.MeshStandardMaterial({color:0xd7c9b5,roughness:0.95,bumpMap:bump,bumpScale:0.25});
  const cSeat=new THREE.Mesh(rbox(0.72,0.70,0.16,0.08,0.05),cFab); cSeat.position.y=0.42; cSeat.castShadow=true; cSeat.receiveShadow=true; chair.add(cSeat);
  const cCush=new THREE.Mesh(rbox(0.62,0.60,0.13,0.10,0.06),new THREE.MeshStandardMaterial({color:0xe3d7c4,roughness:0.95,bumpMap:bump,bumpScale:0.25}));
  cCush.position.set(0,0.55,0.02); cCush.castShadow=true; chair.add(cCush);
  const cBack=new THREE.Mesh(rbox(0.72,0.16,0.60,0.08,0.05),cFab); cBack.position.set(0,0.64,-0.30); cBack.castShadow=true; chair.add(cBack);
  [-1,1].forEach(s=>{ const ar=new THREE.Mesh(rbox(0.13,0.64,0.28,0.05,0.04),cFab); ar.position.set(s*0.37,0.5,0.02); ar.castShadow=true; chair.add(ar); });
  // Beine bis in den Sitzkorb (0.44 hoch, Korb-Unterkante 0.42) — sonst schwebt der Sessel
  [[-0.30,-0.28],[0.30,-0.28],[-0.30,0.28],[0.30,0.28]].forEach(([x,z])=>{ const lg=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.016,0.44,10),woodM); lg.position.set(x,0.22,z); lg.castShadow=true; chair.add(lg); });
  chair.position.set(2.05,0,3.95); chair.rotation.y=-2.05; scene.add(chair);   // zum Couchtisch gedreht
  const chShadow=shadowBlob(1.1,1.1,0.3); chShadow.position.set(2.05,0.004,3.95); scene.add(chShadow);

  // ---------- COUCHTISCH (Travertin) + Deko: Tablett, Kerzen, Bücher, Schale ----------
  const table=new THREE.Mesh(new THREE.CylinderGeometry(0.46,0.46,0.34,48),
    new THREE.MeshStandardMaterial({color:0xd8cfc2,roughness:0.6,envMapIntensity:0.55}));
  table.position.set(-0.4,0.17,2.7); table.castShadow=true; table.receiveShadow=true; scene.add(table);
  const tShadow=shadowBlob(1.4,1.4,0.3); tShadow.position.set(-0.4,0.0045,2.7); scene.add(tShadow);
  [[0x7c4436,0.30],[0x33404a,0.27]].forEach(([c,wd],i)=>{
    const b=new THREE.Mesh(new THREE.BoxGeometry(wd,0.03,wd-0.06),mat(c,0.7));
    b.position.set(-0.55,0.34+0.033+i*0.032,2.58); b.rotation.y=0.3-i*0.4; b.castShadow=true; scene.add(b);
  });
  const bowlPts=[]; [[0.002,0],[0.075,0.008],[0.105,0.05],[0.092,0.085]].forEach(([r,y])=>bowlPts.push(new THREE.Vector2(r,y)));
  const bowl=new THREE.Mesh(new THREE.LatheGeometry(bowlPts,26),mat(0x27292c,0.5,0.2));
  bowl.position.set(-0.2,0.34,2.86); bowl.castShadow=true; scene.add(bowl);
  const tray=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.02,0.22),brass(0.4));
  tray.position.set(-0.5,0.35,2.82); tray.castShadow=true; scene.add(tray);
  [[-0.6,0.05],[-0.5,-0.02],[-0.42,0.04]].forEach(([x,dz],i)=>{               // Kerzen
    const cd=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.10+i*0.03,16),mat(0xefe6d6,0.7));
    cd.position.set(x,0.40+ (0.05+i*0.015),2.82+dz); cd.castShadow=true; scene.add(cd);
    const fl=new THREE.Mesh(new THREE.SphereGeometry(0.012,8,8),new THREE.MeshStandardMaterial({color:0xffdf9e,emissive:0xffb347,emissiveIntensity:3}));
    fl.scale.set(1,1.7,1); fl.position.set(x,0.40+(0.11+i*0.03),2.82+dz); scene.add(fl);
  });

  // ---------- SIDEBOARD (rechts an der Klinkerwand) — ersetzt die schiefe Konsole ----------
  const sb=new THREE.Group();
  const sbBody=new THREE.Mesh(rbox(1.6,0.46,0.44,0.03,0.02),woodM);
  sbBody.position.y=0.16; sbBody.castShadow=true; sbBody.receiveShadow=true; sb.add(sbBody);
  [[-0.72,-0.17],[0.72,-0.17],[-0.72,0.17],[0.72,0.17]].forEach(([x,z])=>{
    const lg=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.014,0.17,10),brass(0.4)); lg.position.set(x,0.085,z); lg.castShadow=true; sb.add(lg);
  });
  [-0.4,0.4].forEach(x=>{                                                     // Türfugen + Griffe
    const groove=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.34,0.006),mat(0x2a2016,0.6)); groove.position.set(x,0.38,0.231); sb.add(groove);
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.12,10),brass(0.35)); handle.rotation.x=Math.PI/2; handle.position.set(x+(x<0?0.12:-0.12),0.38,0.235); sb.add(handle);
  });
  sb.position.set(2.0,0,0.4); scene.add(sb);
  const sbShadow=shadowBlob(2.0,0.9,0.3); sbShadow.position.set(2.0,0.004,0.4); scene.add(sbShadow);
  // Tischlampe auf dem Sideboard (leuchtet)
  const tlBody=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.055,0.30,18),new THREE.MeshStandardMaterial({color:0xcabfb0,roughness:0.5,metalness:0.2}));
  tlBody.position.set(1.5,0.72,0.4); scene.add(tlBody);
  const tlShade=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.145,0.18,28,1,true),
    new THREE.MeshStandardMaterial({color:0xf3ead8,emissive:0xffe1a8,emissiveIntensity:1.7,roughness:0.9,side:THREE.DoubleSide}));
  tlShade.position.set(1.5,0.95,0.4); scene.add(tlShade);
  const tlGlow=new THREE.Mesh(new THREE.CircleGeometry(0.1,20),new THREE.MeshBasicMaterial({color:0xffe9c4}));
  tlGlow.rotation.x=Math.PI/2; tlGlow.position.set(1.5,0.875,0.4); scene.add(tlGlow);
  const tlLight=new THREE.PointLight(0xffdca0,4.5,2.6,2); tlLight.position.set(1.5,1.0,0.5); scene.add(tlLight);
  // Deko auf dem Sideboard: Bücherstapel + Skulptur + Vase
  [[0x6e5a43,0.30],[0x394049,0.27]].forEach(([c,wd],i)=>{
    const bk=new THREE.Mesh(new THREE.BoxGeometry(wd,0.035,0.20),mat(c,0.7)); bk.position.set(2.45,0.55+0.02+i*0.037,0.42); bk.rotation.y=0.1; bk.castShadow=true; scene.add(bk);
  });
  const scArc=new THREE.Mesh(new THREE.TorusGeometry(0.09,0.02,12,24,Math.PI),mat(0x2b2c2f,0.5,0.2));
  scArc.position.set(2.75,0.66,0.42); scene.add(scArc);
  const svase=new THREE.Mesh(new THREE.LatheGeometry(
    [[0.001,0],[0.06,0.01],[0.085,0.06],[0.05,0.14],[0.055,0.17]].map(([r,y])=>new THREE.Vector2(r,y)),24),mat(0xb8ada0,0.8));
  svase.position.set(2.15,0.55,0.4); scene.add(svase);

  // ---------- BEISTELLTISCH links neben dem Sofa ----------
  const stTop=new THREE.Mesh(new THREE.CylinderGeometry(0.23,0.23,0.04,28),mat(0xd8cfc2,0.6,0.1));
  stTop.position.set(-2.15,0.5,0.7); stTop.castShadow=true; scene.add(stTop);
  const stLeg=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.5,10),blackM); stLeg.position.set(-2.15,0.25,0.7); scene.add(stLeg);
  const stFoot=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,0.02,20),blackM); stFoot.position.set(-2.15,0.01,0.7); scene.add(stFoot);
  const stBook=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.03,0.17),mat(0x7c4436,0.7)); stBook.position.set(-2.15,0.535,0.7); stBook.rotation.y=0.2; scene.add(stBook);

  // ---------- ZIMMERBAUM (Olive) in der hinteren linken Ecke (dezent) ----------
  const PX=-2.85, PZ=0.6;
  const gpot=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.18,0.40,24),
    new THREE.MeshStandardMaterial({color:0xb9b1a4,roughness:0.9,bumpMap:bump,bumpScale:0.2}));
  gpot.position.set(PX,0.20,PZ); gpot.castShadow=true; scene.add(gpot);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.04,1.05,8),mat(0x7a6a52,0.9));
  trunk.position.set(PX,0.92,PZ); scene.add(trunk);
  const leafM=new THREE.MeshStandardMaterial({color:0x5c7248,roughness:1});
  [[0,1.5,0,0.26],[-0.2,1.42,0.12,0.19],[0.2,1.44,-0.1,0.20],[0.05,1.66,0.05,0.22],[-0.13,1.62,-0.14,0.17],
   [0.16,1.62,0.14,0.17],[-0.05,1.78,-0.02,0.18],[0.1,1.32,0.16,0.16],[-0.18,1.74,0.1,0.15]].forEach(([dx,y,dz,r])=>{
    const lf=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),leafM);
    lf.position.set(PX+dx,y,PZ+dz); lf.scale.set(1,1.08,1); lf.castShadow=true; scene.add(lf);
  });
  const gpShadow=shadowBlob(0.8,0.8,0.26); gpShadow.position.set(PX,0.004,PZ); scene.add(gpShadow);

  // ---------- STEHLEUCHTE (rechts, leuchtet) ----------
  const lampBase=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.16,0.02,32),blackM); lampBase.position.set(2.75,0.01,2.7); scene.add(lampBase);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,1.55,12),blackM); pole.position.set(2.75,0.79,2.7); pole.castShadow=true; scene.add(pole);
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,0.25,32,1,true),
    new THREE.MeshStandardMaterial({color:0xf1e7d5,emissive:0xffe0a4,emissiveIntensity:1.6,roughness:0.85,side:THREE.DoubleSide}));
  shade.position.set(2.75,1.6,2.7); scene.add(shade);
  const glow=new THREE.Mesh(new THREE.CircleGeometry(0.16,24),new THREE.MeshBasicMaterial({color:0xffe4b4}));
  glow.rotation.x=Math.PI/2; glow.position.set(2.75,1.49,2.7); scene.add(glow);
  const lampLight=new THREE.PointLight(0xffd9a0,6,3.8,2); lampLight.position.set(2.75,1.42,2.7); scene.add(lampLight);
  const lShadow=shadowBlob(0.7,0.7,0.22); lShadow.position.set(2.75,0.005,2.7); scene.add(lShadow);

  // ---------- PENDELLEUCHTE über dem Couchtisch (leuchtet) ----------
  const pRod=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,1.15,8),blackM); pRod.position.set(-0.4,2.42,2.7); scene.add(pRod);
  const pShade=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.24,0.28,30,1,true),
    new THREE.MeshStandardMaterial({color:0x2c2d30,roughness:0.55,metalness:0.35,side:THREE.DoubleSide})); pShade.position.set(-0.4,1.78,2.7); scene.add(pShade);
  const pEm=new THREE.Mesh(new THREE.CircleGeometry(0.2,26),new THREE.MeshStandardMaterial({color:0xfff0d0,emissive:0xffdf9e,emissiveIntensity:2.6}));
  pEm.rotation.x=-Math.PI/2; pEm.position.set(-0.4,1.67,2.7); scene.add(pEm);
  const pLight=new THREE.PointLight(0xffd9a0,7,4.2,2); pLight.position.set(-0.4,1.72,2.7); scene.add(pLight);

  // ---------- WANDKUNST + SPIEGEL ----------
  const artA=framedArt(1.7,0.82,'lines',0x2a241f); artA.position.set(-0.55,2.08,0.05); scene.add(artA);   // über dem Sofa
  const artB=framedArt(0.92,1.24,'arch',0x2a241f); artB.rotation.y=-Math.PI/2; artB.position.set(W/2-0.03,1.55,3.3); scene.add(artB); // rechte Wand
  const mRing=new THREE.Mesh(new THREE.TorusGeometry(0.4,0.03,16,40),brass(0.3)); mRing.position.set(2.0,1.8,0.06); scene.add(mRing);
  const mGlass=new THREE.Mesh(new THREE.CircleGeometry(0.385,40),
    new THREE.MeshStandardMaterial({color:0xccd4d6,roughness:0.05,metalness:0.7,envMapIntensity:1.5})); mGlass.position.set(2.0,1.8,0.05); scene.add(mGlass);

  camera=new THREE.PerspectiveCamera(48,16/10,0.1,60);
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
    renderer=new THREE.WebGLRenderer({antialias:true});
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.06;
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
  renderer.setPixelRatio(Math.min(MOBILE?1.5:2,window.devicePixelRatio||1));
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
  if(!wdId) wdId=setInterval(()=>{ if(!document.hidden && performance.now()-lastRaf>200) step(); },120);
}
function texFromCanvas(cv){
  if(!cv) return null;
  const t=new THREE.CanvasTexture(cv);
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=maxAniso;
  return t;
}
function applyTex(m,cv,fallback,rough,ns){
  if(m.map) m.map.dispose();
  if(m.normalMap){ m.normalMap.dispose(); m.normalMap=null; }
  m.map=texFromCanvas(cv);
  m.color.set(cv?0xffffff:fallback);
  if(rough!=null) m.roughness=cv?rough:0.9;
  if(cv){ const nt=normalFromCanvas(cv);                    // Fugen tief, Stein-Relief aus dem Foto
    if(nt){ nt.anisotropy=maxAniso; m.normalMap=nt; const s=ns!=null?ns:1.15; m.normalScale=new THREE.Vector2(s,s); } }
  m.envMapIntensity=cv?0.5:0.35;
  m.needsUpdate=true;
}
window.Room3D={
  available(){ return !failed; },
  mount(h){
    if(!ensureRenderer()) return false;
    host=h;
    if(renderer.domElement.parentNode!==host){ host.innerHTML=''; host.appendChild(renderer.domElement); }
    addVignette(host);
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
    applyTex(floorMat,floorCv,0xd3d0cb,0.62,0.5);
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
