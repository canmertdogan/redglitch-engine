/**
 * public/ai/embedding-worker.js
 * Web Worker for embedding generation using Transformers.js v3.
 */

import { 
    pipeline, 
    env 
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0-alpha.19';

let embedder = null;

async function init() {
    console.log('[EmbeddingWorker] Initializing...');
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
    env.backends.onnx.wasm.wasmPaths = '/lib/transformers/';
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.simd = true;
    
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: 'wasm', // Embeddings are small enough for WASM
        dtype: 'fp32'
    });
    console.log('[EmbeddingWorker] Embedder ready.');
}

self.onmessage = async (e) => {
    try {
        if (!embedder) await init();

        const { type, id, text, texts } = e.data;

        if (type === 'embed') {
            const output = await embedder(text, { pooling: 'mean', normalize: true });
            postMessage({
                type: 'embed_result',
                id,
                embedding: Array.from(output.data)
            });
        } else if (type === 'embed_batch') {
            const embeddings = [];
            for (const t of texts) {
                const output = await embedder(t, { pooling: 'mean', normalize: true });
                embeddings.push(Array.from(output.data));
            }
            postMessage({
                type: 'embed_batch_result',
                id,
                embeddings
            });
        }

    } catch (error) {
        postMessage({
            type: 'error',
            id: e.data?.id,
            message: error?.message || 'Embedding worker failure',
        });
    }
};
