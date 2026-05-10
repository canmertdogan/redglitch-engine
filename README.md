# Ketebe Engine (v7)

![Ketebe Engine Banner](public/logo.png) <!-- Placeholder for a banner if it exists -->

Ketebe Engine is a comprehensive, multi-paradigm game development ecosystem designed for building high-quality 2D and 2.5D games. It provides a full suite of integrated tools, from visual level designers to a Monaco-powered code editor, all unified by a browser-native AI assistant.

## 🚀 Key Features

### 🎮 Multi-Engine Architecture
Ketebe supports three distinct engine paradigms, each optimized for specific genres:
- **IsoPixel (2.5D)**: Advanced isometric engine featuring dynamic lighting, a full day/night cycle, particle systems (IsoFX), and depth-sorted rendering.
- **RPG Top-Down**: Systems-heavy engine with built-in support for branching dialogues, quest management, inventory systems, and dynamic logic scripting.
- **Platformer 2D**: Precision-focused engine with custom AABB physics and smooth camera systems.

### 🧠 Ketebe AI (Kai)
A state-of-the-art, browser-native AI assistant built directly into the IDE:
- **Local Inference**: Runs entirely in your browser using WebGPU/WASM (Transformers.js), ensuring privacy and offline capability.
- **RAG (Retrieval-Augmented Generation)**: Intelligent context awareness using a vector store (Orama) to answer questions based on the engine's documentation and codebase.
- **Agentic Capabilities**: Can perform tasks within the project, such as creating files, modifying code, and assisting with debugging.
- **Meet Kai**: A fantastic nerd but cool as fuck girl serving as your intelligent coding companion.

### 🛠️ Integrated Development Environment (IDE)
A complete suite of tools to streamline your workflow:
- **Dashboard**: The central hub for project management, activity tracking, and quick tool access.
- **Code Forge**: A professional-grade script editor powered by Monaco, featuring syntax highlighting and AI integration.
- **IsoPixel Studio**: A visual level designer for isometric worlds with real-time preview and NPC placement.
- **Specialized Editors**: Dedicated tools for Achievements, Algorithms, Asset Management, Dialogues, NPCs, Quests, and more.

### 🔌 Hybrid & Scalable
- **Node.js Backend**: Provides robust file system access and project management.
- **Web-First Frontend**: The entire IDE and Game Runtime run as an SPA, deployable to Web, Electron (Desktop), or Capacitor (Mobile).
- **Project Overlay System**: Keeps engine core code and project assets separate, allowing for easy engine updates without breaking your game.
- **Real-time Sync**: WebSocket-based EventBus for instantaneous updates between editors and the running game.

## 📂 Project Structure

```text
├── architecture/      # Detailed system documentation and protocols
├── backend/           # Python-based AI and RAG services
├── data/              # Core engine data, shaders, and assets
├── dunyalar/          # World and level definitions
├── engines/           # Source code for the three engine cores
├── projects/          # User-created game projects
├── public/            # The "Immutable Core" - IDE tools and shared libraries
├── planmemory/        # Development plans, changelogs, and architecture notes
├── server/            # Node.js server implementation
└── server.js          # Main entry point for the development server
```

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [Python 3.8+](https://www.python.org/) (for AI/RAG features)

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Engine
You can run Ketebe Engine in two ways:

#### 1. Development Server (Web Mode)
Starts the Node.js server to serve the IDE and project files.
```bash
npm run server
```
Then, open your browser and navigate to `http://localhost:3000`.

#### 2. Desktop Application (Electron)
Launches the engine as a standalone desktop application.
```bash
npm start
```

### AI System Preparation
If you are setting up the AI features for the first time, you may need to build the RAG corpus and AI workers:
```bash
npm run build:corpus   # Generates the documentation corpus for RAG
npm run build:ai-worker # Builds the browser-native AI worker scripts
```
*Note: Python 3.8+ is also used for advanced backend AI services in `backend/`.*

## 📱 Mobile Development
Ketebe Engine is ready for mobile deployment via [Capacitor](https://capacitorjs.com/):
- **Android**: Located in `/android/`
- **iOS**: Located in `/ios/`

Use the following commands to sync and open mobile projects:
```bash
npx cap sync
npx cap open android
npx cap open ios
```

## 📜 Documentation
For more detailed information on specific subsystems, check the `architecture/` and `planmemory/` directories:
- `ENGINE_ARCHITECTURE.md`: Deep dive into rendering loops and engine internals.
- `AI_SYSTEM.md`: Details on the Ketebe AI and RAG implementation.
- `OVERVIEW.md`: High-level system architecture and data flow.

## 🤝 Contributing
Contributions are welcome! Please refer to the `CODE_REVIEW.md` and existing documentation for coding standards and architectural patterns.

---

*Built with ❤️ by the Ketebe Team.*
