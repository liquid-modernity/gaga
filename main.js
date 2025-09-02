/* =======================================
   Gaga Frame — main.js (V1)
   Fokus: purge dummy (opsional), smart scroll,
   readtime, copy link, open panel kanan,
   scroll to dockbar. SPA full akan menyusul.
======================================= */

(function(){
  'use strict';

  /* ===== helpers */
  const $  = (sel,root=document)=>root.querySelector(sel);
  const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const on = (el,ev,fn,opt)=>el && el.addEventListener(ev,fn,opt);

  const body     = document.body;
  const room     = $('#roomchat');
  const feed     = $('#feed');
  const dockbar  = $('#dockbar');
  const sbRight  = $('#sidebarRight');

  /* ===== 1) Dummy controller: ON jika body[data-dummy="true"], OFF => purge */
  (function dummyController(){
    const keepDummy = body.getAttribute('data-dummy') === 'true';
    if (!keepDummy) {
      $$('[data-dummy="true"],[data-ghost="true"]').forEach(n=>n.remove());
    } else {
      // tandai supaya jelas saat uji, tanpa tergantung CSS eksternal
      const style = document.createElement('style');
      style.textContent = '[data-dummy="true"]{outline:2px dashed #d81b60;outline-offset:3px}';
      document.head.appendChild(style);
    }
  })();

  /* ===== 2) Readtime autopaint (berdasar data-words) */
  (function paintReadtime(root=document){
    const els = $$('.readtime[data-words]', root);
    els.forEach(el=>{
      const words = parseInt(el.getAttribute('data-words')||'0',10);
      const wpm   = 200;
      const min   = Math.max(1, Math.round(words / wpm));
      el.textContent = `~${min} min`;
    });
  })();

  /* ===== 3) Copy link util (fallback) */
  async function copyToClipboard(text){
    try{
      await navigator.clipboard.writeText(text);
      announce('Tautan disalin.');
    }catch(e){
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly','');
      ta.style.position='fixed'; ta.style.left='-9999px';
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); announce('Tautan disalin.'); }
      catch(err){ announce('Gagal menyalin tautan.'); }
      document.body.removeChild(ta);
    }
  }
  function announce(msg){
    const live = $('#announce');
    if(!live) return;
    live.textContent = msg;
  }

  /* ===== 4) SmartScroll (di container roomchat) */
  (function smartScroll(){
    const btn = $('#smartScroll');
    if (!room || !btn) return;

    const reveal = ()=>{
      const nearBottom = Math.abs(room.scrollHeight - room.clientHeight - room.scrollTop) < 64;
      btn.hidden = nearBottom;
    };
    on(room,'scroll',reveal,{passive:true});
    on(window,'resize',reveal,{passive:true});
    on(btn,'click',()=>{ room.scrollTo({top:room.scrollHeight, behavior:'smooth'}); });
    // initial
    requestAnimationFrame(reveal);
  })();

  /* ===== 5) Event delegation di stream: komentar/properti/copy/baca */
  (function wireRoom(){
    if (!room) return;

    on(room,'click', (ev)=>{
      const btn = ev.target.closest('button, a');
      if(!btn) return;

      const aria = (btn.getAttribute('aria-label')||'').toLowerCase();

      // Komentar => buka sidebarright, fokus area komentar
      if (aria.includes('komentar')) {
        openRight('comments');
        ev.preventDefault();
        return;
      }

      // Properti => buka sidebarright, fokus meta
      if (aria.includes('properti')) {
        openRight('meta');
        ev.preventDefault();
        return;
      }

      // Salin tautan
      if (aria.includes('salin')) {
        const link = computeCurrentPermalink(btn);
        copyToClipboard(link);
        ev.preventDefault();
        return;
      }

      // Baca (demo): scroll ke readercard bila ada
      if (aria.startsWith('baca')) {
        const reader = $('.readercard');
        if (reader) { reader.scrollIntoView({behavior:'smooth', block:'start'}); fillMetaFromCard(reader); }
        openRight('meta');
        ev.preventDefault();
        return;
      }
    });
  })();

  function computeCurrentPermalink(el){
    // V1: gunakan URL saat ini. Saat SPA aktif, ganti dengan permalink post.
    return location.href.split('#')[0];
  }

  function fillMetaFromCard(card){
    const title  = card.querySelector('h2,h3')?.textContent?.trim() || '—';
    const author = card.querySelector('.meta strong')?.textContent?.trim() || '—';
    const date   = (card.querySelector('.meta')?.textContent || '').match(/\d{1,2}\s\w+\s\d{4}/)?.[0] || '—';
    const read   = card.querySelector('.readtime')?.textContent?.trim() || '—';
    const labels = $$('.meta a',card).map(a=>a.textContent.trim()).join(', ') || '—';

    $('#m-title')  && ($('#m-title').textContent  = title);
    $('#m-author') && ($('#m-author').textContent = author);
    $('#m-date')   && ($('#m-date').textContent   = date);
    $('#m-labels') && ($('#m-labels').textContent = labels);
    $('#m-read')   && ($('#m-read').textContent   = read);
    $('#m-words')  && ($('#m-words').textContent  = (card.querySelector('.readtime')?.getAttribute('data-words') || '—'));
    $('#m-link')   && ($('#m-link').textContent   = computeCurrentPermalink(card));
  }

  function openRight(section){
    if (!sbRight) return;
    // sidebars selalu tampak; cukup scroll ke atas & fokus pane
    sbRight.scrollIntoView({behavior:'smooth', block:'nearest'});
    // switch pane (jika ada)
    $$('.rs-pane', sbRight).forEach(p=>p.classList.remove('is-active'));
    const paneId = section==='comments' ? '#rs-comments' : section==='toc' ? '#rs-toc' : '#rs-meta';
    const pane = $(paneId, sbRight);
    pane && pane.classList.add('is-active');
  }

  /* ===== 6) Dockbar interactions (V1: scroll-into-view) */
  (function wireDock(){
    const openBtn = $('#chatbar [aria-label="Buka Dockbar"]');
    const closeBtn= $('#dockbar .btn-icon[aria-label="Tutup Dockbar"]');
    if (openBtn && dockbar) on(openBtn,'click', ()=> dockbar.scrollIntoView({behavior:'smooth', block:'start'}));
    if (closeBtn && dockbar) on(closeBtn,'click', ()=>{
      // untuk V1 cukup “menutup” dengan menggeser fokus keluar
      $('#chatInput')?.focus();
    });
  })();

  /* ===== 7) Aksesibilitas kecil: announce saat tombol simpan/bagikan dummy ditekan */
  (function affordances(){
    on(document,'click',(e)=>{
      const btn = e.target.closest('button.iconbtn');
      if(!btn) return;
      const label = (btn.getAttribute('aria-label')||'').toLowerCase();
      if (label.includes('simpan')) announce('Disimpan (dummy).');
      if (label.includes('bagikan')) announce('Bagikan (dummy).');
    });
  })();

  /* ===== 8) Anti-lebar meledak: jaga media di readercard/feed (kalau ada konten lain masuk) */
  (function guardMedia(){
    const css = document.createElement('style');
    css.textContent = `
      #roomchat img, #feed img, .readercard img { max-width:100%; height:auto }
      #roomchat table, #feed table { max-width:100%; display:block; overflow:auto }
      #roomchat pre, #feed pre { max-width:100%; overflow:auto }
    `;
    document.head.appendChild(css);
  })();

  /* ===== 9) (Stub) Router utilities — placeholder aman */
  window.normalizeLink = function normalizeLink(url){
    try{
      const u = new URL(url, location.origin);
      return u.href;
    }catch(e){ return url; }
  };
  window.isPermalinkURL = function isPermalinkURL(url){
    // V1 stub: true jika mengandung ".html" (Blogger posts) atau "/p/"
    return /\.html(\?|#|$)/.test(url) || /\/p\/[^/]+$/.test(url);
  };
  window.extractContentHTML = async function extractContentHTML(htmlOrURL){
    // V1 stub: kembalikan string HTML aman seadanya (tanpa eksekusi)
    if (/^https?:\/\//i.test(htmlOrURL)) {
      // tidak fetch di V1; hanya kembalikan placeholder
      return '<p>(extractContentHTML V1 placeholder)</p>';
    }
    return String(htmlOrURL || '');
  };

  /* ===== 10) Boot finish */
  // isi meta dari readercard dummy bila ada
  const rc = $('.readercard'); if (rc) fillMetaFromCard(rc);

})();
