# Platformer Smart World Generator Plan

**Version:** 1.0  
**Date:** February 10, 2026  
**Objective:** Create a procedural generation system capable of designing "quality" platformer levels with distinct gameplay identities, ensuring solvability and flow.

---

## 1. Core Philosophy: Rhythm & Reach

Unlike noise-based terrain generation (which creates random hills), a Platformer Generator must be **Action-Driven**.
*   **Reachability Analysis:** The generator calculates the player's maximum jump height and distance.
*   **Rhythm:** Levels are generated as a sequence of "Beats" (Run -> Jump -> Land -> Fight).
*   **Flow:** The path is guaranteed to be solvable before tiles are placed.

---

## 2. The 5 Gameplay Concepts

We will implement five distinct "Architects" (generation strategies):

### 1. **The Flow (Speed)**
*   **Focus:** Momentum, slopes, loop-de-loops.
*   **Elements:** Long flat sections, 45° slopes, speed boosters, coin trails.
*   **Density:** Low obstacle density, wide gaps.
*   **Vibe:** Sonic-like zones.

### 2. **The Spire (Verticality)**
*   **Focus:** Wall jumps, climbing, falling risks.
*   **Elements:** Vertical shafts, one-way platforms, springs, moving platforms (vertical).
*   **Structure:** Tall, narrow map. "Floor is Lava" logic (rising hazard).

### 3. **The Abyss (Precision)**
*   **Focus:** Tight timing, hazard avoidance.
*   **Elements:** Spikes, small 1-tile platforms, crumbling blocks, precise lasers.
*   **Logic:** Max-distance jumps required. No safety nets.

### 4. **The Gauntlet (Combat)**
*   **Focus:** Arena battles, enemy waves.
*   **Elements:** Wide "Arena" rooms, gated doors (kill all to proceed), health shrines.
*   **Logic:** Room-and-Corridor structure. High enemy density.

### 5. **The Clockwork (Puzzle)**
*   **Focus:** Switches, backtracking, timing.
*   **Elements:** Lock/Key doors, On/Off switch blocks, timed toggle blocks.
*   **Logic:** Non-linear graph. Player must find 'A' to open 'B'.

---

## 3. Technical Architecture

The generator will be modular, located in `public/engines/platformer-2d/generator/`.

### 3.1 `JumpSimulator.js` (The Brain)
A physics-aware module that simulates player jumps to verify valid placements.
*   `calculateJumpArc(vx, vy)`: Returns a set of valid (x,y) points for a jump.
*   `isValid(p1, p2)`: Boolean, checks if p2 is reachable from p1.

### 3.2 `LevelGraph.js` (The Skeleton)
Generates the abstract flow before placing tiles.
*   **Nodes:** "Start", "Challenge", "Reward", "Rest", "Boss", "Exit".
*   **Edges:** Connections between zones.

### 3.3 `TileArchitect.js` (The Builder)
Converts the abstract graph into actual tilemap data.
*   Uses `Auto-Tiling` logic to smooth out terrain.
*   Decorates with props (grass, torches) based on theme.

---

## 4. Development Phases

### Phase 1: The Core Framework
*   [ ] Create `Generator` class structure.
*   [ ] Implement `JumpSimulator` with current player physics constants.
*   [ ] Build a "snake" algorithm that creates a single valid path from Left to Right.

### Phase 2: The 5 Architects
*   [ ] **Flow:** Implement Slope & Momentum bias.
*   [ ] **Spire:** Implement Vertical bias & Wall Jump logic.
*   [ ] **Abyss:** Implement "Gap Maximizer" logic.
*   [ ] **Gauntlet:** Implement "Arena Room" templates.
*   [ ] **Clockwork:** Implement "Backtracking" logic (place Key, then Door).

### Phase 3: Editor Integration
*   [ ] Add "Generator" Tab to the Unified Editor.
*   [ ] UI Controls: "Concept Selector", "Difficulty Slider", "Seed".
*   [ ] Preview Mode: Visualize the "Skeleton" path before baking tiles.

---

## 5. Data Structures

**Theme Configuration Object:**
```javascript
{
    name: "The Abyss",
    gravity: 0.5,
    minGap: 4,
    maxGap: 8,
    hazardDensity: 0.8,
    tileSet: "dungeon",
    music: "creepy_ambience"
}
```

**Generation Request:**
```javascript
{
    width: 200,
    height: 60,
    theme: "abyss",
    difficulty: "hard",
    seed: 12345
}
```

---

## 6. Action Plan

1.  Create `public/engines/platformer-2d/generator/SmartGenerator.js`.
2.  Implement the **"Path-First"** algorithm (Generate a line of reachable points).
3.  Implement the **"Terrain-Fill"** (Fill tiles below the line).
4.  Hook into `platformer_editor.html`.
