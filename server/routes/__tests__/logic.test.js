const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const logicRouter = require('../logic');
const config = require('../../config');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  createTestProject, activateTestProject, resetActiveProject, cleanupTestProjects,
} = require('../../__tests__/helpers/setup');

test.beforeEach(resetActiveProject);
test.after(cleanupTestProjects);

test('GET /api/logic/list excludes *.ast.json and POST /api/logic/save compiles structured AST', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('logic_list');
  await activateTestProject('logic_list');
  const app = createApp(logicRouter, '/api/logic');

  const graph = {
    nodes: [
      { id: 'e', type: 'evt_start', data: {} },
      { id: 'b', type: 'flow_branch', data: {} },
      { id: 't', type: 'eng_log', data: { msg: 'yes' } },
      { id: 'f', type: 'eng_log', data: { msg: 'no' } },
    ],
    wires: [
      { fromNode: 'e', fromPort: 'out', toNode: 'b', toPort: 'in' },
      { fromNode: 'b', fromPort: 'true', toNode: 't', toPort: 'in' },
      { fromNode: 'b', fromPort: 'false', toNode: 'f', toPort: 'in' },
    ],
    vars: [{ name: 'flag', value: true }],
  };

  const saveRes = await request(app, 'POST', '/api/logic/save', {
    name: 'quest_gate',
    json: JSON.stringify(graph),
  });
  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.data.success, true);
  assert.equal(saveRes.data.compiled, true);
  assert.deepEqual(saveRes.data.events, ['evt_start']);

  // Confirm .ast.json was actually written on disk
  await fs.access(path.join(config.PROJECTS_ROOT, projectName, 'data', 'logic', 'quest_gate.ast.json'));

  const listRes = await request(app, 'GET', '/api/logic/list');
  assert.equal(listRes.status, 200);
  assert.deepEqual(listRes.data, ['quest_gate']);
  assert.equal(listRes.data.includes('quest_gate.ast'), false);

  const astRes = await request(app, 'GET', '/api/logic/ast/quest_gate');
  assert.equal(astRes.status, 200);
  assert.equal(astRes.data.events.evt_start[0].type, 'flow_branch');
  assert.equal(astRes.data.events.evt_start[0].true[0].id, 't');
  assert.equal(astRes.data.events.evt_start[0].false[0].id, 'f');
});
