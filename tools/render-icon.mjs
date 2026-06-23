/**
 * Build assets/icon.png (1024×1024) for Devvit marketingAssets.
 *
 * Priority:
 *   1. CLI URL: npm run icon -- https://…
 *   2. assets/icon-source.{png,jpg,jpeg,webp}
 *   3. assets/icon.svg (fallback)
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(root, 'assets');
const pngPath = join(assetsDir, 'icon.png');
const clientIconPath = join(root, 'src', 'client', 'icon.png');
const svgPath = join(assetsDir, 'icon.svg');

const SOURCE_NAMES = ['icon-source.png', 'icon-source.jpg', 'icon-source.jpeg', 'icon-source.webp'];

async function loadInput() {
  const urlArg = process.argv[2];
  if (urlArg?.startsWith('http')) {
    const res = await fetch(urlArg);
    if (!res.ok) throw new Error(`Failed to fetch icon URL (${res.status})`);
    return { label: urlArg, bytes: Buffer.from(await res.arrayBuffer()) };
  }

  for (const name of SOURCE_NAMES) {
    const path = join(assetsDir, name);
    if (existsSync(path)) return { label: path, bytes: readFileSync(path) };
  }

  if (!existsSync(svgPath)) {
    throw new Error(
      'No icon input found. Save your Gemini image as assets/icon-source.png or pass a direct image URL: npm run icon -- https://…',
    );
  }
  return { label: svgPath, bytes: readFileSync(svgPath) };
}

const { label, bytes } = await loadInput();

async function toDevvitPng(input) {
  const attempts = [
    { resize: 1024, png: { compressionLevel: 9, effort: 10 } },
    { resize: 1024, png: { compressionLevel: 9, effort: 10, palette: true, colors: 256 } },
    { resize: 1024, png: { compressionLevel: 9, effort: 10, palette: true, colors: 128 } },
    { resize: 512, png: { compressionLevel: 9, effort: 10, palette: true, colors: 256 } },
  ];

  for (const attempt of attempts) {
    let img = sharp(input).resize(attempt.resize, attempt.resize, {
      fit: 'cover',
      position: 'centre',
    });
    if (attempt.resize !== 1024) {
      img = img.resize(1024, 1024, { kernel: sharp.kernel.lanczos3 });
    }
    const png = await img.png(attempt.png).toBuffer();
    if (png.length <= 500 * 1024) return png;
  }

  throw new Error('Could not compress icon under 500 KB. Try a simpler source image.');
}

const png = await toDevvitPng(bytes);

writeFileSync(pngPath, png);
copyFileSync(pngPath, clientIconPath);

const kb = (png.length / 1024).toFixed(1);
console.log(`Source: ${label}`);
console.log(`Wrote ${pngPath} (${kb} KB)`);
console.log(`Copied ${clientIconPath}`);
