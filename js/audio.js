const tracks = {
  click: 'audio/kenney/click_002.ogg',
  correct: 'audio/kenney/confirmation_002.ogg',
  wrong: 'audio/kenney/error_004.ogg',
  result: 'audio/kenney/result.ogg'
};

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.context = null;
    this.buffers = new Map();
    this.speechSource = null;
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

  async speech(path) {
    this.stopSpeech();
    const context = this.#context();
    const buffer = await this.#buffer(path);
    if (!buffer) return;
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

  stopSpeech() {
    if (!this.speechSource) return;
    try {
      this.speechSource.stop();
    } catch {
      // The source may already have ended.
    }
    this.speechSource = null;
  }

  destroy() {
    this.stopSpeech();
    if (this.context && this.context.state !== 'closed') this.context.close();
  }
}
