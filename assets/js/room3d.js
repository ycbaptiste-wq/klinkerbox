// ===================== KLINKERBOX · 3D-INNENRAUM =====================
// Echter WebGL-Wohnraum für den Innen-Konfigurator: Klinkerwand (hinten +
// rechts), Bodenplatten, Fensterfront mit Vorhang, Sofa, Couchtisch,
// Stehleuchte, Deko. Per Maus/Touch drehbar (Orbit mit Grenzen), Zoom per
// Rad. Environment-Lighting + Soft-Shadows für einen fotonahen Look.
import * as THREE from './three.module.min.js';
import { buildEnv, applySurface, disposeScene, addVignette, LOWQ } from './scene3d-lib.js?v=54';

const MOBILE=LOWQ;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let wallMat=null, wallSideMat=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

// ---------- KAMERA: Stativ statt Orbitkugel ----------
// Vorher hing die Augenhöhe am Zoom (y = TARGET.y + rad·cos(po)) und wanderte über
// den erlaubten Bereich zwischen 0.88 m — Knie, unter der Sitzfläche — und 2.84 m,
// also 16 cm unter der Decke: Puppenstubenblick. Zugleich schaute die Achse 4.1°
// nach unten, was oben ein totes Deckenband von 15 % erzeugte, während der Boden,
// das zweite verkaufte Produkt, unten aus dem Bild fiel.
// Jetzt wie auf dem Stativ: Augpunkt fest auf 1.55 m, optische Achse waagrecht —
// die Senkrechten der Klinkerwand bleiben damit exakt senkrecht. Der Blick nach
// unten kommt nicht aus einer Neigung, sondern aus einem Objektivversatz
// (setViewOffset, Kern-three.js): genau das, was ein Shift-Objektiv in der
// Architekturfotografie macht. Bewegung bleibt vollständig: Drehen, Neigen (jetzt
// als Versatz), Zoomen.
const EYE=1.55;
const TARGET=new THREE.Vector3(0.00,EYE,0.90);
let az=0.02, rad=4.6, shift=0.44;
let azT=az, radT=rad, shiftT=shift;
// R_MIN 3.2 → Kamera 4.10 m vor der Klinkerwand statt 5.29 m: die Wand füllt das
// Bild, statt auf 58 % der Höhe zu schrumpfen. R_MAX 5.8 zusammen mit der
// Azimut-Klemmung unten hält die Kamera in jeder Ecke im Raum.
const R_MIN=3.2, R_MAX=5.8;
const AZ_ABS=0.62, X_LIM=3.05;      // |x| ≤ 3.05 → 15 cm Luft vor der rechten Wand
const SH_MIN=0.16, SH_MAX=0.64;

const ROOM={W:6.4, H:3.0, D:8.4};

// ---------- Geometrie-/Material-Helfer ----------
// weich gerundeter Quader (Kissen, Polster, Lehnen): Unterkante auf y=0
function rbox(w,d,h,rPlan,rBevel){
  const hw=w/2-rPlan, hd=d/2-rPlan;
  const s=new THREE.Shape();
  s.moveTo(-hw,-hd-rPlan);
  s.lineTo(hw,-hd-rPlan); s.absarc(hw,-hd,rPlan,-Math.PI/2,0,false);
  s.lineTo(hw+rPlan,hd);  s.absarc(hw,hd,rPlan,0,Math.PI/2,false);
  s.lineTo(-hw,hd+rPlan); s.absarc(-hw,hd,rPlan,Math.PI/2,Math.PI,false);
  s.lineTo(-hw-rPlan,-hd);s.absarc(-hw,-hd,rPlan,Math.PI,Math.PI*1.5,false);
  const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(0.01,h-2*rBevel),bevelEnabled:true,
    bevelThickness:rBevel,bevelSize:rBevel,bevelSegments:5,curveSegments:8});
  g.rotateX(-Math.PI/2); g.translate(0,rBevel,0);
  g.computeVertexNormals();
  return g;
}
// Kissen. NICHT aus rbox: eine ExtrudeGeometry hat auf Ober- und Unterseite nur
// die Umrisspunkte der Form, dazwischen liegt kein einziger Stützpunkt. Sie kann
// deshalb gar nicht bauchen — jedes damit gebaute Kissen bleibt eine gleich dicke
// Scheibe mit runden Ecken. Hier stattdessen eine Kugel, deren Punkte auf einen
// Superellipsoid gezogen werden: quadratisch im Grundriss, gewölbt in den Flächen,
// an den Ecken von selbst eingezogen — so, wie ein gefülltes Kissen wirklich sitzt.
// Zwei getrennte Exponenten, weil ein Kissen zwei verschiedene Dinge zugleich ist:
//   a  Grundriss — gross = quadratisch mit scharfen Ecken, klein = rund
//   b  Kante     — gross = strammes Polster, klein = weich gefülltes Kissen
// Mit einem einzigen Exponenten bekommt man entweder Quadrate mit harten Kanten
// oder Kreise mit weichen — nie das Kissen dazwischen.
// Die Normalen werden analytisch aus dem Gradienten der Superellipsoid-Gleichung
// gesetzt, nicht mit computeVertexNormals: die Kugel hat an ihrer Längsnaht
// doppelte Punkte, die dort sonst je nur ihre eigene Seite mitteln — quer über
// jedes Kissen liefe eine sichtbare Falte.
function pillowGeo(w,t,d,aPlan,bEdge){
  const g=new THREE.SphereGeometry(0.5,26,18);
  const p=g.attributes.position, a=aPlan||5, b=bEdge||2.8;
  const nrm=new Float32Array(p.count*3);
  const ap=(v,e)=>Math.pow(Math.abs(v),e);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const r=Math.pow(ap(x,a)+ap(z,a),1/a);
    const s=0.5/Math.max(1e-6,Math.pow(Math.pow(r,b)+ap(y,b),1/b));
    p.setXYZ(i,x*s,y*s,z*s);
    // Gradient von (|x|^a+|z|^a)^(b/a) + |y|^b, danach um die Skalierung korrigiert
    let nx,ny,nz;
    if(r<1e-6){ nx=0; ny=y>=0?1:-1; nz=0; }
    else{ const k=Math.pow(r,b-a);
      nx=k*ap(x,a-1)*Math.sign(x); nz=k*ap(z,a-1)*Math.sign(z); ny=ap(y,b-1)*Math.sign(y); }
    nx/=w; ny/=t; nz/=d;
    const L=Math.hypot(nx,ny,nz)||1;
    nrm[i*3]=nx/L; nrm[i*3+1]=ny/L; nrm[i*3+2]=nz/L;
  }
  g.scale(w,t,d); g.translate(0,t/2,0);      // Unterkante auf y=0, wie rbox
  g.setAttribute('normal',new THREE.BufferAttribute(nrm,3));
  return g;
}
function mat(c,rough,metal){ return new THREE.MeshStandardMaterial({color:c,roughness:rough!=null?rough:0.9,metalness:metal||0}); }
// feines Rausch-Bump für Textil (Leinen-Anmutung)
function fabricBump(){
  const cv=document.createElement('canvas'); cv.width=cv.height=256;
  const c=cv.getContext('2d'), id=c.createImageData(256,256);
  for(let i=0;i<id.data.length;i+=4){ const v=118+Math.random()*20; id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255; }
  c.putImageData(id,0,0);
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(6,6);
  return t;
}
// Holz-Maserung (Konsole/Regal)
function woodTex(){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=256;
  const c=cv.getContext('2d');
  c.fillStyle='#5e422c'; c.fillRect(0,0,512,256);
  for(let i=0;i<70;i++){ c.strokeStyle=`rgba(${30+Math.random()*40|0},${18+Math.random()*26|0},${10+Math.random()*16|0},${0.12+Math.random()*0.22})`;
    c.lineWidth=1+Math.random()*2.4; c.beginPath();
    const y=Math.random()*256; c.moveTo(0,y);
    c.bezierCurveTo(170,y+(Math.random()*14-7),340,y+(Math.random()*14-7),512,y+(Math.random()*10-5)); c.stroke(); }
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}
// Travertin: feine Poren und Wolken.
// Der Couchtisch war eine einfarbige helle Fläche ohne jede Karte. Sein
// Schattierungsverlauf lief damit über nur wenige 8-Bit-Stufen, und die wurden als
// Bänder sichtbar — genau die Kante, die der Nutzer auf dem Tisch markiert hat.
// Das ist kein Geometrie- und kein Normalenfehler, sondern Quantisierung: ohne
// Post-Processing gibt es dagegen kein Dithering, wohl aber eine Textur. Eine
// feine Struktur bricht die Stufen auf UND lässt den Tisch wie Stein aussehen
// statt wie lackiertes Plastik.
function stoneTex(){
  const cv=document.createElement('canvas'); cv.width=cv.height=512;
  const c=cv.getContext('2d');
  c.fillStyle='#d8cfc2'; c.fillRect(0,0,512,512);
  for(let i=0;i<26;i++){                       // Wolken
    c.fillStyle='rgba('+(200+Math.random()*40|0)+','+(190+Math.random()*40|0)+',176,0.10)';
    c.beginPath(); c.ellipse(Math.random()*512,Math.random()*512,40+Math.random()*90,
      22+Math.random()*50,Math.random()*3.1,0,7); c.fill();
  }
  const id=c.getImageData(0,0,512,512);        // Poren
  for(let i=0;i<id.data.length;i+=4){ const v=(Math.random()-0.5)*17;
    id.data[i]+=v; id.data[i+1]+=v; id.data[i+2]+=v; }
  c.putImageData(id,0,0);
  for(let i=0;i<260;i++){                      // typische Travertin-Löcher
    c.fillStyle='rgba(150,140,126,'+(0.10+Math.random()*0.16).toFixed(2)+')';
    c.beginPath(); c.ellipse(Math.random()*512,Math.random()*512,1+Math.random()*3.4,
      0.8+Math.random()*1.8,Math.random()*3.1,0,7); c.fill();
  }
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
// weicher runder Kontaktschatten
function shadowBlob(w,d,strength){
  const cv=document.createElement('canvas'); cv.width=256; cv.height=256;
  const c=cv.getContext('2d');
  const g=c.createRadialGradient(128,128,12,128,128,124);
  g.addColorStop(0,'rgba(0,0,0,'+strength+')'); g.addColorStop(0.65,'rgba(0,0,0,'+(strength*0.38)+')'); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.fillRect(0,0,256,256);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false}));
  m.rotation.x=-Math.PI/2; m.renderOrder=1;
  return m;
}

// ---------- Deko-Helfer: Teppich, Sky ----------
// artTex() und framedArt() sind entfallen: auf den beiden Klinkerwänden hängt
// nichts mehr, und andere Wände gibt es nicht — die dritte ist Glas.
// Teppich-Textur (feiner Flor + Bordüre)
function rugTex(){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=384;
  const c=cv.getContext('2d');
  c.fillStyle='#c9bda9'; c.fillRect(0,0,512,384);
  const id=c.getImageData(0,0,512,384);
  for(let i=0;i<id.data.length;i+=4){ const v=(Math.random()-0.5)*16; id.data[i]+=v; id.data[i+1]+=v; id.data[i+2]+=v; }
  c.putImageData(id,0,0);
  c.strokeStyle='rgba(120,104,84,0.55)'; c.lineWidth=10; c.strokeRect(26,26,460,332);
  c.strokeStyle='rgba(150,134,112,0.4)'; c.lineWidth=3; c.strokeRect(44,44,424,296);
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}
// vertikaler Verlauf (Himmel hinter dem Garten)
function skyTex(){
  const cv=document.createElement('canvas'); cv.width=8; cv.height=256;
  const c=cv.getContext('2d'); const g=c.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#aecbe0'); g.addColorStop(0.55,'#d6e2e6'); g.addColorStop(1,'#eef0e9');
  c.fillStyle=g; c.fillRect(0,0,8,256);
  const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; return t;
}
// gefaltete Fläche (Vorhang/Voile) mit vertikalen Falten
function foldGeo(w,h,folds,depth){
  const g=new THREE.PlaneGeometry(w,h,folds*4,1);
  const pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){ const x=pos.getX(i);
    pos.setZ(i, depth*Math.sin(x*folds*Math.PI/(w*0.5)) ); }
  g.computeVertexNormals(); return g;
}

// ---------- Szene ----------
function buildScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xdfe7ea);
  scene.environment=buildEnv(renderer);

  const {W,H,D}=ROOM;
  const bump=fabricBump();
  const woodM=new THREE.MeshStandardMaterial({map:woodTex(),roughness:0.5,envMapIntensity:0.5});
  const brass=r=>new THREE.MeshStandardMaterial({color:0xb08d57,roughness:r!=null?r:0.32,metalness:0.9,envMapIntensity:1.0});
  const blackM=new THREE.MeshStandardMaterial({color:0x25262a,roughness:0.5,metalness:0.35});

  // ---------- LICHT (Tageslicht vom Garten + warme Leuchten) ----------
  // Das Nicht-Sonnen-Budget war so hoch, dass die Sonne nur 0.8:1 dagegen stand —
  // es gab schlicht keinen Sonnenfleck, damit keine Lichtführung und keine Tageszeit.
  // Himmelsfarbe war zudem praktisch neutral (B/R 0.94): Tageslicht durch ein Fenster
  // hat 7000–12000 K und muss sich vom 2600-K-Kunstlicht absetzen können. Die
  // Aufhellung von unten kommt von einer TONPLATTE, ist also warm — das ist die
  // Reflexion, die in einem echten Raum die Unterseiten der Polster einfärbt.
  scene.add(new THREE.HemisphereLight(0xd2e2f4,0xa07354,0.92));
  scene.add(new THREE.AmbientLight(0xffffff,0.09));
  // 4.8 statt 2.15: darüber verliert der Klinker auf der rechten Wand (die zum
  // Fenster schaut, N·L = 0.86) die Farbe, darunter fällt der Wandkontrast unter 3:1.
  // Sonnenhöhe von 22.4° auf 13.1° gesenkt. Bei 22.4° reicht das Licht durch ein
  // 3.00 m hohes Fenster nur bis 0.18 m Höhe an die 6.40 m entfernte rechte Wand —
  // die grösste Produktfläche des Raums stünde also fast vollständig im Schatten.
  // Flach einfallendes Nachmittagslicht kommt tiefer in den Raum und streift dabei
  // beide Wände, statt eine frontal zu treffen und die andere gar nicht.
  const sun=new THREE.DirectionalLight(0xfff1da,6.0);
  sun.position.set(-7,2.4,4.6); sun.target.position.set(1.4,0.3,1.4);
  sun.castShadow=true; sun.shadow.mapSize.set(MOBILE?1024:4096,MOBILE?1024:4096);
  // Etwas weiter als vorher: bei -7/7/-2/5 lag ein Teil der Szene ausserhalb, was
  // die Schattengrenze auf der Wand messbar verschob. 16 m auf 4096 sind immer
  // noch 256 Texel je Meter.
  sun.shadow.camera.left=-8; sun.shadow.camera.right=8; sun.shadow.camera.top=6; sun.shadow.camera.bottom=-3;
  sun.shadow.camera.near=0.5; sun.shadow.camera.far=26; sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.03;
  sun.shadow.radius=MOBILE?1:4;                   // PCF-Kernel → weiche Schattenkante
  scene.add(sun); scene.add(sun.target);
  // Das Fülllicht stand hinten rechts und leuchtete damit von der Wand WEG. Die
  // Glasfront ist mit 25 m² die grösste Lichtöffnung des Raums, wurde aber von
  // keiner Quelle abgebildet: die Fensterseite jedes Möbels war die dunkelste
  // Seite dieses Möbels, obwohl sie direkt vor dem Licht steht. Jetzt kommt es
  // von dort, wo das Fenster ist. Kein castShadow — es füllt nur.
  const fill=new THREE.DirectionalLight(0xe9edf4,0.86);
  fill.position.set(-9,3.0,6.0); fill.target.position.set(0,1.1,3.0);
  scene.add(fill); scene.add(fill.target);
  // Die zwei Wandfluter sind ersatzlos gestrichen. Sie trafen die Klinkerwand mit
  // 50 Grad zur Flächennormale — das ist das Gegenteil von streifend — und leuchteten
  // den Fugenschatten zu, bevor er entstehen konnte: frontal zu streifend stand 3.6:1.
  // Dazu sassen die Emitter 0.60 m neben den sichtbaren Deckenspots, und zwei der vier
  // gezeichneten Leuchten strahlten überhaupt nicht. NUM_SPOT_LIGHTS faellt damit auf
  // 0 und der ganze Spot-Zweig verschwindet aus allen Standardprogrammen.

  // ---------- WÄNDE (hinten + rechts = Klinker) / BODEN / DECKE ----------
  // DoubleSide als Fangnetz: sollte die Kamera je wieder hinter eine der beiden
  // Wände geraten, verschwindet nicht das Produkt, sondern man sieht die Rückseite.
  wallMat=new THREE.MeshStandardMaterial({color:0xd9d5d0,roughness:0.96,side:THREE.DoubleSide});
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(W,H),wallMat);
  wall.position.set(0,H/2,0); wall.receiveShadow=true; scene.add(wall);
  wallSideMat=new THREE.MeshStandardMaterial({color:0xd6d2cc,roughness:0.96,side:THREE.DoubleSide});
  const rw=new THREE.Mesh(new THREE.PlaneGeometry(D,H),wallSideMat);
  rw.rotation.y=-Math.PI/2; rw.position.set(W/2,H/2,D/2); rw.receiveShadow=true; scene.add(rw);
  floorMat=new THREE.MeshStandardMaterial({color:0xd3d0cb,roughness:0.66,envMapIntensity:0.55});
  // Boden auf die RAUMTIEFE begrenzt. Vorher war die Ebene 11.40 m lang, die Textur
  // aber fuer 8.40 m gezeichnet (1600x2100 = 250 px/m). Dadurch lag sie mit 250 px/m
  // in der Breite gegen 184 px/m in der Tiefe — jede Tonplatte wurde 35.7 % zu lang,
  // eine 30x30 erschien als 30x40.7. Das zweite verkaufte Produkt im falschen Format,
  // und es faellt nicht auf, weil der Fehler nur in EINER Richtung wirkt.
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(W,D),floorMat);
  floor.rotation.x=-Math.PI/2; floor.position.set(0,0,D/2); floor.receiveShadow=true; scene.add(floor);
  const ceil=new THREE.Mesh(new THREE.PlaneGeometry(W,D),new THREE.MeshStandardMaterial({color:0xf1efec,roughness:1}));
  // Die Decke MUSS Schatten werfen. Ohne sie steht die Szene unter freiem Himmel:
  // Sonnenlicht traf die rechte Klinkerwand mit N·L = 0.86, obwohl es dorthin durch
  // ein 3.00 m hohes Fenster über 6.40 m Distanz gar nicht gelangen kann. Dieselbe
  // Ware las sich dadurch auf den beiden Wänden 1.46-mal verschieden hell — der
  // Kunde schloss daraus auf zwei verschiedene Produkte, und zwar ausgerechnet an
  // der Innenecke, an der er beurteilen will, wie der Verband umläuft.
  // Gemessen ueber je vier freie Wandstellen: vorher 117 zu 171, jetzt 94 zu 89.
  ceil.rotation.x=Math.PI/2; ceil.position.set(0,H,D/2); ceil.castShadow=true; scene.add(ceil);

  // ---------- KANTENVERSCHATTUNG ----------
  // Ohne Addon gibt es kein SSAO, und die aoMap aus surfaceMaps verschattet nur die
  // Fugen INNERHALB der Produkttextur — die Raumkanten selbst bekommen gar nichts.
  // Die Klinkerwand trifft ohne jeden Übergang auf den Boden. Verschärft wird das
  // durch das IBL: buildEnv liefert eine volle Himmelskugel ohne Verdeckungsrechnung,
  // der Boden bekommt also Himmelslicht DURCH die Decke. Genau in den Ecken, wo real
  // fast kein Licht hinkommt, ist das Fülllicht am stärksten überschätzt — das ist
  // der Hauptgrund, warum der Raum flach wirkt, obwohl die Materialien stimmen.
  // Also gebacken statt gerechnet: ein Verlauf von Schwarz nach Transparent, der
  // dem Lichtabfall einer diffusen Kavität folgt. Drei Draw-Calls.
  // dir gibt die undurchsichtige KANTE DER EBENE an (u/o/l/r) — so kommt jede Fläche
  // mit höchstens einer Drehung aus. Canvas-x ist u, Canvas-y wird durch flipY zu v.
  const kanteTex=(a0,dir)=>{
    const horiz=(dir==='l'||dir==='r');
    const cv=document.createElement('canvas'); cv.width=horiz?128:4; cv.height=horiz?4:128;
    const c=cv.getContext('2d');
    const p={u:[0,128,0,0], o:[0,0,0,128], l:[0,0,128,0], r:[128,0,0,0]}[dir];
    const g=c.createLinearGradient(p[0],p[1],p[2],p[3]);
    g.addColorStop(0,'rgba(24,20,16,'+a0+')');
    g.addColorStop(0.35,'rgba(24,20,16,'+(a0*0.34).toFixed(3)+')');
    g.addColorStop(1,'rgba(24,20,16,0)');
    c.fillStyle=g; c.fillRect(0,0,cv.width,cv.height);
    return new THREE.CanvasTexture(cv);
  };
  const kante=(w,h,a0,dir)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({map:kanteTex(a0,dir),transparent:true,depthWrite:false}));
    m.renderOrder=2; scene.add(m); return m;
  };
  // Wandfuss (0.40 m), Deckenkehle (0.25 m), Innenecke (0.35 m) — je an beiden Wänden
  kante(W,0.40,0.30,'u').position.set(0,0.20,0.012);
  kante(W,0.25,0.14,'o').position.set(0,H-0.125,0.012);
  kante(0.35,H,0.22,'r').position.set(W/2-0.175,H/2,0.014);
  { const b=kante(D,0.40,0.30,'u'); b.rotation.y=-Math.PI/2; b.position.set(W/2-0.012,0.20,D/2);
    const c2=kante(D,0.25,0.14,'o'); c2.rotation.y=-Math.PI/2; c2.position.set(W/2-0.012,H-0.125,D/2);
    const e2=kante(0.35,H,0.22,'l'); e2.rotation.y=-Math.PI/2; e2.position.set(W/2-0.014,H/2,0.175); }
  // Decken-Einbauspots (leuchten dezent)
  [[-1.5,1.3],[1.3,1.3],[-1.5,3.9],[1.3,3.9]].forEach(([x,z])=>{
    const ring=new THREE.Mesh(new THREE.CircleGeometry(0.065,20),blackM); ring.rotation.x=Math.PI/2; ring.position.set(x,H-0.006,z); scene.add(ring);
    const em=new THREE.Mesh(new THREE.CircleGeometry(0.048,18),new THREE.MeshStandardMaterial({color:0xfff0d4,emissive:0xffe4b4,emissiveIntensity:2.4}));
    em.rotation.x=Math.PI/2; em.position.set(x,H-0.005,z); scene.add(em);
  });

  // ---------- GARTEN hinter der Fensterfront (x < -W/2) ----------
  const gx=-W/2;
  const sky=new THREE.Mesh(new THREE.PlaneGeometry(34,18),new THREE.MeshBasicMaterial({map:skyTex()}));
  sky.rotation.y=Math.PI/2; sky.position.set(gx-13,4,D/2); scene.add(sky);
  const glawn=new THREE.Mesh(new THREE.PlaneGeometry(40,30),new THREE.MeshStandardMaterial({color:0x7e9060,roughness:1}));
  glawn.rotation.x=-Math.PI/2; glawn.position.set(gx-20.5,-0.06,D/2); scene.add(glawn);  // beginnt erst hinter dem Fenster
  const terr=new THREE.Mesh(new THREE.PlaneGeometry(1.7,D+5),new THREE.MeshStandardMaterial({color:0xbcb7af,roughness:0.9}));
  terr.rotation.x=-Math.PI/2; terr.position.set(gx-0.85,0.008,D/2); scene.add(terr);
  const ghedge=new THREE.Mesh(new THREE.BoxGeometry(0.7,1.15,18),new THREE.MeshStandardMaterial({color:0x556b3f,roughness:1}));
  ghedge.position.set(gx-4.3,0.57,D/2); scene.add(ghedge);
  [[-3.4,1.0,0.6,0x63784a],[-4.2,5.6,0.72,0x5a7043],[-3.1,7.6,0.5,0x6b7f52],[-4.7,-0.8,0.62,0x5f7548],[-3.0,3.4,0.5,0x6c8150]].forEach(([xx,zz,r,col])=>{
    const b=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),new THREE.MeshStandardMaterial({color:col,roughness:1}));
    b.position.set(gx+xx,r*0.75,zz); scene.add(b);
  });
  [[-7.5,1.0],[-9,6.8],[-9.5,-1.2]].forEach(([xx,zz])=>{
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,1.8,8),mat(0x6a5238,1)); tr.position.set(gx+xx,0.9,zz); scene.add(tr);
    const fo=new THREE.Mesh(new THREE.IcosahedronGeometry(1.5,1),new THREE.MeshStandardMaterial({color:0x5f7448,roughness:1})); fo.scale.set(1,1.2,1); fo.position.set(gx+xx,2.65,zz); scene.add(fo);
  });

  // ---------- FENSTERFRONT: Rahmen + Glas + Gardinenstange + Voile + Leinen-Vorhänge ----------
  const frameM=mat(0x3f4348,0.4,0.5);
  // Die Pfosten werfen jetzt Schatten. Eine 8.4 m breite, raumhohe Glasfront ohne
  // jede Unterbrechung beleuchtet gleichmässig — es entsteht kein einziger
  // Lichtwechsel im Bild. Die fünf Pfosten legen genau die weichen Lichtbänder über
  // Boden und Wand, an denen eine Innenaufnahme als Innenaufnahme lesbar wird.
  for(let z=0.06; z<=D; z+=2.08){ const m=new THREE.Mesh(new THREE.BoxGeometry(0.08,H,0.06),frameM);
    m.position.set(gx,H/2,Math.min(z,D-0.04)); m.castShadow=true; scene.add(m); }
  const railT=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,D),frameM); railT.position.set(gx,H-0.04,D/2); scene.add(railT);
  const railB=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.06,D),frameM); railB.position.set(gx,0.03,D/2); scene.add(railB);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(D,H),
    new THREE.MeshPhysicalMaterial({color:0xdfe8ec,transparent:true,opacity:0.07,roughness:0.03,metalness:0,envMapIntensity:1.2}));
  glass.rotation.y=Math.PI/2; glass.position.set(gx,H/2,D/2); scene.add(glass);
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,D-0.1,12),brass(0.35));
  rod.rotation.x=Math.PI/2; rod.position.set(gx+0.22,H-0.11,D/2); scene.add(rod);
  const voile=new THREE.Mesh(foldGeo(D-0.25,H-0.2,24,0.045),
    new THREE.MeshStandardMaterial({color:0xf3f0ea,transparent:true,opacity:0.32,roughness:1,side:THREE.DoubleSide}));
  voile.rotation.y=Math.PI/2; voile.position.set(gx+0.12,(H-0.2)/2+0.02,D/2); scene.add(voile);
  // Die Vorhangbahnen sind nach hinten gewandert. Ein Sonnenstrahl, der die
  // Rückwand bei x trifft, durchquert die Glasebene bei z = (x+3.2)·0.381 — für die
  // ganze Rückwand also im Streifen z = 0.00 bis 2.44. Genau dort stand die erste
  // Bahn und legte die Produktwand auf Augenhöhe von x=-3.20 bis x=-0.45 in den
  // Schatten: 2.75 m von 6.40 m, 43 % der Wand, als harte Diagonale. Bei z=5.60 und
  // 7.60 trifft ihr Lichtkorridor die rechte Wand erst ab z=2.67 und damit
  // ausserhalb des sichtbaren Abschnitts. Der Voile wirft ohnehin keinen Schatten.
  const drapeM=new THREE.MeshStandardMaterial({color:0xc8bda8,roughness:1,bumpMap:bump,bumpScale:0.3,side:THREE.DoubleSide});
  [5.60,7.60].forEach(z=>{
    const dr=new THREE.Mesh(foldGeo(1.0,H-0.14,7,0.05),drapeM);
    dr.rotation.y=Math.PI/2; dr.position.set(gx+0.20,(H-0.14)/2+0.02,z); dr.castShadow=true; scene.add(dr);
  });

  // ---------- TEPPICH ----------
  // Der Teppich lag mit 8.50 m² über 32 % des sichtbaren Bodenprodukts und hielt
  // dabei nichts: der Couchtisch stand darauf, das Sofa mit 7 cm Überlappung
  // praktisch daneben. Jetzt 4.94 m², mittig, und er fasst Tisch und Sofafront
  // wirklich zusammen. Vor der Klinkerwand bleibt ein durchgehendes Band
  // unverstellter Tonplatte von 1.20 m über die vollen 6.40 m.
  const rug=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.9),
    new THREE.MeshStandardMaterial({map:rugTex(),roughness:0.98}));
  rug.rotation.x=-Math.PI/2; rug.position.set(-0.25,0.006,2.45); rug.receiveShadow=true; scene.add(rug);

  // ---------- SOFA ----------
  const sofa=new THREE.Group();
  const fabric=new THREE.MeshStandardMaterial({color:0xd3bf98,roughness:0.94,bumpMap:bump,bumpScale:0.25});     // Beige-Creme
  const fabricLite=new THREE.MeshStandardMaterial({color:0xdecaa6,roughness:0.94,bumpMap:bump,bumpScale:0.25});
  // Sitzhöhe war 0.555 m — 12 cm über jedem realen Sofa. Alle Höhen sind
  // entsprechend abgesenkt: Sitz 0.44, Rückenoberkante 0.82, Armlehne 0.56.
  const SW=2.60, SD=0.95;
  const base=new THREE.Mesh(rbox(SW,SD,0.20,0.06,0.03),fabric);
  base.position.y=0.10; base.castShadow=true; base.receiveShadow=true; sofa.add(base);
  [[-SW/2+0.16,-SD/2+0.10],[SW/2-0.16,-SD/2+0.10],[-SW/2+0.16,SD/2-0.10],[SW/2-0.16,SD/2-0.10]].forEach(([x,z])=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.019,0.10,16),brass(0.4));
    leg.position.set(x,0.05,z); leg.castShadow=true; sofa.add(leg);
  });
  // Sitz- und Rückenpolster jetzt als gewölbte Kissen. P=3.6 hält sie noch
  // deutlich rechteckig — ein Sitzpolster ist strammer gefüllt als ein Zierkissen.
  // Die Kissen standen bei 0.845 Abstand und 0.84/0.85 Breite praktisch auf Stoss.
  // Ein Superellipsoid zieht sich zu den Kanten hin aber ein — zwischen zwei
  // Nachbarn oeffnete sich dadurch ein linsenfoermiger Spalt, der nach oben und
  // unten breiter wird, und dahinter sah man auf den dunklen Sofakoerper. Genau
  // die zwei Stellen hat der Nutzer markiert. 0.89 statt 0.84 bei gleichem Abstand
  // gibt 4.5 cm Ueberdeckung: die eingezogenen Kanten schieben sich ineinander,
  // wie bei echten Polstern, die aneinander gedrueckt sind.
  for(let i=-1;i<=1;i++){
    const c=new THREE.Mesh(pillowGeo(0.89,0.15,0.86,6,3.4),fabricLite);
    c.position.set(i*0.845,0.30,0.02); c.castShadow=true; c.receiveShadow=true; sofa.add(c);
  }
  for(let i=-1;i<=1;i++){
    const b=new THREE.Mesh(pillowGeo(0.90,0.20,0.52,5,3.2),fabricLite);
    b.rotation.x=-1.45; b.position.set(i*0.845,0.55,-SD/2+0.20); b.castShadow=true; b.receiveShadow=true; sofa.add(b);
  }
  [-1,1].forEach(s=>{
    const a=new THREE.Mesh(rbox(0.22,SD,0.36,0.05,0.05),fabric);
    a.position.set(s*(SW/2+0.02),0.20,0); a.castShadow=true; a.receiveShadow=true; sofa.add(a);
  });
  // Zierkissen: P=2.7, also deutlich weicher als die Polster — die Ecken ziehen
  // sich ein, die Fläche wölbt sich. Vorher waren es 15 mm dicke Scheiben mit
  // 13 cm Eckradius: zwei Toastscheiben, die an der Lehne lehnten.
  const pilA=new THREE.Mesh(pillowGeo(0.46,0.16,0.46,4,2.6),
    new THREE.MeshStandardMaterial({color:0xb26e52,roughness:0.92,bumpMap:bump,bumpScale:0.3}));
  pilA.rotation.set(-1.42,0,0.06); pilA.position.set(-0.86,0.55,-SD/2+0.28); pilA.castShadow=true; sofa.add(pilA);
  const pilB=new THREE.Mesh(pillowGeo(0.42,0.15,0.42,4,2.6),
    new THREE.MeshStandardMaterial({color:0x8b98a0,roughness:0.92,bumpMap:bump,bumpScale:0.3}));
  pilB.rotation.set(-1.40,0,-0.05); pilB.position.set(0.90,0.54,-SD/2+0.30); pilB.castShadow=true; sofa.add(pilB);
  // Die beiden Wolldecken-Teile sind gestrichen. Eine Decke über der Armlehne
  // braucht echten Fall; als 55 mm dicke Platte auf der Lehne las sie sich als
  // weisses Tablett — der auffälligste Fremdkörper im ganzen Sofa.
  // Das Sofa löschte ein 2.72 m breites Band der Produktwand bis 1.03 m Höhe —
  // 16 % der Wand, an der teuersten Stelle des Raums. Ursache war die Rückenhöhe
  // von 1.06 m, nicht der Standort: mit den korrigierten 0.82 m und 0.90 m mehr
  // Wandabstand fällt die verdeckte Fläche auf rund 1.8 m². (Umdrehen wäre der
  // Lehrbuchgriff, kostet bei dieser Kameradistanz aber Boden UND Couchtisch —
  // der 2.60-m-Rücken steht dann 2.2 m vor der Linse und füllt das halbe Bild.)
  sofa.position.set(-0.25,0,1.35); scene.add(sofa);
  const sofaShadow=shadowBlob(SW+0.55,SD+0.5,0.34); sofaShadow.position.set(-0.25,0.004,1.35); scene.add(sofaShadow);

  // ---------- LOUNGE-SESSEL (rechts vorne, zum Sofa gedreht) ----------
  const chair=new THREE.Group();
  const cFab=new THREE.MeshStandardMaterial({color:0xd7c9b5,roughness:0.95,bumpMap:bump,bumpScale:0.25});
  const cSeat=new THREE.Mesh(rbox(0.72,0.70,0.16,0.08,0.05),cFab); cSeat.position.y=0.42; cSeat.castShadow=true; cSeat.receiveShadow=true; chair.add(cSeat);
  const cCush=new THREE.Mesh(rbox(0.62,0.60,0.13,0.10,0.06),new THREE.MeshStandardMaterial({color:0xe3d7c4,roughness:0.95,bumpMap:bump,bumpScale:0.25}));
  cCush.position.set(0,0.55,0.02); cCush.castShadow=true; chair.add(cCush);
  const cBack=new THREE.Mesh(rbox(0.72,0.16,0.60,0.08,0.05),cFab); cBack.position.set(0,0.64,-0.30); cBack.castShadow=true; chair.add(cBack);
  [-1,1].forEach(s=>{ const ar=new THREE.Mesh(rbox(0.13,0.64,0.28,0.05,0.04),cFab); ar.position.set(s*0.37,0.5,0.02); ar.castShadow=true; chair.add(ar); });
  // Beine bis in den Sitzkorb (0.44 hoch, Korb-Unterkante 0.42) — sonst schwebt der Sessel
  [[-0.30,-0.28],[0.30,-0.28],[-0.30,0.28],[0.30,0.28]].forEach(([x,z])=>{ const lg=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.016,0.44,10),woodM); lg.position.set(x,0.22,z); lg.castShadow=true; chair.add(lg); });
  chair.position.set(2.05,0,3.45); chair.rotation.y=-2.2; scene.add(chair);   // zum Couchtisch gedreht
  const chShadow=shadowBlob(1.1,1.1,0.3); chShadow.position.set(2.05,0.004,3.45); scene.add(chShadow);

  // ---------- COUCHTISCH (Travertin) + Deko: Tablett, Kerzen, Bücher, Schale ----------
  // Tisch samt Deko wandert als Gruppe um (+0.40 | -1.20) auf die Sofa-Achse und
  // zwischen Sofa und Wand. Die Einzelteile behalten ihre gewachsenen Koordinaten
  // zueinander — nur die Gruppe wird versetzt.
  const cofG=new THREE.Group(); cofG.position.set(0.15,0,-0.15); scene.add(cofG);
  // 64 statt 48 Segmente: der Tisch steht 1.4 m vor der Linse und ist mit 0.92 m
  // Durchmesser das groesste einfarbige Objekt im Bild — bei 48 Segmenten sind die
  // Facetten am Rand einzeln abzaehlbar. Dazu die Travertin-Karte, die das Banding
  // im Verlauf aufbricht (siehe stoneTex).
  const travT=stoneTex(); travT.repeat.set(2,1);
  const travB=stoneTex(); travB.repeat.set(2,1);
  const table=new THREE.Mesh(new THREE.CylinderGeometry(0.46,0.46,0.34,64),
    new THREE.MeshStandardMaterial({map:travT,bumpMap:travB,bumpScale:0.06,
      roughness:0.62,envMapIntensity:0.55}));
  table.position.set(-0.4,0.17,2.7); table.castShadow=true; table.receiveShadow=true; cofG.add(table);
  const tShadow=shadowBlob(1.4,1.4,0.3); tShadow.position.set(-0.4,0.0045,2.7); cofG.add(tShadow);
  [[0x7c4436,0.30],[0x33404a,0.27]].forEach(([c,wd],i)=>{
    const b=new THREE.Mesh(new THREE.BoxGeometry(wd,0.03,wd-0.06),mat(c,0.7));
    b.position.set(-0.55,0.34+0.033+i*0.032,2.58); b.rotation.y=0.3-i*0.4; b.castShadow=true; cofG.add(b);
  });
  // Die Schale hatte kein Innen. Das Lathe-Profil lief von der Mitte nach aussen
  // und hoerte am Rand auf — die Drehflaeche war damit einseitig, man sah von oben
  // durch sie hindurch auf die Tischplatte, und weil FrontSide von innen wegge-
  // cullt wird, blieb ein schwarzer Klecks. Jetzt laeuft das Profil ueber den Rand
  // und innen wieder hinunter: dadurch entsteht eine echte Wandstaerke von 4 mm,
  // der Rand faengt Licht und die Schale liest sich als Schale.
  const bowlPts=[[0.002,0],[0.062,0.004],[0.098,0.038],[0.108,0.082],   // aussen hoch
                 [0.104,0.086],                                          // Rand
                 [0.094,0.080],[0.086,0.040],[0.050,0.010],[0.002,0.008]] // innen zurueck
    .map(([r,y])=>new THREE.Vector2(r,y));
  const bowl=new THREE.Mesh(new THREE.LatheGeometry(bowlPts,30),
    new THREE.MeshStandardMaterial({color:0x27292c,roughness:0.5,metalness:0.2,side:THREE.DoubleSide}));
  bowl.position.set(-0.2,0.34,2.86); bowl.castShadow=true; cofG.add(bowl);
  const tray=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.02,0.22),brass(0.4));
  tray.position.set(-0.5,0.35,2.82); tray.castShadow=true; cofG.add(tray);
  [[-0.6,0.05],[-0.5,-0.02],[-0.42,0.04]].forEach(([x,dz],i)=>{               // Kerzen
    const cd=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.028,0.10+i*0.03,16),mat(0xefe6d6,0.7));
    cd.position.set(x,0.40+ (0.05+i*0.015),2.82+dz); cd.castShadow=true; cofG.add(cd);
    const fl=new THREE.Mesh(new THREE.SphereGeometry(0.012,8,8),new THREE.MeshStandardMaterial({color:0xffdf9e,emissive:0xffb347,emissiveIntensity:3}));
    fl.scale.set(1,1.7,1); fl.position.set(x,0.40+(0.11+i*0.03),2.82+dz); cofG.add(fl);
  });

  // ---------- SIDEBOARD (rechts an der Klinkerwand) — ersetzt die schiefe Konsole ----------
  const sb=new THREE.Group();
  const sbBody=new THREE.Mesh(rbox(1.6,0.46,0.44,0.03,0.02),woodM);
  sbBody.position.y=0.16; sbBody.castShadow=true; sbBody.receiveShadow=true; sb.add(sbBody);
  [[-0.72,-0.17],[0.72,-0.17],[-0.72,0.17],[0.72,0.17]].forEach(([x,z])=>{
    const lg=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.014,0.17,10),brass(0.4)); lg.position.set(x,0.085,z); lg.castShadow=true; sb.add(lg);
  });
  [-0.4,0.4].forEach(x=>{                                                     // Türfugen + Griffe
    const groove=new THREE.Mesh(new THREE.BoxGeometry(0.008,0.34,0.006),mat(0x2a2016,0.6)); groove.position.set(x,0.38,0.231); sb.add(groove);
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.008,0.12,10),brass(0.35)); handle.rotation.x=Math.PI/2; handle.position.set(x+(x<0?0.12:-0.12),0.38,0.235); sb.add(handle);
  });
  sb.position.set(2.0,0,0.4); scene.add(sb);
  const sbShadow=shadowBlob(2.0,0.9,0.3); sbShadow.position.set(2.0,0.004,0.4); scene.add(sbShadow);
  // Tischlampe auf dem Sideboard (leuchtet)
  // Der Schirm war ein OFFENER Zylinder (openEnded), man sah oben in ihn hinein
  // und durch ihn hindurch — es fehlten Deckel und Fassung, und der Fuss war ein
  // blosser Kegelstumpf ohne Absatz. Jetzt Teller, Schaft, Absatz, geschlossene
  // Schirmoberseite mit sichtbarer Fassung. Masse einer echten Tischleuchte:
  // Schirm 0.30 m Durchmesser, Gesamthoehe 0.50 m ueber der Sideboardplatte (0.60).
  { const LX=1.5, LZ=0.4, LY=0.60;                       // Standflaeche = Sideboard-Oberkante
    const messing=new THREE.MeshStandardMaterial({color:0xb08d57,roughness:0.35,metalness:0.9,envMapIntensity:1.0});
    const teller=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.085,0.018,24),messing);
    teller.position.set(LX,LY+0.009,LZ); teller.castShadow=true; scene.add(teller);
    const schaft=new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.030,0.235,20),messing);
    schaft.position.set(LX,LY+0.135,LZ); schaft.castShadow=true; scene.add(schaft);
    const fassung=new THREE.Mesh(new THREE.CylinderGeometry(0.030,0.030,0.045,16),
      new THREE.MeshStandardMaterial({color:0x6f6a63,roughness:0.55,metalness:0.4}));
    fassung.position.set(LX,LY+0.275,LZ); scene.add(fassung);
    // Schirmmantel: nach unten weiter, wie ein gespannter Stoffschirm
    const tlShade=new THREE.Mesh(new THREE.CylinderGeometry(0.105,0.150,0.185,28,1,true),
      new THREE.MeshStandardMaterial({color:0xf3ead8,emissive:0xffe1a8,emissiveIntensity:1.7,
        roughness:0.9,side:THREE.DoubleSide}));
    tlShade.position.set(LX,LY+0.345,LZ); tlShade.castShadow=true; scene.add(tlShade);
    // Deckel: ohne ihn schaut man von oben in die Leuchte hinein
    const deckel=new THREE.Mesh(new THREE.RingGeometry(0.031,0.105,28),
      new THREE.MeshStandardMaterial({color:0xe7dcc6,roughness:0.9,side:THREE.DoubleSide}));
    deckel.rotation.x=-Math.PI/2; deckel.position.set(LX,LY+0.4375,LZ); scene.add(deckel);
    const tlGlow=new THREE.Mesh(new THREE.CircleGeometry(0.14,24),new THREE.MeshBasicMaterial({color:0xffe9c4}));
    tlGlow.rotation.x=Math.PI/2; tlGlow.position.set(LX,LY+0.254,LZ); scene.add(tlGlow); }
  // Die Tischlampe stand 0.50 m vor der Klinkerwand und lieferte dort das 25-fache
  // der Sonne — ein weisses Loch von 242/255 ueber rund 0.6 m Radius, in dem weder
  // Stein noch Fuge noch Farbe lesbar waren. Der einzige Punkt der Szene, an dem das
  // verkaufte Produkt vollstaendig verschwand. Jetzt an der Sideboard-Vorderkante und
  // so stark, dass ihr Lichtabfall die Wand ZEICHNET, statt sie auszuloeschen.
  const tlLight=new THREE.PointLight(0xffdca0,0.8,2.6,2); tlLight.position.set(1.5,1.0,0.92); scene.add(tlLight);
  // Deko auf dem Sideboard: Bücherstapel + Skulptur + Vase
  [[0x6e5a43,0.30],[0x394049,0.27]].forEach(([c,wd],i)=>{
    const bk=new THREE.Mesh(new THREE.BoxGeometry(wd,0.035,0.20),mat(c,0.7)); bk.position.set(2.45,0.55+0.02+i*0.037,0.42); bk.rotation.y=0.1; bk.castShadow=true; scene.add(bk);
  });
  // Die Skulptur war ein HALBER Torus (Bogenwinkel PI), der auf seinen beiden
  // offenen Schnittflaechen stand — von der Kamera aus zwei Rohrenden, die auf dem
  // Sideboard aufsetzen, ohne dass etwas sie haelt. Jetzt ein geschlossener Ring
  // auf einem Sockel: dieselbe Formidee, aber ein Gegenstand, den es geben kann.
  { const SX=2.62, SZ=0.42, SY=0.60;                     // Sideboard-Oberkante
    const stein=new THREE.MeshStandardMaterial({color:0x2b2c2f,roughness:0.5,metalness:0.2});
    const sockel=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.022,0.09),stein);
    sockel.position.set(SX,SY+0.011,SZ); sockel.castShadow=true; scene.add(sockel);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.082,0.016,14,36),stein);
    ring.position.set(SX,SY+0.104,SZ); ring.rotation.y=0.22; ring.castShadow=true; scene.add(ring); }
  const svase=new THREE.Mesh(new THREE.LatheGeometry(
    [[0.001,0],[0.06,0.01],[0.085,0.06],[0.05,0.14],[0.055,0.17]].map(([r,y])=>new THREE.Vector2(r,y)),24),mat(0xb8ada0,0.8));
  svase.position.set(2.15,0.55,0.4); scene.add(svase);

  // ---------- BEISTELLTISCH links neben dem Sofa ----------
  const stTop=new THREE.Mesh(new THREE.CylinderGeometry(0.23,0.23,0.04,28),mat(0xd8cfc2,0.6,0.1));
  stTop.position.set(-2.15,0.5,0.7); stTop.castShadow=true; scene.add(stTop);
  const stLeg=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.5,10),blackM); stLeg.position.set(-2.15,0.25,0.7); scene.add(stLeg);
  const stFoot=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,0.02,20),blackM); stFoot.position.set(-2.15,0.01,0.7); scene.add(stFoot);
  const stBook=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.03,0.17),mat(0x7c4436,0.7)); stBook.position.set(-2.15,0.535,0.7); stBook.rotation.y=0.2; scene.add(stBook);

  // ---------- ZIMMERBAUM (Olive) in der hinteren linken Ecke (dezent) ----------
  // kompakt und von der Fensterfront weggerückt: Vorhang-Falten reichen bis
  // x ≈ -2.92 — die Krone (linkeste Kugel: PX-0.31) muss davor enden
  const PX=-2.45, PZ=0.30;
  const tree=new THREE.Group(); tree.position.set(PX,0,PZ); scene.add(tree);
  const gpot=new THREE.Mesh(new THREE.CylinderGeometry(0.20,0.165,0.36,24),
    new THREE.MeshStandardMaterial({color:0xb9b1a4,roughness:0.9,bumpMap:bump,bumpScale:0.2}));
  gpot.position.y=0.18; gpot.castShadow=true; tree.add(gpot);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.035,0.85,8),mat(0x7a6a52,0.9));
  trunk.position.y=0.76; tree.add(trunk);
  const leafM=new THREE.MeshStandardMaterial({color:0x5c7248,roughness:1});
  [[0,1.28,0,0.21],[-0.16,1.22,0.10,0.15],[0.16,1.23,-0.08,0.16],[0.04,1.41,0.04,0.18],[-0.10,1.38,-0.11,0.14],
   [0.13,1.38,0.11,0.14],[-0.04,1.51,-0.02,0.14],[0.08,1.13,0.13,0.13],[-0.14,1.47,0.08,0.12]].forEach(([dx,y,dz,r])=>{
    const lf=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),leafM);
    lf.position.set(dx,y,dz); lf.scale.set(1,1.08,1); lf.castShadow=true; tree.add(lf);
  });
  const gpShadow=shadowBlob(0.7,0.7,0.26); gpShadow.position.set(PX,0.004,PZ); scene.add(gpShadow);

  // ---------- STEHLEUCHTE (rechts, leuchtet) ----------
  // Die ganze Leuchte rückt mit, nicht nur ihr Emitter: eine Lichtquelle, die
  // 0.60 m neben der gezeichneten Leuchte sitzt, ist genau der Fehler, an dem die
  // beiden gestrichenen Wandfluter gescheitert sind.
  const lampBase=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.16,0.02,32),blackM); lampBase.position.set(2.30,0.01,1.85); scene.add(lampBase);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,1.55,12),blackM); pole.position.set(2.30,0.79,1.85); pole.castShadow=true; scene.add(pole);
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,0.25,32,1,true),
    new THREE.MeshStandardMaterial({color:0xf1e7d5,emissive:0xffe0a4,emissiveIntensity:1.6,roughness:0.85,side:THREE.DoubleSide}));
  shade.position.set(2.30,1.6,1.85); scene.add(shade);
  const glow=new THREE.Mesh(new THREE.CircleGeometry(0.16,24),new THREE.MeshBasicMaterial({color:0xffe4b4}));
  glow.rotation.x=Math.PI/2; glow.position.set(2.30,1.49,1.85); scene.add(glow);
  // Stand 0.45 m vor der rechten Klinkerwand und lieferte dort das 12-fache des
  // Tageslichts — die Fläche kippte ins Weisse, genau dort, wo die Kamera am
  // nächsten herankommt. Jetzt 1.05 m Abstand und ein Sechstel der Menge.
  const lampLight=new THREE.PointLight(0xffd9a0,1.2,3.8,2); lampLight.position.set(2.30,1.42,1.85); scene.add(lampLight);
  const lShadow=shadowBlob(0.7,0.7,0.22); lShadow.position.set(2.30,0.005,1.85); scene.add(lShadow);

  // ---------- KEINE PENDELLEUCHTE, KEINE WANDKUNST, KEIN SPIEGEL ----------
  // Gestrichen: Pendelleuchte samt PointLight (-0.40 | 1.78 | 2.70), Bild artA
  // (1.70 x 0.82 bei y 1.67-2.49), Bild artB an der rechten Wand und der Spiegel
  // (y 1.40-2.20). Zusammen mit dem Sofa verdeckten sie 41 % der Rückwand, und
  // zwar genau im Augenband 1.20 bis 2.50 m — dort also, wo der Kunde Verband,
  // Mischung und Fugenfarbe liest. Der Spiegel las sich ohnehin nur als graue
  // Scheibe: roughness 0.05 und metalness 0.7 ohne echte Reflexionssonde spiegeln
  // nur die flache Env-Map.
  // Regel für alles Weitere: zwischen y = 1.20 und y = 3.00 hängt auf beiden
  // Klinkerwänden nichts, über die volle Breite. Die Wand IST das Produkt.

  camera=new THREE.PerspectiveCamera(48,16/10,0.1,60);
  applyCam(true);
}

function applyCam(hard){
  const k=hard?1:0.12;
  rad+=(radT-rad)*k;
  // Azimut so klemmen, dass die Kamera bei JEDEM Radius im Raum bleibt. Vorher
  // stand sie ab rad 4.90 hinter der rechten Klinkerwand — die ist FrontSide, wurde
  // also weggecullt: das Produkt war schlicht verschwunden, der Kunde sah eine
  // offene Schachtel. Nach links lief sie bis 2.14 m hinaus auf den Rasen.
  const lim=Math.min(AZ_ABS,Math.asin(Math.min(1,X_LIM/Math.max(0.01,rad))));
  azT=Math.min(lim,Math.max(-lim,azT));
  az+=(azT-az)*k; shift+=(shiftT-shift)*k;
  // po ist entfallen: die Kamera steht auf Augenhöhe und schaut waagrecht.
  camera.position.set(TARGET.x+rad*Math.sin(az),EYE,TARGET.z+rad*Math.cos(az));
  camera.lookAt(TARGET.x,EYE,TARGET.z);
  applyLens();
}

// Objektivversatz statt Neigung. Wir rendern ein Fenster von vpW × vpH aus einem
// virtuellen Sensor vpW × fullH und schieben es nach unten. Die waagrechte
// Bildbreite bleibt dabei exakt die, die fovEff ohne Versatz ergäbe.
let vpW=0, vpH=0;
const SENSOR=0.68;                  // Anteil des virtuellen Sensors, den wir zeigen
function applyLens(){
  if(!camera||!vpW||!vpH) return;
  const a=vpW/vpH;
  const fovEff=(a>1.45)?48:(a>1.1?54:60);
  const fullH=Math.max(2,Math.round(vpH/SENSOR));
  camera.fov=Math.atan(Math.tan(fovEff*Math.PI/360)/SENSOR)*360/Math.PI;
  camera.aspect=vpW/fullH;
  camera.setViewOffset(vpW,fullH,0,Math.round(fullH/2-(vpH/2)*(1-shift)),vpW,vpH);
  camera.updateProjectionMatrix();
}

// ---------- Renderer / API ----------
function ensureRenderer(){
  if(renderer||failed) return !failed;
  try{
    renderer=new THREE.WebGLRenderer({antialias:!MOBILE});
    renderer.shadowMap.enabled=true;
    // PCF statt PCFSoft: nur PCF wertet shadow.radius aus → steuerbare Weichheit
    renderer.shadowMap.type=MOBILE?THREE.BasicShadowMap:THREE.PCFShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.06;
    maxAniso=renderer.capabilities.getMaxAnisotropy()||8;
    buildScene();
    const el=renderer.domElement;
    el.addEventListener('webglcontextlost',e=>e.preventDefault());   // iOS: schwarzer Canvas vermeiden
    el.style.cssText='width:100%;height:100%;display:block;border-radius:inherit;cursor:grab;touch-action:none';
    // Orbit: ziehen = drehen · Rad = zoomen (mit Grenzen)
    let drag=false,lx=0,ly=0;
    el.addEventListener('pointerdown',e=>{ drag=true; lx=e.clientX; ly=e.clientY;
      el.setPointerCapture(e.pointerId); el.style.cursor='grabbing'; });
    el.addEventListener('pointermove',e=>{ if(!drag) return;
      azT=Math.min(AZ_ABS,Math.max(-AZ_ABS,azT-(e.clientX-lx)*0.0042));
      // Senkrecht ziehen neigt die Kamera nicht mehr, sondern verschiebt das
      // Objektiv — der Blick wandert hoch und runter, die Senkrechten bleiben
      // senkrecht. Nach unten ziehen zeigt mehr Decke, wie vorher.
      shiftT=Math.min(SH_MAX,Math.max(SH_MIN,shiftT-(e.clientY-ly)*0.0022));
      lx=e.clientX; ly=e.clientY; needsRender=true; });
    const end=e=>{ drag=false; el.style.cursor='grab'; };
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
    el.addEventListener('wheel',e=>{ e.preventDefault();
      radT=Math.min(R_MAX,Math.max(R_MIN,radT+e.deltaY*0.0028)); needsRender=true; },{passive:false});
  }catch(e){ failed=true; console.warn('Room3D deaktiviert:',e); return false; }
  return true;
}
function sizeToHost(){
  if(!renderer||!host) return;
  const w=Math.max(220,host.clientWidth||300), h=Math.max(220,host.clientHeight||240);
  renderer.setPixelRatio(Math.min(MOBILE?1.5:2,window.devicePixelRatio||1));
  renderer.setSize(w,h,false);
  vpW=w; vpH=h; applyLens();
  needsRender=true;
}
// rAF-Loop + Timer-Watchdog: rendert auch weiter, wenn der Browser rAF drosselt
let wdId=0, lastRaf=0;
// Rendern nur, wenn sich wirklich etwas bewegt. applyCam naehert die Zielwerte
// geometrisch an und erreicht sie nie exakt — ohne diese Pruefung wurden bis zum
// Schliessen des Mixers pixelgleiche Frames gerechnet. Die Schwelle 1e-4 rad
// entspricht 0.16 Bildschirmpixeln, ist also unterhalb des Sichtbaren.
let needsRender=true;
function step(){
  if(!renderer||!host) return;
  const moving=Math.abs(azT-az)>1e-4||Math.abs(shiftT-shift)>1e-4||Math.abs(radT-rad)>1e-4;
  if(!moving && !needsRender) return;
  applyCam(false); needsRender=false;
  renderer.render(scene,camera);
}
function loop(){ rafId=requestAnimationFrame(loop); lastRaf=performance.now(); step(); }
function startLoops(){
  if(!rafId) loop();
  if(!wdId) wdId=setInterval(()=>{ if(!document.hidden && performance.now()-lastRaf>200) step(); },120);
}
// env war 0.35 für alle drei Flächen: die Wände hingen damit am vollen Aussen-Himmel,
// als stünden sie im Freien. Innen sieht eine Wand keinen Himmel — der Boden schon
// eher, über Fenster und Decke.
function applyTex(m,cv,fallback,rough,ns,pom,env){
  applySurface(m,cv,{fallback,rough:rough!=null?rough:1.0,normalScale:ns!=null?ns:0.85,
    aniso:maxAniso, env:env!=null?env:0.24, pom:pom||0});
}
window.Room3D={
  available(){ return !failed; },
  dbg(){ return {scene,renderer,camera,az,rad,shift,eye:EYE}; },
  // Standardansicht. az/rad/shift liegen auf Modulebene und ueberleben dispose() —
  // ohne das hier landete man nach Aussen → Innen auf dem zuletzt gezogenen Winkel
  // statt auf der entworfenen Ansicht.
  resetView(){ azT=az=0.02; radT=rad=4.6; shiftT=shift=0.44; if(camera) applyCam(true); needsRender=true; },
  mount(h){
    if(!ensureRenderer()) return false;
    this.resetView();
    host=h;
    if(renderer.domElement.parentNode!==host){ host.innerHTML=''; host.appendChild(renderer.domElement); }
    addVignette(host);
    if(ro) ro.disconnect();
    ro=new ResizeObserver(()=>sizeToHost()); ro.observe(host);
    sizeToHost();
    startLoops();
    return true;
  },
  // Render-Loop + Watchdog anhalten (Mixer zu / anderes Gebaeude aktiv)
  stop(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } if(wdId){ clearInterval(wdId); wdId=0; } },
  // Kontext und Speicher wirklich freigeben — ensureRenderer() baut beim naechsten mount() neu auf
  dispose(){
    this.stop();
    if(ro){ ro.disconnect(); ro=null; }
    disposeScene(scene,renderer);
    renderer=null; scene=null; camera=null; host=null; failed=false;
  },
  // Wand hinten, Wand rechts, Boden — je ein Canvas (null → neutrale Fläche)
  setTextures(wallCv,wallSideCv,floorCv){
    if(!renderer) return;
    // Parallax-Occlusion: ja, aber flach und nur am Desktop.
    // Ja, weil die rechte Wand am Bildrand unter sehr flachem Winkel gesehen wird —
    // genau der Fall, für den POM gebaut ist; frontal auf die Rückwand bringt es
    // dagegen fast nichts.
    // Flach, weil ein Innen-Riemchen nur 20–52 mm dick ist: die 12,8 mm, die draussen
    // am 115er Vollstein sauber sind, wären hier eine Bauschadenmeldung — man sähe
    // das Kleberbett. 5,0 mm ist das fachliche Maximum, also 0.005 m geteilt durch
    // die Wandbreite, über die eine UV-Einheit läuft.
    // Nur Desktop, weil klbParallax bis zu 26 abhängige Textur-Zugriffe je Fragment
    // macht und die beiden Wände fast die Hälfte des Bildes decken.
    const pw=MOBILE?0:0.005/ROOM.W, ps=MOBILE?0:0.005/ROOM.D;
    applyTex(wallMat,wallCv,0xd9d5d0,1.0,1.05,pw);
    applyTex(wallSideMat,wallSideCv||wallCv,0xd6d2cc,1.0,1.05,ps);
    // Boden bewusst OHNE POM: bei 69–80° Einfall liegt die Abbruchschwelle des
    // Shaders als scharfe Kante quer im Bild. Stattdessen mehr Normal-Relief.
    applyTex(floorMat,floorCv,0xd3d0cb,0.62,0.7,0,0.28);
    needsRender=true;
  },
  // hochaufgelöstes Standbild der AKTUELLEN Ansicht (für Export PNG)
  snapshot(w,h){
    if(!renderer) return null;
    const pr=renderer.getPixelRatio(), sz=new THREE.Vector2(); renderer.getSize(sz);
    // Der Objektivversatz muss auch hier gesetzt werden, sonst weicht der Export
    // vom Bildschirm ab.
    renderer.setPixelRatio(1); renderer.setSize(w,h,false);
    vpW=w; vpH=h; applyLens();
    renderer.render(scene,camera);
    const url=renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(pr); renderer.setSize(sz.x,sz.y,false);
    vpW=sz.x; vpH=sz.y; applyLens();
    renderer.render(scene,camera);
    return url;
  }
};
window.dispatchEvent(new Event('room3d-ready'));
