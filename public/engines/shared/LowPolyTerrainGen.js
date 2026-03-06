/**
 * LowPolyTerrainGen.js
 * Phase 63 — Procedural low-poly terrain mesh generator.
 * Accepts an elevation grid and produces a flat-shaded, vertex-colored THREE.Mesh.
 * No textures, no UV maps — palette color bands only.
 */

import * as THREE from '/lib/three/three.module.js';
import TriMeshRenderer3D from './TriMeshRenderer3D.js';

/** Default height-band colors (hex integers). */
const DEFAULT_BANDS = [
  { threshold: 0.10, color: new THREE.Color(0x1a3a5c) }, // deep water
  { threshold: 0.20, color: new THREE.Color(0x2e6b8a) }, // shallow water
  { threshold: 0.30, color: new THREE.Color(0xc2a86b) }, // sand
  { threshold: 0.55, color: new THREE.Color(0x4a7c3f) }, // grass
  { threshold: 0.75, color: new THREE.Color(0x6b6b5e) }, // rock
  { threshold: 1.00, color: new THREE.Color(0xe8e8e8) }, // snow
];

/**
 * Return the terrain color for a normalized height value (0–1).
 * If a palette is supplied the result is snapped to the nearest palette color.
 * @param {number} normY - Normalized height 0–1.
 * @param {number[]|null} palette - Optional array of hex color integers for snapping.
 * @returns {THREE.Color}
 */
function heightToColor(normY, palette) {
  let c = DEFAULT_BANDS[DEFAULT_BANDS.length - 1].color.clone();
  for (const band of DEFAULT_BANDS) {
    if (normY <= band.threshold) {
      c = band.color.clone();
      break;
    }
  }

  if (palette && palette.length > 0) {
    let bestDist = Infinity;
    let bestColor = c;
    for (const hex of palette) {
      const pc = new THREE.Color(hex);
      const dr = c.r - pc.r;
      const dg = c.g - pc.g;
      const db = c.b - pc.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestColor = pc;
      }
    }
    return bestColor;
  }

  return c;
}

export default class LowPolyTerrainGen {
  /**
   * Generate a low-poly terrain mesh from a 2-D elevation grid.
   *
   * @param {Float32Array} elevationGrid - Flat array of length width*height, values 0–1.
   * @param {number} width  - Number of columns in the grid.
   * @param {number} height - Number of rows in the grid.
   * @param {object} [options]
   * @param {number}        [options.tileSize=1]   - World-space size of each grid cell.
   * @param {number}        [options.maxHeight=10] - World-space maximum Y value.
   * @param {number}        [options.jitter=0.15]  - Random height perturbation (±jitter).
   * @param {number[]|null} [options.palette=null] - Hex color array for palette snapping.
   * @param {THREE.Material|null} [options.material=null] - Override material (bypasses default).
   * @returns {{ geometry: THREE.BufferGeometry, mesh: THREE.Mesh }}
   */
  generate(elevationGrid, width, height, options = {}) {
    const {
      tileSize  = 1,
      maxHeight = 10,
      jitter    = 0.15,
      palette   = null,
      material  = null,
    } = options;

    // Pre-compute world-space Y for every grid vertex (with jitter).
    const worldY = new Float32Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const norm = elevationGrid[z * width + x];
        const j = (Math.random() * 2 - 1) * jitter;
        worldY[z * width + x] = (norm + j) * maxHeight;
      }
    }

    // Each cell produces 2 triangles → 6 vertices.
    const cellsX = width  - 1;
    const cellsZ = height - 1;
    const triCount = cellsX * cellsZ * 2;
    const positions = new Float32Array(triCount * 3 * 3); // 3 verts × 3 floats
    const colors    = new Float32Array(triCount * 3 * 3);

    let idx = 0;

    /**
     * Write one triangle's positions and per-vertex color into the typed arrays.
     * @param {number} ax @param {number} ay @param {number} az
     * @param {number} bx @param {number} by @param {number} bz
     * @param {number} cx @param {number} cy @param {number} cz
     * @param {THREE.Color} color
     */
    const writeTri = (ax, ay, az, bx, by, bz, cx, cy, cz, color) => {
      positions[idx]     = ax; positions[idx + 1] = ay; positions[idx + 2] = az;
      positions[idx + 3] = bx; positions[idx + 4] = by; positions[idx + 5] = bz;
      positions[idx + 6] = cx; positions[idx + 7] = cy; positions[idx + 8] = cz;

      for (let v = 0; v < 3; v++) {
        colors[idx + v * 3]     = color.r;
        colors[idx + v * 3 + 1] = color.g;
        colors[idx + v * 3 + 2] = color.b;
      }
      idx += 9;
    };

    for (let z = 0; z < cellsZ; z++) {
      for (let x = 0; x < cellsX; x++) {
        // Grid corner world positions
        const x0 = x       * tileSize;
        const x1 = (x + 1) * tileSize;
        const z0 = z       * tileSize;
        const z1 = (z + 1) * tileSize;

        const y00 = worldY[z       * width + x];
        const y10 = worldY[z       * width + (x + 1)];
        const y01 = worldY[(z + 1) * width + x];
        const y11 = worldY[(z + 1) * width + (x + 1)];

        if ((z % 2) === 0) {
          // Even row: top-left → bottom-right diagonal (TL–BL–BR and TL–BR–TR)
          const avgA = (y00 + y01 + y11) / 3;
          const avgB = (y00 + y11 + y10) / 3;
          writeTri(x0, y00, z0,  x0, y01, z1,  x1, y11, z1,  heightToColor(avgA / maxHeight, palette));
          writeTri(x0, y00, z0,  x1, y11, z1,  x1, y10, z0,  heightToColor(avgB / maxHeight, palette));
        } else {
          // Odd row: top-right → bottom-left diagonal (TL–BL–TR and TR–BL–BR)
          const avgA = (y00 + y01 + y10) / 3;
          const avgB = (y10 + y01 + y11) / 3;
          writeTri(x0, y00, z0,  x0, y01, z1,  x1, y10, z0,  heightToColor(avgA / maxHeight, palette));
          writeTri(x1, y10, z0,  x0, y01, z1,  x1, y11, z1,  heightToColor(avgB / maxHeight, palette));
        }
      }
    }

    // Build BufferGeometry (non-indexed, ready for flat normals)
    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    // Apply randomizeNormals for classic faceted look (already non-indexed, just recomputes)
    geometry = TriMeshRenderer3D.randomizeNormals(geometry);

    // Material: vertex colors + flat shading, no PBR
    const mat = material || new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading:  true,
      shininess:    0,
    });

    const mesh = new THREE.Mesh(geometry, mat);

    return { geometry, mesh };
  }

  /**
   * Convenience method: converts a flat integer array of Z-heights from a voxel grid
   * into a normalized Float32Array, then calls `generate()`.
   *
   * @param {Int32Array|number[]} voxelZ - Flat array of integer height values.
   * @param {number} width  - Grid width.
   * @param {number} height - Grid height.
   * @param {object} [options] - Same options as `generate()`.
   * @returns {{ geometry: THREE.BufferGeometry, mesh: THREE.Mesh }}
   */
  generateFromVoxelZ(voxelZ, width, height, options = {}) {
    // Normalize: find max value and divide
    let maxVal = 1;
    for (let i = 0; i < voxelZ.length; i++) {
      if (voxelZ[i] > maxVal) maxVal = voxelZ[i];
    }

    const elevationGrid = new Float32Array(voxelZ.length);
    for (let i = 0; i < voxelZ.length; i++) {
      elevationGrid[i] = voxelZ[i] / maxVal;
    }

    return this.generate(elevationGrid, width, height, options);
  }
}
