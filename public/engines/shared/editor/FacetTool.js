/**
 * FacetTool.js
 * Tool for converting arbitrary GLTF meshes into faceted, palette-snapped low-poly
 * objects suitable for the Unified3D tri-mesh renderer.
 */

import TriMeshRenderer3D from '../TriMeshRenderer3D.js';

export default class FacetTool {
    /**
     * Parse a GLTF/GLB file and return an array of processed THREE.Mesh objects.
     * Each mesh is converted to non-indexed geometry (for faceted normals) and
     * its colors are snapped to the nearest palette color.
     *
     * @param {ArrayBuffer} buffer - The GLTF/GLB file buffer.
     * @param {THREE} THREE - Three.js module.
     * @param {GLTFLoader} GLTFLoader - GLTFLoader module.
     * @param {number[]} paletteColors - Array of hex colors for snapping.
     * @returns {Promise<THREE.Mesh[]>}
     */
    static async importAndFacet(buffer, THREE, GLTFLoader, paletteColors) {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.parse(buffer, '', (gltf) => {
                const results = [];
                gltf.scene.traverse((child) => {
                    if (child.isMesh) {
                        // 1. Convert to non-indexed for faceted normals
                        child.geometry = TriMeshRenderer3D.randomizeNormals(child.geometry);

                        // 2. Replace material with flat-shaded Phong
                        const oldMat = child.material;
                        const color = oldMat && oldMat.color ? oldMat.color.clone() : new THREE.Color(0xcccccc);
                        
                        const newMat = new THREE.MeshPhongMaterial({
                            color: color,
                            flatShading: true,
                            shininess: 0,
                            vertexColors: !!child.geometry.getAttribute('color')
                        });

                        // 3. Snap color to palette
                        TriMeshRenderer3D.paletteSnap(newMat, paletteColors);

                        child.material = newMat;
                        child.castShadow = true;
                        child.receiveShadow = true;
                        results.push(child);
                    }
                });
                resolve(results);
            }, (error) => {
                reject(error);
            });
        });
    }
}
