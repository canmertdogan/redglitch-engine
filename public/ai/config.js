/**
 * public/ai/config.js
 * Central configuration for RedGlitch AI Micro Edition.
 */

export const AI_CONFIG = {
    // Model configuration
    models: {
        llm: {
            name: 'Qwen/Qwen2.5-Coder-3B-Instruct',
            modelId: 'onnx-community/Qwen2.5-Coder-3B-Instruct', // Transformers.js v3 ID
            quantization: 'q4f16',           // 4-bit quantized, ~1.8GB
            maxNewTokens: 1024,
            temperature: 0.4,
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
        contextWindow: 4096,                  // Total tokens for 3B model
        maxHistoryMessages: 10,                // Sliding window
        maxRAGChunks: 3,                      // Top-K retrieval
        ragChunkSize: 300,                    // Characters per chunk
        ragChunkOverlap: 50,                  // Overlap between chunks
        idleDisposeMinutes: 5,                // Unload model after idle
        maxFileContextChars: 8000,            // Increased for 3B
        maxTokensForSystemPrompt: 800,        // Increased for 3B
        maxTokensForRAG: 600,                 // Increased for 3B
        maxTokensForHistory: 600,             // Increased for 3B
        maxTokensForUserMessage: 500,         // Increased for 3B
    },

    // Storage keys
    storage: {
        modelCacheKey: 'redglitch-ai-model-cache',
        vectorDBKey: 'redglitch-ai-vectors',
        configKey: 'redglitch-ai-config',
        historyKey: 'redglitch-ai-history',
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
