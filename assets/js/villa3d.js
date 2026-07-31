// ===================== KLINKERBOX · 3D-VILLA (AUSSEN) =====================
// Klassizistische Stadtvilla für die Aussen-Ansicht: Walmdach mit Gaube,
// zwei Vollgeschosse mit fünf Fensterachsen, weisse Faschen + Gesimse,
// Portikus mit Freitreppe und Geländer, Buchs-Vorgarten mit Metallzaun.
// Fassade (vorne + Seiten) trägt den Wand-Mix, der Vorplatz den Boden-Mix.
import * as THREE from './three.module.min.js';
import { buildEnv, glassMaterial, skyDomeTexture, applySurface, disposeScene, addVignette, interiorRoom, bushClump, groundContact, LOWQ } from './scene3d-lib.js?v=54';

const MOBILE=LOWQ;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let facadeMat=null, sideMatL=null, sideMatR=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

const TARGET=new THREE.Vector3(0,3.6,1.2);
let az=0.50, po=1.6300, rad=22.0;   // Augpunkt 3.60-1.30=2.30 m statt 3.60+0.63=4.23 m
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.85, AZ_MAX=0.85, PO_MIN=1.32, PO_MAX=1.6572, R_MIN=12, R_MAX=28;

const HW=13.0, HE=7.0, HD=10.0;                 // Breite, Traufe, Tiefe
// Fugentiefe in UV-Einheiten, geometrisches Mittel beider Texturachsen bei 16 mm
const POM_F=0.016/Math.sqrt(HW*HE), POM_S=0.016/Math.sqrt(HD*HE);
const PL=0.75;                                   // Sockelhöhe

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
function roofTex(){
  const cv=document.createElement('canvas'); cv.width=512; cv.height=512;
  const c=cv.getContext('2d'); c.fillStyle='#3d4045'; c.fillRect(0,0,512,512);
  for(let y=0;y<512;y+=26){ c.fillStyle='rgba(0,0,0,0.35)'; c.fillRect(0,y,512,3);
    for(let x=((y/26)%2)*24;x<512;x+=48){ c.fillStyle='rgba(0,0,0,0.16)'; c.fillRect(x,y+3,2,23); }
    c.fillStyle='rgba(255,255,255,0.05)'; c.fillRect(0,y+4,512,2); }
  const t=new THREE.CanvasTexture(cv); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
function bush(x,z,r,c,parent){
  const b=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),mat(c||0x46583c,1));
  b.position.set(x,r*0.72,z); b.scale.set(1,0.82,1); b.castShadow=true; parent.add(b);
}
function conifer(x,z,h,parent){
  const c=new THREE.Mesh(new THREE.ConeGeometry(h*0.32,h,10),mat(0x3f5238,1));
  c.position.set(x,h/2,z); c.castShadow=true; parent.add(c);
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
// Walmdach: 2 Trapez-Flächen (vorn/hinten) + 2 Dreiecks-Walme (links/rechts)
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
  quad(A,B,C,D,[[0,0],[1,0],[0.62,1],[0.38,1]]);            // Front-Trapez
  quad(E,F,D,C,[[0,0],[1,0],[0.62,1],[0.38,1]]);            // Rück-Trapez
  tri(F,A,D,[[0,0],[1,0],[0.5,1]]);                          // Walm links
  tri(B,E,C,[[0,0],[1,0],[0.5,1]]);                          // Walm rechts
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Villen-Fenster: weisse Fasche + Verdachung, Kreuz-Sprossen, Sims
function villaWindow(parent,x,y,w,h,glassM,pediment){
  const sur=new THREE.Mesh(new THREE.BoxGeometry(w+0.28,h+0.28,0.06),mat(0xeceae6,0.7));
  sur.position.set(x,y,0.03); parent.add(sur);
  // Innenraum VOR die Fassung (sonst verdeckt die weisse Fassungs-Front den Raum → wirkte flach)
  const inter=new THREE.Mesh(new THREE.PlaneGeometry(w-0.02,h-0.02),interiorRoom(w-0.02,h-0.02,2.2,x*2.9+y*1.7,'home'));
  inter.position.set(x,y,0.075); parent.add(inter);           // 3D-Innenraum (Interior-Mapping)
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(w-0.02,h-0.02),glassM);
  glass.position.set(x,y,0.096); parent.add(glass);           // reflektierendes Glas
  const mv=new THREE.Mesh(new THREE.BoxGeometry(0.05,h-0.1,0.02),mat(0xf4f3f0,0.6));
  mv.position.set(x,y,0.108); parent.add(mv);
  const mh=new THREE.Mesh(new THREE.BoxGeometry(w-0.1,0.05,0.02),mat(0xf4f3f0,0.6));
  mh.position.set(x,y+h*0.18,0.108); parent.add(mh);
  const sill=new THREE.Mesh(new THREE.BoxGeometry(w+0.34,0.07,0.14),mat(0xe6e4e0,0.7));
  sill.position.set(x,y-h/2-0.17,0.07); sill.castShadow=true; parent.add(sill);
  if(pediment){
    const ped=new THREE.Mesh(new THREE.BoxGeometry(w+0.44,0.16,0.12),mat(0xeceae6,0.7));
    ped.position.set(x,y+h/2+0.24,0.06); ped.castShadow=true; parent.add(ped);
  }
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
  sun.position.set(20,14,11);                    // streifendes Nachmittagslicht → Relief + Schattenwurf
  sun.target.position.set(0,0,1);
  sun.castShadow=true;
  sun.shadow.mapSize.set(MOBILE?1024:4096,MOBILE?1024:4096);
  sun.shadow.camera.left=-18; sun.shadow.camera.right=15;
  sun.shadow.camera.top=16;   sun.shadow.camera.bottom=-9;
  sun.shadow.camera.near=1; sun.shadow.camera.far=60;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.035;
  sun.shadow.radius=MOBILE?1:5;                   // PCF-Kernel → weiche Schattenkante
  scene.add(sun); scene.add(sun.target);

  // ---- Gelände: Rasen + Vorplatz (Boden-Mix) + Weg ----
  const lawnT=noiseTex('#7f8f60',26,512,512); lawnT.repeat.set(12,12);
  const lawn=new THREE.Mesh(new THREE.PlaneGeometry(110,110),
    new THREE.MeshStandardMaterial({map:lawnT,roughness:1}));
  lawn.rotation.x=-Math.PI/2; lawn.position.set(0,-0.01,10); lawn.receiveShadow=true; scene.add(lawn);
  floorMat=new THREE.MeshStandardMaterial({color:0xd0cdc8,roughness:0.8,envMapIntensity:0.4});
  const fore=new THREE.Mesh(new THREE.PlaneGeometry(15,6.6),floorMat);
  fore.rotation.x=-Math.PI/2; fore.position.set(0,0.005,4.9);
  fore.receiveShadow=true; scene.add(fore);
  const bedT=noiseTex('#8d857a',26,256,256); bedT.repeat.set(10,1);
  const bed=new THREE.Mesh(new THREE.PlaneGeometry(15,1.6),
    new THREE.MeshStandardMaterial({map:bedT,roughness:1}));
  bed.rotation.x=-Math.PI/2; bed.position.set(0,0.004,0.8); bed.receiveShadow=true; scene.add(bed);

  // ---- Hauskörper: Sockel + Fassade (Produkt-Textur) ----
  const plinth=new THREE.Mesh(new THREE.BoxGeometry(HW+0.12,PL,HD+0.12),mat(0xb9b5ae,0.9));
  plinth.position.set(0,PL/2,-HD/2); plinth.receiveShadow=true; scene.add(plinth);
  [[-2.6],[2.6],[-5.2],[5.2]].forEach(([x])=>{
    const bw=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.4,0.05),mat(0x2c2f33,0.7));
    bw.position.set(x,0.38,0.09); scene.add(bw);
  });
  facadeMat=new THREE.MeshStandardMaterial({color:0xdad6d1,roughness:0.95});
  const front=new THREE.Mesh(new THREE.PlaneGeometry(HW,HE-PL),facadeMat);
  front.position.set(0,PL+(HE-PL)/2,0.001); front.receiveShadow=true; scene.add(front);
  sideMatL=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  sideMatR=new THREE.MeshStandardMaterial({color:0xd7d3ce,roughness:0.95});
  const sideL=new THREE.Mesh(new THREE.PlaneGeometry(HD,HE-PL),sideMatL);
  sideL.rotation.y=-Math.PI/2; sideL.position.set(-HW/2,PL+(HE-PL)/2,-HD/2); sideL.receiveShadow=true; scene.add(sideL);
  const sideR=new THREE.Mesh(new THREE.PlaneGeometry(HD,HE-PL),sideMatR);
  sideR.rotation.y=Math.PI/2; sideR.position.set(HW/2,PL+(HE-PL)/2,-HD/2); sideR.receiveShadow=true; scene.add(sideR);
  const back=new THREE.Mesh(new THREE.PlaneGeometry(HW,HE-PL),mat(0xcfccc7,1));
  back.rotation.y=Math.PI; back.position.set(0,PL+(HE-PL)/2,-HD); scene.add(back);

  // ---- Traufgesims (Dachrand) — mittleres Gurtband entfernt (zu dominante waagerechte Linie) ----
  const cornice=new THREE.Mesh(new THREE.BoxGeometry(HW+0.7,0.30,HD+0.7),mat(0xeceae6,0.7));
  cornice.position.set(0,HE+0.19,-HD/2); cornice.castShadow=true; scene.add(cornice);

  // ---- Walmdach + Gaube ----
  const rT=roofTex(); rT.repeat.set(7,3);
  const roofM=new THREE.MeshStandardMaterial({map:rT,roughness:0.85,side:THREE.DoubleSide});
  const roof=new THREE.Mesh(hipRoofGeo(HW+0.9,HD+0.9,2.95,(HW-HD)/2+0.4),roofM);
  // receiveShadow war aus: die Gaube warf keinen Schatten auf die Dachfläche und
  // wirkte dadurch aufgeklebt. Sonneneinfall 49° zur Dachnormalen → kein Acne-Risiko.
  roof.position.set(0,HE+0.34,-HD/2); roof.castShadow=true; roof.receiveShadow=true; scene.add(roof);
  // ---- Gaube (Schleppgaube) ----
  // PROBLEM 1: BoxGeometry(dW,1.90,dBz-dFz) bekam dBz-dFz = -2.60-(-0.60) = -2.00,
  // also eine NEGATIVE Tiefe. Three.js spiegelt die Box dann an z, alle Umlaufsinne
  // kippen, das Backface-Culling schluckt die Wangen — deshalb stand rechts eine
  // harte helle Fläche wie ein Loch (man sah in den Kasten hinein).
  // PROBLEM 2: Die Box war unten bei y=7.25 waagerecht gekappt, die Dachhaut steigt
  // aber von 7.91 (Gaubenfront) auf 8.99 (z=-2.60) — der Anschluss war Zufall, oben
  // hinten fehlten 0.16 m. Jetzt folgen Wangen und Gaubendach der gemessenen Neigung.
  const dRT=2.95/((HD+0.9)/2);                  // Walmdach-Neigung 2.95/5.45 = 0.5413 → 28.42°
  const dEZ=-HD/2+(HD+0.9)/2, dEY=HE+0.34;      // vordere Traufkante: z=+0.45, y=7.34
  const roofY=z=>dEY+(dEZ-z)*dRT;               // Dachhaut-Höhe über z (vorderes Trapez)
  const dW=3.30, dFz=-0.55, dWT=0.14;           // Gaubenfront-z, Wandstärke
  const dTopF=9.10, dPT=0.12;                   // Unterkante Gaubendach vorn, Plattenstärke
  const dRD=Math.tan(6*Math.PI/180);            // 6° Gaubendach-Gefälle nach vorn (Wasserablauf)
  const dachY=z=>dTopF+(dFz-z)*dRD;             // Unterseite Gaubendach über z
  // z, bei dem eine Gaubendach-Linie der Höhe y0 (bei z=dFz) die Dachhaut trifft
  const dieZ=y0=>(dEY+dEZ*dRT-(y0+dFz*dRD))/(dRT-dRD);
  // 0.05 m über den Schnittpunkt hinaus = 0.05*(0.5413-0.1051) = 22 mm unter der
  // Dachhaut: klar mehr als die 3-5 mm gegen z-Fighting, aber unsichtbar.
  const dZU=dieZ(dTopF)-0.05, dZT=dieZ(dTopF+dPT)-0.05;   // -3.394 / -3.669
  // Front mit ECHTEN Fensteröffnungen (Shape + Path-Löcher) statt aufgesetzter Platten
  const dwy=8.50, dwW=0.72, dwH=0.78;
  const dyBot=roofY(dFz)-0.18, dyTop=dachY(dFz-dWT)+0.01;  // 7.70 / 9.12: unten 0.18 in die
  const dfS=new THREE.Shape();                             // Dachhaut, oben 0.01 in die Platte
  dfS.moveTo(-dW/2,dyBot); dfS.lineTo(dW/2,dyBot); dfS.lineTo(dW/2,dyTop); dfS.lineTo(-dW/2,dyTop);
  [-1.02,0,1.02].forEach(x=>{ const hp=new THREE.Path();
    hp.moveTo(x-dwW/2,dwy-dwH/2); hp.lineTo(x-dwW/2,dwy+dwH/2);
    hp.lineTo(x+dwW/2,dwy+dwH/2); hp.lineTo(x+dwW/2,dwy-dwH/2); hp.closePath(); dfS.holes.push(hp); });
  const dFront=new THREE.Mesh(new THREE.ExtrudeGeometry(dfS,{depth:dWT,bevelEnabled:false}),mat(0xe9e7e3,0.85));
  dFront.position.z=dFz-dWT; dFront.castShadow=true; dFront.receiveShadow=true; scene.add(dFront);
  // Wangen: Profil in der z/y-Ebene, Oberkante am Gaubendach, Unterkante 0.12 unter
  // der Dachhaut — dadurch schneidet die Dachfläche selbst die Silhouette, kein Spalt.
  const dwS=new THREE.Shape();
  dwS.moveTo(dFz-dWT,roofY(dFz-dWT)-0.12); dwS.lineTo(dFz-dWT,dachY(dFz-dWT)+0.01);
  dwS.lineTo(dZU,dachY(dZU)+0.01);         dwS.lineTo(dZU,roofY(dZU)-0.12);
  const dwG=new THREE.ExtrudeGeometry(dwS,{depth:0.09,bevelEnabled:false});
  [dW/2,-dW/2+0.09].forEach(px=>{          // rotation.y=-PI/2: Shape-x → Welt-z, Extrusion → -x
    const w=new THREE.Mesh(dwG,mat(0xe4e1dc,0.85));
    w.rotation.y=-Math.PI/2; w.position.x=px; w.castShadow=true; w.receiveShadow=true; scene.add(w);
  });
  // Gaubendach: Keilprofil, hintere Kante liegt in der Dachhaut → wird sauber gekappt
  const drS=new THREE.Shape();
  drS.moveTo(dFz+0.22,dachY(dFz+0.22));         drS.lineTo(dFz+0.22,dachY(dFz+0.22)+dPT);
  drS.lineTo(dZT,dachY(dZT)+dPT);               drS.lineTo(dZU,dachY(dZU));
  const dRoof=new THREE.Mesh(new THREE.ExtrudeGeometry(drS,{depth:dW+0.44,bevelEnabled:false}),mat(0x3b3e43,0.7));
  dRoof.rotation.y=-Math.PI/2; dRoof.position.x=dW/2+0.22; dRoof.castShadow=true; scene.add(dRoof);
  const dFascia=new THREE.Mesh(new THREE.BoxGeometry(dW+0.40,0.13,0.035),mat(0xe6e4e0,0.7));
  dFascia.position.set(0,dachY(dFz+0.22)+dPT/2-0.005,dFz+0.22+0.023); dFascia.castShadow=true; scene.add(dFascia);
  const glassM=glassMaterial();
  // Fenster sitzen jetzt IN der 0.14 m tiefen Laibung des Extrusionslochs
  [-1.02,0,1.02].forEach(x=>{
    const inter=new THREE.Mesh(new THREE.PlaneGeometry(dwW,dwH),
      interiorRoom(dwW,dwH,2.2,x*5.7+7.9,'home',0,'estrich'));
    inter.position.set(x,dwy,dFz-dWT-0.02); scene.add(inter);
    const g=new THREE.Mesh(new THREE.PlaneGeometry(dwW,dwH),glassM);
    g.position.set(x,dwy,dFz-0.055); scene.add(g);
    const fw=0.055, frM=mat(0xf4f3f0,0.6);
    [[0,dwy+dwH/2-fw/2,dwW,fw],[0,dwy-dwH/2+fw/2,dwW,fw],
     [-dwW/2+fw/2,dwy,fw,dwH-fw*2],[dwW/2-fw/2,dwy,fw,dwH-fw*2],
     [0,dwy,0.03,dwH-fw*2]].forEach(([dx,dy,bw,bh])=>{
      const b=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,0.045),frM);
      b.position.set(x+dx,dy,dFz-0.045); scene.add(b); });
  });

  // ---- Fenster: OG fünf Achsen (mit Verdachung), EG vier Achsen ----
  const wgrp=new THREE.Group(); scene.add(wgrp);
  [-5.2,-2.6,0,2.6,5.2].forEach(x=>villaWindow(wgrp,x,5.35,1.15,1.9,glassM,true));
  [-5.2,-2.6,2.6,5.2].forEach(x=>villaWindow(wgrp,x,2.05,1.2,2.1,glassM,false));
  // Seitenfenster links/rechts: zwei Geschosse
  [-1,1].forEach(s=>{
    const sg=new THREE.Group(); sg.rotation.y=s*Math.PI/2; sg.position.set(s*HW/2,0,-HD/2); scene.add(sg);
    [-2.6,0,2.6].forEach(lx=>villaWindow(sg,lx,5.35,1.15,1.9,glassM,true));
    [-2.6,2.6].forEach(lx=>villaWindow(sg,lx,2.05,1.2,2.1,glassM,false));
  });

  // ---- Portikus: Pilaster + Gebälk + Doppeltür + Oberlicht ----
  // PROBLEM: Gebälk 3.60 breit über Kapitellen 0.50 über Pilastern 0.38 — gemessen
  // kragte das Gebälk 0.16 und die nur 0.12 dünne Kapitellplatte 0.06 je Seite über
  // den Pilaster hinaus, dazwischen (Kapitell-Oberkante 3.72, Gebälk-Unterkante 3.78)
  // standen 0.06 m Luft. Das waren die beiden weissen Splitter. Jetzt enden alle
  // Teile bündig auf der Pilasterflucht x=±1.64; ausgekragt wird nur noch nach vorn.
  const PX=1.45, PW=0.38, POUT=PX+PW/2;
  [-PX,PX].forEach(x=>{
    const p=new THREE.Mesh(new THREE.BoxGeometry(PW,2.87,0.22),mat(0xeceae6,0.7));
    p.position.set(x,PL+1.435,0.11); p.castShadow=true; scene.add(p);        // 0.75 … 3.62
    const cap=new THREE.Mesh(new THREE.BoxGeometry(PW,0.16,0.30),mat(0xe6e4e0,0.7));
    cap.position.set(x,3.70,0.15); cap.castShadow=true; scene.add(cap);      // 3.62 … 3.78, fugenlos
  });
  const frieze=new THREE.Mesh(new THREE.BoxGeometry(POUT*2,0.42,0.26),mat(0xeceae6,0.7));
  frieze.position.set(0,3.99,0.13); frieze.castShadow=true; scene.add(frieze);          // 3.78 … 4.20
  const corn=new THREE.Mesh(new THREE.BoxGeometry(POUT*2,0.14,0.38),mat(0xeceae6,0.7));
  corn.position.set(0,4.27,0.19); corn.castShadow=true; scene.add(corn);                // 4.20 … 4.34

  // ---- Haustür ----
  // PROBLEM: Die Blätter lagen bei z 0.055…0.125, der graue "Gewände"-Block endete
  // bei 0.08 — die Tür klebte VOR der Wand statt in einer Leibung. Die Füllungen
  // waren 0.015 erhabene Rechtecke, der Knauf ø0.09 steckte zur Hälfte im Blatt.
  const OHW=0.93, OY0=0.74, OY1=3.54;            // Nische 1.86 breit, Sturz bündig unter dem Gebälk
  const nb=new THREE.Mesh(new THREE.PlaneGeometry(OHW*2,OY1-OY0),mat(0x3c3830,0.95));
  nb.position.set(0,(OY0+OY1)/2,0.016); scene.add(nb);          // dunkler Nischengrund
  const gwM=mat(0xeceae6,0.7);
  [-1,1].forEach(s=>{ const j=new THREE.Mesh(new THREE.BoxGeometry(0.22,OY1-OY0,0.13),gwM);
    j.position.set(s*(OHW+0.11),(OY0+OY1)/2,0.07); j.castShadow=true; scene.add(j); });
  const lint=new THREE.Mesh(new THREE.BoxGeometry(OHW*2+0.44,0.24,0.13),gwM);
  lint.position.set(0,OY1+0.12,0.07); lint.castShadow=true; scene.add(lint);
  // Podest: zwischen Sockelfront (z=0.06) und oberster Stufe (z=0.55) klafften 0.49 m
  // offener Boden — die Schwelle hätte über einem Loch gestanden. Reicht bis z=0.80
  // und x=±1.70, damit auch die oberen Geländerpfosten (x=±1.60, z=0.70) aufstehen;
  // Oberkante 0.747 statt 0.750, sonst z-Fighting mit der obersten Stufe.
  const landing=new THREE.Mesh(new THREE.BoxGeometry(3.40,0.13,0.74),mat(0xc9c6c0,0.85));
  landing.position.set(0,0.682,0.43); landing.receiveShadow=true; landing.castShadow=true; scene.add(landing);
  const thr=new THREE.Mesh(new THREE.BoxGeometry(1.98,0.05,0.30),mat(0xb0aca5,0.75));
  thr.position.set(0,0.765,0.15); thr.castShadow=true; thr.receiveShadow=true; scene.add(thr);
  // Zarge als EIN Rahmen mit Loch; Vorderkante 0.105 liegt 0.03 hinter dem Gewände
  const doorM=mat(0x5d3a26,0.5);
  const zS=new THREE.Shape();
  zS.moveTo(-OHW,OY0); zS.lineTo(OHW,OY0); zS.lineTo(OHW,OY1); zS.lineTo(-OHW,OY1);
  const zH=new THREE.Path();
  zH.moveTo(-0.875,0.79); zH.lineTo(0.875,0.79); zH.lineTo(0.875,3.46); zH.lineTo(-0.875,3.46); zH.closePath();
  zS.holes.push(zH);
  const zarge=new THREE.Mesh(new THREE.ExtrudeGeometry(zS,{depth:0.09,bevelEnabled:false}),doorM);
  zarge.position.z=0.015; zarge.castShadow=true; scene.add(zarge);
  // Blatt 0.86 × 2.15 m: Friese/Stäbe als Extrusion MIT Öffnungen, dahinter ein um
  // 0.028 zurückgesetztes Füllungsbrett. Die 0.012-Fase an den Öffnungen ist der
  // Profilstab — dadurch echtes Relief statt aufgemalter Rechtecke.
  const LW=0.836, LY0=0.79, LY1=2.94;            // +2×0.012 Fase = 0.86 fertige Blattbreite
  const lS=new THREE.Shape();
  lS.moveTo(-LW/2,LY0); lS.lineTo(LW/2,LY0); lS.lineTo(LW/2,LY1); lS.lineTo(-LW/2,LY1);
  [[1.08,1.72],[1.90,2.80]].forEach(([y0,y1])=>{ const p=new THREE.Path();
    p.moveTo(-0.30,y0); p.lineTo(0.30,y0); p.lineTo(0.30,y1); p.lineTo(-0.30,y1); p.closePath(); lS.holes.push(p); });
  const lG=new THREE.ExtrudeGeometry(lS,{depth:0.05,bevelEnabled:true,bevelThickness:0.012,bevelSize:0.012,bevelSegments:1});
  const brassM=mat(0xc9b88a,0.32,0.8);
  [-0.44,0.44].forEach(dx=>{
    const lf=new THREE.Mesh(lG,doorM); lf.position.set(dx,0,0.032);   // Blattfront bei z=0.094
    lf.castShadow=true; lf.receiveShadow=true; scene.add(lf);
    const pb=new THREE.Mesh(new THREE.BoxGeometry(0.70,1.80,0.02),mat(0x4e3120,0.55));
    pb.position.set(dx,1.94,0.056); scene.add(pb);
    // Knauf ø0.064 auf Rosette ø0.09, 1.05 m über der Schwelle (0.79) — reale Griffhöhe
    const kx=dx-Math.sign(dx)*0.365;
    const ros=new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,0.014,14),brassM);
    ros.rotation.x=Math.PI/2; ros.position.set(kx,1.84,0.100); scene.add(ros);
    const kn=new THREE.Mesh(new THREE.SphereGeometry(0.032,12,12),brassM);
    kn.position.set(kx,1.84,0.134); kn.castShadow=true; scene.add(kn);
  });
  const kmp=new THREE.Mesh(new THREE.BoxGeometry(1.75,0.11,0.075),doorM);
  kmp.position.set(0,2.995,0.0575); kmp.castShadow=true; scene.add(kmp);     // Kämpfer 2.94 … 3.05
  const transom=new THREE.Mesh(new THREE.PlaneGeometry(1.75,0.41),glassM);
  transom.position.set(0,3.255,0.062); scene.add(transom);                   // Oberlicht 3.05 … 3.46
  [-0.45,0,0.45].forEach(x=>{ const tb=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.41,0.05),doorM);
    tb.position.set(x,3.255,0.075); scene.add(tb); });

  // ---- Freitreppe + Geländer ----
  const stG=new THREE.Group(); scene.add(stG);
  const NS=6, sh=PL/NS, sd=0.34;
  for(let i=0;i<NS;i++){
    const st=new THREE.Mesh(new THREE.BoxGeometry(3.3-i*0.06,sh,sd+(NS-1-i)*sd),mat(0xc9c6c0,0.85));
    st.position.set(0,sh/2+i*sh,0.55+((NS-1-i)*sd)/2+sd/2);
    st.castShadow=true; st.receiveShadow=true; stG.add(st);
  }
  const railM=mat(0x2c2e31,0.5,0.6);
  const zBot=2.5, zTop=0.7, yTop=PL, hh=0.92;          // Treppenlauf-Fusspunkte + Handlaufhöhe
  [[-1.6],[1.6]].forEach(([sx])=>{
    // Pfosten unten (auf dem Boden) + oben (auf dem Podest) — nichts schwebt
    const pB=new THREE.Mesh(new THREE.BoxGeometry(0.08,hh+0.10,0.08),railM);
    pB.position.set(sx,(hh+0.10)/2,zBot); pB.castShadow=true; stG.add(pB);
    const pT=new THREE.Mesh(new THREE.BoxGeometry(0.08,hh+0.10,0.08),railM);
    pT.position.set(sx,yTop+(hh+0.10)/2,zTop); pT.castShadow=true; stG.add(pT);
    // Handlauf verbindet die Pfostenköpfe (entlang des Laufs geneigt)
    const y0=hh, y1=yTop+hh, dz=zBot-zTop, dy=y1-y0, len=Math.hypot(dz,dy);
    const hr=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,len+0.08),railM);
    hr.position.set(sx,(y0+y1)/2,(zBot+zTop)/2); hr.rotation.x=Math.atan2(dy,dz); hr.castShadow=true; stG.add(hr);
    // Baluster: von der Lauflinie bis zum Handlauf
    for(let i=1;i<=4;i++){ const t=i/5;
      const z=zBot-t*dz, yFoot=t*yTop, yHand=yFoot+hh;
      const bar=new THREE.Mesh(new THREE.BoxGeometry(0.03,yHand-yFoot,0.03),railM);
      bar.position.set(sx,(yFoot+yHand)/2,z); stG.add(bar);
    }
  });

  // ---- Vorgarten: Buchshecken, Kugeln, Koniferen + Metallzaun ----
  const beds=new THREE.Group(); scene.add(beds);
  const hedgeM=new THREE.MeshStandardMaterial({map:noiseTex('#41552f',22,256,128),roughness:1});
  [[-3.6,1.15,3.4],[3.6,1.15,3.4]].forEach(([x,z,w])=>{
    const h=new THREE.Mesh(new THREE.BoxGeometry(w,0.45,0.7),hedgeM);
    h.position.set(x,0.225,z); h.castShadow=true; h.receiveShadow=true; beds.add(h);
  });
  bush(-2.2,0.9,0.4,0x4a5e3e,beds); bush(2.2,0.9,0.4,0x4a5e3e,beds);
  bush(-5.9,1.0,0.5,0x46583c,beds); bush(5.9,1.0,0.5,0x46583c,beds);
  conifer(-4.4,0.9,1.5,beds); conifer(4.4,0.9,1.5,beds);
  // bush(±6.9, 2.2) stand bei z=2.2 volle 0.60 m INNERHALB der Pflasterkante (fore:
  // x=±7.50, z=1.60…8.20) — also mitten im Pflaster. Steht jetzt im Beet (z=0…1.60).
  bush(-6.9,0.95,0.35,0x516446,beds); bush(6.9,0.95,0.35,0x516446,beds);

  // ---- Zaun auf Randstein ----
  // PROBLEM: Der Zaun lief von x=±1.90 bis ±7.50 und hatte NUR innen (x=±1.90) einen
  // Pfosten; aussen endeten Riegel und Stäbe frei in der Wiese, das letzte Feld hing.
  // Die Stäbe standen ausserdem 0.025 über dem Boden. Und Zaunende und Pflasterecke
  // fielen exakt auf denselben Punkt (7.50/8.20) — eine harte Kante ohne Anlass.
  // Lösung: Randstein an der Pflasterkante (Zaun steht darauf), Eckpfosten, kurzer
  // Rücksprung entlang der Seitenkante, Ende im Strauchband.
  const railM2=mat(0x33363a,0.5,0.6), kerbM=mat(0xb4b0a8,0.9);
  const KZ=8.27, KX=7.57, KTOP=0.12, ZEND=5.90;   // Zaunachse, Randstein-Oberkante, Ende Rücksprung
  const post=(x,z)=>{
    const p=new THREE.Mesh(new THREE.BoxGeometry(0.14,1.30,0.14),railM2);
    p.position.set(x,KTOP+0.62,z); p.castShadow=true; beds.add(p);      // 0.09 … 1.39, 3 cm im Stein
    const c=new THREE.Mesh(new THREE.BoxGeometry(0.19,0.05,0.19),railM2);
    c.position.set(x,KTOP+1.295,z); c.castShadow=true; beds.add(c);
  };
  [-1,1].forEach(s=>{
    const x0=s*1.90, x1=s*KX, run=Math.abs(x1-x0), cx=(x0+x1)/2;
    const rt=new THREE.Mesh(new THREE.BoxGeometry(run,0.05,0.05),railM2);
    rt.position.set(cx,1.225,KZ); beds.add(rt);
    const rb=new THREE.Mesh(new THREE.BoxGeometry(run,0.04,0.04),railM2);
    rb.position.set(cx,0.28,KZ); beds.add(rb);
    const nF=Math.round(run/0.40);
    for(let i=1;i<nF;i++){
      const b=new THREE.Mesh(new THREE.BoxGeometry(0.025,1.10,0.025),railM2);
      b.position.set(x0+(x1-x0)*i/nF,0.67,KZ); beds.add(b);             // Stab 0.12 … 1.22
    }
    const rl=KZ-ZEND, cz=(KZ+ZEND)/2;
    const st2=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,rl),railM2);
    st2.position.set(x1,1.225,cz); beds.add(st2);
    const sb=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.04,rl),railM2);
    sb.position.set(x1,0.28,cz); beds.add(sb);
    const nS=Math.round(rl/0.40);
    for(let i=1;i<nS;i++){
      const b=new THREE.Mesh(new THREE.BoxGeometry(0.025,1.10,0.025),railM2);
      b.position.set(x1,0.67,KZ-rl*i/nS); beds.add(b);
    }
    post(x0,KZ); post(x1,KZ); post(x1,ZEND);
    // Randstein 0.14 breit, Oberkante 0.12 über dem Rasen, Fuss auf -0.06 (Rasen -0.01)
    const kf=new THREE.Mesh(new THREE.BoxGeometry(run+0.07,0.18,0.14),kerbM);
    kf.position.set(cx+s*0.035,0.03,KZ); kf.receiveShadow=true; beds.add(kf);
    const ks=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.18,KZ+0.07-1.60),kerbM);
    ks.position.set(x1,0.03,(KZ+0.07+1.60)/2); ks.receiveShadow=true; beds.add(ks);
    groundContact(cx,KZ,run,0.55,beds);
    // Strauchband setzt die Grundstücksgrenze dort fort, wo der Zaun aufhört
    bushClump(s*8.30,ZEND-0.30,0.50,0x4e603f,beds);
    bushClump(s*8.05,ZEND-1.35,0.40,0x56684a,beds);
  });

  // ---- Kulisse: Hecken, ferne Häuser, Bäume ----
  const hedgeBG=new THREE.Mesh(new THREE.BoxGeometry(40,1.7,0.8),
    new THREE.MeshStandardMaterial({map:noiseTex('#4a5c38',24,512,64),roughness:1}));
  hedgeBG.position.set(0,0.85,-13.5); scene.add(hedgeBG);
  [[-16,-17,1],[16,-18,-1]].forEach(([x,z,s])=>{
    const hs=new THREE.Mesh(new THREE.BoxGeometry(4.5,2.6,3.0),mat(0xe3e1dc,0.9));
    hs.position.set(x,1.3,z); hs.rotation.y=s*0.3; scene.add(hs);
    const rf=new THREE.Mesh(new THREE.BoxGeometry(4.7,0.2,3.2),mat(0x4a4d51,0.8));
    rf.position.set(x,2.7,z); rf.rotation.y=s*0.3; scene.add(rf);
  });
  [[-13,-10],[13,-9],[18,-14],[-18,-13]].forEach(([x,z])=>{
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,2.2,8),mat(0x5d4a38,1));
    tr.position.set(x,1.1,z); scene.add(tr);
    const fo=new THREE.Mesh(new THREE.IcosahedronGeometry(2.0,1),mat(0x5f7150,1));
    fo.scale.set(1,1.15,1); fo.position.set(x,3.6,z); fo.castShadow=true; scene.add(fo);
  });
  [[-20,-20,9,0x99a68b],[20,-22,11,0x93a087],[0,-30,16,0xa2ae95]].forEach(([x,z,r,c])=>{
    const h=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),new THREE.MeshBasicMaterial({color:c}));
    h.scale.set(1.7,0.30,1); h.position.set(x,0,z); scene.add(h);
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
  }catch(e){ failed=true; console.warn('Villa3D deaktiviert:',e); return false; }
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
// (verdeckter/inaktiver Tab) — sonst bliebe ein eingefrorenes Erstbild stehen.
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
window.Villa3D={
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
  setTextures(facadeCv,sideCv,floorCv){
    if(!renderer) return;
    applyTex(facadeMat,facadeCv,0xdad6d1,1.0,0.9,POM_F);
    applyTex(sideMatL,sideCv||facadeCv,0xd7d3ce,1.0,0.9,POM_S);
    applyTex(sideMatR,sideCv||facadeCv,0xd7d3ce,1.0,0.9,POM_S);
    applyTex(floorMat,floorCv,0xd0cdc8,0.8,0.55);
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
window.dispatchEvent(new Event('villa3d-ready'));
