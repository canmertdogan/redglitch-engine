/**
 * public/ai/tokenizer-utils.js
 * Token counting and context window management utilities.
 */

export class TokenizerUtils {
    /**
     * Estimate token count from text (fast, approximate).
     * @param {string} text
     * @returns {number}
     */
    static estimateTokens(text) {
        if (!text) return 0;
        // Basic heuristic: 4 characters per token for English/Code
        return Math.ceil(text.length / 4);
    }

    /**
     * Truncate text to fit within a token budget.
     * @param {string} text
     * @param {number} maxTokens
     * @param {boolean} fromStart - If true, keeps the beginning of the text, otherwise keeps the end.
     * @returns {string}
     */
    static truncateToTokenBudget(text, maxTokens, fromStart = true) {
        const estimatedChars = maxTokens * 4;
        if (text.length <= estimatedChars) return text;

        if (fromStart) {
            return text.slice(0, estimatedChars);
        } else {
            return text.slice(-estimatedChars);
        }
    }

    /**
     * Build a context budget allocation.
     * Returns how many tokens each component gets based on total window.
     * @param {number} totalWindow - Total context window size
     * @returns {{ system: number, rag: number, history: number, user: number, generation: number }}
     */
    static allocateBudget(totalWindow) {
        // Example for 2048 tokens:
        // System: 400
        // RAG: 300
        // History: 300
        // User: 200
        // Generation: 512
        // Buffer: 336
        
        return {
            system: Math.floor(totalWindow * 0.20),
            rag: Math.floor(totalWindow * 0.15),
            history: Math.floor(totalWindow * 0.15),
            user: Math.floor(totalWindow * 0.10),
            generation: Math.floor(totalWindow * 0.25)
        };
    }
}
