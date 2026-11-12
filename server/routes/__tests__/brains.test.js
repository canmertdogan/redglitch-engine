const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const brainsRouter = require('../brains');
const config = require('../../config');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  createTestProject, activateTestProject, resetActiveProject, cleanupTestProjects,
} = require('../../__tests__/helpers/setup');

const CORE_BRAINS_DIR = path.join(config.PUBLIC_DIR, 'data', 'brains');
const TEST_BRAIN_NAME = '__test_core_brain';
let createdCoreDir = false;

test.beforeEach(resetActiveProject);
test.after(async () => {
  await cleanupTestProjects();
  for (const ext of ['.json', '.js', '.ast.json']) {
    await fs.unlink(path.join(CORE_BRAINS_DIR, `${TEST_BRAIN_NAME}${ext}`)).catch(() => {});
  }
  if (createdCoreDir) {
    await fs.rmdir(CORE_BRAINS_DIR).catch(() => {});
  }
});

test('GET /api/brains/:name, /js/:name, /ast/:name fall back to PUBLIC_DIR/data/brains when missing in active project', async () => {
  await cleanupTestProjects();
  try {
    await fs.access(CORE_BRAINS_DIR);
  } catch {
    await fs.mkdir(CORE_BRAINS_DIR, { recursive: true });
    createdCoreDir = true;
  }

  await fs.writeFile(path.join(CORE_BRAINS_DIR, `${TEST_BRAIN_NAME}.json`), JSON.stringify({ nodes: [{ id: 'n1' }] }));
  await fs.writeFile(path.join(CORE_BRAINS_DIR, `${TEST_BRAIN_NAME}.js`), 'export function tick() { return 1; }');
  await fs.writeFile(path.join(CORE_BRAINS_DIR, `${TEST_BRAIN_NAME}.ast.json`), JSON.stringify({ root: { type: 'seq' } }));

  const projectName = await createTestProject('brains_fallback');
  await activateTestProject('brains_fallback');

  const app = createApp(brainsRouter, '/api/brains');

  const listRes = await request(app, 'GET', '/api/brains/list');
  assert.equal(listRes.status, 200);
  assert.ok(listRes.data.includes(TEST_BRAIN_NAME));

  const jsonRes = await request(app, 'GET', `/api/brains/${TEST_BRAIN_NAME}`);
  assert.equal(jsonRes.status, 200);
  assert.equal(JSON.parse(jsonRes.data.json).nodes[0].id, 'n1');

  const jsRes = await request(app, 'GET', `/api/brains/js/${TEST_BRAIN_NAME}`);
  assert.equal(jsRes.status, 200);
  assert.match(jsRes.data, /export function tick/);

  const astRes = await request(app, 'GET', `/api/brains/ast/${TEST_BRAIN_NAME}`);
  assert.equal(astRes.status, 200);
  assert.equal(astRes.data.root.type, 'seq');

  // Project-local file overrides core brain
  const projectBrainsDir = path.join(config.PROJECTS_ROOT, projectName, 'data', 'brains');
  await fs.mkdir(projectBrainsDir, { recursive: true });
  await fs.writeFile(path.join(projectBrainsDir, `${TEST_BRAIN_NAME}.json`), JSON.stringify({ nodes: [{ id: 'override' }] }));

  const overrideRes = await request(app, 'GET', `/api/brains/${TEST_BRAIN_NAME}`);
  assert.equal(overrideRes.status, 200);
  assert.equal(JSON.parse(overrideRes.data.json).nodes[0].id, 'override');
});
