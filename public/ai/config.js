/**
 * public/ai/config.js
 * Central configuration for Ketebe AI Micro Edition.
 */

export const AI_CONFIG = {
    // Model configuration
    models: {
        llm: {
            name: 'Qwen/Qwen2.5-Coder-0.5B-Instruct',
            modelId: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct', // Transformers.js v3 ID
            quantization: 'q4f16',           // 4-bit quantized, ~300MB
            maxNewTokens: 512,
            temperature: 0.3,
            topP: 0.9,
            repetitionPenalty: 1.1,
        },
        embedding: {
            name: 'Xenova/all-MiniLM-L6-v2',
            modelId: 'Xenova/all-MiniLM-L6-v2',
            quantization: 'quantized',       // INT8, ~23MB
            dimensions: 384,
        }
    },

    // Runtime limits
    limits: {
        contextWindow: 2048,                  // Total tokens for 0.5B model
        maxHistoryMessages: 6,                // Sliding window
        maxRAGChunks: 3,                      // Top-K retrieval
        ragChunkSize: 300,                    // Characters per chunk
        ragChunkOverlap: 50,                  // Overlap between chunks
        idleDisposeMinutes: 5,                // Unload model after idle
        maxFileContextChars: 4000,            // File content sent to LLM
        maxTokensForSystemPrompt: 400,        // Reserved for system prompt
        maxTokensForRAG: 300,                 // Reserved for RAG context
        maxTokensForHistory: 300,             // Reserved for chat history
        maxTokensForUserMessage: 200,         // Reserved for current query
    },

    // Storage keys
    storage: {
        modelCacheKey: 'ketebe-ai-model-cache',
        vectorDBKey: 'ketebe-ai-vectors',
        configKey: 'ketebe-ai-config',
        historyKey: 'ketebe-ai-history',
    },

    // Feature flags
    features: {
        enableWebGPU: true,
        enableToolUse: true,
        enableGhostText: true,
        enableProactiveHelp: true,
        enableRAG: true,
    },

    // UI
    ui: {
        chatHotkey: 'Ctrl+K',
        maxChatHistoryDisplay: 50,
        typingIndicatorDelay: 100,
    }
};
