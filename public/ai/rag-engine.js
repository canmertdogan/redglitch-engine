/**
 * public/ai/rag-engine.js  (v2 — advanced)
 *
 * RAG pipeline: load corpus -> embed (local Transformers.js OR any OpenAI-compatible
 * endpoint) -> hybrid search -> fusion -> optional rerank -> retrieve.
 *
 * Advanced retrieval features (all optional, all degrade gracefully):
 *   - Multi-query expansion + HyDE via an injected LLM (OpenRouter/local/native)
 *   - Reciprocal Rank Fusion across dense + sparse + expanded queries
 *   - Pluggable reranker (cross-encoder or LLM)
 *   - Metadata filtering + citation formatting
 *   - Query-embedding cache + IndexedDB persistence (no re-embed on every load)
 */

import { AI_CONFIG } from './config.js';
import { VectorStore } from './vector-store.js';
import { EventBus } from './shim.js';
import {
    reciprocalRankFusion, applyMetadataFilter,
    buildMultiQueryPrompt, buildHydePrompt, parseJsonList, formatContext,
} from './rag-core.js';
import { createEmbeddingProvider } from './embedding-provider.js';
import { chunkDocument } from './chunker.js';

export class RAGEngine {
    constructor(options = {}) {
        this.vectorStore = new VectorStore();
        this.isLoaded = false;
        this.worker = null;
        this.callbacks = new Map();
        this.initializationPromise = null;
        this.epoch = 0;
        this.maxRAGChunks = AI_CONFIG.limits?.maxRAGChunks || 3;
        this.queryCache = new Map();
        this.embeddingProvider = null;
        this.options = options;
        this.lastResults = [];
    }

    async initialize() {
        if (this.isLoaded) return;
        if (this.initializationPromise) return this.initializationPromise;
        const epoch = this.epoch;
        const pending = this._initialize(epoch);
        this.initializationPromise = pending;
        try {
            await pending;
        } finally {
            if (this.initializationPromise === pending) this.initializationPromise = null;
        }
    }

    async _initialize(epoch) {
        console.log('[RAGEngine] Initializing...');
        await this.vectorStore.initialize();

        // Local embedding worker (used when embeddingsProvider !== 'openai').
        this.worker = new Worker('/ai/embedding-worker.js', { type: 'module' });
        this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
        this.worker.onerror = (e) => {
            console.error('[RAGEngine] Embedding worker crashed:', e.message || e);
            for (const cb of this.callbacks.values()) {
                try { cb.reject(new Error('Embedding worker crashed')); } catch (_) { /* settled */ }
            }
            this.callbacks.clear();
            this.worker = null;
            this.isLoaded = false;
            this.initializationPromise = null;
            EventBus.emit('ai:rag:error', { message: 'Embedding worker crashed' });
        };

        const settings = this._readSettings();
        this.embeddingProvider = createEmbeddingProvider(settings, {
            localEmbedFn: (texts) => this._embedViaWorker(texts),
        });

        await this.loadCorpus();
        if (epoch !== this.epoch) return;
        this.isLoaded = true;
        EventBus.emit('ai:rag:ready');
    }

    _readSettings() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('kai_settings');
                if (raw) return JSON.parse(raw);
            }
        } catch (_) { /* ignore */ }
        return {};
    }

    async rebuild() {
        if (this.initializationPromise) await this.initializationPromise.catch(() => {});
        this.worker?.terminate();
        for (const callback of this.callbacks.values()) callback.reject(new Error('RAG index rebuild requested.'));
        this.callbacks.clear();
        this.vectorStore = new VectorStore();
        this.worker = null;
        this.isLoaded = false;
        this.initializationPromise = null;
        this.queryCache.clear();
        await this.initialize();
    }

    shutdown() {
        this.epoch++;
        this.worker?.terminate();
        this.worker = null;
        for (const callback of this.callbacks.values()) callback.reject(new Error('AI features disabled.'));
        this.callbacks.clear();
        this.isLoaded = false;
        this.initializationPromise = null;
    }

    async loadCorpus() {
        try {
            // 1. Try persisted index (skips re-embedding entirely).
            const persisted = await this.vectorStore.loadPersisted();
            if (persisted && persisted.length) {
                console.log(`[RAGEngine] Loaded ${persisted.length} persisted chunks from IndexedDB.`);
                await this.vectorStore.addChunks(persisted);
                return;
            }

            // 2. Otherwise fetch + embed.
            console.log('[RAGEngine] Loading corpus...');
            const [corpusRes, embeddingsRes] = await Promise.all([
                fetch('/ai/docs/corpus.json'),
                fetch('/ai/docs/corpus-embeddings.json').catch(() => null),
            ]);
            const data = await corpusRes.json();
            let precomputed = null;
            if (embeddingsRes && embeddingsRes.ok) {
                precomputed = await embeddingsRes.json();
                console.log(`[RAGEngine] Loaded ${precomputed.length} pre-computed embeddings.`);
            }

            let chunksToIndex = data.chunks;
            if (precomputed && precomputed.length === chunksToIndex.length) {
                chunksToIndex = chunksToIndex.map((chunk, i) => ({
                    ...chunk,
                    embeddings: chunk.embeddings || precomputed[i],
                }));
            }

            const chunksToEmbed = chunksToIndex.filter(c => !c.embeddings);
            if (chunksToEmbed.length > 0) {
                console.log(`[RAGEngine] Embedding ${chunksToEmbed.length} chunks...`);
                const embedded = await this._embedChunks(chunksToEmbed);
                await this.vectorStore.addChunks(embedded);
            }

            const alreadyEmbedded = chunksToIndex.filter(c => c.embeddings);
            if (alreadyEmbedded.length > 0) {
                console.log(`[RAGEngine] Indexing ${alreadyEmbedded.length} pre-computed chunks...`);
                await this.vectorStore.addChunks(alreadyEmbedded);
            }

            // Persist so subsequent loads skip embedding.
            const all = [...alreadyEmbedded, ...(chunksToEmbed.length ? await this._embedChunks(chunksToEmbed) : [])];
            await this.vectorStore.persist(all);

            console.log('[RAGEngine] Corpus indexed.');
        } catch (e) {
            console.error('[RAGEngine] Failed to load corpus:', e);
        }
    }

    // ---- Embedding (worker-backed local path) -----------------------------

    _embedViaWorker(texts) {
        return new Promise((resolve, reject) => {
            const requestId = 'embed-' + Date.now() + '-' + Math.random().toString(36).slice(2);
            this.callbacks.set(requestId, { resolve, reject });
            this.worker.postMessage({ type: 'embed_batch', id: requestId, texts });
        });
    }

    async _embedChunks(chunks) {
        const embeddings = await this.embeddingProvider.embed(chunks.map(c => c.text));
        return chunks.map((chunk, i) => ({ ...chunk, embeddings: embeddings[i] }));
    }

    async _queryEmbedding(text) {
        if (this.queryCache.has(text)) return this.queryCache.get(text);
        const emb = await this.embeddingProvider.embedOne(text);
        this.queryCache.set(text, emb);
        return emb;
    }

    handleWorkerMessage(data) {
        const { id, type, embedding, embeddings, message } = data;
        const cb = this.callbacks.get(id);
        if (!cb) return;
        if (type === 'embed_result') { cb.resolve(embedding); this.callbacks.delete(id); }
        else if (type === 'embed_batch_result') { cb.resolve(embeddings); this.callbacks.delete(id); }
        else if (type === 'error') { cb.reject(new Error(message || 'Embedding worker error')); this.callbacks.delete(id); }
    }

    // ---- Advanced ingestion (arbitrary text) ------------------------------

    async ingestText(text, meta = {}) {
        const chunks = chunkDocument(text, meta, {
            size: AI_CONFIG.limits?.ragChunkSize || 500,
            overlap: AI_CONFIG.limits?.ragChunkOverlap || 100,
        });
        const embedded = await this._embedChunks(chunks);
        await this.vectorStore.addChunks(embedded);
        return embedded.length;
    }

    // ---- Retrieval --------------------------------------------------------

    async retrieveContext(query, options = {}) {
        if (typeof options === 'number') options = { limit: options };
        const limit = options.limit || this.maxRAGChunks;
        if (!this.isLoaded) await this.initialize();

        const llm = options.llm; // async (messages) => { text } | { text }
        const queries = [query];

        if (llm) {
            try {
                if (options.useMultiQuery !== false) {
                    const variants = await this._expandQueries(llm, query);
                    if (variants.length) queries.push(...variants);
                }
                if (options.useHyDE) {
                    const hypo = await this._hyde(llm, query);
                    if (hypo) queries.push(hypo);
                }
            } catch (e) {
                console.warn('[RAGEngine] query expansion failed, falling back to raw query:', e);
            }
        }

        const lists = [];
        for (const q of queries) {
            const emb = await this._queryEmbedding(q);
            const res = await this.vectorStore.query(emb, limit * 3, q, options.filters || {});
            lists.push(res);
        }

        let fused = reciprocalRankFusion(lists);
        if (options.filters) fused = applyMetadataFilter(fused, options.filters);
        if (typeof options.reranker === 'function') {
            fused = await options.reranker(query, fused);
        }

        const top = fused.slice(0, limit);
        this.lastResults = top;
        return formatContext(top, { withCitations: true });
    }

    async _expandQueries(llm, query) {
        const out = await llm(buildMultiQueryPrompt(query));
        const text = typeof out === 'string' ? out : (out?.text || '');
        return parseJsonList(text).slice(0, 3);
    }

    async _hyde(llm, query) {
        const out = await llm(buildHydePrompt(query));
        const text = typeof out === 'string' ? out : (out?.text || '');
        return text.trim();
    }
}
