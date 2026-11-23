import { recordResult } from './storage.js';
import { mountRunnerGame } from './runner-phaser.js';
import { completionSound } from './audio.js';
import { createLearningFeedback } from './learning-feedback.mjs';

export const GAME_META = [
  { id: 'runner', name: '森林寻宝记', type: 'personal' },
  { id: 'listen', name: '听音找精灵', type: 'personal' },
  { id: 'assemble', name: '拼音/单词拼装', type: 'personal' },
  { id: 'memory', name: '记忆翻牌配对', type: 'personal' },
  { id: 'beat', name: '诗词填空闯关', type: 'class' },
  { id: 'battle', name: '小组知识守护战', type: 'class' }
];

function shuffle(list) {
  const result = [...list];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function escapeMarkup(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function optionList(item) {
  return shuffle([item.correct, ...item.distractors]);
}

function createPausableDelay() {
  let timer = null;
  let callback = null;
  let startedAt = 0;
  let remaining = 0;
  let paused = false;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  return {
    schedule(nextCallback, delay) {
      clearTimer();
      callback = nextCallback;
      remaining = Math.max(0, delay);
      paused = false;
      startedAt = performance.now();
      timer = setTimeout(() => {
        timer = null;
        paused = false;
        const run = callback;
        callback = null;
        remaining = 0;
        run?.();
      }, remaining);
    },
    pause() {
      if (timer === null || paused) return;
      clearTimer();
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
      paused = true;
    },
    resume() {
      if (!paused || !callback) return;
      paused = false;
      startedAt = performance.now();
      timer = setTimeout(() => {
        timer = null;
        paused = false;
        const run = callback;
        callback = null;
        remaining = 0;
        run?.();
      }, remaining);
    },
    cancel() {
      clearTimer();
      callback = null;
      paused = false;
      remaining = 0;
    },
    get active() {
      return timer !== null || paused;
    }
  };
}

function reviewRows(answers) {
  return answers.map(answer => {
    const hasTeacherDecision = Object.prototype.hasOwnProperty.call(answer, 'awarded');
    const correct = hasTeacherDecision ? answer.awarded : answer.selected === answer.correct;
    const label = hasTeacherDecision
      ? correct
        ? '得分'
        : answer.teacherCorrect
          ? '需复习'
          : '教师判定需复习'
      : correct
        ? '正确'
        : '需复习';
    return `<tr><td>${answer.prompt}</td><td>${answer.selected}</td><td>${answer.correct}</td><td class="${correct ? 'ok' : 'no'}">${label}</td></tr>`;
  }).join('');
}

function resultView({
  game,
  score,
  answers,
  ratio = score / Math.max(answers.length, 1),
  statPills = [],
  extraHtml = '',
  showNext = false
}) {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const earnedStars = clampedRatio >= .9 ? 3 : clampedRatio >= .6 ? 2 : clampedRatio >= .3 ? 1 : 0;
  const passed = clampedRatio >= .6;
  const stars = [0, 1, 2].map(index => `<img src="assets/kenney/ui/star.png" alt="" class="${index < earnedStars ? 'earned' : 'empty'}">`).join('');
  const pills = statPills.length
    ? statPills
    : [`得分 ${score}`, `共 ${answers.length} 题`, `正确率 ${Math.round(clampedRatio * 100)}%`];
  return `
    <section class="result">
      <div class="result-hero">
        <img class="result-character" src="assets/kenney/characters/${passed ? 'adventurer-cheer0' : 'adventurer-idle'}.png" alt="">
        <div>
          <div class="result-stars" aria-hidden="true">${stars}</div>
          <h2>${game}${passed ? '完成' : '再练一次'}</h2>
        </div>
      </div>
      <div class="stat-row">${pills.map(pill => `<span class="pill">${pill}</span>`).join('')}</div>
      <table class="review"><thead><tr><th>题目</th><th>你的答案</th><th>正确答案</th><th>结果</th></tr></thead><tbody>${reviewRows(answers)}</tbody></table>
      ${extraHtml}
      <div class="dialog-actions">
        <button class="ghost" id="game-home">返回地图</button>
        <button class="ghost" id="game-retry">重玩本关</button>
        ${showNext ? '<button id="game-next">下一关</button>' : ''}
      </div>
    </section>
  `;
}

function updateSession(session, values) {
  if (!session) return;
  session.update(values);
}

function wrongItemIds(items, answers) {
  const wrongPrompts = new Set(
    answers.filter(answer => answer.selected !== answer.correct).map(answer => answer.prompt)
  );
  return items.filter(item => wrongPrompts.has(item.prompt)).map(item => item.id);
}

export function createRunner(container, pack, audio, finish, session, options = {}) {
  const items = options.items || [...pack.items].slice(0, 9);
  const levelId = options.levelId || 'practice';
  container.innerHTML = `
    <section class="race-shell" data-game="runner">
      <div class="runner-stage" id="runner-stage" aria-label="森林寻宝记游戏场景">
        <div class="forest-hud">
          <div class="forest-brand">
            <strong>森林寻宝记</strong>
            <div class="forest-location">
              <span id="runner-area">阳光林地</span>
              <span class="forest-dots" id="runner-dots" aria-hidden="true"><i></i><i></i><i></i></span>
              <b id="runner-stage-count">1 / 3</b>
            </div>
          </div>
          <div class="forest-task-card" aria-live="polite">
            <span id="runner-goal">看题选路，一路寻宝</span>
            <strong id="runner-prompt">准备出发</strong>
          </div>
          <div class="forest-hud-actions" aria-hidden="true"></div>
        </div>
        <div class="forest-feedback" id="runner-feedback" hidden>
          <img id="runner-feedback-icon" src="assets/kenney/ui/icon-checkmark.png" alt="">
          <span id="runner-feedback-text"></span>
        </div>
      </div>
      <div class="race-controls" aria-label="跑道控制">
        <button class="race-control" id="runner-left" data-lane="0" type="button"><span>← 左路</span><b>1</b></button>
        <button class="race-control" id="runner-middle" data-lane="1" type="button"><span>↑ 中路</span><b>2</b></button>
        <button class="race-control" id="runner-right" data-lane="2" type="button"><span>右路 →</span><b>3</b></button>
      </div>
      <p class="sr-only" id="runner-status" aria-live="polite">方向键变道，也可直接点击跑道。</p>
    </section>`;
  const runnerStageElement = container.querySelector('#runner-stage');

  let saved = false;
  let lastSummary = null;
  const runner = mountRunnerGame({
    container: container.querySelector('#runner-stage'),
    items,
    pack,
    effectVolume: audio.settings.effectVolume,
    areaNames: options.areaNames,
    theme: options.theme,
    onComplete: summary => {
      const finalSummary = summary || lastSummary;
      if (!finalSummary) return;
      const answerList = finalSummary.answers || [];
      finish(resultView({
        game: '森林寻宝记',
        score: finalSummary.score,
        answers: answerList,
        statPills: [
          `得分 ${finalSummary.score}`,
          `共 ${answerList.length} 题`,
          `正确率 ${Math.round(finalSummary.score / Math.max(answerList.length, 1) * 100)}%`,
          ...(finalSummary.bestCombo > 1 ? [`最高 ${finalSummary.bestCombo} 连击`] : [])
        ],
        showNext: Boolean(session?.nextLevelId)
      }));
    }
  });

  const status = container.querySelector('#runner-status');
  const controls = [...container.querySelectorAll('.race-control')];
  const prompt = container.querySelector('#runner-prompt');
  const goal = container.querySelector('#runner-goal');
  const area = container.querySelector('#runner-area');
  const stageCount = container.querySelector('#runner-stage-count');
  const dots = [...container.querySelectorAll('#runner-dots i')];
  const feedback = container.querySelector('#runner-feedback');
  const feedbackIcon = container.querySelector('#runner-feedback-icon');
  const feedbackText = container.querySelector('#runner-feedback-text');
  const standardControlLabels = ['← 左路', '↑ 中路', '右路 →'];
  const completeControlLabels = ['返回关卡', '再走一次', '完成'];
  const runnerState = () => window.__learningGameDebug?.runner?.state();

  function saveSummary(summary) {
    if (!summary) return;
    lastSummary = summary;
    if (saved) return;
    saved = true;
    recordResult({
      game: 'runner',
      packId: pack.id,
      levelId,
      score: summary.score,
      total: summary.answers.length,
      wrongIds: wrongItemIds(items, summary.answers)
    });
  }

  runner.events.on('journey-complete', summary => {
    saveSummary(summary);
    updateSession(session, { canPause: false, score: `得分 ${summary.score}` });
  });

  controls.forEach(button => {
    const lane = Number(button.dataset.lane);
    button.onclick = () => {
      const current = runnerState();
      if (current?.phase === 'complete') {
        if (lane === 0) session.back();
        if (lane === 1) {
          saved = false;
          lastSummary = null;
          runner.events.emit('restart');
        }
        if (lane === 2) runner.events.emit('finish');
        return;
      }
      runner.events.emit('switch-lane', lane);
    };
  });

  runner.events.on('speak', payload => {
    if (!payload) return;
    if (typeof payload === 'string') audio.speech(payload);
    else audio.speech(payload.path, payload.text, payload.lang);
  });
  runner.events.on('state', state => {
    const paused = state.phase === 'paused';
    const complete = state.phase === 'complete';
    runnerStageElement.dataset.theme = state.theme || '';
    runnerStageElement.dataset.scene = state.stageDetail || '';
    prompt.textContent = state.prompt || '准备出发';
    goal.textContent = state.goal || '看题选路，一路寻宝';
    area.textContent = state.areaName || '阳光林地';
    stageCount.textContent = complete ? '完成' : `${state.questionInStage} / ${state.stageSize}`;
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', complete || index <= state.stageIndex);
      dot.classList.toggle('current', !complete && index === state.stageIndex);
    });
    const showFeedback = Boolean(state.feedback?.visible) && !paused && !complete;
    feedback.hidden = !showFeedback;
    if (showFeedback) {
      const correct = state.feedback.kind === 'correct';
      feedback.className = `forest-feedback ${correct ? 'correct' : 'wrong'}`;
      feedbackIcon.src = correct ? 'assets/kenney/ui/icon-checkmark.png' : 'assets/kenney/ui/icon-cross.png';
      feedbackText.textContent = correct
        ? state.feedback.title || `答对啦 · ${state.prompt} 对应 ${state.options[state.correctLane]}`
        : `${state.feedback.title || '再看一眼'} · ${state.feedback.body || ''}`;
    }
    controls.forEach(button => button.classList.toggle('active', Number(button.dataset.lane) === state.lane));
    controls.forEach((button, index) => {
      const label = button.querySelector('span');
      if (label) label.textContent = complete ? completeControlLabels[index] : standardControlLabels[index];
      button.classList.toggle('complete-control', complete);
      button.disabled = !complete && !['running', 'countdown', 'paused'].includes(state.phase);
    });
    if (paused) status.textContent = '游戏已暂停。';
    else if (complete) status.textContent = '抵达终点。可以选择再走一次或查看本关结果。';
    else if (state.phase === 'feedback') status.textContent = state.feedback.body || '正在准备下一题。';
    else status.textContent = `第 ${state.index + 1} 题：${state.prompt}。`;

    updateSession(session, {
      progress: complete ? '本关完成' : `第 ${state.index + 1} / ${state.total} 题 · ${state.areaName}`,
      hint: complete ? '本关成绩已保存。' : state.goal,
      score: `得分 ${state.score}${state.combo > 1 ? ` · ${state.combo} 连击` : ''}`,
      canPause: !complete
    });
  });

  return {
    destroy() {
      audio.stopSpeech();
      runner.destroy();
    },
    pause() {
      runner.events.emit('pause');
      audio.stopSpeech();
    },
    resume() {
      runner.events.emit('resume');
    }
  };
}

export function createListen(container, pack, audio, finish, session, options = {}) {
  const items = options.items || [...pack.items].slice(0, 10);
  const levelId = options.levelId || 'practice';
  const answers = [];
  const wrongIds = [];
  const earnedSpirits = [];
  const learnedWords = [];
  const nextDelay = createPausableDelay();
  const feedbackFx = createLearningFeedback(container);
  let index = 0;
  let score = 0;
  let locked = false;
  let paused = false;
  let finished = false;
  let audioReady = false;
  let audioState = 'idle';
  let playbackRequest = 0;

  const spirits = [
    { id: 'slime-purple', label: '软糖精灵', idle: 'assets/spirits/kenney/slime_normal_rest.png', frames: ['assets/spirits/kenney/slime_normal_walk_a.png', 'assets/spirits/kenney/slime_normal_walk_b.png'], biomes: ['forest', 'stream', 'river'] },
    { id: 'slime-block', label: '方块精灵', idle: 'assets/spirits/kenney/slime_block_rest.png', frames: ['assets/spirits/kenney/slime_block_walk_a.png', 'assets/spirits/kenney/slime_block_walk_b.png'], biomes: ['mountain', 'snow'] },
    { id: 'slime-fire', label: '小火精灵', idle: 'assets/spirits/kenney/slime_fire_rest.png', frames: ['assets/spirits/kenney/slime_fire_walk_a.png', 'assets/spirits/kenney/slime_fire_walk_b.png'], biomes: ['orchard', 'snow'] },
    { id: 'frog', label: '池塘精灵', idle: 'assets/spirits/kenney/frog_idle.png', frames: ['assets/spirits/kenney/frog_rest.png', 'assets/spirits/kenney/frog_jump.png'], biomes: ['stream', 'river'] },
    { id: 'bee', label: '花蜜精灵', idle: 'assets/spirits/kenney/bee_rest.png', frames: ['assets/spirits/kenney/bee_a.png', 'assets/spirits/kenney/bee_b.png'], biomes: ['forest', 'orchard'] },
    { id: 'ladybug', label: '红点精灵', idle: 'assets/spirits/kenney/ladybug_rest.png', frames: ['assets/spirits/kenney/ladybug_walk_a.png', 'assets/spirits/kenney/ladybug_walk_b.png'], biomes: ['orchard', 'forest'] },
    { id: 'snail', label: '贝壳精灵', idle: 'assets/spirits/kenney/snail_rest.png', frames: ['assets/spirits/kenney/snail_walk_a.png', 'assets/spirits/kenney/snail_walk_b.png'], biomes: ['stream', 'coast'] },
    { id: 'mouse', label: '灰绒精灵', idle: 'assets/spirits/kenney/mouse_rest.png', frames: ['assets/spirits/kenney/mouse_walk_a.png', 'assets/spirits/kenney/mouse_walk_b.png'], biomes: ['mountain', 'forest'] },
    { id: 'fish-blue', label: '水泡精灵', idle: 'assets/spirits/kenney/fish_blue_rest.png', frames: ['assets/spirits/kenney/fish_blue_swim_a.png', 'assets/spirits/kenney/fish_blue_swim_b.png'], biomes: ['coast', 'stream'] }
  ];

  function nextSpirit() {
    const theme = options.theme || 'forest';
    const available = spirits.filter(spirit =>
      !earnedSpirits.includes(spirit.id) && spirit.biomes.includes(theme)
    );
    const fallback = spirits.filter(spirit => !earnedSpirits.includes(spirit.id));
    const pool = available.length ? available : fallback.length ? fallback : spirits;
    return pool[earnedSpirits.length % pool.length];
  }

  function partyMarkup() {
    if (!earnedSpirits.length) return '';
    return `<div class="spirit-party" aria-label="本局伙伴">
      ${earnedSpirits.map((id, position) => {
        const spirit = spirits.find(candidate => candidate.id === id);
        const word = learnedWords[position];
        return `<span title="${spirit.label}"><img src="${spirit.idle}" alt=""><b class="spirit-word">${escapeMarkup(word.correct)}</b><small>${escapeMarkup(word.prompt)}</small><small class="spirit-name">${spirit.label}</small></span>`;
      }).join('')}
    </div>`;
  }

  function show() {
    if (finished) return;
    feedbackFx.cancel('question-changed');
    const item = items[index];
    locked = false;
    audioReady = false;
    audioState = 'idle';
    container.innerHTML = `
      <section class="game-shell listen-shell">
        <div class="game-content listen-content">
          <div class="question-text">听一听，选出正确内容</div>
          <div class="listen-scene theme-${options.theme || 'forest'}">
            <div class="spirit-reveal" hidden aria-live="polite">
              <img src="" alt="">
              <strong></strong>
            </div>
            <button id="play" class="flat-primary" type="button">播放读音</button>
            <span class="listen-audio-state" id="listen-audio-state">等待播放</span>
          </div>
          <div class="three-grid" aria-label="答案选项"></div>
          <div class="feedback"></div>
          <div class="spirit-party-slot">${partyMarkup()}</div>
        </div>
      </section>`;
    const grid = container.querySelector('.three-grid');
    const feedback = container.querySelector('.feedback');
    const playButton = container.querySelector('#play');
    const audioStateLabel = container.querySelector('#listen-audio-state');
    const spiritReveal = container.querySelector('.spirit-reveal');
    const partySlot = container.querySelector('.spirit-party-slot');
    updateSession(session, {
      progress: `第 ${index + 1} / ${items.length} 题`,
      hint: '先播放读音，听到后再选择',
      score: `得分 ${score}`
    });

    const optionButtons = [...(item.options || optionList(item))].map(value => {
      const button = document.createElement('button');
      button.className = 'large-option';
      button.textContent = value;
      button.dataset.value = value;
      button.disabled = true;
      button.onclick = () => {
        if (locked || paused || !audioReady) return;
        locked = true;
        const correct = value === item.correct;
        if (correct) {
          score += 1;
          audio.effect('correct');
          const spirit = nextSpirit();
          earnedSpirits.push(spirit.id);
          learnedWords.push({ correct: item.correct, prompt: item.prompt });
          partySlot.innerHTML = partyMarkup();
          spiritReveal.hidden = false;
          spiritReveal.dataset.spirit = spirit.id;
          spiritReveal.querySelector('img').src = spirit.frames[0];
          spiritReveal.querySelector('strong').textContent = spirit.label;
          feedbackFx.trigger('reveal', {
            targets: spiritReveal,
            duration: 1000,
            sprite: {
              element: spiritReveal.querySelector('img'),
              frames: spirit.frames,
              idle: spirit.idle,
              frameMs: 220
            }
          });
          feedback.textContent = `答对了！发现了${spirit.label}。`;
        } else {
          wrongIds.push(item.id);
          audio.effect('wrong');
          feedback.textContent = `需要复习：正确答案是「${item.correct}」`;
        }
        feedback.className = `feedback ${correct ? 'correct' : 'wrong'}`;
        if (!correct) feedbackFx.trigger('review', { targets: feedback, duration: 300 });
        optionButtons.forEach(option => { option.disabled = true; });
        playButton.disabled = true;
        answers.push({ itemId: item.id, prompt: item.prompt, selected: value, correct: item.correct });
        nextDelay.schedule(() => {
          index += 1;
          if (index < items.length) show();
          else complete();
        }, correct ? 1080 : 820);
      };
      grid.appendChild(button);
      return button;
    });

    function setAudioState(nextState, message) {
      audioState = nextState;
      audioStateLabel.dataset.state = nextState;
      audioStateLabel.textContent = message;
      playButton.dataset.state = nextState;
    }

    playButton.onclick = async () => {
      if (paused || locked) return;
      const request = ++playbackRequest;
      audioReady = false;
      playButton.disabled = true;
      optionButtons.forEach(button => { button.disabled = true; });
      setAudioState('preparing', '正在准备读音…');
      const result = await audio.speech(
        item.audio,
        item.speechText,
        item.speechLang,
        status => {
          if (request !== playbackRequest || finished || paused) return;
          if (status.status === 'preparing') setAudioState('preparing', '正在准备读音…');
          if (status.status === 'playing') setAudioState('playing', '正在播放…');
          if (status.status === 'ended') setAudioState('ended', '已播放，可以选择答案');
          if (status.status === 'failed') setAudioState('failed', '读音播放失败，请重试');
        }
      );
      if (request !== playbackRequest || finished || paused) return;
      if (result?.status === 'ended') {
        audioReady = true;
        playButton.disabled = false;
        playButton.textContent = '再听一次';
        optionButtons.forEach(button => { button.disabled = false; });
        feedback.className = 'feedback';
        feedback.textContent = '听清楚后，选择你听到的内容。';
      } else {
        audioReady = false;
        playButton.disabled = false;
        setAudioState('failed', '没有播放成功，不计错，请重试');
        feedback.className = 'feedback wrong';
        feedback.textContent = result?.reason === 'voice-missing'
          ? '没有可用的中文/英语声线，请检查安装或本地音频。'
          : '读音没有播放成功，答案暂不可选，请重试。';
      }
    };
    window.__learningGameDebug = {
      ...(window.__learningGameDebug || {}),
      listen: {
        state: () => ({
          index,
          score,
          locked,
          paused,
          prompt: item.prompt,
          correct: item.correct,
          audioState,
          audioReady,
          earnedSpirits: [...earnedSpirits]
        }),
        choose: value => grid.querySelector(`[data-value="${value}"]`)?.click(),
        play: () => playButton.click()
      }
    };
  }

  function complete() {
    if (finished) return;
    finished = true;
    feedbackFx.cancel('complete');
    recordResult({ game: 'listen', packId: pack.id, levelId, score, total: items.length, wrongIds });
    audio.effect(completionSound(score, items.length));
    finish(resultView({
      game: '听音找精灵',
      score,
      answers,
      extraHtml: partyMarkup(),
      showNext: Boolean(session?.nextLevelId)
    }));
  }

  show();
  return {
    destroy() {
      finished = true;
      playbackRequest += 1;
      nextDelay.cancel();
      feedbackFx.destroy();
      audio.stopSpeech();
      if (window.__learningGameDebug?.listen) delete window.__learningGameDebug.listen;
    },
    pause() {
      paused = true;
      playbackRequest += 1;
      nextDelay.pause();
      feedbackFx.pause();
      audio.stopSpeech();
      container.classList.add('spirit-paused');
    },
    resume() {
      paused = false;
      nextDelay.resume();
      feedbackFx.resume();
      container.classList.remove('spirit-paused');
      const debug = window.__learningGameDebug?.listen;
      if (debug) {
        const state = debug.state();
        if (!state.audioReady) {
          const playButton = container.querySelector('#play');
          if (playButton) playButton.disabled = false;
        }
      }
    }
  };
}

export function createAssemble(container, pack, audio, finish, session, options = {}) {
  const items = options.items || [...pack.items].slice(0, 10);
  const levelId = options.levelId || 'practice';
  const answers = [];
  const wrongIds = [];
  const nextDelay = createPausableDelay();
  const feedbackFx = createLearningFeedback(container);
  let index = 0;
  let score = 0;
  let selected = [];
  let currentItem = null;
  let locked = false;
  let paused = false;
  let finished = false;

  function show() {
    if (finished) return;
    feedbackFx.cancel('question-changed');
    const item = items[index];
    currentItem = item;
    selected = [];
    locked = false;
    const letters = shuffle(item.correct.split(''));
    container.innerHTML = `
      <section class="game-shell">
        <div class="game-content assemble-content">
          <div class="question-text">${item.prompt}</div>
          <div class="slots" id="slots"></div>
          <div class="letters" id="letters"></div>
          <div class="game-actions"><button class="ghost" id="clear">清空</button><button id="confirm">确认答案</button></div>
          <div class="feedback"></div>
        </div>
      </section>`;
    const slots = container.querySelector('#slots');
    const letterBox = container.querySelector('#letters');
    const clearButton = container.querySelector('#clear');
    const confirmButton = container.querySelector('#confirm');
    const feedback = container.querySelector('.feedback');
    updateSession(session, {
      progress: `第 ${index + 1} / ${items.length} 题`,
      hint: '点击字母填入，再确认答案',
      score: `得分 ${score}`
    });

    const renderSlots = () => {
      feedbackFx.cancel('slots-updated');
      slots.innerHTML = item.correct.split('').map((_, position) => `
        <button class="slot" type="button" data-position="${position}" ${selected[position] && !locked ? '' : 'disabled'}>${selected[position]?.letter || '·'}</button>
      `).join('');
    };
    const setInteractionDisabled = disabled => {
      clearButton.disabled = disabled;
      confirmButton.disabled = disabled;
      if (disabled) {
        [...letterBox.children].forEach(button => { button.disabled = true; });
      }
    };
    letters.forEach((letter, position) => {
      const button = document.createElement('button');
      button.className = 'letter';
      button.textContent = letter;
      button.dataset.position = String(position);
      button.onclick = () => {
        if (locked || paused || selected.length >= item.correct.length) return;
        selected.push({ letter, position });
        button.disabled = true;
        renderSlots();
        feedbackFx.trigger('slot', { targets: slots.children[selected.length - 1] });
      };
      letterBox.appendChild(button);
    });
    slots.onclick = event => {
      if (locked || paused) return;
      const slot = event.target.closest('.slot');
      if (!slot || !selected[Number(slot.dataset.position)]) return;
      const removed = selected.splice(Number(slot.dataset.position), 1)[0];
      letterBox.querySelector(`[data-position="${removed.position}"]`)?.removeAttribute('disabled');
      renderSlots();
    };
    clearButton.onclick = () => {
      if (locked || paused) return;
      selected = [];
      [...letterBox.children].forEach(child => { child.disabled = false; });
      renderSlots();
    };
    confirmButton.onclick = () => {
      if (locked || paused) return;
      const value = selected.map(entry => entry.letter).join('');
      if (value.length !== item.correct.length) {
        feedback.className = 'feedback wrong';
        feedback.textContent = '请把完整答案拼好后再确认。';
        feedbackFx.trigger('review', { targets: feedback, duration: 260 });
        return;
      }
      locked = true;
      setInteractionDisabled(true);
      const correct = value === item.correct;
      if (correct) {
        score += 1;
        audio.effect('correct');
      } else {
        wrongIds.push(item.id);
        audio.effect('wrong');
      }
      feedback.className = `feedback ${correct ? 'correct' : 'wrong'}`;
      feedback.textContent = correct ? '拼装正确！' : `需要复习：正确拼写是「${item.correct}」`;
      feedbackFx.trigger(correct ? 'correct' : 'review', {
        targets: [slots, feedback],
        duration: correct ? 400 : 300
      });
      answers.push({ itemId: item.id, prompt: item.prompt, selected: value, correct: item.correct });
      nextDelay.schedule(() => {
        index += 1;
        if (index < items.length) show();
        else complete();
      }, 760);
    };
    renderSlots();
    window.__learningGameDebug = {
      ...(window.__learningGameDebug || {}),
      assemble: {
        state: () => ({
          index,
          score,
          locked,
          paused,
          selected: selected.map(entry => entry.letter).join(''),
          correct: currentItem.correct
        }),
        solve: () => {
          if (locked || paused) return;
          clearButton.click();
          [...currentItem.correct].forEach(letter => {
            const button = [...letterBox.querySelectorAll('.letter:not(:disabled)')]
              .find(candidate => candidate.textContent === letter);
            button?.click();
          });
          confirmButton.click();
        }
      }
    };
  }

  function complete() {
    if (finished) return;
    finished = true;
    feedbackFx.cancel('complete');
    recordResult({ game: 'assemble', packId: pack.id, levelId, score, total: items.length, wrongIds });
    audio.effect(completionSound(score, items.length));
    finish(resultView({
      game: '拼音/单词拼装',
      score,
      answers,
      showNext: Boolean(session?.nextLevelId)
    }));
  }

  show();
  return {
    destroy() {
      finished = true;
      nextDelay.cancel();
      feedbackFx.destroy();
      audio.stopSpeech();
      if (window.__learningGameDebug?.assemble) delete window.__learningGameDebug.assemble;
    },
    pause() {
      paused = true;
      nextDelay.pause();
      feedbackFx.pause();
    },
    resume() {
      paused = false;
      nextDelay.resume();
      feedbackFx.resume();
    }
  };
}

export function createMemory(container, pack, audio, finish, session, options = {}) {
  const levelId = options.levelId || 'practice';
  const plan = options.memoryPlan;
  if (!plan?.waves?.length) throw new Error('记忆翻牌缺少本局分波计划。');
  const totalPairs = plan.pairCount;
  const flipDelay = createPausableDelay();
  const feedbackFx = createLearningFeedback(container);
  const answers = [];
  const mistakeIds = new Set();
  let opened = [];
  let waveIndex = 0;
  let waveMatched = 0;
  let matched = 0;
  let attempts = 0;
  let locked = false;
  let paused = false;
  let finished = false;

  container.innerHTML = `
    <section class="game-shell">
      <div class="game-content memory-content">
        <div class="memory-wave-label"></div>
        <div class="memory-grid"></div>
        <div class="feedback">先翻两张牌，找出“字词”和“拼音/英文”的配对。</div>
      </div>
    </section>`;
  const grid = container.querySelector('.memory-grid');
  const feedback = container.querySelector('.feedback');
  const waveLabel = container.querySelector('.memory-wave-label');

  function finishRound() {
    if (finished) return;
    finished = true;
    feedbackFx.cancel('complete');
    const mistakes = Math.max(0, attempts - totalPairs);
    recordResult({
      game: 'memory',
      packId: pack.id,
      levelId,
      score: totalPairs,
      total: Math.max(attempts, totalPairs),
      attempts,
      wrongIds: [...mistakeIds]
    });
    audio.effect(completionSound(totalPairs, totalPairs));
    finish(resultView({
      game: '记忆翻牌配对',
      score: totalPairs,
      answers,
      ratio: totalPairs / Math.max(attempts, totalPairs),
      statPills: [
        `完成 ${totalPairs} 对`,
        `共 ${plan.waveCount} 波`,
        `尝试 ${attempts} 次`,
        `错配 ${mistakes} 次`
      ],
      showNext: Boolean(session?.nextLevelId)
    }));
  }

  function updateMemorySession() {
    updateSession(session, {
      progress: `已配 ${matched}/${totalPairs} 对 · 第 ${waveIndex + 1}/${plan.waveCount} 波`,
      hint: '翻出成对的字词与拼音或英文',
      score: `尝试 ${attempts} 次`
    });
  }

  function renderWave() {
    feedbackFx.cancel('wave-changed');
    const wave = plan.waves[waveIndex];
    if (!wave) {
      finishRound();
      return;
    }
    opened = [];
    waveMatched = 0;
    locked = false;
    grid.innerHTML = '';
    waveLabel.textContent = `第 ${waveIndex + 1} / ${plan.waveCount} 波 · ${wave.pairCount} 对`;
    feedback.className = 'feedback';
    feedback.textContent = wave.pairCount < totalPairs
      ? '这一波配对完成后，会继续下一波。'
      : '先翻两张牌，找出字词与拼音或英文的配对。';
    wave.cards.forEach((card, cardIndex) => {
      const button = document.createElement('button');
      button.className = 'memory-card';
      button.textContent = '?';
      button.dataset.index = String(cardIndex);
      button.dataset.key = card.pairKey;
      button.dataset.side = card.side;
      button.dataset.text = card.text;
      button.onclick = () => {
        if (paused || locked || opened.some(entry => entry.button === button) || button.classList.contains('matched')) return;
        button.textContent = card.text;
        button.classList.add('flipped');
        opened.push({ ...card, button });
        if (opened.length !== 2) return;

        attempts += 1;
        const [first, second] = opened;
        if (first.pairKey === second.pairKey && first.side !== second.side) {
          matched += 1;
          waveMatched += 1;
          first.button.classList.add('matched');
          second.button.classList.add('matched');
          audio.effect('correct');
          feedback.className = 'feedback correct';
          feedback.textContent = `配对成功！还剩 ${totalPairs - matched} 对。`;
          feedbackFx.trigger('pair', { targets: [first.button, second.button], duration: 400 });
          answers.push({ prompt: first.text, selected: second.text, correct: second.text });
          opened = [];
          updateMemorySession();
          if (waveMatched === wave.pairCount) {
            locked = true;
            flipDelay.schedule(() => {
              waveIndex += 1;
              renderWave();
            }, 520);
          }
        } else {
          locked = true;
          mistakeIds.add(first.pairKey);
          mistakeIds.add(second.pairKey);
          audio.effect('wrong');
          const current = opened;
          opened = [];
          feedback.className = 'feedback wrong';
          feedback.textContent = '不是一对，记住位置，稍后再试。';
          feedbackFx.trigger('review', { targets: [first.button, second.button], duration: 300 });
          flipDelay.schedule(() => {
            current.forEach(entry => {
              entry.button.textContent = '?';
              entry.button.classList.remove('flipped');
            });
            locked = false;
          }, 760);
          updateMemorySession();
        }
      };
      grid.appendChild(button);
    });
    updateMemorySession();
  }

  renderWave();

  window.__learningGameDebug = {
    ...(window.__learningGameDebug || {}),
    memory: {
      state: () => ({
        matched,
        waveIndex,
        waveCount: plan.waveCount,
        waveMatched,
        attempts,
        mistakes: Math.max(0, attempts - totalPairs),
        locked,
        paused,
        cards: [...grid.children].map(child => ({
          key: child.dataset.key,
          side: child.dataset.side,
          text: child.dataset.text,
          shown: child.classList.contains('flipped') || child.classList.contains('matched'),
          matched: child.classList.contains('matched')
        }))
      }),
      click: index => grid.children[index]?.click()
    }
  };

  return {
    destroy() {
      finished = true;
      flipDelay.cancel();
      feedbackFx.destroy();
      if (window.__learningGameDebug?.memory) delete window.__learningGameDebug.memory;
    },
    pause() {
      paused = true;
      flipDelay.pause();
      feedbackFx.pause();
    },
    resume() {
      paused = false;
      flipDelay.resume();
      feedbackFx.resume();
    }
  };
}

function poemQuestions(poems) {
  return poems.flatMap(poem => (poem.cloze || []).map(question => ({
    ...question,
    poemId: poem.id,
    title: poem.title,
    author: poem.author,
    lineText: poem.lines[question.line],
    options: shuffle([question.answer, ...shuffle(question.distractors).slice(0, 2)])
  })));
}

export function createBeat(container, pack, audio, finish, session, options = {}) {
  const poems = options.poems || (pack.poems || []).slice(0, 1);
  const questions = (options.questions || shuffle(poemQuestions(poems)).slice(0, 6)).map(question => ({
    ...question,
    options: question.options || shuffle([question.answer, ...shuffle(question.distractors).slice(0, 2)])
  }));
  const levelId = options.levelId || 'practice';
  const answers = [];
  const wrongIds = [];
  const nextDelay = createPausableDelay();
  const feedbackFx = createLearningFeedback(container);
  let index = 0;
  let score = 0;
  let selected = '';
  let locked = false;
  let paused = false;
  let finished = false;

  function draw() {
    if (finished) return;
    feedbackFx.cancel('question-changed');
    const question = questions[index];
    selected = '';
    locked = false;
    container.innerHTML = `
      <section class="game-shell poetry-shell">
        <div class="game-content poetry-content">
          <div class="poetry-context">《${question.title}》 · ${question.author}</div>
          <div class="poetry-question">${question.before}<em> ____ </em>${question.after}</div>
          <div class="poetry-option-grid">
            ${question.options.map(option => `<button type="button" data-poem-answer="${option}">${option}</button>`).join('')}
          </div>
          <div class="feedback poetry-feedback"></div>
        </div>
      </section>`;
    const optionGrid = container.querySelector('.poetry-option-grid');
    const feedback = container.querySelector('.poetry-feedback');
    updateSession(session, {
      progress: `第 ${index + 1} / ${questions.length} 题`,
      hint: '读懂前后句，补全诗句',
      score: `得分 ${score}`
    });
    optionGrid.querySelectorAll('[data-poem-answer]').forEach(button => {
      button.onclick = () => {
        if (locked || paused) return;
        locked = true;
        selected = button.dataset.poemAnswer;
        const correct = selected === question.answer;
        if (correct) {
          score += 1;
          audio.effect('correct');
        } else {
          wrongIds.push(question.id);
          audio.effect('wrong');
        }
        optionGrid.querySelectorAll('button').forEach(option => { option.disabled = true; });
        const completedLine = container.querySelector('.poetry-question');
        const completedBlank = document.createElement('em');
        completedBlank.className = 'completed-blank';
        completedBlank.textContent = question.answer;
        completedLine.replaceChildren(
          document.createTextNode(question.before), completedBlank, document.createTextNode(question.after)
        );
        feedbackFx.trigger(correct ? 'correct' : 'review', { targets: completedBlank, duration: 400 });
        feedback.className = `feedback poetry-feedback ${correct ? 'correct' : 'wrong'}`;
        feedback.textContent = correct
          ? `补全正确：${question.lineText}`
          : `再记一遍：${question.lineText}`;
        answers.push({
          itemId: question.id,
          prompt: `《${question.title}》${question.before} ____ ${question.after}`,
          selected,
          correct: question.answer
        });
        nextDelay.schedule(() => {
          index += 1;
          if (index < questions.length) draw();
          else complete();
        }, correct ? 1500 : 2400);
      };
    });
    window.__learningGameDebug = {
      ...(window.__learningGameDebug || {}),
      beat: {
        state: () => ({
          index,
          score,
          locked,
          paused,
          selected,
          questionId: questions[index]?.id,
          options: [...(questions[index]?.options || [])],
          correct: questions[index]?.answer,
          finished
        }),
        choose: answer => optionGrid.querySelector(`[data-poem-answer="${answer}"]`)?.click()
      }
    };
  }

  function complete() {
    if (finished) return;
    finished = true;
    feedbackFx.cancel('complete');
    const reviewHtml = `
      <section class="poem-review">
        ${poems.map(poem => `
          <article>
            <strong>《${poem.title}》</strong>
            <span>${poem.author}</span>
            <p>${poem.lines.join('，')}。</p>
          </article>
        `).join('')}
      </section>`;
    recordResult({ game: 'beat', packId: pack.id, levelId, score, total: questions.length, wrongIds });
    audio.effect(completionSound(score, questions.length));
    finish(resultView({
      game: '诗词填空闯关',
      score,
      answers,
      extraHtml: reviewHtml,
      showNext: Boolean(session?.nextLevelId)
    }));
  }

  draw();
  return {
    destroy() {
      finished = true;
      nextDelay.cancel();
      feedbackFx.destroy();
      if (window.__learningGameDebug?.beat) delete window.__learningGameDebug.beat;
    },
    pause() {
      paused = true;
      nextDelay.pause();
      feedbackFx.pause();
    },
    resume() {
      paused = false;
      nextDelay.resume();
      feedbackFx.resume();
    }
  };
}

export function createBattle(container, pack, audio, finish, session, options = {}) {
  const items = options.items || [...pack.items].slice(0, 10);
  const levelId = options.levelId || 'practice';
  const answers = [];
  const wrongIds = [];
  const advanceDelay = createPausableDelay();
  const feedbackFx = createLearningFeedback(container);
  let index = 0;
  let turn = 0;
  let score = [0, 0];
  let selected = '';
  let locked = false;
  let paused = false;
  let finished = false;

  container.innerHTML = `
    <section class="game-shell">
      <div class="game-content battle-content">
        <div class="battle-arena">
          <div class="team team-blue active" id="team0"><img src="assets/kenney/platformer/flag_blue_b.png" alt=""><strong>蓝队</strong><span class="team-score" id="team-score0">0</span><div class="energy"><span></span></div></div>
          <div class="team team-amber" id="team1"><img src="assets/kenney/platformer/flag_yellow_a.png" alt=""><strong>黄队</strong><span class="team-score" id="team-score1">0</span><div class="energy"><span></span></div></div>
        </div>
        <div class="question-text" id="prompt"></div>
        <div class="option-grid"></div>
        <div class="game-actions"><button id="teacher-correct">老师确认正确</button><button class="danger" id="teacher-wrong">老师判定需复习</button></div>
        <div class="feedback">先选择答案，再由老师确认。</div>
      </div>
    </section>`;
  const optionGrid = container.querySelector('.option-grid');
  const feedback = container.querySelector('.feedback');
  const correctButton = container.querySelector('#teacher-correct');
  const wrongButton = container.querySelector('#teacher-wrong');

  function updateTeams(animateTurn = false) {
    container.querySelector('#team0').classList.toggle('active', turn === 0);
    container.querySelector('#team1').classList.toggle('active', turn === 1);
    container.querySelector('#team-score0').textContent = String(score[0]);
    container.querySelector('#team-score1').textContent = String(score[1]);
    const teamTotal = Math.max(1, Math.ceil(items.length / 2));
    container.querySelector('#team0 .energy span').style.width = `${score[0] / teamTotal * 100}%`;
    container.querySelector('#team1 .energy span').style.width = `${score[1] / teamTotal * 100}%`;
    if (animateTurn) feedbackFx.trigger('turn', { targets: container.querySelector(`#team${turn} > img`), duration: 320 });
  }

  function show() {
    if (finished) return;
    const item = items[index];
    container.querySelector('#prompt').textContent = item.prompt;
    optionGrid.innerHTML = '';
    selected = '';
    locked = false;
    feedback.className = 'feedback';
    feedback.textContent = `请第 ${turn + 1} 组选择答案，再由老师确认。`;
    correctButton.disabled = false;
    wrongButton.disabled = false;
    updateTeams(true);
    updateSession(session, {
      progress: `第 ${index + 1} / ${items.length} 题 · 第 ${turn + 1} 组`,
      hint: '两组轮流答题，老师确认后计分',
      score: `蓝 ${score[0]} : ${score[1]} 黄`
    });
    (item.options || optionList(item)).forEach(value => {
      const button = document.createElement('button');
      button.className = 'large-option';
      button.textContent = value;
      button.dataset.value = value;
      button.onclick = () => {
        if (locked || paused) return;
        selected = value;
        optionGrid.querySelectorAll('button').forEach(candidate => {
          candidate.classList.toggle('selected-option', candidate === button);
        });
        feedback.className = 'feedback';
        feedback.textContent = `已选择「${value}」，等待老师确认。`;
      };
      optionGrid.appendChild(button);
    });
  }

  function judge(teacherCorrect) {
    if (locked || paused) return;
    if (!selected) {
      feedback.className = 'feedback wrong';
      feedback.textContent = '请先选择一个答案，再由老师确认。';
      return;
    }
    locked = true;
    const item = items[index];
    const actual = selected === item.correct;
    const awarded = teacherCorrect && actual;
    if (awarded) {
      score[turn] += 1;
      audio.effect('correct');
    } else {
      wrongIds.push(item.id);
      audio.effect('wrong');
    }
    answers.push({
      prompt: `第 ${turn + 1} 组 · ${item.prompt}`,
      selected,
      correct: item.correct,
      teacherCorrect,
      awarded
    });
    feedback.className = `feedback ${awarded ? 'correct' : 'wrong'}`;
    feedback.textContent = awarded
      ? `第 ${turn + 1} 组得分！正确答案是「${item.correct}」。`
      : `本题需复习，正确答案是「${item.correct}」。`;
    optionGrid.querySelectorAll('button').forEach(button => { button.disabled = true; });
    correctButton.disabled = true;
    wrongButton.disabled = true;
    updateTeams();
    updateSession(session, {
      score: `蓝 ${score[0]} : ${score[1]} 黄`,
      progress: `第 ${index + 1} / ${items.length} 题 · 老师已判定`
    });
    advanceDelay.schedule(() => {
      turn = 1 - turn;
      index += 1;
      if (index < items.length) show();
      else complete();
    }, 760);
  }

  function complete() {
    if (finished) return;
    finished = true;
    recordResult({
      game: 'battle',
      packId: pack.id,
      levelId,
      score: score[0] + score[1],
      total: items.length,
      wrongIds
    });
    audio.effect(completionSound(score[0] + score[1], items.length));
    finish(resultView({
      game: '小组知识守护战',
      score: score[0] + score[1],
      answers,
      statPills: [
        `蓝队 ${score[0]} 分`,
        `黄队 ${score[1]} 分`,
        `全班得分 ${score[0] + score[1]} / ${items.length}`
      ],
      showNext: Boolean(session?.nextLevelId)
    }));
  }

  correctButton.onclick = () => judge(true);
  wrongButton.onclick = () => judge(false);
  show();
  window.__learningGameDebug = {
    ...(window.__learningGameDebug || {}),
    battle: {
      state: () => ({
        index,
        turn,
        score: [...score],
        selected,
        locked,
        paused,
        correct: items[index]?.correct
      }),
      select: value => optionGrid.querySelector(`[data-value="${value}"]`)?.click(),
      judgeCorrect: () => judge(true),
      judgeWrong: () => judge(false)
    }
  };

  return {
    destroy() {
      finished = true;
      advanceDelay.cancel();
      feedbackFx.destroy();
      if (window.__learningGameDebug?.battle) delete window.__learningGameDebug.battle;
    },
    pause() {
      paused = true;
      advanceDelay.pause();
      feedbackFx.pause();
    },
    resume() {
      paused = false;
      advanceDelay.resume();
      feedbackFx.resume();
    }
  };
}
