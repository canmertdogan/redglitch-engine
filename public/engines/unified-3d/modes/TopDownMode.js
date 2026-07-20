/**
 * TopDownMode.js — Top-down 3D strategy/RPG mode module for Unified3DGame.
 *
 * Wraps all TopDown-specific systems (TopDownCamera3D, TerrainSystem3D,
 * EntitySystem3D, Pathfinding3D, FogOfWar3D, AbilitySystem3D, VFXSystem3D,
 * Minimap3D) and plugs them into Game3DCore's lifecycle via ModeInterface.
 *
 * The subsystem files themselves remain in `engines/topdown-3d/`.
 * Legacy level normalisation logic is also preserved here.
 */

import * as THREE from '/lib/three/three.module.js';
import ModeInterface from '../ModeInterface.js';
import { CameraMode } from '../../shared/Camera3DController.js';
import { normalizeTerrainLevel } from '../TerrainRuntime3D.js';
import VehicleSystem3D from '../VehicleSystem3D.js';
import {
    serialize3DPlayerState,
    deserialize3DPlayerState,
} from '../../shared/Save3D.js';

// TopDown-specific subsystems (still live in engines/topdown-3d/)
import TopDownCamera3D       from '../../3d/systems/TopDownCamera3D.js';
import TerrainSystem3D, { BlockType } from '../../3d/systems/TerrainSystem3D.js';
import EntitySystem3D, { AIState, Entity3D } from '../../3d/systems/EntitySystem3D.js';
import Pathfinding3D, { AreaType } from '../../3d/systems/Pathfinding3D.js';
import FogOfWar3D, { VisState } from '../../3d/systems/FogOfWar3D.js';
import AbilitySystem3D, { AbilityShape, DamageType, BuffType } from '../../3d/systems/AbilitySystem3D.js';
import VFXSystem3D, { EffectType } from '../../3d/systems/VFXSystem3D.js';
import Minimap3D             from '../../3d/systems/Minimap3D.js';
import TopDown3DStrategy     from '../../3d/systems/TopDown3DStrategy.js';

// ── TopDownMode ───────────────────────────────────────────────────────────────

export default class TopDownMode extends ModeInterface {

    constructor() {
        super();

        // ── TopDown-specific systems ──────────────────────────────────────
        this.topdownCamera = null;   // TopDownCamera3D
        this.terrain       = null;   // TerrainSystem3D
        this.entities      = null;   // EntitySystem3D
        this.pathfinding   = null;   // Pathfinding3D
        this.fogOfWar      = null;   // FogOfWar3D
        this.abilities     = null;   // AbilitySystem3D
        this.vfx           = null;   // VFXSystem3D
        this.minimap       = null;   // Minimap3D
        this.strategy      = null;   // TopDown3DStrategy
        this.vehicles      = null;   // Shared vehicles

        // ── Game state ────────────────────────────────────────────────────
        this.selectedUnits       = [];
        this._playerTeam         = 0;
        this._initialHostileCount = 0;
    }

    // ── Identity ──────────────────────────────────────────────────────────────

    get modeId() { return 'topdown-3d'; }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async onInit(game) {
        await super.onInit(game);

        const { scene, renderer3d, camera3d, physics, palette,
                assets, input, audio, raycast, skybox, container } = game;

        // Camera mode
        camera3d.setMode(CameraMode.TOPDOWN);

        // Classic RPG sky
        skybox.setGradient('#3a6a8a', '#ccddee');

        // ── Default lighting ──────────────────────────────────────────────
        const amb = new THREE.AmbientLight(0xffffff, 0.45);
        amb.name = '__ambLight';
        scene.add(amb);
        const fill = new THREE.HemisphereLight(0xcfe7ff, 0x4a3828, 0.65);
        fill.name = '__softFillLight';
        scene.add(fill);
        const sun = new THREE.DirectionalLight(0xfff4dc, 1.25);
        sun.name = '__sunLight';
        sun.position.set(30, 60, 30);
        sun.castShadow = true;
        sun.shadow?.mapSize?.set?.(1024, 1024);
        scene.add(sun);

        // ── Terrain ───────────────────────────────────────────────────────
        this.terrain = new TerrainSystem3D(scene, palette, physics);
        game.terrain = this.terrain;

        // ── Entities ──────────────────────────────────────────────────────
        this.entities = new EntitySystem3D(scene, assets, physics, palette, this.terrain);

        // ── Pathfinding ───────────────────────────────────────────────────
        this.pathfinding = new Pathfinding3D(scene);

        // ── Fog of War ────────────────────────────────────────────────────
        this.fogOfWar = new FogOfWar3D(scene, {
            worldW: 64, worldH: 64, playerTeam: 0,
        });

        // ── VFX (before abilities, so abilities can reference it) ─────────
        this.vfx = new VFXSystem3D(
            scene, palette, renderer3d.outlinePass ?? null
        );

        // ── Abilities ─────────────────────────────────────────────────────
        this.abilities = new AbilitySystem3D(scene, this.entities, this.vfx, palette);

        // ── TopDown Camera ────────────────────────────────────────────────
        this.topdownCamera = new TopDownCamera3D(renderer3d.camera, container, {
            pitch:        55,
            zoom:         24,
            edgeScroll:   true,
            keyPan:       true,
            freeRotation: false,
        });

        // ── Minimap ───────────────────────────────────────────────────────
        this.minimap = new Minimap3D(
            renderer3d.webgl, scene, renderer3d.camera, {
                worldW:        64,
                worldH:        64,
                topdownCamera: this.topdownCamera,
                fogOfWar:      this.fogOfWar,
                entities:      this.entities,
                palette,
            }
        );

        // ── Strategy ──────────────────────────────────────────────────────
        this.strategy = new TopDown3DStrategy(game);
        this.vehicles = new VehicleSystem3D(game);

        console.log('[TopDownMode] onInit() complete');
    }

    // ── Level lifecycle ───────────────────────────────────────────────────────

    async onLevelLoaded(level) {
        this._playerTeam         = Number(level?.playerTeam ?? 0) || 0;
        this._initialHostileCount = 0;

        // Normalise legacy editor level format
        const normalized = normalizeTerrainLevel(level);

        // Phase-13+: hydrate subsystems
        if (this.terrain)  this.terrain.onLevelLoaded(normalized);

        if (this.pathfinding) {
            const navmesh = normalized?.navmesh;
            const hasNavmesh = Array.isArray(navmesh?.vertices) && navmesh.vertices.length >= 9
                && Array.isArray(navmesh?.indices) && navmesh.indices.length >= 3;
            if (hasNavmesh) {
                this.pathfinding.buildFromLevel(normalized);
            } else if (this.terrain) {
                const worldW   = Number(normalized?.bounds?.width ?? 64) || 64;
                const worldH   = Number(normalized?.bounds?.height ?? 64) || 64;
                const cellSize = Math.max(0.5, Number(normalized?.terrain?.cellSize ?? 2) || 2);
                const gridW    = Math.max(8, Math.floor(worldW / cellSize));
                const gridH    = Math.max(8, Math.floor(worldH / cellSize));
                this.pathfinding.buildFromTerrain(this.terrain, gridW, gridH, cellSize);
            } else {
                this.pathfinding.buildFlatFallback();
            }
        }

        if (this.entities) {
            await this.entities.onLevelLoaded(normalized);
            this._initialHostileCount = this._countLivingHostiles();
        }

        if (this.fogOfWar) {
            this.fogOfWar.onLevelLoaded(normalized);
            if (this.entities) {
                for (const e of this.entities.getAllEntities()) {
                    const vision = e.stats?.visionRadius ?? e.stats?.vision ?? 8;
                    this.fogOfWar.registerUnit(e.id, e.team ?? 0, vision);
                }
            }
        }

        if (this.minimap)  this.minimap.onLevelLoaded(normalized);
        this.vehicles?.load(normalized);

        if (this.topdownCamera) {
            const center = this._resolveLevelCenter(normalized);
            if (Number.isFinite(center?.x) && Number.isFinite(center?.z)) {
                this.topdownCamera.panToWorld(center.x, center.z);
                this.topdownCamera.snapToTarget?.();
            }
        }
    }

    onLevelUnloaded() {
        this.selectedUnits         = [];
        this._initialHostileCount  = 0;

        if (this.terrain)  this.terrain.dispose();
        this.vehicles?.dispose();
        if (this.entities) this.entities.dispose();
        if (this.fogOfWar) this.fogOfWar.dispose();
        if (this.vfx)      this.vfx.dispose();
        if (this.minimap)  this.minimap.dispose();
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    update(dt) {
        const game = this.game;
        if (!game) return;

        // Terrain animations (water sine-wave, etc.)
        this.terrain?.update(dt, game.gameTime);
        this.vehicles?.update(
            dt,
            game.input,
            this._getHeroPosition(),
            (x, y, z) => this._setHeroPosition(x, y, z),
        );

        // Entity / NPC AI + movement
        this.entities?.update(dt);

        // Pathfinding ORCA tick
        if (this.pathfinding && this.entities) {
            const agents = this.entities.getAllEntities().map(e => ({
                id:       e.id,
                position: { x: e.root.position.x, y: e.root.position.y, z: e.root.position.z },
                velocity: e.orcaVelocity ?? { x: 0, z: 0 },
            }));
            this.pathfinding.updateAgents(dt, agents);
        }

        // Abilities + combat
        this.abilities?.update(dt);

        // Fog of war raster
        if (this.fogOfWar && this.entities) {
            const unitPos = new Map();
            for (const e of this.entities.getAllEntities()) {
                unitPos.set(e.id, e.root.position);
            }
            this.fogOfWar.update(dt, unitPos);
        }

        // VFX particles
        this.vfx?.update(dt);

        // Camera follows selection centroid
        const focusPoint = this._getSelectionCentroid();
        this.topdownCamera?.update(dt, focusPoint);

        // Minimap
        this.minimap?.update(dt);

        // Completion check
        this._checkCompletionState();
    }

    // ── Resize ────────────────────────────────────────────────────────────────

    onResize(w, h) {
        this.topdownCamera?.onResize(w, h);
        this.minimap?.onResize(w, h);
    }

    // ── Selection helpers ─────────────────────────────────────────────────────

    _getSelectionCentroid() {
        if (!this.selectedUnits.length || !this.entities) return null;
        const sum = new THREE.Vector3();
        let count = 0;
        for (const id of this.selectedUnits) {
            const pos = this.entities.getPosition(id);
            if (pos) { sum.add(pos); count++; }
        }
        return count ? sum.divideScalar(count) : null;
    }

    selectUnit(id) {
        if (!this.selectedUnits.includes(id)) {
            this.selectedUnits.push(id);
            this.entities?.setSelected(this.selectedUnits);
        }
    }

    deselectAll() {
        this.selectedUnits = [];
        this.entities?.setSelected([]);
    }

    _getHeroPosition() {
        return this.entities?.getHero?.()?.root?.position
            ?? this.entities?.getHero?.()?.mesh?.position
            ?? this._getSelectionCentroid();
    }

    _setHeroPosition(x, y, z) {
        const hero = this.entities?.getHero?.();
        const root = hero?.root ?? hero?.mesh;
        if (root?.position) root.position.set(x, y, z);
        if (hero?.physicsBody?.body) {
            hero.physicsBody.body.position.set(x, y, z);
            hero.physicsBody.body.velocity.set(0, 0, 0);
        }
    }

    screenToMap(sx, sy)     { return this.strategy?.screenToMap(sx, sy) ?? { wx: 0, wz: 0, wy: 0, hit: false }; }
    commandTo(sx, sy)       { this.strategy?.commandUnitsTo(this.selectedUnits, sx, sy); }
    selectRect(x0, y0, x1, y1, team = 0) {
        const ids = this.strategy?.selectUnitsInRect(x0, y0, x1, y1, team) ?? [];
        this.selectedUnits = ids;
        this.entities?.setSelected(ids);
        return ids;
    }

    // ── Completion ────────────────────────────────────────────────────────────

    _countLivingHostiles() {
        if (!this.entities) return 0;
        return this.entities.getAllEntities().filter(e =>
            e.team !== this._playerTeam && e.ai?.state !== AIState.DEAD
        ).length;
    }

    _checkCompletionState() {
        if (this.game?._levelComplete || this._initialHostileCount <= 0) return;
        if (this._countLivingHostiles() > 0) return;
        this.game?.completeLevel({
            reason:         'all-hostiles-defeated',
            initialHostiles: this._initialHostileCount,
        });
    }

    // ── Save / Load ───────────────────────────────────────────────────────────

    getPlayerData() {
        const heroMesh = this.entities?.getHero?.()?.mesh ?? null;
        return {
            ...serialize3DPlayerState(heroMesh, {
                hp:    this.game?.player?.hp    ?? 100,
                maxHp: this.game?.player?.maxHp ?? 100,
            }),
            selectedUnits: [...this.selectedUnits],
        };
    }

    async setPlayerData(data) {
        const ps = deserialize3DPlayerState(data);
        if (ps && this.game?.player) {
            if (ps.hp    !== undefined) this.game.player.hp    = ps.hp;
            if (ps.maxHp !== undefined) this.game.player.maxHp = ps.maxHp;
        }
    }

    getLevelState() {
        return {
            fog:           this.fogOfWar?.serialize()    || null,
            entityStates:  this.entities?.serialize()    || null,
            abilityStates: this.abilities?.serialize()   || null,
            cameraState:   this.topdownCamera?.serialize() || null,
        };
    }

    async setLevelState(ls) {
        if (!ls) return;
        if (ls.fog)           this.fogOfWar?.deserialize(ls.fog);
        if (ls.entityStates)  this.entities?.deserialize(ls.entityStates);
        if (ls.abilityStates) this.abilities?.deserialize(ls.abilityStates);
        if (ls.cameraState)   this.topdownCamera?.deserialize(ls.cameraState);
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    dispose() {
        this.onLevelUnloaded();

        // Clean up mode-specific lights
        const names = ['__sunLight', '__ambLight', '__softFillLight', '__sunLightTarget'];
        for (const name of names) {
            const obj = this.game?.scene?.getObjectByName(name);
            if (obj) this.game.scene.remove(obj);
        }

        super.dispose();
    }

    // ── Legacy level normalisation ────────────────────────────────────────────
    // (Ported from topdown-3d/main.js — ensures backward compat with old levels)

    _normalizeLegacyEditorLevel(levelData) {
        if (!levelData || typeof levelData !== 'object') return levelData;
        const terrain = levelData.terrain;
        if (!terrain || terrain.mode) return levelData;
        if (!terrain.type && !Array.isArray(levelData.trimesh?.positions) && !Array.isArray(terrain.heightMap)) {
            return levelData;
        }

        const normalized = JSON.parse(JSON.stringify(levelData));
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

        const needsOffset = this._legacyLevelNeedsOffset(normalized, worldW, worldH);
        const offsetX = needsOffset ? worldW * 0.5 : 0;
        const offsetZ = needsOffset ? worldH * 0.5 : 0;

        this._shiftLegacyLevelCoordinates(normalized, offsetX, offsetZ);
        this._normalizeLegacyNavmesh(normalized, offsetX, offsetZ);
        this._normalizeLegacyTerrain(normalized, worldW, worldH);
        this._normalizeLegacyAtmosphere(normalized);

        return normalized;
    }

    _legacyLevelNeedsOffset(levelData, worldW, worldH) {
        const triPos = levelData.trimesh?.positions;
        if (Array.isArray(triPos) && triPos.length >= 3) {
            let minX = Infinity, minZ = Infinity;
            for (let i = 0; i < triPos.length; i += 3) {
                const x = Number(triPos[i] ?? 0), z = Number(triPos[i + 2] ?? 0);
                if (x < minX) minX = x;
                if (z < minZ) minZ = z;
            }
            return minX < 0 || minZ < 0;
        }
        const inspectVec = (vec) => {
            if (!Array.isArray(vec) || vec.length === 0) return false;
            return Number(vec[0] ?? 0) < 0 || Number(vec[2] ?? vec[1] ?? 0) < 0;
        };
        for (const e of levelData.entities || []) if (inspectVec(e?.position)) return true;
        for (const l of levelData.lights || [])   if (inspectVec(l?.position)) return true;
        for (const t of levelData.triggers || []) if (inspectVec(t?.position)) return true;
        for (const w of levelData.waypoints || []) if (inspectVec(w?.position)) return true;
        const nmVerts = levelData.navmesh?.vertices;
        if (Array.isArray(nmVerts) && nmVerts.length >= 3) {
            for (let i = 0; i < nmVerts.length; i += 3) {
                if (Number(nmVerts[i] ?? 0) < 0 || Number(nmVerts[i + 2] ?? 0) < 0) return true;
            }
        }
        return false;
    }

    _shiftLegacyLevelCoordinates(levelData, offsetX, offsetZ) {
        if (!offsetX && !offsetZ) return;
        const shiftVec = (vec) => {
            if (!Array.isArray(vec) || vec.length === 0) return;
            vec[0] = Number(vec[0] ?? 0) + offsetX;
            if (vec.length >= 3) vec[2] = Number(vec[2] ?? 0) + offsetZ;
            else if (vec.length >= 2) vec[1] = Number(vec[1] ?? 0) + offsetZ;
        };
        for (const e of levelData.entities || []) shiftVec(e?.position);
        for (const l of levelData.lights || [])   shiftVec(l?.position);
        for (const t of levelData.triggers || []) shiftVec(t?.position);
        for (const w of levelData.waypoints || []) shiftVec(w?.position);
        for (const g of levelData.geometry || []) shiftVec(g?.position);
        const navVerts = levelData.navmesh?.vertices;
        if (Array.isArray(navVerts)) {
            for (let i = 0; i < navVerts.length; i += 3) {
                navVerts[i]     = Number(navVerts[i] ?? 0) + offsetX;
                navVerts[i + 2] = Number(navVerts[i + 2] ?? 0) + offsetZ;
            }
        }
        const triPos = levelData.trimesh?.positions;
        if (Array.isArray(triPos)) {
            for (let i = 0; i < triPos.length; i += 3) {
                triPos[i]     = Number(triPos[i] ?? 0) + offsetX;
                triPos[i + 2] = Number(triPos[i + 2] ?? 0) + offsetZ;
            }
        }
    }

    _normalizeLegacyNavmesh(levelData, offsetX, offsetZ) {
        const navmesh = levelData.navmesh;
        if (!navmesh || typeof navmesh !== 'object') return;
        if (Array.isArray(navmesh.vertices) && Array.isArray(navmesh.indices)) return;
        const tris = Array.isArray(navmesh.triangles) ? navmesh.triangles : null;
        if (!tris || tris.length === 0) return;
        const vertices = [], indices = [], areas = [];
        for (const tri of tris) {
            const verts = tri?.verts;
            if (!Array.isArray(verts) || verts.length !== 3) continue;
            const base = vertices.length / 3;
            for (const v of verts) {
                vertices.push(Number(v?.[0] ?? 0) + offsetX, Number(v?.[1] ?? 0), Number(v?.[2] ?? 0) + offsetZ);
            }
            indices.push(base, base + 1, base + 2);
            areas.push(0);
        }
        if (indices.length > 0) levelData.navmesh = { vertices, indices, areas };
    }

    _normalizeLegacyTerrain(levelData, worldW, worldH) {
        const td = levelData.terrain || {};
        const cellSize = Math.max(0.25, Number(td.cellSize ?? 1) || 1);
        if (Array.isArray(levelData.trimesh?.positions) && levelData.trimesh.positions.length >= 9) {
            levelData.terrain = { ...td, mode: 'trimesh', cellSize };
            return;
        }
        const gridW = Math.max(2, Math.floor(worldW / cellSize) + 1);
        const gridD = Math.max(2, Math.floor(worldH / cellSize) + 1);
        const elevation = this._buildLegacyElevation(td.heightMap, gridW, gridD, worldW, worldH);
        const normalizedTerrain = {
            ...td, mode: 'lowpoly', cellSize, gridW, gridD, elevation,
            faceColors: Array.isArray(td.faceColors) ? td.faceColors : [],
        };
        if (Number.isFinite(td.waterLevel)) normalizedTerrain.waterLevel = td.waterLevel;
        levelData.terrain = normalizedTerrain;
    }

    _normalizeLegacyAtmosphere(levelData) {
        if (!levelData || typeof levelData !== 'object') return;
        if (!levelData.skybox || typeof levelData.skybox !== 'object') {
            const skyColor = levelData.skyColor;
            if (typeof skyColor === 'string' && skyColor.trim()) {
                levelData.skybox = { type: 'solid', colorHex: skyColor };
            }
        }
    }

    _buildLegacyElevation(heightMap, gridW, gridD, worldW, worldH) {
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

    _resolveLevelCenter(level) {
        const safeHalf = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? (n * 0.5) : fb; };
        const terrain = level?.terrain;
        if (terrain?.mode === 'lowpoly') {
            const gW = Number(terrain.gridW), gD = Number(terrain.gridD);
            const cs = Math.max(0.25, Number(terrain.cellSize ?? 1) || 1);
            if (Number.isFinite(gW) && Number.isFinite(gD) && gW > 1 && gD > 1) {
                return { x: ((gW - 1) * cs) * 0.5, z: ((gD - 1) * cs) * 0.5 };
            }
        }
        if (terrain?.mode === 'trimesh') {
            const triPos = level?.trimesh?.positions;
            if (Array.isArray(triPos) && triPos.length >= 3) {
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
                for (let i = 0; i < triPos.length; i += 3) {
                    const x = Number(triPos[i] ?? 0), z = Number(triPos[i + 2] ?? 0);
                    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
                }
                if (Number.isFinite(minX) && Number.isFinite(maxX)) return { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5 };
            }
        }
        const entities = Array.isArray(level?.entities) ? level.entities : [];
        if (entities.length > 0) {
            let sx = 0, sz = 0, count = 0;
            for (const ent of entities) {
                const pos = ent?.position;
                if (!Array.isArray(pos) || pos.length === 0) continue;
                const x = Number(pos[0] ?? 0), z = Number(pos[2] ?? pos[1] ?? 0);
                if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
                sx += x; sz += z; count++;
            }
            if (count > 0) return { x: sx / count, z: sz / count };
        }
        return { x: safeHalf(level?.bounds?.width ?? 64, 32), z: safeHalf(level?.bounds?.height ?? 64, 32) };
    }
}
