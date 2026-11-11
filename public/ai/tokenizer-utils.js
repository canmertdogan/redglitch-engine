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
        // Conservative heuristic: 2 chars/token (avoids undercount for CJK/emoji/code). Was 4 (H5).
        return Math.ceil(text.length / 2);
    }

    /**
     * Truncate text to fit within a token budget.
     * @param {string} text
     * @param {number} maxTokens
     * @param {boolean} fromStart - If true, keeps the beginning of the text, otherwise keeps the end.
     * @returns {string}
     */
    static truncateToTokenBudget(text, maxTokens, fromStart = true) {
        const estimatedChars = maxTokens * 2;
        if (text.length <= estimatedChars) return text;

        if (fromStart) {
            return text.slice(0, estimatedChars);
        } else {
            return text.slice(-estimatedChars);
        }
    }
}

