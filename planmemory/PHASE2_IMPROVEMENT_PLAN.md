# 🚀 Phase 2 Improvement Plan: Advanced RAG System

**Status:** Planned  
**Target:** High-Precision, Low-Latency Local Knowledge Base

While the basic RAG system works, it lacks the precision and efficiency required for a professional studio assistant. This plan outlines the transition from simple character-chunking to a semantically-aware, persistent local knowledge engine.

---

## 🎯 Objectives

1.  **Semantic Chunking**: Move away from fixed character counts. Chunk by Markdown headers, JSDoc blocks, and logical code structures.
2.  **IndexedDB Persistence**: Cache the Orama database locally so we don't fetch/index the 5MB corpus on every page load.
3.  **Hybrid Search Optimization**: Fine-tune the balance between vector similarity (semantic) and BM25 (keyword) search.
4.  **Metadata Enrichment**: Embed source hierarchy (e.g., "EventBus > on()") into chunks to improve LLM reasoning.
5.  **Delta Updates**: Only re-index changed user files rather than full project scans.

---

## 🛠 Refactoring Tasks

### 1. Advanced Corpus Generation (`public/ai/docs/build-corpus.js`)
- [ ] Implement `MarkdownSplitter`: Splits by `#`, `##`, `###` while maintaining parent context.
- [ ] Implement `JSDocSplitter`: Extracts API signatures and descriptions as atomic units.
- [ ] Add `Context Injection`: Prepend the title and source to every chunk (e.g., "Context: [EventBus API] ... chunk text").
- [ ] Generate a `corpus-manifest.json` with version hashes to detect updates.

### 2. Persistent Vector Store (`public/ai/vector-store.js`)
- [ ] Integrate Orama's IndexedDB persistence plugin.
- [ ] Implement `checkVersion()`: Only clear and rebuild the DB if the corpus version hash changes.
- [ ] Optimize Hybrid Search: Implement a weighted scoring system (e.g., 70% vector, 30% keyword).

### 3. Smart RAG Engine (`public/ai/rag-engine.js`)
- [ ] **Lazy Loading**: Don't initialize RAG until the user actually opens the chat or starts typing code.
- [ ] **Background Sync**: Run user file indexing in the embedding worker to prevent main-thread jank.
- [ ] **Ranker**: Implement a secondary re-ranking step (simple score-based) to filter out low-relevance hits.

### 4. Memory & Storage Management
- [ ] Add a "Clear AI Cache" utility to free up IndexedDB/Cache API space.
- [ ] Implement quota monitoring (warn if AI data exceeds 500MB).

---

## 📈 Success Metrics

| Metric | Current (Baseline) | Target |
|--------|-------------------|--------|
| Init Time (Cold) | ~3-5s | < 2s |
| Init Time (Warm) | ~2s | < 500ms (Local Restore) |
| Search Relevance | ~60% | > 85% (Semantic + Keyword) |
| Memory Usage | ~100MB | < 50MB (Selective Loading) |

---

## 📋 Execution Order

1.  **Refactor Build Script**: Improve chunk quality first.
2.  **Update Vector Store**: Add persistence to save bandwidth/CPU.
3.  **Update RAG Engine**: Hook up the new persistence and optimization logic.
4.  **Verification**: Benchmark with the Phase 2 Test Suite.
