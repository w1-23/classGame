import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const required = ['index.html', 'css/style.css', 'js/app.js', 'js/games.js', 'js/storage.js', 'main.js', 'preload.js', 'assets/mascot-idle.svg', 'assets/mascot-run.svg', 'assets/mascot-celebrate.svg', 'assets/mascot-jump.svg', 'assets/mascot-surprise.svg', 'assets/mascot-miss.svg', 'assets/mascot-wave.svg', 'tools/uninstall.ps1'];
for (const path of required) {
  const content = await readFile(path, 'utf8');
  assert.ok(content.trim().length > 0, `${path} is empty`);
}

for (const path of ['data/G1-语文-拼音识字.json', 'data/G3-英语-基础词汇听力.json', 'data/古诗-常见篇目朗读.json']) {
  const pack = JSON.parse(await readFile(path, 'utf8'));
  assert.ok(pack.id, `${path} missing id`);
}

const games = await readFile('js/games.js', 'utf8');
for (const factory of ['createRunner', 'createListen', 'createAssemble', 'createMemory', 'createBeat', 'createBattle']) {
  assert.match(games, new RegExp(`export function ${factory}\\b`), `${factory} is missing`);
}
assert.match(games, /class="gate-option" data-lane="\$\{optionLane\}"[^>]*><span>\$\{option\}<\/span>/, 'runner must render one option per lane');
assert.match(games, /container\.querySelectorAll\('\.lane'\)/, 'runner must support direct lane selection');
const style = await readFile('css/style.css', 'utf8');
assert.match(style, /\.gate\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/s, 'runner gate must have three equal option columns');
assert.match(style, /\.lanes\s*\{[^}]*inset:\s*0/s, 'runner lanes must span the full track');

const index = await readFile('index.html', 'utf8');
assert.match(index, /id="music-volume"[^>]+value="0"/, 'background music must default to zero');
assert.match(index, /id="speech-volume"[^>]+value="80"/, 'speech volume must default to 80');
assert.match(index, /id="effect-volume"[^>]+value="60"/, 'effect volume must default to 60');

for (const path of ['index.html', 'main.js', 'preload.js', 'css/style.css', 'js/app.js', 'js/games.js', 'js/storage.js', 'js/audio.js']) {
  const content = await readFile(path, 'utf8');
  const externalMatches = content.match(/https?:\/\/|fonts\.googleapis|unpkg\.com|cdn\.jsdelivr|WebSocket|XMLHttpRequest/g);
  assert.equal(externalMatches, null, `${path} must not contain external runtime requests`);
}

for (const path of [
  'audio/sfx/click_001.ogg',
  'audio/sfx/confirmation_001.ogg',
  'audio/sfx/error_001.ogg',
  'audio/music/jingles_PIZZI00.ogg',
  'audio/zh/g1-cn-01.wav',
  'audio/en/g3-en-01.wav',
  'audio/zh/poem-jingyesi.wav',
  'docs/范读审核清单.md',
  'docs/真机验收清单.md',
  'docs/教材映射模板.md',
  'docs/发布校验报告.md'
]) {
  assert.ok(await exists(path), `${path} is missing`);
}

console.log('SMOKE TEST PASSED');
