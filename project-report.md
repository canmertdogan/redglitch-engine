# Redglitch Engine — Project Report

**Version:** 7.0.1  
**Product Name:** Redglitch Game Studio  
**Description:** Redglitch Engine Alpha - Professional Game Development Studio  
**Last Updated:** July 2026

---

## Overview

Redglitch Engine is a full-stack, professional game development studio platform. It ships as an Electron desktop application backed by a Node.js/Express API server, a Python FastAPI AI "Cortex" (IRAB), a Vite+React TypeScript studio UI, and five distinct game engine runtimes (2D and 3D). The platform supports building and exporting games to **Windows, macOS, iOS, Android, and Web**.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **Desktop Shell** | Electron 40.x (frameless, custom title bar, single-instance lock) |
| **Mobile** | Capacitor 8.x (iOS & Android native bridges) |
| **Build System** | Vite 8.x + esbuild 0.27.x |
| **Language (UI)** | TypeScript 6.x, React 19.x |
| **Language (Runtimes)** | Vanilla JavaScript (modular game engines) |
| **Backend API** | Express.js 4.x on Node.js (HTTP + WebSocket) |
| **AI Backend** | Python FastAPI + `llama-cpp-python` (local LLM inference) |
| **3D Rendering** | Three.js 0.183.x |
| **Physics** | cannon-es 0.20.x |
| **AI Inference (Browser)** | ONNX Runtime Web, HuggingFace Transformers, WebNN/WebGPU |
| **Vector Search** | Orama 3.x |
| **Code Editor** | Monaco Editor 0.55.x (via `@monaco-editor/react`) |
| **3D Assets** | MagicaVoxel parser (`parse-magica-voxel`), GLB baking pipeline |
| **Icons** | Lucide React 1.x |

---

## Project Structure

```
redglitch-engine/
├── electron-main.js              # Electron main process: window mgmt, CortexManager, IPC
├── preload.js                    # Context bridge: window controls, cortex start/stop
├── server.js                     # Express server entry: 24 route modules, CORS, IRAB proxy
├── build-game.js                 # Multi-platform game export pipeline
├── build-adapter.js              # Android adapter bundler (esbuild)
├── capacitor.config.ts           # Capacitor mobile config
├── vite.config.ts                # Vite multi-entry (16 editor pages)
├── tsconfig.json                 # TypeScript config
├── package.json                  # Dependencies & scripts
├── redglitch.json                # Project metadata
│
├── server/                       # Express backend
│   ├── config.js                 # Port, dirs, limits
│   ├── middleware/
│   │   └── logging.js            # Security headers, request logger
│   ├── routes/                   # 24 route modules
│   │   ├── saves.js, levels.js, levels3d.js
│   │   ├── gamedata.js, projects.js
│   │   ├── logic.js, abilities.js
│   │   ├── brains.js, audio.js, slots.js
│   │   ├── cutscenes.js, campaigns.js
│   │   ├── assets.js, assets3d.js
│   │   ├── system.js, ide.js, git.js, build.js
│   │   ├── shaders.js, test-3d.js, debug-3d.js
│   │   ├── ui-config.js, opencode-zen.js, monitor-3d.js
│   ├── services/
│   │   ├── AssetRegistry.js       # Central asset registry service
│   │   ├── gitService.js          # Git operations service
│   │   └── projectService.js      # Project CRUD & management
│   ├── utils/
│   │   ├── safeFs.js              # Safe filesystem operations
│   │   ├── pathGuard.js           # Path traversal protection
│   │   ├── fsUtils.js             # Filesystem utilities
│   │   └── automationPolicy.js    # AI automation policy enforcement
│   └── websocket/
│       └── index.js               # WebSocket hub
│
├── backend/                       # Python AI Cortex ("IRAB")
│   ├── main.py                    # FastAPI server (594 lines): metrics, chat, heartbeat
│   ├── brain.py                   # LlamaCpp LLM wrapper: load, inference, config
│   ├── rag.py                     # Retrieval-Augmented Generation engine
│   ├── watcher.py                 # File system watcher
│   ├── config.py                  # Project root path
│   ├── requirements.txt           # fastapi, llama-cpp-python, sentence-transformers, etc.
│   └── tests/                     # Python test suite
│
├── studio-ui/                     # React+TypeScript Studio UI
│   ├── src/
│   │   ├── main_*.tsx             # 16 entry points (one per editor)
│   │   ├── components/
│   │   │   ├── AlgorithmEditor.tsx
│   │   │   ├── AssetManager.tsx
│   │   │   ├── AudioStudio.tsx
│   │   │   ├── CutsceneEditor.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── DialogueEditor.tsx
│   │   │   ├── EnemyEditor.tsx
│   │   │   ├── FXEditor.tsx
│   │   │   ├── ItemEditor.tsx
│   │   │   ├── NPCEditor.tsx
│   │   │   ├── PixelEditor.tsx
│   │   │   ├── PrefabEditor.tsx
│   │   │   ├── QuestEditor.tsx
│   │   │   ├── ScriptEditor.tsx
│   │   │   ├── ShaderEditor.tsx
│   │   │   ├── UIDesigner.tsx
│   │   │   ├── StudioApp.tsx
│   │   │   └── shared/            # Toast, Sidebar, FormSection
│   │   └── hooks/useStudio.ts
│   └── *.html                     # 17 HTML entry points
│
├── public/                        # Static web root + game runtime
│   ├── engines/                   # 5 game engines
│   │   ├── rpg-topdown/           # Top-down RPG engine (26 files)
│   │   │   ├── main.js            # Engine bootstrap
│   │   │   ├── Core.js            # Core game loop
│   │   │   ├── Entities.js        # Entity system
│   │   │   ├── mapSystem.js       # Tile map system
│   │   │   ├── input.js           # Input handling
│   │   │   ├── NPC.js             # NPC logic
│   │   │   ├── saveSystem.js      # Save/load
│   │   │   ├── campaignSystem.js  # Campaign progression
│   │   │   ├── InteractiveCutsceneEngine.js
│   │   │   ├── VisualScriptEngine.js
│   │   │   ├── stateMachine.js    # Entity state machine
│   │   │   ├── logicRuntime.js    # Visual logic runtime
│   │   │   ├── MenuSystem.js      # In-game menus
│   │   │   ├── WeatherSystem.js
│   │   │   └── ... (26 total)
│   │   ├── iso-pixel/             # Isometric pixel engine (6 files)
│   │   │   ├── main.js, renderer.js
│   │   │   ├── IsoEntity.js, IsoCombatSystem.js
│   │   │   ├── fxSystem.js, shaderSystem.js
│   │   ├── platformer-2d/         # 2D side-scroller engine (12 files)
│   │   │   ├── main.js, renderer.js
│   │   │   ├── PhysicsSystem.js, Animator.js
│   │   │   ├── ParallaxSystem.js, CombatSystem.js
│   │   │   ├── PlatformerAssetManager.js
│   │   │   ├── generator/         # Procedural level generation
│   │   │   └── tests/
│   │   ├── 3d/                    # Three.js 3D engine
│   │   │   ├── main.js, modes/, systems/
│   │   │   └── Unified3DAdapter.js
│   │   └── unified-3d/            # Unified 3D game engine
│   │       ├── Game3DCore.js, Unified3DGame.js
│   │       ├── TerrainRuntime3D.js
│   │       ├── VehicleSystem3D.js
│   │       ├── ModeInterface.js, modes/
│   │       └── editor/
│   ├── engines/shared/            # 40 shared engine modules
│   │   ├── EngineAdapter.js       # Unified engine adapter interface
│   │   ├── CampaignController.js  # Campaign management
│   │   ├── CampaignValidator.js   # Campaign validation
│   │   ├── CrossEngineSerializer.js
│   │   ├── ConditionEvaluator.js
│   │   ├── InventorySystem.js
│   │   ├── ItemDefinitions.js
│   │   ├── AbilityDefinitions.js
│   │   ├── GameHUD.js
│   │   ├── Save3D.js
│   │   ├── VoxelMeshGen.js        # Voxel to mesh conversion
│   │   ├── LowPolyTerrainGen.js   # Terrain generation
│   │   ├── MaterialSystem.js      # Material/shader management
│   │   ├── ShaderRegistry.js
│   │   ├── Physics3DWorld.js      # cannon-es physics world
│   │   ├── AudioSpatial3D.js      # 3D spatial audio
│   │   ├── Camera3DController.js
│   │   ├── Input3D.js, Raycast3D.js
│   │   ├── SkyboxSystem.js, WeatherSystem3D.js
│   │   ├── TextureAtlas3D.js, TextureComposer.js
│   │   ├── PaletteManager.js, FacetTool.js
│   │   ├── AssetLoader3D.js, Renderer3D.js
│   │   ├── MaterialPreviewRenderer.js
│   │   ├── TriMeshRenderer3D.js
│   │   ├── HybridScene3D.js, Engine3DBase.js, Engine3DAdapter.js
│   │   ├── IsoPixelAdapter.js, PlatformerAdapter.js, TopDownAdapter.js
│   │   ├── PowerSelector.js, OutputPass.js
│   │   └── editor/                # Shared editor components
│   │
│   ├── shared/                    # Shared game systems (19 modules)
│   │   ├── EventBus.js            # Event pub/sub system
│   │   ├── AssetManager.js        # Central asset loading/caching
│   │   ├── InputSystem.js         # Cross-engine input abstraction
│   │   ├── LogicSystem.js         # Visual logic graph executor
│   │   ├── LogicInterpreter.js    # Low-level logic interpreter
│   │   ├── DialogueSystem.js      # Branching dialogue runtime
│   │   ├── QuestSystem.js         # Quest tracking & progression
│   │   ├── AchievementSystem.js   # Achievement engine
│   │   ├── SoundManager.js        # Audio playback manager
│   │   ├── BehaviorTreeRunner.js  # AI behavior trees
│   │   ├── UISystem.js            # UI rendering engine
│   │   ├── UIRenderer.js          # UI renderer
│   │   ├── VFXBridge.js           # Visual effects bridge
│   │   ├── AtmosphereSystem.js    # Atmosphere/lighting
│   │   ├── LocalizationSystem.js  # Multi-language support
│   │   ├── SchemaRegistry.js      # Data schema validation
│   │   ├── Profiler.js            # Performance profiling
│   │   ├── LoggerHook.js          # Debug logging
│   │   └── SharedProjectState.js  # Cross-editor state sync
│   │
│   ├── strategies/                # Engine adapter strategies
│   │   ├── IsoStrategy.js
│   │   ├── PlatformerStrategy.js
│   │   └── TopDownStrategy.js
│   │
│   ├── ai/                        # AI agent system (~48 modules)
│   │   ├── agent-loop.mjs         # Core agent orchestration loop
│   │   ├── ai-mode.mjs            # AI mode state machine
│   │   ├── automation-contract.mjs # AI automation contract
│   │   ├── automation-flags.mjs   # Feature flag system
│   │   ├── permission-gate.js     # Safety gate for AI write operations
│   │   ├── tool-registry.js       # Tool registration & discovery
│   │   ├── tool-definitions.js    # Tool schema definitions
│   │   ├── tool-call-parser.mjs   # Parse AI tool calls
│   │   ├── tools/
│   │   │   └── editor-tools.js    # 20+ editor automation tools
│   │   ├── rag-engine.js          # RAG engine (browser-side)
│   │   ├── inference-engine.js    # Browser-side inference
│   │   ├── model-manager.js       # Model download/cache management
│   │   ├── context-manager.js     # Conversation context window
│   │   ├── tokenizer-utils.js     # Token counting/estimation
│   │   ├── workflow-manager.js    # Multi-step workflow execution
│   │   ├── vector-store.js        # Vector embedding store
│   │   ├── embedding-worker.js    # Web Worker for embeddings
│   │   ├── bridge.js              # AI ↔ Studio bridge
│   │   ├── studio-bridge.js       # Studio-specific bridge
│   │   ├── studio-api.js          # Studio API integration
│   │   ├── co-pilot.js            # Real-time code completion
│   │   ├── editor-catalog.mjs     # Editor capabilities catalog
│   │   ├── redglitch-ai.js        # Main AI integration
│   │   ├── redglitch-ai-assistant.js # Assistant UI logic
│   │   ├── irab-personality.js    # AI personality config
│   │   ├── config.js              # AI configuration
│   │   ├── backend-sync.js        # Backend sync service
│   │   ├── error-watcher.js       # Error monitoring
│   │   ├── shim.js                # Compatibility shim
│   │   ├── namespace-router.js    # Multi-model routing
│   │   ├── cluster-bridge.js      # Cluster communication bridge
│   │   ├── cerebras-adapter.js    # Cerebras hardware adapter
│   │   ├── msn-bridge.js          # MSN bridge
│   │   ├── asset-synth.js         # AI asset synthesis
│   │   ├── avatar/                # AI avatar system
│   │   ├── ui/                    # AI UI components
│   │   ├── sounds/                # AI sound effects
│   │   ├── knowledge/             # AI knowledge base
│   │   ├── final/                 # Build-time AI processing
│   │   ├── holy-kai/              # Experimental AI module
│   │   ├── docs/                  # AI doc corpus & embedding pipeline
│   │   └── *.test.mjs             # Test suite (agent-loop, ai-mode, automation-contract, etc.)
│   │
│   ├── js/                        # Runtime JS modules
│   │   ├── CommandCenter.js       # Central command dispatch
│   │   ├── Dashboard.js           # Project dashboard runtime
│   │   ├── Studio.js              # Studio shell runtime
│   │   ├── Launcher.js            # Project launcher
│   │   ├── SlotManager.js         # Save slot manager
│   │   ├── CampaignSlot.js        # Campaign slot UI
│   │   ├── campaign-performance-tester.js
│   │   ├── runtime-loader.js      # Dynamic engine loader
│   │   ├── smooth-nav.js          # Smooth navigation
│   │   ├── android-adapter.bundle.js  # Bundled Android adapter
│   │   └── platformer_editor/     # Platformer editor runtime
│   │
│   ├── editors/                   # Editor runtimes
│   │   └── algorithm/             # Algorithm/visual script editor
│   │
│   ├── lib/                       # Third-party libraries
│   │   ├── three.min.js           # Three.js bundled
│   │   ├── three/                 # Three.js modules
│   │   ├── cannon-es/             # Physics engine
│   │   ├── monaco/                # Monaco editor + Redglitch type definitions
│   │   ├── transformers/          # HuggingFace Transformers
│   │   ├── vox-loader/            # MagicaVoxel loader
│   │   ├── blockly.min.js         # Blockly visual programming
│   │   ├── gif.js, omggif.js      # GIF encoding/decoding
│   │   └── fontawesome/           # Icon library
│   │
│   ├── dunyalar/                  # Game world data
│   │   ├── level1.json            # Main game level
│   │   └── definitions/           # 34 entity definitions
│   │       ├── enemies.json, goblin.json, ghost.json, skeleton.json,
│   │       │   orc.json, archer.json, soldier.json, slime.json, boss_demon.json
│   │       ├── items.json, skills.json, quests.json
│   │       ├── npcs.json, villagers, merchant
│   │       ├── dialogues.json, locales.json
│   │       ├── chest_gold.json, chest_wood.json, door_locked.json
│   │       ├── spikes_trap.json, lever_switch.json, potted_plant.json
│   │       ├── save_shrine.json, camp_fire.json
│   │       ├── health_font.json, music.json, ui.json
│   │       ├── variables.json, achievements.json, campaign.json
│   │       └── interactive_cutscenes/ (templates + demos)
│   │
│   ├── data/                      # Runtime asset data
│   │   ├── assets.json            # Asset manifest
│   │   ├── block_atlas_default.json
│   │   └── campaigns/test_campaign.json
│   │
│   ├── sprite-art/                # Sprite & tileset assets
│   │   ├── platformer_atlas.json, platformer_spritesheet.png
│   │   ├── player.png, helper.png
│   │   ├── forest_background.jpg, gamebackground.gif
│   │   ├── 2D Pixel Dungeon Asset Pack v2.0/
│   │   ├── Pixel_Mart/
│   │   ├── Knight/
│   │   ├── PixelFantasy_Caves_1.0/
│   │   ├── RF_Catacombs_v1.0/
│   │   ├── Enemy_Animations_Set/
│   │   └── worldpixelart/
│   │
│   ├── studio-dist/               # Built studio UI output
│   ├── css/                       # Stylesheets
│   ├── fonts/                     # Font files
│   ├── icons/                     # Application icons
│   ├── muzikler/                  # Audio/music files
│   ├── projects/                  # User project exports
│   ├── *.html                     # ~40 HTML pages (editors, tools, launcher, etc.)
│   └── *.js                       # Various editor/dashboard JS
│
├── data/                          # Editor data
│   ├── assets.json, sprites.json, input_map.json
│   ├── profiles/                  # User profiles (NAHUY, testuser, etc.)
│   ├── campaigns/                 # Campaign definitions (main + templates)
│   ├── logic/                     # Visual logic graphs
│   │   ├── system_init.json       # Engine init sequence (node graph)
│   │   ├── core_loop.json         # Main game loop (node graph)
│   │   ├── engine_physics.json    # Physics logic
│   │   └── ui_master.json         # UI logic
│   ├── brains/                    # AI brain configurations
│   └── achievements/              # Achievement definitions (many test entries)
│
├── projects/                      # User game projects
│   └── Default Project/           # Default demo project
│       └── data/                  # audio_map, assets, campaigns
│
├── templates/                     # Project starter templates
│   ├── base-rpg/                  # Base RPG template
│   ├── empty/                     # Empty project template
│   ├── iso-starter/               # Isometric starter template
│   └── platformer-starter/        # Platformer starter template
│
├── dunyalar/                      # Source level files
│   ├── iso_world_1.json           # Isometric world
│   ├── fps_demo_level.json        # FPS 3D demo level
│   ├── level4.json                # Another level
│   ├── test_curl.json             # Test data
│   └── definitions/items.json     # Item definitions
│
├── architecture/                  # System architecture specs
│   ├── AI_CLUSTER_PROTOCOL.proto  # gRPC-style protobuf for distributed AI
│   ├── cluster_bridge_source.cpp  # C++ cluster bridge source
│   └── screenshots/
│
├── scripts/                       # Build & utility scripts
│   ├── engine-lockstep.js         # Lockstep engine testing
│   ├── validate-3d-campaign.js    # 3D campaign validation
│   ├── validate-opencode-zen.js   # OpenCode Zen validation
│   ├── voxel-baker.js             # Voxel → GLB baking pipeline
│   └── blender-convert.py         # Blender asset conversion
│
├── ios/                           # iOS native project
│   ├── App/                       # Swift/ObjC app source
│   └── debug.xcconfig
│
├── android/                       # Android native project
│   ├── app/                       # Kotlin/Java app source
│   ├── build.gradle, settings.gradle
│   └── gradle/
│
├── codex-memory/                  # Internal dev documentation
│   ├── DEPENDENCY_AUDIT.md
│   ├── REFACTOR_PLAN.md
│   ├── REPORT_CARD.md
│   └── TOOL_AUDIT.md
│
├── website/                       # Public-facing website
│   ├── index.html, main.js, styles.css
│   └── assets/
│
├── src-android/                   # Android JS adapter source
│   └── adapter.js                 # Android native ↔ JS bridge
│
├── public/ai/docs/                # AI documentation corpus
│   ├── build-corpus.js            # Corpus builder
│   ├── generate-embeddings.js     # Embedding generator
│   └── corpus.json                # Generated corpus
│
├── engine-lockstep-allowlist.txt  # Lockstep allowlist
├── refactor.py                    # Python refactoring script
├── setup.sh                       # Project setup script
├── test.js, test-fog.js           # Test scripts
├── fix.md, placeholder.md         # Notes
├── DEAD_CODE.md                   # Dead code documentation
└── REDGLITCH_ARCH.txt             # Architecture notes
```

---

## Game Engines (5 Types)

### 1. Top-Down RPG Engine (`engines/rpg-topdown/`)
Classic Zelda-like perspective. Tile-based maps, NPCs with dialogue, turn-based or real-time combat, quest progression, weather systems, save/load, visual scripting (node-graph logic), interactive cutscenes, and a full menu system.

### 2. Isometric Pixel Engine (`engines/iso-pixel/`)
Isometric tile rendering with entity management, combat system, particle FX, and GLSL shader support.

### 3. 2D Platformer Engine (`engines/platformer-2d/`)
Side-scroller with physics (gravity, collision, platform detection), parallax scrolling, sprite animation, combat, procedural level generation, and unit tests.

### 4. 3D Engine (`engines/3d/` + `engines/shared/`)
Three.js-based 3D rendering with cannon-es physics, voxel mesh generation, spatial audio, FPS/TPS camera controls, material/shader system, skybox, weather, terrain generation, and a material preview renderer.

### 5. Unified 3D Engine (`engines/unified-3d/`)
Extended 3D engine with mode-based gameplay (FPS, third-person, vehicle), terrain runtime, and a dedicated editor.

All engines share **40 common modules** via `engines/shared/` covering adapters, asset loading, physics, rendering, serialization, and more.

---

## AI System ("IRAB" — Intelligent Redglitch Agent Brain)

A dual-layer AI system running both a Python backend and browser-side JavaScript:

### Python Backend (`backend/`)
- **FastAPI** server managed by Electron's `CortexManager` (heartbeat monitor, crash-loop detection, auto-restart)
- **`brain.py`** — `llama-cpp-python` wrapper loading GGUF models (default config: 128K context, 32 GPU layers, temperature 0.4, 600 max tokens)
- **`rag.py`** — RAG engine with sentence-transformers embeddings
- **`watcher.py`** — File system change detection
- Exposes `/api/ai/chat` (WebSocket), `/api/ai/metrics`, `/api/ai/tools`, `/api/history/*`

### Browser-Side AI (`public/ai/`)
- **Agent Loop** (`agent-loop.mjs`) — Core orchestration with tool-calling, permission gating, and workflow management
- **Tool System** — 20+ editor-safe automation tools routed through `PermissionGate` (open editors, create NPCs/items/quests, generate code, etc.)
- **RAG Engine** — Browser-side retrieval-augmented generation with vector store
- **Inference** — ONNX Runtime Web, HuggingFace Transformers, WebNN/WebGPU acceleration
- **Context Manager** — 128K token sliding window management
- **Model Manager** — Download, cache, and switch between GGUF models
- **Co-pilot** — Real-time code suggestions in Monaco editor
- **Studio Bridge** — Bidirectional communication between AI and studio editors
- **Cluster Protocol** (`AI_CLUSTER_PROTOCOL.proto`) — Protobuf-based distributed inference protocol for multi-node AI clusters

---

## Studio Editor Suite (16 Editors)

| Editor | Entry Point | Purpose |
|--------|-------------|---------|
| Dashboard | `dashboard.html` | Project overview, analytics, quick actions |
| Item Editor | `item_editor.html` | Create and edit game items (weapons, armor, consumables, key items) |
| NPC Editor | `npc_editor.html` | Non-player character configuration (appearance, dialogue, AI, inventory) |
| Enemy Editor | `enemy_editor.html` | Enemy/creature stats, behaviors, loot tables |
| Quest Editor | `quest_editor.html` | Quest chains, objectives, rewards, triggers |
| Dialogue Editor | `dialogue_editor.html` | Branching dialogue trees with conditions and events |
| Script Editor | `script_editor.html` | Monaco-based code editor for custom scripts |
| Pixel Editor | `pixel_editor.html` | Pixel art sprite editor with layers and animation |
| Algorithm Editor | `algorithm_editor.html` | Node-based visual scripting / logic graph editor |
| DAW Editor | `daw_editor.html` | Digital audio workstation for music/sound design |
| FX Editor | `fx_editor.html` | Visual particle effects editor |
| Shader Editor | `shader_lab.html` | GLSL shader lab with live preview |
| Prefab Editor | `prefab_editor.html` | Reusable game object prefab/blueprint designer |
| Asset Manager | `asset_manager.html` | Asset library browser, importer, metadata editor |
| UI Designer | `ui_designer.html` | In-game HUD/menu layout designer |
| Cutscene Editor | `interactive_cutscene_editor.html` | Interactive cutscene sequence designer |

Each editor is a standalone Vite entry point built from React/TypeScript components.

---

## Backend API (Express, 24 Route Modules)

| Route | Module | Function |
|-------|--------|----------|
| `/api/saves` | `saves.js` | Game save/load CRUD |
| `/api/levels` | `levels.js` | 2D level data management |
| `/api/levels3d` | `levels3d.js` | 3D level/scene management |
| `/api/gamedata` | `gamedata.js` | General game data access |
| `/api/projects` | `projects.js` | Project CRUD and configuration |
| `/api/logic` | `logic.js` | Visual logic graph CRUD |
| `/api/abilities` | `abilities.js` | Ability/skill definitions |
| `/api/brains` | `brains.js` | AI brain configurations |
| `/api/audio` | `audio.js` | Audio asset management |
| `/api/slots` | `slots.js` | Save slot management |
| `/api/cutscenes` | `cutscenes.js` | Cutscene template storage |
| `/api/campaigns` | `campaigns.js` | Campaign management |
| `/api/assets` | `assets.js` | 2D asset registry |
| `/api/assets3d` | `assets3d.js` | 3D model/asset registry |
| `/api/system` | `system.js` | System configuration |
| `/api/ide` | `ide.js` | IDE integration endpoints |
| `/api/git` | `git.js` | Git version control operations |
| `/api/build` | `build.js` | Game build/export triggers |
| `/api/shaders` | `shaders.js` | Shader management |
| `/api/test-3d` | `test-3d.js` | 3D engine test suite API |
| `/api/debug-3d` | `debug-3d.js` | 3D debug/diagnostics |
| `/api/ui-config` | `ui-config.js` | UI configuration persistence |
| `/api/opencode-zen` | `opencode-zen.js` | OpenCode Zen compliance |
| `/api/monitor` | `monitor-3d.js` | 3D monitor/telemetry |

---

## Build Pipeline

`build-game.js` handles multi-platform export:

**Target Platforms:**
- **Windows** — NSIS installer via electron-builder
- **macOS** — DMG via electron-builder
- **iOS** — Capacitor + Xcode project
- **Android** — Capacitor + Gradle/APK
- **Web** — Static HTML5 export

**Engine Validation:** Only valid engine types (`rpg-topdown`, `platformer-2d`, `iso-pixel`, `unified-3d`) are accepted.

**Pipeline Stages:**
1. Read project metadata (`redglitch.json`)
2. Validate engine type
3. Voxel bake (`.vox` → `.glb` conversion)
4. Asset bundling
5. Platform-specific export (Android adapter bundling via esbuild for mobile targets)

---

## Game Content / World Data ("dunyalar")

The project includes a complete game world with:

- **34 entity definitions:** enemies (goblin, ghost, skeleton, orc, archer, soldier, slime, boss_demon), NPCs (villagers, merchant), items, skills, quests, dialogues, interactive cutscenes
- **Level files:** isometric world, FPS demo, 2D levels
- **Interactive cutscenes:** Templates (Undertale-style intro) and demos (forest encounter)
- **Localization:** Locale definitions for multi-language support
- **Audio:** Music definitions and audio maps

---

## Editor Data & Logic Graphs

The `data/` directory contains:

- **Visual logic graphs** (`system_init.json`, `core_loop.json`, `engine_physics.json`, `ui_master.json`) — Node-based graphs defining engine initialization sequence, main game loop, physics updates, and UI logic flow
- **Achievements** — 20+ test achievement definitions
- **Profiles** — User profile data
- **Campaign templates** — hub, empty, branching, tutorial templates + main campaign
- **Brains** — AI behavior configurations

---

## Recent Git History (Last 30 Commits)

The most recent commits show active development with substantive work including:
- 3D engine debug API with diagnostics dashboard
- Comprehensive 3D engine test API (52 tests)
- Multiple engine updates and refactors
- AI system improvements and cleanup

---

## Summary

Redglitch Engine v7.0.1 is a **complete, production-grade game development platform** that unifies:

1. **Desktop Studio IDE** — Electron + React + Monaco with 16 specialized editors
2. **5 Game Engine Runtimes** — Top-down RPG, Isometric Pixel, 2D Platformer, 3D, and Unified 3D
3. **Local AI Assistant** — Python/C++ LLM backend + browser-side agent with RAG, tool-calling, and permission-gated automation
4. **Multi-Platform Export** — Windows, macOS, iOS, Android, and Web
5. **Complete Content Pipeline** — From pixel art and voxel modeling to quest design and cutscene scripting
6. **Full Backend** — 24 REST API modules, WebSocket hub, and services for asset management, version control, and build automation
7. **Distributed AI Protocol** — Protobuf-based cluster communication for multi-node inference scaling
