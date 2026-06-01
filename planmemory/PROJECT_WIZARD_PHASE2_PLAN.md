# PROJECT WIZARD PHASE 2: "ARCHITECT'S FORGE"

**Status:** Planned
**Target:** v0.2.0
**Objective:** Transform the simple "New Project" modal into a comprehensive, visual Project Creation Wizard that supports dynamic templates, metadata configuration, and extensible scaffolding.

---

## 1. Core Pillars

### A. Dynamic Template System (Backend)
Currently, templates are hardcoded in `server.js`. Phase 2 will introduce a dedicated `templates/` directory. The server will scan this directory to dynamically populate the wizard.
*   **Structure:** Templates will exist as independent folders in `root/templates/`.
*   **Manifest:** Each template will contain a `template.json` defining its name, description, category, and author.
*   **Previews:** Each template will have a `preview.png` for the UI.

### B. Rich Visual UI (Frontend)
Replacing the simple dropdown with a full-screen or large modal "Card Grid" layout.
*   **Gallery View:** Display templates as cards with thumbnails.
*   **Details Panel:** When a template is selected, show its description and required assets.
*   **Categories:** Filter by "RPG", "Platformer", "Empty", "Examples".

### C. Project Metadata & Configuration
Moving beyond just a folder name. We will introduce a standardized `redglitch.json` (or extend `package.json`) for every project.
*   **Fields:** Project Name, Author, Version, Description, Unique ID (UUID).
*   **Settings:** Initial screen resolution, default inputs.

---

## 2. Technical Architecture

### Directory Structure Changes
```text
redglitch-engine/
├── templates/                  <-- NEW DIRECTORY
│   ├── base-rpg/               <-- Was "Default Project"
│   │   ├── template.json       <-- Metadata
│   │   ├── preview.png         <-- Thumbnail
│   │   └── ... (Game Files)
│   ├── empty-scaffold/
│   └── demo-platformer/
└── projects/                   <-- User Projects remain here
```

### API Expansion (`server.js`)
1.  **`GET /api/templates`**
    *   Scans `templates/` directory.
    *   Reads `template.json` from each.
    *   Returns array: `[{ id: 'base-rpg', name: 'Classic RPG', desc: '...', thumbnail: '...' }]`.
2.  **`POST /api/projects/create` (Updated)**
    *   Accepts: `{ name, templateId, metadata: { author, desc } }`.
    *   Copies files from `templates/[templateId]` to `projects/[name]`.
    *   Injects/Creates `redglitch.json` with the provided metadata.

---

## 3. Implementation Roadmap

### Step 1: Backend Infrastructure
- [ ] Create `templates/` directory.
- [ ] Move "Default Project" content into `templates/base-rpg/`.
- [ ] Create `templates/base-rpg/template.json` and `preview.png`.
- [ ] Create `templates/empty/` (minimal scaffold).
- [ ] Implement `GET /api/templates` in `server.js`.

### Step 2: Frontend Redesign (`tools.html`)
- [ ] Design the "Wizard" container (HTML/CSS).
- [ ] Create the **Template Grid** component (Left side).
- [ ] Create the **Project Config** form (Right side: Name, Author, Description).
- [ ] Implement logic to fetch templates via API and render cards.

### Step 3: Integration & Metadata
- [ ] Update `server.js` creation logic to read from `templates/` instead of `projects/Default Project`.
- [ ] Implement `redglitch.json` generation during creation.
- [ ] Update the Dashboard (`project_dashboard.html`) to read project names/authors from `redglitch.json` instead of just folder names.

---

## 4. UI Mockup (ASCII)

```text
+---------------------------------------------------------------+
|  NEW PROJECT WIZARD                                       [X] |
+---------------------------------------------------------------+
|  SELECT TEMPLATE             |  CONFIGURATION                 |
|                              |                                |
|  [ SEARCH... ]               |  Project Name:                 |
|                              |  [__________________________]  |
|  +-----------+  +---------+  |                                |
|  | [IMAGE]   |  | [IMAGE] |  |  Author:                       |
|  | Top Down  |  | Empty   |  |  [__________________________]  |
|  | RPG       |  | Base    |  |                                |
|  +-----------+  +---------+  |  Description:                  |
|                              |  [__________________________]  |
|  +-----------+  +---------+  |  [__________________________]  |
|  | [IMAGE]   |  | [IMAGE] |  |                                |
|  | Platformer|  | Visual  |  |  Selected: Top Down RPG        |
|  | (Coming)  |  | Novel   |  |  "A complete base with map,    |
|  +-----------+  +---------+  |   inventory, and dialogue."    |
|                              |                                |
|                              |  [ CANCEL ]      [ CREATE > ]  |
+---------------------------------------------------------------+
```

## 5. Future Ideas (Phase 3)
*   **Git Initialization:** Checkbox to `git init` automatically.
*   **Asset Bundles:** Select "Starter Audio Pack" or "Pixel Art Pack" to include during creation.
*   **Remote Templates:** Fetch templates from a community GitHub repo.
