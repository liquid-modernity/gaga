/*! Gaga Blog — SPA-Feel Solid — Stabilizer v2025-09-03 */
(() => {'use strict';

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
  const left = $('#sidebarLeft');
  const right = $('#sidebarRight');
  const overlay = $('#overlay');
  const smart = $('#smartScroll');
  const chatForm = $('#chatForm');
  const chatInput = $('#chatInput');
  const filePicker = $('#filePicker');
  const rsTabs = $$('.rs-tab'), rsMeta = $('#rs-meta'), rsToc = $('#rs-toc'), rsComments = $('#rs-comments');
  const labelList = $('#labelList'), pageList = $('#pageList');
  const dockbar = $('#dockbar'), dockSheet = $('.dock__sheet', dockbar), dockScrim = $('.dock__scrim', dockbar);

  /* ===== State ===== */
  let posts = [];    // posts summary
  let pages = [];    // pages summary
  let active = null; // active entry
  let lastSent = '';

  /* ===== Layout safety (kolom push) ===== */
  document.documentElement.style.setProperty('--sb-left','0px');
  document.documentElement.style.setProperty('--sb-right','0px');
  const isMobile = () => matchMedia('(max-width:1024px)').matches;

  function applyPush(){
    if(isMobile()){ document.documentElement.style.setProperty('--sb-left','0px'); document.documentElement.style.setProperty('--sb-right','0px'); return; }
    const leftOpen  = !left.hasAttribute('hidden');
    const rightOpen = !right.hasAttribute('hidden');
    document.documentElement.style.setProperty('--sb-left',  leftOpen  ? 'var(--w-left)'  : '0px');
    document.documentElement.style.setProperty('--sb-right', rightOpen ? 'var(--w-right)' : '0px');
  }

  /* ===== Utils ===== */
  const strip = s => (s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const words = (t,n)=>{ const w=strip(t).split(/\s+/).filter(Boolean); return w.length<=n?w.join(' '):w.slice(0,n).join(' ')+'…'; };
  const readMin = html => Math.max(1, Math.round(strip(html).split(/\s+/).filter(Boolean).length/200));
  const fmt = iso => iso? new Date(iso).toLocaleDateString('id-ID'): '';
  const nearBottom = ()=> (room.scrollHeight - (room.scrollTop + room.clientHeight)) < 140;
  const idFrom = eId => ( /post-(\d+)/.exec(eId||'') || [] )[1] || '';

  /* ===== JSONP ===== */
  function jsonp(url, ok, err){
    const cb='cb'+Math.random().toString(36).slice(2);
    const s=document.createElement('script');
    window[cb]=d=>{ try{ ok&&ok(d); } finally{ delete window[cb]; s.remove(); } };
    s.onerror=()=>{ try{ err&&err(); } finally{ delete window[cb]; s.remove(); } };
    s.src = url + (url.includes('?')?'&':'?') + 'alt=json-in-script&callback=' + cb;
    document.body.appendChild(s);
  }
  const mapSummary = d => ((d.feed&&d.feed.entry)||[]).map(e=>{
    const link=(e.link||[]).find(l=>l.rel==='alternate');
    return {
      id:idFrom(e.id&&e.id.$t),
      title:e.title?.$t||'',
      url:link?link.href:'',
      published:e.published?.$t||'',
      author:e.author?.[0]?.name?.$t||'Admin',
      labels:(e.category||[]).map(c=>c.term),
      excerpt:e.summary?.$t||'',
      image:e.media$thumbnail?.url||''
    };
  });
  const getPostsSummary = (opt,cb)=> jsonp(BLOG + (opt?.label? `/feeds/posts/summary/-/${encodeURIComponent(opt.label)}?max-results=${opt.max||150}`
                                                           : `/feeds/posts/summary?max-results=${opt?.max||150}`) + (opt?.q?`&q=${encodeURIComponent(opt.q)}`:''), d=>cb(mapSummary(d)), ()=>cb([]));
  const getPostFullById = (id,cb)=> jsonp(`${BLOG}/feeds/posts/default/${id}`, d=>{
    const e=d.entry; if(!e) return cb(null);
    const link=(e.link||[]).find(l=>l.rel==='alternate');
    cb({ id, url:link?link.href:'', title:e.title?.$t||'', published:e.published?.$t||'', author:e.author?.[0]?.name?.$t||'Admin',
         labels:(e.category||[]).map(c=>c.term), content:e.content?.$t || e.summary?.$t || '' });
  }, ()=>cb(null));
  const getPagesSummary = cb => jsonp(`${BLOG}/feeds/pages/summary?max-results=200`, d=>cb(mapSummary(d)), ()=>cb([]));
  const getPageFullByUrl = (url,cb)=>{
    const hit = pages.find(p=>p.url===url); if(!hit) return cb(null);
    jsonp(`${BLOG}/feeds/pages/default/${hit.id}`, d=>{
      const e=d.entry; if(!e) return cb(null);
      const link=(e.link||[]).find(l=>l.rel==='alternate');
      cb({ id:hit.id, url:link?link.href:url, title:e.title?.$t||hit.title, published:e.published?.$t||'', author:'Admin', labels:[],
           content:e.content?.$t || e.summary?.$t || '' });
    }, ()=>cb(null));
  };
  const getPostFullByUrl = (url,cb)=>{
    const hit = posts.find(p=>p.url===url); if(hit) return getPostFullById(hit.id, cb);
    getPostsSummary({q:url,max:1}, list=> list[0]? getPostFullById(list[0].id, cb) : cb(null));
  };
  const getComments = (postId,cb)=> jsonp(`${BLOG}/feeds/${postId}/comments/default`, d=>{
    const items=(d.feed&&d.feed.entry)||[];
    cb(items.map(e=>({ name:e.author?.[0]?.name?.$t||'Anonim', time:e.published?.$t||'', text:e.content?.$t||e.summary?.$t||'' })));
  }, ()=>cb([]));

  /* ===== Render ===== */
  function bubble(html, tone='info', role='system'){
    const n=document.createElement('article');
    n.className=`bubble bubble--${tone}`; n.dataset.role=role; n.innerHTML=`<p>${html}</p>`;
    room.appendChild(n); afterAppend();
  }
  function postcard(p){
    const el=document.createElement('article'); el.className='postcard'; el.dataset.id=p.id; el.dataset.url=p.url;
    el.innerHTML=`
      <div class="thumb">${p.image?`<img alt="" src="${p.image}">`:''}</div>
      <div class="body">
        <h3 class="title"><a href="${p.url}" data-open="post">${p.title||'(Tanpa judul)'}</a></h3>
        <p class="excerpt">${words(p.excerpt,20)}</p>
        <div class="meta">
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-user"/></svg>${p.author||'Admin'}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-calendar"/></svg>${fmt(p.published)}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-clock"/></svg>${Math.max(1,readMin(p.excerpt))} menit</span>
        </div>
        <div class="actions">
          <button class="iconbtn act-copy"><svg width="18" height="18"><use xlink:href="#i-copy"/></svg><span>Salin</span></button>
          <button class="iconbtn act-comment"><svg width="18" height="18"><use xlink:href="#i-comment"/></svg><span>Komentar</span></button>
          <button class="iconbtn act-props"><svg width="18" height="18"><use xlink:href="#i-info"/></svg><span>Properti</span></button>
          <button class="iconbtn act-read"><svg width="18" height="18"><use xlink:href="#i-link"/></svg><span>Baca</span></button>
        </div>
      </div>`;
    return el;
  }
  function reader(e){
    const el=document.createElement('article'); el.className='readercard'; el.dataset.url=e.url; el.dataset.id=e.id;
    el.innerHTML=`
      <header class="reader-head">
        <h1 class="reader-title">${e.title||'(Tanpa judul)'}</h1>
        <div class="reader-meta">
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-user"/></svg>${e.author||'Admin'}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-calendar"/></svg>${fmt(e.published)}</span>
          <span class="m"><svg width="18" height="18"><use xlink:href="#i-clock"/></svg>${readMin(e.content)} menit baca</span>
        </div>
      </header>
      <section class="reader-body" id="readerArticle">${e.content||''}</section>
      <footer class="reader-actions">
        <button class="iconbtn act-copy"><svg width="18" height="18"><use xlink:href="#i-copy"/></svg><span>Salin tautan</span></button>
        <button class="iconbtn act-comment"><svg width="18" height="18"><use xlink:href="#i-comment"/></svg><span>Komentar</span></button>
        <button class="iconbtn act-props"><svg width="18" height="18"><use xlink:href="#i-info"/></svg><span>Properti</span></button>
      </footer>`;
    return el;
  }
  function group(title, list){
    const box=document.createElement('div'); box.className='group';
    box.innerHTML=`<h2 class="eyebrow">${title}</h2>`;
    list.forEach(p=> box.appendChild(postcard(p)));
    room.appendChild(box); afterAppend();
  }

  function buildTOC(entry){
    const host=$('#readerArticle'); if(!host) return rsToc.textContent='(Tidak ada konten)';
    const hs=[...host.querySelectorAll('h2,h3')];
    rsToc.innerHTML=''; if(!hs.length) return rsToc.textContent='(Tidak ada heading)';
    hs.forEach((h,i)=>{ const id=h.id||('sec-'+(i+1)); h.id=id; const a=document.createElement('div'); a.className='page-item'; a.textContent=h.textContent; rsToc.appendChild(a); });
  }

  /* ===== Sidebars & Dock ===== */
  function setHidden(el,yes){ if(yes){ el.setAttribute('hidden',''); el.setAttribute('aria-hidden','true'); } else { el.removeAttribute('hidden'); el.setAttribute('aria-hidden','false'); } }
  function trapFocus(box,on){
    const sel='a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    if(!on){ if(box.__trap){ document.removeEventListener('keydown',box.__trap); box.__trap=null; } return; }
    box.__trap=(e)=>{ if(e.key!=='Tab') return; const f=[...box.querySelectorAll(sel)].filter(n=>n.offsetParent!==null); if(!f.length) return;
      const first=f[0], last=f[f.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown',box.__trap);
  }
  function openLeft(){ left.classList.add('is-open'); setHidden(left,false); setHidden(overlay,false); applyPush(); trapFocus(left,true); }
  function closeLeft(){ left.classList.remove('is-open'); setHidden(left,true); setHidden(overlay,true); applyPush(); trapFocus(left,false); }
  function openRight(tab='meta', entry=active){
    right.classList.add('is-open'); setHidden(right,false); setHidden(overlay,false); applyPush(); trapFocus(right,true);
    rsTabs.forEach(b=> b.classList.toggle('is-active', b.dataset.tab===tab));
    $$('.rs-pane').forEach(p=> p.classList.toggle('is-active', p.id==='rs-'+tab));
    if(entry){ active=entry; rsMeta.innerHTML=`
      <div class="meta-row"><b>Judul:</b> ${entry.title}</div>
      <div class="meta-row"><b>Tanggal:</b> ${fmt(entry.published)}</div>
      <div class="meta-row"><b>Penulis:</b> ${entry.author||'Admin'}</div>
      <div class="meta-row"><b>Label:</b> ${(entry.labels||[]).join(', ')||'-'}</div>
      <div class="meta-row"><b>Link:</b> <a href="${entry.url}" rel="noopener" target="_blank">${entry.url}</a></div>`;
      buildTOC(entry);
      rsComments.innerHTML=`<div class="page-item">OAuth 2.0 placeholder — login untuk berkomentar.</div>`;
      getComments(entry.id, list=>{
        const holder=document.createElement('div'); holder.className='c-list';
        holder.innerHTML = list.map(c=>`<div class="comment-card"><div class="who">${c.name} • <span class="small">${new Date(c.time).toLocaleString()}</span></div><div class="text">${c.text}</div></div>`).join('') || '<p class="small">Belum ada komentar.</p>';
        rsComments.appendChild(holder);
      });
    }
  }
  function closeRight(){ right.classList.remove('is-open'); setHidden(right,true); setHidden(overlay,true); applyPush(); trapFocus(right,false); }
  overlay.addEventListener('click', ()=>{ closeLeft(); closeRight(); });

  /* ===== SidebarLeft contents ===== */
  function buildLabels(){
    const map=new Map();
    posts.forEach(p=> (p.labels||[]).forEach(l=> map.set(l,(map.get(l)||0)+1)));
    const labels=[...map.entries()].sort((a,b)=> a[0].localeCompare(b[0],'id'));

    labelList.innerHTML='';
    labels.forEach(([name,count],i)=>{
      const det=document.createElement('details'); det.className='label-item'; det.open = i<1; // buka yang pertama
      det.innerHTML=`
        <summary><svg width="18" height="18"><use xlink:href="#i-tag"/></svg><span>${name}</span>
          <svg width="18" height="18" style="margin-left:auto"><use xlink:href="#i-chevron"/></svg>
          <small class="count">${count}</small></summary>
        <div class="acc" data-label="${name}"><div class="page-item">Memuat…</div></div>`;
      labelList.appendChild(det);

      det.addEventListener('toggle', ()=>{
        if(!det.open) return;
        const acc=$('.acc',det); if(acc.dataset.loaded) return;
        getPostsSummary({label:name,max:200}, list=>{
          acc.innerHTML='';
          list.sort((a,b)=> (a.title||'').localeCompare(b.title||'','id')).forEach(p=>{
            const btn=document.createElement('button'); btn.className='page-item'; btn.dataset.url=p.url; btn.dataset.id=p.id;
            btn.innerHTML=`<svg width="16" height="16"><use xlink:href="#i-page"/></svg> ${p.title||'(Tanpa judul)'}`;
            btn.addEventListener('click', ()=>{ openPostUrl(p.url); if(isMobile()) closeLeft(); });
            acc.appendChild(btn);
          });
          acc.dataset.loaded='1';
        });
      });
      // trigger load untuk yang terbuka
      det.dispatchEvent(new Event('toggle'));
    });
  }
  function buildPages(){
    pageList.innerHTML='';
    pages.forEach(p=>{
      const btn=document.createElement('button'); btn.className='page-item'; btn.dataset.url=p.url;
      btn.innerHTML=`<svg width="16" height="16"><use xlink:href="#i-page"/></svg> ${p.title||'(Tanpa judul)'}`;
      btn.addEventListener('click', ()=>{ openPageUrl(p.url); if(isMobile()) closeLeft(); });
      pageList.appendChild(btn);
    });
  }

  /* ===== Stream actions ===== */
  function afterAppend(){ if(nearBottom()) room.scrollTop = room.scrollHeight; smart.hidden = nearBottom(); }
  function copy(url){ if(navigator.clipboard) navigator.clipboard.writeText(url||''); bubble(`Tautan disalin:<br><code>${url||''}</code>`,'success'); }

  room.addEventListener('click', e=>{
    const a=e.target.closest('[data-open="post"]'); if(a){ e.preventDefault(); return openPostUrl(a.getAttribute('href')); }
    const btn=e.target.closest('.iconbtn'); if(!btn) return;
    const holder=e.target.closest('[data-url]'); const url=holder?.dataset.url||''; const id=holder?.dataset.id||'';
    if(btn.classList.contains('act-copy')) copy(url||location.href);
    if(btn.classList.contains('act-comment')) openRight('comments', active || posts.find(p=>p.id===id));
    if(btn.classList.contains('act-props'))   openRight('meta',     active || posts.find(p=>p.id===id));
    if(btn.classList.contains('act-read')) { if(url) openPostUrl(url); }
  });

  /* ===== Routing (SPA-feel) ===== */
  function pushURL(u){ try{ history.pushState({url:u},'',u); }catch(_){} }
  window.addEventListener('popstate', ev=>{ const u=(ev.state&&ev.state.url)||location.pathname; route(u); });

  function route(u){
    if(u==='/' || u===BLOG.replace(/^https?:\/\/[^/]+/,'')) return renderHome();
    if(u.includes('/search/label/')){ const label=decodeURIComponent(u.split('/search/label/')[1]||'').replace(/\?.*$/,''); return renderLabel(label); }
    if(u.includes('/p/')) return openPageUrl(u);
    return openPostUrl(u); // as post
  }

  function renderHome(){
    room.innerHTML='';
    bubble('Selamat datang di Gaga 👋','info');
    getPostsSummary({label:'Popular',max:POP}, list=>{
      const use = list.length? list.slice(0,POP) : posts.slice(0,POP);
      group('Popular Post', use);
    });
    getPostsSummary({label:'Featured',max:FEAT}, list=>{
      const use = list.length? list.slice(0,FEAT) : posts.slice(0,FEAT);
      group('Featured Post', use);
    });
    bubble('Gunakan Label di kiri atau Dockbar (Ctrl+,) untuk mengatur tampilan.','success');
    pushURL('/');
  }
  function renderLabel(label){
    room.innerHTML=''; bubble(`Label: <b>${label}</b>`,'info');
    getPostsSummary({label,max:120}, list=>{
      if(!list.length) return bubble('Belum ada posting pada label ini.','warn');
      group('Postingan', list); pushURL(`/search/label/${encodeURIComponent(label)}`);
    });
  }
  function openPostUrl(url){
    bubble('Membuka posting…','info');
    getPostFullByUrl(url, entry=>{
      if(!entry) return bubble('Gagal membuka posting.','error');
      active=entry; room.appendChild(reader(entry)); afterAppend(); pushURL(entry.url);
      // similar post (berdasar label pertama)
      const tag=(entry.labels||[])[0];
      if(tag) getPostsSummary({label:tag,max:6}, list=>{
        const sim=list.filter(p=>p.url!==entry.url).slice(0,3);
        if(sim.length) group('Similar Post', sim);
      });
    });
  }
  function openPageUrl(url){
    bubble('Membuka halaman…','info');
    getPageFullByUrl(url, entry=>{
      if(!entry) return bubble('Gagal membuka halaman.','error');
      active=entry; room.appendChild(reader(entry)); afterAppend(); pushURL(entry.url);
    });
  }

  /* ===== Chatbar & shortcuts ===== */
  function addUserBubble(t){ const n=document.createElement('article'); n.className='bubble'; n.dataset.role='user'; n.innerHTML=`<p>${t}</p>`; room.appendChild(n); afterAppend(); }
  function doSend(){ const v=chatInput.value.trim(); if(!v) return; lastSent=v; addUserBubble(v); chatInput.value=''; chatInput.focus(); }
  function doClear(){ chatInput.value=''; chatInput.focus(); }
  chatForm.addEventListener('submit', e=>{ e.preventDefault(); doSend(); });
  chatForm.addEventListener('click', e=>{
    const b=e.target.closest('[data-action]'); if(!b) return;
    const act=b.dataset.action;
    if(act==='toggle-left') openLeft();
    if(act==='emoji'){ chatInput.setRangeText('😊', chatInput.selectionStart, chatInput.selectionEnd, 'end'); chatInput.focus(); }
    if(act==='attach') filePicker.click();
    if(act==='mic') bubble('🎤 Mic placeholder.','warn');
    if(act==='clear') doClear();
    if(act==='send'){ e.preventDefault(); doSend(); }
    if(act==='toggle-dock'){ dockbar.classList.add('open'); setHidden(dockbar,false); trapFocus(dockSheet,true); }
  });
  filePicker.addEventListener('change', ()=>{
    const fs=[...filePicker.files||[]]; if(!fs.length) return;
    bubble('📎 '+fs.map(f=>f.name).join(', '),'info'); filePicker.value='';
  });

  // Dockbar
  dockbar?.addEventListener('click', e=>{
    const t=e.target.closest('[data-action]'); if(!t) return;
    const act=t.dataset.action, val=t.dataset.value, delta=parseFloat(t.dataset.delta||'0');
    if(act==='close'){ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); return; }
    if(act==='theme'){ document.body.dataset.theme=val; try{localStorage.setItem('theme',val);}catch(_e){} return; }
    if(act==='tsize'){ const curr=+(getComputedStyle(document.documentElement).getPropertyValue('--ts'))||1; const next=Math.min(1.25,Math.max(0.85,+(curr+delta).toFixed(2))); document.documentElement.style.setProperty('--ts',next); return; }
    if(act==='density'){ document.body.dataset.density=val; return; }
    if(act==='bubble'){ document.body.dataset.bubble=val; return; }
    if(act==='motion'){ document.body.dataset.motion=val; return; }
    if(act==='ground'){ document.body.dataset.ground=val; return; }
    if(act==='bg'){ document.body.dataset.bg=val; return; }
    if(act==='focus'){ document.body.dataset.focus=val; return; }
    if(act==='reset'){ document.documentElement.style.setProperty('--ts',1); document.body.dataset.density='comfortable'; document.body.dataset.bubble='fit'; document.body.dataset.motion='on'; document.body.dataset.ground='on'; document.body.dataset.bg='static'; document.body.dataset.focus='off'; return; }
  });
  dockScrim?.addEventListener('click', ()=>{ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); });

  // Keyboard
  document.addEventListener('keydown', e=>{
    const mod=e.ctrlKey||e.metaKey;
    if(e.key==='Escape'){ if(!dockbar.hasAttribute('hidden')){ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); return; }
      if(!left.hasAttribute('hidden')){ closeLeft(); return; }
      if(!right.hasAttribute('hidden')){ closeRight(); return; }
    }
    if(e.key==='/' && !mod && document.activeElement!==chatInput){ e.preventDefault(); chatInput.focus(); chatInput.select(); }
    if(mod && e.key===','){ e.preventDefault(); dockbar.classList.add('open'); setHidden(dockbar,false); trapFocus(dockSheet,true); }
    if(mod && e.key.toLowerCase()==='l'){ e.preventDefault(); openLeft(); }
    if(mod && e.key.toLowerCase()==='r'){ e.preventDefault(); openRight('meta'); }
    if(document.activeElement===chatInput && e.key==='Enter'){ e.preventDefault(); doSend(); }
    if(document.activeElement===chatInput && e.key==='ArrowUp' && !chatInput.value){ chatInput.value=lastSent; chatInput.selectionStart=chatInput.selectionEnd=chatInput.value.length; }
  });

  // Smart scroll
  smart.addEventListener('click', ()=>{ room.scrollTop = room.scrollHeight; smart.hidden=true; });
  room.addEventListener('scroll', ()=> smart.hidden = nearBottom(), {passive:true});

  /* ===== Boot ===== */
  function boot(){
    applyPush();
    getPagesSummary(list=>{ pages=list; buildPages(); });
    getPostsSummary({max:150}, list=>{
      posts=list; buildLabels();
      if(location.pathname!=='/') route(location.pathname);
      else renderHome();
    });
  }
  window.addEventListener('DOMContentLoaded', boot);

  // Right tabs
  rsTabs.forEach(b=> b.addEventListener('click', ()=>{
    rsTabs.forEach(x=>x.classList.remove('is-active')); b.classList.add('is-active');
    $$('.rs-pane').forEach(p=> p.classList.toggle('is-active', p.id==='rs-'+b.dataset.tab));
  }));

  // Close buttons
  $('[data-action="toggle-right"]')?.addEventListener('click', closeRight);

})();
