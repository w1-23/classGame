/**
 * Small, presentation-only feedback controller for classGame.
 * No scoring, next-question timers, audio, live regions, or persistence.
 * One finite effect at a time; the game remains the owner of every state change.
 */

const EFFECTS = Object.freeze({
  press: 100,
  select: 180,
  correct: 400,
  incorrect: 220,
  review: 300,
  complete: 640,
  pair: 400,
  slot: 160,
  reveal: 440,
  turn: 320,
  listen: 480
});

const mounted = new WeakSet();
const ROOT_CLASS = 'learning-feedback-root';
const FX_CLASS = 'lf-fx';

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function localImagePath(value) {
  if (typeof value !== 'string' || !/^(?:\.\/)?assets\/[a-z0-9_./-]+\.(?:png|webp|svg)$/i.test(value)
    || value.split('/').includes('..')) {
    throw new TypeError('Feedback sprites must use a trusted relative assets/ image path.');
  }
  return value;
}

/**
 * @param {HTMLElement} root A stable game container, not a replaced question node.
 * @param {object} options
 * @param {boolean|undefined} options.reducedMotion Override system preference only when needed.
 * @param {object|undefined} options.clock Injectable monotonic timer for state tests.
 * @param {object|undefined} options.mediaQuery Injectable MediaQueryList for state tests.
 */
export function createLearningFeedback(root, options = {}) {
  if (!root || !root.classList || typeof root.contains !== 'function') {
    throw new TypeError('A DOM root is required.');
  }
  if (mounted.has(root)) throw new Error('A feedback controller is already mounted on this root.');
  mounted.add(root);

  const clock = options.clock || {
    now: () => performance.now(),
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: timer => globalThis.clearTimeout(timer)
  };
  const media = options.mediaQuery ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = options.reducedMotion ?? Boolean(media?.matches);
  let paused = false;
  let destroyed = false;
  let active = null;
  let timer = null;
  let serial = 0;

  const original = {
    rootClass: root.classList.contains(ROOT_CLASS),
    motion: root.getAttribute('data-lf-motion'),
    paused: root.getAttribute('data-lf-paused')
  };
  root.classList.add(ROOT_CLASS);
  root.setAttribute('data-lf-motion', reducedMotion ? 'reduced' : 'full');

  function restoreAttribute(element, name, value) {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }

  function stopTimer() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function elapsed(effect = active) {
    if (!effect) return 0;
    return Math.min(effect.duration, effect.elapsed + (effect.startedAt === null ? 0 : Math.max(0, clock.now() - effect.startedAt)));
  }

  function resetVisuals(effect) {
    for (const target of effect.targets) {
      target.classList.remove(FX_CLASS, `lf-${effect.kind}`, 'lf-alt');
      target.style.removeProperty('--lf-motion-ms');
    }
    if (effect.sprite && root.contains(effect.sprite.element)) {
      effect.sprite.element.setAttribute('src', effect.sprite.idle);
    }
  }

  function cancel(reason = 'cancelled') {
    stopTimer();
    if (!active) return false;
    const previous = active;
    active = null;
    resetVisuals(previous);
    // Cancellation deliberately does not call onEnd: it must never advance a game.
    return { id: previous.id, kind: previous.kind, reason };
  }

  function updateSprite(effect, time) {
    if (!effect.sprite || !root.contains(effect.sprite.element)) return;
    const { element, frames, frameMs, idle } = effect.sprite;
    effect.frameIndex = reducedMotion ? 0 : Math.floor(time / frameMs) % frames.length;
    const nextSource = reducedMotion ? idle : frames[effect.frameIndex];
    if (element.getAttribute('src') !== nextSource) element.setAttribute('src', nextSource);
  }

  function finish(effect) {
    if (active !== effect) return;
    stopTimer();
    active = null;
    resetVisuals(effect);
    // Optional presentation callback only. Existing game delays stay authoritative.
    effect.onEnd?.({ id: effect.id, kind: effect.kind, reason: 'completed' });
  }

  function schedule() {
    stopTimer();
    if (!active || paused || destroyed) return;
    const effect = active;
    const time = elapsed(effect);
    if (time >= effect.duration) {
      finish(effect);
      return;
    }
    updateSprite(effect, time);
    const toEnd = effect.duration - time;
    const toFrame = effect.sprite && !reducedMotion
      ? effect.sprite.frameMs - (time % effect.sprite.frameMs)
      : toEnd;
    timer = clock.setTimeout(() => {
      timer = null;
      // A captured old effect can never finish a newly triggered one.
      if (active !== effect || paused || destroyed) return;
      schedule();
    }, Math.max(1, Math.min(toEnd, toFrame)));
  }

  /**
   * Finite cue. targets are existing elements, never selectors or HTML strings.
   * sprite: { element: HTMLImageElement, frames: local paths[], idle, frameMs? }
   * onEnd is optional, and is not invoked on cancellation/destroy/superseding.
   */
  function trigger(kind, details = {}) {
    if (destroyed) return { accepted: false, reason: 'destroyed' };
    if (paused) return { accepted: false, reason: 'paused' };
    if (!Object.hasOwn(EFFECTS, kind)) throw new RangeError(`Unknown feedback kind: ${kind}`);
    const requested = details.targets == null ? []
      : (Array.isArray(details.targets) ? details.targets : [details.targets]);
    const targets = [...new Set(requested)].filter(target => target?.classList && root.contains(target));
    let sprite = null;
    if (details.sprite) {
      const { element, frames, idle, frameMs } = details.sprite;
      if (!element || !root.contains(element) || !Array.isArray(frames) || !frames.length || frames.length > 8) {
        throw new TypeError('A sprite needs an image in this root and 1–8 local frames.');
      }
      sprite = {
        element,
        frames: frames.map(localImagePath),
        idle: localImagePath(idle ?? frames[0]),
        frameMs: boundedNumber(frameMs, 220, 100, 500)
      };
    }
    if (!targets.length && !sprite) return { accepted: false, reason: 'no-target' };

    cancel('superseded');
    const duration = boundedNumber(details.duration, EFFECTS[kind], 80, 2200);
    const effect = {
      id: ++serial, kind, targets, sprite, duration,
      elapsed: 0, startedAt: clock.now(), frameIndex: 0,
      onEnd: typeof details.onEnd === 'function' ? details.onEnd : null
    };
    active = effect;
    for (const target of targets) {
      target.classList.add(FX_CLASS, `lf-${kind}`);
      // Alternating names restart a repeated cue without a forced layout read.
      if (effect.id % 2 === 0) target.classList.add('lf-alt');
      target.style.setProperty('--lf-motion-ms', `${Math.min(duration, EFFECTS[kind])}ms`);
    }
    schedule();
    return { accepted: true, id: effect.id };
  }

  function pause() {
    if (destroyed || paused) return false;
    if (active) {
      active.elapsed = elapsed();
      active.startedAt = null;
    }
    paused = true;
    stopTimer();
    root.setAttribute('data-lf-paused', 'true');
    return true;
  }

  function resume() {
    if (destroyed || !paused) return false;
    paused = false;
    root.removeAttribute('data-lf-paused');
    if (active) active.startedAt = clock.now();
    schedule();
    return true;
  }

  function onMotionChange(event) {
    if (destroyed || options.reducedMotion !== undefined) return;
    reducedMotion = Boolean(event.matches);
    root.setAttribute('data-lf-motion', reducedMotion ? 'reduced' : 'full');
    if (active) updateSprite(active, elapsed());
    schedule();
  }

  media?.addEventListener?.('change', onMotionChange);

  return {
    trigger,
    cancel,
    pause,
    resume,
    snapshot() {
      const time = elapsed();
      return Object.freeze({
        phase: destroyed ? 'destroyed' : paused ? 'paused' : active ? 'playing' : 'idle',
        kind: active?.kind ?? null,
        elapsed: time,
        remaining: active ? active.duration - time : 0,
        frameIndex: active?.frameIndex ?? null,
        reducedMotion
      });
    },
    destroy() {
      if (destroyed) return;
      cancel('destroyed');
      destroyed = true;
      media?.removeEventListener?.('change', onMotionChange);
      if (!original.rootClass) root.classList.remove(ROOT_CLASS);
      restoreAttribute(root, 'data-lf-motion', original.motion);
      restoreAttribute(root, 'data-lf-paused', original.paused);
      mounted.delete(root);
    }
  };
}
