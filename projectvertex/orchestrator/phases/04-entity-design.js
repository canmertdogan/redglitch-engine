const fs = require('fs');
const path = require('path');
const { askForJson } = require('../llmClient');
const config = require('../../config');

const SYSTEM_TEMPLATE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'prompts', 'entity-design.system.txt'),
    'utf8'
);

const ITEM_IDS = [
    'health_potion', 'mana_potion', 'iron_sword', 'gold_coin', 'xp_gem',
    'key_bronze', 'key_silver', 'key_gold', 'bomb', 'arrow', 'antidote',
    'stamina_potion', 'fire_resist_potion', 'ice_resist_potion', 'lightning_resist_potion'
];

function validateEntityDesign(obj, concept) {
    if (!obj || !Array.isArray(obj.entities)) {
        throw new Error('entities must be an array');
    }
    if (obj.entities.length < 3 || obj.entities.length > 6) {
        throw new Error('entities must contain between 3 and 6 items');
    }

    const seenIds = new Set();
    let enemyCount = 0, npcCount = 0, itemCount = 0;

    obj.entities.forEach((e, i) => {
        if (!e || typeof e.id !== 'string' || !e.id.trim()) {
            throw new Error(`entities[${i}].id must be a non-empty string`);
        }
        if (!/^[a-z][a-z0-9_]*$/.test(e.id)) {
            throw new Error(`entities[${i}].id must be snake_case (lowercase, underscores)`);
        }
        if (seenIds.has(e.id)) {
            throw new Error(`entities[${i}].id "${e.id}" is not unique`);
        }
        seenIds.add(e.id);

        if (!['enemy', 'npc', 'item'].includes(e.category)) {
            throw new Error(`entities[${i}].category must be "enemy", "npc", or "item"`);
        }
        if (e.category === 'enemy') enemyCount++;
        else if (e.category === 'npc') npcCount++;
        else if (e.category === 'item') itemCount++;

        if (!e.name || typeof e.name !== 'string' || e.name.length > 30) {
            throw new Error(`entities[${i}].name required, max 30 chars`);
        }
        if (!e.sprite || typeof e.sprite !== 'string') {
            throw new Error(`entities[${i}].sprite required`);
        }

        if (e.category === 'enemy' || e.category === 'npc') {
            if (!e.stats || typeof e.stats !== 'object') {
                throw new Error(`entities[${i}].stats required for ${e.category}`);
            }
            const stats = e.stats;
            ['hp', 'speed', 'damage', 'xp', 'defense', 'attackSpeed'].forEach(s => {
                if (typeof stats[s] !== 'number') throw new Error(`entities[${i}].stats.${s} must be a number`);
            });
            if (e.category === 'enemy') {
                if (stats.hp < 10 || stats.hp > 500) throw new Error(`entities[${i}].stats.hp must be 10-500`);
                if (stats.damage < 1 || stats.damage > 100) throw new Error(`entities[${i}].stats.damage must be 1-100`);
            } else {
                if (stats.hp !== 1) throw new Error(`entities[${i}].stats.hp must be 1 for NPC`);
                if (stats.damage !== 0) throw new Error(`entities[${i}].stats.damage must be 0 for NPC`);
                if (stats.xp !== 0) throw new Error(`entities[${i}].stats.xp must be 0 for NPC`);
            }

            if (!e.ai || typeof e.ai !== 'object') {
                throw new Error(`entities[${i}].ai required for ${e.category}`);
            }
            const ai = e.ai;
            if (!['patrol', 'chase', 'static', 'ranged', 'boss', 'wander', 'guard'].includes(ai.type)) {
                throw new Error(`entities[${i}].ai.type must be patrol|chase|static|ranged|boss|wander|guard`);
            }
            ['range', 'attackRange', 'patrolRadius', 'cooldown'].forEach(f => {
                if (typeof ai[f] !== 'number') throw new Error(`entities[${i}].ai.${f} must be a number`);
            });

            if (e.category === 'npc' && (typeof e.dialogue !== 'string' || !e.dialogue.trim())) {
                throw new Error(`entities[${i}].dialogue (a non-empty string) is required for NPCs`);
            }

            if (!e.animations || typeof e.animations !== 'object') {
                throw new Error(`entities[${i}].animations required`);
            }
            ['idle', 'run', 'attack', 'hit', 'death'].forEach(a => {
                if (!e.animations[a] || typeof e.animations[a] !== 'object') {
                    throw new Error(`entities[${i}].animations.${a} required`);
                }
                if (typeof e.animations[a].sprite !== 'string') throw new Error(`entities[${i}].animations.${a}.sprite required`);
                if (typeof e.animations[a].speed !== 'number' || e.animations[a].speed < 0.05 || e.animations[a].speed > 1.0) {
                    throw new Error(`entities[${i}].animations.${a}.speed must be 0.05-1.0`);
                }
            });

            if (!Array.isArray(e.lootTable)) throw new Error(`entities[${i}].lootTable must be array`);
            e.lootTable.forEach((loot, li) => {
                if (!ITEM_IDS.includes(loot.itemId)) {
                    throw new Error(`entities[${i}].lootTable[${li}].itemId must be a valid item ID`);
                }
                if (typeof loot.chance !== 'number' || loot.chance < 0 || loot.chance > 1) {
                    throw new Error(`entities[${i}].lootTable[${li}].chance must be 0-1`);
                }
                if (typeof loot.minQty !== 'number' || typeof loot.maxQty !== 'number' || loot.minQty > loot.maxQty) {
                    throw new Error(`entities[${i}].lootTable[${li}].minQty/maxQty invalid`);
                }
            });
        } else if (e.category === 'item') {
            if (!e.itemType || !['consumable', 'equipment', 'material', 'key', 'quest'].includes(e.itemType)) {
                throw new Error(`entities[${i}].itemType must be consumable|equipment|material|key|quest`);
            }
            if (!e.properties || typeof e.properties !== 'object') {
                throw new Error(`entities[${i}].properties required for item`);
            }
        }
    });

    if (enemyCount < 1) throw new Error('At least 1 enemy required');
    if (enemyCount > 3) throw new Error('Max 3 enemies');
    if (npcCount > 2) throw new Error('Max 2 NPCs');
    if (itemCount > 2) throw new Error('Max 2 items');

    return obj;
}

async function runEntityDesignPhase(concept, options = {}) {
    const systemPrompt = SYSTEM_TEMPLATE;
    const userPrompt = `Game concept:\nTitle: ${concept.title}\nGenre: ${concept.genre || 'unknown'}\nEngine: ${concept.engineType}\nPitch: ${concept.pitch}`;

    return askForJson({
        systemPrompt,
        userPrompt,
        maxTokens: options.maxTokens ?? 4000,
        temperature: options.temperature ?? 0.6,
        maxRetries: options.maxRetries ?? config.MAX_RETRIES.entities,
        clientKeys: options.clientKeys,
        validate: (obj) => validateEntityDesign(obj, concept),
    });
}

module.exports = { runEntityDesignPhase };