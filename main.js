/*! Gaga Blog — SPA-Feel Solids — v2025-09-02 */
(() => {
  'use strict';

  /* ========= Config ========= */
  const BLOG = (window.GAGA_CONFIG && GAGA_CONFIG.blogBase) ||
               document.body.getAttribute('data-blog') ||
               'https://ratriatra.blogspot.com';
  const POP_COUNT  = +document.body.dataset.popcount || 3;
  const FEAT_COUNT = +document.body.dataset.featcount || 3;

  /* ========= DOM ========= */
  const $  = (s,c)=> (c||document).querySelector(s);
  const $$ = (s,c)=> Array.from((c||document).querySelectorAll(s));
  const room   = $('#roomchat');
  const left   = $('#sidebarLeft');
  const right  = $('#sidebarRight');
  const overlay= $('#overlay');
  const smart  = $('#smartScroll');
  const chatbar= $('#chatbar'); const chatForm = $('#chatForm'); const chatInput=$('#chatInput');
  const labelList = $('#labelList'); const pageList = $('#pageList');
  const rsTabs = $$('.rs-tab'), rsMeta = $('#rs-meta'), rsToc = $('#rs-toc'), rsComments = $('#rs-comments');

  /* ========= State ========= */
  let postsIndex = [];     // summary of posts for fast find
  let pagesIndex = [];     // pages summary
  let labelsAgg  = [];     // {name,count}
  let activeEntry = null;  // current post/page
  let ignorePop = false;

  /* ========= Utils ========= */
  const setHidden =(el,yes)=> yes? (el.setAttribute('hidden',''), el.setAttribute('aria-hidden','true'))
                                : (el.removeAttribute('hidden'), el.setAttribute('aria-hidden','false'));
  const stripHTML = s => (s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const trimWords = (t,n)=>{ const w=stripHTML(t).split(/\s+/).filter(Boolean); return w.length<=n? w.join(' '): w.slice(0,n).join(' ')+'…'; };
  const minutesRead = html => Math.max(1, Math.round(stripHTML(html).split(/\s+/).filter(Boolean).length/200));
  const fmtDate = iso => new Date(iso).toLocaleDateString('id-ID');
  const nearBottom = () => {
    const y = room.scrollTop + room.clientHeight;
    return (room.scrollHeight - y) < 140;
  };

  // init CSS vars to avoid collapsed grid
  document.documentElement.style.setProperty('--sb-left','0px');
  document.documentElement.style.setProperty('--sb-right','0px');

  /* ========= JSONP loader ========= */
  function loadJSONP(url, ok, err){
    const cb = 'cb' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    window[cb] = (data) => { try{ ok && ok(data); } finally { delete window[cb]; s.remove(); } };
    s.onerror = () => { try{ err && err(); } finally { delete window[cb]; s.remove(); } };
    s.src = url + (url.includes('?')?'&':'?') + 'alt=json-in-script&callback=' + cb;
    document.body.appendChild(s);
  }

  /* ========= Blogger Feeds ========= */
  const extractId = (eId) => ( /post-(\d+)/.exec(eId || '') || [] )[1] || '';
  function mapSummaryEntries(feed){
    const arr = (feed.feed && feed.feed.entry) || [];
    return arr.map(e=>{
      const link = (e.link||[]).find(l=>l.rel==='alternate');
      return {
        id: extractId(e.id && e.id.$t),
        title: (e.title && e.title.$t) || '',
        url: link ? link.href : '',
        published: (e.published && e.published.$t) || '',
        author: (e.author && e.author[0] && e.author[0].name && e.author[0].name.$t) || 'Admin',
        labels: (e.category||[]).map(c=>c.term),
        excerpt: (e.summary && e.summary.$t) || '',
        image: (e.media$thumbnail && e.media$thumbnail.url) || ''
      };
    });
  }
  function fetchPostsSummary({label='', q='', max=150}={}, cb){
    let u = BLOG + (label ? `/feeds/posts/summary/-/${encodeURIComponent(label)}?max-results=${max}`
                           : `/feeds/posts/summary?max-results=${max}`);
    if(q) u += '&q=' + encodeURIComponent(q);
    loadJSONP(u, data => cb(mapSummaryEntries(data)), ()=>cb([]));
  }
  function fetchPostFullByUrl(url, cb){
    // Get by path -> summary to find id -> full by id
    const hit = postsIndex.find(p=>p.url===url);
    if(hit) return fetchPostFullById(hit.id, cb);
    // fallback: query
    fetchPostsSummary({q:url,max:1}, arr => {
      if(arr[0]) fetchPostFullById(arr[0].id, cb); else cb(null);
    });
  }
  function fetchPostFullById(id, cb){
    const u = `${BLOG}/feeds/posts/default/${id}`;
    loadJSONP(u, data=>{
      const e = (data.entry)||null; if(!e) return cb(null);
      const link = (e.link||[]).find(l=>l.rel==='alternate');
      const content = (e.content && e.content.$t) || (e.summary && e.summary.$t) || '';
      cb({
        id, url: link?link.href:'', title: e.title.$t || '',
        published: e.published.$t || '', author: (e.author&&e.author[0].name.$t)||'Admin',
        labels: (e.category||[]).map(c=>c.term), content
      });
    }, ()=>cb(null));
  }
  function fetchPagesSummary(cb){
    const u = `${BLOG}/feeds/pages/summary?max-results=200`;
    loadJSONP(u, data => cb(mapSummaryEntries(data)), ()=>cb([]));
  }
  function fetchPageFullByUrl(url, cb){
    const hit = pagesIndex.find(p=>p.url===url);
    if(!hit){ cb(null); return; }
    const u = `${BLOG}/feeds/pages/default/${hit.id}`;
    loadJSONP(u, data=>{
      const e = (data.entry)||null; if(!e) return cb(null);
      const link = (e.link||[]).find(l=>l.rel==='alternate');
      const content = (e.content && e.content.$t) || (e.summary && e.summary.$t) || '';
      cb({
        id: hit.id, url: link?link.href:hit.url, title: e.title.$t || hit.title,
        published: e.published?.$t || '', author: hit.author || 'Admin',
        labels: [], content
      });
    }, ()=>cb(null));
  }

  /* ========= Render: Bubbles ========= */
  function addBubble(html, tone='info', role='system'){
    const b = document.createElement('div');
    b.className = `bubble bubble--${tone}`; b.dataset.role = role;
    b.innerHTML = `<p>${html}</p>`;
    room.appendChild(b); afterAppend();
    return b;
  }

  /* ========= Render: Postcard (for groups) ========= */
  function postcardNode(p){
    const el = document.createElement('article');
    el.className = 'postcard'; el.dataset.id = p.id; el.dataset.url = p.url;
    el.innerHTML = `
      <div class="thumb">${p.image?`<img alt="" src="${p.image}">`:''}</div>
      <div class="body">
        <h3 class="title"><a class="post-link" href="${p.url}" data-nav="post">${p.title||'(Tanpa judul)'}</a></h3>
        <p class="excerpt">${trimWords(p.excerpt||'', 20)}</p>
        <div class="meta">
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-user"/></svg>${p.author||'Admin'}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-calendar"/></svg>${p.published?fmtDate(p.published):''}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-clock"/></svg>${Math.max(1, minutesRead(p.excerpt))} menit</span>
        </div>
      </div>
      <div class="actions">
        <button class="iconbtn act-copy"><svg width="18" height="18"><use xlink:href="#i-copy"/></svg><span>Salin</span></button>
        <button class="iconbtn act-comment"><svg width="18" height="18"><use xlink:href="#i-comment"/></svg><span>Komentar</span></button>
        <button class="iconbtn act-props"><svg width="18" height="18"><use xlink:href="#i-info"/></svg><span>Properti</span></button>
        <button class="iconbtn act-read"><svg width="18" height="18"><use xlink:href="#i-link"/></svg><span>Baca</span></button>
      </div>`;
    return el;
  }
  function renderGroup(title, list){
    const wrapper = document.createElement('div'); wrapper.className='group';
    wrapper.innerHTML = `<h2 class="eyebrow">${title}</h2>`;
    list.forEach(p => wrapper.appendChild(postcardNode(p)));
    room.appendChild(wrapper); afterAppend();
  }

  /* ========= Render: Readercard ========= */
  function readercardNode(entry){
    const el = document.createElement('article');
    el.className='readercard'; el.dataset.id = entry.id; el.dataset.url = entry.url;
    const time = minutesRead(entry.content||'');
    el.innerHTML = `
      <header class="reader-head">
        <h1 class="reader-title">${entry.title||'(Tanpa judul)'}</h1>
        <div class="reader-meta">
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-user"/></svg>${entry.author||'Admin'}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-calendar"/></svg>${entry.published?fmtDate(entry.published):''}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-clock"/></svg>${time} menit baca</span>
        </div>
      </header>
      <section class="reader-body">${entry.content||''}</section>
      <footer class="reader-actions">
        <button class="iconbtn act-copy"><svg width="18" height="18"><use xlink:href="#i-copy"/></svg><span>Salin tautan</span></button>
        <button class="iconbtn act-comment"><svg width="18" height="18"><use xlink:href="#i-comment"/></svg><span>Komentar</span></button>
        <button class="iconbtn act-props"><svg width="18" height="18"><use xlink:href="#i-info"/></svg><span>Properti</span></button>
      </footer>
    `;
    return el;
  }

  /* ========= Sidebar build ========= */
  function buildLabels(){
    // Aggregate from postsIndex
    const map = new Map();
    postsIndex.forEach(p => (p.labels||[]).forEach(l => map.set(l, (map.get(l)||0)+1)));
    labelsAgg = Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0]));

    labelList.innerHTML = '';
    labelsAgg.forEach(([name,count])=>{
      const det = document.createElement('details'); det.className='label-item';
      det.innerHTML = `
        <summary>
          <svg width="18" height="18"><use xlink:href="#i-tag"/></svg>
          <span>${name}</span>
          <svg width="18" height="18" style="margin-left:auto"><use xlink:href="#i-chevron"/></svg>
          <small class="count">${count}</small>
        </summary>
        <div class="acc" data-label="${name}">
          <div class="page-item" data-action="label-load">Memuat…</div>
        </div>`;
      labelList.appendChild(det);

      det.addEventListener('toggle', () => {
        if(!det.open) return;
        const acc = det.querySelector('.acc'); if(acc.dataset.loaded) return;
        fetchPostsSummary({label:name,max:200}, list=>{
          const sorted = list.slice().sort((x,y)=> x.title.localeCompare(y.title));
          acc.innerHTML = '';
          sorted.forEach(p=>{
            const a = document.createElement('button');
            a.className='page-item'; a.dataset.nav='post'; a.dataset.url=p.url;
            a.innerHTML = `<svg width="16" height="16"><use xlink:href="#i-page"/></svg><span>${p.title||'(Tanpa judul)'}</span>`;
            acc.appendChild(a);
          });
          acc.dataset.loaded='1';
        });
      });
    });
  }
  function buildPages(){
    pageList.innerHTML='';
    pagesIndex.forEach(p=>{
      const btn = document.createElement('button');
      btn.className='page-item'; btn.dataset.nav='page'; btn.dataset.url=p.url;
      btn.innerHTML = `<svg width="16" height="16"><use xlink:href="#i-page"/></svg><span>${p.title||'(Tanpa judul)'}</span>`;
      pageList.appendChild(btn);
    });
  }

  /* ========= Right Panel ========= */
  function openRight(tab='meta', entry=null){
    right.classList.add('is-open'); setHidden(right,false); setHidden(overlay,false);
    document.documentElement.style.setProperty('--sb-right', getComputedStyle(right).width);
    if(entry) activeEntry = entry;

    rsTabs.forEach(b=> b.classList.toggle('is-active', b.dataset.tab===tab));
    $$('.rs-pane', right).forEach(p=> p.classList.toggle('is-active', p.id==='rs-'+tab));

    if(entry){
      if(tab==='meta'){
        rsMeta.innerHTML = `
          <div class="meta-list">
            <div class="meta-row"><svg width="18" height="18"><use xlink:href="#i-info"/></svg><div>${entry.title}</div></div>
            <div class="meta-row"><svg width="18" height="18"><use xlink:href="#i-calendar"/></svg><div>${entry.published?fmtDate(entry.published):''}</div></div>
            <div class="meta-row"><svg width="18" height="18"><use xlink:href="#i-user"/></svg><div>${entry.author||'Admin'}</div></div>
            <div class="meta-row"><svg width="18" height="18"><use xlink:href="#i-tag"/></svg><div>${(entry.labels||[]).join(', ')||'-'}</div></div>
            <div class="meta-row"><svg width="18" height="18"><use xlink:href="#i-link"/></svg><div><a href="${entry.url}" target="_blank" rel="noopener">${entry.url}</a></div></div>
          </div>`;
      } else if(tab==='toc'){
        const tmp = document.createElement('div'); tmp.innerHTML = entry.content||'';
        const heads = $$('h2, h3', tmp); rsToc.innerHTML='';
        heads.forEach(h=>{
          const li = document.createElement('div'); li.className='page-item';
          li.textContent = stripHTML(h.textContent||h.innerHTML); rsToc.appendChild(li);
        });
        if(!heads.length) rsToc.textContent='(Tidak ada heading)';
      } else if(tab==='comments'){
        rsComments.innerHTML = `
          <div class="comment-card"><div class="who">OAuth 2.0 Placeholder</div>
          <div>Masuk untuk menulis komentar.</div></div>`;
      }
    }
  }
  function closeRight(){ right.classList.remove('is-open'); setHidden(right,true); setHidden(overlay,true); document.documentElement.style.setProperty('--sb-right','0px'); }

  /* ========= Dock & Left ========= */
  function openLeft(){ left.classList.add('is-open'); setHidden(left,false); setHidden(overlay,false); document.documentElement.style.setProperty('--sb-left', getComputedStyle(left).width); }
  function closeLeft(){ left.classList.remove('is-open'); setHidden(left,true); setHidden(overlay,true); document.documentElement.style.setProperty('--sb-left','0px'); }

  overlay.addEventListener('click', ()=>{ closeLeft(); closeRight(); });

  /* ========= Navigation (SPA feel) ========= */
  function pushURL(url){ ignorePop = true; history.pushState({url}, '', url); setTimeout(()=>ignorePop=false,50); }
  window.addEventListener('popstate', (ev)=>{
    if(ignorePop) return;
    const url = (ev.state && ev.state.url) || location.pathname;
    routeTo(url);
  });

  async function routeTo(url){
    if(url==='/' || url === BLOG.replace(/^https?:\/\/[^/]+/,'/')){ renderHome(); return; }
    if(url.includes('/search/label/')){
      const label = decodeURIComponent(url.split('/search/label/')[1]||'').replace(/\?.*$/,'');
      renderLabelStream(label); return;
    }
    if(url.includes('/p/')){ openPage(url); return; }
    // default: post
    openPostByUrl(url);
  }

  /* ========= Actions in stream ========= */
  function afterAppend(){
    // keep stick-to-bottom experience
    if(nearBottom()) room.scrollTop = room.scrollHeight;
    smart.toggleAttribute('hidden', nearBottom());
  }
  function copyToClip(text){
    if(navigator.clipboard) navigator.clipboard.writeText(text||'');
    addBubble(text?`Tautan disalin:<br><code>${text}</code>`:'Tidak ada tautan.', 'success');
  }

  // Delegation for any button/link inside stream
  room.addEventListener('click', (e)=>{
    const a = e.target.closest('[data-nav]'); if(a){
      e.preventDefault();
      const url = a.dataset.url || a.getAttribute('href');
      if(a.dataset.nav==='post') openPostByUrl(url);
      else if(a.dataset.nav==='page') openPage(url);
      return;
    }
    const btn = e.target.closest('.iconbtn'); if(!btn) return;
    const holder = e.target.closest('[data-url]');
    const url = holder?.dataset.url || '';
    const id  = holder?.dataset.id  || '';
    if(btn.classList.contains('act-copy')) copyToClip(url);
    else if(btn.classList.contains('act-comment')) openRight('comments', activeEntry || postsIndex.find(p=>p.id===id));
    else if(btn.classList.contains('act-props'))   openRight('meta', activeEntry || postsIndex.find(p=>p.id===id));
    else if(btn.classList.contains('act-read')){
      if(url) openPostByUrl(url);
    }
  });

  /* ========= Render flows ========= */
  function renderHome(){
    room.innerHTML = '';
    addBubble('Selamat datang di Gaga 👋','info');
    // Popular
    fetchPostsSummary({label:'Popular',max:POP_COUNT}, pop=>{
      const use = (pop && pop.length)? pop.slice(0,POP_COUNT) : postsIndex.slice(0,POP_COUNT);
      renderGroup('Popular Post', use);
    });
    // Featured
    fetchPostsSummary({label:'Featured',max:FEAT_COUNT}, feat=>{
      const use = (feat && feat.length)? feat.slice(0,FEAT_COUNT) : postsIndex.slice(0,FEAT_COUNT);
      renderGroup('Featured Post', use);
    });
    addBubble('Gunakan Label di kiri atau Dockbar (Ctrl+,) untuk mengatur tampilan.','success');
    pushURL('/');
  }

  function renderLabelStream(label){
    room.innerHTML='';
    addBubble(`Label: <b>${label}</b>`, 'info');
    fetchPostsSummary({label, max:120}, list=>{
      if(!list.length){ addBubble('Belum ada posting pada label ini.','warn'); return; }
      renderGroup('Postingan', list);
      pushURL(`/search/label/${encodeURIComponent(label)}`);
    });
  }

  function openPostByUrl(url){
    addBubble('Membuka posting…','info');
    fetchPostFullByUrl(url, (entry)=>{
      if(!entry){ addBubble('Gagal membuka posting.','error'); return; }
      activeEntry = entry;
      const card = readercardNode(entry);
      room.appendChild(card);
      afterAppend();
      pushURL(entry.url);

      // similar post (by label)
      const tag = (entry.labels||[])[0];
      if(tag){
        fetchPostsSummary({label:tag,max:6}, list=>{
          const picks = list.filter(p=>p.url!==entry.url).slice(0,3);
          if(picks.length) renderGroup('Similar Post', picks);
        });
      }
    });
  }

  function openPage(url){
    addBubble('Membuka halaman…','info');
    fetchPageFullByUrl(url, (entry)=>{
      if(!entry){ addBubble('Gagal membuka halaman.','error'); return; }
      activeEntry = entry;
      room.appendChild(readercardNode(entry));
      afterAppend();
      pushURL(entry.url);
    });
  }

  /* ========= SmartScroll ========= */
  smart.addEventListener('click', ()=>{ room.scrollTop = room.scrollHeight; smart.hidden = true; });
  room.addEventListener('scroll', ()=> smart.toggleAttribute('hidden', nearBottom()), {passive:true});

  /* ========= Chatbar (simple demo) ========= */
  chatForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const v = chatInput.value.trim(); if(!v) return;
    const u = document.createElement('div'); u.className='bubble'; u.dataset.role='user'; u.innerHTML=`<p>${v}</p>`;
    room.appendChild(u); chatInput.value=''; afterAppend();
    setTimeout(()=> addBubble('Terima kasih! Gunakan label atau tombol Baca pada kartu.','success'), 100);
  });

  chatForm.addEventListener('click', (e)=>{
    const t = e.target.closest('[data-action]'); if(!t) return;
    const act = t.dataset.action;
    if(act==='toggle-left') openLeft();
    if(act==='toggle-dock') openDock();
    if(act==='clear'){ chatInput.value=''; chatInput.focus(); }
  });

  /* ========= Dock ========= */
  const dock = $('#dockbar'); const sheet = $('.dock__sheet', dock);
  function openDock(){ dock.classList.add('open'); setHidden(dock,false); setHidden(overlay,false); sheet.focus(); }
  function closeDock(){ dock.classList.remove('open'); setHidden(dock,true); setHidden(overlay,true); }
  dock.addEventListener('click', e=>{
    const a = e.target.closest('[data-action]'); if(!a) return;
    const act = a.dataset.action, val = a.dataset.value, d = a.dataset.delta;
    if(act==='close') closeDock();
    if(act==='theme'){ document.body.setAttribute('data-theme', val); }
    if(act==='density'){ document.body.setAttribute('data-density', val); }
    if(act==='bubble'){ document.body.setAttribute('data-bubble', val); }
    if(act==='bg'){ document.body.setAttribute('data-bg', val); }
    if(act==='focus'){ document.body.setAttribute('data-focus', val); }
    if(act==='tsize'){ const ts = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ts')||'1'); document.documentElement.style.setProperty('--ts', String(ts + parseFloat(d))); }
    if(act==='reset'){ document.documentElement.style.setProperty('--ts','1'); document.body.setAttribute('data-density','comfortable'); }
  });

  /* ========= Keyboard shortcuts ========= */
  document.addEventListener('keydown', (e)=>{
    if(e.key==='/' && document.activeElement!==chatInput){ e.preventDefault(); chatInput.focus(); }
    if((e.ctrlKey||e.metaKey) && e.key===','){ e.preventDefault(); openDock(); }
    if((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='l')){ e.preventDefault(); openLeft(); }
    if((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='r')){ e.preventDefault(); openRight('meta', activeEntry); }
    if(e.key==='Escape'){ closeLeft(); closeRight(); closeDock(); }
  });

  /* ========= Boot ========= */
  function boot(){
    // height for chatbar padding
    const h = chatbar ? chatbar.offsetHeight : 64;
    document.documentElement.style.setProperty('--chatbar-h', h+'px');

    // Index data
    fetchPostsSummary({max:150}, list => { postsIndex = list; buildLabels(); });
    fetchPagesSummary(list => { pagesIndex = list; buildPages(); });

    // Home stream
    renderHome();

    // Route current URL if not root
    if(location.pathname !== '/' && !location.pathname.match(/\/$/)) routeTo(location.pathname);
  }

  /* Right tabs switch */
  rsTabs.forEach(btn => btn.addEventListener('click', ()=>{
    rsTabs.forEach(b=> b.classList.remove('is-active')); btn.classList.add('is-active');
    $$('.rs-pane', right).forEach(p=> p.classList.toggle('is-active', p.id==='rs-'+btn.dataset.tab));
  }));

  // Sidebar triggers
  $$('.rs-tab, [data-action="toggle-right"]').forEach(n=> n.addEventListener('click', ()=> openRight('meta', activeEntry)));
  overlay.addEventListener('click', ()=>{ /* already handled */ });

  // SidebarLeft / Right close buttons
  $('[data-action="toggle-right"]').addEventListener?.('click', ()=> closeRight());

  // Left nav (pages/labels) SPA
  labelList.addEventListener('click', (e)=>{
    const a = e.target.closest('[data-nav="post"]'); if(a){ e.preventDefault(); openPostByUrl(a.dataset.url); }
  });
  pageList.addEventListener('click', (e)=>{
    const a = e.target.closest('[data-nav="page"]'); if(!a) return; e.preventDefault(); openPage(a.dataset.url);
  });

  // start
  window.addEventListener('load', boot);
})();
