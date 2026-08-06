(() => {
  'use strict';
  if (!/\/admin-verify\.html$/i.test(location.pathname) || window.__PFSP_VERIFY_BUSINESS_UI__) return;
  window.__PFSP_VERIFY_BUSINESS_UI__ = true;

  const API_VERSION = '15.0.0-business-integrity';
  const originalFetch = window.fetch.bind(window);
  const revisions = new Map();
  const MUTATIONS = new Set([
    'register', 'bulk-register', 'register-bulk', 'revoke', 'restore', 'suspend', 'hold',
    'activate', 'unsuspend', 'archive', 'unarchive', 'expiry', 'update-expiry',
    'set-expiry', 'clear-expiry', 'update-note', 'note', 'metadata', 'repair',
    'resign', 'migrate', 'bulk-action', 'bulk-status'
  ]);

  const clean = value => String(value == null ? '' : value).trim();
  const makeId = prefix => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.getRandomValues(new Uint32Array(2)).join('')}`;

  function rememberRecord(record) {
    if (!record || !record.id) return;
    revisions.set(clean(record.id).toUpperCase(), {
      revision: Number(record.revision || 0),
      updatedAt: clean(record.updatedAt)
    });
  }
  function rememberPayload(payload) {
    rememberRecord(payload && payload.record);
    if (payload && Array.isArray(payload.records)) payload.records.forEach(rememberRecord);
    if (payload && Array.isArray(payload.results)) payload.results.forEach(item => rememberRecord(item && item.record));
  }
  function notify(message, type = 'warn') {
    let el = document.getElementById('pfspBusinessNotice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pfspBusinessNotice';
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000;max-width:420px;padding:12px 14px;border-radius:14px;background:#111827;color:#fff;border:1px solid rgba(148,163,184,.35);box-shadow:0 16px 50px rgba(0,0,0,.35);font:600 13px/1.45 system-ui';
      document.body.appendChild(el);
    }
    el.dataset.type = type;
    el.textContent = message;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.remove(), 7000);
  }

  window.fetch = async function pfspBusinessFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input && input.url;
    const next = { ...init, headers: new Headers(init.headers || (input && input.headers) || {}) };
    let bodyObject = null;

    if (next.body && typeof next.body === 'string' && /\/api\/verify(?:\?|$)/.test(String(url || ''))) {
      try { bodyObject = JSON.parse(next.body); } catch {}
    }
    if (bodyObject && typeof bodyObject === 'object') {
      const action = clean(bodyObject.action || 'register').toLowerCase();
      const id = clean(bodyObject.id || bodyObject.verifyId).toUpperCase();
      const adminSecret = clean(bodyObject.adminSecret || bodyObject.secret);
      if (adminSecret && !next.headers.has('X-Verify-Admin-Secret')) next.headers.set('X-Verify-Admin-Secret', adminSecret);
      delete bodyObject.adminSecret;
      delete bodyObject.secret;

      if (MUTATIONS.has(action)) {
        if (!next.headers.has('Idempotency-Key')) next.headers.set('Idempotency-Key', makeId(`PFSP-${action}`));
        if (id && bodyObject.expectedRevision == null && revisions.has(id)) {
          const known = revisions.get(id);
          bodyObject.expectedRevision = known.revision;
          if (!bodyObject.expectedUpdatedAt && known.updatedAt) bodyObject.expectedUpdatedAt = known.updatedAt;
        }
      }
      next.body = JSON.stringify(bodyObject);
      if (!next.headers.has('Content-Type')) next.headers.set('Content-Type', 'application/json');
    }
    if (!next.headers.has('X-PFSP-Request-Id')) next.headers.set('X-PFSP-Request-Id', makeId('PFSP-ADMIN'));

    const response = await originalFetch(input, next);
    const clone = response.clone();
    clone.json().then(payload => {
      rememberPayload(payload);
      if (response.status === 409 && payload) notify(payload.message || 'Dữ liệu đã thay đổi hoặc thao tác trạng thái không hợp lệ. Hãy tải lại bản ghi.', 'bad');
      if (payload && payload.apiVersion && payload.apiVersion !== API_VERSION) notify(`API đang trả ${payload.apiVersion}; giao diện quản trị kỳ vọng ${API_VERSION}.`, 'warn');
    }).catch(() => null);
    return response;
  };

  document.documentElement.dataset.pfspBusinessVersion = API_VERSION;
})();
