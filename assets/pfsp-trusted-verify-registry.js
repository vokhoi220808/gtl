/* PDF Fusion Smart Pro - Trusted Verify Registry UI v8.0.0
   Adds server/registry-backed authenticity checks on top of link hash verification. */
(function(){
  'use strict';
  const STORE_SECRET = 'pfspVerifyAdminSecretSession';
  const LOCAL_AUDIT = 'pfspTrustedVerifyAudit';
  const LOCAL_REGISTRY = 'pfspTrustedVerifyLocalRecords';
  const API = './api/verify';
  const $ = id => document.getElementById(id);

  function html(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function short(h){return String(h||'').slice(0,12).toUpperCase();}
  function now(){return new Date().toISOString();}
  function hasHashVerify(){return !!(window.PFSPHashVerify && typeof window.PFSPHashVerify.getLastCertificate === 'function');}
  function getCert(){try{return hasHashVerify()?window.PFSPHashVerify.getLastCertificate():null;}catch{return null;}}
  function saveAudit(event){
    try{
      const list=JSON.parse(localStorage.getItem(LOCAL_AUDIT)||'[]');
      list.unshift({time:now(),...event});
      localStorage.setItem(LOCAL_AUDIT, JSON.stringify(list.slice(0,80)));
    }catch{}
  }
  function getSecret(){
    try{return sessionStorage.getItem(STORE_SECRET)||'';}catch{return '';}
  }
  function setSecret(v){
    try{ if(v) sessionStorage.setItem(STORE_SECRET, v); else sessionStorage.removeItem(STORE_SECRET); }catch{}
  }

  async function staticRegistryCheck(record){
    try{
      const r=await fetch('./data/verify-registry.json',{cache:'no-store'});
      if(!r.ok) return null;
      const reg=await r.json();
      const found=(reg.records||[]).find(x=>String(x.id).toUpperCase()===String(record.id).toUpperCase());
      if(!found)return null;
      if(record.sha256 && String(found.sha256||'').toLowerCase()!==String(record.sha256).toLowerCase()) return {ok:false,verdict:'FAKE_OR_MODIFIED',level:'bad',message:'ID có trong registry tĩnh nhưng hash không khớp.',record:found};
      if(String(found.status||'active').toLowerCase()==='revoked') return {ok:false,verdict:'REVOKED',level:'bad',message:'ID đã bị thu hồi trong registry tĩnh.',record:found};
      if(found.expiresAt && Date.parse(found.expiresAt) && Date.parse(found.expiresAt)<Date.now()) return {ok:false,verdict:'EXPIRED',level:'bad',message:'ID đã hết hạn trong registry tĩnh.',record:found};
      return {ok:true,verdict:record.sha256?'GENUINE':'REGISTERED_NEEDS_FILE',level:record.sha256?'good':'warn',message:'Khớp registry tĩnh data/verify-registry.json.',record:found};
    }catch{return null;}
  }

  function localRecords(){
    try{return JSON.parse(localStorage.getItem(LOCAL_REGISTRY)||'[]');}catch{return[];}
  }
  function saveLocalRecord(record){
    try{
      const list=localRecords().filter(r=>String(r.id).toUpperCase()!==String(record.id).toUpperCase());
      list.unshift({...record, localOnly:true, registeredAt:record.registeredAt||now(), status:record.status||'active'});
      localStorage.setItem(LOCAL_REGISTRY, JSON.stringify(list.slice(0,200)));
      return true;
    }catch{return false;}
  }
  function certToRecord(cert){
    if(!cert)return null;
    return {
      id:String(cert.id||'').toUpperCase(),
      sha256:String(cert.sha256||'').toLowerCase(),
      size:cert.size,
      fileName:cert.fileName||'document.pdf',
      mimeType:cert.mimeType||'application/pdf',
      createdAt:cert.createdAt||cert.ts||now(),
      origin:cert.origin||location.origin,
      app:cert.app||'PDF Fusion Smart Pro',
      appVersion:cert.appVersion||'unknown',
      sourceBundleSha256:cert.sourceBundleSha256||'',
      checksum:cert.checksum||'',
      status:'active',
      registeredBy:'PDF Fusion Smart Pro UI'
    };
  }
  function renderStatus(box, payload){
    if(!box)return;
    const v=payload&&payload.verdict || 'UNKNOWN';
    const level=payload&&payload.level || (payload&&payload.ok?'good':'warn');
    const cls=level==='good'?'good':level==='bad'?'bad':'warn';
    const labels={GENUINE:'✅ THẬT - đã khớp registry',REGISTERED:'✅ Đã đăng ký',REGISTERED_NEEDS_FILE:'⚠️ ID có trong registry, cần upload PDF để so hash',UNKNOWN:'⚠️ Chưa có trong registry',FAKE_OR_MODIFIED:'❌ GIẢ MẠO hoặc PDF đã bị sửa',REVOKED:'❌ ID đã bị thu hồi',EXPIRED:'❌ ID đã hết hạn',REGISTRY_TAMPERED:'❌ Registry có dấu hiệu bị sửa',MANUAL_REGISTRY_PATCH_REQUIRED:'⚠️ Cần commit registry thủ công',UNAUTHORIZED:'❌ Sai admin secret',BAD_HASH:'❌ Hash không hợp lệ',BAD_ID:'❌ Verify ID không hợp lệ',SERVER_ERROR:'❌ Lỗi server'};
    const record=payload&&payload.record;
    box.className='pfsp-tv-result '+cls;
    box.innerHTML=`<b>${html(labels[v]||v)}</b><br><span>${html(payload&&payload.message||'')}</span>`+
      (record?`<div class="pfsp-tv-kv"><span>ID</span><code>${html(record.id)}</code><span>SHA-256</span><code>${html(short(record.sha256))}…</code><span>Trạng thái</span><code>${html(record.status||'active')}</code><span>Đăng ký</span><code>${html(record.registeredAt||'-')}</code></div>`:'')+
      (payload&&payload.commit?`<p><a href="${html(payload.commit)}" target="_blank" rel="noopener">Mở commit registry</a></p>`:'');
  }
  async function apiCheck(recordOrCert){
    const record=recordOrCert&&recordOrCert.sha256?recordOrCert:certToRecord(recordOrCert);
    if(!record || !record.id) throw new Error('Chưa có Verify ID/certificate để kiểm tra.');
    const qs=new URLSearchParams({id:record.id});
    if(record.sha256)qs.set('sha256',record.sha256);
    if(record.size!=null)qs.set('size',String(record.size));
    let payload=null;
    try{
      const r=await fetch(API+'?'+qs.toString(),{cache:'no-store'});
      payload=await r.json();
      if(payload && payload.verdict && payload.verdict!=='UNKNOWN')return payload;
    }catch(err){}
    const staticResult=await staticRegistryCheck(record);
    if(staticResult)return staticResult;
    const local=localRecords().find(x=>String(x.id).toUpperCase()===String(record.id).toUpperCase());
    if(local){
      if(record.sha256 && String(local.sha256).toLowerCase()!==String(record.sha256).toLowerCase()) return {ok:false,verdict:'FAKE_OR_MODIFIED',level:'bad',message:'ID có trong registry cục bộ nhưng hash không khớp.',record:local};
      return {ok:true,verdict:record.sha256?'GENUINE':'REGISTERED_NEEDS_FILE',level:record.sha256?'good':'warn',message:'Khớp registry cục bộ trên trình duyệt này. Lưu ý: cục bộ không phải registry công khai.',record:local};
    }
    return payload || {ok:false,verdict:'UNKNOWN',level:'warn',message:'Không kết nối được registry hoặc ID chưa đăng ký.'};
  }
  async function apiRegister(cert, opts){
    const record=certToRecord(cert);
    if(!record || !record.id || !record.sha256) throw new Error('Cần xuất PDF để có certificate SHA-256 trước.');
    const secret=(opts&&opts.secret)||getSecret();
    if(secret)setSecret(secret);
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Verify-Admin-Secret':secret},body:JSON.stringify({action:'register',certificate:record,adminSecret:secret,overwrite:!!(opts&&opts.overwrite)})});
    const payload=await r.json().catch(()=>({verdict:'SERVER_ERROR',message:'Không đọc được phản hồi server.'}));
    saveAudit({action:'register',id:record.id,verdict:payload.verdict,ok:payload.ok});
    return payload;
  }
  async function apiRevoke(id, reason, secret){
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Verify-Admin-Secret':secret||getSecret()},body:JSON.stringify({action:'revoke',id,reason,adminSecret:secret||getSecret()})});
    const payload=await r.json().catch(()=>({verdict:'SERVER_ERROR',message:'Không đọc được phản hồi server.'}));
    saveAudit({action:'revoke',id,verdict:payload.verdict,ok:payload.ok});
    return payload;
  }
  async function copyText(text, ok){
    try{await navigator.clipboard.writeText(text); if(ok)ok();}
    catch{prompt('Copy thủ công:', text);}
  }
  function injectStyles(){
    if($('pfspTrustedVerifyStyles'))return;
    const style=document.createElement('style');style.id='pfspTrustedVerifyStyles';style.textContent=`
      .pfsp-tv-panel{margin-top:14px;padding:14px;border:1px solid rgba(34,197,94,.35);border-radius:18px;background:linear-gradient(135deg,rgba(22,163,74,.12),rgba(14,165,233,.08));box-shadow:0 16px 40px rgba(15,23,42,.08)}
      .pfsp-tv-panel h4{margin:0 0 8px;font-size:16px}.pfsp-tv-panel p{margin:6px 0}.pfsp-tv-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.pfsp-tv-actions button,.pfsp-tv-actions input{border-radius:12px;border:1px solid rgba(148,163,184,.45);padding:9px 11px}.pfsp-tv-actions input{min-width:230px;background:#fff}.pfsp-tv-result{margin-top:10px;padding:10px;border-radius:14px;border:1px solid rgba(148,163,184,.35);background:#fff}.pfsp-tv-result.good{border-color:rgba(22,163,74,.55);background:rgba(240,253,244,.95)}.pfsp-tv-result.warn{border-color:rgba(245,158,11,.55);background:rgba(255,251,235,.95)}.pfsp-tv-result.bad{border-color:rgba(239,68,68,.55);background:rgba(254,242,242,.95)}.pfsp-tv-kv{display:grid;grid-template-columns:96px minmax(0,1fr);gap:4px 8px;margin-top:8px}.pfsp-tv-kv code{word-break:break-all}.pfsp-tv-small{font-size:12px;opacity:.75}.pfsp-tv-textarea{width:100%;min-height:120px;margin-top:8px;border-radius:12px;border:1px solid rgba(148,163,184,.45);padding:10px;font-family:ui-monospace,monospace;font-size:12px}
    `;document.head.appendChild(style);
  }
  function injectMainPanel(){
    if($('pfspTrustedVerifyPanel'))return;
    const target=$('qrDocHashPanel') || $('qrVerifyBox') || $('tools') || document.querySelector('main');
    if(!target)return;
    const div=document.createElement('div');div.id='pfspTrustedVerifyPanel';div.className='pfsp-tv-panel';
    div.innerHTML=`
      <h4>🛡 Trusted Verify Registry</h4>
      <p class="pfsp-tv-small">Nâng cấp này giúp phân biệt <b>thật / giả mạo / đã sửa / bị thu hồi</b> bằng registry đáng tin. Link hash chỉ là bằng chứng tự mang theo; registry mới là nơi nhớ bản gốc.</p>
      <div class="pfsp-tv-actions">
        <input id="pfspTvSecret" type="password" autocomplete="off" placeholder="Admin secret để đăng ký / thu hồi" value="${html(getSecret())}">
        <button type="button" id="pfspTvCheck">Kiểm tra certificate cuối</button>
        <button type="button" id="pfspTvRegister">Đăng ký vào registry</button>
        <button type="button" id="pfspTvCopyPatch">Copy registry patch</button>
        <button type="button" id="pfspTvLocal">Lưu registry cục bộ</button>
        <button type="button" id="pfspTvRevoke">Thu hồi ID</button>
      </div>
      <div id="pfspTvResult" class="pfsp-tv-result warn">Chưa kiểm tra registry. Hãy xuất PDF có Document Hash rồi bấm kiểm tra/đăng ký.</div>
      <textarea id="pfspTvPatch" class="pfsp-tv-textarea" readonly placeholder="Registry patch/manual JSON sẽ hiện ở đây nếu backend chưa cấu hình."></textarea>
    `;
    target.parentNode.insertBefore(div, target.nextSibling);
    const result=$('pfspTvResult');
    $('pfspTvSecret').addEventListener('change',e=>setSecret(e.target.value.trim()));
    $('pfspTvCheck').onclick=async()=>{try{result.textContent='Đang kiểm tra registry...';renderStatus(result, await apiCheck(getCert()));}catch(err){renderStatus(result,{verdict:'SERVER_ERROR',level:'bad',message:err.message||String(err)});}};
    $('pfspTvRegister').onclick=async()=>{try{result.textContent='Đang đăng ký registry...';const payload=await apiRegister(getCert(),{secret:$('pfspTvSecret').value.trim()});renderStatus(result,payload);if(payload.suggestedRegistry)$('pfspTvPatch').value=JSON.stringify(payload.suggestedRegistry,null,2);}catch(err){renderStatus(result,{verdict:'SERVER_ERROR',level:'bad',message:err.message||String(err)});}};
    $('pfspTvCopyPatch').onclick=async()=>{const cert=getCert();const rec=certToRecord(cert);if(!rec){renderStatus(result,{verdict:'BAD_ID',level:'bad',message:'Chưa có certificate để tạo patch.'});return;}const patch={version:'PFSP-VERIFY-REGISTRY-v1',updatedAt:now(),records:[rec]};$('pfspTvPatch').value=JSON.stringify(patch,null,2);await copyText($('pfspTvPatch').value,()=>renderStatus(result,{verdict:'MANUAL_REGISTRY_PATCH_REQUIRED',level:'warn',message:'Đã copy patch. Dán record này vào data/verify-registry.json nếu chưa cấu hình backend.'}));};
    $('pfspTvLocal').onclick=()=>{const rec=certToRecord(getCert());if(!rec){renderStatus(result,{verdict:'BAD_ID',level:'bad',message:'Chưa có certificate để lưu cục bộ.'});return;}saveLocalRecord(rec);renderStatus(result,{verdict:'REGISTERED',level:'good',message:'Đã lưu vào registry cục bộ của trình duyệt này. Chỉ dùng để test, không phải registry công khai.',record:rec});};
    $('pfspTvRevoke').onclick=async()=>{const cert=getCert();const id=cert&&cert.id||prompt('Nhập Verify ID cần thu hồi:');if(!id)return;try{result.textContent='Đang thu hồi...';renderStatus(result, await apiRevoke(id, prompt('Lý do thu hồi:', 'PDF không còn hợp lệ')||'revoked', $('pfspTvSecret').value.trim()));}catch(err){renderStatus(result,{verdict:'SERVER_ERROR',level:'bad',message:err.message||String(err)});}};
  }
  function init(){injectStyles();injectMainPanel();}
  window.PFSPTrustedVerifyRegistry={apiCheck,apiRegister,apiRevoke,saveLocalRecord,localRecords,certToRecord};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
})();
