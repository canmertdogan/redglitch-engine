# Enhanced Level Format

## Overview

Levels in Ongonluk Engine now support enhanced metadata for better campaign integration and multi-engine support.

## Standard Level Format

### Basic Structure

```json
{
  "name": "Forest Dungeon",
  "engineType": "rpg-topdown",
  "metadata": {
    "description": "A dark forest filled with monsters",
    "author": "Game Developer",
    "version": "1.0.0",
    "estimatedDuration": 600,
    "difficulty": "medium",
    "tags": ["dungeon", "forest", "boss"],
    "completionConditions": {
      "type": "exit",
      "exitPoint": { "x": 50, "y": 50 }
    }
  },
  "spawnPoint": { "x": 10, "y": 10, "z": 0 },
  "map": [...],
  "enemies": [...],
  "npcs": [...],
  "items": [...]
}
```

## Metadata Fields

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Level display name |
| `engineType` | string | "rpg-topdown" \| "iso-pixel" \| "platformer-2d" |

### Optional Metadata

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Level description |
| `author` | string | Level creator |
| `version` | string | Level version |
| `estimatedDuration` | number | Estimated completion time (seconds) |
| `difficulty` | string | "easy" \| "medium" \| "hard" \| "extreme" |
| `tags` | array | Keywords for searching |
| `thumbnail` | string | Path to preview image |
| `musicTrack` | string | Background music file |
| `ambientSound` | string | Ambient sound file |

## Completion Conditions

Levels can specify custom completion conditions:

### Exit-based Completion

```json
{
  "completionConditions": {
    "type": "exit",
    "exitPoint": { "x": 50, "y": 50, "z": 0 }
  }
}
```

### Objective-based Completion

```json
{
  "completionConditions": {
    "type": "objectives",
    "objectives": [
      { "type": "kill", "target": "boss_enemy", "count": 1 },
      { "type": "collect", "itemId": "key", "count": 3 },
      { "type": "reach", "location": { "x": 100, "y": 100 } }
    ]
  }
}
```

### Flag-based Completion

```json
{
  "completionConditions": {
    "type": "flag",
    "flagName": "quest_complete"
  }
}
```

### Time-based Completion

```json
{
  "completionConditions": {
    "type": "time",
    "duration": 120,
    "allowEarlyExit": true
  }
}
```

### Score-based Completion

```json
{
  "completionConditions": {
    "type": "score",
    "targetScore": 1000,
    "allowEarlyExit": true
  }
}
```

## Engine-Specific Fields

### RPG-Topdown

```json
{
  "engineType": "rpg-topdown",
  "map": {
    "width": 100,
    "height": 100,
    "tiles": [...],
    "collision": [...]
  },
  "enemies": [...],
  "npcs": [...],
  "quests": [...],
  "spawnPoint": { "x": 10, "y": 10 }
}
```

### ISO-Pixel

```json
{
  "engineType": "iso-pixel",
  "map": [...],
  "spawnPoint": { "x": 10, "y": 10, "z": 0 },
  "lighting": {
    "preset": "day",
    "ambientColor": "#888888"
  },
  "weather": {
    "type": "rain",
    "intensity": 0.5
  }
}
```

### Platformer-2D

```json
{
  "engineType": "platformer-2d",
  "map": {
    "platforms": [...],
    "hazards": [...],
    "collectibles": [...]
  },
  "spawnPoint": { "x": 10, "y": 10 },
  "goal": { "x": 500, "y": 50, "w": 32, "h": 32 },
  "gravity": 0.5,
  "requiredCollectibles": 10
}
```

## Campaign Integration

When used in campaigns, level nodes reference these files:

```json
{
  "id": "forest_level",
  "type": "level",
  "engineType": "rpg-topdown",
  "levelId": "forest_dungeon",
  "levelPath": "dunyalar/forest_dungeon.json",
  "metadata": {
    "name": "Forest Dungeon",
    "description": "Inherited from level file if not specified"
  },
  "next": "reward_node"
}
```

## Validation

Use `CampaignValidator` to check level files:

```javascript
const validator = new CampaignValidator();
const result = await validator.validate(campaign);

if (!result.valid) {
    console.error('Validation errors:', result.errors);
}
```

## Examples

### Simple RPG Level

```json
{
  "name": "Village",
  "engineType": "rpg-topdown",
  "metadata": {
    "description": "Peaceful village",
    "difficulty": "easy"
  },
  "spawnPoint": { "x": 5, "y": 5 },
  "map": { "width": 50, "height": 50, "tiles": [...] }
}
```

### ISO City Level

```json
{
  "name": "Downtown",
  "engineType": "iso-pixel",
  "metadata": {
    "description": "Bustling city center",
    "difficulty": "medium"
  },
  "spawnPoint": { "x": 10, "y": 10, "z": 0 },
  "map": [...],
  "lighting": { "preset": "day" }
}
```

### Platformer Level

```json
{
  "name": "Sky Temple",
  "engineType": "platformer-2d",
  "metadata": {
    "description": "Jump through the clouds",
    "difficulty": "hard"
  },
  "spawnPoint": { "x": 10, "y": 500 },
  "goal": { "x": 1000, "y": 50, "w": 32, "h": 32 },
  "requiredCollectibles": 5
}
```

## Best Practices

1. **Always specify engineType** - Ensures proper engine loading
2. **Provide meaningful metadata** - Helps with campaign organization
3. **Set spawn points** - Avoid default (0,0) positioning
4. **Define completion conditions** - Makes progression clear
5. **Use consistent naming** - Follow naming conventions
6. **Include descriptions** - Helps with campaign editing
7. **Test all levels** - Verify they load and complete properly

## Migration

### Converting Old Levels

Old levels without metadata will still work but should be upgraded:

```javascript
// Old format
{
  "map": [...],
  "enemies": [...]
}

// New format
{
  "name": "Level 1",
  "engineType": "rpg-topdown",
  "metadata": {
    "description": "First level"
  },
  "spawnPoint": { "x": 10, "y": 10 },
  "map": [...],
  "enemies": [...]
}
```

### Backward Compatibility

Adapters automatically handle levels without metadata:
- Default `engineType` to "rpg-topdown"
- Use level ID as name
- Generate minimal metadata

## See Also

- `CampaignController.js` - Campaign orchestration
- `CampaignValidator.js` - Validation utilities
- Engine adapters - Level loading implementations
