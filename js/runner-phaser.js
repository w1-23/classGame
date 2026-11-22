import { completionSound } from './audio.js';
import { WORLD_THEMES } from './world-themes.js';

const Phaser = window.Phaser;

const QUESTION_SECONDS = 8;
const COUNTDOWN_SECONDS = 3;
const STAGE_SIZE = 2;
const PLAYER_SOURCE_HEIGHT = 128;
const PLAYER_HEIGHT_RATIO = .25;
const MAX_GATE_VISUAL = .96;
const WOOD_DARK = 0x805f3e;
const WOOD_LIGHT = 0xf2e6c8;
const INK_GREEN = '#183d2d';
const WORLD_STAGES = Object.fromEntries(WORLD_THEMES.map(theme => [theme.id, theme.stages]));

function shuffle(list) {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function optionList(item) {
  return shuffle([item.correct, ...item.distractors]);
}

function uiFont() {
  return '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
}

function inverseEase(value) {
  return Math.pow(Phaser.Math.Clamp(value, 0, 1), 1 / 1.45);
}

class RunnerScene extends Phaser.Scene {
  constructor(options) {
    super({ key: 'runner' });
    this.items = options.items;
    this.pack = options.pack;
    this.effectVolume = options.effectVolume;
    this.theme = options.theme || 'forest';
    this.stagePaletteIndex = -1;
    this.palette = (WORLD_STAGES[this.theme] || WORLD_STAGES.forest)[0];
    this.areaNames = options.areaNames?.length
      ? [...options.areaNames]
      : (WORLD_STAGES[this.theme] || WORLD_STAGES.forest).map(area => area.sceneName);
    this.onComplete = options.onComplete;
    this.eventsBus = options.events;
    this.index = 0;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lane = 1;
    this.phase = 'loading';
    this.phaseBeforePause = 'countdown';
    this.countdown = COUNTDOWN_SECONDS;
    this.countdownDigit = COUNTDOWN_SECONDS;
    this.gateProgress = 0;
    this.transitionRemaining = 0;
    this.answers = [];
    this.currentItem = null;
    this.options = [];
    this.feedback = { visible: false, kind: 'correct', title: '', body: '' };
    this.sceneryClock = 0;
    this.playerClock = 0;
    this.hudClock = 0;
    this.playerPose = 'idle';
    this.audioLog = [];
    this.celebrateTimer = null;
    this.finished = false;
    this.completeEmitted = false;
    this.laneTween = null;
  }

  preload() {
    const character = 'assets/kenney/characters';
    const platformer = 'assets/kenney/platformer';
    const ui = 'assets/kenney/ui';
    const particles = 'assets/kenney/particles';
    const mapArt = 'assets/map-art/raster';
    [
      ['char-idle', `${character}/adventurer-idle.png`],
      ['char-run0', `${character}/adventurer-run0.png`],
      ['char-run1', `${character}/adventurer-run1.png`],
      ['char-run2', `${character}/adventurer-run2.png`],
      ['char-hurt', `${character}/adventurer-hurt.png`],
      ['char-cheer0', `${character}/adventurer-cheer0.png`],
      ['char-cheer1', `${character}/adventurer-cheer1.png`],
      ['sky', `${platformer}/background_solid_sky.png`],
      ['clouds', `${platformer}/background_clouds.png`],
      ['trees', `${platformer}/background_color_trees.png`],
      ['bush', `${platformer}/bush.png`],
      ['grass', `${platformer}/grass.png`],
      ['rock', `${platformer}/rock.png`],
      ['stage-bridge', `${platformer}/bridge.png`],
      ['stage-flag-green', `${platformer}/flag_green_a.png`],
      ['stage-flag-yellow', `${platformer}/flag_yellow_a.png`],
      ['stage-flag-blue', `${platformer}/flag_blue_a.png`],
      ['stage-mushroom', `${platformer}/mushroom_red.png`],
      ['ui-check', `${ui}/icon-checkmark.png`],
      ['ui-cross', `${ui}/icon-cross.png`],
      ['fx-star', `${particles}/star.png`],
      ['fx-spark', `${particles}/spark.png`],
      ['fx-circle', `${particles}/circle.png`],
      ['map-tree-round', `${mapArt}/tree-round@2x.png`],
      ['map-tree-slim', `${mapArt}/tree-slim@2x.png`],
      ['map-tree-autumn', `${mapArt}/tree-autumn@2x.png`],
      ['map-pine', `${mapArt}/pine@2x.png`],
      ['map-pine-snow', `${mapArt}/pine-snow@2x.png`]
    ].forEach(([key, path]) => this.load.image(key, path));

    this.load.audio('sfx-switch', 'audio/kenney/switch_002.ogg');
    this.load.audio('sfx-correct', 'audio/kenney/confirmation_002.ogg');
    this.load.audio('sfx-wrong', 'audio/kenney/error_004.ogg');
    this.load.audio('sfx-hurt', 'audio/kenney/hurt.ogg');
    this.load.audio('sfx-finish', 'audio/kenney/result.ogg');
    this.load.audio('sfx-retry', 'audio/kenney/retry.ogg');
  }

  create() {
    this.sound.volume = Phaser.Math.Clamp(this.effectVolume, 0, 1);
    this.createBackground();
    this.roadGfx = this.add.graphics().setDepth(2);
    this.createScenery();
    this.createPlayer();
    this.createParticles();
    this.createCountdown();
    this.createControls();
    this.layout();

    this.scale.on('resize', this.layout, this);
    this.eventsBus.on('pause', this.pause, this);
    this.eventsBus.on('resume', this.resume, this);
    this.eventsBus.on('finish', this.finishJourney, this);
    this.eventsBus.on('restart', this.restartJourney, this);
    this.switchLaneHandler = lane => this.switchLane(lane);
    this.eventsBus.on('switch-lane', this.switchLaneHandler);

    this.publishDebug();
    this.startJourney();
  }

  createBackground() {
    this.createTreeCutout();
    this.skyBackdrop = this.add.graphics().setDepth(-30);
    this.celestialGfx = this.add.graphics().setDepth(-28);
    this.distantGfx = this.add.graphics().setDepth(-24);
    this.hillGfx = this.add.graphics().setDepth(-22);
    this.landmarkGfx = this.add.graphics().setDepth(-9);
    this.detailGfx = this.add.graphics().setDepth(-6);
    this.bridgeGfx = this.add.graphics().setDepth(2.4);
    this.cloudLayer = this.add.tileSprite(0, 0, 10, 10, 'clouds')
      .setOrigin(0)
      .setTint(0xfffdf0)
      .setAlpha(.7)
      .setDepth(-26);
    this.treeLine = this.add.tileSprite(0, 0, 10, 10, 'trees-cutout')
      .setOrigin(.5, 1)
      .setTint(this.palette.treeTint)
      .setAlpha(.44)
      .setDepth(-12);
    this.stageProps = [];
    this.stagePropSignature = '';
  }

  createTreeCutout() {
    if (this.textures.exists('trees-cutout')) return;
    const source = this.textures.get('trees').getSourceImage();
    const top = 100;
    const height = source.height - top;
    const texture = this.textures.createCanvas('trees-cutout', source.width, height);
    const context = texture.context;
    context.drawImage(source, 0, top, source.width, height, 0, 0, source.width, height);
    const pixels = context.getImageData(0, 0, source.width, height);
    for (let index = 3; index < pixels.data.length; index += 4) {
      if (
        pixels.data[index - 3] > 228
        && Math.abs(pixels.data[index - 3] - pixels.data[index - 2]) < 12
        && Math.abs(pixels.data[index - 2] - pixels.data[index - 1]) < 12
      ) {
        pixels.data[index] = 0;
      }
    }
    context.putImageData(pixels, 0, 0);
    texture.refresh();
  }

  makeTreeActor(index, side) {
    const root = this.add.container(0, 0).setDepth(3 + index % 4);
    const shadow = this.add.ellipse(0, -2, 118, 22, 0x355936, .16);
    const sprite = this.add.image(0, 0, 'map-tree-round')
      .setOrigin(.5, .875)
      .setDisplaySize(128, 160);
    root.add([shadow, sprite]);
    const actor = {
      root,
      sprite,
      side,
      index,
      variant: index % 3,
      offset: index / 12,
      speed: .035 + (index % 4) * .006,
      baseScale: .64 + (index % 4) * .11,
      canopyWidth: 128
    };
    this.paintTreeActor(actor);
    return actor;
  }

  paintTreeActor(actor) {
    actor.sprite
      .setTexture(this.treeTextureKey())
      .setDisplaySize(128, 160)
      .setTint(this.stageTint())
      .setAlpha(this.palette.detail === 'stars' ? .82 : 1);
  }

  treeTextureKey() {
    return {
      forest: 'map-tree-round',
      stream: 'map-tree-round',
      mountain: 'map-pine',
      orchard: 'map-tree-autumn',
      coast: 'map-tree-slim',
      snow: 'map-pine-snow'
    }[this.theme] || 'map-tree-round';
  }

  stageTint() {
    return {
      flowers: 0xffffff,
      grove: 0xe8f4df,
      camp: 0xf6dec0,
      river: 0xe3f2ee,
      waterfall: 0xdff1ea,
      rocks: 0xf5ead3,
      orchard: 0xffedc7,
      coast: 0xeaf6f2,
      snow: 0xffffff,
      ice: 0xf2f9ff,
      stars: 0x91a7c6
    }[this.palette.detail] || 0xffffff;
  }

  createScenery() {
    this.sceneryActors = [];
    for (let index = 0; index < 14; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      this.sceneryActors.push(this.makeTreeActor(index, side));
    }
  }

  createPlayer() {
    this.playerShadow = this.add.ellipse(0, 0, 90, 22, 0x355936, .24).setDepth(52);
    this.player = this.add.image(0, 0, 'char-idle').setOrigin(.5, 1).setDepth(55);
    this.playerRunFrames = ['char-run0', 'char-run1', 'char-run2', 'char-run1'];
    this.playerFrame = 0;
  }

  createParticles() {
    this.successBurst = this.add.particles(0, 0, 'fx-star', {
      lifespan: 680,
      speed: { min: 90, max: 210 },
      angle: { min: 215, max: 325 },
      gravityY: 410,
      scale: { start: .13, end: 0 },
      rotate: { min: 0, max: 300 },
      tint: [0xffdf68, 0xfff2ad],
      emitting: false
    }).setDepth(80);
    this.sparkBurst = this.add.particles(0, 0, 'fx-spark', {
      lifespan: 380,
      speed: { min: 55, max: 150 },
      scale: { start: .07, end: 0 },
      emitting: false
    }).setDepth(81);
    this.dustBurst = this.add.particles(0, 0, 'fx-circle', {
      lifespan: 320,
      speed: { min: 15, max: 55 },
      scale: { start: .055, end: 0 },
      alpha: { start: .32, end: 0 },
      tint: 0xf5e6c2,
      emitting: false
    }).setDepth(51);
  }

  createCountdown() {
    this.countdownPlate = this.add.ellipse(0, 0, 128, 128, 0x1c4b36, .2)
      .setDepth(139)
      .setVisible(false);
    this.countdownText = this.add.text(0, 0, '', {
      fontFamily: uiFont(),
      fontStyle: 'bold',
      fontSize: '92px',
      color: '#ffffff',
      stroke: '#1c4b36',
      strokeThickness: 6
    }).setOrigin(.5).setDepth(140).setVisible(false);
  }

  createControls() {
    this.keyLeftHandler = () => this.switchLane(this.lane - 1);
    this.keyRightHandler = () => this.switchLane(this.lane + 1);
    this.keyOneHandler = () => this.switchLane(0);
    this.keyTwoHandler = () => this.switchLane(1);
    this.keyThreeHandler = () => this.switchLane(2);
    this.input.keyboard.on('keydown-LEFT', this.keyLeftHandler);
    this.input.keyboard.on('keydown-RIGHT', this.keyRightHandler);
    this.input.keyboard.on('keydown-ONE', this.keyOneHandler);
    this.input.keyboard.on('keydown-TWO', this.keyTwoHandler);
    this.input.keyboard.on('keydown-THREE', this.keyThreeHandler);
    this.input.on('pointerdown', pointer => {
      if (!['running', 'countdown'].includes(this.phase)) return;
      const centers = [0, 1, 2].map(lane => this.laneXAt(lane, MAX_GATE_VISUAL));
      let nearest = 0;
      centers.forEach((x, lane) => {
        if (Math.abs(pointer.x - x) < Math.abs(pointer.x - centers[nearest])) nearest = lane;
      });
      this.switchLane(nearest);
    });
  }

  horizonY() {
    return this.scale.height * (this.scale.width < 640 ? .31 : .33);
  }

  depthEase(progress) {
    return Math.pow(Phaser.Math.Clamp(progress, 0, 1), 1.45);
  }

  roadHalfAt(progress) {
    const near = Math.min(this.scale.width * .38, 660);
    const far = Math.min(this.scale.width * .045, 62);
    return Phaser.Math.Linear(far, near, this.depthEase(progress));
  }

  perspective(progress) {
    const eased = this.depthEase(progress);
    return {
      eased,
      half: this.roadHalfAt(progress),
      y: Phaser.Math.Linear(this.horizonY(), this.scale.height, eased),
      scale: Phaser.Math.Linear(.075, 1, eased)
    };
  }

  gateVisual(progress = this.gateProgress) {
    return Phaser.Math.Linear(.035, MAX_GATE_VISUAL, Phaser.Math.Clamp(progress, 0, 1));
  }

  laneXAt(lane, progress = 0) {
    return this.scale.width / 2 + (lane - 1) * this.roadHalfAt(progress) * 2 / 3;
  }

  layout() {
    if (!this.roadGfx) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();

    this.drawSky();
    this.drawCelestial();
    this.drawDistantRidges();
    this.drawHills();
    this.drawStageLandmarks();
    this.drawStageDetails();
    this.refreshStageProps();
    this.layoutStageProps();
    const cloudScale = Phaser.Math.Clamp(width / 1800, .42, 1);
    this.cloudLayer
      .setPosition(0, 0)
      .setSize(width, height * .22)
      .setTileScale(cloudScale)
      .setAlpha(this.palette.detail === 'stars' ? .12 : this.palette.detail === 'camp' ? .42 : .62);

    const treeHeight = height * .13;
    const treeScale = Math.max(width / 1700, treeHeight / 156);
    this.treeLine
      .setPosition(width / 2, horizon + height * .018)
      .setSize(width * 1.12, treeHeight)
      .setTileScale(treeScale);

    this.drawRoad();
    this.updateScenery();
    this.layoutPlayer();
    this.positionGates();

    const countSize = Phaser.Math.Clamp(width * .075, 56, 104);
    this.countdownText
      .setPosition(width / 2, horizon + (height - horizon) * .28);
    this.countdownText.setFontSize(countSize);
    this.countdownPlate
      .setPosition(this.countdownText.x, this.countdownText.y)
      .setDisplaySize(countSize * 1.45, countSize * 1.45);
  }

  drawSky() {
    const width = this.scale.width;
    const horizon = this.horizonY();
    const g = this.skyBackdrop;
    g.clear();
    g.fillGradientStyle(
      this.palette.skyTop,
      this.palette.skyTop,
      this.palette.skyBottom,
      this.palette.skyBottom,
      1
    );
    g.fillRect(0, 0, width, horizon + 2);
    g.fillStyle(0xffffff, this.palette.detail === 'stars' ? .03 : .12);
    g.fillEllipse(width * .5, horizon - 5, width * 1.05, 42);
  }

  drawCelestial() {
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const g = this.celestialGfx;
    g.clear();

    if (this.palette.detail === 'stars') {
      const moonX = width * .8;
      const moonY = horizon * .3;
      const moonRadius = Math.max(13, Math.min(width, height) * .022);
      g.fillStyle(0xfff4d0, .08);
      g.fillCircle(moonX, moonY, moonRadius * 3.8);
      g.fillStyle(0xfff4d0, .13);
      g.fillCircle(moonX, moonY, moonRadius * 2.3);
      g.fillStyle(this.palette.sunTint, .96);
      g.fillCircle(moonX, moonY, moonRadius);
      g.fillStyle(this.palette.skyTop, .92);
      g.fillCircle(moonX + moonRadius * .42, moonY - moonRadius * .18, moonRadius * .88);
      for (let index = 0; index < 42; index += 1) {
        const x = width * ((index * 37) % 100) / 100;
        const y = horizon * (.08 + ((index * 17) % 78) / 100);
        const radius = index % 9 === 0 ? 1.8 : index % 4 === 0 ? 1.15 : .7;
        g.fillStyle(0xf7fbff, .42 + (index % 5) * .1);
        g.fillCircle(x, y, radius);
      }
      g.fillStyle(0xb9e5d6, .08);
      g.fillEllipse(width * .3, horizon * .32, width * .75, 30);
      g.fillStyle(0xd3b6ea, .07);
      g.fillEllipse(width * .55, horizon * .2, width * .8, 20);
      return;
    }

    const sunX = this.palette.detail === 'coast' ? width * .72 : width * .8;
    const sunY = this.palette.detail === 'camp' ? horizon * .64 : horizon * .26;
    const radius = Math.max(16, Math.min(width, height) * .035);
    g.fillStyle(this.palette.sunTint, this.palette.detail === 'camp' ? .2 : .1);
    g.fillCircle(sunX, sunY, radius * 2.9);
    g.fillStyle(this.palette.sunTint, this.palette.detail === 'camp' ? .35 : .2);
    g.fillCircle(sunX, sunY, radius * 1.8);
    g.fillStyle(this.palette.sunTint, .9);
    g.fillCircle(sunX, sunY, radius);

    if (this.palette.detail === 'coast') {
      g.lineStyle(Math.max(1, width * .0012), 0x315e63, .4);
      for (let index = 0; index < 3; index += 1) {
        const x = width * (.2 + index * .035);
        const y = horizon * (.22 + index * .04);
        g.beginPath();
        g.arc(x, y, 5 + index, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(335));
        g.strokePath();
      }
    }
  }

  drawDistantRidges() {
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const g = this.distantGfx;
    g.clear();
    const detail = this.palette.detail;

    if (detail === 'coast') {
      g.fillStyle(0x6fb5c9, .62);
      g.fillRect(0, horizon - 25, width, 34);
      g.fillStyle(0xdff6f4, .48);
      for (let index = 0; index < 18; index += 1) {
        const x = width * (index / 18) + (index % 3) * 7;
        const y = horizon - 22 + (index % 5) * 4;
        g.fillRoundedRect(x, y, width * .045, 1.7, 1);
      }
    }

    if (['snow', 'ice', 'stars'].includes(detail)) {
      const peaks = [
        { x: width * .12, base: horizon + 10, spread: width * .18, height: height * .25 },
        { x: width * .34, base: horizon + 12, spread: width * .22, height: height * .31 },
        { x: width * .66, base: horizon + 10, spread: width * .2, height: height * .27 },
        { x: width * .88, base: horizon + 12, spread: width * .17, height: height * .22 }
      ];
      peaks.forEach((peak, index) => {
        g.fillStyle(index % 2 ? 0xaac0d1 : 0x92afc3, .72);
        g.fillTriangle(peak.x, peak.base - peak.height, peak.x - peak.spread, peak.base, peak.x + peak.spread, peak.base);
        const cap = peak.height * .34;
        g.fillStyle(0xf4f9fc, .9);
        g.fillTriangle(peak.x, peak.base - peak.height, peak.x - peak.spread * cap / peak.height, peak.base - peak.height + cap, peak.x + peak.spread * cap / peak.height, peak.base - peak.height + cap);
      });
      return;
    }

    if (['rocks', 'orchard'].includes(detail)) {
      const mesa = (x, base, spread, top) => {
        g.fillStyle(0xc8a76d, .38);
        g.fillTriangle(x - spread, base, x - spread * .5, top, x + spread * .5, top);
        g.fillTriangle(x - spread * .5, top, x + spread * .5, top, x + spread, base);
        g.fillStyle(0xf2dfb3, .28);
        g.fillTriangle(x - spread * .5, top, x + spread * .5, top, x + spread * .2, top + spread * .22);
      };
      mesa(width * .16, horizon + 8, width * .17, horizon - height * .18);
      mesa(width * .69, horizon + 10, width * .25, horizon - height * .24);
      mesa(width * .9, horizon + 8, width * .13, horizon - height * .15);
      if (detail === 'orchard') {
        g.fillStyle(0x8ca75b, .54);
        for (let index = 0; index < 12; index += 1) {
          const x = width * (index < 6 ? .03 + index * .038 : .72 + (index - 6) * .045);
          const y = horizon + 18 + (index % 3) * 8;
          g.fillCircle(x, y, Math.max(4, height * .011));
        }
      }
      return;
    }

    g.fillStyle(this.palette.hillFar, .4);
    g.fillEllipse(width * .16, horizon - 3, width * .57, height * .17);
    g.fillEllipse(width * .73, horizon - 6, width * .68, height * .2);
  }

  drawHills() {
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const g = this.hillGfx;
    g.clear();

    if (['snow', 'ice', 'stars'].includes(this.palette.detail)) {
      g.fillStyle(this.palette.hillFar, .78);
      g.fillEllipse(width * .08, horizon + 5, width * .62, height * .17);
      g.fillEllipse(width * .82, horizon + 1, width * .76, height * .19);
      g.fillStyle(0xf7fbfd, .62);
      g.fillEllipse(width * .13, horizon + 2, width * .45, height * .07);
      g.fillEllipse(width * .84, horizon - 1, width * .56, height * .075);
    } else if (this.palette.detail === 'coast') {
      g.fillStyle(0xb9d6c1, .5);
      g.fillEllipse(width * .2, horizon + 12, width * .55, height * .15);
      g.fillEllipse(width * .84, horizon + 4, width * .5, height * .13);
    } else if (['rocks', 'orchard'].includes(this.palette.detail)) {
      g.fillStyle(this.palette.hillFar, .56);
      g.fillEllipse(width * .1, horizon + 3, width * .5, height * .16);
      g.fillEllipse(width * .76, horizon - 2, width * .55, height * .18);
      g.fillStyle(0xb6985f, .18);
      g.fillEllipse(width * .18, horizon + height * .1, width * .24, height * .06);
      g.fillEllipse(width * .84, horizon + height * .16, width * .26, height * .055);
    } else {
      g.fillStyle(this.palette.hillFar, .7);
      g.fillEllipse(width * .08, horizon + 4, width * .7, height * .15);
      g.fillEllipse(width * .78, horizon - 3, width * .85, height * .17);
    }

    g.fillStyle(this.palette.hillNear, .82);
    g.fillEllipse(width * .48, horizon + height * .03, width * .95, height * .13);
    g.fillStyle(this.palette.ground, 1);
    g.fillRect(0, horizon, width, height - horizon);

    if (this.palette.detail === 'flowers') {
      g.fillStyle(0xffffff, .09);
      g.fillEllipse(width * .2, horizon + height * .13, width * .3, height * .032);
      g.fillEllipse(width * .78, horizon + height * .2, width * .34, height * .036);
    }

    g.lineStyle(1, 0xffffff, this.palette.detail === 'stars' ? .06 : .1);
    for (let index = 0; index < 12; index += 1) {
      const y = horizon + height * (.045 + index * .055);
      const inset = width * (.04 + (index % 4) * .075);
      g.beginPath();
      g.moveTo(inset, y);
      g.lineTo(width - inset, y + (index % 2 ? 2 : -1));
      g.strokePath();
    }
  }

  drawStageDetails() {
    if (!this.detailGfx) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const g = this.detailGfx;
    g.clear();
    const detail = this.palette.detail;
    this.drawBridge(detail);

    if (detail === 'river' || detail === 'coast' || detail === 'ice' || detail === 'waterfall') {
      const bandY = horizon + height * .12;
      const bandH = Math.max(22, height * .075);
      const water = detail === 'ice' ? 0xbfe0ee : 0x78bcd1;
      g.fillStyle(water, detail === 'ice' ? .7 : .58);
      g.fillRect(0, bandY, width, bandH);
      g.fillStyle(0xffffff, .12);
      g.fillRect(0, bandY, width, Math.max(2, bandH * .08));
      g.fillStyle(0xffffff, detail === 'ice' ? .48 : .25);
      for (let index = 0; index < 9; index += 1) {
        g.fillRoundedRect(
          width * (index / 9) + 8,
          bandY + bandH * .28 + (index % 3) * 5,
          width / 14,
          Math.max(2, bandH * .07),
          2
        );
      }
      if (detail === 'river') {
        const reedColor = 0x4f875c;
        for (let side = 0; side < 2; side += 1) {
          const baseX = side === 0 ? width * .055 : width * .945;
          for (let index = 0; index < 5; index += 1) {
            const x = baseX + (index - 2) * width * .007 * (side === 0 ? 1 : -1);
            g.lineStyle(Math.max(1, width * .0011), reedColor, .58);
            g.beginPath();
            g.moveTo(x, bandY + bandH + 9);
            g.lineTo(x + (index % 2 ? 4 : -3), bandY - bandH * .32);
            g.strokePath();
          }
        }
        g.fillStyle(0xffffff, .4);
        g.fillEllipse(width * .22, bandY + bandH * .52, width * .08, 3);
        g.fillEllipse(width * .71, bandY + bandH * .35, width * .11, 3);
      }
      if (detail === 'coast') {
        g.fillStyle(0xf8e5b8, .26);
        g.fillRect(0, bandY + bandH, width, height * .06);
        g.fillStyle(0xffffff, .5);
        g.fillTriangle(width * .14, bandY + 8, width * .18, bandY - height * .06, width * .2, bandY + 8);
        g.fillStyle(0x315e63, .44);
        g.fillTriangle(width * .18, bandY - height * .06, width * .195, bandY - height * .026, width * .18, bandY - height * .01);
        g.fillRect(width * .11, bandY + 7, width * .12, 3);
      }
      if (detail === 'ice') {
        g.lineStyle(Math.max(1, width * .0012), 0x7fa9c2, .38);
        for (let index = 0; index < 7; index += 1) {
          const x = width * (.08 + index * .14);
          g.beginPath();
          g.moveTo(x, bandY);
          g.lineTo(x + width * .045, bandY + bandH * .45);
          g.lineTo(x + width * .01, bandY + bandH);
          g.strokePath();
        }
        g.fillStyle(0xf8fdff, .7);
        g.fillTriangle(width * .08, bandY + bandH, width * .14, bandY + bandH, width * .11, bandY + bandH - 7);
        g.fillTriangle(width * .86, bandY + bandH, width * .93, bandY + bandH, width * .9, bandY + bandH - 9);
      }
      if (detail === 'waterfall') {
        const fallX = width * .8;
        g.fillStyle(0xb9e6ef, .72);
        g.fillRoundedRect(fallX - width * .022, horizon + 12, width * .044, bandH + height * .12, 8);
        g.fillStyle(0xffffff, .42);
        for (let index = 0; index < 5; index += 1) {
          g.fillRoundedRect(
            fallX - width * .014 + (index % 2) * 5,
            horizon + 20 + index * height * .022,
            width * .008,
            height * .008,
            2
          );
        }
        g.fillStyle(0xffffff, .5);
        g.fillEllipse(fallX, bandY + bandH * .18, width * .07, bandH * .3);
      }
      return;
    }

    if (detail === 'camp') {
      const tent = (x, baseY, size, color, light) => {
        g.fillStyle(0x563f33, .16);
        g.fillEllipse(x, baseY + 3, size * 1.26, size * .15);
        g.fillStyle(color, .94);
        g.fillTriangle(x, baseY - size, x - size * .58, baseY, x + size * .58, baseY);
        g.fillStyle(light, .64);
        g.fillTriangle(x, baseY - size * .88, x - size * .2, baseY, x + size * .2, baseY);
        g.fillStyle(0x3e352c, .8);
        g.fillTriangle(x, baseY - size * .68, x - size * .12, baseY, x + size * .05, baseY);
        g.lineStyle(2, 0x72563e, .8);
        g.beginPath();
        g.moveTo(x - size * .6, baseY);
        g.lineTo(x, baseY - size);
        g.lineTo(x + size * .6, baseY);
        g.strokePath();
      };
      tent(width * .12, horizon + height * .19, height * .085, 0xe3b16f, 0xffd995);
      tent(width * .88, horizon + height * .2, height * .072, 0xc78668, 0xf1ba91);

      const fireX = width * .75;
      const fireY = horizon + height * .23;
      g.fillStyle(0xffc85f, .12);
      g.fillCircle(fireX, fireY, height * .07);
      g.fillStyle(0xe9a331, .22);
      g.fillCircle(fireX, fireY, height * .044);
      g.fillStyle(0x6e4c34, 1);
      g.fillRoundedRect(fireX - height * .03, fireY + height * .007, height * .06, Math.max(3, height * .009), 2);
      g.fillStyle(0xf25d38, .92);
      g.fillTriangle(fireX - 8, fireY, fireX, fireY - height * .045, fireX + 7, fireY);
      g.fillStyle(0xffc94f, .96);
      g.fillTriangle(fireX - 4, fireY, fireX + 1, fireY - height * .027, fireX + 5, fireY);
      g.fillStyle(0xfff1a4, .8);
      g.fillCircle(fireX + width * .008, fireY - height * .035, 1.8);
      g.fillStyle(0xffc06a, .56);
      g.fillCircle(fireX + width * .018, fireY - height * .05, 1.4);

      g.lineStyle(Math.max(1, width * .0012), 0x704b33, .48);
      g.beginPath();
      g.moveTo(width * .04, horizon + height * .065);
      g.lineTo(width * .96, horizon + height * .05);
      g.strokePath();
      for (let index = 0; index < 9; index += 1) {
        const x = width * (.07 + index * .108);
        const y = horizon + height * (.064 - index * .0018);
        g.fillStyle(index % 2 ? 0xffe6a0 : 0xffc06a, .86);
        g.fillCircle(x, y, Math.max(1.4, height * .0027));
      }
      return;
    }

    if (detail === 'orchard') {
      const rows = [
        { x: .08, y: .075, scale: 1.05 },
        { x: .18, y: .13, scale: 1.24 },
        { x: .84, y: .085, scale: .95 },
        { x: .92, y: .155, scale: 1.28 }
      ];
      rows.forEach((row, rowIndex) => {
        const x = width * row.x;
        const y = horizon + height * row.y;
        const treeRadius = height * .036 * row.scale;
        g.fillStyle(0x7b5a3b, .84);
        g.fillRect(x - 2.5, y - treeRadius * .22, 5, treeRadius * 1.2);
        g.fillStyle(0x78944f, .86);
        g.fillCircle(x, y - treeRadius * .55, treeRadius);
        g.fillCircle(x - treeRadius * .56, y - treeRadius * .26, treeRadius * .68);
        g.fillCircle(x + treeRadius * .56, y - treeRadius * .28, treeRadius * .7);
        g.fillStyle(0xe1a13f, .94);
        for (let index = 0; index < 5; index += 1) {
          const angle = (index / 5) * Math.PI * 2 + rowIndex * .45;
          g.fillCircle(
            x + Math.cos(angle) * treeRadius * .64,
            y - treeRadius * .54 + Math.sin(angle) * treeRadius * .54,
            Math.max(1.7, treeRadius * .085)
          );
        }
      });
      g.lineStyle(2, 0x8d744d, .5);
      g.beginPath();
      g.moveTo(width * .04, horizon + height * .16);
      g.lineTo(width * .25, horizon + height * .13);
      g.strokePath();
      g.beginPath();
      g.moveTo(width * .76, horizon + height * .18);
      g.lineTo(width * .96, horizon + height * .15);
      g.strokePath();
      for (let index = 0; index < 8; index += 1) {
        const x = width * (index < 4 ? .045 + index * .055 : .78 + (index - 4) * .055);
        const y = horizon + height * (index < 4 ? .155 - index * .006 : .175 - (index - 4) * .006);
        g.fillStyle(0x8d744d, .54);
        g.fillRect(x, y - 10, 2, 11);
      }
      return;
    }

    if (detail === 'rocks') {
      g.fillStyle(0x8d795a, .2);
      g.fillEllipse(width * .18, horizon + height * .18, width * .28, height * .05);
      g.fillEllipse(width * .82, horizon + height * .26, width * .24, height * .045);
      const boulder = (x, y, size, shade) => {
        g.fillStyle(0x715f48, .16);
        g.fillEllipse(x + size * .08, y + 2, size * 1.18, size * .2);
        g.fillStyle(shade, .9);
        g.fillPoints([
          new Phaser.Geom.Point(x - size * .5, y),
          new Phaser.Geom.Point(x - size * .38, y - size * .36),
          new Phaser.Geom.Point(x - size * .08, y - size * .52),
          new Phaser.Geom.Point(x + size * .3, y - size * .4),
          new Phaser.Geom.Point(x + size * .5, y)
        ], true);
        g.fillStyle(0xf0dfbd, .3);
        g.fillTriangle(
          x - size * .28,
          y - size * .31,
          x - size * .04,
          y - size * .48,
          x + size * .09,
          y - size * .27
        );
        g.fillStyle(0x5f513f, .2);
        g.fillTriangle(
          x + size * .09,
          y - size * .27,
          x + size * .3,
          y - size * .39,
          x + size * .45,
          y
        );
      };
      boulder(width * .1, horizon + height * .18, width * .075, 0x8f7b5f);
      boulder(width * .19, horizon + height * .3, width * .052, 0x9c8668);
      boulder(width * .86, horizon + height * .22, width * .065, 0x88745a);
      g.fillStyle(0xc2a36e, .3);
      for (let index = 0; index < 16; index += 1) {
        g.fillCircle(width * (.05 + (index * .061) % .9), horizon + height * (.1 + (index % 5) * .045), 1.2);
      }
      return;
    }

    if (detail === 'flowers' || detail === 'grove') {
      const colors = [0xffef9a, 0xf7f4dc, 0xd4e77c];
      for (let index = 0; index < 34; index += 1) {
        const side = index % 2 === 0 ? .22 : .78;
        const x = width * side + ((index * 29) % 90 - 45) * width * .0035;
        const y = horizon + height * (.075 + Math.floor(index / 2) * .021);
        g.lineStyle(1, 0x5e8f54, .32);
        g.beginPath();
        g.moveTo(x, y + 5);
        g.lineTo(x, y);
        g.strokePath();
        g.fillStyle(colors[index % colors.length], .76);
        for (let petal = 0; petal < 4; petal += 1) {
          const angle = petal * Math.PI / 2;
          g.fillCircle(x + Math.cos(angle) * 2.4, y + Math.sin(angle) * 2.4, 1.8);
        }
        g.fillStyle(0xf2b94f, .88);
        g.fillCircle(x, y, 1.3);
      }
      g.fillStyle(0xffffff, .18);
      g.fillEllipse(width * .17, horizon + height * .27, width * .27, height * .035);
      g.fillEllipse(width * .82, horizon + height * .34, width * .3, height * .04);
      return;
    }

    if (detail === 'grove') {
      const clusters = [
        { x: .09, y: .19, size: 1.15 },
        { x: .17, y: .27, size: .82 },
        { x: .86, y: .2, size: 1.05 },
        { x: .92, y: .3, size: .76 }
      ];
      clusters.forEach((cluster, clusterIndex) => {
        const x = width * cluster.x;
        const baseY = horizon + height * cluster.y;
        const size = height * .095 * cluster.size;
        g.fillStyle(0x7c6244, .82);
        g.fillRoundedRect(x - 3, baseY - size * .35, 6, size * .35, 2);
        g.fillStyle(this.palette.bushTints[clusterIndex % this.palette.bushTints.length], .96);
        g.fillEllipse(x, baseY - size * .62, size, size * .58);
        g.fillStyle(this.palette.bushTints[(clusterIndex + 1) % this.palette.bushTints.length], .88);
        g.fillEllipse(x - size * .28, baseY - size * .47, size * .58, size * .38);
        g.fillEllipse(x + size * .27, baseY - size * .46, size * .52, size * .36);
        g.fillStyle(0xffffff, .13);
        g.fillEllipse(x - size * .08, baseY - size * .74, size * .42, size * .16);
      });
      g.fillStyle(0xffffff, .13);
      g.fillEllipse(width * .2, horizon + height * .32, width * .28, height * .035);
      g.fillEllipse(width * .82, horizon + height * .38, width * .3, height * .04);
      return;
    }

    if (['snow', 'ice', 'stars'].includes(detail)) {
      const pine = (x, baseY, size, shade) => {
        g.fillStyle(0x6d5b4a, .78);
        g.fillRect(x - 2, baseY - size * .22, 4, size * .22);
        g.fillStyle(shade, .9);
        g.fillTriangle(x, baseY - size, x - size * .46, baseY - size * .2, x + size * .46, baseY - size * .2);
        g.fillTriangle(x, baseY - size * .78, x - size * .38, baseY - size * .06, x + size * .38, baseY - size * .06);
        g.fillStyle(0xf7fcff, .7);
        g.fillTriangle(x, baseY - size, x - size * .2, baseY - size * .6, x + size * .18, baseY - size * .6);
      };
      pine(width * .075, horizon + height * .23, height * .12, 0x7996a1);
      pine(width * .16, horizon + height * .16, height * .085, 0x8aa6ae);
      pine(width * .92, horizon + height * .25, height * .14, 0x748f9d);
      pine(width * .84, horizon + height * .17, height * .09, 0x8ca8b1);
      g.fillStyle(0xf9fdff, .48);
      for (let index = 0; index < 24; index += 1) {
        const x = width * ((index * 41) % 100) / 100;
        const y = horizon + height * (.045 + ((index * 19) % 80) / 100);
        g.fillCircle(x, y, index % 6 === 0 ? 1.5 : .8);
      }
      if (detail === 'ice') {
        g.fillStyle(0xffffff, .55);
        g.fillEllipse(width * .2, horizon + height * .2, width * .18, height * .022);
        g.fillEllipse(width * .8, horizon + height * .27, width * .2, height * .025);
      }
      if (detail === 'stars') {
        const lanternX = width * .74;
        const lanternY = horizon + height * .21;
        g.fillStyle(0xffd47b, .1);
        g.fillCircle(lanternX, lanternY, height * .055);
        g.fillStyle(0xffd47b, .35);
        g.fillCircle(lanternX, lanternY, height * .023);
        g.fillStyle(0xffefb4, .95);
        g.fillCircle(lanternX, lanternY, Math.max(3, height * .006));
        for (let index = 0; index < 8; index += 1) {
          g.fillStyle(0xffe39b, .42);
          g.fillCircle(
            width * (.58 + (index * .037) % .28),
            horizon + height * (.12 + (index % 3) * .04),
            1.2
          );
        }
      }
    }
  }

  drawStageLandmarks() {
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const detail = this.palette.detail;
    const g = this.landmarkGfx;
    g.clear();

    if (detail === 'coast') {
      const x = width * .865;
      const base = horizon + height * .095;
      const towerH = height * .125;
      const towerW = Math.max(12, width * .026);
      g.fillStyle(0xffffff, .08);
      g.fillTriangle(x, base - towerH - 6, x - width * .11, base + 7, x + width * .11, base + 7);
      g.fillStyle(0xf6f1df, .96);
      g.fillTriangle(x - towerW * .6, base, x + towerW * .6, base, x + towerW * .36, base - towerH);
      g.fillTriangle(x + towerW * .6, base, x + towerW * .36, base - towerH, x - towerW * .36, base - towerH);
      g.fillStyle(0xc76455, .9);
      g.fillRect(x - towerW * .44, base - towerH * .68, towerW * .88, towerH * .15);
      g.fillRect(x - towerW * .55, base - towerH * .32, towerW * 1.1, towerH * .13);
      g.fillStyle(0x5a6871, .92);
      g.fillTriangle(x - towerW * .58, base - towerH, x + towerW * .58, base - towerH, x, base - towerH * 1.34);
      g.fillStyle(0xffe3a0, .92);
      g.fillCircle(x, base - towerH * .83, Math.max(2.5, towerW * .15));
      g.fillStyle(0xffe3a0, .14);
      g.fillCircle(x, base - towerH * .83, Math.max(7, towerW * .6));
      g.fillStyle(0x315e63, .38);
      g.fillEllipse(x, base + 3, towerW * 2, 5);
    }

    if (detail === 'snow' || detail === 'ice') {
      const x = width * .1;
      const base = horizon + height * .29;
      const size = height * .045;
      g.fillStyle(0xffffff, .86);
      g.fillCircle(x, base - size * 1.15, size * .48);
      g.fillCircle(x, base - size * .48, size * .72);
      g.fillStyle(0xe4f1f8, .92);
      g.fillEllipse(x, base, size * 1.1, size * .35);
      g.fillStyle(0x4c687b, .8);
      g.fillCircle(x - size * .15, base - size * 1.2, 1.5);
      g.fillCircle(x + size * .15, base - size * 1.2, 1.5);
      g.fillStyle(0xe7a15b, .9);
      g.fillTriangle(x + size * .06, base - size * 1.08, x + size * .22, base - size * 1.03, x + size * .06, base - size * .99);
    }

    if (detail === 'stars') {
      const x = width * .16;
      const base = horizon + height * .21;
      const size = height * .09;
      g.fillStyle(0x2f3856, .88);
      g.fillTriangle(x, base - size, x - size * .68, base, x + size * .68, base);
      g.fillStyle(0xf1b969, .72);
      g.fillTriangle(x, base - size * .72, x - size * .19, base, x + size * .19, base);
      g.fillStyle(0xffdda0, .24);
      g.fillCircle(x, base - size * .31, size * .45);
      g.lineStyle(Math.max(1, width * .0014), 0xffdda0, .42);
      g.beginPath();
      g.moveTo(width * .04, horizon + height * .095);
      g.lineTo(width * .96, horizon + height * .085);
      g.strokePath();
      for (let index = 0; index < 8; index += 1) {
        g.fillStyle(0xffe3a5, .72);
        g.fillCircle(width * (.08 + index * .12), horizon + height * (.094 - index * .0012), 1.6);
      }
    }
  }

  drawBridge(detail) {
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const g = this.bridgeGfx;
    g.clear();
    if (!['river', 'ice', 'waterfall'].includes(detail)) return;

    const bandY = horizon + height * .12;
    const bandH = Math.max(22, height * .075);
    const eased = Phaser.Math.Clamp((bandY - horizon) / (height - horizon), 0, 1);
    const progress = Math.pow(eased, 1 / 1.45);
    const point = this.perspective(progress);
    const half = point.half * 1.02;
    const deckTop = bandY - bandH * .44;
    const deckBottom = bandY + bandH * .25;
    const wood = detail === 'ice' ? 0x86a8ba : 0xa9784b;
    const woodDark = detail === 'ice' ? 0x63879c : 0x765638;
    const plank = detail === 'ice' ? 0xd7e9f0 : 0xd6aa75;

    g.fillStyle(woodDark, .34);
    g.fillRect(width / 2 - half - 10, deckTop + 4, half * 2 + 20, deckBottom - deckTop + 8);
    g.fillStyle(wood, .98);
    g.fillRect(width / 2 - half, deckTop, half * 2, deckBottom - deckTop);
    const plankCount = width < 640 ? 8 : 15;
    for (let index = 0; index < plankCount; index += 1) {
      const plankWidth = half * 2 / plankCount;
      g.fillStyle(plank, index % 2 ? .34 : .5);
      g.fillRect(
        width / 2 - half + index * plankWidth + 1,
        deckTop + 2,
        Math.max(2, plankWidth - 3),
        deckBottom - deckTop - 4
      );
    }

    const railHeight = Math.max(12, height * .032);
    const postCount = width < 640 ? 3 : 4;
    [width / 2 - half + 5, width / 2 + half - 5].forEach(x => {
      for (let index = 0; index < postCount; index += 1) {
        const t = index / (postCount - 1);
        const py = Phaser.Math.Linear(deckTop, deckBottom, t);
        g.lineStyle(Math.max(2, height * .0035), woodDark, .9);
        g.beginPath();
        g.moveTo(x, py);
        g.lineTo(x, py - railHeight);
        g.strokePath();
      }
      [.42, 1].forEach(ratio => {
        g.lineStyle(Math.max(2, height * .0032), woodDark, ratio === 1 ? .94 : .7);
        g.beginPath();
        g.moveTo(x, deckTop - railHeight * ratio);
        g.lineTo(x, deckBottom - railHeight * ratio);
        g.strokePath();
      });
    });
  }

  refreshStageProps() {
    const signature = `${this.palette.detail}:${this.stagePaletteIndex}`;
    if (signature === this.stagePropSignature) return;
    this.stagePropSignature = signature;
    this.stageProps?.forEach(prop => prop.image.destroy());
    this.stageProps = [];

    const definitions = [];
    const add = (key, side, progress, baseWidth, tint, alpha = 1, gap = 0) => {
      definitions.push({ key, side, progress, baseWidth, tint, alpha, gap });
    };
    const detail = this.palette.detail;

    if (detail === 'flowers') {
      add('stage-mushroom', -1, .46, 42, 0xffffff, .94, 10);
      add('stage-mushroom', 1, .58, 36, 0xffffff, .9, 3);
      add('grass', -1, .7, 74, 0x84ba66, .9, 5);
      add('grass', 1, .78, 68, 0x7db265, .9, 7);
      add('bush', 1, .89, 150, 0x78b566, .96, 2);
    } else if (detail === 'river' || detail === 'waterfall') {
      add('grass', -1, .54, 78, 0x6c9f67, .9, 8);
      add('grass', 1, .62, 72, 0x659c63, .88, 6);
      add('rock', 1, .73, 110, 0xc8c1a7, .94, 3);
      add('stage-flag-green', -1, .82, 66, 0xffffff, 1, 4);
    } else if (detail === 'camp') {
      add('stage-flag-yellow', -1, .58, 72, 0xffffff, 1, 8);
      add('stage-flag-green', 1, .66, 70, 0xffffff, 1, 8);
      add('stage-mushroom', -1, .78, 38, 0xffffff, .9, 3);
      add('rock', 1, .87, 120, 0xb8aa8e, .9, 2);
    } else if (detail === 'rocks') {
      add('rock', -1, .44, 118, 0xb6a183, .96, 8);
      add('rock', 1, .56, 92, 0xbfa987, .94, 4);
      add('rock', -1, .72, 145, 0xa68d6f, .96, 2);
      add('stage-flag-yellow', 1, .84, 70, 0xffffff, 1, 4);
    } else if (detail === 'orchard') {
      add('bush', -1, .48, 155, 0x8ea657, .96, 6);
      add('bush', 1, .58, 142, 0x96ad5c, .96, 5);
      add('rock', -1, .81, 95, 0xb8a585, .9, 2);
      add('bush', 1, .9, 165, 0x819b50, .96, 2);
    } else if (detail === 'coast') {
      add('stage-flag-blue', -1, .5, 72, 0xffffff, 1, 6);
      add('stage-flag-blue', 1, .64, 74, 0xffffff, 1, 8);
      add('rock', -1, .74, 125, 0xc6bda5, .94, 3);
      add('grass', 1, .85, 82, 0xb4bd78, .86, 2);
    } else if (detail === 'snow' || detail === 'ice') {
      add('bush', -1, .46, 112, 0xe7f3fb, .88, 6);
      add('bush', 1, .58, 104, 0xdcecf6, .86, 7);
      add('rock', -1, .72, 115, 0xe5edf3, .92, 2);
      add('stage-flag-blue', 1, .84, 66, 0xe8f3fa, 1, 4);
    } else if (detail === 'stars') {
      add('bush', -1, .55, 122, 0x526c78, .9, 6);
      add('bush', 1, .67, 132, 0x4d6673, .9, 5);
      add('stage-flag-blue', -1, .82, 72, 0xaac5db, 1, 4);
      add('stage-mushroom', 1, .9, 40, 0xb7a29a, .84, 2);
    }

    const frosted = ['snow', 'ice', 'stars'].includes(detail);
    definitions.forEach(definition => {
      const image = this.add.image(0, 0, definition.key)
        .setOrigin(.5, 1)
        .setAlpha(definition.alpha);
      const flatProp = ['bush', 'rock', 'grass'].includes(definition.key);
      if (flatProp || frosted && definition.key === 'stage-mushroom') {
        image.setTintFill(definition.tint);
      } else {
        image.setTint(definition.tint);
      }
      this.stageProps.push({ ...definition, image });
    });
  }

  layoutStageProps() {
    if (!this.stageProps?.length) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const compactScale = Phaser.Math.Clamp(width / 1100, .58, 1.12);
    this.stageProps.forEach(prop => {
      const point = this.perspective(prop.progress);
      const targetWidth = prop.baseWidth * compactScale * (.48 + point.scale * .52);
      const image = prop.image;
      const aspect = image.width / Math.max(1, image.height);
      const targetHeight = targetWidth / Math.max(.2, aspect);
      const x = width / 2 + prop.side * (
        point.half
        + Math.max(8, width * .012) * prop.gap
        + targetWidth * .56
      );
      image
        .setPosition(x, point.y + 2)
        .setDisplaySize(targetWidth, targetHeight)
        .setDepth(4 + Math.round(prop.progress * 18))
        .setVisible(x > -targetWidth && x < width + targetWidth);
    });
  }

  drawRoad() {
    if (!this.roadGfx) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const g = this.roadGfx;
    g.clear();

    const near = this.perspective(1);
    g.fillStyle(this.palette.roadEdge, .38);
    g.beginPath();
    g.moveTo(width / 2 - this.roadHalfAt(0) - 8, horizon);
    g.lineTo(width / 2 + this.roadHalfAt(0) + 8, horizon);
    g.lineTo(width / 2 + near.half + 14, height);
    g.lineTo(width / 2 - near.half - 14, height);
    g.closePath();
    g.fillPath();

    g.fillStyle(this.palette.road, 1);
    g.beginPath();
    g.moveTo(width / 2 - this.roadHalfAt(0), horizon);
    g.lineTo(width / 2 + this.roadHalfAt(0), horizon);
    g.lineTo(width / 2 + near.half, height);
    g.lineTo(width / 2 - near.half, height);
    g.closePath();
    g.fillPath();

    for (let divider = 1; divider < 3; divider += 1) {
      g.lineStyle(1.2, 0xc6b48f, .09);
      g.beginPath();
      g.moveTo(width / 2 + (divider * 2 / 3 - 1) * this.roadHalfAt(0), horizon);
      g.lineTo(width / 2 + (divider * 2 / 3 - 1) * near.half, height);
      g.strokePath();
    }

    for (let index = 0; index < 15; index += 1) {
      const progress = (index / 15 + this.sceneryClock * .015) % 1;
      const p = this.perspective(progress);
      g.fillStyle(0xcbb994, .05 + p.eased * .035);
      g.fillRect(width / 2 - p.half, p.y, p.half * 2, Math.max(1, 1 + 2 * p.eased));
    }
  }

  updateScenery() {
    if (!this.sceneryActors) return;
    const width = this.scale.width;
    this.sceneryActors.forEach(actor => {
      const progress = (actor.offset + this.sceneryClock * actor.speed) % 1;
      const full = this.perspective(progress);
      const compactScale = Phaser.Math.Clamp(width / 1050, .56, 1.16);
      const scale = full.scale * actor.baseScale * compactScale;
      const displayWidth = actor.canopyWidth * scale;
      const gap = Math.max(6, width * .009);
      const outside = full.half + gap + displayWidth / 2;
      const x = width / 2 + actor.side * outside;
      const visible = (
        progress > .01
        && progress < .99
        && x + displayWidth / 2 > -4
        && x - displayWidth / 2 < width + 4
      );
      actor.root
        .setPosition(x, full.y)
        .setScale(scale)
        .setVisible(visible)
        .setDepth(4 + Math.round(progress * 18));
      actor.roadEdge = Math.round(width / 2 + actor.side * full.half);
      actor.displayWidth = Math.round(displayWidth);
      actor.x = Math.round(x);
      actor.y = Math.round(full.y);
    });
  }

  layoutPlayer() {
    if (!this.player) return;
    const targetHeight = this.scale.height * PLAYER_HEIGHT_RATIO;
    const playerScale = targetHeight / PLAYER_SOURCE_HEIGHT;
    this.player.setScale(playerScale);
    const x = this.laneXAt(this.lane, 1);
    this.player.setPosition(x, this.scale.height * .9);
    this.playerShadow
      .setPosition(x, this.player.y + 2)
      .setDisplaySize(Math.min(this.scale.width * .12, 110), Math.max(12, this.player.displayWidth * .15));
  }

  startJourney() {
    this.index = 0;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lane = 1;
    this.answers = [];
    this.audioLog = [];
    this.finished = false;
    this.completeEmitted = false;
    this.feedback = { visible: false, kind: 'correct', title: '', body: '' };
    this.loadQuestion(true);
  }

  loadQuestion(initial = false) {
    this.syncStageTheme();
    this.currentItem = this.items[this.index];
    this.options = Array.isArray(this.currentItem.options) && this.currentItem.options.length === 3
      ? [...this.currentItem.options]
      : optionList(this.currentItem);
    this.gateProgress = 0;
    this.transitionRemaining = 0;
    this.feedback = { visible: false, kind: 'correct', title: '', body: '' };
    this.phase = initial ? 'countdown' : 'running';
    this.countdown = COUNTDOWN_SECONDS;
    this.countdownDigit = COUNTDOWN_SECONDS;
    this.setPlayerPose(initial ? 'idle' : 'run');
    this.layoutPlayer();
    this.layoutPlayerLane(true);
    this.buildGates();
    this.positionGates();
    this.toggleCountdown(initial);
    this.eventsBus.emit('state', this.getState());
  }

  syncStageTheme() {
    const stageIndex = Math.min(2, Math.floor(this.index / STAGE_SIZE));
    if (stageIndex === this.stagePaletteIndex) return;
    this.stagePaletteIndex = stageIndex;
    this.palette = (WORLD_STAGES[this.theme] || WORLD_STAGES.forest)[stageIndex];
    this.applySceneryTints();
    if (this.roadGfx) this.layout();
  }

  applySceneryTints() {
    this.cloudLayer?.setTint(this.palette.detail === 'stars' ? 0xc7d4ec : 0xfffdf0);
    this.cloudLayer?.setAlpha(this.palette.detail === 'stars' ? .28 : .7);
    this.treeLine
      ?.setTintFill(this.palette.treeTint)
      ?.setAlpha(this.palette.detail === 'stars' ? .24 : .42);
    this.sceneryActors?.forEach(actor => this.paintTreeActor(actor));
  }

  toggleCountdown(visible) {
    this.countdownText
      .setText(String(COUNTDOWN_SECONDS))
      .setVisible(visible)
      .setAlpha(1)
      .setScale(1);
    this.countdownPlate.setVisible(visible).setAlpha(.2);
  }

  buildGates() {
    this.gates?.forEach(gate => gate.root.destroy());
    this.gates = this.options.map((option, lane) => {
      const root = this.add.container(0, 0).setDepth(30);
      const shadow = this.add.ellipse(0, -1, 226, 22, 0x496b3e, .16);
      const leftPost = this.add.rectangle(-94, -76, 17, 152, WOOD_DARK).setOrigin(.5);
      const rightPost = this.add.rectangle(94, -76, 17, 152, WOOD_DARK).setOrigin(.5);
      const board = this.add.graphics();
      const pinLeft = this.add.circle(-78, -224, 5, 0x9d7c52);
      const pinRight = this.add.circle(78, -224, 5, 0x9d7c52);
      const label = this.add.text(0, -185, option, {
        fontFamily: uiFont(),
        fontStyle: 'bold',
        fontSize: '38px',
        color: INK_GREEN,
        align: 'center',
        wordWrap: { width: 186 }
      }).setOrigin(.5).setResolution(2);
      const outline = this.add.graphics();
      const hit = this.add.zone(0, -112, 226, 250).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (pointer, localX, localY, event) => {
        event?.stopPropagation?.();
        this.switchLane(lane);
      });
      root.add([shadow, leftPost, rightPost, board, pinLeft, pinRight, outline, label, hit]);
      const gate = {
        root,
        board,
        outline,
        label,
        leftPost,
        rightPost,
        shadow,
        lane,
        option
      };
      this.paintGate(gate);
      return gate;
    });
    this.paintGateSelection();
  }

  paintGate(gate, result = null) {
    const selected = gate.lane === this.lane;
    const outlineColor = result === 'correct'
      ? 0x3a9b67
      : result === 'wrong'
        ? 0xd2685d
        : selected
          ? 0x2e6a4b
          : 0xcdbb99;
    gate.board.clear();
    gate.board.fillStyle(WOOD_LIGHT, result ? .99 : .96);
    gate.board.fillRoundedRect(-112, -222, 224, 76, 18);
    gate.board.lineStyle(result ? 5 : selected ? 4 : 2, outlineColor, 1);
    gate.board.strokeRoundedRect(-112, -222, 224, 76, 18);
    gate.outline.clear();
    if (selected || result) {
      gate.outline.lineStyle(3, outlineColor, .9);
      gate.outline.beginPath();
      gate.outline.moveTo(-96, -150);
      gate.outline.lineTo(-96, -4);
      gate.outline.moveTo(96, -150);
      gate.outline.lineTo(96, -4);
      gate.outline.strokePath();
    }
    gate.leftPost.setFillStyle(selected ? 0x755438 : WOOD_DARK, 1);
    gate.rightPost.setFillStyle(selected ? 0x755438 : WOOD_DARK, 1);
    gate.label.setColor(result === 'wrong' ? '#9c4038' : INK_GREEN);
    gate.shadow.setAlpha(selected || result ? .24 : .16);
  }

  paintGateSelection() {
    if (!this.gates) return;
    this.gates.forEach(gate => this.paintGate(gate));
  }

  positionGates() {
    if (!this.gates) return;
    const width = this.scale.width;
    const responsive = Phaser.Math.Clamp(width / 1120, .55, 1.15);
    const visual = this.gateVisual();
    const point = this.perspective(visual);
    const laneGap = point.half * 2 / 3;
    const fitFactor = width < 640 ? .95 : .82;
    const fitScale = laneGap * fitFactor / 224;
    const commonScale = Math.min(point.scale * responsive, fitScale);
    this.gates.forEach(gate => {
      gate.root
        .setPosition(this.laneXAt(gate.lane, visual), point.y)
        .setScale(commonScale)
        .setDepth(26 + Math.round(point.eased * 18));
      gate.root.setAlpha(Math.min(1, .2 + this.gateProgress * 1.8));
    });
  }

  layoutPlayerLane(immediate = false) {
    if (!this.player) return;
    const target = this.laneXAt(this.lane, 1);
    if (this.laneTween) {
      this.laneTween.stop();
      this.laneTween = null;
    }
    if (immediate) {
      this.player.x = target;
      this.playerShadow.x = target;
      return;
    }
    this.tweens.add({ targets: this.playerShadow, x: target, duration: 150, ease: 'Sine.easeOut' });
    this.laneTween = this.tweens.add({
      targets: this.player,
      x: target,
      duration: 150,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.player.x = target;
        this.playerShadow.x = target;
        this.tweens.add({ targets: this.player, angle: 0, duration: 80 });
      }
    });
    this.tweens.add({ targets: this.player, angle: this.lane === 0 ? -3 : this.lane === 2 ? 3 : 0, duration: 90 });
  }

  switchLane(next) {
    if (!['running', 'countdown'].includes(this.phase)) return;
    const clamped = Phaser.Math.Clamp(next, 0, 2);
    if (clamped === this.lane) return;
    this.lane = clamped;
    this.layoutPlayerLane();
    this.dustBurst.explode(6, this.player.x, this.player.y - 4);
    this.safeSound('sfx-switch', .28);
    this.paintGateSelection();
    this.eventsBus.emit('state', this.getState());
  }

  update(_time, delta) {
    if (!this.roadGfx) return;
    if (this.phase !== 'paused') {
      this.sceneryClock += delta / 1000;
      this.cloudLayer.tilePositionX += delta * .004;
    }
    this.drawRoad();
    this.updateScenery();

    if (this.phase === 'countdown') {
      const previousDigit = this.countdownDigit;
      this.countdown = Math.max(0, this.countdown - delta / 1000);
      this.countdownDigit = Math.ceil(this.countdown);
      if (this.countdownDigit !== previousDigit && this.countdownDigit > 0) {
        this.countdownText.setText(String(this.countdownDigit));
        this.countdownText.setScale(1.18);
        this.tweens.add({ targets: this.countdownText, scale: 1, duration: 160 });
      }
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.countdownText.setText('出发！').setFontSize(66).setScale(1.08);
        this.tweens.add({
          targets: this.countdownText,
          alpha: 0,
          scale: 1.45,
          duration: 320,
          onComplete: () => this.countdownText.setVisible(false)
        });
        this.tweens.add({ targets: this.countdownPlate, alpha: 0, duration: 320 });
        this.setPlayerPose('run');
        this.eventsBus.emit('state', this.getState());
      }
      return;
    }

    if (this.phase === 'running') {
      this.gateProgress = Math.min(1, this.gateProgress + delta / (QUESTION_SECONDS * 1000));
      this.positionGates();
      if (this.playerPose === 'hurt' && this.gateProgress > .35) this.setPlayerPose('run');
      this.animatePlayer(delta);
      this.hudClock += delta;
      if (this.hudClock >= 55) {
        this.hudClock = 0;
        this.eventsBus.emit('state', this.getState());
      }
      if (this.gateProgress >= 1) this.resolveQuestion();
      return;
    }

    if (this.phase === 'feedback') {
      this.animatePlayer(delta);
      this.transitionRemaining = Math.max(0, this.transitionRemaining - delta / 1000);
      if (this.transitionRemaining <= 0) this.advanceQuestion();
      return;
    }

    if (this.phase === 'complete') this.animatePlayer(delta);
  }

  animatePlayer(delta) {
    this.playerClock += delta;
    if (!['running', 'feedback'].includes(this.phase) || this.playerPose === 'hurt') return;
    if (this.playerPose !== 'run') this.setPlayerPose('run');
    const frame = Math.floor(this.playerClock / 105) % this.playerRunFrames.length;
    if (frame !== this.playerFrame) {
      this.playerFrame = frame;
      this.player.setTexture(this.playerRunFrames[frame]);
    }
  }

  setPlayerPose(pose) {
    if (!this.player) return;
    this.playerPose = pose;
    const textures = {
      idle: 'char-idle',
      run: 'char-run1',
      hurt: 'char-hurt',
      cheer: 'char-cheer0'
    };
    this.player.setTexture(textures[pose] || 'char-idle');
  }

  celebrate() {
    if (this.celebrateTimer) this.celebrateTimer.remove(false);
    let frame = 0;
    this.celebrateTimer = this.time.addEvent({
      delay: 115,
      repeat: 7,
      callback: () => {
        this.player.setTexture(frame % 2 === 0 ? 'char-cheer0' : 'char-cheer1');
        frame += 1;
      }
    });
  }

  resolveQuestion() {
    if (this.phase !== 'running') return;
    this.gateProgress = 1;
    this.positionGates();
    const selected = this.options[this.lane];
    const correct = selected === this.currentItem.correct;
    const correctLane = this.options.indexOf(this.currentItem.correct);
    this.answers.push({
      prompt: this.currentItem.prompt,
      selected,
      correct: this.currentItem.correct
    });
    this.gates.forEach((gate, lane) => this.paintGate(gate, lane === correctLane ? 'correct' : null));
    if (this.gates[this.lane] && this.lane !== correctLane) {
      this.paintGate(this.gates[this.lane], 'wrong');
    }

    if (correct) {
      this.score += 1;
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.feedback = {
        visible: true,
        kind: 'correct',
        title: `+1 拾取·${this.currentItem.prompt} 对应 ${this.currentItem.correct}`,
        body: ''
      };
      this.safeSound('sfx-correct', .62);
      this.successBurst.explode(9, this.gates[correctLane].root.x, this.gates[correctLane].root.y - 160);
      this.sparkBurst.explode(6, this.player.x, this.player.y - this.player.displayHeight * .55);
      this.setPlayerPose('cheer');
      this.tweens.add({
        targets: this.player,
        y: this.player.y - 24,
        duration: 170,
        yoyo: true,
        ease: 'Sine.easeOut',
        onComplete: () => this.setPlayerPose('run')
      });
      this.transitionRemaining = .88;
    } else {
      this.combo = 0;
      this.feedback = {
        visible: true,
        kind: 'wrong',
        title: '再看一眼',
        body: `正确答案：${this.currentItem.correct}`
      };
      this.setPlayerPose('hurt');
      this.tweens.add({
        targets: this.player,
        angle: { from: -5, to: 5 },
        duration: 68,
        yoyo: true,
        repeat: 2,
        onComplete: () => {
          this.player.setAngle(0);
          this.setPlayerPose('run');
        }
      });
      this.safeSound('sfx-wrong', .44, 130);
      this.eventsBus.emit('speak', {
        path: this.currentItem.audio,
        text: this.currentItem.speechText,
        lang: this.currentItem.speechLang
      });
      this.transitionRemaining = 2.1;
    }
    this.phase = 'feedback';
    this.eventsBus.emit('state', this.getState());
  }

  spawnFloatingText(text, x, y, color) {
    const label = this.add.text(x, y, text, {
      fontFamily: uiFont(),
      fontStyle: 'bold',
      fontSize: '22px',
      color,
      stroke: '#37523b',
      strokeThickness: 5
    }).setOrigin(.5).setDepth(90).setResolution(2);
    this.tweens.add({
      targets: label,
      y: y - 38,
      alpha: 0,
      duration: 780,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy()
    });
  }

  advanceQuestion() {
    if (this.phase !== 'feedback') return;
    this.index += 1;
    if (this.index >= this.items.length) {
      this.showJourneyComplete();
      return;
    }
    this.loadQuestion(false);
  }

  showJourneyComplete() {
    if (this.phase === 'complete') return;
    this.phase = 'complete';
    this.feedback = { visible: false, kind: 'correct', title: '', body: '' };
    this.gates?.forEach(gate => gate.root.destroy());
    this.gates = [];
    const passed = completionSound(this.score, this.items.length) === 'result';
    this.setPlayerPose(passed ? 'cheer' : 'idle');
    if (passed) {
      this.celebrate();
      this.successBurst.explode(16, this.scale.width / 2, this.scale.height * .62);
    }
    this.safeSound(passed ? 'sfx-finish' : 'sfx-retry', passed ? .4 : .32);
    this.eventsBus.emit('state', this.getState());
    if (!this.completeEmitted) {
      this.completeEmitted = true;
      this.eventsBus.emit('journey-complete', {
        score: this.score,
        answers: this.answers.map(answer => ({ ...answer })),
        bestCombo: this.bestCombo
      });
    }
  }

  finishJourney() {
    if (this.phase !== 'complete' || this.finished) return;
    this.finished = true;
    this.onComplete({
      score: this.score,
      answers: this.answers,
      bestCombo: this.bestCombo
    });
  }

  restartJourney() {
    if (this.celebrateTimer) {
      this.celebrateTimer.remove(false);
      this.celebrateTimer = null;
    }
    this.finished = false;
    this.startJourney();
  }

  pause() {
    if (!['running', 'countdown', 'feedback'].includes(this.phase)) return;
    this.phaseBeforePause = this.phase;
    this.phase = 'paused';
    this.eventsBus.emit('state', this.getState());
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.phaseBeforePause;
    this.eventsBus.emit('state', this.getState());
  }

  safeSound(key, volume, delay = 0) {
    if (this.cache.audio.exists(key)) {
      this.audioLog.push(key);
      if (this.audioLog.length > 24) this.audioLog.shift();
      this.sound.play(key, { volume, delay: delay / 1000 });
    }
  }

  stageMeta() {
    const safeIndex = Math.min(this.index, this.items.length - 1);
    const stageIndex = Math.min(this.areaNames.length - 1, Math.floor(safeIndex / STAGE_SIZE));
    const questionInStage = this.phase === 'complete' ? STAGE_SIZE : (safeIndex % STAGE_SIZE) + 1;
    return {
      area: { name: this.areaNames[stageIndex], accent: this.palette.ground },
      stageIndex,
      questionInStage,
      stageSize: STAGE_SIZE
    };
  }

  getState() {
    const stage = this.stageMeta();
    const visual = this.gateVisual();
    const gatePoint = this.perspective(visual);
    const gateScale = this.gates?.[0]?.root.scaleX || 0;
    const goal = this.pack?.subject === '语文'
      ? '找到对应的拼音'
      : this.pack?.subject === '英语'
        ? '找到对应的英文'
        : '找到对应的内容';
    const complete = this.phase === 'complete';
    return {
      index: this.index,
      total: this.items.length,
      itemIds: this.items.map(item => item.id),
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      lane: this.lane,
      phase: this.phase,
      theme: this.theme,
      stageDetail: this.palette.detail,
      countdown: this.countdown,
      gateProgress: this.gateProgress,
      transitionRemaining: this.transitionRemaining,
      sounds: [...this.audioLog],
      prompt: complete ? '抵达终点' : this.currentItem?.prompt || '',
      goal: complete ? '完成这段林间冒险' : goal,
      options: [...this.options],
      completed: complete,
      areaName: stage.area.name,
      stageIndex: stage.stageIndex,
      questionInStage: stage.questionInStage,
      stageSize: stage.stageSize,
      treeTexture: this.treeTextureKey(),
      treeTextureReady: this.textures.exists(this.treeTextureKey()),
      correctLane: this.options.indexOf(this.currentItem?.correct),
      feedback: { ...this.feedback },
      geometry: {
        width: this.scale.width,
        height: this.scale.height,
        horizon: Math.round(this.horizonY()),
        gateFootY: Math.round(gatePoint.y),
        roadHalf: Math.round(gatePoint.half),
        laneCenters: [0, 1, 2].map(lane => Math.round(this.laneXAt(lane, visual))),
        roadEdges: {
          left: Math.round(this.scale.width / 2 - gatePoint.half),
          right: Math.round(this.scale.width / 2 + gatePoint.half)
        },
        gates: this.gates?.map(gate => ({
          lane: gate.lane,
          x: Math.round(gate.root.x),
          footY: Math.round(gate.root.y),
          scale: Number(gate.root.scaleX.toFixed(3)),
          signWidth: Math.round(224 * gate.root.scaleX),
          answer: this.options[gate.lane]
        })) || [],
        scenery: this.sceneryActors
          ?.filter(actor => actor.root.visible)
          .map(actor => ({
            x: actor.x,
            y: actor.y,
            width: actor.displayWidth,
            side: actor.side,
            roadEdge: actor.roadEdge
          })) || [],
        player: {
          x: Math.round(this.player?.x || 0),
          y: Math.round(this.player?.y || 0),
          targetX: Math.round(this.laneXAt(this.lane, 1)),
          shadowX: Math.round(this.playerShadow?.x || 0),
          width: Math.round(this.player?.displayWidth || 0),
          height: Math.round(this.player?.displayHeight || 0),
          heightRatio: Number((this.player?.displayHeight / this.scale.height || 0).toFixed(3))
        }
      }
    };
  }

  publishDebug() {
    const scene = this;
    window.__learningGameDebug = {
      ...(window.__learningGameDebug || {}),
      runner: {
        state: () => scene.getState(),
        switchLane: lane => scene.switchLane(lane),
        advanceToGate: progress => {
          if (scene.phase === 'countdown') {
            scene.countdown = 0;
            scene.countdownDigit = 0;
            scene.phase = 'running';
            scene.countdownText.setVisible(false);
            scene.countdownPlate.setVisible(false);
            scene.setPlayerPose('run');
          }
          if (scene.phase === 'running') {
            scene.gateProgress = Phaser.Math.Clamp(progress, 0, .985);
            scene.positionGates();
            scene.eventsBus.emit('state', scene.getState());
          }
        },
        freezeAtGate: progress => {
          if (scene.phase === 'countdown') {
            scene.countdown = 0;
            scene.countdownDigit = 0;
            scene.countdownText.setVisible(false);
            scene.countdownPlate.setVisible(false);
            scene.setPlayerPose('run');
          }
          scene.phaseBeforePause = scene.phase === 'paused'
            ? scene.phaseBeforePause
            : scene.phase;
          scene.phase = 'paused';
          scene.gateProgress = Phaser.Math.Clamp(progress, 0, .985);
          scene.positionGates();
          scene.eventsBus.emit('state', scene.getState());
        },
        collision: () => {
          if (scene.phase === 'countdown') {
            scene.countdown = 0;
            scene.phase = 'running';
            scene.countdownText.setVisible(false);
            scene.countdownPlate.setVisible(false);
          }
          if (scene.phase === 'running') {
            scene.gateProgress = 1;
            scene.positionGates();
            scene.resolveQuestion();
          }
        },
        continue: () => {
          if (scene.phase === 'feedback') {
            scene.transitionRemaining = 0;
            scene.advanceQuestion();
          }
        },
        finish: () => scene.finishJourney(),
        restart: () => scene.restartJourney(),
        pause: () => scene.pause(),
        resume: () => scene.resume()
      }
    };
  }

  shutdown() {
    if (this.celebrateTimer) this.celebrateTimer.remove(false);
    this.scale.off('resize', this.layout, this);
    this.eventsBus.off('pause', this.pause, this);
    this.eventsBus.off('resume', this.resume, this);
    this.eventsBus.off('finish', this.finishJourney, this);
    this.eventsBus.off('restart', this.restartJourney, this);
    this.eventsBus.off('switch-lane', this.switchLaneHandler);
    if (this.input?.keyboard) {
      this.input.keyboard.off('keydown-LEFT', this.keyLeftHandler);
      this.input.keyboard.off('keydown-RIGHT', this.keyRightHandler);
      this.input.keyboard.off('keydown-ONE', this.keyOneHandler);
      this.input.keyboard.off('keydown-TWO', this.keyTwoHandler);
      this.input.keyboard.off('keydown-THREE', this.keyThreeHandler);
    }
    if (window.__learningGameDebug?.runner) delete window.__learningGameDebug.runner;
  }
}

export function mountRunnerGame({ container, items, pack, effectVolume, areaNames, theme, onComplete }) {
  const events = new Phaser.Events.EventEmitter();
  const scene = new RunnerScene({
    items,
    pack,
    effectVolume,
    areaNames,
    theme,
    onComplete,
    events
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: '#d8f0ee',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: container.clientWidth || 1280,
      height: container.clientHeight || 720
    },
    render: {
      antialias: true,
      roundPixels: false
    },
    audio: {
      disableWebAudio: false
    },
    scene,
    callbacks: {
      postBoot: instance => {
        instance.events.once('destroy', () => scene.shutdown());
      }
    }
  });
  return {
    events,
    game,
    destroy() {
      scene.shutdown();
      game.destroy(true);
    }
  };
}
