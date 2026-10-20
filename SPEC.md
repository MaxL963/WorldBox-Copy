# Godbox — Technical Specification (v1)

Clean-room reconstruction of the core loop of a pixel "god simulator" (reference: WorldBox).
No reference-game files were decompiled, run, or extracted. The local copy in
`Downloads/WorldBox.God.Simulator.v0.50.5` is cracked: it contains the Goldberg Steam emulator
(`steam_settings/`, and `steam_api64.dll` swapped with the original kept as `.bak`). It was only
listed, never analyzed.

## Evidence sources

| ID | Source | Access |
|----|--------|--------|
| E1 | Wikipedia "WorldBox" (via search snippet) | snippet only |
| E2 | Pro Game Guides: nature & disaster powers (via search snippet) | snippet only, page 403 |
| E3 | Pro Game Guides: growing civilizations (via search snippet) | snippet only, page 403 |
| E4 | Pro Game Guides: shaping the world (via search snippet) | snippet only |
| E5 | File listing of local install (engine/middleware only) | directory names |
| — | worldbox.fandom.com | HTTP 402, not accessible |

Confidence: **High** = stated directly by a source. **Medium** = consistent across sources but no numbers.
**Low** = assumption, tuned by feel. Every number in `src/sim.ts` `CFG` is **Low**.

## Systems

### Core loop
- Observed (E1): sandbox; the player wields god powers over a world where civilizations grow, war and ally. There's no win condition. **High**
- Implemented: fixed timestep at 10 ticks/s × speed (pause/1/2/5). The sim is deterministic per seed (seeded PRNG, ordered iteration). **Implementation choice**

### World / terrain
- Observed (E4): soil is buildable, and only berry bushes grow on it. Forest holds trees and buildings. Hills block building and trees but take ore. On mountains nothing can be built, creatures avoid them and slowly die there. **High** (qualitative)
- Implemented: 256×192 tile grid with a height byte. Bands: deep < 70 ≤ shallow < 100 ≤ sand < 110 ≤ soil/grass < 170 ≤ hills < 200 ≤ mountain. Grass and tree are overlay flags on soil.
- Walkable: sand → hills. Buildable: soil/grass with no tree, building or fire.
- Generation: 4-octave value noise plus island falloff, so map edges are always water. Moisture noise places grass; forest noise places trees.
- Divergence: berry bushes, ore and biomes (snow, desert, jungle…) are not implemented. Mountains are impassable rather than slowly lethal. **Low**

### Camera & controls
- Implemented: wheel zooms around the cursor (×1.2 steps, 1.5–40 px/tile). Right/middle drag or WASD/arrows pan. Left click/drag applies the power, with the brush ring shown. Keys 1–8 pick a power, Space pauses. **Implementation choice** (the reference's exact feel is unverified)

### God powers
| Power | Observed | Implemented | Conf. |
|---|---|---|---|
| Raise/Lower land | world-shaping powers exist (E1, E4) | radius 3, ±8 height per 60 ms, linear falloff. Flooded tiles lose grass, trees, buildings and fire. New land is bare soil | Medium / numbers Low |
| Seeds | seed spawner exists (E2) | radius 2, 30% of fertile tiles get a tree | Low |
| Rain | "extinguish fire and grow grass and trees on fertile soil" (E2) | radius 4: fire out, soil→grass, 5% grass→tree | High / numbers Low |
| Fire | "creates sparks that set fire to things on contact" (E2) | ignites burnable tiles in radius 1 | High |
| Lightning | "sets wood on fire and heats up pixels" (E2) | radius 2: ignite, kill units, 15 damage to buildings | High / numbers Low |
| Spawn human/sheep | creature powers exist (E1) | one unit per click (repeats while dragging) | High |

### Fire
- Observed (E2): spreads by contact and burns wood. **High**
- Implemented: a burning tile lasts 20 ticks. Each tick each of its 4 neighbors ignites with p = 0.30 (tree), 0.15 (building), 0.08 (grass). Burnt tiles become bare soil. Fire never enters water. Units standing in fire die, and a burning building loses 1 hp per tick. **Low**

### Creatures
- Sheep: wander (radius 6) and move every 2nd tick. A hungry sheep (> 150 ticks) eats the grass it stands on, which turns to soil, and has a 25% chance to birth a lamb (global cap 300). Starves at 900. Lifespan 1500–2500 ticks. **Low**
- Humans: lifespan 3000–5000 ticks, hungry at 250, starve at 1200. They drown on non-walkable tiles and die in fire. **Low**
- Movement: greedy 8-direction steps with no pathfinding. **Implementation choice / known divergence**

### Villages
- Observed (E3): settlers found a village where there's space, fertile soil and wood. They build a fireplace + town hall first, then grow on resources (wood, stone, gold, iron) with tiered upgrades. **Medium**
- Implemented:
  - A nomad founds a village on a buildable tile when ≥ 40 buildable tiles lie within radius 5 and no hall is within 22. The village starts with 6 food.
  - A nomad within 30 tiles of a village that has room joins it.
  - Jobs: eat from stock when hungry; build a house when near cap (8 wood) or a farm (4 wood, 1 per 3 people); when food < 3×pop, work a farm (20 ticks → 3 food) or hunt a sheep (4 food); otherwise chop the nearest tree (1 wood).
  - Births every 60 ticks if food ≥ 4 and pop < cap. A full village with food ≥ 12 sends out a settler, which is how villages spread.
  - Capacity: hall 4, house 4. Territory radius = min(16, 4 + buildings).
  - Losing the hall dissolves the village and removes its buildings.
- Divergence: no stone/ore/gold, no building tiers, no kingdoms, wars or diplomacy, and buildings are 1 tile. **Low**

### UI / HUD
- Implemented: year counter (600 ticks), population, sheep, village list (pop/cap, food, wood), hovered-tile info, power toolbar, speed buttons, seed input and New/Random world.

### Audio, save, multiplayer
- The reference uses FMOD (E5). v1 has no audio, no save system and no multiplayer.

## Engine facts about the reference (E5, file listing only)
Unity (Mono, managed `Assembly-CSharp.dll` with PDB), FMOD + Resonance Audio, Steamworks, Discord SDK,
Firebase Analytics, SQLite, mod folders in StreamingAssets. None of these were used or copied.
