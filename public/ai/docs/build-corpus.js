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
        { type: 'type', path: '../../lib/monaco/redglitch.d.ts', parser: 'dts' },
        { type: 'knowledge', path: '../../knowledge/studio-docs.json', parser: 'knowledge' },
        { type: 'knowledge', path: '../../knowledge/tutorials.json', parser: 'knowledge' },
        { type: 'knowledge', path: '../../knowledge/faq.json', parser: 'knowledge' }
    ]
};

/**
 * Main Build Function
 */
async function buildCorpus() {
    console.log('📚 Building RedGlitch AI Knowledge Corpus...');
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
        } else if (source.parser === 'knowledge') {
            fileChunks = parseKnowledge(content, source);
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

/**
 * Knowledge JSON Parser
 * Converts structured JSON (editors, tutorials, FAQs) into text chunks.
 */
function parseKnowledge(content, sourceInfo) {
    const chunks = [];
    let data;
    try {
        data = JSON.parse(content);
    } catch (e) {
        console.warn(`Cannot parse ${sourceInfo.path}: ${e.message}`);
        return chunks;
    }

    // studio-docs.json: { editors: [...] }
    if (data.editors && Array.isArray(data.editors)) {
        for (const editor of data.editors) {
            const text = [
                `Editor: ${editor.name}`,
                `Description: ${editor.description}`,
                `How to use: ${editor.howToUse}`,
                `Features: ${editor.features.join(', ')}`,
                `Keywords: ${editor.keywords.join(', ')}`
            ].join('\n');
            chunks.push({
                id: `kn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                text,
                source: sourceInfo.path,
                type: 'knowledge',
                title: `EDITOR: ${editor.name}`,
                tags: ['knowledge', 'editor', editor.id]
            });
        }
        return chunks;
    }

    // tutorials.json: [{ id, title, steps, ... }]
    if (Array.isArray(data) && data.length > 0 && data[0].steps) {
        for (const tutorial of data) {
            const stepsText = tutorial.steps.map(s => `  ${s.number}. ${s.instruction}`).join('\n');
            const text = [
                `Tutorial: ${tutorial.title}`,
                `Difficulty: ${tutorial.difficulty || 'N/A'}`,
                `Estimated time: ${tutorial.estimatedTime || 'N/A'}`,
                `Keywords: ${tutorial.keywords || ''}`,
                `Steps:\n${stepsText}`
            ].join('\n');
            chunks.push({
                id: `kn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                text,
                source: sourceInfo.path,
                type: 'knowledge',
                title: `TUTORIAL: ${tutorial.title}`,
                tags: ['knowledge', 'tutorial', tutorial.id]
            });
        }
        return chunks;
    }

    // faq.json: [{ id, question, answer, category, tags }]
    if (Array.isArray(data) && data.length > 0 && data[0].question) {
        for (const faq of data) {
            const text = [
                `Q: ${faq.question}`,
                `A: ${faq.answer}`,
                `Category: ${faq.category || 'general'}`,
                `Tags: ${(faq.tags || []).join(', ')}`
            ].join('\n');
            chunks.push({
                id: `kn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                text,
                source: sourceInfo.path,
                type: 'knowledge',
                title: `FAQ: ${faq.question.substring(0, 60)}`,
                tags: ['knowledge', 'faq', ...(faq.tags || [])]
            });
        }
        return chunks;
    }

    console.warn(`Unknown knowledge format in ${sourceInfo.path}`);
    return chunks;
}

buildCorpus().catch(console.error);
