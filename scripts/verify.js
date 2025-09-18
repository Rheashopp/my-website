#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const homepageFiles = ['index.html', 'assets/css/style.css'];
const nonHomePages = [
  '404.html',
  'about.html',
  'chat.html',
  'contact.html',
  'privacy.html',
  'research.html',
  'terms.html',
  'products/index.html',
  'products/si-aegis.html',
  'products/si-helix.html',
  'products/si-orion.html',
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function fileInfo(file) {
  const absolute = path.join(root, file);
  const currentBuffer = fs.readFileSync(absolute);
  const currentHash = crypto.createHash('sha256').update(currentBuffer).digest('hex');
  const currentBytes = currentBuffer.length;
  let baselineBuffer = null;
  try {
    const baselineText = execSync(`git show HEAD:${file}`, { cwd: root, encoding: 'utf8' });
    baselineBuffer = Buffer.from(baselineText, 'utf8');
  } catch (error) {
    baselineBuffer = currentBuffer;
  }
  const baselineHash = crypto.createHash('sha256').update(baselineBuffer).digest('hex');
  const baselineBytes = baselineBuffer.length;
  return {
    file,
    currentHash,
    currentBytes,
    baselineHash,
    baselineBytes,
    matches: currentHash === baselineHash && currentBytes === baselineBytes,
  };
}

function auditLinks(file) {
  const content = read(file);
  const offenders = [];
  const patterns = [
    /(href)\s*=\s*"\/(?!\/)([^"]*)"/g,
    /(href)\s*=\s*'\/(?!\/)([^']*)'/g,
    /(src)\s*=\s*"\/(?!\/)([^"]*)"/g,
    /(src)\s*=\s*'\/(?!\/)([^']*)'/g,
  ];
  patterns.forEach((regex) => {
    let match;
    while ((match = regex.exec(content)) !== null) {
      offenders.push({
        attribute: match[1],
        value: `/${match[2]}`,
        index: match.index,
      });
    }
  });
  return offenders;
}

function hasBodyClass(content, classes) {
  const bodyMatch = content.match(/<body[^>]*class="([^"]*)"/i);
  if (!bodyMatch) return false;
  const bodyClasses = bodyMatch[1].split(/\s+/);
  return classes.every((cls) => bodyClasses.includes(cls));
}

function checkHeadParity(file) {
  const content = read(file);
  const needsClasses = ["bg-black", "text-white", "font-['Inter']", 'overflow-x-hidden'];
  const hasStyle = content.includes('assets/css/style.css');
  const hasScript = content.includes('assets/js/main.js');
  const hasBody = hasBodyClass(content, needsClasses);
  const hasHeader = content.includes('<!-- NAVBAR -->') && content.includes('aria-label="Silent home"');
  const hasFooter = content.includes('<!-- FOOTER -->') && content.includes('© 2023 Super Intelligence');
  const hasTitle = /<title>[^<]+<\/title>/i.test(content);
  const hasDescription = /<meta\s+name="description"/i.test(content);
  return {
    file,
    hasStyle,
    hasScript,
    hasBody,
    hasHeader,
    hasFooter,
    hasTitle,
    hasDescription,
    ok: hasStyle && hasScript && hasBody && hasHeader && hasFooter && hasTitle && hasDescription,
  };
}

function main() {
  console.log('=== Silent Site Verification ===');

  console.log('\nHomepage integrity:');
  homepageFiles.forEach((file) => {
    const info = fileInfo(file);
    console.log(`- ${file}: current ${info.currentHash} (${info.currentBytes} bytes) | baseline ${info.baselineHash} (${info.baselineBytes} bytes) => ${info.matches ? 'MATCH' : 'DIFF'}`);
  });

  console.log('\nLink audit (leading / references):');
  let totalOffenders = 0;
  const linkIssues = [];
  nonHomePages.forEach((file) => {
    const offenders = auditLinks(file);
    totalOffenders += offenders.length;
    if (offenders.length) {
      linkIssues.push({ file, offenders });
    }
  });
  console.log(`- Total offending references: ${totalOffenders}`);
  if (linkIssues.length) {
    linkIssues.forEach(({ file, offenders }) => {
      console.log(`  • ${file}`);
      offenders.forEach((off) => {
        console.log(`    - ${off.attribute}="${off.value}" at index ${off.index}`);
      });
    });
  }

  console.log('\nHead/header/footer parity:');
  nonHomePages.forEach((file) => {
    const result = checkHeadParity(file);
    const flags = [];
    if (!result.hasStyle) flags.push('style.css missing');
    if (!result.hasScript) flags.push('main.js missing');
    if (!result.hasBody) flags.push('body class mismatch');
    if (!result.hasHeader) flags.push('header mismatch');
    if (!result.hasFooter) flags.push('footer mismatch');
    if (!result.hasTitle) flags.push('title missing');
    if (!result.hasDescription) flags.push('description missing');
    console.log(`- ${file}: ${result.ok ? 'OK' : flags.join(', ')}`);
  });

  console.log('\nActive nav script check:');
  const mainJs = read('assets/js/main.js');
  const activeNavOk = /window\.location\.pathname/.test(mainJs) && /aria-current/.test(mainJs);
  console.log(`- location.pathname usage detected: ${activeNavOk ? 'YES' : 'NO'}`);

  console.log('\nVoice overlay assets:');
  const voiceJs = read('assets/js/voice.js');
  const voiceCss = read('assets/css/voice.css');
  const hasLoaderSnippet = /\[voice overlay\]/.test(mainJs) && /cfg\.enabled !== true/.test(mainJs);
  const defaultsOff = /enabled:\s*false/.test(voiceJs);
  const cssNamespaced = /\.voice-overlay /.test(voiceCss);
  console.log(`- voice.css present & namespaced: ${cssNamespaced ? 'YES' : 'NO'}`);
  console.log(`- voice.js default disabled: ${defaultsOff ? 'YES' : 'NO'}`);
  console.log(`- Loader snippet present: ${hasLoaderSnippet ? 'YES' : 'NO'}`);
}

main();
