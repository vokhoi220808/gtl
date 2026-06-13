(() => {
  'use strict';
  const VERSION = '6.0.0-analytics-i18n';
  const KEY = 'pfspLocalAnalytics';
  const LANG_KEY = 'pfspLang';
  const $ = id => document.getElementById(id);
  const ready = fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();
  const now = () => new Date().toISOString();
  const device = () => {
    const ua = navigator.userAgent || '';
    const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    const tablet = /iPad|Tablet/i.test(ua) || (mobile && Math.min(screen.width, screen.height) >= 700);
    return tablet ? 'tablet' : mobile ? 'mobile' : 'desktop';
  };
  function read(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
  function write(data){ try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }
  function record(type, detail={}){
    const data = read();
    data.version = VERSION;
    data.device = device();
    data.language = document.documentElement.lang || 'vi';
    data.lastSeen = now();
    data.firstSeen = data.firstSeen || data.lastSeen;
    data.counts = data.counts || {clicks:0, errors:0, tools:0, exports:0};
    data.events = Array.isArray(data.events) ? data.events : [];
    if(type === 'click') data.counts.clicks++;
    if(type === 'tool') data.counts.tools++;
    if(type === 'error') data.counts.errors++;
    if(type === 'export') data.counts.exports++;
    data.events.unshift({time:now(), type, device:data.device, path:location.pathname, ...detail});
    data.events = data.events.slice(0, 300);
    write(data);
    window.dispatchEvent(new CustomEvent('pfsp:analytics', {detail:data}));
  }
  window.pfspAnalytics = {record, read, clear(){localStorage.removeItem(KEY); record('analytics_reset',{label:'local reset'});}, key:KEY, device};
  const translations = {
    vi: {
      title:'PDF Fusion Smart Pro', subtitle:'Gộp · Tách · Ký · Vẽ · Watermark · OCR · QR · Batch · Compare — 100% trình duyệt',
      export:'✨ Xuất', split:'✂️ Tách PDF', sign:'✍️ Chữ ký', pages:'📋 Pages', ocr:'🔍 OCR', batch:'⚙️ Batch', tools:'🛠 Tools', compress:'🗜 Nén PDF', preview:'🧩 Preview Editor', worker:'🧵 Worker + ZIP',
      dropTitle:'Kéo thả hoặc nhấp để chọn file', dropText:'PDF, Word (.docx), PNG, JPG — kéo thả danh sách để sắp xếp', privacy:'Trung tâm quyền riêng tư'
    },
    en: {
      title:'PDF Fusion Smart Pro', subtitle:'Merge · Split · Sign · Draw · Watermark · OCR · QR · Batch · Compare — 100% in your browser',
      export:'✨ Export', split:'✂️ Split PDF', sign:'✍️ Signature', pages:'📋 Pages', ocr:'🔍 OCR', batch:'⚙️ Batch', tools:'🛠 Tools', compress:'🗜 Compress PDF', preview:'🧩 Preview Editor', worker:'🧵 Worker + ZIP',
      dropTitle:'Drag and drop or click to choose files', dropText:'PDF, Word (.docx), PNG, JPG — drag the list to reorder', privacy:'Privacy Trust Center'
    }
  };
  function setText(sel, txt){ const el = document.querySelector(sel); if(el) el.textContent = txt; }
  function applyLang(lang){
    const t = translations[lang] || translations.vi;
    document.documentElement.lang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
    setText('.hero h1', t.title); setText('.hero p', t.subtitle);
    setText('.drop h3', t.dropTitle); setText('.drop p', t.dropText);
    Object.entries({export:'export', split:'split', sign:'sign', pages:'pages', ocr:'ocr', batch:'batch', tools:'tools', compress:'compress', preview:'preview', worker:'worker'}).forEach(([tab,key]) => {
      const btn = document.querySelector(`.tab[data-tab="${tab}"]`); if(btn) btn.textContent = t[key];
    });
    const privacy = document.querySelector('.pfsp-privacy-link'); if(privacy) privacy.textContent = '🔐 ' + t.privacy;
    document.querySelectorAll('.pfsp-langbar button').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    record('language', {label:lang});
  }
  window.pfspSetLanguage = applyLang;
  function addLangBar(){
    const hero = document.querySelector('.hero'); if(!hero || document.getElementById('pfspLangbar')) return;
    const bar = document.createElement('div'); bar.className = 'pfsp-langbar'; bar.id = 'pfspLangbar';
    bar.innerHTML = '<button type="button" data-lang="vi">Tiếng Việt</button><button type="button" data-lang="en">English</button>';
    hero.appendChild(bar);
    const link = document.createElement('a'); link.href = './privacy-center.html'; link.className = 'pfsp-privacy-link'; link.textContent = '🔐 Trung tâm quyền riêng tư';
    hero.appendChild(link);
    bar.addEventListener('click', e => { const b = e.target.closest('button[data-lang]'); if(b) applyLang(b.dataset.lang); });
  }
  function hookEvents(){
    document.addEventListener('click', e => {
      const btn = e.target.closest('button,a,.tab'); if(!btn) return;
      const label = (btn.textContent || btn.getAttribute('aria-label') || btn.id || btn.href || 'click').trim().slice(0,100);
      const tab = btn.dataset && btn.dataset.tab;
      record(tab ? 'tool' : 'click', {label, id:btn.id || '', tab:tab || '', tag:btn.tagName});
    }, true);
    window.addEventListener('error', e => record('error', {label:e.message || 'window error', source:e.filename || '', line:e.lineno || 0}));
    window.addEventListener('unhandledrejection', e => record('error', {label:String(e.reason && (e.reason.message || e.reason) || 'unhandled rejection')}));
  }
  ready(() => { addLangBar(); hookEvents(); applyLang(localStorage.getItem(LANG_KEY) || 'vi'); record('pageview', {label:document.title}); });
})();
