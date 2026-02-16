# Solution Plan: ONGONLUK ENGINE Evolution
**Goal:** Transform the current prototype into a commercially viable, "Granny-proof" game creation tool using Web Technologies.

**Philosophy:** Your choice of stack (JavaScript/HTML5) is **not** the problem. Massive hits like *Vampire Survivors* (Phaser/Electron), *CrossCode* (HTML5), and apps like *Discord* and *VS Code* (Electron) prove this stack works. The issue is *architecture*.

This document outlines how to bridge the gap between "Prototype" and "Professional" without abandoning JavaScript.

---

## 1. Solving the Rendering Bottleneck (The Graphics)
**Problem:** `CanvasRenderingContext2D` (`ctx.drawImage`) is CPU-bound and cannot handle thousands of sprites or complex lighting.
**The "Easy" Solution:** **Pixi.js Integration.**

*   **Why:** Pixi.js is a "2D WebGL Renderer". It has an API very similar to what you already use but runs on the GPU. It is essentially a drop-in engine replacement that handles batching automatically.
*   **Implementation:**
    1.  Replace `window.game.ctx` with `window.game.app = new PIXI.Application()`.
    2.  Instead of `ctx.drawImage()`, you create `PIXI.Sprite.from('image_path')`.
    3.  **The "Granny" Benefit:** You can add "Filters" (Glow, Bloom, CRT effect) with one line of code. It looks professional instantly.
    4.  **Performance:** You will go from ~500 sprites at 30fps to ~10,000 sprites at 60fps.

---

## 2. Solving Security & Architecture (The "Editor" vs. "Runtime" Split)
**Problem:** The game currently runs *inside* the server environment, exposing dangerous API endpoints (`exec`).
**The Solution:** Decouple the **Creative Tool** from the **Game Player**.

### A. The Editor (Creative Tool)
*   **Technology:** Electron + Node.js (Current Setup).
*   **Role:** This is where `server.js` lives. It has full file system access to save JSONs, scan folders, and launch tools.
*   **Status:** Keep it powerful. Allow it to write files.

### B. The Runtime (The Game Player)
*   **Technology:** Pure Client-Side JavaScript (Browser Sandbox).
*   **Role:** It treats the game data as **Read-Only**.
*   **Implementation:**
    1.  **Remove `server.js` dependency:** The game client (`main.js`) must typically fetch `data.json` instead of asking an API `/api/files/list`.
    2.  **The "Build" Button:** Create a script that takes all your separate JSONs (enemies, levels, items) and bundles them into a single `game_data.json` file.
    3.  **No `exec`:** The runtime never executes shell commands. If a modder tries to call `server.js` APIs, they don't exist in the runtime build.

---

## 3. Solving Performance & Distribution (The "Build" Pipeline)
**Problem:** Loading thousands of loose images/scripts is slow and makes the game easy to steal/break.
**The Solution:** **Vite / Webpack Bundling.**

*   **How it works:** You don't ask the user to run command lines. Your "Build Game" button in the Editor triggers this process internally:
    1.  **Texture Packing:** Automatically stitch all loose `sprite-art/*.png` files into one large `atlas.png`. (Pixi.js handles this natively). This reduces GPU "draw calls" significantly.
    2.  **Code Minification:** Use a bundler (Vite is recommended for speed) to mash all `js` files into one `bundle.js`. This obfuscates the code (making it harder to read/steal) and makes it load instantly.
    3.  **Electron Builder:** Pack that optimized web folder into a standalone `.exe`.

---

## 4. Solving Physics (The "Ease of Use")
**Problem:** Grid collision is stable but feels "stiff" (no slopes, simple movement).
**The Solution:** **Arcade Physics (AABB) with "Behaviors".**

*   **Don't use complex physics (Box2D)** if you want it to be easy for kids. It's too unpredictable (things rolling away, falling over).
*   **The "Behavior" System:**
    *   Keep your current collision logic but abstract it into "Components".
    *   Instead of coding `if (dist < 50)`, the user (Granny) adds a **"Magnet"** behavior to a coin.
    *   Under the hood, you write the efficient math *once*.
    *   **Spatial Hashing:** Implement a simple "Spatial Hash" or "Quadtree". This splits the world into grid sectors. You only check collisions against objects in the *same* sector. This fixes the lag when you have 100 enemies.

---

## 5. The "Rigby and Zaxon" Experience (UX)
To make it truly accessible to non-coders, you need to hide the JavaScript behind **Visual Abstractions**, but *allow* JS for power users.

1.  **The "Event Sheet" (Construct/GDevelop style):**
    *   Your `logic_editor.html` is the right direction.
    *   Make it sentence-based: *"When [Player] [Collides with] [Enemy] -> [Player] [Flash Red]"*.
    *   This generates the JavaScript code in the background.

2.  **Prefab "Drag & Drop":**
    *   Users shouldn't define `x, y, width, height` in JSON.
    *   They should drag a "Zombie" from the asset bar into the scene.
    *   The Inspector panel shows simple sliders: "Speed", "Health", "Scariness".

---

## 6. Implementation Roadmap

### Phase 1: The Core Rewrite (2 Weeks)
*   [ ] **Switch Rendering:** Port `mapSystem.js` and `fxSystem.js` to use **Pixi.js**. Remove all `ctx` calls.
*   [ ] **Fix Loop:** Switch from `setInterval` or manual loops to `PIXI.Ticker`.

### Phase 2: The Data Pipeline (2 Weeks)
*   [ ] **Asset Manager:** Write a script that scans the project folder and generates a `manifest.json` listing every asset.
*   [ ] **Loader:** Update `main.js` to read this manifest and pre-load everything using Pixi's Loader.

### Phase 3: The Builder (2 Weeks)
*   [ ] **Bundler:** Integate **Vite** into your Electron app.
*   [ ] **Export:** Create a "Publish" button that runs `vite build` and `electron-builder` to spit out an `.exe`.

### Phase 4: The Polish (Ongoing)
*   [ ] **Visual Scripting:** Refine the Block/Event editor to cover 90% of game needs so users rarely need raw JS.

---

**Summary:**
You are building a "Game Engine" (The Editor) and a "Game Framework" (The Runtime). By separating them and swapping the drawing layer for WebGL (Pixi), you keep the ease of JavaScript but gain the performance and security of a professional tool.
