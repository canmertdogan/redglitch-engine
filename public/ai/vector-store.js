/**
 * public/ai/vector-store.js
 * Vector DB wrapper using Orama for browser-native RAG.
 */

import { AI_CONFIG } from './config.js';

export class VectorStore {
    constructor() {
        this.db = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        console.log('[VectorStore] Initializing Orama...');
        
        try {
            // Load Orama from CDN (using esm.sh for better CORS support)
            const { create, insert, search } = await import('https://esm.sh/@orama/orama@3.1.18');
            
            this.db = await create({
                schema: {
                    id: 'string',
                    text: 'string',
                    source: 'string',
                    type: 'string',
                    title: 'string',
                    embeddings: 'vector[384]' // for all-MiniLM-L6-v2
                }
            });

            this._insert = insert;
            this._search = search;
            this.isInitialized = true;
            console.log('[VectorStore] Orama ready.');
        } catch (e) {
            console.error('[VectorStore] Failed to initialize Orama:', e);
            throw e;
        }
    }

    async addChunks(chunks) {
        if (!this.isInitialized) await this.initialize();
        
        console.log(`[VectorStore] Adding ${chunks.length} chunks...`);
        for (const chunk of chunks) {
            await this._insert(this.db, chunk);
        }
    }

    async query(embedding, limit = 3) {
        if (!this.isInitialized) await this.initialize();

        const results = await this._search(this.db, {
            mode: 'vector',
            vector: embedding,
            similarity: 0.7,
            limit: limit
        });

        return results.hits.map(h => h.document);
    }
}
