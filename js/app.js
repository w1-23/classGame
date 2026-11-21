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
}

function renderHome() {
  resetGame();
  audio.stopMusic();
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
        <div class="mascot"><img class="mascot-image mascot-animation" src="assets/mascot-idle.svg" alt="知识岛小精灵"></div>
      </div>
      <div class="mode-grid">
        <button class="mode-card" id="personal-mode"><strong>个人冒险</strong><span>跑酷、听音、拼装、配对，本地自动判定。</span></button>
        <button class="mode-card warning" id="class-mode"><strong>全班挑战</strong><span>一块大屏主持，老师确认朗读与答案。</span></button>
      </div>
      <h2 class="section-title">选择玩法</h2>
      <div class="game-grid"></div>
    </section>`;
  const grid = app.querySelector('.game-grid');
  GAME_META.forEach(game => {
    const button = document.createElement('button');
    button.textContent = game.name;
    button.dataset.id = game.id;
    grid.appendChild(button);
  });
  grid.onclick = event => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    startGame(button.dataset.id);
  };
  app.querySelector('#personal-mode').onclick = () => startGame('runner');
  app.querySelector('#class-mode').onclick = () => startGame('battle');
}

function finishGame(html) {
  app.innerHTML = html;
  app.querySelector('#game-home').onclick = renderHome;
  app.querySelector('#game-retry').onclick = () => startGame(app.dataset.currentGame);
}

function startGame(gameId) {
  resetGame();
  app.dataset.currentGame = gameId;
  const beatPack = packs.find(pack => pack.poems?.length);
  const itemPack = currentPack.items?.length ? currentPack : packs.find(pack => pack.items?.length);
  const gamePack = gameId === 'beat' ? beatPack : itemPack;
  audio.effect('click');
  if (settings.musicVolume > 0) audio.startMusic();
  const finish = finishGame;
  if (gameId === 'runner') activeGame = createRunner(app, gamePack, audio, finish);
  if (gameId === 'listen') createListen(app, gamePack, audio, finish);
  if (gameId === 'assemble') createAssemble(app, gamePack, audio, finish);
  if (gameId === 'memory') createMemory(app, gamePack, audio, finish);
  if (gameId === 'beat') activeGame = createBeat(app, gamePack, audio, finish);
  if (gameId === 'battle') createBattle(app, gamePack, audio, finish);
}

document.querySelector('#settings-open').onclick = () => {
  packSelect.value = currentPack.id;
  document.querySelector('#music-volume').value = settings.musicVolume * 100;
  document.querySelector('#speech-volume').value = settings.speechVolume * 100;
  document.querySelector('#effect-volume').value = settings.effectVolume * 100;
  settingsDialog.showModal();
};
document.querySelector('#settings-save').onclick = event => {
  event.preventDefault();
  settings = {
    pack: packSelect.value,
    musicVolume: document.querySelector('#music-volume').value / 100,
    speechVolume: document.querySelector('#speech-volume').value / 100,
    effectVolume: document.querySelector('#effect-volume').value / 100
  };
  saveSettings(settings);
  currentPack = packs.find(pack => pack.id === settings.pack);
  settingsDialog.close();
  renderHome();
};
document.querySelector('#audio-test').onclick = async () => {
  audio.effect('click');
  await audio.speech('audio/en/g3-en-01.wav');
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
