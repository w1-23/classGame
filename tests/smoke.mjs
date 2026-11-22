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

const runtimeSources = [
  'index.html',
  'main.js',
  'preload.js',
  'css/style.css',
  'js/app.js',
  'js/games.js',
  'js/runner-phaser.js',
  'js/audio.js',
  'js/storage.js'
];

for (const path of runtimeSources) {
  const content = await readFile(path, 'utf8');
  assert.ok(content.trim().length > 0, `${path} is empty`);
  assert.equal(content.match(/https?:\/\/|fonts\.googleapis|unpkg\.com|cdn\.jsdelivr|WebSocket|XMLHttpRequest/g), null, `${path} contains an external runtime request`);
}

for (const path of ['data/G1-语文-拼音识字.json', 'data/G3-英语-基础词汇听力.json', 'data/古诗-常见篇目朗读.json']) {
  const pack = JSON.parse(await readFile(path, 'utf8'));
  assert.ok(pack.id, `${path} missing id`);
}

const games = await readFile('js/games.js', 'utf8');
for (const factory of ['createRunner', 'createListen', 'createAssemble', 'createMemory', 'createBeat', 'createBattle']) {
  assert.match(games, new RegExp(`export function ${factory}\\b`), `${factory} is missing`);
}
assert.match(games, /mountRunnerGame/, 'runner must mount the Phaser scene');
assert.match(games, /runner-pause-panel/, 'runner must expose pause menu tools');
assert.match(games, /gameTitlebar/, 'secondary games must share the compact title bar');
const runner = await readFile('js/runner-phaser.js', 'utf8');
assert.match(runner, /class RunnerScene extends Phaser\.Scene/, 'runner scene must extend Phaser.Scene');
assert.match(runner, /laneXAt/, 'runner must calculate three perspective lane positions');
assert.match(runner, /gateProgress/, 'runner must animate gate collision progress');
assert.match(runner, /successBurst\.explode/, 'runner must emit real particles');
assert.match(runner, /phaseBeforePause/, 'runner must support pause and resume');
assert.match(runner, /PLAYER_HEIGHT_RATIO = \.25/, 'runner player must use the approved 25% height');
assert.doesNotMatch(runner, /answerBanner|playerAura|countdownHalo/, 'legacy duplicate feedback and glow layers must be removed');

const index = await readFile('index.html', 'utf8');
assert.match(index, /vendor\/phaser\/phaser\.min\.js[\s\S]*js\/app\.js/, 'Phaser must load before the app');
assert.match(index, /id="speech-volume"[^>]+value="80"/, 'speech volume must default to 80');
assert.match(index, /id="effect-volume"[^>]+value="60"/, 'effect volume must default to 60');
assert.doesNotMatch(index, /music-volume/, 'short jingles must not be exposed as looping background music');
assert.doesNotMatch(games, /mascot-.*\.svg/, 'legacy placeholder mascot must not remain in runtime games');
const css = await readFile('css/style.css', 'utf8');
assert.doesNotMatch(css, /radial-gradient/, 'decorative radial gradients must not remain');
assert.doesNotMatch(css, /button-round|button-rectangle|button-blue\.png/, 'Kenney glossy buttons must not be used as global controls');
assert.match(css, /body\.game-active > header\s*\{\s*display:\s*none/, 'global header must hide during games');

for (const path of [
  'vendor/phaser/phaser.min.js',
  'assets/kenney/characters/adventurer-idle.png',
  'assets/kenney/characters/adventurer-run0.png',
  'assets/kenney/characters/adventurer-run1.png',
  'assets/kenney/characters/adventurer-run2.png',
  'assets/kenney/characters/adventurer-hurt.png',
  'assets/kenney/characters/adventurer-cheer0.png',
  'assets/kenney/platformer/background_solid_sky.png',
  'assets/kenney/platformer/terrain_grass_block_top.png',
  'assets/kenney/platformer/coin_gold.png',
  'assets/kenney/ui/button-blue.png',
  'assets/kenney/ui/button-green.png',
  'assets/kenney/ui/button-yellow.png',
  'assets/kenney/ui/button-round-blue.png',
  'assets/kenney/particles/star.png',
  'audio/kenney/switch_002.ogg',
  'audio/kenney/confirmation_002.ogg',
  'audio/kenney/error_004.ogg',
  'audio/kenney/result.ogg',
  'audio/music/runner-loop.ogg',
  'audio/zh/g1-cn-01.wav',
  'audio/en/g3-en-01.wav',
  'audio/zh/poem-jingyesi.wav',
  'assets/kenney/licenses/Toon-Characters-License.txt',
  'assets/kenney/licenses/New-Platformer-Pack-License.txt',
  'assets/kenney/licenses/UI-Pack-License.txt',
  'assets/kenney/licenses/Particle-Pack-License.txt',
  'assets/kenney/licenses/Interface-Sounds-License.txt',
  'assets/kenney/licenses/Music-Jingles-License.txt',
  'playwright.config.js',
  'tests/e2e/runner.spec.js',
  'tests/e2e/games.spec.js',
  'docs/范读审核清单.md',
  'docs/真机验收清单.md',
  'docs/教材映射模板.md',
  'docs/发布校验报告.md',
  'docs/licenses/Overworld-Theme-CC0.txt',
  'docs/0.3.0视觉收敛报告.md'
]) {
  assert.ok(await exists(path), `${path} is missing`);
}

for (const path of [
  'assets/kenney/licenses/Toon-Characters-License.txt',
  'assets/kenney/licenses/New-Platformer-Pack-License.txt',
  'assets/kenney/licenses/UI-Pack-License.txt',
  'assets/kenney/licenses/Particle-Pack-License.txt',
  'assets/kenney/licenses/Interface-Sounds-License.txt',
  'assets/kenney/licenses/Music-Jingles-License.txt'
]) {
  assert.match(await readFile(path, 'utf8'), /CC0/i, `${path} is not a CC0 license`);
}

assert.match(
  await readFile('docs/licenses/Overworld-Theme-CC0.txt', 'utf8'),
  /CC0[\s\S]*Louswan|Louswan[\s\S]*CC0/i,
  'runner BGM license must document Louswan and CC0'
);

console.log('SMOKE TEST PASSED');
