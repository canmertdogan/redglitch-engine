import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectContextRetriever } from './project-context-retriever.mjs';

test('retrieves bounded active-project context and excludes generated and sensitive files', async () => {
    const requested = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        requested.push(String(url));
        if (url === '/api/projects/current') return { ok: true, json: async () => ({ name: 'Demo' }) };
        if (url === '/api/ide/tree') return {
            ok: true,
            json: async () => [{
                name: 'Project: Demo', type: 'dir', children: [
                    { name: 'MANIFESTO.md', path: 'projects/Demo/MANIFESTO.md', type: 'file' },
                    { name: 'game.json', path: 'projects/Demo/game.json', type: 'file' },
                    { name: 'credentials.json', path: 'projects/Demo/credentials.json', type: 'file' },
                    { name: 'bundle.js', path: 'projects/Demo/studio-dist/bundle.js', type: 'file' }
                ]
            }, { name: 'Engine Core', type: 'dir', children: [{ name: 'main.js', path: 'engine/main.js', type: 'file' }] }]
        };
        return { ok: true, text: async () => `content:${url}` };
    };
    try {
        const context = await new ProjectContextRetriever({ maxFiles: 8 }).retrieve('build game');
        assert.match(context, /MANIFESTO\.md/);
        assert.match(context, /game\.json/);
        assert.doesNotMatch(context, /credentials\.json|bundle\.js|engine\/main\.js/);
        assert.equal(requested.some((url) => url.includes('credentials')), false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('handles { tree, truncated: true } responses from /api/ide/tree', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
        if (url === '/api/projects/current') return { ok: true, json: async () => ({ name: 'LargeProj' }) };
        if (url === '/api/ide/tree') return {
            ok: true,
            json: async () => ({
                truncated: true,
                tree: [{
                    name: 'Project: LargeProj',
                    type: 'dir',
                    children: [
                        { name: 'MANIFESTO.md', path: 'projects/LargeProj/MANIFESTO.md', type: 'file' },
                    ],
                }],
            }),
        };
        return { ok: true, text: async () => 'Truncated project manifesto' };
    };
    try {
        const context = await new ProjectContextRetriever({ maxFiles: 4 }).retrieve('manifesto');
        assert.match(context, /MANIFESTO\.md/);
        assert.match(context, /Truncated project manifesto/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
