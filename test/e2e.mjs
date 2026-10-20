import { chromium } from 'playwright-core';
// Needs `npm run dev` running. Uses installed Edge. Screenshots go to the dir given as arg (default: .).
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5179/');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/1-start.png` });
const g = (fn) => page.evaluate(fn);
// tile -> screen
const scr = async (x, y) => g(`(() => { const c = game.cam; return [(${x} - c.x + 0.5) * c.zoom, (${y} - c.y + 0.5) * c.zoom]; })()`);
// find buildable spot via sim
const spot = await g(`(() => { const s = game.sim; for (let y = 70; y < 120; y++) for (let x = 100; x < 160; x++) if (s.t.buildable(y*256+x)) return [x, y]; })()`);
await page.keyboard.press('7');
for (let k = 0; k < 6; k++) { const [sx, sy] = await scr(spot[0] + k, spot[1]); await page.mouse.click(sx, sy); }
const humans0 = await g(`game.sim.units.filter(u => u.kind === 'human').length`);
// terraform by drag with Raise tool
await page.keyboard.press('1');
const h0 = await g(`game.sim.t.height[${(spot[1] + 30) * 256 + spot[0]}]`);
{ const [sx, sy] = await scr(spot[0], spot[1] + 30); await page.mouse.move(sx, sy); await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up(); }
const h1 = await g(`game.sim.t.height[${(spot[1] + 30) * 256 + spot[0]}]`);
// zoom with wheel
const z0 = await g('game.cam.zoom'); await page.mouse.move(640, 400); await page.mouse.wheel(0, -300); await page.waitForTimeout(100); const z1 = await g('game.cam.zoom');
await page.mouse.wheel(0, 300); await page.waitForTimeout(100);
// run fast
await page.click('text=5x');
await page.waitForTimeout(20000);
const st = await g(`(() => { const s = game.sim; return { tick: s.tick, humans: s.units.filter(u => u.kind === 'human').length, villages: s.villages.size, buildings: s.buildings.size }; })()`);
await page.screenshot({ path: `${out}/2-villages.png` });
// lightning on a forest
const forest = await g(`(() => { const s = game.sim; for (let i = 0; i < 256*192; i++) if (s.t.tree[i] && s.t.tree[i+1] && s.t.tree[i+256]) return [i % 256, (i / 256) | 0]; })()`);
await page.keyboard.press('6');
{ const [sx, sy] = await scr(forest[0], forest[1]); await page.mouse.click(sx, sy); }
await page.waitForTimeout(150);
const fire = await g(`game.sim.t.fire.reduce((a, b) => a + (b > 0), 0)`);
await page.screenshot({ path: `${out}/3-lightning.png` });
await page.keyboard.press('Space');
const paused = await g('game.sim.tick'); await page.waitForTimeout(500); const paused2 = await g('game.sim.tick');
console.log(JSON.stringify({ errors, humans0, h0, h1, z0, z1, st, fire, pausedHolds: paused === paused2 }));
await browser.close();
