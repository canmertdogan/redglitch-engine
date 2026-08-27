const fs = require('fs');
const path = require('path');
const { askForJson } = require('../llmClient');
const config = require('../../config');

const SYSTEM_PROMPT = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'logic.system.txt'),
    'utf8'
);

// Mirrors the node registry in public/engines/rpg-topdown/VisualScriptEngine.js,
// restricted to the subset offered in prompts/logic.system.txt.
//   flow:     valid fromPort names for a wire that chains execution (engine
//             ignores that wire's toPort entirely — see executeOutputs()).
//   valueOut: true if the node may be a data wire's source; VisualScript's
//             resolveInput() falls through to `value = result` for any
//             unrecognized port name, so a single "value" output name is a
//             convention here, not an engine requirement.
//   inputs:   valid toPort names for a data wire landing on this node.
const ALLOWED_NODES = {
    evt_tick: { flow: ['out'], valueOut: false, inputs: [] },
    evt_interact: { flow: ['out'], valueOut: false, inputs: [] },
    flow_branch: { flow: ['true', 'false'], valueOut: false, inputs: ['cond'] },
    flow_wait: { flow: ['out'], valueOut: false, inputs: ['time'] },
    eng_log: { flow: [], valueOut: false, inputs: ['msg'] },
    var_set: { flow: ['out'], valueOut: false, inputs: ['val'], requiresData: ['name'] },
    dialogue_show: { flow: [], valueOut: false, inputs: ['text', 'speaker'] },
    flag_set: { flow: [], valueOut: false, inputs: ['name', 'value'] },
    player_damage: { flow: [], valueOut: false, inputs: ['damage'] },
    player_heal: { flow: [], valueOut: false, inputs: ['amount'] },
    camera_shake: { flow: [], valueOut: false, inputs: ['intensity', 'duration'] },
    data_self: { flow: [], valueOut: true, inputs: [] },
    data_player: { flow: [], valueOut: true, inputs: [] },
    var_get: { flow: [], valueOut: true, inputs: [], requiresData: ['name'] },
    flag_get: { flow: [], valueOut: true, inputs: ['name'] },
    entity_get_property: { flow: [], valueOut: true, inputs: ['entity', 'property'] },
    math_add: { flow: [], valueOut: true, inputs: ['a', 'b'] },
    math_sub: { flow: [], valueOut: true, inputs: ['a', 'b'] },
    math_mul: { flow: [], valueOut: true, inputs: ['a', 'b'] },
    math_div: { flow: [], valueOut: true, inputs: ['a', 'b'] },
    logic_eq: { flow: [], valueOut: true, inputs: ['a', 'b'] },
    logic_gt: { flow: [], valueOut: true, inputs: ['a', 'b'] },
    logic_gte: { flow: [], valueOut: true, inputs: ['a', 'b'] },
    logic_lt: { flow: [], valueOut: true, inputs: ['a', 'b'] },
    logic_lte: { flow: [], valueOut: true, inputs: ['a', 'b'] },
};

const MAX_NODES = 16;
const MAX_WIRES = 20;

function validateLogicGraph(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('graph must be an object');
    if (!Array.isArray(obj.nodes) || obj.nodes.length < 1 || obj.nodes.length > MAX_NODES) {
        throw new Error(`nodes must be an array of 1-${MAX_NODES} items`);
    }
    if (!Array.isArray(obj.wires) || obj.wires.length > MAX_WIRES) {
        throw new Error(`wires must be an array of at most ${MAX_WIRES} items`);
    }
    if (obj.variables !== undefined && !Array.isArray(obj.variables)) {
        throw new Error('variables must be an array when present');
    }

    const nodeIds = new Set();
    obj.nodes.forEach((n, i) => {
        if (!n || typeof n.id !== 'string' || !n.id.trim()) {
            throw new Error(`nodes[${i}].id must be a non-empty string`);
        }
        if (nodeIds.has(n.id)) throw new Error(`nodes[${i}].id "${n.id}" is not unique`);
        nodeIds.add(n.id);
        if (!ALLOWED_NODES[n.type]) {
            throw new Error(`nodes[${i}].type "${n.type}" is not an allowed node type`);
        }
        const spec = ALLOWED_NODES[n.type];
        const data = n.data && typeof n.data === 'object' ? n.data : {};
        (spec.requiresData || []).forEach((field) => {
            if (typeof data[field] !== 'string' || !data[field].trim()) {
                throw new Error(`nodes[${i}] (type "${n.type}") requires a non-empty data.${field}`);
            }
        });
    });

    const hasEntryEvent = obj.nodes.some((n) => n.type === 'evt_tick' || n.type === 'evt_interact');
    if (!hasEntryEvent) throw new Error('graph must contain at least one evt_tick or evt_interact node');

    obj.wires.forEach((w, i) => {
        if (!w || typeof w.id !== 'string' || !w.id.trim()) {
            throw new Error(`wires[${i}].id must be a non-empty string`);
        }
        const fromNode = obj.nodes.find((n) => n.id === w.fromNode);
        const toNode = obj.nodes.find((n) => n.id === w.toNode);
        if (!fromNode) throw new Error(`wires[${i}].fromNode "${w.fromNode}" does not reference an existing node`);
        if (!toNode) throw new Error(`wires[${i}].toNode "${w.toNode}" does not reference an existing node`);

        const fromSpec = ALLOWED_NODES[fromNode.type];
        const toSpec = ALLOWED_NODES[toNode.type];
        const isFlowWire = fromSpec.flow.includes(w.fromPort);
        if (!isFlowWire) {
            if (!fromSpec.valueOut) {
                throw new Error(`wires[${i}].fromPort "${w.fromPort}" is not a valid output of node type "${fromNode.type}"`);
            }
            if (toSpec.inputs.length === 0 || !toSpec.inputs.includes(w.toPort)) {
                throw new Error(`wires[${i}].toPort "${w.toPort}" is not a valid input of node type "${toNode.type}"`);
            }
        }
    });

    return {
        name: typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'main',
        variables: obj.variables || [],
        nodes: obj.nodes.map((n) => ({ id: n.id, type: n.type, data: (n.data && typeof n.data === 'object') ? n.data : {} })),
        wires: obj.wires.map((w) => ({ id: w.id, fromNode: w.fromNode, fromPort: w.fromPort, toNode: w.toNode, toPort: w.toPort })),
    };
}

const EMPTY_GRAPH = { nodes: [], wires: [], variables: [], name: 'main' };

// Generates a small "main" VisualScriptEngine graph (win/lose flow, NPC
// dialogue, simple reactive beats) via the LLM, validated against a strict
// node/port allowlist so referential integrity is guaranteed regardless of
// what the model produces (see prompts/logic.system.txt for the contract).
// Only rpg-topdown's VisualScriptEngine consumes this graph shape — callers
// for other engine types should skip this phase and keep the empty stub.
async function runLogicPhase(concept, entityDesign, options = {}) {
    if (!concept) return EMPTY_GRAPH;

    const entityList = (entityDesign?.entities || [])
        .map((e) => `${e.id} (${e.category}${e.ai ? `, ai=${e.ai.type}` : ''})`)
        .join(', ') || 'none designed yet';
    const userPrompt = `Game concept:\nTitle: ${concept.title}\nGenre: ${concept.genre || 'unknown'}\nPitch: ${concept.pitch}\nDesigned entities: ${entityList}`;

    try {
        return await askForJson({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt,
            maxTokens: options.maxTokens ?? 1200,
            temperature: options.temperature ?? 0.4,
            maxRetries: options.maxRetries ?? config.MAX_RETRIES.logic,
            clientKeys: options.clientKeys,
            validate: validateLogicGraph,
        });
    } catch (err) {
        // Logic is a nice-to-have flourish, not load-bearing — if the model
        // can't produce a valid graph after retries, ship the project with
        // an empty one rather than failing the whole pipeline over it.
        console.warn(`[projectvertex] logic phase failed, shipping empty graph: ${err.message}`);
        return EMPTY_GRAPH;
    }
}

module.exports = { runLogicPhase, validateLogicGraph, ALLOWED_NODES };
