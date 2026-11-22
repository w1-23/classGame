const Phaser = window.Phaser;

const QUESTION_SECONDS = 6;
const COUNTDOWN_SECONDS = 3;
const PLAYER_SOURCE_HEIGHT = 128;
const PLAYER_HEIGHT_RATIO = .25;
const ROAD_COLOR = 0xbda77f;
const GRASS_COLOR = 0x75b96b;

const LANE_STYLES = [
  {
    color: 0x5ca9d6,
    label: '蓝道'
  },
  {
    color: 0x69b77c,
    label: '绿道'
  },
  {
    color: 0xe2b65c,
    label: '琥珀道'
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
    this.hudClock = 0;
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
      ['trees', `${platformer}/background_color_trees.png`],
      ['bush', `${platformer}/bush.png`],
      ['grass', `${platformer}/grass.png`],
      ['rock', `${platformer}/rock.png`],
      ['mushroom-red', `${platformer}/mushroom_red.png`],
      ['coin', `${platformer}/coin_gold.png`],
      ['hud-coin', `${platformer}/hud_coin.png`],
      ['gate-column-green', `${platformer}/block_green.png`],
      ['gate-door-closed', `${platformer}/door_closed.png`],
      ['gate-door-open', `${platformer}/door_open.png`],
      ['ui-check', `${ui}/icon-checkmark.png`],
      ['ui-cross', `${ui}/icon-cross.png`],
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
    this.createTreeCutout();
    this.skyBackdrop = this.add.graphics().setDepth(-22);
    this.sky = this.add.tileSprite(0, 0, 10, 10, 'sky')
      .setOrigin(0)
      .setTint(0xa9ddf2)
      .setAlpha(1)
      .setDepth(-20);
    this.cloudLayer = this.add.tileSprite(0, 0, 10, 10, 'clouds')
      .setOrigin(0)
      .setAlpha(.25)
      .setDepth(-18);
    this.treeLayer = this.add.tileSprite(0, 0, 10, 10, 'trees-cutout')
      .setOrigin(.5, 1)
      .setDepth(1);
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

  createScenery() {
    const sideTextures = ['bush', 'rock', 'mushroom-red', 'grass'];
    this.sceneryActors = [];
    for (let index = 0; index < 8; index += 1) {
      const image = this.add.image(0, 0, sideTextures[index % sideTextures.length]).setDepth(4);
      this.sceneryActors.push({
        image,
        side: index % 2 === 0 ? -1 : 1,
        lane: null,
        offset: index / 8,
        scale: .72 + (index % 2) * .12
      });
    }
    const coinLanes = [1, 0, 2, 1];
    for (let index = 0; index < coinLanes.length; index += 1) {
      const image = this.add.image(0, 0, 'coin').setDepth(5);
      this.sceneryActors.push({
        image,
        side: 0,
        lane: coinLanes[index],
        offset: .14 + index * .22,
        scale: .6
      });
    }
  }

  createPlayer() {
    this.playerShadow = this.add.ellipse(0, 0, 90, 22, 0x103a2a, .28).setDepth(52);
    this.player = this.add.image(0, 0, 'char-idle').setOrigin(.5, 1).setDepth(55);
    this.playerRunFrames = ['char-run0', 'char-run1', 'char-run2', 'char-run1'];
    this.playerFrame = 0;
  }

  createFeedback() {
    this.feedbackScrim = this.add.rectangle(0, 0, 10, 10, 0x26384a, .18)
      .setOrigin(0)
      .setDepth(150)
      .setVisible(false);
    this.feedbackPanel = this.add.container(0, 0).setDepth(151).setVisible(false);
    this.feedbackCard = this.add.graphics();
    this.feedbackIcon = this.add.image(0, 0, 'ui-check');
    this.feedbackTitle = this.add.text(0, 0, '', {
      fontFamily: uiFont(),
      fontStyle: 'bold',
      fontSize: '30px',
      color: '#26384a',
      align: 'center'
    }).setOrigin(.5);
    this.feedbackBody = this.add.text(0, 0, '', {
      fontFamily: uiFont(),
      fontSize: '19px',
      color: '#718096',
      align: 'center',
      lineSpacing: 5
    }).setOrigin(.5);
    this.continueButton = this.add.rectangle(0, 0, 220, 48, 0x399b68)
      .setInteractive({ useHandCursor: true });
    this.continueLabel = this.add.text(0, 0, '继续', {
      fontFamily: uiFont(),
      fontStyle: 'bold',
      fontSize: '20px',
      color: '#ffffff'
    }).setOrigin(.5);
    this.continueButton.on('pointerup', () => {
      if (this.phase === 'resolved') this.continueNext();
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
      lifespan: 720,
      speed: { min: 120, max: 280 },
      angle: { min: 210, max: 330 },
      gravityY: 480,
      scale: { start: .16, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0xffd95b, 0xfff1a8],
      emitting: false
    }).setDepth(80);
    this.sparkBurst = this.add.particles(0, 0, 'fx-spark', {
      lifespan: 420,
      speed: { min: 70, max: 190 },
      scale: { start: .08, end: 0 },
      emitting: false
    }).setDepth(81);
    this.dustBurst = this.add.particles(0, 0, 'fx-circle', {
      lifespan: 360,
      speed: { min: 20, max: 70 },
      scale: { start: .07, end: 0 },
      alpha: { start: .38, end: 0 },
      tint: 0xffe9b2,
      emitting: false
    }).setDepth(51);
  }

  createCountdown() {
    this.countdownPlate = this.add.ellipse(0, 0, 128, 128, 0x26384a, .2)
      .setDepth(139)
      .setVisible(false);
    this.countdownText = this.add.text(0, 0, '', {
      fontFamily: uiFont(),
      fontStyle: 'bold',
      fontSize: '92px',
      color: '#ffffff',
      stroke: '#26384a',
      strokeThickness: 6
    }).setOrigin(.5).setDepth(140).setVisible(false);
  }

  createControls() {
    this.keyLeftHandler = () => this.switchLane(this.lane - 1);
    this.keyRightHandler = () => this.switchLane(this.lane + 1);
    this.keyContinueHandler = () => {
      if (this.phase === 'resolved') this.continueNext();
    };
    this.input.keyboard.on('keydown-LEFT', this.keyLeftHandler);
    this.input.keyboard.on('keydown-RIGHT', this.keyRightHandler);
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
    return this.scale.height * (this.scale.width < 640 ? .3 : .31);
  }

  gateNearY() {
    return this.scale.height * .85;
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
    const cloudScale = Phaser.Math.Clamp(width / 1800, .48, 1.2);
    this.cloudLayer
      .setPosition(0, height * .02)
      .setSize(width, height * .24)
      .setTileScale(cloudScale);
    this.skyBackdrop.clear();
    this.skyBackdrop.fillStyle(0xa9ddf2, 1);
    this.skyBackdrop.fillRect(0, 0, width, height);
    const treeHeight = height * .18;
    const treeScale = Math.max(width / 1450, treeHeight / 156);
    this.treeLayer
      .setPosition(width / 2, horizon + height * .015)
      .setSize(width * 1.08, treeHeight)
      .setTileScale(treeScale);

    this.drawRoad();
    this.updateScenery();
    this.layoutPlayer();
    this.layoutFeedback();
    this.positionGates();

    const countSize = Phaser.Math.Clamp(width * .085, 60, 112);
    this.countdownText
      .setPosition(width / 2, horizon + (this.gateNearY() - horizon) * .28);
    this.countdownText.setFontSize(countSize);
    this.countdownPlate
      .setPosition(this.countdownText.x, this.countdownText.y)
      .setDisplaySize(countSize * 1.5, countSize * 1.5);

    this.feedbackScrim.setSize(width, height);
  }

  layoutFeedback() {
    const width = this.scale.width;
    const height = this.scale.height;
    const compact = width < 680;
    const panelWidth = Math.min(width * (compact ? .88 : .42), compact ? 480 : 620);
    const panelHeight = Math.min(height * .34, compact ? 248 : 226);
    const buttonWidth = Math.min(panelWidth * .58, 260);
    this.feedbackPanel.setPosition(width / 2, height * (compact ? .55 : .56));
    this.feedbackCard.clear();
    this.feedbackCard.fillStyle(0xffffff, .98);
    this.feedbackCard.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18);
    this.feedbackCard.lineStyle(1, 0xd9e2df, 1);
    this.feedbackCard.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18);
    this.feedbackIcon
      .setPosition(0, -panelHeight * .3)
      .setDisplaySize(compact ? 42 : 50, compact ? 42 : 50);
    this.feedbackTitle
      .setPosition(0, -panelHeight * .11)
      .setFontSize(compact ? 24 : 28);
    this.feedbackBody
      .setPosition(0, panelHeight * .1)
      .setFontSize(compact ? 16 : 18)
      .setWordWrapWidth(panelWidth - 48);
    this.continueButton
      .setPosition(0, panelHeight * .34)
      .setSize(buttonWidth, compact ? 44 : 48);
    this.continueLabel
      .setPosition(0, panelHeight * .34)
      .setFontSize(compact ? 18 : 20);
  }

  drawRoad() {
    if (!this.roadGfx) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const horizon = this.horizonY();
    const g = this.roadGfx;
    g.clear();

    g.fillStyle(GRASS_COLOR, 1);
    g.fillRect(0, horizon, width, height - horizon);

    const shoulder = this.perspective(1, height);
    g.fillStyle(GRASS_COLOR, 1);
    g.beginPath();
    g.moveTo(width / 2 - shoulder.half, horizon);
    g.lineTo(width / 2 + shoulder.half, horizon);
    g.lineTo(width * .99, height);
    g.lineTo(width * .01, height);
    g.closePath();
    g.fillPath();

    g.fillStyle(ROAD_COLOR, 1);
    g.beginPath();
    g.moveTo(width / 2 - this.roadHalfAt(0), horizon);
    g.lineTo(width / 2 + this.roadHalfAt(0), horizon);
    g.lineTo(width / 2 + shoulder.half, height);
    g.lineTo(width / 2 - shoulder.half, height);
    g.closePath();
    g.fillPath();

    for (let divider = 1; divider < 3; divider += 1) {
      for (let dash = 0; dash < 18; dash += 1) {
        const start = (dash / 18 + this.sceneryClock * .18) % 1;
        const end = Math.min(1, start + .032);
        if (end <= start) continue;
        const p0 = this.perspective(start, height);
        const p1 = this.perspective(end, height);
        g.lineStyle(Phaser.Math.Linear(1, 5, p0.eased), 0xffffff, Phaser.Math.Linear(.42, .78, p0.eased));
        g.beginPath();
        g.moveTo(width / 2 + (divider * 2 / 3 - 1) * p0.half, p0.y);
        g.lineTo(width / 2 + (divider * 2 / 3 - 1) * p1.half, p1.y);
        g.strokePath();
      }
    }

    g.lineStyle(2, 0xe8e0d1, .72);
    g.beginPath();
    g.moveTo(width / 2 - shoulder.half, horizon);
    g.lineTo(width * .01, height);
    g.moveTo(width / 2 + shoulder.half, horizon);
    g.lineTo(width * .99, height);
    g.strokePath();

    for (let index = 0; index < 18; index += 1) {
      const progress = (index / 18 + this.sceneryClock * .055) % 1;
      const p = this.perspective(progress, height);
      g.fillStyle(0x7b6649, .025 + p.eased * .035);
      g.fillRect(width / 2 - p.half, p.y, p.half * 2, Math.max(1, 2 + 2 * p.eased));
    }
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
      actor.image.setAngle(actor.lane != null ? Math.sin(this.sceneryClock * 3 + index) * 4 : 0);
    });
  }

  layoutPlayer() {
    if (!this.player) return;
    const targetHeight = this.scale.height * PLAYER_HEIGHT_RATIO;
    const playerScale = targetHeight / PLAYER_SOURCE_HEIGHT;
    this.player.setScale(playerScale);
    this.player.setPosition(this.laneXAt(this.lane, 1), this.scale.height * .88);
    this.playerShadow
      .setPosition(this.player.x, this.player.y + 3)
      .setDisplaySize(Math.min(this.scale.width * .14, 128), Math.max(14, this.player.displayWidth * .16));
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
    this.countdownPlate.setVisible(true).setAlpha(.2);
    this.setPlayerPose('idle');
    this.layoutPlayer();
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
      const shadow = this.add.ellipse(0, -2, 176, 24, 0x294c3c, .26);
      const door = this.add.image(0, -3, 'gate-door-closed')
        .setOrigin(.5, 1)
        .setDisplaySize(110, 110);
      const left = this.add.tileSprite(-88, -2, 32, 146, 'gate-column-green').setOrigin(.5, 1);
      const right = this.add.tileSprite(88, -2, 32, 146, 'gate-column-green').setOrigin(.5, 1);
      const lintel = this.add.tileSprite(0, -151, 208, 28, 'gate-column-green');
      const sign = this.add.graphics();
      sign.fillStyle(style.color, 1);
      sign.fillRoundedRect(-108, -220, 216, 58, 9);
      sign.lineStyle(2, 0xffffff, .82);
      sign.strokeRoundedRect(-108, -220, 216, 58, 9);
      const label = this.add.text(0, -191, option, {
        fontFamily: uiFont(),
        fontStyle: 'bold',
        fontSize: '34px',
        color: '#26384a',
        align: 'center',
        wordWrap: { width: 182 }
      }).setOrigin(.5);
      const laneBadge = this.add.circle(-90, -232, 13, 0xffffff, .92);
      const laneText = this.add.text(-90, -232, String(lane + 1), {
        fontFamily: uiFont(),
        fontStyle: 'bold',
        fontSize: '16px',
        color: '#26384a'
      }).setOrigin(.5);
      const hit = this.add.zone(0, -112, 224, 238).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.switchLane(lane));
      root.add([shadow, door, left, right, lintel, sign, label, laneBadge, laneText, hit]);
      return { root, door, sign, label, lane, baseColor: style.color };
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
        gate.root.setAlpha(Math.min(1, .28 + this.gateProgress * 2.2));
      }
    });
  }

  layoutPlayerLane(immediate = false) {
    const target = this.laneXAt(this.lane, 1);
    if (immediate) {
      this.player.x = target;
      this.playerShadow.x = target;
      return;
    }
    this.tweens.killTweensOf([this.player, this.playerShadow]);
    this.tweens.add({ targets: this.player, x: target, duration: 135, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this.playerShadow, x: target, duration: 135, ease: 'Cubic.easeOut' });
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
        this.countdownText.setText('GO!').setScale(1.18);
        this.tweens.add({
          targets: this.countdownText,
          alpha: 0,
          scale: 1.8,
          duration: 360,
          onComplete: () => this.countdownText.setVisible(false)
        });
        this.tweens.add({ targets: this.countdownPlate, alpha: 0, duration: 360 });
        this.setPlayerPose('run');
        this.eventsBus.emit('state', this.getState());
      }
      return;
    }

    if (this.phase === 'running') {
      this.gateProgress = Math.min(1, this.gateProgress + delta / (QUESTION_SECONDS * 1000));
      this.positionGates();
      this.animatePlayer(delta);
      this.hudClock += delta;
      if (this.hudClock >= 60) {
        this.hudClock = 0;
        this.eventsBus.emit('state', this.getState());
      }
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
      if (gate !== correctGate) {
        gate.root.setAlpha(.42);
        gate.sign.setAlpha(.6);
      }
    });
    correctGate.sign.setAlpha(1);
    correctGate.label.setColor('#143f2c');
    this.tweens.add({
      targets: correctGate.root,
      scaleX: correctGate.root.scaleX * 1.04,
      scaleY: correctGate.root.scaleY * 1.04,
      duration: 180,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.easeOut'
    });
    this.sparkBurst.explode(8, correctGate.root.x, correctGate.root.y - 96);

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
        y: this.player.y - 54,
        duration: 190,
        yoyo: true,
        ease: 'Quad.easeOut'
      });
      this.successBurst.explode(10, this.player.x, this.player.y - this.player.displayHeight * .62);
      this.sparkBurst.explode(8, this.player.x, this.player.y - this.player.displayHeight * .5);
      this.safeSound('sfx-correct', .64);
      this.safeSound('sfx-coin', .4, 130);
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
      this.safeSound('sfx-hurt', .46);
      this.safeSound('sfx-wrong', .5, 130);
    }

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

  showAnswerFeedback(correct, selected, correctLane) {
    this.feedbackScrim.setVisible(true);
    this.feedbackPanel.setVisible(true).setAlpha(0).setScale(.94);
    this.feedbackIcon
      .setTexture(correct ? 'ui-check' : 'ui-cross')
      .setTint(correct ? 0x6dff9d : 0xff9d95);
    this.feedbackTitle
      .setText(correct ? '答对了 +1' : '差一点，再试一次')
      .setColor(correct ? '#2e7d55' : '#b94f46');
    const reward = correct
      ? `+${1 + Math.min(this.combo, 4)} 金币${this.combo > 1 ? ` · 连续 ${this.combo} 题正确` : ''}`
      : `正确答案：${LANE_STYLES[correctLane].label} · ${this.currentItem.correct}`;
    this.feedbackBody.setText(reward);
    const last = this.index >= this.items.length - 1;
    this.continueLabel.setText(last ? '查看成绩' : '继续下一题');
    this.continueButton.setFillStyle(last ? 0xe2b65c : 0x399b68);
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
      width: Math.round(216 * gate.root.scaleX),
      answer: this.options[gate.lane]
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
      feedback: {
        visible: Boolean(this.feedbackPanel?.visible),
        title: this.feedbackTitle?.text || '',
        body: this.feedbackBody?.text || ''
      },
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
    this.scale.off('resize', this.layout, this);
    this.eventsBus.off('pause', this.pause, this);
    this.eventsBus.off('resume', this.resume, this);
    this.eventsBus.off('switch-lane', this.switchLaneHandler);
    this.eventsBus.off('continue', this.continueNext, this);
    if (this.input?.keyboard) {
      this.input.keyboard.off('keydown-LEFT', this.keyLeftHandler);
      this.input.keyboard.off('keydown-RIGHT', this.keyRightHandler);
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
