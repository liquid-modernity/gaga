/* Gaga SPA stream — compact, no deps.
   Menggabungkan pola dari referensi kamu untuk kestabilan & SEO. */

// ====== CONFIG
const BLOG_BASE = document.body.getAttribute('data-blog');
const MAX_POP = +(document.body.dataset.popcount || 4);
const MAX_FEAT = +(document.body.dataset.featcount || 4);
const SIMILAR_MAX = 3;
const SUMMARY_WORDS = 28;

// ====== UTILS
const $ = (sel,root=document)=>root.querySelector(sel);
const $$ = (sel,root=document)=>[...root.querySelectorAll(sel)];
const esc = s => (s||'').replace(/[<>&]/g,m=>m==='<'?'&lt;':m==='>'?'&gt;':'&amp;');
const strip = html => {
  const d=document.createElement('div'); d.innerHTML=html||'';
  return (d.textContent||d.innerText||'').trim();
};
const wordsLimit=(text,n)=>{
  const w=(strip(text)||'').split(/\s+/).filter(Boolean);
  return w.length<=n?w.join(' '):w.slice(0,n).join(' ')+'…';
};
const dateStrLong = iso=>{
  if(!iso) return '';
  const d=new Date(iso); if(!isFinite(d)) return '';
  return d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
};
const blogHome = ()=>{
  try{ return new URL('/', BLOG_BASE||location.origin).toString(); }catch(_){ return '/'; }
};
const abs = u => /^https?:\/\//i.test(u) ? u : blogHome().replace(/\/+$/,'') + '/' + String(u||'').replace(/^\/+/,'');
// diadaptasi dari referensi
function normalizeLink(u){ try{
  const x=new URL(u,location.href); x.hash='';
  if(x.search==='?m=1') x.search='';
  return x.toString();
}catch(_){ return String(u||'').replace(/\?m=1\b/, '').replace(/#.*$/,''); } } /* :contentReference[oaicite:12]{index=12} */
function isPermalinkURL(s){ try{
  const u=new URL(s,location.href);
  if(u.host!==location.host) return false;
  return /\/\d{4}\/\d{2}\/.+\.html$/.test(u.pathname);
}catch(_){ return false; } } /* :contentReference[oaicite:13]{index=13} */

// ekstraksi aman isi artikel lintas tema
function extractContentHTML(doc){
  const sel=['.post .post-body','.post-body','[itemprop="articleBody"]','article .entry-content','.entry-content','#post-body','#postbody'];
  let el=null; for(let i=0;i<sel.length && !el;i++) el=doc.querySelector(sel[i]);
  if(!el) el=doc.querySelector('article')||doc.querySelector('#main')||doc.body;
  const clone=el.cloneNode(true);
  clone.querySelectorAll('script,style,link[rel="preload"],iframe[src^="javascript:"]').forEach(n=>n.remove());
  clone.querySelectorAll('img').forEach(img=>{
    const ds=img.getAttribute('data-src')||img.getAttribute('data-original')||img.getAttribute('data-lazy-src');
    if(ds && !img.getAttribute('src')) img.setAttribute('src',ds);
    if(!img.getAttribute('src') && img.getAttribute('srcset')){
      const f=img.getAttribute('srcset').split(',')[0].trim().split(' ')[0]; if(f) img.setAttribute('src',f);
    }
    img.removeAttribute('width'); img.removeAttribute('height'); img.loading='lazy';
    img.referrerPolicy='no-referrer-when-downgrade';
  });
  return clone.innerHTML||'';
} /* :contentReference[oaicite:14]{index=14} */

// ====== FEEDS (JSONP Blogger)
function feedSummary(kind,params){
  const base=(kind==='pages')?'feeds/pages/summary':'feeds/posts/summary';
  const q=[]; for(const k in params){ if(params[k]!=null) q.push(encodeURIComponent(k)+'='+encodeURIComponent(params[k])); }
  return base + (q.length?('?'+q.join('&')):'');
} /* :contentReference[oaicite:15]{index=15} */
function feedItem(kind,id){ const base=(kind==='pages')?'feeds/pages/default/':'feeds/posts/default/'; return base+id; } /* :contentReference[oaicite:16]{index=16} */
function feedLabel(label,params){
  const base='feeds/posts/summary/-/'+encodeURIComponent(label), q=[];
  for(const k in params){ if(params[k]!=null) q.push(encodeURIComponent(k)+'='+encodeURIComponent(params[k])); }
  return base+(q.length?('?'+q.join('&')):'');
} /* :contentReference[oaicite:17]{index=17} */

function jsonp(url,ok,err,timeout){
  let done=false,cb='__cb'+Date.now()+String(Math.random()).slice(2);
  window[cb]=data=>{ done=true; cleanup(); ok && ok(data); };
  function cleanup(){ try{ delete window[cb]; }catch(_){ window[cb]=undefined } s.remove(); clearTimeout(to); }
  const sep=url.indexOf('?')>=0?'&':'?', s=document.createElement('script');
  s.src=abs(url)+sep+'alt=json-in-script&callback='+cb;
  s.onerror=()=>{ cleanup(); err&&err(); };
  document.body.appendChild(s);
  const to=setTimeout(()=>{ if(!done){ cleanup(); err&&err(); } }, timeout||15000);
} /* :contentReference[oaicite:18]{index=18} */

// ====== MAP/ENTITY
const altLink=e=>((e.link||[]).find(L=>L.rel==='alternate')||{}).href || '';
const getId=e=>{const s=(e.id&&e.id.$t)||''; const m=s.match(/post-(\d+)$/)||s.match(/page-(\d+)$/); return m?m[1]:'';};
const findFirstImage=html=>{const m=(html||'').match(/<img[^>]+src=["']([^"']+)["']/i); return m?m[1]:'';};
const fallbackDateFromURL=u=>{try{const m=(new URL(u,location.href)).pathname.match(/\/(\d{4})\/(\d{2})\//); if(!m)return''; const d=new Date(`${m[1]}-${m[2]}-01T00:00:00Z`); return dateStrLong(d.toISOString());}catch(_){return'';}};
function normDate(txt){ return txt && txt.trim()?txt:'(tanpa tanggal)'; }
const typeName=t=>t==='pages'?'Pages':'Articles';
function mapEntry(e,type){
  const t=(e.title&&e.title.$t)||'', p=normalizeLink(altLink(e));
  const pub=(e.published&&e.published.$t)||'', upd=(e.updated&&e.updated.$t)||'';
  const sum=(e.summary&&e.summary.$t)||(e.content&&e.content.$t)||'';
  const labels=(e.category||[]).map(c=>c.term).filter(Boolean).sort((a,b)=>a.localeCompare(b,'id',{sensitivity:'base'}));
  const iso=pub||upd||''; const dateTxt = normDate(dateStrLong(iso)||fallbackDateFromURL(p));
  const thumb=(e['media$thumbnail']&&e['media$thumbnail'].url)||findFirstImage(sum);
  return {id:getId(e),type,title:t,permalink:p,date:dateTxt,dateISO:iso,summaryText:wordsLimit(sum,SUMMARY_WORDS),labels,thumb};
} /* :contentReference[oaicite:19]{index=19} */

// ====== STATE
const E = id=>document.getElementById(id);
const S = {
  room: E('roomchat'), feed: E('feed'), smart: E('smartScroll'),
  left: E('sidebarLeft'), right: E('sidebarRight'), overlay:E('overlay'),
  rsTabs: $$('.rs-tab'), rsMeta:E('rs-meta'), rsToc:E('rs-toc'), rsComments:E('rs-comments'),
  pageList:E('pageList'), labelList:E('labelList')
};

// ====== BUBBLES
function addBubble(kind, html, isHTML=false, extra=''){
  const d=document.createElement('div');
  d.className=`bubble ${kind} ${extra}`.trim();
  if(isHTML) d.innerHTML=html; else d.textContent=html;
  S.room.appendChild(d);
  // keep CLS low
  d.querySelectorAll('img').forEach(img=>img.addEventListener('load',showSmart,{once:true}));
  showSmart();
  return d;
}
function showSmart(){
  S.smart.hidden = S.room.scrollHeight <= S.room.clientHeight + 12 ||
    (S.room.scrollTop >= S.room.scrollHeight - S.room.clientHeight - 1);
}
S.room.addEventListener('scroll',()=>{ showSmart(); });

// ====== POSTCARD / READERCARD
const ICON = {
  open:'<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="1" stroke="currentColor" stroke-width="2"/><path d="M18.2265 11.3805C18.3552 11.634 18.4195 11.7607 18.4195 12C18.4195 12.2393 18.3552 12.366 18.2265 12.6195C17.6001 13.8533 15.812 16.5 12 16.5C8.18799 16.5 6.39992 13.8533 5.77348 12.6195C5.64481 12.366 5.58048 12.2393 5.58048 12C5.58048 11.7607 5.64481 11.634 5.77348 11.3805C6.39992 10.1467 8.18799 7.5 12 7.5C15.812 7.5 17.6001 10.1467 18.2265 11.3805Z" stroke="currentColor" stroke-width="2"/></svg>',
  copy:'<svg viewBox="0 0 24 24" width="20" height="20"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  comment:'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 6h16v10H8l-4 4z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.6"/></svg>',
  info:'<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 10v6M12 7h0" stroke="currentColor" stroke-linecap="round" stroke-width="1.7"/></svg>'
};

const pcThumb = url => url ? `<div class="pc-thumb"><img loading="lazy" src="${esc(url)}" alt="thumb"></div>` : `<div class="pc-thumb"></div>`;
function postcardHTML(it){
  return `<article class="postcard">
    <div class="pc">
      ${pcThumb(it.thumb)}
      <div>
        <div class="pc-title">${esc(it.title)}</div>
        <div class="pc-meta">${esc(typeName(it.type))} · ${esc(it.date||'(tanpa tanggal)')}</div>
        ${it.labels?.length?`<div class="pc-meta">${esc(it.labels.join(' / '))}</div>`:''}
        ${it.summaryText?`<div class="pc-summary">${esc(it.summaryText)}</div>`:''}
        <div class="pc-actions">
          <button class="btn-min" data-open="${esc(normalizeLink(it.permalink))}" data-type="${it.type}" data-id="${esc(it.id)}">${ICON.open}<span>Baca</span></button>
          <button class="btn-min" data-copy="${esc(normalizeLink(it.permalink))}">${ICON.copy}<span>Salin</span></button>
        </div>
      </div>
    </div>
  </article>`;
}
function readerHTML(it){
  return `<article class="readercard">
    ${it.labels?.length?`<div class="pc-meta">${esc(it.labels.join(' / '))}</div>`:''}
    <h3>${esc(it.title)}</h3>
    <div class="pc-meta">${esc(typeName(it.type))} · ${esc(it.date||'(tanpa tanggal)')}</div>
    <div class="content">${it.contentHtml||''}</div>
    <div class="pc-actions">
      <button class="btn-min" data-copy="${esc(normalizeLink(it.permalink))}">${ICON.copy}<span>Salin</span></button>
      <button class="btn-min" data-tabopen="comments">${ICON.comment}<span>Komentar</span></button>
      <button class="btn-min" data-tabopen="meta">${ICON.info}<span>Properti</span></button>
    </div>
  </article>`;
}

// ====== CACHE & PREFETCH
const cache = Object.create(null);
const PF_DELAY = 180;
const putCache = (link,obj)=>cache[normalizeLink(link)] = obj;
const getCache = link => cache[normalizeLink(link)];
function prefetch(link,type,id){
  const key=normalizeLink(link); if(cache[key]) return;
  if(/^\d+$/.test(String(id||''))){
    jsonp(feedItem(type==='pages'?'pages':'posts',id), j=>{
      const e=j&&j.entry; if(e){ putCache(key, mapFull(e,type)); }
    }, ()=>{});
  }else{
    fetchURLasEntry(key).then(it=>putCache(key,it)).catch(()=>{});
  }
} /* :contentReference[oaicite:20]{index=20} */

// ====== FETCH FULL FROM URL (fallback lintas tema)
function fetchURLasEntry(url){
  return new Promise((resolve,reject)=>{
    try{
      const xhr=new XMLHttpRequest(); xhr.open('GET', normalizeLink(url), true);
      xhr.onreadystatechange=function(){
        if(xhr.readyState===4){
          if(xhr.status>=200 && xhr.status<400){
            const html=xhr.responseText, doc=new DOMParser().parseFromString(html,'text/html');
            const title=(doc.querySelector('meta[property="og:title"]')||{}).content
                      || (doc.querySelector('h1.post-title, h1.entry-title')||{}).textContent
                      || doc.title || url;
            const descr=(doc.querySelector('meta[name="description"]')||{}).content
                      || (doc.querySelector('meta[property="og:description"]')||{}).content || '';
            const thumb=(doc.querySelector('meta[property="og:image"]')||{}).content || '';
            const canonical=(doc.querySelector('link[rel="canonical"]')||{}).href
                      || (doc.querySelector('meta[property="og:url"]')||{}).content
                      || normalizeLink(url);
            const idMatch=canonical.match(/post-(\d+)/)||html.match(/post-(\d+)/);
            const id=idMatch?idMatch[1]:'by-url';
            const dateMeta=(doc.querySelector('meta[property="article:published_time"]')||{}).content||'';
            const content=extractContentHTML(doc)||'';
            const dateTxt=normDate(dateStrLong(dateMeta)||fallbackDateFromURL(canonical));
            resolve({id,type:'posts',title,permalink:normalizeLink(canonical),date:dateTxt,dateISO:dateMeta,summaryText:wordsLimit(descr||content,SUMMARY_WORDS),labels:[],thumb,contentHtml:content});
          }else reject();
        }
      }; xhr.send(null);
    }catch(e){ reject(e); }
  });
} /* :contentReference[oaicite:21]{index=21} */

// mapFull untuk JSONP item detail
function mapFull(e,t){ const x=mapEntry(e,t); x.contentHtml=(e.content&&e.content.$t)||(e.summary&&e.summary.$t)||''; return x; } /* :contentReference[oaicite:22]{index=22} */

// ====== RENDER HELPERS
function renderPostcard(it){ addBubble('system', postcardHTML(it), true, 'postcard'); }
function renderReaderCard(it){
  addBubble('system', readerHTML(it), true, 'readercard');
  pushURL(it);               // SPA permalink
}

// ====== RIGHT PANEL (Meta/ToC/Comments placeholder OAuth)
function openRight(tab='meta'){
  document.body.classList.add('right-open');
  $('#sidebarRight').removeAttribute('hidden');
  $('#overlay').removeAttribute('hidden');
  $$('.rs-tab').forEach(b=>b.classList.toggle('is-active', b.dataset.tab===tab));
  $$('.rs-pane').forEach(p=>p.classList.toggle('is-active', p.id==='rs-'+tab));
}
function closeRight(){
  document.body.classList.remove('right-open');
  $('#overlay').setAttribute('hidden','hidden');
  $('#sidebarRight').setAttribute('hidden','hidden');
}
$('#overlay')?.addEventListener('click',()=>{document.body.classList.remove('left-open'); closeRight();});

// ====== LEFT PANEL (Labels 2-level + Pages)
function ensureLabel(name){
  if($(`.label-list .tree [data-label="${CSS.escape(name)}"]`)) return;
  const li=document.createElement('li'); li.className='tree';
  const btn=document.createElement('button');
  btn.className='tree-toggle'; btn.type='button'; btn.setAttribute('aria-expanded','false'); btn.setAttribute('data-label',name);
  btn.innerHTML=`<span class="ico">🏷️</span><span class="tree-name">${esc(name)}</span>`;
  const ul=document.createElement('ul'); ul.className='tree-posts';
  li.append(btn,ul); S.labelList.appendChild(li);
  // sort A–Z label grup
  [...S.labelList.children].sort((a,b)=>a.querySelector('.tree-name').textContent.localeCompare(b.querySelector('.tree-name').textContent,'id',{sensitivity:'base'})).forEach(x=>S.labelList.appendChild(x));
}
function addMoreBtn(ul,label,next){
  const b=document.createElement('button');
  b.className='tree-more'; b.type='button'; b.textContent='Muat lagi';
  b.setAttribute('data-more-label',label); b.setAttribute('data-next-index',String(next));
  ul.appendChild(b);
}
function postLink(it){
  const a=document.createElement('a');
  a.href=normalizeLink(it.permalink);
  a.setAttribute('data-open',normalizeLink(it.permalink));
  a.setAttribute('data-type',it.type); a.setAttribute('data-id',it.id);
  a.title='Buka: '+it.title; a.innerHTML=`<span>${esc(it.title)}</span>`;
  return a;
}
function loadPostsByLabel(label,ul,start){
  const last=ul.querySelector('.tree-more'); if(last) ul.removeChild(last);
  jsonp(feedLabel(label,{'max-results':25,'start-index':start||1}), j=>{
    if(!(j&&j.feed)) return;
    const it=(j.feed.entry||[]).map(e=>mapEntry(e,'posts'));
    it.sort((a,b)=>a.title.localeCompare(b.title,'id',{sensitivity:'base'}));
    const f=document.createDocumentFragment(); it.forEach(v=>f.appendChild(postLink(v)));
    ul.appendChild(f);
    if((j.feed.entry||[]).length===25) addMoreBtn(ul,label,(start||1)+25);
  },()=>{});
}
function loadLabelBatch(){
  jsonp(feedSummary('posts',{'max-results':150,'start-index':1}), j=>{
    (j.feed?.entry||[]).forEach(e=> (e.category||[]).forEach(c=>c.term&&ensureLabel(c.term)));
  },()=>{});
}
function loadPages(){
  jsonp(feedSummary('pages',{'max-results':100}), j=>{
    const arr=(j.feed?.entry||[]).map(e=>mapEntry(e,'pages'));
    const f=document.createDocumentFragment();
    arr.forEach(it=>{
      const li=document.createElement('li'); li.innerHTML=`<a data-open="${esc(normalizeLink(it.permalink))}" data-type="${it.type}" data-id="${it.id}" href="${esc(normalizeLink(it.permalink))}"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span>${esc(it.title)}</span></a>`;
      S.pageList.appendChild(li);
    });
  },()=>{});
}

// ====== HOME STREAM (Sapaan → Popular → Featured → Penutup)
function renderHome(){
  addBubble('system','Halo! Mau baca apa hari ini? 😊',false);
  // Popular (pakai Widget Popular Posts bila tersedia di feed summary)
  jsonp(feedSummary('posts',{'max-results':MAX_POP,orderby:'updated'}), j=>{
    (j.feed?.entry||[]).map(e=>mapEntry(e,'posts')).forEach(renderPostcard);
    // Featured (pakai label Featured jika ada)
    jsonp(feedLabel('Featured',{'max-results':MAX_FEAT}), j2=>{
      (j2.feed?.entry||[]).map(e=>mapEntry(e,'posts')).forEach(renderPostcard);
      addBubble('system','Itu dulu dari saya. Klik **Baca** pada kartu atau pakai sidebar ya.',true);
    },()=>addBubble('system','Selesai memuat. Silakan pilih kartu untuk membaca.',false));
  },()=>addBubble('system','Koneksi sibuk. Muat beranda lagi nanti ya.',false));
}

// ====== OPEN BY LINK (prefers cache → JSONP item → fetch HTML)
function openByLink(link,type,id){
  const key=normalizeLink(link), hit=getCache(key);
  if(hit){ renderReaderCard(hit); similarBelow(hit); return; }
  if(/^\d+$/.test(String(id||''))){
    jsonp(feedItem(type==='pages'?'pages':'posts',id), j=>{
      const e=j&&j.entry; if(e){ const it=mapFull(e,type); putCache(key,it); renderReaderCard(it); similarBelow(it); }
      else { fetchURLasEntry(key).then(it=>{putCache(key,it); renderReaderCard(it); similarBelow(it);}).catch(()=>addBubble('system','Maaf, konten tidak bisa dimuat.',false)); }
    },()=>fetchURLasEntry(key).then(it=>{putCache(key,it); renderReaderCard(it); similarBelow(it);}).catch(()=>addBubble('system','Maaf, konten tidak bisa dimuat.',false)));
  }else{
    fetchURLasEntry(key).then(it=>{putCache(key,it); renderReaderCard(it); similarBelow(it);}).catch(()=>addBubble('system','Maaf, konten tidak bisa dimuat.',false));
  }
} /* :contentReference[oaicite:23]{index=23} */

// Similar posts (3) by first label or by term
function similarBelow(it){
  const label = it.labels && it.labels[0];
  if(!label) return;
  jsonp(feedLabel(label,{'max-results':12}), j=>{
    const arr=(j.feed?.entry||[]).map(e=>mapEntry(e,'posts'))
      .filter(x=>normalizeLink(x.permalink)!==normalizeLink(it.permalink))
      .slice(0,SIMILAR_MAX);
    if(arr.length){
      addBubble('system','Similar posts:',false);
      arr.forEach(renderPostcard);
    }
  },()=>{});
}

// ====== NAV INTERCEPT + PREFETCH
document.addEventListener('mouseover',ev=>{
  const t=ev.target.closest?.('[data-open]'); if(!t) return;
  setTimeout(()=>prefetch(t.getAttribute('data-open'),t.getAttribute('data-type'),t.getAttribute('data-id')), PF_DELAY);
}, true);
document.addEventListener('touchstart',ev=>{
  const t=ev.target.closest?.('[data-open]'); if(!t) return;
  setTimeout(()=>prefetch(t.getAttribute('data-open'),t.getAttribute('data-type'),t.getAttribute('data-id')), PF_DELAY);
},{passive:true});
document.addEventListener('click',ev=>{
  // SidebarLeft tree behaviours
  if(S.left.contains(ev.target)){
    const toggle=ev.target.closest?.('.tree-toggle');
    if(toggle){
      const exp = toggle.getAttribute('aria-expanded')==='true';
      toggle.setAttribute('aria-expanded', exp?'false':'true');
      const ul = toggle.nextElementSibling;
      if(!exp && ul && !ul.childElementCount) loadPostsByLabel(toggle.getAttribute('data-label'), ul, 1);
      return;
    }
    const more=ev.target.closest?.('[data-more-label]');
    if(more){ loadPostsByLabel(more.getAttribute('data-more-label'), more.parentNode, +(more.getAttribute('data-next-index')||1)); return; }
    const a=ev.target.closest?.('a[data-open][data-type][data-id]');
    if(a){ ev.preventDefault(); addBubble('user','Buka: '+(a.textContent||'artikel'),false); openByLink(a.getAttribute('data-open'),a.getAttribute('data-type'),a.getAttribute('data-id')); return; }
  }

  // Open from postcard/readercard
  const openBtn=ev.target.closest?.('button[data-open]');
  if(openBtn){ addBubble('user','Baca: '+((openBtn.closest('.pc')||{}).querySelector('.pc-title')?.textContent||'artikel'),false);
    openByLink(openBtn.getAttribute('data-open'), openBtn.getAttribute('data-type'), openBtn.getAttribute('data-id')); return; }

  const copyBtn=ev.target.closest?.('button[data-copy]');
  if(copyBtn){ const link=copyBtn.getAttribute('data-copy');
    (navigator.clipboard?.writeText(link)||Promise.reject()).then(()=>addBubble('system','Tautannya sudah disalin. 👍',false))
      .catch(()=>{ const tmp=document.createElement('input'); tmp.value=link; document.body.appendChild(tmp); tmp.select(); try{document.execCommand('copy'); addBubble('system','Tautannya sudah disalin. 👍',false);}catch(_){addBubble('system','Gagal menyalin.',false);} tmp.remove(); });
    return; }

  const tabBtn=ev.target.closest?.('[data-tabopen]');
  if(tabBtn){ openRight(tabBtn.getAttribute('data-tabopen')); return; }

  // Dock/overlay closers
  if(ev.target.matches('[data-action="toggle-left"]')){ document.body.classList.toggle('left-open'); $('#sidebarLeft').toggleAttribute('hidden'); $('#overlay').toggleAttribute('hidden'); return; }
  if(ev.target.matches('[data-action="toggle-right"], #overlay')){ closeRight(); return; }
}, true);

// ====== PUSH STATE / POPSTATE (SPA feel)
function pushURL(it){
  try{
    const url=normalizeLink(it.permalink||location.href);
    if(history.pushState && normalizeLink(location.href)!==url){
      history.pushState({kind:it.type||'post',link:url},'',url);
      document.title = (it.title?it.title+' – ':'') + (document.title.split(' | ')[1]||'Gaga');
    }
  }catch(_){}
} /* :contentReference[oaicite:24]{index=24} */
window.addEventListener('popstate',()=>{
  if(isPermalinkURL(location.href)){
    fetchURLasEntry(location.href).then(it=>renderReaderCard(it)).catch(()=>addBubble('system','Artikel sulit dimuat.',false));
  }else{
    S.room.innerHTML=''; renderHome();
  }
}); /* :contentReference[oaicite:25]{index=25} */

// ====== CHATBAR HANDLERS
const chatForm = E('chatForm'), chatInput = E('chatInput'), filePicker = E('filePicker');
chatForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const q=(chatInput?.value||'').trim(); if(!q) return;
  addBubble('user', q, false);
  chatInput.value='';
  // direct permalink open
  if(isPermalinkURL(q)){
    const load=addBubble('system','Memuat artikel…',false);
    fetchURLasEntry(q).then(it=>{ S.room.removeChild(load); renderReaderCard(it); })
      .catch(()=>{ load.textContent='Gagal memuat. Coba lagi.'; });
    return;
  }
  // cari judul
  addBubble('system','Baik, aku carikan yang paling pas…',false);
  runSearch(q);
});

// ====== SEARCH to postcards (posts first, pages if perlu)
function scoreItem(it,q){ const t=(it.title||'').toLowerCase(), term=(q||'').toLowerCase(); let s=0;
  if(!term) return 0; if(t===term) s+=100; if(t.startsWith(term)) s+=60; if(t.includes(term)) s+=40;
  (it.labels||[]).forEach(l=>{ const L=l.toLowerCase(); if(L===term) s+=50; else if(L.includes(term)) s+=20; });
  return s;
} /* :contentReference[oaicite:26]{index=26} */
const pageIntent=q=>/disclaimer|privacy|kebijakan|policy|terms|syarat|ketentuan|about|tentang/i.test(q||''); /* :contentReference[oaicite:27]{index=27} */

function runSearch(q){
  let posts=[], pages=[];
  jsonp(feedSummary('posts',{q,'max-results':20}), j=>{
    if(j?.feed?.entry) posts=j.feed.entry.map(e=>mapEntry(e,'posts'));
    const needPages = pageIntent(q) || posts.length===0;
    const finish=()=>{
      let merged = needPages? posts.concat(pages): posts;
      if(!merged.length){ addBubble('system','Tidak ada yang cocok. Coba kata kunci lain, atau tempel URL artikelnya.',false); return; }
      const seen={}; merged = merged.filter(x=>{ const k=normalizeLink(x.permalink||''); if(seen[k]) return false; seen[k]=1; return true; });
      merged.forEach(it=>it.__score=scoreItem(it,q));
      merged.sort((a,b)=> (b.__score-a.__score) || (b.dateISO||'').localeCompare(a.dateISO||'') );
      merged.slice(0,12).forEach(renderPostcard);
      addBubble('system','Silakan pilih **Baca** pada kartu.',true);
    };
    if(needPages){
      jsonp(feedSummary('pages',{q,'max-results':20}), j2=>{
        if(j2?.feed?.entry) pages=j2.feed.entry.map(e=>mapEntry(e,'pages')); finish();
      }, finish);
    } else finish();
  }, ()=>addBubble('system','Koneksi lagi sibuk. Coba lagi ya.',false));
} /* :contentReference[oaicite:28]{index=28} */

// ====== INIT
(function init(){
  // tombol sidebar
  document.querySelector('[data-action="toggle-left"]')?.addEventListener('click',()=>{
    document.body.classList.toggle('left-open');
    $('#sidebarLeft').toggleAttribute('hidden');
    $('#overlay').toggleAttribute('hidden');
  });
  document.querySelector('[data-action="toggle-right"]')?.addEventListener('click',closeRight);

  loadPages(); loadLabelBatch();
  // SPA deep-link
  if(isPermalinkURL(location.href)){
    addBubble('system','Memuat artikel…',false);
    fetchURLasEntry(location.href).then(it=>renderReaderCard(it)).catch(()=>renderHome());
  }else{
    renderHome();
  }

  // smartscroll button
  S.smart.addEventListener('click',()=>{ S.room.scrollTo({top:S.room.scrollHeight,behavior:'smooth'}); });
})();
