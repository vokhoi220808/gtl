(() => {
  'use strict';
  const VERSION = '6.0.0-advanced-suite';
  const $ = id => document.getElementById(id);
  const ready = fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();
  const fmtBytes = n => { if(!Number.isFinite(n)) return '-'; const u=['B','KB','MB','GB']; let i=0,x=n; while(x>=1024&&i<u.length-1){x/=1024;i++;} return `${x.toFixed(x>=10||i===0?0:1)} ${u[i]}`; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const toast = msg => { let el=document.querySelector('.pfsp-toast'); if(!el){ el=document.createElement('div'); el.className='pfsp-toast'; document.body.appendChild(el);} el.textContent=msg; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),3300); };
  const appEntries = () => { try { return Array.isArray(entries) ? entries : []; } catch { return []; } };
  const cleanName = name => { try { return typeof clean === 'function' ? clean(name) : String(name||'file').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\-_]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'file'; } catch { return 'file'; } };
  const bytesOf = e => { try { return typeof copyBytes === 'function' ? copyBytes(e) : e.bytes.slice(); } catch { return e.bytes.slice(); } };
  const getPdfEntries = () => appEntries().filter(e => e && e.type === 'pdf' && !e.error && e.bytes);
  function record(type, detail){ try { window.pfspAnalytics?.record(type, detail || {}); } catch {} }
  function setProgress(n,msg){ const bar=$('pfspWorkerBar'); if(bar) bar.style.width=Math.max(0,Math.min(100,n||0))+'%'; const pct=$('pfspWorkerPct'); if(pct) pct.textContent=Math.round(n||0)+'%'; if(msg) appendLog(msg); try { if(typeof progress==='function') progress(n); } catch {} }
  function appendLog(msg){ const log=$('pfspWorkerLog'); if(log){ log.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + log.textContent; } try { if(typeof log === 'function') log(msg); } catch {} }
  function saveBlob(data,name,type='application/pdf'){
    const blob = data instanceof Blob ? data : new Blob([data],{type});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},1200);
    record('export',{label:name});
  }
  function activateTab(name){ const p=$('tab-'+name), b=document.querySelector(`.tab[data-tab="${name}"]`); if(!p||!b) return; document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b)); document.querySelectorAll('.panel').forEach(x=>x.classList.remove('show')); p.classList.add('show'); try{ currentTab=name; autosave?.(); }catch{} if(name==='preview') refreshPreviewSelect(); if(name==='worker') refreshBatchList(); }
  function addTab(name, label, beforeName){
    const tabs=document.querySelector('.tabs'); if(!tabs || $('tab-'+name)) return;
    const btn=document.createElement('button'); btn.className='tab'; btn.dataset.tab=name; btn.textContent=label; btn.addEventListener('click',()=>activateTab(name));
    const before = beforeName ? document.querySelector(`.tab[data-tab="${beforeName}"]`) : null;
    tabs.insertBefore(btn, before || null);
    return btn;
  }
  function parseRange(str,total){ if(!str||!String(str).trim()) return [...Array(total).keys()]; const set=new Set(); String(str).split(',').map(x=>x.trim()).filter(Boolean).forEach(p=>{ const m=p.match(/^(\d+)(?:-(\d+))?$/); if(!m)return; let a=+m[1], b=+(m[2]||m[1]); if(a>b)[a,b]=[b,a]; for(let i=Math.max(1,a);i<=Math.min(total,b);i++) set.add(i-1); }); return [...set].sort((a,b)=>a-b); }

  // Worker client
  class WorkerClient{
    constructor(){ this.worker = null; this.pending = new Map(); }
    available(){ return !!window.Worker; }
    get(){ if(!this.worker){ this.worker = new Worker('./assets/pfsp-worker.js'); this.worker.onmessage = e => this.onMessage(e.data || {}); } return this.worker; }
    onMessage(msg){ const item=this.pending.get(msg.id); if(!item) return; if(msg.type==='progress'){ item.onProgress?.(msg.progress||0, msg.message||''); return; } if(msg.type==='done'){ this.pending.delete(msg.id); item.resolve(msg.result); return; } if(msg.type==='error'){ this.pending.delete(msg.id); item.reject(new Error(msg.message||'Worker error')); } }
    run(task,payload,onProgress){ const id='w'+Date.now().toString(36)+Math.random().toString(36).slice(2); return new Promise((resolve,reject)=>{ this.pending.set(id,{resolve,reject,onProgress}); this.get().postMessage({id, task, payload}); }); }
  }
  const worker = new WorkerClient();
  window.pfspWorkerClient = worker;

  // JSZip helper
  async function makeZip(files, zipName){
    if(!window.JSZip) throw new Error('JSZip chưa tải được từ CDN.');
    const zip = new JSZip();
    files.forEach(f => zip.file(f.name, f.bytes));
    setProgress(96,'Đang tạo file ZIP...');
    const blob = await zip.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:6}}, m => setProgress(96 + (m.percent||0)*0.04, 'ZIP: '+Math.round(m.percent||0)+'%'));
    saveBlob(blob, zipName, 'application/zip');
    setProgress(100, 'Đã tạo '+zipName);
  }

  // Preview Editor
  let previewState = {entryId:'', pages:[], rendering:false};
  function addPreviewPanel(){
    addTab('preview','🧩 Preview Editor','ocr');
    const card=document.querySelector('.card .tabs')?.parentNode; if(!card || $('tab-preview')) return;
    const panel=document.createElement('div'); panel.id='tab-preview'; panel.className='panel';
    panel.innerHTML = `
      <div class="section pfsp-advanced-shell">
        <h3>🧩 PDF Preview Editor <span class="tag">MỚI</span></h3>
        <div class="pfsp-preview-toolbar">
          <div class="pfsp-panel-grid three">
            <label class="pfsp-field"><span>Chọn PDF</span><select id="pfspPreviewFile"></select></label>
            <label class="pfsp-field"><span>Scale thumbnail</span><input id="pfspPreviewScale" type="number" min="0.18" max="0.7" step="0.02" value="0.32"></label>
            <label class="pfsp-field"><span>Trang xuất</span><input id="pfspPreviewRange" placeholder="VD: 1-5,8 hoặc để trống"></label>
          </div>
          <div class="toolbar">
            <button class="btn good" id="pfspRenderPreview" type="button">👁 Tạo preview</button>
            <button class="btn" id="pfspSelectAllPages" type="button">✅ Chọn tất cả</button>
            <button class="btn" id="pfspUnselectPages" type="button">☐ Bỏ chọn</button>
            <button class="btn warn" id="pfspResetPages" type="button">↺ Reset</button>
            <button class="btn accent" id="pfspExportPreviewPdf" type="button">⬇ Xuất PDF theo preview</button>
          </div>
          <div class="hint">Kéo thả thumbnail để đổi thứ tự. Bạn có thể xoay, xóa, chọn/bỏ chọn từng trang rồi xuất thành PDF mới.</div>
        </div>
        <div id="pfspPreviewStats" class="pfsp-status-grid">
          <div class="pfsp-status-tile"><b>0</b><span>Tổng trang</span></div><div class="pfsp-status-tile"><b>0</b><span>Đã chọn</span></div><div class="pfsp-status-tile"><b>0</b><span>Đã xóa</span></div><div class="pfsp-status-tile"><b>-</b><span>File</span></div>
        </div>
        <div id="pfspPreviewGrid" class="pfsp-preview-grid"><div class="pfsp-empty">Chọn PDF rồi bấm “Tạo preview”.</div></div>
      </div>`;
    card.insertBefore(panel, $('tab-ocr') || $('tab-batch') || $('tab-tools'));
    $('pfspRenderPreview')?.addEventListener('click', renderPreview);
    $('pfspPreviewFile')?.addEventListener('change', () => { previewState.pages=[]; refreshPreviewStats(); $('pfspPreviewGrid').innerHTML='<div class="pfsp-empty">Bấm “Tạo preview” để xem trang PDF.</div>'; });
    $('pfspSelectAllPages')?.addEventListener('click',()=>{ previewState.pages.forEach(p=>{p.selected=true;p.deleted=false;}); drawPreviewCards(false); });
    $('pfspUnselectPages')?.addEventListener('click',()=>{ previewState.pages.forEach(p=>p.selected=false); drawPreviewCards(false); });
    $('pfspResetPages')?.addEventListener('click',()=>{ previewState.pages.forEach((p,i)=>Object.assign(p,{order:i,rotation:0,deleted:false,selected:true})); drawPreviewCards(false); });
    $('pfspExportPreviewPdf')?.addEventListener('click', exportPreviewPdf);
    refreshPreviewSelect();
  }
  function refreshPreviewSelect(){ const sel=$('pfspPreviewFile'); if(!sel) return; const old=sel.value; const pdfs=getPdfEntries(); sel.innerHTML=pdfs.map(e=>`<option value="${esc(e.id)}">${esc(e.file.name)} (${e.pages||'?'} trang)</option>`).join(''); if(pdfs.some(e=>e.id===old)) sel.value=old; }
  function refreshPreviewStats(){ const total=previewState.pages.length; const selected=previewState.pages.filter(p=>p.selected&&!p.deleted).length; const deleted=previewState.pages.filter(p=>p.deleted).length; const entry=getPdfEntries().find(e=>e.id===($('pfspPreviewFile')?.value||previewState.entryId)); const stats=$('pfspPreviewStats'); if(stats) stats.innerHTML=`<div class="pfsp-status-tile"><b>${total}</b><span>Tổng trang</span></div><div class="pfsp-status-tile"><b>${selected}</b><span>Đã chọn</span></div><div class="pfsp-status-tile"><b>${deleted}</b><span>Đã xóa</span></div><div class="pfsp-status-tile"><b>${entry?fmtBytes(entry.file.size):'-'}</b><span>File</span></div>`; }
  async function renderPreview(){
    const entry=getPdfEntries().find(e=>e.id===$('pfspPreviewFile')?.value); if(!entry){ toast('Chưa có PDF để preview.'); return; }
    if(!window.pdfjsLib){ toast('PDF.js chưa tải được.'); return; }
    const grid=$('pfspPreviewGrid'); grid.innerHTML='<div class="pfsp-empty">Đang render thumbnail...</div>'; previewState={entryId:entry.id,pages:[],rendering:true}; record('tool',{label:'preview render'});
    try{
      const scale=Math.max(.18, Math.min(.7, +($('pfspPreviewScale')?.value||.32)));
      const doc=await pdfjsLib.getDocument({data:bytesOf(entry)}).promise;
      const wanted=new Set(parseRange($('pfspPreviewRange')?.value||'', doc.numPages));
      grid.innerHTML='';
      for(let i=1;i<=doc.numPages;i++){
        if(!wanted.has(i-1)) continue;
        const page=await doc.getPage(i); const viewport=page.getViewport({scale}); const canvas=document.createElement('canvas'); canvas.width=viewport.width; canvas.height=viewport.height; const ctx=canvas.getContext('2d',{alpha:false}); await page.render({canvasContext:ctx, viewport}).promise;
        previewState.pages.push({src:i-1, order:previewState.pages.length, rotation:0, deleted:false, selected:true, dataUrl:canvas.toDataURL('image/jpeg', .78)});
        setProgress(Math.round(i/doc.numPages*70), `Preview page ${i}/${doc.numPages}`);
      }
      previewState.rendering=false; drawPreviewCards(true); setProgress(100,'Preview đã sẵn sàng.');
    }catch(err){ grid.innerHTML='<div class="pfsp-empty">Không render được preview: '+esc(err.message||err)+'</div>'; record('error',{label:'preview '+(err.message||err)}); }
  }
  function drawPreviewCards(enableSortable){
    const grid=$('pfspPreviewGrid'); if(!grid) return; refreshPreviewStats();
    if(!previewState.pages.length){ grid.innerHTML='<div class="pfsp-empty">Chưa có trang preview.</div>'; return; }
    grid.innerHTML=previewState.pages.map((p,idx)=>`<div class="pfsp-page-card ${p.deleted?'deleted':''} ${p.selected&&!p.deleted?'selected':''}" data-idx="${idx}">
      <img class="pfsp-page-thumb" src="${p.dataUrl}" alt="Page ${p.src+1}">
      <div class="pfsp-page-meta"><span class="pfsp-drag-handle">☰ Trang ${p.src+1}</span><span>${p.rotation}°</span></div>
      <div class="pfsp-page-controls">
        <button class="btn" type="button" data-act="rotl">↺ Xoay trái</button><button class="btn" type="button" data-act="rotr">↻ Xoay phải</button>
        <button class="btn ${p.selected?'good':''}" type="button" data-act="sel">${p.selected?'✅ Chọn':'☐ Chọn'}</button><button class="btn danger" type="button" data-act="del">${p.deleted?'Khôi phục':'Xóa'}</button>
      </div>
    </div>`).join('');
    grid.querySelectorAll('.pfsp-page-card').forEach(card => card.addEventListener('click', e => { const b=e.target.closest('button[data-act]'); if(!b) return; const i=+card.dataset.idx; const p=previewState.pages[i]; const act=b.dataset.act; if(act==='rotl') p.rotation=(p.rotation+270)%360; if(act==='rotr') p.rotation=(p.rotation+90)%360; if(act==='sel') p.selected=!p.selected; if(act==='del') p.deleted=!p.deleted; drawPreviewCards(false); }));
    if(enableSortable && window.Sortable){ new Sortable(grid,{animation:150,handle:'.pfsp-drag-handle',onEnd:()=>{ const order=[...grid.querySelectorAll('.pfsp-page-card')].map(c=>previewState.pages[+c.dataset.idx]); previewState.pages=order; drawPreviewCards(false); }}); }
  }
  async function exportPreviewPdf(){
    const entry=getPdfEntries().find(e=>e.id===previewState.entryId); if(!entry || !previewState.pages.length){ toast('Chưa có preview để xuất.'); return; }
    const selected=previewState.pages.filter(p=>p.selected&&!p.deleted); if(!selected.length){ toast('Bạn chưa chọn trang nào.'); return; }
    try{
      const src=await PDFDocument.load(bytesOf(entry),{ignoreEncryption:true}); const out=await PDFDocument.create();
      for(let i=0;i<selected.length;i++){ const item=selected[i]; const [pg]=await out.copyPages(src,[item.src]); if(item.rotation) pg.setRotation(degrees(item.rotation)); out.addPage(pg); setProgress(Math.round((i+1)/selected.length*90),`Export preview ${i+1}/${selected.length}`); }
      const bytes=await out.save({useObjectStreams:true, addDefaultPage:false, objectsPerTick:24}); saveBlob(bytes, cleanName(entry.file.name.replace(/\.pdf$/i,''))+'-preview-edit.pdf'); setProgress(100,'Đã xuất PDF theo preview.');
    }catch(err){ toast('Lỗi xuất preview: '+(err.message||err)); record('error',{label:'preview export '+(err.message||err)}); }
  }

  // Worker + ZIP panel
  function addWorkerPanel(){
    addTab('worker','🧵 Worker + ZIP','tools');
    const card=document.querySelector('.card .tabs')?.parentNode; if(!card || $('tab-worker')) return;
    const panel=document.createElement('div'); panel.id='tab-worker'; panel.className='panel';
    panel.innerHTML = `
      <div class="section pfsp-advanced-shell">
        <h3>🧵 Web Worker + Batch ZIP Export <span class="tag">MỚI</span></h3>
        <div class="pfsp-panel-grid three">
          <label class="pfsp-field"><span>Chế độ xử lý</span><select id="pfspBatchMode"><option value="compress">Nén nhiều PDF → ZIP</option><option value="watermark">Watermark nhiều PDF → ZIP</option><option value="split">Tách PDF → ZIP từng trang</option><option value="merge">Merge PDF bằng Worker</option></select></label>
          <label class="pfsp-field"><span>Tên file xuất</span><input id="pfspBatchName" value="pdf-fusion-batch"></label>
          <label class="pfsp-field"><span>Trang áp dụng</span><input id="pfspBatchPages" placeholder="VD: 1-3,5 hoặc để trống"></label>
        </div>
        <div class="pfsp-panel-grid three">
          <label class="pfsp-field"><span>Watermark text</span><input id="pfspBatchWatermark" value="CONFIDENTIAL"></label>
          <label class="pfsp-field"><span>Opacity</span><input id="pfspBatchOpacity" type="number" min="0" max="1" step="0.01" value="0.18"></label>
          <label class="pfsp-field"><span>Cỡ chữ</span><input id="pfspBatchFontSize" type="number" min="8" max="160" value="42"></label>
        </div>
        <div class="toolbar">
          <button class="btn good" id="pfspBatchRefresh" type="button">↻ Làm mới danh sách</button>
          <button class="btn" id="pfspBatchSelectAll" type="button">✅ Chọn tất cả PDF</button>
          <button class="btn warn" id="pfspBatchClear" type="button">☐ Bỏ chọn</button>
          <button class="btn accent" id="pfspBatchRun" type="button">▶ Chạy batch</button>
        </div>
        <div class="pfsp-status-grid" id="pfspWorkerStatus"><div class="pfsp-status-tile"><b>${worker.available()?'OK':'NO'}</b><span>Web Worker</span></div><div class="pfsp-status-tile"><b>${window.JSZip?'OK':'CDN'}</b><span>JSZip</span></div><div class="pfsp-status-tile"><b>0</b><span>PDF chọn</span></div><div class="pfsp-status-tile"><b>-</b><span>Thiết bị</span></div></div>
        <div class="pfsp-progress-stack"><div class="pfsp-progress-title"><span id="pfspWorkerLabel">Sẵn sàng.</span><span id="pfspWorkerPct">0%</span></div><div class="pfsp-progress-rail"><div id="pfspWorkerBar" class="pfsp-progress-fill"></div></div><div id="pfspWorkerLog" class="pfsp-progress-log"></div></div>
        <div class="pfsp-batch-list" id="pfspBatchList"></div>
        <div class="hint">Worker giúp tác vụ nặng chạy tách khỏi giao diện. OCR trong app vốn đã dùng worker của Tesseract; tab này tập trung batch merge/split/compress/watermark và xuất ZIP.</div>
      </div>
      <div class="section">
        <h3>📊 Analytics cục bộ</h3>
        <div class="pfsp-analytics-mini" id="pfspAnalyticsMini"><div><b>0</b><span>Click</span></div><div><b>0</b><span>Lỗi</span></div><div><b>-</b><span>Thiết bị</span></div></div>
        <div class="toolbar"><a class="btn" href="./privacy-center.html">🔐 Mở Privacy Center</a><button class="btn danger" id="pfspClearAnalytics" type="button">Xóa analytics local</button></div>
      </div>`;
    card.insertBefore(panel, $('tab-tools'));
    $('pfspBatchRefresh')?.addEventListener('click', refreshBatchList);
    $('pfspBatchSelectAll')?.addEventListener('click',()=>{ document.querySelectorAll('#pfspBatchList input[type=checkbox]').forEach(x=>x.checked=true); refreshWorkerStatus(); });
    $('pfspBatchClear')?.addEventListener('click',()=>{ document.querySelectorAll('#pfspBatchList input[type=checkbox]').forEach(x=>x.checked=false); refreshWorkerStatus(); });
    $('pfspBatchRun')?.addEventListener('click', runBatch);
    $('pfspClearAnalytics')?.addEventListener('click',()=>{ localStorage.removeItem('pfspLocalAnalytics'); toast('Đã xóa analytics cục bộ.'); refreshAnalyticsMini(); });
    $('pfspBatchList')?.addEventListener('change', refreshWorkerStatus);
    window.addEventListener('pfsp:analytics', refreshAnalyticsMini);
    refreshBatchList(); refreshAnalyticsMini();
  }
  function refreshBatchList(){ const list=$('pfspBatchList'); if(!list) return; const pdfs=getPdfEntries(); if(!pdfs.length){ list.innerHTML='<div class="pfsp-empty">Chưa có PDF. Hãy chọn file ở khung bên trái.</div>'; refreshWorkerStatus(); return; } list.innerHTML=pdfs.map(e=>`<label class="pfsp-batch-row"><input type="checkbox" checked value="${esc(e.id)}"><span><b>${esc(e.file.name)}</b><br><small>${e.pages||'?'} trang · ${fmtBytes(e.file.size||e.bytes.length)}</small></span><span class="pfsp-device-pill">PDF</span></label>`).join(''); refreshWorkerStatus(); }
  function selectedBatchEntries(){ const ids=[...document.querySelectorAll('#pfspBatchList input[type=checkbox]:checked')].map(x=>x.value); return getPdfEntries().filter(e=>ids.includes(e.id)); }
  function refreshWorkerStatus(){ const data=window.pfspAnalytics?.read?.()||{}; const selected=selectedBatchEntries().length; const el=$('pfspWorkerStatus'); if(el) el.innerHTML=`<div class="pfsp-status-tile"><b>${worker.available()?'OK':'NO'}</b><span>Web Worker</span></div><div class="pfsp-status-tile"><b>${window.JSZip?'OK':'CDN'}</b><span>JSZip</span></div><div class="pfsp-status-tile"><b>${selected}</b><span>PDF chọn</span></div><div class="pfsp-status-tile"><b>${data.device||window.pfspAnalytics?.device?.()||'-'}</b><span>Thiết bị</span></div>`; }
  function refreshAnalyticsMini(){ const d=window.pfspAnalytics?.read?.()||{}; const c=d.counts||{}; const el=$('pfspAnalyticsMini'); if(el) el.innerHTML=`<div><b>${c.clicks||0}</b><span>Click</span></div><div><b>${c.errors||0}</b><span>Lỗi</span></div><div><b>${d.device||'-'}</b><span>Thiết bị</span></div>`; refreshWorkerStatus(); }
  async function runBatch(){
    const mode=$('pfspBatchMode')?.value||'compress'; const chosen=selectedBatchEntries(); if(!chosen.length){ toast('Chưa chọn PDF nào để batch.'); return; }
    const files=chosen.map(e=>({id:e.id,name:e.file.name,bytes:bytesOf(e),pages:e.pages||1,range:e.range||'',rotate:e.rotate||0}));
    const base=cleanName($('pfspBatchName')?.value||'pdf-fusion-batch'); const pages=$('pfspBatchPages')?.value||'';
    try{
      setProgress(1,'Chuẩn bị batch '+mode+'...'); record('tool',{label:'batch '+mode});
      if(!worker.available()) throw new Error('Trình duyệt không hỗ trợ Web Worker.');
      let result;
      if(mode==='compress'){
        result = await worker.run('compressMany',{files, options:{pages}}, setProgress);
        await makeZip(result.files, base+'-compressed.zip');
      } else if(mode==='watermark'){
        result = await worker.run('watermarkMany',{files, options:{text:$('pfspBatchWatermark')?.value||'CONFIDENTIAL', opacity:+($('pfspBatchOpacity')?.value||.18), size:+($('pfspBatchFontSize')?.value||42)}}, setProgress);
        await makeZip(result.files, base+'-watermarked.zip');
      } else if(mode==='split'){
        if(files.length>1) appendLog('Split ZIP sẽ dùng file PDF đầu tiên trong danh sách đã chọn.');
        result = await worker.run('splitOne',{file:files[0], options:{pages}}, setProgress);
        await makeZip(result.files, base+'-split-pages.zip');
      } else if(mode==='merge'){
        result = await worker.run('merge',{files, name:base, options:{pageNo:true}}, setProgress);
        saveBlob(result.file.bytes, base+'-worker-merged.pdf'); setProgress(100,'Đã merge bằng worker.');
      }
    }catch(err){ toast('Batch lỗi: '+(err.message||err)); appendLog('ERROR: '+(err.message||err)); record('error',{label:'batch '+mode+' '+(err.message||err)}); }
  }

  function addAdvancedCommandCards(){
    const tools=$('tab-tools'); if(!tools || $('pfspAdvancedQuickCards')) return;
    const box=document.createElement('div'); box.id='pfspAdvancedQuickCards'; box.className='section';
    box.innerHTML=`<h3>⚡ Lối tắt nâng cấp v6</h3><div class="pfsp-panel-grid three"><div class="pfsp-adv-card"><h4>Preview Editor</h4><p>Xem thumbnail, kéo đổi thứ tự, xóa/xoay/chọn trang rồi xuất PDF.</p><button class="btn good" type="button" data-go-tab="preview">Mở Preview</button></div><div class="pfsp-adv-card"><h4>Worker + ZIP</h4><p>Nén 10 PDF, watermark 20 PDF, tách trang thành ZIP mà giao diện vẫn mượt.</p><button class="btn good" type="button" data-go-tab="worker">Mở Batch ZIP</button></div><div class="pfsp-adv-card"><h4>Privacy Center</h4><p>Hiển thị analytics cục bộ, lỗi, thiết bị và cam kết không upload file.</p><a class="btn" href="./privacy-center.html">Mở Privacy Center</a></div></div>`;
    tools.prepend(box); box.addEventListener('click', e=>{ const b=e.target.closest('[data-go-tab]'); if(b) activateTab(b.dataset.goTab); });
  }
  function refreshSelectorsOften(){ refreshPreviewSelect(); refreshBatchList(); }
  ready(()=>{
    document.body.classList.add('pfsp-advanced-v6');
    addPreviewPanel(); addWorkerPanel(); addAdvancedCommandCards();
    try { if (typeof window.pfspSetLanguage === 'function') window.pfspSetLanguage(localStorage.getItem('pfspLang') || 'vi'); } catch {}
    const observer = new MutationObserver(() => { clearTimeout(observer._t); observer._t=setTimeout(()=>{ refreshPreviewSelect(); refreshBatchList(); }, 200); });
    const fl=$('fileList'); if(fl) observer.observe(fl,{childList:true,subtree:true});
    setTimeout(refreshSelectorsOften, 900);
    appendLog('Advanced Suite v6 loaded.');
  });
})();
