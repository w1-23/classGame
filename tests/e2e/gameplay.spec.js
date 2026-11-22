import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

async function openGame(page, id) {
  await page.goto('/index.html');
  await page.locator(`[data-id="${id}"]`).click();
  await expect(page.locator('.adventure-page')).toBeVisible();
  await page.locator('.map-node').first().click();
  await page.locator('#map-start').click();
}

test('pause freezes the pending listen transition and resumes it once', async ({ page }) => {
  await openGame(page, 'listen');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.listen));
  await page.evaluate(() => window.__learningGameDebug.listen.play());
  await expect.poll(
    () => page.evaluate(() => window.__learningGameDebug.listen.state().audioReady),
    { timeout: 6000 }
  ).toBe(true);
  const initial = await page.evaluate(() => window.__learningGameDebug.listen.state());
  await page.evaluate(answer => window.__learningGameDebug.listen.choose(answer), initial.correct);
  await page.locator('#game-pause').click();
  await page.waitForTimeout(1100);
  expect((await page.evaluate(() => window.__learningGameDebug.listen.state())).index).toBe(0);
  await page.locator('#game-resume').click();
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.listen.state().index), { timeout: 2600 }).toBe(1);
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.__learningGameDebug.listen.state())).index).toBe(1);
});

test('pause freezes memory mismatch reveal and resumes the same lock window', async ({ page }) => {
  await openGame(page, 'memory');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.memory));
  const cards = await page.evaluate(() => window.__learningGameDebug.memory.state().cards);
  const second = cards.findIndex((card, index) => index > 0 && card.key !== cards[0].key);
  await page.evaluate(indexes => {
    window.__learningGameDebug.memory.click(indexes[0]);
    window.__learningGameDebug.memory.click(indexes[1]);
  }, [0, second]);
  await page.locator('#game-pause').click();
  await page.waitForTimeout(1100);
  expect((await page.evaluate(() => window.__learningGameDebug.memory.state())).locked).toBe(true);
  await page.locator('#game-resume').click();
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.memory.state().locked), { timeout: 1600 }).toBe(false);
});

test('new runner rounds differ while pause and resume retain the same plan', async ({ page }) => {
  await openGame(page, 'runner');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.runner));
  const first = await page.evaluate(() => window.__learningGameDebug.runner.state());
  await page.locator('#game-pause').click();
  await page.locator('#game-resume').click();
  const resumed = await page.evaluate(() => window.__learningGameDebug.runner.state());
  expect(resumed.options).toEqual(first.options);
  expect(resumed.correctLane).toBe(first.correctLane);

  await openGame(page, 'runner');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.runner));
  const second = await page.evaluate(() => window.__learningGameDebug.runner.state());
  expect(second.itemIds).not.toEqual(first.itemIds);
});

test('progress import rejects null and preserves the previous save', async ({ page }) => {
  await page.goto('/index.html');
  const result = await page.evaluate(async () => {
    const storage = await import('/js/storage.js');
    storage.saveProgress({
      version: 2,
      packs: {
        demo: {
          rounds: 1,
          bestRate: .5,
          games: {}
        }
      }
    });
    const before = localStorage.getItem(storage.PROGRESS_KEY);
    let error = '';
    try {
      storage.importProgress('null');
    } catch (caught) {
      error = caught.message;
    }
    try {
      storage.importProgress('{"hello":"world"}');
    } catch (caught) {
      error += '|' + caught.message;
    }
    return {
      error,
      unchanged: before === localStorage.getItem(storage.PROGRESS_KEY),
      progress: storage.loadProgress()
    };
  });
  expect(result.error).toContain('JSON 对象');
  expect(result.unchanged).toBe(true);
  expect(result.progress.packs.demo.rounds).toBe(1);
});

test('a later failed replay does not revoke a passed level', async ({ page }) => {
  await page.goto('/index.html');
  const level = await page.evaluate(async () => {
    const storage = await import('/js/storage.js');
    storage.recordResult({
      game: 'runner',
      packId: 'demo',
      levelId: 'level-1',
      score: 6,
      total: 6
    });
    storage.recordResult({
      game: 'runner',
      packId: 'demo',
      levelId: 'level-1',
      score: 0,
      total: 6
    });
    return storage.getLevelProgress(storage.loadProgress(), 'demo', 'runner', 'level-1');
  });
  expect(level.passed).toBe(true);
  expect(level.completed).toBe(true);
  expect(level.lastScore).toBe(0);
  expect(level.bestScore).toBe(6);
});

test('legacy per-pack scores migrate into versioned level records', async ({ page }) => {
  await page.goto('/index.html');
  const progress = await page.evaluate(async () => {
    const storage = await import('/js/storage.js');
    localStorage.setItem(storage.PROGRESS_KEY, JSON.stringify({
      'g3-english-basic': {
        rounds: 2,
        bestScore: 7,
        games: {
          listen: { score: 7, total: 8, updatedAt: 123 }
        }
      }
    }));
    return storage.loadProgress();
  });
  expect(progress.version).toBe(2);
  expect(progress.packs['g3-english-basic'].games.listen.levels.legacy.bestScore).toBe(7);
});

test('corrupt progress does not block the lobby and is backed up', async ({ page }) => {
  await page.goto('/index.html');
  const result = await page.evaluate(async () => {
    const storage = await import('/js/storage.js');
    localStorage.setItem(storage.PROGRESS_KEY, 'null');
    const progress = storage.loadProgress();
    const keys = Object.keys(localStorage);
    return {
      progress,
      keys
    };
  });
  expect(result.progress.version).toBe(2);
  expect(Object.keys(result.progress.packs)).toHaveLength(0);
  expect(result.keys.length).toBeGreaterThanOrEqual(2);
});
