/* PDF Fusion Verify Asset Guard loader v15. */
(() => {
  'use strict';
  const VERSION = '15.0.0-business-integrity';
  const current = document.currentScript;
  const base = current && current.src ? new URL('.', current.src) : new URL('./assets/', location.href);
  function load(name, marker) {
    if (document.querySelector(`script[data-${marker}]`)) return;
    const script = document.createElement('script');
    script.src = new URL(name, base).href + `?v=${encodeURIComponent(VERSION)}`;
    script.defer = true;
    script.dataset[marker] = 'true';
    document.head.appendChild(script);
  }
  load('pfsp-verify-asset-guard-v14.js', 'pfspLegacyAssetGuard');
  if (/\/admin-verify\.html$/i.test(location.pathname)) load('pfsp-verify-business-ui.js', 'pfspBusinessUi');
})();
