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

async function openMap(page, gameId = 'runner') {
  await page.goto('/index.html');
  await page.locator(`[data-id="${gameId}"]`).click();
  await expect(page.locator('.adventure-page')).toBeVisible();
}

async function mapState(page) {
  return page.evaluate(() => window.__learningGameDebug.map.state());
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('curriculum map scales by grade, book, unit and lesson', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openMap(page);

  const english = await mapState(page);
  expect(english.units).toBeGreaterThanOrEqual(3);
  expect(english.levels).toBeGreaterThan(12);
  expect(english.displayedNodes).toBeGreaterThanOrEqual(6);
  expect(english.displayedNodes).toBeLessThanOrEqual(12);
  await expect(page.locator('.map-node')).toHaveCount(english.displayedNodes);

  const books = await page.locator('#adventure-book option').evaluateAll(options => options.map(option => option.value));
  for (const grade of [1, 2, 3, 4, 5, 6]) {
    expect(books).toContain(`g${grade}-chinese-a`);
    expect(books).toContain(`g${grade}-chinese-b`);
  }

  await page.locator('#adventure-book').selectOption('g6-chinese-b');
  await expect(page.locator('.adventure-heading')).toContainText('六年级下册语文');
  const chinese = await mapState(page);
  expect(chinese.units).toBeGreaterThanOrEqual(6);
  expect(chinese.levels).toBeGreaterThan(20);
  await expect(page.locator('.region-tab')).toHaveCount(chinese.units);

  await page.locator('.region-tab').nth(1).click();
  await expect(page.locator('.region-tab').nth(1)).toHaveClass(/active/);
  await expect(page.locator('.map-node').first()).toBeVisible();
});

test('choosing a later level does not mark skipped levels as passed', async ({ page }) => {
  await openMap(page);
  const initial = await mapState(page);
  const nodes = page.locator('.map-node');
  const last = nodes.nth(await nodes.count() - 1);
  const lastId = await last.getAttribute('data-level');
  await last.click();
  const selected = await mapState(page);
  expect(selected.currentLevelId).toBe(lastId);
  expect(selected.completed).toBe(initial.completed);

  const progress = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(item => item.includes('progress'));
    return JSON.parse(localStorage.getItem(key) || '{}');
  });
  const passed = Object.values(progress.packs?.[initial.bookId]?.games?.runner?.levels || {})
    .filter(level => level.passed);
  expect(passed).toHaveLength(0);
});

test('each game and book keeps an independent current position', async ({ page }) => {
  await openMap(page, 'runner');
  const runnerInitial = await mapState(page);
  await page.locator('.map-node').nth(1).click();
  const runnerLevel = (await mapState(page)).currentLevelId;
  expect(runnerLevel).not.toBe(runnerInitial.currentLevelId);

  await page.locator('#adventure-game').selectOption('listen');
  const listen = await mapState(page);
  expect(listen.gameId).toBe('listen');
  expect(listen.currentLevelId).not.toBe(runnerLevel);

  await page.locator('#adventure-game').selectOption('runner');
  expect((await mapState(page)).currentLevelId).toBe(runnerLevel);
});

test('formal map has no demo completion control', async ({ page }) => {
  await openMap(page);
  await expect(page.locator('#map-demo')).toHaveCount(0);
  await expect(page.locator('#map-start')).toBeVisible();
  await expect(page.locator('.detail-hint')).toContainText('只有完成关卡');
});

test('poetry map exposes six regions and all 48 poem levels', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openMap(page, 'beat');
  const state = await mapState(page);
  expect(state.units).toBe(6);
  expect(state.levels).toBe(48);
  await expect(page.locator('.region-tab')).toHaveCount(6);
  await page.locator('.region-tab').last().click();
  await expect(page.locator('.region-tab').last()).toHaveClass(/active/);
  await expect(page.locator('.map-node')).toHaveCount(8);
  await expect(page.locator('.adventure-heading')).toContainText('诗词填空 · 48首主题探险');
  await page.screenshot({ path: `${screenshots}/map-poetry-48.png`, fullPage: false });
});

test('map renders the approved canvas artwork instead of an empty placeholder', async ({ page }) => {
  await openMap(page);
  const canvas = page.locator('.map-art-canvas');
  await expect(canvas).toBeVisible();
  const drawing = await canvas.evaluate(node => {
    const context = node.getContext('2d');
    const data = context.getImageData(0, 0, node.width, node.height).data;
    const colors = new Set();
    for (let index = 0; index < data.length; index += 1600) {
      colors.add(`${data[index]},${data[index + 1]},${data[index + 2]},${data[index + 3]}`);
    }
    return {
      width: node.width,
      height: node.height,
      colors: colors.size,
      dataUrlLength: node.toDataURL('image/png').length
    };
  });
  expect(drawing.width).toBeGreaterThan(500);
  expect(drawing.height).toBeGreaterThan(450);
  expect(drawing.colors).toBeGreaterThan(12);
  expect(drawing.dataUrlLength).toBeGreaterThan(20000);
});

test('all six map regions use their matching imported artwork', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await openMap(page);
  await page.locator('#adventure-book').selectOption('g4-chinese-b');
  await expect(page.locator('.adventure-heading')).toContainText('四年级下册语文');

  const hashes = new Set();
  for (const scene of [
    { theme: 'forest' },
    { theme: 'stream' },
    { theme: 'mountain' },
    { theme: 'orchard' },
    { theme: 'coast' },
    { theme: 'snow' }
  ]) {
    const unitIndex = ['forest', 'stream', 'mountain', 'orchard', 'coast', 'snow'].indexOf(scene.theme);
    await page.locator('.region-tab').nth(unitIndex).click();
    await expect(page.locator('.map-canvas')).toHaveClass(new RegExp(`theme-${scene.theme}`));
    await page.waitForTimeout(100);
    const dataUrl = await page.locator('.map-art-canvas').evaluate(node => node.toDataURL('image/png'));
    hashes.add(createHash('sha256').update(dataUrl).digest('hex'));
    await page.screenshot({ path: `${screenshots}/map-${scene.theme}-1366x768.png`, fullPage: false });
  }
  expect(hashes.size).toBe(6);
});

test('map fits every target viewport without page scrolling', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  await openMap(page);
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const metrics = await page.evaluate(() => {
      const pageBox = document.querySelector('.adventure-page')?.getBoundingClientRect();
      const body = document.querySelector('.adventure-body')?.getBoundingClientRect();
      const viewport = document.querySelector('.map-viewport')?.getBoundingClientRect();
      const detail = document.querySelector('.map-detail')?.getBoundingClientRect();
      return {
        innerWidth,
        innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        headerDisplay: getComputedStyle(document.querySelector('header')).display,
        pageBox: pageBox && { top: pageBox.top, right: pageBox.right, bottom: pageBox.bottom, left: pageBox.left },
        body: body && { top: body.top, right: body.right, bottom: body.bottom, left: body.left },
        viewport: viewport && { top: viewport.top, right: viewport.right, bottom: viewport.bottom, left: viewport.left },
        detail: detail && { top: detail.top, right: detail.right, bottom: detail.bottom, left: detail.left }
      };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
    expect(metrics.headerDisplay).toBe('none');
    for (const box of [metrics.pageBox, metrics.body, metrics.viewport, metrics.detail]) {
      expect(box).not.toBeNull();
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.top).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(box.bottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
    }
    if (width === 1366) {
      await page.screenshot({ path: `${screenshots}/map-1366x768.png`, fullPage: false });
    }
    if (width === 390) {
      await page.screenshot({ path: `${screenshots}/map-390x844.png`, fullPage: false });
      const currentVisibility = await page.evaluate(() => {
        const viewport = document.querySelector('.map-viewport')?.getBoundingClientRect();
        const node = document.querySelector('.map-node.current')?.getBoundingClientRect();
        return viewport && node
          ? { nodeTop: node.top, nodeBottom: node.bottom, viewTop: viewport.top, viewBottom: viewport.bottom }
          : null;
      });
      expect(currentVisibility).not.toBeNull();
      expect(currentVisibility.nodeTop).toBeGreaterThanOrEqual(currentVisibility.viewTop - 1);
      expect(currentVisibility.nodeBottom).toBeLessThanOrEqual(currentVisibility.viewBottom + 1);
    }
  }
});
