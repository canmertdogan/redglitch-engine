# Redglitch Game Studio — v0.1.0-experimental-alpha

**Release Date:** July 20, 2026  
**Status:** Experimental Alpha  
**Channel:** Prerelease

---

## What is Redglitch?

Redglitch Game Studio is an all-in-one, multi-engine game development studio with AI copilot, visual scripting, and a built-in sound system. It bundles six game engines (2D top-down RPG, 2.5D isometric, 2D platformer, 3D FPS, 3D platformer, 3D top-down RPG) plus 50+ editors, an audio DAW, and an optional on-device AI copilot — all running locally on your machine.

---

## What's New in This Release

### Cross-Platform Distribution
- **macOS** — DMG installer (Apple Silicon arm64)
- **Windows** — NSIS installer (.exe), supports custom install directory
- **Linux** — AppImage, portable executable

### CI/CD Pipeline
- GitHub Actions workflow for automated builds across all platforms
- Tag-triggered release pipeline (`v*` tags)
- Manual dispatch support for on-demand builds

### Version System
- Moved from `7.0.1-beta.1` to `0.1.0-experimental-alpha`
- Fresh semver starting point for the alpha channel

---

## Download Links

| Platform | File | Size |
|----------|------|------|
| macOS (Apple Silicon) | `Redglitch Game Studio-0.1.0-experimental-alpha-arm64.dmg` | ~393 MB |
| Windows (x64/ARM64) | `Redglitch Game Studio Setup 0.1.0-experimental-alpha.exe` | ~338 MB |
| Linux (AppImage) | `Redglitch Game Studio-0.1.0-experimental-alpha-arm64.AppImage` | ~389 MB |

---

## Installation

### macOS
1. Download the `.dmg` file
2. Double-click to mount
3. Drag "Redglitch Game Studio" to Applications
4. **First launch:** Right-click → Open (bypass Gatekeeper for unsigned builds)

### Windows
1. Download the `.exe` installer
2. Run the installer
3. Choose installation directory (optional)
4. Launch from Start Menu or Desktop shortcut

### Linux
1. Download the `.AppImage` file
2. Make executable: `chmod +x *.AppImage`
3. Run: `./Redglitch*.AppImage`

---

## Quick Start

```bash
# After extracting or installing:
npm start                # Launch Electron desktop app
npm run server           # Web server only (http://localhost:3000)
```

The desktop app opens the project dashboard. Start with the bundled **Default Project** to explore the studio tools.

---

## What's Included

### Six Game Engines
| Engine | Type | Rendering |
|--------|------|-----------|
| RPG Top-Down | 2D tile-based RPG | Canvas 2D |
| Isometric Pixel | 2.5D isometric | WebGL + depth sort |
| Platformer 2D | 2D side-scrolling | Canvas 2D |
| 3D FPS | 3D first-person | Three.js WebGL |
| 3D Platformer | 3D platformer | Three.js WebGL |
| 3D Top-Down | 3D top-down RPG | Three.js WebGL |

### 50+ Editors
- **World Editors:** Isometric Studio, Platformer Studio, 3D Map Editor, Prefab Editor
- **Visual Scripting:** Algorithm Editor (90+ node types), Behavior Editor, Dialogue Editor
- **Content Editors:** Pixel Editor, FX Editor, Shader Lab
- **Data Editors:** NPC, Enemy, Item, Skill, Quest, Character Editors
- **Audio:** Full DAW with synthesizers, drum machine, mixer, effects

### AI Copilot (Optional)
- On-device LLM (Qwen2.5-Coder-3B via Transformers.js)
- RAG pipeline with vector database
- 50+ AI tools for code generation, asset creation, world editing
- Multi-turn autonomous agent

### Visual Scripting
- Node-based algorithm editor with 90+ node types
- Dual runtime: LogicInterpreter (AST) + VisualScriptEngine (graph)
- 50+ API methods covering all game systems

---

## Known Limitations (Experimental Alpha)

- **No code signing** — macOS builds are unsigned; requires right-click → Open
- **No auto-updates** — must manually download new versions
- **Python AI backend** — requires manual setup (`pip install -r requirements.txt`)
- **Mobile export** — Capacitor integration is experimental, not included in this build
- **Default Project** — demo project is a sandbox, not a polished reference
- **Windows/Linux builds** — built on macOS via cross-compilation; native CI builds recommended for production

---

## System Requirements

| | Minimum | Recommended |
|---|---------|-------------|
| **OS** | macOS 12+ / Windows 10+ / Ubuntu 22.04+ | macOS 14+ / Windows 11 |
| **CPU** | Dual-core 2 GHz | Quad-core 3 GHz+ |
| **RAM** | 4 GB (8 GB with AI) | 16 GB |
| **GPU** | WebGL 2.0 | Dedicated GPU |
| **Storage** | 500 MB + 2 GB (AI models) | 10 GB+ (SSD) |

---

## Development

### From Source
```bash
git clone https://github.com/canmertdogan/redglitch-engine.git
cd redglitch-engine
npm install
npm start
```

### Build Commands
```bash
npm run dist              # Build for current platform
npm run dist:mac          # macOS DMG
npm run dist:win          # Windows NSIS installer
npm run dist:linux        # Linux AppImage
npm run beta:check        # Run tests + build studio UI
```

### AI Backend (Optional)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 main.py           # FastAPI on :8000
```

---

## Testing

```bash
npm test                  # Full suite (~450+ tests)
npm run test:ai           # AI subsystem tests
npm run test:server       # Express route/util tests
npm run test:engines      # Engine unit tests + 3D validator
```

---

## License

Dual-licensed under:
- **GNU AGPLv3** — for open-source use with attribution
- **Commercial License** — for proprietary/closed-source distribution

---

## Links

- **Repository:** [github.com/canmertdogan/redglitch-engine](https://github.com/canmertdogan/redglitch-engine)
- **Issues:** [GitHub Issues](https://github.com/canmertdogan/redglitch-engine/issues)
- **Releases:** [GitHub Releases](https://github.com/canmertdogan/redglitch-engine/releases)

---

<div align="center">
  <sub>Built with caffeine, determination, and an unreasonable number of phases.</sub>
</div>
