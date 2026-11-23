export const SETTINGS_KEY = 'learning-game-settings-v1';
export const PROGRESS_KEY = 'learning-game-progress-v1';

const CORRUPT_PROGRESS_KEY = 'classGame.progress.corrupt.v1';
const PROGRESS_VERSION = 2;
const PASS_RATIO = 0.6;

const defaultSettings = {
  pack: 'g3-english-pep-2024-a',
  speechVolume: 0.8,
  effectVolume: 0.6
};

function emptyProgress() {
  return {
    version: PROGRESS_VERSION,
    packs: {}
  };
}

function finiteScore(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
}

function normalizeLevel(level) {
  const source = level && typeof level === 'object' ? level : {};
  return {
    completed: source.completed === true,
    passed: source.passed === true || (source.passed === undefined && source.completed === true),
    attempts: finiteScore(source.attempts),
    bestScore: finiteScore(source.bestScore),
    bestTotal: finiteScore(source.bestTotal),
    lastScore: finiteScore(source.lastScore),
    lastTotal: finiteScore(source.lastTotal),
    wrongIds: Array.isArray(source.wrongIds)
      ? [...new Set(source.wrongIds.filter(id => typeof id === 'string'))]
      : [],
    updatedAt: finiteScore(source.updatedAt)
  };
}

function normalizeGame(game) {
  const source = game && typeof game === 'object' ? game : {};
  const levels = source.levels && typeof source.levels === 'object' ? source.levels : {};
  return {
    levels: Object.fromEntries(
      Object.entries(levels).map(([levelId, level]) => [levelId, normalizeLevel(level)])
    ),
    currentLevelId: typeof source.currentLevelId === 'string' ? source.currentLevelId : null
  };
}

function normalizePack(pack) {
  const source = pack && typeof pack === 'object' ? pack : {};
  const games = source.games && typeof source.games === 'object' ? source.games : {};
  return {
    rounds: finiteScore(source.rounds),
    bestRate: Number.isFinite(Number(source.bestRate))
      ? Math.max(0, Math.min(1, Number(source.bestRate)))
      : 0,
    games: Object.fromEntries(
      Object.entries(games).map(([gameId, game]) => [gameId, normalizeGame(game)])
    )
  };
}

function migrateLegacyProgress(source) {
  const progress = emptyProgress();
  Object.entries(source).forEach(([packId, pack]) => {
    if (!pack || typeof pack !== 'object') return;
    const normalized = normalizePack(pack);
    const legacyGames = pack.games && typeof pack.games === 'object' ? pack.games : {};
    Object.entries(legacyGames).forEach(([gameId, result]) => {
      if (!result || typeof result !== 'object') return;
      normalized.games[gameId] ||= { levels: {}, currentLevelId: null };
      normalized.games[gameId].levels.legacy = normalizeLevel({
        completed: true,
        attempts: 1,
        bestScore: result.score,
        bestTotal: result.total,
        lastScore: result.score,
        lastTotal: result.total,
        updatedAt: result.updatedAt
      });
    });
    const best = Object.values(normalized.games)
      .flatMap(game => Object.values(game.levels))
      .filter(level => level.bestTotal > 0)
      .reduce((max, level) => Math.max(max, level.bestScore / level.bestTotal), 0);
    if (!normalized.bestRate) normalized.bestRate = best;
    progress.packs[packId] = normalized;
  });
  return progress;
}

function normalizeProgress(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('存档必须是 JSON 对象。');
  }
  if (source.version === PROGRESS_VERSION) {
    if (!source.packs || typeof source.packs !== 'object' || Array.isArray(source.packs)) {
      throw new Error('存档缺少 packs 数据。');
    }
    return {
      version: PROGRESS_VERSION,
      packs: Object.fromEntries(
        Object.entries(source.packs).map(([packId, pack]) => [packId, normalizePack(pack)])
      )
    };
  }
  const entries = Object.entries(source);
  const hasGames = entries.some(([, pack]) =>
    pack && typeof pack === 'object' && !Array.isArray(pack)
    && pack.games && typeof pack.games === 'object' && !Array.isArray(pack.games)
  );
  const looksLegacy = source.version === undefined && entries.length > 0 && hasGames
    && entries.every(([, pack]) => pack && typeof pack === 'object' && !Array.isArray(pack));
  if (!looksLegacy) throw new Error('这不是本应用支持的存档文件。');
  return migrateLegacyProgress(source);
}

export function loadSettings() {
  try {
    const source = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return source && typeof source === 'object' && !Array.isArray(source)
      ? { ...defaultSettings, ...source }
      : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadProgress() {
  const raw = localStorage.getItem(PROGRESS_KEY);
  if (!raw) return emptyProgress();

  try {
    return normalizeProgress(JSON.parse(raw));
  } catch {
    try {
      localStorage.setItem(CORRUPT_PROGRESS_KEY, raw);
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(emptyProgress()));
    } catch {
      // A read-only or full storage area should not stop the lobby from loading.
    }
    return emptyProgress();
  }
}

export function saveProgress(progress) {
  const normalized = normalizeProgress(progress);
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function recordResult({
  game,
  packId,
  levelId = 'practice',
  score,
  total,
  attempts = 1,
  wrongIds = []
}) {
  const progress = loadProgress();
  const pack = progress.packs[packId] ||= { rounds: 0, bestRate: 0, games: {} };
  const gameProgress = pack.games[game] ||= { levels: {} };
  const previous = gameProgress.levels[levelId];
  const normalizedScore = finiteScore(score);
  const normalizedTotal = Math.max(1, finiteScore(total));
  const rate = Math.max(0, Math.min(1, normalizedScore / normalizedTotal));
  const uniqueWrongIds = [...new Set(wrongIds.filter(id => typeof id === 'string'))];
  const currentBestRate = previous?.bestTotal > 0
    ? previous.bestScore / previous.bestTotal
    : -1;

  gameProgress.levels[levelId] = normalizeLevel({
    completed: true,
    passed: previous?.passed === true || rate >= PASS_RATIO,
    attempts: (previous?.attempts || 0) + 1,
    bestScore: rate >= currentBestRate ? normalizedScore : previous.bestScore,
    bestTotal: rate >= currentBestRate ? normalizedTotal : previous.bestTotal,
    lastScore: normalizedScore,
    lastTotal: normalizedTotal,
    wrongIds: uniqueWrongIds,
    updatedAt: Date.now()
  });
  pack.rounds += 1;
  pack.bestRate = Math.max(pack.bestRate || 0, rate);
  saveProgress(progress);
  return progress;
}

export function getPackProgress(progress, packId) {
  return progress.packs[packId] || { rounds: 0, bestRate: 0, games: {} };
}

export function getLevelProgress(progress, packId, game, levelId) {
  return progress.packs[packId]?.games?.[game]?.levels?.[levelId] || null;
}

export function getGameProgress(progress, packId, game) {
  return progress.packs[packId]?.games?.[game] || { levels: {}, currentLevelId: null };
}

export function getCurrentLevelId(progress, packId, game) {
  return getGameProgress(progress, packId, game).currentLevelId || null;
}

export function setCurrentLevelId(progress, packId, game, levelId) {
  const pack = progress.packs[packId] ||= { rounds: 0, bestRate: 0, games: {} };
  const gameProgress = pack.games[game] ||= { levels: {}, currentLevelId: null };
  gameProgress.currentLevelId = typeof levelId === 'string' && levelId ? levelId : null;
  return saveProgress(progress);
}

export function getPassedLevelIds(progress, packId, game) {
  const levels = getGameProgress(progress, packId, game).levels || {};
  return Object.entries(levels)
    .filter(([, level]) => level.passed === true)
    .map(([levelId]) => levelId)
    .sort();
}

export function countPassedLevels(progress, packId, game) {
  return getPassedLevelIds(progress, packId, game).length;
}

export function getWrongIds(progress, packId, game) {
  const levels = progress.packs[packId]?.games?.[game]?.levels || {};
  return [...new Set(Object.values(levels).flatMap(level => level.wrongIds || []))];
}

export function importProgress(text) {
  const parsed = JSON.parse(text);
  const progress = normalizeProgress(parsed);
  saveProgress(progress);
  return progress;
}

export function exportProgress() {
  const progress = loadProgress();
  const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `learning-game-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
