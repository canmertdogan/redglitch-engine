/**
 * EnemyAI.js — Phase 31
 * Enemy AI system for the FPS-3D engine.
 *
 * Behavior tree per enemy: IDLE → PATROL → ALERT → CHASE → ATTACK → FLEE → DEAD
 *
 * Features:
 *   - Cone-based LOS + hearing radius detection
 *   - A* pathfinding via shared Pathfinding3D (same navmesh format as topdown-3d)
 *   - Cover system: nearest cover point selected on damage
 *   - Difficulty presets: reaction time, accuracy spread, aggression radius
 *   - Death ragdoll: physics bodies activated on kill
 *   - Health bar billboard (canvas texture)
 *   - onEnemyDied / onEnemyAlerted callbacks
 *
 * Usage:
 *   const ai = new EnemyAI({ scene, physics, assets, palette, raycast, weaponSystem });
 *   ai.loadFromLevel(levelData);          // spawn enemies + cover points
 *   ai.setPlayerRef(fpsController);       // live player position
 *   ai.update(dt);                        // per-frame tick
 *   ai.damageEnemy(id, amount, hitPos);   // called by WeaponSystem onHit
 *   ai.dispose();
 *
 * Level JSON format — enemies array:
 *   { id, type, position[3], rotation?, properties: {
 *       modelUrl?, health, patrol: [[x,y,z],...],
 *       patrolWait?, visionAngle?, visionRange?,
 *       hearingRadius?, attackRange?, attackDamage?,
 *       attackRate?, accuracy?, aggressionRadius?,
 *       reactionTime?, fleeHealthPct?, coverSearch?
 *   }}
 *
 * Level JSON format — coverPoints array:
 *   { id, position[3], normal[3]? }
 */

import * as THREE          from '/lib/three/three.module.js';
import Pathfinding3D       from './Pathfinding3D.js';
import { BodyType, ShapeType } from '/engines/shared/Physics3DWorld.js';

// ── Enemy states ──────────────────────────────────────────────────────────────

export const EnemyState = Object.freeze({
    IDLE:    'idle',
    PATROL:  'patrol',
    ALERT:   'alert',
    CHASE:   'chase',
    ATTACK:  'attack',
    FLEE:    'flee',
    DEAD:    'dead',
});

// ── Difficulty presets ────────────────────────────────────────────────────────

export const Difficulty = Object.freeze({
    EASY:   { reactionTime: 1.2, accuracySpread: 0.18, aggressionRadius: 10 },
    NORMAL: { reactionTime: 0.6, accuracySpread: 0.09, aggressionRadius: 16 },
    HARD:   { reactionTime: 0.25, accuracySpread: 0.03, aggressionRadius: 24 },
});

// ── Per-enemy defaults ────────────────────────────────────────────────────────

const ENEMY_DEFAULTS = {
    health:          80,
    visionAngle:     55,      // half-angle degrees
    visionRange:     18,      // metres
    hearingRadius:   8,
    attackRange:     12,
    attackDamage:    10,
    attackRate:      1.2,     // attacks/second
    accuracy:        0.85,    // 0–1; modulated by difficulty spread
    aggressionRadius:16,
    reactionTime:    0.6,
    fleeHealthPct:   0.20,    // flee when HP drops below 20%
    patrolWait:      2.5,     // seconds to wait at each patrol point
    coverSearch:     true,
    moveSpeed:       3.5,     // m/s walk
    chaseSpeed:      5.5,     // m/s chase
};

// ── Visual constants ──────────────────────────────────────────────────────────

const HP_BAR_W      = 1.0;
const HP_BAR_H      = 0.14;
const HP_BAR_Y      = 2.4;   // above pivot
const HP_BG         = new THREE.Color(0x222222);
const HP_FG         = new THREE.Color(0x44dd44);
const HP_FG_LOW     = new THREE.Color(0xdd4444);

const ALERT_COL     = new THREE.Color(0xffcc00);  // !-marker color
const PATH_STEP_DIST= 0.35;   // metres per frame movement step
const COVER_SEARCH_R= 12;     // radius to look for cover points

// ── EnemyAI ───────────────────────────────────────────────────────────────────

export default class EnemyAI {

    /**
     * @param {object} opts
     * @param {THREE.Scene}      opts.scene
     * @param {Physics3DWorld}   opts.physics
     * @param {AssetLoader3D}    opts.assets
     * @param {PaletteManager}   opts.palette
     * @param {Raycast3D}        opts.raycast
     * @param {WeaponSystem}     [opts.weaponSystem]
     * @param {string}           [opts.difficulty]   'easy'|'normal'|'hard'
     */
    constructor(opts = {}) {
        this._scene        = opts.scene;
        this._physics      = opts.physics;
        this._assets       = opts.assets;
        this._palette      = opts.palette;
        this._raycast      = opts.raycast;
        this._weaponSystem = opts.weaponSystem ?? null;

        // Difficulty overlay
        const diffKey = (opts.difficulty ?? 'normal').toUpperCase();
        this._diff = { ...Difficulty.NORMAL, ...(Difficulty[diffKey] ?? {}) };

        /** @type {Map<string, EnemyAgent>} */
        this._enemies      = new Map();

        /** @type {Array<{id:string, pos:THREE.Vector3, normal:THREE.Vector3}>} */
        this._coverPoints  = [];

        this._pathfinding  = new Pathfinding3D(this._scene);
        this._playerPos    = new THREE.Vector3();
        this._playerRef    = null;   // FPSController

        // Working temporaries
        this._tmp          = new THREE.Vector3();
        this._dir          = new THREE.Vector3();
        this._ray          = new THREE.Raycaster();
        this._ray.far      = 30;

        // Callbacks
        this.onEnemyDied    = null;  // (id, pos) => {}
        this.onEnemyAlerted = null;  // (id) => {}
        this.onEnemyAttack  = null;  // (id, damage) => {}

        // Global alert: if one enemy spots player, nearby enemies alert too
        this._globalAlertPos   = null;
        this._globalAlertTimer = 0;
        this.GLOBAL_ALERT_RADIUS = 12;
        this.GLOBAL_ALERT_DURATION = 8;
    }

    // ── Setup ─────────────────────────────────────────────────────────────────

    /** Set live player position source. */
    setPlayerRef(fpsController) {
        this._playerRef = fpsController;
    }

    /** Override difficulty at runtime. */
    setDifficulty(preset) {
        const key = preset.toUpperCase();
        this._diff = { ...Difficulty.NORMAL, ...(Difficulty[key] ?? {}) };
    }

    /** Load enemies and cover points from level JSON. */
    async loadFromLevel(levelData, projectName = '') {
        // Build navmesh
        this._pathfinding.buildFromLevel(levelData);

        // Cover points
        this._coverPoints = [];
        for (const cp of levelData.coverPoints ?? []) {
            this._coverPoints.push({
                id:     cp.id ?? `cp_${this._coverPoints.length}`,
                pos:    new THREE.Vector3(...(cp.position ?? [0,0,0])),
                normal: new THREE.Vector3(...(cp.normal   ?? [0,0,1])),
            });
        }

        // Enemies
        for (const def of levelData.enemies ?? []) {
            await this._spawnEnemy(def, projectName);
        }
    }

    /** Register a cover point at runtime. */
    addCoverPoint(id, pos, normal = null) {
        this._coverPoints.push({
            id,
            pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z),
            normal: normal ?? new THREE.Vector3(0, 0, 1),
        });
    }

    // ── Spawn ─────────────────────────────────────────────────────────────────

    async _spawnEnemy(def, projectName) {
        const id   = def.id ?? `enemy_${this._enemies.size}`;
        const props = { ...ENEMY_DEFAULTS, ...(def.properties ?? {}) };

        // Position
        const pos = new THREE.Vector3(...(def.position ?? [0, 0, 0]));

        // Mesh: try to load GLTF; fallback to simple box
        let mesh, mixer = null;
        if (props.modelUrl && this._assets) {
            try {
                const gltf = await this._assets.loadGLTF(props.modelUrl);
                mesh  = gltf.scene;
                mixer = new THREE.AnimationMixer(mesh);
                this._playClip(mixer, gltf.animations, 'idle');
            } catch {
                mesh = this._makeBoxMesh(id);
            }
        } else {
            mesh = this._makeBoxMesh(id);
        }
        mesh.position.copy(pos);
        this._scene.add(mesh);

        // Physics capsule (sphere approximation, same as player)
        const body = this._physics.createBody({
            shape: ShapeType.SPHERE,
            radius: 0.38,
            mass: 70,
            fixedRotation: true,
            position: { x: pos.x, y: pos.y, z: pos.z },
        });
        body.userData = { enemyId: id };

        // Health bar
        const hpBar = this._makeHealthBar();
        hpBar.position.set(0, HP_BAR_Y, 0);
        mesh.add(hpBar);

        // Alert marker (! sprite, hidden by default)
        const alertMarker = this._makeAlertMarker();
        alertMarker.position.set(0, HP_BAR_Y + 0.5, 0);
        alertMarker.visible = false;
        mesh.add(alertMarker);

        // Patrol waypoints
        const patrol = (props.patrol ?? []).map(p => new THREE.Vector3(...p));
        if (patrol.length === 0) patrol.push(pos.clone()); // stationary

        /** @type {EnemyAgent} */
        const agent = {
            id,
            mesh,
            body,
            mixer,
            hpBar,
            alertMarker,
            hp:          props.health,
            maxHp:       props.health,
            state:       EnemyState.PATROL,
            prevState:   null,
            stateTimer:  0,
            // Config (merged with difficulty)
            visionAngle: props.visionAngle,
            visionRange: props.visionRange,
            hearingRadius: props.hearingRadius,
            attackRange: props.attackRange,
            attackDamage: props.attackDamage,
            attackRate:  props.attackRate,
            accuracy:    props.accuracy,
            aggressionRadius: props.aggressionRadius ?? this._diff.aggressionRadius,
            reactionTime: props.reactionTime ?? this._diff.reactionTime,
            fleeHealthPct: props.fleeHealthPct,
            patrolWait:  props.patrolWait,
            moveSpeed:   props.moveSpeed,
            chaseSpeed:  props.chaseSpeed,
            coverSearch: props.coverSearch,
            // Runtime
            patrol,
            patrolIdx:   0,
            patrolTimer: 0,
            path:        [],
            pathIdx:     0,
            attackTimer: 0,
            alertTimer:  0,
            reactionTimer: 0,
            lastKnownPlayerPos: null,
            coverTarget: null,
            ragdoll:     false,
            _ragdollBodies: [],
        };

        this._enemies.set(id, agent);
        return id;
    }

    // ── Per-frame update ──────────────────────────────────────────────────────

    update(dt) {
        // Refresh player position
        if (this._playerRef) {
            const pp = this._playerRef.getPosition?.() ?? this._playerRef._body?.position;
            if (pp) this._playerPos.set(pp.x, pp.y, pp.z);
        }

        // Decay global alert
        if (this._globalAlertTimer > 0) {
            this._globalAlertTimer -= dt;
            if (this._globalAlertTimer <= 0) this._globalAlertPos = null;
        }

        // Per-enemy tick
        for (const agent of this._enemies.values()) {
            if (agent.state === EnemyState.DEAD) continue;
            agent.mixer?.update(dt);

            // Sync mesh to physics body
            const bp = agent.body.position;
            agent.mesh.position.set(bp.x, bp.y, bp.z);

            // Face toward velocity / chase target
            this._updateFacing(agent, dt);

            // Run behavior tree
            this._tick(agent, dt);

            // Update HUD
            this._updateHealthBar(agent);
        }
    }

    // ── Behavior tree ─────────────────────────────────────────────────────────

    _tick(agent, dt) {
        agent.stateTimer += dt;

        // Sense player from any non-dead state
        const canSense   = agent.state !== EnemyState.DEAD;
        const sees       = canSense && this._canSeePlayer(agent);
        const hears      = canSense && this._canHearPlayer(agent);
        const aware      = sees || hears;

        // Global alert propagation
        if (!aware && agent.state !== EnemyState.ALERT && agent.state !== EnemyState.CHASE) {
            if (this._globalAlertPos &&
                agent.mesh.position.distanceTo(this._globalAlertPos) < this.GLOBAL_ALERT_RADIUS) {
                this._transition(agent, EnemyState.ALERT);
                agent.lastKnownPlayerPos = this._globalAlertPos.clone();
            }
        }

        switch (agent.state) {
            case EnemyState.PATROL: this._tickPatrol(agent, dt, sees, hears); break;
            case EnemyState.ALERT:  this._tickAlert(agent, dt, sees, hears);  break;
            case EnemyState.CHASE:  this._tickChase(agent, dt, sees, hears);  break;
            case EnemyState.ATTACK: this._tickAttack(agent, dt, sees, hears); break;
            case EnemyState.FLEE:   this._tickFlee(agent, dt, sees, hears);   break;
        }
    }

    _tickPatrol(agent, dt, sees, hears) {
        if (sees || hears) {
            this._transition(agent, EnemyState.ALERT);
            this._broadcastAlert(agent);
            return;
        }
        // Move toward current patrol waypoint
        const wp = agent.patrol[agent.patrolIdx];
        const dist = agent.mesh.position.distanceTo(wp);
        if (dist < 0.5) {
            // Reached waypoint — wait
            agent.patrolTimer -= dt;
            if (agent.patrolTimer <= 0) {
                agent.patrolIdx   = (agent.patrolIdx + 1) % agent.patrol.length;
                agent.patrolTimer = agent.patrolWait;
                this._requestPath(agent, agent.patrol[agent.patrolIdx]);
            }
        } else {
            this._followPath(agent, agent.moveSpeed, dt);
        }
    }

    _tickAlert(agent, dt, sees, hears) {
        agent.alertMarker.visible = true;
        agent.alertTimer += dt;

        if (sees || hears) {
            agent.lastKnownPlayerPos = this._playerPos.clone();
            agent.reactionTimer += dt;
            if (agent.reactionTimer >= agent.reactionTime + this._diff.reactionTime * 0.5) {
                agent.alertMarker.visible = false;
                agent.reactionTimer = 0;
                this._transition(agent, EnemyState.CHASE);
                if (this.onEnemyAlerted) this.onEnemyAlerted(agent.id);
            }
        } else if (agent.alertTimer > 5) {
            // Lost interest
            agent.alertMarker.visible = false;
            this._transition(agent, EnemyState.PATROL);
        } else if (agent.lastKnownPlayerPos) {
            // Investigate last known position
            this._followPath(agent, agent.moveSpeed, dt);
        }
    }

    _tickChase(agent, dt, sees, hears) {
        if (!sees && !hears) {
            // Lost sight — go to last known pos
            if (agent.lastKnownPlayerPos) {
                const d = agent.mesh.position.distanceTo(agent.lastKnownPlayerPos);
                if (d < 1.0) {
                    this._transition(agent, EnemyState.ALERT);
                    return;
                }
                this._followPath(agent, agent.chaseSpeed, dt);
            } else {
                this._transition(agent, EnemyState.ALERT);
            }
            return;
        }

        agent.lastKnownPlayerPos = this._playerPos.clone();
        const dist = agent.mesh.position.distanceTo(this._playerPos);

        if (dist <= agent.attackRange && sees) {
            this._transition(agent, EnemyState.ATTACK);
        } else {
            this._requestPath(agent, this._playerPos);
            this._followPath(agent, agent.chaseSpeed, dt);
        }
    }

    _tickAttack(agent, dt, sees, hears) {
        const dist = agent.mesh.position.distanceTo(this._playerPos);

        // If player escaped
        if (!sees || dist > agent.attackRange * 1.3) {
            this._transition(agent, EnemyState.CHASE);
            return;
        }

        agent.lastKnownPlayerPos = this._playerPos.clone();

        // Attack cooldown
        agent.attackTimer -= dt;
        if (agent.attackTimer <= 0) {
            agent.attackTimer = 1.0 / agent.attackRate;
            this._doAttack(agent);
        }

        // Strafe (minor movement while attacking)
        this._strafe(agent, dt);
    }

    _tickFlee(agent, dt, sees, hears) {
        if (agent.coverTarget) {
            const dist = agent.mesh.position.distanceTo(agent.coverTarget);
            if (dist < 0.8) {
                // Reached cover — attack from cover or idle
                this._transition(agent, EnemyState.ATTACK);
                agent.coverTarget = null;
            } else {
                this._followPath(agent, agent.chaseSpeed, dt);
            }
        } else {
            // No cover: flee directly away from player
            const awayDir = this._tmp.copy(agent.mesh.position)
                .sub(this._playerPos).normalize();
            this._moveAlongDir(agent, awayDir, agent.chaseSpeed, dt);
        }
    }

    // ── Sensing ───────────────────────────────────────────────────────────────

    _canSeePlayer(agent) {
        const from = agent.mesh.position;
        const to   = this._playerPos;

        // Distance check
        const dist = from.distanceTo(to);
        if (dist > agent.visionRange) return false;

        // Angle check (enemy faces +Z by default; mesh.rotation.y adjusts facing)
        const facingY = agent.mesh.rotation.y;
        this._dir.copy(to).sub(from).normalize();
        const angle = Math.atan2(this._dir.x, this._dir.z); // world yaw to player
        const delta = this._angleDiff(angle, facingY);
        if (Math.abs(delta) > agent.visionAngle * (Math.PI / 180)) return false;

        // Raycast LOS — blocked by terrain/props
        if (this._raycast) {
            const origin  = from.clone().add(new THREE.Vector3(0, 1.6, 0));
            const target  = to.clone().add(new THREE.Vector3(0, 1.0, 0));
            const hit = this._raycast.raycastPoint(origin, target, 0b0101); // TERRAIN | PROP
            if (hit && hit.distance < dist - 0.5) return false;
        }
        return true;
    }

    _canHearPlayer(agent) {
        if (!this._playerRef) return false;
        const speed = this._playerRef._isSprinting ? 6 : (this._playerRef._isMoving ? 2 : 0);
        if (speed === 0) return false;
        const dist = agent.mesh.position.distanceTo(this._playerPos);
        const effRadius = agent.hearingRadius * (speed > 4 ? 1.5 : 1.0);
        return dist <= effRadius;
    }

    // ── Movement helpers ──────────────────────────────────────────────────────

    _requestPath(agent, target) {
        // Throttle path requests to ~4Hz
        if (agent._pathCooldown > 0) return;
        agent._pathCooldown = 0.25;
        try {
            const start = { x: agent.mesh.position.x, y: agent.mesh.position.y, z: agent.mesh.position.z };
            const end   = { x: target.x, y: target.y, z: target.z };
            agent.path  = this._pathfinding.findPath(start, end) ?? [];
            agent.pathIdx = 0;
        } catch { agent.path = []; }
    }

    _followPath(agent, speed, dt) {
        if (agent._pathCooldown) agent._pathCooldown = Math.max(0, agent._pathCooldown - dt);

        if (!agent.path || agent.path.length === 0) {
            // Direct move if no path
            const dir = this._tmp.copy(this._playerPos).sub(agent.mesh.position).normalize();
            this._moveAlongDir(agent, dir, speed, dt);
            return;
        }

        const wp = agent.path[agent.pathIdx];
        if (!wp) { agent.path = []; return; }

        const wpV = new THREE.Vector3(wp.x, agent.mesh.position.y, wp.z);
        const dist = agent.mesh.position.distanceTo(wpV);

        if (dist < PATH_STEP_DIST * 2) {
            agent.pathIdx++;
            if (agent.pathIdx >= agent.path.length) agent.path = [];
            return;
        }

        const dir = this._tmp.copy(wpV).sub(agent.mesh.position).normalize();
        this._moveAlongDir(agent, dir, speed, dt);
    }

    _moveAlongDir(agent, dir, speed, dt) {
        const move = speed * dt;
        const bv = agent.body.velocity;
        bv.x = dir.x * speed;
        bv.z = dir.z * speed;
        // Preserve Y velocity (gravity)
    }

    _strafe(agent, dt) {
        // Minor left/right strafe while attacking
        const t = agent.stateTimer;
        const side = Math.sin(t * 1.4);
        const facing = agent.mesh.rotation.y;
        const sx = Math.cos(facing + Math.PI / 2) * side;
        const sz = Math.sin(facing + Math.PI / 2) * side;
        agent.body.velocity.x = sx * agent.moveSpeed * 0.6;
        agent.body.velocity.z = sz * agent.moveSpeed * 0.6;
    }

    _updateFacing(agent, dt) {
        const bv = agent.body.velocity;
        const spd = Math.sqrt(bv.x * bv.x + bv.z * bv.z);
        if (spd > 0.2) {
            const targetY = Math.atan2(bv.x, bv.z);
            const cur     = agent.mesh.rotation.y;
            const diff    = this._angleDiff(targetY, cur);
            agent.mesh.rotation.y += diff * Math.min(dt * 10, 1);
        } else if (agent.state === EnemyState.ATTACK || agent.state === EnemyState.ALERT) {
            // Face player
            const toP = this._tmp.copy(this._playerPos).sub(agent.mesh.position);
            agent.mesh.rotation.y = Math.atan2(toP.x, toP.z);
        }
    }

    // ── Attack ────────────────────────────────────────────────────────────────

    _doAttack(agent) {
        const spread = (1 - agent.accuracy) + this._diff.accuracySpread;
        const hit    = Math.random() < (1 - spread);
        if (hit && this.onEnemyAttack) {
            this.onEnemyAttack(agent.id, agent.attackDamage);
        }
    }

    // ── Damage & death ────────────────────────────────────────────────────────

    /**
     * Apply damage to an enemy.
     * @param {string} id
     * @param {number} amount
     * @param {THREE.Vector3} [hitPos]
     */
    damageEnemy(id, amount, hitPos) {
        const agent = this._enemies.get(id);
        if (!agent || agent.state === EnemyState.DEAD) return;

        agent.hp = Math.max(0, agent.hp - amount);

        // Force alert/chase on hit
        if (agent.state === EnemyState.PATROL || agent.state === EnemyState.IDLE) {
            this._transition(agent, EnemyState.CHASE);
            agent.lastKnownPlayerPos = this._playerPos.clone();
            this._broadcastAlert(agent);
        }

        // Flee when low health
        if (agent.hp / agent.maxHp <= agent.fleeHealthPct && agent.coverSearch) {
            const cover = this._findNearestCover(agent);
            if (cover) {
                agent.coverTarget = cover;
                this._requestPath(agent, cover);
                this._transition(agent, EnemyState.FLEE);
            }
        }

        // Death
        if (agent.hp <= 0) {
            this._killEnemy(agent, hitPos);
        }
    }

    _killEnemy(agent, hitPos) {
        this._transition(agent, EnemyState.DEAD);
        agent.alertMarker.visible = false;
        this._activateRagdoll(agent, hitPos);
        this._playClipOnMesh(agent, 'death');

        if (this.onEnemyDied) this.onEnemyDied(agent.id, agent.mesh.position.clone());
    }

    // ── Ragdoll ───────────────────────────────────────────────────────────────

    _activateRagdoll(agent, hitPos) {
        // Remove kinematic physics body
        this._physics.removeBody(agent.body);
        agent.ragdoll = true;

        // Create a few tumbling box bodies as a simple ragdoll approximation
        const parts = [
            { offset: [0, 1.6, 0], size: [0.3, 0.3, 0.3], mass: 10 }, // head
            { offset: [0, 1.0, 0], size: [0.35, 0.45, 0.25], mass: 30 }, // torso
            { offset: [0, 0.4, 0], size: [0.28, 0.5, 0.28], mass: 20 }, // legs
        ];
        const base  = agent.mesh.position;
        const impDx = hitPos ? (hitPos.x - base.x) * 3 : (Math.random() - 0.5) * 4;
        const impDz = hitPos ? (hitPos.z - base.z) * 3 : (Math.random() - 0.5) * 4;

        agent._ragdollBodies = parts.map(p => {
            const rb = this._physics.createBody({
                shape: ShapeType.BOX,
                halfExtents: { x: p.size[0], y: p.size[1], z: p.size[2] },
                mass: p.mass,
                position: {
                    x: base.x + p.offset[0],
                    y: base.y + p.offset[1],
                    z: base.z + p.offset[2],
                },
            });
            rb.velocity.set(impDx, 2 + Math.random() * 2, impDz);
            rb.angularVelocity.set(
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
            );
            return rb;
        });

        // After 6s hide mesh + remove ragdoll bodies to save memory
        setTimeout(() => this._cleanupRagdoll(agent), 6000);
    }

    _cleanupRagdoll(agent) {
        for (const rb of agent._ragdollBodies) {
            this._physics.removeBody(rb);
        }
        agent._ragdollBodies = [];
        agent.mesh.visible = false;
    }

    // ── Cover system ──────────────────────────────────────────────────────────

    _findNearestCover(agent) {
        const pos = agent.mesh.position;
        let best = null, bestDist = Infinity;
        for (const cp of this._coverPoints) {
            const dist = pos.distanceTo(cp.pos);
            if (dist > COVER_SEARCH_R) continue;
            // Prefer cover that shields from player
            const toPlayer = this._tmp.copy(this._playerPos).sub(cp.pos).normalize();
            const coverOk  = cp.normal.dot(toPlayer) < 0.3; // cover faces away from player
            if (coverOk && dist < bestDist) {
                bestDist = dist;
                best = cp.pos;
            }
        }
        return best;
    }

    // ── Alert broadcast ───────────────────────────────────────────────────────

    _broadcastAlert(agent) {
        this._globalAlertPos   = agent.mesh.position.clone();
        this._globalAlertTimer = this.GLOBAL_ALERT_DURATION;
        if (this.onEnemyAlerted) this.onEnemyAlerted(agent.id);
    }

    // ── State transitions ─────────────────────────────────────────────────────

    _transition(agent, newState) {
        if (agent.state === newState) return;
        agent.prevState  = agent.state;
        agent.state      = newState;
        agent.stateTimer = 0;

        // Animation
        const clipMap = {
            [EnemyState.PATROL]: 'walk',
            [EnemyState.ALERT]:  'idle',
            [EnemyState.CHASE]:  'run',
            [EnemyState.ATTACK]: 'attack',
            [EnemyState.FLEE]:   'run',
            [EnemyState.DEAD]:   'death',
        };
        this._playClipOnMesh(agent, clipMap[newState] ?? 'idle');
    }

    // ── Visual helpers ────────────────────────────────────────────────────────

    _makeBoxMesh(id) {
        const geo = new THREE.BoxGeometry(0.7, 1.8, 0.5);
        const mat = new THREE.MeshLambertMaterial({ color: 0xcc4444 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `enemy_${id}`;
        mesh.castShadow = true;
        return mesh;
    }

    _makeHealthBar() {
        const canvas = document.createElement('canvas');
        canvas.width  = 128;
        canvas.height = 16;
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(HP_BAR_W, HP_BAR_H, 1);
        sprite._canvas = canvas;
        sprite._tex    = tex;
        return sprite;
    }

    _makeAlertMarker() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', 32, 50);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
        const spr = new THREE.Sprite(mat);
        spr.scale.set(0.4, 0.4, 1);
        return spr;
    }

    _updateHealthBar(agent) {
        const pct    = agent.hp / agent.maxHp;
        const canvas = agent.hpBar._canvas;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = `#${HP_BG.getHexString()}`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const col = pct > 0.35 ? HP_FG : HP_FG_LOW;
        ctx.fillStyle = `#${col.getHexString()}`;
        ctx.fillRect(0, 0, Math.floor(canvas.width * pct), canvas.height);
        agent.hpBar._tex.needsUpdate = true;
    }

    _playClipOnMesh(agent, name) {
        if (!agent.mixer) return;
        this._playClip(agent.mixer, agent._animations ?? [], name);
    }

    _playClip(mixer, animations, name) {
        const clip = THREE.AnimationClip.findByName(animations, name);
        if (!clip) return;
        const action = mixer.clipAction(clip);
        mixer.stopAllAction();
        action.reset().play();
    }

    // ── Math util ─────────────────────────────────────────────────────────────

    _angleDiff(a, b) {
        let d = a - b;
        while (d >  Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    // ── External query API ────────────────────────────────────────────────────

    /** Returns all living enemies with their positions. */
    getEnemies() {
        const result = [];
        for (const [id, agent] of this._enemies) {
            if (agent.state !== EnemyState.DEAD) {
                result.push({ id, position: agent.mesh.position.clone(), state: agent.state, hp: agent.hp });
            }
        }
        return result;
    }

    /** Returns enemy state for a given id. */
    getEnemyState(id) {
        return this._enemies.get(id)?.state ?? null;
    }

    // ── Serialization ─────────────────────────────────────────────────────────

    serialize() {
        const enemies = {};
        for (const [id, agent] of this._enemies) {
            const bp = agent.body?.position ?? agent.mesh.position;
            enemies[id] = {
                state: agent.state,
                hp:    agent.hp,
                pos:   [bp.x, bp.y, bp.z],
                patrolIdx: agent.patrolIdx,
            };
        }
        return { enemies };
    }

    deserialize(data) {
        if (!data?.enemies) return;
        for (const [id, saved] of Object.entries(data.enemies)) {
            const agent = this._enemies.get(id);
            if (!agent) continue;
            agent.state = saved.state;
            agent.hp    = saved.hp;
            if (saved.pos) {
                agent.mesh.position.set(...saved.pos);
                if (agent.body) agent.body.position.set(...saved.pos);
            }
            if (saved.patrolIdx !== undefined) agent.patrolIdx = saved.patrolIdx;
        }
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose() {
        for (const agent of this._enemies.values()) {
            this._scene.remove(agent.mesh);
            agent.mesh.traverse(c => {
                c.geometry?.dispose();
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material?.dispose();
            });
            if (!agent.ragdoll) this._physics.removeBody(agent.body);
            for (const rb of agent._ragdollBodies) this._physics.removeBody(rb);
        }
        this._enemies.clear();
        this._pathfinding.dispose();
    }
}
