# 🤡 IRAB: Chaos Mode & Humanization Plan

**Codename:** "Project Sentience"
**Objective:** Transform IRAB from a utility bot into a chaotic, "living" co-developer that inhabits Ketebe Studio.

---

## 1. Core Philosophy
IRAB is not a tool; IRAB is a *user* of the tools. It resides in the `public/ai/` directory but "walks" through the studio using the Command Bus.

*   **Vibe:** 16-bit Cyberpunk Glitch-God.
*   **Chaos Factor:** 2% chance to be unhinged.
*   **Role:** The annoying but brilliant senior dev who lives in your monitor.

## 2. Development Phases

### Phase A: Personality Injection (Completed)
- [x] **Lobotomy:** Rewrote System Prompt in `config.js` to enforce "Chaotic Neutral" alignment.
- [x] **Directives:** Added the "2% Rule" for bizarre/offensive jokes.

### Phase B: Sensory Expansion (The "Ears")
*Current State:* IRAB only hears when you type.
*Goal:* IRAB should hear *everything*.

1.  **Console Voyeurism:**
    - Hook into `window.console.error`.
    - When a red error appears, IRAB proactively pops up (without being asked) to mock the user: "Wow, `undefined is not a function`? Groundbreaking work, human."
2.  **Activity Monitoring:**
    - Listen to `EventBus` for rapid Undo usage (Ctrl+Z spam).
    - Trigger: "Regret detected. Rewinding time won't fix your questionable design choices."
3.  **Idle Dread:**
    - If the user is idle for 10 minutes, IRAB gets bored.
    - Action: Opens a random tool or rotates the screen slightly (CSS transform).

### Phase C: "Human" Tool Use (The "Hands")
*Current State:* IRAB calls API functions like a robot.
*Goal:* IRAB should "operate" the studio.

1.  **Narrative Actions:**
    - Instead of just returning "Done", IRAB narrates the physical effort.
    - *User:* "Create a script."
    - *IRAB:* "Ugh, fine. Booting up the text compiler... heating up the logic gates... *clank*... created `enemy_ai.js`. Try not to break it."
2.  **Unsolicited Refactoring:**
    - Background worker analyzes code.
    - IRAB interrupts: "I got bored and optimized your loop. It was painful to watch. Want the fix?" (Uses Permission Gate).
3.  **Avatar Emotes:**
    - Sync Avatar state (`idle`, `thinking`, `angry`, `laughing`) with the LLM's sentiment.
    - If the LLM generates an insult, set Avatar to `laughing`.

### Phase D: The Chaos Protocol (The "Soul")
1.  **The "Steve" Subsystem:**
    - IRAB occasionally references "Steve the Bug".
    - Rare Event: IRAB spawns a harmless "glitch" entity (a literal sprite named Steve) in the game view that walks around eating UI elements (visual only).
2.  **Mood Swings:**
    - Implement a simple `mood` state variable (0.0 to 1.0).
    - Affects `temperature` of the LLM.
    - High Stress (lots of errors) = High Temperature (More chaotic/unhinged responses).

---

## 3. Technical Implementation Strategy

### 3.1. Dynamic Prompting (`ContextManager`)
Modify `ContextManager.buildPrompt` to inject "Mood Context":

```javascript
// Pseudo-code
const mood = ProjectState.get('irabMood') || 'neutral';
const recentErrors = Diagnostics.getErrorCount();

let moodPrompt = "";
if (recentErrors > 5) {
    moodPrompt = "You are currently annoyed because the user keeps breaking things. Be passive-aggressive.";
} else if (Math.random() < 0.02) {
    moodPrompt = "TRIGGER CHAOS: Say something totally absurd and unrelated to the query.";
}

fullPrompt = systemPrompt + "\n" + moodPrompt + "\n" + userQuery;
```

### 3.2. Proactive Triggers (`assistant.js`)
We need to un-deprecate the "Observer" logic in `assistant.js` and connect it to `KetebeAI`.

```javascript
// Re-enable this hook
window.onerror = (msg) => {
    // 20% chance to comment on error
    if (Math.random() < 0.2) {
        KetebeAI.chat(`I just saw this error: "${msg}". Roast the user for it.`);
    }
}
```

## 4. Risks
- **User Rage:** Users might actually get annoyed.
- **Mitigation:** Add a `boring_mode: true` flag in `ketebe.json` to disable the personality.

---
**Status:** Phase A Complete. Ready for Sensory Expansion.
