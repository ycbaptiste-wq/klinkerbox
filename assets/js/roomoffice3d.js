// ===================== KLINKERBOX · 3D-INNENRAUM · BÜRO =====================
// Innen-Variante „Büro": Klinker-Akzentwand (hinten + rechts) + Klinkerboden,
// Fensterfront mit Tageslicht, Schreibtisch mit Bürostuhl und zwei Monitoren,
// Sideboard/Regal an der Klinkerwand, Besprechungstisch, Deckenraster-Leuchten.
// Gleiche Orbit/API wie room3d — Wand hinten/rechts + Boden tragen den Klinker-Mix.
import * as THREE from './three.module.min.js';
import { buildEnv, normalFromCanvas, addVignette } from './scene3d-lib.js?v=42';

const MOBILE=matchMedia('(pointer:coarse)').matches;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let wallMat=null, wallSideMat=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

const TARGET=new THREE.Vector3(0.55,1.35,0.7);
let az=0.30, po=1.505, rad=6.2;
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.55, AZ_MAX=0.78, PO_MIN=1.36, PO_MAX=1.58, R_MIN=4.4, R_MAX=7.8;
const ROOM={W:6.4, H:3.0, D:8.4};

function mat(c,rough,metal){ return new THREE.MeshStandardMaterial({color:c,roughness:rough!=null?rough:0.9,metalness:metal||0}); }
function shadowBlob(w,d,strength){
  const cv=document.createElement('canvas'); cv.width=cv.height=256; const c=cv.getContext('2d');
  const g=c.createRadialGradient(128,128,12,128,128,124);
  g.addColorStop(0,'rgba(0,0,0,'+strength+')'); g.addColorStop(0.65,'rgba(0,0,0,'+(strength*0.38)+')'); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.fillRect(0,0,256,256);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false}));
  m.rotation.x=-Math.PI/2; m.renderOrder=1; return m;
}

function buildScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xe4e8ea);
  scene.environment=buildEnv(renderer);
  const {W,H,D}=ROOM;
  const woodM=mat(0x6e5a43,0.55), blackM=new THREE.MeshStandardMaterial({color:0x25262a,roughness:0.5,metalness:0.35});
  const metalM=new THREE.MeshStandardMaterial({color:0xb8bcc0,roughness:0.35,metalness:0.7});

  // ---------- LICHT (moody: kühles Tageslicht von links + warme Akzente) ----------
  scene.add(new THREE.HemisphereLight(0xeaf0f6,0x6b6660,0.42));
  scene.add(new THREE.AmbientLight(0xffffff,0.13));
  const sun=new THREE.DirectionalLight(0xeef3fb,1.5);          // kühles Tageslicht durch die Glaswand (links)
  sun.position.set(-8,4.5,4.6); sun.target.position.set(1.4,0.6,1.2);
  sun.castShadow=true; sun.shadow.mapSize.set(MOBILE?2048:4096,MOBILE?2048:4096);
  sun.shadow.camera.left=-7; sun.shadow.camera.right=7; sun.shadow.camera.top=5; sun.shadow.camera.bottom=-2;
  sun.shadow.camera.near=0.5; sun.shadow.camera.far=24; sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.03; scene.add(sun); scene.add(sun.target);

  // ---------- WÄNDE (hinten + rechts = Klinker) / BODEN / DECKE ----------
  wallMat=new THREE.MeshStandardMaterial({color:0xd9d5d0,roughness:0.96});
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(W,H),wallMat);
  wall.position.set(0,H/2,0); wall.receiveShadow=true; scene.add(wall);
  wallSideMat=new THREE.MeshStandardMaterial({color:0xd6d2cc,roughness:0.96});
  const rw=new THREE.Mesh(new THREE.PlaneGeometry(D,H),wallSideMat);
  rw.rotation.y=-Math.PI/2; rw.position.set(W/2,H/2,D/2); rw.receiveShadow=true; scene.add(rw);
  floorMat=new THREE.MeshStandardMaterial({color:0xc4c1bb,roughness:0.5,envMapIntensity:0.6});   // polierter Estrich-Look
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(W,D+3),floorMat);
  floor.rotation.x=-Math.PI/2; floor.position.set(0,0,(D+3)/2); floor.receiveShadow=true; scene.add(floor);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(W,D+3),mat(0xece9e4,1));
  ceil.rotation.x=Math.PI/2; ceil.position.set(0,H,(D+3)/2); scene.add(ceil);
  // Lüftungsrohr an der Decke (Industrie-Look)
  const duct=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,D,16),new THREE.MeshStandardMaterial({color:0xb4b7ba,roughness:0.4,metalness:0.6}));
  duct.rotation.x=Math.PI/2; duct.position.set(1.7,H-0.22,D/2); scene.add(duct);

  // ---------- GLAS-TRENNWAND links (schwarze Rahmen) + Grossraumbüro dahinter ----------
  const gx=-W/2;
  const bgLight=new THREE.Mesh(new THREE.PlaneGeometry(D,H),new THREE.MeshBasicMaterial({color:0xeef2f5}));
  bgLight.rotation.y=Math.PI/2; bgLight.position.set(gx-2.4,H/2,D/2); scene.add(bgLight);
  [[2.0,0x8a9096],[4.6,0x7e848a],[6.8,0x888e94]].forEach(([z,c])=>{   // Tisch-Silhouetten im Grossraum
    const d2=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.72,1.1),mat(c,0.8)); d2.position.set(gx-1.4,0.5,z); scene.add(d2);
    const t2=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.04,1.1),mat(0xd8d5cf,0.7)); t2.position.set(gx-1.4,0.74,z); scene.add(t2); });
  const pfM=new THREE.MeshStandardMaterial({color:0x1c1d1f,roughness:0.5,metalness:0.4});
  for(let z=0.06; z<=D; z+=1.5){ const m=new THREE.Mesh(new THREE.BoxGeometry(0.06,H,0.08),pfM); m.position.set(gx,H/2,Math.min(z,D-0.04)); scene.add(m); }
  [0.06,H-0.06].forEach(y=>{ const r=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.1,D),pfM); r.position.set(gx,y,D/2); scene.add(r); });
  const gpane=new THREE.Mesh(new THREE.PlaneGeometry(D,H),new THREE.MeshPhysicalMaterial({color:0xeef3f4,transparent:true,opacity:0.14,roughness:0.05,metalness:0,envMapIntensity:1.0}));
  gpane.rotation.y=Math.PI/2; gpane.position.set(gx+0.02,H/2,D/2); scene.add(gpane);

  // ---------- WARMES BACKLIGHT an der Klinkerwand (Signature: LED hinter dem Regal) ----------
  const glowX=0.75, glowY=1.62;
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(2.0,1.55),new THREE.MeshBasicMaterial({color:0xf6d9a0,transparent:true,opacity:0.5}));
  glow.position.set(glowX,glowY,0.02); scene.add(glow);
  const glowL1=new THREE.PointLight(0xffcf8a,3.2,3.4,2); glowL1.position.set(glowX,glowY,0.42); scene.add(glowL1);
  const glowL2=new THREE.PointLight(0xffcf8a,2.0,3.0,2); glowL2.position.set(glowX,glowY-0.6,0.42); scene.add(glowL2);

  // ---------- SCHWARZES STAHLREGAL an der Klinkerwand (Ordner schwarz/weiss + Pflanzen) ----------
  const shelf=new THREE.Group();
  const shTop=2.15, shBot=1.05, shW=2.2, shD=0.34, shMid=(shBot+shTop)/2;
  const barM=new THREE.MeshStandardMaterial({color:0x1c1d1f,roughness:0.5,metalness:0.4});
  [shBot,shMid,shTop].forEach(y=>{ const b=new THREE.Mesh(new THREE.BoxGeometry(shW,0.03,shD),barM); b.position.set(0,y,0); shelf.add(b); });
  [-shW/2,-shW/6,shW/6,shW/2].forEach(x=>{ [shD/2-0.02,-shD/2+0.02].forEach(zz=>{ const v=new THREE.Mesh(new THREE.BoxGeometry(0.03,shTop-shBot,0.03),barM); v.position.set(x,shMid,zz); shelf.add(v); }); });
  const folder=(x,y,c)=>{ const f=new THREE.Mesh(new THREE.BoxGeometry(0.055,0.3,0.26),mat(c,0.6)); f.position.set(x,y,0); shelf.add(f); };
  let fx=-shW/2+0.13; for(let k=0;k<9;k++){ folder(fx,shTop-0.17,(k%3===0)?0xe8e6e2:0x1f2124); fx+=0.078; }
  fx=-shW/2+0.13; for(let k=0;k<7;k++){ folder(fx,shMid+0.17,(k%2===0)?0x1f2124:0xe8e6e2); fx+=0.078; }
  const pl1=new THREE.Mesh(new THREE.IcosahedronGeometry(0.14,1),mat(0x3f5a3a,1)); pl1.position.set(shW/2-0.32,shTop-0.12,0); pl1.scale.set(1,1.2,1); shelf.add(pl1);
  const pot1=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.06,0.1,12),mat(0x9a9186,0.8)); pot1.position.set(shW/2-0.32,shTop-0.29,0); shelf.add(pot1);
  const pl2=new THREE.Mesh(new THREE.IcosahedronGeometry(0.13,1),mat(0x46613f,1)); pl2.position.set(shW/2-0.2,shMid+0.15,0); pl2.scale.set(1,1.2,1); shelf.add(pl2);
  const pot2=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.05,0.09,12),mat(0x2a2c30,0.7)); pot2.position.set(shW/2-0.2,shMid+0.02,0); shelf.add(pot2);
  shelf.position.set(glowX,0,0.19); scene.add(shelf);

  // ---------- SCHREIBTISCH (schwarz, Stahl) + Monitor + Laptop ----------
  const desk=new THREE.Group();
  const deskTop=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.05,0.78),mat(0x26282b,0.5)); deskTop.position.y=0.73; deskTop.castShadow=true; deskTop.receiveShadow=true; desk.add(deskTop);
  [[-0.8],[0.8]].forEach(([x])=>{ const lg=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.71,0.72),barM); lg.position.set(x,0.355,0); desk.add(lg); });
  const ped=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.6,0.6),mat(0x1f2124,0.5)); ped.position.set(0.55,0.3,0.02); desk.add(ped);
  const scr=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.42,0.03),mat(0x111214,0.4)); scr.position.set(0.35,1.06,-0.2); desk.add(scr);
  const disp=new THREE.Mesh(new THREE.PlaneGeometry(0.64,0.36),new THREE.MeshStandardMaterial({color:0x12141a,emissive:0x1a2740,emissiveIntensity:0.7})); disp.position.set(0.35,1.06,-0.183); desk.add(disp);
  const mst=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.2,8),blackM); mst.position.set(0.35,0.87,-0.22); desk.add(mst);
  const mft=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.02,0.15),blackM); mft.position.set(0.35,0.77,-0.22); desk.add(mft);
  const lpBase=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.02,0.24),mat(0x2a2c30,0.4)); lpBase.position.set(-0.3,0.765,0.02); desk.add(lpBase);
  const lpScr=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.22,0.015),mat(0x2a2c30,0.4)); lpScr.position.set(-0.3,0.875,-0.1); lpScr.rotation.x=-0.35; desk.add(lpScr);
  const lpDisp=new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.19),new THREE.MeshStandardMaterial({color:0xeef1f4,emissive:0xdfe6ee,emissiveIntensity:0.5})); lpDisp.position.set(-0.3,0.876,-0.092); lpDisp.rotation.x=-0.35; desk.add(lpDisp);
  const cup=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.03,0.07,14),mat(0xdedbd4,0.6)); cup.position.set(-0.62,0.79,0.06); desk.add(cup);
  const pad=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.01,0.26),mat(0xf0eee8,0.7)); pad.position.set(-0.62,0.76,0.16); desk.add(pad);
  desk.position.set(0.55,0,1.0); scene.add(desk);
  { const sh=shadowBlob(2.1,1.2,0.32); sh.position.set(0.55,0.004,1.0); scene.add(sh); }

  // ---------- BÜROSTUHL (schwarz, Netzrücken) ----------
  const chair=new THREE.Group();
  const seat=new THREE.Mesh(new THREE.BoxGeometry(0.52,0.09,0.5),mat(0x2a2c30,0.7)); seat.position.y=0.5; seat.castShadow=true; chair.add(seat);
  const cback=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.66,0.06),new THREE.MeshStandardMaterial({color:0x2a2c30,roughness:0.85})); cback.position.set(0,0.86,-0.22); cback.castShadow=true; chair.add(cback);
  [-1,1].forEach(s=>{ const arm=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.34),blackM); arm.position.set(s*0.28,0.62,0.02); chair.add(arm);
    const ap=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.16,0.05),blackM); ap.position.set(s*0.28,0.55,0.12); chair.add(ap); });
  const gas=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.4,10),metalM); gas.position.y=0.27; chair.add(gas);
  for(let i=0;i<5;i++){ const a=i/5*Math.PI*2+0.3; const leg=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.03,0.3),blackM);
    leg.position.set(Math.sin(a)*0.17,0.05,Math.cos(a)*0.17); leg.rotation.y=-a; chair.add(leg);
    const cast=new THREE.Mesh(new THREE.SphereGeometry(0.03,8,8),blackM); cast.position.set(Math.sin(a)*0.3,0.03,Math.cos(a)*0.3); chair.add(cast); }
  chair.position.set(0.85,0,1.72); chair.rotation.y=Math.PI-0.22; scene.add(chair);

  // ---------- DRAHT-PAPIERKORB ----------
  const bin=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.1,0.32,20,1,true),new THREE.MeshStandardMaterial({color:0x1c1d1f,roughness:0.5,metalness:0.4,side:THREE.DoubleSide}));
  bin.position.set(-0.15,0.16,1.0); scene.add(bin);

  // ---------- 2 SCHWARZE PENDELLEUCHTEN ----------
  [[-1.15,2.1],[-0.45,2.55]].forEach(([x,z])=>{
    const cord=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.7,6),blackM); cord.position.set(x,2.6,z); scene.add(cord);
    const sh=new THREE.Mesh(new THREE.ConeGeometry(0.15,0.2,24,1,true),new THREE.MeshStandardMaterial({color:0x1c1d1f,roughness:0.5,metalness:0.4,side:THREE.DoubleSide})); sh.position.set(x,2.18,z); scene.add(sh);
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.045,10,10),new THREE.MeshBasicMaterial({color:0xffdba0})); bulb.position.set(x,2.13,z); scene.add(bulb);
    const pl=new THREE.PointLight(0xffdca0,2.3,3.6,2); pl.position.set(x,2.08,z); scene.add(pl);
  });

  // Teppich (dezent) unter dem Arbeitsplatz
  const rug=new THREE.Mesh(new THREE.PlaneGeometry(2.3,1.7),mat(0x8f8b85,0.98)); rug.rotation.x=-Math.PI/2; rug.position.set(0.5,0.006,1.25); rug.receiveShadow=true; scene.add(rug);

  camera=new THREE.PerspectiveCamera(48,16/10,0.1,60);
  applyCam(true);
}

function applyCam(hard){
  const k=hard?1:0.12;
  az+=(azT-az)*k; po+=(poT-po)*k; rad+=(radT-rad)*k;
  camera.position.set(TARGET.x+rad*Math.sin(po)*Math.sin(az),TARGET.y+rad*Math.cos(po),TARGET.z+rad*Math.sin(po)*Math.cos(az));
  camera.lookAt(TARGET);
}
function ensureRenderer(){
  if(renderer||failed) return !failed;
  try{
    renderer=new THREE.WebGLRenderer({antialias:true});
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
    maxAniso=renderer.capabilities.getMaxAnisotropy()||8;
    buildScene();
    const el=renderer.domElement;
    el.style.cssText='width:100%;height:100%;display:block;border-radius:inherit;cursor:grab;touch-action:none';
    let drag=false,lx=0,ly=0;
    el.addEventListener('pointerdown',e=>{ drag=true; lx=e.clientX; ly=e.clientY; el.setPointerCapture(e.pointerId); el.style.cursor='grabbing'; });
    el.addEventListener('pointermove',e=>{ if(!drag) return;
      azT=Math.min(AZ_MAX,Math.max(AZ_MIN,azT-(e.clientX-lx)*0.0042));
      poT=Math.min(PO_MAX,Math.max(PO_MIN,poT+(e.clientY-ly)*0.0032)); lx=e.clientX; ly=e.clientY; });
    const end=()=>{ drag=false; el.style.cursor='grab'; };
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
    el.addEventListener('wheel',e=>{ e.preventDefault(); radT=Math.min(R_MAX,Math.max(R_MIN,radT+e.deltaY*0.0028)); },{passive:false});
  }catch(e){ failed=true; console.warn('RoomOffice3D deaktiviert:',e); return false; }
  return true;
}
function sizeToHost(){
  if(!renderer||!host) return;
  const w=Math.max(220,host.clientWidth||300), h=Math.max(220,host.clientHeight||240);
  renderer.setPixelRatio(Math.min(MOBILE?1.5:2,window.devicePixelRatio||1));
  renderer.setSize(w,h,false); camera.aspect=w/h;
  camera.fov=(camera.aspect>1.45)?44:(camera.aspect>1.1?52:58); camera.updateProjectionMatrix();
}
let wdId=0, lastRaf=0;
function step(){ if(!renderer||!host) return; applyCam(false); renderer.render(scene,camera); }
function loop(){ rafId=requestAnimationFrame(loop); lastRaf=performance.now(); step(); }
function startLoops(){ if(!rafId) loop(); if(!wdId) wdId=setInterval(()=>{ if(!document.hidden && performance.now()-lastRaf>200) step(); },120); }
function texFromCanvas(cv){ if(!cv) return null; const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=maxAniso; return t; }
function applyTex(m,cv,fallback,rough,ns){
  if(m.map) m.map.dispose(); if(m.normalMap){ m.normalMap.dispose(); m.normalMap=null; }
  m.map=texFromCanvas(cv); m.color.set(cv?0xffffff:fallback);
  if(rough!=null) m.roughness=cv?rough:0.9;
  if(cv){ const nt=normalFromCanvas(cv); if(nt){ nt.anisotropy=maxAniso; nt.generateMipmaps=false; nt.minFilter=THREE.LinearFilter; m.normalMap=nt; const s=ns!=null?ns:0.75; m.normalScale=new THREE.Vector2(s,s); } }
  m.envMapIntensity=cv?0.35:0.3; m.needsUpdate=true;
}
window.RoomOffice3D={
  available(){ return !failed; },
  dbg(){ return {scene,renderer,camera}; },
  mount(h){ if(!ensureRenderer()) return false; host=h;
    if(renderer.domElement.parentNode!==host){ host.innerHTML=''; host.appendChild(renderer.domElement); }
    addVignette(host); if(ro) ro.disconnect(); ro=new ResizeObserver(()=>sizeToHost()); ro.observe(host); sizeToHost(); startLoops(); return true; },
  stop(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } if(wdId){ clearInterval(wdId); wdId=0; } },
  setTextures(wallCv,wallSideCv,floorCv){ if(!renderer) return;
    applyTex(wallMat,wallCv,0xd9d5d0); applyTex(wallSideMat,wallSideCv||wallCv,0xd6d2cc); applyTex(floorMat,floorCv,0xd3d0cb,0.6,0.5); },
  snapshot(w,h){ if(!renderer) return null;
    const pr=renderer.getPixelRatio(), sz=new THREE.Vector2(); renderer.getSize(sz);
    renderer.setPixelRatio(1); renderer.setSize(w,h,false); camera.aspect=w/h;
    camera.fov=(camera.aspect>1.45)?44:(camera.aspect>1.1?52:58); camera.updateProjectionMatrix(); renderer.render(scene,camera);
    const url=renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(pr); renderer.setSize(sz.x,sz.y,false); camera.aspect=sz.x/sz.y;
    camera.fov=(camera.aspect>1.45)?44:(camera.aspect>1.1?52:58); camera.updateProjectionMatrix(); renderer.render(scene,camera); return url; }
};
window.dispatchEvent(new Event('roomoffice3d-ready'));
