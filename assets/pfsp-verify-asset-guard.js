/* PDF Fusion Verify Asset Guard v14 - protects admin/verify/portal pages from stale cache or missing CSS. */
(function(){
  'use strict';
  const VERSION = '14.4.0-enterprise-trust-suite';
  const fallbackCss = `
    :root{color-scheme:dark;--pfsp-bg:#020617;--pfsp-panel:#0f172a;--pfsp-border:rgba(148,163,184,.26);--pfsp-text:#e5f0ff;--pfsp-muted:#a9bdd6;--pfsp-blue:#60a5fa;--pfsp-good:#22c55e;--pfsp-warn:#f59e0b;--pfsp-bad:#ef4444}
    body.pfsp-v11-page,body.pfsp-v12-page,body.pfsp-v14-page{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0%,rgba(37,99,235,.30),transparent 38%),linear-gradient(180deg,#020617,#08111f 48%,#020617);color:var(--pfsp-text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .pfsp-v11-wrap{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:28px 0 44px}.pfsp-v11-hero,.pfsp-v11-card,.pfsp-final-shell{border:1px solid var(--pfsp-border);background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(15,23,42,.66));box-shadow:0 24px 80px rgba(0,0,0,.25);border-radius:28px;padding:24px;margin-bottom:18px}.pfsp-v11-top,.pfsp-v11-brand,.pfsp-v11-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.pfsp-v11-top{justify-content:space-between}.pfsp-v11-logo,.pfsp-final-badge{width:58px;height:58px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(135deg,#2563eb,#7c3aed);font-size:28px}.pfsp-v11-kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#93c5fd;font-weight:900}.pfsp-v11-hero h1,.pfsp-v11-card h2{margin:.18em 0;color:white}.pfsp-v11-hero p,.pfsp-v11-small{color:var(--pfsp-muted);line-height:1.6}.pfsp-v11-btn{border:1px solid rgba(148,163,184,.30);background:rgba(15,23,42,.72);color:#e0f2fe;border-radius:14px;padding:10px 13px;font-weight:900;text-decoration:none;cursor:pointer}.pfsp-v11-btn.primary{background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff}.pfsp-v11-btn.good{background:rgba(22,163,74,.22);border-color:rgba(34,197,94,.4)}.pfsp-v11-btn.danger{background:rgba(220,38,38,.22);border-color:rgba(248,113,113,.4)}.pfsp-v11-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.pfsp-v11-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.pfsp-v11-grid.sidebar{grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr)}.pfsp-v11-result{border:1px solid var(--pfsp-border);border-radius:18px;padding:14px;background:rgba(2,6,23,.38);margin:10px 0}.pfsp-v11-result.good{border-color:rgba(34,197,94,.45)}.pfsp-v11-result.warn{border-color:rgba(245,158,11,.45)}.pfsp-v11-result.bad{border-color:rgba(239,68,68,.48)}.pfsp-v11-verdict{font-size:18px;font-weight:950;color:#fff}.pfsp-v11-kv{display:grid;grid-template-columns:180px minmax(0,1fr);gap:8px;margin-top:12px}.pfsp-v11-kv span,.pfsp-v11-kv code,code{word-break:break-all;color:#bfdbfe}.pfsp-v11-input,.pfsp-v11-select,.pfsp-v11-textarea{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.3);background:rgba(2,6,23,.55);color:#f8fafc;border-radius:14px;padding:11px 12px}.pfsp-v11-textarea{min-height:120px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.pfsp-v11-table-scroll{overflow:auto;border:1px solid var(--pfsp-border);border-radius:18px}.pfsp-final-table{width:100%;border-collapse:collapse;min-width:760px}.pfsp-final-table th,.pfsp-final-table td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid rgba(148,163,184,.16);color:#dbeafe}.pfsp-final-table th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#93c5fd;background:rgba(15,23,42,.72)}.pfsp-v11-badge{display:inline-flex;border:1px solid var(--pfsp-border);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:950;text-transform:uppercase}.pfsp-v11-badge.good{border-color:rgba(34,197,94,.5);color:#86efac}.pfsp-v11-badge.warn{border-color:rgba(245,158,11,.5);color:#fcd34d}.pfsp-v11-badge.bad{border-color:rgba(239,68,68,.5);color:#fca5a5}.pfsp-v14-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;border:1px solid rgba(245,158,11,.45);background:#111827;color:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 16px 60px rgba(0,0,0,.35)}@media(max-width:900px){.pfsp-v11-grid,.pfsp-v11-grid.sidebar,.pfsp-v11-grid.three{grid-template-columns:1fr}.pfsp-v11-wrap{width:min(100% - 20px,1180px)}}`;
  function injectFallback(reason){
    if(document.getElementById('pfsp-v14-fallback-style')) return;
    const st=document.createElement('style'); st.id='pfsp-v14-fallback-style'; st.textContent=fallbackCss; document.head.appendChild(st);
    if(reason && !document.getElementById('pfsp-v14-asset-banner')){
      const b=document.createElement('div'); b.id='pfsp-v14-asset-banner'; b.className='pfsp-v14-banner';
      b.innerHTML='<b>PFSP UI Guard</b><div style="font-size:13px;opacity:.9">Đã bật CSS fallback vì asset có thể bị cache cũ hoặc tải lỗi. Bấm Ctrl+F5 hoặc unregister Service Worker nếu giao diện vẫn lạ.</div>';
      document.body.appendChild(b); setTimeout(()=>b.remove(),10000);
    }
  }
  function looksUnstyled(){
    const bodyBg=getComputedStyle(document.body).backgroundColor;
    const hero=document.querySelector('.pfsp-v11-hero,.pfsp-v11-card,.pfsp-final-shell');
    const radius=hero ? parseFloat(getComputedStyle(hero).borderRadius || '0') : 0;
    return !hero || radius < 8 || bodyBg === 'rgba(0, 0, 0, 0)' || bodyBg === 'rgb(255, 255, 255)';
  }
  window.PFSP_VERIFY_ASSET_GUARD = { version: VERSION, injectFallback };
  document.addEventListener('DOMContentLoaded', () => {
    for(const link of document.querySelectorAll('link[rel="stylesheet"]')) link.addEventListener('error', () => injectFallback('css-error'));
    setTimeout(()=>{ if(looksUnstyled()) injectFallback('unstyled'); }, 250);
    if('serviceWorker' in navigator){
      navigator.serviceWorker.getRegistration().then(reg=>{
        if(reg && reg.waiting) reg.waiting.postMessage({type:'PFSP_SKIP_WAITING'});
      }).catch(()=>null);
    }
  });
})();
