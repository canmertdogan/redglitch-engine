const test = require('node:test');
const assert = require('node:assert/strict');
const { canAutomateMutation } = require('./automationPolicy');

test('blocks protected automation targets', () => {
    assert.equal(canAutomateMutation('server.js').allowed, false);
    assert.equal(canAutomateMutation('server/routes/ide.js').allowed, false);
    assert.equal(canAutomateMutation('public/engines/foo/main.js').allowed, false);
});

test('blocks protected targets after traversal and separator normalization', () => {
    assert.equal(canAutomateMutation('projects/demo/../../server/routes/ide.js').allowed, false);
    assert.equal(canAutomateMutation('projects\\demo\\..\\..\\server\\utils\\safeFs.js').allowed, false);
    assert.equal(canAutomateMutation('/package.json').allowed, false);
});

test('allows project content targets', () => {
    assert.equal(canAutomateMutation('projects/demo/data/npcs.json').allowed, true);
});
