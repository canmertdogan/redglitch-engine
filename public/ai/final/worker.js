/**
 * Web Worker for LLM inference using Transformers.js v3 (ESM).
 */
console.log('--- KETEBE AI FINAL WORKER INITIALIZING ---');

// Import Transformers.js from local library as an ES module
import { 
    pipeline, 
    env 
} from '/lib/transformers/transformers.mjs?v=3.0.0-alpha.19';

postMessage({ type: 'transformers:loaded' });

// Global state
let generatorPipeline = null;
let modelId = null;
let backend = 'wasm';
let generating = false;
let abortController = null;

/**
 * Load model
 */
async function loadModel(config) {
    const { id } = config;
    try {
        console.log('[Worker] Loading model:', config.modelId);
        modelId = config.modelId;
        backend = config.backend;
        
        postMessage({ id, type: 'progress', percent: 0, status: 'initializing' });

        env.allowLocalModels = false;
        env.allowRemoteModels = true;
        env.useBrowserCache = true;
        env.backends.onnx.wasm.wasmPaths = '/lib/transformers/';

        if (backend !== 'webgpu') {
            env.backends.onnx.wasm.numThreads = config.wasmThreads || 4;
            env.backends.onnx.wasm.simd = config.wasmSimd !== false;
        }

        const progressCallback = (progress) => {
            if (progress.status === 'progress' && progress.total) {
                const percent = Math.round((progress.loaded / progress.total) * 100);
                postMessage({ id, type: 'progress', percent, status: 'downloading', loaded: progress.loaded, total: progress.total });
            }
        };

        generatorPipeline = await pipeline(
            'text-generation',
            modelId,
            {
                progress_callback: progressCallback,
                device: backend === 'webgpu' ? 'webgpu' : 'wasm',
                dtype: backend === 'webgpu' ? 'q4f16' : 'q8',
            }
        );

        postMessage({ 
            id,
            type: 'ready',
            modelInfo: {
                modelId,
                backend,
                maxLength: 2048,
            },
        });

    } catch (error) {
        console.error('[Worker] Load Error:', error);
        postMessage({ id, type: 'error', message: `Failed to load model: ${error.message}`, code: 'MODEL_LOAD_FAILED' });
    }
}

/**
 * Generate response
 */
async function generate(config) {
    const { id, prompt, params } = config;
    if (!generatorPipeline) {
        postMessage({ id, type: 'error', message: 'Model not loaded', code: 'MODEL_NOT_LOADED' });
        return;
    }

    if (generating) {
        postMessage({ id, type: 'error', message: 'Generation already in progress', code: 'GENERATION_IN_PROGRESS' });
        return;
    }

    try {
        generating = true;
        abortController = new AbortController();
        const startTime = Date.now();
        
        const output = await generatorPipeline(prompt, {
            max_new_tokens: params.maxNewTokens || 512,
            temperature: params.temperature || 0.3,
            top_p: params.topP || 0.9,
            repetition_penalty: params.repetitionPenalty || 1.1,
            do_sample: true,
            callback_function: (tokens) => {
                if (abortController.signal.aborted) return true;
                const partial = generatorPipeline.tokenizer.decode(tokens, { skip_special_tokens: true });
                postMessage({ id, type: 'token', token: partial, partial });
            },
        });

        const endTime = Date.now();
        const generatedText = Array.isArray(output) ? output[0].generated_text : output.generated_text;

        postMessage({ id, type: 'complete', text: generatedText, time: endTime - startTime });

    } catch (error) {
        if (error.name === 'AbortError' || abortController?.signal.aborted) {
            postMessage({ id, type: 'complete', text: '', aborted: true });
        } else {
            postMessage({ id, type: 'error', message: `Generation failed: ${error.message}`, code: 'GENERATION_FAILED' });
        }
    } finally {
        generating = false;
        abortController = null;
    }
}

function dispose(config = {}) {
    const { id } = config;
    generatorPipeline = null;
    modelId = null;
    generating = false;
    abortController = null;
    postMessage({ id, type: 'disposed' });
}

function abort(config = {}) {
    if (abortController) abortController.abort();
    generating = false;
}

self.onmessage = async function(e) {
    const { type, ...data } = e.data;
    try {
        switch (type) {
            case 'load': await loadModel(data); break;
            case 'generate': await generate(data); break;
            case 'abort': abort(data); break;
            case 'dispose': dispose(data); break;
            default: postMessage({ id: data.id, type: 'error', message: `Unknown message type: ${type}` });
        }
    } catch (error) {
        postMessage({ id: data.id, type: 'error', message: error.message });
    }
};