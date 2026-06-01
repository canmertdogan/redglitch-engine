# RedGlitch AI - Quick Start Guide

## Current Configuration

**Model**: Salesforce CodeGen-350M  
**Backend**: WASM (transformers.js 2.17.2)  
**Status**: ✅ Production Ready

## Test the AI System

1. **Start server**: `npm run server` (port 3000)
2. **Open test page**: http://localhost:3000/test-ai-core.html
3. **Run tests**: Click "Run Phase 1 Tests"
4. **Wait for download**: First time downloads ~150MB model (cached afterwards)
5. **Verify**: All 6 tests should pass ✅

## Expected Output

```
✓ Config is valid
✓ ModelManager ready. Backend: wasm
✓ InferenceEngine ready (worker started)
✓ Model loaded in ~15s (first) or ~5s (cached)
✓ Generation successful. Tokens: ~XX
✓ Resources disposed
```

## Integration Example

```javascript
import { ModelManager } from './ai/model-manager.js';
import { InferenceEngine } from './ai/inference-engine.js';

// Initialize
const eventBus = { emit: (e, d) => console.log(e, d) };
const modelManager = new ModelManager(eventBus);
await modelManager.initialize();

const engine = new InferenceEngine(modelManager, eventBus);
await engine.initialize();
await engine.ensureModelReady();

// Generate
const prompt = "function sortArray(arr) {";
const result = await engine.generate(
    prompt,
    { maxNewTokens: 100 },
    (token) => console.log('Token:', token)  // Streaming
);

console.log('Result:', result);
```

## Model Details

- **Size**: ~150MB (INT8 quantized)
- **Speed**: 3-5 tokens/second (WASM, 4 threads)
- **Context**: 2048 tokens
- **Training**: Trained on code (GitHub)
- **Cache**: Browser IndexedDB

## Building

Modify `worker-v2-final-src.js`, then:

```bash
npm run build:ai-worker
```

## Troubleshooting

**Model won't load**
- Clear browser cache
- Check network (downloads from HuggingFace)
- Must use web server (not file://)

**Slow generation**
- First run always slower (warmup)
- Increase threads in config.js
- Check CPU usage

**Out of memory**
- CodeGen-350M needs ~500MB RAM
- Close other tabs
- Try `Xenova/distilgpt2` (smaller)

## Alternative Models

Edit `config.js`:

```javascript
// Smaller (40MB, very fast)
name: 'Xenova/distilgpt2',

// Similar size, general purpose
name: 'Xenova/gpt2-medium',
```

Then rebuild worker and clear cache.

## Documentation

- **Model compatibility**: `MODEL_COMPATIBILITY.md`
- **Architecture**: See project copilot instructions
- **Transformers.js**: https://huggingface.co/docs/transformers.js
- **CodeGen**: https://huggingface.co/Xenova/codegen-350M-mono

---
**Version**: 1.0.0  
**Model**: Xenova/codegen-350M-mono  
**Last Updated**: 2026-02-08
