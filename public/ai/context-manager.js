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

    buildPrompt(userMessage, ragContext = "", toolsPrompt = "", editorState = null) {
        let systemPrompt = "You are Kai, a genius AI hacker assistant for RedGlitch Studio. You are cool, nerdy, and extremely competent. You love retro tech, efficient code, and helping users build legendary games.\n\nIMPORTANT TOOL ROUTING:\n- For top-down RPG maps/levels → use navigateTo with target \"editor\"\n- For isometric/isopixel maps → use navigateTo with target \"iso_studio\"\n- For 2D platformer levels → use navigateTo with target \"platformer_studio\"\n- For code/scripting → use navigateTo with target \"script\"\nNever open the script editor for map creation requests.";
        
        if (editorState && editorState.activeFile) {
            systemPrompt += `\n\nACTIVE EDITOR CONTEXT:\nThe user is currently viewing/editing the file: ${editorState.activeFile}`;
            if (editorState.cursorLine) {
                systemPrompt += ` at line ${editorState.cursorLine}`;
            }
            systemPrompt += `.`;
        }
        
        if (toolsPrompt) {
            systemPrompt += `\n\nAVAILABLE TOOLS:\nYou have access to the following studio tools. To use a tool, output JSON objects or an array inside a tool fence:\n\`\`\`tool\n{"name": "namespace.method", "args": {...}}\n\`\`\`\nArguments must match the schemas. After tool results are returned, continue until the requested outcome is complete. Navigation alone is not completion. Never claim success before receiving a tool result.\n\nTools:\n${toolsPrompt}`;
        }

        // Calculate dynamic budgets
        const maxTotalTokens = AI_CONFIG.limits.contextWindow || 4096;
        const systemTokens = TokenizerUtils.estimateTokens(systemPrompt);
        const userTokens = TokenizerUtils.estimateTokens(userMessage);
        
        // Leave room for generation
        const reservedGeneration = AI_CONFIG.models.llm.maxNewTokens || 1024;
        let availableForHistoryAndRag = maxTotalTokens - systemTokens - userTokens - reservedGeneration - 100; // 100 token buffer
        if (availableForHistoryAndRag < 0) availableForHistoryAndRag = 0;

        // Split available tokens between History and RAG
        const maxHistoryTokens = Math.floor(availableForHistoryAndRag * 0.4);
        let maxRagTokens = availableForHistoryAndRag - maxHistoryTokens;

        // Truncate history
        let historyPrompt = "";
        let currentHistoryTokens = 0;
        for (let i = this.history.length - 1; i >= 0; i--) {
            const msg = this.history[i];
            const msgTokens = TokenizerUtils.estimateTokens(msg.content);
            if (currentHistoryTokens + msgTokens > maxHistoryTokens) {
                // We've hit the history limit, donate the rest to RAG
                maxRagTokens += (maxHistoryTokens - currentHistoryTokens);
                break;
            }
            historyPrompt = `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n` + historyPrompt;
            currentHistoryTokens += msgTokens;
        }

        const budgetedRag = ragContext
            ? TokenizerUtils.truncateToTokenBudget(ragContext, maxRagTokens, true) // true = fromStart
            : '';

        let prompt = `<|im_start|>system\n${systemPrompt}`;
        
        if (budgetedRag) {
            prompt += `\n\nRELEVANT DOCUMENTATION:\n${budgetedRag}`;
        }
        
        prompt += `<|im_end|>\n`;

        // Add History
        prompt += historyPrompt;

        // Add User Message
        prompt += `<|im_start|>user\n${userMessage}<|im_end|>\n<|im_start|>assistant\n`;

        return prompt;
    }
}
