import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLearningFeedback } from '../js/learning-feedback.mjs';

// Minimal DOM/timer adapters, deliberately no browser/layout claims.
class ElementStub {
  constructor(classes = []) {
    this.attributes = new Map();
    this.children = [];
    this.sourceWrites = [];
    this.classes = new Set(classes);
    this.classList = {
      add: (...values) => values.forEach(value => this.classes.add(value)),
      remove: (...values) => values.forEach(value => this.classes.delete(value)),
      contains: value => this.classes.has(value)
    };
    this.properties = new Map();
    this.style = {
      setProperty: (key, value) => this.properties.set(key, value),
      removeProperty: key => this.properties.delete(key)
    };
  }
  append(child) { this.children.push(child); return child; }
  contains(target) { return target === this || this.children.some(child => child.contains(target)); }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
    if (key === 'src') this.sourceWrites.push(value);
  }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
}

function fakeClock() {
  let time = 0;
  let sequence = 0;
  const pending = new Map();
  return {
    now: () => time,
    setTimeout(callback, delay) {
      const id = ++sequence;
      pending.set(id, { at: time + delay, callback });
      return id;
    },
    clearTimeout: id => pending.delete(id),
    count: () => pending.size,
    advance(milliseconds) {
      const until = time + milliseconds;
      let guard = 0;
      while (pending.size) {
        const [id, entry] = [...pending].sort((a, b) => a[1].at - b[1].at)[0];
        if (entry.at > until) break;
        if (++guard > 1000) throw new Error('Unexpected timer loop');
        time = entry.at;
        pending.delete(id);
        entry.callback();
      }
      time = until;
    }
  };
}

function fakeMedia(initial = false) {
  const listeners = new Set();
  return {
    matches: initial,
    addEventListener: (name, callback) => listeners.add(callback),
    removeEventListener: (name, callback) => listeners.delete(callback),
    count: () => listeners.size,
    change(matches) {
      this.matches = matches;
      listeners.forEach(callback => callback({ matches }));
    }
  };
}

function fixture(reduced = false) {
  const root = new ElementStub();
  const target = root.append(new ElementStub(['memory-card', 'matched']));
  const clock = fakeClock();
  const media = fakeMedia(reduced);
  const fx = createLearningFeedback(root, { clock, mediaQuery: media });
  return { root, target, clock, media, fx };
}

test('finite pair cue preserves real matched state and leaves no timer', () => {
  const { target, clock, fx } = fixture();
  let completed = 0;
  fx.trigger('pair', { targets: target, onEnd: () => completed++ });
  assert.equal(target.classList.contains('lf-pair'), true);
  clock.advance(399);
  assert.equal(completed, 0);
  clock.advance(1);
  assert.equal(completed, 1);
  assert.equal(target.classList.contains('matched'), true);
  assert.equal(target.classList.contains('lf-fx'), false);
  assert.equal(clock.count(), 0);
  assert.equal(fx.snapshot().phase, 'idle');
  fx.destroy();
});

test('pause preserves remaining duration; paused triggers are rejected', () => {
  const { root, target, clock, fx } = fixture();
  let completed = 0;
  fx.trigger('correct', { targets: target, duration: 400, onEnd: () => completed++ });
  clock.advance(110);
  fx.pause();
  assert.equal(root.getAttribute('data-lf-paused'), 'true');
  assert.equal(fx.snapshot().remaining, 290);
  assert.equal(fx.trigger('select', { targets: target }).reason, 'paused');
  clock.advance(8000);
  assert.equal(completed, 0);
  assert.equal(clock.count(), 0);
  assert.equal(fx.snapshot().remaining, 290);
  fx.resume();
  clock.advance(289);
  assert.equal(completed, 0);
  clock.advance(1);
  assert.equal(completed, 1);
  fx.destroy();
});

test('sprite frame clock freezes, resumes, then returns to idle', () => {
  const { root, target, clock, fx } = fixture();
  const sprite = root.append(new ElementStub());
  const frames = ['assets/spirits/kenney/bee_a.png', 'assets/spirits/kenney/bee_b.png'];
  const idle = 'assets/spirits/kenney/bee_rest.png';
  fx.trigger('reveal', { targets: target, duration: 1000, sprite: { element: sprite, frames, idle, frameMs: 220 } });
  assert.equal(sprite.getAttribute('src'), frames[0]);
  clock.advance(220);
  assert.equal(sprite.getAttribute('src'), frames[1]);
  fx.pause();
  const writes = sprite.sourceWrites.length;
  clock.advance(5000);
  assert.equal(sprite.sourceWrites.length, writes);
  fx.resume();
  clock.advance(220);
  assert.equal(sprite.getAttribute('src'), frames[0]);
  clock.advance(560);
  assert.equal(sprite.getAttribute('src'), idle);
  assert.equal(clock.count(), 0);
  fx.destroy();
});

test('a newer cue cancels the old completion, while an explicit cancel never completes', () => {
  const { target, clock, fx } = fixture();
  const completed = [];
  fx.trigger('slot', { targets: target, onEnd: () => completed.push('old') });
  clock.advance(50);
  fx.trigger('correct', { targets: target, onEnd: () => completed.push('new') });
  assert.equal(target.classList.contains('lf-slot'), false);
  clock.advance(400);
  assert.deepEqual(completed, ['new']);
  fx.trigger('review', { targets: target, onEnd: () => completed.push('cancelled') });
  assert.equal(fx.cancel('question-changed').reason, 'question-changed');
  clock.advance(1000);
  assert.deepEqual(completed, ['new']);
  fx.destroy();
});

test('destroy during pause removes classes/listeners/timers and permits a new mount', () => {
  const { root, target, clock, media, fx } = fixture();
  let completed = 0;
  fx.trigger('complete', { targets: target, onEnd: () => completed++ });
  fx.pause();
  fx.destroy();
  fx.destroy();
  clock.advance(9000);
  assert.equal(completed, 0);
  assert.equal(clock.count(), 0);
  assert.equal(media.count(), 0);
  assert.equal(root.classList.contains('learning-feedback-root'), false);
  assert.equal(target.classList.contains('lf-fx'), false);
  assert.equal(root.getAttribute('data-lf-paused'), null);
  assert.equal(fx.snapshot().phase, 'destroyed');
  assert.equal(fx.trigger('correct', { targets: target }).reason, 'destroyed');
  createLearningFeedback(root, { clock, mediaQuery: media }).destroy();
});

test('reduced motion keeps the idle sprite and normal feedback duration', () => {
  const { root, target, clock, fx } = fixture(true);
  const sprite = root.append(new ElementStub());
  const idle = 'assets/spirits/kenney/frog_idle.png';
  let completed = 0;
  fx.trigger('reveal', {
    targets: target, duration: 1000,
    sprite: { element: sprite, idle, frames: ['assets/spirits/kenney/frog_jump.png'] },
    onEnd: () => completed++
  });
  assert.equal(root.getAttribute('data-lf-motion'), 'reduced');
  assert.equal(sprite.getAttribute('src'), idle);
  clock.advance(900);
  assert.equal(completed, 0);
  assert.equal(sprite.sourceWrites.length, 1);
  clock.advance(100);
  assert.equal(completed, 1);
  fx.destroy();
});

test('changing the motion preference cannot advance or prolong an effect', () => {
  const { root, target, clock, media, fx } = fixture();
  let completed = 0;
  fx.trigger('correct', { targets: target, duration: 400, onEnd: () => completed++ });
  clock.advance(125);
  media.change(true);
  assert.equal(root.getAttribute('data-lf-motion'), 'reduced');
  assert.equal(fx.snapshot().remaining, 275);
  clock.advance(274);
  assert.equal(completed, 0);
  clock.advance(1);
  assert.equal(completed, 1);
  fx.destroy();
});

test('invalid or outside targets cannot mutate another game or cancel its current cue', () => {
  const { target, clock, fx } = fixture();
  const outside = new ElementStub();
  fx.trigger('correct', { targets: target });
  assert.equal(fx.trigger('pair', { targets: outside }).reason, 'no-target');
  assert.equal(outside.classes.size, 0);
  assert.equal(fx.snapshot().kind, 'correct');
  assert.throws(() => fx.trigger('rainbow'), /Unknown feedback/);
  clock.advance(400);
  fx.destroy();
});

test('external URLs and path traversal are rejected before the current cue changes', () => {
  const { root, target, fx } = fixture();
  const sprite = root.append(new ElementStub());
  fx.trigger('correct', { targets: target });
  for (const path of ['https://example.com/bee.png', 'assets/../outside.png']) {
    assert.throws(() => fx.trigger('reveal', {
      targets: target, sprite: { element: sprite, frames: [path] }
    }), /trusted relative/);
  }
  assert.equal(fx.snapshot().kind, 'correct');
  fx.destroy();
});

test('detached sprite is not rewritten by a late callback', () => {
  const { root, target, clock, fx } = fixture();
  const sprite = root.append(new ElementStub());
  fx.trigger('reveal', {
    targets: target, duration: 1000,
    sprite: { element: sprite, frames: ['assets/spirits/kenney/bee_a.png', 'assets/spirits/kenney/bee_b.png'] }
  });
  root.children = root.children.filter(child => child !== sprite);
  const writes = sprite.sourceWrites.length;
  clock.advance(1000);
  assert.equal(sprite.sourceWrites.length, writes);
  assert.equal(clock.count(), 0);
  fx.destroy();
});

test('same target can replay a cue without layout reads or changing game text/ARIA', () => {
  const { root, target, fx } = fixture();
  target.setAttribute('aria-label', '配对卡片');
  target.textContent = 'apple';
  fx.trigger('pair', { targets: target });
  assert.equal(target.classList.contains('lf-alt'), false);
  fx.trigger('pair', { targets: target });
  assert.equal(target.classList.contains('lf-alt'), true);
  assert.equal(target.textContent, 'apple');
  assert.equal(target.getAttribute('aria-label'), '配对卡片');
  assert.equal(root.getAttribute('aria-live'), null);
  assert.equal(target.getAttribute('aria-live'), null);
  fx.destroy();
});

test('two controllers on the same root are refused to prevent lifecycle conflicts', () => {
  const { root, clock, media, fx } = fixture();
  assert.throws(() => createLearningFeedback(root, { clock, mediaQuery: media }), /already mounted/);
  fx.destroy();
});
