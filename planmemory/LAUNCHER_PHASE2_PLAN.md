# Launcher Pro: Phase 2 Development Plan

## Objective
Transform the Launcher from a static list into a dynamic "Production Hub" with templates, history tracking, and global settings.

## 1. Feature: Template System
**Goal:** Allow users to bootstrap projects with pre-made assets and logic.
*   **UI:** A new "Templates" view replacing the project list when the sidebar tab is clicked.
*   **Data:** A local JSON definition of templates.
    *   **Empty:** Standard clean slate.
    *   **Platformer Kit:** Includes a player controller, basic physics, and a tilemap.
    *   **RPG Starter:** Includes inventory, dialogue system, and top-down movement.
*   **Logic:** When "Create" is clicked on a template, the backend copies specific asset folders into the new project directory instead of just scaffolding empty folders.

## 2. Feature: History & Sorting
**Goal:** Make finding active projects easier.
*   **Data:** Store a `last_opened` timestamp in `localStorage` (mapped by project name).
*   **UI:**
    *   Add a sort dropdown: "Last Opened", "Name (A-Z)", "Created".
    *   Update the "Last Boot" stat in the inspector to reflect real data.

## 3. Feature: "Learn" Hub
**Goal:** Provide resources inside the launcher.
*   **UI:** A card-grid view for the "Learn" tab.
*   **Content:**
    *   "Getting Started Guide" (Links to internal docs).
    *   "Scripting API Reference".
    *   "Community Asset Pack" (Mock download button).

## 4. Feature: Global Settings
**Goal:** Configure the engine environment.
*   **UI:** A form view for the "Settings" tab.
*   **Options:**
    *   **Theme Accent:** Allow changing the global Gold/Blue accent color.
    *   **Autosave:** Toggle on/off and interval.
    *   **UI Scale:** Adjust for high-DPI screens.
*   **Persistence:** Save to `localStorage`.

## 5. Technical Implementation Steps
1.  **Refactor:** Modularize the `renderProjectList` logic to support switching "Views" (Projects vs Templates vs Settings).
2.  **State:** Add `currentView` state variable.
3.  **Templates:** Create a `templates.json` mock data structure.
4.  **Settings:** Implement `applyTheme()` function to update CSS variables dynamically.
