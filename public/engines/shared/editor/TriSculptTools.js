/**
 * TriSculptTools.js — Interactive sculpting tools for non-indexed THREE.BufferGeometry meshes.
 *
 * Provides brush-based sculpting operations:
 *   elevate     — push vertices up/down along Y by pointer drag delta
 *   facet-paint — colour the 3 vertices of the hit face
 *   smooth      — average Y of all vertices within brush radius
 *   noise       — random Y displacement within brush radius
 *   flatten     — lerp all vertices in radius toward a target height
 *
 * Usage (ES module):
 *
 *   import TriSculptTools from '/engines/shared/editor/TriSculptTools.js';
 *
 *   const sculpt = new TriSculptTools(scene, camera, renderer.domElement);
 *   sculpt.setMesh(myTerrainMesh);
 *   sculpt.setTool('elevate');
 *   sculpt.setBrushRadius(3.0);
 *   sculpt.setBrushStrength(0.6);
 *
 *   // Later…
 *   sculpt.dispose();
 */

import * as THREE from '/lib/three/three.module.js';

export default class TriSculptTools {

    // ── Construction ──────────────────────────────────────────────────────────

    /**
     * @param {THREE.Scene}        scene       THREE scene (kept for future spatial queries)
     * @param {THREE.Camera}       camera      Active camera for raycasting
     * @param {HTMLElement}        domElement  Canvas element for pointer events
     */
    constructor(scene, camera, domElement) {
        /** @type {THREE.Scene} */
        this.scene = scene;
        /** @type {THREE.Camera} */
        this.camera = camera;
        /** @type {HTMLElement} */
        this.domElement = domElement;

        /** @private @type {THREE.Raycaster} */
        this._raycaster = new THREE.Raycaster();

        /** @private @type {THREE.Mesh|null} */
        this._mesh = null;

        /** @private @type {string} Active tool name */
        this._tool = 'elevate';

        /** @private @type {number} World-space brush radius */
        this._brushRadius = 2.0;

        /** @private @type {number} Brush strength 0–1 */
        this._brushStrength = 0.5;

        /** @private @type {number} Target height for flatten tool */
        this._targetHeight = 0.0;

        /** @private @type {THREE.Color} Active colour for facet-paint */
        this._color = new THREE.Color(0xffffff);

        /** @private @type {boolean} Whether the pointer is currently pressed */
        this._isDragging = false;

        /** @private @type {{x:number,y:number}|null} Last pointer position */
        this._lastPointer = null;

        // Bind and register event handlers
        this._boundDown = this.onPointerDown.bind(this);
        this._boundMove = this.onPointerMove.bind(this);
        this._boundUp   = this.onPointerUp.bind(this);

        domElement.addEventListener('pointerdown', this._boundDown);
        domElement.addEventListener('pointermove', this._boundMove);
        domElement.addEventListener('pointerup',   this._boundUp);
    }

    // ── Public setters ────────────────────────────────────────────────────────

    /**
     * Set the active mesh to sculpt.
     * The mesh's geometry must be a non-indexed BufferGeometry with a writable
     * position attribute.
     * @param {THREE.Mesh} mesh
     */
    setMesh(mesh) {
        this._mesh = mesh;
    }

    /**
     * Choose the active sculpting tool.
     * @param {'elevate'|'facet-paint'|'smooth'|'noise'|'flatten'} toolName
     */
    setTool(toolName) {
        this._tool = toolName;
    }

    /**
     * Set the world-space brush radius.
     * @param {number} r  Radius in world units (default 2.0)
     */
    setBrushRadius(r) {
        this._brushRadius = r;
    }

    /**
     * Set the brush strength.
     * @param {number} s  0.0 (no effect) to 1.0 (full effect)
     */
    setBrushStrength(s) {
        this._brushStrength = Math.max(0, Math.min(1, s));
    }

    /**
     * Set the target height used by the flatten tool.
     * @param {number} h  World-space Y value
     */
    setTargetHeight(h) {
        this._targetHeight = h;
    }

    /**
     * Set the paint colour for the facet-paint tool.
     * @param {number|string} hexOrPaletteIndex  Hex integer (0xff0000), CSS string ('#ff0000'),
     *                                            or palette index (treated as hex integer)
     */
    setColor(hexOrPaletteIndex) {
        this._color = new THREE.Color(hexOrPaletteIndex);
    }

    // ── Pointer event handlers ────────────────────────────────────────────────

    /**
     * Handle pointerdown — begin a sculpt stroke.
     * @param {PointerEvent} event
     */
    onPointerDown(event) {
        this._isDragging  = true;
        this._lastPointer = { x: event.clientX, y: event.clientY };

        const hit = this._getHitPoint(event);
        if (!hit) return;

        // Elevate applies on move (needs delta); all others apply immediately on press too
        if (this._tool !== 'elevate') {
            this._dispatchTool(hit, 0);
        }
    }

    /**
     * Handle pointermove — continue a sculpt stroke.
     * @param {PointerEvent} event
     */
    onPointerMove(event) {
        if (!this._isDragging) return;

        const hit = this._getHitPoint(event);
        const prevY  = this._lastPointer ? this._lastPointer.y : event.clientY;
        const deltaY = (prevY - event.clientY) * 0.01; // drag-up = positive

        this._lastPointer = { x: event.clientX, y: event.clientY };

        if (!hit) return;
        this._dispatchTool(hit, deltaY);
    }

    /**
     * Handle pointerup — end the current sculpt stroke.
     * @param {PointerEvent} _event
     */
    onPointerUp(_event) {
        this._isDragging  = false;
        this._lastPointer = null;
    }

    // ── Tool dispatch ─────────────────────────────────────────────────────────

    /**
     * Route to the correct tool implementation.
     * @private
     * @param {{point:THREE.Vector3, face:THREE.Face, faceIndex:number}} hit
     * @param {number} delta  Normalised pointer-Y delta (used by elevate)
     */
    _dispatchTool(hit, delta) {
        switch (this._tool) {
            case 'elevate':     this._applyElevate(hit, delta);    break;
            case 'facet-paint': this._applyFacetPaint(hit);        break;
            case 'smooth':      this._applySmooth(hit);            break;
            case 'noise':       this._applyNoise(hit);             break;
            case 'flatten':     this._applyFlatten(hit);           break;
            default:
                console.warn(`[TriSculptTools] Unknown tool: "${this._tool}"`);
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Raycast against the active mesh and return hit info.
     * @private
     * @param {PointerEvent} event
     * @returns {{point:THREE.Vector3, face:THREE.Face, faceIndex:number}|null}
     */
    _getHitPoint(event) {
        if (!this._mesh) return null;

        const rect = this.domElement.getBoundingClientRect();
        const ndcX = ((event.clientX - rect.left)  / rect.width)  *  2 - 1;
        const ndcY = ((event.clientY - rect.top)   / rect.height) * -2 + 1;

        this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);

        const hits = this._raycaster.intersectObject(this._mesh, false);
        if (!hits.length) return null;

        const h = hits[0];
        return { point: h.point, face: h.face, faceIndex: h.faceIndex };
    }

    /**
     * Return all position-attribute vertices within brushRadius of centerPoint.
     * Works on non-indexed BufferGeometry (stride-3 Float32Array).
     * @private
     * @param {THREE.Vector3} centerPoint  World-space hit point
     * @returns {Array<{index:number, vertexIndex:number, dist:number}>}
     */
    _getVerticesInRadius(centerPoint) {
        if (!this._mesh) return [];

        // Transform center to mesh local space for correct distance measurement
        const localCenter = this._mesh.worldToLocal(centerPoint.clone());

        const pos  = this._mesh.geometry.getAttribute('position');
        const r2   = this._brushRadius * this._brushRadius;
        const results = [];

        for (let i = 0; i < pos.count; i++) {
            const dx = pos.getX(i) - localCenter.x;
            const dy = pos.getY(i) - localCenter.y;
            const dz = pos.getZ(i) - localCenter.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 <= r2) {
                results.push({ index: i, vertexIndex: i, dist: Math.sqrt(d2) });
            }
        }

        return results;
    }

    /**
     * Smooth-step falloff curve: 1 at centre → 0 at edge.
     * @private
     * @param {number} dist  Distance from brush centre
     * @returns {number}  0.0 – 1.0
     */
    _falloff(dist) {
        const t = 1.0 - dist / this._brushRadius;
        return t * t * (3.0 - 2.0 * t); // smoothstep
    }

    /**
     * Push vertices along Y by the pointer drag delta, with distance falloff.
     * @private
     * @param {{point:THREE.Vector3}} hit
     * @param {number} delta  Signed pointer-Y movement (screen pixels → normalised)
     */
    _applyElevate(hit, delta) {
        const verts = this._getVerticesInRadius(hit.point);
        if (!verts.length) return;

        const pos = this._mesh.geometry.getAttribute('position');

        for (const { index, dist } of verts) {
            const amount = delta * this._brushStrength * this._falloff(dist);
            pos.setY(index, pos.getY(index) + amount);
        }

        this._markGeometryDirty();
    }

    /**
     * Paint the three vertices of the hit face with the current colour.
     * Adds a color attribute if the geometry does not already have one.
     * @private
     * @param {{face:THREE.Face}} hit
     */
    _applyFacetPaint(hit) {
        if (!hit.face) return;

        const geom    = this._mesh.geometry;
        const posAttr = geom.getAttribute('position');
        let   colAttr = geom.getAttribute('color');

        if (!colAttr) {
            colAttr = new THREE.BufferAttribute(new Float32Array(posAttr.count * 3), 3);
            geom.setAttribute('color', colAttr);

            // Enable vertex colours on the mesh material
            const mats = Array.isArray(this._mesh.material)
                ? this._mesh.material
                : [this._mesh.material];
            for (const mat of mats) {
                if (mat) { mat.vertexColors = true; mat.needsUpdate = true; }
            }
        }

        const { a, b, c } = hit.face;
        const r = this._color.r, g = this._color.g, bl = this._color.b;

        colAttr.setXYZ(a, r, g, bl);
        colAttr.setXYZ(b, r, g, bl);
        colAttr.setXYZ(c, r, g, bl);
        colAttr.needsUpdate = true;
    }

    /**
     * Average the Y values of all vertices within brush radius (smooth/relax).
     * @private
     * @param {{point:THREE.Vector3}} hit
     */
    _applySmooth(hit) {
        const verts = this._getVerticesInRadius(hit.point);
        if (!verts.length) return;

        const pos = this._mesh.geometry.getAttribute('position');

        let sumY = 0;
        for (const { index } of verts) sumY += pos.getY(index);
        const avgY = sumY / verts.length;

        for (const { index, dist } of verts) {
            const fo  = this._falloff(dist);
            const cur = pos.getY(index);
            pos.setY(index, cur + (avgY - cur) * this._brushStrength * fo);
        }

        this._markGeometryDirty();
    }

    /**
     * Apply random Y displacement to each vertex within brush radius.
     * @private
     * @param {{point:THREE.Vector3}} hit
     */
    _applyNoise(hit) {
        const verts    = this._getVerticesInRadius(hit.point);
        if (!verts.length) return;

        const pos      = this._mesh.geometry.getAttribute('position');
        const halfStr  = this._brushStrength * 0.5;

        for (const { index, dist } of verts) {
            const delta = (Math.random() * 2.0 - 1.0) * halfStr * this._falloff(dist);
            pos.setY(index, pos.getY(index) + delta);
        }

        this._markGeometryDirty();
    }

    /**
     * Lerp all vertices within brush radius toward the target height.
     * @private
     * @param {{point:THREE.Vector3}} hit
     */
    _applyFlatten(hit) {
        const verts = this._getVerticesInRadius(hit.point);
        if (!verts.length) return;

        const pos = this._mesh.geometry.getAttribute('position');

        for (const { index, dist } of verts) {
            const fo  = this._falloff(dist);
            const cur = pos.getY(index);
            pos.setY(index, cur + (this._targetHeight - cur) * this._brushStrength * fo);
        }

        this._markGeometryDirty();
    }

    /**
     * Mark the position attribute dirty and recompute vertex normals.
     * Must be called after every geometry mutation.
     * @private
     */
    _markGeometryDirty() {
        const geom = this._mesh.geometry;
        geom.getAttribute('position').needsUpdate = true;
        geom.computeVertexNormals();
    }

    // ── Disposal ──────────────────────────────────────────────────────────────

    /**
     * Remove all pointer event listeners.
     * Call when the sculpting session ends to prevent memory leaks.
     */
    dispose() {
        this.domElement.removeEventListener('pointerdown', this._boundDown);
        this.domElement.removeEventListener('pointermove', this._boundMove);
        this.domElement.removeEventListener('pointerup',   this._boundUp);
    }
}
