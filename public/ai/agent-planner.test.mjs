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
