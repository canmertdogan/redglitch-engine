// server/utils/logicCompiler.js
// Compile visual graph formats used by the editors into the interpreter AST
// {events:{evt_start:[{id,type,data,next?}]}, vars} that LogicInterpreter.runEvent consumes.
//
// Accepted graph shapes (all seen in-tree):
//   Algorithm Studio / VisualScriptEngine:
//     { nodes:[{id,type,data}], wires:[{fromNode,fromPort,toNode,toPort}], vars:[] }
//   AlgorithmRuntime:
//     { nodes:[...], wires:[...], variables:[] }
//   Brain Architect:
//     { nodes:[...], wires:[{from,port,to}], variables:[] }

function isEventNode(type) {
  return typeof type === 'string' && type.startsWith('evt_');
}

function normalizeWire(w) {
  if (!w || typeof w !== 'object') return null;
  const fromNode = w.fromNode ?? w.from ?? w.source ?? null;
  const toNode = w.toNode ?? w.to ?? w.target ?? null;
  if (fromNode == null || toNode == null) return null;
  return {
    fromNode,
    toNode,
    fromPort: w.fromPort ?? w.port ?? w.sourcePort ?? 'out',
    toPort: w.toPort ?? w.targetPort ?? 'in',
  };
}

function normalizeVars(graph) {
  const vars = graph?.vars ?? graph?.variables;
  if (Array.isArray(vars)) return vars;
  if (vars && typeof vars === 'object') {
    return Object.keys(vars).map((name) => ({ name, value: vars[name] }));
  }
  return [];
}

function compileLogicGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes)) {
    return { events: {}, vars: normalizeVars(graph) };
  }
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const outEdges = new Map(); // nodeId -> [wire]
  for (const raw of Array.isArray(graph.wires) ? graph.wires : []) {
    const w = normalizeWire(raw);
    if (!w) continue;
    if (!nodes.has(w.fromNode) || !nodes.has(w.toNode)) continue;
    if (!outEdges.has(w.fromNode)) outEdges.set(w.fromNode, []);
    outEdges.get(w.fromNode).push(w);
  }

  const events = {};
  for (const n of graph.nodes) {
    if (!isEventNode(n.type)) continue;
    const key = n.type; // e.g. evt_start, evt_tick
    // BFS/DFS in wire order to linearize chain; cycle-safe
    const chain = [];
    const visited = new Set();
    const queue = [n.id];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodes.get(id);
      if (!node) continue;
      const entry = { id: node.id, type: node.type, data: node.data || {} };
      chain.push(entry);
      for (const w of outEdges.get(id) || []) queue.push(w.toNode);
    }
    if (chain.length) events[key] = chain;
  }
  return { events, vars: normalizeVars(graph) };
}

module.exports = { compileLogicGraph, normalizeWire };
