# Campaign Studio - Phase 2 Development Plan

## Objective
To transform the Campaign Studio from a basic node editor into a professional-grade production tool by adding productivity features, safety mechanisms, and advanced layout capabilities.

## Feature Set

### 1. History System (Undo/Redo)
**Goal:** Prevent data loss and allow experimentation.
-   **Implementation:** Command pattern or State Snapshotting.
-   **Actions to Track:**
    -   Node Move (drag end)
    -   Node Create/Delete
    -   Connection Create/Delete
    -   Property Change
-   **UI:** Add Undo/Redo buttons to toolbar (and Ctrl+Z / Ctrl+Y shortcuts).

### 2. Clipboard Operations (Copy/Paste)
**Goal:** Speed up workflow for repetitive structures.
-   **Implementation:** LocalStorage or memory buffer.
-   **Behavior:**
    -   `Ctrl+C`: Copy selected node(s).
    -   `Ctrl+V`: Paste node(s) near mouse cursor or offset from original.
    -   Should preserve node properties but generate new unique IDs.

### 3. Auto-Layout (DAG Algorithm)
**Goal:** Instantly organize "spaghetti" graphs into readable flows.
-   **Implementation:** Simple Sugiyama-like layered algorithm or tree traversal.
-   **Logic:**
    -   Identify "Start" node(s) as root.
    -   Assign ranks (depth) to nodes based on connections.
    -   Position nodes in columns/rows based on rank.
    -   Minimize crossing (heuristically).

### 4. Validation & Health Check
**Goal:** Ensure the campaign runs correctly in-game.
-   **Checks:**
    -   **Orphans:** Nodes with no inputs (except Start).
    -   **Dead Ends:** Nodes with no outputs (except End/Reward).
    -   **Missing Data:** Level nodes with no Level ID, Branches with no Flag.
-   **UI:** "Validate" button that adds warning icons to bad nodes and lists errors.

### 5. Search & Navigation
**Goal:** Quickly find nodes in large campaigns.
-   **UI:** Search bar in toolbar.
-   **Behavior:** Highlight matches, auto-pan to selected result.

## Execution Steps

1.  **Modify HTML:** Add new toolbar buttons (Undo, Redo, Validate, Search).
2.  **Update JS (Core):** Refactor `CampaignEditor` to wrap state changes in `pushHistory()`.
3.  **Update JS (Features):** Implement `AutoLayout`, `Clipboard`, `Validator` classes/methods.
4.  **Update JS (Input):** Add keyboard shortcuts.
