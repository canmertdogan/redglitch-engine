#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const SERVER_JS = path.join(ROOT, 'server.js');
const ROUTES_DIR = path.join(ROOT, 'server', 'routes');
const TOOL_DEFINITIONS = path.join(ROOT, 'public', 'ai', 'tool-definitions.js');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function normalizePathPart(part) {
  if (!part || part === '/') return '';
  return `/${String(part).replace(/^\/+|\/+$/g, '')}`;
}

function joinRoute(base, route) {
  return `${normalizePathPart(base)}${normalizePathPart(route)}` || '/';
}

function routePatternToRegex(pattern) {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\:([A-Za-z0-9_]+)/g, '[^/]+');
  return new RegExp(`^${escaped}(?:[/?#].*)?$`);
}

function endpointToPath(endpoint) {
  try {
    return new URL(endpoint, 'http://redglitch.local').pathname;
  } catch (_) {
    return String(endpoint).split(/[?#]/)[0];
  }
}

function extractMounts() {
  const source = read(SERVER_JS);
  const imports = new Map();
  const importRegex = /const\s+([A-Za-z0-9_]+)\s*=\s*require\(['"]\.\/server\/routes\/([^'"]+)['"]\)/g;
  let match;
  while ((match = importRegex.exec(source))) {
    imports.set(match[1], `${match[2]}.js`);
  }

  const mounts = [];
  const mountRegex = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_]+)/g;
  while ((match = mountRegex.exec(source))) {
    const file = imports.get(match[2]);
    if (file) mounts.push({ base: match[1], file, variable: match[2] });
  }
  return mounts;
}

function extractStringArray(raw) {
  const values = [];
  const stringRegex = /[`'"]([^`'"]+)[`'"]/g;
  let match;
  while ((match = stringRegex.exec(raw))) values.push(match[1]);
  return values;
}

function extractRoutesFromFile(file, base) {
  const source = read(path.join(ROUTES_DIR, file));
  const routes = [];
  const routeRegex = /router\.(get|post|put|patch|delete)\(\s*([\s\S]*?)(?:,\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z0-9_]+))/g;
  let match;
  while ((match = routeRegex.exec(source))) {
    const method = match[1].toUpperCase();
    const firstArg = match[2].trim();
    for (const route of extractStringArray(firstArg)) {
      if (route.includes('${')) continue;
      routes.push({ method, path: joinRoute(base, route), file });
    }
  }

  if (file === 'gamedata.js') {
    const singularAliases = {
      quests: 'quest',
      npcs: 'npc',
      items: 'item',
      enemies: 'enemy',
      skills: 'skill',
    };
    const defRegex = /createDefinitionRoutes\(\s*['"]([^'"]+)['"]/g;
    while ((match = defRegex.exec(source))) {
      const type = match[1];
      routes.push({ method: 'GET', path: joinRoute(base, `/${type}`), file, generated: true });
      routes.push({ method: 'POST', path: joinRoute(base, `/${type}`), file, generated: true });
      routes.push({ method: 'POST', path: joinRoute(base, `/${type}-defs`), file, generated: true });
      if (singularAliases[type]) {
        routes.push({ method: 'POST', path: joinRoute(base, `/${singularAliases[type]}-defs`), file, generated: true });
      }
    }
  }

  return routes;
}

function collectServerRoutes() {
  return extractMounts()
    .flatMap((mount) => extractRoutesFromFile(mount.file, mount.base))
    .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function collectFetchEndpoints(fn) {
  const source = String(fn || '');
  const endpoints = [];
  const fetchRegex = /fetch\(\s*(?:`([^`]+)`|'([^']+)'|"([^"]+)")/g;
  let match;
  while ((match = fetchRegex.exec(source))) {
    const endpoint = match[1] || match[2] || match[3];
    if (endpoint?.startsWith('/api/')) endpoints.push(endpoint);
  }

  const endpointMapRegex = /const\s+endpoint\s*=\s*\{([\s\S]*?)\};/g;
  while ((match = endpointMapRegex.exec(source))) {
    for (const endpoint of extractStringArray(match[1])) {
      if (endpoint.startsWith('/api/')) endpoints.push(endpoint);
    }
  }

  return [...new Set(endpoints)];
}

function inferMethods(toolName, endpoint) {
  const pathOnly = endpointToPath(endpoint);
  if (pathOnly.includes('/read') || pathOnly.includes('/list') || pathOnly.includes('/search')) return ['GET'];
  if (toolName.includes('.list') || toolName.includes('.get') || toolName === 'git.status' || toolName === 'fs.search') return ['GET'];
  if (toolName === 'fs.read' || toolName === 'fs.list' || toolName === 'project.getInfo' || toolName === 'data.list') return ['GET'];
  if (toolName === 'fs.delete') return ['POST'];
  return ['POST'];
}

async function collectRegisteredTools() {
  global.window = {
    location: { pathname: '/audit-tool-contracts' },
    top: { location: { href: '' } },
    RedGlitchAIInstance: null,
  };
  global.document = {
    createElement: () => ({}),
    head: { appendChild: () => {} },
  };

  const registry = {
    tools: new Map(),
    eventBus: { emit: () => {} },
    _debug: () => {},
    register(tool) {
      this.tools.set(tool.name, tool);
    },
  };

  const mod = await import(pathToFileURL(TOOL_DEFINITIONS).href);
  mod.registerDefaultTools(registry);
  return [...registry.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function loadEditorCatalog() {
  const mod = await import(pathToFileURL(path.join(ROOT, 'public', 'ai', 'editor-catalog.mjs')).href);
  return mod.editorForTool;
}

function toolRisk(tool) {
  return tool.risk || (tool.securityLevel === 'safe' ? 'read' : tool.securityLevel === 'low-risk' ? 'low' : 'high');
}

function toolMutates(tool) {
  if (typeof tool.mutates === 'boolean') return tool.mutates;
  return toolRisk(tool) !== 'read';
}

function findRouteMatch(routes, method, endpoint) {
  const pathname = endpointToPath(endpoint);
  return routes.find((route) => route.method === method && routePatternToRegex(route.path).test(pathname));
}

function audit(tools, routes) {
  const endpointChecks = [];
  const missingEndpoints = [];
  const toolsWithoutEndpoint = [];

  for (const tool of tools) {
    const endpoints = collectFetchEndpoints(tool.execute);
    if (endpoints.length === 0) {
      toolsWithoutEndpoint.push(tool.name);
      continue;
    }

    for (const endpoint of endpoints) {
      for (const method of inferMethods(tool.name, endpoint)) {
        const matched = findRouteMatch(routes, method, endpoint);
        const check = { tool: tool.name, method, endpoint, matched: matched ? matched.path : null };
        endpointChecks.push(check);
        if (!matched) missingEndpoints.push(check);
      }
    }
  }

  return { endpointChecks, missingEndpoints, toolsWithoutEndpoint };
}

function printReport({ tools, routes, result, editorForTool }) {
  console.log('Tool Contract Audit');
  console.log('===================');
  console.log(`Registered tools: ${tools.length}`);
  console.log(`Server routes discovered: ${routes.length}`);
  console.log(`Tool endpoint checks: ${result.endpointChecks.length}`);
  console.log(`Tools without direct /api fetch endpoint: ${result.toolsWithoutEndpoint.length}`);
  console.log(`Missing endpoint matches: ${result.missingEndpoints.length}`);

  if (result.missingEndpoints.length) {
    console.log('\nMissing endpoint matches:');
    for (const item of result.missingEndpoints) {
      console.log(`- ${item.tool}: ${item.method} ${item.endpoint}`);
    }
  }
  if (result.missingEndpoints.length === 0) {
    console.log('\nNo missing endpoint matches found.');
  }

  console.log('\nRegistered tool summary:');
  for (const tool of tools) {
    const endpoints = collectFetchEndpoints(tool.execute);
    const editor = editorForTool(tool.name);
    console.log(`- ${tool.name} | risk=${toolRisk(tool)} | mutates=${toolMutates(tool)} | editor=${editor ? `${editor.id} (${editor.file})` : 'none'} | endpoints=${endpoints.join(', ') || 'none/direct-ui'}`);
  }
}

async function main() {
  const routes = collectServerRoutes();
  const tools = await collectRegisteredTools();
  const editorForTool = await loadEditorCatalog();
  const result = audit(tools, routes);
  printReport({ tools, routes, result, editorForTool });

  if (result.missingEndpoints.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
