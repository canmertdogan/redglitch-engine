const KAP_VERSION = '1.0';

export const ACTION_STATUS = Object.freeze({
    PLANNED: 'planned',
    AWAITING_APPROVAL: 'awaiting_approval',
    RUNNING: 'running',
    PENDING_EDITOR: 'pending_editor',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    ROLLED_BACK: 'rolled_back'
});

export const ERROR_CODE = Object.freeze({
    INVALID_TOOL_DEFINITION: 'INVALID_TOOL_DEFINITION',
    DUPLICATE_TOOL: 'DUPLICATE_TOOL',
    UNKNOWN_TOOL: 'UNKNOWN_TOOL',
    INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    EDITOR_UNAVAILABLE: 'EDITOR_UNAVAILABLE',
    EDITOR_TIMEOUT: 'EDITOR_TIMEOUT',
    TOOL_TIMEOUT: 'TOOL_TIMEOUT',
    EXECUTION_FAILED: 'EXECUTION_FAILED',
    CANCELLED: 'CANCELLED'
});

const TYPE_CHECKS = {
    array: Array.isArray,
    boolean: (value) => typeof value === 'boolean',
    integer: (value) => Number.isInteger(value),
    number: (value) => typeof value === 'number' && Number.isFinite(value),
    object: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    string: (value) => typeof value === 'string'
};

export function validateSchema(schema, value, path = '$') {
    if (!schema || typeof schema !== 'object') return [];
    const errors = [];
    if (schema.type && TYPE_CHECKS[schema.type] && !TYPE_CHECKS[schema.type](value)) {
        return [`${path} must be ${schema.type}`];
    }
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
    if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const key of schema.required || []) {
            if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key} is required`);
        }
        for (const [key, child] of Object.entries(schema.properties || {})) {
            if (Object.prototype.hasOwnProperty.call(value, key)) errors.push(...validateSchema(child, value[key], `${path}.${key}`));
        }
        if (schema.additionalProperties === false) {
            for (const key of Object.keys(value)) {
                if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) errors.push(`${path}.${key} is not allowed`);
            }
        }
    }
    if (schema.type === 'array' && Array.isArray(value)) {
        value.forEach((item, index) => errors.push(...validateSchema(schema.items, item, `${path}[${index}]`)));
    }
    return errors;
}

export function normalizeToolDefinition(tool) {
    if (!tool || typeof tool !== 'object' || !tool.name || !tool.description) {
        throw Object.assign(new Error('Tool definitions require a name and description.'), { code: ERROR_CODE.INVALID_TOOL_DEFINITION });
    }
    const risk = tool.risk || (tool.securityLevel === 'safe' ? 'read' : tool.securityLevel === 'low-risk' ? 'low' : 'high');
    const mutates = tool.mutates ?? (risk !== 'read');
    return {
        version: KAP_VERSION,
        inputSchema: tool.inputSchema || tool.parameters || { type: 'object', properties: {} },
        outputSchema: tool.outputSchema || { type: 'object' },
        risk,
        mutates,
        mutationScope: tool.mutationScope || (mutates ? 'project' : 'none'),
        previewSupport: tool.previewSupport ?? mutates,
        undoSupport: tool.undoSupport ?? Boolean(tool.undo),
        timeout: tool.timeout || 15000,
        ...tool
    };
}

export function createActionPlan(tool, args) {
    if (typeof tool.preview === 'function') return tool.preview(args);
    return {
        summary: `${tool.name} will ${tool.mutates ? 'modify' : 'inspect'} ${tool.mutationScope || 'project state'}.`,
        affectedResources: [args?.path || args?.filePath || args?.file].filter(Boolean),
        proposed: args,
        warnings: tool.undoSupport ? [] : (tool.mutates ? ['This action does not advertise undo support.'] : []),
        rollbackAvailable: Boolean(tool.undoSupport)
    };
}

export function normalizeArguments(tool, args) {
    const normalized = args && typeof args === 'object' && !Array.isArray(args) ? { ...args } : {};
    for (const [alias, canonical] of Object.entries(tool?.argumentAliases || {})) {
        if (normalized[canonical] === undefined && normalized[alias] !== undefined) normalized[canonical] = normalized[alias];
        delete normalized[alias];
    }
    return normalized;
}
