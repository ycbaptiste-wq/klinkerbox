// ===================== KLINKERBOX · 3D-BÜROGEBÄUDE (AUSSEN) =====================
// Modernes 3-geschossiges Bürohaus: Flachdach mit Attika, sechs Achsen
// grosser Fenster mit dunklen Rahmen, Glas-Eingang mit Vordach und
// beleuchteter Lobby, grosser Vorplatz, Gräser-Beete, Stadt-Kulisse.
// Fassade (vorne + Seiten) trägt den Wand-Mix, der Vorplatz den Boden-Mix.
import * as THREE from './three.module.min.js';
import { buildEnv, glassMaterial, interiorMaterial, skyDomeTexture, normalFromCanvas, addVignette } from './scene3d-lib.js?v=37';

const MOBILE=matchMedia('(pointer:coarse)').matches;

let renderer=null, scene=null, camera=null, host=null, ro=null;
let facadeMat=null, sideMatL=null, sideMatR=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

const TARGET=new THREE.Vector3(0,4.6,1.0);
let az=0.12, po=1.525, rad=25.5;
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.85, AZ_MAX=0.85, PO_MIN=1.34, PO_MAX=1.565, R_MIN=16, R_MAX=36;

const HW=18.0, HD=12.0;                          // Breite, Tiefe
const FH=3.3, NF=3, HE=FH*NF+0.35;               // Geschosshöhe, Attika-Oberkante ~10.25

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
  P(30,30,0xdfe4e8, 0,12,0, 0,Math.PI/2);
  P(30,10,0xf4f4f2, 0,4,-14, 0,0);
  P(30,10,0xf4f4f2, 0,4,14, Math.PI,0);
  P(30,10,0xeceeee, -14,4,0, Math.PI/2,0);
  P(30,10,0xeceeee, 14,4,0, -Math.PI/2,0);
  P(30,30,0x8b8f86, 0,-1,0, 0,-Math.PI/2);
  const pm=new THREE.PMREMGenerator(renderer);
  const env=pm.fromScene(es,0.05).texture; pm.dispose();
  return env;
}
// Büro-Fenster: dunkler Rahmen, breite Scheibe links, schmale rechts mit Kämpfer
function officeWindow(parent,x,y,w,h,glassM){
  const frame=new THREE.Mesh(new THREE.BoxGeometry(w,h,0.04),mat(0x3a3e43,0.55,0.2));
  frame.position.set(x,y,0.05); parent.add(frame);           // dunkler Rahmen
  const inter=new THREE.Mesh(new THREE.PlaneGeometry(w-0.12,h-0.12),interiorMaterial('office'));
  inter.position.set(x,y,0.09); parent.add(inter);           // Büro-Innenraum (Durchblick)
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(w-0.08,h-0.08),glassM);
  glass.position.set(x,y,0.105); parent.add(glass);          // reflektierendes Glas
  const mull=(mw,mh,mx,my)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(mw,mh,0.03),mat(0x33373c,0.55,0.2));
    m.position.set(mx,my,0.11); parent.add(m); };
  const splitX=x-w/2+w*0.62;
  mull(0.06,h-0.1,splitX,y);                                     // Pfosten bei 62 %
  mull(w*0.38-0.06,0.06,splitX+(w*0.38)/2,y+h*0.10);             // Kämpfer rechts
  const sill=new THREE.Mesh(new THREE.BoxGeometry(w+0.10,0.05,0.10),mat(0xd9d6d1,0.8));
  sill.position.set(x,y-h/2-0.025,0.05); parent.add(sill);
}

function buildScene(){
  scene=new THREE.Scene();
  scene.environment=buildEnv(renderer);
  scene.fog=new THREE.Fog(0xe9ebe9,62,130);

  { const sky=new THREE.Mesh(new THREE.SphereGeometry(100,32,18),
      new THREE.MeshBasicMaterial({map:skyDomeTexture(),color:new THREE.Color(1.5,1.5,1.5),side:THREE.BackSide,fog:false}));
    scene.add(sky); }

  scene.add(new THREE.HemisphereLight(0xdbe7f2,0x8d9084,0.35));
  scene.add(new THREE.AmbientLight(0xffffff,0.06));
  const sun=new THREE.DirectionalLight(0xffeed2,2.6);
  sun.position.set(-19,23,12);                   // streifendes Nachmittagslicht → Relief + Schattenwurf
  sun.target.position.set(0,0,1);
  sun.castShadow=true;
  sun.shadow.mapSize.set(MOBILE?2048:4096,MOBILE?2048:4096);
  sun.shadow.camera.left=-20; sun.shadow.camera.right=23;
  sun.shadow.camera.top=20;   sun.shadow.camera.bottom=-10;
  sun.shadow.camera.near=1; sun.shadow.camera.far=70;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.05;
  scene.add(sun); scene.add(sun.target);

  // ---- Gelände: Rasen + grosser Vorplatz (Boden-Mix) + Beete ----
  const lawnT=noiseTex('#7f8f60',26,512,512); lawnT.repeat.set(14,14);
  const lawn=new THREE.Mesh(new THREE.PlaneGeometry(130,130),
    new THREE.MeshStandardMaterial({map:lawnT,roughness:1}));
  lawn.rotation.x=-Math.PI/2; lawn.position.set(0,-0.01,12); lawn.receiveShadow=true; scene.add(lawn);
  floorMat=new THREE.MeshStandardMaterial({color:0xd0cdc8,roughness:0.8,envMapIntensity:0.4});
  const plaza=new THREE.Mesh(new THREE.PlaneGeometry(21,10),floorMat);
  plaza.rotation.x=-Math.PI/2; plaza.position.set(0,0.005,5.6);
  plaza.receiveShadow=true; scene.add(plaza);
  const bedT=noiseTex('#6e6257',26,256,128);
  const bedM=new THREE.MeshStandardMaterial({map:bedT,roughness:1});
  [[-5.6,1.0,7.6,1.9],[5.6,1.0,7.6,1.9]].forEach(([x,z,w,d])=>{
    const b=new THREE.Mesh(new THREE.PlaneGeometry(w,d),bedM);
    b.rotation.x=-Math.PI/2; b.position.set(x,0.004,z); b.receiveShadow=true; scene.add(b);
  });

  // ---- Baukörper: Fassade vorne + Seiten (Produkt-Textur) ----
  facadeMat=new THREE.MeshStandardMaterial({color:0xdad6d1,roughness:0.95});
  const front=new THREE.Mesh(new THREE.PlaneGeometry(HW,HE),facadeMat);
  front.position.set(0,HE/2,0.001); front.receiveShadow=true; scene.add(front);
  sideMatL=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  sideMatR=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  const sideL=new THREE.Mesh(new THREE.PlaneGeometry(HD,HE),sideMatL);
  sideL.rotation.y=-Math.PI/2; sideL.position.set(-HW/2,HE/2,-HD/2); sideL.receiveShadow=true; scene.add(sideL);
  const sideR=new THREE.Mesh(new THREE.PlaneGeometry(HD,HE),sideMatR);
  sideR.rotation.y=Math.PI/2; sideR.position.set(HW/2,HE/2,-HD/2); sideR.receiveShadow=true; scene.add(sideR);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(HW,HE),mat(0xcfccc7,1));
  back.rotation.y=Math.PI; back.position.set(0,HE/2,-HD); scene.add(back);
  // Dachfläche + Attika-Deckel (heller Blechabschluss, leicht auskragend)
  const roofTop=new THREE.Mesh(new THREE.PlaneGeometry(HW,HD),mat(0x9a9da1,0.9));
  roofTop.rotation.x=-Math.PI/2; roofTop.position.set(0,HE-0.02,-HD/2); scene.add(roofTop);
  const attika=new THREE.Mesh(new THREE.BoxGeometry(HW+0.35,0.22,HD+0.35),mat(0xdedbd6,0.7));
  attika.position.set(0,HE+0.11,-HD/2); attika.castShadow=true; scene.add(attika);
  // Geschossbänder entfernt — waagerechte weisse Linien wirkten zu dominant (Wunsch)

  // ---- Fenster: 6 Achsen × OG1/OG2 + EG-Verglasung ----
  const glassM=glassMaterial();
  const wgrp=new THREE.Group(); scene.add(wgrp);
  const axes=[-7.35,-4.41,-1.47,1.47,4.41,7.35];
  [1,2].forEach(fl=>{
    const cy=fl*FH+0.15+ (FH-0.15)/2 + 0.28;     // Fensterzentrum je Geschoss
    axes.forEach(x=>officeWindow(wgrp,x,fl*FH+1.85,2.5,2.55,glassM));
  });
  // EG: raumhohe Verglasung links/rechts vom Eingang
  [-7.35,-4.41,4.41,7.35].forEach(x=>officeWindow(wgrp,x,1.62,2.5,3.0,glassM));

  // ---- Eingang: Glasfront + Vordach + warm beleuchtete Lobby ----
  const lobbyGlow=new THREE.Mesh(new THREE.PlaneGeometry(5.6,3.1),
    new THREE.MeshBasicMaterial({color:0xf2e4c8}));
  lobbyGlow.position.set(0,1.6,-1.2); scene.add(lobbyGlow);
  [[-1.4,2.75],[0,2.78],[1.4,2.75]].forEach(([x,y])=>{
    const dot=new THREE.Mesh(new THREE.CircleGeometry(0.09,10),
      new THREE.MeshBasicMaterial({color:0xfff1cf}));
    dot.position.set(x,y,-1.19); scene.add(dot);
  });
  const desk=new THREE.Mesh(new THREE.BoxGeometry(1.9,1.0,0.5),mat(0xcabfa8,0.8));
  desk.position.set(0,0.5,-0.9); scene.add(desk);
  const entFrame=new THREE.Mesh(new THREE.BoxGeometry(5.9,3.35,0.10),mat(0x3a3e43,0.55,0.2));
  entFrame.position.set(0,1.675,0.05); scene.add(entFrame);
  const entGlassM=new THREE.MeshPhysicalMaterial({color:0xdfe6e8,roughness:0.04,metalness:0,
    transparent:true,opacity:0.30,envMapIntensity:1.0});
  const entGlass=new THREE.Mesh(new THREE.PlaneGeometry(5.7,3.2),entGlassM);
  entGlass.position.set(0,1.65,0.105); scene.add(entGlass);
  [[-0.85],[0.85],[-2.0],[2.0]].forEach(([x])=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.06,3.15,0.04),mat(0x33373c,0.55,0.2));
    m.position.set(x,1.65,0.115); scene.add(m);
  });
  [[-0.35],[0.35]].forEach(([x])=>{
    const h=new THREE.Mesh(new THREE.CylinderGeometry(0.016,0.016,0.9,8),mat(0xb9bcbe,0.3,0.8));
    h.position.set(x,1.35,0.15); scene.add(h);
  });
  const canopy=new THREE.Mesh(new THREE.BoxGeometry(6.4,0.16,1.5),mat(0xd9d6d1,0.7));
  canopy.position.set(0,3.48,0.75); canopy.castShadow=true; scene.add(canopy);
  const canGlow=new THREE.Mesh(new THREE.PlaneGeometry(6.2,1.3),
    new THREE.MeshBasicMaterial({color:0xf6ecd8}));
  canGlow.rotation.x=Math.PI/2; canGlow.position.set(0,3.395,0.75); scene.add(canGlow);

  // ---- Beete: Ziergräser + Büsche · Hecken + Mauern aussen ----
  const beds=new THREE.Group(); scene.add(beds);
  [[-7.8,0.9],[-6.2,1.3],[-4.6,0.8],[-3.2,1.2],[3.2,1.1],[4.8,0.8],[6.4,1.3],[7.9,0.9]].forEach(([x,z])=>grassTuft(x,z,1.35,beds));
  bush(-5.4,1.1,0.42,0x51653f,beds); bush(-2.6,0.9,0.34,0x5c6e4a,beds);
  bush(2.7,0.9,0.38,0x51653f,beds);  bush(5.7,1.2,0.44,0x5c6e4a,beds);
  const hedgeM=new THREE.MeshStandardMaterial({map:noiseTex('#4a5c38',24,512,64),roughness:1});
  [[-12.6,2.5],[12.6,2.5]].forEach(([x,z])=>{
    const h=new THREE.Mesh(new THREE.BoxGeometry(4.5,0.9,0.8),hedgeM);
    h.position.set(x,0.45,z); h.castShadow=true; beds.add(h);
  });
  const wallM=mat(0xcfccc6,0.9);
  [[-13.5,-1.0],[13.5,-1.0]].forEach(([x,z])=>{
    const wl=new THREE.Mesh(new THREE.BoxGeometry(6.0,1.9,0.2),wallM);
    wl.position.set(x,0.95,z); wl.castShadow=true; wl.receiveShadow=true; scene.add(wl);
  });

  // ---- Stadt-Kulisse + Bäume ----
  [[-22,-16,5,7],[-15,-19,4,10],[22,-17,5,8],[15,-20,4,12],[27,-22,6,9]].forEach(([x,z,w,h])=>{
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,4),new THREE.MeshBasicMaterial({color:0xc3c7cb}));
    b.position.set(x,h/2,z); scene.add(b);
  });
  [[-19,-9],[19,-8],[24,-12]].forEach(([x,z])=>{
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,2.2,8),mat(0x5d4a38,1));
    tr.position.set(x,1.1,z); scene.add(tr);
    const fo=new THREE.Mesh(new THREE.IcosahedronGeometry(2.0,1),mat(0x5f7150,1));
    fo.scale.set(1,1.15,1); fo.position.set(x,3.6,z); fo.castShadow=true; scene.add(fo);
  });

  camera=new THREE.PerspectiveCamera(46,16/10,0.1,220);
  applyCam(true);
}

function applyCam(hard){
  const k=hard?1:0.12;
  az+=(azT-az)*k; po+=(poT-po)*k; rad+=(radT-rad)*k;
  camera.position.set(
    TARGET.x+rad*Math.sin(po)*Math.sin(az),
    Math.max(0.4,TARGET.y+rad*Math.cos(po)),
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
      radT=Math.min(R_MAX,Math.max(R_MIN,radT+e.deltaY*0.009)); },{passive:false});
  }catch(e){ failed=true; console.warn('Office3D deaktiviert:',e); return false; }
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
  if(rough!=null) m.roughness=cv?rough:0.9;
  if(cv){ const nt=normalFromCanvas(cv);                    // Fugen tief, Stein-Relief aus dem Foto
    if(nt){ nt.anisotropy=maxAniso; m.normalMap=nt; const s=ns!=null?ns:1.25; m.normalScale=new THREE.Vector2(s,s); } }
  m.envMapIntensity=cv?0.5:0.35;
  m.needsUpdate=true;
}
window.Office3D={
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
window.dispatchEvent(new Event('office3d-ready'));
