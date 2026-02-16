# ONGONLUK ENGINE: Problem Report & Technical Debt (Feb 2026)

## 🚨 Critical Severity: Architectural Integrity

### 1. Monolithic "God Files"
- **The Issue:** Core files like `editor.js` (>1300 lines) and `server.js` are handling too many responsibilities (UI, File I/O, Rendering, State, Build).
- **The Risk:** Bug fixes in one area unexpectedly break others. New developers find it impossible to navigate without breaking dependencies.
- **Requirement:** Move toward a Modular Architecture (ES Modules). Split `server.js` into separate Route/Controller files.

### 2. Fragmented Build Pipeline
- **The Issue:** The build logic in `server.js` (/api/build) is a manual copy-paste implementation, while `build-game.js` is a separate, more robust script.
- **The Risk:** The "Built" version of the game might behave differently than the "Editor" version due to different asset resolution logic.
- **Requirement:** Consolidate all build logic into a single service.

---

## ⚠️ Medium Severity: Performance & Scalability

### 3. Inefficient Graph Rendering (Campaign Editor)
- **The Issue:** `renderWires()` clears the entire SVG and re-calculates every Bezier curve on every mouse move during a drag.
- **The Risk:** Significant lag ("jank") once a campaign exceeds 50 nodes.
- **Requirement:** Implement Selective Rendering. Only update paths connected to the active node.

### 4. Asset Scanning Overhead
- **The Issue:** The asset pipeline relies on full directory scans and a large `assets.json` file.
- **The Risk:** Projects with thousands of assets will become slow to scan and heavy to load.
- **Requirement:** Implement an Incremental Asset Index.

---

## 🛠️ Maintenance & DX (Developer Experience)

### 5. Global Scope Pollution
- **The Issue:** Excessive use of `window.editor`, `window.SPRITES`, and global variables.
- **The Risk:** Naming collisions and inability to perform Unit Testing.
- **Requirement:** Use a "Store" pattern or simple Dependency Injection.

### 6. Inconsistent Localization
- **The Issue:** Mixing Turkish folder names (`dunyalar`, `muzikler`) with English code/API paths.
- **Requirement:** Standardize technical paths to English.

---

## 🔒 Security & Safety

### 7. Terminal Execution Exposure
- **The Issue:** The `/api/ide/terminal` endpoint allows arbitrary shell command execution.
- **Requirement:** Implement a "Safe Command List" or restrict to `localhost` with security tokens.