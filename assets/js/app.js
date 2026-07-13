// ===================== KLINKERBOX · APP =====================
(function(){
  const P = window.PRODUCTS, I = window.I18N, FAM = window.FAMILIES, SUB = window.SUBS, FIN = window.FINISH;
  let lang = localStorage.getItem('kb_lang') || 'de';

  // Referenzen — real project photos from the existing gallery (with captions)
  const REFS = [
    {src:"assets/refs/ref-ancbelg-bronzegelb-basel.jpg",   cap:"Ancienne Belgique Bronzegelb · Eulenstrasse 18, Basel"},
    {src:"assets/refs/ref-septima-aureum-udligenswil.jpg", cap:"SeptimA Aureum · Götzentalstrasse 1, Udligenswil"},
    {src:"assets/refs/ref-lecorbusier-bern.jpg",           cap:"Gebäudekomplex Le-Corbusier-Platz, Bern"},
    {src:"assets/refs/ref-ancbelg-kupferbraun-romont.jpg", cap:"Ancienne Belgique Kupferbraun · Romont"},
    {src:"assets/refs/ref-route-de-suisse-coppet.jpg",     cap:"Route de Suisse 5, Coppet"},
    {src:"assets/refs/ref-septima-mahagonie.jpg",          cap:"SeptimA Mahagonie"},
    {src:"assets/refs/ref-denogent.jpg",                   cap:"Denogent SA"}
  ];
  // YouTube films embedded from the existing site
  const VIDEOS = [
    {id:"Ft_g9so_NEY", title:"Schulhaus"},
    {id:"Pa4jem2yNjE", title:"Schulhaus"},
    {id:"mLcptkMgEjM", title:"Wohnsiedlung"}
  ];
  // Extra installation photos per product (product galleries)
  const EXTRA = {
    "Ancienne Belgique|Bronzegelb":[{src:"assets/refs/ref-ancbelg-bronzegelb-basel.jpg",cap:"Eulenstrasse 18, Basel"}],
    "Ancienne Belgique|Kupferbraun":[{src:"assets/refs/ref-ancbelg-kupferbraun-romont.jpg",cap:"Romont"}],
    "SeptimA|Aureum":[{src:"assets/refs/ref-septima-aureum-udligenswil.jpg",cap:"Götzentalstrasse 1, Udligenswil"}],
    "SeptimA|Mahagonie":[{src:"assets/refs/ref-septima-mahagonie.jpg",cap:"SeptimA Mahagonie"}]
  };

  const state = {cat:'pflaster', sub:null, stil:null, typ:null, color:null, size:'all', q:''};
  let lbGallery=[], lbIndex=0;  // current lightbox gallery state

  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const subLabel = v => (SUB[v] && SUB[v][lang]) || v;
  const famLabel = v => (FAM[v] && FAM[v][lang]) || v;

  // ----- surface finish (Oberfläche) for paving bricks -----
  function finishTokens(p){
    if(p.cat!=='pflaster') return null;
    const s=p.series, n=p.name;
    if(s==='Ancienne Belgique') return ['unbesandet','getrommelt'];
    if(s==='Elegantia') return ['unbesandet','vollkantig'];
    if(s==='Septema Aqua Splitt') return ['unbesandet','vollkantig'];
    if(s==='SeptimA'){
      if(['Anthrazit','Grau Gelb','Rotbraun'].includes(n)) return ['besandet','vollkantig'];
      if(['Arena','Colosseum','Forum'].includes(n)) return ['besandet','getrommelt'];
      if(['Amarant','Salvia','Sepia','Titan','Vanille','Carbon','Graphit'].includes(n)) return ['unbesandet','vollkantig'];
      return ['unbesandet','getrommelt'];
    }
    return null;
  }
  const finishLabel = p => { const t=finishTokens(p); return t? t.map(x=>FIN[x][lang]).join(' · ') : ''; };
  const enrich = p => (window.ENRICH && window.ENRICH[p.id]) || null;
  // ---- runtime HAND-MADE stamp removal (clones brick texture over the bottom-right corner) ----
  const STAMPED=new Set(['m240','m241','m242','m243','m244','m245']);
  const cleanCache={};
  const imgSrc=p=>cleanCache[p.id]||p.img;
  function cleanStamp(p, cb){
    if(!STAMPED.has(p.id)){ cb&&cb(p.img); return; }
    if(cleanCache[p.id]){ cb&&cb(cleanCache[p.id]); return; }
    const im=new Image();
    im.onload=()=>{ try{
      const W=im.naturalWidth,H=im.naturalHeight;
      const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
      const cx=cv.getContext('2d'); cx.drawImage(im,0,0);
      const rw=Math.round(W*0.46), rh=Math.round(H*0.40);     // bottom-right region with the stamp
      cx.drawImage(cv, W-2*rw, H-rh, rw, rh, W-rw, H-rh, rw, rh); // clone the patch to its left
      cleanCache[p.id]=cv.toDataURL('image/jpeg',0.9); cb&&cb(cleanCache[p.id]);
    }catch(e){ cleanCache[p.id]=p.img; cb&&cb(p.img); } };
    im.onerror=()=>{ cleanCache[p.id]=p.img; cb&&cb(p.img); };
    im.src=p.img;
  }
  const baseOf=s=>s.split('/').pop();
  function gallery(p){ const e=enrich(p); const g=(e && e.gallery && e.gallery.length)? e.gallery.slice() : [p.img];
    const pb=baseOf(p.img);   // swap the (possibly stamped) gallery swatch for the clean card crop
    return g.map(s=> baseOf(s)===pb ? imgSrc(p) : s); }
  function loadOf(p){ const e=enrich(p); return (e && e.load) || ''; }
  const ALLFMT = "Alle Formate";
  const isAllFmt = p => p.size===ALLFMT;
  const isMulti = p => !!(p.formats && p.formats.length);      // available in several specific formats
  const sizeLabel = p => isMulti(p) ? I[lang].multiformats : (isAllFmt(p) ? I[lang].allformats : p.size);
  // hand-produced ranges (tumbled / water-struck / hand-moulded clinker)
  const HANDMADE_IDS=new Set(['m132','m133','m240','m241','m242','m243','m244','m245','p11']);
  const NOT_HANDMADE=new Set(['m136','m146']);        // C1LF / N1LF — not hand-struck
  function isHandmade(p){
    if(NOT_HANDMADE.has(p.id)) return false;
    if(HANDMADE_IDS.has(p.id)) return true;          // products whose photos carried the HAND-MADE stamp
    if(p.series==='SeptimA' || p.series==='Ancienne Belgique') return true;
    if(p.series==='Nature 7' || p.series==='Nature 10') return true;
    if(p.series==='LF Langformat') return true;       // Wasserstrich / water-struck
    if(p.sub==='Wasserstrich') return true;
    return false;
  }

  // ===================== I18N =====================
  function applyLang(){
    const dict = I[lang];
    document.documentElement.lang = lang;
    $$('[data-t]').forEach(el=>{ const k=el.dataset.t; if(dict[k]!==undefined) el.innerHTML = dict[k]; });
    $$('[data-ph]').forEach(el=>{ const k=el.dataset.ph; if(dict[k]!==undefined) el.placeholder = dict[k]; });
    $('#langLabel').textContent = lang.toUpperCase();
    $$('#langMenu button').forEach(b=>b.classList.toggle('active', b.dataset.lang===lang));
    $('#search').placeholder = dict.search_ph;
    buildSubChips(); buildStilChips(); buildTypChips(); buildSizeSelect(); buildVideos(); render();
    if(window.MIX){ updateFab(); if(!$('#mixer').hidden) renderMixer(); }
  }

  // ===================== FILTER BUILDERS =====================
  function pool(){ return state.cat==='all' ? P : P.filter(p=>p.cat===state.cat); }

  const SUB_ORDER=["getrommelt","scharfkantig","Sickerstein","Strangpress","Wasserstrich","Handgeschlagen",
    "Langformat LF","R-Format","Normalformat NF","Indoor","Outdoor"];
  function buildSubChips(){
    const wrap = $('#subChips'); wrap.innerHTML='';
    const subs = [...new Set(pool().map(p=>p.sub))].sort((a,b)=>{
      const ia=SUB_ORDER.indexOf(a), ib=SUB_ORDER.indexOf(b);
      return (ia<0?99:ia)-(ib<0?99:ib);
    });
    if(subs.length<=1){ wrap.parentElement.style.display='none'; return; }
    wrap.parentElement.style.display='';
    subs.forEach(s=>{
      const b=document.createElement('button');
      b.className='chip'+(state.sub===s?' is-active':'');
      b.textContent=subLabel(s);
      b.onclick=()=>{ state.sub = state.sub===s?null:s; buildSubChips(); render(); };
      wrap.appendChild(b);
    });
  }
  const stilLabel = v => (window.STIL && window.STIL[v] && window.STIL[v][lang]) || v;
  function buildStilChips(){
    const group=$('#stilGroup'), wrap=$('#stilChips'); wrap.innerHTML='';
    const stils=[...new Set(pool().map(p=>p.stil).filter(Boolean))];
    if((state.cat!=='pflaster' && state.cat!=='tonplatten') || stils.length<=1){ group.hidden=true; state.stil=null; return; }
    group.hidden=false;
    // keep a stable order
    ['versickern','historisch','modern'].filter(s=>stils.includes(s)).forEach(s=>{
      const b=document.createElement('button');
      b.className='chip'+(state.stil===s?' is-active':'');
      b.textContent=stilLabel(s);
      b.onclick=()=>{ state.stil = state.stil===s?null:s; buildStilChips(); render(); };
      wrap.appendChild(b);
    });
  }
  function buildTypChips(){
    const group=$('#typGroup'), wrap=$('#typChips'); wrap.innerHTML='';
    const typs=[...new Set(pool().map(p=>p.typ).filter(t=>t && t!=='Langformat LF' && t!=='Normalformat NF'))];
    if(state.cat!=='mauer' || typs.length<=1){ group.hidden=true; state.typ=null; return; }
    group.hidden=false;
    ['Mauerziegel','Mauerverblender','Riemchen'].filter(t=>typs.includes(t)).forEach(t=>{
      const b=document.createElement('button');
      b.className='chip'+(state.typ===t?' is-active':'');
      b.textContent=subLabel(t);
      b.onclick=()=>{ state.typ = state.typ===t?null:t; buildTypChips(); render(); };
      wrap.appendChild(b);
    });
  }
  function buildColorDots(){
    const wrap = $('#colorDots'); wrap.innerHTML='';
    const fams=[...new Set(pool().map(p=>p.family))];          // only colours present in the current category
    if(state.color && !fams.includes(state.color)) state.color=null;
    fams.sort((a,b)=>Object.keys(FAM).indexOf(a)-Object.keys(FAM).indexOf(b)).forEach(f=>{
      const d=document.createElement('button');
      d.className='cdot'+(state.color===f?' is-active':'');
      d.style.background=window.FAMILY_HEX[f]||'#999'; d.dataset.name=famLabel(f);
      d.onclick=()=>{ state.color = state.color===f?null:f; buildColorDots(); render(); };
      wrap.appendChild(d);
    });
  }
  function buildSizeSelect(){
    const sel=$('#sizeSelect'); const prev=state.size;
    // "Alle Formate" products match every size; multi-format products contribute each of their formats
    const raw=[]; pool().forEach(p=>{ if(isMulti(p)) raw.push(...p.formats); else raw.push(p.size); });
    const sizes=[...new Set(raw)].filter(s=>s!==ALLFMT && s!=='Mehrere Formate').sort();
    sel.innerHTML='';
    const o0=document.createElement('option'); o0.value='all'; o0.textContent=I[lang].size_all; sel.appendChild(o0);
    sizes.forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s; sel.appendChild(o); });
    sel.value = sizes.includes(prev)?prev:'all'; state.size = sel.value;
    sel.onchange=()=>{ state.size=sel.value; render(); };
  }

  // ===================== RENDER GRID =====================
  function filtered(){
    return P.filter(p=>{
      if(state.cat!=='all' && p.cat!==state.cat) return false;
      if(state.sub && p.sub!==state.sub) return false;
      if(state.stil && p.stil!==state.stil) return false;
      // every Mauerklinker is also available as Riemchen → the Riemchen filter matches all
      if(state.typ && p.typ!==state.typ && !(state.typ==='Riemchen' && p.cat==='mauer')) return false;
      if(state.color && p.family!==state.color) return false;
      if(state.size!=='all' && !isAllFmt(p) && p.size!==state.size && !(isMulti(p) && p.formats.includes(state.size))) return false;
      if(state.q){
        const h=(p.series+' '+p.name+' '+famLabel(p.family)+' '+p.size).toLowerCase();
        if(!h.includes(state.q.toLowerCase())) return false;
      }
      return true;
    });
  }
  const PAGE=12;                       // products per page → less endless scrolling
  let mList=[], mShown=0;
  function makeCard(p,stagger){
    const c=document.createElement('article'); c.className='card'+(allZoneIds().has(p.id)?' in-mix':'');
    c.dataset.pid=p.id;
    c.innerHTML=`
      <span class="card__mixbadge">${window.MIX.added[lang]}</span>
      <div class="card__img"><img loading="lazy" decoding="async" src="${imgSrc(p)}" alt="${p.series} ${p.name}"></div>
      <div class="card__body">
        <div class="card__series">${p.series}</div>
        <div class="card__name">${p.name}</div>
        <div class="card__meta"><span class="card__swatch" style="background:${p.hex}"></span>${famLabel(p.family)} · ${sizeLabel(p)}</div>
      </div>`;
    c.onclick=()=>openLightbox(p);
    $('#grid').appendChild(c);
    requestAnimationFrame(()=>setTimeout(()=>c.classList.add('in'), Math.min(stagger*18,300)));
  }
  function updateMore(){
    const btn=$('#loadMore'); if(!btn) return;
    const rem=mList.length-mShown; btn.hidden=rem<=0;
    const n=btn.querySelector('.loadmore__n'); if(n) n.textContent=rem;
  }
  function loadMore(){
    const from=mShown, to=Math.min(mShown+PAGE, mList.length);
    for(let i=from;i<to;i++) makeCard(mList[i], i-from);
    mShown=to; updateMore();
  }
  function render(){
    mList=filtered();
    $('#count').textContent=mList.length;
    $('#empty').hidden = mList.length>0;
    $('#grid').innerHTML='';
    mShown=Math.min(PAGE, mList.length);
    for(let i=0;i<mShown;i++) makeCard(mList[i], i);
    updateMore();
  }
  // reflect current mixer selection on the product cards
  function markMixedCards(ids){
    ids=ids||allZoneIds();
    $$('#grid .card').forEach(c=>{ c.classList.toggle('in-mix', ids.has(c.dataset.pid)); });
  }

  // ===================== LIGHTBOX (product gallery) =====================
  function openLightbox(p){
    const d=I[lang], gal=gallery(p), LO=window.LOADS;
    const catName = p.cat==='pflaster'?d.nav_pflaster:p.cat==='mauer'?d.nav_mauer:d.nav_tonplatten;
    const fin = finishLabel(p);
    const load = loadOf(p);
    const multi = gal.length>1;
    const thumbs = multi ? `<div class="lb__thumbs">${gal.map((src,i)=>
        `<button class="lb__thumb${i===0?' is-active':''}" data-i="${i}"><img loading="lazy" src="${src}" alt=""></button>`).join('')}</div>` : '';
    const counter = multi ? `<span class="lb__count" id="lbCount">1 / ${gal.length}</span>` : '';
    const navArrows = multi ? `<button class="lb__nav lb__nav--prev" id="lbPrev" aria-label="‹">‹</button>
        <button class="lb__nav lb__nav--next" id="lbNext" aria-label="›">›</button>` : '';
    const hand = isHandmade(p);
    const loadPills = load ? ['F','A','B','G'].map(k=>`<span class="lb__load${load.includes(k)?' on':''}">${LO[k][lang]}</span>`).join('') : '';
    const handPill = hand ? `<span class="lb__load lb__load--hm on"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V6a2 2 0 0 1 4 0v5M13 7a2 2 0 0 1 4 0v6M7 12V9a2 2 0 0 1 4 0M17 9a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-2a7 7 0 0 1-5-2l-3.5-3.5a2 2 0 0 1 3-2.6L9 14"/></svg>${d.lb_handmade}</span>` : '';
    const loadRow = (load||hand) ? `<div class="lb__specrow lb__specrow--load"><span>${load?LO._label[lang]:d.lb_props}</span>
        <div class="lb__loads">${loadPills}${handPill}</div></div>` : '';
    // technical data (description + spec rows + tonplatten format table)
    const sp = window.SPECS && window.SPECS[p.id];
    const descHtml = sp && sp.desc ? `<p class="lb__desc">${sp.desc}</p>` : '';
    const specRows = sp && sp.rows ? `<div class="lb__trows">${sp.rows.map(r=>
        `<div class="lb__trow"><span class="lb__trk">${r[0]}</span><span class="lb__trv">${r[1]}</span></div>`).join('')}</div>` : '';
    const tf = (p.cat==='tonplatten' && window.TONFORMATS && !['Handschlagbodenplatten','Ziegelboden','Bodenplatten'].includes(p.series)) ? `
        <table class="lb__table"><thead><tr><th>${d.tf_format}</th><th>${d.tf_dicke}</th><th>${d.tf_units}</th><th>${d.tf_weight}</th></tr></thead>
        <tbody>${window.TONFORMATS.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table>` : '';
    const techHtml = (specRows||tf) ? `<div class="lb__tech"><h4 class="lb__techh">${d.lb_specs}</h4>${specRows}${tf}</div>` : '';
    $('#lbInner').innerHTML=`
      <div class="lb__media">
        <div class="lb__img">${counter}${navArrows}<img id="lbMain" src="${gal[0]}" alt="${p.series} ${p.name}"></div>
        ${thumbs}
      </div>
      <div class="lb__info">
        <div class="lb__series">${p.series}</div>
        <div class="lb__name">${p.name}</div>
        ${descHtml}
        <dl class="lb__dl lb__dl--base">
          <div class="lb__di"><dt>${d.lb_cat}</dt><dd>${catName}</dd></div>
          <div class="lb__di"><dt>${d.lb_sub}</dt><dd>${subLabel(p.typ||p.sub)}</dd></div>
          ${fin?`<div class="lb__di"><dt>${d.lb_finish}</dt><dd>${fin}</dd></div>`:''}
          <div class="lb__di"><dt>${d.lb_color}</dt><dd class="lb__cdd"><span class="lb__dot" style="background:${p.hex}"></span>${famLabel(p.family)}</dd></div>
          ${isMulti(p)
            ? `<div class="lb__di lb__di--wide"><dt>${d.lb_size}</dt><dd class="lb__fmts">${p.formats.map(f=>`<span>${f}</span>`).join('')}</dd></div>`
            : `<div class="lb__di"><dt>${d.lb_size}</dt><dd>${sizeLabel(p)}</dd></div>`}
        </dl>
        ${loadRow}
        ${techHtml}
        <div class="lb__actions">
          <button type="button" class="btn btn--solid lb__cta" id="lbCta">${d.lb_cta}</button>
          <button type="button" class="btn btn--outline" id="lbMix">${window.MIX[mixHas(p)?'added':'add'][lang]}</button>
        </div>
      </div>`;
    $('#lbCta').onclick=()=>requestSample(p);
    $('#lbMix').onclick=()=>{ addToMixer(p); const b=$('#lbMix'); if(b) b.textContent=window.MIX[mixHas(p)?'added':'add'][lang]; };
    lbGallery=gal; lbIndex=0;
    $$('.lb__thumb').forEach(t=>t.onclick=()=>showLb(+t.dataset.i));
    if(multi){ $('#lbPrev').onclick=e=>{e.stopPropagation();showLb(lbIndex-1);}; $('#lbNext').onclick=e=>{e.stopPropagation();showLb(lbIndex+1);};
      attachSwipe($('.lb__img'), ()=>showLb(lbIndex-1), ()=>showLb(lbIndex+1)); }
    openModal();
  }
  function showLb(i){
    if(!lbGallery.length) return;
    lbIndex=(i+lbGallery.length)%lbGallery.length;
    const main=$('#lbMain'); if(main) main.src=lbGallery[lbIndex];
    const c=$('#lbCount'); if(c) c.textContent=`${lbIndex+1} / ${lbGallery.length}`;
    $$('.lb__thumb').forEach(x=>x.classList.toggle('is-active', +x.dataset.i===lbIndex));
  }
  function openImage(src){
    lbGallery=[]; lbIndex=0;
    $('#lbInner').innerHTML=`<img class="lb__solo" src="${src}" alt="">`;
    openModal();
  }
  function openModal(){ $('#lightbox').hidden=false; document.body.style.overflow='hidden'; if(window.__lenis) window.__lenis.stop(); }
  function closeLightbox(){ $('#lightbox').hidden=true; document.body.style.overflow=''; lbGallery=[]; if(window.__lenis) window.__lenis.start(); }
  function scrollToEl(el){ if(window.__lenis) window.__lenis.scrollTo(el,{offset:-10}); else el.scrollIntoView({behavior:'smooth',block:'start'}); }
  // drag / trackpad swipe to flip through a gallery
  function attachSwipe(el, prev, next){
    if(!el) return; let sx=0, dragging=false, moved=0, wlock=0;
    const img=el.querySelector('img'); el.classList.add('lb-swipe');
    el.addEventListener('pointerdown',e=>{ if(e.button!==0) return; dragging=true; sx=e.clientX; moved=0;
      try{el.setPointerCapture(e.pointerId);}catch(_){} el.classList.add('lb-grabbing'); });
    el.addEventListener('pointermove',e=>{ if(!dragging) return; moved=e.clientX-sx; if(img) img.style.transform=`translateX(${moved*0.28}px)`; });
    const end=()=>{ if(!dragging) return; dragging=false; el.classList.remove('lb-grabbing'); if(img) img.style.transform='';
      if(moved>45) prev(); else if(moved<-45) next(); };
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end); el.addEventListener('pointerleave',end);
    el.addEventListener('wheel',e=>{ if(Math.abs(e.deltaX)>Math.abs(e.deltaY)+2 && Math.abs(e.deltaX)>10){
      e.preventDefault(); const now=Date.now(); if(now-wlock<420) return; wlock=now; e.deltaX>0?next():prev(); } },{passive:false});
  }

  // ===================== COLOUR MIXER =====================
  let mix=[], mixCat=null, mixShape=null, mixLayout=[], mixSeq=[0], wildOff=[], mixView='wall';
  let mixBond='run', mixOrder=0, mixBed='normal', mixHead='normal', mixJoint='#9d988f';
  // ---- configurator surfaces: Fassade (Mauerklinker) + Boden (Pflaster/Tonplatten), inside & out ----
  function blankZone(){ return {mix:[],cat:null,shape:null,bond:'run',bed:'normal',head:'normal',joint:'#9d988f',order:0,layout:[],seq:[0],wild:[]}; }
  let zoneData={exterior_facade:blankZone(),exterior_floor:blankZone(),interior_facade:blankZone(),interior_floor:blankZone()};
  let activeZone='exterior_facade', mixScene='exterior', mixSurface='facade', mixBuilding='efh';
  const sceneNow=()=> (mixView==='interior')?'interior':(mixView==='exterior')?'exterior':mixScene;
  const zoneKey=(scene,surf)=> scene+'_'+surf;
  const surfaceOf=cat=> (cat==='mauer')?'facade':'floor';   // Mauerklinker → Fassade · Pflaster/Tonplatten → Boden
  function saveActive(){ zoneData[activeZone]={mix,cat:mixCat,shape:mixShape,bond:mixBond,bed:mixBed,head:mixHead,joint:mixJoint,order:mixOrder,layout:mixLayout,seq:mixSeq,wild:wildOff}; }
  function loadActive(name){ activeZone=name; const z=zoneData[name];
    mix=z.mix; mixCat=z.cat; mixShape=z.shape; mixBond=z.bond; mixBed=z.bed; mixHead=z.head; mixJoint=z.joint; mixOrder=z.order; mixLayout=z.layout; mixSeq=z.seq; wildOff=z.wild; }
  saveActive();   // link the initial globals to the facade surface
  const MROWS=20, MCOLS=6, NB=MCOLS+2;          // bricks per row incl. overflow
  const JW={glue:1, narrow:3, normal:6};
  // ---- shape family: only products of the same shape/format can be mixed ----
  const FAM_AR={square:1, block:2.1, brick:3.4, strip:6};   // render aspect ratio (w/h)
  const FAM_BW={square:12.5, block:17, brick:15.6, strip:22};// tile width (% of row)
  const RECT_FAM=f=>f==='brick'||f==='block'||f==='strip'||f==='square';
  function shapeFamily(p){
    const s=(p.size||'')+' '+((p.formats&&p.formats.join(' '))||'');
    if(p.cat==='tonplatten'){
      if(/hexagon|sechseck/i.test(s)) return 'hex';
      if(/oktogon|oktagon|octagon/i.test(s)) return 'oct';
      if(/quadrat|viereck/i.test(s)) return 'square';
    }
    const nums=(s.match(/\d+(?:[.,]\d+)?/g)||[]).map(n=>parseFloat(n.replace(',','.'))).filter(n=>n>0);
    if(nums.length>=2){
      const sorted=[...nums].sort((a,b)=>b-a);
      // wall/paving bricks: longest ÷ shortest (thin height) · flat tiles: two largest
      const r=(p.cat==='tonplatten') ? sorted[0]/(sorted[1]||1) : sorted[0]/(sorted[sorted.length-1]||1);
      if(r<1.3) return 'square';
      if(r<2.4) return 'block';
      if(r<4.4) return 'brick';
      return 'strip';
    }
    return 'brick';
  }
  const MORTARS=[['Weiss','#f0ece3'],['Naturweiss','#e8e1d2'],['Creme','#e3d8c0'],['Sandbeige','#d9caa6'],
    ['Hellbeige','#cdbf9c'],['Kalk','#cac4b3'],['Hellgrau','#c4bfb5'],['Perlgrau','#b2ada4'],
    ['Kieselgrau','#9d988f'],['Zementgrau','#8a857e'],['Steingrau','#75716a'],['Basaltgrau','#5d5a54'],
    ['Anthrazit','#45433f'],['Schwarzgrau','#333230'],['Sandgelb','#cdb98a'],['Tongrau','#a39a8b']];
  const MIX=()=>window.MIX;
  const mixHas=p=>mix.some(x=>x.p.id===p.id);
  const catName=c=>c==='pflaster'?I[lang].nav_pflaster:c==='mauer'?I[lang].nav_mauer:I[lang].nav_tonplatten;
  // ---- single clean stone/tile face (finds the joint-free patch of one unit) ----
  // Slides a small square window over the photo and keeps the one with the least
  // "joint energy" — i.e. no dark mortar line and no bright grout line crossing it.
  // Works for brick walls, cobbles and tile floors (hexagon/square) alike.
  const brickCache={};
  function makeBrick(p, cb){
    if(brickCache[p.id]){ cb&&cb(brickCache[p.id]); return; }
    const im=new Image();
    im.onload=()=>{
      try{
        const W=im.naturalWidth,H=im.naturalHeight;
        const AW=190, AH=Math.max(60,Math.round(AW*H/W));
        const cv=document.createElement('canvas'); cv.width=AW; cv.height=AH;
        const cx=cv.getContext('2d',{willReadFrequently:true}); cx.drawImage(im,0,0,AW,AH);
        const d=cx.getImageData(0,0,AW,AH).data;
        const lum=new Float32Array(AW*AH);
        let gmin=1e9,gmax=-1e9;
        for(let i=0,j=0;i<d.length;i+=4,j++){ const v=.299*d[i]+.587*d[i+1]+.114*d[i+2]; lum[j]=v; if(v<gmin)gmin=v; if(v>gmax)gmax=v; }
        const grange=Math.max(1,gmax-gmin);
        // multi-scale + multi-aspect search: several patch shapes so dense cobbles,
        // big faces AND long thin courses can each find a joint-free window.
        const M=Math.min(AW,AH);
        const shapes=[[0.15,0.15],[0.11,0.11],[0.24,0.12],[0.32,0.10],[0.12,0.24],
                      [0.20,0.07],[0.28,0.06],[0.07,0.20]];  // thin slivers for narrow courses
        let best=null;
        for(const [fw_,fh_] of shapes){
          const winW=Math.max(8,Math.round(M*fw_)), winH=Math.max(8,Math.round(M*fh_));
          if(winW+2>=AW || winH+2>=AH) continue;
          const stepX=Math.max(2,Math.round(winW*0.34)), stepY=Math.max(2,Math.round(winH*0.34));
          const rows=new Float32Array(winH), cols=new Float32Array(winW);
          const areaPen=Math.max(0,(0.0256-fw_*fh_))*0.6;  // gently prefer a larger clean patch
          for(let y=0;y+winH<=AH;y+=stepY) for(let x=0;x+winW<=AW;x+=stepX){
            rows.fill(0); cols.fill(0); let sum=0;
            for(let yy=0;yy<winH;yy++){ let rs=0; const base=(y+yy)*AW+x;
              for(let xx=0;xx<winW;xx++){ const v=lum[base+xx]; rs+=v; cols[xx]+=v; } rows[yy]=rs/winW; sum+=rs; }
            const area=winW*winH, mean=sum/area, rel=(mean-gmin)/grange;
            if(rel<0.12||rel>0.9) continue;               // skip deep shadow / bright mortar zones
            let rmin=1e9,rmax=-1e9,cmin=1e9,cmax=-1e9;
            for(let k=0;k<winH;k++){ const rv=rows[k]; if(rv<rmin)rmin=rv; if(rv>rmax)rmax=rv; }
            for(let k=0;k<winW;k++){ const cvl=cols[k]/winH; if(cvl<cmin)cmin=cvl; if(cvl>cmax)cmax=cvl; }
            const darkLine=Math.max(mean-rmin, mean-cmin);   // dark mortar line (bed or head joint)
            const brightLine=Math.max(rmax-mean, cmax-mean); // bright grout line
            const lineEnergy=(darkLine + brightLine*0.7)/grange;
            let vsum=0; for(let yy=0;yy<winH;yy++){ const base=(y+yy)*AW+x; for(let xx=0;xx<winW;xx++){ const dv=lum[base+xx]-mean; vsum+=dv*dv; } }
            const sd=Math.sqrt(vsum/area)/grange;
            const cxn=(x+winW/2)/AW-0.5, cyn=(y+winH/2)/AH-0.5;
            const score=lineEnergy*3.0 + Math.max(0,sd-0.24)*1.8 + Math.sqrt(cxn*cxn+cyn*cyn)*0.22 + areaPen;
            if(!best||score<best.score) best={score,x,y,winW,winH};
          }
        }
        let fx,fy,fw,fh;
        if(best){ fx=Math.round(best.x/AW*W); fy=Math.round(best.y/AH*H); fw=Math.round(best.winW/AW*W); fh=Math.round(best.winH/AH*H); }
        else { fw=Math.round(W*0.18); fh=Math.round(H*0.18); fx=Math.round((W-fw)/2); fy=Math.round((H-fh)/2); }
        const out=document.createElement('canvas'); out.width=fw; out.height=fh;
        out.getContext('2d').drawImage(im,fx,fy,fw,fh,0,0,fw,fh);
        const url=out.toDataURL('image/jpeg',0.9); brickCache[p.id]=url; cb&&cb(url);
      }catch(e){ brickCache[p.id]=p.img; cb&&cb(p.img); }
    };
    im.onerror=()=>{ brickCache[p.id]=p.img; cb&&cb(p.img); };
    im.src=imgSrc(p);
  }
  function ensureBricks(cb){ let pend=mix.length; if(!pend){cb&&cb();return;} mix.forEach(m=>makeBrick(m.p,()=>{ if(--pend===0) cb&&cb(); })); }
  const brickSrc=p=>brickCache[p.id]||p.img;
  function toast(msg){
    let t=$('#toast'); if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
    t.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2600);
  }
  function addToMixer(p){
    // route to the right surface: Mauerklinker → Fassade · Pflaster/Tonplatten → Boden
    const surf=surfaceOf(p.cat), target=zoneKey(sceneNow(),surf);
    if(target!==activeZone){ saveActive(); loadActive(target); mixSurface=surf; }
    if(mixHas(p)){ return; }                       // each product only once
    const fam=shapeFamily(p);
    if(mix.length && (p.cat!==mixCat || fam!==mixShape)){   // other category or shape → reset
      mix=[]; mixCat=null; mixShape=null; mixLayout=[]; mixBond='run';
      toast(p.cat!==mixCat ? MIX().reset[lang] : MIX().resetfmt[lang]);
    }
    mix.push({p:p, weight:3}); mixCat=p.cat; mixShape=fam; genLayout(); saveActive(); updateFab();
    makeBrick(p,()=>{ if(!$('#mixer').hidden) refreshWall(); });
    if(!$('#mixer').hidden) renderMixer();
  }
  function removeFromMixer(p){ mix=mix.filter(x=>x.p.id!==p.id); if(!mix.length){ mixCat=null; mixShape=null; } genLayout(); saveActive(); updateFab(); renderMixer(); }
  function clearMixer(){ mix=[]; mixCat=null; mixShape=null; mixLayout=[]; mixBond='run'; saveActive(); updateFab(); renderMixer(); }
  // ---- ready-made suggestions for the empty mixer (same category + same shape) ----
  const SUGGEST_SPECS=[
    {sf:'brick',cat:'pflaster',want:['terra','rot','braun'],
      t:{de:'Warmes Pflaster',fr:'Pavés chaleureux',it:'Pavimento caldo',en:'Warm paving'}},
    {sf:'brick',cat:'pflaster',want:['schwarz','grau','beige'],
      t:{de:'Anthrazit & Sand',fr:'Anthracite & sable',it:'Antracite & sabbia',en:'Anthracite & sand'}},
    {sf:'brick',cat:'mauer',want:['terra','rot','beige'],
      t:{de:'Mediterrane Fassade',fr:'Façade méditerranéenne',it:'Facciata mediterranea',en:'Mediterranean façade'}},
    {sf:'brick',cat:'mauer',want:['beige','grau','terra'],
      t:{de:'Sandstein-Töne',fr:'Tons grès',it:'Toni arenaria',en:'Sandstone tones'}},
    {sf:'hex',cat:'tonplatten',want:['terra','braun','rot'],
      t:{de:'Terrakotta-Wabe',fr:'Nid d’abeille terracotta',it:'Favo terracotta',en:'Terracotta honeycomb'}},
    {sf:'square',cat:'tonplatten',want:['terra','braun','beige'],
      t:{de:'Sanfte Böden',fr:'Sols doux',it:'Pavimenti tenui',en:'Soft floors'}}
  ];
  let _suggest=null;
  function getSuggestions(){
    if(_suggest) return _suggest;
    _suggest=SUGGEST_SPECS.map(spec=>{
      const pool=P.filter(p=>p.cat===spec.cat && shapeFamily(p)===spec.sf);
      const picked=[];
      spec.want.forEach(fam=>{ const c=pool.find(p=>p.family===fam && !picked.includes(p)); if(c) picked.push(c); });
      return {title:spec.t, cat:spec.cat, products:picked};
    }).filter(s=>s.products.length>=2);
    return _suggest;
  }
  // suggestions valid for the active surface (Fassade → Mauerklinker · Boden → Pflaster/Tonplatten)
  function surfSuggestions(){
    const cats = mixSurface==='facade' ? ['mauer'] : ['pflaster','tonplatten'];
    return getSuggestions().filter(s=>cats.includes(s.cat));
  }
  function loadSuggestion(s){ clearMixer(); s.products.forEach(p=>addToMixer(p)); renderMixer(); }
  // evenly-spaced ordered sequence that respects the mix ratio
  function evenSeq(){
    const w=mix.map(m=>m.weight), total=w.reduce((a,b)=>a+b,0)||1, acc=w.map(()=>0), seq=[];
    for(let k=0;k<total;k++){ for(let i=0;i<w.length;i++) acc[i]+=w[i];
      let mi=0; for(let i=1;i<w.length;i++) if(acc[i]>acc[mi]) mi=i; acc[mi]-=total; seq.push(mi); }
    return seq.length?seq:[0];
  }
  function genLayout(){
    mixSeq=evenSeq();
    const total=mix.reduce((a,m)=>a+m.weight,0)||1; mixLayout=[]; wildOff=[];
    for(let s=0;s<MROWS*NB;s++){
      let r=Math.random()*total, idx=0;
      for(let i=0;i<mix.length;i++){ idx=i; r-=mix[i].weight; if(r<=0) break; }
      mixLayout.push({rnd:idx, t:Math.random(), x:30+Math.floor(Math.random()*40), y:30+Math.floor(Math.random()*40), v:(0.9+Math.random()*0.2).toFixed(3)});
    }
    for(let r=0;r<MROWS;r++) wildOff.push(Math.random());
  }
  function bondOffset(row){
    if(mixBond==='stack') return 0;
    if(mixBond==='cross') return [0,0.5,0.25,0.75][row%4];
    if(mixBond==='wild') return wildOff[row]||0;
    return (row%2)*0.5;                          // running bond
  }
  // ===== unified canvas wall renderer (preview + export share one code path) =====
  const imgObjCache={};
  function ensureImgObjs(cb, products){
    const list=products||mix.map(m=>m.p);
    const map={}; let pend=0, fired=false;
    const done=()=>{ if(pend===0 && !fired){ fired=true; cb(map); } };
    list.forEach(p=>{ const src=brickSrc(p), c=imgObjCache[p.id];
      if(c && c.__src===src && c.complete){ map[p.id]=c; }
      else { pend++; const im=new Image(); im.onload=()=>{ im.__src=src; imgObjCache[p.id]=im; map[p.id]=im; pend--; done(); };
        im.onerror=()=>{ pend--; done(); }; im.src=src; }
    });
    done();
  }
  // choose which product fills grid cell (gi,gj) — spatially stable, blends random ↔ ordered
  function pickCell(map,gi,gj){
    const N=mixLayout.length||1, b=mixLayout[(((gj*NB+gi)%N)+N)%N];
    const L=mixSeq.length, ord=mixSeq[(((gi+gj)%L)+L)%L], idx=(b.t<=mixOrder)?ord:b.rnd;
    return {im:map[(mix[idx]||mix[0]).p.id], b};
  }
  function drawUnit(cx,im,x,y,w,h,b,poly){
    if(!im||w<=0||h<=0) return;
    cx.save(); cx.beginPath();
    if(poly){ poly.forEach((pt,i)=>{ const px=x+pt[0]*w, py=y+pt[1]*h; i?cx.lineTo(px,py):cx.moveTo(px,py); }); cx.closePath(); }
    else cx.rect(x,y,w,h);
    cx.clip(); if(b&&b.v) cx.filter=`brightness(${b.v})`;
    const ir=im.width/im.height, br=w/h; let dw,dh;
    if(ir>br){dh=h;dw=h*ir;}else{dw=w;dh=w/ir;}
    const jx=b?((b.x-50)/100)*(dw-w):0, jy=b?((b.y-50)/100)*(dh-h):0;
    cx.drawImage(im,x+(w-dw)/2-jx,y+(h-dh)/2-jy,dw,dh); cx.filter='none'; cx.restore();
  }
  let texJointMul=1;                                   // scene textures use finer joints
  let texDiv=1;                                        // >1 → smaller bricks (full-wall texture without tiling)
  function paintWall(cx,W,H,map){
    cx.clearRect(0,0,W,H); cx.fillStyle=mixJoint; cx.fillRect(0,0,W,H);
    const fam=mixShape||'brick', sc=W/560*texJointMul/texDiv;
    const bed=Math.max(1,JW[mixBed]*sc), head=Math.max(1,JW[mixHead]*sc);
    if(fam==='hex') return paintHex(cx,W,H,map,bed);
    if(fam==='oct') return paintOct(cx,W,H,map,Math.max(3*sc,bed));
    if(fam==='square') return paintSquare(cx,W,H,map,Math.max(bed,head));
    if(mixBond==='herring') return paintHerring(cx,W,H,map,head);
    if(mixBond==='basket') return paintBasket(cx,W,H,map,head);
    return paintCourses(cx,W,H,map,fam,bed,head);
  }
  function paintCourses(cx,W,H,map,fam,bed,head){
    const bw=W*(FAM_BW[fam]||15.6)/100/texDiv, bh=bw/(FAM_AR[fam]||3.4);
    const rows=Math.ceil(H/(bh+bed))+1, cols=Math.ceil(W/(bw+head))+2, sq=(fam==='square');
    for(let r=0;r<rows;r++){ const off=(sq?0:bondOffset(r))*(bw+head), y=r*(bh+bed);
      for(let c=-1;c<cols;c++){ const {im,b}=pickCell(map,c,r); drawUnit(cx,im,c*(bw+head)-off,y,bw,bh,b); } }
  }
  function paintSquare(cx,W,H,map,gap){
    const n=9, tw=(W-(n+1)*gap)/n, rows=Math.ceil(H/(tw+gap))+1;
    for(let r=0;r<rows;r++) for(let c=0;c<n;c++){ const {im,b}=pickCell(map,c,r);
      drawUnit(cx,im,gap+c*(tw+gap),gap+r*(tw+gap),tw,tw,b); }
  }
  // 90° herringbone: unit = H + V brick, lattice v1=(S,S) v2=(-2S,2S)
  function paintHerring(cx,W,H,map,gap){
    const S=Math.round(W*0.062), L=2*S;
    const mMax=Math.ceil((W+H)/(2*S))+5, nMin=-Math.ceil(W/(4*S))-5, nMax=Math.ceil(H/(4*S))+5;
    for(let m=-5;m<mMax;m++) for(let n=nMin;n<nMax;n++){
      const px=m*S-n*2*S, py=m*S+n*2*S;
      if(px>W+L||px<-2*L||py>H+L||py<-2*L) continue;
      const h=pickCell(map,Math.round((px+L/2)/S),Math.round((py+S/2)/S));
      drawUnit(cx,h.im,px,py,L-gap,S-gap,h.b);
      const v=pickCell(map,Math.round((px+S/2)/S),Math.round((py+S+L/2)/S));
      drawUnit(cx,v.im,px,py+S,S-gap,L-gap,v.b);
    }
  }
  // basket weave (Parkettverband): checkerboard of paired H / paired V bricks
  function paintBasket(cx,W,H,map,gap){
    const S=Math.round(W*0.066), L=2*S, cols=Math.ceil(W/L)+1, rows=Math.ceil(H/L)+1;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ const x=c*L, y=r*L;
      if((r+c)%2===0){ const a=pickCell(map,c*2,r*2), b2=pickCell(map,c*2,r*2+1);
        drawUnit(cx,a.im,x,y,L-gap,S-gap,a.b); drawUnit(cx,b2.im,x,y+S,L-gap,S-gap,b2.b); }
      else { const a=pickCell(map,c*2,r*2), b2=pickCell(map,c*2+1,r*2);
        drawUnit(cx,a.im,x,y,S-gap,L-gap,a.b); drawUnit(cx,b2.im,x+S,y,S-gap,L-gap,b2.b); }
    }
  }
  // pointy-top hexagon honeycomb (Bienenwabe)
  function paintHex(cx,W,H,map,gap){
    const cols=7, w=W/(cols+0.5), R=w/Math.sqrt(3), hgt=2*R, vp=1.5*R, rows=Math.ceil(H/vp)+2;
    const poly=[[0.5,0],[1,0.25],[1,0.75],[0.5,1],[0,0.75],[0,0.25]];
    for(let r=-1;r<rows;r++){ const cy=r*vp, xoff=((r%2)?w/2:0);
      for(let c=-1;c<=cols;c++){ const cxc=c*w+xoff, cell=pickCell(map,c,r);
        drawUnit(cx,cell.im,cxc-w/2+gap/2,cy-hgt/2+gap/2,w-gap,hgt-gap,cell.b,poly); } }
  }
  function paintOct(cx,W,H,map,gap){
    const n=8, tw=(W-(n+1)*gap)/n, rows=Math.ceil(H/(tw+gap))+1;
    const poly=[[0.3,0],[0.7,0],[1,0.3],[1,0.7],[0.7,1],[0.3,1],[0,0.7],[0,0.3]];
    for(let r=0;r<rows;r++) for(let c=0;c<n;c++){ const {im,b}=pickCell(map,c,r);
      drawUnit(cx,im,gap+c*(tw+gap),gap+r*(tw+gap),tw,tw,b,poly); }
  }
  // ---- CONFIGURATOR SCENES: apply the live klinker mix to a building ----
  function brickPattern(cx,tex,scale,scaleY){
    const pat=cx.createPattern(tex,'repeat');
    if(pat && pat.setTransform){ try{ pat.setTransform(new DOMMatrix([scale,0,0,(scaleY||scale),0,0])); }catch(e){} }
    return pat;
  }
  const poly=(cx,pts)=>{ cx.beginPath(); pts.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1])); cx.closePath(); };
  function window2(cx,x,y,w,h,arch){
    cx.save();
    cx.fillStyle='#efe9df'; cx.fillRect(x-w*0.06,y-h*0.06,w*1.12,h*1.12);            // frame
    const g=cx.createLinearGradient(x,y,x+w,y+h); g.addColorStop(0,'#7c93a3'); g.addColorStop(.5,'#aebecb'); g.addColorStop(1,'#5f7585');
    cx.fillStyle=g; cx.fillRect(x,y,w,h);
    cx.strokeStyle='#efe9df'; cx.lineWidth=Math.max(2,w*0.06);
    cx.beginPath(); cx.moveTo(x+w/2,y); cx.lineTo(x+w/2,y+h); cx.moveTo(x,y+h/2); cx.lineTo(x+w,y+h/2); cx.stroke();
    cx.strokeStyle='rgba(0,0,0,.18)'; cx.lineWidth=1; cx.strokeRect(x,y,w,h);
    cx.restore();
  }
  function shade(cx,x,y,w,h,c0,c1){ const g=cx.createLinearGradient(x,y,x,y+h); g.addColorStop(0,c0); g.addColorStop(1,c1); cx.fillStyle=g; cx.fillRect(x,y,w,h); }
  function surfFill(cx,tex,scale,fallback){ return (tex && brickPattern(cx,tex,scale)) || fallback; }
  function drawFacade(cx,W,H,fTex,pTex){
    // sky + ground (shared)
    let g=cx.createLinearGradient(0,0,0,H*0.75); g.addColorStop(0,'#bcdcef'); g.addColorStop(1,'#e9f2f6'); cx.fillStyle=g; cx.fillRect(0,0,W,H);
    const groundY=H*0.74; g=cx.createLinearGradient(0,groundY,0,H); g.addColorStop(0,'#aebd86'); g.addColorStop(1,'#93a56c'); cx.fillStyle=g; cx.fillRect(0,groundY,W,H-groundY);
    const midX=W/2;
    const fS=Math.min(W,H)/((fTex||{width:400}).width)*0.62, pS=Math.min(W,H)/((pTex||{width:400}).width)*0.72;
    // paved forecourt (Boden mix) — perspective trapezoid
    cx.save(); poly(cx,[[midX-W*0.10,groundY],[midX+W*0.10,groundY],[midX+W*0.30,H],[midX-W*0.30,H]]); cx.clip();
    cx.fillStyle=surfFill(cx,pTex,pS,'#c9c3b7'); cx.fillRect(0,groundY,W,H-groundY);
    shade(cx,0,groundY,W,H-groundY,'rgba(0,0,0,0)','rgba(0,0,0,.28)'); cx.restore();
    // helpers
    const fillFacade=(x0,y0,w,h)=>{ cx.save(); cx.beginPath(); cx.rect(x0,y0,w,h); cx.clip();
      cx.fillStyle=surfFill(cx,fTex,fS,'#cfc8ba'); cx.fillRect(x0,y0,w,h);
      const ao=cx.createLinearGradient(x0,0,x0+w,0); ao.addColorStop(0,'rgba(0,0,0,.16)'); ao.addColorStop(.5,'rgba(0,0,0,0)'); ao.addColorStop(1,'rgba(0,0,0,.16)'); cx.fillStyle=ao; cx.fillRect(x0,y0,w,h);
      shade(cx,x0,y0,w,h,'rgba(255,255,255,.06)','rgba(0,0,0,.12)'); cx.restore(); };
    const drawDoor=(dx,dy,dw,dh)=>{ cx.fillStyle='#efe9df'; cx.fillRect(dx-dw*0.08,dy-dh*0.03,dw*1.16,dh*1.03);
      const dg=cx.createLinearGradient(dx,dy,dx+dw,dy); dg.addColorStop(0,'#2f3d3a'); dg.addColorStop(1,'#243230'); cx.fillStyle=dg; cx.fillRect(dx,dy,dw,dh);
      cx.fillStyle='rgba(255,255,255,.7)'; cx.fillRect(dx+dw*0.72,dy+dh*0.45,dw*0.05,dh*0.12); };
    const dropShadow=(cxn,w2)=>{ cx.fillStyle='rgba(0,0,0,.14)'; cx.beginPath(); cx.ellipse(cxn,groundY+H*0.012,w2,H*0.02,0,0,7); cx.fill(); };
    const fascia=(x0,w,y,t)=>{ cx.fillStyle='#2c2e30'; cx.fillRect(x0-W*0.02,y,w+W*0.04,t); };

    if(mixBuilding==='villa'){
      const hw=W*0.60, hx0=midX-hw/2, hx1=hx0+hw, eaveY=H*0.24, roofTop=H*0.145, gy=groundY-eaveY;
      cx.save(); poly(cx,[[hx0-W*0.04,eaveY],[hx1+W*0.04,eaveY],[hx1-W*0.11,roofTop],[hx0+W*0.11,roofTop]]);
      g=cx.createLinearGradient(0,roofTop,0,eaveY); g.addColorStop(0,'#4a4d51'); g.addColorStop(1,'#33363a'); cx.fillStyle=g; cx.fill(); cx.restore();
      fillFacade(hx0,eaveY,hw,gy); fascia(hx0,hw,eaveY-H*0.012,H*0.016);
      const ww=hw*0.19, wh=gy*0.19;
      for(let r=0;r<3;r++){ const y=eaveY+gy*(0.1+r*0.29);
        [0.1,0.405,0.71].forEach((cxp,ci)=>{ if(r===2&&ci===1) return; window2(cx,hx0+hw*cxp,y,ww,wh); }); }
      const dw=hw*0.16, dh=gy*0.34; drawDoor(midX-dw/2,groundY-dh,dw,dh); dropShadow(midX,hw*0.6);
    } else if(mixBuilding==='bungalow'){
      const hw=W*0.82, hx0=midX-hw/2, eaveY=H*0.5, gy=groundY-eaveY;
      cx.fillStyle='#3a3d40'; cx.fillRect(hx0-W*0.04,eaveY-H*0.028,hw+W*0.08,H*0.028);   // flat roof slab + overhang
      fillFacade(hx0,eaveY,hw,gy);
      const ww=hw*0.14, wh=gy*0.5, wy=eaveY+gy*0.22;
      [0.05,0.24,0.62,0.81].forEach(cxp=>window2(cx,hx0+hw*cxp,wy,ww,wh));
      const dw=hw*0.1, dh=gy*0.72; drawDoor(hx0+hw*0.44,groundY-dh,dw,dh); dropShadow(midX,hw*0.55);
    } else if(mixBuilding==='office'){
      const hw=W*0.70, hx0=midX-hw/2, eaveY=H*0.16, gy=groundY-eaveY;
      fillFacade(hx0,eaveY,hw,gy); fascia(hx0,hw,eaveY-H*0.02,H*0.024);   // parapet
      const cols=4, rows=4, gpx=hw*0.035, gpy=gy*0.05, cw=(hw*0.9-(cols+1)*gpx)/cols, ch=(gy*0.82-(rows+1)*gpy)/rows, gx0=hx0+hw*0.05, gy0=eaveY+gy*0.05;
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) window2(cx,gx0+gpx+c*(cw+gpx),gy0+gpy+r*(ch+gpy),cw,ch);
      const dw=hw*0.2, dh=gy*0.12; drawDoor(midX-dw/2,groundY-dh,dw,dh); dropShadow(midX,hw*0.55);
    } else { // efh (Einfamilienhaus) — gabled
      const hw=W*0.56, hx0=midX-hw/2, hx1=hx0+hw, eaveY=H*0.36, apexY=H*0.14, gy=groundY-eaveY;
      cx.save(); poly(cx,[[hx0-W*0.05,eaveY+H*0.012],[hx1+W*0.05,eaveY+H*0.012],[midX,apexY-H*0.02]]);
      g=cx.createLinearGradient(0,apexY,0,eaveY); g.addColorStop(0,'#4a4d51'); g.addColorStop(1,'#303234'); cx.fillStyle=g; cx.fill(); cx.restore();
      cx.save(); poly(cx,[[hx0,eaveY],[hx1,eaveY],[midX,apexY]]); cx.clip();
      cx.fillStyle=surfFill(cx,fTex,fS,'#cfc8ba'); cx.fillRect(hx0,apexY,hw,eaveY-apexY);
      shade(cx,hx0,apexY,hw,eaveY-apexY,'rgba(255,255,255,.05)','rgba(0,0,0,.14)'); cx.restore();
      fillFacade(hx0,eaveY,hw,gy); fascia(hx0,hw,eaveY-H*0.014,H*0.02);
      const ww=hw*0.19, wh=gy*0.26, uY=eaveY+gy*0.12, lY=eaveY+gy*0.52;
      window2(cx,hx0+hw*0.13,uY,ww,wh); window2(cx,hx1-hw*0.13-ww,uY,ww,wh); window2(cx,hx0+hw*0.13,lY,ww,wh);
      const dw=hw*0.2, dh=gy*0.42; drawDoor(hx1-hw*0.13-dw,groundY-dh,dw,dh);
      window2(cx,midX-ww*0.4,apexY+(eaveY-apexY)*0.4,ww*0.8,wh*0.5); dropShadow(midX,hw*0.62);
    }
  }
  function drawInterior(cx,W,H,tex,floorTex){
    const floorY=H*0.68, pScale=Math.min(W,H)/((tex||{width:400}).width)*0.5;
    const flScale=Math.min(W,H)/((floorTex||{width:400}).width)*0.6;
    // ceiling + back wall base
    cx.fillStyle='#efe7db'; cx.fillRect(0,0,W,floorY);
    // left wall (perspective, plain warm)
    const vpX=W*0.5;
    cx.save(); poly(cx,[[0,0],[W*0.2,H*0.12],[W*0.2,floorY-H*0.06],[0,floorY]]); const gg=cx.createLinearGradient(0,0,W*0.2,0); gg.addColorStop(0,'#d8cebd'); gg.addColorStop(1,'#e8e0d2'); cx.fillStyle=gg; cx.fill(); cx.restore();
    // back brick wall (accent — Riemchen)
    const bx0=W*0.2, bx1=W, byTop=H*0.1, byBot=floorY-H*0.06;
    cx.save(); cx.beginPath(); cx.rect(bx0,byTop,bx1-bx0,byBot-byTop); cx.clip();
    cx.fillStyle=surfFill(cx,tex,pScale,'#cfc8ba'); cx.fillRect(bx0,byTop,bx1-bx0,byBot-byTop);
    // light falloff from left window
    const lf=cx.createLinearGradient(bx0,0,bx1,0); lf.addColorStop(0,'rgba(255,245,225,.28)'); lf.addColorStop(.55,'rgba(0,0,0,0)'); lf.addColorStop(1,'rgba(0,0,0,.2)'); cx.fillStyle=lf; cx.fillRect(bx0,byTop,bx1-bx0,byBot-byTop);
    cx.restore();
    // floor (Boden mix — Pflaster/Tonplatten — or warm neutral)
    cx.save(); cx.beginPath(); cx.rect(0,floorY,W,H-floorY); cx.clip();
    cx.fillStyle=surfFill(cx,floorTex,flScale,'#b99a76'); cx.fillRect(0,floorY,W,H-floorY);
    const fsh=cx.createLinearGradient(0,floorY,0,H); fsh.addColorStop(0,'rgba(0,0,0,.22)'); fsh.addColorStop(.4,'rgba(0,0,0,0)'); fsh.addColorStop(1,'rgba(255,255,255,.06)'); cx.fillStyle=fsh; cx.fillRect(0,floorY,W,H-floorY);
    cx.restore();
    // large framed picture on brick wall
    const px=bx0+(bx1-bx0)*0.5, pw=(bx1-bx0)*0.26, ph=(byBot-byTop)*0.42, py=byTop+(byBot-byTop)*0.16;
    cx.fillStyle='#1c1b19'; cx.fillRect(px,py,pw,ph); cx.fillStyle='#c9b79a'; cx.fillRect(px+pw*0.06,py+ph*0.06,pw*0.88,ph*0.88);
    // hanging pendant lamp
    cx.strokeStyle='#333'; cx.lineWidth=2; cx.beginPath(); cx.moveTo(W*0.62,byTop); cx.lineTo(W*0.62,H*0.3); cx.stroke();
    cx.fillStyle='#2b2a28'; cx.beginPath(); cx.moveTo(W*0.585,H*0.34); cx.lineTo(W*0.655,H*0.34); cx.lineTo(W*0.63,H*0.3); cx.lineTo(W*0.61,H*0.3); cx.closePath(); cx.fill();
    // sofa
    const sfy=floorY-H*0.02, sfx=W*0.16, sfw=W*0.44;
    cx.fillStyle='rgba(0,0,0,.13)'; cx.beginPath(); cx.ellipse(sfx+sfw/2,floorY+H*0.12,sfw*0.56,H*0.03,0,0,7); cx.fill();
    cx.fillStyle='#8d6f63'; roundRect(cx,sfx,sfy-H*0.16,sfw,H*0.18,12); cx.fill();
    cx.fillStyle='#a2867a'; roundRect(cx,sfx+sfw*0.03,sfy-H*0.11,sfw*0.44,H*0.09,10); cx.fill(); roundRect(cx,sfx+sfw*0.52,sfy-H*0.11,sfw*0.44,H*0.09,10); cx.fill();
    // plant
    const plx=W*0.9; cx.fillStyle='#7a5b45'; cx.fillRect(plx,floorY-H*0.02,W*0.05,H*0.09);
    cx.fillStyle='#4f7a4a'; [[-0.02,-0.12],[0.02,-0.13],[0,-0.16]].forEach(o=>{ cx.beginPath(); cx.ellipse(plx+W*0.025+o[0]*W,floorY-H*0.02+o[1]*H,W*0.02,H*0.06,0,0,7); cx.fill(); });
  }
  function roundRect(cx,x,y,w,h,r){ cx.beginPath(); cx.moveTo(x+r,y); cx.arcTo(x+w,y,x+w,y+h,r); cx.arcTo(x+w,y+h,x,y+h,r); cx.arcTo(x,y+h,x,y,r); cx.arcTo(x,y,x+w,y,r); cx.closePath(); }
  // ---- photo scenes: project the live mix onto a real render (Muhr-style material swap) ----
  // masks are normalized [0..1] image coordinates; openings are redrawn from the photo on top
  const SCENES={
    efh:{ src:'assets/img/scenes/efh.jpg', mask:'assets/img/scenes/efh-mask.png',
      facade:{x0:0.195,y0:0.328,x1:0.805,y1:0.740},
      openings:[
        [0.270,0.336,0.386,0.462],[0.466,0.336,0.532,0.446],[0.655,0.336,0.727,0.462],
        [0.270,0.568,0.386,0.788],[0.655,0.568,0.727,0.695],[0.446,0.578,0.557,0.815]
      ],
      floor:[[0.105,0.800],[0.895,0.800],[0.960,0.952],[0.040,0.952]],
      floorExtra:[[0.418,0.780],[0.582,0.780],[0.582,0.805],[0.418,0.805]],
      cropBottom:0.955, facadeTiles:7, floorTiles:5, floorHorizon:0.735 },
    villa:{ src:'assets/img/scenes/villa.jpg', mask:'assets/img/scenes/villa-mask.png',
      facade:{x0:0.140,y0:0.328,x1:0.860,y1:0.805},
      openings:[
        [0.206,0.352,0.260,0.542],[0.323,0.352,0.377,0.542],[0.469,0.352,0.523,0.542],[0.615,0.352,0.669,0.542],[0.731,0.352,0.785,0.542],
        [0.206,0.615,0.260,0.810],[0.323,0.615,0.377,0.810],[0.615,0.615,0.669,0.810],[0.731,0.615,0.785,0.810],
        [0.408,0.545,0.592,0.815],[0.385,0.810,0.615,0.958]
      ],
      floor:[[0.0,0.90],[1.0,0.90],[1.0,1.0],[0.0,1.0]],
      facadeTiles:7.5, floorTiles:6, floorHorizon:0.78 },
    bungalow:{ src:'assets/img/scenes/bungalow.jpg', mask:'assets/img/scenes/bungalow-mask.png',
      facade:{x0:0.166,y0:0.332,x1:0.833,y1:0.705},
      openings:[
        [0.088,0.383,0.405,0.452],[0.236,0.487,0.267,0.700],[0.296,0.452,0.365,0.700],
        [0.408,0.452,0.808,0.703],[0.115,0.655,0.36,0.755],[0.335,0.655,0.425,0.775]
      ],
      floor:[[0.155,0.735],[0.845,0.735],[0.97,1.0],[0.03,1.0]],
      facadeTiles:8.5, floorTiles:5, floorHorizon:0.665, key:{lum:98,blue:55} },
    office:{ src:'assets/img/scenes/office.jpg', mask:'assets/img/scenes/office-mask.png',
      facade:{x0:0.107,y0:0.202,x1:0.896,y1:0.852},
      openings:[
        [0.131,0.242,0.232,0.406],[0.259,0.242,0.359,0.406],[0.385,0.242,0.487,0.406],[0.513,0.242,0.615,0.406],[0.640,0.242,0.740,0.406],[0.767,0.242,0.867,0.406],
        [0.131,0.451,0.232,0.621],[0.259,0.451,0.359,0.621],[0.385,0.451,0.487,0.621],[0.513,0.451,0.615,0.621],[0.640,0.451,0.740,0.621],[0.767,0.451,0.867,0.621],
        [0.131,0.660,0.232,0.848],[0.259,0.660,0.359,0.848],[0.640,0.660,0.740,0.848],[0.767,0.660,0.867,0.848],
        [0.385,0.635,0.615,0.850],
        [0.075,0.775,0.375,0.888],[0.63,0.775,0.93,0.888]
      ],
      floor:[[0.0,0.868],[1.0,0.868],[1.0,1.0],[0.0,1.0]],
      facadeTiles:11, floorTiles:6, floorHorizon:0.80, key:{lum:108,blue:45} },
    friesen:{ src:'assets/img/scenes/friesen.jpg', mask:'assets/img/scenes/friesen-mask.png',
      facades:[
        {x0:0.107,y0:0.565,x1:0.893,y1:0.816},
        {x0:0.393,y0:0.298,x1:0.607,y1:0.567},
        [0.5,0.132, 0.603,0.300, 0.397,0.300],
        {x0:0.228,y0:0.345,x1:0.312,y1:0.475},
        {x0:0.688,y0:0.345,x1:0.772,y1:0.475}
      ],
      openings:[
        [0.177,0.592,0.246,0.745],[0.297,0.592,0.365,0.745],[0.636,0.592,0.704,0.745],[0.756,0.592,0.825,0.745],
        [0.457,0.585,0.543,0.825],
        [0.431,0.345,0.487,0.470],[0.513,0.345,0.569,0.470],
        [0.238,0.352,0.303,0.472],[0.697,0.352,0.762,0.472],
        [0.44,0.815,0.56,0.852],
        [0.055,0.775,0.40,0.888],[0.60,0.775,0.945,0.888],
        [0.0,0.925,0.16,1.0],[0.84,0.925,1.0,1.0]
      ],
      floor:[[0.06,0.845],[0.94,0.845],[1.0,1.0],[0.0,1.0]],
      facadeTiles:8, floorTiles:5, floorHorizon:0.775 },
    interior:{ src:'assets/img/scenes/wohnzimmer.jpg', mask:'assets/img/scenes/wohnzimmer-mask.png',
      facade:{x0:0.190,y0:0.100,x1:0.823,y1:0.732},          // accent wall (Riemchen), full coverage
      openings:[
        // sofa silhouette down to the seat frame (floor tiles run underneath)
        [0.287,0.650, 0.735,0.650, 0.752,0.672, 0.752,0.875, 0.266,0.875, 0.266,0.672],
        [0.828,0.520,1.0,0.860]                                        // right wall recess + console + vase
      ],
      floor:[[0.0,0.780],[0.20,0.722],[1.0,0.718],[1.0,1.0],[0.0,1.0]],
      floorHorizon:0.44, facadeTiles:6, floorPavers:15, restore:true, key:{lum:70,sat:0.42,blue:60} }
  };
  const sceneImgCache={};
  function loadImgUrl(src,cb){
    const c=sceneImgCache[src];
    if(c && c.complete && c.naturalWidth){ cb(c); return; }
    const im=new Image();
    im.onload=()=>{ sceneImgCache[src]=im; cb(im); };
    im.onerror=()=>cb(null);
    im.src=src;
  }
  // load scene photo + its wall/floor mask (R=wall, G=floor)
  function loadScene(cfg,cb){
    loadImgUrl(cfg.src,img=>{
      if(!img){ cb(null,null); return; }
      if(cfg.mask) loadImgUrl(cfg.mask,mk=>cb(img,mk)); else cb(img,null);
    });
  }
  function loadSceneImg(cfg,cb){
    const c=sceneImgCache[cfg.src];
    if(c && c.complete && c.naturalWidth){ cb(c); return; }
    const im=new Image();
    im.onload=()=>{ sceneImgCache[cfg.src]=im; cb(im); };
    im.onerror=()=>cb(null);
    im.src=cfg.src;
  }
  // perspective paving: real pavers in a running bond that foreshorten with depth,
  // coloured by sampling the floor mix texture. Reads clearly as laid stones.
  function paintGroundPavers(cx,pg,tex,nx,horizonY){
    if(pg.length<3) return;
    const ys=pg.map(p=>p[1]), yNear=Math.max(...ys), yFar=Math.min(...ys);
    if(yNear-yFar<4) return;
    const srt=[...pg].sort((a,b)=>a[1]-b[1]);
    const farE=[srt[0],srt[1]].sort((a,b)=>a[0]-b[0]), nearE=[srt[srt.length-2],srt[srt.length-1]].sort((a,b)=>a[0]-b[0]);
    const [farL,farR]=farE, [nearL,nearR]=nearE;
    const yh = (horizonY!=null) ? Math.min(horizonY,yFar-2) : yFar-(yNear-yFar)*1.4;
    const lerpX=(A,B,y)=> A[0]+(B[0]-A[0])*((y-A[1])/((B[1]-A[1])||1));
    const xL=y=> lerpX(farL,nearL,y), xR=y=> lerpX(farR,nearR,y);
    const dNear=1/(yNear-yh), dFar=1/(yFar-yh);
    const ny=Math.max(6,Math.round(nx*0.85));
    // sample colours from the floor texture — biased toward its mean so adjacent
    // pavers vary gently (laid stones) instead of a chaotic patchwork
    let px=null,mr=138,mg=106,mb=88; try{ px=tex.getContext('2d').getImageData(0,0,tex.width,tex.height).data;
      let sr=0,sg=0,sb=0,n=px.length/4; for(let i=0;i<px.length;i+=4){sr+=px[i];sg+=px[i+1];sb+=px[i+2];} mr=sr/n;mg=sg/n;mb=sb/n; }catch(e){}
    const sampleCol=()=>{ if(!px) return '#8a6a58'; const i=(Math.floor(Math.random()*(tex.width*tex.height)))*4;
      const k=0.5, v=0.94+Math.random()*0.1;   // blend 50% to mean, light shade jitter
      const r=(px[i]*(1-k)+mr*k)*v, g=(px[i+1]*(1-k)+mg*k)*v, b=(px[i+2]*(1-k)+mb*k)*v;
      return 'rgb('+Math.min(255,r|0)+','+Math.min(255,g|0)+','+Math.min(255,b|0)+')'; };
    cx.save(); cx.beginPath(); pg.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1])); cx.closePath(); cx.clip();
    cx.fillStyle=mixJoint; cx.fillRect(Math.min(...pg.map(p=>p[0])),yFar,Math.max(...pg.map(p=>p[0]))-Math.min(...pg.map(p=>p[0])),yNear-yFar+1);
    const yAt=d=> yh+1/d, j=1.1;
    for(let r=0;r<ny;r++){
      const yBot=yAt(dNear+(dFar-dNear)*r/ny), yTop=yAt(dNear+(dFar-dNear)*(r+1)/ny);
      const off=(r%2)?0.5:0, lB=xL(yBot),rB=xR(yBot),lT=xL(yTop),rT=xR(yTop);
      for(let c=-1;c<=nx;c++){
        const u0=(c+off)/nx, u1=(c+1+off)/nx;
        cx.fillStyle=sampleCol();
        cx.beginPath();
        cx.moveTo(lB+(rB-lB)*u0+j, yBot-j); cx.lineTo(lB+(rB-lB)*u1-j, yBot-j);
        cx.lineTo(lT+(rT-lT)*u1-j, yTop+j); cx.lineTo(lT+(rT-lT)*u0+j, yTop+j); cx.closePath(); cx.fill();
      }
    }
    cx.restore();
  }
  // feather the brick alpha mask so key edges blend instead of cutting hard
  function featherAlpha(od,Wp,Hp){
    const N=Wp*Hp, a=new Uint8Array(N), tmp=new Float32Array(N), R=2, D=R*2+1;
    for(let p=0,i=3;p<N;p++,i+=4) a[p]=od[i];
    for(let y=0;y<Hp;y++){ const row=y*Wp; let s=0;
      for(let k=-R;k<=R;k++) s+=a[row+Math.min(Wp-1,Math.max(0,k))];
      for(let x=0;x<Wp;x++){ tmp[row+x]=s/D; s+=a[row+Math.min(Wp-1,x+R+1)]-a[row+Math.max(0,x-R)]; } }
    for(let x=0;x<Wp;x++){ let s=0;
      for(let k=-R;k<=R;k++) s+=tmp[Math.min(Hp-1,Math.max(0,k))*Wp+x];
      for(let y=0;y<Hp;y++){ od[(y*Wp+x)*4+3]=s/D; s+=tmp[Math.min(Hp-1,y+R+1)*Wp+x]-tmp[Math.max(0,y-R)*Wp+x]; } }
  }
  function drawPhotoScene(cx,W,H,img,cfg,fTexMaker,pTex,mImg){
    // cover-fit the photo, optionally cropping the bottom (e.g. gravel strip)
    const crop=cfg.cropBottom||1, sH=img.naturalHeight*crop;
    const s=Math.max(W/img.naturalWidth,H/sH);
    const dw=img.naturalWidth*s, dh=sH*s, ox=(W-dw)/2, oy=(H-dh)/2;
    cx.drawImage(img,0,0,img.naturalWidth,sH,ox,oy,dw,dh);
    const mx=nx=>ox+nx*dw, my=ny=>oy+(ny/crop)*dh;
    // facade(s): colour-key each wall face — light plaster becomes brick, dark glass /
    // roof / door stay from the photo. Brick keeps the photo's shading (multiply).
    // face = rect {x0,y0,x1,y1} or polygon flat list [x0,y0,x1,y1,...]
    if(fTexMaker){
      // when a precise mask exists, the brick region = the mask's red bounding box
      // (so brick fills the whole wall — down to the plinth and out to the corners).
      let facs=cfg.facades||[cfg.facade];
      if(mImg){
        const sc=document.createElement('canvas'); sc.width=220; sc.height=Math.max(2,Math.round(220*mImg.naturalHeight/mImg.naturalWidth));
        const scx=sc.getContext('2d',{willReadFrequently:true}); scx.drawImage(mImg,0,0,sc.width,sc.height);
        let md=null; try{ md=scx.getImageData(0,0,sc.width,sc.height).data; }catch(e){}
        if(md){ let x0=sc.width,y0=sc.height,x1=0,y1=0,any=false;
          for(let y=0;y<sc.height;y++){ const r=y*sc.width; for(let x=0;x<sc.width;x++){ if(md[(r+x)*4]>40){ any=true; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } } }
          if(any) facs=[{x0:x0/sc.width,y0:y0/sc.height,x1:(x1+1)/sc.width,y1:(y1+1)/sc.height}];
        }
      }
      // union bbox of all wall faces → ONE continuous texture (no tiling, no visible repeat)
      let ux0=1,uy0=1,ux1=0,uy1=0;
      facs.forEach(f=>{ const xs=Array.isArray(f)?f.filter((_,i)=>i%2===0):[f.x0,f.x1];
        const ys=Array.isArray(f)?f.filter((_,i)=>i%2===1):[f.y0,f.y1];
        ux0=Math.min(ux0,...xs); ux1=Math.max(ux1,...xs); uy0=Math.min(uy0,...ys); uy1=Math.max(uy1,...ys); });
      const UX=mx(ux0), UY=my(uy0), UW=Math.max(2,mx(ux1)-UX), UH=Math.max(2,my(uy1)-UY);
      const fTex=fTexMaker(UW,UH,cfg.facadeTiles||7);
      if(!fTex) { /* no facade mix */ }
      else {
      const key=cfg.key||{};
      const lumT=key.lum!=null?key.lum:118, satT=key.sat!=null?key.sat:0.26, blueT=key.blue!=null?key.blue:20;
      facs.forEach(f=>{
        let nxs,nys,polyN;
        if(Array.isArray(f)){ nxs=[];nys=[];polyN=[]; for(let i=0;i<f.length;i+=2){ nxs.push(f[i]); nys.push(f[i+1]); polyN.push([f[i],f[i+1]]); } }
        else { nxs=[f.x0,f.x1]; nys=[f.y0,f.y1]; polyN=[[f.x0,f.y0],[f.x1,f.y0],[f.x1,f.y1],[f.x0,f.y1]]; }
        const nx0=Math.min(...nxs),nx1=Math.max(...nxs),ny0=Math.min(...nys),ny1=Math.max(...nys);
        const X=mx(nx0),Y=my(ny0),Wp=Math.max(1,Math.round(mx(nx1)-X)),Hp=Math.max(1,Math.round(my(ny1)-Y));
        const lay=document.createElement('canvas'); lay.width=Wp; lay.height=Hp;
        const lc=lay.getContext('2d',{willReadFrequently:true});
        const sx=nx0*img.naturalWidth, sy=ny0*img.naturalHeight, sw=(nx1-nx0)*img.naturalWidth, sh=(ny1-ny0)*img.naturalHeight;
        lc.drawImage(img,sx,sy,sw,sh,0,0,Wp,Hp);
        let photo; try{ photo=lc.getImageData(0,0,Wp,Hp).data; }catch(e){ photo=null; }
        // precise wall mask (R channel) built per scene — replaces the colour key
        let maskData=null;
        if(mImg){
          const mc=document.createElement('canvas'); mc.width=Wp; mc.height=Hp;
          const mcx=mc.getContext('2d',{willReadFrequently:true});
          mcx.drawImage(mImg, nx0*mImg.naturalWidth, ny0*mImg.naturalHeight,
            (nx1-nx0)*mImg.naturalWidth, (ny1-ny0)*mImg.naturalHeight, 0,0,Wp,Hp);
          try{ maskData=mcx.getImageData(0,0,Wp,Hp).data; }catch(e){ maskData=null; }
        }
        // brick over the photo region: a light direct pass keeps the brick colour strong
        // even on very light plaster, then multiply carries the photo's shadows.
        lc.globalAlpha=0.35; lc.drawImage(fTex, X-UX, Y-UY, Wp, Hp, 0, 0, Wp, Hp); lc.globalAlpha=1;
        lc.globalCompositeOperation='multiply';
        lc.drawImage(fTex, X-UX, Y-UY, Wp, Hp, 0, 0, Wp, Hp);
        lc.globalCompositeOperation='source-over';
        if(maskData){
          const out=lc.getImageData(0,0,Wp,Hp), od=out.data, N=Wp*Hp;
          for(let p=0,i=3;p<N;p++,i+=4) od[i]=maskData[p*4];           // wall alpha = mask red (bilinear = soft edge)
          lc.putImageData(out,0,0);
        } else if(photo){
          const out=lc.getImageData(0,0,Wp,Hp), od=out.data, N=Wp*Hp;
          const darkT=key.dark!=null?key.dark:110;
          const plaster=new Uint8Array(N), dark=new Uint8Array(N);
          for(let p=0,i=0;p<N;p++,i+=4){
            const r=photo[i],g=photo[i+1],b=photo[i+2], lum=(r+g+b)/3, mxc=Math.max(r,g,b),mnc=Math.min(r,g,b), sat=mxc?(mxc-mnc)/mxc:0;
            plaster[p]=(lum>lumT && sat<satT && b<=r+blueT)?1:0;
            dark[p]=(lum<darkT)?1:0;                                   // glass / door / dark reveals
          }
          const win=new Uint8Array(N);
          if(!cfg.restore){   // exteriors: keep whole window/door boxes (connected dark regions) + frame
            const seen=new Uint8Array(N), st=new Int32Array(N); let sp;
            const M=Math.round(Math.min(Wp,Hp)*(key.frame!=null?key.frame:0.026)), minA=N*0.0008;
            for(let s=0;s<N;s++){
              if(!dark[s]||seen[s]) continue;
              let minx=Wp,miny=Hp,maxx=0,maxy=0,area=0; sp=0; st[sp++]=s; seen[s]=1;
              while(sp){ const q=st[--sp], x=q%Wp, y=(q/Wp)|0; area++;
                if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
                if(x>0&&dark[q-1]&&!seen[q-1]){seen[q-1]=1;st[sp++]=q-1;}
                if(x<Wp-1&&dark[q+1]&&!seen[q+1]){seen[q+1]=1;st[sp++]=q+1;}
                if(y>0&&dark[q-Wp]&&!seen[q-Wp]){seen[q-Wp]=1;st[sp++]=q-Wp;}
                if(y<Hp-1&&dark[q+Wp]&&!seen[q+Wp]){seen[q+Wp]=1;st[sp++]=q+Wp;}
              }
              const bw=maxx-minx, bh=maxy-miny;
              if(area<minA || bw>Wp*0.55 || bh>Hp*0.9) continue;       // skip noise & roof-sized blobs
              const ax=Math.max(0,minx-M),ay=Math.max(0,miny-M),bx=Math.min(Wp-1,maxx+M),by=Math.min(Hp-1,maxy+Math.round(M*1.5));
              for(let y=ay;y<=by;y++){ const row=y*Wp; for(let x=ax;x<=bx;x++) win[row+x]=1; }
            }
          }
          for(let p=0,i=3;p<N;p++,i+=4){ if(!plaster[p]||win[p]) od[i]=0; }  // brick only on plaster outside openings
          featherAlpha(od,Wp,Hp);                                            // soften key edges (no hard cutouts)
          lc.putImageData(out,0,0);
        }
        cx.save(); cx.beginPath(); polyN.forEach((p,i)=>{const Xp=mx(p[0]),Yp=my(p[1]); i?cx.lineTo(Xp,Yp):cx.moveTo(Xp,Yp);}); cx.closePath(); cx.clip();
        cx.drawImage(lay,X,Y); cx.restore();
      });
      }
    }
    // floor: perspective pavers coloured by the mix, then multiply the photo floor so
    // its light/shadows/perspective stay. Clipped to the paved area (mask G channel).
    if(pTex){
      const hz=(cfg.floorHorizon!=null)?my(cfg.floorHorizon):null;
      const fills=[cfg.floor].concat(cfg.floorExtra?[cfg.floorExtra]:[]).map(pg=>pg.map(p=>[mx(p[0]),my(p[1])]));
      const flr=document.createElement('canvas'); flr.width=W; flr.height=H;
      const fc=flr.getContext('2d');
      fills.forEach(pg=>paintGroundPavers(fc,pg,pTex,cfg.floorPavers||16,hz));
      fc.save(); fc.beginPath(); fills.forEach(pg=>{ pg.forEach((p,i)=>i?fc.lineTo(p[0],p[1]):fc.moveTo(p[0],p[1])); fc.closePath(); });
      fc.clip(); fc.globalCompositeOperation='multiply'; fc.globalAlpha=0.85;
      fc.drawImage(img,0,0,img.naturalWidth,sH,ox,oy,dw,dh); fc.restore();
      if(mImg){
        const gm=document.createElement('canvas'); gm.width=W; gm.height=H;
        const gc=gm.getContext('2d',{willReadFrequently:true});
        gc.drawImage(mImg,0,0,mImg.naturalWidth,mImg.naturalHeight*crop,ox,oy,dw,dh);
        let id=null; try{ id=gc.getImageData(0,0,W,H); }catch(e){}
        if(id){ const d=id.data; for(let i=0;i<d.length;i+=4){ d[i+3]=d[i+1]; d[i]=d[i+1]=d[i+2]=255; }
          gc.putImageData(id,0,0); fc.globalCompositeOperation='destination-in'; fc.globalAlpha=1; fc.drawImage(gm,0,0); }
      }
      cx.drawImage(flr,0,0);
    }
    // restore fixed elements (furniture / objects) from the photo — only where the colour
    // key can't separate them (light-on-light interiors). Exterior glass is kept by the key.
    // rect: [x0,y0,x1,y1] · polygon silhouette: flat list [x0,y0,x1,y1,x2,y2,...]
    if((fTexMaker||pTex) && cfg.restore){ (cfg.openings||[]).forEach(o=>{
      let x0,y0,x1,y1;
      if(o.length>4){
        const xs=[],ys=[]; for(let i=0;i<o.length;i+=2){ xs.push(o[i]); ys.push(o[i+1]); }
        x0=Math.min(...xs); x1=Math.max(...xs); y0=Math.min(...ys); y1=Math.max(...ys);
        cx.save(); cx.beginPath();
        for(let i=0;i<o.length;i+=2){ const px2=mx(o[i]),py2=my(o[i+1]); i?cx.lineTo(px2,py2):cx.moveTo(px2,py2); }
        cx.closePath(); cx.clip();
      } else { [x0,y0,x1,y1]=o; }
      cx.drawImage(img, x0*img.naturalWidth,y0*img.naturalHeight,(x1-x0)*img.naturalWidth,(y1-y0)*img.naturalHeight,
        mx(x0),my(y0),(x1-x0)*dw,my(y1)-my(y0));
      if(o.length>4) cx.restore();
    }); }
  }
  function refreshWall(){
    const host=$('#mixPreview'); if(!host) return;
    const sceneView=(mixView==='exterior'||mixView==='interior');
    if(!mix.length && !sceneView){ host.innerHTML=''; return; }
    saveActive();
    if(!sceneView && !mixLayout.length) genLayout();
    let cv=host.querySelector('canvas.mixcanvas');
    if(!cv){ host.innerHTML=''; cv=document.createElement('canvas'); cv.className='mixcanvas'; host.appendChild(cv); }
    const dW=Math.max(220,host.clientWidth||host.getBoundingClientRect().width|0);
    const dH=Math.max(220,host.clientHeight||host.getBoundingClientRect().height|0);
    // cap the internal render size (scene color-keying is costly) → CSS scales up to the display
    const MAXR=sceneView?1000:1400, r=Math.min(1,MAXR/dW);
    const W=Math.round(dW*r), H=Math.round(dH*r);
    const dpr=sceneView?1:Math.min(2,window.devicePixelRatio||1);
    cv.width=W*dpr; cv.height=H*dpr; cv.style.width=dW+'px'; cv.style.height=dH+'px';
    const cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0);
    const allP=[]; Object.keys(zoneData).forEach(z=>zoneData[z].mix.forEach(m=>allP.push(m.p)));
    mix.forEach(m=>{ if(!allP.includes(m.p)) allP.push(m.p); });
    ensureImgObjs(map=>{
      cx.setTransform(dpr,0,0,dpr,0,0);
      if(!sceneView){ paintWall(cx,W,H,map); return; }
      const TS=Math.round(Math.max(W,H)*0.9), sc=(mixView==='interior')?'interior':'exterior';
      const facadeTex=zoneTex(zoneKey(sc,'facade'),TS,map), floorTex=zoneTex(zoneKey(sc,'floor'),TS,map);
      const photo=(mixView==='interior')?SCENES.interior:SCENES[mixBuilding];
      const fMaker=(w,h,div)=>zoneTexFull(zoneKey(sc,'facade'),w,h,div,map);
      if(photo){ loadScene(photo,(img,mk)=>{ if(img) drawPhotoScene(cx,W,H,img,photo,fMaker,floorTex,mk);
        else if(mixView==='interior') drawInterior(cx,W,H,facadeTex,floorTex);
        else drawFacade(cx,W,H,facadeTex,floorTex); }); return; }
      if(mixView==='interior') drawInterior(cx,W,H,facadeTex,floorTex);
      else drawFacade(cx,W,H,facadeTex,floorTex);
    }, allP);
  }
  // render one surface's mix to an offscreen texture (temporarily swaps the active state)
  function zoneTex(name,size,map){
    const z=zoneData[name]; if(!z.mix.length) return null;
    const B=[mix,mixCat,mixShape,mixBond,mixBed,mixHead,mixJoint,mixOrder,mixLayout,mixSeq,wildOff];
    let tex=null;
    try{
      mix=z.mix;mixCat=z.cat;mixShape=z.shape;mixBond=z.bond;mixBed=z.bed;mixHead=z.head;mixJoint=z.joint;mixOrder=z.order;mixLayout=z.layout;mixSeq=z.seq;wildOff=z.wild;
      if(!mixLayout.length){ genLayout(); z.layout=mixLayout; z.seq=mixSeq; z.wild=wildOff; }
      tex=document.createElement('canvas'); tex.width=size; tex.height=size;
      texJointMul=0.55;                                // finer joints at scene scale
      paintWall(tex.getContext('2d'),size,size,map);
    } finally {
      texJointMul=1;
      [mix,mixCat,mixShape,mixBond,mixBed,mixHead,mixJoint,mixOrder,mixLayout,mixSeq,wildOff]=B;   // always restore active zone
    }
    return tex;
  }
  // full-size wall texture (no tiling → no visible repeat): div = brick-size divisor
  function zoneTexFull(name,w,h,div,map){
    const z=zoneData[name]; if(!z.mix.length) return null;
    const B=[mix,mixCat,mixShape,mixBond,mixBed,mixHead,mixJoint,mixOrder,mixLayout,mixSeq,wildOff];
    let tex=null;
    try{
      mix=z.mix;mixCat=z.cat;mixShape=z.shape;mixBond=z.bond;mixBed=z.bed;mixHead=z.head;mixJoint=z.joint;mixOrder=z.order;mixLayout=z.layout;mixSeq=z.seq;wildOff=z.wild;
      if(!mixLayout.length){ genLayout(); z.layout=mixLayout; z.seq=mixSeq; z.wild=wildOff; }
      tex=document.createElement('canvas'); tex.width=Math.max(2,Math.round(w)); tex.height=Math.max(2,Math.round(h));
      texJointMul=0.55; texDiv=div;
      paintWall(tex.getContext('2d'),tex.width,tex.height,map);
    } finally {
      texJointMul=1; texDiv=1;
      [mix,mixCat,mixShape,mixBond,mixBed,mixHead,mixJoint,mixOrder,mixLayout,mixSeq,wildOff]=B;
    }
    return tex;
  }
  function switchView(v){
    saveActive();
    if(v!=='wall') mixScene=(v==='interior')?'interior':'exterior';
    mixView=v;
    loadActive(zoneKey(sceneNow(),mixSurface));
    renderMixer();
  }
  function switchSurface(s){
    saveActive(); mixSurface=s;
    loadActive(zoneKey(sceneNow(),s));
    renderMixer();
  }
  function buildViewToggle(){
    const el=$('#mixView'); if(!el) return;
    const M=MIX();   // always visible → pick surface (Aussen/Innen · Fassade/Boden) before adding
    const views=[['wall',M.view_wall[lang]],['exterior',M.view_ext[lang]],['interior',M.view_int[lang]]];
    let html=`<div class="mixview__row">${views.map(o=>`<button class="mixview__b${o[0]===mixView?' is-active':''}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
    if(mixView==='exterior'||mixView==='interior'){
      const surfs=[['facade',M.surf_facade[lang]],['floor',M.surf_floor[lang]]];
      html+=`<div class="mixview__row mixview__row--sub">${surfs.map(o=>`<button class="mixview__b mixview__b--sm${o[0]===mixSurface?' is-active':''}" data-s="${o[0]}">${o[1]}</button>`).join('')}</div>`;
    }
    el.hidden=false; el.innerHTML=html;
    el.querySelectorAll('.mixview__b[data-v]').forEach(b=>b.onclick=()=>switchView(b.dataset.v));
    el.querySelectorAll('.mixview__b[data-s]').forEach(b=>b.onclick=()=>switchSurface(b.dataset.s));
  }
  function updatePcts(){ const total=mix.reduce((a,m)=>a+m.weight,0)||1;
    $$('#mixList .mixratio__pct').forEach(s=>{ s.textContent=Math.round(mix[+s.dataset.i].weight/total*100)+'%'; }); }
  function allZoneIds(){ saveActive(); const s=new Set(); Object.keys(zoneData).forEach(z=>zoneData[z].mix.forEach(m=>s.add(m.p.id))); return s; }
  function updateFab(){ const ids=allZoneIds(), n=ids.size, c=$('#mixCount'); c.textContent=n; c.hidden=n===0;
    $('#mixFabTxt').textContent=MIX().title[lang]; markMixedCards(ids); }
  function openMixer(){ $('#mixer').hidden=false; document.body.style.overflow='hidden'; if(window.__lenis) window.__lenis.stop(); renderMixer(); }
  function closeMixer(){ $('#mixer').hidden=true; document.body.style.overflow=''; if(window.__lenis) window.__lenis.start(); }
  function exportWall(){
    saveActive();
    const fam=mixShape||'brick';
    const scene=(mixView==='exterior'||mixView==='interior');
    if(!mix.length && !scene) return;
    const CW=1600, CH=scene?1120:((fam==='hex'||fam==='oct'||fam==='square')?1600:1150);
    const cv=document.createElement('canvas'); cv.width=CW; cv.height=CH;
    const cx=cv.getContext('2d');
    const allP=[]; Object.keys(zoneData).forEach(z=>zoneData[z].mix.forEach(m=>allP.push(m.p)));
    mix.forEach(m=>{ if(!allP.includes(m.p)) allP.push(m.p); });
    ensureImgObjs(map=>{
      const save=()=>cv.toBlob(bl=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(bl); a.download='klinkerbox-mischung.png'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); },'image/png');
      if(scene){ const TS=Math.round(Math.max(CW,CH)*0.9), sc=(mixView==='interior')?'interior':'exterior';
        const fT=zoneTex(zoneKey(sc,'facade'),TS,map), flT=zoneTex(zoneKey(sc,'floor'),TS,map);
        const photo=(mixView==='interior')?SCENES.interior:SCENES[mixBuilding];
        const fMk=(w,h,div)=>zoneTexFull(zoneKey(sc,'facade'),w,h,div,map);
        if(photo){ loadScene(photo,(img,mk)=>{ if(img) drawPhotoScene(cx,CW,CH,img,photo,fMk,flT,mk);
          else if(mixView==='interior') drawInterior(cx,CW,CH,fT,flT); else drawFacade(cx,CW,CH,fT,flT); save(); }); return; }
        if(mixView==='interior') drawInterior(cx,CW,CH,fT,flT); else drawFacade(cx,CW,CH,fT,flT);
      } else paintWall(cx,CW,CH,map);
      save(); });
  }
  const seg=(name,opts,cur)=>`<div class="mixseg" data-seg="${name}">${opts.map(o=>
    `<button class="mixseg__b${o[0]===cur?' is-active':''}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
  function renderMixer(){
    const M=MIX();
    $('#mixTitle').textContent=M.title[lang];
    $('#mixShuffle').textContent=M.shuffle[lang]; $('#mixClear').textContent=M.clear[lang];
    { const ex=$('#mixExport'); if(ex) ex.textContent=M.export[lang]; }
    const sceneView=(mixView==='exterior'||mixView==='interior');
    const surfName=sceneView? (M[mixView==='interior'?'view_int':'view_ext'][lang]+' · '+M[mixSurface==='facade'?'surf_facade':'surf_floor'][lang]) : '';
    $('#mixCatLabel').textContent=(sceneView?surfName+(mixCat?' · ':''):'')+(mixCat?catName(mixCat):(sceneView?'':M.hint[lang]));
    buildViewToggle();
    const prev=$('#mixPreview'), list=$('#mixList');
    const sugCards=sugs=>`<div class="mixsuggest__grid">${sugs.map((s,i)=>`
      <button class="mixsug" data-i="${i}">
        <span class="mixsug__row">${s.products.map(p=>`<span class="mixsug__dot" style="background:${p.hex}"></span>`).join('')}</span>
        <span class="mixsug__t">${s.title[lang]}</span>
        <span class="mixsug__c">${catName(s.cat)}</span>
      </button>`).join('')}</div>`;
    if(!mix.length){
      const sugs=sceneView?surfSuggestions():getSuggestions();
      if(sceneView){
        // keep the building/room visible; prompt to fill this surface from the side panel
        refreshWall();
        list.innerHTML=`<div class="mixgrp"><div class="mixgrp__h">${surfName} · ${M.surf_add[lang]}</div>${sugCards(sugs)}</div>`;
        list.querySelectorAll('.mixsug').forEach(b=>b.onclick=()=>loadSuggestion(sugs[+b.dataset.i]));
        return;
      }
      prev.innerHTML=`<div class="mixsuggest"><div class="mixsuggest__h">${M.suggest_title[lang]}</div>${sugCards(sugs)}<p class="mixsuggest__hint">${M.empty[lang]}</p></div>`;
      list.innerHTML='';
      prev.querySelectorAll('.mixsug').forEach(b=>b.onclick=()=>loadSuggestion(sugs[+b.dataset.i]));
      return;
    }
    refreshWall();
    const total=mix.reduce((a,m)=>a+m.weight,0)||1;
    const ratio=`<div class="mixgrp"><div class="mixgrp__h">${M.ratio[lang]}</div>${mix.map((m,i)=>`
      <div class="mixratio__row">
        <span class="mixchip__sw" style="background:${m.p.hex}"></span>
        <span class="mixratio__name">${m.p.series} · ${m.p.name}</span>
        <input type="range" class="mixratio__sl" min="1" max="12" value="${m.weight}" data-i="${i}" aria-label="${m.p.name}">
        <span class="mixratio__pct" data-i="${i}">${Math.round(m.weight/total*100)}%</span>
        <button class="mixchip__x" data-id="${m.p.id}" aria-label="remove">&times;</button>
      </div>`).join('')}</div>`;
    const order=`<div class="mixgrp"><div class="mixgrp__h">${M.order[lang]}</div>
      <div class="mixorder"><span>${M.o_rnd[lang]}</span>
        <input type="range" id="mixOrderSl" min="0" max="100" value="${Math.round(mixOrder*100)}">
        <span>${M.o_ord[lang]}</span></div></div>`;
    const bondApplies=RECT_FAM(mixShape||'brick') && (mixShape||'brick')!=='square';
    // paving patterns for Pflasterklinker · wall bonds for Mauerklinker
    const bondOpts=mixCat==='pflaster'
      ? [['run',M.b_run[lang]],['herring',M.b_herring[lang]],['basket',M.b_basket[lang]],['wild',M.b_wild[lang]]]
      : [['run',M.b_run[lang]],['cross',M.b_cross[lang]],['stack',M.b_stack[lang]],['wild',M.b_wild[lang]]];
    if(!bondOpts.some(o=>o[0]===mixBond)) mixBond='run';   // coerce to a valid option for this category
    const bond=bondApplies
      ? `<div class="mixgrp"><div class="mixgrp__h">${M.verband[lang]}</div>${seg('bond',bondOpts,mixBond)}</div>`
      : '';
    const joints=`<div class="mixgrp"><div class="mixgrp__h">${M.bed[lang]} · ${M.head[lang]}</div>
      <div class="mixjoint"><span>${M.bed[lang]}</span>${seg('bed',[['glue',M.j_glue[lang]],['narrow',M.j_narrow[lang]],['normal',M.j_normal[lang]]],mixBed)}</div>
      <div class="mixjoint"><span>${M.head[lang]}</span>${seg('head',[['glue',M.j_glue[lang]],['narrow',M.j_narrow[lang]],['normal',M.j_normal[lang]]],mixHead)}</div></div>`;
    const jcol=`<div class="mixgrp"><div class="mixgrp__h">${M.jcolor[lang]}</div>
      <div class="mixmortars">${MORTARS.map(c=>`<button class="mixmortar${c[1]===mixJoint?' is-active':''}" style="background:${c[1]}" data-hex="${c[1]}" title="${c[0]}"></button>`).join('')}</div></div>`;
    // building type — only relevant in the exterior view
    const bld=(mixView==='exterior')
      ? `<div class="mixgrp"><div class="mixgrp__h">${M.building[lang]}</div>${seg('bld',[['efh',M.b_efh[lang]],['villa',M.b_villa[lang]],['bungalow',M.b_bungalow[lang]],['office',M.b_office[lang]],['friesen',M.b_friesen[lang]]],mixBuilding)}</div>`
      : '';
    list.innerHTML=bld+ratio+order+bond+joints+jcol;
    // handlers
    list.querySelectorAll('.mixratio__sl').forEach(sl=>sl.oninput=()=>{ mix[+sl.dataset.i].weight=+sl.value; genLayout(); updatePcts(); refreshWall(); });
    list.querySelectorAll('.mixchip__x').forEach(b=>b.onclick=()=>{ const p=P.find(x=>x.id===b.dataset.id); if(p) removeFromMixer(p); });
    $('#mixOrderSl').oninput=e=>{ mixOrder=+e.target.value/100; refreshWall(); };
    list.querySelectorAll('.mixseg').forEach(s=>s.querySelectorAll('.mixseg__b').forEach(b=>b.onclick=()=>{
      const v=b.dataset.v, name=s.dataset.seg;
      if(name==='bond') mixBond=v; else if(name==='bed') mixBed=v; else if(name==='head') mixHead=v; else if(name==='bld') mixBuilding=v;
      s.querySelectorAll('.mixseg__b').forEach(x=>x.classList.remove('is-active')); b.classList.add('is-active'); refreshWall();
    }));
    list.querySelectorAll('.mixmortar').forEach(b=>b.onclick=()=>{ mixJoint=b.dataset.hex;
      list.querySelectorAll('.mixmortar').forEach(x=>x.classList.remove('is-active')); b.classList.add('is-active'); refreshWall(); });
  }
  // form per stone — pre-fill the contact form with the selected product
  function requestSample(p){
    closeLightbox();
    const f=$('#contactForm'); if(!f) return;
    const prod=`${p.series} — ${p.name}`;
    const pf=f.elements.produkt; if(pf){ pf.value=prod; }
    const muster=$$('#interestChecks input').find(c=>c.value==='Muster'); if(muster) muster.checked=true;
    scrollToEl($('#kontakt'));
    const field=$('#produktField');
    if(field){ field.classList.remove('flash'); void field.offsetWidth; field.classList.add('flash'); }
    setTimeout(()=>{ if(pf) pf.focus({preventScroll:true}); }, 600);
  }

  // ===================== VIDEOS (lite YouTube embed) =====================
  let vidObs=null;
  function buildVideos(){
    const wrap=$('#videos'); if(!wrap) return; wrap.innerHTML='';
    if(vidObs) vidObs.disconnect();
    vidObs=new IntersectionObserver((es)=>{
      es.forEach(e=>{
        const card=e.target, v=card.__v;
        if(e.isIntersecting && !card.classList.contains('is-playing')){
          card.insertAdjacentHTML('afterbegin',
            `<iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&mute=1&loop=1&playlist=${v.id}&controls=1&rel=0&modestbranding=1&playsinline=1" title="${v.title}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`);
          card.classList.add('is-playing');
        }
      });
    },{threshold:.4});
    VIDEOS.forEach(v=>{
      const card=document.createElement('div'); card.className='vcard'; card.__v=v;
      card.innerHTML=`<img class="vcard__poster" loading="lazy" referrerpolicy="no-referrer" src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="${v.title}"><span class="vcard__title">${v.title}</span>`;
      wrap.appendChild(card); vidObs.observe(card);
    });
  }

  // ===================== REFERENZEN GALLERY =====================
  function buildRefs(){
    const wrap=$('#refsGrid');
    wrap.classList.add('refs__marquee');
    const track=document.createElement('div'); track.className='refs__track';
    // duplicate the set once for a seamless infinite loop
    REFS.concat(REFS).forEach((r,i)=>{
      const fig=document.createElement('figure'); fig.className='reffig';
      fig.innerHTML=`<img loading="lazy" decoding="async" src="${r.src}" alt="">`;
      fig.onclick=()=>openRefGallery(i % REFS.length);
      track.appendChild(fig);
    });
    wrap.appendChild(track);
    // pause the marquee while it's off-screen so it never competes with scrolling
    new IntersectionObserver(es=>es.forEach(e=>track.classList.toggle('paused', !e.isIntersecting)))
      .observe($('#referenzen'));
  }
  function openRefGallery(i){
    lbGallery=REFS.map(r=>r.src); lbIndex=i;
    $('#lbInner').innerHTML=`<div class="lb__solowrap">
        <span class="lb__count lb__count--solo" id="lbCount">${i+1} / ${lbGallery.length}</span>
        <button class="lb__nav lb__nav--prev" id="lbPrev" aria-label="‹">‹</button>
        <button class="lb__nav lb__nav--next" id="lbNext" aria-label="›">›</button>
        <img class="lb__solo" id="lbMain" src="${lbGallery[i]}" alt=""></div>`;
    $('#lbPrev').onclick=e=>{e.stopPropagation();showLb(lbIndex-1);};
    $('#lbNext').onclick=e=>{e.stopPropagation();showLb(lbIndex+1);};
    attachSwipe($('.lb__solowrap'), ()=>showLb(lbIndex-1), ()=>showLb(lbIndex+1));
    openModal();
  }

  // ===================== FORMS (static → mailto) =====================
  function bindForms(){
    const cf=$('#contactForm');
    if(cf) cf.onsubmit=e=>{
      e.preventDefault();
      const f=cf.elements;
      if(f.website.value){ return; } // honeypot
      if(!f.name.value.trim()||!f.email.value.trim()||!f.message.value.trim()){
        showHint($('#formHint'), I[lang].f_req, false); return;
      }
      const interests=$$('#interestChecks input:checked').map(c=>c.value).join(', ');
      const d=I[lang];
      const body=[
        `${d.f_name}: ${f.name.value}`,
        `${d.f_company}: ${f.company.value}`,
        `${d.f_phone}: ${f.phone.value}`,
        `${d.f_email}: ${f.email.value}`,
        `${d.f_projaddr}: ${f.projaddr.value}`,
        `${d.f_interest}: ${interests}`,
        '',`${d.f_message}:`, f.message.value
      ].join('\n');
      window.location.href=`mailto:info@klinkerbox.ch?subject=${encodeURIComponent('Anfrage Klinkerbox — '+f.name.value)}&body=${encodeURIComponent(body)}`;
      showHint($('#formHint'), I[lang].nl_done, true);
    };
    const nf=$('#newsForm');
    if(nf) nf.onsubmit=e=>{
      e.preventDefault();
      const f=nf.elements; if(!f.email.value.trim()) return;
      const body=`${I[lang].nl_first}: ${f.first.value}\n${I[lang].nl_last}: ${f.last.value}\n${I[lang].nl_email}: ${f.email.value}`;
      window.location.href=`mailto:info@klinkerbox.ch?subject=${encodeURIComponent('Newsletter-Anmeldung')}&body=${encodeURIComponent(body)}`;
      nf.reset();
    };
  }
  function showHint(el,msg,ok){ if(!el) return; el.hidden=false; el.textContent=msg; el.className='cform__hint '+(ok?'is-ok':'is-err'); }

  // ===================== REVEAL OBSERVER =====================
  const revObs=new IntersectionObserver((es)=>{
    es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); revObs.unobserve(e.target); } });
  },{threshold:.12});
  $$('.reveal').forEach(el=>revObs.observe(el));

  // ===================== NAV / EVENTS =====================
  function bind(){
    $$('#catTabs .tab').forEach(t=>t.onclick=()=>{
      $$('#catTabs .tab').forEach(x=>x.classList.remove('is-active')); t.classList.add('is-active');
      state.cat=t.dataset.cat; state.sub=null; state.stil=null;
      buildSubChips(); buildStilChips(); buildTypChips(); buildColorDots(); buildSizeSelect(); render();
      scrollToEl($('#katalog'));
    });
    $$('[data-cat]').forEach(el=>{ if(el.closest('#catTabs')) return;
      el.addEventListener('click',()=>{ const c=el.dataset.cat; if(!c) return;
        const tab=document.querySelector(`#catTabs .tab[data-cat="${c}"]`); if(tab) tab.click(); });
    });
    [['#pflaster','pflaster'],['#mauer','mauer'],['#tonplatten','tonplatten']].forEach(([href,cat])=>{
      $$(`.nav__links a[href="${href}"]`).forEach(a=>a.addEventListener('click',()=>{
        const tab=document.querySelector(`#catTabs .tab[data-cat="${cat}"]`);
        if(tab){ $$('#catTabs .tab').forEach(x=>x.classList.remove('is-active')); tab.classList.add('is-active');
          state.cat=cat; state.sub=null; state.stil=null; state.typ=null; buildSubChips(); buildStilChips(); buildTypChips(); buildColorDots(); buildSizeSelect(); render(); }
        $('#navLinks').classList.remove('open');
      }));
    });
    $$('.nav__links a').forEach(a=>a.addEventListener('click',()=>$('#navLinks').classList.remove('open')));
    $('#search').oninput=e=>{ state.q=e.target.value; render(); };
    $('#resetBtn').onclick=()=>{ state.sub=null; state.stil=null; state.color=null; state.size='all'; state.q='';
      $('#search').value=''; state.typ=null; $('#sizeSelect').value='all'; buildSubChips(); buildStilChips(); buildTypChips(); buildColorDots(); buildSizeSelect(); render(); };
    $('#langBtn').onclick=e=>{ e.stopPropagation(); $('#lang').classList.toggle('open'); };
    $$('#langMenu button').forEach(b=>b.onclick=()=>{ lang=b.dataset.lang; localStorage.setItem('kb_lang',lang);
      $('#lang').classList.remove('open'); applyLang(); buildColorDots(); });
    document.addEventListener('click',()=>$('#lang').classList.remove('open'));
    $('#burger').onclick=()=>$('#navLinks').classList.toggle('open');
    $('#lbClose').onclick=closeLightbox;
    $('#lightbox').onclick=e=>{ if(e.target.id==='lightbox') closeLightbox(); };
    $('#loadMore').onclick=loadMore;
    $('#mixFab').onclick=openMixer; $('#mixClose').onclick=closeMixer;
    $('#mixer').onclick=e=>{ if(e.target.id==='mixer') closeMixer(); };
    $('#mixClear').onclick=clearMixer; $('#mixShuffle').onclick=()=>{ genLayout(); renderMixer(); };
    $('#mixExport').onclick=exportWall;
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && !$('#mixer').hidden){ closeMixer(); return; }
      if($('#lightbox').hidden) return;
      if(e.key==='Escape') closeLightbox();
      else if(e.key==='ArrowLeft' && lbGallery.length>1) showLb(lbIndex-1);
      else if(e.key==='ArrowRight' && lbGallery.length>1) showLb(lbIndex+1);
    });
    let rsT; window.addEventListener('resize',()=>{ if($('#mixer').hidden) return;
      clearTimeout(rsT); rsT=setTimeout(refreshWall,120); });   // re-render preview on window resize
    const nav=$('#nav'); const onScroll=()=>nav.classList.toggle('scrolled', window.scrollY>20);
    window.addEventListener('scroll',onScroll,{passive:true}); onScroll();
    $('#year').textContent=new Date().getFullYear();
  }

  // ===================== SMOOTH SCROLL (Lenis) =====================
  function smoothScroll(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if(typeof window.Lenis==='undefined') return;          // graceful fallback to native scroll
    const lenis=new window.Lenis({
      duration:1.05,                                       // normal tempo, smooth glide
      easing:t=>Math.min(1,1.001-Math.pow(2,-10*t)),        // ease-out expo
      smoothWheel:true, wheelMultiplier:1, touchMultiplier:1.6, lerp:null
    });
    window.__lenis=lenis;
    (function raf(t){ lenis.raf(t); requestAnimationFrame(raf); })(0);
  }

  // ===================== IMAGE PROTECTION =====================
  function protectImages(){
    const sel='img,.card__img,.reffig,.lb__media,.lb__img,.lb__solo,.mixwall,.mixbrick,.vcard,.cat__media,.hero__media';
    document.addEventListener('contextmenu',e=>{ if(e.target.closest(sel)) e.preventDefault(); });
    document.addEventListener('dragstart',e=>{ if(e.target.tagName==='IMG'||e.target.closest(sel)) e.preventDefault(); });
    // strip native save/drag affordances as images are added
    const harden=()=>$$('img').forEach(im=>{ im.setAttribute('draggable','false'); im.oncontextmenu=()=>false; });
    harden(); new MutationObserver(harden).observe(document.body,{childList:true,subtree:true});
  }

  // ===================== INIT =====================
  buildColorDots(); buildRefs(); bindForms(); bind(); applyLang(); smoothScroll(); protectImages();
  // clean the HAND-MADE stamp from the affected images, then refresh what's on screen
  P.filter(p=>STAMPED.has(p.id)).forEach(p=>cleanStamp(p,()=>{ if(!$('#grid')) return;
    $$('#grid .card').forEach(c=>{ const img=c.querySelector('img'); if(img && img.alt===p.series+' '+p.name) img.src=imgSrc(p); }); }));
})();
