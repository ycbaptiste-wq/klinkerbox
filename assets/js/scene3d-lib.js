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
  // Höhenfeld 0..1 + Helligkeit + Fugen-Flag (für Relief pro Stein)
  const h=new Float32Array(N), lum=new Float32Array(N); const jointPx=new Uint8Array(N);
  for(let p=0,i=0;p<N;p++,i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    const L=(r*0.299+g*0.587+b*0.114)/255;
    lum[p]=L;
    let v=0.30+0.70*L;
    if(isJoint && Math.abs(r-jr)<26 && Math.abs(g-jg)<26 && Math.abs(b-jb)<26){ v=0.08; jointPx[p]=1; }
    h[p]=v;
  }
  // 3×3-Blur von Höhe UND Helligkeit (gegen Pixelrauschen)
  const hb=new Float32Array(N), lb=new Float32Array(N);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    let s=0,sl=0,n=0;
    for(let dy=-1;dy<=1;dy++){ const yy=y+dy; if(yy<0||yy>=H) continue;
      for(let dx=-1;dx<=1;dx++){ const xx=x+dx; if(xx<0||xx>=W) continue; const q=yy*W+xx; s+=h[q]; sl+=lum[q]; n++; } }
    hb[y*W+x]=s/n; lb[y*W+x]=sl/n;
  }
  // Sobel → Normal. Relief pro Pixel nach Helligkeit skaliert: DUNKLE Steine flacher
  // (stehen weniger weit hervor), helle Steine kräftiger; Fugen(kanten) bleiben tief.
  const out=c.createImageData(W,H), od=out.data, K=2.6;
  for(let y=0;y<H;y++){ const y0=Math.max(0,y-1)*W, y1=Math.min(H-1,y+1)*W, row=y*W;
    for(let x=0;x<W;x++){
      const x0=Math.max(0,x-1), x1=Math.min(W-1,x+1);
      let gx=(hb[row+x1]-hb[row+x0])*K, gy=(hb[y1+x]-hb[y0+x])*K;
      const nearJoint = jointPx[row+x]||jointPx[row+x0]||jointPx[row+x1]||jointPx[y0+x]||jointPx[y1+x];
      const rf = nearJoint ? 1.0 : (0.28 + 0.9*lb[row+x]);   // dunkler Stein → weniger Relief
      gx*=rf; gy*=rf;
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
  col*=(1.0-0.3*dz)*lit;
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
