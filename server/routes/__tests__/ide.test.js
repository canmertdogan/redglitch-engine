const test = require('node:test');
const assert = require('node:assert/strict');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const ideRouter = require('../ide');
const {
  createTestProject, activateTestProject, resetActiveProject, cleanupTestProjects,
} = require('../../__tests__/helpers/setup');

test.beforeEach(resetActiveProject);
test.after(cleanupTestProjects);

test('POST /api/ide/write to a protected path is rejected with no automation header', async () => {
  await cleanupTestProjects();
  await createTestProject('ide_protected');
  activateTestProject('ide_protected');
  const app = createApp(ideRouter);

  const res = await request(app, 'POST', '/api/write', {
    file: 'server.js',
    content: 'console.log("pwned")',
  });
  assert.strictEqual(res.status, 403, 'protected path must be rejected regardless of header');
});

test('POST /api/ide/write to a protected engine path is rejected with no automation header', async () => {
  await cleanupTestProjects();
  await createTestProject('ide_protected_engine');
  activateTestProject('ide_protected_engine');
  const app = createApp(ideRouter);

  const res = await request(app, 'POST', '/api/write', {
    file: 'engine/ai/permission-gate.js',
    content: '// hostile',
  });
  assert.strictEqual(res.status, 403, 'protected engine path must be rejected regardless of header');
});

test('POST /api/ide/delete of a protected path is rejected with no automation header', async () => {
  await cleanupTestProjects();
  await createTestProject('ide_protected_delete');
  activateTestProject('ide_protected_delete');
  const app = createApp(ideRouter);

  const res = await request(app, 'POST', '/api/delete', { file: 'package.json' });
  assert.strictEqual(res.status, 403, 'protected path delete must be rejected regardless of header');
});
