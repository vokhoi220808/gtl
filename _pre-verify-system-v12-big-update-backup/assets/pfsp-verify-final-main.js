/* PDF Fusion Smart Pro - Verify System v11 app status strip */
(function(){
  'use strict';
  const API = './api/verify';
  const $ = id => document.getElementById(id);
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function cls(payload){const l=payload?.level || (payload?.ok ? 'good' : 'warn');return l==='good'?'good':l==='bad'?'bad':'warn';}
  async function get(params){const r=await fetch(API+'?'+new URLSearchParams(params),{cache:'no-store'});return r.json().catch(()=>({ok:false,verdict:'SERVER_ERROR',level:'bad',message:'Không đọc được Verify API.'}));}
  function render(target,payload){
    const env = payload.env || {};
    const integrity = payload.registryIntegrity || {};
    target.className = 'pfsp-v11-result ' + cls(payload);
    target.innerHTML = `<div class="pfsp-v11-verdict">Verify System v11 · ${html(payload.verdict || 'READY')}</div><div class="pfsp-v11-message">${html(payload.message || 'Sẵn sàng kiểm tra registry.')}</div><div class="pfsp-v11-kv"><b>GitHub</b><code>${env.githubConfigured?'OK':'Chưa cấu hình'}</code><b>Signing</b><code>${env.signingConfigured?'OK':'Thiếu secret'}</code><b>Records</b><code>${integrity.recordCount ?? '-'}</code><b>Integrity</b><code>${integrity.ok===true?'OK':integrity.ok===false?'WARN':'-'}</code></div>`;
  }
  function inject(){
    if($('pfspVerifyV11Status')) return;
    const target = $('pfspTrustedVerifyPanel') || $('qrDocHashPanel') || $('qrVerifyBox') || document.querySelector('main');
    if(!target) return;
    const div = document.createElement('section');
    div.id = 'pfspVerifyV11Status';
    div.className = 'pfsp-final-shell';
    div.innerHTML = `<div class="pfsp-final-head"><div class="pfsp-final-title"><div class="pfsp-final-badge">⚙️</div><div><h3>Deployment Check</h3><p>Kiểm tra nhanh API, signing secret, GitHub registry và integrity trước khi phát hành production.</p></div></div><div class="pfsp-final-actions" style="margin-top:0"><button id="pfspV11Health" class="primary" type="button">Health</button><a href="./verify.html" target="_blank" rel="noopener">Verify Page</a><a href="./admin-verify.html" target="_blank" rel="noopener">Admin</a></div></div><div id="pfspV11HealthBox" class="pfsp-v11-result warn"><div class="pfsp-v11-verdict">Chưa kiểm tra</div><div class="pfsp-v11-message">Bấm Health sau khi deploy Vercel.</div></div>`;
    target.parentNode.insertBefore(div, target.nextSibling);
    const box = $('pfspV11HealthBox');
    $('pfspV11Health').onclick = async()=>{box.textContent='Đang kiểm tra...'; render(box, await get({action:'integrity'}));};
    document.addEventListener('pfsp:auto-register-result', ev=>render(box, ev.detail || {}));
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else setTimeout(inject,50);
})();
