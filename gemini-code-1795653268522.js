class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  playTone(freq, duration, type = 'triangle', gainVal = 0.08, endFreq = null) {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  typeClick() { this.playTone(520 + Math.random() * 140, 0.035, 'square', 0.04, 240); }
  shoot()     { this.playTone(460, 0.09, 'triangle', 0.09, 180); }
  miss()      { this.playTone(150, 0.14, 'sawtooth', 0.07, 90); }
  hit()       { this.playTone(260, 0.05, 'square', 0.05, 120); }
  gem()       { this.playTone(760, 0.06, 'sine', 0.05, 1080); }
  hurt()      { this.playTone(130, 0.16, 'sawtooth', 0.1, 60); }
  levelUp() {
    this.playTone(523, 0.1, 'triangle', 0.09);
    setTimeout(() => this.playTone(659, 0.1, 'triangle', 0.09), 70);
    setTimeout(() => this.playTone(784, 0.18, 'triangle', 0.1), 140);
  }
}

export const sfx = new SoundManager();