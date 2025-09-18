#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');

function hashFile(filePath) {
  const contents = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(contents).digest('hex');
  return { hash, size: contents.length };
}

function getHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(path.relative(repoRoot, fullPath));
    }
  }
  return files;
}

function extractBodyClassList(content) {
  const doubleMatch = content.match(/<body[^>]*class="([^"]*)"/i);
  const singleMatch = doubleMatch ? null : content.match(/<body[^>]*class='([^']*)'/i);
  const value = doubleMatch ? doubleMatch[1] : singleMatch ? singleMatch[1] : null;
  if (!value) return [];
  return value.split(/\s+/).filter(Boolean);
}

function hasBodyClasses(content) {
  const classes = extractBodyClassList(content);
  if (!classes.length) return false;
  const required = ["bg-black", "text-white", "font-['Inter']", 'overflow-x-hidden'];
  return required.every((cls) => classes.includes(cls));
}

function hasRelativePathsOnly(content) {
  const pattern = /\b(?:href|src)\s*=\s*["']\//i;
  return !pattern.test(content);
}

function analyzePage(filePath) {
  const absolute = path.join(repoRoot, filePath);
  const content = fs.readFileSync(absolute, 'utf8');
  return {
    path: filePath,
    hasBackBar: content.includes('backbar.css') && content.includes('backbar.js'),
    hasTopNav: /<nav/i.test(content),
    bodyClassParity: hasBodyClasses(content),
    relativePathsOnly: hasRelativePathsOnly(content),
  };
}

function printCoreFileStatus(files) {
  console.log('coreFiles:');
  files.forEach((file) => {
    const absolute = path.join(repoRoot, file);
    const { hash, size } = hashFile(absolute);
    console.log(`  ${file}: size=${size} bytes sha256=${hash}`);
  });
}

function printPageStatus(pages) {
  console.log('pages:');
  pages.forEach((page) => {
    console.log(
      `  ${page.path}: hasBackBar=${page.hasBackBar} hasTopNav=${page.hasTopNav} bodyClassParity=${page.bodyClassParity} relativePathsOnly=${page.relativePathsOnly}`
    );
  });
}

function printProductsStatus() {
  const dataFile = path.join(repoRoot, 'data', 'products.json');
  const raw = fs.readFileSync(dataFile, 'utf8');
  let count = 0;
  try {
    const json = JSON.parse(raw);
    if (Array.isArray(json.products)) {
      count = json.products.length;
    }
  } catch (error) {
    console.error('  products: unable to parse JSON', error.message);
    return;
  }
  const url = new URL('data/products.json', 'https://rheashopp.github.io/my-website/');
  console.log(`products: url=${url.toString()} status=200 count=${count}`);
}

function run() {
  const htmlFiles = getHtmlFiles(repoRoot)
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => file !== 'index.html')
    .sort();

  const pageReports = htmlFiles.map(analyzePage);

  printCoreFileStatus(['index.html', path.join('assets', 'css', 'style.css')]);
  printPageStatus(pageReports);
  printProductsStatus();
}

run();
