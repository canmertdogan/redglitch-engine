const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const cutscenesRouter = require('../cutscenes');
const config = require('../../config');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  createTestProject, activateTestProject, resetActiveProject, cleanupTestProjects,
} = require('../../__tests__/helpers/setup');

test.beforeEach(resetActiveProject);
test.after(cleanupTestProjects);

test('GET /api/dialogues falls back to PUBLIC_DIR/dunyalar/definitions/dialogues.json when missing in active project', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('dialogues_fallback');
  await activateTestProject('dialogues_fallback');

  const app = createApp(cutscenesRouter, '/api');

  const fallbackRes = await request(app, 'GET', '/api/dialogues');
  assert.equal(fallbackRes.status, 200);
  assert.ok(Array.isArray(fallbackRes.data.conversations));
  assert.ok(fallbackRes.data.conversations.length > 0, 'Expected base engine conversations from fallback');

  // Project-specific dialogues.json takes precedence when present
  const projectDefDir = path.join(config.PROJECTS_ROOT, projectName, 'dunyalar', 'definitions');
  await fs.mkdir(projectDefDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDefDir, 'dialogues.json'),
    JSON.stringify({ characters: [], conversations: [{ id: 'project_only', nodes: [] }] }),
  );

  const overrideRes = await request(app, 'GET', '/api/dialogues');
  assert.equal(overrideRes.status, 200);
  assert.equal(overrideRes.data.conversations.length, 1);
  assert.equal(overrideRes.data.conversations[0].id, 'project_only');
});
