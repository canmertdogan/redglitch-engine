# Launcher Pro: "RedGlitch Studio Startup Hub"

## 1. Visual Identity
*   **Design Language:** "Industrial Pixel". Heavy-set panels, recessed buttons, and sharp, high-contrast text.
*   **Color Palette:**
    *   **Base:** `#0a0a0f` (Deep Obsidian).
    *   **Panels:** `#14141f` (Steel Blue-Grey).
    *   **Accent:** `#f1c40f` (Goldenrod) for Primary Actions.
    *   **Selection:** `#3498db` (Cyber Blue) for the active item highlight.
*   **Fonts:** `VT323` for headers, `Consolas` for file paths and technical data.

## 2. Interface Layout (3-Column Architecture)

### A. Navigation Sidebar (Left - 200px)
Vertical tabs with icons:
*   **[Projects]**: View and manage recent workspaces.
*   **[Templates]**: Start with pre-configured project types (Platformer, RPG, Sandbox).
*   **[Learn]**: Links to documentation and tutorials (built-in docs viewer).
*   **[Settings]**: Global editor preferences.

### B. Project Repository (Center - Flexible)
A professional list view of all detected projects:
*   **Header:** Search bar and Sort options (Last Opened, Name, Size).
*   **List Items:** Each row shows the Project Name, a mini-icon, and the absolute file path.
*   **State:** Hovering highlights the row; Clicking selects it for the Inspector.

### C. Project Inspector (Right - 320px)
This panel provides a "Deep Dive" into the selected project before you even open it.
*   **Visualizer:** A procedurally generated "Cartridge Art" or a pixelated preview image.
*   **Metadata:**
    *   **Last Edited:** Date/Time.
    *   **Engine Version:** Compatibility check.
    *   **Disk Usage:** MB/GB.
*   **Primary Actions:**
    *   **[ OPEN PROJECT ]**: (Big Gold Button) Launches the Command Center.
    *   **[ EXPLORE ]**: Opens the folder in Windows Explorer.
    *   **[ CLONE/DUPLICATE ]**: Make a copy.
    *   **[ WIPE ]**: (Danger Button) Delete project.

## 3. Advanced Features
*   **Project Ghosting:** If a project path is no longer found on disk, show it as "Offline/Missing" with a "Re-link" option.
*   **Template Engine:** Selecting "Templates" shows a grid of starter kits with descriptions.
*   **Transition:** A smooth "System Boot" fade-in when switching from the Launcher to the Command Center.

## 4. Technical Roadmap
1.  **Grid Setup:** Use CSS `grid-template-columns: 200px 1fr 320px`.
2.  **API Integration:** Fetch project list from `/api/projects`.
3.  **State Management:** Track the `selectedProject` in local JS to update the Inspector panel in real-time.
4.  **Polish:** Add "pixel-perfect" borders and the CRT scanline overlay.
