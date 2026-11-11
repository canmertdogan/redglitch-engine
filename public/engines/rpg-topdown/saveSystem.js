// saveSystem.js - Handles saving/loading run progress via Backend API
//
// FINDING-SCHEMA: 2D saves used to be schema-less, so any JSON blob (including a
// 3D save written by Save3D.js) could be loaded into a 2D engine. Every payload
// now carries `_schema` + `_version`, and legacy (schema-less) slots are migrated
// on load instead of being rejected.

window.SaveSystem = class SaveSystem {
    static SCHEMA = 'redglitch.2d.save.v1';
    static FORMAT_VERSION = 1;
    static SAVE_3D_SCHEMA_PREFIX = 'redglitch.3d.save.';

    constructor() {
        // No longer using prefix for localStorage
    }

    /**
     * Normalize an on-disk payload into the current 2D save shape.
     * - legacy slots (no `_schema`) are upgraded in place
     * - 3D slots are rejected (a 2D engine must not consume a 3D save)
     * @param {object|null} payload
     * @returns {object|null}
     */
    static migrate(payload) {
        if (!payload || typeof payload !== 'object') return null;

        const schema = payload._schema;
        if (typeof schema === 'string' && schema.startsWith(SaveSystem.SAVE_3D_SCHEMA_PREFIX)) {
            console.warn(`[SaveSystem] Refusing to load 3D save schema "${schema}" in a 2D engine`);
            return null;
        }

        const version = Number.isInteger(payload._version) ? payload._version : 0;
        if (version > SaveSystem.FORMAT_VERSION) {
            console.warn(`[SaveSystem] Save version ${version} is newer than supported ${SaveSystem.FORMAT_VERSION}; loading best-effort`);
        }

        // Migrate v0 (legacy, schema-less) → v1: ensure containers exist.
        const migrated = { ...payload };
        migrated._schema = SaveSystem.SCHEMA;
        migrated._version = Math.max(version, SaveSystem.FORMAT_VERSION);
        if (!migrated.player || typeof migrated.player !== 'object') migrated.player = {};
        if (!migrated.flags || typeof migrated.flags !== 'object') migrated.flags = {};
        if (!Array.isArray(migrated.inventory)) migrated.inventory = [];
        if (!Array.isArray(migrated.activeSkills)) migrated.activeSkills = [];
        if (migrated.player.maxMana === undefined) migrated.player.maxMana = 50;
        if (migrated.player.maxStamina === undefined) migrated.player.maxStamina = 100;
        return migrated;
    }

    async save(username, slotId, gameState) {
        const data = {
            _schema: SaveSystem.SCHEMA,
            _version: SaveSystem.FORMAT_VERSION,
            timestamp: Date.now(),
            level: gameState.level,
            currentLevelId: gameState.currentLevelId,
            campaignNode: gameState.campaignNode,
            flags: gameState.flags || {},
            player: {
                x: gameState.player.x,
                y: gameState.player.y,
                hp: gameState.player.hp,
                maxHp: gameState.player.maxHp,
                mana: gameState.player.mana,
                maxMana: gameState.player.maxMana,
                stamina: gameState.player.stamina,
                maxStamina: gameState.player.maxStamina,
                direction: gameState.player.direction
            },
            inventory: gameState.inventory || [],
            activeSkills: gameState.activeSkills || []
        };
        
        try {
            const response = await fetch(`/api/save/${username}/${slotId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                console.log(`Game saved to backend for ${username}, slot ${slotId}`);
                return true;
            }
            throw new Error('Server responded with error');
        } catch (e) {
            console.error("Save failed", e);
            return false;
        }
    }

    async load(username, slotId) {
        try {
            const response = await fetch(`/api/save/${username}/${slotId}`);
            if (!response.ok) return null;
            const raw = await response.json();
            return SaveSystem.migrate(raw);
        } catch (e) {
            console.error("Load failed", e);
            return null;
        }
    }

    async hasSave(username, slotId) {
        const data = await this.load(username, slotId);
        return !!data;
    }
}
