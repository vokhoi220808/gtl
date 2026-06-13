/* PDF Fusion Smart Pro - Verify Admin Console v13 Trust Portal */
(function(){
  'use strict';
  const API = './api/verify';
  const SECRET_KEY = 'pfspVerifyAdminSecretV12';
  const LEGACY_SECRET_KEY = 'pfspVerifyAdminSecretV11';
  const $ = id => document.getElementById(id);
  const labels = {
    HEALTHY:'API ONLINE', SELF_TEST_OK:'SELF-TEST OK', SELF_TEST_WARNING:'SELF-TEST WARNING', LIST:'ĐÃ TẢI RECORDS', AUDIT:'ĐÃ TẢI AUDIT', INTEGRITY_OK:'REGISTRY TOÀN VẸN', INTEGRITY_WARNING:'CẦN KIỂM TRA', BACKUP_READY:'BACKUP SẴN SÀNG', REGISTERED:'ĐÃ ĐĂNG KÝ', DRY_RUN_OK:'DRY-RUN OK', REVOKED:'ĐÃ THU HỒI', RESTORED:'ĐÃ KHÔI PHỤC', SUSPENDED:'ĐÃ TẠM KHÓA', ACTIVATED:'ĐÃ KÍCH HOẠT', EXPIRY_UPDATED:'ĐÃ CẬP NHẬT HẠN', METADATA_UPDATED:'ĐÃ CẬP NHẬT METADATA', REPAIRED:'ĐÃ REPAIR', REPAIR_DRY_RUN:'REPAIR PREVIEW', BULK_REGISTERED:'BULK ĐÃ ĐĂNG KÝ', BULK_DRY_RUN_OK:'BULK DRY-RUN OK', BATCH_VERIFIED:'BATCH VERIFY XONG', HASH_FOUND:'HASH FOUND', HASH_NOT_FOUND:'HASH NOT FOUND', CERTIFICATE:'CERTIFICATE READY', GENERATED_ID:'ĐÃ TẠO ID', UNAUTHORIZED:'SAI ADMIN SECRET', SIGNING_NOT_CONFIGURED:'THIẾU SIGNING SECRET', SERVER_ERROR:'LỖI SERVER'
  };
  function html(value){return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function short(value, len=16){const s=String(value||'');return s ? s.slice(0,len).toUpperCase() + (s.length>len?'…':'') : '-';}
  function label(v){return labels[v] || v || 'UNKNOWN';}
  function cls(payload){const l=payload?.level || (payload?.ok ? 'good' : 'warn');return l==='good'?'good':l==='bad'?'bad':'warn';}
  function secret(){return ($('secret')?.value || '').trim();}
  function normalizeHash(value){return String(value||'').toLowerCase().replace(/[^a-f0-9]/g,'').slice(0,64);}
  function isoFromLocal(value){if(!value) return ''; const d=new Date(value); return Number.isFinite(d.getTime()) ? d.toISOString() : '';}
  function tags(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean);}
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
    if($('mRecords')) $('mRecords').textContent = i.recordCount ?? '-';
    if($('mSigned')) $('mSigned').textContent = i.signedRecordCount ?? '-';
    if($('mIntegrity')) $('mIntegrity').textContent = i.ok === true ? 'OK' : i.ok === false ? 'WARN' : '-';
  }
  function render(payload){
    const box = $('result'); if(!box) return;
    box.className = 'pfsp-v11-result ' + cls(payload);
    const integrity = payload.registryIntegrity ? `<div class="pfsp-v11-kv"><b>Records</b><code>${payload.registryIntegrity.recordCount}</code><b>Active</b><code>${payload.registryIntegrity.activeCount ?? '-'}</code><b>Revoked</b><code>${payload.registryIntegrity.revokedCount ?? '-'}</code><b>Suspended</b><code>${payload.registryIntegrity.suspendedCount ?? '-'}</code><b>Signed</b><code>${payload.registryIntegrity.signedRecordCount}</code><b>Unsigned</b><code>${payload.registryIntegrity.unsignedRecordCount}</code><b>Invalid signatures</b><code>${html((payload.registryIntegrity.invalidSignatureIds||[]).join(', ') || '0')}</code><b>Integrity SHA-256</b><code>${html(short(payload.registryIntegrity.sha256, 28))}</code></div>` : '';
    const checks = payload.checks ? `<div class="pfsp-v12-checks">${payload.checks.map(x=>`<div class="pfsp-v12-check ${x.ok?'good':'bad'}"><span>${x.ok?'✅':'⚠️'}</span><div><b>${html(x.name)}</b><div class="pfsp-v11-small">${html(x.message||'')}</div></div></div>`).join('')}</div>` : '';
    box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload.verdict))}</div><div class="pfsp-v11-message">${html(payload.message || '')}</div>${integrity}${checks}`;
    if($('dump')) $('dump').value = JSON.stringify(payload.registry || payload.suggestedRegistry || payload, null, 2);
    setMetrics(payload);
  }
  function statusBadge(status){
    const s = String(status || 'active').toLowerCase();
    const c = s === 'active' ? 'good' : (s === 'revoked' || s === 'suspended') ? 'bad' : 'warn';
    return `<span class="pfsp-v11-badge ${c}">${html(s)}</span>`;
  }
  function row(record){
    return `<tr><td><code>${html(record.id)}</code><div class="pfsp-v11-small">${html(record.fileName || '')}</div><div class="pfsp-v11-small">${html([record.owner,record.project].filter(Boolean).join(' · '))}</div></td><td><code>${html(short(record.sha256, 22))}</code><div class="pfsp-v11-small">${html((record.tags||[]).join(', '))}</div></td><td>${statusBadge(record.status)}${record.expiresAt ? `<div class="pfsp-v11-small">exp: ${html(record.expiresAt)}</div>` : ''}${record.revokeReason || record.suspendReason ? `<div class="pfsp-v11-small">${html(record.revokeReason || record.suspendReason)}</div>` : ''}</td><td>${html(record.registeredAt || record.createdAt || '-')}<div class="pfsp-v11-small">${html(record.origin || '')}</div></td><td><div class="pfsp-v11-actions" style="margin-top:0"><button class="pfsp-v11-btn danger" data-action="revoke" data-id="${html(record.id)}">Revoke</button><button class="pfsp-v11-btn danger" data-action="suspend" data-id="${html(record.id)}">Suspend</button><button class="pfsp-v11-btn good" data-action="restore" data-id="${html(record.id)}">Restore</button><button class="pfsp-v11-btn" data-action="expiry" data-id="${html(record.id)}">Expiry</button><button class="pfsp-v11-btn" data-action="cert" data-id="${html(record.id)}">Cert</button><button class="pfsp-v11-btn" data-action="copy" data-id="${html(record.id)}">Copy</button></div></td></tr>`;
  }
  function auditRow(item){ return `<tr><td>${html(item.time || '-')}</td><td>${html(item.action || '-')}</td><td><code>${html(item.id || '-')}</code></td><td>${html(item.result || '-')}</td><td>${html(item.origin || '-')}</td></tr>`; }
  async function loadRecords(){
    const payload = await post({action:'list', query:$('query')?.value.trim() || '', status:$('statusFilter')?.value || ''});
    render(payload);
    const rows = $('rows'); if(rows) rows.innerHTML = (payload.records || []).length ? payload.records.map(row).join('') : '<tr><td colspan="5">Không có record.</td></tr>';
  }
  async function loadAudit(){
    const payload = await post({action:'audit', limit:150}); render(payload);
    if($('auditRows')) $('auditRows').innerHTML = (payload.auditLog || []).length ? payload.auditLog.map(auditRow).join('') : '<tr><td colspan="5">Không có audit log.</td></tr>';
  }
  function registrationPayload(dryRun=false){
    return { action:'register', id:$('regId')?.value.trim() || '', sha256:normalizeHash($('regHash')?.value), fileName:$('regName')?.value.trim() || 'document.pdf', size:$('regSize')?.value.trim(), origin:$('regOrigin')?.value.trim() || location.origin, owner:$('regOwner')?.value.trim() || '', project:$('regProject')?.value.trim() || '', documentTitle:$('regTitle')?.value.trim() || '', tags:tags($('regTags')?.value), expiresAt:isoFromLocal($('regExpiry')?.value), note:$('regNote')?.value.trim() || '', overwrite:!!$('regOverwrite')?.checked, dryRun };
  }
  async function registerRecord(dryRun=false){ const payload = await post(registrationPayload(dryRun)); render(payload); if(payload.ok && !dryRun) loadRecords(); }
  async function generateId(){ const payload = await get({action:'generate-id'}); render(payload); if(payload.id && $('regId')) $('regId').value = payload.id; }
  async function action(id, type){
    if(type === 'copy'){ await navigator.clipboard?.writeText(id).catch(()=>{}); render({ok:true, verdict:'COPIED', level:'good', message:'Đã copy Verify ID: ' + id}); return; }
    if(type === 'cert'){ const p=await get({action:'certificate', id}); render(p); if(p.certificate) downloadJson((id||'pfsp')+'.verify-certificate.json', p.certificate); return; }
    if(type === 'revoke'){ const reason = prompt('Lý do thu hồi:', 'Tài liệu không còn hợp lệ') || 'revoked by admin'; render(await post({action:'revoke', id, reason})); await loadRecords(); return; }
    if(type === 'suspend'){ const reason = prompt('Lý do tạm khóa:', 'Cần kiểm tra lại tài liệu') || 'suspended by admin'; render(await post({action:'suspend', id, reason})); await loadRecords(); return; }
    if(type === 'restore'){ render(await post({action:'restore', id})); await loadRecords(); return; }
    if(type === 'expiry'){ const value = prompt('Nhập thời hạn ISO, hoặc để trống để xóa hạn:', ''); render(await post({action:'set-expiry', id, expiresAt:value || ''})); await loadRecords(); }
  }
  function downloadJson(name, data){
    const blob = new Blob([JSON.stringify(data,null,2)+'\n'], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function downloadDump(){ const text = $('dump')?.value || '{}'; const blob = new Blob([text + '\n'], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pfsp-verify-dump-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),500); }
  function parseBatchLine(line){
    const raw = String(line||'').trim(); if(!raw) return null;
    try{ const c=JSON.parse(raw); return c.certificate || c.record || c; }catch{}
    if(/^https?:\/\//i.test(raw) || raw.includes('?')){ try{ const u=new URL(raw, location.href); return Object.fromEntries(u.searchParams.entries()); }catch{} }
    const id=(raw.match(/PFSP-[A-Z0-9-]{8,100}/i)||[])[0]||''; const hash=(raw.match(/[a-f0-9]{64}/i)||[])[0]||''; return {id:id.toUpperCase(), sha256:hash.toLowerCase()};
  }
  async function batchVerify(){
    const items = ($('batchInput')?.value || '').split(/\n+/).map(parseBatchLine).filter(x=>x&&x.id);
    const payload = await post({action:'batch-verify', items}); render(payload);
    const box=$('batchResult'); if(box){ box.className='pfsp-v11-result '+cls(payload); box.innerHTML=`<div class="pfsp-v11-verdict">${html(label(payload.verdict))}</div><div class="pfsp-v11-message">${html(payload.message||'')}</div><div class="pfsp-v12-batch-list">${(payload.results||[]).map(r=>`<div class="pfsp-v12-batch-row ${cls(r)}"><b>${html(label(r.verdict))}</b><div class="pfsp-v11-small">${html(r.record?.id || r.id || '-')}</div><div>${html(r.message||'')}</div></div>`).join('')}</div>`; }
  }
  async function bulkRegister(dryRun=false){
    let items=[]; try{ items=JSON.parse($('bulkInput')?.value || '[]'); }catch(err){ render({ok:false, verdict:'BAD_JSON', level:'bad', message:'Bulk JSON không hợp lệ: '+err.message}); return; }
    const payload = await post({action:'bulk-register', items, overwrite:!!$('bulkOverwrite')?.checked, dryRun}); render(payload); if(payload.ok && !dryRun) loadRecords();
  }
  async function lookupHash(){ const hash=normalizeHash($('lookupHash')?.value); const p=await get({action:'lookup-hash', sha256:hash}); render(p); }
  async function exportCert(){ const id=($('certId')?.value || $('metaId')?.value || '').trim(); const p=await get({action:'certificate', id}); render(p); if(p.certificate) downloadJson((id||'pfsp')+'.verify-certificate.json', p.certificate); }
  async function updateMeta(){
    const payload = await post({action:'update-note', id:$('metaId')?.value.trim(), owner:$('metaOwner')?.value.trim(), project:$('metaProject')?.value.trim(), documentTitle:$('metaTitle')?.value.trim(), tags:tags($('metaTags')?.value), note:$('metaNote')?.value.trim()});
    render(payload); if(payload.ok) loadRecords();
  }
  function bind(){
    if($('secret')) $('secret').value = localStorage.getItem(SECRET_KEY) || localStorage.getItem(LEGACY_SECRET_KEY) || '';
    $('saveSecret') && ($('saveSecret').onclick = () => { localStorage.setItem(SECRET_KEY, secret()); render({ok:true, verdict:'SECRET_SAVED', level:'good', message:'Đã lưu tạm secret trong trình duyệt này.'}); });
    $('clearSecret') && ($('clearSecret').onclick = () => { localStorage.removeItem(SECRET_KEY); localStorage.removeItem(LEGACY_SECRET_KEY); if($('secret')) $('secret').value=''; render({ok:true, verdict:'SECRET_CLEARED', level:'warn', message:'Đã xóa secret khỏi trình duyệt.'}); });
    $('health') && ($('health').onclick = async () => render(await get({action:'health'})));
    $('diagnostics') && ($('diagnostics').onclick = async () => render(await get({action:'self-test'})));
    $('integrity') && ($('integrity').onclick = async () => render(await post({action:'integrity'})));
    $('audit') && ($('audit').onclick = loadAudit);
    $('backup') && ($('backup').onclick = async () => render(await post({action:'backup', label:'admin console backup v12'})));
    $('repairDry') && ($('repairDry').onclick = async () => render(await post({action:'repair', resign:true, dryRun:true})));
    $('repairWrite') && ($('repairWrite').onclick = async () => { if(confirm('Repair + re-sign sẽ ghi registry mới. Chắc chưa?')) render(await post({action:'repair', resign:true})); });
    $('downloadDump') && ($('downloadDump').onclick = downloadDump);
    $('list') && ($('list').onclick = loadRecords);
    $('register') && ($('register').onclick = ()=>registerRecord(false));
    $('dryRegister') && ($('dryRegister').onclick = ()=>registerRecord(true));
    $('generateId') && ($('generateId').onclick = generateId);
    $('query') && $('query').addEventListener('keydown', e => { if(e.key === 'Enter') loadRecords(); });
    $('rows') && $('rows').addEventListener('click', e => { const btn = e.target.closest('button[data-action]'); if(btn) action(btn.dataset.id, btn.dataset.action); });
    $('batchVerify') && ($('batchVerify').onclick = batchVerify);
    $('batchSample') && ($('batchSample').onclick = () => { $('batchInput').value='PFSP-20260613-ABC123DEF456\nhttps://example.com/verify.html?id=PFSP-20260613-ABC123DEF456&sha256='+'0'.repeat(64); });
    $('bulkDry') && ($('bulkDry').onclick = ()=>bulkRegister(true));
    $('bulkWrite') && ($('bulkWrite').onclick = ()=>bulkRegister(false));
    $('lookupHashBtn') && ($('lookupHashBtn').onclick = lookupHash);
    $('exportCertBtn') && ($('exportCertBtn').onclick = exportCert);
    $('updateMeta') && ($('updateMeta').onclick = updateMeta);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
