const EDITOR_CATALOG = Object.freeze({
    world: { id: 'editor', file: 'editor.html', capabilities: ['world', 'worldbuilder', 'topdown', 'rpg'] },
    studio_3d: { id: 'studio_3d', file: 'editor3d.html', capabilities: ['3d', 'studio3d', 'studio_3d', 'editor3d'] },
    pixel: { id: 'iso_studio', file: 'iso_editor.html', capabilities: ['pixel', 'isopixel', 'iso'] },
    platformer: { id: 'platformer_studio', file: 'platformer_editor.html', capabilities: ['platformer', 'platform'] },
    code: { id: 'script', file: 'script_editor.html', capabilities: ['code', 'codeforge', 'script'] },
    logic: { id: 'algorithm', file: 'algorithm_editor.html', capabilities: ['logic', 'algorithm'] },
    asset: { id: 'asset_manager', file: 'asset_manager.html', capabilities: ['asset', 'assets'] },
    daw: { id: 'daw', file: 'daw.html', capabilities: ['daw', 'audio'] },
    quest: { id: 'quest', file: 'quest_editor.html', capabilities: ['quest', 'quests'] },
    npc: { id: 'npc', file: 'npc_editor.html', capabilities: ['npc'] },
    dialogue: { id: 'dialogue', file: 'dialogue_editor.html', capabilities: ['dialogue'] },
    cutscene: { id: 'cutscene', file: 'interactive_cutscene_editor.html', capabilities: ['cutscene', 'interactive_cutscene'] },
    fx: { id: 'fx', file: 'fx_editor.html', capabilities: ['fx', 'fxpro'] },
    shader: { id: 'shader', file: 'shader_lab.html', capabilities: ['shader'] },
    prefab: { id: 'prefab', file: 'prefab_editor.html', capabilities: ['prefab'] },
    ui_designer: { id: 'ui_designer', file: 'studio-dist/ui_designer.html', capabilities: ['ui', 'ui_designer'] }
});

export function editorForTool(toolName) {
    const namespace = String(toolName || '').split('.')[0].toLowerCase();
    if (!namespace) return null;
    return Object.values(EDITOR_CATALOG).find((entry) => entry.capabilities.includes(namespace)) || null;
}
