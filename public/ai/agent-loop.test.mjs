import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentLoop } from './agent-loop.mjs';
import { parseToolCalls, stripToolBlocks } from './tool-call-parser.mjs';

test('returns tool results to inference and continues until a final response', async () => {
    const feedback = [];
    const executed = [];
    const result = await runAgentLoop({
        initialResponse: { text: 'Start ```tool {"name":"navigateTo","args":{"target":"editor"}} ```', source: 'fixture' },
        parseToolCalls,
        stripToolBlocks,
        executeWorkflow: async (calls) => {
            executed.push(...calls);
            return { success: true, results: [{ opened: 'editor' }] };
        },
        inferNext: async (turn) => {
            feedback.push(turn.feedback);
            return { text: 'Built the playable level.', source: 'fixture' };
        },
        getToolPrompt: () => '[{"name":"world.generateMap"}]'
    });
    assert.equal(executed.length, 1);
    assert.match(feedback[0], /opened.*editor/);
    assert.match(feedback[0], /world\.generateMap/);
    assert.equal(result.text, 'Built the playable level.');
    assert.equal(result.steps, 2);
});

test('stops immediately on rejected or failed workflow', async () => {
    let inferenceCount = 0;
    const result = await runAgentLoop({
        initialResponse: { text: '```tool {"name":"fs.write","args":{}} ```' },
        parseToolCalls,
        stripToolBlocks,
        executeWorkflow: async () => ({ success: false, error: 'User rejected action' }),
        inferNext: async () => { inferenceCount++; },
        getToolPrompt: () => '[]'
    });
    assert.equal(inferenceCount, 0);
    assert.match(result.text, /User rejected action/);
});
