(function () {
  'use strict';

  function isHomePath(pathname) {
    if (!pathname) return true;
    var normalized = pathname.replace(/\/+$/, '');
    if (!normalized || normalized === '') return true;
    if (/\bindex\.html$/.test(normalized)) return true;
    var segments = normalized.split('/').filter(Boolean);
    if (!segments.length) return true;
    var last = segments[segments.length - 1];
    if (!/\.[a-zA-Z0-9]+$/.test(last) && segments.length <= 1) {
      return true;
    }
    return false;
  }

  function resolveHomeHref() {
    var basePath = (window.SILENT_CONFIG && window.SILENT_CONFIG.site && window.SILENT_CONFIG.site.basePath) || '.';
    if (typeof basePath !== 'string' || !basePath.length) {
      return 'index.html';
    }
    var normalized = basePath.replace(/\/+$/, '');
    if (!normalized || normalized === '.' || normalized === './') {
      return 'index.html';
    }
    return (normalized + '/index.html').replace(/\/+/g, '/');
  }

  function insertBackBar() {
    if (document.querySelector('.backbar')) {
      return;
    }
    var body = document.body;
    if (!body) {
      return;
    }
    var container = document.createElement('div');
    container.className = 'backbar';

    var link = document.createElement('a');
    link.className = 'backlink';
    link.setAttribute('href', resolveHomeHref());
    link.setAttribute('aria-label', 'Back to Home');

    var icon = document.createElement('span');
    icon.className = 'icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '←';

    var label = document.createElement('span');
    label.textContent = 'Back to Home';

    link.appendChild(icon);
    link.appendChild(label);
    container.appendChild(link);

    if (body.firstChild) {
      body.insertBefore(container, body.firstChild);
    } else {
      body.appendChild(container);
    }

    link.addEventListener('keydown', function (event) {
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        link.click();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        link.focus();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        link.focus();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (isHomePath(window.location.pathname)) {
      return;
    }
    insertBackBar();
  });
})();
