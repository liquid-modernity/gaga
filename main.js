/* ====================================================
   Gaga — main.js (vanilla, no lib, Blogger-friendly)
   Features: SPA feel (pushState), stream-only,
   Featured/Popular/Similar, Readercard, Sidebar panels,
   Dockbar controls, push layout, overlay + focus-trap,
   SmartScroll, a11y & CLS guards.
   ==================================================== */

(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  /* ----------------- Config ----------------- */
  const body = document.body;
  const BLOG_BASE = body.getAttribute('data-blog') || location.origin;
  const FEED_BASE = BLOG_BASE.replace(/\/$/,'') + '/feeds';
  const room = $('#roomchat');
  const feed = $('#feed');
  const left = $('#sidebarLeft');
  const right = $('#sidebarRight');
  const overlay = $('#overlay');
  const dock = $('#dockbar');
  const shell = $('#shell');

  const POPCOUNT  = parseInt(feed?.dataset.popcount || '0',10) || 0;
  const FEATCOUNT = parseInt(feed?.dataset.featcount|| '0',10) || 0;

  /* cache */
  const cache = {
    posts: null,         // summary entries
    pages: null,         // pages summary
    labelMap: null,      // label -> entries
  };

  /* ----------------- Utils ----------------- */
  const titleFromUrl = u => decodeURIComponent((u.split('/').pop()||'').replace(/\.html$/,'').replace(/-/g,' '));
  const fmtDate = s => {
    try{ const d=new Date(s); return d.toLocaleDateString(document.documentElement.lang||'id',{year:'numeric',month:'2-digit',day:'2-digit'});}catch{ return s }
  };
  const el = (html) => { const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; };

  function toast(msg, type='info'){
    const b = el(`<div class="bubble bubble--${type}" data-role="system"><p>${msg}</p></div>`);
    room.appendChild(b);
    room.scrollTo({top:room.scrollHeight,behavior:'smooth'});
    setTimeout(()=>b.remove(), 3000);
  }

  function copyText(t){
    return navigator.clipboard.writeText(t)
      .then(()=> toast('Tautan disalin.', 'success'))
      .catch(()=> toast('Gagal menyalin.', 'warn'));
  }

  function setPush(leftOpen, rightOpen){
    document.documentElement.style.setProperty('--sb-left', leftOpen ? getComputedStyle(document.documentElement).getPropertyValue('--w-left')  : '0px');
    document.documentElement.style.setProperty('--sb-right', rightOpen? getComputedStyle(document.documentElement).getPropertyValue('--w-right') : '0px');
    if(left)  left.classList.toggle('is-open', !!leftOpen);
    if(right) right.classList.toggle('is-open',!!rightOpen);
    shell?.setAttribute('data-left', leftOpen ? 'open':'closed');
    shell?.setAttribute('data-right',rightOpen? 'open':'closed');
  }

  function openOverlay(){ overlay.hidden=false; overlay.addEventListener('click', closeAll, { once:true }); trapOn(); }
  function closeOverlay(){ overlay.hidden=true; trapOff(); }
  function closeAll(){ setPush(false,false); dock?.setAttribute('hidden','hidden'); closeOverlay(); }

  /* focus trap (minimal) for open panel/dock */
  let trapRoot = null, trapFocusables = [], trapIndex = 0;
  function trapOn(){
    trapRoot = [left,right,$('#dockbar .dock__sheet')].find(n=>n && (n.classList.contains('is-open') || !dock.hasAttribute('hidden')));
    if(!trapRoot) return;
    trapFocusables = $$('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])', trapRoot).filter(x=>!x.disabled && x.offsetParent);
    trapIndex = 0;
    document.addEventListener('keydown', onTrap);
  }
  function trapOff(){ document.removeEventListener('keydown', onTrap); trapRoot=null; trapFocusables.length=0; }
  function onTrap(e){
    if(e.key==='Escape'){ closeAll(); return; }
    if(e.key!=='Tab' || !trapRoot) return;
    e.preventDefault();
    trapIndex = (trapIndex + (e.shiftKey?-1:1) + trapFocusables.length) % trapFocusables.length;
    trapFocusables[trapIndex]?.focus();
  }

  /* JSONP for Blogger feeds (CORS-agnostic) */
  function jsonp(url){
    return new Promise((resolve,reject)=>{
      const cb = 'gcb_' + (Date.now().toString(36)) + '_' + (Math.random()*1e6|0);
      const s = document.createElement('script');
      window[cb] = (data)=>{ resolve(data); delete window[cb]; s.remove(); };
      s.onerror = (e)=>{ reject(e); delete window[cb]; s.remove(); };
      s.src = url + (url.includes('?')?'&':'?') + 'alt=json-in-script&callback=' + cb;
      document.head.appendChild(s);
    });
  }

  /* Fetchers */
  async function fetchPosts(max=50, label=""){
    const path = label ? `/posts/summary/-/${encodeURIComponent(label)}` : `/posts/summary`;
    const url = FEED_BASE + path + `?max-results=${max}`;
    const data = await jsonp(url);
    return (data?.feed?.entry||[]).map(normEntry);
  }
  async function fetchPages(){
    const url = FEED_BASE + `/pages/summary?max-results=100`;
    const data = await jsonp(url);
    return (data?.feed?.entry||[]).map(e=>({
      id: e.id?.$t, title: e.title?.$t, url: e.link?.find(l=>l.rel==='alternate')?.href, updated: e.updated?.$t
    }));
  }

  function normEntry(e){
    const url = e.link?.find(l=>l.rel==='alternate')?.href;
    const thumb = (e.media$thumbnail?.url || '').replace(/\/s\d+(-c)?\//,'/s400-c/');
    const labels = (e.category||[]).map(c=>c.term);
    return {
      id: e.id?.$t, title: e.title?.$t || titleFromUrl(url),
      url, summary: (e.summary?.$t||'').replace(/<[^>]+>/g,'').trim(),
      author: e.author?.[0]?.name?.$t || 'Admin', published: e.published?.$t, updated:e.updated?.$t,
      labels, thumb
    };
  }

  /* Reader: fetch full content by fetching the permalink HTML (same-origin) */
  async function fetchPostHTML(permalink){
    const res = await fetch(permalink, { credentials:'same-origin' });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // heuristics: common Blogger selectors
    const content = doc.querySelector('.post-body, [itemprop="articleBody"], article .post-entry, #post-body, .entry-content') || doc.querySelector('article') || doc.body;
    const title = doc.querySelector('h1.post-title, h1.entry-title, h1[itemprop="headline"], article h1')?.textContent?.trim() || titleFromUrl(permalink);
    const dateEl = doc.querySelector('time[datetime], .published, .post-timestamp');
    const date = dateEl?.getAttribute('datetime') || dateEl?.textContent || '';
    const labels = Array.from(doc.querySelectorAll('a[rel="tag"], .post-labels a')).map(a=>a.textContent.trim());
    return { title, date, html: content?.innerHTML || '', permalink, labels };
  }

  /* ----------------- Renderers ----------------- */
  function renderPostcard(p){
    const node = el(`
      <article class="postcard" data-postid="${p.id}">
        <div class="thumb ar-4-3"><img src="${p.thumb||''}" loading="lazy" decoding="async" alt=""></div>
        <div class="body">
          <h3 class="title">${p.title}</h3>
          <p class="excerpt">${p.summary||''}</p>
          <div class="meta">
            <span class="m"><svg width="16" height="16" aria-hidden="true"><use href="#i-user"/></svg> ${p.author||'Admin'}</span>
            <span class="m"><svg width="16" height="16" aria-hidden="true"><use href="#i-calendar"/></svg> ${fmtDate(p.published)}</span>
            <span class="m"><svg width="16" height="16" aria-hidden="true"><use href="#i-clock"/></svg> 1 menit</span>
            <div class="actions">
              <button class="iconbtn" aria-label="Buka" data-action="open" data-url="${p.url}"><svg width="18" height="18"><use href="#i-page"/></svg><span>Buka</span></button>
              <button class="iconbtn" aria-label="Salin tautan" data-action="copy" data-url="${p.url}"><svg width="18" height="18"><use href="#i-copy"/></svg><span>Salin</span></button>
              <button class="iconbtn" aria-label="Komentar" data-action="comment" data-url="${p.url}"><svg width="18" height="18"><use href="#i-comment"/></svg><span>Komentar</span></button>
              <button class="iconbtn" aria-label="Properti" data-action="toggle-right" data-url="${p.url}"><svg width="18" height="18"><use href="#i-info"/></svg><span>Properti</span></button>
            </div>
          </div>
        </div>
      </article>
    `);
    return node;
  }

  function renderReader(post){
    const node = el(`
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
          <button class="iconbtn" aria-label="Properti" data-action="toggle-right" data-url="${post.permalink}"><svg width="18" height="18"><use href="#i-info"/></svg><span>Properti</span></button>
        </footer>
      </article>
    `);
    return node;
  }

  function renderSimilar(similar){
    if(!similar?.length) return null;
    const frag = document.createDocumentFragment();
    similar.slice(0,3).forEach(p => frag.appendChild(renderPostcard(p)));
    return frag;
  }

  /* SidebarRight content (meta/ToC/comments) */
  function fillRightPanel(post){
    const meta = $('#rs-meta'); const toc = $('#rs-toc'); const cmt = $('#rs-comments');
    if(meta) meta.innerHTML = `
      <h3>Meta</h3>
      <dl>
        <dt>Judul</dt><dd>${post.title}</dd>
        <dt>Tautan</dt><dd><a href="${post.permalink}" data-no-spa>${post.permalink}</a></dd>
        <dt>Tanggal</dt><dd>${fmtDate(post.date||new Date())}</dd>
        ${post.labels?.length? `<dt>Label</dt><dd>${post.labels.join(', ')}</dd>`:''}
      </dl>
    `;
    if(toc){
      const tmp = document.createElement('div'); tmp.innerHTML = post.html;
      const heads = $$('h1,h2,h3', tmp);
      heads.forEach((h,i)=>{ if(!h.id) h.id = 'h-' + (i+1) });
      toc.innerHTML = `<h3>Daftar Isi</h3>` + (heads.length
        ? `<ol>` + heads.map(h=>`<li><a href="${post.permalink}#${h.id}" data-no-spa>${h.textContent}</a></li>`).join('') + `</ol>`
        : `<p>(Tidak ada heading ditemukan)</p>`);
    }
    if(cmt){
      cmt.innerHTML = `
        <h3>Komentar</h3>
        <p>OAuth 2.0 placeholder (login/identitas akan terhubung ke formulir komentar resmi Blogger).</p>
        <div class="replybar">
          <input id="replyInput" class="input-el" placeholder="Tulis balasan…" aria-label="Tulis balasan"/>
          <button id="replySend" class="btn-infield" type="button"><svg width="18" height="18"><use href="#i-send"/></svg></button>
        </div>
      `;
      $('#replySend')?.addEventListener('click', ()=>{
        const val = $('#replyInput')?.value?.trim(); if(!val){ toast('Teks kosong.','warn'); return; }
        copyText(val);
        window.open(post.permalink.replace(/#.*$/,'')+'#comment-form','_blank','noopener');
        toast('Teks komentar disalin. Form komentar dibuka.','success');
      });
    }
  }

  /* SidebarLeft: labels 2-level + pages */
  async function buildLabelsAndPages(){
    // posts cache
    const posts = cache.posts || await fetchPosts(150);
    cache.posts = posts;
    // index label -> posts
    const labelMap = {};
    posts.forEach(p => (p.labels||[]).forEach(lb => { (labelMap[lb] ||= []).push(p) }));
    cache.labelMap = labelMap;

    // labels list
    const list = $('#labelList'); if(list){
      list.innerHTML = '';
      Object.keys(labelMap).sort((a,b)=>a.localeCompare(b)).forEach(lb=>{
        const items = labelMap[lb].slice().sort((a,b)=>a.title.localeCompare(b.title));
        const det = el(`
          <details class="label-item">
            <summary><svg width="18" height="18"><use href="#i-tag"/></svg><b>${lb}</b><span class="count">${items.length}</span></summary>
            <div class="acc"></div>
          </details>
        `);
        const acc = det.querySelector('.acc');
        items.forEach(p=>{
          const a = el(`<a class="page-item" href="${p.url}"><svg width="18" height="18"><use href="#i-page"/></svg>${p.title}</a>`);
          acc.appendChild(a);
        });
        list.appendChild(det);
      });
    }

    // pages
    const pages = cache.pages || await fetchPages(); cache.pages = pages;
    const plist = $('#pageList'); if(plist){
      plist.innerHTML = '';
      pages.forEach(pg=>{
        plist.appendChild(el(`<a class="page-item" href="${pg.url}"><svg width="18" height="18"><use href="#i-page"/></svg>${pg.title}</a>`));
      });
    }
  }

  /* --------------- SPA Router --------------- */
  document.addEventListener('click', (e)=>{
    const a = e.target.closest('a[href]'); if(!a) return;
    if(a.hasAttribute('data-no-spa')) return; // let browser handle
    const url = new URL(a.href, location.origin);
    if(url.origin !== location.origin) return;
    // only intercept Blogger internal routes (post/page/label/search)
    if(/\/(p\/|search|label|)\S*/.test(url.pathname) || /\/\d{4}\/\d{2}\//.test(url.pathname)){
      e.preventDefault();
      navigate(url.href);
    }
  });

  window.addEventListener('popstate', ()=> navigate(location.href, {replace:true}));

  async function navigate(href, {replace=false} = {}){
    try{
      if(/\/\d{4}\/\d{2}\//.test(href)){          // permalink post
        await openPostUrl(href);
      }else if(/\/label\//.test(href)){           // label page
        const label = decodeURIComponent(href.split('/label/')[1]||'').replace(/\/.*$/,'');
        await openLabel(label);
      }else if(/\/p\//.test(href)){               // page
        await openPageUrl(href);
      }else{
        await openHome();
      }
      if(replace) history.replaceState({},'',href); else history.pushState({},'',href);
      document.title = (document.querySelector('meta[name="description"]')?.content||'Gaga') + ' | ' + (new URL(href)).pathname;
      hideSmart(false);
    }catch(err){
      console.error(err);
      toast('Gagal memuat konten. Redirect…','error');
      location.href = href; // hard nav fallback
    }
  }

  /* --------------- Actions (delegated) --------------- */
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-action]'); if(!btn) return;
    const act = btn.dataset.action;
    if(act==='open'){ e.preventDefault(); navigate(btn.dataset.url||btn.getAttribute('href')||'#'); }
    if(act==='copy'){ copyText(btn.dataset.url||location.href); }
    if(act==='comment'){ window.open((btn.dataset.url||location.href).replace(/#.*$/,'')+'#comment-form','_blank','noopener'); toast('Membuka formulir komentar…'); }
    if(act==='toggle-left'){ const open = !left.classList.contains('is-open'); setPush(open, right?.classList.contains('is-open')); open ? openOverlay() : closeOverlay(); }
    if(act==='toggle-right'){ const open = !right.classList.contains('is-open'); setPush(left?.classList.contains('is-open'), open); fillRightPanel(currentPost||{}); open ? openOverlay() : closeOverlay(); }
    if(act==='toggle-dock' || act==='open-dock'){ if(dock.hasAttribute('hidden')){ dock.removeAttribute('hidden'); openOverlay(); } else { dock.setAttribute('hidden','hidden'); closeOverlay(); } }
    if(act==='close'){ closeAll(); }
    // dock toggles
    if(act==='theme'){ setPref('theme', btn.dataset.value); }
    if(act==='density'){ setPref('density', btn.dataset.value); }
    if(act==='bubble'){ setPref('bubble', btn.dataset.value); }
    if(act==='motion'){ setPref('motion', btn.dataset.value); }
    if(act==='ground'){ setPref('ground', btn.dataset.value); }
    if(act==='bg'){ setPref('bg', btn.dataset.value); }
    if(act==='focus'){ setPref('focus', btn.dataset.value); }
    if(act==='tsize'){ setTypeDelta(parseFloat(btn.dataset.delta||0)); }
    if(act==='reset'){ resetPrefs(); }
  });

  // keyboard shortcuts
  document.addEventListener('keydown', (e)=>{
    if(e.key==='/' && !e.ctrlKey && !e.metaKey){ e.preventDefault(); $('#chatInput')?.focus(); }
    if((e.ctrlKey||e.metaKey) && e.key===','){ e.preventDefault(); $('[data-action="toggle-dock"]')?.click(); }
    if((e.ctrlKey||e.metaKey) && (e.key==='l' || e.key==='L')){ e.preventDefault(); $('[data-action="toggle-left"]')?.click(); }
    if((e.ctrlKey||e.metaKey) && (e.key==='r' || e.key==='R')){ e.preventDefault(); $('[data-action="toggle-right"]')?.click(); }
    if(e.key==='Escape'){ closeAll(); }
  });

  /* --------------- Openers --------------- */
  let currentPost = null;

  async function openHome(){
    // boot scene: Featured → Popular → latest list
    room.innerHTML = '';
    const frag = document.createDocumentFragment();

    // ensure cache posts
    const posts = cache.posts || await fetchPosts(80);
    cache.posts = posts;

    // Featured via label "Featured" (or "Pilihan") — configurable via FEATCOUNT
    if(FEATCOUNT){
      const feat = await fetchPosts(FEATCOUNT, 'Featured').catch(()=>[]);
      feat.forEach(p => frag.appendChild(renderPostcard(p)));
    }

    // Popular (fallback: label "Popular")
    if(POPCOUNT){
      const pop = await fetchPosts(POPCOUNT, 'Popular').catch(()=>[]);
      pop.forEach(p => frag.appendChild(renderPostcard(p)));
    }

    // Latest (remaining)
    posts.slice(0, Math.max(6, 12 - (FEATCOUNT+POPCOUNT))).forEach(p => frag.appendChild(renderPostcard(p)));

    // dump into feed stream area (postcards live in #feed section)
    feed.innerHTML = '';
    feed.appendChild(frag);

    // system bubbles (greeting minimal)
    room.appendChild(el(`<div class="bubble" data-role="system"><p>Hai! Pilih kartu untuk membaca tanpa reload.</p></div>`));
    room.scrollTo({top:room.scrollHeight});
  }

  async function openPostUrl(permalink){
    const post = await fetchPostHTML(permalink);
    currentPost = post;
    room.innerHTML = ''; // stream single-source
    const rd = renderReader(post);
    room.appendChild(rd);

    // Similar: cari lewat label pertama (kalau ada)
    const key = post.labels?.[0];
    if(key){
      const all = cache.posts || await fetchPosts(60);
      const sim = all.filter(p => p.url!==permalink && p.labels?.includes(key)).slice(0,3);
      const simFrag = renderSimilar(sim);
      if(simFrag){ room.appendChild(el(`<div class="bubble" data-role="system"><p>Similar</p></div>`)); room.appendChild(simFrag); }
    }

    fillRightPanel(post); // siapkan panel kanan
    room.scrollTo({top:0,behavior:'smooth'});
  }

  async function openPageUrl(permalink){
    // treat page as readercard
    return openPostUrl(permalink);
  }

  async function openLabel(label){
    const list = await fetchPosts(80, label);
    feed.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(p => frag.appendChild(renderPostcard(p)));
    feed.appendChild(frag);
    room.appendChild(el(`<div class="bubble" data-role="system"><p>Label: ${label}</p></div>`));
    room.scrollTo({top:room.scrollHeight});
  }

  /* --------------- SmartScroll --------------- */
  const smart = $('#smartScroll');
  let lastY = 0;
  function hideSmart(show){ if(!smart) return; show ? smart.removeAttribute('hidden') : smart.setAttribute('hidden','hidden'); }
  room?.addEventListener('scroll', ()=>{
    const y = room.scrollTop;
    hideSmart(y < lastY - 120);
    lastY = y;
  });
  smart?.addEventListener('click', ()=> room.scrollTo({top:room.scrollHeight,behavior:'smooth'}));

  /* --------------- Preferences (dockbar) --------------- */
  const PREFS = ['theme','density','bubble','motion','ground','bg','focus','ts'];
  function setPref(key, val){
    if(!PREFS.includes(key)) return;
    if(key==='ts'){ document.documentElement.style.setProperty('--ts', val); localStorage.setItem('ts', val); return; }
    body.setAttribute(`data-${key}`, val);
    localStorage.setItem(key, val);
  }
  function setTypeDelta(delta){
    const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts')||'1');
    const next = Math.max(.85, Math.min(1.25, cur + delta));
    setPref('ts', String(next));
  }
  function resetPrefs(){ PREFS.forEach(k=>localStorage.removeItem(k)); location.reload(); }
  function hydratePrefs(){
    PREFS.forEach(k=>{
      const v = localStorage.getItem(k);
      if(v) (k==='ts' ? document.documentElement.style.setProperty('--ts', v) : body.setAttribute(`data-${k}`, v));
    });
  }

  /* --------------- Boot --------------- */
  function bindTabsRight(){
    const tabs = $$('.rs-tab'); const panes = $$('.rs-pane');
    tabs.forEach(t => t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('is-active')); t.classList.add('is-active');
      panes.forEach(p=>p.classList.remove('is-active'));
      $('#rs-'+t.dataset.tab)?.classList.add('is-active');
    }));
  }

  function bindChatbar(){
    $('#chatForm')?.addEventListener('submit', e=>{
      e.preventDefault();
      const v = $('#chatInput')?.value?.trim(); if(!v) return;
      room.appendChild(el(`<div class="bubble" data-role="user"><p>${v}</p></div>`));
      $('#chatInput').value='';
      room.scrollTo({top:room.scrollHeight,behavior:'smooth'});
    });
  }

  // Global esc closing
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeAll(); });

  // Initialize
  hydratePrefs();
  bindChatbar();
  bindTabsRight();
  setPush(false,false);
  buildLabelsAndPages().catch(console.warn);
  openHome(); // boot scene
})();
