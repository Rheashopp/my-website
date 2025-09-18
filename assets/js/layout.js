(function () {
  'use strict';

  var HEADER_KEY = 'silent:header';
  var FOOTER_KEY = 'silent:footer';
  var NAV_PLACEHOLDER = '[data-layout-nav]';
  var FOOTER_PLACEHOLDER = '[data-layout-footer]';

  if (isHomePage()) {
    return;
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureLayout()
      .then(function () {
        highlightActiveLink();
      })
      .catch(function (error) {
        console.warn('Layout sync failed', error);
      });
  });

  function isHomePage() {
    var path = normalizePath(window.location.pathname || '');
    if (path === '/' || path === '/index.html') {
      return true;
    }
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      try {
        var canonicalUrl = new URL(canonical.href);
        var canonicalPath = normalizePath(canonicalUrl.pathname);
        if (canonicalPath === '/index.html') {
          return path === canonicalPath || path === '/';
        }
      } catch (error) {
        /* ignore */
      }
    }
    return false;
  }

  function ensureLayout() {
    return loadMarkup().then(function (markup) {
      if (markup.header) {
        applyMarkup(markup.header, NAV_PLACEHOLDER, 'nav');
      }
      if (markup.footer) {
        applyMarkup(markup.footer, FOOTER_PLACEHOLDER, 'footer');
      }
    });
  }

  function loadMarkup() {
    var header = readStorage(HEADER_KEY);
    var footer = readStorage(FOOTER_KEY);
    if (header && footer) {
      return Promise.resolve({ header: header, footer: footer });
    }
    return fetchHome()
      .then(function (doc) {
        var navEl = doc.querySelector('nav');
        var footerEl = doc.querySelector('footer');
        if (!navEl || !footerEl) {
          throw new Error('Homepage layout missing required regions');
        }
        header = navEl.outerHTML;
        footer = footerEl.outerHTML;
        writeStorage(HEADER_KEY, header);
        writeStorage(FOOTER_KEY, footer);
        return { header: header, footer: footer };
      })
      .catch(function (error) {
        if (header && footer) {
          return { header: header, footer: footer };
        }
        throw error;
      });
  }

  function fetchHome() {
    var homeUrl = getBaseUrl() + '/index.html';
    return fetch(homeUrl, { credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to fetch homepage');
        }
        return response.text();
      })
      .then(parseHTML)
      .catch(function () {
        return fetch(resolveLocalHomePath())
          .then(function (response) {
            if (!response.ok) {
              throw new Error('Failed to fetch local homepage');
            }
            return response.text();
          })
          .then(parseHTML);
      });
  }

  function parseHTML(markup) {
    var parser = new DOMParser();
    return parser.parseFromString(markup, 'text/html');
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* no-op */
    }
  }

  function applyMarkup(html, placeholderSelector, fallbackSelector) {
    if (!html) {
      return null;
    }
    var template = document.createElement('template');
    template.innerHTML = html.trim();
    var element = template.content.firstElementChild;
    if (!element) {
      return null;
    }

    var placeholder = document.querySelector(placeholderSelector);
    if (placeholder) {
      placeholder.replaceWith(element);
      return element;
    }

    var fallback = document.querySelector(fallbackSelector);
    if (fallback && fallback.parentNode) {
      fallback.parentNode.replaceChild(element, fallback);
    } else {
      if (placeholderSelector === NAV_PLACEHOLDER) {
        document.body.insertBefore(element, document.body.firstChild);
      } else {
        document.body.appendChild(element);
      }
    }
    return element;
  }

  function getBaseUrl() {
    var configUrl = null;
    try {
      configUrl = window.SILENT_CONFIG && window.SILENT_CONFIG.site && window.SILENT_CONFIG.site.baseUrl;
    } catch (error) {
      configUrl = null;
    }
    if (configUrl && typeof configUrl === 'string' && configUrl.length) {
      return configUrl.replace(/\/$/, '');
    }
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) {
      try {
        var canonicalUrl = new URL(canonical.href);
        canonicalUrl.pathname = canonicalUrl.pathname.replace(/\/?[^/]*$/, '');
        return (canonicalUrl.origin + canonicalUrl.pathname).replace(/\/$/, '');
      } catch (error) {
        /* ignore */
      }
    }
    var path = window.location.pathname || '';
    var origin = window.location.origin || '';
    return (origin + deriveRootPath(path, getBasePathDepth())).replace(/\/$/, '');
  }

  function getBasePathDepth() {
    var basePath = getBasePath();
    if (basePath === '.' || basePath === '') {
      return 0;
    }
    return basePath.split('/').filter(function (part) {
      return part === '..';
    }).length;
  }

  function getBasePath() {
    var basePath = '.';
    try {
      var site = window.SILENT_CONFIG && window.SILENT_CONFIG.site;
      if (site && typeof site.basePath === 'string' && site.basePath.length) {
        basePath = site.basePath;
      }
    } catch (error) {
      basePath = '.';
    }
    basePath = basePath.replace(/\/+$/, '');
    return basePath.length ? basePath : '.';
  }

  function deriveRootPath(pathname, depth) {
    var segments = pathname.split('/');
    if (segments.length && segments[segments.length - 1] === '') {
      segments.pop();
    }
    if (segments.length) {
      segments.pop();
    }
    while (depth > 0 && segments.length > 1) {
      segments.pop();
      depth -= 1;
    }
    return segments.join('/') || '/';
  }

  function resolveLocalHomePath() {
    var basePath = getBasePath();
    if (basePath === '.' || basePath === '') {
      return './index.html';
    }
    return (basePath + '/index.html').replace(/\/{2,}/g, '/');
  }

  function highlightActiveLink() {
    var nav = document.querySelector('nav');
    if (!nav) {
      return;
    }
    var links = nav.querySelectorAll('a[href]');
    var currentUrl = new URL(window.location.href);
    var currentPath = normalizePath(currentUrl.pathname);
    var baseUrl = getBaseUrl();
    var rootPath = '/';
    try {
      rootPath = normalizePath(new URL(baseUrl + '/', baseUrl).pathname || '/');
    } catch (error) {
      rootPath = '/';
    }
    var relativeCurrent = stripRoot(currentPath, rootPath);

    links.forEach(function (link) {
      link.removeAttribute('aria-current');
      var href = link.getAttribute('href');
      if (!href) {
        return;
      }
      var linkUrl;
      try {
        linkUrl = new URL(href, baseUrl + '/');
      } catch (error) {
        return;
      }
      var linkPath = normalizePath(linkUrl.pathname);
      var relativeLink = stripRoot(linkPath, rootPath);
      var isActive = false;
      if (relativeLink === relativeCurrent) {
        isActive = true;
      } else if (relativeLink.endsWith('/index.html')) {
        var section = relativeLink.replace(/index\.html$/, '');
        if (!section.length || section === '/') {
          if (relativeCurrent === '/' || relativeCurrent === '/index.html') {
            isActive = true;
          }
        } else if (relativeCurrent.startsWith(section) && relativeCurrent !== '/') {
          isActive = true;
        }
      }
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      }
    });

    function stripRoot(path, root) {
      if (!path) {
        return '/';
      }
      if (root && root !== '/' && path.startsWith(root)) {
        var stripped = path.slice(root.length);
        if (!stripped.length) {
          return '/';
        }
        return stripped.startsWith('/') ? stripped : '/' + stripped;
      }
      return path === root ? '/' : path;
    }
  }

  function normalizePath(pathname) {
    if (!pathname) {
      return '/';
    }
    var normalized = pathname.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    normalized = normalized.replace(/\/{2,}/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }
})();
