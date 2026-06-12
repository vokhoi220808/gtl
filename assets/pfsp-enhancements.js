(() => {
  'use strict';
  const VERSION = '4.1.0-upgraded';
  const $ = (id) => document.getElementById(id);
  const ready = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();
  const fmtBytes = (n) => {
    if (!Number.isFinite(n)) return 'không rõ';
    const units = ['B','KB','MB','GB']; let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };
  function toast(msg) {
    let el = document.querySelector('.pfsp-toast');
    if (!el) { el = document.createElement('div'); el.className = 'pfsp-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3400);
  }
  function downloadText(filename, text, type='application/json') {
    const blob = new Blob([text], {type: `${type}; charset=utf-8`});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function addPills() {
    const hero = document.querySelector('.hero');
    if (!hero || document.querySelector('.pfsp-upgrade-pill')) return;
    const wrap = document.createElement('div');
    const secure = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    wrap.innerHTML = `
      <span class="pfsp-upgrade-pill good">✅ Nâng cấp ${VERSION}</span>
      <span class="pfsp-upgrade-pill ${navigator.onLine ? 'good' : 'warn'}" id="pfspNetPill">${navigator.onLine ? '🟢 Online' : '🟡 Offline'}</span>
      <span class="pfsp-upgrade-pill ${secure ? 'good' : 'warn'}">${secure ? '🔒 PWA sẵn sàng' : '⚠ Cần HTTPS để bật PWA'}</span>`;
    hero.appendChild(wrap);
    const net = $('pfspNetPill');
    const sync = () => { if (!net) return; net.className = `pfsp-upgrade-pill ${navigator.onLine ? 'good' : 'warn'}`; net.textContent = navigator.onLine ? '🟢 Online' : '🟡 Offline'; };
    window.addEventListener('online', () => { sync(); toast('Đã có mạng lại.'); });
    window.addEventListener('offline', () => { sync(); toast('Đang offline. Các tài nguyên đã cache vẫn dùng được.'); });
  }
  function addUpgradePanel() {
    const tools = $('tab-tools');
    if (!tools || $('pfspUpgradePanel')) return;
    const panel = document.createElement('div');
    panel.className = 'section pfsp-upgrade-panel';
    panel.id = 'pfspUpgradePanel';
    panel.innerHTML = `
      <h3>🚀 Công cụ nâng cấp</h3>
      <div class="pfsp-upgrade-grid">
        <button class="btn good" type="button" id="pfspExportState">⬇ Xuất cấu hình JSON</button>
        <button class="btn" type="button" id="pfspImportStateBtn">⬆ Nhập cấu hình JSON</button>
        <button class="btn" type="button" id="pfspPwaCheck">🧪 Kiểm tra PWA</button>
        <button class="btn" type="button" id="pfspClearCache">♻ Làm mới cache</button>
        <button class="btn" type="button" id="pfspCopyLog">📋 Copy log</button>
        <button class="btn warn" type="button" id="pfspShortcuts">⌨ Phím tắt</button>
      </div>
      <input class="pfsp-hidden-file" id="pfspImportState" type="file" accept="application/json,.json">
      <div class="pfsp-upgrade-note" id="pfspStorageNote">Đang kiểm tra dung lượng lưu trữ...</div>`;
    tools.appendChild(panel);
    $('pfspExportState')?.addEventListener('click', () => {
      const data = localStorage.getItem('pdfFusionPlusState') || '{}';
      const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      downloadText(`pdf-fusion-config-${stamp}.json`, data);
      toast('Đã xuất cấu hình project.');
    });
    $('pfspImportStateBtn')?.addEventListener('click', () => $('pfspImportState')?.click());
    $('pfspImportState')?.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        const txt = await f.text(); JSON.parse(txt);
        localStorage.setItem('pdfFusionPlusState', txt);
        toast('Đã nhập cấu hình. Trang sẽ tải lại để áp dụng.');
        setTimeout(() => location.reload(), 850);
      } catch (err) { toast('File cấu hình không hợp lệ.'); }
    });
    $('pfspPwaCheck')?.addEventListener('click', async () => {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
      const hasManifest = !!document.querySelector('link[rel="manifest"]');
      const cacheNames = 'caches' in window ? await caches.keys().catch(() => []) : [];
      toast(`PWA: SW ${reg ? 'đã đăng ký' : 'chưa có'}, manifest ${hasManifest ? 'OK' : 'thiếu'}, cache ${cacheNames.length} mục.`);
    });
    $('pfspClearCache')?.addEventListener('click', async () => {
      if (!('caches' in window)) { toast('Trình duyệt không hỗ trợ Cache API.'); return; }
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith('pdf-fusion-')).map(k => caches.delete(k)));
      if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({type:'PFSP_SKIP_WAITING'});
      toast('Đã làm mới cache PDF Fusion. Tải lại trang để lấy bản mới nhất.');
    });
    $('pfspCopyLog')?.addEventListener('click', async () => {
      const log = $('log')?.innerText || '';
      try { await navigator.clipboard.writeText(log || 'Không có log.'); toast('Đã copy log.'); }
      catch { downloadText('pdf-fusion-log.txt', log || 'Không có log.', 'text/plain'); toast('Không copy được, đã tải log dạng TXT.'); }
    });
    $('pfspShortcuts')?.addEventListener('click', showShortcuts);
    updateStorageNote();
  }
  async function updateStorageNote() {
    const note = $('pfspStorageNote'); if (!note) return;
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate().catch(() => null);
      if (est) { note.textContent = `Dung lượng trình duyệt đang dùng khoảng ${fmtBytes(est.usage)} / ${fmtBytes(est.quota)}. Cấu hình, chữ ký và logo có thể nằm trong localStorage.`; return; }
    }
    note.textContent = 'Trình duyệt không trả về thông tin dung lượng. Vẫn có thể dùng autosave/localStorage bình thường.';
  }
  function showShortcuts() {
    let modal = $('pfspShortcutModal');
    if (!modal) {
      modal = document.createElement('div'); modal.className = 'pfsp-modal'; modal.id = 'pfspShortcutModal';
      modal.innerHTML = `<div class="pfsp-modal-card" role="dialog" aria-modal="true" aria-labelledby="pfspShortcutTitle">
        <h2 id="pfspShortcutTitle">Phím tắt nhanh</h2>
        <ul>
          <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd>: lưu cấu hình project.</li>
          <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd>: chạy nút Xuất PDF.</li>
          <li><kbd>?</kbd>: mở bảng phím tắt.</li>
          <li><kbd>Esc</kbd>: đóng bảng này.</li>
        </ul>
        <div class="pfsp-modal-actions"><button class="btn good" id="pfspShortcutClose" type="button">Đóng</button></div>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
      $('pfspShortcutClose')?.addEventListener('click', () => modal.classList.remove('show'));
    }
    modal.classList.add('show');
  }
  function keyboardShortcuts(e) {
    const target = e.target;
    const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
    const editing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('saveProject')?.click(); toast('Đã gọi lưu cấu hình.'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('runBtn')?.click(); }
    if (!editing && e.key === '?') showShortcuts();
    if (e.key === 'Escape') $('pfspShortcutModal')?.classList.remove('show');
  }
  function pwaInstallHook() {
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); deferredPrompt = e;
      const hero = document.querySelector('.hero');
      if (!hero || $('pfspInstallBtn')) return;
      const btn = document.createElement('button');
      btn.id = 'pfspInstallBtn'; btn.type = 'button'; btn.className = 'btn good'; btn.style.marginTop = '12px'; btn.textContent = '📲 Cài app vào máy';
      btn.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice.catch(() => null); deferredPrompt = null; btn.remove(); });
      hero.appendChild(btn);
    });
  }
  ready(() => {
    document.documentElement.dataset.pfspVersion = VERSION;
    addPills(); addUpgradePanel(); pwaInstallHook();
    document.addEventListener('keydown', keyboardShortcuts);
    if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.getRegistration().then(reg => { if (reg?.waiting) reg.waiting.postMessage({type:'PFSP_SKIP_WAITING'}); }).catch(() => null);
    }
  });
})();
