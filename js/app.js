import { AudioManager } from './audio.js';
import {
  GAME_META,
  createRunner,
  createListen,
  createAssemble,
  createMemory,
  createBeat,
  createBattle
} from './games.js';
import {
  MAP_WIDTH,
  MIN_MAP_HEIGHT,
  buildRoutePath,
  getAdventureLevel,
  getAdventureLevels,
  getNextLevelId,
  getPreviousLevelId,
  layoutUnitLessons,
  normalizeUnits
} from './adventure.js';
import {
  loadProgress,
  loadSettings,
  saveSettings,
  exportProgress,
  importProgress,
  getPackProgress,
  getLevelProgress,
  getWrongIds,
  getCurrentLevelId,
  getPassedLevelIds,
  setCurrentLevelId
} from './storage.js';
import { drawAdventureMap } from './adventure-map-art.js';
import {
  buildChoiceRound,
  buildMemoryRound,
  buildPoetryRound
} from './round-plan.js';

const app = document.querySelector('#app');
const settingsDialog = document.querySelector('#settings-dialog');
const backupDialog = document.querySelector('#backup-dialog');
const packSelect = document.querySelector('#pack-select');
let settings = loadSettings();
let packs = [];
let currentPack = null;
let activeGame = null;
let activeSession = null;
let mapArtResizeObserver = null;
const audio = new AudioManager(settings);
const MAP_ART_ROOT = 'assets/map-art/vector';
const LAST_ROUND_KEY = 'learning-game-last-round-v1';
const MAP_ART_META = {
  'tree-round': { width: 128, height: 160, anchorX: 64, anchorY: 140 },
  'tree-slim': { width: 128, height: 160, anchorX: 64, anchorY: 140 },
  'tree-autumn': { width: 128, height: 160, anchorX: 64, anchorY: 140 },
  pine: { width: 128, height: 160, anchorX: 64, anchorY: 140 },
  'pine-snow': { width: 128, height: 160, anchorX: 64, anchorY: 140 },
  rock: { width: 100, height: 80, anchorX: 45, anchorY: 57 },
  mountain: { width: 160, height: 150, anchorX: 80, anchorY: 140 },
  'mountain-snow': { width: 160, height: 150, anchorX: 80, anchorY: 140 },
  cloud: { width: 160, height: 80, anchorX: 80, anchorY: 52 },
  'bridge-topdown': { width: 170, height: 100, anchorX: 85, anchorY: 50 }
};

const gameIcons = {
  runner: 'assets/kenney/characters/adventurer-run1.png',
  listen: 'assets/kenney/characters/adventurer-talk.png',
  assemble: 'assets/kenney/ui/icon-checkmark.png',
  memory: 'assets/kenney/platformer/flag_green_a.png',
  beat: 'assets/kenney/platformer/flag_yellow_a.png',
  battle: 'assets/kenney/platformer/flag_blue_b.png'
};

function gameMeta(gameId) {
  return GAME_META.find(game => game.id === gameId);
}

function packLearningItems(pack) {
  return normalizeUnits(pack)
    .flatMap(unit => unit.lessons)
    .flatMap(lesson => lesson.items);
}

function lastRoundKey(packId, gameId, levelId) {
  return `${packId}/${gameId}/${levelId}`;
}

function loadLastRound(packId, gameId, levelId) {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_ROUND_KEY) || '{}');
    return stored[lastRoundKey(packId, gameId, levelId)] || null;
  } catch {
    return null;
  }
}

function saveLastRound(packId, gameId, levelId, round) {
  try {
    const stored = JSON.parse(localStorage.getItem(LAST_ROUND_KEY) || '{}');
    stored[lastRoundKey(packId, gameId, levelId)] = {
      itemIds: round.itemIds || [],
      correctLanes: round.correctLanes || [],
      waves: (round.waves || []).map(wave => ({
        contentKey: wave.contentKey,
        cards: wave.cards.map(card => ({ id: card.id }))
      }))
    };
    localStorage.setItem(LAST_ROUND_KEY, JSON.stringify(stored));
  } catch {
    // A full or unavailable storage area must not stop a new round.
  }
}

function battleRoundItems(items) {
  if (items.length % 2 === 0) return items;
  const reviewSource = items[items.length - 1];
  if (!reviewSource) return items;
  return [
    ...items,
    {
      ...reviewSource,
      id: `${reviewSource.id}::review`,
      prompt: `${reviewSource.prompt}（复习）`,
      review: true
    }
  ];
}

function getPackForGame(gameId) {
  if (gameId === 'beat') {
    return packs.find(pack => pack.poems?.length) || currentPack;
  }
  return currentPack;
}

function allPoemQuestions() {
  return packs
    .flatMap(pack => pack.poems || [])
    .flatMap(poem => (poem.cloze || []).map(question => ({
      ...question,
      poemId: poem.id,
      title: poem.title,
      author: poem.author,
      lineText: poem.lines[question.line]
    })));
}

function buildLevelPlan(gameId, levelId) {
  const pack = getPackForGame(gameId);
  if (!pack) throw new Error('没有可用的内容包。');
  const meta = gameMeta(gameId);
  const { levels } = getAdventureLevels(gameId, pack);
  const level = levels.find(item => item.id === levelId) || levels[0];
  if (!level) throw new Error('这本教材还没有可用的关卡。');
  const previousRound = loadLastRound(pack.id, gameId, level.id);
  let round = null;
  let memoryPlan = null;
  let items = [];
  let questions = [];
  let poems = [];

  if (gameId === 'beat') {
    round = buildPoetryRound(level, { bookId: pack.id, previousRound });
    questions = round.questions;
    poems = (pack.poems || []).filter(poem => poem.id === round.poemId);
  } else if (gameId === 'memory') {
    memoryPlan = buildMemoryRound(level.items, {
      bookId: pack.id,
      levelId: level.id,
      previousRound
    });
    round = memoryPlan;
    items = level.items;
  } else {
    const sourceItems = gameId === 'battle' ? battleRoundItems(level.items) : level.items;
    round = buildChoiceRound(sourceItems, {
      bookId: pack.id,
      gameId,
      levelId: level.id,
      previousRound,
      knownItems: packLearningItems(pack)
    });
    items = round.questions;
  }
  saveLastRound(pack.id, gameId, level.id, round);
  return {
    gameId,
    levelId: level.id,
    level,
    levelName: level.title,
    levelNumber: level.number,
    regionName: level.regionName,
    taskLabel: level.taskLabel,
    nextLevelId: getNextLevelId(levels, level.id),
    gameName: meta?.name || gameId,
    pack,
    items,
    poems,
    questions,
    round,
    memoryPlan
  };
}

async function loadPacks() {
  if (window.learningBridge) {
    packs = await window.learningBridge.loadPacks();
  } else {
    const manifest = await fetch('data/manifest.json').then(response => {
      if (!response.ok) throw new Error('无法读取内容清单：data/manifest.json');
      return response.json();
    });
    const paths = manifest.packs;
    packs = await Promise.all(paths.map(async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`无法读取内容包：${path}`);
      return response.json();
    }));
  }
  packSelect.innerHTML = packs.map(pack => `<option value="${pack.id}">${pack.name}</option>`).join('');
  packSelect.value = settings.pack;
  currentPack = packs.find(pack => pack.id === settings.pack) || packs.find(pack => pack.items?.length) || packs[0];
  packSelect.value = currentPack.id;
}

function resetGame() {
  mapArtResizeObserver?.disconnect();
  mapArtResizeObserver = null;
  if (activeGame && typeof activeGame.destroy === 'function') activeGame.destroy();
  else if (typeof activeGame === 'function') activeGame();
  activeGame = null;
  activeSession = null;
  document.body.classList.remove('game-active');
  document.body.classList.remove('result-active');
  document.body.classList.remove('map-active');
  audio.stopSpeech();
  audio.stopMusic();
}

function renderHome() {
  resetGame();
  const progress = loadProgress();
  const packProgress = getPackProgress(progress, currentPack.id);
  app.innerHTML = `
    <section class="home">
      <div class="hero">
        <div>
          <h1>今天，去哪里探险？</h1>
          <p>选一片风景，认识新词语；带着伙伴，走向下一站。</p>
          <div class="stat-row">
            <span class="pill">当前内容：${currentPack.name}</span>
            <span class="pill">累计回合：${packProgress.rounds}</span>
            <span class="pill">最佳正确率：${Math.round((packProgress.bestRate || 0) * 100)}%</span>
          </div>
        </div>
        <div class="mascot"><img class="mascot-image" src="assets/kenney/characters/adventurer-cheer0.png" alt="冒险者角色"></div>
      </div>
      <div class="mode-grid">
        <button class="mode-card" id="personal-mode"><strong>个人冒险</strong><span>先选关卡，再进入森林寻宝、听音、拼装或配对。</span></button>
        <button class="mode-card warning" id="class-mode"><strong>全班挑战</strong><span>一起补全诗句、轮流答题，和同学分享发现。</span></button>
      </div>
      <h2 class="section-title">个人冒险</h2>
      <div class="game-grid personal-grid"></div>
      <h2 class="section-title">全班挑战</h2>
      <div class="game-grid class-grid"></div>
    </section>`;
  const personalGrid = app.querySelector('.personal-grid');
  const classGrid = app.querySelector('.class-grid');
  GAME_META.forEach(game => {
    const descriptions = {
      runner: '看懂题目，走过正确的小路',
      listen: '听清一个词，认识一位小伙伴',
      assemble: '字母落进格子，拼出完整单词',
      memory: '翻一翻，为词语找到好伙伴',
      beat: '补全一句诗，展开一幅小画卷',
      battle: '蓝队黄队轮流，共同完成挑战'
    };
    const button = document.createElement('button');
    button.className = 'game-card';
    button.dataset.id = game.id;
    const visual = {
      runner: '<img src="assets/kenney/characters/adventurer-run1.png" alt="">',
      listen: '<img src="assets/spirits/kenney/slime_normal_rest.png" alt="">',
      assemble: '<i>A</i><i>B</i><i>C</i>',
      memory: '<img src="assets/kenney/ui/star.png" alt=""><img src="assets/kenney/ui/star.png" alt="">',
      beat: '<i>诗</i>',
      battle: '<img src="assets/kenney/platformer/flag_blue_b.png" alt=""><img src="assets/kenney/platformer/flag_yellow_a.png" alt="">'
    };
    button.innerHTML = `
      <span class="game-card-visual visual-${game.id}" aria-hidden="true">${visual[game.id]}</span>
      <span class="game-card-copy"><strong>${game.name}</strong><small>${descriptions[game.id]}</small></span>
      <b>选关</b>`;
    (game.type === 'personal' ? personalGrid : classGrid).appendChild(button);
  });
  app.querySelectorAll('.game-grid').forEach(grid => {
    grid.onclick = event => {
      const button = event.target.closest('button[data-id]');
      if (button) renderAdventureMap(button.dataset.id);
    };
  });
  app.querySelector('#personal-mode').onclick = () => renderAdventureMap('runner');
  app.querySelector('#class-mode').onclick = renderClassLobby;
}

function renderClassLobby() {
  resetGame();
  app.innerHTML = `
    <section class="class-lobby">
      <div class="game-header">
        <div>
          <h1 class="game-title">全班挑战 · 老师主控</h1>
          <p class="hint">适合希沃大屏：先选关卡，再开始一轮；学生不需要登录或使用手机。</p>
        </div>
        <button class="ghost" id="class-back">返回大厅</button>
      </div>
      <div class="mode-grid">
        <button class="mode-card" id="class-beat">
          <strong>诗词填空闯关</strong>
          <span>补全诗句，读一读完整的一句，发现诗里的风景。</span>
        </button>
        <button class="mode-card warning" id="class-battle">
          <strong>小组知识守护战</strong>
          <span>两组轮流答题，老师确认答案，系统统一保存判定与计分。</span>
        </button>
      </div>
      <div class="question-card">
        <div class="question-text">课堂流程</div>
        <div class="stat-row">
          <span class="pill">1. 选关卡</span>
          <span class="pill">2. 小组答题</span>
          <span class="pill">3. 老师确认</span>
          <span class="pill">4. 结果复习</span>
        </div>
      </div>
    </section>`;
  app.querySelector('#class-back').onclick = renderHome;
  app.querySelector('#class-beat').onclick = () => renderAdventureMap('beat');
  app.querySelector('#class-battle').onclick = () => renderAdventureMap('battle');
}

let adventureView = {
  gameId: 'runner',
  bookId: null,
  selectedLevelId: null,
  demoNotice: ''
};
let pendingMapWalk = null;

function booksForGame(gameId) {
  if (gameId === 'beat') return packs.filter(pack => pack.poems?.length);
  return packs.filter(pack => !pack.poems?.length && (pack.units?.length || pack.items?.length));
}

function previewQuestion(level) {
  if (level.items?.length) {
    const item = level.items[0];
    return {
      prompt: item.prompt,
      options: [item.correct, ...(item.distractors || [])].slice(0, 3)
    };
  }
  if (level.questions?.length) {
    const question = level.questions[0];
    return {
      prompt: `${question.before || ''}____${question.after || ''}`,
      options: [question.answer, ...(question.distractors || [])].slice(0, 3)
    };
  }
  return { prompt: level.title, options: [] };
}

function previewMarkup(level) {
  const preview = previewQuestion(level);
  return `
    <div class="scene-preview theme-${level.theme}">
      <span class="scene-cloud cloud-a"></span>
      <span class="scene-cloud cloud-b"></span>
      <svg class="scene-mountains" viewBox="0 0 220 90" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 90 L52 22 L104 90 Z"></path>
        <path d="M78 90 L140 36 L202 90 Z"></path>
        <path d="M150 90 L190 52 L220 90 Z"></path>
      </svg>
      <div class="scene-card">${preview.prompt}</div>
      <div class="scene-options">${preview.options.map(option => `<span>${option}</span>`).join('')}</div>
    </div>`;
}

function bookOptionsForGame(books, selectedId) {
  const groups = new Map();
  books.forEach(book => {
    const label = book.subject === '古诗'
      ? '古诗与晨读'
      : `${book.subject} · ${book.grade}年级`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(book);
  });
  return [...groups.entries()].map(([label, items]) => `
    <optgroup label="${label}">
      ${items.map(book => `<option value="${book.id}" ${book.id === selectedId ? 'selected' : ''}>${book.name}</option>`).join('')}
    </optgroup>`).join('');
}

function mapWaterY(theme, mapHeight, x) {
  const phase = (x / MAP_WIDTH) * Math.PI * 2 + (theme.waterPhase || 0);
  return mapHeight * theme.waterY + Math.sin(phase) * mapHeight * theme.waterAmp;
}

function mapWaterPath(theme, mapHeight) {
  const points = [];
  for (let index = 0; index <= 24; index += 1) {
    const x = (index / 24) * MAP_WIDTH;
    points.push([x, mapWaterY(theme, mapHeight, x)]);
  }
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
  };
}

function mapRouteSamples(nodeList, mapHeight) {
  const points = nodeList.map(node => ({
    x: (node.node.x / 100) * MAP_WIDTH,
    y: (node.node.y / 100) * mapHeight
  }));
  const samples = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] || next;
    const control1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6
    };
    const control2 = {
      x: next.x - (after.x - current.x) / 6,
      y: next.y - (after.y - current.y) / 6
    };
    for (let step = 0; step < 18; step += 1) {
      samples.push(cubicPoint(current, control1, control2, next, step / 18));
    }
  }
  if (points.length) samples.push(points[points.length - 1]);
  return samples;
}

function nearestRouteIndex(samples, node, mapHeight) {
  const targetX = (node.node.x / 100) * MAP_WIDTH;
  const targetY = (node.node.y / 100) * mapHeight;
  let nearest = 0;
  let distance = Infinity;
  samples.forEach((point, index) => {
    const nextDistance = (point.x - targetX) ** 2 + (point.y - targetY) ** 2;
    if (nextDistance < distance) {
      distance = nextDistance;
      nearest = index;
    }
  });
  return nearest;
}

function animateMapHero(hero, here, samples, fromNode, toNode, mapHeight) {
  if (!hero || !samples.length) return;
  const from = nearestRouteIndex(samples, fromNode, mapHeight);
  const to = nearestRouteIndex(samples, toNode, mapHeight);
  if (from === to) return;
  const direction = from < to ? 1 : -1;
  const segment = samples.slice(Math.min(from, to), Math.max(from, to) + 1);
  const ordered = direction > 0 ? segment : segment.reverse();
  const started = performance.now();
  const duration = 1050;
  const place = point => {
    const left = point.x / MAP_WIDTH * 100;
    const top = point.y / mapHeight * 100;
    hero.style.left = `${left}%`;
    hero.style.top = `${top}%`;
    if (here) {
      here.style.left = `${left}%`;
      here.style.top = `${Math.max(2, top - 7)}%`;
    }
  };
  place(ordered[0]);
  const frame = now => {
    if (!hero.isConnected) return;
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - progress) ** 3;
    const index = Math.min(ordered.length - 1, Math.round(eased * (ordered.length - 1)));
    place(ordered[index]);
    if (progress < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function mapBridgeCrossing(theme, mapHeight, nodeList) {
  const samples = mapRouteSamples(nodeList, mapHeight);
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const previousDelta = previous.y - mapWaterY(theme, mapHeight, previous.x);
    const currentDelta = current.y - mapWaterY(theme, mapHeight, current.x);
    if (previousDelta === 0 || previousDelta * currentDelta > 0) continue;
    const ratio = Math.abs(previousDelta) / Math.max(.001, Math.abs(previousDelta) + Math.abs(currentDelta));
    const x = PhaserMathLinear(previous.x, current.x, ratio);
    const y = PhaserMathLinear(previous.y, current.y, ratio);
    const angle = Math.atan2(current.y - previous.y, current.x - previous.x) * 180 / Math.PI;
    return { x, y, angle };
  }
  return null;
}

function mapWindowLevels(units, selectedUnit) {
  const allLevels = units.flatMap(unit => unit.lessons);
  const selectedLevels = selectedUnit?.lessons || [];
  if (!selectedLevels.length) return allLevels.slice(0, 12);
  if (selectedLevels.length >= 12) return selectedLevels.slice(0, 12);
  let start = allLevels.findIndex(level => level.id === selectedLevels[0].id);
  let end = start + selectedLevels.length - 1;
  while (end - start + 1 < 6) {
    const before = allLevels[start - 1];
    const after = allLevels[end + 1];
    if (!before && !after) break;
    if ((!before || end <= start) && after) {
      end += 1;
    } else if (before && (!after || start > allLevels.length - end - 2)) {
      start -= 1;
    } else {
      end += 1;
      if (end - start + 1 < 6 && start > 0) start -= 1;
    }
  }
  return allLevels.slice(start, end + 1);
}

function PhaserMathLinear(start, end, ratio) {
  return start + (end - start) * ratio;
}

function mapAssetImageMarkup(assetId, x, y, scale, decoration = '') {
  const meta = MAP_ART_META[assetId];
  if (!meta) return '';
  return `<image ${decoration} href="${MAP_ART_ROOT}/${assetId}.svg"
    x="${-meta.anchorX}" y="${-meta.anchorY}" width="${meta.width}" height="${meta.height}"
    transform="translate(${x} ${y}) scale(${scale})" preserveAspectRatio="xMidYMid meet"></image>`;
}

function flatTreeMarkup(theme, x, y, scale, variant = 0) {
  const assetId = theme.id === 'orchard'
    ? 'tree-autumn'
    : theme.id === 'coast'
      ? 'tree-slim'
      : 'tree-round';
  return mapAssetImageMarkup(assetId, x, y, scale * .42, `class="map-asset map-tree tree-${variant % 3}"`);
}

function flatPineMarkup(theme, x, y, scale, variant = 0) {
  const assetId = theme.id === 'snow' ? 'pine-snow' : 'pine';
  return mapAssetImageMarkup(assetId, x, y, scale * .42, `class="map-asset map-pine tree-${variant % 3}"`);
}

function flatRockMarkup(theme, x, y, scale, variant = 0) {
  return mapAssetImageMarkup('rock', x, y, scale * .38, `class="map-asset map-rock rock-${variant % 2}"`);
}

function mapSceneryMarkup(theme, mapHeight) {
  const placements = {
    forest: [
      [4, 92, .88, 0], [11, 86, .62, 1], [14, 75, .78, 2], [5, 66, .58, 0],
      [10, 55, .92, 2], [4, 45, .66, 1], [13, 34, .74, 0], [5, 24, .56, 2],
      [96, 91, .84, 1], [88, 84, .64, 0], [84, 73, .92, 2], [95, 63, .58, 1],
      [89, 52, .76, 0], [96, 42, .7, 2], [86, 31, .88, 1], [94, 21, .56, 0]
    ],
    stream: [
      [4, 91, .84, 1], [12, 82, .62, 0], [15, 70, .88, 2], [5, 59, .58, 1],
      [10, 47, .76, 0], [4, 36, .92, 2], [14, 25, .62, 1], [6, 15, .52, 0],
      [96, 90, .8, 0], [87, 80, .68, 2], [83, 68, .9, 1], [94, 57, .56, 0],
      [89, 45, .82, 2], [96, 34, .66, 1], [85, 23, .86, 0], [93, 13, .54, 2]
    ],
    mountain: [
      [5, 91, .82, 0], [12, 83, .58, 1], [15, 72, .78, 2], [4, 61, .64, 0],
      [11, 50, .9, 1], [5, 39, .54, 2], [14, 28, .74, 0], [6, 17, .5, 1],
      [95, 90, .76, 2], [87, 81, .64, 0], [83, 70, .88, 1], [95, 59, .58, 2],
      [88, 48, .72, 0], [95, 37, .66, 1], [85, 26, .82, 2], [93, 15, .52, 0]
    ],
    orchard: [
      [4, 92, .82, 0], [11, 84, .66, 1], [15, 73, .82, 2], [5, 62, .58, 0],
      [10, 51, .9, 1], [4, 40, .6, 2], [14, 29, .72, 0], [6, 18, .54, 1],
      [96, 91, .84, 1], [88, 82, .62, 0], [83, 71, .9, 2], [95, 60, .56, 1],
      [89, 49, .76, 0], [96, 38, .66, 2], [85, 27, .86, 1], [94, 16, .52, 0]
    ],
    coast: [
      [4, 91, .78, 1], [12, 82, .6, 0], [16, 70, .86, 2], [5, 59, .54, 1],
      [10, 48, .82, 0], [4, 37, .64, 2], [14, 26, .72, 1], [6, 15, .5, 0],
      [96, 90, .82, 2], [87, 80, .64, 1], [83, 69, .9, 0], [95, 58, .56, 2],
      [89, 47, .74, 1], [96, 36, .62, 0], [85, 25, .84, 2], [93, 14, .5, 1]
    ],
    snow: [
      [4, 92, .8, 0], [12, 83, .58, 1], [16, 72, .84, 2], [5, 61, .56, 0],
      [10, 50, .88, 1], [4, 39, .62, 2], [14, 28, .74, 0], [6, 17, .5, 1],
      [96, 91, .82, 2], [87, 81, .62, 0], [83, 70, .92, 1], [95, 59, .58, 2],
      [89, 48, .78, 0], [96, 37, .64, 1], [85, 26, .86, 2], [93, 15, .52, 0]
    ]
  }[theme.id] || [];
  const pieces = placements.map(([x, y, scale, variant]) => (
    theme.treeStyle === 'pine'
      ? flatPineMarkup(theme, x / 100 * MAP_WIDTH, y / 100 * mapHeight, scale, variant)
      : flatTreeMarkup(theme, x / 100 * MAP_WIDTH, y / 100 * mapHeight, scale, variant)
  ));
  if (theme.id === 'mountain' || theme.id === 'snow') {
    pieces.push(flatRockMarkup(theme, MAP_WIDTH * .17, mapHeight * .83, .85, 0));
    pieces.push(flatRockMarkup(theme, MAP_WIDTH * .84, mapHeight * .76, .7, 1));
  }
  if (theme.id === 'orchard') {
    pieces.push(`<g fill="#E0A348" opacity=".88">
      ${[0, 1, 2, 3, 4].map(index => `<circle cx="${MAP_WIDTH * .06 + index * 7}" cy="${mapHeight * .47 - index * 2}" r="2.2"></circle>`).join('')}
      ${[0, 1, 2, 3, 4].map(index => `<circle cx="${MAP_WIDTH * .88 + index * 6}" cy="${mapHeight * .38 + index * 2}" r="2.2"></circle>`).join('')}
    </g>`);
  }
  if (theme.id === 'snow') {
    pieces.push(`<g fill="#FFFFFF" opacity=".7">
      ${Array.from({ length: 18 }, (_, index) => `<circle cx="${8 + (index * 53) % (MAP_WIDTH - 16)}" cy="${18 + (index * 31) % (mapHeight * .48)}" r="${index % 4 === 0 ? 1.7 : .9}"></circle>`).join('')}
    </g>`);
  }
  return pieces.join('');
}

function mapForegroundMarkup(theme, mapHeight) {
  const edgeTrees = [
    [2, 98, .92, 1], [8, 97, .68, 0], [92, 98, .7, 2], [98, 96, .9, 1],
    [1, 7, .62, 2], [98, 6, .58, 0]
  ];
  const trees = edgeTrees.map(([x, y, scale, variant]) => (
    theme.treeStyle === 'pine'
      ? flatPineMarkup(theme, x / 100 * MAP_WIDTH, y / 100 * mapHeight, scale, variant)
      : flatTreeMarkup(theme, x / 100 * MAP_WIDTH, y / 100 * mapHeight, scale, variant)
  )).join('');
  const bushes = Array.from({ length: 22 }, (_, index) => {
    const side = index % 2 === 0;
    const x = side
      ? 12 + (index * 17) % 18
      : MAP_WIDTH - 12 - (index * 19) % 18;
    const y = 12 + (index * 37) % Math.max(20, mapHeight * .76);
    const radius = 2.2 + (index % 4) * .7;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(radius * 1.5).toFixed(1)}" ry="${radius.toFixed(1)}"
      fill="${theme.trees[index % theme.trees.length]}" opacity="${index % 3 === 0 ? .32 : .2}"></ellipse>`;
  }).join('');
  return `${bushes}${trees}`;
}

function mapArtMarkup(theme, routePath, mapHeight, nodes) {
  const horizon = mapHeight * .31;
  const foreground = mapHeight * .88;
  const waterPath = mapWaterPath(theme, mapHeight);
  const crossing = mapBridgeCrossing(theme, mapHeight, nodes);
  const mountains = theme.mountains.map(mountain => {
    const x = mountain.x / 100 * MAP_WIDTH;
    const width = mountain.width / 100 * MAP_WIDTH;
    const base = mountain.y / 100 * mapHeight;
    const assetId = theme.id === 'snow' ? 'mountain-snow' : 'mountain';
    return mapAssetImageMarkup(assetId, x, base, width / 160, 'class="map-asset map-mountain"');
  }).join('');
  const bridge = crossing ? `
    <g class="map-bridge" transform="translate(${crossing.x.toFixed(1)} ${crossing.y.toFixed(1)}) rotate(${crossing.angle.toFixed(1)})">
      ${mapAssetImageMarkup('bridge-topdown', 0, 0, .34, 'class="map-bridge-deck"')}
    </g>` : '';

  return `
    <svg class="map-art" viewBox="0 0 ${MAP_WIDTH} ${mapHeight}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="map-ground-${theme.id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${theme.sky}"></stop>
          <stop offset=".58" stop-color="${theme.ground}"></stop>
          <stop offset="1" stop-color="${theme.ground}"></stop>
        </linearGradient>
        <radialGradient id="map-light-${theme.id}" cx=".72" cy=".2" r=".8">
          <stop offset="0" stop-color="${theme.sun}" stop-opacity=".26"></stop>
          <stop offset="1" stop-color="${theme.sun}" stop-opacity="0"></stop>
        </radialGradient>
      </defs>
      <rect width="${MAP_WIDTH}" height="${mapHeight}" fill="url(#map-ground-${theme.id})"></rect>
      <rect width="${MAP_WIDTH}" height="${mapHeight}" fill="url(#map-light-${theme.id})"></rect>
      <path d="M0 ${horizon + 8} C ${MAP_WIDTH * .17} ${horizon - 38}, ${MAP_WIDTH * .31} ${horizon - 2}, ${MAP_WIDTH * .46} ${horizon - 30} S ${MAP_WIDTH * .75} ${horizon - 40}, ${MAP_WIDTH} ${horizon + 4} L ${MAP_WIDTH} ${mapHeight} L 0 ${mapHeight} Z" fill="${theme.ridgeFar}" opacity=".68"></path>
      ${mountains}
      <path d="M0 ${horizon + 27} C ${MAP_WIDTH * .18} ${horizon} , ${MAP_WIDTH * .37} ${horizon + 35}, ${MAP_WIDTH * .55} ${horizon + 12} S ${MAP_WIDTH * .8} ${horizon + 8}, ${MAP_WIDTH} ${horizon + 32} L ${MAP_WIDTH} ${mapHeight} L 0 ${mapHeight} Z" fill="${theme.ridgeNear}" opacity=".72"></path>
      <path d="M0 ${horizon + 48} C ${MAP_WIDTH * .22} ${horizon + 24}, ${MAP_WIDTH * .43} ${horizon + 58}, ${MAP_WIDTH * .66} ${horizon + 38} S ${MAP_WIDTH * .89} ${horizon + 48}, ${MAP_WIDTH} ${horizon + 36} L ${MAP_WIDTH} ${mapHeight} L 0 ${mapHeight} Z" fill="${theme.ground}"></path>
      <ellipse cx="${MAP_WIDTH * .18}" cy="${mapHeight * .67}" rx="${MAP_WIDTH * .25}" ry="${mapHeight * .1}" fill="${theme.ridgeFar}" opacity=".24"></ellipse>
      <ellipse cx="${MAP_WIDTH * .84}" cy="${mapHeight * .61}" rx="${MAP_WIDTH * .2}" ry="${mapHeight * .08}" fill="${theme.ridgeNear}" opacity=".2"></ellipse>
      <path d="${waterPath}" fill="none" stroke="${theme.waterBank}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" opacity=".72"></path>
      <path d="${waterPath}" fill="none" stroke="${theme.water}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="${waterPath}" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-dasharray="8 13" stroke-linecap="round" opacity=".34"></path>
      ${mapSceneryMarkup(theme, mapHeight)}
      <path d="${routePath}" fill="none" stroke="${theme.roadEdge}" stroke-width="19" stroke-linecap="round" stroke-linejoin="round" opacity=".5"></path>
      <path d="${routePath}" fill="none" stroke="${theme.road}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"></path>
      ${bridge}
      ${mapForegroundMarkup(theme, mapHeight)}
      <path d="M0 ${foreground} C ${MAP_WIDTH * .18} ${foreground - 16}, ${MAP_WIDTH * .34} ${foreground + 6}, ${MAP_WIDTH * .5} ${foreground - 10} S ${MAP_WIDTH * .78} ${foreground - 15}, ${MAP_WIDTH} ${foreground + 1} L ${MAP_WIDTH} ${mapHeight} L 0 ${mapHeight} Z" fill="${theme.groundDeep}" opacity=".28"></path>
    </svg>`;
}

function renderAdventureMap(gameId) {
  resetGame();
  document.body.classList.add('map-active');
  const meta = gameMeta(gameId);
  if (!meta) return;
  const books = booksForGame(gameId);
  if (!books.length) {
    app.innerHTML = `<section class="result"><h2>还没有可用教材</h2><p>请先在 data/manifest.json 中加入内容包。</p></section>`;
    return;
  }
  let pack = getPackForGame(gameId);
  if (!pack || !books.some(book => book.id === pack.id)) {
    pack = books.find(book => book.id === settings.pack) || books[0];
  }
  currentPack = pack;
  const { units, levels } = getAdventureLevels(gameId, pack);
  if (!units.length || !levels.length) {
    app.innerHTML = `<section class="result"><h2>这本教材还没有关卡</h2><p>${pack.name} 的内容包缺少 units 或 items。</p></section>`;
    return;
  }
  const progress = loadProgress();
  if (adventureView.gameId !== gameId || adventureView.bookId !== pack.id) {
    adventureView = { gameId, bookId: pack.id, selectedLevelId: null, demoNotice: '' };
  }
  const currentLevelId = getCurrentLevelId(progress, pack.id, gameId) || levels[0].id;
  const passed = new Set(getPassedLevelIds(progress, pack.id, gameId));
  if (!adventureView.selectedLevelId || !levels.some(level => level.id === adventureView.selectedLevelId)) {
    adventureView.selectedLevelId = levels.some(level => level.id === currentLevelId)
      ? currentLevelId
      : levels[0].id;
  }
  const selectedLevel = levels.find(level => level.id === adventureView.selectedLevelId) || levels[0];
  const selectedUnit = units.find(unit => unit.lessons.some(lesson => lesson.id === selectedLevel.id)) || units[0];
  const visibleLevels = mapWindowLevels(units, selectedUnit);
  const mapped = layoutUnitLessons(visibleLevels);
  const routePath = buildRoutePath(mapped.nodes, mapped.height);
  const routeById = new Map(mapped.nodes.map(node => [node.id, node]));
  const currentInBook = routeById.get(currentLevelId);
  const selectedProgress = getLevelProgress(progress, pack.id, gameId, selectedLevel.id);
  const completedCount = levels.filter(level => passed.has(level.id)).length;
  const returnToClass = meta.type === 'class';
  const gameOptions = GAME_META.map(game => (
    `<option value="${game.id}" ${game.id === gameId ? 'selected' : ''}>${game.name}</option>`
  )).join('');
  const bookOptions = bookOptionsForGame(books, pack.id);
  const unitTabs = units.map(unit => {
    const active = unit.id === selectedUnit.id;
    return `
      <button class="region-tab ${active ? 'active' : ''}" data-unit="${unit.id}" role="tab" aria-selected="${active}">
        <strong>第 ${unit.index + 1} 单元 · ${unit.title}</strong>
        <small>第 ${unit.firstNumber}–${unit.lastNumber} 关 · ${unit.lessons.length} 个节点</small>
      </button>`;
  }).join('');
  const nodes = mapped.nodes.map(level => {
    const isDone = passed.has(level.id);
    const isCurrent = level.id === currentLevelId;
    const isSelected = level.id === selectedLevel.id;
    return `
      <button class="map-node ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''}"
        data-level="${level.id}" style="left:${level.node.left}%;top:${level.node.top}%"
        aria-label="第 ${level.number} 关 ${level.title}"
        aria-current="${isCurrent ? 'step' : 'false'}">
        <span>${level.number}</span>
        ${isDone ? '<img class="node-check" src="assets/kenney/ui/icon-checkmark.png" alt="">' : ''}
      </button>`;
  }).join('');
  const landmarks = selectedUnit.theme.landmarks.map((label, index) => {
    const positions = [[8, 84], [82, 49], [9, 18]];
    const [left, top] = positions[index];
    return `<span class="map-landmark" style="left:${left}%;top:${top}%">${label}</span>`;
  }).join('');
  const hero = currentInBook ? `
    <img class="map-hero" src="assets/kenney/characters/adventurer-run0.png" alt="主角"
      style="left:${currentInBook.node.left}%;top:${currentInBook.node.top}%">
    <span class="map-here" style="left:${currentInBook.node.left}%;top:${Math.max(2, currentInBook.node.top - 7)}%">正在探索</span>` : '';
  const record = selectedProgress
    ? `${selectedProgress.passed ? '已完成' : '已挑战'} · 最佳 ${Math.round(selectedProgress.bestScore / Math.max(selectedProgress.bestTotal, 1) * 100)}%`
    : '尚未完成';
  const hasPlayable = selectedLevel.items?.length || selectedLevel.questions?.length;
  app.innerHTML = `
    <section class="adventure-page">
      <div class="adventure-topbar">
        <div class="adventure-brand">
          <img src="assets/kenney/ui/star.png" alt="">
          <span><strong>学习闯关乐园</strong><small>教材冒险地图</small></span>
        </div>
        <div class="adventure-selects">
          <label>选择游戏<select id="adventure-game">${gameOptions}</select></label>
          ${gameId === 'beat'
            ? `<span class="book-static">${pack.name}</span>`
            : `<label>选择教材<select id="adventure-book">${bookOptions}</select></label>`}
          <button class="ghost" id="adventure-back">返回${returnToClass ? '全班挑战' : '大厅'}</button>
        </div>
      </div>
      <div class="adventure-heading">
        <div>
          <h1>下一站，去哪里？</h1>
          <p>${pack.name} · ${meta.name} · ${units.length} 个单元</p>
        </div>
        <p class="adventure-progress">已完成 <b>${completedCount}</b> / ${levels.length} 关 · 共 ${pack.coverage?.items || levels.reduce((sum, level) => sum + (level.items?.length || level.questions?.length || 0), 0)} 条学习内容</p>
      </div>
      <div class="region-tabs" role="tablist" aria-label="教材单元">${unitTabs}</div>
      <div class="adventure-body">
        <div class="map-viewport" style="--map-ratio:${MAP_WIDTH} / ${mapped.height}">
          <div class="map-canvas theme-${selectedUnit.theme.id}" style="--map-natural-height:${mapped.height}px;background:${selectedUnit.theme.sky}">
            <canvas class="map-art-canvas" aria-hidden="true"></canvas>
            ${landmarks}
            ${nodes}
            ${hero}
          </div>
        </div>
        <aside class="map-detail">
          <p class="detail-region">${selectedUnit.title} · 第 ${selectedLevel.number} 关</p>
          <h2>${selectedLevel.title}</h2>
          <p class="detail-unit">${selectedUnit.note || `${selectedUnit.theme.name} · ${selectedLevel.regionName}`}</p>
          ${previewMarkup(selectedLevel)}
          <dl class="detail-stats">
            <div><dt>本关任务</dt><dd>${selectedLevel.taskLabel}</dd></div>
            <div><dt>当前记录</dt><dd>${record}</dd></div>
            <div><dt>地形</dt><dd>${selectedLevel.terrain}</dd></div>
          </dl>
          <button id="map-start" ${hasPlayable ? '' : 'disabled'}>主角前往第 ${selectedLevel.number} 关</button>
          <p class="detail-hint">${adventureView.demoNotice || '点击编号选择关卡；只有完成关卡才会点亮通关标记。'}</p>
        </aside>
      </div>
      <div class="map-legend">
        <span><i class="legend-dot done"></i>已完成</span>
        <span><i class="legend-dot current"></i>当前选择</span>
        <span><i class="legend-dot"></i>待探索</span>
        <span class="map-footnote">各游戏进度独立记录，老师可直接选关。</span>
      </div>
    </section>`;

  app.querySelector('#adventure-back').onclick = returnToClass ? renderClassLobby : renderHome;
  app.querySelector('#adventure-game').onchange = event => renderAdventureMap(event.target.value);
  const bookSelect = app.querySelector('#adventure-book');
  if (bookSelect) {
    bookSelect.onchange = event => {
      settings = { ...settings, pack: event.target.value };
      saveSettings(settings);
      currentPack = packs.find(book => book.id === event.target.value) || currentPack;
      packSelect.value = currentPack.id;
      adventureView.selectedLevelId = null;
      adventureView.demoNotice = '';
      renderAdventureMap(gameId);
    };
  }
  app.querySelectorAll('[data-unit]').forEach(button => {
    button.onclick = () => {
      const unit = units.find(item => item.id === button.dataset.unit);
      if (!unit?.lessons.length) return;
      adventureView.selectedLevelId = unit.lessons[0].id;
      adventureView.demoNotice = '';
      renderAdventureMap(gameId);
    };
  });
  app.querySelectorAll('[data-level]').forEach(button => {
    button.onclick = () => {
      const level = levels.find(item => item.id === button.dataset.level);
      if (!level) return;
      adventureView.selectedLevelId = level.id;
      adventureView.demoNotice = '';
      setCurrentLevelId(loadProgress(), pack.id, gameId, level.id);
      pendingMapWalk = {
        fromId: currentLevelId,
        toId: level.id
      };
      renderAdventureMap(gameId);
    };
  });
  app.querySelector('#map-start').onclick = () => startGame(gameId, selectedLevel.id);
  const mapCanvas = app.querySelector('.map-art-canvas');
  if (mapCanvas) {
    const renderMapArt = () => drawAdventureMap(mapCanvas, mapped.nodes, selectedUnit.theme);
    requestAnimationFrame(renderMapArt);
    mapArtResizeObserver?.disconnect();
    mapArtResizeObserver = new ResizeObserver(renderMapArt);
    mapArtResizeObserver.observe(app.querySelector('.map-canvas'));
  }
  if (pendingMapWalk) {
    const heroElement = app.querySelector('.map-hero');
    const here = app.querySelector('.map-here');
    const fromNode = routeById.get(pendingMapWalk.fromId);
    const toNode = routeById.get(pendingMapWalk.toId);
    if (heroElement && fromNode && toNode) {
      animateMapHero(
        heroElement,
        here,
        mapRouteSamples(mapped.nodes, mapped.height),
        fromNode,
        toNode,
        mapped.height
      );
    }
    pendingMapWalk = null;
  }
  const viewport = app.querySelector('.map-viewport');
  const focusButton = app.querySelector('.map-node.current') || app.querySelector('.map-node.selected');
  if (viewport && focusButton) {
    let scrollFrame = 0;
    const revealFocus = () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!viewport.isConnected || !focusButton.isConnected) return;
        const viewportBox = viewport.getBoundingClientRect();
        const nodeBox = focusButton.getBoundingClientRect();
        const nodeTop = viewport.scrollTop + nodeBox.top - viewportBox.top;
        const target = nodeTop - (viewport.clientHeight - nodeBox.height) / 2;
        const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        viewport.scrollTop = Math.max(0, Math.min(target, maxScroll));
      }));
    };
    revealFocus();
    window.__mapViewportObserver?.disconnect();
    window.__mapViewportObserver = new ResizeObserver(revealFocus);
    window.__mapViewportObserver.observe(viewport);
  }
  window.__learningGameDebug = {
    ...(window.__learningGameDebug || {}),
    map: {
      state: () => ({
        gameId,
        bookId: pack.id,
        levels: levels.length,
        units: units.length,
        completed: completedCount,
        displayedNodes: mapped.nodes.length,
        currentLevelId,
        selectedLevelId: selectedLevel.id,
        selectedUnitId: selectedUnit.id,
        selectedUnitLessons: selectedUnit.lessons.length
      })
    }
  };
}

function gameFrameMarkup(gameName, levelName) {
  return `
    <section class="game-frame" data-game-frame>
      <header class="game-topbar game-frame-bar">
        <button class="ghost session-back" id="game-back" type="button">← 返回</button>
        <div class="game-topbar-copy">
          <div class="game-topbar-line">
            <h1 class="game-title" id="session-title">${gameName}</h1>
            <span class="game-progress" id="session-level">${levelName}</span>
          </div>
          <p id="session-progress">准备开始</p>
        </div>
        <div class="game-frame-actions">
          <span class="session-score" id="session-score"></span>
          <button id="game-pause" class="ghost" type="button">暂停</button>
        </div>
      </header>
      <div class="session-stage" id="session-stage"></div>
      <div class="pause-overlay" id="game-pause-panel" hidden>
        <div class="pause-card">
          <h2>暂停</h2>
          <p>当前题目、计时和操作已冻结。</p>
          <div class="pause-actions">
            <button id="game-resume" type="button">继续游戏</button>
            <button class="ghost" id="game-replay" type="button">重玩本关</button>
            <button class="ghost" id="game-levels" type="button">返回地图</button>
            <button class="ghost" id="game-pause-home" type="button">返回大厅</button>
          </div>
        </div>
      </div>
    </section>`;
}

function startGame(gameId, levelId) {
  const plan = buildLevelPlan(gameId, levelId);
  const hasQuestions = gameId === 'beat' ? plan.questions.length > 0 : plan.items.length > 0;
  if (!hasQuestions) {
    renderAdventureMap(gameId);
    return;
  }
  resetGame();
  document.body.classList.add('game-active');
  app.dataset.currentGame = gameId;
  app.dataset.currentLevel = plan.levelId;
  const meta = gameMeta(gameId);
  const nextLevelId = plan.nextLevelId;
  app.innerHTML = gameFrameMarkup(meta.name, `第 ${plan.levelNumber} 关 · ${plan.levelName}`);
  const stage = app.querySelector('#session-stage');
  const pausePanel = app.querySelector('#game-pause-panel');
  const pauseButton = app.querySelector('#game-pause');
  const progressLabel = app.querySelector('#session-progress');
  const scoreLabel = app.querySelector('#session-score');
  const returnToMap = () => renderAdventureMap(gameId);
  let paused = false;
  let canPause = true;

  const session = {
    gameId,
    levelId: plan.levelId,
    levelName: plan.levelName,
    nextLevelId,
    pack: plan.pack,
    back: returnToMap,
    update({ progress, hint, score, canPause: nextCanPause } = {}) {
      if (progress !== undefined) {
        app.querySelector('#session-level').textContent = `第 ${plan.levelNumber} 关 · ${plan.levelName} · ${progress}`;
      }
      if (hint !== undefined) progressLabel.textContent = hint;
      if (score !== undefined) scoreLabel.textContent = score;
      if (nextCanPause !== undefined) {
        canPause = nextCanPause;
        pauseButton.disabled = !canPause;
        if (!canPause && paused) setPaused(false);
      }
    }
  };
  activeSession = session;

  function setPaused(nextPaused) {
    if (!canPause && nextPaused) return;
    paused = nextPaused;
    pausePanel.hidden = !paused;
    pauseButton.textContent = paused ? '继续' : '暂停';
    if (paused) {
      activeGame?.pause?.();
      audio.setMusicPaused(true);
      audio.stopSpeech();
    } else {
      activeGame?.resume?.();
      audio.setMusicPaused(false);
    }
  }

  app.querySelector('#game-back').onclick = returnToMap;
  pauseButton.onclick = () => setPaused(!paused);
  app.querySelector('#game-resume').onclick = () => setPaused(false);
  app.querySelector('#game-replay').onclick = () => startGame(gameId, plan.levelId);
  app.querySelector('#game-levels').onclick = returnToMap;
  app.querySelector('#game-pause-home').onclick = renderHome;
  const escapeHandler = event => {
    if (event.key === 'Escape' && canPause) setPaused(!paused);
  };
  window.addEventListener('keydown', escapeHandler);

  const finish = html => {
    finishGame(html, {
      gameId,
      levelId: plan.levelId,
      packId: plan.pack.id,
      nextLevelId
    });
  };
  const options = {
    items: plan.items,
    poems: plan.poems,
    questions: plan.questions,
    round: plan.round,
    memoryPlan: plan.memoryPlan,
    levelId: plan.levelId,
    areaNames: plan.level.areas,
    theme: plan.level.theme,
    regionName: plan.regionName,
    speechText: plan.pack.subject === '英语' ? 'en-US' : 'zh-CN'
  };
  audio.effect('click');
  if (gameId === 'runner') audio.startMusic();
  if (gameId === 'runner') activeGame = createRunner(stage, plan.pack, audio, finish, session, options);
  if (gameId === 'listen') activeGame = createListen(stage, plan.pack, audio, finish, session, options);
  if (gameId === 'assemble') activeGame = createAssemble(stage, plan.pack, audio, finish, session, options);
  if (gameId === 'memory') activeGame = createMemory(stage, plan.pack, audio, finish, session, options);
  if (gameId === 'beat') activeGame = createBeat(stage, plan.pack, audio, finish, session, options);
  if (gameId === 'battle') activeGame = createBattle(stage, plan.pack, audio, finish, session, options);
  const originalDestroy = activeGame?.destroy;
  const wrappedGame = activeGame || {};
  activeGame = {
    ...wrappedGame,
    destroy() {
      window.removeEventListener('keydown', escapeHandler);
      originalDestroy?.();
    }
  };
}

function finishGame(html, meta) {
  resetGame();
  document.body.classList.add('result-active');
  app.innerHTML = html;
  const levelProgress = getLevelProgress(loadProgress(), meta.packId, meta.gameId, meta.levelId);
  if (levelProgress?.passed && meta.nextLevelId) {
    setCurrentLevelId(loadProgress(), meta.packId, meta.gameId, meta.nextLevelId);
  }
  app.querySelector('#game-home').onclick = () => renderAdventureMap(meta.gameId);
  app.querySelector('#game-retry').onclick = () => startGame(meta.gameId, meta.levelId);
  const nextButton = app.querySelector('#game-next');
  if (nextButton && meta.nextLevelId) {
    nextButton.onclick = () => startGame(meta.gameId, meta.nextLevelId);
  }
}

document.querySelector('#settings-open').onclick = () => {
  packSelect.disabled = document.body.classList.contains('game-active');
  packSelect.value = currentPack.id;
  document.querySelector('#speech-volume').value = settings.speechVolume * 100;
  document.querySelector('#effect-volume').value = settings.effectVolume * 100;
  settingsDialog.showModal();
};
document.querySelector('#settings-save').onclick = event => {
  event.preventDefault();
  const inGame = document.body.classList.contains('game-active');
  settings = {
    ...settings,
    pack: inGame ? settings.pack : packSelect.value,
    speechVolume: document.querySelector('#speech-volume').value / 100,
    effectVolume: document.querySelector('#effect-volume').value / 100
  };
  saveSettings(settings);
  audio.settings = settings;
  if (!inGame) currentPack = packs.find(pack => pack.id === settings.pack) || currentPack;
  settingsDialog.close();
  if (!inGame) renderHome();
};
document.querySelector('#audio-test').onclick = async () => {
  audio.effect('click');
  await audio.speech('audio/en/g3-en-01.wav');
};
document.querySelector('#fullscreen-toggle').onclick = async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
};
document.querySelector('#backup-open').onclick = () => {
  const progress = loadProgress();
  document.querySelector('#backup-summary').textContent = `已记录 ${Object.keys(progress.packs).length} 个内容包进度，可在本机导出或导入。`;
  backupDialog.showModal();
};
document.querySelector('#backup-export').onclick = exportProgress;
document.querySelector('#backup-import').onclick = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const summary = document.querySelector('#backup-summary');
    try {
      const text = await input.files[0].text();
      importProgress(text);
      summary.textContent = '存档已导入，旧格式记录也已迁移。';
      renderHome();
      backupDialog.close();
    } catch (error) {
      summary.textContent = `导入失败，原存档未改动：${error.message}`;
    }
  };
  input.click();
};

loadPacks().then(renderHome).catch(error => {
  app.innerHTML = `<section class="result"><h2>内容包加载失败</h2><p>${error.message}</p></section>`;
});
