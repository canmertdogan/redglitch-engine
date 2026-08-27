/**
 * AbilitySystem3D.js — Phase 17
 * Ability casting, cooldowns, damage types, buffs/debuffs, and
 * targeting reticles for the topdown-3d engine.
 *
 * Ability shape types:
 *   PROJECTILE — fires a moving object toward a target point / unit
 *   AOE        — instant circle of effect at target position
 *   LINE       — rectangular line from caster to target
 *   CONE       — fan-shaped area in front of caster
 *   SELF       — instant effect on caster only
 *
 * Damage types:
 *   PHYSICAL — reduced by entity.stats.defense
 *   MAGICAL  — reduced by entity.stats.resistance
 *   TRUE     — bypasses all resistances
 *
 * Buff/debuff schema:
 *   { id, type:'buff'|'debuff', stat, amount, duration, stacks, maxStacks }
 *
 * Usage:
 *   const ab = new AbilitySystem3D(scene, entities, vfx, palette);
 *   ab.registerAbility(def);            // see AbilityDef below
 *   ab.castAbility(casterId, abilityId, targetPos, targetId?);
 *   ab.update(dt);
 *   ab.getCooldownFraction(entityId, abilityId); // 0=ready, 1=just cast
 *   ab.serialize() / ab.deserialize(data)
 *   ab.dispose();
 */

import * as THREE from '/lib/three/three.module.js';

// ─── Enums ────────────────────────────────────────────────────────────────────
export const AbilityShape = Object.freeze({
    PROJECTILE: 'projectile',
    AOE:        'aoe',
    LINE:       'line',
    CONE:       'cone',
    SELF:       'self',
});

export const DamageType = Object.freeze({
    PHYSICAL: 'physical',
    MAGICAL:  'magical',
    TRUE:     'true',
});

export const BuffType = Object.freeze({
    SPEED_UP:    'speed_up',
    SPEED_DOWN:  'speed_down',
    ATTACK_UP:   'attack_up',
    ATTACK_DOWN: 'attack_down',
    DEFENSE_UP:  'defense_up',
    DEFENSE_DOWN:'defense_down',
    STUN:        'stun',
    REGEN:       'regen',
    POISON:      'poison',
    SHIELD:      'shield',
});

// Stat that each BuffType modifies
const BUFF_STAT_MAP = {
    speed_up:    'speed',
    speed_down:  'speed',
    attack_up:   'attack',
    attack_down: 'attack',
    defense_up:  'defense',
    defense_down:'defense',
    stun:        'stunned',
    regen:       'hp',        // tick-based
    poison:      'hp',        // tick-based negative
    shield:      'shieldHp',
};

// ─── Reticle colours per shape ────────────────────────────────────────────────
const RETICLE_COLOR = {
    [AbilityShape.AOE]:        0xff4444,
    [AbilityShape.LINE]:       0xff8800,
    [AbilityShape.CONE]:       0xffdd00,
    [AbilityShape.PROJECTILE]: 0x44ddff,
    [AbilityShape.SELF]:       0x88ff44,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Damage formula: raw − resistance (never below 0). */
function calcDamage(raw, type, targetStats) {
    switch (type) {
        case DamageType.PHYSICAL: return Math.max(0, raw - (targetStats.defense    ?? 0));
        case DamageType.MAGICAL:  return Math.max(0, raw - (targetStats.resistance ?? 0));
        case DamageType.TRUE:     return raw;
        default:                  return raw;
    }
}

/** Returns true if `pos` (XZ) is inside an AoE circle. */
function inCircle(pos, centre, radius) {
    const dx = pos.x - centre.x, dz = pos.z - centre.z;
    return dx*dx + dz*dz <= radius * radius;
}

/** Returns true if `pos` is within a line rectangle (caster → target). */
function inLine(pos, origin, target, width) {
    const dx = target.x - origin.x, dz = target.z - origin.z;
    const len = Math.sqrt(dx*dx + dz*dz) || 1e-9;
    const ux = dx / len, uz = dz / len;       // forward axis
    const rx = -uz,      rz =  ux;            // right axis
    const lx = pos.x - origin.x, lz = pos.z - origin.z;
    const fwd  = lx * ux + lz * uz;
    const side = lx * rx + lz * rz;
    return fwd >= 0 && fwd <= len && Math.abs(side) <= width * 0.5;
}

/** Returns true if `pos` is inside a cone (origin → direction, halfAngle). */
function inCone(pos, origin, direction, range, halfAngleDeg) {
    const dx = pos.x - origin.x, dz = pos.z - origin.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > range) return false;
    const px = dx / (dist || 1e-9), pz = dz / (dist || 1e-9);
    const dot = px * direction.x + pz * direction.z;
    return dot >= Math.cos((halfAngleDeg * Math.PI) / 180);
}

// ─── Reticle builder ──────────────────────────────────────────────────────────
function buildReticle(shape, def) {
    const color  = RETICLE_COLOR[shape] ?? 0xffffff;
    const mat    = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.45,
        side: THREE.DoubleSide, depthWrite: false,
    });
    let geo;
    switch (shape) {
        case AbilityShape.AOE: {
            geo = new THREE.CircleGeometry(def.radius ?? 3, 24);
            break;
        }
        case AbilityShape.LINE: {
            const len = def.range ?? 8;
            const w   = def.width ?? 1.5;
            geo = new THREE.PlaneGeometry(w, len);
            break;
        }
        case AbilityShape.CONE: {
            const ang = ((def.halfAngleDeg ?? 30) * Math.PI) / 180;
            geo = new THREE.ConeGeometry(
                Math.tan(ang) * (def.range ?? 6), def.range ?? 6, 16, 1, true
            );
            break;
        }
        case AbilityShape.PROJECTILE: {
            geo = new THREE.CircleGeometry(0.4, 8);
            break;
        }
        default:
            geo = new THREE.CircleGeometry(0.6, 8);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;   // lie flat on XZ
    mesh.renderOrder = 11;
    mesh.name = `reticle_${shape}`;
    return mesh;
}

// ─── Projectile ───────────────────────────────────────────────────────────────
class Projectile3D {
    constructor(id, def, origin, target, casterId, palette) {
        this.id        = id;
        this.def       = def;
        this.casterId  = casterId;
        this.target    = target.clone ? target.clone() : new THREE.Vector3(target.x, target.y, target.z);
        this.targetId  = def._targetId ?? null;
        this.alive     = true;
        this.travelT   = 0;
        this.travelDur = (new THREE.Vector3().subVectors(this.target, origin).length()) / (def.speed ?? 12);

        // Low-poly voxel projectile mesh
        const size = def.projectileSize ?? 0.4;
        const geo  = new THREE.OctahedronGeometry(size, 0);
        const col  = palette?.getColor(def.paletteIndex ?? 16) ?? 0x44ddff;
        const mat  = new THREE.MeshLambertMaterial({ color: col, flatShading: true });
        this.mesh  = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(origin);
        this.mesh.name = `projectile_${id}`;

        this.origin = origin.clone();
    }

    update(dt) {
        if (!this.alive) return;
        this.travelT = Math.min(1, this.travelT + dt / (this.travelDur || 0.1));
        this.mesh.position.lerpVectors(this.origin, this.target, this.travelT);
        this.mesh.rotation.y += dt * 4;
        if (this.travelT >= 1) this.alive = false;
    }

    dispose(scene) {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

// ─── AbilitySystem3D ──────────────────────────────────────────────────────────
export default class AbilitySystem3D {
    /**
     * @param {THREE.Scene}    scene
     * @param {Object}         entities  EntitySystem3D instance
     * @param {Object|null}    vfx       VFXSystem3D instance (Phase 18, may be null)
     * @param {Object|null}    palette   PaletteManager instance
     */
    constructor(scene, entities, vfx = null, palette = null) {
        this._scene    = scene;
        this._entities = entities;
        this._vfx      = vfx;
        this._palette  = palette;

        // ability definitions: id → AbilityDef
        this._defs = new Map();

        // per-entity cooldown timers: entityId → Map<abilityId, timerRemaining>
        this._cooldowns = new Map();

        // active buffs: entityId → Buff[]
        this._buffs = new Map();

        // active projectiles
        this._projectiles = new Map();
        this._projCounter = 0;

        // active reticles (for preview before cast): shape → Mesh
        this._reticles = new Map();
        this._reticleGroup = new THREE.Group();
        this._reticleGroup.name = 'ability_reticles';
        this._reticleGroup.visible = false;
        scene.add(this._reticleGroup);

        // Event callbacks: 'onHit', 'onDeath', 'onBuff', 'onDebuff'
        this._listeners = new Map([
            ['onHit',    []],
            ['onDeath',  []],
            ['onBuff',   []],
            ['onDebuff', []],
        ]);

        // Buff tick accumulator
        this._buffTickAcc = 0;
        this._BUFF_TICK   = 1.0;  // seconds between regen/poison ticks
    }

    // ── Ability registration ──────────────────────────────────────────────────
    /**
     * Register an ability definition.
     * @param {Object} def AbilityDef:
     *   { id, name, shape, damageType, damage, range, radius, width,
     *     halfAngleDeg, speed, cooldown, buffs[], debuffs[],
     *     paletteIndex, projectileSize, cost:{ mana, stamina } }
     */
    registerAbility(def) {
        if (!def?.id) { console.warn('[AbilitySystem3D] registerAbility: missing id'); return; }
        this._defs.set(def.id, {
            shape:        AbilityShape.AOE,
            damageType:   DamageType.PHYSICAL,
            damage:       10,
            range:        6,
            radius:       3,
            width:        2,
            halfAngleDeg: 30,
            speed:        12,
            cooldown:     2,
            cost:         {},
            buffs:        [],
            debuffs:      [],
            paletteIndex: 16,
            ...def,
        });
    }

    getAbilityDef(id) { return this._defs.get(id) ?? null; }

    // ── Cooldown helpers ──────────────────────────────────────────────────────
    _ensureCooldownMap(entityId) {
        if (!this._cooldowns.has(entityId)) this._cooldowns.set(entityId, new Map());
        return this._cooldowns.get(entityId);
    }

    /** 0 = ready, fraction = cooling down (0→1 as it cools). */
    getCooldownFraction(entityId, abilityId) {
        const timer = this._cooldowns.get(entityId)?.get(abilityId) ?? 0;
        const def   = this._defs.get(abilityId);
        if (!def || def.cooldown <= 0) return 0;
        return clamp(timer / def.cooldown, 0, 1);
    }

    isReady(entityId, abilityId) {
        return (this._cooldowns.get(entityId)?.get(abilityId) ?? 0) <= 0;
    }

    // ── Cast ──────────────────────────────────────────────────────────────────
    /**
     * Cast an ability from a caster entity toward a world position / entity.
     * @param {string} casterId
     * @param {string} abilityId
     * @param {THREE.Vector3} targetPos  World position of cast target
     * @param {string|null}   targetId   Optional direct-target entity id
     * @returns {boolean} true if cast succeeded
     */
    castAbility(casterId, abilityId, targetPos, targetId = null) {
        const def = this._defs.get(abilityId);
        if (!def) { console.warn(`[AbilitySystem3D] unknown ability: ${abilityId}`); return false; }

        if (!this.isReady(casterId, abilityId)) return false;

        const caster = this._entities?.getEntity(casterId);
        if (!caster) return false;

        // Resource check
        if (def.cost?.mana && caster.stats.mana < def.cost.mana) return false;
        if (def.cost?.stamina && caster.stats.stamina < def.cost.stamina) return false;

        // Deduct resources
        if (def.cost?.mana)    caster.stats.mana    = Math.max(0, caster.stats.mana - def.cost.mana);
        if (def.cost?.stamina) caster.stats.stamina = Math.max(0, caster.stats.stamina - def.cost.stamina);

        // Start cooldown
        this._ensureCooldownMap(casterId).set(abilityId, def.cooldown);

        const casterPos = caster.root.position;
        const dir = new THREE.Vector3()
            .subVectors(targetPos, casterPos)
            .setY(0)
            .normalize();

        // Execute shape
        switch (def.shape) {
            case AbilityShape.PROJECTILE:
                this._spawnProjectile(def, casterId, casterPos, targetPos, targetId);
                break;
            case AbilityShape.AOE:
                this._resolveAoe(def, casterId, targetPos);
                break;
            case AbilityShape.LINE:
                this._resolveLine(def, casterId, casterPos, targetPos);
                break;
            case AbilityShape.CONE:
                this._resolveCone(def, casterId, casterPos, dir);
                break;
            case AbilityShape.SELF:
                this._resolveSelf(def, casterId);
                break;
        }

        // Trigger VFX on cast origin (Phase 18 will add more detail)
        this._vfx?.spawnEffect('cast', casterPos, { paletteIndex: def.paletteIndex });

        return true;
    }

    // ── Shape resolvers ───────────────────────────────────────────────────────
    _spawnProjectile(def, casterId, origin, targetPos, targetId) {
        def._targetId = targetId;
        const id   = `proj_${this._projCounter++}`;
        const proj = new Projectile3D(id, def, origin.clone().add(new THREE.Vector3(0, 0.8, 0)), targetPos, casterId, this._palette);
        this._scene.add(proj.mesh);
        this._projectiles.set(id, proj);
    }

    _resolveAoe(def, casterId, centre) {
        const targets = this._getEntitiesInCircle(centre, def.radius, casterId);
        for (const t of targets) this._applyHit(def, casterId, t.id, centre);
        this._vfx?.spawnEffect('aoe', centre, { radius: def.radius, paletteIndex: def.paletteIndex });
    }

    _resolveLine(def, casterId, origin, target) {
        const targets = this._getEntitiesInLine(origin, target, def.width, casterId);
        const midPt   = new THREE.Vector3().addVectors(origin, target).multiplyScalar(0.5);
        for (const t of targets) this._applyHit(def, casterId, t.id, midPt);
        this._vfx?.spawnEffect('line', origin, { target, paletteIndex: def.paletteIndex });
    }

    _resolveCone(def, casterId, origin, dir) {
        const targets = this._getEntitiesInCone(origin, dir, def.range, def.halfAngleDeg, casterId);
        const conePt  = origin.clone().addScaledVector(dir, def.range * 0.5);
        for (const t of targets) this._applyHit(def, casterId, t.id, conePt);
        this._vfx?.spawnEffect('cone', origin, { dir, range: def.range, paletteIndex: def.paletteIndex });
    }

    _resolveSelf(def, casterId) {
        this._applyHit(def, casterId, casterId, null);
    }

    // ── Hit application ───────────────────────────────────────────────────────
    _applyHit(def, casterId, targetId, hitPos) {
        const target = this._entities?.getEntity(targetId);
        if (!target) return;

        // Damage
        if (def.damage > 0) {
            const dmg = calcDamage(def.damage, def.damageType, target.stats);
            this._entities?.applyDamage(targetId, dmg);
            this._emit('onHit', { casterId, targetId, damage: dmg, damageType: def.damageType, hitPos });
        }

        // Healing (negative damage field)
        if (def.damage < 0) {
            this._entities?.heal(targetId, Math.abs(def.damage));
        }

        // Apply buffs (on friendly targets — same team)
        const caster = this._entities?.getEntity(casterId);
        if (def.buffs?.length) {
            if (!caster || caster.team === target.team) {
                for (const b of def.buffs) this._applyBuff(targetId, b);
            }
        }

        // Apply debuffs (on enemy targets)
        if (def.debuffs?.length) {
            if (!caster || caster.team !== target.team) {
                for (const d of def.debuffs) this._applyDebuff(targetId, d);
            }
        }

        // VFX at hit point
        if (hitPos) this._vfx?.spawnEffect('hit', hitPos, { paletteIndex: def.paletteIndex });
    }

    // ── Buff / Debuff ─────────────────────────────────────────────────────────
    /**
     * @param {string} entityId
     * @param {Object} buffDef  { id, type, stat?, amount, duration, maxStacks? }
     */
    _applyBuff(entityId, buffDef) {
        if (!this._buffs.has(entityId)) this._buffs.set(entityId, []);
        const list = this._buffs.get(entityId);
        const maxS = buffDef.maxStacks ?? 1;

        const existing = list.filter(b => b.id === buffDef.id);
        if (existing.length >= maxS) {
            // Refresh duration of oldest stack
            existing[0].remaining = buffDef.duration;
        } else {
            list.push({ ...buffDef, remaining: buffDef.duration, type: 'buff' });
            this._applyStatMod(entityId, buffDef, +1);
            this._emit('onBuff', { entityId, buffDef });
        }
    }

    _applyDebuff(entityId, debuffDef) {
        if (!this._buffs.has(entityId)) this._buffs.set(entityId, []);
        const list = this._buffs.get(entityId);
        const maxS = debuffDef.maxStacks ?? 1;

        const existing = list.filter(b => b.id === debuffDef.id);
        if (existing.length >= maxS) {
            existing[0].remaining = debuffDef.duration;
        } else {
            list.push({ ...debuffDef, remaining: debuffDef.duration, type: 'debuff' });
            this._applyStatMod(entityId, debuffDef, +1);
            this._emit('onDebuff', { entityId, debuffDef });
        }
    }

    _applyStatMod(entityId, buffDef, sign) {
        const entity = this._entities?.getEntity(entityId);
        if (!entity) return;
        const stat = BUFF_STAT_MAP[buffDef.id] ?? buffDef.stat;
        if (!stat || !(stat in entity.stats)) return;
        if (buffDef.id !== BuffType.REGEN && buffDef.id !== BuffType.POISON) {
            entity.stats[stat] = (entity.stats[stat] ?? 0) + sign * (buffDef.amount ?? 0);
        }
        if (buffDef.id === BuffType.STUN) entity.ai.state = sign > 0 ? 'stunned' : 'idle';
    }

    _removeStatMod(entityId, buffDef) {
        this._applyStatMod(entityId, buffDef, -1);
    }

    /** Get all active buff/debuff instances for an entity. */
    getBuffs(entityId) {
        return this._buffs.get(entityId) ?? [];
    }

    /** Remove a specific buff/debuff by id. */
    removeBuff(entityId, buffId) {
        const list = this._buffs.get(entityId);
        if (!list) return;
        const idx = list.findIndex(b => b.id === buffId);
        if (idx !== -1) {
            this._removeStatMod(entityId, list[idx]);
            list.splice(idx, 1);
        }
    }

    // ── Targeting area queries ────────────────────────────────────────────────
    _getEntitiesInCircle(centre, radius, excludeId) {
        return (this._entities?.getAllEntities() ?? []).filter(e => {
            if (e.id === excludeId) return false;
            return inCircle(e.root.position, centre, radius);
        });
    }

    _getEntitiesInLine(origin, target, width, excludeId) {
        return (this._entities?.getAllEntities() ?? []).filter(e => {
            if (e.id === excludeId) return false;
            return inLine(e.root.position, origin, target, width);
        });
    }

    _getEntitiesInCone(origin, dir, range, halfAngleDeg, excludeId) {
        return (this._entities?.getAllEntities() ?? []).filter(e => {
            if (e.id === excludeId) return false;
            return inCone(e.root.position, origin, dir, range, halfAngleDeg);
        });
    }

    // ── Reticle (preview) ─────────────────────────────────────────────────────
    /**
     * Show targeting reticle for an ability.
     * @param {string} abilityId
     * @param {THREE.Vector3} worldPos  Current cursor world position
     * @param {THREE.Vector3} [casterPos]
     */
    showReticle(abilityId, worldPos, casterPos = null) {
        const def = this._defs.get(abilityId);
        if (!def) return;

        let reticle = this._reticles.get(abilityId);
        if (!reticle) {
            reticle = buildReticle(def.shape, def);
            this._reticleGroup.add(reticle);
            this._reticles.set(abilityId, reticle);
        }

        reticle.visible = true;
        this._reticleGroup.visible = true;

        switch (def.shape) {
            case AbilityShape.AOE:
            case AbilityShape.PROJECTILE:
                reticle.position.set(worldPos.x, worldPos.y + 0.08, worldPos.z);
                break;
            case AbilityShape.LINE:
                if (casterPos) {
                    const mid = new THREE.Vector3().addVectors(casterPos, worldPos).multiplyScalar(0.5);
                    reticle.position.set(mid.x, mid.y + 0.08, mid.z);
                    const dx = worldPos.x - casterPos.x, dz = worldPos.z - casterPos.z;
                    reticle.rotation.y = Math.atan2(dx, dz);
                }
                break;
            case AbilityShape.CONE:
                if (casterPos) {
                    reticle.position.copy(casterPos).add(new THREE.Vector3(0, 0.08, 0));
                    const dx = worldPos.x - casterPos.x, dz = worldPos.z - casterPos.z;
                    reticle.rotation.y = Math.atan2(dx, dz);
                }
                break;
            default:
                reticle.position.set(worldPos.x, worldPos.y + 0.08, worldPos.z);
        }
    }

    hideReticle(abilityId) {
        const reticle = this._reticles.get(abilityId);
        if (reticle) reticle.visible = false;
    }

    hideAllReticles() {
        this._reticleGroup.visible = false;
        for (const r of this._reticles.values()) r.visible = false;
    }

    // ── Update loop ───────────────────────────────────────────────────────────
    update(dt) {
        // Tick cooldowns
        for (const [entityId, cdMap] of this._cooldowns) {
            for (const [abilId, timer] of cdMap) {
                if (timer > 0) {
                    const newTimer = timer - dt;
                    cdMap.set(abilId, newTimer <= 0 ? 0 : newTimer);
                }
            }
        }

        // Tick buffs / debuffs
        this._buffTickAcc += dt;
        const doTick = this._buffTickAcc >= this._BUFF_TICK;
        if (doTick) this._buffTickAcc -= this._BUFF_TICK;

        for (const [entityId, list] of this._buffs) {
            for (let i = list.length - 1; i >= 0; i--) {
                const buff = list[i];
                buff.remaining -= dt;

                // Tick-based effects (regen/poison) fire once per second
                if (doTick) {
                    if (buff.id === BuffType.REGEN) {
                        this._entities?.heal(entityId, buff.amount ?? 5);
                    } else if (buff.id === BuffType.POISON) {
                        const dmg = calcDamage(buff.amount ?? 3, DamageType.TRUE, {});
                        this._entities?.applyDamage(entityId, dmg);
                        this._emit('onHit', { casterId: null, targetId: entityId, damage: dmg, damageType: DamageType.TRUE });
                    }
                }

                // Expire buff
                if (buff.remaining <= 0) {
                    this._removeStatMod(entityId, buff);
                    list.splice(i, 1);
                }
            }
        }

        // Tick projectiles
        for (const [id, proj] of this._projectiles) {
            proj.update(dt);
            if (!proj.alive) {
                // On-arrive: check for target entity hit
                if (proj.targetId) {
                    this._applyHit(proj.def, proj.casterId, proj.targetId, proj.target);
                } else {
                    // AoE splash at landing
                    this._resolveAoe(proj.def, proj.casterId, proj.target);
                }
                proj.dispose(this._scene);
                this._projectiles.delete(id);
            }
        }
    }

    // ── Event emitter (minimal) ───────────────────────────────────────────────
    on(event, cb) {
        if (this._listeners.has(event)) this._listeners.get(event).push(cb);
    }

    off(event, cb) {
        const arr = this._listeners.get(event);
        if (arr) {
            const idx = arr.indexOf(cb);
            if (idx !== -1) arr.splice(idx, 1);
        }
    }

    _emit(event, data) {
        for (const cb of (this._listeners.get(event) ?? [])) {
            try { cb(data); } catch (e) { console.warn('[AbilitySystem3D] listener error:', e); }
        }
    }

    // ── Serialization ─────────────────────────────────────────────────────────
    serialize() {
        const cooldowns = {};
        for (const [eid, cdMap] of this._cooldowns) {
            cooldowns[eid] = Object.fromEntries(cdMap);
        }
        const buffs = {};
        for (const [eid, list] of this._buffs) {
            buffs[eid] = list.map(b => ({ ...b }));
        }
        return { version: 1, cooldowns, buffs };
    }

    deserialize(data) {
        if (!data || data.version !== 1) return;
        // Restore cooldowns
        this._cooldowns.clear();
        for (const [eid, cdObj] of Object.entries(data.cooldowns ?? {})) {
            this._cooldowns.set(eid, new Map(Object.entries(cdObj).map(([k,v]) => [k, Number(v)])));
        }
        // Restore buffs (stat mods NOT re-applied — entity stats carry saved values)
        this._buffs.clear();
        for (const [eid, list] of Object.entries(data.buffs ?? {})) {
            this._buffs.set(eid, list);
        }
    }

    // ── Dispose ───────────────────────────────────────────────────────────────
    dispose() {
        // Remove projectiles
        for (const proj of this._projectiles.values()) proj.dispose(this._scene);
        this._projectiles.clear();

        // Remove reticles
        for (const r of this._reticles.values()) {
            r.geometry?.dispose();
            r.material?.dispose();
            this._reticleGroup.remove(r);
        }
        this._reticles.clear();
        this._scene.remove(this._reticleGroup);

        this._defs.clear();
        this._cooldowns.clear();
        this._buffs.clear();
        this._listeners.clear();
    }
}
