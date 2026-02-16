# IsoPixel Studio Vegetation Generator Plan

## Objective
Add a "Tree and Vegetation Generator" to the IsoPixel Studio, allowing users to procedurally place trees, bushes, and other flora in the isometric world.

## 1. Update `iso_generator.js`
Implement a new method `generateVegetation` in the `IsoGenerator` class.
*   **Parameters:** `width`, `height`, `config` (density, types, seed).
*   **Logic:**
    *   Iterate through the map surface (finding the highest non-empty Z for each X,Y).
    *   Use noise or random probability (seeded) to decide where to place vegetation.
    *   Place "Tree" blocks (wood trunk + leaf canopy) and "Plant" props (flowers, grass, bushes).
    *   Respect existing terrain (only place on grass/dirt/snow, not water or stone).

## 2. Update `iso_editor.html`
Add a new section to the **Generator** panel in the inspector sidebar.
*   **Section Title:** VEGETATION
*   **Controls:**
    *   **Type:** Select (Forest, Jungle, Plains, Desert).
    *   **Density:** Range slider (Low to High).
    *   **Button:** "GENERATE VEGETATION" (Non-destructive, adds to existing terrain).

## 3. Update `iso_editor.js`
*   Implement `runVegetationGenerator()` function.
*   Call `IsoGenerator.generateVegetation()`.
*   Merge the result into the current `map` object (adding to layers/shapes/decorations).
*   Trigger a re-render.

## Execution Order
1.  **Logic:** Modify `public/iso_generator.js` to add the vegetation generation logic.
2.  **UI:** Update `public/iso_editor.html` to add the new generator controls.
3.  **Integration:** Update `public/iso_editor.js` to wire up the button to the generator.
