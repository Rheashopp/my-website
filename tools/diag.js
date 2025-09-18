(function () {
  function collectStylesheetInfo() {
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    const targetLink = links.find((link) => {
      const href = link.getAttribute('href') || '';
      return href.includes('assets/css/style.css');
    });

    const info = {
      hrefAttribute: targetLink ? targetLink.getAttribute('href') : null,
      resolvedHref: null,
      stylesheetFound: false,
      ruleCount: null,
      cssAccessible: null,
      error: null,
    };

    if (targetLink) {
      try {
        info.resolvedHref = new URL(targetLink.getAttribute('href'), document.baseURI).toString();
      } catch (error) {
        info.error = error.message;
      }
    }

    Array.from(document.styleSheets).some((sheet) => {
      if (!sheet.href || !sheet.href.includes('assets/css/style.css')) {
        return false;
      }
      info.stylesheetFound = true;
      try {
        if (sheet.cssRules) {
          info.ruleCount = sheet.cssRules.length;
        }
        info.cssAccessible = true;
      } catch (error) {
        info.cssAccessible = false;
        info.error = error.message;
      }
      return true;
    });

    return info;
  }

  function compareBodyClasses() {
    const expected = ["bg-black", "text-white", "font-['Inter']", 'overflow-x-hidden'];
    const actual = Array.from(document.body?.classList || []);
    const missing = expected.filter((cls) => !actual.includes(cls));
    const extras = actual.filter((cls) => !expected.includes(cls));
    return { expected, actual, missing, extras };
  }

  function pickStyles(computed) {
    if (!computed) return null;
    const keys = ['display', 'position', 'justifyContent', 'alignItems', 'width', 'zIndex'];
    const result = {};
    keys.forEach((key) => {
      result[key] = computed.getPropertyValue(key);
    });
    return result;
  }

  function rectSummary(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  function selectorSummary(element) {
    if (!(element instanceof Element)) return 'unknown';
    if (element.id) return `#${element.id}`;
    const classList = Array.from(element.classList || []);
    if (classList.length) {
      return `${element.tagName.toLowerCase()}.${classList.join('.')}`;
    }
    return element.tagName.toLowerCase();
  }

  function collectHeaderInfo() {
    const headerEl =
      document.querySelector('header.site-header') ||
      document.querySelector('header') ||
      document.querySelector('nav');

    if (!headerEl) {
      return { exists: false };
    }

    const navEl = headerEl.matches('nav') ? headerEl : headerEl.querySelector('nav');
    const info = {
      exists: true,
      headerSelector: selectorSummary(headerEl),
      classList: Array.from(headerEl.classList || []),
      styles: pickStyles(window.getComputedStyle(headerEl)),
      rect: rectSummary(headerEl),
      nav: null,
    };

    if (navEl) {
      info.nav = {
        selector: selectorSummary(navEl),
        classList: Array.from(navEl.classList || []),
        styles: pickStyles(window.getComputedStyle(navEl)),
        rect: rectSummary(navEl),
      };
    }

    return info;
  }

  function findOverlayingElements() {
    const overlays = [];
    const headerEl = document.querySelector('header.site-header') || document.querySelector('nav');
    const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 40;

    Array.from(document.querySelectorAll('body *')).forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      if (headerEl && headerEl.contains(element)) return;
      const style = window.getComputedStyle(element);
      if (!['fixed', 'absolute'].includes(style.position)) return;
      const rect = element.getBoundingClientRect();
      if (rect.height <= 40) return;
      if (rect.top > headerBottom + 20) return;
      overlays.push({
        selector: selectorSummary(element),
        position: style.position,
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
      });
    });

    return overlays;
  }

  function inspectPreventDefault() {
    const targets = [];
    const nav = document.querySelector('nav');
    if (nav) {
      targets.push(nav);
      targets.push(...nav.querySelectorAll('a[href]'));
    }

    const uniqueTargets = Array.from(new Set(targets));
    const details = [];
    const hasInspector = typeof window.getEventListeners === 'function';

    if (!hasInspector) {
      return { method: 'unsupported', found: false, details: [] };
    }

    uniqueTargets.forEach((target) => {
      if (!(target instanceof Element)) return;
      const listeners = window.getEventListeners(target) || {};
      Object.keys(listeners).forEach((type) => {
        listeners[type].forEach((listener) => {
          const source = listener.listener && listener.listener.toString ? listener.listener.toString() : '';
          if (/preventDefault\s*\(/.test(source)) {
            details.push({
              method: 'getEventListeners',
              target: selectorSummary(target),
              type,
              snippet: source.replace(/\s+/g, ' ').trim().slice(0, 120),
            });
          }
        });
      });
    });

    return { method: 'getEventListeners', found: details.length > 0, details };
  }

  function collectProductsInfo() {
    const diag = window.__SILENT_DIAG__ && window.__SILENT_DIAG__.productsFetch;
    if (!diag) return null;
    return {
      lastSuccess: diag.success || null,
      attempts: diag.attempts || [],
      error: diag.error || null,
    };
  }

  function runDiagnostic() {
    const report = {
      page: window.location.href,
      timestamp: new Date().toISOString(),
      stylesheet: collectStylesheetInfo(),
      bodyClasses: compareBodyClasses(),
      header: collectHeaderInfo(),
      overlays: findOverlayingElements(),
      preventDefault: inspectPreventDefault(),
      products: collectProductsInfo(),
    };

    try {
      console.log(JSON.stringify(report));
    } catch (error) {
      console.log('silent-diagnostic-error', error);
    }
    try {
      window.__SILENT_LAST_DIAG__ = report;
    } catch (error) {
      /* ignore assignment failures */
    }
    return report;
  }

  runDiagnostic();
})();
