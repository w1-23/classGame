const Phaser = window.Phaser;

const QUESTION_SECONDS = 8;
const COUNTDOWN_SECONDS = 3;
const STAGE_SIZE = 3;
const PLAYER_SOURCE_HEIGHT = 128;
const PLAYER_HEIGHT_RATIO = .25;
const MAX_GATE_VISUAL = .84;
const ROAD_COLOR = 0xf1dfb7;
const ROAD_EDGE_COLOR = 0xd4bd8d;
const GRASS_NEAR = 0x93c777;
const HORIZON_BLUE = 0xd8f0ee;
const WOOD_DARK = 0x805f3e;
const WOOD_LIGHT = 0xf2e6c8;
const INK_GREEN = '#183d2d';

const AREAS = [
  { name: '阳光林地', accent: 0x8fc16f },
  { name: '溪边栈道', accent: 0x77b987 },
  { name: '林间营地', accent: 0xa8bf72 }
];

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
    this.onComplete = options.onComplete;
    this.eventsBus = options.events;
    this.index = 0;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.coins = 0;
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
    this.laneTween = null;
  }

  preload() {
    const character = 'assets/kenney/characters';
    const platformer = 'assets/kenney/platformer';
    const ui = 'assets/kenney/ui';
    const particles = 'assets/kenney/particles';
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
      ['coin', `${platformer}/coin_gold.png`],
      ['ui-check', `${ui}/icon-checkmark.png`],
      ['ui-cross', `${ui}/icon-cross.png`],
      ['fx-star', `${particles}/star.png`],
      ['fx-spark', `${particles}/spark.png`],
      ['fx-circle', `${particles}/circle.png`]
    ].forEach(([key, path]) => this.load.image(key, path));

    this.load.audio('sfx-switch', 'audio/kenney/switch_002.ogg');
    this.load.audio('sfx-correct', 'audio/kenney/confirmation_002.ogg');
    this.load.audio('sfx-wrong', 'audio/kenney/error_004.ogg');
    this.load.audio('sfx-coin', 'audio/kenney/coin.ogg');
    this.load.audio('sfx-hurt', 'audio/kenney/hurt.ogg');
    this.load.audio('sfx-finish', 'audio/kenney/result.ogg');
  }

  create() {
    this.sound.volume = Phaser.Math.Clamp(this.effectVolume, 0, 1);
    this.createBackground();
    this.roadGfx = this.add.graphics().setDepth(2);
    this.createScenery();
    this.createCoinPickups();
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
    this.hillGfx = this.add.graphics().setDepth(-24);
    this.cloudLayer = this.add.tileSprite(0, 0, 10, 10, 'clouds')
      .setOrigin(0)
      .setTint(0xfffdf0)
      .setAlpha(.7)
      .setDepth(-21);
    this.treeLine = this.add.tileSprite(0, 0, 10, 10, 'trees-cutout')
      .setOrigin(.5, 1)
      .setTint(0x91bf84)
      .setAlpha(.62)
      .setDepth(-8);
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
    const trunk = this.add.graphics();
    trunk.fillStyle(0x7d6043, 1);
    trunk.fillRoundedRect(-6, -68, 12, 68, 4);
    const back = this.add.image(0, -66, 'bush')
      .setOrigin(.5, .82)
      .setTint(index % 2 ? 0x75ad62 : 0x639e5b)
      .setScale(1.75);
    const left = this.add.image(-28, -54, 'bush')
      .setOrigin(.5, .86)
      .setTint(index % 3 ? 0x8fc871 : 0x75b469)
      .setScale(1.18);
    const right = this.add.image(27, -50, 'bush')
      .setOrigin(.5, .86)
      .setTint(index % 2 ? 0x87c16c : 0x6eaa61)
      .setScale(1.08);
    root.add([shadow, trunk, back, left, right]);
    return {
      root,
      side,
      variant: index % 3,
      offset: index / 12,
      speed: .035 + (index % 4) * .006,
      baseScale: .64 + (index % 4) * .11,
      canopyWidth: 150
    };
  }

  createScenery() {
    this.sceneryActors = [];
    for (let index = 0; index < 14; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      this.sceneryActors.push(this.makeTreeActor(index, side));
    }
  }

  createCoinPickups() {
    this.coinPickups = [0, 1].map(() => {
      const image = this.add.image(0, 0, 'coin').setOrigin(.5).setDepth(35).setVisible(false);
      return { image, lane: 1, start: .3, collected: false, expired: false };
    });
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

    this.skyBackdrop.clear();
    this.skyBackdrop.fillStyle(HORIZON_BLUE, 1);
    this.skyBackdrop.fillRect(0, 0, width, horizon + 1);

    this.drawHills();
    const cloudScale = Phaser.Math.Clamp(width / 1800, .42, 1);
    this.cloudLayer
      .setPosition(0, 0)
      .setSize(width, height * .22)
      .setTileScale(cloudScale);

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
    this.updateCoins();

    const countSize = Phaser.Math.Clamp(width * .075, 56, 104);
    this.countdownText
      .setPosition(width / 2, horizon + (height - horizon) * .28);
    this.countdownText.setFontSize(countSize);
    this.countdownPlate
      .setPosition(this.countdownText.x, this.countdownText.y)
      .setDisplaySize(countSize * 1.45, countSize * 1.45);
  }

  drawHills() {
    const width = this.scale.width;
    const horizon = this.horizonY();
    const g = this.hillGfx;
    g.clear();
    g.fillStyle(0xa8d1a7, .7);
    g.fillEllipse(width * .08, horizon + 4, width * .7, 112);
    g.fillEllipse(width * .78, horizon - 3, width * .85, 126);
    g.fillStyle(0x83b976, .82);
    g.fillEllipse(width * .48, horizon + 22, width * .95, 92);
    g.fillStyle(0x93c777, 1);
    g.fillRect(0, horizon, width, this.scale.height - horizon);
  }

  drawRoad() {
    if (!this.roadGfx) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const g = this.roadGfx;
    g.clear();

    const near = this.perspective(1);
    g.fillStyle(ROAD_EDGE_COLOR, .38);
    g.beginPath();
    g.moveTo(width / 2 - this.roadHalfAt(0) - 8, horizon);
    g.lineTo(width / 2 + this.roadHalfAt(0) + 8, horizon);
    g.lineTo(width / 2 + near.half + 14, height);
    g.lineTo(width / 2 - near.half - 14, height);
    g.closePath();
    g.fillPath();

    g.fillStyle(ROAD_COLOR, 1);
    g.beginPath();
    g.moveTo(width / 2 - this.roadHalfAt(0), horizon);
    g.lineTo(width / 2 + this.roadHalfAt(0), horizon);
    g.lineTo(width / 2 + near.half, height);
    g.lineTo(width / 2 - near.half, height);
    g.closePath();
    g.fillPath();

    for (let divider = 1; divider < 3; divider += 1) {
      for (let dash = 0; dash < 16; dash += 1) {
        const start = (dash / 16 + this.sceneryClock * .025) % 1;
        const end = Math.min(.995, start + .022);
        if (end <= start) continue;
        const p0 = this.perspective(start);
        const p1 = this.perspective(end);
        g.lineStyle(
          Phaser.Math.Linear(.7, 3.4, p0.eased),
          Phaser.Math.Linear(0xcbbd9f, 0xb9a582, p0.eased),
          Phaser.Math.Linear(.2, .36, p0.eased)
        );
        g.beginPath();
        g.moveTo(width / 2 + (divider * 2 / 3 - 1) * p0.half, p0.y);
        g.lineTo(width / 2 + (divider * 2 / 3 - 1) * p1.half, p1.y);
        g.strokePath();
      }
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
    this.coins = 0;
    this.lane = 1;
    this.answers = [];
    this.audioLog = [];
    this.finished = false;
    this.feedback = { visible: false, kind: 'correct', title: '', body: '' };
    this.loadQuestion(true);
  }

  loadQuestion(initial = false) {
    this.currentItem = this.items[this.index];
    this.options = optionList(this.currentItem);
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
    this.resetCoinRoutes();
    this.updateCoins();
    this.toggleCountdown(initial);
    this.eventsBus.emit('state', this.getState());
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
      hit.on('pointerdown', () => this.switchLane(lane));
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
    const responsive = Phaser.Math.Clamp(width / 1120, .5, 1.15);
    const visual = this.gateVisual();
    const point = this.perspective(visual);
    const laneGap = point.half * 2 / 3;
    const fitFactor = width < 640 ? 1.1 : .82;
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

  resetCoinRoutes() {
    const lanes = [(this.index + 1) % 3, (this.index + 2) % 3];
    this.coinPickups.forEach((coin, index) => {
      coin.lane = lanes[index];
      coin.start = index === 0 ? .26 : .48;
      coin.collected = false;
      coin.expired = false;
      coin.image
        .setTexture('coin')
        .setAlpha(1)
        .setScale(1)
        .setVisible(true);
      this.tweens.killTweensOf(coin.image);
    });
  }

  updateCoins() {
    if (!this.coinPickups) return;
    const width = this.scale.width;
    const height = this.scale.height;
    this.coinPickups.forEach(coin => {
      if (coin.collected || coin.expired) return;
      const progress = Phaser.Math.Clamp(
        coin.start + this.gateProgress * (MAX_GATE_VISUAL - coin.start),
        coin.start,
        MAX_GATE_VISUAL
      );
      const point = this.perspective(progress);
      const scale = point.scale * Phaser.Math.Clamp(width / 1200, .62, 1.1);
      coin.image
        .setPosition(this.laneXAt(coin.lane, progress), point.y - 22 * scale)
        .setScale(scale)
        .setVisible(this.gateProgress > .05)
        .setAlpha(Math.min(1, this.gateProgress * 5, (1 - this.gateProgress) * 12));
      if (this.gateProgress >= .48 && this.lane === coin.lane) {
        this.collectCoin(coin);
      } else if (this.gateProgress >= .94) {
        coin.expired = true;
        coin.image.setVisible(false);
      }
    });
  }

  collectCoin(coin) {
    if (coin.collected) return;
    coin.collected = true;
    this.coins += 1;
    this.safeSound('sfx-coin', .48);
    this.sparkBurst.explode(5, coin.image.x, coin.image.y);
    this.spawnFloatingText('+1', coin.image.x, coin.image.y - 18, '#fff3b2');
    this.tweens.add({
      targets: coin.image,
      x: this.scale.width * .82,
      y: this.scale.height * .08,
      scale: .34,
      alpha: 0,
      duration: 430,
      ease: 'Cubic.easeIn',
      onComplete: () => coin.image.setVisible(false)
    });
    this.eventsBus.emit('state', this.getState());
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
      this.updateCoins();
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
    this.updateCoins();
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
      this.eventsBus.emit('speak', this.currentItem.audio);
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
    this.phase = 'complete';
    this.feedback = { visible: false, kind: 'correct', title: '', body: '' };
    this.gates?.forEach(gate => gate.root.destroy());
    this.gates = [];
    this.coinPickups.forEach(coin => coin.image.setVisible(false));
    this.setPlayerPose('cheer');
    this.celebrate();
    this.safeSound('sfx-finish', .4);
    this.successBurst.explode(16, this.scale.width / 2, this.scale.height * .62);
    this.eventsBus.emit('state', this.getState());
  }

  finishJourney() {
    if (this.phase !== 'complete' || this.finished) return;
    this.finished = true;
    this.onComplete({
      score: this.score,
      answers: this.answers,
      coins: this.coins,
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
    const stageIndex = Math.min(AREAS.length - 1, Math.floor(safeIndex / STAGE_SIZE));
    const questionInStage = this.phase === 'complete' ? STAGE_SIZE : (safeIndex % STAGE_SIZE) + 1;
    return {
      area: AREAS[stageIndex],
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
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      coins: this.coins,
      lane: this.lane,
      phase: this.phase,
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
        coins: this.coinPickups?.filter(coin => coin.image.visible && !coin.collected && !coin.expired).map(coin => ({
          lane: coin.lane,
          x: Math.round(coin.image.x),
          y: Math.round(coin.image.y),
          width: Math.round(coin.image.displayWidth)
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
            scene.updateCoins();
            scene.eventsBus.emit('state', scene.getState());
          }
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

export function mountRunnerGame({ container, items, pack, effectVolume, onComplete }) {
  const events = new Phaser.Events.EventEmitter();
  const scene = new RunnerScene({ items, pack, effectVolume, onComplete, events });
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
