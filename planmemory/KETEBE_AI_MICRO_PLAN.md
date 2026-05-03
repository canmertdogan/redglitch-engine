# 🧠 Vortex AI Micro Edition — Comprehensive Development Plan

**Status:** Final Draft v1.0  
**Target:** Browser-Native (Client-Side) AI Assistant  
**Philosophy:** "Zero Latency, Zero Server Cost, Maximum Smarts & Safety"

---

## 📋 Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Architecture Overview](#2-architecture-overview)
3. [File Structure](#3-file-structure)
4. [Phase 1: Core Engine (WebGPU & Model Loading)](#4-phase-1-core-engine)
5. [Phase 2: RAG System (Local Knowledge Base)](#5-phase-2-rag-system)
6. [Phase 3: Brain (Context & Prompt Engineering)](#6-phase-3-brain)
7. [Phase 4: Agentic Capabilities (Tool Use)](#7-phase-4-agentic-capabilities)
8. [Phase 5: UI/UX Integration](#8-phase-5-uiux-integration)
9. [Technical Specifications](#9-technical-specifications)
10. [Risk Mitigation](#10-risk-mitigation)
11. [Master Task Checklist](#11-master-task-checklist)

---

## 1. Current State Analysis

### What Exists Today (IRAB v11.0 — `public/assistant.js`)

| Component | Status | Details |
|-----------|--------|---------|
| Chat UI | ✅ Working | Draggable avatar, side panel (800×450), Ctrl+K toggle |
| AI Backend | ✅ Working | Server-proxied: Cerebras (LLaMA 3.1) & Google Gemini via `/api/ai/chat` |
| Code Injection | ✅ Working | "APPLY" button inserts AI-generated code into active Monaco editor |
| Context Gathering | ⚠️ Basic | Sends current file content + project name, limited to 8000 chars |
| Conversation Memory | ⚠️ Basic | In-memory array, last 5 messages, no persistence |
| Proactive Triggers | ✅ Working | Idle detection (5min), rapid-undo detection, console error interception |
| Navigation | ✅ Working | `navMap` with 13+ editor shortcuts |
| Tool Use / Agentic | ❌ None | No ability to execute studio actions |
| Local AI / On-Device | ❌ None | No WebGPU, WASM, Transformers.js, or Web Workers |
| RAG / Knowledge Base | ❌ None | No vector DB, no doc embeddings |
| Diff View | ❌ None | No code comparison UI |
| Command Bus | ❌ None | Direct function calls, no formal action registry |
| Custom Modal System | ❌ None | Uses native `confirm()` only |
| OPFS / IndexedDB | ❌ None | Only localStorage for small state |

### Existing Infrastructure We Can Leverage

| Component | File | What It Gives Us |
|-----------|------|-----------------|
| EventBus | `public/shared/EventBus.js` | Pub/sub + WebSocket broadcast — perfect for AI→Editor commands |
| SharedProjectState | `public/shared/SharedProjectState.js` | Undo/redo stack (50 steps), auto-save, state watching |
| AssetManager | `public/shared/AssetManager.js` | Asset registry, preloading, dependency graph, thumbnails |
| Monaco Editor | CDN v0.34.0 + `public/lib/monaco/` | Code editing, models, DiffEditor API (unused but available) |
| Theme System | `public/theme.js` | 3 themes with CSS custom properties |
| Type Definitions | `public/lib/monaco/ketebe.d.ts` | 69 lines of core interface types |
| Documentation | `public/docs.html` + `public/docs/` | ~1500 lines of structured docs content |
| Server API | `server.js` | 70+ REST endpoints, `/api/ide/*` for file ops |
| tools.html | `public/tools.html` | Main studio workspace where assistant.js is loaded |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vortex Studio (Electron / Browser)            │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Monaco       │  │  Map Editor  │  │  Other Editors        │ │
│  │  Code Editor  │  │  (editor.js) │  │  (npc, quest, etc.)   │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
│         │                 │                       │             │
│         ▼                 ▼                       ▼             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    EventBus (shared)                        ││
│  │              + SharedProjectState (undo/redo)               ││
│  └─────────────────────────┬───────────────────────────────────┘│
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              🧠 VortexAI Module (NEW)                       ││
│  │                                                             ││
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  ││
│  │  │ InferenceEng │  │ RAG Engine   │  │ Tool Registry     │  ││
│  │  │ (WebWorker)  │  │ (Embeddings  │  │ (Command Bus)     │  ││
│  │  │              │  │  + VectorDB) │  │                   │  ││
│  │  │ Transformers │  │              │  │ createScript()    │  ││
│  │  │ .js v3       │  │ Voy/Orama    │  │ addGameObject()   │  ││
│  │  │              │  │              │  │ changeSettings()  │  ││
│  │  │ Qwen2.5-     │  │ MiniLM-L6    │  │ navigateTo()     │  ││
│  │  │ Coder-0.5B   │  │ (embeddings) │  │ editFile()       │  ││
│  │  └──────┬──────┘  └──────┬───────┘  └────────┬──────────┘  ││
│  │         │                │                    │              ││
│  │         ▼                ▼                    ▼              ││
│  │  ┌─────────────────────────────────────────────────────────┐ ││
│  │  │              Context Manager                            │ ││
│  │  │  System Prompt + RAG Results + User History + Tools     │ ││
│  │  └─────────────────────────┬───────────────────────────────┘ ││
│  │                            │                                 ││
│  │                            ▼                                 ││
│  │  ┌─────────────────────────────────────────────────────────┐ ││
│  │  │              Permission Gate                            │ ││
│  │  │  "May I?" Modal → Diff View → Apply / Reject           │ ││
│  │  └─────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              AI Chat UI (Revamped IRAB)                     ││
│  │  Ctrl+K Modal → Chat History → Action Buttons → Status     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

Storage Layer:
┌──────────┐  ┌──────────┐  ┌──────────┐
│  OPFS    │  │ Cache    │  │ IndexedDB│
│  (model  │  │ API      │  │ (vector  │
│  weights)│  │ (assets) │  │  store)  │
└──────────┘  └──────────┘  └──────────┘
```

---

## 3. File Structure

All new files live under `public/ai/`. No existing files are deleted — only modified.

```
public/
├── ai/                              # NEW — All AI module code
│   ├── ketebe-ai.js                 # Main orchestrator (entry point)
│   ├── inference-engine.js          # Transformers.js wrapper + WebGPU/WASM fallback
│   ├── inference-worker.js          # Web Worker for model inference (off main thread)
│   ├── rag-engine.js                # RAG pipeline: embed → search → retrieve
│   ├── vector-store.js              # Vector DB wrapper (Orama/Voy abstraction)
│   ├── embedding-worker.js          # Web Worker for embedding generation
│   ├── context-manager.js           # Builds LLM context: system prompt + RAG + history
│   ├── tool-registry.js             # Command Bus: defines & executes studio tools
│   ├── permission-gate.js           # "May I?" confirmation system + diff view
│   ├── model-manager.js             # Download, cache (OPFS), dispose lifecycle
│   ├── tokenizer-utils.js           # Token counting, context window management
│   ├── config.js                    # All constants, model URLs, thresholds
│   └── docs/                        # Pre-processed documentation for RAG
│       ├── build-corpus.js          # Build-time script: MD → chunks → embeddings
│       └── corpus.json              # Pre-computed doc chunks (built at dev time)
│
├── ai-chat-ui.js                    # NEW — Revamped chat panel UI (replaces IRAB chat parts)
├── ai-chat-ui.css                   # NEW — Chat panel styles
│
├── assistant.js                     # MODIFIED — Keep avatar/personality, delegate AI to ketebe-ai.js
├── shared/
│   └── EventBus.js                  # UNCHANGED — Used as command transport
│   └── SharedProjectState.js        # UNCHANGED — Used for undo/redo integration
│   └── AssetManager.js              # UNCHANGED
│
├── lib/
│   └── monaco/
│       └── ketebe.d.ts              # MODIFIED — Add AI API type definitions
│
└── tools.html                       # MODIFIED — Load new AI modules
```

### Files Modified (Minimal Changes)

| File | Change | Reason |
|------|--------|--------|
| `public/assistant.js` | Add `VortexAI` integration hooks, keep personality/avatar | Bridge old IRAB to new AI engine |
| `public/tools.html` | Add `<script>` tags for AI modules | Load the AI system |
| `public/lib/monaco/ketebe.d.ts` | Add AI-related type definitions | Monaco IntelliSense |
| `public/script_editor.js` | Add ghost-text completion provider | Inline code suggestions |
| `public/ide.js` | Add ghost-text completion provider | Inline code suggestions |
| `server.js` | Add `/api/ai/docs` endpoint for corpus serving | Serve pre-built doc corpus |
| `package.json` | Add `@xenova/transformers` + `orama` dev deps | Build-time corpus generation |

---

## 4. Phase 1: Core Engine (WebGPU & Model Loading)

### 4.1 — `public/ai/config.js`

Central configuration. All magic numbers live here.

```javascript
export const AI_CONFIG = {
    // Model configuration
    models: {
        llm: {
            name: 'Qwen/Qwen2.5-Coder-0.5B-Instruct',
            quantization: 'q4f16',           // 4-bit quantized, ~300MB
            maxNewTokens: 512,
            temperature: 0.3,
            topP: 0.9,
            repetitionPenalty: 1.1,
        },
        embedding: {
            name: 'Xenova/all-MiniLM-L6-v2',
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
```

### 4.2 — `public/ai/model-manager.js`

Handles model lifecycle: download → cache → load → dispose.

```javascript
/**
 * ModelManager — Downloads, caches (OPFS/Cache API), and manages
 * the lifecycle of Transformers.js models.
 *
 * States: idle → downloading → loading → ready → disposed
 */
export class ModelManager {
    constructor(config) { ... }

    /**
     * Check if model is already cached in browser storage.
     * @returns {Promise<boolean>}
     */
    async isCached(modelId) { ... }

    /**
     * Download model with progress callback.
     * Uses Cache API for persistence across sessions.
     * @param {string} modelId
     * @param {function} onProgress - Called with { loaded, total, percent }
     * @returns {Promise<void>}
     */
    async downloadModel(modelId, onProgress) { ... }

    /**
     * Load model into memory (WebGPU or WASM fallback).
     * @param {string} modelId
     * @returns {Promise<Pipeline>}
     */
    async loadModel(modelId) { ... }

    /**
     * Dispose model from GPU/CPU memory.
     * Called after idle timeout to free resources.
     */
    async disposeModel(modelId) { ... }

    /**
     * Get current model state.
     * @returns {'idle'|'downloading'|'loading'|'ready'|'disposed'}
     */
    getState(modelId) { ... }

    /**
     * Start idle timer — dispose model after AI_CONFIG.limits.idleDisposeMinutes.
     */
    startIdleTimer() { ... }

    /**
     * Reset idle timer (called on each user interaction).
     */
    resetIdleTimer() { ... }

    /**
     * Get estimated storage usage.
     * @returns {Promise<{used: number, quota: number}>}
     */
    async getStorageEstimate() { ... }

    /**
     * Clear all cached models.
     * @returns {Promise<void>}
     */
    async clearCache() { ... }
}
```

**Key Implementation Details:**

- **WebGPU Detection:**
  ```javascript
  async detectBackend() {
      if (this.config.features.enableWebGPU && navigator.gpu) {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) return 'webgpu';
      }
      return 'wasm'; // Fallback — slower but universal
  }
  ```

- **Cache API Storage** (not OPFS — broader browser support, Transformers.js uses it natively):
  ```javascript
  // Transformers.js v3 natively supports Cache API via env config:
  import { env } from '@xenova/transformers';
  env.useBrowserCache = true;  // Models cached in Cache Storage
  env.allowLocalModels = false; // Always fetch from HF Hub
  ```

- **Progressive Download UI Integration:**
  ```javascript
  // Emits events that the chat UI listens to:
  this.onProgress = (info) => {
      EventBus.emit('ai:model:progress', {
          modelId: info.modelId,
          percent: Math.round((info.loaded / info.total) * 100),
          loaded: info.loaded,
          total: info.total,
          status: info.status // 'downloading' | 'loading' | 'ready'
      });
  };
  ```

### 4.3 — `public/ai/inference-worker.js`

**Web Worker** that runs model inference off the main thread. This is critical — without it, the UI freezes during token generation.

```javascript
/**
 * Web Worker for LLM inference.
 * Receives messages from inference-engine.js, runs Transformers.js pipeline,
 * streams tokens back via postMessage.
 *
 * Message Protocol:
 *   IN:  { type: 'load',     modelId, backend }
 *   IN:  { type: 'generate', prompt, params }
 *   IN:  { type: 'dispose'  }
 *   OUT: { type: 'token',    token }       // Streamed per-token
 *   OUT: { type: 'complete', text }        // Full response
 *   OUT: { type: 'progress', percent }     // Download/load progress
 *   OUT: { type: 'ready'   }              // Model loaded
 *   OUT: { type: 'error',   message }     // Error occurred
 */

importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@3');

let pipeline = null;
let tokenizer = null;

self.onmessage = async function(e) {
    const { type, ...data } = e.data;

    switch (type) {
        case 'load':
            // Initialize pipeline with WebGPU or WASM
            // Post progress events during download
            break;

        case 'generate':
            // Run text-generation pipeline
            // Stream tokens back via postMessage
            // Apply chat template for instruction-tuned model
            break;

        case 'dispose':
            // Free memory
            pipeline = null;
            tokenizer = null;
            break;
    }
};
```

### 4.4 — `public/ai/inference-engine.js`

Main-thread API that communicates with the Web Worker.

```javascript
/**
 * InferenceEngine — Main-thread interface to the inference Web Worker.
 * Handles model loading, generation requests, and token streaming.
 */
export class InferenceEngine {
    constructor(modelManager, config) { ... }

    /**
     * Initialize the inference worker.
     * Does NOT load the model — that happens on first use (lazy loading).
     */
    async initialize() { ... }

    /**
     * Ensure model is loaded. Called before any generation.
     * Shows download UI if model not cached.
     * @returns {Promise<void>}
     */
    async ensureModelReady() { ... }

    /**
     * Generate a response from the LLM.
     * @param {string} prompt - The full formatted prompt (system + context + user)
     * @param {object} params - { maxNewTokens, temperature, topP, stopSequences }
     * @param {function} onToken - Called with each generated token (for streaming UI)
     * @returns {Promise<string>} - Complete generated text
     */
    async generate(prompt, params, onToken) { ... }

    /**
     * Cancel an ongoing generation.
     */
    cancel() { ... }

    /**
     * Check if model is currently generating.
     * @returns {boolean}
     */
    isGenerating() { ... }

    /**
     * Get backend info (webgpu/wasm, model size, etc.)
     * @returns {object}
     */
    getInfo() { ... }

    /**
     * Dispose worker and free resources.
     */
    dispose() { ... }
}
```

**Key Implementation Details:**

- **Streaming tokens** via Worker `postMessage` → main thread updates chat UI character by character
- **Abort controller** pattern: user can cancel mid-generation
- **Lazy loading**: Model only downloads when user first opens AI panel and sends a message
- **Automatic fallback**: WebGPU → WASM (CPU) if GPU not available

### 4.5 — `public/ai/tokenizer-utils.js`

Token counting and context window management utilities.

```javascript
/**
 * TokenizerUtils — Approximate token counting and context budget management.
 * Uses character-based estimation (4 chars ≈ 1 token) for speed,
 * with optional exact counting via the model's tokenizer.
 */
export class TokenizerUtils {
    /**
     * Estimate token count from text (fast, approximate).
     * @param {string} text
     * @returns {number}
     */
    static estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }

    /**
     * Truncate text to fit within a token budget.
     * @param {string} text
     * @param {number} maxTokens
     * @returns {string}
     */
    static truncateToTokenBudget(text, maxTokens) { ... }

    /**
     * Build a context budget allocation.
     * Returns how many tokens each component gets.
     * @param {number} totalWindow - Total context window size
     * @returns {{ system: number, rag: number, history: number, user: number, generation: number }}
     */
    static allocateBudget(totalWindow) { ... }
}
```

---

## 5. Phase 2: RAG System (Local Knowledge Base)

### 5.1 — `public/ai/docs/build-corpus.js`

**Build-time script** (runs via `node`) that processes documentation into chunks.

```javascript
/**
 * BUILD-TIME ONLY — Not loaded in browser.
 * Run: node public/ai/docs/build-corpus.js
 *
 * Process:
 *   1. Read all .md, .html docs, .d.ts files, engine JSDoc comments
 *   2. Parse into text sections
 *   3. Chunk into ~300 char segments with 50 char overlap
 *   4. Output corpus.json with metadata
 *
 * Output format (corpus.json):
 * {
 *   "version": "1.0",
 *   "chunks": [
 *     {
 *       "id": "doc-001",
 *       "text": "The EventBus provides pub/sub messaging...",
 *       "source": "public/shared/EventBus.js",
 *       "type": "api",          // "api" | "guide" | "example" | "type"
 *       "title": "EventBus.on()",
 *       "tags": ["eventbus", "events", "pubsub"]
 *     }
 *   ]
 * }
 */
```

**Documentation Sources to Process:**

| Source | Type | Est. Chunks |
|--------|------|-------------|
| `public/docs.html` (inline docs) | guide | ~50 |
| `public/docs/campaign_studio_guide.md` | guide | ~30 |
| `public/copilot-instructions.md` | architecture | ~15 |
| `public/engines/shared/LEVEL_FORMAT.md` | spec | ~25 |
| `public/lib/monaco/ketebe.d.ts` | type | ~10 |
| `public/shared/EventBus.js` (JSDoc) | api | ~15 |
| `public/shared/SharedProjectState.js` (JSDoc) | api | ~20 |
| `public/shared/AssetManager.js` (JSDoc) | api | ~25 |
| `public/engines/shared/EngineAdapter.js` (JSDoc) | api | ~15 |
| `public/engines/rpg-topdown/main.js` (JSDoc) | api | ~30 |
| Engine strategy files | api | ~20 |
| **Total** | | **~255 chunks** |

### 5.2 — `public/ai/embedding-worker.js`

**Web Worker** for embedding generation (keeps UI responsive).

```javascript
/**
 * Web Worker for text embedding generation.
 * Uses all-MiniLM-L6-v2 (quantized, ~23MB) to convert text → 384-dim vectors.
 *
 * Message Protocol:
 *   IN:  { type: 'load' }                              // Load embedding model
 *   IN:  { type: 'embed', texts: string[], ids: string[] }  // Embed batch
 *   IN:  { type: 'embedOne', text: string }             // Embed single query
 *   OUT: { type: 'ready' }
 *   OUT: { type: 'embeddings', results: [{id, vector}] }
 *   OUT: { type: 'queryEmbedding', vector: Float32Array }
 *   OUT: { type: 'error', message }
 */
```

### 5.3 — `public/ai/vector-store.js`

Abstraction over the vector database.

```javascript
/**
 * VectorStore — Manages the vector database for RAG retrieval.
 * Uses Orama (https://orama.com) — a fast, browser-native full-text + vector search engine.
 *
 * Why Orama over Voy:
 *   - Orama has both vector search AND full-text search (hybrid retrieval)
 *   - Better maintained, larger community
 *   - ~15KB gzipped, works in browser without WASM
 *   - Built-in persistence to IndexedDB
 */
export class VectorStore {
    constructor(config) { ... }

    /**
     * Initialize the vector store.
     * Loads pre-computed corpus or restores from IndexedDB.
     * @returns {Promise<void>}
     */
    async initialize() { ... }

    /**
     * Load the pre-computed corpus (from build-corpus.js output).
     * @param {object} corpus - The corpus.json data
     */
    async loadCorpus(corpus) { ... }

    /**
     * Add a document dynamically (e.g., user's own scripts).
     * @param {object} doc - { id, text, source, type, title, tags }
     * @param {Float32Array} embedding - Pre-computed embedding vector
     */
    async addDocument(doc, embedding) { ... }

    /**
     * Search for relevant documents.
     * Uses hybrid search: vector similarity + keyword matching.
     * @param {Float32Array} queryEmbedding - Query embedding vector
     * @param {string} queryText - Original query text (for keyword search)
     * @param {number} topK - Number of results (default: 3)
     * @returns {Promise<Array<{id, text, source, title, score}>>}
     */
    async search(queryEmbedding, queryText, topK) { ... }

    /**
     * Index a user's script file for contextual retrieval.
     * Called when user saves a file in the editor.
     * @param {string} filePath
     * @param {string} content
     */
    async indexUserScript(filePath, content) { ... }

    /**
     * Remove a user's script from the index.
     * @param {string} filePath
     */
    async removeUserScript(filePath) { ... }

    /**
     * Persist the vector store to IndexedDB.
     */
    async persist() { ... }

    /**
     * Restore from IndexedDB.
     * @returns {Promise<boolean>} - true if restored, false if empty
     */
    async restore() { ... }

    /**
     * Get statistics about the vector store.
     * @returns {{ totalDocs: number, corpusDocs: number, userDocs: number }}
     */
    getStats() { ... }
}
```

### 5.4 — `public/ai/rag-engine.js`

Orchestrates the full RAG pipeline.

```javascript
/**
 * RAGEngine — Retrieval-Augmented Generation pipeline.
 *
 * Flow:
 *   1. User asks a question
 *   2. Question → embedding (via embedding-worker)
 *   3. Embedding → vector search (via vector-store)
 *   4. Top-K results formatted as context
 *   5. Context injected into LLM prompt
 */
export class RAGEngine {
    constructor(vectorStore, embeddingWorker, config) { ... }

    /**
     * Initialize RAG system.
     * Loads embedding model + pre-computed corpus.
     * @returns {Promise<void>}
     */
    async initialize() { ... }

    /**
     * Retrieve relevant context for a query.
     * @param {string} query - User's question
     * @param {number} topK - Number of chunks to retrieve (default: 3)
     * @returns {Promise<Array<{text, source, title, score}>>}
     */
    async retrieve(query, topK) { ... }

    /**
     * Format retrieved chunks into a context string for the LLM.
     * @param {Array} chunks - Retrieved chunks
     * @returns {string} - Formatted context block
     */
    formatContext(chunks) { ... }

    /**
     * Index a user file (called on file save in editor).
     * Chunks the file, embeds, and adds to vector store.
     * @param {string} filePath
     * @param {string} content
     */
    async indexUserFile(filePath, content) { ... }

    /**
     * Check if the RAG system is ready.
     * @returns {boolean}
     */
    isReady() { ... }

    /**
     * Get RAG stats for debugging.
     */
    getStats() { ... }
}
```

---

## 6. Phase 3: Brain (Context & Prompt Engineering)

### 6.1 — `public/ai/context-manager.js`

The "brain" — assembles the full prompt from all sources.

```javascript
/**
 * ContextManager — Builds the complete LLM prompt by combining:
 *   1. System prompt (persona + rules)
 *   2. RAG context (relevant documentation)
 *   3. Active file context (current editor content)
 *   4. Tool definitions (available actions)
 *   5. Conversation history (sliding window)
 *   6. User's current message
 *
 * Respects token budget at all times.
 */
export class ContextManager {
    constructor(ragEngine, toolRegistry, config) { ... }

    /**
     * Build the complete prompt for the LLM.
     * @param {string} userMessage - Current user query
     * @param {Array} history - Conversation history [{role, content}]
     * @param {object} editorContext - { filePath, fileContent, cursorPosition, selection }
     * @returns {Promise<string>} - Complete formatted prompt
     */
    async buildPrompt(userMessage, history, editorContext) { ... }

    /**
     * Get the system prompt.
     * @returns {string}
     */
    getSystemPrompt() { ... }

    /**
     * Prune conversation history to fit token budget.
     * Keeps the most recent messages within the allocated token budget.
     * @param {Array} history
     * @param {number} maxTokens
     * @returns {Array}
     */
    pruneHistory(history, maxTokens) { ... }

    /**
     * Format editor context with truncation.
     * @param {object} ctx
     * @param {number} maxTokens
     * @returns {string}
     */
    formatEditorContext(ctx, maxTokens) { ... }

    /**
     * Parse LLM response for tool calls.
     * Detects JSON tool-call blocks in the response.
     * @param {string} response
     * @returns {{ text: string, toolCalls: Array<{name, args}> }}
     */
    parseResponse(response) { ... }
}
```

**System Prompt (hardcoded in context-manager.js):**

```
You are IRAB, the AI assistant for Vortex Game Studio.
You are an expert in the ketebe ENGINE, which supports three game types:
rpg-topdown, platformer-2d, and iso-pixel.

RULES:
1. Only use ketebe ENGINE APIs. Never invent functions that don't exist.
2. When suggesting code, use JavaScript and follow Vortex conventions.
3. If you don't know something, say so. Never hallucinate API methods.
4. When the user asks you to perform an action, use the available tools.
5. Format code in ```javascript blocks.
6. Keep responses concise — under 200 words unless code is needed.

AVAILABLE CONTEXT:
- You will receive relevant documentation chunks under [DOCS].
- You will receive the currently open file under [FILE].
- You may have access to tools under [TOOLS].

TOOL USE FORMAT:
When you want to use a tool, output a JSON block:
```tool
{"name": "toolName", "args": {"param1": "value1"}}
```
Wait for user confirmation before the tool executes.
```

### 6.2 — Response Parsing

The ContextManager parses LLM output to detect:

1. **Plain text responses** — displayed as-is in chat
2. **Code blocks** — displayed with syntax highlighting + "Apply" button
3. **Tool call blocks** — parsed, shown to user for confirmation, then executed

```
Detection regex for tool calls:
/```tool\s*\n({[\s\S]*?})\s*\n```/g
```

---

## 7. Phase 4: Agentic Capabilities (Tool Use)

### 7.1 — `public/ai/tool-registry.js`

The Command Bus — defines all actions the AI can take.

```javascript
/**
 * ToolRegistry — Defines and executes all studio actions available to the AI.
 *
 * Each tool has:
 *   - name: Unique identifier
 *   - description: What it does (included in LLM prompt)
 *   - parameters: JSON Schema of accepted args
 *   - requiresConfirmation: boolean (write ops = true, read ops = false)
 *   - execute: async function that performs the action
 *   - undo: function to reverse the action (optional, for undo stack)
 */
export class ToolRegistry {
    constructor(eventBus, projectState) { ... }

    /**
     * Register a tool.
     * @param {object} toolDef - Tool definition object
     */
    register(toolDef) { ... }

    /**
     * Get all tool definitions formatted for the LLM prompt.
     * @returns {string} - JSON Schema descriptions of all tools
     */
    getToolPrompt() { ... }

    /**
     * Execute a tool by name with given arguments.
     * If requiresConfirmation, delegates to PermissionGate first.
     * @param {string} name
     * @param {object} args
     * @returns {Promise<{success: boolean, result: any, error?: string}>}
     */
    async execute(name, args) { ... }

    /**
     * Get tool definition by name.
     * @param {string} name
     * @returns {object|null}
     */
    getTool(name) { ... }

    /**
     * List all registered tools.
     * @returns {Array<{name, description, requiresConfirmation}>}
     */
    listTools() { ... }
}
```

**Built-in Tools (Initial Set):**

| Tool Name | Description | Confirmation? | Category |
|-----------|-------------|---------------|----------|
| `readFile` | Read a file's content | ❌ No | Read |
| `listFiles` | List files in a directory | ❌ No | Read |
| `searchFiles` | Search for text in project files | ❌ No | Read |
| `getProjectInfo` | Get current project metadata | ❌ No | Read |
| `getCurrentFile` | Get active editor file content | ❌ No | Read |
| `createFile` | Create a new file with content | ✅ Yes | Write |
| `editFile` | Modify a file's content | ✅ Yes + Diff | Write |
| `deleteFile` | Delete a file | ✅ Yes | Write |
| `createScript` | Create a new game script | ✅ Yes | Write |
| `addGameObject` | Add object to current scene | ✅ Yes | Write |
| `changeSceneSettings` | Modify scene properties | ✅ Yes | Write |
| `navigateTo` | Open an editor (e.g., "quest editor") | ❌ No | Navigation |
| `openFile` | Open a file in the code editor | ❌ No | Navigation |
| `insertCodeAtCursor` | Insert code at cursor position | ✅ Yes | Write |
| `replaceSelection` | Replace selected code | ✅ Yes + Diff | Write |

**Tool Definition Example:**

```javascript
{
    name: 'createScript',
    description: 'Create a new JavaScript game script in the project.',
    parameters: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Script filename (without .js)' },
            content: { type: 'string', description: 'JavaScript code content' },
            directory: { type: 'string', description: 'Target directory', default: 'data/logic' }
        },
        required: ['name', 'content']
    },
    requiresConfirmation: true,
    execute: async (args) => {
        const path = `${args.directory || 'data/logic'}/${args.name}.js`;
        const res = await fetch('/api/ide/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: path, content: args.content })
        });
        if (!res.ok) throw new Error(`Failed to create ${path}`);
        return { path, message: `Created script: ${path}` };
    },
    undo: async (args, result) => {
        // Delete the created file
        await fetch(`/api/ide/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: result.path })
        });
    }
}
```

### 7.2 — `public/ai/permission-gate.js`

The safety layer — "May I?" system.

```javascript
/**
 * PermissionGate — Ensures user consent before any write/delete operation.
 *
 * Features:
 *   - Confirmation modal with action description
 *   - Diff view for code changes (using Monaco DiffEditor)
 *   - "Always allow" option per tool (session-scoped)
 *   - All confirmed actions added to SharedProjectState undo stack
 */
export class PermissionGate {
    constructor(projectState, config) { ... }

    /**
     * Request permission for a tool action.
     * Shows a modal with action details and waits for user response.
     * @param {object} toolDef - Tool definition
     * @param {object} args - Tool arguments
     * @param {object} context - Additional context (e.g., old content for diff)
     * @returns {Promise<'approved'|'rejected'|'always'>}
     */
    async requestPermission(toolDef, args, context) { ... }

    /**
     * Show a diff view for code changes.
     * Uses Monaco's built-in DiffEditor.
     * @param {string} oldContent - Original code
     * @param {string} newContent - Proposed code
     * @param {string} filePath - File being modified
     * @returns {Promise<'apply'|'reject'|'edit'>}
     */
    async showDiff(oldContent, newContent, filePath) { ... }

    /**
     * Record an action in the undo stack.
     * @param {string} toolName
     * @param {object} args
     * @param {object} result
     * @param {function} undoFn
     */
    recordAction(toolName, args, result, undoFn) { ... }

    /**
     * Check if a tool has "always allow" permission.
     * @param {string} toolName
     * @returns {boolean}
     */
    isAlwaysAllowed(toolName) { ... }

    /**
     * Create the confirmation modal DOM element.
     * @private
     */
    _createModal() { ... }

    /**
     * Create the diff viewer DOM element.
     * Uses Monaco DiffEditor component.
     * @private
     */
    _createDiffViewer() { ... }
}
```

**Confirmation Modal UI:**

```
┌─────────────────────────────────────────┐
│  🤖 IRAB wants to: Create Script        │
│─────────────────────────────────────────│
│                                         │
│  Action: createScript                   │
│  File: data/logic/enemy_patrol.js       │
│  Content: (click to preview)            │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │  // Enemy patrol logic              ││
│  │  function patrol(enemy) {           ││
│  │    const waypoints = [...]          ││
│  │  }                                  ││
│  └─────────────────────────────────────┘│
│                                         │
│  [  Reject  ]  [ Always Allow ] [Apply] │
└─────────────────────────────────────────┘
```

**Diff View (for editFile / replaceSelection):**

```
┌─────────────────────────────────────────────────┐
│  📝 Code Change: data/logic/enemy_ai.js         │
│─────────────────────────────────────────────────│
│  ┌─────────────────┬───────────────────────────┐│
│  │  ORIGINAL       │  PROPOSED                 ││
│  │─────────────────┼───────────────────────────││
│  │- let hp = 100;  │+ let hp = 150;            ││
│  │  let speed = 2; │  let speed = 2;           ││
│  │- let dmg = 10;  │+ let dmg = 15;            ││
│  └─────────────────┴───────────────────────────┘│
│                                                 │
│  [  Reject  ]              [  Apply Changes  ]  │
└─────────────────────────────────────────────────┘
```

---

## 8. Phase 5: UI/UX Integration

### 8.1 — `public/ai-chat-ui.js` + `public/ai-chat-ui.css`

Revamped chat panel that replaces IRAB's chat UI (while keeping the avatar).

**UI Components:**

```
┌─ Ctrl+K Spotlight Modal ──────────────────────────────────┐
│                                                            │
│  ┌─ Header ──────────────────────────────────────────────┐│
│  │  🧠 IRAB · Vortex AI        [WebGPU ✓]  [RAG ✓]  [×] ││
│  └────────────────────────────────────────────────────────┘│
│                                                            │
│  ┌─ Chat History (scrollable) ───────────────────────────┐│
│  │                                                        ││
│  │  👤 How do I add an NPC to my scene?                   ││
│  │                                                        ││
│  │  🤖 To add an NPC, you can use the NPC Editor or       ││
│  │     do it programmatically:                            ││
│  │     ┌──────────────────────────────────────────┐       ││
│  │     │ const npc = new NPC({                    │       ││
│  │     │   name: 'Guard',                         │       ││
│  │     │   position: { x: 100, y: 200 },         │       ││
│  │     │   sprite: 'guard_idle'                   │       ││
│  │     │ });                                      │       ││
│  │     │                      [ Copy ] [ Apply ]  │       ││
│  │     └──────────────────────────────────────────┘       ││
│  │                                                        ││
│  │  🤖 Want me to create this NPC for you?                ││
│  │     [ ✅ Yes, add NPC ] [ ❌ No thanks ]               ││
│  │                                                        ││
│  └────────────────────────────────────────────────────────┘│
│                                                            │
│  ┌─ Input ───────────────────────────────────────────────┐│
│  │  Ask IRAB anything...                          [ ⏎ ]  ││
│  └────────────────────────────────────────────────────────┘│
│                                                            │
│  ┌─ Status Bar ──────────────────────────────────────────┐│
│  │  Model: Qwen2.5-Coder-0.5B · Backend: WebGPU · 23ms  ││
│  └────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

**Key Features:**

1. **Spotlight Modal** — Centered overlay (like VS Code command palette), triggered by Ctrl+K
2. **Token Streaming** — Characters appear one by one as LLM generates
3. **Code Blocks** — Syntax highlighted with "Copy" and "Apply" buttons
4. **Action Buttons** — Inline confirmation for tool use ("Add this NPC?")
5. **Status Bar** — Shows model name, backend (WebGPU/WASM), inference time
6. **Download Progress** — Shows model download progress on first use
7. **Keyboard Navigation** — Escape to close, Enter to send, Up arrow for history

### 8.2 — Ghost Text Autocomplete (Monaco Integration)

Added to `public/script_editor.js` and `public/ide.js`.

```javascript
/**
 * Register an inline completion provider for Monaco Editor.
 * Shows "ghost text" suggestions as the user types.
 *
 * Trigger: Pause in typing (500ms debounce)
 * Display: Greyed-out text after cursor (Tab to accept)
 * Cancel: Any keypress or Escape
 */
monaco.languages.registerInlineCompletionsProvider('javascript', {
    provideInlineCompletions: async (model, position, context, token) => {
        // 1. Get surrounding code context (±20 lines around cursor)
        // 2. Send to VortexAI.complete() for short completion
        // 3. Return as inline suggestion
        // 4. Debounce to avoid spamming the model
    },
    freeInlineCompletions: () => {}
});
```

**Implementation Notes:**
- Only triggers after 500ms of no typing (debounced)
- Uses a shorter `maxNewTokens` (64) for fast completions
- Only active when `AI_CONFIG.features.enableGhostText` is true
- Shows a subtle "AI" indicator next to ghost text
- Tab accepts, Escape dismisses

### 8.3 — `public/assistant.js` Modifications

Minimal changes to bridge IRAB v11 with the new AI system:

```javascript
// What changes in assistant.js:
// 1. Replace the fetch('/api/ai/chat') call with VortexAI.chat()
// 2. Keep all personality, avatar, proactive triggers intact
// 3. Use ai-chat-ui.js for the chat panel instead of inline HTML
// 4. Add event listeners for AI state changes (model loading, etc.)

// The avatar, drag behavior, idle tips, undo detection — ALL STAY.
// Only the "brain" (inference) changes from server API → local model.
```

### 8.4 — `public/tools.html` Modifications

```html
<!-- Add before </body>, after assistant.js -->
<link rel="stylesheet" href="ai-chat-ui.css">
<script type="module">
    import { VortexAI } from './ai/ketebe-ai.js';
    window.VortexAI = new VortexAI();
    // VortexAI auto-registers with IRAB (assistant.js) via EventBus
</script>
```

---

## 9. Technical Specifications

### 9.1 — `public/ai/ketebe-ai.js` (Main Orchestrator)

```javascript
/**
 * VortexAI — Main entry point and orchestrator for the AI system.
 *
 * Coordinates all subsystems:
 *   - InferenceEngine (LLM)
 *   - RAGEngine (document retrieval)
 *   - ContextManager (prompt building)
 *   - ToolRegistry (action execution)
 *   - PermissionGate (safety)
 *   - ModelManager (lifecycle)
 *
 * Public API (used by assistant.js and editors):
 */
export class VortexAI {
    constructor() { ... }

    /**
     * Initialize the AI system (lazy — doesn't load models yet).
     * Sets up event listeners, tool registry, and UI hooks.
     * @returns {Promise<void>}
     */
    async initialize() { ... }

    /**
     * Send a chat message and get a response.
     * This is the main interaction method.
     * @param {string} message - User's message
     * @param {object} options - { stream: boolean, editorContext: object }
     * @returns {Promise<{text: string, toolCalls: Array}>}
     *
     * If stream is true, emits 'ai:token' events on EventBus.
     */
    async chat(message, options) { ... }

    /**
     * Get a code completion (for ghost text).
     * Shorter, faster generation optimized for inline suggestions.
     * @param {string} prefix - Code before cursor
     * @param {string} suffix - Code after cursor
     * @param {string} filePath - Current file path
     * @returns {Promise<string>} - Suggested completion text
     */
    async complete(prefix, suffix, filePath) { ... }

    /**
     * Activate the AI system (download model if needed).
     * Called when user first opens the AI panel.
     * @returns {Promise<void>}
     */
    async activate() { ... }

    /**
     * Deactivate and free resources.
     */
    async deactivate() { ... }

    /**
     * Get current status of the AI system.
     * @returns {{
     *   modelState: string,
     *   backend: string,
     *   ragReady: boolean,
     *   toolCount: number,
     *   storageUsed: number
     * }}
     */
    getStatus() { ... }

    /**
     * Check if the AI system is ready for inference.
     * @returns {boolean}
     */
    isReady() { ... }

    /**
     * Fallback: Use server API if local model not available.
     * Seamlessly falls back to /api/ai/chat endpoint.
     * @param {string} message
     * @returns {Promise<string>}
     */
    async fallbackToServer(message) { ... }

    /**
     * Clear conversation history.
     */
    clearHistory() { ... }

    /**
     * Export conversation for debugging.
     * @returns {Array}
     */
    exportHistory() { ... }
}
```

### 9.2 — Dual-Mode Operation (Local + Server Fallback)

```
User sends message
        │
        ▼
   Is local model loaded?
   ┌──────┴──────┐
   │ YES         │ NO
   ▼             ▼
   Local LLM     Is model cached?
   inference     ┌──────┴──────┐
   (WebGPU/      │ YES         │ NO
    WASM)        ▼             ▼
   │        Load from      Is server API
   │        cache          configured?
   │        │         ┌──────┴──────┐
   │        │         │ YES         │ NO
   │        │         ▼             ▼
   │        │    Server fallback   Show "Download
   │        │    (/api/ai/chat)    Model" prompt
   │        │         │             │
   ▼        ▼         ▼             ▼
   Response  Response  Response    Download UI
```

### 9.3 — Memory Management Strategy

```javascript
// Model lifecycle states and transitions:
//
// IDLE ──(user opens AI)──► LOADING ──(ready)──► ACTIVE
//   ▲                                              │
//   │                                              │
//   └──────(5 min idle)──── DISPOSING ◄────────────┘
//
// Memory budget targets:
//   - LLM model (Qwen 0.5B q4): ~300MB VRAM/RAM
//   - Embedding model (MiniLM): ~23MB RAM
//   - Vector store: ~5MB RAM (255 chunks × 384-dim vectors)
//   - Chat history: ~50KB RAM
//   - Total peak: ~330MB
//   - After dispose: ~28MB (embedding model + vector store only)
```

### 9.4 — EventBus Events (AI System)

| Event | Payload | Emitted By |
|-------|---------|-----------|
| `ai:model:progress` | `{ modelId, percent, status }` | ModelManager |
| `ai:model:ready` | `{ modelId, backend }` | ModelManager |
| `ai:model:disposed` | `{ modelId }` | ModelManager |
| `ai:token` | `{ token, partial }` | InferenceEngine |
| `ai:response:complete` | `{ text, toolCalls }` | VortexAI |
| `ai:tool:request` | `{ toolName, args }` | ContextManager |
| `ai:tool:approved` | `{ toolName, args }` | PermissionGate |
| `ai:tool:rejected` | `{ toolName }` | PermissionGate |
| `ai:tool:executed` | `{ toolName, result }` | ToolRegistry |
| `ai:tool:error` | `{ toolName, error }` | ToolRegistry |
| `ai:error` | `{ message, code }` | Any |
| `ai:status` | `{ state, backend, ragReady }` | VortexAI |
| `ai:rag:indexed` | `{ filePath }` | RAGEngine |
| `ai:ghost:suggest` | `{ text, position }` | VortexAI |

### 9.5 — Error Handling Strategy

| Error Type | Handling |
|-----------|---------|
| WebGPU not available | Fall back to WASM with user notification |
| Model download fails | Retry 3x with exponential backoff, then offer server fallback |
| Model load OOM | Suggest closing other tabs, offer smaller model or server fallback |
| Inference timeout (30s) | Cancel generation, show partial result, suggest retry |
| Tool execution fails | Show error in chat, don't retry automatically, offer manual fix |
| RAG search fails | Proceed without RAG context, note in response |
| OPFS/Cache full | Prompt user to clear cache, show storage usage |
| Worker crash | Restart worker, reload model, notify user |
| Embedding fails | Fall back to keyword-only search |
| Token limit exceeded | Truncate context intelligently (RAG first, then history) |

---

## 10. Risk Mitigation

### 10.1 — Performance Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Model too slow on CPU (WASM) | High | Medium | Show "WebGPU recommended" banner; limit max tokens on WASM |
| UI freezes during inference | Low | High | All inference in Web Workers; never on main thread |
| Memory pressure crashes tab | Medium | High | Aggressive dispose timer; monitor `performance.memory`; warn at 80% |
| Large project slows RAG indexing | Low | Low | Index only active/recently-edited files; background worker |

### 10.2 — Quality Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| 0.5B model hallucinate APIs | High | Medium | Strong system prompt + RAG forces correct API references |
| Model generates unsafe code | Medium | Medium | All write ops require confirmation; sandboxed execution |
| RAG returns irrelevant chunks | Medium | Low | Hybrid search (vector + keyword); tuned similarity threshold |
| Tool calls with wrong args | Medium | Medium | JSON Schema validation before execution; type checking |

### 10.3 — Compatibility Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Browser doesn't support WebGPU | Medium | Low | WASM fallback always available |
| Transformers.js v3 breaking changes | Medium | Medium | Pin exact version; integration tests |
| OPFS not available | Low | Low | Fall back to Cache API → IndexedDB → re-download |
| Electron's Chromium too old | Low | Medium | Check minimum Electron version (v40 should be fine) |

---

## 11. Master Task Checklist

### Phase 1: Core Engine (WebGPU & Model Loading)

- [ ] **1.1** Create `public/ai/` directory structure
- [ ] **1.2** Implement `public/ai/config.js` — all constants and configuration
- [ ] **1.3** Implement `public/ai/model-manager.js` — download, cache, load, dispose lifecycle
- [ ] **1.4** Implement `public/ai/inference-worker.js` — Web Worker for LLM inference
- [ ] **1.5** Implement `public/ai/inference-engine.js` — main thread API to worker
- [ ] **1.6** Implement `public/ai/tokenizer-utils.js` — token counting and budgeting
- [ ] **1.7** Add WebGPU detection with WASM fallback
- [ ] **1.8** Add model download progress events (EventBus integration)
- [ ] **1.9** Add idle timer for automatic model disposal (5 min)
- [ ] **1.10** Test: Model loads on WebGPU, generates "Hello World" response
- [ ] **1.11** Test: Fallback to WASM when WebGPU unavailable
- [ ] **1.12** Test: Model caching persists across browser restarts
- [ ] **1.13** Test: Model disposes after idle timeout and reloads on demand

### Phase 2: RAG System (Local Knowledge Base)

- [ ] **2.1** Create `public/ai/docs/build-corpus.js` — build-time doc processor
- [ ] **2.2** Process all documentation sources into `corpus.json`
- [ ] **2.3** Implement `public/ai/embedding-worker.js` — Web Worker for embeddings
- [ ] **2.4** Implement `public/ai/vector-store.js` — Orama-based vector DB
- [ ] **2.5** Implement `public/ai/rag-engine.js` — retrieval pipeline
- [ ] **2.6** Add hybrid search (vector similarity + keyword matching)
- [ ] **2.7** Add dynamic user script indexing (on file save)
- [ ] **2.8** Add IndexedDB persistence for vector store
- [ ] **2.9** Add `npm run build:corpus` script to package.json
- [ ] **2.10** Add `/api/ai/docs` endpoint to server.js for serving corpus.json
- [ ] **2.11** Test: Query "How do I create an NPC?" returns relevant doc chunks
- [ ] **2.12** Test: User script indexing works after file save
- [ ] **2.13** Test: RAG retrieval completes in under 200ms

### Phase 3: Brain (Context & Prompt Engineering)

- [ ] **3.1** Implement `public/ai/context-manager.js` — prompt assembly
- [ ] **3.2** Design and embed the system prompt
- [ ] **3.3** Implement token budget allocation (system/RAG/history/user/generation)
- [ ] **3.4** Implement conversation history pruning (sliding window)
- [ ] **3.5** Implement editor context extraction (current file, cursor, selection)
- [ ] **3.6** Implement tool call parsing from LLM response
- [ ] **3.7** Test: Full prompt fits within 2048 token window
- [ ] **3.8** Test: Model responds correctly about Vortex APIs with RAG context
- [ ] **3.9** Test: Model doesn't hallucinate non-existent APIs
- [ ] **3.10** Test: History pruning keeps most recent relevant messages

### Phase 4: Agentic Capabilities (Tool Use)

- [ ] **4.1** Implement `public/ai/tool-registry.js` — command bus
- [ ] **4.2** Define all read tools: readFile, listFiles, searchFiles, getProjectInfo, getCurrentFile
- [ ] **4.3** Define all write tools: createFile, editFile, deleteFile, createScript
- [ ] **4.4** Define scene tools: addGameObject, changeSceneSettings
- [ ] **4.5** Define navigation tools: navigateTo, openFile
- [ ] **4.6** Define editor tools: insertCodeAtCursor, replaceSelection
- [ ] **4.7** Implement `public/ai/permission-gate.js` — confirmation modal
- [ ] **4.8** Implement diff view using Monaco DiffEditor
- [ ] **4.9** Integrate with SharedProjectState undo/redo stack
- [ ] **4.10** Add "Always Allow" per-tool session permission
- [ ] **4.11** Add JSON Schema validation for tool arguments
- [ ] **4.12** Test: AI requests tool use → modal appears → user approves → action executes
- [ ] **4.13** Test: User rejects tool use → no action taken
- [ ] **4.14** Test: Diff view shows correct changes for editFile
- [ ] **4.15** Test: Ctrl+Z undoes AI-executed actions
- [ ] **4.16** Test: Invalid tool arguments are caught and reported

### Phase 5: UI/UX Integration

- [ ] **5.1** Implement `public/ai-chat-ui.js` — spotlight modal chat panel
- [ ] **5.2** Implement `public/ai-chat-ui.css` — styling (retro-pixel theme compatible)
- [ ] **5.3** Add token streaming display (character by character)
- [ ] **5.4** Add code block rendering with syntax highlighting
- [ ] **5.5** Add "Copy" and "Apply" buttons for code blocks
- [ ] **5.6** Add inline action buttons for tool confirmations
- [ ] **5.7** Add model download progress UI (progress bar + tips/Vortex facts)
- [ ] **5.8** Add status bar (model info, backend, inference time)
- [ ] **5.9** Add keyboard navigation (Ctrl+K open, Escape close, Enter send, Up history)
- [ ] **5.10** Modify `public/assistant.js` — bridge IRAB avatar to new AI backend
- [ ] **5.11** Modify `public/tools.html` — load AI modules
- [ ] **5.12** Add ghost text provider to `public/script_editor.js`
- [ ] **5.13** Add ghost text provider to `public/ide.js`
- [ ] **5.14** Test: Ctrl+K opens chat, Escape closes
- [ ] **5.15** Test: Messages stream token by token
- [ ] **5.16** Test: Code blocks have working Copy/Apply buttons
- [ ] **5.17** Test: Ghost text appears after typing pause in Monaco
- [ ] **5.18** Test: Download progress shows on first activation

### Phase 6: Integration & Polish

- [ ] **6.1** Implement server fallback mode (when local model unavailable)
- [ ] **6.2** Add AI configuration panel (model selection, feature toggles)
- [ ] **6.3** Add storage management UI (cache size, clear cache)
- [ ] **6.4** Add error recovery and user-friendly error messages
- [ ] **6.5** Performance profiling and optimization
- [ ] **6.6** Cross-browser testing (Chrome, Edge, Firefox, Safari)
- [ ] **6.7** Electron environment testing
- [ ] **6.8** Update `public/lib/monaco/ketebe.d.ts` with AI type definitions
- [ ] **6.9** Update `public/copilot-instructions.md` with AI architecture docs
- [ ] **6.10** Add `@xenova/transformers` and `orama` to package.json dependencies
- [ ] **6.11** Final integration test: full conversation with RAG + tool use + undo

---

## Appendix A: Dependency Versions

| Package | Version | Size (gzip) | Purpose |
|---------|---------|-------------|---------|
| `@xenova/transformers` | `^3.0.0` | ~1.5MB | LLM inference (WebGPU/WASM) |
| `@orama/orama` | `^3.0.0` | ~15KB | Vector + full-text search |
| Qwen2.5-Coder-0.5B-Instruct (ONNX q4) | - | ~300MB | LLM model weights (downloaded on demand) |
| all-MiniLM-L6-v2 (ONNX int8) | - | ~23MB | Embedding model (downloaded on demand) |

## Appendix B: Browser Compatibility

| Feature | Chrome 113+ | Edge 113+ | Firefox 120+ | Safari 18+ |
|---------|------------|-----------|--------------|-----------|
| WebGPU | ✅ | ✅ | ⚠️ Flag | ✅ |
| WASM | ✅ | ✅ | ✅ | ✅ |
| Web Workers | ✅ | ✅ | ✅ | ✅ |
| Cache API | ✅ | ✅ | ✅ | ✅ |
| IndexedDB | ✅ | ✅ | ✅ | ✅ |
| OPFS | ✅ | ✅ | ✅ | ⚠️ Partial |

## Appendix C: Token Budget Allocation (2048 total)

| Component | Tokens | Purpose |
|-----------|--------|---------|
| System Prompt | 400 | Persona, rules, tool definitions |
| RAG Context | 300 | Top-3 retrieved documentation chunks |
| Chat History | 300 | Last 3-6 messages (pruned) |
| Editor Context | 200 | Current file around cursor |
| User Message | 200 | Current query |
| Generation | 512 | Model's response |
| **Buffer** | **136** | **Safety margin** |

## Appendix D: File Modification Summary

### New Files (14)
1. `public/ai/ketebe-ai.js`
2. `public/ai/inference-engine.js`
3. `public/ai/inference-worker.js`
4. `public/ai/rag-engine.js`
5. `public/ai/vector-store.js`
6. `public/ai/embedding-worker.js`
7. `public/ai/context-manager.js`
8. `public/ai/tool-registry.js`
9. `public/ai/permission-gate.js`
10. `public/ai/model-manager.js`
11. `public/ai/tokenizer-utils.js`
12. `public/ai/config.js`
13. `public/ai-chat-ui.js`
14. `public/ai-chat-ui.css`

### Build-Time Files (2)
15. `public/ai/docs/build-corpus.js`
16. `public/ai/docs/corpus.json` (generated)

### Modified Files (7)
17. `public/assistant.js` — Bridge to VortexAI
18. `public/tools.html` — Load AI modules
19. `public/script_editor.js` — Ghost text provider
20. `public/ide.js` — Ghost text provider
21. `public/lib/monaco/ketebe.d.ts` — AI type definitions
22. `server.js` — Corpus serving endpoint
23. `package.json` — New dependencies
