# IRAB UI Revamp Plan: "AI Studio" Edition

**Objective:** Transform the IRAB Assistant from a "Retro Pixel Bot" into a modern, professional "AI Studio" interface, inspired by Command Palettes (Ctrl+K) and modern development tools.

## 1. Design Language & Aesthetic
*   **Vibe:** Professional, Sleek, "Cyber-Minimalism".
*   **Container:** 
    *   **Floating Modal:** Centered on screen (or slightly top-weighted) rather than a bottom-right chat window.
    *   **Backdrop:** Dark semi-transparent background with blur (`backdrop-filter: blur(10px)`).
    *   **Borders:** Thin, subtle borders (1px solid `#333`) with a glow effect on focus.
*   **Typography:** 
    *   Switch from `VT323` (Pixel) to **Inter**, **Roboto**, or System Sans-Serif.
    *   Clean, readable, high contrast.
*   **Color Palette:**
    *   Background: Deep Dark (`#0a0a0a` or `#1e1e1e`).
    *   Accent: Electric Blue (`#3498db`) or Neon Purple (`#9b59b6`) to replace the Retro Yellow (`#f1c40f`).
    *   Text: White/Light Gray.

## 2. Interaction Model ("Ctrl+K")
*   **Trigger:** 
    *   **Global Hotkey:** `Ctrl+K` (or `Cmd+K`) toggles the interface instantly.
    *   **Avatar:** (Optional) A small, modern floating icon can remain, but the primary interaction is keyboard-driven.
*   **Layout:**
    *   **Top Bar:** Search/Input field acts as the primary focus. "Ask AI or Run Command..."
    *   **Main Area:** Chat history / Results appear *below* the input bar (Command Palette style) OR standard Chat style (History above, Input below). 
        *   *Decision:* For a "Helper Bot" that does multi-turn chat, **History Above, Input Below** is better for context, even in a modal. We will use a "Spotlight Modal" layout: Header -> Chat History -> Input Footer.
*   **Animations:** Smooth fade-in/slide-down transitions.

## 3. Implementation Steps

### Phase 1: The Core UI Replacement
*   **Action:** Completely rewrite `createUI()` in `assistant.js`.
*   **CSS:** Implement the "Glassmorphism" modal styles.
*   **HTML Structure:**
    ```html
    <div id="ai-studio-overlay"> <!-- Backdrop -->
        <div id="ai-studio-modal">
            <div class="studio-header">
                <span class="icon">✨</span> AI STUDIO
                <span class="hotkey">Esc</span>
            </div>
            <div class="studio-history" id="irab-chat-log"></div>
            <div class="studio-input-area">
                <textarea id="irab-input" placeholder="Ask AI..."></textarea>
                <div class="studio-actions">
                    <button id="btn-submit">↵</button>
                </div>
            </div>
        </div>
    </div>
    ```

### Phase 2: Logic Integration
*   **Action:** Update event listeners.
*   **Hotkeys:** Bind `keydown` on `document` to listen for `Ctrl+K`.
*   **Auto-Resize:** Input textarea should auto-grow (like Linear/Slack) rather than being a single line.
*   **Code Blocks:** Style `<pre><code>` blocks with a dark theme (e.g., Dracula or One Dark) and a sleek **[Apply]** button overlay.

### Phase 3: Config & Persona
*   **Settings:** Move settings to a dedicated "Settings View" inside the modal (toggle between Chat/Settings).
*   **Persona:** Tone down the "GRRR" text. Keep it helpful and technical. "IRAB" becomes the system name, not a monster.

## 4. Technical Constraints
*   **File:** `public/assistant.js`
*   **Dependencies:** None (Vanilla JS + CSS).
*   **Platform:** Must work in Electron (Windows/Mac) and Web.

---
**Approval:** Shall we proceed with implementing this "AI Studio" design?
