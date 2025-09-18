#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');

const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath));
}

function readGitFile(relativePath, ref = 'HEAD') {
  try {
    return execSync(`git show ${ref}:${relativePath}`, { cwd: projectRoot });
  } catch (error) {
    return null;
  }
}

function formatBytes(bytes) {
  return `${bytes} bytes`;
}

function checkFileIntegrity(relativePath) {
  const currentContent = readFile(relativePath);
  const currentHash = sha256(currentContent);
  const currentSize = currentContent.length;
  const gitContent = readGitFile(relativePath);
  const gitHash = gitContent ? sha256(gitContent) : null;
  const gitSize = gitContent ? gitContent.length : null;
  const matches = gitHash === currentHash && gitSize === currentSize;
  console.log(`${relativePath} — ${formatBytes(currentSize)} — sha256 ${currentHash}`);
  if (gitContent) {
    console.log(`  matches HEAD (${formatBytes(gitSize)}, sha256 ${gitHash}): ${matches ? '✔' : '✘'}`);
  } else {
    console.log('  HEAD version not found (skipping comparison)');
  }
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

async function loadCanon() {
  const canonPath = path.join(projectRoot, 'assets/js/canon.js');
  const source = fs.readFileSync(canonPath, 'utf8');
  const moduleUrl = pathToFileURL(canonPath).href;
  const dataUrl =
    'data:text/javascript;base64,' +
    Buffer.from(`${source}\n//# sourceURL=${moduleUrl}`, 'utf8').toString('base64');
  return import(dataUrl);
}

function extractHead(html) {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  return match ? match[1] : '';
}

function headHasCanonAssets(headContent) {
  if (!headContent) return false;
  const tokens = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdn.tailwindcss.com',
    'three.min.js',
    'vanta@latest/dist/vanta.net.min.js',
    'font-awesome',
  ];
  const assetsPresent = tokens.every((token) => headContent.includes(token));
  const hasStyle = headContent.includes('assets/css/style.css');
  const hasShim = headContent.includes('assets/css/canon-shim.css');
  return assetsPresent && hasStyle && hasShim;
}

function bodyHasClasses(html, bodyClassCanon) {
  const match = html.match(/<body[^>]*class="([^"]*)"/i);
  if (!match) return false;
  const classes = new Set(match[1].split(/\s+/).filter(Boolean));
  return bodyClassCanon.split(/\s+/).every((cls) => classes.has(cls));
}

function headerMatches(html, headerCanon) {
  const navClassMatch = headerCanon.match(/<nav[^>]*class="([^"]*)"/i);
  if (!navClassMatch) return false;
  const navClass = navClassMatch[1];
  const navRegex = new RegExp(`<nav[^>]*class="${navClass.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}"`, 'i');
  return navRegex.test(html);
}

function footerMatches(html, footerCanon) {
  const footerClassMatch = footerCanon.match(/<footer[^>]*class="([^"]*)"/i);
  if (!footerClassMatch) return false;
  const footerClass = footerClassMatch[1];
  const footerRegex = new RegExp(`<footer[^>]*class="${footerClass.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}"`, 'i');
  return footerRegex.test(html);
}

function countAbsolutePaths(html) {
  const matches = html.match(/\s(?:href|src)="\//g);
  return matches ? matches.length : 0;
}

function buildProductDataUrlFor(pageUrl) {
  const base = new URL(pageUrl);
  const url = new URL('data/products.json', base);
  url.search = '';
  url.hash = '';
  let normalized = url.pathname.replace(/\/+/g, '/');
  while (normalized.includes('/products/data/')) {
    normalized = normalized.replace('/products/data/', '/data/');
  }
  url.pathname = normalized;
  return url.toString();
}

function productCount() {
  const json = JSON.parse(readFile('data/products.json').toString('utf8'));
  return Array.isArray(json.products) ? json.products.length : 0;
}

function smoothScrollGuarded() {
  const mainJs = readFile('assets/js/main.js').toString('utf8');
  return mainJs.includes("const isSamePageHash = href.startsWith('#');");
}

function removedPreventDefaultHandlers() {
  let previous = readGitFile('assets/js/main.js', 'HEAD^');
  if (!previous) {
    previous = readGitFile('assets/js/main.js', 'HEAD');
  }
  if (!previous) return [];
  const prevText = previous.toString('utf8');
  const currText = readFile('assets/js/main.js').toString('utf8');
  const pattern = /anchor\.addEventListener\('click'[\s\S]*?event\.preventDefault\(\);[\s\S]*?\n\s*}\);\s*\n\s*}\n/g;
  const prevMatches = prevText.match(pattern) || [];
  const currNormalized = normalizeWhitespace(currText);
  return prevMatches
    .map((snippet) => normalizeWhitespace(snippet))
    .filter((snippet) => !currNormalized.includes(snippet));
}

function summarizeSnippet(snippet) {
  if (!snippet) return '';
  const summary = snippet.length > 140 ? `${snippet.slice(0, 137)}...` : snippet;
  return summary;
}

(async () => {
  const canon = await loadCanon();
  console.log('Integrity checks');
  checkFileIntegrity('index.html');
  checkFileIntegrity('assets/css/style.css');
  console.log('');

  const pages = [
    'about.html',
    'contact.html',
    'research.html',
    'chat.html',
    'privacy.html',
    'terms.html',
    '404.html',
    'products/index.html',
    'products/si-orion.html',
    'products/si-helix.html',
    'products/si-aegis.html',
  ];

  console.log('Page checks');
  pages.forEach((page) => {
    const html = readFile(page).toString('utf8');
    const headContent = extractHead(html);
    const headOk = headHasCanonAssets(headContent);
    const bodyOk = bodyHasClasses(html, canon.BODY_CLASS_CANON);
    const headerOk = headerMatches(html, canon.HEADER_HTML);
    const footerOk = footerMatches(html, canon.FOOTER_HTML);
    const absoluteCount = countAbsolutePaths(html);
    console.log(`${page}`);
    console.log(`  Has HEAD_CANON assets (fonts + assets/css/style.css): ${headOk ? '✔' : '✘'}`);
    console.log(`  BODY contains BODY_CLASS_CANON: ${bodyOk ? '✔' : '✘'}`);
    console.log(`  HEADER contains HEADER_HTML signature: ${headerOk ? '✔' : '✘'}`);
    console.log(`  FOOTER contains FOOTER_HTML signature: ${footerOk ? '✔' : '✘'}`);
    console.log(`  href/src starting with "/": ${absoluteCount}`);
  });
  console.log('');

  console.log('Products data');
  const productUrl = buildProductDataUrlFor('https://rheashopp.github.io/my-website/products/index.html');
  console.log(`  Fetch URL: ${productUrl}`);
  console.log(`  Product entries: ${productCount()}`);
  console.log('');

  console.log('Navigation guards');
  console.log(`  Smooth scroll allows normal navigation: ${smoothScrollGuarded() ? '✔' : '✘'}`);
  const removed = removedPreventDefaultHandlers();
  if (removed.length) {
    console.log('  Removed preventDefault handlers that previously blocked nav:');
    removed.forEach((snippet) => {
      console.log(`    - ${summarizeSnippet(snippet)}`);
    });
  } else {
    console.log('  Removed preventDefault handlers that previously blocked nav: none');
  }
})();
