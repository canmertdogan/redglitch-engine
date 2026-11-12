import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentPlanner, AGENT_ROLES, computeUnifiedDiff } from './agent-planner.js';

test('AGENT_ROLES exports all 5 core specializations', () => {
    assert.ok(AGENT_ROLES.architect);
    assert.ok(AGENT_ROLES.gameplay);
    assert.ok(AGENT_ROLES.world);
    assert.ok(AGENT_ROLES.narrative);
    assert.ok(AGENT_ROLES.qa);
    assert.equal(AGENT_ROLES.architect.id, 'architect');
    assert.equal(AGENT_ROLES.narrative.id, 'narrative');
});

test('computeUnifiedDiff calculates line changes accurately', () => {
    const orig = 'const a = 1;\nconst b = 2;\n';
    const mod = 'const a = 1;\nconst b = 99;\nconst c = 3;\n';
    const diff = computeUnifiedDiff(orig, mod, 'test.js');

    assert.equal(diff.filePath, 'test.js');
    assert.ok(diff.additions > 0);
    assert.ok(diff.deletions > 0);
    assert.match(diff.summary, /\+\d+ \/ -\d+ lines changed/);
});

test('decomposeGoal generates multi-step plan via heuristics', async () => {
    const planner = new AgentPlanner();
    const plan = await planner.decomposeGoal('Create an epic quest with an Elder NPC', { role: 'narrative' });

    assert.ok(plan.id.startsWith('plan_'));
    assert.equal(plan.role, 'narrative');
    assert.ok(plan.steps.length >= 3);
    assert.equal(plan.steps[0].status, 'pending');
    assert.equal(plan.steps[1].tool, 'data.update');
});

test('decomposeGoal falls back cleanly from LLM error to heuristics', async () => {
    const planner = new AgentPlanner();
    const brokenLLM = async () => { throw new Error('Network timeout'); };
    const plan = await planner.decomposeGoal('Add a health potion item', { llm: brokenLLM, role: 'gameplay' });

    assert.ok(plan);
    assert.equal(plan.role, 'gameplay');
    assert.ok(plan.steps.some(s => s.tool === 'data.update'));
});

test('executePlan executes steps sequentially and reports progress', async () => {
    const planner = new AgentPlanner();
    const plan = await planner.decomposeGoal('Build a procedural dungeon map', { role: 'world' });

    const progressUpdates = [];
    const executor = async (step) => ({ success: true, stepRan: step.tool });

    const result = await planner.executePlan(plan, {
        executor,
        onStepProgress: (p) => progressUpdates.push(p)
    });

    assert.equal(result.success, true);
    assert.equal(plan.status, 'completed');
    assert.ok(progressUpdates.length >= plan.steps.length);
    assert.equal(plan.steps[0].status, 'completed');
});

test('executePlan stops and marks plan failed if step fails', async () => {
    const planner = new AgentPlanner();
    const plan = await planner.decomposeGoal('Scan project telemetry', { role: 'architect' });

    const executor = async (step) => {
        if (step.id === 2) return { success: false, error: { message: 'Write permission denied' } };
        return { success: true };
    };

    const result = await planner.executePlan(plan, { executor });
    assert.equal(result.success, false);
    assert.equal(plan.status, 'failed');
    assert.equal(plan.steps[1].status, 'failed');
});

test('heuristic plans align with tool-definitions schemas (array data.update, name on iso.spawn_prefab, content on manifesto)', async () => {
    const planner = new AgentPlanner();

    const questPlan = await planner.decomposeGoal('Create a quest with NPC', { role: 'narrative' });
    const questUpdate = questPlan.steps.find((s) => s.tool === 'data.update');
    assert.ok(Array.isArray(questUpdate.args.data));

    const worldPlan = await planner.decomposeGoal('Build an isometric dungeon level', { role: 'world' });
    const spawnStep = worldPlan.steps.find((s) => s.tool === 'iso.spawn_prefab');
    assert.equal(typeof spawnStep.args.name, 'string');
    assert.equal(spawnStep.args.type, undefined);
    const navStep = worldPlan.steps.find((s) => s.tool === 'navigateTo');
    assert.equal(navStep.args.target, 'iso_studio');

    const archPlan = await planner.decomposeGoal('Establish architecture goals', { role: 'architect' });
    const manifestoStep = archPlan.steps.find((s) => s.tool === 'project.updateManifesto');
    assert.equal(typeof manifestoStep.args.content, 'string');
});

test('decomposeViaLLM advertises current schemas and normalizes legacy LLM step args', async () => {
    const planner = new AgentPlanner();
    let capturedPrompt = '';
    const plan = await planner.decomposeGoal('Populate map', {
        role: 'world',
        llm: async (messages) => {
            capturedPrompt = messages[0].content;
            return JSON.stringify({
                title: 'Map Setup',
                summary: 'Setup map',
                steps: [
                    { id: 1, title: 'Spawn', tool: 'iso.spawn_prefab', args: { type: 'obelisk', x: 4, y: 5, z: 0 } },
                    { id: 2, title: 'Edit', tool: 'fs.edit_file', args: { path: 'a.js', replacement: 'new code' } },
                    { id: 3, title: 'Data', tool: 'data.update', args: { type: 'items', data: { id: 'sword1', name: 'Sword' } } },
                    { id: 4, title: 'Open', tool: 'navigateTo', args: { target: 'iso' } },
                ],
            });
        },
    });

    assert.match(capturedPrompt, /new_content.*patch/);
    assert.match(capturedPrompt, /"name": string/);
    assert.deepEqual(plan.steps[0].args, { name: 'obelisk', x: 4, y: 5 });
    assert.deepEqual(plan.steps[1].args, { path: 'a.js', new_content: 'new code' });
    assert.deepEqual(plan.steps[2].args, { type: 'items', data: [{ id: 'sword1', name: 'Sword' }] });
    assert.deepEqual(plan.steps[3].args, { target: 'iso_studio' });
});

test('executePlan merges existing records via data.list before calling data.update', async () => {
    const calls = [];
    const fakeRegistry = {
        execute: async (tool, args) => {
            calls.push({ tool, args });
            if (tool === 'data.list') {
                return { success: true, result: [{ id: 'existing_1', name: 'Old Sword' }] };
            }
            return { success: true, result: { updated: args.data.length } };
        },
    };
    const planner = new AgentPlanner(fakeRegistry);
    const plan = {
        id: 'plan_rmw',
        steps: [
            {
                id: 1,
                title: 'Add item',
                tool: 'data.update',
                args: { type: 'items', data: [{ id: 'new_2', name: 'Potion' }] },
                status: 'pending',
            },
        ],
    };

    const result = await planner.executePlan(plan);
    assert.equal(result.success, true);
    assert.equal(calls[0].tool, 'data.list');
    assert.equal(calls[1].tool, 'data.update');
    assert.deepEqual(calls[1].args.data, [
        { id: 'existing_1', name: 'Old Sword' },
        { id: 'new_2', name: 'Potion' },
    ]);
});
