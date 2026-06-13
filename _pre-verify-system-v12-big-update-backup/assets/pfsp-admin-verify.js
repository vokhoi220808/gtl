/* PDF Fusion Smart Pro - Verify Admin Console v11 */
(function(){
  'use strict';
  const API = './api/verify';
  const SECRET_KEY = 'pfspVerifyAdminSecretV11';
  const $ = id => document.getElementById(id);
  const labels = {
    HEALTHY:'API ONLINE', LIST:'ĐÃ TẢI RECORDS', AUDIT:'ĐÃ TẢI AUDIT', INTEGRITY_OK:'REGISTRY TOÀN VẸN', INTEGRITY_WARNING:'CẦN KIỂM TRA', BACKUP_READY:'BACKUP SẴN SÀNG', REGISTERED:'ĐÃ ĐĂNG KÝ', REVOKED:'ĐÃ THU HỒI', RESTORED:'ĐÃ KHÔI PHỤC', EXPIRY_UPDATED:'ĐÃ CẬP NHẬT HẠN', UNAUTHORIZED:'SAI ADMIN SECRET', SIGNING_NOT_CONFIGURED:'THIẾU SIGNING SECRET', SERVER_ERROR:'LỖI SERVER'
  };
  function html(value){return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function short(value, len=16){const s=String(value||'');return s ? s.slice(0,len).toUpperCase() + (s.length>len?'…':'') : '-';}
  function label(v){return labels[v] || v || 'UNKNOWN';}
  function cls(payload){const l=payload?.level || (payload?.ok ? 'good' : 'warn');return l==='good'?'good':l==='bad'?'bad':'warn';}
  function secret(){return $('secret').value.trim();}
  function normalizeHash(value){return String(value||'').toLowerCase().replace(/[^a-f0-9]/g,'').slice(0,64);}
  function isoFromLocal(value){if(!value) return ''; const d=new Date(value); return Number.isFinite(d.getTime()) ? d.toISOString() : '';}
  async function post(payload){
    const r = await fetch(API, {method:'POST', headers:{'Content-Type':'application/json','X-Verify-Admin-Secret':secret()}, body:JSON.stringify({...payload, adminSecret:secret()})});
    return r.json().catch(()=>({ok:false, verdict:'SERVER_ERROR', level:'bad', message:'Không đọc được API.'}));
  }
  async function get(params){
    const qs = new URLSearchParams(params || {});
    const r = await fetch(API + '?' + qs.toString(), {cache:'no-store'});
    return r.json().catch(()=>({ok:false, verdict:'SERVER_ERROR', level:'bad', message:'Không đọc được API.'}));
  }
  function setMetrics(payload){
    const i = payload?.registryIntegrity || {};
    $('mRecords').textContent = i.recordCount ?? '-';
    $('mSigned').textContent = i.signedRecordCount ?? '-';
    $('mIntegrity').textContent = i.ok === true ? 'OK' : i.ok === false ? 'WARN' : '-';
  }
  function render(payload){
    const box = $('result');
    box.className = 'pfsp-v11-result ' + cls(payload);
    box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload.verdict))}</div><div class="pfsp-v11-message">${html(payload.message || '')}</div>` + (payload.registryIntegrity ? `<div class="pfsp-v11-kv"><b>Records</b><code>${payload.registryIntegrity.recordCount}</code><b>Signed</b><code>${payload.registryIntegrity.signedRecordCount}</code><b>Unsigned</b><code>${payload.registryIntegrity.unsignedRecordCount}</code><b>Invalid signatures</b><code>${html((payload.registryIntegrity.invalidSignatureIds||[]).join(', ') || '0')}</code><b>Integrity SHA-256</b><code>${html(short(payload.registryIntegrity.sha256, 28))}</code></div>` : '');
    $('dump').value = JSON.stringify(payload.registry || payload, null, 2);
    setMetrics(payload);
  }
  function statusBadge(status){
    const s = String(status || 'active').toLowerCase();
    const c = s === 'active' ? 'good' : s === 'revoked' ? 'bad' : 'warn';
    return `<span class="pfsp-v11-badge ${c}">${html(s)}</span>`;
  }
  function row(record){
    return `<tr><td><code>${html(record.id)}</code><div class="pfsp-v11-small">${html(record.fileName || '')}</div></td><td><code>${html(short(record.sha256, 20))}</code></td><td>${statusBadge(record.status)}${record.expiresAt ? `<div class="pfsp-v11-small">exp: ${html(record.expiresAt)}</div>` : ''}${record.revokeReason ? `<div class="pfsp-v11-small">${html(record.revokeReason)}</div>` : ''}</td><td>${html(record.registeredAt || record.createdAt || '-')}<div class="pfsp-v11-small">${html(record.origin || '')}</div></td><td><div class="pfsp-v11-actions" style="margin-top:0"><button class="pfsp-v11-btn danger" data-action="revoke" data-id="${html(record.id)}">Revoke</button><button class="pfsp-v11-btn good" data-action="restore" data-id="${html(record.id)}">Restore</button><button class="pfsp-v11-btn" data-action="expiry" data-id="${html(record.id)}">Expiry</button><button class="pfsp-v11-btn" data-action="copy" data-id="${html(record.id)}">Copy</button></div></td></tr>`;
  }
  function auditRow(item){
    return `<tr><td>${html(item.time || '-')}</td><td>${html(item.action || '-')}</td><td><code>${html(item.id || '-')}</code></td><td>${html(item.result || '-')}</td><td>${html(item.origin || '-')}</td></tr>`;
  }
  async function loadRecords(){
    const payload = await post({action:'list', query:$('query').value.trim(), status:$('statusFilter').value});
    render(payload);
    const rows = $('rows');
    rows.innerHTML = (payload.records || []).length ? payload.records.map(row).join('') : '<tr><td colspan="5">Không có record.</td></tr>';
  }
  async function loadAudit(){
    const payload = await post({action:'audit', limit:100});
    render(payload);
    $('auditRows').innerHTML = (payload.auditLog || []).length ? payload.auditLog.map(auditRow).join('') : '<tr><td colspan="5">Không có audit log.</td></tr>';
  }
  async function registerRecord(){
    const payload = await post({
      action:'register',
      id:$('regId').value.trim(),
      sha256:normalizeHash($('regHash').value),
      fileName:$('regName').value.trim() || 'document.pdf',
      size:$('regSize').value.trim(),
      origin:$('regOrigin').value.trim() || location.origin,
      expiresAt:isoFromLocal($('regExpiry').value),
      note:$('regNote').value.trim(),
      overwrite:$('regOverwrite').checked
    });
    render(payload);
    if(payload.ok) loadRecords();
  }
  async function action(id, type){
    if(type === 'copy'){
      await navigator.clipboard?.writeText(id).catch(()=>{});
      render({ok:true, verdict:'COPIED', level:'good', message:'Đã copy Verify ID: ' + id});
      return;
    }
    if(type === 'revoke'){
      const reason = prompt('Lý do thu hồi:', 'Tài liệu không còn hợp lệ') || 'revoked by admin';
      render(await post({action:'revoke', id, reason}));
      await loadRecords();
      return;
    }
    if(type === 'restore'){
      render(await post({action:'restore', id}));
      await loadRecords();
      return;
    }
    if(type === 'expiry'){
      const value = prompt('Nhập thời hạn ISO, hoặc để trống để xóa hạn:', '');
      render(await post({action:'set-expiry', id, expiresAt:value || ''}));
      await loadRecords();
    }
  }
  function downloadDump(){
    const text = $('dump').value || '{}';
    const blob = new Blob([text + '\n'], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pfsp-verify-dump-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function bind(){
    $('secret').value = localStorage.getItem(SECRET_KEY) || '';
    $('saveSecret').onclick = () => { localStorage.setItem(SECRET_KEY, secret()); render({ok:true, verdict:'SECRET_SAVED', level:'good', message:'Đã lưu tạm secret trong trình duyệt này.'}); };
    $('clearSecret').onclick = () => { localStorage.removeItem(SECRET_KEY); $('secret').value=''; render({ok:true, verdict:'SECRET_CLEARED', level:'warn', message:'Đã xóa secret khỏi trình duyệt.'}); };
    $('health').onclick = async () => render(await get({action:'health'}));
    $('integrity').onclick = async () => render(await post({action:'integrity'}));
    $('audit').onclick = loadAudit;
    $('backup').onclick = async () => render(await post({action:'backup', label:'admin console backup'}));
    $('downloadDump').onclick = downloadDump;
    $('list').onclick = loadRecords;
    $('register').onclick = registerRecord;
    $('query').addEventListener('keydown', e => { if(e.key === 'Enter') loadRecords(); });
    $('rows').addEventListener('click', e => {
      const btn = e.target.closest('button[data-action]');
      if(btn) action(btn.dataset.id, btn.dataset.action);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
