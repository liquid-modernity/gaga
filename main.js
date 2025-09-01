/*! Gaga Blog – Stream Fix – v2025-09-02 */
(() => {
  'use strict';

  /* ===== Config ===== */
  const BLOG = (window.GAGA_CONFIG && GAGA_CONFIG.blogBase) ||
               document.body.getAttribute('data-blog') ||
               'https://ratriatra.blogspot.com';
  const POP  = +document.body.dataset.popcount  || 3;
  const FEAT = +document.body.dataset.featcount || 3;

  /* ===== DOM ===== */
  const $  = (s,c)=> (c||document).querySelector(s);
  const $$ = (s,c)=> Array.from((c||document).querySelectorAll(s));
  const room = $('#roomchat');
  const left = $('#sidebarLeft'); const right = $('#sidebarRight'); const overlay = $('#overlay');
  const labelList = $('#labelList'); const pageList = $('#pageList');
  const rsTabs = $$('.rs-tab'); const rsMeta = $('#rs-meta'); const rsToc = $('#rs-toc'); const rsComments = $('#rs-comments');
  const smart = $('#smartScroll'); const chatForm = $('#chatForm'); const chatInput = $('#chatInput');

  /* ===== State ===== */
  let posts = [];    // summary posts
  let pages = [];    // summary pages
  let active = null; // active entry (post/page)
  let ignorePop = false;

  /* ===== Utils ===== */
  const setHidden = (el,yes)=> yes? (el.setAttribute('hidden',''), el.setAttribute('aria-hidden','true'))
                                  : (el.removeAttribute('hidden'), el.setAttribute('aria-hidden','false'));
  const strip = s => (s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const words = (t,n)=>{ const w=strip(t).split(/\s+/).filter(Boolean); return w.length<=n?w.join(' '):w.slice(0,n).join(' ')+'…'; };
  const readMin = html => Math.max(1, Math.round(strip(html).split(/\s+/).filter(Boolean).length/200));
  const fmt = iso => iso? new Date(iso).toLocaleDateString('id-ID'): '';
  const nearBottom = ()=> (room.scrollHeight - (room.scrollTop + room.clientHeight)) < 140;

  /* ===== JSONP ===== */
  function jsonp(url, ok, err){
    const id = 'cb'+Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    window[id] = d => { try{ ok&&ok(d) } finally { delete window[id]; s.remove(); } };
    s.onerror = () => { try{ err&&err() } finally { delete window[id]; s.remove(); } };
    s.src = url + (url.includes('?')?'&':'?') + 'alt=json-in-script&callback=' + id;
    document.body.appendChild(s);
  }
  const idFrom = eId => ( /post-(\d+)/.exec(eId||'') || [] )[1] || '';
  const mapSummary = data => ((data.feed && data.feed.entry) || []).map(e=>{
    const link=(e.link||[]).find(l=>l.rel==='alternate');
    return {
      id: idFrom(e.id && e.id.$t),
      title: e.title?.$t || '',
      url: link?link.href:'',
      published: e.published?.$t || '',
      author: e.author?.[0]?.name?.$t || 'Admin',
      labels: (e.category||[]).map(c=>c.term),
      excerpt: e.summary?.$t || '',
      image: e.media$thumbnail?.url || ''
    };
  });

  function getPostsSummary({label='', q='', max=150}={}, cb){
    let u = BLOG + (label? `/feeds/posts/summary/-/${encodeURIComponent(label)}?max-results=${max}`
                          : `/feeds/posts/summary?max-results=${max}`);
    if(q) u += '&q='+encodeURIComponent(q);
    jsonp(u, d=>cb(mapSummary(d)), ()=>cb([]));
  }
  function getPostFullById(id, cb){
    jsonp(`${BLOG}/feeds/posts/default/${id}`, d=>{
      const e=d.entry; if(!e){ cb(null); return; }
      const link=(e.link||[]).find(l=>l.rel==='alternate');
      cb({
        id, url: link?link.href:'', title: e.title?.$t || '',
        published: e.published?.$t || '', author: e.author?.[0]?.name?.$t || 'Admin',
        labels: (e.category||[]).map(c=>c.term),
        content: e.content?.$t || e.summary?.$t || ''
      });
    }, ()=>cb(null));
  }
  function getPostFullByUrl(url, cb){
    const hit = posts.find(p=>p.url===url);
    if(hit) return getPostFullById(hit.id, cb);
    getPostsSummary({q:url,max:1}, arr => arr[0]? getPostFullById(arr[0].id, cb) : cb(null));
  }
  function getPagesSummary(cb){
    jsonp(`${BLOG}/feeds/pages/summary?max-results=200`, d=>cb(mapSummary(d)), ()=>cb([]));
  }
  function getPageFullByUrl(url, cb){
    const hit = pages.find(p=>p.url===url); if(!hit){ cb(null); return; }
    jsonp(`${BLOG}/feeds/pages/default/${hit.id}`, d=>{
      const e=d.entry; if(!e){ cb(null); return; }
      const link=(e.link||[]).find(l=>l.rel==='alternate');
      cb({
        id: hit.id, url: link?link.href:hit.url, title:e.title?.$t || hit.title,
        published: e.published?.$t || '', author: hit.author || 'Admin',
        labels: [], content: e.content?.$t || e.summary?.$t || ''
      });
    }, ()=>cb(null));
  }

  /* ===== Render ===== */
  function bubble(html, tone='info', role='system'){
    const b=document.createElement('div'); b.className=`bubble bubble--${tone}`; b.dataset.role=role; b.innerHTML=`<p>${html}</p>`;
    room.appendChild(b); afterAppend(); return b;
  }
  function postcard(p){
    const el=document.createElement('article'); el.className='postcard'; el.dataset.url=p.url; el.dataset.id=p.id;
    el.innerHTML=`
      <div class="thumb">${p.image?`<img alt="" src="${p.image}">`:''}</div>
      <div class="body">
        <h3 class="title"><a href="${p.url}" data-nav="post" class="post-link">${p.title||'(Tanpa judul)'}</a></h3>
        <p class="excerpt">${words(p.excerpt,20)}</p>
        <div class="meta">
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-user"/></svg>${p.author||'Admin'}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-calendar"/></svg>${fmt(p.published)}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-clock"/></svg>${Math.max(1,readMin(p.excerpt))} menit</span>
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
  function reader(entry){
    const el=document.createElement('article'); el.className='readercard'; el.dataset.url=entry.url; el.dataset.id=entry.id;
    el.innerHTML=`
      <header class="reader-head">
        <h1 class="reader-title">${entry.title||'(Tanpa judul)'}</h1>
        <div class="reader-meta">
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-user"/></svg>${entry.author||'Admin'}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-calendar"/></svg>${fmt(entry.published)}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-clock"/></svg>${readMin(entry.content)} menit baca</span>
        </div>
      </header>
      <section class="reader-body">${entry.content||''}</section>
      <footer class="reader-actions">
        <button class="iconbtn act-copy"><svg width="18" height="18"><use xlink:href="#i-copy"/></svg><span>Salin tautan</span></button>
        <button class="iconbtn act-comment"><svg width="18" height="18"><use xlink:href="#i-comment"/></svg><span>Komentar</span></button>
        <button class="iconbtn act-props"><svg width="18" height="18"><use xlink:href="#i-info"/></svg><span>Properti</span></button>
      </footer>`;
    return el;
  }
  function group(title,list){
    const box=document.createElement('div'); box.className='group';
    box.innerHTML=`<h2 class="eyebrow">${title}</h2>`;
    list.forEach(p=> box.appendChild(postcard(p)));
    room.appendChild(box); afterAppend();
  }

  /* ===== Sidebar builders (2 level) ===== */
  function buildLabels(){
    const map=new Map();
    posts.forEach(p => (p.labels||[]).forEach(l => map.set(l,(map.get(l)||0)+1)));
    const agg=[...map.entries()].sort((a,b)=> a[0].localeCompare(b[0],'id'));

    labelList.innerHTML='';
    agg.forEach(([name,count])=>{
      const det=document.createElement('details'); det.className='label-item';
      det.innerHTML=`
        <summary>
          <svg width="18" height="18"><use xlink:href="#i-tag"/></svg>
          <span>${name}</span>
          <svg width="18" height="18" style="margin-left:auto"><use xlink:href="#i-chevron"/></svg>
          <small class="count">${count}</small>
        </summary>
        <div class="acc" data-label="${name}">
          <div class="page-item">Memuat…</div>
        </div>`;
      labelList.appendChild(det);
      det.addEventListener('toggle', ()=>{
        if(!det.open) return;
        const acc=det.querySelector('.acc'); if(acc.dataset.loaded) return;
        getPostsSummary({label:name,max:200}, list=>{
          acc.innerHTML='';
          list.sort((a,b)=> a.title.localeCompare(b.title,'id')).forEach(p=>{
            const btn=document.createElement('button'); btn.className='page-item'; btn.dataset.nav='post'; btn.dataset.url=p.url;
            btn.innerHTML=`<svg width="16" height="16"><use xlink:href="#i-page"/></svg><span>${p.title||'(Tanpa judul)'}</span>`;
            acc.appendChild(btn);
          });
          acc.dataset.loaded='1';
        });
      });
    });
  }
  function buildPages(){
    pageList.innerHTML='';
    pages.forEach(p=>{
      const btn=document.createElement('button'); btn.className='page-item'; btn.dataset.nav='page'; btn.dataset.url=p.url;
      btn.innerHTML=`<svg width="16" height="16"><use xlink:href="#i-page"/></svg><span>${p.title||'(Tanpa judul)'}</span>`;
      pageList.appendChild(btn);
    });
  }

  /* ===== Right panel ===== */
  function openRight(tab='meta', entry=active){
    right.classList.add('is-open'); setHidden(right,false); setHidden(overlay,false);
    document.documentElement.style.setProperty('--sb-right', getComputedStyle(right).width);
    if(entry) active=entry;

    rsTabs.forEach(b=> b.classList.toggle('is-active', b.dataset.tab===tab));
    $$('.rs-pane', right).forEach(p=> p.classList.toggle('is-active', p.id==='rs-'+tab));

    if(!entry) return;
    if(tab==='meta'){
      rsMeta.innerHTML = `
        <div class="meta-row"><b>Judul:</b> ${entry.title}</div>
        <div class="meta-row"><b>Tanggal:</b> ${fmt(entry.published)}</div>
        <div class="meta-row"><b>Penulis:</b> ${entry.author||'Admin'}</div>
        <div class="meta-row"><b>Label:</b> ${(entry.labels||[]).join(', ')||'-'}</div>
        <div class="meta-row"><b>Link:</b> <a href="${entry.url}" target="_blank" rel="noopener">${entry.url}</a></div>`;
    } else if(tab==='toc'){
      const tmp=document.createElement('div'); tmp.innerHTML=entry.content||'';
      const hs=$$('h2,h3', tmp); rsToc.innerHTML='';
      hs.forEach(h=>{ const d=document.createElement('div'); d.className='page-item'; d.textContent=(h.textContent||'').trim(); rsToc.appendChild(d); });
      if(!hs.length) rsToc.textContent='(Tidak ada heading)';
    } else if(tab==='comments'){
      rsComments.innerHTML = `<div class="page-item">OAuth 2.0 Placeholder — masuk untuk berkomentar.</div>`;
    }
  }
  function closeRight(){ right.classList.remove('is-open'); setHidden(right,true); setHidden(overlay,true); document.documentElement.style.setProperty('--sb-right','0px'); }
  function openLeft(){ left.classList.add('is-open'); setHidden(left,false); setHidden(overlay,false); document.documentElement.style.setProperty('--sb-left', getComputedStyle(left).width); }
  function closeLeft(){ left.classList.remove('is-open'); setHidden(left,true); setHidden(overlay,true); document.documentElement.style.setProperty('--sb-left','0px'); }

  overlay.addEventListener('click', ()=>{ closeLeft(); closeRight(); });

  /* ===== Stream helpers ===== */
  function afterAppend(){ if(nearBottom()) room.scrollTop = room.scrollHeight; smart.toggleAttribute('hidden', nearBottom()); }
  function copy(text){ if(navigator.clipboard) navigator.clipboard.writeText(text||''); bubble(`Tautan disalin:<br><code>${text||''}</code>`, 'success'); }

  /* ===== Stream actions (delegation) ===== */
  room.addEventListener('click', (e)=>{
    const nav = e.target.closest('[data-nav]'); if(nav){ e.preventDefault(); const url=nav.dataset.url || nav.getAttribute('href'); return nav.dataset.nav==='page'? openPage(url) : openPost(url); }
    const btn = e.target.closest('.iconbtn'); if(!btn) return;
    const holder = e.target.closest('[data-url]'); const url=holder?.dataset.url || ''; const id=holder?.dataset.id || '';
    if(btn.classList.contains('act-copy')) copy(url);
    if(btn.classList.contains('act-comment')) openRight('comments', active || posts.find(p=>p.id===id));
    if(btn.classList.contains('act-props'))   openRight('meta',     active || posts.find(p=>p.id===id));
    if(btn.classList.contains('act-read') && url) openPost(url);
  });

  /* ===== SPA-feel routing ===== */
  function pushURL(u){ ignorePop=true; history.pushState({url:u}, '', u); setTimeout(()=>ignorePop=false, 40); }
  window.addEventListener('popstate', (ev)=>{ if(ignorePop) return; const u=(ev.state&&ev.state.url)||location.pathname; route(u); });

  function route(u){
    if(u==='/' || u===BLOG.replace(/^https?:\/\/[^/]+/,'')) return renderHome();
    if(u.includes('/search/label/')){ const label=decodeURIComponent(u.split('/search/label/')[1]||'').replace(/\?.*$/,''); return renderLabel(label); }
    if(u.includes('/p/')) return openPage(u);
    return openPost(u);
  }

  /* ===== Flows ===== */
  function renderHome(){
    room.innerHTML='';
    bubble('Selamat datang di Gaga 👋','info');
    getPostsSummary({label:'Popular',max:POP}, list=>{
      const use=list.length? list.slice(0,POP): posts.slice(0,POP);
      group('Popular Post', use);
    });
    getPostsSummary({label:'Featured',max:FEAT}, list=>{
      const use=list.length? list.slice(0,FEAT): posts.slice(0,FEAT);
      group('Featured Post', use);
    });
    bubble('Gunakan Label di kiri atau Dockbar (Ctrl+,) untuk mengatur tampilan.','success');
    pushURL('/');
  }
  function renderLabel(label){
    room.innerHTML=''; bubble(`Label: <b>${label}</b>`, 'info');
    getPostsSummary({label,max:120}, list=>{
      if(!list.length) return bubble('Belum ada posting pada label ini.','warn');
      group('Postingan', list);
      pushURL(`/search/label/${encodeURIComponent(label)}`);
    });
  }
  function openPost(url){
    bubble('Membuka posting…','info');
    getPostFullByUrl(url, entry=>{
      if(!entry) return bubble('Gagal membuka posting.','error');
      active = entry; room.appendChild(reader(entry)); afterAppend(); pushURL(entry.url);
      const tag = (entry.labels||[])[0];
      if(tag) getPostsSummary({label:tag,max:6}, list=>{
        const sim=list.filter(p=>p.url!==entry.url).slice(0,3);
        if(sim.length) group('Similar Post', sim);
      });
    });
  }
  function openPage(url){
    bubble('Membuka halaman…','info');
    getPageFullByUrl(url, entry=>{
      if(!entry) return bubble('Gagal membuka halaman.','error');
      active = entry; room.appendChild(reader(entry)); afterAppend(); pushURL(entry.url);
    });
  }

  /* ===== Sidebar events ===== */
  labelList.addEventListener('click', e=>{
    const a=e.target.closest('[data-nav="post"]'); if(!a) return; e.preventDefault(); openPost(a.dataset.url);
  });
  pageList.addEventListener('click', e=>{
    const a=e.target.closest('[data-nav="page"]'); if(!a) return; e.preventDefault(); openPage(a.dataset.url);
  });

  /* ===== Chatbar (demo) ===== */
  chatForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const v=chatInput.value.trim(); if(!v) return;
    const b=document.createElement('div'); b.className='bubble'; b.dataset.role='user'; b.innerHTML=`<p>${v}</p>`;
    room.appendChild(b); chatInput.value=''; afterAppend();
  });
  chatForm.addEventListener('click', e=>{
    const t=e.target.closest('[data-action]'); if(!t) return;
    if(t.dataset.action==='toggle-left') openLeft();
    if(t.dataset.action==='toggle-dock') $('#dockbar')?.removeAttribute('hidden'); /* tetap pakai dock kamu */
    if(t.dataset.action==='clear'){ chatInput.value=''; chatInput.focus(); }
  });

  /* ===== Smart scroll ===== */
  smart.addEventListener('click', ()=>{ room.scrollTop = room.scrollHeight; smart.hidden = true; });
  room.addEventListener('scroll', ()=> smart.toggleAttribute('hidden', nearBottom()), {passive:true});

  /* ===== Boot ===== */
  function boot(){
    // pastikan kolom center penuh ketika kedua sidebar hidden
    document.documentElement.style.setProperty('--sb-left','0px');
    document.documentElement.style.setProperty('--sb-right','0px');

    getPostsSummary({max:150}, list=>{ posts=list; buildLabels(); });
    getPagesSummary(list=>{ pages=list; buildPages(); });

    // tampilkan home
    renderHome();

    // jika user masuk via permalink, route
    if(location.pathname !== '/' && !location.pathname.match(/\/$/)){
      route(location.pathname);
    }
  }
  window.addEventListener('DOMContentLoaded', boot);

  // panel kanan tabs
  rsTabs.forEach(b=> b.addEventListener('click', ()=>{
    rsTabs.forEach(x=>x.classList.remove('is-active')); b.classList.add('is-active');
    $$('.rs-pane', right).forEach(p=> p.classList.toggle('is-active', p.id==='rs-'+b.dataset.tab));
  }));

  // tombol tutup right
  $('[data-action="toggle-right"]')?.addEventListener('click', closeRight);
  overlay.addEventListener('click', ()=>{ /* close handled above */ });
})();
