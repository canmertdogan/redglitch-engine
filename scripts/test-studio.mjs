#!/usr/bin/env node
/**
 * Redglitch Studio UI Test Runner
 *
 * Bundles TSX/TS component tests using esbuild and executes them
 * under Node's native test runner (`node --test`) with JSDOM and inline sourcemaps.
 *
 * Usage:
 *   npm run test:studio                    # Run all tests
 *   npm run test:studio tier1              # Run Tier 1 tests
 *   npm run test:studio tier2              # Run Tier 2 tests
 *   npm run test:studio ItemEditor         # Run tests matching "ItemEditor"
 *   npm run test:studio -- -t "saves item" # Filter tests by name pattern
 *   npm run test:studio -- --list          # List discovered tests without running
 *   npm run test:studio -- --clean         # Clean test cache directory
 *   npm run test:studio -- --keep-cache    # Preserve .cache/test-studio after run
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_ROOT = path.join(ROOT, 'studio-ui', 'src', '__tests__');
const CACHE_DIR = path.join(ROOT, '.cache', 'test-studio');

// 1. Argument Parsing
const VALUE_FLAGS = new Set([
  '--test-name-pattern',
  '--test-skip-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-concurrency',
  '--test-timeout',
  '--test-shard',
]);

function parseArgs(argv) {
  const nodeFlags = [];
  const filters = [];
  let keepCache = false;
  let listOnly = false;
  let showHelp = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      showHelp = true;
    } else if (arg === '--list' || arg === '-l') {
      listOnly = true;
    } else if (arg === '--clean') {
      try {
        fs.rmSync(CACHE_DIR, { recursive: true, force: true });
      } catch (_) {}
    } else if (arg === '--keep-cache') {
      keepCache = true;
    } else if (arg === '-t' && i + 1 < argv.length) {
      nodeFlags.push(`--test-name-pattern=${argv[++i]}`);
    } else if (VALUE_FLAGS.has(arg) && i + 1 < argv.length) {
      nodeFlags.push(`${arg}=${argv[++i]}`);
    } else if (
      arg.startsWith('--test-name-pattern=') ||
      arg.startsWith('--test-skip-pattern=') ||
      arg.startsWith('--test-reporter=') ||
      arg.startsWith('--test-reporter-destination=') ||
      arg.startsWith('--test-concurrency=') ||
      arg.startsWith('--test-timeout=') ||
      arg.startsWith('--test-shard=') ||
      arg === '--test-only' ||
      arg === '--test-force-exit' ||
      arg === '--watch'
    ) {
      nodeFlags.push(arg);
    } else if (arg.startsWith('-')) {
      nodeFlags.push(arg);
    } else {
      filters.push(arg);
    }
  }

  return { nodeFlags, filters, keepCache, listOnly, showHelp };
}

// 2. Discover Test Files
function findTestFiles(dir, ignoreDirs = new Set(['helpers', 'mocks', 'fixtures', 'utils', '__mocks__'])) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) {
        results.push(...findTestFiles(fullPath, ignoreDirs));
      }
    } else if (/\.test\.(tsx|ts|jsx|js|mjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// 3. esbuild Plugin for CSS and Static Assets
const ignoreStylesAndAssetsPlugin = {
  name: 'ignore-styles-and-assets',
  setup(build) {
    build.onResolve(
      { filter: /\.(css|scss|less|sass|png|jpe?g|gif|svg|webp|ico|mp3|wav|ogg|glb|gltf|bin)$/ },
      (args) => ({ path: args.path, namespace: 'stub-assets' })
    );
    build.onLoad({ filter: /.*/, namespace: 'stub-assets' }, () => ({
      contents: 'export default {};',
      loader: 'js',
    }));
  },
};

async function main() {
  const { nodeFlags, filters, keepCache, listOnly, showHelp } = parseArgs(process.argv.slice(2));

  if (showHelp) {
    console.log(`
Redglitch Studio UI Test Runner
Usage: node scripts/test-studio.mjs [filters...] [options...]

Filters:
  tier1, tier2, tier3, tier4   Run tests under specific tier folder
  ItemEditor, QuestEditor      Run tests matching specific name
  path/to/test.test.tsx        Run explicit test file

Options:
  -t, --test-name-pattern=<pat>  Filter tests by name regex
  --test-concurrency=<N>         Set concurrent test workers (e.g. 1)
  --test-timeout=<ms>            Set test timeout in milliseconds
  --test-reporter=<spec|tap>     Output reporter (default: spec)
  --test-only                    Run only tests marked with { only: true }
  --clean                        Clean test cache directory
  --list, -l                     List discovered test files without running
  --keep-cache                   Do not delete .cache/test-studio after completion
  -h, --help                     Show this help message
`);
    process.exit(0);
  }

  // Discover all test files
  const allTests = findTestFiles(TESTS_ROOT);

  // Filter test files
  const normalizedFilters = filters.map((f) =>
    f.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^(\.\/)+/, '')
  );

  const matchedTests = allTests.filter((file) => {
    if (normalizedFilters.length === 0) return true;
    const norm = file.replace(/\\/g, '/');
    return normalizedFilters.some((f) => norm.includes(f));
  });

  if (listOnly) {
    console.log(`Discovered ${matchedTests.length} test file(s):`);
    for (const f of matchedTests) {
      console.log(`  ${path.relative(ROOT, f)}`);
    }
    process.exit(0);
  }

  if (matchedTests.length === 0) {
    if (filters.length > 0) {
      console.error(`[test-studio] Error: No test files found matching criteria.`);
      console.error(`[test-studio] Filters: ${filters.join(', ')}`);
      console.error(`[test-studio] Search root: ${path.relative(ROOT, TESTS_ROOT)}`);
      process.exit(1);
    }
    console.warn(`[test-studio] No test files found.`);
    console.warn(`[test-studio] Search root: ${path.relative(ROOT, TESTS_ROOT)}`);
    process.exit(0);
  }

  // Prepare cache directory
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const buildStart = performance.now();
  try {
    await esbuild.build({
      entryPoints: matchedTests,
      outdir: CACHE_DIR,
      outbase: TESTS_ROOT,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      jsx: 'automatic',
      packages: 'external',
      sourcemap: 'inline',
      outExtension: { '.js': '.mjs' },
      plugins: [ignoreStylesAndAssetsPlugin],
      alias: {
        '@': path.join(ROOT, 'studio-ui', 'src'),
        '@shared': path.join(ROOT, 'public', 'shared'),
        '@monaco-editor/react': path.join(ROOT, 'studio-ui', 'src', '__tests__', 'helpers', 'mockMonaco.tsx'),
      },
      logLevel: 'warning',
    });
  } catch (err) {
    console.error(`[test-studio] Compilation failed:`, err.message || err);
    process.exit(1);
  }
  const buildDuration = (performance.now() - buildStart).toFixed(1);

  // Map input files to bundled output .mjs files
  const bundledFiles = matchedTests.map((src) => {
    const rel = path.relative(TESTS_ROOT, src);
    return path.join(CACHE_DIR, rel.replace(/\.(tsx|ts|jsx|js|mjs)$/, '.mjs'));
  });

  // Prepare runner arguments
  const hasReporter = nodeFlags.some((f) => f.startsWith('--test-reporter='));
  const testArgs = [
    '--enable-source-maps',
    '--test',
    ...(hasReporter ? [] : ['--test-reporter=spec']),
    ...nodeFlags,
    ...bundledFiles,
  ];

  console.log(`[test-studio] Compiled ${matchedTests.length} test file(s) in ${buildDuration}ms. Launching node --test...`);

  const child = spawn(process.execPath, testArgs, {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test' },
  });

  const cleanup = () => {
    if (!keepCache) {
      try {
        fs.rmSync(CACHE_DIR, { recursive: true, force: true });
      } catch (_) {}
    }
  };

  process.on('SIGINT', () => {
    child.kill('SIGINT');
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    cleanup();
    process.exit(143);
  });

  child.on('close', (code, signal) => {
    cleanup();
    process.exit(code ?? (signal ? 1 : 0));
  });
}

main().catch((err) => {
  console.error('[test-studio] Unexpected error:', err);
  process.exit(1);
});
