const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const assetsRouter = require('../assets');
const assetRegistry = require('../../services/AssetRegistry');
const projectService = require('../../services/projectService');
const config = require('../../config');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  createTestProject, activateTestProject, resetActiveProject, cleanupTestProjects,
} = require('../../__tests__/helpers/setup');

test.beforeEach(() => {
  resetActiveProject();
  assetRegistry.cache = null;
  assetRegistry.cachedProjectPath = null;
});
test.after(cleanupTestProjects);

test('POST /api/assets/upload prefixes missing assets/ path, blocks traversal, and rebuilds registry', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('assets_upload');
  await activateTestProject('assets_upload');

  const app = createApp(assetsRouter, '/api/assets');

  // Relative path without assets/ prefix (previously threw TypeError: Assignment to constant variable)
  const res = await request(app, 'POST', '/api/assets/upload', {
    path: 'sprites/hero.png',
    content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    isBase64: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);
  assert.equal(res.data.path, 'assets/sprites/hero.png');

  const diskFile = path.join(config.PROJECTS_ROOT, projectName, 'assets', 'sprites', 'hero.png');
  await fs.access(diskFile);

  // Registry was rebuilt and uses leading '/' for project asset URLs
  const regRes = await request(app, 'GET', '/api/assets');
  assert.equal(regRes.status, 200);
  const hero = regRes.data.assets.find(a => a.id === 'assets/sprites/hero.png');
  assert.ok(hero, 'Expected uploaded asset in rebuilt registry');
  assert.equal(hero.path, `/projects/${projectName}/assets/sprites/hero.png`);
  assert.equal(hero.type, 'image');

  // Traversal outside assets/ must be blocked
  const traversalRes = await request(app, 'POST', '/api/assets/upload', {
    path: 'assets/../escape.json',
    content: '{}',
    isBase64: false,
  });
  assert.equal(traversalRes.status, 403);
});

test('GET /api/assets/list returns project assets and merged dunyalar/definitions/*.json', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('assets_list');
  await activateTestProject('assets_list');

  const projectRoot = path.join(config.PROJECTS_ROOT, projectName);
  await fs.mkdir(path.join(projectRoot, 'assets'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'assets', 'tile.png'), 'png');
  await fs.mkdir(path.join(projectRoot, 'dunyalar', 'definitions'), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, 'dunyalar', 'definitions', 'custom_prefab.json'),
    JSON.stringify({ id: 'custom_prefab' }),
  );

  const app = createApp(assetsRouter, '/api/assets');

  const res = await request(app, 'GET', '/api/assets/list');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data));
  assert.ok(res.data.some(a => a.name === 'tile.png'));
  const customDef = res.data.find(a => a.name === 'custom_prefab.json');
  assert.ok(customDef);
  assert.equal(customDef.path, 'dunyalar/definitions/custom_prefab.json');
  assert.ok(res.data.some(a => a.path === 'dunyalar/definitions/goblin.json'));

  const defsOnly = await request(app, 'GET', '/api/assets/list?scope=definitions');
  assert.equal(defsOnly.status, 200);
  assert.equal(defsOnly.data.some(a => a.name === 'tile.png'), false);
  assert.ok(defsOnly.data.some(a => a.path === 'dunyalar/definitions/custom_prefab.json'));

  const assetsOnly = await request(app, 'GET', '/api/assets/list?scope=assets');
  assert.equal(assetsOnly.status, 200);
  assert.ok(assetsOnly.data.some(a => a.name === 'tile.png'));
  assert.equal(assetsOnly.data.some(a => a.path.includes('definitions')), false);
});

test('AssetRegistry maps shaders (.frag/.vert/.glsl) and scripts (.js in data/logic, data/brains, scripts/) with leading slash', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('assets_types');
  await activateTestProject('assets_types');

  const projectRoot = path.join(config.PROJECTS_ROOT, projectName);
  await fs.mkdir(path.join(projectRoot, 'data', 'shaders'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'data', 'logic'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'data', 'brains'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, 'scripts'), { recursive: true });

  await fs.writeFile(path.join(projectRoot, 'data', 'shaders', 'glow.frag'), 'void main() {}');
  await fs.writeFile(path.join(projectRoot, 'data', 'shaders', 'pass.vert'), 'void main() {}');
  await fs.writeFile(path.join(projectRoot, 'data', 'shaders', 'fx.glsl'), 'void main() {}');
  await fs.writeFile(path.join(projectRoot, 'data', 'logic', 'door.js'), 'export function onStart() {}');
  await fs.writeFile(path.join(projectRoot, 'data', 'brains', 'patrol.js'), 'export function tick() {}');
  await fs.writeFile(path.join(projectRoot, 'scripts', 'helper.js'), 'export const x = 1;');

  const reg = await assetRegistry.rebuild();
  const byId = new Map(reg.assets.map(a => [a.id, a]));

  assert.equal(byId.get('data/shaders/glow.frag').type, 'shader');
  assert.equal(byId.get('data/shaders/pass.vert').type, 'shader');
  assert.equal(byId.get('data/shaders/fx.glsl').type, 'shader');
  assert.equal(byId.get('data/logic/door.js').type, 'script');
  assert.equal(byId.get('data/brains/patrol.js').type, 'script');
  assert.equal(byId.get('scripts/helper.js').type, 'script');
  assert.equal(byId.get('scripts/helper.js').path, `/projects/${projectName}/scripts/helper.js`);
  assert.ok(projectService.getActiveProject().endsWith(projectName));
});
