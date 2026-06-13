/* PDF Fusion Smart Pro - Verify System v12 standalone verify page */
(function(){
  'use strict';
  const API = './api/verify';
  const $ = id => document.getElementById(id);
  const state = { params: {}, lastPdfHash: '', lastFileSize: null, lastPayload: null, lastCertificate: null };
  const labels = {
    GENUINE:'✅ TÀI LIỆU THẬT', REGISTERED_NEEDS_FILE:'⚠️ ID CÓ THẬT - CẦN UPLOAD PDF', UNKNOWN:'⚠️ ID CHƯA ĐĂNG KÝ', FAKE_OR_MODIFIED:'❌ GIẢ MẠO / ĐÃ BỊ SỬA',
    REVOKED:'⛔ ID ĐÃ BỊ THU HỒI', SUSPENDED:'⛔ ID ĐANG BỊ TẠM KHÓA', EXPIRED:'⌛ ID ĐÃ HẾT HẠN', ARCHIVED:'⚠️ ID ĐÃ LƯU TRỮ', REGISTRY_TAMPERED:'❌ REGISTRY BỊ CAN THIỆP',
    HASH_MATCH_SIZE_WARNING:'⚠️ HASH KHỚP NHƯNG SIZE KHÁC', NO_ID:'❌ THIẾU VERIFY ID', SERVER_ERROR:'❌ LỖI SERVER', HEALTHY:'✅ API ONLINE', SELF_TEST_OK:'✅ SELF-TEST OK',
    SELF_TEST_WARNING:'⚠️ SELF-TEST CÓ CẢNH BÁO', HASH_FOUND:'✅ HASH CÓ TRONG REGISTRY', HASH_NOT_FOUND:'⚠️ HASH CHƯA CÓ TRONG REGISTRY', BATCH_VERIFIED:'📦 BATCH ĐÃ XONG', CERTIFICATE:'✅ CERTIFICATE ĐÃ TẢI', CHECKING:'⏳ ĐANG KIỂM TRA'
  };
  function html(value){return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function short(value, len=18){const s=String(value||'');return s ? s.slice(0,len).toUpperCase() + (s.length>len?'…':'') : '-';}
  function cls(payload){const l=payload?.level || (payload?.ok ? 'good' : 'warn');return l === 'good' ? 'good' : l === 'bad' ? 'bad' : 'warn';}
  function label(verdict){return labels[verdict] || verdict || 'UNKNOWN';}
  function normalizeHash(value){return String(value||'').toLowerCase().replace(/[^a-f0-9]/g,'').slice(0,64);}
  function parseInput(text){
    const raw = String(text || '').trim();
    if(!raw) return {};
    try{ return paramsFromCertificate(JSON.parse(raw)); }catch{}
    if(/^https?:\/\//i.test(raw) || raw.includes('?')){
      try{ const u = new URL(raw, location.href); return Object.fromEntries(u.searchParams.entries()); }catch{}
    }
    const maybeId = raw.match(/PFSP-[A-Z0-9-]{8,100}/i);
    const maybeHash = raw.match(/[a-f0-9]{64}/i);
    const parts = raw.split(/[|,;\s]+/).filter(Boolean);
    return { id: maybeId ? maybeId[0].toUpperCase() : (parts.find(x=>/^PFSP-/i.test(x)) || raw).toUpperCase(), sha256: maybeHash ? maybeHash[0].toLowerCase() : '' };
  }
  function paramsFromUrl(){return Object.fromEntries(new URLSearchParams(location.search).entries());}
  function paramsFromCertificate(cert){
    const c = cert && (cert.certificate || cert.record || cert);
    if(!c || typeof c !== 'object') return {};
    return { id:c.id || c.verifyId || '', sha256:c.sha256 || c.hash || c.h || '', size:c.size != null ? String(c.size) : '', ts:c.createdAt || c.ts || '', origin:c.origin || c.o || '', sourceHash:c.sourceBundleSha256 || c.sourceHash || c.sh || '', hck:c.checksum || c.hck || '', certificate:c };
  }
  function activeQuery(extra={}){
    const base = {...state.params};
    const q = { id: base.id || base.verifyId || '', sha256: normalizeHash(extra.sha256 || base.sha256 || base.hash || base.h || ''), size: extra.size != null ? String(extra.size) : (base.size || '') };
    if(!q.sha256) delete q.sha256;
    if(!q.size) delete q.size;
    return q;
  }
  async function sha256File(file){
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function apiGet(params){
    const qs = new URLSearchParams();
    Object.entries(params || {}).forEach(([k,v]) => { if(v != null && v !== '') qs.set(k, v); });
    const response = await fetch(API + '?' + qs.toString(), { cache:'no-store' });
    return response.json().catch(() => ({ ok:false, verdict:'SERVER_ERROR', level:'bad', message:'Không đọc được phản hồi API.' }));
  }
  async function apiPost(payload){
    const response = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload || {}) });
    return response.json().catch(() => ({ ok:false, verdict:'SERVER_ERROR', level:'bad', message:'Không đọc được phản hồi API.' }));
  }
  function setText(id, value){ const el=$(id); if(el) el.textContent = value == null || value === '' ? '-' : String(value); }
  function setStatus(payload){
    const badge = $('statusBadge'); if(!badge) return;
    const c = cls(payload); badge.className = 'pfsp-v11-status ' + c; badge.textContent = label(payload?.verdict);
  }
  function fillKv(payload={}, uploadHash=''){
    const r = payload.record || {}; const integrity = payload.registryIntegrity || {}; const sig = payload.signature || {};
    setText('kvId', r.id || state.params.id || '-'); setText('kvHash', r.sha256 || state.params.sha256 || state.params.hash || state.params.h || '-'); setText('kvUploadHash', uploadHash || state.lastPdfHash || payload.providedHash || '-');
    setText('kvSize', r.size != null ? String(r.size) : (state.params.size || '-')); setText('kvStatus', r.status || '-'); setText('kvExpires', r.expiresAt || 'Không hết hạn'); setText('kvFingerprint', r.fingerprint || '-');
    setText('kvSignature', sig.valid === true ? 'YES · ' + short(r.serverSignature) : sig.valid === false ? 'NO · signature invalid' : sig.present ? 'N/A · no signing secret' : 'Missing');
    setText('kvIntegrity', integrity.sha256 ? `${integrity.ok ? 'OK' : 'WARN'} · ${short(integrity.sha256)}` : '-');
  }
  function renderTrust(payload={}){
    const score = Number.isFinite(Number(payload.trustScore)) ? Number(payload.trustScore) : null;
    const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
    setText('trustScore', score == null ? '--' : String(Math.round(score)));
    const fill = $('trustFill'); if(fill) fill.style.width = pct + '%';
    setText('trustLevel', payload.trustLevel ? `Mức tin cậy: ${payload.trustLevel}` : 'Chưa có dữ liệu xác minh.');
    const checks = $('trustChecks');
    if(checks){
      const rows = Array.isArray(payload.checks) ? payload.checks : [];
      checks.innerHTML = rows.length ? rows.map(x=>`<div class="pfsp-v12-check ${x.ok?'good':'bad'}"><span>${x.ok?'✅':'❌'}</span><div><b>${html(x.name)}</b><div class="pfsp-v11-small">${html(x.message||'')}</div></div><code>${html(String(x.weight ?? ''))}</code></div>`).join('') : 'Chưa có checks.';
    }
  }
  function renderTimeline(payload={}){
    const box = $('timelineBox'); if(!box) return;
    const rows = Array.isArray(payload.timeline) ? payload.timeline : [];
    box.innerHTML = rows.length ? rows.map(x=>`<div class="pfsp-v12-time"><b>${html(x.action || '-')}</b><span>${html(x.time || '')}</span><span>${html(x.label || '')}</span></div>`).join('') : 'Chưa có timeline.';
  }
  function renderDump(payload){ const d=$('payloadDump'); if(d) d.value = JSON.stringify(payload || {}, null, 2); }
  function renderResult(payload, uploadHash=''){
    state.lastPayload = payload; if(payload?.certificate) state.lastCertificate = payload.certificate;
    const box = $('trustedResult'); const c = cls(payload); box.className = 'pfsp-v11-result ' + c;
    const r = payload?.record || {};
    const extras = r.id ? `<div class="pfsp-v11-kv"><b>Verify URL</b><code>${html(r.shortVerifyUrl || r.verifyUrl || location.href)}</code><b>File name</b><code>${html(r.fileName || '-')}</code><b>Owner / Project</b><code>${html([r.owner,r.project].filter(Boolean).join(' · ') || '-')}</code><b>Fingerprint</b><code>${html(r.fingerprint || '-')}</code><b>Message</b><code>${html(payload?.message || '-')}</code></div>` : '';
    box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload?.verdict))}</div><div class="pfsp-v11-message">${html(payload?.message || '')}</div>${extras}`;
    setText('docId', r.id || payload?.id || state.params.id || 'Không có Verify ID trong URL.');
    setStatus(payload); fillKv(payload, uploadHash); renderTrust(payload); renderTimeline(payload); renderDump(payload);
  }
  function renderSmall(id, payload){
    const box = $(id); if(!box) return; box.className = 'pfsp-v11-result ' + cls(payload);
    box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload.verdict))}</div><div class="pfsp-v11-message">${html(payload.message || '')}</div>` + (payload.hash ? `<div class="pfsp-v11-kv"><b>SHA-256</b><code>${html(payload.hash)}</code></div>` : '');
  }
  async function runCheck(extra={}){
    const q = activeQuery(extra);
    if(!q.id){ renderResult({ok:false, verdict:'NO_ID', level:'bad', message:'Link verify thiếu ID. Hãy dán URL/certificate hoặc nhập Verify ID thủ công.', trustScore:0, trustLevel:'unknown'}); return; }
    renderResult({ok:false, verdict:'CHECKING', level:'warn', message:'Đang hỏi Trusted Registry...'});
    const payload = await apiGet(q); renderResult(payload, extra.sha256 || '');
  }
  async function handlePdf(file){
    if(!file) return;
    renderSmall('pdfResult', {verdict:'CHECKING', level:'warn', message:'Đang tính SHA-256 trong trình duyệt...'});
    try{
      const hash = await sha256File(file); state.lastPdfHash = hash; state.lastFileSize = file.size;
      const payload = await apiGet(activeQuery({sha256:hash, size:file.size})); renderResult(payload, hash);
      renderSmall('pdfResult', {...payload, hash, message:(payload.message || '') + ' File không được upload lên server.'});
    }catch(err){ renderSmall('pdfResult', {verdict:'SERVER_ERROR', level:'bad', message:err.message || String(err)}); }
  }
  async function handleCert(file){
    if(!file) return; renderSmall('certResult', {verdict:'CHECKING', level:'warn', message:'Đang đọc certificate JSON...'});
    try{ const cert = JSON.parse(await file.text()); state.lastCertificate = cert; state.params = paramsFromCertificate(cert); await runCheck(state.lastPdfHash ? {sha256:state.lastPdfHash, size:state.lastFileSize} : {}); renderSmall('certResult', {verdict:'CERTIFICATE', level:'good', message:'Đã nạp certificate. Bạn có thể upload PDF để so hash thật.'}); }
    catch(err){ renderSmall('certResult', {verdict:'SERVER_ERROR', level:'bad', message:'Certificate không hợp lệ: ' + (err.message || String(err))}); }
  }
  async function loadHealth(action='health'){
    const box = $('healthBox'); box.className = 'pfsp-v11-result warn'; box.textContent = 'Đang kiểm tra API...';
    const payload = await apiGet({action}); const env = payload.env || {}; const checks = payload.checks || [];
    box.className = 'pfsp-v11-result ' + cls(payload);
    const checksHtml = checks.length ? `<div class="pfsp-v12-checks">${checks.map(x=>`<div class="pfsp-v12-check ${x.ok?'good':'bad'}"><span>${x.ok?'✅':'⚠️'}</span><div><b>${html(x.name)}</b><div class="pfsp-v11-small">${html(x.message||'')}</div></div></div>`).join('')}</div>` : '';
    box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload.verdict))}</div><div class="pfsp-v11-kv"><b>GitHub</b><code>${env.githubConfigured?'OK':'CHƯA CẤU HÌNH'}</code><b>Signing</b><code>${env.signingConfigured?'OK':'THIẾU SECRET'}</code><b>Admin</b><code>${env.adminConfigured?'OK':'THIẾU ADMIN'}</code><b>Origins</b><code>${env.allowedOriginsConfigured?'OK':'CHƯA SET'}</code><b>Auto register</b><code>${env.autoRegisterEnabled?'ON':'OFF'}</code><b>API</b><code>${html(env.apiVersion || payload.apiVersion || '-')}</code></div>${checksHtml}`;
  }
  async function lookupHash(){
    const hash = state.lastPdfHash || normalizeHash(($('manualInput')?.value || '').match(/[a-f0-9]{64}/i)?.[0] || '');
    if(!hash){ renderSmall('pdfResult', {verdict:'BAD_HASH', level:'warn', message:'Chưa có SHA-256 để lookup. Upload PDF hoặc dán hash trước.'}); return; }
    const payload = await apiGet({action:'lookup-hash', sha256:hash}); renderDump(payload);
    renderSmall('pdfResult', {...payload, hash, message:payload.message || 'Lookup xong.'});
  }
  function downloadJson(name, data){
    const blob = new Blob([JSON.stringify(data,null,2)+'\n'], {type:'application/json'}); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function downloadCertificate(){ const cert = state.lastCertificate || state.lastPayload?.certificate; if(!cert){ renderSmall('trustedResult', {verdict:'REGISTERED_NEEDS_FILE', level:'warn', message:'Chưa có certificate để tải. Hãy verify với PDF/hash khớp trước.'}); return; } downloadJson((cert.id || 'pfsp') + '.verify-certificate.json', cert); }
  function copyText(text){return navigator.clipboard?.writeText(text).catch(()=>{});}
  function wireDrop(id, cb){
    const box = $(id); if(!box) return; ['dragenter','dragover'].forEach(ev=>box.addEventListener(ev,e=>{e.preventDefault();box.classList.add('drag');}));
    ['dragleave','drop'].forEach(ev=>box.addEventListener(ev,e=>{e.preventDefault();box.classList.remove('drag');})); box.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if(f) cb(f); });
  }
  function initTabs(){
    document.querySelectorAll('.pfsp-v11-tab').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.pfsp-v11-tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); document.querySelectorAll('.pfsp-v11-panel').forEach(p=>p.classList.add('hidden')); $('tab-' + btn.dataset.tab)?.classList.remove('hidden'); }));
  }
  function batchItemFromLine(line){
    const raw = String(line || '').trim(); if(!raw) return null;
    try{return paramsFromCertificate(JSON.parse(raw));}catch{}
    if(/^https?:\/\//i.test(raw) || raw.includes('?')) return parseInput(raw);
    const id = (raw.match(/PFSP-[A-Z0-9-]{8,100}/i)||[])[0] || '';
    const hash = (raw.match(/[a-f0-9]{64}/i)||[])[0] || '';
    return {id:id.toUpperCase(), sha256:hash.toLowerCase()};
  }
  async function runBatch(){
    const lines = ($('batchInput')?.value || '').split(/\n+/).map(batchItemFromLine).filter(x=>x && x.id);
    const box = $('batchResult');
    if(!lines.length){ renderSmall('batchResult', {verdict:'NO_ID', level:'bad', message:'Chưa có dòng hợp lệ để batch verify.'}); return; }
    box.className='pfsp-v11-result warn'; box.textContent='Đang batch verify...';
    const payload = await apiPost({action:'batch-verify', items:lines}); renderDump(payload);
    const rows = (payload.results || []).map(r=>`<div class="pfsp-v12-batch-row ${cls(r)}"><b>${html(label(r.verdict))}</b><div class="pfsp-v11-small">${html(r.record?.id || r.id || lines[r.index]?.id || '-')}</div><div>${html(r.message || '')}</div></div>`).join('');
    box.className='pfsp-v11-result ' + cls(payload); box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload.verdict))}</div><div class="pfsp-v11-message">${html(payload.message || '')}</div><div class="pfsp-v12-batch-list">${rows}</div>`;
  }
  function init(){
    state.params = paramsFromUrl();
    $('pdfFile')?.addEventListener('change', e=>handlePdf(e.target.files && e.target.files[0]));
    $('certFile')?.addEventListener('change', e=>handleCert(e.target.files && e.target.files[0]));
    $('manualBtn')?.addEventListener('click', async()=>{ state.params = parseInput($('manualInput').value); await runCheck(state.lastPdfHash ? {sha256:state.lastPdfHash,size:state.lastFileSize} : {}); });
    $('clearBtn')?.addEventListener('click', async()=>{ $('manualInput').value=''; state.params={}; state.lastCertificate=null; renderResult({ok:false, verdict:'NO_ID', level:'bad', message:'Đã xóa dữ liệu kiểm tra.', trustScore:0, trustLevel:'unknown'}); });
    $('copyBtn')?.addEventListener('click', ()=>copyText($('docId').textContent || ''));
    $('copyUrlBtn')?.addEventListener('click', ()=>copyText(location.href));
    $('downloadCertBtn')?.addEventListener('click', downloadCertificate);
    $('downloadPayloadBtn')?.addEventListener('click', ()=>downloadJson('pfsp-verify-payload-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json', state.lastPayload || {}));
    $('healthBtn')?.addEventListener('click', ()=>loadHealth('health'));
    $('diagnosticsBtn')?.addEventListener('click', ()=>loadHealth('self-test'));
    $('lookupHashBtn')?.addEventListener('click', lookupHash);
    $('batchBtn')?.addEventListener('click', runBatch);
    $('batchSampleBtn')?.addEventListener('click', ()=>{$('batchInput').value='PFSP-20260613-ABC123DEF456\nhttps://example.com/verify.html?id=PFSP-20260613-ABC123DEF456&sha256=' + '0'.repeat(64);});
    $('qrImage')?.addEventListener('change', async e=>{
      const file = e.target.files && e.target.files[0]; if(!file) return; const out = $('scanResult'); out.className='pfsp-v11-result warn'; out.textContent='Đang đọc ảnh QR...';
      try{ if(!('BarcodeDetector' in window)) throw new Error('Trình duyệt này chưa hỗ trợ BarcodeDetector. Hãy mở QR bằng camera điện thoại rồi dán URL vào tab thủ công.'); const detector = new BarcodeDetector({formats:['qr_code']}); const bitmap = await createImageBitmap(file); const codes = await detector.detect(bitmap); if(!codes.length) throw new Error('Không thấy QR trong ảnh.'); const value = codes[0].rawValue || ''; $('manualInput').value = value; state.params = parseInput(value); out.className='pfsp-v11-result good'; out.innerHTML = `<div class="pfsp-v11-verdict">Đã đọc QR</div><div class="pfsp-v11-message">${html(value)}</div>`; await runCheck(state.lastPdfHash ? {sha256:state.lastPdfHash,size:state.lastFileSize} : {}); }
      catch(err){ out.className='pfsp-v11-result bad'; out.textContent = err.message || String(err); }
    });
    wireDrop('pdfDrop', handlePdf); wireDrop('certDrop', handleCert); initTabs(); runCheck(); loadHealth('health');
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
