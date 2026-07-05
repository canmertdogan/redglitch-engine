const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const campaignsRouter = require('../campaigns');
const config = require('../../config');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  testProjectName, createTestProject, activateTestProject, resetActiveProject,
  cleanupTestProjects,
} = require('../../__tests__/helpers/setup');
const projectService = require('../../services/projectService');

test.beforeEach(resetActiveProject);
test.after(cleanupTestProjects);

test('POST /api/campaign — saves campaign flow definition', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('camp_flow');
  activateTestProject('camp_flow');
  const app = createApp(campaignsRouter);

  const flow = { nodes: [{ id: 'start', type: 'dialogue', text: 'Hello' }] };
  const res = await request(app, 'POST', '/api/campaign', flow);
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  const defDir = path.join(projectService.getActiveProject(), 'dunyalar', 'definitions');
  const saved = JSON.parse(await fs.readFile(path.join(defDir, 'campaign.json'), 'utf8'));
  assert.equal(saved.nodes[0].id, 'start');
});

test('GET /api/campaigns — returns campaign list', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('camp_list');
  activateTestProject('camp_list');

  const campaignsDir = path.join(projectService.getActiveProject(), 'campaigns');
  await fs.mkdir(campaignsDir, { recursive: true });
  await fs.writeFile(path.join(campaignsDir, 'test_campaign.json'), JSON.stringify({
    name: 'Test Campaign', description: 'A test', author: 'tester', version: '1.0.0', nodes: [],
  }));

  const app = createApp(campaignsRouter);
  const res = await request(app, 'GET', '/api/campaigns');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data));

  const found = res.data.find(c => c.name === 'Test Campaign');
  assert.ok(found, 'Expected Test Campaign in list');
  assert.equal(found.author, 'tester');
});

test('POST /api/campaigns/:name — saves a campaign', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('camp_save');
  activateTestProject('camp_save');
  const app = createApp(campaignsRouter);

  const campaign = {
    name: 'My Campaign',
    description: 'Campaign description',
    nodes: [{ id: 'n1', type: 'level', levelId: 'level_1' }],
  };

  const res = await request(app, 'POST', '/api/campaigns/my_campaign', campaign);
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  const saved = JSON.parse(await fs.readFile(
    path.join(projectService.getActiveProject(), 'campaigns', 'my_campaign.json'), 'utf8',
  ));
  assert.equal(saved.name, 'My Campaign');
});

test('DELETE /api/campaigns/:name — deletes a campaign', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('camp_del');
  activateTestProject('camp_del');

  const campaignsDir = path.join(projectService.getActiveProject(), 'campaigns');
  await fs.mkdir(campaignsDir, { recursive: true });
  await fs.writeFile(path.join(campaignsDir, 'delete_me.json'), '{}');

  const app = createApp(campaignsRouter);
  const res = await request(app, 'DELETE', '/api/campaigns/delete_me');
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  const exists = await fs.access(path.join(campaignsDir, 'delete_me.json')).then(() => true).catch(() => false);
  assert.equal(exists, false);
});

test('POST /api/campaign-state/:username — saves campaign state', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('camp_state');
  activateTestProject('camp_state');
  const app = createApp(campaignsRouter);

  const state = { currentNode: 'n1', completed: ['intro'], inventory: ['key'] };
  const res = await request(app, 'POST', '/api/campaign-state/testuser', state);
  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);

  const saved = JSON.parse(await fs.readFile(
    path.join(projectService.getActiveProject(), 'data', 'saves', 'campaign_testuser.json'), 'utf8',
  ));
  assert.deepEqual(saved.completed, ['intro']);
});

test('GET /api/campaign-state/:username — retrieves campaign state (stock)', async () => {
  // This test reads from data/campaigns/ (stock path) when active project is root
  const stockDir = path.join(config.ROOT_DIR, 'data', 'campaigns');
  await fs.mkdir(stockDir, { recursive: true });
  await fs.writeFile(path.join(stockDir, 'stock_test.json'), JSON.stringify({
    name: 'Stock Campaign', nodes: [{ id: 'n1' }],
  }));

  const app = createApp(campaignsRouter);
  const res = await request(app, 'GET', '/api/campaigns/stock_test');
  assert.equal(res.status, 200);
  assert.equal(res.data.name, 'Stock Campaign');

  await fs.unlink(path.join(stockDir, 'stock_test.json')).catch(() => {});
});
