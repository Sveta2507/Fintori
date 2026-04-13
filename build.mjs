#!/usr/bin/env node
/**
 * build.mjs — Fintori production build script
 *
 * Usage:
 *   node build.mjs          — build once
 *   node build.mjs --watch  — rebuild on every app.js save
 *
 * Deploy: upload the CONTENTS of dist/ to your server, not the root folder.
 * Dev:    open app.html from the root folder (uses readable app.js directly).
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync, statSync, watch } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const require  = createRequire(import.meta.url);
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SRC  = join(ROOT, 'app.js');
const DIST = join(ROOT, 'dist');
const OUT  = join(DIST, 'app.js');

const STATIC_FILES = ['app.html', 'index.html', 'app.css', 'index.css'];

// Strong obfuscation without the options that crash on large files.
// See comments for why each option is on or off.
const OBF_OPTIONS = {
  compact:                     true,       // Strip whitespace
  identifierNamesGenerator:    'mangled',  // Rename vars: a, b, c, aa, ab...
  stringArray:                 true,       // Extract all strings into hidden array
  stringArrayEncoding:         ['base64'], // Encode array in base64
  stringArrayRotate:           true,       // Rotate array order at runtime
  stringArrayShuffle:          true,       // Shuffle array order at runtime
  stringArrayWrappersCount:    2,          // Add wrapper layers over the array
  stringArrayWrappersType:     'function',
  stringArrayCallsTransform:   true,       // Randomise how the array is called
  stringArrayIndexShift:       true,       // Shift array indices randomly
  simplify:                    true,       // Simplify boolean/ternary expressions
  transformObjectKeys:         false,      // Off — breaks dynamic key access
  splitStrings:                false,      // Off — causes syntax errors on large files
  numbersToExpressions:        false,      // Off — crashes on files > ~50 KB
  deadCodeInjection:           false,      // Off — triples file size
  controlFlowFlattening:       false,      // Off — 2x slowdown + huge size increase
  selfDefending:               false,      // Off — breaks some browsers
  debugProtection:             false,      // Off — breaks your own DevTools too
  disableConsoleOutput:        false,      // Off — you need console.error etc.
  renameGlobals:               false,      // Off — breaks global function calls from HTML
  target:                      'browser',
};

function ensureDist() {
  if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
}

function buildJs() {
  const src    = readFileSync(SRC, 'utf8');
  const origKB = (src.length / 1024).toFixed(1);
  console.log(`[build] Obfuscating app.js (${origKB} KB)...`);
  const start  = Date.now();
  const result = JavaScriptObfuscator.obfuscate(src, OBF_OPTIONS);
  const obf    = result.getObfuscatedCode();
  writeFileSync(OUT, obf, 'utf8');
  const outKB  = (obf.length / 1024).toFixed(1);
  const ratio  = ((obf.length / src.length) * 100).toFixed(0);
  console.log(`[build] Done in ${Date.now() - start}ms -> dist/app.js ${outKB} KB (${ratio}% of original)`);
}

function copyStatic() {
  STATIC_FILES.forEach(file => {
    const s = join(ROOT, file), d = join(DIST, file);
    if (existsSync(s)) { copyFileSync(s, d); console.log(`[build] Copied  ${file} -> dist/`); }
    else console.warn(`[build] WARN: ${file} not found, skipping`);
  });
  ['css', 'images'].forEach(dir => {
    const srcDir = join(ROOT, dir), destDir = join(DIST, dir);
    if (!existsSync(srcDir)) return;
    mkdirSync(destDir, { recursive: true });
    readdirSync(srcDir).forEach(file => {
      const s = join(srcDir, file), d = join(destDir, file);
      if (statSync(s).isFile()) { copyFileSync(s, d); console.log(`[build] Copied  ${dir}/${file} -> dist/${dir}/`); }
    });
  });
}

function build() {
  ensureDist();
  buildJs();
  copyStatic();
  console.log('[build] Build complete. Deploy the contents of dist/');
}

const watchMode = process.argv.includes('--watch');
build();
if (watchMode) {
  console.log('[build] Watching app.js... (Ctrl+C to stop)');
  watch(SRC, () => { try { buildJs(); } catch(e) { console.error('[build] Error:', e.message); } });
}
