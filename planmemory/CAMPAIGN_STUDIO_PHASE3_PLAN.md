# Campaign Studio - Phase 3 Development Plan

## Objective
To elevate the Campaign Studio into a visual storytelling powerhouse by adding organizational tools, navigation aids, and advanced logic capabilities.

## Feature Set

### 1. Minimap Navigation
**Goal:** Easy navigation for massive campaign graphs.
-   **Implementation:** Small canvas overlay rendering simplified node blocks.
-   **Behavior:**
    -   Shows viewport rectangle.
    -   Click/Drag on minimap to pan main view.
    -   Updates in real-time or on interaction end.

### 2. Groups & Comments (Organization)
**Goal:** Organize complex logic into logical blocks.
-   **Group Node:** A container that visualizes a background rect around other nodes.
    -   Dragging the group drags all children.
    -   Collapsible groups (hide internal nodes) - *Advanced*.
-   **Comment Node:** A visual "sticky note" node that doesn't affect logic but provides documentation.

### 3. Advanced Node Types
**Goal:** More expressive logic without scripting.
-   **Random Branch:** Output based on % chance.
-   **Counter/Loop:** Run a sequence X times.
-   **Wait/Delay:** Pause execution for X seconds.
-   **Parallel:** Execute multiple outputs simultaneously.

### 4. Connection Styling & Logic
**Goal:** Better visual clarity.
-   **Bezier Control:** Allow adjusting wire curvature manually (optional).
-   **Reroute Nodes:** Tiny dot nodes to route wires around obstacles.
-   **Color Coding:** Wires color-coded by type (Flow vs Data - if data flow added later).

### 5. Context Menu
**Goal:** Faster workflow than sidebar.
-   **Implementation:** Right-click on workspace.
-   **Options:** Add Node, Paste, Auto-Layout.
-   **Right-click on Node:** Delete, Copy, Duplicate, Disconnect.

### 6. Live Logic Debugging (Visual)
**Goal:** See the campaign flow running in real-time (when connected to game).
-   **Implementation:** WebSocket or Polling status.
-   **Visual:** Highlight the "active" node in Green/Gold. Show execution path history.

## Execution Steps

1.  **Minimap:** Add canvas to UI, implement `renderMinimap` loop.
2.  **Context Menu:** Custom HTML overlay positioned at mouse `contextmenu` event.
3.  **Groups:** New node type `group` with specialized rendering (behind other nodes) and interaction logic (parenting).
4.  **Advanced Nodes:** Add `random`, `wait`, `parallel` to palette and logic parser.
