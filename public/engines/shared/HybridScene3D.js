/**
 * HybridScene3D.js
 * Phase 62 — Unified scene that hosts both voxel chunk meshes and tri-mesh objects.
 * Owns a THREE.Scene, a TriMeshRenderer3D, and a voxel chunk map.
 * Provides frustum culling, draw-call budgeting, and a unified remove/visibility API.
 */

import * as THREE from '/lib/three/three.module.js';
import TriMeshRenderer3D from './TriMeshRenderer3D.js';

export default class HybridScene3D {
  /**
   * @param {object} renderer3D - A Renderer3D instance (must expose a `render(delta)` method).
   */
  constructor(renderer3D) {
    /** @type {object} External Renderer3D instance used for final rendering. */
    this._renderer3D = renderer3D;

    /** @type {THREE.Scene} The Three.js scene owned by this hybrid manager. */
    this.scene = new THREE.Scene();

    /** @type {TriMeshRenderer3D} Manages all tri-mesh objects in the scene. */
    this.triMesh = new TriMeshRenderer3D(this.scene);

    /** @type {Map<string, THREE.Mesh>} Voxel chunk meshes keyed by id. */
    this._voxelMeshes = new Map();

    /** @type {number} Maximum allowed draw calls before culling kicks in. */
    this.drawCallBudget = 2000;

    /** @private Reusable frustum for culling. */
    this._frustum = new THREE.Frustum();

    /** @private Reusable matrix for frustum projection. */
    this._projScreenMatrix = new THREE.Matrix4();
  }

  /**
   * Add a voxel chunk mesh to the scene.
   * @param {string} id - Unique identifier for this chunk.
   * @param {THREE.Mesh} mesh - The voxel chunk mesh.
   */
  addVoxelChunk(id, mesh) {
    this._voxelMeshes.set(id, mesh);
    this.scene.add(mesh);
  }

  /**
   * Add a tri-mesh object by building it from geometry + palette data.
   * Delegates to TriMeshRenderer3D.add().
   * @param {string} id - Unique identifier.
   * @param {THREE.BufferGeometry} geometry - Source geometry.
   * @param {number} paletteIndex - Index into the palette array.
   * @param {number[]} palette - Array of hex color values.
   * @returns {THREE.Mesh}
   */
  addTriMesh(id, geometry, paletteIndex, palette) {
    return this.triMesh.add(id, geometry, paletteIndex, palette);
  }

  /**
   * Remove a mesh by id from whichever subsystem owns it.
   * Disposes voxel chunk geometry/material if applicable.
   * @param {string} id - Identifier of the object to remove.
   */
  remove(id) {
    if (this._voxelMeshes.has(id)) {
      const mesh = this._voxelMeshes.get(id);
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
      this.scene.remove(mesh);
      this._voxelMeshes.delete(id);
    } else {
      this.triMesh.remove(id);
    }
  }

  /**
   * Show or hide a mesh by id (checks both subsystems).
   * @param {string} id - Identifier of the object.
   * @param {boolean} visible - Desired visibility.
   */
  setVisible(id, visible) {
    if (this._voxelMeshes.has(id)) {
      this._voxelMeshes.get(id).visible = visible;
    } else {
      this.triMesh.setVisible(id, visible);
    }
  }

  /**
   * Toggle wireframe mode on all tri-mesh objects.
   * @param {boolean} enabled - Whether to enable wireframe.
   */
  setWireframe(enabled) {
    this.triMesh.setWireframe(enabled);
  }

  /**
   * Return total number of active draw calls (voxel chunks + tri-meshes).
   * @returns {number}
   */
  getDrawCallCount() {
    return this._voxelMeshes.size + this.triMesh._meshes.size;
  }

  /**
   * Perform frustum culling: hide any mesh whose bounding sphere is outside the camera frustum.
   * @param {THREE.Camera} camera - The active camera.
   */
  frustumCull(camera) {
    this._projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this._frustum.setFromProjectionMatrix(this._projScreenMatrix);

    const cullMesh = (mesh) => {
      if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }
      const sphere = mesh.geometry.boundingSphere.clone();
      sphere.applyMatrix4(mesh.matrixWorld);
      mesh.visible = this._frustum.intersectsSphere(sphere);
    };

    for (const mesh of this._voxelMeshes.values()) cullMesh(mesh);
    for (const mesh of this.triMesh._meshes.values()) cullMesh(mesh);
  }

  /**
   * Per-frame update: run frustum culling and update animated meshes.
   * @param {number} delta - Time since last frame in seconds.
   * @param {THREE.Camera} camera - The active camera.
   */
  update(delta, camera) {
    if (camera) this.frustumCull(camera);
    // Future: tick animated mesh mixers here
  }

  /**
   * Render the scene via the external Renderer3D instance.
   * @param {number} delta - Time since last frame in seconds.
   */
  render(delta) {
    this._renderer3D.render(delta);
  }
}
