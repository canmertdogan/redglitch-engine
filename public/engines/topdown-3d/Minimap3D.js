/**
 * Minimap3D.js — Phase 19
 * Top-down minimap for the topdown-3d engine.
 *
 * Architecture:
 *   1. Orthographic camera pointed straight down renders the world to an
 *      offscreen WebGLRenderTarget (MINIMAP_RT_SIZE × MINIMAP_RT_SIZE).
 *   2. A Canvas2D overlay (same pixel dimensions) is composited on top to draw:
 *        – Fog-of-war mask from FogOfWar3D.getMaps()
 *        – Unit dots coloured by team
 *        – Ping animations
 *        – Camera-frustum rectangle
 *   3. The final canvas is exposed as a DataURL / ImageBitmap for the HUD to
 *      display as an <img> or <canvas> in the UI.
 *   4. Click-to-navigate: convert minimap pixel coords → world XZ →
 *      topDownCamera.panToWorld(x, z).
 *
 * Usage:
 *   const mm = new Minimap3D(renderer, scene, camera, {
 *       worldW, worldH, topdownCamera, fogOfWar, entities, palette
 *   });
 *   mm.onLevelLoaded(levelData);
 *   mm.update(dt);                    // call each frame
 *   mm.handleClick(normX, normY);     // 0–1 UV from minimap element
 *   mm.ping(worldX, worldZ, color);   // team ping
 *   mm.onResize(w, h);                // HUD layout changed
 *   mm.getCanvasElement();            // <canvas> to embed in HUD
 *   mm.dispose();
 */

import * as THREE from '../../lib/three/three.module.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const RT_SIZE          = 256;     // WebGLRenderTarget resolution
const CANVAS_SIZE      = 256;     // Canvas2D overlay resolution
const UNIT_DOT_RADIUS  = 4;       // px radius of unit dot on minimap
const PING_MAX_RADIUS  = 28;      // px max expanding ring
const PING_DURATION    = 1.8;     // seconds
const FRUSTUM_COLOR    = 'rgba(255,255,255,0.55)';
const EXPLORED_OVERLAY = 'rgba(10,6,18,0.52)';   // dark tint for explored-but-hidden
const UNEXPLORED_FILL  = 'rgba(0,0,0,0.88)';     // solid for unexplored

// Team colours (palette band index → hex string)
const TEAM_COLORS = [
    '#4af', // team 0 — blue (player)
    '#f44', // team 1 — red
    '#4f4', // team 2 — green
    '#fa4', // team 3 — orange
    '#c4f', // team 4 — purple
    '#fff', // team 5+ — white fallback
];

function teamColor(team) { return TEAM_COLORS[team] ?? TEAM_COLORS[TEAM_COLORS.length - 1]; }

// ─── Minimap3D ────────────────────────────────────────────────────────────────
export default class Minimap3D {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene}         scene
     * @param {THREE.Camera}        mainCamera  (used for frustum rect only)
     * @param {Object}              opts
     *   worldW         {number}   world width in units
     *   worldH         {number}   world depth in units
     *   topdownCamera  {TopDownCamera3D}  for panToWorld on click
     *   fogOfWar       {FogOfWar3D|null}  for fog overlay
     *   entities       {EntitySystem3D|null}  for unit dots
     *   palette        {PaletteManager|null}
     */
    constructor(renderer, scene, mainCamera, opts = {}) {
        this._renderer    = renderer;
        this._scene       = scene;
        this._mainCamera  = mainCamera;
        this._worldW      = opts.worldW      ?? 64;
        this._worldH      = opts.worldH      ?? 64;
        this._tdCamera    = opts.topdownCamera ?? null;
        this._fogOfWar    = opts.fogOfWar    ?? null;
        this._entities    = opts.entities    ?? null;
        this._palette     = opts.palette     ?? null;

        // Ping list: { wx, wz, color, elapsed }
        this._pings = [];

        // Orthographic camera looking straight down
        this._orthoCamera = this._buildOrthoCamera();

        // Render target for scene snapshot
        this._rt = new THREE.WebGLRenderTarget(RT_SIZE, RT_SIZE, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format:    THREE.RGBAFormat,
        });

        // Canvas2D overlay
        this._canvas  = document.createElement('canvas');
        this._canvas.width  = CANVAS_SIZE;
        this._canvas.height = CANVAS_SIZE;
        this._canvas.style.imageRendering = 'pixelated';
        this._ctx = this._canvas.getContext('2d');

        // Hidden <canvas> for reading RT pixels into 2D (blitting)
        this._rtCanvas  = document.createElement('canvas');
        this._rtCanvas.width  = RT_SIZE;
        this._rtCanvas.height = RT_SIZE;
        this._rtCtx = this._rtCanvas.getContext('2d');

        // ImageData for reading RT pixel buffer
        this._rtPixels = new Uint8Array(RT_SIZE * RT_SIZE * 4);

        // Fog pixel buffer (from FogOfWar3D DataTexture)
        this._fogPixels = new Uint8Array(256 * 256 * 3);  // FOW TEX_SIZE=512 downsampled
        this._FOW_TEX   = 512;  // must match FogOfWar3D TEX_SIZE

        this._enabled = true;
        this._dirty   = true;

        // Render every N frames (not every frame — expensive)
        this._renderInterval = 3;   // render every 3 frames
        this._frameAcc       = 0;
    }

    // ── Ortho camera ──────────────────────────────────────────────────────────
    _buildOrthoCamera() {
        const hw = this._worldW / 2;
        const hh = this._worldH / 2;
        const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 500);
        cam.position.set(hw, 200, hh);
        cam.lookAt(hw, 0, hh);
        cam.up.set(0, 0, -1);   // north = –Z in ortho
        return cam;
    }

    _updateOrthoCamera() {
        const hw = this._worldW / 2;
        const hh = this._worldH / 2;
        this._orthoCamera.left   = -hw;
        this._orthoCamera.right  =  hw;
        this._orthoCamera.top    =  hh;
        this._orthoCamera.bottom = -hh;
        this._orthoCamera.position.set(hw, 200, hh);
        this._orthoCamera.lookAt(hw, 0, hh);
        this._orthoCamera.updateProjectionMatrix();
    }

    // ── Level lifecycle ───────────────────────────────────────────────────────
    onLevelLoaded(levelData) {
        const w = levelData?.bounds?.width  ?? levelData?.bounds?.x ?? this._worldW;
        const h = levelData?.bounds?.height ?? levelData?.bounds?.z ?? this._worldH;
        this._worldW = w;
        this._worldH = h;
        this._updateOrthoCamera();
        this._dirty = true;
    }

    // ── Update ────────────────────────────────────────────────────────────────
    update(dt) {
        if (!this._enabled) return;

        // Tick pings
        for (let i = this._pings.length - 1; i >= 0; i--) {
            this._pings[i].elapsed += dt;
            if (this._pings[i].elapsed >= PING_DURATION) this._pings.splice(i, 1);
        }

        // Throttle 3D render
        this._frameAcc++;
        const doRender = this._frameAcc >= this._renderInterval;
        if (doRender) {
            this._frameAcc = 0;
            this._render3D();
        }

        // Always redraw 2D overlay (unit positions change every frame)
        this._redrawOverlay();
    }

    // ── 3D scene render to RT ─────────────────────────────────────────────────
    _render3D() {
        const renderer = this._renderer;
        if (!renderer) return;

        // Preserve renderer state
        const prevTarget  = renderer.getRenderTarget();
        const prevViewport = renderer.getViewport(new THREE.Vector4());

        renderer.setRenderTarget(this._rt);
        renderer.setViewport(0, 0, RT_SIZE, RT_SIZE);
        renderer.clear();
        renderer.render(this._scene, this._orthoCamera);

        // Read pixels from RT into our buffer
        renderer.readRenderTargetPixels(this._rt, 0, 0, RT_SIZE, RT_SIZE, this._rtPixels);

        // Restore renderer state
        renderer.setRenderTarget(prevTarget);
        renderer.setViewport(prevViewport);
    }

    // ── 2D overlay composite ──────────────────────────────────────────────────
    _redrawOverlay() {
        const ctx  = this._ctx;
        const cw   = CANVAS_SIZE;
        const ch   = CANVAS_SIZE;

        ctx.clearRect(0, 0, cw, ch);

        // 1. Draw RT pixels (scene snapshot)
        this._blitRTtoCanvas(ctx, cw, ch);

        // 2. Fog of war overlay
        this._drawFog(ctx, cw, ch);

        // 3. Camera frustum rect
        this._drawFrustumRect(ctx, cw, ch);

        // 4. Unit dots
        this._drawUnitDots(ctx, cw, ch);

        // 5. Pings
        this._drawPings(ctx, cw, ch);
    }

    _blitRTtoCanvas(ctx, cw, ch) {
        // Blit rtPixels into the temporary canvas, then drawImage scaled to cw×ch
        // rtPixels is bottom-to-top (WebGL convention) — flip vertically
        const imageData = this._rtCtx.createImageData(RT_SIZE, RT_SIZE);
        const src = this._rtPixels;
        const dst = imageData.data;
        for (let row = 0; row < RT_SIZE; row++) {
            const srcRow = RT_SIZE - 1 - row;   // flip Y
            for (let col = 0; col < RT_SIZE; col++) {
                const si = (srcRow * RT_SIZE + col) * 4;
                const di = (row    * RT_SIZE + col) * 4;
                dst[di]   = src[si];
                dst[di+1] = src[si+1];
                dst[di+2] = src[si+2];
                dst[di+3] = src[si+3];
            }
        }
        this._rtCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(this._rtCanvas, 0, 0, cw, ch);
    }

    _drawFog(ctx, cw, ch) {
        const fow = this._fogOfWar;
        if (!fow) return;

        const maps = fow.getMaps();
        if (!maps) return;

        const { explored, visible } = maps;
        const fowSize = this._FOW_TEX;

        // Sample fog at CANVAS_SIZE resolution (down-sample from 512)
        ctx.save();
        const imgData = ctx.createImageData(cw, ch);
        const d = imgData.data;
        const scaleX = fowSize / cw;
        const scaleY = fowSize / ch;

        for (let py = 0; py < ch; py++) {
            for (let px = 0; px < cw; px++) {
                const fx = Math.min(fowSize - 1, Math.floor(px * scaleX));
                const fy = Math.min(fowSize - 1, Math.floor(py * scaleY));
                const fi = fy * fowSize + fx;
                const isVisible  = visible[fi]  > 0;
                const isExplored = explored[fi] > 0;
                const di = (py * cw + px) * 4;
                if (isVisible) {
                    // transparent
                    d[di] = d[di+1] = d[di+2] = d[di+3] = 0;
                } else if (isExplored) {
                    d[di] = 10; d[di+1] = 6; d[di+2] = 18;
                    d[di+3] = Math.round(255 * 0.52);
                } else {
                    d[di] = d[di+1] = d[di+2] = 0;
                    d[di+3] = Math.round(255 * 0.88);
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
        ctx.restore();
    }

    _drawFrustumRect(ctx, cw, ch) {
        if (!this._tdCamera) return;
        const focus = this._tdCamera.focusPoint ?? null;
        if (!focus) return;

        // Approximate frustum as a rectangle around focus point
        const zoom  = this._tdCamera.zoom ?? 24;
        const aspect = this._renderer
            ? (this._renderer.domElement.width / (this._renderer.domElement.height || 1))
            : (16/9);

        const frustW = zoom * aspect;
        const frustH = zoom;

        const [cx, cy] = this._worldToMinimap(focus.x, focus.z, cw, ch);
        const pw = (frustW / this._worldW) * cw;
        const ph = (frustH / this._worldH) * ch;

        ctx.save();
        ctx.strokeStyle = FRUSTUM_COLOR;
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(cx - pw/2, cy - ph/2, pw, ph);
        ctx.restore();
    }

    _drawUnitDots(ctx, cw, ch) {
        const entities = this._entities;
        if (!entities) return;

        for (const e of entities.getAllEntities()) {
            const pos = e.root?.position;
            if (!pos) continue;

            // Skip entities in unexplored fog
            if (this._fogOfWar && !this._fogOfWar.isExplored(pos.x, pos.z)) continue;

            const [px, py] = this._worldToMinimap(pos.x, pos.z, cw, ch);
            const color    = teamColor(e.team ?? 0);
            const r        = UNIT_DOT_RADIUS;

            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fillStyle   = color;
            ctx.fill();

            // White border for selected units
            if (e.selected) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth   = 1.2;
                ctx.stroke();
            }
        }
    }

    _drawPings(ctx, cw, ch) {
        for (const ping of this._pings) {
            const [px, py] = this._worldToMinimap(ping.wx, ping.wz, cw, ch);
            const t     = ping.elapsed / PING_DURATION;
            const r     = t * PING_MAX_RADIUS;
            const alpha = 1 - t;

            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.strokeStyle = ping.color;
            ctx.lineWidth   = 2;
            ctx.globalAlpha = alpha;
            ctx.stroke();

            // Inner dot
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle   = ping.color;
            ctx.globalAlpha = alpha;
            ctx.fill();
            ctx.restore();
        }
    }

    // ── Coordinate conversion ─────────────────────────────────────────────────
    /**
     * World XZ → minimap pixel (0..CANVAS_SIZE).
     */
    _worldToMinimap(wx, wz, cw, ch) {
        const u = Math.max(0, Math.min(1, wx / this._worldW));
        const v = Math.max(0, Math.min(1, wz / this._worldH));
        return [u * cw, v * ch];
    }

    /**
     * Minimap UV (0..1) → world XZ.
     */
    _minimapToWorld(u, v) {
        return { wx: u * this._worldW, wz: v * this._worldH };
    }

    // ── Click to navigate ─────────────────────────────────────────────────────
    /**
     * Handle a click on the minimap element.
     * @param {number} normX  0..1 (left→right)
     * @param {number} normY  0..1 (top→bottom)
     */
    handleClick(normX, normY) {
        const { wx, wz } = this._minimapToWorld(normX, normY);
        if (this._tdCamera?.panToWorld) {
            this._tdCamera.panToWorld(wx, wz);
        }
        // Emit a ping at click location for visual feedback
        this.ping(wx, wz, '#fff');
    }

    /**
     * Handle a pointer-move for hover highlighting (optional).
     * @param {number} normX  0..1
     * @param {number} normY  0..1
     * @returns {{ wx, wz }} world position under cursor
     */
    worldPosFromMinimap(normX, normY) {
        return this._minimapToWorld(normX, normY);
    }

    // ── Ping ──────────────────────────────────────────────────────────────────
    /**
     * Register a ping at a world position.
     * @param {number} worldX
     * @param {number} worldZ
     * @param {string} [color]  CSS colour string
     */
    ping(worldX, worldZ, color = '#fff') {
        this._pings.push({ wx: worldX, wz: worldZ, color, elapsed: 0 });
    }

    // ── Canvas access ─────────────────────────────────────────────────────────
    /** Returns the minimap <canvas> element for embedding in the HUD. */
    getCanvasElement() { return this._canvas; }

    /** Returns the current minimap as a PNG data URL. */
    getDataURL() { return this._canvas.toDataURL('image/png'); }

    // ── Enable / disable ──────────────────────────────────────────────────────
    setEnabled(enabled) { this._enabled = enabled; }
    get enabled() { return this._enabled; }

    /** Set how many frames to skip between 3D renders (default 3). */
    setRenderInterval(n) { this._renderInterval = Math.max(1, n); }

    // ── Resize ────────────────────────────────────────────────────────────────
    onResize(_w, _h) {
        // Canvas stays CANVAS_SIZE — no resize needed; called for completeness
        this._dirty = true;
    }

    // ── Dispose ───────────────────────────────────────────────────────────────
    dispose() {
        this._rt.dispose();
        this._pings.length = 0;
        this._canvas  = null;
        this._rtCanvas = null;
        this._ctx     = null;
        this._rtCtx   = null;
        this._fogOfWar  = null;
        this._entities  = null;
        this._tdCamera  = null;
    }
}
