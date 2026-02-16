# IRAB (MSN Edition) Expansion Plan
**Target:** Transform the IRAB UI from a "Chat Window" into a "Living Studio Companion" combining 2000s nostalgia with 2026 AI power.

## Phase 1: The "Sensory" Upgrade (Audio & Visuals)
*Goal: Make IRAB feel like a real native application.*

1.  **Sound Effects (SFX):**
    *   Implement authentic notifications sounds (toggleable).
    *   *Events:* `msg_received` ("tu-tu-turut"), `user_online` (door open), `nudge` (heavy shake sound), `error` (XP critical stop).
2.  **Working "Winks":**
    *   Create CSS/JS animations that overlay the entire Studio screen briefly when triggered by the AI (e.g., a giant pixelated "Thumbs Up" or "Laughing" face).
3.  **Emoticon Picker:**
    *   Replace the stub button with a real grid of pixel-art emoticons that insert shortcodes (e.g., `(H)`, `(L)`, `:@`) into the chat.
4.  **"Playing Now" Status:**
    *   Change the status text under the avatar dynamically based on what the user is doing.
    *   *Example:* "Listening to: Platformer Studio (Editing)" or "Status: Compiling...".

## Phase 2: Deep Context & Memory
*Goal: Make IRAB smarter about *what* you are working on.*

1.  **Active File Awareness:**
    *   Hook into the Monaco Editor (Script Tool). When the user highlights code, IRAB should receive that snippet automatically as "Focus Context".
2.  **Server-Side History:**
    *   Move chat persistence from `localStorage` (browser) to `backend/data/chat_logs/` (JSON files).
    *   Allow IRAB to "remember" what you discussed yesterday.
3.  **Chat Export:**
    *   Add a "Save Conversation" button in the menu to export the current chat as a `.txt` or `.html` log file (formatted like an old MSN log).

## Phase 3: Advanced Agentic Workflow
*Goal: Give IRAB more hands.*

1.  **Code Injection:**
    *   Allow IRAB to not just *write* code, but *insert* it directly into the open Script Editor window at the cursor position.
2.  **Asset Preview:**
    *   If you ask for a sprite, IRAB should be able to display the image directly in the chat bubble (Base64 or path reference).
3.  **"Clippy" Mode (Mini-State):**
    *   When the chat window is closed, the small balloon should be more active, offering unsolicited (but helpful) tips based on recent file changes.

## Phase 4: Customization (Skins)
*Goal: Personalization.*

1.  **Theme Switcher:**
    *   Implement "Luna" (Blue), "Homestead" (Olive), and "Metallic" (Silver) themes for the chat window.
2.  **Custom Avatar:**
    *   Allow the user to click their own avatar to upload/select a custom PNG from the `assets` folder.

## Technical Requirements
*   **Audio:** Standard HTML5 `Audio()` API.
*   **Backend:** New `save_history` endpoint in `main.py`.
*   **Bridge:** Expand `msn-bridge.js` to handle `INJECT_CODE` and `PLAY_SOUND` commands.
