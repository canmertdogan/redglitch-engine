# VORTEX PIXEL STUDIO - UI OVERHAUL MASTER PLAN

## 1. Executive Summary
**Goal:** Rescue the DAW project by implementing a highly usable, "BandLab-style" workflow wrapped in a distinctive "Algorithm Studio" pixelated design language.
**Core Aesthetic:** 8-bit/16-bit Retro functionality. Chunky borders, high contrast, pixel fonts, "health bar" meters, and tactile-looking pixel controls.
**Core UX:** Accessible, drag-and-drop focused, track-centric workflow similar to modern web DAWs (BandLab, Soundtrap).

## 2. Phase 1: The Pixel Grid (Layout & Shell)
**Objective:** Establish the global design system and main application structure.
*   **Design System:** Define CSS variables for the "Pixel Palette" (limited colors, high contrast).
*   **Typography:** Enforce `VT323` (or similar pixel font) globally.
*   **App Shell:**
    *   **Top Bar:** Chunky transport controls (Play/Record buttons look like gamepad buttons).
    *   **Side Browser:** "Inventory" style asset browser.
    *   **Main Workspace:** The Arrangement grid.
    *   **Bottom Dock:** Collapsible Editor/Mixer panel.

## 3. Phase 2: The Timeline (Arrangement View)
**Objective:** Make the track arrangement area intuitive and visually cohesive.
*   **Track Headers:**
    *   Pixelated instrument icons (e.g., small 16x16 sprites for Synth, Drums, Mic).
    *   "Health Bar" style volume indicators.
    *   Toggle buttons (Mute/Solo) as checkbox-style pixels.
*   **Clips:**
    *   MIDI Clips: Look like "Data Blocks" with visible pixel-note patterns.
    *   Audio Clips: Waveforms rendered as "histograms" or chunky bars.
    *   Drag Handles: Distinct grab zones for resizing/looping.
*   **Grid:** High-visibility beat lines (dotted pixel lines).

## 4. Phase 3: The Editors (Piano Roll & Drum Grid)
**Objective:** Create specialized, fun-to-use editing interfaces.
*   **Piano Roll:**
    *   Keys: Vertical pixel keyboard.
    *   Grid: Dark background, bright note blocks.
    *   Tools: Pencil, Eraser, Select as pixel-art tool icons (like MSPaint).
*   **Drum Sequencer:**
    *   "Pixel Pad" Layout: 4x4 Grid resembling a retro sampler (SP-1200 style).
    *   Step Sequencer: Row of 16 LED-like checkboxes.

## 5. Phase 4: The Mixer & Device Rack
**Objective:** simplify signal flow visualization.
*   **Mixer Console:**
    *   Vertical Faders: Resemble sliders from retro system settings menus.
    *   Meters: Segmented LED bars (Green/Yellow/Red blocks).
*   **Device Chain:**
    *   "Pedalboard" View: Effects appear as stompboxes or rack units with pixel knobs.
    *   Knobs: 2D Sprites with rotation frames or simple radial pixel indicators.

## 6. Phase 5: Interaction & Feedback (The "Juice")
**Objective:** Make the UI feel responsive and tactile.
*   **States:** Clear Pressed/Hover/Active states for all buttons (color shifts, pixel offsets).
*   **Drag & Drop:** "Ghost" blocks when dragging clips or samples.
*   **Tooltips:** Retro "Dialog Box" style popups for explaining controls.
*   **Cursors:** Custom CSS cursors (pixel hand, pixel pointer, pixel I-beam).

## 7. Phase 6: Integration & Optimization
**Objective:** Ensure the new UI drives the existing audio engine smoothly.
*   **Engine Binding:** Re-bind all new UI controls to `AudioEngine` and `Track` classes.
*   **Responsiveness:** Ensure the pixel grid adapts (or scales) for different screen sizes.
*   **Performance:** Optimize CSS rendering and Canvas drawing for the pixel look.

## 8. Immediate Next Steps (Phase 1)
1.  **CSS Reset:** Create `pixel-theme.css`.
2.  **Shell Layout:** Rewrite `daw.html` structure to match the new "BandLab x Pixel" layout.
3.  **Transport Bar:** Implement the pixelated playback controls.
