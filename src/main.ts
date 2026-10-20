import { Sim, CFG, type Tool } from './sim.ts';
import { Renderer, KIND_NAMES, type Camera } from './render.ts';
import { W, H, idx, inside } from './world.ts';

const TICK_MS = 100; // 10 sim ticks per second at 1x
const TOOLS: [Tool, string, number][] = [
  ['raise', 'Raise land', CFG.brush], ['lower', 'Lower land', CFG.brush], ['tree', 'Seeds', 2], ['rain', 'Rain', 4],
  ['fire', 'Fire', 1], ['lightning', 'Lightning', 2], ['human', 'Human', 0], ['sheep', 'Sheep', 0],
];
const SPEEDS = [0, 1, 2, 5];
const REPEAT_MS: Partial<Record<Tool, number>> = { lightning: Infinity, human: 150, sheep: 150 };

const canvas = document.getElementById('view') as HTMLCanvasElement;
const seedInput = document.getElementById('seed') as HTMLInputElement;
const statsEl = document.getElementById('stats')!;
const renderer = new Renderer(canvas);
const cam: Camera = { x: 0, y: 0, zoom: 4 };
const hover = { x: -1, y: -1 };
const keys = new Set<string>();
let sim = new Sim(+seedInput.value);
let tool: Tool = 'raise';
let speed = 1;
let painting = false, panning = false, lastPaint = 0, lastX = 0, lastY = 0;

function fit() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  cam.zoom = Math.max(2, Math.min(innerWidth / W, innerHeight / H));
  cam.x = (W - innerWidth / cam.zoom) / 2;
  cam.y = (H - innerHeight / cam.zoom) / 2;
}

function setTool(t: Tool) {
  tool = t;
  document.querySelectorAll<HTMLButtonElement>('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
}
function setSpeed(s: number) {
  speed = s;
  document.querySelectorAll<HTMLButtonElement>('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed! === s));
}
function newWorld(seed: number) {
  sim = new Sim(seed);
  seedInput.value = String(seed);
}

const toolsEl = document.getElementById('tools')!;
TOOLS.forEach(([t, label], n) => {
  const b = document.createElement('button');
  b.dataset.tool = t;
  b.textContent = `${n + 1} ${label}`;
  b.onclick = () => setTool(t);
  toolsEl.append(b);
});
const speedEl = document.getElementById('speed')!;
for (const s of SPEEDS) {
  const b = document.createElement('button');
  b.dataset.speed = String(s);
  b.textContent = s ? `${s}x` : 'Pause';
  b.onclick = () => setSpeed(s);
  speedEl.append(b);
}
document.getElementById('regen')!.onclick = () => newWorld(+seedInput.value || 1);
document.getElementById('random')!.onclick = () => newWorld((Math.random() * 1e9) | 0);

const toTile = (e: MouseEvent) => [Math.floor(cam.x + e.clientX / cam.zoom), Math.floor(cam.y + e.clientY / cam.zoom)];

function paint(now: number) {
  if (!inside(hover.x, hover.y)) return;
  sim.power(tool, hover.x, hover.y);
  lastPaint = now;
}

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  [hover.x, hover.y] = toTile(e);
  if (e.button === 0) {
    painting = true;
    paint(performance.now());
  } else {
    panning = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }
});
canvas.addEventListener('pointermove', e => {
  [hover.x, hover.y] = toTile(e);
  if (!panning) return;
  cam.x -= (e.clientX - lastX) / cam.zoom;
  cam.y -= (e.clientY - lastY) / cam.zoom;
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener('pointerup', () => (painting = panning = false));
canvas.addEventListener('pointerleave', () => (hover.x = -1));
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const wx = cam.x + e.clientX / cam.zoom, wy = cam.y + e.clientY / cam.zoom;
  cam.zoom = Math.max(1.5, Math.min(40, cam.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
  cam.x = wx - e.clientX / cam.zoom;
  cam.y = wy - e.clientY / cam.zoom;
}, { passive: false });

addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  const n = +e.key;
  if (n >= 1 && n <= TOOLS.length) setTool(TOOLS[n - 1][0]);
  if (e.code === 'Space') {
    e.preventDefault();
    setSpeed(speed ? 0 : 1);
  }
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('resize', () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
});

function updateStats() {
  const humans = sim.units.filter(u => u.alive && u.kind === 'human').length;
  const vs = [...sim.villages.values()].sort((a, b) => b.pop - a.pop);
  let tile = '';
  if (inside(hover.x, hover.y)) {
    const i = idx(hover.x, hover.y), t = sim.t;
    tile = `${hover.x},${hover.y} ${KIND_NAMES[t.kind(i)]}${t.tree[i] ? ' + tree' : ''}${t.fire[i] ? ' (burning)' : ''}`;
  }
  statsEl.innerHTML =
    `<b>Year ${Math.floor(sim.tick / 600)}</b> · tick ${sim.tick}<br>` +
    `Humans ${humans} · Sheep ${sim.sheepCount} · Villages ${vs.length}<br>` +
    vs.slice(0, 6).map(v => `<span style="color:rgb(${v.color})">■</span> ${v.name} ${v.pop}/${v.cap} · food ${v.food} · wood ${v.wood}`).join('<br>') +
    (tile ? `<br><i>${tile}</i>` : '');
}

let acc = 0, last = performance.now();
function frame(now: number) {
  acc += Math.min(250, now - last) * speed;
  last = now;
  let n = 0;
  while (acc >= TICK_MS && n < 50) {
    sim.step();
    acc -= TICK_MS;
    n++;
  }
  if (n === 50) acc = 0; // can't keep up: drop backlog instead of spiraling
  const pan = 12 / cam.zoom;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) cam.x -= pan;
  if (keys.has('KeyD') || keys.has('ArrowRight')) cam.x += pan;
  if (keys.has('KeyW') || keys.has('ArrowUp')) cam.y -= pan;
  if (keys.has('KeyS') || keys.has('ArrowDown')) cam.y += pan;
  if (painting && now - lastPaint >= (REPEAT_MS[tool] ?? 60)) paint(now);
  renderer.draw(sim, cam, hover, TOOLS.find(t => t[0] === tool)![2]);
  if (renderer.frame % 10 === 0) updateStats();
  requestAnimationFrame(frame);
}

fit();
setTool('raise');
setSpeed(1);
requestAnimationFrame(frame);

// Test hook for browser automation.
(window as any).game = { get sim() { return sim; }, cam, setTool, setSpeed, newWorld };
