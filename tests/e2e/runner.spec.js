import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const screenshots = 'docs/screenshots';

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
  await page.screenshot({ path, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('runner renders real perspective lanes without overflow at target sizes', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  const sizes = [
    [1920, 1080],
    [1366, 768],
    [1280, 800],
    [390, 844]
  ];
  await openRunner(page);
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.66));
    await page.waitForTimeout(180);
    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector('#runner-stage canvas')?.getBoundingClientRect();
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        canvasWidth: canvas?.width || 0,
        canvasHeight: canvas?.height || 0
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.canvasWidth).toBeGreaterThan(300);
    expect(metrics.canvasHeight).toBeGreaterThan(350);
    const current = await state(page);
    expect(current.options).toHaveLength(3);
    const legendAnswers = await page.locator('#runner-answer-legend .lane-answer').allTextContents();
    expect(legendAnswers).toEqual(current.options);
    await capturePage(page, `${screenshots}/runner-${width}x${height}.png`);
  }
});

test('gates share a vanishing point and visibly grow while approaching the runner', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);

  const snapshots = [];
  for (const [name, progress] of [['far', .08], ['middle', .58], ['near', .9]]) {
    const state = await page.evaluate(value => {
      window.__learningGameDebug.runner.advanceToGate(value);
      return window.__learningGameDebug.runner.state();
    }, progress);
    expect(state.geometry.gates).toHaveLength(3);
    for (let index = 1; index < state.geometry.gates.length; index += 1) {
      expect(state.geometry.gates[index].x).toBeGreaterThan(state.geometry.gates[index - 1].x);
    }
    const laneGap = state.geometry.laneCenters[1] - state.geometry.laneCenters[0];
    expect(state.geometry.gates[1].width).toBeLessThan(laneGap * 1.1);
    const image = await page.locator('#runner-stage').screenshot({ path: `${screenshots}/runner-${name}-1366x768.png` });
    snapshots.push(createHash('sha256').update(image).digest('hex'));
  }
  expect(new Set(snapshots).size).toBe(3);

  const far = await page.evaluate(value => {
    window.__learningGameDebug.runner.advanceToGate(value);
    return window.__learningGameDebug.runner.state();
  }, .08);
  const near = await page.evaluate(value => {
    window.__learningGameDebug.runner.advanceToGate(value);
    return window.__learningGameDebug.runner.state();
  }, .9);
  expect(near.geometry.gates[1].y).toBeGreaterThan(far.geometry.gates[1].y + 80);
  expect(near.geometry.gates[1].width).toBeGreaterThan(far.geometry.gates[1].width * 2.5);
  const farSpread = far.geometry.gates[2].x - far.geometry.gates[0].x;
  const nearSpread = near.geometry.gates[2].x - near.geometry.gates[0].x;
  expect(nearSpread).toBeGreaterThan(farSpread * 2.5);
  const scenery = near.geometry.scenery;
  expect(scenery.length).toBeGreaterThan(0);
  for (const item of scenery) {
    expect(item.x - item.width / 2).toBeGreaterThanOrEqual(0);
    expect(item.x + item.width / 2).toBeLessThanOrEqual(near.geometry.width + 1);
  }
});

test('lane switching, collision, scoring, combo and pause all change real scene state', async ({ page }) => {
  await openRunner(page);
  await page.locator('#runner-left').click();
  expect((await state(page)).lane).toBe(0);
  await page.locator('#runner-right').click();
  expect((await state(page)).lane).toBe(2);

  await page.locator('#runner-pause').click();
  expect((await state(page)).phase).toBe('paused');
  const pausedProgress = (await state(page)).gateProgress;
  await page.waitForTimeout(320);
  expect((await state(page)).gateProgress).toBe(pausedProgress);
  await page.locator('#runner-pause').click();
  expect(['countdown', 'running']).toContain((await state(page)).phase);

  const before = await state(page);
  await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), before.correctLane);
  await page.evaluate(() => window.__learningGameDebug.runner.collision());
  const resolved = await state(page);
  expect(resolved.phase).toBe('resolved');
  expect(resolved.score).toBe(1);
  expect(resolved.combo).toBe(1);
  expect(resolved.sounds).toContain('sfx-correct');
  expect(resolved.sounds).not.toContain('sfx-wrong');

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
  await expect(page.locator('#runner-answer-legend .lane-chip.is-correct')).toHaveCount(1);
});

test('wrong gate breaks combo and explicit next-question flow continues', async ({ page }) => {
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
  await page.waitForTimeout(260);
  await capturePage(page, `${screenshots}/runner-wrong-feedback.png`);
  await page.evaluate(() => window.__learningGameDebug.runner.continue());
  expect((await state(page)).index).toBe(1);
});

test('ten consecutive questions complete and persist result', async ({ page }) => {
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
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.includes('progress'))) || '{}'));
  expect(progress['g3-english-basic'].rounds).toBe(1);
  await capturePage(page, `${screenshots}/runner-result.png`);
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
