# Ketebe AI (Micro Edition)

Ketebe AI is a **browser-native, offline-capable AI assistant** integrated directly into the IDE. Unlike most AI tools that rely on cloud APIs (OpenAI/Anthropic), Ketebe AI runs **locally** on the user's GPU using WebGPU and WebAssembly.

## Core Philosophy
*   **Zero Latency**: No network round-trips for inference.
*   **Privacy**: Code never leaves the user's machine.
*   **Context Aware**: Deeply integrated with the active project files and engine documentation.

## Architecture

```ascii
[ User ] <---> [ AI Chat UI ] <---> [ KetebeAI (Orchestrator) ]
                                          |
                    +---------------------+---------------------+
                    |                     |                     |
            [ InferenceEngine ]    [ RAGEngine ]         [ ToolRegistry ]
            (Web Worker)           (Vector DB)           (Agent Actions)
                    |                     |                     |
            [ Transformers.js ]    [ Orama DB ]          [ EventBus ]
            (Qwen 2.5 Coder)       (Embeddings)          (Execute)
```

## Subsystems

### 1. Inference Engine (`public/ai/inference-engine.js`)
*   **Model**: `Qwen/Qwen2.5-Coder-0.5B-Instruct` (Quantized to q4f16).
*   **Execution**: Runs in a dedicated Web Worker to prevent UI freezing.
*   **Backend**: Tries **WebGPU** first (fast), falls back to **WASM** (CPU) if unavailable.
*   **Streaming**: Tokens are streamed character-by-character to the UI.

### 2. RAG System (`public/ai/rag-engine.js`)
*   **Goal**: Provide the small model (0.5B) with accurate knowledge about ketebe ENGINE APIs to prevent hallucinations.
*   **Vector Store**: Uses **Orama** (a browser-native vector database).
*   **Process**:
    1.  **Ingestion**: Documentation and core engine files are chunked and embedded (using `all-MiniLM-L6-v2`) into a `corpus.json`.
    2.  **Retrieval**: When user asks a question, the system finds the top 3 most relevant documentation chunks.
    3.  **Generation**: These chunks are injected into the System Prompt.

### 3. Tool Registry (`public/ai/tool-registry.js`)
*   Allows the AI to perform actions in the IDE.
*   **Tools**:
    *   `createScript`: Creates new JS files.
    *   `spawnNPC`: Adds an entity to the scene.
    *   `explainCode`: Reads the current selection.
*   **Safety**: All write actions go through a **Permission Gate** requiring user confirmation.

## UI Integration
*   **Spotlight Chat**: Accessed via `Ctrl+K`. Features a Retro-MSN aesthetic.
*   **Ghost Text**: Provides "Copilot-style" gray text autocompletion in the Monaco code editor.
