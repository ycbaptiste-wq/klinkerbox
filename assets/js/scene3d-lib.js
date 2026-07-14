// ===================== KLINKERBOX · 3D-MATERIAL-BIBLIOTHEK =====================
// Geteilte Bausteine für fotorealistische Aussen-Szenen: eine bewölkte
// Himmels-Umgebung (echte Reflexionen in Glas/Metall), physikalisches
// Fensterglas (reflektiert + leicht durchsichtig) und ein Innenraum-Material
// (Vorhänge/Deckenlicht), sodass man leicht ins Gebäude hineinsieht.
import * as THREE from './three.module.min.js';

// bewölkter Himmel als Textur — Basis für Environment und (optional) Sky-Dome
export function cloudSkyTexture(w, h){
  const cv=document.createElement('canvas'); cv.width=w||512; cv.height=h||256;
  const c=cv.getContext('2d');
  const g=c.createLinearGradient(0,0,0,cv.height);
  g.addColorStop(0,'#8ea0b0'); g.addColorStop(0.5,'#bcc7cf'); g.addColorStop(1,'#eef1f0');
  c.fillStyle=g; c.fillRect(0,0,cv.width,cv.height);
  for(let i=0;i<52;i++){
    const x=Math.random()*cv.width, y=Math.random()*cv.height*0.62, r=(18+Math.random()*70)*(cv.width/512);
    const gg=c.createRadialGradient(x,y,0,x,y,r);
    gg.addColorStop(0,'rgba(255,255,255,'+(0.10+Math.random()*0.16)+')');
    gg.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=gg; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill();
  }
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

// PMREM-Environment aus bewölktem Himmel + Boden → realistische Reflexionen
export function buildEnv(renderer){
  const es=new THREE.Scene();
  const sky=new THREE.Mesh(new THREE.SphereGeometry(60,32,20),
    new THREE.MeshBasicMaterial({map:cloudSkyTexture(1024,512),side:THREE.BackSide}));
  es.add(sky);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),
    new THREE.MeshBasicMaterial({color:0x8f9289}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-4; es.add(ground);
  const pm=new THREE.PMREMGenerator(renderer);
  const env=pm.fromScene(es,0.03).texture;   // wenig Blur → sichtbare Wolken im Glas
  pm.dispose();
  return env;
}

// Fensterglas: physikalisch, spiegelt die Umgebung, lässt den Innenraum
// leicht durchscheinen (opacity). Fresnel/Clearcoat → Kanten spiegeln stärker.
export function glassMaterial(opts){
  opts=opts||{};
  return new THREE.MeshPhysicalMaterial({
    color: opts.color!=null?opts.color:0x27303a,
    metalness:0,
    roughness: opts.roughness!=null?opts.roughness:0.05,
    transparent:true,
    opacity: opts.opacity!=null?opts.opacity:0.72,
    envMapIntensity: opts.env!=null?opts.env:2.6,
    clearcoat:1, clearcoatRoughness:0.05,
    ior:1.5, reflectivity:0.9,
    side:THREE.FrontSide, depthWrite:false
  });
}

// Innenraum-Material (unbeleuchtet, wirkt wie eigener Innenraum hinter dem Glas)
// kind: 'home' (Vorhänge + warmes Licht) · 'office' (Deckenleuchten) · 'dark'
const _intCache={};
export function interiorMaterial(kind){
  kind=kind||'home';
  if(_intCache[kind]) return _intCache[kind];
  const cv=document.createElement('canvas'); cv.width=128; cv.height=170;
  const c=cv.getContext('2d');
  const g=c.createLinearGradient(0,0,0,170);
  if(kind==='office'){ g.addColorStop(0,'#454b54'); g.addColorStop(1,'#5c636c'); }
  else if(kind==='dark'){ g.addColorStop(0,'#191d22'); g.addColorStop(1,'#2a3038'); }
  else { g.addColorStop(0,'#1c2027'); g.addColorStop(0.62,'#282d35'); g.addColorStop(1,'#363c45'); }
  c.fillStyle=g; c.fillRect(0,0,128,170);
  if(kind==='home'){
    // seitliche Vorhänge
    c.fillStyle='rgba(226,220,207,0.52)';
    for(let x=2;x<40;x+=6) c.fillRect(x,0,3,170);
    for(let x=88;x<126;x+=6) c.fillRect(x,0,3,170);
    // warmer Lichtschein (Lampe im Raum)
    const gg=c.createRadialGradient(64,70,2,64,70,66);
    gg.addColorStop(0,'rgba(255,222,166,0.24)'); gg.addColorStop(1,'rgba(255,222,166,0)');
    c.fillStyle=gg; c.fillRect(0,0,128,170);
  } else if(kind==='office'){
    c.fillStyle='rgba(255,247,227,0.5)';
    for(let y=16;y<86;y+=24) c.fillRect(22,y,84,4);   // Deckenleuchten-Reihen
    c.fillStyle='rgba(0,0,0,0.20)'; c.fillRect(0,126,128,44); // dunklere Bodenzone
  }
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.MeshBasicMaterial({map:t});
  _intCache[kind]=m;
  return m;
}
