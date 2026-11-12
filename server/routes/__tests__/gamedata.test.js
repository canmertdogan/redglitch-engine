const test = require('node:test');
const assert = require('node:assert/strict');
const gamedataRouter = require('../gamedata');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  createTestProject, activateTestProject, resetActiveProject, cleanupTestProjects,
} = require('../../__tests__/helpers/setup');

test.beforeEach(resetActiveProject);
test.after(cleanupTestProjects);

test('POST singular definition aliases save data readable from plural endpoints', async () => {
  await cleanupTestProjects();
  await createTestProject('gamedata_aliases');
  activateTestProject('gamedata_aliases');
  const app = createApp(gamedataRouter);

  const cases = [
    {
      savePath: '/api/npc-defs',
      readPath: '/api/npcs',
      payload: [{ id: 'npc_alias_guard', name: 'Alias NPC' }],
      id: 'npc_alias_guard',
    },
    {
      savePath: '/api/item-defs',
      readPath: '/api/items',
      payload: [{ id: 'item_alias_guard', name: 'Alias Item' }],
      id: 'item_alias_guard',
    },
    {
      savePath: '/api/skill-defs',
      readPath: '/api/skills',
      payload: [{ id: 'skill_alias_guard', name: 'Alias Skill' }],
      id: 'skill_alias_guard',
    },
  ];

  for (const entry of cases) {
    const saveRes = await request(app, 'POST', entry.savePath, entry.payload);
    assert.equal(saveRes.status, 200, `${entry.savePath} should save`);
    assert.equal(saveRes.data.success, true);

    const readRes = await request(app, 'GET', entry.readPath);
    assert.equal(readRes.status, 200, `${entry.readPath} should read`);
    assert.ok(Array.isArray(readRes.data));
    assert.ok(
      readRes.data.some(item => item.id === entry.id),
      `${entry.readPath} should include ${entry.id}`,
    );
  }
});

test('DELETE /api/fx/:name deletes an FX config and rejects invalid names', async () => {
  await cleanupTestProjects();
  await createTestProject('gamedata_fx_del');
  activateTestProject('gamedata_fx_del');
  const app = createApp(gamedataRouter);

  const saveRes = await request(app, 'POST', '/api/fx/save', {
    name: 'spark_burst',
    config: { id: 'spark_burst', name: 'spark_burst', count: 20 },
  });
  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.data.success, true);

  const badRes = await request(app, 'DELETE', '/api/fx/bad%2Fname');
  assert.equal(badRes.status, 400);

  const delRes = await request(app, 'DELETE', '/api/fx/spark_burst');
  assert.equal(delRes.status, 200);
  assert.equal(delRes.data.success, true);

  const missingRes = await request(app, 'DELETE', '/api/fx/spark_burst');
  assert.equal(missingRes.status, 404);
});

test('GET /api/variables preserves string arrays and object maps across project merge', async () => {
  await cleanupTestProjects();
  await createTestProject('gamedata_vars');
  activateTestProject('gamedata_vars');
  const app = createApp(gamedataRouter);

  const arrSave = await request(app, 'POST', '/api/variables', ['has_key', 'boss_defeated']);
  assert.equal(arrSave.status, 200);
  const arrRead = await request(app, 'GET', '/api/variables');
  assert.equal(arrRead.status, 200);
  assert.deepEqual(arrRead.data, ['has_key', 'boss_defeated']);

  const objSave = await request(app, 'POST', '/api/variables', { difficulty: 'hard', score: 42 });
  assert.equal(objSave.status, 200);
  const objRead = await request(app, 'GET', '/api/variables');
  assert.equal(objRead.status, 200);
  assert.deepEqual(objRead.data, { difficulty: 'hard', score: 42 });
});
