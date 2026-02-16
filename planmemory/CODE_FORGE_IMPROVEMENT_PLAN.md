# Code Forge Improvement Plan

## Vision
To transform the "Code Forge" from a basic script editor into a "homely", comfortable, and feature-rich development environment for the user. The goal is to maximize developer productivity and customization.

## 1. UI/UX Overhaul
- **Welcome Screen:** Display a friendly "Welcome Home" message with quick actions (New File, Open Recent) when no tabs are open.
- **Improved Status Bar:**
    -   Show indentation settings (Spaces: 4 / Tabs).
    -   Show current language mode.
    -   Clickable status items to change settings.
- **Sidebar Enhancements:**
    -   Add a context menu for files (Rename, Delete, New File, New Folder).
    -   Collapsible sections (Open Editors, Project Files).
    -   "Settings" gear icon at the bottom.

## 2. Titlebar & Menubar Redesign
Replace the placeholder menu with a fully functional application menu:
-   **File:** New File, Save, Save All, Close Tab, Close All.
-   **Edit:** Undo, Redo, Cut, Copy, Paste, Find, Replace.
-   **View:**
    -   Toggle Sidebar
    -   Toggle Minimap
    -   Word Wrap
    -   Zoom In/Out
-   **Go:** Go to Line, Go to Symbol (if supported).
-   **Help:** Keyboard Shortcuts, About.

## 3. Settings System (The "Home" Feeling)
Implement a persistent settings system (using `localStorage`) so the environment feels personalized.
-   **Theme:** Switch between VS Dark, VS Light, and High Contrast (plus potential custom themes).
-   **Font:** Toggle between 'JetBrains Mono', 'Fira Code', 'Consolas'.
-   **Font Size:** Slider or input (10px - 24px).
-   **Editor Options:**
    -   Minimap (On/Off)
    -   Word Wrap (On/Off)
    -   Auto-Save (On/Off + Interval)
    -   Render Whitespace (None/Selection/All)
    -   Cursor Style (Line/Block/Underline)

## 4. Feature Implementation
-   **Toolbar Actions:**
    -   Wire up "Undo" and "Redo" to Monaco's history.
    -   Wire up "Find" to `editor.getAction('actions.find').run()`.
-   **File Operations:**
    -   Implement file creation and deletion logic via API.
-   **Keyboard Shortcuts:**
    -   `Ctrl+S`: Save
    -   `Ctrl+W`: Close Tab
    -   `Ctrl+,`: Open Settings
    -   `Ctrl+P`: Quick Open (File search) - *Advanced goal*

## 5. Technical Architecture
-   **SettingsManager:** A JS class to handle loading/saving/applying preferences.
-   **WindowManager:** Refactor tab/layout management for better modularity.
-   **Context Menu:** A custom HTML/CSS context menu for the file tree.

## Execution Steps
1.  **Refactor HTML:** Update `script_editor.html` to include the new menu structure, settings modal, and improved sidebar layout.
2.  **Implement Settings Logic:** Create the `SettingsManager` in `script_editor.js`.
3.  **Enhance Editor Logic:** Wire up the new menu actions and toolbar buttons to Monaco API.
4.  **Add File Operations:** Implement the UI and API calls for creating/deleting files.
5.  **Polish:** Apply CSS for the "homely" aesthetic (smoother transitions, better spacing).
