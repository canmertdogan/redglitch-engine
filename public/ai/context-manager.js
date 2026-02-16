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

    buildPrompt(userMessage, ragContext = "", systemPrompt = "") {
        if (!systemPrompt) {
            systemPrompt = "You are IRAB, the Ketebe Studio AI Assistant. Professional, helpful, occasionally sarcastic. You help users build games in the Ketebe Engine.";
        }

        let prompt = `<|im_start|>system\n${systemPrompt}`;
        
        if (ragContext) {
            prompt += `\n\nUse the following documentation context to help answer the user:\n${ragContext}`;
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
