const tracks = {
  click: 'audio/sfx/click_001.ogg',
  correct: 'audio/sfx/confirmation_001.ogg',
  wrong: 'audio/sfx/error_001.ogg',
  music: 'audio/music/jingles_PIZZI00.ogg'
};

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.cache = new Map();
    this.music = null;
  }

  #track(name) {
    const element = this.cache.get(name) || new Audio(tracks[name]);
    this.cache.set(name, element);
    return element;
  }

  effect(name) {
    const track = this.#track(name).cloneNode();
    track.volume = this.settings.effectVolume;
    track.play().catch(() => {});
  }

  async speech(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Audio missing: ${path}`);
    const buffer = await response.arrayBuffer();
    const context = new AudioContext();
    const source = context.createBufferSource();
    source.buffer = await context.decodeAudioData(buffer);
    const gain = context.createGain();
    gain.gain.value = this.settings.speechVolume;
    source.connect(gain).connect(context.destination);
    source.start();
    return new Promise(resolve => source.onended = () => {
      context.close();
      resolve();
    });
  }

  startMusic() {
    if (this.music) return;
    this.music = this.#track('music');
    this.music.loop = true;
    this.music.volume = this.settings.musicVolume;
    this.music.play().catch(() => {});
  }

  stopMusic() {
    if (!this.music) return;
    this.music.pause();
    this.music.currentTime = 0;
    this.music = null;
  }
}
