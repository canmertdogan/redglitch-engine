const test = require('node:test');
const assert = require('node:assert/strict');
const gitRouter = require('../git');
const gitService = require('../../services/gitService');
const { request, createApp } = require('../../__tests__/helpers/route-test');

test('POST /api/git/add and /commit return non-200 HTTP errors when gitService returns success: false', async () => {
  const origAdd = gitService.add;
  const origCommit = gitService.commit;

  try {
    const app = createApp(gitRouter, '/api/git');

    gitService.add = async () => ({ success: false, error: 'Invalid file path' });
    const badAdd = await request(app, 'POST', '/api/git/add', { file: 'foo.txt' });
    assert.equal(badAdd.status, 400);
    assert.equal(badAdd.data.success, false);

    gitService.add = async () => ({ success: false, error: 'fatal: pathspec did not match any files' });
    const execFailAdd = await request(app, 'POST', '/api/git/add', { file: 'missing.txt' });
    assert.equal(execFailAdd.status, 500);
    assert.equal(execFailAdd.data.success, false);

    gitService.add = async () => ({ success: true });
    const okAdd = await request(app, 'POST', '/api/git/add', { file: 'ok.txt' });
    assert.equal(okAdd.status, 200);
    assert.equal(okAdd.data.success, true);

    gitService.commit = async () => ({ success: false, error: 'nothing to commit, working tree clean' });
    const failCommit = await request(app, 'POST', '/api/git/commit', { message: 'test commit' });
    assert.equal(failCommit.status, 500);
    assert.equal(failCommit.data.success, false);

    gitService.commit = async () => ({ success: true, output: '[main abc123] test commit' });
    const okCommit = await request(app, 'POST', '/api/git/commit', { message: 'test commit' });
    assert.equal(okCommit.status, 200);
    assert.equal(okCommit.data.success, true);
  } finally {
    gitService.add = origAdd;
    gitService.commit = origCommit;
  }
});
