// All sound is synthesized with WebAudio - no audio files.
import { clamp } from './utils.js';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(ctx.destination);

    // shared noise buffer
    const len = ctx.sampleRate * 1.2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // engine: two detuned saws through a lowpass
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0.0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 420; this.engFilter.Q.value = 2.5;
    this.engOsc1 = ctx.createOscillator(); this.engOsc1.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square';
    this.engOsc1.frequency.value = 80; this.engOsc2.frequency.value = 82.7;
    this.engOsc1.connect(this.engFilter); this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.engOsc1.start(); this.engOsc2.start();

    // wind: looped noise through bandpass
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = this.noiseBuf; this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master);
    this.windSrc.start();
  }

  // continuous per-frame engine/wind
  update(throttle, speed, maxSpeed) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + throttle * 85 + speed * 0.22;
    this.engOsc1.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engOsc2.frequency.setTargetAtTime(rpm * 1.035 + 2, t, 0.08);
    this.engGain.gain.setTargetAtTime(0.10 + throttle * 0.10, t, 0.1);
    const w = clamp(speed / maxSpeed, 0, 1);
    this.windGain.gain.setTargetAtTime(w * w * 0.20, t, 0.12);
    this.windFilter.frequency.setTargetAtTime(350 + speed * 4.5, t, 0.12);
  }

  _noise(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, sweepTo = null } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  gun() { this._noise(0.07, { freq: 750 + Math.random() * 250, q: 0.8, gain: 0.32 }); }
  enemyGun() { this._noise(0.08, { freq: 480, q: 1, gain: 0.10 }); }
  hit() { this._noise(0.045, { type: 'highpass', freq: 2600, gain: 0.22 }); }
  hurt() { this._noise(0.12, { freq: 300, q: 2, gain: 0.35 }); }
  explosion() {
    this._noise(0.9, { type: 'lowpass', freq: 900, sweepTo: 90, gain: 0.9 });
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.8);
  }
  wave() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [i, f] of [[0, 392], [1, 523], [2, 659]]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.11);
      g.gain.linearRampToValueAtTime(0.16, t + i * 0.11 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.5);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.55);
    }
  }
}
