# ONGONLUK ENGINE - Editor Integration Scheme

## Overview

This document maps all 23 editors in ONGONLUK ENGINE, showing their relationships, data flows, and integration priorities. The goal is to establish which editors should work together and how they should share data through our new integration system (EventBus, SharedProjectState, AssetManager).

---

## 🎯 Editor Categories & Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           KETEBE ENGINE EDITOR ECOSYSTEM                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐          │
│  │  🎨 ASSET LAYER  │    │  👤 ENTITY LAYER │    │  📜 LOGIC LAYER  │          │
│  │  (Foundation)     │    │  (Game Objects)  │    │  (Behavior)      │          │
│  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤          │
│  │ • Pixel Editor   │───▶│ • Character Ed.  │───▶│ • Behavior Ed.   │          │
│  │ • Background Ed. │    │ • NPC Editor     │    │ • Logic Editor   │          │
│  │ • FX Editor      │    │ • Enemy Editor   │    │ • Algorithm Ed.  │          │
│  │ • Shader Editor  │    │ • Item Editor    │    │ • Script Editor  │          │
│  │ • DAW (Audio)    │    │ • Skill Editor   │    │                  │          │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘          │
│           │                      │                       │                       │
│           │                      │                       │                       │
│           ▼                      ▼                       ▼                       │
│  ┌────────────────────────────────────────────────────────────────────┐        │
│  │                    🎬 NARRATIVE LAYER (Story & Content)            │        │
│  ├────────────────────────────────────────────────────────────────────┤        │
│  │  • Dialogue Editor  • Quest Editor  • Cutscene Studio              │        │
│  │  • Campaign Editor  • Achievements Editor                          │        │
│  └────────────────────────────────────────────────────────────────────┘        │
│                                    │                                             │
│                                    ▼                                             │
│  ┌────────────────────────────────────────────────────────────────────┐        │
│  │                    🌍 WORLD LAYER (Environment)                    │        │
│  ├────────────────────────────────────────────────────────────────────┤        │
│  │  • ISO Editor (Isometric)  • Prefab Editor  • World Editor (TBD)   │        │
│  └────────────────────────────────────────────────────────────────────┘        │
│                                    │                                             │
│                                    ▼                                             │
│  ┌────────────────────────────────────────────────────────────────────┐        │
│  │                    🔧 SYSTEM LAYER (Global)                        │        │
│  ├────────────────────────────────────────────────────────────────────┤        │
│  │  • Menu Editor  • Input Editor  • Localization Editor              │        │
│  └────────────────────────────────────────────────────────────────────┘        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔗 Editor Dependency Matrix

### Data Flow Direction: `Producer → Consumer`

| Producer Editor | Consumer Editors | Shared Data Type |
|----------------|------------------|------------------|
| **Pixel Editor** | Character, NPC, Enemy, Item, Background, FX | Sprites, Animations |
| **Character Editor** | NPC, Enemy, Quest, Dialogue, Cutscene, Campaign | Character definitions |
| **Item Editor** | Quest, Character (inventory), Skill, Achievements | Item definitions |
| **Skill Editor** | Character, Enemy, FX, Achievements | Skill definitions |
| **NPC Editor** | Quest, Dialogue, Cutscene, World | NPC definitions |
| **Enemy Editor** | Quest, Behavior, World | Enemy definitions |
| **Dialogue Editor** | Quest, Cutscene, NPC, Localization | Dialogue trees |
| **Quest Editor** | Campaign, Achievements, Dialogue | Quest definitions |
| **Background Editor** | Cutscene, World, ISO Editor | Background images |
| **FX Editor** | Skill, Cutscene, Shader | Visual effects |
| **DAW (Audio)** | Cutscene, World, Menu | Audio tracks |
| **Behavior Editor** | NPC, Enemy, Logic | AI behaviors |
| **Logic Editor** | Quest, Behavior, Campaign, Script | Game logic |
| **Localization Editor** | ALL TEXT-BASED EDITORS | Translations |
| **Input Editor** | ALL EDITORS | Control mappings |

---

## 🎯 Integration Priority Groups

### 🔴 **Priority 1: Core Entity Cluster** (Immediate)
These editors share the most data and should be integrated first.

```
                    ┌─────────────────┐
                    │ CHARACTER EDITOR │
                    │   (Central Hub)  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  NPC EDITOR   │    │ ENEMY EDITOR  │    │ SKILL EDITOR  │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   ITEM EDITOR   │
                    └─────────────────┘
```

**EventBus Events:**
- `character:created` / `character:updated` / `character:deleted`
- `npc:created` / `npc:updated` / `npc:deleted`
- `enemy:created` / `enemy:updated` / `enemy:deleted`
- `skill:created` / `skill:updated` / `skill:deleted`
- `item:created` / `item:updated` / `item:deleted`

**SharedProjectState Paths:**
- `characters.{id}` - Character definitions
- `npcs.{id}` - NPC definitions
- `enemies.{id}` - Enemy definitions
- `skills.{id}` - Skill definitions
- `items.{id}` - Item definitions

---

### 🟠 **Priority 2: Narrative Cluster** (High)
Story-driven editors that reference entities.

```
┌─────────────────────────────────────────────────────────────┐
│                     NARRATIVE CLUSTER                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    ┌─────────────┐         ┌─────────────────────┐          │
│    │   QUEST     │◀───────▶│  CUTSCENE STUDIO    │          │
│    │   EDITOR    │         │  (Interactive)       │          │
│    └──────┬──────┘         └──────────┬──────────┘          │
│           │                           │                      │
│           ▼                           ▼                      │
│    ┌─────────────┐         ┌─────────────────────┐          │
│    │  DIALOGUE   │◀───────▶│    CAMPAIGN         │          │
│    │   EDITOR    │         │     EDITOR          │          │
│    └──────┬──────┘         └──────────┬──────────┘          │
│           │                           │                      │
│           └───────────┬───────────────┘                      │
│                       ▼                                      │
│              ┌─────────────────┐                             │
│              │  ACHIEVEMENTS   │                             │
│              │     EDITOR      │                             │
│              └─────────────────┘                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**EventBus Events:**
- `quest:created` / `quest:updated` / `quest:completed`
- `cutscene:created` / `cutscene:saved` / `cutscene:play`
- `dialogue:created` / `dialogue:updated`
- `campaign:created` / `campaign:chapter:added`
- `achievement:created` / `achievement:unlocked`

**Cross-Editor Scenarios:**
1. Quest Editor requests available NPCs → NPC Editor responds
2. Cutscene Studio loads character animations → Character Editor provides
3. Dialogue Editor validates speaker → NPC/Character Editor confirms
4. Campaign Editor orders quests → Quest Editor provides list

---

### 🟡 **Priority 3: Asset Cluster** (Medium)
Visual and audio asset creation tools.

```
┌─────────────────────────────────────────────────────────────┐
│                      ASSET CLUSTER                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    ┌─────────────┐         ┌─────────────┐                  │
│    │   PIXEL     │────────▶│ BACKGROUND  │                  │
│    │   EDITOR    │         │   EDITOR    │                  │
│    └──────┬──────┘         └─────────────┘                  │
│           │                                                  │
│           ▼                                                  │
│    ┌─────────────┐         ┌─────────────┐                  │
│    │     FX      │◀───────▶│   SHADER    │                  │
│    │   EDITOR    │         │   EDITOR    │                  │
│    └─────────────┘         └─────────────┘                  │
│                                                              │
│    ┌─────────────────────────────────────┐                  │
│    │              DAW                     │                  │
│    │     (Digital Audio Workstation)      │                  │
│    └─────────────────────────────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**EventBus Events:**
- `asset:sprite:created` / `asset:sprite:updated`
- `asset:animation:created` / `asset:animation:updated`
- `asset:audio:created` / `asset:audio:updated`
- `asset:shader:created` / `asset:shader:updated`
- `asset:fx:created` / `asset:fx:updated`

**AssetManager Integration:**
- All asset editors register created assets with AssetManager
- Other editors query AssetManager for available assets
- File changes trigger automatic asset refresh

---

### 🟢 **Priority 4: Logic Cluster** (Medium)
Programming and behavior tools.

```
┌─────────────────────────────────────────────────────────────┐
│                      LOGIC CLUSTER                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    ┌─────────────┐         ┌─────────────┐                  │
│    │  BEHAVIOR   │◀───────▶│    LOGIC    │                  │
│    │   EDITOR    │         │   EDITOR    │                  │
│    └──────┬──────┘         └──────┬──────┘                  │
│           │                       │                          │
│           └───────────┬───────────┘                          │
│                       ▼                                      │
│    ┌─────────────┐         ┌─────────────┐                  │
│    │  ALGORITHM  │◀───────▶│   SCRIPT    │                  │
│    │   EDITOR    │         │   EDITOR    │                  │
│    └─────────────┘         └─────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**EventBus Events:**
- `behavior:created` / `behavior:updated`
- `logic:created` / `logic:updated`
- `algorithm:created` / `algorithm:updated`
- `script:created` / `script:updated` / `script:error`

---

### 🔵 **Priority 5: World & System Cluster** (Lower)
Environment and global settings.

```
┌─────────────────────────────────────────────────────────────┐
│                   WORLD & SYSTEM CLUSTER                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  WORLD EDITORS:              SYSTEM EDITORS:                 │
│  ┌─────────────┐            ┌─────────────┐                 │
│  │ ISO EDITOR  │            │    MENU     │                 │
│  │ (Isometric) │            │   EDITOR    │                 │
│  └─────────────┘            └─────────────┘                 │
│                                                              │
│  ┌─────────────┐            ┌─────────────┐                 │
│  │   PREFAB    │            │    INPUT    │                 │
│  │   EDITOR    │            │   EDITOR    │                 │
│  └─────────────┘            └─────────────┘                 │
│                                                              │
│                             ┌─────────────────┐             │
│                             │  LOCALIZATION   │             │
│                             │     EDITOR      │             │
│                             └─────────────────┘             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Complete Integration Map

```
                                    ┌─────────────────┐
                                    │  LOCALIZATION   │ ◀──── ALL TEXT EDITORS
                                    │     EDITOR      │
                                    └────────┬────────┘
                                             │
┌────────────────────────────────────────────┼────────────────────────────────────────────┐
│                                            │                                             │
│  ┌──────────────┐    ┌──────────────┐     │     ┌──────────────┐    ┌──────────────┐   │
│  │    PIXEL     │───▶│  CHARACTER   │◀────┼────▶│    QUEST     │───▶│   CAMPAIGN   │   │
│  │    EDITOR    │    │    EDITOR    │     │     │    EDITOR    │    │    EDITOR    │   │
│  └──────┬───────┘    └──────┬───────┘     │     └──────┬───────┘    └──────┬───────┘   │
│         │                   │             │            │                   │            │
│         ▼                   ▼             │            ▼                   │            │
│  ┌──────────────┐    ┌──────────────┐     │     ┌──────────────┐          │            │
│  │  BACKGROUND  │    │  NPC EDITOR  │◀────┼────▶│   DIALOGUE   │◀─────────┘            │
│  │    EDITOR    │    └──────┬───────┘     │     │    EDITOR    │                       │
│  └──────┬───────┘           │             │     └──────┬───────┘                       │
│         │                   │             │            │                                │
│         │            ┌──────┴───────┐     │            │                                │
│         │            │ ENEMY EDITOR │     │            │                                │
│         │            └──────┬───────┘     │            │                                │
│         │                   │             │            │                                │
│         │            ┌──────┴───────┐     │            │                                │
│         │            │ SKILL EDITOR │◀────┼────────────┤                                │
│         │            └──────┬───────┘     │            │                                │
│         │                   │             │            │                                │
│         │            ┌──────┴───────┐     │            │                                │
│         │            │  ITEM EDITOR │◀────┼────────────┘                                │
│         │            └──────────────┘     │                                             │
│         │                                 │                                             │
│         ▼                                 │                                             │
│  ┌──────────────┐                        │     ┌──────────────────────────────────┐    │
│  │   FX EDITOR  │◀───────────────────────┼────▶│       CUTSCENE STUDIO            │    │
│  └──────┬───────┘                        │     │   (Interactive Cutscene Editor)   │    │
│         │                                │     └──────────────────────────────────┘    │
│         ▼                                │                    ▲                        │
│  ┌──────────────┐                        │                    │                        │
│  │SHADER EDITOR │                        │     ┌──────────────┴───────┐                │
│  └──────────────┘                        │     │         DAW          │                │
│                                          │     │   (Audio Workstation) │                │
│                                          │     └──────────────────────┘                │
│                                          │                                             │
│  ┌──────────────┐    ┌──────────────┐   │     ┌──────────────┐    ┌──────────────┐   │
│  │  BEHAVIOR    │◀──▶│    LOGIC     │   │     │  ISO EDITOR  │◀──▶│   PREFAB     │   │
│  │    EDITOR    │    │    EDITOR    │   │     │  (Isometric)  │    │    EDITOR    │   │
│  └──────────────┘    └──────┬───────┘   │     └──────────────┘    └──────────────┘   │
│                             │           │                                             │
│                      ┌──────┴───────┐   │     ┌──────────────┐    ┌──────────────┐   │
│                      │  ALGORITHM   │   │     │    MENU      │    │    INPUT     │   │
│                      │    EDITOR    │   │     │    EDITOR    │    │    EDITOR    │   │
│                      └──────┬───────┘   │     └──────────────┘    └──────────────┘   │
│                             │           │                                             │
│                      ┌──────┴───────┐   │     ┌──────────────┐                       │
│                      │   SCRIPT     │   │     │ ACHIEVEMENTS │                       │
│                      │    EDITOR    │   │     │    EDITOR    │                       │
│                      └──────────────┘   │     └──────────────┘                       │
│                                         │                                             │
└─────────────────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 🔧 Implementation Checklist

### Phase 1: Core Entity Cluster ✅ COMPLETE
- [x] **Character Editor** - Add EventBus integration
  - Broadcast: `character:*` events
  - Listen: `skill:updated`, `item:updated`
  - State: `characters.{id}`
  
- [x] **NPC Editor** - Add EventBus integration
  - Broadcast: `npc:*` events
  - Listen: `character:updated`, `dialogue:updated`
  - State: `npcs.{id}`
  
- [x] **Enemy Editor** - Add EventBus integration
  - Broadcast: `enemy:*` events
  - Listen: `character:updated`, `skill:updated`, `behavior:updated`
  - State: `enemies.{id}`
  
- [x] **Item Editor** - Add EventBus integration
  - Broadcast: `item:*` events
  - Listen: `skill:updated`
  - State: `items.{id}`
  
- [x] **Skill Editor** - Add EventBus integration
  - Broadcast: `skill:*` events
  - Listen: `fx:updated`
  - State: `skills.{id}`

### Phase 2: Narrative Cluster ⏳
- [x] **Cutscene Studio** - ✅ INTEGRATED
- [ ] **Quest Editor** - Add EventBus integration
- [ ] **Dialogue Editor** - Add EventBus integration
- [ ] **Campaign Editor** - Add EventBus integration
- [ ] **Achievements Editor** - Add EventBus integration

### Phase 3: Asset Cluster ⏳
- [ ] **Pixel Editor** - Add AssetManager integration
- [ ] **Background Editor** - Add AssetManager integration
- [ ] **FX Editor** - Add AssetManager integration
- [ ] **Shader Editor** - Add AssetManager integration
- [ ] **DAW** - Add AssetManager integration

### Phase 4: Logic Cluster ⏳
- [ ] **Behavior Editor** - Add EventBus integration
- [ ] **Logic Editor** - Add EventBus integration
- [ ] **Algorithm Editor** - Add EventBus integration
- [ ] **Script Editor** - Add EventBus integration

### Phase 5: World & System Cluster ⏳
- [ ] **ISO Editor** - Add full integration
- [ ] **Prefab Editor** - Add full integration
- [ ] **Menu Editor** - Add full integration
- [ ] **Input Editor** - Add full integration
- [ ] **Localization Editor** - Add full integration

---

## 📝 Event Naming Convention

```
{domain}:{action}[:{detail}]

Examples:
- character:created
- character:updated
- character:deleted
- character:stat:changed
- quest:objective:completed
- cutscene:play:started
- asset:sprite:loaded
```

---

## 🗂️ SharedProjectState Structure

```json
{
  "characters": {
    "{id}": { "name": "", "stats": {}, "sprites": [], "skills": [] }
  },
  "npcs": {
    "{id}": { "characterId": "", "dialogue": "", "location": {} }
  },
  "enemies": {
    "{id}": { "characterId": "", "behavior": "", "drops": [] }
  },
  "items": {
    "{id}": { "name": "", "type": "", "stats": {}, "sprite": "" }
  },
  "skills": {
    "{id}": { "name": "", "type": "", "effects": [], "fx": "" }
  },
  "quests": {
    "{id}": { "name": "", "objectives": [], "rewards": [] }
  },
  "dialogues": {
    "{id}": { "speaker": "", "nodes": [], "conditions": [] }
  },
  "cutscenes": {
    "{id}": { "name": "", "timeline": {}, "branches": {} }
  },
  "campaigns": {
    "{id}": { "name": "", "chapters": [], "quests": [] }
  },
  "assets": {
    "sprites": {},
    "audio": {},
    "backgrounds": {},
    "fx": {}
  },
  "world": {
    "maps": {},
    "prefabs": {}
  },
  "settings": {
    "input": {},
    "localization": {},
    "menu": {}
  }
}
```

---

## 🎯 Quick Reference: "Which Editor Needs What?"

| When Editing... | You Need Data From... |
|-----------------|----------------------|
| NPC | Character, Dialogue |
| Enemy | Character, Skill, Behavior |
| Quest | NPC, Item, Dialogue, Character |
| Cutscene | Character, Dialogue, Audio, Background |
| Campaign | Quest, Cutscene, World |
| Dialogue | Character, NPC, Localization |
| Skill | FX, Item (for drops) |
| World/ISO | Prefab, Character, NPC, Enemy, Item |

---

## 🚀 Next Steps

1. **Implement Core Entity Cluster first** - These editors have the highest data interdependency
2. **Add dropdown population** - Each editor should auto-populate dropdowns from SharedProjectState
3. **Add validation** - Warn when referenced entities are deleted
4. **Add live preview** - Show character in quest editor, etc.
5. **Add bulk operations** - Update all references when entity ID changes
