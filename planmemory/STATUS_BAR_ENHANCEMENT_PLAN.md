# Status Bar Enhancement Master Plan

## Objective
Transform the static bottom status bar into a dynamic, information-rich hub similar to professional IDEs (VS Code, JetBrains), providing real-time feedback on the engine's state, project status, and system health.

## 1. UX/UI Design
The status bar will be divided into three logical sections:

### Left Section (Project & Context)
- **Project Name**: Already exists. Enhance with a clickable action to switch projects.
- **Git Branch**: Display current branch (e.g., `main*`) and sync status (up/down arrows).
- **Diagnostics**: Error and Warning counts (e.g., `ⓧ 0 ⚠ 2`) linked to the Console tool.

### Center Section (Notifications)
- **Toast Area**: Transient messages (e.g., "File Saved", "Build Started") that appear and fade out, replacing the static "KETEBE STUDIO" text.

### Right Section (Environment & Stats)
- **Cursor Position**: `Ln 12, Col 45` (Updates when a script/code editor is focused).
- **Build Target**: Current target platform (e.g., `Windows (EXE)`).
- **System Health**: Compact CPU/RAM graphs (moved or mirrored from the quick toolbar).
- **Clock**: Already exists.

## 2. Technical Implementation Plan

### Phase A: Structure & Styling
1.  **Refactor HTML**: Segment `#status-bar` into `.sb-left`, `.sb-center`, and `.sb-right` containers.
2.  **CSS Styling**:
    - Use flexbox for spacing.
    - Style individual items (`.sb-item`) with hover effects (lighter background) to indicate interactivity.
    - Create a "busy" animation state for the Git indicator.

### Phase B: Logic Integration

#### 1. Git Status Integration
- **Mock Data (Initial)**: Create a `updateGitStatus()` function that sets random modified file counts for now (since no real backend Git link exists yet).
- **UI**: Add click handler to open the "Git Status" panel in the Right Sidebar.

#### 2. Console Diagnostics
- **Global Counter**: Create a global `window.diagnostics = { errors: 0, warnings: 0 }`.
- **Listener**: Override `console.error` and `console.warn` in the main window to increment these counters and update the UI.
- **Interactivity**: Clicking the counter opens the Console tool.

#### 3. Editor Cursor Tracking
- **Message Bus**: Implement a `window.addEventListener('message', ...)` listener.
- **Iframe Dispatch**: In editor tools (Script, Logic, etc.), add logic to post messages to the parent:
  ```javascript
  window.parent.postMessage({ type: 'cursor-update', line: 10, col: 5 }, '*');
  ```
- **UI Update**: Update the `Ln X, Col Y` span on receiving these messages.

#### 4. Build Target & System Stats
- **Sync**: Listen for changes on the `#build-target` dropdown in the sidebar and update the status bar label.
- **Migration**: Refactor `updateSystemMeter()` to target the new status bar elements instead of (or in addition to) the top toolbar.

### Phase C: Notification System
- **Notification Manager**: Create a `showStatusMessage(msg, type, duration)` function.
- **Behavior**: It replaces the center text temporarily, then reverts to default text.

## 3. Execution Roadmap

1.  **Modify `public/tools.html`**:
    - Update HTML structure.
    - Add CSS for `.sb-item`, `.sb-section`, and hover states.
2.  **Update `public/tools.html` Script**:
    - Add `updateGitStatus()`, `updateDiagnostics()`, `updateCursorPos()`.
    - Hook into `updateSystemMeter`.
    - Add event listeners for `message` events.
3.  **Verify**:
    - Check if "Errors" count goes up when `console.error` is called.
    - Check if "Build Target" changes when selected in the sidebar.
    - Check if CPU/RAM meters animate.

## 4. Future Expansion (Post-Alpha)
- **Language Mode**: Show "JavaScript", "GLSL", "JSON" based on active file.
- **Indentation**: Show "Spaces: 4" or "Tabs".
- **Real Git**: Connect to a backend Node.js Git service.
