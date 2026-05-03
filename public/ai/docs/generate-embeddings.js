/**
 * Vortex AI - Generate Embeddings for Corpus
 * Run with: node public/ai/docs/generate-embeddings.js
 */

const fs = require('fs');
const path = require('path');
const { pipeline } = require('@xenova/transformers');

async function generateEmbeddings() {
    const corpusPath = path.join(__dirname, 'corpus.json');
    const outputPath = path.join(__dirname, 'corpus-embeddings.json');

    if (!fs.existsSync(corpusPath)) {
        console.error('❌ corpus.json not found. Run build-corpus.js first.');
        process.exit(1);
    }

    console.log('🧠 Loading embedding model (all-MiniLM-L6-v2)...');
    const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
    const chunks = corpus.chunks;
    const embeddings = [];

    console.log(`🚀 Generating embeddings for ${chunks.length} chunks...`);

    for (let i = 0; i < chunks.length; i++) {
        if (i % 50 === 0) {
            console.log(`   Progress: ${i}/${chunks.length} (${Math.round(i/chunks.length * 100)}%)`);
        }

        const chunk = chunks[i];
        const output = await embedder(chunk.text, { pooling: 'mean', normalize: true });
        embeddings.push(Array.from(output.data));
    }

    fs.writeFileSync(outputPath, JSON.stringify(embeddings));
    console.log(`✅ Embeddings generated and saved to: ${outputPath}`);
}

generateEmbeddings().catch(err => {
    console.error('❌ Embedding generation failed:', err);
    process.exit(1);
});
