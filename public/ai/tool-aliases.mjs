export const EDITOR_TARGETS = Object.freeze({
    dashboard: 'dashboard.html',
    project_dashboard: 'project_dashboard.html',
    editor: 'editor.html',
    iso_studio: 'iso_editor.html',
    platformer_studio: 'platformer_editor.html',
    script: 'script_editor.html',
    asset_manager: 'asset_manager.html',
    npc: 'npc_editor.html',
    enemy: 'enemy_editor.html',
    item: 'item_editor.html',
    quest: 'quest_editor.html',
    dialogue: 'dialogue_editor.html',
    character: 'character_editor.html',
    skill: 'skill_editor.html',
    achievements: 'achievements_editor.html',
    cutscene: 'interactive_cutscene_editor.html',
    campaign: 'campaign_editor.html',
    menu: 'menu_editor.html',
    logic: 'logic_editor.html',
    algorithm: 'algorithm_editor.html',
    behavior: 'behavior_editor.html',
    prefab: 'prefab_editor.html',
    localization: 'localization_editor.html',
    pixel: 'pixel_editor.html',
    fx: 'fx_editor.html',
    background: 'background_editor.html',
    shader: 'shader_lab.html',
    input: 'input_editor.html',
});

export const EDITOR_ALIASES = Object.freeze({
    achievement: 'achievements',
    achievements_editor: 'achievements',
    asset: 'asset_manager',
    'asset-manager': 'asset_manager',
    asset_manager: 'asset_manager',
    assets: 'asset_manager',
    code: 'script',
    code_forge: 'script',
    cutscenes: 'cutscene',
    isometric: 'iso_studio',
    isometricstudio: 'iso_studio',
    iso: 'iso_studio',
    'iso-pixel': 'iso_studio',
    isopixel: 'iso_studio',
    isopixelstudio: 'iso_studio',
    'isopixel studio': 'iso_studio',
    isostudio: 'iso_studio',
    level_editor: 'editor',
    rpg: 'editor',
    rpg_studio: 'editor',
    topdown: 'editor',
    topdown_studio: 'editor',
    world: 'editor',
    platform: 'platformer_studio',
    platformer: 'platformer_studio',
    platformerstudio: 'platformer_studio',
    sidescroller: 'platformer_studio',
    algorithm_studio: 'algorithm',
});

export function normalizeEditorTarget(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    return EDITOR_ALIASES[raw] || raw;
}

export function editorFileForTarget(value) {
    const target = normalizeEditorTarget(value);
    return EDITOR_TARGETS[target] || null;
}

export function editorTargetIds() {
    return Object.keys(EDITOR_TARGETS);
}
