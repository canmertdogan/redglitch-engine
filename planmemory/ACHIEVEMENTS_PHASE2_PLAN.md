# Achievements Editor Phase 2: Optimization & Advanced Features

**Objective:** Refine the UI to be more compact ("Compact Pro" mode) and add deep gameplay integration features.

## 1. UI Condensation (Compact Mode)
*   **Problem:** The current 3-column layout can feel sparse on large screens or cramped on small ones.
*   **Solution:**
    *   **Sidebar:** Reduce width to `250px`. Use denser list items.
    *   **Main Form:** Switch from a vertical stack to a **Grid Layout** (2 columns for inputs).
    *   **Preview:** Move the preview to a **Floating Sticky Header** or integrate it into the list item hover state, freeing up the third column for more advanced logic settings.
    *   **Font Size:** Reduce base font size from `18px` to `16px`.

## 2. New Features Roadmap

### A. Secret Achievements
*   **Feature:** Hidden from the list until unlocked.
*   **UI:** Checkbox `[ ] Is Secret?`.
*   **Logic:** In-game UI shows "???" and "Locked" instead of details.

### B. Achievement Chains (Prerequisites)
*   **Feature:** Unlock Achievement B only after Achievement A is done.
*   **UI:** Dropdown `Prerequisite: [Select Achievement ID]`.
*   **Logic:** `unlock()` checks if `prereq` is in `unlocked` list.

### C. Rewards System
*   **Feature:** Grant items, XP, or stats upon unlock.
*   **UI:**
    *   Type: `[Item / XP / Stat]`
    *   Value: `[Item ID / Amount]`
*   **Logic:** `AchievementSystem` calls `game.inventory.addItem()` or `player.addXP()`.

### D. Progress Tracking (Incremental)
*   **Feature:** "Kill 10 Goblins" (0/10).
*   **UI:** `Max Progress: [10]`.
*   **Logic:** Store `{ id: 'goblin_slayer', current: 5 }` instead of just boolean.

## 3. Implementation Steps

### Phase 2.1: UI Compact Refactor
*   **Target:** `achievements_editor.html`
*   **Action:**
    *   Change `#main-panel` to use `display: grid`.
    *   Merge Preview into the Main Panel header.
    *   Reduce padding/margins.

### Phase 2.2: Advanced Logic Implementation
*   **Target:** `achievements_editor.js` & `ui.json` (schema update).
*   **Action:** Add fields for `secret`, `prereq`, `reward`.

### Phase 2.3: Engine Support
*   **Target:** `achievementSystem.js`.
*   **Action:** Handle `secret` masking and `reward` distribution.

---
**Approval:** Shall we proceed with **Phase 2.1 (UI Compact Refactor)**?
