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
  let activeZone='exterior_facade', mixScene='exterior', mixSurface='facade';
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
  function paintWall(cx,W,H,map){
    cx.clearRect(0,0,W,H); cx.fillStyle=mixJoint; cx.fillRect(0,0,W,H);
    const fam=mixShape||'brick', sc=W/560;
    const bed=Math.max(1,JW[mixBed]*sc), head=Math.max(1,JW[mixHead]*sc);
    if(fam==='hex') return paintHex(cx,W,H,map,bed);
    if(fam==='oct') return paintOct(cx,W,H,map,Math.max(3*sc,bed));
    if(fam==='square') return paintSquare(cx,W,H,map,Math.max(bed,head));
    if(mixBond==='herring') return paintHerring(cx,W,H,map,head);
    if(mixBond==='basket') return paintBasket(cx,W,H,map,head);
    return paintCourses(cx,W,H,map,fam,bed,head);
  }
  function paintCourses(cx,W,H,map,fam,bed,head){
    const bw=W*(FAM_BW[fam]||15.6)/100, bh=bw/(FAM_AR[fam]||3.4);
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
  function brickPattern(cx,tex,scale){
    const pat=cx.createPattern(tex,'repeat');
    if(pat && pat.setTransform){ try{ pat.setTransform(new DOMMatrix([scale,0,0,scale,0,0])); }catch(e){} }
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
    // sky + ground
    let g=cx.createLinearGradient(0,0,0,H*0.75); g.addColorStop(0,'#bcdcef'); g.addColorStop(1,'#e9f2f6'); cx.fillStyle=g; cx.fillRect(0,0,W,H);
    const groundY=H*0.74; g=cx.createLinearGradient(0,groundY,0,H); g.addColorStop(0,'#aebd86'); g.addColorStop(1,'#93a56c'); cx.fillStyle=g; cx.fillRect(0,groundY,W,H-groundY);
    const midX=W/2, hw=W*0.60, hx0=midX-hw/2, hx1=midX+hw/2, eaveY=H*0.36, wallBot=groundY, apexY=H*0.14;
    const tw=(fTex||pTex||{width:400}).width, fS=Math.min(W,H)/((fTex||{width:tw}).width)*0.62, pS=Math.min(W,H)/((pTex||{width:tw}).width)*0.72;
    // paved path (foreground) — perspective trapezoid, paving mix (or neutral)
    cx.save(); poly(cx,[[midX-W*0.09,wallBot],[midX+W*0.09,wallBot],[midX+W*0.28,H],[midX-W*0.28,H]]); cx.clip();
    cx.fillStyle=surfFill(cx,pTex,pS,'#c9c3b7'); cx.fillRect(0,groundY,W,H-groundY);
    shade(cx,0,groundY,W,H-groundY,'rgba(0,0,0,0)','rgba(0,0,0,.28)'); cx.restore();
    // roof (dark) — overhang triangle behind gable
    cx.save(); poly(cx,[[hx0-W*0.05,eaveY+H*0.012],[hx1+W*0.05,eaveY+H*0.012],[midX,apexY-H*0.02]]);
    g=cx.createLinearGradient(0,apexY,0,eaveY); g.addColorStop(0,'#4a4d51'); g.addColorStop(1,'#303234'); cx.fillStyle=g; cx.fill(); cx.restore();
    // gable (brick triangle)
    cx.save(); poly(cx,[[hx0,eaveY],[hx1,eaveY],[midX,apexY]]); cx.clip();
    cx.fillStyle=surfFill(cx,fTex,fS,'#cfc8ba'); cx.fillRect(hx0,apexY,hw,eaveY-apexY);
    shade(cx,hx0,apexY,hw,eaveY-apexY,'rgba(255,255,255,.05)','rgba(0,0,0,.14)'); cx.restore();
    // facade (brick rectangle)
    cx.save(); cx.beginPath(); cx.rect(hx0,eaveY,hw,wallBot-eaveY); cx.clip();
    cx.fillStyle=surfFill(cx,fTex,fS,'#cfc8ba'); cx.fillRect(hx0,eaveY,hw,wallBot-eaveY);
    // soft ambient occlusion
    const ao=cx.createLinearGradient(hx0,0,hx1,0); ao.addColorStop(0,'rgba(0,0,0,.16)'); ao.addColorStop(.5,'rgba(0,0,0,0)'); ao.addColorStop(1,'rgba(0,0,0,.16)'); cx.fillStyle=ao; cx.fillRect(hx0,eaveY,hw,wallBot-eaveY);
    shade(cx,hx0,eaveY,hw,wallBot-eaveY,'rgba(255,255,255,.06)','rgba(0,0,0,.12)'); cx.restore();
    // eave fascia + ridge line
    cx.fillStyle='#2c2e30'; cx.fillRect(hx0-W*0.02,eaveY-H*0.014,hw+W*0.04,H*0.02);
    // windows + door
    const ww=hw*0.19, wh=(wallBot-eaveY)*0.26, uY=eaveY+(wallBot-eaveY)*0.12, lY=eaveY+(wallBot-eaveY)*0.52;
    window2(cx,hx0+hw*0.13,uY,ww,wh); window2(cx,hx1-hw*0.13-ww,uY,ww,wh);
    window2(cx,hx0+hw*0.13,lY,ww,wh);
    // door
    const dw=hw*0.2, dh=(wallBot-eaveY)*0.42, dx=hx1-hw*0.13-dw, dy=wallBot-dh;
    cx.fillStyle='#efe9df'; cx.fillRect(dx-dw*0.08,dy-dh*0.03,dw*1.16,dh*1.03);
    g=cx.createLinearGradient(dx,dy,dx+dw,dy); g.addColorStop(0,'#2f3d3a'); g.addColorStop(1,'#243230'); cx.fillStyle=g; cx.fillRect(dx,dy,dw,dh);
    cx.fillStyle='rgba(255,255,255,.7)'; cx.fillRect(dx+dw*0.72,dy+dh*0.45,dw*0.05,dh*0.12);
    // gable vent
    window2(cx,midX-ww*0.4,apexY+(eaveY-apexY)*0.4,ww*0.8,wh*0.5);
    // house drop shadow
    cx.fillStyle='rgba(0,0,0,.14)'; cx.beginPath(); cx.ellipse(midX,wallBot+H*0.01,hw*0.62,H*0.02,0,0,7); cx.fill();
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
  function refreshWall(){
    const host=$('#mixPreview'); if(!host) return;
    const sceneView=(mixView==='exterior'||mixView==='interior');
    if(!mix.length && !sceneView){ host.innerHTML=''; return; }
    saveActive();
    if(!sceneView && !mixLayout.length) genLayout();
    let cv=host.querySelector('canvas.mixcanvas');
    if(!cv){ host.innerHTML=''; cv=document.createElement('canvas'); cv.className='mixcanvas'; host.appendChild(cv); }
    const W=Math.max(220,host.clientWidth||host.getBoundingClientRect().width|0);
    const H=Math.max(220,host.clientHeight||host.getBoundingClientRect().height|0);
    const dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=W*dpr; cv.height=H*dpr; cv.style.width=W+'px'; cv.style.height=H+'px';
    const cx=cv.getContext('2d'); cx.setTransform(dpr,0,0,dpr,0,0);
    const allP=[]; Object.keys(zoneData).forEach(z=>zoneData[z].mix.forEach(m=>allP.push(m.p)));
    mix.forEach(m=>{ if(!allP.includes(m.p)) allP.push(m.p); });
    ensureImgObjs(map=>{
      cx.setTransform(dpr,0,0,dpr,0,0);
      if(!sceneView){ paintWall(cx,W,H,map); return; }
      const TS=Math.round(Math.max(W,H)*0.9), sc=(mixView==='interior')?'interior':'exterior';
      const facadeTex=zoneTex(zoneKey(sc,'facade'),TS,map), floorTex=zoneTex(zoneKey(sc,'floor'),TS,map);
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
      paintWall(tex.getContext('2d'),size,size,map);
    } finally {
      [mix,mixCat,mixShape,mixBond,mixBed,mixHead,mixJoint,mixOrder,mixLayout,mixSeq,wildOff]=B;   // always restore active zone
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
    const anyMix=Object.keys(zoneData).some(z=>zoneData[z].mix.length)||mix.length;
    if(!anyMix){ el.hidden=true; el.innerHTML=''; return; }
    const M=MIX();
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
      if(scene){ const TS=Math.round(Math.max(CW,CH)*0.9), sc=(mixView==='interior')?'interior':'exterior';
        const fT=zoneTex(zoneKey(sc,'facade'),TS,map), flT=zoneTex(zoneKey(sc,'floor'),TS,map);
        if(mixView==='interior') drawInterior(cx,CW,CH,fT,flT); else drawFacade(cx,CW,CH,fT,flT);
      } else paintWall(cx,CW,CH,map);
      cv.toBlob(bl=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(bl); a.download='klinkerbox-mischung.png'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); },'image/png'); });
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
    list.innerHTML=ratio+order+bond+joints+jcol;
    // handlers
    list.querySelectorAll('.mixratio__sl').forEach(sl=>sl.oninput=()=>{ mix[+sl.dataset.i].weight=+sl.value; genLayout(); updatePcts(); refreshWall(); });
    list.querySelectorAll('.mixchip__x').forEach(b=>b.onclick=()=>{ const p=P.find(x=>x.id===b.dataset.id); if(p) removeFromMixer(p); });
    $('#mixOrderSl').oninput=e=>{ mixOrder=+e.target.value/100; refreshWall(); };
    list.querySelectorAll('.mixseg').forEach(s=>s.querySelectorAll('.mixseg__b').forEach(b=>b.onclick=()=>{
      const v=b.dataset.v, name=s.dataset.seg;
      if(name==='bond') mixBond=v; else if(name==='bed') mixBed=v; else if(name==='head') mixHead=v;
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
