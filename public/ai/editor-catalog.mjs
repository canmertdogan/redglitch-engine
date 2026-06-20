export const EDITOR_CATALOG = Object.freeze({
    world: { id: 'editor', file: 'editor.html', capabilities: ['world'] },
    pixel: { id: 'iso_studio', file: 'iso_editor.html', capabilities: ['pixel', 'isopixel', 'iso'] },
    platformer: { id: 'platformer_studio', file: 'platformer_editor.html', capabilities: ['platformer'] },
    code: { id: 'script', file: 'script_editor.html', capabilities: ['code'] },
    logic: { id: 'algorithm', file: 'algorithm_editor.html', capabilities: ['logic', 'algorithm'] },
    asset: { id: 'asset-manager', file: 'asset_manager.html', capabilities: ['asset'] }
});

export function editorForTool(toolName) {
    const namespace = String(toolName || '').split('.')[0];
    return Object.values(EDITOR_CATALOG).find((entry) => entry.capabilities.includes(namespace)) || null;
}
