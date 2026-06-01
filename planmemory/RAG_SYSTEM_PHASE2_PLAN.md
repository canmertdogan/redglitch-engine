# RedGlitch AI - Phase 2: RAG System Development Plan

**Status:** Planned
**Target Date:** Feb 8, 2026
**Goal:** Implement a local Retrieval-Augmented Generation (RAG) system to allow RedGlitch AI to answer questions using project documentation and code context.

---

## 1. Architecture Overview

The RAG system consists of three main components:
1.  **Ingestion (Build-Time):** A Node.js script that scans documentation (`.md`, `.html`, JSDoc) and breaks it into semantic chunks saved as `public/ai/docs/corpus.json`.
2.  **Vector Store (Runtime):** Uses **Orama** (running in the browser) to index these chunks. It supports hybrid search (Vector + Full-Text).
3.  **Embedding (Runtime):** A Web Worker running `all-MiniLM-L6-v2` to convert text queries into vectors without blocking the UI.

## 2. Implementation Steps

### Step 1: Document Corpus Builder (Node.js)
**File:** `public/ai/docs/build-corpus.js`
- **Objective:** Scrape docs and code comments to build a JSON knowledge base.
- **Sources:**
    - `public/docs.html` (HTML parsing)
    - `public/docs/*.md` (Markdown parsing)
    - `public/engines/**/*.js` (JSDoc extraction)
    - `public/lib/monaco/redglitch.d.ts` (Type definitions)
- **Output:** `public/ai/docs/corpus.json` containing array of chunks: `{ id, text, source, tags, type }`.
- **Action:** Add `npm run build:corpus` to `package.json`.

### Step 2: Embedding Worker
**File:** `public/ai/embedding-worker.js`
- **Objective:** Handle heavy vector math off the main thread.
- **Model:** `Xenova/all-MiniLM-L6-v2` (Quantized, ~23MB).
- **Interface:** Accepts text/batch, returns `Float32Array`.

### Step 3: Vector Store Wrapper
**File:** `public/ai/vector-store.js`
- **Objective:** Abstraction over Orama database.
- **Features:**
    - Initialize from `corpus.json`.
    - Hybrid Search: Combine vector similarity (semantic) with Orama's BM25 (keywords).
    - Persistence: Save/Load index from IndexedDB (to avoid rebuilding on every reload).
    - Dynamic Indexing: Methods to add/remove user scripts at runtime.

### Step 4: RAG Engine
**File:** `public/ai/rag-engine.js`
- **Objective:** The "Brain" that connects the Chat UI to the Knowledge Base.
- **Flow:**
    1.  Receive User Query.
    2.  Send to Embedding Worker -> Get Vector.
    3.  Query Vector Store -> Get Top 3-5 Chunks.
    4.  Format chunks into a "Context Block" for the LLM System Prompt.

### Step 5: Server Integration
**File:** `server.js`
- **Objective:** Serve the large `corpus.json` file efficiently.
- **Action:** Add endpoint `/api/ai/docs` (though static serving might suffice, an API endpoint ensures caching control).

## 3. Execution Order

1.  **Dependency Check:** Confirm `@orama/orama` and `@xenova/transformers` are usable in Node scripts.
2.  **Create Build Script:** Implement `build-corpus.js` and generate the initial `corpus.json`.
3.  **Create Workers:** Implement `embedding-worker.js`.
4.  **Create Runtime Store:** Implement `vector-store.js`.
5.  **Create Engine:** Implement `rag-engine.js`.
6.  **Integration:** Wire it all up in `redglitch-ai.js` (from Phase 1) and test.

## 4. Verification

-   **Build Test:** Run `npm run build:corpus` and verify `corpus.json` structure/size.
-   **Search Test:** In the browser console, manually query the RAG Engine: `await redglitchAI.rag.search("How do I create an NPC?")`.
-   **End-to-End:** Ask the Chat UI a question about RedGlitch-specific API (e.g., "How does EventBus work?") and verify the response includes details from the docs.
