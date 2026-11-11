// server/utils/logicCompiler.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { compileLogicGraph } = require('./logicCompiler');

test('compiles evt_start chain', () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'a', type: 'evt_start', data: {} },
      { id: 'b', type: 'eng_log', data: { msg: 'hi' } },
    ],
    wires: [{ fromNode: 'a', fromPort: 'out', toNode: 'b', toPort: 'in' }],
    vars: [{ name: 'hp', value: 10 }],
  });
  assert.equal(ast.events.evt_start.length, 2);
  assert.equal(ast.events.evt_start[1].type, 'eng_log');
  assert.deepEqual(ast.vars, [{ name: 'hp', value: 10 }]);
});

test('empty graph compiles to empty events', () => {
  assert.deepEqual(compileLogicGraph({ nodes: [], wires: [], vars: [] }), { events: {}, vars: [] });
});

test('accepts Brain Architect wires ({from,port,to})', () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'a', type: 'evt_start', data: {} },
      { id: 'b', type: 'eng_log', data: { msg: 'hi' } },
    ],
    wires: [{ from: 'a', port: 'out', to: 'b' }],
    variables: { hp: 10 },
  });
  assert.equal(ast.events.evt_start.length, 2);
  assert.equal(ast.events.evt_start[1].type, 'eng_log');
  assert.deepEqual(ast.vars, [{ name: 'hp', value: 10 }]);
});

test('accepts AlgorithmRuntime variables array', () => {
  const ast = compileLogicGraph({
    nodes: [{ id: 'a', type: 'evt_tick', data: {} }],
    wires: [],
    variables: [{ name: 'speed', value: 4 }],
  });
  assert.deepEqual(ast.events.evt_tick, [{ id: 'a', type: 'evt_tick', data: {} }]);
  assert.deepEqual(ast.vars, [{ name: 'speed', value: 4 }]);
});
