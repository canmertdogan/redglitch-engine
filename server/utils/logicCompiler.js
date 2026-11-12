// server/utils/logicCompiler.js
// Compile visual graph formats used by the editors into the structured AST
// { events, vars } consumed by public/shared/LogicInterpreter.js.
//
// Accepted graph shapes (all seen in-tree):
//   Algorithm Studio / VisualScriptEngine:
//     { nodes:[{id,type,data}], wires:[{fromNode,fromPort,toNode,toPort}], vars:[] }
//   AlgorithmRuntime:
//     { nodes:[...], wires:[...], variables:[] }
//   Brain Architect:
//     { nodes:[...], wires:[{from,port,to}], variables:[] }

const MAX_CHAIN_DEPTH = 100;
const MAX_DATA_DEPTH = 50;

// Value-producing (non-event, non-exec-only) node types supported by LogicInterpreter.
const VALUE_NODE_TYPES = new Set([
  'data_self', 'data_player', 'env_time', 'time_get',
  'math_add', 'math_sub', 'math_mul', 'math_div', 'math_rand', 'math_expression',
  'vec2_dist', 'vec2_split', 'vec2_combine',
  'logic_eq', 'logic_gt', 'logic_gte', 'logic_lt', 'logic_lte',
  'logic_greater', 'logic_less', 'logic_not', 'logic_and', 'logic_or',
  'var_get', 'flow_reroute',
  'entity_get_nearby', 'entity_get_by_name', 'entity_get_closest_enemy',
  'entity_get_all_enemies', 'entity_count_type', 'entity_exists',
  'entity_get_property', 'entity_spawn',
  'player_get_position', 'player_get_stat',
  'inventory_has_item', 'inventory_get_count', 'inventory_get_all',
  'flag_get', 'flag_check',
  'quest_is_active', 'data_load',
  'world_get_tile', 'world_spawn_at', 'world_get_spawn_point',
  'dialogue_choice',
]);

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

/**
 * Compile a visual node/wire graph into a structured AST compatible with
 * AlgorithmStudio.compileToAST() and LogicInterpreter.runEvent().
 */
function compileLogicGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes)) {
    return { events: {}, vars: normalizeVars(graph) };
  }

  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const outWires = new Map(); // fromNode -> [wire]
  const inWires = new Map();  // toNode -> [wire]

  for (const raw of Array.isArray(graph.wires) ? graph.wires : []) {
    const w = normalizeWire(raw);
    if (!w) continue;
    if (!nodes.has(w.fromNode) || !nodes.has(w.toNode)) continue;
    if (!outWires.has(w.fromNode)) outWires.set(w.fromNode, []);
    outWires.get(w.fromNode).push(w);
    if (!inWires.has(w.toNode)) inWires.set(w.toNode, []);
    inWires.get(w.toNode).push(w);
  }

  function astDataValue(sourceNode, portId, depth, ancestors) {
    if (depth > MAX_DATA_DEPTH || ancestors.has(sourceNode.id)) {
      return { type: 'literal', value: 0 };
    }
    if (!isEventNode(sourceNode.type) && VALUE_NODE_TYPES.has(sourceNode.type)) {
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(sourceNode.id);
      return {
        type: 'node',
        node: {
          type: sourceNode.type,
          data: { ...(sourceNode.data || {}) },
          _inputs: resolveDataWires(sourceNode, nextAncestors, depth + 1),
        },
      };
    }
    const val = sourceNode.data ? sourceNode.data[portId] : undefined;
    return { type: 'literal', value: val !== undefined ? val : 0 };
  }

  function resolveDataWires(node, ancestors = new Set([node.id]), depth = 0) {
    const resolved = {};
    for (const wire of inWires.get(node.id) || []) {
      const sourceNode = nodes.get(wire.fromNode);
      if (!sourceNode) continue;

      const isDataWire =
        wire.toPort !== 'in' ||
        (node.type === 'flow_reroute' && VALUE_NODE_TYPES.has(sourceNode.type));
      if (!isDataWire) continue;

      const val = astDataValue(sourceNode, wire.fromPort, depth, ancestors);
      resolved[wire.toPort] = val;

      // Support legacy graphs that wire flow_branch condition to 'condition' instead of 'cond'
      if (node.type === 'flow_branch' && wire.toPort === 'condition' && resolved.cond === undefined) {
        resolved.cond = val;
      }
    }
    return resolved;
  }

  function walkASTChain(node, portId, depth, ancestors) {
    if (depth > MAX_CHAIN_DEPTH) return null;
    const wires = (outWires.get(node.id) || []).filter((w) => w.fromPort === portId);
    const chain = [];

    for (const wire of wires) {
      if (ancestors.has(wire.toNode)) continue;
      const nextNode = nodes.get(wire.toNode);
      if (!nextNode) continue;

      const nextAncestors = new Set(ancestors);
      nextAncestors.add(nextNode.id);

      const astNode = {
        id: nextNode.id,
        type: nextNode.type,
        data: { ...(nextNode.data || {}) },
        _inputs: resolveDataWires(nextNode, new Set([nextNode.id]), 0),
      };

      if (nextNode.type === 'flow_branch') {
        astNode.true = walkASTChain(nextNode, 'true', depth + 1, nextAncestors);
        astNode.false = walkASTChain(nextNode, 'false', depth + 1, nextAncestors);
      } else if (nextNode.type === 'flow_switch') {
        astNode.cases = {
          case0: walkASTChain(nextNode, 'case0', depth + 1, nextAncestors),
          case1: walkASTChain(nextNode, 'case1', depth + 1, nextAncestors),
          case2: walkASTChain(nextNode, 'case2', depth + 1, nextAncestors),
          default: walkASTChain(nextNode, 'default', depth + 1, nextAncestors),
        };
        astNode.next = walkASTChain(nextNode, 'out', depth + 1, nextAncestors);
      } else if (
        nextNode.type === 'flow_for_loop' ||
        nextNode.type === 'flow_while' ||
        nextNode.type === 'flow_foreach'
      ) {
        astNode.body = walkASTChain(nextNode, 'body', depth + 1, nextAncestors);
        astNode.next = walkASTChain(nextNode, 'out', depth + 1, nextAncestors);
      } else if (nextNode.type === 'flow_for') {
        astNode.body =
          walkASTChain(nextNode, 'loop', depth + 1, nextAncestors) ||
          walkASTChain(nextNode, 'body', depth + 1, nextAncestors);
        astNode.next = walkASTChain(nextNode, 'out', depth + 1, nextAncestors);
      } else if (nextNode.type === 'flow_sequence') {
        astNode.steps = [
          walkASTChain(nextNode, 'step1', depth + 1, nextAncestors),
          walkASTChain(nextNode, 'step2', depth + 1, nextAncestors),
          walkASTChain(nextNode, 'step3', depth + 1, nextAncestors),
        ];
        astNode.next = walkASTChain(nextNode, 'out', depth + 1, nextAncestors);
      } else {
        astNode.next = walkASTChain(nextNode, 'out', depth + 1, nextAncestors);
      }

      chain.push(astNode);
    }

    return chain.length > 0 ? chain : null;
  }

  const events = {};
  for (const n of graph.nodes) {
    if (!isEventNode(n.type)) continue;
    const eventKey = n.type === 'evt_input' && n.data && n.data.key
      ? `evt_input_${n.data.key}`
      : n.type;
    const chain = walkASTChain(n, 'out', 0, new Set([n.id]));
    if (chain && Array.isArray(events[eventKey])) {
      events[eventKey].push(...chain);
    } else if (!(eventKey in events)) {
      events[eventKey] = chain;
    }
  }

  return { events, vars: normalizeVars(graph) };
}

module.exports = { compileLogicGraph, normalizeWire };
