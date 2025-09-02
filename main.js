// ===== V2 interaction: single-scroll helpers =====
(function(){
  const scrollEl = document.querySelector('.center-wrap');
  const smart = document.getElementById('smartScroll');
  const dock = document.getElementById('dockbar');
  const openBtn = document.querySelector('[aria-label="Buka Dockbar"]');
  const closeBtn = dock?.querySelector('.btn-icon[aria-label="Tutup Dockbar"]');

  if (scrollEl && smart){
    const atBottom = () => (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight) < 120;
    const toggleSmart = () => smart.toggleAttribute('hidden', atBottom());
    scrollEl.addEventListener('scroll', toggleSmart, {passive:true});
    toggleSmart();
    smart.addEventListener('click', () => { scrollEl.scrollTo({top: scrollEl.scrollHeight, behavior:'smooth'}); });
  }

  // focus trap sederhana utk Dockbar (dibuka manual oleh user)
  let lastFocus = null;
  const trap = (on) => {
    if (!dock) return;
    const focusables = dock.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length-1];

    function loop(e){
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
    if (on){
      lastFocus = document.activeElement;
      document.body.setAttribute('inert','');  // nonaktifkan klik area lain (fallback sederhana)
      dock.addEventListener('keydown', loop);
      first.focus();
    }else{
      document.body.removeAttribute('inert');
      dock.removeEventListener('keydown', loop);
      lastFocus && lastFocus.focus();
    }
  };

  openBtn && openBtn.addEventListener('click', ()=> { trap(true); });
  closeBtn && closeBtn.addEventListener('click', ()=> { trap(false); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') trap(false); });
})();



/* ===== Blogger A11y Bundle: Enhancer + Guard ===== */
(function(){
  'use strict';

  function textFromChildren(el){
    const clone = el.cloneNode(true);
    clone.querySelectorAll('svg, style, script').forEach(n=>n.remove());
    clone.querySelectorAll('img:not([alt]), img[alt=""]').forEach(n=>n.remove());
    return (clone.textContent || '').replace(/\s+/g,' ').trim();
  }

  function wrapVideoAndIframes(scope){
    scope.querySelectorAll('iframe, video').forEach(el=>{
      if(!el.closest('.video-frame')){
        const w = document.createElement('div');
        w.className = 'video-frame';
        el.parentNode.insertBefore(w, el); w.appendChild(el);
      }
      if(el.tagName==='IFRAME'){
        // judul fallback
        if(!el.title || !el.title.trim()){
          let host='sematan';
          try{ host=new URL(el.src).hostname.replace(/^www\./,''); }catch(e){}
          el.title='Frame: '+host;
          console.warn('[A11y] <iframe> tanpa title → fallback ditambahkan', el);
        }
        if(!el.hasAttribute('loading')) el.setAttribute('loading','lazy');
        if(!el.hasAttribute('referrerpolicy')) el.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
      }
      if(el.tagName==='VIDEO'){
        if(!el.hasAttribute('controls')) el.setAttribute('controls','');
      }
    });
  }

  function enhanceTables(scope){
    scope.querySelectorAll('table').forEach(t=>{
      // bungkus scroller
      if(!t.closest('.table-scroller')){
        const s=document.createElement('div'); s.className='table-scroller'; s.tabIndex=0;
        const cap=t.querySelector(':scope > caption');
        if(cap){ if(!cap.id) cap.id='cap-'+Math.random().toString(36).slice(2,9);
          s.setAttribute('aria-labelledby', cap.id);
        } else { s.setAttribute('aria-label','Tabel data'); }
        t.parentNode.insertBefore(s,t); s.appendChild(t);
      }
      // role + scope minimal
      if(!t.hasAttribute('role')) t.setAttribute('role','table');
      t.querySelectorAll('thead th:not([scope])').forEach(th=>th.setAttribute('scope','col'));
      t.querySelectorAll('tbody th:not([scope])').forEach(th=>th.setAttribute('scope','row'));
    });
  }

  function ensureAccessibleNames(scope){
    // tombol, link, menuitem
    scope.querySelectorAll('a, button, [role="button"], [role="menuitem"]').forEach(el=>{
      const hasName=(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby'));
      const txt=textFromChildren(el);
      if(!hasName && !txt){
        const guess=el.title||el.getAttribute('data-title')||(el.tagName==='A'?'Tautan':'Tombol');
        el.setAttribute('aria-label', guess);
        console.warn('[A11y] Elemen perintah tanpa nama → aria-label fallback', el);
      }
    });
    // input/aria input
    scope.querySelectorAll('input, textarea, select, [role="textbox"], [role="combobox"]').forEach(el=>{
      const ok = el.getAttribute('aria-labelledby') || el.getAttribute('aria-label') ||
                 (el.id && document.querySelector('label[for="'+el.id+'"]'));
      if(!ok){
        el.setAttribute('aria-label','Kolom input');
        console.warn('[A11y] Input tanpa label → aria-label fallback', el);
      }
    });
    // meter/progress/toggle/tooltip/treeitem (jika muncul di konten)
    scope.querySelectorAll('meter,[role="meter"],progress,[role="progressbar"],[role="switch"],[role="checkbox"],[role="tooltip"],[role="treeitem"]').forEach(el=>{
      if(!(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby'))){
        const name = el.getAttribute('role') || el.tagName.toLowerCase();
        el.setAttribute('aria-label', name.charAt(0).toUpperCase()+name.slice(1));
        console.warn('[A11y] '+name+' tanpa nama → aria-label fallback', el);
      }
    });
  }

  function lintDl(scope){
    scope.querySelectorAll('dl').forEach(dl=>{
      const kids=[...dl.children];
      const bad=kids.some(n=>!['DT','DD','SCRIPT','TEMPLATE','DIV'].includes(n.tagName));
      if(bad) console.warn('[A11y] <dl> berisi elemen non-<dt>/<dd>', dl);
      // urutan dt→dd berpasangan
      let last=null, ok=true;
      kids.forEach(n=>{
        if(n.tagName==='DT'){ last='DT'; }
        else if(n.tagName==='DD'){ if(last!=='DT') ok=false; last='DD'; }
      });
      if(!ok) console.warn('[A11y] Urutan <dt>/<dd> tidak rapi', dl);
    });
  }

  function guardMetaRefresh(){
    document.querySelectorAll('meta[http-equiv="refresh"]').forEach(m=>{
      console.warn('[A11y] Hindari <meta http-equiv="refresh">', m);
    });
  }

  function enhance(root){
    const scope = root instanceof Element ? root : document;
    const region = scope.querySelector('.post-body') || scope;
    wrapVideoAndIframes(region);
    enhanceTables(region);
    ensureAccessibleNames(region);
    lintDl(region);
    guardMetaRefresh();
  }

  // init + observe
  const run=()=>enhance(document);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', run, {once:true});
  else run();

  const target=document.querySelector('.post-body')||document.body;
  if(window.MutationObserver && target){
    new MutationObserver(muts=>{
      muts.forEach(m=>m.addedNodes.forEach(n=>{ if(n.nodeType===1) enhance(n); }));
    }).observe(target,{childList:true,subtree:true});
  }
})();

