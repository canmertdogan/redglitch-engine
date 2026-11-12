// server/utils/logicCompiler.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { compileLogicGraph, normalizeWire } = require('./logicCompiler');

global.window = global.window || {};
require('../../public/shared/LogicInterpreter.js');
const LogicInterpreter = global.window.LogicInterpreter;

test('empty graph compiles to empty events and vars', () => {
  assert.deepEqual(compileLogicGraph({ nodes: [], wires: [], vars: [] }), { events: {}, vars: [] });
  assert.deepEqual(compileLogicGraph(null), { events: {}, vars: [] });
});

test('compiles evt_start linear chain via .next', () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'a', type: 'evt_start', data: {} },
      { id: 'b', type: 'eng_log', data: { msg: 'step1' } },
      { id: 'c', type: 'eng_log', data: { msg: 'step2' } },
    ],
    wires: [
      { fromNode: 'a', fromPort: 'out', toNode: 'b', toPort: 'in' },
      { fromNode: 'b', fromPort: 'out', toNode: 'c', toPort: 'in' },
    ],
    vars: [{ name: 'hp', value: 10 }],
  });

  assert.equal(ast.events.evt_start.length, 1);
  assert.equal(ast.events.evt_start[0].id, 'b');
  assert.equal(ast.events.evt_start[0].type, 'eng_log');
  assert.equal(ast.events.evt_start[0].next.length, 1);
  assert.equal(ast.events.evt_start[0].next[0].id, 'c');
  assert.equal(ast.events.evt_start[0].next[0].next, null);
  assert.deepEqual(ast.vars, [{ name: 'hp', value: 10 }]);
});

test('accepts Brain Architect wires ({from,port,to}) and variables object', () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'a', type: 'evt_start', data: {} },
      { id: 'b', type: 'eng_log', data: { msg: 'hi' } },
    ],
    wires: [{ from: 'a', port: 'out', to: 'b' }],
    variables: { hp: 10 },
  });
  assert.equal(ast.events.evt_start.length, 1);
  assert.equal(ast.events.evt_start[0].type, 'eng_log');
  assert.deepEqual(ast.vars, [{ name: 'hp', value: 10 }]);
  assert.deepEqual(normalizeWire({ from: 'x', port: 'true', to: 'y' }), {
    fromNode: 'x',
    toNode: 'y',
    fromPort: 'true',
    toPort: 'in',
  });
});

test('accepts AlgorithmRuntime variables array and unwired event node', () => {
  const ast = compileLogicGraph({
    nodes: [{ id: 'a', type: 'evt_tick', data: {} }],
    wires: [],
    variables: [{ name: 'speed', value: 4 }],
  });
  assert.ok('evt_tick' in ast.events);
  assert.equal(ast.events.evt_tick, null);
  assert.deepEqual(ast.vars, [{ name: 'speed', value: 4 }]);
});

test('keys evt_input by key name when data.key is present', () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'k1', type: 'evt_input', data: { key: 'Space' } },
      { id: 'k2', type: 'evt_input', data: {} },
      { id: 'l1', type: 'eng_log', data: { msg: 'jump' } },
      { id: 'l2', type: 'eng_log', data: { msg: 'any' } },
    ],
    wires: [
      { fromNode: 'k1', fromPort: 'out', toNode: 'l1', toPort: 'in' },
      { fromNode: 'k2', fromPort: 'out', toNode: 'l2', toPort: 'in' },
    ],
  });
  assert.equal(ast.events.evt_input_Space[0].id, 'l1');
  assert.equal(ast.events.evt_input[0].id, 'l2');
});

test('compiles flow_branch with .true, .false, and wired _inputs', () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'e', type: 'evt_start', data: {} },
      { id: 'v', type: 'var_get', data: { name: 'hp' } },
      { id: 'c', type: 'logic_gt', data: { b: 50 } },
      { id: 'br', type: 'flow_branch', data: {} },
      { id: 't', type: 'var_set', data: { name: 'ok', val: true } },
      { id: 'f', type: 'var_set', data: { name: 'ok', val: false } },
    ],
    wires: [
      { fromNode: 'e', fromPort: 'out', toNode: 'br', toPort: 'in' },
      { fromNode: 'v', fromPort: 'val', toNode: 'c', toPort: 'a' },
      { fromNode: 'c', fromPort: 'res', toNode: 'br', toPort: 'cond' },
      { fromNode: 'br', fromPort: 'true', toNode: 't', toPort: 'in' },
      { fromNode: 'br', fromPort: 'false', toNode: 'f', toPort: 'in' },
    ],
  });

  const branch = ast.events.evt_start[0];
  assert.equal(branch.type, 'flow_branch');
  assert.equal(branch.true[0].id, 't');
  assert.equal(branch.false[0].id, 'f');
  assert.equal(branch._inputs.cond.type, 'node');
  assert.equal(branch._inputs.cond.node.type, 'logic_gt');
  assert.equal(branch._inputs.cond.node._inputs.a.type, 'node');
  assert.equal(branch._inputs.cond.node._inputs.a.node.type, 'var_get');
  assert.equal(branch._inputs.cond.node._inputs.a.node.data.name, 'hp');
});

test('compiles flow_for, flow_for_loop, flow_while, and flow_foreach with .body and .next', () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'e1', type: 'evt_start', data: {} },
      { id: 'f1', type: 'flow_for', data: { count: 3 } },
      { id: 'b1', type: 'eng_log', data: { msg: 'legacy-loop' } },
      { id: 'f2', type: 'flow_for_loop', data: { count: 2 } },
      { id: 'b2', type: 'eng_log', data: { msg: 'for-loop' } },
      { id: 'w1', type: 'flow_while', data: { condition: false } },
      { id: 'b3', type: 'eng_log', data: { msg: 'while' } },
      { id: 'fe', type: 'flow_foreach', data: { array: [1, 2] } },
      { id: 'b4', type: 'eng_log', data: { msg: 'each' } },
      { id: 'done', type: 'eng_log', data: { msg: 'done' } },
    ],
    wires: [
      { fromNode: 'e1', fromPort: 'out', toNode: 'f1', toPort: 'in' },
      { fromNode: 'f1', fromPort: 'loop', toNode: 'b1', toPort: 'in' },
      { fromNode: 'f1', fromPort: 'out', toNode: 'f2', toPort: 'in' },
      { fromNode: 'f2', fromPort: 'body', toNode: 'b2', toPort: 'in' },
      { fromNode: 'f2', fromPort: 'out', toNode: 'w1', toPort: 'in' },
      { fromNode: 'w1', fromPort: 'body', toNode: 'b3', toPort: 'in' },
      { fromNode: 'w1', fromPort: 'out', toNode: 'fe', toPort: 'in' },
      { fromNode: 'fe', fromPort: 'body', toNode: 'b4', toPort: 'in' },
      { fromNode: 'fe', fromPort: 'out', toNode: 'done', toPort: 'in' },
    ],
  });

  const f1 = ast.events.evt_start[0];
  assert.equal(f1.type, 'flow_for');
  assert.equal(f1.body[0].id, 'b1');

  const f2 = f1.next[0];
  assert.equal(f2.type, 'flow_for_loop');
  assert.equal(f2.body[0].id, 'b2');

  const w1 = f2.next[0];
  assert.equal(w1.type, 'flow_while');
  assert.equal(w1.body[0].id, 'b3');

  const fe = w1.next[0];
  assert.equal(fe.type, 'flow_foreach');
  assert.equal(fe.body[0].id, 'b4');
  assert.equal(fe.next[0].id, 'done');
});

test('compiles flow_sequence (.steps) and flow_switch (.cases)', () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'e', type: 'evt_start', data: {} },
      { id: 'seq', type: 'flow_sequence', data: {} },
      { id: 's1', type: 'eng_log', data: { msg: '1' } },
      { id: 's2', type: 'eng_log', data: { msg: '2' } },
      { id: 'sw', type: 'flow_switch', data: { value: 1 } },
      { id: 'c0', type: 'eng_log', data: { msg: 'c0' } },
      { id: 'c1', type: 'eng_log', data: { msg: 'c1' } },
      { id: 'cd', type: 'eng_log', data: { msg: 'def' } },
      { id: 'after', type: 'eng_log', data: { msg: 'after' } },
    ],
    wires: [
      { fromNode: 'e', fromPort: 'out', toNode: 'seq', toPort: 'in' },
      { fromNode: 'seq', fromPort: 'step1', toNode: 's1', toPort: 'in' },
      { fromNode: 'seq', fromPort: 'step2', toNode: 's2', toPort: 'in' },
      { fromNode: 'seq', fromPort: 'out', toNode: 'sw', toPort: 'in' },
      { fromNode: 'sw', fromPort: 'case0', toNode: 'c0', toPort: 'in' },
      { fromNode: 'sw', fromPort: 'case1', toNode: 'c1', toPort: 'in' },
      { fromNode: 'sw', fromPort: 'default', toNode: 'cd', toPort: 'in' },
      { fromNode: 'sw', fromPort: 'out', toNode: 'after', toPort: 'in' },
    ],
  });

  const seq = ast.events.evt_start[0];
  assert.equal(seq.type, 'flow_sequence');
  assert.equal(seq.steps.length, 3);
  assert.equal(seq.steps[0][0].id, 's1');
  assert.equal(seq.steps[1][0].id, 's2');
  assert.equal(seq.steps[2], null);

  const sw = seq.next[0];
  assert.equal(sw.type, 'flow_switch');
  assert.equal(sw.cases.case0[0].id, 'c0');
  assert.equal(sw.cases.case1[0].id, 'c1');
  assert.equal(sw.cases.case2, null);
  assert.equal(sw.cases.default[0].id, 'cd');
  assert.equal(sw.next[0].id, 'after');
});

test('prevents infinite recursion on cyclic exec and data wires while preserving diamond DAGs', () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'e', type: 'evt_start', data: {} },
      { id: 'a', type: 'flow_branch', data: {} },
      { id: 'b', type: 'eng_log', data: { msg: 'shared' } },
      { id: 'm1', type: 'math_add', data: { b: 1 } },
      { id: 'm2', type: 'math_add', data: { b: 2 } },
    ],
    wires: [
      { fromNode: 'e', fromPort: 'out', toNode: 'a', toPort: 'in' },
      { fromNode: 'a', fromPort: 'true', toNode: 'b', toPort: 'in' },
      { fromNode: 'a', fromPort: 'false', toNode: 'b', toPort: 'in' },
      // Exec cycle: b -> a
      { fromNode: 'b', fromPort: 'out', toNode: 'a', toPort: 'in' },
      // Data cycle: m1 <-> m2 -> b.msg
      { fromNode: 'm1', fromPort: 'res', toNode: 'm2', toPort: 'a' },
      { fromNode: 'm2', fromPort: 'res', toNode: 'm1', toPort: 'a' },
      { fromNode: 'm2', fromPort: 'res', toNode: 'b', toPort: 'msg' },
    ],
  });

  const br = ast.events.evt_start[0];
  assert.equal(br.true[0].id, 'b');
  assert.equal(br.false[0].id, 'b');
  assert.equal(br.true[0].next, null);
  assert.equal(br.true[0]._inputs.msg.type, 'node');
});

test('compiled AST executes end-to-end in LogicInterpreter (branch, while, for_loop, sequence, switch, wired math)', async () => {
  const ast = compileLogicGraph({
    nodes: [
      { id: 'e', type: 'evt_start', data: {} },
      { id: 'vg', type: 'var_get', data: { name: 'hp' } },
      { id: 'add', type: 'math_add', data: { b: 25 } },
      { id: 'gt', type: 'logic_gt', data: { b: 100 } },
      { id: 'br', type: 'flow_branch', data: {} },
      { id: 'vs_hi', type: 'var_set', data: { name: 'status', val: 'strong' } },
      { id: 'vs_lo', type: 'var_set', data: { name: 'status', val: 'weak' } },
      { id: 'wloop', type: 'flow_while', data: {} },
      { id: 'vg_sum', type: 'var_get', data: { name: 'sum' } },
      { id: 'lt_sum', type: 'logic_lt', data: { b: 6 } },
      { id: 'add_sum', type: 'math_add', data: { b: 2 } },
      { id: 'vs_sum', type: 'var_set', data: { name: 'sum' } },
      { id: 'floop', type: 'flow_for_loop', data: { count: 3 } },
      { id: 'flog', type: 'eng_log', data: {} },
      { id: 'vg_idx', type: 'var_get', data: { name: 'index' } },
      { id: 'seq', type: 'flow_sequence', data: {} },
      { id: 's1', type: 'var_set', data: { name: 'seqOrder', val: 'first' } },
      { id: 'sw', type: 'flow_switch', data: { value: 1 } },
      { id: 'c1', type: 'var_set', data: { name: 'branchCase', val: 'one' } },
      { id: 'fin', type: 'var_set', data: { name: 'finished', val: true } },
    ],
    wires: [
      { fromNode: 'e', fromPort: 'out', toNode: 'br', toPort: 'in' },
      { fromNode: 'vg', fromPort: 'val', toNode: 'add', toPort: 'a' },
      { fromNode: 'add', fromPort: 'res', toNode: 'gt', toPort: 'a' },
      { fromNode: 'gt', fromPort: 'res', toNode: 'br', toPort: 'cond' },
      { fromNode: 'br', fromPort: 'true', toNode: 'vs_hi', toPort: 'in' },
      { fromNode: 'br', fromPort: 'false', toNode: 'vs_lo', toPort: 'in' },
      { fromNode: 'vs_hi', fromPort: 'out', toNode: 'wloop', toPort: 'in' },
      { fromNode: 'vg_sum', fromPort: 'val', toNode: 'lt_sum', toPort: 'a' },
      { fromNode: 'lt_sum', fromPort: 'res', toNode: 'wloop', toPort: 'condition' },
      { fromNode: 'wloop', fromPort: 'body', toNode: 'vs_sum', toPort: 'in' },
      { fromNode: 'vg_sum', fromPort: 'val', toNode: 'add_sum', toPort: 'a' },
      { fromNode: 'add_sum', fromPort: 'res', toNode: 'vs_sum', toPort: 'val' },
      { fromNode: 'wloop', fromPort: 'out', toNode: 'floop', toPort: 'in' },
      { fromNode: 'floop', fromPort: 'body', toNode: 'flog', toPort: 'in' },
      { fromNode: 'vg_idx', fromPort: 'val', toNode: 'flog', toPort: 'msg' },
      { fromNode: 'floop', fromPort: 'out', toNode: 'seq', toPort: 'in' },
      { fromNode: 'seq', fromPort: 'step1', toNode: 's1', toPort: 'in' },
      { fromNode: 'seq', fromPort: 'out', toNode: 'sw', toPort: 'in' },
      { fromNode: 'sw', fromPort: 'case1', toNode: 'c1', toPort: 'in' },
      { fromNode: 'sw', fromPort: 'out', toNode: 'fin', toPort: 'in' },
    ],
    vars: [
      { name: 'hp', value: 80 },
      { name: 'sum', value: 0 },
    ],
  });

  const logs = [];
  const origLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const interp = new LogicInterpreter({ logicFlags: {} });
    const entity = { logicMemory: {} };
    await interp.runEvent(ast, entity, 'evt_start');

    assert.equal(entity.logicMemory.status, 'strong');
    assert.equal(entity.logicMemory.sum, 6);
    assert.deepEqual(logs.filter(l => l.startsWith('[VSL]')), ['[VSL] ', '[VSL] 1', '[VSL] 2']);
    assert.equal(entity.logicMemory.seqOrder, 'first');
    assert.equal(entity.logicMemory.branchCase, 'one');
    assert.equal(entity.logicMemory.finished, true);
  } finally {
    console.log = origLog;
  }
});
