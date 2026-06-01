# IRAB Helper Bot: Comprehensive Development Plan

## 1. Current State Analysis
**Version:** v7.0 (Restored Pixel UI)
**Architecture:** Client-side Overlay (JS) + Node.js Proxy (Server)
**AI Providers:** Cerebras (Llama 3.1) & Google Gemini

| Feature | Status | Analysis |
| :--- | :--- | :--- |
| **Visuals** | ✅ Excellent | Retro `VT323` style, hard borders, and pixelated avatar are restored. |
| **Connectivity** | ✅ Working | Securely routes API keys via `server.js`. |
| **Context** | ⚠️ Weak | Only knows `Project Name` and `Active Filename`. **Blind to file content.** |
| **Memory** | ❌ Critical Missing | **No conversation history.** Every message is treated as a brand new interaction. You cannot ask follow-up questions. |
| **Actions** | ❌ Regression | **Lost capability.** v6 could `save`, `toggle grid`, `center view`. v7 is text-only. |
| **Integration** | ❌ None | It floats on top but cannot interact with the editor, file tree, or console. |

---

## 2. What is Missing & Needed (Gap Analysis)

### A. "I Forgot What We Were Talking About" (No Memory)
*   **Problem:** If you ask "How do I make an enemy?", then ask "How do I make it red?", IRAB will say "Make what red?"
*   **Need:** Client must send a `history` array. Server must format it for the specific LLM API (User/Assistant roles).

### B. "I Can't See Your Code" (No Read Access)
*   **Problem:** You are editing `player.js`. You ask "Is there a bug here?". IRAB says "I don't know, paste the code."
*   **Need:** Auto-fetch the content of the active editor (e.g., via `window.ide.getValue()` or API read) and inject it into the System Prompt (truncated to avoid token limits).

### C. "I Can't Do That, Dave" (No Actions)
*   **Problem:** You ask "Save the project". IRAB says "I am just a chatbot." In v6, it would actually save the project.
*   **Need:** Restore the `execute()` command parser. Map intents like "save", "grid", "clear" to internal window functions (`saveToServer()`, `toggleGrid()`).

### D. "I Can't Fix It For You" (No Write Access)
*   **Problem:** IRAB writes a perfect function to fix a bug. You have to manually copy-paste it.
*   **Need:** Detect code blocks in the response. Add an **[INSERT]** button to paste it into the active cursor position.

### E. "I Didn't See That Crash" (No Error Awareness)
*   **Problem:** The game crashes with a red console error. IRAB is happily idling.
*   **Need:** Hook `window.onerror`. When an exception occurs, IRAB should animate (maybe turn red) and offer to explain the stack trace.

---

## 3. Development Roadmap

### Phase 1: Restoration & Memory (Immediate Priority)
*   **Goal:** Make it a conversation partner, not a one-shot query machine. Restore v6 utilities.
*   **Tasks:**
    1.  **Restore Command Execution:** Re-implement `execute(cmd)` in `assistant.js` for `save`, `grid`, `center`.
    2.  **Implement Chat History:** Maintain a client-side list of the last 10 messages. Send this to `/api/ai/chat`.
    3.  **Server History Handling:** Update `server.js` to parse the history array and format it for Cerebras/Gemini APIs.

### Phase 2: Context Awareness (Short Term)
*   **Goal:** Give IRAB "eyes" to see the project.
*   **Tasks:**
    1.  **Read Active File:** Detect the active editor (Monaco/Textarea). Grab the text. Send the first 500 lines as "Current File Context".
    2.  **Read File Tree:** Send a simplified JSON tree of the `activeProject` so IRAB knows file paths for imports.
    3.  **System Prompt Tuning:** Update the prompt to enforce the persona and awareness of the "redglitch ENGINE" environment.

### Phase 3: Deep Integration (Medium Term)
*   **Goal:** Give IRAB "hands" to help build.
*   **Tasks:**
    1.  **Code Injection:** Add a "Copy/Apply" button to code blocks in the chat.
    2.  **Smart Navigation:** "Take me to the enemy editor" -> Redirects `window.location`.
    3.  **Error Interceptor:** Auto-capture console errors and provide immediate fixes.

---

### **Recommended Next Step:**
Proceed with **Phase 1** immediately to fix the Regression (Actions) and the Usability Flaw (Memory).
