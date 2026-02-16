# Map Generation Options Expansion Plan

## Objective
Add a "Base Height" (Elevation) control to the IsoPixel Studio generator panel. This allows users to generate worlds that start at higher or lower Z-levels (e.g., deep pits, high sky islands).

## Current State
- **Generator:** `iso_generator.js` supports an `offset` parameter in 'Terrain' and 'Flat' modes, but it is currently hardcoded or unused in others.
- **UI:** `iso_editor.html` has inputs for Scale, Amplitude, and Sea Level.
- **Logic:** `iso_editor.js` does not read or pass a base height value.

## Implementation Steps

### Phase 1: Engine Support (`iso_generator.js`)
- **Goal:** Ensure all generation modes respect the `config.offset` parameter.
- **Updates:**
  - `generateIslands`: Add `config.offset` to the calculated Z values.
  - `generateMaze`: Set the floor Z to `config.offset` instead of 0.

### Phase 2: UI Update (`iso_editor.html`)
- **Goal:** Add a numeric input for "Base Height".
- **Location:** Generator panel, likely near Sea Level or Amplitude.
- **Range:** -32 to 32 (consistent with engine Z limits).

### Phase 3: Controller Logic (`iso_editor.js`)
- **Goal:** Capture the user input and pass it to the generator.
- **Function:** Update `window.runGenerator` to read `#gen-offset` and pass it as `offset` in the config object.

## Verification
- Test 'Flat' mode with Base Height 10 -> Should spawn a floor at Z=10.
- Test 'Terrain' mode -> Surface should shift up/down.
- Test 'Maze' mode -> Maze floor should be at the specified height.
