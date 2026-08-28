const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global.window || {};
require('./LogicInterpreter.js');
const LogicInterpreter = global.window.LogicInterpreter;

function makeInterp() {
    return new LogicInterpreter({ logicFlags: {} });
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} hung`)), ms)),
    ]);
}

test('flow_while with a constant-true condition terminates (no hang)', async () => {
    const interp = makeInterp();
    const entity = { logicMemory: {} };
    const ast = {
        events: {
            tick: [
                { type: 'flow_while', data: { condition: true }, body: [{ type: 'eng_log', data: {} }], next: [] },
            ],
        },
    };
    await withTimeout(interp.runEvent(ast, entity, 'tick'), 3000, 'flow_while');
    assert.ok(true);
});

test('flow_for with a huge count terminates (no hang)', async () => {
    const interp = makeInterp();
    const entity = { logicMemory: {} };
    const ast = {
        events: {
            tick: [
                { type: 'flow_for', data: { count: 1e9 }, body: [{ type: 'eng_log', data: {} }], next: [] },
            ],
        },
    };
    await withTimeout(interp.runEvent(ast, entity, 'tick'), 3000, 'flow_for');
    assert.ok(true);
});

test('flow_while caps iterations at MAX_LOOP_ITER', async () => {
    const interp = makeInterp();
    const entity = { logicMemory: { x: 0 } };
    const ast = {
        events: {
            tick: [
                {
                    type: 'flow_while',
                    data: { condition: true },
                    body: [
                        {
                            type: 'var_set',
                            data: { name: 'x' },
                            _inputs: {
                                val: {
                                    type: 'node',
                                    node: {
                                        type: 'math_add',
                                        data: {},
                                        _inputs: {
                                            a: { type: 'node', node: { type: 'var_get', data: { name: 'x' } } },
                                            b: { type: 'literal', value: 1 },
                                        },
                                    },
                                },
                            },
                        },
                    ],
                    next: [],
                },
            ],
        },
    };
    await withTimeout(interp.runEvent(ast, entity, 'tick'), 3000, 'flow_while');
    assert.strictEqual(entity.logicMemory.x, 100000, 'should cap at MAX_LOOP_ITER = 100000');
});
