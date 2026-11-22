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
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      console.error(`[renderer:${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', error => {
    console.error(`[pageerror] ${error.stack || error.message}`);
  });
  page.on('requestfailed', request => {
    console.error(
      `[requestfailed] ${request.url()} ${request.failure()?.errorText || 'unknown error'}`
    );
  });
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
  await page.locator('.adventure-page').waitFor({ timeout: 20000 });
  await page.locator('.map-node').first().click();
  await page.locator('#map-start').click();
  try {
    await page.waitForFunction(() => Boolean(window.__learningGameDebug?.runner), null, {
      timeout: 20000
    });
  } catch (error) {
    await page.screenshot({
      path: path.resolve('docs/screenshots/packaged-0.5.0-failure.png'),
      fullPage: true
    });
    const debugState = await page.evaluate(() => ({
      title: document.title,
      readyState: document.readyState,
      bodyText: document.body.innerText.slice(0, 2000),
      activeView: document.querySelector('.view.active')?.id || '',
      runnerShell: Boolean(document.querySelector('.race-shell')),
      debugKeys: Object.keys(window.__learningGameDebug || {}),
      phaserVersion: window.Phaser?.VERSION || ''
    }));
    console.error(`PACKAGED DEBUG STATE: ${JSON.stringify(debugState, null, 2)}`);
    throw error;
  }

  const state = await page.evaluate(() => window.__learningGameDebug.runner.state());
  assert.ok(state.total >= 6, 'runner must load the selected level question set');
  assert.equal(state.options.length, 3, 'runner must expose three perspective gates');
  await page.evaluate(lane => {
    window.__learningGameDebug.runner.switchLane(lane);
    window.__learningGameDebug.runner.collision();
  }, state.correctLane);
  const resolved = await page.evaluate(() => window.__learningGameDebug.runner.state());
  assert.equal(resolved.phase, 'feedback');
  assert.equal(resolved.score, 1);
  assert.ok(resolved.sounds.includes('sfx-correct'));
  assert.ok(!resolved.sounds.includes('sfx-wrong'));
  await page.waitForTimeout(650);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  for (let question = 1; question < state.total; question += 1) {
    await page.evaluate(() => window.__learningGameDebug.runner.continue());
    const next = await page.evaluate(() => window.__learningGameDebug.runner.state());
    await page.evaluate(lane => {
      window.__learningGameDebug.runner.switchLane(lane);
      window.__learningGameDebug.runner.collision();
    }, next.correctLane);
    const completed = await page.evaluate(() => window.__learningGameDebug.runner.state());
    assert.equal(completed.score, question + 1);
    assert.equal(completed.phase, 'feedback');
  }
  await page.evaluate(() => window.__learningGameDebug.runner.continue());
  await page.locator('#runner-prompt').filter({ hasText: '抵达终点' }).waitFor({ timeout: 20000 });
  await page.locator('#runner-right').click();
  await page.getByRole('heading', { name: '森林寻宝记完成' }).waitFor({ timeout: 20000 });
  assert.deepEqual(remoteRequests, [], `unexpected remote requests: ${remoteRequests.join(', ')}`);
  console.log(`PACKAGED APP VERIFIED: ${executablePath}`);
  console.log(`Remote requests: 0`);
  console.log(`Completed questions: ${state.total}/${state.total}`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  await app.close();
}
