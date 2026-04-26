/**
 * FogOfWar3D.js — Phase 16
 * Per-unit vision rendered into a 512×512 fog texture draped over the world.
 *
 * Three visibility states (per texel):
 *   UNEXPLORED  — black (never seen)
 *   EXPLORED    — dark tint (seen previously, currently hidden)
 *   VISIBLE     — clear (currently in a unit's LOS)
 *
 * Architecture:
 *   - One persistent Uint8Array `_exploredMap` (512×512) written CPU-side.
 *   - Each frame: build a `_visibleMap` from all registered unit positions + radii.
 *   - Merge both into a DataTexture updated on the GPU each frame.
 *   - Fog plane: PlaneGeometry fitted to world bounds, custom ShaderMaterial
 *     reads the fog texture and modulates output alpha/color.
 *
 * Usage:
 *   const fow = new FogOfWar3D(scene, { worldW:64, worldH:64 });
 *   fow.onLevelLoaded(levelData);
 *   fow.registerUnit(id, team, visionRadius);
 *   fow.update(dt, unitPositions);   // unitPositions: Map<id, THREE.Vector3>
 *   const vis = fow.getVisibility(wx, wz);  // VisState enum
 *   fow.serialize() / fow.deserialize(data)
 *   fow.dispose();
 */

import * as THREE from '../../lib/three/three.module.js';

// ─── Visibility state ─────────────────────────────────────────────────────────
export const VisState = Object.freeze({
    UNEXPLORED: 0,
    EXPLORED:   1,
    VISIBLE:    2,
});

// ─── Constants ────────────────────────────────────────────────────────────────
const TEX_SIZE        = 512;          // fog texture resolution (power-of-two)
const EXPLORED_ALPHA  = 0.55;         // opacity of dark-tint (explored) overlay
const VISIBLE_ALPHA   = 0.0;          // opacity of visible (clear) overlay
const UNEXPLORED_R    = 0;
const UNEXPLORED_G    = 0;
const UNEXPLORED_B    = 0;
const EXPLORED_R      = 15;
const EXPLORED_G      = 10;
const EXPLORED_B      = 25;
const FOG_PLANE_Y     = 0.5;          // Y above terrain surface

// Soft-edge blur radius in texels (simple box blur)
const BLUR_RADIUS     = 3;

// ─── Fog plane ShaderMaterial ─────────────────────────────────────────────────
const FOG_VERT = /* glsl */`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FOG_FRAG = /* glsl */`
uniform sampler2D uFogTex;
varying vec2 vUv;

void main() {
    vec4 fog = texture2D(uFogTex, vUv);
    // fog.r = 0:unexplored, 0.5:explored, 1:visible (encoded in red channel)
    float state = fog.r;

    if (state > 0.9) {
        // VISIBLE — transparent
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    } else if (state > 0.4) {
        // EXPLORED — dark tint
        gl_FragColor = vec4(${EXPLORED_R / 255}, ${EXPLORED_G / 255}, ${EXPLORED_B / 255}, ${EXPLORED_ALPHA});
    } else {
        // UNEXPLORED — solid black
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** World XZ → texel index. */
function worldToTexel(wx, wz, worldW, worldH) {
    const u = Math.max(0, Math.min(1, wx / worldW));
    const v = Math.max(0, Math.min(1, wz / worldH));
    const tx = Math.floor(u * (TEX_SIZE - 1));
    const ty = Math.floor(v * (TEX_SIZE - 1));
    return { tx, ty };
}

/** Texel index → world XZ centre. */
function texelToWorld(tx, ty, worldW, worldH) {
    return {
        wx: (tx / (TEX_SIZE - 1)) * worldW,
        wz: (ty / (TEX_SIZE - 1)) * worldH,
    };
}

/** Paint a soft-edged filled circle on a Uint8Array (1 byte per texel). */
function paintCircle(arr, cx, cy, rTex, value) {
    const rSq  = rTex * rTex;
    const soft = Math.max(1, rTex * 0.2);    // soft-edge width in texels
    const softSq = (rTex + soft) * (rTex + soft);

    const x0 = Math.max(0, cx - rTex - soft - 1);
    const x1 = Math.min(TEX_SIZE - 1, cx + rTex + soft + 1);
    const y0 = Math.max(0, cy - rTex - soft - 1);
    const y1 = Math.min(TEX_SIZE - 1, cy + rTex + soft + 1);

    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const dx = x - cx, dy = y - cy;
            const dSq = dx*dx + dy*dy;
            if (dSq <= rSq) {
                arr[y * TEX_SIZE + x] = value;
            } else if (dSq <= softSq) {
                // Blend proportionally (keep higher value)
                const existing = arr[y * TEX_SIZE + x];
                if (value > existing) arr[y * TEX_SIZE + x] = value;
            }
        }
    }
}

/** Simple 2-pass separable box blur on a Uint8Array (in-place). */
function boxBlur(src, w, h, radius) {
    const tmp = new Uint8Array(src.length);
    const r = radius;
    // Horizontal pass
    for (let y = 0; y < h; y++) {
        let sum = 0, count = 0;
        for (let x = -r; x < r; x++) {
            const xi = Math.max(0, Math.min(w-1, x));
            sum += src[y * w + xi]; count++;
        }
        for (let x = 0; x < w; x++) {
            const xa = Math.max(0, x - r - 1);
            const xb = Math.min(w-1, x + r);
            sum += src[y * w + xb] - src[y * w + xa];
            tmp[y * w + x] = Math.round(sum / (2 * r + 1));
        }
    }
    // Vertical pass
    for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let y = -r; y < r; y++) {
            const yi = Math.max(0, Math.min(h-1, y));
            sum += tmp[yi * w + x];
        }
        for (let y = 0; y < h; y++) {
            const ya = Math.max(0, y - r - 1);
            const yb = Math.min(h-1, y + r);
            sum += tmp[yb * w + x] - tmp[ya * w + x];
            src[y * w + x] = Math.round(sum / (2 * r + 1));
        }
    }
}

// ─── FogOfWar3D ───────────────────────────────────────────────────────────────
export default class FogOfWar3D {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} opts
     * @param {number} [opts.worldW=64]   World width in units
     * @param {number} [opts.worldH=64]   World depth in units
     * @param {number} [opts.playerTeam=0] Team whose units reveal fog
     */
    constructor(scene, opts = {}) {
        this._scene      = scene;
        this._worldW     = opts.worldW     ?? 64;
        this._worldH     = opts.worldH     ?? 64;
        this._playerTeam = opts.playerTeam ?? 0;

        // Persistent exploration map: 0=unexplored, 1=explored
        this._exploredMap = new Uint8Array(TEX_SIZE * TEX_SIZE);
        // Per-frame visibility map: 0=hidden, 1=visible
        this._visibleMap  = new Uint8Array(TEX_SIZE * TEX_SIZE);
        // Combined render buffer (R channel state mirrored to RGBA)
        this._texData     = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

        // Registered units: id → { team, radius, lastPos }
        this._units = new Map();

        // Three.js objects
        this._texture  = null;
        this._plane    = null;
        this._material = null;

        this._enabled  = true;
        this._dirty    = true;

        this._buildTexture();
        this._buildPlane();
    }

    // ── Build ─────────────────────────────────────────────────────────────────
    _buildTexture() {
        this._texData.fill(0);
        this._texture = new THREE.DataTexture(
            this._texData, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat,
        );
        this._texture.magFilter = THREE.LinearFilter;
        this._texture.minFilter = THREE.LinearFilter;
        this._texture.generateMipmaps = false;
        this._texture.needsUpdate = true;
    }

    _buildPlane() {
        const geo = new THREE.PlaneGeometry(this._worldW, this._worldH, 1, 1);
        geo.rotateX(-Math.PI / 2);  // lie flat on XZ

        this._material = new THREE.ShaderMaterial({
            uniforms:      { uFogTex: { value: this._texture } },
            vertexShader:  FOG_VERT,
            fragmentShader: FOG_FRAG,
            transparent:   true,
            depthWrite:    false,
            side:          THREE.DoubleSide,
        });

        this._plane = new THREE.Mesh(geo, this._material);
        this._plane.name = 'fog_of_war_plane';
        this._plane.position.set(
            this._worldW / 2,
            FOG_PLANE_Y,
            this._worldH / 2,
        );
        this._plane.renderOrder = 10; // draw on top of world
        this._scene.add(this._plane);
    }

    // ── Level lifecycle ───────────────────────────────────────────────────────
    onLevelLoaded(levelData) {
        // Update world dimensions from level if provided
        const w = levelData?.bounds?.width  ?? levelData?.bounds?.x ?? this._worldW;
        const h = levelData?.bounds?.height ?? levelData?.bounds?.z ?? this._worldH;
        if (w !== this._worldW || h !== this._worldH) {
            this._worldW = w;
            this._worldH = h;
            // Rebuild plane geometry to match world size
            this._scene.remove(this._plane);
            this._plane.geometry.dispose();
            this._material.dispose();
            this._buildPlane();
        }
        // Reset exploration for new level (caller can restore via deserialize)
        this._exploredMap.fill(0);
        this._visibleMap.fill(1); // fail-open until first runtime update
        this._texData.fill(255);
        if (this._texture) this._texture.needsUpdate = true;
        this._dirty = true;
    }

    // ── Unit registry ─────────────────────────────────────────────────────────
    /**
     * Register a unit for fog-of-war vision contribution.
     * @param {string} id
     * @param {number} team
     * @param {number} visionRadius  World-space radius
     */
    registerUnit(id, team, visionRadius = 8) {
        this._units.set(id, { team, radius: visionRadius, lastPos: null });
    }

    unregisterUnit(id) {
        this._units.delete(id);
    }

    updateUnitVision(id, visionRadius) {
        const u = this._units.get(id);
        if (u) u.radius = visionRadius;
    }

    // ── Per-frame update ──────────────────────────────────────────────────────
    /**
     * @param {number} dt
     * @param {Map<string, THREE.Vector3>} unitPositions   id → world position
     */
    update(dt, unitPositions) {
        if (!this._enabled) return;

        // Clear per-frame visible map
        this._visibleMap.fill(0);
        let contributors = 0;

        // Paint vision circles for player-team units
        for (const [id, unit] of this._units) {
            if (unit.team !== this._playerTeam) continue;
            const pos = unitPositions?.get(id);
            if (!pos) continue;
            const inWorld =
                pos.x >= -unit.radius && pos.x <= this._worldW + unit.radius &&
                pos.z >= -unit.radius && pos.z <= this._worldH + unit.radius;
            if (!inWorld) continue;
            contributors++;

            const { tx, ty } = worldToTexel(pos.x, pos.z, this._worldW, this._worldH);
            // Convert world radius to texels
            const rTex = Math.round((unit.radius / this._worldW) * TEX_SIZE);
            paintCircle(this._visibleMap, tx, ty, rTex, 1);

            // Also mark explored
            paintCircle(this._exploredMap, tx, ty, rTex, 1);
        }

        // Fail-open in test/dev levels without registered vision units
        // so the scene does not become a full black overlay.
        if (contributors === 0) {
            this._visibleMap.fill(1);
            this._exploredMap.fill(1);
        }

        // Soft-edge blur on visible map only
        if (BLUR_RADIUS > 0) boxBlur(this._visibleMap, TEX_SIZE, TEX_SIZE, BLUR_RADIUS);

        // Build RGBA texture: RGB carry state (0/127/255), A = 255.
        for (let i = 0; i < TEX_SIZE * TEX_SIZE; i++) {
            let val;
            if (this._visibleMap[i]) {
                val = 255;          // VISIBLE
            } else if (this._exploredMap[i]) {
                val = 127;          // EXPLORED
            } else {
                val = 0;            // UNEXPLORED
            }
            const base = i * 4;
            this._texData[base]     = val;
            this._texData[base + 1] = val;
            this._texData[base + 2] = val;
            this._texData[base + 3] = 255;
        }

        this._texture.needsUpdate = true;
    }

    // ── Query ─────────────────────────────────────────────────────────────────
    /**
     * Return visibility state for a world position.
     * @returns {number} VisState.UNEXPLORED | EXPLORED | VISIBLE
     */
    getVisibility(wx, wz) {
        const { tx, ty } = worldToTexel(wx, wz, this._worldW, this._worldH);
        const idx = ty * TEX_SIZE + tx;
        if (this._visibleMap[idx])  return VisState.VISIBLE;
        if (this._exploredMap[idx]) return VisState.EXPLORED;
        return VisState.UNEXPLORED;
    }

    /** True if world position is currently visible to player team. */
    isVisible(wx, wz) {
        return this.getVisibility(wx, wz) === VisState.VISIBLE;
    }

    /** True if world position has been explored (visible or previously seen). */
    isExplored(wx, wz) {
        return this.getVisibility(wx, wz) !== VisState.UNEXPLORED;
    }

    // ── Enable / disable ──────────────────────────────────────────────────────
    setEnabled(enabled) {
        this._enabled = enabled;
        if (this._plane) this._plane.visible = enabled;
        if (!enabled) {
            // Reveal all — fill explored + visible maps
            this._exploredMap.fill(1);
            this._visibleMap.fill(1);
            this._texData.fill(255);
            if (this._texture) this._texture.needsUpdate = true;
        }
    }

    get enabled() { return this._enabled; }

    /** Reveal a rectangular area immediately (e.g., cheat / cinematic). */
    revealRect(wx, wz, w, h) {
        const { tx: x0, ty: y0 } = worldToTexel(wx,     wz,     this._worldW, this._worldH);
        const { tx: x1, ty: y1 } = worldToTexel(wx + w, wz + h, this._worldW, this._worldH);
        for (let y = y0; y <= Math.min(TEX_SIZE-1, y1); y++) {
            for (let x = x0; x <= Math.min(TEX_SIZE-1, x1); x++) {
                this._exploredMap[y * TEX_SIZE + x] = 1;
            }
        }
    }

    // ── Minimap integration ───────────────────────────────────────────────────
    /**
     * Returns the raw fog DataTexture for compositing onto a minimap.
     * @returns {THREE.DataTexture}
     */
    getFogTexture() {
        return this._texture;
    }

    /**
     * Returns the explored + visible state arrays for the minimap renderer.
     */
    getMaps() {
        return { explored: this._exploredMap, visible: this._visibleMap };
    }

    // ── Serialization ─────────────────────────────────────────────────────────
    /**
     * Serialize the persistent exploration map as a base64 string.
     * Visible map is NOT serialized (ephemeral per-frame data).
     */
    serialize() {
        // RLE compress the explored map: [value, run-length] pairs
        const rle = [];
        let cur = this._exploredMap[0], run = 1;
        for (let i = 1; i < this._exploredMap.length; i++) {
            const v = this._exploredMap[i];
            if (v === cur && run < 255) {
                run++;
            } else {
                rle.push(cur, run);
                cur = v; run = 1;
            }
        }
        rle.push(cur, run);

        return {
            version:  1,
            worldW:   this._worldW,
            worldH:   this._worldH,
            texSize:  TEX_SIZE,
            explored: btoa(String.fromCharCode(...rle)),
        };
    }

    /**
     * Restore the exploration map from serialized data.
     */
    deserialize(data) {
        if (!data || data.version !== 1) return;
        if (data.worldW) this._worldW = data.worldW;
        if (data.worldH) this._worldH = data.worldH;
        if (!data.explored) return;

        try {
            const raw = atob(data.explored);
            const rle = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) rle[i] = raw.charCodeAt(i);

            // Decode RLE
            let idx = 0;
            for (let i = 0; i < rle.length - 1; i += 2) {
                const val = rle[i], run = rle[i+1];
                for (let j = 0; j < run && idx < this._exploredMap.length; j++) {
                    this._exploredMap[idx++] = val;
                }
            }
        } catch (e) {
            console.warn('[FogOfWar3D] deserialize failed:', e.message);
        }
    }

    // ── Dispose ───────────────────────────────────────────────────────────────
    dispose() {
        this._scene.remove(this._plane);
        this._plane?.geometry?.dispose();
        this._material?.dispose();
        this._texture?.dispose();
        this._units.clear();
        this._exploredMap = null;
        this._visibleMap  = null;
        this._texData     = null;
    }
}
