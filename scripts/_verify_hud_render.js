/**
 * Headless render harness for the GameHUD redesign.
 * Loads the REAL public/engines/shared/GameHUD.js into a jsdom DOM,
 * feeds it the REAL projects/Default Project/interfaces/main.redui,
 * and a realistic in-game state — then verifies the new renderer
 * produces correct, well-formed elements without throwing.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const hudSrc = fs.readFileSync(path.join(ROOT, 'public/engines/shared/GameHUD.js'), 'utf8');
const redui = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'projects/Default Project/interfaces/main.redui'), 'utf8'));

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>',
  { pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
const document = window.document;

// jsdom lacks layout; give containers a size so _handleResize() computes scale.
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 1280 });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 720 });
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
window.performance = window.performance || { now: () => Date.now() };

// Run the renderer module in the jsdom window context.
const ctx = vm.createContext(window);
vm.runInContext(hudSrc, ctx);
const GameHUD = window.GameHUD;

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else { console.log('ok  :', msg); } };

const hud = new GameHUD();
hud.init(document.getElementById('host'));

// Load the real interface + a live game state.
hud.load(redui);
const state = {
  player: { level: 7, hp: 18, maxHp: 100, mana: 42, maxMana: 100, stamina: 80, maxStamina: 100, coins: 1340, xp: 4820, xpNext: 8000 },
  gameTimeFormatted: '04:21',
};
hud.showScreen('main_hud');
hud.sync(state);

// ── Assertions ───────────────────────────────────────────────────────
const overlay = document.getElementById('game-hud-overlay');
assert(overlay, 'HUD overlay container created');
assert(document.getElementById('gamehud-runtime-css'), 'renderer injected its CSS <style>');
assert(document.querySelector('.hud-crt'), 'retro CRT scanline layer present');
assert(document.querySelector('.hud-bar-ticks'), 'bar segment ticks present');
assert(document.querySelector('.slot-key'), 'slot key tags present (Minecraft key caps)');
assert(document.querySelector('.hud-type-slot.is-active'), 'at least one inventory slot marked active/selected');
const invSlots = document.querySelectorAll('[id^="hud-inv_"]');
assert(invSlots.length === 8, 'exactly 8 inventory slots (got ' + invSlots.length + ')');
assert(document.querySelector('.hud-type-bar.hud-bar-fill') === null, 'no stray class merge (bar fill uses .hud-bar-fill)');

const hpBar = document.getElementById('hud-hud_hp_bar') || document.querySelector('[id^="hud-hud_hp_bar"]');
const hpFill = hpBar && hpBar.querySelector('.hud-bar-fill');
assert(hpBar, 'HP bar element present');
assert(hpFill, 'HP bar fill present');
assert(hpFill && hpFill.style.getPropertyValue('--bar-color') === '#e23b4e', 'HP fill uses retro red --bar-color (#e23b4e)');
assert(hpFill && hpFill.style.width === '18%', 'HP fill width reflects 18/100 = 18% (got ' + (hpFill && hpFill.style.width) + ')');

const mpFill = document.querySelector('[id^="hud-hud_mp_bar"] .hud-bar-fill');
assert(mpFill && mpFill.style.width === '42%', 'MP fill 42%');
const stFill = document.querySelector('[id^="hud-hud_st_bar"] .hud-bar-fill');
assert(stFill && stFill.style.width === '80%', 'ST fill 80%');

// Slot neon glow custom property.
const slot1 = document.querySelector('[id^="hud-inv_1"]');
assert(slot1 && slot1.querySelector('.slot-key'), 'inv_1 has a key-cap label (Minecraft style)');
assert(document.querySelector('.hud-type-slot.is-active'), 'one inventory slot is highlighted as selected');

// Time text rendered from state (no leftover "TIME " prefix).
const timeEl = document.querySelector('[id^="hud-hud_time"]');
assert(timeEl && timeEl.textContent.trim() === '04:21', 'clock shows formatted time only (got "' + (timeEl && timeEl.textContent.trim()) + '")');

// Damage flash path does not throw and updates edges.
let threw = false;
try {
  hud.showDamageFlash(1.0);
  hud._updateDamageFlash();
} catch (e) { threw = true; console.error(e); }
assert(!threw, 'showDamageFlash + _updateDamageFlash run without throwing');

// Low-HP alarm: state hp 18/100 (< 30%) → overlay gets .low-hp class.
assert(document.getElementById('game-hud-overlay').classList.contains('low-hp'), 'low-HP alarm active at 18/100');

// Other screens also build (proves API intact across all screens).
['pause_menu', 'inventory', 'dialogue_box', 'gameover'].forEach(s => {
  let ok2 = true;
  try { hud.showScreen(s); } catch (e) { ok2 = false; console.error(s, e); }
  assert(ok2, 'screen "' + s + '" builds without throwing');
});

// Pause screen has buttons (interactive).
hud.showScreen('pause_menu');
assert(document.querySelector('[id^="hud-pause_resume"]'), 'pause menu RESUME button present');

// FIX: pause must NOT wipe the stats underneath. With background:true, the
// live vitals (hud_hp_bar) stay in DOM and visible under the pause scrim.
// Re-show main_hud first so the underlay exists (earlier loop ended on gameover).
hud.showScreen('main_hud');
hud.sync(state);
hud.showScreen('pause_menu');
const hpUnderPause = document.querySelector('[id^="hud-hud_hp_bar"]');
assert(hpUnderPause, 'HP bar still in DOM while pause is open (stats not wiped)');
assert(hpUnderPause && hpUnderPause.style.display !== 'none', 'HP bar still visible under pause overlay');
const vitalsUnderPause = document.querySelector('[id^="hud-hud_vitals_panel"]');
assert(vitalsUnderPause, 'vitals panel still present under pause overlay');

console.log('\nRender harness complete. exitCode =', process.exitCode || 0);
