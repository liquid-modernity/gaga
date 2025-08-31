(()=>{"use strict";
    const $=(s,c=document)=>c.querySelector(s);
    const $$=(s,c=document)=>Array.from(c.querySelectorAll(s));
  
    /* Refs */
    const feed=$('#feed'), roomchat=$('#roomchat');
    const chatbar=$('#chatbar'), chatForm=$('#chatForm'), chatInput=$('#chatInput'), filePicker=$('#filePicker');
    const sidebarLeft=$('#sidebarLeft'), sidebarRight=$('#sidebarRight'), overlay=$('#overlay');
    const rsTabs=$$('.rs-tab'), rsMeta=$('#rs-meta'), rsToc=$('#rs-toc'), rsComments=$('#rs-comments');
    const replyInput=$('#replyInput'), replySend=$('#replySend');
    const dockbar=$('#dockbar'), dockSheet=$('.dock__sheet',dockbar), dockScrim=$('.dock__scrim',dockbar);
    const bg=$('#bg'), bgVideo=$('#bgVideo');
    const labelListEl=$('#labelList'), pageListEl=$('#pageList');
    const smartBtn=$('#smartScroll');
  
    /* State */
    let posts=[], activePost=null, lastSent='', autoStickBottom=true;
  
    /* Utils */
    const setHidden=(el,yes)=>{ if(!el)return; yes?(el.setAttribute('hidden',''),el.setAttribute('aria-hidden','true')):(el.removeAttribute('hidden'),el.setAttribute('aria-hidden','false')); };
    const openOverlay =()=>overlay.removeAttribute('hidden');
    const closeOverlay=()=>overlay.setAttribute('hidden','');
    const measureChatbar=()=>{ const h=chatbar?.offsetHeight||64; document.documentElement.style.setProperty('--chatbar-h',`${h}px`); };
    const nearBottom=()=> (roomchat.scrollHeight - roomchat.scrollTop - roomchat.clientHeight) < 140;
    const updateSmart=()=>{ smartBtn.toggleAttribute('hidden', nearBottom()); };
    const smartScroll=()=>{ roomchat.scrollTop = roomchat.scrollHeight; updateSmart(); };
    const minutesRead=(html)=>Math.max(1,Math.round((html.replace(/<[^>]+>/g,'').trim().split(/\s+/).length)/200));
  
    /* Focus trap */
    const focusableSel='a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const traps=new Map();
    function trapFocus(container,on=true){
      if(!container) return;
      if(!on){ const h=traps.get(container); if(h){document.removeEventListener('keydown',h); traps.delete(container);} return; }
      const handler=(e)=>{ if(e.key!=='Tab') return;
        const list=[...container.querySelectorAll(focusableSel)].filter(el=>el.offsetParent!==null);
        if(!list.length) return;
        const first=list[0], last=list[list.length-1];
        if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
      };
      document.addEventListener('keydown',handler);
      traps.set(container,handler);
      (container.querySelector(focusableSel)||container).focus();
    }
  
    /* Panels */
    const toggleLeft =(force)=>{ const show=typeof force==='boolean'?force:sidebarLeft.hasAttribute('hidden');
      setHidden(sidebarLeft,!show); sidebarLeft.classList.toggle('is-open',show); show?openOverlay():closeOverlay(); trapFocus(sidebarLeft,show); };
    const toggleRight=(force)=>{ const show=typeof force==='boolean'?force:sidebarRight.hasAttribute('hidden');
      setHidden(sidebarRight,!show); void sidebarRight.offsetWidth; sidebarRight.classList.toggle('is-open',show);
      show?openOverlay():closeOverlay(); trapFocus(sidebarRight,show); };
  
    /* Close button on right header */
    document.addEventListener('click',(e)=>{
      const btn=e.target.closest('[data-action="toggle-right"]');
      if(btn){ toggleRight(false); }
    });
  
    /* Dockbar */
    const openDock =()=>{ setHidden(dockbar,false); dockbar.classList.add('open'); trapFocus(dockSheet,true); };
    const closeDock=()=>{ dockbar.classList.remove('open'); setHidden(dockbar,true); trapFocus(dockSheet,false); };
  
    /* Background video */
    function updateBackground(){
      const {theme,motion,bg}=document.body.dataset;
      const can = theme==='glass' && motion==='on' && bg==='video';
      if(!bgVideo || !bg) return;
      if(!can){ try{bgVideo.pause();}catch{} bg.style.display='none'; return; }
      const conn=navigator.connection||{};
      const slow = conn.saveData || (conn.effectiveType && /2g|3g/.test(conn.effectiveType));
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(slow || reduce){ document.body.dataset.bg='static'; return; }
      bg.style.display='block';
      (window.requestIdleCallback||setTimeout)(()=>bgVideo.play().catch(()=>{}), 800);
    }
  
    /* SmartScroll tracking */
    roomchat.addEventListener('scroll',()=>{ autoStickBottom = nearBottom(); updateSmart(); }, {passive:true});
    smartBtn.addEventListener('click', smartScroll);
  
    /* Bubble */
    const bubble=(html,tone='info',role='system')=>{
      const el=document.createElement('article');
      el.className=`bubble bubble--${tone}`; el.dataset.role=role; el.innerHTML=`<p>${html}</p>`;
      roomchat.appendChild(el);
      if(autoStickBottom) smartScroll(); else updateSmart();
    };
  
    /* Dummy data */
    posts=[{
      id:'p1',
      url:'https://contoh.blog/post/selamat-datang',
      title:'Mengenal Gaga: Platform Chat + Blog',
      author:'Admin Gaga',
      labels:['Pengumuman','Gaga'],
      date:'2025-09-01T09:00:00Z',
      image:'https://picsum.photos/seed/gaga/768/480',
      excerpt:'Gaga menggabungkan chat dan blog menjadi satu pengalaman yang ringan dan menyenangkan.',
      content:`<p>Halo! Ini contoh konten readercard. Di bawah ada beberapa bagian untuk menguji ToC.</p>
               <h2>Pendahuluan</h2><p>Paragraf contoh…</p>
               <h2>Fitur Utama</h2><h3>1. Chatbar Infield</h3><p>Deskripsi singkat…</p>
               <h3>2. Dockbar</h3><p>Deskripsi singkat…</p>
               <h2>Penutup</h2><p>Terima kasih sudah mencoba.</p>`,
      comments:[{id:'c1',name:'Budi',time:'2025-03-10 12:00',text:'Keren!'}]
    }];
  
    /* Feed */
    function renderFeed(list){ feed.innerHTML=''; list.forEach(p=>feed.appendChild(makePostcard(p))); }
    function makePostcard(p){
      const mins=minutesRead(p.content);
      const card=document.createElement('article');
      card.className='postcard'; card.dataset.id=p.id;
      card.innerHTML=`
        <div class="thumb">
          <img src="${p.image}" alt="Gambar untuk ${p.title}" width="320" height="240" loading="lazy" decoding="async">
        </div>
        <div class="body">
          <h3 class="title">${p.title}</h3>
          <p class="excerpt">${p.excerpt}</p>
          <div class="meta">
            <span class="m"><svg width="18" height="18"><use href="#i-user"/></svg> ${p.author}</span>
            <span class="m"><svg width="18" height="18"><use href="#i-calendar"/></svg> ${new Date(p.date).toLocaleDateString()}</span>
            <span class="m"><svg width="18" height="18"><use href="#i-clock"/></svg> ${mins} menit baca</span>
            <div class="actions" role="group" aria-label="Aksi">
              <button class="iconbtn act-copy"><svg width="18" height="18"><use href="#i-copy"/></svg><span>Salin</span></button>
              <button class="iconbtn act-comment"><svg width="18" height="18"><use href="#i-comment"/></svg><span>Komentar</span></button>
              <button class="iconbtn act-props"><svg width="18" height="18"><use href="#i-info"/></svg><span>Properti</span></button>
              <button class="iconbtn act-read"><svg width="18" height="18"><use href="#i-link"/></svg><span>Baca</span></button>
            </div>
          </div>
        </div>`;
      card.querySelector('.act-copy').addEventListener('click', async()=>{ await navigator.clipboard?.writeText(p.url); bubble('Tautan disalin ✅','success','system'); });
      card.querySelector('.act-comment').addEventListener('click', ()=>openRight('comments',p));
      card.querySelector('.act-props').addEventListener('click', ()=>openRight('meta',p));
      card.querySelector('.act-read').addEventListener('click', ()=>renderReader(p));
      return card;
    }
  
    /* Reader */
    function renderReader(p){
      activePost=p;
      const mins=minutesRead(p.content);
      const art=document.createElement('article'); art.className='readercard';
      art.innerHTML=`
        <header class="reader-head">
          <h1 class="title">${p.title}</h1>
          <div class="reader-meta">
            <span><svg width="18" height="18"><use href="#i-user"/></svg> ${p.author}</span>
            <span><svg width="18" height="18"><use href="#i-calendar"/></svg> ${new Date(p.date).toLocaleDateString()}</span>
            <span><svg width="18" height="18"><use href="#i-clock"/></svg> ${mins} menit baca</span>
            <span><svg width="18" height="18"><use href="#i-tag"/></svg> ${p.labels.join(', ')}</span>
          </div>
        </header>
        <div class="reader-body" id="readerArticle">
          <img src="${p.image}" alt="Gambar utama: ${p.title}" width="768" height="480" fetchpriority="high" decoding="async">
          ${p.content}
        </div>
        <div class="reader-actions" role="group" aria-label="Aksi artikel">
          <button class="iconbtn act-copy"><svg width="18" height="18"><use href="#i-copy"/></svg><span>Salin tautan</span></button>
          <button class="iconbtn act-comment"><svg width="18" height="18"><use href="#i-comment"/></svg><span>Komentar</span></button>
          <button class="iconbtn act-props"><svg width="18" height="18"><use href="#i-info"/></svg><span>Properti</span></button>
        </div>`;
      $$('.readercard',roomchat).forEach(n=>n.remove());
      const stick=nearBottom();
      roomchat.appendChild(art);
      if(stick) smartScroll(); else updateSmart();
      buildToc();
      art.querySelector('.act-copy').addEventListener('click', async()=>{ await navigator.clipboard?.writeText(p.url); bubble('Tautan disalin ✅','success','system'); });
      art.querySelector('.act-comment').addEventListener('click', ()=>openRight('comments',p));
      art.querySelector('.act-props').addEventListener('click', ()=>openRight('meta',p));
    }
  
    /* Right sidebar (force-open) */
    function setRsTab(name){
      rsTabs.forEach(t=>t.classList.toggle('is-active',t.dataset.tab===name));
      ['meta','toc','comments'].forEach(id=>$('#rs-'+id).classList.toggle('is-active', id===name));
    }
    rsTabs.forEach(btn=>btn.addEventListener('click',()=>setRsTab(btn.dataset.tab)));
  
    function openRight(tab='meta', p=activePost){
      if(!p) return; activePost=p;
      rsMeta.innerHTML=`
        <div class="meta-list">
          <div class="meta-row"><svg width="18" height="18"><use href="#i-link"/></svg><a href="${p.url}" target="_blank" rel="noopener noreferrer">${p.url}</a></div>
          <div class="meta-row"><svg width="18" height="18"><use href="#i-user"/></svg><span>${p.author}</span></div>
          <div class="meta-row"><svg width="18" height="18"><use href="#i-calendar"/></svg><span>${new Date(p.date).toLocaleString()}</span></div>
          <div class="meta-row"><svg width="18" height="18"><use href="#i-tag"/></svg><span>${p.labels.join(', ')}</span></div>
          <div class="meta-row"><svg width="18" height="18"><use href="#i-clock"/></svg><span>${minutesRead(p.content)} menit baca</span></div>
          <div class="meta-row"><svg width="18" height="18"><use href="#i-info"/></svg><span>ID: ${p.id}</span></div>
        </div>`;
      buildToc();
      renderComments();
      setRsTab(tab);
      // FORCE open & focus
      setHidden(sidebarRight,false);
      void sidebarRight.offsetWidth;
      sidebarRight.classList.add('is-open');
      openOverlay();
      trapFocus(sidebarRight,true);
    }
  
    function buildToc(){
      const host=$('#readerArticle'); if(!host){ rsToc.innerHTML='<p class="small">Tidak ada konten.</p>'; return; }
      const hs=$$('h2, h3',host); rsToc.innerHTML='<div class="toc-list"></div>'; const list=$('.toc-list',rsToc);
      hs.forEach((h,i)=>{ const id=h.id||`sec-${i+1}`; h.id=id; const a=document.createElement('a'); a.href=`#${id}`; a.textContent=h.textContent; a.style.paddingLeft=h.tagName==='H3'?'16px':'0px'; list.appendChild(a); });
    }
    function renderComments(){
      const p=activePost; rsComments.innerHTML=(p.comments?.map(c=>`
        <div class="comment-card">
          <div class="who">${c.name} • <span class="small">${c.time}</span></div>
          <div class="text">${c.text}</div>
        </div>`).join('')) || '<p class="small">Belum ada komentar.</p>';
    }
    replySend.addEventListener('click', ()=>{
      const v=replyInput.value.trim(); if(!v||!activePost) return;
      activePost.comments=activePost.comments||[];
      activePost.comments.push({id:'c'+(activePost.comments.length+1),name:'Anda',time:new Date().toLocaleString(),text:v});
      replyInput.value=''; renderComments(); setRsTab('comments');
    });
  
    /* Labels (10 dummy extra) */
    function buildLabels(){
      const map=new Map(); posts.forEach(p=>p.labels.forEach(l=>map.set(l,(map.get(l)||0)+1)));
      const extras=['Design','Product','AI','ML','Research','Tutorial','Tips','News','Events','Community'];
      extras.forEach(l=>map.set(l,map.get(l)||0));
      const labels=[...map.keys()].sort((a,b)=>a.localeCompare(b,'id'));
      labelListEl.innerHTML =
        `<button class="label-item is-active" data-label="__all">
          <svg width="16" height="16"><use href="#i-tag"/></svg><span>Semua</span><span class="count">${posts.length}</span></button>` +
        labels.map(l=>`<button class="label-item" data-label="${l}">
          <svg width="16" height="16"><use href="#i-tag"/></svg><span>${l}</span><span class="count">${map.get(l)}</span></button>`).join('');
      labelListEl.querySelectorAll('.label-item').forEach(btn=>{
        btn.addEventListener('click',()=>{
          labelListEl.querySelectorAll('.label-item').forEach(b=>b.classList.remove('is-active'));
          btn.classList.add('is-active');
          const lab=btn.dataset.label;
          const src = lab==='__all'? posts : posts.filter(p=>p.labels.includes(lab));
          const sorted=[...src].sort((a,b)=>a.title.localeCompare(b.title,'id'));
          renderFeed(sorted);
          bubble(`Label: <b>${lab==='__all'?'Semua':lab}</b> • ${sorted.length} pos`,'info','system');
        });
      });
    }
  
    /* Pages click (dummy) */
    pageListEl.addEventListener('click',(e)=>{
      const a=e.target.closest('.page-item'); if(!a) return;
      e.preventDefault();
      bubble(`Buka halaman: <b>${a.textContent.trim()}</b> (dummy)`, 'info','system');
    });
  
    /* Chat */
    const doSend=()=>{ const t=chatInput.value.trim(); if(!t) return; lastSent=t; bubble(t,'success','user'); chatInput.value=''; chatInput.focus(); };
    const doClear=()=>{ chatInput.value=''; chatInput.focus(); };
    const doAttach=()=>filePicker.click();
    const doMic=()=>bubble('🎤 Mic demo ON/OFF.','warn','system');
  
    chatForm.addEventListener('click',(e)=>{
      const btn=e.target.closest('[data-action]'); if(!btn) return;
      switch(btn.dataset.action){
        case 'toggle-left':toggleLeft();break;
        case 'toggle-dock':openDock();break;
        case 'emoji':chatInput.setRangeText('😊',chatInput.selectionStart,chatInput.selectionEnd,'end');chatInput.focus();break;
        case 'attach':doAttach();break;
        case 'mic':doMic();break;
        case 'clear':doClear();break;
        case 'send':e.preventDefault();doSend();break;
      }
    });
    chatForm.addEventListener('submit',(e)=>{e.preventDefault();doSend();});
    filePicker.addEventListener('change',()=>{ const fs=Array.from(filePicker.files||[]); if(!fs.length) return; bubble(`📎 ${fs.map(f=>f.name).join(', ')}`,'info','system'); filePicker.value=''; });
  
    /* Dockbar clicks */
    dockbar.addEventListener('click',(e)=>{
      const b=e.target.closest('[data-action]'); if(!b) return;
      const act=b.dataset.action, val=b.dataset.value, delta=parseFloat(b.dataset.delta||'0');
      if(act==='close') return closeDock();
      if(act==='theme'){ document.body.dataset.theme=val; localStorage.setItem('theme',val); bubble(`Tema: <b>${val}</b>`,'success','system'); updateBackground(); return; }
      if(act==='tsize'){ const curr=+(getComputedStyle(document.documentElement).getPropertyValue('--ts'))||1; const next=Math.min(1.25,Math.max(0.85,+(curr+delta).toFixed(2))); document.documentElement.style.setProperty('--ts',next); bubble(`Ukuran teks: ${Math.round(next*100)}%`,'info','system'); return; }
      if(act==='density'){ document.body.dataset.density=val; bubble(`Density <b>${val}</b>`,'info','system'); measureChatbar(); return; }
      if(act==='bubble'){ document.body.dataset.bubble=val; bubble(`Bubble: <b>${val}</b>`,'info','system'); return; }
      if(act==='motion'){ document.body.dataset.motion=val; bubble(`Motion: <b>${val}</b>`,'warn','system'); updateBackground(); return; }
      if(act==='ground'){ document.body.dataset.ground=val; bubble(`Ground: <b>${val}</b>`,'info','system'); return; }
      if(act==='bg'){ document.body.dataset.bg=val; bubble(`Background: <b>${val}</b>`,'info','system'); updateBackground(); return; }
      if(act==='focus'){ document.body.dataset.focus=val; bubble(`Mode: <b>${val}</b>`,'info','system'); return; }
      if(act==='reset'){ document.documentElement.style.setProperty('--ts',1); document.body.dataset.density='comfortable'; document.body.dataset.bubble='fit'; document.body.dataset.motion='on'; document.body.dataset.ground='on'; document.body.dataset.bg='static'; document.body.dataset.focus='off'; bubble('Reset ke default.','info','system'); measureChatbar(); updateBackground(); return; }
    });
    dockScrim.addEventListener('click',closeDock);
  
    /* Keyboard */
    document.addEventListener('keydown',(e)=>{
      const mod=e.ctrlKey||e.metaKey;
      if(e.key==='Escape'){ if(!dockbar.hasAttribute('hidden')) return closeDock();
        if(!sidebarLeft.hasAttribute('hidden')||!sidebarRight.hasAttribute('hidden')){ toggleLeft(false); toggleRight(false); return; }
        if(document.activeElement===chatInput && chatInput.value){ chatInput.value=''; return; } }
      if(e.key==='/' && !mod && document.activeElement!==chatInput){ e.preventDefault(); chatInput.focus(); chatInput.select(); return; }
      if(mod && e.key===','){ e.preventDefault(); openDock(); return; }
      if(mod && e.key.toLowerCase()==='l'){ e.preventDefault(); toggleLeft(); return; }
      if(mod && e.key.toLowerCase()==='r'){ e.preventDefault(); toggleRight(); return; }
      if(document.activeElement===chatInput && e.key==='Enter'){ e.preventDefault(); doSend(); return; }
      if(document.activeElement===chatInput && e.key==='ArrowUp' && !chatInput.value){ chatInput.value=lastSent; chatInput.selectionStart=chatInput.selectionEnd=chatInput.value.length; }
    });
  
    /* Gestures (mobile) */
    if('ontouchstart' in window){
      let sx=0,sy=0,start=null,draggingSheet=false;
      const onStart=(ev)=>{ const t=ev.touches[0]; sx=t.clientX; sy=t.clientY; start={x:sx,y:sy,time:Date.now()};
        if(!dockbar.hasAttribute('hidden')){ const r=dockSheet.getBoundingClientRect(); if(t.clientY>=r.top && t.clientY<=r.bottom) draggingSheet=true; } };
      const onMove=(ev)=>{ if(!start) return; const t=ev.touches[0], dx=t.clientX-start.x, dy=t.clientY-start.y;
        if(sx<24 && dx>40 && sidebarLeft.hasAttribute('hidden')){ toggleLeft(true); start=null; }
        if(sx>innerWidth-24 && dx<-40 && sidebarRight.hasAttribute('hidden')){ toggleRight(true); start=null; }
        if(sy<24 && dy>40 && dockbar.hasAttribute('hidden')){ openDock(); start=null; }
        if(draggingSheet){ ev.preventDefault(); dockSheet.style.transform=`translateY(${Math.min(0,dy)}px)`; } };
      const onEnd=(ev)=>{ if(draggingSheet){ const dt=Date.now()-start.time, dy=ev.changedTouches[0].clientY-start.y, vel=-dy/Math.max(dt,1); if(dy<-80 || vel>.7) closeDock(); dockSheet.style.transform=''; } draggingSheet=false; start=null; };
      document.addEventListener('touchstart',onStart,{passive:true});
      document.addEventListener('touchmove',onMove,{passive:false});
      document.addEventListener('touchend',onEnd,{passive:true});
    }
  
    /* Overlay click */
    overlay.addEventListener('click',()=>{ toggleLeft(false); toggleRight(false); });
  
    /* INIT */
    document.addEventListener('DOMContentLoaded',()=>{
      bubble('Selamat datang di Gaga 👋','info','system');
  
      renderFeed(posts);
      renderReader(posts[0]);
      buildLabels();
  
      const saved=localStorage.getItem('theme'); if(saved) document.body.dataset.theme=saved;
  
      measureChatbar();
      (window.requestIdleCallback||setTimeout)(updateBackground, 500);
  
      chatInput.addEventListener('focus', ()=>setTimeout(smartScroll,0));
      window.addEventListener('resize', ()=>{ measureChatbar(); updateSmart(); }, {passive:true});
      window.addEventListener('orientationchange', ()=>{ measureChatbar(); updateSmart(); });
      updateSmart();
    });
  })();
  