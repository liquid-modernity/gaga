/* =========================================================
   Gaga Core — Vanilla JS, Blogger-friendly (no library)
   SPA-feel: pushState/popstate, single stream (#roomchat),
   SidebarLeft (label 2-level), SidebarRight (Meta/ToC/Cmts),
   Popular/Featured as postcards in stream, SmartScroll,
   Focus-trap, CLS guards, tiny cache, scroll restore.
   ========================================================= */

(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const body = document.body, root = document.documentElement;

  /* ---- DOM refs ---- */
  const shell = $('#shell');
  const room  = $('#roomchat');
  const feed  = $('#feed');            // tidak dipakai untuk home; stream tunggal = room
  const left  = $('#sidebarLeft');
  const right = $('#sidebarRight');
  const overlay = $('#overlay');
  const dock  = $('#dockbar');

  /* ---- Config ---- */
  const BLOG_BASE = body.getAttribute('data-blog') || location.origin;
  const FEED_BASE = BLOG_BASE.replace(/\/$/,'') + '/feeds';
  const POPCOUNT  = parseInt(room?.dataset.popcount || feed?.dataset.popcount || '4',10);
  const FEATCOUNT = parseInt(room?.dataset.featcount|| feed?.dataset.featcount|| '4',10);

  /* ---- State & Cache ---- */
  const scrollMem = new Map(); // path -> y
  const cache = {
    posts: null,      // summary entries
    pages: null,      // pages summary
    labels: null,     // label -> posts[]
  };

  /* ---- Utils ---- */
  const el = (html) => { const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; };
  const fmtDate = (s)=>{ try{ const d=new Date(s); return d.toLocaleDateString(document.documentElement.lang||'id',{year:'numeric',month:'2-digit',day:'2-digit'});}catch{return s} };
  const deHTML = (x)=> (x||'').replace(/<[^>]+>/g,'').trim();
  const titleFromUrl = u => decodeURIComponent((u.split('/').pop()||'').replace(/\.html$/,'').replace(/-/g,' '));

  function toast(msg,type='info'){
    const b = el(`<div class="bubble bubble--${type}" data-role="system"><p>${msg}</p></div>`);
    room.appendChild(b); room.scrollTo({top:room.scrollHeight,behavior:'smooth'});
    setTimeout(()=>b.remove(), 2400);
  }
  function copy(s){ return navigator.clipboard.writeText(s).then(()=>toast('Tautan disalin.','success')).catch(()=>toast('Gagal menyalin.','warn')); }

  function setPush(leftOpen, rightOpen){
    root.style.setProperty('--sb-left', leftOpen  ? getComputedStyle(root).getPropertyValue('--w-left')  : '0px');
    root.style.setProperty('--sb-right',rightOpen ? getComputedStyle(root).getPropertyValue('--w-right') : '0px');
    left?.classList.toggle('is-open', !!leftOpen);
    right?.classList.toggle('is-open',!!rightOpen);
    shell?.setAttribute('data-left', leftOpen ? 'open':'closed');
    shell?.setAttribute('data-right',rightOpen? 'open':'closed');
  }
  function openOverlay(){ overlay.hidden=false; overlay.addEventListener('click', closeAll, {once:true}); trapOn(); }
  function closeOverlay(){ overlay.hidden=true; trapOff(); }
  function closeAll(){ setPush(false,false); dock?.setAttribute('hidden','hidden'); closeOverlay(); }

  /* ---- Focus trap (panel/dock) ---- */
  let trapRoot=null, trapEls=[], trapIdx=0;
  function trapOn(){
    trapRoot = [left,right,$('#dockbar .dock__sheet')].find(n=>n && (n.classList.contains('is-open') || !dock.hasAttribute('hidden')));
    if(!trapRoot) return;
    trapEls = $$('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])', trapRoot).filter(x=>!x.disabled && x.offsetParent);
    trapIdx=0; document.addEventListener('keydown',onTrap);
  }
  function trapOff(){ document.removeEventListener('keydown',onTrap); trapRoot=null; trapEls.length=0; }
  function onTrap(e){
    if(e.key==='Escape'){ closeAll(); return; }
    if(e.key!=='Tab'||!trapRoot) return;
    e.preventDefault();
    trapIdx = (trapIdx + (e.shiftKey?-1:1) + trapEls.length) % trapEls.length;
    trapEls[trapIdx]?.focus();
  }

  /* ---- Blogger JSONP ---- */
  function jsonp(url){
    return new Promise((resolve,reject)=>{
      const cb='gcb_'+(Date.now().toString(36))+'_'+(Math.random()*1e6|0);
      const s=document.createElement('script');
      window[cb]=(d)=>{ resolve(d); delete window[cb]; s.remove(); };
      s.onerror=(e)=>{ reject(e); delete window[cb]; s.remove(); };
      s.src = url + (url.includes('?')?'&':'?') + 'alt=json-in-script&callback=' + cb;
      document.head.appendChild(s);
    });
  }

  /* ---- Fetchers ---- */
  async function fetchPosts(max=100, label=""){
    const path = label ? `/posts/summary/-/${encodeURIComponent(label)}` : `/posts/summary`;
    const url = FEED_BASE + path + `?max-results=${max}`;
    const d = await jsonp(url);
    return (d?.feed?.entry||[]).map(e=>{
      const url = e.link?.find(l=>l.rel==='alternate')?.href;
      const thumb = (e.media$thumbnail?.url || '').replace(/\/s\d+(-c)?\//,'/s400-c/');
      const labels = (e.category||[]).map(c=>c.term);
      return {
        id:e.id?.$t, title:e.title?.$t||titleFromUrl(url), url,
        summary:deHTML(e.summary?.$t), author:e.author?.[0]?.name?.$t||'Admin',
        published:e.published?.$t, updated:e.updated?.$t, labels, thumb
      };
    });
  }
  async function fetchPages(){
    const url = FEED_BASE + `/pages/summary?max-results=100`;
    const d = await jsonp(url);
    return (d?.feed?.entry||[]).map(e=>({
      id: e.id?.$t, title:e.title?.$t, url: e.link?.find(l=>l.rel==='alternate')?.href, updated:e.updated?.$t
    }));
  }
  async function fetchPostHTML(permalink){
    const res = await fetch(permalink, { credentials:'same-origin', cache:'force-cache' });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html,'text/html');
    const content = doc.querySelector('.post-body, [itemprop="articleBody"], article .post-entry, #post-body, .entry-content') || doc.querySelector('article') || doc.body;
    const title = doc.querySelector('h1.post-title, h1.entry-title, h1[itemprop="headline"], article h1')?.textContent?.trim() || titleFromUrl(permalink);
    const dateEl = doc.querySelector('time[datetime], .published, .post-timestamp');
    const date = dateEl?.getAttribute('datetime') || dateEl?.textContent || '';
    const labels = Array.from(doc.querySelectorAll('a[rel="tag"], .post-labels a')).map(a=>a.textContent.trim());
    return { title, date, html: content?.innerHTML || '', permalink, labels };
  }

  /* ---- Renderers ---- */
  function renderPostcard(p){
    return el(`
      <article class="postcard" data-postid="${p.id}">
        <div class="thumb ar-4-3"><img src="${p.thumb||''}" loading="lazy" decoding="async" alt=""></div>
        <div class="body">
          <h3 class="title"><a href="${p.url}">${p.title}</a></h3>
          <p class="excerpt">${p.summary||''}</p>
          <div class="meta">
            <span class="m"><svg width="16" height="16" aria-hidden="true"><use href="#i-user"/></svg>${p.author||'Admin'}</span>
            <span class="m"><svg width="16" height="16" aria-hidden="true"><use href="#i-calendar"/></svg>${fmtDate(p.published)}</span>
            <span class="m"><svg width="16" height="16" aria-hidden="true"><use href="#i-clock"/></svg>1 menit</span>
            <div class="actions">
              <a class="iconbtn" aria-label="Baca" data-action="open" href="${p.url}"><svg width="18" height="18"><use href="#i-page"/></svg><span>Baca</span></a>
              <button class="iconbtn" aria-label="Salin" data-action="copy" data-url="${p.url}"><svg width="18" height="18"><use href="#i-copy"/></svg><span>Salin</span></button>
              <button class="iconbtn" aria-label="Komentar" data-action="comment" data-url="${p.url}"><svg width="18" height="18"><use href="#i-comment"/></svg><span>Komentar</span></button>
              <button class="iconbtn" aria-label="Properti" data-action="properti" data-url="${p.url}"><svg width="18" height="18"><use href="#i-info"/></svg><span>Properti</span></button>
            </div>
          </div>
        </div>
      </article>
    `);
  }

  function renderReader(post){
    return el(`
      <article class="readercard" role="dialog" aria-modal="true" aria-labelledby="readerTitle">
        <header class="reader-head">
          <h1 class="reader-title" id="readerTitle">${post.title}</h1>
          <div class="reader-meta">
            <span class="m"><svg width="16" height="16" aria-hidden="true"><use href="#i-calendar"/></svg>${fmtDate(post.date||new Date())}</span>
            ${post.labels?.length? `<span class="m"><svg width="16" height="16"><use href="#i-tag"/></svg>${post.labels.join(', ')}</span>`:''}
            <span class="m"><svg width="16" height="16"><use href="#i-link"/></svg><a href="${post.permalink}" data-no-spa>Permalink</a></span>
          </div>
        </header>
        <section class="reader-body">${post.html}</section>
        <footer class="reader-actions">
          <button class="iconbtn" aria-label="Salin tautan" data-action="copy" data-url="${post.permalink}"><svg width="18" height="18"><use href="#i-copy"/></svg><span>Salin</span></button>
          <button class="iconbtn" aria-label="Komentar" data-action="comment" data-url="${post.permalink}"><svg width="18" height="18"><use href="#i-comment"/></svg><span>Komentar</span></button>
          <button class="iconbtn" aria-label="Properti" data-action="properti" data-url="${post.permalink}"><svg width="18" height="18"><use href="#i-info"/></svg><span>Properti</span></button>
        </footer>
      </article>
    `);
  }

  function renderSimilarBlock(posts){
    if(!posts?.length) return null;
    const frag = document.createDocumentFragment();
    posts.slice(0,3).forEach(p=>frag.appendChild(renderPostcard(p)));
    return frag;
  }

  /* ---- SidebarRight content ---- */
  function fillRightPanel(post){
    const meta = $('#rs-meta'); const toc = $('#rs-toc'); const cmt = $('#rs-comments');
    if(meta) meta.innerHTML = `
      <h3>Meta</h3>
      <dl>
        <dt>Judul</dt><dd>${post.title||'-'}</dd>
        <dt>Tautan</dt><dd><a href="${post.permalink||location.href}" data-no-spa>${post.permalink||location.href}</a></dd>
        ${post.labels?.length? `<dt>Label</dt><dd>${post.labels.join(', ')}</dd>`:''}
        <dt>Tanggal</dt><dd>${fmtDate(post.date||new Date())}</dd>
      </dl>`;
    if(toc){
      const tmp = document.createElement('div'); tmp.innerHTML = post.html||'';
      const heads = $$('h1,h2,h3', tmp); heads.forEach((h,i)=>{ if(!h.id) h.id='h-'+(i+1) });
      toc.innerHTML = `<h3>Daftar Isi</h3>` + (heads.length? `<ol>${heads.map(h=>`<li><a href="${post.permalink}#${h.id}" data-no-spa>${h.textContent}</a></li>`).join('')}</ol>` : `<p>(Tidak ada heading)</p>`);
    }
    if(cmt){
      cmt.innerHTML = `
        <h3>Komentar</h3>
        <p>Placeholder OAuth 2.0. Masuk & kirim komentar via formulir resmi Blogger.</p>
        <div class="replybar">
          <input id="replyInput" class="input-el" placeholder="Tulis balasan…" aria-label="Tulis balasan"/>
          <button id="replySend" class="btn-infield" type="button"><svg width="18" height="18"><use href="#i-send"/></svg></button>
        </div>`;
      $('#replySend')?.addEventListener('click', ()=>{
        const val = $('#replyInput')?.value?.trim(); if(!val){ toast('Teks kosong.','warn'); return; }
        copy(val); window.open((post.permalink||location.href).replace(/#.*$/,'')+'#comment-form','_blank','noopener');
        toast('Teks komentar disalin. Form komentar dibuka.','success');
      });
    }
  }

  /* ---- SidebarLeft: build labels (2-level) & pages ---- */
  async function buildLeftNav(){
    // posts summary (cache)
    const posts = cache.posts || await fetchPosts(200);
    cache.posts = posts;

    // labels index
    const map = {};
    posts.forEach(p => (p.labels||[]).forEach(lb => (map[lb] ||= []).push(p)));
    cache.labels = map;

    // render labels
    const list = $('#labelList');
    if(list){
      list.innerHTML = '';
      Object.keys(map).sort((a,b)=>a.localeCompare(b)).forEach(lb=>{
        const items = map[lb].slice().sort((a,b)=>a.title.localeCompare(b.title));
        const det = el(`
          <details class="label-item">
            <summary>
              <svg width="18" height="18" aria-hidden="true"><use href="#i-tag"/></svg>
              <b>${lb}</b>
              <svg class="chev" width="18" height="18" aria-hidden="true"><use href="#i-chevron"/></svg>
            </summary>
            <div class="acc" role="group" aria-label="${lb}"></div>
          </details>`);
        const acc = det.querySelector('.acc');
        items.forEach(p=>{
          const a = el(`<a class="page-item" href="${p.url}"><svg width="18" height="18"><use href="#i-page"/></svg>${p.title}</a>`);
          acc.appendChild(a);
        });
        // pushState ke /search/label/<lb> saat buka
        det.addEventListener('toggle', ()=>{
          if(det.open){ history.pushState({},'', `${BLOG_BASE.replace(/\/$/,'')}/search/label/${encodeURIComponent(lb)}`); }
        });
        list.appendChild(det);
      });
    }

    // pages
    const pages = cache.pages || await fetchPages(); cache.pages = pages;
    const plist = $('#pageList');
    if(plist){
      plist.innerHTML = '';
      pages.forEach(pg => plist.appendChild(el(`<a class="page-item" href="${pg.url}"><svg width="18" height="18"><use href="#i-page"/></svg>${pg.title}</a>`)));
    }
  }

  /* ---- Home stream: greeting → Popular → Featured → closing ---- */
  async function renderHome(){
    rememberScroll(); room.innerHTML='';
    const frag = document.createDocumentFragment();

    frag.appendChild(el(`<div class="bubble" data-role="system"><p>Halo! Selamat datang 👋</p></div>`));

    // Ensure cache
    const posts = cache.posts || await fetchPosts(120); cache.posts = posts;

    // Popular
    if(POPCOUNT>0){
      const pop = await fetchPosts(Math.max(POPCOUNT,8),'Popular').catch(()=>[]);
      pop.slice(0,POPCOUNT).forEach(p=>frag.appendChild(renderPostcard(p)));
      frag.appendChild(el(`<div class="bubble" data-role="system"><p>Itu tadi postingan populer.</p></div>`));
    }

    // Featured
    if(FEATCOUNT>0){
      const feat = await fetchPosts(Math.max(FEATCOUNT,8),'Featured').catch(()=>[]);
      feat.slice(0,FEATCOUNT).forEach(p=>frag.appendChild(renderPostcard(p)));
      frag.appendChild(el(`<div class="bubble" data-role="system"><p>Postingan pilihan selesai. Selamat membaca!</p></div>`));
    }

    room.appendChild(frag);
    restoreScroll();  // pulihkan posisi kalau ada
  }

  /* ---- Reader openers ---- */
  let currentPost = null;

  async function openPostUrl(permalink){
    rememberScroll();
    const post = await fetchPostHTML(permalink);
    currentPost = post;
    room.innerHTML='';
    room.appendChild(renderReader(post));

    // Similar 3
    const all = cache.posts || await fetchPosts(120);
    const key = post.labels?.[0];
    if(key){
      const sim = all.filter(p=>p.url!==permalink && p.labels?.includes(key)).slice(0,3);
      const block = renderSimilarBlock(sim);
      if(block){ room.appendChild(el(`<div class="bubble" data-role="system"><p>Similar</p></div>`)); room.appendChild(block); }
    }

    fillRightPanel(post);
    room.scrollTo({top:0,behavior:'smooth'});
  }

  async function openPageUrl(permalink){ return openPostUrl(permalink); }

  async function openLabel(label){
    rememberScroll();
    const list = await fetchPosts(120, label);
    room.innerHTML='';
    room.appendChild(el(`<div class="bubble" data-role="system"><p>Label: ${label}</p></div>`));
    list.forEach(p=> room.appendChild(renderPostcard(p)));
    room.appendChild(el(`<div class="bubble" data-role="system"><p>— Akhir daftar label —</p></div>`));
    restoreScroll();
  }

  /* ---- SPA Router: intercept & history ---- */
  function rememberScroll(){ scrollMem.set(location.pathname + location.search, room.scrollTop); }
  function restoreScroll(){
    const key = location.pathname + location.search;
    const y = scrollMem.get(key);
    if(typeof y === 'number'){ requestAnimationFrame(()=> room.scrollTo({top:y})) }
  }

  document.addEventListener('click', (e)=>{
    const a = e.target.closest('a[href]'); if(!a) return;
    if(a.hasAttribute('data-no-spa')) return;
    if(e.metaKey || e.ctrlKey || e.shiftKey) return; // respect new-tab/open
    const url = new URL(a.href, location.origin);
    if(url.origin !== location.origin) return;

    // intercept Blogger internal routes
    const isPost  = /\/\d{4}\/\d{2}\//.test(url.pathname);
    const isPage  = /\/p\//.test(url.pathname);
    const isLabel = /\/search\/label\//.test(url.pathname);

    if(isPost || isPage || isLabel){ e.preventDefault(); navigate(url.href); }
  });

  window.addEventListener('popstate', ()=> navigate(location.href, {replace:true}));

  async function navigate(href, {replace=false}={}){
    try{
      if(/\/\d{4}\/\d{2}\//.test(href)){ await openPostUrl(href); }
      else if(/\/p\//.test(href)){ await openPageUrl(href); }
      else if(/\/search\/label\//.test(href)){ const lb=decodeURIComponent(href.split('/search/label/')[1]||'').replace(/\/.*/,''); await openLabel(lb); }
      else { await renderHome(); }

      if(replace) history.replaceState({},'',href); else history.pushState({},'',href);
      document.title = (document.querySelector('meta[name="description"]')?.content||'Gaga') + ' | ' + (new URL(href)).pathname;
      hideSmart(false);
    }catch(err){
      console.error(err); toast('Gagal memuat. Mengalihkan…','error'); location.href = href;
    }
  }

  /* ---- Actions (delegated) ---- */
  document.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-action]'); if(!b) return;
    const act = b.dataset.action;

    if(act==='open'){ e.preventDefault(); navigate(b.getAttribute('href') || b.dataset.url); room.appendChild(el(`<div class="bubble" data-role="system"><p>Membuka…</p></div>`)); }
    if(act==='copy'){ copy(b.dataset.url||location.href); }
    if(act==='comment'){ window.open((b.dataset.url||location.href).replace(/#.*$/,'')+'#comment-form','_blank','noopener'); toast('Form komentar dibuka.'); }
    if(act==='properti'){ fillRightPanel(currentPost||{permalink:b.dataset.url}); const open = !right.classList.contains('is-open'); setPush(left?.classList.contains('is-open'), open); open ? openOverlay() : closeOverlay(); toast('Panel Properti dibuka.'); }

    if(act==='toggle-left'){ const open = !left.classList.contains('is-open'); setPush(open, right?.classList.contains('is-open')); open ? openOverlay() : closeOverlay(); }
    if(act==='toggle-right'){ const open = !right.classList.contains('is-open'); setPush(left?.classList.contains('is-open'), open); fillRightPanel(currentPost||{}); open ? openOverlay() : closeOverlay(); }
    if(act==='toggle-dock' || act==='open-dock'){ if(dock.hasAttribute('hidden')){ dock.removeAttribute('hidden'); openOverlay(); } else { dock.setAttribute('hidden','hidden'); closeOverlay(); } }
    if(act==='close'){ closeAll(); }

    // Dock toggles
    if(act==='theme'){ setPref('theme', b.dataset.value); }
    if(act==='density'){ setPref('density', b.dataset.value); }
    if(act==='bubble'){ setPref('bubble', b.dataset.value); }
    if(act==='motion'){ setPref('motion', b.dataset.value); }
    if(act==='ground'){ setPref('ground', b.dataset.value); }
    if(act==='bg'){ setPref('bg', b.dataset.value); }
    if(act==='focus'){ setPref('focus', b.dataset.value); }
    if(act==='tsize'){ setTypeDelta(parseFloat(b.dataset.delta||0)); }
    if(act==='reset'){ resetPrefs(); }
  });

  // keyboard shortcuts
  document.addEventListener('keydown', (e)=>{
    if(e.key==='/' && !e.ctrlKey && !e.metaKey){ e.preventDefault(); $('#chatInput')?.focus(); }
    if((e.ctrlKey||e.metaKey) && e.key===','){ e.preventDefault(); $('[data-action="toggle-dock"]')?.click(); }
    if((e.ctrlKey||e.metaKey) && (e.key==='l'||e.key==='L')){ e.preventDefault(); $('[data-action="toggle-left"]')?.click(); }
    if((e.ctrlKey||e.metaKey) && (e.key==='r'||e.key==='R')){ e.preventDefault(); $('[data-action="toggle-right"]')?.click(); }
    if(e.key==='Escape'){ closeAll(); }
  });

  /* ---- SmartScroll ---- */
  const smart = $('#smartScroll'); let lastY = 0;
  function hideSmart(show){ if(!smart) return; show ? smart.removeAttribute('hidden') : smart.setAttribute('hidden','hidden'); }
  room?.addEventListener('scroll', ()=>{ const y=room.scrollTop; hideSmart(y < lastY - 120); lastY=y; });
  smart?.addEventListener('click', ()=> room.scrollTo({top:room.scrollHeight,behavior:'smooth'}));

  /* ---- Preferences (dockbar) ---- */
  const PREFS=['theme','density','bubble','motion','ground','bg','focus','ts'];
  function setPref(k,v){ if(!PREFS.includes(k)) return; if(k==='ts'){ root.style.setProperty('--ts', v); localStorage.setItem('ts', v); return; } body.setAttribute(`data-${k}`,v); localStorage.setItem(k,v); }
  function setTypeDelta(d){ const cur=parseFloat(getComputedStyle(root).getPropertyValue('--ts')||'1'); const next=Math.max(.85,Math.min(1.25,cur+d)); setPref('ts',String(next)); }
  function resetPrefs(){ PREFS.forEach(k=>localStorage.removeItem(k)); location.reload(); }
  (function hydrate(){ PREFS.forEach(k=>{ const v=localStorage.getItem(k); if(v) (k==='ts'? root.style.setProperty('--ts',v) : body.setAttribute(`data-${k}`,v)); }); })();

  /* ---- Tabs Right Panel ---- */
  (function bindTabsRight(){
    const tabs = $$('.rs-tab'); const panes = $$('.rs-pane');
    tabs.forEach(t=> t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('is-active')); t.classList.add('is-active');
      panes.forEach(p=>p.classList.remove('is-active')); $('#rs-'+t.dataset.tab)?.classList.add('is-active');
    }));
  })();

  /* ---- Chatbar ---- */
  $('#chatForm')?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const v = $('#chatInput')?.value?.trim(); if(!v) return;
    room.appendChild(el(`<div class="bubble" data-role="user"><p>${v}</p></div>`));
    $('#chatInput').value='';
    room.scrollTo({top:room.scrollHeight,behavior:'smooth'});
  });

  /* ---- Boot ---- */
  setPush(false,false);
  buildLeftNav().catch(console.warn);
  renderHome(); // stream tunggal di roomchat
})();
