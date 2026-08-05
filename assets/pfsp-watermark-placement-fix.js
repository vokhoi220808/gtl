(function universal(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PFSPWatermarkPlacement = api;
    if (root.document) api.installBrowserPatch(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  'use strict';

  const IMAGE_MARK = typeof Symbol === 'function'
    ? Symbol.for('pfsp.watermark.image')
    : '__pfspWatermarkImage__';
  const INSTALL_FLAG = '__PFSP_WATERMARK_PLACEMENT_FIX_INSTALLED__';

  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function normalizeRotation(angle) {
    const snapped = Math.round(finite(angle, 0) / 90) * 90;
    return ((snapped % 360) + 360) % 360;
  }

  function normalizeBox(box) {
    const x = finite(box && box.x, 0);
    const y = finite(box && box.y, 0);
    const width = finite(box && box.width, 0);
    const height = finite(box && box.height, 0);
    if (width <= 0 || height <= 0) throw new Error('Invalid PDF page box.');
    return {x, y, width, height};
  }

  function computePlacement(input) {
    const crop = normalizeBox(input && (input.cropBox || input.mediaBox));
    const rotation = normalizeRotation(input && input.rotation);
    const cxPct = finite(input && input.cxPct, 0.5);
    const cyPct = finite(input && input.cyPct, 0.5);
    const widthPct = clamp(finite(input && input.widthPct, 0.35), 0.03, 1.4);
    const aspectRatio = clamp(finite(input && input.aspectRatio, 1), 0.001, 1000);

    const sideways = rotation === 90 || rotation === 270;
    const displayWidth = sideways ? crop.height : crop.width;
    const displayHeight = sideways ? crop.width : crop.height;
    const width = displayWidth * widthPct;
    const height = width * aspectRatio;
    const left = displayWidth * cxPct - width / 2;
    const top = displayHeight * cyPct - height / 2;

    let x;
    let y;
    if (rotation === 90) {
      x = crop.x + top + height;
      y = crop.y + left;
    } else if (rotation === 180) {
      x = crop.x + crop.width - left;
      y = crop.y + top + height;
    } else if (rotation === 270) {
      x = crop.x + crop.width - top - height;
      y = crop.y + crop.height - left;
    } else {
      x = crop.x + left;
      y = crop.y + crop.height - top - height;
    }

    return {
      x,
      y,
      width,
      height,
      rotate: rotation,
      displayWidth,
      displayHeight,
      left,
      top
    };
  }

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }

  function decodeDataUrl(dataUrl, root) {
    if (typeof dataUrl !== 'string' || !/^data:image\/(?:png|jpe?g);base64,/i.test(dataUrl)) return null;
    try {
      const atobFn = root && typeof root.atob === 'function'
        ? root.atob.bind(root)
        : (typeof atob === 'function' ? atob : null);
      if (!atobFn) return null;
      const binary = atobFn(dataUrl.slice(dataUrl.indexOf(',') + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch {
      return null;
    }
  }

  function bytesEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function readStoredState(root) {
    try {
      const raw = root.localStorage && root.localStorage.getItem('pdfFusionPlusState');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function readCustomState(root) {
    const doc = root.document;
    const usePreview = doc && doc.getElementById('wmLogoUsePreview');
    if (usePreview && !usePreview.checked) return null;

    const canvas = doc && doc.getElementById('wmLogoPreviewCanvas');
    const box = doc && doc.getElementById('wmLogoBox');
    if (canvas && box && canvas.width > 0 && box.offsetWidth > 0) {
      const width = box.offsetWidth;
      const height = box.offsetHeight || width;
      return {
        enabled: true,
        cxPct: (box.offsetLeft + width / 2) / canvas.width,
        cyPct: (box.offsetTop + height / 2) / canvas.height,
        wPct: width / canvas.width
      };
    }

    const stored = readStoredState(root);
    const custom = stored && stored.wmLogoCustom;
    return custom && custom.enabled ? custom : null;
  }

  function readDesiredOpacity(root) {
    const input = root.document && root.document.getElementById('wmLogoOpacity');
    const value = input ? Number(input.value) : 0.18;
    return Number.isFinite(value) ? clamp(value, 0, 1) : 0.18;
  }

  function readLegacyOpacity(root) {
    const input = root.document && root.document.getElementById('wmLogoOpacity');
    const value = input ? Number(input.value) : 0.18;
    return clamp(value || 0.18, 0, 1);
  }

  function installBrowserPatch(root) {
    if (!root || root[INSTALL_FLAG]) return !!(root && root[INSTALL_FLAG]);
    const lib = root.PDFLib;
    if (!lib || !lib.PDFDocument || !lib.PDFPage || typeof lib.degrees !== 'function') return false;

    const docProto = lib.PDFDocument.prototype;
    const pageProto = lib.PDFPage.prototype;
    if (!docProto || !pageProto || typeof pageProto.drawImage !== 'function') return false;

    const originalEmbedPng = docProto.embedPng;
    const originalEmbedJpg = docProto.embedJpg;
    const originalDrawImage = pageProto.drawImage;
    if (typeof originalEmbedPng !== 'function' || typeof originalEmbedJpg !== 'function') return false;

    let inputDataUrl = '';
    let cachedDataUrl = '';
    let cachedBytes = null;

    const fileInput = root.document && root.document.getElementById('wmLogoImage');
    if (fileInput && typeof root.FileReader === 'function') {
      fileInput.addEventListener('change', (event) => {
        const file = event.target && event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new root.FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            inputDataUrl = reader.result;
            cachedDataUrl = '';
            cachedBytes = null;
          }
        };
        reader.readAsDataURL(file);
      }, true);
    }

    function currentLogoDataUrl() {
      const overlay = root.document && root.document.getElementById('wmLogoOverlay');
      if (overlay && typeof overlay.src === 'string' && overlay.src.startsWith('data:image/')) return overlay.src;
      if (inputDataUrl) return inputDataUrl;
      const stored = readStoredState(root);
      return stored && typeof stored.wmLogoDataUrl === 'string' ? stored.wmLogoDataUrl : '';
    }

    function currentLogoBytes() {
      const dataUrl = currentLogoDataUrl();
      if (!dataUrl) return null;
      if (dataUrl !== cachedDataUrl) {
        cachedDataUrl = dataUrl;
        cachedBytes = decodeDataUrl(dataUrl, root);
      }
      return cachedBytes;
    }

    async function markEmbeddedImage(original, context, source) {
      const image = await original.call(context, source);
      const bytes = toBytes(source);
      const logoBytes = currentLogoBytes();
      if (bytes && logoBytes && bytesEqual(bytes, logoBytes)) {
        try { Object.defineProperty(image, IMAGE_MARK, {value: true}); }
        catch { image[IMAGE_MARK] = true; }
      }
      return image;
    }

    docProto.embedPng = function patchedEmbedPng(source) {
      return markEmbeddedImage(originalEmbedPng, this, source);
    };
    docProto.embedJpg = function patchedEmbedJpg(source) {
      return markEmbeddedImage(originalEmbedJpg, this, source);
    };

    pageProto.drawImage = function patchedDrawImage(image, options) {
      const opts = options || {};
      if (image && image[IMAGE_MARK]) {
        const custom = readCustomState(root);
        if (custom && custom.enabled) {
          const pageSize = typeof this.getSize === 'function' ? this.getSize() : null;
          const oldWidth = pageSize && pageSize.width * clamp(finite(custom.wPct, 0.35), 0.03, 1.4);
          const widthTolerance = Math.max(0.75, Math.abs(oldWidth || 0) * 0.002);
          const widthMatches = Number.isFinite(oldWidth) && Number.isFinite(Number(opts.width))
            && Math.abs(Number(opts.width) - oldWidth) <= widthTolerance;
          const legacyOpacity = readLegacyOpacity(root);
          const opacityMatches = !Number.isFinite(Number(opts.opacity))
            || Math.abs(Number(opts.opacity) - legacyOpacity) < 0.0001;

          if (widthMatches && opacityMatches && image.width > 0 && image.height > 0) {
            try {
              const cropBox = typeof this.getCropBox === 'function'
                ? this.getCropBox()
                : (typeof this.getMediaBox === 'function' ? this.getMediaBox() : {x: 0, y: 0, ...pageSize});
              const rotation = typeof this.getRotation === 'function' && this.getRotation()
                ? this.getRotation().angle
                : 0;
              const placement = computePlacement({
                cropBox,
                rotation,
                cxPct: custom.cxPct,
                cyPct: custom.cyPct,
                widthPct: custom.wPct,
                aspectRatio: image.height / image.width
              });
              return originalDrawImage.call(this, image, {
                ...opts,
                x: placement.x,
                y: placement.y,
                width: placement.width,
                height: placement.height,
                rotate: lib.degrees(placement.rotate),
                opacity: readDesiredOpacity(root)
              });
            } catch (error) {
              if (root.console && typeof root.console.warn === 'function') {
                root.console.warn('[PFSP] Watermark placement fallback:', error);
              }
            }
          }
        }
      }
      return originalDrawImage.call(this, image, opts);
    };

    root[INSTALL_FLAG] = true;
    return true;
  }

  return {
    computePlacement,
    normalizeRotation,
    installBrowserPatch
  };
});
