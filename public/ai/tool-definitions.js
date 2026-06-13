export function registerDefaultTools(registry) {
        // --- FILE SYSTEM (fs) ---

        // fs.read (Safe)
        registry.register({
            name: 'fs.read',
            description: 'Read the contents of a file in the project.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to the file.' }
                },
                required: ['path']
            },
            execute: async (args) => {
                const res = await fetch(`/api/ide/read?file=${encodeURIComponent(args.path)}`);
                if (!res.ok) throw new Error(`Could not read ${args.path}`);
                const content = await res.text();
                return { content, path: args.path };
            }
        });

        // fs.list (Safe)
        registry.register({
            name: 'fs.list',
            description: 'List files and directories in a specific project directory.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    dir: { type: 'string', description: 'Relative path (e.g. "data/logic").', default: '' }
                }
            },
            execute: async (args) => {
                const dir = args.dir || '';
                const res = await fetch(`/api/ide/list?dir=${encodeURIComponent(dir)}`);
                if (!res.ok) throw new Error(`Could not list ${dir}`);
                return await res.json();
            }
        });

        // fs.write (Low-Risk)
        registry.register({
            name: 'fs.write',
            description: 'Write or update a file in the project.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Target file path.' },
                    content: { type: 'string', description: 'New content for the file.' }
                },
                required: ['path', 'content']
            },
            execute: async (args) => {
                // SHADOW BACKUP: Read existing content before writing
                let previousContent = null;
                let exists = false;
                try {
                    const check = await fetch(`/api/ide/read?file=${encodeURIComponent(args.path)}`);
                    if (check.ok) {
                        previousContent = await check.text();
                        exists = true;
                    }
                } catch (e) {}

                const res = await fetch('/api/ide/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: args.path, content: args.content })
                });
                if (!res.ok) throw new Error(`Failed to write to ${args.path}`);

                // Return UNDO function
                const undo = async () => {
                    console.log(`[Undo] Restoring ${args.path}...`);
                    if (exists) {
                        await fetch('/api/ide/write', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ file: args.path, content: previousContent })
                        });
                    } else {
                        await fetch('/api/ide/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ file: args.path })
                        });
                    }
                };

                return { success: true, path: args.path, undo };
            }
        });

        // fs.delete (High-Risk)
        registry.register({
            name: 'fs.delete',
            description: 'Delete a file from the project. PERMANENT ACTION.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File to delete.' }
                },
                required: ['path']
            },
            execute: async (args) => {
                // SHADOW BACKUP: Read existing content before deleting
                let previousContent = null;
                try {
                    const check = await fetch(`/api/ide/read?file=${encodeURIComponent(args.path)}`);
                    if (check.ok) {
                        previousContent = await check.text();
                    }
                } catch (e) {}

                const res = await fetch('/api/ide/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: args.path })
                });
                if (!res.ok) throw new Error(`Failed to delete ${args.path}`);

                // Return UNDO function
                const undo = async () => {
                    if (previousContent !== null) {
                        console.log(`[Undo] Restoring deleted file: ${args.path}`);
                        await fetch('/api/ide/write', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ file: args.path, content: previousContent })
                        });
                    }
                };

                return { success: true, message: `${args.path} deleted.`, undo };
            }
        });

        // fs.mkdir (Low-Risk)
        registry.register({
            name: 'fs.mkdir',
            description: 'Create a new directory.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Directory path to create.' }
                },
                required: ['path']
            },
            execute: async (args) => {
                const res = await fetch('/api/ide/mkdir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dir: args.path })
                });
                if (!res.ok) throw new Error(`Failed to create directory ${args.path}`);
                return { success: true, path: args.path };
            }
        });

        // fs.search (Safe)
        registry.register({
            name: 'fs.search',
            description: 'Search for text within all project files.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Text to search for.' },
                    include: { type: 'string', description: 'Glob pattern (e.g. "*.js").' }
                },
                required: ['query']
            },
            execute: async (args) => {
                const res = await fetch(`/api/ide/search?q=${encodeURIComponent(args.query)}&include=${encodeURIComponent(args.include || '')}`);
                if (!res.ok) throw new Error('Search failed');
                return await res.json();
            }
        });

        // --- PROJECT ---

        // project.getInfo (Safe)
        registry.register({
            name: 'project.getInfo',
            description: 'Get metadata about the current project (name, author, engine version).',
            securityLevel: 'safe',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const res = await fetch('/api/projects/current');
                if (!res.ok) throw new Error('Failed to get project info');
                return await res.json();
            }
        });

        // project.updateManifesto (Low-Risk)
        registry.register({
            name: 'project.updateManifesto',
            description: 'Update the project vision document (MANIFESTO.md) with new decisions or vision statements.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'The updated content for the MANIFESTO.md file.' }
                },
                required: ['content']
            },
            execute: async (args) => {
                // Get current project to find the right path
                const info = await (await fetch('/api/projects/current')).json();
                const path = info.name === 'Default Project' ? 'MANIFESTO.md' : `projects/${info.name}/MANIFESTO.md`;
                
                const res = await fetch('/api/ide/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: path, content: args.content })
                });
                if (!res.ok) throw new Error(`Failed to update Manifesto at ${path}`);
                return { success: true, message: "Project Manifesto updated with new vision." };
            }
        });

        // --- GAME DATA (Quests, NPCs, Items) ---

        // data.list (Safe)
        registry.register({
            name: 'data.list',
            description: 'List global game definitions (npcs, items, quests, skills).',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['npcs', 'items', 'quests', 'skills'] }
                },
                required: ['type']
            },
            execute: async (args) => {
                const endpoint = {
                    'npcs': '/api/npcs',
                    'items': '/api/items',
                    'quests': '/api/quests',
                    'skills': '/api/skill-defs' 
                };
                const res = await fetch(endpoint[args.type] || `/api/${args.type}`);
                if (!res.ok) throw new Error(`Could not list ${args.type}`);
                return await res.json();
            }
        });

        // data.update (Low-Risk)
        registry.register({
            name: 'data.update',
            description: 'Update or add a global game definition (e.g. adding a new quest or NPC).',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['npcs', 'items', 'quests', 'skills'] },
                    data: { type: 'array', description: 'The entire array of definitions.' }
                },
                required: ['type', 'data']
            },
            execute: async (args) => {
                const endpoint = {
                    'npcs': '/api/npc-defs',
                    'items': '/api/item-defs',
                    'quests': '/api/quests',
                    'skills': '/api/skill-defs'
                };
                const res = await fetch(endpoint[args.type], {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(args.data)
                });
                if (!res.ok) throw new Error(`Failed to update ${args.type}`);
                return { success: true };
            }
        });

        // --- GIT WORKFLOW ---

        // git.status (Safe)
        registry.register({
            name: 'git.status',
            description: 'Check the current status of the git repository (modified files, staged changes).',
            securityLevel: 'safe',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const res = await fetch('/api/git/status');
                if (!res.ok) throw new Error('Failed to get git status');
                return await res.json();
            }
        });

        // git.stage (Low-Risk)
        registry.register({
            name: 'git.stage',
            description: 'Stage files for commit (git add).',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    file: { type: 'string', description: 'The file to stage. Use "." for all.', default: '.' }
                }
            },
            execute: async (args) => {
                const res = await fetch('/api/git/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file: args.file || '.' })
                });
                if (!res.ok) throw new Error('Failed to stage files');
                return await res.json();
            }
        });

        // git.commit (High-Risk)
        registry.register({
            name: 'git.commit',
            description: 'Commit staged changes with a descriptive message.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'A meaningful commit message.' }
                },
                required: ['message']
            },
            execute: async (args) => {
                const res = await fetch('/api/git/commit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: args.message })
                });
                if (!res.ok) throw new Error('Failed to commit');
                return await res.json();
            }
        });

        // --- ASSET SYNTHESIS ---

        // asset.generate (Low-Risk)
        registry.register({
            name: 'asset.generate',
            description: 'Generate a procedural pixel-art asset based on a prompt and add it to the project.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'Description of the asset (e.g. "red potion", "gold coin").' },
                    filename: { type: 'string', description: 'Name for the saved file (e.g. "health_potion.png").' },
                    size: { type: 'number', description: 'Size in pixels (default 32).', default: 32 }
                },
                required: ['prompt', 'filename']
            },
            execute: async (args) => {
                if (!window.AssetSynth) {
                    // Lazy load synthesizer
                    await new Promise((resolve) => {
                        const s = document.createElement('script');
                        s.src = '/ai/asset-synth.js';
                        s.onload = resolve;
                        document.head.appendChild(s);
                    });
                }

                const dataUrl = await window.AssetSynth.generate(args.prompt, args.size || 32);
                
                // Upload to server using the new base64 endpoint
                const res = await fetch(`/api/assets/upload`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        path: `assets/${args.filename}`,
                        content: dataUrl,
                        isBase64: true
                    })
                });

                if (!res.ok) throw new Error('Failed to save generated asset');
                
                registry.eventBus.emit('asset:created', { path: `assets/${args.filename}`, type: 'sprite' });
                return { success: true, path: `assets/${args.filename}`, message: `GRRR... Asset synthesized: ${args.filename}` };
            }
        });

        // --- WORKFLOWS ---

        // workflow.run (High-Risk)
        registry.register({
            name: 'workflow.run',
            description: 'Execute a sequence of tool calls as a single transactional workflow.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    steps: { 
                        type: 'array', 
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                args: { type: 'object' }
                            },
                            required: ['name', 'args']
                        },
                        description: 'List of tool calls to execute in order.'
                    }
                },
                required: ['steps']
            },
            execute: async (args) => {
                if (!window.RedGlitchAIInstance || !window.RedGlitchAIInstance.workflowManager) {
                    throw new Error("Workflow Manager not initialized in RedGlitchAIInstance");
                }
                // Safety net: if steps have NO navigateTo and look like a plain studio-open
                // attempt (just generic stubs), redirect to correct studio instead.
                const steps = args.steps || [];
                const stepNames = steps.map(s => s.name);
                const hasNavigateTo = stepNames.includes('navigateTo');
                const isJustOpeningStudio = !hasNavigateTo && steps.length <= 3 && 
                    stepNames.every(n => ['asset.generate','code.insert','world.spawn'].includes(n));
                if (isJustOpeningStudio) {
                    const allArgs = JSON.stringify(steps).toLowerCase();
                    let target = null;
                    if (/iso|isometric|isopixel/.test(allArgs)) target = 'iso_studio';
                    else if (/platformer|platform/.test(allArgs)) target = 'platformer_studio';
                    else if (/topdown|top.down|rpg|world/.test(allArgs)) target = 'editor';
                    if (target && window.RedGlitchAIInstance && window.RedGlitchAIInstance.toolRegistry) {
                        return await window.RedGlitchAIInstance.toolRegistry.execute('navigateTo', { target });
                    }
                }
                return await window.RedGlitchAIInstance.workflowManager.executeWorkflow(args.steps);
            }
        });

        // --- STUDIO NAVIGATION ---

        // navigateTo (Safe)
        registry.register({
            name: 'navigateTo',
            description: 'Open a specific studio tool or editor. Use "editor" for top-down RPG map/level editing, "iso_studio" for isometric/isopixel map creation, "platformer_studio" for 2D platformer level editing, "script" for code/scripting.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    target: { 
                        type: 'string', 
                        enum: [
                            'dashboard', 'project_dashboard', 'editor', 'iso_studio', 
                            'platformer_studio', 'script', 'asset-manager', 'npc', 
                            'enemy', 'item', 'quest', 'dialogue', 'pixel', 'val_suite'
                        ],
                        description: 'The ID of the tool to open. "editor"=Top-down RPG Level Editor, "iso_studio"=IsoPixel/Isometric Studio, "platformer_studio"=2D Platformer Editor, "script"=Code Forge.'
                    }
                },
                required: ['target']
            },
            execute: async (args) => {
                let target = (typeof args === 'string') ? args : args.target;
                
                if (!target) throw new Error("Navigation target missing");

                // Normalize common aliases so LLM typos still work
                const targetAliases = {
                    'topdown': 'editor', 'topdown_studio': 'editor', 'rpg': 'editor', 'rpg_studio': 'editor', 'level_editor': 'editor', 'world': 'editor',
                    'isopixel': 'iso_studio', 'isometric': 'iso_studio', 'iso': 'iso_studio',
                    'platformer': 'platformer_studio', 'platform': 'platformer_studio',
                    'code_forge': 'script', 'code': 'script',
                    'logic': 'algorithm_studio', 'algorithm': 'algorithm_studio'
                };
                target = targetAliases[target] || target;

                registry._debug(`Navigating to: ${target}`);

                let hub = window;
                if (!hub.openWindow && window.parent && window.parent.openWindow) hub = window.parent;
                if (!hub.openWindow && window.top && window.top.openWindow) hub = window.top;

                if (hub.openWindow && hub.tools) {
                    const tool = hub.tools.find(t => t.id === target);
                    if (tool) {
                        hub.openWindow(tool);
                        return { success: true, message: `Opened ${tool.title}` };
                    }
                }

                const nav = {
                    'dashboard': 'dashboard.html',
                    'project_dashboard': 'project_dashboard.html',
                    'editor': 'editor.html',
                    'iso_studio': 'iso_editor.html',
                    'platformer_studio': 'platformer_editor.html',
                    'script': 'script_editor.html',
                    'asset-manager': 'asset_manager.html',
                    'npc': 'npc_editor.html',
                    'enemy': 'enemy_editor.html',
                    'item': 'item_editor.html',
                    'quest': 'quest_editor.html',
                    'dialogue': 'dialogue_editor.html',
                    'pixel': 'iso_editor.html',
                    'val_suite': 'ai/val-suite.html',
                    'algorithm_studio': 'algorithm_editor.html'
                };
                
                if (nav[target]) {
                    const url = nav[target];
                    // Avoid redundant reloads
                    const currentPath = window.location.pathname;
                    if (currentPath.includes(url) || (url === 'dashboard.html' && currentPath === '/')) {
                        registry._debug(`Already on ${target} (${url}), skipping redirect.`);
                        return { success: true, message: `Already on ${target}` };
                    }
                    if (window.top) window.top.location.href = url;
                    else window.location.href = url;
                    return { message: `Redirecting to ${target}` };
                }
                throw new Error(`Invalid target: ${target}`);
            }
        });
        
        // --- STUB TOOLS (absorb common LLM hallucinations silently) ---
        // These prevent unregistered code.* / asset.* / world.* from triggering
        // the namespace auto-redirect and opening random editors mid-workflow.
        const _stub = (stubName, msg) => registry.register({
            name: stubName, description: msg, securityLevel: 'safe',
            parameters: { type: 'object', properties: {} },
            execute: async () => ({ success: true, message: msg })
        });
        _stub('code.insert',   'No-op: code.insert is handled by the Script Editor directly.');
        _stub('asset.generate','No-op: use the Sprite Editor to generate assets.');
        _stub('world.spawn',   'No-op: use the World Editor to spawn objects.');

        // --- STUDIO PROXY TOOLS ---
        // These forward tool calls to the appropriate studio iframe via postMessage

        /**
         * Helper to ensure a specific studio/editor is open before dispatching.
         */
        const ensureStudioOpen = async (studioId, filename = null) => {
            const hub = window.parent || window;
            if (!hub.openWindow || !hub.tools) return false;

            const tool = hub.tools.find(t => t.id === studioId);
            if (!tool) return false;

            // Open the window if not already visible
            hub.openWindow(tool);
            if (filename) {
                // Future: add logic to open specific file
            }

            const frameId = `frame-${studioId}`;
            return new Promise((resolve) => {
                let tries = 0;
                const iv = setInterval(() => {
                    tries++;
                    const frame = hub.document.getElementById(frameId);
                    // Check if frame exists and is likely loaded (has contentWindow)
                    if (frame && frame.contentWindow) {
                        clearInterval(iv);
                        resolve(true);
                    }
                    if (tries > 50) { // 5s timeout
                        clearInterval(iv);
                        resolve(false);
                    }
                }, 100);
            });
        };

        // pixel.generateTerrain proxy (ensures iso_studio is open)
        registry.register({
            name: 'pixel.generateTerrain',
            description: 'Generate procedural terrain in the IsoPixel Studio.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    mode: { type: 'string', enum: ['terrain', 'islands', 'maze', 'flat'], default: 'terrain' },
                    scale: { type: 'number', default: 0.05 },
                    amplitude: { type: 'number', default: 10 }
                }
            },
            execute: async (args) => {
                const ready = await ensureStudioOpen('iso_studio');
                if (!ready) throw new Error('IsoPixel Studio could not be opened.');
                
                // The actual execution is handled by StudioBridge in iso_editor.js
                // which listens for 'studio:action:execute' emitted by ToolRegistry.execute()
                return { success: true, message: 'Terrain generation requested in IsoPixel Studio.' };
            }
        });

        // platformer.generateLevel proxy (ensures platformer_studio is open)
        registry.register({
            name: 'platformer.generateLevel',
            description: 'Generate a procedural platformer level.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    theme: { type: 'string', enum: ['flow', 'spire', 'abyss', 'gauntlet', 'clockwork'], default: 'flow' },
                    difficulty: { type: 'number', default: 5, description: 'Difficulty 1-10.' },
                    width: { type: 'number', default: 40 },
                    height: { type: 'number', default: 20 }
                }
            },
            execute: async (args) => {
                const ready = await ensureStudioOpen('platformer_studio');
                if (!ready) throw new Error('Platformer Studio could not be opened.');
                return { success: true, message: 'Level generation requested in Platformer Studio.' };
            }
        });

        // world.generateMap proxy (ensures editor is open and triggers generation)
        registry.register({
            name: 'world.generateMap',
            description: 'Generate a procedural top-down RPG map.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['village', 'dungeon', 'hell', 'heaven', 'lab'], default: 'village' },
                    density: { type: 'number', default: 5 },
                    seed: { type: 'string', description: 'Optional seed.' }
                }
            }
            // Remote execution - handled by StudioBridge in editor.js
            // The editor listens via eventBus for 'studio:action:execute' and processes through StudioBridge
        });

        // logic.generate proxy (ensures Algorithm Studio is open)
        registry.register({
            name: 'logic.generate',
            description: 'Generate or patch a visual algorithm node graph. The payload should contain nodes (with type, x, y, and specific data) and wires connecting them.',
            securityLevel: 'high-risk',
            parameters: {
                type: 'object',
                properties: {
                    nodes: { 
                        type: 'array',
                        description: 'List of logic nodes to spawn on the canvas. Must include type, x, y.',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Temporary ID for wiring (e.g. n1)' },
                                type: { type: 'string', description: 'Node definition type (e.g. event_on_start, math_add)' },
                                x: { type: 'number', description: 'X coordinate' },
                                y: { type: 'number', description: 'Y coordinate' },
                                value: { type: 'string', description: 'For var_string/number/etc' },
                                op: { type: 'string', description: 'For math/compare' }
                            },
                            required: ['id', 'type', 'x', 'y']
                        }
                    },
                    wires: {
                        type: 'array',
                        description: 'List of connections between nodes.',
                        items: {
                            type: 'object',
                            properties: {
                                sourceId: { type: 'string' },
                                sourcePort: { type: 'string', description: 'e.g. next, out, true, false' },
                                targetId: { type: 'string' },
                                targetPort: { type: 'string', description: 'e.g. exec, in, a, b' }
                            },
                            required: ['sourceId', 'sourcePort', 'targetId', 'targetPort']
                        }
                    }
                },
                required: ['nodes', 'wires']
            },
            execute: async (args) => {
                const ready = await ensureStudioOpen('logic');
                if (!ready) throw new Error('Algorithm Studio could not be opened.');
                return { success: true, message: 'Logic generation requested in Algorithm Studio.' };
            }
        });

        // Aliases for legacy
        registry.register({ ...registry.tools.get('fs.read'), name: 'readFile' });
        registry.register({ ...registry.tools.get('fs.list'), name: 'listFiles' });
        registry.register({ ...registry.tools.get('fs.write'), name: 'saveScript' });
    }