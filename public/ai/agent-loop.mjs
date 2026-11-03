export async function runAgentLoop({
    initialResponse,
    parseToolCalls,
    executeWorkflow,
    inferNext,
    getToolPrompt,
    sanitize = (value) => value,
    stripToolBlocks = (value) => value,
    maxTurns = 8,
    workflowId = `agent_${Date.now()}`
}) {
    let current = initialResponse;
    const allToolCalls = [];
    const workflowResults = [];
    for (let turn = 0; turn < maxTurns; turn++) {
        const toolCalls = parseToolCalls(current.text);
        if (toolCalls.length === 0) {
            return {
                ...current,
                text: stripToolBlocks(current.text),
                toolCalls: allToolCalls,
                workflowResults,
                workflowResult: workflowResults.at(-1) || null,
                steps: turn + 1
            };
        }
        allToolCalls.push(...toolCalls);
        let workflowResult;
        try {
            workflowResult = await executeWorkflow(toolCalls, `${workflowId}_${turn}`);
        } catch (error) {
            return {
                ...current,
                text: `${stripToolBlocks(current.text)}\n\nAutomation stopped: workflow failed: ${error.message}`.trim(),
                toolCalls: allToolCalls,
                workflowResults,
                workflowResult: null,
                steps: turn + 1,
                error: { code: 'WORKFLOW_ERROR', message: error.message }
            };
        }
        workflowResults.push(workflowResult);
        if (!workflowResult.success) {
            return {
                ...current,
                text: `${stripToolBlocks(current.text)}\n\nAutomation stopped: ${workflowResult.error}`.trim(),
                toolCalls: allToolCalls,
                workflowResults,
                workflowResult,
                steps: turn + 1
            };
        }
        const feedback = `TOOL_RESULTS (authoritative):\n${JSON.stringify(sanitize({ calls: toolCalls, ...workflowResult }))}\n\nAVAILABLE_TOOLS_NOW:\n${getToolPrompt()}\n\nContinue the task. Navigation alone is not completion. Use another tool call if work remains; otherwise give the user a concise completion summary.`;
        let nextResponse;
        try {
            nextResponse = await inferNext({ feedback, assistantText: current.text, workflowResult, toolCalls, turn });
        } catch (error) {
            return {
                ...current,
                text: `${stripToolBlocks(current.text)}\n\nAutomation stopped: inference failed: ${error.message}`.trim(),
                toolCalls: allToolCalls,
                workflowResults,
                workflowResult,
                steps: turn + 1,
                error: { code: 'INFERENCE_ERROR', message: error.message }
            };
        }
        current = nextResponse;
    }
    return {
        ...current,
        text: `${stripToolBlocks(current.text)}\n\nAutomation stopped after ${maxTurns} turns to prevent an infinite loop.`.trim(),
        toolCalls: allToolCalls,
        workflowResults,
        workflowResult: workflowResults.at(-1) || null,
        error: { code: 'MAX_AGENT_TURNS', message: `Exceeded ${maxTurns} agent turns.` }
    };
}
