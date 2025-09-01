/*! Gaga Blog — SPA-Feel Solid — v2025-09-03 */
(function(){'use strict';

  /* ===== Config ===== */
  const BLOG_BASE = (window.GAGA_CONFIG && window.GAGA_CONFIG.blogBase) ||
                    document.body.getAttribute('data-blog') ||
                    'https://ratriatra.blogspot.com';

  /* ===== DOM ===== */
  const $  = (s,c)=> (c||document).querySelector(s);
  const $$ = (s,c)=> Array.from((c||document).querySelectorAll(s));

  const feed = $('#feed'), room = $('#roomchat');
  const sidebarLeft  = $('#sidebarLeft');
  const sidebarRight = $('#sidebarRight');
  const overlay = $('#overlay');
  const rsTabs = $$('.rs-tab'), rsMeta = $('#rs-meta'), rsToc = $('#rs-toc'), rsComments = $('#rs-comments');
  const labelList = $('#labelList'), pageList = $('#pageList');
  const chatbar = $('#chatbar'), chatForm = $('#chatForm'), chatInput = $('#chatInput'), filePicker = $('#filePicker');
  const smartBtn = $('#smartScroll');
  const dockbar = $('#dockbar'), dockSheet = $('.dock__sheet', dockbar), dockScrim = $('.dock__scrim', dockbar);

            /* ===== Config (tambahan) ===== */
const POP_COUNT  = parseInt(document.body.dataset.popcount || '3', 10);
const FEAT_COUNT = parseInt(document.body.dataset.featcount || '3', 10);

  /* ===== State ===== */
  let postsIndex = [];     // summary index (id, url, title, labels, date, excerpt, image)
  let pagesIndex = [];     // pages (id, url, title)
  let activePost = null;
  let autoStickBottom = true;
  let lastSent = '';
  let feedScrollTop = 0;

  /* ===== Utilities ===== */
  const isMobile = ()=> matchMedia('(max-width:1024px)').matches;
  const setHidden = (el, yes)=>{ if(!el) return; if(yes){ el.setAttribute('hidden','hidden'); el.setAttribute('aria-hidden','true'); } else { el.removeAttribute('hidden'); el.setAttribute('aria-hidden','false'); } };
  const openOverlay = ()=> overlay && overlay.removeAttribute('hidden');
  const closeOverlay= ()=> overlay && overlay.setAttribute('hidden','hidden');

  function trapFocus(container,on){
    const sel='a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
    if(!on){ if(container.__trap){ document.removeEventListener('keydown',container.__trap); container.__trap=null; } return; }
    container.__trap=(e)=>{
      if(e.key!=='Tab') return;
      const list=Array.from(container.querySelectorAll(sel)).filter(n=>n.offsetParent!==null);
      if(!list.length) return;
      const first=list[0], last=list[list.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown',container.__trap);
    (container.querySelector(sel)||container).focus();
  }

  function measureChatbar(){
    const h = chatbar?chatbar.offsetHeight:64;
    document.documentElement.style.setProperty('--chatbar-h', h+'px');
  }
  const nearBottom = ()=> (room.scrollHeight - room.scrollTop - room.clientHeight) < 140;
  const updateSmart= ()=> smartBtn && smartBtn.toggleAttribute('hidden', nearBottom());
  function smartScroll(){ room.scrollTop = room.scrollHeight; updateSmart(); }

  const stripHTML = html => (html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const trimWords = (t,n)=>{ const w=stripHTML(t).split(' ').filter(Boolean); return w.length<=n? w.join(' '): w.slice(0,n).join(' ')+'…'; };
  const minutesRead = html => Math.max(1, Math.round(stripHTML(html).split(/\s+/).filter(Boolean).length/200));
  const extractPostId = entryId => ( /post-(\d+)/.exec(entryId||'') || [] )[1] || '';
  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString() : '';

  /* ===== Push layout (desktop) ===== */
  function applyPushLayout(){
    if(isMobile()){
      document.documentElement.style.setProperty('--sb-left','0px');
      document.documentElement.style.setProperty('--sb-right','0px');
      return;
    }
    const leftOpen  = !sidebarLeft.hasAttribute('hidden');
    const rightOpen = !sidebarRight.hasAttribute('hidden');
    document.documentElement.style.setProperty('--sb-left',  leftOpen  ? 'var(--w-left)'  : '0px');
    document.documentElement.style.setProperty('--sb-right', rightOpen ? 'var(--w-right)' : '0px');
  }

  /* ===== JSONP loader ===== */
  function loadJSONP(url, ok, err){
    const s=document.createElement('script');
    const cb='cb'+Math.random().toString(36).slice(2);
    window[cb]=data=>{ try{ ok&&ok(data); } finally{ delete window[cb]; s.remove(); } };
    s.onerror=()=>{ try{ err&&err(); } finally{ delete window[cb]; s.remove(); } };
    s.src = url + (url.includes('?')?'&':'?') + 'alt=json-in-script&callback=' + cb;
    document.body.appendChild(s);
  }

  /* ===== Blogger Feeds ===== */
  function fetchPostsSummary({label='', q='', max=300}={}, cb){
    max = Math.min(500, Math.max(1, +max||300));
    let u = BLOG_BASE + (label ? `/feeds/posts/summary/-/${encodeURIComponent(label)}?max-results=${max}`
                               : `/feeds/posts/summary?max-results=${max}`);
    if(q) u += '&q=' + encodeURIComponent(q);
    loadJSONP(u, data=>{
      const items=(data.feed && data.feed.entry)||[];
      const mapped=items.map(e=>{
        const link=(e.link||[]).find(l=>l.rel==='alternate');
        return {
          id: extractPostId(e.id && e.id.$t),
          title: e.title ? e.title.$t : '',
          url: link ? link.href : '',
          date: e.published ? e.published.$t : '',
          labels: (e.category||[]).map(c=>c.term),
          excerpt: e.summary ? e.summary.$t : '',
          image: (e.media$thumbnail && e.media$thumbnail.url) || ''
        };
      });
      cb && cb(mapped);
    }, ()=>cb && cb([]));
  }

  function fetchPostFull(postId, cb){
    loadJSONP(BLOG_BASE + '/feeds/posts/default/' + postId, data=>{
      const e = data.entry || {};
      const link=(e.link||[]).find(l=>l.rel==='alternate');
      cb && cb({
        id: postId,
        title: e.title?e.title.$t:'',
        url: link?link.href:'',
        date: e.published?e.published.$t:'',
        labels: (e.category||[]).map(c=>c.term),
        content: e.content?e.content.$t:'',
        image: (e.media$thumbnail && e.media$thumbnail.url) || ''
      });
    }, ()=>cb && cb(null));
  }

  function fetchPages(cb){
    loadJSONP(BLOG_BASE + '/feeds/pages/default', data=>{
      const items=(data.feed && data.feed.entry)||[];
      const mapped=items.map(e=>{
        const link=(e.link||[]).find(l=>l.rel==='alternate');
        return { id:(e.id&&e.id.$t)||'', title:(e.title&&e.title.$t)||'', url: link?link.href:'' };
      });
      cb && cb(mapped);
    }, ()=>cb && cb([]));
  }
  function fetchPageFull(pageId, cb){
    loadJSONP(BLOG_BASE + '/feeds/pages/default/' + pageId, data=>{
      const e=data.entry||{};
      const link=(e.link||[]).find(l=>l.rel==='alternate');
      cb && cb({
        id:pageId, title:(e.title&&e.title.$t)||'',
        url: link?link.href:'', date:(e.published&&e.published.$t)||'',
        content:(e.content&&e.content.$t)||''
      });
    }, ()=>cb && cb(null));
  }

  function fetchComments(postId, cb){
    loadJSONP(BLOG_BASE + '/feeds/' + postId + '/comments/default', data=>{
      const items=(data.feed && data.feed.entry)||[];
      const mapped = items.map(e=>{
        const who=(e.author&&e.author[0]&&e.author[0].name && e.author[0].name.$t)||'Anonim';
        const t=e.published?e.published.$t:''; 
        const txt=(e.content&&e.content.$t) || (e.summary&&e.summary.$t) || '';
        return { id:e.id.$t, name:who, time:t, text:txt };
      });
      cb && cb(mapped);
    }, ()=>cb && cb([]));
  }

  /* ===== Sidebars ===== */
  function toggleLeft(force){
    const show = typeof force==='boolean' ? force : sidebarLeft.hasAttribute('hidden');
    setHidden(sidebarLeft, !show);
    sidebarLeft.classList.toggle('is-open', show);
    if(isMobile()) (show?openOverlay():closeOverlay());
    trapFocus(sidebarLeft, show);
    applyPushLayout();
  }
  function toggleRight(force){
    const show = typeof force==='boolean' ? force : sidebarRight.hasAttribute('hidden');
    setHidden(sidebarRight, !show);
    sidebarRight.classList.toggle('is-open', show);
    if(isMobile()) (show?openOverlay():closeOverlay());
    trapFocus(sidebarRight, show);
    applyPushLayout();
  }
  applyPushLayout(); updateSmartGlobal();

  /* ===== Renderers ===== */
  function postcardNode(p){
    const mins=minutesRead(p.excerpt||'');
    const img=p.image || ('https://picsum.photos/seed/'+(p.id||'x')+'/320/240');
    const card=document.createElement('article');
    card.className='postcard';
    card.setAttribute('data-id',p.id);

    card.innerHTML =
      "<div class='thumb'><img src='"+img+"' alt='Gambar "+(p.title||"")+"' width='320' height='240' loading='lazy' decoding='async'/></div>"+
      "<div class='body'>"+
        "<h3 class='title'>"+(p.title||'Tanpa Judul')+"</h3>"+
        "<p class='excerpt'>"+trimWords(p.excerpt||'',20)+"</p>"+
        "<div class='meta'>"+
          "<span class='m'><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg> Admin</span>"+
          "<span class='m'><svg width='18' height='18'><use href='#i-calendar' xlink:href='#i-calendar'/></svg> "+fmtDate(p.date)+"</span>"+
          "<span class='m'><svg width='18' height='18'><use href='#i-clock' xlink:href='#i-clock'/></svg> "+mins+" menit</span>"+
          "<div class='actions' role='group' aria-label='Aksi'>"+
            "<button class='iconbtn act-copy'    title='Salin tautan'><svg width='18' height='18'><use href='#i-copy' xlink:href='#i-copy'/></svg><span>Salin</span></button>"+
            "<button class='iconbtn act-comment' title='Komentar'><svg width='18' height='18'><use href='#i-comment' xlink:href='#i-comment'/></svg><span>Komentar</span></button>"+
            "<button class='iconbtn act-props'   title='Properti'><svg width='18' height='18'><use href='#i-info' xlink:href='#i-info'/></svg><span>Properti</span></button>"+
            "<button class='iconbtn act-read'    title='Baca'><svg width='18' height='18'><use href='#i-link' xlink:href='#i-link'/></svg><span>Baca</span></button>"+
          "</div>"+
        "</div>"+
      "</div>";

    $('.act-copy',card).addEventListener('click',()=>{ if(navigator.clipboard){ navigator.clipboard.writeText(p.url||''); } });
    $('.act-comment',card).addEventListener('click',()=> openRight('comments',p));
    $('.act-props',card).addEventListener('click',()=> openRight('meta',p));
    $('.act-read',card).addEventListener('click',()=> openPost(p));

    // klik judul = baca
    $('.title',card).addEventListener('click',()=> openPost(p));
    return card;
  }

  function renderFeed(list, title){
    feed.innerHTML='';
    if(title){
      const h=document.createElement('h2'); h.className='eyebrow'; h.textContent=title;
      feed.appendChild(h);
    }
    list.forEach(p=> feed.appendChild(postcardNode(p)));
  }

  function renderReaderById(postId){ fetchPostFull(postId, full=>{ if(full) renderReader(full); }); }

  function renderReader(p){
    activePost=p;
    $$('.readercard', room).forEach(n=>n.remove());

    const mins=minutesRead(p.content||p.excerpt||'');
    const labels=(p.labels||[]).join(', ');

    const art=document.createElement('article');
    art.className='readercard';
    art.innerHTML =
      "<header class='reader-head'><h1 class='title'>"+p.title+"</h1>"+
      "<div class='reader-meta'>"+
        "<span><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg> Admin</span>"+
        "<span><svg width='18' height='18'><use href='#i-calendar' xlink:href='#i-calendar'/></svg> "+fmtDate(p.date)+"</span>"+
        "<span><svg width='18' height='18'><use href='#i-clock' xlink:href='#i-clock'/></svg> "+mins+" menit baca</span>"+
        (labels? "<span><svg width='18' height='18'><use href='#i-tag' xlink:href='#i-tag'/></svg> "+labels+"</span>" : "")+
      "</div></header>"+
      "<div class='reader-body' id='readerArticle'>"+
        (p.image ? "<img src='"+p.image+"' alt='Gambar "+p.title+"' width='768' height='480' loading='lazy' decoding='async'/>" : "")+
        (p.content||p.excerpt||'')+
      "</div>"+
      "<div class='reader-actions' role='group' aria-label='Aksi artikel'>"+
        "<button class='iconbtn act-copy'><svg width='18' height='18'><use href='#i-copy' xlink:href='#i-copy'/></svg><span>Salin tautan</span></button>"+
        "<button class='iconbtn act-comment'><svg width='18' height='18'><use href='#i-comment' xlink:href='#i-comment'/></svg><span>Komentar</span></button>"+
        "<button class='iconbtn act-props'><svg width='18' height='18'><use href='#i-info' xlink:href='#i-info'/></svg><span>Properti</span></button>"+
      "</div>";

    room.appendChild(art);
    if(autoStickBottom) smartScroll(); else updateSmart();
    buildToc();

    $('.act-copy',art).addEventListener('click',()=>{ if(navigator.clipboard){ navigator.clipboard.writeText(p.url||location.href); } });
    $('.act-comment',art).addEventListener('click',()=> openRight('comments',p));
    $('.act-props',art).addEventListener('click',()=> openRight('meta',p));
  }

  function buildToc(){
    const host=$('#readerArticle');
    if(!host){ rsToc.innerHTML='<p class="small">Tidak ada konten.</p>'; return; }
    const hs=[...host.querySelectorAll('h2,h3')];
    rsToc.innerHTML='<div class="toc-list"></div>';
    const list=$('.toc-list',rsToc);
    hs.forEach((h,i)=>{
      const id=h.id||('sec-'+(i+1)); h.id=id;
      const a=document.createElement('a'); a.href='#'+id; a.textContent=h.textContent;
      if(h.tagName==='H3') a.style.paddingLeft='16px';
      list.appendChild(a);
    });
  }

  /* ===== Right panel ===== */
  function setRsTab(name){
    rsTabs.forEach(t=> t.classList.toggle('is-active', t.getAttribute('data-tab')===name));
    ['meta','toc','comments'].forEach(id=> $('#rs-'+id).classList.toggle('is-active', id===name));
  }
  function openRight(tab, p){
    if(p){
      activePost=p;
      rsMeta.innerHTML =
        "<div class='meta-list'>"+
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-link' xlink:href='#i-link'/></svg><a href='"+(p.url||"")+"' target='_blank' rel='noopener'>"+(p.url||"")+"</a></div>"+
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg><span>Admin</span></div>"+
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-calendar' xlink:href='#i-calendar'/></svg><span>"+(p.date?new Date(p.date).toLocaleString():'')+"</span></div>"+
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-tag' xlink:href='#i-tag'/></svg><span>"+(p.labels||[]).join(', ')+"</span></div>"+
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-clock' xlink:href='#i-clock'/></svg><span>"+minutesRead((p.content||p.excerpt||''))+" menit baca</span></div>"+
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-info' xlink:href='#i-info'/></svg><span>ID: "+(p.id||'')+"</span></div>"+
        "</div>";

      rsComments.innerHTML =
        "<div style='display:flex;gap:8px;align-items:center;margin-bottom:8px'>"+
          "<button id='btnOAuth' class='iconbtn'><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg><span>Masuk Google (OAuth)</span></button>"+
          "<a class='iconbtn' target='_blank' rel='noopener' href='"+(p.url||"#")+"#comments'><svg width='18' height='18'><use href='#i-link' xlink:href='#i-link'/></svg><span>Buka Halaman</span></a>"+
        "</div><div id='cList'></div>";
      const btnOauth=$('#btnOAuth'); if(btnOauth){ btnOauth.addEventListener('click', ()=> alert('OAuth placeholder: gunakan Google Identity Services untuk menulis komentar.')); }

      fetchComments(p.id, list=>{
        const holder=$('#cList'); if(!holder) return;
        holder.innerHTML = list.length ? list.map(c=>(
          "<div class='comment-card'><div class='who'>"+c.name+" • <span class='small'>"+(new Date(c.time).toLocaleString())+"</span></div><div class='text'>"+c.text+"</div></div>"
        )).join('') : "<p class='small'>Belum ada komentar.</p>";
      });
    }
    setRsTab(tab||'meta');
    toggleRight(true);
  }

  /* ===== SidebarLeft: label 2-level (accordion) ===== */
  function buildLabelsDropdown(allPosts){
    const counts = {};
    allPosts.forEach(p=> (p.labels||[]).forEach(l=> counts[l]=(counts[l]||0)+1 ));
    const labels = Object.keys(counts).sort((a,b)=> a.localeCompare(b,'id'));

    if(!labels.length){ labelList.innerHTML="<p class='small'>Belum ada label.</p>"; return; }

    labelList.innerHTML = labels.map((l,idx)=>(
      "<details class='label-item' data-label='"+l+"' id='lab-"+idx+"' open>"+
        "<summary><svg width='18' height='18'><use href='#i-tag' xlink:href='#i-tag'/></svg>"+
        "<span>"+l+"</span><span class='count small'>"+counts[l]+"</span></summary>"+
        "<div class='acc' aria-live='polite'></div>"+
      "</details>"
    )).join('');

    // Expand/collapse, isi drop di-load saat pertama kali open
    $$('.label-item', labelList).forEach(d=>{
      const loadList=()=>{
        const lab = d.getAttribute('data-label');
        const holder = $('.acc', d);
        if(holder && !holder.__loaded){
          holder.__loaded=true;
          holder.innerHTML = "<p class='small'>Memuat…</p>";
          fetchPostsSummary({label:lab, max:200}, list=>{
            list.sort((a,b)=> (a.title||'').localeCompare(b.title||'','id'));
            holder.innerHTML = list.map(p=>(
              "<button class='page-item post-link' data-id='"+p.id+"'><svg width='16' height='16'><use href='#i-page' xlink:href='#i-page'/></svg> "+(p.title||'Tanpa judul')+"</button>"
            )).join('');
            $$('.post-link', holder).forEach(btn=>{
              btn.addEventListener('click', ()=>{
                openPost(postsIndex.find(x=>x.id===btn.getAttribute('data-id')) || {id:btn.getAttribute('data-id'), url:''});
                if(isMobile()) toggleLeft(false);
              });
            });
          });
        }
      };
      // muat langsung satu label pertama (UX cepat)
      loadList();
      d.addEventListener('toggle', ()=>{ if(d.open) loadList(); });
    });
  }

  /* ===== Pages (SPA, no reload) ===== */
  function buildPagesList(pages){
    if(!pages || !pages.length){ pageList.innerHTML="<p class='small'>Belum ada halaman.</p>"; return; }
    pageList.innerHTML = pages.map(pg=>(
      "<button class='page-item page-open' data-id='"+pg.id+"'>"+
        "<svg width='16' height='16'><use href='#i-page' xlink:href='#i-page'/></svg> "+pg.title+
      "</button>"
    )).join('');
    $$('.page-open', pageList).forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id=btn.getAttribute('data-id'); const pg=pagesIndex.find(x=>x.id===id);
        openPage(pg||{id, url:''});
        if(isMobile()) toggleLeft(false);
      });
    });
  }

  /* ===== Chatbar (minimal) ===== */
  function addBubble(html,tone,role){
    const n=document.createElement('article');
    n.className='bubble'+(tone?(' bubble--'+tone):''); n.setAttribute('data-role',role||'system');
    n.innerHTML='<p>'+html+'</p>'; room.appendChild(n);
    if(autoStickBottom) smartScroll(); else updateSmart();
  }
  function doSend(){
    const t=chatInput.value.trim(); if(!t) return;
    lastSent=t; addBubble(t,'success','user'); chatInput.value=''; chatInput.focus();
  }
  function doClear(){ chatInput.value=''; chatInput.focus(); }
  function doAttach(){ filePicker.click(); }

  /* ===== Router helpers (SPA feel, permalink in address bar) ===== */
  function pushURL(url){ try{ history.pushState({},'',url); }catch(_e){} }

  function openPost(p){
    // Pastikan punya id; kalau dipanggil dari list label level-2, p bisa minim
    if(!p.id){
      const hit=postsIndex.find(x=>x.url===p.url);
      if(hit) p=hit;
    }
    feedScrollTop = feed.parentElement ? feed.parentElement.scrollTop : 0;
    if(p.url) pushURL(p.url); else pushURL('#/post/'+p.id);
    renderReaderById(p.id);
  }
  function openLabel(label){
    renderFeed(postsIndex.filter(p=> (p.labels||[]).includes(label)), 'Label: '+label);
    pushURL(BLOG_BASE.replace(/^https?:\/\/[^/]+/,'') + '/search/label/'+encodeURIComponent(label));
  }
  function openPage(pg){
    if(pg.url) pushURL(pg.url);
    fetchPageFull(pg.id, full=>{
      if(!full) return;
      activePost = { id: full.id, url: full.url, title: full.title, date: full.date, labels: ['Halaman'], content: full.content };
      renderReader(activePost);
      setRsTab('toc'); // biasanya halaman punya ToC pendek
    });
  }

  // Parse URL saat popstate atau boot → agar SPA feel tetap sinkron
  function handleLocation(){
    const path = location.pathname, hash=location.hash;
    // /search/label/<lab>
    const mLabel = /^\/search\/label\/([^/?#]+)/.exec(path);
    if(mLabel){ const lab=decodeURIComponent(mLabel[1]); openLabel(lab); return; }
    // /p/<page>.html
    if(/^\/p\//.test(path)){
      const pg = pagesIndex.find(x=> x.url.replace(/^https?:\/\/[^/]+/,'') === path );
      if(pg) openPage(pg); else fetchPages(p=>{ pagesIndex=p; const hit=p.find(x=>x.url.replace(/^https?:\/\/[^/]+/,'')===path); if(hit) openPage(hit); });
      return;
    }
    // /YYYY/MM/slug.html → post
    if(/^\/\d{4}\/\d{2}\//.test(path)){
      const hit = postsIndex.find(x=> x.url.replace(/^https?:\/\/[^/]+/,'') === path );
      if(hit) openPost(hit);
      else {
        // fallback: tampilkan feed (supaya tetap ada konten)
        renderFeed(postsIndex.slice(0,20));
      }
      return;
    }
    // hash fallback (#/post/id)
    const mHash = /#\/post\/(\d+)/.exec(hash);
    if(mHash){ renderReaderById(mHash[1]); return; }
    // default → Home boot
    renderHome();
  }

  /* ===== Home boot (popular & featured customizable) ===== */
function renderHome(){
  room.innerHTML = '';
  addBubble('Selamat datang di Gaga 👋','info','system');

  // Popular dari label 'Popular' bila ada, jika tidak → pos terbaru
  fetchPostsSummary({ label:'Popular', max: POP_COUNT }, list=>{
    const use = (list && list.length) ? list.slice(0, POP_COUNT) : postsIndex.slice(0, POP_COUNT);
    renderFeed(use, 'Popular Post');
    updateSmartGlobal();
  });

  // Featured dari label 'Featured'; fallback terbaru sesudah popular
  fetchPostsSummary({ label:'Featured', max: FEAT_COUNT }, list=>{
    const use = (list && list.length) ? list.slice(0, FEAT_COUNT) : postsIndex.slice(0, FEAT_COUNT);
    // sisipkan heading kedua tanpa menghapus feed popular
    const h = document.createElement('h2'); h.className='eyebrow'; h.textContent='Featured Post';
    feed.appendChild(h);
    use.forEach(p=> feed.appendChild(postcardNode(p)));
    updateSmartGlobal();
  });

  addBubble('Gunakan Label di kiri atau Dockbar (Ctrl+,) untuk mengatur tampilan.','success','system');
  pushURL('/'); // alamat root
}

 
  /* ===== Event delegation untuk semua kartu di #feed ===== */
feed.addEventListener('click', (e)=>{
  const btn = e.target.closest('.iconbtn'); if(!btn) return;
  const card = e.target.closest('.postcard'); if(!card) return;
  const id = card.getAttribute('data-id');
  const data = postsIndex.find(x=>x.id===id) || { id, url:'' };
  if(btn.classList.contains('act-copy')){
    if(navigator.clipboard) navigator.clipboard.writeText(data.url || location.href);
  } else if(btn.classList.contains('act-comment')){
    openRight('comments', data);
  } else if(btn.classList.contains('act-props')){
    openRight('meta', data);
  } else if(btn.classList.contains('act-read')){
    openPost(data);
  }
});

             /* ===== Events ===== */
            
  room.addEventListener('scroll', ()=>{ autoStickBottom = nearBottom(); updateSmart(); }, {passive:true});
  smartBtn.addEventListener('click', smartScroll);

  chatForm.addEventListener('click', (e)=>{
    const btn=e.target.closest('[data-action]'); if(!btn) return;
    const act=btn.getAttribute('data-action');
    if(act==='toggle-left') toggleLeft();
    else if(act==='emoji'){ chatInput.setRangeText('😊',chatInput.selectionStart,chatInput.selectionEnd,'end'); chatInput.focus(); }
    else if(act==='attach') doAttach();
    else if(act==='mic'){ addBubble('🎤 Mic placeholder.','warn','system'); }
    else if(act==='clear') doClear();
    else if(act==='send'){ e.preventDefault(); doSend(); }
    else if(act==='toggle-dock'){ setHidden(dockbar,false); dockbar.classList.add('open'); trapFocus(dockSheet,true); }
  });
  chatForm.addEventListener('submit', (e)=>{ e.preventDefault(); doSend(); });
  filePicker.addEventListener('change', ()=>{
    const fs=[].slice.call(filePicker.files||[]); if(!fs.length) return;
    addBubble('📎 '+fs.map(f=>f.name).join(', '),'info','system'); filePicker.value='';
  });

  dockbar.addEventListener('click', (e)=>{
    const b=e.target.closest('[data-action]'); if(!b) return;
    const act=b.getAttribute('data-action'), val=b.getAttribute('data-value'), delta=parseFloat(b.getAttribute('data-delta')||'0');
    if(act==='close'){ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); return; }
    if(act==='theme'){ document.body.dataset.theme=val; try{localStorage.setItem('theme',val);}catch(_e){} return; }
    if(act==='tsize'){ const curr=+(getComputedStyle(document.documentElement).getPropertyValue('--ts'))||1; const next=Math.min(1.25,Math.max(0.85,+(curr+delta).toFixed(2))); document.documentElement.style.setProperty('--ts',next); measureChatbar(); return; }
    if(act==='density'){ document.body.dataset.density=val; measureChatbar(); return; }
    if(act==='bubble'){ document.body.dataset.bubble=val; return; }
    if(act==='motion'){ document.body.dataset.motion=val; return; }
    if(act==='ground'){ document.body.dataset.ground=val; return; }
    if(act==='bg'){ document.body.dataset.bg=val; return; }
    if(act==='focus'){ document.body.dataset.focus=val; return; }
    if(act==='reset'){ document.documentElement.style.setProperty('--ts',1); document.body.dataset.density='comfortable'; document.body.dataset.bubble='fit'; document.body.dataset.motion='on'; document.body.dataset.ground='on'; document.body.dataset.bg='static'; document.body.dataset.focus='off'; measureChatbar(); return; }
  });
  dockScrim && dockScrim.addEventListener('click', ()=>{ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); });

  overlay.addEventListener('click', ()=>{ toggleLeft(false); toggleRight(false); });

  document.addEventListener('keydown', (e)=>{
    const mod=e.ctrlKey||e.metaKey;
    if(e.key==='Escape'){
      if(!dockbar.hasAttribute('hidden')){ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); return; }
      if(!sidebarLeft.hasAttribute('hidden')){ toggleLeft(false); return; }
      if(!sidebarRight.hasAttribute('hidden')){ toggleRight(false); return; }
      if(document.activeElement===chatInput && chatInput.value){ chatInput.value=''; return; }
    }
    if(e.key==='/' && !mod && document.activeElement!==chatInput){ e.preventDefault(); chatInput.focus(); chatInput.select(); return; }
    if(mod && e.key===','){ e.preventDefault(); setHidden(dockbar,false); dockbar.classList.add('open'); trapFocus(dockSheet,true); return; }
    if(mod && e.key.toLowerCase()==='l'){ e.preventDefault(); toggleLeft(); return; }
    if(mod && e.key.toLowerCase()==='r'){ e.preventDefault(); toggleRight(); return; }
    if(document.activeElement===chatInput && e.key==='Enter'){ e.preventDefault(); doSend(); return; }
    if(document.activeElement===chatInput && e.key==='ArrowUp' && !chatInput.value){ chatInput.value=lastSent; chatInput.selectionStart=chatInput.selectionEnd=chatInput.value.length; }
  });

  /* ===== SmartScroll: amati window, bukan hanya #roomchat ===== */
function nearBottomGlobal(){
  const y = window.scrollY + window.innerHeight;
  const doc = Math.max(
    document.body.scrollHeight, document.documentElement.scrollHeight,
    document.body.offsetHeight, document.documentElement.offsetHeight
  );
  return (doc - y) < 140;
}
function updateSmartGlobal(){ smartBtn && smartBtn.toggleAttribute('hidden', nearBottomGlobal()); }
function smartScrollGlobal(){ window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
            
  /* ===== Boot ===== */
  document.addEventListener('DOMContentLoaded', ()=>{
    // ukur chatbar (termasuk bila tinggi berubah)
    measureChatbar();
    try{
      const ro=new ResizeObserver(()=>measureChatbar());
      if(chatbar) ro.observe(chatbar);
    }catch(_e){}

    // Pages
    fetchPages(pgs=>{ pagesIndex=pgs; buildPagesList(pgs); });

    // Posts summary → Index + Labels
    fetchPostsSummary({max:300}, list=>{
      postsIndex=list.slice();
      buildLabelsDropdown(list);
      // Sinkronkan dengan URL saat ini (SPA feel dengan permalink)
      handleLocation();
    });

    // Smart scroll vis
    room.addEventListener('focusin', ()=> setTimeout(updateSmart,0));
    smartBtn.onclick = smartScrollGlobal;
    window.addEventListener('scroll', updateSmartGlobal, { passive:true });
    window.addEventListener('resize', updateSmartGlobal, { passive:true });;
    window.addEventListener('orientationchange', applyPushLayout);

    applyPushLayout();
    setTimeout(measureChatbar, 300);
  });

  window.addEventListener('popstate', handleLocation);

})();
