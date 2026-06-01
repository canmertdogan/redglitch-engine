/**
 * RedGlitch Engine Core Type Definitions
 * Providing intelligence to the RedGlitch Code Studio
 */

declare namespace redglitch {
    /**
     * The global event communication hub.
     */
    interface EventBus {
        /**
         * Subscribe to an event.
         */
        on(event: string, callback: (data: any) => void): void;
        /**
         * Subscribe to an event once.
         */
        once(event: string, callback: (data: any) => void): void;
        /**
         * Unsubscribe from an event.
         */
        off(event: string, callback: (data: any) => void): void;
        /**
         * Broadcast an event to all subscribers.
         */
        emit(event: string, data?: any): void;
    }

    /**
     * Manages all game assets (sprites, audio, data).
     */
    interface AssetManager {
        /**
         * Get a sprite definition by ID.
         */
        getSprite(id: string): any;
        /**
         * Load an audio asset.
         */
        loadAudio(id: string): Promise<HTMLAudioElement>;
        /**
         * Get a list of all available assets by type.
         */
        listAssets(type?: 'image' | 'audio' | 'data'): any[];
    }

    /**
     * Global state shared across all editors and the game runtime.
     */
    interface SharedProjectState {
        /**
         * Get a value from the global state using a dot-notation path.
         */
        get(path: string): any;
        /**
         * Update a value in the global state.
         */
        set(path: string, value: any): void;
        /**
         * Save the current project state to the server.
         */
        save(): Promise<boolean>;
    }

    /**
     * RedGlitch AI Action Protocol (KAP)
     * Standardized bridge for AI ↔ Studio tool communication
     */
    namespace ai {
        /**
         * Security classification for AI-driven actions.
         */
        type ActionSecurityLevel = 'safe' | 'low-risk' | 'high-risk';

        /**
         * Standard request format for a tool action.
         */
        interface ActionRequest {
            /** Unique ID for tracking the request/response lifecycle */
            id: string;
            /** The tool's namespace and method (e.g., 'isopixel.setPixel') */
            method: string;
            /** Arguments matching the tool's defined schema */
            params: Record<string, any>;
            /** Timestamp of the request */
            timestamp: number;
        }

        /**
         * Standard response format for a tool action.
         */
        interface ActionResponse {
            /** Matches the ID of the original ActionRequest */
            id: string;
            /** True if the action was executed successfully */
            success: boolean;
            /** The result data from the tool */
            result?: any;
            /** Error details if success is false */
            error?: ActionError;
        }

        /**
         * Standard error format for tool actions.
         */
        interface ActionError {
            /** Short machine-readable error code */
            code: string;
            /** Human-readable error message for the user/AI */
            message: string;
            /** Optional extra context for debugging */
            data?: any;
        }

        interface RedGlitchAI {
            /**
             * Initialize the AI system (lazy-loaded).
             */
            initialize(): Promise<void>;
            
            /**
             * Send a chat message to the AI assistant.
             */
            chat(message: string, options?: ChatOptions): Promise<ChatResponse>;
            
            /**
             * Get a code completion suggestion (ghost text).
             */
            suggest(prefix: string, suffix: string, filePath: string): Promise<string>;
            
            /**
             * Clear conversation history.
             */
            clearHistory(): void;
            
            /**
             * Check if the system is fully initialized.
             */
            readonly isInitialized: boolean;
        }

        interface ChatOptions {
            /**
             * Whether to stream the response (default: true).
             */
            stream?: boolean;
            /**
             * Context from the active editor to include in the prompt.
             */
            editorContext?: {
                filePath?: string;
                fileContent?: string;
                cursorPosition?: { line: number, column: number };
            };
        }

        interface ChatResponse {
            /**
             * The plain text response from the AI.
             */
            text: string;
            /**
             * Any tool calls parsed from the response.
             */
            toolCalls: ToolCall[];
            /**
             * Any code blocks parsed from the response.
             */
            codeBlocks: CodeBlock[];
        }

        interface ToolCall {
            name: string;
            args: any;
        }

        interface CodeBlock {
            language: string;
            code: string;
        }

        interface ToolRegistry {
            /** Register a new capability with the AI system */
            register(tool: ToolDefinition): void;
            /** Execute a tool by name (e.g., 'isopixel.drawRect') */
            execute(name: string, args: any): Promise<ActionResponse>;
            /** Get a list of all tools currently available to the AI */
            listTools(): ToolDefinition[];
        }

        interface ToolDefinition {
            /** The name of the tool, including namespace (e.g., 'fs.writeFile') */
            name: string;
            /** Detailed description for the LLM to understand when to use it */
            description: string;
            /** Security tier (defaults to 'high-risk' if not specified) */
            securityLevel?: ActionSecurityLevel;
            /** Manual confirmation required before execution (overrides security level defaults) */
            requiresConfirmation?: boolean;
            /** JSON Schema of the parameters this tool accepts */
            parameters: any;
            /** The actual implementation function */
            execute: (args: any) => Promise<any>;
            /** Optional function to reverse the action */
            undo?: (args: any, result: any) => Promise<void>;
        }
    }
}

declare const eventBus: redglitch.EventBus;
declare const assetManager: redglitch.AssetManager;
declare const sharedProjectState: redglitch.SharedProjectState;
declare const redglitchAI: redglitch.ai.RedGlitchAI;

