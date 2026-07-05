import { parseToolCalls } from './tool-call-parser.mjs';
import { ERROR_CODE } from './automation-contract.mjs';

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
        let failedStep = null;

        try {
            for (let index = 0; index < calls.length; index++) {
                const call = calls[index];
                if (this.cancelRequested) throw Object.assign(new Error('Workflow cancelled'), { code: 'CANCELLED' });
                this.eventBus?.emit('ai:workflow:step', { index, name: call.name, args: call.args });
                
                const response = await this.registry.execute(call.name, call.args, call.id || `${workflowId}:${index}`);
                
                if (!response.success) {
                    failedStep = {
                        index,
                        name: call.name,
                        args: call.args,
                        error: response.error || { code: ERROR_CODE.EXECUTION_FAILED, message: 'Unknown error' },
                        response
                    };
                    const error = new Error(`Step failed: ${call.name} - ${failedStep.error.message}`);
                    error.code = failedStep.error.code || ERROR_CODE.EXECUTION_FAILED;
                    throw error;
                }

                results.push(response.result);
                executedActions.push({ name: call.name, args: call.args, result: response.result });
            }

            this.isExecuting = false;
            const successResult = { success: true, results, count: calls.length };
            this.eventBus?.emit('ai:workflow:complete', successResult);
            return successResult;

        } catch (error) {
            console.error("[WorkflowManager] Workflow failed. Rolling back...", error);
            const rollbackResults = await this.rollback(executedActions);
            this.isExecuting = false;
            const failureResult = {
                success: false,
                error: error.message,
                errorCode: error.code || ERROR_CODE.EXECUTION_FAILED,
                failedStep,
                results,
                rollbackResults
            };
            this.eventBus?.emit('ai:workflow:complete', failureResult);
            return failureResult;
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
        const rollbackResults = [];
        // Rollback in reverse order
        for (let i = actions.length - 1; i >= 0; i--) {
            const action = actions[i];
            const descriptor = action.result?.undoDescriptor;
            if (!descriptor) {
                const warning = `No undo descriptor for ${action.name}. Manual cleanup may be required.`;
                console.warn(`[WorkflowManager] ${warning}`);
                rollbackResults.push({ action: action.name, success: false, skipped: true, error: warning });
                continue;
            }

            try {
                console.log(`[WorkflowManager] Rolling back: ${action.name}`);
                const request = this._rollbackRequestForDescriptor(descriptor);
                if (!request) {
                    const warning = `Unsupported undo descriptor: ${descriptor.type}`;
                    console.warn(`[WorkflowManager] ${warning}`);
                    rollbackResults.push({ action: action.name, success: false, skipped: true, error: warning, descriptor });
                    continue;
                }

                const response = await fetch(request.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-RedGlitch-Automation': 'kai' },
                    body: JSON.stringify(request.body)
                });
                if (!response.ok) throw new Error(`Rollback request failed (${response.status})`);
                rollbackResults.push({ action: action.name, success: true, descriptor });
            } catch (undoError) {
                console.error(`[WorkflowManager] Rollback failed for ${action.name}:`, undoError);
                rollbackResults.push({ action: action.name, success: false, error: undoError.message, descriptor });
            }
        }
        return rollbackResults;
    }

    _rollbackRequestForDescriptor(descriptor) {
        if (descriptor.type === 'delete-file') {
            return { endpoint: '/api/ide/delete', body: { file: descriptor.path } };
        }
        if (descriptor.type === 'restore-file') {
            if (descriptor.existed) {
                return {
                    endpoint: '/api/ide/write',
                    body: { file: descriptor.path, content: descriptor.previousContent || '' }
                };
            } else {
                return { endpoint: '/api/ide/delete', body: { file: descriptor.path } };
            }
        }
        return null;
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
