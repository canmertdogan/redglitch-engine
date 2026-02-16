# Quick Access Toolbar Enhancement Plan

## Objective
Upgrade the top "Quick Access Toolbar" from a basic shortcut row into a comprehensive command center, providing one-click access to essential engine functions, editing tools, and layout controls.

## 1. UX/UI Design
The toolbar will be organized into logical groups using separators. Buttons should be iconic, with tooltips for clarity.

### Proposed Layout (Left to Right)

**Group 1: Project & System**
*   `[📂]` **Project Manager** (Existing)
*   `[📁]` **Open Explorer** (Existing)
*   `[💾]` **Save All** (Existing)
*   `[⚙️]` **Project Settings** (New: Specific project config, distinct from global prefs)

**Group 2: Edit Operations (New)**
*   `[↩️]` **Undo** (Global undo dispatch)
*   `[↪️]` **Redo** (Global redo dispatch)
*   `[✂️]` **Cut**
*   `[📋]` **Copy**
*   `[📌]` **Paste**

**Group 3: Runtime & Build**
*   `[▶️]` **Run Game** (Primary styling)
*   `[⏸️]` **Pause/Resume** (New: Toggle state)
*   `[🛑]` **Stop** (New: Force close running game)
*   `[🔨]` **Build** (Existing)

**Group 4: Git / Version Control (New)**
*   `[⬇️]` **Pull** (Quick sync)
*   `[⬆️]` **Push** (Quick commit & push)

**Group 5: View & Layout (New)**
*   `[◫]` **Toggle Left Sidebar**
*   `[◲]` **Toggle Bottom Panel** (Future: for console/assets)
*   `[◳]` **Toggle Right Sidebar**
*   `[⛶]` **Fullscreen Studio**

**Group 6: Common Tools (Shortcuts)**
*   `[🗺️]` **Map Editor**
*   `[💻]` **Script Editor**
*   `[🎨]` **Pixel Art**

**Right Aligned: Monitors (Existing)**
*   CPU Graph
*   RAM Graph

## 2. Technical Implementation

### Phase A: HTML & CSS Structure
1.  **Refactor HTML**: Organize buttons into `<div class="toolbar-group">` wrappers for better spacing and management.
2.  **Styling**:
    - Add styles for disabled states (e.g., Undo/Redo when stack is empty).
    - Create a `.toggle-btn` class for buttons that have an on/off state (like Pause).

### Phase B: Logic Integration

#### 1. Global Edit Commands
- Implement a `dispatchGlobalCommand(cmd)` function.
- This function will check the currently focused window/iframe and send a `postMessage` to it (e.g., `{ type: 'execCommand', command: 'undo' }`).
- Child windows (editors) need a listener to handle these standard commands.

#### 2. Layout Controls
- Hook up the toggle buttons to existing `toggleSidebar()` and `toggleRightSidebar()` functions.
- Create `toggleFullscreen()` logic for the main studio window.

#### 3. Git Shortcuts
- Connect Pull/Push buttons to the backend API endpoints (mock for now, or reuse existing `git-status` logic).

#### 4. Tool Shortcuts
- Simple `onclick` handlers calling `openWindow(...)` with predefined configs.

## 3. Execution Roadmap

1.  **Update `public/tools.html` HTML**: Add the new buttons and separators.
2.  **Update `public/tools.html` JS**: Add stub functions for new actions (`globalUndo`, `globalRedo`, `toggleFullscreen`, etc.).
3.  **Refine CSS**: Ensure the toolbar doesn't overflow; if it does, implement a "overflow menu" ( `»` ) or scroll.

## 4. Future Polish
- **Keyboard Shortcuts**: Map `Ctrl+Z`, `Ctrl+Y`, etc., to trigger the visual buttons (visual feedback).
- **State Awareness**: Disable "Redo" if nothing to redo. Highlight "Run" when game is active.
