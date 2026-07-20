// ================= KLINKERBOX · 3D-INNENRAUM · MAISONETTE-GANG =================
// Innen-Variante „Maisonette-Gang": Klinker-Akzentwand (hinten + rechts) +
// Klinkerboden, offene Treppe zum Obergeschoss entlang der rechten Klinkerwand,
// Konsole mit Rundspiegel, Garderobe, Galeriewand, Läufer, Pendelleuchten.
// Gleiche Orbit/API wie room3d — Wand hinten/rechts + Boden tragen den Klinker-Mix.
import * as THREE from './three.module.min.js';
import { buildEnv, normalFromCanvas, addVignette } from './scene3d-lib.js?v=42';

const MOBILE=matchMedia('(pointer:coarse)').matches;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let wallMat=null, wallSideMat=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

const TARGET=new THREE.Vector3(0.30,1.45,2.10);
let az=0.22, po=1.505, rad=7.0;
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.55, AZ_MAX=0.78, PO_MIN=1.36, PO_MAX=1.58, R_MIN=5.0, R_MAX=8.4;
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
  scene.background=new THREE.Color(0xdfe7ea);
  scene.environment=buildEnv(renderer);
  const {W,H,D}=ROOM;
  const woodM=mat(0x6e5a43,0.5), blackM=new THREE.MeshStandardMaterial({color:0x25262a,roughness:0.5,metalness:0.35});
  const brass=r=>new THREE.MeshStandardMaterial({color:0xb08d57,roughness:r!=null?r:0.32,metalness:0.9});
  const oakM=mat(0x9c7a4f,0.55);

  // ---------- LICHT (warm & wohnlich: Tageslicht links + warme Pendel + Bounce) ----------
  scene.add(new THREE.HemisphereLight(0xf3ead8,0x6f665a,0.4));
  scene.add(new THREE.AmbientLight(0xfff4e6,0.14));
  const sun=new THREE.DirectionalLight(0xfff0d6,1.55);
  sun.position.set(-8,4.5,4.6); sun.target.position.set(1.2,0.4,1.6);
  sun.castShadow=true; sun.shadow.mapSize.set(MOBILE?2048:4096,MOBILE?2048:4096);
  sun.shadow.camera.left=-7; sun.shadow.camera.right=7; sun.shadow.camera.top=5; sun.shadow.camera.bottom=-2;
  sun.shadow.camera.near=0.5; sun.shadow.camera.far=24; sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.03; scene.add(sun); scene.add(sun.target);
  const fill=new THREE.PointLight(0xffe6c0,1.3,10,2); fill.position.set(-0.5,1.9,2.6); scene.add(fill);   // warmer Bounce

  // ---------- WÄNDE (hinten + rechts = Klinker) / BODEN / DECKE ----------
  wallMat=new THREE.MeshStandardMaterial({color:0xd9d5d0,roughness:0.96});
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(W,H),wallMat);
  wall.position.set(0,H/2,0); wall.receiveShadow=true; scene.add(wall);
  wallSideMat=new THREE.MeshStandardMaterial({color:0xd6d2cc,roughness:0.96});
  const rw=new THREE.Mesh(new THREE.PlaneGeometry(D,H),wallSideMat);
  rw.rotation.y=-Math.PI/2; rw.position.set(W/2,H/2,D/2); rw.receiveShadow=true; scene.add(rw);
  floorMat=new THREE.MeshStandardMaterial({color:0xc9be9c,roughness:0.55,envMapIntensity:0.4});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(W,D+3),floorMat);
  floor.rotation.x=-Math.PI/2; floor.position.set(0,0,(D+3)/2); floor.receiveShadow=true; scene.add(floor);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(W,D+3),mat(0xf1eee8,1));
  ceil.rotation.x=Math.PI/2; ceil.position.set(0,H,(D+3)/2); scene.add(ceil);
  const lw=new THREE.Mesh(new THREE.PlaneGeometry(D,H),mat(0xefe9df,1));
  lw.rotation.y=Math.PI/2; lw.position.set(-W/2,H/2,D/2); scene.add(lw);

  // ---------- FENSTER links (Tageslicht) mit warmer Laibung ----------
  const gx=-W/2;
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(30,16),new THREE.MeshBasicMaterial({color:0xe4ece6}));
  sky.rotation.y=Math.PI/2; sky.position.set(gx-8,4,D/2); scene.add(sky);
  const wtrim=mat(0xf0ede6,0.7);
  [[1.6-1.75],[1.6+1.75]].forEach(([z])=>{ const p=new THREE.Mesh(new THREE.BoxGeometry(0.1,H-0.3,0.1),wtrim); p.position.set(gx+0.05,(H-0.3)/2+0.15,z); scene.add(p); });
  { const t=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.12,3.6),wtrim); t.position.set(gx+0.05,H-0.15,1.6); scene.add(t);
    const b=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.1,3.7),wtrim); b.position.set(gx+0.06,0.16,1.6); scene.add(b); }

  // ---------- OFFENE EICHENTREPPE (gegen die rechte Klinkerwand, steigt nach hinten) ----------
  const stair=new THREE.Group();
  const N=13, rise=0.18, run=0.26, tW=1.1, tx=W/2-tW/2-0.05, z0=5.9, xOpen=tx-tW/2;
  const slope=Math.atan2(rise,run), sLen=Math.hypot(N*run,N*rise);
  for(let i=0;i<N;i++){ const y=(i+1)*rise, z=z0-i*run;
    const tread=new THREE.Mesh(new THREE.BoxGeometry(tW,0.055,run+0.05),oakM);
    tread.position.set(tx,y,z); tread.castShadow=true; tread.receiveShadow=true; stair.add(tread); }
  const strR=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.36,sLen),oakM);   // geschlossene Wange an der Wand
  strR.position.set(tx+tW/2-0.02,(N+1)*rise/2,z0-(N-1)*run/2); strR.rotation.x=slope; strR.castShadow=true; stair.add(strR);
  for(let i=0;i<N;i++){ const y=(i+1)*rise, z=z0-i*run;    // schwarze Baluster links
    const bal=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.9,8),blackM); bal.position.set(xOpen,y+0.45,z); stair.add(bal); }
  const rail=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,sLen+0.1,12),brass(0.3));   // Messing-Handlauf folgt der Steigung
  rail.position.set(xOpen,(N+1)*rise/2+0.9,z0-(N-1)*run/2); rail.rotation.x=slope-Math.PI/2; stair.add(rail);
  const landing=new THREE.Mesh(new THREE.BoxGeometry(tW+0.5,0.08,1.0),oakM); landing.position.set(tx,N*rise+0.04,z0-N*run-0.4); landing.castShadow=true; scene.add(landing);
  const glassBal=new THREE.Mesh(new THREE.PlaneGeometry(1.0,0.5),new THREE.MeshPhysicalMaterial({color:0xdfe8ec,transparent:true,opacity:0.16,roughness:0.05,metalness:0})); glassBal.position.set(xOpen,N*rise+0.32,z0-N*run-0.4); glassBal.rotation.y=Math.PI/2; scene.add(glassBal);
  scene.add(stair);
  { const sh=shadowBlob(1.5,3.8,0.24); sh.position.set(tx,0.004,4.2); scene.add(sh); }

  // ---------- GALERIEWAND an der Treppen-Klinkerwand (rechts) ----------
  const gwx=W/2-0.03;
  const gframe=(y,z,w,h,dark)=>{
    const fr=new THREE.Mesh(new THREE.BoxGeometry(0.03,h+0.05,w+0.05),dark?mat(0x201c18,0.5):oakM);
    fr.position.set(gwx,y,z); fr.castShadow=true; scene.add(fr);
    const cv=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat(0xefe7d8,0.9)); cv.rotation.y=Math.PI/2; cv.position.set(gwx-0.02,y,z); scene.add(cv);
  };
  [[1.5,5.5,0.42,0.54,true],[1.95,5.2,0.38,0.4,false],[1.7,4.7,0.32,0.42,true],
   [2.15,4.6,0.46,0.36,false],[2.0,4.1,0.38,0.48,true],[2.45,4.0,0.32,0.4,false],
   [2.3,3.5,0.42,0.32,true],[2.5,3.15,0.32,0.32,false]].forEach(([y,z,w,h,d])=>gframe(y,z,w,h,d));

  // ---------- KONSOLE (Holz + schwarzer Stahl) mit RUNDSPIEGEL + KERAMIKLAMPE ----------
  const con=new THREE.Group();
  const cTop=new THREE.Mesh(new THREE.BoxGeometry(1.3,0.05,0.34),oakM); cTop.position.y=0.8; cTop.castShadow=true; con.add(cTop);
  [[-0.58],[0.58]].forEach(([x])=>{ [-0.12,0.12].forEach(z=>{ const lg=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.8,0.03),blackM); lg.position.set(x,0.4,z); con.add(lg); });
    const cr=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.03,0.28),blackM); cr.position.set(x,0.08,0); con.add(cr); });
  con.position.set(-1.75,0,0.24); scene.add(con);
  { const sh=shadowBlob(1.6,0.8,0.28); sh.position.set(-1.75,0.004,0.24); scene.add(sh); }
  const mRing=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.028,16,40),brass(0.3)); mRing.position.set(-1.75,1.68,0.05); scene.add(mRing);
  const mGlass=new THREE.Mesh(new THREE.CircleGeometry(0.325,40),new THREE.MeshStandardMaterial({color:0xccd4d6,roughness:0.05,metalness:0.7,envMapIntensity:1.5})); mGlass.position.set(-1.75,1.68,0.045); scene.add(mGlass);
  const tlBody=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,0.2,20),mat(0xe6e0d4,0.7)); tlBody.position.set(-2.15,0.92,0.24); scene.add(tlBody);
  const tlShade=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.15,0.16,26,1,true),new THREE.MeshStandardMaterial({color:0xf3ead8,emissive:0xffe1a8,emissiveIntensity:1.8,roughness:0.9,side:THREE.DoubleSide})); tlShade.position.set(-2.15,1.12,0.24); scene.add(tlShade);
  const tlLight=new THREE.PointLight(0xffdca0,4,2.8,2); tlLight.position.set(-2.15,1.12,0.42); scene.add(tlLight);
  const vase=new THREE.Mesh(new THREE.LatheGeometry([[0.001,0],[0.05,0.01],[0.07,0.06],[0.04,0.13],[0.045,0.16]].map(([r,y])=>new THREE.Vector2(r,y)),20),mat(0xb8ada0,0.8)); vase.position.set(-1.5,0.83,0.24); scene.add(vase);
  const bowl=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.06,0.045,20),mat(0x2a2c30,0.5,0.2)); bowl.position.set(-1.32,0.85,0.24); scene.add(bowl);

  // ---------- GARDEROBE (schwarze Leiste + Haken + Mäntel + Hut) + BANK mit Lederauflage ----------
  const rack=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.08,0.04),blackM); rack.position.set(0.55,1.7,0.03); scene.add(rack);
  [-0.45,-0.15,0.15,0.45].forEach(x=>{ const hook=new THREE.Mesh(new THREE.CylinderGeometry(0.01,0.01,0.09,8),blackM); hook.rotation.x=Math.PI/2; hook.position.set(0.55+x,1.66,0.08); scene.add(hook); });
  const coat=new THREE.Mesh(new THREE.BoxGeometry(0.36,0.72,0.13),mat(0x35434f,0.9)); coat.position.set(0.35,1.3,0.1); coat.castShadow=true; scene.add(coat);
  const coat2=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.6,0.11),mat(0x6f5340,0.9)); coat2.position.set(0.72,1.36,0.1); scene.add(coat2);
  const hat=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.13,0.09,18),mat(0x9a8a70,0.8)); hat.position.set(0.9,1.6,0.1); scene.add(hat);
  const benchTop=new THREE.Mesh(new THREE.BoxGeometry(1.15,0.08,0.4),oakM); benchTop.position.set(0.55,0.44,0.3); benchTop.castShadow=true; scene.add(benchTop);
  const cushion=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.08,0.34),mat(0x3a2c22,0.6)); cushion.position.set(0.55,0.52,0.3); scene.add(cushion);
  [[-0.5,-0.15],[0.5,-0.15],[-0.5,0.15],[0.5,0.15]].forEach(([x,z])=>{ const lg=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.44,0.04),oakM); lg.position.set(0.55+x,0.22,0.3+z); scene.add(lg); });

  // ---------- LÄUFER + 2 DOME-PENDEL + schlanke Pflanze ----------
  const rug=new THREE.Mesh(new THREE.PlaneGeometry(1.0,4.2),mat(0xcabfa8,0.98)); rug.rotation.x=-Math.PI/2; rug.position.set(-0.5,0.006,2.8); rug.receiveShadow=true; scene.add(rug);
  [[-0.5,1.7],[-0.5,3.9]].forEach(([x,z])=>{
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(0.006,0.006,0.55,6),blackM); rod.position.set(x,2.62,z); scene.add(rod);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(0.17,24,16,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0x1c1d1f,roughness:0.5,metalness:0.35,side:THREE.DoubleSide}));
    dome.rotation.x=Math.PI; dome.position.set(x,2.34,z); scene.add(dome);
    const em=new THREE.Mesh(new THREE.CircleGeometry(0.15,20),new THREE.MeshStandardMaterial({color:0xfff0d0,emissive:0xffdf9e,emissiveIntensity:2.6})); em.rotation.x=-Math.PI/2; em.position.set(x,2.28,z); scene.add(em);
    const pl=new THREE.PointLight(0xffd9a0,4.2,4.2,2); pl.position.set(x,2.24,z); scene.add(pl);
  });
  const pot=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.11,0.36,16),mat(0x8a8175,0.8)); pot.position.set(-2.7,0.18,3.7); scene.add(pot);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.03,0.7,8),mat(0x7a6a52,0.9)); trunk.position.set(-2.7,0.6,3.7); scene.add(trunk);
  [[0,1.1,0,0.24],[-0.14,1.02,0.1,0.17],[0.14,1.04,-0.08,0.18],[0.03,1.24,0.03,0.19]].forEach(([dx,y,dz,r])=>{ const lf=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),mat(0x5c7248,1)); lf.position.set(-2.7+dx,y,3.7+dz); lf.scale.set(1,1.15,1); lf.castShadow=true; scene.add(lf); });

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
    renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.06;
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
  }catch(e){ failed=true; console.warn('RoomHall3D deaktiviert:',e); return false; }
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
window.RoomHall3D={
  available(){ return !failed; },
  dbg(){ return {scene,renderer,camera}; },
  mount(h){ if(!ensureRenderer()) return false; host=h;
    if(renderer.domElement.parentNode!==host){ host.innerHTML=''; host.appendChild(renderer.domElement); }
    addVignette(host); if(ro) ro.disconnect(); ro=new ResizeObserver(()=>sizeToHost()); ro.observe(host); sizeToHost(); startLoops(); return true; },
  stop(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } if(wdId){ clearInterval(wdId); wdId=0; } },
  setTextures(wallCv,wallSideCv,floorCv){ if(!renderer) return;
    applyTex(wallMat,wallCv,0xd9d5d0); applyTex(wallSideMat,wallSideCv||wallCv,0xd6d2cc); applyTex(floorMat,floorCv,0xd3d0cb,0.62,0.5); },
  snapshot(w,h){ if(!renderer) return null;
    const pr=renderer.getPixelRatio(), sz=new THREE.Vector2(); renderer.getSize(sz);
    renderer.setPixelRatio(1); renderer.setSize(w,h,false); camera.aspect=w/h;
    camera.fov=(camera.aspect>1.45)?44:(camera.aspect>1.1?52:58); camera.updateProjectionMatrix(); renderer.render(scene,camera);
    const url=renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(pr); renderer.setSize(sz.x,sz.y,false); camera.aspect=sz.x/sz.y;
    camera.fov=(camera.aspect>1.45)?44:(camera.aspect>1.1?52:58); camera.updateProjectionMatrix(); renderer.render(scene,camera); return url; }
};
window.dispatchEvent(new Event('roomhall3d-ready'));
