# Unified 3D Editor and Engine Plan

## Objective

Turn the current Unified 3D editor from a placeholder shell into a fully usable production tool and runtime stack. The plan starts with skybox simulation, then a Cinema 4D-style material system, then the shader system, then the physics engine, and finishes with editor usability, runtime integration, and release hardening.

## Progress

- Phase 1 is complete: the skybox schema is normalized across editor, runtime, and server validation.
- Phase 2 is complete: solid and gradient skies now stay camera-locked, render stably, and clean up cleanly.
- Phase 3 is complete: voxel-style sky simulation is active.
- Phase 4 is in progress: time-of-day and atmospheric control.
- Phase 5 is in progress: skybox editor panel.

## Current baseline

- `public/editor3d.html` already mounts the editor shell and mode panels.
- `public/engines/unified-3d/editor/Editor3DCore.js` already has viewport, scene tree, undo/redo, save/load, and playtest hooks.
- `public/engines/shared/SkyboxSystem.js` still has a placeholder `setVoxelSky()` path.
- `public/engines/shared/Engine3DAdapter.js` already expects skybox and physics data in the level schema.
- `public/engines/shared/Physics3DWorld.js` exists, but it still needs full editor/runtime integration.
- `public/engines/shared/PaletteManager.js` gives a low-level color cache, but not a full material authoring workflow.

## Rules

1. Do not start the next phase until the current phase has passed its verification gate.
2. Any schema change must include a migration or backward-compatible fallback in the same phase.
3. The editor must stay playable and saveable at all times; no phase may break existing loads without a replacement path.
4. Each phase must produce a visible or testable improvement.

## Common verification gates

- Contract and campaign validation: `node scripts/validate-3d-campaign.js`
- Studio UI build: `npm run studio:build`
- Runtime smoke test: `npm run server`
- Game packaging smoke test: `npm run build:game "ProjectName"`

## Phase plan

### Milestone 1 - Skybox and environment foundation

**Phase 1 - Lock the skybox schema and defaults**
- Define the unified skybox payload for editor and runtime: type, colors, fog sync, sun settings, and fallback mode.
- Update level creation so empty scenes always create a valid skybox block.
- Verify: blank level save/load round-trips with no missing skybox fields and no regressions in `validate-3d-campaign.js`.

**Phase 2 - Finish the skybox render path**
- Replace placeholder sky behavior with working solid and gradient rendering, including camera-following behavior and proper cleanup.
- Make skybox updates independent from editor camera movement so the viewport never jitters.
- Verify: open a blank scene, switch between solid and gradient backgrounds, and confirm the skybox stays stable while orbiting.

**Phase 3 - Implement voxel-style sky simulation**
- Add star, cloud, and atmospheric voxel simulation for the stylized low-poly look.
- Support density, color, motion, and seed controls so the sky feels authored instead of random.
- Verify: enable voxel sky, reload the scene, and confirm the same seed reproduces the same visual result.

**Phase 4 - Add time-of-day and atmospheric control**
- Add sun angle, ambient intensity, fog density, horizon tint, and day-night presets.
- Make sky, fog, and lighting react together through one environment controller.
- Verify: changing a preset updates sky, fog, and light response in the same frame without a reload.

**Phase 5 - Build the skybox editor panel**
- Add a real skybox tool panel with preset selection, color pickers, fog sync toggle, seed controls, and preview state.
- Wire the panel into the properties area so sky settings are editable like normal scene objects.
- Verify: edit sky settings, save, reload, and confirm the UI and scene match the stored JSON.

### Milestone 2 - Cinema 4D-style material system

**Phase 6 - Design the material data model** (Complete)
- Define a channel-based material schema with material tags, channel enablement, texture slots, and versioning.
- Keep the visual style stylized and flat-shaded, but let materials behave like Cinema 4D materials in structure and workflow.
- Verify: serialize and deserialize a material set with no loss of channel state.

**Phase 7 - Build the material library** (Complete)
- Add project-scoped material storage, duplication, rename, delete, and reference tracking.
- Ensure materials can be reused across many objects without copy-paste drift.
- Verify: create multiple materials, duplicate one, restart the editor, and confirm all references remain valid.

**Phase 8 - Add material preview rendering** (Complete)
- Build preview thumbnails for sphere, cube, plane, and custom preview shapes.
- Cache thumbnails and invalidate them only when channel state changes.
- Verify: change a channel and confirm the thumbnail updates without breaking the preview cache.

**Phase 9 - Implement base color and texture channels** (Complete)
- Add the first real channel stack: color, texture map, UV transform, tiling, offset, and palette color fallback.
- Support both project textures and palette-indexed color materials.
- Verify: assign a material to an object, edit color/texture settings, and see the viewport update immediately.

**Phase 10 - Implement reflectance and transparency channels** (Complete)
- Add specular, roughness, reflection, transparency, alpha, and emissive/luminance channels.
- Keep the defaults stylized and readable rather than photorealistic.
- Verify: toggle each channel on a test object and confirm the effect appears in both editor and playtest.

**Phase 11 - Implement bump, normal, and displacement channels** (Complete)
- Add bump, normal, and displacement controls with strength, inversion, and map-source selection.
- Support layered masks so the material can mix procedural and texture-driven detail.
- Verify: apply a material with bump or normal data and confirm the preview sphere and in-scene mesh match.

**Phase 12 - Add layer stacks and mask blending** (Complete)
- Add a Cinema 4D-style layer stack for mixing channels, masks, gradients, and procedural nodes.
- Support per-layer opacity, blend mode, and order.
- Verify: reorder layers and confirm the resulting material output changes predictably.

**Phase 13 - Custom material parameters** (Complete)
- Allow the user to define arbitrary properties (friction, bounce, flammability, sound_type).
- Store these in `mat.properties` rather than `mat.channels`.
- Ensure they export with the level JSON for gameplay access.
- Verify: add "footstep=metal" to a material and confirm the output JSON contains it.

### ✅ Phase 12: Layer Stacks
**Status**: COMPLETED
* Implemented offscreen rendering logic using the Canvas 2D API for Texture Compositing.
* Integrated `TextureComposer` for dynamic generation and caching of material layer textures.

### ✅ Phase 13: Custom Properties
**Status**: COMPLETED
* Implemented `mat.properties` UI for user-defined key/value attributes.
* Injected runtime data bindings into engine level data payload.

### ✅ Phase 14: Material Tags and Assignments
**Status**: COMPLETED
* Added UI for object-level material overrides mapped to geometry groups.
* Processed multi-material mappings on `THREE.Mesh` initialization natively.
* Updated `_serializeLevelData()` to persist sub-mesh material overrides as `material_assignments`.

### 🔲 Phase 15: Material Inheritance & Overrides
- Support linked materials, child overrides, and instance-safe edits.
- Make it possible to update a parent material without losing per-object overrides.
- Verify: edit a base material and confirm only linked instances update, while overrides stay locked.

**Phase 15 - Add material import/export compatibility**
- Add export, import, and migration support for material definitions and legacy palette materials.
- Bridge old palette-only data into the new channel system instead of forcing a hard cutover.
- Verify: open an older level and confirm it migrates into the new material model without visual loss.

### Milestone 3 - Shader system

**Phase 16 - Define the shader registry**
- Create a centralized shader registry for custom GLSL snippets, uniform defaults, include blocks, and pass types.
- Separate material channels from shader definitions so shaders can be reused across materials.
- Verify: load one built-in shader from the registry and compile it in the editor.

**Phase 17 - Build the shader editor UI**
- Add a shader editing panel with source code, uniform controls, compile output, and live preview.
- Make the editor able to show shader errors without crashing the viewport.
- Verify: edit shader source and see compile success or failure reflected in the panel.

**Phase 18 - Add shader hot reload and fallback behavior**
- Recompile shaders live when source or parameters change.
- Fall back to a safe material when compilation fails.
- Verify: intentionally break a shader and confirm the scene stays usable with a clear error state.

**Phase 19 - Add built-in shader presets**
- Ship ready-made shaders for sky, water, glow, outline, fog, toon, and simple transparent surfaces.
- Keep these presets simple enough for authors to use without code.
- Verify: apply each preset to a test object and confirm the rendered output changes in a controlled way.

**Phase 20 - Add post-processing pass control**
- Add a pass stack for outline, bloom-like glow, fog shaping, color grading, and editor preview filters.
- Let the project choose which passes are active in editor versus playtest.
- Verify: reorder passes and confirm the final image changes deterministically.

**Phase 21 - Bridge shaders and materials**
- Allow materials to point at shader templates or shader variants.
- Keep channel data intact when a shader preset is swapped.
- Verify: assign a shader to a material, save, reload, and confirm the same shader is restored.

**Phase 22 - Add shader parameters and bindings**
- Support typed shader parameters: float, vec2, vec3, color, texture, and toggle.
- Bind shader parameters to the inspector so non-programmers can tune them.
- Verify: change a parameter, save, reload, and confirm the shader uses the same values.

**Phase 23 - Add shader validation and linting**
- Validate uniforms, includes, textures, and pass dependencies before playtest.
- Surface warnings early for missing bindings or unsupported combinations.
- Verify: invalid shader inputs are rejected with explicit messages instead of silent failure.

**Phase 24 - Add shader preview scenes**
- Create small controlled preview scenes for material and shader testing.
- Use these scenes for snapshot comparison of important effects.
- Verify: preview scenes render the expected output and match baseline screenshots.

**Phase 25 - Package the shader library**
- Organize shaders into reusable libraries, grouped by environment, material, and post-process use cases.
- Make the library loadable from all three 3D modes.
- Verify: the same shader asset can be selected in fps, topdown, and platformer editor modes.

### Milestone 4 - Physics engine

**Phase 26 - Integrate Physics3DWorld into the unified lifecycle**
- Make Physics3DWorld the default physics service for the unified runtime and editor playtest path.
- Attach it to the level lifecycle so load, unload, and save all know about physics state.
- Verify: spawn a rigid body in a test scene and confirm it updates under the fixed-step loop.

**Phase 27 - Add rigid body authoring**
- Add editor controls for static, dynamic, and kinematic bodies.
- Support mass, damping, friction, restitution, and fixed-rotation settings.
- Verify: changing body type changes simulation behavior in a visible test level.

**Phase 28 - Add collision shape authoring**
- Support box, sphere, capsule, convex, plane, and trimesh collider types.
- Map shape selection directly to editor controls and runtime serialization.
- Verify: each shape collides correctly in a dedicated physics sandbox scene.

**Phase 29 - Add terrain collision baking**
- Bake physics colliders from terrain, imported meshes, and voxel geometry.
- Keep baked collision data separate from render meshes so editing stays fast.
- Verify: terrain objects are walkable and stable under repeated reloads.

**Phase 30 - Add triggers and sensors**
- Add trigger volumes, sensor bodies, and collision event hooks for gameplay and editor automation.
- Expose enter, stay, and exit events in a way the editor can inspect.
- Verify: entering a trigger fires once per contact cycle and exits cleanly.

**Phase 31 - Add a player controller and camera collision**
- Add a capsule controller, movement rules, jump/step logic, and camera collision avoidance.
- Make the controller usable in all three 3D modes where appropriate.
- Verify: the controller moves through a test level without clipping through walls or floors.

**Phase 32 - Add joints and moving platforms**
- Support constraints, joint linking, and platform motion for gameplay and editor testing.
- Keep joint editing simple enough to author without code.
- Verify: a moving platform carries a connected object without breaking physics sync.

**Phase 33 - Add the physics debug view**
- Add a debug overlay for colliders, contacts, body types, and forces.
- Make the debug view accessible from the editor and runtime diagnostics.
- Verify: the overlay matches the actual physics shapes in the scene.

**Phase 34 - Add physics tuning and determinism controls**
- Expose fixed-step rate, substeps, sleeping, interpolation, and CCD-like safeguards.
- Make physics behavior stable across variable frame rates.
- Verify: the same test scene behaves consistently under low and high frame-rate stress.

**Phase 35 - Add physics save/load and migration**
- Serialize physics bodies, triggers, joints, and controller state into the level format.
- Add migration paths for older scenes that only store partial physics data.
- Verify: a physics-heavy level can be saved, closed, reopened, and played back with the same layout.

### Milestone 5 - Editor usability and scene tooling

**Phase 36 - Replace placeholder editing actions with real transform tools**
- Finish the move, rotate, scale, and select tools so they actually manipulate scene objects.
- Add proper gizmo feedback and axis locking.
- Verify: moving an object changes the scene graph and survives undo/redo.

**Phase 37 - Add multi-select and box select**
- Support drag selection, shift selection, and multi-object inspection.
- Make selection feel stable in dense scenes.
- Verify: select several objects at once and edit shared properties without losing selection.

**Phase 38 - Add hierarchy operations**
- Add parent, unparent, group, duplicate, and instance workflows.
- Preserve world transforms when reparenting objects.
- Verify: grouped objects keep their transforms after save/load.

**Phase 39 - Add editor search and filtering**
- Add search to the scene tree and filter controls for geometry, lights, materials, shaders, and physics objects.
- Keep large scenes navigable.
- Verify: search returns the right object and filtering hides unrelated items.

**Phase 40 - Add a real asset browser**
- Add browser support for meshes, materials, shaders, textures, skyboxes, and physics prefabs.
- Allow drag-and-drop from the browser into the viewport.
- Verify: an asset can be inserted, selected, renamed, and re-used in another level.

**Phase 41 - Add full inspector tab structure**
- Split the inspector into component tabs: transform, material, shader, skybox, light, and physics.
- Make each tab reflect the selected entity type.
- Verify: selecting different objects shows the correct inspector content and no empty placeholder states.

**Phase 42 - Add object creation templates**
- Provide templates for props, lights, triggers, physics bodies, and environment objects.
- Keep the default scene useful instead of empty.
- Verify: creating a new object inserts the right default geometry and properties.

**Phase 43 - Add project and level management**
- Build browser flows for new level, duplicate level, rename level, and open recent.
- Make empty-scene presets available for the three unified 3D modes.
- Verify: the editor can create a new level and save it into the correct project folder.

**Phase 44 - Add playtest handoff and return flow**
- Make playtest preserve unsaved state when appropriate and return to the editor cleanly.
- Keep playtest startup fast and predictable.
- Verify: launch playtest, stop it, and return to the same editor state without corruption.

**Phase 45 - Add diagnostics and profiler overlays**
- Show frame time, draw calls, physics body counts, shader counts, and material counts.
- Make diagnostics available without opening developer tools.
- Verify: the overlay updates live and reflects the current scene size.

### Milestone 6 - Integration, QA, and release hardening

**Phase 46 - Add schema and migration tests**
- Cover skybox, material, shader, and physics migrations with explicit tests.
- Keep old placeholder data working through the upgrade path.
- Verify: older levels load through the validation script and produce the new schema safely.

**Phase 47 - Add editor smoke tests**
- Automate create, select, move, material edit, shader edit, physics edit, save, and reload flows.
- Use these tests to catch broken editor wiring before release.
- Verify: the smoke suite passes on a clean workspace.

**Phase 48 - Add runtime behavior tests**
- Add targeted runtime tests for skybox rendering, material channel output, shader compilation, and physics simulation.
- Include at least one test scene per major system.
- Verify: each system behaves the same in playtest and packaged builds.

**Phase 49 - Add demo projects and documentation**
- Create sample scenes that show skybox authoring, Cinema 4D-style materials, shader effects, and physics gameplay.
- Document the common workflows and troubleshooting paths.
- Verify: a new user can follow the docs and reproduce a working scene from scratch.

**Phase 50 - Release gate and final sign-off**
- Add the final release checklist: build, validation, smoke tests, playtest, docs, and performance review.
- Freeze the release only when every major system has a passing verification gate.
- Verify: `npm run studio:build`, `node scripts/validate-3d-campaign.js`, and a full editor/runtime playtest all pass before sign-off.

## Definition of done

- The editor is no longer a placeholder; it is usable for real scene authoring.
- Skybox authoring works first and is fully data-driven.
- The material system behaves like a channel-based Cinema 4D workflow.
- The shader system is editable, reusable, and safe to break.
- The physics engine is integrated into editing, playtest, and save/load.
- Every phase has a verification gate and cannot silently regress.
