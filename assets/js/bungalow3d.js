// ===================== KLINKERBOX · 3D-BUNGALOW (AUSSEN) =====================
// Echter WebGL-Bungalow für die Aussen-Ansicht (Gebäude "Bungalow"):
// Fassade (vorne + Seiten) trägt den Wand-Mix, die Terrasse den Boden-Mix.
// Flachdach mit Attika, Vordach mit Stütze, dunkle Holztür, Glasfront,
// Pflanzkübel, Kiesbeete, Gartenmauern, Himmel. Orbit + Zoom wie innen.
import * as THREE from './three.module.min.js';
import { buildEnv, glassMaterial, interiorMaterial, skyDomeTexture, normalFromCanvas, addVignette, interiorRoom } from './scene3d-lib.js?v=39';

const MOBILE=matchMedia('(pointer:coarse)').matches;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let facadeMat=null, sideMatL=null, sideMatR=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

const TARGET=new THREE.Vector3(0,1.55,2.2);
let az=0.20, po=1.500, rad=13.6;
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.85, AZ_MAX=0.85, PO_MIN=1.30, PO_MAX=1.565, R_MIN=8.5, R_MAX=20;

function mat(c,rough,metal){ return new THREE.MeshStandardMaterial({color:c,roughness:rough!=null?rough:0.9,metalness:metal||0}); }
function noiseTex(base,vari,w,h){
  const cv=document.createElement('canvas'); cv.width=w||256; cv.height=h||256;
  const c=cv.getContext('2d'); c.fillStyle=base; c.fillRect(0,0,cv.width,cv.height);
  const id=c.getImageData(0,0,cv.width,cv.height);
  for(let i=0;i<id.data.length;i+=4){ const v=(Math.random()-0.5)*vari;
    id.data[i]+=v; id.data[i+1]+=v; id.data[i+2]+=v; }
  c.putImageData(id,0,0);
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function shadowBlob(w,d,strength){
  const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
  const c=cv.getContext('2d');
  const g=c.createRadialGradient(128,128,12,128,128,124);
  g.addColorStop(0,'rgba(0,0,0,'+strength+')'); g.addColorStop(0.65,'rgba(0,0,0,'+(strength*0.4)+')'); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.fillRect(0,0,256,256);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false}));
  m.rotation.x=-Math.PI/2; m.renderOrder=1;
  return m;
}
// Gras-Büschel (Ziergras) aus dünnen Röhren + Ähren
function grassTuft(x,z,scale,parent){
  const s=scale||1;
  for(let i=0;i<9;i++){
    const a=Math.random()*Math.PI*2, lean=(0.10+Math.random()*0.22)*s, hgt=(0.45+Math.random()*0.45)*s;
    const p0=new THREE.Vector3(x,0,z);
    const p1=new THREE.Vector3(x+Math.cos(a)*lean*0.4,hgt*0.6,z+Math.sin(a)*lean*0.4);
    const p2=new THREE.Vector3(x+Math.cos(a)*lean,hgt,z+Math.sin(a)*lean);
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p0,p1,p2]),6,0.006*s,5),mat(0xa8a06e,1));
    parent.add(tube);
    if(i%2===0){ const pl=new THREE.Mesh(new THREE.SphereGeometry(0.035*s,8,8),mat(0xcabf92,1));
      pl.scale.set(1,2.6,1); pl.position.copy(p2); pl.position.y+=0.08*s; parent.add(pl); }
  }
}
function bush(x,z,r,c,parent){
  const b=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),mat(c||0x5c6e4a,1));
  b.position.set(x,r*0.75,z); b.scale.set(1,0.8,1); b.castShadow=true; parent.add(b);
}

function makeEnvironment(){
  const es=new THREE.Scene();
  const P=(w,h,c,x,y,z,ry,rx)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
    new THREE.MeshBasicMaterial({color:c})); m.position.set(x,y,z);
    if(ry) m.rotation.y=ry; if(rx) m.rotation.x=rx; es.add(m); };
  P(30,30,0xdfe4e8, 0,12,0, 0,Math.PI/2);        // heller Himmel oben
  P(30,10,0xf4f4f2, 0,4,-14, 0,0);               // Horizont
  P(30,10,0xf4f4f2, 0,4,14, Math.PI,0);
  P(30,10,0xeceeee, -14,4,0, Math.PI/2,0);
  P(30,10,0xeceeee, 14,4,0, -Math.PI/2,0);
  P(30,30,0x8b8f86, 0,-1,0, 0,-Math.PI/2);       // Boden
  const pm=new THREE.PMREMGenerator(renderer);
  const env=pm.fromScene(es,0.05).texture;
  pm.dispose();
  return env;
}

function buildScene(){
  scene=new THREE.Scene();
  scene.environment=buildEnv(renderer);
  scene.fog=new THREE.Fog(0xe9ebe9,46,90);

  // Himmel: grosse Kuppel, teilsonnig mit weichen Quellwolken
  { const sky=new THREE.Mesh(new THREE.SphereGeometry(70,32,18),
      new THREE.MeshBasicMaterial({map:skyDomeTexture(),color:new THREE.Color(1.5,1.5,1.5),side:THREE.BackSide,fog:false}));
    scene.add(sky); }

  // Licht: sonniger Tag — kühles Himmelslicht + warme Sonne von links vorn
  scene.add(new THREE.HemisphereLight(0xdbe7f2,0x8d9084,0.35));
  scene.add(new THREE.AmbientLight(0xffffff,0.06));
  const sun=new THREE.DirectionalLight(0xffeed2,2.6);
  sun.position.set(12,14.2,7.5);                    // streifendes Nachmittagslicht → Relief + Schattenwurf
  sun.target.position.set(0,0,2);
  sun.castShadow=true;
  sun.shadow.mapSize.set(MOBILE?2048:4096,MOBILE?2048:4096);
  sun.shadow.camera.left=-15; sun.shadow.camera.right=12;
  sun.shadow.camera.top=12;   sun.shadow.camera.bottom=-8;
  sun.shadow.camera.near=1; sun.shadow.camera.far=45;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.04;
  scene.add(sun); scene.add(sun.target);

  const HW=13, HH=3.3, HD=8;                     // Haus: Breite, Attika-Höhe, Tiefe

  // ---- Gelände: Rasen + Terrasse (Boden-Mix) + Kiesstreifen ----
  const lawnT=noiseTex('#7f8f60',26,512,512); lawnT.repeat.set(10,10);
  const lawn=new THREE.Mesh(new THREE.PlaneGeometry(90,90),
    new THREE.MeshStandardMaterial({map:lawnT,roughness:1}));
  lawn.rotation.x=-Math.PI/2; lawn.position.set(0,-0.01,10); lawn.receiveShadow=true; scene.add(lawn);
  floorMat=new THREE.MeshStandardMaterial({color:0xd0cdc8,roughness:0.8,envMapIntensity:0.4});
  const terr=new THREE.Mesh(new THREE.PlaneGeometry(14,8.2),floorMat);
  terr.rotation.x=-Math.PI/2; terr.position.set(0,0.005,4.1);
  terr.receiveShadow=true; scene.add(terr);
  const gravelT=noiseTex('#b6b1a8',30,256,256); gravelT.repeat.set(8,2);
  const gravelM=new THREE.MeshStandardMaterial({map:gravelT,roughness:1});
  [[-8.6,4.1,3.2,8.2],[8.6,4.1,3.2,8.2]].forEach(([x,z,w,d])=>{
    const g=new THREE.Mesh(new THREE.PlaneGeometry(w,d),gravelM);
    g.rotation.x=-Math.PI/2; g.position.set(x,0.004,z); g.receiveShadow=true; scene.add(g);
  });

  // ---- Hauskörper: Fassade vorne + Seiten (Produkt-Textur) ----
  facadeMat=new THREE.MeshStandardMaterial({color:0xdad6d1,roughness:0.95});
  const front=new THREE.Mesh(new THREE.PlaneGeometry(HW,HH),facadeMat);
  front.position.set(0,HH/2,0.001); front.receiveShadow=true; scene.add(front);
  sideMatL=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  sideMatR=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  const sideL=new THREE.Mesh(new THREE.PlaneGeometry(HD,HH),sideMatL);
  sideL.rotation.y=-Math.PI/2; sideL.position.set(-HW/2,HH/2,-HD/2); sideL.receiveShadow=true; scene.add(sideL);
  const sideR=new THREE.Mesh(new THREE.PlaneGeometry(HD,HH),sideMatR);
  sideR.rotation.y=Math.PI/2; sideR.position.set(HW/2,HH/2,-HD/2); sideR.receiveShadow=true; scene.add(sideR);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(HW,HH),mat(0xcfccc7,1));
  back.rotation.y=Math.PI; back.position.set(0,HH/2,-HD); scene.add(back);

  // ---- Flachdach mit Attika-Überstand + heller Untersicht ----
  const roof=new THREE.Mesh(new THREE.BoxGeometry(HW+0.9,0.30,HD+0.9),mat(0x3b3e43,0.6,0.2));
  roof.position.set(0,HH+0.15,-HD/2+0.22); roof.castShadow=true; scene.add(roof);
  const soffit=new THREE.Mesh(new THREE.PlaneGeometry(HW+0.8,HD+0.8),
    new THREE.MeshBasicMaterial({color:0xe8e6e2}));
  soffit.rotation.x=Math.PI/2; soffit.position.set(0,HH-0.005,-HD/2+0.22); scene.add(soffit);

  // ---- Vordach links mit Stütze, Pendelleuchte, Eingang ----
  const canopy=new THREE.Mesh(new THREE.BoxGeometry(4.3,0.26,2.3),mat(0x3b3e43,0.6,0.2));
  canopy.position.set(-4.0,2.68,1.15); canopy.castShadow=true; scene.add(canopy);
  const canSoffit=new THREE.Mesh(new THREE.PlaneGeometry(4.2,2.2),
    new THREE.MeshBasicMaterial({color:0xd9d2c6}));
  canSoffit.rotation.x=Math.PI/2; canSoffit.position.set(-4.0,2.548,1.15); scene.add(canSoffit);
  const col=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,2.55,14),mat(0x8b9096,0.5,0.5));
  col.position.set(-5.7,1.275,2.05); col.castShadow=true; scene.add(col);
  const pend=new THREE.Mesh(new THREE.SphereGeometry(0.09,12,12),
    new THREE.MeshBasicMaterial({color:0xffd9a0}));
  pend.position.set(-4.0,2.30,1.1); scene.add(pend);
  const pendCord=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.20,6),mat(0x2b2b2b,0.6));
  pendCord.position.set(-4.0,2.48,1.1); scene.add(pendCord);

  // Tür (dunkles Holz) + Seitenfenster + Oberlicht
  const doorFrame=new THREE.Mesh(new THREE.BoxGeometry(2.9,2.55,0.10),mat(0x2e3134,0.5,0.2));
  doorFrame.position.set(-3.9,1.275,0.05); scene.add(doorFrame);
  const door=new THREE.Mesh(new THREE.BoxGeometry(1.02,2.28,0.06),mat(0x3a2b22,0.55));
  door.position.set(-3.72,1.14,0.115); scene.add(door);
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.30,8),mat(0xb9bcbe,0.3,0.8));
  handle.position.set(-3.30,1.10,0.16); handle.rotation.x=Math.PI/2; scene.add(handle);
  const glassM=glassMaterial();
  [[-4.62,1.14,0.5,2.28],[-2.98,1.14,0.42,2.28],[-3.9,2.43,2.7,0.22]].forEach(([x,y,w,h])=>{
    const g=new THREE.Mesh(new THREE.PlaneGeometry(w,h),glassM);
    g.position.set(x,y,0.105); scene.add(g);
  });

  // ---- Glasfront rechts (Schiebetüren + Festverglasung, dunkle Rahmen) ----
  const bandX0=-0.9, bandX1=6.0, bandY=2.62;
  const bandFrame=new THREE.Mesh(new THREE.BoxGeometry(bandX1-bandX0+0.16,bandY+0.12,0.05),mat(0x2e3134,0.5,0.2));
  bandFrame.position.set((bandX0+bandX1)/2,(bandY)/2+0.02,0.045); scene.add(bandFrame);
  // Wohnraum hinter der Glasfront (Interior-Mapping → echte Raumtiefe)
  const bandInt=new THREE.Mesh(new THREE.PlaneGeometry(bandX1-bandX0,bandY-0.10),interiorRoom(bandX1-bandX0,bandY-0.10,3.4,5.0));
  bandInt.position.set((bandX0+bandX1)/2,bandY/2,0.085); scene.add(bandInt);
  const bandGlass=new THREE.Mesh(new THREE.PlaneGeometry(bandX1-bandX0,bandY-0.10),glassM);
  bandGlass.position.set((bandX0+bandX1)/2,bandY/2,0.10); scene.add(bandGlass);
  // Sprossen: Kämpfer + Pfosten
  const mull=(w,h,x,y)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,0.05),mat(0x26292c,0.5,0.2));
    m.position.set(x,y,0.12); scene.add(m); };
  mull(bandX1-bandX0,0.07,(bandX0+bandX1)/2,2.06);                  // Kämpfer
  [ -0.9+1.72, -0.9+3.45, -0.9+5.17 ].forEach(x=>mull(0.07,bandY-0.1,x,bandY/2));

  // ---- Seitenfenster links/rechts (dunkle Rahmen wie die Front) ----
  const sideWin=(parent,x,y,w,h)=>{
    const frame=new THREE.Mesh(new THREE.BoxGeometry(w,h,0.04),mat(0x2e3134,0.5,0.2));
    frame.position.set(x,y,0.05); parent.add(frame);
    const inter=new THREE.Mesh(new THREE.PlaneGeometry(w-0.12,h-0.12),interiorRoom(w-0.12,h-0.12,1.8,x*3.1+y));
    inter.position.set(x,y,0.09); parent.add(inter);
    const g2=new THREE.Mesh(new THREE.PlaneGeometry(w-0.10,h-0.10),glassM);
    g2.position.set(x,y,0.105); parent.add(g2);
    const sill=new THREE.Mesh(new THREE.BoxGeometry(w+0.14,0.05,0.14),mat(0xe8e6e2,0.7));
    sill.position.set(x,y-h/2-0.025,0.07); sill.castShadow=true; parent.add(sill);
  };
  [-1,1].forEach(s=>{
    const sg=new THREE.Group(); sg.rotation.y=s*Math.PI/2; sg.position.set(s*HW/2,0,-HD/2); scene.add(sg);
    sideWin(sg,-2.0,1.75,1.6,1.2); sideWin(sg,2.0,1.75,1.6,1.2);
  });

  // ---- Eingangspodest + Stufen + Betonbank ----
  const step1=new THREE.Mesh(new THREE.BoxGeometry(3.4,0.16,1.6),mat(0xc9c6c0,0.85));
  step1.position.set(-3.9,0.08,0.9); step1.castShadow=true; step1.receiveShadow=true; scene.add(step1);
  const step2=new THREE.Mesh(new THREE.BoxGeometry(3.6,0.08,2.0),mat(0xc4c1bb,0.85));
  step2.position.set(-3.9,0.04,1.1); step2.receiveShadow=true; scene.add(step2);
  // Sitzbank: massiver Betonsockel mit aufliegendem Holzsitz (sauber aufgelagert, kein Überstand)
  const benchX=-6.35, benchZ=2.75;
  const benchBase=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.40,0.46),mat(0xb9b6b0,0.9));
  benchBase.position.set(benchX,0.20,benchZ); benchBase.castShadow=true; benchBase.receiveShadow=true; scene.add(benchBase);
  const benchSeat=new THREE.Mesh(new THREE.BoxGeometry(1.56,0.07,0.5),mat(0x77543a,0.7));
  benchSeat.position.set(benchX,0.435,benchZ); benchSeat.castShadow=true; scene.add(benchSeat);
  const benchSh=shadowBlob(1.9,1.0,0.26); benchSh.position.set(benchX,0.006,benchZ); scene.add(benchSh);

  // ---- Pflanzkübel (schwarz) + Gräser nahe Eingang ----
  [[-2.35,1.5,0.30],[-1.75,1.85,0.38]].forEach(([x,z,r])=>{
    const pot=new THREE.Mesh(new THREE.CylinderGeometry(r*0.82,r,r*1.6,22),mat(0x232527,0.7));
    pot.position.set(x,r*0.8,z); pot.castShadow=true; scene.add(pot);
    const g=new THREE.Group(); g.position.set(0,r*1.5,0); pot.add(g);
    grassTuft(0,0,1.15,g);
    const sb=shadowBlob(r*3,r*3,0.25); sb.position.set(x,0.006,z); scene.add(sb);
  });

  // ---- Beete: Gräser + Büsche in den Kiesstreifen ----
  const beds=new THREE.Group(); scene.add(beds);
  [[-8.0,1.4],[-9.2,3.4],[-8.4,6.2],[7.9,1.6],[9.0,3.8],[8.2,6.4]].forEach(([x,z])=>grassTuft(x,z,1.5,beds));
  bush(-9.6,5.2,0.5,0x5c6e4a,beds); bush(9.5,5.6,0.55,0x556848,beds); bush(8.8,0.9,0.4,0x647454,beds);

  // ---- Gartenmauern links/rechts + Kulisse ----
  const wallM=mat(0xd5d2cc,0.95);
  const gwL=new THREE.Mesh(new THREE.BoxGeometry(0.18,1.8,10),wallM);
  gwL.position.set(-10.4,0.9,1.5); gwL.castShadow=true; gwL.receiveShadow=true; scene.add(gwL);
  const gwR=new THREE.Mesh(new THREE.BoxGeometry(0.18,1.8,10),wallM);
  gwR.position.set(10.4,0.9,1.5); gwR.castShadow=true; gwR.receiveShadow=true; scene.add(gwR);
  // ferne Hügel + Bäume
  [[-16,-14,7,0x99a68b],[14,-16,9,0x93a087],[0,-20,12,0xa2ae95]].forEach(([x,z,r,c])=>{
    const h=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),new THREE.MeshBasicMaterial({color:c}));
    h.scale.set(1.6,0.28,1); h.position.set(x,0,z); scene.add(h);
  });
  [[-12,-6],[12.5,-4],[14,-8]].forEach(([x,z])=>{
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,1.6,8),mat(0x5d4a38,1));
    tr.position.set(x,0.8,z); scene.add(tr);
    const fo=new THREE.Mesh(new THREE.IcosahedronGeometry(1.5,1),mat(0x5f7150,1));
    fo.scale.set(1,1.15,1); fo.position.set(x,2.6,z); fo.castShadow=true; scene.add(fo);
  });

  camera=new THREE.PerspectiveCamera(46,16/10,0.1,140);
  applyCam(true);
}

function applyCam(hard){
  const k=hard?1:0.12;
  az+=(azT-az)*k; po+=(poT-po)*k; rad+=(radT-rad)*k;
  camera.position.set(
    TARGET.x+rad*Math.sin(po)*Math.sin(az),
    Math.max(0.35,TARGET.y+rad*Math.cos(po)),
    TARGET.z+rad*Math.sin(po)*Math.cos(az));
  camera.lookAt(TARGET);
}

function ensureRenderer(){
  if(renderer||failed) return !failed;
  try{
    renderer=new THREE.WebGLRenderer({antialias:true});
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=0.72;
    maxAniso=renderer.capabilities.getMaxAnisotropy()||8;
    buildScene();
    const el=renderer.domElement;
    el.style.cssText='width:100%;height:100%;display:block;border-radius:inherit;cursor:grab;touch-action:none';
    let drag=false,lx=0,ly=0;
    el.addEventListener('pointerdown',e=>{ drag=true; lx=e.clientX; ly=e.clientY;
      el.setPointerCapture(e.pointerId); el.style.cursor='grabbing'; });
    el.addEventListener('pointermove',e=>{ if(!drag) return;
      azT=Math.min(AZ_MAX,Math.max(AZ_MIN,azT-(e.clientX-lx)*0.0042));
      poT=Math.min(PO_MAX,Math.max(PO_MIN,poT+(e.clientY-ly)*0.0032));
      lx=e.clientX; ly=e.clientY; });
    const end=()=>{ drag=false; el.style.cursor='grab'; };
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
    el.addEventListener('wheel',e=>{ e.preventDefault();
      radT=Math.min(R_MAX,Math.max(R_MIN,radT+e.deltaY*0.006)); },{passive:false});
  }catch(e){ failed=true; console.warn('Bungalow3D deaktiviert:',e); return false; }
  return true;
}
function sizeToHost(){
  if(!renderer||!host) return;
  const w=Math.max(220,host.clientWidth||300), h=Math.max(220,host.clientHeight||240);
  renderer.setPixelRatio(Math.min(MOBILE?1.5:2,window.devicePixelRatio||1));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.fov=(camera.aspect>1.45)?42:(camera.aspect>1.1?48:56);
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
  m.roughness=cv?(rough!=null?rough:1.0):0.95;   // Klinker matt
  if(cv){ const nt=normalFromCanvas(cv);                    // Fugen tief, Stein-Relief aus dem Foto
    if(nt){ nt.anisotropy=maxAniso; nt.generateMipmaps=false; nt.minFilter=THREE.LinearFilter; m.normalMap=nt; const s=ns!=null?ns:0.8; m.normalScale=new THREE.Vector2(s,s); } }
  m.envMapIntensity=cv?0.18:0.3;                    // kaum Env-Reflexion
  m.needsUpdate=true;
}
window.Bungalow3D={
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
  // Render-Loop + Watchdog anhalten (Mixer zu / anderes Gebaeude aktiv)
  stop(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } if(wdId){ clearInterval(wdId); wdId=0; } },
  // Fassade vorne, Fassade Seiten, Terrasse — je ein Canvas (null → neutral)
  setTextures(facadeCv,sideCv,floorCv){
    if(!renderer) return;
    applyTex(facadeMat,facadeCv,0xdad6d1);
    applyTex(sideMatL,sideCv||facadeCv,0xd7d3ce);
    applyTex(sideMatR,sideCv||facadeCv,0xd7d3ce);
    applyTex(floorMat,floorCv,0xd0cdc8,0.8,0.55);
  },
  snapshot(w,h){
    if(!renderer) return null;
    const pr=renderer.getPixelRatio(), sz=new THREE.Vector2(); renderer.getSize(sz);
    renderer.setPixelRatio(1); renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.fov=(camera.aspect>1.45)?42:(camera.aspect>1.1?48:56);
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    const url=renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(pr); renderer.setSize(sz.x,sz.y,false);
    camera.aspect=sz.x/sz.y;
    camera.fov=(camera.aspect>1.45)?42:(camera.aspect>1.1?48:56);
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    return url;
  }
};
window.dispatchEvent(new Event('bungalow3d-ready'));
