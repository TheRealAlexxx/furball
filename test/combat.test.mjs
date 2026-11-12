import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentSphere } from '../js/combat.js';
import { heightAt } from '../js/heightfield.js';
import { CFG } from '../js/config.js';
import { fbm2, mulberry32, clamp } from '../js/utils.js';
import * as THREE from 'three';

test('segmentSphere: pass-through hits, near miss misses', () => {
  const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(10, 0, 0);
  assert.equal(segmentSphere(a, b, new THREE.Vector3(5, 1, 0), 2), true);
  assert.equal(segmentSphere(a, b, new THREE.Vector3(5, 5, 0), 2), false);
  assert.equal(segmentSphere(a, b, new THREE.Vector3(-3, 0, 0), 2), false); // behind start
});

test('heightfield: deterministic, low at map edges, finite everywhere sampled', () => {
  assert.equal(heightAt(123.4, 567.8), heightAt(123.4, 567.8));
  const half = CFG.world.size / 2;
  assert.ok(heightAt(half - 50, 0) < 30, 'edge should be near sea level');
  for (let i = 0; i < 200; i++) {
    const h = heightAt((Math.random() - 0.5) * CFG.world.size, (Math.random() - 0.5) * CFG.world.size);
    assert.ok(Number.isFinite(h) && h >= 0 && h <= CFG.world.maxHeight * 1.1, `h=${h}`);
  }
});

test('noise is bounded and deterministic', () => {
  for (let i = 0; i < 100; i++) {
    const v = fbm2(i * 0.37, i * 0.11, 4, 7);
    assert.ok(v >= 0 && v <= 1, v);
  }
  assert.equal(fbm2(3, 4, 4, 1), fbm2(3, 4, 4, 1));
});

test('rng sequence is reproducible', () => {
  const r1 = mulberry32(99), r2 = mulberry32(99);
  for (let i = 0; i < 10; i++) assert.equal(r1(), r2());
});

test('clamp behaves at bounds', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});
