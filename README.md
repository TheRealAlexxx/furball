# furball

a fast 3D dogfighting game in the browser. fly, chase, shoot.

**play: https://therealalexxx.github.io/furball/**

works on desktop (mouse + keyboard) and phones (touch). no install, no build
step, no assets to download - every model, texture and sound is generated in
code at load.

## how to play

shoot down the bandits, don't get shot down. waves get bigger and the pilots
get sharper. you score for hits (+2), kills (+100) and clearing waves (+250).

### desktop
| input | action |
| --- | --- |
| mouse | steer (the plane flies toward the cursor) |
| `W` / `S` | throttle up / down |
| `A` / `D` | rudder |
| left click / `space` | fire |
| `esc` | pause |

### phone
- **left stick** - steer
- **right slider** - throttle
- **FIRE button** - shoot

line up the yellow pipper ahead of a bandit and hold fire - the pipper shows
where to aim so your bullets and the bandit arrive together. watch your speed:
slow planes stall, and a stalled plane drops its nose. red diamonds mark
bandits, with distance.

## how it works

- **renderer**: [three.js](https://threejs.org) r160 (MIT), vendored in
  `vendor/`. everything else is hand-rolled.
- **flight model** (`js/flight.js`): arcade-but-honest. velocity follows the
  nose, so climbing bleeds speed and diving gains it; control authority scales
  with airspeed; below the stall speed the nose drops; banked turns are
  coordinated (bank -> heading change).
- **AI bandits** (`js/ai.js`): lead pursuit (they aim where you will be, not
  where you are), break into evasive spirals when you sit on their six, pull up
  when they're about to meet a mountain, and fire in bursts inside a nose cone.
  skill rises each wave.
- **world** (`js/world.js`, `js/heightfield.js`): procedural value/ridged-noise
  island with sea at the edges, gradient-sky shader dome, drifting sprite
  clouds. the same height function drives the mesh, collisions and AI
  terrain-avoidance, so nothing can disagree about where the ground is.
- **guns** (`js/combat.js`): pooled tracers with wing-gun convergence at 260m,
  segment-vs-sphere hit tests, particle bursts, smoke trails and falling
  burning wrecks.
- **audio** (`js/audio.js`): pure WebAudio synthesis - engine is two detuned
  oscillators whose pitch follows throttle and airspeed, wind is filtered
  noise, guns/hits/explosions are shaped noise bursts. no audio files.
- **mobile**: virtual stick + throttle slider + fire button with simultaneous
  multi-touch, safe-area-aware HUD, quality scaling (`?q=low|medium|high` to
  force it).

## run locally

```sh
npm start          # any static server works; this one is python3
# open http://localhost:8080
```

## tests

```sh
npm test           # links the vendored three.js for node, then runs node --test
```

covers the flight model (energy, stalls, turn direction, ground collision),
the AI (closing merges, fire control, evasion) and the combat/terrain math.

MIT
