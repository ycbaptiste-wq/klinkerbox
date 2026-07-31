// ===================== KLINKERBOX · 3D-NAHANSICHT =====================
// Die Nahansicht war bisher eine flache 2D-Leinwand: das gemalte Fugenbild ohne
// Relief, ohne Licht, ohne Tiefe. Gerade dort schaut der Kunde aber am genauesten
// hin. Jetzt ein echtes Wandstueck in 3D mit derselben PBR-Pipeline wie die
// Gebaeude — Normal, AO, Roughness, Hoehe und Parallax-Occlusion — unter
// streifendem Licht, das das Fugenrelief ueberhaupt erst sichtbar macht.
// Drehbar wie die Gebaeudeansichten, nur mit engeren Grenzen.
import * as THREE from './three.module.min.js';
import { buildEnv, applySurface, disposeScene, addVignette, LOWQ } from './scene3d-lib.js?v=53';

const MOBILE=LOWQ;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let panel=null, panelMat=null, maxAniso=8;
let rafId=0, failed=false;

// Wandstueck 3.20 x 2.24 m. Bewusst groesser als der sichtbare Ausschnitt: bei
// der schraegen Standardansicht blitzte sonst am linken Rand der Hintergrund
// durch. Seitenverhaeltnis 1.4286 = das der Textur (2000 x 1400).
const PW=3.20, PH=2.24;
// Fester Blickwinkel — die Nahansicht muss nicht drehbar sein, sie soll das
// PROFIL zeigen. Leicht schräg und leicht von oben: nur so wirft die Fuge einen
// Schatten und der Stein bekommt eine sichtbare Dicke.
// Standardabstand so nah, dass die Wand das Bild FÜLLT — kein Musterbrett vor
// Hintergrund, sondern der Blick, den man an einer echten Wand hätte.
// Herauszoomen bis zum ganzen Stück bleibt möglich.
const TARGET=new THREE.Vector3(0,0,0);
let az=0.36, po=1.515, rad=2.15;
let radT=rad;                       // nur Zoom bleibt, kein Drehen
const R_MIN=1.35, R_MAX=4.20;
let needsRender=true;

// Fugentiefe in UV-Einheiten: 16 mm auf die Flaeche, die die Karte abdeckt
const POM=0.016/Math.sqrt(PW*PH);

function buildScene(){
  scene=new THREE.Scene();
  scene.environment=buildEnv(renderer);

  // Neutraler Hintergrund statt Himmel: hier geht es um das Material, nicht um
  // ein Gebaeude in einer Landschaft.
  { const cv=document.createElement('canvas'); cv.width=8; cv.height=256;
    const c=cv.getContext('2d'); const g=c.createLinearGradient(0,0,0,256);
    g.addColorStop(0,'#e8e6e1'); g.addColorStop(0.55,'#d5d2cc'); g.addColorStop(1,'#c2bfb8');
    c.fillStyle=g; c.fillRect(0,0,8,256);
    const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
    const bg=new THREE.Mesh(new THREE.SphereGeometry(24,24,16),
      new THREE.MeshBasicMaterial({map:t,side:THREE.BackSide}));
    scene.add(bg); }

  // Streifendes Licht von links oben: ein Fugenrelief zeigt sich nur im flachen
  // Winkel. Frontal beleuchtet sieht auch eine echte Klinkerwand flach aus.
  scene.add(new THREE.HemisphereLight(0xdfe6ef,0x9a958c,1.10));
  const key=new THREE.DirectionalLight(0xfff4e6,2.9);
  key.position.set(-2.6,2.2,1.5);
  key.target.position.set(0.4,-0.2,0);
  key.castShadow=true;
  key.shadow.mapSize.set(MOBILE?1024:2048,MOBILE?1024:2048);
  key.shadow.camera.left=-2.2; key.shadow.camera.right=2.2;
  key.shadow.camera.top=1.8;   key.shadow.camera.bottom=-1.8;
  key.shadow.camera.near=0.4;  key.shadow.camera.far=9;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias=-0.0002; key.shadow.normalBias=0.004;
  key.shadow.radius=MOBILE?1:2;
  scene.add(key); scene.add(key.target);
  // Aufheller von rechts, ohne Schatten — sonst kippt die rechte Haelfte ins Dunkle
  const fill=new THREE.DirectionalLight(0xe9eef6,0.55);
  fill.position.set(3.0,0.6,2.4); scene.add(fill);

  // Platte und Laibung stehen in EINER Gruppe — sonst bleibt der Rahmen senkrecht
  // stehen, wenn das Stueck fuer ein Bodenprodukt flach gelegt wird.
  panel=new THREE.Group(); scene.add(panel);
  panelMat=new THREE.MeshStandardMaterial({color:0xdad6d1,roughness:0.95});
  const face=new THREE.Mesh(new THREE.PlaneGeometry(PW,PH),panelMat);
  face.receiveShadow=true; face.castShadow=true; panel.add(face);
  // Schmale Laibung ringsum: das Stueck bekommt eine Kante und damit eine Dicke,
  // sonst schwebt eine Textur im Raum.
  { const em=new THREE.MeshStandardMaterial({color:0xb4b0a9,roughness:0.9});
    const D=0.14;
    [[0,PH/2+0.015,PW+0.03,0.03],[0,-PH/2-0.015,PW+0.03,0.03],
     [-PW/2-0.015,0,0.03,PH],[PW/2+0.015,0,0.03,PH]].forEach(([x,y,w,h])=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,D),em);
      m.position.set(x,y,-D/2); m.castShadow=true; m.receiveShadow=true; panel.add(m); }); }

  camera=new THREE.PerspectiveCamera(38,16/10,0.05,60);
  applyCam(true);
}
function applyCam(hard){
  const k=hard?1:0.14;
  const before=rad;
  rad+=(radT-rad)*k;
  if(Math.abs(rad-before)>0.0005) needsRender=true;
  camera.position.set(
    TARGET.x+rad*Math.sin(po)*Math.sin(az),
    TARGET.y+rad*Math.cos(po),
    TARGET.z+rad*Math.sin(po)*Math.cos(az));
  camera.lookAt(TARGET);
}
function ensureRenderer(){
  if(renderer||failed) return !failed;
  try{
    renderer=new THREE.WebGLRenderer({antialias:!MOBILE});
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=MOBILE?THREE.BasicShadowMap:THREE.PCFShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.0;
    maxAniso=renderer.capabilities.getMaxAnisotropy()||8;
    buildScene();
    const el=renderer.domElement;
    el.addEventListener('webglcontextlost',e=>e.preventDefault());
    el.style.cssText='width:100%;height:100%;display:block;border-radius:inherit;touch-action:pan-y';
    // Kein Drehen. Nur Zoom, damit man den Stein naeher heranholen kann.
    el.addEventListener('wheel',e=>{ e.preventDefault();
      radT=Math.min(R_MAX,Math.max(R_MIN,radT+e.deltaY*0.0016)); needsRender=true; },{passive:false});
  }catch(e){ failed=true; console.warn('Wall3D deaktiviert:',e); return false; }
  return true;
}
function sizeToHost(){
  if(!renderer||!host) return;
  const w=Math.max(220,host.clientWidth||300), h=Math.max(220,host.clientHeight||240);
  renderer.setPixelRatio(Math.min(MOBILE?1.25:2,window.devicePixelRatio||1));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.fov=(camera.aspect>1.45)?34:(camera.aspect>1.1?38:46);
  camera.updateProjectionMatrix();
  needsRender=true;
}
let wdId=0, lastRaf=0;
// Ohne Drehen steht das Bild still — dann muss auch nicht 60-mal pro Sekunde
// gerendert werden. Nur bei Zoom, Groessenaenderung oder Produktwechsel.
function step(){
  if(!renderer||!host) return;
  const moving=Math.abs(radT-rad)>0.0005;
  if(!moving && !needsRender) return;
  applyCam(false); needsRender=false;
  renderer.render(scene,camera);
}
function loop(){ rafId=requestAnimationFrame(loop); lastRaf=performance.now(); step(); }
function startLoops(){
  if(!rafId) loop();
  if(!wdId) wdId=setInterval(()=>{ if(!document.hidden && performance.now()-lastRaf>200) step(); },120);
}
window.Wall3D={
  available(){ return !failed; },
  dbg(){ return {scene,renderer,camera}; },
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
  stop(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } if(wdId){ clearInterval(wdId); wdId=0; } },
  dispose(){
    this.stop();
    if(ro){ ro.disconnect(); ro=null; }
    disposeScene(scene,renderer);
    renderer=null; scene=null; camera=null; host=null; failed=false;
    panel=null; panelMat=null;
  },
  // floor=true legt das Stueck flach und schaut von schraeg oben darauf —
  // ein Bodenbelag wird nicht an der Wand beurteilt.
  setTextures(cv,floor){
    if(!renderer) return;
    applySurface(panelMat,cv,{fallback:0xdad6d1,rough:1.0,normalScale:0.95,
      aniso:maxAniso,env:0.40,pom:POM});
    if(panel) panel.rotation.x=floor?-Math.PI/2:0;
    po=floor?0.98:1.515; az=floor?0.12:0.36; rad=radT=floor?2.55:2.15;
    applyCam(true); needsRender=true;
  },
  snapshot(w,h){
    if(!renderer) return null;
    const pr=renderer.getPixelRatio(), sz=new THREE.Vector2(); renderer.getSize(sz);
    renderer.setPixelRatio(1); renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.fov=(camera.aspect>1.45)?34:(camera.aspect>1.1?38:46);
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    const url=renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(pr); renderer.setSize(sz.x,sz.y,false);
    camera.aspect=sz.x/sz.y;
    camera.fov=(camera.aspect>1.45)?34:(camera.aspect>1.1?38:46);
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    return url;
  }
};
window.dispatchEvent(new Event('wall3d-ready'));
