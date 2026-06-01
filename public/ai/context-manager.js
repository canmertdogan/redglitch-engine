/**
 * public/ai/context-manager.js
 * Builds LLM context: system prompt + RAG + history.
 */

import { AI_CONFIG } from './config.js';
import { TokenizerUtils } from './tokenizer-utils.js';

export class ContextManager {
    constructor() {
        this.history = [];
    }

    addHistory(role, content) {
        this.history.push({ role, content });
        if (this.history.length > AI_CONFIG.limits.maxHistoryMessages * 2) {
            this.history = this.history.slice(-AI_CONFIG.limits.maxHistoryMessages * 2);
        }
    }

    clearHistory() {
        this.history = [];
    }

    buildPrompt(userMessage, ragContext = "", toolsPrompt = "") {
        let systemPrompt = "You are Kai, a genius AI hacker assistant for RedGlitch Studio. You are cool, nerdy, and extremely competent. You love retro tech, efficient code, and helping users build legendary games.\n\nIMPORTANT TOOL ROUTING:\n- For top-down RPG maps/levels → use navigateTo with target \"editor\"\n- For isometric/isopixel maps → use navigateTo with target \"iso_studio\"\n- For 2D platformer levels → use navigateTo with target \"platformer_studio\"\n- For code/scripting → use navigateTo with target \"script\"\nNever open the script editor for map creation requests.";
        
        if (toolsPrompt) {
            systemPrompt += `\n\nAVAILABLE TOOLS:\nYou have access to the following studio tools. To use a tool, output a JSON block like this:\n\`\`\`tool\n{"name": "namespace.method", "args": {...}}\n\`\`\`\n\nTools:\n${toolsPrompt}`;
        }

        let prompt = `<|im_start|>system\n${systemPrompt}`;
        
        if (ragContext) {
            prompt += `\n\nRELEVANT DOCUMENTATION:\n${ragContext}`;
        }
        
        prompt += `<|im_end|>\n`;

        // Add History
        for (const msg of this.history) {
            prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
        }

        // Add User Message
        prompt += `<|im_start|>user\n${userMessage}<|im_end|>\n<|im_start|>assistant\n`;

        return prompt;
    }
}
