/**
 * Headless viewport trap verification at phone sizes.
 * Run: npm run verify:viewport
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const preview = resolve(root, 'tools/preview/viewport-check.html');

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = BROWSERS.find(existsSync);

if (!browser) {
  console.warn('No Edge/Chrome — skip viewport verify.');
  process.exit(0);
}

const sizes = [
  { name: 'iPhone SE', w: 320, h: 568 },
  { name: 'iPhone 14', w: 390, h: 844 },
  { name: 'short webview', w: 360, h: 480 },
];

const url = `file:///${preview.replace(/\\/g, '/')}`;
let failed = false;

for (const { name, w, h } of sizes) {
  const res = spawnSync(
    browser,
    [
      '--headless',
      '--disable-gpu',
      `--window-size=${w},${h}`,
      '--virtual-time-budget=5000',
      '--dump-dom',
      url,
    ],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
  );

  const dom = res.stdout || '';
  const titleMatch = dom.match(/TRAP_METRICS:(\{[^<]+\})/);
  if (!titleMatch) {
    console.error(`[FAIL] ${name}: could not read metrics from headless DOM`);
    failed = true;
    continue;
  }

  const m = JSON.parse(titleMatch[1]);
  const noOverflow = m.scrollW <= m.innerW + 2 && m.scrollH <= m.innerH + 2;
  const tilesOk = m.tileCount === 25;
  const overflowOk = m.bodyOverflow === 'hidden' && m.appOverflow === 'hidden';
  const noOverlay = (m.overlayCount ?? 0) === 0;

  const pass = noOverflow && tilesOk && overflowOk && noOverlay;
  console.log(
    `[${pass ? 'PASS' : 'FAIL'}] ${name} (${w}×${h}): ` +
      `scroll ${m.scrollW}×${m.scrollH} vs ${m.innerW}×${m.innerH}, ` +
      `tiles=${m.tileCount}, overlays=${m.overlayCount ?? 0}, overflow=${m.bodyOverflow}/${m.appOverflow}`,
  );
  if (!pass) failed = true;
}

process.exit(failed ? 1 : 0);
