import test from 'node:test';
import assert from 'node:assert/strict';
import { editorFileForTarget, editorTargetIds, normalizeEditorTarget, studioToolIdForTarget } from './tool-aliases.mjs';
import { editorForTool } from './editor-catalog.mjs';

test('normalizeEditorTarget maps common editor aliases to canonical ids', () => {
    assert.equal(normalizeEditorTarget('asset-manager'), 'asset_manager');
    assert.equal(normalizeEditorTarget('achievement'), 'achievements');
    assert.equal(normalizeEditorTarget('algorithm_studio'), 'algorithm');
    assert.equal(normalizeEditorTarget('iso-pixel'), 'iso_studio');
    assert.equal(normalizeEditorTarget('platform'), 'platformer_studio');
    assert.equal(normalizeEditorTarget('world'), 'editor');
    assert.equal(normalizeEditorTarget('quests'), 'quest');
    assert.equal(normalizeEditorTarget('fxpro'), 'fx');
    assert.equal(normalizeEditorTarget('loc'), 'localization');
    assert.equal(normalizeEditorTarget('interactive_cutscene'), 'cutscene');
    assert.equal(normalizeEditorTarget('3d'), 'studio_3d');
    assert.equal(normalizeEditorTarget('audio'), 'daw');
    assert.equal(normalizeEditorTarget('ui'), 'ui_designer');
});

test('studioToolIdForTarget maps canonical targets to Studio.js tool ids', () => {
    assert.equal(studioToolIdForTarget('asset_manager'), 'assets');
    assert.equal(studioToolIdForTarget('quest'), 'quests');
    assert.equal(studioToolIdForTarget('cutscene'), 'interactive_cutscene');
    assert.equal(studioToolIdForTarget('fx'), 'fxpro');
    assert.equal(studioToolIdForTarget('localization'), 'loc');
    assert.equal(studioToolIdForTarget('logic'), 'algorithm');
    assert.equal(studioToolIdForTarget('daw'), 'daw');
    assert.equal(studioToolIdForTarget('studio_3d'), 'studio_3d');
    assert.equal(studioToolIdForTarget('ui_designer'), 'ui_designer');
});

test('editorFileForTarget resolves canonical ids and aliases', () => {
    assert.equal(editorFileForTarget('achievement'), 'achievements_editor.html');
    assert.equal(editorFileForTarget('asset-manager'), 'asset_manager.html');
    assert.equal(editorFileForTarget('algorithm_studio'), 'algorithm_editor.html');
    assert.equal(editorFileForTarget('isometric'), 'iso_editor.html');
    assert.equal(editorFileForTarget('platformer'), 'platformer_editor.html');
    assert.equal(editorFileForTarget('daw'), 'daw.html');
    assert.equal(editorFileForTarget('studio_3d'), 'editor3d.html');
    assert.equal(editorFileForTarget('ui_designer'), 'studio-dist/ui_designer.html');
});

test('editorTargetIds exposes canonical navigation targets', () => {
    const targets = editorTargetIds();
    assert.ok(targets.includes('asset_manager'));
    assert.ok(targets.includes('achievements'));
    assert.ok(targets.includes('algorithm'));
    assert.ok(targets.includes('daw'));
    assert.ok(targets.includes('studio_3d'));
    assert.ok(targets.includes('ui_designer'));
    assert.equal(targets.includes('asset-manager'), false);
});

test('editorForTool resolves Studio editor catalog including aliases', () => {
    assert.equal(editorForTool('asset.generate').id, 'asset_manager');
    assert.equal(editorForTool('worldbuilder.spawn').id, 'editor');
    assert.equal(editorForTool('3d.spawn').id, 'studio_3d');
    assert.equal(editorForTool('daw.play').id, 'daw');
    assert.equal(editorForTool('unknown.action'), null);
});

