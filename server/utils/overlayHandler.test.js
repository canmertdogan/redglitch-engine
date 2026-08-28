const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeOverlayHandler } = require('../utils/overlayHandler');

// Mirror the module's notion of the public root so we can assert containment
// against the same directory the handler uses.
const PUBLIC_ROOT = path.resolve(__dirname, '..', 'public');

function makeRes() {
    const calls = { sendFile: [] };
    const res = {
        headersSent: false,
        sendFile(p, cb) {
            calls.sendFile.push(p);
            // Simulate "file not found" so both project + root fall through.
            cb(new Error('ENOENT in test'));
        },
    };
    return { res, calls };
}

test('rejects absolute / traversal paths and never serves outside root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ovr-')); // acts as PROJECTS_ROOT
    const projectDir = path.join(root, 'project');
    fs.mkdirSync(path.join(projectDir, 'dunyalar'), { recursive: true });

    const projectService = { getActiveProject: () => projectDir };
    const overlay = makeOverlayHandler(projectService);
    const handler = overlay('dunyalar', 'dunyalar', false);

    for (const reqPath of ['/../../etc/passwd', '/dunyalar/../../etc/passwd', '/abs', '/..\\..\\windows\\system32']) {
        const req = { path: reqPath };
        const { res, calls } = makeRes();
        let nextCalled = false;
        handler(req, res, () => { nextCalled = true; });
        assert.ok(nextCalled, `traversal path ${reqPath} should fall through to next()`);
        for (const p of calls.sendFile) {
            const resolved = path.resolve(p);
            assert.ok(
                resolved.startsWith(PUBLIC_ROOT) || resolved.startsWith(path.resolve(projectDir)),
                `must not serve outside allowed roots: ${p}`
            );
            assert.ok(!resolved.startsWith('/etc'), `must not serve /etc: ${p}`);
        }
    }
});

test('serves a contained project file first', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ovr2-'));
    const projectDir = path.join(root, 'project');
    fs.mkdirSync(path.join(PUBLIC_ROOT, 'dunyalar'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'dunyalar'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'dunyalar', 'p.txt'), 'proj');

    const projectService = { getActiveProject: () => projectDir };
    const overlay = makeOverlayHandler(projectService);
    const handler = overlay('dunyalar', 'dunyalar', false);

    const req = { path: '/p.txt' };
    const { res, calls } = makeRes();
    let nextCalled = false;
    handler(req, res, () => { nextCalled = true; });

    assert.ok(calls.sendFile.length >= 1, 'should attempt to send a file');
    assert.ok(calls.sendFile[0].endsWith(path.join('dunyalar', 'p.txt')), 'project-first ordering');
});
