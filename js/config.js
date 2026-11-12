// Central tuning for furball. One place, honest numbers.
export const CFG = {
  world: {
    size: 24000,          // terrain tile edge (m)
    segments: 160,        // terrain resolution
    maxHeight: 720,
    seaLevel: 26,
    combatRadius: 6200,   // soft boundary around origin
    ceiling: 1750,        // soft max altitude
    fogNear: 2500,
    fogFar: 10500,
  },
  player: {
    maxSpeed: 168,
    minSpeed: 0,
    stallSpeed: 58,
    thrust: 34,           // m/s^2 at full throttle (before drag/gravity)
    idleThrust: 3,
    dragK: 0.00165,       // quadratic drag
    pitchRate: 1.75,      // rad/s at full stick
    rollRate: 3.1,
    yawRate: 0.55,
    turnFactor: 9.5,      // banked-turn gravity factor
    hp: 100,
    regenDelay: 6,        // s without damage before hull regen
    regenRate: 3.5,       // hp/s
    guns: {
      count: 4,
      rate: 13,           // rounds/s per gun
      spread: 0.011,      // rad
      bulletSpeed: 720,
      bulletLife: 1.5,
      damage: 9,
      convergence: 260,   // wing guns aim to meet here
      heatPerShot: 1.55,  // 100 = overheated
      coolRate: 26,       // per s
    },
  },
  enemy: {
    hp: 55,
    maxSpeed: 148,
    cruise: 0.82,         // fraction of maxSpeed
    turnRate: 1.55,       // rad/s nose authority
    fireRange: 460,
    fireCone: 0.11,       // rad off-nose to open fire
    bulletSpeed: 640,
    damage: 2.1,
    burstOn: 0.7, burstOff: 0.8,
    aimErrorBase: 0.03,  // rad, scaled by skill
    evadeHp: 26,
  },
  waves: {
    baseCount: 2,         // wave 1 size = baseCount
    perWave: 1,
    maxAlive: 6,
    breather: 4.5,        // s between waves
    skillPerWave: 0.07,   // accuracy/speed growth
    skillMax: 0.75,
  },
  fx: {
    tracers: 220,
    particles: 900,
    smokeSprites: 260,
  },
  scoring: { kill: 100, hit: 2, waveClear: 250 },
};

export const QUALITY = {
  high:   { pixelRatio: 2,   clouds: 110, particleMul: 1.0, shadows: false },
  medium: { pixelRatio: 1.5, clouds: 70,  particleMul: 0.7, shadows: false },
  low:    { pixelRatio: 1,   clouds: 40,  particleMul: 0.45, shadows: false },
};

export function pickQuality() {
  // explicit override for weak devices: ?q=low|medium|high
  const q = new URLSearchParams(location.search).get('q');
  if (q && QUALITY[q]) return q;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  if (coarse && small) return 'medium';
  return 'high';
}
