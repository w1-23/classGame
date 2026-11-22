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
        .then(data => this.#context().decodeAudioData(data))
        .catch(error => {
          this.buffers.delete(path);
          throw error;
        }));
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

  async speech(path, text, lang, onStatus = () => {}) {
    this.stopSpeech();
    const token = ++this.speechToken;
    onStatus({ status: 'preparing', source: path ? 'local' : 'system' });
    const context = this.#context();
    let buffer = null;
    if (path) {
      try {
        buffer = await Promise.race([
          this.#buffer(path),
          new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('Audio preparation timed out')), 3500);
          })
        ]);
      } catch (error) {
        buffer = null;
        if (token !== this.speechToken) {
          onStatus({ status: 'cancelled', source: 'local' });
          return { status: 'cancelled', reason: 'superseded' };
        }
      }
    }
    if (!buffer) {
      if (text && 'speechSynthesis' in window) {
        return this.#speakText(text, lang, token, onStatus);
      }
      onStatus({ status: 'failed', source: 'system', reason: 'no-audio' });
      return { status: 'failed', reason: 'no-audio' };
    }
    if (token !== this.speechToken) {
      onStatus({ status: 'cancelled', source: 'local' });
      return { status: 'cancelled', reason: 'superseded' };
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.settings.speechVolume;
    source.connect(gain).connect(context.destination);
    this.speechSource = source;
    try {
      source.start();
      onStatus({ status: 'playing', source: 'local' });
      await new Promise(resolve => {
        source.onended = resolve;
      });
    } catch (error) {
      if (this.speechSource === source) this.speechSource = null;
      onStatus({ status: 'failed', source: 'local', reason: error.message });
      return { status: 'failed', reason: error.message };
    }
    if (this.speechSource === source) this.speechSource = null;
    if (token !== this.speechToken) {
      onStatus({ status: 'cancelled', source: 'local' });
      return { status: 'cancelled', reason: 'superseded' };
    }
    onStatus({ status: 'ended', source: 'local' });
    return { status: 'ended', source: 'local' };
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
    window.speechSynthesis?.cancel?.();
  }

  async #systemVoices() {
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    if (voices.length) return voices;
    await new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        synth.removeEventListener?.('voiceschanged', finish);
        resolve();
      };
      synth.addEventListener?.('voiceschanged', finish, { once: true });
      setTimeout(finish, 1200);
    });
    voices = synth.getVoices();
    return voices;
  }

  async #speakText(text, lang, token, onStatus) {
    if (!window.speechSynthesis?.speak || !('SpeechSynthesisUtterance' in window)) {
      onStatus({ status: 'failed', source: 'system', reason: 'speech-unsupported' });
      return { status: 'failed', reason: 'speech-unsupported' };
    }
    try {
      window.speechSynthesis?.cancel?.();
      const voices = await this.#systemVoices();
      if (token !== this.speechToken) {
        onStatus({ status: 'cancelled', source: 'system' });
        return { status: 'cancelled', reason: 'superseded' };
      }
      const normalized = String(lang || 'zh-CN').toLowerCase();
      const voice = voices.find(candidate =>
        candidate.lang?.toLowerCase() === normalized
        || candidate.lang?.toLowerCase().startsWith(normalized.split('-')[0] + '-')
      );
      if (!voice) {
        onStatus({ status: 'failed', source: 'system', reason: 'voice-missing' });
        return { status: 'failed', reason: 'voice-missing' };
      }
      return await new Promise(resolve => {
        let started = false;
        let settled = false;
        const finish = result => {
          if (settled) return;
          settled = true;
          clearTimeout(startTimer);
          clearTimeout(finishTimer);
          resolve(result);
        };
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang || 'zh-CN';
        utterance.voice = voice;
        utterance.volume = this.settings.speechVolume;
        utterance.onstart = () => {
          if (token !== this.speechToken) {
            window.speechSynthesis.cancel();
            onStatus({ status: 'cancelled', source: 'system' });
            finish({ status: 'cancelled', reason: 'superseded' });
            return;
          }
          started = true;
          onStatus({ status: 'playing', source: 'system' });
        };
        utterance.onend = () => {
          if (token !== this.speechToken) {
            finish({ status: 'cancelled', reason: 'superseded' });
            return;
          }
          onStatus({ status: 'ended', source: 'system' });
          finish({ status: 'ended', source: 'system' });
        };
        utterance.onerror = event => {
          const reason = event?.error || 'speech-error';
          onStatus({ status: 'failed', source: 'system', reason });
          finish({ status: 'failed', reason });
        };
        const startTimer = setTimeout(() => {
          if (started || settled) return;
          window.speechSynthesis.cancel();
          onStatus({ status: 'failed', source: 'system', reason: 'start-timeout' });
          finish({ status: 'failed', reason: 'start-timeout' });
        }, 3000);
        const finishTimer = setTimeout(() => {
          if (settled) return;
          window.speechSynthesis.cancel();
          onStatus({ status: 'failed', source: 'system', reason: 'finish-timeout' });
          finish({ status: 'failed', reason: 'finish-timeout' });
        }, 16000);
        window.speechSynthesis.speak(utterance);
      });
    } catch (error) {
      onStatus({ status: 'failed', source: 'system', reason: error.message });
      return { status: 'failed', reason: error.message };
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
