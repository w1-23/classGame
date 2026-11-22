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
  await page.waitForTimeout(1700);

  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.31));
  await page.waitForTimeout(850);
  await page.screenshot({ path: 'docs/screenshots/runner-demo-start.png' });

  await page.evaluate(() => window.__learningGameDebug.runner.pause());
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__learningGameDebug.runner.resume());
  await page.waitForTimeout(500);

  const first = await page.evaluate(() => window.__learningGameDebug.runner.state());
  const wrongLane = first.correctLane === 0 ? 1 : 0;
  await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), wrongLane);
  await page.waitForTimeout(260);
  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.985));
  await page.waitForTimeout(280);
  await page.screenshot({ path: 'docs/screenshots/runner-demo-wrong.png' });
  await page.waitForTimeout(2100);

  const second = await page.evaluate(() => window.__learningGameDebug.runner.state());
  await page.evaluate(lane => {
    window.__learningGameDebug.runner.switchLane(lane);
    window.__learningGameDebug.runner.advanceToGate(.82);
  }, second.correctLane);
  await page.waitForTimeout(850);
  await page.evaluate(() => window.__learningGameDebug.runner.collision());
  await page.waitForTimeout(320);
  await page.screenshot({ path: 'docs/screenshots/runner-demo-correct.png' });
  await page.waitForTimeout(900);

  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.14));
  await page.waitForTimeout(320);
  const coinState = await page.evaluate(() => window.__learningGameDebug.runner.state());
  const coin = coinState.geometry.coins[0];
  if (coin) {
    await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), coin.lane);
    await page.waitForTimeout(240);
    await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.54));
    await page.waitForTimeout(850);
  }

  for (let guard = 0; guard < 12; guard += 1) {
    const current = await page.evaluate(() => window.__learningGameDebug.runner.state());
    if (current.phase === 'complete') break;
    if (current.phase === 'feedback') {
      await page.evaluate(() => window.__learningGameDebug.runner.continue());
      await page.waitForTimeout(180);
      continue;
    }
    await page.evaluate(lane => {
      window.__learningGameDebug.runner.switchLane(lane);
      window.__learningGameDebug.runner.collision();
    }, current.correctLane);
    await page.waitForTimeout(220);
    await page.evaluate(() => window.__learningGameDebug.runner.continue());
    await page.waitForTimeout(180);
  }

  await page.locator('#runner-prompt').filter({ hasText: '抵达终点' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'docs/screenshots/runner-demo-complete.png' });
  await page.locator('#runner-right').click();
  await page.getByRole('heading', { name: '森林寻宝记完成' }).waitFor({ timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2600);
} finally {
  await context.close();
  await video.saveAs(VIDEO_PATH);
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

console.log(`DEMO RECORDED: ${VIDEO_PATH}`);
