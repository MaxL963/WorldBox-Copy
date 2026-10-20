# Godbox

A pixel god-simulator sandbox for the browser. Shape an island, plant forests, call down rain and lightning, and watch tiny villages appear, grow and spread on their own.

Clean-room project inspired by the gameplay of WorldBox. All code, names and visuals are original, and no reference-game files were decompiled or reused. See [SPEC.md](SPEC.md) for evidence sources and confidence levels.

## Quick start

Requires Node.js 22.6+ (tests use Node's built-in TypeScript type stripping).

```sh
npm install
npm run dev      # http://localhost:5179
```

Production build: `npm run build` (output in `dist/`).

## Controls

| Input | Action |
|---|---|
| Left click / drag | Use selected power |
| Right or middle drag, WASD / arrows | Pan |
| Mouse wheel | Zoom around cursor |
| `1`–`8` | Select power |
| `Space` | Pause / resume |
| Seed box + **New world** / **Random** | Generate a new island |

## Powers

| Key | Power | Effect |
|---|---|---|
| 1 | Raise land | Lifts terrain: water → sand → soil → hills → mountain |
| 2 | Lower land | Sinks terrain. Flooded tiles lose trees and buildings, and units there drown |
| 3 | Seeds | Plants trees on fertile ground |
| 4 | Rain | Puts out fire, turns soil to grass, sometimes grows trees |
| 5 | Fire | Ignites trees, grass and buildings. Spreads by contact, stops at water |
| 6 | Lightning | Kills units nearby, starts fires, damages buildings |
| 7 | Human | Spawns a human |
| 8 | Sheep | Spawns a sheep |

## How the world works

- **Terrain:** 256×192 tiles, each a height value mapped to deep water, shallow water, sand, soil/grass, hills or mountain. Grass spreads to nearby soil, and forests slowly spread too.
- **Sheep:** wander, eat grass (leaving soil behind) and breed when fed.
- **Humans:** a wandering human settles on open fertile land and founds a village with a town hall. Villagers chop trees for wood, farm or hunt for food, and build houses (+4 population) and farms. Fed villages have children. Full villages send out settlers who found new villages elsewhere.
- **Speed:** 10 ticks per second at 1x, with 2x and 5x available. A seed always produces the same world and, with the same inputs, the same history.

All tuning values (fire spread, hunger, lifespans, costs) live in `CFG` in [src/sim.ts](src/sim.ts).

## Project layout

```
index.html        page shell, toolbar, HUD styles
src/rng.ts        seeded PRNG (mulberry32)
src/world.ts      terrain grid, tile rules, island generation
src/sim.ts        simulation: powers, fire, growth, units, villages
src/render.ts     canvas renderer (pixel buffer + unit overlay + effects)
src/main.ts       input, camera, game loop, HUD
test/sim.test.ts  simulation tests (node:test)
test/e2e.mjs      browser test (Playwright + Edge)
SPEC.md           technical spec with evidence and confidence
PROGRESS.md       status, known gaps, unknowns, backlog
```

## Testing

```sh
npm test         # simulation tests: determinism, terrain, fire, rain, flooding, lightning, sheep, villages
npm run e2e      # browser test; needs `npm run dev` running and Microsoft Edge installed
```

## Known limitations

Units move greedily without pathfinding and can stall behind lakes. Buildings are single tiles. There are no kingdoms, wars, sound or saving yet. See [PROGRESS.md](PROGRESS.md) for the full list and the backlog.
