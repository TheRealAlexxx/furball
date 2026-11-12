import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp } from './utils.js';

const _v = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _tmp = new THREE.Vector3();

// ---- tracers + bullets -------------------------------------------------
export class GunSystem {
  constructor(scene, max = CFG.fx.tracers) {
    this.scene = scene;
    this.bullets = [];
    this.pool = [];
    const geo = new THREE.BoxGeometry(0.18, 0.18, 7);
    const matP = new THREE.MeshBasicMaterial({ color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    const matE = new THREE.MeshBasicMaterial({ color: 0xff6a4d, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, matP.clone());
      m.visible = false;
      scene.add(m);
      this.pool.push(m);
    }
    this.matPlayer = matP; this.matEnemy = matE;
  }

  // origin: Vector3, dir: normalized Vector3, speed, owner 'player'|'enemy', damage
  fire(origin, dir, speed, owner, damage, inheritVel) {
    const mesh = this.pool.pop();
    if (!mesh) return;
    mesh.visible = true;
    mesh.material = owner === 'player' ? this.matPlayer : this.matEnemy;
    mesh.position.copy(origin);
    mesh.lookAt(_tmp.copy(origin).add(dir));
    const vel = dir.clone().multiplyScalar(speed);
    if (inheritVel) vel.add(inheritVel);
    this.bullets.push({ mesh, vel, life: CFG.player.guns.bulletLife, owner, damage, prev: origin.clone() });
  }

  // targets: array of {pos, radius, alive, onHit(damage, bullet)}
  update(dt, playerTargets, enemyTargets, onPlayerHit) {
    const alive = [];
    for (const b of this.bullets) {
      b.life -= dt;
      b.prev.copy(b.mesh.position);
      b.vel.y -= 3.2 * dt;                     // slight drop
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.lookAt(_tmp.copy(b.mesh.position).add(b.vel));
      let dead = b.life <= 0;

      if (!dead) {
        const list = b.owner === 'player' ? playerTargets : enemyTargets;
        for (const t of list) {
          if (!t.alive) continue;
          if (segmentSphere(b.prev, b.mesh.position, t.pos, t.radius)) {
            t.onHit(b.damage, b);
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        b.mesh.visible = false;
        this.pool.push(b.mesh);
      } else alive.push(b);
    }
    this.bullets = alive;
  }
}

export function segmentSphere(a, b, center, r) {
  _seg.copy(b).sub(a);
  const len2 = _seg.lengthSq();
  if (len2 < 1e-9) return a.distanceToSquared(center) <= r * r;
  const t = clamp(_v.copy(center).sub(a).dot(_seg) / len2, 0, 1);
  const closest = _v.copy(a).addScaledVector(_seg, t);
  return closest.distanceToSquared(center) <= r * r;
}

// ---- particle bursts (explosions, hits) --------------------------------
export class ParticleFX {
  constructor(scene, max = CFG.fx.particles) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.decay = new Float32Array(max);
    this.head = 0;
    this.live = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 3.2, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
  }

  burst(p, n, { speed = 60, color1 = [1, 0.75, 0.3], color2 = [1, 0.25, 0.05], decay = 1.1, up = 0 } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.3 + Math.random() * 0.7);
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * s;
      this.vel[i * 3 + 1] = Math.cos(ph) * s + up;
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
      const mix = Math.random();
      this.col[i * 3] = color1[0] + (color2[0] - color1[0]) * mix;
      this.col[i * 3 + 1] = color1[1] + (color2[1] - color1[1]) * mix;
      this.col[i * 3 + 2] = color1[2] + (color2[2] - color1[2]) * mix;
      this.life[i] = 1;
      this.decay[i] = decay * (0.6 + Math.random() * 0.8);
    }
  }

  update(dt, gravity = -22) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= this.decay[i] * dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      this.vel[i * 3 + 1] += gravity * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// ---- smoke trail sprites -------------------------------------------------
export class SmokeFX {
  constructor(scene, max = CFG.fx.smokeSprites) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(70,66,60,0.55)');
    grad.addColorStop(1, 'rgba(70,66,60,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.sprites = [];
    this.head = 0;
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.sprites.push({ s, life: 0 });
    }
  }
  puff(p, scale = 6) {
    const it = this.sprites[this.head];
    this.head = (this.head + 1) % this.sprites.length;
    it.s.visible = true;
    it.s.position.copy(p);
    it.s.scale.setScalar(scale);
    it.s.material.opacity = 0.5;
    it.life = 1;
  }
  update(dt) {
    for (const it of this.sprites) {
      if (it.life <= 0) { it.s.visible = false; continue; }
      it.life -= dt * 0.55;
      it.s.position.y += 6 * dt;
      it.s.scale.addScalar(7 * dt);
      it.s.material.opacity = 0.5 * Math.max(it.life, 0);
    }
  }
}
