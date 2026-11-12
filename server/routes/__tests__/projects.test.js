const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const projectsRouter = require('../projects');
const projectService = require('../../services/projectService');
const config = require('../../config');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  testProjectName, isTestProject, createTestProject, projectExists,
  cleanupTestProjects, resetActiveProject, activateTestProject,
} = require('../../__tests__/helpers/setup');

test.beforeEach(resetActiveProject);

test.after(cleanupTestProjects);

test('GET /api/projects — returns empty list when no test projects exist', async () => {
  await cleanupTestProjects();
  const app = createApp(projectsRouter);
  const res = await request(app, 'GET', '/api/projects');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data));
});

test('POST /api/projects — creates a project from template', async () => {
  await cleanupTestProjects();
  const app = createApp(projectsRouter);
  const res = await request(app, 'POST', '/api/projects', {
    name: testProjectName('create_template'),
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);
  assert.ok(await projectExists('create_template'));
});

test('POST /api/projects/create — creates project with engine type', async () => {
  await cleanupTestProjects();
  const app = createApp(projectsRouter);
  const res = await request(app, 'POST', '/api/projects/create', {
    name: testProjectName('create_engine'), engineType: 'fps-3d', author: 'tester',
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  const cfg = path.join(config.PROJECTS_ROOT, testProjectName('create_engine'), 'redglitch.json');
  const saved = JSON.parse(await fs.readFile(cfg, 'utf8'));
  assert.equal(saved.engineType, 'fps-3d');
  assert.equal(saved.metadata.is3D, true);
});

test('POST /api/projects/create — creates unified-3d project with mode', async () => {
  await cleanupTestProjects();
  const app = createApp(projectsRouter);
  const res = await request(app, 'POST', '/api/projects/create', {
    name: testProjectName('create_unified'), engineType: 'unified-3d',
    mode: 'platformer-3d', author: 't',
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  const cfg = path.join(config.PROJECTS_ROOT, testProjectName('create_unified'), 'redglitch.json');
  const saved = JSON.parse(await fs.readFile(cfg, 'utf8'));
  assert.equal(saved.engineType, 'unified-3d');
  assert.equal(saved.mode, 'platformer-3d');
});

test('POST /api/projects — rejects request without name', async () => {
  const app = createApp(projectsRouter);
  const res = await request(app, 'POST', '/api/projects', {});
  assert.equal(res.status, 400);
});

test('POST /api/projects — rejects duplicate project', async () => {
  const projectName = testProjectName('duplicate_test');
  await createTestProject('duplicate_test');
  const app = createApp(projectsRouter);
  const res = await request(app, 'POST', '/api/projects', { name: projectName });
  assert.equal(res.status, 400);
});

test('GET /api/projects — lists created project', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('list_test');
  const app = createApp(projectsRouter);
  const res = await request(app, 'GET', '/api/projects');
  assert.equal(res.status, 200);
  const found = res.data.find(p => p.name === projectName);
  assert.ok(found, `Expected ${projectName} in project list`);
});

test('DELETE /api/projects/:name — deletes a project and resets active project if active', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('delete_test');
  await activateTestProject('delete_test');
  assert.equal(projectService.isRootProject(), false);

  const app = createApp(projectsRouter);
  const res = await request(app, 'DELETE', `/api/projects/${projectName}`);
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);
  assert.equal(await projectExists('delete_test'), false);
  assert.equal(projectService.isRootProject(), true);
});

test('GET /api/projects — populates valid lastModified even when redglitch.json is missing or lacks lastModified', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('last_mod');
  const noCfgName = testProjectName('no_cfg');
  await fs.mkdir(path.join(config.PROJECTS_ROOT, noCfgName), { recursive: true });

  const app = createApp(projectsRouter);
  const res = await request(app, 'GET', '/api/projects');
  assert.equal(res.status, 200);

  for (const name of [projectName, noCfgName]) {
    const found = res.data.find(p => p.name === name);
    assert.ok(found, `Expected ${name} in project list`);
    assert.ok(found.lastModified, `Expected lastModified on ${name}`);
    assert.equal(Number.isNaN(Date.parse(found.lastModified)), false, `Expected valid date on ${name}`);
  }
});

test('GET /api/projects/current — includes author, version, engineType, description from redglitch.json', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('current_meta', { engineType: 'fps-3d' });
  await activateTestProject('current_meta');

  const app = createApp(projectsRouter);
  const res = await request(app, 'GET', '/api/projects/current');
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);
  assert.equal(res.data.name, projectName);
  assert.equal(res.data.isRoot, false);
  assert.equal(res.data.author, 'test');
  assert.equal(res.data.version, '0.1.0');
  assert.equal(res.data.engineType, 'fps-3d');
  assert.equal(res.data.description, 'Test project');
});

test('GET /api/project/:name/state — returns state for project', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('state_read');
  const app = createApp(projectsRouter);
  const res = await request(app, 'GET', `/api/project/${projectName}/state`);
  assert.equal(res.status, 200);
});

test('POST /api/project/:name/state — saves and retrieves project state', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('state_save');
  const app = createApp(projectsRouter);
  const payload = { state: { volume: 0.8 }, metadata: { version: 1 } };

  const saveRes = await request(app, 'POST', `/api/project/${projectName}/state`, payload);
  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.data.success, true);

  const getRes = await request(app, 'GET', `/api/project/${projectName}/state`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.data.state.volume, 0.8);
});

test('GET /api/project-file — reads project file', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('file_read');
  const content = JSON.stringify({ test: true });
  await fs.writeFile(path.join(config.PROJECTS_ROOT, projectName, 'test.json'), content);
  const app = createApp(projectsRouter);
  const res = await request(app, 'GET', `/api/project-file?project=${projectName}&path=test.json`);
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.content, content);
});

test('POST /api/project-file — writes project file', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('file_write');
  const app = createApp(projectsRouter);
  const res = await request(app, 'POST', '/api/project-file', {
    project: projectName, path: 'data/custom.json', content: JSON.stringify({ hello: 'world' }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);

  const saved = await fs.readFile(
    path.join(config.PROJECTS_ROOT, projectName, 'data', 'custom.json'), 'utf8',
  );
  assert.equal(JSON.parse(saved).hello, 'world');
});

test('GET /api/project-file — rejects traversal paths', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('g_traversal');
  const app = createApp(projectsRouter);
  const res = await request(app, 'GET', `/api/project-file?project=${projectName}&path=../../server.js`);
  assert.equal(res.status, 403);
});

test('POST /api/project-file — rejects traversal write', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('pw_traversal');
  const app = createApp(projectsRouter);
  const res = await request(app, 'POST', '/api/project-file', {
    project: projectName, path: '../../config/secret.json', content: 'hacked',
  });
  assert.equal(res.status, 403);
});
