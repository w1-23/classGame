const tracks = {
  click: 'audio/kenney/click_002.ogg',
  correct: 'audio/kenney/confirmation_002.ogg',
  wrong: 'audio/kenney/error_004.ogg',
  result: 'audio/kenney/result.ogg',
  retry: 'audio/kenney/retry.ogg'
};
const MUSIC_PATH = 'audio/music/runner-loop.ogg';
const MUSIC_VOLUME = .16;
const PASS_RATIO = .6;

export function completionSound(score, total) {
  return total > 0 && score / total >= PASS_RATIO ? 'result' : 'retry';
}

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.context = null;
    this.buffers = new Map();
    this.speechSource = null;
    this.musicSource = null;
    this.musicGain = null;
    this.musicToken = 0;
    this.speechToken = 0;
  }

  #context() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') this.context.resume();
    return this.context;
  }

  async #buffer(path) {
    if (!this.buffers.has(path)) {
      this.buffers.set(path, fetch(path)
        .then(response => {
          if (!response.ok) throw new Error(`Audio missing: ${path}`);
          return response.arrayBuffer();
        })
        .then(data => this.#context().decodeAudioData(data)));
    }
    return this.buffers.get(path);
  }

  async play(path, volume) {
    const context = this.#context();
    const buffer = await this.#buffer(path);
    if (!buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(context.destination);
    source.start();
    await new Promise(resolve => {
      source.onended = resolve;
    });
  }

  effect(name) {
    const path = tracks[name];
    if (path) this.play(path, this.settings.effectVolume).catch(() => {});
  }

  async speech(path, text, lang) {
    const token = ++this.speechToken;
    this.#stopSpeechSource();
    const context = this.#context();
    let buffer = null;
    if (path) {
      try {
        buffer = await this.#buffer(path);
      } catch {
        buffer = null;
      }
    }
    if (!buffer) {
      if (text && 'speechSynthesis' in window) {
        this.#speakText(text, lang);
      }
      return;
    }
    if (!buffer || token !== this.speechToken) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.settings.speechVolume;
    source.connect(gain).connect(context.destination);
    this.speechSource = source;
    source.start();
    await new Promise(resolve => {
      source.onended = resolve;
    });
    if (this.speechSource === source) this.speechSource = null;
  }

  #stopSpeechSource() {
    if (!this.speechSource) return;
    try {
      this.speechSource.stop();
    } catch {
      // The source may already have ended.
    }
    this.speechSource = null;
  }

  stopSpeech() {
    this.speechToken += 1;
    this.#stopSpeechSource();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  #speakText(text, lang) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang || 'zh-CN';
      utterance.volume = this.settings.speechVolume;
      window.speechSynthesis.speak(utterance);
    } catch {
      // System speech is optional; a missing voice must not stop the game.
    }
  }

  async startMusic() {
    this.stopMusic();
    const token = ++this.musicToken;
    try {
      const context = this.#context();
      const buffer = await this.#buffer(MUSIC_PATH);
      if (!buffer || token !== this.musicToken) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = MUSIC_VOLUME;
      source.connect(gain).connect(context.destination);
      source.start();
      this.musicSource = source;
      this.musicGain = gain;
    } catch {
      this.stopMusic();
    }
  }

  setMusicPaused(paused) {
    if (!this.musicGain || !this.context) return;
    const now = this.context.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(paused ? 0 : MUSIC_VOLUME, now, .04);
  }

  stopMusic() {
    this.musicToken += 1;
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        // The source may already have stopped.
      }
    }
    this.musicSource = null;
    this.musicGain = null;
  }

  destroy() {
    this.stopSpeech();
    this.stopMusic();
    if (this.context && this.context.state !== 'closed') this.context.close();
  }
}
