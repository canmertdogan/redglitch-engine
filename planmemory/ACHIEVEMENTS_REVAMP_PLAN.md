# Achievements Editor Revamp Plan

**Objective:** Modernize `achievements_editor.html` to match the "Neural Deck" aesthetic (Deep Navy/Gold) and improve usability.

## 1. Design Language
*   **Theme:** Dark Mode (`#050510` bg, `#f1c40f` accent).
*   **Typography:** `VT323` for all text.
*   **Layout:** 3-Column "Master-Detail" view.

## 2. Layout Structure
*   **Sidebar (Left):** "Trophy Case" - A list of all achievements with small icons.
    *   Search/Filter bar at the top.
    *   "Add New" button.
*   **Main Editor (Center):** Form to edit the selected achievement.
    *   **ID/Name:** Basic identity.
    *   **Description:** Flavor text.
    *   **Icon:** Visual picker.
    *   **Condition:** "Trigger" (e.g., `ENEMY_KILL`) + "Target" (e.g., `goblin`) + "Count" (e.g., `10`).
    *   **Reward:** XP or Item drops.
*   **Preview (Right):** A live rendering of the notification pop-up.

## 3. Implementation Steps

### Phase 1: Visual Rewrite
*   **File:** `public/achievements_editor.html`
*   **CSS:** Copy the core styles from `menu_editor.html` (root vars, panel classes, retro-btn).
*   **HTML:** Rebuild the DOM structure to support the 3-column layout.

### Phase 2: Logic Refactor
*   **File:** `public/achievements_editor.js`
*   **Data Handling:** Ensure it loads/saves from `/dunyalar/definitions/achievements.json`.
*   **Icon Picker:** Implement a simple grid of available sprites.

### Phase 3: Integration
*   **EventBus:** Ensure updates broadcast to the running game (if active).

---
**Approval:** Shall we proceed with **Phase 1: Visual Rewrite**?
