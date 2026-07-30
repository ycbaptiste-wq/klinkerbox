// ===================== KLINKERBOX · 3D-MATERIAL-BIBLIOTHEK =====================
// Geteilte Bausteine für fotorealistische Szenen: teilsonniger Himmel (Dome +
// Environment mit HDR-Sonne → echte Glanzlichter in Glas/Metall), physikalisches
// Fensterglas, Innenraum-Material, Normal-Maps aus den Klinker-Texturen
// (Fugen liegen tief, Steine tragen ihr Foto-Relief) und eine dezente Vignette.
import * as THREE from './three.module.min.js';

// ---------- Qualitätsstufe ----------
// '(pointer:coarse)' allein taugt nicht als Mobil-Erkennung: Notebooks mit
// Touchscreen und eingebettete Browser melden das ebenfalls und bekämen dann
// grundlos die Sparversion (harte Schatten, kleine Shadow-Map, kein AA).
// Mit ?q=high / ?q=low lässt sich die Stufe zum Prüfen erzwingen.
export const LOWQ=(()=>{
  try{
    const q=new URLSearchParams(location.search).get('q');
    if(q==='low') return true;
    if(q==='high') return false;
    if(/Android|iPhone|iPod|iPad|Mobile/i.test(navigator.userAgent||'')) return true;
    if((navigator.hardwareConcurrency||8)<=4) return true;
    if((navigator.deviceMemory||8)<=4) return true;
    return matchMedia('(pointer:coarse)').matches && Math.min(innerWidth,innerHeight)<820;
  }catch(e){ return false; }
})();

// ---------- Himmel: teilsonnig, echte Quellwolken aus fBm-Rauschen ----------
// Der frühere gemalte Verlauf mit ein paar Radialgradienten las sich im Bild als
// leere Fläche. Hier entstehen die Wolken aus geschichtetem Wertrauschen: Dichte
// aus fBm, Ballung zum Horizont hin gestaucht (Perspektive), und die Helligkeit
// aus dem Dichtegefälle Richtung Sonne — dadurch bekommen die Ballen oben eine
// helle Kante und unten eine graue Basis, statt gleichmässig weiss zu sein.
let _skyCv=null;
const SUN_UV=[0.30,0.20];                            // Sonnenposition in Himmelskoordinaten
function skyCanvas(){
  if(_skyCv) return _skyCv;
  const W=MOBILE_LIB?1024:2048, H=W>>1;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const c=cv.getContext('2d',{willReadFrequently:true});
  const g=c.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#4f81b2'); g.addColorStop(0.30,'#7ea6c9');
  g.addColorStop(0.62,'#b6cadb'); g.addColorStop(0.86,'#dfe6e7'); g.addColorStop(1,'#f0ebdf');
  c.fillStyle=g; c.fillRect(0,0,W,H);
  const SX=W*SUN_UV[0], SY=H*SUN_UV[1];
  const sg=c.createRadialGradient(SX,SY,10,SX,SY,H*0.9);
  sg.addColorStop(0,'rgba(255,247,226,0.55)'); sg.addColorStop(0.34,'rgba(255,243,218,0.17)');
  sg.addColorStop(1,'rgba(255,241,215,0)');
  c.fillStyle=sg; c.fillRect(0,0,W,H);

  const hash=(x,y)=>{ let n=(x|0)*374761393+(y|0)*668265263;
    n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967295; };
  const vnoise=(x,y)=>{ const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
    const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
    const a=hash(xi,yi), b=hash(xi+1,yi), e=hash(xi,yi+1), f=hash(xi+1,yi+1);
    return a+(b-a)*u+(e-a)*v+(a-b-e+f)*u*v; };
  const fbm=(x,y)=>{ let s=0,am=0.5,fr=1;
    for(let o=0;o<5;o++){ s+=am*vnoise(x*fr,y*fr); fr*=2.07; am*=0.5; } return s; };

  const id=c.getImageData(0,0,W,H), d=id.data;
  // Das Rauschen wird auf eine WOLKENEBENE in fester Höhe projiziert, nicht direkt
  // auf die Textur: Blickrichtung → Schnittpunkt mit der Ebene. Nur so stimmt die
  // Perspektive (Ballen werden zum Horizont hin flach und klein), statt zu scheren.
  const sunTh=SUN_UV[0]*Math.PI*2, sunPhi=(0.5-SUN_UV[1])*Math.PI;
  const sunD=1/Math.max(0.2,Math.sin(sunPhi));
  const sunX=Math.cos(sunTh)*sunD, sunY=Math.sin(sunTh)*sunD;
  for(let y=0;y<H;y++){
    const phi=(0.5-y/H)*Math.PI;
    if(phi<=0.03) continue;                           // Horizont und darunter
    const dist=1/Math.sin(phi);
    const fade=Math.min(1,Math.max(0,(24-dist)/16));  // ganz flach → im Dunst verschwunden
    if(fade<=0.01) continue;
    for(let x=0;x<W;x++){
      const th=x/W*Math.PI*2;
      const px=Math.cos(th)*dist, py=Math.sin(th)*dist;
      const n=fbm(px*0.82+11.3,py*0.82+4.7);
      let cov=(n-0.505)/0.135; if(cov<=0) continue; if(cov>1) cov=1;
      cov*=fade;
      // Schattierung aus dem Dichtegefälle Richtung Sonne: helle Sonnenkante, graue Basis
      const lx=(sunX-px), ly=(sunY-py), ll=Math.hypot(lx,ly)||1;
      const ns=fbm((px+lx/ll*0.55)*0.82+11.3,(py+ly/ll*0.55)*0.82+4.7);
      const lit=Math.min(1,Math.max(0,0.5+(ns-n)*3.0));
      const r=168+87*lit, gc=177+78*lit, b=188+67*lit;
      const i=(y*W+x)*4, a=cov*0.95;
      d[i  ]=d[i  ]*(1-a)+r*a;
      d[i+1]=d[i+1]*(1-a)+gc*a;
      d[i+2]=d[i+2]*(1-a)+b*a;
    }
  }
  c.putImageData(id,0,0);
  // Dunst-Schleier über dem Horizont (legt sich auch über die Wolken)
  const hz=c.createLinearGradient(0,H*0.40,0,H*0.52);
  hz.addColorStop(0,'rgba(238,238,232,0)'); hz.addColorStop(1,'rgba(243,240,232,0.90)');
  c.fillStyle=hz; c.fillRect(0,H*0.40,W,H*0.12);
  c.fillStyle='rgba(243,240,232,0.90)'; c.fillRect(0,H*0.52,W,H*0.48);
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
    new THREE.MeshBasicMaterial({map:skyDomeTexture(),color:0x8e8e8e,side:THREE.BackSide}));
  es.add(sky);
  const sun=new THREE.Mesh(new THREE.SphereGeometry(3.2,16,12),
    new THREE.MeshBasicMaterial({color:new THREE.Color(11,9.5,7.5)}));
  sun.position.set(30,21,17);                       // gleiche Richtung wie das Sonnenlicht der Szenen
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

// ---------- Klinker-Oberfläche: alle PBR-Karten aus EINEM Durchlauf ----------
// Die Fugenfarbe ist die dominante, uniforme Farbe der Textur → diese Pixel
// liegen tief (Fuge zurückversetzt), die Steine tragen ihr Foto-Relief
// (Luminanz als Höhe). Daraus entstehen in einem Rutsch:
//   normal  – Tangentspace-Normale (Sobel über das geglättete Höhenfeld)
//   orm     – R = Ambient Occlusion (Fugen und Steinkanten verschattet)
//             G = Roughness (Mörtel matt, gesinterter Stein glatter)
//             B = Höhenfeld für die Parallax-Verschiebung
// EINE Karte für drei Aufgaben: aoMap und roughnessMap teilen sie sich, die
// Parallax-Erweiterung liest denselben Blau-Kanal. metalnessMap bleibt frei.
const _mapCache=new Map();
const MOBILE_LIB=LOWQ;

// separierbarer Box-Blur über ein Float-Feld (Radius in Pixel)
function boxBlur(src,W,H,R){
  if(R<1) return src;
  const tmp=new Float32Array(W*H), out=new Float32Array(W*H), D=R*2+1;
  for(let y=0;y<H;y++){ const row=y*W; let s=0;
    for(let k=-R;k<=R;k++) s+=src[row+Math.min(W-1,Math.max(0,k))];
    for(let x=0;x<W;x++){ tmp[row+x]=s/D;
      s+=src[row+Math.min(W-1,x+R+1)]-src[row+Math.max(0,x-R)]; } }
  for(let x=0;x<W;x++){ let s=0;
    for(let k=-R;k<=R;k++) s+=tmp[Math.min(H-1,Math.max(0,k))*W+x];
    for(let y=0;y<H;y++){ out[y*W+x]=s/D;
      s+=tmp[Math.min(H-1,y+R+1)*W+x]-tmp[Math.max(0,y-R)*W+x]; } }
  return out;
}

// Gecacht werden die CANVAS-Ergebnisse (die Pixelrechnerei ist teuer), nicht die
// Texturen — jedes Material bekommt eigene, damit dispose() keine fremde reisst.
function texPair(cvs){
  const n=new THREE.CanvasTexture(cvs.normalCv);
  const o=new THREE.CanvasTexture(cvs.ormCv);
  o.colorSpace=THREE.NoColorSpace;                    // ORM ist Daten, keine Farbe
  return {normal:n, orm:o};
}
export function surfaceMaps(cv,maxW){
  if(!cv) return null;
  const key=cv.__klbKey;
  if(key && _mapCache.has(key)) return texPair(_mapCache.get(key));
  const cap=maxW||(MOBILE_LIB?512:1024);
  const W=Math.max(2,Math.min(cap,cv.width));
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
  // Höhenfeld 0..1 + Helligkeit + Fugen-Flag (für Relief pro Stein)
  const h=new Float32Array(N), lum=new Float32Array(N); const jointPx=new Uint8Array(N);
  for(let p=0,i=0;p<N;p++,i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    const L=(r*0.299+g*0.587+b*0.114)/255;
    lum[p]=L;
    let v=0.42+0.58*L;
    if(isJoint && Math.abs(r-jr)<26 && Math.abs(g-jg)<26 && Math.abs(b-jb)<26){ v=0.26; jointPx[p]=1; }
    h[p]=v;
  }
  const hb=boxBlur(h,W,H,1), lb=boxBlur(lum,W,H,1);
  // Kavitätsfeld: Höhe gegen weit geglättete Höhe → negativ genau dort, wo die
  // Fläche zurückspringt (Fugen, Steinkanten). Das ist die Ambient Occlusion.
  const R=Math.max(2,Math.round(Math.min(W,H)/110));
  const hWide=boxBlur(hb,W,H,R);
  // Sobel → Normal. Relief pro Pixel nach Helligkeit skaliert: DUNKLE Steine flacher
  // (stehen weniger weit hervor), helle Steine kräftiger; Fugen(kanten) bleiben tief.
  const nOut=c.createImageData(W,H), nd=nOut.data, K=2.6;
  const oCv=document.createElement('canvas'); oCv.width=W; oCv.height=H;
  const oc=oCv.getContext('2d',{willReadFrequently:true});
  const oOut=oc.createImageData(W,H), od=oOut.data;
  for(let y=0;y<H;y++){ const y0=Math.max(0,y-1)*W, y1=Math.min(H-1,y+1)*W, row=y*W;
    for(let x=0;x<W;x++){
      const x0=Math.max(0,x-1), x1=Math.min(W-1,x+1), p=row+x, i=p*4;
      let gx=(hb[row+x1]-hb[row+x0])*K, gy=(hb[y1+x]-hb[y0+x])*K;
      const nearJoint = jointPx[p]||jointPx[row+x0]||jointPx[row+x1]||jointPx[y0+x]||jointPx[y1+x];
      const rf = nearJoint ? 1.0 : (0.28 + 0.9*lb[p]);   // dunkler Stein → weniger Relief
      gx*=rf; gy*=rf;
      const inv=1/Math.sqrt(gx*gx+gy*gy+1);
      nd[i  ]=Math.round((-gx*inv*0.5+0.5)*255);
      nd[i+1]=Math.round(( gy*inv*0.5+0.5)*255);
      nd[i+2]=Math.round(( inv*0.5+0.5)*255);
      nd[i+3]=255;
      // R: AO — Kavität verschattet, echte Fugenpixel zusätzlich. Zurückhaltend
      // dosiert: die Fuge liegt im Schatten, sie ist kein schwarzes Loch.
      let ao=0.80+(hb[p]-hWide[p])*1.7;
      if(jointPx[p]) ao-=0.15;
      od[i  ]=Math.round(255*Math.min(1,Math.max(0.50,ao)));
      // G: Roughness — Mörtel stumpf, heller Stein kreidiger, dunkler gesinterter glatter
      const rgh = jointPx[p] ? 0.95 : (0.54+0.26*lb[p]);
      od[i+1]=Math.round(255*rgh);
      // B: Höhe für die Parallax-Verschiebung
      od[i+2]=Math.round(255*Math.min(1,Math.max(0,hb[p])));
      od[i+3]=255;
    }
  }
  c.putImageData(nOut,0,0); oc.putImageData(oOut,0,0);
  const cvs={ normalCv:sc, ormCv:oCv };
  if(key){ if(_mapCache.size>24) _mapCache.clear(); _mapCache.set(key,cvs); }
  return texPair(cvs);
}
// Kompatibilität: alter Name — liefert nur noch die Normal-Map
export function normalFromCanvas(cv,maxW){ const m=surfaceMaps(cv,maxW); return m?m.normal:null; }

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
uniform float uW,uH,uD,uSeed,uKind,uCorner;
varying vec3 vP;varying vec3 vC;
float hash(float n){ return fract(sin(n)*43758.5453123); }
void main(){
  vec3 rd=normalize(vP-vC);
  if(rd.z>-0.02) rd.z=-0.02;
  vec3 ro=vec3(vP.x,vP.y,0.0);
  float w2=uW*0.5, h2=uH*0.5;
  bool office=uKind>0.5;
  float lampOn=0.5+0.7*hash(uSeed*7.31+1.7);
  // Grundhelligkeit variiert je Fenster — Büros streuen stärker (leere dunkle Räume)
  float lit=office? (0.45+0.95*hash(uSeed*4.71+0.9)) : (0.7+0.6*hash(uSeed*4.71+0.9));
  // ---- seitliche Vorhänge direkt hinter dem Glas (nur Wohnen, nicht überall) ----
  if(!office && hash(uSeed*2.13)>0.3){
    float tc=(-0.09)/rd.z;
    vec2 pc=ro.xy+rd.xy*tc;
    float cw=uW*(0.14+0.10*hash(uSeed*5.7));
    if(abs(pc.x)>w2-cw && pc.y>-h2+0.02){
      float fold=0.82+0.18*sin(pc.x*90.0/uW+uSeed);
      vec3 cc=mix(vec3(0.62,0.58,0.50),vec3(0.52,0.47,0.41),(h2-pc.y)/uH)*fold*0.6*lit;
      gl_FragColor=vec4(pow(max(cc,vec3(0.0)),vec3(0.4545)),1.0); return;
    }
  }
  // ---- Büro: Lamellen-Jalousien, teils heruntergelassen ----
  if(office && hash(uSeed*2.13)>0.35){
    float cover=0.25+0.6*hash(uSeed*6.3);
    float tb=(-0.06)/rd.z;
    vec2 pb=ro.xy+rd.xy*tb;
    if(pb.y>h2-cover*uH){
      float s=0.78+0.22*sin(pb.y*220.0/uH);
      vec3 bc=vec3(0.60,0.61,0.62)*s*(0.75+0.3*lit);
      gl_FragColor=vec4(pow(max(bc,vec3(0.0)),vec3(0.4545)),1.0); return;
    }
  }
  // ---- Raumquader ----
  float tz=-uD/rd.z;
  float tx=((rd.x>0.0?w2:-w2)-ro.x)/rd.x;
  float ty=((rd.y>0.0?h2:-h2)-ro.y)/rd.y;
  float t=min(tz,min(tx,ty));
  vec3 hit=ro+rd*t;
  float dz=clamp(-hit.z/uD,0.0,1.0);
  float dm=clamp(-hit.z/4.5,0.0,1.0);   // Distanz-Abdunklung in METERN — grosse Räume bleiben hinten hell
  // Wandton variiert je Fenster: greige / warmweiss / terracotta / salbei
  float hue=hash(uSeed*3.9+2.2);
  vec3 wallA = hue<0.25? vec3(0.20,0.17,0.14) : hue<0.5? vec3(0.215,0.195,0.17) : hue<0.75? vec3(0.225,0.16,0.125) : vec3(0.175,0.19,0.155);
  if(office) wallA=vec3(0.28,0.29,0.315);          // Büro: helle, kühle Wände
  vec3 wallB=wallA*1.45;
  vec2 lp=vec2((hash(uSeed)*0.6-0.3)*uW, -h2+uH*(office?0.45:0.58));
  vec3 lc=office? vec3(0.55,0.68,0.9):vec3(1.0,0.72,0.38);
  vec3 col;
  if(tz<=tx && tz<=ty){
    // Rueckwand: Verlauf + Lampe (Schein + heller Kern) + Moebel + Bild/Monitore + Pflanze
    float v=(hit.y+h2)/uH;
    col=mix(wallA,wallB,v);
    float dl=length(hit.xy-lp);
    col+=lc*lampOn*0.8*exp(-dl*dl*(16.0/(uW*uW+0.4)));
    col+=lc*lampOn*1.6*exp(-dl*dl*(420.0/(uW*uW+0.4)));
    if(!office && uW>3.0){
      // grosse Wohnräume (Glasfront): zweite Leuchte spiegelbildlich
      float dl2=length(hit.xy-vec2(-lp.x,lp.y));
      col+=lc*0.7*exp(-dl2*dl2*(16.0/(uW*uW+0.4)));
      col+=lc*1.4*exp(-dl2*dl2*(420.0/(uW*uW+0.4)));
    }
    // Durchblick: helles Fenster in der Rueckwand (Garten unten / Himmel oben) → Haus wirkt durchsichtig
    float bwx=(hash(uSeed*5.1)-0.5)*0.38*uW;
    float bwHW=uW*(office?0.24:0.19), bwHH=uH*0.24, bwCY=uH*0.12;
    vec2 bwd=abs(hit.xy-vec2(bwx,bwCY));
    bool inBW=bwd.x<bwHW && bwd.y<bwHH;
    if(inBW){
      if(office){ float gv=clamp((hit.y-bwCY)/bwHH*0.5+0.5,0.0,1.0);
        col=mix(vec3(0.58,0.63,0.70),vec3(0.80,0.86,0.94),gv); }        // Büro: Stadt/Himmel
      else { float gv=clamp((hit.y-bwCY)/bwHH*0.5+0.5,0.0,1.0);
        col=mix(vec3(0.50,0.60,0.40),vec3(0.76,0.84,0.94),gv); }        // Wohnen: Garten → Himmel
      if(bwd.x>bwHW-uW*0.013||bwd.y>bwHH-uH*0.019) col=vec3(0.66,0.64,0.59); // heller Rahmen
      else if(abs(hit.x-bwx)<uW*0.006||abs(hit.y-bwCY)<uH*0.008) col*=0.72; // Sprossenkreuz
    }
    float fx=(hash(uSeed*3.3)*0.4-0.2)*uW;
    float fw=office?0.5:0.34;
    if(office){
      // Screen/Whiteboard NEBEN dem Fenster
      float wx=bwx+(hash(uSeed*11.3)>0.5?1.0:-1.0)*uW*0.36;
      if(!inBW && hash(uSeed*12.7)>0.5 && abs(hit.x-wx)<uW*0.11 && abs(hit.y-uH*0.14)<uH*0.12)
        col=mix(col,vec3(0.55,0.56,0.57),0.9);
    } else {
      float px=bwx+(hash(uSeed*6.1)>0.5?1.0:-1.0)*uW*0.34;
      if(!inBW && abs(hit.x-px)<uW*0.075 && abs(hit.y-uH*0.14)<uH*0.12) col=mix(col,vec3(0.42,0.37,0.29),0.9);
    }
    // Vordergrund unten: Sofa/Schreibtisch-Silhouette + Monitore/Pflanze — VOR dem Fenster
    if(hit.y<-h2+uH*(office?0.26:0.34) && abs(hit.x-fx)<uW*fw*0.5) col*=office?0.5:0.4;
    if(office){
      float my=-h2+uH*0.30;
      if(abs(hit.y-my)<uH*0.055 && (abs(hit.x-fx-uW*0.10)<uW*0.05||abs(hit.x-fx+uW*0.02)<uW*0.05||abs(hit.x-fx+uW*0.14)<uW*0.05))
        col=vec3(0.5,0.68,0.95)*(0.6+lampOn);
    } else if(hash(uSeed*8.3)>0.5){
      float qx=(hash(uSeed*9.7)>0.5?1.0:-1.0)*uW*0.36;
      vec2 q=hit.xy-vec2(qx,-h2+uH*0.28);
      float leaf=min(min(length(q*vec2(1.0,1.4)),length((q-vec2(uW*0.05,uH*0.07))*vec2(1.2,1.5))),length((q+vec2(uW*0.05,-uH*0.05))*vec2(1.2,1.5)));
      if(leaf<uW*0.08) col=vec3(0.09,0.14,0.08);
      if(abs(q.x)<uW*0.03 && q.y<-uH*0.08 && q.y>-uH*0.18) col=vec3(0.16,0.11,0.08);
    }
  } else if(tx<=ty){
    float v=(hit.y+h2)/uH;
    col=mix(wallA*0.8,wallB*0.85,v)*(1.0-0.35*dm);
    // Eckzimmer: Seitenfenster mit Tageslicht auf der passenden Seitenwand
    if((uCorner>0.5 && hit.x>0.0)||(uCorner<-0.5 && hit.x<0.0)){
      float zz=-hit.z;
      if(zz>uD*0.22 && zz<uD*0.72 && abs(hit.y)<h2*0.74){
        float bx=min(zz-uD*0.22, uD*0.72-zz), by=h2*0.74-abs(hit.y);
        if(bx<uD*0.045||by<h2*0.10) col=vec3(0.82,0.83,0.81);
        else col=mix(vec3(0.70,0.78,0.86),vec3(0.95,0.96,0.93),(hit.y+h2*0.74)/(1.48*h2));
      }
    }
  } else if(rd.y<0.0){
    // Boden: Holzdielen mit Lampen-Lichtfleck (Wohnen) / Teppichfliesen (Buero)
    if(office){
      col=vec3(0.21,0.22,0.245);
      if(fract(hit.x/0.5)<0.05||fract(-hit.z/0.5)<0.05) col*=0.88;   // Teppichfliesen-Raster
      col*=(1.0-0.45*dz);
    }
    else{
      float pk=floor(hit.x/0.16);
      col=vec3(0.16,0.115,0.08)*(0.85+0.3*hash(pk*13.7+uSeed));
      if(fract(hit.x/0.16)<0.06) col*=0.75;
      col*=(1.0-0.5*dm);
      col+=vec3(0.5,0.36,0.19)*lampOn*0.25*exp(-length(hit.xz-vec2(lp.x,-uD*0.55))*3.0);
      if(abs(uCorner)>0.5){ float wx=uCorner>0.0?w2:-w2;   // Lichtschein des Seitenfensters
        col+=vec3(0.26,0.28,0.27)*exp(-(abs(hit.x-wx)*1.6+abs(-hit.z-uD*0.47)*1.1)); }
    }
  } else {
    // Decke: Rasterdecke mit Leuchtpanels (Buero) / warmweiss (Wohnen)
    col=(office? vec3(0.38,0.39,0.40):vec3(0.34,0.32,0.29))*(1.0-0.35*dz);
    if(office){
      float px=fract((hit.x+10.0)/0.85), pz=fract(-hit.z/0.95);
      if(px>0.12 && px<0.88 && pz>0.18 && pz<0.82) col=vec3(1.0,1.0,0.93)*(0.5+lampOn);
      else col*=0.9;                                  // Rasterschienen dunkler
    }
  }
  // Gesamtpegel bewusst tief: von aussen ist ein Zimmer deutlich dunkler als die
  // besonnte Fassade — helle Scheiben lassen das Haus sofort nach Attrappe aussehen.
  col*=(1.0-0.3*dz)*lit*0.62;
  gl_FragColor=vec4(pow(max(col,vec3(0.0)),vec3(0.4545)),1.0);
}`;
// corner: -1 = Fenster nahe der linken Gebäudeecke, +1 = rechte Ecke (→ Seitenfenster im Raum), 0 = keins
export function interiorRoom(w,h,depth,seed,kind,corner){
  return new THREE.ShaderMaterial({
    uniforms:{uW:{value:w},uH:{value:h},uD:{value:depth||1.7},uSeed:{value:seed!=null?seed:1},
      uKind:{value:kind==='office'?1:0},uCorner:{value:corner||0}},
    vertexShader:INT_VERT, fragmentShader:INT_FRAG
  });
}

// ---------- Parallax-Occlusion: die Fugen bekommen echte Tiefe ----------
// Der Blickstrahl wandert im Tangentenraum durch das Höhenfeld (Blau-Kanal der
// ORM-Karte), bis er die Oberfläche schneidet. Im streifenden Blick verdecken
// die Steine dadurch die Fuge — genau wie an einer echten Wand. Ohne das bleibt
// jede Klinkerfassade ein Aufkleber, egal wie gut die Normal-Map ist.
const POM_HEAD=`
uniform float uPomDepth;
vec3 klbTangent(vec3 eye, vec3 nrm, vec2 uv){
  vec3 q0=dFdx(eye), q1=dFdy(eye);
  vec2 s0=dFdx(uv), s1=dFdy(uv);
  vec3 q1p=cross(q1,nrm), q0p=cross(nrm,q0);
  vec3 T=s0.x*q1p+s1.x*q0p, B=s0.y*q1p+s1.y*q0p;
  float det=max(dot(T,T),dot(B,B));
  float sc=(det==0.0)?0.0:inversesqrt(det);
  return normalize(T*sc);
}
vec2 klbParallax(vec2 uv){
  if(uPomDepth<=0.0) return uv;
  vec3 N=normalize(vNormal);
  vec3 V=normalize(vViewPosition);
  vec3 T=klbTangent(-vViewPosition,N,uv);
  vec3 B=normalize(cross(N,T));
  vec3 vt=vec3(dot(V,T),dot(V,B),dot(V,N));
  if(vt.z<0.10) return uv;                       // fast tangential → Verschiebung explodiert
  float layers=mix(26.0,8.0,clamp(vt.z,0.0,1.0));
  float ld=1.0/layers;
  vec2 dUv=(vt.xy/vt.z)*uPomDepth*ld;
  float cur=0.0; vec2 uvc=uv;
  float dep=1.0-texture2D(roughnessMap,uvc).b;
  for(int i=0;i<26;i++){
    if(cur>=dep) break;
    uvc-=dUv; cur+=ld;
    dep=1.0-texture2D(roughnessMap,uvc).b;
  }
  vec2 prev=uvc+dUv;
  float a=dep-cur;
  float b=(1.0-texture2D(roughnessMap,prev).b)-cur+ld;
  float w=a/max(1e-5,a-b);
  return mix(uvc,prev,clamp(w,0.0,1.0));
}
`;
function patchParallax(m,depth){
  m.userData.klbPomDepth=depth;
  m.onBeforeCompile=sh=>{
    const marker='void main() {';
    const i=sh.fragmentShader.indexOf(marker);
    if(i<0) return;                                // three-Version passt nicht → still ohne POM
    sh.uniforms.uPomDepth={value:m.userData.klbPomDepth||0};
    const head=sh.fragmentShader.slice(0,i);
    // Nur im Rumpf ersetzen — die varying-Deklarationen im Kopf müssen ihre Namen behalten
    const body=sh.fragmentShader.slice(i+marker.length)
      .replace(/\bvMapUv\b|\bvNormalMapUv\b|\bvAoMapUv\b|\bvRoughnessMapUv\b/g,'klbUv');
    sh.fragmentShader=head+POM_HEAD+marker+'\n\tvec2 klbUv=klbParallax(vMapUv);\n'+body;
    m.userData.klbShader=sh;
  };
  m.customProgramCacheKey=()=>'klbPom'+((m.userData.klbPomDepth||0)>0?'1':'0');
}

// ---------- Produkt-Textur auf ein Material legen (eine Stelle für alle Szenen) ----------
// opts: {fallback, rough, normalScale, env, ao, pom} — pom = Fugentiefe in UV-Einheiten
export function applySurface(m,cv,opts){
  opts=opts||{};
  const aniso=opts.aniso||8;
  if(m.map) m.map.dispose();
  if(m.normalMap){ m.normalMap.dispose(); m.normalMap=null; }
  if(m.aoMap){ m.aoMap.dispose(); m.aoMap=null; m.roughnessMap=null; }
  if(!cv){
    m.map=null;
    if(opts.fallback!=null) m.color.set(opts.fallback);
    m.roughness=0.95; m.envMapIntensity=opts.env!=null?opts.env:0.3;
    m.userData.klbPomDepth=0; m.needsUpdate=true; return;
  }
  const t=new THREE.CanvasTexture(cv);
  t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=aniso;
  m.map=t; m.color.set(0xffffff);
  const maps=surfaceMaps(cv,opts.maxW);
  if(maps){
    maps.normal.anisotropy=aniso; maps.normal.generateMipmaps=false; maps.normal.minFilter=THREE.LinearFilter;
    maps.orm.anisotropy=aniso;    maps.orm.generateMipmaps=false;    maps.orm.minFilter=THREE.LinearFilter;
    m.normalMap=maps.normal;
    const ns=opts.normalScale!=null?opts.normalScale:0.9;
    m.normalScale=new THREE.Vector2(ns,ns);
    m.aoMap=maps.orm; m.roughnessMap=maps.orm;
    m.aoMapIntensity=opts.ao!=null?opts.ao:1.0;
  }
  // Roughness-Skalar multipliziert die Karte → 1.0 lässt die gemessenen Werte stehen
  m.roughness=opts.rough!=null?opts.rough:1.0;
  m.metalness=0;
  m.envMapIntensity=opts.env!=null?opts.env:0.35;
  const pom=opts.pom!=null?opts.pom:0;
  if(pom>0 && maps){ if(!m.userData.klbShader) patchParallax(m,pom); else { m.userData.klbPomDepth=pom;
      if(m.userData.klbShader.uniforms.uPomDepth) m.userData.klbShader.uniforms.uPomDepth.value=pom; } }
  else m.userData.klbPomDepth=0;
  m.needsUpdate=true;
}

// ---------- Bepflanzung ----------
// Ein Grashalm: schmales, sich nach oben verjüngendes Band mit leichter Biegung.
// Die alte Lösung baute pro Büschel neun TubeGeometry-Meshes — das sah nach Draht
// aus und kostete Dutzende Draw-Calls. Jetzt: eine Geometrie, alles instanziert.
let _bladeGeo=null;
function bladeGeo(){
  if(_bladeGeo) return _bladeGeo;
  const SEG=4, pos=[], idx=[];
  for(let i=0;i<=SEG;i++){ const t=i/SEG, wd=0.016*(1-t*0.9), bend=0.16*t*t;
    pos.push(-wd,t,bend, wd,t,bend); }
  for(let i=0;i<SEG;i++){ const a=i*2; idx.push(a,a+1,a+2, a+1,a+3,a+2); }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx); g.computeVertexNormals();
  _bladeGeo=g; return g;
}
// Deterministischer Zufall — sonst sieht die Bepflanzung bei jedem Mount anders aus
let _rs=20260730;
export const rnd=()=>{ _rs=(_rs*1664525+1013904223)&0x7fffffff; return _rs/0x7fffffff; };
export function resetRnd(){ _rs=20260730; }
// Ein Grasbüschel als EIN InstancedMesh. pale: trockenes Ziergras statt Rasen.
export function grassTuft(x,z,scale,parent,pale){
  const s=scale||1, per=LOWQ?18:30, R=0.34*s;
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,side:THREE.DoubleSide});
  const im=new THREE.InstancedMesh(bladeGeo(),m,per);
  im.castShadow=true; im.receiveShadow=true;
  const M=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(),
        v=new THREE.Vector3(), sc=new THREE.Vector3(), col=new THREE.Color();
  for(let i=0;i<per;i++){
    const a=rnd()*Math.PI*2, d=Math.sqrt(rnd())*R;
    v.set(x+Math.cos(a)*d, 0, z+Math.sin(a)*d);
    e.set((rnd()-0.5)*0.35, rnd()*Math.PI*2, (rnd()-0.5)*0.35); q.setFromEuler(e);
    sc.set(0.85+rnd()*0.5, (0.34+rnd()*0.42)*s, 0.85+rnd()*0.5);
    M.compose(v,q,sc); im.setMatrixAt(i,M);
    if(pale) col.setHSL(0.13+rnd()*0.05, 0.22+rnd()*0.14, 0.40+rnd()*0.18);
    else     col.setHSL(0.22+rnd()*0.06, 0.28+rnd()*0.18, 0.20+rnd()*0.16);
    im.setColorAt(i,col);
  }
  im.instanceMatrix.needsUpdate=true; if(im.instanceColor) im.instanceColor.needsUpdate=true;
  parent.add(im);
  return im;
}
// Strauch: mehrere versetzte Kugeln statt einer → unregelmässige Silhouette
export function bushClump(x,z,r,c,parent){
  const base=new THREE.Color(c||0x5c6e4a);
  for(let i=0;i<4;i++){
    const rr=r*(0.62+rnd()*0.45);
    const b=new THREE.Mesh(new THREE.IcosahedronGeometry(rr,1),
      new THREE.MeshStandardMaterial({color:base.clone().offsetHSL(0,(rnd()-0.5)*0.06,(rnd()-0.5)*0.09),roughness:1}));
    b.position.set(x+(rnd()-0.5)*r*1.1, rr*0.72+rnd()*0.12*r, z+(rnd()-0.5)*r*0.9);
    b.scale.set(1,0.78+rnd()*0.2,1);
    b.castShadow=true; b.receiveShadow=true; parent.add(b);
  }
}

// ---------- Ressourcen einer Szene vollständig freigeben ----------
// Ohne das bleibt pro angeschautem Gebäude ein WebGL-Kontext liegen — nach ein
// paar Wechseln friert der Browser ein (auf iOS schon nach zwei, drei).
export function disposeScene(scene,renderer){
  try{
    if(scene){
      scene.traverse(o=>{
        if(o.geometry&&o.geometry.dispose) o.geometry.dispose();
        const mm=o.material; if(!mm) return;
        (Array.isArray(mm)?mm:[mm]).forEach(x=>{
          if(!x) return;
          for(const k in x){ const v=x[k]; if(v&&v.isTexture&&v.dispose) v.dispose(); }
          if(x.dispose) x.dispose();
        });
      });
      if(scene.environment&&scene.environment.dispose) scene.environment.dispose();
      if(scene.background&&scene.background.dispose) scene.background.dispose();
    }
    if(renderer){
      renderer.dispose();
      if(renderer.forceContextLoss) renderer.forceContextLoss();
      const el=renderer.domElement;
      if(el&&el.parentNode) el.parentNode.removeChild(el);
    }
  }catch(e){}
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
