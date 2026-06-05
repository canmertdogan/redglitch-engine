/**
 * HUD_FPS.js — Phase 32
 * DOM-based HUD overlay for the FPS-3D engine.
 *
 * Features:
 *   - Crosshair with dynamic spread and hit-marker flash
 *   - Health + armor bars (smooth transition)
 *   - Ammo counter (mag / reserve)
 *   - Minimap (canvas, top-right; enemy blips + player dot)
 *   - Damage vignette: directional red flash from hit origin
 *   - Objective markers: world-space → screen-space projected DOM labels
 *   - Interaction prompt: "Press F to [action]" on look-at triggers
 *   - Weapon name toast on equip
 *
 * Usage:
 *   const hud = new HUD_FPS(container, camera);
 *   hud.updateHealth(pct);              // 0..1
 *   hud.updateArmor(pct);               // 0..1
 *   hud.updateAmmo(current, reserve);
 *   hud.flashDamage(worldHitPos, playerPos, playerYaw);
 *   hud.showHitMarker(isKill);
 *   hud.setCrosshairSpread(t);          // 0..1; expand crosshair on fire
 *   hud.addObjective(id, worldPos, label);
 *   hud.removeObjective(id);
 *   hud.showInteractionPrompt(text);
 *   hud.hideInteractionPrompt();
 *   hud.showWeaponToast(name);
 *   hud.setVisible(bool);
 *   hud.updateMinimap(playerPos, playerYaw, enemies, range);
 *   hud.update(dt, camera);            // per-frame: project objectives
 *   hud.dispose();
 */

import * as THREE from '../../lib/three/three.module.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const HIT_MARKER_DURATION = 0.22;   // seconds
const HIT_KILL_DURATION   = 0.45;
const DAMAGE_FLASH_DUR    = 0.55;
const SPREAD_DECAY        = 6.0;    // per-second lerp rate back to 0
const CROSSHAIR_BASE      = 10;     // px: half-gap at 0 spread
const CROSSHAIR_MAX_EXTRA = 28;     // px: max extra gap at full spread
const OBJECTIVE_SCREEN_MARGIN = 40; // px from edge when off-screen
const MINIMAP_RANGE_DEFAULT   = 32; // world-units shown on minimap radius

// ── HUD_FPS ───────────────────────────────────────────────────────────────────

export default class HUD_FPS {

    /**
     * @param {HTMLElement} container  — #game-container (relative-positioned)
     * @param {THREE.Camera} camera    — live camera reference for projections
     */
    constructor(container, camera) {
        this._container = container;
        this._camera    = camera;

        // Runtime state
        this._health      = 1.0;
        this._armor       = 0.0;
        this._ammo        = { current: 0, reserve: 0 };
        this._hitTimer    = 0;
        this._hitIsKill   = false;
        this._spread      = 0;
        this._dmgFlashes  = [];   // [{ timer, dx, dz }]
        this._objectives  = new Map(); // id → { el, worldPos: THREE.Vector3, label }
        this._visible     = true;

        // Projection scratch
        this._ndc         = new THREE.Vector3();

        this._build();
    }

    // ── DOM construction ──────────────────────────────────────────────────────

    _build() {
        const root = this._container;

        // ── Vignette overlay (damage flash layers) ────────────────────────
        this._vignette = this._el('div', 'hud-vignette-wrap', root, `
            position:absolute;inset:0;pointer-events:none;z-index:110;
            overflow:hidden;
        `);
        // 4 directional panels
        const dirs = ['top','bottom','left','right'];
        this._flashPanels = {};
        for (const d of dirs) {
            const panel = this._el('div', `hud-flash-${d}`, this._vignette, `
                position:absolute;pointer-events:none;opacity:0;transition:none;
                background:radial-gradient(ellipse at ${
                    d==='left'?'left':d==='right'?'right':d==='top'?'top':'bottom'
                }, rgba(200,20,20,0.72) 0%, transparent 72%);
                ${d==='top'    ? 'top:0;left:0;right:0;height:38%;' : ''}
                ${d==='bottom' ? 'bottom:0;left:0;right:0;height:38%;' : ''}
                ${d==='left'   ? 'left:0;top:0;bottom:0;width:38%;' : ''}
                ${d==='right'  ? 'right:0;top:0;bottom:0;width:38%;' : ''}
            `);
            this._flashPanels[d] = panel;
        }

        // ── Crosshair ─────────────────────────────────────────────────────
        this._crosshairEl = document.getElementById('crosshair');
        if (!this._crosshairEl) {
            this._crosshairEl = this._el('div', 'crosshair', root, `
                position:absolute;top:50%;left:50%;
                transform:translate(-50%,-50%);
                pointer-events:none;z-index:120;
            `);
        }
        // Hit-marker ticks (4 diagonal corners)
        this._hitMarkerEl = this._el('div', 'hud-hit-marker', root, `
            position:absolute;top:50%;left:50%;
            transform:translate(-50%,-50%);
            pointer-events:none;z-index:121;
            width:24px;height:24px;opacity:0;
        `);
        const hmStyle = `position:absolute;width:6px;height:6px;border:2px solid #fff;`;
        this._el('div','hm-tl',this._hitMarkerEl,`${hmStyle}top:0;left:0;border-right:none;border-bottom:none;`);
        this._el('div','hm-tr',this._hitMarkerEl,`${hmStyle}top:0;right:0;border-left:none;border-bottom:none;`);
        this._el('div','hm-bl',this._hitMarkerEl,`${hmStyle}bottom:0;left:0;border-right:none;border-top:none;`);
        this._el('div','hm-br',this._hitMarkerEl,`${hmStyle}bottom:0;right:0;border-left:none;border-top:none;`);

        // Crosshair spread lines (4 independent segments — replace CSS ::before/after)
        this._chLines = {};
        const lineBase = `position:absolute;background:rgba(255,255,255,0.88);pointer-events:none;`;
        this._chWrap = this._el('div','hud-ch-wrap', root, `
            position:absolute;top:50%;left:50%;
            transform:translate(-50%,-50%);
            pointer-events:none;z-index:119;
        `);
        this._chLines.top    = this._el('div','chl-t',  this._chWrap, `${lineBase}width:2px;height:8px;left:50%;transform:translateX(-50%);`);
        this._chLines.bottom = this._el('div','chl-b',  this._chWrap, `${lineBase}width:2px;height:8px;left:50%;transform:translateX(-50%);`);
        this._chLines.left   = this._el('div','chl-l',  this._chWrap, `${lineBase}height:2px;width:8px;top:50%;transform:translateY(-50%);`);
        this._chLines.right  = this._el('div','chl-r',  this._chWrap, `${lineBase}height:2px;width:8px;top:50%;transform:translateY(-50%);`);

        // ── Bottom-left stats bar ─────────────────────────────────────────
        // Use existing elements if present, else create
        this._healthFill  = document.getElementById('hud-health-fill');
        this._armorFill   = document.getElementById('hud-armor-fill') ?? this._buildArmorBar(root);
        this._ammoText    = document.getElementById('hud-ammo-text');
        this._ammoIcon    = document.getElementById('hud-ammo-icon') ?? null;

        // ── Minimap ───────────────────────────────────────────────────────
        this._minimapCanvas = document.getElementById('hud-minimap');
        if (!this._minimapCanvas) {
            this._minimapCanvas = document.createElement('canvas');
            this._minimapCanvas.id = 'hud-minimap';
            this._minimapCanvas.width  = 128;
            this._minimapCanvas.height = 128;
            this._minimapCanvas.style.cssText = `
                position:absolute;top:16px;right:16px;
                width:128px !important; height:128px !important;
                border:2px solid rgba(255,255,255,0.18);
                border-radius:50%;overflow:hidden;
                pointer-events:none;z-index:120;
                background:rgba(0,0,0,0.45);
            `;
            root.appendChild(this._minimapCanvas);
        }
        this._minimapCtx = this._minimapCanvas.getContext('2d');

        // ── Objective markers container ───────────────────────────────────
        this._objContainer = this._el('div', 'hud-objectives', root, `
            position:absolute;inset:0;pointer-events:none;z-index:125;
        `);

        // ── Interaction prompt ────────────────────────────────────────────
        this._interactEl = document.getElementById('hud-interact');
        if (!this._interactEl) {
            this._interactEl = this._el('div', 'hud-interact', root, `
                position:absolute;bottom:22%;left:50%;transform:translateX(-50%);
                color:rgba(255,255,255,0.9);font-size:20px;letter-spacing:2px;
                font-family:'VT323',monospace;text-align:center;
                background:rgba(0,0,0,0.55);padding:6px 18px;
                border:1px solid rgba(255,255,255,0.22);
                pointer-events:none;z-index:130;display:none;
            `);
        }

        // ── Weapon name toast ─────────────────────────────────────────────
        this._weaponToast = this._el('div', 'hud-weapon-toast', root, `
            position:absolute;bottom:28%;right:24px;
            color:rgba(255,255,255,0.8);font-size:22px;letter-spacing:3px;
            font-family:'VT323',monospace;
            opacity:0;transition:opacity 0.25s;
            pointer-events:none;z-index:130;
            text-transform:uppercase;
        `);

        this._applyCrosshairSpread(0);
    }

    _buildArmorBar(root) {
        // Armor bar injected next to health bar
        const existing = document.getElementById('hud-bottom-left');
        if (!existing) return null;
        const row = document.createElement('div');
        row.className = 'hud-stat';
        row.innerHTML = `
            <span class="hud-stat-label">ARM</span>
            <div class="hud-stat-bar"><div id="hud-armor-fill" class="hud-stat-fill" style="background:#3399ff;width:0%"></div></div>
        `;
        // Insert after health row
        existing.insertBefore(row, existing.children[1] ?? null);
        return document.getElementById('hud-armor-fill');
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** @param {number} pct 0..1 */
    updateHealth(pct) {
        this._health = Math.max(0, Math.min(1, pct));
        if (this._healthFill) {
            this._healthFill.style.width = `${(this._health * 100).toFixed(1)}%`;
            this._healthFill.style.background = this._health > 0.35 ? '#e74c3c' : '#ff1111';
        }
    }

    /** @param {number} pct 0..1 */
    updateArmor(pct) {
        this._armor = Math.max(0, Math.min(1, pct));
        if (this._armorFill) {
            this._armorFill.style.width = `${(this._armor * 100).toFixed(1)}%`;
        }
    }

    /**
     * @param {number} current  — rounds in magazine
     * @param {number} reserve  — total reserve ammo
     */
    updateAmmo(current, reserve) {
        this._ammo = { current, reserve };
        if (this._ammoText) {
            this._ammoText.textContent = `${current} / ${reserve}`;
            // Flash red on empty mag
            this._ammoText.style.color = current === 0 ? '#ff4444' : '#e74c3c';
        }
    }

    /**
     * Flash directional damage vignette.
     * @param {THREE.Vector3} hitPos     — world position of hit
     * @param {THREE.Vector3} playerPos  — player world position
     * @param {number}        playerYaw  — player camera yaw (radians)
     */
    flashDamage(hitPos, playerPos, playerYaw) {
        if (!hitPos || !playerPos) {
            // Undirected — flash all 4 panels equally
            this._dmgFlashes.push({ timer: DAMAGE_FLASH_DUR, dx: 0, dz: 0 });
            return;
        }
        const dx = hitPos.x - playerPos.x;
        const dz = hitPos.z - playerPos.z;
        // Rotate into player-local space
        const cos = Math.cos(-playerYaw);
        const sin = Math.sin(-playerYaw);
        const lx  =  cos * dx + sin * dz;
        const lz  = -sin * dx + cos * dz;
        this._dmgFlashes.push({ timer: DAMAGE_FLASH_DUR, lx, lz });
    }

    /**
     * Flash hit-marker ticks on crosshair.
     * @param {boolean} isKill
     */
    showHitMarker(isKill = false) {
        this._hitTimer  = isKill ? HIT_KILL_DURATION : HIT_MARKER_DURATION;
        this._hitIsKill = isKill;
        if (this._hitMarkerEl) {
            const color = isKill ? '#ff4444' : '#ffffff';
            for (const child of this._hitMarkerEl.children) {
                child.style.borderColor = color;
            }
        }
    }

    /**
     * Dynamically expand/contract crosshair (0 = idle, 1 = full recoil spread).
     * @param {number} t 0..1
     */
    setCrosshairSpread(t) {
        this._spread = Math.max(0, Math.min(1, t));
        this._applyCrosshairSpread(this._spread);
    }

    // ── Objectives ────────────────────────────────────────────────────────────

    /**
     * Add a world-space objective marker.
     * @param {string}          id
     * @param {THREE.Vector3}   worldPos
     * @param {string}          label
     * @param {string}          [color='#ffcc00']
     */
    addObjective(id, worldPos, label, color = '#ffcc00') {
        if (this._objectives.has(id)) this.removeObjective(id);

        const el = document.createElement('div');
        el.style.cssText = `
            position:absolute;pointer-events:none;
            font-family:'VT323',monospace;font-size:18px;
            color:${color};letter-spacing:2px;text-align:center;
            text-shadow:0 0 6px ${color};white-space:nowrap;
        `;
        // Diamond icon + label
        el.innerHTML = `<span style="font-size:22px">◆</span><br>${label}`;
        this._objContainer.appendChild(el);

        this._objectives.set(id, {
            el,
            worldPos: worldPos instanceof THREE.Vector3
                ? worldPos.clone()
                : new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z),
            label,
            color,
        });
    }

    /** Remove an objective marker by id. */
    removeObjective(id) {
        const obj = this._objectives.get(id);
        if (obj) {
            obj.el.remove();
            this._objectives.delete(id);
        }
    }

    /** Clear all objective markers. */
    clearObjectives() {
        for (const id of this._objectives.keys()) this.removeObjective(id);
    }

    // ── Interaction prompt ────────────────────────────────────────────────────

    /** @param {string} text — e.g. "Press F to Open Door" */
    showInteractionPrompt(text) {
        if (this._interactEl) {
            this._interactEl.textContent = text;
            this._interactEl.style.display = 'block';
        }
    }

    hideInteractionPrompt() {
        if (this._interactEl) this._interactEl.style.display = 'none';
    }

    // ── Weapon toast ──────────────────────────────────────────────────────────

    /** Briefly show the equipped weapon name. */
    showWeaponToast(name) {
        if (!this._weaponToast) return;
        this._weaponToast.textContent = name;
        this._weaponToast.style.opacity = '1';
        clearTimeout(this._weaponToastTimer);
        this._weaponToastTimer = setTimeout(() => {
            this._weaponToast.style.opacity = '0';
        }, 2000);
    }

    // ── Minimap ───────────────────────────────────────────────────────────────

    /**
     * Redraw the minimap.
     * @param {THREE.Vector3}   playerPos
     * @param {number}          playerYaw   — radians
     * @param {Array}           enemies     — [{position: THREE.Vector3, state}]
     * @param {number}          [range]     — world-units shown as radius
     */
    updateMinimap(playerPos, playerYaw, enemies = [], range = MINIMAP_RANGE_DEFAULT) {
        const ctx = this._minimapCtx;
        const W   = this._minimapCanvas.width;
        const H   = this._minimapCanvas.height;
        const cx  = W / 2, cy = H / 2;
        const scale = cx / range;

        ctx.clearRect(0, 0, W, H);

        // Clip to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
        ctx.clip();

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        const gridSpacing = 4 * scale; // every 4 world-units
        for (let x = cx % gridSpacing; x < W; x += gridSpacing) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = cy % gridSpacing; y < H; y += gridSpacing) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Enemy blips
        for (const e of enemies) {
            const ep = e.position;
            // Rotate into player-local space (minimap is player-centric)
            const dx = ep.x - playerPos.x;
            const dz = ep.z - playerPos.z;
            const cos = Math.cos(-playerYaw);
            const sin = Math.sin(-playerYaw);
            const mx  =  cx + ( cos * dx + sin * dz) * scale;
            const my  =  cy + (-sin * dx + cos * dz) * scale;
            const isAlert = e.state !== 'patrol' && e.state !== 'idle';
            ctx.beginPath();
            ctx.arc(mx, my, isAlert ? 5 : 3.5, 0, Math.PI * 2);
            ctx.fillStyle = isAlert ? '#ff4444' : '#ff9944';
            ctx.fill();
        }

        // North indicator (small tick at top)
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx, 14); ctx.stroke();

        // Player dot + direction arrow
        ctx.save();
        ctx.translate(cx, cy);
        // Minimap is always player-forward = up; no rotation needed
        // Player dot
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#44ddff';
        ctx.fill();
        // Direction arrow
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(-4, -4);
        ctx.lineTo(4, -4);
        ctx.closePath();
        ctx.fillStyle = '#44ddff';
        ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    // ── Visibility ────────────────────────────────────────────────────────────

    setVisible(v) {
        this._visible = v;
        const hud = document.getElementById('hud');
        if (hud) hud.classList.toggle('hidden', !v);
        if (this._vignette)      this._vignette.style.display      = v ? '' : 'none';
        if (this._chWrap)        this._chWrap.style.display        = v ? '' : 'none';
        if (this._hitMarkerEl)   this._hitMarkerEl.style.display   = v ? '' : 'none';
        if (this._minimapCanvas) this._minimapCanvas.style.display = v ? '' : 'none';
        if (this._objContainer)  this._objContainer.style.display  = v ? '' : 'none';
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    /**
     * Call every frame.
     * @param {number}        dt
     * @param {THREE.Camera}  [camera]  — override camera ref (optional)
     */
    update(dt, camera) {
        if (camera) this._camera = camera;

        // Crosshair spread decay
        if (this._spread > 0) {
            this._spread = Math.max(0, this._spread - dt * SPREAD_DECAY);
            this._applyCrosshairSpread(this._spread);
        }

        // Hit marker fade
        if (this._hitTimer > 0) {
            this._hitTimer -= dt;
            const alpha = Math.max(0, this._hitTimer / (this._hitIsKill ? HIT_KILL_DURATION : HIT_MARKER_DURATION));
            if (this._hitMarkerEl) this._hitMarkerEl.style.opacity = String(alpha.toFixed(3));
        }

        // Damage flash panels
        this._updateDamageFlash(dt);

        // Objective marker projections
        if (this._camera) this._projectObjectives();
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    _applyCrosshairSpread(t) {
        const gap = CROSSHAIR_BASE + t * CROSSHAIR_MAX_EXTRA;
        const h   = 8; // line length px
        if (!this._chLines.top) return;
        this._chLines.top.style.cssText    += `;bottom:calc(50% + ${gap}px);top:auto;`;
        this._chLines.bottom.style.cssText += `;top:calc(50% + ${gap}px);bottom:auto;`;
        this._chLines.left.style.cssText   += `;right:calc(50% + ${gap}px);left:auto;`;
        this._chLines.right.style.cssText  += `;left:calc(50% + ${gap}px);right:auto;`;
    }

    _updateDamageFlash(dt) {
        // Decay all active flashes
        this._dmgFlashes = this._dmgFlashes.filter(f => {
            f.timer -= dt;
            return f.timer > 0;
        });

        // Determine max intensity per direction across all active flashes
        const maxDir = { top: 0, bottom: 0, left: 0, right: 0 };
        for (const f of this._dmgFlashes) {
            const alpha = f.timer / DAMAGE_FLASH_DUR;
            if (f.lx === 0 && f.lz === 0) {
                // Undirected
                for (const d of Object.keys(maxDir)) maxDir[d] = Math.max(maxDir[d], alpha * 0.55);
            } else {
                // lx: positive = hit from right, negative = hit from left
                // lz: positive = hit from front (forward), negative = hit from behind
                if (f.lz > 0)  maxDir.top    = Math.max(maxDir.top,    alpha * Math.abs(f.lz));
                if (f.lz < 0)  maxDir.bottom = Math.max(maxDir.bottom, alpha * Math.abs(f.lz));
                if (f.lx < 0)  maxDir.left   = Math.max(maxDir.left,   alpha * Math.abs(f.lx));
                if (f.lx > 0)  maxDir.right  = Math.max(maxDir.right,  alpha * Math.abs(f.lx));
            }
        }

        for (const [d, v] of Object.entries(maxDir)) {
            if (this._flashPanels[d]) {
                this._flashPanels[d].style.opacity = v.toFixed(3);
            }
        }
    }

    _projectObjectives() {
        const W = this._container.clientWidth  || window.innerWidth;
        const H = this._container.clientHeight || window.innerHeight;
        const margin = OBJECTIVE_SCREEN_MARGIN;

        for (const obj of this._objectives.values()) {
            this._ndc.copy(obj.worldPos);
            this._ndc.project(this._camera);

            const sx = ( this._ndc.x * 0.5 + 0.5) * W;
            const sy = (-this._ndc.y * 0.5 + 0.5) * H;
            const inFront = this._ndc.z < 1;

            const el = obj.el;

            if (!inFront) {
                // Behind camera: flip coords + clamp to edge
                const angle = Math.atan2(H / 2 - sy, W / 2 - sx);
                const ex = W / 2 + Math.cos(angle) * (W / 2 - margin);
                const ey = H / 2 + Math.sin(angle) * (H / 2 - margin);
                el.style.left = `${ex - 12}px`;
                el.style.top  = `${ey - 12}px`;
                el.style.opacity = '0.65';
            } else {
                const cx = Math.max(margin, Math.min(W - margin, sx));
                const cy = Math.max(margin, Math.min(H - margin, sy));
                el.style.left = `${cx - 12}px`;
                el.style.top  = `${cy - 24}px`;
                el.style.opacity = '1';
                // Scale down with distance (basic)
                const dist = this._camera.position.distanceTo(obj.worldPos);
                const s = Math.max(0.5, Math.min(1.4, 20 / (dist + 1)));
                el.style.transform = `scale(${s.toFixed(2)})`;
            }
        }
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    /** Create a div, assign id + inline style, append to parent. */
    _el(tag, id, parent, style = '') {
        const el = document.createElement(tag);
        el.id = id;
        if (style) el.style.cssText = style.replace(/\n\s+/g, ' ').trim();
        parent.appendChild(el);
        return el;
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose() {
        clearTimeout(this._weaponToastTimer);
        this._vignette?.remove();
        this._chWrap?.remove();
        this._hitMarkerEl?.remove();
        this._minimapCanvas?.remove();
        this._objContainer?.remove();
        this._interactEl?.remove();
        this._weaponToast?.remove();
        this._objectives.clear();
        this._dmgFlashes = [];
    }
}
