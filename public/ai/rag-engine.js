/**
 * public/ai/rag-engine.js
 * RAG pipeline: load corpus -> embed -> search -> retrieve.
 */

import { AI_CONFIG } from './config.js?v=5';
import { VectorStore } from './vector-store.js?v=5';
import { EventBus } from './shim.js?v=5';

export class RAGEngine {
    constructor() {
        this.vectorStore = new VectorStore();
        this.isLoaded = false;
        this.worker = null;
        this.callbacks = new Map();
        this.initializationPromise = null;
        this.epoch = 0;
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
        
        // Setup Embedding Worker
        this.worker = new Worker('/ai/embedding-worker.js', { type: 'module' });
        this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
        this.worker.onerror = (e) => {
            console.error('[RAGEngine] Embedding worker crashed:', e.message || e);
        };

        // Load and index corpus
        await this.loadCorpus();
        if (epoch !== this.epoch) return;
        this.isLoaded = true;
        EventBus.emit('ai:rag:ready');
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
            console.log('[RAGEngine] Loading corpus...');
            const [corpusRes, embeddingsRes] = await Promise.all([
                fetch('/ai/docs/corpus.json'),
                fetch('/ai/docs/corpus-embeddings.json').catch(() => null)
            ]);
            const data = await corpusRes.json();
            let precomputed = null;
            if (embeddingsRes && embeddingsRes.ok) {
                precomputed = await embeddingsRes.json();
                console.log(`[RAGEngine] Loaded ${precomputed.length} pre-computed embeddings.`);
            }

            let chunksToIndex = data.chunks;

            // Merge pre-computed embeddings by index position
            if (precomputed && precomputed.length === chunksToIndex.length) {
                chunksToIndex = chunksToIndex.map((chunk, i) => ({
                    ...chunk,
                    embeddings: chunk.embeddings || precomputed[i]
                }));
            }

            const chunksToEmbed = chunksToIndex.filter(c => !c.embeddings);
            if (chunksToEmbed.length > 0) {
                console.log(`[RAGEngine] Embedding ${chunksToEmbed.length} chunks (no pre-computed embedding)...`);
                const embedded = await this.embedChunks(chunksToEmbed);
                await this.vectorStore.addChunks(embedded);
            }

            const alreadyEmbedded = chunksToIndex.filter(c => c.embeddings);
            if (alreadyEmbedded.length > 0) {
                console.log(`[RAGEngine] Indexing ${alreadyEmbedded.length} pre-computed chunks...`);
                await this.vectorStore.addChunks(alreadyEmbedded);
            }

            console.log('[RAGEngine] Corpus indexed.');
        } catch (e) {
            console.error('[RAGEngine] Failed to load corpus:', e);
        }
    }

    async embedChunks(chunks) {
        return new Promise((resolve, reject) => {
            const requestId = 'embed-' + Date.now();
            this.callbacks.set(requestId, { resolve, reject });
            this.worker.postMessage({
                type: 'embed_batch',
                id: requestId,
                texts: chunks.map(c => c.text)
            });
        }).then(embeddings => {
            return chunks.map((chunk, i) => ({
                ...chunk,
                embeddings: embeddings[i]
            }));
        });
    }

    async getQueryEmbedding(text) {
        return new Promise((resolve, reject) => {
            const requestId = 'query-' + Date.now();
            this.callbacks.set(requestId, { resolve, reject });
            this.worker.postMessage({
                type: 'embed',
                id: requestId,
                text: text
            });
        });
    }

    handleWorkerMessage(data) {
        const { id, type, embedding, embeddings, message } = data;
        const cb = this.callbacks.get(id);
        if (!cb) return;

        if (type === 'embed_result') {
            cb.resolve(embedding);
            this.callbacks.delete(id);
        } else if (type === 'embed_batch_result') {
            cb.resolve(embeddings);
            this.callbacks.delete(id);
        } else if (type === 'error') {
            cb.reject(new Error(message || 'Embedding worker error'));
            this.callbacks.delete(id);
        }
    }

    async retrieveContext(query, limit = 3) {
        if (!this.isLoaded) await this.initialize();
        
        const queryEmbedding = await this.getQueryEmbedding(query);
        const results = await this.vectorStore.query(queryEmbedding, limit, query);
        
        return results.map(r => `[Source: ${r.source}] ${r.text}`).join('\n\n');
    }
}
