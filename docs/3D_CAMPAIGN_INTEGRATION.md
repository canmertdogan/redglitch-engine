# 3D Campaign Integration

Unified 3D campaign nodes use the shared runtime at `public/engines/unified-3d`.
Supported modes are:

- `fps-3d`
- `topdown-3d`
- `platformer-3d`

Campaign nodes should provide `project`, `levelPath`, and one of the supported
mode values through `mode`, `engineMode`, or `unifiedMode`.

## Terrain

All Unified 3D modes can load playable terrain from the same level data:

- `terrain.mode: "lowpoly"` with `gridW`, `gridD`, `cellSize`, and `elevation`
- `terrain.mode: "trimesh"` with `trimesh.positions` and optional indices/colors
- editor-authored `terrainMeshes` exported by the 3D terrain tools

FPS and platformer modes attach terrain to physics/collision so players can walk
or jump on the surface. Top-down mode uses the same terrain for height sampling,
pathfinding fallback, fog, minimap context, and entity placement.

## Vehicles

Levels can define drivable vehicles either in a top-level `vehicles` array or as
entities with `type: "vehicle"`.

Example:

```json
{
  "vehicles": [
    {
      "id": "buggy_01",
      "position": [4, 2, 8],
      "yaw": 90,
      "colorHex": "#3f6fb4",
      "width": 1.8,
      "height": 0.75,
      "depth": 3
    }
  ]
}
```

Controls use the shared `Input3D` map:

- `interact` enters or exits the nearest vehicle
- movement axis drives throttle/reverse and steering
- `jump` acts as a brake
