/**
 * TopDown3DStrategy.js — Phase 20
 * Strategy object for the topdown-3d engine.
 *
 * Implements the same interface pattern used by the 2D engines so the
 * CampaignController can drive all engine types uniformly:
 *   initialize() → start() → loadLevel() → getState() / setState() → unloadLevel() → destroy()
 *
 * Extra surface over the 2D adapters:
 *   screenToMap(screenX, screenY)  → { wx, wz, hit } via terrain raycast
 *   castAbility(casterId, id, screenX, screenY)   → world-space ability cast
 *   selectUnitsInRect(x0,y0,x1,y1)               → rubber-band select
 *   commandUnitsTo(unitIds, screenX, screenY)     → right-click move order
 */

// TopDown3DStrategy is a plain ES-module class; it is NOT loaded as a global
// script the way the 2D adapters are.  CampaignController is patched (see
// TopDown3DAdapter.js) to call `new TopDown3DAdapter()` for this engine type.

import * as THREE from '/lib/three/three.module.js';

export default class TopDown3DStrategy {
    /**
     * @param {TopDownGame3D} game  — live TopDownGame3D instance
     */
    constructor(game) {
        this._game = game;
    }

    // ── Screen-to-world ───────────────────────────────────────────────────────
    /**
     * Convert a screen pixel position to a world XZ map coordinate by
     * raycasting against the terrain.
     *
     * @param {number} screenX  pixel x (from canvas left)
     * @param {number} screenY  pixel y (from canvas top)
     * @returns {{ wx:number, wz:number, wy:number, hit:boolean }}
     */
    screenToMap(screenX, screenY) {
        const game   = this._game;
        const canvas = game.renderer3d?.webgl?.domElement;
        if (!canvas || !game.raycast || !game.terrain) {
            return { wx: 0, wz: 0, wy: 0, hit: false };
        }

        const cw = canvas.clientWidth  || canvas.width;
        const ch = canvas.clientHeight || canvas.height;

        // Collect terrain meshes for intersection
        const terrainObjects = [];
        game.scene.traverse(obj => {
            if (obj.isMesh && (
                obj.userData?.terrainChunk ||
                obj.name?.startsWith('chunk_') ||
                obj.name?.startsWith('lowpoly_') ||
                obj.name === 'water_plane'
            )) {
                terrainObjects.push(obj);
            }
        });

        const hit = game.raycast.raycastScreen(screenX, screenY, cw, ch, {
            objects:   terrainObjects,
            recursive: false,
        });

        if (hit) {
            return {
                wx:  hit.point.x,
                wz:  hit.point.z,
                wy:  hit.point.y,
                hit: true,
                normal: hit.face?.normal ?? null,
                object: hit.object,
            };
        }

        // Fallback: ray-plane intersection at Y=0
        const ndc = new THREE.Vector2(
            (screenX / cw) * 2 - 1,
            -(screenY / ch) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, game.renderer3d.camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);

        return {
            wx:  target.x,
            wz:  target.z,
            wy:  0,
            hit: false,
        };
    }

    // ── Unit commands ─────────────────────────────────────────────────────────
    /**
     * Issue a move order to one or more selected units.
     * Finds a path via Pathfinding3D and stores it on EntitySystem3D.
     * @param {string[]} unitIds
     * @param {number}   screenX
     * @param {number}   screenY
     */
    commandUnitsTo(unitIds, screenX, screenY) {
        const game = this._game;
        const { wx, wz, wy } = this.screenToMap(screenX, screenY);
        const dest = new THREE.Vector3(wx, wy, wz);

        for (const id of unitIds) {
            const entity = game.entities?.getEntity(id);
            if (!entity) continue;
            const startPos = entity.root.position;

            if (game.pathfinding?.isReady) {
                const path = game.pathfinding.requestPath(id, startPos, dest);
                if (path.length) {
                    game.entities.setPath(id, path);
                    game.pathfinding.registerAgent(id, {
                        radius:   0.5,
                        maxSpeed: entity.stats?.speed ?? 5,
                    });
                }
            } else {
                // No navmesh — move directly
                game.entities?.setPath(id, [dest]);
            }
        }
    }

    /**
     * Rubber-band select: find all units inside a screen rectangle.
     * @param {number} x0  screen pixels, top-left
     * @param {number} y0
     * @param {number} x1  bottom-right
     * @param {number} y1
     * @param {number} [team=0]  only select this team
     * @returns {string[]} selected entity ids
     */
    selectUnitsInRect(x0, y0, x1, y1, team = 0) {
        const game   = this._game;
        const canvas = game.renderer3d?.webgl?.domElement;
        if (!canvas || !game.entities) return [];

        const cw = canvas.clientWidth  || canvas.width;
        const ch = canvas.clientHeight || canvas.height;
        const camera = game.renderer3d.camera;

        // Normalise rect
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);

        const selected = [];
        for (const e of game.entities.getAllEntities()) {
            if (e.team !== team) continue;
            const pos3 = e.root.position.clone();
            pos3.project(camera);  // NDC

            const sx = (pos3.x + 1) * 0.5 * cw;
            const sy = (1 - pos3.y) * 0.5 * ch;

            if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
                selected.push(e.id);
            }
        }
        return selected;
    }

    /**
     * Cast an ability from a caster at the world position under the cursor.
     * @param {string} casterId
     * @param {string} abilityId
     * @param {number} screenX
     * @param {number} screenY
     * @returns {boolean}
     */
    castAbilityAtScreen(casterId, abilityId, screenX, screenY) {
        const { wx, wz, wy } = this.screenToMap(screenX, screenY);
        return this._game.abilities?.castAbility(
            casterId, abilityId, new THREE.Vector3(wx, wy, wz)
        ) ?? false;
    }

    /**
     * Show ability targeting reticle at screen cursor.
     * @param {string} abilityId
     * @param {number} screenX
     * @param {number} screenY
     */
    showAbilityReticle(abilityId, screenX, screenY) {
        const game = this._game;
        if (!game.abilities) return;
        const casterPos = game.entities
            ?.getEntity(game.selectedUnits?.[0] ?? '')
            ?.root?.position ?? null;
        const { wx, wz, wy } = this.screenToMap(screenX, screenY);
        game.abilities.showReticle(abilityId, new THREE.Vector3(wx, wy, wz), casterPos);
    }

    hideAbilityReticle(abilityId) {
        this._game.abilities?.hideReticle(abilityId);
    }

    // ── State queries ─────────────────────────────────────────────────────────
    /** Serialise the full topdown-3d game state for CampaignController hand-off. */
    getState() {
        const game = this._game;
        return {
            engineType:    'topdown-3d',
            levelId:       game._levelId       ?? null,
            project:       game.currentProject ?? null,
            gameTime:      game.gameTime       ?? 0,
            selectedUnits: [...(game.selectedUnits ?? [])],
            entityStates:  game.entities?.serialize()       ?? null,
            abilityStates: game.abilities?.serialize()      ?? null,
            fogExplored:   game.fogOfWar?.serialize()       ?? null,
            cameraState:   game.topdownCamera?.serialize()  ?? null,
        };
    }

    /** Restore state from a CampaignController hand-off payload. */
    async setState(state) {
        if (!state) return;
        const game = this._game;
        if (state.gameTime)      game.gameTime = state.gameTime;
        if (state.selectedUnits) game.selectedUnits = [...state.selectedUnits];
        if (state.entityStates)  game.entities?.deserialize(state.entityStates);
        if (state.abilityStates) game.abilities?.deserialize(state.abilityStates);
        if (state.fogExplored)   game.fogOfWar?.deserialize(state.fogExplored);
        if (state.cameraState)   game.topdownCamera?.deserialize(state.cameraState);
    }

    // ── Cross-engine player data ───────────────────────────────────────────────
    /**
     * Return cross-engine player data from the first selected player-team unit.
     * If CrossEngineSerializer is available (global), serialise via it.
     */
    getPlayerData() {
        const game   = this._game;
        const heroId = game.selectedUnits?.[0] ?? null;
        const entity = heroId ? game.entities?.getEntity(heroId) : null;
        if (!entity) return null;

        if (window.CrossEngineSerializer) {
            return new window.CrossEngineSerializer().serializeEntity3D(entity);
        }

        return {
            id:    entity.id,
            stats: { ...entity.stats },
            team:  entity.team,
        };
    }

    setPlayerData(playerData) {
        if (!playerData) return;
        const game   = this._game;
        const heroId = game.selectedUnits?.[0] ?? null;
        const entity = heroId ? game.entities?.getEntity(heroId) : null;
        if (!entity) return;

        if (window.CrossEngineSerializer) {
            new window.CrossEngineSerializer().deserializeEntity3D(entity, playerData);
            return;
        }

        if (playerData.stats) Object.assign(entity.stats, playerData.stats);
    }
}
