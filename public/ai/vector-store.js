/**
 * public/ai/vector-store.js  (v2 — advanced)
 *
 * Orama-backed vector DB with:
 *   - dynamic embedding dimension (so any OpenAI-compatible embeddings model works,
 *     not just all-MiniLM-L6-v2's 384),
 *   - IndexedDB persistence so we never re-embed the whole corpus on every load,
 *   - hybrid (dense + BM25 term) search with configurable weights,
 *   - post-retrieval metadata filtering.
 */

import { AI_CONFIG } from './config.js';
import { reciprocalRankFusion, applyMetadataFilter } from './rag-core.js';

const RAG_CORPUS_VERSION = 'rag-corpus-v1';

function hasIndexedDB() {
    return typeof indexedDB !== 'undefined' && indexedDB;
}

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('redglitch-rag', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('store')) db.createObjectStore('store', { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGet(key) {
    if (!hasIndexedDB()) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('store', 'readonly');
        const req = tx.objectStore('store').get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => reject(req.error);
    });
}

async function idbPut(key, value) {
    if (!hasIndexedDB()) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('store', 'readwrite');
        tx.objectStore('store').put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export class VectorStore {
    constructor() {
        this.db = null;
        this.isInitialized = false;
        this.dim = AI_CONFIG.models.embedding.dimensions || 384;
    }

    async initialize() {
        if (this.isInitialized) return;
        console.log('[VectorStore] Initializing Orama...');
        try {
            const { create, insert, search } = await import('https://esm.sh/@orama/orama@3.1.18');
            this._insert = insert;
            this._search = search;
            this._create = create;
            this.isInitialized = true;
            console.log('[VectorStore] Orama ready.');
        } catch (e) {
            console.error('[VectorStore] Failed to initialize Orama:', e);
            throw e;
        }
    }

    async _ensureSchema(chunks) {
        if (this.db) return;
        // Dimension is derived from the first available embedding so any model works.
        const sample = chunks.find(c => Array.isArray(c.embeddings));
        if (sample) this.dim = sample.embeddings.length;
        this.db = await this._create({
            schema: {
                id: 'string',
                text: 'string',
                source: 'string',
                type: 'string',
                title: 'string',
                index: 'number',
                embeddings: `vector[${this.dim}]`,
            },
        });
    }

    async addChunks(chunks) {
        if (!this.isInitialized) await this.initialize();
        await this._ensureSchema(chunks);
        console.log(`[VectorStore] Adding ${chunks.length} chunks (dim=${this.dim})...`);
        for (const chunk of chunks) {
            const doc = { ...chunk };
            if (!Array.isArray(doc.embeddings)) continue; // skip unembeddable
            await this._insert(this.db, doc);
        }
    }

    async query(embedding, limit = 3, textQuery = null, filters = {}) {
        if (!this.isInitialized) await this.initialize();
        if (!this.db) return [];

        const wide = Math.max(limit * 4, 12);

        const runVector = async () => {
            const r = await this._search(this.db, {
                mode: 'vector',
                vector: { value: embedding, property: 'embeddings' },
                limit: wide,
            });
            return r.hits.map((h, i) => ({ ...h.document, score: h.score, rank: i }));
        };

        const runTerm = async () => {
            if (!textQuery) return [];
            const r = await this._search(this.db, {
                mode: 'fulltext',
                term: textQuery,
                properties: ['text', 'title', 'source'],
                limit: wide,
            });
            return r.hits.map((h, i) => ({ ...h.document, score: h.score, rank: i }));
        };

        const [vec, term] = await Promise.all([runVector(), runTerm()]);

        let merged;
        if (term.length && vec.length) {
            merged = reciprocalRankFusion([vec, term]);
        } else {
            merged = (term.length ? term : vec).map((d, i) => ({ ...d, fusionScore: 1 / (i + 1) }));
        }

        if (Object.keys(filters).length) merged = applyMetadataFilter(merged, filters);
        return merged.slice(0, limit);
    }

    // ---- Persistence -------------------------------------------------------

    async persist(chunks) {
        const sample = chunks.find(c => Array.isArray(c.embeddings));
        const dim = sample ? sample.embeddings.length : this.dim;
        await idbPut('index', { version: RAG_CORPUS_VERSION, dim, chunks });
    }

    async loadPersisted() {
        const stored = await idbGet('index');
        if (!stored || stored.version !== RAG_CORPUS_VERSION) return null;
        if (stored.dim) this.dim = stored.dim;
        return stored.chunks || [];
    }

    get corpusVersion() {
        return RAG_CORPUS_VERSION;
    }
}
