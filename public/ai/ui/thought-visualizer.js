/**
 * Ketebe AI - Thought Visualizer (Phase 9)
 * Provides visual feedback, ghost previews, and voice feedback for AI actions.
 */

export class ThoughtVisualizer {
    constructor(eventBus = null) {
        this.eventBus = eventBus || window.KetebeEventBus;
        this.voiceEnabled = false; // TTS disabled as requested
        this.setupListeners();
    }

    setupListeners() {
        if (!this.eventBus) return;

        // Listen for tool execution start
        this.eventBus.on('studio:action:execute', (event) => {
            if (!event || !event.data) return;
            const data = event.data;
            this.visualizeIntent(data.method, data.params);
        });

        // Listen for tool success
        this.eventBus.on('ai:tool:success', (event) => {
            const data = event.data;
            this.clearVisuals();
            if (data && data.name) this.speak(`Done. I've finished the ${data.name} task.`);
        });

        // Listen for tool error
        this.eventBus.on('ai:tool:error', (event) => {
            const data = event.data;
            this.clearVisuals();
            if (data && data.name) this.speak(`Oops. I couldn't complete the ${data.name} task. ${data.error}`);
        });

        // Listen for workflow steps
        this.eventBus.on('ai:workflow:step', (event) => {
            if (!event || !event.data) return;
            const data = event.data;
            this.showProgressMessage(`Executing: ${data.name}...`);
        });

        // Listen for workflow completion
        this.eventBus.on('ai:workflow:complete', (event) => {
            if (!event || !event.data) return;
            const data = event.data;
            if (data.success) {
                this.showProgressMessage(`Ready.`);
                this.speak(`Excellent. I've finished the sequence of ${data.count} actions.`);
            } else {
                this.showProgressMessage(`Error.`);
                this.speak(`Grrr. Something went wrong during the workflow. ${data.error}`);
            }
        });
    }

    /**
     * Show ghost indicators in the active editor.
     */
    visualizeIntent(method, params) {
        if (!method || !params) return;
        console.log(`[ThoughtVisualizer] Visualizing intent: ${method}`, params);
        
        // Emit visual intent events that editors can pick up
        if (method.startsWith('pixel.') || method.startsWith('world.')) {
            this.eventBus.emit('studio:visual:ghost', { 
                type: 'placement', 
                x: params.x, 
                y: params.y, 
                z: params.z || 0,
                method 
            });
        } else if (method.startsWith('code.') || method.startsWith('editor.')) {
            this.eventBus.emit('studio:visual:highlight', { 
                type: 'code', 
                line: params.line,
                range: params.range 
            });
        }
    }

    /**
     * Clear all active visual indicators.
     */
    clearVisuals() {
        this.eventBus.emit('studio:visual:clear');
    }

    /**
     * Voice feedback using Web Speech API.
     */
    speak(text) {
        if (!this.voiceEnabled || !window.speechSynthesis) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        utterance.pitch = 0.9; // Slightly lower for IRAB's "grrr" personality
        
        // Try to find a robotic or deep voice
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Robot'));
        if (preferredVoice) utterance.voice = preferredVoice;

        window.speechSynthesis.speak(utterance);
    }

    /**
     * Show a temporary progress message in the HUD.
     */
    showProgressMessage(text) {
        const hud = document.getElementById('irab-status-text');
        if (hud) {
            hud.textContent = text;
            hud.style.color = '#f1c40f'; // Gold
        }
    }
}

// Global export
if (typeof window !== 'undefined') {
    window.ThoughtVisualizer = ThoughtVisualizer;
}
