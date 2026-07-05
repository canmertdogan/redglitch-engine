import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorTools } from './editor-tools.js';

function installBrowserGlobals() {
    const events = [];
    globalThis.window = {
        location: { href: '' },
        RedGlitchEventBus: {
            emit(type, data) {
                events.push({ type, data });
            },
        },
        RedGlitchProjectState: {
            projectName: 'Studio Project',
            dirty: false,
            setDirty(value) {
                this.dirty = value;
            },
        },
        localStorage: {
            getItem() {
                return null;
            },
        },
    };
    globalThis.document = {
        getElementById() {
            return null;
        },
        querySelector() {
            return null;
        },
    };
    return events;
}

test('openEditor uses the real achievements editor filename', async () => {
    installBrowserGlobals();
    const tools = new EditorTools({ requestPermission: async () => true });

    const result = await tools.openEditor('achievement');

    assert.equal(result.success, true);
    assert.equal(window.location.href, 'achievements_editor.html');
});

test('getCurrentProject reads the RedGlitch project state global', () => {
    installBrowserGlobals();
    const tools = new EditorTools({ requestPermission: async () => true });

    assert.equal(tools.getCurrentProject(), 'Studio Project');
});

test('createAsset emits through RedGlitchEventBus and marks project dirty', async () => {
    const events = installBrowserGlobals();
    const tools = new EditorTools({ requestPermission: async () => true });

    const result = await tools.createAsset('item', { id: 'potion' });

    assert.equal(result.success, true);
    assert.equal(window.RedGlitchProjectState.dirty, true);
    assert.deepEqual(events, [{ type: 'asset:create:item', data: { id: 'potion' } }]);
});

test('saveEditor falls back to the RedGlitchEventBus save event', async () => {
    const events = installBrowserGlobals();
    const tools = new EditorTools({ requestPermission: async () => true });

    const result = await tools.saveEditor();

    assert.equal(result.success, true);
    assert.deepEqual(events, [{ type: 'editor:save', data: undefined }]);
});

