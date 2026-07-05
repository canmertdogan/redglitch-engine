const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const levelsRouter = require('../levels');
const config = require('../../config');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  testProjectName, createTestProject, activateTestProject, resetActiveProject,
  cleanupTestProjects,
} = require('../../__tests__/helpers/setup');
const projectService = require('../../services/projectService');

test.after(async () => {
  resetActiveProject();
  await cleanupTestProjects();
});

test('GET /api — lists levels (empty for root)', async () => {
  const app = createApp(levelsRouter);
  const res = await request(app, 'GET', '/api');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.levels));
});

test('POST /api/save-level — saves a platformer level', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('lvl_save');
  await activateTestProject('lvl_save');
  const app = createApp(levelsRouter);

  const levelData = {
    name: 'Test Level',
    spawn: { x: 100, y: 200 },
    collision: [{ x: 0, y: 0, w: 32, h: 32 }],
  };

  const res = await request(app, 'POST', '/api/save-level', {
    project: projectName, levelId: 'test-level-1', data: levelData,
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  const levelPath = path.join(config.PROJECTS_ROOT, projectName, 'dunyalar', 'test-level-1.json');
  const saved = JSON.parse(await fs.readFile(levelPath, 'utf8'));
  assert.equal(saved.name, 'Test Level');
  assert.equal(saved.engineType, 'platformer-2d');
  resetActiveProject();
});

test('POST /api/save-level — rejects invalid level id', async () => {
  const app = createApp(levelsRouter);
  const res = await request(app, 'POST', '/api/save-level', {
    project: 'any', levelId: '../escape', data: {},
  });
  assert.equal(res.status, 400);
});

test('GET /api/platformer-levels/:project — lists platformer levels', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('lvl_list');
  await activateTestProject('lvl_list');

  const dunyalar = path.join(config.PROJECTS_ROOT, projectName, 'dunyalar');
  await fs.mkdir(dunyalar, { recursive: true });
  await fs.writeFile(path.join(dunyalar, 'map1.json'), '{"name":"Map 1"}');
  await fs.writeFile(path.join(dunyalar, 'map2.json'), '{"name":"Map 2"}');

  const app = createApp(levelsRouter);
  const res = await request(app, 'GET', `/api/platformer-levels/${projectName}`);
  assert.equal(res.status, 200);
  assert.ok(res.data.includes('map1.json'));
  assert.ok(res.data.includes('map2.json'));
  resetActiveProject();
});

test('POST /api/levels/:filename — saves a generic level', async () => {
  const app = createApp(levelsRouter);
  const levelData = {
    name: 'Generic Level',
    layers: [{ tiles: [] }],
  };
  const res = await request(app, 'POST', '/api/levels/test-generic.json', levelData);
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  const activeDir = projectService.isRootProject()
    ? path.join(config.PUBLIC_DIR, 'dunyalar')
    : path.join(projectService.getActiveProject(), 'dunyalar');
  const saved = JSON.parse(await fs.readFile(path.join(activeDir, 'test-generic.json'), 'utf8'));
  assert.equal(saved.name, 'Generic Level');
  assert.equal(saved.engineType, 'rpg-topdown');

  await fs.unlink(path.join(activeDir, 'test-generic.json')).catch(() => {});
});

test('DELETE /api/levels/:filename — deletes a level', async () => {
  const activeDir = projectService.isRootProject()
    ? path.join(config.PUBLIC_DIR, 'dunyalar')
    : path.join(projectService.getActiveProject(), 'dunyalar');
  await fs.mkdir(activeDir, { recursive: true });
  await fs.writeFile(path.join(activeDir, 'to-delete.json'), '{"name":"Delete Me"}');

  const app = createApp(levelsRouter);
  const res = await request(app, 'DELETE', '/api/levels/to-delete.json');
  assert.equal(res.status, 200);

  const exists = await fs.access(path.join(activeDir, 'to-delete.json')).then(() => true).catch(() => false);
  assert.equal(exists, false);
});

test('DELETE /api/levels/:filename — returns 404 for nonexistent level', async () => {
  const app = createApp(levelsRouter);
  const res = await request(app, 'DELETE', '/api/levels/nonexistent.json');
  assert.equal(res.status, 404);
});
