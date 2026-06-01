# Dashboard Redesign Plan: "Retro Workstation"

## Objective
Replace the current simple dashboard with a high-fidelity, pixel-art styled "Game Developer Workstation" interface. This will improve usability by categorizing the growing number of tools and enhance the immersion of the redglitch ENGINE.

## 1. Visual Style & Aesthetic
*   **Theme:** 90s Cyberpunk / Retro Console Dev Kit.
*   **Font:** Continue using `VT323` but with larger headers and tighter spacing for data.
*   **Color Palette:**
    *   **Background:** Deep Void (`#05050a`) with a subtle grid pattern.
    *   **UI Panels:** Dark Grey (`#111`) with high-contrast borders.
    *   **Accents:** Neon Gold (`#f1c40f`) for primary actions, Cyan (`#40e0d0`) for data, Magenta (`#e056fd`) for alerts.
*   **Effects:**
    *   **CRT Overlay:** A pointer-events-none layer adding scanlines and subtle screen curvature vignette.
    *   **Pixel Buttons:** CSS `box-shadow` techniques to create "chunky" clickable buttons without needing image assets.

## 2. Layout Structure
The interface will be divided into three main zones:

### A. The Sidebar (Toolbox)
Vertical navigation on the left, categorizing the many editors:
*   **World:** Level Editor, Backgrounds.
*   **Entities:** Prefab, NPC, Enemy, Items.
*   **Logic:** Scripts, Nodes, Brains, Quests, Dialogue.
*   **Assets:** Audio, Pixel Art, FX.
*   **System:** UI, Menu, Localization.

### B. The Main Deck (Overview)
Center stage area containing:
*   **Header:** "Welcome, Architect" message with animated typing effect.
*   **Stats Grid:** Big pixel-font numbers for Levels, Assets, Scripts, etc.
*   **Quick Actions:** Large, prominent buttons for "Run Game", "Scan Assets", and "New Level".
*   **Terminal:** A fake terminal window showing the "Activity Feed" (logs).

### C. The Cartridge Slot (Project Management)
Right-side panel dedicated to project handling:
*   **Project List:** Displayed as "Cartridges" or "Disks".
*   **Save/Load:** Prominent floppy-disk style buttons.
*   **System Status:** Memory usage / CPU load (mocked or real if available).

## 3. Technical Implementation
*   **Single File:** Keep it contained in `dashboard.html` (with embedded CSS/JS) for ease of maintenance, or separate if it grows too large.
*   **CSS Variables:** Extensive use of variables for theming.
*   **Box Model:** Use `border-image` or nested box-shadows for true pixel-art borders.
*   **JS Logic:** Refactor the existing logic to support the new categorized view and ensure all 15+ tools are correctly linked.

## 4. Execution Steps
1.  **Skeleton:** Create the new HTML grid layout.
2.  **Styling:** Implement the `pixel-box` and `pixel-btn` CSS classes.
3.  **Migration:** Move all existing tool links into the new categories.
4.  **Polish:** Add the CRT overlay and typing animations.
5.  **Integration:** Ensure `window.parent` calls (for opening tabs) work correctly.
