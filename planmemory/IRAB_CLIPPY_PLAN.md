# IRAB: "Project Clippy" Evolution Plan

**Objective:** Evolve IRAB from a static "Chat Tool" into a proactive, animated, and slightly annoying (affectionate) **Studio Companion**. The goal is to capture the *spirit* of Clippy—presence, observation, and personality—without the actual paperclip.

## 1. Core Philosophy: "Always Watching"
Currently, IRAB waits for you to click him or press Ctrl+K.
**The Shift:** IRAB should react to what you do *before* you ask.

## 2. Feature Roadmap

### Phase 1: Reactive Animations (The Body)
*   **Concept:** The avatar shouldn't just be a static image. It should have "states".
*   **Implementation:**
    *   **Idle:** Occasional blink or bounce (Already partially implemented).
    *   **Thinking:** Spin or vibrate when processing AI.
    *   **Error:** Turn RED and shake when a console error occurs (Implemented, but can be expanded).
    *   **Typing:** Bob up and down when the user is typing in the editor.
    *   **Saving:** Do a "happy dance" or flash green when the project is saved.

### Phase 2: Proactive Suggestions (The Brain)
*   **Concept:** IRAB analyzes your actions and interrupts with a bubble *if* it thinks you're stuck or doing something cool.
*   **Triggers:**
    *   **Idle Timer:** If you haven't typed in 5 minutes -> *"Are you sleeping or thinking? I can't tell."*
    *   **Rapid Undo:** If you Ctrl+Z 5 times in a row -> *"Messing up? It happens. Want me to clear the canvas?"*
    *   **High Object Count:** If you place 100 enemies -> *"That's a lot of death. Are you sure the CPU can handle it?"*
    *   **Switching Tools:** When you open the Music Editor -> *"Time for some bleeps and bloops?"*

### Phase 3: Screen Presence (The Spirit)
*   **Concept:** Make him break the fourth wall.
*   **Draggable:** Allow the user to drag the avatar anywhere on the screen so he can "sit" on specific windows.
*   **"Knocking":** If minimized for too long, play a sound or shake the icon to get attention.
*   **Contextual Costumes:** (Stretch Goal) Wear a wizard hat in the Spell Editor, or a hard hat in the Level Editor.

## 3. Technical Requirements
*   **Event Bus Integration:** Deepen the connection with `EventBus.js` to listen for `editor:change`, `tool:open`, `object:place`.
*   **State Machine:** Implement a proper `state` property in `StudioAssistant` (IDLE, WATCHING, JUDGING, SLEEPING).
*   **Asset Pack:** We need more sprite frames for IRAB (Happy, Angry, Confused, Sleeping).

## 4. "The Annoyance Slider"
*   **Concept:** Since "Clippy" behavior can be polarizing, we will add a setting:
    *   **Level 0 (Tool):** Only speaks when spoken to.
    *   **Level 1 (Helper):** Suggests fixes for errors only.
    *   **Level 2 (Companion):** Comments on tool switches and idle times.
    *   **Level 3 (Menace):** "It looks like you're trying to make a game. Need help?" (Full Clippy).

---
**Next Step:** Would you like to start with **Phase 1 (Animations)** or **Phase 2 (Proactive Triggers)**?
