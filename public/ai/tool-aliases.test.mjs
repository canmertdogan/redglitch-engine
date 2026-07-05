import test from 'node:test';
import assert from 'node:assert/strict';
import { editorFileForTarget, editorTargetIds, normalizeEditorTarget } from './tool-aliases.mjs';

test('normalizeEditorTarget maps common editor aliases to canonical ids', () => {
    assert.equal(normalizeEditorTarget('asset-manager'), 'asset_manager');
    assert.equal(normalizeEditorTarget('achievement'), 'achievements');
    assert.equal(normalizeEditorTarget('algorithm_studio'), 'algorithm');
    assert.equal(normalizeEditorTarget('iso-pixel'), 'iso_studio');
    assert.equal(normalizeEditorTarget('platform'), 'platformer_studio');
    assert.equal(normalizeEditorTarget('world'), 'editor');
});

test('editorFileForTarget resolves canonical ids and aliases', () => {
    assert.equal(editorFileForTarget('achievement'), 'achievements_editor.html');
    assert.equal(editorFileForTarget('asset-manager'), 'asset_manager.html');
    assert.equal(editorFileForTarget('algorithm_studio'), 'algorithm_editor.html');
    assert.equal(editorFileForTarget('isometric'), 'iso_editor.html');
    assert.equal(editorFileForTarget('platformer'), 'platformer_editor.html');
});

test('editorTargetIds exposes canonical navigation targets', () => {
    const targets = editorTargetIds();
    assert.ok(targets.includes('asset_manager'));
    assert.ok(targets.includes('achievements'));
    assert.ok(targets.includes('algorithm'));
    assert.equal(targets.includes('asset-manager'), false);
});

