// ===================== KLINKERBOX · 3D-MATERIAL-BIBLIOTHEK =====================
// Geteilte Bausteine für fotorealistische Szenen: teilsonniger Himmel (Dome +
// Environment mit HDR-Sonne → echte Glanzlichter in Glas/Metall), physikalisches
// Fensterglas, Innenraum-Material, Normal-Maps aus den Klinker-Texturen
// (Fugen liegen tief, Steine tragen ihr Foto-Relief) und eine dezente Vignette.
import * as THREE from './three.module.min.js';

// ---------- Himmel: teilsonnig-hell, weiche Quellwolken, warmer Horizont ----------
let _skyCv=null;
function skyCanvas(){
  if(_skyCv) return _skyCv;
  const cv=document.createElement('canvas'); cv.width=1024; cv.height=512;
  const c=cv.getContext('2d');
  const g=c.createLinearGradient(0,0,0,512);
  g.addColorStop(0,'#7290ad'); g.addColorStop(0.34,'#a4bacb');
  g.addColorStop(0.60,'#d3dcdf'); g.addColorStop(0.84,'#efeee7'); g.addColorStop(1,'#f6f2e9');
  c.fillStyle=g; c.fillRect(0,0,1024,512);
  // warmes Sonnen-Glühen (breit und weich, kein hartes Zentrum)
  const sg=c.createRadialGradient(300,120,10,300,120,340);
  sg.addColorStop(0,'rgba(255,244,220,0.55)'); sg.addColorStop(0.45,'rgba(255,240,214,0.20)');
  sg.addColorStop(1,'rgba(255,240,214,0)');
  c.fillStyle=sg; c.fillRect(0,0,1024,512);
  // Quellwolken: mehrere überlappende weiche Ballen, oben heller, Basis leicht grau
  const puff=(x,y,r,a)=>{ const gg=c.createRadialGradient(x,y-r*0.15,r*0.1,x,y,r);
    gg.addColorStop(0,'rgba(255,255,255,'+a+')'); gg.addColorStop(0.7,'rgba(252,253,254,'+(a*0.45)+')');
    gg.addColorStop(1,'rgba(252,253,254,0)');
    c.fillStyle=gg; c.beginPath(); c.ellipse(x,y,r*1.5,r*0.62,0,0,Math.PI*2); c.fill(); };
  const base=(x,y,r,a)=>{ const gg=c.createRadialGradient(x,y,r*0.1,x,y,r);
    gg.addColorStop(0,'rgba(155,168,178,'+a+')'); gg.addColorStop(1,'rgba(155,168,178,0)');
    c.fillStyle=gg; c.beginPath(); c.ellipse(x,y,r*1.6,r*0.34,0,0,Math.PI*2); c.fill(); };
  const clouds=[[140,150,58],[240,120,74],[360,170,54],[520,110,66],[660,160,72],
                [820,120,60],[930,180,50],[80,230,44],[440,235,42],[760,240,52],[590,205,38]];
  clouds.forEach(([x,y,r],i)=>{
    const a=0.30+((i*37)%23)/100*0.5;
    base(x,y+r*0.34,r,0.14);
    puff(x-r*0.55,y+r*0.12,r*0.62,a*0.8); puff(x+r*0.5,y+r*0.10,r*0.68,a*0.8);
    puff(x,y,r,a); puff(x-r*0.2,y-r*0.28,r*0.5,a*0.9);
  });
  // Dunst-Schleier über dem Horizont
  const hz=c.createLinearGradient(0,300,0,512);
  hz.addColorStop(0,'rgba(240,238,230,0)'); hz.addColorStop(1,'rgba(244,240,231,0.75)');
  c.fillStyle=hz; c.fillRect(0,300,1024,212);
  _skyCv=cv; return cv;
}
// Textur für die sichtbare Himmelskuppel der Aussen-Szenen
export function skyDomeTexture(){
  const t=new THREE.CanvasTexture(skyCanvas()); t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}
// Kompatibilität: alter Name (bewölkter Himmel) → gleicher, schönerer Himmel
export function cloudSkyTexture(){ return skyDomeTexture(); }

// PMREM-Environment: Himmel + Boden + HDR-Sonne → realistische Reflexe und
// ein echtes Glanzlicht auf Glas/Metall (Farbwerte > 1 bleiben im PMREM erhalten)
export function buildEnv(renderer){
  const es=new THREE.Scene();
  // Himmel gedimmt (0.62): das IBL-Umgebungslicht darf die Sonnenschatten
  // nicht überstrahlen — Glanz auf Glas liefert die HDR-Sonne darunter
  const sky=new THREE.Mesh(new THREE.SphereGeometry(60,32,20),
    new THREE.MeshBasicMaterial({map:skyDomeTexture(),color:0x6f6f6f,side:THREE.BackSide}));
  es.add(sky);
  const sun=new THREE.Mesh(new THREE.SphereGeometry(3.2,16,12),
    new THREE.MeshBasicMaterial({color:new THREE.Color(11,9.5,7.5)}));
  sun.position.set(24,30,24);                       // gleiche Richtung wie das Sonnenlicht der Szenen
  es.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),
    new THREE.MeshBasicMaterial({color:0x8f9289}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-4; es.add(ground);
  const pm=new THREE.PMREMGenerator(renderer);
  const env=pm.fromScene(es,0.03).texture;           // wenig Blur → sichtbare Wolken im Glas
  pm.dispose();
  return env;
}

// Fensterglas: physikalisch, spiegelt die Umgebung, lässt den Innenraum
// leicht durchscheinen (opacity). Fresnel/Clearcoat → Kanten spiegeln stärker.
export function glassMaterial(opts){
  opts=opts||{};
  return new THREE.MeshPhysicalMaterial({
    color: opts.color!=null?opts.color:0x2b343e,
    metalness:0,
    roughness: opts.roughness!=null?opts.roughness:0.06,
    transparent:true,
    opacity: opts.opacity!=null?opts.opacity:0.32,   // durchsichtiger → der 3D-Innenraum bleibt erkennbar
    envMapIntensity: opts.env!=null?opts.env:1.6,    // HDR-Sonne liefert das Glanzlicht (Env ist gedimmt)
    clearcoat:1, clearcoatRoughness:0.06,
    ior:1.5, reflectivity:0.7,
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
  if(kind==='office'){ g.addColorStop(0,'#6c727b'); g.addColorStop(1,'#848b94'); }
  else if(kind==='dark'){ g.addColorStop(0,'#20252b'); g.addColorStop(1,'#333a43'); }
  else { g.addColorStop(0,'#8a8175'); g.addColorStop(0.58,'#6f665b'); g.addColorStop(1,'#4c453d'); } // helle, warme Wohnwand
  c.fillStyle=g; c.fillRect(0,0,128,170);
  if(kind==='home'){
    // Rückwand mit warmem Lampenschein (Wohnzimmer)
    const gg=c.createRadialGradient(64,58,2,64,58,80);
    gg.addColorStop(0,'rgba(255,226,170,0.55)'); gg.addColorStop(1,'rgba(255,226,170,0)');
    c.fillStyle=gg; c.fillRect(0,0,128,170);
    // Bodenzone (dunkler) + Möbel-Silhouette (Sofa) → Tiefe/Durchblick
    c.fillStyle='rgba(38,30,22,0.55)'; c.fillRect(0,120,128,50);
    c.fillStyle='rgba(24,18,12,0.75)'; c.fillRect(20,96,88,30);   // Sofa-Körper
    c.fillRect(20,84,16,42); c.fillRect(92,84,16,42);             // Armlehnen
    // seitliche Vorhänge
    c.fillStyle='rgba(232,226,212,0.6)';
    for(let x=2;x<34;x+=6) c.fillRect(x,0,3,170);
    for(let x=94;x<126;x+=6) c.fillRect(x,0,3,170);
    // stehende Lampe rechts
    c.fillStyle='rgba(255,236,190,0.85)'; c.fillRect(110,40,7,10);
  } else if(kind==='office'){
    c.fillStyle='rgba(255,250,236,0.7)';
    for(let y=14;y<92;y+=22) c.fillRect(20,y,88,5);   // Deckenleuchten-Reihen
    c.fillStyle='rgba(90,100,112,0.55)'; c.fillRect(0,118,128,52); // Bodenzone
    c.fillStyle='rgba(30,36,44,0.5)'; c.fillRect(24,96,80,26);     // Schreibtisch-Silhouette
  }
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.MeshBasicMaterial({map:t});
  _intCache[kind]=m;
  return m;
}

// ---------- Normal-Map aus der Klinker-Textur ----------
// Die Fugenfarbe ist die dominante, uniforme Farbe der Textur → diese Pixel
// liegen tief (Fuge zurückversetzt), die Steine tragen ihr Foto-Relief
// (Luminanz als Höhe). Sobel über ein geglättetes Höhenfeld → Tangentspace-Normal.
export function normalFromCanvas(cv,maxW){
  if(!cv) return null;
  const W=Math.max(2,Math.min(maxW||1024,cv.width));
  const H=Math.max(2,Math.round(cv.height*W/cv.width));
  const sc=document.createElement('canvas'); sc.width=W; sc.height=H;
  const c=sc.getContext('2d',{willReadFrequently:true});
  c.drawImage(cv,0,0,W,H);
  let d; try{ d=c.getImageData(0,0,W,H).data; }catch(e){ return null; }
  const N=W*H;
  // dominante quantisierte Farbe (4 Bit/Kanal) = Fugenfarbe, wenn sie genug Fläche hat
  const hist=new Map(); let bestK=-1, bestN=0;
  for(let p=0,i=0;p<N;p++,i+=4){
    const k=((d[i]>>4)<<8)|((d[i+1]>>4)<<4)|(d[i+2]>>4);
    const n=(hist.get(k)||0)+1; hist.set(k,n);
    if(n>bestN){ bestN=n; bestK=k; }
  }
  const jr=(((bestK>>8)&15)<<4)+8, jg=(((bestK>>4)&15)<<4)+8, jb=((bestK&15)<<4)+8;
  const isJoint=bestN>N*0.06;
  // Höhenfeld 0..1
  const h=new Float32Array(N);
  for(let p=0,i=0;p<N;p++,i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    let v=0.35+0.65*((r*0.299+g*0.587+b*0.114)/255);
    if(isJoint && Math.abs(r-jr)<26 && Math.abs(g-jg)<26 && Math.abs(b-jb)<26) v=0.10;
    h[p]=v;
  }
  // 3×3-Blur gegen Pixelrauschen
  const hb=new Float32Array(N);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    let s=0,n=0;
    for(let dy=-1;dy<=1;dy++){ const yy=y+dy; if(yy<0||yy>=H) continue;
      for(let dx=-1;dx<=1;dx++){ const xx=x+dx; if(xx<0||xx>=W) continue; s+=h[yy*W+xx]; n++; } }
    hb[y*W+x]=s/n;
  }
  // Sobel → Normal (Y+ oben; Canvas-y läuft nach unten, Textur ist geflippt)
  const out=c.createImageData(W,H), od=out.data, K=2.4;
  for(let y=0;y<H;y++){ const y0=Math.max(0,y-1)*W, y1=Math.min(H-1,y+1)*W, row=y*W;
    for(let x=0;x<W;x++){
      const x0=Math.max(0,x-1), x1=Math.min(W-1,x+1);
      const gx=(hb[row+x1]-hb[row+x0])*K, gy=(hb[y1+x]-hb[y0+x])*K;
      const inv=1/Math.sqrt(gx*gx+gy*gy+1), i=(row+x)*4;
      od[i  ]=Math.round((-gx*inv*0.5+0.5)*255);
      od[i+1]=Math.round(( gy*inv*0.5+0.5)*255);
      od[i+2]=Math.round(( inv*0.5+0.5)*255);
      od[i+3]=255;
    }
  }
  c.putImageData(out,0,0);
  return new THREE.CanvasTexture(sc);
}

// ---------- Interior-Mapping: echter 3D-Raum hinter jeder Fensterscheibe ----------
// Shader schneidet den Blickstrahl mit einem virtuellen Raumquader hinter der
// Scheibe (Rückwand/Boden/Decke/Seitenwände) → korrekte Parallaxe beim Orbiten,
// ohne zusätzliche Geometrie. kind: 'home' (warm, Lampe, Sofa) · 'office'
// (kühler, Deckenleuchten, Schreibtisch). seed variiert Lampe/Möbel je Fenster.
const INT_VERT=`varying vec3 vP;varying vec3 vC;
void main(){
  vP=position;
  vC=(cameraPosition-vec3(modelMatrix[3]))*mat3(modelMatrix);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
const INT_FRAG=`precision highp float;
uniform float uW,uH,uD,uSeed,uKind;
varying vec3 vP;varying vec3 vC;
float hash(float n){ return fract(sin(n)*43758.5453123); }
void main(){
  vec3 rd=normalize(vP-vC);
  if(rd.z>-0.02) rd.z=-0.02;
  vec3 ro=vec3(vP.x,vP.y,0.0);
  float w2=uW*0.5, h2=uH*0.5;
  float tz=-uD/rd.z;
  float tx=((rd.x>0.0?w2:-w2)-ro.x)/rd.x;
  float ty=((rd.y>0.0?h2:-h2)-ro.y)/rd.y;
  float t=min(tz,min(tx,ty));
  vec3 hit=ro+rd*t;
  float dz=clamp(-hit.z/uD,0.0,1.0);
  float lampOn=0.5+0.7*hash(uSeed*7.31+1.7);
  bool office=uKind>0.5;
  vec3 col;
  // Räume lesen sich von aussen DUNKEL (Tageslicht-Kontrast) — warme Akzente bleiben
  if(tz<=tx && tz<=ty){
    // Rueckwand: Verlauf + Lampenschein + Moebel-Silhouette + Bild
    float v=(hit.y+h2)/uH;
    col=office? mix(vec3(0.15,0.16,0.185),vec3(0.21,0.225,0.25),v)
              : mix(vec3(0.19,0.165,0.14),vec3(0.27,0.24,0.20),v);
    vec2 lp=vec2((hash(uSeed)*0.6-0.3)*uW, -h2+uH*(office?0.45:0.60));
    float dl=length(hit.xy-lp);
    vec3 lc=office? vec3(0.55,0.68,0.9):vec3(1.0,0.72,0.38);
    col+=lc*lampOn*0.8*exp(-dl*dl*(16.0/(uW*uW+0.4)));
    float fw=office?0.42:0.34;
    if(hit.y<-h2+uH*(office?0.30:0.34) && abs(hit.x-(hash(uSeed*3.3)*0.4-0.2)*uW)<uW*fw*0.5) col*=0.4;
    if(!office && abs(hit.x+uW*0.24)<uW*0.085 && abs(hit.y-uH*0.10)<uH*0.13) col=mix(col,vec3(0.40,0.36,0.29),0.9);
  } else if(tx<=ty){
    float v=(hit.y+h2)/uH;
    col=(office? mix(vec3(0.13,0.14,0.16),vec3(0.19,0.20,0.22),v)
               : mix(vec3(0.16,0.145,0.125),vec3(0.24,0.215,0.185),v))*(1.0-0.35*dz);
  } else if(rd.y<0.0){
    col=(office? vec3(0.15,0.155,0.165):vec3(0.15,0.11,0.075))*(1.0-0.45*dz);
  } else {
    col=(office? vec3(0.30,0.31,0.32):vec3(0.34,0.32,0.29))*(1.0-0.35*dz);
    if(office){
      float s=fract(-hit.z/1.1);
      if(s<0.22 && abs(hit.x)<uW*0.42) col=vec3(0.95,0.90,0.72)*lampOn;
    }
  }
  col*=1.0-0.3*dz;
  gl_FragColor=vec4(pow(max(col,vec3(0.0)),vec3(0.4545)),1.0);
}`;
export function interiorRoom(w,h,depth,seed,kind){
  return new THREE.ShaderMaterial({
    uniforms:{uW:{value:w},uH:{value:h},uD:{value:depth||1.7},uSeed:{value:seed!=null?seed:1},uKind:{value:kind==='office'?1:0}},
    vertexShader:INT_VERT, fragmentShader:INT_FRAG
  });
}

// ---------- dezente Vignette über dem 3D-Canvas (Foto-Look) ----------
export function addVignette(host){
  if(!host) return;
  if(getComputedStyle(host).position==='static') host.style.position='relative';
  if(host.querySelector(':scope > .v3d-vignette')) return;
  const d=document.createElement('div');
  d.className='v3d-vignette';
  d.style.cssText='position:absolute;inset:0;pointer-events:none;border-radius:inherit;z-index:2;'+
    'background:radial-gradient(120% 95% at 50% 40%, rgba(0,0,0,0) 60%, rgba(14,17,22,0.20) 100%)';
  host.appendChild(d);
}
