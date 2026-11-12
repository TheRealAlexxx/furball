// Math + noise + pooling helpers. No three.js dependency so node can test these.
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
// frame-rate independent damping factor
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const TAU = Math.PI * 2;

export function angleWrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// --- deterministic value noise -------------------------------------------
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}
const smooth = t => t * t * (3 - 2 * t);

export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm2(x, y, octaves = 4, seed = 0) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}

// Ridged fbm for mountains
export function ridged2(x, y, octaves = 4, seed = 0) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(2 * valueNoise2(x * freq, y * freq, seed + 77 + i * 131) - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5; freq *= 2.11;
  }
  return sum / norm;
}

// --- generic fixed-size object pool ---------------------------------------
export class Pool {
  constructor(size, factory) {
    this.items = new Array(size);
    this.free = [];
    for (let i = size - 1; i >= 0; i--) {
      this.items[i] = factory(i);
      this.free.push(i);
    }
  }
  obtain() {
    if (this.free.length === 0) return null;
    const i = this.free.pop();
    return this.items[i];
  }
  release(item) {
    const i = this.items.indexOf(item);
    if (i >= 0 && !this.free.includes(i)) this.free.push(i);
  }
}

// seeded rng for reproducible tests
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
