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
