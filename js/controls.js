import { clamp } from './utils.js';

// Unified input: desktop mouse-aim (pointer lock, war-thunder style "fly toward
// the cursor") + keys; phone: virtual stick + throttle slider + fire button.
export class Controls {
  constructor(canvas, isTouch) {
    this.canvas = canvas;
    this.isTouch = isTouch;
    this.keys = new Set();
    this.firing = false;
    this.throttleDelta = 0;
    this.stick = { x: 0, y: 0 };        // -1..1, y up positive = pull up
    this.cursor = { x: 0, y: 0 };       // mouse-aim virtual cursor -1..1
    this.onPause = null;
    this.onAnyGesture = null;
    this._bind();
  }

  get pitch() {
    return this.isTouch ? this.stick.y : clamp(this.cursor.y * 1.6, -1, 1);
  }
  get roll() {
    return this.isTouch ? this.stick.x : clamp(this.cursor.x * 1.8, -1, 1);
  }
  get yaw() {
    return (this.keys.has('KeyA') ? 1 : 0) - (this.keys.has('KeyD') ? 1 : 0);
  }
  get throttleAxis() {
    let d = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) d += 0.55;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) d -= 0.55;
    return d;
  }

  input() {
    return {
      pitch: this.pitch,
      roll: this.roll,
      yaw: this.yaw,
      throttleDelta: this.throttleAxis,
    };
  }

  _gesture() { if (this.onAnyGesture) this.onAnyGesture(); }

  _bind() {
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.firing = true; e.preventDefault(); }
      if (e.code === 'Escape' && this.onPause) this.onPause();
      this._gesture();
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.firing = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.firing = false; });

    if (!this.isTouch) {
      this.canvas.addEventListener('mousedown', e => { if (e.button === 0) this.firing = true; this._gesture(); });
      window.addEventListener('mouseup', e => { if (e.button === 0) this.firing = false; });
      window.addEventListener('mousemove', e => {
        if (document.pointerLockElement !== this.canvas) return;
        this.cursor.x = clamp(this.cursor.x + e.movementX / 260, -1, 1);
        this.cursor.y = clamp(this.cursor.y - e.movementY / 260, -1, 1);
      });
    } else {
      this._bindTouch();
    }
  }

  _bindTouch() {
    const stick = document.getElementById('stick');
    const nub = document.getElementById('sticknub');
    const fire = document.getElementById('firebtn');
    const slider = document.getElementById('thrslider');
    const fill = document.getElementById('thrfill');
    const knob = document.getElementById('thrknob');
    this.throttleUI = { fill, knob };
    let stickId = null, thrId = null;
    const R = 46;

    const setNub = (dx, dy) => {
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    stick.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      stickId = t.identifier;
      this._gesture();
    }, { passive: false });
    stick.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        const r = stick.getBoundingClientRect();
        let dx = t.clientX - (r.left + r.width / 2);
        let dy = t.clientY - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > R) { dx = dx / len * R; dy = dy / len * R; }
        setNub(dx, dy);
        this.stick.x = clamp(dx / R, -1, 1);
        this.stick.y = clamp(-dy / R, -1, 1);   // thumb up = climb
      }
    }, { passive: false });
    const endStick = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        stickId = null;
        this.stick.x = 0; this.stick.y = 0;
        setNub(0, 0);
      }
    };
    stick.addEventListener('touchend', endStick);
    stick.addEventListener('touchcancel', endStick);

    fire.addEventListener('touchstart', e => { e.preventDefault(); this.firing = true; this._gesture(); }, { passive: false });
    fire.addEventListener('touchend', e => { e.preventDefault(); this.firing = false; }, { passive: false });

    const setThr = t => {
      const r = slider.getBoundingClientRect();
      const v = clamp(1 - (t.clientY - r.top) / r.height, 0, 1);
      this.touchThrottle = v;
      fill.style.height = v * 100 + '%';
      knob.style.bottom = v * 100 + '%';
    };
    slider.addEventListener('touchstart', e => { e.preventDefault(); thrId = e.changedTouches[0].identifier; setThr(e.changedTouches[0]); this._gesture(); }, { passive: false });
    slider.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === thrId) setThr(t);
    }, { passive: false });
    slider.addEventListener('touchend', () => { thrId = null; });
    this.touchThrottle = 0.6;
    setThr({ clientY: slider.getBoundingClientRect().top + 0.4 * slider.getBoundingClientRect().height });
  }
}
