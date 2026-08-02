import { useState } from 'react';

// Hero/landing widgets for the "Oyun Üret" tab: an example-prompt generator,
// engine picker chips, a twist dice, a curated concept gallery, a read-only
// engine capability badge, and a Redglitch download banner. All read-only
// chrome on top of the composer — nothing here calls the pipeline.

const ENGINE_GLYPHS: Record<string, string> = {
    'rpg-topdown': '▣',
    'platformer-2d': '▲',
    'iso-pixel': '◈',
    'topdown-3d': '◍',
    'fps-3d': '◎',
    'platformer-3d': '◭',
    'unified-3d': '✦',
};

function pick<T>(arr: readonly T[], avoid?: T): T {
    if (arr.length === 0) throw new Error('empty pool');
    let item = arr[Math.floor(Math.random() * arr.length)];
    if (arr.length > 1 && avoid !== undefined) {
        while (item === avoid) item = arr[Math.floor(Math.random() * arr.length)];
    }
    return item;
}

// ── Building blocks for the example prompt generator ──────────────────

const GENRES = [
    'bir hack-and-slash aksiyon',
    'bir hayatta kalma macerası',
    'bir gizem çözme oyunu',
    'bir bullet-hell shoot',
    'bir boss rush',
    'bir kaçış odası bulmaca oyunu',
    'bir stealth görev oyunu',
    'bir ticaret simülasyonu',
    'bir metroidvania',
    'bir mini RTS',
] as const;

const THEMES = [
    'karanlık bir zindan',
    'futuristik bir şehir',
    'korsan adaları',
    'kadim Mısır harabeleri',
    'terk edilmiş bir uzay istasyonu',
    'perili bir malikâne',
    'siberpunk bir mahalle',
    'çorak bir çöl',
    'kar altındaki bir köy',
    'volkanik dağlar',
] as const;

const ENGINE_NAMES = [
    'RPG (top-down) motorunu kullan',
    'Platformer (2D) motorunu kullan',
    'İzometrik motoru kullan',
    '3D FPS motorunu kullan',
    '3D top-down motorunu kullan',
    '3D platformer motorunu kullan',
] as const;

const TWISTS = [
    'tek can hakkı var',
    'level\'lar rastgele üretilsin (roguelike)',
    'düşmanların zayıf noktası var',
    'büyük bir boss savaşıyla bitiyor',
    'zaman sınırı var',
    'item sistemi oyuna dayansın',
    'NPC\'ler diyalog kuruyor',
    'dayanıklılık / beslenme sistemi olsun',
    'gizli hazineler olsun',
    'hava durumu oynanışı etkilesin',
    'her bölümde yeni bir yetenek kazanılıyor',
    'skor tablosu ve combo sistemi olsun',
] as const;

export function PromptGenerator({ onUse, className }: { onUse: (text: string) => void; className?: string }) {
    const [idea, setIdea] = useState<string | null>(null);

    function generate() {
        const genre = pick(GENRES);
        const theme = pick(THEMES);
        const twist = pick(TWISTS);
        const engine = Math.random() < 0.45 ? pick(ENGINE_NAMES) : null;
        setIdea(
            `Bir oyun tasarla: ${genre} — ${theme} temasında, ${twist}.${engine ? ` ${engine}.` : ''}`
        );
    }

    return (
        <div className={['widget-panel', className].filter(Boolean).join(' ')}>
            <div className="widget-title">⚄ Örnek Prompt Üretici</div>
            <div className="widget-hint">Rastgele bir fikir üret — beğenirsen kompozere yükle.</div>
            <div className="widget-row">
                <button className="secondary" onClick={generate}>Fikir Üret</button>
                {idea && (
                    <div className="idea-output">
                        <span className="idea-text">{idea}</span>
                        <button className="primary idea-use" onClick={() => onUse(idea)}>Kullan</button>
                    </div>
                )}
            </div>
        </div>
    );
}

export function TwistDice({ prompt, onPrompt, className }: { prompt: string; onPrompt: (text: string) => void; className?: string }) {
    const [last, setLast] = useState<string | null>(null);

    function roll() {
        const twist = pick(TWISTS, last ?? undefined);
        setLast(twist);
        onPrompt(prompt.trim() ? `${prompt.replace(/[.。\s]+$/, '')}, ${twist}.` : `Bir oyun tasarla: ${twist}.`);
    }

    return (
        <div className={['widget-panel', className].filter(Boolean).join(' ')}>
            <div className="widget-title">⚂ Fikir Zarı / Twist</div>
            <div className="widget-hint">Mevcut prompt'una rastgele bir mekanik / kısıt ekler.</div>
            <div className="widget-row">
                <button className="secondary" onClick={roll}>Zar At</button>
            </div>
        </div>
    );
}

export function EngineChips({ engines, engineLabels, selected, onSelect, className }: {
    engines: string[];
    engineLabels: Record<string, string>;
    selected: string;
    onSelect: (id: string) => void;
    className?: string;
}) {
    return (
        <div className={['widget-panel', className].filter(Boolean).join(' ')}>
            <div className="widget-title">◆ Motor Seç</div>
            <div className="widget-hint">Tek tıkla motoru sabitle ve o motor için örnek bir prompt yükle — tekrar tıkla: AI seçsin (auto).</div>
            <div className="engine-chips">
                {engines.map((id) => (
                    <button key={id} className={`engine-chip ${selected === id ? 'active' : ''}`} onClick={() => onSelect(id)}>
                        <span className="engine-chip-glyph">{ENGINE_GLYPHS[id] || '▫'}</span>
                        <span>{engineLabels[id] || id}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

interface GalleryConcept {
    name: string;
    genre: string;
    theme: string;
    pitch: string;
    engine: string;
}

const CONCEPTS: GalleryConcept[] = [
    {
        name: 'Gölge Madeni',
        genre: 'metroidvania',
        theme: 'karanlık zindan',
        pitch: 'Işık kristallerini geri toplamak için terk edilmiş bir madene in — yeni yeteneklerle daha derine ulaş.',
        engine: 'platformer-2d',
    },
    {
        name: 'Kızıl Kule',
        genre: 'boss rush',
        theme: 'volkanik dağlar',
        pitch: 'Her katta daha zor bir boss bekliyor. Silahlarını güçlendir ve kulenin zirvesine ulaş.',
        engine: 'rpg-topdown',
    },
    {
        name: 'Nebula Tüccarı',
        genre: 'ticaret simülasyonu',
        theme: 'uzay istasyonu',
        pitch: 'İstasyonlar arasında mal alıp sat, gemini yükselt ve gizemli bir sinyalin peşine düş.',
        engine: 'iso-pixel',
    },
    {
        name: 'Son Sığınak',
        genre: 'hayatta kalma',
        theme: 'çorak çöl',
        pitch: 'Kaynak topla, sığınağını güçlendir ve her gece gelen dalgalara karşı hayatta kal.',
        engine: 'topdown-3d',
    },
    {
        name: 'Piksel Akın',
        genre: 'bullet-hell',
        theme: 'siberpunk mahalle',
        pitch: 'Dalga dalga gelen dronlara karşı arena savaşı — combo sistemini yüksek tut, puanını taçlandır.',
        engine: 'fps-3d',
    },
    {
        name: 'Gizli Bahçe',
        genre: 'keşif',
        theme: 'perili malikâne',
        pitch: 'Kayıp bir botanikçinin bahçesini keşfet, bulmaca çöz ve gizli odayı bul.',
        engine: 'iso-pixel',
    },
];

export function ConceptGallery({ onUse, className }: { onUse: (text: string, engine?: string) => void; className?: string }) {
    return (
        <div className={['widget-panel', className].filter(Boolean).join(' ')}>
            <div className="widget-title">♛ Konsept Galerisi</div>
            <div className="widget-hint">Hazır oyun fikirleri — kartın motoru da otomatik seçilir.</div>
            <div className="gallery-grid">
                {CONCEPTS.map((c) => {
                    const prompt = `Bir oyun tasarla: ${c.genre} — ${c.theme} temasında, ${c.pitch.toLowerCase()}`;
                    return (
                        <button key={c.name} className="gallery-card" onClick={() => onUse(prompt, c.engine)}>
                            <span className="gallery-name">{c.name}</span>
                            <span className="gallery-meta">{c.genre} · {c.theme}</span>
                            <span className="gallery-pitch">{c.pitch}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

interface CapRow {
    id: string;
    label: string;
    multi: boolean;
    music: boolean;
    entities: boolean;
    logic: boolean;
    terrain3d: boolean;
}

const CAP_ROWS: CapRow[] = [
    { id: 'rpg-topdown', label: 'RPG', multi: true, music: true, entities: true, logic: true, terrain3d: false },
    { id: 'platformer-2d', label: 'Platformer 2D', multi: true, music: false, entities: true, logic: false, terrain3d: false },
    { id: 'iso-pixel', label: 'İzometrik', multi: true, music: false, entities: true, logic: false, terrain3d: false },
    { id: 'fps-3d', label: 'FPS 3D', multi: true, music: false, entities: true, logic: false, terrain3d: true },
    { id: 'topdown-3d', label: 'Top-down 3D', multi: true, music: false, entities: true, logic: false, terrain3d: true },
    { id: 'platformer-3d', label: 'Platformer 3D', multi: true, music: false, entities: true, logic: false, terrain3d: true },
];

export function EngineCapBadge({ className }: { className?: string }) {
    return (
        <div className={['widget-panel', className].filter(Boolean).join(' ')}>
            <div className="widget-title">◧ Motor Yetenekleri</div>
            <div className="widget-hint">Üretilen oyunların gerçek Redglitch motorlarında çalıştırdığı özellikler.</div>
            <table className="cap-badge">
                <thead>
                    <tr>
                        <th>Motor</th>
                        <th>Çoklu level</th>
                        <th>Müzik</th>
                        <th>Varlık</th>
                        <th>Logic</th>
                        <th>3D arazi</th>
                    </tr>
                </thead>
                <tbody>
                    {CAP_ROWS.map((r) => (
                        <tr key={r.id}>
                            <td>{r.label}</td>
                            <td className={r.multi ? 'cap-yes' : 'cap-no'}>{r.multi ? '✓' : '—'}</td>
                            <td className={r.music ? 'cap-yes' : 'cap-no'}>{r.music ? '✓' : '—'}</td>
                            <td className={r.entities ? 'cap-yes' : 'cap-no'}>{r.entities ? '✓' : '—'}</td>
                            <td className={r.logic ? 'cap-yes' : 'cap-no'}>{r.logic ? '✓' : '—'}</td>
                            <td className={r.terrain3d ? 'cap-yes' : 'cap-no'}>{r.terrain3d ? '✓' : '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function DownloadBanner({ className }: { className?: string }) {
    return (
        <a
            className={['dl-banner', className].filter(Boolean).join(' ')}
            href="https://github.com/canmertdogan/redglitch-engine"
            target="_blank"
            rel="noopener noreferrer"
        >
            <div className="dl-banner-body">
                <div className="dl-banner-title">Redglitch Engine</div>
                <div className="dl-banner-sub">
                    Üretilen oyunların çalıştığı 6 motorlu, yerel oyun stüdyosu — ücretsiz ve açık kaynak.
                </div>
            </div>
            <span className="dl-banner-btn">İndir ↓</span>
        </a>
    );
}
