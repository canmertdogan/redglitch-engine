import TerrainSystem3D from '../3d/systems/TerrainSystem3D.js';

export function normalizeTerrainLevel(levelData = {}) {
    if (!levelData || typeof levelData !== 'object') return levelData;

    const normalized = JSON.parse(JSON.stringify(levelData));
    _normalizeEditorTerrainMeshes(normalized);

    const terrain = normalized.terrain;
    if (!terrain || terrain.mode) return normalized;
    if (!terrain.type && !Array.isArray(normalized.trimesh?.positions) && !Array.isArray(terrain.heightMap)) {
        return normalized;
    }

    const triW = Number(normalized.trimesh?.width);
    const triH = Number(normalized.trimesh?.height);
    const worldW = Number(
        normalized.worldW ?? normalized.bounds?.width
        ?? (Number.isFinite(triW) && triW > 0 ? triW : 64),
    ) || 64;
    const worldH = Number(
        normalized.worldH ?? normalized.bounds?.height
        ?? (Number.isFinite(triH) && triH > 0 ? triH : 64),
    ) || 64;

    normalized.bounds = { ...(normalized.bounds || {}), width: worldW, height: worldH };

    const needsOffset = _legacyLevelNeedsOffset(normalized);
    const offsetX = needsOffset ? worldW * 0.5 : 0;
    const offsetZ = needsOffset ? worldH * 0.5 : 0;

    _shiftLegacyLevelCoordinates(normalized, offsetX, offsetZ);
    _normalizeLegacyNavmesh(normalized, offsetX, offsetZ);
    _normalizeLegacyTerrain(normalized, worldW, worldH);
    _normalizeLegacyAtmosphere(normalized);

    return normalized;
}

export default class TerrainRuntime3D {
    constructor(game) {
        this.game = game;
        this.system = null;
    }

    load(levelData) {
        this.dispose();
        const normalized = normalizeTerrainLevel(levelData);
        if (!normalized?.terrain) return normalized;

        this.system = new TerrainSystem3D(this.game.scene, this.game.palette, this.game.physics);
        this.system.onLevelLoaded(normalized);
        this._tagCollisionBodies();
        return normalized;
    }

    update(dt, gameTime) {
        this.system?.update?.(dt, gameTime);
    }

    dispose() {
        this.system?.dispose?.();
        this.system = null;
    }

    sampleHeight(x, z) {
        return this.system?.sampleHeight?.(x, z) ?? 0;
    }

    getCollisionMeshes() {
        const meshes = [];
        const terrainMesh = this.system?._terrainMesh;
        if (terrainMesh) meshes.push(terrainMesh);
        const chunkMeshes = this.system?._chunkMeshes;
        if (chunkMeshes?.values) meshes.push(...chunkMeshes.values());
        return meshes;
    }

    _tagCollisionBodies() {
        const body = this.system?._terrainBody?.body;
        if (body) body.userData = { ...(body.userData || {}), surface: 'grass', type: 'terrain' };
    }
}

function _normalizeEditorTerrainMeshes(levelData) {
    if (levelData.terrain?.mode) return;
    const meshes = Array.isArray(levelData.terrainMeshes) ? levelData.terrainMeshes : [];
    const mesh = meshes.find(m => m?.type === 'terrain' && (Array.isArray(m.sculptedPositions) || Array.isArray(m.elevationGrid)));
    if (!mesh) return;

    if (Array.isArray(mesh.sculptedPositions) && mesh.sculptedPositions.length >= 9) {
        levelData.trimesh = {
            ...(levelData.trimesh || {}),
            positions: mesh.sculptedPositions,
            normals: mesh.sculptedNormals,
            colors: mesh.sculptedColors,
        };
        levelData.terrain = {
            ...(levelData.terrain || {}),
            mode: 'trimesh',
            waterLevel: Number.isFinite(mesh.waterLevel) ? mesh.waterLevel : undefined,
        };
        return;
    }

    const gridW = Math.max(2, Number(mesh.genWidth) || 32);
    const gridD = Math.max(2, Number(mesh.genDepth) || 32);
    const heightScale = Number(mesh.heightScale ?? 1) || 1;
    const elevation = (mesh.elevationGrid || []).map(v => (Number(v) || 0) * heightScale);
    levelData.terrain = {
        ...(levelData.terrain || {}),
        mode: 'lowpoly',
        gridW,
        gridD,
        cellSize: 1,
        elevation,
        waterLevel: Number.isFinite(mesh.waterLevel) ? mesh.waterLevel * heightScale : undefined,
        foliage: Array.isArray(mesh.foliageInstances) ? mesh.foliageInstances : [],
    };
}

function _legacyLevelNeedsOffset(levelData) {
    const triPos = levelData.trimesh?.positions;
    if (Array.isArray(triPos) && triPos.length >= 3) {
        for (let i = 0; i < triPos.length; i += 3) {
            if (Number(triPos[i] ?? 0) < 0 || Number(triPos[i + 2] ?? 0) < 0) return true;
        }
    }
    const inspectVec = (vec) => Array.isArray(vec) && vec.length > 0
        && (Number(vec[0] ?? 0) < 0 || Number(vec[2] ?? vec[1] ?? 0) < 0);
    for (const e of levelData.entities || []) if (inspectVec(e?.position)) return true;
    for (const l of levelData.lights || []) if (inspectVec(l?.position)) return true;
    for (const t of levelData.triggers || []) if (inspectVec(t?.position)) return true;
    for (const w of levelData.waypoints || []) if (inspectVec(w?.position)) return true;
    return false;
}

function _shiftLegacyLevelCoordinates(levelData, offsetX, offsetZ) {
    if (!offsetX && !offsetZ) return;
    const shiftVec = (vec) => {
        if (!Array.isArray(vec) || vec.length === 0) return;
        vec[0] = Number(vec[0] ?? 0) + offsetX;
        if (vec.length >= 3) vec[2] = Number(vec[2] ?? 0) + offsetZ;
        else if (vec.length >= 2) vec[1] = Number(vec[1] ?? 0) + offsetZ;
    };
    for (const e of levelData.entities || []) shiftVec(e?.position);
    for (const l of levelData.lights || []) shiftVec(l?.position);
    for (const t of levelData.triggers || []) shiftVec(t?.position);
    for (const w of levelData.waypoints || []) shiftVec(w?.position);
    for (const g of levelData.geometry || []) shiftVec(g?.position);
    for (const arr of [levelData.navmesh?.vertices, levelData.trimesh?.positions]) {
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i += 3) {
            arr[i] = Number(arr[i] ?? 0) + offsetX;
            arr[i + 2] = Number(arr[i + 2] ?? 0) + offsetZ;
        }
    }
}

function _normalizeLegacyNavmesh(levelData, offsetX, offsetZ) {
    const navmesh = levelData.navmesh;
    if (!navmesh || typeof navmesh !== 'object') return;
    if (Array.isArray(navmesh.vertices) && Array.isArray(navmesh.indices)) return;
    const tris = Array.isArray(navmesh.triangles) ? navmesh.triangles : null;
    if (!tris?.length) return;
    const vertices = [], indices = [], areas = [];
    for (const tri of tris) {
        const verts = tri?.verts;
        if (!Array.isArray(verts) || verts.length !== 3) continue;
        const base = vertices.length / 3;
        for (const v of verts) vertices.push(Number(v?.[0] ?? 0) + offsetX, Number(v?.[1] ?? 0), Number(v?.[2] ?? 0) + offsetZ);
        indices.push(base, base + 1, base + 2);
        areas.push(0);
    }
    if (indices.length > 0) levelData.navmesh = { vertices, indices, areas };
}

function _normalizeLegacyTerrain(levelData, worldW, worldH) {
    const td = levelData.terrain || {};
    const cellSize = Math.max(0.25, Number(td.cellSize ?? 1) || 1);
    if (Array.isArray(levelData.trimesh?.positions) && levelData.trimesh.positions.length >= 9) {
        levelData.terrain = { ...td, mode: 'trimesh', cellSize };
        return;
    }
    const gridW = Math.max(2, Math.floor(worldW / cellSize) + 1);
    const gridD = Math.max(2, Math.floor(worldH / cellSize) + 1);
    levelData.terrain = {
        ...td,
        mode: 'lowpoly',
        cellSize,
        gridW,
        gridD,
        elevation: _buildLegacyElevation(td.heightMap, gridW, gridD, worldW, worldH),
        faceColors: Array.isArray(td.faceColors) ? td.faceColors : [],
    };
}

function _normalizeLegacyAtmosphere(levelData) {
    if (!levelData?.skybox && typeof levelData?.skyColor === 'string' && levelData.skyColor.trim()) {
        levelData.skybox = { type: 'solid', colorHex: levelData.skyColor };
    }
}

function _buildLegacyElevation(heightMap, gridW, gridD, worldW, worldH) {
    const total = gridW * gridD;
    const elevation = new Array(total).fill(0);
    if (!Array.isArray(heightMap) || heightMap.length === 0) return elevation;
    if (heightMap.length >= total) {
        for (let i = 0; i < total; i++) elevation[i] = Number(heightMap[i] ?? 0) || 0;
        return elevation;
    }
    if (heightMap.length === worldW * worldH) {
        for (let gz = 0; gz < gridD; gz++) {
            const sz = Math.min(worldH - 1, Math.round((gz / Math.max(1, gridD - 1)) * (worldH - 1)));
            for (let gx = 0; gx < gridW; gx++) {
                const sx = Math.min(worldW - 1, Math.round((gx / Math.max(1, gridW - 1)) * (worldW - 1)));
                elevation[gz * gridW + gx] = Number(heightMap[sz * worldW + sx] ?? 0) || 0;
            }
        }
    }
    return elevation;
}
