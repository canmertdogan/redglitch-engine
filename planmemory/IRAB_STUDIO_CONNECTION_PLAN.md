# 🧠 IRAB ↔ Studio Connection: Master Development Plan

**Objective:** Transform IRAB from a "Chatbot" into a fully agentic "Studio Operator" capable of manipulating the Ketebe Engine tools (IsoPixel, Code Forge, World Builder) directly to fulfill user requests.

**Philosophy:** "You say it, IRAB does it." — Zero-friction automation with maximum safety and feedback.

---

## 📋 Executive Summary

This plan outlines the evolution of the **Ketebe Action Protocol (KAP)**, a standardized bridge allowing the AI to "drive" the Studio interface. We will move from simple text responses to complex, multi-step workflows where IRAB can generate assets, write code, build levels, and configure game systems autonomously, always under user supervision.

---

## 🗓️ Phase 1: The Ketebe Action Protocol (KAP)
**Goal:** Define the language and security contract for AI ↔ Studio communication.

1.  **Schema Definition:**
    *   Define the JSON-RPC compatible schema for all tool calls (e.g., `{"method": "isopixel.draw", "params": {...}}`).
    *   Create `ActionRequest`, `ActionResponse`, and `ActionError` type definitions in `ketebe.d.ts`.
2.  **Security Levels:**
    *   Classify all potential actions into security tiers:
        *   🟢 **Safe:** Read-only (list files, inspect nodes, check status).
        *   🟡 **Low-Risk:** Non-destructive changes (add new file, place object in empty space).
        *   🔴 **High-Risk:** Destructive changes (delete file, overwrite asset, mass-replace).
3.  **EventBus Channels:**
    *   Establish dedicated channels: `ai:command:request`, `ai:command:approve`, `studio:action:execute`, `studio:action:result`.
4.  **The "Handshake":**
    *   Implement a protocol where open tools "announce" themselves to IRAB upon load (e.g., "IsoPixel Studio is ready and listening").

## 🗓️ Phase 2: The Universal Tool Registry
**Goal:** Create the central brain that knows *what* can be done.

1.  **Registry Architecture:**
    *   Build `ToolRegistry.js` as a singleton in the AI sub-system.
    *   Allow dynamic registration: Tools (IsoPixel, Code Forge) register their capabilities when they mount.
2.  **Capability Discovery:**
    *   Implement `registerTool(namespace, name, schema, handler)` method.
    *   Example: `registry.register('isopixel', 'setPixel', {x, y, color}, fn)`.
3.  **Context Injection:**
    *   Automatically feed the list of *currently available* tools into the LLM's system prompt (e.g., if IsoPixel is closed, don't offer pixel art tools).
4.  **Mock Implementation:**
    *   Create a "Test Bench" tool to verify the registry works without needing the full AI model.

## 🗓️ Phase 3: The "Studio Bridge" & Permission Gate
**Goal:** The execution layer that safely carries out commands.

1.  **Studio Bridge Module:**
    *   Create `StudioBridge.js` in the main renderer process.
    *   It listens for `ai:command:execute` events and dispatches them to the target tool's registered handler.
2.  **Interactive Permission Gate:**
    *   Build the "May I?" UI.
    *   **Ghost Actions:** Before execution, visual tools (like Level Editor) should show a "ghost" of what will happen (e.g., a semi-transparent building placement).
    *   **Diff View:** For code/text, show a side-by-side diff.
    *   **Batch Approval:** Allow approving a chain of 5 actions with one click.
3.  **Undo/Redo Integration:**
    *   **Critical:** Every AI action must push a reversible state to `SharedProjectState`.
    *   Implement `revertLastAIAction()` globally.

## 🗓️ Phase 4: Basic File & Project Operations (The Foundation)
**Goal:** Enable IRAB to manage the project structure.

1.  **File System Tools:**
    *   `fs.list`, `fs.read`, `fs.write`, `fs.delete`, `fs.mkdir`.
    *   Implement "Smart Search" (e.g., "Find the script that handles player health").
2.  **Project Management:**
    *   `project.getConfig`, `project.addDependency`, `project.backup`.
3.  **Asset Management:**
    *   `assets.import`, `assets.find`, `assets.delete`.
    *   Allow IRAB to organize the asset folder (e.g., "Move all PNGs to /sprites").
4.  **Verification:**
    *   IRAB can create a new project scaffolding from scratch via chat command.

## 🗓️ Phase 5: Code Forge Integration (The Coding Assistant)
**Goal:** Turn IRAB into a pair programmer that types for you.

1.  **Editor Manipulation:**
    *   `editor.open(file)`, `editor.goto(line)`, `editor.select(range)`.
    *   `editor.insert(text)`, `editor.replace(range, text)`.
2.  **Semantic Operations:**
    *   `code.refactor(functionName, strategy)`.
    *   `code.fixSyntax()`: Automatically fix linting errors found in the current file.
    *   `code.document()`: Add JSDoc comments to the selected function.
3.  **Test Runner Integration:**
    *   IRAB can run tests (`npm test`) and analyze the output to propose fixes.

## 🗓️ Phase 6: IsoPixel Studio Automation (The Artist)
**Goal:** Procedural generation and asset manipulation driven by AI.

1.  **Canvas Control:**
    *   `pixel.resize(w, h)`, `pixel.clear()`, `pixel.setLayer(id)`.
2.  **Drawing Primitives:**
    *   `pixel.drawRect`, `pixel.drawLine`, `pixel.fill`.
    *   `pixel.setPixel(x, y, color)` (Batch mode for performance).
3.  **Generative Commands:**
    *   "Generate a grass tile": IRAB uses a noise algorithm (or calls a generative model) and plots the pixels directly onto the canvas.
    *   "Make this blue tree red": IRAB applies a palette swap filter.
4.  **Animation Helper:**
    *   `pixel.createFrame()`, `pixel.duplicateFrame()`.
    *   "Create a 4-frame idle animation": IRAB duplicates the frame and shifts pixels slightly.

## 🗓️ Phase 7: World Builder & Level Design (The Architect)
**Goal:** Rapid level prototyping.

1.  **Entity Placement:**
    *   `world.spawn(entityId, x, y)`.
    *   `world.remove(entityId)`.
2.  **Tile Mapping:**
    *   `world.setTile(layer, x, y, tileId)`.
    *   "Fill this area with water": IRAB executes a flood fill or rect fill.
3.  **Procedural Layouts:**
    *   "Generate a dungeon room here": IRAB calculates a layout and places floor/wall tiles accordingly.
4.  **Path & Trigger Setup:**
    *   `world.addWaypoint(x, y)`, `world.link(triggerId, targetId)`.
    *   IRAB can wire up door triggers to logic scripts automatically.

## 🗓️ Phase 8: Macro & Workflow Chaining
**Goal:** Executing complex, multi-tool tasks.

1.  **The Workflow Engine:**
    *   Ability to define a "Recipe": A sequence of dependent actions.
    *   Example: **"Create a new Goblin Enemy"**
        1.  Create `sprites/goblin.png` (IsoPixel).
        2.  Create `logic/goblin_ai.js` (Code Forge).
        3.  Register in `assets.json` (Asset Manager).
        4.  Place one in the current scene (World Builder).
2.  **Transactional Execution:**
    *   If step 3 fails, roll back steps 1 and 2 automatically.
3.  **User-Defined Macros:**
    *   Allow users to record their own actions and save them as a "Skill" for IRAB to use later.

## 🗓️ Phase 9: Feedback & "Thought Visualization"
**Goal:** Transparency so the user trusts the AI.

1.  **Visual Intent Indicators:**
    *   When IRAB is "thinking" about placing an object, show a glowing outline in the game view.
    *   When editing code, highlight the lines being considered.
2.  **Status Reporting:**
    *   Detailed progress bars for long tasks ("Generating 50 variations... 30%").
3.  **Interactive Debugging:**
    *   If IRAB fails a task, it reports exactly *why* (e.g., "I couldn't place the NPC because the location (10, 20) is solid wall").
4.  **Voice Feedback (TTS):**
    *   IRAB verbally confirms completion ("Done. I've placed the goblin.") using the browser's Speech Synthesis API.

## 🗓️ Phase 10: Autonomous "Co-Pilot" Mode
**Goal:** Proactive, context-aware assistance.

1.  **Context Watching:**
    *   IRAB monitors your actions. If you create a door sprite, it proactively asks: "Should I create a script for this door?"
2.  **Auto-Fix:**
    *   Detects runtime errors in the game engine and immediately offers a fix button in the chat.
3.  **Learning Preference:**
    *   IRAB learns your style (e.g., "You usually name scripts `snake_case`, but this one is `CamelCase`. Want me to rename it?").
4.  **"Chaos Mode" (Controlled):**
    *   For testing, tell IRAB: "Play the game and try to break it." IRAB spawns random inputs/entities to stress-test the engine.

---
**Next Steps:** Begin **Phase 1** (Schema & Protocol) immediately to lay the foundation for the Phase 4 Agentic capabilities outlined in the Micro Plan.
