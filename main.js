/* ========= Gaga — main.js (stable hot-fix) ========= */
/* Tanpa library; mematuhi struktur HTML yang sudah ada. */

(() => {
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  /* ---- DOM refs ---- */
  const shell   = $('#shell');
  const room    = $('#roomchat');
  const left    = $('#sidebarLeft');
  const right   = $('#sidebarRight');
  const overlay = $('#overlay');
  const dock    = $('#dockbar');
  const smart   = $('#smartScroll');

  /* ---- Config dari HTML body ---- */
  const BLOG_BASE = document.body.getAttribute('data-blog') || location.origin;
  const FEED_BASE = BLOG_BASE.replace(/\/$/,'') + '/feeds';
  const POPCOUNT  = 4;   // jumlah Popular di home
  const FEATCOUNT = 4;   // jumlah Featured di home

  /* ---- State ---- */
  let currentPost = null;
  const scrollMem = new Map(); // key->y

  /* ========================= FEED HELPERS ========================= */

  function jsonp(url){
    return new Promise((res,rej)=>{
      const cb='gcb_'+(Date.now().toString(36))+'_'+(Math.random()*1e6|0);
      const s=document.createElement('script');
      window[cb]=(data)=>{ cleanup(); res(data); };
      function cleanup(){ delete window[cb]; s.remove(); }
      s.onerror=()=>{ cleanup(); rej(); };
      s.src = url + (url.includes('?')?'&':'?') + 'alt=json-in-script&callback=' + cb;
      document.head.appendChild(s);
    });
  }

  const strip = (html)=>{ const d=document.createElement('div'); d.innerHTML=html||''; return (d.textContent||d.innerText||'').trim(); };
  const normalize = (u)=>{ try{ const x=new URL(u, location.origin); x.hash=''; x.search=x.search.replace(/\?m=1\b/,''); return x.toString(); }catch{ return u } };
  const isPostURL  = (u)=>/\/\d{4}\/\d{2}\/.+\.html$/.test(new URL(u, location.origin).pathname);
  const isPageURL  = (u)=>/\/p\//.test(new URL(u, location.origin).pathname);
  const isLabelURL = (u)=>/\/search\/label\//.test(new URL(u, location.origin).pathname);

  function mapEntry(e){
    const url = e.link?.find(l=>l.rel==='alternate')?.href || '';
    const labels = (e.category||[]).map(c=>c.term);
    const thumb = (e.media$thumbnail?.url || '').replace(/\/s\d+(-c)?\//,'/s400-c/');
    return {
      id: e.id?.$t || '',
      title: e.title?.$t || '',
      url, labels, thumb,
      summary: strip(e.summary?.$t||''),
      author: e.author?.[0]?.name?.$t || 'Admin',
      published: e.published?.$t
    };
  }

  async function fetchPosts(max=50,label=''){
    const path = label ? `/posts/summary/-/${encodeURIComponent(label)}` : `/posts/summary`;
    const url = FEED_BASE + path + `?max-results=${max}`;
    const data = await jsonp(url);
    return (data?.feed?.entry||[]).map(mapEntry);
  }

  async function fetchPages(){
    const url = FEED_BASE + `/pages/summary?max-results=100`;
    const data = await jsonp(url);
    return (data?.feed?.entry||[]).map(e=>({
      id: e.id?.$t,
      title: e.title?.$t,
      url: e.link?.find(l=>l.rel==='alternate')?.href
    }));
  }

  async function fetchPostHTML(permalink){
    const res = await fetch(permalink, { credentials:'same-origin' });
    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.querySelector('.post-body, [itemprop="articleBody"], article .post-entry, #post-body, .entry-content') || doc.querySelector('article') || doc.body;
    const title= doc.querySelector('h1.post-title, h1.entry-title, h1[itemprop="headline"], article h1')?.textContent?.trim() || document.title;
    const dateEl = doc.querySelector('time[datetime], .published, .post-timestamp');
    const date = dateEl?.getAttribute('datetime') || dateEl?.textContent || '';
    const labels = Array.from(doc.querySelectorAll('a[rel="tag"], .post-labels a')).map(a=>a.textContent.trim());
    return { title, date, html: body?.innerHTML || '', permalink, labels };
  }

  /* ========================= RENDERERS ========================= */

  function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
  const fmtDate = (s)=>{ try{ const d=new Date(s); return d.toLocaleDateString('id-ID',{year:'numeric',month:'2-digit',day:'2-digit'});}catch{return s||''} };

  function renderPostcard(p){
    const node = el(`
      <article class="postcard">
        <div class="row">
          <div class="thumb"><img loading="lazy" decoding="async" src="${p.thumb||''}" alt=""></div>
          <div>
            <h3 class="title"><a href="${p.url}" data-open="${p.url}" data-type="post">${p.title}</a></h3>
            <div class="meta">
              <span>👤 ${p.author||'Admin'}</span>
              <span>📅 ${fmtDate(p.published)}</span>
            </div>
            ${p.summary ? `<p class="excerpt">${p.summary}</p>`:''}
            <div class="actions">
              <a class="iconbtn" href="${p.url}" data-open="${p.url}" data-type="post"><svg width="18" height="18"><use href="#i-page"/></svg><span>Baca</span></a>
              <button class="iconbtn" data-copy="${p.url}"><svg width="18" height="18"><use href="#i-copy"/></svg><span>Salin</span></button>
              <button class="iconbtn" data-comment="${p.url}"><svg width="18" height="18"><use href="#i-comment"/></svg><span>Komentar</span></button>
              <button class="iconbtn" data-prop="${p.url}"><svg width="18" height="18"><use href="#i-info"/></svg><span>Properti</span></button>
            </div>
          </div>
        </div>
      </article>
    `);
    room.appendChild(node);
  }

  function renderReader(post){
    const node = el(`
      <article class="readercard">
        <header class="reader-head">
          <h1 class="reader-title">${post.title}</h1>
          <div class="reader-meta">
            ${post.date?`<span>📅 ${fmtDate(post.date)}</span>`:''}
            ${post.labels?.length?`<span>🏷️ ${post.labels.join(', ')}</span>`:''}
            <span><svg width="16" height="16"><use href="#i-link"/></svg> <a href="${post.permalink}" data-no-spa>Permalink</a></span>
          </div>
        </header>
        <section class="reader-body">${post.html}</section>
        <footer class="reader-actions">
          <button class="iconbtn" data-copy="${post.permalink}"><svg width="18" height="18"><use href="#i-copy"/></svg><span>Salin</span></button>
          <button class="iconbtn" data-comment="${post.permalink}"><svg width="18" height="18"><use href="#i-comment"/></svg><span>Komentar</span></button>
          <button class="iconbtn" data-prop="${post.permalink}"><svg width="18" height="18"><use href="#i-info"/></svg><span>Properti</span></button>
        </footer>
      </article>
    `);
    room.appendChild(node);
  }

  function fillRightPanel(post){
    const meta = $('#rs-meta'), toc = $('#rs-toc'), cmt = $('#rs-comments');
    if(meta){
      meta.innerHTML = `
        <h3>Meta</h3>
        <dl>
          <dt>Judul</dt><dd>${post.title||'-'}</dd>
          <dt>Tautan</dt><dd><a href="${post.permalink||location.href}" data-no-spa>${post.permalink||location.href}</a></dd>
          ${post.labels?.length?`<dt>Label</dt><dd>${post.labels.join(', ')}</dd>`:''}
          ${post.date?`<dt>Tanggal</dt><dd>${fmtDate(post.date)}</dd>`:''}
        </dl>`;
    }
    if(toc){
      const tmp = document.createElement('div'); tmp.innerHTML = post.html||'';
      const hs = $$('h1,h2,h3', tmp); hs.forEach((h,i)=>{ if(!h.id) h.id='h-'+(i+1) });
      toc.innerHTML = `<h3>Daftar Isi</h3>` + (hs.length? `<ol>${hs.map(h=>`<li><a href="${post.permalink}#${h.id}" data-no-spa>${h.textContent}</a></li>`).join('')}</ol>` : `<p>(Tidak ada heading)</p>`);
    }
    if(cmt){
      cmt.innerHTML = `
        <h3>Komentar</h3>
        <p>Placeholder OAuth 2.0 — komentar melalui formulir Blogger.</p>
        <div class="replybar">
          <input class="input-el" id="replyInput" placeholder="Tulis balasan…" />
          <button class="btn-infield" id="replySend" type="button"><svg width="18" height="18"><use href="#i-send"/></svg></button>
        </div>`;
      $('#replySend')?.addEventListener('click', ()=>{
        const v=$('#replyInput')?.value?.trim(); if(!v){ toast('Teks kosong'); return; }
        navigator.clipboard.writeText(v).catch(()=>{});
        window.open((post.permalink||location.href).replace(/#.*$/,'')+'#comment-form','_blank','noopener');
        toast('Teks disalin & formulir dibuka');
      });
    }
  }

  /* ========================= PANEL & OVERLAY ========================= */

  function setLeft(open){
    document.documentElement.style.setProperty('--sb-left', open? 'var(--side-left)':'0px');
    left?.classList.toggle('is-open', !!open);
    shell?.setAttribute('data-left', open? 'open':'closed');
  }
  function setRight(open){
    document.documentElement.style.setProperty('--sb-right', open? 'var(--side-right)':'0px');
    right?.classList.toggle('is-open', !!open);
    shell?.setAttribute('data-right', open? 'open':'closed');
  }
  function openOverlay(){ overlay.hidden=false; document.addEventListener('keydown', escClose, {once:true}); }
  function closeOverlay(){ overlay.hidden=true; }
  function escClose(e){ if(e.key==='Escape') closeAll(); }
  function closeAll(){ setLeft(false); setRight(false); dock?.setAttribute('hidden','hidden'); closeOverlay(); }

  /* ========================= STREAM UTILS ========================= */

  function bubble(kind, text){ const d=document.createElement('div'); d.className='bubble '+kind; d.textContent=text; room.appendChild(d); return d; }
  function toast(text){ bubble('system', text); room.scrollTo({top:room.scrollHeight,behavior:'smooth'}); }

  function rememberScroll(){ scrollMem.set(location.pathname+location.search, room.scrollTop); }
  function restoreScroll(){ const y=scrollMem.get(location.pathname+location.search); if(typeof y==='number') requestAnimationFrame(()=> room.scrollTo({top:y})) }

  /* ========================= HOME (stream tunggal) ========================= */

  async function renderHome(){
    rememberScroll();
    room.innerHTML='';
    toast('Halo! Selamat datang 👋');

    // Popular
    try{
      const pop = await fetchPosts(Math.max(POPCOUNT,8),'Popular');
      pop.slice(0,POPCOUNT).forEach(renderPostcard);
      toast('Itu tadi yang populer.');
    }catch{ /* ignore */ }

    // Featured
    try{
      const feat = await fetchPosts(Math.max(FEATCOUNT,8),'Featured');
      feat.slice(0,FEATCOUNT).forEach(renderPostcard);
      toast('Postingan pilihan selesai. Selamat membaca!');
    }catch{ /* ignore */ }

    restoreScroll();
  }

  /* ========================= OPENERS ========================= */

  async function openPostUrl(permalink){
    rememberScroll();
    const post = await fetchPostHTML(permalink);
    currentPost = post;
    room.innerHTML='';
    renderReader(post);

    // Similar (berdasarkan label pertama)
    const key = post.labels?.[0];
    if(key){
      try{
        const list = await fetchPosts(12, key);
        const sim = list.filter(p=>normalize(p.url)!==normalize(permalink)).slice(0,3);
        if(sim.length){ toast('Similar posts:'); sim.forEach(renderPostcard); }
      }catch{}
    }

    fillRightPanel(post);
    room.scrollTo({top:0,behavior:'smooth'});

    // SPA title + URL
    try{
      history.pushState({kind:'post', link:permalink}, '', permalink);
      document.title = post.title + ' | ' + (document.querySelector('meta[name="description"]')?.content || 'Gaga');
    }catch{}
  }

  async function openPageUrl(permalink){ return openPostUrl(permalink); }

  async function openLabel(label){
    rememberScroll();
    room.innerHTML='';
    toast('Label: '+label);
    const list = await fetchPosts(120, label);
    list.forEach(renderPostcard);
    toast('— Akhir daftar label —');
    restoreScroll();

    try{
      const url = BLOG_BASE.replace(/\/$/,'') + '/search/label/' + encodeURIComponent(label);
      history.pushState({kind:'label', label}, '', url);
    }catch{}
  }

  /* ========================= SIDEBAR LEFT (label 2-level) ========================= */

  async function buildLabelTree(){
    const posts = await fetchPosts(150);
    const map = {};
    posts.forEach(p => (p.labels||[]).forEach(lb => (map[lb] ||= []).push(p)));
    const list = $('#labelList');
    if(!list) return;
    list.innerHTML='';

    Object.keys(map).sort((a,b)=>a.localeCompare(b,'id',{sensitivity:'base'})).forEach(lb=>{
      const items = map[lb].slice().sort((a,b)=>a.title.localeCompare(b.title,'id',{sensitivity:'base'}));
      const det = el(`
        <details class="tree">
          <summary><svg width="18" height="18"><use href="#i-tag"/></svg><span class="name">${lb}</span><svg class="chev" width="18" height="18"><use href="#i-chevron"/></svg></summary>
          <div class="acc"></div>
        </details>
      `);
      const acc = det.querySelector('.acc');
      items.forEach(p=>{
        const a = el(`<a href="${p.url}" class="page-item"><svg width="18" height="18"><use href="#i-page"/></svg><span>${p.title}</span></a>`);
        a.addEventListener('click',(e)=>{ e.preventDefault(); openPostUrl(p.url); });
        acc.appendChild(a);
      });
      list.appendChild(det);
    });

    // Pages
    const pages = await fetchPages();
    const plist = $('#pageList'); if(plist){
      plist.innerHTML='';
      pages.forEach(pg=>{
        const a = el(`<a href="${pg.url}" class="page-item"><svg width="18" height="18"><use href="#i-page"/></svg><span>${pg.title}</span></a>`);
        a.addEventListener('click',(e)=>{ e.preventDefault(); openPageUrl(pg.url); });
        plist.appendChild(a);
      });
    }
  }

  /* ========================= DELEGATED ACTIONS ========================= */

  document.addEventListener('click', (e)=>{
    const a = e.target.closest('a[href]');
    if(a && !a.hasAttribute('data-no-spa')){
      const url = new URL(a.href, location.origin);
      if(url.origin===location.origin && (isPostURL(url) || isPageURL(url) || isLabelURL(url))){
        e.preventDefault();
        if(isPostURL(url)) openPostUrl(url);
        else if(isPageURL(url)) openPageUrl(url);
        else if(isLabelURL(url)) openLabel(decodeURIComponent(url.pathname.split('/label/')[1]||''));
        return;
      }
    }

    const btnOpen = e.target.closest('[data-open]');
    if(btnOpen){ e.preventDefault(); openPostUrl(btnOpen.getAttribute('data-open')); return; }

    const btnCopy = e.target.closest('[data-copy]');
    if(btnCopy){ navigator.clipboard.writeText(btnCopy.getAttribute('data-copy')||location.href).then(()=>toast('Tautan disalin.')).catch(()=>toast('Gagal menyalin.')); return; }

    const btnCmt = e.target.closest('[data-comment]');
    if(btnCmt){ window.open((btnCmt.getAttribute('data-comment')||location.href).replace(/#.*$/,'')+'#comment-form','_blank','noopener'); openRight('comments'); toast('Membuka komentar…'); return; }

    const btnProp = e.target.closest('[data-prop]');
    if(btnProp){ fillRightPanel(currentPost || {permalink:btnProp.getAttribute('data-prop')}); openRight('meta'); toast('Panel Properti dibuka'); return; }

    if(e.target.matches('[data-action="toggle-left"]')){
      const open = !left.classList.contains('is-open');
      setLeft(open); open ? openOverlay() : closeOverlay(); return;
    }
    if(e.target.matches('[data-action="toggle-right"]')){
      const open = !right.classList.contains('is-open');
      setRight(open); open ? openOverlay() : closeOverlay(); return;
    }
    if(e.target.matches('[data-action="toggle-dock"]')){
      const hidden = dock.hasAttribute('hidden'); hidden ? dock.removeAttribute('hidden') : dock.setAttribute('hidden','hidden');
      hidden ? openOverlay() : closeOverlay(); return;
    }
    if(e.target.matches('[data-action="close"]')){ closeAll(); return; }
  });

  function openRight(tab){
    setRight(true); openOverlay();
    $$('.rs-tab').forEach(t=>t.classList.toggle('is-active', t.dataset.tab===tab));
    $$('.rs-pane').forEach(p=>p.classList.toggle('is-active', p.id==='rs-'+tab));
  }

  /* Tabs di panel kanan */
  (function bindTabs(){
    const tabs=$$('.rs-tab'), panes=$$('.rs-pane');
    tabs.forEach(t=>t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('is-active')); t.classList.add('is-active');
      panes.forEach(p=>p.classList.remove('is-active')); $('#rs-'+t.dataset.tab)?.classList.add('is-active');
    }));
  })();

  /* SmartScroll */
  if(smart){
    let last=0; room.addEventListener('scroll',()=>{
      const y=room.scrollTop;
      if(y < last - 120) smart.removeAttribute('hidden'); else if(y > last) smart.setAttribute('hidden','hidden');
      last=y;
    });
    smart.addEventListener('click',()=> room.scrollTo({top:room.scrollHeight,behavior:'smooth'}));
  }

  /* Keyboard */
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape') closeAll();
    if((e.ctrlKey||e.metaKey) && e.key===','){ e.preventDefault(); $('[data-action="toggle-dock"]')?.click(); }
    if((e.ctrlKey||e.metaKey) && (e.key==='l'||e.key==='L')){ e.preventDefault(); $('[data-action="toggle-left"]')?.click(); }
    if((e.ctrlKey||e.metaKey) && (e.key==='r'||e.key==='R')){ e.preventDefault(); $('[data-action="toggle-right"]')?.click(); }
  });

  /* ========================= BOOT ========================= */
  async function boot(){
    setLeft(false); setRight(false); overlay.hidden=true;

    // build SidebarLeft (label 2-level + pages)
    buildLabelTree().catch(()=>{ /* no-op */ });

    // deep link
    if(isPostURL(location.href))      await openPostUrl(location.href);
    else if(isPageURL(location.href)) await openPageUrl(location.href);
    else if(isLabelURL(location.href))await openLabel(decodeURIComponent(location.pathname.split('/label/')[1]||''));
    else                               renderHome();

    // history
    window.addEventListener('popstate', ()=>{
      if(isPostURL(location.href)) openPostUrl(location.href);
      else if(isPageURL(location.href)) openPageUrl(location.href);
      else if(isLabelURL(location.href)) openLabel(decodeURIComponent(location.pathname.split('/label/')[1]||''));
      else renderHome();
    });
  }

  boot();
})();
