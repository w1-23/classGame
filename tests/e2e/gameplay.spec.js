import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

async function openGame(page, id, selector) {
  await page.goto('/index.html');
  await page.locator(`[data-id="${id}"]`).click();
  await expect(page.locator(selector)).toBeVisible();
}

test('listen game locks after a choice and advances', async ({ page }) => {
  await openGame(page, 'listen', '.three-grid');
  const initial = await page.evaluate(() => window.__learningGameDebug.listen.state());
  expect(initial.locked).toBe(false);
  await page.evaluate(correct => window.__learningGameDebug.listen.choose(correct), initial.correct);
  await expect(page.locator('.feedback.correct')).toContainText('答对了');
  expect((await page.evaluate(() => window.__learningGameDebug.listen.state())).locked).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.listen.state().index)).toBe(1);
});

test('assemble game only accepts a complete answer and supports clearing', async ({ page }) => {
  await openGame(page, 'assemble', '.letters');
  await page.locator('#confirm').click();
  await expect(page.locator('.feedback.wrong')).toContainText('完整答案');
  await page.evaluate(() => window.__learningGameDebug.assemble.solve());
  await expect(page.locator('.feedback.correct')).toContainText('拼装正确');
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.assemble.state().index)).toBe(1);
});

test('memory game locks mismatches and briefly blocks a third card', async ({ page }) => {
  await openGame(page, 'memory', '.memory-grid');
  const initial = await page.evaluate(() => window.__learningGameDebug.memory.state());
  const byKey = new Map();
  initial.cards.forEach((card, index) => {
    if (!byKey.has(card.key)) byKey.set(card.key, []);
    byKey.get(card.key).push(index);
  });
  const firstPair = [...byKey.values()].find(indices => indices.length === 2);
  await page.evaluate(([first, second]) => {
    window.__learningGameDebug.memory.click(first);
    window.__learningGameDebug.memory.click(second);
  }, firstPair);
  expect((await page.evaluate(() => window.__learningGameDebug.memory.state())).matched).toBe(1);

  const unmatchedKeys = [...byKey.entries()].filter(([, indices]) => indices.length === 2);
  const first = unmatchedKeys[1][1][0];
  const second = unmatchedKeys[2][1][0];
  const third = unmatchedKeys[3][1][0];
  await page.evaluate(([a, b]) => {
    window.__learningGameDebug.memory.click(a);
    window.__learningGameDebug.memory.click(b);
  }, [first, second]);
  expect((await page.evaluate(() => window.__learningGameDebug.memory.state())).locked).toBe(true);
  await page.evaluate(index => window.__learningGameDebug.memory.click(index), third);
  expect((await page.evaluate(() => window.__learningGameDebug.memory.state())).cards[third].shown).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.memory.state().locked), { timeout: 2000 }).toBe(false);
});

test('poetry theater requires line-by-line teacher-led reading and a comprehension answer', async ({ page }) => {
  await openGame(page, 'beat', '.theater-workbench');
  await page.evaluate(() => window.__learningGameDebug.beat.finish());
  await expect(page.locator('#poetry-feedback')).toContainText('没有共读');

  await page.evaluate(() => window.__learningGameDebug.beat.play());
  await page.evaluate(() => window.__learningGameDebug.beat.next());
  await page.evaluate(() => window.__learningGameDebug.beat.next());
  await page.evaluate(() => window.__learningGameDebug.beat.next());
  await page.evaluate(() => window.__learningGameDebug.beat.choose('清风'));
  await expect(page.locator('#poetry-feedback')).toContainText('再想一想');
  await page.evaluate(() => window.__learningGameDebug.beat.choose('明月'));
  await expect(page.locator('#poetry-practice-note')).toContainText('床前明月光');
  const state = await page.evaluate(() => window.__learningGameDebug.beat.state());
  expect(state.heardLines).toEqual([0, 1, 2, 3]);
  expect(state.chosenAnswer).toBe('明月');
});

test('class lobby and battle use teacher-confirmed two-team scoring', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('#class-mode').click();
  await expect(page.getByRole('heading', { name: '全班挑战 · 老师主控' })).toBeVisible();
  await page.locator('#class-battle').click();
  await expect(page.locator('.battle-arena')).toBeVisible();

  const initial = await page.evaluate(() => window.__learningGameDebug.battle.state());
  await page.evaluate(correct => window.__learningGameDebug.battle.select(correct), initial.correct);
  await page.evaluate(() => window.__learningGameDebug.battle.judgeCorrect());
  const awarded = await page.evaluate(() => window.__learningGameDebug.battle.state());
  expect(awarded.score).toEqual([1, 0]);
  await expect(page.locator('.feedback.correct')).toContainText('第 1 组得分');
  await page.waitForTimeout(820);

  const second = await page.evaluate(() => window.__learningGameDebug.battle.state());
  await page.evaluate(correct => window.__learningGameDebug.battle.select(correct), second.correct);
  await page.evaluate(() => window.__learningGameDebug.battle.judgeWrong());
  const rejected = await page.evaluate(() => window.__learningGameDebug.battle.state());
  expect(rejected.score).toEqual([1, 0]);
  await expect(page.locator('.feedback.wrong')).toContainText('需复习');
});
