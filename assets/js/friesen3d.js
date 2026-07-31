// ===================== KLINKERBOX · 3D-FRIESENHAUS (AUSSEN) =====================
// Friesenhaus: steiles Walmdach mit Pfannen, mittiger Zwerchgiebel mit
// Kugel-Finial und weissen Ortgängen, zwei Gauben, weisse Sprossenfenster,
// dunkle Paneel-Tür mit Oberlicht, Buchshecken + Dünengräser, Marsch-Kulisse.
// Fassade (EG + Giebel + Seiten) trägt den Wand-Mix, der Vorplatz den Boden-Mix.
import * as THREE from './three.module.min.js';
import { buildEnv, glassMaterial, skyDomeTexture, applySurface, disposeScene, addVignette, interiorRoom, grassTuft, LOWQ } from './scene3d-lib.js?v=54';

const MOBILE=LOWQ;

let renderer=null, scene=null, camera=null, host=null, ro=null;
let facadeMat=null, gableMat=null, sideMatL=null, sideMatR=null, floorMat=null, revealMat=null, maxAniso=8;
let rafId=0, failed=false;

const TARGET=new THREE.Vector3(0,3.1,1.2);
let az=0.48, po=1.6153, rad=18.0;   // Augpunkt 3.10-0.80=2.30 m
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.85, AZ_MAX=0.85, PO_MIN=1.32, PO_MAX=1.6486, R_MIN=10, R_MAX=24;

const HW=13.0, HD=9.0;                           // Breite, Tiefe
const HE=3.0;                                    // Trauf-/EG-Höhe
const RIDGE=7.6;                                 // Firsthöhe
const GW=3.6;                                    // Giebelbreite

// ---- Haustür: Öffnung und Laibungstiefe, einmal zentral gerechnet ----
// Der Zwerchgiebel ist ein Risalit: seine Klinkerfläche liegt bei z=0.14, die
// EG-Fassade dahinter bei z=0.001. Nachgerechnet bleiben dazwischen 0.139 m —
// das ist exakt eine halbe Klinkerbreite (0.115) plus Stossfuge, also eine
// bautechnisch richtige Laibung. In dieses Mass muss die Tür hinein; die alte
// Tür lag bei z=0.20 und klebte damit 60 mm VOR der Wand.
// Die Werte stehen hier oben, weil der Giebel-Ausschnitt (Zeile ~200) und der
// Türaufbau (Zeile ~310) dieselben Zahlen brauchen.
const GBL_Z=0.14, FAC_Z=0.001;
const REVEAL=GBL_Z-FAC_Z;                        // 0.139 m Laibungstiefe
const DR_W=1.20, DR_Y0=0.05, DR_Y1=2.88;         // Rohbauöffnung 1.20 x 2.83 m

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
// Hohlpfannen-Optik: dunkle Pfannen mit welligen Reihen
function roofTex(){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=512;
  const c=cv.getContext('2d'); c.fillStyle='#40434a'; c.fillRect(0,0,512,512);
  for(let y=0;y<512;y+=30){
    c.fillStyle='rgba(0,0,0,0.4)'; c.fillRect(0,y,512,4);
    for(let x=0;x<512;x+=26){
      c.fillStyle='rgba(0,0,0,0.20)'; c.fillRect(x,y+4,3,26);
      c.fillStyle='rgba(255,255,255,0.07)'; c.fillRect(x+8,y+6,8,3);
    }
  }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace;
  return t;
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
// Walmdach (steile Neigung): 2 Trapeze + 2 Walm-Dreiecke
function hipRoofGeo(w,d,rise,ridgeHalf){
  const y0=0, y1=rise, zF=d/2, zB=-d/2;
  const A=[-w/2,y0,zF], B=[w/2,y0,zF], E=[w/2,y0,zB], F=[-w/2,y0,zB];
  const C=[ridgeHalf,y1,0], D=[-ridgeHalf,y1,0];
  const pos=[], uv=[], idx=[];
  function quad(p1,p2,p3,p4,us){ const b=pos.length/3;
    [p1,p2,p3,p4].forEach((p,i)=>{ pos.push(...p); uv.push(us[i][0],us[i][1]); });
    idx.push(b,b+1,b+2, b,b+2,b+3); }
  function tri(p1,p2,p3,us){ const b=pos.length/3;
    [p1,p2,p3].forEach((p,i)=>{ pos.push(...p); uv.push(us[i][0],us[i][1]); });
    idx.push(b,b+1,b+2); }
  quad(A,B,C,D,[[0,0],[1,0],[0.62,1],[0.38,1]]);
  quad(E,F,D,C,[[0,0],[1,0],[0.62,1],[0.38,1]]);
  tri(F,A,D,[[0,0],[1,0],[0.5,1]]);
  tri(B,E,C,[[0,0],[1,0],[0.5,1]]);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Sprossenfenster: weisse Fasche + Innenraum + reflektierendes Glas + Sprossen
function friesenWindow(parent,x,y,w,h,glassM,z){
  const zz=z!=null?z:0;
  const sur=new THREE.Mesh(new THREE.BoxGeometry(w+0.22,h+0.22,0.05),mat(0xeceae6,0.7));
  sur.position.set(x,y,zz+0.03); parent.add(sur);              // weisser Blendrahmen
  const inter=new THREE.Mesh(new THREE.PlaneGeometry(w+0.02,h+0.02),interiorRoom(w+0.02,h+0.02,1.7,x*3.1+y*1.9));
  inter.position.set(x,y,zz+0.056); parent.add(inter);         // 3D-Innenraum (Interior-Mapping)
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(w+0.02,h+0.02),glassM);
  glass.position.set(x,y,zz+0.088); parent.add(glass);         // reflektierendes Glas
  const mm=(mw,mh,mx,my)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(mw,mh,0.02),mat(0xf6f5f2,0.55));
    m.position.set(mx,my,zz+0.098); parent.add(m); };
  mm(0.05,h,x,y);                                  // Mittelpfosten
  mm(0.03,h,x-w*0.25,y); mm(0.03,h,x+w*0.25,y);
  mm(w,0.03,x,y+h*0.22); mm(w,0.03,x,y-h*0.10);
  const sill=new THREE.Mesh(new THREE.BoxGeometry(w+0.28,0.06,0.13),mat(0xe6e4e0,0.7));
  sill.position.set(x,y-h/2-0.14,zz+0.05); sill.castShadow=true; parent.add(sill);
}

function buildScene(){
  scene=new THREE.Scene();
  scene.environment=buildEnv(renderer);
  scene.fog=new THREE.Fog(0xe9ebe9,55,110);

  { const sky=new THREE.Mesh(new THREE.SphereGeometry(85,48,28),
      new THREE.MeshBasicMaterial({map:skyDomeTexture(),color:new THREE.Color(2.90,2.90,2.90),side:THREE.BackSide,fog:false}));
    scene.add(sky); }

  scene.add(new THREE.HemisphereLight(0xcfe0f2,0x8a9179,1.60));   // Himmel oben, Rasengrün unten
  scene.add(new THREE.AmbientLight(0xffffff,0.05));
  const sun=new THREE.DirectionalLight(0xfff6ea,2.8);
  sun.position.set(19,13,11);                    // streifendes Nachmittagslicht → Relief + Schattenwurf
  sun.target.position.set(0,0,1);
  sun.castShadow=true;
  sun.shadow.mapSize.set(MOBILE?1024:4096,MOBILE?1024:4096);
  sun.shadow.camera.left=-18; sun.shadow.camera.right=15;
  sun.shadow.camera.top=15;   sun.shadow.camera.bottom=-9;
  sun.shadow.camera.near=1; sun.shadow.camera.far=55;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.035;
  sun.shadow.radius=MOBILE?1:5;                   // PCF-Kernel → weiche Schattenkante
  scene.add(sun); scene.add(sun.target);

  // ---- Gelände: Marsch-Wiese + grosser Pflaster-Vorplatz + Beete ----
  const lawnT=noiseTex('#8a9468',26,512,512); lawnT.repeat.set(12,12);
  const lawn=new THREE.Mesh(new THREE.PlaneGeometry(110,110),
    new THREE.MeshStandardMaterial({map:lawnT,roughness:1}));
  lawn.rotation.x=-Math.PI/2; lawn.position.set(0,-0.01,10); lawn.receiveShadow=true; scene.add(lawn);
  floorMat=new THREE.MeshStandardMaterial({color:0xd0cdc8,roughness:0.8,envMapIntensity:0.4});
  const plaza=new THREE.Mesh(new THREE.PlaneGeometry(17,9.5),floorMat);
  plaza.rotation.x=-Math.PI/2; plaza.position.set(0,0.005,5.3);
  plaza.receiveShadow=true; scene.add(plaza);
  const bedT=noiseTex('#7d746a',26,256,128);
  const bedM=new THREE.MeshStandardMaterial({map:bedT,roughness:1});
  [[-4.6,1.0,6.0,1.7],[4.6,1.0,6.0,1.7],[-7.2,8.6,3.4,2.6],[7.2,8.6,3.4,2.6]].forEach(([x,z,w,d])=>{
    const b=new THREE.Mesh(new THREE.PlaneGeometry(w,d),bedM);
    b.rotation.x=-Math.PI/2; b.position.set(x,0.004,z); b.receiveShadow=true; scene.add(b);
  });

  // ---- Baukörper: EG-Fassade + Seiten (Produkt-Textur) ----
  facadeMat=new THREE.MeshStandardMaterial({color:0xdad6d1,roughness:0.95});
  const front=new THREE.Mesh(new THREE.PlaneGeometry(HW,HE),facadeMat);
  front.position.set(0,HE/2,0.001); front.receiveShadow=true; scene.add(front);
  sideMatL=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  sideMatR=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  const sideL=new THREE.Mesh(new THREE.PlaneGeometry(HD,HE),sideMatL);
  sideL.rotation.y=-Math.PI/2; sideL.position.set(-HW/2,HE/2,-HD/2); sideL.receiveShadow=true; scene.add(sideL);
  const sideR=new THREE.Mesh(new THREE.PlaneGeometry(HD,HE),sideMatR);
  sideR.rotation.y=Math.PI/2; sideR.position.set(HW/2,HE/2,-HD/2); sideR.receiveShadow=true; scene.add(sideR);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(HW,HE),mat(0xcfccc7,1));
  back.rotation.y=Math.PI; back.position.set(0,HE/2,-HD); scene.add(back);

  // ---- Steiles Walmdach mit Pfannen + Rinne ----
  const rT=roofTex(); rT.repeat.set(8,4);
  const roofM=new THREE.MeshStandardMaterial({map:rT,roughness:0.85,side:THREE.DoubleSide});
  const roof=new THREE.Mesh(hipRoofGeo(HW+0.9,HD+0.9,RIDGE-HE,2.0),roofM);
  roof.position.set(0,HE+0.05,-HD/2); roof.castShadow=true; scene.add(roof);
  // Der Firstziegel war 4.30 m lang, die Firstlinie der hipRoofGeo ist aber nur
  // 2*ridgeHalf = 4.00 m. Links und rechts standen also je 15 cm frei in die Luft —
  // genau die zwei Stellen, die der Nutzer markiert hat. Jetzt 3.96 m, damit die
  // Enden sauber im Gratanschluss verschwinden statt darüber hinauszuragen.
  const ridge=new THREE.Mesh(new THREE.BoxGeometry(3.96,0.14,0.24),mat(0x33363b,0.7));
  ridge.position.set(0,RIDGE+0.10,-HD/2); scene.add(ridge);
  // Ein Walmdach hat neben dem First auch vier GRATE. Ohne Gratziegel stossen die
  // vier Dachflächen als nackte Kante aneinander, und der First endet im Nichts —
  // deshalb wirkten seine Enden auch mit korrekter Länge noch unfertig.
  // Firstenden (world): (±2.00 | 7.65 | -4.50), Traufecken: (±6.95 | 3.05 | 0.45)
  // und (±6.95 | 3.05 | -9.45). Gratlänge damit 8.38 m.
  { const gratM=mat(0x33363b,0.7), up=new THREE.Vector3(0,1,0);
    [[ 2.0, 6.95, 0.45],[ 2.0, 6.95,-9.45],[-2.0,-6.95, 0.45],[-2.0,-6.95,-9.45]]
      .forEach(([xr,xe,ze])=>{
        const a=new THREE.Vector3(xr,RIDGE+0.05,-HD/2), b=new THREE.Vector3(xe,HE+0.05,ze);
        const v=new THREE.Vector3().subVectors(b,a);
        const g=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,v.length(),8),gratM);
        g.position.copy(a).add(b).multiplyScalar(0.5);
        g.quaternion.setFromUnitVectors(up,v.clone().normalize());
        g.castShadow=true; scene.add(g);
      }); }
  const gutter=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,HW+0.7,12),mat(0xc9c7c2,0.4,0.6));
  gutter.rotation.z=Math.PI/2; gutter.position.set(0,HE+0.02,0.50); scene.add(gutter);
  [[-HW/2+0.12],[HW/2-0.12]].forEach(([x])=>{
    const dp=new THREE.Mesh(new THREE.CylinderGeometry(0.042,0.042,HE-0.1,10),mat(0xc9c7c2,0.4,0.6));
    dp.position.set(x,(HE-0.1)/2,0.10); scene.add(dp);
  });

  // ---- Zwerchgiebel: durchgehende Front + steiler Giebel + Kugel-Finial ----
  gableMat=new THREE.MeshStandardMaterial({color:0xdad6d1,roughness:0.95});
  const gShape=new THREE.Shape();
  gShape.moveTo(-GW/2,0); gShape.lineTo(GW/2,0); gShape.lineTo(GW/2,5.35);
  gShape.lineTo(0,7.45); gShape.lineTo(-GW/2,5.35); gShape.closePath();
  // PROBLEM: Ohne Loch in dieser Fläche gibt es keine Laibung — jede Tür kann dann
  // nur AUF dem Klinker liegen, nie darin. Deshalb hier die Rohbauöffnung als
  // echtes Loch (ShapeGeometry trianguliert Löcher und dreht die Wicklung selbst).
  const dHole=new THREE.Path();
  dHole.moveTo(-DR_W/2,DR_Y0); dHole.lineTo(DR_W/2,DR_Y0);
  dHole.lineTo(DR_W/2,DR_Y1); dHole.lineTo(-DR_W/2,DR_Y1); dHole.closePath();
  gShape.holes.push(dHole);
  const gGeo=new THREE.ShapeGeometry(gShape);
  { const p=gGeo.attributes.position, uv=gGeo.attributes.uv;
    for(let i=0;i<p.count;i++){ uv.setXY(i,(p.getX(i)+GW/2)/GW, p.getY(i)/7.45); } }
  const gable=new THREE.Mesh(gGeo,gableMat);
  gable.position.set(0,0,GBL_Z); gable.castShadow=true; gable.receiveShadow=true; scene.add(gable);
  // Giebel-Seitenwangen (schliessen den Vorsprung zur Fassade)
  [[-GW/2],[GW/2]].forEach(([x])=>{
    const cheek=new THREE.Mesh(new THREE.PlaneGeometry(0.14,5.35),mat(0xd2cec9,0.95));
    cheek.rotation.y=(x<0)?-Math.PI/2:Math.PI/2;
    cheek.position.set(x,5.35/2,0.07); scene.add(cheek);
  });
  // Zwerchgiebel-Satteldach: reicht bis zum Hauptfirst (keine Lücke) + Ortgänge + Firstziegel
  const gRun=GW/2, gRise=2.10, gLen=Math.hypot(gRun,gRise), gAng=Math.atan2(gRise,gRun);
  const gDepth=5.4, gZc=-1.9, gFrontZ=gZc+gDepth/2;   // Vorderkante bei ~0.8 (Überstand), Hinterkante am First
  [[-1],[1]].forEach(([s])=>{
    const slab=new THREE.Mesh(new THREE.BoxGeometry(gLen+0.12,0.10,gDepth),roofM);
    slab.rotation.z=s*gAng;
    slab.position.set(-s*gRun/2, 5.35+gRise/2, gZc);
    slab.castShadow=true; scene.add(slab);
    const barge=new THREE.Mesh(new THREE.BoxGeometry(gLen+0.16,0.14,0.09),mat(0xf2f1ee,0.6));
    barge.rotation.z=s*gAng;
    barge.position.set(-s*gRun/2, 5.35+gRise/2+0.04, gFrontZ+0.02);   // Ortgang an der Giebel-Vorderkante
    scene.add(barge);
  });
  // Firstziegel deckt den Schnitt der beiden Dachflächen (sonst sichtbare Naht/Loch)
  const gCap=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.12,gDepth),mat(0x33363b,0.7));
  gCap.position.set(0,7.45,gZc); gCap.castShadow=true; scene.add(gCap);
  // ---- Giebelzeichen an der Zwerchgiebelspitze ----
  // PROBLEM (nachgerechnet): Der Firstziegel gCap endet oben bei 7.45+0.06=7.51,
  // die Dachfläche im Scheitel bei 5.35+2.10+0.05/cos(49.4°)=7.527. Die alte
  // Stange lief von 7.42 bis 7.86, die Kugel sass bei 7.88 mit r=0.13, also ab
  // 7.75. Zwischen Dachscheitel (7.53) und Kugelunterkante (7.75) standen damit
  // 22 cm blanke Stange von 52 mm Durchmesser frei in der Luft — ein Spiess, kein
  // Giebelknopf. Ein echtes Giebelzeichen hat einen Sockelklotz auf dem
  // Ortgangstoss, darüber einen Fussteller, der die Fuge abdeckt, und erst dann
  // den gedrechselten Schaft. Das Verhältnis stimmt so auch: Kugel Ø 230 mm auf
  // 473 mm Gesamthöhe = knapp die Hälfte, statt vorher Ø 260 auf 46 cm Stange.
  // LatheGeometry statt Zylinder+Kugel: ein Körper, eine durchgehende Silhouette.
  const finZ=0.76;                                  // Ortgangvorderkante 0.865, Firstziegel bis 0.80
  const finBase=new THREE.Mesh(new THREE.BoxGeometry(0.17,0.13,0.24),mat(0x3b3e43,0.55));
  finBase.position.set(0,7.46,finZ-0.005);          // 7.395…7.525: steckt im Dachscheitel
  finBase.castShadow=true; scene.add(finBase);
  const finProf=[[0,0],[0.105,0],[0.105,0.032],[0.076,0.055],[0.044,0.074],
                 [0.039,0.100],[0.036,0.196],[0.056,0.214],[0.056,0.232],[0.039,0.250]];
  { const R=0.115, a0=Math.asin(0.039/R), cy=0.250+R*Math.cos(a0);   // Kugelmitte 0.358
    for(let i=1;i<=6;i++){ const a=-a0+(Math.PI/2+a0)*i/6;
      finProf.push([R*Math.cos(a), cy+R*Math.sin(a)]); } }
  const finial=new THREE.Mesh(
    new THREE.LatheGeometry(finProf.map(p=>new THREE.Vector2(p[0],p[1])),12),
    mat(0x4a4f55,0.38,0.55));                       // Zinkblech: holt sein Licht aus der Himmelsspiegelung
  finial.position.set(0,7.525,finZ);                // Oberkante 7.525+0.473=7.998
  finial.castShadow=true; scene.add(finial);
  // weisses Gesims am Giebelfuss (wie im Original über dem EG)
  const gBand=new THREE.Mesh(new THREE.BoxGeometry(GW+0.3,0.16,0.10),mat(0xeceae6,0.7));
  gBand.position.set(0,3.32,0.19); scene.add(gBand);

  // ---- Gauben links/rechts (kleine Satteldach-Giebelgauben, korrekt aufgebaut) ----
  const glassM=glassMaterial();
  [[-4.3],[4.3]].forEach(([x])=>{
    const bw=2.3, bh=1.35, bd=1.85, bz=-1.15, baseY=3.98, gr=0.92;
    const cheekM=mat(0xe7e5e1,0.85);
    const body=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,bd),cheekM);
    body.position.set(x,baseY+bh/2,bz); body.castShadow=true; body.receiveShadow=true; scene.add(body);
    // Gaubenfront + Giebeldreieck tragen den Klinker des Zwerchgiebels
    // (UVs massstabsgleich: Zwerchgiebel-Canvas deckt 3.6 m Breite / 7.5 m Höhe ab)
    const uvSX=1/3.6, uvSY=1/7.5;
    const frG=new THREE.PlaneGeometry(bw,bh);
    { const uv=frG.attributes.uv;
      for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*bw*uvSX, uv.getY(i)*bh*uvSY); }
    const frontBrick=new THREE.Mesh(frG,gableMat);
    frontBrick.position.set(x,baseY+bh/2,bz+bd/2+0.002); frontBrick.receiveShadow=true; scene.add(frontBrick);
    // Wangen (Seitenflächen) ebenfalls in Klinker — gleiche Massstabs-UVs
    [[-1],[1]].forEach(([sd])=>{
      const chG=new THREE.PlaneGeometry(bd,bh);
      { const uv=chG.attributes.uv;
        for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*bd*uvSX, uv.getY(i)*bh*uvSY); }
      const cheekBrick=new THREE.Mesh(chG,gableMat);
      cheekBrick.rotation.y=sd*Math.PI/2;
      cheekBrick.position.set(x+sd*(bw/2+0.002),baseY+bh/2,bz);
      cheekBrick.receiveShadow=true; scene.add(cheekBrick);
    });
    const tri=new THREE.Shape(); tri.moveTo(-bw/2,0); tri.lineTo(bw/2,0); tri.lineTo(0,gr); tri.closePath();
    const triG=new THREE.ShapeGeometry(tri);
    { const pos=triG.attributes.position, uv=triG.attributes.uv;
      for(let i=0;i<pos.count;i++) uv.setXY(i,(pos.getX(i)+bw/2)*uvSX,(bh+pos.getY(i))*uvSY); }
    const triM=new THREE.Mesh(triG,gableMat);
    triM.position.set(x,baseY+bh,bz+bd/2+0.002); triM.receiveShadow=true; scene.add(triM);
    // zwei Dachschrägen (First front→hinten) + weisse Ortgänge
    const run=bw/2+0.16, len=Math.hypot(run,gr), ang=Math.atan2(gr,run);
    const dRd=bd+1.2, dRz=bz-0.35;   // tiefer → Hinterkante steckt im Hauptdach (kein Schweben)
    [[-1],[1]].forEach(([s])=>{
      const sl=new THREE.Mesh(new THREE.BoxGeometry(len+0.08,0.08,dRd),roofM);
      sl.rotation.z=s*ang; sl.position.set(x - s*run/2, baseY+bh+gr/2, dRz);
      sl.castShadow=true; scene.add(sl);
      // Der Ortgang war genauso lang wie die Dachplatte darüber (len+0.08) und
      // ragte damit an der Traufe mit seiner hellen Schnittfläche frei heraus —
      // gegen das dunkle Dach las sich das als weisser Splitter. Ein Ortgangbrett
      // liegt UNTER der Dachkante und endet vor ihr: 12 cm kürzer, dann verschwindet
      // das Ende im Schatten der Platte.
      const vb=new THREE.Mesh(new THREE.BoxGeometry(len-0.04,0.10,0.07),mat(0xf2f1ee,0.6));
      vb.rotation.z=s*ang; vb.position.set(x - s*(run/2-0.05), baseY+bh+gr/2+0.005, bz+bd/2+0.02); scene.add(vb);
    });
    // Gauben-Firstziegel (deckt die Naht der beiden Dachflächen)
    const dCap=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.10,dRd),mat(0x33363b,0.7));
    dCap.position.set(x,baseY+bh+gr,dRz); scene.add(dCap);
    friesenWindow(scene,x,baseY+0.70,1.32,0.98,glassM,bz+bd/2);
  });

  // ---- Giebel-Fenster (2 schlanke Sprossenfenster, schöner proportioniert) ----
  friesenWindow(scene,-0.88,4.32,0.90,1.42,glassM,0.15);
  friesenWindow(scene, 0.88,4.32,0.90,1.42,glassM,0.15);

  // ---- EG-Fenster: je zwei links/rechts ----
  const wgrp=new THREE.Group(); scene.add(wgrp);
  [-4.55,-2.45,2.45,4.55].forEach(x=>friesenWindow(wgrp,x,1.62,1.35,1.75,glassM,0));
  // Seitenfenster links/rechts (niedrige Traufwände)
  [-1,1].forEach(s=>{
    const sg=new THREE.Group(); sg.rotation.y=s*Math.PI/2; sg.position.set(s*HW/2,0,-HD/2); scene.add(sg);
    friesenWindow(sg,-2.2,1.62,1.2,1.55,glassM,0);
    friesenWindow(sg, 2.2,1.62,1.2,1.55,glassM,0);
  });

  // ======================= HAUSTÜR MIT OBERLICHT =======================
  // PROBLEM 1 (Lage): Das alte Blatt lag als 0.08-Platte bei z=0.20. Die
  //   Klinkerfläche des Zwerchgiebels liegt bei z=0.14 — die Tür klebte also
  //   60 mm VOR der Wand und hatte keinerlei Laibung.
  // PROBLEM 2 (Farbe): Blatt 0x3f2d20, Füllungen 0x32231a. Das sind 13 Anzeige-
  //   werte im hellsten Kanal — bei diffusem Licht unsichtbar, die Füllungen
  //   waren praktisch aufgemalt. Schlimmer noch die Grundhelligkeit: die lineare
  //   Leuchtdichte von 0x3f2d20 ist 0.031, der Klinker liegt bei 0.139. Das sind
  //   22 % — noch weniger als die 18 %, mit denen sich die EFH-Tür als schwarzes
  //   Loch gemessen hat (dort funktionierten erst 44 %).
  // LÖSUNG: echtes Loch im Giebel, ausgemauerte Laibung, Blatt hinter dem
  //   Anschlag, und Rahmen gegen Füllung als MATERIALwechsel:
  //   Rahmen 0x3d5046 = 0.075 linear (54 % vom Klinker, über der EFH-Schwelle),
  //   Füllung 0xbfb6a2 = 0.466 linear. Faktor 6.2 — das trägt auch dann noch,
  //   wenn die Laibung die Hälfte des Lichts wegnimmt.
  // z-Kette (aussen = +z), Summe muss REVEAL = 0.139 m ergeben:
  //   0.140 Klinker → 0.116 Anschlagfront   (24 mm sichtbare Laibung = Schattenfuge)
  //   0.116 → 0.094 Anschlag                (lappt 22 mm über die Blattkante)
  //   0.092 → 0.012 Türblatt                (80 mm dick, 2 mm Luft zum Anschlag)
  //   0.012 → 0.001 Luft vor der Fassade    (11 mm, kein z-Fighting)
  { const OW=DR_W, OY0=DR_Y0, OY1=DR_Y1;
    const BW=1.06, BH=2.06, BT=0.080;            // Blattmass: 1.06 x 2.06 x 0.080 m
    const zStop=0.116, zFtr=0.094, zBlt=0.092, zBck=0.006;
    const aF=1.064/2, aA=1.016/2;                // Futter- bzw. Anschlagöffnung
    const yThr=0.120, yB0=0.130, yB1=yB0+BH;     // Schwelle OK / Blatt 0.130…2.190
    const yK1=yB1+0.080;                         // Kämpferriegel Oberkante 2.270
    const yH0=OY1-0.068;                         // Sturzfutter Unterkante 2.812
    const olH=yH0-yK1, olY=(yK1+yH0)/2;          // Oberlicht 0.542 m hoch, Mitte 2.541
    // Boxen über Min/Max statt Mitte+Grösse: nur so lassen sich Anschlag, Futter
    // und Laibung so aneinanderlegen, dass sich keine zwei Flächen decken.
    const bx=(x0,x1,y0,y1,z0,z1,m,sh)=>{
      const b=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0),m);
      b.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
      if(sh){ b.castShadow=true; b.receiveShadow=true; }
      scene.add(b); return b; };

    // --- Laibung: die Klinker-Schnittfläche der 0.139 m tiefen Öffnung.
    // Rückseite bei FAC_Z+0.003, damit sie nicht mit der Fassadenebene z-fightet.
    // Die Vorderkante darf NICHT auf GBL_Z=0.14 liegen: die Laibungsklötze stehen
    // hinter dem Giebelklinker, ihre Vorderflächen lägen dann exakt auf dessen
    // Ebene und würden entlang der ganzen Türkante z-fighten. 4 mm davor statt
    // dahinter, weil ein Rücksprung eine 4-mm-Lücke am Anschlagwinkel aufreisst;
    // der Überstand verschwindet unter Fasche, Schwelle und Stufe.
    revealMat=new THREE.MeshStandardMaterial({color:0xb8b4ae,roughness:0.95});
    const rz0=FAC_Z+0.003, rz1=GBL_Z+0.004;
    bx(-OW/2-0.06,-OW/2, OY0,OY1, rz0,rz1, revealMat,true);        // linke Laibung
    bx( OW/2, OW/2+0.06, OY0,OY1, rz0,rz1, revealMat,true);        // rechte Laibung
    bx(-OW/2-0.06,OW/2+0.06, OY1,OY1+0.06, rz0,rz1, revealMat,true);   // Sturz
    bx(-OW/2-0.06,OW/2+0.06, OY0-0.06,OY0, rz0,rz1, revealMat,false);  // Sohle
    { const bk=new THREE.Mesh(new THREE.PlaneGeometry(OW,OY1-OY0),mat(0x1e1b18,1));
      bk.position.set(0,(OY0+OY1)/2,zBck); scene.add(bk); }        // dunkler Grund

    // --- Zarge: Futter füllt die Laibung, davor der Anschlag mit kleinerer
    // Öffnung. Das ist das Bauteil, das die Schattenfuge am Blattrand erzeugt.
    const zM=mat(0xdfdad1,0.6);
    bx(-OW/2,-aF, 0.10,OY1, zBck,zFtr, zM,true);
    bx( aF, OW/2, 0.10,OY1, zBck,zFtr, zM,true);
    bx(-aF,aF, yH0,OY1, zBck,zFtr, zM,true);          // Sturzfutter
    bx(-aF,aF, yB1,yK1, zBck,zFtr, zM,true);          // Kämpferriegel
    bx(-OW/2,-aA, yThr+0.002,OY1, zFtr,zStop, zM,true);
    bx( aA, OW/2, yThr+0.002,OY1, zFtr,zStop, zM,true);
    bx(-aA,aA, yH0-0.022,OY1, zFtr,zStop, zM,true);   // Anschlag am Sturz
    bx(-aA,aA, yB1-0.022,yK1+0.022, zFtr,zStop, zM,true);  // Anschlag am Kämpfer

    // --- Türblatt: ExtrudeGeometry mit vier Löchern. Die Füllungen sind damit
    // echte Öffnungen im Blatt, nicht aufgeklebte Plättchen; die Füllungsplatten
    // sitzen 12 mm dahinter und stopfen sie von hinten. Klassische Aufteilung:
    // Seitenfriese 0.15, Mittelstiel 0.12, Querfriese unten 0.19 / mitte 0.20 /
    // oben 0.15 — untere Füllungen 0.32x0.86, obere 0.32x0.66.
    const fx=[-0.41,-0.09,0.09,0.41], fyL=[-0.84,0.02], fyU=[0.22,0.88];
    const bShape=new THREE.Shape();
    bShape.moveTo(-BW/2,-BH/2); bShape.lineTo(BW/2,-BH/2);
    bShape.lineTo(BW/2,BH/2); bShape.lineTo(-BW/2,BH/2); bShape.closePath();
    [[fx[0],fx[1],fyL],[fx[2],fx[3],fyL],[fx[0],fx[1],fyU],[fx[2],fx[3],fyU]]
      .forEach(([x0,x1,fy])=>{ const p=new THREE.Path();
        p.moveTo(x0,fy[0]); p.lineTo(x1,fy[0]); p.lineTo(x1,fy[1]); p.lineTo(x0,fy[1]);
        p.closePath(); bShape.holes.push(p); });
    const leafM=new THREE.MeshStandardMaterial({color:0x3d5046,roughness:0.42,envMapIntensity:1.0});
    const leaf=new THREE.Mesh(new THREE.ExtrudeGeometry(bShape,{depth:BT,bevelEnabled:false}),leafM);
    leaf.position.set(0,yB0+BH/2,zBlt-BT); leaf.castShadow=true; leaf.receiveShadow=true; scene.add(leaf);
    const panM=mat(0xbfb6a2,0.55);
    [[fx[0],fx[1],fyL],[fx[2],fx[3],fyL],[fx[0],fx[1],fyU],[fx[2],fx[3],fyU]]
      .forEach(([x0,x1,fy])=>{
        // 6 mm Übergriff ringsum, damit die Platte in der Nut sitzt statt im Loch
        bx(x0-0.006,x1+0.006, yB0+BH/2+fy[0]-0.006, yB0+BH/2+fy[1]+0.006,
           zBlt-0.038,zBlt-0.012, panM,false); });

    // --- Beschlag in realer Grösse: Knauf Ø 76 mm auf Rosette Ø 116 mm, Mitte bei
    // y=1.16, also 1.04 m über der Schwelle (Norm-Drückerhöhe), auf dem rechten
    // Fries (x 0.41…0.53, Mitte 0.47). Messing, weil Metall sein Licht aus
    // der Himmelsspiegelung
    // holt — es funktioniert genau dort, wo in der Laibung die Farbstufe versagt.
    const brs=mat(0xa8935e,0.28,0.9);
    const ros=new THREE.Mesh(new THREE.CylinderGeometry(0.058,0.058,0.018,14),brs);
    ros.rotation.x=Math.PI/2; ros.position.set(0.47,1.16,zBlt+0.009); scene.add(ros);
    const knob=new THREE.Mesh(new THREE.SphereGeometry(0.038,12,8),brs);
    knob.scale.z=0.8; knob.position.set(0.47,1.16,zBlt+0.044);   // ragt 74 mm vor
    knob.castShadow=true; scene.add(knob);
    const key=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.012,10),brs);
    key.rotation.x=Math.PI/2; key.position.set(0.47,0.99,zBlt+0.006); scene.add(key);
    bx(-0.13,0.13, 1.261,1.299, zBlt,zBlt+0.012, brs,false);      // Briefschlitz

    // --- Oberlicht: warmer Grund (beleuchtete Diele) statt schwarzem Glas,
    // darüber glassMaterial() und davor drei ECHTE Sprossen mit 20 mm Tiefe,
    // die vier Scheiben à 0.254 x 0.542 teilen.
    const olBg=new THREE.Mesh(new THREE.PlaneGeometry(2*aF,olH),
      new THREE.MeshBasicMaterial({color:0xe8d9bb}));
    olBg.position.set(0,olY,0.030); scene.add(olBg);
    const olGl=new THREE.Mesh(new THREE.PlaneGeometry(2*aF,olH),glassM);
    olGl.position.set(0,olY,0.080); scene.add(olGl);
    const sprM=mat(0xf6f5f2,0.55);
    [-0.254,0,0.254].forEach(px=> bx(px-0.014,px+0.014, yK1,yH0, 0.086,0.106, sprM,false));

    // --- Schwelle: Naturstein, Oberkante 0.120, ragt 15 mm über die Klinker-
    // fläche hinaus (0.155 gegen 0.140), damit Wasser abtropft statt in die Fuge
    // zu laufen. Die Stufe davor endet bei z=0.030 und läuft unter der Schwelle
    // durch — vorher klaffte zwischen Tritt und Türfuss eine Lücke.
    bx(-0.65,0.65, 0.045,yThr, 0.005,0.155, mat(0xb0aca4,0.55,0.15), true);
    bx(-0.90,0.90, 0.0,0.10, 0.030,0.770, mat(0xc9c6c0,0.85), true);

    // --- weisse Fasche auf dem Klinker, wie bei den Fenstern (friesenWindow).
    // Innenkante exakt auf der Öffnungskante: die 24 mm Laibung dahinter bleiben
    // als Schattenlinie sichtbar. 3 mm vor der Klinkerebene → kein z-Fighting.
    const fas=mat(0xeceae6,0.7);
    bx(-0.70,-OW/2, yThr,OY1, GBL_Z+0.003,GBL_Z+0.036, fas,true);
    bx( OW/2,0.70, yThr,OY1, GBL_Z+0.003,GBL_Z+0.036, fas,true);
    bx(-0.70,0.70, OY1,OY1+0.10, GBL_Z+0.003,GBL_Z+0.036, fas,true);
  }

  // ---- Buchshecken + Dünengräser (symmetrisch wie im Original) ----
  const beds=new THREE.Group(); scene.add(beds);
  const hedgeM=new THREE.MeshStandardMaterial({map:noiseTex('#41552f',22,256,128),roughness:1});
  [[-4.6,1.75,5.4],[4.6,1.75,5.4]].forEach(([x,z,w])=>{
    const h=new THREE.Mesh(new THREE.BoxGeometry(w,0.4,0.55),hedgeM);
    h.position.set(x,0.2,z); h.castShadow=true; h.receiveShadow=true; beds.add(h);
  });
  [[-5.6,0.9],[-4.0,1.1],[-2.6,0.8],[2.7,1.0],[4.2,0.8],[5.7,1.1]].forEach(([x,z])=>grassTuft(x,z,1.5,beds,true));
  [[-7.4,8.4],[-6.8,9.1],[7.3,8.5],[6.9,9.2]].forEach(([x,z])=>grassTuft(x,z,1.7,beds,true));
  [[-7.6,3.4],[7.6,3.4]].forEach(([x,z])=>{
    const h=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.5,0.6),hedgeM);
    h.position.set(x,0.25,z); beds.add(h);
  });

  // ---- Kulisse: flaches Marschland, Knick-Hecken, ferne Baumreihe ----
  const hedgeBG=new THREE.Mesh(new THREE.BoxGeometry(26,1.3,0.9),
    new THREE.MeshStandardMaterial({map:noiseTex('#5d6a48',24,512,64),roughness:1}));
  hedgeBG.position.set(14,0.65,-11); scene.add(hedgeBG);
  const hedgeBG2=hedgeBG.clone(); hedgeBG2.position.set(-16,0.65,-12); scene.add(hedgeBG2);
  [[-12,-16],[-8,-17],[10,-18],[15,-16],[20,-19]].forEach(([x,z])=>{
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.12,1.5,8),mat(0x5d4a38,1));
    tr.position.set(x,0.75,z); scene.add(tr);
    const fo=new THREE.Mesh(new THREE.IcosahedronGeometry(1.4,1),mat(0x64744f,1));
    fo.scale.set(1.1,0.95,1); fo.position.set(x,2.2,z); scene.add(fo);
  });

  camera=new THREE.PerspectiveCamera(46,16/10,0.5,180);
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
      radT=Math.min(R_MAX,Math.max(R_MIN,radT+e.deltaY*0.008)); },{passive:false});
  }catch(e){ failed=true; console.warn('Friesen3D deaktiviert:',e); return false; }
  return true;
}
function sizeToHost(){
  if(!renderer||!host) return;
  const w=Math.max(220,host.clientWidth||300), h=Math.max(220,host.clientHeight||240);
  renderer.setPixelRatio(Math.min(MOBILE?1.5:2,window.devicePixelRatio||1));
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.fov=(camera.aspect>1.45)?34:(camera.aspect>1.1?38:46);
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
// Fugentiefe in UV-Einheiten (~14 mm auf die von der Textur abgedeckte Breite)
function applyTex(m,cv,fallback,rough,ns,pom){
  applySurface(m,cv,{fallback,rough,normalScale:ns!=null?ns:0.9,aniso:maxAniso,
    env:cv?0.40:0.3, pom:pom||0});
}
window.Friesen3D={
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
  },
  // Fassade EG, Seiten, Vorplatz, Zwerchgiebel — je ein Canvas (null → neutral)
  setTextures(facadeCv,sideCv,floorCv,gableCv){
    if(!renderer) return;
    applyTex(facadeMat,facadeCv,0xdad6d1,1.0,0.9,0.0026);
    applyTex(gableMat,gableCv||facadeCv,0xdad6d1,1.0,0.9,0.0035);
    applyTex(sideMatL,sideCv||facadeCv,0xd7d3ce,1.0,0.9,0.0031);
    applyTex(sideMatR,sideCv||facadeCv,0xd7d3ce,1.0,0.9,0.0031);
    applyTex(floorMat,floorCv,0xd0cdc8,0.8,0.55);
    // Die Türlaibung trägt DAS PRODUKT, sonst stünde grauer Putz in einer
    // Klinkerwand. Als Schnittfläche sieht sie weniger Himmel → tint dunkelt ab.
    // Kein POM: bei 0.136 m Streifenbreite kostet der Raymarch mehr, als er zeigt.
    if(revealMat) applySurface(revealMat,gableCv||facadeCv,{fallback:0xb8b4ae,tint:0xa8a49e,
      rough:1.0,normalScale:0.7,aniso:maxAniso,env:0.28,pom:0});
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
window.dispatchEvent(new Event('friesen3d-ready'));
