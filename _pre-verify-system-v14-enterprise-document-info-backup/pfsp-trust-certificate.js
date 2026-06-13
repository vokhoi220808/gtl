/* PDF Fusion Trust Certificate printable page v13 */
(function(){
  'use strict';
  const API='./api/verify';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=new URLSearchParams(location.search);
  const id=params.get('id') || params.get('verifyId') || '';
  function badge(value){ const s=String(value||'unknown').toLowerCase(); const c=s==='active'||s==='verified'?'good':(['revoked','suspended','expired','blocked'].includes(s)?'bad':'warn'); return `<span class="pfsp-v11-badge ${c}">${esc(value||'unknown')}</span>`; }
  async function api(){
    try{ const r=await fetch(API+'?'+new URLSearchParams({action:'printable-certificate',id}).toString(),{cache:'no-store'}); return await r.json(); }
    catch(err){ return {ok:false, verdict:'NETWORK_ERROR', level:'bad', message:err.message||String(err)}; }
  }
  function kv(label,value,code){ return `<b>${esc(label)}</b>${code?`<code>${esc(value||'-')}</code>`:`<span>${value||'-'}</span>`}`; }
  function render(payload){
    const box=$('certRoot'); if(!box) return;
    if(!payload.ok){ box.innerHTML=`<div class="pfsp-v11-result bad"><div class="pfsp-v11-verdict">${esc(payload.verdict||'ERROR')}</div><div>${esc(payload.message||'Không tải được certificate.')}</div></div>`; return; }
    const r=payload.record||{}; const cert=payload.certificate||{}; const trust=payload.trust||{};
    document.title='Trust Certificate - '+(r.id||'PFSP');
    box.innerHTML=`
      <section class="pfsp-v11-hero pfsp-v13-print-card">
        <div class="pfsp-v11-top"><div class="pfsp-v11-brand"><div class="pfsp-v11-logo">🛡️</div><div><div class="pfsp-v11-kicker">PDF Fusion Smart Pro · Trust Certificate v13</div><h1>Certificate xác minh tài liệu</h1><p>Chứng nhận metadata công khai từ server-signed trusted registry. File PDF gốc không được lưu trên server.</p></div></div><div class="pfsp-v13-print-actions"><button class="pfsp-v11-btn primary" onclick="window.print()">In / Lưu PDF</button><a class="pfsp-v11-btn" href="./verify.html?id=${encodeURIComponent(r.id)}">Mở verify</a></div></div>
        <div class="pfsp-v13-cert-verdict"><div><span>Trust Score</span><b>${esc(trust.trustScore ?? '-')}</b><small>/100 · ${esc(trust.trustLevel || '')}</small></div><div>${badge(r.status)}<p>${esc(payload.signature?.valid===true?'Server signature hợp lệ':payload.signature?.valid===false?'Chữ ký registry không hợp lệ':'Chưa xác nhận chữ ký')}</p></div></div>
      </section>
      <section class="pfsp-v11-grid sidebar">
        <div class="pfsp-v11-card"><h2>Thông tin certificate</h2><div class="pfsp-v11-kv">${kv('Verify ID',r.id,true)}${kv('SHA-256',r.sha256,true)}${kv('Tên file',r.fileName)}${kv('Tiêu đề',r.documentTitle)}${kv('Chủ sở hữu',r.owner)}${kv('Dự án',r.project)}${kv('Dung lượng',r.size)}${kv('Trạng thái',r.status)}${kv('Đăng ký lúc',r.registeredAt)}${kv('Cập nhật lúc',r.updatedAt)}${kv('Hết hạn',r.expiresAt)}${kv('Fingerprint',r.fingerprint,true)}${kv('Signature version',r.signatureVersion)}${kv('Server signature',r.serverSignature,true)}</div></div>
        <aside class="pfsp-v11-card"><h2>Trust checks</h2><div class="pfsp-v12-checks">${(trust.checks||[]).map(x=>`<div class="pfsp-v12-check ${x.ok?'good':'bad'}"><span>${x.ok?'✅':'⚠️'}</span><div><b>${esc(x.name)}</b><div class="pfsp-v11-small">${esc(x.message||'')}</div></div></div>`).join('')||'<p class="pfsp-v11-small">Không có trust checks.</p>'}</div></aside>
      </section>
      <section class="pfsp-v11-card"><h2>Timeline</h2><div class="pfsp-v12-timeline">${(payload.timeline||[]).map(x=>`<div class="pfsp-v12-time"><b>${esc(x.action)}</b><span>${esc(x.time)} · ${esc(x.label||'')}</span></div>`).join('')||'<p class="pfsp-v11-small">Chưa có timeline.</p>'}</div></section>
      <section class="pfsp-v11-card"><h2>Certificate JSON</h2><textarea class="pfsp-v11-textarea" readonly>${esc(JSON.stringify(cert,null,2))}</textarea></section>`;
  }
  async function start(){ if($('certId')) $('certId').textContent=id||'-'; render(await api()); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
