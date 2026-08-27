/**
 * FacetTool.js — GLTF/GLB import pipeline with flat-shading enforcement and palette colour snapping.
 *
 * Features:
 *  - Load GLTF/GLB from File, URL, or ArrayBuffer
 *  - Convert all mesh geometries to non-indexed (toNonIndexed) for flat-shading
 *  - Snap material colours to the nearest palette entry
 *  - Static utility methods (snapColorToPalette, blobToGLTF)
 *
 * Usage (ES module):
 *
 *   import FacetTool from '/engines/shared/FacetTool.js';
 *
 *   const palette = [new THREE.Color(0xff0000), new THREE.Color(0x00ff00), ...];
 *
 *   // From a <input type="file"> selection
 *   const result = await FacetTool.facetFile(fileInput.files[0], palette);
 *   scene.add(result.scene);
 *
 *   // From a URL
 *   const result2 = await FacetTool.facetFromURL('/api/assets3d/hero.glb', palette);
 */

import * as THREE from '/lib/three/three.module.js';

// Lazy-load GLTFLoader so the module is still importable in environments
// where the loader file is unavailable (e.g., unit-test stubs).
let _GLTFLoader = null;

async function _getGLTFLoader() {
    if (_GLTFLoader) return _GLTFLoader;
    try {
        const mod = await import('/lib/three/loaders/GLTFLoader.js');
        _GLTFLoader = mod.GLTFLoader;
        return _GLTFLoader;
    } catch (err) {
        console.warn('[FacetTool] GLTFLoader unavailable:', err.message,
            '\nEnsure /lib/three/loaders/GLTFLoader.js is present and patched.');
        return null;
    }
}

export default class FacetTool {

    // ── Core pipeline ─────────────────────────────────────────────────────────

    /**
     * Full facet pipeline: load GLTF/GLB, convert to flat non-indexed geometry,
     * and optionally snap material colours to a palette.
     *
     * @param {ArrayBuffer|string} gltfData  GLB ArrayBuffer or GLTF JSON string
     * @param {THREE.Color[]}      [palette] Optional array of THREE.Color palette entries
     * @param {object}             [options]
     * @param {boolean}            [options.remapColors=true]   Snap material colours to palette
     * @param {boolean}            [options.flatShading=true]   Enforce flat shading
     * @param {string}             [options.resourcePath='']    Base path for external GLTF resources
     * @returns {Promise<{ scene: THREE.Group, meshes: THREE.Mesh[] }>}
     */
    static async facetGLTF(gltfData, palette = null, options = {}) {
        const {
            remapColors  = true,
            flatShading  = true,
            resourcePath = '',
        } = options;

        const Loader = await _getGLTFLoader();
        if (!Loader) throw new Error('[FacetTool] GLTFLoader not available.');

        const loader = new Loader();

        // Parse from ArrayBuffer or string
        const gltf = await new Promise((resolve, reject) => {
            loader.parse(gltfData, resourcePath, resolve, reject);
        });

        const processedMeshes = [];

        gltf.scene.traverse(obj => {
            if (!obj.isMesh) return;

            // Convert to non-indexed geometry for true flat shading
            const nonIndexed = obj.geometry.toNonIndexed();
            nonIndexed.computeVertexNormals();
            obj.geometry.dispose();
            obj.geometry = nonIndexed;

            // Patch material(s)
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const mat of mats) {
                if (!mat) continue;

                if (flatShading) {
                    // Switch to MeshPhongMaterial with flatShading:true + shininess:0
                    const phong = new THREE.MeshPhongMaterial({
                        color:       mat.color ? mat.color.clone() : new THREE.Color(0xaaaaaa),
                        flatShading: true,
                        shininess:   0,
                        vertexColors: mat.vertexColors,
                    });

                    if (remapColors && palette && palette.length > 0 && phong.color) {
                        phong.color = FacetTool.snapColorToPalette(phong.color, palette);
                    }

                    mat.dispose();

                    // Replace the material reference on the mesh
                    if (Array.isArray(obj.material)) {
                        const idx = obj.material.indexOf(mat);
                        if (idx !== -1) obj.material[idx] = phong;
                    } else {
                        obj.material = phong;
                    }
                } else if (remapColors && palette && palette.length > 0 && mat.color) {
                    mat.color = FacetTool.snapColorToPalette(mat.color, palette);
                    mat.flatShading = true;
                    mat.needsUpdate = true;
                }
            }

            obj.castShadow    = true;
            obj.receiveShadow = true;
            processedMeshes.push(obj);
        });

        return { scene: gltf.scene, meshes: processedMeshes };
    }

    // ── Palette utility ───────────────────────────────────────────────────────

    /**
     * Return the nearest colour in paletteColors to the input colour (RGB Euclidean).
     * @param {THREE.Color}   color          Source colour
     * @param {THREE.Color[]} paletteColors  Array of candidate palette colours
     * @returns {THREE.Color}  New colour object set to the nearest palette entry
     */
    static snapColorToPalette(color, paletteColors) {
        if (!paletteColors || paletteColors.length === 0) return color.clone();

        let bestIndex = 0;
        let bestDist  = Infinity;

        for (let i = 0; i < paletteColors.length; i++) {
            const d = color.distanceTo(paletteColors[i]);
            if (d < bestDist) {
                bestDist  = d;
                bestIndex = i;
            }
        }

        return paletteColors[bestIndex].clone();
    }

    // ── Data conversion helpers ───────────────────────────────────────────────

    /**
     * Wrap a GLB/GLTF ArrayBuffer in a temporary Blob URL.
     * Caller is responsible for calling URL.revokeObjectURL() when done.
     * @param {ArrayBuffer} arrayBuffer
     * @returns {string}  Blob URL (e.g. "blob:http://...")
     */
    static blobToGLTF(arrayBuffer) {
        const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
        return URL.createObjectURL(blob);
    }

    // ── Convenience loaders ───────────────────────────────────────────────────

    /**
     * Load a GLTF/GLB from a browser File object and run the facet pipeline.
     * @param {File}          file     File selected via <input type="file">
     * @param {THREE.Color[]} [palette]
     * @param {object}        [options]  Forwarded to facetGLTF
     * @returns {Promise<{ scene: THREE.Group, meshes: THREE.Mesh[] }>}
     */
    static async facetFile(file, palette = null, options = {}) {
        const arrayBuffer = await file.arrayBuffer();
        return FacetTool.facetGLTF(arrayBuffer, palette, options);
    }

    /**
     * Load a GLTF/GLB from a URL and run the facet pipeline.
     * @param {string}        url
     * @param {THREE.Color[]} [palette]
     * @param {object}        [options]  Forwarded to facetGLTF
     * @returns {Promise<{ scene: THREE.Group, meshes: THREE.Mesh[] }>}
     */
    static async facetFromURL(url, palette = null, options = {}) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`[FacetTool] fetch failed: ${res.status} ${url}`);
        const arrayBuffer = await res.arrayBuffer();

        // Derive resource path (base dir) for relative GLTF external resources
        const resourcePath = url.substring(0, url.lastIndexOf('/') + 1);

        return FacetTool.facetGLTF(arrayBuffer, palette, { resourcePath, ...options });
    }
}
