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
    const prompt = document.querySelector('#runner-prompt');
    return {
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      headerDisplay: getComputedStyle(document.querySelector('header')).display,
      hud: rect('.forest-hud'),
      task: rect('.forest-task-card'),
      stage: rect('#runner-stage'),
      controls: rect('.race-controls'),
      promptOverflow: prompt ? prompt.scrollWidth - prompt.clientWidth : null,
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
  await expect(page.getByText('森林寻宝记')).toBeVisible();
  await expect(page.locator('header')).toBeVisible();
  await capturePage(page, `${screenshots}/home-1366x768.png`);
});

test('forest runner fills every target viewport without clipping or page scrolling', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await openRunner(page);

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.38));
    await page.waitForTimeout(180);
    const metrics = await layoutMetrics(page);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.headerDisplay).toBe('none');
    expect(metrics.promptOverflow).toBeLessThanOrEqual(1);
    for (const key of ['hud', 'task', 'stage', 'controls']) {
      expect(metrics[key]).not.toBeNull();
      expect(metrics[key].left).toBeGreaterThanOrEqual(-1);
      expect(metrics[key].top).toBeGreaterThanOrEqual(-1);
      expect(metrics[key].right).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(metrics[key].bottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
    }
    expect(metrics.hud.height).toBeLessThanOrEqual(metrics.stage.height * .3);
    expect(metrics.controls.height).toBeLessThanOrEqual(68);
    expect(metrics.canvas.width).toBeGreaterThan(300);
    expect(metrics.canvas.height).toBeGreaterThan(350);

    const current = await state(page);
    expect(current.options).toHaveLength(3);
    expect(current.total).toBe(9);
    expect(current.geometry.player.heightRatio).toBeGreaterThanOrEqual(.245);
    expect(current.geometry.player.heightRatio).toBeLessThanOrEqual(.255);
    expect(current.geometry.gates).toHaveLength(3);
    for (const gate of current.geometry.gates) {
      expect(gate.x - gate.signWidth / 2).toBeGreaterThanOrEqual(-1);
      expect(gate.x + gate.signWidth / 2).toBeLessThanOrEqual(current.geometry.width + 1);
      expect(gate.footY).toBeLessThanOrEqual(current.geometry.height + 1);
      expect(gate.footY).toBeGreaterThan(current.geometry.horizon);
    }
    expect(current.geometry.roadEdges.left).toBeLessThan(current.geometry.laneCenters[0]);
    expect(current.geometry.roadEdges.right).toBeGreaterThan(current.geometry.laneCenters[2]);
    await expect(page.locator('#runner-prompt')).toHaveText(current.prompt);
    await expect(page.locator('#runner-feedback')).toBeHidden();
    if ([1366, 390].includes(width)) {
      await capturePage(page, `${screenshots}/runner-${width}x${height}.png`);
    }
  }
});

test('gates follow one road perspective and scenery stays outside the lanes', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);

  const snapshots = [];
  for (const [name, progress] of [['far', .08], ['middle', .48], ['near', .84]]) {
    await page.evaluate(value => window.__learningGameDebug.runner.advanceToGate(value), progress);
    await page.waitForTimeout(120);
    const current = await state(page);
    for (let index = 1; index < current.geometry.gates.length; index += 1) {
      expect(current.geometry.gates[index].x).toBeGreaterThan(current.geometry.gates[index - 1].x);
    }
    for (const actor of current.geometry.scenery) {
      if (actor.side < 0) expect(actor.x + actor.width / 2).toBeLessThanOrEqual(actor.roadEdge + 1);
      else expect(actor.x - actor.width / 2).toBeGreaterThanOrEqual(actor.roadEdge - 1);
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
    window.__learningGameDebug.runner.advanceToGate(.84);
    return window.__learningGameDebug.runner.state();
  });
  expect(near.geometry.gates[1].footY).toBeGreaterThan(far.geometry.gates[1].footY + 200);
  expect(near.geometry.gates[1].signWidth).toBeGreaterThan(far.geometry.gates[1].signWidth * 3);
  expect(near.geometry.gates[2].x - near.geometry.gates[0].x)
    .toBeGreaterThan((far.geometry.gates[2].x - far.geometry.gates[0].x) * 3);
  expect(near.geometry.gates[1].signWidth).toBeLessThan(near.geometry.laneCenters[1] - near.geometry.laneCenters[0]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.84));
  await page.waitForTimeout(160);
  const mobileNear = await state(page);
  expect(mobileNear.geometry.gates[1].signWidth).toBeGreaterThanOrEqual(72);
  await capturePage(page, `${screenshots}/runner-near-390x844.png`);
});

test('lane switching, pause, feedback and automatic next question use real scene state', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);

  await page.locator('#runner-left').click();
  await expect.poll(async () => (await state(page)).lane).toBe(0);
  await page.locator('#runner-right').click();
  await expect.poll(async () => (await state(page)).lane).toBe(2);
  await expect(page.locator('#runner-right')).toHaveClass(/active/);
  await page.waitForTimeout(180);
  expect(Math.abs((await state(page)).geometry.player.x - (await state(page)).geometry.player.targetX)).toBeLessThanOrEqual(2);

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
  const resolved = await page.evaluate(() => {
    window.__learningGameDebug.runner.collision();
    const feedback = document.querySelector('#runner-feedback');
    return {
      ...window.__learningGameDebug.runner.state(),
      domFeedbackHidden: feedback.hidden,
      domFeedbackText: feedback.textContent
    };
  });
  expect(resolved.phase).toBe('feedback');
  expect(resolved.score).toBe(1);
  expect(resolved.combo).toBe(1);
  expect(resolved.sounds).toContain('sfx-correct');
  expect(resolved.sounds).not.toContain('sfx-wrong');
  expect(resolved.domFeedbackHidden).toBe(false);
  expect(resolved.domFeedbackText).toContain('对应');
  await page.waitForTimeout(260);
  await capturePage(page, `${screenshots}/runner-correct-feedback.png`);

  await expect.poll(async () => (await state(page)).index, { timeout: 6000 }).toBe(1);
  expect((await state(page)).phase).toBe('running');
  await expect(page.locator('#runner-pause')).toBeEnabled();
});

test('the live clock reaches a gate without debug collision injection', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.985));
  await expect.poll(async () => (await state(page)).phase, { timeout: 1800 }).toBe('feedback');
  expect((await state(page)).gateProgress).toBe(1);
});

test('wrong gate breaks combo and shows a local correction before automatic advance', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  const initial = await state(page);
  const wrongLane = initial.correctLane === 0 ? 1 : 0;
  await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), wrongLane);
  const resolved = await page.evaluate(() => {
    window.__learningGameDebug.runner.collision();
    const feedback = document.querySelector('#runner-feedback');
    return {
      ...window.__learningGameDebug.runner.state(),
      domFeedbackHidden: feedback.hidden,
      domFeedbackText: feedback.textContent
    };
  });
  expect(resolved.phase).toBe('feedback');
  expect(resolved.score).toBe(0);
  expect(resolved.combo).toBe(0);
  expect(resolved.sounds).toContain('sfx-wrong');
  expect(resolved.feedback.title).toBe('再看一眼');
  expect(resolved.feedback.body).toContain(initial.options[initial.correctLane]);
  expect(resolved.domFeedbackHidden).toBe(false);
  expect(resolved.domFeedbackText).toContain('正确答案');
  await page.waitForTimeout(260);
  await capturePage(page, `${screenshots}/runner-wrong-feedback.png`);
  await expect.poll(async () => (await state(page)).index, { timeout: 8000 }).toBe(1);
});

test('coins are collected by lane travel and do not award an answer', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.12));
  const before = await state(page);
  expect(before.geometry.coins.length).toBeGreaterThan(0);
  const coinLane = before.geometry.coins[0].lane;
  await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), coinLane);
  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.54));
  const after = await state(page);
  expect(after.coins).toBe(before.coins + 1);
  expect(after.score).toBe(0);
  expect(after.phase).toBe('running');
  expect(after.sounds).toContain('sfx-coin');
});

test('nine connected questions end at the finish sign and a real result screen', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  for (let index = 0; index < 9; index += 1) {
    const current = await state(page);
    expect(current.index).toBe(index);
    if (index > 0) expect(current.phase).toBe('running');
    await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), current.correctLane);
    await page.evaluate(() => window.__learningGameDebug.runner.collision());
    await expect.poll(async () => (await state(page)).phase).toBe('feedback');
    if (index < 8) {
      await page.evaluate(() => window.__learningGameDebug.runner.continue());
      await expect.poll(async () => (await state(page)).index).toBe(index + 1);
    } else {
      await page.evaluate(() => window.__learningGameDebug.runner.continue());
    }
  }
  const complete = await state(page);
  expect(complete.phase).toBe('complete');
  expect(complete.score).toBe(9);
  expect(complete.prompt).toBe('抵达终点');
  expect(complete.questionInStage).toBe(3);
  expect(complete.stageIndex).toBe(2);
  await expect(page.locator('#runner-prompt')).toHaveText('抵达终点');
  await expect(page.locator('#runner-left')).toContainText('林间小径');
  await expect(page.locator('#runner-middle')).toContainText('再走一次');
  await expect(page.locator('#runner-right')).toContainText('完成');
  await capturePage(page, `${screenshots}/runner-complete-1366x768.png`);

  await page.locator('#runner-right').click();
  await expect(page.getByRole('heading', { name: '森林寻宝记完成' })).toBeVisible();
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
