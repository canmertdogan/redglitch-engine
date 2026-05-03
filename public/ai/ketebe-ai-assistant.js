/**
 * public/ai/ketebe-ai-assistant.js
 * Compatibility layer for the Kai UI to interface with the VortexAI engine.
 */

// We assume VortexAIInstance is available globally via ketebe-ai.js

class IRABAssistantSimple {
    constructor() {
        this.ai = window.VortexAIInstance || (window.parent && window.parent.VortexAIInstance) || null;
        
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
        // Hook into VortexAI's event bus for progress updates if available
        if (this.ai && this.ai.inferenceEngine && this.ai.inferenceEngine.isModelReady) {
            callback({ percent: 100, status: 'ready' });
        }
    }

    async waitForCore(timeout = 5000) {
        if (this.ai) return this.ai;
        if (window.VortexAIInstance) {
            this.ai = window.VortexAIInstance;
            return this.ai;
        }
        if (window.parent && window.parent.VortexAIInstance) {
            this.ai = window.parent.VortexAIInstance;
            return this.ai;
        }

        console.log('Kai: Waiting for AI Core...');
        const start = Date.now();
        while (!window.VortexAIInstance) {
            if (Date.now() - start > timeout) {
                console.error("Kai: Core wait timeout.");
                throw new Error("AI Core Connection Failed");
            }
            await new Promise(r => setTimeout(r, 100));
        }
        
        this.ai = window.VortexAIInstance;
        return this.ai;
    }

    /**
     * Detect user intent for studio tool dispatch.
     * Returns { target, action, params, needsChoice, choices } or null.
     */
    _detectToolIntent(query) {
        const q = query.toLowerCase().trim();

        // Isometric / IsoPixel map creation
        // Generator modes: terrain (Standard Terrain), islands (Floating Islands), maze (Stone Maze), flat (Flat World)
        if (/\b(create|generate|make|build)\b.*\b(iso(metric)?|isopixel|iso.pixel)\b.*\b(map|terrain|world|level)\b/.test(q) ||
            /\b(iso(metric)?|isopixel|iso.pixel)\b.*\b(map|terrain|world|level)\b/.test(q)) {
            const mode = /island/i.test(q) ? 'islands' : /maze/i.test(q) ? 'maze' : /flat/i.test(q) ? 'flat' : /standard|terrain/i.test(q) ? 'terrain' : null;
            if (!mode) {
                return {
                    target: 'iso_studio', action: 'pixel.generateTerrain',
                    needsChoice: true,
                    choiceLabel: 'What type of isometric terrain?',
                    choices: [
                        { label: '🌍 Standard Terrain', params: { mode: 'terrain' } },
                        { label: '🏝️ Floating Islands', params: { mode: 'islands' } },
                        { label: '🧱 Stone Maze', params: { mode: 'maze' } },
                        { label: '🟫 Flat World', params: { mode: 'flat' } }
                    ]
                };
            }
            return { target: 'iso_studio', action: 'pixel.generateTerrain', params: { mode } };
        }

        // Platformer level creation
        // SmartGenerator themes: flow, spire, abyss, gauntlet, clockwork
        if (/\b(create|generate|make|build)\b.*\b(platformer|platform|side.?scroll)\b.*\b(map|level|world|stage)\b/.test(q) ||
            /\b(platformer|platform|side.?scroll)\b.*\b(map|level|world|stage)\b/.test(q)) {
            const theme = /flow|speed/i.test(q) ? 'flow' : /spire|vertical|climb/i.test(q) ? 'spire' : /abyss|precision/i.test(q) ? 'abyss' : /gauntlet|combat/i.test(q) ? 'gauntlet' : /clockwork|puzzle/i.test(q) ? 'clockwork' : null;
            if (!theme) {
                return {
                    target: 'platformer_studio', action: 'platformer.generateLevel',
                    needsChoice: true,
                    choiceLabel: 'What type of platformer level?',
                    choices: [
                        { label: '💨 The Flow (Speed)', params: { theme: 'flow', difficulty: 5 } },
                        { label: '🗼 The Spire (Vertical)', params: { theme: 'spire', difficulty: 5 } },
                        { label: '🕳️ The Abyss (Precision)', params: { theme: 'abyss', difficulty: 5 } },
                        { label: '⚔️ The Gauntlet (Combat)', params: { theme: 'gauntlet', difficulty: 5 } },
                        { label: '⚙️ The Clockwork (Puzzle)', params: { theme: 'clockwork', difficulty: 5 } }
                    ]
                };
            }
            const difficulty = /hard/i.test(q) ? 8 : /easy/i.test(q) ? 2 : 5;
            return { target: 'platformer_studio', action: 'platformer.generateLevel', params: { theme, difficulty } };
        }

        // Top-down / RPG map creation
        // Generator types: village, dungeon, hell, heaven, lab
        if (/\b(create|generate|make|build)\b.*\b(top.?down|rpg|world|dungeon|village|hell|heaven|lab)\b.*\b(map|level|world|terrain)\b/.test(q) ||
            /\b(top.?down|rpg)\b.*\b(map|level|world|terrain)\b/.test(q) ||
            /\b(create|generate|make|build)\b.*\bmap\b/.test(q) && !/iso|platform/i.test(q)) {
            const type = /dungeon/i.test(q) ? 'dungeon' : /village/i.test(q) ? 'village' : /hell/i.test(q) ? 'hell' : /heaven|sky/i.test(q) ? 'heaven' : /lab/i.test(q) ? 'lab' : null;
            if (!type) {
                return {
                    target: 'editor', action: 'world.generateMap',
                    needsChoice: true,
                    choiceLabel: 'What type of top-down map?',
                    choices: [
                        { label: '🏘️ Village', params: { type: 'village', density: 5 } },
                        { label: '🏚️ Dungeon', params: { type: 'dungeon', density: 5 } },
                        { label: '🔥 Hellscape', params: { type: 'hell', density: 5 } },
                        { label: '☁️ Sky Islands', params: { type: 'heaven', density: 5 } },
                        { label: '🔬 Lab', params: { type: 'lab', density: 5 } }
                    ]
                };
            }
            return { target: 'editor', action: 'world.generateMap', params: { type, density: 5 } };
        }

        // Open editor without generating
        if (/\b(open|show|launch|go\s+to)\b.*\b(iso(metric)?|isopixel)\b/i.test(q))
            return { target: 'iso_studio', action: 'navigateTo', params: { target: 'iso_studio' } };
        if (/\b(open|show|launch|go\s+to)\b.*\b(platformer|platform)\b/i.test(q))
            return { target: 'platformer_studio', action: 'navigateTo', params: { target: 'platformer_studio' } };
        if (/\b(open|show|launch|go\s+to)\b.*\b(top.?down|rpg|world|level)\s*(editor|builder)?\b/i.test(q))
            return { target: 'editor', action: 'navigateTo', params: { target: 'editor' } };

        return null;
    }

    /**
     * Dispatch a tool intent via the central ToolRegistry.
     * This ensures the call goes through the PermissionGate and EventBus.
     */
    async _dispatchIntent(intent, params) {
        this._debug(`Dispatching intent: ${intent.action}`, params);

        // Always store pending action for recovery on page load
        localStorage.setItem('ai_pending_action', JSON.stringify({
            method: intent.action, 
            params: params || {},
            id: `intent_${Date.now()}`, 
            timestamp: Date.now()
        }));

        try {
            const ai = await this.waitForCore();
            if (ai && ai.toolRegistry) {
                // Execute via the formal registry (this triggers PermissionGate)
                const result = await ai.toolRegistry.execute(intent.action, params || {});
                
                // If the tool was successful and didn't require a redirect, 
                // we can clear the pending action.
                if (result && result.success) {
                    localStorage.removeItem('ai_pending_action');
                }
                return result;
            } else {
                throw new Error("ToolRegistry not available");
            }
        } catch (error) {
            console.warn('[Kai] Registry dispatch failed, falling back to legacy bridge:', error);
            // Fallback for when the AI kernel isn't fully booted but we want to trigger a tool
            return this._legacyDispatch(intent, params);
        }
    }

    /**
     * Legacy dispatch logic using postMessage and localStorage recovery.
     * Used only as a fallback if the AI Kernel/ToolRegistry is unavailable.
     */
    async _legacyDispatch(intent, params) {
        const frameMap = {
            'iso_studio': 'frame-iso_studio',
            'platformer_studio': 'frame-platformer_studio',
            'editor': 'frame-editor'
        };
        const navMap = {
            'iso_studio': 'iso_editor.html',
            'platformer_studio': 'platformer_editor.html',
            'editor': 'editor.html'
        };

        const frameId = frameMap[intent.target];
        const url = navMap[intent.target];
        if (!url) throw new Error(`Unknown target: ${intent.target}`);

        const msg = { type: 'ai:tool', name: intent.action, args: params || {}, id: `intent_${Date.now()}` };

        const hub = (window.parent !== window && window.parent) ||
                    (window.top !== window && window.top) || null;

        if (hub) {
            const existingFrame = hub.document.getElementById(frameId);
            if (existingFrame && existingFrame.contentWindow) {
                try {
                    const winEl = hub.document.getElementById('win-' + intent.target);
                    if (winEl) winEl.style.display = 'flex';
                    if (hub.focusWindow) hub.focusWindow('win-' + intent.target);
                    existingFrame.contentWindow.postMessage(msg, '*');
                    localStorage.removeItem('ai_pending_action');
                    return { success: true, direct: true };
                } catch (e) {}
            }
        }

        if (hub && hub.openWindow && hub.tools) {
            const tool = hub.tools.find(t => t.id === intent.target);
            if (tool) {
                hub.openWindow(tool);
                return { success: true, pending: true };
            }
        }

        const top = window.top || window.parent || window;
        top.location.href = url;
        return { success: true, pending: true };
    }

    _debug(msg, data) {
        console.log(`%c[Kai:Assistant]%c ${msg}`, 'background: #f1c40f; color: #000; padding: 2px 5px;', '', data || '');
    }

    async processQuery(query) {
        try {
            // PHASE 1: HIGH-SPEED INTENT DETECTION (Regex)
            // We still use regex for instant response on very common studio commands
            const intent = this._detectToolIntent(query);
            if (intent) {
                this._debug('Instant intent detected:', intent.action);

                // If user needs to choose a variant, return choices for the UI to handle
                if (intent.needsChoice) {
                    return {
                        text: intent.choiceLabel,
                        type: 'choices',
                        intent: intent
                    };
                }

                // Execute via formal registry (audited by KAP)
                const result = await this._dispatchIntent(intent, intent.params);
                
                let flavorText = `[SYSTEM] Executing ${intent.action}...`;
                if (result && result.message) flavorText = `[SYSTEM] ${result.message}`;
                
                if (this.personality && this.personality.addFlavor) {
                    flavorText = this.personality.addFlavor(flavorText, 'answer');
                }
                return { text: flavorText, type: 'tool_action', action: intent.action, result };
            }

            // PHASE 2: UNIFIED AI CORE (LLM + ToolRegistry)
            // For everything else, use the smart brain
            await this.waitForCore();
            
            // Get conversation context if possible (from project state)
            const context = {};
            if (window.VortexProjectState) {
                context.project = window.VortexProjectState.projectName;
                context.activeEditor = localStorage.getItem('ketebe_last_editor');
            }

            const response = await this.ai.chat(query, { context });

            // Normalize response text
            let text = "";
            if (typeof response === 'string') text = response;
            else if (response.text) text = response.text;
            else text = JSON.stringify(response);

            // Surface tool call results in the response for user feedback
            if (response.toolCalls && response.toolCalls.length > 0) {
                const toolNames = response.toolCalls.map(tc => tc.name).join(', ');
                const success = response.workflowResult && response.workflowResult.success;
                text += success
                    ? `\n\n>> AUDIT: ${toolNames} executed successfully ✓`
                    : `\n\n>> AUDIT: Attempted ${toolNames} (execution deferred or failed)`;
            }

            // Apply personality flavor if not already formatted as a system message
            if (this.personality && this.personality.addFlavor) {
                if (!text.includes(">>") && !text.includes("[SYSTEM]")) {
                     text = this.personality.addFlavor(text, 'answer');
                }
            }

            return {
                text: text,
                type: (response.toolCalls && response.toolCalls.length > 0) ? 'tool_action' : 'text',
                response: response
            };

        } catch (error) {
            this._debug('Process Query Failed', error);
            const errorMsg = `[ERROR] I encountered a glitch: ${error.message}`;
            return { 
                text: this.personality ? this.personality.addFlavor(errorMsg, 'error') : errorMsg, 
                type: 'error' 
            };
        }
    }
}

// Expose globally
window.IRABAssistantSimple = IRABAssistantSimple;
console.log('Kai: Assistant Compatibility Layer Loaded.');
