import { clamp } from './utils.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      wave: document.getElementById('wave'),
      score: document.getElementById('score'),
      speed: document.getElementById('speed'),
      alt: document.getElementById('alt'),
      throttle: document.getElementById('throttlefill'),
      health: document.getElementById('healthfill'),
      radar: document.getElementById('radar'),
      banner: document.getElementById('banner'),
      warn: document.getElementById('warn'),
      vignette: document.getElementById('vignette'),
      killfeed: document.getElementById('killfeed'),
      pipper: document.getElementById('pipper'),
      hitmarker: document.getElementById('hitmarker'),
      mousecursor: document.getElementById('mousecursor'),
    };
    this.rctx = this.el.radar.getContext('2d');
    this.bannerT = 0;
    this.hitT = 0;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  banner(text, seconds = 2.6) {
    this.el.banner.textContent = text;
    this.el.banner.classList.remove('hidden');
    // retrigger css animation
    this.el.banner.style.animation = 'none';
    void this.el.banner.offsetWidth;
    this.el.banner.style.animation = '';
    this.bannerT = seconds;
  }

  killfeed(text) {
    const d = document.createElement('div');
    d.textContent = text;
    this.el.killfeed.prepend(d);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => d.remove(), 5200);
  }

  hitmark() {
    this.el.hitmarker.classList.remove('pop');
    void this.el.hitmarker.offsetWidth;
    this.el.hitmarker.classList.add('pop');
  }

  update(dt, s) {
    // s: {speed, alt, throttle, hp, maxHp, wave, score, radarBlips, heading, warn, damageFlash, pipper}
    this.el.speed.textContent = Math.round(s.speed * 3.6) + ' km/h';
    this.el.alt.textContent = Math.round(s.alt) + ' m';
    this.el.throttle.style.width = Math.round(s.throttle * 100) + '%';
    this.el.health.style.width = clamp(s.hp / s.maxHp, 0, 1) * 100 + '%';
    this.el.score.textContent = s.score;
    this.el.wave.textContent = 'WAVE ' + s.wave;
    this.el.warn.classList.toggle('hidden', !s.warn);

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.add('hidden');
    }
    const lowHp = s.hp < 30 ? (0.35 + 0.15 * Math.sin(performance.now() * 0.008)) : 0;
    this.el.vignette.style.opacity = clamp(s.damageFlash + lowHp, 0, 1);

    // pipper
    if (s.pipper) {
      this.el.pipper.style.display = 'block';
      this.el.pipper.style.left = `calc(50% + ${s.pipper.x}px)`;
      this.el.pipper.style.top = `calc(50% + ${s.pipper.y}px)`;
    } else this.el.pipper.style.display = 'none';

    // radar
    const r = this.el.radar.width / 2;
    const ctx = this.rctx;
    ctx.clearRect(0, 0, r * 2, r * 2);
    ctx.strokeStyle = 'rgba(140,200,150,0.25)';
    ctx.beginPath(); ctx.arc(r, r, r * 0.55, 0, Math.PI * 2); ctx.stroke();
    // player wedge (always points up; world rotates around it)
    ctx.fillStyle = '#9df29d';
    ctx.beginPath();
    ctx.moveTo(r, r - 7); ctx.lineTo(r - 5, r + 5); ctx.lineTo(r + 5, r + 5);
    ctx.closePath(); ctx.fill();
    const scale = r / s.radarRange;
    for (const b of s.radarBlips) {
      const dx = b.x * Math.cos(-s.heading) - b.z * Math.sin(-s.heading);
      const dz = b.x * Math.sin(-s.heading) + b.z * Math.cos(-s.heading);
      let px = r + dx * scale, py = r + dz * scale;
      const d = Math.hypot(px - r, py - r);
      if (d > r - 5) { px = r + (px - r) / d * (r - 5); py = r + (py - r) / d * (r - 5); }
      ctx.fillStyle = b.evade ? '#ffb3b3' : '#ff5f4d';
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  setMouseCursor(x, y, visible) {
    this.el.mousecursor.classList.toggle('hidden', !visible);
    if (visible) {
      this.el.mousecursor.style.left = x + 'px';
      this.el.mousecursor.style.top = y + 'px';
    }
  }
}
