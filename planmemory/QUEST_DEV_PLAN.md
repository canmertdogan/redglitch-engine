# Quest Studio & System Development Plan

## 1. Overview
The goal is to build a fully integrated Quest System for the ONGONLUK ENGINE. This involves upgrading the **Quest Studio** (Editor) to handle complex quest logic and creating a runtime **QuestSystem** (Engine) to track progress and rewards.

## 2. Data Architecture
Quests will be stored in `dunyalar/definitions/quests.json`.

**Schema Definition:**
```json
{
  "id": "unique_quest_id",
  "title": "Display Title",
  "description": "Journal text.",
  "giverId": "npc_id_optional",
  "autoComplete": false, // If true, completes immediately when objectives are met. If false, requires talking to giver.
  "prerequisites": ["quest_id_prev"],
  "rewards": {
    "xp": 100,
    "gold": 50,
    "items": ["item_sword_1"]
  },
  "stages": [
    {
      "text": "Objective description",
      "type": "kill", // kill, collect, talk, location, trigger
      "target": "enemy_id",
      "amount": 5
    }
  ]
}
```

## 3. Quest Studio (Editor) Roadmap
**File:** `public/quest_editor.html`, `public/quest_editor.js`

### 3.1 UI/UX Overhaul
*   [ ] **Theme:** Apply Ketebe "Pixel Gold" theme (`VT323` font, `#f1c40f` accents, solid borders).
*   [ ] **Layout:** Split into "Quest Details" (Left) and "Stages/Rewards" (Right).
*   [ ] **Search:** Add search bar for the quest list.

### 3.2 Feature Implementation
*   [ ] **Prerequisites:** Multi-select dropdown to choose required quests.
*   [ ] **Rewards Editor:** Input fields for XP, Gold, and an item selector (populate from `items.json`).
*   [ ] **NPC Selector:** Dropdown for "Quest Giver" populated from `npcs.json`.
*   [ ] **Validation:** Visual warning if IDs are duplicate or targets don't exist.

## 4. Quest System (Runtime Engine) Roadmap
**File:** `public/base_game/questSystem.js` (New File)

### 4.1 Core Logic
*   [ ] **State Management:**
    *   `active`: { questId: { stage: 0, progress: 0 } }
    *   `completed`: [questId, ...]
    *   `failed`: [questId, ...]
*   [ ] **API:**
    *   `accept(questId)`: Starts the quest.
    *   `advance(questId)`: Moves to next stage.
    *   `complete(questId)`: Grants rewards.
    *   `onEvent(type, id, value)`: Global handler for game events.

### 4.2 Integration Hooks
*   [ ] **main.js:** Initialize `this.questSystem = new QuestSystem(this)`.
*   [ ] **Enemy Death:** Call `questSystem.onEvent('kill', enemyId, 1)`.
*   [ ] **Item Pickup:** Call `questSystem.onEvent('collect', itemId, qty)`.
*   [ ] **Zone Trigger:** Call `questSystem.onEvent('location', zoneId)`.
*   [ ] **Dialogue:** Integrate with `DialogueSystem` to check quest status (e.g. "Show text only if quest active").

### 4.3 UI Overlay
*   [ ] **Quest Tracker:** Small HUD overlay showing current active quest objectives.
*   [ ] **Journal:** Full screen UI (in Pause Menu) to view history.
*   [ ] **Notifications:** "Quest Started" / "Quest Completed" popups.

## 5. Execution Steps
1.  **Scaffold:** Create `questSystem.js` and register it in `main.js`.
2.  **Editor Upgrade:** Implement the new UI and fields in Quest Studio.
3.  **Event Hook:** Connect Enemy/Item systems to QuestSystem.
4.  **UI:** Build the Quest Tracker HUD.
5.  **Test:** Create a sample "Kill 3 Rats" quest and verify end-to-end flow.
