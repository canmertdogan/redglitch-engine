/**
 * public/ai/chunker.js
 * Pure, dependency-free text chunking utilities (node + browser safe).
 *
 * Used both by the in-browser RAG ingestion and by the corpus build script.
 * "Advanced" = recursive (structure-aware) splitting with tunable overlap plus
 * metadata capture so downstream filtering/reranking has something to chew on.
 */

const DEFAULT_SEPARATORS = [
    '\n\n', // paragraphs
    '\n',   // lines
    '. ',   // sentences
    ' ',    // words
    '',     // characters (fallback)
];

function _splitKeep(text, sep, keep) {
    const parts = text.split(sep);
    const out = [];
    for (let i = 0; i < parts.length; i++) {
        out.push(i === 0 ? parts[i] : (keep ? sep : '') + parts[i]);
    }
    return out;
}

function _recursiveSplit(text, seps, depth, keep) {
    if (depth >= seps.length - 1) {
        // Final ('' ) separator: character-level fallback.
        return text.split('');
    }
    const sep = seps[depth];
    if (sep === '' || !text.includes(sep)) {
        return _recursiveSplit(text, seps, depth + 1, keep);
    }
    return _splitKeep(text, sep, keep);
}

export function recursiveChunk(text, options = {}) {
    const size = options.size ?? 500;
    const overlap = Math.min(options.overlap ?? 100, Math.floor(size / 2));
    const seps = options.separators ?? DEFAULT_SEPARATORS;
    const keep = options.keepSeparator ?? true;

    const norm = (text || '').replace(/\r\n/g, '\n');
    if (!norm) return [];
    if (norm.length <= size) return [norm];

    const pieces = _recursiveSplit(norm, seps, 0, keep).filter(Boolean);

    // Greedily merge small pieces into windows up to `size`, carrying the tail
    // `overlap` characters into the next window for contextual continuity.
    const merged = [];
    let buf = '';
    for (const p of pieces) {
        if (buf && buf.length + p.length > size) {
            merged.push(buf);
            buf = overlap > 0 ? buf.slice(-overlap) : '';
        }
        buf = buf ? buf + p : p;
    }
    if (buf) merged.push(buf);

    // Any merged piece still over `size` (no usable separators) -> hard slide.
    const out = [];
    for (const m of merged) {
        if (m.length <= size) {
            out.push(m);
            continue;
        }
        const step = Math.max(1, size - overlap);
        for (let i = 0; i < m.length; i += step) {
            out.push(m.slice(i, i + size));
        }
    }
    return out.filter(Boolean);
}

/**
 * Chunk a document into RAG-ready objects.
 * @param {string} text
 * @param {object} meta - { source, type, title }
 */
export function chunkDocument(text, meta = {}, options = {}) {
    const chunks = recursiveChunk(text, options);
    const source = meta.source || 'unknown';
    const type = meta.type || 'doc';
    const title = meta.title || source;
    return chunks
        .filter(c => c && c.trim().length)
        .map((c, i) => ({
            id: `${source}#${i}`,
            text: c,
            source,
            type,
            title,
            index: i,
        }));
}
