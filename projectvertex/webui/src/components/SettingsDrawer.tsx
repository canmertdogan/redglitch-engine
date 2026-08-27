import { createPortal } from 'react-dom';
import { useState, useEffect } from 'react';
import { PhaseParams, ServerConfig, ClientKeys, setClientKeys, clearClientKeys, getClientKeys } from '../api';

export interface PipelineSettings {
    engineOverride: string;
    width: number;
    height: number;
    levelCount: number;
    includeEntities: boolean;
    includeLogic: boolean;
    concept: PhaseParams;
    worldLevel: PhaseParams;
    entityDesign: PhaseParams;
    entities: PhaseParams;
    logic: PhaseParams;
}

const ENGINE_LABELS: Record<string, string> = {
    'rpg-topdown': 'RPG (Top-down)',
    'platformer-2d': 'Platformer (2D)',
    'iso-pixel': 'İzometrik (Iso-Pixel)',
    'topdown-3d': 'Top-down (3D)',
    'fps-3d': 'FPS (3D)',
    'platformer-3d': 'Platformer (3D)',
    'unified-3d': 'Unified 3D',
};

const PROVIDER_LABELS: Record<string, string> = {
    'opencode-zen': 'OpenCode Zen',
    openrouter: 'OpenRouter',
    cerebras: 'Cerebras',
};

function PhaseParamsFields({ label, params, onChange }: {
    label: string;
    params: PhaseParams;
    onChange: (p: PhaseParams) => void;
}) {
    return (
        <div className="field-row">
            <div className="field">
                <label>{label} · Temp</label>
                <input type="number" step="0.1" min="0" max="2" value={params.temperature}
                    onChange={(e) => onChange({ ...params, temperature: Number(e.target.value) })} />
            </div>
            <div className="field">
                <label>Max Tokens</label>
                <input type="number" min="16" max="4000" value={params.maxTokens}
                    onChange={(e) => onChange({ ...params, maxTokens: Number(e.target.value) })} />
            </div>
            <div className="field">
                <label>Retry</label>
                <input type="number" min="1" max="10" value={params.maxRetries}
                    onChange={(e) => onChange({ ...params, maxRetries: Number(e.target.value) })} />
            </div>
        </div>
    );
}

interface Props {
    open: boolean;
    onClose: () => void;
    cfg: ServerConfig | null;
    settings: PipelineSettings;
    onChange: (s: PipelineSettings) => void;
}

export default function SettingsDrawer({ open, onClose, cfg, settings, onChange }: Props) {
    if (!open) return null;
    const minGrid = cfg?.minGrid ?? 4;
    const maxGrid = cfg?.maxGrid ?? 16;
    const [storedKeys, setStoredKeys] = useState<ClientKeys>(() => getClientKeys());

    useEffect(() => {
        setStoredKeys(getClientKeys());
    }, []);

    const set = (patch: Partial<PipelineSettings>) => onChange({ ...settings, ...patch });

    const handleKeyChange = (provider: keyof ClientKeys, value: string) => {
        const newKeys = { ...storedKeys, [provider]: value };
        setStoredKeys(newKeys);
        setClientKeys(newKeys);
    };

    const handleClearKeys = () => {
        if (window.confirm('Tüm API anahtarlarını silmek istediğinizden emin misiniz?')) {
            clearClientKeys();
            setStoredKeys({});
        }
    };

    // Rendered via a portal straight into <body>: SettingsDrawer is mounted
    // inside `.view`, which establishes its own stacking context (z-index:1)
    // lower than `.status-bar` (z-index:2) — nesting a fixed-position drawer
    // there traps it behind the status bar no matter what z-index the
    // drawer itself uses, since sibling stacking contexts are compared as a
    // whole. A portal escapes that entirely.
    return createPortal(
        <>
            <div className="drawer-backdrop" onClick={onClose} />
            <div className="drawer">
                <div className="drawer-header">
                    <h2>Gelişmiş Ayarlar</h2>
                    <button className="drawer-close" onClick={onClose}>✕</button>
                </div>
                <div className="drawer-body">
                    <div className="section-label">Sağlayıcı ve API Anahtarları</div>
                    <div className="field">
                        {cfg && cfg.availableProviders.length > 0 ? (
                            <div style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginBottom: 8 }}>
                                Aktif: <strong style={{ color: 'var(--accent-bright)' }}>{cfg.defaultProvider}</strong> · {cfg.defaultModel}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 8 }}>
                                Hiçbir sağlayıcı yapılandırılmadı — sunucuda OPENCODE_API_KEY, OPENROUTER_API_KEY veya CEREBRAS_API_KEY ortam değişkenlerinden birini set edin.
                            </div>
                        )}
                        <div style={{ color: 'var(--text-mute)', fontSize: '0.75rem', marginBottom: 12 }}>
                            Sağlayıcı ve model sunucu ortam değişkenleriyle (LLM_PROVIDER / LLM_MODEL) belirlenir — API anahtarları tarayıcıya hiç gönderilmez.
                            <br />
                            <strong>Alternatif:</strong> Kendi anahtarlarınızı aşağıya girin; bu tarayıcınızda (localStorage) saklanır ve her isteğe eklenir. Sunucuda herhangi bir anahtar kalıcı olarak depolanmaz.
                        </div>
                    </div>

                    <div className="section-label">Kendi API Anahtarlarınız (İsteğe Bağlı)</div>
                    <div className="field-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        {['opencode-zen', 'openrouter', 'cerebras'].map((provider) => (
                            <div key={provider} className="field" style={{ flex: 1, minWidth: 180 }}>
                                <label>{PROVIDER_LABELS[provider] || provider}</label>
                                <input
                                    type="password"
                                    placeholder="API anahtarı..."
                                    value={storedKeys[provider] || ''}
                                    onChange={(e) => handleKeyChange(provider as keyof ClientKeys, e.target.value)}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        ))}
                    </div>

                    {Object.keys(storedKeys).some(k => storedKeys[k as keyof ClientKeys]) && (
                        <div style={{ marginTop: 8 }}>
                            <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={handleClearKeys}>
                                Tüm Anahtarları Temizle
                            </button>
                        </div>
                    )}

                    <div className="section-label">Motor</div>
                    <div className="field">
                        <label>Engine Seçimi</label>
                        <select value={settings.engineOverride} onChange={(e) => set({ engineOverride: e.target.value })}>
                            <option value="auto">AI seçsin (auto)</option>
                            {(cfg?.allEngineTypes || []).map((t) => (
                                <option key={t} value={t}>{ENGINE_LABELS[t] || t}</option>
                            ))}
                        </select>
                        {settings.engineOverride !== 'auto' && !cfg?.supportedEngineTypes.includes(settings.engineOverride) && (
                            <div style={{ color: 'var(--text-mute)', fontSize: '0.78rem', marginTop: 6 }}>
                                Bu motor türü henüz desteklenmiyor; seçim otomatik olarak desteklenen bir motora indirgenecek.
                            </div>
                        )}
                    </div>
                    <div className="field-row">
                        <div className="field">
                            <label>Grid Genişlik</label>
                            <input type="number" min={minGrid} max={maxGrid} value={settings.width}
                                onChange={(e) => set({ width: Number(e.target.value) })} />
                        </div>
                        <div className="field">
                            <label>Grid Yükseklik</label>
                            <input type="number" min={minGrid} max={maxGrid} value={settings.height}
                                onChange={(e) => set({ height: Number(e.target.value) })} />
                        </div>
                        <div className="field">
                            <label>Level Sayısı</label>
                            <select value={settings.levelCount}
                                onChange={(e) => set({ levelCount: Math.min(3, Math.max(1, Number(e.target.value))) })}>
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                                <option value={3}>3</option>
                            </select>
                        </div>
                    </div>

                    <div className="section-label">Fazlar</div>
                    <div className="toggle-row">
                        <div>
                            <div className="toggle-label">Konsept + Dünya/Level</div>
                            <div className="toggle-help">Her zaman çalışır</div>
                        </div>
                        <label className="switch">
                            <input type="checkbox" checked disabled readOnly />
                            <span className="switch-track" />
                        </label>
                    </div>
                    <div className="toggle-row">
                        <div className="toggle-label">Varlıklar (entity design + yerleştirme)</div>
                        <label className="switch">
                            <input type="checkbox" checked={settings.includeEntities}
                                onChange={(e) => set({ includeEntities: e.target.checked })} />
                            <span className="switch-track" />
                        </label>
                    </div>
                    <div className="toggle-row">
                        <div>
                            <div className="toggle-label">Logic fazı</div>
                            <div className="toggle-help">Deneysel / stub</div>
                        </div>
                        <label className="switch">
                            <input type="checkbox" checked={settings.includeLogic}
                                onChange={(e) => set({ includeLogic: e.target.checked })} />
                            <span className="switch-track" />
                        </label>
                    </div>

                    <div className="section-label">Model Parametreleri</div>
                    <PhaseParamsFields label="Konsept" params={settings.concept} onChange={(p) => set({ concept: p })} />
                    <PhaseParamsFields label="Dünya/Level" params={settings.worldLevel} onChange={(p) => set({ worldLevel: p })} />
                    <PhaseParamsFields label="Level Plan" params={settings.concept} onChange={(p) => set({ concept: p })} />
                    <PhaseParamsFields label="Entity Design" params={settings.entityDesign} onChange={(p) => set({ entityDesign: p })} />
                    <PhaseParamsFields label="Varlık Yerleştirme" params={settings.entities} onChange={(p) => set({ entities: p })} />
                    <PhaseParamsFields label="Logic" params={settings.logic} onChange={(p) => set({ logic: p })} />
                </div>
            </div>
        </>,
        document.body
    );
}