import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_STATUS, ERROR_CODE, normalizeArguments, normalizeToolDefinition, validateSchema } from './automation-contract.mjs';
import { editorForTool } from './editor-catalog.mjs';
import { getAutomationFlags } from './automation-flags.mjs';

test('normalizes mutation metadata into the KAP contract', () => {
    const tool = normalizeToolDefinition({
        name: 'world.create',
        description: 'Create a world',
        securityLevel: 'low-risk',
        parameters: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } }
    });
    assert.equal(tool.version, '1.0');
    assert.equal(tool.mutates, true);
    assert.equal(tool.previewSupport, true);
});

test('validates required, typed, enum, and nested arguments', () => {
    const schema = {
        type: 'object', required: ['mode', 'nodes'], properties: {
            mode: { type: 'string', enum: ['safe'] },
            nodes: { type: 'array', items: { type: 'object', required: ['x'], properties: { x: { type: 'number' } } } }
        }
    };
    assert.deepEqual(validateSchema(schema, { mode: 'safe', nodes: [{ x: 1 }] }), []);
    assert.ok(validateSchema(schema, { mode: 'unsafe', nodes: [{ x: '1' }] }).length === 2);
});

test('normalizes provider argument aliases before schema validation', () => {
    const args = normalizeArguments({ argumentAliases: { newManifesto: 'content' } }, { newManifesto: 'Build a game' });
    assert.deepEqual(args, { content: 'Build a game' });
});

test('exports stable statuses and errors', () => {
    assert.equal(ACTION_STATUS.AWAITING_APPROVAL, 'awaiting_approval');
    assert.equal(ERROR_CODE.INVALID_ARGUMENTS, 'INVALID_ARGUMENTS');
});

test('routes capabilities through the explicit editor catalog', () => {
    assert.equal(editorForTool('platformer.generateLevel').file, 'platformer_editor.html');
    assert.equal(editorForTool('logic.generate').id, 'algorithm');
    assert.equal(editorForTool('unknown.action'), null);
});

test('allows incremental runtime flags without disabling safety defaults', () => {
    const flags = getAutomationFlags({ getItem: () => '{"correlatedEditorResults":false,"approvalFirstMutations":false}' });
    assert.equal(flags.contractValidation, true);
    assert.equal(flags.approvalFirstMutations, true);
    assert.equal(flags.correlatedEditorResults, true);
});
