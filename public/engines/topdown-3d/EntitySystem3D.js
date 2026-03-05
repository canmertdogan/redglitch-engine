/**
 * EntitySystem3D.js — Entity & Unit System for the Topdown-3D engine.
 *
 * Entity component model:
 *   Transform3D   — position / rotation / scale (THREE.Object3D wrapper)
 *   Mesh3D        — visual: GLTF scene, AnimationMixer, team colour
 *   PhysicsBody3D — cannon-es body (via Physics3DWorld.createBody)
 *   Stats         — hp, maxHp, mana, maxMana, speed, team
 *   Abilities     — list of ability ids + cooldown timers
 *   AI            — state ('idle'|'move'|'attack'|'dead'), target entity id
 *
 * Visual style: flat-shaded MeshLambertMaterial, team colour swapped
 * per-material, no PBR. Health bars = THREE.Sprite billboard.
 * Selection circle = RingGeometry decal on terrain.
 *
 * Usage:
 *   const es = new EntitySystem3D(scene, assets, physics, palette, terrain);
 *   await es.spawnEntity(def);            // add entity from definition
 *   es.update(dt);                        // per-frame: AI + physics sync + animation
 *   es.removeEntity(id);
 *   es.getPosition(id) → THREE.Vector3
 *   es.setPath(id, waypoints[])           // feed from Pathfinding3D
 *   es.onLevelLoaded(levelData)           // bulk-spawn entities from level JSON
 *   es.serialize() / es.deserialize()
 *   es.dispose()
 *
 * Entity definition (from level JSON entities[]):
 * {
 *   id, type, position[3], rotation[4], scale[3],
 *   properties: { modelUrl, stats, team, abilities, aiEnabled }
 * }
 */

import * as THREE from '/lib/three/three.module.js';
import { BodyType, ShapeType } from '../shared/Physics3DWorld.js';

// ── AI states ─────────────────────────────────────────────────────────────────

export const AIState = Object.freeze({
    IDLE:    'idle',
    MOVE:    'move',
    ATTACK:  'attack',
    DEAD:    'dead',
    STUNNED: 'stunned',
});

// ── Animation clip names (standard contract for GLTF models) ─────────────────

const ANIM_CLIPS = ['idle', 'walk', 'run', 'attack', 'death'];

// ── Visual constants ──────────────────────────────────────────────────────────

const HEALTH_BAR_WIDTH   = 1.0;   // world units
const HEALTH_BAR_HEIGHT  = 0.12;
const HEALTH_BAR_OFFSET  = 2.2;   // above entity pivot
const HEALTH_BAR_BG_COL  = new THREE.Color(0x2c2c2c);
const HEALTH_BAR_FG_COL  = new THREE.Color(0x44dd44);
const HEALTH_BAR_LOW_COL = new THREE.Color(0xdd4444);

const SEL_RING_INNER = 0.55;
const SEL_RING_OUTER = 0.75;
const SEL_RING_COL   = new THREE.Color(0x00e5ff);
const SEL_RING_Y_OFF = 0.05;      // slightly above ground

// ── EntitySystem3D ────────────────────────────────────────────────────────────

export default class EntitySystem3D {

    /**
     * @param {THREE.Scene}    scene
     * @param {AssetLoader3D}  assets
     * @param {Physics3DWorld} physics
     * @param {PaletteManager} palette
     * @param {TerrainSystem3D}[terrain]  Optional: used for ground height queries
     */
    constructor(scene, assets, physics, palette, terrain = null) {
        this.scene   = scene;
        this.assets  = assets;
        this.physics = physics;
        this.palette = palette;
        this.terrain = terrain;

        /** @type {Map<string, Entity3D>} id → entity */
        this._entities = new Map();

        /** @type {Map<string, THREE.CanvasTexture>} health-bar texture cache */
        this._hbTexCache = new Map();

        // Shared ring geometry (reused across all selection circles)
        this._ringGeo = new THREE.RingGeometry(SEL_RING_INNER, SEL_RING_OUTER, 32);
        this._ringGeo.rotateX(-Math.PI / 2);  // flat on XZ plane

        // Working vector/matrix
        this._tmp = new THREE.Vector3();
        this._mtx = new THREE.Matrix4();
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * onLevelLoaded(levelData) — bulk-spawn entities from level JSON.
     */
    async onLevelLoaded(levelData) {
        const defs = levelData?.entities || [];
        for (const def of defs) {
            try {
                await this.spawnEntity(def);
            } catch (e) {
                console.warn(`[EntitySystem3D] spawn failed for "${def.id}":`, e.message);
            }
        }
        console.log(`[EntitySystem3D] Loaded ${this._entities.size} entities`);
    }

    /**
     * update(dt) — per-frame tick: move, AI, animation, health-bar orientation.
     */
    update(dt) {
        for (const entity of this._entities.values()) {
            if (entity.ai.state === AIState.DEAD) continue;

            this._tickMovement(entity, dt);
            this._tickAnimation(entity, dt);
            this._tickHealthBar(entity);
            this._syncPhysics(entity);
        }
    }

    /**
     * dispose() — remove all entities.
     */
    dispose() {
        for (const id of [...this._entities.keys()]) {
            this.removeEntity(id);
        }
        this._ringGeo.dispose();
        for (const tex of this._hbTexCache.values()) tex.dispose();
        this._hbTexCache.clear();
    }

    // ── Entity management ─────────────────────────────────────────────────────

    /**
     * spawnEntity(def) — create and add an entity from a definition.
     * @param {object} def  Entity definition (see file header)
     * @returns {Promise<Entity3D>}
     */
    async spawnEntity(def) {
        const id   = def.id || `entity_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const pos  = def.position || [0, 0, 0];
        const rot  = def.rotation || [0, 0, 0, 1];
        const scl  = def.scale    || [1, 1, 1];
        const prop = def.properties || {};

        // ── Root Object3D ─────────────────────────────────────────────────
        const root = new THREE.Object3D();
        root.name  = id;
        root.position.set(...pos);
        root.quaternion.set(rot[0], rot[1], rot[2], rot[3]);
        root.scale.set(...scl);
        this.scene.add(root);

        // ── Stats ─────────────────────────────────────────────────────────
        const stats = _defaultStats(prop.stats);

        // ── Mesh3D ────────────────────────────────────────────────────────
        let meshGroup  = null;
        let mixer      = null;
        const actions  = {};

        if (prop.modelUrl) {
            try {
                const gltf  = await this.assets.loadGLTF(prop.modelUrl);
                meshGroup   = gltf.scene;
                // Apply flat shading + team colour
                _applyTeamColor(meshGroup, prop.team ?? 0, this.palette);
                root.add(meshGroup);

                // Animation mixer
                if (gltf.animations && gltf.animations.length) {
                    mixer = new THREE.AnimationMixer(meshGroup);
                    for (const clip of gltf.animations) {
                        const name = clip.name.toLowerCase();
                        const action = mixer.clipAction(clip);
                        action.setLoop(THREE.LoopRepeat);
                        actions[name] = action;
                    }
                    // Start idle by default
                    if (actions['idle']) actions['idle'].play();
                }
            } catch (e) {
                console.warn(`[EntitySystem3D] Model load failed: ${prop.modelUrl}`, e.message);
                // Fallback: low-poly capsule placeholder
                meshGroup = _buildPlaceholderMesh(prop.team ?? 0, this.palette);
                root.add(meshGroup);
            }
        } else {
            meshGroup = _buildPlaceholderMesh(prop.team ?? 0, this.palette);
            root.add(meshGroup);
        }

        // ── Physics body ──────────────────────────────────────────────────
        let physicsBody = null;
        if (this.physics) {
            physicsBody = this.physics.createBody({
                mesh:           root,
                type:           BodyType.DYNAMIC,
                shape:          ShapeType.CAPSULE,
                mass:           prop.mass   ?? 70,
                radius:         prop.radius ?? 0.4,
                height:         prop.height ?? 1.2,
                fixedRotation:  true,   // prevent tumbling
                position:       root.position,
            });
        }

        // ── Health bar ────────────────────────────────────────────────────
        const healthBar = this._createHealthBar(stats);
        healthBar.position.set(0, HEALTH_BAR_OFFSET, 0);
        root.add(healthBar);

        // ── Selection ring ────────────────────────────────────────────────
        const ringMat = new THREE.MeshBasicMaterial({ color: SEL_RING_COL, side: THREE.DoubleSide });
        const selRing = new THREE.Mesh(this._ringGeo, ringMat);
        selRing.position.set(0, SEL_RING_Y_OFF, 0);
        selRing.visible = false;
        root.add(selRing);

        // ── Build entity ──────────────────────────────────────────────────
        const entity = new Entity3D({
            id,
            type:        def.type || 'unit',
            root,
            meshGroup,
            mixer,
            actions,
            physicsBody,
            healthBar,
            selRing,
            stats,
            abilities:   _defaultAbilities(prop.abilities),
            ai: {
                state:     AIState.IDLE,
                target:    null,
                path:      [],
                pathIdx:   0,
                enabled:   prop.aiEnabled ?? true,
            },
            team:        prop.team ?? 0,
        });

        this._entities.set(id, entity);
        return entity;
    }

    /**
     * removeEntity(id) — destroy entity and free resources.
     */
    removeEntity(id) {
        const entity = this._entities.get(id);
        if (!entity) return;

        // Remove from scene
        this.scene.remove(entity.root);
        _disposeObject3D(entity.root);

        // Remove physics body
        if (entity.physicsBody && this.physics) {
            this.physics.removeBody(entity.physicsBody);
        }

        // Stop animations
        if (entity.mixer) entity.mixer.stopAllAction();

        this._entities.delete(id);
    }

    /**
     * getEntity(id) → Entity3D | undefined
     */
    getEntity(id) { return this._entities.get(id); }

    /**
     * getPosition(id) → THREE.Vector3 | null
     */
    getPosition(id) {
        const e = this._entities.get(id);
        return e ? e.root.position.clone() : null;
    }

    /**
     * getAllEntities() → Entity3D[]
     */
    getAllEntities() { return [...this._entities.values()]; }

    /**
     * getEntitiesByTeam(team) → Entity3D[]
     */
    getEntitiesByTeam(team) {
        return this.getAllEntities().filter(e => e.team === team);
    }

    // ── Selection ─────────────────────────────────────────────────────────────

    /**
     * setSelected(ids) — show selection rings on given entity ids.
     */
    setSelected(ids) {
        for (const entity of this._entities.values()) {
            entity.selRing.visible = ids.includes(entity.id);
        }
    }

    // ── Movement & pathfinding bridge ─────────────────────────────────────────

    /**
     * setPath(id, waypoints) — assign a waypoint path (from Pathfinding3D).
     * @param {THREE.Vector3[]} waypoints
     */
    setPath(id, waypoints) {
        const entity = this._entities.get(id);
        if (!entity) return;
        entity.ai.path    = waypoints.map(w => w.clone());
        entity.ai.pathIdx = 0;
        if (waypoints.length > 0) entity.ai.state = AIState.MOVE;
    }

    /**
     * moveTo(id, worldPos) — move directly to position (no path, for testing).
     */
    moveTo(id, worldPos) {
        const entity = this._entities.get(id);
        if (!entity) return;
        entity.ai.path    = [worldPos.clone()];
        entity.ai.pathIdx = 0;
        entity.ai.state   = AIState.MOVE;
    }

    /**
     * stopMoving(id)
     */
    stopMoving(id) {
        const entity = this._entities.get(id);
        if (!entity) return;
        entity.ai.path    = [];
        entity.ai.pathIdx = 0;
        entity.ai.state   = AIState.IDLE;
        this._playAnim(entity, 'idle');
    }

    // ── Stats / damage ────────────────────────────────────────────────────────

    /**
     * applyDamage(id, amount) — reduce hp; mark DEAD if reaches 0.
     * @returns {boolean} True if entity died
     */
    applyDamage(id, amount) {
        const entity = this._entities.get(id);
        if (!entity || entity.ai.state === AIState.DEAD) return false;
        entity.stats.hp = Math.max(0, entity.stats.hp - amount);
        this._updateHealthBarSprite(entity);
        if (entity.stats.hp <= 0) {
            this._killEntity(entity);
            return true;
        }
        return false;
    }

    /**
     * heal(id, amount)
     */
    heal(id, amount) {
        const entity = this._entities.get(id);
        if (!entity || entity.ai.state === AIState.DEAD) return;
        entity.stats.hp = Math.min(entity.stats.maxHp, entity.stats.hp + amount);
        this._updateHealthBarSprite(entity);
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    serialize() {
        const out = [];
        for (const entity of this._entities.values()) {
            out.push({
                id:       entity.id,
                type:     entity.type,
                position: entity.root.position.toArray(),
                rotation: entity.root.quaternion.toArray(),
                scale:    entity.root.scale.toArray(),
                stats:    { ...entity.stats },
                ai:       { state: entity.ai.state, target: entity.ai.target },
                team:     entity.team,
            });
        }
        return out;
    }

    deserialize(data) {
        if (!Array.isArray(data)) return;
        for (const d of data) {
            const entity = this._entities.get(d.id);
            if (!entity) continue;
            if (d.position) entity.root.position.fromArray(d.position);
            if (d.rotation) entity.root.quaternion.fromArray(d.rotation);
            if (d.stats)    Object.assign(entity.stats, d.stats);
            if (d.ai)       Object.assign(entity.ai,   d.ai);
            this._updateHealthBarSprite(entity);
        }
    }

    // ── Internal tick helpers ─────────────────────────────────────────────────

    _tickMovement(entity, dt) {
        if (entity.ai.state !== AIState.MOVE) return;
        const path    = entity.ai.path;
        if (!path.length) { entity.ai.state = AIState.IDLE; return; }

        const target  = path[entity.ai.pathIdx];
        const pos     = entity.root.position;
        const speed   = entity.stats.speed;

        this._tmp.copy(target).sub(pos);
        this._tmp.y = 0;  // ignore vertical diff for steering
        const dist = this._tmp.length();

        if (dist < 0.15) {
            // Arrived at waypoint
            entity.ai.pathIdx++;
            if (entity.ai.pathIdx >= path.length) {
                entity.ai.state   = AIState.IDLE;
                entity.ai.path    = [];
                entity.ai.pathIdx = 0;
                this._playAnim(entity, 'idle');
                return;
            }
        }

        // Move toward waypoint
        this._tmp.normalize();
        const step = speed * dt;
        pos.addScaledVector(this._tmp, Math.min(step, dist));

        // Face direction of travel (XZ plane only)
        if (dist > 0.01) {
            const angle = Math.atan2(this._tmp.x, this._tmp.z);
            entity.root.rotation.y = angle;
        }

        // Snap to terrain surface
        if (this.terrain) {
            const gy = this.terrain.sampleHeight(pos.x, pos.z);
            pos.y = gy;
        }

        this._playAnim(entity, speed > 5 ? 'run' : 'walk');
    }

    _tickAnimation(entity, dt) {
        entity.mixer?.update(dt);
    }

    _tickHealthBar(entity) {
        // Health bar always faces camera (sprite auto-handles billboarding)
        // Only update texture when hp changes (handled in applyDamage/heal)
    }

    _syncPhysics(entity) {
        if (!entity.physicsBody) return;
        const body = entity.physicsBody.body;
        // Copy physics position → root (if physics is moving the entity)
        if (entity.ai.state === AIState.IDLE || entity.ai.state === AIState.STUNNED) {
            entity.root.position.set(
                body.position.x,
                body.position.y,
                body.position.z,
            );
        } else {
            // Script-driven movement: push the physics body to match root
            body.position.set(
                entity.root.position.x,
                entity.root.position.y,
                entity.root.position.z,
            );
            body.velocity.set(0, body.velocity.y, 0);
        }
    }

    _playAnim(entity, clipName) {
        const target = entity.actions[clipName];
        if (!target || entity._currentAnim === clipName) return;

        // Crossfade from current
        const prev = entity.actions[entity._currentAnim];
        if (prev) {
            target.reset().setEffectiveWeight(1).fadeIn(0.2);
            prev.fadeOut(0.2);
        } else {
            target.reset().setEffectiveWeight(1).play();
        }
        target.play();
        entity._currentAnim = clipName;
    }

    _killEntity(entity) {
        entity.ai.state = AIState.DEAD;
        entity.selRing.visible = false;
        this._playAnim(entity, 'death');
        if (entity.physicsBody) {
            entity.physicsBody.body.type = 2; // STATIC — stop simulating
        }
    }

    // ── Health bar sprite ─────────────────────────────────────────────────────

    _createHealthBar(stats) {
        const canvas  = document.createElement('canvas');
        canvas.width  = 128;
        canvas.height = 16;
        const tex    = new THREE.CanvasTexture(canvas);
        tex.userData = { canvas };
        _drawHealthBar(canvas, stats.hp, stats.maxHp);

        const mat  = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT * 8, 1);
        return sprite;
    }

    _updateHealthBarSprite(entity) {
        const sprite = entity.healthBar;
        if (!sprite?.material?.map) return;
        const canvas = sprite.material.map.userData.canvas;
        _drawHealthBar(canvas, entity.stats.hp, entity.stats.maxHp);
        sprite.material.map.needsUpdate = true;
    }
}

// ── Entity3D record ───────────────────────────────────────────────────────────

export class Entity3D {
    constructor({ id, type, root, meshGroup, mixer, actions, physicsBody,
                  healthBar, selRing, stats, abilities, ai, team }) {
        this.id           = id;
        this.type         = type;
        this.root         = root;
        this.meshGroup    = meshGroup;
        this.mixer        = mixer;
        this.actions      = actions;
        this.physicsBody  = physicsBody;
        this.healthBar    = healthBar;
        this.selRing      = selRing;
        this.stats        = stats;
        this.abilities    = abilities;
        this.ai           = ai;
        this.team         = team;
        this._currentAnim = 'idle';
    }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function _defaultStats(overrides = {}) {
    return {
        hp:     overrides.hp     ?? overrides.maxHp ?? 100,
        maxHp:  overrides.maxHp  ?? 100,
        mana:   overrides.mana   ?? 0,
        maxMana:overrides.maxMana ?? 0,
        speed:  overrides.speed  ?? 5,
        attack: overrides.attack ?? 10,
        defense:overrides.defense?? 0,
        ...overrides,
    };
}

function _defaultAbilities(list = []) {
    return list.map(a => ({
        id:       a.id || a,
        cooldown: a.cooldown ?? 0,
        _timer:   0,
    }));
}

/**
 * Apply team colour to all MeshLambertMaterial/MeshToonMaterial in a group.
 * Uses palette index = team * 4 + 8 (band of 4 team colours starting at idx 8).
 */
function _applyTeamColor(group, team, palette) {
    const teamPalIdx = 8 + (team % 8) * 2;  // 2 colours per team band
    const col = palette.getColor(teamPalIdx);
    group.traverse(obj => {
        if (!obj.isMesh) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
            if (mat.isMeshLambertMaterial || mat.isMeshToonMaterial) {
                mat.flatShading = true;
            }
            // Only recolour materials tagged as 'team_color' to avoid full overwrites
            if (mat.userData?.isTeamColor) mat.color.copy(col);
        }
    });
}

/**
 * Fallback capsule placeholder (no model loaded).
 * Low-poly: cylinder body + sphere head.
 */
function _buildPlaceholderMesh(team, palette) {
    const teamPalIdx = 8 + (team % 8) * 2;
    const col  = palette.getColor(teamPalIdx);
    const mat  = new THREE.MeshLambertMaterial({ color: col, flatShading: true });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 6, 1), mat);
    body.position.set(0, 0.6, 0);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 5, 4), mat);
    head.position.set(0, 1.4, 0);

    const group = new THREE.Group();
    group.add(body, head);
    return group;
}

function _drawHealthBar(canvas, hp, maxHp) {
    const ctx = canvas.getContext('2d');
    const w   = canvas.width;
    const h   = canvas.height;
    const pct = maxHp > 0 ? hp / maxHp : 0;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(1, 1, w - 2, h - 2);

    // Foreground
    const fg = pct > 0.35 ? '#44dd44' : '#dd4444';
    ctx.fillStyle = fg;
    ctx.fillRect(2, 2, Math.floor((w - 4) * pct), h - 4);

    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

function _disposeObject3D(obj) {
    obj.traverse(child => {
        if (child.isMesh) {
            child.geometry?.dispose();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
                m.map?.dispose();
                m.dispose();
            });
        }
        if (child.isSprite) {
            child.material?.map?.dispose();
            child.material?.dispose();
        }
    });
}
