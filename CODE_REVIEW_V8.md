# Code Review: Vortex Engine (v8.0 - AI Micro Edition)

**Review Date:** March 6, 2026  
**Status:** Post-Phase 2 (RAG & Local Inference)  
**Scope:** Core Architecture, Vortex AI (IRAB Cortex), Server-Side, and Engine Integration

---

## Executive Summary

The Vortex Engine has evolved significantly since the previous audit (Feb 2026). The transition to **Vortex AI Micro Edition (IRAB Cortex)** marks a shift toward browser-native/local-first agentic capabilities. The architecture remains a robust hybrid of Node.js (Studio/Orchestration), Python (Local LLM/RAG), and a multi-core JavaScript engine (IsoPixel, RPG, Platformer). 

The "shadow filesystem" pattern for project-based overrides continues to be a primary strength, allowing lightweight project portability without bloating the core engine.

---

## Architectural Deep-Dive

### 1. Vortex AI Micro Edition (IRAB Cortex)
The new AI subsystem is the highlight of v8.0. It successfully implements a local-first RAG pipeline.
- **Model**: Qwen2.5-Coder-1.5B-Instruct-GGUF (Q4_K_M) running via `llama-cpp-python`.
- **RAG Engine**: A custom `NumpyVectorStore` using `SentenceTransformers` (all-MiniLM-L6-v2) for embeddings. This is a brilliant choice for a "Micro Edition" as it avoids the overhead of ChromaDB or Pinecone while maintaining high performance for project-scale context.
- **Protocol (KAP)**: The system uses a JSON-in-Markdown tool-calling protocol that allows the LLM to trigger Studio actions (e.g., terrain generation, file updates) directly via WebSockets.

### 2. Engine Cores
- **IsoPixel**: Features a fixed-timestep loop with interpolation and a custom occlusion buffer. Recent updates added vegetation generation and NPC spawning.
- **Platformer**: Uses a simplified AABB physics model.
- **RPG**: Logic-heavy core utilizing an on-demand script loader.

### 3. Server Layer
The Node.js server acts as the primary orchestrator, managing project state, asset resolution, and proxying AI requests.

---

## Strengths

1. **Local-First AI**: Zero-cost, privacy-focused AI integration that doesn't rely on external APIs.
2. **Deterministic Intent Routing**: `backend/main.py` correctly intercepts specific high-value intents (like "iso map generation") to bypass LLM hallucinations and trigger reliable engine tools.
3. **Smart Ingestion**: The RAG system prioritizes "Manifesto" files (README, MANIFESTO, architecture docs) over raw code, ensuring the AI understands *intent* before *implementation*.
4. **Security**: Strong path guards and COEP/COOP headers are consistently applied, protecting against directory traversal and enabling advanced web features (SharedArrayBuffer).

---

## Technical Debt & Issues

### 1. Server Monolith Bloat (Critical)
`server.js` has become a "catch-all" for new experimental APIs.
- **Issue**: The `api/project-file` (IIFE) and `api/save-spritesheet` logic are implemented directly in `server.js`.
- **Recommendation**: Move these into `server/routes/ide.js` or separate service modules to keep the entry point clean.

### 2. RAG Persistence Security
- **Issue**: The `NumpyVectorStore` uses Python's `pickle` for persistence. While functional, `pickle` is inherently insecure if the store file is ever tampered with.
- **Recommendation**: Switch to a safer format like `safetensors` (for embeddings) and JSON (for metadata) or use a lightweight SQLite-based vector extension.

### 3. Brittle AI Warmup
- **Issue**: `backend/main.py` uses a `asyncio.sleep(10)` buffer before starting the RAG scan to avoid OOM/race conditions during model warmup.
- **Recommendation**: Implement a proper event-driven signal (e.g., `BrainReadyEvent`) to trigger the RAG scan only after the model is confirmed to be fully loaded in Metal/CUDA memory.

### 4. Duplicate Route Logic
- **Issue**: `POST /api/projects` and `POST /api/projects/create` in `server/routes/projects.js` still share significant redundant code.
- **Recommendation**: Consolidate into a `ProjectFactory` service.

### 5. Spritesheet Pipeline
- **Issue**: `api/save-spritesheet` is hardcoded for a `platformer_spritesheet.png` with a 16x16 grid. This breaks the "multi-engine" philosophy.
- **Recommendation**: Accept grid dimensions and target filenames as parameters to support IsoPixel and RPG tilesets.

---

## Recent Improvements (Verified)

- ✅ **WebSocket Options**: Now correctly passing `rootDir` and `getActiveProject`.
- ✅ **File Watcher**: `startFileWatcher()` is active, enabling hot-reloading for Studio tools.
- ✅ **CORS/Proxy**: The `IRAB_BACKEND` proxy in `server.js` now has proper timeout handling (10s) and error reporting (502).
- ✅ **MIME Types**: Explicitly defining ESM (`mjs`) and WASM types, critical for modern browser engine support.

---

## Strategic Recommendations

1. **Unify Engine Shared Logic**: Create a `public/engines/shared` library for common math, collision, and event-bus logic to reduce duplication across IsoPixel and Platformer cores.
2. **Incremental RAG**: The current `watcher.py` triggers full file ingestion on change. For large projects, this should move to a more granular diff-based embedding update.
3. **UI/UX Polish**: The "MSN Retro" style is a unique differentiator; ensure this aesthetic is consistent across the new IsoPixel Studio panels.
4. **Mobile Optimization**: With Capacitor in the stack, ensure the AI Micro Edition can fall back to `onnxruntime-web` (WebGPU) when the Python backend is unavailable (e.g., on Android/iOS).

---

**Reviewer:** Gemini (Project AI)  
**Conclusion:** The Vortex Engine is in its most stable and capable state yet. The integration of local AI context (Context 3.0) significantly lowers the barrier for complex game creation within the studio.
