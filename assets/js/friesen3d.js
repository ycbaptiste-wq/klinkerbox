// ===================== KLINKERBOX · 3D-FRIESENHAUS (AUSSEN) =====================
// Friesenhaus: steiles Walmdach mit Pfannen, mittiger Zwerchgiebel mit
// Kugel-Finial und weissen Ortgängen, zwei Gauben, weisse Sprossenfenster,
// dunkle Paneel-Tür mit Oberlicht, Buchshecken + Dünengräser, Marsch-Kulisse.
// Fassade (EG + Giebel + Seiten) trägt den Wand-Mix, der Vorplatz den Boden-Mix.
import * as THREE from './three.module.min.js';
import { buildEnv, glassMaterial, interiorMaterial, skyDomeTexture, normalFromCanvas, addVignette, interiorRoom } from './scene3d-lib.js?v=41';

const MOBILE=matchMedia('(pointer:coarse)').matches;

let renderer=null, scene=null, camera=null, host=null, ro=null;
let facadeMat=null, gableMat=null, sideMatL=null, sideMatR=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

const TARGET=new THREE.Vector3(0,3.1,1.2);
let az=0.13, po=1.520, rad=19.5;
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.85, AZ_MAX=0.85, PO_MIN=1.32, PO_MAX=1.565, R_MIN=12.5, R_MAX=28;

const HW=13.0, HD=9.0;                           // Breite, Tiefe
const HE=3.0;                                    // Trauf-/EG-Höhe
const RIDGE=7.6;                                 // Firsthöhe
const GW=3.6;                                    // Giebelbreite

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
function grassTuft(x,z,scale,parent,pale){
  const s=scale||1, col=pale?0xbdb489:0xa8a06e;
  for(let i=0;i<10;i++){
    const a=Math.random()*Math.PI*2, lean=(0.12+Math.random()*0.26)*s, hgt=(0.5+Math.random()*0.5)*s;
    const p0=new THREE.Vector3(x,0,z);
    const p1=new THREE.Vector3(x+Math.cos(a)*lean*0.4,hgt*0.6,z+Math.sin(a)*lean*0.4);
    const p2=new THREE.Vector3(x+Math.cos(a)*lean,hgt,z+Math.sin(a)*lean);
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p0,p1,p2]),6,0.006*s,5),mat(col,1));
    parent.add(tube);
    if(i%2===0){ const pl=new THREE.Mesh(new THREE.SphereGeometry(0.035*s,8,8),mat(0xd6ccab,1));
      pl.scale.set(1,2.6,1); pl.position.copy(p2); pl.position.y+=0.08*s; parent.add(pl); }
  }
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

  { const sky=new THREE.Mesh(new THREE.SphereGeometry(85,32,18),
      new THREE.MeshBasicMaterial({map:skyDomeTexture(),color:new THREE.Color(1.5,1.5,1.5),side:THREE.BackSide,fog:false}));
    scene.add(sky); }

  scene.add(new THREE.HemisphereLight(0xdbe7f2,0x8d9084,0.35));
  scene.add(new THREE.AmbientLight(0xffffff,0.06));
  const sun=new THREE.DirectionalLight(0xffeed2,2.55);
  sun.position.set(16,19,10);                    // streifendes Nachmittagslicht → Relief + Schattenwurf
  sun.target.position.set(0,0,1);
  sun.castShadow=true;
  sun.shadow.mapSize.set(MOBILE?2048:4096,MOBILE?2048:4096);
  sun.shadow.camera.left=-18; sun.shadow.camera.right=15;
  sun.shadow.camera.top=15;   sun.shadow.camera.bottom=-9;
  sun.shadow.camera.near=1; sun.shadow.camera.far=55;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.05;
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
  const ridge=new THREE.Mesh(new THREE.BoxGeometry(4.3,0.14,0.24),mat(0x33363b,0.7));
  ridge.position.set(0,RIDGE+0.10,-HD/2); scene.add(ridge);
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
  const gGeo=new THREE.ShapeGeometry(gShape);
  { const p=gGeo.attributes.position, uv=gGeo.attributes.uv;
    for(let i=0;i<p.count;i++){ uv.setXY(i,(p.getX(i)+GW/2)/GW, p.getY(i)/7.45); } }
  const gable=new THREE.Mesh(gGeo,gableMat);
  gable.position.set(0,0,0.14); gable.castShadow=true; gable.receiveShadow=true; scene.add(gable);
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
  // klassisches Giebel-Finial an der Vorderspitze
  const finRod=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.44,8),mat(0x33363b,0.5,0.3));
  finRod.position.set(0,7.64,gFrontZ); scene.add(finRod);
  const finial=new THREE.Mesh(new THREE.SphereGeometry(0.13,16,14),mat(0x33363b,0.5,0.3));
  finial.position.set(0,7.88,gFrontZ); finial.castShadow=true; scene.add(finial);
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
      const vb=new THREE.Mesh(new THREE.BoxGeometry(len+0.08,0.10,0.07),mat(0xf2f1ee,0.6));
      vb.rotation.z=s*ang; vb.position.set(x - s*run/2, baseY+bh+gr/2+0.03, bz+bd/2+0.02); scene.add(vb);
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

  // ---- Haustür: dunkle Paneel-Tür mit Oberlicht + Tritt ----
  const dSur=new THREE.Mesh(new THREE.BoxGeometry(1.5,2.75,0.06),mat(0xeceae6,0.7));
  dSur.position.set(0,1.375,0.17); scene.add(dSur);
  const door=new THREE.Mesh(new THREE.BoxGeometry(1.16,2.15,0.08),mat(0x3f2d20,0.5));
  door.position.set(0,1.075,0.20); scene.add(door);
  [[-0.28,1.55],[0.28,1.55],[-0.28,0.62],[0.28,0.62]].forEach(([px,py])=>{
    const pan=new THREE.Mesh(new THREE.BoxGeometry(0.40,0.72,0.02),mat(0x32231a,0.55));
    pan.position.set(px,py,0.245); scene.add(pan);
  });
  // warm beleuchtetes Oberlicht (Fanlight) statt schwarzem Glas
  const transomGlow=new THREE.Mesh(new THREE.PlaneGeometry(1.1,0.42),new THREE.MeshBasicMaterial({color:0xf3e2be}));
  transomGlow.position.set(0,2.42,0.235); scene.add(transomGlow);
  const transom=new THREE.Mesh(new THREE.PlaneGeometry(1.1,0.42),glassM);
  transom.position.set(0,2.42,0.245); scene.add(transom);
  [[-0.28],[0.0],[0.28]].forEach(([px])=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.40,0.02),mat(0xf6f5f2,0.55));
    m.position.set(px,2.42,0.25); scene.add(m);
  });
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,0.28,8),mat(0xb9bcbe,0.3,0.8));
  handle.position.set(-0.42,1.05,0.26); handle.rotation.x=Math.PI/2; scene.add(handle);
  const step=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.09,0.65),mat(0xc9c6c0,0.85));
  step.position.set(0,0.045,0.42); step.castShadow=true; step.receiveShadow=true; scene.add(step);

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
    renderer=new THREE.WebGLRenderer({antialias:true});
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=0.72;
    maxAniso=renderer.capabilities.getMaxAnisotropy()||8;
    buildScene();
    const el=renderer.domElement;
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
function texFromCanvas(cv){
  if(!cv) return null;
  const t=new THREE.CanvasTexture(cv);
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=maxAniso;
  return t;
}
function applyTex(m,cv,fallback,rough,ns){
  if(m.map) m.map.dispose();
  if(m.normalMap){ m.normalMap.dispose(); m.normalMap=null; }
  m.map=texFromCanvas(cv);
  m.color.set(cv?0xffffff:fallback);
  m.roughness=cv?(rough!=null?rough:1.0):0.95;   // Klinker matt
  if(cv){ const nt=normalFromCanvas(cv);                    // Fugen tief, Stein-Relief aus dem Foto
    if(nt){ nt.anisotropy=maxAniso; nt.generateMipmaps=false; nt.minFilter=THREE.LinearFilter; m.normalMap=nt; const s=ns!=null?ns:0.8; m.normalScale=new THREE.Vector2(s,s); } }
  m.envMapIntensity=cv?0.18:0.3;                    // kaum Env-Reflexion
  m.needsUpdate=true;
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
  // Fassade EG, Seiten, Vorplatz, Zwerchgiebel — je ein Canvas (null → neutral)
  setTextures(facadeCv,sideCv,floorCv,gableCv){
    if(!renderer) return;
    applyTex(facadeMat,facadeCv,0xdad6d1);
    applyTex(gableMat,gableCv||facadeCv,0xdad6d1);
    applyTex(sideMatL,sideCv||facadeCv,0xd7d3ce);
    applyTex(sideMatR,sideCv||facadeCv,0xd7d3ce);
    applyTex(floorMat,floorCv,0xd0cdc8,0.8,0.55);
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
window.dispatchEvent(new Event('friesen3d-ready'));
