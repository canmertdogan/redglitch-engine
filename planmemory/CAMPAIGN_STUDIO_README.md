# Campaign Studio - Multi-Engine Campaign Manager

## 🎮 Overview

**Campaign Studio** is a powerful visual node-based editor for creating multi-engine game campaigns in ketebe ENGINE. It enables seamless transitions between RPG-TopDown, ISO-Pixel, and Platformer-2D engines while maintaining player state, inventory, quests, and achievements throughout the journey.

## ✨ Key Features

### Multi-Engine Support
- ✅ **3 Engine Types**: RPG-TopDown, ISO-Pixel, Platformer-2D
- ✅ **Seamless Transitions**: Switch engines mid-campaign with no data loss
- ✅ **Mixed-Engine Campaigns**: Use different engines for different levels
- ✅ **State Persistence**: Inventory, quests, achievements carry across engines

### Visual Node Editor
- ✅ **12 Node Types**: From basic levels to advanced boss rushes
- ✅ **Drag & Drop Interface**: Intuitive visual campaign building
- ✅ **Real-Time Testing**: Test campaigns directly from editor
- ✅ **Auto-Validation**: Catch errors before runtime

### Advanced Features
- ✅ **Conditional Branching**: Branch based on flags, achievements, or stats
- ✅ **Hub Worlds**: Central areas with shops, inns, multiple exits
- ✅ **Boss Rush**: Sequential boss battles across different engines
- ✅ **Mini-Games**: Timed challenges with score targets
- ✅ **Challenge Modes**: Restricted gameplay variants
- ✅ **Exploration Areas**: Open-world segments with objectives

## 📁 Project Structure

```
public/
├── engines/
│   └── shared/
│       ├── EngineAdapter.js          # Base adapter interface
│       ├── TopDownAdapter.js         # RPG engine adapter
│       ├── IsoPixelAdapter.js        # ISO engine adapter
│       ├── PlatformerAdapter.js      # Platformer engine adapter
│       ├── CampaignController.js     # Campaign orchestration
│       └── CrossEngineSerializer.js  # State serialization
├── js/
│   ├── runtime-loader.js             # Campaign runtime loader
│   └── campaign-performance-tester.js # Performance testing
├── campaign_editor.html              # Visual editor UI
├── campaign_editor.js                # Editor logic
├── campaign_test_suite.html          # Automated test suite
└── docs/
    └── campaign_studio_guide.md      # User documentation

data/
└── campaigns/
    ├── templates/                     # Campaign templates
    │   ├── empty_template.json
    │   ├── tutorial_template.json
    │   ├── branching_template.json
    │   └── hub_template.json
    ├── comprehensive_test.json        # Test campaign
    ├── linear_adventure.json          # Example: Linear
    ├── branching_paths.json           # Example: Branching
    └── hub_world_adventure.json       # Example: Hub-based
```

## 🚀 Getting Started

### Opening Campaign Studio

1. Start ketebe ENGINE launcher
2. Click **"Campaign Editor"** from main menu
3. The visual editor will open

### Creating Your First Campaign

**Quick Start (5 minutes):**

1. **Load Template**
   ```
   File → New from Template → Tutorial Template
   ```

2. **Customize**
   - Update campaign name and description
   - Replace placeholder world names
   - Modify dialogue text

3. **Add Nodes**
   - Click node tools in left sidebar
   - Place on canvas
   - Connect by setting `next` properties

4. **Test**
   - Click ▶ "Test Run" button
   - Play through campaign
   - Verify transitions work

5. **Save**
   ```
   File → Save Campaign
   Save to: data/campaigns/my_campaign.json
   ```

**Full Tutorial**: See `public/docs/campaign_studio_guide.md`

## 📚 Node Types Reference

### Basic Nodes

| Node | Purpose | Key Properties |
|------|---------|----------------|
| **START** | Campaign entry point | next |
| **LEVEL** | Playable level | engineType, world, spawnPoint |
| **DIALOGUE** | NPC conversation | speaker, text, choices |
| **BRANCH** | If/else condition | condition, trueNext, falseNext |
| **REWARD** | Give items/achievements | rewards, next |
| **CUTSCENE** | Story scene | cutsceneName, skippable |
| **IF-STATEMENT** | Multi-condition branching | conditions[], defaultNext |

### Advanced Nodes

| Node | Purpose | Key Properties |
|------|---------|----------------|
| **MINI-GAME** | Timed challenge | gameType, timeLimit, scoreTarget |
| **HUB** | Central area | exits[], shopAvailable, healPlayer |
| **CHALLENGE** | Restricted level | challengeType, restrictions[] |
| **BOSS RUSH** | Sequential bosses | bosses[], restoreHealthBetween |
| **EXPLORATION** | Open-world area | objectives[], allowEarlyExit |

## 🎯 Example Campaigns

### 1. Linear Adventure
**Pattern**: Story progression  
**Structure**: Start → Levels → Boss → Ending  
**File**: `data/campaigns/linear_adventure.json`

### 2. Branching Paths
**Pattern**: Choice-driven narrative  
**Structure**: Choices → Multiple paths → Multiple endings  
**File**: `data/campaigns/branching_paths.json`

### 3. Hub World
**Pattern**: Open-ended missions  
**Structure**: Hub → Missions (repeatable) → Final challenge  
**File**: `data/campaigns/hub_world_adventure.json`

### 4. Comprehensive Test
**Pattern**: Feature showcase  
**Structure**: All node types → All features → Multiple endings  
**File**: `data/campaigns/comprehensive_test.json`

## 🔧 Technical Architecture

### Engine Abstraction Layer

Each engine is wrapped in an adapter implementing a common interface:

```javascript
// All adapters implement:
class EngineAdapter {
  async initialize(worldData, spawnPoint)
  async loadLevel(worldName)
  update(deltaTime)
  render()
  handleInput(inputState)
  async cleanup()
  serializeState()
  deserializeState(stateData)
}
```

### Campaign Controller

Central orchestrator managing campaign flow:

```javascript
class CampaignController {
  loadCampaign(campaignData)
  startCampaign()
  processNode(node)
  setGlobalFlag(name, value)
  giveReward(rewards)
  transitionEngine(fromType, toType, worldData)
}
```

### Cross-Engine Serialization

Unified state management across all engines:

```javascript
class CrossEngineSerializer {
  static serializePlayerState(player)
  static deserializePlayerState(stateData, player)
  static serializeInventory(inventory)
  static serializeQuests(questSystem)
  static serializeAchievements(achievementSystem)
  // ... 20+ serialization methods
}
```

### State Persistence

**What Persists:**
- ✅ Inventory items
- ✅ Equipment
- ✅ Quest progress
- ✅ Achievement unlocks
- ✅ Player stats (HP, mana, stamina)
- ✅ Skills and abilities
- ✅ Global flags
- ✅ Custom data

**What Doesn't Persist:**
- ❌ Position (uses spawn points)
- ❌ Physics state
- ❌ Animation state
- ❌ Temporary buffs/cooldowns

## 🧪 Testing & Validation

### Automated Test Suite

Access at: `http://localhost:3000/campaign_test_suite.html`

**Test Categories:**
- Campaign loading & validation (3 tests)
- Engine transitions (3 tests)
- State persistence (4 tests)
- Advanced node types (5 tests)
- Conditional logic (3 tests)
- Performance benchmarks (3 tests)

**Total**: 21 automated tests

### Performance Testing

```javascript
// Programmatic performance testing
const tester = new CampaignPerformanceTester();

// Test engine loading
await tester.testEngineLoading('rpg-topdown', worldData);

// Test transitions
await tester.testEngineTransition('rpg-topdown', 'iso-pixel', playerState);

// Test serialization
tester.testSerializationPerformance(playerState, 100);

// Generate report
const report = tester.generateReport();
console.log(report);
```

### Performance Benchmarks

**Expected Performance:**
- Engine loading: < 2 seconds
- Engine transitions: < 3 seconds
- Serialization: < 100ms
- Node processing: < 50ms

## 📖 Documentation

### User Documentation
- **User Guide**: `public/docs/campaign_studio_guide.md`
- **Quick Start Tutorial**: In user guide, section 5
- **Node Type Reference**: In user guide, section 4
- **Best Practices**: In user guide, section 7
- **Troubleshooting**: In user guide, section 8

### Technical Documentation
- **Phase 1 Docs**: Engine Abstraction Layer
- **Phase 2 Docs**: Campaign Controller Core
- **Phase 3 Docs**: Enhanced Level Nodes
- **Phase 4 Docs**: Campaign Editor UI
- **Phase 5 Docs**: Server & API Updates
- **Phase 6 Docs**: Runtime Integration
- **Phase 7 Docs**: Cross-Engine Features
- **Phase 8 Docs**: Advanced Node Types
- **Phase 9 Docs**: Testing & Validation
- **Phase 10 Docs**: Documentation & Polish

All phase docs located in session files folder.

## 🛠️ Development Commands

### Running the Editor

```bash
# Start launcher (includes Campaign Editor)
npm start

# Or start web server for browser-based editing
npm run server
# Access at: http://localhost:3000/campaign_editor.html
```

### Building Campaigns

```bash
# Build campaign for all platforms
npm run build:game "ProjectName"

# Build for specific platform
npm run build:game "ProjectName" electron
npm run build:game "ProjectName" android
```

### Testing

```bash
# Open automated test suite
open http://localhost:3000/campaign_test_suite.html

# Run performance tests (browser console)
const tester = new CampaignPerformanceTester();
await tester.testEngineLoading('rpg-topdown', worldData);
```

## 🎨 Campaign Design Patterns

### Pattern 1: Linear Story
```
START → Level 1 → Level 2 → Level 3 → Boss → Ending
```
**Use For**: Tutorials, story-driven games, first campaigns

### Pattern 2: Branching Narrative
```
START → Choice
  ├─→ Path A → Ending A
  └─→ Path B → Ending B
```
**Use For**: Interactive stories, RPGs with choices, replayable content

### Pattern 3: Hub & Spoke
```
START → Hub
  ├─→ Mission 1 → Hub
  ├─→ Mission 2 → Hub
  └─→ Mission 3 → Hub → Final Mission
```
**Use For**: Open-world games, side-quests, non-linear progression

### Pattern 4: Boss Gauntlet
```
START → Boss 1 (RPG) → Boss 2 (ISO) → Boss 3 (Platformer) → Victory
```
**Use For**: Challenge modes, endgame content, skill tests

## 🔥 Advanced Techniques

### Technique 1: Flag-Based Progression

```javascript
// In reward node
{
  "rewards": {
    "flags": {
      "swords_collected": 3,
      "all_swords": true
    }
  }
}

// In branch node
{
  "condition": "flag:swords_collected >= 3",
  "trueNext": "unlock_master_sword",
  "falseNext": "keep_searching"
}
```

### Technique 2: Achievement Gates

```javascript
// Unlock content based on achievements
{
  "type": "if-statement",
  "conditions": [
    { "flag": "achievement:hero", "next": "secret_area" },
    { "flag": "achievement:speedrun", "next": "time_trial" }
  ],
  "defaultNext": "normal_path"
}
```

### Technique 3: Quest-Driven Progression

```javascript
// Check quest status
{
  "condition": "quest:main_quest:complete",
  "trueNext": "chapter_2",
  "falseNext": "must_complete_quest"
}
```

## 🐛 Common Issues & Solutions

### Issue: State Not Persisting

**Symptoms**: Inventory lost after engine transition  
**Solution**: Ensure `CrossEngineSerializer` loads before adapters in `runtime-loader.js`

### Issue: Branch Always Takes False Path

**Symptoms**: Condition never evaluates to true  
**Solution**: Check flag syntax - use `flag:name` not just `name`

### Issue: Hub Exits Not Appearing

**Symptoms**: Hub node works but no exit portals  
**Solution**: Level must implement portal logic - hub only provides exit data in metadata

### Issue: Boss Rush Won't Advance

**Symptoms**: Stuck on first boss  
**Solution**: Ensure boss triggers completion event when defeated

## 📊 Project Statistics

### Code Metrics
- **Adapters**: 3 files, ~800 lines total
- **Controllers**: 2 files, ~1100 lines
- **Serialization**: 1 file, ~390 lines
- **Editor**: 2 files, ~2500 lines
- **Tests**: 2 files, ~700 lines
- **Documentation**: 10 files, ~115 KB

### Feature Metrics
- **Node Types**: 12 total (7 basic + 5 advanced)
- **Engine Types**: 3 (RPG, ISO, Platformer)
- **Templates**: 4 (Empty, Tutorial, Branching, Hub)
- **Example Campaigns**: 4
- **Automated Tests**: 21

### Phase Completion
- ✅ Phase 1: Engine Abstraction Layer
- ✅ Phase 2: Campaign Controller Core
- ✅ Phase 3: Enhanced Level Nodes
- ✅ Phase 4: Campaign Editor UI
- ✅ Phase 5: Server & API Updates
- ✅ Phase 6: Runtime Integration
- ✅ Phase 7: Cross-Engine Features
- ✅ Phase 8: Advanced Node Types
- ✅ Phase 9: Testing & Validation
- ✅ Phase 10: Documentation & Polish

**All 10 phases complete!** 🎉

## 🤝 Contributing

Campaign Studio is feature-complete and production-ready. Future enhancements:

**Templates:**
- Boss Rush template
- Mystery/Detective template
- Racing template

**Features:**
- Visual template browser
- In-editor tutorial system
- Community template sharing
- Localization support

## 📝 License

Part of ketebe ENGINE project.

## 🎉 Acknowledgments

Campaign Studio enables game creators to build rich, multi-engine experiences with persistent player progression across diverse gameplay styles. Whether you're crafting a linear tutorial, branching narrative, hub-based adventure, or epic boss gauntlet, Campaign Studio provides the tools to bring your vision to life.

**Happy Campaign Creating!** 🎮✨

---

*Campaign Studio - Multi-Engine Game Development for ketebe ENGINE*
*Version 1.0.0 - Production Ready*
