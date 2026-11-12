import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightModel } from '../js/flight.js';
import { CFG } from '../js/config.js';
import { angleWrap } from '../js/utils.js';

const mk = (alt = 800, speed = 110) => {
  const m = new FlightModel(CFG.player);
  m.pos.set(0, alt, 0);
  m.speed = speed;
  m.throttle = 0.6;
  return m;
};
const run = (m, input, seconds) => {
  for (let i = 0; i < seconds * 60; i++) m.step(1 / 60, input, null);
};

test('level flight holds altitude and settles near cruise speed', () => {
  const m = mk();
  run(m, { pitch: 0, roll: 0, yaw: 0 }, 5);
  assert.ok(Math.abs(m.pos.y - 800) < 12, `alt ${m.pos.y}`);
  assert.ok(m.speed > 90 && m.speed < 140, `speed ${m.speed}`);
});

test('pulling up gains altitude and bleeds speed (energy model)', () => {
  const m = mk(800, 150);
  run(m, { pitch: 0.6, roll: 0 }, 1.5);
  assert.ok(m.pos.y > 830, `alt ${m.pos.y}`);
  assert.ok(m.speed < 150, `speed ${m.speed}`);
});

test('banked right turn changes heading to the right', () => {
  const m = mk();
  const hdg = mm => Math.atan2(mm.forward.x, -mm.forward.z);
  const h0 = hdg(m);
  run(m, { roll: 1 }, 0.5);
  run(m, { roll: 0 }, 2);
  const d = angleWrap(hdg(m) - h0);
  assert.ok(d > 0.3, `heading delta ${d}`);
});

test('stall with idle power: speed decays and the nose drops at some point', () => {
  const m = mk(900, 75);
  m.throttle = 0;
  let sawSlow = false, sawNoseDrop = false;
  for (let i = 0; i < 60 * 14; i++) {
    m.step(1 / 60, { pitch: 1.0, roll: 0 }, null);
    if (m.speed < 45) sawSlow = true;
    if (sawSlow && m.forward.y < -0.25) sawNoseDrop = true;
  }
  assert.ok(sawSlow, 'speed never fell below 45');
  assert.ok(sawNoseDrop, 'nose never dropped after the stall');
});

test('ground collision is reported', () => {
  const m = mk(50, 120);
  const res = m.step(1 / 60, { pitch: 0, roll: 0 }, () => 60);
  assert.equal(res.crashed, true);
});

test('throttle increases speed, closing it slows down', () => {
  const fast = mk(800, 100);
  run(fast, { throttleDelta: 1 }, 4);
  const slow = mk(800, 100);
  run(slow, { throttleDelta: -1 }, 4);
  assert.ok(fast.speed > slow.speed + 30, `${fast.speed} vs ${slow.speed}`);
});
