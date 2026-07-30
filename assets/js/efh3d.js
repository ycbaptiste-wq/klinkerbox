// ===================== KLINKERBOX · 3D-EINFAMILIENHAUS (AUSSEN) =====================
// Echtes WebGL-EFH für die Aussen-Ansicht: zweigeschossig mit Satteldach,
// Rollladen-Kästen, Eingangsportal, Kamin, Dachrinne. Fassade (vorne +
// Giebelseiten) trägt den Wand-Mix, der Vorplatz den Boden-Mix.
// Orbit + Zoom wie beim Bungalow/Innenraum.
import * as THREE from './three.module.min.js';
import { buildEnv, glassMaterial, skyDomeTexture, applySurface, surfaceMaps, disposeScene,
         addVignette, interiorRoom, grassTuft, bushClump, groundContact, rnd, resetRnd, LOWQ } from './scene3d-lib.js?v=47';

const MOBILE=LOWQ;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let facadeMat=null, sideMatL=null, sideMatR=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

// Startblick: Dreiviertel-Ansicht auf Augenhöhe wie in Architektur-Renderings —
// frontal-symmetrisch wirkt jedes Gebäude flach. Orbit und Zoom bleiben unverändert.
const TARGET=new THREE.Vector3(0,4.1,1.0);
let az=0.52, po=1.487, rad=24.0;    // Dreiviertel-Ansicht braucht mehr Abstand als frontal
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.85, AZ_MAX=0.85, PO_MIN=1.30, PO_MAX=1.565, R_MIN=11, R_MAX=26;

// First von 8.50 auf 10.10: das Dach machte vorher nur 28 % der Gesamthoehe aus,
// bei der Referenz sind es rund zwei Drittel. Die Neigung wird jetzt ueber die
// WANDFLUCHT gerechnet (45 statt 27.6 Grad) — dadurch sitzt das Dach nicht mehr
// wie ein Deckel obenauf, sondern ueberschneidet die Wand.
const HW=9.6, HE=6.1, HR=10.1, HD=8.0;          // Breite, Traufe, First, Tiefe
const SOC=0.32;                                 // Sockelhöhe (Schwelle der Haustür)

function mat(c,rough,metal){ return new THREE.MeshStandardMaterial({color:c,roughness:rough!=null?rough:0.9,metalness:metal||0}); }
function noiseTex(base,vari,w,h,stripes){
  const cv=document.createElement('canvas'); cv.width=w||256; cv.height=h||256;
  const c=cv.getContext('2d'); c.fillStyle=base; c.fillRect(0,0,cv.width,cv.height);
  const id=c.getImageData(0,0,cv.width,cv.height);
  for(let i=0;i<id.data.length;i+=4){ const v=(Math.random()-0.5)*vari;
    id.data[i]+=v; id.data[i+1]+=v; id.data[i+2]+=v; }
  c.putImageData(id,0,0);
  if(stripes){                                   // Maehstreifen: aus gruener Farbe wird Rasen
    const c2=cv.getContext('2d');
    for(let i=0;i<12;i++){
      c2.fillStyle='rgba(255,255,255,'+(i%2?0.032:0)+')';
      c2.fillRect(0,i*cv.height/12,cv.width,cv.height/12);
      c2.fillStyle='rgba(0,0,0,'+(i%2?0:0.032)+')';
      c2.fillRect(0,i*cv.height/12,cv.width,cv.height/12);
    }
  }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=maxAniso;                         // fehlte — daher kroch das Rauschen beim Drehen
  return t;
}
// Ziegel-Struktur fürs Dach: Pfannen mit Wellenprofil quer zur Fallrichtung —
// die Rundung liefert die Höhen, aus denen die Normal-Map das Relief zieht.
function roofCanvas(){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=512;
  const c=cv.getContext('2d');
  for(let x=0;x<512;x++){                                  // Wellenprofil quer
    const w=Math.sin(x/48*Math.PI*2)*0.5+0.5;
    const v=Math.round(44+38*w);
    c.fillStyle='rgb('+v+','+(v+3)+','+(v+7)+')'; c.fillRect(x,0,1,512);
  }
  for(let y=0;y<512;y+=30){                                // Reihenstösse
    c.fillStyle='rgba(0,0,0,0.42)'; c.fillRect(0,y,512,4);
    c.fillStyle='rgba(255,255,255,0.07)'; c.fillRect(0,y+5,512,2);
  }
  return cv;
}
// Zaunfeld: Sockelmauer mit Abdeckplatte, zwei Riegel, Stabgitter dazwischen.
// Die Stäbe laufen als EIN InstancedMesh und enden sauber an den Riegeln.
function fenceRun(x0,x1,z,parent){
  const len=x1-x0, cx=(x0+x1)/2;
  const railM=mat(0x2c2e31,0.45,0.55);
  const base=new THREE.Mesh(new THREE.BoxGeometry(len,0.34,0.24),mat(0xb6b2aa,0.9));
  base.position.set(cx,0.17,z); base.castShadow=true; base.receiveShadow=true; parent.add(base);
  const cap=new THREE.Mesh(new THREE.BoxGeometry(len,0.05,0.30),mat(0xa19d95,0.85));
  cap.position.set(cx,0.365,z); cap.castShadow=true; cap.receiveShadow=true; parent.add(cap);
  [1.32,0.52].forEach(y=>{ const r=new THREE.Mesh(new THREE.BoxGeometry(len,0.045,0.032),railM);
    r.position.set(cx,y,z); r.castShadow=true; parent.add(r); });
  const n=Math.max(2,Math.round(len/0.125));
  // Staebe werfen KEINEN Schatten: bei 20 mm Dicke und ~6 mm Texelgroesse wird der
  // Stabschatten zu grauem Rauschen - das sieht schlechter aus als gar keiner.
  // Dafuer etwas dicker gegen das Kantenflimmern im Hauptdurchgang.
  const bars=new THREE.InstancedMesh(new THREE.BoxGeometry(0.035,0.90,0.035),railM,n);
  bars.castShadow=false;
  const M=new THREE.Matrix4();
  for(let i=0;i<n;i++){ M.makeTranslation(x0+0.06+i*(len-0.12)/(n-1),0.92,z); bars.setMatrixAt(i,M); }
  bars.instanceMatrix.needsUpdate=true; parent.add(bars);
}
// Zaunpfeiler mit Abdeckstein — Anfang, Ende und Einfahrt brauchen einen Halt
function pier(x,z,h,parent){
  const p=new THREE.Mesh(new THREE.BoxGeometry(0.40,h,0.40),mat(0xb6b2aa,0.9));
  p.position.set(x,h/2,z); p.castShadow=true; p.receiveShadow=true; parent.add(p);
  const c=new THREE.Mesh(new THREE.BoxGeometry(0.50,0.07,0.50),mat(0x9a968e,0.8));
  c.position.set(x,h+0.035,z); c.castShadow=true; parent.add(c);
}
// Geschnittene Hecke als Kulisse — schliesst das Grundstück wie in echten Visualisierungen
function hedge(x,z,len,rotY,parent){
  const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotY||0;
  groundContact(0,0,len,1.5,g);                 // unter der Hecke steht kein Sonnenlicht
  const body=new THREE.Mesh(new THREE.BoxGeometry(len,1.55,0.78),mat(0x506732,1));
  body.position.y=0.775; body.castShadow=true; body.receiveShadow=true; g.add(body);
  const n=Math.round(len/0.19);                       // aufgeraute Oberkante
  const tufts=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.115,0),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),n*2);
  const M=new THREE.Matrix4(), q=new THREE.Quaternion(), v=new THREE.Vector3(), s=new THREE.Vector3(), col=new THREE.Color();
  for(let i=0;i<n*2;i++){
    const side=i<n?-1:1, j=i%n;
    v.set(-len/2+ (j+0.5)*len/n + (rnd()-0.5)*0.2, 1.5+(rnd()-0.4)*0.14, side*0.30+(rnd()-0.5)*0.16);
    q.setFromEuler(new THREE.Euler(rnd(),rnd(),rnd()));
    s.set(0.8+rnd()*0.6,0.6+rnd()*0.4,0.8+rnd()*0.6);
    M.compose(v,q,s); tufts.setMatrixAt(i,M);
    col.setHSL(0.24+rnd()*0.05,0.30+rnd()*0.14,0.20+rnd()*0.14); tufts.setColorAt(i,col);
  }
  tufts.instanceMatrix.needsUpdate=true; if(tufts.instanceColor) tufts.instanceColor.needsUpdate=true;
  tufts.castShadow=true; g.add(tufts);
  parent.add(g);
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
// Rechteckige Öffnung als Loch in eine Wandkontur stanzen
function punch(shape,o){
  const p=new THREE.Path();
  p.moveTo(o.x-o.w/2,o.y-o.h/2); p.lineTo(o.x+o.w/2,o.y-o.h/2);
  p.lineTo(o.x+o.w/2,o.y+o.h/2); p.lineTo(o.x-o.w/2,o.y+o.h/2); p.closePath();
  shape.holes.push(p);
}
// Front- oder Giebelwand als EINE Fläche mit echten Öffnungen und sauberen 0..1-UVs.
// Ohne echte Löcher lassen sich die Fenster nicht in die Laibung zurücksetzen — und
// genau die Laibungstiefe ist es, die eine Klinkerfassade plastisch macht.
function wallGeo(w,h,ridge,holes){
  const s=new THREE.Shape();
  s.moveTo(-w/2,0); s.lineTo(w/2,0); s.lineTo(w/2,h);
  if(ridge) s.lineTo(0,ridge);
  s.lineTo(-w/2,h); s.closePath();
  (holes||[]).forEach(o=>punch(s,o));
  const g=new THREE.ShapeGeometry(s);
  const pos=g.attributes.position, uv=g.attributes.uv, H=ridge||h;
  for(let i=0;i<pos.count;i++) uv.setXY(i,(pos.getX(i)+w/2)/w, pos.getY(i)/H);
  return g;
}
const REVEAL=0.19;                     // Laibungstiefe der Fenster (m)
// EIN Fenstertyp, ueberall wiederholt - daraus zieht die Referenz ihre Ruhe.
// Vorher sassen auf drei symmetrischen Achsen drei verschiedene Groessen, es gab
// fuenf Sturzhoehen, und die ECKPFEILER waren mit 1.05 m die schmalsten
// Mauerstuecke der Fassade. Ein Mauerwerksbau, dessen Ecken duenner sind als
// seine Mitte, sieht ausgehoehlt aus.
const WIN_W=1.30, WIN_H=1.35;          // Eckpfeiler jetzt 1.45 m, breitestes Vollstueck
const Y_OG=4.775, Y_EG=1.875;          // gemeinsame Sturz- und Bruestungslinie
const AX=2.70, AX_S=1.90;              // Achsen Front / Giebelseite
// Materialien einmal anlegen statt pro Fenster - vorher entstanden 13x je neun
// MeshStandardMaterials, die three alle einzeln kompiliert.
let frameMat=null, revealMat=null, soldierMat=null;
// Rollschicht = STEHENDE Steine. Ein Quader bekommt von three UVs 0..1 je Seite —
// damit wird die ganze Wandtextur (9.6 x 6.1 m) in ein 1.5 x 0.24 m Band gequetscht
// und man sieht nur einen verschmierten Fleck. Deshalb eigene UVs: ein
// massstabsgetreuer Ausschnitt der Produktkarte, um 90 Grad gedreht.
// texW/texH = die Meter, die u bzw. v der Karte abdecken.
function soldierGeo(w,h,d,texW,texH,sx,sy){
  const g=new THREE.BoxGeometry(w,h,d);
  const uv=g.attributes.uv, pos=g.attributes.position;
  const uc=0.35+0.30*(((sx*0.37+sy*0.13)%1)+1)%1;   // je Band ein anderer Ausschnitt
  const vc=0.5+0.07*Math.sin(sx*3.1+sy*1.7);
  for(let i=0;i<uv.count;i++){
    uv.setXY(i, uc+pos.getY(i)/texW, vc+pos.getX(i)/texH);   // x↔y vertauscht = 90 Grad
  }
  uv.needsUpdate=true;
  return g;
}
function ensureWinMats(){
  if(frameMat) return;
  frameMat=mat(0xdad7d0,0.85);
  revealMat=new THREE.MeshStandardMaterial({color:0xe3e0da,roughness:0.9});
  soldierMat=new THREE.MeshStandardMaterial({color:0xdad6d1,roughness:0.95});
}
// Fenster: zurückgesetzt in der Laibung, mit Sohlbank, Sturz und Rollladen-Kasten.
// z=0 ist die Wandaussenkante; alles Weitere liegt DAHINTER.
function makeWindow(parent,x,y,w,h,glassM,withBox,corner,room){
  const D=REVEAL;
  ensureWinMats();
  const side=(sx,sy,sw,sh)=>{ const m2=new THREE.Mesh(new THREE.BoxGeometry(sw,sh,D),revealMat);
    m2.position.set(sx,sy,-D/2); m2.castShadow=true; m2.receiveShadow=true; parent.add(m2); };
  side(x,y+h/2+0.015,w+0.06,0.03);                           // Sturz-Untersicht
  side(x,y-h/2-0.015,w+0.06,0.03);                           // Brüstung
  side(x-w/2-0.015,y,0.03,h);                                // linke Laibung
  side(x+w/2+0.015,y,0.03,h);                                // rechte Laibung
  // Rollschicht ueber der Oeffnung: stehende Steine, 0.24 m hoch. Das kanonische
  // Klinkerdetail ueber jeder Oeffnung - und in einem Klinker-Konfigurator die
  // Stelle, an der das Produkt zeigt, was es kann.
  // Vorsprung 12 mm — eine Rollschicht steht vor der Wand, aber nicht wie ein Sims
  const roll=new THREE.Mesh(soldierGeo(w+0.23,0.24,0.115,HW,HE,x,y),soldierMat);
  roll.position.set(x,y+h/2+0.16,-0.046); roll.castShadow=true; roll.receiveShadow=true; parent.add(roll);
  const inter=new THREE.Mesh(new THREE.PlaneGeometry(w-0.02,h-0.02),
    interiorRoom(w-0.02,h-0.02,3.0,x*3.7+y*1.3,'home',corner||0,room));
  inter.position.set(x,y,-D-0.02); parent.add(inter);        // 3D-Innenraum (Interior-Mapping)
  // Blendrahmen als RING aus vier Hölzern — ein Vollkörper würde den Innenraum zumauern
  const fw=0.085, frM=frameMat, fz=-D+0.025;
  const bar=(bx,by,bw,bh)=>{ const m2=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,0.055),frM);
    m2.position.set(bx,by,fz); parent.add(m2); };
  bar(x,y+h/2-fw/2,w,fw); bar(x,y-h/2+fw/2,w,fw);
  bar(x-w/2+fw/2,y,fw,h-fw*2); bar(x+w/2-fw/2,y,fw,h-fw*2);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(w-fw*2,h-fw*2),glassM);
  glass.position.set(x,y,-D+0.04); parent.add(glass);        // reflektierendes Glas
  const post=new THREE.Mesh(new THREE.BoxGeometry(0.055,h-fw*2,0.05),frM);
  post.position.set(x,y,fz); parent.add(post);               // Mittelpfosten
  // Sohlbank aus Klinker (Rollschicht liegend): steht vor der Wand und wirft die
  // charakteristische Schattenkante. Ersetzt die frueheren zwei Betonprofile.
  const sill=new THREE.Mesh(soldierGeo(w+0.23,0.10,D+0.11,HW,HE,x+1.7,y-0.9),soldierMat);
  sill.position.set(x,y-h/2-0.05,-D/2+0.005); sill.castShadow=true; sill.receiveShadow=true; parent.add(sill);
}

function buildScene(){
  scene=new THREE.Scene();
  scene.environment=buildEnv(renderer);
  // Nebelfarbe muss den Horizontdunst des Himmel-Canvas treffen, sonst bekommt die
  // Kulisse einen blaugrauen Halo genau an ihrer Silhouette.
  scene.fog=new THREE.Fog(0xf1eee6,38,150);

  { const sky=new THREE.Mesh(new THREE.SphereGeometry(85,48,28),
      new THREE.MeshBasicMaterial({map:skyDomeTexture(),color:new THREE.Color(1.45,1.45,1.45),side:THREE.BackSide,fog:false}));
    scene.add(sky); }

  scene.add(new THREE.HemisphereLight(0xcfe0f2,0x6d7663,0.26));   // Himmel oben, Rasengrün unten
  // Sonnenstand 33°: streifend genug, dass das Fugenrelief Schatten wirft, aber
  // hoch genug für einen Kontrastumfang wie in der Referenz. Wenig Füll-Licht,
  // damit die Schatten stehen bleiben und nicht zugeleuchtet werden.
  const sun=new THREE.DirectionalLight(0xfff6ea,3.9);
  sun.position.set(18.9,15.7,10.9);
  sun.target.position.set(0,1.5,0);
  sun.castShadow=true;
  sun.shadow.mapSize.set(MOBILE?2048:4096,MOBILE?2048:4096);
  // Enger gefasst: kleineres Frustum = kleinere Texel = schärfere Kanten an
  // Traufe und Sohlbank. First und Kaminkopf liegen nachgerechnet noch drin.
  sun.shadow.camera.left=-13; sun.shadow.camera.right=13;
  sun.shadow.camera.top=13;   sun.shadow.camera.bottom=-9.5;
  sun.shadow.camera.near=1; sun.shadow.camera.far=60;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.00015; sun.shadow.normalBias=0.012;
  sun.shadow.radius=MOBILE?2:2.5;                 // PCF-Kernel → weiche Schattenkante
  scene.add(sun); scene.add(sun.target);

  // ---- Gelände: Rasen + Vorplatz (Boden-Mix) + Kies + Beetstreifen ----
  // #7f8f60 hatte Rot und Gruen praktisch gleich — ein gelbliches Grau. Und eine
  // Kachel deckte 9.2 m ab, viel zu grob fuer Rasen.
  const lawnT=noiseTex('#5f7442',40,512,512,true); lawnT.repeat.set(40,40);
  const lawn=new THREE.Mesh(new THREE.PlaneGeometry(110,110),
    new THREE.MeshStandardMaterial({map:lawnT,roughness:1}));
  lawn.rotation.x=-Math.PI/2; lawn.position.set(0,-0.01,10); lawn.receiveShadow=true; scene.add(lawn);

  // ---- Belag: EINE Fläche aus mehreren Feldern statt einer grauen Platte ----
  // Vorher lag ein 12x7-Rechteck vor dem Haus, ohne Zonierung und ohne Kante.
  // Jetzt Zufahrt, Gehweg zur Tür, Türpodest und eine Nebenfläche — zusammen als
  // ein ShapeGeometry, also EIN Draw-Call. ShapeGeometry liefert die UVs in
  // Shape-Koordinaten, also in METERN: repeat = 1/Breite, die die Textur abdeckt.
  floorMat=new THREE.MeshStandardMaterial({color:0xdedcd8,roughness:0.8,envMapIntensity:0.4});
  // rotation.x=-PI/2 bildet Shape-y auf -z ab, deshalb hier negierte z-Werte
  const fld=(x0,x1,z0,z1)=>{ const s=new THREE.Shape();
    s.moveTo(x0,-z0); s.lineTo(x1,-z0); s.lineTo(x1,-z1); s.lineTo(x0,-z1); s.closePath(); return s; };
  // Der Vorplatz liegt hinter der Toreinfahrt (Tor bei x ±3.30) und führt direkt
  // zur Haustür — vorher lag die Zufahrt seitlich daneben, ohne Bezug zum Tor.
  const PAVE=[fld(-3.10,3.10,1.90,8.75),    // Vorplatz hinter dem Tor
              fld(-1.70,1.70,0.12,1.90),    // Zuweg und Türpodest
              fld(-8.60,-5.10,0.80,3.80),   // Nebenfläche links
              fld(3.10,6.40,3.20,7.20)];    // Abstellfläche rechts
  const pave=new THREE.Mesh(new THREE.ShapeGeometry(PAVE),floorMat);
  pave.rotation.x=-Math.PI/2; pave.position.y=0.020;
  pave.receiveShadow=true; scene.add(pave);
  // Randeinfassung: Läuferreihe hochkant. Das ist am Bodenprodukt der teuerste
  // fehlende Posten — ohne Kante liest sich der Belag als Farbwechsel im Rasen.
  const kerbMat=new THREE.MeshStandardMaterial({color:0xc9c5bf,roughness:0.85});
  const kerb=(x0,x1,z0,z1)=>{
    [[x0-0.06,z0,0.12,z1-z0],[x1+0.06,z0,0.12,z1-z0]].forEach(([cx,cz,cw,cd])=>{
      const m2=new THREE.Mesh(new THREE.BoxGeometry(cw,0.11,cd),kerbMat);
      m2.position.set(cx,0.015,cz+cd/2); m2.castShadow=true; m2.receiveShadow=true; scene.add(m2); });
    const f=new THREE.Mesh(new THREE.BoxGeometry(x1-x0+0.24,0.11,0.12),kerbMat);
    f.position.set((x0+x1)/2,0.015,z1+0.06); f.castShadow=true; f.receiveShadow=true; scene.add(f);
  };
  kerb(-8.60,-5.10,0.80,3.80); kerb(3.10,6.40,3.20,7.20);
  // Vorplatz nur seitlich einfassen — vorne trifft er auf die Sockelmauer des Zauns
  [[-3.16,1.90,8.75],[3.16,1.90,8.75]].forEach(([cx,z0,z1])=>{
    const m2=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.11,z1-z0),kerbMat);
    m2.position.set(cx,0.015,(z0+z1)/2); m2.castShadow=true; m2.receiveShadow=true; scene.add(m2); });

  // ---- Traufstreifen (Kies) statt des 13 m breiten Beetstreifens ----
  // Der ragte beidseits 1.70 m frei in den Rasen. Ein Spritzschutzstreifen läuft
  // am Sockel entlang, nicht quer über das Grundstück.
  const gravelT=noiseTex('#b9b2a4',34,256,256); gravelT.repeat.set(14,2);
  const gravelM=new THREE.MeshStandardMaterial({map:gravelT,roughness:1});
  const strip=(x,z,w,d)=>{ const g=new THREE.Mesh(new THREE.PlaneGeometry(w,d),gravelM);
    g.rotation.x=-Math.PI/2; g.position.set(x,-0.005,z); g.receiveShadow=true; scene.add(g); };
  strip(-3.15,0.305,3.50,0.45); strip(3.15,0.305,3.50,0.45);        // vorne, Aussparung an der Tür
  strip(-5.105,-4.0,0.45,8.4); strip(5.105,-4.0,0.45,8.4);          // an beiden Giebeln
  // Staudenbeet nur noch in zwei Feldern
  const bedT=noiseTex('#7d746a',26,256,128); bedT.repeat.set(6,1);
  const bedM=new THREE.MeshStandardMaterial({map:bedT,roughness:1});
  [[-3.15,0.90,3.50,0.72],[3.15,0.90,3.50,0.72]].forEach(([x,z,w,d])=>{
    const b=new THREE.Mesh(new THREE.PlaneGeometry(w,d),bedM);
    b.rotation.x=-Math.PI/2; b.position.set(x,-0.004,z); b.receiveShadow=true; scene.add(b); });

  // ---- Hauskörper: Fassade vorne + Giebelseiten (Produkt-Textur) ----
  // Öffnungen: exakt dieselben Masse, die makeWindow/Portal weiter unten benutzen
  const W1={w:WIN_W,h:WIN_H};
  const FRONT_WIN=[{x:-AX,y:Y_OG,...W1},{x:0,y:Y_OG,...W1},{x:AX,y:Y_OG,...W1},
                   {x:-AX,y:Y_EG,...W1},{x:AX,y:Y_EG,...W1}];
  const DOOR={x:0,y:1.435,w:1.60,h:2.23};                 // Schwelle auf dem Sockel, Sturz auf Fensterlinie
  const SIDE_WIN=[{x:-AX_S,y:Y_OG,...W1},{x:AX_S,y:Y_OG,...W1},
                  {x:-AX_S,y:Y_EG,...W1},{x:AX_S,y:Y_EG,...W1},
                  {x:0,y:7.10,w:0.90,h:1.30}];            // Giebelfenster, erst durch das 45°-Dach möglich
  facadeMat=new THREE.MeshStandardMaterial({color:0xdad6d1,roughness:0.95});
  const front=new THREE.Mesh(wallGeo(HW,HE,0,FRONT_WIN.concat([DOOR])),facadeMat);
  front.position.set(0,0,0); front.receiveShadow=true; front.castShadow=true; scene.add(front);
  sideMatL=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  sideMatR=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  const sideL=new THREE.Mesh(wallGeo(HD,HE,HR,SIDE_WIN),sideMatL);
  sideL.rotation.y=-Math.PI/2; sideL.position.set(-HW/2,0,-HD/2);
  sideL.receiveShadow=true; sideL.castShadow=true; scene.add(sideL);
  const sideR=new THREE.Mesh(wallGeo(HD,HE,HR,SIDE_WIN),sideMatR);
  sideR.rotation.y=Math.PI/2; sideR.position.set(HW/2,0,-HD/2);
  sideR.receiveShadow=true; sideR.castShadow=true; scene.add(sideR);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(HW,HE),mat(0xcfccc7,1));
  back.rotation.y=Math.PI; back.position.set(0,HE/2,-HD); back.castShadow=true; scene.add(back);
  // Innenschale: dunkle Kiste hinter den Öffnungen, damit man durch die Laibung
  // nicht ins Freie sieht, wenn ein Fenster mal keinen Innenraum-Shader trägt
  // NUR bis zur Traufe. Der Dachraum darüber ist bereits geschlossen — von den
  // zwei Giebelwänden und den zwei Dachflächen. Eine Kiste bis zum First würde
  // durch die Dachflächen stossen und als dunkler Keil im Bild stehen.
  { const shell=new THREE.Mesh(new THREE.BoxGeometry(HW-0.3,HE-0.2,HD-0.4),mat(0x2a2723,1));
    shell.material.side=THREE.BackSide; shell.position.set(0,HE/2,-HD/2); scene.add(shell); }
  // Sockel: das Haus steht sonst mit einer Rasierklingenkante auf dem Rasen
  { const soc=new THREE.Mesh(new THREE.BoxGeometry(HW+0.16,SOC,HD+0.16),mat(0xb9b5ad,0.9));
    soc.position.set(0,SOC/2,-HD/2); soc.castShadow=true; soc.receiveShadow=true; scene.add(soc); }

  // ---- Satteldach: Pfannen mit Wellenprofil, Traufwulst, First + Rinne ----
  const OV=0.45;                                  // Dachüberstand
  const roofCv=roofCanvas();
  const rT=new THREE.CanvasTexture(roofCv);
  rT.wrapS=rT.wrapT=THREE.RepeatWrapping; rT.colorSpace=THREE.SRGBColorSpace; rT.repeat.set(7,3);
  const roofNm=surfaceMaps(roofCv,512);
  const roofM=new THREE.MeshStandardMaterial({map:rT,roughness:0.72,envMapIntensity:0.5});
  if(roofNm){ roofNm.normal.wrapS=roofNm.normal.wrapT=THREE.RepeatWrapping; roofNm.normal.repeat.set(7,3);
    roofM.normalMap=roofNm.normal; roofM.normalScale=new THREE.Vector2(1.1,1.1); }
  // Neigung ueber die WANDFLUCHT: an der Wandkante (z=0) liegt das Dach genau auf
  // HE, der Ueberstand haengt darunter. Frueher wurde ueber HD/2+OV gerechnet —
  // dann sass die Traufkante exakt auf der Wandkrone und das Dach lag wie ein
  // Deckel obenauf, ohne die dunkle Traufkante der Referenz.
  const pitch=Math.atan2(HR-HE,HD/2);             // 45 Grad
  const eaveY=HE-OV*Math.tan(pitch);              // Traufkante haengt unter der Wandkrone
  const run=HD/2+OV, slopeLen=Math.hypot(run,HR-eaveY);
  const frontSlope=new THREE.Mesh(new THREE.BoxGeometry(HW+2*OV,0.14,slopeLen),roofM);
  frontSlope.rotation.x=pitch;
  frontSlope.position.set(0,(HR+eaveY)/2,(OV-HD/2)/2);
  frontSlope.castShadow=true; frontSlope.receiveShadow=true; scene.add(frontSlope);
  const backSlope=new THREE.Mesh(new THREE.BoxGeometry(HW+2*OV,0.14,slopeLen),roofM);
  backSlope.rotation.x=-pitch;
  backSlope.position.set(0,(HR+eaveY)/2,(-HD-OV+(-HD/2))/2);
  backSlope.castShadow=true; scene.add(backSlope);
  // Traufwulst: eine Reihe Pfannenrundungen. Die schnurgerade Dachkante ist das,
  // was ein Dach am deutlichsten als Attrappe verrät.
  { const tileM=mat(0x3a3d42,0.72), tw=0.205, n=Math.round((HW+2*OV)/tw);
    const tg=new THREE.CylinderGeometry(0.048,0.048,0.40,7);
    const tiles=new THREE.InstancedMesh(tg,tileM,n);
    tiles.castShadow=true;
    const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(Math.PI/2+pitch,0,0);
    const v=new THREE.Vector3(), sc=new THREE.Vector3(1,1,1);
    q.setFromEuler(e);
    for(let i=0;i<n;i++){
      v.set((i-(n-1)/2)*tw, eaveY+0.055+0.16*Math.sin(pitch), OV-0.16*Math.cos(pitch));
      m4.compose(v,q,sc); tiles.setMatrixAt(i,m4);
    }
    tiles.instanceMatrix.needsUpdate=true; scene.add(tiles);
  }
  const ridge=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,HW+1.25,10),mat(0x33363a,0.7));
  ridge.rotation.z=Math.PI/2; ridge.position.set(0,HR+0.06,-HD/2); ridge.castShadow=true; scene.add(ridge);
  // Traufblende: das dunkle Band unter der Dachkante, das die Referenz zeigt.
  // Ein waagrechter Sofit entfällt — das Dach überschneidet die Wand jetzt, es
  // gibt keinen Zwickel mehr zuzudecken.
  const fascia=new THREE.Mesh(new THREE.BoxGeometry(HW+2*OV,0.20,0.03),mat(0x2e3339,0.7));
  fascia.position.set(0,eaveY-0.10,OV+0.015); scene.add(fascia);
  // ---- Dachrinne: halbrunde, nach oben OFFENE Rinne, kein Rohr ----
  // Titanzink, nicht der frühere helle Kunststoffton. Die Rinne hängt so hoch,
  // dass ihre hintere Oberkante an der Dachunterkante liegt, und das Traufblech
  // schliesst den Rest — zwischen Dach und Rinne darf kein Licht durchkommen.
  { const GL=HW+2*OV-0.06, gr=0.078;
    const zinc=mat(0x9aa0a3,0.32,0.85);
    // untere Hälfte des Zylindermantels → nach oben offene Rinne
    const trough=new THREE.Mesh(
      new THREE.CylinderGeometry(gr,gr,GL,18,1,true,Math.PI,Math.PI),zinc);
    trough.material.side=THREE.DoubleSide;         // Innenseite der Rinne ist sichtbar
    trough.rotation.z=Math.PI/2;
    trough.position.set(0,eaveY-0.055,OV+0.03);
    trough.castShadow=true; trough.receiveShadow=true; scene.add(trough);
    // Wulst an der Vorderkante — das Profil, an dem man eine Rinne erkennt
    const bead=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,GL,8),zinc);
    bead.rotation.z=Math.PI/2; bead.position.set(0,eaveY-0.055,OV+0.03+gr);
    bead.castShadow=true; scene.add(bead);
    // Traufblech: schliesst die Fuge zwischen Dachunterkante und Rinnenrückwand
    const drip=new THREE.Mesh(new THREE.BoxGeometry(GL,0.10,0.006),mat(0x8f9497,0.35,0.8));
    drip.rotation.x=Math.PI/4;
    drip.position.set(0,eaveY-0.055,OV-0.012);
    drip.castShadow=true; scene.add(drip);
    // Rinnenhalter alle ~0.85 m, unter der Rinne durchgeführt
    const nh=Math.max(2,Math.round(GL/0.85));
    const hold=new THREE.InstancedMesh(new THREE.BoxGeometry(0.028,0.022,0.20),zinc,nh);
    hold.castShadow=true;
    const M4=new THREE.Matrix4();
    for(let i=0;i<nh;i++){ M4.makeTranslation(-GL/2+0.4+i*(GL-0.8)/(nh-1),eaveY-0.055-gr-0.008,OV+0.03);
      hold.setMatrixAt(i,M4); }
    hold.instanceMatrix.needsUpdate=true; scene.add(hold);
    // Fallrohre mit Bogen zurück zur Wand — vorher endeten sie im Nichts
    [-HW/2+0.16,HW/2-0.16].forEach(x=>{
      const dp=new THREE.Mesh(new THREE.CylinderGeometry(0.042,0.042,eaveY-0.62,12),zinc);
      dp.position.set(x,(eaveY-0.62)/2,0.10); dp.castShadow=true; scene.add(dp);
      const el=new THREE.Mesh(new THREE.CylinderGeometry(0.042,0.042,0.52,12),zinc);
      el.rotation.x=-Math.atan2(OV-0.07,0.34);
      el.position.set(x,eaveY-0.42,0.28); el.castShadow=true; scene.add(el);
      [1.1,2.6,4.0].forEach(hy=>{ if(hy>eaveY-0.7) return;    // Rohrschellen
        const sc2=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.022,0.030),zinc);
        sc2.position.set(x,hy,0.055); scene.add(sc2); });
    });
  }
  // Kamin (weiss, Metallkappe) + kleines Lüftungsrohr
  const chim=new THREE.Mesh(new THREE.BoxGeometry(0.55,1.6,0.55),mat(0xe9e7e3,0.8));
  chim.position.set(-0.9,HR+0.55,-HD/2-0.4); chim.castShadow=true; scene.add(chim);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.5,12),mat(0x9fa3a7,0.4,0.7));
  cap.position.set(-0.9,HR+1.55,-HD/2-0.4); scene.add(cap);
  const vent=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.5,10),mat(0x4a4d52,0.5,0.5));
  vent.position.set(1.6,HR-0.6,-HD/2-1.4); scene.add(vent);

  // ---- Fenster ----
  // Die Scheibe ist ein Spiegel, kein Schaufenster: in der Referenz ist in keinem
  // Fenster ein Möbel erkennbar, nur Himmel und Baumsilhouette.
  const glassM=glassMaterial({opacity:0.58,color:0x1f2731,env:1.0,roughness:0.04,clearcoat:0});
  // Raumzuordnung: mehrere Fenster desselben Zimmers zeigen DENSELBEN Raum.
  // EG: Wohnen links, Küche rechts, Diele hinter der Tür.
  // OG: Schlafen links, Bad in der Mitte, Kinderzimmer rechts.
  const grp=new THREE.Group(); scene.add(grp);
  makeWindow(grp,-AX,Y_OG,WIN_W,WIN_H,glassM,false,-1,'schlafen');
  makeWindow(grp, 0.0,Y_OG,WIN_W,WIN_H,glassM,false, 0,'bad');
  makeWindow(grp, AX,Y_OG,WIN_W,WIN_H,glassM,false, 1,'kind');
  makeWindow(grp,-AX,Y_EG,WIN_W,WIN_H,glassM,false,-1,'wohnen');
  makeWindow(grp, AX,Y_EG,WIN_W,WIN_H,glassM,false, 1,'kueche');
  // Seitenfenster (Giebelwände links/rechts): je zwei Achsen, OG + EG + Giebelspitze
  [-1,1].forEach(s=>{
    const sg=new THREE.Group(); sg.rotation.y=s*Math.PI/2; sg.position.set(s*HW/2,0,-HD/2); scene.add(sg);
    const eg=s<0?'wohnen':'kueche', og=s<0?'schlafen':'kind';
    makeWindow(sg,-AX_S,Y_OG,WIN_W,WIN_H,glassM,false,0,og);
    makeWindow(sg, AX_S,Y_OG,WIN_W,WIN_H,glassM,false,0,og);
    makeWindow(sg,-AX_S,Y_EG,WIN_W,WIN_H,glassM,false,0,eg);
    makeWindow(sg, AX_S,Y_EG,WIN_W,WIN_H,glassM,false,0,eg);
    makeWindow(sg, 0,7.10,0.90,1.30,glassM,false,0,'estrich');
  });

  // ---- Eingang: echte Nische in der Wand, Holztür + Seitenteil + Stufen ----
  // Die Türöffnung sitzt auf dem Sockel auf (Schwelle bei SOC) — deshalb führen
  // zwei Stufen hinauf, wie an einem gebauten Haus auch.
  { ensureWinMats();
    const D=0.24, w=1.60, h=2.23, y0=SOC, yc=y0+h/2;
    const rv=(sx,sy,sw,sh)=>{ const m2=new THREE.Mesh(new THREE.BoxGeometry(sw,sh,D),revealMat);
      m2.position.set(sx,sy,-D/2); m2.castShadow=true; m2.receiveShadow=true; scene.add(m2); };
    rv(0,y0+h+0.02,w+0.08,0.04);                       // Sturz
    rv(-w/2-0.02,yc,0.04,h);                           // linke Laibung
    rv( w/2+0.02,yc,0.04,h);                           // rechte Laibung
    // Rollschicht auch ueber der Tuer
    const roll=new THREE.Mesh(soldierGeo(w+0.23,0.24,0.115,HW,HE,0.6,2.9),soldierMat);
    roll.position.set(0,y0+h+0.16,-0.046); roll.castShadow=true; roll.receiveShadow=true; scene.add(roll);
    const thr=new THREE.Mesh(new THREE.BoxGeometry(w+0.10,0.02,0.17),mat(0xa8acae,0.42,0.55));
    thr.position.set(0,y0-0.01,-D/2+0.05); thr.receiveShadow=true; scene.add(thr);   // Schwellenprofil
    // Zarge: Blatt 1.05 + Setzholz 0.06 + Seitenteil 0.43 + 2x0.03 Rahmen = 1.60,
    // vorher blieben 0.36 m der Oeffnung schlicht offen (schwarzer Spalt).
    const zM=mat(0x33383c,0.55);
    [[-w/2+0.015,yc,0.03,h],[w/2-0.015,yc,0.03,h],[0,y0+h-0.015,w,0.03],
     [0.245,yc,0.06,h-0.03]].forEach(([bx,by,bw,bh])=>{
      const z=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,0.086),zM);
      z.position.set(bx,by,-D+0.043); scene.add(z); });
    const back2=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat(0x2b2723,0.95));
    back2.position.set(0,yc,-D-0.01); scene.add(back2);
    // Tuerblatt: 1.05 x 2.10, Verhaeltnis 1:2.0 statt der frueheren 1:2.47 -
    // ab 2.40 m Blatthoehe haengt ein einfluegeliges Blatt durch.
    const door=new THREE.Mesh(new THREE.BoxGeometry(1.05,h-0.06,0.082),mat(0x2b2f33,0.38));
    door.position.set(-0.24,yc,-D+0.055); door.castShadow=true; scene.add(door);
    const panelM=mat(0x24282c,0.42);
    [0.62,-0.28].forEach(dy=>{ const pn=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.62,0.012),panelM);
      pn.position.set(-0.24,yc+dy,-D+0.10); scene.add(pn); });
    // Stossgriff MIT Stuetzen - vorher schwebte er 7 mm vor dem Blatt
    const gM=mat(0xb8bcbe,0.32,1.0);
    const dBar=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,1.20,10),gM);
    dBar.position.set(0.20,yc-0.05,-D+0.155); scene.add(dBar);
    [-0.50,0.50].forEach(dy=>{ const st=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.062,8),gM);
      st.rotation.x=Math.PI/2; st.position.set(0.20,yc-0.05+dy,-D+0.126); scene.add(st); });
    const dSideInt=new THREE.Mesh(new THREE.PlaneGeometry(0.43,h-0.06),
      interiorRoom(0.43,h-0.06,3.2,7.3,'home',0,'diele'));
    dSideInt.position.set(0.545,yc,-D+0.01); scene.add(dSideInt);
    const doorGlass=new THREE.Mesh(new THREE.PlaneGeometry(0.43,h-0.06),glassM);
    doorGlass.position.set(0.545,yc,-D+0.04); scene.add(doorGlass);
    // Zwei GLEICHE Steigungen a 0.16 - vorher 9.6 / 9.6 / 12.8 cm, ein Baufehler,
    // den das Auge sofort sieht.
    const step1=new THREE.Mesh(new THREE.BoxGeometry(2.20,SOC/2,1.10),mat(0x55585b,0.8));
    step1.position.set(0,SOC*0.75,0.55); step1.castShadow=true; step1.receiveShadow=true; scene.add(step1);
    const step2=new THREE.Mesh(new THREE.BoxGeometry(2.60,SOC/2,1.40),mat(0x55585b,0.8));
    step2.position.set(0,SOC*0.25,0.90); step2.castShadow=true; step2.receiveShadow=true; scene.add(step2);
    // Wandleuchten flankierend. Bewusst KEINE echte Lichtquelle: jede zusaetzliche
    // zwingt three, alle Standardmaterialien neu zu kompilieren - tagsueber fuer nichts.
    [-1.15,1.15].forEach(lx=>{
      const lp=new THREE.Mesh(new THREE.BoxGeometry(0.11,0.30,0.11),mat(0x2b2d30,0.5));
      lp.position.set(lx,2.05,0.06); lp.castShadow=true; scene.add(lp);
      const gl=new THREE.Mesh(new THREE.BoxGeometry(0.085,0.02,0.085),
        new THREE.MeshBasicMaterial({color:0xd8d2c4}));
      gl.position.set(lx,1.895,0.06); scene.add(gl);
    });
  }

  // ---- Bepflanzung vor der Fassade ----
  const beds=new THREE.Group(); scene.add(beds);
  resetRnd();                                   // gleiche Bepflanzung bei jedem Aufbau
  [[-4.2,0.62,1.2],[-1.6,0.70,1.05],[1.7,0.62,1.1],[4.3,0.70,1.2],
   [-5.6,1.00,1.3],[5.6,1.00,1.3],[-2.4,0.55,0.9],[2.6,0.58,0.95]]
    .forEach(([x,z,s])=>grassTuft(x,z,s,beds));
  // Nur zwei Grüntöne statt vier — vier lesen sich als Zufall, zwei als Pflanzung
  bushClump(-3.4,0.90,0.34,0x4c5c40,beds); bushClump(-1.9,0.86,0.28,0x5f6d4a,beds);
  bushClump(1.9,0.90,0.30,0x4c5c40,beds);  bushClump(3.4,0.86,0.34,0x5f6d4a,beds);
  bushClump(-4.5,0.88,0.30,0x5f6d4a,beds); bushClump(4.5,0.88,0.30,0x4c5c40,beds);
  // Kübel am Eingang: der einzige Massstabsvergleich, den der Belag bekommt
  [[-1.15,0.95,0x3a3d40],[1.15,0.95,0x3a3d40],[6.60,2.40,0xb6b2ab],[6.60,3.80,0xb6b2ab]]
    .forEach(([px,pz,pc])=>{
      const pot=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.55,0.42),mat(pc,0.8));
      pot.position.set(px,0.275,pz); pot.castShadow=true; pot.receiveShadow=true; scene.add(pot);
      const ball=new THREE.Mesh(new THREE.IcosahedronGeometry(0.25,1),mat(0x4c5c40,1));
      ball.position.set(px,0.80,pz); ball.castShadow=true; scene.add(ball);
      groundContact(px,pz,0.95,0.95,scene,0.021);
    });
  // Hecken schliessen das Grundstück seitlich und hinten ab.
  // Farbe war ein entsaettigtes Graugruen, das nur den Schattenwert der Referenz
  // traf und deren Sonnenwert nie erreichte.
  hedge(-10.6,-1.6,20.1,Math.PI/2,scene);
  hedge( 10.6,-1.6,20.1,Math.PI/2,scene);
  hedge(  0.0,-13.5,22,0,scene);

  // ---- Grundstücksgrenze zur Strasse: Pfeiler, Sockelmauer, Stabgitter ----
  // Vorher standen zwei Mauerscheiben und zwei Zaunfelder unverbunden im Gelände;
  // die Stäbe hörten mitten in der Luft auf. Jetzt eine durchgehende Grenze mit
  // Einfahrtsöffnung, die auf beiden Seiten in der Seitenhecke endet.
  const FZ=8.8;                                    // Grenzlinie am Ende des Vorplatzes
  const GATE=3.30;                                 // halbe Einfahrtsbreite
  pier(-GATE,FZ,1.62,scene); pier(GATE,FZ,1.62,scene);
  pier(-10.35,FZ,1.48,scene); pier(10.35,FZ,1.48,scene);
  fenceRun(-10.14,-GATE+0.21,FZ,scene);
  fenceRun(GATE-0.21,10.14,FZ,scene);

  // ---- Kontaktschatten am Bauwerksfuss ----
  // Der Schlagschatten des Hauses faellt korrekt nach hinten aus dem Bild. Was
  // fehlt, ist die ansichtsunabhaengige Verdunkelung dort, wo Wand auf Boden
  // trifft — ohne sie liegt das Haus auf der Flaeche, statt darauf zu stehen.
  { const S=512, cv=document.createElement('canvas'); cv.width=cv.height=S;
    const c=cv.getContext('2d');
    c.fillStyle='#ffffff'; c.fillRect(0,0,S,S);
    const px=S/24, cxp=S/2, czp=S/2-(-2.0)*px;               // Ebene 24x20 bei z=-2
    c.filter='blur(7px)';
    c.fillStyle='rgb(140,140,140)';
    c.fillRect(cxp-(HW/2+0.40)*px, czp+(-4.0-HD/2-0.40)*px, (HW+0.80)*px, (HD+0.80)*px);
    c.filter='none';
    const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace;
    const dec=new THREE.Mesh(new THREE.PlaneGeometry(24,20),
      new THREE.MeshBasicMaterial({map:t,blending:THREE.MultiplyBlending,
        depthWrite:false,transparent:true,fog:false}));   // fog:false, sonst mischt der Nebel es weg
    dec.rotation.x=-Math.PI/2; dec.position.set(0,0.026,-2.0); dec.renderOrder=2; scene.add(dec);
  }

  // ---- Kulisse: Baumwand statt Hügel ----
  // Die drei geplaetteten Kugeln massen Helligkeit 182 gegen einen Himmel von 185 —
  // praktisch keine Silhouette. Eine Baumwand traegt die Trennung, die ein
  // Aussenbild braucht.
  { const n=34;
    const trees=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),
      new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),n);
    trees.castShadow=false;                       // sonst blaeht sich das Schattenfrustum auf
    const M4=new THREE.Matrix4(), q=new THREE.Quaternion(), v=new THREE.Vector3(),
          s=new THREE.Vector3(), col=new THREE.Color();
    for(let i=0;i<n;i++){
      const r=2.0+rnd()*1.4, hgt=6.5+rnd()*3.5;
      v.set(-52+i*(104/(n-1))+(rnd()-0.5)*4, hgt-r*0.5, -56-rnd()*10);
      q.setFromEuler(new THREE.Euler(rnd(),rnd(),rnd()));
      s.set(r,r*(0.95+rnd()*0.45),r);
      M4.compose(v,q,s); trees.setMatrixAt(i,M4);
      col.setHex(0x44532f).lerp(new THREE.Color(0x53613c),rnd()); trees.setColorAt(i,col);
    }
    trees.instanceMatrix.needsUpdate=true; if(trees.instanceColor) trees.instanceColor.needsUpdate=true;
    scene.add(trees);
  }
  // Bäume: mehrteilige Krone statt einer Kugel — die Silhouette macht den Unterschied
  [[-15,-14,1.0],[17,-13,0.85],[19,-19,1.15],[-19,-19,0.95],[-11,-22,1.1],[12,-23,0.9]].forEach(([x,z,sc])=>{
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.12*sc,0.20*sc,2.2*sc,8),mat(0x574434,1));
    tr.position.set(x,1.1*sc,z); tr.castShadow=true; scene.add(tr);
    for(let i=0;i<5;i++){
      const rr=(0.85+rnd()*0.75)*sc;
      const fo=new THREE.Mesh(new THREE.IcosahedronGeometry(rr,1),
        new THREE.MeshStandardMaterial({color:new THREE.Color(0x53663f).offsetHSL(0,(rnd()-0.5)*0.07,(rnd()-0.4)*0.10),roughness:1}));
      fo.position.set(x+(rnd()-0.5)*1.9*sc, (2.4+rnd()*1.7)*sc, z+(rnd()-0.5)*1.7*sc);
      fo.scale.set(1,0.86+rnd()*0.3,1); fo.castShadow=true; scene.add(fo);
    }
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
    renderer=new THREE.WebGLRenderer({antialias:!MOBILE});
    renderer.shadowMap.enabled=true;
    // PCF statt PCFSoft: nur PCF wertet shadow.radius aus → steuerbare Weichheit
    renderer.shadowMap.type=MOBILE?THREE.BasicShadowMap:THREE.PCFShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    // 0.86 deckelte das Bild bei Helligkeit 222 — es konnte systembedingt keine
    // Lichter bekommen. Die Referenz hat 12 % ihrer Flaeche ueber Helligkeit 240.
    renderer.toneMappingExposure=1.05;
    maxAniso=renderer.capabilities.getMaxAnisotropy()||8;
    buildScene();
    const el=renderer.domElement;
    el.addEventListener('webglcontextlost',e=>e.preventDefault());   // iOS: schwarzer Canvas vermeiden
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
  renderer.setPixelRatio(Math.min(MOBILE?1.5:2,window.devicePixelRatio||1));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.fov=(camera.aspect>1.45)?42:(camera.aspect>1.1?48:56);
  camera.updateProjectionMatrix();
}
// rAF-Loop + Timer-Watchdog: rendert auch weiter, wenn der Browser rAF drosselt
let wdId=0, lastRaf=0;
function step(){ if(!renderer||!host) return; applyCam(false); renderer.render(scene,camera); }
function loop(){ rafId=requestAnimationFrame(loop); lastRaf=performance.now(); step(); }
function startLoops(){
  if(!rafId) loop();
  if(!wdId) wdId=setInterval(()=>{ if(!document.hidden && performance.now()-lastRaf>200) step(); },120);
}
// Fugentiefe in UV-Einheiten: ~14 mm echte Tiefe auf die Breite, die die Textur
// abdeckt (Front 9.6 m, Giebelseite 8.0 m) → so bleibt der Effekt massstäblich.
const POM_FRONT=0.014/HW, POM_SIDE=0.014/HD;
// Mittlere Helligkeit der Produkttextur — entscheidet die Schreinerfarbe
function canvasLuma(cv){
  if(!cv) return 0.5;
  try{
    const s=document.createElement('canvas'); s.width=64; s.height=40;
    const c=s.getContext('2d',{willReadFrequently:true}); c.drawImage(cv,0,0,64,40);
    const d=c.getImageData(0,0,64,40).data; let L=0;
    for(let i=0;i<d.length;i+=4) L+=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)/255;
    return L/(64*40);
  }catch(e){ return 0.5; }
}
function applyTex(m,cv,fallback,rough,ns,pom){
  applySurface(m,cv,{fallback,rough,normalScale:ns!=null?ns:0.9,aniso:maxAniso,
    env:cv?0.20:0.3, pom:pom||0});
}
window.Efh3D={
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
  // Render-Loop + Watchdog anhalten (Mixer zu / anderes Gebaeude aktiv)
  stop(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } if(wdId){ clearInterval(wdId); wdId=0; } },
  // Kontext und Speicher wirklich freigeben — ensureRenderer() baut beim naechsten mount() neu auf
  dispose(){
    this.stop();
    if(ro){ ro.disconnect(); ro=null; }
    disposeScene(scene,renderer);
    renderer=null; scene=null; camera=null; host=null; failed=false;
    facadeMat=sideMatL=sideMatR=floorMat=null;
  },
  setTextures(facadeCv,sideCv,floorCv){
    if(!renderer) return;
    applyTex(facadeMat,facadeCv,0xdad6d1,1.0,0.9,POM_FRONT);
    applyTex(sideMatL,sideCv||facadeCv,0xd7d3ce,1.0,0.9,POM_SIDE);
    applyTex(sideMatR,sideCv||facadeCv,0xd7d3ce,1.0,0.9,POM_SIDE);
    // Der Belag hat UVs in Metern (ShapeGeometry) — die Bodentextur deckt 12 m ab.
    // KEIN POM auf dem Boden: bei flachem Blickwinkel liegt die Abbruchschwelle des
    // Parallax-Shaders als scharfe Kante quer durchs Bild.
    applySurface(floorMat,floorCv,{fallback:0xdedcd8,rough:0.85,normalScale:0.6,
      aniso:maxAniso,env:0.35,repeat:1/12});
    if(revealMat){
      // Laibung und Rollschicht tragen DAS PRODUKT statt hellem Putz. Das war die
      // groesste helle Nicht-Produktflaeche der Fassade, direkt neben dem Produkt.
      // Die Laibung ist eine Schnittflaeche → leicht abgedunkelt.
      applySurface(revealMat,facadeCv,{fallback:0xe3e0da,tint:0xb0aca6,rough:1.0,
        normalScale:0.45,aniso:maxAniso,env:0.20});
      // Die 90-Grad-Drehung steckt in den UVs der Bänder (soldierGeo), nicht in
      // der Textur — sonst stimmt der Massstab nicht.
      applySurface(soldierMat,facadeCv,{fallback:0xdad6d1,rough:1.0,
        normalScale:0.7,aniso:maxAniso,env:0.20});
    }
    // Rahmenfarbe folgt dem Produkt: heller Klinker bekommt helle Rahmen, dunkler
    // anthrazite. Sonst ist der Rahmen bei rotem Klinker das hellste Objekt der
    // ganzen Fassade — die Referenz macht genau umgekehrt.
    if(frameMat){
      const dark=canvasLuma(facadeCv)<0.45;
      frameMat.color.set(dark?0x30353a:0xdad7d0);
      frameMat.roughness=dark?0.55:0.85;
      frameMat.needsUpdate=true;
    }
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
