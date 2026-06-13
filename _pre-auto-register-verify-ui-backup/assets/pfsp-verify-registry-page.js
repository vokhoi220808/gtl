/* PDF Fusion Smart Pro - verify.html trusted registry extension v8.0.0 */
(function(){
  'use strict';
  const API='./api/verify';
  const LOCAL_REGISTRY='pfspTrustedVerifyLocalRecords';
  const $=id=>document.getElementById(id);
  const te=new TextEncoder();
  let currentCert=null;
  let currentPdfHash='';
  let currentPdfSize='';
  function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function lang(){return (localStorage.getItem('pfspVerifyLang')||document.documentElement.lang||'vi').slice(0,2)==='en'?'en':'vi';}
  function t(vi,en){return lang()==='en'?en:vi;}
  function getParams(){return new URLSearchParams(location.search);}
  function normHash(v){return String(v||'').toLowerCase().replace(/[^a-f0-9]/g,'');}
  function fieldsFromUrl(){const p=getParams();return {id:String(p.get('id')||'').toUpperCase(),hash:normHash(p.get('h')||p.get('hash')||p.get('sha256')),size:p.get('size')||''};}
  function fieldsFromCert(cert){return {id:String(cert&&cert.id||'').toUpperCase(),hash:normHash(cert&&cert.sha256),size:cert&&cert.size!=null?String(cert.size):''};}
  async function sha256(blob){const buf=blob instanceof Blob?await blob.arrayBuffer():(blob instanceof ArrayBuffer?blob:te.encode(String(blob||'')).buffer);const digest=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');}

  async function staticRegistryCheck(f){try{const r=await fetch('./data/verify-registry.json',{cache:'no-store'});if(!r.ok)return null;const reg=await r.json();const rec=(reg.records||[]).find(x=>String(x.id).toUpperCase()===String(f.id).toUpperCase());if(!rec)return null;if(f.hash&&normHash(rec.sha256)!==f.hash)return {ok:false,verdict:'FAKE_OR_MODIFIED',level:'bad',message:t('ID có trong registry tĩnh nhưng hash PDF không khớp.','ID exists in static registry, but PDF hash does not match.'),record:rec};if(String(rec.status||'active').toLowerCase()==='revoked')return {ok:false,verdict:'REVOKED',level:'bad',message:t('ID đã bị thu hồi trong registry tĩnh.','ID has been revoked in the static registry.'),record:rec};if(rec.expiresAt&&Date.parse(rec.expiresAt)&&Date.parse(rec.expiresAt)<Date.now())return {ok:false,verdict:'EXPIRED',level:'bad',message:t('ID đã hết hạn trong registry tĩnh.','ID has expired in the static registry.'),record:rec};return {ok:true,verdict:f.hash?'GENUINE':'REGISTERED_NEEDS_FILE',level:f.hash?'good':'warn',message:t('Khớp registry tĩnh data/verify-registry.json.','Matches static data/verify-registry.json.'),record:rec};}catch{return null;}}

  function localRecords(){try{return JSON.parse(localStorage.getItem(LOCAL_REGISTRY)||'[]')}catch{return[]}}
  function localCheck(f){const rec=localRecords().find(r=>String(r.id).toUpperCase()===String(f.id).toUpperCase());if(!rec)return null;if(f.hash&&normHash(rec.sha256)!==f.hash)return {ok:false,verdict:'FAKE_OR_MODIFIED',level:'bad',message:t('ID có trong registry cục bộ nhưng hash PDF không khớp.','ID exists in local registry, but PDF hash does not match.'),record:rec};return {ok:true,verdict:f.hash?'GENUINE':'REGISTERED_NEEDS_FILE',level:f.hash?'good':'warn',message:t('Khớp registry cục bộ của trình duyệt này.','Matches this browser local registry.'),record:rec};}
  async function checkRegistry(f){
    if(!f||!f.id)return {ok:false,verdict:'NO_ID',level:'bad',message:t('Thiếu Verify ID.','Missing Verify ID.')};
    const qs=new URLSearchParams({id:f.id});if(f.hash)qs.set('sha256',f.hash);if(f.size)qs.set('size',String(f.size));
    try{const r=await fetch(API+'?'+qs.toString(),{cache:'no-store'});const payload=await r.json();if(payload&&payload.verdict&&payload.verdict!=='UNKNOWN')return payload;if(payload&&payload.verdict==='UNKNOWN'){const sr=await staticRegistryCheck(f);const lc=localCheck(f);return sr||lc||payload;}}
    catch(err){}
    return (await staticRegistryCheck(f))||localCheck(f)||{ok:false,verdict:'UNKNOWN',level:'warn',message:t('ID chưa có trong trusted registry hoặc API registry chưa được cấu hình.','ID is not in the trusted registry, or the registry API is not configured.')};
  }
  function label(verdict){return ({GENUINE:t('✅ THẬT: ID và hash PDF khớp registry đáng tin.','✅ GENUINE: ID and PDF hash match trusted registry.'),REGISTERED_NEEDS_FILE:t('⚠️ ID thật nhưng cần upload PDF để so hash.','⚠️ Registered ID, upload PDF to compare hash.'),UNKNOWN:t('⚠️ CHƯA XÁC ĐỊNH: ID không có trong registry.','⚠️ UNKNOWN: ID is not in registry.'),FAKE_OR_MODIFIED:t('❌ GIẢ MẠO / ĐÃ BỊ SỬA: hash không khớp registry.','❌ FAKE / MODIFIED: hash does not match registry.'),REVOKED:t('❌ BỊ THU HỒI: ID không còn hợp lệ.','❌ REVOKED: ID is no longer valid.'),EXPIRED:t('❌ HẾT HẠN: bản ghi verify đã hết hạn.','❌ EXPIRED: verify record expired.'),REGISTRY_TAMPERED:t('❌ REGISTRY BỊ SỬA: chữ ký bản ghi không hợp lệ.','❌ REGISTRY TAMPERED: record signature invalid.'),NO_ID:t('❌ Thiếu Verify ID.','❌ Missing Verify ID.')})[verdict]||verdict;}
  function render(payload, f){
    const box=$('trustedRegistryResult');if(!box)return;
    const cls=payload.level==='good'?'good':payload.level==='bad'?'bad':'warn';
    const rec=payload.record||{};
    box.className='trusted-registry-result '+cls;
    box.innerHTML=`<b>${esc(label(payload.verdict))}</b><p>${esc(payload.message||'')}</p>`+
      `<div class="trusted-grid"><span>${t('ID kiểm tra','Checked ID')}</span><code>${esc(f&&f.id||'-')}</code><span>${t('Hash kiểm tra','Checked hash')}</span><code>${esc((f&&f.hash)||'-')}</code><span>${t('Registry hash','Registry hash')}</span><code>${esc(rec.sha256||'-')}</code><span>${t('Trạng thái','Status')}</span><code>${esc(rec.status||'-')}</code><span>${t('Đăng ký lúc','Registered at')}</span><code>${esc(rec.registeredAt||'-')}</code></div>`+
      (payload.verdict==='UNKNOWN'?`<p class="trust-note">${t('Kết luận: link/certificate có thể tự tạo. Muốn biết thật/giả chắc hơn, hãy đăng ký ID + SHA-256 vào registry bằng app chính.','Conclusion: a link/certificate can be self-created. For stronger authenticity, register the ID + SHA-256 in the trusted registry from the main app.')}</p>`:'')+
      (payload.verdict==='GENUINE'?`<p class="trust-note">${t('Kết luận: bản PDF này khớp bản gốc đã được registry lưu.','Conclusion: this PDF matches the original record stored in the registry.')}</p>`:'')+
      (payload.verdict==='FAKE_OR_MODIFIED'?`<p class="trust-note">${t('Kết luận: file này không phải bản đã đăng ký, hoặc đã bị chỉnh sửa sau khi đăng ký.','Conclusion: this file is not the registered version, or it was modified after registration.')}</p>`:'');
  }
  async function runCheck(extra){const base=currentCert?fieldsFromCert(currentCert):fieldsFromUrl();const f={...base,...extra};const payload=await checkRegistry(f);render(payload,f);return payload;}
  function inject(){
    if($('trustedRegistryCard'))return;
    const style=document.createElement('style');style.textContent=`.trusted-registry-card{margin:18px 0;padding:18px;border-radius:22px;border:1px solid rgba(34,197,94,.35);background:linear-gradient(135deg,rgba(22,163,74,.12),rgba(14,165,233,.09));box-shadow:0 16px 40px rgba(15,23,42,.08)}.trusted-registry-card h2{margin:0 0 8px}.trusted-registry-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.trusted-registry-actions button{border:0;border-radius:999px;padding:10px 14px;font-weight:700;cursor:pointer}.trusted-registry-result{padding:12px;border-radius:16px;background:#fff;border:1px solid rgba(148,163,184,.35)}.trusted-registry-result.good{background:#f0fdf4;border-color:#22c55e}.trusted-registry-result.warn{background:#fffbeb;border-color:#f59e0b}.trusted-registry-result.bad{background:#fef2f2;border-color:#ef4444}.trusted-grid{display:grid;grid-template-columns:130px minmax(0,1fr);gap:5px 10px}.trusted-grid code{word-break:break-all}.trust-note{font-weight:700}`;document.head.appendChild(style);
    const div=document.createElement('section');div.id='trustedRegistryCard';div.className='trusted-registry-card';div.innerHTML=`<h2>${t('🛡 Trusted Registry Check','🛡 Trusted Registry Check')}</h2><p>${t('Phần này gọi registry/server để biết ID + hash là bản thật đã đăng ký, bị sửa, bị thu hồi hay chưa xác định.','This section checks the registry/server to tell whether the ID + hash is registered genuine, modified, revoked, or unknown.')}</p><div class="trusted-registry-actions"><button id="trustedRegistryBtn" type="button">${t('Kiểm tra registry','Check registry')}</button><button id="trustedRegistryCopy" type="button">${t('Copy kết quả','Copy result')}</button></div><div id="trustedRegistryResult" class="trusted-registry-result warn">${t('Đang chờ kiểm tra registry...','Waiting for registry check...')}</div>`;
    const ref=document.querySelector('.card')||document.querySelector('main')||document.body;ref.parentNode.insertBefore(div, ref.nextSibling);
    $('trustedRegistryBtn').onclick=()=>runCheck(currentPdfHash?{hash:currentPdfHash,size:currentPdfSize}:{});
    $('trustedRegistryCopy').onclick=async()=>{const txt=$('trustedRegistryResult').innerText;try{await navigator.clipboard.writeText(txt)}catch{prompt('Copy:',txt)}};
    setTimeout(()=>runCheck(),200);
  }
  function wire(){
    const pdf=$('pdfFile');if(pdf)pdf.addEventListener('change',async ev=>{const f=ev.target.files&&ev.target.files[0];if(!f)return;currentPdfSize=String(f.size);currentPdfHash=await sha256(f);runCheck({hash:currentPdfHash,size:currentPdfSize});});
    const cert=$('certFile');if(cert)cert.addEventListener('change',async ev=>{const f=ev.target.files&&ev.target.files[0];if(!f)return;try{currentCert=JSON.parse(await f.text());runCheck(fieldsFromCert(currentCert));}catch{}});
    const manual=$('manualBtn');if(manual)manual.addEventListener('click',()=>{currentCert=null;setTimeout(()=>runCheck(currentPdfHash?{hash:currentPdfHash,size:currentPdfSize}:{}),50);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{inject();wire();});else{inject();wire();}
})();
