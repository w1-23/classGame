import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const screenshots = 'docs/screenshots';

async function openLevel(page, id) {
  await page.goto('/index.html');
  await page.locator(`[data-id="${id}"]`).click();
  await expect(page.locator('.adventure-page')).toBeVisible();
  await page.locator('.map-node').first().click();
  await page.locator('#map-start').click();
  await expect(page.locator('.game-frame')).toBeVisible();
}

async function completeListen(page) {
  for (let index = 0; index < 20; index += 1) {
    if (await page.locator('.result').count()) break;
    const debug = await page.evaluate(() => Boolean(window.__learningGameDebug?.listen));
    if (!debug) break;
    const state = await page.evaluate(() => window.__learningGameDebug.listen.state());
    await page.evaluate(answer => window.__learningGameDebug.listen.choose(answer), state.correct);
    await page.waitForTimeout(820);
  }
}

async function completeAssemble(page) {
  for (let index = 0; index < 20; index += 1) {
    if (await page.locator('.result').count()) break;
    const debug = await page.evaluate(() => Boolean(window.__learningGameDebug?.assemble));
    if (!debug) break;
    await page.evaluate(() => window.__learningGameDebug.assemble.solve());
    await page.waitForTimeout(800);
  }
}

async function completeBeat(page) {
  for (let index = 0; index < 20; index += 1) {
    if (await page.locator('.result').count()) break;
    const debug = await page.evaluate(() => Boolean(window.__learningGameDebug?.beat));
    if (!debug) break;
    const state = await page.evaluate(() => window.__learningGameDebug.beat.state());
    await page.evaluate(answer => window.__learningGameDebug.beat.choose(answer), state.correct);
    await page.waitForTimeout(940);
  }
}

async function completeBattle(page) {
  for (let index = 0; index < 20; index += 1) {
    if (await page.locator('.result').count()) break;
    const debug = await page.evaluate(() => Boolean(window.__learningGameDebug?.battle));
    if (!debug) break;
    const state = await page.evaluate(() => window.__learningGameDebug.battle.state());
    await page.evaluate(answer => window.__learningGameDebug.battle.select(answer), state.correct);
    await page.evaluate(() => window.__learningGameDebug.battle.judgeCorrect());
    await page.waitForTimeout(800);
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('all six game entries use one shared game frame', async ({ page }) => {
  await mkdir(screenshots, { recursive: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const games = [
    ['runner', '.race-shell'],
    ['listen', '.listen-content'],
    ['assemble', '.assemble-content'],
    ['memory', '.memory-content'],
    ['beat', '.poetry-content'],
    ['battle', '.battle-content']
  ];
  for (const [id, selector] of games) {
    await openLevel(page, id);
    await expect(page.locator('#game-back')).toBeVisible();
    await expect(page.locator('#game-pause')).toBeVisible();
    await expect(page.locator(selector)).toBeVisible();
    if (id === 'runner') {
      await page.waitForFunction(() => Boolean(window.__learningGameDebug?.runner));
      await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.66));
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${screenshots}/mode-${id}.png`, fullPage: false });
  }
  expect(errors).toEqual([]);
});

test('all game pages fit the six target viewports without page scrolling', async ({ page }) => {
  const viewports = [
    [1920, 1080],
    [1366, 768],
    [1280, 800],
    [1175, 803],
    [1024, 768],
    [390, 844]
  ];
  const games = [
    ['runner', '.race-shell'],
    ['listen', '.listen-content'],
    ['assemble', '.assemble-content'],
    ['memory', '.memory-content'],
    ['beat', '.poetry-content'],
    ['battle', '.battle-content']
  ];
  for (const [id, selector] of games) {
    await openLevel(page, id);
    if (id === 'runner') {
      await page.waitForFunction(() => Boolean(window.__learningGameDebug?.runner));
      await page.evaluate(() => window.__learningGameDebug.runner.advanceToGate(.66));
    }
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(80);
      const metrics = await page.evaluate(activeSelector => {
        const frame = document.querySelector('.game-frame')?.getBoundingClientRect();
        const content = document.querySelector(activeSelector)?.getBoundingClientRect();
        return {
          innerWidth,
          innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyScrollHeight: document.body.scrollHeight,
          headerDisplay: getComputedStyle(document.querySelector('header')).display,
          frame: frame ? { top: frame.top, right: frame.right, bottom: frame.bottom, left: frame.left } : null,
          content: content ? { top: content.top, right: content.right, bottom: content.bottom, left: content.left } : null
        };
      }, selector);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
      expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
      expect(metrics.headerDisplay).toBe('none');
      for (const box of [metrics.frame, metrics.content]) {
        expect(box).not.toBeNull();
        expect(box.left).toBeGreaterThanOrEqual(-1);
        expect(box.top).toBeGreaterThanOrEqual(-1);
        expect(box.right).toBeLessThanOrEqual(metrics.innerWidth + 1);
        expect(box.bottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
      }
      if (width === 390) {
        await page.screenshot({ path: `${screenshots}/mode-${id}-390x844.png`, fullPage: false });
      }
    }
  }
});

test('personal and class modes have distinct selection flows', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('#personal-mode').click();
  await expect(page.getByRole('heading', { name: '下一站，去哪里？' })).toBeVisible();
  await expect(page.locator('.map-node').first()).toBeVisible();
  await expect(page.locator('.adventure-progress')).toBeVisible();

  await page.goto('/index.html');
  await page.locator('#class-mode').click();
  await expect(page.getByRole('heading', { name: '全班挑战 · 老师主控' })).toBeVisible();
  await expect(page.locator('#class-beat')).toBeVisible();
  await expect(page.locator('#class-battle')).toBeVisible();
  await expect(page.locator('.race-shell')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${screenshots}/class-lobby.png`, fullPage: true });
});

test('every game can pause, resume and return to its level list', async ({ page }) => {
  for (const id of ['runner', 'listen', 'assemble', 'memory', 'beat', 'battle']) {
    await openLevel(page, id);
    await page.locator('#game-pause').click();
    await expect(page.locator('#game-pause-panel')).toBeVisible();
    await expect(page.locator('#game-resume')).toBeVisible();
    await page.locator('#game-resume').click();
    await expect(page.locator('#game-pause-panel')).toBeHidden();
    await page.locator('#game-back').click();
    await expect(page.locator('.adventure-page')).toBeVisible();
  }
});

test('listen and assemble judge correct answers and advance', async ({ page }) => {
  await openLevel(page, 'listen');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.listen));
  const listen = await page.evaluate(() => window.__learningGameDebug.listen.state());
  await page.evaluate(correct => window.__learningGameDebug.listen.choose(correct), listen.correct);
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.listen.state().score)).toBe(1);
  await expect(page.locator('.feedback.correct')).toBeVisible();

  await openLevel(page, 'assemble');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.assemble));
  await page.evaluate(() => window.__learningGameDebug.assemble.solve());
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.assemble.state().score)).toBe(1);
});

test('assemble ignores duplicate submissions and no stale timer returns after exit', async ({ page }) => {
  await openLevel(page, 'assemble');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.assemble));
  await page.evaluate(() => {
    window.__learningGameDebug.assemble.solve();
    document.querySelector('#confirm')?.click();
    document.querySelector('#confirm')?.click();
  });
  expect((await page.evaluate(() => window.__learningGameDebug.assemble.state())).score).toBe(1);
  await page.locator('#game-back').click();
  await expect(page.locator('.adventure-page')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.locator('.adventure-page')).toBeVisible();
  await expect(page.locator('.assemble-content')).toHaveCount(0);
});

test('memory cards lock while a wrong pair is visible and count real attempts', async ({ page }) => {
  await openLevel(page, 'memory');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.memory));
  const cards = await page.evaluate(() => window.__learningGameDebug.memory.state().cards);
  const first = 0;
  const second = cards.findIndex((card, index) => index !== first && card.key !== cards[first].key);
  await page.evaluate(indexes => {
    window.__learningGameDebug.memory.click(indexes[0]);
    window.__learningGameDebug.memory.click(indexes[1]);
  }, [first, second]);
  const locked = await page.evaluate(() => window.__learningGameDebug.memory.state());
  expect(locked.locked).toBe(true);
  expect(locked.attempts).toBe(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${screenshots}/memory-locked.png`, fullPage: false });
  await expect.poll(() => page.evaluate(() => window.__learningGameDebug.memory.state().locked), { timeout: 1600 }).toBe(false);

  await page.reload();
  await page.locator('[data-id="memory"]').click();
  await page.locator('.map-node').first().click();
  await page.locator('#map-start').click();
  const groups = await page.evaluate(() => {
    const groups = {};
    window.__learningGameDebug.memory.state().cards.forEach((card, index) => {
      (groups[card.key] ||= []).push(index);
    });
    return groups;
  });
  for (const indexes of Object.values(groups)) {
    await page.evaluate(pair => {
      window.__learningGameDebug.memory.click(pair[0]);
      window.__learningGameDebug.memory.click(pair[1]);
    }, indexes);
  }
  await expect(page.locator('.result h2')).toContainText('记忆翻牌配对完成');
  await expect(page.locator('.result .pill').nth(1)).toContainText(`尝试 ${cards.length / 2} 次`);
  await expect(page.locator('.result .pill').nth(2)).toContainText('错配 0 次');
});

test('poetry uses reviewed random cloze questions and reveals the full line after answering', async ({ page }) => {
  await openLevel(page, 'beat');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.beat));
  const first = await page.evaluate(() => window.__learningGameDebug.beat.state());
  expect(first.options).toHaveLength(3);
  expect(first.options).toContain(first.correct);
  await page.evaluate(answer => window.__learningGameDebug.beat.choose(answer), first.correct);
  await expect(page.locator('.poetry-feedback.correct')).toContainText('补全正确');
  await page.waitForTimeout(960);
  const second = await page.evaluate(() => window.__learningGameDebug.beat.state());
  expect(second.index).toBe(1);
  for (let index = 1; index < 8; index += 1) {
    if (await page.locator('.result').count()) break;
    const available = await page.evaluate(() => Boolean(window.__learningGameDebug?.beat));
    if (!available) break;
    const state = await page.evaluate(() => window.__learningGameDebug.beat.state());
    await page.evaluate(answer => window.__learningGameDebug.beat.choose(answer), state.correct);
    await page.waitForTimeout(940);
  }
  await expect(page.locator('.result h2')).toContainText('诗词填空闯关完成');
  await expect(page.locator('.poem-review')).toContainText('静夜思');
});

test('class battle uses the teacher decision consistently in scoring and review', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('#class-mode').click();
  await page.locator('#class-battle').click();
  await page.locator('.map-node').first().click();
  await page.locator('#map-start').click();
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.battle));
  const initial = await page.evaluate(() => window.__learningGameDebug.battle.state());
  expect(initial.turn).toBe(0);
  await page.evaluate(correct => window.__learningGameDebug.battle.select(correct), initial.correct);
  await page.evaluate(() => window.__learningGameDebug.battle.judgeWrong());
  const rejected = await page.evaluate(() => window.__learningGameDebug.battle.state());
  expect(rejected.score).toEqual([0, 0]);
  await expect(page.locator('.feedback.wrong')).toContainText('需复习');

  for (let index = 1; index < 20; index += 1) {
    if (await page.locator('.result').count()) break;
    await page.waitForTimeout(800);
    const available = await page.evaluate(() => Boolean(window.__learningGameDebug?.battle));
    if (!available) break;
    const state = await page.evaluate(() => window.__learningGameDebug.battle.state());
    await page.evaluate(answer => window.__learningGameDebug.battle.select(answer), state.correct);
    await page.evaluate(() => window.__learningGameDebug.battle.judgeCorrect());
  }
  await expect(page.locator('.result h2')).toContainText('小组知识守护战完成');
  const firstRow = page.locator('.review tbody tr').first();
  await expect(firstRow.locator('td').nth(3)).toHaveText('教师判定需复习');
});

test('listen completion records a level result and offers the next level', async ({ page }) => {
  await openLevel(page, 'listen');
  await page.waitForFunction(() => Boolean(window.__learningGameDebug?.listen));
  await completeListen(page);
  await expect(page.locator('.result h2')).toContainText('听音找精灵完成');
  await expect(page.locator('#game-next')).toBeVisible();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.includes('progress'))) || '{}'));
  expect(progress.version).toBe(2);
  expect(Object.values(progress.packs).some(pack => (
    Object.values(pack.games?.listen?.levels || {}).some(level => level.completed)
  ))).toBe(true);
});

test('assemble and battle complete without stale callbacks', async ({ page }) => {
  await openLevel(page, 'assemble');
  await completeAssemble(page);
  await expect(page.locator('.result h2')).toContainText('拼音/单词拼装完成');
  await page.goto('/index.html');
  await page.locator('#class-mode').click();
  await page.locator('#class-battle').click();
  await page.locator('.map-node').first().click();
  await page.locator('#map-start').click();
  await completeBattle(page);
  await expect(page.locator('.result h2')).toContainText('小组知识守护战完成');
});
