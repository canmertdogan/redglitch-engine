# Algorithm Studio Revamp Master Plan (v2.0)
**Target:** Transform the fragile string-builder prototype into a robust, integrated Visual Scripting Language (VSL) comparable to Unreal Blueprints or Unity Bolt.

## Phase 1: The "Runtime" Foundation (JSON Interpreter)
*Goal: Stop generating raw JS strings. Switch to a data-driven interpreter.*
1.  **Define Schema:** Create a strict JSON schema for graphs (Nodes, Pins, Connections, Properties).
2.  **Runtime Interpreter:** Build `VisualScriptEngine.js` in the core engine. This class receives the JSON graph and executes it node-by-node at runtime.
3.  **Deprecate Compiler:** Remove the `CodeBuilder` class. The Editor now saves `.json` graphs, not `.js` files.

## Phase 2: Dynamic Type System & Registry
*Goal: Remove hardcoded node libraries. Make the engine teach the editor.*
1.  **Reflection API:** Create a system where the Game Engine exports its API (functions, properties) as a JSON definition file.
2.  **Auto-Import:** The Algorithm Studio reads this definition file on load to dynamically generate its Node Library.
3.  **Strict Typing:** Implement robust type checking (e.g., `Entity` cannot connect to `String`) using the engine's real type info.

## Phase 3: Asset & Prefab Integration
*Goal: Stop manual string typing. Connect to the Asset Database.*
1.  **Asset Picker Node:** Replace "Audio ID" text inputs with a dropdown searching `assets/sounds/`.
2.  **Prefab Picker:** Replace "Spawn Entity" string inputs with a dropdown list of defined Prefabs.
3.  **Live Validation:** Highlight nodes in red if the referenced asset (e.g., "sound_jump.mp3") is deleted from the project.

## Phase 4: Local Scope & Instance Data
*Goal: Fix the "Global Variable" problem. Allow reusable scripts.*
1.  **Graph Variables:** Add a "Variables" panel to define inputs/outputs for the graph itself (like function arguments).
2.  **Instance Memory:** Update the Runtime Interpreter to store variables on the *Entity Instance*, not the global scope.
3.  **Custom Functions:** Allow graphs to be saved as "Sub-Graphs" and dropped into other graphs as custom nodes.

## Phase 5: Live Debugging (The "Killer Feature")
*Goal: See the logic flow while the game runs.*
1.  **Execution Highlighting:** When the game runs, the active node should glow in the Editor via WebSocket events.
2.  **Data Probes:** Hovering over a wire during playback shows the current value passing through it.
3.  **Breakpoints:** Allow users to right-click a node and "Toggle Breakpoint," pausing the game engine when hit.

## Phase 6: Mathematical & Logic Expansion
*Goal: Parity with written code.*
1.  **Expression Node:** A single node where users can type math expressions (e.g., `(a + b) * c`) instead of chaining 5 math nodes.
2.  **Vector Math:** Add native support for Vector2/Vector3 operations (Dot, Cross, Distance, Normalize).
3.  **Struct Support:** Allow splitting/combining objects (e.g., split Player into X, Y, HP).

## Phase 7: UI & UX Overhaul (Polishing the Shell)
*Goal: Make it feel like a pro tool.*
1.  **Context-Sensitive Search:** When dragging a wire into empty space, the search menu should only show compatible nodes.
2.  **Comment Groups:** Allow grouping nodes into colored "Comment Boxes" for organization.
3.  **Reroute Nodes:** Add "dot" nodes to organize messy wires.

## Phase 8: Event System Deep Dive
*Goal: Better response to game world events.*
1.  **Custom Events:** Allow users to define their own events (e.g., "OnBossPhase2") and broadcast them.
2.  **Animation Events:** Hook into the Animation System to trigger logic on specific frames.
3.  **Physics Hooks:** specialized nodes for Raycasts, Overlaps, and Collision normals.

## Phase 9: Performance Optimization
*Goal: Ensure VSL doesn't lag the game.*
1.  **Graph Compilation (AOT):** (Optional) Compile static JSON graphs to WebAssembly or optimized JS functions for release builds only.
2.  **Tick Throttling:** Add settings to run certain scripts only every N frames.
3.  **Node Caching:** Cache node lookup maps to avoid O(n) searches during execution.

## Phase 10: AI Copilot Integration (The "IRAB" Touch)
*Goal: Let the AI write the graph for you.*
1.  **"Text to Graph":** Type "Make the enemy jump when I shoot," and IRAB generates the nodes and wires automatically.
2.  **Auto-Fix:** If a graph has errors (disconnected pins), IRAB can suggest a fix.
3.  **Explain Graph:** Select a group of nodes and ask IRAB "What does this do?" to get a summary.
