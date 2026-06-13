
/* PDF Fusion Smart Pro - Verify System Final BIG main integration */
(function(){
  'use strict';
  const API = './api/verify';
  const STORE_CERT = 'pfspDocumentHashLastCertificate';
  const $ = id => document.getElementById(id);
  const html = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const short = s => String(s||'').slice(0,12).toUpperCase();
  function cert(){ try{return window.PFSPHashVerify?.getLastCertificate?.() || JSON.parse(localStorage.getItem(STORE_CERT)||'null')}catch{return null} }
  function base(){ try{ if(typeof appBaseUrl==='function') return appBaseUrl(); }catch{} return location.origin + location.pathname.replace(/\/[^/]*$/,'/'); }
  function normalizeCert(c){ if(!c) return null; return { ...c, id:String(c.id||'').toUpperCase(), sha256:String(c.sha256||c.h||'').toLowerCase(), origin:c.origin||location.origin, app:c.app||'PDF Fusion Smart Pro', appVersion:c.appVersion||'10.0.0-final-big' }; }
  function label(v){return {GENUINE:'✅ TÀI LIỆU THẬT',AUTO_REGISTERED:'✅ TỰ ĐĂNG KÝ THÀNH CÔNG',ALREADY_REGISTERED:'✅ ĐÃ CÓ TRONG REGISTRY',REGISTERED:'✅ ĐÃ ĐĂNG KÝ',REGISTERED_NEEDS_FILE:'⚠️ ID CÓ THẬT - CẦN UPLOAD PDF',UNKNOWN:'⚠️ CHƯA ĐĂNG KÝ',FAKE_OR_MODIFIED:'❌ GIẢ MẠO / ĐÃ SỬA',REVOKED:'⛔ ĐÃ THU HỒI',EXPIRED:'⌛ ĐÃ HẾT HẠN',REGISTRY_TAMPERED:'❌ REGISTRY BỊ SỬA',RATE_LIMITED:'⛔ BỊ GIỚI HẠN TỐC ĐỘ',ORIGIN_NOT_ALLOWED:'⛔ ORIGIN KHÔNG ĐƯỢC PHÉP',ID_COLLISION:'❌ TRÙNG ID KHÁC HASH',INTEGRITY_OK:'✅ REGISTRY TOÀN VẸN',INTEGRITY_WARNING:'⚠️ REGISTRY CẦN KIỂM TRA',BACKUP_READY:'✅ BACKUP SẴN SÀNG',SERVER_ERROR:'❌ LỖI SERVER'}[v]||v||'UNKNOWN'}
  function level(p){ return p?.level || (p?.ok?'good':'warn'); }
  function cls(p){ const l=level(p); return l==='good'?'good':l==='bad'?'bad':'warn'; }
  function render(box,p){ if(!box)return; const r=p?.record||p?.existing||p?.attempted||{}; box.className='pfsp-final-result '+cls(p); box.innerHTML=`<div class="pfsp-final-verdict">${html(label(p?.verdict))}</div><div class="pfsp-final-message">${html(p?.message||'')}</div>`+(r.id?`<div class="pfsp-final-kv"><span>Verify ID</span><code>${html(r.id)}</code><span>SHA-256</span><code>${html(r.sha256||'-')}</code><span>Trạng thái</span><code>${html(r.status||'active')}</code><span>Server signature</span><code>${html(short(r.serverSignature||r.certificateSignature))}…</code><span>Short QR</span><code>${html(r.shortVerifyUrl||('./verify.html?id='+encodeURIComponent(r.id)))}</code><span>Hết hạn</span><code>${html(r.expiresAt||'Không hết hạn')}</code></div>`:'')+(p?.commit?`<p><a class="pfsp-final-chip good" href="${html(p.commit)}" target="_blank" rel="noopener">Mở commit registry</a></p>`:''); }
  async function api(payload){ const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); return await r.json().catch(()=>({ok:false,verdict:'SERVER_ERROR',message:'Không đọc được phản hồi API.'})); }
  async function check(){ const c=normalizeCert(cert()); if(!c) return {ok:false,verdict:'UNKNOWN',level:'warn',message:'Chưa có certificate. Hãy xuất PDF có QR Verify trước.'}; return await api({action:'verify',id:c.id,sha256:c.sha256,size:c.size}); }
  async function integrity(){ return await api({action:'integrity'}); }
  async function backup(secret){ return await api({action:'backup',adminSecret:secret||''}); }
  async function revoke(secret,reason){ const c=normalizeCert(cert()); if(!c) return {ok:false,verdict:'UNKNOWN',message:'Chưa có certificate/ID để thu hồi.'}; return await api({action:'revoke',id:c.id,adminSecret:secret||'',reason:reason||'Revoked from PFSP final panel'}); }
  async function restore(secret){ const c=normalizeCert(cert()); if(!c) return {ok:false,verdict:'UNKNOWN',message:'Chưa có certificate/ID để khôi phục.'}; return await api({action:'restore',id:c.id,adminSecret:secret||''}); }
  function enhanceTrustedRegistry(){
    if(!window.PFSPTrustedVerifyRegistry || window.PFSPTrustedVerifyRegistry.__finalBig) return;
    const original = window.PFSPTrustedVerifyRegistry.autoRegisterCertificate;
    window.PFSPTrustedVerifyRegistry.autoRegisterCertificate = async function(c){
      const certObj=normalizeCert(c);
      const payload={action:'auto-register',certificate:certObj,registeredBy:'auto-qr-export-final-big',note:'Automatically registered when a QR Verify PDF was exported by PDF Fusion Smart Pro Final BIG.'};
      const r=await api(payload);
      try{
        c.__registryResult=r;
        if(r.certificate){ c.trustedCertificate=r.certificate; c.shortVerifyUrl=r.certificate.shortVerifyUrl; c.serverSignature=r.certificate.serverSignature; c.certificateSignature=r.certificate.certificateSignature; c.verifyUrl=r.certificate.verifyUrl || c.verifyUrl; }
        localStorage.setItem(STORE_CERT,JSON.stringify(c));
      }catch{}
      try{ window.PFSPTrustedVerifyRegistry.updateAutoRegisterMini?.(r); }catch{}
      document.dispatchEvent(new CustomEvent('pfsp:verify-final-auto-register',{detail:r}));
      return r;
    };
    window.PFSPTrustedVerifyRegistry.__finalBig=true;
    window.PFSPTrustedVerifyRegistry.autoRegisterCertificateOriginal=original;
  }
  function patchQrShort(){
    try{
      if(typeof getQrPayload !== 'function' || getQrPayload.__pfspFinalShortQr) return;
      const original=getQrPayload;
      getQrPayload=function(){
        const info=original.apply(this,arguments);
        try{
          if(info && info.mode==='verify'){
            let id=($('qrVerifyId')?.value||'').trim();
            if(!id && typeof generateVerifyId==='function'){ id=generateVerifyId(); if($('qrVerifyId')) $('qrVerifyId').value=id; }
            if(id){ info.payload=base()+'verify.html?id='+encodeURIComponent(id); info.label=id+' · TRUSTED'; info.shortQr=true; }
          }
        }catch{}
        return info;
      };
      getQrPayload.__pfspFinalShortQr=true;
      try{updateQrUi?.()}catch{}
    }catch(err){ console.warn('[PFSP Final BIG] short QR patch failed',err); }
  }
  function panel(){
    if($('pfspFinalBigPanel')) return;
    const target=$('pfspTrustedVerifyPanel')||$('qrDocHashPanel')||$('qrVerifyBox')||document.querySelector('main'); if(!target) return;
    const div=document.createElement('section'); div.id='pfspFinalBigPanel'; div.className='pfsp-final-shell';
    div.innerHTML=`<div class="pfsp-final-head"><div class="pfsp-final-title"><div class="pfsp-final-badge">🛡️</div><div><h3>Verify System Final BIG</h3><p>QR rút gọn chỉ chứa ID. Khi xuất PDF có QR Verify, hệ thống tự đăng ký ID + SHA-256 vào registry, ký certificate bằng server, hỗ trợ thu hồi, hết hạn, audit log và kiểm tra toàn vẹn.</p></div></div><a class="pfsp-final-chip good" href="./admin-verify.html" target="_blank" rel="noopener">Admin Verify</a></div><div class="pfsp-final-grid"><div class="pfsp-final-metric"><b>Short QR</b><span>verify.html?id=PFSP...</span></div><div class="pfsp-final-metric"><b>Server-signed</b><span>HMAC SHA-256 certificate</span></div><div class="pfsp-final-metric"><b>Auto Register</b><span>Không cần thao tác admin khi xuất PDF</span></div><div class="pfsp-final-metric"><b>Audit + Revoke</b><span>Theo dõi và thu hồi ID</span></div></div><div class="pfsp-final-actions"><input id="pfspFinalSecret" type="password" placeholder="Admin secret cho revoke/restore/backup"><button id="pfspFinalCheck" class="primary" type="button">Kiểm tra registry</button><button id="pfspFinalIntegrity" type="button">Integrity</button><button id="pfspFinalBackup" type="button">Backup JSON</button><button id="pfspFinalRestore" class="good" type="button">Khôi phục ID</button><button id="pfspFinalRevoke" class="danger" type="button">Thu hồi ID</button></div><div id="pfspFinalResult" class="pfsp-final-result warn"><div class="pfsp-final-verdict">Sẵn sàng</div><div class="pfsp-final-message">Bật QR Verify rồi xuất PDF để auto-register. Sau đó bấm kiểm tra registry.</div></div><textarea id="pfspFinalDump" class="pfsp-final-textarea" readonly placeholder="Backup / API response sẽ hiện ở đây"></textarea>`;
    target.insertAdjacentElement('afterend',div);
    const out=$('pfspFinalResult'), dump=$('pfspFinalDump');
    $('pfspFinalCheck').onclick=async()=>{ out.textContent='Đang kiểm tra...'; const r=await check(); render(out,r); dump.value=JSON.stringify(r,null,2); };
    $('pfspFinalIntegrity').onclick=async()=>{ out.textContent='Đang kiểm tra integrity...'; const r=await integrity(); render(out,r); dump.value=JSON.stringify(r,null,2); };
    $('pfspFinalBackup').onclick=async()=>{ const r=await backup($('pfspFinalSecret').value.trim()); render(out,r); dump.value=JSON.stringify(r.registry||r,null,2); };
    $('pfspFinalRevoke').onclick=async()=>{ const reason=prompt('Lý do thu hồi ID:','Tài liệu không còn hợp lệ')||'Revoked'; const r=await revoke($('pfspFinalSecret').value.trim(),reason); render(out,r); dump.value=JSON.stringify(r,null,2); };
    $('pfspFinalRestore').onclick=async()=>{ const r=await restore($('pfspFinalSecret').value.trim()); render(out,r); dump.value=JSON.stringify(r,null,2); };
    document.addEventListener('pfsp:verify-final-auto-register',ev=>{render(out,ev.detail||{}); dump.value=JSON.stringify(ev.detail||{},null,2);});
  }
  function init(){ enhanceTrustedRegistry(); patchQrShort(); panel(); setTimeout(()=>{enhanceTrustedRegistry(); patchQrShort(); panel();},1200); }
  window.PFSPVerifyFinalBIG={check,integrity,backup,revoke,restore,patchQrShort};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else setTimeout(init,0);
})();
