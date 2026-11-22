import { AudioManager } from './audio.js';
import { GAME_META, createRunner, createListen, createAssemble, createMemory, createBeat, createBattle } from './games.js';
import { loadProgress, loadSettings, saveSettings, exportProgress, PROGRESS_KEY } from './storage.js';

const app = document.querySelector('#app');
const settingsDialog = document.querySelector('#settings-dialog');
const backupDialog = document.querySelector('#backup-dialog');
const packSelect = document.querySelector('#pack-select');
let settings = loadSettings();
let packs = [];
let currentPack = null;
let activeGame = null;
const audio = new AudioManager(settings);
const gameIcons = {
  runner: 'assets/kenney/characters/adventurer-run1.png',
  listen: 'assets/kenney/characters/adventurer-talk.png',
  assemble: 'assets/kenney/ui/icon-checkmark.png',
  memory: 'assets/kenney/platformer/coin_gold.png',
  beat: 'assets/kenney/platformer/flag_green_a.png',
  battle: 'assets/kenney/platformer/flag_blue_b.png'
};

async function loadPacks() {
  if (window.learningBridge) {
    packs = await window.learningBridge.loadPacks();
  } else {
    const paths = ['data/G1-语文-拼音识字.json', 'data/G3-英语-基础词汇听力.json', 'data/古诗-常见篇目朗读.json'];
    packs = await Promise.all(paths.map(async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`无法读取内容包：${path}`);
      return response.json();
    }));
  }
  packSelect.innerHTML = packs.map(pack => `<option value="${pack.id}">${pack.name}</option>`).join('');
  packSelect.value = settings.pack;
  currentPack = packs.find(pack => pack.id === settings.pack) || packs[1];
  packSelect.value = currentPack.id;
}

function resetGame() {
  if (typeof activeGame === 'function') activeGame();
  activeGame = null;
  document.body.classList.remove('game-active');
  document.body.classList.remove('result-active');
  audio.stopMusic();
}

function renderHome() {
  resetGame();
  const progress = loadProgress();
  const packProgress = progress[currentPack.id] || { rounds: 0, bestScore: 0 };
  app.innerHTML = `
    <section class="home">
      <div class="hero">
        <div>
          <h1>离线学习闯关乐园</h1>
          <p>支持个人冒险与全班挑战，题目来自本地内容包，无需网络、账号或学生手机。</p>
          <div class="stat-row">
            <span class="pill">当前内容：${currentPack.name}</span>
            <span class="pill">累计回合：${packProgress.rounds}</span>
            <span class="pill">最佳得分：${packProgress.bestScore}</span>
          </div>
        </div>
        <div class="mascot"><img class="mascot-image" src="assets/kenney/characters/adventurer-cheer0.png" alt="冒险者角色"></div>
      </div>
      <div class="mode-grid">
        <button class="mode-card" id="personal-mode"><strong>个人冒险</strong><span>跑酷、听音、拼装、配对，本地自动判定。</span></button>
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
      runner: '三车道冲门，连击与金币反馈',
      listen: '听本地范读，找出正确内容',
      assemble: '拖动或点击字母完成拼装',
      memory: '翻牌配对，训练短时记忆',
      beat: '跟随古诗朗读击打节拍',
      battle: '两组轮流答题，老师确认计分'
    };
    const button = document.createElement('button');
    button.className = 'game-card';
    button.dataset.id = game.id;
    button.innerHTML = `
      <img src="${gameIcons[game.id]}" alt="">
      <span><strong>${game.name}</strong><small>${descriptions[game.id]}</small></span>
      <b>开始</b>`;
    (game.type === 'personal' ? personalGrid : classGrid).appendChild(button);
  });
  app.querySelectorAll('.game-grid').forEach(grid => grid.onclick = event => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    startGame(button.dataset.id);
  });
  app.querySelector('#personal-mode').onclick = () => startGame('runner');
  app.querySelector('#class-mode').onclick = renderClassLobby;
}

function renderClassLobby() {
  resetGame();
  app.innerHTML = `
    <section class="class-lobby">
      <div class="game-header">
        <div>
          <h1 class="game-title">全班挑战 · 老师主控</h1>
          <p class="hint">适合希沃大屏：先说明规则，再开始一轮；学生不需要登录或使用手机。</p>
        </div>
        <button class="ghost" id="class-back">返回大厅</button>
      </div>
      <div class="mode-grid">
        <button class="mode-card" id="class-beat">
          <strong>古诗朗读节拍</strong>
          <span>老师播放范读，学生跟随击打；系统只判断节拍，不冒充朗读发音评分。</span>
        </button>
        <button class="mode-card warning" id="class-battle">
          <strong>小组知识守护战</strong>
          <span>两组轮流答题，老师确认答案，系统负责能量条与课堂计分。</span>
        </button>
      </div>
      <div class="question-card">
        <div class="question-text">课堂流程</div>
        <div class="stat-row">
          <span class="pill">1. 宣读规则</span>
          <span class="pill">2. 学生代表操作</span>
          <span class="pill">3. 老师确认与讲评</span>
        </div>
      </div>
    </section>`;
  app.querySelector('#class-back').onclick = renderHome;
  app.querySelector('#class-beat').onclick = () => startGame('beat');
  app.querySelector('#class-battle').onclick = () => startGame('battle');
}

function finishGame(html) {
  resetGame();
  document.body.classList.add('result-active');
  app.innerHTML = html;
  app.querySelector('#game-home').onclick = renderHome;
  app.querySelector('#game-retry').onclick = () => startGame(app.dataset.currentGame);
}

function startGame(gameId) {
  resetGame();
  document.body.classList.add('game-active');
  app.dataset.currentGame = gameId;
  const beatPack = packs.find(pack => pack.poems?.length);
  const itemPack = currentPack.items?.length ? currentPack : packs.find(pack => pack.items?.length);
  const gamePack = gameId === 'beat' ? beatPack : itemPack;
  audio.effect('click');
  if (gameId === 'runner') audio.startMusic();
  const finish = finishGame;
  if (gameId === 'runner') activeGame = createRunner(app, gamePack, audio, finish, renderHome);
  if (gameId === 'listen') activeGame = createListen(app, gamePack, audio, finish);
  if (gameId === 'assemble') activeGame = createAssemble(app, gamePack, audio, finish);
  if (gameId === 'memory') activeGame = createMemory(app, gamePack, audio, finish);
  if (gameId === 'beat') activeGame = createBeat(app, gamePack, audio, finish);
  if (gameId === 'battle') activeGame = createBattle(app, gamePack, audio, finish);
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
  if (!inGame) currentPack = packs.find(pack => pack.id === settings.pack);
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
  document.querySelector('#backup-summary').textContent = `已记录 ${Object.keys(progress).length} 个内容包进度，可在本机导出或导入。`;
  backupDialog.showModal();
};
document.querySelector('#backup-export').onclick = exportProgress;
document.querySelector('#backup-import').onclick = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const text = await input.files[0].text();
    JSON.parse(text);
    localStorage.setItem(PROGRESS_KEY, text);
    renderHome();
    backupDialog.close();
  };
  input.click();
};

loadPacks().then(renderHome).catch(error => {
  app.innerHTML = `<section class="result"><h2>内容包加载失败</h2><p>${error.message}</p></section>`;
});
