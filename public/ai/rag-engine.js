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
    }

    async initialize() {
        if (this.isLoaded) return;

        console.log('[RAGEngine] Initializing...');
        await this.vectorStore.initialize();
        
        // Setup Embedding Worker
        this.worker = new Worker('/ai/embedding-worker.js', { type: 'module' });
        this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);

        // Load and index corpus
        await this.loadCorpus();
        this.isLoaded = true;
        EventBus.emit('ai:rag:ready');
    }

    async loadCorpus() {
        try {
            console.log('[RAGEngine] Loading corpus.json...');
            const res = await fetch('/ai/docs/corpus.json');
            const data = await res.json();
            
            // Check if we have pre-computed embeddings
            // If not, we generate them on the fly (Phase 2 strategy)
            const chunksToEmbed = data.chunks.filter(c => !c.embeddings);
            
            if (chunksToEmbed.length > 0) {
                console.log(`[RAGEngine] Embedding ${chunksToEmbed.length} chunks...`);
                const embeddedChunks = await this.embedChunks(chunksToEmbed);
                await this.vectorStore.addChunks(embeddedChunks);
            }

            const alreadyEmbedded = data.chunks.filter(c => c.embeddings);
            if (alreadyEmbedded.length > 0) {
                await this.vectorStore.addChunks(alreadyEmbedded);
            }

            console.log('[RAGEngine] Corpus indexed.');
        } catch (e) {
            console.error('[RAGEngine] Failed to load corpus:', e);
        }
    }

    async embedChunks(chunks) {
        return new Promise((resolve) => {
            const requestId = 'embed-' + Date.now();
            this.callbacks.set(requestId, { resolve });
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
        return new Promise((resolve) => {
            const requestId = 'query-' + Date.now();
            this.callbacks.set(requestId, { resolve });
            this.worker.postMessage({
                type: 'embed',
                id: requestId,
                text: text
            });
        });
    }

    handleWorkerMessage(data) {
        const { id, type, embedding, embeddings } = data;
        const cb = this.callbacks.get(id);
        if (!cb) return;

        if (type === 'embed_result') {
            cb.resolve(embedding);
            this.callbacks.delete(id);
        } else if (type === 'embed_batch_result') {
            cb.resolve(embeddings);
            this.callbacks.delete(id);
        }
    }

    async retrieveContext(query, limit = 3) {
        if (!this.isLoaded) await this.initialize();
        
        const queryEmbedding = await this.getQueryEmbedding(query);
        const results = await this.vectorStore.query(queryEmbedding, limit);
        
        return results.map(r => `[Source: ${r.source}] ${r.text}`).join('\n\n');
    }
}
