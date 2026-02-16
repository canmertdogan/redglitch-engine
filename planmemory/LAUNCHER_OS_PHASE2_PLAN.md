# Launcher OS: Phase 2 Development Plan ("System Upgrade")

## Objective
Deepen the illusion of a functional Operating System by implementing missing core applications, adding system-wide utilities (Context Menus, Notifications), and enhancing customization.

## 1. New Applications (The Missing Modules)

### App: Terminal (`cmd.exe`)
**Goal:** The ultimate power-user tool.
*   **Visuals:** Black background, green text, blinking cursor.
*   **Commands:**
    *   `help`: List commands.
    *   `list`: Show projects textually.
    *   `sys`: Show memory/CPU stats.
    *   `color <hex>`: Change terminal text color.
    *   `boot <project_name>`: Launch a project via text.

### App: System Config (`sys.cfg`)
**Goal:** Allow users to personalize their workstation.
*   **Wallpaper Engine:** Switch between "Starfield" (Current), "Matrix Rain", "Grid", or "Solid Color".
*   **Theme:** Adjust the Global Accent Color (Gold, Neon Blue, Crimson).
*   **Audio:** Toggle UI Sounds (Clicks, Beeps).

### App: Grimoire (`docs.lib`)
**Goal:** In-launcher documentation viewer.
*   **Layout:** Two-pane layout (Tree on left, Content on right).
*   **Content:** "Getting Started", "Keyboard Shortcuts", "API Reference" (Mocked or pulled from `docs.html`).

## 2. UX Enhancements

### Context Menus (Right-Click)
**Goal:** Standard desktop functionality.
*   **Desktop:** "Refresh", "New Project", "Properties".
*   **Project Icons:** "Open", "Delete", "Rename", "Show in Explorer".
*   **Taskbar:** "Close All", "Minimize All".

### Notification System ("Toasts")
**Goal:** Non-intrusive system feedback.
*   **Design:** Small pixelated popups in the top-right corner.
*   **Triggers:** "Project Created", "Settings Saved", "System Error".

### Boot Sequence
**Goal:** Immersion on first load.
*   **Visuals:** Bios POST screen -> Loading Bar -> Desktop Fade In.
*   **Logic:** Only runs once per session (check `sessionStorage`).

## 3. Technical Implementation

1.  **Refactor WindowManager:** Add `bringToFront` logic (currently implemented but needs verifying) and improved dragging constraints (snap to grid?).
2.  **Context Menu Manager:** Create a global singleton to handle right-click events and rendering menus at coordinates.
3.  **State Persistence:** Save `wallpaper_mode` and `theme_color` to `localStorage`.

## 4. Execution Steps
1.  **Boot:** Implement the BIOS sequence.
2.  **Sys Config:** Build the Settings App and hook up wallpaper switching.
3.  **Terminal:** Build the CLI parser.
4.  **Polish:** Add Context Menus.
