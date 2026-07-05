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
