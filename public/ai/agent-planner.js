/**
 * public/ai/agent-planner.js
 * Redglitch Agentic Development & Multi-Step Planner Core.
 *
 * Provides autonomous task planning, role specializations, goal decomposition,
 * step execution with diff generation, and telemetry for the studio UI.
 */

export const AGENT_ROLES = {
    architect: {
        id: 'architect',
        name: 'Lead Architect',
        icon: '🏛️',
        tagline: 'High-level orchestration, manifesto, system design',
        tools: ['project.getInfo', 'project.updateManifesto', 'fs.list', 'fs.search', 'workflow.run'],
        systemPrompt: 'You are the Lead Architect of Redglitch Engine. You break complex goals into structured steps and guide game systems.'
    },
    gameplay: {
        id: 'gameplay',
        name: 'Gameplay Engineer',
        icon: '⚡',
        tagline: 'Combat, player physics, items, skills, algorithms',
        tools: ['data.list', 'data.update', 'fs.read', 'fs.write', 'fs.edit_file', 'saveScript'],
        systemPrompt: 'You are the Gameplay Engineer. You create and tune abilities, items, stats, combat formulas, and mechanics.'
    },
    world: {
        id: 'world',
        name: 'World Builder',
        icon: '🗺️',
        tagline: '2D & 3D levels, prefabs, rooms, lighting, terrain',
        tools: ['iso.spawn_prefab', 'navigateTo', 'fs.read', 'fs.write', 'asset.generate'],
        systemPrompt: 'You are the World Builder. You design playable levels, spawn prefabs, build terrain, and set up atmospheres.'
    },
    narrative: {
        id: 'narrative',
        name: 'Narrative Designer',
        icon: '📜',
        tagline: 'NPCs, quests, branching dialogue, lore, cutscenes',
        tools: ['data.list', 'data.update', 'navigateTo', 'fs.read', 'fs.write'],
        systemPrompt: 'You are the Narrative Designer. You craft immersive NPC personalities, branching dialogue trees, quests, and game lore.'
    },
    qa: {
        id: 'qa',
        name: 'QA Sentinel',
        icon: '🛡️',
        tagline: 'Playtesting, regression validation, syntax checks, chaos testing',
        tools: ['fs.read', 'fs.search', 'data.list', 'git.status', 'git.stage', 'git.commit'],
        systemPrompt: 'You are the QA Sentinel. You audit game data for consistency, detect broken references, and ensure engine stability.'
    }
};

/**
 * Computes a simple line-by-line unified diff between two strings.
 */
export function computeUnifiedDiff(originalText = '', modifiedText = '', filePath = '') {
    const origLines = (originalText || '').split('\n');
    const modLines = (modifiedText || '').split('\n');
    const diffLines = [];
    const max = Math.max(origLines.length, modLines.length);

    for (let i = 0; i < max; i++) {
        const o = origLines[i];
        const m = modLines[i];
        if (o === undefined && m !== undefined) {
            diffLines.push({ type: 'add', line: m, lineNo: i + 1 });
        } else if (o !== undefined && m === undefined) {
            diffLines.push({ type: 'del', line: o, lineNo: i + 1 });
        } else if (o !== m) {
            diffLines.push({ type: 'del', line: o, lineNo: i + 1 });
            diffLines.push({ type: 'add', line: m, lineNo: i + 1 });
        } else {
            diffLines.push({ type: 'same', line: o, lineNo: i + 1 });
        }
    }

    const additions = diffLines.filter(d => d.type === 'add').length;
    const deletions = diffLines.filter(d => d.type === 'del').length;

    return {
        filePath,
        additions,
        deletions,
        diffLines,
        summary: `+${additions} / -${deletions} lines changed`
    };
}

/**
 * Core Agentic Planner & Mission Runner
 */
export class AgentPlanner {
    constructor(toolRegistry = null, eventBus = null) {
        this.toolRegistry = toolRegistry;
        this.eventBus = eventBus || (typeof window !== 'undefined' ? window.RedglitchEventBus : null);
        this.activePlan = null;
        this.history = [];
        this.isExecuting = false;
        this.abortRequested = false;
    }

    /**
     * Decomposes a user objective into an actionable multi-step plan.
     * Uses LLM if provided, otherwise uses high-accuracy heuristic templates.
     */
    async decomposeGoal(goal, options = {}) {
        const cleanGoal = (goal || '').trim();
        if (!cleanGoal) throw new Error('Goal cannot be empty');

        const role = options.role && AGENT_ROLES[options.role] ? options.role : 'architect';

        // 1. Try LLM decomposition if available
        if (typeof options.llm === 'function') {
            try {
                const planFromLLM = await this._decomposeViaLLM(cleanGoal, role, options.llm);
                if (planFromLLM && planFromLLM.steps && planFromLLM.steps.length > 0) {
                    this.activePlan = planFromLLM;
                    return planFromLLM;
                }
            } catch (err) {
                console.warn('[AgentPlanner] LLM decomposition error, falling back to heuristics:', err);
            }
        }

        // 2. Heuristic rule-based fallback
        const heuristicPlan = this._heuristicDecompose(cleanGoal, role);
        this.activePlan = heuristicPlan;
        return heuristicPlan;
    }

    async _decomposeViaLLM(goal, role, llm) {
        const systemPrompt = `You are the Redglitch Studio Agentic Planner.
Decompose this game development goal into structured, discrete steps.
Available tools:
- data.update: create or modify npcs, items, quests, skills. args: { "type": "items"|"npcs"|"quests"|"skills", "data": {...} }
- data.list: inspect game data. args: { "type": "items"|"npcs"|"quests"|"skills" }
- fs.create_file: create a new script or level file. args: { "path": string, "content": string }
- fs.write: write file. args: { "path": string, "content": string }
- fs.edit_file: edit file. args: { "path": string, "target": string, "replacement": string }
- fs.read: inspect file content. args: { "path": string }
- iso.spawn_prefab: spawn object or NPC in 2.5D world. args: { "type": string, "x": number, "y": number }
- navigateTo: open studio editor. args: { "target": "editor"|"iso_studio"|"platformer_studio"|"asset-manager"|"daw" }
- project.updateManifesto: update design manifesto. args: { "vision": string, "corePillars": string[] }

Respond ONLY with valid JSON matching:
{
  "title": "Short title",
  "summary": "1 sentence explanation",
  "role": "${role}",
  "steps": [
    {
      "id": 1,
      "title": "Short step name",
      "description": "What this step accomplishes",
      "role": "${role}",
      "tool": "tool.name",
      "args": {},
      "risk": "safe" | "low" | "high"
    }
  ]
}`;

        const raw = await llm([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Goal: "${goal}"` }
        ]);

        const text = typeof raw === 'string' ? raw : (raw.text || '');
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.steps || !Array.isArray(parsed.steps)) return null;

        return {
            id: `plan_${Date.now()}`,
            goal,
            title: parsed.title || goal.slice(0, 40),
            summary: parsed.summary || 'Custom agentic plan',
            role: parsed.role || role,
            createdAt: new Date().toISOString(),
            status: 'ready',
            steps: parsed.steps.map((s, idx) => ({
                id: s.id || idx + 1,
                title: s.title || `Step ${idx + 1}`,
                description: s.description || '',
                role: s.role || role,
                tool: s.tool || 'fs.read',
                args: s.args || {},
                risk: s.risk || (s.tool.includes('delete') ? 'high' : s.tool.includes('write') || s.tool.includes('update') ? 'low' : 'safe'),
                status: 'pending',
                output: null,
                error: null
            }))
        };
    }

    _heuristicDecompose(goal, role) {
        const q = goal.toLowerCase();
        const steps = [];

        if (q.includes('quest') || q.includes('npc') || q.includes('dialogue')) {
            const slug = goal.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 20) || 'main_quest';
            steps.push({
                id: 1,
                title: 'Check Existing NPCs and Quests',
                description: 'Query database to avoid ID collisions and understand current progression.',
                role: 'narrative',
                tool: 'data.list',
                args: { type: 'quests' },
                risk: 'safe',
                status: 'pending'
            });
            steps.push({
                id: 2,
                title: 'Register Quest Definition',
                description: `Define quest metadata for "${goal.slice(0, 30)}".`,
                role: 'narrative',
                tool: 'data.update',
                args: {
                    type: 'quests',
                    data: {
                        id: `quest_${slug}`,
                        title: goal.slice(0, 35),
                        description: `Automated quest created for: ${goal}`,
                        reward: { exp: 100, gold: 50 },
                        status: 'available'
                    }
                },
                risk: 'low',
                status: 'pending'
            });
            steps.push({
                id: 3,
                title: 'Register NPC Actor',
                description: 'Create interacting NPC character connected to the quest.',
                role: 'narrative',
                tool: 'data.update',
                args: {
                    type: 'npcs',
                    data: {
                        id: `npc_${slug}`,
                        name: 'Elder Sentinel',
                        dialogue: [`Greetings, adventurer. ${goal}`, 'May your blade stay sharp.']
                    }
                },
                risk: 'low',
                status: 'pending'
            });
            steps.push({
                id: 4,
                title: 'Verify Quest Data',
                description: 'Confirm quest and NPC are queryable and properly indexed.',
                role: 'qa',
                tool: 'data.list',
                args: { type: 'npcs' },
                risk: 'safe',
                status: 'pending'
            });
        } else if (q.includes('item') || q.includes('potion') || q.includes('weapon') || q.includes('sword') || q.includes('armor')) {
            const itemId = 'item_' + Date.now().toString(36);
            steps.push({
                id: 1,
                title: 'List Existing Items',
                description: 'Verify current item registry to configure harmonious balance.',
                role: 'gameplay',
                tool: 'data.list',
                args: { type: 'items' },
                risk: 'safe',
                status: 'pending'
            });
            steps.push({
                id: 2,
                title: 'Create Item Blueprint',
                description: `Add item definition to the inventory database for: ${goal.slice(0, 30)}.`,
                role: 'gameplay',
                tool: 'data.update',
                args: {
                    type: 'items',
                    data: {
                        id: itemId,
                        name: goal.slice(0, 25),
                        description: `Crafted via Agentic Planner: ${goal}`,
                        value: 50,
                        rarity: 'rare',
                        consumable: q.includes('potion')
                    }
                },
                risk: 'low',
                status: 'pending'
            });
            steps.push({
                id: 3,
                title: 'Validate Item Registration',
                description: 'Confirm item is present and ready for loot tables and shops.',
                role: 'qa',
                tool: 'data.list',
                args: { type: 'items' },
                risk: 'safe',
                status: 'pending'
            });
        } else if (q.includes('level') || q.includes('map') || q.includes('terrain') || q.includes('world') || q.includes('dungeon')) {
            steps.push({
                id: 1,
                title: 'Inspect Project Manifest',
                description: 'Check active project metadata and engine type.',
                role: 'architect',
                tool: 'project.getInfo',
                args: {},
                risk: 'safe',
                status: 'pending'
            });
            steps.push({
                id: 2,
                title: 'Spawn World Anchor Prefab',
                description: 'Place spawn landmark or generator prefab in level.',
                role: 'world',
                tool: 'iso.spawn_prefab',
                args: { type: 'spawn_gate', x: 0, y: 0, z: 0 },
                risk: 'safe',
                status: 'pending'
            });
            steps.push({
                id: 3,
                title: 'Open Studio Editor',
                description: 'Navigate to target level editor for interactive verification.',
                role: 'world',
                tool: 'navigateTo',
                args: { target: q.includes('platformer') ? 'platformer_studio' : 'iso_studio' },
                risk: 'safe',
                status: 'pending'
            });
        } else {
            // General architectural plan
            steps.push({
                id: 1,
                title: 'Scan Project Telemetry',
                description: 'Inspect workspace files to discover entry points.',
                role: 'architect',
                tool: 'fs.list',
                args: { dir: '.' },
                risk: 'safe',
                status: 'pending'
            });
            steps.push({
                id: 2,
                title: 'Update Project Manifesto',
                description: `Align project vision with current milestone: ${goal.slice(0, 40)}.`,
                role: 'architect',
                tool: 'project.updateManifesto',
                args: { vision: goal, corePillars: ['Responsive Gameplay', 'Dynamic AI', 'Modular Systems'] },
                risk: 'low',
                status: 'pending'
            });
            steps.push({
                id: 3,
                title: 'Verify Version Control Status',
                description: 'Review git stage to track modified components.',
                role: 'qa',
                tool: 'git.status',
                args: {},
                risk: 'safe',
                status: 'pending'
            });
        }

        return {
            id: `plan_${Date.now()}`,
            goal,
            title: goal.length > 40 ? `${goal.slice(0, 37)}...` : goal,
            summary: `Automated ${role.toUpperCase()} execution plan with ${steps.length} discrete steps.`,
            role,
            createdAt: new Date().toISOString(),
            status: 'ready',
            steps
        };
    }

    /**
     * Executes the active plan step-by-step with real-time telemetry.
     */
    async executePlan(plan, options = {}) {
        const targetPlan = plan || this.activePlan;
        if (!targetPlan || !targetPlan.steps || targetPlan.steps.length === 0) {
            throw new Error('No valid plan to execute');
        }

        this.isExecuting = true;
        this.abortRequested = false;
        targetPlan.status = 'running';
        targetPlan.diffs = targetPlan.diffs || [];

        const total = targetPlan.steps.length;
        const results = [];

        for (let i = 0; i < total; i++) {
            if (this.abortRequested) {
                targetPlan.status = 'aborted';
                break;
            }

            const step = targetPlan.steps[i];
            step.status = 'running';
            this._emitTelemetry('step_start', { plan: targetPlan, step, index: i, total });

            if (typeof options.onStepProgress === 'function') {
                options.onStepProgress({ step, index: i, total, status: 'running' });
            }

            const startTime = Date.now();
            try {
                let executionResult = null;
                if (typeof options.executor === 'function') {
                    executionResult = await options.executor(step);
                } else if (this.toolRegistry) {
                    executionResult = await this.toolRegistry.execute(step.tool, step.args || {});
                } else {
                    // Simulated success for test environments
                    executionResult = { success: true, message: `Simulated execution of ${step.tool}` };
                }

                step.status = (executionResult && executionResult.success !== false) ? 'completed' : 'failed';
                step.output = executionResult;
                step.durationMs = Date.now() - startTime;

                if (step.status === 'completed') {
                    // Record diff telemetry if step mutated files or game entities
                    if (step.tool === 'fs.write' || step.tool === 'fs.create_file') {
                        const diff = computeUnifiedDiff('', step.args?.content || '', step.args?.path || 'file.txt');
                        targetPlan.diffs.push(diff);
                        this._emitTelemetry('diff_generated', { plan: targetPlan, step, diff });
                    } else if (step.tool === 'fs.edit_file') {
                        const diff = computeUnifiedDiff(step.args?.target || '', step.args?.replacement || '', step.args?.path || 'file.txt');
                        targetPlan.diffs.push(diff);
                        this._emitTelemetry('diff_generated', { plan: targetPlan, step, diff });
                    } else if (step.tool === 'data.update') {
                        const diff = {
                            filePath: `data/${step.args?.type || 'entities'}.json`,
                            additions: 1,
                            deletions: 0,
                            diffLines: [
                                { type: 'add', line: `+ ${JSON.stringify(step.args?.data || {}, null, 2)}`, lineNo: 1 }
                            ],
                            summary: `Updated entity in ${step.args?.type || 'data'}`
                        };
                        targetPlan.diffs.push(diff);
                        this._emitTelemetry('diff_generated', { plan: targetPlan, step, diff });
                    }
                } else if (step.status === 'failed') {
                    step.error = executionResult?.error?.message || executionResult?.message || 'Step execution failed';
                }
            } catch (err) {
                step.status = 'failed';
                step.error = err.message || String(err);
                step.durationMs = Date.now() - startTime;
            }

            results.push({ stepId: step.id, status: step.status, output: step.output, error: step.error });

            this._emitTelemetry('step_finish', { plan: targetPlan, step, index: i, total });

            if (typeof options.onStepProgress === 'function') {
                options.onStepProgress({ step, index: i, total, status: step.status });
            }

            // Stop execution on failure unless continueOnError is specified
            if (step.status === 'failed' && !options.continueOnError) {
                targetPlan.status = 'failed';
                break;
            }
        }

        if (targetPlan.status !== 'failed' && targetPlan.status !== 'aborted') {
            targetPlan.status = 'completed';
        }

        this.isExecuting = false;
        this.history.unshift(targetPlan);
        if (this.history.length > 20) this.history.pop();

        this._emitTelemetry('plan_complete', { plan: targetPlan, results });
        return { plan: targetPlan, results, success: targetPlan.status === 'completed' };
    }

    abort() {
        this.abortRequested = true;
    }

    getRoles() {
        return AGENT_ROLES;
    }

    _emitTelemetry(event, data) {
        if (this.eventBus) {
            try {
                this.eventBus.emit(`ai:planner:${event}`, data);
            } catch (_) {}
        }
    }
}
