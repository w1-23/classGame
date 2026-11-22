import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'docs', 'video');
const VIDEO_PATH = path.join(OUTPUT_DIR, 'classGame-runner-demo.webm');
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.wav': 'audio/wav'
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.resolve(ROOT, `.${pathname}`);
    if (!filePath.startsWith(ROOT + path.sep)) throw new Error('Path outside workspace');
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await mkdir(OUTPUT_DIR, { recursive: true });
const port = await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  recordVideo: {
    dir: OUTPUT_DIR,
    size: { width: 1366, height: 768 }
  }
});
const page = await context.newPage();
const video = page.video();

try {
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  await page.waitForSelector('[data-id="runner"]');
  await page.waitForTimeout(1200);
  await page.locator('[data-id="runner"]').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.runner));
  await page.waitForTimeout(1000);

  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.34));
  await page.waitForTimeout(1000);
  const first = await page.evaluate(() => window.__learningGameDebug.runner.state());
  const wrongLane = first.correctLane === 0 ? 1 : 0;
  await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), wrongLane);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.985));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    window.__learningGameDebug.runner.continue();
  });
  await page.waitForTimeout(900);

  const second = await page.evaluate(() => window.__learningGameDebug.runner.state());
  await page.evaluate(lane => {
    window.__learningGameDebug.runner.switchLane(lane);
    window.__learningGameDebug.runner.advanceToGate(.72);
  }, second.correctLane);
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__learningGameDebug.runner.pause());
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.__learningGameDebug.runner.resume());
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.985));
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.__learningGameDebug.runner.continue());
  await page.waitForTimeout(650);

  for (let question = 2; question < 10; question += 1) {
    const current = await page.evaluate(() => window.__learningGameDebug.runner.state());
    await page.evaluate(lane => {
      window.__learningGameDebug.runner.switchLane(lane);
      window.__learningGameDebug.runner.advanceToGate(.985);
      window.__learningGameDebug.runner.collision();
    }, current.correctLane);
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__learningGameDebug.runner.continue());
    await page.waitForTimeout(350);
  }
  await page.getByRole('heading', { name: '三道门跑酷完成' }).waitFor({ timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(3000);
} finally {
  await context.close();
  await video.saveAs(VIDEO_PATH);
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

console.log(`DEMO RECORDED: ${VIDEO_PATH}`);
