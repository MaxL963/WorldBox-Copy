# Progress

## Status (2026-10-21)
v1 core loop playable. Run: `npm install`, then `npm run dev`, then open http://localhost:5179.

| Area | State | Verified by |
|---|---|---|
| Terrain gen (island, bands, grass, forest) | done | `test/sim.test.ts` "generated world…" (5 seeds) |
| Terraform raise/lower, flooding, drowning | done | unit test + e2e drag |
| Fire spread / burn-out / water barrier | done | unit test |
| Rain, lightning, fire, seeds | done | unit tests + e2e lightning |
| Sheep grazing + breeding | done | unit test |
| Villages: found, join, jobs, houses, farms, births, settlers | done | unit test + 30k-tick soak (≈10 villages, ~550 humans, 0.7 ms/tick) |
| Camera pan/zoom, toolbar, speeds, pause, HUD | done | `test/e2e.mjs` (Edge) |
| Determinism per seed | done | unit test (hash after 1500 ticks) |

Tests: `npm test` (8 unit tests, all pass). `npm run e2e` (needs `npm run dev` running and Edge, 0 console errors).

## Known differences from the reference
- Greedy movement: units can stall behind lakes.
- Hunting wipes out sheep over long runs, and nothing respawns them.
- Small villages with no trees nearby can't grow (wood-starved).
- Hall loss deletes the whole village instead of leaving ruins.
- Nomads forage for free on grass.

## Unknowns (need a legit copy + REA, or better public sources)
- Every rate in `CFG`: fire spread, hunger, lifespan, birth timing, build costs.
- Exact tile set and height bands. Brush sizes and terraform strength.
- Village founding conditions, territory growth rule, job priorities.
- Camera zoom limits and feel.

## Backlog (priority order)
1. A* pathfinding (fixes stalls, makes cross-island migration possible).
2. Multi-tile buildings + building tiers (hall → castle), stone/ore/gold resources and mines.
3. Kingdoms: villages claim land, borders, wars between kingdoms.
4. More races and animals, plus a predator.
5. Biomes (snow, desert, swamp) and more powers (acid, tornado, earthquake, lava, meteor).
6. Save/load (serialize Terrain arrays + units).
7. Sound effects (original), boats.
8. If you supply an owned copy: use REA to check `CFG` values and the terrain bands, then update their confidence.
