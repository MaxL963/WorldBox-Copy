import { Rng } from './rng.ts';

export const W = 256;
export const H = 192;

export const DEEP = 0, SHALLOW = 1, SAND = 2, SOIL = 3, GRASS = 4, HILLS = 5, MOUNTAIN = 6;
// Height bands: deep < 70 <= shallow < SEA <= sand < SHORE <= soil/grass < HILL <= hills < PEAK <= mountain
export const SEA = 100;
export const SHORE = 110;
export const HILL = 170;
export const PEAK = 200;

export const idx = (x: number, y: number) => y * W + x;
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

export class Terrain {
  height = new Uint8Array(W * H);
  grass = new Uint8Array(W * H);
  tree = new Uint8Array(W * H);
  fire = new Uint8Array(W * H); // burn ticks left
  building = new Int32Array(W * H).fill(-1);

  kind(i: number): number {
    const h = this.height[i];
    if (h < 70) return DEEP;
    if (h < SEA) return SHALLOW;
    if (h < SHORE) return SAND;
    if (h < HILL) return this.grass[i] ? GRASS : SOIL;
    if (h < PEAK) return HILLS;
    return MOUNTAIN;
  }
  walkable(i: number) {
    const h = this.height[i];
    return h >= SEA && h < PEAK;
  }
  fertile(i: number) {
    const h = this.height[i];
    return h >= SHORE && h < HILL;
  }
  buildable(i: number) {
    return this.fertile(i) && !this.tree[i] && this.building[i] < 0 && !this.fire[i];
  }
  burnable(i: number) {
    return this.tree[i] > 0 || this.grass[i] > 0 || this.building[i] >= 0;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Value noise: random lattice, smoothstep-bilinear interpolation.
function noise(rng: Rng, cell: number): Float32Array {
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy);
      const sx = smooth(fx - x0), sy = smooth(fy - y0), o = y0 * gw + x0;
      out[idx(x, y)] = lerp(lerp(g[o], g[o + 1], sx), lerp(g[o + gw], g[o + gw + 1], sx), sy);
    }
  return out;
}

export function generate(t: Terrain, rng: Rng) {
  const octaves = ([[48, 0.5], [24, 0.25], [12, 0.15], [6, 0.1]] as const).map(([c, w]) => [noise(rng, c), w] as const);
  const moist = noise(rng, 32), forest = noise(rng, 10);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      let n = 0;
      for (const [o, w] of octaves) n += o[i] * w;
      // Island falloff so map edges are ocean.
      const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
      const d = Math.min(1, Math.hypot(dx, dy));
      const e = Math.max(Math.abs(dx), Math.abs(dy));
      const h = n * 1.2 - d * d * 0.55 + 0.04 - Math.max(0, e - 0.85) * 3;
      t.height[i] = Math.max(0, Math.min(255, Math.round(h * 255)));
      if (t.fertile(i) && moist[i] > 0.3) t.grass[i] = 1;
      if (t.grass[i] && forest[i] > 0.58) t.tree[i] = 1;
    }
}
