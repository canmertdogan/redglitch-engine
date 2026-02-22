/**
 * public/ai/ketebe-ai-assistant.js
 * Compatibility layer for the Kai UI to interface with the KetebeAI engine.
 */

// We assume KetebeAIInstance is available globally via ketebe-ai.js

class IRABAssistantSimple {
    constructor() {
        this.ai = window.KetebeAIInstance || null;
        
        // Ensure personality is loaded
        if (typeof window.IRABPersonality !== 'undefined') {
            this.personality = new window.IRABPersonality();
        } else {
            console.warn('Kai: Personality module not found, using fallback.');
            this.personality = {
                name: 'Kai',
                getRandomGreeting: () => "SYSTEM ONLINE.",
                addFlavor: (text) => text,
                getThinkingMessage: () => "PROCESSING..."
            };
        }

        this.editorTools = {
            openFile: async (path) => {
                console.log('Kai: Opening file', path);
                return { success: true };
            }
        };
    }

    setProgressCallback(callback) {
        // Hook into KetebeAI's event bus for progress updates if available
        if (this.ai && this.ai.inferenceEngine && this.ai.inferenceEngine.isModelReady) {
            callback({ percent: 100, status: 'ready' });
        }
    }

    async waitForCore(timeout = 5000) {
        if (this.ai) return this.ai;
        if (window.KetebeAIInstance) {
            this.ai = window.KetebeAIInstance;
            return this.ai;
        }

        console.log('Kai: Waiting for AI Core...');
        const start = Date.now();
        while (!window.KetebeAIInstance) {
            if (Date.now() - start > timeout) {
                console.error("Kai: Core wait timeout.");
                throw new Error("AI Core Connection Failed");
            }
            await new Promise(r => setTimeout(r, 100));
        }
        
        this.ai = window.KetebeAIInstance;
        return this.ai;
    }

    async processQuery(query) {
        try {
            await this.waitForCore();

            // Use KetebeAI's chat method
            const response = await this.ai.chat(query, {
                // We can support streaming here if the UI supports it
            });

            // Handle different response structures
            let text = "";
            if (typeof response === 'string') text = response;
            else if (response.text) text = response.text;
            else text = JSON.stringify(response);

            // Apply personality flavor
            if (this.personality && this.personality.addFlavor) {
                if (!text.startsWith(">>") && !text.startsWith("[SUCCESS]")) {
                     text = this.personality.addFlavor(text, 'answer');
                }
            }

            return {
                text: text,
                type: 'text'
            };

        } catch (error) {
            console.error('Kai: Process Query Failed', error);
            throw error;
        }
    }
}

// Expose globally
window.IRABAssistantSimple = IRABAssistantSimple;
console.log('Kai: Assistant Compatibility Layer Loaded.');
