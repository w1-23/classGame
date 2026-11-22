import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const screenshots = 'docs/screenshots';
const viewports = [
  [1920, 1080],
  [1366, 768],
  [1280, 800],
  [1175, 803],
  [1024, 768],
  [390, 844]
];

async function openRunner(page) {
  await page.goto('/index.html');
  await page.locator('[data-id="runner"]').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.runner));
}

async function state(page) {
  return page.evaluate(() => window.__learningGameDebug.runner.state());
}

async function capturePage(page, path) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path, fullPage: false });
}

async function layoutMetrics(page) {
  return page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    const canvas = document.querySelector('#runner-stage canvas')?.getBoundingClientRect();
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      headerDisplay: getComputedStyle(document.querySelector('header')).display,
      hud: rect('.runner-hud'),
      stage: rect('#runner-stage'),
      controls: rect('.race-controls'),
      canvas: canvas ? { width: canvas.width, height: canvas.height, top: canvas.top, bottom: canvas.bottom } : null
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('home keeps a calm visual baseline', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/index.html');
  await expect(page.getByRole('heading', { name: '离线学习闯关乐园' })).toBeVisible();
  await expect(page.locator('header')).toBeVisible();
  await capturePage(page, `${screenshots}/home-1366x768.png`);
});

test('runner fills every target viewport without clipping or page scrolling', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await openRunner(page);

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.66));
    await page.waitForTimeout(180);
    const metrics = await layoutMetrics(page);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.headerDisplay).toBe('none');
    expect(metrics.hud.height).toBeLessThanOrEqual(76);
    expect(metrics.controls.height).toBeLessThanOrEqual(64);
    for (const key of ['hud', 'stage', 'controls']) {
      expect(metrics[key]).not.toBeNull();
      expect(metrics[key].left).toBeGreaterThanOrEqual(-1);
      expect(metrics[key].top).toBeGreaterThanOrEqual(-1);
      expect(metrics[key].right).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(metrics[key].bottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
    }
    expect(metrics.canvas.width).toBeGreaterThan(300);
    expect(metrics.canvas.height).toBeGreaterThan(350);

    const current = await state(page);
    expect(current.options).toHaveLength(3);
    expect(current.geometry.player.heightRatio).toBeGreaterThanOrEqual(.24);
    expect(current.geometry.player.heightRatio).toBeLessThanOrEqual(.26);
    expect(current.geometry.gates).toHaveLength(3);
    for (const gate of current.geometry.gates) {
      expect(gate.x - gate.width / 2).toBeGreaterThanOrEqual(-1);
      expect(gate.x + gate.width / 2).toBeLessThanOrEqual(current.geometry.width + 1);
      expect(gate.y).toBeLessThanOrEqual(current.geometry.height + 1);
    }
    expect(await page.locator('#runner-answer-legend').count()).toBe(0);
    await expect(page.locator('#runner-prompt')).toHaveText(current.prompt);
    await capturePage(page, `${screenshots}/runner-${width}x${height}.png`);
  }
});

test('gates share the perspective lanes and grow into a restrained scene', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);

  const snapshots = [];
  for (const [name, progress] of [['far', .08], ['middle', .58], ['near', .9]]) {
    await page.evaluate(value => window.__learningGameDebug.runner.advanceToGate(value), progress);
    await page.waitForTimeout(120);
    const current = await state(page);
    expect(current.geometry.gates).toHaveLength(3);
    for (let index = 1; index < current.geometry.gates.length; index += 1) {
      expect(current.geometry.gates[index].x).toBeGreaterThan(current.geometry.gates[index - 1].x);
    }
    const image = await page.locator('#runner-stage').screenshot({ path: `${screenshots}/runner-${name}-1366x768.png` });
    snapshots.push(createHash('sha256').update(image).digest('hex'));
  }
  expect(new Set(snapshots).size).toBe(3);

  const far = await page.evaluate(() => {
    window.__learningGameDebug.runner.advanceToGate(.08);
    return window.__learningGameDebug.runner.state();
  });
  const near = await page.evaluate(() => {
    window.__learningGameDebug.runner.advanceToGate(.9);
    return window.__learningGameDebug.runner.state();
  });
  expect(near.geometry.gates[1].y).toBeGreaterThan(far.geometry.gates[1].y + 80);
  expect(near.geometry.gates[1].width).toBeGreaterThan(far.geometry.gates[1].width * 2.5);
  const farSpread = far.geometry.gates[2].x - far.geometry.gates[0].x;
  const nearSpread = near.geometry.gates[2].x - near.geometry.gates[0].x;
  expect(nearSpread).toBeGreaterThan(farSpread * 2.5);
  const laneGap = near.geometry.laneCenters[1] - near.geometry.laneCenters[0];
  expect(near.geometry.gates[1].width).toBeLessThan(laneGap);

  const scenery = near.geometry.scenery;
  expect(scenery.filter(item => item.lane == null).length).toBeLessThanOrEqual(8);
  expect(scenery.filter(item => item.lane != null).length).toBeLessThanOrEqual(4);
  for (const item of scenery) {
    expect(item.x - item.width / 2).toBeGreaterThanOrEqual(-1);
    expect(item.x + item.width / 2).toBeLessThanOrEqual(near.geometry.width + 1);
  }
});

test('lane switching, pause, collision, scoring and combo change real scene state', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  await page.locator('#runner-left').click();
  expect((await state(page)).lane).toBe(0);
  await page.locator('#runner-right').click();
  expect((await state(page)).lane).toBe(2);
  await expect(page.locator('#runner-right')).toHaveClass(/active/);

  await page.locator('#runner-pause').click();
  expect((await state(page)).phase).toBe('paused');
  await expect(page.locator('#runner-pause-panel')).toBeVisible();
  const pausedProgress = (await state(page)).gateProgress;
  await page.waitForTimeout(320);
  expect((await state(page)).gateProgress).toBe(pausedProgress);
  await capturePage(page, `${screenshots}/runner-pause.png`);
  await page.locator('#runner-resume').click();
  expect(['countdown', 'running']).toContain((await state(page)).phase);
  await expect(page.locator('#runner-pause-panel')).toBeHidden();

  const before = await state(page);
  await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), before.correctLane);
  await page.evaluate(() => window.__learningGameDebug.runner.collision());
  const resolved = await state(page);
  expect(resolved.phase).toBe('resolved');
  expect(resolved.score).toBe(1);
  expect(resolved.combo).toBe(1);
  expect(resolved.sounds).toContain('sfx-correct');
  expect(resolved.sounds).not.toContain('sfx-wrong');
  await expect(page.locator('#runner-score')).toHaveText('得分 1');
  await expect(page.locator('#runner-prompt')).toHaveText(resolved.prompt);
  await page.waitForTimeout(280);
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.runner.state().feedback.title)).toBe('答对了 +1');
  await capturePage(page, `${screenshots}/runner-correct-feedback.png`);

  await page.evaluate(() => window.__learningGameDebug.runner.continue());
  expect((await state(page)).index).toBe(1);
});

test('the live game clock drives gate collisions without debug injection', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.985));
  expect((await state(page)).phase).toBe('running');
  await expect.poll(async () => (await state(page)).phase, { timeout: 1600 }).toBe('resolved');
  const resolved = await state(page);
  expect(resolved.gateProgress).toBe(1);
  expect(resolved.options).toHaveLength(3);
});

test('wrong gate breaks combo and shows one consolidated correction panel', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  const initial = await state(page);
  const wrongLane = initial.correctLane === 0 ? 1 : 0;
  await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), wrongLane);
  await page.evaluate(() => window.__learningGameDebug.runner.collision());
  const resolved = await state(page);
  expect(resolved.phase).toBe('resolved');
  expect(resolved.score).toBe(0);
  expect(resolved.combo).toBe(0);
  expect(resolved.sounds).toContain('sfx-wrong');
  await page.waitForTimeout(280);
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.runner.state().feedback.title)).toBe('差一点，再试一次');
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.runner.state().feedback.body)).toContain('正确答案：');
  await capturePage(page, `${screenshots}/runner-wrong-feedback.png`);
  await page.evaluate(() => window.__learningGameDebug.runner.continue());
  expect((await state(page)).index).toBe(1);
});

test('ten consecutive questions complete and persist result', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  for (let index = 0; index < 10; index += 1) {
    const current = await state(page);
    await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), current.correctLane);
    await page.evaluate(() => window.__learningGameDebug.runner.collision());
    expect((await state(page)).score).toBe(index + 1);
    await page.evaluate(() => window.__learningGameDebug.runner.continue());
  }
  await expect(page.getByRole('heading', { name: '三道门跑酷完成' })).toBeVisible();
  await expect(page.getByText('金币 44')).toBeVisible();
  await expect(page.locator('header')).toBeVisible();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.includes('progress'))) || '{}'));
  expect(progress['g3-english-basic'].rounds).toBe(1);
  await capturePage(page, `${screenshots}/runner-result.png`);

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(80);
    const metrics = await page.evaluate(() => {
      const result = document.querySelector('.result')?.getBoundingClientRect();
      return {
        innerWidth,
        innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        result: result ? { top: result.top, right: result.right, bottom: result.bottom, left: result.left } : null
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.result).not.toBeNull();
    expect(metrics.result.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.result.top).toBeGreaterThanOrEqual(-1);
    expect(metrics.result.right).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.result.bottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
    if (width === 390) await capturePage(page, `${screenshots}/runner-result-390x844.png`);
  }
});

test('offline runtime only requests local resources', async ({ page }) => {
  const remote = [];
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:4173') && !url.startsWith('data:') && !url.startsWith('blob:')) remote.push(url);
  });
  await openRunner(page);
  expect(remote).toEqual([]);
});

test('runner uses a full local CC0 loop instead of a short jingle', async ({ page }) => {
  await page.goto('/index.html');
  const audio = await page.evaluate(() => new Promise((resolve, reject) => {
    const element = new Audio('audio/music/runner-loop.ogg');
    element.preload = 'metadata';
    element.addEventListener('loadedmetadata', () => resolve({
      duration: element.duration,
      source: element.currentSrc
    }), { once: true });
    element.addEventListener('error', () => reject(new Error('runner-loop.ogg failed to load')), { once: true });
  }));
  expect(audio.duration).toBeGreaterThan(30);
  expect(audio.duration).toBeLessThan(70);
  expect(audio.source).toContain('/audio/music/runner-loop.ogg');
});
