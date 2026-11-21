import { strict as assert } from 'node:assert';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { _electron as electron } from '@playwright/test';

const executablePath = path.resolve(
  process.argv[2] || 'release/win-unpacked/学习闯关乐园.exe'
);
const screenshotPath = path.resolve(
  process.argv[3] || 'docs/screenshots/packaged-desktop.png'
);

await mkdir(path.dirname(screenshotPath), { recursive: true });

const app = await electron.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu-sandbox']
});

try {
  const page = await app.firstWindow({ timeout: 30000 });
  const remoteRequests = [];
  page.on('request', request => {
    const url = request.url();
    if (!/^(file|data|blob|devtools):/.test(url)) remoteRequests.push(url);
  });
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    window.unmaximize();
    window.setSize(1366, 768);
    window.center();
  });
  await page.waitForSelector('[data-id="runner"]', { timeout: 30000 });
  await page.locator('[data-id="runner"]').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.runner), null, {
    timeout: 20000
  });

  const state = await page.evaluate(() => window.__learningGameDebug.runner.state());
  assert.equal(state.total, 10, 'runner must load ten local questions');
  assert.equal(state.options.length, 3, 'runner must expose three perspective gates');
  await page.evaluate(lane => {
    window.__learningGameDebug.runner.switchLane(lane);
    window.__learningGameDebug.runner.collision();
  }, state.correctLane);
  const resolved = await page.evaluate(() => window.__learningGameDebug.runner.state());
  assert.equal(resolved.phase, 'resolved');
  assert.equal(resolved.score, 1);
  assert.ok(resolved.sounds.includes('sfx-correct'));
  assert.ok(!resolved.sounds.includes('sfx-wrong'));
  await page.waitForTimeout(650);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  for (let question = 1; question < 10; question += 1) {
    await page.evaluate(() => window.__learningGameDebug.runner.continue());
    const next = await page.evaluate(() => window.__learningGameDebug.runner.state());
    await page.evaluate(lane => {
      window.__learningGameDebug.runner.switchLane(lane);
      window.__learningGameDebug.runner.collision();
    }, next.correctLane);
    const completed = await page.evaluate(() => window.__learningGameDebug.runner.state());
    assert.equal(completed.score, question + 1);
    assert.equal(completed.phase, 'resolved');
  }
  await page.evaluate(() => window.__learningGameDebug.runner.continue());
  await page.getByRole('heading', { name: '三道门跑酷完成' }).waitFor({ timeout: 20000 });
  assert.deepEqual(remoteRequests, [], `unexpected remote requests: ${remoteRequests.join(', ')}`);
  console.log(`PACKAGED APP VERIFIED: ${executablePath}`);
  console.log(`Remote requests: 0`);
  console.log(`Completed questions: 10/10`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  await app.close();
}
