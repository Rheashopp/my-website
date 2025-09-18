# Silent — Super Intelligence

Future-forward marketing site for Silent, a responsible super intelligence platform. The site is built with plain HTML, CSS, and vanilla JavaScript so it can be deployed anywhere static hosting is supported (including GitHub Pages, Netlify, or Cloudflare Pages).

![Voice orb demo](assets/img/voice/voice-orb-demo.svg)

## Features

- **Glowing hero voice orb** with press-to-talk controls, Web Speech API demo mode, and keyboard support.
- **Mobile-responsive layout** with glassy accents, sticky navigation, and accessible focus states.
- **Products catalog** sourced from `data/products.json` with search, tag filters, and detail pages hydrated from the JSON.
- **SEO-ready pages** including canonical links, social cards, sitemap, robots file, and Organization/Product JSON-LD.
- **Contact form** wired to Formspree with inline validation, success/error messaging, and accessibility semantics.
- **Serverless LLM proxies** for Netlify Functions and Cloudflare Workers so API keys remain server-side.

## Project structure

```
/
├─ index.html
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
│  ├─ css/style.css
│  ├─ css/voice.css
│  ├─ js/main.js
│  ├─ js/voice.js
│  ├─ js/vendor/webaudio-viz.js
│  ├─ img/
│  └─ icons/
├─ data/products.json
├─ serverless/
│  ├─ netlify/functions/llm.js
│  ├─ cloudflare/worker.js
│  └─ README.md
├─ sitemap.xml
├─ robots.txt
└─ 404.html
```

## Local development

1. Launch a static server from the project root:

   ```bash
   python -m http.server 8000
   ```

2. Visit `http://localhost:8000/index.html` in your browser.

### Base path configuration

If you deploy the site to a subdirectory (e.g., GitHub Pages at `/my-website`), set the base path once before the closing `</head>` on each page or in a small inline script:

```html
<script>
  window.SILENT_CONFIG = {
    site: {
      basePath: '/my-website',
      baseUrl: 'https://rheashopp.github.io/my-website'
    }
  };
</script>
```

`main.js` automatically rewrites internal links when `basePath` is defined.

## Editing products

Product metadata lives in `data/products.json`. Each product requires:

- `slug` — used for the detail page filename (`products/<slug>.html`).
- `name`, `tagline`, `summary`, `heroImage` — hero card content.
- `category` — array of tags used for catalog filtering.
- `whatItDoes`, `howItWorks`, `features` — arrays rendered into detail lists.
- `specs` — key/value map rendered into a specs table.
- `faq` — array of `{ "q": "...", "a": "..." }` entries.

Update the JSON and the catalog/detail pages will hydrate automatically on load.

## Contact form

Replace the placeholder Formspree endpoint in `contact.html`:

```html
<form action="https://formspree.io/f/YOUR_FORMSPREE_ID" ...>
```

After updating the endpoint, submissions will be sent directly to your Formspree inbox.

## Voice orb configuration

The global `window.SILENT_CONFIG.voice` object (set in `assets/js/main.js`) controls the voice experience:

- `provider`: `demo` (default), `openai`, or `gemini`.
- `ttsVoiceName`: optional speech synthesis voice name.

Example override:

```html
<script>
  window.SILENT_CONFIG = {
    site: { basePath: '', baseUrl: 'https://silent.superintelligence' },
    voice: { provider: 'openai', ttsVoiceName: 'Samantha' }
  };
</script>
```

When `provider` is `openai` or `gemini`, the browser posts to `/api/llm`, which should be routed to one of the serverless proxies below.

## Assets

- All imagery in this repository uses lightweight SVG placeholders so the PR stays text-only.
- Raster social previews or product artwork can be added in a follow-up commit outside Codex once final designs are approved.

## Serverless LLM proxies

### Netlify Functions

- File: `serverless/netlify/functions/llm.js`
- Environment variables: `PROVIDER` (`openai`|`gemini`), `OPENAI_API_KEY`, `OPENAI_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
- Add a redirect in `netlify.toml`:

  ```toml
  [[redirects]]
  from = "/api/llm"
  to = "/.netlify/functions/llm"
  status = 200
  force = true
  ```

### Cloudflare Workers

- File: `serverless/cloudflare/worker.js`
- Configure secrets with `wrangler secret put OPENAI_API_KEY`, etc.
- Add a route in `wrangler.toml` (example):

  ```toml
  routes = [
    { pattern = "silent.superintelligence/api/llm", zone_name = "silent.superintelligence" }
  ]
  ```

Both implementations enforce CORS, short timeouts, and never log raw prompts.

## Deployment checklist

- Update canonical URLs in each HTML file if you deploy to a different domain.
- Ensure `robots.txt` and `sitemap.xml` reference the production domain.
- Replace the placeholder Formspree endpoint.
- Set `window.SILENT_CONFIG.site.baseUrl` to your production URL for accurate metadata.
- Configure a serverless proxy and set `window.SILENT_CONFIG.voice.provider` to `openai` or `gemini` once keys are available.

## Credits

Designed and built by the Silent team to highlight a calm, responsible approach to super intelligence.
