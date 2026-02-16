/**
 * Ongonluk Engine Core Type Definitions
 * Providing intelligence to the Ongonluk Code Studio
 */

declare namespace ketebe {
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
     * Ketebe AI Micro Edition API
     * Local-first AI Assistant for the Ketebe Studio
     */
    namespace ai {
        interface KetebeAI {
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
            register(tool: ToolDefinition): void;
            execute(name: string, args: any): Promise<any>;
        }

        interface ToolDefinition {
            name: string;
            description: string;
            requiresConfirmation?: boolean;
            parameters: any; // JSON Schema
            execute: (args: any) => Promise<any>;
        }
    }
}

declare const eventBus: ketebe.EventBus;
declare const assetManager: ketebe.AssetManager;
declare const sharedProjectState: ketebe.SharedProjectState;
declare const ketebeAI: ketebe.ai.KetebeAI;

