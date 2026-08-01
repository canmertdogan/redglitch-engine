import { useRef, useState } from 'react';
import {
    ServerConfig, Concept, Project, CampaignBuild, EntityDesignResult, EntitiesResult, Level, LogicGraph,
    runConceptPhase, runScaffoldPhase, runWorldLevelPhase, runEntityDesignPhase, runEntitiesPhase, runLogicPhase, runCampaignPhase, downloadZip,
} from '../api';
import SettingsDrawer, { PipelineSettings } from './SettingsDrawer';
import RetroBackground from './RetroBackground';
import PreviewPlayer from './PreviewPlayer';

interface Props {
    cfg: ServerConfig | null;
}

const SUGGESTIONS = [
    { icon: '▲', text: 'Basit bir platformer oyunu yap' },
    { icon: '◆', text: 'Retro bir zindan RPG\'si tasarla' },
    { icon: '●', text: 'İzometrik bir keşif haritası oluştur' },
    { icon: '▸', text: 'Hızlı tempolu bir aksiyon platformeri kur' },
    { icon: '◈', text: 'Basit bir FPS arena oyunu üret' },
];

const PHASES = [
    { key: 'concept', label: 'Konsept + Engine Seçimi' },
    { key: 'scaffold', label: 'Proje İskeleti' },
    { key: 'worldLevel', label: 'Dünya / Level' },
    { key: 'entityDesign', label: 'Varlık Tasarımı' },
    { key: 'entities', label: 'Varlıklar' },
    { key: 'logic', label: 'Logic (VisualScript)' },
    { key: 'campaignBuild', label: 'Campaign + Build' },
] as const;

type PhaseKey = typeof PHASES[number]['key'];
type PhaseStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
type Stage = 'intro' | 'concept' | 'settings' | 'worldLevel' | 'entityDesign' | 'entities' | 'logic' | 'building' | 'done';

const ENGINE_LABELS: Record<string, string> = {
    'rpg-topdown': 'RPG (Top-down)',
    'platformer-2d': 'Platformer (2D)',
    'iso-pixel': 'İzometrik (Iso-Pixel)',
    'topdown-3d': 'Top-down (3D)',
    'fps-3d': 'FPS (3D)',
    'platformer-3d': 'Platformer (3D)',
    'unified-3d': 'Unified 3D',
};

const AI_TYPES = ['patrol', 'chase', 'static', 'ranged', 'boss', 'wander', 'guard'] as const;

const WIZARD_STEPS: { stage: Stage; label: string }[] = [
    { stage: 'concept', label: 'Konsept' },
    { stage: 'settings', label: 'Ayarlar' },
    { stage: 'worldLevel', label: 'Dünya' },
    { stage: 'entityDesign', label: 'Varlıklar' },
    { stage: 'entities', label: 'Yerleşim' },
    { stage: 'logic', label: 'Logic' },
    { stage: 'done', label: 'Sonuç' },
];

function emptyPhaseState(): Record<PhaseKey, { status: PhaseStatus; detail?: string }> {
    return {
        concept: { status: 'pending' },
        scaffold: { status: 'pending' },
        worldLevel: { status: 'pending' },
        entityDesign: { status: 'pending' },
        entities: { status: 'pending' },
        logic: { status: 'pending' },
        campaignBuild: { status: 'pending' },
    };
}

// ── Logic graph → readable summary (no raw JSON, no graph editor — just a
// per-event bullet list of the reachable action nodes, walked over `wires`).
type LogicNode = LogicGraph['nodes'][number];
const EVENT_TYPES = new Set(['evt_tick', 'evt_interact']);
const FLOW_PORTS: Record<string, string[]> = {
    evt_tick: ['out'], evt_interact: ['out'], flow_branch: ['true', 'false'], flow_wait: ['out'], var_set: ['out'],
};
const EVENT_LABELS: Record<string, string> = { evt_tick: 'Her karede (tick)', evt_interact: 'Etkileşimde (interact)' };
const ACTION_LABELS: Record<string, (data: Record<string, unknown>) => string> = {
    dialogue_show: (d) => `Diyalog göster: "${d.text ?? ''}"${d.speaker ? ` — ${d.speaker}` : ''}`,
    eng_log: (d) => `Log: "${d.msg ?? ''}"`,
    flag_set: (d) => `Flag ayarla: ${d.name ?? '?'} = ${String(d.value ?? true)}`,
    player_damage: (d) => `Oyuncuya hasar ver: ${d.damage ?? '?'}`,
    player_heal: (d) => `Oyuncuyu iyileştir: ${d.amount ?? '?'}`,
    camera_shake: () => 'Kamera sarsıntısı',
    var_set: (d) => `Değişken ayarla: ${d.name ?? '?'}`,
    flow_branch: () => 'Koşullu dallanma',
    flow_wait: (d) => `Bekle: ${d.time ?? '?'}s`,
};

function describeLogicGraph(graph: LogicGraph): { eventLabel: string; lines: string[] }[] {
    const nodesById = new Map<string, LogicNode>(graph.nodes.map((n) => [n.id, n]));
    const events = graph.nodes.filter((n) => EVENT_TYPES.has(n.type));
    return events.map((evt) => {
        const seen = new Set<string>([evt.id]);
        const queue = [evt.id];
        const lines: string[] = [];
        while (queue.length) {
            const id = queue.shift()!;
            const flowPorts = FLOW_PORTS[nodesById.get(id)?.type || ''] || [];
            for (const wire of graph.wires) {
                if (wire.fromNode !== id || !flowPorts.includes(wire.fromPort) || seen.has(wire.toNode)) continue;
                seen.add(wire.toNode);
                queue.push(wire.toNode);
                const target = nodesById.get(wire.toNode);
                if (target && ACTION_LABELS[target.type]) lines.push(ACTION_LABELS[target.type](target.data || {}));
            }
        }
        return { eventLabel: EVENT_LABELS[evt.type] || evt.type, lines };
    });
}

function Composer({ value, onChange, onSubmit, disabled, autoFocus }: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    disabled: boolean;
    autoFocus?: boolean;
}) {
    return (
        <div className="composer">
            <textarea
                autoFocus={autoFocus}
                rows={1}
                value={value}
                placeholder="Ne tür bir oyun yapmak istersin?"
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!disabled && value.trim()) onSubmit();
                    }
                }}
            />
            <button className="send-btn" disabled={disabled || !value.trim()} onClick={onSubmit} aria-label="Gönder">
                ➤
            </button>
        </div>
    );
}

function WizardSteps({ current }: { current: Stage }) {
    const idx = WIZARD_STEPS.findIndex((s) => s.stage === current);
    return (
        <div className="wizard-steps">
            {WIZARD_STEPS.map((s, i) => (
                <div key={s.stage} className={`wizard-step ${i === idx ? 'active' : i < idx ? 'done' : ''}`}>
                    <span className="wizard-step-dot">{i < idx ? '✓' : i + 1}</span>
                    <span className="wizard-step-label">{s.label}</span>
                    {i < WIZARD_STEPS.length - 1 && <span className="wizard-step-line" />}
                </div>
            ))}
        </div>
    );
}

function PhaseTrack({ phaseState }: { phaseState: Record<PhaseKey, { status: PhaseStatus; detail?: string }> }) {
    return (
        <div className="phase-track compact">
            {PHASES.map((p) => {
                const st = phaseState[p.key];
                const icon = st.status === 'done' ? '✓' : st.status === 'error' ? '✕' : st.status === 'running' ? '◐' : st.status === 'skipped' ? '—' : '';
                return (
                    <div key={p.key} className={`phase-item ${st.status}`}>
                        <div className="phase-icon">{icon}</div>
                        <div className="phase-body">
                            <div className="phase-name">{p.label}</div>
                            {st.detail && <div className={`phase-detail ${st.status === 'error' ? 'error-text' : ''}`}>{st.detail}</div>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function PipelineView({ cfg }: Props) {
    const [prompt, setPrompt] = useState('');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [stage, setStage] = useState<Stage>('intro');
    const [conceptLoading, setConceptLoading] = useState(false);
    const [stageLoading, setStageLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [phaseState, setPhaseState] = useState(emptyPhaseState());
    const [submittedPrompt, setSubmittedPrompt] = useState('');
    const [concept, setConcept] = useState<Concept | null>(null);
    const [project, setProject] = useState<Project | null>(null);
    const [level, setLevel] = useState<Level | null>(null);
    const [entityDesign, setEntityDesign] = useState<EntityDesignResult | null>(null);
    const [entities, setEntities] = useState<EntitiesResult | null>(null);
    const [logic, setLogic] = useState<LogicGraph | null>(null);
    const [build, setBuild] = useState<{ concept: Concept; project: Project; level: CampaignBuild['level']; campaign: CampaignBuild; entityDesign: EntityDesignResult; logic: LogicGraph | null } | null>(null);
    const [settings, setSettings] = useState<PipelineSettings>({
        engineOverride: 'auto',
        width: 10,
        height: 8,
        includeEntities: true,
        includeLogic: true,
        concept: { temperature: 0.6, maxTokens: 800, maxRetries: 3 },
        worldLevel: { temperature: 0.4, maxTokens: 32000, maxRetries: 3 },
        entityDesign: { temperature: 0.6, maxTokens: 4000, maxRetries: 5 },
        entities: { temperature: 0.5, maxTokens: 1500, maxRetries: 5 },
        logic: { temperature: 0.4, maxTokens: 1200, maxRetries: 2 },
    });
    const settingsSeeded = useRef(false);

    if (cfg && !settingsSeeded.current) {
        settingsSeeded.current = true;
        setSettings((s) => ({
            ...s,
            width: cfg.defaultWidth,
            height: cfg.defaultHeight,
            concept: cfg.defaults.concept,
            worldLevel: cfg.defaults.worldLevel,
            entityDesign: cfg.defaults.entityDesign,
            entities: cfg.defaults.entities,
            logic: cfg.defaults.logic,
        }));
    }

    function setPhase(key: PhaseKey, status: PhaseStatus, detail?: string) {
        setPhaseState((s) => ({ ...s, [key]: { status, detail } }));
    }

    const includesLogicPhase = () => settings.includeLogic && concept?.engineType === 'rpg-topdown';

    // Step 1: chat prompt -> concept phase only. Stops here so the user can
    // review/adjust the AI's pick before anything else runs.
    async function generateConcept(text: string) {
        setError(null);
        setConceptLoading(true);
        setSubmittedPrompt(text);
        try {
            const c = await runConceptPhase(text, settings.engineOverride, settings.concept);
            setConcept(c);
            setPhaseState(emptyPhaseState());
            setPhase('concept', 'done', `"${c.title}" — ${c.engineType} (LLM: ${c.engineTypeChosenByLlm})`);
            setProject(null);
            setLevel(null);
            setEntityDesign(null);
            setEntities(null);
            setLogic(null);
            setBuild(null);
            setStage('concept');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setConceptLoading(false);
        }
    }

    async function regenerateConcept() {
        if (!submittedPrompt) return;
        await generateConcept(submittedPrompt);
    }

    // Step 3a: scaffold has nothing worth reviewing (it's just naming) — run
    // it inline, then land on the first real checkpoint (world/level).
    async function startBuild() {
        if (!concept) return;
        setError(null);
        setStageLoading(true);
        try {
            setPhase('scaffold', 'running');
            const p = await runScaffoldPhase(concept);
            setProject(p);
            setPhase('scaffold', 'done', p.name);
            setStage('worldLevel');
            await generateWorldLevel();
        } catch (err: any) {
            setPhase('scaffold', 'error', err.message);
            setError(err.message);
            setStageLoading(false);
        }
    }

    async function generateWorldLevel() {
        if (!concept) return;
        setError(null);
        setStageLoading(true);
        try {
            setPhase('worldLevel', 'running');
            const lvl = await runWorldLevelPhase(concept, settings.width, settings.height, settings.worldLevel);
            setLevel(lvl);
            setPhase('worldLevel', 'done', `${lvl.width}×${lvl.height} grid`);
        } catch (err: any) {
            setPhase('worldLevel', 'error', err.message);
            setError(err.message);
        } finally {
            setStageLoading(false);
        }
    }

    async function proceedFromWorldLevel() {
        if (!settings.includeEntities) {
            setPhase('entityDesign', 'skipped');
            setPhase('entities', 'skipped');
            await proceedToLogicOrFinish();
            return;
        }
        setStage('entityDesign');
        await generateEntityDesign();
    }

    async function generateEntityDesign() {
        if (!concept) return;
        setError(null);
        setStageLoading(true);
        try {
            setPhase('entityDesign', 'running');
            const ed = await runEntityDesignPhase(concept, settings.entityDesign);
            setEntityDesign(ed);
            setPhase('entityDesign', 'done', `${ed.entities.length} varlık tasarlandı`);
        } catch (err: any) {
            setPhase('entityDesign', 'error', err.message);
            setError(err.message);
        } finally {
            setStageLoading(false);
        }
    }

    function updateDesignedEntity(index: number, patch: Partial<EntityDesignResult['entities'][number]>) {
        setEntityDesign((ed) => {
            if (!ed) return ed;
            const entities = ed.entities.map((e, i) => (i === index ? { ...e, ...patch } : e));
            return { ...ed, entities };
        });
    }

    function removeDesignedEntity(index: number) {
        setEntityDesign((ed) => (ed ? { ...ed, entities: ed.entities.filter((_, i) => i !== index) } : ed));
    }

    async function proceedFromEntityDesign() {
        setStage('entities');
        await generateEntities();
    }

    async function generateEntities() {
        if (!concept || !entityDesign) return;
        setError(null);
        setStageLoading(true);
        try {
            setPhase('entities', 'running');
            const e = await runEntitiesPhase(concept, entityDesign, settings.width, settings.height, settings.entities);
            setEntities(e);
            setPhase('entities', 'done', `${e.entities.length} varlık yerleştirildi`);
        } catch (err: any) {
            setPhase('entities', 'error', err.message);
            setError(err.message);
        } finally {
            setStageLoading(false);
        }
    }

    function updatePlacedEntity(index: number, patch: Partial<EntitiesResult['entities'][number]>) {
        setEntities((e) => (e ? { entities: e.entities.map((en, i) => (i === index ? { ...en, ...patch } : en)) } : e));
    }

    function removePlacedEntity(index: number) {
        setEntities((e) => (e ? { entities: e.entities.filter((_, i) => i !== index) } : e));
    }

    async function proceedFromEntities() {
        await proceedToLogicOrFinish();
    }

    async function proceedToLogicOrFinish() {
        if (includesLogicPhase()) {
            setStage('logic');
            await generateLogic();
        } else {
            setPhase('logic', 'skipped');
            await finishBuild();
        }
    }

    async function generateLogic() {
        if (!concept) return;
        setError(null);
        setStageLoading(true);
        try {
            setPhase('logic', 'running');
            const lg = await runLogicPhase(concept, entityDesign ?? { entities: [] }, settings.logic);
            setLogic(lg);
            setPhase('logic', lg.skipped ? 'skipped' : 'done', lg.skipped ? undefined : `${lg.nodes.length} node, ${lg.wires.length} wire`);
        } catch (err: any) {
            setPhase('logic', 'error', err.message);
            setError(err.message);
        } finally {
            setStageLoading(false);
        }
    }

    async function proceedFromLogic() {
        await finishBuild();
    }

    async function finishBuild() {
        if (!concept || !project || !level) return;
        setError(null);
        setStageLoading(true);
        setStage('building');
        try {
            setPhase('campaignBuild', 'running');
            const entitiesForBuild = entities ?? { entities: [] };
            const entityDesignForBuild = entityDesign ?? { entities: [] };
            const campaignBuild = await runCampaignPhase(concept, project, level, entitiesForBuild, entityDesignForBuild);
            setPhase('campaignBuild', 'done', `Proje "${campaignBuild.project}" hazır`);
            setBuild({ concept, project, level: campaignBuild.level, campaign: campaignBuild, entityDesign: entityDesignForBuild, logic });
            setStage('done');
        } catch (err: any) {
            setPhase('campaignBuild', 'error', err.message);
            setError(err.message);
        } finally {
            setStageLoading(false);
        }
    }

    async function handleDownload() {
        if (!build) return;
        try {
            await downloadZip(build.project, build.level, build.campaign.campaign, build.entityDesign, build.logic || undefined);
        } catch (err: any) {
            setError(err.message);
        }
    }

    function reset() {
        setStage('intro');
        setPrompt('');
        setSubmittedPrompt('');
        setConcept(null);
        setProject(null);
        setLevel(null);
        setEntityDesign(null);
        setEntities(null);
        setLogic(null);
        setBuild(null);
        setError(null);
        setPhaseState(emptyPhaseState());
    }

    // ── Stage 1: chat hero — the entry point stays a plain prompt + example
    // suggestions, exactly like before; the wizard only starts after this.
    if (stage === 'intro') {
        return (
            <div className="view">
                <div className="hero">
                    <RetroBackground />
                    <div className="hero-content">
                        <div className="hero-title">ProjectVertex</div>
                        <div className="hero-subtitle">
                            <a href="https://github.com/canmertdogan/redglitch-engine" target="_blank" rel="noopener noreferrer" className="engine-link">Redglitch Engine</a>'in 6 gerçek oyun motorunu kullanarak — 2D RPG, izometrik, platformer, 3D FPS, 3D platformer, 3D top-down — kendi oyununu AI ile üret ve anında oyna.
                        </div>
                        <Composer value={prompt} onChange={setPrompt} onSubmit={() => generateConcept(prompt.trim())} disabled={conceptLoading} autoFocus />
                        {conceptLoading && <div className="wizard-loading">Konsept üretiliyor…</div>}
                        <div className="suggestions">
                            {SUGGESTIONS.map((s) => (
                                <button key={s.text} className="suggestion-card" disabled={conceptLoading} onClick={() => setPrompt(s.text)}>
                                    <span className="suggestion-icon">{s.icon}</span>
                                    <span>{s.text}</span>
                                </button>
                            ))}
                        </div>
                        <button className="settings-toggle" onClick={() => setDrawerOpen(true)}>
                            ⚙ Gelişmiş Ayarlar
                        </button>
                        {error && <div className="error-banner">{error}</div>}
                    </div>
                </div>
                <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} cfg={cfg} settings={settings} onChange={setSettings} />
            </div>
        );
    }

    // ── Stages 2+: the wizard proper.
    return (
        <div className="view">
            <div className="transcript-wrap">
                <div className="transcript">
                    <div className="prompt-echo">{submittedPrompt}</div>
                    <WizardSteps current={stage} />

                    {stage === 'concept' && concept && (
                        <div className="wizard-panel">
                            <div className="concept-card">
                                <div className="concept-card-title">{concept.title}</div>
                                {concept.genre && <div className="concept-card-genre">{concept.genre}</div>}
                                <p className="concept-card-pitch">{concept.pitch}</p>
                                <div className="concept-card-engine">
                                    Motor: <strong>{ENGINE_LABELS[concept.engineType] || concept.engineType}</strong>
                                    {concept.engineTypeChosenByLlm !== concept.engineType && (
                                        <span className="wizard-hint"> (AI önerisi: {ENGINE_LABELS[concept.engineTypeChosenByLlm] || concept.engineTypeChosenByLlm})</span>
                                    )}
                                </div>
                            </div>

                            <div className="field">
                                <label>Motoru değiştir</label>
                                <select value={settings.engineOverride} onChange={(e) => setSettings((s) => ({ ...s, engineOverride: e.target.value }))}>
                                    <option value="auto">AI seçsin (auto)</option>
                                    {(cfg?.supportedEngineTypes || []).map((t) => (
                                        <option key={t} value={t}>{ENGINE_LABELS[t] || t}</option>
                                    ))}
                                </select>
                            </div>

                            {error && <div className="error-banner">{error}</div>}

                            <div className="wizard-actions">
                                <button className="secondary" onClick={reset}>← Baştan Başla</button>
                                <button className="secondary" disabled={conceptLoading} onClick={regenerateConcept}>
                                    {conceptLoading ? 'Üretiliyor…' : '↻ Yeniden Üret'}
                                </button>
                                <button className="primary" style={{ marginLeft: 'auto' }} onClick={() => setStage('settings')}>
                                    Devam Et →
                                </button>
                            </div>
                        </div>
                    )}

                    {stage === 'settings' && (() => {
                        const effectiveEngine = settings.engineOverride !== 'auto' ? settings.engineOverride : concept?.engineType;
                        const is3D = effectiveEngine === 'fps-3d' || effectiveEngine === 'topdown-3d' || effectiveEngine === 'platformer-3d';
                        const maxGrid = is3D ? (cfg?.maxGrid3d ?? 128) : (cfg?.maxGrid ?? 16);
                        const minGrid = cfg?.minGrid ?? 4;
                        const clampGrid = (n: number) => Math.min(maxGrid, Math.max(minGrid, Math.round(n) || minGrid));
                        return (
                        <div className="wizard-panel">
                            <div className="field-row">
                                <div className="field">
                                    <label>Grid Genişlik</label>
                                    <input type="number" min={minGrid} max={maxGrid} value={settings.width}
                                        onChange={(e) => setSettings((s) => ({ ...s, width: Number(e.target.value) }))}
                                        onBlur={(e) => setSettings((s) => ({ ...s, width: clampGrid(Number(e.target.value)) }))} />
                                </div>
                                <div className="field">
                                    <label>Grid Yükseklik</label>
                                    <input type="number" min={minGrid} max={maxGrid} value={settings.height}
                                        onChange={(e) => setSettings((s) => ({ ...s, height: Number(e.target.value) }))}
                                        onBlur={(e) => setSettings((s) => ({ ...s, height: clampGrid(Number(e.target.value)) }))} />
                                </div>
                            </div>
                            <div className="field-hint">
                                {is3D
                                    ? `3D arazi (${minGrid}-${maxGrid} hücre) prosedürel olarak üretilir — büyük haritalar daha uzun sürmez, gerçek arazi motoru kullanır.`
                                    : `Bu motor için grid boyutu ${minGrid}-${maxGrid} hücre ile sınırlıdır (her hücre AI tarafından tek tek tasarlanır).`}
                            </div>
                            <div className="toggle-row">
                                <div className="toggle-label">Varlıkları (entities) üret</div>
                                <label className="switch">
                                    <input type="checkbox" checked={settings.includeEntities}
                                        onChange={(e) => setSettings((s) => ({ ...s, includeEntities: e.target.checked }))} />
                                    <span className="switch-track" />
                                </label>
                            </div>
                            <div className="toggle-row">
                                <div className="toggle-label">Logic (VisualScript) üret</div>
                                <label className="switch">
                                    <input type="checkbox" checked={settings.includeLogic}
                                        onChange={(e) => setSettings((s) => ({ ...s, includeLogic: e.target.checked }))} />
                                    <span className="switch-track" />
                                </label>
                            </div>
                            <button className="settings-toggle" onClick={() => setDrawerOpen(true)}>⚙ Model parametreleri</button>

                            {error && <div className="error-banner">{error}</div>}

                            <div className="wizard-actions">
                                <button className="secondary" onClick={() => setStage('concept')}>← Geri</button>
                                <button className="primary" disabled={stageLoading} style={{ marginLeft: 'auto' }} onClick={startBuild}>
                                    {stageLoading ? 'Üretiliyor…' : 'Üretime Başla →'}
                                </button>
                            </div>
                        </div>
                        );
                    })()}

                    {stage === 'worldLevel' && (
                        <div className="wizard-panel">
                            <PhaseTrack phaseState={phaseState} />
                            {level && (
                                <div className="concept-card">
                                    <div className="concept-card-title">Dünya / Level hazır</div>
                                    <div className="concept-card-engine">
                                        {level.width}×{level.height} grid
                                        {level.biome ? ` · biome: ${level.biome}` : ''}
                                        {level.type ? ` · tip: ${level.type}` : ''}
                                    </div>
                                </div>
                            )}
                            {error && <div className="error-banner">{error}</div>}
                            <div className="wizard-actions">
                                <button className="secondary" onClick={() => setStage('settings')}>← Geri</button>
                                <button className="secondary" disabled={stageLoading} onClick={generateWorldLevel}>
                                    {stageLoading ? 'Üretiliyor…' : '↻ Yeniden Üret'}
                                </button>
                                <button className="primary" disabled={stageLoading || !level} style={{ marginLeft: 'auto' }} onClick={proceedFromWorldLevel}>
                                    Devam Et →
                                </button>
                            </div>
                        </div>
                    )}

                    {stage === 'entityDesign' && (
                        <div className="wizard-panel">
                            <PhaseTrack phaseState={phaseState} />
                            {entityDesign && (
                                <div className="entity-design-grid">
                                    {entityDesign.entities.map((e, i) => (
                                        <div key={e.id} className="entity-design-card">
                                            <div className="entity-design-card-header">
                                                <span className={`entity-category-badge cat-${e.category}`}>{e.category}</span>
                                                <button className="entity-remove-btn" onClick={() => removeDesignedEntity(i)} aria-label="Kaldır">✕</button>
                                            </div>
                                            <div className="field">
                                                <label>İsim</label>
                                                <input type="text" value={e.name} maxLength={30}
                                                    onChange={(ev) => updateDesignedEntity(i, { name: ev.target.value })} />
                                            </div>
                                            {(e.category === 'enemy' || e.category === 'npc') && e.stats && (
                                                <div className="field-row">
                                                    <div className="field">
                                                        <label>HP</label>
                                                        <input type="number" value={e.stats.hp}
                                                            onChange={(ev) => updateDesignedEntity(i, { stats: { ...e.stats, hp: Number(ev.target.value) } })} />
                                                    </div>
                                                    {e.category === 'enemy' && (
                                                        <div className="field">
                                                            <label>Hasar</label>
                                                            <input type="number" value={e.stats.damage}
                                                                onChange={(ev) => updateDesignedEntity(i, { stats: { ...e.stats, damage: Number(ev.target.value) } })} />
                                                        </div>
                                                    )}
                                                    <div className="field">
                                                        <label>Hız</label>
                                                        <input type="number" value={e.stats.speed}
                                                            onChange={(ev) => updateDesignedEntity(i, { stats: { ...e.stats, speed: Number(ev.target.value) } })} />
                                                    </div>
                                                </div>
                                            )}
                                            {(e.category === 'enemy' || e.category === 'npc') && e.ai && (
                                                <div className="field">
                                                    <label>AI Davranışı</label>
                                                    <select value={String(e.ai.type)}
                                                        onChange={(ev) => updateDesignedEntity(i, { ai: { ...e.ai, type: ev.target.value } })}>
                                                        {AI_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {error && <div className="error-banner">{error}</div>}
                            <div className="wizard-actions">
                                <button className="secondary" onClick={() => setStage('worldLevel')}>← Geri</button>
                                <button className="secondary" disabled={stageLoading} onClick={generateEntityDesign}>
                                    {stageLoading ? 'Üretiliyor…' : '↻ Yeniden Üret'}
                                </button>
                                <button className="primary" disabled={stageLoading || !entityDesign} style={{ marginLeft: 'auto' }} onClick={proceedFromEntityDesign}>
                                    Devam Et →
                                </button>
                            </div>
                        </div>
                    )}

                    {stage === 'entities' && (
                        <div className="wizard-panel">
                            <PhaseTrack phaseState={phaseState} />
                            {entities && (
                                <div className="entity-row-list">
                                    {entities.entities.map((e, i) => (
                                        <div key={i} className="entity-row">
                                            <span className="entity-row-type">{e.type}</span>
                                            <label className="entity-row-coord">
                                                x
                                                <input type="number" min={0} max={settings.width - 1} value={e.x}
                                                    onChange={(ev) => updatePlacedEntity(i, { x: Number(ev.target.value) })} />
                                            </label>
                                            <label className="entity-row-coord">
                                                y
                                                <input type="number" min={0} max={settings.height - 1} value={e.y}
                                                    onChange={(ev) => updatePlacedEntity(i, { y: Number(ev.target.value) })} />
                                            </label>
                                            <button className="entity-remove-btn" onClick={() => removePlacedEntity(i)} aria-label="Kaldır">✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {error && <div className="error-banner">{error}</div>}
                            <div className="wizard-actions">
                                <button className="secondary" onClick={() => setStage('entityDesign')}>← Geri</button>
                                <button className="secondary" disabled={stageLoading} onClick={generateEntities}>
                                    {stageLoading ? 'Üretiliyor…' : '↻ Yeniden Üret'}
                                </button>
                                <button className="primary" disabled={stageLoading || !entities} style={{ marginLeft: 'auto' }} onClick={proceedFromEntities}>
                                    Devam Et →
                                </button>
                            </div>
                        </div>
                    )}

                    {stage === 'logic' && (
                        <div className="wizard-panel">
                            <PhaseTrack phaseState={phaseState} />
                            {logic && logic.nodes.length > 0 ? (
                                <div className="logic-summary">
                                    {describeLogicGraph(logic).map((group, i) => (
                                        <div key={i} className="logic-event-group">
                                            <div className="logic-event-label">{group.eventLabel}</div>
                                            {group.lines.length > 0 ? (
                                                <ul>
                                                    {group.lines.map((line, j) => <li key={j} className="logic-line">{line}</li>)}
                                                </ul>
                                            ) : (
                                                <div className="logic-line logic-line-empty">(aksiyon yok)</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                !stageLoading && <div className="field-hint">Bu tur için üretilmiş logic yok — Yeniden Üret ile tekrar deneyebilirsin, ya da boş geçip devam edebilirsin.</div>
                            )}
                            {error && <div className="error-banner">{error}</div>}
                            <div className="wizard-actions">
                                <button className="secondary" onClick={() => setStage(settings.includeEntities ? 'entities' : 'worldLevel')}>← Geri</button>
                                <button className="secondary" disabled={stageLoading} onClick={generateLogic}>
                                    {stageLoading ? 'Üretiliyor…' : '↻ Yeniden Üret'}
                                </button>
                                <button className="primary" disabled={stageLoading} style={{ marginLeft: 'auto' }} onClick={proceedFromLogic}>
                                    Devam Et →
                                </button>
                            </div>
                        </div>
                    )}

                    {(stage === 'building' || stage === 'done') && (
                        <div className="wizard-panel">
                            <PhaseTrack phaseState={phaseState} />

                            {error && stage === 'building' && !stageLoading && (
                                <div className="wizard-actions">
                                    <button className="secondary" onClick={() => setStage('settings')}>← Ayarlara Dön</button>
                                    <button className="primary" onClick={finishBuild}>↻ Tekrar Dene</button>
                                </div>
                            )}

                            {build && (
                                <>
                                    <div className="run-done-banner">
                                        <span>✓ Oyun üretildi.</span>
                                        <button className="primary" style={{ marginLeft: 'auto' }} onClick={handleDownload}>
                                            İndir (.zip)
                                        </button>
                                    </div>
                                    <PreviewPlayer engineType={build.concept.engineType} level={build.level} />
                                    <div className="wizard-actions">
                                        <button className="secondary" onClick={reset}>+ Yeni Oyun</button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <SettingsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} cfg={cfg} settings={settings} onChange={setSettings} />
        </div>
    );
}
