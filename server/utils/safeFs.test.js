const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeWriteFullPath } = require('../utils/safeFs');

test('safeWriteFullPath writes data and keeps a .bak of previous content', async () => {
    // Realpath the temp root so it matches the realpath resolution inside
    // safeFs (macOS mounts /tmp via a symlink to /private/tmp).
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'safefs-')));
    const target = path.join(root, 'sub', 'save.json');

    // First write: no prior file, so no .bak is expected.
    await safeWriteFullPath(root, target, 'v1');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'v1');
    assert.ok(!fs.existsSync(target + '.bak'), 'no .bak before first overwrite');

    // Overwrite — target updates, .bak keeps the prior version (v1).
    await safeWriteFullPath(root, target, 'v2');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'v2');
    assert.ok(fs.existsSync(target + '.bak'), '.bak exists after overwrite');
    assert.strictEqual(fs.readFileSync(target + '.bak', 'utf8'), 'v1', 'bak holds previous content');

    // A crash/interrupted write must not leave a half-written target or temp file.
    const tmpExists = fs.readdirSync(path.dirname(target)).some(f => f.startsWith(path.basename(target) + '.tmp.'));
    assert.ok(!tmpExists, 'no leftover temp file');
});

test('safeWriteFullPath rejects paths outside the allowed root', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'safefs2-')));
    await assert.rejects(() => safeWriteFullPath(root, '/etc/passwd', 'x'));
});
