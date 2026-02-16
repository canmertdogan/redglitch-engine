# ONGONLUK ENGINE v7.0 – Architectural Criticism Report

**Date:** February 7, 2026
**Scope:** v7.0 Core, Launcher, Backend, and Tool Suite
**Verdict:** A massive leap in ambition that has created a professional-grade workflow, but the underlying engine technology is struggling to keep up with the complexity of the tools.

---

## 1. Where You Are **Right** (The Wins)

### **1.1. The "Hub" Architecture is the Only Way Forward**
You correctly identified that a single HTML file cannot sustain a serious game engine. Moving to a **Project/Launcher model** (`dashboard.html`, `server.js` managing `activeProject`) is the single best decision you have made. It separates "The Tool" from "The Game," allowing users to have multiple projects with distinct assets without breaking the engine core.

### **1.2. The `EventBus` Integration**
Implementing a WebSocket-based `EventBus` (`public/shared/EventBus.js`) is sophisticated.
*   **Why it works:** Most web-based engines fail because the "Editor" and the "Preview" are disconnected. Your bus allows the Campaign Editor to save a node, and the Dashboard or running Game to react instantly. This is "Hot Reloading" done right.

### **1.3. Visual Scripting (Campaign & Cutscenes)**
The **Campaign Studio** and **Interactive Cutscene Editor** are legitimate "Pro" tools.
*   **The Logic:** Moving game flow out of hardcoded JavaScript and into JSON-based Node Graphs (`campaign.json`) reduces the barrier to entry and prevents spaghetti code.
*   **The UI:** The timeline-based cutscene editor with interpolation and tracks is a UX pattern standard in tools like Adobe Premiere or Unity Timeline. It is intuitive and powerful.

### **1.4. The Aesthetic Polish**
You have nailed the "Hacker/Cyber-deck" aesthetic (VT323 fonts, dark palette, terminal vibes). A tool that looks good encourages developers to spend time in it.

---

## 2. Where You Are **Wrong** (Critical Flaws)

### **2.1. `server.js` is a Ticking Time Bomb**
You are effectively running a monolith. Your `server.js` is over **2,300 lines long**.
*   **The Problem:** It handles HTTP serving, WebSocket broadcasting, file system watching (`chokidar`), API logic, Asset indexing, AND build pipelines.
*   **The Risk:** If the asset scanner crashes on a corrupt PNG, your entire IDE goes down.
*   **The Fix:** You *must* modularize this. Break it into controllers (`controllers/AssetController.js`, `controllers/ProjectController.js`).

### **2.2. The Renderer Implementation (IsoStrategy)**
You are pushing Canvas 2D too far.
*   **The Flaw:** In `IsoStrategy.js`, you are sorting the render queue *every single frame* and issuing thousands of individual `ctx.drawImage` calls.
*   **The Reality:** On a modern 1080p monitor with a decent-sized map (50x50), this will drop below 60fps immediately.
*   **The Fix:** You need **WebGL** or at least **Canvas Layer Caching**. Static terrain should be drawn to an offscreen canvas once and blitted as a single image, rather than redrawing every grass tile every frame.

### **2.3. The "Jack of All Trades" Syndrome**
You are trying to support **RPG Top-Down**, **Iso-Pixel**, and **Platformer-2D** simultaneously.
*   **The Flaw:** These genres require fundamentally different physics and collision logic. Currently, you are trying to share too much logic. A platformer needs high-precision AABB collision (Axis-Aligned Bounding Box), while Isometric needs diamond-grid sorting.
*   **The Result:** You risk having three mediocre engines instead of one great one. The "Campaign Studio" acts as glue, but switching engines mid-game (e.g., entering a minigame) is technically very brittle in a web context without full page reloads.

### **2.4. Dangerous Security Practices**
*   **The Flaw:** Your `server.js` has an endpoint `/api/ide/terminal` that executes raw shell commands sent from the client:
    ```javascript
    exec(command, { cwd: activeProject }, ...)
    ```
*   **The Risk:** While this is a local tool, if you ever allow collaboration or remote access, this is a **Critical Vulnerability**. A malicious script in a downloaded project could wipe the user's hard drive.

---

## 3. Technical Debt & "Hidden" Dangers

1.  **JSON Bloat:** You are saving *everything* (maps, assets, campaigns) as massive formatted JSON files.
    *   *Issue:* As a project grows, `assets.json` or a large map file will become megabytes in size. Parsing this on every load will cause perceptible lag.
2.  **Asset Pipeline Naivety:** You rely on file extensions to guess asset types. You are not processing assets (e.g., creating texture atlases or compressing audio). You are serving raw files. This is fine for prototyping but bad for production.
3.  **Electron Main Process:** The `electron-main.js` is very thin. It mostly just loads the URL. You aren't utilizing Electron's full power (native file dialogs, system menus, deep OS integration) enough. You are basically using it as a specialized Chrome browser.

---

## 4. Immediate Action Plan

If I were leading this team, here is what I would order immediately:

1.  **Refactor `server.js`:** Split it into `routes/` and `services/`. It is unmaintainable in its current state.
2.  **Optimize Iso Renderer:** Implement "Chunk Caching." Render 8x8 chunks of static terrain to offscreen canvases and draw those chunks. Do not draw individual tiles every frame.
3.  **Runtime Validation:** The Campaign Editor is great, but does the *Runtime* actually support all those nodes? You need to write a strict **Runtime Interpreter** that parses `campaign.json` and executes it, proving the editor isn't writing checks the engine can't cash.
4.  **Asset Atlas:** Create a build step that combines individual sprite files into a single Texture Atlas (Sprite Sheet) to reduce HTTP requests and draw calls.

### **Final Grade: B+**
**Ambition:** A+
**Architecture:** A-
**Optimization:** C-
**Code Hygiene:** C

You have built a Ferrari body (the Tools/Hub) but put a lawnmower engine (Canvas 2D unoptimized loops) inside it. It looks beautiful, but it will struggle at high speeds. Focus on the **Runtime Performance** now.
