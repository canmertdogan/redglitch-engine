# 3D Engine Campaign Integration - Developer Guide

## Overview

This guide explains how the 3D engines (topdown-3d, fps-3d, platformer-3d) integrate with the Ketebe campaign runtime system, enabling seamless transitions between 2D and 3D gameplay within a single campaign.

## Architecture

### Component Layers

```
Campaign Runtime (HTML/UI)
        ↓
CampaignController (campaign flow orchestration)
        ↓
Engine Adapters (uniform interface for all engines)
        ↓
3D Strategies (engine-specific logic)
        ↓
3D Game Engines (Three.js-based game loops)
```

### File Structure

```
public/
├── campaign_runtime.html           # Main campaign UI
├── engines/
│   ├── shared/
│   │   ├── EngineAdapter.js       # Base adapter interface
│   │   ├── CampaignController.js  # Campaign orchestrator
│   │   ├── Engine3DAdapter.js     # 3D engine base class
│   │   ├── Renderer3D.js          # Shared 3D renderer
│   │   ├── Physics3DWorld.js      # Shared physics (cannon-es)
│   │   ├── Camera3DController.js  # Shared camera system
│   │   ├── Input3D.js             # Shared input handling
│   │   ├── AudioSpatial3D.js      # 3D spatial audio
│   │   └── [10+ more shared systems]
│   │
│   ├── topdown-3d/
│   │   ├── main.js                # TopDownGame3D (ES module)
│   │   ├── TopDown3DAdapter.js    # Campaign adapter
│   │   ├── TopDown3DStrategy.js   # Strategy pattern
│   │   └── [12 system files]
│   │
│   ├── fps-3d/
│   │   ├── main.js                # FPSGame (ES module)
│   │   ├── FPS3DAdapter.js        # Campaign adapter
│   │   ├── FPS3DStrategy.js       # Strategy pattern
│   │   └── [11 system files]
│   │
│   └── platformer-3d/
│       ├── main.js                # Platformer3DGame (ES module)
│       ├── Platformer3DAdapter.js # Campaign adapter
│       ├── Platformer3DStrategy.js# Strategy pattern
│       └── [10 system files]
│
└── lib/
    ├── three.min.js               # Three.js core
    ├── cannon-es/                 # Physics library
    └── three/examples/jsm/        # Three.js addons
```

## How It Works

### 1. Campaign Initialization

When campaign_runtime.html loads:

1. **Load Dependencies**:
   ```html
   <!-- Vendors -->
   <script src="lib/three.min.js"></script>
   <script src="lib/cannon-es/cannon-es.js"></script>
   
   <!-- Three.js addons as module -->
   <script type="module">
     import { EffectComposer, RenderPass, ... } from '/lib/three/...';
     window.THREE_ADDONS = { EffectComposer, RenderPass, ... };
   </script>
   
   <!-- Adapters -->
   <script src="engines/topdown-3d/TopDown3DAdapter.js"></script>
   <script src="engines/fps-3d/FPS3DAdapter.js"></script>
   <script src="engines/platformer-3d/Platformer3DAdapter.js"></script>
   ```

2. **Create Campaign Controller**:
   ```javascript
   campaignController = new CampaignController();
   await campaignController.initialize(username, slotId);
   await campaignController.loadCampaign(campaignId);
   ```

### 2. Engine Switching

When a campaign node requires a different engine:

```javascript
// In CampaignController._switchEngine(newEngineType)

// 1. Save current engine state
if (this.currentAdapter) {
    this.playerData = this.currentAdapter.getPlayerData();
    const engineState = this.currentAdapter.getState();
    this.globalFlags = { ...this.globalFlags, ...engineState.flags };
    await this.currentAdapter.unloadLevel();
    this.currentAdapter.destroy();
}

// 2. Create new adapter based on engine type
let adapter;
switch (newEngineType) {
    case 'topdown-3d':
        adapter = new TopDown3DAdapter();
        break;
    case 'fps-3d':
        adapter = new FPS3DAdapter();
        break;
    case 'platformer-3d':
        adapter = new Platformer3DAdapter();
        break;
    // ... 2D engines
}

// 3. Initialize and restore state
await adapter.initialize();
if (this.playerData) {
    adapter.setPlayerData(this.playerData);
}

this.currentAdapter = adapter;
```

### 3. Adapter Dynamic Import Pattern

All 3D adapters use dynamic ES module imports:

```javascript
// In FPS3DAdapter.initialize()

// Import engine as ES module
const { default: FPSGame } = await import('/engines/fps-3d/main.js');

// Instantiate
this.game = new FPSGame(container);
await this.game.init();

// Import and attach strategy
const { default: FPS3DStrategy } = await import('/engines/fps-3d/FPS3DStrategy.js');
this.game.strategy = new FPS3DStrategy(this.game);
```

**Why Dynamic Imports?**
- ✅ Only load engines when needed (lazy loading)
- ✅ Reduce initial bundle size
- ✅ Support ES6 modules natively
- ✅ No global namespace pollution
- ✅ Better code splitting

### 4. State Persistence

State is preserved across engine transitions:

```javascript
// Get state from current engine
const state = currentAdapter.getState();
// Returns: { playerPosition, health, ammo, flags, ... }

// Set state in new engine
newAdapter.setState(state);
```

**Cross-Engine Data:**
```javascript
{
    playerPosition: { x, y, z },  // Unified position
    health: 100,                  // Normalized health
    inventory: [...],             // Shared inventory
    flags: { ... },               // Campaign flags
    equippedAbilities: [...],     // Abilities persist
    variables: { score, coins }   // Campaign variables
}
```

## Implementing a Campaign Node

### Level Node with 3D Engine

```json
{
    "id": "fps_mission_1",
    "type": "level",
    "name": "Infiltration",
    "description": "Sneak into the compound",
    "engineType": "fps-3d",
    "levelId": "compound_exterior",
    "levelPath": null,
    "next": "fps_mission_2",
    "conditions": {
        "require": {
            "variable": "has_keycard",
            "operator": "==",
            "value": true
        }
    }
}
```

### Engine Type Options

| Engine Type | Description | Use Case |
|-------------|-------------|----------|
| `rpg-topdown` | 2D top-down RPG | Classic RPG gameplay |
| `iso-pixel` | 2D isometric | Tactical isometric games |
| `platformer-2d` | 2D side-scrolling | Mario-style platforming |
| `topdown-3d` | 3D tactical/RTS | Strategy, MOBA-style |
| `fps-3d` | 3D first-person | Shooter, exploration |
| `platformer-3d` | 3D third-person | 3D platforming |

### Mixed Engine Campaign Example

```json
{
    "nodes": [
        { "id": "start", "type": "start", "next": "rpg_village" },
        { "id": "rpg_village", "type": "level", "engineType": "rpg-topdown", "next": "enter_dungeon" },
        { "id": "enter_dungeon", "type": "dialogue", "next": "fps_dungeon" },
        { "id": "fps_dungeon", "type": "level", "engineType": "fps-3d", "next": "boss_arena" },
        { "id": "boss_arena", "type": "level", "engineType": "topdown-3d", "next": "escape" },
        { "id": "escape", "type": "level", "engineType": "platformer-3d", "next": "end" }
    ]
}
```

## Debugging

### Console Logging

All transitions are logged:

```
[CampaignController] Creating TopDown3DAdapter...
[TopDown3DAdapter] initialized
[TopDown3DAdapter] level "demo_level" loaded successfully
[TopDown3DStrategy] loadLevel: spawning at (0, 0, 0)
```

### Common Issues

**Problem: "Unknown engine type: topdown-3d"**
- **Cause**: CampaignController doesn't have case for engine type
- **Fix**: Added in CampaignController.js line 875

**Problem: "window.FPSGame is not defined"**
- **Cause**: Adapter expects global, but engine is ES module
- **Fix**: Changed adapters to use dynamic import

**Problem: Engine loads but level fails**
- **Cause**: Level file not found or invalid format
- **Fix**: Check levelId matches file in `projects/{project}/dunyalar/`

**Problem: State not persisting**
- **Cause**: Strategy getState/setState not implemented
- **Fix**: All strategies now have these methods

### Debug API Integration

The debug API works with campaign-launched engines:

```bash
# Performance monitoring
curl http://localhost:3000/api/debug-3d/performance

# System diagnostics
curl http://localhost:3000/api/debug-3d/diagnostics

# Entity inspection
curl http://localhost:3000/api/debug-3d/entities

# Physics debugging
curl http://localhost:3000/api/debug-3d/physics
```

### Monitor API Integration (Development Scaffolding)

The monitor API (`/api/monitor/*`) is available for diagnostics UI integration, but its payloads are currently **simulated/sample data** intended for contract testing.

```bash
curl http://localhost:3000/api/monitor/snapshot
curl http://localhost:3000/api/monitor/warnings
curl http://localhost:3000/api/monitor/engine-stats/topdown-3d
```

Responses include header:

```text
X-Ketebe-Monitor-Mode: simulated
```

## Extending the System

### Adding a New 3D Engine

1. **Create Engine Files**:
   ```
   public/engines/mynew-3d/
   ├── main.js              # Export default class MyNew3DGame extends Engine3DAdapter
   ├── MyNew3DAdapter.js    # Adapter implementing EngineAdapter interface
   ├── MyNew3DStrategy.js   # Strategy with getState/setState/getPlayerData
   └── [system files]
   ```

2. **Update CampaignController**:
   ```javascript
   case 'mynew-3d':
       adapter = new MyNew3DAdapter();
       break;
   ```

3. **Load Adapter in campaign_runtime.html**:
   ```html
   <script src="engines/mynew-3d/MyNew3DAdapter.js"></script>
   ```

### Adding Abilities to 3D Engines

Currently, ability methods exist but are stubs:

```javascript
// In Strategy file
useAbility(abilityId, dirX, dirY) {
    // TODO: Implement actual ability logic
    // 1. Check ability cooldown
    // 2. Consume resources (mana, ammo)
    // 3. Execute ability effect
    // 4. Start cooldown timer
    return false;
}
```

**Implementation Guide:**

1. Create ability definitions in `AbilityDefinitions.js`
2. Add cooldown tracking to strategy
3. Implement ability effects in game engine
4. Update `useAbility` to call engine methods

## Performance Considerations

### Memory Management

- Engines are destroyed when switching: `adapter.destroy()`
- Three.js objects are disposed properly
- Physics bodies are removed from cannon-es world
- Event listeners are cleaned up

### Loading Times

- **First 3D engine load**: ~2-3 seconds (Three.js + physics init)
- **Subsequent loads**: <1 second (vendors cached)
- **Engine switch**: ~500ms (state save/restore)

### Optimization Tips

1. **Preload assets** in campaign metadata
2. **Use level transition screens** to hide loading
3. **Keep save data minimal** (< 1MB)
4. **Dispose unused assets** when switching engines

## Testing Checklist

- [ ] Load test_3d_campaign.json
- [ ] Complete topdown-3d level
- [ ] Verify state persists to fps-3d
- [ ] Complete fps-3d level
- [ ] Verify state persists to platformer-3d
- [ ] Complete platformer-3d level
- [ ] Verify state persists to 2D engine
- [ ] Test pause/resume in each engine
- [ ] Test save/load mid-campaign
- [ ] Verify abilities work (once implemented)
- [ ] Check console for errors
- [ ] Verify debug API endpoints work

## Reference

### EngineAdapter Interface

All adapters must implement:

```javascript
// Lifecycle
async initialize()
async loadLevel(levelId, levelPath)
async unloadLevel()
start()
stop()
pause()
resume()
destroy()

// State
getState()
setState(state)
getPlayerData()
setPlayerData(playerData)

// Abilities (campaign feature)
useAbility(abilityId, dirX, dirY)
isAbilityReady(abilityId)
getCooldownFraction(abilityId)

// Callbacks
onLevelComplete(callback)
onStateChange(callback)
```

### Strategy Interface

All strategies should implement:

```javascript
initialize()
start()
loadLevel(levelData)
unloadLevel()
destroy()
getState()
setState(state)
getPlayerData()
setPlayerData(playerData)
// + engine-specific methods
```

## Resources

- **Campaign Format**: `/public/engines/shared/LEVEL_FORMAT.md`
- **3D Engine Docs**: `/docs/3d-engines.md`
- **Debug API**: `/server/routes/debug-3d.js`
- **Monitor API (simulated diagnostics)**: `/server/routes/monitor-3d.js`
- **Example Campaigns**: `/public/dunyalar/definitions/`

## Support

For issues or questions:
1. Check console logs for error messages
2. Verify all adapter methods are implemented
3. Test with test_3d_campaign.json first
4. Use debug API endpoints to inspect engine state
