import test from 'node:test';
import assert from 'node:assert/strict';
import { BanditAI } from '../js/ai.js';
import { FlightModel } from '../js/flight.js';
import { CFG } from '../js/config.js';

const ENEMY_CFG = { maxSpeed: 150, minSpeed: 0, stallSpeed: 55, thrust: 30, idleThrust: 4, dragK: 0.00165, pitchRate: 1.55, rollRate: 2.7, yawRate: 0.5, turnFactor: 9.5 };

function scene(distBearing = 0) {
  const player = new FlightModel(CFG.player);
  player.pos.set(0, 800, 0);
  player.speed = 110; player.throttle = 0.6;
  const bandit = new FlightModel(ENEMY_CFG);
  bandit.pos.set(Math.sin(distBearing) * 900, 820, Math.cos(distBearing) * 900);
  bandit.speed = 120; bandit.throttle = 0.9;
  return { player, bandit, ai: new BanditAI(bandit, 0.3) };
}

test('bandit achieves a close merge on a straight-flying target', () => {
  const { player, bandit, ai } = scene();
  let minD = Infinity;
  for (let i = 0; i < 60 * 30; i++) {
    player.step(1 / 60, { pitch: 0, roll: 0 }, () => 0);
    ai.update(1 / 60, player, player.velocity, () => 0, CFG);
    minD = Math.min(minD, bandit.pos.distanceTo(player.pos));
  }
  assert.ok(minD < 250, `closest approach ${minD.toFixed(0)}m`);
});

test('bandit opens fire when in cone and range', () => {
  const { player, bandit, ai } = scene();
  let fired = false;
  for (let i = 0; i < 60 * 30; i++) {
    player.step(1 / 60, { pitch: 0, roll: 0 }, () => 0);
    if (ai.update(1 / 60, player, player.velocity, () => 0, CFG)) { fired = true; break; }
  }
  assert.ok(fired, 'bandit never wanted to fire in 30s');
});

test('bandit breaks into evade when the player sits on its six', () => {
  const { player, bandit, ai } = scene();
  // put the player right behind the bandit
  player.pos.copy(bandit.pos).addScaledVector(bandit.forward, -200);
  player.speed = bandit.speed;
  let sawEvade = false;
  for (let i = 0; i < 60 * 8; i++) {
    player.step(1 / 60, { pitch: 0, roll: 0 }, () => 0);
    ai.update(1 / 60, player, player.velocity, () => 0, CFG);
    if (ai.state === 'evade') { sawEvade = true; break; }
  }
  assert.ok(sawEvade, 'bandit never evaded');
});
