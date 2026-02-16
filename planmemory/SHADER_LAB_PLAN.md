# Shader Lab Development Plan

## 1. Overview
The goal is to allow creating GLSL fragment shaders to apply post-processing effects (CRT, Bloom, Distortion) to the entire game screen.

## 2. Architecture
*   **Storage:** Shaders stored as `.frag` text files in `data/shaders/`.
*   **Pipeline:**
    1.  Game renders to `OffscreenCanvas` (2D).
    2.  `PostProcessSystem` (WebGL) uploads this canvas as a texture.
    3.  WebGL renders a full-screen quad using the active `.frag` shader to the main Display Canvas.

## 3. Editor Roadmap (Shader Lab)
**File:** `public/shader_editor.html`, `public/shader_editor.js`

### 3.1 Features
*   [ ] **Project Integration:** Save/Load shaders directly to `data/shaders/`.
*   [ ] **Live Preview:** Apply shader to a sample image (or live game feed if possible).
*   [ ] **Uniforms:** UI to tweak `float` and `vec2` uniforms dynamically.

## 4. Runtime Roadmap
**File:** `public/base_game/postProcess.js` (New)

### 4.1 Implementation
*   [ ] **Hybrid Rendering:**
    *   Move main `ctx` drawing to an offscreen canvas.
    *   Replace visible canvas with a WebGL context.
    *   Every frame: `gl.texImage2D(..., offscreenCanvas)`.
*   [ ] **Shader Loader:** Fetch `.frag` files and compile programs.
*   [ ] **Transition:** Support smooth fading between shaders.

## 5. Execution Steps
1.  **Server:** Add `/api/shaders` endpoints.
2.  **Editor:** Update `saveShader` to use API.
3.  **Runtime:** Create `PostProcessSystem` and hook into `Core.draw`.
