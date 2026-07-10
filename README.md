# Redglitch Game Studio (prototype-unstable-Alpha)

**An all-in-one, multi-engine game development studio with AI copilot, visual scripting, and a built-in sound system.**

<div align="center">

![Version](https://img.shields.io/badge/version-7.0.1-ff1e27?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-40.x-47848F?style=flat-square&logo=electron)
![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?style=flat-square&logo=node.js)
![Three.js](https://img.shields.io/badge/Three.js-0.183-000000?style=flat-square&logo=three.js)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![License](https://img.shields.io/badge/license-AGPLv3%20%2F%20Commercial-blue?style=flat-square)

**Desktop app · Web server · Mobile export · AI-powered**

</div>

Redglitch Game Studio is a game creation environment that ships as a desktop application (Electron) and runs as a web-based server. It provides a complete visual toolset for building 2D, 2.5D isometric, and 3D games—no traditional coding required, though deep code-level editing (Monaco, visual scripting, shader lab) is always available.

---

## Table of Contents

- [Features](#features)
- [Game Engines](#game-engines)
- [Editors](#editors)
- [AI Copilot](#ai-copilot)
- [Audio Workstation](#audio-workstation)
- [Quick Start](#quick-start)
- [Development](#development)
- [Project Structure](#project-structure)
- [Scripts Reference](#scripts-reference)
- [API Overview](#api-overview)
- [Build & Deploy](#build--deploy)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [System Requirements](#system-requirements)
- [Version History](#version-history)
- [License](#license)

---

## Features

### Core Platform

- **Six game engines** in a single application — 2D top-down RPG, 2.5D isometric, 2D platformer, 3D FPS, 3D platformer, 3D top-down RPG
- **50+ integrated editors** — visual, code, art, audio, data, world, and script editors
- **Cross-engine save/load** with shared serialization format
- **Multi-platform build pipeline** — desktop (Windows/macOS), mobile (Android/iOS), web (itch.io)
- **Hot-reload asset system** with chokidar file watching
- **WebSocket real-time sync** for collaborative workflows

### AI Integration

- **On-device LLM** — Qwen2.5-Coder-3B-Instruct runs entirely in your browser via Web Worker (no cloud dependency)
- **RAG pipeline** — vector database (Orama + IndexedDB) with on-device sentence embeddings
- **50+ AI tools** organized by security level (read-only → destructive)
- **Multi-turn autonomous agent** with tool-calling loop (up to 8 turns)
- **Python backend** — FastAPI + llama-cpp-python for local LLM inference
- **Procedural asset generation** — pixel art from text prompts
- **Co-pilot mode** — inline code suggestions and ghost text

### Audio Production

- **Full digital audio workstation** with multi-track sequencing
- **4 synthesizer engines** — 8-bit chiptune, 32-bit, wavetable, sampler
- **Piano roll editor** with pencil/eraser/select tools, snap-to-grid, clipboard
- **16-pad drum machine** with pattern sequencer and swing
- **Per-channel mixer** with pre/post fader FX inserts and metering
- **5 built-in audio effects** — compressor, 3-band EQ, delay, reverb, distortion

### Visual Scripting

- **Node-based algorithm editor** with 90+ node types (math, logic, flow, entity, player, inventory, flags, quests, camera, audio, dialogue, time, world, FX, custom)
- **Dual runtime architecture** — LogicInterpreter (AST) and VisualScriptEngine (graph)
- **50+ LogicRuntime API methods** covering all game systems
- **Wire-based data flow** with automatic resolution into AST inputs
- **Backward-compatible** — both legacy and modern graph formats supported

---

## Game Engines

| Engine | Type | Rendering | Physics | Status | Components |
|--------|------|-----------|---------|--------|-----------|
| **RPG Top-Down** | 2D tile-based RPG | Canvas 2D | Tile-based AABB | Mature | 26 systems |
| **Isometric Pixel** | 2.5D isometric | WebGL + depth sort | Tile-based | Production | 12 systems |
| **Platformer 2D** | 2D side-scrolling | Canvas 2D | AABB physics | Production | 16 systems |
| **3D – FPS** | 3D first-person | Three.js WebGL | cannon-es | Active | 25+ systems |
| **3D – Platformer** | 3D platformer | Three.js WebGL | cannon-es | Active | 25+ systems |
| **3D – Top-Down** | 3D top-down RPG | Three.js WebGL | cannon-es | Active | 25+ systems |

### Engine Systems

| System | Description |
|--------|-------------|
| **Entity System** | Entity lifecycle management, spatial hashing |
| **Input System** | Keyboard/mouse/gamepad with action mapping |
| **Camera System** | 5 modes: orbit, first-person, third-person, top-down, fixed |
| **Physics** | AABB (2D) or cannon-es (3D) with raycasting |
| **Pathfinding** | A* with funnel smoothing + ORCA avoidance (3D) |
| **Fog of War** | Per-unit vision with 3 visibility states (3D) |
| **Combat System** | Turn-based (iso), real-time (top-down), ability-based (3D) |
| **Save System** | JSON serialization, slot management |
| **Campaign System** | Level flow, checkpoints, progression |
| **Dialogue System** | Branching dialogue trees with conditions |
| **Inventory System** | Items, equipment, crafting |
| **Ability System** | Cooldown-tracked abilities with buff/debuff |
| **Weather System** | Rain, snow, storm, fog, ash, heat with smooth transitions |
| **VFX System** | Particle effects, post-processing, screen shakes |
| **Audio System** | Spatial audio, music, SFX with mixer |
| **AI Behavior** | Behavior trees with condition evaluator |

---

## Editors

### World Editors

| Editor | File | Description |
|--------|------|-------------|
| **Isometric Studio** | `iso_editor.html` | 2.5D isometric pixel world builder |
| **Platformer Studio** | `platformer_editor.html` | 2D side-scrolling level editor |
| **3D Map Editor** | `editor3d.html` | Multi-mode 3D map editor (FPS, top-down, platformer) |
| **Prefab Editor** | `prefab_editor.html` | Reusable object template designer |
| **Background Editor** | `background_editor.html` | Parallax/scrolling background composer |

### Visual Scripting & Logic

| Editor | File | Description |
|--------|------|-------------|
| **Algorithm Editor** | `algorithm_editor.html` | Node-based visual scripting (90+ node types) |
| **Behavior Editor** | `behavior_editor.html` | AI behavior tree designer |
| **Dialogue Editor** | `dialogue_editor.html` | Branching dialogue tree editor |
| **Interactive Cutscene Editor** | `interactive_cutscene_editor.html` | Cinematic sequence designer |
| **Campaign Editor** | `campaign_editor.html` | Campaign flow and level progression |

### Content Editors

| Editor | File | Description |
|--------|------|-------------|
| **Pixel Editor** | `pixel_editor.html` | Sprite and pixel art creation |
| **FX Editor** | `fx_editor.html` | Visual effects editor |
| **Shader Lab** | `shader_lab.html` | GLSL shader authoring with live preview |
| **Material Editor** | (in 3D editor) | PBR material configuration |

### Data Editors

| Editor | File | Description |
|--------|------|-------------|
| **NPC Editor** | `npc_editor.html` | NPC creation and configuration |
| **Enemy Editor** | `enemy_editor.html` | Combatant definition |
| **Item Editor** | `item_editor.html` | Item and equipment definitions |
| **Skill Editor** | `skill_editor.html` | Ability and skill definitions |
| **Quest Editor** | `quest_editor.html` | Quest and journey design |
| **Character Editor** | `character_editor.html` | Player character stats |
| **Achievements Editor** | `achievements_editor.html` | Achievement configuration |
| **Database Editor** | `database_editor.html` | Data table management |

### Development Editors

| Editor | File | Description |
|--------|------|-------------|
| **Script Editor** | `script_editor.html` | Monaco-based code editor |
| **IDE** | `ide.html` | Full code workspace |
| **Console** | `console.html` | Developer console (Grimoire API) |
| **Dashboard** | `dashboard.html` | Central IDE hub |
| **Project Dashboard** | `project_dashboard.html` | Project overview and management |

### Utility Editors

| Editor | File | Description |
|--------|------|-------------|
| **Asset Manager** | `asset_manager.html` | Resource browser and importer |
| **Audio Studio** | `daw.html` | Digital audio workstation |
| **Menu Editor** | `menu_editor.html` | UI menu designer |
| **Input Editor** | `input_editor.html` | Keybinding configuration |
| **Localization Editor** | `localization_editor.html` | Multi-language support |
| **Search Tool** | `search_tool.html` | Project-wide search |

---

## AI Copilot

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    AI Cortex (Electron)                    │
│  Process lifecycle manager, heartbeat monitoring (20s),  │
│  crash-loop protection (max 5 restarts / 60s)            │
└─────────────────────┬────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│               Python AI Backend (FastAPI)                  │
│  ┌────────────┐  ┌──────────┐  ┌─────────────────────┐   │
│  │  IrabBrain  │  │   RAG    │  │  Metrics / Health   │   │
│  │ (llama.cpp) │  │ (embedd) │  │     Endpoints       │   │
│  └────────────┘  └──────────┘  └─────────────────────┘   │
└─────────────────────┬────────────────────────────────────┘
                      │  WebSocket + REST proxy
┌─────────────────────▼────────────────────────────────────┐
│              Browser-Side AI (Transformers.js)             │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────────────┐  │
│  │ Inference │ │Embedding │ │Orama   │ │   Tool        │  │
│  │  Engine   │ │  Worker  │ │Vector  │ │   Registry    │  │
│  │ (Worker)  │ │ (Worker) │ │DB      │ │   (50+)       │  │
│  └──────────┘ └──────────┘ └────────┘ └───────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────────────┐  │
│  │  Agent   │ │ Co-Pilot │ │Studio  │ │  Permission   │  │
│  │  Loop    │ │  Engine  │ │API     │ │    Gate       │  │
│  └──────────┘ └──────────┘ └────────┘ └───────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Capabilities

| Feature | Description |
|---------|-------------|
| **Code Generation** | Generate game logic from natural language prompts |
| **Procedural Art** | Generate pixel art via asset synthesizer |
| **RAG Knowledge** | Search indexed codebase for context-aware responses |
| **Tool Execution** | 50+ tools: file ops, editor navigation, world editing, git, build |
| **Multi-Turn Agent** | Sequential autonomous tasks (up to 8 turns) |
| **Inline Co-Pilot** | Ghost text suggestions while coding |
| **Workflow Automation** | Chained multi-tool workflows |
| **Studio Control** | Open editors, place prefabs, modify entities via natural language |

### Tool Security Levels

| Level | Description | Examples |
|-------|-------------|---------|
| **Safe** | Read-only, no side effects | `fs.read`, `fs.list`, search |
| **Low-Risk** | Creates non-destructive content | `fs.create_file`, asset generation |
| **Medium-Risk** | Modifies existing content | Editor modifications, prefab spawning |
| **High-Risk** | Potentially destructive | Git operations, build commands, exports |

---

## Audio Workstation

### Synthesizers

| Synth | Voices | Waveforms | Features |
|-------|--------|-----------|----------|
| **8-Bit** | 8 | Pulse, triangle, noise | Bit-crushing, chiptune |
| **32-Bit** | 8 | Full quality | Clean polyphonic |
| **Wavetable** | 8 | Custom wavetables | Morphing, dynamic |
| **Sampler** | — | Samples | Multi-sample mapping |

### Effects Chain

| Plugin | Type | Parameters |
|--------|------|------------|
| **KComp** | Compressor | Threshold, ratio, attack, release, knee |
| **KEQ3** | 3-Band EQ | Low/mid/high gain, frequency, Q |
| **KDelay** | Delay | Time, feedback, mix, ping-pong |
| **KVerb** | Reverb | Decay, pre-delay, dampening, mix |
| **KDrive** | Distortion | Drive, tone, mix |

### Signal Flow

```
Synth / Sampler / Drum Machine → Track (gain, pan, FX) → Master Bus (compressor → limiter) → Audio Context
```

---

## Quick Start

```bash
# Prerequisites: Node.js ≥18, npm ≥9

git clone https://github.com/your-org/redglitch-engine.git
cd redglitch-engine
npm install

# Desktop application
npm start

# Standalone web server (open http://localhost:3000)
npm run server
```

### AI Backend Setup (Optional)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt

# The Electron app manages the AI backend automatically.
# For standalone server mode, start manually:
python3 main.py
```

---

## Development

### Setup

```bash
# Automatic setup
./setup.sh

# Manual
npm install
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ..
```

### Running

```bash
npm start                # Desktop app
npm run server           # Web server only
npm run studio:dev       # React studio-ui (Vite on :5173)
npm run ai:validate      # AI system tests
npm run engine:lockstep  # Engine verification
```

---

## Project Structure

```
redglitch-engine/
├── public/                       # Web root
│   ├── editors/                  # Editor implementations
│   │   └── algorithm/            #   Algorithm Studio
│   ├── engines/                  # Game engine runtimes
│   │   ├── rpg-topdown/          #   2D RPG (26 components)
│   │   ├── iso-pixel/            #   2.5D isometric
│   │   ├── platformer-2d/        #   2D platformer
│   │   ├── 3d/                   #   3D engine (27+ systems)
│   │   ├── unified-3d/           #   Multi-mode 3D wrapper
│   │   └── shared/               #   Cross-engine shared systems
│   ├── daw/                      # Digital Audio Workstation
│   ├── ai/                       # Browser-side AI
│   ├── js/                       # Core JS libraries
│   ├── strategies/               # Engine initializers
│   ├── lib/                      # Vendored libraries
│   └── *.html                    # Editor entry points
├── server/                       # Express.js backend
│   ├── routes/                   #   24+ REST API modules
│   ├── services/                 #   Business logic
│   └── utils/                    #   Utilities
├── backend/                      # Python AI backend
│   ├── main.py                   #   FastAPI server (:8000)
│   ├── brain.py                  #   llama.cpp inference
│   └── requirements.txt
├── studio-ui/                    # React 19 + Vite dashboard
├── projects/                     # User game projects
├── templates/                    # Starter project templates
├── dunyalar/                     # World/map data files
├── data/                         # Engine data
├── scripts/                      # Build & utility scripts
├── android/                      # Capacitor Android project
├── ios/                          # Capacitor iOS project
└── builds/                       # Game build output
```

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm start` | Launch Electron desktop app |
| `npm run server` | Start web server (port 3000) |
| `npm run dist` | Build Electron distributable |
| `npm run build:game` | Build game for all platforms |
| `npm run build:game:mac` | Build for macOS |
| `npm run build:game:ios` | Build for iOS |
| `npm run build:game:android` | Build for Android |
| `npm run build:game:win` | Build for Windows |
| `npm run build:corpus` | Build AI RAG corpus |
| `npm run engine:lockstep` | Engine lockstep verification |
| `npm run ai:validate` | AI system validation (9 test suites) |
| `npm run studio:dev` | Vite dev server (React studio-ui) |
| `npm run studio:build` | Build React studio-ui |
| `npm run studio:preview` | Preview production studio-ui build |

---

## API Overview

### REST Routes

| Module | Prefix | Description |
|--------|--------|-------------|
| `projects.js` | `/api/projects` | Project CRUD and switching |
| `assets.js` | `/api/assets` | Asset registry and file management |
| `levels.js` | `/api/levels` | Level data CRUD |
| `logic.js` | `/api/logic` | Logic script CRUD |
| `brains.js` | `/api/brains` | AI behavior tree data |
| `campaigns.js` | `/api/campaigns` | Campaign management |
| `cutscenes.js` | `/api/cutscenes` | Interactive cutscene data |
| `audio.js` | `/api/audio` | Audio file management |
| `build.js` | `/api/build` | Game build trigger |
| `git.js` | `/api/git` | Git integration |
| `ide.js` | `/api/ide` | IDE file operations |
| `shaders.js` | `/api/shaders` | Shader definitions |
| `system.js` | `/api/system` | System metrics |
| `ai.js` | `/api/ai` | AI proxy (→ Python backend) |
| *(10 more)* | *(various)* | |

### WebSocket

- **Path:** `/ws`
- **Format:** JSON messages
- **Purpose:** Real-time state sync, build progress, AI streaming

### Example: Logic Script API

```bash
# List scripts
GET /api/logic

# Get a script
GET /api/logic/:name

# Create/update
POST /api/logic/:name
Content-Type: application/json
{"name":"my_script","type":"rpg-topdown","nodes":[],"wires":[],"vars":[]}

# Delete
DELETE /api/logic/:name
```

---

## Build & Deploy

### Desktop
```bash
npm run dist
# → dist/Redglitch Game Studio-{version}.dmg (macOS)
# → dist/Redglitch Game Studio-{version}.exe (Windows)
```

### Mobile
```bash
npm run build:game:android   # → APK
npm run build:game:ios       # → IPA
```

### Web Export
`itch/index.html` provides a standalone build ready for itch.io publishing.

### Game Build Targets

| Platform | Command | Output |
|----------|---------|--------|
| Web | `npm run build:game` | `builds/web/` |
| macOS | `npm run build:game:mac` | `builds/macos/` |
| Windows | `npm run build:game:win` | `builds/windows/` |
| Android | `npm run build:game:android` | APK via Capacitor |
| iOS | `npm run build:game:ios` | IPA via Capacitor |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `AI_PORT` | `8000` | Python AI backend port |
| `NODE_ENV` | `development` | Environment mode |

### Project Configuration
```json
// redglitch.json
{"name":"My Game","engine":"iso-pixel","version":"1.0.0"}
```

### AI Configuration
```json
// .redglitch/ai_config.json
{"model":"Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf","systemPrompt":"You are RedGlitch AI..."}
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Electron Desktop Shell                        │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   AI Cortex       │  │ Main Window  │  │ AI Backend Process │ │
│  │  (Process Mgmt)   │  │ (Chromium)   │  │ (Python/FastAPI)   │ │
│  │  - Auto-start     │  │  Editors •   │  │ - IrabBrain       │ │
│  │  - Heartbeat (20s)│  │  Engines •   │  │ - RAG            │ │
│  │  - Crash recovery │  │  DAW         │  │ - Metrics        │ │
│  └────────┬─────────┘  └──────┬───────┘  └──────────┬─────────┘ │
└───────────┼───────────────────┼──────────────────────┼───────────┘
            ▼                   ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Express.js Server (:3000)                     │
│  ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌───────────────────┐ │
│  │ REST API │ │ WebSocket  │ │  Asset   │ │   IRAB Proxy      │ │
│  │ 24 mods  │ │  Gateway   │ │  System  │ │   (→ AI backend)  │ │
│  └──────────┘ └────────────┘ └──────────┘ └───────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
            │                   │                      │
            ▼                   ▼                      ▼
┌──────────────┐   ┌────────────────────┐   ┌──────────────────────┐
│   Editors    │   │      Engines       │   │      AI Layer        │
│  (50+ tools) │   │   (6 runtimes)     │   │  (LLM·RAG·Tools)     │
│  Visual,     │   │  2D / 2.5D / 3D   │   │  Inference Engine    │
│  Code, Art,  │   │  Physics, Audio,   │   │  Vector Store        │
│  Audio, Data │   │  VFX, Campaign     │   │  Agent Loop          │
└──────────────┘   └────────────────────┘   └──────────────────────┘
```

### Data Flow

```
User Input → Editor → JSON → Server (REST/WS) → File System
                                │
                     LogicInterpreter / VSE Runtime
                                │
                         Game Engine
                                │
                     Audio · FX · Physics · AI
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop Shell | Electron | 40.x |
| Web Server | Express.js | 4.18.x |
| WebSocket | ws | 8.x |
| UI Framework | Vanilla JS + React | 19.2.x |
| Language | JavaScript + TypeScript | 6.x |
| Bundler | Vite + esbuild | 8.x / 0.27.x |
| 3D Rendering | Three.js | 0.183.x |
| 3D Physics | cannon-es | 0.20.x |
| Browser LLM | Transformers.js | 3.x |
| Vector DB | Orama | 3.x |
| Python Server | FastAPI / llama-cpp-python | — |
| Code Editor | Monaco Editor | 0.55.x |
| Mobile Bridge | Capacitor | 8.x |
| Icons | Lucide React + Font Awesome | 1.16.x |

---

## System Requirements

| | Minimum | Recommended |
|---|---------|-------------|
| **OS** | macOS 12+ / Win 10+ / Ubuntu 22.04+ | macOS 14+ / Win 11 |
| **CPU** | Dual-core 2 GHz | Quad-core 3 GHz+ |
| **RAM** | 4 GB (8 GB w/ AI) | 16 GB |
| **GPU** | WebGL 2.0 | Dedicated GPU |
| **Storage** | 500 MB + 2 GB (AI models) | 10 GB+ (SSD) |
| **Display** | 1280×720 | 1920×1080+ |

---

## Version History

### 7.0.1 (Current)
- Algorithm Studio rewrite with dual runtime (LogicInterpreter + VSE)
- New UI theme unified with v6-premium design system
- 10 new algorithm node types, DELETE route, data wire resolution

### 7.0.0
- Major 3D engine upgrades (Phase 61–66)
- TriMeshRenderer3D, HybridScene3D, LowPolyTerrainGen, TriSculptTools, GLTF import

### 6.x
- Phases 41–60: 3D Platformer engine, cross-engine serialization, build system, 52 tests

### 5.x
- Phases 21–40: Top-down 3D, FPS engine, map editors, Fog of War, Pathfinding

### 4.x
- Phases 1–20: 3D foundation (Three.js, cannon-es, Engine3DBase, Renderer3D)

### 3.x
- Isometric pixel engine, dialogue system, campaign system

### 2.x
- Platformer 2D engine with procedural level generation

### 1.x
- RPG Top-Down engine, initial editor suite

---

## License

Redglitch Engine is dual-licensed under:
- **GNU AGPLv3** (for open-source use with attribution and copyleft requirements).
- **Commercial License** (for proprietary/closed-source distribution or commercial use).

See the [LICENSE](LICENSE) file for the full terms. Copyright © 2024–2026 Redglitch Engine Authors. All rights reserved.

---

<div align="center">
  <sub>Built with caffeine, determination, and an unreasonable number of phases.</sub>
</div>
