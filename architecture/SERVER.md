# Server Architecture (`server.js`)

The ketebe ENGINE server is a Node.js Express application that acts as the bridge between the host operating system and the web-based client.

## Core Responsibilities

1.  **Static File Serving (The "Shadow Filesystem")**
2.  **API Layer (REST)**
3.  **Real-time Communication (WebSocket)**

---

## 1. The Shadow Filesystem
The most critical feature of the server is how it serves files. It implements a fallback mechanism that allows projects to "shadow" or override core engine files without modifying the core itself.

### Logic
When a request comes in for a file (e.g., `/sprites.js` or `/dunyalar/map.json`):
1.  **Check Active Project**: The server looks in `projects/<active_project>/<requested_path>`.
2.  **Fallback to Core**: If the file does not exist in the project, it serves `public/<requested_path>`.

### Key Routes
*   `/dunyalar/*`: Serves world/map data.
*   `/assets/*`: Serves raw assets (images, sounds).
*   `/engines/*`: Serves engine source code.
*   `/`: Redirects to `/dashboard.html`.

This architecture allows:
*   **Non-Destructive Updates**: The core engine in `public/` can be updated without breaking user projects (unless APIs change).
*   **Lightweight Projects**: A new project only contains unique data, not a copy of the entire engine.

---

## 2. API Endpoints

### Project Management
*   `GET /api/projects`: Lists all available projects in the `projects/` directory.
*   `POST /api/projects`: Creates a new project from a template.
    *   **Templates**: Copies structure from `templates/` (e.g., `base-rpg`, `iso-pixel-demo`).
    *   **Config**: Generates `ketebe.json`.
*   `POST /api/projects/delete`: Deletes a project folder.
*   `POST /api/projects/explore`: Opens the project folder in the OS file explorer (Finder/Explorer).

### IDE / File Operations
*   `GET /api/ide/list`: Lists files in a given directory (scoped to project or root).
*   `POST /api/ide/read`: Reads the content of a text file.
*   `POST /api/ide/save`: Writes content to a text file.
    *   **Safety**: Includes checks to prevent writing outside the project sandbox (though strictly speaking, dev mode allows wider access).
*   `POST /api/upload`: Handles multipart form uploads for new assets.

### Templates
*   `GET /api/templates`: Lists available project templates.

---

## 3. WebSocket Server
*   **Port**: Same as HTTP server (default 3000).
*   **Purpose**:
    *   **Hot Reloading**: Notifies client to reload when core files change (`chokidar` integration).
    *   **Event Bus Relay**: Relays messages between open tabs (e.g., changing a sprite in `asset_manager` updates the `iso_editor` immediately).
