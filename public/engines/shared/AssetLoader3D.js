/**
 * AssetLoader3D.js — GLTF/GLB + MagicaVoxel .vox asset pipeline.
 *
 * Features:
 *  - GLTFLoader with flat-shading enforcement and palette color remapping
 *  - .vox parser → face-culled voxel BufferGeometry with per-vertex palette colors
 *  - Async asset manifest from /api/assets3d/:project
 *  - LRU asset cache (max 64 entries by default)
 *
 * Usage (ES module):
 *
 *   import AssetLoader3D from '/engines/shared/AssetLoader3D.js';
 *   import PaletteManager from '/engines/shared/PaletteManager.js';
 *
 *   const palette = new PaletteManager();
 *   await palette.load('/api/assets3d/MyProject/palette.pal');
 *
 *   const loader = new AssetLoader3D(scene, palette);
 *   const gltf   = await loader.loadGLTF('/api/assets3d/MyProject/hero.glb');
 *   const vox    = await loader.loadVox('/api/assets3d/MyProject/tree.vox');
 *
 *   scene.add(gltf.scene);
 *   scene.add(vox.mesh);
 */

import * as THREE                from '/lib/three/three.module.js';
import { GLTFLoader }            from '/lib/three/loaders/GLTFLoader.js';
import { applyFlatShading }      from '/engines/shared/Renderer3D.js';
import FacetTool                 from '/engines/shared/FacetTool.js';

// ── LRU Cache ────────────────────────────────────────────────────────────────

class LRUCache {
    constructor(maxSize = 64) {
        this._max  = maxSize;
        this._map  = new Map();
    }

    get(key) {
        if (!this._map.has(key)) return undefined;
        // Re-insert at end = most-recently-used
        const val = this._map.get(key);
        this._map.delete(key);
        this._map.set(key, val);
        return val;
    }

    set(key, val) {
        if (this._map.has(key)) this._map.delete(key);
        this._map.set(key, val);
        if (this._map.size > this._max) {
            // Evict least-recently-used (first entry)
            this._map.delete(this._map.keys().next().value);
        }
    }

    has(key)    { return this._map.has(key); }
    delete(key) { this._map.delete(key); }
    clear()     { this._map.clear(); }
    get size()  { return this._map.size; }
}

// ── AssetLoader3D ─────────────────────────────────────────────────────────────

class AssetLoader3D {
    /**
     * @param {THREE.Scene}   scene    Scene to attach loaded objects (optional convenience)
     * @param {PaletteManager} palette Shared project palette
     * @param {object}        [opts]
     * @param {number}        [opts.cacheSize=64]  Max LRU entries
     */
    constructor(scene, palette, opts = {}) {
        this.scene   = scene;
        this.palette = palette;

        this._cache  = new LRUCache(opts.cacheSize ?? 64);
        this._gltfLoader = new GLTFLoader();

        /** Manifest loaded from /api/assets3d/:project */
        this._manifest = null;
    }

    // ── Manifest ──────────────────────────────────────────────────────────────

    /**
     * Fetch the project asset manifest.
     * @param {string} projectName
     * @returns {Promise<object>}  { gltf: string[], vox: string[], pal: string[] }
     */
    async loadManifest(projectName) {
        const url = `/api/assets3d/${encodeURIComponent(projectName)}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this._manifest = await res.json();
            console.log(`[AssetLoader3D] manifest loaded for "${projectName}":`,
                this._manifest.gltf?.length ?? 0, 'gltf,',
                this._manifest.vox?.length  ?? 0, 'vox');
            return this._manifest;
        } catch (err) {
            console.warn('[AssetLoader3D] manifest fetch failed:', err.message);
            return {};
        }
    }

    // ── GLTF/GLB ──────────────────────────────────────────────────────────────

    /**
     * Load a GLTF/GLB file.
     * Enforces flat shading and remaps material colors to the project palette.
     * Returns a cloned scene group (safe to add multiple instances).
     *
     * @param {string}  url             Full URL or path to .glb/.gltf
     * @param {object}  [opts]
     * @param {boolean} [opts.cache=true]
     * @param {boolean} [opts.flatShading=true]
     * @param {boolean} [opts.remapColors=false]  Snap material colors to nearest palette entry
     * @returns {Promise<{ scene: THREE.Group, animations: THREE.AnimationClip[] }>}
     */
    async loadGLTF(url, opts = {}) {
        const cacheKey = 'gltf:' + url;
        if (opts.cache !== false && this._cache.has(cacheKey)) {
            const cached = this._cache.get(cacheKey);
            return { scene: cached.scene.clone(), animations: cached.animations };
        }

        const gltf = await new Promise((resolve, reject) => {
            this._gltfLoader.load(url, resolve, undefined, reject);
        });

        if (opts.flatShading !== false) {
            applyFlatShading(gltf.scene);
        }

        if (opts.remapColors && this.palette) {
            _remapToPalette(gltf.scene, this.palette);
        }

        gltf.scene.name = gltf.scene.name || _basename(url);

        if (opts.cache !== false) {
            this._cache.set(cacheKey, { scene: gltf.scene, animations: gltf.animations });
        }

        return { scene: gltf.scene.clone(), animations: gltf.animations };
    }

    // ── MagicaVoxel .vox ─────────────────────────────────────────────────────

    /**
     * Load and parse a MagicaVoxel .vox file.
     * Converts voxel grid to a face-culled THREE.BufferGeometry with per-vertex colors.
     *
     * NOTE: greedy meshing (chunk-based quad merging) is a build-time optimization;
     * face-culled cube meshing is used here for runtime editor/preview use.
     *
     * @param {string}  url
     * @param {object}  [opts]
     * @param {boolean} [opts.cache=true]
     * @param {number}  [opts.voxelSize=1]  World units per voxel
     * @returns {Promise<{ mesh: THREE.Mesh, sizeX, sizeY, sizeZ }>}
     */
    async loadVox(url, opts = {}) {
        const cacheKey = 'vox:' + url;
        if (opts.cache !== false && this._cache.has(cacheKey)) {
            const c = this._cache.get(cacheKey);
            return { mesh: c.mesh.clone(), sizeX: c.sizeX, sizeY: c.sizeY, sizeZ: c.sizeZ };
        }

        // Fetch raw binary
        const res = await fetch(url);
        if (!res.ok) throw new Error(`[AssetLoader3D] vox fetch failed: ${res.status} ${url}`);
        const arrayBuf = await res.arrayBuffer();

        // Parse using vendored parse-magica-voxel (CommonJS, loaded via importmap or bundler)
        // Falls back to dynamic import of the ESM-compatible wrapper
        const parsed = await _parseVox(arrayBuf);

        const size   = parsed.SIZE  ?? { x: 1, y: 1, z: 1 };
        const voxels = parsed.XYZI?.values ?? parsed.XYZI ?? [];

        // Build palette: use .vox embedded RGBA or fall back to PaletteManager
        const rgba   = parsed.RGBA;
        const getCol = (index) => {
            if (rgba && rgba[index]) {
                const c = rgba[index];
                return new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
            }
            return this.palette ? this.palette.getColor(index) : new THREE.Color(0xaaaaaa);
        };

        const vs   = opts.voxelSize ?? 1;
        const geom = _buildVoxelGeometry(voxels, size, vs, getCol);

        const mat  = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading:  true,
        });

        const mesh  = new THREE.Mesh(geom, mat);
        mesh.name   = _basename(url);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;

        const result = { mesh, sizeX: size.x, sizeY: size.y, sizeZ: size.z };

        if (opts.cache !== false) {
            this._cache.set(cacheKey, { mesh: mesh.clone(), ...result });
        }

        return result;
    }

    // ── Generic fetch helper ──────────────────────────────────────────────────

    /**
     * Fetch a named asset from the project assets3d API.
     * @param {string} projectName
     * @param {string} assetName    filename with extension
     * @returns {Promise<Response>}
     */
    fetchAsset(projectName, assetName) {
        return fetch(`/api/assets3d/${encodeURIComponent(projectName)}/${encodeURIComponent(assetName)}`);
    }

    // ── GLTF import (FacetTool pipeline) ─────────────────────────────────────

    /**
     * Import a GLTF/GLB File, run the FacetTool facet pipeline (flat-shade +
     * palette colour snap), persist the result to `projects/{projectName}/assets3d/`
     * via POST `/api/assets3d/{projectName}`, and return asset metadata.
     *
     * @param {string} projectName  Ketebe project name (used for storage path)
     * @param {File}   file         GLB/GLTF File from an <input type="file">
     * @param {object} [opts]
     * @param {boolean} [opts.remapColors=true]  Snap colours to project palette
     * @returns {Promise<{ name:string, url:string, meshCount:number }>}
     */
    async importGLTF(projectName, file, opts = {}) {
        const paletteColors = this.palette
            ? Array.from({ length: 256 }, (_, i) => this.palette.getColor(i))
            : null;

        let result;
        try {
            result = await FacetTool.facetFile(file, paletteColors, {
                remapColors: opts.remapColors ?? true,
                flatShading: true,
            });
        } catch (err) {
            console.warn('[AssetLoader3D] importGLTF FacetTool failed:', err.message);
            throw err;
        }

        // Re-read the original file bytes for persistence (we store the raw GLB)
        const arrayBuffer = await file.arrayBuffer();
        const assetName   = file.name;

        const url = `/api/assets3d/${encodeURIComponent(projectName)}`;
        const formData = new FormData();
        formData.append('file', new Blob([arrayBuffer], { type: 'model/gltf-binary' }), assetName);

        try {
            const res = await fetch(url, { method: 'POST', body: formData });
            if (!res.ok) {
                console.warn(`[AssetLoader3D] importGLTF upload failed: HTTP ${res.status}`);
            }
        } catch (err) {
            console.warn('[AssetLoader3D] importGLTF upload error:', err.message);
        }

        const meta = {
            name:      assetName,
            url:       `${url}/${encodeURIComponent(assetName)}`,
            meshCount: result.meshes.length,
            scene:     result.scene,
        };

        // Cache the processed scene for immediate re-use
        this._cache.set('gltf:' + meta.url, {
            scene:      result.scene,
            animations: [],
        });

        return meta;
    }

    /**
     * Fetch the list of 3D assets stored for a project.
     * @param {string} projectName
     * @returns {Promise<string[]>}  Array of asset filenames
     */
    async listAssets3D(projectName) {
        const url = `/api/assets3d/${encodeURIComponent(projectName)}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            // Server may return { gltf:[], vox:[], pal:[] } or a flat array
            if (Array.isArray(data)) return data;
            return [
                ...(data.gltf ?? []),
                ...(data.vox  ?? []),
                ...(data.pal  ?? []),
            ];
        } catch (err) {
            console.warn('[AssetLoader3D] listAssets3D failed:', err.message);
            return [];
        }
    }

    // ── Cache management ──────────────────────────────────────────────────────

    evict(url) {
        this._cache.delete('gltf:' + url);
        this._cache.delete('vox:'  + url);
    }

    clearCache() { this._cache.clear(); }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose() {
        this.clearCache();
    }
}

// ── Vox geometry builder ──────────────────────────────────────────────────────

/**
 * Build a face-culled voxel BufferGeometry.
 * Only renders faces exposed to air — significantly reduces triangle count.
 *
 * @param {Array<{x,y,z,i}>} voxels   Parsed voxel positions + palette index
 * @param {{x,y,z}}          size     Grid dimensions
 * @param {number}           vs       Voxel world size
 * @param {function}         getColor (index) → THREE.Color
 * @returns {THREE.BufferGeometry}
 */
function _buildVoxelGeometry(voxels, size, vs, getColor) {
    // Build occupancy set for fast neighbour lookup
    const occ = new Set();
    for (const v of voxels) occ.add(`${v.x},${v.y},${v.z}`);

    const positions = [];
    const colors    = [];
    const normals   = [];
    const indices   = [];

    let vi = 0; // vertex index counter

    // Face directions: [dx,dy,dz], normal, 4 corner offsets
    const FACES = [
        { d: [1,0,0],  n: [1,0,0],  c: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
        { d: [-1,0,0], n: [-1,0,0], c: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
        { d: [0,1,0],  n: [0,1,0],  c: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
        { d: [0,-1,0], n: [0,-1,0], c: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]] },
        { d: [0,0,1],  n: [0,0,1],  c: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
        { d: [0,0,-1], n: [0,0,-1], c: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
    ];

    for (const vox of voxels) {
        const { x, y, z, i: colorIdx } = vox;
        const col = getColor(colorIdx);

        for (const face of FACES) {
            const [dx, dy, dz] = face.d;
            const nx = x + dx, ny = y + dy, nz = z + dz;

            // Skip if neighbour voxel is solid (face is internal)
            if (occ.has(`${nx},${ny},${nz}`)) continue;

            // Emit 4 vertices for this quad
            for (const [ox, oy, oz] of face.c) {
                positions.push((x + ox) * vs, (y + oy) * vs, (z + oz) * vs);
                normals.push(...face.n);
                colors.push(col.r, col.g, col.b);
            }

            // Two triangles per quad (CCW winding)
            indices.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
            vi += 4;
        }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
    geom.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));
    geom.setIndex(indices);
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    return geom;
}

// ── GLTF helpers ─────────────────────────────────────────────────────────────

/**
 * Snap every mesh material color to the nearest palette entry.
 * Used when importing external GLTF files into a palette-only project.
 */
function _remapToPalette(root, palette) {
    const hex256 = Array.from({ length: 256 }, (_, i) => palette.getColor(i));
    root.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => {
            if (!mat.color) return;
            let bestIdx = 0, bestDist = Infinity;
            for (let i = 1; i < 256; i++) {
                const d = mat.color.distanceTo(hex256[i]);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            mat.color.copy(hex256[bestIdx]);
            mat.flatShading = true;
            mat.needsUpdate = true;
        });
    });
}

// ── .vox parser shim ──────────────────────────────────────────────────────────

/**
 * Parse a MagicaVoxel .vox ArrayBuffer using parse-magica-voxel.
 * The library is CJS; we load it as a module script via a dynamic import shim.
 */
async function _parseVox(arrayBuffer) {
    // parse-magica-voxel expects a Node Buffer or ArrayBuffer-like.
    // In the browser, wrap in Uint8Array.
    const bytes = new Uint8Array(arrayBuffer);

    // Try global (if bundled) then dynamic import fallback
    if (typeof parseMagicaVoxel !== 'undefined') {
        return parseMagicaVoxel(bytes);
    }

    // Dynamic import from the vendored ESM source entry
    const mod = await import('/lib/vox-loader/src/index.js');
    const parse = mod.default ?? mod;
    return parse(bytes);
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

function _basename(url) {
    return url.split('/').pop().replace(/\.[^.]+$/, '');
}

// ── Export ────────────────────────────────────────────────────────────────────

export { LRUCache };
export default AssetLoader3D;
