# Silent — Super Intelligence Marketing Site

This repository powers the static marketing site for the Silent super intelligence platform. The site is GitHub Pages compatible and deploys at `https://rheashopp.github.io/my-website/` using only vanilla HTML, CSS, and JavaScript.

## Highlights

- **Products catalog** sourced from `data/products.json` with search, tag filters, and JSON-driven detail pages.
- **Research, about, chat, privacy, and terms pages** that follow the shared navigation shell without touching the homepage markup.
- **Contact form** wired to Formspree with inline validation and helper messaging.
- **Optional voice overlay** that can be enabled via `window.SILENT_CONFIG.voice` without editing `index.html`.
- **Serverless proxies** for Netlify Functions and Cloudflare Workers so `/api/llm` calls stay keyless in the browser.

## Project structure

```
/
├─ index.html (homepage — read only)
├─ about.html
├─ chat.html
├─ contact.html
├─ privacy.html
├─ research.html
├─ terms.html
├─ products/
│  ├─ index.html
│  ├─ si-orion.html
│  ├─ si-helix.html
│  └─ si-aegis.html
├─ assets/
│  ├─ css/style.css (homepage styles — read only)
│  ├─ css/voice.css
│  ├─ js/main.js
│  ├─ js/voice.js
│  └─ js/vendor/webaudio-viz.js
├─ data/products.json
├─ serverless/
│  ├─ netlify/functions/llm.js
│  ├─ cloudflare/worker.js
│  └─ README.md
├─ netlify.toml
├─ robots.txt
└─ sitemap.xml
```

## Base path configuration

GitHub Pages serves the site at `/my-website/`. Internal links and asset requests remain relative, but you can optionally set `window.SILENT_CONFIG.site` to help `main.js` rewrite links when embedding pages elsewhere:

```html
<script>
  window.SILENT_CONFIG = window.SILENT_CONFIG || {};
  window.SILENT_CONFIG.site = {
    basePath: '.',
    baseUrl: 'https://rheashopp.github.io/my-website'
  };
</script>
```

## Editing products

Product metadata lives in `data/products.json`. Each object includes:

- `slug` — used for filenames under `products/`.
- `name`, `tagline`, `summary`, `heroImage`.
- `category` — array of focus tags for filtering.
- `whatItDoes`, `howItWorks`, `features` — arrays rendered into lists.
- `specs` — key/value map displayed in a specs table.
- `faq` — array of `{ "q": "...", "a": "..." }` items.

Updating the JSON automatically refreshes the catalog grid and product detail pages on load.

## Contact form

The contact form posts to a Formspree placeholder endpoint: `https://formspree.io/f/YOUR_FORMSPREE_ID`. Replace `YOUR_FORMSPREE_ID` with your project ID in `contact.html` to receive submissions.

## Voice overlay

The voice orb overlay is off by default. To enable it on any page, append the following snippet near the end of the document (after including `assets/js/main.js`):

```html
<script>
  window.SILENT_CONFIG = window.SILENT_CONFIG || {};
  window.SILENT_CONFIG.voice = { enabled: true, provider: 'demo', ttsVoiceName: null };
</script>
```

When `provider` is set to `openai` or `gemini`, the overlay posts `{ messages: [...], sessionId }` to `/api/llm`. Keys must be supplied by one of the serverless proxies below. In browsers without speech-to-text support, the overlay automatically exposes a text fallback field.

## Serverless LLM proxies

See `serverless/README.md` for full deployment steps. At a glance:

- **Netlify Functions** — Deploy `serverless/netlify/functions/llm.js`, set `PROVIDER`, `OPENAI_API_KEY`, and/or `GEMINI_API_KEY`, and keep the included `netlify.toml` redirect. CORS is restricted to `https://rheashopp.github.io`.
- **Cloudflare Workers** — Publish `serverless/cloudflare/worker.js` with the same environment variables via `wrangler`, then attach a route for `/api/llm`. CORS is also limited to `https://rheashopp.github.io`.

## Deployment checklist

1. Confirm `robots.txt` references `https://rheashopp.github.io/my-website/sitemap.xml`.
2. Verify `sitemap.xml` lists every page with the GitHub Pages base URL.
3. Replace the Formspree placeholder ID when going live.
4. If you mirror the site to another domain, update canonical URLs and `window.SILENT_CONFIG.site.baseUrl` accordingly.
