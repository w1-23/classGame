export const SETTINGS_KEY = 'learning-game-settings-v1';
export const PROGRESS_KEY = 'learning-game-progress-v1';

const defaultSettings = {
  pack: 'g3-english-basic',
  musicVolume: 0,
  speechVolume: 0.8,
  effectVolume: 0.6
};

export function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function recordResult(game, packId, score, total) {
  const progress = loadProgress();
  progress[packId] ||= { games: {}, bestScore: 0, rounds: 0 };
  progress[packId].rounds += 1;
  progress[packId].bestScore = Math.max(progress[packId].bestScore, score);
  progress[packId].games[game] = { score, total, updatedAt: Date.now() };
  saveProgress(progress);
}

export function exportProgress() {
  const blob = new Blob([localStorage.getItem(PROGRESS_KEY) || '{}'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `learning-game-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
