/* PDF Fusion Smart Pro - Trusted Verify Registry bridge v12 BIG UPDATE */
(function(){
  'use strict';
  const API = './api/verify';
  const LOCAL_RECORDS = 'pfspTrustedVerifyLocalRecordsV12';
  const LEGACY_LOCAL_RECORDS = 'pfspTrustedVerifyLocalRecordsV11';
  const AUDIT = 'pfspTrustedVerifyAuditV12';
  const QUEUE = 'pfspTrustedVerifyQueueV12';
  const SECRET = 'pfspVerifyAdminSecretV12';
  const LEGACY_SECRET = 'pfspVerifyAdminSecretV11';
  const $ = id => document.getElementById(id);
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const short = (value, len=18) => { const s=String(value||''); return s ? s.slice(0,len).toUpperCase() + (s.length>len?'…':'') : '-'; };
  const cls = payload => { const l=payload?.level || (payload?.ok ? 'good' : 'warn'); return l==='good'?'good':l==='bad'?'bad':'warn'; };
  const label = verdict => ({GENUINE:'✅ Tài liệu thật',REGISTERED_NEEDS_FILE:'⚠️ ID có thật, cần PDF',UNKNOWN:'⚠️ ID chưa đăng ký',FAKE_OR_MODIFIED:'❌ PDF đã khác bản gốc',AUTO_REGISTERED:'✅ Đã auto-register',ALREADY_REGISTERED:'✅ Đã có trong registry',REGISTERED:'✅ Đã đăng ký',REVOKED:'⛔ Đã thu hồi',SUSPENDED:'⛔ Đã tạm khóa',RESTORED:'✅ Đã khôi phục',ACTIVATED:'✅ Đã kích hoạt',EXPIRY_UPDATED:'✅ Đã cập nhật hạn',METADATA_UPDATED:'✅ Đã cập nhật metadata',ORIGIN_NOT_ALLOWED:'❌ Origin không được phép',SIGNING_NOT_CONFIGURED:'❌ Thiếu signing secret',SERVER_ERROR:'❌ Lỗi server',HEALTHY:'✅ API online',HASH_FOUND:'✅ Hash có trong registry',HASH_NOT_FOUND:'⚠️ Hash chưa có trong registry'}[verdict] || verdict || 'UNKNOWN');
  function readJson(key, fallback){try{return JSON.parse(localStorage.getItem(key)||'') || fallback;}catch{return fallback;}}
  function writeJson(key, value){try{localStorage.setItem(key, JSON.stringify(value));}catch{}}
  function getSecret(){try{return localStorage.getItem(SECRET)||localStorage.getItem(LEGACY_SECRET)||'';}catch{return '';}}
  function setSecret(value){try{localStorage.setItem(SECRET, value||'');}catch{}}
  function localRecords(){return [...readJson(LOCAL_RECORDS, []), ...readJson(LEGACY_LOCAL_RECORDS, [])].filter(Boolean);}
  function saveLocalRecord(record){ if(!record || !record.id) return; const records = localRecords().filter(r => String(r.id).toUpperCase() !== String(record.id).toUpperCase()); records.unshift(record); writeJson(LOCAL_RECORDS, records.slice(0, 300)); }
  function saveAudit(item){ const rows = readJson(AUDIT, []); rows.unshift({time:new Date().toISOString(), ...item}); writeJson(AUDIT, rows.slice(0, 120)); }
  function queueItems(){return readJson(QUEUE, []);}
  function saveQueue(items){writeJson(QUEUE, items.slice(0, 80));}
  function enqueue(action, record, reason){ const items=queueItems(); items.unshift({time:new Date().toISOString(), action, record, reason:reason||''}); saveQueue(items); updateQueueMini(); }
  function certToRecord(cert){
    const c = cert && (cert.certificate || cert.record || cert);
    if(!c || typeof c !== 'object') return null;
    return { id:String(c.id || c.verifyId || '').trim().toUpperCase(), sha256:String(c.sha256 || c.hash || c.h || '').toLowerCase().replace(/[^a-f0-9]/g,'').slice(0,64), size:c.size ?? null, fileName:c.fileName || c.name || 'document.pdf', mimeType:c.mimeType || 'application/pdf', createdAt:c.createdAt || c.ts || new Date().toISOString(), origin:c.origin || c.o || location.origin, app:c.app || 'PDF Fusion Smart Pro', appVersion:c.appVersion || c.version || 'unknown', sourceBundleSha256:c.sourceBundleSha256 || c.sourceHash || c.sh || '', checksum:c.checksum || c.hck || '', expiresAt:c.expiresAt || '', owner:c.owner||'', project:c.project||'', documentTitle:c.documentTitle||c.title||'', tags:Array.isArray(c.tags)?c.tags:[], note:c.note || '' };
  }
  function getCert(){ try{ if(window.PFSPDocumentHashVerify?.getLastCertificate) return window.PFSPDocumentHashVerify.getLastCertificate(); return JSON.parse(localStorage.getItem('pfspDocumentHashLastCertificate') || 'null'); }catch{return null;} }
  async function post(payload, secret=''){
    const r = await fetch(API, {method:'POST', headers:{'Content-Type':'application/json','X-Verify-Admin-Secret':secret}, body:JSON.stringify(secret ? {...payload, adminSecret:secret} : payload)});
    return r.json().catch(()=>({ok:false, verdict:'SERVER_ERROR', level:'bad', message:'Không đọc được phản hồi Verify API.'}));
  }
  async function get(params){ const r = await fetch(API + '?' + new URLSearchParams(params), {cache:'no-store'}); return r.json().catch(()=>({ok:false,verdict:'SERVER_ERROR',level:'bad',message:'Không đọc được Verify API.'})); }
  async function apiCheck(certOrRecord){ const record = certToRecord(certOrRecord); if(!record || !record.id) return {ok:false, verdict:'NO_ID', level:'bad', message:'Chưa có Verify ID để kiểm tra.'}; const qs = {id:record.id}; if(record.sha256) qs.sha256=record.sha256; if(record.size != null && record.size !== '') qs.size=String(record.size); return get(qs); }
  async function apiRegister(certOrRecord, opts={}){ const record = certToRecord(certOrRecord); if(!record || !record.id || !record.sha256) return {ok:false, verdict:'BAD_RECORD', level:'bad', message:'Cần Verify ID và SHA-256 để đăng ký.'}; const payload = await post({action:'register', certificate:record, overwrite:!!opts.overwrite, note:opts.note || record.note || 'Manual registry registration from app panel.'}, opts.secret || getSecret()); if(payload.ok && payload.record) saveLocalRecord(payload.record); saveAudit({action:'register', id:record.id, verdict:payload.verdict, ok:payload.ok}); return payload; }
  async function autoRegisterCertificate(certOrRecord){
    const record = certToRecord(certOrRecord); if(!record || !record.id || !record.sha256) throw new Error('Auto-register cần certificate có Verify ID và SHA-256.');
    let payload;
    try{ payload = await post({action:'auto-register', certificate:record, registeredBy:'auto-qr-export-v12', note:'Auto registered when PDF Fusion exported a QR Verify PDF.'}); }
    catch(err){ payload = {ok:false, verdict:'SERVER_ERROR', level:'warn', message:err.message || String(err)}; }
    if(payload.ok && payload.record) saveLocalRecord(payload.record);
    if(!payload.ok && ['SERVER_ERROR','AUTO_REGISTER_PENDING_MANUAL_PATCH'].includes(payload.verdict)) enqueue('auto-register', record, payload.message);
    try{ const cert = certOrRecord && typeof certOrRecord === 'object' ? certOrRecord : {}; cert.__registryResult = payload; localStorage.setItem('pfspDocumentHashLastCertificate', JSON.stringify(cert)); }catch{}
    saveAudit({action:'auto-register', id:record.id, verdict:payload.verdict, ok:payload.ok}); updateAutoRegisterMini(payload); document.dispatchEvent(new CustomEvent('pfsp:auto-register-result', {detail:payload})); return payload;
  }
  async function apiRevoke(id, reason, secret){ const payload = await post({action:'revoke', id, reason:reason || 'revoked from app panel'}, secret || getSecret()); saveAudit({action:'revoke', id, verdict:payload.verdict, ok:payload.ok}); return payload; }
  async function apiRestore(id, secret){ const payload = await post({action:'restore', id}, secret || getSecret()); saveAudit({action:'restore', id, verdict:payload.verdict, ok:payload.ok}); return payload; }
  async function apiSuspend(id, reason, secret){ const payload = await post({action:'suspend', id, reason:reason || 'suspended from app panel'}, secret || getSecret()); saveAudit({action:'suspend', id, verdict:payload.verdict, ok:payload.ok}); return payload; }
  async function apiLookupHash(hash){ return get({action:'lookup-hash', sha256:String(hash||'')}); }
  async function flushQueue(){
    const items=queueItems(); if(!items.length) return {ok:true,verdict:'QUEUE_EMPTY',level:'good',message:'Không có hàng chờ.'};
    const left=[]; const results=[];
    for(const item of items){ const p = await post({action:item.action || 'auto-register', certificate:item.record, registeredBy:'queue-flush-v12', note:'Flushed from local queue.'}); results.push(p); if(!p.ok) left.push(item); else if(p.record) saveLocalRecord(p.record); }
    saveQueue(left); const payload={ok:left.length===0, verdict:left.length?'QUEUE_PARTIAL':'QUEUE_FLUSHED', level:left.length?'warn':'good', message:`Đã xử lý ${items.length-left.length}/${items.length} item trong queue.`, results}; updateAutoRegisterMini(payload); updateQueueMini(); return payload;
  }
  function renderStatus(target, payload){ if(!target) return; target.className = 'pfsp-v11-result ' + cls(payload); const r = payload?.record || {}; target.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload?.verdict))}</div><div class="pfsp-v11-message">${html(payload?.message || '')}</div>` + (r.id ? `<div class="pfsp-v11-kv"><b>ID</b><code>${html(r.id)}</code><b>SHA-256</b><code>${html(short(r.sha256, 24))}</code><b>Status</b><code>${html(r.status || '-')}</code><b>Trust</b><code>${html(payload.trustScore ?? '-')}</code><b>Signature</b><code>${html(short(r.serverSignature, 24))}</code></div>` : ''); }
  function updateAutoRegisterMini(payload){ const box = $('pfspTvAutoMini'); if(!box) return; box.className = 'pfsp-v11-result ' + cls(payload); box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload?.verdict))}</div><div class="pfsp-v11-message">${html(payload?.message || '')}</div>`; }
  function updateQueueMini(){ const q=$('pfspTvQueue'); if(q) q.textContent = String(queueItems().length); }
  function renderAudit(){ const box = $('pfspTvAudit'); if(!box) return; const rows = readJson(AUDIT, []).slice(0,5); box.innerHTML = rows.length ? rows.map(r=>`<div><span>${html(r.action)}</span><code>${html(r.id||'-')}</code><small>${html(r.verdict||'-')}</small></div>`).join('') : ''; }
  function readiness(){ const ready = $('pfspTvReady'); if(!ready) return; const qr = !!($('qrEnable')?.checked || $('qrMode')?.checked); const hash = $('qrDocHashEnable') ? $('qrDocHashEnable').checked : true; const auto = $('qrHashAutoRegister') ? $('qrHashAutoRegister').checked : true; ready.innerHTML = `<span class="pfsp-v11-badge ${qr?'good':'warn'}">QR ${qr?'ON':'OFF'}</span> <span class="pfsp-v11-badge ${hash?'good':'warn'}">Hash ${hash?'ON':'OFF'}</span> <span class="pfsp-v11-badge ${auto?'good':'warn'}">Auto ${auto?'ON':'OFF'}</span> <span class="pfsp-v11-badge warn">Queue <b id="pfspTvQueue">${queueItems().length}</b></span>`; }
  function injectMainPanel(){
    if($('pfspTrustedVerifyPanel')) return; const target = $('qrDocHashPanel') || $('qrVerifyBox') || $('tools') || document.querySelector('main'); if(!target) return;
    const div = document.createElement('section'); div.id = 'pfspTrustedVerifyPanel'; div.className = 'pfsp-final-shell';
    div.innerHTML = `<div class="pfsp-final-head"><div class="pfsp-final-title"><div class="pfsp-final-badge">🛡️</div><div><h3>Trusted Verify Registry v12 BIG UPDATE</h3><p>Auto-register ID + SHA-256 vào server registry khi xuất PDF có QR Verify. Bản v12 thêm trust score, history, suspend, metadata, queue retry, batch verify và diagnostics.</p></div></div><a class="pfsp-final-chip good" href="./admin-verify.html" target="_blank" rel="noopener">Admin Console</a></div><div id="pfspTvReady" style="margin-top:14px"></div><div id="pfspTvAutoMini" class="pfsp-v11-result warn"><div class="pfsp-v11-verdict">Auto Register đang chờ</div><div class="pfsp-v11-message">Bật QR Verify rồi xuất PDF. Hệ thống sẽ tự đăng ký metadata qua API.</div></div><div class="pfsp-final-actions"><input id="pfspTvSecret" type="password" autocomplete="off" placeholder="Admin secret cho thao tác thủ công" value="${html(getSecret())}"><button type="button" id="pfspTvCheck" class="primary">Kiểm tra certificate cuối</button><button type="button" id="pfspTvRegister">Đăng ký thủ công</button><button type="button" id="pfspTvFlush" class="good">Flush queue</button><button type="button" id="pfspTvLookup">Lookup hash</button><button type="button" id="pfspTvSuspend" class="danger">Tạm khóa ID</button><button type="button" id="pfspTvRevoke" class="danger">Thu hồi ID</button><button type="button" id="pfspTvRestore" class="good">Khôi phục ID</button></div><div id="pfspTvResult" class="pfsp-v11-result warn"><div class="pfsp-v11-verdict">Sẵn sàng</div><div class="pfsp-v11-message">Xuất PDF có QR Verify để auto-register, hoặc dùng các nút kiểm tra/đăng ký thủ công.</div></div><textarea id="pfspTvPatch" class="pfsp-final-textarea" readonly placeholder="API response / suggested registry patch sẽ hiện ở đây"></textarea><div id="pfspTvAudit" class="pfsp-tv-audit"></div>`;
    target.parentNode.insertBefore(div, target.nextSibling);
    const result = $('pfspTvResult'), dump = $('pfspTvPatch');
    $('pfspTvSecret').addEventListener('change', e=>setSecret(e.target.value.trim()));
    $('pfspTvCheck').onclick = async()=>{ const p=await apiCheck(getCert()); renderStatus(result,p); dump.value=JSON.stringify(p,null,2); };
    $('pfspTvRegister').onclick = async()=>{ const p=await apiRegister(getCert(), {secret:$('pfspTvSecret').value.trim()}); renderStatus(result,p); dump.value=JSON.stringify(p.suggestedRegistry || p,null,2); renderAudit(); };
    $('pfspTvFlush').onclick = async()=>{ const p=await flushQueue(); renderStatus(result,p); dump.value=JSON.stringify(p,null,2); renderAudit(); };
    $('pfspTvLookup').onclick = async()=>{ const cert=getCert(); const rec=certToRecord(cert)||{}; const p=await apiLookupHash(rec.sha256 || prompt('Nhập SHA-256 cần lookup:','')); renderStatus(result,p); dump.value=JSON.stringify(p,null,2); };
    $('pfspTvSuspend').onclick = async()=>{ const cert=getCert(); const id=(cert&&cert.id)||prompt('Nhập Verify ID cần tạm khóa:'); if(!id)return; const reason=prompt('Lý do tạm khóa:','Cần kiểm tra lại tài liệu') || 'suspended'; const p=await apiSuspend(id, reason, $('pfspTvSecret').value.trim()); renderStatus(result,p); dump.value=JSON.stringify(p.suggestedRegistry || p,null,2); renderAudit(); };
    $('pfspTvRevoke').onclick = async()=>{ const cert=getCert(); const id=(cert&&cert.id)||prompt('Nhập Verify ID cần thu hồi:'); if(!id)return; const reason=prompt('Lý do thu hồi:','Tài liệu không còn hợp lệ') || 'revoked'; const p=await apiRevoke(id, reason, $('pfspTvSecret').value.trim()); renderStatus(result,p); dump.value=JSON.stringify(p.suggestedRegistry || p,null,2); renderAudit(); };
    $('pfspTvRestore').onclick = async()=>{ const cert=getCert(); const id=(cert&&cert.id)||prompt('Nhập Verify ID cần khôi phục:'); if(!id)return; const p=await apiRestore(id, $('pfspTvSecret').value.trim()); renderStatus(result,p); dump.value=JSON.stringify(p.suggestedRegistry || p,null,2); renderAudit(); };
    document.addEventListener('pfsp:auto-register-result', ev=>{ const p=ev.detail||{}; renderStatus(result,p); dump.value=JSON.stringify(p.suggestedRegistry || p,null,2); renderAudit(); });
    ['qrEnable','qrMode','qrDocHashEnable','qrHashAutoRegister'].forEach(id=>$(id)?.addEventListener('change', readiness)); readiness(); renderAudit(); updateQueueMini(); setTimeout(()=>flushQueue().catch(()=>{}),1500);
  }
  window.PFSPTrustedVerifyRegistry = {apiCheck, apiRegister, autoRegisterCertificate, apiRevoke, apiRestore, apiSuspend, apiLookupHash, flushQueue, saveLocalRecord, localRecords, certToRecord, renderStatus, updateAutoRegisterMini};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectMainPanel); else setTimeout(injectMainPanel,0);
})();
