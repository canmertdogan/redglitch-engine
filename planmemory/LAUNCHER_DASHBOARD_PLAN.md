# Launcher Dashboard Development Plan

## 1. Restructuring
*   **Current Dashboard:** The "Command Center" (Telemetry, Logs, Scratchpad) is perfect for *active development*. It will be moved to `project_dashboard.html`.
*   **New Dashboard:** The file `dashboard.html` will become the **Vortex Launcher**. This is the entry point.

## 2. The "Launcher" Design (New `dashboard.html`)
Inspired by Godot/Unreal/Photoshop start screens, but stylized for Vortex (Pixel Art/Cyberpunk).

### Visual Language
*   **Theme:** Darkest Void (`#050508`) background.
*   **Typography:** Large Pixel Headers, clean sans-serif for lists.
*   **Accents:** Gold (`#f1c40f`) for Primary actions, Grey (`#333`) for structure.

### Layout
*   **Left Sidebar (Navigation):**
    *   "Home" (Recent Projects).
    *   "Templates" (New Project Wizard).
    *   "Community" (Links/News placeholder).
*   **Center Stage (Content):**
    *   **Recent Projects Grid:** Large rectangular cards showing Project Name, Path, and a generated pixel-art icon/thumbnail.
    *   **Search Bar:** Filter projects by name.
*   **Top Right (Actions):**
    *   "New Project" (Primary Button).
    *   "Open from Disk" (Secondary Button).

## 3. Interaction Flow
1.  User opens `tools.html`.
2.  `dashboard.html` (Launcher) opens automatically.
3.  User clicks a project card.
4.  Launcher triggers `parent.switchProject(name)`.
5.  `tools.html` reloads/updates and opens `project_dashboard.html` (Command Center) instead of the Launcher.

## 4. Implementation Steps
1.  **Move:** `dashboard.html` -> `project_dashboard.html`.
2.  **Build:** New `dashboard.html` with the Launcher layout.
3.  **Update:** `tools.html` config to recognize the new tool ID and handle the transition.
