import { PermissionGate } from './permission-gate.js';

/**
 * Ketebe AI - Tool Registry
 * Registry of Command Bus actions that the AI can invoke.
 */

export class ToolRegistry {
    constructor(eventBus = null) {
        this.eventBus = eventBus || window.KetebeEventBus;
        this.permissionGate = new PermissionGate();
        this.tools = new Map();
        this._registerDefaults();
    }

    /**
     * Register a tool definition.
     */
    register(toolDef) {
        this.tools.set(toolDef.name, toolDef);
    }

    /**
     * Get JSON Schema descriptions of all tools for the system prompt.
     */
    getToolPrompt() {
        const descriptions = Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));
        return JSON.stringify(descriptions, null, 2);
    }

    /**
     * Execute a tool call from the AI.
     */
    async execute(name, args) {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Unknown tool: ${name}`);

        console.log(`[ToolRegistry] AI Invoking Tool: ${name}`, args);
        
        try {
            // Check permissions
            const allowed = await this.permissionGate.requestPermission(
                name, 
                args, 
                tool.requiresConfirmation
            );

            if (!allowed) {
                this.eventBus.emit('ai:tool:rejected', { name });
                throw new Error(`User rejected action: ${name}`);
            }

            // Emit starting event (UI can show "AI is working...")
            const narrative = this._getNarrative(name);
            if (narrative) {
                this.eventBus.emit('ai:thought', { text: narrative });
            }
            this.eventBus.emit('ai:tool:start', { name, args });
            
            const result = await tool.execute(args);
            
            this.eventBus.emit('ai:tool:success', { name, result });
            return result;
        } catch (error) {
            this.eventBus.emit('ai:tool:error', { name, error: error.message });
            throw error;
        }
    }

    _getNarrative(toolName) {
        const flavor = {
            'navigateTo': [
                "Greasing the gears of the navigation drive...",
                "Teleporting to the requested sector...",
                "Shifting dimensional planes...",
                "Loading pixels... please hold your breath."
            ],
            'saveScript': [
                "Smashing this code into the file system...",
                "Writing bytes with a tiny digital chisel...",
                "Committing sins... I mean, scripts... to disk.",
                "Injecting logic into the mainframe."
            ],
            'readFile': [
                "Reading the forbidden scrolls...",
                "Extracting data from the void...",
                "Peeking at your messy code...",
                "Decrypting the matrix..."
            ]
        };
        
        const options = flavor[toolName];
        if (options) {
            return options[Math.floor(Math.random() * options.length)];
        }
        return null;
    }

    _registerDefaults() {
        // Navigation
        this.register({
            name: 'navigateTo',
            description: 'Switch between different editors or open a specific studio tool.',
            parameters: {
                type: 'object',
                properties: {
                    target: { 
                        type: 'string', 
                        enum: ['map-editor', 'npc-editor', 'quest-editor', 'item-editor', 'logic-editor', 'asset-manager', 'dashboard', 'ide'],
                        description: 'The name of the tool to navigate to.'
                    }
                },
                required: ['target']
            },
            execute: async (args) => {
                const nav = {
                    'map-editor': 'editor.html',
                    'npc-editor': 'npc_editor.html',
                    'quest-editor': 'quest_editor.html',
                    'item-editor': 'item_editor.html',
                    'logic-editor': 'logic_editor.html',
                    'asset-manager': 'asset_manager.html',
                    'dashboard': 'dashboard.html',
                    'ide': 'script_editor.html'
                };
                if (nav[args.target]) {
                    window.location.href = nav[args.target];
                    return { message: `Redirecting to ${args.target}` };
                }
                throw new Error(`Invalid navigation target: ${args.target}`);
            }
        });

        // File Reading
        this.register({
            name: 'readFile',
            description: 'Read the contents of a file in the project (scripts, data, etc.).',
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

        // File Listing
        this.register({
            name: 'listFiles',
            description: 'List files in a specific project directory.',
            parameters: {
                type: 'object',
                properties: {
                    dir: { type: 'string', description: 'Relative path to the directory (e.g. "data/logic").' }
                },
                required: ['dir']
            },
            execute: async (args) => {
                const res = await fetch(`/api/ide/list?dir=${encodeURIComponent(args.dir)}`);
                if (!res.ok) throw new Error(`Could not list ${args.dir}`);
                return await res.json();
            }
        });

        // Save Script
        this.register({
            name: 'saveScript',
            description: 'Create or update a logic script in the project.',
            requiresConfirmation: true,
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Name of the script (without .js).' },
                    code: { type: 'string', description: 'Full JavaScript content of the script.' }
                },
                required: ['name', 'code']
            },
            execute: async (args) => {
                const res = await fetch('/api/logic/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: args.name, js: args.code, json: '{}' })
                });
                if (!res.ok) throw new Error(`Failed to save script ${args.name}`);
                return { success: true, path: `data/logic/${args.name}.js` };
            }
        });
    }
}