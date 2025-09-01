<script>
/*! Gaga Main v1 — SPA-feel Blogger (pushState, JSONP feed, label 2-level, pages, prefetch, focus-trap, smart-scroll) */
(() => {
  'use strict';

  /* ========= Config ========= */
  const BLOG = (window.GAGA_CONFIG && window.GAGA_CONFIG.blogBase) || document.body.getAttribute('data-blog') || location.origin;
  const POP  = +(document.body.dataset.popcount || 4);
  const FEAT = +(document.body.dataset.featcount || 2);
  const FEED_POSTS = '/feeds/posts/summary';
  const FEED_PAGES = '/feeds/pages/summary';
  history.scrollRestoration = 'manual';

  /* ========= Helpers ========= */
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const on = (el,ev,fn,opt)=> el && el.addEventListener(ev,fn,opt);
  const esc= s=>(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const safeURL = u => (u||'').replace(/javascript:/gi,'').trim();
  const sleep = ms => new Promise(r=>setTimeout(r,ms));

  /* ========= URL tools ========= */
  function normalizeLink(href){
    try{ const u = new URL(href, BLOG);
      return u.origin===location.origin ? (u.pathname + u.search + u.hash) : u.href;
    }catch{ return href; }
  }
  function isPermalinkURL(href){
    try{
      const u = new URL(href, BLOG);
      const p = u.pathname;
      if (/^\/\d{4}\/\d{2}\/.+\.html$/i.test(p)) return {type:'post', href:u.pathname+u.search};
      if (/^\/p\/.+\.html$/i.test(p))         return {type:'page', href:u.pathname+u.search};
      if (/^\/search\/label\/.+/i.test(p))    return {type:'label',href:u.pathname+u.search};
      if (p==='/' || p==='/index.html')       return {type:'home', href:'/'};
      return null;
    }catch{ return null; }
  }

  /* ========= Sanitizer ========= */
  function extractContentHTML(raw){
    const doc = new DOMParser().parseFromString(`<div>${raw||''}</div>`,'text/html');
    const allowed = new Set(['A','P','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','UL','OL','LI','STRONG','EM','CODE','PRE','IMG','FIGURE','FIGCAPTION','TABLE','THEAD','TBODY','TR','TH','TD','HR','BR','SPAN','DIV','IFRAME','VIDEO','SOURCE']);
    doc.querySelectorAll('script,style,noscript,link,meta').forEach(n=>n.remove());
    doc.querySelectorAll('*').forEach(el=>{
      if (!allowed.has(el.tagName)){ el.replaceWith(...el.childNodes); return; }
      [...el.attributes].forEach(a=>{
        const n=a.name.toLowerCase(), v=a.value;
        if (n.startsWith('on')) el.removeAttribute(a.name);
        if ((n==='href'||n==='src') && /^javascript:/i.test(v)) el.removeAttribute(a.name);
      });
      if (el.tagName==='IMG'){
        el.loading='lazy'; el.decoding='async';
        if (!el.closest('.ar')){ const w=doc.createElement('div'); w.className='ar ar-16-9'; el.replaceWith(w); w.append(el); }
      }
      if (el.tagName==='IFRAME' || el.tagName==='VIDEO'){
        if (!el.closest('.ar')){ const w=doc.createElement('div'); w.className='ar ar-16-9'; el.replaceWith(w); w.append(el); }
        if (el.tagName==='VIDEO'){ el.playsInline = true; el.setAttribute('controls',''); }
      }
    });
    return doc.body.firstElementChild.innerHTML;
  }

  /* ========= Feed (JSON & JSONP) ========= */
  const mem = new Map(); const TTL = 3*60*1000; // 3 menit
  function cget(k){ const it=mem.get(k); return it && (Date.now()-it.t<TTL) ? it.v : null; }
  function cset(k,v){ mem.set(k,{t:Date.now(),v}); }

  async function fetchJSON(u){ const r=await fetch(u); return r.json(); }
  function fetchJSONP(u, cb='callback'){
    return new Promise((res,rej)=>{
      const id='cb'+Math.random().toString(36).slice(2);
      const s=document.createElement('script');
      const sep = u.includes('?')?'&':'?';
      window[id]=d=>{ res(d); cleanup(); };
      s.src = `${u}${sep}${cb}=${id}`; s.onerror=e=>{ rej(e); cleanup(); };
      document.head.appendChild(s);
      function cleanup(){ delete window[id]; s.remove(); }
    });
  }
  function mapEntry(e){
    const permalink = e.link?.find(l=>l.rel==='alternate')?.href || '';
    const summary = (e.summary?.$t||'').replace(/<[^>]+>/g,'').trim();
    let thumb = e.media$thumbnail?.url || '';
    if (!thumb){ const html=e.content?.$t||e.summary?.$t||''; const m=html.match(/<img[^>]+src=["']([^"']+)["']/i); thumb = m?m[1]:''; }
    return {
      id: e.id?.$t || permalink,
      title: e.title?.$t || '',
      permalink, summary, thumb,
      labels: (e.category||[]).map(c=>c.term).filter(Boolean),
      author: e.author?.[0]?.name?.$t || '',
      published: e.published?.$t || '', updated: e.updated?.$t || '',
      content: e.content?.$t || ''
    };
  }
  async function getFeed(opt={}){
    const u = new URL(FEED_POSTS, BLOG);
    u.searchParams.set('alt','json');
    u.searchParams.set('max-results', opt.maxResults || 10);
    if (opt.startIndex) u.searchParams.set('start-index', opt.startIndex);
    if (opt.label) u.searchParams.set('category', opt.label);
    const key=u.href; let data=cget(key);
    if (!data){ try{ data=await fetchJSON(u.href); } catch{ data=await fetchJSONP(u.href); } cset(key,data); }
    const entries = (data?.feed?.entry||[]).map(mapEntry);
    const total = +(data?.feed?.openSearch$totalResults?.$t || entries.length);
    return { entries, total };
  }
  async function getPages(){
    const u = new URL(FEED_PAGES, BLOG); u.searchParams.set('alt','json'); u.searchParams.set('max-results','50');
    const key=u.href; let data=cget(key);
    if (!data){ try{ data=await fetchJSON(u.href); } catch{ data=await fetchJSONP(u.href); } cset(key,data); }
    const entries = (data?.feed?.entry||[]).map(mapEntry);
    return entries;
  }
  async function getPostByPermalink(href){
    const { entries } = await getFeed({ maxResults: 50 });
    return entries.find(p=>p.permalink.includes(href)) || null;
  }

  /* ========= DOM Shortcuts ========= */
  const room = () => $('#roomchat');
  const center = () => $('#centerbar');
  function bubble(html, type='system'){ const d=document.createElement('div'); d.className='bubble'; d.dataset.role=type; d.innerHTML=html; room().append(d); }
  function postcard(p){
    const el=document.createElement('article');
    el.className='postcard'; el.dataset.permalink=p.permalink;
    el.innerHTML = `
      <div class="thumb ar ar-4-3">${p.thumb?`<img src="${safeURL(p.thumb)}" alt="" loading="lazy" decoding="async">`:''}</div>
      <div class="body">
        <h3 class="title"><a href="${p.permalink}" data-act="open" aria-label="Baca: ${esc(p.title)}">${esc(p.title)}</a></h3>
        <p class="excerpt">${esc(p.summary||'')}</p>
        <div class="meta">
          <span class="m"><svg width="16" height="16" aria-hidden="true"><use href="#i-user"/></svg>${esc(p.author||'')}</span>
          <span class="m"><svg width="16" height="16" aria-hidden="true"><use href="#i-calendar"/></svg>${new Date(p.published||Date.now()).toLocaleDateString()}</span>
          <div class="actions">
            <button class="iconbtn" data-act="open" aria-label="Baca"><svg width="18" height="18" aria-hidden="true"><use href="#i-open"/></svg><span>Baca</span></button>
            <button class="iconbtn" data-act="copy" data-href="${p.permalink}" aria-label="Salin tautan"><svg width="18" height="18" aria-hidden="true"><use href="#i-copy"/></svg><span>Salin</span></button>
          </div>
        </div>
      </div>`;
    room().append(el);
  }
  function reader(p, similar=[]){
    const el=document.createElement('article'); el.className='readercard';
    const content = extractContentHTML(p.content || p.summary || '');
    el.innerHTML = `
      <header class="reader-head">
        <h2>${esc(p.title)}</h2>
        <div class="reader-meta">
          <span><svg width="18" height="18" aria-hidden="true"><use href="#i-user"/></svg>${esc(p.author||'')}</span>
          <span><svg width="18" height="18" aria-hidden="true"><use href="#i-calendar"/></svg>${new Date(p.published||Date.now()).toLocaleDateString()}</span>
        </div>
      </header>
      <div class="reader-body">${content}</div>
      <div class="reader-actions">
        <button class="iconbtn" data-act="copy" data-href="${p.permalink}" aria-label="Salin tautan"><svg width="18" height="18" aria-hidden="true"><use href="#i-copy"/></svg><span>Salin</span></button>
        <button class="iconbtn" data-act="comment" data-href="${p.permalink}" aria-label="Buka komentar"><svg width="18" height="18" aria-hidden="true"><use href="#i-comment"/></svg><span>Komentar</span></button>
        <button class="iconbtn" data-act="properties" aria-label="Properti"><svg width="18" height="18" aria-hidden="true"><use href="#i-info"/></svg><span>Properti</span></button>
      </div>
      ${similar.length?`
      <div class="feed" aria-label="Similar Posts">
        ${similar.map(s=>`
          <article class="postcard">
            <div class="thumb ar ar-4-3">${s.thumb?`<img src="${safeURL(s.thumb)}" alt="" loading="lazy" decoding="async">`:''}</div>
            <div class="body">
              <h3 class="title"><a href="${s.permalink}" data-act="open" aria-label="Baca: ${esc(s.title)}">${esc(s.title)}</a></h3>
              <div class="actions"><button class="iconbtn" data-act="open"><svg width="18" height="18" aria-hidden="true"><use href="#i-open"/></svg><span>Baca</span></button></div>
            </div>
          </article>`).join('')}
      </div>`:''}`;
    room().append(el);
    el.scrollIntoView({behavior:'smooth', block:'start'});
  }

  /* ========= Sidebar: Left/Right + overlay (push/overlay) ========= */
  const elLeft  = () => $('#sidebarLeft');
  const elRight = () => $('#sidebarRight');
  const overlay = () => $('#overlay');
  function isDesktop(){ return matchMedia('(min-width:1025px)').matches; }
  function applyPush(){
    if (isDesktop()){
      document.documentElement.style.setProperty('--sb-left',  elLeft()?.hasAttribute('hidden') ? '0px' : 'var(--w-left)');
      document.documentElement.style.setProperty('--sb-right', elRight()?.hasAttribute('hidden')? '0px' : 'var(--w-right)');
    } else {
      document.documentElement.style.setProperty('--sb-left','0px');
      document.documentElement.style.setProperty('--sb-right','0px');
    }
  }
  function showOverlay(on){ const ov=overlay(); if(!ov) return; on ? ov.removeAttribute('hidden') : ov.setAttribute('hidden','hidden'); }
  function openLeft(){ elLeft()?.removeAttribute('hidden'); elLeft()?.setAttribute('aria-hidden','false'); elLeft()?.classList.add('is-open'); showOverlay(true); trapFocus(elLeft()); applyPush(); }
  function openRight(){ elRight()?.removeAttribute('hidden'); elRight()?.setAttribute('aria-hidden','false'); elRight()?.classList.add('is-open'); showOverlay(true); trapFocus(elRight()); applyPush(); }
  function closePanels(){ [elLeft(), elRight()].forEach(n=>{ if(!n) return; n.classList.remove('is-open'); n.setAttribute('hidden','hidden'); n.setAttribute('aria-hidden','true'); }); showOverlay(false); releaseTrap(); applyPush(); }

  /* ========= Focus trap ========= */
  let trapHandler=null, lastFocus=null;
  function trapFocus(root){
    lastFocus = document.activeElement;
    const f = root.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    const first=f[0], last=f[f.length-1];
    trapHandler = (e)=>{
      if(e.key==='Escape'){ closePanels(); }
      if(e.key==='Tab'){
        if(!f.length){ e.preventDefault(); return; }
        if(e.shiftKey && document.activeElement===first){ last.focus(); e.preventDefault(); }
        else if(!e.shiftKey && document.activeElement===last){ first.focus(); e.preventDefault(); }
      }
    };
    document.addEventListener('keydown', trapHandler);
    first?.focus();
  }
  function releaseTrap(){ if(trapHandler){ document.removeEventListener('keydown', trapHandler); trapHandler=null; } lastFocus?.focus?.(); }

  /* ========= Router ========= */
  const scrollPos = new Map(); // href -> scrollTop
  async function navigateTo(href,{push=true}={}){
    const norm = normalizeLink(href);
    const kind = isPermalinkURL(norm) || {type:'home', href:'/'};
    if (push) history.pushState({type:kind.type, href:kind.href, scroll: center().scrollTop}, '', kind.href);
    await renderRoute(kind);
  }
  on(window,'popstate', async e=>{
    const st = e.state || isPermalinkURL(location.href) || {type:'home', href:'/'};
    await renderRoute(st, {restoreScroll: st.scroll ?? 0});
  });

  async function renderRoute(kind, opt={}){
    if (opt.restoreScroll!=null) await sleep(0); // let layout settle
    switch(kind.type){
      case 'home':  await renderHome(); break;
      case 'label': await renderLabel(kind.href); break;
      case 'page':
      case 'post':  await renderPermalink(kind.href); break;
      default:      await renderHome();
    }
    if (opt.restoreScroll!=null) center().scrollTo({top: opt.restoreScroll, behavior:'instant'});
  }

  /* ========= Prefetch ========= */
  const prefetching = new Set();
  function prefetchPermalink(href){ if(prefetching.has(href)) return; prefetching.add(href); getPostByPermalink(href).finally(()=>prefetching.delete(href)); }

  /* ========= High-level renders ========= */
  let greeted=false;
  async function renderHome(){
    room().innerHTML = '';
    if (!greeted){ bubble('<p>Hai! Selamat datang 👋</p>'); greeted=true; }
    const { entries } = await getFeed({ maxResults: POP+FEAT+6 });
    bubble('<p>Popular</p>'); entries.slice(0,POP).forEach(postcard);
    bubble('<p>Featured</p>'); entries.slice(POP, POP+FEAT).forEach(postcard);
    bubble('<p>Selesai. Silakan pilih kartu untuk membaca.</p>');
  }
  async function renderLabel(href){
    room().innerHTML='';
    const lbl = decodeURIComponent((/\/search\/label\/([^?]+)/.exec(href)||[])[1]||'');
    bubble(`<p>Label: <code>${esc(lbl)}</code></p>`);
    const { entries } = await getFeed({ maxResults: 20, label: lbl });
    entries.forEach(postcard);
  }
  async function renderPermalink(href){
    const p = await getPostByPermalink(href);
    room().innerHTML='';
    if(!p){ bubble('<p class="bubble--warn">Maaf, artikel tidak ditemukan.</p>'); return; }
    const { entries } = await getFeed({ maxResults: 12 });
    const sim = entries.filter(x=>x.id!==p.id && x.labels.some(l=>p.labels.includes(l))).slice(0,3);
    reader(p, sim);
    fillRightPanels(p);
  }

  /* ========= SidebarLeft: Labels 2-level & Pages ========= */
  async function buildLabels(){
    const wrap = $('#labelList'); if(!wrap) return;
    wrap.innerHTML = '';
    // ambil sample feed untuk mengumpulkan labels
    const { entries, total } = await getFeed({ maxResults: 50 });
    const labelCount = new Map();
    entries.forEach(p => (p.labels||[]).forEach(l => labelCount.set(l,(labelCount.get(l)||0)+1)));
    // sort alfabetis
    const labels = [...labelCount.keys()].sort((a,b)=>a.localeCompare(b,'id'));
    labels.forEach(lbl=>{
      const d = document.createElement('details'); d.className='label-item';
      d.innerHTML = `
        <summary>
          <svg width="18" height="18" aria-hidden="true"><use href="#i-tag"/></svg>
          <span class="txt">${esc(lbl)}</span>
          <span class="count">${labelCount.get(lbl)}</span>
          <svg width="18" height="18" aria-hidden="true" style="margin-left:auto"><use href="#i-chevron"/></svg>
        </summary>
        <div class="acc" role="region" aria-label="Posting ${esc(lbl)}"></div>`;
      // lazy load isi label saat expand pertama kali
      d.addEventListener('toggle', async ()=>{
        if (d.open && !d.dataset.loaded){
          const acc = d.querySelector('.acc');
          acc.innerHTML = '<p class="small">Memuat…</p>';
          const { entries } = await getFeed({ maxResults: 50, label: lbl });
          entries.sort((a,b)=>a.title.localeCompare(b.title,'id'));
          acc.innerHTML = entries.map(p=>`
            <button class="page-item" data-href="${p.permalink}">
              <svg width="18" height="18" aria-hidden="true"><use href="#i-page"/></svg>
              <span>${esc(p.title)}</span>
            </button>`).join('');
          d.dataset.loaded = '1';
        }
      }, {once:false});
      wrap.append(d);
    });
  }
  async function buildPages(){
    const wrap = $('#pageList'); if(!wrap) return; wrap.innerHTML='';
    const pages = await getPages();
    pages.sort((a,b)=>a.title.localeCompare(b.title,'id'));
    wrap.innerHTML = pages.map(p=>`
      <button class="page-item" data-href="${p.permalink}">
        <svg width="18" height="18" aria-hidden="true"><use href="#i-page"/></svg>
        <span>${esc(p.title)}</span>
      </button>`).join('');
  }

  /* ========= SidebarRight: Meta / ToC / Comments placeholder ========= */
  function fillRightPanels(p){
    const meta = $('#rs-meta'), toc = $('#rs-toc'), com = $('#rs-comments');
    if(meta) meta.innerHTML = `
      <div class="meta-list">
        <div class="meta-row"><svg width="18" height="18" aria-hidden="true"><use href="#i-user"/></svg><span>${esc(p.author||'')}</span></div>
        <div class="meta-row"><svg width="18" height="18" aria-hidden="true"><use href="#i-calendar"/></svg><span>${new Date(p.published||Date.now()).toLocaleString()}</span></div>
        <div class="meta-row"><svg width="18" height="18" aria-hidden="true"><use href="#i-tag"/></svg><span>${(p.labels||[]).map(esc).join(', ')||'-'}</span></div>
        <div class="meta-row"><svg width="18" height="18" aria-hidden="true"><use href="#i-link"/></svg><a href="${p.permalink}" target="_blank" rel="noopener">${p.permalink}</a></div>
      </div>`;
    if(toc){
      // TOC sederhana dari h2/h3
      const doc = new DOMParser().parseFromString(`<div>${p.content||''}</div>`,'text/html');
      const heads = [...doc.querySelectorAll('h2,h3')].slice(0,24);
      toc.innerHTML = heads.length? `<ol class="toc-list">${heads.map((h,i)=>`<li>${esc(h.textContent.trim())}</li>`).join('')}</ol>` : `<p class="small">Tidak ada daftar isi.</p>`;
    }
    if(com) com.innerHTML = `<div class="comment-card"><div class="who">Komentar</div><p>Placeholder OAuth 2.0. Klik tombol “Komentar” di readercard untuk membuka komentar resmi Blogger pada tab baru.</p></div>`;
  }
  // tabs
  on(document, 'click', e=>{
    const t = e.target.closest('.rs-tab'); if(!t) return;
    $$('.rs-tab').forEach(x=>x.classList.remove('is-active'));
    t.classList.add('is-active');
    const id = 'rs-' + t.dataset.tab;
    $$('.rs-pane').forEach(x=>x.classList.remove('is-active'));
    $('#'+id)?.classList.add('is-active');
  });

  /* ========= Global actions & intercept ========= */
  document.addEventListener('click', e=>{
    // Intercept internal anchors SPA
    const a = e.target.closest('a[href]');
    if (a && (a.origin===location.origin)) {
      const info = isPermalinkURL(a.href);
      const modifier = e.metaKey||e.ctrlKey||e.shiftKey||e.altKey;
      if(info && !modifier && !a.hasAttribute('data-no-spa')){ e.preventDefault(); navigateTo(a.href); }
    }
    const btn = e.target.closest('[data-act],[data-action]');
    if(!btn) return;
    const act = btn.getAttribute('data-act') || btn.getAttribute('data-action');
    if(act==='open'){ e.preventDefault(); const href = btn.dataset.href || btn.getAttribute('href') || btn.closest('[data-permalink]')?.dataset.permalink; if(href) navigateTo(href); }
    else if(act==='copy'){ const href = btn.dataset.href || btn.closest('[data-permalink]')?.dataset.permalink; if(!href) return;
      navigator.clipboard.writeText(new URL(href, location.origin).href).then(()=>bubble('<p class="bubble--success">Tautan disalin.</p>'),()=>bubble('<p class="bubble--error">Gagal menyalin.</p>'));
    }
    else if(act==='comment'){ const href=btn.dataset.href; openRight(); if(href) window.open(href+'#comments','_blank','noopener'); }
    else if(act==='properties'){ openRight(); }
    else if(act==='toggle-left'){ elLeft()?.hasAttribute('hidden')?openLeft():closePanels(); }
    else if(act==='toggle-right'){ elRight()?.hasAttribute('hidden')?openRight():closePanels(); }
    else if(act==='toggle-dock'){ toggleDock(true); }
    else if(act==='close'){ toggleDock(false); }
  }, {passive:false});

  // Prefetch on hover/touch
  document.addEventListener('mouseenter', e=>{
    const t = e.target.closest('a[href], .postcard, .readercard');
    const href = t?.getAttribute('href') || t?.dataset.permalink;
    if(href) prefetchPermalink(href);
  }, true);

  // Overlay click → close
  on($('#overlay'), 'click', closePanels);

  // SmartScroll visibility based on center scroll
  (function smartScroll(){
    const btn = $('#smartScroll'); if(!btn) return;
    const el = center();
    const update = ()=>{
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      btn.hidden = nearBottom;
    };
    on(el,'scroll',update,{passive:true}); update();
    on(btn,'click',()=> el.scrollTo({top:999999,behavior:'smooth'}));
  })();

  // Dockbar (top-sheet) + hotkeys
  function toggleDock(on){
    const d = $('#dockbar'); if (!d) return;
    if (on===undefined) on = d.hasAttribute('hidden');
    if (on){ d.removeAttribute('hidden'); d.classList.add('open'); trapFocus($('.dock__sheet')); }
    else { d.classList.remove('open'); d.setAttribute('hidden','hidden'); releaseTrap(); }
  }
  on(document,'keydown', e=>{
    if (e.key==='Escape'){ if (!$('#dockbar')?.hasAttribute('hidden')) toggleDock(false); else closePanels(); }
    if ((e.ctrlKey||e.metaKey) && e.key===','){ e.preventDefault(); toggleDock(true); }
    if ((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='l')){ e.preventDefault(); elLeft()?.hasAttribute('hidden')?openLeft():closePanels(); }
    if ((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='r')){ e.preventDefault(); elRight()?.hasAttribute('hidden')?openRight():closePanels(); }
  });
  on($('.dock__scrim'), 'click', ()=>toggleDock(false));

  // Dockbar tiles → set data-*
  on(document, 'click', e=>{
    const t = e.target.closest('.tile'); if(!t) return;
    const act=t.dataset.action, val=t.dataset.value, delta=+t.dataset.delta||0;
    if (act==='theme'){ document.body.dataset.theme=val; }
    if (act==='density'){ document.body.dataset.density=val; }
    if (act==='bubble'){ document.body.dataset.bubble=val; }
    if (act==='motion'){ document.body.dataset.motion=val; }
    if (act==='ground'){ document.body.dataset.ground=val; }
    if (act==='bg'){ document.body.dataset.bg=val; }
    if (act==='focus'){ document.body.dataset.focus=val; }
    if (act==='tsize'){ const ts=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts'))||1; document.documentElement.style.setProperty('--ts', String(Math.max(0.85, Math.min(1.25, ts+delta)))); }
    if (act==='reset'){ document.documentElement.style.removeProperty('--ts'); ['theme','density','bubble','motion','ground','bg','focus'].forEach(k=>delete document.body.dataset[k]); }
  });

  // Background video toggler
  const bgv = $('#bgVideo');
  function applyBGVideo(){
    const d=document.body.dataset;
    const on = d.theme==='glass' && d.bg==='video' && d.motion==='on';
    if (!bgv) return;
    (on ? bgv.play() : bgv.pause())?.catch(()=>{});
  }
  const mo = new MutationObserver(applyBGVideo);
  mo.observe(document.body, {attributes:true, attributeFilter:['data-theme','data-bg','data-motion']});
  applyBGVideo();

  // Build SidebarLeft content (labels & pages)
  buildLabels().catch(console.warn);
  buildPages().catch(console.warn);

  // Boot: first route
  on(window,'resize', applyPush, {passive:true});
  applyPush();
  (function boot(){
    const info = isPermalinkURL(location.href) || {type:'home', href:'/'};
    if (!history.state) history.replaceState(info, '', info.href);
    renderRoute(info).then(()=>{ const rc = room(); rc && rc.focus && rc.focus({preventScroll:true}); });
  })();

})();
</script>
