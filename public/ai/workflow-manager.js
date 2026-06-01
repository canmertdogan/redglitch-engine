/**
 * RedGlitch AI - Workflow Manager (Phase 8)
 * Handles tool call parsing, sequencing, and transactional execution.
 */

export class WorkflowManager {
    constructor(toolRegistry, eventBus) {
        this.registry = toolRegistry;
        this.eventBus = eventBus;
        this.isExecuting = false;
    }

    /**
     * Parse LLM response for tool calls.
     * Looks for blocks like:
     * ```tool
     * {"name": "namespace.method", "args": {...}}
     * ```
     */
    parseToolCalls(text) {
        const regex = /```tool\s*\n([\s\S]*?)\n```/g;
        const calls = [];
        let match;

        while ((match = regex.exec(text)) !== null) {
            try {
                const call = JSON.parse(match[1]);
                calls.push(call);
            } catch (e) {
                console.error("[WorkflowManager] Failed to parse tool call JSON:", e);
            }
        }
        return calls;
    }

    /**
     * Execute a sequence of tool calls as a single transaction.
     * If any step fails, it attempts to rollback previous steps.
     */
    async executeWorkflow(calls) {
        if (this.isExecuting) return { success: false, error: "Already executing a workflow" };
        this.isExecuting = true;

        const results = [];
        const executedActions = [];

        try {
            for (const call of calls) {
                this.eventBus.emit('ai:workflow:step', { name: call.name, args: call.args });
                
                const response = await this.registry.execute(call.name, call.args);
                
                if (!response.success) {
                    throw new Error(`Step failed: ${call.name} - ${response.error?.message || 'Unknown error'}`);
                }

                results.push(response.result);
                executedActions.push({ name: call.name, args: call.args, result: response.result });
            }

            this.isExecuting = false;
            this.eventBus.emit('ai:workflow:complete', { success: true, count: calls.length });
            return { success: true, results };

        } catch (error) {
            console.error("[WorkflowManager] Workflow failed. Rolling back...", error);
            await this.rollback(executedActions);
            this.isExecuting = false;
            this.eventBus.emit('ai:workflow:complete', { success: false, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Rollback a list of actions in reverse order.
     */
    async rollback(actions) {
        // Rollback in reverse order
        for (let i = actions.length - 1; i >= 0; i--) {
            const action = actions[i];
            const tool = this.registry.tools.get(action.name);
            
            if (tool && tool.undo) {
                try {
                    console.log(`[WorkflowManager] Rolling back: ${action.name}`);
                    await tool.undo(action.args, action.result);
                } catch (undoError) {
                    console.error(`[WorkflowManager] Rollback failed for ${action.name}:`, undoError);
                }
            } else {
                console.warn(`[WorkflowManager] No undo function for ${action.name}. Manual cleanup may be required.`);
            }
        }
    }

    /**
     * Pre-defined "Recipes" for common tasks.
     */
    getRecipes() {
        return {
            'createActor': [
                { name: 'fs.write', description: 'Create logic script' },
                { name: 'world.spawn', description: 'Place in world' }
            ],
            'optimizeProject': [
                { name: 'fs.list', description: 'Scan files' },
                { name: 'fs.read', description: 'Analyze code' },
                { name: 'code.document', description: 'Add JSDoc' }
            ]
        };
    }
}
