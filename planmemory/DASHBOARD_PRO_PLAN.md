# Dashboard "Command Center" Redesign Plan

## 1. Core Philosophy: "The Cockpit"
The previous design duplicated the sidebar navigation found in the main IDE window (`tools.html`). The new design removes this redundancy to focus purely on **Project Intelligence** and **Quick Actions**.

**Productivity Goals:**
*   **Zero Navigation Clutter:** Remove the sidebar. Use the full canvas.
*   **Information Density:** Show more data at a glance (logs, stats, recent files).
*   **Developer Context:** Keep track of what you were doing (Scratchpad, Todo).

## 2. Visual Style: "High-Fidelity Terminal"
*   **Aesthetic:** Professional Retro. Think *Unix Terminal* meets *Sci-Fi HUD*.
*   **Palette:** Deep blacks, sharp grays, and functional syntax-highlighting colors (Green for success, Red for errors, Blue for info).
*   **Typography:** Strict monospaced fonts (`Consolas` or `VT323` for headers) for maximum readability.

## 3. Layout: The Bionic Grid
The dashboard will be a 3-column, 2-row grid.

### Top Row (Status & Health)
*   **Module A: Telemetry Strip (Full Width)**
    *   Sparkline graphs for "Memory Usage" (Mocked).
    *   Project "Pulse" (Last saved time, File count).
    *   Active Build Target indicator.

### Middle Row (The Workspace)
*   **Module B: Recent Activity (Left)**
    *   List of the last 5-10 opened/edited files (Simulated or LocalStorage based).
    *   One-click to reopen them.
*   **Module C: Developer Scratchpad (Center)**
    *   A persistent `<textarea>` or list for "To-Do" items.
    *   Saves to `localStorage` so notes persist between sessions.
*   **Module D: Asset Watcher (Right)**
    *   Real-time count of Sprites, Scripts, and Audio.
    *   "Quick Scan" button embedded here.

### Bottom Row (The Console)
*   **Module E: Enhanced System Log (Full Width / Expandable)**
    *   The feature you loved, but upgraded.
    *   **Filters:** Toggle buttons for [INFO], [WARN], [ERROR].
    *   **Actions:** "Clear", "Export Log", "Auto-scroll".
    *   **Input Line:** A fake command prompt at the bottom where you can type "help", "scan", "run".

## 4. Implementation Steps
1.  **Clean Slate:** Remove the sidebar grid from `dashboard.html`.
2.  **Grid System:** Implement a CSS Grid layout (`grid-template-areas`).
3.  **Widget Development:**
    *   Create the `LogTerminal` class for the advanced console.
    *   Implement `Scratchpad` using `localStorage`.
    *   Implement `RecentFiles` tracker (hooking into parent window if possible).
4.  **Styling:** Apply the "Pro-Pixel" border styles (1px sharp borders, semi-transparent backgrounds).

## 5. Technical Stack
*   **HTML5/CSS3:** Grid, Flexbox.
*   **JS:** Direct DOM manipulation for speed.
*   **Integration:** Hooks to `window.parent.tools` for navigation from Recent Files.
