import * as THREE from 'three';
import { CFG } from './config.js';
import { heightAt } from './heightfield.js';
import { mulberry32 } from './utils.js';

function makeSkyDome() {
  const geo = new THREE.SphereGeometry(CFG.world.fogFar * 1.9, 24, 14);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2e6db4) },
      mid: { value: new THREE.Color(0x9cc8e8) },
      bot: { value: new THREE.Color(0xf4d9a8) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.75, h))
                          : mix(bot, mid, smoothstep(-0.08, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  return dome;
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (const [x, y, r, a] of [[64, 70, 44, 0.85], [38, 76, 30, 0.7], [92, 76, 30, 0.7], [64, 52, 30, 0.65]]) {
    const grad = g.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function terrainColors(geo) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const sand = new THREE.Color(0xc9b98a), grass = new THREE.Color(0x5d8a4a),
        dark = new THREE.Color(0x3e6136), rock = new THREE.Color(0x8a8578),
        snow = new THREE.Color(0xe8ecf0);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = y; // plane rotated so local Y is up after displacement
    if (h < CFG.world.seaLevel + 4) c.copy(sand);
    else if (h < 190) c.copy(grass).lerp(dark, Math.min(1, (h - 30) / 240));
    else if (h < 430) c.copy(dark).lerp(rock, (h - 190) / 240);
    else c.copy(rock).lerp(snow, Math.min(1, (h - 430) / 220));
    // cheap variation
    const v = 0.92 + 0.08 * Math.sin(x * 0.013 + z * 0.017);
    colors[i * 3] = c.r * v; colors[i * 3 + 1] = c.g * v; colors[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function buildWorld(scene, quality) {
  scene.fog = new THREE.Fog(0xa8c4dc, CFG.world.fogNear, CFG.world.fogFar);
  scene.background = new THREE.Color(0x9cc8e8);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x54683f, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
  sun.position.set(-0.4, 0.8, 0.35).multiplyScalar(5000);
  scene.add(sun);
  scene.add(makeSkyDome());

  // sun disc sprite
  const sunTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,250,230,1)');
    grad.addColorStop(0.35, 'rgba(255,240,200,0.9)');
    grad.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false }));
  sunSprite.scale.setScalar(2600);
  sunSprite.position.copy(sun.position).multiplyScalar(3.2);
  scene.add(sunSprite);

  // terrain
  const seg = CFG.world.segments, size = CFG.world.size;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  terrainColors(geo);
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.name = 'terrain';
  scene.add(terrain);

  // sea
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2.6, size * 2.6, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x2e6f8e, transparent: true, opacity: 0.92 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = CFG.world.seaLevel;
  scene.add(sea);

  // clouds
  const rng = mulberry32(20241112);
  const tex = cloudTexture();
  const clouds = [];
  const n = quality.clouds;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.55 + rng() * 0.3, depthWrite: false,
    }));
    const r = 1500 + rng() * 9500;
    const a = rng() * Math.PI * 2;
    s.position.set(Math.cos(a) * r, 480 + rng() * 900, Math.sin(a) * r);
    s.scale.set(500 + rng() * 900, 160 + rng() * 260, 1);
    s.userData.drift = 2 + rng() * 5;
    scene.add(s);
    clouds.push(s);
  }

  return {
    update(dt, playerPos) {
      for (const s of clouds) {
        s.position.x += s.userData.drift * dt;
        if (s.position.x > 12000) s.position.x = -12000;
      }
      // keep fog center on the player for a consistent horizon
      scene.fog.near = CFG.world.fogNear;
    },
  };
}
