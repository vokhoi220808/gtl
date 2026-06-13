/* PDF Fusion Smart Pro - Document Hash Verify Upgrade v12.0.0 Big Update Auto Register
   Adds local SHA-256 source/final PDF hash certificates without uploading files. */
(function(){
  'use strict';
  const NS = 'PFSPHashVerify';
  const STORE_KEY = 'pfspDocumentHashLastCertificate';
  const SETTINGS_KEY = 'pfspDocumentHashSettings';
  const $ = id => document.getElementById(id);
  const te = new TextEncoder();
  const hasCrypto = !!(window.crypto && window.crypto.subtle && window.crypto.subtle.digest);

  const state = {
    ready:false,
    sourceDigest:'',
    sourceFiles:[],
    lastCertificate:null,
    hashing:false
  };

  function appBase(){
    try{
      if(typeof appBaseUrl === 'function') return appBaseUrl();
    }catch{}
    const origin = /^https?:$/.test(location.protocol) && location.origin && location.origin !== 'null' ? location.origin : 'https://gtl-roan.vercel.app';
    const path = /^https?:$/.test(location.protocol) ? location.pathname.replace(/\/[^/]*$/,'/') : '/';
    return origin + path;
  }
  function appOrigin(){
    try{
      if(typeof qrVerifyOrigin === 'function') return qrVerifyOrigin();
    }catch{}
    return /^https?:$/.test(location.protocol) && location.origin && location.origin !== 'null' ? location.origin : 'https://gtl-roan.vercel.app';
  }
  function nowIso(){
    try{ if(typeof qrVerifyTimestamp === 'function') return qrVerifyTimestamp(); }catch{}
    return new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
  }
  function cleanName(name){
    try{ if(typeof clean === 'function') return clean(name); }catch{}
    return String(name||'file').replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-').replace(/^-|-$/g,'') || 'file';
  }
  function bytesFromData(data){
    if(data instanceof Blob) return data.arrayBuffer();
    if(data instanceof ArrayBuffer) return Promise.resolve(data);
    if(ArrayBuffer.isView(data)) return Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    return new Blob([data]).arrayBuffer();
  }
  function hex(buffer){
    return Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function sha256(data){
    if(!hasCrypto) throw new Error('Trình duyệt này chưa hỗ trợ Web Crypto SHA-256.');
    const buf = data instanceof ArrayBuffer || ArrayBuffer.isView(data) || data instanceof Blob ? await bytesFromData(data) : te.encode(String(data||'')).buffer;
    return hex(await crypto.subtle.digest('SHA-256', buf));
  }
  function shortHash(h){ return String(h||'').slice(0,12).toUpperCase(); }
  async function hashChecksum({id,ts,origin,hash,size,sourceHash}){
    return (await sha256(`PFSP-DOC-HASH-v1|${id||''}|${ts||''}|${origin||''}|${hash||''}|${size||''}|${sourceHash||''}`)).slice(0,24).toUpperCase();
  }
  function loadSettings(){
    try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}catch{return{}}
  }
  function saveSettings(){
    try{
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        enabled: !!$('qrDocHashEnable')?.checked,
        includeSource: !!$('qrHashSourceEnable')?.checked,
        autoCertificate: !!$('qrHashAutoCert')?.checked,
        autoRegister: !!$('qrHashAutoRegister')?.checked
      }));
    }catch{}
  }
  function setStatus(text, kind){
    const el=$('qrHashStatus');
    if(el){el.textContent=text;el.dataset.kind=kind||'info';}
    try{ if(typeof status === 'function') status(text); }catch{}
  }
  function setLastSummary(cert){
    const el=$('qrHashLast');
    if(!el)return;
    if(!cert){el.textContent='Chưa có chứng nhận hash nào.';return;}
    el.innerHTML = `
      <b>${escapeHtml(cert.fileName||'PDF')}</b><br>
      SHA-256: <code>${escapeHtml(shortHash(cert.sha256))}…</code><br>
      ID: <code>${escapeHtml(cert.id||'-')}</code><br>
      <span>${escapeHtml(cert.createdAt||'')}</span>`;
  }
  function escapeHtml(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  function getCurrentId(){
    let id = ($('qrVerifyId')?.value || '').trim();
    if(!id && typeof generateVerifyId === 'function'){
      id = generateVerifyId();
      if($('qrVerifyId')) $('qrVerifyId').value = id;
    }
    return id || 'PFSP-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-HASH00';
  }
  function isEnabled(){ return !!$('qrDocHashEnable')?.checked; }
  function entriesAvailable(){
    try{return Array.isArray(entries) ? entries.filter(e=>e && e.enabled !== false && !e.error) : [];}catch{return []}
  }
  async function prepareSourceHash(){
    if(!hasCrypto){ setStatus('Trình duyệt chưa hỗ trợ SHA-256.', 'bad'); return null; }
    const list=entriesAvailable();
    if(!list.length){ setStatus('Chưa có file để tính hash nguồn.', 'warn'); return null; }
    state.hashing=true; setStatus('Đang tính SHA-256 cho file nguồn...', 'info');
    const files=[];
    for(let i=0;i<list.length;i++){
      const e=list[i];
      const h=await sha256(e.bytes || e.file || new Uint8Array());
      files.push({name:e.file?.name||`file-${i+1}.pdf`, size:e.file?.size || e.bytes?.byteLength || 0, type:e.type||'pdf', pages:e.pages||0, sha256:h});
      setStatus(`Đang tính hash nguồn ${i+1}/${list.length}: ${e.file?.name||''}`, 'info');
    }
    const bundlePayload = JSON.stringify(files.map(f=>({name:f.name,size:f.size,pages:f.pages,sha256:f.sha256})));
    state.sourceFiles=files;
    state.sourceDigest=await sha256(bundlePayload);
    state.hashing=false;
    const text=`Hash nguồn đã sẵn sàng: ${shortHash(state.sourceDigest)}… (${files.length} file)`;
    setStatus(text,'good');
    const box=$('qrSourceHashValue'); if(box) box.textContent=state.sourceDigest;
    try{ if(typeof updateQrUi === 'function') updateQrUi(); }catch{}
    return state.sourceDigest;
  }
  function qrQuery(){
    if(!isEnabled()) return '';
    const parts=[];
    if($('qrHashSourceEnable')?.checked && state.sourceDigest){
      parts.push('sh='+encodeURIComponent(state.sourceDigest));
      parts.push('hm=source-bundle');
      parts.push('hv=1');
    }
    return parts.length ? '&' + parts.join('&') : '';
  }
  async function buildCertificate(blob, name, type){
    const size = blob instanceof Blob ? blob.size : (blob?.byteLength || 0);
    const hash = await sha256(blob);
    const id = getCurrentId();
    const ts = nowIso();
    const origin = appOrigin();
    const sourceHash = state.sourceDigest || '';
    const hck = await hashChecksum({id,ts,origin,hash,size,sourceHash});
    const sourceFiles = state.sourceFiles.map(f=>({name:f.name,size:f.size,type:f.type,pages:f.pages,sha256:f.sha256}));
    const params = new URLSearchParams({id,ts,o:origin,h:hash,size:String(size),hck});
    if(sourceHash){ params.set('sh', sourceHash); params.set('hm','source-bundle'); }
    const verifyUrl = appBase() + 'verify.html?' + params.toString();
    return {
      version:'PFSP-DOC-HASH-v2',
      app:'PDF Fusion Smart Pro',
      appVersion:'12.0.0-verify-big-update',
      id, createdAt:ts, origin,
      fileName:name || 'document.pdf', mimeType:type || 'application/pdf', size,
      sha256:hash,
      sourceBundleSha256:sourceHash,
      sourceFiles,
      checksum:hck,
      verifyUrl,
      note:'This local certificate lets verify.html compare an uploaded PDF SHA-256 hash with this recorded hash. Without a trusted backend or digital signature, authenticity depends on receiving this certificate/link from a trusted source.'
    };
  }
  function qrVerifyIsActive(){
    const enabled = !!$('qrEnable')?.checked;
    const mode = $('qrMode')?.value || 'verify';
    return enabled && mode === 'verify';
  }
  function autoRegisterEnabled(){
    const el=$('qrHashAutoRegister');
    return qrVerifyIsActive() && (!el || el.checked !== false);
  }
  async function autoRegisterLastCertificate(cert){
    if(!cert || !autoRegisterEnabled()) return null;
    const box=$('qrAutoRegisterStatus');
    const set=(text,kind)=>{ if(box){ box.textContent=text; box.dataset.kind=kind||'info'; } setStatus(text, kind||'info'); };
    try{
      set('Đang tự đăng ký Verify ID vào trusted registry...', 'info');
      if(window.PFSPTrustedVerifyRegistry && typeof window.PFSPTrustedVerifyRegistry.autoRegisterCertificate === 'function'){
        const payload = await window.PFSPTrustedVerifyRegistry.autoRegisterCertificate(cert);
        const verdict = payload && payload.verdict || 'UNKNOWN';
        if(payload && payload.ok){ set('Đã tự đăng ký registry: ' + verdict, 'good'); }
        else if(verdict === 'AUTO_REGISTER_PENDING_MANUAL_PATCH'){ set('Registry cần patch thủ công: backend chưa ghi được GitHub.', 'warn'); }
        else { set('Tự đăng ký registry chưa thành công: ' + (payload.message || verdict), 'warn'); }
        document.dispatchEvent(new CustomEvent('pfsp:auto-register-result',{detail:payload}));
        return payload;
      }
      set('Trusted Registry chưa sẵn sàng, thử lại sau...', 'warn');
      setTimeout(()=>autoRegisterLastCertificate(cert), 900);
      return null;
    }catch(err){
      console.warn('[PFSP auto register]', err);
      set('Tự đăng ký registry lỗi: ' + (err?.message || err), 'bad');
      return null;
    }
  }

  async function captureOutput(data, name, type, channel){
    try{
      const isPdf = /\.pdf$/i.test(String(name||'')) || String(type||'').includes('pdf');
      if(!isPdf || !isEnabled()) return;
      const blob = data instanceof Blob ? data : new Blob([data], {type: type || 'application/pdf'});
      setStatus('Đang tạo chứng nhận SHA-256 cho PDF đầu ra...', 'info');
      const cert = await buildCertificate(blob, name, type);
      state.lastCertificate = cert;
      try{ localStorage.setItem(STORE_KEY, JSON.stringify(cert)); }catch{}
      setLastSummary(cert);
      setStatus(`Đã tạo Document Hash: ${shortHash(cert.sha256)}…`, 'good');
      if(autoRegisterEnabled()) autoRegisterLastCertificate(cert);
      if($('qrHashAutoCert')?.checked){ downloadCertificate(cert); }
    }catch(err){
      console.error('[PFSP hash verify]', err);
      setStatus('Không tạo được chứng nhận hash: ' + (err?.message||err), 'bad');
    }
  }
  function getLastCertificate(){
    if(state.lastCertificate) return state.lastCertificate;
    try{ return JSON.parse(localStorage.getItem(STORE_KEY)||'null'); }catch{return null}
  }
  function downloadCertificate(cert=getLastCertificate()){
    if(!cert){ setStatus('Chưa có chứng nhận hash để tải.', 'warn'); return; }
    const blob = new Blob([JSON.stringify(cert,null,2)], {type:'application/json;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=cleanName((cert.fileName||'document').replace(/\.pdf$/i,''))+'-verify-certificate.json';
    document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},1200);
  }
  async function copyVerifyLink(){
    const cert=getLastCertificate();
    if(!cert || !cert.verifyUrl){ setStatus('Chưa có link verify hash. Hãy xuất PDF trước.', 'warn'); return; }
    try{ await navigator.clipboard.writeText(cert.verifyUrl); setStatus('Đã copy link verify hash.', 'good'); }
    catch{ setStatus('Không copy được. Trình duyệt chặn clipboard.', 'warn'); }
  }
  function clearLast(){
    state.lastCertificate=null; state.sourceDigest=''; state.sourceFiles=[];
    try{ localStorage.removeItem(STORE_KEY); }catch{}
    const box=$('qrSourceHashValue'); if(box) box.textContent='-';
    setLastSummary(null);
    setStatus('Đã xóa hash/certificate cục bộ.', 'info');
    try{ if(typeof updateQrUi === 'function') updateQrUi(); }catch{}
  }
  function injectPanel(){
    if($('qrDocHashPanel')) return;
    const target = $('qrVerifyBox') || $('qrPayloadPreview');
    if(!target) return;
    const div=document.createElement('div');
    div.id='qrDocHashPanel';
    div.className='pfsp-doc-hash-panel';
    div.innerHTML=`
      <div class="pfsp-hash-head">
        <strong>🔐 Document Hash Verify <span class="tag">SHA-256</span></strong>
        <span>So hash PDF để biết file có bị sửa không</span>
      </div>
      <label class="pfsp-hash-check"><input id="qrDocHashEnable" type="checkbox" checked> Bật tạo chứng nhận hash khi xuất PDF</label>
      <label class="pfsp-hash-check"><input id="qrHashSourceEnable" type="checkbox" checked> Gắn hash nguồn vào QR nếu đã tính trước</label>
      <label class="pfsp-hash-check"><input id="qrHashAutoCert" type="checkbox"> Tự tải file .verify-certificate.json sau khi xuất PDF</label>
      <label class="pfsp-hash-check pfsp-auto-register-on"><input id="qrHashAutoRegister" type="checkbox" checked> Tự đăng ký registry khi xuất PDF có QR Verify</label>
      <div class="pfsp-auto-register-note">Khi bật QR Verify và xuất PDF, hệ thống sẽ tự gửi ID + SHA-256 lên registry qua API. Không cần bấm admin thủ công.</div>
      <div class="row" style="margin-top:8px">
        <button class="btn good" id="qrHashPrepare" type="button">🧮 Tính hash nguồn</button>
        <button class="btn" id="qrHashCopyLink" type="button">🔗 Copy link hash cuối</button>
        <button class="btn" id="qrHashDownloadCert" type="button">⬇ Tải certificate</button>
        <button class="btn" id="qrHashClear" type="button">🧹 Xóa hash</button>
      </div>
      <div class="pfsp-hash-line">Source bundle SHA-256: <code id="qrSourceHashValue">-</code></div>
      <div id="qrHashLast" class="pfsp-hash-last">Chưa có chứng nhận hash nào.</div>
      <div id="qrHashStatus" class="pfsp-hash-status" data-kind="info">Sẵn sàng. Khi xuất PDF, app sẽ tạo SHA-256 certificate cục bộ.</div>
      <div id="qrAutoRegisterStatus" class="pfsp-hash-status" data-kind="info">Auto Register: bật QR Verify rồi xuất PDF để tự đăng ký.</div>
      <div class="hint">Lưu ý: QR trong PDF không thể tự chứa hash cuối của chính file đó vì sẽ tạo vòng lặp. Bản nâng cấp này tạo <b>certificate/link verify</b> cho PDF đầu ra; trang verify cho upload PDF để so hash chính xác.</div>`;
    target.insertAdjacentElement('afterend', div);

    const s=loadSettings();
    if('enabled' in s) $('qrDocHashEnable').checked=!!s.enabled;
    if('includeSource' in s) $('qrHashSourceEnable').checked=!!s.includeSource;
    if('autoCertificate' in s) $('qrHashAutoCert').checked=!!s.autoCertificate;
    if('autoRegister' in s) $('qrHashAutoRegister').checked=!!s.autoRegister;
    ['qrDocHashEnable','qrHashSourceEnable','qrHashAutoCert','qrHashAutoRegister'].forEach(id=>$(id)?.addEventListener('change',()=>{saveSettings(); try{ if(typeof updateQrUi === 'function') updateQrUi(); }catch{};}));
    $('qrHashPrepare')?.addEventListener('click', prepareSourceHash);
    $('qrHashCopyLink')?.addEventListener('click', copyVerifyLink);
    $('qrHashDownloadCert')?.addEventListener('click', ()=>downloadCertificate());
    $('qrHashClear')?.addEventListener('click', clearLast);
    const last=getLastCertificate(); state.lastCertificate=last; setLastSummary(last);
  }
  function injectStyles(){
    if(document.getElementById('pfspDocHashStyle')) return;
    const st=document.createElement('style'); st.id='pfspDocHashStyle'; st.textContent=`
      .pfsp-doc-hash-panel{margin-top:16px;border:1px solid rgba(34,211,238,.34);border-radius:24px;padding:18px;background:linear-gradient(145deg,rgba(8,47,73,.82),rgba(15,23,42,.92) 45%,rgba(49,46,129,.70));box-shadow:0 22px 70px rgba(2,6,23,.35),inset 0 1px 0 rgba(255,255,255,.06)}
      .pfsp-hash-head{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}.pfsp-hash-head strong{color:#f8fafc;font-size:16px}.pfsp-hash-head span{font-size:12px;color:#bfdbfe}.pfsp-hash-check{display:flex;align-items:center;gap:8px;margin:8px 0;color:#e0f2fe;font-weight:750}.pfsp-hash-check input{accent-color:#22d3ee}.pfsp-auto-register-on{color:#bbf7d0}.pfsp-auto-register-note{margin:8px 0 4px;padding:10px 12px;border-radius:14px;background:rgba(34,197,94,.10);border:1px solid rgba(34,197,94,.26);color:#dcfce7;font-size:12px}.pfsp-hash-line,.pfsp-hash-last,.pfsp-hash-status{margin-top:9px;border:1px solid rgba(148,163,184,.22);border-radius:14px;padding:11px;background:rgba(2,6,23,.48);font-size:12px;color:#cbd5e1;word-break:break-all}.pfsp-hash-line code,.pfsp-hash-last code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:#a7f3d0}.pfsp-hash-status[data-kind="good"]{border-color:rgba(34,197,94,.52);background:rgba(20,83,45,.32);color:#bbf7d0}.pfsp-hash-status[data-kind="warn"]{border-color:rgba(245,158,11,.52);background:rgba(120,53,15,.28);color:#fde68a}.pfsp-hash-status[data-kind="bad"]{border-color:rgba(248,113,113,.60);background:rgba(127,29,29,.32);color:#fecaca}`;
    document.head.appendChild(st);
  }
  function patchQrPayload(){
    try{
      if(typeof getQrPayload !== 'function' || getQrPayload.__pfspHashPatched) return;
      const original = getQrPayload;
      getQrPayload = function(){
        const info = original.apply(this, arguments);
        try{
          if(info && info.mode === 'verify' && isEnabled()){
            const extra = qrQuery();
            if(extra && typeof info.payload === 'string' && !/[?&]sh=/.test(info.payload)){
              info.payload += extra;
              info.label = (info.label || '') + ' · HASH';
            }
          }
        }catch{}
        return info;
      };
      getQrPayload.__pfspHashPatched = true;
    }catch(err){console.warn('[PFSP hash verify] cannot patch getQrPayload', err);}
  }
  function patchDownloads(){
    try{
      if(typeof downloadBlob === 'function' && !downloadBlob.__pfspHashPatched){
        const originalDownload = downloadBlob;
        downloadBlob = function(data,name,type){
          const ret = originalDownload.apply(this, arguments);
          captureOutput(data,name,type,'primary');
          return ret;
        };
        downloadBlob.__pfspHashPatched = true;
      }
      if(typeof extra === 'function' && !extra.__pfspHashPatched){
        const originalExtra = extra;
        extra = function(data,name,type){
          const ret = originalExtra.apply(this, arguments);
          captureOutput(data,name,type,'extra');
          return ret;
        };
        extra.__pfspHashPatched = true;
      }
    }catch(err){console.warn('[PFSP hash verify] cannot patch downloads', err);}
  }
  function init(){
    injectStyles(); injectPanel(); patchQrPayload(); patchDownloads();
    state.ready=true;
    try{ if(typeof updateQrUi === 'function') updateQrUi(); }catch{}
  }
  window[NS] = {state, sha256, hashChecksum, prepareSourceHash, qrQuery, captureOutput, downloadCertificate, copyVerifyLink, clearLast, getLastCertificate, qrVerifyIsActive, autoRegisterEnabled, autoRegisterLastCertificate};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init,0);
})();
