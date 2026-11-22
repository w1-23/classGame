/**
 * classGame round-plan reference, 2026-11-22.
 * Creates NEW attempts only. Pause/resume must retain the same returned plan.
 * No fixed seed is used in production; tests may inject rng explicitly.
 * This module does not mount UI, score answers, or change persisted level IDs.
 */

export const ROUND_PLAN_VERSION = 1;
let serial = 0;

function visibleKey(text) {
  return String(text).normalize('NFC').trim().replace(/\s+/g, ' ');
}

function randomIndex(length, rng) {
  const value = rng();
  if (!(value >= 0 && value < 1)) throw new RangeError('rng must return 0 <= value < 1');
  return Math.floor(value * length);
}

export function shuffleCopy(values, rng = Math.random) {
  const copy = Array.from(values);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1, rng);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sameKeys(values, previous, keyOf) {
  return Array.isArray(previous) && values.length === previous.length
    && values.every((value, index) => keyOf(value) === previous[index]);
}

/** Avoid a completely identical arrangement, but preserve every item. */
export function shuffleDifferent(values, previousKeys = null, keyOf = value => value.id, rng = Math.random) {
  let result = shuffleCopy(values, rng);
  if (!sameKeys(result, previousKeys, keyOf)) return result;
  // A bounded retry followed by a visible permutation; never an endless retry loop.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    result = shuffleCopy(values, rng);
    if (!sameKeys(result, previousKeys, keyOf)) return result;
  }
  const other = result.findIndex(value => keyOf(value) !== keyOf(result[0]));
  if (other > 0) [result[0], result[other]] = [result[other], result[0]];
  return result;
}

function newRoundId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  serial += 1;
  return Date.now().toString(36) + '-' + serial.toString(36) + '-' + Math.random().toString(36).slice(2);
}

/** Balanced across one round (counts differ by <= 1), maximum same-lane run 2. */
export function balancedAnswerLanes(count, { rng = Math.random, maxRun = 2 } = {}) {
  if (!Number.isInteger(count) || count < 0 || count > 256) throw new RangeError('count must be 0..256');
  if (!Number.isInteger(maxRun) || maxRun < 1) throw new RangeError('maxRun must be >= 1');
  const remaining = [0, 1, 2].map(() => Math.floor(count / 3));
  for (const lane of shuffleCopy([0, 1, 2], rng).slice(0, count % 3)) remaining[lane] += 1;
  const output = [];
  const failed = new Set();
  function fill(last = -1, run = 0) {
    if (output.length === count) return true;
    const state = remaining.join(',') + ':' + last + ':' + run;
    if (failed.has(state)) return false;
    const candidates = shuffleCopy([0, 1, 2], rng).filter(lane => remaining[lane] > 0 && (lane !== last || run < maxRun));
    for (const lane of candidates) {
      remaining[lane] -= 1;
      output.push(lane);
      if (fill(lane, lane === last ? run + 1 : 1)) return true;
      output.pop();
      remaining[lane] += 1;
    }
    failed.add(state);
    return false;
  }
  if (!fill()) throw new Error('Could not construct the lane plan');
  return output;
}

function assertItems(items) {
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) {
      throw new Error('Each content item must have a unique nonempty id');
    }
    if (!visibleKey(item.prompt ?? '') || !visibleKey(item.correct ?? '')) {
      throw new Error('Missing prompt/correct for item ' + item.id);
    }
    ids.add(item.id);
  }
}

/**
 * knownItems should be the full reviewed book/subject bank so equivalent answers
 * with the SAME visible prompt can be excluded from distractors. This check is
 * not a replacement for teacher review: context-dependent synonyms need editing.
 */
export function buildChoiceRound(items, {
  bookId, gameId, levelId, previousRound = null, knownItems = items,
  rng = Math.random, maxRun = 2
} = {}) {
  assertItems(items);
  const ordered = shuffleDifferent(items, previousRound?.itemIds, item => item.id, rng);
  const lanes = balancedAnswerLanes(ordered.length, { rng, maxRun });
  const meanings = new Map();
  for (const item of knownItems) {
    const prompt = visibleKey(item.prompt);
    if (!meanings.has(prompt)) meanings.set(prompt, new Set());
    meanings.get(prompt).add(visibleKey(item.correct));
  }
  const questions = ordered.map((item, index) => {
    const equivalent = meanings.get(visibleKey(item.prompt)) || new Set();
    equivalent.add(visibleKey(item.correct));
    const seen = new Set();
    const candidates = [...(item.distractors || []), ...shuffleCopy(knownItems, rng).map(value => value.correct)]
      .filter(value => {
        const key = visibleKey(value ?? '');
        if (!key || equivalent.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (candidates.length < 2) throw new Error('Insufficient unambiguous distractors for item ' + item.id);
    const alternatives = shuffleCopy(candidates.slice(0, 2), rng);
    const options = [...alternatives];
    options.splice(lanes[index], 0, item.correct);
    return { ...item, options, correctLane: lanes[index] };
  });
  return {
    version: ROUND_PLAN_VERSION, kind: 'choice', roundId: newRoundId(),
    bookId, gameId, levelId, sourceCount: items.length,
    itemIds: questions.map(item => item.id), questions,
    correctLanes: lanes, questionCount: questions.length, total: questions.length
  };
}

/**
 * Sample one PREWRITTEN blank variant per group, then shuffle the selected set.
 * This helper intentionally requires the raw lesson pool: losing questionPool
 * in normalizeLesson must be a visible integration error, not a silent fallback.
 * Source-checked / teacher-pending metadata is retained without upgrading it.
 */
export function buildPoetryRound(level, {
  bookId, previousRound = null, rng = Math.random, maxRun = 2
} = {}) {
  if (typeof level?.id !== 'string' || !level.id) throw new Error('Poetry lesson must preserve its stable id');
  if (level?.samplingPolicy !== 'one_variant_per_group_then_shuffle') {
    throw new Error('Poetry lesson must preserve samplingPolicy');
  }
  const pool = level.questionPool;
  if (!Array.isArray(pool) || !pool.length) throw new Error('Poetry lesson must preserve questionPool');
  const count = level.questionsPerRun;
  if (!Number.isInteger(count) || count < 1) throw new Error('Poetry lesson must preserve questionsPerRun');
  const ids = new Set();
  const groups = new Map();
  for (const question of pool) {
    for (const field of ['id', 'poemId', 'title', 'author', 'lineText', 'answer', 'variantGroupId']) {
      if (typeof question?.[field] !== 'string' || !visibleKey(question[field])) {
        throw new Error('Poetry question missing ' + field);
      }
    }
    if (ids.has(question.id)) throw new Error('Duplicate poetry question id: ' + question.id);
    ids.add(question.id);
    if (typeof question.before !== 'string' || typeof question.after !== 'string'
      || question.before + question.answer + question.after !== question.lineText) {
      throw new Error('Poetry blank does not reconstruct original line: ' + question.id);
    }
    if (!Array.isArray(question.distractors)) throw new Error('Missing poetry distractors: ' + question.id);
    const alternatives = question.distractors.map(visibleKey);
    if (alternatives.length < 2 || alternatives.some(value => !value || value === visibleKey(question.answer))
      || new Set(alternatives).size !== alternatives.length) {
      throw new Error('Invalid poetry distractors: ' + question.id);
    }
    if (!groups.has(question.variantGroupId)) groups.set(question.variantGroupId, []);
    groups.get(question.variantGroupId).push(question);
  }
  if (groups.size !== count) {
    throw new Error('One-variant-per-group policy requires group count = questionsPerRun');
  }
  const groupList = Array.from(groups.values());
  const selected = groupList.map(variants => variants[randomIndex(variants.length, rng)]);
  const previousIds = new Set(previousRound?.itemIds || []);
  // If all selected variants repeat, change one available variant. This is an
  // explicit replay-experience constraint, rather than uniform iid sampling.
  if (previousIds.size === selected.length && selected.every(question => previousIds.has(question.id))) {
    const changeable = groupList.map((variants, index) => ({ variants, index }))
      .filter(({ variants }) => variants.length > 1);
    if (changeable.length) {
      const { variants, index } = changeable[randomIndex(changeable.length, rng)];
      const alternatives = variants.filter(question => question.id !== selected[index].id);
      selected[index] = alternatives[randomIndex(alternatives.length, rng)];
    }
  }
  const ordered = shuffleDifferent(selected, previousRound?.itemIds, question => question.id, rng);
  const lanes = balancedAnswerLanes(count, { rng, maxRun });
  const questions = ordered.map((question, index) => {
    const options = shuffleCopy(question.distractors, rng).slice(0, 2);
    options.splice(lanes[index], 0, question.answer);
    return { ...question, options, correctLane: lanes[index] };
  });
  return {
    version: ROUND_PLAN_VERSION, kind: 'poetry', roundId: newRoundId(),
    bookId, gameId: 'beat', levelId: level.id, poemId: level.poemId,
    samplingPolicy: level.samplingPolicy, sourceCount: pool.length,
    groupCount: groups.size, questionCount: count, total: count,
    itemIds: questions.map(question => question.id), questions, correctLanes: lanes
  };
}

/**
 * Distribute ALL items into waves of <= maxPairs with unique visible labels.
 * 青/qīng and 清/qīng must be in different waves. No silent slicing of content.
 * The UI must play every wave before reporting level completion.
 */
export function buildMemoryRound(items, {
  bookId, levelId, previousRound = null, maxPairs = 6, rng = Math.random
} = {}) {
  assertItems(items);
  if (!Number.isInteger(maxPairs) || maxPairs < 1) throw new RangeError('maxPairs must be >= 1');
  const ordered = shuffleDifferent(items, previousRound?.itemIds, item => item.id, rng);
  const groups = [];
  for (const item of ordered) {
    const keys = [visibleKey(item.prompt), visibleKey(item.correct)];
    if (keys[0] === keys[1]) throw new Error('Identical visible sides require another exercise type: ' + item.id);
    let group = groups.find(value => value.items.length < maxPairs && keys.every(key => !value.visible.has(key)));
    if (!group) {
      group = { items: [], visible: new Set() };
      groups.push(group);
    }
    group.items.push(item);
    keys.forEach(key => group.visible.add(key));
  }
  const waves = groups.map((group, index) => {
    const contentKey = group.items.map(item => item.id).sort().join('|');
    const previousWave = previousRound?.waves?.find(wave => wave.contentKey === contentKey);
    const cards = group.items.flatMap(item => [
      { id: item.id + ':prompt', pairKey: item.id, side: 'prompt', text: item.prompt },
      { id: item.id + ':answer', pairKey: item.id, side: 'answer', text: item.correct }
    ]);
    return {
      index, contentKey, itemIds: group.items.map(item => item.id), pairCount: group.items.length,
      cards: shuffleDifferent(cards, previousWave?.cards?.map(card => card.id), card => card.id, rng)
    };
  });
  return {
    version: ROUND_PLAN_VERSION, kind: 'memory', roundId: newRoundId(),
    bookId, gameId: 'memory', levelId, sourceCount: items.length,
    itemIds: ordered.map(item => item.id), pairCount: items.length, total: items.length,
    waveCount: waves.length, waves
  };
}

export function cardsMatch(first, second) {
  return Boolean(first && second && first.pairKey === second.pairKey && first.side !== second.side);
}
