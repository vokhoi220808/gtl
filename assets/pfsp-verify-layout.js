(() => {
  'use strict';

  const VERSION = '15.0.0-business-integrity';
  const PAGE_PATHS = new Set([
    '/verify.html',
    '/admin-verify.html',
    '/verify-registry.html',
    '/trust-portal.html',
    '/verify-certificate.html'
  ]);
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const filePath = pathname.slice(pathname.lastIndexOf('/')) || '/';
  if (!PAGE_PATHS.has(filePath) || window.__PFSP_VERIFY_LAYOUT__) return;
  window.__PFSP_VERIFY_LAYOUT__ = true;

  function addStylesheet() {
    if (document.querySelector('link[data-pfsp-verify-layout]')) return;
    const current = document.currentScript;
    const base = current && current.src ? new URL('.', current.src) : new URL('./assets/', location.href);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('pfsp-verify-layout.css', base).href + `?v=${encodeURIComponent(VERSION)}`;
    link.dataset.pfspVerifyLayout = 'true';
    document.head.appendChild(link);
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function pageKey() {
    if (/admin-verify\.html$/i.test(filePath)) return 'admin';
    if (/verify-registry\.html$/i.test(filePath)) return 'registry';
    if (/trust-portal\.html$/i.test(filePath)) return 'portal';
    if (/verify-certificate\.html$/i.test(filePath)) return 'certificate';
    return 'verify';
  }

  const pages = [
    ['verify', './verify.html', 'Xác minh', '🛡️'],
    ['portal', './trust-portal.html', 'Trust Portal', '🌐'],
    ['certificate', './verify-certificate.html', 'Chứng nhận', '📜'],
    ['registry', './verify-registry.html', 'Cách hoạt động', '📚'],
    ['admin', './admin-verify.html', 'Quản trị', '🔐']
  ];

  function createGlobalNav(active) {
    if (document.getElementById('pfspVerifyGlobalNav')) return;
    const nav = document.createElement('nav');
    nav.id = 'pfspVerifyGlobalNav';
    nav.className = 'pfsp-layout-global-nav';
    nav.setAttribute('aria-label', 'Điều hướng Verify System');
    nav.innerHTML = `
      <a class="pfsp-layout-home" href="./index.html" aria-label="Về PDF Fusion Smart Pro">
        <span class="pfsp-layout-home-mark">PF</span>
        <span><b>PDF Fusion</b><small>Verify System v15</small></span>
      </a>
      <div class="pfsp-layout-nav-links">
        ${pages.map(([key, href, label, icon]) => `<a href="${href}" ${key === active ? 'aria-current="page" class="active"' : ''}><span>${icon}</span>${label}</a>`).join('')}
      </div>
    `;
    document.body.insertBefore(nav, document.body.firstChild);
  }

  function refreshVersionLabels() {
    document.title = document.title.replace(/v14\b/gi, 'v15');
    document.querySelectorAll('.pfsp-v11-kicker').forEach(el => {
      el.textContent = el.textContent
        .replace(/Verify System v14 Enterprise(?: Trust Suite)?/gi, 'Verify System v15 Business Integrity')
        .replace(/v14 Enterprise/gi, 'v15 Business Integrity');
    });
  }

  function headingOf(element) {
    return text(element.querySelector('h1,h2,h3')?.textContent).toLowerCase();
  }

  function containsAny(element, selectors) {
    return selectors.some(selector => element.matches?.(selector) || element.querySelector?.(selector));
  }

  function panelTitle(key) {
    return {
      overview: ['Tổng quan hệ thống', 'Trạng thái, chẩn đoán và các thao tác nhanh.'],
      records: ['Danh sách records', 'Tìm kiếm, lọc và chọn bản ghi cần xử lý.'],
      register: ['Đăng ký tài liệu', 'Tạo record mới và kiểm tra dữ liệu trước khi ghi.'],
      batch: ['Xử lý hàng loạt', 'Batch verify, bulk register và nhập nhiều dữ liệu.'],
      tools: ['Công cụ record', 'Lookup hash, certificate và cập nhật metadata.'],
      governance: ['Vòng đời & quản trị', 'Analytics, chuyển trạng thái và tác vụ quản trị.'],
      audit: ['Audit & sao lưu', 'Theo dõi lịch sử, backup và dữ liệu kỹ thuật.']
    }[key];
  }

  function classifyAdminItem(element) {
    const heading = headingOf(element);
    if (containsAny(element, ['#mRecords', '#health', '#diagnostics', '#integrity', '#result', '#dump'])) return 'overview';
    if (containsAny(element, ['#recordsRows', '#query', '#statusFilter', '#loadRecords']) || heading === 'records') return 'records';
    if (containsAny(element, ['#dryRegister', '#register', '#registerId', '#registerHash'])) return 'register';
    if (containsAny(element, ['#batchVerify', '#batchInput', '#bulkDry', '#bulkWrite', '#bulkInput'])) return 'batch';
    if (containsAny(element, ['#lookupHashBtn', '#exportCertBtn', '#updateMeta', '#certId'])) return 'tools';
    if (containsAny(element, ['#loadAnalytics', '#bulkActionWrite', '#bulkActionDry', '#bulkOperation'])) return 'governance';
    if (containsAny(element, ['#auditRows', '#loadAudit', '#backup', '#repair', '#resign'])) return 'audit';
    if (/audit|backup|repair|snapshot/i.test(heading)) return 'audit';
    if (/analytics|bulk action|lifecycle|trạng thái/i.test(heading)) return 'governance';
    if (/lookup|certificate|metadata/i.test(heading)) return 'tools';
    if (/batch|bulk register/i.test(heading)) return 'batch';
    if (/đăng ký|register/i.test(heading)) return 'register';
    return 'overview';
  }

  function adminItems(main, hero) {
    const items = [];
    [...main.children].forEach(section => {
      if (section === hero || section.classList.contains('pfsp-v11-footer') || section.classList.contains('pfsp-admin-workspace')) return;
      const isMetricGrid = section.matches('.pfsp-v11-grid.three') && containsAny(section, ['#mRecords']);
      const children = [...section.children].filter(child => child.matches('.pfsp-v11-card,aside,.pfsp-final-shell'));
      if (!isMetricGrid && section.matches('.pfsp-v11-grid') && children.length > 1) {
        children.forEach(child => items.push(child));
        section.remove();
      } else {
        items.push(section);
      }
    });
    return items;
  }

  function buildAdminWorkspace(main, hero) {
    if (main.querySelector('.pfsp-admin-workspace')) return;
    main.classList.add('pfsp-layout-main', 'pfsp-layout-admin');
    hero?.classList.add('pfsp-layout-hero');

    const groups = new Map();
    ['overview', 'records', 'register', 'batch', 'tools', 'governance', 'audit'].forEach(key => groups.set(key, []));
    adminItems(main, hero).forEach(item => groups.get(classifyAdminItem(item)).push(item));

    const workspace = document.createElement('div');
    workspace.className = 'pfsp-admin-workspace';
    const sidebar = document.createElement('aside');
    sidebar.className = 'pfsp-admin-sidebar';
    sidebar.innerHTML = '<div class="pfsp-admin-sidebar-title"><b>Không gian làm việc</b><span>Chọn một nhóm tác vụ</span></div>';
    const nav = document.createElement('div');
    nav.className = 'pfsp-admin-tabs';
    nav.setAttribute('role', 'tablist');
    sidebar.appendChild(nav);

    const content = document.createElement('div');
    content.className = 'pfsp-admin-content';
    workspace.append(sidebar, content);
    hero?.after(workspace);

    const metadata = {
      overview: ['Tổng quan', '◫'],
      records: ['Records', '☷'],
      register: ['Đăng ký', '＋'],
      batch: ['Hàng loạt', '⇉'],
      tools: ['Công cụ', '⌕'],
      governance: ['Quản trị', '⚙'],
      audit: ['Audit', '◷']
    };

    for (const [key, items] of groups) {
      if (!items.length) continue;
      const [label, icon] = metadata[key];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pfsp-admin-tab';
      button.dataset.panel = key;
      button.setAttribute('role', 'tab');
      button.innerHTML = `<span>${icon}</span><b>${label}</b><small>${items.length}</small>`;
      nav.appendChild(button);

      const panel = document.createElement('section');
      panel.className = `pfsp-admin-panel pfsp-admin-panel-${key}`;
      panel.id = `pfsp-admin-${key}`;
      panel.dataset.panel = key;
      panel.setAttribute('role', 'tabpanel');
      const [title, description] = panelTitle(key);
      panel.innerHTML = `<header class="pfsp-admin-panel-head"><div><span>Verify Workspace</span><h2>${title}</h2><p>${description}</p></div></header><div class="pfsp-admin-panel-grid"></div>`;
      const grid = panel.querySelector('.pfsp-admin-panel-grid');
      items.forEach(item => {
        item.classList.add('pfsp-layout-section');
        grid.appendChild(item);
      });
      content.appendChild(panel);
    }

    const tabs = [...nav.querySelectorAll('.pfsp-admin-tab')];
    const panels = [...content.querySelectorAll('.pfsp-admin-panel')];
    function activate(key, updateUrl = true) {
      const fallback = tabs[0]?.dataset.panel;
      const next = panels.some(panel => panel.dataset.panel === key) ? key : fallback;
      if (!next) return;
      tabs.forEach(tab => {
        const active = tab.dataset.panel === next;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach(panel => panel.classList.toggle('active', panel.dataset.panel === next));
      localStorage.setItem('pfspVerifyAdminPanel', next);
      if (updateUrl) history.replaceState(null, '', `#admin-${next}`);
      document.dispatchEvent(new CustomEvent('pfsp:admin-panel', { detail: { panel: next } }));
    }
    tabs.forEach(tab => tab.addEventListener('click', () => activate(tab.dataset.panel)));
    nav.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = Math.max(0, tabs.indexOf(document.activeElement));
      const delta = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
      const next = tabs[(currentIndex + delta + tabs.length) % tabs.length];
      next.focus();
      activate(next.dataset.panel);
    });
    const hashPanel = location.hash.match(/^#admin-([a-z-]+)$/i)?.[1];
    activate(hashPanel || localStorage.getItem('pfspVerifyAdminPanel') || 'overview', false);
  }

  function idForSection(section, index) {
    if (section.id) return section.id;
    const heading = text(section.querySelector('h2,h3')?.textContent)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    section.id = `pfsp-section-${heading || index + 1}`;
    return section.id;
  }

  function buildPublicLayout(main, hero, active) {
    main.classList.add('pfsp-layout-main', `pfsp-layout-${active}`);
    hero?.classList.add('pfsp-layout-hero');
    const sections = [...main.children].filter(el => el !== hero && el.matches('section'));
    sections.forEach(section => section.classList.add('pfsp-layout-section'));

    if (active === 'verify') {
      const result = sections.find(section => containsAny(section, ['#trustedResult']));
      const upload = sections.find(section => containsAny(section, ['#fileInput', '#pdfInput', '#pdfFile', '#certInput']) || /so hash pdf thật/i.test(headingOf(section)));
      if (result && upload && !main.querySelector('.pfsp-verify-primary-workspace')) {
        const workspace = document.createElement('div');
        workspace.className = 'pfsp-verify-primary-workspace';
        result.before(workspace);
        workspace.append(result, upload);
      }
    }

    const directSections = [...main.children].filter(el => el !== hero && (el.matches('section') || el.classList.contains('pfsp-verify-primary-workspace')));
    if (directSections.length > 1 && !main.querySelector('.pfsp-layout-jumps')) {
      const jumps = document.createElement('nav');
      jumps.className = 'pfsp-layout-jumps';
      jumps.setAttribute('aria-label', 'Đi tới phần nội dung');
      directSections.forEach((section, index) => {
        const target = section.classList.contains('pfsp-verify-primary-workspace') ? (section.id = 'pfsp-primary-workspace') : idForSection(section, index);
        const label = section.classList.contains('pfsp-verify-primary-workspace')
          ? 'Xác minh chính'
          : text(section.querySelector('h2,h3')?.textContent) || `Phần ${index + 1}`;
        const link = document.createElement('a');
        link.href = `#${target}`;
        link.textContent = label;
        jumps.appendChild(link);
      });
      hero?.after(jumps);
    }
  }

  function enhance() {
    const active = pageKey();
    const main = document.querySelector('main.pfsp-v11-wrap, main');
    if (!main) return;
    document.body.classList.add('pfsp-layout-enabled');
    document.documentElement.dataset.pfspVerifyLayout = VERSION;
    createGlobalNav(active);
    refreshVersionLabels();
    const hero = [...main.children].find(el => el.matches?.('.pfsp-v11-hero, .pfsp-final-shell')) || main.querySelector('.pfsp-v11-hero');
    if (active === 'admin') buildAdminWorkspace(main, hero);
    else buildPublicLayout(main, hero, active);
  }

  addStylesheet();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });
  else enhance();
})();
