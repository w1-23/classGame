const Phaser = window.Phaser;

const QUESTION_SECONDS = 6;
const COUNTDOWN_SECONDS = 3;
const PLAYER_SOURCE_HEIGHT = 128;

const LANE_STYLES = [
  {
    color: 0x22b8e8,
    soft: 0x8be9ff,
    block: 'gate-column-blue',
    button: 'ui-button-blue',
    label: '蓝道'
  },
  {
    color: 0x28bd69,
    soft: 0xa6f7c2,
    block: 'gate-column-green',
    button: 'ui-button-green',
    label: '绿道'
  },
  {
    color: 0xffbd2f,
    soft: 0xffe59a,
    block: 'gate-column-yellow',
    button: 'ui-button-yellow',
    label: '黄道'
  }
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
    this.answers = [];
    this.currentItem = null;
    this.options = [];
    this.sceneryClock = 0;
    this.playerClock = 0;
    this.playerPose = 'idle';
    this.audioLog = [];
    this.idleTween = null;
    this.celebrateTimer = null;
  }

  preload() {
    const character = 'assets/kenney/characters';
    const platformer = 'assets/kenney/platformer';
    const ui = 'assets/kenney/ui';
    const particles = 'assets/kenney/particles';
    const images = [
      ['char-idle', `${character}/adventurer-idle.png`],
      ['char-run0', `${character}/adventurer-run0.png`],
      ['char-run1', `${character}/adventurer-run1.png`],
      ['char-run2', `${character}/adventurer-run2.png`],
      ['char-jump', `${character}/adventurer-jump.png`],
      ['char-fall', `${character}/adventurer-fall.png`],
      ['char-hit', `${character}/adventurer-hit.png`],
      ['char-hurt', `${character}/adventurer-hurt.png`],
      ['char-cheer0', `${character}/adventurer-cheer0.png`],
      ['char-cheer1', `${character}/adventurer-cheer1.png`],
      ['char-slide', `${character}/adventurer-slide.png`],
      ['sky', `${platformer}/background_solid_sky.png`],
      ['clouds', `${platformer}/background_clouds.png`],
      ['hills', `${platformer}/background_color_hills.png`],
      ['trees', `${platformer}/background_color_trees.png`],
      ['mushroom-hills', `${platformer}/background_color_mushrooms.png`],
      ['grass-top', `${platformer}/terrain_grass_block_top.png`],
      ['grass-center', `${platformer}/terrain_grass_block_center.png`],
      ['stone-top', `${platformer}/terrain_stone_block_top.png`],
      ['stone-center', `${platformer}/terrain_stone_block_center.png`],
      ['hill', `${platformer}/hill.png`],
      ['hill-top', `${platformer}/hill_top.png`],
      ['bush', `${platformer}/bush.png`],
      ['grass', `${platformer}/grass.png`],
      ['rock', `${platformer}/rock.png`],
      ['mushroom-red', `${platformer}/mushroom_red.png`],
      ['coin', `${platformer}/coin_gold.png`],
      ['coin-bronze', `${platformer}/coin_bronze.png`],
      ['coin-silver', `${platformer}/coin_silver.png`],
      ['gem-blue', `${platformer}/gem_blue.png`],
      ['gem-green', `${platformer}/gem_green.png`],
      ['gem-yellow', `${platformer}/gem_yellow.png`],
      ['hud-coin', `${platformer}/hud_coin.png`],
      ['flag-blue-a', `${platformer}/flag_blue_a.png`],
      ['flag-blue-b', `${platformer}/flag_blue_b.png`],
      ['flag-green-a', `${platformer}/flag_green_a.png`],
      ['flag-green-b', `${platformer}/flag_green_b.png`],
      ['gate-column-blue', `${platformer}/block_blue.png`],
      ['gate-column-green', `${platformer}/block_green.png`],
      ['gate-column-yellow', `${platformer}/block_yellow.png`],
      ['gate-door-closed', `${platformer}/door_closed.png`],
      ['gate-door-open', `${platformer}/door_open.png`],
      ['ui-button-blue', `${ui}/button-rectangle-blue.png`],
      ['ui-button-green', `${ui}/button-rectangle-green.png`],
      ['ui-button-yellow', `${ui}/button-rectangle-yellow.png`],
      ['ui-button-red', `${ui}/button-rectangle-red.png`],
      ['ui-check', `${ui}/icon-checkmark.png`],
      ['ui-cross', `${ui}/icon-cross.png`],
      ['ui-star', `${ui}/star.png`],
      ['fx-star', `${particles}/star.png`],
      ['fx-spark', `${particles}/spark.png`],
      ['fx-circle', `${particles}/circle.png`]
    ];
    images.forEach(([key, path]) => this.load.image(key, path));

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
    this.createPlayer();
    this.createHud();
    this.createFeedback();
    this.createParticles();
    this.createCountdown();
    this.createControls();
    this.layout();

    this.scale.on('resize', this.layout, this);
    this.eventsBus.on('pause', this.pause, this);
    this.eventsBus.on('resume', this.resume, this);
    this.switchLaneHandler = lane => this.switchLane(lane);
    this.eventsBus.on('switch-lane', this.switchLaneHandler);
    this.eventsBus.on('continue', this.continueNext, this);

    this.publishDebug();
    this.showQuestion();
  }

  createBackground() {
    this.skyBackdrop = this.add.graphics().setDepth(-22);
    this.sky = this.add.tileSprite(0, 0, 10, 10, 'sky')
      .setOrigin(0)
      .setTint(0x83d5ff)
      .setAlpha(.24)
      .setDepth(-20);
    this.cloudLayer = this.add.tileSprite(0, 0, 10, 10, 'clouds')
      .setOrigin(0)
      .setAlpha(.7)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(-18);
    this.sunHalo = this.add.image(0, 0, 'fx-star')
      .setTint(0xfff1a1)
      .setAlpha(.18)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-19);
    this.treeLayer = this.add.image(0, 0, 'trees')
      .setOrigin(.5, 1)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(-17);
    this.hillLayer = this.add.image(0, 0, 'hills')
      .setOrigin(.5, 1)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(-16);
    this.horizonHaze = this.add.rectangle(0, 0, 10, 10, 0xd8f5ff, .2)
      .setOrigin(0, .5)
      .setDepth(-15);
  }

  createScenery() {
    const sideTextures = [
      ['flag-blue-a', 'flag-blue-b'],
      ['flag-green-a', 'flag-green-b'],
      ['bush'],
      ['rock'],
      ['mushroom-red'],
      ['grass']
    ];
    const laneTextures = ['coin', 'gem-blue', 'gem-green', 'gem-yellow', 'coin-bronze'];
    this.sceneryActors = [];
    for (let index = 0; index < 16; index += 1) {
      const sidePair = sideTextures[index % sideTextures.length];
      const image = this.add.image(0, 0, sidePair[0]).setDepth(4);
      this.sceneryActors.push({
        image,
        frames: sidePair,
        side: index % 2 === 0 ? -1 : 1,
        lane: null,
        offset: index / 16,
        scale: .72 + (index % 3) * .14
      });
    }
    for (let index = 0; index < 10; index += 1) {
      const image = this.add.image(0, 0, laneTextures[index % laneTextures.length]).setDepth(5);
      this.sceneryActors.push({
        image,
        frames: null,
        side: 0,
        lane: index % 3,
        offset: (index / 10 + .06) % 1,
        scale: .62
      });
    }
  }

  createPlayer() {
    this.playerShadow = this.add.ellipse(0, 0, 90, 22, 0x103a2a, .28).setDepth(52);
    this.playerAura = this.add.image(0, 0, 'fx-star')
      .setTint(0xffef9a)
      .setAlpha(.14)
      .setDepth(53);
    this.player = this.add.image(0, 0, 'char-idle').setOrigin(.5, 1).setDepth(55);
    this.playerRunFrames = ['char-run0', 'char-run1', 'char-run2', 'char-run1'];
    this.playerFrame = 0;
  }

  createHud() {
    this.hudGfx = this.add.graphics().setDepth(100);
    const textStyle = {
      fontFamily: uiFont(),
      color: '#ffffff',
      fontStyle: 'bold'
    };
    this.progressText = this.add.text(0, 0, '', { ...textStyle, fontSize: '20px' }).setDepth(102);
    this.promptText = this.add.text(0, 0, '', {
      ...textStyle,
      fontSize: '38px',
      color: '#fff3a8',
      stroke: '#0a3151',
      strokeThickness: 5,
      align: 'center'
    }).setOrigin(.5, 0).setDepth(102);
    this.scoreText = this.add.text(0, 0, '', {
      ...textStyle,
      fontSize: '22px',
      align: 'right'
    }).setOrigin(1, 0).setDepth(102);
    this.coinIcon = this.add.image(0, 0, 'hud-coin').setDepth(102);
    this.coinText = this.add.text(0, 0, '0', {
      ...textStyle,
      fontSize: '18px',
      color: '#ffe16a'
    }).setOrigin(1, 0).setDepth(102);
    this.comboText = this.add.text(0, 0, '', {
      ...textStyle,
      fontSize: '18px',
      color: '#ffe16a'
    }).setOrigin(1, 0).setDepth(102);
    this.timerTrack = this.add.rectangle(0, 0, 10, 12, 0xffffff, .2).setOrigin(0).setDepth(102);
    this.timerBar = this.add.rectangle(0, 0, 10, 12, 0x61e786, 1).setOrigin(0).setDepth(103);
    this.answerBanner = this.add.text(0, 0, '', {
      ...textStyle,
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#0b6b4b',
      padding: { left: 18, right: 18, top: 9, bottom: 9 },
      align: 'center'
    }).setOrigin(.5, 0).setDepth(146).setVisible(false);
  }

  createFeedback() {
    this.feedbackScrim = this.add.rectangle(0, 0, 10, 10, 0x071d31, .24)
      .setOrigin(0)
      .setDepth(150)
      .setVisible(false);
    this.feedbackPanel = this.add.container(0, 0).setDepth(151).setVisible(false);
    this.feedbackCard = this.add.graphics();
    this.feedbackIcon = this.add.image(0, 0, 'ui-check');
    this.feedbackTitle = this.add.text(0, 0, '', {
      fontFamily: uiFont(),
      fontStyle: 'bold',
      fontSize: '34px',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(.5);
    this.feedbackBody = this.add.text(0, 0, '', {
      fontFamily: uiFont(),
      fontSize: '22px',
      color: '#dff5ff',
      align: 'center',
      lineSpacing: 7
    }).setOrigin(.5);
    this.continueButton = this.add.image(0, 0, 'ui-button-green').setInteractive({ useHandCursor: true });
    this.continueLabel = this.add.text(0, 0, '继续', {
      fontFamily: uiFont(),
      fontStyle: 'bold',
      fontSize: '25px',
      color: '#ffffff'
    }).setOrigin(.5);
    this.continueButton.on('pointerup', () => {
      if (this.phase === 'paused') this.resume();
      else if (this.phase === 'resolved') this.continueNext();
    });
    this.feedbackPanel.add([
      this.feedbackCard,
      this.feedbackIcon,
      this.feedbackTitle,
      this.feedbackBody,
      this.continueButton,
      this.continueLabel
    ]);
  }

  createParticles() {
    this.successBurst = this.add.particles(0, 0, 'fx-star', {
      lifespan: 900,
      speed: { min: 190, max: 470 },
      angle: { min: 210, max: 330 },
      gravityY: 600,
      scale: { start: .2, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0xffe066, 0x72e7ff, 0xff89b0, 0x79f1a5],
      emitting: false
    }).setDepth(80);
    this.sparkBurst = this.add.particles(0, 0, 'fx-spark', {
      lifespan: 540,
      speed: { min: 90, max: 300 },
      scale: { start: .12, end: 0 },
      blendMode: 'ADD',
      emitting: false
    }).setDepth(81);
    this.coinBurst = this.add.particles(0, 0, 'coin', {
      lifespan: 800,
      speed: { min: 130, max: 290 },
      angle: { min: 230, max: 310 },
      gravityY: 700,
      scale: { start: .2, end: .07 },
      emitting: false
    }).setDepth(82);
    this.dustBurst = this.add.particles(0, 0, 'fx-circle', {
      lifespan: 420,
      speed: { min: 30, max: 120 },
      scale: { start: .1, end: 0 },
      alpha: { start: .55, end: 0 },
      tint: 0xffe9b2,
      emitting: false
    }).setDepth(51);
  }

  createCountdown() {
    this.countdownHalo = this.add.image(0, 0, 'fx-star')
      .setTint(0xffe36c)
      .setAlpha(.34)
      .setDepth(139)
      .setVisible(false);
    this.countdownText = this.add.text(0, 0, '', {
      fontFamily: uiFont(),
      fontStyle: 'bold',
      fontSize: '92px',
      color: '#fff6b0',
      stroke: '#0b3557',
      strokeThickness: 10
    }).setOrigin(.5).setDepth(140).setVisible(false);
    this.tweens.add({
      targets: this.countdownHalo,
      angle: 360,
      duration: 4500,
      repeat: -1
    });
  }

  createControls() {
    this.keyLeftHandler = () => this.switchLane(this.lane - 1);
    this.keyRightHandler = () => this.switchLane(this.lane + 1);
    this.keyUpHandler = () => this.switchLane(1);
    this.keyContinueHandler = () => {
      if (this.phase === 'resolved') this.continueNext();
      else if (this.phase === 'paused') this.resume();
    };
    this.input.keyboard.on('keydown-LEFT', this.keyLeftHandler);
    this.input.keyboard.on('keydown-RIGHT', this.keyRightHandler);
    this.input.keyboard.on('keydown-UP', this.keyUpHandler);
    this.input.keyboard.on('keydown-SPACE', this.keyContinueHandler);
    this.input.keyboard.on('keydown-ENTER', this.keyContinueHandler);
    this.input.on('pointerdown', pointer => {
      if (this.phase !== 'running' && this.phase !== 'countdown') return;
      const centers = [0, 1, 2].map(lane => this.laneXAt(lane, 1));
      let nearest = 0;
      centers.forEach((x, lane) => {
        if (Math.abs(pointer.x - x) < Math.abs(pointer.x - centers[nearest])) nearest = lane;
      });
      this.switchLane(nearest);
    });
  }

  horizonY() {
    return this.scale.height * (this.scale.width < 640 ? .29 : .32);
  }

  gateNearY() {
    return this.scale.height * .885;
  }

  depthEase(progress) {
    return Math.pow(Phaser.Math.Clamp(progress, 0, 1), 1.45);
  }

  roadHalfAt(progress) {
    const near = Math.min(this.scale.width * .43, 760);
    const far = Math.min(this.scale.width * .075, 96);
    return Phaser.Math.Linear(far, near, this.depthEase(progress));
  }

  perspective(progress, endY = this.gateNearY()) {
    const eased = this.depthEase(progress);
    return {
      eased,
      half: this.roadHalfAt(progress),
      y: Phaser.Math.Linear(this.horizonY(), endY, eased),
      scale: Phaser.Math.Linear(.085, 1, eased)
    };
  }

  laneXAt(lane, progress = 0) {
    return this.scale.width / 2 + (lane - 1) * this.roadHalfAt(progress) * 2 / 3;
  }

  layout() {
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();

    this.sky.setSize(width, height);
    this.cloudLayer.setPosition(0, height * .02).setSize(width, height * .3);
    this.skyBackdrop.clear();
    const bands = 28;
    const skyTop = { r: 0x51, g: 0xbf, b: 0xf0 };
    const skyBottom = { r: 0xe4, g: 0xf9, b: 0xff };
    for (let band = 0; band < bands; band += 1) {
      const ratio = band / (bands - 1);
      const color = Phaser.Display.Color.GetColor(
        Math.round(Phaser.Math.Linear(skyTop.r, skyBottom.r, ratio)),
        Math.round(Phaser.Math.Linear(skyTop.g, skyBottom.g, ratio)),
        Math.round(Phaser.Math.Linear(skyTop.b, skyBottom.b, ratio))
      );
      this.skyBackdrop.fillStyle(color, 1);
      this.skyBackdrop.fillRect(0, height * ratio, width, Math.ceil(height / bands) + 1);
    }
    this.sunHalo
      .setPosition(width * .82, height * .12)
      .setDisplaySize(Math.min(width * .18, 220), Math.min(width * .18, 220));
    this.treeLayer
      .setPosition(width / 2, horizon + height * .2)
      .setDisplaySize(width * 1.14, height * .52);
    this.hillLayer
      .setPosition(width / 2, horizon + height * .27)
      .setDisplaySize(width * 1.08, height * .44);
    this.horizonHaze
      .setPosition(0, horizon + 8)
      .setSize(width, Math.max(18, height * .035));

    this.drawRoad();
    this.updateScenery();
    this.layoutPlayer();
    this.layoutHud();
    this.layoutFeedback();
    this.positionGates();

    const countSize = Phaser.Math.Clamp(width * .085, 60, 112);
    this.countdownText
      .setPosition(width / 2, horizon + (this.gateNearY() - horizon) * .28);
    this.countdownText.setFontSize(countSize);
    this.countdownHalo
      .setPosition(this.countdownText.x, this.countdownText.y)
      .setDisplaySize(countSize * 2.8, countSize * 2.8);

    this.feedbackScrim.setSize(width, height);
  }

  layoutHud() {
    const width = this.scale.width;
    const compact = width < 680;
    const panelHeight = compact ? 116 : 88;
    this.hudGfx.clear();
    this.hudGfx.fillStyle(0x082f49, .9);
    this.hudGfx.fillRoundedRect(10, 8, width - 20, panelHeight, compact ? 16 : 20);
    this.hudGfx.lineStyle(2, 0xffffff, .16);
    this.hudGfx.strokeRoundedRect(10, 8, width - 20, panelHeight, compact ? 16 : 20);
    this.hudGfx.fillStyle(0xffffff, .055);
    this.hudGfx.fillRoundedRect(16, 14, width - 32, compact ? 34 : 28, 12);

    this.progressText.setPosition(22, compact ? 17 : 21);
    this.progressText.setFontSize(compact ? 15 : 19);
    this.scoreText.setPosition(width - (compact ? 84 : 100), compact ? 17 : 21);
    this.scoreText.setFontSize(compact ? 17 : 21);
    this.coinIcon.setPosition(width - 27, compact ? 28 : 30).setDisplaySize(compact ? 22 : 25, compact ? 22 : 25);
    this.coinText.setPosition(width - 43, compact ? 18 : 21).setFontSize(compact ? 15 : 17);
    this.comboText.setPosition(width - 22, compact ? 47 : 48);
    this.comboText.setFontSize(compact ? 15 : 18);
    this.promptText.setPosition(width / 2, compact ? 47 : 18);
    this.promptText.setFontSize(Phaser.Math.Clamp(width * .035, compact ? 21 : 25, 42));
    this.promptText.setWordWrapWidth(width - (compact ? 52 : 470));

    const timerY = compact ? 91 : 66;
    this.timerTrack.setPosition(22, timerY).setSize(width - 44, compact ? 9 : 11);
    this.timerBar.setPosition(22, timerY).setSize(width - 44, compact ? 9 : 11);
    this.answerBanner
      .setPosition(width / 2, compact ? 124 : 100)
      .setFontSize(compact ? 16 : 19)
      .setWordWrapWidth(width - (compact ? 44 : 220));
  }

  layoutFeedback() {
    const width = this.scale.width;
    const height = this.scale.height;
    const compact = width < 680;
    const panelWidth = Math.min(width * (compact ? .9 : .64), compact ? 520 : 720);
    const panelHeight = Math.min(height * .42, compact ? 300 : 290);
    const buttonWidth = Math.min(panelWidth * .58, 280);
    this.feedbackPanel.setPosition(width / 2, height * (compact ? .58 : .64));
    this.feedbackCard.clear();
    this.feedbackCard.fillStyle(0x082f49, .97);
    this.feedbackCard.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 26);
    this.feedbackCard.lineStyle(3, 0xffffff, .22);
    this.feedbackCard.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 26);
    this.feedbackCard.fillStyle(0xffffff, .07);
    this.feedbackCard.fillRoundedRect(-panelWidth / 2 + 12, -panelHeight / 2 + 12, panelWidth - 24, 50, 16);
    this.feedbackIcon
      .setPosition(0, -panelHeight * .32)
      .setDisplaySize(compact ? 52 : 64, compact ? 52 : 64);
    this.feedbackTitle
      .setPosition(0, -panelHeight * .16)
      .setFontSize(compact ? 28 : 34);
    this.feedbackBody
      .setPosition(0, panelHeight * .05)
      .setFontSize(compact ? 18 : 22)
      .setWordWrapWidth(panelWidth - 56);
    this.continueButton
      .setPosition(0, panelHeight * .32)
      .setDisplaySize(buttonWidth, compact ? 58 : 64);
    this.continueLabel
      .setPosition(0, panelHeight * .32)
      .setFontSize(compact ? 21 : 25);
  }

  drawRoad() {
    if (!this.roadGfx) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const g = this.roadGfx;
    g.clear();

    const shoulder = this.perspective(1, height);
    g.fillStyle(0x135d57, .85);
    g.beginPath();
    g.moveTo(width / 2 - shoulder.half, horizon);
    g.lineTo(width / 2 + shoulder.half, horizon);
    g.lineTo(width * .99, height);
    g.lineTo(width * .01, height);
    g.closePath();
    g.fillPath();

    for (let lane = 0; lane < 3; lane += 1) {
      const style = LANE_STYLES[lane];
      g.fillStyle(style.color, .91);
      g.beginPath();
      g.moveTo(width / 2 + (lane - 1) * this.roadHalfAt(0) * 2 / 3, horizon);
      g.lineTo(width / 2 + lane * this.roadHalfAt(0) * 2 / 3, horizon);
      g.lineTo(width / 2 + lane * shoulder.half * 2 / 3, height);
      g.lineTo(width / 2 + (lane - 1) * shoulder.half * 2 / 3, height);
      g.closePath();
      g.fillPath();
    }

    for (let divider = 1; divider < 3; divider += 1) {
      for (let dash = 0; dash < 18; dash += 1) {
        const start = (dash / 18 + this.sceneryClock * .18) % 1;
        const end = Math.min(1, start + .032);
        if (end <= start) continue;
        const p0 = this.perspective(start, height);
        const p1 = this.perspective(end, height);
        g.lineStyle(Phaser.Math.Linear(1, 7, p0.eased), 0xffffff, Phaser.Math.Linear(.34, .8, p0.eased));
        g.beginPath();
        g.moveTo(width / 2 + (divider * 2 / 3 - 1) * p0.half, p0.y);
        g.lineTo(width / 2 + (divider * 2 / 3 - 1) * p1.half, p1.y);
        g.strokePath();
      }
    }

    g.lineStyle(2, 0xffffff, .5);
    g.beginPath();
    g.moveTo(width / 2 - shoulder.half, horizon);
    g.lineTo(width * .01, height);
    g.moveTo(width / 2 + shoulder.half, horizon);
    g.lineTo(width * .99, height);
    g.strokePath();

    for (let index = 0; index < 10; index += 1) {
      const progress = (index / 10 + this.sceneryClock * .08) % 1;
      const p = this.perspective(progress, height);
      g.fillStyle(0xffffff, .035 + p.eased * .04);
      g.fillRect(width / 2 - p.half, p.y, p.half * 2, Math.max(1, 3 * p.eased));
    }

    [0.38, 0.69].forEach((progress, arrowIndex) => {
      [0, 1, 2].forEach(lane => {
        const p = this.perspective(progress, height);
        const x = this.laneXAt(lane, progress);
        const size = 10 + p.eased * 24;
        g.lineStyle(3 + p.eased * 4, arrowIndex === 0 ? 0xffffff : 0xfff6bf, .26 + p.eased * .18);
        g.beginPath();
        g.moveTo(x - size, p.y + size * .45);
        g.lineTo(x, p.y);
        g.lineTo(x + size, p.y + size * .45);
        g.strokePath();
      });
    });
  }

  updateScenery() {
    if (!this.sceneryActors) return;
    this.sceneryActors.forEach((actor, index) => {
      const progress = (actor.offset + this.sceneryClock * (actor.lane == null ? .095 : .12)) % 1;
      const point = this.perspective(progress);
      const full = this.perspective(progress, this.scale.height);
      const alpha = Math.min(1, progress * 12, (1 - progress) * 7);
      const scale = point.scale * actor.scale * Phaser.Math.Clamp(this.scale.width / 980, .55, 1.2);
      actor.image.setScale(scale);
      if (actor.lane == null) {
        const edge = full.half * .84;
        const rawX = this.scale.width / 2 + actor.side * edge;
        const halfWidth = actor.image.width * scale / 2;
        actor.image.setPosition(Phaser.Math.Clamp(rawX, halfWidth + 8, this.scale.width - halfWidth - 8), full.y);
        actor.image.setOrigin(.5, 1);
      } else {
        actor.image.setPosition(this.laneXAt(actor.lane, progress), point.y - 28 * point.scale);
        actor.image.setOrigin(.5);
      }
      actor.image.setAlpha(alpha);
      actor.image.setDepth(4 + Math.round(progress * 18));
      const oversized = actor.image.displayWidth > this.scale.width * .34;
      actor.image.setVisible(progress > .01 && progress < .985 && !oversized);
      if (actor.frames?.length > 1) {
        actor.image.setTexture(actor.frames[Math.floor(this.sceneryClock * 5 + index) % actor.frames.length]);
      }
      if (actor.lane != null) actor.image.setAngle(Math.sin(this.sceneryClock * 3 + index) * 8);
    });
  }

  layoutPlayer() {
    if (!this.player) return;
    const targetHeight = Phaser.Math.Clamp(this.scale.height * .205, 92, 170);
    const playerScale = targetHeight / PLAYER_SOURCE_HEIGHT;
    this.player.setScale(playerScale);
    this.player.setPosition(this.laneXAt(this.lane, 1), this.gateNearY() + this.scale.height * .015);
    this.playerShadow
      .setPosition(this.player.x, this.player.y + this.scale.height * .01)
      .setDisplaySize(Math.min(this.scale.width * .16, 142), Math.max(16, this.player.displayWidth * .18));
    this.playerAura
      .setPosition(this.player.x, this.player.y - this.player.displayHeight * .48)
      .setDisplaySize(this.player.displayWidth * 1.45, this.player.displayHeight * 1.5)
      .setAlpha(.13);
  }

  showQuestion() {
    this.currentItem = this.items[this.index];
    this.options = optionList(this.currentItem);
    this.lane = 1;
    this.gateProgress = 0;
    this.countdown = COUNTDOWN_SECONDS;
    this.countdownDigit = COUNTDOWN_SECONDS;
    this.phase = 'countdown';
    this.feedbackPanel.setVisible(false);
    this.feedbackScrim.setVisible(false);
    this.countdownText
      .setText(String(COUNTDOWN_SECONDS))
      .setVisible(true)
      .setAlpha(1)
      .setScale(1);
    this.countdownHalo.setVisible(true).setAlpha(.34);
    this.promptText.setText(this.currentItem.prompt);
    this.progressText.setText(`第 ${this.index + 1} / ${this.items.length} 题`);
    this.scoreText.setText(`得分 ${this.score}`);
    this.coinText.setText(String(this.coins));
    this.comboText.setText(this.combo > 1 ? `${this.combo} 连击` : '连击待命');
    this.timerBar.width = this.scale.width - 44;
    this.timerBar.fillColor = 0x61e786;
    this.setPlayerPose('idle');
    this.startIdleBob();
    this.answerBanner.setVisible(false).setAlpha(1);
    this.buildGates();
    this.positionGates();
    this.layoutPlayerLane(true);
    this.eventsBus.emit('state', this.getState());
  }

  buildGates() {
    this.gates?.forEach(gate => gate.root.destroy());
    this.gates = this.options.map((option, lane) => {
      const style = LANE_STYLES[lane];
      const root = this.add.container(0, 0).setDepth(30);
      const shadow = this.add.ellipse(0, 0, 184, 32, 0x063b3c, .35);
      const pad = this.add.image(0, 2, 'stone-top').setOrigin(.5, 1).setDisplaySize(238, 40);
      const glow = this.add.image(0, -112, 'fx-star')
        .setTint(style.color)
        .setAlpha(.14)
        .setDisplaySize(280, 280);
      const inner = this.add.rectangle(0, -82, 154, 148, style.soft, .16)
        .setStrokeStyle(3, style.soft, .65);
      const door = this.add.image(0, -3, 'gate-door-closed')
        .setOrigin(.5, 1)
        .setDisplaySize(114, 136);
      const left = this.add.image(-92, -2, style.block).setOrigin(.5, 1).setDisplaySize(34, 154);
      const right = this.add.image(92, -2, style.block).setOrigin(.5, 1).setDisplaySize(34, 154);
      const lintel = this.add.image(0, -158, style.block).setOrigin(.5).setDisplaySize(218, 34);
      const sign = this.add.image(0, -207, style.button).setDisplaySize(232, 62);
      const label = this.add.text(0, -207, option, {
        fontFamily: uiFont(),
        fontStyle: 'bold',
        fontSize: '36px',
        color: '#17345b',
        align: 'center',
        wordWrap: { width: 205 }
      }).setOrigin(.5);
      const badge = this.add.image(0, -251, 'ui-star').setDisplaySize(34, 34);
      const laneText = this.add.text(0, -251, String(lane + 1), {
        fontFamily: uiFont(),
        fontStyle: 'bold',
        fontSize: '18px',
        color: '#17345b'
      }).setOrigin(.5);
      const hit = this.add.zone(0, -118, 244, 252).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.switchLane(lane));
      root.add([shadow, pad, glow, inner, door, left, right, lintel, sign, label, badge, laneText, hit]);
      this.tweens.add({
        targets: glow,
        alpha: { from: .09, to: .22 },
        scaleX: { from: .94, to: 1.06 },
        scaleY: { from: .94, to: 1.06 },
        duration: 900 + lane * 100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      return { root, door, glow, inner, label, sign, lane, baseColor: style.color };
    });
  }

  positionGates() {
    if (!this.gates) return;
    const responsive = Phaser.Math.Clamp(this.scale.width / 1000, .45, 1.2);
    this.gates.forEach(gate => {
      const point = this.perspective(this.gateProgress);
      gate.root.setPosition(this.laneXAt(gate.lane, this.gateProgress), point.y);
      gate.root.setScale(point.scale * responsive);
      gate.root.setDepth(22 + Math.round(point.eased * 18));
      if (this.phase !== 'resolved') {
        gate.root.setAlpha(Math.min(1, .55 + this.gateProgress * 2));
      }
    });
  }

  layoutPlayerLane(immediate = false) {
    const target = this.laneXAt(this.lane, 1);
    if (immediate) {
      this.player.x = target;
      this.playerShadow.x = target;
      this.playerAura.x = target;
      return;
    }
    this.tweens.killTweensOf([this.player, this.playerShadow, this.playerAura]);
    this.tweens.add({ targets: this.player, x: target, duration: 135, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.playerShadow, x: target, duration: 135, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.playerAura, x: target, duration: 135, ease: 'Cubic.easeOut' });
  }

  switchLane(next) {
    if (!['running', 'countdown'].includes(this.phase)) return;
    const clamped = Phaser.Math.Clamp(next, 0, 2);
    if (clamped === this.lane) return;
    const direction = clamped > this.lane ? 1 : -1;
    this.lane = clamped;
    this.layoutPlayerLane();
    this.tweens.killTweensOf(this.player);
    this.tweens.add({
      targets: this.player,
      angle: direction * 5,
      duration: 76,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.player.setAngle(0)
    });
    this.dustBurst.explode(8, this.player.x, this.player.y - 4);
    this.safeSound('sfx-switch', .34);
    this.eventsBus.emit('state', this.getState());
  }

  update(_time, delta) {
    if (!this.roadGfx) return;
    if (this.phase !== 'paused') {
      this.sceneryClock += delta / 1000;
      this.cloudLayer.tilePositionX += delta * .006;
    }
    this.drawRoad();
    this.updateScenery();

    if (this.phase === 'countdown') {
      const previousDigit = this.countdownDigit;
      this.countdown = Math.max(0, this.countdown - delta / 1000);
      this.countdownDigit = Math.ceil(this.countdown);
      if (this.countdownDigit !== previousDigit && this.countdownDigit > 0) {
        this.countdownText.setText(String(this.countdownDigit));
        this.countdownText.setScale(1.22);
        this.tweens.add({ targets: this.countdownText, scale: 1, duration: 170 });
      }
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.stopIdleBob();
        this.countdownText.setText('GO!').setScale(1.18);
        this.tweens.add({
          targets: this.countdownText,
          alpha: 0,
          scale: 1.8,
          duration: 360,
          onComplete: () => this.countdownText.setVisible(false)
        });
        this.tweens.add({ targets: this.countdownHalo, alpha: 0, duration: 360 });
        this.setPlayerPose('run');
        this.eventsBus.emit('state', this.getState());
      }
      return;
    }

    if (this.phase === 'running') {
      this.gateProgress = Math.min(1, this.gateProgress + delta / (QUESTION_SECONDS * 1000));
      this.positionGates();
      const remaining = 1 - this.gateProgress;
      this.timerBar.width = (this.scale.width - 44) * remaining;
      this.timerBar.fillColor = remaining < .28 ? 0xff6b6b : 0x61e786;
      this.animatePlayer(delta);
      if (this.gateProgress >= 1) this.resolveQuestion();
    }
  }

  animatePlayer(delta) {
    this.playerClock += delta;
    if (this.phase !== 'running') return;
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
      jump: 'char-jump',
      hurt: 'char-hurt',
      cheer: 'char-cheer0'
    };
    this.player.setTexture(textures[pose] || 'char-idle');
  }

  startIdleBob() {
    this.stopIdleBob();
    if (!this.player) return;
    this.player.setY(this.gateNearY() + this.scale.height * .015);
    this.idleTween = this.tweens.add({
      targets: this.player,
      y: this.player.y - Math.max(3, this.player.displayHeight * .025),
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  stopIdleBob() {
    if (this.idleTween) {
      this.idleTween.stop();
      this.idleTween = null;
    }
    if (this.player) this.player.setY(this.gateNearY() + this.scale.height * .015);
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
    if (!['running', 'countdown'].includes(this.phase)) return;
    this.phase = 'resolved';
    this.gateProgress = 1;
    this.positionGates();
    const selected = this.options[this.lane];
    const correct = selected === this.currentItem.correct;
    const correctLane = this.options.indexOf(this.currentItem.correct);
    const correctGate = this.gates[correctLane];
    const selectedGate = this.gates[this.lane];
    this.answers.push({
      prompt: this.currentItem.prompt,
      selected,
      correct: this.currentItem.correct
    });
    this.gates.forEach(gate => {
      if (gate !== correctGate) gate.root.setAlpha(.38);
    });
    correctGate.glow.setVisible(true).setTint(0x80ff9e).setAlpha(.58);
    correctGate.inner.setStrokeStyle(8, 0x80ff9e, 1);
    this.tweens.add({
      targets: correctGate.root,
      scaleX: correctGate.root.scaleX * 1.08,
      scaleY: correctGate.root.scaleY * 1.08,
      duration: 210,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.easeOut'
    });
    this.sparkBurst.explode(20, correctGate.root.x, correctGate.root.y - 82);

    if (correct) {
      this.score += 1;
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const coinGain = 1 + Math.min(this.combo, 4);
      this.coins += coinGain;
      correctGate.door.setTexture('gate-door-open');
      this.tweens.add({ targets: correctGate.door, alpha: .6, duration: 140 });
      this.setPlayerPose('cheer');
      this.celebrate();
      this.tweens.add({
        targets: this.player,
        y: this.player.y - 78,
        duration: 210,
        yoyo: true,
        ease: 'Quad.easeOut'
      });
      this.successBurst.explode(30, this.player.x, this.player.y - this.player.displayHeight * .56);
      this.sparkBurst.explode(24, this.player.x, this.player.y - this.player.displayHeight * .46);
      this.coinBurst.explode(Math.min(14, coinGain + 4), this.player.x, this.player.y - this.player.displayHeight * .68);
      this.safeSound('sfx-correct', .64);
      this.safeSound('sfx-coin', .4, 130);
      this.cameras.main.flash(130, 255, 240, 150, false);
      this.spawnFloatingText(`+${coinGain} 金币`, this.player.x, this.player.y - this.player.displayHeight * .9, '#ffe56f');
    } else {
      this.combo = 0;
      selectedGate.door.setTint(0xff8076);
      this.setPlayerPose('hurt');
      this.tweens.add({
        targets: this.player,
        x: this.player.x + (this.lane === 0 ? 22 : -22),
        angle: { from: -8, to: 8 },
        duration: 68,
        yoyo: true,
        repeat: 2,
        onComplete: () => {
          this.player.setAngle(0);
          this.layoutPlayerLane(true);
        }
      });
      this.cameras.main.shake(220, .012);
      this.sparkBurst.explode(18, selectedGate.root.x, selectedGate.root.y - 70);
      this.safeSound('sfx-hurt', .46);
      this.safeSound('sfx-wrong', .5, 130);
      this.spawnFloatingText('正确答案在上面闪光', this.scale.width / 2, this.gateNearY() - this.scale.height * .26, '#9dffb4');
    }

    this.showAnswerBanner(correct, correctLane);
    this.scoreText.setText(`得分 ${this.score}`);
    this.coinText.setText(String(this.coins));
    this.comboText.setText(this.combo > 1 ? `${this.combo} 连击` : '连击待命');
    this.eventsBus.emit('state', this.getState());
    const answerIndex = this.index;
    this.time.delayedCall(220, () => {
      if (this.phase === 'resolved' && this.index === answerIndex) {
        this.showAnswerFeedback(correct, selected, correctLane);
      }
    });
  }

  spawnFloatingText(text, x, y, color) {
    const label = this.add.text(x, y, text, {
      fontFamily: uiFont(),
      fontStyle: 'bold',
      fontSize: '24px',
      color,
      stroke: '#0b3557',
      strokeThickness: 5
    }).setOrigin(.5).setDepth(90);
    this.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      duration: 960,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy()
    });
  }

  showAnswerBanner(correct, correctLane) {
    const style = LANE_STYLES[correctLane];
    this.answerBanner
      .setText(`${correct ? '冲门成功' : '正确答案'}　${style.label} · ${this.currentItem.correct}`)
      .setBackgroundColor(this.phase === 'resolved' && !correct ? '#a33c35' : '#0b6b4b')
      .setColor('#ffffff')
      .setVisible(true)
      .setAlpha(0)
      .setScale(.94);
    this.tweens.add({
      targets: this.answerBanner,
      alpha: 1,
      scale: 1,
      duration: 150,
      ease: 'Back.easeOut'
    });
  }

  showAnswerFeedback(correct, selected, correctLane) {
    this.feedbackScrim.setVisible(true);
    this.feedbackPanel.setVisible(true).setAlpha(0).setScale(.94);
    this.feedbackIcon
      .setTexture(correct ? 'ui-check' : 'ui-cross')
      .setTint(correct ? 0x6dff9d : 0xff9d95);
    this.feedbackTitle
      .setText(correct ? '漂亮！冲门成功' : '差一点，记住正确门')
      .setColor(correct ? '#8cffb0' : '#ffb3aa');
    const reward = correct
      ? `+1 分　+${1 + Math.min(this.combo, 4)} 金币${this.combo > 1 ? `　连续 ${this.combo} 题正确` : ''}`
      : `你选择了「${selected}」\n正确答案在${LANE_STYLES[correctLane].label}：${this.currentItem.correct}`;
    this.feedbackBody.setText(reward);
    const last = this.index >= this.items.length - 1;
    this.continueLabel.setText(last ? '查看成绩' : '继续下一题');
    this.continueButton.setTexture(last ? 'ui-button-yellow' : 'ui-button-green');
    this.tweens.add({
      targets: this.feedbackPanel,
      alpha: 1,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut'
    });
  }

  continueNext() {
    if (this.phase !== 'resolved') return;
    this.index += 1;
    if (this.index >= this.items.length) {
      this.phase = 'complete';
      this.safeSound('sfx-finish', .45);
      this.onComplete({
        score: this.score,
        answers: this.answers,
        coins: this.coins,
        bestCombo: this.bestCombo
      });
      return;
    }
    this.showQuestion();
  }

  pause() {
    if (!['running', 'countdown'].includes(this.phase)) return;
    this.phaseBeforePause = this.phase;
    this.phase = 'paused';
    this.feedbackScrim.setVisible(true).setAlpha(.62);
    this.feedbackPanel.setVisible(true).setAlpha(0).setScale(.94);
    this.feedbackIcon.setTexture('ui-star').setTint(0xffe36c);
    this.feedbackTitle.setText('游戏暂停').setColor('#fff2a6');
    this.feedbackBody.setText('跑道、计时和题目都已经冻结。\n准备好后点击「继续游戏」。');
    this.continueLabel.setText('继续游戏');
    this.continueButton.setTexture('ui-button-blue');
    this.tweens.add({ targets: this.feedbackPanel, alpha: 1, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.eventsBus.emit('state', this.getState());
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.phaseBeforePause;
    this.feedbackPanel.setVisible(false);
    this.feedbackScrim.setVisible(false);
    this.eventsBus.emit('state', this.getState());
  }

  safeSound(key, volume, delay = 0) {
    if (this.cache.audio.exists(key)) {
      this.audioLog.push(key);
      if (this.audioLog.length > 20) this.audioLog.shift();
      this.sound.play(key, { volume, delay: delay / 1000 });
    }
  }

  getState() {
    const gateProjection = this.gates?.map(gate => ({
      lane: gate.lane,
      x: Math.round(gate.root.x),
      y: Math.round(gate.root.y),
      scale: Number(gate.root.scaleX.toFixed(3)),
      width: Math.round(232 * gate.root.scaleX)
    })) || [];
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
      sounds: [...this.audioLog],
      prompt: this.currentItem?.prompt || '',
      options: [...this.options],
      correctLane: this.options.indexOf(this.currentItem?.correct),
      geometry: {
        width: this.scale.width,
        height: this.scale.height,
        horizon: Math.round(this.horizonY()),
        near: Math.round(this.gateNearY()),
        laneCenters: [0, 1, 2].map(lane => Math.round(this.laneXAt(lane, 1))),
        gates: gateProjection,
        scenery: this.sceneryActors
          ?.filter(actor => actor.image.visible)
          .map(actor => ({
            x: Math.round(actor.image.x),
            y: Math.round(actor.image.y),
            width: Math.round(actor.image.displayWidth),
            height: Math.round(actor.image.displayHeight),
            lane: actor.lane,
            side: actor.side
          })) || [],
        player: {
          x: Math.round(this.player?.x || 0),
          y: Math.round(this.player?.y || 0),
          width: Math.round(this.player?.displayWidth || 0),
          height: Math.round(this.player?.displayHeight || 0)
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
            scene.countdownHalo.setVisible(false);
            scene.setPlayerPose('run');
          }
          if (scene.phase === 'running') {
            scene.gateProgress = Phaser.Math.Clamp(progress, 0, .985);
            scene.positionGates();
            scene.timerBar.width = (scene.scale.width - 44) * (1 - scene.gateProgress);
          }
        },
        collision: () => {
          if (scene.phase === 'countdown') {
            scene.countdown = 0;
            scene.phase = 'running';
          }
          scene.gateProgress = 1;
          scene.positionGates();
          scene.resolveQuestion();
        },
        continue: () => scene.continueNext(),
        pause: () => scene.pause(),
        resume: () => scene.resume()
      }
    };
  }

  shutdown() {
    if (this.celebrateTimer) this.celebrateTimer.remove(false);
    this.stopIdleBob();
    this.scale.off('resize', this.layout, this);
    this.eventsBus.off('pause', this.pause, this);
    this.eventsBus.off('resume', this.resume, this);
    this.eventsBus.off('switch-lane', this.switchLaneHandler);
    this.eventsBus.off('continue', this.continueNext, this);
    if (this.input?.keyboard) {
      this.input.keyboard.off('keydown-LEFT', this.keyLeftHandler);
      this.input.keyboard.off('keydown-RIGHT', this.keyRightHandler);
      this.input.keyboard.off('keydown-UP', this.keyUpHandler);
      this.input.keyboard.off('keydown-SPACE', this.keyContinueHandler);
      this.input.keyboard.off('keydown-ENTER', this.keyContinueHandler);
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
    backgroundColor: '#87d7ff',
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
