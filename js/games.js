import { recordResult } from './storage.js';
import { mountRunnerGame } from './runner-phaser.js';
import { completionSound } from './audio.js';

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
  const nextDelay = createPausableDelay();
  let index = 0;
  let score = 0;
  let locked = false;
  let paused = false;
  let finished = false;

  function show() {
    if (finished) return;
    const item = items[index];
    locked = false;
    container.innerHTML = `
      <section class="game-shell listen-shell">
        <div class="game-content listen-content">
          <div class="question-text">听一听，选出正确内容</div>
          <button id="play" class="flat-primary">播放读音</button>
          <div class="three-grid"></div>
          <div class="feedback"></div>
        </div>
      </section>`;
    const grid = container.querySelector('.three-grid');
    const feedback = container.querySelector('.feedback');
    const playButton = container.querySelector('#play');
    updateSession(session, {
      progress: `第 ${index + 1} / ${items.length} 题`,
      hint: '点击播放，选出听到的内容',
      score: `得分 ${score}`
    });
    playButton.onclick = () => {
      if (!paused) audio.speech(item.audio, item.speechText, item.speechLang);
    };
    optionList(item).forEach(value => {
      const button = document.createElement('button');
      button.className = 'large-option';
      button.textContent = value;
      button.dataset.value = value;
      button.onclick = () => {
        if (locked || paused) return;
        locked = true;
        const correct = value === item.correct;
        if (correct) {
          score += 1;
          audio.effect('correct');
        } else {
          wrongIds.push(item.id);
          audio.effect('wrong');
        }
        feedback.className = `feedback ${correct ? 'correct' : 'wrong'}`;
        feedback.textContent = correct ? '答对了！进入下一题…' : `需要复习：正确答案是「${item.correct}」`;
        grid.querySelectorAll('button').forEach(option => { option.disabled = true; });
        playButton.disabled = true;
        answers.push({ itemId: item.id, prompt: item.prompt, selected: value, correct: item.correct });
        nextDelay.schedule(() => {
          index += 1;
          if (index < items.length) show();
          else complete();
        }, 780);
      };
      grid.appendChild(button);
    });
    window.__learningGameDebug = {
      ...(window.__learningGameDebug || {}),
      listen: {
        state: () => ({ index, score, locked, paused, prompt: item.prompt, correct: item.correct }),
        choose: value => grid.querySelector(`[data-value="${value}"]`)?.click(),
        play: () => playButton.click()
      }
    };
  }

  function complete() {
    if (finished) return;
    finished = true;
    recordResult({ game: 'listen', packId: pack.id, levelId, score, total: items.length, wrongIds });
    audio.effect(completionSound(score, items.length));
    finish(resultView({
      game: '听音找精灵',
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
      audio.stopSpeech();
      if (window.__learningGameDebug?.listen) delete window.__learningGameDebug.listen;
    },
    pause() {
      paused = true;
      nextDelay.pause();
      audio.stopSpeech();
    },
    resume() {
      paused = false;
      nextDelay.resume();
    }
  };
}

export function createAssemble(container, pack, audio, finish, session, options = {}) {
  const items = options.items || [...pack.items].slice(0, 10);
  const levelId = options.levelId || 'practice';
  const answers = [];
  const wrongIds = [];
  const nextDelay = createPausableDelay();
  let index = 0;
  let score = 0;
  let selected = [];
  let currentItem = null;
  let locked = false;
  let paused = false;
  let finished = false;

  function show() {
    if (finished) return;
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
      audio.stopSpeech();
      if (window.__learningGameDebug?.assemble) delete window.__learningGameDebug.assemble;
    },
    pause() {
      paused = true;
      nextDelay.pause();
    },
    resume() {
      paused = false;
      nextDelay.resume();
    }
  };
}

export function createMemory(container, pack, audio, finish, session, options = {}) {
  const items = options.items || [...pack.items].slice(0, 6);
  const levelId = options.levelId || 'practice';
  const cards = shuffle(items.flatMap(item => [
    { key: item.id, text: item.prompt, pair: item.correct },
    { key: item.id, text: item.correct, pair: item.prompt }
  ]));
  const flipDelay = createPausableDelay();
  const answers = [];
  const mistakeIds = new Set();
  let opened = [];
  let matched = 0;
  let attempts = 0;
  let locked = false;
  let paused = false;
  let finished = false;

  container.innerHTML = `
    <section class="game-shell">
      <div class="game-content memory-content">
        <div class="memory-grid"></div>
        <div class="feedback">先翻两张牌，找出“字词”和“拼音/英文”的配对。</div>
      </div>
    </section>`;
  const grid = container.querySelector('.memory-grid');
  const feedback = container.querySelector('.feedback');
  updateSession(session, {
    progress: `已配 ${matched}/${items.length}`,
    hint: '翻出成对的字词与拼音/英文',
    score: `尝试 ${attempts} 次`
  });

  function finishRound() {
    if (finished) return;
    finished = true;
    const mistakes = Math.max(0, attempts - items.length);
    recordResult({
      game: 'memory',
      packId: pack.id,
      levelId,
      score: items.length,
      total: Math.max(attempts, items.length),
      attempts,
      wrongIds: [...mistakeIds]
    });
    audio.effect(completionSound(items.length, items.length));
    finish(resultView({
      game: '记忆翻牌配对',
      score: items.length,
      answers,
      ratio: items.length / Math.max(attempts, items.length),
      statPills: [
        `完成 ${items.length} 对`,
        `尝试 ${attempts} 次`,
        `错配 ${mistakes} 次`
      ],
      showNext: Boolean(session?.nextLevelId)
    }));
  }

  cards.forEach((card, cardIndex) => {
    const button = document.createElement('button');
    button.className = 'memory-card';
    button.textContent = '?';
    button.dataset.index = String(cardIndex);
    button.dataset.key = card.key;
    button.dataset.text = card.text;
    button.onclick = () => {
      if (paused || locked || opened.some(entry => entry.button === button) || button.classList.contains('matched')) return;
      button.textContent = card.text;
      button.classList.add('flipped');
      opened.push({ ...card, button });
      if (opened.length !== 2) return;

      attempts += 1;
      const [first, second] = opened;
      if (first.key === second.key && first.text !== second.text) {
        matched += 1;
        first.button.classList.add('matched');
        second.button.classList.add('matched');
        audio.effect('correct');
        feedback.className = 'feedback correct';
        feedback.textContent = `配对成功！还剩 ${items.length - matched} 对。`;
        answers.push({ prompt: first.text, selected: second.text, correct: second.text });
        opened = [];
        updateSession(session, {
          progress: `已配 ${matched}/${items.length}`,
          score: `尝试 ${attempts} 次`
        });
        if (matched === items.length) finishRound();
      } else {
        locked = true;
        mistakeIds.add(first.key);
        mistakeIds.add(second.key);
        audio.effect('wrong');
        const current = opened;
        opened = [];
        feedback.className = 'feedback wrong';
        feedback.textContent = '不是一对，记住位置，稍后再试。';
        flipDelay.schedule(() => {
          current.forEach(entry => {
            entry.button.textContent = '?';
            entry.button.classList.remove('flipped');
          });
          locked = false;
        }, 760);
        updateSession(session, {
          progress: `已配 ${matched}/${items.length}`,
          score: `尝试 ${attempts} 次`
        });
      }
    };
    grid.appendChild(button);
  });

  window.__learningGameDebug = {
    ...(window.__learningGameDebug || {}),
    memory: {
      state: () => ({
        matched,
        attempts,
        mistakes: Math.max(0, attempts - items.length),
        locked,
        paused,
        cards: [...grid.children].map(child => ({
          key: child.dataset.key,
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
      if (window.__learningGameDebug?.memory) delete window.__learningGameDebug.memory;
    },
    pause() {
      paused = true;
      flipDelay.pause();
    },
    resume() {
      paused = false;
      flipDelay.resume();
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
  let index = 0;
  let score = 0;
  let selected = '';
  let locked = false;
  let paused = false;
  let finished = false;

  function draw() {
    if (finished) return;
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
      hint: '从审核过的诗句变体中随机抽题',
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
        }, 900);
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
      if (window.__learningGameDebug?.beat) delete window.__learningGameDebug.beat;
    },
    pause() {
      paused = true;
      nextDelay.pause();
    },
    resume() {
      paused = false;
      nextDelay.resume();
    }
  };
}

export function createBattle(container, pack, audio, finish, session, options = {}) {
  const items = options.items || [...pack.items].slice(0, 10);
  const levelId = options.levelId || 'practice';
  const answers = [];
  const wrongIds = [];
  const advanceDelay = createPausableDelay();
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
          <div class="team team-amber" id="team1"><img src="assets/kenney/platformer/flag_yellow_a.png" alt=""><strong>琥珀队</strong><span class="team-score" id="team-score1">0</span><div class="energy"><span></span></div></div>
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

  function updateTeams() {
    container.querySelector('#team0').classList.toggle('active', turn === 0);
    container.querySelector('#team1').classList.toggle('active', turn === 1);
    container.querySelector('#team-score0').textContent = String(score[0]);
    container.querySelector('#team-score1').textContent = String(score[1]);
    container.querySelector('#team0 .energy span').style.width = `${score[0] / Math.max(items.length, 1) * 100}%`;
    container.querySelector('#team1 .energy span').style.width = `${score[1] / Math.max(items.length, 1) * 100}%`;
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
    updateTeams();
    updateSession(session, {
      progress: `第 ${index + 1} / ${items.length} 题 · 第 ${turn + 1} 组`,
      hint: '两组轮流答题，老师确认后计分',
      score: `蓝 ${score[0]} : ${score[1]} 琥珀`
    });
    optionList(item).forEach(value => {
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
      score: `蓝 ${score[0]} : ${score[1]} 琥珀`,
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
        `琥珀队 ${score[1]} 分`,
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
      if (window.__learningGameDebug?.battle) delete window.__learningGameDebug.battle;
    },
    pause() {
      paused = true;
      advanceDelay.pause();
    },
    resume() {
      paused = false;
      advanceDelay.resume();
    }
  };
}
