/**
 * studio-api.js
 * Exposes Studio controls to the AI Cortex.
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

    // 2. Editor Interaction (Platformer)
    generateParkour(theme = 'flow', difficulty = 5) {
        console.log(`[IrabAPI] AI requesting parkour generation: ${theme}`);
        // Find the platformer editor window if open
        const frame = document.getElementById('frame-platformer_studio');
        if (frame && frame.contentWindow.editor) {
            const editor = frame.contentWindow.editor;
            // Set values in the editor UI
            const themeSel = frame.contentDocument.getElementById('gen-theme');
            const diffInput = frame.contentDocument.getElementById('gen-complexity');
            if (themeSel) themeSel.value = theme;
            if (diffInput) diffInput.value = difficulty;
            
            editor.generateLevel();
            return `Generated ${theme} parkour for you!`;
        }
        return "Platformer Studio must be open to generate parkour.";
    },

    // 3. UI Feedback
    nudge() {
        if (window.IRAB && window.IRAB.nudge) {
            window.IRAB.nudge();
            return "Nudged the user.";
        }
        return "UI not ready for nudge.";
    },

    // 4. Project Info
    async getProjectSummary() {
        try {
            const res = await fetch('/api/projects/current');
            const data = await res.json();
            return JSON.stringify(data);
        } catch(e) { return "Error fetching project info."; }
    },

    // 5. Code Context
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

    // 6. Code Injection
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

    // 7. Handlers for UI commands (to prevent warnings)
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
