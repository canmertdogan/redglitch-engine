const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    outDir: path.join(__dirname),
    outFile: 'corpus.json',
    chunkSize: 500, // Characters per chunk
    overlap: 100,   // Character overlap
    sources: [
        { type: 'guide', path: '../../docs/campaign_studio_guide.md' },
        { type: 'spec', path: '../../engines/shared/LEVEL_FORMAT.md' },
        { type: 'architecture', path: '../../copilot-instructions.md' },
        { type: 'api', path: '../../shared/EventBus.js', parser: 'jsdoc' },
        { type: 'api', path: '../../shared/AssetManager.js', parser: 'jsdoc' },
        { type: 'api', path: '../../shared/SharedProjectState.js', parser: 'jsdoc' },
        { type: 'api', path: '../../engines/iso-pixel/main.js', parser: 'jsdoc' },
        { type: 'type', path: '../../lib/monaco/ketebe.d.ts', parser: 'dts' }
    ]
};

/**
 * Main Build Function
 */
async function buildCorpus() {
    console.log('📚 Building Ketebe AI Knowledge Corpus...');
    const chunks = [];

    for (const source of CONFIG.sources) {
        const fullPath = path.resolve(__dirname, source.path);
        
        if (!fs.existsSync(fullPath)) {
            console.warn(`⚠️ Source not found: ${source.path}`);
            continue;
        }

        console.log(`Processing: ${path.basename(fullPath)}`);
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        let fileChunks = [];
        if (source.parser === 'jsdoc') {
            fileChunks = parseJSDoc(content, source);
        } else if (source.parser === 'dts') {
            fileChunks = parseDTS(content, source);
        } else {
            // Default Markdown/Text chunking
            fileChunks = chunkText(content, source);
        }

        chunks.push(...fileChunks);
    }

    // Add inline docs from docs.html (simplified scraping)
    // In a real scenario, we might use JSDOM, but here we'll assume the file exists
    // and maybe skip it for now or implement a simple regex parser if needed.
    // For this V1, we stick to the file list above.

    const output = {
        version: "1.0",
        generatedAt: new Date().toISOString(),
        chunkCount: chunks.length,
        chunks: chunks
    };

    const outPath = path.join(CONFIG.outDir, CONFIG.outFile);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`✅ Corpus built: ${chunks.length} chunks written to ${CONFIG.outFile}`);
}

/**
 * Text Chunker (Sliding Window)
 */
function chunkText(text, sourceInfo) {
    const chunks = [];
    const cleanText = text.replace(/\r\n/g, '\n');
    
    // Split by sections if markdown headers present
    // Simple approach: strict sliding window for robustness
    let start = 0;
    while (start < cleanText.length) {
        const end = Math.min(start + CONFIG.chunkSize, cleanText.length);
        const slice = cleanText.slice(start, end);
        
        chunks.push({
            id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: slice,
            source: path.basename(sourceInfo.path),
            type: sourceInfo.type,
            title: sourceInfo.type.toUpperCase() + ': ' + path.basename(sourceInfo.path),
            tags: [sourceInfo.type]
        });

        if (end >= cleanText.length) break;
        start += (CONFIG.chunkSize - CONFIG.overlap);
    }
    return chunks;
}

/**
 * JSDoc Parser
 * Extracts / ** ... * / blocks and function signatures
 */
function parseJSDoc(content, sourceInfo) {
    const chunks = [];
    const regex = /\/\*\*([\s\S]*?)\*\/[\s\n]*([^\n\{]*)/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
        const docComment = match[1].replace(/\n\s*\* /g, '\n').replace(/\n\s*\*/g, '\n').trim();
        const signature = match[2].trim();

        if (docComment.length < 10) continue; // Skip empty/tiny comments

        chunks.push({
            id: `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: `API: ${signature}\n${docComment}`,
            source: path.basename(sourceInfo.path),
            type: 'api',
            title: signature || path.basename(sourceInfo.path),
            tags: ['api', 'javascript']
        });
    }
    return chunks;
}

/**
 * D.TS Parser
 * Naive parser for TypeScript definitions
 */
function parseDTS(content, sourceInfo) {
    // Treat d.ts as code text for now, but maybe split by 'interface' or 'declare'
    return chunkText(content, sourceInfo);
}

buildCorpus().catch(console.error);
