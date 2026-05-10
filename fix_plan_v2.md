# Ketebe Engine - Advanced Fix Plan (Phase 2)

This plan addresses deeper architectural issues, security vulnerabilities (Path Traversal, XSS, RCE), and memory management flaws identified during the deep audit.

## Phase 5: Security Hardening (Backend & Python)
**Goal:** Close critical security holes in the backend services.
- [ ] **Python Path Traversal:** Sanitize `session_id` in `backend/main.py` for `save_history` and `load_history`. Prevent directory traversal by ensuring the filename contains no `..` or path separators.
- [ ] **Pickle Security:** Replace `pickle` with `json` or a safer serialization format in `backend/rag.py` for the vector store. Pickle allows Arbitrary Code Execution and is a major security risk.
- [ ] **CORS Lockdown:** Change `allow_origins=["*"]` in `backend/main.py` to a specific list or at least restrict it when not in development mode.

## Phase 6: Frontend Memory & Lifecycle Management
**Goal:** Prevent memory leaks and ensure clean engine transitions.
- [ ] **Engine Cleanup Logic:** Implement a `destroy()` or `cleanup()` method in `IsoGame` (`public/engines/iso-pixel/main.js`) and other core engines.
    - [ ] Remove all `window` and `canvas` event listeners.
    - [ ] Clear all performance monitor intervals.
    - [ ] Properly nullify large objects (maps, entities).
- [ ] **Adapter Integration:** Ensure `IsoPixelAdapter.js` and other adapters call the engine's cleanup method when the level is unloaded or the adapter is destroyed.

## Phase 7: XSS Prevention & DOM Safety
**Goal:** Reduce the attack surface for Cross-Site Scripting.
- [ ] **Audit innerHTML:** Systematically replace `innerHTML` with `textContent` or `innerText` in critical UI components, starting with `public/ai/ui/assistant-panel.js`.
- [ ] **EventBus Sanitization:** Add a sanitization layer to `EventBus.js` to ensure data passed through events is safe before being rendered in the UI.

## Phase 8: Logic Robustness & Fallbacks
**Goal:** Remove hardcoded assumptions and improve error handling.
- [ ] **Dynamic Level Fallbacks:** Replace the hardcoded `dunyalar/level1.json` fetch in `iso-pixel/main.js` with a logic that fetches the first available level from the project's asset registry.
- [ ] **Asset Path Normalization:** Standardize the `assetPath` generation in `server/routes/assets.js` to ensure consistency with the frontend's `AssetManager.js`.

---
*Created by Gemini CLI after deep-dive security and lifecycle analysis.*