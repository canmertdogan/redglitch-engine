# Campaign Studio - Phase 4 Development Plan

## Objective
To bridge the gap between the Editor and the Game Runtime, enforce data integrity, and refine the user experience with professional-grade navigation and visuals.

## Feature Set

### 1. Runtime Logic Execution (Engine Update)
**Goal:** Ensure all node types created in the editor actually work in the game.
-   **Task:** Update `CampaignSystem.js` (Game Runtime).
-   **Implementation:**
    -   **Random Node:** Logic to pick a path based on chance (e.g., 50/50 or custom %).
    -   **Wait Node:** Logic to pause the campaign execution flow for `X` seconds before continuing.
    -   **Group/Comment:** Ensure these are ignored by the runtime (already implicitly handled, but verify).

### 2. Interactive Minimap
**Goal:** Allow users to navigate the workspace by interacting with the minimap.
-   **Task:** Update `CampaignEditor.js`.
-   **Behavior:**
    -   **Click to Pan:** Clicking anywhere on the minimap instantly centers the main view on that location.
    -   **Drag Viewport:** Dragging the highlighted rectangle on the minimap pans the view smoothly.

### 3. Global Variable Manager
**Goal:** Prevent typos ("Magic Strings") in flag names.
-   **Task:** Update `CampaignEditor.js` & `campaign_editor.html`.
-   **Implementation:**
    -   **Manager UI:** A modal/panel to Create/Edit/Delete global flags (e.g., `has_met_king`, `is_rich`).
    -   **Inspector Integration:** Change "Flag Name" inputs from text boxes to **Dropdowns** populated by this manager.
    -   **Validation:** Warn if a node uses a variable not defined in the manager.

### 4. Bezier Connections (Visual Polish)
**Goal:** Make the graph look like professional node-based tools (Unreal Blueprints, Blender).
-   **Task:** Update `renderWires` in `CampaignEditor.js`.
-   **Implementation:**
    -   Replace generic SVG paths with cubic bezier curves.
    -   Calculate control points dynamically based on distance to create smooth "S" shapes.

## Execution Steps

1.  **Runtime:** Modify `public/base_game/campaignSystem.js` to add `case 'random'` and `case 'wait'`.
2.  **Minimap:** Add `mousedown`/`mousemove` listeners to the Minimap canvas in `CampaignEditor`.
3.  **Visuals:** Refactor `createPathSVG` to use Cubic Bezier math.
4.  **Variables:** Add a `variables` array to the Editor class and a UI method to manage them.
