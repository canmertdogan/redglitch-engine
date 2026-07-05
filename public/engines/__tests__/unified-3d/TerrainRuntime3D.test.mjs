import test from 'node:test';
import assert from 'node:assert/strict';

// Import the pure normalize function (not the class which needs TerrainSystem3D)
import { normalizeTerrainLevel } from '../../unified-3d/TerrainRuntime3D.js';

test('normalizeTerrainLevel — returns levelData as-is for non-object', () => {
  assert.equal(normalizeTerrainLevel(null), null);
  assert.equal(normalizeTerrainLevel('string'), 'string');
});

test('normalizeTerrainLevel — deep clones, does not mutate input', () => {
  const input = { name: 'test' };
  const result = normalizeTerrainLevel(input);
  assert.deepEqual(result, input);
  result.name = 'mutated';
  assert.equal(input.name, 'test');
});

test('normalizeTerrainLevel — sets default bounds from trimesh width', () => {
  const input = { terrain: { type: 'heightmap' }, trimesh: { width: 100, height: 80, positions: [0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.bounds.width, 100);
  assert.equal(result.bounds.height, 80);
  assert.equal(result.terrain.mode, 'trimesh');
});

test('normalizeTerrainLevel — sets default bounds from worldW/worldH', () => {
  const input = { terrain: { type: 'heightmap' }, worldW: 50, worldH: 40, trimesh: { positions: [0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.bounds.width, 50);
  assert.equal(result.bounds.height, 40);
});

test('normalizeTerrainLevel — defaults to 64 when no dimensions', () => {
  const input = { terrain: { type: 'heightmap' }, trimesh: { positions: [0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.bounds.width, 64);
  assert.equal(result.bounds.height, 64);
});

test('normalizeTerrainLevel — offsets negative coords when needed', () => {
  const input = {
    terrain: { type: 'heightmap' },
    worldW: 64, worldH: 64,
    trimesh: { positions: [-10, 0, -10, 10, 0, -10, -10, 0, 10] },
    entities: [{ position: [-5, 0, -5] }],
  };
  const result = normalizeTerrainLevel(input);
  const pos = result.trimesh.positions;
  assert.ok(pos[0] >= 0);
  assert.ok(pos[2] >= 0);
  assert.ok(result.entities[0].position[0] >= 0);
});

test('normalizeTerrainLevel — skips offset when no negative coords', () => {
  const input = {
    terrain: { type: 'heightmap' },
    worldW: 64, worldH: 64,
    trimesh: { positions: [10, 0, 10, 20, 0, 10, 10, 0, 20] },
  };
  const result = normalizeTerrainLevel(input);
  assert.deepEqual(result.trimesh.positions, [10, 0, 10, 20, 0, 10, 10, 0, 20]);
});

test('normalizeTerrainLevel — builds lowpoly terrain from heightMap', () => {
  const input = {
    worldW: 4, worldH: 4,
    terrain: { type: 'heightmap', cellSize: 1, heightMap: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3] },
  };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.terrain.mode, 'lowpoly');
  assert.ok(Array.isArray(result.terrain.elevation));
});

test('normalizeTerrainLevel — sets skybox from skyColor', () => {
  const input = { terrain: { type: 'heightmap' }, worldW: 10, worldH: 10, skyColor: '#87ceeb' };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.skybox.type, 'solid');
  assert.equal(result.skybox.colorHex, '#87ceeb');
});

test('normalizeTerrainLevel — does not touch existing skybox', () => {
  const input = { terrain: { type: 'heightmap' }, worldW: 10, worldH: 10, skybox: { type: 'cube', texture: 'sky.png' } };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.skybox.type, 'cube');
});

test('normalizeTerrainLevel — converts terrainMeshes with sculptedPositions', () => {
  const input = {
    terrainMeshes: [{
      type: 'terrain',
      sculptedPositions: [0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
      sculptedNormals: [],
      sculptedColors: [],
    }],
  };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.terrain.mode, 'trimesh');
  assert.ok(Array.isArray(result.trimesh?.positions));
});

test('normalizeTerrainLevel — converts terrainMeshes with elevationGrid', () => {
  const input = {
    terrainMeshes: [{
      type: 'terrain',
      genWidth: 4,
      genDepth: 4,
      heightScale: 2,
      elevationGrid: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
    }],
  };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.terrain.mode, 'lowpoly');
  assert.ok(Array.isArray(result.terrain.elevation));
});

test('normalizeTerrainLevel — normalizes legacy navmesh triangles', () => {
  const input = {
    terrain: { type: 'heightmap' },
    worldW: 64, worldH: 64,
    navmesh: {
      triangles: [
        { verts: [[0, 0, 0], [10, 0, 0], [0, 0, 10]] },
      ],
    },
  };
  const result = normalizeTerrainLevel(input);
  assert.ok(Array.isArray(result.navmesh.vertices));
  assert.ok(Array.isArray(result.navmesh.indices));
  assert.equal(result.navmesh.indices.length, 3);
});

test('normalizeTerrainLevel — returns data unchanged when no terrain', () => {
  const input = { worldW: 10, worldH: 10, entities: [{ id: 'e1' }] };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.worldW, 10);
  assert.equal(result.entities[0].id, 'e1');
});

test('normalizeTerrainLevel — does not offset when mode already set', () => {
  const input = { terrain: { mode: 'lowpoly' } };
  const result = normalizeTerrainLevel(input);
  assert.equal(result.terrain.mode, 'lowpoly');
});
