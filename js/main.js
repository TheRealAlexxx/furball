import * as THREE from 'three';
import { CFG, QUALITY, pickQuality } from './config.js';
import { clamp, damp } from './utils.js';
import { heightAt } from './heightfield.js';
import { buildWorld } from './world.js';
import { buildPlane, PLAYER_LIVERY, ENEMY_LIVERY } from './plane.js';
import { FlightModel } from './flight.js';
import { BanditAI } from './ai.js';
import { GunSystem, ParticleFX, SmokeFX } from './combat.js';
import { HUD } from './hud.js';
import { Controls } from './controls.js';
import { GameAudio } from './audio.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

const ENEMY_CFG = {
  maxSpeed: CFG.enemy.maxSpeed, minSpeed: 0, stallSpeed: 55,
  thrust: 30, idleThrust: 4, dragK: 0.00165,
  pitchRate: CFG.enemy.turnRate, rollRate: 2.7, yawRate: 0.5,
  turnFactor: 9.5,
};

class Game {
  constructor() {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.qualityName = pickQuality();
    this.quality = QUALITY[this.qualityName];
    this.state = 'menu';
    this.score = 0;
    this.wave = 1;
    this.best = +(localStorage.getItem('furball_best') || 0);
    this.damageFlash = 0;
    this.shake = 0;
    this.heat = 0;
    this.overheated = false;
    this.breatherT = 0;
    this.outT = 0;
    this.fpsSamples = [];
    this.testInput = null;      // debug hook: replaces controls.input()

    this._initRenderer();
    this._initScene();
    this._initActors();
    this.hud = new HUD();
    this.controls = new Controls(this.renderer.domElement, this.isTouch);
    this.audio = new GameAudio();
    this._initMenus();
    this._loop = this._loop.bind(this);
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  }

  _initRenderer() {
    const canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.qualityName !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, CFG.world.fogFar * 2.2);
    this.world = buildWorld(this.scene, this.quality);
    // small fill light riding with the camera so the player's own plane isn't a silhouette
    this.fill = new THREE.PointLight(0xfff6e8, 0.7, 70);
    this.scene.add(this.fill);
    this.guns = new GunSystem(this.scene);
    this.particles = new ParticleFX(this.scene, Math.round(CFG.fx.particles * this.quality.particleMul));
    this.smoke = new SmokeFX(this.scene);
  }

  _initActors() {
    // player
    const p = buildPlane(PLAYER_LIVERY);
    this.playerMesh = p.group;
    this.scene.add(this.playerMesh);
    this.playerParts = p;
    this.player = new FlightModel(CFG.player);
    this.player.pos.set(0, 760, -600);
    this.player.speed = 105;
    this.playerHp = CFG.player.hp;
    this.sinceHit = 99;
    this.gunTimers = [0, 0.008, 0.016, 0.024];

    this.enemies = [];
    this.wrecks = [];
  }

  _initMenus() {
    const $ = id => document.getElementById(id);
    this.ui = {
      menu: $('menu'), gameover: $('gameover'), paused: $('paused'),
      finalscore: $('finalscore'), bestscore: $('bestscore'), touchui: $('touchui'),
    };
    $('flybtn').addEventListener('click', () => this.startGame());
    $('retrybtn').addEventListener('click', () => this.startGame());
    $('resumebtn').addEventListener('click', () => this.togglePause(false));
    $('quitbtn').addEventListener('click', () => this.quitToMenu());
    $('pausebtn').addEventListener('click', () => this.togglePause(true));
    this.controls.onPause = () => { if (this.state === 'playing') this.togglePause(true); else if (this.state === 'paused') this.togglePause(false); };
    this.controls.onAnyGesture = () => this.audio.ensure();
  }

  // ---------- state changes ----------
  startGame() {
    this.audio.ensure();
    // reset player
    this.player = new FlightModel(CFG.player);
    this.player.pos.set(0, 760, -600);
    this.player.speed = 105;
    this.playerHp = CFG.player.hp;
    this.sinceHit = 99; this.heat = 0; this.overheated = false;
    this.score = 0; this.wave = 1; this.damageFlash = 0;
    // clear enemies/wrecks/bullets
    for (const e of this.enemies) this.scene.remove(e.mesh);
    for (const w of this.wrecks) this.scene.remove(w.mesh);
    this.enemies = []; this.wrecks = [];
    this.guns.bullets.forEach(b => { b.mesh.visible = false; this.guns.pool.push(b.mesh); });
    this.guns.bullets = [];

    this.ui.menu.classList.add('hidden');
    this.ui.gameover.classList.add('hidden');
    this.ui.paused.classList.add('hidden');
    if (this.isTouch) this.ui.touchui.classList.remove('hidden');
    this.hud.show();
    this.state = 'playing';
    this.startWave(1);
    if (!this.isTouch) this.renderer.domElement.requestPointerLock?.();
  }

  quitToMenu() {
    this.state = 'menu';
    this.ui.paused.classList.add('hidden');
    this.ui.menu.classList.remove('hidden');
    this.hud.hide();
    this.ui.touchui.classList.add('hidden');
    document.exitPointerLock?.();
  }

  togglePause(on) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.state = on ? 'paused' : 'playing';
    this.ui.paused.classList.toggle('hidden', !on);
    if (on) document.exitPointerLock?.();
    else if (!this.isTouch) this.renderer.domElement.requestPointerLock?.();
  }

  gameOver() {
    this.state = 'gameover';
    this.audio.explosion();
    this.particles.burst(this.player.pos, 90, { speed: 90, up: 20 });
    this.playerMesh.visible = false;
    document.exitPointerLock?.();
    this.best = Math.max(this.best, this.score);
    localStorage.setItem('furball_best', String(this.best));
    this.ui.finalscore.textContent = `score ${this.score} - wave ${this.wave}`;
    this.ui.bestscore.textContent = `best ${this.best}`;
    setTimeout(() => {
      if (this.state === 'gameover') this.ui.gameover.classList.remove('hidden');
    }, 900);
  }

  // ---------- waves ----------
  startWave(n) {
    this.wave = n;
    const count = Math.min(CFG.waves.baseCount + CFG.waves.perWave * (n - 1), CFG.waves.maxAlive);
    const skill = Math.min((n - 1) * CFG.waves.skillPerWave, CFG.waves.skillMax);
    for (let i = 0; i < count; i++) this.spawnEnemy(skill, i / count);
    this.hud.banner('WAVE ' + n);
    this.audio.wave();
  }

  spawnEnemy(skill, frac = Math.random()) {
    const parts = buildPlane(ENEMY_LIVERY);
    const model = new FlightModel(ENEMY_CFG);
    // biased ahead of the player so merges happen fast; some spawn behind
    const ahead = Math.random() < 0.6;
    const pHeading = Math.atan2(this.player.forward.x, -this.player.forward.z);
    const base = ahead ? pHeading + Math.PI : pHeading;   // ahead of player = they fly toward us
    const ang = base + (Math.random() - 0.5) * (ahead ? 2.2 : 1.2);
    const dist = 950 + Math.random() * 750;
    const sx = this.player.pos.x + Math.cos(ang) * dist;
    const sz = this.player.pos.z + Math.sin(ang) * dist;
    model.pos.set(
      sx,
      Math.max(clamp(this.player.pos.y + (Math.random() - 0.5) * 600, 420, 1400), heightAt(sx, sz) + 260),
      sz
    );
    model.speed = ENEMY_CFG.maxSpeed * CFG.enemy.cruise;
    model.throttle = 0.8;
    parts.group.position.copy(model.pos);
    parts.group.lookAt(this.player.pos);
    parts.group.getWorldQuaternion(model.quat);
    const cfg = Object.assign({}, ENEMY_CFG, { maxSpeed: ENEMY_CFG.maxSpeed + skill * 24 });
    model.cfg = cfg;
    const enemy = {
      model, ai: new BanditAI(model, skill), mesh: parts.group, parts,
      hp: CFG.enemy.hp, alive: true, radius: 4.2,
      fireT: 0, smokeT: 0, spawnT: 0,
      pos: model.pos, // alias for GunSystem target shape
      onHit: (dmg) => this._enemyHit(enemy, dmg),
      lastHitByPlayer: -99,
    };
    this.scene.add(parts.group);
    this.enemies.push(enemy);
    return enemy;
  }

  _enemyHit(enemy, dmg) {
    enemy.hp -= dmg;
    enemy.lastHitByPlayer = this.time;
    this.score += CFG.scoring.hit;
    this.hud.hitmark();
    this.audio.hit();
    this.particles.burst(enemy.pos, 4, { speed: 30, color1: [1, 0.9, 0.5], color2: [1, 0.4, 0.1], decay: 3 });
    if (enemy.hp <= 0 && enemy.alive) this.killEnemy(enemy, true);
  }

  killEnemy(enemy, byPlayer) {
    enemy.alive = false;
    enemy.model.alive = false;
    this.audio.explosion();
    this.particles.burst(enemy.pos, 70, { speed: 80, up: 10 });
    this.shake = Math.min(this.shake + 0.35, 1);
    if (byPlayer) {
      this.score += CFG.scoring.kill;
      this.hud.killfeed(`bandit down  +${CFG.scoring.kill}`);
    } else {
      this.hud.killfeed('bandit crashed');
    }
    // wreck falls, burning
    this.wrecks.push({
      mesh: enemy.mesh,
      vel: enemy.model.velocity.clone().multiplyScalar(0.7),
      spin: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4),
      life: 8,
    });
  }

  // ---------- per-frame ----------
  _loop(now) {
    requestAnimationFrame(this._loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.033) dt = 0.033;
    this.time = now / 1000;

    if (this.state === 'playing') this.update(dt, now / 1000);
    else if (this.state === 'menu') this._menuCamera(now / 1000, dt);
    this.renderer.render(this.scene, this.camera);
    this._trackPerf(dt);
  }

  update(dt, t) {
    const input = this.testInput || this.controls.input();
    if (this.isTouch && Number.isFinite(this.controls.touchThrottle)) this.player.throttle = this.controls.touchThrottle;

    // soft ceiling + boundary
    if (this.player.pos.y > CFG.world.ceiling) input.pitch = Math.min(input.pitch, -0.35);
    const distC = Math.hypot(this.player.pos.x, this.player.pos.z);
    const out = distC > CFG.world.combatRadius;
    if (out) {
      this.outT += dt;
      if (this.outT > 4) { // gentle auto-turn home
        _v.set(-this.player.pos.x, 0, -this.player.pos.z).normalize();
        _q.copy(this.player.quat).invert();
        _v.applyQuaternion(_q);
        input.roll = clamp(input.roll + _v.x * 1.2, -1, 1);
      }
    } else this.outT = 0;

    const res = this.player.step(dt, input, heightAt);
    this.sinceHit += dt;
    if (this.sinceHit > CFG.player.regenDelay && this.playerHp > 0) {
      this.playerHp = Math.min(CFG.player.hp, this.playerHp + CFG.player.regenRate * dt);
    }
    if (res.crashed) { this.gameOver(); return; }

    // player guns
    this._updatePlayerGuns(dt);

    // enemies
    let aliveCount = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      aliveCount++;
      e.spawnT += dt;
      const playerVel = this.player.velocity;
      const firing = e.ai.update(dt, this.player, playerVel, heightAt, CFG);
      if (e.ai.state === 'hunt' && e.spawnT > 1.2 && firing) this._enemyFire(e, dt);
      // terrain crash
      const ground = heightAt(e.pos.x, e.pos.z);
      if (e.pos.y < ground + 2.2) this.killEnemy(e, this.time - e.lastHitByPlayer < 4);
      // ram check
      if (e.alive && e.pos.distanceToSquared(this.player.pos) < 64) {
        this.killEnemy(e, false);
        this._damagePlayer(45);
      }
      // visuals
      e.mesh.position.copy(e.pos);
      e.mesh.quaternion.copy(e.model.quat);
      e.parts.prop.rotation.z += dt * (30 + e.model.throttle * 70);
      if (e.hp < CFG.enemy.evadeHp) {
        e.smokeT -= dt;
        if (e.smokeT <= 0) { this.smoke.puff(e.pos, 5); e.smokeT = 0.045; }
      }
    }
    this.enemies = this.enemies.filter(e => e.alive || this.wrecks.some(w => w.mesh === e.mesh));

    // wave flow
    if (aliveCount === 0) {
      if (this.breatherT <= 0) {
        this.score += CFG.scoring.waveClear;
        this.hud.banner('WAVE CLEARED  +' + CFG.scoring.waveClear);
        this.breatherT = CFG.waves.breather;
      }
      this.breatherT -= dt;
      if (this.breatherT <= 0) this.startWave(this.wave + 1);
    }

    // bullets
    this.guns.update(dt, this.enemies, [this._playerTarget()], null);

    // wrecks
    for (const w of this.wrecks) {
      w.life -= dt;
      w.vel.y -= 19 * dt;
      w.mesh.position.addScaledVector(w.vel, dt);
      w.mesh.rotation.x += w.spin.x * dt;
      w.mesh.rotation.y += w.spin.y * dt;
      w.mesh.rotation.z += w.spin.z * dt;
      if (Math.random() < 0.5) this.smoke.puff(w.mesh.position, 7);
      const g = heightAt(w.mesh.position.x, w.mesh.position.z);
      if (w.mesh.position.y < g + 1.5 || w.life <= 0) {
        this.particles.burst(w.mesh.position, 40, { speed: 50 });
        this.scene.remove(w.mesh);
        w.dead = true;
      }
    }
    this.wrecks = this.wrecks.filter(w => !w.dead);

    // fx + world
    this.particles.update(dt);
    this.smoke.update(dt);
    this.world.update(dt, this.player.pos);

    // player visuals
    this.playerMesh.position.copy(this.player.pos);
    this.playerMesh.quaternion.copy(this.player.quat);
    this.playerParts.prop.rotation.z += dt * (25 + this.player.throttle * 85);
    if (this.playerHp < 35) {
      this.smoke.puff(this.player.pos, 4.5);
    }

    this._updateCamera(dt);
    this.audio.update(this.player.throttle, this.player.speed, CFG.player.maxSpeed);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);
    this.shake = Math.max(0, this.shake - dt * 2.2);

    this._updateHud();
  }

  _playerTarget() {
    return {
      pos: this.player.pos, radius: 5.2, alive: this.state === 'playing',
      onHit: dmg => this._damagePlayer(dmg),
    };
  }

  _damagePlayer(dmg) {
    this.playerHp -= dmg;
    this.sinceHit = 0;
    this.damageFlash = Math.min(this.damageFlash + 0.28, 0.85);
    this.shake = Math.min(this.shake + 0.18, 0.9);
    this.audio.hurt();
    if (this.playerHp <= 0) this.gameOver();
  }

  _updatePlayerGuns(dt) {
    const g = CFG.player.guns;
    this.heat = Math.max(0, this.heat - g.coolRate * dt);
    if (this.overheated && this.heat < 35) this.overheated = false;
    const wantFire = this.testInput ? this.testInput.fire : this.controls.firing;
    if (!wantFire || this.overheated) return;
    const convPoint = _v2.copy(this.player.forward).multiplyScalar(g.convergence).add(this.player.pos);
    for (let i = 0; i < this.playerParts.guns.length; i++) {
      this.gunTimers[i] -= dt;
      if (this.gunTimers[i] > 0) continue;
      this.gunTimers[i] = 1 / g.rate;
      const anchor = this.playerParts.guns[i];
      const origin = anchor.getWorldPosition(new THREE.Vector3());
      const dir = convPoint.clone().sub(origin).normalize();
      dir.x += (Math.random() - 0.5) * g.spread * 2;
      dir.y += (Math.random() - 0.5) * g.spread * 2;
      dir.z += (Math.random() - 0.5) * g.spread * 2;
      dir.normalize();
      this.guns.fire(origin, dir, g.bulletSpeed, 'player', g.damage, this.player.velocity);
      this.heat += g.heatPerShot;
      this.audio.gun();
    }
    if (this.heat >= 100) this.overheated = true;
  }

  _enemyFire(e, dt) {
    e.fireT -= dt;
    if (e.fireT > 0) return;
    e.fireT = 0.09 + Math.random() * 0.05;
    const dist = e.pos.distanceTo(this.player.pos);
    const tLead = dist / CFG.enemy.bulletSpeed;
    const aim = _v.copy(this.player.pos).addScaledVector(this.player.velocity, tLead);
    const dir = aim.sub(e.pos).normalize();
    const err = CFG.enemy.aimErrorBase * (1.35 - e.ai.skill) * (1 + this.player.speed / 200);
    dir.x += (Math.random() - 0.5) * err * 2;
    dir.y += (Math.random() - 0.5) * err * 2;
    dir.z += (Math.random() - 0.5) * err * 2;
    dir.normalize();
    const origin = e.pos.clone().addScaledVector(e.model.forward, 6);
    // no velocity inheritance for AI guns: the lead solution assumes the
    // muzzle velocity, inheriting it systematically overshoots the lead point
    this.guns.fire(origin, dir, CFG.enemy.bulletSpeed, 'enemy', CFG.enemy.damage);
    if (dist < 900) this.audio.enemyGun();
  }

  // slow orbit around the parked plane behind the menu
  _menuCamera(t, dt) {
    const p = this.player.pos;
    const a = t * 0.11;
    this.camera.position.set(p.x + Math.cos(a) * 22, p.y + 5.5, p.z + Math.sin(a) * 22);
    const g = heightAt(this.camera.position.x, this.camera.position.z);
    this.camera.position.y = Math.max(this.camera.position.y, g + 4);
    this.camera.lookAt(p.x, p.y + 1, p.z);
    this.world.update(dt, p);
    this.playerMesh.position.copy(p);
    this.playerMesh.quaternion.copy(this.player.quat);
    this.playerParts.prop.rotation.z += dt * 30;
  }

  _updateCamera(dt) {
    const fwd = this.player.forward;
    const desired = _v.copy(this.player.pos).addScaledVector(fwd, -13.5).addScaledVector(this.player.up, 3.4);
    // keep camera above terrain
    const g = heightAt(desired.x, desired.z);
    desired.y = Math.max(desired.y, g + 3);
    const k = damp(9, dt);
    this.camera.position.lerp(desired, k);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 1.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 1.6;
      this.camera.position.z += (Math.random() - 0.5) * this.shake * 1.6;
    }
    const look = _v2.copy(this.player.pos).addScaledVector(fwd, 26);
    this.camera.lookAt(look);
    this.fill.position.copy(this.camera.position);
    const targetFov = 66 + clamp(this.player.speed / CFG.player.maxSpeed, 0, 1) * 16;
    if (Math.abs(this.camera.fov - targetFov) > 0.4) {
      this.camera.fov += (targetFov - this.camera.fov) * damp(4, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  _updateHud() {
    // pipper: lead marker on nearest frontal enemy
    let pipper = null;
    let bestD = 850;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(this.player.pos);
      if (d > bestD) continue;
      _v.copy(e.pos).sub(this.player.pos).normalize();
      if (_v.dot(this.player.forward) < 0.8) continue;
      bestD = d;
      const tLead = d / CFG.player.guns.bulletSpeed;
      _v.copy(e.pos).addScaledVector(e.model.velocity, tLead).project(this.camera);
      if (_v.z < 1 && Math.abs(_v.x) < 0.9 && Math.abs(_v.y) < 0.9) {
        pipper = { x: _v.x * innerWidth / 2, y: -_v.y * innerHeight / 2 };
      }
    }
    // enemy markers (screen-space diamonds with distance)
    const markerList = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(this.player.pos);
      _v.copy(e.pos).project(this.camera);
      if (_v.z < 1 && Math.abs(_v.x) < 0.97 && Math.abs(_v.y) < 0.97) {
        markerList.push({ sx: (_v.x * 0.5 + 0.5) * innerWidth, sy: (-_v.y * 0.5 + 0.5) * innerHeight, dist: d });
      }
    }
    this.hud.setMarkers(markerList);
    const heading = Math.atan2(this.player.forward.x, -this.player.forward.z);
    this.hud.update(1 / 60, {
      speed: this.player.speed, alt: this.player.pos.y - heightAt(this.player.pos.x, this.player.pos.z),
      throttle: this.player.throttle, hp: this.playerHp, maxHp: CFG.player.hp,
      wave: this.wave, score: this.score, warn: this.outT > 0.5,
      damageFlash: this.damageFlash, pipper,
      radarBlips: this.enemies.filter(e => e.alive).map(e => ({
        x: e.pos.x - this.player.pos.x, z: e.pos.z - this.player.pos.z, evade: e.ai.state === 'evade',
      })),
      radarRange: 4000, heading,
    });
    if (!this.isTouch) {
      const vis = document.pointerLockElement === this.renderer.domElement;
      this.hud.setMouseCursor(
        innerWidth / 2 + this.controls.cursor.x * innerWidth * 0.33,
        innerHeight / 2 - this.controls.cursor.y * innerHeight * 0.33, vis);
    }
  }

  _trackPerf(dt) {
    if (dt <= 0) return;
    this.fpsSamples.push(1 / dt);
    if (this.fpsSamples.length > 240) this.fpsSamples.shift();
    // auto-degrade once if struggling
    if (this.fpsSamples.length === 240 && !this._degraded) {
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / 240;
      if (avg < 40 && this.qualityName !== 'low') {
        this._degraded = true;
        this.quality = QUALITY[this.qualityName === 'high' ? 'medium' : 'low'];
        this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio));
      }
    }
  }
}

const game = new Game();
// debug/testing handle (also handy in devtools)
window.FURBALL = {
  game,
  setInput(inp) { game.testInput = inp; },
  state() {
    return {
      state: game.state, wave: game.wave, score: game.score, hp: game.playerHp,
      enemies: game.enemies.filter(e => e.alive).length,
      pos: game.player.pos.toArray(), speed: game.player.speed,
      quality: game.qualityName, isTouch: game.isTouch,
      drawCalls: game.renderer.info.render.calls, fps: game.fpsSamples.slice(-30),
    };
  },
};
