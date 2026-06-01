# RedGlitch Engine — 3D Game Modes: 60-Phase Implementation Plan

## Problem Statement

The RedGlitch Engine currently supports three 2D engines: `rpg-topdown`, `platformer-2d`, and `iso-pixel`. This plan extends the engine with **three fully 3D game modes**, each with a dedicated map editor:

- **`topdown-3d`** — Fixed isometric-perspective 3D (League of Legends style)
- **`fps-3d`** — First-person shooter (DOOM/Quake style)
- **`platformer-3d`** — Third-person 3D platformer (Super Mario Odyssey style)

## Approach

Each new engine follows the established pattern:
1. Concrete engine class + adapter (`extends EngineAdapter`)
2. Rendering strategy class (`extends Strategy`)
3. Paired HTML/JS map editor with StudioBridge integration
4. Server route extensions for 3D level formats
5. Build system whitelist updates

**Visual style: LOW-POLY + VOXEL throughout.**
All three engines share a consistent aesthetic:
- **Low-poly**: flat-shaded triangle meshes, per-face solid colors, no UV textures, 100–800 triangle character budgets
- **Voxel**: chunk-based grid worlds (16×16×16 blocks), greedy-meshed for GPU efficiency, per-block color from a shared 256-color palette
- **Rendering**: `THREE.MeshLambertMaterial` / `THREE.MeshToonMaterial`, cel/outline post-process pass, 3-tone quantized lighting, NO PBR, NO HDR, NO texture atlases
- **Palette system**: each project has one `.pal` JSON (256 colors), all assets reference color indices — inspired by MagicaVoxel
- **VFX**: cube/diamond particle shapes instead of round sprites; flat-colored, no texture sheets

**Technology stack:** Three.js (WebGL renderer), cannon-es (physics), GLTF/GLB for low-poly assets, MagicaVoxel `.vox` format + vox-loader for voxel assets. Voxel data is greedy-meshed to optimized GLTF at build time (players never download raw voxel data).

---

## Phase Groups

### Group A — Foundation (Phases 1–10)
### Group B — Topdown 3D Engine (Phases 11–20)
### Group C — Topdown 3D Map Editor (Phases 21–25)
### Group D — FPS Engine (Phases 26–35)
### Group E — FPS Map Editor (Phases 36–41)
### Group F — 3D Platformer Engine (Phases 42–51)
### Group G — 3D Platformer Map Editor (Phases 52–56)
### Group H — Integration & Finalization (Phases 57–60)
### Group I — Triangle Low-poly Hybrid System (Phases 61–66)

---

## Detailed Phases

### GROUP A — FOUNDATION

**Phase 1 — Technology Audit & Three.js Integration**
- Install `three`, `cannon-es`, and `vox-loader` (MagicaVoxel .vox parser) as npm dependencies
- Add all three to the build whitelist in `build-game.js`
- Create `public/lib/three/`, `public/lib/cannon-es/`, `public/lib/vox-loader/` vendor directories
- Add `three/examples/jsm/postprocessing/` (OutlinePass, RenderPass, EffectComposer) for cel/outline rendering
- Document version pins in `package.json`
- Decision confirmed: **no PBR, no HDR, no texture atlases** — palette-indexed flat colors only

**Phase 2 — 3D Engine Abstract Base Class**
- Create `public/engines/shared/Engine3DBase.js`
- Define abstract lifecycle: `init3D()`, `start3D()`, `update3D(delta)`, `render3D()`, `destroy3D()`
- Expose Three.js `Scene`, `Renderer`, `Clock` as base properties
- Integrate existing Logger Hook pattern (`window.opener.postMessage`)
- Add `engineType3D` property to distinguish sub-modes at runtime
- Wire into existing `EngineAdapter` base class as optional 3D extension

**Phase 3 — WebGL Renderer Setup (Flat/Cel Shading)**
- Create `public/engines/shared/Renderer3D.js`
- Initialize `THREE.WebGLRenderer` with shadow maps enabled (soft shadows on low-poly look great)
- **No HDR, no tone mapping** — low-poly palette colors are already visually striking
- Apply `THREE.FlatShading` as the default on all materials
- Add post-processing pipeline via `EffectComposer`: `RenderPass` → `OutlinePass` (black edges, 1–2px) → `ShaderPass` (3-tone cel quantization)
- Implement canvas resize observer and render loop with fixed delta accumulator (60 FPS target)
- Expose `setPostProcessing(effects[])` hook for per-engine style tweaks

**Phase 4 — 3D Camera System Base**
- Create `public/engines/shared/Camera3DController.js`
- Define camera modes enum: `TOPDOWN`, `FPS`, `THIRD_PERSON`, `ORBIT`, `CINEMATIC`
- Implement smooth lerp/slerp transitions between camera positions
- Add camera shake system (trauma-based)
- Add camera collision avoidance (sphere cast against world geometry)
- Integrate with existing `InputHandler` for mouse look and zoom

**Phase 5 — Physics Engine Integration (cannon-es)**
- Create `public/engines/shared/Physics3DWorld.js`
- Initialize `cannon-es` physics world with gravity vector
- Implement fixed physics step (120 Hz) decoupled from render loop
- Define standard body types: `STATIC` (terrain), `DYNAMIC` (entities), `KINEMATIC` (platforms)
- Create `PhysicsBody3D` wrapper that syncs Three.js mesh with cannon-es body
- Add collision event bus: `onCollisionEnter`, `onCollisionStay`, `onCollisionExit`

**Phase 6 — 3D Asset Pipeline (GLTF + MagicaVoxel .vox)**
- Create `public/engines/shared/AssetLoader3D.js`
- **Format 1 — Low-poly GLTF/GLB**: load with `THREE.GLTFLoader`, enforce flat shading on all mesh materials, remap material colors to project palette indices
- **Format 2 — MagicaVoxel .vox**: parse with `vox-loader`, convert voxel grid → `THREE.BufferGeometry` with per-vertex colors from the 256-color project palette
- Add `PaletteManager.js`: loads project `.pal` JSON, provides `getColor(index)` → `THREE.Color`
- Implement async asset manifest loading from `/api/assets3d/:project`
- Add LRU asset cache; no DRACO needed at low-poly triangle counts
- Add server route `GET /api/assets3d/:project/:assetName` in `server/routes/assets3d.js`

**Phase 7 — 3D Input Handler**
- Create `public/engines/shared/Input3D.js`
- Implement Pointer Lock API wrapper for mouse capture (FPS/third-person)
- Handle mouse delta accumulation for smooth look
- Add virtual analog stick support (mobile/gamepad)
- Extend existing `InputHandler` with 3D-specific bindings: look axes, crouch, sprint
- Implement action mapping system (configurable key→action JSON)

**Phase 8 — Spatial Audio System**
- Create `public/engines/shared/AudioSpatial3D.js`
- Use Web Audio API `PannerNode` with HRTF for 3D positional audio
- Integrate with existing music system (`muzikler/`)
- Add `AudioEmitter3D` component: attach to any 3D entity
- Implement reverb zones (interior vs exterior)
- Add Doppler effect for fast-moving objects

**Phase 9 — 3D Collision Shapes & Raycasting**
- Create `public/engines/shared/Raycast3D.js`
- Implement Three.js `Raycaster` wrappers: `raycastScreen()`, `raycastWorld()`
- Define standard collision shapes: Box, Sphere, Capsule, Convex Hull, Trimesh
- Add `LayerMask` system for selective collision (e.g., ignore-self, trigger-only)
- Implement `OverlapSphere`, `OverlapBox` queries for AoE detection
- Integrate with physics world for synchronized collision geometry

**Phase 10 — 3D Shared Adapter & Cross-Engine Serialization**
- Create `public/engines/shared/Engine3DAdapter.js` extending `EngineAdapter`
- Implement `initialize3D()`, `loadLevel3D(levelData)`, `unloadLevel3D()`
- Define 3D level JSON schema: `{ version, engineType, geometry[], entities[], lights[], navmesh, skybox, physics }`
- Extend `CrossEngineSerializer.js` with 3D transform serialization: `position[3]`, `rotation[4]` (quaternion), `scale[3]`
- Add `GET /api/levels3d/:project/:level` and `POST /api/levels3d/:project/:level` server routes
- Register 3D engine types in `redglitch.json` validator

---

### GROUP B — TOPDOWN 3D ENGINE

**Phase 11 — Topdown3D Engine Class Scaffold**
- Create `public/engines/topdown-3d/main.js`
- Instantiate `Engine3DBase`, inherit all shared systems
- Set `engineType3D = "topdown-3d"`
- Define game loop: input → physics → AI → abilities → rendering
- Add `window.TopDownGame3D` entry point (matches existing pattern)
- Create `public/engines/topdown-3d/index.html` as engine launcher

**Phase 12 — Fixed Isometric Camera (LoL-Style)**
- Create `public/engines/topdown-3d/TopDownCamera3D.js`
- Fixed 55° pitch, rotatable yaw in 45° snaps (optional free rotation mode)
- Smooth pan: camera follows weighted centroid of selected units
- Edge-scroll detection (mouse near viewport edges)
- Zoom: orthographic distance control with smooth lerp
- Middle-mouse drag panning, minimap click-to-pan

**Phase 13 — Topdown 3D Terrain System (Voxel + Low-poly)**
- Create `public/engines/topdown-3d/TerrainSystem3D.js`
- **Voxel mode**: chunk-based world (16×16×16 blocks per chunk), greedy meshing algorithm merges adjacent same-color faces into quads for GPU efficiency; per-block color from project palette; block types: grass, dirt, stone, sand, wood, water, lava, snow
- **Low-poly mode**: flat-triangle terrain mesh with per-face solid palette colors (no UV texturing); terrain defined by elevation grid
- Water: flat animated plane with solid palette-blue tint + animated vertex offset (sine wave)
- Foliage: instanced low-poly trees/rocks/bushes (under 50 triangles each, up to 10K instances)
- Destructible block flag per voxel (for ability interactions)

**Phase 14 — Topdown 3D Entity & Unit System**
- Create `public/engines/topdown-3d/EntitySystem3D.js`
- Entity component model: `Transform3D`, `Mesh3D`, `PhysicsBody3D`, `Stats`, `Abilities`, `AI`
- **Low-poly GLTF character models** (100–800 triangles each), `MeshToonMaterial` or flat-shaded `MeshLambertMaterial`
- Animation mixer: `idle`, `walk`, `run`, `attack`, `death` clips
- Health bars rendered as `THREE.Sprite` billboard always-facing-camera
- Selection circle: `THREE.RingGeometry` decal projected on terrain
- **Team colors**: swap palette color index on mesh material (simple and cheap, no shader complexity)

**Phase 15 — Topdown 3D Pathfinding (NavMesh A*)**
- Create `public/engines/topdown-3d/Pathfinding3D.js`
- NavMesh generation from walkable terrain geometry (baked offline, stored in level JSON)
- Runtime A* pathfinding on navmesh polygons
- Smooth path using funnel algorithm (string-pulling)
- Dynamic obstacle avoidance: ORCA (Optimal Reciprocal Collision Avoidance) for multi-unit
- Path visualization debug overlay

**Phase 16 — Topdown 3D Fog of War**
- Create `public/engines/topdown-3d/FogOfWar3D.js`
- Per-unit vision radius rendered into a 512×512 fog texture
- Three states: unexplored (black), explored-but-hidden (dark tint), visible (clear)
- GPU-accelerated fog update via render texture + blur pass
- Fog revealed by units + structure vision ranges
- Persistent exploration map stored in save data

**Phase 17 — Topdown 3D Ability & Combat System**
- Create `public/engines/topdown-3d/AbilitySystem3D.js`
- Skill shot mechanics: projectile, AoE circle, line, cone targeting reticles
- Cooldown manager with visual indicators (pie-chart overlay on ability icons)
- Damage types: physical, magical, true (penetrates resistances)
- Buff/debuff system with stack limits and duration timers
- Ability VFX: particle emitters attached to cast/hit events

**Phase 18 — Topdown 3D Visual Effects (VFX)**
- Create `public/engines/topdown-3d/VFXSystem3D.js`
- **Voxel/low-poly particle aesthetic**: particles are small cubes and diamond shapes, flat palette colors — no texture sprites
- Pooled effect instances (no GC pressure mid-battle)
- Effect types: chunky cube-burst spell impacts, block-break debris, voxel dust trails
- Post-processing: **OutlinePass** (black 1–2px edges), **3-tone cel quantization** shader, NO bloom — use saturated palette colors for visual pop
- Shadow mapping: simple directional shadows (low-poly geometry casts great chunky shadows)

**Phase 19 — Topdown 3D Minimap System**
- Create `public/engines/topdown-3d/Minimap3D.js`
- Render minimap as orthographic top-down camera → canvas texture
- Unit icons drawn as colored dots per team
- Click-to-navigate: convert minimap UV to world XZ coordinates
- Ping system: visual + audio alerts on minimap
- Fog of war applied to minimap texture

**Phase 20 — Topdown3D Strategy & Adapter Integration**
- Create `public/engines/topdown-3d/TopDown3DStrategy.js` implementing `Strategy`
- Implement `screenToMap(x, y)` using terrain raycast
- Register `TopDown3DAdapter extends Engine3DAdapter`
- Wire to `CampaignController` factory: `case "topdown-3d": return new TopDown3DAdapter()`
- Add demo level: `projects/Topdown3D Demo/redglitch.json` with `engineType: "topdown-3d"`

---

### GROUP C — TOPDOWN 3D MAP EDITOR

**Phase 21 — Topdown 3D Map Editor Scaffold**
- Create `public/topdown3d_editor.html` and `public/topdown3d_editor.js`
- Embed Three.js viewport (orbit camera, grid overlay)
- Sidebar panels: Terrain, Objects, Lights, NavMesh, Settings
- Toolbar: Select, Paint, Place, Erase, Test-Play
- Connect to `RedGlitchEventBus` and `RedGlitchProjectState`
- Register in launcher dashboard with LoL map icon

**Phase 22 — Terrain Painting Tools (Voxel + Low-poly)**
- **Voxel mode**: block-place and block-erase brushes with block-type palette panel (grass, dirt, stone, sand, wood, water, lava, snow, ice, glass, wood planks)
- Each block type has an assigned palette color; pick block type from left panel
- Brush sizes: 1×1, 3×3, 5×5 block stamps
- **Low-poly mode**: per-face color painting brush; click triangle to assign palette color index
- 256-color palette picker (MagicaVoxel-style grid), shared per project as `.pal` JSON
- Undo/redo history stack (50 ops)
- Toggle between voxel and low-poly mode in project settings

**Phase 23 — Object & Prop Placement Tools**
- Asset browser panel: thumbnail grid of GLTF models from `assets3d/`
- Click-to-place, drag-to-reposition, rotate handle, scale handle
- Snap-to-terrain: placed objects align to terrain surface normal
- Bulk scatter: paint-mode for foliage/rocks with density/randomness controls
- Object properties inspector: custom JSON metadata per object
- Group/ungroup objects for scene hierarchy

**Phase 24 — Lighting & Sky Editor (Low-poly Style)**
- Directional light gizmo: drag sun position on hemisphere dome
- Time-of-day presets: dawn, noon, dusk, night — color values pulled from project palette (no HDR)
- **Skybox**: flat-colored gradient sky dome mesh (low-poly sphere, 2–3 palette colors) or solid color
- Ambient color picker (single color for overall scene tint)
- Flat **fog** controls: fog color + density (exponential fog fits low-poly aesthetic beautifully)
- **Emissive blocks**: lava, glowstone, neon — glow via emissive material color (no baking needed)
- No lightmap baking — flat shading + dynamic lights is sufficient and fast

**Phase 25 — Topdown 3D Map Export/Import**
- Export button: serialize scene to `projects/{name}/dunyalar/{mapName}.3dmap.json`
- Schema includes: terrain heightmap (binary base64), texture weights, entities[], lights[], navmesh polygon soup
- NavMesh bake button: run offline navmesh generation and embed in export
- Import: load existing `.3dmap.json` back into editor
- Validate schema on import (show errors in console panel)
- Wire export to `POST /api/levels3d/:project/:level` endpoint

---

### GROUP D — FPS ENGINE

**Phase 26 — FPS Engine Class Scaffold**
- Create `public/engines/fps-3d/main.js`
- Inherit `Engine3DBase`, set `engineType3D = "fps-3d"`
- Entry point: `window.FPSGame`
- Create `public/engines/fps-3d/index.html`
- Game loop order: input → player controller → physics → AI → audio → render
- Pause menu: ESC releases pointer lock and shows pause overlay

**Phase 27 — First-Person Camera & Pointer Lock**
- Create `public/engines/fps-3d/FPSCamera.js`
- `document.body.requestPointerLock()` on click-to-start
- Mouse delta → yaw (Y-axis rotation) + pitch (X-axis, clamped ±89°)
- Camera bob: sine wave on Y offset when walking
- FOV kick on sprint, weapon fire recoil
- Lean system: Q/E keys for corner peeking (optional, configurable)

**Phase 28 — FPS Movement System**
- Create `public/engines/fps-3d/FPSController.js`
- Kinematic character controller using cannon-es `KinematicCharacterController` or custom capsule
- WASD movement, sprint (Shift), crouch (Ctrl), prone (optional)
- Air strafing: reduce air control factor
- Bunny hop: preserve momentum on jump if timed correctly (configurable)
- Footstep audio: material-based sound selection (concrete, grass, metal, wood)

**Phase 29 — FPS Collision & World Geometry**
- Create `public/engines/fps-3d/WorldGeometry.js`
- Level mesh loaded from GLTF; trimesh collider generated for static geometry
- Stair climbing: step-up detection via secondary low ray cast
- Ceiling detection: prevent upward movement through geometry
- Trigger volumes: enter/exit callbacks for doors, zones, events
- Portal system: instant-travel between level sections (for indoor maps)

**Phase 30 — FPS Weapon System**
- Create `public/engines/fps-3d/WeaponSystem.js`
- Weapon model: GLTF attached to camera as child (viewmodel)
- Weapon states: idle, aim, fire, reload, melee
- Raycast hitscan for instant weapons; projectile spawner for rockets/grenades
- Recoil pattern: scripted 2D recoil curves per weapon type
- Ammo system: current/reserve, pickup items replenish ammo
- Weapon sway: inertia-based movement response

**Phase 31 — FPS Enemy AI**
- Create `public/engines/fps-3d/EnemyAI.js`
- Behavior tree: patrol → alert → chase → attack → flee
- Line-of-sight check: cone-based vision + hearing radius
- A* pathfinding on navmesh (shared with Topdown3D navmesh system)
- Cover system: enemies seek nearby cover points when taking damage
- Difficulty scaling: reaction time, accuracy spread, aggression radius
- Death ragdoll: switch from animated to physics-driven on kill

**Phase 32 — FPS HUD System**
- Create `public/engines/fps-3d/HUD_FPS.js`
- DOM overlay (HTML/CSS) for: crosshair, health/armor bar, ammo counter, minimap
- Damage indicator: directional red vignette flash
- Hit marker: crosshair feedback tick on successful hit
- Objective marker: world-space → screen-space projection for waypoints
- Interaction prompt: "Press F to [action]" appears on look-at trigger

**Phase 33 — FPS Raycast & Decal System**
- Create `public/engines/fps-3d/DecalSystem.js`
- Bullet hole decals: project `THREE.DecalGeometry` onto impacted surfaces
- Decal pool: cap at 200 decals, remove oldest when full
- Blood splatter decals on entity hits
- Impact particles: spark/debris emitter at raycast hit point
- Penetration system: thin surfaces allow bullet pass-through (configurable per material)

**Phase 34 — FPS Visual Effects & Rendering**
- Create `public/engines/fps-3d/VFX_FPS.js`
- **Voxel destruction**: when a block is shot, remove it from the voxel grid + spawn 4–8 tumbling mini-cube debris particles
- Muzzle flash: flat diamond-shaped palette-colored sprite + brief point light burst (2 frames)
- Bullet tracer: bright single-palette-color line from muzzle to impact (1 frame)
- Explosion: cube particle burst outward + flat shockwave ring geometry + light flash
- **Post-processing**: OutlinePass (black edges on all geometry) — gives a crisp graphic-novel look without motion blur
- Dynamic shadows from directional light (chunky low-poly shadows are a feature, not a bug)

**Phase 35 — FPS Strategy & Adapter Integration**
- Create `public/engines/fps-3d/FPS3DStrategy.js`
- `screenToMap(x, y)`: always returns player forward raycast hit
- `FPS3DAdapter extends Engine3DAdapter`
- Register in `CampaignController` factory: `case "fps-3d": return new FPS3DAdapter()`
- Demo project: `projects/FPS Demo/redglitch.json` with `engineType: "fps-3d"`

---

### GROUP E — FPS MAP EDITOR

**Phase 36 — FPS Map Editor Scaffold**
- Create `public/fps_editor.html` and `public/fps_editor.js`
- Dual-view layout: 3D perspective viewport (left) + 2D floor plan view (right)
- Toolbar: Draw Room, Add Corridor, Place Entity, Texture Paint, Lighting
- Panel tabs: Geometry, Textures, Entities, Triggers, Settings
- Grid snap: configurable (0.25m, 0.5m, 1m)
- Register in launcher with FPS crosshair icon

**Phase 37 — Geometry Tools (Voxel Grid Builder)**
- Create `public/fps_editor/BrushTools.js`
- **Pure voxel grid** — no CSG needed; place/erase voxel blocks on configurable grid (0.5m–2m cell size)
- Block palette panel: floor, wall, ceiling, slope-NE/NW/SE/SW, window-open, door-frame, pillar, arch
- Each block type has a palette color assignment
- Pencil mode (single block), fill mode (flood fill same type), rectangle-stamp mode
- Greedy mesh preview in viewport (live GLTF generation as you paint)
- Export grid as optimized GLTF via greedy meshing at build time
- Undo/redo stack

**Phase 38 — Color Palette Painter (replaces Texture Painter)**
- Create `public/fps_editor/ColorPalette.js`
- **MagicaVoxel-style 256-color palette**: grid of color swatches, click to select active color
- Click face/block in viewport to assign the selected palette color index
- Global palette shared per project (`.pal` JSON file in project root)
- Import/export palette as `.pal` JSON or `.png` swatch image
- Low-poly mode: per-triangle color painting on face click
- Voxel mode: per-block color assignment
- Color picker (HSL wheel) to define/edit palette entries
- **No UV mapping, no texture files** — everything is a palette index

**Phase 39 — FPS Light Placement Tools**
- Create `public/fps_editor/LightEditor.js`
- Low-poly/voxel worlds use minimal lighting: one directional sun + ambient is often enough
- Point light gizmos for torches, lamps, portals — simple distance-squared falloff (no PBR)
- Colored lights pull from project palette for consistency
- **Emissive block toggle**: mark any voxel block as emissive (lava, glowstone, neon sign) — glows via `material.emissive` color
- Light intensity and radius controls in properties panel
- No lightmap baking — flat shaded geometry looks excellent with real-time lights at this poly count

**Phase 40 — FPS Entity & Trigger Tools**
- Create `public/fps_editor/EntitySpawner.js`
- Entity palette: enemies, pickups (health, ammo, armor), weapons, doors, switches
- Spawn point placement: player start, enemy patrol waypoints
- Trigger volumes: axis-aligned box volumes with event: `onEnter`, `onExit`, `onStay`
- Door editor: linked trigger → door entity animation
- Level exit zone: marks transition to next level
- Custom entity JSON properties per instance

**Phase 41 — FPS Map Export/Import**
- Export: serialize brushes (or baked GLTF), entities, lights, triggers to `{mapName}.fpsmap.json`
- Auto-generate navmesh from walkable floor geometry on export
- Import existing `.fpsmap.json` back into editor
- Preview build: one-click launch game in FPS engine with current map (no save required)
- Validate: check for missing player spawn, disconnected rooms, unreachable areas
- Wire to `POST /api/levels3d/:project/:level` endpoint

---

### GROUP F — 3D PLATFORMER ENGINE

**Phase 42 — 3D Platformer Engine Class Scaffold**
- Create `public/engines/platformer-3d/main.js`
- Inherit `Engine3DBase`, set `engineType3D = "platformer-3d"`
- Entry point: `window.Platformer3DGame`
- Create `public/engines/platformer-3d/index.html`
- Game loop: input → character controller → physics → camera → collectibles → render
- Life/checkpoint respawn system

**Phase 43 — Third-Person Camera**
- Create `public/engines/platformer-3d/ThirdPersonCamera.js`
- Orbit camera: follows player with configurable distance and height offset
- Auto-rotate behind player when moving
- Camera collision: push camera in front of blocking geometry (sphere cast)
- Lock-on camera mode: focus on target enemy with soft orbit around player-target axis
- Cutscene camera: cinematic paths via spline interpolation
- Shoulder swap: toggle left/right offset

**Phase 44 — 3D Platformer Physics**
- Create `public/engines/platformer-3d/PlatformerPhysics3D.js`
- Variable gravity: normal, low-gravity zones, zero-gravity
- Jump physics: variable height based on hold duration (buffered input)
- Coyote time: 8 frames of jump grace after walking off ledge
- Jump buffering: 10 frames pre-landing queue
- Terminal velocity cap
- Bounce pads: impulse force volumes
- Water physics: buoyancy + reduced gravity + swim speed

**Phase 45 — 3D Character Movement**
- Create `public/engines/platformer-3d/CharacterController3D.js`
- Ground movement: acceleration/deceleration curves, speed cap, turn radius
- Slope handling: slide on steep slopes, walk on gentle slopes
- Wall jump: detect wall contact, apply lateral + upward impulse
- Double jump: configurable number of air jumps
- Dash: horizontal impulse with cooldown + invincibility frames
- Ground pound: fast downward slam + shockwave on landing

**Phase 46 — 3D Platformer Character**
- Create `public/engines/platformer-3d/PlayerCharacter3D.js`
- **Low-poly GLTF model** (under 500 triangles), flat-shaded `MeshLambertMaterial`
- Animation state machine: `idle → walk → run → jump → fall → land → attack → hurt → die`
- **IK foot placement**: feet snap to voxel/low-poly surface normals (prevents floating feet on blocky terrain)
- Cosmetic accessory slots: hat, cape, sword — attach low-poly GLTF pieces
- Health, lives, invincibility frame flash (alternate between palette highlight color and normal)
- Death: spawn cube-burst particle explosion from character position

**Phase 47 — Collectibles & Coin System**
- Create `public/engines/platformer-3d/CollectibleSystem3D.js`
- Coins/stars: bobbing + rotating GLTF objects, attracted to player on proximity
- Large collectibles: special items unlocking areas
- Score system integrated with existing quest/achievement framework
- Coin trail patterns: arc, ring, line (placed in editor)
- Collection effects: particle burst + sound + score popup

**Phase 48 — Checkpoint & Level Flow**
- Create `public/engines/platformer-3d/CheckpointSystem3D.js`
- Checkpoint object: touch-activated, saves player position + state
- Respawn: teleport to last checkpoint with brief invincibility
- Level start/end zones: animated portals
- Death plane: `Y < deathY` triggers instant death
- Coin total tracked per level; persist to save data
- Level completion: tally screen showing time, coins, collectibles

**Phase 49 — 3D Platformer Enemies**
- Create `public/engines/platformer-3d/EnemyPlatformer3D.js`
- Enemy types: walker (patrol patrol point), flyer (sine-wave hover path), shooter (projectile, line of sight), boss (multi-phase)
- Stomp kill: player lands on top → enemy dies (Goomba logic)
- Contact damage: side collision → player takes damage
- Enemy knockback on damage taken
- Enemy respawn per-checkpoint-zone or never (configurable)

**Phase 50 — 3D Platformer Visual Effects**
- Create `public/engines/platformer-3d/VFX_Platformer3D.js`
- **All particles are cubes or diamond shapes** — consistent voxel aesthetic
- Jump dust: small cube puff burst from feet on takeoff and landing
- Speed trail on dash: flat diamond trail in palette color
- Coin collect: spinning cube burst in palette yellow + sound
- Water splash: flat blue diamond spray particles
- Environmental: floating cube particles in magic zones, voxel snowflakes, falling block-leaves
- Screen flash: solid palette color overlay (death = palette red, invincibility = palette white pulse, level complete = palette gold)

**Phase 51 — 3D Platformer Strategy & Adapter Integration**
- Create `public/engines/platformer-3d/Platformer3DStrategy.js`
- `Platformer3DAdapter extends Engine3DAdapter`
- Register in factory: `case "platformer-3d": return new Platformer3DAdapter()`
- Demo project: `projects/Platformer3D Demo/redglitch.json` with `engineType: "platformer-3d"`

---

### GROUP G — 3D PLATFORMER MAP EDITOR

**Phase 52 — 3D Platformer Map Editor Scaffold**
- Create `public/platformer3d_editor.html` and `public/platformer3d_editor.js`
- Full 3D viewport with orbit camera + snap grid
- Panel tabs: Geometry, Platforms, Entities, Hazards, Visual
- Toolbar: Select, Place, Move, Rotate, Scale, Test
- Hierarchy panel: scene tree of all placed objects
- Register in launcher dashboard with star/controller icon

**Phase 53 — Platform & Block Placement Tools**
- Create `public/platformer3d_editor/BlockTools.js`
- **Voxel mode**: place voxel block groups as platforms; block type from palette (flat, slope, ice, wood, stone, bouncy, lava-edge)
- **Low-poly mode**: flat-shaded platform meshes from a palette (flat/slope/round/moving/falling/bouncy/icy)
- Gizmos for move/rotate/scale
- Snap-to-grid: configurable 0.5m/1m/2m
- Copy/paste/mirror selection
- **Prefab system**: save/load complex block assemblies (e.g. a spiral staircase, a castle tower)
- Block type drives physics behavior: icy = near-zero friction, bouncy = high restitution, lava = instant damage trigger

**Phase 54 — Moving Platform Path Editor**
- Create `public/platformer3d_editor/PathEditor3D.js`
- Spline path tool: click to place waypoints, drag tangents for curve shaping
- Platform linked to path: set speed, loop mode (ping-pong / loop / one-shot)
- Pendulum: pivot + arc angle + speed configuration
- Rotating platform: axis + rpm + start angle
- Elevator: vertical path with pause-at-waypoint duration
- Preview animation: play path in editor to verify timing

**Phase 55 — Hazard & Trigger Zone Editor**
- Create `public/platformer3d_editor/HazardEditor.js`
- Hazard types: spike, lava, void (instant kill), fire jet (timed), crusher (moving), laser (rotating)
- Timing editor: offset and period for looping hazards (visual timeline strip)
- Trigger zone: invisible volume → event (spawn enemy, play sound, move camera, unlock door)
- Coin placement: single coin or preset arc/ring/line patterns
- Checkpoint placement: orient direction player faces on respawn
- Collectible placement: stars, keys, power-ups

**Phase 56 — 3D Platformer Map Export/Import**
- Export: serialize all placed objects to `{mapName}.pf3d.json` in `projects/{name}/dunyalar/`
- Schema: `{ platforms[], paths[], hazards[], collectibles[], checkpoints[], entities[], lights[], sky }`
- Moving platform paths stored as spline control point arrays
- NavMesh bake from walkable surfaces (used by enemy pathing)
- Preview build: launch game with current map instantly
- Import and validate existing `.pf3d.json`

---

### GROUP H — INTEGRATION & FINALIZATION

**Phase 57 — redglitch.json Extensions & Validation**
- Extend `redglitch.json` schema to accept new `engineType` values: `"topdown-3d"`, `"fps-3d"`, `"platformer-3d"`
- Add optional 3D fields: `renderQuality` (low/medium/high/ultra), `physics3D` (true/false), `shadowQuality`
- Update project creation wizard to offer 3D engine selection with previews
- Add engine-type icons to launcher dashboard cards
- Update schema validation in server route `POST /api/project/create`
- Update all relevant documentation strings and error messages

**Phase 58 — Build System Updates (build-game.js)**
- Add `"topdown-3d"`, `"fps-3d"`, `"platformer-3d"` directories to engine copy whitelist
- Add `"assets3d"` to project asset copy list
- Bundle Three.js, cannon-es, and **vox-loader** vendors into `dist/game/public/lib/`
- **Greedy-mesh bake step**: at build time, convert raw `.vox` voxel data → optimized GLTF (players never download raw voxel grids; shipped builds use pre-baked GLTF)
- Handle binary GLTF/GLB copy (binary-safe)
- Copy project **palette files** (`.pal` JSON) alongside assets
- Add new editor HTML files to EXCLUDED list (never ship to players)
- Validate engine type at build time; abort with descriptive error if unsupported

**Phase 59 — Cross-Engine Serialization & Save System**
- Extend `CrossEngineSerializer.js` with `serializeTransform3D()` / `deserializeTransform3D()`
- Add 3D entity state fields: `position[3]`, `rotation[4]`, `scale[3]`, `velocity[3]`
- Extend save format to include: last checkpoint, collected items set, room/level state
- Test save/load round-trip for all three 3D engines
- Ensure save files from 3D engines do not corrupt 2D engine saves (isolated namespaces)
- Add migration helper for future save format version bumps

**Phase 60 — Demo Projects, Documentation & Polish**
- Create three demo projects (one per engine) under `projects/`
- Each demo: at least one complete playable level, a README, and attribution-free assets
- Write `docs/3d-engines.md`: overview, architecture decisions, API reference
- Write `docs/editors/topdown3d-editor.md`, `fps-editor.md`, `platformer3d-editor.md`
- Add engine selection preview screenshots to launcher dashboard
- Performance audit: profile all three engines at 1080p target 60 FPS, document bottlenecks
- Final integration test: build each demo project for Electron and Web targets

---

### GROUP I — TRIANGLE LOW-POLY HYBRID SYSTEM

**Phase 61 — TriMesh Low-poly Renderer**
- Create `public/engines/shared/TriMeshRenderer3D.js`
- Flat-shaded triangle mesh renderer that **coexists with the voxel chunk system in the same scene**
- Per-face color from project palette (no UV mapping, no textures)
- Mixed scene support: voxel chunks + tri-mesh objects rendered in the same Three.js scene and same pass
- `RandomizeNormals` utility: given any imported GLTF, split shared vertices and re-assign per-face flat normals — produces the classic faceted low-poly look on any model, even if not originally made that way
- Toggleable wireframe overlay (useful in editors for seeing triangle topology)
- All three 3D engines will use this renderer in addition to the voxel chunk system

**Phase 62 — Hybrid Scene Compositor**
- Create `public/engines/shared/HybridScene3D.js`
- Unified scene graph managing **both** voxel chunks (ChunkSystem) and triangle low-poly meshes (TriMeshRenderer3D) as first-class citizens
- Render order: opaque voxel chunks → tri-mesh objects → transparent/water
- Single draw call budget tracker across both systems
- Frustum culling for both chunk and tri-mesh objects
- API: `addVoxelChunk()`, `addTriMesh()`, `remove()`, `setVisible()`
- All three 3D engines (`topdown-3d`, `fps-3d`, `platformer-3d`) use this compositor as their scene root

**Phase 63 — Low-poly Terrain Mesh Generator**
- Create `public/engines/shared/LowPolyTerrainGen.js`
- Generates a triangle-based low-poly terrain from a simple 2D elevation grid (not a voxel grid)
- Algorithm: (1) sample elevation at each grid point → (2) triangulate with alternating diagonal pattern → (3) apply small per-vertex Y randomization for natural faceted appearance → (4) assign per-face palette color by height band (deep water = dark blue, shallow = teal, sand = yellow, grass = green, rock = grey, snow = white)
- Output: `THREE.BufferGeometry` with flat normals + per-vertex colors (no textures)
- **Used alongside voxel terrain**: rolling low-poly hills, mountain ridges, and river banks live as tri-mesh; towns, dungeons, and structures are voxel blocks — both in the same map

**Phase 64 — In-Editor Tri-mesh Sculpt Tools**
- Create `public/engines/shared/editor/TriSculptTools.js` — shared by all three map editors
- **Elevate tool**: drag up/down to push triangle vertices; creates organic low-poly hills and valleys
- **Facet-Paint tool**: click individual triangles to assign palette color index
- **Smooth tool**: average neighboring vertex positions while preserving faceted character (no bezier smoothing)
- **Noise tool**: apply random displacement to selected region for natural-looking terrain variation
- **Flatten tool**: set a selected region to uniform target height
- All edits operate on the tri-mesh layer while the voxel grid layer remains intact — designers paint organic ground with tri-mesh and build structures with voxel blocks in the same scene

**Phase 65 — Low-poly Asset Importer & Facet Tool**
- Create `public/engines/shared/FacetTool.js` and extend `AssetLoader3D.js`
- **Facet Tool pipeline**: import any GLTF → split vertices by face → recompute flat normals → snap all material colors to nearest palette index → output faceted `.glb`
- Works on any GLTF source: Blender exports, Sketchfab low-poly packs, Kenney asset packs
- Guarantees palette consistency even if source wasn't made in MagicaVoxel
- Add **import UI** to all three editors: drag-drop GLTF → auto-facet preview → confirm → add to project asset library (`projects/{name}/assets3d/`)
- Batch import mode: drop a folder of GLTFs, facet all at once
- Outputs stored as faceted `.glb` alongside `.vox` assets

**Phase 66 — Triangle Low-poly Mode in All Map Editors**
- Extend all three map editors (`topdown3d_editor`, `fps_editor`, `platformer3d_editor`) with a **TRI-MESH layer mode** toggle sitting alongside the existing VOXEL layer mode
- Terrain panel switches from voxel block-paint to sculpt tools (Phase 64) when in tri-mesh mode
- "Tri-mesh Objects" tab in the asset browser shows faceted GLTF props from the project library (Phase 65)
- Editors render **both layers simultaneously**: semi-transparent voxel grid overlay on top of solid tri-mesh terrain
- Designers freely switch between modes per-layer at any time
- **Export bundles both**: raw voxel data (baked to GLTF at build time via greedy mesh) + tri-mesh geometry → merged into a single optimized scene GLTF
- Result: maps can have smooth rolling lowpoly hills, crystal caves, and organic rivers (tri-mesh) combined with blocky voxel towns, dungeons, and player-built structures (voxel) — in the **same map, same render pass, same palette**

---

- **Visual style is low-poly + voxel throughout** — this is a hard constraint, not a default. All assets must use flat shading and palette colors.
- **Palette system**: every project has ONE `.pal` JSON (256 colors max). All 3D assets reference palette indices, not raw hex colors. This enforces visual consistency and makes recoloring trivial.
- **MagicaVoxel compatibility**: the `.vox` format is natively supported for asset authoring. Artists use MagicaVoxel (free) to create characters, props, and environment pieces.
- **Greedy meshing** is mandatory for all voxel terrain — raw voxel grids will never be sent to the GPU directly.
- **Shared systems** (physics, renderer, audio, input) live in `public/engines/shared/` — no duplication across engines.
- **Three.js version pin** is critical; minor version bumps can break post-processing APIs.
- **NavMesh generation** is CPU-intensive; bake offline in the editor, never at runtime.
- **Mobile/Android performance**: voxel/low-poly is *ideal* for Android. Low triangle counts + flat shading = excellent performance on mid-range devices. Still provide LOW quality preset (disable outline pass, reduce shadow resolution, halve particle counts).
- **Pointer Lock API** is not available in all Capacitor WebViews — FPS engine needs fallback joystick-based look mode.
- **cannon-es vs Rapier**: cannon-es is JS-native (no WASM), simpler to bundle; chosen for voxel/low-poly scale where physics scenes are simple.
- **No PBR, no HDR, no texture atlases** — these add complexity with no visual benefit given the chosen art style. Cel shading + outline pass + saturated palette colors are the visual language.
- **Triangle low-poly + voxel hybrid**: the two systems coexist in every engine via `HybridScene3D`. Use voxel blocks for structures, items, and player-built content; use tri-mesh terrain for organic geography. Same palette, same render pass, same scene graph.
- **`FacetTool.js`** is the bridge that makes any GLTF (from Blender, Kenney packs, Sketchfab) look native to the engine — auto-facets and palette-snaps on import.
