/*!
 * GAGA main.js — v1
 * SPA-feel dasar: router, JSONP fetch, render Home/Label/Post, prefetch, copy/share, Sidebarright meta, SmartScroll
 * Tidak mengubah XML. Semua selector sesuai kerangka.
 */
(function(){
  'use strict';

  /* ========= Priority 0: Safe helpers ========= */
  const qs  = (sel,el=document)=>el.querySelector(sel);
  const qsa = (sel,el=document)=>Array.from(el.querySelectorAll(sel));
  const on  = (el,ev,fn,opt)=>el.addEventListener(ev,fn,opt||{passive:true});

  const state = {
    blogBase: document.body.dataset.blog || location.origin,
    popCount: +(document.body.dataset.popcount||4),
    featCount:+(document.body.dataset.featcount||2),
    cache: new Map(),            // in-memory
    lsKey: 'gaga:cache:v1',
    routeScroll: new Map(),      // per-URL scrollY
  };

  // restore LS cache (best-effort)
  try{
    const raw = localStorage.getItem(state.lsKey);
    if(raw){ state.cache = new Map(JSON.parse(raw)); }
  }catch(e){}

  function saveCache(){
    try{
      const arr = Array.from(state.cache.entries());
      localStorage.setItem(state.lsKey, JSON.stringify(arr));
    }catch(e){}
  }

  /* ========= Priority 1: URL helpers (normalize & detect) ========= */
  function normalizeLink(href){
    try{
      const u = new URL(href, state.blogBase);
      // strip tracking params
      ['utm_source','utm_medium','utm_campaign','m','spref'].forEach(k=>u.searchParams.delete(k));
      // Blogger mobile param m=1
      if(u.searchParams.has('m')) u.searchParams.delete('m');
      u.hash = ''; // SPA-feel tak pakai hash
      return u.toString();
    }catch(e){
      return href;
    }
  }

  function isSameOrigin(href){
    try{ return new URL(href, location.href).origin === location.origin; }catch(e){ return false; }
  }

  // Detect Blogger routes: post (/YYYY/MM/slug.html), page (/p/*.html), label (/search/label/Label)
  function detectRoute(urlStr){
    const u = new URL(urlStr);
    const p = u.pathname;
    if(p === '/' || p === '/index.html') return {type:'home'};
    if(/^\/\d{4}\/\d{2}\/.+\.html$/i.test(p)) return {type:'post', url:u.toString()};
    if(/^\/p\/.+\.html$/i.test(p)) return {type:'page', url:u.toString()};
    if(/^\/search\/label\/.+/i.test(p)) return {type:'label', label: decodeURIComponent(p.split('/search/label/')[1]||'').replace(/\/+$/,'')};
    return {type:'external', url:u.toString()};
  }

  /* ========= Priority 2: JSONP fetchers ========= */
  // JSONP helper
  function jsonp(url){
    return new Promise((resolve,reject)=>{
      const cb = 'gaga_cb_' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      const timeout = setTimeout(()=>{ cleanup(); reject(new Error('JSONP timeout')); }, 12000);
      function cleanup(){ try{ delete window[cb]; s.remove(); clearTimeout(timeout);}catch(e){} }
      window[cb] = (data)=>{ cleanup(); resolve(data); };
      s.src = url + (url.includes('?')?'&':'?') + 'callback=' + cb;
      s.onerror = ()=>{ cleanup(); reject(new Error('JSONP error')); };
      document.head.appendChild(s);
    });
  }

  // Cache wrapper (cache by URL)
  async function fetchJSONP(url){
    const key = 'J:'+url;
    if(state.cache.has(key)) return state.cache.get(key);
    const data = await jsonp(url);
    state.cache.set(key, data);
    saveCache();
    return data;
  }

  // Blogger feed builders
  const FEED = {
    // summary recent or by label
    postsSummary({label,max=10,start=1}={}){
      const base = `${state.blogBase.replace(/\/$/,'')}/feeds/posts/summary`;
      const params = [
        'alt=json-in-script',
        'orderby=published',
        `max-results=${max}`,
        `start-index=${start}`
      ];
      if(label) params.push('category=' + encodeURIComponent(label));
      return `${base}?${params.join('&')}`;
    },
    // full content by query (best-effort)
    searchFull({q,max=5}){
      const base = `${state.blogBase.replace(/\/$/,'')}/feeds/posts/default`;
      const params = ['alt=json-in-script', 'orderby=published', `q=${encodeURIComponent(q)}`, `max-results=${max}`];
      return `${base}?${params.join('&')}`;
    },
    // pages summary
    pagesSummary({max=10}={}){
      const base = `${state.blogBase.replace(/\/$/,'')}/feeds/pages/summary`;
      const params = ['alt=json-in-script', `max-results=${max}`];
      return `${base}?${params.join('&')}`;
    }
  };

  // Map feed entry → item
  function mapEntry(e){
    const title = e.title?.$t || '(Tanpa judul)';
    const published = e.published?.$t || e.updated?.$t || '';
    const author = e.author?.[0]?.name?.$t || 'Unknown';
    const link = (e.link||[]).find(l=>l.rel==='alternate')?.href || '';
    const labels = (e.category||[]).map(c=>c.term).filter(Boolean);
    let thumb = e['media$thumbnail']?.url || '';
    // fallback: first <img> in content
    if(!thumb && e.content?.$t){
      const m = e.content.$t.match(/<img[^>]+src=["']([^"']+)["']/i);
      if(m) thumb = m[1];
    }
    // summary snippet
    const summary = (e.summary?.$t||'').replace(/<[^>]+>/g,'').slice(0,180);
    // full content (if present)
    const contentHTML = e.content?.$t || '';
    const id = e.id?.$t || link || title;
    return { id, url:link, title, published, author, labels, thumb, summary, contentHTML };
  }

  /* ========= Priority 3: Sanitizer & content extractor ========= */
  function extractContentHTML(html){
    try{
      const allowTags = new Set(['P','H1','H2','H3','H4','UL','OL','LI','A','IMG','FIGURE','FIGCAPTION','BLOCKQUOTE','PRE','CODE','HR','STRONG','EM','BR','SPAN','TABLE','THEAD','TBODY','TR','TH','TD','VIDEO','SOURCE']);
      const allowAttrs = {
        'A': ['href','title','rel','target'],
        'IMG': ['src','alt','width','height','loading','decoding','fetchpriority'],
        'VIDEO':['src','controls','poster','width','height','preload','muted','playsinline','loop'],
        'SOURCE':['src','type'],
        'CODE': ['class'],
        'SPAN': ['class'],
        'PRE': ['class'],
        'TABLE':['border','cellpadding','cellspacing'],
        'TH':['colspan','rowspan'], 'TD':['colspan','rowspan'],
      };
      const doc = new DOMParser().parseFromString('<div>'+html+'</div>','text/html');
      const root = doc.body.firstElementChild;

      (function sanitize(node){
        const children = Array.from(node.childNodes);
        for(const n of children){
          if(n.nodeType===1){ // element
            if(!allowTags.has(n.tagName)){
              // unwrap allowed text
              n.replaceWith(...Array.from(n.childNodes));
              continue;
            }
            // scrub attrs
            const allowed = new Set(allowAttrs[n.tagName] || []);
            for(const a of Array.from(n.attributes)){
              const name = a.name.toLowerCase();
              if(name.startsWith('on')) { n.removeAttribute(a.name); continue; }
              if(!allowed.has(a.name)) n.removeAttribute(a.name);
            }
            // post-process
            if(n.tagName==='A'){
              const href = n.getAttribute('href')||'#';
              n.setAttribute('rel','noopener nofollow ugc');
              if(/^https?:\/\//i.test(href) && !isSameOrigin(href)) n.setAttribute('target','_blank');
            }
            if(n.tagName==='IMG'){
              n.setAttribute('loading','lazy');
              n.setAttribute('decoding','async');
              if(!n.getAttribute('width') || !n.getAttribute('height')){
                // best-effort: set square placeholder to guard CLS
                n.setAttribute('width','800'); n.setAttribute('height','450');
              }
            }
            sanitize(n);
          }else if(n.nodeType===8){ // comment
            n.remove();
          }
        }
      })(root);

      return root.innerHTML;
    }catch(e){
      return html; // fallback raw (better than blank)
    }
  }

  /* ========= Priority 4: Renderers ========= */
  const elFeed = qs('#feed');
  const elRoom = qs('#roomchat');
  const elRight= qs('#sidebarRight');
  const elSmart= qs('#smartScroll');

  function clearStream(){ if(elRoom) elRoom.innerHTML=''; }

  function bubble(text, role='system', cls=''){
    const div = document.createElement('div');
    div.className = 'bubble ' + cls;
    div.dataset.role = role;
    div.innerHTML = `<p>${text}</p>`;
    elRoom.appendChild(div);
    return div;
  }

  function renderPostcard(item){
    const a = document.createElement('article');
    a.className='postcard';
    a.dataset.id=item.id;
    a.innerHTML = `
      <div class="thumb ar-16-9">
        ${item.thumb ? `<img class="media" src="${item.thumb}" alt="Sampul ${escapeHTML(item.title)}" width="800" height="450" loading="lazy" decoding="async">` : ``}
      </div>
      <h3 id="t-${cssId(item.id)}"><a class="post-link" href="${item.url}">${escapeHTML(item.title)}</a></h3>
      <p>${escapeHTML(item.summary||'')}</p>
      <p class="meta">
        <span>Oleh <strong>${escapeHTML(item.author||'')}</strong></span>
        ${item.published? `<span>${fmtDate(item.published)}</span>`:''}
        ${item.labels?.length? `<span>Label: ${item.labels.slice(0,3).map(l=>`<a href="${labelUrl(l)}">${escapeHTML(l)}</a>`).join(', ')}</span>`:''}
      </p>
      <div class="actions">
        <button class="iconbtn js-read" type="button" aria-label="Baca"><svg width="16" height="16"><use href="#i-open"/></svg><span>Baca</span></button>
        <button class="iconbtn js-save" type="button" aria-label="Simpan"><svg width="16" height="16"><use href="#i-star"/></svg><span>Simpan</span></button>
        <button class="iconbtn js-copy" type="button" aria-label="Salin tautan"><svg width="16" height="16"><use href="#i-copy"/></svg><span>Salin</span></button>
        <button class="iconbtn js-share" type="button" aria-label="Bagikan"><svg width="16" height="16"><use href="#i-share"/></svg><span>Bagikan</span></button>
        <button class="iconbtn js-comments" type="button" aria-label="Buka komentar"><svg width="16" height="16"><use href="#i-comment"/></svg><span>Komentar</span></button>
        <button class="iconbtn js-props" type="button" aria-label="Lihat properti"><svg width="16" height="16"><use href="#i-link"/></svg><span>Properti</span></button>
      </div>
    `;
    // actions
    on(a,'click', (e)=>{
      const t = e.target.closest('button, a');
      if(!t) return;
      if(t.classList.contains('js-read') || t.classList.contains('post-link')){
        e.preventDefault();
        navigateTo(item.url);
      }else if(t.classList.contains('js-copy')){
        e.preventDefault(); copyLink(item.url);
      }else if(t.classList.contains('js-share')){
        e.preventDefault(); shareLink(item);
      }else if(t.classList.contains('js-comments')){
        e.preventDefault(); openRight('comments');
      }else if(t.classList.contains('js-props')){
        e.preventDefault(); fillMeta(item); openRight('meta');
      }
    }, {passive:false});
    return a;
  }

  function renderReadercard(item){
    const art = document.createElement('article');
    art.className='readercard';
    art.dataset.id = item.id;
    const safeHTML = extractContentHTML(item.contentHTML||'');
    art.innerHTML = `
      <header>
        <h2>${escapeHTML(item.title||'(Tanpa judul)')}</h2>
        <p class="meta">
          <span>Oleh <strong>${escapeHTML(item.author||'')}</strong></span>
          ${item.published? `<span>${fmtDate(item.published)}</span>`:''}
          ${item.labels?.length? `<span>Label: ${item.labels.map(l=>`<a href="${labelUrl(l)}">${escapeHTML(l)}</a>`).join(', ')}</span>`:''}
        </p>
      </header>
      <section class="body">${safeHTML||'<p>(Konten kosong)</p>'}</section>
      <footer class="actions">
        <button class="iconbtn js-copy" type="button" aria-label="Salin tautan"><svg width="16" height="16"><use href="#i-copy"/></svg><span>Salin</span></button>
        <button class="iconbtn js-save" type="button" aria-label="Simpan"><svg width="16" height="16"><use href="#i-star"/></svg><span>Simpan</span></button>
        <button class="iconbtn js-share" type="button" aria-label="Bagikan"><svg width="16" height="16"><use href="#i-share"/></svg><span>Bagikan</span></button>
        <button class="iconbtn js-comments" type="button" aria-label="Buka komentar"><svg width="16" height="16"><use href="#i-comment"/></svg><span>Komentar</span></button>
        <button class="iconbtn js-props" type="button" aria-label="Lihat properti"><svg width="16" height="16"><use href="#i-link"/></svg><span>Properti</span></button>
      </footer>
    `;
    on(art,'click',(e)=>{
      const b = e.target.closest('button');
      if(!b) return;
      if(b.classList.contains('js-copy')) copyLink(item.url);
      else if(b.classList.contains('js-share')) shareLink(item);
      else if(b.classList.contains('js-comments')) openRight('comments');
      else if(b.classList.contains('js-props')) { fillMeta(item); openRight('meta'); }
    });
    // similar posts (best-effort by first label)
    const first = item.labels?.[0];
    if(first){
      fetchFeedList({label:first, max:6}).then(list=>{
        const candidates = list.filter(p=>p.url!==item.url).slice(0,3);
        if(candidates.length){
          const sec = document.createElement('section');
          sec.className='similar';
          sec.setAttribute('aria-label','Similar Post');
          sec.innerHTML = `<h3 class="eyebrow">Similar Post</h3>`;
          candidates.forEach(c=>{
            const s = document.createElement('article');
            s.className='similarcard';
            s.innerHTML = `<h4><a href="${c.url}" class="post-link">${escapeHTML(c.title)}</a></h4>
                           <p class="meta">${(c.labels||[])[0]||''} • ${fmtDate(c.published)}</p>`;
            sec.appendChild(s);
          });
          art.appendChild(sec);
        }
      }).catch(()=>{});
    }
    // fill Right meta
    fillMeta(item);
    return art;
  }

  /* ========= Priority 5: Data orchestration ========= */
  async function fetchFeedList({label,max=10,start=1}={}){
    const url = FEED.postsSummary({label,max,start});
    const data = await fetchJSONP(url);
    const entries = data?.feed?.entry || [];
    return entries.map(mapEntry);
  }

  async function fetchFullByUrl(urlStr){
    // try search by slug
    const u = new URL(urlStr);
    const slug = u.pathname.split('/').pop()?.replace(/\.html$/,'') || '';
    const data = await fetchJSONP(FEED.searchFull({q:slug, max:5}));
    const entries = data?.feed?.entry || [];
    const items = entries.map(mapEntry);
    // find exact match by alternate link
    const found = items.find(it=>normalizeLink(it.url)===normalizeLink(urlStr)) || items[0];
    if(!found) throw new Error('Post not found');
    return found;
  }

  /* ========= Priority 6: Router & navigation ========= */
  function preserveScroll(url){
    state.routeScroll.set(url, window.scrollY||document.documentElement.scrollTop||0);
  }
  function restoreScroll(url){
    const y = state.routeScroll.get(url)||0;
    window.scrollTo({top:y, behavior:'instant'});
  }

  async function routeTo(urlStr, opts={push:false}){
    const url = normalizeLink(urlStr);
    const kind = detectRoute(url);
    // save previous scroll
    preserveScroll(history.state?.url||location.href);

    clearStream();
    if(kind.type==='home'){
      renderHome();
    }else if(kind.type==='post' || kind.type==='page'){
      bubble('Memuat…');
      try{
        const item = await fetchFullByUrl(url);
        clearStream();
        elRoom.appendChild(renderReadercard(item));
        scrollToLatest();
      }catch(e){
        clearStream();
        bubble('Gagal memuat konten. Coba lagi nanti.','system','callout error');
      }
    }else if(kind.type==='label'){
      bubble(`Label: <strong>${escapeHTML(kind.label)}</strong>`);
      try{
        const list = await fetchFeedList({label:kind.label, max:12});
        if(!list.length) elRoom.appendChild(calloutInfo('Belum ada posting.'));
        list.forEach(p=>elRoom.appendChild(renderPostcard(p)));
        scrollToLatest();
      }catch(e){
        elRoom.appendChild(calloutError('Tidak dapat memuat label.'));
      }
    }else{
      // external → follow
      location.href = url;
      return;
    }

    if(opts.push){
      history.pushState({url},'',url);
    }else{
      history.replaceState({url},'',url);
    }
  }

  function navigateTo(href){
    const url = normalizeLink(href);
    const kind = detectRoute(url);
    if(kind.type==='external' || !isSameOrigin(url)) { location.href = url; return; }
    routeTo(url, {push:true});
  }

  on(window,'popstate', (e)=>{
    const url = e.state?.url || location.href;
    routeTo(url, {push:false});
    restoreScroll(url);
  });

  // Intercept clicks on anchors for SPA-feel
  on(document,'click',(e)=>{
    const a = e.target.closest('a');
    if(!a) return;
    const href = a.getAttribute('href');
    if(!href) return;
    const url = normalizeLink(href);
    if(!isSameOrigin(url)) return; // external
    const kind = detectRoute(url);
    if(kind.type==='home' || kind.type==='post' || kind.type==='page' || kind.type==='label'){
      e.preventDefault();
      navigateTo(url);
    }
  }, {passive:false});

  /* ========= Priority 7: Home renderer ========= */
  async function renderHome(){
    bubble('Halo! 👋 Selamat datang di Gaga.');
    // Popular: gunakan label "Popular" bila ada
    try{
      const popular = await fetchFeedList({label:'Popular', max:state.popCount});
      if(popular.length){
        elRoom.appendChild(sectionEyebrow('Popular'));
        popular.forEach(p=>elRoom.appendChild(renderPostcard(p)));
      }
    }catch(e){/* diam */}
    // Featured: gunakan label "Featured"
    try{
      const featured = await fetchFeedList({label:'Featured', max:state.featCount});
      if(featured.length){
        elRoom.appendChild(sectionEyebrow('Featured'));
        featured.forEach(p=>elRoom.appendChild(renderPostcard(p)));
      }
    }catch(e){/* diam */}
    bubble('Itu dulu dari kami. Selamat membaca! ✨');
    scrollToLatest();
  }

  /* ========= Priority 8: Right panel (Meta/ToC/Comments placeholder) ========= */
  function openRight(tab){
    // panel right selalu tampak di kerangka uji; pada medium ia di bawah → scroll ke sana
    if(tab) switchTab(tab);
    // scrollIntoView jika bukan desktop 3 kolom
    const w = window.innerWidth;
    if(w<1024){
      elRight?.scrollIntoView({behavior:'smooth', block:'start'});
    }
  }
  function switchTab(name){
    const tabs = qsa('.rs-tab', elRight);
    const panes= qsa('.rs-pane', elRight);
    tabs.forEach(t=>t.classList.toggle('is-active', t.dataset.tab===name));
    panes.forEach(p=>p.classList.toggle('is-active', p.id==='rs-'+name));
  }
  function fillMeta(item){
    const set = (sel, val)=>{ const el = qs(sel, elRight); if(el) el.textContent = val||'—'; };
    set('#m-title', item.title);
    set('#m-author', item.author);
    set('#m-date', item.published? fmtDate(item.published):'—');
    set('#m-labels', (item.labels||[]).join(', '));
    set('#m-link', item.url);
    const words = (stripHTML(item.contentHTML||'').trim().split(/\s+/).length)||0;
    set('#m-words', String(words));
    set('#m-read', '~' + Math.max(1, Math.ceil(words/200)) + ' min');
  }

  /* ========= Priority 9: Prefetch & SmartScroll & Utilities ========= */
  // Prefetch on hover/touch for post links
  on(document,'mouseover', (e)=>{
    const a = e.target.closest('a.post-link');
    if(!a) return;
    const url = normalizeLink(a.href);
    prefetchPost(url);
  });
  on(document,'touchstart', (e)=>{
    const a = e.target.closest('a.post-link');
    if(!a) return;
    const url = normalizeLink(a.href);
    prefetchPost(url);
  });
  let prefetching = new Set();
  function prefetchPost(url){
    if(prefetching.has(url)) return;
    prefetching.add(url);
    fetchFullByUrl(url).catch(()=>{}).finally(()=>prefetching.delete(url));
  }

  // SmartScroll: tampil bila tidak di bawah
  let smartVisible = false;
  on(window, 'scroll', smartTick, {passive:true});
  function smartTick(){
    if(!elSmart) return;
    const nearBottom = (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 240);
    if(!nearBottom && !smartVisible){ elSmart.hidden=false; smartVisible=true; }
    else if(nearBottom && smartVisible){ elSmart.hidden=true; smartVisible=false; }
  }
  on(elSmart,'click', (e)=>{ e.preventDefault(); scrollToLatest(); }, {passive:false});

  function scrollToLatest(){
    window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'});
  }

  // Copy & Share
  async function copyLink(url){
    try{
      await navigator.clipboard.writeText(url);
      elRoom.appendChild(calloutSuccess('Tautan disalin.'));
      scrollToLatest();
    }catch(e){
      elRoom.appendChild(calloutError('Gagal menyalin tautan.'));
      scrollToLatest();
    }
  }
  async function shareLink(item){
    const url = item.url, title=item.title;
    try{
      if(navigator.share){
        await navigator.share({title, url});
      }else{
        await navigator.clipboard.writeText(url);
        elRoom.appendChild(calloutInfo('Berbagi tidak didukung. Tautan disalin.'));
        scrollToLatest();
      }
    }catch(e){}
  }

  // Dockbar: minimal theme toggle (berdasar teks tombol)
  const dock = qs('#dockbar');
  if(dock){
    on(dock,'click',(e)=>{
      const b = e.target.closest('.tile,button');
      if(!b) return;
      const label = (b.textContent||'').trim().toLowerCase();
      if(label==='dark' || label==='light' || label==='glass'){
        setTheme(label);
      }else if(label==='reset'){
        resetPrefs();
      }else if(label.includes('ukuran teks')){
        // handled by range input
      }
    }, {passive:false});
    const tsize = qs('#tsize', dock);
    if(tsize){
      on(tsize,'input', ()=>{
        const val = parseFloat(tsize.value||'1');
        document.documentElement.style.setProperty('--ts', String(val));
        try{ localStorage.setItem('gaga:ts', String(val)); }catch(e){}
      }, {passive:true});
      // restore
      try{
        const ts = parseFloat(localStorage.getItem('gaga:ts')||'1'); 
        if(!isNaN(ts)) { tsize.value=String(ts); document.documentElement.style.setProperty('--ts', String(ts)); }
      }catch(e){}
    }
  }
  function setTheme(name){
    document.body.setAttribute('data-theme', name);
    document.documentElement.style.colorScheme = (name==='light'?'light':'dark');
    try{ localStorage.setItem('gaga:theme', name); }catch(e){}
  }
  function resetPrefs(){
    try{
      localStorage.removeItem('gaga:theme');
      localStorage.removeItem('gaga:ts');
    }catch(e){}
    setTheme('light');
    document.documentElement.style.removeProperty('--ts');
  }

  /* ========= Priority 10: Little helpers ========= */
  function cssId(s){ return String(s).replace(/[^\w-]+/g,'_').slice(0,64); }
  function escapeHTML(s){ return String(s).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  function stripHTML(s){ return String(s||'').replace(/<[^>]+>/g,' '); }
  function labelUrl(name){ return `${state.blogBase.replace(/\/$/,'')}/search/label/${encodeURIComponent(name)}`; }
  function fmtDate(iso){
    const d = new Date(iso); if(isNaN(d)) return '';
    return d.toLocaleDateString('id-ID',{year:'numeric',month:'short',day:'numeric'});
  }
  function sectionEyebrow(text){
    const p = document.createElement('p'); p.className='eyebrow'; p.textContent=text; return p;
  }
  function calloutInfo(msg){ const d=document.createElement('div'); d.className='callout info'; d.innerHTML=`<p>${msg}</p>`; return d; }
  function calloutError(msg){ const d=document.createElement('div'); d.className='callout error'; d.innerHTML=`<p>${msg}</p>`; return d; }
  function calloutSuccess(msg){ const d=document.createElement('div'); d.className='callout success'; d.innerHTML=`<p>${msg}</p>`; return d; }

  /* ========= Boot ========= */
  // Initial route
  routeTo(location.href, {push:false});
  smartTick(); // set initial smartscroll visibility
})();
