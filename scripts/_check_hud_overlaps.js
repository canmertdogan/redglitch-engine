/**
 * Verifies every screen in main.redui has NO overlapping elements (except intentional
 * enclosing container panels / fullscreen scrims) and stays inside the base resolution.
 */
const fs = require('fs');
const path = require('path');
const { validateScreenLayout } = require('../public/shared/UITemplates.js');
const FILE = path.resolve(__dirname, '../projects/Default Project/interfaces/main.redui');
const cfg = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const res = cfg.resolution || { w: 800, h: 450 };

let totalOverlaps = 0;
let totalOob = 0;
let totalElements = 0;

for (const [sid, screen] of Object.entries(cfg.screens || {})) {
  const count = (screen.elements || []).length;
  totalElements += count;
  const result = validateScreenLayout(screen, res);
  result.overlaps.forEach(o => {
    totalOverlaps++;
    console.log(`[${sid}] OVERLAP: ${o.a} x ${o.b} [${o.ix}x${o.iy}px]`);
  });
  result.outOfBounds.forEach(b => {
    totalOob++;
    console.log(`[${sid}] OUT OF BOUNDS: ${b.id} -> (${b.x1},${b.y1})-(${b.x2},${b.y2})`);
  });
}

console.log(`\nscreens: ${Object.keys(cfg.screens || {}).length}, elements: ${totalElements}, overlaps: ${totalOverlaps}, out-of-bounds: ${totalOob}`);
console.log(totalOverlaps === 0 && totalOob === 0 ? 'LAYOUT OK (solid, non-overlapping, in-bounds)' : 'LAYOUT HAS ISSUES');
process.exit(totalOverlaps === 0 && totalOob === 0 ? 0 : 1);
