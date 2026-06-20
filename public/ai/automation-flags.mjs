const DEFAULTS = Object.freeze({
    contractValidation: true,
    strictDuplicates: true,
    approvalFirstMutations: true,
    explicitCapabilityRouting: true,
    correlatedEditorResults: true
});

export function getAutomationFlags(storage = globalThis.localStorage) {
    try {
        const overrides = JSON.parse(storage?.getItem('kai_automation_flags') || '{}');
        return {
            ...DEFAULTS,
            ...(overrides && typeof overrides === 'object' ? overrides : {}),
            contractValidation: true,
            strictDuplicates: true,
            approvalFirstMutations: true,
            correlatedEditorResults: true
        };
    } catch (_) {
        return { ...DEFAULTS };
    }
}

export { DEFAULTS as AUTOMATION_FLAG_DEFAULTS };
