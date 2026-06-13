/* PDF Fusion Smart Pro - Trusted Verify Registry bridge v11 */
(function(){
  'use strict';
  const API = './api/verify';
  const LOCAL_RECORDS = 'pfspTrustedVerifyLocalRecordsV11';
  const AUDIT = 'pfspTrustedVerifyAuditV11';
  const SECRET = 'pfspVerifyAdminSecretV11';
  const $ = id => document.getElementById(id);
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const short = (value, len=18) => { const s=String(value||''); return s ? s.slice(0,len).toUpperCase() + (s.length>len?'…':'') : '-'; };
  const cls = payload => { const l=payload?.level || (payload?.ok ? 'good' : 'warn'); return l==='good'?'good':l==='bad'?'bad':'warn'; };
  const label = verdict => ({GENUINE:'✅ Tài liệu thật',REGISTERED_NEEDS_FILE:'⚠️ ID có thật, cần PDF',UNKNOWN:'⚠️ ID chưa đăng ký',FAKE_OR_MODIFIED:'❌ PDF đã khác bản gốc',AUTO_REGISTERED:'✅ Đã auto-register',ALREADY_REGISTERED:'✅ Đã có trong registry',REGISTERED:'✅ Đã đăng ký',REVOKED:'⛔ Đã thu hồi',RESTORED:'✅ Đã khôi phục',EXPIRY_UPDATED:'✅ Đã cập nhật hạn',ORIGIN_NOT_ALLOWED:'❌ Origin không được phép',SIGNING_NOT_CONFIGURED:'❌ Thiếu signing secret',SERVER_ERROR:'❌ Lỗi server'}[verdict] || verdict || 'UNKNOWN');
  function getSecret(){try{return localStorage.getItem(SECRET)||'';}catch{return '';}}
  function setSecret(value){try{localStorage.setItem(SECRET, value||'');}catch{}}
  function readJson(key, fallback){try{return JSON.parse(localStorage.getItem(key)||'') || fallback;}catch{return fallback;}}
  function writeJson(key, value){try{localStorage.setItem(key, JSON.stringify(value));}catch{}}
  function localRecords(){return readJson(LOCAL_RECORDS, []);}
  function saveLocalRecord(record){
    if(!record || !record.id) return;
    const records = localRecords().filter(r => String(r.id).toUpperCase() !== String(record.id).toUpperCase());
    records.unshift(record);
    writeJson(LOCAL_RECORDS, records.slice(0, 200));
  }
  function saveAudit(item){
    const rows = readJson(AUDIT, []);
    rows.unshift({time:new Date().toISOString(), ...item});
    writeJson(AUDIT, rows.slice(0, 80));
  }
  function certToRecord(cert){
    const c = cert && (cert.certificate || cert.record || cert);
    if(!c || typeof c !== 'object') return null;
    return {
      id:String(c.id || c.verifyId || '').trim().toUpperCase(),
      sha256:String(c.sha256 || c.hash || c.h || '').toLowerCase().replace(/[^a-f0-9]/g,''),
      size:c.size ?? null,
      fileName:c.fileName || c.name || 'document.pdf',
      mimeType:c.mimeType || 'application/pdf',
      createdAt:c.createdAt || c.ts || new Date().toISOString(),
      origin:c.origin || c.o || location.origin,
      app:c.app || 'PDF Fusion Smart Pro',
      appVersion:c.appVersion || c.version || 'unknown',
      sourceBundleSha256:c.sourceBundleSha256 || c.sourceHash || c.sh || '',
      checksum:c.checksum || c.hck || '',
      expiresAt:c.expiresAt || '',
      note:c.note || ''
    };
  }
  function getCert(){
    try{
      if(window.PFSPDocumentHashVerify?.getLastCertificate) return window.PFSPDocumentHashVerify.getLastCertificate();
      return JSON.parse(localStorage.getItem('pfspDocumentHashLastCertificate') || 'null');
    }catch{return null;}
  }
  async function post(payload, secret=''){
    const r = await fetch(API, {method:'POST', headers:{'Content-Type':'application/json','X-Verify-Admin-Secret':secret}, body:JSON.stringify(secret ? {...payload, adminSecret:secret} : payload)});
    return r.json().catch(()=>({ok:false, verdict:'SERVER_ERROR', level:'bad', message:'Không đọc được phản hồi Verify API.'}));
  }
  async function apiCheck(certOrRecord){
    const record = certToRecord(certOrRecord);
    if(!record || !record.id) return {ok:false, verdict:'NO_ID', level:'bad', message:'Chưa có Verify ID để kiểm tra.'};
    const qs = new URLSearchParams({id:record.id});
    if(record.sha256) qs.set('sha256', record.sha256);
    if(record.size != null && record.size !== '') qs.set('size', String(record.size));
    const r = await fetch(API + '?' + qs.toString(), {cache:'no-store'});
    return r.json().catch(()=>({ok:false, verdict:'SERVER_ERROR', level:'bad', message:'Không đọc được phản hồi Verify API.'}));
  }
  async function apiRegister(certOrRecord, opts={}){
    const record = certToRecord(certOrRecord);
    if(!record || !record.id || !record.sha256) return {ok:false, verdict:'BAD_RECORD', level:'bad', message:'Cần Verify ID và SHA-256 để đăng ký.'};
    const payload = await post({action:'register', certificate:record, overwrite:!!opts.overwrite, note:opts.note || record.note || 'Manual registry registration from app panel.'}, opts.secret || getSecret());
    if(payload.ok && payload.record) saveLocalRecord(payload.record);
    saveAudit({action:'register', id:record.id, verdict:payload.verdict, ok:payload.ok});
    return payload;
  }
  async function autoRegisterCertificate(certOrRecord){
    const record = certToRecord(certOrRecord);
    if(!record || !record.id || !record.sha256) throw new Error('Auto-register cần certificate có Verify ID và SHA-256.');
    const payload = await post({action:'auto-register', certificate:record, registeredBy:'auto-qr-export-v11', note:'Auto registered when PDF Fusion exported a QR Verify PDF.'});
    if(payload.ok && payload.record) saveLocalRecord(payload.record);
    try{
      const cert = certOrRecord && typeof certOrRecord === 'object' ? certOrRecord : {};
      cert.__registryResult = payload;
      localStorage.setItem('pfspDocumentHashLastCertificate', JSON.stringify(cert));
    }catch{}
    saveAudit({action:'auto-register', id:record.id, verdict:payload.verdict, ok:payload.ok});
    updateAutoRegisterMini(payload);
    document.dispatchEvent(new CustomEvent('pfsp:auto-register-result', {detail:payload}));
    return payload;
  }
  async function apiRevoke(id, reason, secret){
    const payload = await post({action:'revoke', id, reason:reason || 'revoked from app panel'}, secret || getSecret());
    saveAudit({action:'revoke', id, verdict:payload.verdict, ok:payload.ok});
    return payload;
  }
  async function apiRestore(id, secret){
    const payload = await post({action:'restore', id}, secret || getSecret());
    saveAudit({action:'restore', id, verdict:payload.verdict, ok:payload.ok});
    return payload;
  }
  function renderStatus(target, payload){
    if(!target) return;
    target.className = 'pfsp-v11-result ' + cls(payload);
    const r = payload?.record || {};
    target.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload?.verdict))}</div><div class="pfsp-v11-message">${html(payload?.message || '')}</div>` + (r.id ? `<div class="pfsp-v11-kv"><b>ID</b><code>${html(r.id)}</code><b>SHA-256</b><code>${html(short(r.sha256, 24))}</code><b>Status</b><code>${html(r.status || '-')}</code><b>Signature</b><code>${html(short(r.serverSignature, 24))}</code></div>` : '');
  }
  function updateAutoRegisterMini(payload){
    const box = $('pfspTvAutoMini'); if(!box) return;
    box.className = 'pfsp-v11-result ' + cls(payload);
    box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload?.verdict))}</div><div class="pfsp-v11-message">${html(payload?.message || '')}</div>`;
  }
  function renderAudit(){
    const box = $('pfspTvAudit'); if(!box) return;
    const rows = readJson(AUDIT, []).slice(0,5);
    box.innerHTML = rows.length ? rows.map(r=>`<div><span>${html(r.action)}</span><code>${html(r.id||'-')}</code><small>${html(r.verdict||'-')}</small></div>`).join('') : '';
  }
  function readiness(){
    const ready = $('pfspTvReady'); if(!ready) return;
    const qr = !!($('qrEnable')?.checked || $('qrMode')?.checked);
    const hash = $('qrDocHashEnable') ? $('qrDocHashEnable').checked : true;
    const auto = $('qrHashAutoRegister') ? $('qrHashAutoRegister').checked : true;
    ready.innerHTML = `<span class="pfsp-v11-badge ${qr?'good':'warn'}">QR ${qr?'ON':'OFF'}</span> <span class="pfsp-v11-badge ${hash?'good':'warn'}">Hash ${hash?'ON':'OFF'}</span> <span class="pfsp-v11-badge ${auto?'good':'warn'}">Auto ${auto?'ON':'OFF'}</span>`;
  }
  function injectMainPanel(){
    if($('pfspTrustedVerifyPanel')) return;
    const target = $('qrDocHashPanel') || $('qrVerifyBox') || $('tools') || document.querySelector('main');
    if(!target) return;
    const div = document.createElement('section');
    div.id = 'pfspTrustedVerifyPanel';
    div.className = 'pfsp-final-shell';
    div.innerHTML = `<div class="pfsp-final-head"><div class="pfsp-final-title"><div class="pfsp-final-badge">🛡️</div><div><h3>Trusted Verify Registry v11</h3><p>Auto-register ID + SHA-256 vào server registry khi xuất PDF có QR Verify. Registry hỗ trợ server signature, revoke, expiry, audit và manual patch khi GitHub write lỗi.</p></div></div><a class="pfsp-final-chip good" href="./admin-verify.html" target="_blank" rel="noopener">Admin Console</a></div><div id="pfspTvReady" style="margin-top:14px"></div><div id="pfspTvAutoMini" class="pfsp-v11-result warn"><div class="pfsp-v11-verdict">Auto Register đang chờ</div><div class="pfsp-v11-message">Bật QR Verify rồi xuất PDF. Hệ thống sẽ tự đăng ký metadata qua API.</div></div><div class="pfsp-final-actions"><input id="pfspTvSecret" type="password" autocomplete="off" placeholder="Admin secret cho thao tác thủ công" value="${html(getSecret())}"><button type="button" id="pfspTvCheck" class="primary">Kiểm tra certificate cuối</button><button type="button" id="pfspTvRegister">Đăng ký thủ công</button><button type="button" id="pfspTvRevoke" class="danger">Thu hồi ID</button><button type="button" id="pfspTvRestore" class="good">Khôi phục ID</button></div><div id="pfspTvResult" class="pfsp-v11-result warn"><div class="pfsp-v11-verdict">Sẵn sàng</div><div class="pfsp-v11-message">Xuất PDF có QR Verify để auto-register, hoặc dùng các nút kiểm tra/đăng ký thủ công.</div></div><textarea id="pfspTvPatch" class="pfsp-final-textarea" readonly placeholder="API response / suggested registry patch sẽ hiện ở đây"></textarea><div id="pfspTvAudit" class="pfsp-tv-audit"></div>`;
    target.parentNode.insertBefore(div, target.nextSibling);
    const result = $('pfspTvResult');
    const dump = $('pfspTvPatch');
    $('pfspTvSecret').addEventListener('change', e=>setSecret(e.target.value.trim()));
    $('pfspTvCheck').onclick = async()=>{ const p=await apiCheck(getCert()); renderStatus(result,p); dump.value=JSON.stringify(p,null,2); };
    $('pfspTvRegister').onclick = async()=>{ const p=await apiRegister(getCert(), {secret:$('pfspTvSecret').value.trim()}); renderStatus(result,p); dump.value=JSON.stringify(p.suggestedRegistry || p,null,2); renderAudit(); };
    $('pfspTvRevoke').onclick = async()=>{ const cert=getCert(); const id=(cert&&cert.id)||prompt('Nhập Verify ID cần thu hồi:'); if(!id)return; const reason=prompt('Lý do thu hồi:','Tài liệu không còn hợp lệ') || 'revoked'; const p=await apiRevoke(id, reason, $('pfspTvSecret').value.trim()); renderStatus(result,p); dump.value=JSON.stringify(p.suggestedRegistry || p,null,2); renderAudit(); };
    $('pfspTvRestore').onclick = async()=>{ const cert=getCert(); const id=(cert&&cert.id)||prompt('Nhập Verify ID cần khôi phục:'); if(!id)return; const p=await apiRestore(id, $('pfspTvSecret').value.trim()); renderStatus(result,p); dump.value=JSON.stringify(p.suggestedRegistry || p,null,2); renderAudit(); };
    document.addEventListener('pfsp:auto-register-result', ev=>{ const p=ev.detail||{}; renderStatus(result,p); dump.value=JSON.stringify(p.suggestedRegistry || p,null,2); renderAudit(); });
    ['qrEnable','qrMode','qrDocHashEnable','qrHashAutoRegister'].forEach(id=>$(id)?.addEventListener('change', readiness));
    readiness(); renderAudit();
  }
  window.PFSPTrustedVerifyRegistry = {apiCheck, apiRegister, autoRegisterCertificate, apiRevoke, apiRestore, saveLocalRecord, localRecords, certToRecord, renderStatus, updateAutoRegisterMini};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectMainPanel); else setTimeout(injectMainPanel,0);
})();
