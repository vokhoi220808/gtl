/* PDF Fusion Smart Pro - Verify System v11 standalone verify page */
(function(){
  'use strict';
  const API = './api/verify';
  const $ = id => document.getElementById(id);
  const state = { params: {}, lastPdfHash: '', lastFileSize: null, lastPayload: null, lastCertificate: null };
  const labels = {
    GENUINE: '✅ TÀI LIỆU THẬT',
    REGISTERED_NEEDS_FILE: '⚠️ ID CÓ THẬT - CẦN UPLOAD PDF',
    UNKNOWN: '⚠️ ID CHƯA ĐĂNG KÝ',
    FAKE_OR_MODIFIED: '❌ GIẢ MẠO / ĐÃ BỊ SỬA',
    REVOKED: '⛔ ID ĐÃ BỊ THU HỒI',
    EXPIRED: '⌛ ID ĐÃ HẾT HẠN',
    REGISTRY_TAMPERED: '❌ REGISTRY BỊ CAN THIỆP',
    HASH_MATCH_SIZE_WARNING: '⚠️ HASH KHỚP NHƯNG SIZE KHÁC',
    NO_ID: '❌ THIẾU VERIFY ID',
    SERVER_ERROR: '❌ LỖI SERVER',
    HEALTHY: '✅ API ONLINE'
  };
  function html(value){return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function short(value, len=18){const s=String(value||'');return s ? s.slice(0,len).toUpperCase() + (s.length>len?'…':'') : '-';}
  function cls(payload){const l=payload?.level || (payload?.ok ? 'good' : 'warn');return l === 'good' ? 'good' : l === 'bad' ? 'bad' : 'warn';}
  function label(verdict){return labels[verdict] || verdict || 'UNKNOWN';}
  function normalizeHash(value){return String(value||'').toLowerCase().replace(/[^a-f0-9]/g,'').slice(0,64);}
  function parseInput(text){
    const raw = String(text || '').trim();
    if(!raw) return {};
    try{
      const parsed = JSON.parse(raw);
      return paramsFromCertificate(parsed);
    }catch{}
    if(/^https?:\/\//i.test(raw) || raw.includes('?')){
      try{
        const u = new URL(raw, location.href);
        return Object.fromEntries(u.searchParams.entries());
      }catch{}
    }
    const maybeId = raw.match(/PFSP-[A-Z0-9-]{8,100}/i);
    const maybeHash = raw.match(/[a-f0-9]{64}/i);
    return { id: maybeId ? maybeId[0].toUpperCase() : raw.toUpperCase(), sha256: maybeHash ? maybeHash[0].toLowerCase() : '' };
  }
  function paramsFromUrl(){return Object.fromEntries(new URLSearchParams(location.search).entries());}
  function paramsFromCertificate(cert){
    const c = cert && (cert.certificate || cert.record || cert);
    if(!c || typeof c !== 'object') return {};
    return {
      id: c.id || c.verifyId || '',
      sha256: c.sha256 || c.hash || c.h || '',
      size: c.size != null ? String(c.size) : '',
      ts: c.createdAt || c.ts || '',
      origin: c.origin || c.o || '',
      sourceHash: c.sourceBundleSha256 || c.sourceHash || c.sh || '',
      hck: c.checksum || c.hck || '',
      certificate: c
    };
  }
  function activeQuery(extra={}){
    const base = {...state.params};
    const q = {
      id: base.id || base.verifyId || '',
      sha256: normalizeHash(extra.sha256 || base.sha256 || base.hash || base.h || ''),
      size: extra.size != null ? String(extra.size) : (base.size || '')
    };
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
    const json = await response.json().catch(() => ({ ok:false, verdict:'SERVER_ERROR', level:'bad', message:'Không đọc được phản hồi API.' }));
    return json;
  }
  async function apiPost(payload){
    const response = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload || {}) });
    return response.json().catch(() => ({ ok:false, verdict:'SERVER_ERROR', level:'bad', message:'Không đọc được phản hồi API.' }));
  }
  function setStatus(payload){
    const badge = $('statusBadge');
    if(!badge) return;
    const c = cls(payload);
    badge.className = 'pfsp-v11-status ' + c;
    badge.textContent = label(payload?.verdict);
  }
  function fillKv(payload={}, uploadHash=''){
    const r = payload.record || {};
    const integrity = payload.registryIntegrity || {};
    const sig = payload.signature || {};
    $('kvId').textContent = r.id || state.params.id || '-';
    $('kvHash').textContent = r.sha256 || state.params.sha256 || state.params.hash || state.params.h || '-';
    $('kvUploadHash').textContent = uploadHash || state.lastPdfHash || payload.providedHash || '-';
    $('kvSize').textContent = r.size != null ? String(r.size) : (state.params.size || '-');
    $('kvStatus').textContent = r.status || '-';
    $('kvExpires').textContent = r.expiresAt || 'Không hết hạn';
    $('kvSignature').textContent = sig.valid === true ? 'YES · ' + short(r.serverSignature) : sig.valid === false ? 'NO · signature invalid' : sig.present ? 'N/A · no signing secret' : 'Missing';
    $('kvIntegrity').textContent = integrity.sha256 ? `${integrity.ok ? 'OK' : 'WARN'} · ${short(integrity.sha256)}` : '-';
  }
  function renderResult(payload, uploadHash=''){
    state.lastPayload = payload;
    if(payload?.certificate) state.lastCertificate = payload.certificate;
    const box = $('trustedResult');
    const c = cls(payload);
    box.className = 'pfsp-v11-result ' + c;
    const r = payload?.record || {};
    const extras = r.id ? `<div class="pfsp-v11-kv"><b>Verify URL</b><code>${html(r.shortVerifyUrl || r.verifyUrl || location.href)}</code><b>File name</b><code>${html(r.fileName || '-')}</code><b>Fingerprint</b><code>${html(r.fingerprint || '-')}</code><b>Message</b><code>${html(payload?.message || '-')}</code></div>` : '';
    box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload?.verdict))}</div><div class="pfsp-v11-message">${html(payload?.message || '')}</div>${extras}`;
    $('docId').textContent = r.id || payload?.id || state.params.id || 'Không có Verify ID trong URL.';
    setStatus(payload);
    fillKv(payload, uploadHash);
  }
  function renderSmall(id, payload){
    const box = $(id); if(!box) return;
    box.className = 'pfsp-v11-result ' + cls(payload);
    box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload.verdict))}</div><div class="pfsp-v11-message">${html(payload.message || '')}</div>` + (payload.hash ? `<div class="pfsp-v11-kv"><b>SHA-256</b><code>${html(payload.hash)}</code></div>` : '');
  }
  async function runCheck(extra={}){
    const q = activeQuery(extra);
    if(!q.id){
      renderResult({ok:false, verdict:'NO_ID', level:'bad', message:'Link verify thiếu ID. Hãy dán URL/certificate hoặc nhập Verify ID thủ công.'});
      return;
    }
    renderResult({ok:false, verdict:'CHECKING', level:'warn', message:'Đang hỏi Trusted Registry...'});
    const payload = await apiGet(q);
    renderResult(payload, extra.sha256 || '');
  }
  async function handlePdf(file){
    if(!file) return;
    renderSmall('pdfResult', {verdict:'CHECKING', level:'warn', message:'Đang tính SHA-256 trong trình duyệt...'});
    try{
      const hash = await sha256File(file);
      state.lastPdfHash = hash;
      state.lastFileSize = file.size;
      const payload = await apiGet(activeQuery({sha256:hash, size:file.size}));
      renderResult(payload, hash);
      renderSmall('pdfResult', {...payload, hash, message:(payload.message || '') + ' File không được upload lên server.'});
    }catch(err){
      renderSmall('pdfResult', {verdict:'SERVER_ERROR', level:'bad', message:err.message || String(err)});
    }
  }
  async function handleCert(file){
    if(!file) return;
    renderSmall('certResult', {verdict:'CHECKING', level:'warn', message:'Đang đọc certificate JSON...'});
    try{
      const cert = JSON.parse(await file.text());
      state.lastCertificate = cert;
      state.params = paramsFromCertificate(cert);
      await runCheck(state.lastPdfHash ? {sha256:state.lastPdfHash, size:state.lastFileSize} : {});
      renderSmall('certResult', {verdict:'REGISTERED_NEEDS_FILE', level:'good', message:'Đã nạp certificate. Bạn có thể upload PDF để so hash thật.'});
    }catch(err){
      renderSmall('certResult', {verdict:'SERVER_ERROR', level:'bad', message:'Certificate không hợp lệ: ' + (err.message || String(err))});
    }
  }
  async function loadHealth(){
    const box = $('healthBox');
    box.className = 'pfsp-v11-result warn';
    box.textContent = 'Đang kiểm tra API...';
    const payload = await apiGet({action:'health'});
    const env = payload.env || {};
    box.className = 'pfsp-v11-result ' + (payload.ok ? 'good' : 'bad');
    box.innerHTML = `<div class="pfsp-v11-verdict">${html(label(payload.verdict))}</div><div class="pfsp-v11-kv"><b>GitHub</b><code>${env.githubConfigured?'OK':'CHƯA CẤU HÌNH'}</code><b>Signing</b><code>${env.signingConfigured?'OK':'THIẾU PFSP_VERIFY_SIGNING_SECRET'}</code><b>Admin</b><code>${env.adminConfigured?'OK':'THIẾU PFSP_VERIFY_ADMIN_SECRET'}</code><b>Origins</b><code>${env.allowedOriginsConfigured?'OK':'CHƯA SET ALLOWLIST'}</code><b>Auto register</b><code>${env.autoRegisterEnabled?'ON':'OFF'}</code></div>`;
  }
  function downloadCertificate(){
    const cert = state.lastCertificate || state.lastPayload?.certificate;
    if(!cert){ renderSmall('trustedResult', {verdict:'REGISTERED_NEEDS_FILE', level:'warn', message:'Chưa có certificate để tải. Hãy verify với PDF/hash khớp trước.'}); return; }
    const blob = new Blob([JSON.stringify(cert,null,2)+'\n'], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (cert.id || 'pfsp') + '.verify-certificate.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function copyText(text){return navigator.clipboard?.writeText(text).catch(()=>{});}
  function wireDrop(id, cb){
    const box = $(id); if(!box) return;
    ['dragenter','dragover'].forEach(ev=>box.addEventListener(ev,e=>{e.preventDefault();box.classList.add('drag');}));
    ['dragleave','drop'].forEach(ev=>box.addEventListener(ev,e=>{e.preventDefault();box.classList.remove('drag');}));
    box.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if(f) cb(f); });
  }
  function initTabs(){
    document.querySelectorAll('.pfsp-v11-tab').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.pfsp-v11-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.pfsp-v11-panel').forEach(p=>p.classList.add('hidden'));
      $('tab-' + btn.dataset.tab)?.classList.remove('hidden');
    }));
  }
  function init(){
    state.params = paramsFromUrl();
    $('pdfFile')?.addEventListener('change', e=>handlePdf(e.target.files && e.target.files[0]));
    $('certFile')?.addEventListener('change', e=>handleCert(e.target.files && e.target.files[0]));
    $('manualBtn')?.addEventListener('click', async()=>{ state.params = parseInput($('manualInput').value); await runCheck(state.lastPdfHash ? {sha256:state.lastPdfHash,size:state.lastFileSize} : {}); });
    $('clearBtn')?.addEventListener('click', async()=>{ $('manualInput').value=''; state.params={}; state.lastCertificate=null; renderResult({ok:false, verdict:'NO_ID', level:'bad', message:'Đã xóa dữ liệu kiểm tra.'}); });
    $('copyBtn')?.addEventListener('click', ()=>copyText($('docId').textContent || ''));
    $('copyUrlBtn')?.addEventListener('click', ()=>copyText(location.href));
    $('downloadCertBtn')?.addEventListener('click', downloadCertificate);
    $('healthBtn')?.addEventListener('click', loadHealth);
    $('qrImage')?.addEventListener('change', async e=>{
      const file = e.target.files && e.target.files[0]; if(!file) return;
      const out = $('scanResult');
      out.className='pfsp-v11-result warn'; out.textContent='Đang đọc ảnh QR...';
      try{
        if(!('BarcodeDetector' in window)) throw new Error('Trình duyệt này chưa hỗ trợ BarcodeDetector. Hãy mở QR bằng camera điện thoại rồi dán URL vào tab thủ công.');
        const detector = new BarcodeDetector({formats:['qr_code']});
        const bitmap = await createImageBitmap(file);
        const codes = await detector.detect(bitmap);
        if(!codes.length) throw new Error('Không thấy QR trong ảnh.');
        const value = codes[0].rawValue || '';
        $('manualInput').value = value;
        state.params = parseInput(value);
        out.className='pfsp-v11-result good'; out.innerHTML = `<div class="pfsp-v11-verdict">Đã đọc QR</div><div class="pfsp-v11-message">${html(value)}</div>`;
        await runCheck(state.lastPdfHash ? {sha256:state.lastPdfHash,size:state.lastFileSize} : {});
      }catch(err){
        out.className='pfsp-v11-result bad'; out.textContent = err.message || String(err);
      }
    });
    wireDrop('pdfDrop', handlePdf);
    wireDrop('certDrop', handleCert);
    initTabs();
    runCheck();
    loadHealth();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
