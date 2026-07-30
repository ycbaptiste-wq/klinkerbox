// ===================== KLINKERBOX · 3D-EINFAMILIENHAUS (AUSSEN) =====================
// Echtes WebGL-EFH für die Aussen-Ansicht: zweigeschossig mit Satteldach,
// Rollladen-Kästen, Eingangsportal, Kamin, Dachrinne. Fassade (vorne +
// Giebelseiten) trägt den Wand-Mix, der Vorplatz den Boden-Mix.
// Orbit + Zoom wie beim Bungalow/Innenraum.
import * as THREE from './three.module.min.js';
import { buildEnv, glassMaterial, skyDomeTexture, applySurface, surfaceMaps, disposeScene,
         addVignette, interiorRoom, grassTuft, bushClump, groundContact, rnd, resetRnd, LOWQ } from './scene3d-lib.js?v=45';

const MOBILE=LOWQ;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let facadeMat=null, sideMatL=null, sideMatR=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

// Startblick: Dreiviertel-Ansicht auf Augenhöhe wie in Architektur-Renderings —
// frontal-symmetrisch wirkt jedes Gebäude flach. Orbit und Zoom bleiben unverändert.
const TARGET=new THREE.Vector3(0,3.0,1.0);
let az=0.52, po=1.492, rad=21.0;    // Dreiviertel-Ansicht braucht mehr Abstand als frontal
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.85, AZ_MAX=0.85, PO_MIN=1.30, PO_MAX=1.565, R_MIN=11, R_MAX=26;

const HW=9.6, HE=6.1, HR=8.5, HD=8.0;           // Breite, Traufe, First, Tiefe
const SOC=0.32;                                 // Sockelhöhe (Schwelle der Haustür)

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
  const bars=new THREE.InstancedMesh(new THREE.BoxGeometry(0.020,0.90,0.020),railM,n);
  bars.castShadow=true;
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
  const body=new THREE.Mesh(new THREE.BoxGeometry(len,1.55,0.78),mat(0x44553a,1));
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
    col.setHSL(0.26+rnd()*0.05,0.24+rnd()*0.14,0.16+rnd()*0.12); tufts.setColorAt(i,col);
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
// Fenster: zurückgesetzt in der Laibung, mit Sohlbank, Sturz und Rollladen-Kasten.
// z=0 ist die Wandaussenkante; alles Weitere liegt DAHINTER.
function makeWindow(parent,x,y,w,h,glassM,withBox,corner){
  const D=REVEAL;
  const revM=mat(0xe3e0da,0.85);                             // heller Putz in der Laibung
  const side=(sx,sy,sw,sh)=>{ const m2=new THREE.Mesh(new THREE.BoxGeometry(sw,sh,D),revM);
    m2.position.set(sx,sy,-D/2); m2.castShadow=true; m2.receiveShadow=true; parent.add(m2); };
  side(x,y+h/2+0.015,w+0.06,0.03);                           // Sturz-Untersicht
  side(x,y-h/2-0.015,w+0.06,0.03);                           // Brüstung
  side(x-w/2-0.015,y,0.03,h);                                // linke Laibung
  side(x+w/2+0.015,y,0.03,h);                                // rechte Laibung
  const inter=new THREE.Mesh(new THREE.PlaneGeometry(w-0.02,h-0.02),interiorRoom(w-0.02,h-0.02,1.7,x*3.7+y*1.3,'home',corner||0));
  inter.position.set(x,y,-D-0.02); parent.add(inter);        // 3D-Innenraum (Interior-Mapping)
  // Blendrahmen als RING aus vier Hölzern — ein Vollkörper würde den Innenraum zumauern
  const fw=0.085, frM=mat(0xf2f1ee,0.55), fz=-D+0.025;
  const bar=(bx,by,bw,bh)=>{ const m2=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,0.055),frM);
    m2.position.set(bx,by,fz); m2.castShadow=true; parent.add(m2); };
  bar(x,y+h/2-fw/2,w,fw); bar(x,y-h/2+fw/2,w,fw);
  bar(x-w/2+fw/2,y,fw,h-fw*2); bar(x+w/2-fw/2,y,fw,h-fw*2);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(w-fw*2,h-fw*2),glassM);
  glass.position.set(x,y,-D+0.04); parent.add(glass);        // reflektierendes Glas
  const post=new THREE.Mesh(new THREE.BoxGeometry(0.055,h-fw*2,0.05),frM);
  post.position.set(x,y,fz); parent.add(post);               // Mittelpfosten
  // Sohlbank: steht vor der Wand und wirft die charakteristische Schattenkante
  const sill=new THREE.Mesh(new THREE.BoxGeometry(w+0.24,0.07,D+0.10),mat(0xdedbd5,0.75));
  sill.position.set(x,y-h/2-0.035,-D/2+0.05); sill.castShadow=true; sill.receiveShadow=true; parent.add(sill);
  const drip=new THREE.Mesh(new THREE.BoxGeometry(w+0.24,0.035,0.03),mat(0xc9c6bf,0.8));
  drip.position.set(x,y-h/2-0.085,0.035); drip.castShadow=true; parent.add(drip);
  if(withBox){
    const box=new THREE.Mesh(new THREE.BoxGeometry(w-0.02,0.30,0.11),mat(0x33373c,0.6));
    box.position.set(x,y+h/2-0.15,-D+0.09); parent.add(box);  // Kasten sitzt IN der Laibung
  }
}

function buildScene(){
  scene=new THREE.Scene();
  scene.environment=buildEnv(renderer);
  scene.fog=new THREE.Fog(0xe9ebe9,55,110);

  { const sky=new THREE.Mesh(new THREE.SphereGeometry(85,48,28),
      new THREE.MeshBasicMaterial({map:skyDomeTexture(),color:new THREE.Color(1.12,1.12,1.12),side:THREE.BackSide,fog:false}));
    scene.add(sky); }

  scene.add(new THREE.HemisphereLight(0xcfe0f2,0x7d8a70,0.30));   // Himmel oben, Rasengrün unten
  // Tiefer Sonnenstand (~29°): das Licht streift die Fassade, statt sie frontal
  // platt zu leuchten — erst dadurch wirft das Fugenrelief überhaupt Schatten.
  // Wenig Füll-Licht, damit die Schatten stehen bleiben und nicht zugeleuchtet werden.
  const sun=new THREE.DirectionalLight(0xfff1d8,4.4);
  sun.position.set(19,13.5,11);
  sun.target.position.set(0,1.5,0);
  sun.castShadow=true;
  sun.shadow.mapSize.set(MOBILE?1024:4096,MOBILE?1024:4096);
  sun.shadow.camera.left=-15; sun.shadow.camera.right=15;
  sun.shadow.camera.top=16;   sun.shadow.camera.bottom=-10;
  sun.shadow.camera.near=1; sun.shadow.camera.far=60;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.035;
  sun.shadow.radius=MOBILE?1:5;                   // PCF-Kernel → weiche Schattenkante wie echtes Sonnenlicht
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
  // Öffnungen: exakt dieselben Masse, die makeWindow/Portal weiter unten benutzen
  const FRONT_WIN=[{x:-2.9,y:4.45,w:1.70,h:1.30},{x:0,y:4.50,w:0.95,h:1.15},{x:2.9,y:4.45,w:1.40,h:1.30},
                   {x:-2.9,y:1.95,w:1.70,h:2.30},{x:2.9,y:2.30,w:1.40,h:1.50}];
  const DOOR={x:0,y:SOC+1.30,w:1.84,h:2.60};
  const SIDE_WIN=[{x:-1.9,y:4.45,w:1.40,h:1.30},{x:1.9,y:4.45,w:1.40,h:1.30},
                  {x:-1.9,y:2.30,w:1.40,h:1.50},{x:1.9,y:2.30,w:1.40,h:1.50}];
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
  { const shell=new THREE.Mesh(new THREE.BoxGeometry(HW-0.3,HE-0.2,HD-0.4),mat(0x2a2723,1));
    shell.material.side=THREE.BackSide; shell.position.set(0,HE/2,-HD/2); scene.add(shell); }
  // Sockel: das Haus steht sonst mit einer Rasierklingenkante auf dem Rasen
  { const soc=new THREE.Mesh(new THREE.BoxGeometry(HW+0.16,SOC,HD+0.16),mat(0xb9b5ad,0.9));
    soc.position.set(0,SOC/2,-HD/2); soc.castShadow=true; soc.receiveShadow=true; scene.add(soc); }

  // ---- Satteldach: Pfannen mit Wellenprofil, Traufwulst, First + Rinne ----
  // Der Dachüberstand ist bewusst grösser (0.60 statt 0.45): erst dadurch legt
  // sich unter der Traufe ein sichtbares Schattenband auf die Fassade.
  const OV=0.60;
  const roofCv=roofCanvas();
  const rT=new THREE.CanvasTexture(roofCv);
  rT.wrapS=rT.wrapT=THREE.RepeatWrapping; rT.colorSpace=THREE.SRGBColorSpace; rT.repeat.set(7,3);
  const roofNm=surfaceMaps(roofCv,512);
  const roofM=new THREE.MeshStandardMaterial({map:rT,roughness:0.72,envMapIntensity:0.5});
  if(roofNm){ roofNm.normal.wrapS=roofNm.normal.wrapT=THREE.RepeatWrapping; roofNm.normal.repeat.set(7,3);
    roofM.normalMap=roofNm.normal; roofM.normalScale=new THREE.Vector2(1.1,1.1); }
  const run=HD/2+OV, rise=HR-HE, pitch=Math.atan2(rise,run), slopeLen=Math.hypot(run,rise);
  const frontSlope=new THREE.Mesh(new THREE.BoxGeometry(HW+1.2,0.14,slopeLen),roofM);
  frontSlope.rotation.x=pitch;
  frontSlope.position.set(0,(HE+HR)/2,(OV-HD/2)/2);
  frontSlope.castShadow=true; frontSlope.receiveShadow=true; scene.add(frontSlope);
  const backSlope=new THREE.Mesh(new THREE.BoxGeometry(HW+1.2,0.14,slopeLen),roofM);
  backSlope.rotation.x=-pitch;
  backSlope.position.z=(-HD-OV+(-HD/2))/2;
  backSlope.position.set(0,(HE+HR)/2,(-HD-OV+(-HD/2))/2);
  backSlope.castShadow=true; scene.add(backSlope);
  // Traufwulst: eine Reihe Pfannenrundungen. Die schnurgerade Dachkante ist das,
  // was ein Dach am deutlichsten als Attrappe verrät.
  { const tileM=mat(0x3a3d42,0.72), tw=0.205, n=Math.round((HW+1.2)/tw);
    const tg=new THREE.CylinderGeometry(0.048,0.048,0.40,7);
    const tiles=new THREE.InstancedMesh(tg,tileM,n);
    tiles.castShadow=true;
    const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(Math.PI/2+pitch,0,0);
    const v=new THREE.Vector3(), sc=new THREE.Vector3(1,1,1);
    q.setFromEuler(e);
    for(let i=0;i<n;i++){
      v.set((i-(n-1)/2)*tw, HE+0.055-0.16*Math.sin(pitch), OV-0.16*Math.cos(pitch));
      m4.compose(v,q,sc); tiles.setMatrixAt(i,m4);
    }
    tiles.instanceMatrix.needsUpdate=true; scene.add(tiles);
  }
  const ridge=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.11,HW+1.25,10),mat(0x33363a,0.7));
  ridge.rotation.z=Math.PI/2; ridge.position.set(0,HR+0.06,-HD/2); ridge.castShadow=true; scene.add(ridge);
  const soffitF=new THREE.Mesh(new THREE.PlaneGeometry(HW+1.1,OV+0.05),mat(0xdedbd6,0.9));
  soffitF.rotation.x=Math.PI/2; soffitF.position.set(0,HE-0.005,OV/2); soffitF.receiveShadow=true; scene.add(soffitF);
  const gutter=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,HW+1.0,12),mat(0xc9c7c2,0.4,0.6));
  gutter.rotation.z=Math.PI/2; gutter.position.set(0,HE-0.03,OV-0.02); gutter.castShadow=true; scene.add(gutter);
  [[-HW/2+0.10],[HW/2-0.10]].forEach(([x])=>{
    const dp=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,HE-0.1,10),mat(0xc9c7c2,0.4,0.6));
    dp.position.set(x,(HE-0.1)/2,0.10); dp.castShadow=true; scene.add(dp);
  });
  // Kamin (weiss, Metallkappe) + kleines Lüftungsrohr
  const chim=new THREE.Mesh(new THREE.BoxGeometry(0.55,1.6,0.55),mat(0xe9e7e3,0.8));
  chim.position.set(-0.9,HR+0.55,-HD/2-0.4); chim.castShadow=true; scene.add(chim);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.5,12),mat(0x9fa3a7,0.4,0.7));
  cap.position.set(-0.9,HR+1.55,-HD/2-0.4); scene.add(cap);
  const vent=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.5,10),mat(0x4a4d52,0.5,0.5));
  vent.position.set(1.6,HR-0.6,-HD/2-1.4); scene.add(vent);

  // ---- Fenster (weisse Rahmen, dunkle Rollladen-Kästen) ----
  // Etwas dichteres Glas als früher: an einem echten Haus sind Fenster von aussen
  // dunkle Löcher mit Spiegelung, keine hellen Flächen.
  const glassM=glassMaterial({opacity:0.52,color:0x232b33,env:1.9});
  const grp=new THREE.Group(); scene.add(grp);
  makeWindow(grp,-2.9,4.45,1.70,1.30,glassM,true,-1);   // OG links → Seitenfenster links
  makeWindow(grp, 0.0,4.50,0.95,1.15,glassM,true, 0);   // OG mitte klein
  makeWindow(grp, 2.9,4.45,1.40,1.30,glassM,true, 1);   // OG rechts → Seitenfenster rechts
  makeWindow(grp,-2.9,1.95,1.70,2.30,glassM,true,-1);   // EG links (bodentief)
  makeWindow(grp, 2.9,2.30,1.40,1.50,glassM,true, 1);   // EG rechts
  // Seitenfenster (Giebelwände links/rechts): je zwei Achsen, OG + EG
  [-1,1].forEach(s=>{
    const sg=new THREE.Group(); sg.rotation.y=s*Math.PI/2; sg.position.set(s*HW/2,0,-HD/2); scene.add(sg);
    makeWindow(sg,-1.9,4.45,1.40,1.30,glassM,true);
    makeWindow(sg, 1.9,4.45,1.40,1.30,glassM,true);
    makeWindow(sg,-1.9,2.30,1.40,1.50,glassM,true);
    makeWindow(sg, 1.9,2.30,1.40,1.50,glassM,true);
  });

  // ---- Eingang: echte Nische in der Wand, Holztür + Seitenteil + Stufen ----
  // Die Türöffnung sitzt auf dem Sockel auf (Schwelle bei SOC) — deshalb führen
  // zwei Stufen hinauf, wie an einem gebauten Haus auch.
  { const D=0.24, w=1.84, h=2.60, y0=SOC, yc=y0+h/2;
    const revM=mat(0xe0ddd7,0.85);
    const rv=(sx,sy,sw,sh)=>{ const m2=new THREE.Mesh(new THREE.BoxGeometry(sw,sh,D),revM);
      m2.position.set(sx,sy,-D/2); m2.castShadow=true; m2.receiveShadow=true; scene.add(m2); };
    rv(0,y0+h+0.02,w+0.08,0.04);                       // Sturz
    rv(-w/2-0.02,yc,0.04,h);                           // linke Laibung
    rv( w/2+0.02,yc,0.04,h);                           // rechte Laibung
    const thr=new THREE.Mesh(new THREE.BoxGeometry(w+0.10,0.05,D+0.06),mat(0xb4b0a9,0.8));
    thr.position.set(0,y0-0.02,-D/2+0.03); thr.receiveShadow=true; scene.add(thr);   // Schwelle
    const back2=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat(0x413b34,0.95));
    back2.position.set(0,yc,-D-0.01); scene.add(back2);
    const door=new THREE.Mesh(new THREE.BoxGeometry(1.02,h-0.08,0.07),mat(0x5a3d29,0.5));
    door.position.set(-0.30,yc-0.02,-D+0.05); door.castShadow=true; scene.add(door);
    const panelM=mat(0x49301f,0.55);
    [0.68,0.0,-0.68].forEach(dy=>{ const pn=new THREE.Mesh(new THREE.BoxGeometry(0.66,0.56,0.015),panelM);
      pn.position.set(-0.30,yc-0.02+dy,-D+0.09); scene.add(pn); });
    const dBar=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,1.4,10),mat(0xc6c9cb,0.3,0.85));
    dBar.position.set(0.04,yc-0.02,-D+0.11); scene.add(dBar);
    const dSideInt=new THREE.Mesh(new THREE.PlaneGeometry(0.46,h-0.10),interiorRoom(0.46,h-0.10,1.7,7.3,'home'));
    dSideInt.position.set(0.52,yc,-D+0.02); scene.add(dSideInt);
    const doorGlass=new THREE.Mesh(new THREE.PlaneGeometry(0.46,h-0.10),glassM);
    doorGlass.position.set(0.52,yc,-D+0.05); scene.add(doorGlass);
    const step1=new THREE.Mesh(new THREE.BoxGeometry(2.3,SOC*0.6,1.0),mat(0xc9c6c0,0.85));
    step1.position.set(0,SOC*0.3,0.62); step1.castShadow=true; step1.receiveShadow=true; scene.add(step1);
    const step2=new THREE.Mesh(new THREE.BoxGeometry(2.6,SOC*0.3,1.4),mat(0xc4c1bb,0.85));
    step2.position.set(0,SOC*0.15,0.86); step2.castShadow=true; step2.receiveShadow=true; scene.add(step2);
  }

  // ---- Bepflanzung vor der Fassade ----
  const beds=new THREE.Group(); scene.add(beds);
  resetRnd();                                   // gleiche Bepflanzung bei jedem Aufbau
  [[-4.2,0.62,1.2],[-1.6,0.70,1.05],[1.7,0.62,1.1],[4.3,0.70,1.2],
   [-5.6,1.00,1.3],[5.6,1.00,1.3],[-2.4,0.55,0.9],[2.6,0.58,0.95]]
    .forEach(([x,z,s])=>grassTuft(x,z,s,beds));
  bushClump(-3.4,0.62,0.36,0x5f6d4a,beds); bushClump(-1.2,0.56,0.30,0x71785f,beds);
  bushClump(1.3,0.62,0.32,0x536444,beds);  bushClump(3.6,0.56,0.36,0x71785f,beds);
  bushClump(-5.2,0.82,0.40,0x4c5c40,beds); bushClump(5.2,0.82,0.38,0x5f6d4a,beds);
  // Hecken schliessen das Grundstück seitlich und hinten ab
  // Länge und Lage so, dass die Seitenhecken bis an die Zaunpfeiler bei z=8.8 reichen
  hedge(-10.6,0.4,17,Math.PI/2,scene);
  hedge( 10.6,0.4,17,Math.PI/2,scene);
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

  // ---- Kulisse: Hügel + Bäume + ferne Häuser ----
  [[-20,-18,9,0x8d9c80],[18,-20,11,0x879579],[0,-26,15,0x96a389]].forEach(([x,z,r,c])=>{
    const h=new THREE.Mesh(new THREE.SphereGeometry(r,20,14),mat(c,1));
    h.scale.set(1.7,0.30,1); h.position.set(x,0,z); scene.add(h);
  });
  // Bäume: mehrteilige Krone statt einer Kugel — die Silhouette macht den Unterschied
  [[-14,-8,1.0],[15,-6,0.85],[17,-11,1.15],[-17,-12,0.95],[-9,-16,1.1],[9,-17,0.9]].forEach(([x,z,sc])=>{
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
    renderer.toneMappingExposure=0.86;
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
    applyTex(floorMat,floorCv,0xd0cdc8,0.85,0.6);
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
