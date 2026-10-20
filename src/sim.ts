import { Rng } from './rng.ts';
import { Terrain, W, H, idx, inside, generate } from './world.ts';

export type Tool = 'raise' | 'lower' | 'tree' | 'rain' | 'fire' | 'lightning' | 'human' | 'sheep';
type Task = 'idle' | 'wander' | 'eat' | 'chop' | 'hunt' | 'farm' | 'build' | 'return';
type BType = 'hall' | 'house' | 'farm';

export interface Unit {
  id: number; kind: 'human' | 'sheep'; x: number; y: number;
  hunger: number; age: number; maxAge: number; alive: boolean;
  village: number; task: Task; tx: number; ty: number; target: number;
  build: BType; food: number; wood: number; work: number; stuck: number; moveCd: number;
}
export interface Building { id: number; type: BType; x: number; y: number; village: number; hp: number }
export interface Village {
  id: number; name: string; x: number; y: number; food: number; wood: number; color: number[];
  pop: number; cap: number; farms: number; size: number;
}
export interface Effect { type: 'bolt' | 'rain'; x: number; y: number; ttl: number }

// Calibration knobs. Public sources give no numbers, so every value here is tuned by feel (see SPEC.md).
export const CFG = {
  humanLife: [3000, 5000], sheepLife: [1500, 2500],
  hungry: 250, starve: 1200, sheepHungry: 150, sheepStarve: 900,
  hallCap: 4, houseCap: 4, houseCost: 8, farmCost: 4, birthCost: 4, birthEvery: 60,
  villageSpacing: 22, joinRadius: 30, foundRadius: 5, foundMinTiles: 40,
  farmWork: 20, farmYield: 3, huntYield: 4, maxSheep: 300, lambChance: 0.25,
  burnTicks: 20, spread: { tree: 0.3, building: 0.15, grass: 0.08 },
  hp: { hall: 40, house: 20, farm: 10 } as Record<BType, number>,
  growSamples: 200, grassSpread: 0.3, treeSpread: 0.02,
  brush: 3, terraformStep: 8,
};

const COLORS = [[220, 60, 60], [60, 120, 230], [240, 200, 40], [170, 70, 200], [40, 190, 170], [240, 130, 40], [230, 90, 170], [120, 200, 60]];
const SYL = ['ka', 'lo', 'ren', 'dor', 'mi', 'sa', 'tu', 'vel', 'an', 'gor', 'is', 'bel', 'ur', 'mar', 'eth', 'ol'];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Sim {
  rng: Rng;
  t = new Terrain();
  units: Unit[] = [];
  buildings = new Map<number, Building>();
  villages = new Map<number, Village>();
  effects: Effect[] = [];
  tick = 0;
  nextId = 1;
  sheepCount = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    generate(this.t, this.rng);
    for (let n = 0; n < 40; n++) {
      const x = this.rng.int(W), y = this.rng.int(H);
      if (this.t.fertile(idx(x, y))) this.spawn('sheep', x, y);
    }
  }

  step() {
    this.tick++;
    this.census();
    this.fireStep();
    this.growStep();
    for (let n = 0; n < this.units.length; n++) {
      const u = this.units[n];
      if (!u.alive || !this.live(u)) continue;
      if (u.kind === 'sheep') this.sheep(u);
      else this.human(u);
    }
    this.villageStep();
    this.units = this.units.filter(u => u.alive);
  }

  spawn(kind: Unit['kind'], x: number, y: number, village = -1): Unit {
    const [a, b] = kind === 'human' ? CFG.humanLife : CFG.sheepLife;
    const u: Unit = {
      id: this.nextId++, kind, x, y, hunger: 0, age: 0, maxAge: a + this.rng.int(b - a), alive: true,
      village, task: 'idle', tx: x, ty: y, target: -1, build: 'house', food: 0, wood: 0, work: 0, stuck: 0, moveCd: 0,
    };
    this.units.push(u);
    return u;
  }

  // ---- god powers ----

  power(tool: Tool, cx: number, cy: number) {
    const t = this.t;
    switch (tool) {
      case 'raise':
      case 'lower':
        return this.terraform(cx, cy, tool === 'raise' ? CFG.terraformStep : -CFG.terraformStep);
      case 'tree':
        return this.brush(cx, cy, 2, i => {
          if (t.fertile(i) && t.building[i] < 0 && this.rng.next() < 0.3) t.grass[i] = t.tree[i] = 1;
        });
      case 'rain':
        this.effects.push({ type: 'rain', x: cx, y: cy, ttl: 10 });
        return this.brush(cx, cy, 4, i => {
          t.fire[i] = 0;
          if (!t.fertile(i)) return;
          if (!t.grass[i]) t.grass[i] = 1;
          else if (!t.tree[i] && t.building[i] < 0 && this.rng.next() < 0.05) t.tree[i] = 1;
        });
      case 'fire':
        return this.brush(cx, cy, 1, i => this.ignite(i));
      case 'lightning':
        this.effects.push({ type: 'bolt', x: cx, y: cy, ttl: 8 });
        this.brush(cx, cy, 2, i => {
          this.ignite(i);
          if (t.building[i] >= 0) this.damage(t.building[i], 15);
        });
        for (const u of this.units) if (Math.abs(u.x - cx) <= 2 && Math.abs(u.y - cy) <= 2) u.alive = false;
        return;
      case 'human':
      case 'sheep':
        if (inside(cx, cy) && t.walkable(idx(cx, cy))) this.spawn(tool, cx, cy);
    }
  }

  ignite(i: number) {
    if (this.t.burnable(i) && !this.t.fire[i]) this.t.fire[i] = CFG.burnTicks;
  }

  private brush(cx: number, cy: number, r: number, fn: (i: number) => void) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r + r && inside(cx + dx, cy + dy)) fn(idx(cx + dx, cy + dy));
  }

  private terraform(cx: number, cy: number, amount: number) {
    const t = this.t, r = CFG.brush;
    this.brush(cx, cy, r, i => {
      const f = 1 - Math.hypot((i % W) - cx, ((i / W) | 0) - cy) / (r + 1);
      t.height[i] = Math.max(0, Math.min(255, t.height[i] + Math.round(amount * f)));
      if (t.fertile(i)) return;
      t.grass[i] = t.tree[i] = 0;
      if (!t.walkable(i)) t.fire[i] = 0;
      const b = this.buildings.get(t.building[i]);
      if (b) this.removeBuilding(b);
    });
  }

  // ---- world processes ----

  private fireStep() {
    const t = this.t, ign: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (!t.fire[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
        if (!inside(nx, ny)) continue;
        const j = idx(nx, ny);
        if (t.fire[j] || !t.burnable(j)) continue;
        const p = t.tree[j] ? CFG.spread.tree : t.building[j] >= 0 ? CFG.spread.building : CFG.spread.grass;
        if (this.rng.next() < p) ign.push(j);
      }
      if (t.building[i] >= 0) this.damage(t.building[i], 1);
      if (--t.fire[i] === 0) t.tree[i] = t.grass[i] = 0; // burnt ground = bare soil
    }
    for (const j of ign) t.fire[j] = CFG.burnTicks;
  }

  // ponytail: random-tile sampling for regrowth (like Minecraft random ticks); cheap, but rates are statistical.
  private growStep() {
    const t = this.t;
    for (let n = 0; n < CFG.growSamples; n++) {
      const x = this.rng.int(W), y = this.rng.int(H), i = idx(x, y);
      if (!t.fertile(i) || t.fire[i]) continue;
      let g = 0, tr = 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
        if (!inside(nx, ny)) continue;
        g += t.grass[idx(nx, ny)];
        tr += t.tree[idx(nx, ny)];
      }
      if (!t.grass[i]) {
        if (g && this.rng.next() < CFG.grassSpread) t.grass[i] = 1;
      } else if (!t.tree[i] && t.building[i] < 0 && tr && this.rng.next() < CFG.treeSpread) t.tree[i] = 1;
    }
  }

  private census() {
    this.sheepCount = 0;
    for (const v of this.villages.values()) v.pop = v.cap = v.farms = v.size = 0;
    for (const b of this.buildings.values()) {
      const v = this.villages.get(b.village);
      if (!v) continue;
      v.size++;
      if (b.type === 'farm') v.farms++;
      else v.cap += b.type === 'hall' ? CFG.hallCap : CFG.houseCap;
    }
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.kind === 'sheep') this.sheepCount++;
      else {
        const v = this.villages.get(u.village);
        if (v) v.pop++;
      }
    }
  }

  private villageStep() {
    for (const v of this.villages.values()) {
      if (v.pop === 0) {
        this.dissolve(v);
        continue;
      }
      if ((this.tick + v.id) % CFG.birthEvery !== 0) continue;
      if (v.food >= CFG.birthCost && v.pop < v.cap) {
        v.food -= CFG.birthCost;
        v.pop++;
        this.spawn('human', v.x, v.y, v.id);
      } else if (v.pop >= v.cap && v.food >= CFG.birthCost * 3) {
        // Full, well-fed village sends out a settler who wanders off to found a new one.
        v.food -= CFG.birthCost;
        this.spawn('human', v.x, v.y);
      }
    }
  }

  // ---- units ----

  private live(u: Unit): boolean {
    u.age++;
    u.hunger++;
    const i = idx(u.x, u.y), t = this.t;
    const starve = u.kind === 'human' ? CFG.starve : CFG.sheepStarve;
    if (u.age > u.maxAge || u.hunger > starve || !t.walkable(i) || t.fire[i]) u.alive = false;
    return u.alive;
  }

  private sheep(u: Unit) {
    if (u.moveCd > 0) {
      u.moveCd--;
      return;
    }
    u.moveCd = 1; // sheep move every other tick
    const t = this.t, i = idx(u.x, u.y);
    if (u.hunger > CFG.sheepHungry) {
      if (t.grass[i]) {
        t.grass[i] = 0;
        u.hunger = 0;
        if (this.sheepCount < CFG.maxSheep && this.rng.next() < CFG.lambChance) {
          this.spawn('sheep', u.x, u.y);
          this.sheepCount++;
        }
        return;
      }
      if (u.task !== 'eat') {
        const p = this.nearest(u.x, u.y, 8, j => t.grass[j] > 0);
        if (p) this.go(u, 'eat', p[0], p[1]);
      }
    }
    if (u.task === 'idle') this.wander(u, u.x, u.y, 6);
    if (this.moveTo(u, u.tx, u.ty) || u.stuck > 10) u.task = 'idle';
  }

  private human(u: Unit) {
    const v = this.villages.get(u.village);
    if (!v) {
      u.village = -1;
      return this.nomad(u);
    }
    if (u.task === 'idle') this.pickJob(u, v);
    this.doTask(u, v);
  }

  private nomad(u: Unit) {
    const t = this.t;
    // ponytail: nomads forage for free on grass (no berry bushes yet).
    if (u.hunger > CFG.hungry && t.grass[idx(u.x, u.y)]) u.hunger = 0;
    for (const v of this.villages.values())
      if (v.pop < v.cap && (v.x - u.x) ** 2 + (v.y - u.y) ** 2 < CFG.joinRadius ** 2) {
        u.village = v.id;
        u.task = 'idle';
        v.pop++;
        return;
      }
    if (u.age % 10 === 0 && this.canFound(u.x, u.y)) return this.found(u);
    if (u.task !== 'wander') this.wander(u, u.x, u.y, 10);
    if (this.moveTo(u, u.tx, u.ty) || u.stuck > 10) u.task = 'idle';
  }

  private canFound(x: number, y: number): boolean {
    const t = this.t, r = CFG.foundRadius;
    if (!t.buildable(idx(x, y))) return false;
    for (const v of this.villages.values()) if ((v.x - x) ** 2 + (v.y - y) ** 2 < CFG.villageSpacing ** 2) return false;
    let n = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (inside(x + dx, y + dy) && t.buildable(idx(x + dx, y + dy))) n++;
    return n >= CFG.foundMinTiles;
  }

  private found(u: Unit) {
    const id = this.nextId++;
    const name = Array.from({ length: 2 + this.rng.int(2) }, () => SYL[this.rng.int(SYL.length)]).join('');
    this.villages.set(id, {
      id, name: name[0].toUpperCase() + name.slice(1), x: u.x, y: u.y, food: 6, wood: 0,
      color: COLORS[id % COLORS.length], pop: 1, cap: CFG.hallCap, farms: 0, size: 1,
    });
    this.place('hall', u.x, u.y, id);
    u.village = id;
    u.task = 'idle';
  }

  radius(v: Village) {
    return Math.min(16, 4 + v.size);
  }

  private pickJob(u: Unit, v: Village) {
    const t = this.t, r = this.radius(v);
    if (u.hunger > CFG.hungry && v.food > 0) return this.go(u, 'eat', v.x, v.y);
    if (v.pop >= v.cap - 1 && v.wood >= CFG.houseCost && this.buildJob(u, v, 'house', r)) return;
    if (v.farms < Math.ceil(v.pop / 3) && v.wood >= CFG.farmCost && this.buildJob(u, v, 'farm', r)) return;
    if (v.food < v.pop * 3 && this.rng.next() < 0.7) {
      const farms = [...this.buildings.values()].filter(b => b.village === v.id && b.type === 'farm');
      if (farms.length) {
        const f = farms[this.rng.int(farms.length)];
        return this.go(u, 'farm', f.x, f.y, f.id);
      }
      const s = this.nearestSheep(u.x, u.y, 20);
      if (s) return this.go(u, 'hunt', s.x, s.y, s.id);
    }
    const p = this.nearest(u.x, u.y, r + 6, j => t.tree[j] > 0 && !t.fire[j]);
    if (p) return this.go(u, 'chop', p[0], p[1]);
    this.wander(u, v.x, v.y, r);
  }

  private buildJob(u: Unit, v: Village, type: BType, r: number): boolean {
    const p = this.nearest(v.x, v.y, r, j => this.t.buildable(j));
    if (!p) return false;
    this.go(u, 'build', p[0], p[1]);
    u.build = type;
    return true;
  }

  private doTask(u: Unit, v: Village) {
    const t = this.t;
    if (u.task === 'hunt') {
      const s = this.units.find(s => s.id === u.target);
      if (!s || !s.alive) return void (u.task = 'idle');
      u.tx = s.x;
      u.ty = s.y;
      if (Math.abs(s.x - u.x) <= 1 && Math.abs(s.y - u.y) <= 1) {
        s.alive = false;
        u.food = CFG.huntYield;
        return this.go(u, 'return', v.x, v.y);
      }
    }
    if (u.task === 'farm' && u.work > 0) {
      if (--u.work === 0) {
        u.food = CFG.farmYield;
        this.go(u, 'return', v.x, v.y);
      }
      return;
    }
    const arrived = this.moveTo(u, u.tx, u.ty);
    if (u.stuck > 20) return void (u.task = 'idle');
    if (!arrived) return;
    const i = idx(u.x, u.y);
    switch (u.task) {
      case 'eat':
        if (v.food > 0) {
          v.food--;
          u.hunger = 0;
        }
        u.task = 'idle';
        break;
      case 'chop':
        if (t.tree[i]) {
          t.tree[i] = 0;
          u.wood = 1;
          this.go(u, 'return', v.x, v.y);
        } else u.task = 'idle';
        break;
      case 'farm':
        if (this.buildings.has(u.target)) u.work = CFG.farmWork;
        else u.task = 'idle';
        break;
      case 'build': {
        const cost = u.build === 'house' ? CFG.houseCost : CFG.farmCost;
        if (t.buildable(i) && v.wood >= cost) {
          v.wood -= cost;
          this.place(u.build, u.x, u.y, v.id);
        }
        u.task = 'idle';
        break;
      }
      case 'return':
        v.food += u.food;
        v.wood += u.wood;
        u.food = u.wood = 0;
        u.task = 'idle';
        break;
      default:
        u.task = 'idle';
    }
  }

  private go(u: Unit, task: Task, tx: number, ty: number, target = -1) {
    u.task = task;
    u.tx = tx;
    u.ty = ty;
    u.target = target;
    u.stuck = 0;
  }

  private wander(u: Unit, cx: number, cy: number, r: number) {
    const x = Math.max(0, Math.min(W - 1, cx + this.rng.int(2 * r + 1) - r));
    const y = Math.max(0, Math.min(H - 1, cy + this.rng.int(2 * r + 1) - r));
    this.go(u, 'wander', x, y);
  }

  // ponytail: greedy 8-direction stepping, no pathfinding; units can get stuck behind lakes. Add A* if it matters.
  private moveTo(u: Unit, tx: number, ty: number): boolean {
    if (u.x === tx && u.y === ty) return true;
    let best = -1, bd = (u.x - tx) ** 2 + (u.y - ty) ** 2;
    for (let k = 0; k < 8; k++) {
      const x = u.x + DIRS[k][0], y = u.y + DIRS[k][1];
      if (!this.passable(x, y)) continue;
      const d = (x - tx) ** 2 + (y - ty) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best < 0) {
      u.stuck++;
      const k = this.rng.int(8), x = u.x + DIRS[k][0], y = u.y + DIRS[k][1];
      if (this.passable(x, y)) {
        u.x = x;
        u.y = y;
      }
      return false;
    }
    u.x += DIRS[best][0];
    u.y += DIRS[best][1];
    return u.x === tx && u.y === ty;
  }

  private passable(x: number, y: number) {
    if (!inside(x, y)) return false;
    const i = idx(x, y);
    return this.t.walkable(i) && !this.t.fire[i];
  }

  // Nearest tile by Chebyshev rings; scans only each ring's perimeter.
  nearest(x: number, y: number, r: number, pred: (i: number) => boolean): [number, number] | null {
    const ok = (nx: number, ny: number) => inside(nx, ny) && pred(idx(nx, ny));
    if (ok(x, y)) return [x, y];
    for (let d = 1; d <= r; d++) {
      for (let k = -d; k <= d; k++) {
        if (ok(x + k, y - d)) return [x + k, y - d];
        if (ok(x + k, y + d)) return [x + k, y + d];
      }
      for (let k = -d + 1; k < d; k++) {
        if (ok(x - d, y + k)) return [x - d, y + k];
        if (ok(x + d, y + k)) return [x + d, y + k];
      }
    }
    return null;
  }

  private nearestSheep(x: number, y: number, r: number): Unit | undefined {
    let best: Unit | undefined, bd = r * r;
    for (const s of this.units) {
      if (s.kind !== 'sheep' || !s.alive) continue;
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  // ---- buildings ----

  private place(type: BType, x: number, y: number, village: number) {
    const id = this.nextId++, i = idx(x, y);
    this.buildings.set(id, { id, type, x, y, village, hp: CFG.hp[type] });
    this.t.building[i] = id;
    this.t.tree[i] = 0;
  }

  private damage(id: number, n: number) {
    const b = this.buildings.get(id);
    if (b && (b.hp -= n) <= 0) this.removeBuilding(b);
  }

  private removeBuilding(b: Building) {
    this.t.building[idx(b.x, b.y)] = -1;
    this.buildings.delete(b.id);
    const v = this.villages.get(b.village);
    if (b.type === 'hall' && v) this.dissolve(v);
  }

  // ponytail: losing the hall wipes the village and its buildings; the real game leaves ruins/rebuilds.
  private dissolve(v: Village) {
    this.villages.delete(v.id);
    for (const b of [...this.buildings.values()]) if (b.village === v.id) this.removeBuilding(b);
    for (const u of this.units)
      if (u.village === v.id) {
        u.village = -1;
        u.task = 'idle';
      }
  }

  hash(): number {
    let h = 2166136261;
    const mix = (n: number) => (h = Math.imul(h ^ n, 16777619));
    const t = this.t;
    for (let i = 0; i < W * H; i++) mix(t.height[i] | (t.grass[i] << 8) | (t.tree[i] << 9) | (t.fire[i] << 10));
    for (const u of this.units) mix(u.x | (u.y << 8) | (u.hunger << 16));
    return h >>> 0;
  }
}
