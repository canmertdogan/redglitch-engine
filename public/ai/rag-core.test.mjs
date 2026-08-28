import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    reciprocalRankFusion,
    applyMetadataFilter,
    buildMultiQueryPrompt,
    buildHydePrompt,
    parseJsonList,
    formatContext,
    K_RRF
} from './rag-core.js';

import { recursiveChunk, chunkDocument } from './chunker.js';

test('reciprocalRankFusion ranks a document higher when present in multiple lists', () => {
    const a = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    const b = [{ id: 'y' }, { id: 'x' }, { id: 'w' }];
    const fused = reciprocalRankFusion([a, b], { k: K_RRF });
    const x = fused.find(d => d.id === 'x');
    const z = fused.find(d => d.id === 'z');
    assert.ok(x.fusionScore > z.fusionScore, 'x (in both lists) should outrank z (one list)');
    assert.ok(fused[0].id === 'x' || fused[0].id === 'y', 'top result is from shared docs');
});

test('reciprocalRankFusion returns empty for no lists', () => {
    assert.deepEqual(reciprocalRankFusion([]), []);
});

test('applyMetadataFilter matches path-prefix and tag filters', () => {
    const docs = [
        { id: '1', path: 'src/foo.js', tags: ['eng'] },
        { id: '2', path: 'docs/x.md', tags: ['docs'] }
    ];
    const out = applyMetadataFilter(docs, { pathPrefix: 'src/', tags: ['eng'] });
    assert.deepEqual(out.map(d => d.id), ['1']);
});

test('applyMetadataFilter handles empty filter', () => {
    const docs = [{ id: '1' }, { id: '2' }];
    assert.deepEqual(applyMetadataFilter(docs, {}).length, 2);
});

test('buildMultiQueryPrompt asks for reformulations', () => {
    const p = buildMultiQueryPrompt('how does save work');
    const str = JSON.stringify(p);
    assert.match(str, /how does save work/);
    assert.match(str, /JSON/i);
});

test('buildHydePrompt asks for an ideal answer passage', () => {
    const p = buildHydePrompt('explain inventory');
    const str = JSON.stringify(p);
    assert.match(str, /explain inventory/);
    assert.match(str, /passage/i);
});

test('parseJsonList tolerates prose around a JSON array', () => {
    const text = 'Sure! ```json\n["a","b","c"]\n``` done';
    assert.deepEqual(parseJsonList(text), ['a', 'b', 'c']);
});

test('parseJsonList falls back to line splitting', () => {
    const text = 'no json here\n- q1\n- q2';
    const out = parseJsonList(text);
    assert.ok(out.length >= 1);
});

test('formatContext renders snippets with citations', () => {
    const docs = [
        { id: 'd1', text: 'snippet one', metadata: { source: 'a.md', path: 'a.md' } },
        { id: 'd2', text: 'snippet two', metadata: { source: 'b.md', path: 'b.md' } }
    ];
    const ctx = formatContext(docs, { withCitations: true, maxLength: 1000 });
    assert.match(ctx, /\[1\]/);
    assert.match(ctx, /a\.md/);
    assert.match(ctx, /snippet one/);
});

test('formatContext truncates to maxLength', () => {
    const docs = [{ id: 'd', text: 'x'.repeat(500), metadata: { source: 'f' } }];
    const ctx = formatContext(docs, { withCitations: false, maxLength: 50 });
    assert.ok(ctx.length <= 60, 'should be truncated near maxLength');
});

test('recursiveChunk splits long text and preserves overlap coverage', () => {
    const text = 'word '.repeat(400);
    const chunks = recursiveChunk(text, { size: 100, overlap: 20 });
    assert.ok(chunks.length > 1);
    const joined = chunks.join('');
    assert.ok(joined.length >= text.length, 'overlap means joined >= original');
});

test('chunkDocument attaches metadata and indexing', () => {
    const docs = chunkDocument('alpha beta gamma', { source: 's.txt', type: 'doc', title: 'T' }, { size: 6 });
    assert.ok(docs.length >= 1);
    assert.equal(docs[0].source, 's.txt');
    assert.equal(docs[0].type, 'doc');
    assert.equal(docs[0].title, 'T');
    assert.equal(docs[0].index, 0);
    assert.ok(typeof docs[0].id === 'string' && docs[0].id.length > 0);
});
