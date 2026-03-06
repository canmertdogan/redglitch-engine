/**
 * CollectibleSystem3D.js — Phase 47
 *
 * Coin and collectible management for the platformer-3d engine.
 *
 * Collectible types:
 *   coin       — Standard currency; small bobbing+rotating octahedron; +10 score
 *   star       — Large collectible unlocking areas; sparkle effect; +1000 score
 *   gem        — Mid-size; area-unlock variant; +200 score
 *   powerup    — Temporary ability (speed, double-jump, invincibility)
 *
 * Trail patterns (spawned from level data):
 *   arc        — N coins following a parabolic arc between two points
 *   ring       — N coins arranged in a circle
 *   line       — N coins evenly spaced along a line
 *
 * Behaviours:
 *   - Bobbing: sin(time * BOB_FREQ) vertical offset per coin
 *   - Rotating: constant rotation around Y axis
 *   - Magnetic attraction: within ATTRACT_RADIUS player pulls coins toward them
 *   - Collection: within COLLECT_RADIUS → collected (score + callback + VFX)
 *   - Score popup: floating text (div overlay) at screen-space position
 *
 * Usage:
 *   const cs = new CollectibleSystem3D({ scene, camera, palette, audio });
 *   cs.spawnCoin(x, y, z);
 *   cs.spawnStar(x, y, z, { id: 'star_1' });
 *   cs.spawnTrail('arc', from, to, count);      // arc trail
 *   cs.spawnTrail('ring', center, null, count, { radius: 2 });
 *   cs.spawnFromLevelData(entities[]);          // bulk spawn from level JSON
 *   cs.update(dt, playerPos);                  // call every frame
 *   cs.clear();                                // remove all
 *   // Callbacks:
 *   cs.onCoinCollected  = (total) => {};
 *   cs.onStarCollected  = (id, total) => {};
 *   cs.onScoreChanged   = (score) => {};
 */

import * as THREE from '../../lib/three/three.module.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Bobbing frequency (radians/second). */
const BOB_FREQ         = 2.2;
/** Bobbing amplitude (metres). */
const BOB_AMP          = 0.18;
/** Rotation speed (radians/second). */
const ROT_SPEED        = 2.5;
/** Magnetic attraction starts within this distance (metres). */
const ATTRACT_RADIUS   = 3.0;
/** Coin is collected within this distance (metres). */
const COLLECT_RADIUS   = 0.6;
/** Attraction velocity (lerp factor per second toward player). */
const ATTRACT_SPEED    = 14;

/** Score popup lifetime (seconds). */
const POPUP_LIFETIME   = 1.2;
/** Score popup rise speed (px/s). */
const POPUP_RISE       = 60;

/** Collectible type definitions. */
const COLLECTIBLE_DEFS = {
    coin:    { score: 10,   scale: 0.22, color: 0xf1c40f, geometry: 'octahedron', r: 0.18 },
    star:    { score: 1000, scale: 0.55, color: 0xf39c12, geometry: 'star',       r: 0.45 },
    gem:     { score: 200,  scale: 0.32, color: 0x9b59b6, geometry: 'octahedron', r: 0.28 },
    powerup: { score: 0,    scale: 0.38, color: 0x2ecc71, geometry: 'box',        r: 0.32 },
};

// ── CollectibleSystem3D ───────────────────────────────────────────────────────

export default class CollectibleSystem3D {

    /**
     * @param {object}       systems
     * @param {THREE.Scene}  systems.scene         Scene to add meshes
     * @param {THREE.Camera} systems.camera         Camera for screen-space popups
     * @param {PaletteManager} [systems.palette]   Palette (used for custom colors)
     * @param {AudioSpatial3D} [systems.audio]     Spatial audio
     * @param {HTMLElement}  [systems.hudContainer] Overlay container for popups
     */
    constructor({ scene, camera, palette = null, audio = null, hudContainer = null }) {
        this._scene        = scene;
        this._camera       = camera;
        this._palette      = palette;
        this._audio        = audio;
        this._hudContainer = hudContainer;

        /** @type {Map<string, CollectibleItem>} */
        this._items        = new Map();
        this._nextId       = 1;
        this._collectedIds = new Set();  // IDs of already-collected items (for save/load)

        // Running totals
        this._coins        = 0;
        this._stars        = [];   // collected star IDs
        this._score        = 0;

        // Active score popups
        this._popups       = [];   // { el, x, y, vy, life }

        // Shared geometries (reused across all coins)
        this._geoCache     = {};

        // Callbacks
        this.onCoinCollected = null;   // (total: number) => void
        this.onStarCollected = null;   // (id: string, total: number) => void
        this.onScoreChanged  = null;   // (score: number) => void
        this.onPowerUp       = null;   // (type: string) => void
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Spawn API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Spawn a single collectible.
     * @param {'coin'|'star'|'gem'|'powerup'} type
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {object} [opts]
     * @param {string} [opts.id]         Unique ID (auto-generated if omitted)
     * @param {string} [opts.powerupType] For powerup: 'speed'|'doublejump'|'invincible'
     * @param {number} [opts.paletteIdx] Override color from palette
     */
    spawn(type, x, y, z, opts = {}) {
        const def  = COLLECTIBLE_DEFS[type] ?? COLLECTIBLE_DEFS.coin;
        const id   = opts.id ?? `c_${this._nextId++}`;

        const mesh = this._makeMesh(type, def, opts.paletteIdx);
        mesh.position.set(x, y, z);
        this._scene.add(mesh);

        const item = {
            id,
            type,
            mesh,
            baseY:       y,
            phaseOffset: Math.random() * Math.PI * 2,
            collected:   false,
            attracting:  false,
            powerupType: opts.powerupType ?? null,
        };

        this._items.set(id, item);
        return id;
    }

    spawnCoin(x, y, z, opts = {}) { return this.spawn('coin', x, y, z, opts); }
    spawnStar(x, y, z, opts = {}) { return this.spawn('star', x, y, z, opts); }
    spawnGem(x, y, z, opts = {})  { return this.spawn('gem',  x, y, z, opts); }

    spawnPowerup(x, y, z, powerupType = 'speed') {
        return this.spawn('powerup', x, y, z, { powerupType });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Trail patterns
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Spawn N collectibles in a named pattern.
     * @param {'arc'|'ring'|'line'} pattern
     * @param {THREE.Vector3Like}  from     Arc/line start OR ring center
     * @param {THREE.Vector3Like|null} to   Arc/line end (null for ring)
     * @param {number}             count    Number of coins
     * @param {object}             [opts]
     * @param {string}             [opts.type='coin']
     * @param {number}             [opts.radius=2]  Ring radius
     * @param {number}             [opts.arcHeight=3] Arc peak height above line
     */
    spawnTrail(pattern, from, to, count, opts = {}) {
        const type = opts.type ?? 'coin';
        const ids  = [];

        if (pattern === 'arc' && to) {
            for (let i = 0; i < count; i++) {
                const t  = i / Math.max(1, count - 1);
                const x  = from.x + (to.x - from.x) * t;
                const z  = from.z + (to.z - from.z) * t;
                const yBase = from.y + (to.y - from.y) * t;
                const arc   = (opts.arcHeight ?? 3) * Math.sin(t * Math.PI);
                ids.push(this.spawn(type, x, yBase + arc, z));
            }

        } else if (pattern === 'ring') {
            const r = opts.radius ?? 2;
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const x = from.x + Math.cos(angle) * r;
                const z = from.z + Math.sin(angle) * r;
                ids.push(this.spawn(type, x, from.y, z));
            }

        } else if (pattern === 'line' && to) {
            for (let i = 0; i < count; i++) {
                const t = i / Math.max(1, count - 1);
                const x = from.x + (to.x - from.x) * t;
                const y = from.y + (to.y - from.y) * t;
                const z = from.z + (to.z - from.z) * t;
                ids.push(this.spawn(type, x, y, z));
            }
        }

        return ids;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bulk spawn from level entity data
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Process entities array from level JSON.
     * Recognized entity types: 'coin', 'star', 'gem', 'powerup',
     *   'coin_trail_arc', 'coin_trail_ring', 'coin_trail_line'
     * @param {Array<object>} entities
     */
    spawnFromLevelData(entities) {
        for (const ent of entities) {
            const [x, y, z] = ent.position ?? [0, 0, 0];
            const p = ent.properties ?? {};

            switch (ent.type) {
                case 'coin':
                    this.spawnCoin(x, y, z, { id: ent.id });
                    break;
                case 'star':
                case 'collectible_star':
                    this.spawnStar(x, y, z, { id: ent.id });
                    break;
                case 'gem':
                    this.spawnGem(x, y, z, { id: ent.id });
                    break;
                case 'powerup':
                    this.spawnPowerup(x, y, z, p.powerupType ?? 'speed');
                    break;
                case 'coin_trail_arc': {
                    const to = new THREE.Vector3(p.toX ?? x + 4, p.toY ?? y, p.toZ ?? z);
                    this.spawnTrail('arc', { x, y, z }, to, p.count ?? 8, { arcHeight: p.arcHeight ?? 3 });
                    break;
                }
                case 'coin_trail_ring':
                    this.spawnTrail('ring', { x, y, z }, null, p.count ?? 8, { radius: p.radius ?? 2 });
                    break;
                case 'coin_trail_line': {
                    const to = new THREE.Vector3(p.toX ?? x + 4, p.toY ?? y, p.toZ ?? z);
                    this.spawnTrail('line', { x, y, z }, to, p.count ?? 6);
                    break;
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Update — call every frame
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {number}              dt         Frame delta (seconds)
     * @param {THREE.Vector3Like}   playerPos  Current player world position
     */
    update(dt, playerPos) {
        if (!playerPos) return;

        const pv = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
        const t  = performance.now() / 1000;

        for (const item of this._items.values()) {
            if (item.collected) continue;

            const mesh = item.mesh;
            const dist = mesh.position.distanceTo(pv);

            // ── Magnetic attraction ───────────────────────────────────────
            if (dist < ATTRACT_RADIUS) {
                item.attracting = true;
                const dir = pv.clone().sub(mesh.position).normalize();
                mesh.position.addScaledVector(dir, Math.min(dist, ATTRACT_SPEED * dt));
            } else {
                item.attracting = false;
                // Bobbing + rotation only when not attracting
                mesh.position.y = item.baseY + Math.sin(t * BOB_FREQ + item.phaseOffset) * BOB_AMP;
                mesh.rotation.y += ROT_SPEED * dt;
            }

            // ── Collection ────────────────────────────────────────────────
            if (dist < COLLECT_RADIUS) {
                this._collect(item, pv);
            }
        }

        // Tick popups
        this._updatePopups(dt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Collection logic
    // ─────────────────────────────────────────────────────────────────────────

    _collect(item, playerPos) {
        item.collected = true;
        const def = COLLECTIBLE_DEFS[item.type] ?? COLLECTIBLE_DEFS.coin;

        // Remove mesh
        this._scene.remove(item.mesh);
        item.mesh.geometry?.dispose();
        item.mesh.material?.dispose();
        this._items.delete(item.id);
        this._collectedIds.add(item.id);  // remember for save/load

        // Score
        if (def.score > 0) {
            this._score += def.score;
            this._spawnPopup(`+${def.score}`, playerPos, def.color);
            this.onScoreChanged?.(this._score);
        }

        // Type-specific handling
        if (item.type === 'coin' || item.type === 'gem') {
            this._coins++;
            this._audio?.playEffect?.('coin', playerPos);
            this.onCoinCollected?.(this._coins);
        } else if (item.type === 'star') {
            this._stars.push(item.id);
            this._audio?.playEffect?.('star', playerPos);
            this.onStarCollected?.(item.id, this._stars.length);
        } else if (item.type === 'powerup') {
            this._audio?.playEffect?.('powerup', playerPos);
            this.onPowerUp?.(item.powerupType ?? 'speed');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Score popup (floating div)
    // ─────────────────────────────────────────────────────────────────────────

    _spawnPopup(text, worldPos, color = 0xf1c40f) {
        if (!this._hudContainer || !this._camera) return;

        // Project world position to screen
        const ndc = new THREE.Vector3(worldPos.x, worldPos.y + 0.8, worldPos.z);
        ndc.project(this._camera);

        const w  = this._hudContainer.clientWidth  || window.innerWidth;
        const h  = this._hudContainer.clientHeight || window.innerHeight;
        const sx = ( ndc.x * 0.5 + 0.5) * w;
        const sy = (-ndc.y * 0.5 + 0.5) * h;

        const hex = '#' + color.toString(16).padStart(6, '0');

        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = `
            position: absolute;
            left: ${sx}px; top: ${sy}px;
            transform: translate(-50%, -50%);
            color: ${hex};
            font-family: 'VT323', monospace;
            font-size: 28px;
            letter-spacing: 2px;
            pointer-events: none;
            z-index: 500;
            text-shadow: 1px 1px 0 #000;
        `;
        this._hudContainer.appendChild(el);
        this._popups.push({ el, y: sy, life: POPUP_LIFETIME });
    }

    _updatePopups(dt) {
        for (let i = this._popups.length - 1; i >= 0; i--) {
            const p = this._popups[i];
            p.life -= dt;
            p.y    -= POPUP_RISE * dt;
            p.el.style.top     = `${p.y}px`;
            p.el.style.opacity = Math.max(0, p.life / POPUP_LIFETIME).toString();
            if (p.life <= 0) {
                p.el.remove();
                this._popups.splice(i, 1);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mesh building
    // ─────────────────────────────────────────────────────────────────────────

    _makeMesh(type, def, paletteIdx = null) {
        let geo = this._getGeo(def.geometry);

        const colorHex = paletteIdx != null
            ? (this._palette?.getHex?.(paletteIdx) ?? null)
            : null;
        const color = colorHex ? new THREE.Color(colorHex) : new THREE.Color(def.color);

        const mat  = new THREE.MeshLambertMaterial({ color, flatShading: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.setScalar(def.scale);
        mesh.castShadow = true;
        return mesh;
    }

    _getGeo(name) {
        if (this._geoCache[name]) return this._geoCache[name];
        let geo;
        switch (name) {
            case 'octahedron':
                geo = new THREE.OctahedronGeometry(1, 0);  // 0 detail = 8 triangles
                break;
            case 'star':
                // Approximate star using a dodecahedron (close to star shape at low-poly)
                geo = new THREE.DodecahedronGeometry(1, 0);
                break;
            case 'box':
            default:
                geo = new THREE.BoxGeometry(1, 1, 1);
                break;
        }
        geo.computeVertexNormals();
        this._geoCache[name] = geo;
        return geo;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Accessors
    // ─────────────────────────────────────────────────────────────────────────

    get coins()      { return this._coins; }
    get score()      { return this._score; }
    get starCount()  { return this._stars.length; }
    get starIds()    { return [...this._stars]; }
    get activeCount(){ return this._items.size; }

    /** Was a specific star collected? */
    hasCollectedStar(id) { return this._stars.includes(id); }

    /** Returns an Array of all collectible IDs picked up since last clear(). For save/load. */
    getCollectedIds() { return [...this._collectedIds]; }

    /**
     * Mark an item as already collected without spawning or animating it.
     * Called during load to suppress re-spawning items the player already picked up.
     * @param {string} id
     */
    markCollected(id) { this._collectedIds.add(id); }

    // ─────────────────────────────────────────────────────────────────────────
    // Reset / clear
    // ─────────────────────────────────────────────────────────────────────────

    clear() {
        for (const item of this._items.values()) {
            this._scene.remove(item.mesh);
            item.mesh.geometry?.dispose();
            item.mesh.material?.dispose();
        }
        this._items.clear();
        this._collectedIds.clear();
        for (const p of this._popups) p.el.remove();
        this._popups.length = 0;
    }

    resetScore() {
        this._coins = 0;
        this._stars = [];
        this._score = 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Destroy
    // ─────────────────────────────────────────────────────────────────────────

    destroy() {
        this.clear();
        for (const geo of Object.values(this._geoCache)) geo.dispose();
        this._geoCache = {};
    }
}
