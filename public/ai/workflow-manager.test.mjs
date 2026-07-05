import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowManager } from './workflow-manager.js';
import { ERROR_CODE } from './automation-contract.mjs';

class FakeEventBus {
    constructor() {
        this.events = [];
    }

    emit(type, data) {
        this.events.push({ type, data });
    }
}

function installFetchRecorder(responses = [{ ok: true }]) {
    const calls = [];
    globalThis.fetch = async (endpoint, options = {}) => {
        calls.push({
            endpoint,
            method: options.method,
            body: options.body ? JSON.parse(options.body) : null,
            headers: options.headers || {},
        });
        return responses.shift() || { ok: true };
    };
    return calls;
}

async function withQuietWorkflowLogs(task) {
    const original = {
        error: console.error,
        log: console.log,
        warn: console.warn,
    };
    console.error = () => {};
    console.log = () => {};
    console.warn = () => {};
    try {
        return await task();
    } finally {
        console.error = original.error;
        console.log = original.log;
        console.warn = original.warn;
    }
}

test('executeWorkflow returns structured failure details and rolls back prior actions', async () => {
    const eventBus = new FakeEventBus();
    const fetchCalls = installFetchRecorder();
    const registry = {
        execute: async (name) => {
            if (name === 'fs.write') {
                return {
                    success: true,
                    result: {
                        path: 'scripts/generated.js',
                        undoDescriptor: {
                            type: 'restore-file',
                            path: 'scripts/generated.js',
                            existed: false,
                            previousContent: null,
                        },
                    },
                };
            }
            return {
                success: false,
                error: { code: ERROR_CODE.TOOL_TIMEOUT, message: 'Tool execution timed out: npc.create' },
            };
        },
    };

    const manager = new WorkflowManager(registry, eventBus);
    const result = await withQuietWorkflowLogs(() => manager.executeWorkflow([
        { name: 'fs.write', args: { path: 'scripts/generated.js', content: 'export {};' } },
        { name: 'npc.create', args: { id: 'slow_npc' } },
    ], 'workflow-guard'));

    assert.equal(result.success, false);
    assert.equal(result.errorCode, ERROR_CODE.TOOL_TIMEOUT);
    assert.equal(result.failedStep.index, 1);
    assert.equal(result.failedStep.name, 'npc.create');
    assert.equal(result.rollbackResults.length, 1);
    assert.equal(result.rollbackResults[0].success, true);
    assert.deepEqual(fetchCalls.map((call) => ({ endpoint: call.endpoint, method: call.method, body: call.body })), [
        {
            endpoint: '/api/ide/delete',
            method: 'POST',
            body: { file: 'scripts/generated.js' },
        },
    ]);

    const completeEvent = eventBus.events.find((event) => event.type === 'ai:workflow:complete');
    assert.equal(completeEvent.data.success, false);
    assert.equal(completeEvent.data.failedStep.name, 'npc.create');
});

test('rollback restores existing files and deletes created files in reverse order', async () => {
    const fetchCalls = installFetchRecorder();
    const manager = new WorkflowManager({ execute: async () => ({ success: true }) }, new FakeEventBus());

    const rollbackResults = await withQuietWorkflowLogs(() => manager.rollback([
        {
            name: 'fs.write',
            result: {
                undoDescriptor: {
                    type: 'restore-file',
                    path: 'existing.txt',
                    existed: true,
                    previousContent: 'before',
                },
            },
        },
        {
            name: 'fs.create_file',
            result: {
                undoDescriptor: {
                    type: 'delete-file',
                    path: 'created.txt',
                },
            },
        },
    ]));

    assert.deepEqual(rollbackResults.map((entry) => entry.success), [true, true]);
    assert.deepEqual(fetchCalls.map((call) => ({ endpoint: call.endpoint, body: call.body })), [
        { endpoint: '/api/ide/delete', body: { file: 'created.txt' } },
        { endpoint: '/api/ide/write', body: { file: 'existing.txt', content: 'before' } },
    ]);
});
