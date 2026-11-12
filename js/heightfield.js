// Pure height function shared by the terrain mesh, the flight collision check
// and the AI terrain-avoidance. No three.js import so node can test it.
import { fbm2, ridged2, clamp } from './utils.js';
import { CFG } from './config.js';

const SEED = 1337;

// Island-ish heightfield: mountains inland, falling to ocean at the edges.
export function heightAt(x, z) {
  const half = CFG.world.size / 2;
  // radial falloff keeps the play area surrounded by water
  const r = Math.sqrt(x * x + z * z) / half;           // 0 center -> 1 edge
  const falloff = clamp(1 - r * r * 1.15, 0, 1);

  const base = fbm2(x * 0.00028 + 50, z * 0.00028 + 50, 4, SEED);
  const ridge = ridged2(x * 0.00055, z * 0.00055, 4, SEED + 9);
  let h = base * 0.45 + ridge * 0.75;                  // rolling + mountains
  h = h * h * CFG.world.maxHeight * falloff;
  return h;
}

// approximate normal by central differences (for slope checks / camera)
export function slopeAt(x, z, eps = 14) {
  const dx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const dz = heightAt(x, z + eps) - heightAt(x, z - eps);
  return Math.sqrt(dx * dx + dz * dz) / (2 * eps);
}
