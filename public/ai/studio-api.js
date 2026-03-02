/**
 * studio-api.js
 * Exposes Studio controls to the AI Cortex — Creator API for all engine types.
 */

window.IrabStudioAPI = {
    // 1. Navigation
    openTool(toolId) {
        console.log(`[IrabAPI] AI requesting to open tool: ${toolId}`);
        if (window.openWindow && window.tools) {
            const tool = window.tools.find(t => t.id === toolId);
            if (tool) {
                window.openWindow(tool);
                return `Opened ${tool.title}`;
            }
        }
        return `Tool ${toolId} not found.`;
    },

    // 2. Platformer Level Generation
    // Themes: flow, spire, abyss, gauntlet, clockwork  |  Difficulty: 1-10
    generatePlatformer(theme = 'flow', difficulty = 5) {
        console.log(`[IrabAPI] AI requesting platformer generation: ${theme} (difficulty ${difficulty})`);
        const frame = document.getElementById('frame-platformer_studio');
        if (frame && frame.contentWindow.editor) {
            const editor = frame.contentWindow.editor;
            const themeSel = frame.contentDocument.getElementById('gen-theme');
            const diffInput = frame.contentDocument.getElementById('gen-complexity');
            if (themeSel) themeSel.value = theme;
            if (diffInput) diffInput.value = difficulty;
            editor.generateLevel();
            return `Generated ${theme} platformer level (difficulty ${difficulty}).`;
        }
        return "Platformer Studio must be open to generate levels.";
    },

    // 3. Isometric Terrain Generation
    // Modes: terrain (Standard), islands (Floating Islands), maze (Stone Maze), flat (Flat World)
    generateIsometric(mode = 'terrain', opts = {}) {
        console.log(`[IrabAPI] AI requesting isometric generation: ${mode}`);
        const frame = document.getElementById('frame-iso_studio');
        if (frame && frame.contentWindow) {
            const doc = frame.contentDocument;
            const modeSel = doc.getElementById('gen-mode');
            if (modeSel) modeSel.value = mode;
            if (opts.scale) { const el = doc.getElementById('gen-scale'); if (el) el.value = opts.scale; }
            if (opts.amplitude) { const el = doc.getElementById('gen-amp'); if (el) el.value = opts.amplitude; }
            if (opts.seaLevel !== undefined) { const el = doc.getElementById('gen-sea'); if (el) el.value = opts.seaLevel; }
            if (typeof frame.contentWindow.runGenerator === 'function') {
                frame.contentWindow.runGenerator();
                return `Generated ${mode} isometric terrain.`;
            }
        }
        return "IsoPixel Studio must be open to generate terrain.";
    },

    // 4. Top-Down RPG Map Generation
    // Types: village, dungeon, hell, heaven, lab  |  Density: 1-10
    generateTopdown(type = 'village', density = 5, seed = '') {
        console.log(`[IrabAPI] AI requesting topdown generation: ${type} (density ${density})`);
        const frame = document.getElementById('frame-editor');
        if (frame && frame.contentWindow) {
            const doc = frame.contentDocument;
            const typeSel = doc.getElementById('gen-type');
            const densityInput = doc.getElementById('gen-density');
            const seedInput = doc.getElementById('gen-seed');
            if (typeSel) typeSel.value = type;
            if (densityInput) densityInput.value = density;
            if (seedInput) seedInput.value = seed || '';
            if (typeof frame.contentWindow.generateMap === 'function') {
                frame.contentWindow.generateMap();
                return `Generated ${type} top-down map (density ${density}).`;
            }
        }
        return "World Editor must be open to generate maps.";
    },

    // 5. UI Feedback
    nudge() {
        if (window.IRAB && window.IRAB.nudge) {
            window.IRAB.nudge();
            return "Nudged the user.";
        }
        return "UI not ready for nudge.";
    },

    // 6. Project Info
    async getProjectSummary() {
        try {
            const res = await fetch('/api/projects/current');
            const data = await res.json();
            return JSON.stringify(data);
        } catch(e) { return "Error fetching project info."; }
    },

    // 7. Code Context
    getActiveCode() {
        const frame = document.getElementById('frame-script');
        if (frame && frame.contentWindow.editor) {
            const monaco = frame.contentWindow.monacoEditor;
            if (monaco) {
                const selection = monaco.getSelection();
                const model = monaco.getModel();
                if (selection && !selection.isEmpty()) {
                    return model.getValueInRange(selection);
                }
                return model.getValue();
            }
        }
        return null;
    },

    // 8. Code Injection
    injectCode(code) {
        console.log("[IrabAPI] AI requesting code injection...");
        const frame = document.getElementById('frame-script');
        if (frame && frame.contentWindow.monacoEditor) {
            const monaco = frame.contentWindow.monacoEditor;
            const selection = monaco.getSelection();
            const id = { major: 1, minor: 1 };
            const text = code;
            const op = { range: selection, text: text, forceMoveMarkers: true };
            monaco.executeEdits("irab-assistant", [op]);
            return "Code injected at cursor.";
        }
        return "Script Editor must be open to inject code.";
    },

    // 9. Generator capability queries
    getGeneratorOptions(engineType) {
        const options = {
            'iso-pixel': {
                modes: ['terrain', 'islands', 'maze', 'flat'],
                labels: { terrain: 'Standard Terrain', islands: 'Floating Islands', maze: 'Stone Maze', flat: 'Flat World' },
                params: ['scale', 'amplitude', 'seaLevel', 'offset', 'bottomZ']
            },
            'platformer-2d': {
                themes: ['flow', 'spire', 'abyss', 'gauntlet', 'clockwork'],
                labels: { flow: 'The Flow (Speed)', spire: 'The Spire (Vertical)', abyss: 'The Abyss (Precision)', gauntlet: 'The Gauntlet (Combat)', clockwork: 'The Clockwork (Puzzle)' },
                params: ['difficulty']
            },
            'rpg-topdown': {
                types: ['village', 'dungeon', 'hell', 'heaven', 'lab'],
                labels: { village: 'Village', dungeon: 'Dungeon', hell: 'Hellscape', heaven: 'Sky Islands', lab: 'Lab' },
                params: ['density', 'seed']
            }
        };
        return engineType ? options[engineType] : options;
    },

    // Legacy alias
    generateParkour: function(theme, difficulty) { return this.generatePlatformer(theme, difficulty); },

    // Handlers for UI commands
    wink() { return "Wink played."; },
    showAsset(path) { return `Asset shown: ${path}`; }
};

// Listen for commands from the bridge
window.addEventListener('load', () => {
    const api = window.IrabStudioAPI;
    
    if (window.irab) {
        window.irab.onCommand = async (cmd) => {
            const { action, params } = cmd;
            if (api[action]) {
                const result = await api[action](...(params || []));
                console.log(`[IrabAPI] Action Result: ${result}`);
                // Feed result back to AI
                window.irab.send({ type: "TOOL_RESULT", data: result });
            } else {
                console.warn(`[IrabAPI] Unknown action: ${action}`);
            }
        };
    }
});
