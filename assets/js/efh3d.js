// ===================== KLINKERBOX · 3D-EINFAMILIENHAUS (AUSSEN) =====================
// Echtes WebGL-EFH für die Aussen-Ansicht: zweigeschossig mit Satteldach,
// Rollladen-Kästen, Eingangsportal, Kamin, Dachrinne. Fassade (vorne +
// Giebelseiten) trägt den Wand-Mix, der Vorplatz den Boden-Mix.
// Orbit + Zoom wie beim Bungalow/Innenraum.
import * as THREE from './three.module.min.js';

let renderer=null, scene=null, camera=null, host=null, ro=null;
let facadeMat=null, sideMatL=null, sideMatR=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

const TARGET=new THREE.Vector3(0,3.0,1.5);
let az=0.16, po=1.515, rad=17.5;
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.85, AZ_MAX=0.85, PO_MIN=1.30, PO_MAX=1.565, R_MIN=11, R_MAX=26;

const HW=9.6, HE=6.1, HR=8.5, HD=8.0;           // Breite, Traufe, First, Tiefe

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
// Ziegel-Struktur fürs Dach (dunkle Pfannen mit Reihenlinien)
function roofTex(){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=512;
  const c=cv.getContext('2d'); c.fillStyle='#3d4045'; c.fillRect(0,0,512,512);
  for(let y=0;y<512;y+=26){ c.fillStyle='rgba(0,0,0,0.35)'; c.fillRect(0,y,512,3);
    for(let x=((y/26)%2)*24;x<512;x+=48){ c.fillStyle='rgba(0,0,0,0.16)'; c.fillRect(x,y+3,2,23); }
    c.fillStyle='rgba(255,255,255,0.05)'; c.fillRect(0,y+4,512,2); }
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
// Wand + Giebeldreieck als eine Fläche mit sauberen 0..1-UVs
function gableWallGeo(depth,eave,ridge){
  const s=new THREE.Shape();
  s.moveTo(-depth/2,0); s.lineTo(depth/2,0); s.lineTo(depth/2,eave);
  s.lineTo(0,ridge); s.lineTo(-depth/2,eave); s.closePath();
  const g=new THREE.ShapeGeometry(s);
  const pos=g.attributes.position, uv=g.attributes.uv;
  for(let i=0;i<pos.count;i++){ uv.setXY(i,(pos.getX(i)+depth/2)/depth, pos.getY(i)/ridge); }
  return g;
}
// Fenster mit weissem Rahmen, Glas, Sims und dunklem Rollladen-Kasten
function makeWindow(parent,x,y,w,h,glassM,withBox){
  const frame=new THREE.Mesh(new THREE.BoxGeometry(w,h,0.10),mat(0xf2f1ee,0.6));
  frame.position.set(x,y,0.05); parent.add(frame);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(w-0.14,h-0.14),glassM);
  glass.position.set(x,y,0.105); parent.add(glass);
  const post=new THREE.Mesh(new THREE.BoxGeometry(0.06,h-0.12,0.02),mat(0xf2f1ee,0.6));
  post.position.set(x,y,0.107); parent.add(post);
  const sill=new THREE.Mesh(new THREE.BoxGeometry(w+0.16,0.06,0.16),mat(0xe8e6e2,0.7));
  sill.position.set(x,y-h/2-0.03,0.08); sill.castShadow=true; parent.add(sill);
  if(withBox){
    const box=new THREE.Mesh(new THREE.BoxGeometry(w+0.10,0.32,0.12),mat(0x33373c,0.6));
    box.position.set(x,y+h/2+0.16,0.06); box.castShadow=true; parent.add(box);
  }
}

function buildScene(){
  scene=new THREE.Scene();
  scene.environment=makeEnvironment();
  scene.fog=new THREE.Fog(0xe9ebe9,55,110);

  { const cv=document.createElement('canvas'); cv.width=4; cv.height=512;
    const c=cv.getContext('2d'); const g=c.createLinearGradient(0,0,0,512);
    g.addColorStop(0,'#aeb9c2'); g.addColorStop(0.55,'#d3d9dc'); g.addColorStop(1,'#f2f3f1');
    c.fillStyle=g; c.fillRect(0,0,4,512);
    const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
    const sky=new THREE.Mesh(new THREE.SphereGeometry(85,24,16),
      new THREE.MeshBasicMaterial({map:t,side:THREE.BackSide,fog:false}));
    scene.add(sky); }

  scene.add(new THREE.HemisphereLight(0xe6ebf0,0x8a8d84,0.85));
  scene.add(new THREE.AmbientLight(0xffffff,0.18));
  const sun=new THREE.DirectionalLight(0xfff3e0,1.9);
  sun.position.set(-13,17,13);
  sun.target.position.set(0,0,1);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-14; sun.shadow.camera.right=14;
  sun.shadow.camera.top=15;   sun.shadow.camera.bottom=-9;
  sun.shadow.camera.near=1; sun.shadow.camera.far=55;
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.05;
  scene.add(sun); scene.add(sun.target);

  // ---- Gelände: Rasen + Vorplatz (Boden-Mix) + Kies + Beetstreifen ----
  const lawnT=noiseTex('#7f8f60',26,512,512); lawnT.repeat.set(12,12);
  const lawn=new THREE.Mesh(new THREE.PlaneGeometry(110,110),
    new THREE.MeshStandardMaterial({map:lawnT,roughness:1}));
  lawn.rotation.x=-Math.PI/2; lawn.position.set(0,-0.01,10); lawn.receiveShadow=true; scene.add(lawn);
  floorMat=new THREE.MeshStandardMaterial({color:0xd0cdc8,roughness:0.8,envMapIntensity:0.4});
  const drive=new THREE.Mesh(new THREE.PlaneGeometry(12,7),floorMat);
  drive.rotation.x=-Math.PI/2; drive.position.set(0,0.005,4.7);
  drive.receiveShadow=true; scene.add(drive);
  const gravelT=noiseTex('#b6b1a8',30,256,256); gravelT.repeat.set(10,2);
  const gravel=new THREE.Mesh(new THREE.PlaneGeometry(26,3.2),
    new THREE.MeshStandardMaterial({map:gravelT,roughness:1}));
  gravel.rotation.x=-Math.PI/2; gravel.position.set(0,0.003,9.6); gravel.receiveShadow=true; scene.add(gravel);
  const bedT=noiseTex('#8d857a',26,256,256); bedT.repeat.set(10,1);
  const bed=new THREE.Mesh(new THREE.PlaneGeometry(13,1.3),
    new THREE.MeshStandardMaterial({map:bedT,roughness:1}));
  bed.rotation.x=-Math.PI/2; bed.position.set(0,0.004,0.65); bed.receiveShadow=true; scene.add(bed);

  // ---- Hauskörper: Fassade vorne + Giebelseiten (Produkt-Textur) ----
  facadeMat=new THREE.MeshStandardMaterial({color:0xdad6d1,roughness:0.95});
  const front=new THREE.Mesh(new THREE.PlaneGeometry(HW,HE),facadeMat);
  front.position.set(0,HE/2,0.001); front.receiveShadow=true; scene.add(front);
  sideMatL=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  sideMatR=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  const sideL=new THREE.Mesh(gableWallGeo(HD,HE,HR),sideMatL);
  sideL.rotation.y=-Math.PI/2; sideL.position.set(-HW/2,0,-HD/2); sideL.receiveShadow=true; scene.add(sideL);
  const sideR=new THREE.Mesh(gableWallGeo(HD,HE,HR),sideMatR);
  sideR.rotation.y=Math.PI/2; sideR.position.set(HW/2,0,-HD/2); sideR.receiveShadow=true; scene.add(sideR);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(HW,HE),mat(0xcfccc7,1));
  back.rotation.y=Math.PI; back.position.set(0,HE/2,-HD); scene.add(back);

  // ---- Satteldach (dunkle Pfannen) + First + Untersichten + Rinne ----
  const rT=roofTex(); rT.repeat.set(6,3);
  const roofM=new THREE.MeshStandardMaterial({map:rT,roughness:0.85});
  const run=HD/2+0.45, rise=HR-HE, pitch=Math.atan2(rise,run), slopeLen=Math.hypot(run,rise);
  const frontSlope=new THREE.Mesh(new THREE.BoxGeometry(HW+0.9,0.14,slopeLen),roofM);
  frontSlope.rotation.x=pitch;
  frontSlope.position.set(0,(HE+HR)/2,(0.45-HD/2)/2);
  frontSlope.castShadow=true; scene.add(frontSlope);
  const backSlope=new THREE.Mesh(new THREE.BoxGeometry(HW+0.9,0.14,slopeLen),roofM);
  backSlope.rotation.x=-pitch;
  backSlope.position.set(0,(HE+HR)/2,(-HD-0.45-HD/2)/2+HD/4*0);
  backSlope.position.z=(-HD-0.45+(-HD/2))/2;
  backSlope.castShadow=true; scene.add(backSlope);
  const ridge=new THREE.Mesh(new THREE.BoxGeometry(HW+0.95,0.12,0.22),mat(0x2f3236,0.7));
  ridge.position.set(0,HR+0.05,-HD/2); scene.add(ridge);
  const soffitF=new THREE.Mesh(new THREE.PlaneGeometry(HW+0.8,0.5),
    new THREE.MeshBasicMaterial({color:0xe6e4e0}));
  soffitF.rotation.x=Math.PI/2; soffitF.position.set(0,HE-0.005,0.22); scene.add(soffitF);
  const gutter=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,HW+0.8,12),mat(0xc9c7c2,0.4,0.6));
  gutter.rotation.z=Math.PI/2; gutter.position.set(0,HE-0.02,0.48); scene.add(gutter);
  [[-HW/2+0.10],[HW/2-0.10]].forEach(([x])=>{
    const dp=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,HE-0.1,10),mat(0xc9c7c2,0.4,0.6));
    dp.position.set(x,(HE-0.1)/2,0.10); scene.add(dp);
  });
  // Kamin (weiss, Metallkappe) + kleines Lüftungsrohr
  const chim=new THREE.Mesh(new THREE.BoxGeometry(0.55,1.6,0.55),mat(0xe9e7e3,0.8));
  chim.position.set(-0.9,HR+0.55,-HD/2-0.4); chim.castShadow=true; scene.add(chim);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.5,12),mat(0x9fa3a7,0.4,0.7));
  cap.position.set(-0.9,HR+1.55,-HD/2-0.4); scene.add(cap);
  const vent=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.5,10),mat(0x4a4d52,0.5,0.5));
  vent.position.set(1.6,HR-0.6,-HD/2-1.4); scene.add(vent);

  // ---- Fenster (weisse Rahmen, dunkle Rollladen-Kästen) ----
  const glassM=new THREE.MeshStandardMaterial({color:0x5b6a72,roughness:0.05,metalness:0.9,envMapIntensity:1.6});
  const grp=new THREE.Group(); scene.add(grp);
  makeWindow(grp,-2.9,4.45,1.70,1.30,glassM,true);     // OG links
  makeWindow(grp, 0.0,4.50,0.95,1.15,glassM,true);     // OG mitte klein
  makeWindow(grp, 2.9,4.45,1.40,1.30,glassM,true);     // OG rechts
  makeWindow(grp,-2.9,1.95,1.70,2.30,glassM,true);     // EG links (bodentief)
  makeWindow(grp, 2.9,2.30,1.40,1.50,glassM,true);     // EG rechts

  // ---- Eingangsportal (Rücksprung) mit Holztür + Seitenteil + Stufen ----
  const portal=new THREE.Mesh(new THREE.BoxGeometry(2.0,2.95,0.10),mat(0x8f8b85,0.9));
  portal.position.set(0,1.475,0.03); scene.add(portal);
  const portalIn=new THREE.Mesh(new THREE.BoxGeometry(1.84,2.80,0.06),mat(0x6e6a64,0.95));
  portalIn.position.set(0,1.40,0.075); scene.add(portalIn);
  const door=new THREE.Mesh(new THREE.BoxGeometry(1.02,2.35,0.07),mat(0x6d4a2f,0.55));
  door.position.set(-0.28,1.175,0.115); scene.add(door);
  const doorGlass=new THREE.Mesh(new THREE.PlaneGeometry(0.42,2.35),glassM);
  doorGlass.position.set(0.52,1.175,0.115); scene.add(doorGlass);
  const dHandle=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.30,8),mat(0xb9bcbe,0.3,0.8));
  dHandle.position.set(0.10,1.15,0.16); dHandle.rotation.x=Math.PI/2; scene.add(dHandle);
  const step1=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.14,0.9),mat(0xc9c6c0,0.85));
  step1.position.set(0,0.07,0.55); step1.castShadow=true; step1.receiveShadow=true; scene.add(step1);
  const step2=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.07,1.2),mat(0xc4c1bb,0.85));
  step2.position.set(0,0.035,0.75); step2.receiveShadow=true; scene.add(step2);

  // ---- Bepflanzung vor der Fassade ----
  const beds=new THREE.Group(); scene.add(beds);
  [[-4.2,0.6],[-1.6,0.7],[1.7,0.6],[4.3,0.7],[-5.6,1.0],[5.6,1.0]].forEach(([x,z])=>grassTuft(x,z,1.25,beds));
  bush(-3.4,0.6,0.34,0x6a7558,beds); bush(-1.2,0.55,0.28,0x7a7f6a,beds);
  bush(1.3,0.6,0.30,0x5c6e4a,beds);  bush(3.6,0.55,0.34,0x7a7f6a,beds);
  bush(-5.2,0.8,0.38,0x556848,beds); bush(5.2,0.8,0.36,0x6a7558,beds);

  // ---- Betonmauern + Metallzaun links/rechts ----
  const cwM=mat(0xcfccc6,0.9);
  [[-1,0],[1,0]].forEach(([s])=>{
    const wall=new THREE.Mesh(new THREE.BoxGeometry(3.2,1.5,0.18),cwM);
    wall.position.set(s*(HW/2+3.6),0.75,3.2); wall.rotation.y=s*0.06;
    wall.castShadow=true; wall.receiveShadow=true; scene.add(wall);
    const railM=mat(0x2c2e31,0.5,0.6);
    const rail=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.04,0.04),railM);
    rail.position.set(s*(HW/2+1.35),1.15,2.2); scene.add(rail);
    for(let i=0;i<11;i++){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(0.025,1.15,0.025),railM);
      bar.position.set(s*(HW/2+0.35+i*0.22),0.6,2.2); scene.add(bar);
    }
  });

  // ---- Kulisse: Hügel + Bäume + ferne Häuser ----
  [[-20,-18,9,0x99a68b],[18,-20,11,0x93a087],[0,-26,15,0xa2ae95]].forEach(([x,z,r,c])=>{
    const h=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),new THREE.MeshBasicMaterial({color:c}));
    h.scale.set(1.7,0.30,1); h.position.set(x,0,z); scene.add(h);
  });
  [[-14,-8],[15,-6],[17,-11],[-17,-12]].forEach(([x,z])=>{
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.14,1.8,8),mat(0x5d4a38,1));
    tr.position.set(x,0.9,z); scene.add(tr);
    const fo=new THREE.Mesh(new THREE.IcosahedronGeometry(1.7,1),mat(0x5f7150,1));
    fo.scale.set(1,1.15,1); fo.position.set(x,3.0,z); fo.castShadow=true; scene.add(fo);
  });
  [[-13,-13,1],[13.5,-14,-1]].forEach(([x,z,s])=>{
    const hs=new THREE.Mesh(new THREE.BoxGeometry(2.6,1.7,2.0),mat(0xd8d5cf,0.9));
    hs.position.set(x,0.85,z); hs.rotation.y=s*0.4; scene.add(hs);
    const rf=new THREE.Mesh(new THREE.ConeGeometry(2.0,1.0,4),mat(0x4a4d51,0.8));
    rf.position.set(x,2.2,z); rf.rotation.y=Math.PI/4+s*0.4; scene.add(rf);
  });

  camera=new THREE.PerspectiveCamera(46,16/10,0.1,180);
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
    renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.0;
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
      radT=Math.min(R_MAX,Math.max(R_MIN,radT+e.deltaY*0.007)); },{passive:false});
  }catch(e){ failed=true; console.warn('Efh3D deaktiviert:',e); return false; }
  return true;
}
function sizeToHost(){
  if(!renderer||!host) return;
  const w=Math.max(220,host.clientWidth||300), h=Math.max(220,host.clientHeight||240);
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.fov=(camera.aspect>1.45)?42:(camera.aspect>1.1?48:56);
  camera.updateProjectionMatrix();
}
function loop(){
  rafId=requestAnimationFrame(loop);
  if(!renderer||!host) return;
  applyCam(false);
  renderer.render(scene,camera);
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
window.Efh3D={
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
  setTextures(facadeCv,sideCv,floorCv){
    if(!renderer) return;
    applyTex(facadeMat,facadeCv,0xdad6d1);
    applyTex(sideMatL,sideCv||facadeCv,0xd7d3ce);
    applyTex(sideMatR,sideCv||facadeCv,0xd7d3ce);
    applyTex(floorMat,floorCv,0xd0cdc8,0.8);
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
window.dispatchEvent(new Event('efh3d-ready'));
