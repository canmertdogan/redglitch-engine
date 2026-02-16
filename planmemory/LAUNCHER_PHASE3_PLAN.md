# Launcher Pro: Phase 3 Development Plan ("The Ecosystem")

## Objective
Transform the Launcher into a complete "Developer Ecosystem" by adding workflow organization tools (Pins/Tags), an asset library interface, and gamified progression.

## 1. Feature: Project Power-Ups
**Goal:** Better organization for heavy users with many projects.
*   **Pinning:** Add a "Star/Pin" icon to project rows. Pinned projects always appear at the top of the list.
*   **Tagging System:** In the Inspector, allow adding tags (e.g., "Prototype", "Jam", "Release") to a project.
*   **Smart Filter:** Filter the project list by specific tags.

## 2. Feature: Asset Library
**Goal:** Centralized place to manage shared resources (mocked).
*   **UI:** New Sidebar Tab: "Library".
*   **Views:**
    *   **"My Assets":** Local shared folders (Sprites, Scripts).
    *   **"Plugins":** Installed engine extensions.
    *   **"Store":** A visually rich grid of "featured assets" (simulating an online marketplace).

## 3. Feature: Developer Profile (Gamification)
**Goal:** Add personality and fun to the startup experience.
*   **UI:** User card at the bottom of the sidebar.
*   **Mechanics:**
    *   **XP System:** Gain XP for opening projects, creating new ones, or "spending time" in the engine.
    *   **Ranks:** "Novice", "Scripter", "Architect", "Engine Master".
    *   **Badges:** Unlockable icons for milestones (e.g., "Created 5 Projects").

## 4. Feature: Enhanced Inspector Actions
**Goal:** More utility in the project details panel.
*   **"Backup"**: A button to simulate zipping/backing up the project folder.
*   **"Open Shell"**: Open a simulated terminal window for the project path.
*   **"Notes"**: A per-project mini scratchpad in the inspector.

## 5. Technical Implementation
1.  **Data Structure:** Extend the `localStorage` schema to store `project_meta` (tags, pinned status, notes) and `user_profile` (xp, level).
2.  **View Logic:** Add the new "Library" view handling.
3.  **UI Updates:**
    *   Add Star icons to project rows.
    *   Add Tag input field to Inspector.
    *   Add Profile widget to Sidebar.
4.  **Sorting Logic:** Update `sortProjects()` to prioritize Pinned items first.
