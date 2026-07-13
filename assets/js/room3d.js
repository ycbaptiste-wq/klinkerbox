// ===================== KLINKERBOX · 3D-INNENRAUM =====================
// Echter WebGL-Raum für den Innen-Konfigurator (statt Foto+Maske):
// Wand und Boden sind echte Flächen — der Klinker-Mix wird als Textur
// aufgezogen, Perspektive/Schatten/Beine stimmen physikalisch.
// Aufbau dem Referenzfoto nachempfunden: Fensterfront links, Klinker-
// wand mit zwei Schattenfugen, Sofa mit Kissen + Decke, Konsole + Vase.
import * as THREE from './three.module.min.js';

let renderer=null, scene=null, camera=null, host=null, ro=null;
let wallMat=null, floorMat=null, maxAniso=8;
let yaw=0, pitch=0, yawT=0, pitchT=0, rafId=0, failed=false;

const CAM_POS=new THREE.Vector3(0.35,1.42,5.90);
const CAM_AIM=new THREE.Vector3(0.32,1.24,0);

// ---------- Geometrie-Helfer ----------
// weich gerundeter Quader (Kissen, Polster, Lehnen) via Extrude+Bevel
function rbox(w,d,h,rPlan,rBevel){
  const hw=w/2-rPlan, hd=d/2-rPlan;
  const s=new THREE.Shape();
  s.moveTo(-hw,-hd-rPlan);
  s.lineTo(hw,-hd-rPlan); s.absarc(hw,-hd,rPlan,-Math.PI/2,0,false);
  s.lineTo(hw+rPlan,hd);  s.absarc(hw,hd,rPlan,0,Math.PI/2,false);
  s.lineTo(-hw,hd+rPlan); s.absarc(-hw,hd,rPlan,Math.PI/2,Math.PI,false);
  s.lineTo(-hw-rPlan,-hd);s.absarc(-hw,-hd,rPlan,Math.PI,Math.PI*1.5,false);
  const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(0.01,h-2*rBevel),bevelEnabled:true,
    bevelThickness:rBevel,bevelSize:rBevel,bevelSegments:4,curveSegments:6});
  g.rotateX(-Math.PI/2);                       // Extrusion → Y-Achse
  g.translate(0,rBevel,0);                     // Unterkante auf y=0 (position.y = Unterkante)
  g.computeVertexNormals();
  return g;
}
function mat(c,rough,metal){ return new THREE.MeshStandardMaterial({color:c,roughness:rough!=null?rough:0.9,metalness:metal||0}); }

// ---------- Szene ----------
function buildScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf2f1ef);

  // Licht: Tageslicht von der Fensterfront links + weiche Grundhelligkeit
  scene.add(new THREE.HemisphereLight(0xffffff,0x8f8a83,0.65));
  scene.add(new THREE.AmbientLight(0xffffff,0.30));
  const sun=new THREE.DirectionalLight(0xfff3e2,2.6);
  sun.position.set(-6.5,3.6,3.4);
  sun.target.position.set(1.6,0.4,0.6);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-6; sun.shadow.camera.right=6;
  sun.shadow.camera.top=5;   sun.shadow.camera.bottom=-2;
  sun.shadow.camera.near=0.5; sun.shadow.camera.far=18;
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.025;
  scene.add(sun); scene.add(sun.target);
  const fill=new THREE.DirectionalLight(0xeef0f4,0.5);   // kühle Aufhellung von rechts
  fill.position.set(5,2.5,4); scene.add(fill);

  const W=5.4, H=3.0, D=6.2;                    // Raum: Breite, Höhe, Tiefe

  // ---- Klinkerwand (hinten) ----
  wallMat=new THREE.MeshStandardMaterial({color:0xd9d5d0,roughness:0.95});
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(W,H),wallMat);
  wall.position.set(0,H/2,0); wall.receiveShadow=true; scene.add(wall);
  // zwei Schattenfugen (Vertiefungen) wie im Foto — dezent
  [[-2.45],[1.55]].forEach(([x])=>{
    const g1=new THREE.Mesh(new THREE.PlaneGeometry(0.016,H),
      new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.30}));
    g1.position.set(x,H/2,0.004); scene.add(g1);
  });

  // ---- Boden ----
  floorMat=new THREE.MeshStandardMaterial({color:0xd3d0cb,roughness:0.9});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(W,D),floorMat);
  floor.rotation.x=-Math.PI/2; floor.position.set(0,0,D/2);
  floor.receiveShadow=true; scene.add(floor);

  // ---- Decke + Spots (flat shaded — Deckenunterseite bekommt kein Licht) ----
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(W,D),
    new THREE.MeshBasicMaterial({color:0xf0efec}));
  ceil.rotation.x=Math.PI/2; ceil.position.set(0,H,D/2); scene.add(ceil);
  [[-0.9,1.3],[-0.55,1.3],[1.35,1.3],[1.7,1.3]].forEach(([x,z])=>{
    const d=new THREE.Mesh(new THREE.CircleGeometry(0.045,20),mat(0x54524e,0.6));
    d.rotation.x=Math.PI/2; d.position.set(x,H-0.004,z); scene.add(d);
  });

  // ---- rechte Wand ----
  const rw=new THREE.Mesh(new THREE.PlaneGeometry(D,H),mat(0xd4d0ca,0.95));
  rw.rotation.y=-Math.PI/2; rw.position.set(W/2,H/2,D/2); rw.receiveShadow=true; scene.add(rw);

  // ---- Fensterfront links (Rahmen + Glas + heller Aussenraum) ----
  const frameM=mat(0x5b6066,0.5,0.35);
  const fx=-W/2;
  [[0.08],[2.05],[4.05],[6.15]].forEach(([z])=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.09,H,0.07),frameM);
    m.position.set(fx,H/2,z); m.castShadow=false; scene.add(m);
  });
  const railT=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.09,D),frameM);
  railT.position.set(fx,H-0.045,D/2); scene.add(railT);
  const railB=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.07,D),frameM);
  railB.position.set(fx,0.035,D/2); scene.add(railB);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(D,H),
    new THREE.MeshPhysicalMaterial({color:0xdfe8ee,transparent:true,opacity:0.14,roughness:0.06,metalness:0}));
  glass.rotation.y=Math.PI/2; glass.position.set(fx,H/2,D/2); scene.add(glass);
  const outside=new THREE.Mesh(new THREE.PlaneGeometry(D+6,H+3),
    new THREE.MeshBasicMaterial({color:0xf5f6f5}));
  outside.rotation.y=Math.PI/2; outside.position.set(fx-1.6,H/2+0.4,D/2); scene.add(outside);
  const hedge=new THREE.Mesh(new THREE.PlaneGeometry(D+4,0.9),
    new THREE.MeshBasicMaterial({color:0xe7e6e2}));
  hedge.rotation.y=Math.PI/2; hedge.position.set(fx-1.5,0.45,D/2); scene.add(hedge);

  // ---- Sofa (weiss, minimalistisch — wie im Foto) ----
  const sofa=new THREE.Group();
  const fabric=mat(0xeceae5,0.97), fabricLite=mat(0xf1efeb,0.97);
  const SW=2.62, SD=1.04;                        // Länge, Tiefe
  const base=new THREE.Mesh(rbox(SW,SD,0.24,0.06,0.03),fabric);
  base.position.y=0.14; base.castShadow=true; base.receiveShadow=true; sofa.add(base);
  // Beine (dünne Zylinder, leicht konisch)
  [[-SW/2+0.16,-SD/2+0.10],[SW/2-0.16,-SD/2+0.10],[-SW/2+0.16,SD/2-0.10],[SW/2-0.16,SD/2-0.10]].forEach(([x,z])=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.021,0.14,14),mat(0xdcd8d2,0.6));
    leg.position.set(x,0.07,z); leg.castShadow=true; sofa.add(leg);
  });
  // Sitzkissen ×3 (auf der Basis, leicht eingesunken)
  for(let i=-1;i<=1;i++){
    const c=new THREE.Mesh(rbox(0.84,0.94,0.20,0.09,0.05),fabricLite);
    c.position.set(i*0.855,0.355,0.02); c.castShadow=true; c.receiveShadow=true; sofa.add(c);
  }
  // Rückenkissen ×3 (volle Rückenlehne; Pivot liegt in der Plattenmitte →
  // bei d=0.54 und ~83° Neigung: Unterkante ~0.50, Oberkante ~1.03)
  for(let i=-1;i<=1;i++){
    const b=new THREE.Mesh(rbox(0.85,0.54,0.24,0.11,0.07),fabricLite);
    b.rotation.x=-1.45;
    b.position.set(i*0.855,0.76,-SD/2+0.20);
    b.castShadow=true; b.receiveShadow=true; sofa.add(b);
  }
  // Armlehnen ×2
  [-1,1].forEach(s=>{
    const a=new THREE.Mesh(rbox(0.22,SD,0.44,0.05,0.045),fabric);
    a.position.set(s*(SW/2+0.02),0.24,0); a.castShadow=true; a.receiveShadow=true; sofa.add(a);
  });
  // Zierkissen links (angelehnt, leicht verdreht; Pivot mittig)
  const pil=new THREE.Mesh(rbox(0.50,0.50,0.15,0.11,0.05),fabricLite);
  pil.rotation.set(-1.22,0,0.16);
  pil.position.set(-0.88,0.70,-0.10); pil.castShadow=true; sofa.add(pil);
  // Decke über rechter Armlehne (grau): aufliegend + außen hängend, weich gerundet
  const wool=mat(0xa9adb1,1);
  const thr1=new THREE.Mesh(rbox(0.30,0.88,0.07,0.03,0.03),wool);
  thr1.position.set(1.32,0.675,0); thr1.rotation.z=-0.04; thr1.castShadow=true; sofa.add(thr1);
  const thr2=new THREE.Mesh(rbox(0.06,0.74,0.42,0.025,0.025),wool);
  thr2.position.set(1.455,0.27,0.03); thr2.rotation.z=0.03; thr2.castShadow=true; sofa.add(thr2);
  sofa.position.set(0.08,0,0.92);
  scene.add(sofa);
  // weicher Bodenschatten unter dem Sofa (zusätzlich zum Shadow-Mapping)
  const shCv=document.createElement('canvas'); shCv.width=256; shCv.height=128;
  const sc=shCv.getContext('2d');
  const grd=sc.createRadialGradient(128,64,10,128,64,120);
  grd.addColorStop(0,'rgba(0,0,0,0.34)'); grd.addColorStop(0.7,'rgba(0,0,0,0.13)'); grd.addColorStop(1,'rgba(0,0,0,0)');
  sc.fillStyle=grd; sc.fillRect(0,0,256,128);
  const shTex=new THREE.CanvasTexture(shCv);
  const blob=new THREE.Mesh(new THREE.PlaneGeometry(SW+0.5,SD+0.45),
    new THREE.MeshBasicMaterial({map:shTex,transparent:true,depthWrite:false}));
  blob.rotation.x=-Math.PI/2; blob.position.set(0.08,0.004,0.92); scene.add(blob);

  // ---- Konsole + Vase rechts ----
  const wood=mat(0x63452f,0.65);
  const conTop=new THREE.Mesh(new THREE.BoxGeometry(0.85,0.055,0.34),wood);
  conTop.position.set(2.24,0.78,0.24); conTop.castShadow=true; scene.add(conTop);
  const conLeg=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.78,0.34),wood);
  conLeg.position.set(1.84,0.39,0.24); conLeg.castShadow=true; scene.add(conLeg);
  const pts=[];                                   // Vase (Lathe-Profil)
  [[0.001,0],[0.07,0.005],[0.095,0.05],[0.115,0.12],[0.10,0.19],[0.055,0.23],[0.05,0.27],[0.065,0.30],[0.058,0.315]]
    .forEach(([r,y])=>pts.push(new THREE.Vector2(r,y)));
  const vase=new THREE.Mesh(new THREE.LatheGeometry(pts,28),mat(0xcac0b4,0.85));
  vase.position.set(2.30,0.808,0.24); scene.add(vase);

  // Kamera
  camera=new THREE.PerspectiveCamera(42,16/10,0.1,40);
  camera.position.copy(CAM_POS); camera.lookAt(CAM_AIM);
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
    renderer.toneMappingExposure=1.06;
    maxAniso=renderer.capabilities.getMaxAnisotropy()||8;
    buildScene();
    renderer.domElement.style.cssText='width:100%;height:100%;display:block;border-radius:inherit';
    renderer.domElement.addEventListener('pointermove',e=>{
      const r=renderer.domElement.getBoundingClientRect();
      yawT=((e.clientX-r.left)/r.width-0.5)*0.10;
      pitchT=((e.clientY-r.top)/r.height-0.5)*0.045;
    });
    renderer.domElement.addEventListener('pointerleave',()=>{ yawT=0; pitchT=0; });
  }catch(e){ failed=true; console.warn('Room3D deaktiviert:',e); return false; }
  return true;
}
function sizeToHost(){
  if(!renderer||!host) return;
  const w=Math.max(220,host.clientWidth||300), h=Math.max(220,host.clientHeight||240);
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  // Sichtfeld ans Format anpassen: breite Ansicht flacher, hohe Ansicht weiter
  camera.fov=(camera.aspect>1.45)?42:(camera.aspect>1.1?50:57);
  camera.updateProjectionMatrix();
}
function loop(){
  rafId=requestAnimationFrame(loop);
  if(!renderer||!host||!host.isConnected){ return; }
  yaw+= (yawT-yaw)*0.07; pitch+=(pitchT-pitch)*0.07;
  const p=CAM_POS.clone();
  p.x+= yaw*2.2; p.y-= pitch*1.4;
  camera.position.copy(p); camera.lookAt(CAM_AIM);
  renderer.render(scene,camera);
}
function texFromCanvas(cv){
  if(!cv) return null;
  const t=new THREE.CanvasTexture(cv);
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=maxAniso;
  return t;
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
    if(!rafId) loop();
    return true;
  },
  // Wand-/Bodentextur als Canvas (null → neutrale Fläche)
  setTextures(wallCv,floorCv){
    if(!renderer) return;
    if(wallMat.map) wallMat.map.dispose();
    wallMat.map=texFromCanvas(wallCv);
    wallMat.color.set(wallCv?0xffffff:0xd9d5d0);
    wallMat.needsUpdate=true;
    if(floorMat.map) floorMat.map.dispose();
    floorMat.map=texFromCanvas(floorCv);
    floorMat.color.set(floorCv?0xffffff:0xd3d0cb);
    floorMat.needsUpdate=true;
  },
  // hochaufgelöstes Standbild (für Export PNG)
  snapshot(w,h){
    if(!renderer) return null;
    const pr=renderer.getPixelRatio(), sz=new THREE.Vector2(); renderer.getSize(sz);
    renderer.setPixelRatio(1); renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.fov=(camera.aspect>1.45)?42:(camera.aspect>1.1?50:57);
    camera.updateProjectionMatrix();
    const y0=yaw,p0=pitch; yaw=0; pitch=0;
    camera.position.copy(CAM_POS); camera.lookAt(CAM_AIM);
    renderer.render(scene,camera);
    const url=renderer.domElement.toDataURL('image/png');
    yaw=y0; pitch=p0;
    renderer.setPixelRatio(pr); renderer.setSize(sz.x,sz.y,false);
    camera.aspect=sz.x/sz.y; camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    return url;
  }
};
window.dispatchEvent(new Event('room3d-ready'));
