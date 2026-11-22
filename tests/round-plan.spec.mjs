import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildChoiceRound,
  buildMemoryRound,
  buildPoetryRound
} from '../js/round-plan.js';

function rngFrom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const items = Array.from({ length: 9 }, (_, index) => ({
  id: `word-${index}`,
  prompt: `题目 ${index}`,
  correct: `答案 ${index}`,
  distractors: [`干扰 ${index}-a`, `干扰 ${index}-b`]
}));

const choice = buildChoiceRound(items, {
  bookId: 'book',
  gameId: 'runner',
  levelId: 'level',
  knownItems: items,
  rng: rngFrom(11)
});
assert.equal(choice.total, items.length);
const laneCounts = [0, 0, 0];
let longestRun = 1;
let run = 1;
choice.correctLanes.forEach((lane, index) => {
  laneCounts[lane] += 1;
  if (index > 0 && choice.correctLanes[index - 1] === lane) run += 1;
  else run = 1;
  longestRun = Math.max(longestRun, run);
});
assert.ok(Math.max(...laneCounts) - Math.min(...laneCounts) <= 1);
assert.ok(longestRun <= 2);
choice.questions.forEach(question => {
  assert.equal(question.options.length, 3);
  assert.equal(question.options[question.correctLane], question.correct);
});

const replay = buildChoiceRound(items, {
  bookId: 'book',
  gameId: 'runner',
  levelId: 'level',
  knownItems: items,
  previousRound: choice,
  rng: rngFrom(11)
});
assert.notDeepEqual(replay.itemIds, choice.itemIds);

const memoryItems = [
  ...items.slice(0, 6),
  { id: 'qing', prompt: '青', correct: 'qīng', distractors: ['qíng', 'qǐng'] },
  { id: 'clear', prompt: '清', correct: 'qīng', distractors: ['qíng', 'qǐng'] }
];
const memory = buildMemoryRound(memoryItems, {
  bookId: 'book',
  levelId: 'level',
  maxPairs: 6,
  rng: rngFrom(21)
});
assert.equal(memory.total, memoryItems.length);
assert.ok(memory.waveCount >= 2);
assert.deepEqual(new Set(memory.itemIds), new Set(memoryItems.map(item => item.id)));
for (const wave of memory.waves) {
  assert.ok(wave.pairCount <= 6);
  const labels = wave.cards.map(card => card.text);
  assert.equal(new Set(labels).size, labels.length);
}

const poetryPack = JSON.parse(
  fs.readFileSync(new URL('../data/poetry-cloze-48-v1.json', import.meta.url), 'utf8')
);
const poetryLevels = poetryPack.units.flatMap(unit => unit.lessons);
assert.equal(poetryLevels.length, 48);
for (const [index, level] of poetryLevels.entries()) {
  const round = buildPoetryRound(level, {
    bookId: poetryPack.id,
    rng: rngFrom(100 + index)
  });
  assert.equal(round.total, 4);
  assert.equal(new Set(round.questions.map(question => question.variantGroupId)).size, 4);
  round.questions.forEach(question => {
    assert.equal(question.options[question.correctLane], question.answer);
    assert.equal(question.before + question.answer + question.after, question.lineText);
  });
}

console.log(`Round-plan tests passed: ${choice.total} choice items, ${memory.waves.length} memory waves, ${poetryLevels.length} poetry levels.`);
