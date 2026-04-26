/**
 * Save3D.js — Cross-Engine 3D Save / Load Utilities (Phase 59)
 *
 * ES-module companion to CrossEngineSerializer.js providing:
 *   - Schema-guarded payload wrappers that isolate 3D saves from 2D saves
 *   - Serialization of 3D player state (position, rotation, velocity, vitals)
 *   - A versioned migration chain for forward-compatible saves
 *
 * All three 3D engines import this module in their _buildSavePayload /
 * _applySavePayload methods.  2D engines (rpg-topdown, platformer-2d, iso-pixel)
 * never set the _schema field, so loading a 2D slot in a 3D engine returns null.
 */

export const SAVE_FORMAT_VERSION = '3.0.0';
export const SAVE_3D_SCHEMA      = 'ketebe.3d.save.v3';

// ── Namespace helpers ─────────────────────────────────────────────────────────

/** True when data was written by a 3D engine. */
export function isSave3D(data) {
    return data?._schema === SAVE_3D_SCHEMA;
}

/** True when data was written by a 2D engine (no _schema field). */
export function isSave2D(data) {
    return !!data && !isSave3D(data);
}

// ── Player state ──────────────────────────────────────────────────────────────

/**
 * Serialize 3D player state: position, orientation, velocity, vitals.
 *
 * @param {THREE.Object3D|null} obj  - Player mesh / character object.
 *   Expected to have .position (THREE.Vector3), .quaternion (THREE.Quaternion).
 *   Velocity is read from .velocity | ._velocity | .body.velocity, all Vector3-like.
 * @param {object} vitals - Engine-specific vital fields (hp, coins, lives, …).
 * @returns {object} Plain-object player snapshot.
 */
export function serialize3DPlayerState(obj, vitals = {}) {
    const p = obj?.position ?? { x: 0, y: 0, z: 0 };
    const q = obj?.quaternion ?? { x: 0, y: 0, z: 0, w: 1 };
    const vRaw = obj?.velocity ?? obj?._velocity ?? obj?.body?.velocity ?? { x: 0, y: 0, z: 0 };
    return {
        position:   [p.x, p.y, p.z],
        rotation:   [q.x, q.y, q.z, q.w],   // quaternion xyzw
        velocity:   [vRaw.x ?? 0, vRaw.y ?? 0, vRaw.z ?? 0],
        scale:      [1, 1, 1],               // player scale not normally saved
        hp:          vitals.hp         ?? 100,
        maxHp:       vitals.maxHp      ?? 100,
        mana:        vitals.mana       ?? 0,
        maxMana:     vitals.maxMana    ?? 0,
        stamina:     vitals.stamina    ?? 0,
        maxStamina:  vitals.maxStamina ?? 0,
        coins:       vitals.coins      ?? 0,
        score:       vitals.score      ?? 0,
        lives:       vitals.lives      ?? 3,
    };
}

/**
 * Deserialize a 3D player state snapshot to a plain object.
 * Consumers apply fields to their engine-specific player struct.
 *
 * @param {object} data - Output of serialize3DPlayerState.
 * @returns {{ position, rotation, velocity, scale, hp, maxHp, mana, maxMana,
 *             stamina, maxStamina, coins, score, lives } | null}
 */
export function deserialize3DPlayerState(data) {
    if (!data || typeof data !== 'object') return null;
    return {
        position:   Array.isArray(data.position) ? data.position : [0, 0, 0],
        rotation:   Array.isArray(data.rotation) ? data.rotation : [0, 0, 0, 1],
        velocity:   Array.isArray(data.velocity) ? data.velocity : [0, 0, 0],
        scale:      Array.isArray(data.scale)    ? data.scale    : [1, 1, 1],
        hp:          data.hp         ?? 100,
        maxHp:       data.maxHp      ?? 100,
        mana:        data.mana       ?? 0,
        maxMana:     data.maxMana    ?? 0,
        stamina:     data.stamina    ?? 0,
        maxStamina:  data.maxStamina ?? 0,
        coins:       data.coins      ?? 0,
        score:       data.score      ?? 0,
        lives:       data.lives      ?? 3,
    };
}

// ── Payload wrappers ──────────────────────────────────────────────────────────

/**
 * Wrap engine-specific save data with a 3D schema guard header.
 * Every 3D engine must call this from _buildSavePayload().
 *
 * The _schema field acts as a namespace: loading a 2D save into a 3D engine
 * (or vice versa) is detected and refused by deserializeSavePayload3D().
 *
 * Common extension fields that all 3D engines should populate:
 *   - player:          serialize3DPlayerState() result
 *   - lastCheckpoint:  { id, position[3] } | null
 *   - collectedItems:  Set-as-Array of collected entity IDs for this level
 *   - levelState:      engine-specific live level snapshot
 *
 * @param {string} engineType - 'topdown-3d' | 'fps-3d' | 'platformer-3d'
 * @param {object} engineData - Engine-specific payload fields.
 * @returns {object} Full save payload with schema guard.
 */
export function serializeSavePayload3D(engineType, engineData) {
    return {
        _schema:   SAVE_3D_SCHEMA,
        _version:  SAVE_FORMAT_VERSION,
        engineType,
        savedAt:   Date.now(),
        ...engineData,
    };
}

/**
 * Validate and unwrap a 3D save payload.
 *
 * Returns null (with a console warning) when:
 *   - The data has no _schema (likely a 2D save) or a mismatched schema.
 *   - The engineType doesn't match expectedEngineType (cross-engine collision).
 *
 * On success the data is passed through the migration chain so old saves are
 * transparently upgraded to the current format.
 *
 * @param {object}      data               - Raw JSON from /api/save.
 * @param {string|null} expectedEngineType - Optional engine type assertion.
 * @returns {object|null} Validated, migrated payload or null.
 */
export function deserializeSavePayload3D(data, expectedEngineType = null) {
    if (!data || typeof data !== 'object') return null;

    if (data._schema !== SAVE_3D_SCHEMA) {
        if (data._schema) {
            console.warn(`[Save3D] Incompatible schema "${data._schema}" (expected "${SAVE_3D_SCHEMA}"). Ignoring save.`);
        } else {
            console.warn('[Save3D] No 3D schema guard — file may be a 2D save. Ignoring.');
        }
        return null;
    }

    if (expectedEngineType && data.engineType !== expectedEngineType) {
        console.warn(`[Save3D] Engine type mismatch: got "${data.engineType}", expected "${expectedEngineType}". Ignoring save.`);
        return null;
    }

    return migrateSavePayload(data);
}

// ── Migration chain ───────────────────────────────────────────────────────────

/**
 * Upgrade a 3D save payload from any earlier v3.x release to the current format.
 *
 * Add a migration step here whenever the save schema changes.
 * Each step should be idempotent: re-running it on an already-migrated file
 * must produce the same result.
 *
 * @param {object} data - Payload that has already passed schema validation.
 * @returns {object} Migrated payload.
 */
export function migrateSavePayload(data) {
    if (!data) return data;

    // Normalize missing common fields added in v3.0.0
    if (!Array.isArray(data.collectedItems)) data.collectedItems = [];
    if (data.lastCheckpoint === undefined)   data.lastCheckpoint  = null;
    if (!data.levelState)                    data.levelState      = {};

    // Example future migration (uncomment + adapt when needed):
    //   const v = data._version ?? '1.0.0';
    //   if (v === '3.0.0') data = migrate_3_0_to_3_1(data);

    return data;
}
