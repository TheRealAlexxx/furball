import * as THREE from 'three';
import { clamp } from './utils.js';

const _dir = new THREE.Vector3();
const _local = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _aim = new THREE.Vector3();

// Enemy bandit: pursuit with bullet lead, break-off evade when the player is
// on its six, terrain avoidance, wobble so it stays beatable.
export class BanditAI {
  constructor(model, skill = 0) {
    this.model = model;                 // FlightModel (enemy cfg)
    this.skill = clamp(skill, 0, 1);    // 0 rookie .. 1 ace
    this.state = 'hunt';
    this.stateT = 0;
    this.evadeSeed = Math.random() * 100;
    this.burstT = 0;
    this.firing = false;
    this.wantFire = false;
    this.evadeCooldown = 0;
  }

  // returns true while it wants triggers held
  update(dt, playerModel, playerVel, heightFn, cfg) {
    const m = this.model;
    if (!m.alive) { this.wantFire = false; return false; }
    this.stateT += dt;
    this.evadeCooldown -= dt;

    const toPlayer = _dir.copy(playerModel.pos).sub(m.pos);
    const dist = toPlayer.length();

    // --- choose state ---
    const playerFwd = playerModel.forward;
    const behind = _aim.copy(m.pos).sub(playerModel.pos).normalize().dot(playerFwd); // >0.7: player behind us... inverted below
    const playerOnSix = _aim.copy(playerModel.pos).sub(m.pos).normalize().dot(m.forward) < -0.55 && dist < 380;
    if (this.state !== 'evade' && this.evadeCooldown <= 0 &&
        (playerOnSix && Math.random() < 0.02 + 0.05 * this.skill)) {
      this.state = 'evade'; this.stateT = 0;
      this.evadeSeed = Math.random() * 100;
    }
    if (this.state === 'evade' && this.stateT > 2.2 + this.skill * 1.6) {
      this.state = 'hunt'; this.stateT = 0; this.evadeCooldown = 3.5;
    }

    // --- desired direction ---
    if (this.state === 'evade') {
      // diving spiral away from the player
      const away = _aim.copy(m.pos).sub(playerModel.pos).normalize();
      away.y = -0.35 + 0.5 * Math.sin(this.stateT * 2.1 + this.evadeSeed);
      away.x += 0.6 * Math.sin(this.stateT * 1.3 + this.evadeSeed * 2);
      away.z += 0.6 * Math.cos(this.stateT * 1.7 + this.evadeSeed);
      _dir.copy(away).normalize();
    } else {
      // lead pursuit: aim where the player will be when the bullet arrives
      const t = dist / cfg.enemy.bulletSpeed;
      _aim.copy(playerModel.pos).addScaledVector(playerVel, t * (0.75 + 0.25 * this.skill));
      _dir.copy(_aim).sub(m.pos).normalize();
    }

    // --- terrain avoidance override ---
    const ahead = 2.2 * m.speed;
    const futureX = m.pos.x + m.forward.x * ahead;
    const futureZ = m.pos.z + m.forward.z * ahead;
    const floor = heightFn(futureX, futureZ) + 90;
    const avoiding = m.pos.y + m.forward.y * ahead < floor;
    if (avoiding) _dir.set(m.forward.x, Math.abs(m.forward.y) + 0.8, m.forward.z).normalize();

    // --- direction -> stick inputs (in aircraft local frame) ---
    _q.copy(m.quat).invert();
    _local.copy(_dir).applyQuaternion(_q);   // +z fwd, +y up, +x right
    const pitchIn = clamp(_local.y * 3.2, -1, 1);
    const rollIn = clamp(_local.x * 2.6, -1, 1);
    const yawIn = clamp(_local.x * 0.8, -1, 1);

    // evade adds a roll wiggle (barrel-roll flavour)
    const wob = this.state === 'evade' ? Math.sin(this.stateT * 6 + this.evadeSeed) * 0.5 : 0;

    const input = {
      pitch: avoiding ? 0.85 : pitchIn,
      roll: clamp(rollIn + wob, -1, 1),
      yaw: yawIn,
      throttleDelta: this.throttleFor(dist),
    };
    m.step(dt, input, heightFn);

    // --- fire control ---
    const noseErr = Math.acos(clamp(_local.z / Math.max(_local.length(), 1e-6), -1, 1));
    const inCone = noseErr < cfg.enemy.fireCone * (1 + this.skill * 0.5);
    const inRange = dist < cfg.enemy.fireRange;
    this.burstT -= dt;
    if (this.burstT <= -cfg.enemy.burstOff) this.burstT = cfg.enemy.burstOn;
    this.firing = this.burstT > 0 && inCone && inRange && this.state === 'hunt' && !avoiding;
    this.wantFire = this.firing;
    return this.firing;
  }

  throttleFor(dist) {
    // close the gap when far, ease off when close so it doesn't overshoot constantly
    if (dist > 700) return 1;
    if (dist < 180) return -0.7;
    return 0.15;
  }
}
