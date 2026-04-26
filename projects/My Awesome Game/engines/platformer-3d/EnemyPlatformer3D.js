/**
 * EnemyPlatformer3D.js — Phase 49
 *
 * Enemy management for the platformer-3d engine.
 *
 * Enemy types:
 *   walker  — Patrols between waypoints on the ground; reverses at edges/walls
 *   flyer   — Sine-wave hover path above its spawn point; follows player X/Z
 *   shooter — Line-of-sight check; fires projectiles toward player; stays put
 *   boss    — Multi-phase; health thresholds trigger pattern changes
 *
 * Combat:
 *   Stomp kill:    Player lands on top (player vy < 0, overlap > top STOMP_BAND) → enemy dies
 *   Contact damage: Side overlap → player takes damage (1 hit, invincibility gated)
 *   Enemy knockback: On damage taken → velocity impulse away from hit direction
 *   Respawn: configurable per enemy (respawnOnCheckpoint | never)
 *
 * Enemy appearance:
 *   Low-poly flat-shaded box mesh (GLTF model load attempted; fallback to colored box).
 *   Health bar billboard above head.
 *
 * Usage:
 *   const enemies = new EnemyPlatformer3D({ scene, physics, assets, palette, audio });
 *   enemies.setPlayerRef(charController);
 *   enemies.loadFromLevel(levelData);      // spawn from entities array
 *   enemies.update(dt);                    // per-frame AI + collision
 *   enemies.onShockwave(pos, force);       // ground-pound shockwave hits
 *   enemies.clear();
 *
 *   enemies.onEnemyDied = (id) => {};
 *   enemies.onPlayerHit = (damage) => {};
 */

import * as THREE from '../../lib/three/three.module.js';
import { BodyType, ShapeType } from '../shared/Physics3DWorld.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Stomp detection: player must be within this Y-band above enemy top. */
const STOMP_BAND        = 0.7;
/** Player downward velocity threshold to register a stomp. */
const STOMP_VY_THRESH   = -1.5;
/** Contact damage radius (XZ only — side collision). */
const CONTACT_RADIUS    = 1.0;
/** Height above centre for stomp detection (half of enemy height). */
const ENEMY_HALF_HEIGHT = 0.6;

/** Walker speed (m/s). */
const WALKER_SPEED      = 2.2;
/** Walker edge-detect ray length (m). */
const WALKER_EDGE_RAY   = 0.7;
/** Flyer altitude above spawn Y. */
const FLYER_ALTITUDE    = 2.0;
/** Flyer vertical bob amplitude (m). */
const FLYER_BOB_AMP     = 0.4;
/** Flyer bob frequency (rad/s). */
const FLYER_BOB_FREQ    = 1.4;
/** Flyer follow speed (X/Z, m/s). */
const FLYER_FOLLOW_SPEED = 1.8;
/** Shooter line-of-sight range (m). */
const SHOOTER_LOS_RANGE = 12;
/** Shooter fire rate (shots/second). */
const SHOOTER_FIRE_RATE = 0.8;
/** Projectile speed (m/s). */
const PROJECTILE_SPEED  = 10;
/** Projectile lifetime (seconds). */
const PROJECTILE_LIFE   = 3.0;
/** Projectile radius for player-hit test (m). */
const PROJECTILE_RADIUS = 0.3;

/** Knockback impulse on damage (m/s). */
const KNOCKBACK_SPEED   = 6;
/** Knockback duration (seconds). */
const KNOCKBACK_DUR     = 0.25;

/** Shockwave kill radius (m). */
const SHOCKWAVE_KILL_RADIUS = 3.5;

/** Boss health thresholds for phase changes. */
const BOSS_PHASE2_PCT   = 0.6;   // 60% HP → phase 2
const BOSS_PHASE3_PCT   = 0.25;  // 25% HP → phase 3

// ── EnemyState enum ───────────────────────────────────────────────────────────

export const EnemyState = Object.freeze({
    PATROL: 'patrol',
    ALERT:  'alert',
    ATTACK: 'attack',
    HURT:   'hurt',
    DEAD:   'dead',
});

// ── EnemyPlatformer3D ─────────────────────────────────────────────────────────

export default class EnemyPlatformer3D {

    /**
     * @param {object}        systems
     * @param {THREE.Scene}   systems.scene
     * @param {Physics3DWorld} systems.physics
     * @param {AssetLoader3D} [systems.assets]
     * @param {PaletteManager} [systems.palette]
     * @param {AudioSpatial3D} [systems.audio]
     */
    constructor({ scene, physics, assets = null, palette = null, audio = null }) {
        this._scene   = scene;
        this._physics = physics;
        this._assets  = assets;
        this._palette = palette;
        this._audio   = audio;

        /** @type {Map<string, EnemyRecord>} */
        this._enemies     = new Map();
        /** @type {Array<ProjectileRecord>} */
        this._projectiles = [];
        this._nextId      = 1;

        // Player reference (CharacterController3D)
        this._player      = null;

        // Collision meshes for walker edge-detect
        this._collisionMeshes = [];

        // Shared geometry cache
        this._geoCache    = {};

        // Callbacks
        this.onEnemyDied  = null;   // (id: string) => void
        this.onPlayerHit  = null;   // (damage: number) => void
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────────────────────────

    setPlayerRef(charController) {
        this._player = charController;
    }

    setCollisionMeshes(meshes) {
        this._collisionMeshes = meshes;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Level loading
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Spawn enemies from level entity array.
     * Recognized entity types: 'enemy_walker', 'enemy_flyer', 'enemy_shooter', 'enemy_boss'
     */
    async loadFromLevel(levelData) {
        const entities = levelData.entities ?? [];
        for (const ent of entities) {
            if (!ent.type?.startsWith('enemy_')) continue;
            const kind = ent.type.slice(7);  // 'walker' | 'flyer' | 'shooter' | 'boss'
            await this._spawnEnemy(ent.id ?? `enemy_${this._nextId++}`, kind, ent);
        }
    }

    async _spawnEnemy(id, kind, def) {
        const props  = def.properties ?? {};
        const [x, y, z] = def.position ?? [0, 1, 0];
        const pos    = new THREE.Vector3(x, y, z);
        const hp     = props.health ?? this._defaultHp(kind);

        // Mesh: try GLTF, fallback to colored box
        let mesh;
        if (props.modelUrl && this._assets) {
            try {
                const gltf = await this._assets.loadGLTF(props.modelUrl);
                mesh = gltf.scene;
                mesh.traverse(c => {
                    if (c.isMesh) {
                        c.material = new THREE.MeshLambertMaterial({ color: c.material?.color ?? 0xffffff, flatShading: true });
                        c.castShadow = true;
                    }
                });
            } catch { mesh = this._makeBoxMesh(kind); }
        } else {
            mesh = this._makeBoxMesh(kind);
        }
        mesh.position.copy(pos);
        this._scene.add(mesh);

        // Health bar billboard
        const hpBar = this._makeHealthBar(hp, hp);
        mesh.add(hpBar);

        // Patrol waypoints for walkers
        const waypoints = (props.patrol ?? []).map(p => new THREE.Vector3(p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z));
        if (waypoints.length === 0) waypoints.push(pos.clone());

        const record = {
            id,
            kind,
            mesh,
            hpBar,
            pos:          pos.clone(),
            velocity:     new THREE.Vector3(),
            hp,
            maxHp:        hp,
            state:        EnemyState.PATROL,
            // Walker state
            waypointIdx:  0,
            waypoints,
            dir:          new THREE.Vector3(1, 0, 0),
            // Flyer state
            spawnY:       y,
            bobPhase:     Math.random() * Math.PI * 2,
            // Shooter state
            fireCooldown: 0,
            // Knockback state
            knockbackVel: new THREE.Vector3(),
            knockbackTimer: 0,
            // Boss state
            bossPhase:    1,
            // Config
            respawn:      props.respawn ?? 'never',
            spawnPos:     pos.clone(),
            damage:       props.damage  ?? 1,
        };

        this._enemies.set(id, record);
    }

    _defaultHp(kind) {
        return kind === 'boss' ? 20 : kind === 'shooter' ? 3 : 2;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Update — call every frame
    // ─────────────────────────────────────────────────────────────────────────

    update(dt) {
        const playerPos = this._player?.getPosition?.() ?? null;
        const playerVy  = this._player?._body?.velocity?.y ?? 0;

        for (const en of this._enemies.values()) {
            if (en.state === EnemyState.DEAD) continue;

            // ── Knockback tick ──────────────────────────────────────────────
            if (en.knockbackTimer > 0) {
                en.knockbackTimer -= dt;
                en.pos.addScaledVector(en.knockbackVel, dt);
                en.mesh.position.copy(en.pos);
                continue;  // skip AI while knocked back
            }

            // ── Type-specific AI ────────────────────────────────────────────
            switch (en.kind) {
                case 'walker':  this._updateWalker(en, dt, playerPos);  break;
                case 'flyer':   this._updateFlyer(en, dt, playerPos);   break;
                case 'shooter': this._updateShooter(en, dt, playerPos); break;
                case 'boss':    this._updateBoss(en, dt, playerPos);    break;
            }

            // ── Sync mesh position ──────────────────────────────────────────
            en.mesh.position.copy(en.pos);

            // ── Player collision ────────────────────────────────────────────
            if (playerPos) {
                this._checkPlayerCollision(en, playerPos, playerVy);
            }
        }

        // ── Projectiles ─────────────────────────────────────────────────────
        this._updateProjectiles(dt, playerPos);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Walker AI
    // ─────────────────────────────────────────────────────────────────────────

    _updateWalker(en, dt, playerPos) {
        if (en.waypoints.length > 1) {
            // Move toward current waypoint
            const target = en.waypoints[en.waypointIdx];
            const toTarget = new THREE.Vector3(target.x - en.pos.x, 0, target.z - en.pos.z);
            const dist = toTarget.length();

            if (dist < 0.3) {
                // Reached waypoint — advance
                en.waypointIdx = (en.waypointIdx + 1) % en.waypoints.length;
            } else {
                toTarget.normalize();
                en.dir.copy(toTarget);
                en.pos.x += toTarget.x * WALKER_SPEED * dt;
                en.pos.z += toTarget.z * WALKER_SPEED * dt;
                en.mesh.rotation.y = Math.atan2(toTarget.x, toTarget.z);
            }
        } else {
            // Single-point patrol: walk until edge/wall then reverse
            en.pos.x += en.dir.x * WALKER_SPEED * dt;
            en.pos.z += en.dir.z * WALKER_SPEED * dt;
            en.mesh.rotation.y = Math.atan2(en.dir.x, en.dir.z);

            // Edge detection: raycast down-forward
            if (this._collisionMeshes.length > 0) {
                const edgeOrigin = en.pos.clone().add(
                    new THREE.Vector3(en.dir.x * 0.5, 0.1, en.dir.z * 0.5)
                );
                const ray = new THREE.Raycaster(edgeOrigin, new THREE.Vector3(0, -1, 0));
                ray.far = WALKER_EDGE_RAY;
                const hits = ray.intersectObjects(this._collisionMeshes, false);
                if (hits.length === 0) {
                    en.dir.negate();
                }

                // Wall detection: raycast forward
                const wallRay = new THREE.Raycaster(en.pos.clone(), en.dir.clone());
                wallRay.far = 0.6;
                const wallHits = wallRay.intersectObjects(this._collisionMeshes, false);
                if (wallHits.length > 0) {
                    en.dir.negate();
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Flyer AI
    // ─────────────────────────────────────────────────────────────────────────

    _updateFlyer(en, dt, playerPos) {
        en.bobPhase += FLYER_BOB_FREQ * dt;

        // Hover altitude
        en.pos.y = en.spawnY + FLYER_ALTITUDE + Math.sin(en.bobPhase) * FLYER_BOB_AMP;

        if (playerPos) {
            // Slowly follow player X/Z
            const dx = playerPos.x - en.pos.x;
            const dz = playerPos.z - en.pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 2) {
                en.pos.x += (dx / dist) * FLYER_FOLLOW_SPEED * dt;
                en.pos.z += (dz / dist) * FLYER_FOLLOW_SPEED * dt;
                en.mesh.rotation.y = Math.atan2(dx, dz);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Shooter AI
    // ─────────────────────────────────────────────────────────────────────────

    _updateShooter(en, dt, playerPos) {
        if (!playerPos) return;

        if (en.fireCooldown > 0) { en.fireCooldown -= dt; return; }

        const toPlayer = new THREE.Vector3(
            playerPos.x - en.pos.x,
            playerPos.y - en.pos.y,
            playerPos.z - en.pos.z
        );
        const dist = toPlayer.length();

        if (dist > SHOOTER_LOS_RANGE) return;

        // Face player
        en.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

        // Fire projectile
        this._fireProjectile(en.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), toPlayer.normalize(), en.damage);
        en.fireCooldown = 1 / SHOOTER_FIRE_RATE;
        this._audio?.playEffect?.('enemy_shoot', en.pos);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Boss AI (multi-phase)
    // ─────────────────────────────────────────────────────────────────────────

    _updateBoss(en, dt, playerPos) {
        if (!playerPos) return;

        const hpPct = en.hp / en.maxHp;

        // Phase transitions
        let newPhase = 1;
        if (hpPct <= BOSS_PHASE3_PCT)     newPhase = 3;
        else if (hpPct <= BOSS_PHASE2_PCT) newPhase = 2;

        if (newPhase !== en.bossPhase) {
            en.bossPhase = newPhase;
            this._onBossPhaseChange(en, newPhase);
        }

        // Phase behaviours: each phase adds more aggression
        const fireRate = SHOOTER_FIRE_RATE * (1 + (en.bossPhase - 1) * 0.8);
        const chaseSpeed = WALKER_SPEED * en.bossPhase * 0.6;

        // Always move toward player (unlike static shooter)
        const dx = playerPos.x - en.pos.x;
        const dz = playerPos.z - en.pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 2) {
            en.pos.x += (dx / dist) * chaseSpeed * dt;
            en.pos.z += (dz / dist) * chaseSpeed * dt;
            en.mesh.rotation.y = Math.atan2(dx, dz);
        }

        // Shoot in phase 2+
        if (en.bossPhase >= 2) {
            if (en.fireCooldown > 0) {
                en.fireCooldown -= dt;
            } else {
                const dir = new THREE.Vector3(dx, playerPos.y - en.pos.y, dz).normalize();
                this._fireProjectile(en.pos.clone().add(new THREE.Vector3(0, 1, 0)), dir, en.damage);
                en.fireCooldown = 1 / fireRate;
            }
        }

        // Phase 3: fire spread (3 projectiles)
        if (en.bossPhase === 3 && en.fireCooldown <= 0) {
            const base = new THREE.Vector3(dx, 0, dz).normalize();
            const spread = Math.PI / 8;
            [-spread, 0, spread].forEach(angle => {
                const rotated = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                rotated.y = (playerPos.y - en.pos.y) / Math.max(1, dist);
                this._fireProjectile(en.pos.clone().add(new THREE.Vector3(0, 1, 0)), rotated.normalize(), en.damage);
            });
            en.fireCooldown = 1 / fireRate;
        }
    }

    _onBossPhaseChange(en, phase) {
        // Visual hint: flash mesh material
        const color = phase === 2 ? 0xff8800 : 0xff0000;
        en.mesh.traverse(c => {
            if (c.isMesh) c.material.color.set(color);
        });
        this._audio?.playEffect?.('boss_phase', en.pos);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Player collision — stomp + contact damage
    // ─────────────────────────────────────────────────────────────────────────

    _checkPlayerCollision(en, playerPos, playerVy) {
        const dx = playerPos.x - en.pos.x;
        const dy = playerPos.y - en.pos.y;
        const dz = playerPos.z - en.pos.z;
        const xzDist = Math.sqrt(dx * dx + dz * dz);

        // ── Stomp check ─────────────────────────────────────────────────────
        // Player is above enemy top AND falling
        const enemyTop = en.pos.y + ENEMY_HALF_HEIGHT;
        const stompY   = playerPos.y - enemyTop;  // distance player is above enemy top
        if (
            stompY >= 0 && stompY < STOMP_BAND &&
            xzDist < CONTACT_RADIUS &&
            playerVy < STOMP_VY_THRESH
        ) {
            this._killEnemy(en, 'stomp');
            return;
        }

        // ── Contact damage ──────────────────────────────────────────────────
        const contactXZ = xzDist < CONTACT_RADIUS;
        const contactY  = Math.abs(dy) < ENEMY_HALF_HEIGHT * 2;
        if (contactXZ && contactY) {
            this.onPlayerHit?.(en.damage);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Projectiles
    // ─────────────────────────────────────────────────────────────────────────

    _fireProjectile(origin, direction, damage = 1) {
        const geo  = new THREE.OctahedronGeometry(0.18, 0);
        const mat  = new THREE.MeshLambertMaterial({ color: 0xff3300, flatShading: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(origin);
        this._scene.add(mesh);

        this._projectiles.push({
            mesh,
            dir:    direction.clone().normalize(),
            life:   PROJECTILE_LIFE,
            damage,
        });
    }

    _updateProjectiles(dt, playerPos) {
        for (let i = this._projectiles.length - 1; i >= 0; i--) {
            const proj = this._projectiles[i];
            proj.life -= dt;

            // Move
            proj.mesh.position.addScaledVector(proj.dir, PROJECTILE_SPEED * dt);
            proj.mesh.rotation.x += 4 * dt;
            proj.mesh.rotation.z += 3 * dt;

            // Hit player
            if (playerPos) {
                const d = proj.mesh.position.distanceTo(
                    new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z)
                );
                if (d < PROJECTILE_RADIUS + 0.4) {
                    this.onPlayerHit?.(proj.damage);
                    this._removeProjectile(i);
                    continue;
                }
            }

            // Hit world
            if (this._collisionMeshes.length > 0) {
                const ray = new THREE.Raycaster(proj.mesh.position.clone(), proj.dir.clone());
                ray.far = PROJECTILE_SPEED * dt + 0.2;
                const hits = ray.intersectObjects(this._collisionMeshes, false);
                if (hits.length > 0) {
                    this._removeProjectile(i);
                    continue;
                }
            }

            if (proj.life <= 0) {
                this._removeProjectile(i);
            }
        }
    }

    _removeProjectile(idx) {
        const proj = this._projectiles[idx];
        this._scene.remove(proj.mesh);
        proj.mesh.geometry?.dispose();
        proj.mesh.material?.dispose();
        this._projectiles.splice(idx, 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Damage & death
    // ─────────────────────────────────────────────────────────────────────────

    damageEnemy(id, amount = 1, hitPos = null) {
        const en = this._enemies.get(id);
        if (!en || en.state === EnemyState.DEAD) return;

        en.hp -= amount;
        this._updateHealthBar(en);
        this._audio?.playEffect?.('enemy_hurt', en.pos);

        // Knockback away from hit source
        if (hitPos) {
            const awayDir = new THREE.Vector3(
                en.pos.x - hitPos.x,
                0,
                en.pos.z - hitPos.z
            ).normalize();
            en.knockbackVel.copy(awayDir.multiplyScalar(KNOCKBACK_SPEED));
            en.knockbackTimer = KNOCKBACK_DUR;
        }

        if (en.hp <= 0) {
            this._killEnemy(en, 'damage');
        }
    }

    _killEnemy(en, cause) {
        en.state = EnemyState.DEAD;
        en.hp    = 0;

        this._scene.remove(en.mesh);
        en.mesh.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });

        this._audio?.playEffect?.('enemy_die', en.pos);
        this.onEnemyDied?.(en.id);

        // If stomp: bounce player upward (caller notified via return — engine checks onEnemyDied)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Ground-pound shockwave
    // ─────────────────────────────────────────────────────────────────────────

    onShockwave(pos, force) {
        const pv = new THREE.Vector3(pos.x, pos.y, pos.z);
        for (const en of this._enemies.values()) {
            if (en.state === EnemyState.DEAD) continue;
            const dist = en.pos.distanceTo(pv);
            if (dist < SHOCKWAVE_KILL_RADIUS) {
                // Closer = more damage
                const dmg = dist < SHOCKWAVE_KILL_RADIUS * 0.4 ? 99 : 1;
                this.damageEnemy(en.id, dmg, pos);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Health bar billboard
    // ─────────────────────────────────────────────────────────────────────────

    _makeHealthBar(hp, maxHp) {
        const group = new THREE.Group();

        // Track sprite (always faces camera — handled in update via lookAt if needed)
        const bgGeo  = new THREE.PlaneGeometry(1.2, 0.18);
        const bgMat  = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
        const bg     = new THREE.Mesh(bgGeo, bgMat);
        bg.name      = 'hp_bg';

        const fillGeo = new THREE.PlaneGeometry(1.2, 0.18);
        const fillMat = new THREE.MeshBasicMaterial({ color: 0x27ae60, side: THREE.DoubleSide });
        const fill    = new THREE.Mesh(fillGeo, fillMat);
        fill.name     = 'hp_fill';
        fill.position.z = 0.001;

        group.add(bg);
        group.add(fill);
        group.position.y = ENEMY_HALF_HEIGHT * 2 + 0.3;
        return group;
    }

    _updateHealthBar(en) {
        const fill = en.hpBar?.getObjectByName('hp_fill');
        if (!fill) return;
        const pct = Math.max(0, en.hp / en.maxHp);
        fill.scale.x = pct;
        fill.position.x = (pct - 1) * 0.6;
        // Color: green → yellow → red
        const color = pct > 0.5 ? 0x27ae60 : pct > 0.25 ? 0xf39c12 : 0xe74c3c;
        fill.material.color.set(color);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Box mesh builders
    // ─────────────────────────────────────────────────────────────────────────

    _makeBoxMesh(kind) {
        const colors = { walker: 0xe74c3c, flyer: 0x9b59b6, shooter: 0xe67e22, boss: 0xc0392b };
        const scales = { walker: [0.8, 1.2, 0.8], flyer: [0.7, 0.5, 0.7], shooter: [0.6, 1.4, 0.6], boss: [1.6, 2.0, 1.6] };

        const [sx, sy, sz] = scales[kind] ?? [1, 1, 1];
        const geo  = new THREE.BoxGeometry(sx, sy, sz);
        geo.computeVertexNormals();
        const mat  = new THREE.MeshLambertMaterial({ color: colors[kind] ?? 0xff0000, flatShading: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        return mesh;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Clear / destroy
    // ─────────────────────────────────────────────────────────────────────────

    clear() {
        for (const en of this._enemies.values()) {
            if (en.state !== EnemyState.DEAD) {
                this._scene.remove(en.mesh);
                en.mesh.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
            }
        }
        this._enemies.clear();

        for (let i = this._projectiles.length - 1; i >= 0; i--) {
            this._removeProjectile(i);
        }

        for (const geo of Object.values(this._geoCache)) geo.dispose();
        this._geoCache = {};
    }

    destroy() { this.clear(); }
}
