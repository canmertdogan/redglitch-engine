const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const levels3dRouter = require('../levels3d');
const config = require('../../config');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  testProjectName, createTestProject, cleanupTestProjects,
} = require('../../__tests__/helpers/setup');

const { validateLevel3D, normalizeSkybox3D } = levels3dRouter;

test.after(cleanupTestProjects);

test('GET /api/levels3d/:project — lists 3D levels (empty)', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('l3d_list_empty');
  const app = createApp(levels3dRouter);
  const res = await request(app, 'GET', `/api/levels3d/${projectName}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.levels, []);
});

test('GET /api/levels3d/:project/:level — returns 404 for missing level', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('l3d_notfound');
  const app = createApp(levels3dRouter);
  const res = await request(app, 'GET', `/api/levels3d/${projectName}/nonexistent`);
  assert.equal(res.status, 404);
});

test('POST /api/levels3d/:project/:level — saves fps-3d level', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('l3d_save_fps');
  const app = createApp(levels3dRouter);

  const levelData = {
    engineType: 'fps-3d',
    name: 'Test FPS Level',
    voxelGrid: { 0: { 0: { 0: { r: 128, g: 128, b: 128 } } } },
    palette: { terrain: { r: 128, g: 128, b: 128, a: 255 } },
  };

  const res = await request(app, 'POST', `/api/levels3d/${projectName}/fps_test`, levelData);
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.engineType, 'fps-3d');

  const savedPath = path.join(config.PROJECTS_ROOT, projectName, 'dunyalar', 'fps_test.json');
  const saved = JSON.parse(await fs.readFile(savedPath, 'utf8'));
  assert.equal(saved.engineType, 'fps-3d');
  assert.equal(saved.name, 'Test FPS Level');
  assert.ok(saved.skybox);
});

test('POST /api/levels3d/:project/:level — saves unified-3d level', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('l3d_save_unified');
  const app = createApp(levels3dRouter);
  const res = await request(app, 'POST', `/api/levels3d/${projectName}/unified_test`, {
    engineType: 'unified-3d', name: 'Unified Test', mode: 'platformer-3d',
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.engineType, 'unified-3d');
});

test('POST /api/levels3d/:project/:level — rejects invalid engine type', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('l3d_invalid');
  const app = createApp(levels3dRouter);
  const res = await request(app, 'POST', `/api/levels3d/${projectName}/bad_level`, {
    engineType: 'platformer-2d',
  });
  assert.equal(res.status, 400);
});

test('GET /api/levels3d/:project/:level — reads back saved level', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('l3d_roundtrip');
  const app = createApp(levels3dRouter);

  await request(app, 'POST', `/api/levels3d/${projectName}/roundtrip`, {
    engineType: 'topdown-3d', name: 'Roundtrip Test', geometry: [],
  });

  const res = await request(app, 'GET', `/api/levels3d/${projectName}/roundtrip`);
  assert.equal(res.status, 200);
  assert.equal(res.data.name, 'Roundtrip Test');
  assert.equal(res.data.engineType, 'topdown-3d');
});

test('GET /api/levels3d/:project — lists saved 3D levels', async () => {
  await cleanupTestProjects();
  const projectName = testProjectName('l3d_list_saved');
  const projectDir = path.join(config.PROJECTS_ROOT, projectName);
  await fs.mkdir(path.join(projectDir, 'dunyalar'), { recursive: true });
  await fs.writeFile(path.join(projectDir, 'dunyalar', 'red.json'), JSON.stringify({ engineType: 'fps-3d', name: 'Red' }));
  await fs.writeFile(path.join(projectDir, 'dunyalar', 'blue.json'), JSON.stringify({ engineType: 'topdown-3d', name: 'Blue' }));

  const app = createApp(levels3dRouter);
  const res = await request(app, 'GET', `/api/levels3d/${projectName}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.levels.length, 2);

  const names = res.data.levels.map(l => l.name).sort();
  assert.deepEqual(names, ['Blue', 'Red']);
});

// ── Unit tests for exported validators (no HTTP needed) ──

test('validateLevel3D — normalizes fps-3d level', () => {
  const result = validateLevel3D({ engineType: 'fps-3d', voxelGrid: { 0: {} } });
  assert.equal(result.engineType, 'fps-3d');
  assert.equal(result.version, '1.0');
  assert.equal(result.name, 'Untitled Level');
  assert.ok(result.skybox);
});

test('validateLevel3D — normalizes unified-3d level with mode', () => {
  const result = validateLevel3D({ engineType: 'unified-3d', mode: 'platformer-3d' });
  assert.equal(result.engineType, 'unified-3d');
  assert.equal(result.mode, 'platformer-3d');
});

test('validateLevel3D — normalizes platformer-3d level', () => {
  const result = validateLevel3D({ engineType: 'platformer-3d' });
  assert.equal(result.engineType, 'platformer-3d');
  assert.ok(Array.isArray(result.platforms));
  assert.ok(result.playerSpawn);
});

test('validateLevel3D — normalizes topdown-3d level', () => {
  const result = validateLevel3D({ engineType: 'topdown-3d' });
  assert.equal(result.engineType, 'topdown-3d');
  assert.ok(Array.isArray(result.geometry));
});

test('validateLevel3D — rejects non-object', () => {
  assert.throws(() => validateLevel3D(null), /Level data must be a JSON object/);
  assert.throws(() => validateLevel3D('string'), /Level data must be a JSON object/);
});

test('validateLevel3D — rejects invalid engine type', () => {
  assert.throws(() => validateLevel3D({ engineType: 'platformer-2d' }), /Invalid engineType/);
});

test('normalizeSkybox3D — returns defaults for empty input', () => {
  const result = normalizeSkybox3D({}, 'fps-3d');
  assert.equal(result.type, 'gradient');
  assert.ok(result.sun);
  assert.equal(result.sun.color, '#ffefcc');
});

test('normalizeSkybox3D — preserves explicit sky values', () => {
  const result = normalizeSkybox3D({ sky: { type: 'solid', colorHex: '#ff0000' } }, 'fps-3d');
  assert.equal(result.type, 'solid');
  assert.equal(result.colorHex, '#ff0000');
});
