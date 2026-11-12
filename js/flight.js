import * as THREE from 'three';
import { clamp, damp } from './utils.js';

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _v = new THREE.Vector3();

// Arcade-but-honest flight model:
// - velocity is along the nose (no sideslip), so pointing up bleeds speed (energy)
// - control authority scales with airspeed; below stall the nose drops
// - banking produces a coordinated turn
export class FlightModel {
  constructor(cfg) {
    this.cfg = cfg;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.speed = 0;
    this.throttle = 0.55;      // 0..1
    this.alive = true;
  }

  get forward() { return _v.set(0, 0, 1).applyQuaternion(this.quat); }
  get up() { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat); }
  get velocity() { return this.forward.clone().multiplyScalar(this.speed); }

  // input: {pitch, roll, yaw} in [-1,1], throttleDelta in [-1,1]/s
  step(dt, input, heightFn) {
    if (!this.alive) return;
    const c = this.cfg;
    this.throttle = clamp(this.throttle + (input.throttleDelta || 0) * dt, 0, 1);

    // control authority falls off at low speed
    const authority = clamp(this.speed / c.stallSpeed, 0.15, 1.25);

    // rotational rates (local axes)
    const pitchRate = (input.pitch || 0) * c.pitchRate * authority;
    const rollRate = (input.roll || 0) * c.rollRate * authority;
    const yawRate = (input.yaw || 0) * c.yawRate * authority;

    _axis.set(1, 0, 0); _q.setFromAxisAngle(_axis, -pitchRate * dt); this.quat.multiply(_q);
    _axis.set(0, 0, 1); _q.setFromAxisAngle(_axis, -rollRate * dt); this.quat.multiply(_q);
    _axis.set(0, 1, 0); _q.setFromAxisAngle(_axis, -yawRate * dt); this.quat.multiply(_q);

    // coordinated turn: bank -> heading change
    const fwd = this.forward;
    // derive bank from the aircraft's right/up vectors against the world
    const up = this.up;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
    const bank = Math.atan2(right.y, up.y); // 0 = wings level
    const turn = Math.tan(clamp(bank, -1.35, 1.35)) * c.turnFactor / Math.max(this.speed, 30);
    // rotate heading around world up
    _q.setFromAxisAngle(UP, turn * dt * clamp(this.speed / c.stallSpeed, 0, 1.4));
    this.quat.premultiply(_q);

    // stall: nose drops toward the horizon when too slow
    if (this.speed < c.stallSpeed) {
      const stallAmount = 1 - this.speed / c.stallSpeed;
      const drop = stallAmount * 1.4 * dt;
      _axis.set(1, 0, 0); _q.setFromAxisAngle(_axis, drop); this.quat.multiply(_q);
    }

    // speed: thrust - drag - climb cost (energy model)
    const thrust = c.idleThrust + this.throttle * (c.thrust - c.idleThrust);
    const drag = c.dragK * this.speed * this.speed;
    const climb = 9.81 * fwd.y; // climbing (fwd.y>0) bleeds speed, diving gains
    this.speed = clamp(this.speed + (thrust - drag - climb) * dt, c.minSpeed, c.maxSpeed);

    // integrate position
    const vel = fwd.clone().multiplyScalar(this.speed);
    this.pos.addScaledVector(vel, dt);
    this.pos.y = Math.max(this.pos.y, 0); // never below sea; terrain check is the caller's job

    // ground collision returns true (caller decides crash)
    if (heightFn) {
      const ground = heightFn(this.pos.x, this.pos.z);
      if (this.pos.y < ground + 2.2) return { crashed: true, ground };
    }
    return { crashed: false };
  }
}
