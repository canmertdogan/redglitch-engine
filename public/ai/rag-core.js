/**
 * public/ai/rag-core.js
 * Pure RAG retrieval math + prompt builders (no DOM / no network).
 * Kept framework-free so it can be unit-tested under node --test.
 */

const K_RRF = 60;

/**
 * Reciprocal Rank Fusion across multiple ranked result lists.
 * Each list is an array of document objects that must carry a unique `id`.
 * Returns a single array of { ...doc, fusionScore } sorted descending.
 */
export function reciprocalRankFusion(rankedLists, { k = K_RRF } = {}) {
    const fused = new Map();
    for (const list of rankedLists) {
        if (!Array.isArray(list)) continue;
        list.forEach((doc, idx) => {
            const id = doc.id ?? JSON.stringify(doc);
            const score = 1 / (k + idx + 1);
            const prev = fused.get(id);
            if (!prev) {
                fused.set(id, { doc, score });
            } else {
                prev.score += score;
            }
        });
    }
    return [...fused.values()]
        .sort((a, b) => b.score - a.score)
        .map(({ doc, score }) => ({ ...doc, fusionScore: score }));
}

/** Apply metadata filters. Supported keys: pathPrefix, source, sourceIn, type, typeIn, tags. */
export function applyMetadataFilter(docs, filters = {}) {
    if (!filters || Object.keys(filters).length === 0) return docs;
    const { pathPrefix, source, sourceIn, type, typeIn, tags } = filters;
    return docs.filter(d => {
        const meta = d.metadata || {};
        const pathOrSource = d.path || d.source || '';
        if (pathPrefix && !pathOrSource.startsWith(pathPrefix)) return false;
        if (source && d.source !== source) return false;
        if (Array.isArray(sourceIn) && !sourceIn.includes(d.source)) return false;
        if (type && d.type !== type) return false;
        if (Array.isArray(typeIn) && !typeIn.includes(d.type)) return false;
        if (Array.isArray(tags) && tags.length) {
            const docTags = Array.isArray(d.tags) ? d.tags : (Array.isArray(meta.tags) ? meta.tags : []);
            if (!tags.some(t => docTags.includes(t))) return false;
        }
        return true;
    });
}

/** Build a multi-query expansion prompt (diversify the user question). */
export function buildMultiQueryPrompt(query) {
    return [
        { role: 'system', content: 'You are a search query optimiser. Rewrite the user\'s question into 3 distinct, specific search queries that would each surface different relevant documentation. Return ONLY a JSON array of 3 strings, no markdown.' },
        { role: 'user', content: query },
    ];
}

/** Build a HyDE (Hypothetical Document Embeddings) prompt. */
export function buildHydePrompt(query) {
    return [
        { role: 'system', content: 'You are a documentation writer. Write a short, factual passage (2-4 sentences) that could appear in official documentation and that directly answers the user\'s question. Return only the passage text.' },
        { role: 'user', content: query },
    ];
}

/**
 * Parse a JSON array (with or without markdown fences) produced by an LLM.
 * @returns {string[]}
 */
export function parseJsonList(text) {
    if (!text) return [];
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed.filter(x => typeof x === 'string');
    } catch (_) { /* fall through */ }
    // Last-ditch: split lines / commas.
    return t.split(/\n|,/).map(s => s.trim()).filter(Boolean);
}

/** Format retrieved docs into the context string injected into the system prompt. */
export function formatContext(docs, { withCitations = true, maxLength = 4096 } = {}) {
    let out = docs
        .map((d, i) => {
            const meta = d.metadata || {};
            const source = d.source || meta.source || d.path || meta.path || 'unknown';
            const title = d.title || meta.title;
            const cite = withCitations
                ? `[${i + 1}] (${source}${title && title !== source ? ' / ' + title : ''})`
                : '';
            return `${cite}\n${d.text}`;
        })
        .join('\n\n');
    if (maxLength && out.length > maxLength) out = out.slice(0, maxLength).trimEnd() + '…';
    return out;
}

export { K_RRF };
