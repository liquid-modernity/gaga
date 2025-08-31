/*! Gaga Blog — Feed JSONP (no API key) — v2025-09-01r3 */
(function(){
  'use strict';

  // ---- Build marker (agar tahu JS benar2 update) ----
  (function markBuild(){
    try{ document.documentElement.setAttribute('data-gaga-build','2025-09-01r3'); }catch(e){}
    try{ console.log('[Gaga] main.js v2025-09-01r3 loaded'); }catch(e){}
  })();

  // ---- Config ----
  var BLOG_BASE = (function(){
    try{
      return (window.GAGA_CONFIG && window.GAGA_CONFIG.blogBase) ||
             document.body.getAttribute('data-blog') ||
             'https://ratriatra.blogspot.com';
    }catch(e){ return 'https://ratriatra.blogspot.com'; }
  })();

  // ---- DOM helpers ----
  var $  = function(s,c){ return (c||document).querySelector(s); };
  var $$ = function(s,c){ return Array.prototype.slice.call((c||document).querySelectorAll(s)); };

  var feed = $('#feed'), room = $('#roomchat');
  var sidebarLeft  = $('#sidebarLeft');
  var sidebarRight = $('#sidebarRight');
  var overlay = $('#overlay');
  var rsTabs = $$('.rs-tab'), rsMeta = $('#rs-meta'), rsToc = $('#rs-toc'), rsComments = $('#rs-comments');
  var labelList = $('#labelList'), pageList = $('#pageList');
  var chatbar = $('#chatbar'), chatForm = $('#chatForm'), chatInput = $('#chatInput'), filePicker = $('#filePicker');
  var smartBtn = $('#smartScroll');
  var dockbar = $('#dockbar'), dockSheet = $('.dock__sheet', dockbar), dockScrim = $('.dock__scrim', dockbar);
  var replyInput = $('#replyInput'), replySend = $('#replySend');

  // ---- State ----
  var postsIndex = []; // ringkas utk label index
  var pagesIndex = [];
  var activePost = null;
  var autoStickBottom = true;
  var lastSent = '';

  // ---- Utils ----
  function setHidden(el, yes){ if(!el) return; if(yes){ el.setAttribute('hidden','hidden'); el.setAttribute('aria-hidden','true'); } else { el.removeAttribute('hidden'); el.setAttribute('aria-hidden','false'); } }
  function openOverlay(){ overlay && overlay.removeAttribute('hidden'); }
  function closeOverlay(){ overlay && overlay.setAttribute('hidden','hidden'); }
  function trapFocus(container,on){
    var sel='a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
    if(!on){ if(container.__trap){ document.removeEventListener('keydown',container.__trap); container.__trap=null; } return; }
    container.__trap=function(e){
      if(e.key!=='Tab') return;
      var f=[].slice.call(container.querySelectorAll(sel)).filter(function(n){return n.offsetParent!==null;});
      if(!f.length) return; var first=f[0], last=f[f.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown',container.__trap);
    (container.querySelector(sel)||container).focus();
  }
  function measureChatbar(){ var h=chatbar?chatbar.offsetHeight:64; document.documentElement.style.setProperty('--chatbar-h',h+'px'); }
  function nearBottom(){ return (room.scrollHeight - room.scrollTop - room.clientHeight) < 140; }
  function updateSmart(){ smartBtn && smartBtn.toggleAttribute('hidden', nearBottom()); }
  function smartScroll(){ room.scrollTop = room.scrollHeight; updateSmart(); }
  function stripHTML(html){ return (html||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
  function trimWords(text, n){ var w=stripHTML(text).split(' ').filter(Boolean); return w.length<=n? w.join(' ') : w.slice(0,n).join(' ')+'…'; }
  function minutesRead(html){ var words=stripHTML(html).split(/\s+/).filter(Boolean).length; return Math.max(1,Math.round(words/200)); }
  function extractPostId(entryId){ var m=/post-(\d+)/.exec(entryId||''); return m?m[1]:''; }

  // ---- JSONP ----
  function loadJSONP(url, ok, err){
    var s=document.createElement('script');
    var cb='cb'+Math.random().toString(36).slice(2);
    window[cb]=function(d){ try{ ok&&ok(d);} finally{ delete window[cb]; s.remove(); } };
    s.onerror=function(){ try{ err&&err(); } finally{ delete window[cb]; s.remove(); } };
    s.src=url+(url.includes('?')?'&':'?')+'alt=json-in-script&callback='+cb;
    document.body.appendChild(s);
  }

  // ---- Blogger feeds ----
  function fetchPostsSummary(opts, cb){
    opts=opts||{}; var label=opts.label||'', q=opts.q||'', max=Math.min(500, +opts.max||50);
    var u=BLOG_BASE + (label? '/feeds/posts/summary/-/'+encodeURIComponent(label)+'?max-results='+max
                               : '/feeds/posts/summary?max-results='+max);
    if(q) u += '&q='+encodeURIComponent(q);
    loadJSONP(u, function(data){
      var items=(data.feed && data.feed.entry)||[];
      var mapped=items.map(function(e){
        var link=(e.link||[]).find(function(l){return l.rel==='alternate';});
        return {
          id: extractPostId(e.id && e.id.$t),
          title: e.title ? e.title.$t : '',
          url: link ? link.href : '',
          date: e.published ? e.published.$t : '',
          labels: (e.category||[]).map(function(c){return c.term}),
          excerpt: e.summary ? e.summary.$t : '',
          image: (e.media$thumbnail && e.media$thumbnail.url) || ''
        };
      });
      cb && cb(mapped);
    }, function(){ cb && cb([]); });
  }
  function fetchPostFull(postId, cb){
    loadJSONP(BLOG_BASE+'/feeds/posts/default/'+postId, function(data){
      var e=data.entry||{}; var link=(e.link||[]).find(function(l){return l.rel==='alternate';});
      cb && cb({
        id: postId, title: e.title?e.title.$t:'', url: link?link.href:'',
        date: e.published?e.published.$t:'', labels:(e.category||[]).map(function(c){return c.term}),
        content: e.content?e.content.$t:'', image:(e.media$thumbnail && e.media$thumbnail.url)||''
      });
    }, function(){ cb && cb(null); });
  }
  function fetchPages(cb){
    loadJSONP(BLOG_BASE+'/feeds/pages/default', function(data){
      var items=(data.feed && data.feed.entry)||[];
      var mapped=items.map(function(e){
        var link=(e.link||[]).find(function(l){return l.rel==='alternate';});
        return { id:e.id.$t, title:e.title.$t, url: link?link.href:'' };
      });
      cb && cb(mapped);
    }, function(){ cb && cb([]); });
  }
  function fetchComments(postId, cb){
    loadJSONP(BLOG_BASE+'/feeds/'+postId+'/comments/default', function(data){
      var items=(data.feed && data.feed.entry)||[];
      var mapped=items.map(function(e){
        var who=(e.author&&e.author[0]&&e.author[0].name && e.author[0].name.$t)||'Anonim';
        var t=e.published?e.published.$t:''; var text=(e.content&&e.content.$t)||(e.summary&&e.summary.$t)||'';
        return {id:e.id.$t,name:who,time:t,text:text};
      });
      cb && cb(mapped);
    }, function(){ cb && cb([]); });
  }

  // ---- Sidebar open/close (+force reveal fallback) ----
  function forceRevealRight(show){
    if(show){ sidebarRight.style.transform='translateX(0)'; sidebarRight.style.right='0'; sidebarRight.style.left='auto'; }
    else{ sidebarRight.style.transform=''; sidebarRight.style.right=''; sidebarRight.style.left=''; }
  }
  function toggleLeft(force){
    var show = typeof force==='boolean'?force:sidebarLeft.hasAttribute('hidden');
    setHidden(sidebarLeft,!show); void sidebarLeft.offsetWidth;
    sidebarLeft.classList.toggle('is-open',show);
    show?openOverlay():closeOverlay(); trapFocus(sidebarLeft,show);
  }
  function toggleRight(force){
    var show = typeof force==='boolean'?force:sidebarRight.hasAttribute('hidden');
    setHidden(sidebarRight,!show); void sidebarRight.offsetWidth;
    sidebarRight.classList.toggle('is-open',show); forceRevealRight(show);
    show?openOverlay():closeOverlay(); trapFocus(sidebarRight,show);
  }

  // ---- Renderers ----
  function postcardNode(p){
    var mins=minutesRead(p.excerpt||'');
    var img=p.image || ('https://picsum.photos/seed/'+(p.id||'x')+'/320/240');
    var card=document.createElement('article'); card.className='postcard'; card.setAttribute('data-id',p.id);
    card.innerHTML =
      "<div class='thumb'><img src='"+img+"' alt='Gambar "+(p.title||"")+"' width='320' height='240' loading='lazy' decoding='async'/></div>"+
      "<div class='body'>"+
        "<h3 class='title'>"+(p.title||'Tanpa Judul')+"</h3>"+
        "<p class='excerpt'>"+trimWords(p.excerpt||'',20)+"</p>"+
        "<div class='meta'>"+
          "<span class='m'><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg> Admin</span>"+
          "<span class='m'><svg width='18' height='18'><use href='#i-calendar' xlink:href='#i-calendar'/></svg> "+(p.date?new Date(p.date).toLocaleDateString():'')+"</span>"+
          "<span class='m'><svg width='18' height='18'><use href='#i-clock' xlink:href='#i-clock'/></svg> "+mins+" menit</span>"+
          "<div class='actions' role='group' aria-label='Aksi'>"+
            "<button class='iconbtn act-copy'    title='Salin tautan'><svg width='18' height='18'><use href='#i-copy' xlink:href='#i-copy'/></svg><span>Salin</span></button>"+
            "<button class='iconbtn act-comment' title='Komentar'><svg width='18' height='18'><use href='#i-comment' xlink:href='#i-comment'/></svg><span>Komentar</span></button>"+
            "<button class='iconbtn act-props'   title='Properti'><svg width='18' height='18'><use href='#i-info' xlink:href='#i-info'/></svg><span>Properti</span></button>"+
            "<button class='iconbtn act-read'    title='Baca'><svg width='18' height='18'><use href='#i-link' xlink:href='#i-link'/></svg><span>Baca</span></button>"+
          "</div>"+
        "</div>"+
      "</div>";
    $('.act-copy',card).addEventListener('click',function(){ if(navigator.clipboard){ navigator.clipboard.writeText(p.url||''); } });
    $('.act-comment',card).addEventListener('click',function(){ openRight('comments',p); });
    $('.act-props',card).addEventListener('click',function(){ openRight('meta',p); });
    $('.act-read',card).addEventListener('click',function(){ renderReaderById(p.id); });
    return card;
  }
  function renderFeed(list){
    feed.innerHTML=''; list.forEach(function(p){ feed.appendChild(postcardNode(p)); });
  }
  function renderReaderById(postId){ fetchPostFull(postId, function(full){ if(full) renderReader(full); }); }
  function renderReader(p){
    activePost=p; $$('.readercard',room).forEach(function(n){n.remove();});
    var mins=minutesRead(p.content||p.excerpt||''); var labels=(p.labels||[]).join(', ');
    var art=document.createElement('article'); art.className='readercard';
    art.innerHTML =
      "<header class='reader-head'><h1 class='title'>"+p.title+"</h1>"+
      "<div class='reader-meta'>"+
        "<span><svg width='18' height='18'><use href='#i-user' xlink:href='#i-user'/></svg> Admin</span>"+
        "<span><svg width='18' height='18'><use href='#i-calendar' xlink:href='#i-calendar'/></svg> "+(p.date?new Date(p.date).toLocaleDateString():'')+"</span>"+
        "<span><svg width='18' height='18'><use href='#i-clock' xlink:href='#i-clock'/></svg> "+mins+" menit baca</span>"+
        "<span><svg width='18' height='18'><use href='#i-tag' xlink:href='#i-tag'/></svg> "+labels+"</span>"+
      "</div></header>"+
      "<div class='reader-body' id='readerArticle'>"+
        (p.image?"<img src='"+p.image+"' alt='Gambar "+p.title+"' width='768' height='480' loading='lazy' decoding='async'/>":"")+
        (p.content||'')+
      "</div>"+
      "<div class='reader-actions' role='group' aria-label='Aksi artikel'>"+
        "<button class='iconbtn act-copy'><svg width='18' height='18'><use href='#i-copy' xlink:href='#i-copy'/></svg><span>Salin tautan</span></button>"+
        "<button class='iconbtn act-comment'><svg width='18' height='18'><use href='#i-comment' xlink:href='#i-comment'/></svg><span>Komentar</span></button>"+
        "<button class='iconbtn act-props'><svg width='18' height='18'><use href='#i-info' xlink:href='#i-info'/></svg><span>Properti</span></button>"+
      "</div>";
    room.appendChild(art);
    if(autoStickBottom) smartScroll(); else updateSmart();
    buildToc();
    $('.act-copy',art).addEventListener('click',function(){ if(navigator.clipboard){ navigator.clipboard.writeText(p.url||''); } });
    $('.act-comment',art).addEventListener('click',function(){ openRight('comments',p); });
    $('.act-props',art).addEventListener('click',function(){ openRight('meta',p); });
  }
  function buildToc(){
    var host=$('#readerArticle'); if(!host){ rsToc.innerHTML='<p class="small">Tidak ada konten.</p>'; return; }
    var hs=[].slice.call(host.querySelectorAll('h2,h3')); rsToc.innerHTML='<div class="toc-list"></div>'; var list=$('.toc-list',rsToc);
    hs.forEach(function(h,i){ var id=h.id||('sec-'+(i+1)); h.id=id; var a=document.createElement('a'); a.href='#'+id; a.textContent=h.textContent; if(h.tagName==='H3') a.style.paddingLeft='16px'; list.appendChild(a); });
  }
  function setRsTab(name){
    rsTabs.forEach(function(t){ t.classList.toggle('is-active', t.getAttribute('data-tab')===name); });
    ['meta','toc','comments'].forEach(function(id){ $('#rs-'+id).classList.toggle('is-active', id===name); });
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
      var btnOauth=$('#btnOAuth'); if(btnOauth){ btnOauth.addEventListener('click', function(){ alert('OAuth placeholder: gunakan Google Identity Services untuk menulis komentar.'); }); }
      fetchComments(p.id, function(list){
        var holder=$('#cList'); if(!holder) return;
        if(!list.length){ holder.innerHTML="<p class='small'>Belum ada komentar.</p>"; return; }
        holder.innerHTML = list.map(function(c){
          return "<div class='comment-card'><div class='who'>"+c.name+" • <span class='small'>"+(new Date(c.time).toLocaleString())+"</span></div><div class='text'>"+c.text+"</div></div>";
        }).join('');
      });
    }
    setRsTab(tab||'meta');
    setHidden(sidebarRight,false); void sidebarRight.offsetWidth;
    sidebarRight.classList.add('is-open'); forceRevealRight(true);
    openOverlay(); trapFocus(sidebarRight,true);
  }

  // ---- SidebarLeft: Label utama → dropdown posting A–Z ----
  function buildLabelsDropdown(allPosts){
    // hitung label
    var counts = {};
    allPosts.forEach(function(p){ (p.labels||[]).forEach(function(l){ counts[l]=(counts[l]||0)+1; }); });
    var labels = Object.keys(counts).sort(function(a,b){ return a.localeCompare(b,'id'); });
    if(!labels.length){ labelList.innerHTML = "<p class='small'>Belum ada label.</p>"; return; }

    labelList.innerHTML = labels.map(function(l,idx){
      return (
        "<details class='accordion label-acc' data-label='"+l+"' id='lab-"+idx+"'>"+
          "<summary>"+
            "<span class='acc-title'><svg width='18' height='18'><use href='#i-tag' xlink:href='#i-tag'/></svg> "+l+"</span>"+
            "<span class='count small'>"+counts[l]+"</span>"+
          "</summary>"+
          "<div class='posts-under-label' aria-live='polite' style='margin-top:8px'></div>"+
        "</details>"
      );
    }).join('');

    $$('.label-acc', labelList).forEach(function(d){
      d.addEventListener('toggle', function(){
        if(!d.open) return;
        var lab = d.getAttribute('data-label');
        var holder = $('.posts-under-label', d);
        if(holder && !holder.hasChildNodes()){
          holder.innerHTML = "<p class='small'>Memuat…</p>";
          fetchPostsSummary({label:lab, max:200}, function(list){
            list.sort(function(a,b){ return (a.title||'').localeCompare(b.title||'','id'); });
            holder.innerHTML = list.map(function(p){
              return "<button class='page-item post-link' data-id='"+p.id+"'><svg width='16' height='16'><use href='#i-page' xlink:href='#i-page'/></svg> "+(p.title||'Tanpa judul')+"</button>";
            }).join('');
            $$('.post-link', holder).forEach(function(btn){
              btn.addEventListener('click', function(){
                var pid=btn.getAttribute('data-id'); renderReaderById(pid); toggleLeft(false);
              });
            });
          });
        }
        // tutup accordion lain
        $$('.label-acc', labelList).forEach(function(x){ if(x!==d) x.open=false; });
      });
    });
  }

  // ---- Pages list (dropdown container sudah ada di template) ----
  function buildPagesList(pages){
    if(!pages || !pages.length){ pageList.innerHTML="<p class='small'>Belum ada halaman.</p>"; return; }
    pageList.innerHTML = pages.map(function(pg){
      return "<a href='"+pg.url+"' class='page-item' target='_blank' rel='noopener'>"+
               "<svg width='16' height='16'><use href='#i-page' xlink:href='#i-page'/></svg> "+pg.title+
             "</a>";
    }).join('');
  }

  // ---- Chatbar minimal ----
  function addBubble(html,tone,role){ var n=document.createElement('article'); n.className='bubble'+(tone?(' bubble--'+tone):''); n.setAttribute('data-role',role||'system'); n.innerHTML='<p>'+html+'</p>'; room.appendChild(n); if(autoStickBottom) smartScroll(); else updateSmart(); }
  function doSend(){ var t=chatInput.value.trim(); if(!t) return; lastSent=t; addBubble(t,'success','user'); chatInput.value=''; chatInput.focus(); }
  function doClear(){ chatInput.value=''; chatInput.focus(); }
  function doAttach(){ filePicker.click(); }

  // ---- Events ----
  room.addEventListener('scroll', function(){ autoStickBottom=nearBottom(); updateSmart(); }, {passive:true});
  smartBtn.addEventListener('click', smartScroll);

  chatForm.addEventListener('click', function(e){
    var b=e.target.closest('[data-action]'); if(!b) return;
    var a=b.getAttribute('data-action');
    if(a==='toggle-left') toggleLeft();
    else if(a==='emoji'){ chatInput.setRangeText('😊',chatInput.selectionStart,chatInput.selectionEnd,'end'); chatInput.focus(); }
    else if(a==='attach') doAttach();
    else if(a==='mic')   addBubble('🎤 Mic placeholder.','warn','system');
    else if(a==='clear') doClear();
    else if(a==='send'){ e.preventDefault(); doSend(); }
    else if(a==='toggle-dock'){ setHidden(dockbar,false); dockbar.classList.add('open'); trapFocus(dockSheet,true); }
  });
  chatForm.addEventListener('submit', function(e){ e.preventDefault(); doSend(); });
  filePicker.addEventListener('change', function(){ var fs=[].slice.call(filePicker.files||[]); if(!fs.length) return; addBubble('📎 '+fs.map(function(f){return f.name}).join(', '),'info','system'); filePicker.value=''; });

  dockbar && dockbar.addEventListener('click', function(e){
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
    var mod=e.ctrlKey||e.metaKey;
    if(e.key==='Escape'){ if(!dockbar.hasAttribute('hidden')){ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); return; }
      if(!sidebarLeft.hasAttribute('hidden')){ toggleLeft(false); return; }
      if(!sidebarRight.hasAttribute('hidden')){ toggleRight(false); return; }
      if(document.activeElement===chatInput && chatInput.value){ chatInput.value=''; return; } }
    if(e.key==='/' && !mod && document.activeElement!==chatInput){ e.preventDefault(); chatInput.focus(); chatInput.select(); return; }
    if(mod && e.key===','){ e.preventDefault(); setHidden(dockbar,false); dockbar.classList.add('open'); trapFocus(dockSheet,true); return; }
    if(mod && e.key.toLowerCase()==='l'){ e.preventDefault(); toggleLeft(); return; }
    if(mod && e.key.toLowerCase()==='r'){ e.preventDefault(); toggleRight(); return; }
    if(document.activeElement===chatInput && e.key==='Enter'){ e.preventDefault(); doSend(); return; }
    if(document.activeElement===chatInput && e.key==='ArrowUp' && !chatInput.value){ chatInput.value=lastSent; chatInput.selectionStart=chatInput.selectionEnd=chatInput.value.length; }
  });

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', function(){
    measureChatbar(); updateSmart();

    // Pages → Sidebar pages
    fetchPages(function(pgs){ pagesIndex=pgs; buildPagesList(pgs); });

    // Posts summary → Feed + Label index
    fetchPostsSummary({max:120}, function(list){
      postsIndex=list.slice();            // simpan untuk label index
      renderFeed(list.slice(0,20));       // feed awal 20
      buildLabelsDropdown(list);          // label utama
      // preload reader pertama jika ada
      if(list[0]) renderReaderById(list[0].id);
    });

    room.addEventListener('focusin', function(){ setTimeout(updateSmart,0); });
    window.addEventListener('resize', function(){ measureChatbar(); updateSmart(); }, {passive:true});
    window.addEventListener('orientationchange', function(){ measureChatbar(); updateSmart(); });
  });
})();
