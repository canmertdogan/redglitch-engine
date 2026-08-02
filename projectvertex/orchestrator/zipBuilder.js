// Builds the downloadable project bundle in memory — no filesystem writes
// (Vercel's filesystem is read-only outside /tmp, and even that doesn't
// persist across invocations). The zip contains only the *generated* data
// files, not engine source: Redglitch's server resolves a project's own
// files under projects/<name>/ first, falling back to public/ for anything
// not present (the "virtual overlay" — see CLAUDE.md), so a project needs
// nothing beyond its config + level + campaign + entity definitions to be openable.
const archiver = require('archiver');

// Short branded README dropped into every exported project — this zip only
// ever contains generated data (see note above), so opening it standalone
// would otherwise give no hint that Redglitch Engine is what actually runs
// it. Also doubles as the setup instructions for the "virtual overlay" this
// zip depends on (see CLAUDE.md's project-vs-core note).
function buildReadme(name, engineType) {
    return `# ${name}

Bu proje **ProjectVertex** ile AI kullanılarak üretildi ve
**Redglitch Engine** (${engineType}) üzerinde çalışır:
https://github.com/canmertdogan/redglitch-engine

## Nasıl çalıştırılır

1. Bu klasörü Redglitch Engine kurulumunuzdaki \`projects/\` dizinine kopyalayın.
2. Redglitch'i başlatın (\`npm start\` veya \`npm run server\`).
3. Proje listesinden bu oyunu seçip oynayın.

Redglitch, altı farklı gerçek oyun motoru (2D top-down RPG, izometrik,
platformer, 3D FPS, 3D platformer, 3D top-down) ve 50'den fazla editör
içeren, yerel öncelikli (local-first) bir oyun stüdyosu uygulamasıdır.
`;
}

// Only worth shipping if the logic phase actually produced something — an
// empty/skipped graph (e.g. non-rpg-topdown engines, or the LLM failing
// after retries) has nothing for VisualScriptEngine to run.
function hasLogicGraph(logic) {
    return !!logic && Array.isArray(logic.nodes) && logic.nodes.length > 0;
}

// Sanitizes a level id for use as a zip path segment — level ids come from
// the LLM (level-plan phase) and could theoretically carry `../`; keep them
// confined to plain filesystem-safe names.
function safeLevelId(id, index) {
    return String(id || `level${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '');
}

// Appends either a single level (dunyalar/level1.json — original shape) or a
// full levels array (dunyalar/<id>.json each — multi-level shape).
function appendLevels(archive, level, levels) {
    if (Array.isArray(levels) && levels.length > 0) {
        levels.forEach((l, i) => {
            archive.append(JSON.stringify(l && l.data ? l.data : l, null, 2), { name: `dunyalar/${safeLevelId(l && l.id, i)}.json` });
        });
    } else if (level) {
        archive.append(JSON.stringify(level, null, 2), { name: 'dunyalar/level1.json' });
    }
}

// Returns a Promise<Buffer> — used by cli.js to write a local .zip file.
function buildZipBuffer({ redglitchJson, level, levels, campaign, entityDefinitions, logic, musicConfig }) {
    return new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks = [];
        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);

        archive.append(JSON.stringify(redglitchJson, null, 2), { name: 'redglitch.json' });
        appendLevels(archive, level, levels);
        archive.append(JSON.stringify(campaign, null, 2), { name: 'campaigns/main_campaign.json' });

        // rpg-topdown loads dunyalar/definitions/music.json into
        // window.MUSIC_CONFIG (main.js) — per-level track overrides. Other
        // engines don't read this file; it's simply absent for them.
        if (musicConfig) {
            archive.append(JSON.stringify(musicConfig, null, 2), { name: 'dunyalar/definitions/music.json' });
        }

        // Entity definitions (enemies, NPCs, items) - consumed by engine's ItemDefinitions/EnemyDefs/NPCDefs
        if (entityDefinitions) {
            if (entityDefinitions.enemies && Object.keys(entityDefinitions.enemies).length > 0) {
                archive.append(JSON.stringify(entityDefinitions.enemies, null, 2), { name: 'dunyalar/definitions/enemies.json' });
            }
            if (entityDefinitions.npcs && Object.keys(entityDefinitions.npcs).length > 0) {
                archive.append(JSON.stringify(entityDefinitions.npcs, null, 2), { name: 'dunyalar/definitions/npcs.json' });
            }
            if (entityDefinitions.items && Object.keys(entityDefinitions.items).length > 0) {
                archive.append(JSON.stringify(entityDefinitions.items, null, 2), { name: 'dunyalar/definitions/items.json' });
            }
        }

        // VisualScriptEngine graph (rpg-topdown only — see orchestrator/phases/06-logic.js).
        if (hasLogicGraph(logic)) {
            archive.append(JSON.stringify(logic, null, 2), { name: 'dunyalar/scripts/main.json' });
        }

        archive.append(buildReadme(redglitchJson.name, redglitchJson.engineType), { name: 'README.md' });
        archive.finalize();
    });
}

// Streams directly into an HTTP response — used by the server's
// /api/download-zip route, avoiding buffering the whole zip in memory
// server-side for large levels.
function pipeZipToStream({ redglitchJson, level, levels, campaign, entityDefinitions, logic, musicConfig }, outputStream) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(outputStream);
    archive.append(JSON.stringify(redglitchJson, null, 2), { name: 'redglitch.json' });
    appendLevels(archive, level, levels);
    archive.append(JSON.stringify(campaign, null, 2), { name: 'campaigns/main_campaign.json' });

    if (musicConfig) {
        archive.append(JSON.stringify(musicConfig, null, 2), { name: 'dunyalar/definitions/music.json' });
    }

    if (entityDefinitions) {
        if (entityDefinitions.enemies && Object.keys(entityDefinitions.enemies).length > 0) {
            archive.append(JSON.stringify(entityDefinitions.enemies, null, 2), { name: 'dunyalar/definitions/enemies.json' });
        }
        if (entityDefinitions.npcs && Object.keys(entityDefinitions.npcs).length > 0) {
            archive.append(JSON.stringify(entityDefinitions.npcs, null, 2), { name: 'dunyalar/definitions/npcs.json' });
        }
        if (entityDefinitions.items && Object.keys(entityDefinitions.items).length > 0) {
            archive.append(JSON.stringify(entityDefinitions.items, null, 2), { name: 'dunyalar/definitions/items.json' });
        }
    }

    if (hasLogicGraph(logic)) {
        archive.append(JSON.stringify(logic, null, 2), { name: 'dunyalar/scripts/main.json' });
    }

    archive.append(buildReadme(redglitchJson.name, redglitchJson.engineType), { name: 'README.md' });
    return archive.finalize();
}

module.exports = { buildZipBuffer, pipeZipToStream };