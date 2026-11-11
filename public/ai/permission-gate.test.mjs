// public/ai/permission-gate.test.mjs
// Client-side protected-path policy must stay in sync with server/utils/automationPolicy.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionGate } from './permission-gate.js';

const blocked = [
    '/server.js',
    '/electron-main.js',
    '/preload.js',
    '/build-game.js',
    '/build-adapter.js',
    '/server/routes/logic.js',
    '/server/utils/pathGuard.js',
    '/backend/main.py',
    '/scripts/validate-3d-campaign.js',
    '/redglitch.json',
    '/.git/config',
    '/public/ai/permission-gate.js',
    '/public/engines/rpg-topdown/main.js',
    '/public/shared/SharedProjectState.js',
];

const allowed = [
    '/public/engines/rpg-topdown/Core.js',
    '/public/engines/shared/LogicSystem.js',
    '/projects/Default Project/dunyalar/level1.json',
    '/public/data/brains/npc.ast.json',
    '/README.md',
];

test('canModifyFile — blocks every protected system path', () => {
    for (const p of blocked) {
        assert.equal(PermissionGate.canModifyFile(p).allowed, false, `expected blocked: ${p}`);
    }
});

test('canModifyFile — allows normal project/engine data paths', () => {
    for (const p of allowed) {
        assert.equal(PermissionGate.canModifyFile(p).allowed, true, `expected allowed: ${p}`);
    }
});

test('canModifyFile — normalizes traversal before matching', () => {
    assert.equal(PermissionGate.canModifyFile('/server/routes/./ide.js').allowed, false);
    assert.equal(PermissionGate.canModifyFile('/server/routes/utils/../ide.js').allowed, false);
    assert.equal(PermissionGate.canModifyFile('/public\\ai\\..\\..\\server.js').allowed, false);
});
