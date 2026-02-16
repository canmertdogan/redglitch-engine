# Launcher OS: Start Menu Implementation Plan

## Objective
Replace the "Start Menu not implemented" alert with a fully functional, cascading Start Menu system.

## 1. Visual Design
*   **Style:** Chunky, beveled pixel-art style (Windows 95/98 vibe).
*   **Palette:** Dark grey (`#2d2d3d`) background with white text and accent-colored hover states.
*   **Position:** Anchored to the bottom-left, popping upwards from the "START" button.

## 2. Menu Structure
The Start Menu will feature the following hierarchy:

*   **[ User Profile ]** (Top Banner: Avatar + Name)
*   **[separator]**
*   **Projects** -> (Submenu: List of recent 5 projects)
*   **Applications** -> (Submenu)
    *   Genesis Wizard
    *   Terminal
    *   Grimoire (Docs)
    *   System Config
*   **Tools** -> (Submenu)
    *   Asset Manager (Mock)
    *   Sprite Editor (Mock)
    *   Audio Studio (Mock)
*   **[separator]**
*   **System** -> (Submenu)
    *   Reboot (Reload page)
    *   Shutdown (Close tab/window)

## 3. Technical Implementation
1.  **DOM Structure:** A `#start-menu` container hidden by default.
2.  **Toggle Logic:** Clicking the Start Button toggles visibility. Clicking *outside* closes it.
3.  **Cascading Logic:** Hovering over an item with a submenu opens that submenu (`#start-menu-projects`, etc.).
4.  **Integration:** Reuse the existing `WindowManager.open()` and `launchProject()` functions.

## 4. Execution Steps
1.  **CSS:** Define `.start-menu`, `.start-item`, `.start-banner`, `.submenu`.
2.  **HTML:** Inject the menu structure into `dashboard.html`.
3.  **JS:** Add event listeners for toggling and submenu handling.
