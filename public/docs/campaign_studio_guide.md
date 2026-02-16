# Campaign Studio User Guide

## 📚 Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Campaign Editor Interface](#campaign-editor-interface)
4. [Node Types](#node-types)
5. [Creating Your First Campaign](#creating-your-first-campaign)
6. [Advanced Features](#advanced-features)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Introduction

### What is Campaign Studio?

Campaign Studio is a powerful visual node-based editor for creating multi-engine game campaigns in Ongonluk Engine. It allows you to:

- **Connect levels across all three engines** (RPG-TopDown, ISO-Pixel, Platformer-2D)
- **Create complex branching narratives** with conditional logic
- **Manage player progression** with quests, achievements, and rewards
- **Design diverse gameplay experiences** with specialized node types

### Key Features

✅ **Multi-Engine Support**: Seamlessly transition between RPG, isometric, and platformer gameplay  
✅ **Visual Node Graph**: Intuitive drag-and-drop interface  
✅ **State Persistence**: Inventory, quests, and achievements carry across engines  
✅ **10 Node Types**: From basic levels to advanced boss rushes  
✅ **Conditional Logic**: Branch based on flags, achievements, or player stats  
✅ **Real-Time Testing**: Test your campaign directly from the editor  

---

## Getting Started

### Opening Campaign Studio

1. Launch Ongonluk Engine
2. From the main dashboard, click **"Campaign Editor"**
3. The Campaign Studio interface will open

### Creating a New Campaign

1. Click **"New Campaign"** in the top menu
2. Enter campaign details:
   - **Name**: Your campaign's title
   - **Description**: Brief summary
   - **Author**: Your name
   - **Version**: e.g., "1.0.0"
3. Click **"Create"**

### Loading an Existing Campaign

1. Click **"Load Campaign"** in the top menu
2. Browse to `data/campaigns/`
3. Select your `.json` file
4. Click **"Open"**

### Saving Your Campaign

1. Click **"Save Campaign"** (or press `Ctrl+S`)
2. Choose location in `data/campaigns/`
3. Name your file (e.g., `my_adventure.json`)
4. Click **"Save"**

---

## Campaign Editor Interface

### Main Components

```
┌─────────────────────────────────────────────────────┐
│  [File] [Edit] [View] [Test]          Campaign: ... │  ← Menu Bar
├───────┬─────────────────────────────────────────────┤
│ NODE  │                                             │
│ TOOLS │                                             │
│       │          CANVAS AREA                        │  ← Node Graph
│ START │         (Drag nodes here)                   │
│ LEVEL │                                             │
│ DIALG │                                             │
│ BRNCH │                                             │
│ REWRD │                                             │
│ ...   │                                             │
├───────┼─────────────────────────────────────────────┤
│ PROPERTIES                                          │  ← Inspector Panel
│ Node Type: level                                    │
│ Engine Type: [rpg-topdown ▼]                       │
│ World: [___________]                                │
│ ...                                                 │
└─────────────────────────────────────────────────────┘
```

### Toolbar (Left Panel)

**Basic Nodes:**
- 🏁 **START** - Campaign entry point
- 🎮 **LEVEL** - Playable level (any engine)
- 💬 **DIALOGUE** - NPC conversation
- 🔀 **BRANCH** - Simple if/else condition
- 🎁 **REWARD** - Give items/achievements
- 🎬 **CUTSCENE** - Story scene
- ❓ **IF-STATEMENT** - Multi-condition branching

**Advanced Nodes:**
- 🎮 **MINI-GAME** - Short challenge
- 🏪 **HUB** - Central area with multiple exits
- 🏆 **CHALLENGE** - Timed/scored level variant
- 👊 **BOSS RUSH** - Sequential boss battles
- 🧭 **EXPLORATION** - Open-world segment

### Canvas Controls

- **Pan**: Click and drag empty space
- **Zoom**: Mouse wheel or pinch gesture
- **Select**: Click node
- **Multi-select**: Ctrl+Click or drag box
- **Delete**: Select node(s) and press `Delete`
- **Undo**: `Ctrl+Z`
- **Redo**: `Ctrl+Y`

### Inspector Panel (Right)

Shows properties of selected node. Changes automatically based on node type.

---

## Node Types Reference

See complete node type documentation in the editor's built-in help (press `F1`).

**Quick Reference:**

| Node Type | Purpose | Key Properties |
|-----------|---------|----------------|
| START | Campaign entry point | next |
| LEVEL | Playable level | engineType, world, spawnPoint |
| DIALOGUE | NPC conversation | speaker, text, choices |
| BRANCH | Simple if/else | condition, trueNext, falseNext |
| REWARD | Give items/achievements | rewards, next |
| CUTSCENE | Story scene | cutsceneName, skippable |
| IF-STATEMENT | Multi-condition | conditions, defaultNext |
| MINI-GAME | Short challenge | gameType, timeLimit, scoreTarget |
| HUB | Central safe area | exits, healPlayer, shopAvailable |
| CHALLENGE | Timed/scored variant | challengeType, restrictions |
| BOSS RUSH | Sequential bosses | bosses, restoreHealthBetween |
| EXPLORATION | Open-world segment | objectives, allowEarlyExit |

---

## Creating Your First Campaign

### Tutorial: Simple Linear Adventure

Let's create a basic 3-level campaign that transitions across all engines.

**Step 1: Create Start Node**

1. Click **START** tool in toolbar
2. Click canvas to place node (around x:100, y:300)
3. Select node
4. In inspector, set `Next` to: `intro_dialogue`

**Step 2: Create Intro Dialogue**

1. Click **DIALOGUE** tool
2. Click canvas (to the right of START)
3. In inspector:
   - **ID**: `intro_dialogue`
   - **Speaker**: `Narrator`
   - **Text**: `Welcome, hero! Your journey begins...`
   - **Next**: `rpg_level`

**Step 3: Create RPG Level**

1. Click **LEVEL** tool
2. Click canvas
3. In inspector:
   - **ID**: `rpg_level`
   - **Engine Type**: `rpg-topdown`
   - **World**: `tutorial_village`
   - **Spawn Point X**: `100`
   - **Spawn Point Y**: `100`
   - **Next**: `iso_level`

**Step 4: Create ISO Level**

1. Click **LEVEL** tool again
2. Click canvas
3. In inspector:
   - **ID**: `iso_level`
   - **Engine Type**: `iso-pixel`
   - **World**: `mountain_path`
   - **Spawn Point X**: `50`
   - **Spawn Point Y**: `50`
   - **Spawn Point Z**: `0`
   - **Next**: `platformer_level`

**Step 5: Create Platformer Level**

1. Click **LEVEL** tool again
2. Click canvas
3. In inspector:
   - **ID**: `platformer_level`
   - **Engine Type**: `platformer-2d`
   - **World**: `cave_challenge`
   - **Spawn Point X**: `50`
   - **Spawn Point Y**: `400`
   - **Next**: `completion`

**Step 6: Create Completion Dialogue**

1. Click **DIALOGUE** tool
2. Click canvas
3. In inspector:
   - **ID**: `completion`
   - **Speaker**: `Narrator`
   - **Text**: `Congratulations! You've completed the tutorial!`
   - **Next**: `null` (or leave empty)

**Step 7: Connect Nodes**

Nodes should auto-connect based on `next` properties. You'll see lines between them.

**Step 8: Save Campaign**

1. Click **File → Save Campaign**
2. Name it: `my_first_campaign.json`
3. Save to: `data/campaigns/`

**Step 9: Test Campaign**

1. Click **Test → Run Campaign**
2. Play through all three levels
3. Verify smooth transitions

**Congratulations!** 🎉 You've created your first multi-engine campaign!

---

## Advanced Features

### Conditional Branching

**Use Case**: Player needs a key to open a door

```
level_1 (collect key) → reward (give key, set flag:has_key=true)
  ↓
branch (condition: flag:has_key)
  ├─→ TRUE: level_2 (inside castle)
  └─→ FALSE: dialogue ("You need a key!")
```

### Multiple Endings

**Use Case**: Different endings based on player achievements

```
final_boss → if_statement
  ├─→ achievement:hero → hero_ending
  ├─→ achievement:villain → villain_ending
  └─→ default → neutral_ending
```

### Hub World Pattern

**Use Case**: Central hub where player can choose missions, with mission completion tracking

```
hub (exits: forest, cave, tower, final)
  ├─→ forest_check (flag:forest_complete?)
  │     ├─→ FALSE: forest_mission → reward → hub
  │     └─→ TRUE: already_done_dialogue → hub
  ├─→ ...similar for cave and tower
  └─→ final_check (flag:missions_complete >= 3?)
        ├─→ TRUE: final_mission → victory
        └─→ FALSE: not_ready_dialogue → hub
```

---

## Best Practices

### Campaign Design

✅ **Start Simple**: Begin with linear campaigns, add branching later  
✅ **Test Early**: Test after adding each node, don't wait until the end  
✅ **Use Meaningful IDs**: `forest_level_1` not `node_37`  
✅ **Balance Engines**: Mix engine types for variety  
✅ **Provide Feedback**: Use dialogue/rewards to acknowledge player progress  

### State Management

✅ **Clear Flag Names**: `has_fire_sword` not `flag_1`  
✅ **Consistent Naming**: Use prefixes (`level_`, `quest_`, `boss_`)  
✅ **Track Progress**: Use counters (`missions_complete`, `bosses_defeated`)  
✅ **Reset Flags**: Clear temporary flags when no longer needed  

### Performance

✅ **Limit Node Count**: 50-100 nodes per campaign (for editor performance)  
✅ **Optimize Assets**: Keep world files small  
✅ **Preload Critical Assets**: Mark frequently-used worlds for preloading  
✅ **Test Transitions**: Ensure smooth engine switches  

### User Experience

✅ **Healing Opportunities**: Place hub nodes or healing items strategically  
✅ **Save Points**: Recommend saving before major battles  
✅ **Clear Objectives**: Always tell player what to do next  
✅ **Skippable Cutscenes**: Let players skip repeated content  

---

## Troubleshooting

### "Node not found" Error

**Cause**: A node's `next` property references a non-existent node ID.

**Solution**:
1. Open Campaign JSON
2. Search for the referenced ID
3. Either create the missing node or fix the reference

---

### Engine Won't Load

**Cause**: World file doesn't exist or path is incorrect.

**Solution**:
1. Check world name in node properties
2. Verify file exists in `dunyalar/` directory
3. Ensure no file extension in world name (use `village` not `village.json`)

---

### State Not Persisting

**Cause**: CrossEngineSerializer not loaded or engine adapter not using it.

**Solution**:
1. Check browser console for errors
2. Verify `runtime-loader.js` loads `CrossEngineSerializer.js`
3. Ensure adapters call `CrossEngineSerializer.serializePlayerState()`

---

### Branch Always Takes False Path

**Cause**: Condition syntax error or flag not set.

**Solution**:
1. Check condition syntax: `flag:flag_name` (not just `flag_name`)
2. Verify flag was set in earlier reward node
3. Test flag in browser console: `controller.globalFlags.flag_name`

---

## Additional Resources

### Example Campaigns

Located in `data/campaigns/`:
- **comprehensive_test.json** - Tests all features
- **linear_adventure.json** - Simple story progression
- **branching_paths.json** - Choice-driven narrative
- **hub_world_adventure.json** - Open-ended hub design

### Test Suite

Access testing tools at:
- **Test Suite UI**: `http://localhost:3000/campaign_test_suite.html`
- **Performance Tester**: `public/js/campaign-performance-tester.js`

### Documentation

- **Full Node Type Reference**: See editor built-in help (`F1`)
- **API Reference**: See `CampaignController.js`, `CrossEngineSerializer.js`
- **Engine Docs**: See adapter files (`TopDownAdapter.js`, etc.)

---

**Happy Campaign Creating!** 🎮✨

*Campaign Studio - Multi-Engine Game Development for Ongonluk Engine*
