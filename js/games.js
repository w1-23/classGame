import { AudioManager } from './audio.js';
import { recordResult } from './storage.js';

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

function resultView({ game, score, answers, retry, home }) {
  return `
    <section class="result">
      <h2>${game}完成</h2>
      <div class="stat-row"><span class="pill">得分 ${score}</span><span class="pill">共 ${answers.length} 题</span><span class="pill">正确率 ${Math.round(score / answers.length * 100)}%</span></div>
      <table class="review"><thead><tr><th>题目</th><th>你的答案</th><th>正确答案</th><th>结果</th></tr></thead><tbody>${reviewRows(answers)}</tbody></table>
      <div class="dialog-actions"><button class="ghost" id="game-home">返回大厅</button><button id="game-retry">再玩一次</button></div>
    </section>
  `;
}

export function createRunner(container, pack, audio, finish) {
  const items = [...pack.items].slice(0, 10);
  let index = 0, score = 0, lane = 1, gateTimer = null, moving = false;
  const answers = [];
  let gate = null;
  container.innerHTML = `
    <section class="game-shell">
      <div class="game-header"><h2 class="game-title">三道门跑酷</h2><button id="pause">暂停</button></div>
      <div class="progress"><span style="width:0"></span></div>
      <div class="runner">
        <div class="lanes">
          <button class="lane" type="button" data-lane="0" aria-label="第一条跑道"></button>
          <button class="lane" type="button" data-lane="1" aria-label="第二条跑道"></button>
          <button class="lane" type="button" data-lane="2" aria-label="第三条跑道"></button>
        </div>
        <div class="runner-player"><img class="runner-animation" src="assets/mascot-run.svg" alt="奔跑中的知识岛小精灵"></div>
      </div>
      <div class="question-card"><div class="question-text" id="prompt"></div><div class="hint">用 ← ↑ →、屏幕按钮或点击跑道选答案</div></div>
      <div class="controls"><button class="ghost" id="left">←</button><button class="ghost" id="up">↑</button><button class="ghost" id="right">→</button></div>
    </section>`;
  const player = container.querySelector('.runner-player');
  const progress = container.querySelector('.progress span');

  function placePlayer() {
    player.style.top = `calc(${lane + 0.5} / 3 * 100% - 50px)`;
  }

  function showQuestion() {
    const item = items[index];
    container.querySelector('#prompt').textContent = item.prompt;
    progress.style.width = `${index / items.length * 100}%`;
    const options = optionList(item);
    gate = document.createElement('div');
    gate.className = 'gate';
    gate.innerHTML = options.map((option, optionLane) => `
      <div class="gate-option" data-lane="${optionLane}"><span>${option}</span></div>
    `).join('');
    container.querySelector('.runner').appendChild(gate);
    const startTime = performance.now();
    moving = true;
    let current = 0;
    gateTimer = requestAnimationFrame(function move() {
      if (!moving) return;
      const elapsed = performance.now() - startTime;
      current = Math.min(1, elapsed / 4200);
      const runnerWidth = container.querySelector('.runner').clientWidth;
      const gateWidth = Math.max(360, Math.min(520, runnerWidth * 0.55));
      const distance = runnerWidth - player.offsetLeft - 20 + gateWidth;
      gate.style.width = `${gateWidth}px`;
      gate.style.right = `${-gateWidth + current * distance}px`;
      if (current < 1) {
        gateTimer = requestAnimationFrame(move);
      } else {
        moving = false;
        gate.remove();
        container.querySelector('.feedback')?.remove();
        const feedback = document.createElement('div');
        feedback.className = 'feedback wrong';
        feedback.textContent = '时间到：请先选择答案，再点击“继续”。';
        container.querySelector('.question-card').appendChild(feedback);
        const retryButton = document.createElement('button');
        retryButton.className = 'warning';
        retryButton.textContent = '继续下一题';
          retryButton.onclick = () => {
          answers.push({ prompt: item.prompt, selected: '未作答', correct: item.correct });
          index += 1;
          retryButton.remove();
          feedback.remove();
          if (index < items.length) showQuestion();
          else {
            recordResult('runner', pack.id, score, items.length);
            finish(resultView({ game: '三道门跑酷', score, answers }));
          }
        };
        container.querySelector('.question-card').appendChild(retryButton);
      }
    });
  }

  function submit(selected, deliberate, item = items[index]) {
    if (!moving) return;
    moving = false;
    cancelAnimationFrame(gateTimer);
    const correct = selected === item.correct;
    if (correct) {
      score += 1;
      audio.effect('correct');
    } else {
      audio.effect('wrong');
    }
    answers.push({ prompt: item.prompt, selected, correct: item.correct });
    index += 1;
    if (index < items.length) {
      setTimeout(showQuestion, 700);
    } else {
      recordResult('runner', pack.id, score, items.length);
      finish(resultView({ game: '三道门跑酷', score, answers }));
    }
  }

  function changeLane(next) {
    if (!moving) return;
    lane = Math.max(0, Math.min(2, next));
    placePlayer();
    const selected = gate?.querySelector(`.gate-option[data-lane="${lane}"]`)?.textContent;
    if (selected) submit(selected, true);
  }

  container.querySelectorAll('.lane').forEach((laneButton) => {
    laneButton.onclick = () => changeLane(Number(laneButton.dataset.lane));
  });
  container.querySelector('#left').onclick = () => changeLane(lane - 1);
  container.querySelector('#right').onclick = () => changeLane(lane + 1);
  container.querySelector('#up').onclick = () => changeLane(1);
  container.querySelector('#pause').onclick = () => { moving = false; cancelAnimationFrame(gateTimer); };
  document.addEventListener('keydown', runnerKeys);
  function runnerKeys(event) {
    if (event.key === 'ArrowLeft') changeLane(lane - 1);
    if (event.key === 'ArrowRight') changeLane(lane + 1);
    if (event.key === 'ArrowUp') changeLane(1);
  }
  placePlayer();
  showQuestion();
  return () => document.removeEventListener('keydown', runnerKeys);
}

export function createListen(container, pack, audio, finish) {
  const items = [...pack.items].slice(0, 10);
  let index = 0, score = 0;
  const answers = [];
  function show() {
    const item = items[index];
    container.innerHTML = `
      <section class="game-shell">
        <div class="game-header"><h2 class="game-title">听音找精灵</h2><span class="pill">${index + 1}/${items.length}</span></div>
        <div class="question-card"><div class="question-text">听音频，选择对应内容</div><button id="play">播放音频</button><div class="four-grid"></div></div>
        <div class="feedback"></div>
      </section>`;
    const options = container.querySelector('.four-grid');
    optionList(item).forEach(value => {
      const button = document.createElement('button');
      button.className = 'large-option';
      button.textContent = value;
      button.onclick = () => {
        const correct = value === item.correct;
        if (correct) { score += 1; audio.effect('correct'); } else audio.effect('wrong');
        answers.push({ prompt: item.prompt, selected: value, correct: item.correct });
        index += 1;
        if (index < items.length) show(); else {
          recordResult('listen', pack.id, score, items.length);
          finish(resultView({ game: '听音找精灵', score, answers }));
        }
      };
      options.appendChild(button);
    });
    container.querySelector('#play').onclick = () => audio.speech(item.audio);
  }
  show();
}

export function createAssemble(container, pack, audio, finish) {
  const items = [...pack.items].slice(0, 10);
  let index = 0, score = 0, selected = [];
  const answers = [];
  function show() {
    const item = items[index];
    selected = [];
    const letters = shuffle(item.correct.split(''));
    container.innerHTML = `
      <section class="game-shell">
        <div class="game-header"><h2 class="game-title">拼装挑战</h2><span class="pill">${index + 1}/${items.length}</span></div>
        <div class="question-card"><div class="question-text">${item.prompt}</div><div class="slots" id="slots"></div><div class="letters" id="letters"></div><div class="dialog-actions"><button class="ghost" id="clear">清空</button><button id="confirm">确认</button></div><div class="feedback"></div></div>
      </section>`;
    const slots = container.querySelector('#slots');
    const letterBox = container.querySelector('#letters');
    letters.forEach((letter, position) => {
      const button = document.createElement('button');
      button.className = 'letter';
      button.textContent = letter;
      button.onclick = () => {
        selected.push({ letter, position });
        slots.textContent = selected.map(entry => entry.letter).join('');
        button.disabled = true;
      };
      letterBox.appendChild(button);
    });
    container.querySelector('#clear').onclick = () => { selected = []; slots.textContent = ''; [...letterBox.children].forEach(child => child.disabled = false); };
    container.querySelector('#confirm').onclick = () => {
      const value = selected.map(entry => entry.letter).join('');
      const correct = value === item.correct;
      if (correct) { score += 1; audio.effect('correct'); } else audio.effect('wrong');
      answers.push({ prompt: item.prompt, selected: value, correct: item.correct });
      index += 1;
      if (index < items.length) show(); else {
        recordResult('assemble', pack.id, score, items.length);
        finish(resultView({ game: '拼装挑战', score, answers }));
      }
    };
  }
  show();
}

export function createMemory(container, pack, audio, finish) {
  const items = [...pack.items].slice(0, 6);
  const cards = shuffle(items.flatMap(item => [
    { key: item.id, text: item.prompt, pair: item.correct },
    { key: item.id, text: item.correct, pair: item.prompt }
  ]));
  let opened = [], matched = 0, attempts = 0;
  container.innerHTML = `
    <section class="game-shell">
      <div class="game-header"><h2 class="game-title">记忆翻牌配对</h2><span class="pill">已配 ${matched}/${items.length}</span></div>
      <div class="memory-grid"></div><div class="feedback"></div>
    </section>`;
  container.innerHTML = `
    <section class="game-shell">
      <div class="game-header"><h2 class="game-title">记忆翻牌配对</h2><span class="pill">已配 ${matched}/${items.length}</span></div>
      <div class="memory-grid"></div><div class="feedback"></div>
    </section>`;
  const grid = container.querySelector('.memory-grid');
  cards.forEach(card => {
    const button = document.createElement('button');
    button.className = 'memory-card';
    button.textContent = '?';
    button.onclick = () => {
      if (opened.some(entry => entry.button === button) || button.classList.contains('matched')) return;
      button.textContent = card.text;
      opened.push({ ...card, button });
      if (opened.length === 2) {
        attempts += 1;
        const [first, second] = opened;
        if (first.key === second.key && first.text !== second.text) {
          matched += 1;
          first.button.classList.add('matched');
          second.button.classList.add('matched');
          audio.effect('correct');
          opened = [];
          container.querySelector('.pill').textContent = `已配 ${matched}/${items.length}`;
          if (matched === items.length) {
            const score = Math.max(1, Math.round(items.length * 2 - attempts * .3));
            recordResult('memory', pack.id, score, items.length);
            finish(resultView({ game: '记忆翻牌配对', score, answers: cards.map(card => ({ prompt: card.text, selected: card.pair, correct: card.pair })) }));
          }
        } else {
          audio.effect('wrong');
          const current = opened;
          setTimeout(() => current.forEach(entry => { entry.button.textContent = '?'; }), 700);
          opened = [];
        }
      }
    };
    grid.appendChild(button);
  });
}

export function createBeat(container, pack, audio, finish) {
  const poem = pack.poems[0];
  const characters = poem.lines.join('').split('');
  const targetCount = Math.min(20, characters.length);
  let index = 0, score = 0, timer = null, active = null, stopped = false;
  const answers = [];
  container.innerHTML = `
    <section class="game-shell">
      <div class="game-header"><h2 class="game-title">古诗朗读节拍</h2><span class="pill">点击、空格或触屏击打</span></div>
      <div class="beat-arena"><div class="beat-line"></div><div class="poem">${poem.title} · ${poem.author}<br>${poem.lines.join('<br>')}</div></div>
      <div class="dialog-actions"><button class="ghost" id="beat-start">开始</button><button id="beat-hit">击打</button></div>
      <div class="feedback">节拍判定不代表朗读发音评分，老师可听后确认。</div>
    </section>`;
  const arena = container.querySelector('.beat-arena');
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
        if (index < targetCount) setTimeout(spawnNote, 450); else complete();
      } else timer = requestAnimationFrame(frame);
    };
    timer = requestAnimationFrame(frame);
  }

  function hit() {
    if (!active) return;
    const progress = (performance.now() - active.born) / noteSpeed;
    const correct = progress >= .82 && progress <= 1.02;
    if (correct) { score += 1; active.note.classList.add('hit'); audio.effect('correct'); } else audio.effect('wrong');
    answers.push({ prompt: active.character, selected: correct ? '合拍' : '偏快', correct: '合拍' });
    active.note.remove(); active = null; index += 1;
    if (index < targetCount) setTimeout(spawnNote, 450); else complete();
  }

  function complete() {
    stopped = true; cancelAnimationFrame(timer);
    recordResult('beat', pack.id, score, targetCount);
    finish(resultView({ game: '古诗朗读节拍', score, answers }));
  }

  container.querySelector('#beat-start').onclick = () => { audio.speech(poem.audio); setTimeout(spawnNote, 600); };
  container.querySelector('#beat-hit').onclick = hit;
  document.addEventListener('keydown', beatKeys);
  function beatKeys(event) { if (event.code === 'Space') { event.preventDefault(); hit(); } }
  return () => { stopped = true; cancelAnimationFrame(timer); document.removeEventListener('keydown', beatKeys); };
}

export function createBattle(container, pack, audio, finish) {
  const pool = [...pack.items, ...pack.items].slice(0, 10);
  let index = 0, turn = 0, score = [0, 0];
  const answers = [];
  container.innerHTML = `
    <section class="game-shell">
      <div class="game-header"><h2 class="game-title">小组知识守护战</h2><span class="pill">老师确认答案</span></div>
      <div class="battle-arena"><div class="team active" id="team0"><strong>第一组</strong><div class="energy"><span></span></div></div><div class="team" id="team1"><strong>第二组</strong><div class="energy"><span></span></div></div></div>
      <div class="question-card"><div class="question-text" id="prompt"></div><div class="option-grid"></div><div class="dialog-actions"><button id="teacher-correct">老师确认正确</button><button class="danger" id="teacher-wrong">老师判定需复习</button></div></div>
      <div class="feedback"></div>
    </section>`;
  const optionGrid = container.querySelector('.option-grid');
  let selected = '';
  function show() {
    const item = pool[index];
    container.querySelector('#prompt').textContent = item.prompt;
    optionGrid.innerHTML = '';
    selected = '';
    optionList(item).forEach(value => {
      const button = document.createElement('button');
      button.className = 'large-option';
      button.textContent = value;
      button.onclick = () => selected = value;
      optionGrid.appendChild(button);
    });
  }
  function judge(correct) {
    const item = pool[index];
    const actual = correct && selected === item.correct;
    if (actual) { score[turn] += 1; audio.effect('correct'); } else audio.effect('wrong');
    answers.push({ prompt: item.prompt, selected, correct: item.correct });
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
  }
  container.querySelector('#teacher-correct').onclick = () => judge(true);
  container.querySelector('#teacher-wrong').onclick = () => judge(false);
  show();
}
