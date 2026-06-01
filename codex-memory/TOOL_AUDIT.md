# Tool and Runtime Audit (Detailed)

Date: 2026-02-26
Scope: Key editors, AI UI, shared infrastructure, and runtime engines.

## 1) Shared Infrastructure

### 1.1 EventBus
Files: `public/shared/EventBus.js`
- Role: Cross-window pub/sub and WebSocket bridge for live updates.
- Behaviors:
  - Auto-connects to `/ws` based on current origin and protocol.
  - Supports wildcard subscriptions and basic event history.
  - Emits connection lifecycle events and reconnects with exponential backoff.
- Strengths:
  - Simple interface and broad compatibility across editors.
  - History buffer and priority listeners enable basic debugging and control.
- Gaps and risks:
  - A single global EventBus is used by many tools; failure or reconnection storms affect the entire IDE.
  - No central schema or validation for event payloads.
  - Wildcard handlers can generate significant noise and perf overhead (e.g., AI debug stream).
- Improvement ideas:
  - Define event schema and enforce payload shapes.
  - Introduce backpressure for high-frequency events (metrics, debug logs).
  - Add a structured “channels” or “topics” layer to reduce wildcard traffic.

### 1.2 AssetManager
Files: `public/shared/AssetManager.js`
- Role: Centralized asset registry, dependency scanning, thumbnail generation, and import/export operations.
- Behaviors:
  - Heuristic dependency scanning on JSON/text assets via substring matching.
  - Path rewriting to virtual server routes (project overlay model).
  - EventBus integration for asset requests and thumbnails.
- Strengths:
  - Provides a consistent asset source for tools and runtime.
  - Thumbnail generation for UI workflows.
- Gaps and risks:
  - Dependency scanning is heuristic and potentially expensive for large registries.
  - Errors during scans are swallowed, so failures can be silent.
- Improvement ideas:
  - Cache dependency scans and debounce rescans on file events.
  - Track asset sizes and render a “hot path” loading report.

### 1.3 SharedProjectState
Files: `public/shared/SharedProjectState.js`
- Role: Global project state, undo/redo, activity log synchronization.
- Behaviors:
  - Auto-saves on interval and before unload.
  - Emits state changes over EventBus.
- Strengths:
  - Provides a shared state model for multi-window editing.
  - Built-in undo stack and activity log integration.
- Gaps and risks:
  - Uses JSON stringify for equality checks which can be expensive for large objects.
  - `maxUndoSteps` is fixed and does not scale based on memory use.
- Improvement ideas:
  - Switch to structural sharing or patch-based updates.
  - Introduce partial state persistence to reduce network writes.

## 2) Core Editors and Tools

### 2.1 Dashboard
Files: `public/dashboard.html`
- Role: Primary hub for project management, navigation, and quick launching tools.
- UI/UX:
  - Pixel-styled layout, fixed grid with sidebar, CRT overlay, and animated backgrounds.
  - Emphasizes retro aesthetic with global theme variables.
- Strengths:
  - Clear identity, visually distinct.
  - Strong organization with nav groups, project cards, and wizard flows.
- Gaps and risks:
  - Logic appears inline in HTML or scattered, making reuse difficult.
  - Potential performance overhead from heavy background canvas effects.
- Improvement ideas:
  - Extract dashboard logic into a dedicated JS controller (if not already).
  - Lazy-load heavy visual effects when idle.

### 2.2 Code Forge (Script Editor)
Files: `public/script_editor.html`, `public/script_editor.js`, `public/lib/monaco/redglitch.d.ts`
- Role: Monaco-based code editor for game scripts.
- Behaviors:
  - EventBus integration, project tracking, multi-tab support, auto-save.
  - AI hooks for `open`, `insert`, `replace`, and `document` tools via StudioBridge.
- Strengths:
  - Structured integration with ToolRegistry and permission flow.
  - Settings manager and tab state indicate growth beyond MVP.
- Gaps and risks:
  - Large file handling and performance aren’t explicitly addressed.
  - AI injection is simple append/replace; no diff preview here (handled in PermissionGate but UI context is limited).
- Improvement ideas:
  - Add diagnostics and lint integration.
  - Add fine-grained diffs for AI modifications before applying.

### 2.3 Algorithm Studio
Files: `public/algorithm_editor.html` (large embedded UI)
- Role: Visual graph editor for algorithmic logic.
- Behaviors:
  - Rich toolbar, tool rail, layout presets, zoom presets, minimap, debug mode.
- Strengths:
  - Deep, high-productivity UI with custom tooling.
  - Strong keyboard shortcut coverage.
- Gaps and risks:
  - Heavily inlined HTML/CSS/JS suggests limited modularity.
  - UI complexity increases the cost of refactors and testing.
- Improvement ideas:
  - Extract core graph model to shared logic (independent from DOM).
  - Standardize UI components across editors (toolbar, panels, modals).

### 2.4 Campaign Studio
Files: `public/campaign_editor.html`, `public/campaign_editor.js`
- Role: Visual campaign flow designer with node-based logic.
- Behaviors:
  - Node creation with drag/drop, validation, auto-arrange, and playtest.
  - Embedded AI assistant panel in an iframe.
- Strengths:
  - Extensive node taxonomy supports complex narrative structures.
  - Built-in validation and testing flows.
- Gaps and risks:
  - Complex editor state likely duplicated with Algorithm Studio’s graph logic.
  - The AI panel is embedded but not tightly integrated with the editor state.
- Improvement ideas:
  - Consolidate node graph logic into a shared graph engine.
  - Add a graph schema validator with reusable rules.

### 2.5 Iso Editor (IsoPixel Studio)
Files: `public/iso_editor.html`, `public/iso_editor.js` (not fully expanded here)
- Role: Isometric map editor with layered tools and visual controls.
- Strengths:
  - Deep tooling for a complex rendering model.
  - Appears to integrate with event bus and project state.
- Gaps and risks:
  - Likely similar architecture to the top-down editor without shared engine abstractions.
- Improvement ideas:
  - Extract a shared tilemap editing core used across Iso and RPG editors.

### 2.6 Quest / Item / Skill / NPC Editors
Files: `public/quest_editor.js`, `public/item_editor.js`, `public/skill_editor.js`, `public/npc_editor.html/js` (patterns)
- Role: CRUD editors for data-driven entities.
- Behaviors:
  - EventBus listeners for cross-editor syncing (e.g., item updated, skill updated).
  - Inline HTML rendering inside JS classes.
- Strengths:
  - Practical coverage for typical RPG workflows.
- Gaps and risks:
  - Heavy string-based HTML generation makes refactors and i18n harder.
  - No shared form components or validation framework.
- Improvement ideas:
  - Create a shared editor UI kit with consistent form controls and validation.

### 2.7 Achievements Studio
Files: `public/achievements_editor.js`
- Role: Manage achievements with triggers, rewards, and icon selection.
- Behaviors:
  - Loads from `/dunyalar/definitions/achievements.json`.
  - Inline preview updates and list rendering.
- Strengths:
  - Simple, direct workflow and UI feedback.
- Gaps and risks:
  - No SharedProjectState integration; relies on direct JSON fetch and local state.
  - No explicit save flow visible in core logic.
- Improvement ideas:
  - Wire to SharedProjectState for consistent persistence and undo.

### 2.8 Character Studio
Files: `public/character_editor.js`
- Role: Character definition + sprite preview editor.
- Behaviors:
  - Uses SharedProjectState as source of truth for characters.
  - Canvas-based preview with worm/segment visualization.
  - Emits `character:*` updates over EventBus.
- Strengths:
  - Strong integration with other editors (items, skills).
- Gaps and risks:
  - Heavy reliance on mutable globals and direct DOM access.
- Improvement ideas:
  - Encapsulate rendering logic into a preview class.

### 2.9 Dialogue Studio
Files: `public/dialogue_editor.js`
- Role: Conversation scripting tool for NPCs and branching dialogues.
- Behaviors:
  - Loads from `/dunyalar/definitions/dialogues.json` and `/dunyalar/definitions/npcs.json`.
  - Syncs NPCs into dialogue character list.
  - Emits `dialogue:*` updates and writes to SharedProjectState.
- Strengths:
  - Practical data integration with NPC definitions.
- Gaps and risks:
  - UI generation is string-based and not componentized.
- Improvement ideas:
  - Extract conversation graph logic to a reusable module.

### 2.10 Enemy Studio
Files: `public/enemy_editor.js`
- Role: Enemy stats, AI, and animation editor.
- Behaviors:
  - Template-driven enemy creation.
  - Preview canvas for animation.
  - Bulk selection mode and filters.
- Strengths:
  - Extensive templates and animation support.
- Gaps and risks:
  - Large monolithic module with mixed concerns (UI, data, preview).
- Improvement ideas:
  - Split into data model, preview renderer, and UI controller layers.

### 2.11 NPC Studio
Files: `public/npc_editor.js`
- Role: NPC definition editor.
- Behaviors:
  - Similar structure to Enemy Studio with templates and preview.
  - EventBus integration with dialogue and character updates.
- Strengths:
  - Consistent cross-editor signaling patterns.
- Gaps and risks:
  - Shared logic with Enemy Studio is duplicated.
- Improvement ideas:
  - Extract a shared “actor editor” base for NPC/Enemy.

### 2.12 Behavior Studio (Brain Architect)
Files: `public/behavior_editor.js`
- Role: Visual behavior tree/FSM editor for NPC AI.
- Behaviors:
  - Uses template behavior graphs and emits `behavior:*` updates.
- Strengths:
  - Clear template system for rapid setup.
- Gaps and risks:
  - Graph logic appears embedded and not reusable outside this tool.
- Improvement ideas:
  - Generalize graph model for Algorithm Studio reuse.

### 2.13 Logic Studio (Blockly)
Files: `public/logic_editor.js`
- Role: Blockly-based gameplay logic authoring.
- Behaviors:
  - Defines custom blocks for events and entity operations.
  - Integrates with EventBus and SharedProjectState.
- Strengths:
  - Explicit domain blocks map well to engine concepts.
- Gaps and risks:
  - Block definitions are hard-coded; expansion is manual and error-prone.
- Improvement ideas:
  - Generate block definitions from a schema or registry.

### 2.14 Pixel Studio
Files: `public/pixel_editor.js`
- Role: Pixel art and animation editor.
- Behaviors:
  - Multi-layer, multi-frame editing with onion skin and history.
  - Emits `asset:sprite:*` updates to other tools.
- Strengths:
  - Feature-rich for in-engine sprite workflow.
- Gaps and risks:
  - State is global and large; undo stack can grow significantly.
- Improvement ideas:
  - Normalize history snapshots to reduce memory usage.

### 2.15 Platformer Level Studio
Files: `public/platformer_editor.js`
- Role: Platformer map editor with collisions and prefabs.
- Behaviors:
  - Tile painting, collision overlay, entities, collectibles, checkpoints.
  - Loads project levels and prefabs from server APIs.
- Strengths:
  - Robust editor state and navigation support.
- Gaps and risks:
  - Large class handles rendering, IO, input, and UI state.
- Improvement ideas:
  - Split IO (load/save), renderer, and input handling.

### 2.16 Prefab Studio
Files: `public/prefab_editor.js`
- Role: Entity composition and prefab authoring.
- Behaviors:
  - Canvas preview and component hierarchy.
  - Supports zoom, pan, and component editing.
- Strengths:
  - Clear separation between component list and inspector.
- Gaps and risks:
  - Saves are editor-owned; no central schema validation.
- Improvement ideas:
  - Validate prefab schema before save and emit structured errors.

### 2.17 Interactive Cutscene Studio
Files: `public/interactive_cutscene_editor.js`
- Role: Timeline-based interactive cutscene editor.
- Behaviors:
  - Track-based timeline with keyframes and branching.
  - Asset list and integration flags for campaign/algorithm studios.
- Strengths:
  - Ambitious scope; supports multi-track narrative flows.
- Gaps and risks:
  - Complex data structure; risk of inconsistency without schema validation.
- Improvement ideas:
  - Add JSON schema validation and timeline integrity checks.

### 2.18 Background Studio (GIF)
Files: `public/background_editor.js`
- Role: GIF-based background editor with frame timeline.
- Behaviors:
  - Parses GIFs, allows frame edits, and saves to project assets.
  - Emits background asset updates over EventBus.
- Strengths:
  - Practical tool for animated backgrounds inside the IDE.
- Gaps and risks:
  - Heavy reliance on local canvas operations; performance could degrade with large GIFs.
- Improvement ideas:
  - Add frame size limits and preview throttling.

### 2.19 UI Studio (Menu Editor)
Files: `public/menu_editor.js`
- Role: WYSIWYG UI screen and menu editor.
- Behaviors:
  - Drag/drop, snapping, inspector panels, multi-screen UI data.
  - Loads from `/api/ui-config` if available.
- Strengths:
  - Full-featured layout tool with undo/redo and search.
- Gaps and risks:
  - Large surface area with significant DOM manipulation and custom state.
- Improvement ideas:
  - Centralize UI element serialization and validation.

### 2.20 Input Studio
Files: `public/input_editor.js`
- Role: Input mapping editor.
- Behaviors:
  - Reads/writes `data/input_map.json` via `/api/ide/read`.
  - Key capture modal for bindings.
- Strengths:
  - Simple, direct UX with explicit binding list.
- Gaps and risks:
  - Uses IDE API endpoints directly, which are permissive.
- Improvement ideas:
  - Add validation for duplicate bindings and reserved keys.

### 2.21 Localization Studio
Files: `public/localization_editor.js`
- Role: Multi-language text editing and management.
- Behaviors:
  - Loads from `/dunyalar/definitions/locales.json`.
  - Tracks completion rates and language metadata.
  - Auto-saves on a timer.
- Strengths:
  - Strong UX for language management and completeness tracking.
- Gaps and risks:
  - Large tables can be expensive to render and update.
- Improvement ideas:
  - Virtualize table rows for large localization sets.

### 2.22 FX Studio
Files: `public/fx_editor.js`
- Role: Particle effect authoring tool.
- Behaviors:
  - Configurable particle parameters and preview.
  - Sprite list integration and updates from Pixel Studio.
- Strengths:
  - Real-time feedback loop for effects tuning.
- Gaps and risks:
  - No formal schema for FX presets.
- Improvement ideas:
  - Introduce FX preset schema and validation.

### 2.23 Shader Lab
Files: `public/shader_editor.js`
- Role: WebGL fragment shader editor with live compile.
- Behaviors:
  - Templates for CRT, wave, glitch, chromatic effects.
  - Live compilation and error log view.
- Strengths:
  - Rapid iteration workflow for shader development.
- Gaps and risks:
  - No error recovery or fallback if compile fails repeatedly.
- Improvement ideas:
  - Add versioning of shader drafts and safe fallback shader.

### 2.24 Item Studio
Files: `public/item_editor.js`
- Role: Item definitions and stats editor.
- Behaviors:
  - Sprite selection from pixel sprites and item PNGs.
  - Emits `item:*` updates and writes to SharedProjectState.
- Strengths:
  - Data fields include campaign runtime compatibility.
- Gaps and risks:
  - Data schema is implicit; no validation on save.
- Improvement ideas:
  - Define a schema and validation for item definitions.

### 2.25 Skill Studio
Files: `public/skill_editor.js`
- Role: Skill definitions and FX linkage.
- Behaviors:
  - Sprite selection and FX hooks.
  - Emits `skill:*` updates and writes to SharedProjectState.
- Strengths:
  - Integration with FX Editor is explicit.
- Gaps and risks:
  - No schema validation for skill definitions.
- Improvement ideas:
  - Validate cooldowns, mana, and type enums.

### 2.26 Quest Studio
Files: `public/quest_editor.js`
- Role: Quest chain and stage editor.
- Behaviors:
  - Stages, prerequisites, rewards, and NPC references.
  - Responds to item/NPC updates via EventBus.
- Strengths:
  - Handles multi-stage quest structures with edits inline.
- Gaps and risks:
  - Inline HTML rendering makes complex layouts hard to maintain.
- Improvement ideas:
  - Extract stage rendering into a reusable UI component.

## 3) AI UI and Tooling

### 3.1 Assistant Panel
Files: `public/ai/ui/assistant-panel.js`, `public/ai/ui/assistant-panel.html`
- Role: Retro-MSN styled AI assistant with streaming, boot progress, and debug stream.
- Behaviors:
  - Integrates with native backend loading progress.
  - Uses local audio cues, avatar states, and boredom timer.
  - Observes EventBus for debug logs and metrics.
- Strengths:
  - Strong UX identity and feedback loops.
  - Local-first AI with offline capability is a major differentiator.
- Gaps and risks:
  - Debug stream can become noisy and affect UI performance.
  - Heavy UI logic in a single controller class.
- Improvement ideas:
  - Add throttling for debug stream and metrics events.
  - Split UI concerns into view-model + renderer for testability.

### 3.2 Tool Registry and Studio Bridge
Files: `public/ai/tool-registry.js`, `public/ai/studio-bridge.js`
- Role: Defines AI tool protocol, tool discovery, and execution routing.
- Strengths:
  - Clear discovery and sync flow to backend.
  - Supports action recovery and tool announcements.
- Gaps and risks:
  - Tool execution is largely delegated to per-editor scripts without formal schema validation at runtime.
- Improvement ideas:
  - Add runtime parameter validation against schema before execution.

### 3.3 Permission Gate
Files: `public/ai/permission-gate.js`
- Role: Safety layer for AI tool execution, with protected file patterns and user confirmation.
- Strengths:
  - Blocks changes to critical engine and build files by default.
  - Provides an audit log and session-based approval.
- Gaps and risks:
  - Path-based protection assumes canonical path formats; risks exist if tool passes unexpected paths.
- Improvement ideas:
  - Normalize and validate paths against server-provided canonical roots.

## 4) Runtime Engines Audit

### 4.1 IsoPixel Engine
Files: `public/engines/iso-pixel/main.js`
- Focus: 2.5D isometric rendering, FX, physics-style movement, and HUD.
- Strengths:
  - Fixed timestep loop with interpolation.
  - Built-in performance metrics emission.
  - FX and shader system hooks included.
- Gaps and risks:
  - Large monolithic class with many responsibilities (rendering, input, physics, HUD, FX).
  - Shader system is present but disabled by default.
- Improvement ideas:
  - Split into subsystems: Input, Simulation, Render, FX, HUD.
  - Use a render pipeline abstraction for potential WebGL migration.

### 4.2 RPG Top-Down Engine
Files: `public/engines/rpg-topdown/main.js`
- Focus: Scriptable logic system, data-driven systems, and top-down rendering.
- Strengths:
  - Logic system dynamically loads scripts and algorithms.
  - Includes a messaging hook to forward logs to parent window.
- Gaps and risks:
  - Dynamic import of scripts through `/api/logic/js` couples runtime to server endpoints.
  - Log forwarding without filtering can cause performance issues.
- Improvement ideas:
  - Add caching and error boundary around logic load failures.
  - Consider a bundled runtime mode for production builds.

### 4.3 Platformer Engine
Files: `public/engines/platformer-2d/main.js`
- Focus: AABB physics and side-scrolling camera.
- Strengths:
  - Lightweight, modular systems for combat, quest, dialogue.
  - FX system integration for feedback.
- Gaps and risks:
  - Several systems are optional and assume globals are defined.
  - Runtime behavior is controlled by global state and window events.
- Improvement ideas:
  - Use explicit dependency injection for optional systems.
  - Add a mode to run without DOM/window (for headless testing).

## 5) Cross-Cutting Observations
- Editors share similar UI patterns but do not share a component library.
- Many tools embed logic in HTML files, raising maintenance cost.
- EventBus is essential but lacks formal schema enforcement.
- AI tooling is powerful and safer than typical tooling due to PermissionGate.
- Runtime engines are functional but monolithic; extraction of subsystems would improve testability and extensibility.
