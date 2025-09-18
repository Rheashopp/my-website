(function () {
  'use strict';

  const DEFAULT_CONFIG = {
    site: {
      basePath: '.',
      baseUrl: 'https://silent.superintelligence',
    },
    voice: {
      provider: 'demo',
      ttsVoiceName: null,
    },
  };

  const existingConfig = window.SILENT_CONFIG || {};

  window.SILENT_CONFIG = Object.assign({}, DEFAULT_CONFIG, existingConfig, {
    site: Object.assign({}, DEFAULT_CONFIG.site, existingConfig.site || {}),
    voice: Object.assign({}, DEFAULT_CONFIG.voice, existingConfig.voice || {}),
  });

  if (
    !window.SILENT_CONFIG.site.baseUrl ||
    window.SILENT_CONFIG.site.baseUrl === 'https://silent.superintelligence'
  ) {
    window.SILENT_CONFIG.site.baseUrl = 'https://rheashopp.github.io/my-website';
  }

  function getBasePath() {
    const basePath = window.SILENT_CONFIG?.site?.basePath;
    if (typeof basePath !== 'string' || basePath.length === 0) {
      return '.';
    }
    const sanitized = basePath.replace(/\/+$/, '');
    return sanitized.length ? sanitized : '.';
  }

  function resolvePath(targetPath) {
    if (!targetPath) return targetPath;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetPath) || targetPath.startsWith('//')) {
      return targetPath;
    }
    const cleanTarget = targetPath.replace(/^\/+/, '');
    const basePath = getBasePath();
    if (basePath === '.') {
      return cleanTarget.startsWith('./') || cleanTarget.startsWith('../')
        ? cleanTarget
        : `./${cleanTarget}`;
    }
    return `${basePath}/${cleanTarget}`.replace(/\/{2,}/g, '/');
  }

  const selectors = {
    navToggle: '[data-nav-toggle]',
    nav: '#primary-nav',
    skipLink: '.skip-link',
  };

  document.addEventListener('DOMContentLoaded', () => {
    applyBasePathLinks();
    initNav();
    highlightNav();
    initSmoothScroll();
    initProductCatalog();
    initProductDetail();
    initContactForm();
  });

  function applyBasePathLinks() {
    const basePath = getBasePath();
    if (!basePath || basePath === '.') return;
    document.querySelectorAll('a[href]').forEach((link) => {
      const target = link.getAttribute('data-href') || link.getAttribute('href');
      if (!target || !target.startsWith('/')) return;
      const href = `${basePath}${target}`;
      link.setAttribute('href', href);
    });
  }

  function initNav() {
    const toggle = document.querySelector(selectors.navToggle);
    const nav = document.querySelector(selectors.nav);
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      nav.dataset.open = String(!expanded);
      if (!expanded) {
        const firstLink = nav.querySelector('a');
        if (firstLink) {
          firstLink.focus();
        }
        document.addEventListener('keydown', escListener);
      } else {
        document.removeEventListener('keydown', escListener);
      }
    });

    function escListener(event) {
      if (event.key === 'Escape') {
        toggle.setAttribute('aria-expanded', 'false');
        nav.dataset.open = 'false';
        toggle.focus();
        document.removeEventListener('keydown', escListener);
      }
    }

    nav.addEventListener('click', (event) => {
      if (event.target instanceof HTMLElement && event.target.tagName === 'A') {
        toggle.setAttribute('aria-expanded', 'false');
        nav.dataset.open = 'false';
      }
    });
  }

  function highlightNav() {
    const navLinks = Array.from(document.querySelectorAll('nav a[href]'));
    if (!navLinks.length) return;

    const normalizePath = (path) => {
      if (!path) return '/';
      let normalized = path;
      if (!normalized.startsWith('/')) {
        normalized = `/${normalized}`;
      }
      normalized = normalized.replace(/\/+/g, '/');
      normalized = normalized.replace(/\/index\.html$/, '/');
      if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized || '/';
    };

    const currentPath = normalizePath(window.location.pathname || '/');
    const baseLink = navLinks.find((link) => {
      const href = link.getAttribute('href') || '';
      return href.includes('index.html') && !href.includes('#');
    });
    const homePath = baseLink
      ? normalizePath(new URL(baseLink.getAttribute('href'), window.location.href).pathname)
      : normalizePath('index.html');

    let activeLink = null;
    let activeScore = -Infinity;

    navLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      let url;
      try {
        url = new URL(href, window.location.href);
      } catch (error) {
        return;
      }

      if (url.origin !== window.location.origin) {
        return;
      }

      const targetPath = normalizePath(url.pathname);
      let score = -Infinity;

      if (targetPath === currentPath) {
        score = url.hash && url.hash !== '#' ? 2 : 3;
      } else if (
        targetPath !== homePath &&
        targetPath !== '/' &&
        currentPath.startsWith(`${targetPath}/`)
      ) {
        score = 1;
      }

      if (score > activeScore) {
        activeScore = score;
        activeLink = link;
      }
    });

    navLinks.forEach((link) => {
      const isActive = link === activeLink && activeScore > -Infinity;
      if (isActive) {
        link.setAttribute('aria-current', 'page');
        link.classList.add('text-indigo-400');
      } else {
        link.removeAttribute('aria-current');
        link.classList.remove('text-indigo-400');
      }
    });
  }

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        const targetId = anchor.getAttribute('href');
        if (!targetId || targetId.length <= 1) return;
        const target = document.querySelector(targetId);
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          history.replaceState(null, '', targetId);
          target.focus({ preventScroll: true });
        }
      });
    });
  }

  const productCache = {
    data: null,
    promise: null,
  };

  function fetchProducts() {
    if (productCache.data) return Promise.resolve(productCache.data);
    if (productCache.promise) return productCache.promise;
    const url = resolvePath('data/products.json');
    productCache.promise = fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load product data');
        }
        return response.json();
      })
      .then((json) => {
        productCache.data = json.products || [];
        return productCache.data;
      })
      .catch((error) => {
        console.error(error);
        productCache.promise = null;
        throw error;
      });
    return productCache.promise;
  }

  function initProductCatalog() {
    const catalogEl = document.querySelector('[data-products-catalog]');
    if (!catalogEl) return;
    const listEl = catalogEl.querySelector('[data-product-list]');
    const searchEl = catalogEl.querySelector('input[type="search"]');
    const filtersEl = catalogEl.querySelector('[data-product-filters]');
    const ctaEl = catalogEl.querySelector('[data-request-access]');

    const storedFilters = localStorage.getItem('silent-product-filters');
    let activeTags = [];
    let searchTerm = '';
    if (storedFilters) {
      try {
        const parsed = JSON.parse(storedFilters);
        activeTags = parsed.tags || [];
        searchTerm = parsed.search || '';
        if (searchEl) searchEl.value = searchTerm;
      } catch (error) {
        console.warn('Failed to parse filters', error);
      }
    }

    fetchProducts()
      .then((products) => {
        const tags = Array.from(new Set(products.flatMap((product) => product.category || []))).sort();
        if (filtersEl) {
          filtersEl.innerHTML = '';
          tags.forEach((tag) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = tag;
            button.setAttribute('aria-pressed', activeTags.includes(tag) ? 'true' : 'false');
            button.addEventListener('click', () => {
              const isActive = button.getAttribute('aria-pressed') === 'true';
              if (isActive) {
                activeTags = activeTags.filter((item) => item !== tag);
                button.setAttribute('aria-pressed', 'false');
              } else {
                activeTags.push(tag);
                button.setAttribute('aria-pressed', 'true');
              }
              persistFilters();
              render(products);
            });
            filtersEl.appendChild(button);
          });
        }
        render(products);

        if (searchEl) {
          searchEl.addEventListener('input', () => {
            searchTerm = searchEl.value.trim();
            persistFilters();
            render(products);
          });
        }

        if (ctaEl) {
          ctaEl.addEventListener('click', () => {
            localStorage.setItem(
              'silent-product-filters',
              JSON.stringify({ tags: activeTags, search: searchTerm })
            );
          });
        }

        function persistFilters() {
          localStorage.setItem(
            'silent-product-filters',
            JSON.stringify({ tags: activeTags, search: searchTerm })
          );
        }

        function render(items) {
          if (!listEl) return;
          listEl.innerHTML = '';
          const filtered = items.filter((product) => {
            const matchesSearch = searchTerm
              ? product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                product.summary.toLowerCase().includes(searchTerm.toLowerCase())
              : true;
            const matchesTags = activeTags.length
              ? activeTags.every((tag) => (product.category || []).includes(tag))
              : true;
            return matchesSearch && matchesTags;
          });

          if (!filtered.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No products match your filters yet. Adjust the filters or request a briefing.';
            listEl.appendChild(empty);
            return;
          }

          filtered.forEach((product) => {
            const article = document.createElement('article');
            article.className = 'card';
            article.innerHTML = `
              <div class="badge-list">
                ${(product.category || [])
                  .map((tag) => `<span class="badge">${tag}</span>`)
                  .join('')}
              </div>
              <h3>${product.name}</h3>
              <p>${product.summary}</p>
              <a class="link-arrow" href="${resolvePath('products/' + product.slug + '.html')}">
                Explore ${product.name}
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12m0 0l-4-4m4 4l-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </a>
            `;
            listEl.appendChild(article);
          });
        }
      })
      .catch(() => {
        if (listEl) {
          listEl.innerHTML = '<p>Products are loading. Please refresh if this persists.</p>';
        }
      });
  }

  function initProductDetail() {
    const detailEl = document.querySelector('[data-product-detail]');
    if (!detailEl) return;
    const slug = detailEl.getAttribute('data-product-detail');
    if (!slug) return;
    fetchProducts()
      .then((products) => {
        const product = products.find((item) => item.slug === slug);
        if (!product) return;
        populateHero(product);
        populateLists(detailEl, product);
        populateSpecs(detailEl, product);
        populateFAQ(detailEl, product);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  function populateHero(product) {
    const heading = document.querySelector('[data-product-name]');
    const tagline = document.querySelector('[data-product-tagline]');
    const summary = document.querySelector('[data-product-summary]');
    const image = document.querySelector('[data-product-image]');
    const breadcrumbs = document.querySelector('[data-product-breadcrumbs]');
    if (heading) heading.textContent = product.name;
    if (tagline) tagline.textContent = product.tagline;
    if (summary) summary.textContent = product.summary;
    if (image) {
      image.setAttribute('src', resolvePath(product.heroImage));
      image.setAttribute('alt', `${product.name} interface visualization`);
      image.setAttribute('loading', 'lazy');
    }
    if (breadcrumbs) {
      breadcrumbs.innerHTML = (product.category || [])
        .map((tag) => `<span class="badge">${tag}</span>`)
        .join('');
    }
  }

  function populateLists(detailEl, product) {
    const whatList = detailEl.querySelector('[data-product-what]');
    const howList = detailEl.querySelector('[data-product-how]');
    const featuresList = detailEl.querySelector('[data-product-features]');
    if (whatList) {
      whatList.innerHTML = '';
      (product.whatItDoes || []).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        whatList.appendChild(li);
      });
    }
    if (howList) {
      howList.innerHTML = '';
      (product.howItWorks || []).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        howList.appendChild(li);
      });
    }
    if (featuresList) {
      featuresList.innerHTML = '';
      (product.features || []).forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        featuresList.appendChild(li);
      });
    }
  }

  function populateSpecs(detailEl, product) {
    const table = detailEl.querySelector('[data-product-specs]');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    Object.entries(product.specs || {}).forEach(([key, value]) => {
      const row = document.createElement('tr');
      const label = document.createElement('th');
      label.scope = 'row';
      label.textContent = formatLabel(key);
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(label);
      row.appendChild(cell);
      tbody.appendChild(row);
    });
  }

  function populateFAQ(detailEl, product) {
    const faq = detailEl.querySelector('[data-product-faq]');
    if (!faq) return;
    faq.innerHTML = '';
    (product.faq || []).forEach((item) => {
      const article = document.createElement('article');
      article.className = 'faq-item';
      article.innerHTML = `<h3>${item.q}</h3><p>${item.a}</p>`;
      faq.appendChild(article);
    });
  }

  function formatLabel(value) {
    return value
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function initContactForm() {
    const form = document.querySelector('[data-contact-form]');
    if (!form) return;
    const statusEl = form.querySelector('[data-form-status]');
    const endpoint = form.getAttribute('action');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors(form);
      if (!validate(form)) {
        if (statusEl) {
          statusEl.textContent = 'Check the highlighted fields and try again.';
          statusEl.className = 'status-message error-text';
        }
        return;
      }
      const formData = new FormData(form);
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending…';
      }
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
          },
          body: formData,
        });
        if (response.ok) {
          if (statusEl) {
            statusEl.textContent = 'Thanks — we received your request and will be in touch soon.';
            statusEl.className = 'status-message success-text';
          }
          form.reset();
        } else {
          throw new Error('Request failed');
        }
      } catch (error) {
        if (statusEl) {
          statusEl.textContent = 'We could not send your message right now. Please email us directly or retry in a moment.';
          statusEl.className = 'status-message error-text';
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Submit';
        }
      }
    });
  }

  function clearErrors(form) {
    form.querySelectorAll('.error-text').forEach((el) => {
      if (el.dataset.dynamicError === 'true') {
        el.remove();
      } else {
        el.textContent = '';
      }
    });
    form.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
      field.setAttribute('aria-invalid', 'false');
    });
  }

  function validate(form) {
    let isValid = true;
    const requiredFields = form.querySelectorAll('[data-required="true"]');
    requiredFields.forEach((field) => {
      const input = field;
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
      const value = input.type === 'checkbox' ? input.checked : input.value.trim();
      if (!value) {
        isValid = false;
        flagError(input, 'This field is required.');
      } else if (input.type === 'email' && !isValidEmail(value)) {
        isValid = false;
        flagError(input, 'Enter a valid email address.');
      }
    });

    const emailField = form.querySelector('input[type="email"]');
    if (emailField && emailField.value && !isValidEmail(emailField.value.trim())) {
      isValid = false;
      flagError(emailField, 'Enter a valid email address.');
    }

    return isValid;
  }

  function flagError(input, message) {
    input.setAttribute('aria-invalid', 'true');
    const id = input.getAttribute('id');
    let errorEl = id ? document.getElementById(`${id}-error`) : null;
    if (!errorEl) {
      errorEl = document.createElement('p');
      errorEl.id = id ? `${id}-error` : undefined;
      errorEl.className = 'error-text';
      errorEl.dataset.dynamicError = 'true';
      input.insertAdjacentElement('afterend', errorEl);
    }
    errorEl.textContent = message;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const cfg = (window.SILENT_CONFIG && window.SILENT_CONFIG.voice) || {};
  if (cfg.enabled !== true) return; // DEFAULT OFF

  const anchor =
    document.getElementById('conscious-orb-container') ||
    document.querySelector('.hero, .hero-section, main') ||
    document.body;

  const resolveVoiceAsset = (input) => {
    const basePath = (window.SILENT_CONFIG && window.SILENT_CONFIG.site && window.SILENT_CONFIG.site.basePath) || '.';
    if (!basePath || basePath === '.' || basePath === '') return input;
    const trimmed = basePath.replace(/\/+$/, '');
    return `${trimmed}/${input}`.replace(/\/{2,}/g, '/');
  };

  const loadScript = (src, attr) => new Promise((res, rej) => {
    if (attr && document.querySelector(`script[${attr}]`)) return res();
    const s = document.createElement('script');
    const finalSrc = resolveVoiceAsset(src);
    s.src = finalSrc; if (attr) { const [k,v]=attr.split('='); s.setAttribute(k, v.replace(/"/g,'')); }
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });

  Promise.resolve()
    .then(() => loadScript('assets/js/vendor/webaudio-viz.js','data-webaudio-viz="true"'))
    .then(() => loadScript('assets/js/voice.js','data-voice-controller="true"'))
    .then(() => typeof window.initVoiceOverlay === 'function' && window.initVoiceOverlay(anchor, cfg))
    .catch(err => console.error('[voice overlay]', err));
});

(function () {
  'use strict';

  if (window.__silentVoiceLoaderInitialized) {
    return;
  }
  window.__silentVoiceLoaderInitialized = true;

  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function getBasePath() {
    var basePath = window.SILENT_CONFIG && window.SILENT_CONFIG.site && window.SILENT_CONFIG.site.basePath;
    if (typeof basePath !== 'string' || basePath.length === 0) {
      return '.';
    }
    var sanitized = basePath.replace(/\/+$/, '');
    return sanitized.length ? sanitized : '.';
  }

  function resolveAsset(path) {
    if (!path) return path;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith('//')) {
      return path;
    }
    var clean = path.replace(/^\/+/, '');
    var basePath = getBasePath();
    if (basePath === '.' || basePath === '') {
      return clean.startsWith('./') || clean.startsWith('../') ? clean : './' + clean;
    }
    return (basePath + '/' + clean).replace(/\/{2,}/g, '/');
  }

  function ensureStylesheet(href) {
    if (!href) return;
    var absoluteHref;
    try {
      absoluteHref = new URL(href, document.baseURI).href;
    } catch (error) {
      absoluteHref = href;
    }
    var existing = Array.from(document.styleSheets || []).some(function (sheet) {
      return sheet.href === absoluteHref;
    });
    if (existing) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (!src) {
        resolve();
        return;
      }
      var attrSelector = null;
      var isReady = null;
      if (src.indexOf('webaudio-viz') !== -1) {
        attrSelector = 'script[data-webaudio-viz="true"]';
        isReady = function () { return typeof window.WebAudioViz === 'function'; };
      } else if (src.indexOf('voice.js') !== -1) {
        attrSelector = 'script[data-voice-controller="true"]';
        isReady = function () { return typeof window.initVoiceOverlay === 'function'; };
      }
      if (attrSelector) {
        var attrScript = document.querySelector(attrSelector);
        if (attrScript) {
          if (isReady && isReady()) {
            resolve();
            return;
          }
          attrScript.addEventListener('load', function handleAttrLoad() {
            attrScript.setAttribute('data-loaded', 'true');
            resolve();
          }, { once: true });
          attrScript.addEventListener('error', function handleAttrError(error) {
            reject(error);
          }, { once: true });
          return;
        }
      }
      var existing = document.querySelector('script[data-dynamic-src="' + src + '"]');
      if (existing) {
        if (existing.hasAttribute('data-loaded')) {
          resolve();
        } else {
          existing.addEventListener('load', function () {
            resolve();
          });
          existing.addEventListener('error', function (error) {
            reject(error);
          });
        }
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.setAttribute('data-dynamic-src', src);
      if (src.indexOf('webaudio-viz') !== -1) {
        script.setAttribute('data-webaudio-viz', 'true');
      }
      if (src.indexOf('voice.js') !== -1) {
        script.setAttribute('data-voice-controller', 'true');
      }
      script.addEventListener('load', function () {
        script.setAttribute('data-loaded', 'true');
        resolve();
      });
      script.addEventListener('error', reject);
      document.head.appendChild(script);
    });
  }

  function injectHomeSchema() {
    if (document.getElementById('silent-home-org-schema')) {
      return;
    }
    var orb = document.getElementById('conscious-orb-container');
    if (!orb) {
      return;
    }
    var baseUrl = window.SILENT_CONFIG && window.SILENT_CONFIG.site && window.SILENT_CONFIG.site.baseUrl;
    if (typeof baseUrl !== 'string' || !baseUrl.length) {
      baseUrl = 'https://rheashopp.github.io/my-website';
    }
    var orgSchema = document.createElement('script');
    orgSchema.type = 'application/ld+json';
    orgSchema.id = 'silent-home-org-schema';
    orgSchema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Silent',
      url: baseUrl.replace(/\/$/, ''),
      logo: baseUrl.replace(/\/$/, '') + '/assets/img/og-cover.svg',
      sameAs: ['https://x.com/silent', 'https://www.linkedin.com/company/silent-superintelligence']
    });
    document.head.appendChild(orgSchema);

    var siteSchema = document.createElement('script');
    siteSchema.type = 'application/ld+json';
    siteSchema.id = 'silent-home-site-schema';
    siteSchema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      url: baseUrl.replace(/\/$/, '') + '/',
      name: document.title || 'Silent — Super Intelligence',
      potentialAction: {
        '@type': 'SearchAction',
        target: baseUrl.replace(/\/$/, '') + '/products/index.html?query={search_term_string}',
        'query-input': 'required name=search_term_string'
      }
    });
    document.head.appendChild(siteSchema);
  }

  function mountVoiceOverlay() {
    var voiceConfig = window.SILENT_CONFIG && window.SILENT_CONFIG.voice;
    if (!voiceConfig || voiceConfig.enabled !== true) {
      return;
    }
    if (window.__silentVoiceOverlayMounted) {
      return;
    }
    var anchor = document.getElementById('conscious-orb-container') ||
      document.querySelector('[data-voice-anchor]') ||
      document.querySelector('[data-hero]') ||
      document.body;

    ensureStylesheet(resolveAsset('assets/css/voice.css'));

    var scripts = [resolveAsset('assets/js/vendor/webaudio-viz.js'), resolveAsset('assets/js/voice.js')];

    scripts.reduce(function (promise, src) {
      return promise.then(function () {
        return loadScript(src);
      });
    }, Promise.resolve()).then(function () {
      if (typeof window.initVoiceOverlay === 'function') {
        window.__silentVoiceOverlayMounted = true;
        window.initVoiceOverlay(anchor, voiceConfig);
      }
    }).catch(function (error) {
      console.error('Voice overlay loader error', error);
    });
  }

  onReady(function () {
    try {
      injectHomeSchema();
    } catch (error) {
      console.warn('Schema injection error', error);
    }
    mountVoiceOverlay();
  });
})();
