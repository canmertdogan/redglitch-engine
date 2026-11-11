// public/engines/__tests__/rpg-topdown/VisualScriptEngine.test.js
// VisualScriptEngine graph attachment smoke test — runGraph executes evt_start -> eng_log
import { VisualScriptEngine } from '../../rpg-topdown/VisualScriptEngine.js';
import test from 'node:test';
import assert from 'node:assert/strict';

test('VSL runGraph executes evt_start chain', async () => {
  global.window = global.window || {};
  global.window.LogicRuntime = class { constructor(g,e){} };
  const game = { player: {}, eventLog: [] };
  const vsl = new VisualScriptEngine(game);
  let logged = false;
  vsl.nodeRegistry['eng_log'] = async (ctx) => { logged = true; };
  vsl.nodeRegistry['evt_start'] = async (ctx) => vsl.executeOutputs(ctx, 'out');
  const graph = {
    nodes: [
      { id: 'a', type: 'evt_start', data: {} },
      { id: 'b', type: 'eng_log', data: { msg: 'hi' } },
    ],
    wires: [{ fromNode: 'a', fromPort: 'out', toNode: 'b', toPort: 'in' }],
    vars: [],
  };
  const entity = { id: 'e1', x: 0, y: 0 };
  await vsl.runGraph(graph, entity, 'start');
  assert.equal(logged, true);
});

test('VSL update executes evt_tick graphs at a throttled rate', async () => {
  global.window = global.window || {};
  global.window.LogicRuntime = class { constructor(g, e) {} };
  const vsl = new VisualScriptEngine({ player: {} });
  let ticks = 0;
  vsl.nodeRegistry['evt_tick'] = async () => { ticks++; };
  const graph = { nodes: [{ id: 't', type: 'evt_tick', data: {} }], wires: [], vars: [] };
  const entity = { id: 'e2', x: 0, y: 0 };
  vsl.activeScripts.set('e2', { graph, entity, events: ['start', 'tick'] });

  // Below the tick interval: nothing runs yet.
  vsl.update(0.01);
  assert.equal(ticks, 0);

  // Crossing the interval starts exactly one tick; the async chain resolves.
  vsl.update(0.05);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(ticks, 1);
});

test('VSL update skips scripts not subscribed to tick', async () => {
  global.window = global.window || {};
  global.window.LogicRuntime = class { constructor(g, e) {} };
  const vsl = new VisualScriptEngine({ player: {} });
  let ticks = 0;
  vsl.nodeRegistry['evt_tick'] = async () => { ticks++; };
  const graph = { nodes: [{ id: 't', type: 'evt_tick', data: {} }], wires: [], vars: [] };
  vsl.activeScripts.set('e3', { graph, entity: { id: 'e3' }, events: ['start'] });
  vsl.update(0.1);
  vsl.update(0.1);
  await Promise.resolve();
  assert.equal(ticks, 0);
});
