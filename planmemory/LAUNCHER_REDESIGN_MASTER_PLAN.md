# Vortex Launcher: Professional Redesign Plan
**Aesthetic Goal:** Unified "Hub" experience matching the Vortex IDE (Modern-Dark, Grid-based, Industrial-Retro).

## Phase 1: Visual Foundation (The Studio Aesthetic)
- [ ] **Unified CSS Variable Sync:** Import and use the exact `--bg-root`, `--bg-panel`, and `--accent` (#f1c40f) variables from the IDE.
- [ ] **Background Architecture:** Implement the "Infinite Grid" background with the subtle scanline/CRT overlay used in the Studio.
- [ ] **Panel System:** Replace the current project cards with "Industrial Widgets" (sharp 1px borders, labeled headers, and box-shadow depth).
- [ ] **Typography:** Standardize on `VT323` for headers/stats and `Consolas/Monospace` for data paths and terminal outputs.

## Phase 2: Functional Title Bar & Branding
- [ ] **Native-Feel Titlebar:** A dedicated top-strip with:
    - Left: Pulsing Atom icon and "VORTEX ARCHITECT // LAUNCHER".
    - Center: Draggable region.
    - Right: Minimize/Close buttons and System Clock.
- [ ] **Branding:** Add the "Core Version" and "Build Date" to the top corner, similar to the Splash Screen.

## Phase 3: Project Management (The "Forge")
- [ ] **Enhanced Project Cards:**
    - Show Engine Type icon (Top-Down, ISO, or Platformer).
    - Last Modified timestamp (Server-synced).
    - "Quick Actions" on hover (Open Folder, Delete, Edit Meta).
- [ ] **Creation Wizard v2:**
    - Multi-step process for initializing projects.
    - Engine Selection: Graphical tiles for choosing Top-Down vs ISO.
    - Template Previews: Small description and thumbnail for each template.

## Phase 4: System Integration & Telemetry
- [ ] **Side-Bar Utility:**
    - Recent Projects (pinned).
    - News/Updates feed (simulated or via local markdown).
    - System Health (Real CPU/RAM usage via Electron preload).
- [ ] **News/Grimoire Feed:** A panel dedicated to engine documentation or "Did you know?" tips.

## Phase 5: Transition & Polish
- [ ] **Boot-Sequence Logic:** Ensure the transition from Splash -> Launcher -> Studio is seamless with zero flicker.
- [ ] **Interactive Hover States:** All buttons should have the "Vortex Glow" (yellow border transition and subtle translate effect).
- [ ] **Sound Integration:** Subtle "click/beep" sounds for project selection (optional/toggle).
