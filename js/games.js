import { AudioManager } from './audio.js';
import { recordResult } from './storage.js';
import { mountRunnerGame } from './runner-phaser.js';

export const GAME_META = [
  { id: 'runner', name: '森林寻宝记', type: 'personal' },
  { id: 'listen', name: '听音找精灵', type: 'personal' },
  { id: 'assemble', name: '拼音/单词拼装', type: 'personal' },
  { id: 'memory', name: '记忆翻牌配对', type: 'personal' },
  { id: 'beat', name: '诗词小剧场', type: 'class' },
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

function reviewRows(answers) {
  return answers.map(answer => `<tr><td>${answer.prompt}</td><td>${answer.selected}</td><td>${answer.correct}</td><td class="${answer.selected === answer.correct ? 'ok' : 'no'}">${answer.selected === answer.correct ? '正确' : '需复习'}</td></tr>`).join('');
}

function resultView({ game, score, answers, coins = 0, bestCombo = 0, retry, home }) {
  const total = Math.max(answers.length, 1);
  const ratio = score / total;
  const earnedStars = ratio >= .9 ? 3 : ratio >= .6 ? 2 : ratio >= .3 ? 1 : 0;
  const stars = [0, 1, 2].map(index => `<img src="assets/kenney/ui/star.png" alt="" class="${index < earnedStars ? 'earned' : 'empty'}">`).join('');
  return `
    <section class="result">
      <div class="result-hero">
        <img class="result-character" src="assets/kenney/characters/adventurer-cheer0.png" alt="">
        <div>
          <div class="result-stars" aria-hidden="true">${stars}</div>
          <h2>${game}完成</h2>
        </div>
      </div>
      <div class="stat-row"><span class="pill">得分 ${score}</span><span class="pill">共 ${answers.length} 题</span><span class="pill">正确率 ${Math.round(score / answers.length * 100)}%</span>${coins ? `<span class="pill">金币 ${coins}</span>` : ''}${bestCombo > 1 ? `<span class="pill">最高 ${bestCombo} 连击</span>` : ''}</div>
      <table class="review"><thead><tr><th>题目</th><th>你的答案</th><th>正确答案</th><th>结果</th></tr></thead><tbody>${reviewRows(answers)}</tbody></table>
      <div class="dialog-actions"><button class="ghost" id="game-home">返回大厅</button><button id="game-retry">再玩一次</button></div>
    </section>
  `;
}

function gameTitlebar({ title, progress, hint, character = 'adventurer-idle' }) {
  return `
    <header class="game-topbar">
      <div class="game-topbar-copy">
        <div class="game-topbar-line">
          <h2 class="game-title">${title}</h2>
          <span class="game-progress">${progress}</span>
        </div>
        <p>${hint}</p>
      </div>
      <img class="game-avatar" src="assets/kenney/characters/${character}.png" alt="">
    </header>`;
}

export function createRunner(container, pack, audio, finish, onExit) {
  const items = [...pack.items].slice(0, 9);
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
          <div class="forest-hud-actions">
            <span class="forest-coins" title="本次冒险拾取的金币"><img src="assets/kenney/platformer/hud_coin.png" alt=""><b id="runner-coins">0</b></span>
            <button class="forest-pause" id="runner-pause" type="button"><span aria-hidden="true">Ⅱ</span> 暂停</button>
          </div>
        </div>
        <div class="forest-feedback" id="runner-feedback" hidden>
          <img id="runner-feedback-icon" src="assets/kenney/ui/icon-checkmark.png" alt="">
          <span id="runner-feedback-text"></span>
        </div>
        <div class="pause-overlay" id="runner-pause-panel" hidden>
          <div class="pause-card">
            <h2>林间休息</h2>
            <p>题目、门体和计时已冻结。</p>
            <div class="pause-actions">
              <button id="runner-resume" type="button">继续寻宝</button>
              <button class="ghost" id="runner-audio-test" type="button">音频测试</button>
              <button class="ghost" id="runner-settings" type="button">设置</button>
              <button class="ghost" id="runner-fullscreen" type="button">全屏</button>
              <button class="ghost" id="runner-exit" type="button">返回大厅</button>
            </div>
          </div>
        </div>
      </div>
      <div class="race-controls" aria-label="跑道控制">
        <button class="race-control" id="runner-left" data-lane="0" type="button"><span>← 左路</span><b>1</b></button>
        <button class="race-control" id="runner-middle" data-lane="1" type="button"><span>↑ 中路</span><b>2</b></button>
        <button class="race-control" id="runner-right" data-lane="2" type="button"><span>右路 →</span><b>3</b></button>
      </div>
      <p class="sr-only" id="runner-status" aria-live="polite">方向键变道，也可直接点击跑道。</p>
    </section>`;
  const runner = mountRunnerGame({
    container: container.querySelector('#runner-stage'),
    items,
    pack,
    effectVolume: audio.settings.effectVolume,
    onComplete: ({ score, answers, coins, bestCombo }) => {
      recordResult('runner', pack.id, score, items.length);
      finish(resultView({ game: '森林寻宝记', score, answers, coins, bestCombo }));
    }
  });
  const pauseButton = container.querySelector('#runner-pause');
  const pausePanel = container.querySelector('#runner-pause-panel');
  const status = container.querySelector('#runner-status');
  const controls = [...container.querySelectorAll('.race-control')];
  const prompt = container.querySelector('#runner-prompt');
  const goal = container.querySelector('#runner-goal');
  const area = container.querySelector('#runner-area');
  const stageCount = container.querySelector('#runner-stage-count');
  const dots = [...container.querySelectorAll('#runner-dots i')];
  const coins = container.querySelector('#runner-coins');
  const feedback = container.querySelector('#runner-feedback');
  const feedbackIcon = container.querySelector('#runner-feedback-icon');
  const feedbackText = container.querySelector('#runner-feedback-text');
  const standardControlLabels = ['← 左路', '↑ 中路', '右路 →'];
  const completeControlLabels = ['林间小径', '再走一次', '完成'];
  const runnerState = () => window.__learningGameDebug?.runner?.state();

  controls.forEach(button => {
    const lane = Number(button.dataset.lane);
    button.onclick = () => {
      const current = runnerState();
      if (current?.phase === 'complete') {
        if (lane === 0) onExit();
        if (lane === 1) runner.events.emit('restart');
        if (lane === 2) runner.events.emit('finish');
        return;
      }
      runner.events.emit('switch-lane', lane);
    };
  });

  pauseButton.onclick = () => {
    const state = runnerState();
    runner.events.emit(state?.phase === 'paused' ? 'resume' : 'pause');
  };
  container.querySelector('#runner-resume').onclick = () => runner.events.emit('resume');
  container.querySelector('#runner-audio-test').onclick = async () => {
    audio.effect('click');
    await audio.speech('audio/en/g3-en-01.wav');
  };
  container.querySelector('#runner-settings').onclick = () => {
    audio.effect('click');
    document.querySelector('#settings-open')?.click();
  };
  container.querySelector('#runner-fullscreen').onclick = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };
  container.querySelector('#runner-exit').onclick = () => {
    audio.effect('click');
    onExit();
  };
  runner.events.on('speak', path => {
    if (path) audio.speech(path);
  });
  runner.events.on('state', state => {
    const paused = state.phase === 'paused';
    const complete = state.phase === 'complete';
    audio.setMusicPaused(paused);
    pausePanel.hidden = !paused;
    pauseButton.innerHTML = paused ? '<span aria-hidden="true">▶</span> 继续' : '<span aria-hidden="true">Ⅱ</span> 暂停';
    pauseButton.disabled = complete;
    prompt.textContent = state.prompt || '准备出发';
    goal.textContent = state.goal || '看题选路，一路寻宝';
    area.textContent = state.areaName || '阳光林地';
    stageCount.textContent = complete ? '完成' : `${state.questionInStage} / ${state.stageSize}`;
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', complete || index <= state.stageIndex);
      dot.classList.toggle('current', !complete && index === state.stageIndex);
    });
    coins.textContent = String(state.coins);
    const showFeedback = Boolean(state.feedback?.visible) && !paused && !complete;
    feedback.hidden = !showFeedback;
    if (showFeedback) {
      const correct = state.feedback.kind === 'correct';
      feedback.className = `forest-feedback ${correct ? 'correct' : 'wrong'}`;
      feedbackIcon.src = correct ? 'assets/kenney/ui/icon-checkmark.png' : 'assets/kenney/ui/icon-cross.png';
      feedbackText.textContent = correct
        ? state.feedback.title || `+1 拾取·${state.prompt} 对应 ${state.options[state.correctLane]}`
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
    else if (complete) status.textContent = '抵达终点。可以选择再走一次或完成冒险。';
    else if (state.phase === 'feedback') status.textContent = state.feedback.body || '正在准备下一题。';
    else status.textContent = `第 ${state.index + 1} 题：${state.prompt}。`;
  });
  return () => {
    audio.stopSpeech();
    runner.destroy();
  };
}

export function createListen(container, pack, audio, finish) {
  const items = [...pack.items].slice(0, 10);
  let index = 0, score = 0;
  let locked = false;
  let nextTimer = null;
  const answers = [];
  function show() {
    const item = items[index];
    locked = false;
    container.innerHTML = `
      <section class="game-shell listen-shell">
        ${gameTitlebar({
          title: '听音找精灵',
          progress: `第 ${index + 1} / ${items.length} 题`,
          hint: '点击播放，选出听到的内容',
          character: 'adventurer-talk'
        })}
        <div class="game-content listen-content">
          <div class="question-text">听一听，选出正确内容</div>
          <button id="play" class="flat-primary">播放读音</button>
          <div class="three-grid"></div>
          <div class="feedback"></div>
        </div>
      </section>`;
    const options = container.querySelector('.three-grid');
    const feedback = container.querySelector('.feedback');
    optionList(item).forEach(value => {
      const button = document.createElement('button');
      button.className = 'large-option';
      button.textContent = value;
      button.dataset.value = value;
      button.onclick = async () => {
        if (locked) return;
        locked = true;
        const correct = value === item.correct;
        if (correct) { score += 1; audio.effect('correct'); } else audio.effect('wrong');
        feedback.className = `feedback ${correct ? 'correct' : 'wrong'}`;
        feedback.textContent = correct ? '答对了！进入下一题…' : `需要复习：正确答案是「${item.correct}」`;
        options.querySelectorAll('button').forEach(option => option.disabled = true);
        answers.push({ prompt: item.prompt, selected: value, correct: item.correct });
        index += 1;
        nextTimer = setTimeout(() => {
          if (index < items.length) show(); else {
            recordResult('listen', pack.id, score, items.length);
            finish(resultView({ game: '听音找精灵', score, answers }));
          }
        }, 780);
      };
      options.appendChild(button);
    });
    container.querySelector('#play').onclick = () => audio.speech(item.audio);
    window.__learningGameDebug = {
      ...(window.__learningGameDebug || {}),
      listen: {
        state: () => ({ index, score, locked, prompt: item.prompt, correct: item.correct }),
        choose: value => options.querySelector(`[data-value="${value}"]`)?.click()
      }
    };
  }
  show();
  return () => {
    clearTimeout(nextTimer);
    audio.stopSpeech();
    if (window.__learningGameDebug?.listen) delete window.__learningGameDebug.listen;
  };
}

export function createAssemble(container, pack, audio, finish) {
  const items = [...pack.items].slice(0, 10);
  let index = 0, score = 0, selected = [];
  let currentItem = null;
  const answers = [];
  function show() {
    const item = items[index];
    currentItem = item;
    selected = [];
    const letters = shuffle(item.correct.split(''));
    container.innerHTML = `
      <section class="game-shell">
        ${gameTitlebar({
          title: '拼音/单词拼装',
          progress: `第 ${index + 1} / ${items.length} 题`,
          hint: '点击字母填入，再确认答案',
          character: 'adventurer-idle'
        })}
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
    const feedback = container.querySelector('.feedback');
    const renderSlots = () => {
      slots.innerHTML = item.correct.split('').map((_, position) => `
        <button class="slot" type="button" data-position="${position}" ${selected[position] ? '' : 'disabled'}>${selected[position]?.letter || '·'}</button>
      `).join('');
    };
    letters.forEach((letter, position) => {
      const button = document.createElement('button');
      button.className = 'letter';
      button.textContent = letter;
      button.dataset.position = String(position);
      button.onclick = () => {
        if (selected.length >= item.correct.length) return;
        selected.push({ letter, position });
        button.disabled = true;
        renderSlots();
      };
      letterBox.appendChild(button);
    });
    slots.onclick = event => {
      const slot = event.target.closest('.slot');
      if (!slot || !selected[Number(slot.dataset.position)]) return;
      const removed = selected.splice(Number(slot.dataset.position), 1)[0];
      letterBox.querySelector(`[data-position="${removed.position}"]`)?.removeAttribute('disabled');
      renderSlots();
    };
    container.querySelector('#clear').onclick = () => {
      selected = [];
      [...letterBox.children].forEach(child => child.disabled = false);
      renderSlots();
    };
    container.querySelector('#confirm').onclick = () => {
      const value = selected.map(entry => entry.letter).join('');
      if (value.length !== item.correct.length) {
        feedback.className = 'feedback wrong';
        feedback.textContent = '请把完整答案拼好后再确认。';
        return;
      }
      const correct = value === item.correct;
      if (correct) { score += 1; audio.effect('correct'); } else audio.effect('wrong');
      feedback.className = `feedback ${correct ? 'correct' : 'wrong'}`;
      feedback.textContent = correct ? '拼装正确！' : `需要复习：正确拼写是「${item.correct}」`;
      answers.push({ prompt: item.prompt, selected: value, correct: item.correct });
      index += 1;
      setTimeout(() => {
        if (index < items.length) show(); else {
          recordResult('assemble', pack.id, score, items.length);
          finish(resultView({ game: '拼音/单词拼装', score, answers }));
        }
      }, 760);
    };
    renderSlots();
    window.__learningGameDebug = {
      ...(window.__learningGameDebug || {}),
      assemble: {
        state: () => ({ index, score, selected: selected.map(entry => entry.letter).join(''), correct: currentItem.correct }),
        solve: () => {
          container.querySelector('#clear').click();
          [...currentItem.correct].forEach(letter => {
            const button = [...letterBox.querySelectorAll('.letter:not(:disabled)')].find(candidate => candidate.textContent === letter);
            button?.click();
          });
          container.querySelector('#confirm').click();
        }
      }
    };
  }
  show();
  return () => {
    if (window.__learningGameDebug?.assemble) delete window.__learningGameDebug.assemble;
  };
}

export function createMemory(container, pack, audio, finish) {
  const items = [...pack.items].slice(0, 6);
  const cards = shuffle(items.flatMap(item => [
    { key: item.id, text: item.prompt, pair: item.correct },
    { key: item.id, text: item.correct, pair: item.prompt }
  ]));
  let opened = [], matched = 0, attempts = 0;
  let locked = false;
  let flipTimer = null;
  const answers = [];
  container.innerHTML = `
    <section class="game-shell">
      ${gameTitlebar({
        title: '记忆翻牌配对',
        progress: `已配 ${matched}/${items.length}`,
        hint: '翻出成对的字词与拼音/英文',
        character: 'adventurer-duck'
      })}
      <div class="game-content memory-content">
        <div class="memory-grid"></div>
        <div class="feedback">先翻两张牌，找出“字词”和“拼音/英文”的配对。</div>
      </div>
    </section>`;
  const grid = container.querySelector('.memory-grid');
  const feedback = container.querySelector('.feedback');
  cards.forEach((card, cardIndex) => {
    const button = document.createElement('button');
    button.className = 'memory-card';
    button.textContent = '?';
    button.dataset.index = String(cardIndex);
    button.dataset.key = card.key;
    button.dataset.text = card.text;
    button.onclick = () => {
      if (locked || opened.some(entry => entry.button === button) || button.classList.contains('matched')) return;
      button.textContent = card.text;
      button.classList.add('flipped');
      opened.push({ ...card, button });
      if (opened.length === 2) {
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
          container.querySelector('.game-progress').textContent = `已配 ${matched}/${items.length}`;
          if (matched === items.length) {
            recordResult('memory', pack.id, items.length, items.length);
            finish(resultView({ game: '记忆翻牌配对', score: items.length, answers }));
          }
        } else {
          locked = true;
          audio.effect('wrong');
          const current = opened;
          opened = [];
          feedback.className = 'feedback wrong';
          feedback.textContent = '不是一对，记住位置，稍后再试。';
          flipTimer = setTimeout(() => {
            current.forEach(entry => {
              entry.button.textContent = '?';
              entry.button.classList.remove('flipped');
            });
            locked = false;
          }, 760);
        }
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
        locked,
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
  return () => {
    clearTimeout(flipTimer);
    if (window.__learningGameDebug?.memory) delete window.__learningGameDebug.memory;
  };
}

export function createBeat(container, pack, audio, finish) {
  const poems = (pack.poems || []).slice(0, 2);
  const comprehension = {
    'poem-jingyesi': {
      before: '床前',
      after: '光',
      options: ['明月', '清风', '白云'],
      answer: '明月',
      hint: '第一句是“床前明月光”。'
    },
    'poem-chunxiao': {
      before: '处处闻',
      after: '',
      options: ['啼鸟', '花香', '钟声'],
      answer: '啼鸟',
      hint: '第二句是“处处闻啼鸟”。'
    }
  };
  let poemIndex = 0;
  let lineIndex = 0;
  let heardLines = new Set();
  let chosenAnswer = '';
  let finished = false;
  let feedback = { kind: '', text: '先选一首诗，再由老师带着逐句共读。' };
  const poem = () => poems[poemIndex];
  const practice = () => comprehension[poem().id];

  function draw() {
    const activePoem = poem();
    const quiz = practice();
    const heardCount = heardLines.size;
    container.innerHTML = `
      <section class="game-shell theater-shell">
        ${gameTitlebar({
          title: '诗词小剧场',
          progress: `${activePoem.title} · 第 ${lineIndex + 1} / ${activePoem.lines.length} 句`,
          hint: '老师控制共读进度，系统不冒充朗读发音评分',
          character: 'adventurer-talk'
        })}
        <div class="game-content theater-content">
          <div class="poetry-picker" role="tablist" aria-label="选择古诗">
            ${poems.map((item, index) => `
              <button class="poem-tab ${index === poemIndex ? 'active' : ''}" data-poem-index="${index}" type="button" role="tab" aria-selected="${index === poemIndex}">
                ${item.title}<span>${item.author}</span>
              </button>
            `).join('')}
          </div>
          <div class="theater-workbench">
            <section class="poetry-stage theme-${activePoem.id === 'poem-chunxiao' ? 'morning' : 'night'}" aria-label="${activePoem.title}共读场景">
              <img class="theater-sky" src="assets/kenney/platformer/background_solid_sky.png" alt="">
              <img class="theater-hills" src="assets/kenney/platformer/background_color_hills.png" alt="">
              <img class="theater-trees" src="assets/kenney/platformer/background_color_trees.png" alt="">
              <div class="poetry-scene-copy">
                <div class="poetry-heading">
                  <strong>${activePoem.title}</strong>
                  <span>${activePoem.author}</span>
                </div>
                <div class="poem-line-list" aria-label="诗句列表">
                  ${activePoem.lines.map((line, index) => `
                    <button class="poem-line ${index === lineIndex ? 'current' : ''} ${heardLines.has(index) ? 'heard' : ''}" data-line-index="${index}" type="button">
                      <span>${line}</span>
                      <i>${heardLines.has(index) ? '已共读' : ''}</i>
                    </button>
                  `).join('')}
                </div>
                <div class="poetry-read-hint">${heardCount === activePoem.lines.length ? '四句已共读，可以完成本诗。' : '点击诗句或“播放本句”，读完再进入下一句。'}</div>
              </div>
              <img class="poetry-speaker" src="assets/kenney/characters/adventurer-talk.png" alt="">
            </section>
            <aside class="poetry-practice">
              <span class="practice-label">诗句小挑战</span>
              <strong>${quiz.before}<em> ____ </em>${quiz.after}</strong>
              <div class="poetry-choices">
                ${quiz.options.map(option => `<button type="button" data-poem-answer="${option}" class="${chosenAnswer === option ? 'selected' : ''}">${option}</button>`).join('')}
              </div>
              <p id="poetry-practice-note">${chosenAnswer === quiz.answer ? quiz.hint : '补全诗句，再请一位同学朗读。'}</p>
            </aside>
          </div>
          <div class="theater-controls">
            <button class="ghost" id="poem-previous" type="button" ${lineIndex === 0 ? 'disabled' : ''}>← 上一句</button>
            <button id="poem-play" type="button">▶ 播放本句</button>
            <button class="ghost" id="poem-next" type="button" ${lineIndex === activePoem.lines.length - 1 ? 'disabled' : ''}>下一句 →</button>
            <button class="poetry-finish" id="poem-finish" type="button">完成共读</button>
          </div>
          <div class="feedback poetry-feedback ${feedback.kind}" id="poetry-feedback">${feedback.text}</div>
        </div>
      </section>`;

    container.querySelectorAll('[data-poem-index]').forEach(button => {
      button.onclick = () => selectPoem(Number(button.dataset.poemIndex));
    });
    container.querySelectorAll('[data-line-index]').forEach(button => {
      button.onclick = () => {
        lineIndex = Number(button.dataset.lineIndex);
        playCurrentLine();
      };
    });
    container.querySelectorAll('[data-poem-answer]').forEach(button => {
      button.onclick = () => choose(button.dataset.poemAnswer);
    });
    container.querySelector('#poem-previous').onclick = () => moveLine(-1);
    container.querySelector('#poem-next').onclick = () => moveLine(1);
    container.querySelector('#poem-play').onclick = () => playCurrentLine();
    container.querySelector('#poem-finish').onclick = () => finishPoem();
  }

  function selectPoem(index) {
    if (index === poemIndex || !poems[index]) return;
    audio.effect('click');
    audio.stopSpeech();
    poemIndex = index;
    lineIndex = 0;
    heardLines = new Set();
    chosenAnswer = '';
    feedback = { kind: '', text: `已选择《${poem().title}》。老师可点击“播放本句”开始共读。` };
    draw();
  }

  function playCurrentLine() {
    const activePoem = poem();
    const path = activePoem.lineAudio?.[lineIndex] || activePoem.audio;
    heardLines.add(lineIndex);
    feedback = {
      kind: 'correct',
      text: `正在范读第 ${lineIndex + 1} 句：${activePoem.lines[lineIndex]}`
    };
    audio.speech(path);
    draw();
  }

  function moveLine(delta) {
    const next = lineIndex + delta;
    if (next < 0 || next >= poem().lines.length) return;
    lineIndex = next;
    playCurrentLine();
  }

  function choose(answer) {
    const quiz = practice();
    if (chosenAnswer === quiz.answer) return;
    chosenAnswer = answer;
    const correct = answer === quiz.answer;
    feedback = correct
      ? { kind: 'correct', text: `补全正确：${quiz.before}${quiz.answer}${quiz.after}。` }
      : { kind: 'wrong', text: `再想一想：${quiz.hint}` };
    if (correct) audio.effect('correct');
    else audio.effect('wrong');
    draw();
  }

  function finishPoem() {
    if (finished) return;
    const activePoem = poem();
    const quiz = practice();
    if (heardLines.size < activePoem.lines.length) {
      feedback = { kind: 'wrong', text: `还有 ${activePoem.lines.length - heardLines.size} 句没有共读，请先逐句听读。` };
      audio.effect('wrong');
      draw();
      return;
    }
    if (chosenAnswer !== quiz.answer) {
      feedback = { kind: 'wrong', text: '请先完成诗句小挑战，再结束本诗共读。' };
      audio.effect('wrong');
      draw();
      return;
    }
    finished = true;
    const answers = activePoem.lines.map((line, index) => ({
      prompt: `《${activePoem.title}》第 ${index + 1} 句`,
      selected: heardLines.has(index) ? '已共读' : '未共读',
      correct: '已共读'
    }));
    answers.push({
      prompt: `${quiz.before} ____ ${quiz.after}`,
      selected: chosenAnswer,
      correct: quiz.answer
    });
    const score = heardLines.size + (chosenAnswer === quiz.answer ? 1 : 0);
    recordResult('beat', pack.id, score, answers.length);
    audio.effect('correct');
    finish(resultView({ game: `诗词小剧场 · ${activePoem.title}`, score, answers }));
  }

  draw();
  window.__learningGameDebug = {
    ...(window.__learningGameDebug || {}),
    beat: {
      state: () => ({
        poemId: poem().id,
        title: poem().title,
        lineIndex,
        heardLines: [...heardLines],
        chosenAnswer,
        finished
      }),
      selectPoem: id => {
        const index = poems.findIndex(item => item.id === id);
        if (index >= 0) selectPoem(index);
      },
      play: () => playCurrentLine(),
      next: () => moveLine(1),
      previous: () => moveLine(-1),
      choose: answer => choose(answer),
      finish: () => finishPoem()
    }
  };
  return () => {
    audio.stopSpeech();
    if (window.__learningGameDebug?.beat) delete window.__learningGameDebug.beat;
  };
}

export function createBattle(container, pack, audio, finish) {
  const pool = [...pack.items, ...pack.items].slice(0, 10);
  let index = 0, turn = 0, score = [0, 0];
  let selected = '';
  let locked = false;
  let advanceTimer = null;
  const answers = [];
  container.innerHTML = `
    <section class="game-shell">
      ${gameTitlebar({
        title: '小组知识守护战',
        progress: '老师确认答案',
        hint: '两组轮流答题，确认后计分',
        character: 'adventurer-cheer0'
      })}
      <div class="game-content battle-content">
        <div class="battle-arena">
          <div class="team team-blue active" id="team0"><img src="assets/kenney/platformer/flag_blue_b.png" alt=""><strong>蓝队</strong><div class="energy"><span></span></div></div>
          <div class="team team-amber" id="team1"><img src="assets/kenney/platformer/flag_yellow_a.png" alt=""><strong>琥珀队</strong><div class="energy"><span></span></div></div>
        </div>
        <div class="question-text" id="prompt"></div>
        <div class="option-grid"></div>
        <div class="game-actions"><button id="teacher-correct">老师确认正确</button><button class="danger" id="teacher-wrong">老师判定需复习</button></div>
        <div class="feedback">先选择答案，再由老师确认。</div>
      </div>
    </section>`;
  const optionGrid = container.querySelector('.option-grid');
  const feedback = container.querySelector('.feedback');
  function show() {
    const item = pool[index];
    container.querySelector('#prompt').textContent = item.prompt;
    optionGrid.innerHTML = '';
    selected = '';
    locked = false;
    feedback.className = 'feedback';
    feedback.textContent = `请第 ${turn + 1} 组选择答案，再由老师确认。`;
    optionList(item).forEach(value => {
      const button = document.createElement('button');
      button.className = 'large-option';
      button.textContent = value;
      button.dataset.value = value;
      button.onclick = () => {
        if (locked) return;
        selected = value;
        optionGrid.querySelectorAll('button').forEach(candidate => candidate.classList.toggle('selected-option', candidate === button));
        feedback.className = 'feedback';
        feedback.textContent = `已选择「${value}」，等待老师确认。`;
      };
      optionGrid.appendChild(button);
    });
  }
  function judge(teacherCorrect) {
    if (locked) return;
    if (!selected) {
      feedback.className = 'feedback wrong';
      feedback.textContent = '请先选择一个答案，再由老师确认。';
      return;
    }
    locked = true;
    const item = pool[index];
    const actual = selected === item.correct;
    const awarded = teacherCorrect && actual;
    if (awarded) { score[turn] += 1; audio.effect('correct'); } else audio.effect('wrong');
    feedback.className = `feedback ${awarded ? 'correct' : 'wrong'}`;
    feedback.textContent = awarded
      ? `第 ${turn + 1} 组得分！正确答案是「${item.correct}」。`
      : `本题需复习，正确答案是「${item.correct}」。`;
    answers.push({ prompt: item.prompt, selected, correct: item.correct });
    optionGrid.querySelectorAll('button').forEach(button => button.disabled = true);
    advanceTimer = setTimeout(() => {
      turn = 1 - turn;
      container.querySelector('#team0').classList.toggle('active', turn === 0);
      container.querySelector('#team1').classList.toggle('active', turn === 1);
      container.querySelector('#team0 .energy span').style.width = `${score[0] / pool.length * 100}%`;
      container.querySelector('#team1 .energy span').style.width = `${score[1] / pool.length * 100}%`;
      index += 1;
      if (index < pool.length) show(); else {
        recordResult('battle', pack.id, score[0] + score[1], pool.length);
        finish(resultView({ game: '小组知识守护战', score: score[0] + score[1], answers }));
      }
    }, 760);
  }
  container.querySelector('#teacher-correct').onclick = () => judge(true);
  container.querySelector('#teacher-wrong').onclick = () => judge(false);
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
        correct: pool[index]?.correct
      }),
      select: value => optionGrid.querySelector(`[data-value="${value}"]`)?.click(),
      judgeCorrect: () => judge(true),
      judgeWrong: () => judge(false)
    }
  };
  return () => {
    clearTimeout(advanceTimer);
    if (window.__learningGameDebug?.battle) delete window.__learningGameDebug.battle;
  };
}
