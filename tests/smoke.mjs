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
  'js/adventure.js',
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

const manifest = JSON.parse(await readFile('data/manifest.json', 'utf8'));
assert.ok(manifest.packs.length >= 26, 'manifest must include the full curriculum library');
const packs = await Promise.all(manifest.packs.map(async path => JSON.parse(await readFile(path, 'utf8'))));
const englishBooks = packs.filter(pack => pack.subject === '英语');
const chineseBooks = packs.filter(pack => pack.subject === '语文' && pack.coverage);
assert.ok(englishBooks.length >= 12, 'all 12 English books are required');
assert.ok(chineseBooks.length >= 12, 'all 12 Chinese books are required');
assert.ok(
  englishBooks.reduce((total, pack) => total + pack.units.flatMap(unit => unit.lessons).flatMap(lesson => lesson.items).length, 0) >= 1200,
  'English vocabulary corpus is incomplete'
);
assert.ok(
  chineseBooks.reduce((total, pack) => total + pack.coverage.items, 0) >= 3000,
  'Chinese character/word corpus is incomplete'
);
assert.ok(packs.some(pack => pack.id === 'g3-english-basic'), 'stable g3 English progress id changed');

const games = await readFile('js/games.js', 'utf8');
for (const factory of ['createRunner', 'createListen', 'createAssemble', 'createMemory', 'createBeat', 'createBattle']) {
  assert.match(games, new RegExp(`export function ${factory}\\b`), `${factory} is missing`);
}
assert.match(games, /mountRunnerGame/, 'runner must mount the Phaser scene');
assert.match(games, /createPausableDelay/, 'timed games must support pause-safe transitions');
assert.match(games, /createBattle/, 'teacher-confirmed battle must remain available');
assert.doesNotMatch(games, /runner-coins|coinPickups/, 'runner must be answer-only without a coin layer');
const runner = await readFile('js/runner-phaser.js', 'utf8');
assert.match(runner, /class RunnerScene extends Phaser\.Scene/, 'runner scene must extend Phaser.Scene');
assert.match(runner, /laneXAt/, 'runner must calculate three perspective lane positions');
assert.match(runner, /gateProgress/, 'runner must animate gate collision progress');
assert.match(runner, /successBurst\.explode/, 'runner must emit real particles');
assert.match(runner, /phaseBeforePause/, 'runner must support pause and resume');
assert.match(runner, /PLAYER_HEIGHT_RATIO = \.25/, 'runner player must use the approved 25% height');
assert.match(runner, /journey-complete/, 'runner must save its result as soon as the finish sign is reached');
assert.match(runner, /sfx-retry/, 'runner must use a separate retry jingle when the level is not passed');
assert.doesNotMatch(runner, /coinPickups|sfx-coin/, 'runner must not retain obsolete coin mechanics');
assert.doesNotMatch(runner, /answerBanner|playerAura|countdownHalo/, 'legacy duplicate feedback and glow layers must be removed');

const storage = await readFile('js/storage.js', 'utf8');
assert.match(storage, /PROGRESS_VERSION = 2/, 'progress store must use versioned level records');
assert.match(storage, /normalizeProgress/, 'imported progress must be structurally validated');
assert.match(storage, /migrateLegacyProgress/, 'legacy progress must migrate instead of crashing the lobby');

const poemPack = JSON.parse(await readFile('data/古诗-常见篇目朗读.json', 'utf8'));
for (const poem of poemPack.poems) {
  assert.ok(poem.cloze?.length >= 4, `${poem.id}: missing reviewed cloze questions`);
}

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
assert.match(css, /body\.map-active > header\s*\{\s*display:\s*none/, 'global header must hide on the curriculum map');
assert.match(css, /\.map-node\s*\{/, 'curriculum map must render selectable lesson nodes');
assert.match(css, /\.adventure-body\s*\{/, 'curriculum map must keep an internal responsive layout');
assert.match(css, /\.game-frame\s*\{/, 'all games must use the shared persistent game frame');

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
  'audio/kenney/retry.ogg',
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
  'docs/licenses/guanchunsheng-english-MIT.txt',
  'docs/licenses/xuepinyin-MIT.txt',
  'docs/licenses/dictation-robot-MIT.txt',
  'docs/0.3.0视觉收敛报告.md',
  'docs/0.4.0森林寻宝与诗词小剧场报告.md'
]) {
  assert.ok(await exists(path), `${path} is missing`);
}

const successJingle = await readFile('audio/kenney/result.ogg');
const retryJingle = await readFile('audio/kenney/retry.ogg');
assert.ok(successJingle.length > 0 && retryJingle.length > 0, 'completion jingles must not be empty');
assert.notDeepEqual(successJingle, retryJingle, 'success and retry must use different jingles');

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
