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

const app = document.querySelector('#app');
const settingsDialog = document.querySelector('#settings-dialog');
const backupDialog = document.querySelector('#backup-dialog');
const packSelect = document.querySelector('#pack-select');
let settings = loadSettings();
let packs = [];
let currentPack = null;
let activeGame = null;
let activeSession = null;
const audio = new AudioManager(settings);
const MAP_ART_ROOT = 'assets/map-art/vector';
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
  const items = gameId === 'beat' ? [] : level.items.slice();
  const poems = gameId === 'beat' ? (pack.poems || []) : [];
  const questions = gameId === 'beat' ? (level.questions || []) : [];
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
    questions
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
          <h1>离线学习闯关乐园</h1>
          <p>支持个人冒险与全班挑战，题目来自本地内容包，无需网络、账号或学生手机。</p>
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
        <button class="mode-card warning" id="class-mode"><strong>全班挑战</strong><span>一块大屏主持，老师确认朗读与答案。</span></button>
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
      runner: '看题选路，一路寻宝',
      listen: '听本地范读，找出正确内容',
      assemble: '点击字母完成拼装',
      memory: '翻牌配对，统计真实尝试次数',
      beat: '从审核过的诗句变体中随机填空',
      battle: '两组轮流答题，老师确认计分'
    };
    const button = document.createElement('button');
    button.className = 'game-card';
    button.dataset.id = game.id;
    button.innerHTML = `
      <img src="${gameIcons[game.id]}" alt="">
      <span><strong>${game.name}</strong><small>${descriptions[game.id]}</small></span>
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
          <span>从审核过的诗句挖空题中随机抽取，答后展示完整诗句复习。</span>
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
    forest: [[6, 48, .78, 0], [12, 57, .62, 1], [16, 44, .46, 2], [92, 45, .72, 1], [95, 56, .88, 0], [85, 38, .48, 2]],
    stream: [[5, 42, .64, 0], [10, 52, .82, 1], [15, 38, .46, 2], [93, 43, .7, 2], [88, 54, .88, 0], [82, 34, .48, 1]],
    mountain: [[7, 70, .9, 0], [13, 79, .62, 1], [91, 68, .82, 2], [84, 81, .58, 0]],
    orchard: [[5, 42, .72, 0], [10, 52, .92, 1], [16, 39, .5, 2], [94, 44, .8, 1], [88, 55, .68, 0], [82, 33, .46, 2]],
    coast: [[6, 38, .66, 0], [12, 51, .82, 1], [17, 42, .44, 2], [94, 40, .74, 2], [88, 53, .92, 0], [82, 34, .48, 1]],
    snow: [[5, 42, .72, 0], [11, 53, .9, 1], [16, 38, .52, 2], [94, 43, .8, 2], [88, 55, .66, 0], [82, 34, .46, 1]]
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

function mapArtMarkup(theme, routePath, mapHeight, nodes) {
  const horizon = mapHeight * .45;
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
  const clouds = [[11, 12, 1], [48, 8, .7], [80, 16, 1.1]].map(([x, y, scale]) => `
    ${mapAssetImageMarkup('cloud', x / 100 * MAP_WIDTH, y / 100 * mapHeight, scale * .48, 'class="map-asset map-cloud"')}`).join('');

  return `
    <svg class="map-art" viewBox="0 0 ${MAP_WIDTH} ${mapHeight}" preserveAspectRatio="none" aria-hidden="true">
      <rect width="${MAP_WIDTH}" height="${mapHeight}" fill="${theme.sky}"></rect>
      <circle cx="${MAP_WIDTH * .8}" cy="${mapHeight * .12}" r="${Math.max(16, mapHeight * .035)}" fill="${theme.sun}" opacity=".9"></circle>
      ${clouds}
      <path d="M0 ${horizon - 10} C ${MAP_WIDTH * .18} ${horizon - 54}, ${MAP_WIDTH * .32} ${horizon - 18}, ${MAP_WIDTH * .48} ${horizon - 39} S ${MAP_WIDTH * .76} ${horizon - 56}, ${MAP_WIDTH} ${horizon - 12} L ${MAP_WIDTH} ${mapHeight} L 0 ${mapHeight} Z" fill="${theme.ridgeFar}" opacity=".78"></path>
      ${mountains}
      <path d="M0 ${horizon + 10} C ${MAP_WIDTH * .2} ${horizon - 21}, ${MAP_WIDTH * .38} ${horizon + 20}, ${MAP_WIDTH * .56} ${horizon - 6} S ${MAP_WIDTH * .8} ${horizon - 12}, ${MAP_WIDTH} ${horizon + 12} L ${MAP_WIDTH} ${mapHeight} L 0 ${mapHeight} Z" fill="${theme.ridgeNear}" opacity=".92"></path>
      <path d="M0 ${horizon + 31} C ${MAP_WIDTH * .22} ${horizon + 8}, ${MAP_WIDTH * .45} ${horizon + 43}, ${MAP_WIDTH * .68} ${horizon + 22} S ${MAP_WIDTH * .88} ${horizon + 36}, ${MAP_WIDTH} ${horizon + 20} L ${MAP_WIDTH} ${mapHeight} L 0 ${mapHeight} Z" fill="${theme.ground}"></path>
      <ellipse cx="${MAP_WIDTH * .2}" cy="${mapHeight * .7}" rx="${MAP_WIDTH * .22}" ry="${mapHeight * .09}" fill="${theme.ridgeFar}" opacity=".3"></ellipse>
      <ellipse cx="${MAP_WIDTH * .83}" cy="${mapHeight * .78}" rx="${MAP_WIDTH * .19}" ry="${mapHeight * .07}" fill="${theme.ridgeNear}" opacity=".24"></ellipse>
      <path d="${waterPath}" fill="none" stroke="${theme.waterBank}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" opacity=".72"></path>
      <path d="${waterPath}" fill="none" stroke="${theme.water}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="${waterPath}" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-dasharray="8 13" stroke-linecap="round" opacity=".34"></path>
      ${mapSceneryMarkup(theme, mapHeight)}
      <path d="${routePath}" fill="none" stroke="${theme.roadEdge}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity=".55"></path>
      <path d="${routePath}" fill="none" stroke="${theme.road}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"></path>
      ${bridge}
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
  const selectedUnitIndex = units.indexOf(selectedUnit);
  const mapped = layoutUnitLessons(selectedUnit.lessons);
  const routePath = buildRoutePath(mapped.nodes, mapped.height);
  const routeById = new Map(mapped.nodes.map(node => [node.id, node]));
  const currentInUnit = routeById.get(currentLevelId);
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
  const hero = currentInUnit ? `
    <img class="map-hero" src="assets/kenney/characters/adventurer-run0.png" alt="主角"
      style="left:${currentInUnit.node.left + 5}%;top:${currentInUnit.node.top - 3}%">
    <span class="map-here" style="left:${currentInUnit.node.left + 5}%;top:${currentInUnit.node.top - 10}%">正在探索</span>` : '';
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
          <div class="map-canvas theme-${selectedUnit.theme.id}" style="height:${mapped.height}px;background:${selectedUnit.theme.sky}">
            ${mapArtMarkup(selectedUnit.theme, routePath, mapped.height, mapped.nodes)}
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
      const previous = routeById.get(currentLevelId);
      adventureView.selectedLevelId = level.id;
      adventureView.demoNotice = '';
      setCurrentLevelId(loadProgress(), pack.id, gameId, level.id);
      const nextNode = routeById.get(level.id);
      if (previous && nextNode) pendingMapWalk = { from: previous.node, to: nextNode.node };
      renderAdventureMap(gameId);
    };
  });
  app.querySelector('#map-start').onclick = () => startGame(gameId, selectedLevel.id);
  if (pendingMapWalk) {
    const heroElement = app.querySelector('.map-hero');
    const here = app.querySelector('.map-here');
    if (heroElement) {
      const walk = pendingMapWalk;
      heroElement.style.transition = 'none';
      heroElement.style.left = `${walk.from.x + 5}%`;
      heroElement.style.top = `${walk.from.y - 3}%`;
      if (here) {
        here.style.transition = 'none';
        here.style.left = `${walk.from.x + 5}%`;
        here.style.top = `${walk.from.y - 10}%`;
      }
      void heroElement.offsetWidth;
      requestAnimationFrame(() => {
        heroElement.style.transition = 'left 1.05s cubic-bezier(.34,.7,.3,1), top 1.05s cubic-bezier(.34,.7,.3,1)';
        heroElement.style.left = `${walk.to.x + 5}%`;
        heroElement.style.top = `${walk.to.y - 3}%`;
        if (here) {
          here.style.transition = 'left 1.05s cubic-bezier(.34,.7,.3,1), top 1.05s cubic-bezier(.34,.7,.3,1)';
          here.style.left = `${walk.to.x + 5}%`;
          here.style.top = `${walk.to.y - 10}%`;
        }
      });
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
