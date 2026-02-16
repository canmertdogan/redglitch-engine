# Launcher Redesign: "The Pixel Workstation OS"

## 1. Core Philosophy
The previous designs were too "web-app". This redesign aims to treat the Launcher as a **self-contained Pixel Operating System**. It protects the retro aesthetic by mimicking the UI patterns of 90s workstations (Amiga/Windows 95) but with a dark, cyberpunk polish.

## 2. Visual Identity (Pixel Perfect)
*   **Font:** Strict usage of `VT323` for everything. Large headers, crisp UI text.
*   **Style:** "Chunky UI".
    *   **Borders:** 2px solid borders with distinct highlight/shadow colors (Beveled look).
    *   **Buttons:** Physical "press" animations (translating down 2px).
    *   **Icons:** Pixel art icons for folders, files, and tools.
*   **Background:** An animated "Starfield" or "Grid" canvas to make the desktop feel alive.

## 3. The Desktop Environment
The `dashboard.html` will function as a desktop surface.

### A. The Desktop
*   **Icons:** Draggable desktop shortcuts:
    *   `[Floppy Disk]` **Projects** (File Manager)
    *   `[Magic Wand]` **Genesis Wizard** (New Project)
    *   `[Book]` **Grimoire** (Docs)
    *   `[Gear]` **System** (Settings)
*   **Widgets:**
    *   **Time/Date:** Big pixel clock.
    *   **MOTD:** "Message of the Day" / News ticker.

### B. The Window Manager
Content opens in **floating, draggable windows** constrained to the dashboard area.
*   **Title Bar:** [ Icon ] [ Title ] [ X ]
*   **Behavior:** Clicking a window brings it to the front. Multiple tools can be open at once.

## 4. Key "Apps" (Features)

### App 1: Project Explorer (File Manager)
*   **View:** A grid of folders representing projects.
*   **Details:** Selecting a folder shows a "Preview Pane" with stats (Last Played, Engine Ver).
*   **Action:** Double-click to Launch.

### App 2: Genesis Wizard (The Project Creator)
A dedicated multi-step installation wizard window.
1.  **Identity:** Project Name & Author.
2.  **Core:** Select Template (Visual cards: Platformer, RPG, Empty).
3.  **Modules:** Checkboxes for "Include Physics", "Include Lighting", "Sample Assets".
4.  **Initialize:** A progress bar animation ("Copying assets...", "Compiling...", "Done") before auto-launching.

### App 3: System Config
*   Change "Wallpaper" color/pattern.
*   Toggle UI sounds (clicks/beeps).

## 5. Technical Implementation
1.  **HTML Structure:** A container `#desktop`, a `#taskbar`, and a template for `.window` elements.
2.  **Window Management JS:** A simple class `WindowManager` to handle:
    *   `openWindow(id, title, content)`
    *   `closeWindow(id)`
    *   `focusWindow(id)` (Z-index management)
    *   Dragging logic.
3.  **Persistence:** Use `localStorage` to remember window positions and open apps (optional but cool).

## 6. Execution Plan
1.  **Assets:** Create CSS-based pixel icons or use FontAwesome with pixel styling.
2.  **OS Layout:** Build the Desktop and Taskbar.
3.  **Window System:** Implement the dragging and focus logic.
4.  **Wizard Logic:** Build the multi-step form logic.
5.  **Integration:** Hook up the "Launch" button to the parent `tools.html` loader.
