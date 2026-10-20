import type { Sim } from './sim.ts';
import { W, H, DEEP, SHALLOW, SAND, SOIL, GRASS, HILLS, MOUNTAIN, SEA } from './world.ts';

export interface Camera { x: number; y: number; zoom: number }

export const KIND_NAMES = ['deep water', 'shallow water', 'sand', 'soil', 'grass', 'hills', 'mountain'];

const BASE: number[][] = [];
BASE[DEEP] = [28, 58, 128];
BASE[SHALLOW] = [52, 104, 196];
BASE[SAND] = [226, 208, 138];
BASE[SOIL] = [140, 104, 62];
BASE[GRASS] = [92, 170, 60];
BASE[HILLS] = [118, 132, 86];
BASE[MOUNTAIN] = [142, 142, 148];
const TREE = [36, 98, 40];
const BLD = { hall: [0, 0, 0], house: [150, 96, 52], farm: [222, 196, 84] };

const rgba = (r: number, g: number, b: number) =>
  (0xff000000 | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r)) >>> 0;

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  off = document.createElement('canvas');
  octx: CanvasRenderingContext2D;
  img: ImageData;
  px: Uint32Array;
  owner = new Int32Array(W * H);
  edge = new Uint8Array(W * H);
  frame = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.off.width = W;
    this.off.height = H;
    this.octx = this.off.getContext('2d')!;
    this.img = this.octx.createImageData(W, H);
    this.px = new Uint32Array(this.img.data.buffer);
  }

  draw(sim: Sim, cam: Camera, hover: { x: number; y: number }, brush: number) {
    const t = sim.t, px = this.px, z = cam.zoom, ctx = this.ctx;
    this.frame++;

    // Village territory: tint inside, stronger at the border.
    const vs = [...sim.villages.values()];
    this.owner.fill(-1);
    vs.forEach((v, n) => {
      const r = sim.radius(v);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = v.x + dx, y = v.y + dy, d2 = dx * dx + dy * dy;
          if (x < 0 || y < 0 || x >= W || y >= H || d2 > r * r) continue;
          this.owner[y * W + x] = n;
          this.edge[y * W + x] = +(d2 > (r - 1) * (r - 1));
        }
    });

    for (let i = 0; i < W * H; i++) {
      const h = t.height[i];
      let c = BASE[t.kind(i)];
      // Per-tile speckle for a pixel-art texture; water darkens with depth.
      let s = h < SEA ? 0.65 + (h / SEA) * 0.45 : 0.93 + (((i * 2654435761) >>> 28) / 16) * 0.12;
      if (t.tree[i]) c = TREE;
      const b = t.building[i] >= 0 ? sim.buildings.get(t.building[i]) : undefined;
      if (b) {
        c = b.type === 'hall' ? sim.villages.get(b.village)?.color.map(v => v * 0.6) ?? BLD.house : BLD[b.type];
        s = 1;
      }
      let [r, g, bl] = [c[0] * s, c[1] * s, c[2] * s];
      const o = this.owner[i];
      if (o >= 0 && h >= SEA && !b) {
        const vc = vs[o].color, a = this.edge[i] ? 0.55 : 0.18;
        r += (vc[0] - r) * a;
        g += (vc[1] - g) * a;
        bl += (vc[2] - bl) * a;
      }
      if (t.fire[i]) [r, g, bl] = (i + this.frame) % 3 ? [255, 106, 0] : [255, 208, 0];
      px[i] = rgba(r | 0, g | 0, bl | 0);
    }
    this.octx.putImageData(this.img, 0, 0);

    ctx.fillStyle = '#0b1a3a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, -cam.x * z, -cam.y * z, W * z, H * z);

    const size = Math.max(2, z * 0.7), pad = (z - size) / 2;
    for (const u of sim.units) {
      if (!u.alive) continue;
      const v = sim.villages.get(u.village);
      ctx.fillStyle = u.kind === 'sheep' ? '#f4f4f4' : v ? `rgb(${v.color})` : '#d9a066';
      ctx.fillRect((u.x - cam.x) * z + pad, (u.y - cam.y) * z + pad, size, size);
    }

    for (const e of sim.effects) {
      const sx = (e.x - cam.x + 0.5) * z, sy = (e.y - cam.y + 0.5) * z;
      if (e.type === 'bolt') {
        ctx.strokeStyle = `rgba(255,255,200,${e.ttl / 8})`;
        ctx.lineWidth = Math.max(2, z / 2);
        ctx.beginPath();
        ctx.moveTo(sx, sy - 400);
        for (let k = 1; k <= 6; k++) ctx.lineTo(sx + (((k * 7919 + e.x) % 5) - 2) * z, sy - 400 + (400 * k) / 6);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(120,170,255,${e.ttl / 25})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 4.5 * z, 0, Math.PI * 2);
        ctx.fill();
      }
      e.ttl--;
    }
    sim.effects = sim.effects.filter(e => e.ttl > 0);

    if (hover.x >= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc((hover.x - cam.x + 0.5) * z, (hover.y - cam.y + 0.5) * z, (brush + 0.5) * z, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
