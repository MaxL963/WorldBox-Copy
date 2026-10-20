import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { W, H, idx, SEA, SHORE } from '../src/world.ts';

// Empty sim with uniform terrain: everything water unless painted.
function flat(height = 50): Sim {
  const s = new Sim(1);
  s.units = [];
  s.t.height.fill(height);
  s.t.grass.fill(0);
  s.t.tree.fill(0);
  return s;
}
function land(s: Sim, x0: number, y0: number, x1: number, y1: number, grass = 1, tree = 0) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      s.t.height[i] = 140;
      s.t.grass[i] = grass;
      s.t.tree[i] = tree;
    }
}
const run = (s: Sim, n: number) => { for (let k = 0; k < n; k++) s.step(); };
const humans = (s: Sim) => s.units.filter(u => u.kind === 'human').length;

test('same seed replays identically; different seed differs', () => {
  const a = new Sim(42), b = new Sim(42), c = new Sim(43);
  for (const s of [a, b]) { s.power('human', 128, 96); s.power('human', 129, 96); }
  run(a, 1500); run(b, 1500); run(c, 10);
  assert.equal(a.hash(), b.hash());
  assert.notEqual(a.hash(), c.hash());
});

test('generated world is an island with mixed terrain', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = new Sim(seed);
    let dry = 0, trees = 0, edgeDry = 0;
    for (let i = 0; i < W * H; i++) { if (s.t.height[i] >= SEA) dry++; trees += s.t.tree[i]; }
    for (let x = 0; x < W; x++) edgeDry += +(s.t.height[idx(x, 0)] >= SEA) + +(s.t.height[idx(x, H - 1)] >= SEA);
    const f = dry / (W * H);
    assert.ok(f > 0.25 && f < 0.7, `seed ${seed} land fraction ${f}`);
    assert.ok(trees > 200, `seed ${seed} trees ${trees}`);
    assert.equal(edgeDry, 0, `seed ${seed} map edge must be water`);
  }
});

test('fire burns a forest strip end to end and never crosses water', () => {
  const s = flat();
  land(s, 10, 9, 60, 11, 1, 1);
  land(s, 62, 9, 70, 11, 1, 1); // separated by a water gap at x=61
  s.power('fire', 10, 10);
  run(s, 600);
  for (let x = 10; x <= 60; x++) assert.equal(s.t.tree[idx(x, 10)], 0, `tree at ${x} should burn`);
  for (let x = 62; x <= 70; x++) assert.equal(s.t.tree[idx(x, 10)], 1, `tree at ${x} across water should survive`);
  assert.equal(s.t.fire.reduce((a, b) => a + b, 0), 0, 'fire burns out');
});

test('rain puts out fire and greens soil', () => {
  const s = flat();
  land(s, 10, 10, 30, 30, 0, 1);
  s.power('fire', 20, 20);
  s.step();
  s.power('rain', 20, 20);
  assert.equal(s.t.fire[idx(20, 20)], 0);
  assert.equal(s.t.grass[idx(22, 20)], 1);
});

test('lowering land floods it and drowns units; raising water makes soil', () => {
  const s = flat();
  land(s, 10, 10, 30, 30);
  s.power('sheep', 20, 20);
  for (let k = 0; k < 20; k++) s.power('lower', 20, 20);
  assert.ok(s.t.height[idx(20, 20)] < SEA);
  s.step();
  assert.equal(s.units.length, 0, 'sheep drowned');
  const w = flat();
  for (let k = 0; k < 10; k++) w.power('raise', 100, 100);
  const i = idx(100, 100);
  assert.ok(w.t.height[i] >= SHORE);
  assert.equal(w.t.grass[i], 0, 'raised land starts as bare soil');
});

test('lightning kills units in radius and sets trees alight', () => {
  const s = flat();
  land(s, 10, 10, 30, 30, 1, 1);
  s.power('human', 20, 20);
  s.power('human', 26, 20);
  s.power('lightning', 20, 20);
  assert.ok(s.t.fire[idx(20, 20)] > 0);
  s.step();
  assert.equal(humans(s), 1);
});

test('sheep graze grass and multiply', () => {
  const s = flat();
  land(s, 10, 10, 60, 60);
  for (let k = 0; k < 5; k++) s.power('sheep', 30 + k, 30);
  run(s, 1500);
  let grass = 0;
  for (let y = 10; y <= 60; y++) for (let x = 10; x <= 60; x++) grass += s.t.grass[idx(x, y)];
  assert.ok(grass < 51 * 51, 'some grass eaten');
  assert.ok(s.sheepCount > 5, `sheep ${s.sheepCount}`);
});

test('humans found a village, build, and grow', () => {
  const s = flat();
  land(s, 40, 40, 120, 120, 1, 0);
  for (let y = 40; y <= 120; y += 2) for (let x = 40; x <= 120; x += 3) if ((x + y) % 5 === 0) s.t.tree[idx(x, y)] = 1;
  for (let k = 0; k < 6; k++) s.power('human', 80 + k, 80);
  for (let k = 0; k < 6; k++) s.power('sheep', 70 + k, 70);
  run(s, 6000);
  const vs = [...s.villages.values()];
  const houses = [...s.buildings.values()].filter(b => b.type === 'house').length;
  const farms = [...s.buildings.values()].filter(b => b.type === 'farm').length;
  assert.ok(vs.length >= 1, 'a village exists');
  assert.ok(houses >= 1 && farms >= 1, `houses ${houses} farms ${farms}`);
  assert.ok(humans(s) > 6, `humans ${humans(s)}`);
});
