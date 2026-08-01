// Thin fetch wrappers — these only ever talk to projectvertex's own Express
// server (proxied to :4100 in dev, same-origin in prod/Vercel). The browser
// never talks to the LLM provider directly; API keys stay client-side and
// are sent with each request (not stored on server).

export interface PhaseParams {
    temperature?: number;
    maxTokens?: number;
    maxRetries?: number;
}

export interface ClientKeys {
    openrouter?: string;
    'opencode-zen'?: string;
    cerebras?: string;
}

export interface ServerConfig {
    supportedEngineTypes: string[];
    allEngineTypes: string[];
    defaultWidth: number;
    defaultHeight: number;
    minGrid: number;
    maxGrid: number;
    maxGrid3d: number;
    availableProviders: string[];
    defaultProvider: string;
    defaultModel: string;
    defaults: {
        concept: Required<PhaseParams>;
        worldLevel: Required<PhaseParams>;
        entityDesign: Required<PhaseParams>;
        entities: Required<PhaseParams>;
        logic: Required<PhaseParams>;
    };
}

export interface Concept {
    title: string;
    genre?: string;
    pitch: string;
    engineType: string;
    engineTypeChosenByLlm: string;
}

export interface Project {
    name: string;
    redglitchJson: Record<string, unknown>;
}

export interface Level {
    width: number;
    height: number;
    type?: string;
    tilesetPath?: string;
    layers?: number[][];
    spawn?: { x: number; y: number };
    collision?: number[];
    // 3D engines (fps-3d/topdown-3d/platformer-3d) only:
    engineType?: string;
    name?: string;
    geometry?: Record<string, unknown>[];
    worldW?: number;
    worldH?: number;
    biome?: string;
    skybox?: Record<string, unknown>;
    terrain?: { heightMap: number[]; cellSize: number; foliage?: Record<string, unknown>[]; waterLevel?: number; waterColorHex?: string };
    enemies?: Record<string, unknown>[];
}

export interface EntitiesResult {
    entities: { type: string; x: number; y: number }[];
}

export interface EntityDesignResult {
    entities: {
        id: string;
        category: 'enemy' | 'npc' | 'item';
        name: string;
        sprite: string;
        stats: Record<string, number>;
        ai: Record<string, number | string>;
        animations: Record<string, { sprite: string; speed: number }>;
        lootTable: { itemId: string; chance: number; minQty: number; maxQty: number }[];
        itemType?: string;
        properties?: Record<string, unknown>;
        dialogue?: string;
    }[];
}

export interface LogicGraph {
    name: string;
    variables: { name: string; value: unknown }[];
    nodes: { id: string; type: string; data: Record<string, unknown> }[];
    wires: { id: string; fromNode: string; fromPort: string; toNode: string; toPort: string }[];
    skipped?: boolean;
}

export type PreviewEntity = { type: string; x: number; y: number } | { type: string; position: number[] };

export interface CampaignBuild {
    project: string;
    levelId: string;
    level: Level & { entities: PreviewEntity[] };
    campaign: Record<string, unknown>;
    validation: { valid: boolean; errors: string[]; warnings: string[]; hasWarnings: boolean };
    entityDefinitions?: {
        enemies: Record<string, unknown>;
        npcs: Record<string, unknown>;
        items: Record<string, unknown>;
    };
}

async function asJson(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function post(path: string, body: unknown) {
    return fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then(asJson);
}

// Get stored client API keys from localStorage
export function getClientKeys(): ClientKeys {
    if (typeof window === 'undefined') return {};
    try {
        const stored = localStorage.getItem('projectvertex_client_keys');
        if (stored) return JSON.parse(stored);
    } catch {}
    return {};
}

// Store client API keys in localStorage
export function setClientKeys(keys: ClientKeys) {
    if (typeof window === 'undefined') return;
    const current = getClientKeys();
    const merged = { ...current, ...keys };
    localStorage.setItem('projectvertex_client_keys', JSON.stringify(merged));
}

// Clear all stored keys
export function clearClientKeys() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('projectvertex_client_keys');
}

export function fetchConfig(): Promise<ServerConfig> {
    return fetch('/api/config').then(asJson);
}

export async function runConceptPhase(prompt: string, engineOverride: string, params: PhaseParams): Promise<Concept> {
    const { concept } = await post('/api/phases/concept', { prompt, engineOverride, params, clientKeys: getClientKeys() });
    return concept;
}

export async function runScaffoldPhase(concept: Concept): Promise<Project> {
    const { project } = await post('/api/phases/scaffold', { concept });
    return project;
}

export async function runWorldLevelPhase(concept: Concept, width: number, height: number, params: PhaseParams): Promise<Level> {
    const { level } = await post('/api/phases/world-level', { concept, width, height, params, clientKeys: getClientKeys() });
    return level;
}

export async function runEntityDesignPhase(concept: Concept, params: PhaseParams): Promise<EntityDesignResult> {
    const { entityDesign } = await post('/api/phases/entity-design', { concept, params, clientKeys: getClientKeys() });
    return entityDesign;
}

export async function runEntitiesPhase(concept: Concept, entityDesign: EntityDesignResult, width: number, height: number, params: PhaseParams): Promise<EntitiesResult> {
    const { entities } = await post('/api/phases/entities', { concept, entityDesign, width, height, params, clientKeys: getClientKeys() });
    return entities;
}

export async function runLogicPhase(concept: Concept, entityDesign: EntityDesignResult, params: PhaseParams): Promise<LogicGraph> {
    const { logic } = await post('/api/phases/logic', { concept, entityDesign, params, clientKeys: getClientKeys() });
    return logic;
}

export function runCampaignPhase(concept: Concept, project: Project, level: Level, entities: EntitiesResult, entityDesign: EntityDesignResult): Promise<CampaignBuild> {
    return post('/api/phases/campaign', { concept, project, level, entities, entityDesign });
}

export async function downloadZip(project: Project, level: unknown, campaign: unknown, entityDesign?: EntityDesignResult, logic?: LogicGraph) {
    const res = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, level, campaign, entityDesign, logic }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function sendChat(message: string, opts: { temperature?: number; maxTokens?: number } = {}) {
    return post('/api/chat', { message, ...opts, clientKeys: getClientKeys() });
}