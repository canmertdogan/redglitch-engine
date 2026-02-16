# Platformer Engine Master Improvement & Revamp Plan

**Version:** 1.4  
**Date:** February 10, 2026  
**Status:** In Progress  

---

## 1. Executive Summary

The Platformer Engine is undergoing a major overhaul. Core ECS architecture is in place, Editor is unified, Physics v2 (Slopes/One-Ways) is deployed, and Renderer now supports Chunk Caching.

---

## 2. Phase 1: Core Physics & Entity Overhaul (The "Jump-Core" Update)

**Goal:** Establish a solid, bug-free physics foundation.

### 2.1 Physics Engine Upgrade (`engines/platformer-2d/PhysicsSystem.js`)
*   **Status:** 🟡 **In Progress**
*   **Progress:**
    *   ✅ Created `PhysicsSystem.js` replacing legacy `physics.js`.
    *   ✅ Implemented **Slope Logic** (Types 9 & 10).
    *   ✅ Implemented **One-Way Platforms** (Type 4).
*   **Next Steps:**
    *   [ ] **Complete One-Way:** Implement Types 5, 6, 7.
    *   [ ] **Moving Platforms:** Add "carrier" logic.

### 2.2 Entity System Refactor
*   **Status:** ✅ **DONE**
*   **Actions Taken:**
    *   Created `public/engines/platformer-2d/entities/` directory.
    *   Implemented `Entity` base class and `Player` subclass.
    *   Integrated into `main.js`.

---

## 3. Phase 2: Toolchain Unification (The "Studio" Update)

**Goal:** Eliminate legacy code and provide a single, powerful editor.

### 3.1 Editor Consolidation
*   **Status:** ✅ **DONE**
*   **Actions Taken:**
    *   Merged `History` (Undo/Redo), `Collision Types`, `Prefabs`.
    *   Added **Slope Tools** to Editor UI.
    *   Implemented **Collapsible Sidebars**.
    *   Archived legacy `_full` files.

---

## 4. Phase 3: Visuals & Performance (The "Pixel-Perfect" Update)

**Goal:** Make it look good and run fast.

### 4.1 Rendering Optimization (`engines/platformer-2d/renderer.js`)
*   **Status:** ✅ **DONE**
*   **Actions Taken:**
    *   Implemented **Chunk Caching** (16x16 chunks).
    *   Added `invalidateCache` logic.
    *   Optimized `drawLayer` to iterate chunks.

### 4.2 Animation System
*   **Status:** 🟡 **In Progress**
*   **Actions Taken:**
    *   Added `Animator` state to `Entity.js`.
    *   Implemented state switching in `Player.js`.
    *   Added `drawSprite` stub in `renderer.js`.
*   **Next Steps:**
    *   [ ] **Spritesheet Support:** Implement full frame slicing in `drawSprite`.
    *   [ ] **Assets:** Define `player.json` animation data.
