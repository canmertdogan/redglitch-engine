#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const PUBLIC_ENGINES = path.join(ROOT, 'public', 'engines');
const PROJECTS_ROOT = path.join(ROOT, 'projects');

function toPosixPath(p) {
    return p.split(path.sep).join('/');
}

function printHelp() {
    console.log(`
Engine Lockstep Tool

Usage:
  node scripts/engine-lockstep.js [options]

Options:
  --project <name>        Project name (repeatable). If omitted, scans all projects with engines/
  --engine <name>         Engine filter (repeatable), e.g. rpg-topdown, platformer-2d, iso-pixel, shared
  --report <path>         Output report path (default: engine-lockstep-report.json)
  --apply                 Apply sync for explicitly allowed files only
  --allow <entry>         Allowed path entry (repeatable), e.g. rpg-topdown/main.js or "Default Project:rpg-topdown/main.js"
  --allow-file <path>     File with allow entries (one per line, # for comments)
  --no-backup             Disable backup before overwrite (default: backup enabled)
  --verbose               Print per-file details
  --help                  Show this help

Allow entry formats:
  rpg-topdown/main.js
  Default Project:rpg-topdown/main.js
  shared/**               (prefix match)
  Default Project:shared/** 
`);
}

function parseArgs(argv) {
    const options = {
        projects: [],
        engines: [],
        reportPath: path.join(ROOT, 'engine-lockstep-report.json'),
        apply: false,
        allow: [],
        allowFile: null,
        backup: true,
        verbose: false,
        help: false
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--project') options.projects.push(argv[++i]);
        else if (arg === '--engine') options.engines.push(argv[++i]);
        else if (arg === '--report') options.reportPath = path.resolve(ROOT, argv[++i]);
        else if (arg === '--apply') options.apply = true;
        else if (arg === '--allow') options.allow.push(argv[++i]);
        else if (arg === '--allow-file') options.allowFile = path.resolve(ROOT, argv[++i]);
        else if (arg === '--no-backup') options.backup = false;
        else if (arg === '--verbose') options.verbose = true;
        else if (arg === '--help' || arg === '-h') options.help = true;
        else throw new Error(`Unknown argument: ${arg}`);
    }

    return options;
}

async function pathExists(target) {
    try {
        await fs.access(target);
        return true;
    } catch {
        return false;
    }
}

async function listProjectNames() {
    if (!(await pathExists(PROJECTS_ROOT))) return [];
    const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
    const names = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const enginesDir = path.join(PROJECTS_ROOT, entry.name, 'engines');
        if (await pathExists(enginesDir)) names.push(entry.name);
    }
    return names.sort();
}

async function collectFiles(dir, baseDir = dir, out = new Map()) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await collectFiles(fullPath, baseDir, out);
            continue;
        }
        if (!entry.isFile()) continue;
        const relPath = toPosixPath(path.relative(baseDir, fullPath));
        const buf = await fs.readFile(fullPath);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        out.set(relPath, { fullPath, hash, size: buf.length });
    }
    return out;
}

function allowEntryMatches(entry, relPath) {
    const e = toPosixPath(entry.trim());
    const r = toPosixPath(relPath);
    if (!e) return false;
    if (e.endsWith('/**')) return r.startsWith(e.slice(0, -3));
    return r === e;
}

function isAllowed(allowEntries, projectName, relPath) {
    for (const raw of allowEntries) {
        const entry = raw.trim();
        if (!entry) continue;
        const idx = entry.indexOf(':');
        if (idx === -1) {
            if (allowEntryMatches(entry, relPath)) return true;
            continue;
        }
        const projectPart = entry.slice(0, idx).trim();
        const pathPart = entry.slice(idx + 1).trim();
        if (projectPart !== projectName) continue;
        if (allowEntryMatches(pathPart, relPath)) return true;
    }
    return false;
}

function filterByEngine(engines, relPath) {
    if (!engines.length) return true;
    return engines.some((engine) => relPath === engine || relPath.startsWith(`${engine}/`));
}

async function loadAllowEntries(options) {
    const entries = [...options.allow];
    if (!options.allowFile) return entries;
    const text = await fs.readFile(options.allowFile, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        entries.push(trimmed);
    }
    return entries;
}

async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    if (!(await pathExists(PUBLIC_ENGINES))) {
        throw new Error(`Missing public engines directory: ${PUBLIC_ENGINES}`);
    }

    const allProjects = await listProjectNames();
    const selectedProjects = options.projects.length ? options.projects : allProjects;
    const missingProjects = selectedProjects.filter((p) => !allProjects.includes(p));
    if (missingProjects.length) {
        throw new Error(`Unknown project(s): ${missingProjects.join(', ')}`);
    }

    const publicFiles = await collectFiles(PUBLIC_ENGINES);
    const allowEntries = options.apply ? await loadAllowEntries(options) : [];
    const backupStamp = new Date().toISOString().replace(/[:.]/g, '-');

    const report = {
        generatedAt: new Date().toISOString(),
        root: ROOT,
        publicEngines: PUBLIC_ENGINES,
        selectedProjects,
        engineFilters: options.engines,
        apply: options.apply,
        backup: options.backup,
        allowEntries,
        projects: {},
        totals: {
            missingInProject: 0,
            differentContent: 0,
            extraInProject: 0,
            candidates: 0,
            applied: 0
        }
    };

    for (const projectName of selectedProjects) {
        const projectEngines = path.join(PROJECTS_ROOT, projectName, 'engines');
        const projectFiles = await collectFiles(projectEngines);

        const missingInProject = [];
        const differentContent = [];
        const extraInProject = [];

        for (const [rel, srcMeta] of publicFiles.entries()) {
            const projectMeta = projectFiles.get(rel);
            if (!projectMeta) {
                missingInProject.push(rel);
                continue;
            }
            if (projectMeta.hash !== srcMeta.hash) {
                differentContent.push(rel);
            }
        }

        for (const rel of projectFiles.keys()) {
            if (!publicFiles.has(rel)) {
                extraInProject.push(rel);
            }
        }

        const candidates = [...missingInProject, ...differentContent].filter((rel) =>
            filterByEngine(options.engines, rel)
        );

        const applied = [];
        const skipped = [];

        if (options.apply) {
            for (const rel of candidates) {
                if (!isAllowed(allowEntries, projectName, rel)) {
                    skipped.push(rel);
                    continue;
                }
                const src = path.join(PUBLIC_ENGINES, rel);
                const dest = path.join(projectEngines, rel);
                const destExists = await pathExists(dest);
                if (destExists && options.backup) {
                    const backupPath = path.join(
                        PROJECTS_ROOT,
                        projectName,
                        '.engine-lockstep-backups',
                        backupStamp,
                        rel
                    );
                    await ensureDir(path.dirname(backupPath));
                    await fs.copyFile(dest, backupPath);
                }
                await ensureDir(path.dirname(dest));
                await fs.copyFile(src, dest);
                applied.push(rel);
            }
        }

        report.projects[projectName] = {
            missingInProject,
            differentContent,
            extraInProject,
            candidates,
            applied,
            skipped
        };

        report.totals.missingInProject += missingInProject.length;
        report.totals.differentContent += differentContent.length;
        report.totals.extraInProject += extraInProject.length;
        report.totals.candidates += candidates.length;
        report.totals.applied += applied.length;

        console.log(
            `[${projectName}] missing=${missingInProject.length} diff=${differentContent.length} extra=${extraInProject.length} candidates=${candidates.length} applied=${applied.length}`
        );
        if (options.verbose) {
            if (missingInProject.length) console.log(`  missing: ${missingInProject.join(', ')}`);
            if (differentContent.length) console.log(`  diff: ${differentContent.join(', ')}`);
            if (extraInProject.length) console.log(`  extra: ${extraInProject.join(', ')}`);
        }
    }

    await fs.writeFile(options.reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written to: ${options.reportPath}`);
    if (options.apply && report.totals.applied === 0) {
        console.log('Apply mode executed, but no files matched allowlist.');
    }
}

main().catch((err) => {
    console.error(`[engine-lockstep] ${err.message}`);
    process.exit(1);
});
