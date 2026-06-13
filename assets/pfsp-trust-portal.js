/* PDF Fusion Smart Pro - Trust Portal v14 */
(function(){
  'use strict';
  const API = './api/verify';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shortHash = value => { const s=String(value||''); return s ? s.slice(0,12).toUpperCase() + '...' + s.slice(-8).toUpperCase() : '-'; };
  const cls = value => {
    const s=String(value||'').toLowerCase();
    if(['active','verified','genuine','good','valid'].includes(s)) return 'good';
    if(['revoked','suspended','expired','blocked','mismatch','invalid','tampered'].includes(s)) return 'bad';
    return 'warn';
  };
  const badge = value => `<span class="pfsp-v11-badge ${cls(value)}">${esc(value || 'unknown')}</span>`;
  function infoRows(record){
    const info={documentInfo:record.documentInfo||{},userInfo:record.userInfo||record.personInfo||{},extraInfo:record.extraInfo||{}};
    const out=[];
    function walk(obj,prefix){ if(!obj||typeof obj!=='object')return; Object.entries(obj).forEach(([k,v])=>{const name=(prefix?prefix+' · ':'')+k; if(Array.isArray(v)){ if(k==='customFields') v.forEach(x=>out.push([x.label||'custom',x.value||''])); else if(v.length) out.push([name,v.map(x=>typeof x==='object'?JSON.stringify(x):x).join(', ')]); } else if(v&&typeof v==='object') walk(v,name); else if(v!==''&&v!=null) out.push([name,v]); }); }
    walk(info,''); return out.filter(x=>String(x[1]||'').trim());
  }
  function infoBox(record){ const rows=infoRows(record); return rows.length?`<div class="pfsp-v14-info"><h3>📄 Document Information</h3><div class="pfsp-v14-info-grid">${rows.map(([k,v])=>`<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div></div>`:''; }
  function setText(id, value){ const el=$(id); if(el) el.textContent = value == null || value === '' ? '-' : String(value); }
  async function api(params, options){
    const method = options?.method || 'GET';
    const body = options?.body;
    const init = { method, cache:'no-store', headers:{} };
    let url = API;
    if(method === 'GET') url += '?' + new URLSearchParams(params || {}).toString();
    else { init.headers['Content-Type']='application/json'; init.body=JSON.stringify(body || params || {}); }
    try{
      const r = await fetch(url, init);
      const data = await r.json().catch(()=>({ok:false, verdict:'BAD_JSON', level:'bad', message:'API không trả JSON hợp lệ.'}));
      return data;
    }catch(err){
      return {ok:false, verdict:'NETWORK_ERROR', level:'bad', message:err.message || String(err)};
    }
  }
  function renderResult(boxId, payload){
    const box=$(boxId); if(!box) return;
    box.className='pfsp-v11-result ' + cls(payload.level || payload.trustLevel || payload.verdict);
    const checks = payload.checks || payload.trust?.checks || [];
    box.innerHTML = `<div class="pfsp-v11-verdict">${esc(payload.verdict || 'RESULT')}</div><div class="pfsp-v11-message">${esc(payload.message || '')}</div>` +
      (typeof payload.trustScore !== 'undefined' ? `<div class="pfsp-v14-score-line"><b>${esc(payload.trustScore)}</b><span>/100 · ${esc(payload.trustLevel || 'unknown')}</span></div>` : '') +
      (checks.length ? `<div class="pfsp-v12-checks">${checks.map(x=>`<div class="pfsp-v12-check ${x.ok?'good':'bad'}"><span>${x.ok?'✅':'⚠️'}</span><div><b>${esc(x.name)}</b><div class="pfsp-v11-small">${esc(x.message||'')}</div></div></div>`).join('')}</div>` : '');
  }
  function renderSummary(payload){
    const s=payload.summary || {};
    setText('sumTotal', s.total ?? payload.registryIntegrity?.recordCount ?? '-');
    setText('sumActive', s.active ?? payload.registryIntegrity?.activeCount ?? '-');
    setText('sumRevoked', s.revoked ?? payload.registryIntegrity?.revokedCount ?? '-');
    setText('sumSuspended', s.suspended ?? payload.registryIntegrity?.suspendedCount ?? '-');
    setText('sumIntegrity', payload.registryIntegrity?.ok === true ? 'OK' : payload.registryIntegrity?.ok === false ? 'WARN' : '-');
    setText('sumUpdated', payload.updatedAt || '-');
    const recent=$('recentRecords');
    if(recent){
      const rows=(payload.recent || []).map(recordRow).join('');
      recent.innerHTML=rows || '<tr><td colspan="6">Chưa có record public.</td></tr>';
    }
    renderResult('portalStatus', payload);
  }
  function recordRow(r){
    return `<tr><td><code>${esc(r.id)}</code><div class="pfsp-v11-small">${esc(r.documentTitle || r.fileName || '')}</div></td><td><code>${esc(r.shortSha256 || shortHash(r.sha256))}</code></td><td>${badge(r.status)}<div class="pfsp-v11-small">Trust ${esc(r.trustScore ?? '-')} · ${esc(r.signature || '')}</div></td><td>${esc(r.owner || '-')}<div class="pfsp-v11-small">${esc(r.project || '')}</div></td><td>${esc(r.registeredAt || '-')}</td><td><div class="pfsp-v11-actions" style="margin-top:0"><a class="pfsp-v11-btn" href="${esc(r.verifyUrl)}">Verify</a><a class="pfsp-v11-btn" href="${esc(r.certificateUrl)}">Cert</a><button class="pfsp-v11-btn" data-badge-id="${esc(r.id)}" type="button">Badge</button></div></td></tr>`;
  }
  function renderSearch(payload){
    renderResult('searchStatus', payload);
    const rows=$('searchRows'); if(!rows) return;
    rows.innerHTML=(payload.records || []).map(recordRow).join('') || '<tr><td colspan="6">Không có kết quả.</td></tr>';
  }
  async function loadPortal(){ renderSummary(await api({action:'portal'})); }
  async function search(){
    const payload=await api({action:'public-search', query:$('portalQuery')?.value || '', status:$('portalStatusFilter')?.value || '', limit:80});
    renderSearch(payload);
  }
  function normalizeHash(value){return String(value||'').toLowerCase().replace(/[^a-f0-9]/g,'').slice(0,64);}
  async function sha256File(file){
    const buf=await file.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function verifyManual(){
    const id=$('verifyId')?.value.trim() || '';
    let sha=normalizeHash($('verifyHash')?.value);
    const file=$('verifyFile')?.files?.[0];
    let size=$('verifySize')?.value.trim() || '';
    if(file){ sha=await sha256File(file); size=String(file.size); if($('verifyHash')) $('verifyHash').value=sha; if($('verifySize')) $('verifySize').value=size; }
    const payload=await api({action:'verify', id, sha256:sha, size}, {method:'POST'});
    renderResult('verifyStatus', payload);
    renderCertificateSummary(payload);
  }
  function renderCertificateSummary(payload){
    const box=$('certificatePreview'); if(!box) return;
    const r=payload.record || {};
    if(!r.id){ box.innerHTML='<div class="pfsp-v11-small">Chưa có certificate.</div>'; return; }
    box.innerHTML=`<div class="pfsp-v11-kv"><b>ID</b><code>${esc(r.id)}</code><b>SHA-256</b><code>${esc(r.sha256)}</code><b>Status</b><span>${badge(r.status)}</span><b>Trust</b><span>${esc(payload.trustScore ?? '-')} / 100 · ${esc(payload.trustLevel || '')}</span><b>File</b><span>${esc(r.fileName || '')}</span><b>Owner</b><span>${esc(r.owner || '-')}</span><b>Project</b><span>${esc(r.project || '-')}</span></div>${infoBox(r)}<div class="pfsp-v11-actions"><button id="downloadCertInline" class="pfsp-v11-btn good" type="button">Tải certificate JSON</button><a class="pfsp-v11-btn" href="./verify-certificate.html?id=${encodeURIComponent(r.id)}">Mở bản in</a></div>`;
    const btn=$('downloadCertInline'); if(btn) btn.onclick=()=>downloadJson(`${r.id}.trust-certificate.json`, payload.certificate || payload);
  }
  async function loadCertificate(){
    const id=$('certId')?.value.trim() || $('verifyId')?.value.trim() || '';
    const payload=await api({action:'printable-certificate', id});
    renderResult('certStatus', payload);
    renderCertificateSummary(payload);
  }
  async function makeBadge(id){
    const target=id || $('badgeId')?.value.trim() || $('verifyId')?.value.trim() || '';
    const payload=await api({action:'badge', id:target});
    renderResult('badgeStatus', payload);
    if($('badgePreview')) $('badgePreview').innerHTML = payload.badgeHtml || '<span class="pfsp-v11-small">Không tạo được badge.</span>';
    if($('badgeCode')) $('badgeCode').value = payload.badgeHtml || '';
  }
  function parseLine(line){
    const raw=String(line||'').trim(); if(!raw) return null;
    try{ const parsed=JSON.parse(raw); return parsed.certificate || parsed.record || parsed; }catch{}
    if(/^https?:/i.test(raw) || raw.includes('?')){
      try{ const u=new URL(raw, location.href); return {id:u.searchParams.get('id')||'', sha256:u.searchParams.get('sha256')||u.searchParams.get('hash')||'', size:u.searchParams.get('size')||''}; }catch{}
    }
    const parts=raw.split(/[|,;\t ]+/).filter(Boolean);
    return {id:parts.find(x=>/^PFSP-/i.test(x)) || parts[0] || '', sha256:parts.find(x=>/^[a-f0-9]{64}$/i.test(x)) || '', size:parts.find(x=>/^\d{2,}$/.test(x)) || ''};
  }
  async function batchVerify(){
    const items=String($('batchInput')?.value || '').split(/\n+/).map(parseLine).filter(Boolean);
    const payload=await api({action:'batch-verify', items}, {method:'POST'});
    renderResult('batchStatus', payload);
    const rows=$('batchRows'); if(rows) rows.innerHTML=(payload.results || []).map((r,i)=>`<tr><td>${i+1}</td><td><code>${esc(r.id || r.record?.id || '-')}</code></td><td>${badge(r.verdict)}</td><td>${esc(r.trustScore ?? '-')}</td><td>${esc(r.message || '')}</td></tr>`).join('') || '<tr><td colspan="5">Chưa có kết quả.</td></tr>';
  }
  function downloadJson(name, data){
    const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function wire(){
    $('portalSearchBtn')?.addEventListener('click', search);
    $('portalQuery')?.addEventListener('keydown', e=>{ if(e.key==='Enter') search(); });
    $('refreshPortalBtn')?.addEventListener('click', loadPortal);
    $('verifyBtn')?.addEventListener('click', verifyManual);
    $('certBtn')?.addEventListener('click', loadCertificate);
    $('badgeBtn')?.addEventListener('click', ()=>makeBadge());
    $('batchBtn')?.addEventListener('click', batchVerify);
    document.addEventListener('click', e=>{ const id=e.target?.getAttribute?.('data-badge-id'); if(id){ if($('badgeId')) $('badgeId').value=id; makeBadge(id); document.getElementById('badgeBox')?.scrollIntoView({behavior:'smooth',block:'start'}); } });
    loadPortal();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
