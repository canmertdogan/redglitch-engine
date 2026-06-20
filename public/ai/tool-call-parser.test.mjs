import test from 'node:test';
import assert from 'node:assert/strict';
import { parseToolCalls, stripToolBlocks } from './tool-call-parser.mjs';

test('parses multiple adjacent JSON calls from one compact fence', () => {
    const text = 'Planning ```tool {"name":"project.updateManifesto","args":{"newManifesto":"A game"}} {"name":"navigateTo","args":{"target":"editor"}} ``` done';
    const calls = parseToolCalls(text);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].name, 'project.updateManifesto');
    assert.equal(calls[1].args.target, 'editor');
});

test('parses arrays and calls envelopes', () => {
    assert.equal(parseToolCalls('```tool\n[{"name":"fs.list","args":{}},{"name":"git.status"}]\n```').length, 2);
    assert.equal(parseToolCalls('```tool {"calls":[{"name":"project.getInfo"}]} ```').length, 1);
});

test('ignores malformed calls and strips tool blocks from user-facing text', () => {
    assert.deepEqual(parseToolCalls('```tool {bad} ```'), []);
    assert.equal(stripToolBlocks('Before ```tool {"name":"x"} ``` After'), 'Before  After');
});
