// ===================== KLINKERBOX · 3D-VILLA (AUSSEN) =====================
// Klassizistische Stadtvilla für die Aussen-Ansicht: Walmdach mit Gaube,
// zwei Vollgeschosse mit fünf Fensterachsen, weisse Faschen + Gesimse,
// Portikus mit Freitreppe und Geländer, Buchs-Vorgarten mit Metallzaun.
// Fassade (vorne + Seiten) trägt den Wand-Mix, der Vorplatz den Boden-Mix.
import * as THREE from './three.module.min.js';
import { buildEnv, glassMaterial, interiorMaterial, skyDomeTexture, normalFromCanvas, addVignette, interiorRoom } from './scene3d-lib.js?v=39';

const MOBILE=matchMedia('(pointer:coarse)').matches;
let renderer=null, scene=null, camera=null, host=null, ro=null;
let facadeMat=null, sideMatL=null, sideMatR=null, floorMat=null, maxAniso=8;
let rafId=0, failed=false;

const TARGET=new THREE.Vector3(0,3.6,1.2);
let az=0.14, po=1.520, rad=20.5;
let azT=az, poT=po, radT=rad;
const AZ_MIN=-0.85, AZ_MAX=0.85, PO_MIN=1.32, PO_MAX=1.565, R_MIN=13, R_MAX=30;

const HW=13.0, HE=7.0, HD=10.0;                 // Breite, Traufe, Tiefe
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
  const inter=new THREE.Mesh(new THREE.PlaneGeometry(w-0.02,h-0.02),interiorRoom(w-0.02,h-0.02,2.0,x*2.9+y*1.7));
  inter.position.set(x,y,0.055); parent.add(inter);          // 3D-Innenraum (Interior-Mapping)
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(w-0.02,h-0.02),glassM);
  glass.position.set(x,y,0.088); parent.add(glass);           // reflektierendes Glas
  const mv=new THREE.Mesh(new THREE.BoxGeometry(0.05,h-0.1,0.02),mat(0xf4f3f0,0.6));
  mv.position.set(x,y,0.1); parent.add(mv);
  const mh=new THREE.Mesh(new THREE.BoxGeometry(w-0.1,0.05,0.02),mat(0xf4f3f0,0.6));
  mh.position.set(x,y+h*0.18,0.1); parent.add(mh);
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

  { const sky=new THREE.Mesh(new THREE.SphereGeometry(85,32,18),
      new THREE.MeshBasicMaterial({map:skyDomeTexture(),color:new THREE.Color(1.5,1.5,1.5),side:THREE.BackSide,fog:false}));
    scene.add(sky); }

  scene.add(new THREE.HemisphereLight(0xdbe7f2,0x8d9084,0.35));
  scene.add(new THREE.AmbientLight(0xffffff,0.06));
  const sun=new THREE.DirectionalLight(0xffeed2,2.6);
  sun.position.set(17,20,10.5);                    // streifendes Nachmittagslicht → Relief + Schattenwurf
  sun.target.position.set(0,0,1);
  sun.castShadow=true;
  sun.shadow.mapSize.set(MOBILE?2048:4096,MOBILE?2048:4096);
  sun.shadow.camera.left=-18; sun.shadow.camera.right=15;
  sun.shadow.camera.top=16;   sun.shadow.camera.bottom=-9;
  sun.shadow.camera.near=1; sun.shadow.camera.far=60;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.05;
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
  roof.position.set(0,HE+0.34,-HD/2); roof.castShadow=true; scene.add(roof);
  const dormer=new THREE.Mesh(new THREE.BoxGeometry(3.3,1.6,1.8),mat(0xd8d5d0,0.9));
  dormer.position.set(0,8.45,-1.85); dormer.castShadow=true; scene.add(dormer);
  const dRoof=new THREE.Mesh(new THREE.BoxGeometry(3.6,0.12,2.1),mat(0x3b3e43,0.7));
  dRoof.position.set(0,9.31,-1.85); dRoof.castShadow=true; scene.add(dRoof);
  const glassM=glassMaterial();
  [[-0.95],[0],[0.95]].forEach(([x])=>{
    const f=new THREE.Mesh(new THREE.BoxGeometry(0.78,1.1,0.06),mat(0xf4f3f0,0.6));
    f.position.set(x,8.42,-0.92); scene.add(f);
    const g=new THREE.Mesh(new THREE.PlaneGeometry(0.62,0.94),glassM);
    g.position.set(x,8.42,-0.885); scene.add(g);
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
  const pil=(x)=>{ const p=new THREE.Mesh(new THREE.BoxGeometry(0.38,2.85,0.22),mat(0xeceae6,0.7));
    p.position.set(x,PL+1.425,0.11); p.castShadow=true; scene.add(p);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.12,0.28),mat(0xe6e4e0,0.7));
    cap.position.set(x,PL+2.91,0.14); scene.add(cap); };
  pil(-1.45); pil(1.45);
  const entab=new THREE.Mesh(new THREE.BoxGeometry(3.6,0.5,0.34),mat(0xeceae6,0.7));
  entab.position.set(0,PL+3.28,0.17); entab.castShadow=true; scene.add(entab);
  const reveal=new THREE.Mesh(new THREE.BoxGeometry(2.15,2.9,0.10),mat(0x8f8b85,0.9));
  reveal.position.set(0,PL+1.45,0.03); scene.add(reveal);
  const doorM=mat(0x5d3a26,0.5);
  [[-0.44],[0.44]].forEach(([dx])=>{
    const d=new THREE.Mesh(new THREE.BoxGeometry(0.84,2.15,0.07),doorM);
    d.position.set(dx,PL+1.1,0.09); scene.add(d);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(0.56,0.9,0.02),mat(0x4e3120,0.55));
    panel.position.set(dx,PL+1.35,0.13); scene.add(panel);
  });
  const transom=new THREE.Mesh(new THREE.PlaneGeometry(1.7,0.5),glassM);
  transom.position.set(0,PL+2.55,0.10); scene.add(transom);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(0.045,10,10),mat(0xc9b88a,0.3,0.8));
  knob.position.set(0.12,PL+1.1,0.15); scene.add(knob);

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
  bush(-6.9,2.2,0.35,0x516446,beds); bush(6.9,2.2,0.35,0x516446,beds);
  const railM2=mat(0x33363a,0.5,0.6);
  [[-1,0],[1,0]].forEach(([s])=>{
    const run=5.6, x0=s*(1.9+run/2);
    const rt=new THREE.Mesh(new THREE.BoxGeometry(run,0.05,0.05),railM2);
    rt.position.set(x0,1.12,8.2); beds.add(rt);
    const rb=new THREE.Mesh(new THREE.BoxGeometry(run,0.04,0.04),railM2);
    rb.position.set(x0,0.25,8.2); beds.add(rb);
    for(let i=0;i<=14;i++){
      const bar=new THREE.Mesh(new THREE.BoxGeometry(0.025,1.15,0.025),railM2);
      bar.position.set(s*(1.9+i*(run/14)),0.6,8.2); beds.add(bar);
    }
    const post=new THREE.Mesh(new THREE.BoxGeometry(0.14,1.35,0.14),railM2);
    post.position.set(s*1.9,0.675,8.2); beds.add(post);
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
  }catch(e){ failed=true; console.warn('Villa3D deaktiviert:',e); return false; }
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
// (verdeckter/inaktiver Tab) — sonst bliebe ein eingefrorenes Erstbild stehen.
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
window.Villa3D={
  available(){ return !failed; },
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
  setTextures(facadeCv,sideCv,floorCv){
    if(!renderer) return;
    applyTex(facadeMat,facadeCv,0xdad6d1);
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
window.dispatchEvent(new Event('villa3d-ready'));
