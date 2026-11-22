import { AudioManager } from './audio.js';
import { recordResult } from './storage.js';
import { mountRunnerGame } from './runner-phaser.js';

export const GAME_META = [
  { id: 'runner', name: '三道门跑酷', type: 'personal' },
  { id: 'listen', name: '听音找精灵', type: 'personal' },
  { id: 'assemble', name: '拼音/单词拼装', type: 'personal' },
  { id: 'memory', name: '记忆翻牌配对', type: 'personal' },
  { id: 'beat', name: '古诗朗读节拍', type: 'class' },
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
  const items = [...pack.items].slice(0, 10);
  container.innerHTML = `
    <section class="race-shell" data-game="runner">
      <header class="runner-hud" id="runner-hud">
        <div class="runner-hud-title">
          <strong>三道门跑酷</strong>
          <span id="runner-progress">第 1 / 10 题</span>
        </div>
        <div class="runner-prompt" id="runner-prompt">准备出发</div>
        <div class="runner-hud-stats">
          <span id="runner-score">得分 0</span>
          <span class="runner-coins"><img src="assets/kenney/platformer/hud_coin.png" alt=""><b id="runner-coins">0</b></span>
          <span class="runner-combo" id="runner-combo" hidden></span>
        </div>
        <button class="runner-pause" id="runner-pause" type="button">暂停</button>
        <div class="runner-progress-track" aria-hidden="true"><span id="runner-progress-bar"></span></div>
      </header>
      <div class="runner-stage" id="runner-stage" aria-label="三道门跑酷游戏场景"></div>
      <div class="race-controls" aria-label="跑道控制">
        <button class="race-control" id="runner-left" data-lane="0" type="button"><img src="assets/kenney/ui/arrow-left.png" alt=""><span>左道</span></button>
        <button class="race-control" id="runner-middle" data-lane="1" type="button"><span>中间</span></button>
        <button class="race-control" id="runner-right" data-lane="2" type="button"><span>右道</span><img src="assets/kenney/ui/arrow-right.png" alt=""></button>
      </div>
      <div class="pause-overlay" id="runner-pause-panel" hidden>
        <div class="pause-card">
          <h2>游戏暂停</h2>
          <p>题目、门体和计时已冻结。</p>
          <div class="pause-actions">
            <button id="runner-resume" type="button">继续游戏</button>
            <button class="ghost" id="runner-audio-test" type="button">音频测试</button>
            <button class="ghost" id="runner-settings" type="button">设置</button>
            <button class="ghost" id="runner-fullscreen" type="button">全屏</button>
            <button class="ghost" id="runner-exit" type="button">返回大厅</button>
          </div>
        </div>
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
      finish(resultView({ game: '三道门跑酷', score, answers, coins, bestCombo }));
    }
  });
  container.querySelector('#runner-left').onclick = () => runner.events.emit('switch-lane', 0);
  container.querySelector('#runner-middle').onclick = () => runner.events.emit('switch-lane', 1);
  container.querySelector('#runner-right').onclick = () => runner.events.emit('switch-lane', 2);
  const pauseButton = container.querySelector('#runner-pause');
  const pausePanel = container.querySelector('#runner-pause-panel');
  const status = container.querySelector('#runner-status');
  const controls = [...container.querySelectorAll('.race-control')];
  const prompt = container.querySelector('#runner-prompt');
  const progress = container.querySelector('#runner-progress');
  const progressBar = container.querySelector('#runner-progress-bar');
  const score = container.querySelector('#runner-score');
  const coins = container.querySelector('#runner-coins');
  const combo = container.querySelector('#runner-combo');
  pauseButton.onclick = () => {
    const state = window.__learningGameDebug?.runner?.state();
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
  runner.events.on('state', state => {
    const paused = state.phase === 'paused';
    audio.setMusicPaused(paused);
    pausePanel.hidden = !paused;
    pauseButton.textContent = paused ? '继续' : '暂停';
    pauseButton.disabled = ['resolved', 'complete'].includes(state.phase);
    prompt.textContent = state.prompt || '准备出发';
    progress.textContent = `第 ${state.index + 1} / ${state.total} 题`;
    score.textContent = `得分 ${state.score}`;
    coins.textContent = String(state.coins);
    combo.hidden = state.combo <= 1;
    combo.textContent = state.combo > 1 ? `${state.combo} 连击` : '';
    const remaining = state.phase === 'resolved' ? 0 : 1 - state.gateProgress;
    progressBar.style.width = `${Math.max(0, remaining) * 100}%`;
    controls.forEach(button => button.classList.toggle('active', Number(button.dataset.lane) === state.lane));
    if (paused) status.textContent = '游戏已暂停。';
    else if (state.phase === 'resolved') status.textContent = '本题结束，请查看反馈并继续下一题。';
    else status.textContent = `第 ${state.index + 1} 题：${state.prompt}。`;
  });
  return () => runner.destroy();
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
  const poem = pack.poems[0];
  const characters = poem.lines.join('').split('');
  const targetCount = Math.min(20, characters.length);
  let index = 0, score = 0, timer = null, spawnTimer = null, active = null, stopped = false;
  const answers = [];
  container.innerHTML = `
    <section class="game-shell">
      ${gameTitlebar({
        title: '古诗朗读节拍',
        progress: '点击、空格或触屏击打',
        hint: '只判断节拍窗口，不冒充朗读发音评分',
        character: 'adventurer-talk'
      })}
      <div class="game-content beat-content">
        <div class="beat-arena"><div class="beat-line"></div><div class="poem">${poem.title} · ${poem.author}<br>${poem.lines.join('<br>')}</div></div>
        <div class="game-actions"><button class="ghost" id="beat-start">播放范读并开始</button><button id="beat-hit">击打</button></div>
        <div class="feedback">节拍判定不代表朗读发音评分，老师可听后确认。</div>
      </div>
    </section>`;
  const arena = container.querySelector('.beat-arena');
  const feedback = container.querySelector('.feedback');
  const noteSpeed = 2600;

  function spawnNote() {
    if (stopped || index >= targetCount) return;
    const character = characters[index];
    const note = document.createElement('div');
    note.className = 'beat-note';
    note.textContent = character;
    note.style.top = `${Math.random() * (arena.clientHeight - 100)}px`;
    arena.appendChild(note);
    active = { note, born: performance.now(), character };
    const frame = () => {
      if (stopped || !active) return;
      const progress = (performance.now() - active.born) / noteSpeed;
      active.note.style.right = `${-80 + progress * (arena.clientWidth + 80)}px`;
      if (progress > .88 && progress < .96) active.note.classList.add('near');
      if (progress >= 1) {
        answers.push({ prompt: character, selected: '错过', correct: character });
        active.note.remove(); active = null; index += 1;
        feedback.className = 'feedback wrong';
        feedback.textContent = `错过节拍：${character}`;
        if (index < targetCount) spawnTimer = setTimeout(spawnNote, 450); else complete();
      } else timer = requestAnimationFrame(frame);
    };
    timer = requestAnimationFrame(frame);
  }

  function hit(forcedProgress = null) {
    if (!active) return;
    const progress = forcedProgress ?? (performance.now() - active.born) / noteSpeed;
    const correct = progress >= .82 && progress <= 1.02;
    if (correct) { score += 1; active.note.classList.add('hit'); audio.effect('correct'); } else audio.effect('wrong');
    feedback.className = `feedback ${correct ? 'correct' : 'wrong'}`;
    feedback.textContent = correct ? `合拍！${active.character}` : progress < .82 ? '稍快了，看黄色判定区再击打。' : '稍慢了，继续跟住节拍。';
    answers.push({ prompt: active.character, selected: correct ? '合拍' : '偏快', correct: '合拍' });
    active.note.remove(); active = null; index += 1;
    if (index < targetCount) spawnTimer = setTimeout(spawnNote, 450); else complete();
  }

  function complete() {
    stopped = true; cancelAnimationFrame(timer);
    clearTimeout(spawnTimer);
    recordResult('beat', pack.id, score, targetCount);
    finish(resultView({ game: '古诗朗读节拍', score, answers }));
  }

  container.querySelector('#beat-start').onclick = () => {
    if (active || index > 0) return;
    audio.speech(poem.audio);
    spawnTimer = setTimeout(spawnNote, 600);
  };
  container.querySelector('#beat-hit').onclick = () => hit();
  document.addEventListener('keydown', beatKeys);
  function beatKeys(event) { if (event.code === 'Space') { event.preventDefault(); hit(); } }
  window.__learningGameDebug = {
    ...(window.__learningGameDebug || {}),
    beat: {
      state: () => ({
        index,
        score,
        active: Boolean(active),
        progress: active ? (performance.now() - active.born) / noteSpeed : null
      }),
      startNote: () => spawnNote(),
      hitAt: progress => hit(progress)
    }
  };
  return () => {
    stopped = true;
    cancelAnimationFrame(timer);
    clearTimeout(spawnTimer);
    document.removeEventListener('keydown', beatKeys);
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
