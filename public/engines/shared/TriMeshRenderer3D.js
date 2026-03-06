/**
 * TriMeshRenderer3D.js
 * Phase 61 — Manages named tri-mesh objects in a THREE.Scene.
 * Flat-shaded low-poly style using MeshPhongMaterial (shininess:0, flatShading:true).
 * No PBR, no textures — palette colors only.
 */

import * as THREE from '/lib/three/three.module.js';

export default class TriMeshRenderer3D {
  /**
   * @param {THREE.Scene} scene - The Three.js scene to add meshes to.
   */
  constructor(scene) {
    /** @type {THREE.Scene} */
    this.scene = scene;

    /** @type {Map<string, THREE.Mesh>} */
    this._meshes = new Map();
  }

  /**
   * Create a MeshPhongMaterial from a palette color and add the mesh to the scene.
   * @param {string} id - Unique identifier for this mesh.
   * @param {THREE.BufferGeometry} geometry - The geometry to use.
   * @param {number} paletteIndex - Index into the palette array.
   * @param {number[]} palette - Array of hex color values (e.g. [0xff0000, 0x00ff00]).
   * @returns {THREE.Mesh}
   */
  add(id, geometry, paletteIndex, palette) {
    const color = (palette && palette[paletteIndex] !== undefined)
      ? palette[paletteIndex]
      : 0xcccccc;

    const material = new THREE.MeshPhongMaterial({
      color,
      flatShading: true,
      shininess: 0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    this._meshes.set(id, mesh);
    this.scene.add(mesh);
    return mesh;
  }

  /**
   * Add a pre-built THREE.Mesh by ID.
   * @param {string} id - Unique identifier for this mesh.
   * @param {THREE.Mesh} mesh - A fully constructed mesh.
   */
  addMesh(id, mesh) {
    this._meshes.set(id, mesh);
    this.scene.add(mesh);
  }

  /**
   * Dispose geometry and material, then remove from scene.
   * @param {string} id - Identifier of the mesh to remove.
   */
  remove(id) {
    const mesh = this._meshes.get(id);
    if (!mesh) return;

    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => m.dispose());
    } else {
      mesh.material.dispose();
    }
    this.scene.remove(mesh);
    this._meshes.delete(id);
  }

  /**
   * Toggle visibility of a managed mesh.
   * @param {string} id - Identifier of the mesh.
   * @param {boolean} v - Visibility flag.
   */
  setVisible(id, v) {
    const mesh = this._meshes.get(id);
    if (mesh) mesh.visible = v;
  }

  /**
   * Toggle wireframe rendering on all managed meshes.
   * @param {boolean} enabled - Whether wireframe should be enabled.
   */
  setWireframe(enabled) {
    for (const mesh of this._meshes.values()) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => { m.wireframe = enabled; });
      } else {
        mesh.material.wireframe = enabled;
      }
    }
  }

  /**
   * Convert an indexed BufferGeometry to non-indexed so each triangle gets its
   * own vertices — enabling true per-face flat normals (classic faceted look).
   * Recomputes vertex normals after conversion.
   * @param {THREE.BufferGeometry} geometry - Source geometry (may be indexed or not).
   * @returns {THREE.BufferGeometry} The modified (non-indexed) geometry.
   */
  static randomizeNormals(geometry) {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    nonIndexed.computeVertexNormals();
    return nonIndexed;
  }

  /**
   * Snap a material's color to the nearest color in a palette (Euclidean RGB distance).
   * @param {THREE.MeshPhongMaterial} material - Material whose color will be snapped.
   * @param {number[]} paletteColors - Array of hex color integers.
   */
  static paletteSnap(material, paletteColors) {
    if (!paletteColors || paletteColors.length === 0) return;

    const src = material.color;
    let bestDist = Infinity;
    let bestHex = paletteColors[0];

    for (const hex of paletteColors) {
      const c = new THREE.Color(hex);
      const dr = src.r - c.r;
      const dg = src.g - c.g;
      const db = src.b - c.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestHex = hex;
      }
    }

    material.color.setHex(bestHex);
  }
}
