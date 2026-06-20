import { parseToolCalls } from './tool-call-parser.mjs';

/**
 * RedGlitch AI - Workflow Manager (Phase 8)
 * Handles tool call parsing, sequencing, and transactional execution.
 */

export class WorkflowManager {
    constructor(toolRegistry, eventBus) {
        this.registry = toolRegistry;
        this.eventBus = eventBus;
        this.isExecuting = false;
        this.cancelRequested = false;
        this.maxSteps = 20;
    }

    /**
     * Parse LLM response for tool calls.
     * Looks for blocks like:
     * ```tool
     * {"name": "namespace.method", "args": {...}}
     * ```
     */
    parseToolCalls(text) {
        return parseToolCalls(text);
    }

    /**
     * Execute a sequence of tool calls as a single transaction.
     * If any step fails, it attempts to rollback previous steps.
     */
    async executeWorkflow(calls, workflowId = `workflow_${Date.now()}`) {
        if (this.isExecuting) return { success: false, error: "Already executing a workflow" };
        if (!Array.isArray(calls) || calls.length > this.maxSteps) {
            return { success: false, error: `Workflow must contain at most ${this.maxSteps} steps` };
        }
        this.isExecuting = true;
        this.cancelRequested = false;

        const results = [];
        const executedActions = [];

        try {
            for (let index = 0; index < calls.length; index++) {
                const call = calls[index];
                if (this.cancelRequested) throw Object.assign(new Error('Workflow cancelled'), { code: 'CANCELLED' });
                this.eventBus.emit('ai:workflow:step', { name: call.name, args: call.args });
                
                const response = await this.registry.execute(call.name, call.args, call.id || `${workflowId}:${index}`);
                
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

    cancel() {
        if (!this.isExecuting) return false;
        this.cancelRequested = true;
        return true;
    }

    /**
     * Rollback a list of actions in reverse order.
     */
    async rollback(actions) {
        // Rollback in reverse order
        for (let i = actions.length - 1; i >= 0; i--) {
            const action = actions[i];
            const tool = this.registry.tools.get(action.name);
            
            const descriptor = action.result?.undoDescriptor;
            if (descriptor?.type === 'restore-file') {
                try {
                    console.log(`[WorkflowManager] Rolling back: ${action.name}`);
                    const endpoint = descriptor.existed ? '/api/ide/write' : '/api/ide/delete';
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-RedGlitch-Automation': 'kai' },
                        body: JSON.stringify({ file: descriptor.path, content: descriptor.previousContent })
                    });
                    if (!response.ok) throw new Error(`Rollback request failed (${response.status})`);
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
