# Right Sidebar Redesign Plan: "Dev Ops Console"

## 1. Visual Alignment
*   **Style:** Match the "Retro Workstation" aesthetic of the left sidebar.
*   **Headers:** Use the `.cat-title` style (uppercase, bold, subtle underline) instead of the current heavy block headers.
*   **Buttons:** Replace the generic `.action-btn` and `.dev-btn` with the `.tool-btn-sidebar` style (hover effects, pixel-perfect borders), but adapted for actions (less height, denser packing).

## 2. Structural Changes
The content will be reorganized into logical "Panels" rather than a single scrolling list.

### A. Quick Launch (Top Priority)
*   **Compact Grid:** A 2x2 grid of primary actions (Play, Stop, Console, Reload).
*   **Visuals:** Big icons, minimal text.

### B. Build Matrix (Configuration)
*   **Platform Selector:** A stylized dropdown or toggle strip for [WIN] [ANDROID] [WEB].
*   **Mode:** [DEBUG] / [RELEASE] toggle switch.

### C. Git Control (Version Control)
*   **Status Line:** "Branch: main" (Green/Red indicator).
*   **Action Row:** [PULL] [COMMIT] [PUSH] as a unified button group.

### D. Debug Flags (Toggles)
*   **Style:** Retro checkboxes ( [x] God Mode ) or toggle switches.
*   **Layout:** A compact list.

### E. System Diagnostics (Mini-Monitor)
*   **Graphs:** Small CSS-based bars for CPU/Mem (moved from status bar or duplicated for detail).

## 3. Technical Implementation
1.  **CSS Update:** Add `.dev-ops-grid`, `.dev-ops-panel`, and `.retro-toggle` classes to `tools.html`.
2.  **HTML Restructure:** Rewrite the `#right-sidebar` content to use these new classes.
3.  **JS Logic:** Ensure existing onclick handlers (`playGame`, `setBuildTarget`) still function with the new DOM elements.

## 4. Execution Steps
1.  **CSS Injection:** Add the new styles to `tools.html`.
2.  **HTML Rewrite:** Replace the inner HTML of the right sidebar.
3.  **Verify:** Check that all buttons trigger their respective functions.
