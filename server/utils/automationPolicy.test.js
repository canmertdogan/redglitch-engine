const test = require('node:test');
const assert = require('node:assert/strict');
const { canAutomateMutation, normalizeAutomationPath } = require('./automationPolicy');

test('normalizes separators and traversal before policy checks', () => {
    assert.equal(normalizeAutomationPath('projects/demo/../../server/routes/ide.js'), 'server/routes/ide.js');
});

test('blocks protected automation targets', () => {
    assert.equal(canAutomateMutation('server.js').allowed, false);
    assert.equal(canAutomateMutation('server/routes/ide.js').allowed, false);
    assert.equal(canAutomateMutation('public/engines/foo/main.js').allowed, false);
});

test('allows project content targets', () => {
    assert.equal(canAutomateMutation('projects/demo/data/npcs.json').allowed, true);
});
