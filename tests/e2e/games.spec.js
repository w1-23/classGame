import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const screenshots = 'docs/screenshots';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('all six game entries mount without runtime errors', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const games = [
    ['runner', '.race-shell'],
    ['listen', '.three-grid'],
    ['assemble', '.letters'],
    ['memory', '.memory-grid'],
    ['beat', '.beat-arena'],
    ['battle', '.battle-arena']
  ];
  for (const [id, selector] of games) {
    await page.goto('/index.html');
    await page.locator(`[data-id="${id}"]`).click();
    await expect(page.locator(selector)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${screenshots}/mode-${id}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('personal and class modes have distinct entry flows', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('#personal-mode').click();
  await expect(page.locator('.race-shell')).toBeVisible();

  await page.goto('/index.html');
  await page.locator('#class-mode').click();
  await expect(page.getByRole('heading', { name: '全班挑战 · 老师主控' })).toBeVisible();
  await expect(page.locator('#class-beat')).toBeVisible();
  await expect(page.locator('#class-battle')).toBeVisible();
  await expect(page.locator('.race-shell')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${screenshots}/class-lobby.png`, fullPage: true });
});

test('listen and assemble games judge correct answers and advance', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('[data-id="listen"]').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.listen));
  const listen = await page.evaluate(() => window.__learningGameDebug.listen.state());
  await page.evaluate(correct => window.__learningGameDebug.listen.choose(correct), listen.correct);
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.listen.state().score)).toBe(1);
  await expect(page.locator('.feedback.correct')).toBeVisible();

  await page.goto('/index.html');
  await page.locator('[data-id="assemble"]').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.assemble));
  await page.evaluate(() => window.__learningGameDebug.assemble.solve());
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.assemble.state().score)).toBe(1);
});

test('memory cards lock while a wrong pair is visible and then unlock', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('[data-id="memory"]').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.memory));
  const cards = await page.evaluate(() => window.__learningGameDebug.memory.state().cards);
  const first = cards.findIndex(card => cards.some(other => other.key !== card.key));
  const second = cards.findIndex((card, index) => index !== first && card.key !== cards[first].key);
  await page.evaluate(indexes => {
    window.__learningGameDebug.memory.click(indexes[0]);
    window.__learningGameDebug.memory.click(indexes[1]);
  }, [first, second]);
  expect((await page.evaluate(() => window.__learningGameDebug.memory.state())).locked).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${screenshots}/memory-locked.png`, fullPage: true });
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.memory.state().locked), { timeout: 1600 }).toBe(false);
});

test('rhythm timing window accepts on-beat hits and rejects early hits', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('[data-id="beat"]').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.beat));
  await page.evaluate(() => {
    window.__learningGameDebug.beat.startNote();
    window.__learningGameDebug.beat.hitAt(.9);
  });
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.beat.state().score)).toBe(1);
  await page.waitForTimeout(520);
  await page.evaluate(() => window.__learningGameDebug.beat.hitAt(.15));
  expect((await page.evaluate(() => window.__learningGameDebug.beat.state())).score).toBe(1);
});

test('class battle awards the active team and alternates turns', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('#class-mode').click();
  await page.locator('#class-battle').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.battle));
  const initial = await page.evaluate(() => window.__learningGameDebug.battle.state());
  expect(initial.turn).toBe(0);
  await page.evaluate(correct => window.__learningGameDebug.battle.select(correct), initial.correct);
  await page.evaluate(() => window.__learningGameDebug.battle.judgeCorrect());
  const scored = await page.evaluate(() => window.__learningGameDebug.battle.state());
  expect(scored.score[0]).toBe(1);
  expect(scored.score[1]).toBe(0);
  expect(scored.locked).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.battle.state().turn), { timeout: 1600 }).toBe(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${screenshots}/battle-team-turn.png`, fullPage: true });
});
