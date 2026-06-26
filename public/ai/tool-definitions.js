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

        // fs.create_file (Low-Risk)
        registry.register({
            name: 'fs.create_file',
            description: 'Create a new file in the project with the specified content.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Target file path.' },
                    content: { type: 'string', description: 'Content for the new file.' }
                },
                required: ['path', 'content']
            },
            execute: async (args) => {
                const res = await fetch('/api/ide/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-RedGlitch-Automation': 'kai' },
                    body: JSON.stringify({ file: args.path, content: args.content })
                });
                if (!res.ok) throw new Error(`Failed to create ${args.path}`);
                return {
                    success: true,
                    path: args.path,
                    undoDescriptor: { type: 'delete-file', path: args.path }
                };
            }
        });

        // fs.edit_file (Low-Risk)
        registry.register({
            name: 'fs.edit_file',
            description: 'Edit an existing file in the project. Either provide new_content to overwrite, or a patch to apply.',
            securityLevel: 'low-risk',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Target file path.' },
                    new_content: { type: 'string', description: 'Entire new content of the file.' },
                    patch: { type: 'string', description: 'Optional diff patch to apply.' }
                },
                required: ['path']
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

                const contentToWrite = args.new_content || args.patch || ''; // simplistic handling for now

                const res = await fetch('/api/ide/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-RedGlitch-Automation': 'kai' },
                    body: JSON.stringify({ file: args.path, content: contentToWrite })
                });
                if (!res.ok) throw new Error(`Failed to edit ${args.path}`);

                return {
                    success: true,
                    path: args.path,
                    undoDescriptor: { type: 'restore-file', path: args.path, existed: exists, previousContent }
                };
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
                    headers: { 'Content-Type': 'application/json', 'X-RedGlitch-Automation': 'kai' },
                    body: JSON.stringify({ file: args.path, content: args.content })
                });
                if (!res.ok) throw new Error(`Failed to write to ${args.path}`);

                return {
                    success: true,
                    path: args.path,
                    undoDescriptor: { type: 'restore-file', path: args.path, existed: exists, previousContent }
                };
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
                    headers: { 'Content-Type': 'application/json', 'X-RedGlitch-Automation': 'kai' },
                    body: JSON.stringify({ file: args.path })
                });
                if (!res.ok) throw new Error(`Failed to delete ${args.path}`);

                return {
                    success: true,
                    message: `${args.path} deleted.`,
                    undoDescriptor: { type: 'restore-file', path: args.path, existed: previousContent !== null, previousContent }
                };
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
            argumentAliases: { newManifesto: 'content', manifesto: 'content', vision: 'content' },
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
                const path = info.isRoot ? 'MANIFESTO.md' : `projects/${info.name}/MANIFESTO.md`;
                let previousContent = null;
                let existed = false;
                const current = await fetch(`/api/ide/read?file=${encodeURIComponent(path)}`).catch(() => null);
                if (current?.ok) {
                    previousContent = await current.text();
                    existed = true;
                }
                
                const res = await fetch('/api/ide/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-RedGlitch-Automation': 'kai' },
                    body: JSON.stringify({ file: path, content: args.content })
                });
                if (!res.ok) throw new Error(`Failed to update Manifesto at ${path}`);
                return {
                    success: true,
                    message: 'Project Manifesto updated with new vision.',
                    changedResources: [path],
                    undoDescriptor: { type: 'restore-file', path, existed, previousContent }
                };
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
        
        // Aliases for legacy
        registry.register({ ...registry.tools.get('fs.read'), name: 'readFile' });
        registry.register({ ...registry.tools.get('fs.list'), name: 'listFiles' });
        registry.register({ ...registry.tools.get('fs.write'), name: 'saveScript' });
        // --- ISO PIXEL STUDIO ---

        // iso.spawn_prefab (Safe)
        registry.register({
            name: 'iso.spawn_prefab',
            description: 'Spawn a prefab or NPC into the current IsoPixel scene.',
            securityLevel: 'safe',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Name of the prefab or NPC to spawn.' },
                    x: { type: 'number', description: 'World X coordinate.' },
                    y: { type: 'number', description: 'World Y coordinate.' }
                },
                required: ['name', 'x', 'y']
            },
            execute: async (args) => {
                const eventBus = window.RedGlitchEventBus || window.parent.RedGlitchEventBus;
                if (!eventBus) throw new Error('EventBus not found.');
                
                eventBus.emit('iso:spawn_asset', {
                    type: 'prefab',
                    name: args.name,
                    x: args.x,
                    y: args.y
                });
                
                return { success: true, message: `Spawned ${args.name} at (${args.x}, ${args.y})` };
            }
        });

    }
