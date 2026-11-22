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
  await expect(page.locator('.adventure-page')).toBeVisible();
  await page.locator('.map-node').first().click();
  await page.locator('#map-start').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.runner));
}

async function openRunnerUnit(page, bookId, unitIndex) {
  await page.goto('/index.html');
  await page.locator('[data-id="runner"]').click();
  await expect(page.locator('.adventure-page')).toBeVisible();
  await page.locator('#adventure-book').selectOption(bookId);
  await expect(page.locator('.adventure-heading')).toContainText('四年级下册语文');
  await page.locator('.region-tab').nth(unitIndex).click();
  await expect(page.locator('.region-tab').nth(unitIndex)).toHaveClass(/active/);
  await page.locator('#map-start').click();
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
    expect(current.total).toBeGreaterThanOrEqual(6);
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
    await page.evaluate(value => window.__learningGameDebug.runner.freezeAtGate(value), progress);
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
    window.__learningGameDebug.runner.freezeAtGate(.08);
    return window.__learningGameDebug.runner.state();
  });
  const near = await page.evaluate(() => {
    window.__learningGameDebug.runner.freezeAtGate(.84);
    return window.__learningGameDebug.runner.state();
  });
  expect(near.geometry.gates[1].footY).toBeGreaterThan(far.geometry.gates[1].footY + 150);
  expect(near.geometry.gates[1].signWidth).toBeGreaterThan(far.geometry.gates[1].signWidth * 3);
  expect(near.geometry.gates[2].x - near.geometry.gates[0].x)
    .toBeGreaterThan((far.geometry.gates[2].x - far.geometry.gates[0].x) * 3);
  expect(near.geometry.gates[1].signWidth).toBeLessThan(near.geometry.laneCenters[1] - near.geometry.laneCenters[0]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__learningGameDebug.runner.freezeAtGate(.84));
  await page.waitForTimeout(160);
  const mobileNear = await state(page);
  expect(mobileNear.geometry.gates[1].signWidth).toBeGreaterThanOrEqual(68);
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

  await page.locator('#game-pause').click();
  expect((await state(page)).phase).toBe('paused');
  await expect(page.locator('#game-pause-panel')).toBeVisible();
  const pausedProgress = (await state(page)).gateProgress;
  await page.waitForTimeout(320);
  expect((await state(page)).gateProgress).toBe(pausedProgress);
  await capturePage(page, `${screenshots}/runner-pause.png`);
  await page.locator('#game-resume').click();
  expect(['countdown', 'running']).toContain((await state(page)).phase);
  await expect(page.locator('#game-pause-panel')).toBeHidden();

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
  await expect(page.locator('#game-pause')).toBeEnabled();
});

test('the live clock reaches a gate without debug collision injection', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.985));
  await expect.poll(async () => (await state(page)).phase, { timeout: 1800 }).toBe('feedback');
  expect((await state(page)).gateProgress).toBe(1);
});

test('runner scenery changes through forest, grove and camp stages', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  await page.evaluate(() => window.__learningGameDebug.runner.freezeAtGate(.42));
  await page.waitForTimeout(160);
  await capturePage(page, `${screenshots}/runner-forest-stage0-1366x768.png`);
  await page.evaluate(() => window.__learningGameDebug.runner.resume());
  const initial = await state(page);
  expect(initial.areaName).toBe('阳光林地');
  const details = [initial.stageDetail];
  for (let index = 0; index < 4; index += 1) {
    const current = await state(page);
    await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), current.correctLane);
    await page.evaluate(() => window.__learningGameDebug.runner.collision());
    await expect.poll(async () => (await state(page)).phase).toBe('feedback');
    await page.evaluate(() => window.__learningGameDebug.runner.continue());
    await expect.poll(async () => (await state(page)).index).toBe(index + 1);
    if (index === 1) {
      const groveStage = await state(page);
      details.push(groveStage.stageDetail);
      expect(groveStage.areaName).toBe('密林小径');
      await page.evaluate(() => window.__learningGameDebug.runner.freezeAtGate(.42));
      await page.waitForTimeout(160);
      await capturePage(page, `${screenshots}/runner-forest-stage1-1366x768.png`);
      await page.evaluate(() => window.__learningGameDebug.runner.resume());
    }
    if (index === 3) {
      const campStage = await state(page);
      details.push(campStage.stageDetail);
      expect(campStage.areaName).toBe('林间营地');
      await page.evaluate(() => window.__learningGameDebug.runner.freezeAtGate(.42));
      await page.waitForTimeout(160);
      await capturePage(page, `${screenshots}/runner-forest-stage2-1366x768.png`);
      await page.evaluate(() => window.__learningGameDebug.runner.resume());
    }
  }
  expect(details).toEqual(['flowers', 'grove', 'camp']);
  expect((await state(page)).stageIndex).toBe(2);
});

test('runner scenery follows all six curriculum regions and their three stages', async ({ page }) => {
  test.setTimeout(150_000);
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });

  for (const scene of [
    {
      theme: 'forest',
      areas: ['阳光林地', '密林小径', '林间营地'],
      details: ['flowers', 'grove', 'camp']
    },
    {
      theme: 'stream',
      areas: ['溪边栈道', '木桥水湾', '瀑布营地'],
      details: ['river', 'river', 'waterfall']
    },
    {
      theme: 'mountain',
      areas: ['石径山谷', '岩壁小径', '山巅风口'],
      details: ['rocks', 'rocks', 'rocks']
    },
    {
      theme: 'orchard',
      areas: ['秋日果园', '果树林道', '丰收营地'],
      details: ['orchard', 'orchard', 'camp']
    },
    {
      theme: 'coast',
      areas: ['晴空海湾', '海边栈桥', '落日港湾'],
      details: ['coast', 'coast', 'coast']
    },
    {
      theme: 'snow',
      areas: ['松林雪原', '冰湖驿站', '星光营地'],
      details: ['snow', 'ice', 'stars']
    }
  ]) {
    const unitIndex = ['forest', 'stream', 'mountain', 'orchard', 'coast', 'snow'].indexOf(scene.theme);
    await openRunnerUnit(page, 'g4-chinese-b', unitIndex);
    const initial = await state(page);
    expect(initial.theme).toBe(scene.theme);
    expect(initial.areaName).toBe(scene.areas[0]);

    for (let stageIndex = 0; stageIndex < 3; stageIndex += 1) {
      const targetIndex = stageIndex * 2;
      while ((await state(page)).index < targetIndex) {
        const current = await state(page);
        await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), current.correctLane);
        await page.evaluate(() => window.__learningGameDebug.runner.collision());
        await expect.poll(async () => (await state(page)).phase).toBe('feedback');
        await page.evaluate(() => window.__learningGameDebug.runner.continue());
        await expect.poll(async () => (await state(page)).index).toBe(current.index + 1);
      }
      await page.evaluate(() => window.__learningGameDebug.runner.freezeAtGate(.42));
      await page.waitForTimeout(160);
      const stage = await state(page);
      expect(stage.stageIndex).toBe(stageIndex);
      expect(stage.areaName).toBe(scene.areas[stageIndex]);
      expect(stage.stageDetail).toBe(scene.details[stageIndex]);
      await capturePage(page, `${screenshots}/runner-${scene.theme}-stage${stageIndex}-1366x768.png`);
      await page.evaluate(() => window.__learningGameDebug.runner.resume());
    }
  }
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
  await expect.poll(async () => (await state(page)).index, { timeout: 15000 }).toBe(1);
});

test('answer-only runner has no coin collection layer', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  const current = await state(page);
  expect(current.coins).toBeUndefined();
  expect(current.geometry.coins).toBeUndefined();
  await expect(page.locator('#runner-coins')).toHaveCount(0);
});

test('connected questions end at the finish sign and a real result screen', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openRunner(page);
  const total = (await state(page)).total;
  expect(total).toBeGreaterThanOrEqual(6);
  for (let index = 0; index < total; index += 1) {
    const current = await state(page);
    expect(current.index).toBe(index);
    if (index > 0) expect(current.phase).toBe('running');
    await page.evaluate(lane => window.__learningGameDebug.runner.switchLane(lane), current.correctLane);
    await page.evaluate(() => window.__learningGameDebug.runner.collision());
    await expect.poll(async () => (await state(page)).phase).toBe('feedback');
    if (index < total - 1) {
      await page.evaluate(() => window.__learningGameDebug.runner.continue());
      await expect.poll(async () => (await state(page)).index).toBe(index + 1);
    } else {
      await page.evaluate(() => window.__learningGameDebug.runner.continue());
    }
  }
  const complete = await state(page);
  expect(complete.phase).toBe('complete');
  expect(complete.score).toBe(total);
  expect(complete.prompt).toBe('抵达终点');
  expect(complete.questionInStage).toBe(2);
  expect(complete.stageIndex).toBe(Math.min(2, Math.floor((total - 1) / 2)));
  await expect(page.locator('#runner-prompt')).toHaveText('抵达终点');
  await expect(page.locator('#runner-left')).toContainText('返回关卡');
  await expect(page.locator('#runner-middle')).toContainText('再走一次');
  await expect(page.locator('#runner-right')).toContainText('完成');
  await capturePage(page, `${screenshots}/runner-complete-1366x768.png`);

  const progressBeforeFinish = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.includes('progress'))) || '{}'));
  expect(progressBeforeFinish.version).toBe(2);
  expect(progressBeforeFinish.packs['g3-english-basic'].rounds).toBe(1);

  await page.locator('#runner-right').click();
  await expect(page.getByRole('heading', { name: '森林寻宝记完成' })).toBeVisible();
  await expect(page.locator('header')).toBeVisible();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.includes('progress'))) || '{}'));
  expect(progress.packs['g3-english-basic'].rounds).toBe(1);
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
  const localArt = [];
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:4173') && !url.startsWith('data:') && !url.startsWith('blob:')) remote.push(url);
    if (url.includes('/assets/map-art/vector/')) localArt.push(new URL(url).pathname);
  });
  await openRunner(page);
  expect(remote).toEqual([]);
  expect(localArt.some(path => path.includes('/tree-round.svg'))).toBe(true);
  const current = await state(page);
  expect(current.treeTexture).toBe('map-tree-round');
  expect(current.treeTextureReady).toBe(true);
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
