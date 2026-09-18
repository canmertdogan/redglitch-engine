/**
 * Recomposes the main_hud screen (v4 — solid, gap-checked, non-overlapping)
 * in main.redui. Coordinates are chosen so that NO two elements overlap and
 * every element stays inside the 800x450 canvas. Verified by
 * scripts/_check_hud_overlaps.js (which uses the same anchor math as GameHUD).
 *
 * Replaces screens.main_hud.elements only; preserves the rest of the file.
 */
const fs = require('fs');
const path = require('path');
const FILE = path.resolve(__dirname, '../projects/Default Project/interfaces/main.redui');
const cfg = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// ── Layout plan (800x450 base) ──────────────────────────────────────────
//  Top-left:  vitals panel    x12  y12  w236 h96
//  Top-right: comms panel      x12  y12  w180 h64   (pause btn sits in the
//             panel's top-right corner, INSIDE it — no collision)
//  Top-right: pause button      inside comms panel, x12 y8 (w28 h28)
//  Below L:   objective panel  x12  y116 w236 h36
//  Bottom C:  inventory bar     w384 h48, y4  (slots centered, 8x38 + gaps)
//  All panels z95/96; bars/labels z96; pause z97; pause scrim z90.
//
//  Inventory grid (8 slots, 38px, 4px gap => 8*38 + 7*4 = 332 wide content;
//  centered in 384-wide bar => start x = -(332/2) = -166, step 42).
const SLOT_N = 8, SLOT = 38, GAP = 4, STEP = SLOT + GAP;
const gridW = SLOT_N * SLOT + (SLOT_N - 1) * GAP;     // 332
const startX = -(gridW / 2) + SLOT / 2;               // -147 (true center: last slot +SLOT/2 == +166)
const invSlots = [];
for (let i = 0; i < SLOT_N; i++) {
  invSlots.push({ id: 'inv_' + (i + 1), type: 'slot', text: String(i + 1),
    rect: { x: startX + i * STEP, y: -11, w: SLOT, h: SLOT }, anchor: 'bottom-center',
    style: { color: '#fff', borderColor: '#000', zIndex: 96 },
    props: i === 1 ? { selected: true } : {} });
}

const elements = [
  // ── Vitals panel (top-left) ──────────────────────────────────────────
  { id: 'hud_vitals_panel', type: 'panel', rect: { x: 12, y: 12, w: 236, h: 96 }, anchor: 'top-left',
    style: { backgroundColor: 'rgba(20,24,38,0.82)', borderWidth: 2, borderColor: '#000',
      boxShadow: 'inset 2px 2px 0 rgba(255,255,255,.10), inset -2px -2px 0 rgba(0,0,0,.45), 3px 3px 0 rgba(0,0,0,.6)', zIndex: 95 } },
  { id: 'hud_player_name', type: 'label', text: 'LV {player.level}', rect: { x: 22, y: 18, w: 216, h: 14 }, anchor: 'top-left',
    style: { color: '#ffd36a', fontSize: 12, fontWeight: '400', letterSpacing: 1, textShadow: '2px 2px 0 #000', zIndex: 96 } },
  { id: 'hud_hp_bar', type: 'bar', text: 'HP', rect: { x: 22, y: 36, w: 216, h: 18 }, anchor: 'top-left',
    style: { backgroundColor: '#0b0d14', borderWidth: 2, borderColor: '#000', fontSize: 11, fontWeight: '700', color: '#fff', zIndex: 96 },
    props: { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: '#e23b4e', ticks: 10, flashOnDamage: true } },
  { id: 'hud_mp_bar', type: 'bar', text: 'MP', rect: { x: 22, y: 58, w: 105, h: 12 }, anchor: 'top-left',
    style: { backgroundColor: '#0b0d14', borderWidth: 2, borderColor: '#000', fontSize: 10, fontWeight: '700', color: '#fff', zIndex: 96 },
    props: { variable: 'player.mana', maxVariable: 'player.maxMana', fillColor: '#3aa6e0', ticks: 8 } },
  { id: 'hud_st_bar', type: 'bar', text: 'ST', rect: { x: 133, y: 58, w: 105, h: 12 }, anchor: 'top-left',
    style: { backgroundColor: '#0b0d14', borderWidth: 2, borderColor: '#000', fontSize: 10, fontWeight: '700', color: '#fff', zIndex: 96 },
    props: { variable: 'player.stamina', maxVariable: 'player.maxStamina', fillColor: '#54c46a', ticks: 8 } },

  // ── Comms panel (top-right) — holds the pause button INSIDE it ───────
  { id: 'hud_comms_panel', type: 'panel', rect: { x: 12, y: 12, w: 176, h: 64 }, anchor: 'top-right',
    style: { backgroundColor: 'rgba(20,24,38,0.82)', borderWidth: 2, borderColor: '#000',
      boxShadow: 'inset 2px 2px 0 rgba(255,255,255,.10), inset -2px -2px 0 rgba(0,0,0,.45), 3px 3px 0 rgba(0,0,0,.6)', zIndex: 95 } },
  { id: 'hud_time', type: 'label', text: '{gameTimeFormatted}', rect: { x: 148, y: 18, w: 150, h: 14 }, anchor: 'top-right',
    style: { color: '#ffd36a', fontSize: 13, textAlign: 'right', fontWeight: '400', letterSpacing: 1, textShadow: '2px 2px 0 #000', zIndex: 96 } },
  { id: 'hud_coins', type: 'label', text: '{player.coins} CR', rect: { x: 148, y: 42, w: 150, h: 12 }, anchor: 'top-right',
    style: { color: '#54c46a', fontSize: 12, textAlign: 'right', fontWeight: '400', letterSpacing: 1, textShadow: '2px 2px 0 #000', zIndex: 96 } },

  // ── Pause button: sits INSIDE the comms panel's right side (no overlap) ─
  { id: 'hud_pause_btn', type: 'button', text: '||', rect: { x: 112, y: 18, w: 30, h: 28 }, anchor: 'top-right',
    style: { backgroundColor: 'rgba(20,24,38,0.9)', borderWidth: 2, borderColor: '#000', color: '#ffd36a', fontSize: 12, textAlign: 'center', zIndex: 97 }, props: {}, script: 'togglePause' },

  // ── Minecraft-style inventory bar (bottom-center, 8 centered slots) ──
  { id: 'hud_invbar_panel', type: 'panel', rect: { x: 0, y: -6, w: 384, h: 48 }, anchor: 'bottom-center',
    style: { backgroundColor: 'rgba(12,14,22,0.9)', borderWidth: 2, borderColor: '#000',
      boxShadow: 'inset 2px 2px 0 rgba(255,255,255,.08), inset -2px -2px 0 rgba(0,0,0,.5), 3px 3px 0 rgba(0,0,0,.6)', zIndex: 95 } },
  ...invSlots,

  // ── Objective tag (below vitals) ─────────────────────────────────────
  { id: 'hud_objective_panel', type: 'panel', rect: { x: 12, y: 116, w: 236, h: 36 }, anchor: 'top-left',
    style: { backgroundColor: 'rgba(20,24,38,0.82)', borderWidth: 2, borderColor: '#000',
      boxShadow: 'inset 2px 2px 0 rgba(255,255,255,.10), inset -2px -2px 0 rgba(0,0,0,.45), 3px 3px 0 rgba(0,0,0,.6)', zIndex: 95 } },
  { id: 'hud_objective_label', type: 'label', text: 'FIND THE EXIT', rect: { x: 22, y: 122, w: 220, h: 13 }, anchor: 'top-left',
    style: { color: '#f4f7ff', fontSize: 11, fontWeight: '400', letterSpacing: 1, textShadow: '2px 2px 0 #000', zIndex: 96 } },
  { id: 'hud_objective_sub', type: 'label', text: '! ENEMIES DETECTED', rect: { x: 22, y: 138, w: 220, h: 11 }, anchor: 'top-left',
    style: { color: '#e23b4e', fontSize: 10, fontWeight: '400', letterSpacing: 1, textShadow: '2px 2px 0 #000', zIndex: 96 } },
];

cfg.screens.main_hud.elements = elements;

// Overlay screens keep the live HUD visible underneath (fixes "pause overlaps stats").
['pause_menu', 'inventory', 'dialogue_box'].forEach(id => {
  if (cfg.screens[id]) cfg.screens[id].background = true;
});

fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n');
console.log('main_hud recomposed v4:', elements.length, 'elements; inventory slots:', elements.filter(e => e.id.startsWith('inv_')).length);
console.log('overlay backgrounds:', ['pause_menu', 'inventory', 'dialogue_box'].map(id => id + '=' + !!cfg.screens[id].background).join(', '));
