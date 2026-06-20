function parseJsonSequence(source) {
    const values = [];
    let start = -1;
    let depth = 0;
    let quote = false;
    let escaped = false;

    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quote = false;
            continue;
        }
        if (char === '"') {
            quote = true;
            continue;
        }
        if (char === '{' || char === '[') {
            if (depth === 0) start = index;
            depth++;
        } else if (char === '}' || char === ']') {
            depth--;
            if (depth === 0 && start >= 0) {
                try {
                    values.push(JSON.parse(source.slice(start, index + 1)));
                } catch (error) {
                    console.warn('[ToolCallParser] Ignoring malformed JSON value:', error.message);
                }
                start = -1;
            }
        }
    }
    return values;
}

function flattenCalls(value) {
    if (Array.isArray(value)) return value.flatMap(flattenCalls);
    if (value && Array.isArray(value.calls)) return value.calls.flatMap(flattenCalls);
    if (!value || typeof value !== 'object' || typeof value.name !== 'string') return [];
    return [{ id: value.id, name: value.name, args: value.args && typeof value.args === 'object' ? value.args : {} }];
}

export function parseToolCalls(text) {
    if (typeof text !== 'string') return [];
    const calls = [];
    const fences = /```tool\b\s*([\s\S]*?)```/gi;
    let match;
    while ((match = fences.exec(text)) !== null) {
        calls.push(...parseJsonSequence(match[1]).flatMap(flattenCalls));
    }
    return calls;
}

export function stripToolBlocks(text) {
    return String(text || '').replace(/```tool\b\s*[\s\S]*?```/gi, '').trim();
}
