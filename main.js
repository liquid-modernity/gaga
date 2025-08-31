/*! Gaga Blog — JSONP Blogger Feed (no API key) — 2025-09-01 */
(function(){
  'use strict';

  /* ====== CONFIG ====== */
  var BLOG_BASE = (function(){
    try{
      return (window.GAGA_CONFIG && window.GAGA_CONFIG.blogBase) ||
             document.body.getAttribute('data-blog') ||
             'https://ratriatra.blogspot.com';
    }catch(e){ return 'https://ratriatra.blogspot.com'; }
  })();

  /* ====== DOM helpers ====== */
  var $  = function(s,c){ return (c||document).querySelector(s); };
  var $$ = function(s,c){ return Array.prototype.slice.call((c||document).querySelectorAll(s)); };
  var feed = $('#feed'), room = $('#roomchat');
  var labelList = $('#labelList'), pageList = $('#pageList');
  var sidebarLeft  = $('#sidebarLeft');
  var sidebarRight = $('#sidebarRight');
  var overlay = $('#overlay');
  var rsTabs = $$('.rs-tab'), rsMeta = $('#rs-meta'), rsToc = $('#rs-toc'), rsComments = $('#rs-comments');
  var smartBtn = $('#smartScroll');
  var chatbar = $('#chatbar'), chatForm = $('#chatForm'), chatInput = $('#chatInput'), filePicker = $('#filePicker');
  var dockbar = $('#dockbar'), dockSheet = $('.dock__sheet', dockbar), dockScrim = $('.dock__scrim', dockbar);
  var replyInput = $('#replyInput'), replySend = $('#replySend');

  /* ====== State ====== */
  var postsIndex = [];   // ringkas untuk feed & label index
  var pagesIndex = [];   // pages statis
  var activePost = null;
  var autoStickBottom = true;
  var lastSent = '';

  /* ====== Utils ====== */
  function setHidden(el, yes){
    if(!el) return;
    if(yes){ el.setAttribute('hidden','hidden'); el.setAttribute('aria-hidden','true'); }
    else   { el.removeAttribute('hidden'); el.setAttribute('aria-hidden','false'); }
  }
  function openOverlay(){ overlay && overlay.removeAttribute('hidden'); }
  function closeOverlay(){ overlay && overlay.setAttribute('hidden','hidden'); }
  function trapFocus(container, on){
    var focusableSel='a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
    var handler = container.__trapHandler;
    if(!on){ if(handler){ document.removeEventListener('keydown',handler); container.__trapHandler=null; } return; }
    container.__trapHandler = function(e){
      if(e.key!=='Tab') return;
      var list=[].slice.call(container.querySelectorAll(focusableSel)).filter(function(el){return el.offsetParent!==null;});
      if(!list.length) return;
      var first=list[0], last=list[list.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', container.__trapHandler);
    (container.querySelector(focusableSel)||container).focus();
  }
  function measureChatbar(){
    var h = chatbar ? chatbar.offsetHeight : 64;
    document.documentElement.style.setProperty('--chatbar-h', h + 'px');
  }
  function nearBottom(){ return (room.scrollHeight - room.scrollTop - room.clientHeight) < 140; }
  function updateSmart(){ smartBtn && smartBtn.toggleAttribute('hidden', nearBottom()); }
  function smartScroll(){ room.scrollTop = room.scrollHeight; updateSmart(); }
  function stripHTML(html){ return (html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
  function trimWords(text, n){
    var w = stripHTML(text).split(' ');
    if(w.length <= n) return w.join(' ');
    return w.slice(0,n).join(' ') + '…';
  }
  function minutesRead(html){
    var words = stripHTML(html).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }
  function extractPostId(entryId){
    // e.id.$t like: "tag:blogger.com,1999:blog-xxxx.post-YYYY"
    var m = /post-(\d+)/.exec(entryId||''); return m ? m[1] : '';
  }

  /* ====== JSONP loader ====== */
  function loadJSONP(url, onOk, onErr){
    var s = document.createElement('script');
    var id = 'cb' + Math.random().toString(36).slice(2);
    window[id] = function(data){
      try{ onOk && onOk(data); }
      finally{
        delete window[id];
        s.parentNode && s.parentNode.removeChild(s);
      }
    };
    s.onerror = function(){
      try{ onErr && onErr(); }
      finally{
        delete window[id];
        s.parentNode && s.parentNode.removeChild(s);
      }
    };
    s.src = url + (url.indexOf('?')>=0?'&':'?') + 'alt=json-in-script&callback=' + id;
    document.body.appendChild(s);
  }

  /* ====== Blogger Feed helpers ====== */
  function fetchPostsSummary(opts, cb){
    // opts: {label?:string, q?:string, max?:number}
    opts = opts || {};
    var label = opts.label || '';
    var q     = opts.q || '';
    var max   = Math.max(1, Math.min(500, +opts.max || 50)); // Blogger max 500
    var u = BLOG_BASE + (label
      ? '/feeds/posts/summary/-/' + encodeURIComponent(label) + '?max-results=' + max
      : '/feeds/posts/summary?max-results=' + max);
    if(q) u += '&q=' + encodeURIComponent(q);
    loadJSONP(u, function(data){
      var items = (data.feed && data.feed.entry) || [];
      var mapped = items.map(function(e){
        var link = (e.link||[]).filter(function(l){return l.rel==='alternate';})[0];
        var img  = (e.media$thumbnail && e.media$thumbnail.url) || '';
        return {
          id: extractPostId(e.id && e.id.$t),
          title: e.title ? e.title.$t : '',
          url: link ? link.href : '',
          date: e.published ? e.published.$t : '',
          labels: (e.category||[]).map(function(c){ return c.term; }),
          excerpt: e.summary ? e.summary.$t : '',
          image: img
        };
      });
      cb && cb(mapped);
    }, function(){ cb && cb([]); });
  }

  function fetchPostFull(postId, cb){
    var u = BLOG_BASE + '/feeds/posts/default/' + postId;
    loadJSONP(u, function(data){
      var e = data.entry || {};
      var link=(e.link||[]).filter(function(l){return l.rel==='alternate';})[0];
      cb && cb({
        id: postId,
        title: e.title ? e.title.$t : '',
        url: link?link.href:'',
        date: e.published ? e.published.$t : '',
        labels: (e.category||[]).map(function(c){return c.term}),
        content: e.content ? e.content.$t : '',
        image: (e.media$thumbnail && e.media$thumbnail.url) || ''
      });
    }, function(){ cb && cb(null); });
  }

  function fetchPages(cb){
    var u = BLOG_BASE + '/feeds/pages/default';
    loadJSONP(u, function(data){
      var items=(data.feed && data.feed.entry)||[];
      var mapped=items.map(function(e){
        var link=(e.link||[]).filter(function(l){return l.rel==='alternate';})[0];
        return { id:e.id.$t, title:e.title.$t, url:link?link.href:'' };
      });
      cb && cb(mapped);
    }, function(){ cb && cb([]); });
  }

  function fetchComments(postId, cb){
    var u = BLOG_BASE + '/feeds/' + postId + '/comments/default';
    loadJSONP(u, function(data){
      var items=(data.feed && data.feed.entry)||[];
      var mapped=items.map(function(e){
        var author=(e.author && e.author[0] && e.author[0].name && e.author[0].name.$t) || 'Anonim';
        var published=e.published ? e.published.$t : '';
        var text=(e.content && e.content.$t) || (e.summary && e.summary.$t) || '';
        return { id:e.id.$t, name:author, time:published, text:text };
      });
      cb && cb(mapped);
    }, function(){ cb && cb([]); });
  }

  /* ====== Sidebar toggles ====== */
  function toggleLeft(force){
    var show = typeof force==='boolean' ? force : sidebarLeft.hasAttribute('hidden');
    setHidden(sidebarLeft, !show); void sidebarLeft.offsetWidth;
    sidebarLeft.classList.toggle('is-open', show);
    show?openOverlay():closeOverlay();
    trapFocus(sidebarLeft, show);
  }
  function toggleRight(force){
    var show = typeof force==='boolean' ? force : sidebarRight.hasAttribute('hidden');
    setHidden(sidebarRight, !show); void sidebarRight.offsetWidth;
    sidebarRight.classList.toggle('is-open', show);
    show?openOverlay():closeOverlay();
    trapFocus(sidebarRight, show);
  }

  /* ====== Render: Postcard, Reader, Pages, Labels ====== */
  function postcardNode(p){
    var mins = minutesRead(p.excerpt||'');
    var card = document.createElement('article');
    card.className='postcard'; card.setAttribute('data-id',p.id);

    var imgSrc = p.image || ('https://picsum.photos/seed/' + (p.id||'x') + '/320/240');
    var excerpt = trimWords(p.excerpt||'', 20);

    card.innerHTML =
      "<div class='thumb'>" +
        "<img src='"+imgSrc+"' alt='Gambar "+(p.title||"")+"' width='320' height='240' loading='lazy' decoding='async'/>" +
      "</div>" +
      "<div class='body'>" +
        "<h3 class='title'>"+(p.title||'Tanpa Judul')+"</h3>" +
        "<p class='excerpt'>"+excerpt+"</p>" +
        "<div class='meta'>" +
          "<span class='m'><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg> Admin</span>" +
          "<span class='m'><svg width='18' height='18'><use href='#i-calendar' xlink:href='#i-calendar'/></svg> "+(p.date?new Date(p.date).toLocaleDateString(): '')+"</span>" +
          "<span class='m'><svg width='18' height='18'><use href='#i-clock' xlink:href='#i-clock'/></svg> "+mins+" menit</span>" +
          "<div class='actions' role='group' aria-label='Aksi'>" +
            "<button class='iconbtn act-copy'    title='Salin tautan'><svg width='18' height='18'><use href='#i-copy' xlink:href='#i-copy'/></svg><span>Salin</span></button>" +
            "<button class='iconbtn act-comment' title='Komentar'><svg width='18' height='18'><use href='#i-comment' xlink:href='#i-comment'/></svg><span>Komentar</span></button>" +
            "<button class='iconbtn act-props'   title='Properti'><svg width='18' height='18'><use href='#i-info' xlink:href='#i-info'/></svg><span>Properti</span></button>" +
            "<button class='iconbtn act-read'    title='Baca'><svg width='18' height='18'><use href='#i-link' xlink:href='#i-link'/></svg><span>Baca</span></button>" +
          "</div>" +
        "</div>" +
      "</div>";

    card.querySelector('.act-copy').addEventListener('click', function(){
      if(navigator.clipboard){ navigator.clipboard.writeText(p.url||''); }
    });
    card.querySelector('.act-comment').addEventListener('click', function(){ openRight('comments', p); });
    card.querySelector('.act-props').addEventListener('click',   function(){ openRight('meta', p); });
    card.querySelector('.act-read').addEventListener('click',    function(){ renderReaderById(p.id); });
    return card;
  }

  function renderFeed(list){
    feed.innerHTML='';
    list.forEach(function(p){ feed.appendChild(postcardNode(p)); });
  }

  function renderReaderById(postId){
    fetchPostFull(postId, function(full){
      if(!full) return;
      renderReader(full);
    });
  }

  function renderReader(p){
    activePost = p;
    var mins = minutesRead(p.content||p.excerpt||'');
    // remove previous reader(s)
    $$('.readercard', room).forEach(function(n){ n.parentNode.removeChild(n); });

    var art=document.createElement('article'); art.className='readercard';
    var labels=(p.labels||[]).join(', ');
    art.innerHTML =
      "<header class='reader-head'>" +
        "<h1 class='title'>"+p.title+"</h1>" +
        "<div class='reader-meta'>" +
          "<span><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg> Admin</span>" +
          "<span><svg width='18' height='18'><use href='#i-calendar' xlink:href='#i-calendar'/></svg> "+(p.date?new Date(p.date).toLocaleDateString():'')+"</span>" +
          "<span><svg width='18' height='18'><use href='#i-clock' xlink:href='#i-clock'/></svg> "+mins+" menit baca</span>" +
          "<span><svg width='18' height='18'><use href='#i-tag' xlink:href='#i-tag'/></svg> "+labels+"</span>" +
        "</div>" +
      "</header>" +
      "<div class='reader-body' id='readerArticle'>" +
        (p.image ? "<img src='"+p.image+"' alt='Gambar "+p.title+"' width='768' height='480' loading='lazy' decoding='async'/>" : "") +
        (p.content||'') +
      "</div>" +
      "<div class='reader-actions' role='group' aria-label='Aksi artikel'>" +
        "<button class='iconbtn act-copy'><svg width='18' height='18'><use href='#i-copy' xlink:href='#i-copy'/></svg><span>Salin tautan</span></button>" +
        "<button class='iconbtn act-comment'><svg width='18' height='18'><use href='#i-comment' xlink:href='#i-comment'/></svg><span>Komentar</span></button>" +
        "<button class='iconbtn act-props'><svg width='18' height='18'><use href='#i-info' xlink:href='#i-info'/></svg><span>Properti</span></button>" +
      "</div>";

    room.appendChild(art);
    if(autoStickBottom) smartScroll(); else updateSmart();
    buildToc();
    // actions
    $('.act-copy', art).addEventListener('click', function(){ if(navigator.clipboard){ navigator.clipboard.writeText(p.url||''); } });
    $('.act-comment', art).addEventListener('click', function(){ openRight('comments', p); });
    $('.act-props', art).addEventListener('click', function(){ openRight('meta', p); });
  }

  function buildToc(){
    var host=$('#readerArticle');
    if(!host){ rsToc.innerHTML='<p class="small">Tidak ada konten.</p>'; return; }
    var hs=[].slice.call(host.querySelectorAll('h2,h3'));
    rsToc.innerHTML='<div class="toc-list"></div>';
    var list=$('.toc-list',rsToc);
    hs.forEach(function(h,i){
      var id=h.id||('sec-'+(i+1)); h.id=id;
      var a=document.createElement('a'); a.href='#'+id; a.textContent=h.textContent;
      if(h.tagName==='H3'){ a.style.paddingLeft='16px'; }
      list.appendChild(a);
    });
  }

  function openRight(tab, p){
    if(p){ // isi panel
      activePost = p;
      rsMeta.innerHTML =
        "<div class='meta-list'>" +
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-link' xlink:href='#i-link'/></svg><a href='"+(p.url||"")+"' target='_blank' rel='noopener noreferrer'>"+(p.url||"")+"</a></div>" +
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg><span>Admin</span></div>" +
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-calendar' xlink:href='#i-calendar'/></svg><span>"+(p.date?new Date(p.date).toLocaleString():'')+"</span></div>" +
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-tag' xlink:href='#i-tag'/></svg><span>"+(p.labels||[]).join(', ')+"</span></div>" +
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-clock' xlink:href='#i-clock'/></svg><span>"+minutesRead((p.content||p.excerpt||''))+" menit baca</span></div>" +
          "<div class='meta-row'><svg width='18' height='18'><use href='#i-info' xlink:href='#i-info'/></svg><span>ID: "+(p.id||'')+"</span></div>" +
        "</div>";
      // Komentar & tombol OAuth placeholder
      rsComments.innerHTML =
        "<div style='display:flex;gap:8px;align-items:center;margin-bottom:8px'>" +
         "<button id='btnOAuth' class='iconbtn'><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg><span>Masuk Google (OAuth)</span></button>" +
         "<a class='iconbtn' target='_blank' rel='noopener' href='"+(p.url||"#")+"#comments'><svg width='18' height='18'><use href='#i-link' xlink:href='#i-link'/></svg><span>Buka Halaman</span></a>" +
        "</div>" +
        "<div id='cList'></div>";
      $('#btnOAuth') && $('#btnOAuth').addEventListener('click', function(){
        // Placeholder OAuth 2.0 — di produksi ganti dengan Google Identity Services
        alert('OAuth placeholder: implementasikan Google Sign-In untuk menulis komentar.');
      });
      fetchComments(p.id, function(list){
        var holder = $('#cList'); if(!holder) return;
        if(!list.length){ holder.innerHTML = "<p class='small'>Belum ada komentar.</p>"; return; }
        holder.innerHTML = list.map(function(c){
          return "<div class='comment-card'><div class='who'>"+c.name+" • <span class='small'>"+(new Date(c.time).toLocaleString())+"</span></div><div class='text'>"+c.text+"</div></div>";
        }).join('');
      });
    }
    // tab
    setRsTab(tab||'meta');
    // buka panel
    setHidden(sidebarRight, false);
    void sidebarRight.offsetWidth; // reflow
    sidebarRight.classList.add('is-open');
    openOverlay();
    trapFocus(sidebarRight, true);
  }

  function setRsTab(name){
    rsTabs.forEach(function(t){ t.classList.toggle('is-active', t.getAttribute('data-tab')===name); });
    ['meta','toc','comments'].forEach(function(id){ $('#rs-'+id).classList.toggle('is-active', id===name); });
  }

  /* ====== SidebarLeft: Labels → dropdown posts A–Z ====== */
  function buildLabelsDropdown(allPosts){
    // hitung label & jumlah
    var counts = {};
    allPosts.forEach(function(p){
      (p.labels||[]).forEach(function(l){ counts[l] = (counts[l]||0) + 1; });
    });
    var labels = Object.keys(counts).sort(function(a,b){ return a.localeCompare(b,'id'); });

    labelList.innerHTML = labels.map(function(l, idx){
      var id = 'lab-'+idx;
      return (
        "<details class='accordion label-acc' data-label='"+l+"' id='"+id+"'>" +
          "<summary>" +
            "<span class='acc-title'>" +
              "<svg width='18' height='18'><use href='#i-tag' xlink:href='#i-tag'/></svg> " + l +
            "</span>" +
            "<span class='count small'>"+counts[l]+"</span>" +
          "</summary>" +
          "<div class='posts-under-label' aria-live='polite' style='margin-top:8px'></div>" +
        "</details>"
      );
    }).join('');

    // event: saat dibuka, load posts label (sekali saja)
    $$('.label-acc', labelList).forEach(function(d){
      d.addEventListener('toggle', function(){
        if(!d.open) return;
        var lab = d.getAttribute('data-label');
        var holder = $('.posts-under-label', d);
        if(holder && !holder.hasChildNodes()){
          holder.innerHTML = "<p class='small'>Memuat…</p>";
          fetchPostsSummary({label: lab, max: 200}, function(list){
            list.sort(function(a,b){ return (a.title||'').localeCompare(b.title||'', 'id'); });
            holder.innerHTML = list.map(function(p){
              var t = (p.title||'Tanpa judul');
              return "<button class='page-item post-link' data-id='"+p.id+"'><svg width='16' height='16'><use href='#i-page' xlink:href='#i-page'/></svg> "+t+"</button>";
            }).join('');
            $$('.post-link', holder).forEach(function(btn){
              btn.addEventListener('click', function(){
                var pid = btn.getAttribute('data-id');
                renderReaderById(pid);
                toggleLeft(false);
              });
            });
          });
        }
        // tutup yang lain agar rapi
        $$('.label-acc', labelList).forEach(function(x){ if(x!==d) x.open=false; });
      });
    });
  }

  /* ====== Pages list ====== */
  function buildPagesList(pages){
    pageList.innerHTML = pages.map(function(pg){
      return "<a href='"+pg.url+"' class='page-item' target='_blank' rel='noopener'>" +
        "<svg width='16' height='16'><use href='#i-page' xlink:href='#i-page'/></svg> "+pg.title+
      "</a>";
    }).join('');
  }

  /* ====== Chatbar actions (minimal) ====== */
  function doSend(){ var t=chatInput.value.trim(); if(!t) return; lastSent=t; addBubble(t,'success','user'); chatInput.value=''; chatInput.focus(); }
  function doClear(){ chatInput.value=''; chatInput.focus(); }
  function doAttach(){ filePicker.click(); }
  function addBubble(html,tone,role){
    var el=document.createElement('article');
    el.className='bubble' + (tone?(' bubble--'+tone):''); el.setAttribute('data-role', role||'system');
    el.innerHTML='<p>'+html+'</p>'; room.appendChild(el);
    if(autoStickBottom) smartScroll(); else updateSmart();
  }

  /* ====== Events ====== */
  room.addEventListener('scroll', function(){ autoStickBottom = nearBottom(); updateSmart(); }, {passive:true});
  smartBtn.addEventListener('click', smartScroll);

  chatForm.addEventListener('click', function(e){
    var btn = e.target.closest('[data-action]'); if(!btn) return;
    var act = btn.getAttribute('data-action');
    if(act==='toggle-left') toggleLeft();
    else if(act==='emoji'){ chatInput.setRangeText('😊',chatInput.selectionStart,chatInput.selectionEnd,'end'); chatInput.focus(); }
    else if(act==='attach') doAttach();
    else if(act==='mic'){ addBubble('🎤 Mic placeholder.','warn','system'); }
    else if(act==='clear') doClear();
    else if(act==='send'){ e.preventDefault(); doSend(); }
    else if(act==='toggle-dock'){ setHidden(dockbar,false); dockbar.classList.add('open'); trapFocus(dockSheet,true); }
  });
  chatForm.addEventListener('submit', function(e){ e.preventDefault(); doSend(); });
  filePicker.addEventListener('change', function(){
    var fs=[].slice.call(filePicker.files||[]); if(!fs.length) return;
    addBubble('📎 '+fs.map(function(f){return f.name}).join(', '),'info','system'); filePicker.value='';
  });

  dockbar.addEventListener('click', function(e){
    var b=e.target.closest('[data-action]'); if(!b) return;
    var act=b.getAttribute('data-action'), val=b.getAttribute('data-value'), delta=parseFloat(b.getAttribute('data-delta')||'0');
    if(act==='close'){ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); return; }
    if(act==='theme'){ document.body.dataset.theme=val; try{localStorage.setItem('theme',val);}catch(_e){} return; }
    if(act==='tsize'){ var curr=+(getComputedStyle(document.documentElement).getPropertyValue('--ts'))||1; var next=Math.min(1.25,Math.max(0.85,+(curr+delta).toFixed(2))); document.documentElement.style.setProperty('--ts',next); measureChatbar(); return; }
    if(act==='density'){ document.body.dataset.density=val; measureChatbar(); return; }
    if(act==='bubble'){ document.body.dataset.bubble=val; return; }
    if(act==='motion'){ document.body.dataset.motion=val; return; }
    if(act==='ground'){ document.body.dataset.ground=val; return; }
    if(act==='bg'){ document.body.dataset.bg=val; return; }
    if(act==='focus'){ document.body.dataset.focus=val; return; }
    if(act==='reset'){ document.documentElement.style.setProperty('--ts',1); document.body.dataset.density='comfortable'; document.body.dataset.bubble='fit'; document.body.dataset.motion='on'; document.body.dataset.ground='on'; document.body.dataset.bg='static'; document.body.dataset.focus='off'; measureChatbar(); return; }
  });
  dockScrim && dockScrim.addEventListener('click', function(){ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); });

  overlay.addEventListener('click', function(){ toggleLeft(false); toggleRight(false); });

  document.addEventListener('keydown', function(e){
    var mod = e.ctrlKey||e.metaKey;
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

  /* ====== Boot ====== */
  document.addEventListener('DOMContentLoaded', function(){
    measureChatbar(); updateSmart();

    // 1) Pages
    fetchPages(function(pgs){ pagesIndex = pgs; buildPagesList(pgs); });

    // 2) Posts ringkas (untuk feed & index label)
    //    Ambil jumlah yang cukup agar label list komprehensif,
    //    tapi tetap ringan untuk mobile.
    fetchPostsSummary({max: 120}, function(list){
      postsIndex = list;
      renderFeed(list.slice(0, 20)); // feed awal: 20 terbaru
      buildLabelsDropdown(list);
    });

    // smart scroll visibility
    room.addEventListener('focusin', function(){ setTimeout(updateSmart, 0); });
    window.addEventListener('resize', function(){ measureChatbar(); updateSmart(); }, {passive:true});
    window.addEventListener('orientationchange', function(){ measureChatbar(); updateSmart(); });
  });
})();
