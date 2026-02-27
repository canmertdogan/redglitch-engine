const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveUnderRoot } = require('./pathGuard');

test('resolveUnderRoot rejects absolute paths', () => {
    const root = path.resolve('/tmp/ketebe-root');
    assert.equal(resolveUnderRoot(root, '/etc/passwd'), null);
});

test('resolveUnderRoot rejects traversal paths', () => {
    const root = path.resolve('/tmp/ketebe-root');
    assert.equal(resolveUnderRoot(root, '../escape.txt'), null);
});

test('resolveUnderRoot allows child paths', () => {
    const root = path.resolve('/tmp/ketebe-root');
    const full = resolveUnderRoot(root, 'assets/image.png');
    assert.ok(full, 'expected a resolved path');
    assert.ok(full.startsWith(root + path.sep));
    assert.equal(full, path.resolve(root, 'assets/image.png'));
});
