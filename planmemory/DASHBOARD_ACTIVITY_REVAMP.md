# Dashboard Activity Revamp Plan

## Objective
Revamp the "Recent Files" section in the Project Dashboard to become a comprehensive "Latest Activities" feed. This feed will track not just files, but also tools opened, with timestamps, providing a clearer history of the user's workflow.

## 1. Shared Project State Update (`SharedProjectState.js`)
*   **Track Activity:** Add a new method `logActivity(type, name, id)` to `SharedProjectState`.
*   **Storage:** Store a list of activities in `state.activities` (array of objects: `{ type, name, id, timestamp }`). Limit this list to the last 20-50 items.
*   **Persistence:** Ensure this list is saved with the project state so it persists across sessions.
*   **Broadcasting:** Emit an event `activity:logged` when a new item is added so the dashboard can update in real-time.

## 2. Tool Integration (All Editors/Tools)
*   **Instrument `openTool`:** In the parent window (IDE) or wherever tools are launched, call `VortexProjectState.logActivity('tool', toolName, toolId)`.
*   **Instrument File Opening:** When files are opened in editors (Code Forge, Level Editor, etc.), call `VortexProjectState.logActivity('file', fileName, filePath)`.

## 3. Dashboard UI Update (`project_dashboard.html`)
*   **Rename Widget:** Change "Recent Files" to "Latest Activities".
*   **Update List Item Structure:**
    *   **Icon:** Dynamic based on activity type (Tool vs File).
    *   **Main Text:** Name of the tool or file.
    *   **Sub Text:** "Opened just now", "Opened 5m ago", etc. (Relative timestamp).
*   **Logic:**
    *   Subscribe to `activity:logged` (via EventBus or State listener).
    *   `renderActivities()` function to pull from `VortexProjectState.get('activities')` and render the list.
    *   Auto-refresh relative timestamps every minute.

## Execution Order
1.  **State Logic:** Update `SharedProjectState.js` to support activity logging.
2.  **Dashboard UI:** Modify `project_dashboard.html` to consume this new data structure.
3.  **Integration:** Ensure `openTool` in the dashboard (and potentially other entry points) logs these events.

*Note:* Since I cannot easily edit all other editors to log their file openings in this single turn, I will focus on the Dashboard's ability to log *tools* it opens and *files* it knows about, and provide the API for others to use later.
