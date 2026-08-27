// Client-side mirror of orchestrator/phases/07-campaign-build.js's placement
// merge, so mid-wizard playtest (worldLevel / entities stages) shows exactly
// what the final build will contain — without a round-trip to the campaign
// endpoint. Keep the rules in sync with the server phase if they change.

import type { Level, EntitiesResult, EntityDesignResult } from './api';

const ENGINE_TYPES_3D = ['fps-3d', 'topdown-3d', 'platformer-3d'];
const WORLD_UNIT_3D = 4;

function buildCategoryById(entityDesign: EntityDesignResult | null): Record<string, string> {
    const map: Record<string, string> = {};
    for (const def of entityDesign?.entities || []) {
        if (def.id && def.category) map[def.id] = def.category;
    }
    return map;
}

function build2DDecorations(placed: EntitiesResult['entities'], categoryById: Record<string, string>) {
    const decorations: { type: string; x: number; y: number; data: string }[] = [];
    for (const e of placed) {
        const category = categoryById[e.type];
        if (category === 'enemy') decorations.push({ type: 'enemy', x: e.x, y: e.y, data: e.type });
        else if (category === 'npc') decorations.push({ type: 'npc', x: e.x, y: e.y, data: e.type });
        else if (category === 'item') decorations.push({ type: 'chest', x: e.x, y: e.y, data: e.type });
    }
    return decorations;
}

function buildPlatformerPlacements(placed: EntitiesResult['entities'], categoryById: Record<string, string>) {
    const entities: Record<string, unknown>[] = [];
    const collectibles: { type: 'coin'; x: number; y: number }[] = [];
    for (const e of placed) {
        const category = categoryById[e.type];
        if (category === 'enemy') {
            entities.push({ type: 'enemy', id: `vertex_${e.type}_${e.x}_${e.y}`, x: e.x, y: e.y, sprite: 'slime', behavior: 'patrol', hp: 2, speed: 0.7 });
        } else if (category === 'npc') {
            entities.push({ type: 'enemy', id: `vertex_npc_${e.type}_${e.x}_${e.y}`, x: e.x, y: e.y, sprite: 'slime', behavior: 'static', hp: 100, speed: 0 });
        } else if (category === 'item') {
            collectibles.push({ type: 'coin', x: e.x, y: e.y });
        }
    }
    return { entities, collectibles };
}

function sampleElevation(heightMap: number[] | undefined, width: number, height: number, gx: number, gz: number): number {
    if (!heightMap) return 0;
    const ix = Math.max(0, Math.min(width - 1, Math.round(gx)));
    const iz = Math.max(0, Math.min(height - 1, Math.round(gz)));
    return Number(heightMap[iz * width + ix]) || 0;
}

export function mergePlacementsForPreview(
    engineType: string,
    level: Level,
    entities: EntitiesResult | null,
    entityDesign: EntityDesignResult | null,
): Level {
    const placed = entities?.entities || [];
    const categoryById = buildCategoryById(entityDesign);

    if (ENGINE_TYPES_3D.includes(engineType)) {
        const width = level.width;
        const height = level.height;
        const heightMap = (level.terrain as { heightMap?: number[] } | undefined)?.heightMap;
        const projected = placed.map((e) => ({
            type: e.type,
            position: [e.x * WORLD_UNIT_3D, sampleElevation(heightMap, width, height, e.x, e.y), e.y * WORLD_UNIT_3D],
        }));
        return { ...level, entities: projected };
    }

    if (engineType === 'platformer-2d') {
        const { entities: platformerEntities, collectibles } = buildPlatformerPlacements(placed, categoryById);
        return { ...level, entities: platformerEntities, collectibles };
    }

    const decorations = [...(level.decorations || []), ...build2DDecorations(placed, categoryById)];
    return { ...level, decorations };
}
