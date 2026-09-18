/**
 * Verifies the main_hud layout has NO overlapping elements (except intentional
 * overlays). Computes each element's true AABB in 800x450 base coords using the
 * SAME anchor math GameHUD.js uses, then reports pairwise intersections.
 *
 *   exit 0 = no overlaps (solid, non-overlapping layout)
 *   exit 1 = at least one overlap (prints the colliding pairs)
 */
const fs = require('fs');
const path = require('path');
const FILE = path.resolve(__dirname, '../projects/Default Project/interfaces/main.redui');
const cfg = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const W = cfg.resolution.w, H = cfg.resolution.h;

// Mirror of GameHUD._getAnchorTransform + _buildElement positioning.
const ANCHOR = {
  'top-left':      { top: 0,    left: 0,    tx: 0,   ty: 0 },
  'top-center':    { top: 0,    left: '50%', tx: -0.5, ty: 0 },
  'top-right':     { top: 0,    left: '100%', tx: -1,  ty: 0 },
  'center-left':   { top: '50%', left: 0,    tx: 0,   ty: -0.5 },
  'center':        { top: '50%', left: '50%', tx: -0.5, ty: -0.5 },
  'center-right':  { top: '50%', left: '100%', tx: -1,  ty: -0.5 },
  'bottom-left':   { top: '100%', left: 0,    tx: 0,   ty: -1 },
  'bottom-center': { top: '100%', left: '50%', tx: -0.5, ty: -1 },
  'bottom-right':  { top: '100%', left: '100%', tx: -1,  ty: -1 },
};
// Compute left/top in px (handles %, translate fractions, margin).
function aabb(e) {
  const r = e.rect || { x: 0, y: 0, w: 100, h: 30 };
  const a = ANCHOR[e.anchor || 'top-left'];
  const leftPct = a.left === '50%' ? 0.5 * W : a.left === '100%' ? W : 0;
  const topPct = a.top === '50%' ? 0.5 * H : a.top === '100%' ? H : 0;
  let left = leftPct + a.tx * r.w;
  let top = topPct + a.ty * r.h;
  const anchor = e.anchor || 'top-left';
  if (anchor.endsWith('left')) left += r.x;
  else if (anchor.endsWith('right')) left -= r.x;
  // center-x / center-y / center anchors: x is an offset around center
  if (anchor === 'top-center' || anchor === 'bottom-center' || anchor === 'center') left += r.x;
  if (anchor === 'center-left' || anchor === 'center-right' || anchor === 'center') top += r.y;
  else top += r.y; // top-*/bottom-* also offset by y as marginTop
  return { id: e.id, x1: left, y1: top, x2: left + r.w, y2: top + r.h, w: r.w, h: r.h };
}

const boxes = cfg.screens.main_hud.elements.map(aabb);
// Containment map: panels that intentionally contain child elements.
const CONTAINS = {
  hud_vitals_panel: ['hud_player_name', 'hud_hp_bar', 'hud_mp_bar', 'hud_st_bar'],
  hud_comms_panel: ['hud_time', 'hud_coins', 'hud_pause_btn'],
  hud_invbar_panel: ['inv_1','inv_2','inv_3','inv_4','inv_5','inv_6','inv_7','inv_8'],
  hud_objective_panel: ['hud_objective_label', 'hud_objective_sub'],
};
let overlaps = 0;
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    const ix = Math.max(0, Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1));
    const iy = Math.max(0, Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1));
    if (ix > 0 && iy > 0) {
      // Ignore if one fully contains the other (parent panel holding a child).
      const contained = CONTAINS[A.id]?.includes(B.id) || CONTAINS[B.id]?.includes(A.id);
      if (contained) continue;
      overlaps++;
      console.log(`OVERLAP: ${A.id} (${A.x1|0},${A.y1|0})-(${A.x2|0},${A.y2|0})  x  ${B.id} (${B.x1|0},${B.y1|0})-(${B.x2|0},${B.y2|0})  [${ix|0}x${iy|0}px]`);
    }
  }
}
// Sanity: all elements within canvas bounds.
const oob = boxes.filter(b => b.x1 < 0 || b.y1 < 0 || b.x2 > W || b.y2 > H);
oob.forEach(b => console.log(`OUT OF BOUNDS: ${b.id} -> (${b.x1|0},${b.y1|0})-(${b.x2|0},${b.y2|0})`));

console.log(`\nelements: ${boxes.length}, overlaps: ${overlaps}, out-of-bounds: ${oob.length}`);
console.log(overlaps === 0 && oob.length === 0 ? 'LAYOUT OK (solid, non-overlapping, in-bounds)' : 'LAYOUT HAS ISSUES');
process.exit(overlaps === 0 && oob.length === 0 ? 0 : 1);
