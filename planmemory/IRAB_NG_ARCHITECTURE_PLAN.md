# Project IRAB-Native: High-Performance AI Architecture

**Version:** 2.0 (Native Edition)
**Date:** February 10, 2026
**Objective:** Build a robust, hardware-accelerated AI service ("The Cortex") that runs outside Node.js, leveraging Apple Metal (MPS) for high-speed inference, and driving the "Alive" UI in Electron via IPC.

---

## 1. System Architecture

### 1.1 The "Cortex" (Native Python Service)
A standalone Python process that runs the Intelligence.
*   **Core:** Python 3.10+
*   **Inference Engine:** `llama-cpp-python` (Native bindings for `llama.cpp`).
    *   *Why?* Direct access to Apple Silicon NPU/GPU (Metal). 10x-50x faster than WASM.
*   **Communication:** `pyzmq` (ZeroMQ) or `FastAPI` (WebSockets).
    *   *Decision:* **FastAPI + WebSockets**. Easier to debug, supports async streaming naturally, standard in AI.
*   **Role:**
    *   Maintains the "Brain" state.
    *   Watches the File System directly (Low-level).
    *   Streams tokens to the UI.

### 1.2 The "Bridge" (Electron Main Process)
The Node.js layer acts as the process manager, not the thinker.
*   **Lifecycle:** Spawns the Python Cortex on startup. Kills it on exit.
*   **Routing:** Proxies WebSocket messages from the Renderer (UI) to the Cortex (Python) if needed, OR lets the UI connect directly to the localhost websocket for lowest latency.

### 1.3 The "Avatar" (The UI)
The "Alive" visual representation remains in the Web/Electron layer.
*   **Tech:** HTML5 Canvas / CSS Overlay.
*   **Input:** Receives "Emotion" and "Action" events from the WebSocket.
    *   *Example:* Cortex sends `{ type: "EMOTION", value: "THINKING" }` -> Avatar plays thinking animation.
    *   *Example:* Cortex sends `{ type: "CODE_INSERT", payload: "..." }` -> Editor applies edit.

---

## 2. Low-Level State Monitoring

The Cortex shouldn't wait for Electron to tell it files changed. It should know.

1.  **File Watcher (Python):** Uses `watchdog` to monitor the project directory.
2.  **Vector Store (Python):** `ChromaDB` (local) or `FAISS` running inside the Python process to index code chunks in real-time.
3.  **Memory:** Maintains a `conversation_history` JSON and a `project_context` graph in memory.

---

## 3. Communication Protocol (WebSocket)

**Endpoint:** `ws://localhost:8000/ws`

**1. Studio -> Cortex (User Request)**
```json
{
  "type": "PROMPT",
  "data": "Fix the physics bug in Player.js",
  "context": { "cursorLine": 42, "openFiles": ["Player.js"] }
}
```

**2. Cortex -> Studio (Streaming Response)**
```json
{ "type": "TOKEN", "data": "Sure" }
{ "type": "TOKEN", "data": ", I" }
{ "type": "TOKEN", "data": " can" }
```

**3. Cortex -> Studio (Control Signal)**
```json
{ "type": "SET_STATE", "data": "CODING" }  // Avatar starts typing animation
{ "type": "TOOL_EXEC", "tool": "file_write", "args": { ... } }
```

---

## 4. Development Roadmap

### Phase 1: The Python Cortex (Backend)
*   [ ] **Scaffold:** `backend/` directory with `requirements.txt`.
*   [ ] **Server:** Create `main.py` with FastAPI/WebSocket.
*   [ ] **Inference:** Integrate `llama-cpp-python`. Load a test model (e.g., `TinyLlama-1.1B` or `Phi-2` for speed testing).

### Phase 2: The Electron Lifecycle
*   [ ] **Process Manager:** Update `server.js` or `electron-main.js` to spawn the Python `venv` and script.
*   [ ] **Health Check:** UI shows "Brain Loading..." until WebSocket connects.

### Phase 3: The Nervous System (Watcher)
*   [ ] **File Watcher:** Implement `watchdog` in Python to ingest file changes.
*   [ ] **RAG Pipeline:** Simple TF-IDF or ChromaDB implementation in Python to retrieve relevant code.

### Phase 4: The Alive UI
*   [ ] **WebSocket Client:** Connect `irab-ui.js` to the Python server.
*   [ ] **Avatar Renderer:** Render the pixel art character that reacts to WebSocket states.

---

## 5. Prerequisites

*   **Python 3.10+** installed on the system.
*   **Node.js** (Already present).
*   **Model Weights:** We will need to download a `.gguf` model file (approx 1-3GB) to `backend/models/`.

## 6. Folder Structure

```text
/
├── backend/               <-- NEW: The Cortex
│   ├── main.py            # FastAPI Server
│   ├── brain.py           # Llama-cpp-python wrapper
│   ├── watcher.py         # File system monitor
│   ├── requirements.txt
│   └── models/            # .gguf files
├── public/
│   ├── ai/
│   │   ├── bridge.js      # WebSocket Client
│   │   └── avatar.js      # Animation logic
```