const CampaignValidator = require('../../validators/campaign');
const config = require('../../config');

const LEVEL_ID = 'level1';
const ENGINE_TYPES_3D = ['fps-3d', 'topdown-3d', 'platformer-3d'];

function sampleElevation(heightMap, width, height, gx, gz) {
    if (!Array.isArray(heightMap)) return 0;
    const ix = Math.max(0, Math.min(width - 1, Math.round(gx)));
    const iz = Math.max(0, Math.min(height - 1, Math.round(gz)));
    return Number(heightMap[iz * width + ix]) || 0;
}

function projectEntitiesTo3D(entities, width, height, level) {
    const unit = config.WORLD_UNIT_3D;
    const heightMap = level.terrain?.heightMap;
    return entities.map((e) => ({
        type: e.type,
        position: [e.x * unit, sampleElevation(heightMap, width, height, e.x, e.y), e.y * unit],
    }));
}

function buildCampaign(concept) {
    return {
        name: concept.title,
        nodes: [
            { id: 'start', type: 'start', next: LEVEL_ID },
            { id: LEVEL_ID, type: 'level', levelId: LEVEL_ID, engineType: concept.engineType },
        ],
    };
}

function buildFallbackCampaign(concept) {
    return {
        name: concept.title,
        nodes: [{ id: LEVEL_ID, type: 'level', levelId: LEVEL_ID, engineType: concept.engineType, start: true }],
    };
}

// Deterministic — no LLM call, no filesystem writes. Assembles the final
// level (entities merged in) and a minimal validated campaign, returned as
// plain data — the caller (server route or cli.js) is responsible for
// zipping/persisting it via zipBuilder.js.
async function runCampaignBuildPhase({ concept, project, level, entities, entityDesign }) {
    const is3D = ENGINE_TYPES_3D.includes(concept.engineType);
    const placedEntities = is3D
        ? projectEntitiesTo3D(entities.entities, level.width, level.height, level)
        : entities.entities;
    const levelData = { ...level, entities: placedEntities };

    if (concept.engineType === 'fps-3d') {
        levelData.enemies = placedEntities.map((e, i) => ({ id: `entity_${i}`, type: e.type, position: e.position }));
    }

    let campaign = buildCampaign(concept);
    const validator = new CampaignValidator();
    let result = await validator.validate(campaign);
    if (result.errors && result.errors.length > 0) {
        campaign = buildFallbackCampaign(concept);
        result = await validator.validate(campaign);
        if (result.errors && result.errors.length > 0) {
            throw new Error(`Campaign failed validation even with fallback: ${result.errors.join('; ')}`);
        }
    }

    // Build entity definitions object for the game engine
    // These go into /dunyalar/definitions/ in the zip
    const entityDefinitions = {
        enemies: {},
        npcs: {},
        items: {}
    };

    if (entityDesign && Array.isArray(entityDesign.entities)) {
        entityDesign.entities.forEach(def => {
            if (def.category === 'enemy') {
                entityDefinitions.enemies[def.id] = def;
            } else if (def.category === 'npc') {
                entityDefinitions.npcs[def.id] = def;
            } else if (def.category === 'item') {
                entityDefinitions.items[def.id] = def;
            }
        });
    }

    return {
        project: project.name,
        levelId: LEVEL_ID,
        level: levelData,
        campaign,
        validation: result,
        entityDefinitions
    };
}

module.exports = { runCampaignBuildPhase };