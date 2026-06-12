(() => {
  'use strict';
  const VERSION = '5.0.0-ui-seo-compress';
  const $id = (id) => document.getElementById(id);
  const ready = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();
  const fmtBytes = (n) => {
    if (!Number.isFinite(n)) return '0 B';
    const units = ['B','KB','MB','GB']; let i = 0; let x = n;
    while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
    return `${x.toFixed(x >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };
  const toast = (msg) => {
    let el = document.querySelector('.pfsp-toast');
    if (!el) { el = document.createElement('div'); el.className = 'pfsp-toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3200);
  };
  const safeStatus = (msg) => { try { if (typeof status === 'function') status(msg); else toast(msg); } catch { toast(msg); } };
  const safeProgress = (n) => { try { if (typeof progress === 'function') progress(n); } catch {} };
  const safeLog = (msg) => { try { if (typeof log === 'function') log(msg); else console.info('[PFSP]', msg); } catch { console.info('[PFSP]', msg); } };
  const appEntries = () => { try { return Array.isArray(entries) ? entries : []; } catch { return []; } };
  const appClean = (name) => { try { return typeof clean === 'function' ? clean(name) : String(name || 'file').replace(/[^a-z0-9\-_]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'file'; } catch { return 'file'; } };
  const appCopyBytes = (entry) => { try { return typeof copyBytes === 'function' ? copyBytes(entry) : entry.bytes.slice(); } catch { return entry.bytes.slice(); } };
  const saveExtra = (data, name, type) => { try { if (typeof extra === 'function') extra(data, name, type); else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], {type})); a.download = name; a.click(); } } catch (err) { safeLog('Không tạo được link tải: ' + (err?.message || err)); } };
  function parsePages(str, total) {
    if (!str || !String(str).trim()) return [...Array(total).keys()];
    const out = new Set();
    String(str).split(',').map(x => x.trim()).filter(Boolean).forEach(part => {
      const m = part.match(/^(\d+)(?:-(\d+))?$/); if (!m) return;
      let a = +m[1], b = +(m[2] || m[1]); if (a > b) [a,b] = [b,a];
      for (let i = Math.max(1,a); i <= Math.min(total,b); i++) out.add(i - 1);
    });
    return [...out].sort((a,b) => a - b);
  }
  function getPreset() {
    const preset = $id('compressPreset')?.value || 'medium';
    const map = {
      low: {scale:.9, quality:.52, label:'Nén mạnh'},
      medium: {scale:1.2, quality:.68, label:'Cân bằng'},
      high: {scale:1.55, quality:.82, label:'Chất lượng cao'},
      custom: {scale: Math.max(.45, Math.min(2.4, +($id('compressScale')?.value || 1.2))), quality: Math.max(.25, Math.min(.92, +($id('compressQuality')?.value || .68))), label:'Tùy chỉnh'}
    };
    return map[preset] || map.medium;
  }
  function addHeroUi() {
    document.body.classList.add('pfsp-pro-v5');
    const hero = document.querySelector('.hero');
    if (!hero || $id('pfspHeroActions')) return;
    const actions = document.createElement('div');
    actions.id = 'pfspHeroActions'; actions.className = 'pfsp-hero-actions';
    actions.innerHTML = `
      <button class="btn good" type="button" data-pfsp-tab="compress">🗜 Nén PDF ngay</button>
      <button class="btn" type="button" data-pfsp-tab="export">✨ Gộp & xuất PDF</button>
      <button class="btn" type="button" data-pfsp-tab="split">✂️ Tách PDF</button>`;
    hero.appendChild(actions);
    const strip = document.createElement('div'); strip.className = 'pfsp-trust-strip';
    strip.innerHTML = `
      <div class="pfsp-trust-card"><b>100% trên trình duyệt</b><span>PDF được xử lý cục bộ trên thiết bị, không cần backend.</span></div>
      <div class="pfsp-trust-card"><b>Compress PDF mới</b><span>Nén cấu trúc hoặc rasterize ảnh để giảm dung lượng.</span></div>
      <div class="pfsp-trust-card"><b>SEO landing pages</b><span>Thêm trang công cụ riêng cho Google index tốt hơn.</span></div>
      <div class="pfsp-trust-card"><b>PWA sẵn sàng</b><span>Có manifest, service worker và trang offline.</span></div>`;
    hero.insertAdjacentElement('afterend', strip);
  }
  function activateTab(name) {
    const panel = $id('tab-' + name); const btn = document.querySelector(`.tab[data-tab="${name}"]`);
    if (!panel || !btn) return;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === btn));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('show'));
    panel.classList.add('show');
    try { currentTab = name; if (typeof autosave === 'function') autosave(); } catch {}
  }
  function addCompressTab() {
    const tabs = document.querySelector('.tabs'); if (!tabs || $id('tab-compress')) return;
    const btn = document.createElement('button'); btn.className = 'tab'; btn.dataset.tab = 'compress'; btn.textContent = '🗜 Nén PDF';
    const splitBtn = document.querySelector('.tab[data-tab="split"]');
    tabs.insertBefore(btn, splitBtn ? splitBtn.nextSibling : null);
    btn.addEventListener('click', () => activateTab('compress'));
    const panel = document.createElement('div'); panel.id = 'tab-compress'; panel.className = 'panel';
    panel.innerHTML = `
      <div class="section">
        <h3>🗜 Compress PDF <span class="tag">MỚI</span></h3>
        <select id="compressFile" aria-label="Chọn PDF để nén"></select>
        <div class="three" style="margin-top:8px">
          <select id="compressMode">
            <option value="optimize" selected>Nén an toàn: tối ưu cấu trúc</option>
            <option value="raster">Nén mạnh: chuyển trang thành ảnh JPEG</option>
          </select>
          <select id="compressPreset">
            <option value="low">Nén mạnh / file nhỏ</option>
            <option value="medium" selected>Cân bằng</option>
            <option value="high">Chất lượng cao</option>
            <option value="custom">Tùy chỉnh</option>
          </select>
          <input id="compressPages" placeholder="Trang: 1-3,5 hoặc để trống">
        </div>
        <div class="two" style="margin-top:8px">
          <label>Scale ảnh <input id="compressScale" type="number" min="0.45" max="2.4" step="0.05" value="1.2"></label>
          <label>JPEG quality <input id="compressQuality" type="number" min="0.25" max="0.92" step="0.01" value="0.68"></label>
        </div>
        <div class="toolbar">
          <button class="btn good" id="compressRun" type="button">▶ Nén PDF</button>
          <button class="btn" id="compressEstimate" type="button">🧮 Ước lượng</button>
          <button class="btn warn" id="compressReset" type="button">↺ Mặc định</button>
        </div>
        <div class="pfsp-compress-metrics" id="compressMetrics">
          <div class="pfsp-compress-metric"><b id="compressBefore">-</b><span>Dung lượng gốc</span></div>
          <div class="pfsp-compress-metric"><b id="compressAfter">-</b><span>Sau khi nén</span></div>
          <div class="pfsp-compress-metric"><b id="compressSaved">-</b><span>Dung lượng tiết kiệm</span></div>
        </div>
        <div class="hint" style="margin-top:10px">Chế độ tối ưu cấu trúc giữ text tốt hơn nhưng có thể giảm ít. Chế độ nén mạnh rasterize từng trang thành JPEG, thường giảm nhiều với PDF scan nhưng sẽ mất text chọn/copy.</div>
      </div>
      <div class="section">
        <h3>🧠 Gợi ý chọn chế độ</h3>
        <div class="pfsp-seo-card">
          <h4>PDF văn bản, hợp đồng, biểu mẫu</h4>
          <p>Dùng <b>Nén an toàn</b> trước để giữ khả năng tìm kiếm và copy chữ.</p>
        </div>
        <div class="pfsp-seo-card">
          <h4>PDF scan nhiều ảnh, file quá nặng</h4>
          <p>Dùng <b>Nén mạnh</b>, chọn preset Cân bằng. Nếu chữ bị mờ, đổi sang Chất lượng cao.</p>
        </div>
      </div>`;
    const tools = $id('tab-tools');
    tools?.parentNode?.insertBefore(panel, tools);
    updateCompressSelect();
    $id('compressRun')?.addEventListener('click', runCompress);
    $id('compressEstimate')?.addEventListener('click', estimateCompress);
    $id('compressReset')?.addEventListener('click', () => { $id('compressMode').value = 'optimize'; $id('compressPreset').value = 'medium'; $id('compressPages').value = ''; $id('compressScale').value = '1.2'; $id('compressQuality').value = '0.68'; updateCompressMetrics(null,null); toast('Đã đưa Compress PDF về mặc định.'); });
    ['compressFile','compressMode','compressPreset','compressPages','compressScale','compressQuality'].forEach(id => $id(id)?.addEventListener('change', () => { updateCompressMetrics(null,null); try { if (typeof autosave === 'function') autosave(); } catch {} }));
  }
  function updateCompressSelect() {
    const sel = $id('compressFile'); if (!sel) return;
    const pdfs = appEntries().filter(e => e.type === 'pdf' && !e.error);
    const old = sel.value;
    sel.innerHTML = pdfs.map(e => `<option value="${String(e.id).replace(/"/g,'&quot;')}">${String(e.file.name).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))} (${e.pages || '?'} trang)</option>`).join('');
    if (pdfs.some(e => e.id === old)) sel.value = old;
    updateCompressMetrics(null,null);
  }
  function updateCompressMetrics(before, after) {
    const entry = appEntries().find(e => e.id === $id('compressFile')?.value);
    const b = Number.isFinite(before) ? before : (entry?.file?.size || entry?.bytes?.length || NaN);
    const a = Number.isFinite(after) ? after : NaN;
    const saved = Number.isFinite(b) && Number.isFinite(a) ? Math.max(0, b - a) : NaN;
    if ($id('compressBefore')) $id('compressBefore').textContent = Number.isFinite(b) ? fmtBytes(b) : '-';
    if ($id('compressAfter')) $id('compressAfter').textContent = Number.isFinite(a) ? fmtBytes(a) : '-';
    if ($id('compressSaved')) $id('compressSaved').textContent = Number.isFinite(saved) ? `${fmtBytes(saved)} (${b ? Math.round(saved / b * 100) : 0}%)` : '-';
  }
  function estimateCompress() {
    const entry = appEntries().find(e => e.id === $id('compressFile')?.value);
    if (!entry) { toast('Hãy chọn PDF trước đã.'); return; }
    const mode = $id('compressMode')?.value || 'optimize'; const preset = getPreset();
    const factor = mode === 'optimize' ? .92 : Math.max(.18, Math.min(.88, preset.scale * preset.quality * .46));
    updateCompressMetrics(entry.file?.size || entry.bytes.length, Math.round((entry.file?.size || entry.bytes.length) * factor));
    toast('Đây chỉ là ước lượng. Kết quả thật phụ thuộc ảnh/font bên trong PDF.');
  }
  async function runCompress() {
    let isBusy = false; try { isBusy = !!busy; } catch {}
    if (isBusy) return;
    const entry = appEntries().find(e => e.id === $id('compressFile')?.value);
    if (!entry) { alert('Chọn một file PDF trước.'); return; }
    const pages = parsePages($id('compressPages')?.value || '', entry.pages || 0);
    if (!pages.length) { alert('Dải trang không hợp lệ.'); return; }
    const mode = $id('compressMode')?.value || 'optimize'; const preset = getPreset();
    try {
      try { if (typeof setBusy === 'function') setBusy(true, 'Đang nén PDF...'); } catch {}
      safeProgress(4); safeStatus('Đang chuẩn bị nén PDF...');
      const PDFDocumentRef = window.PDFLib?.PDFDocument || (typeof PDFDocument !== 'undefined' ? PDFDocument : null);
      if (!PDFDocumentRef) throw new Error('Thiếu pdf-lib.');
      let bytes;
      if (mode === 'raster') bytes = await compressRaster(entry, pages, preset, PDFDocumentRef);
      else bytes = await compressOptimize(entry, pages, PDFDocumentRef);
      const originalSize = entry.file?.size || entry.bytes.length;
      const outName = `${appClean(entry.file.name.replace(/\.pdf$/i,''))}-${mode === 'raster' ? 'compressed-image' : 'optimized'}.pdf`;
      saveExtra(bytes, outName, 'application/pdf');
      updateCompressMetrics(originalSize, bytes.length);
      const savedPct = originalSize ? Math.round(Math.max(0, originalSize - bytes.length) / originalSize * 100) : 0;
      safeProgress(100); safeStatus(`✅ Đã nén PDF: ${fmtBytes(originalSize)} → ${fmtBytes(bytes.length)} (${savedPct}% tiết kiệm)`);
      safeLog(`Compress PDF ${entry.file.name}: ${fmtBytes(originalSize)} -> ${fmtBytes(bytes.length)} bằng chế độ ${mode}/${preset.label}.`);
    } catch (err) {
      console.error(err); safeLog('Lỗi Compress PDF: ' + (err?.message || err)); safeStatus('❌ Nén PDF thất bại. Xem log để biết chi tiết.');
    } finally {
      try { if (typeof setBusy === 'function') setBusy(false); } catch {}
    }
  }
  async function compressOptimize(entry, pages, PDFDocumentRef) {
    const src = await PDFDocumentRef.load(appCopyBytes(entry), {ignoreEncryption:true, updateMetadata:false});
    const out = await PDFDocumentRef.create();
    const copied = await out.copyPages(src, pages);
    copied.forEach(p => out.addPage(p));
    try { out.setProducer('PDF Fusion Smart Pro Compress'); out.setCreator('PDF Fusion Smart Pro'); out.setTitle((entry.file?.name || 'Compressed PDF').replace(/\.pdf$/i,'')); } catch {}
    safeProgress(78); safeStatus('Đang ghi lại cấu trúc PDF tối ưu...');
    return await out.save({useObjectStreams:true, addDefaultPage:false, objectsPerTick:80});
  }
  async function compressRaster(entry, pages, preset, PDFDocumentRef) {
    if (!window.pdfjsLib) throw new Error('Thiếu PDF.js để rasterize trang.');
    const out = await PDFDocumentRef.create();
    const loading = window.pdfjsLib.getDocument({data: appCopyBytes(entry)});
    const pdf = await loading.promise;
    for (let i = 0; i < pages.length; i++) {
      const pageNo = pages[i] + 1;
      safeStatus(`Đang nén ảnh trang ${pageNo} (${i + 1}/${pages.length})...`);
      const page = await pdf.getPage(pageNo);
      const baseViewport = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:preset.scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width)); canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d', {alpha:false});
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:ctx, viewport}).promise;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', preset.quality));
      if (!blob) throw new Error('Không tạo được JPEG cho trang ' + pageNo);
      const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const pdfPage = out.addPage([baseViewport.width, baseViewport.height]);
      pdfPage.drawImage(jpg, {x:0, y:0, width:baseViewport.width, height:baseViewport.height});
      canvas.width = canvas.height = 1;
      safeProgress(8 + ((i + 1) / pages.length) * 86);
    }
    try { out.setProducer('PDF Fusion Smart Pro Compress Raster'); out.setCreator('PDF Fusion Smart Pro'); } catch {}
    return await out.save({useObjectStreams:true, addDefaultPage:false, objectsPerTick:30});
  }
  function addCommandBar() {
    if ($id('pfspCommandBar')) return;
    const bar = document.createElement('div'); bar.className = 'pfsp-command-bar'; bar.id = 'pfspCommandBar';
    bar.innerHTML = `<button type="button" data-pfsp-tab="export">Gộp</button><button type="button" data-pfsp-tab="compress">Nén</button><button type="button" data-pfsp-tab="split">Tách</button><button type="button" data-pfsp-tab="sign">Ký</button><button type="button" data-pfsp-scroll="top">Lên đầu</button>`;
    document.body.appendChild(bar);
  }
  function bindDelegates() {
    document.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-pfsp-tab]')?.dataset?.pfspTab;
      if (tab) { activateTab(tab); document.querySelector('.card:last-of-type')?.scrollIntoView({behavior:'smooth', block:'start'}); }
      if (e.target.closest('[data-pfsp-scroll="top"]')) window.scrollTo({top:0, behavior:'smooth'});
    });
    const fileInput = $id('fileInput'); fileInput?.addEventListener('change', () => setTimeout(updateCompressSelect, 500));
    const fileList = $id('fileList'); if (fileList && 'MutationObserver' in window) new MutationObserver(() => updateCompressSelect()).observe(fileList, {childList:true, subtree:false});
    setInterval(updateCompressSelect, 4500);
  }
  function applySeoRuntime() {
    document.documentElement.dataset.pfspPro = VERSION;
    if (!document.querySelector('meta[name="robots"]')) {
      const m = document.createElement('meta'); m.name = 'robots'; m.content = 'index, follow, max-image-preview:large'; document.head.appendChild(m);
    }
    if (!document.querySelector('link[rel="canonical"]')) {
      const l = document.createElement('link'); l.rel = 'canonical'; l.href = location.origin && location.origin !== 'null' ? location.origin + location.pathname : 'https://gtl-roan.vercel.app/'; document.head.appendChild(l);
    }
  }
  ready(() => {
    addHeroUi(); addCompressTab(); addCommandBar(); bindDelegates(); applySeoRuntime(); updateCompressSelect();
    try {
      const tool = new URLSearchParams(location.search).get('tool');
      if (tool && $id('tab-' + tool)) setTimeout(() => activateTab(tool), 180);
    } catch {}
  });
})();
