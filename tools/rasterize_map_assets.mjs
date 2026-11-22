import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'assets', 'map-art', 'vector');
const OUTPUT = path.join(ROOT, 'assets', 'map-art', 'raster');

const assets = [
  { id: 'tree-round', width: 128, height: 160 },
  { id: 'tree-slim', width: 128, height: 160 },
  { id: 'tree-autumn', width: 128, height: 160 },
  { id: 'pine', width: 128, height: 160 },
  { id: 'pine-snow', width: 128, height: 160 }
];

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 256, height: 320 } });

try {
  for (const asset of assets) {
    const svg = await readFile(path.join(SOURCE, `${asset.id}.svg`), 'utf8');
    await page.setViewportSize({ width: asset.width * 2, height: asset.height * 2 });
    await page.setContent(`<!doctype html>
      <style>
        html, body { margin: 0; width: 100%; height: 100%; background: transparent; }
        svg { display: block; width: 100% !important; height: 100% !important; }
      </style>
      ${svg}`);
    await page.screenshot({
      path: path.join(OUTPUT, `${asset.id}@2x.png`),
      omitBackground: true,
      animations: 'disabled'
    });
  }
} finally {
  await browser.close();
}

console.log(`RASTERIZED ${assets.length} MAP ASSETS -> ${OUTPUT}`);
