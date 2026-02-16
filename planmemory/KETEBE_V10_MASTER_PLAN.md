# Ketebe Studio v10: The Self-Evolving Engine
## Master Development Plan

**Version:** 1.0 (Draft)
**Date:** February 7, 2026
**Vision:** To integrate a live, local Micro-LLM into the Ketebe Studio environment, empowering the engine to autonomously build specialized tools, editors, and workflows based on user needs, effectively creating a "Self-Evolving" IDE.

---

## 1. The Core Philosophy: "Director, Not Laborer"

In v10, the developer's role shifts from manually coding every tool to directing an AI agent to build the tooling infrastructure. 
- **Current State (v7):** User waits for updates or manually codes a "Goblin Name Generator."
- **v10 State:** User types *"Add a panel to randomly generate Goblin names based on regional dialects,"* and the Studio builds, hot-loads, and presents the tool instantly.

---

## 2. Architectural Mandate: The Sandboxed Forge

To prevent "fragmentation hell" and stability collapse, v10 must adhere to a strict **Core vs. Extension** separation. The AI is a **Plugin Developer**, not a Core Engineer.

### 2.1. The Immutable Core (Protected)
The AI **CANNOT** modify these systems directly:
- `server.js` (The Hub/Backend)
- `EventBus.js` (The Communication Layer)
- `IsoStrategy.js` / `Renderer` (The Graphics Engine)
- `electron-main.js` (The OS Wrapper)

### 2.2. The Mutable Extension Layer (The "Forge")
The AI operates strictly within a Plugin API. It generates self-contained modules that the Core loads dynamically.

**The Extension API (`window.KetebeAPI`):**
- `registerTool(id, title, icon, htmlTemplate, initFunction)`
- `registerNode(type, properties, executionLogic)` (For Campaign Studio)
- `registerAssetType(extension, loaderFunction)`
- `subscribeToEvent(eventName, callback)`

---

## 3. Technical Stack

### 3.1. The Brain (Local Inference)
We will leverage high-performance Micro-LLMs optimized for coding, running locally via WebGPU or a local Python service.
- **Candidate Models:** 
  - `CodeQwen-7B` (High coding accuracy, reasonable VRAM).
  - `DeepSeek-Coder-V2-Lite` (State-of-the-art coding logic).
  - `Llama-3-8B-Instruct` (General purpose fallback).
- **Runtime:** `WebLLM` (Browser-based WebGPU) or `Ollama` API (Local Service).

### 3.2. The Memory (RAG System)
The LLM cannot read the entire codebase. We will implement **Retrieval-Augmented Generation (RAG)**.
- **Vector Store:** A local vector database (e.g., `LangChain.js` with `TensorFlow.js` embeddings) indexing:
  - The Ketebe Plugin API Documentation.
  - Existing Tool Source Code (as examples).
  - The User's current project context.

---

## 4. Phased Development Roadmap

### Phase 1: The Foundation (API Standardization)
**Goal:** Make the Studio modular enough to accept dynamic plugins without crashing.
1.  **Refactor `server.js`:** Break the monolith into modular routes to allow dynamic endpoint registration.
2.  **Define `KetebeAPI`:** Create the strict interface that plugins will use.
3.  **Plugin Loader:** Build a system in `dashboard.html` that scans a `plugins/` directory and hot-loads `.js` files safely (using `try/catch` blocks).

### Phase 2: The Context (RAG & Knowledge Base)
**Goal:** Teach the AI how to code for Ketebe.
1.  **Documentation Generator:** Auto-generate API docs from source code comments.
2.  **Vector Indexing:** Create a build step that chunks API docs and indexes them.
3.  **Prompt Engineering:** Design the System Prompt: *"You are an expert Ketebe Plugin Developer. Use `KetebeAPI.registerTool` to fulfill requests..."*

### Phase 3: The Integration (The "Code Forge")
**Goal:** Connect the LLM to the File System.
1.  **Chat Interface:** Add a "Director's Console" to the Dashboard.
2.  **Generation Loop:**
    - User Request -> RAG Retrieval -> LLM Generation -> Validation -> Write to `plugins/user_tool.js`.
3.  **Hot-Reload:** The EventBus detects the new file and loads the tool immediately.

### Phase 4: Safety & Verification
**Goal:** Prevent the AI from breaking the engine.
1.  **Runtime Sandbox:** Run generated plugins in a simplified context (e.g., separate IFrame or Worker) if possible.
2.  **Rollback System:** Every AI generation creates a git snapshot or backup. One-click "Undo" if the Studio breaks.
3.  **Linting:** Run a linter on generated code before saving to catch syntax errors.

---

## 5. Risk Assessment & Mitigation

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Hallucination** | AI writes code that calls non-existent APIs. | **Strict RAG:** Feed the AI the exact API definitions in the prompt context. |
| **Fragmentation** | User projects become incompatible. | **Project-Local Plugins:** Store AI tools in `project/plugins/`, not Global Studio. |
| **Performance** | Local LLM eats GPU, slowing down the game. | **Pause Inference:** Unload the LLM model when the user plays the game. |
| **Security** | AI writes malicious file-system code. | **Sanitized FS Access:** The API only allows file writes within the `project/` folder. |

---

## 6. Conclusion

Ketebe Studio v10 represents a shift from "Software" to "Organism." By strictly sandboxing the AI's creative capabilities to an Extension Layer, we can offer the dream of a "Self-Evolving Studio" without sacrificing the stability of a professional engine.
