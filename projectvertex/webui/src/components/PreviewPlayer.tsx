import { useEffect, useMemo, useState } from 'react';
import type { Level } from '../api';

type PreviewLevel = Level;

interface Props {
    engineType: string;
    level: PreviewLevel;
    // Bump to force the iframe to remount with a fresh level (mid-wizard the
    // level object changes identity without the src URL changing otherwise).
    version?: number;
}

const ENGINE_LABELS: Record<string, string> = {
    'platformer-2d': 'Platformer',
    'iso-pixel': 'İzometrik',
    'rpg-topdown': 'RPG (Top-down)',
    'fps-3d': 'FPS (3D)',
    'topdown-3d': 'Top-down (3D)',
    'platformer-3d': 'Platformer (3D)',
};

const ENGINE_TYPES_3D = new Set(['fps-3d', 'topdown-3d', 'platformer-3d']);

// Each engine boots its playtest data through a different transport that the
// real (unmodified, copied-in) engine code already supports — see
// webui/public/engines/*. platformer-2d reads a blob URL query param;
// iso-pixel/rpg-topdown/unified-3d read sessionStorage before the iframe
// navigates. The 3 3D "engines" are really one Unified3D runtime booted with
// a different ?engine= mode.
function buildIframeSrc(engineType: string, level: PreviewLevel, reloadKey: number, version: number): string {
    const r = `${reloadKey}-${version}`;
    if (engineType === 'platformer-2d') {
        const blob = new Blob([JSON.stringify(level)], { type: 'application/json' });
        const blobUrl = URL.createObjectURL(blob);
        return `/engines/platformer-2d/index.html?levelBlob=${encodeURIComponent(blobUrl)}&r=${r}`;
    }
    sessionStorage.setItem('redglitch_playtest_data', JSON.stringify(level));
    if (engineType === 'rpg-topdown') {
        return `/engines/rpg-topdown/player.html?playtest=true&r=${r}`;
    }
    if (ENGINE_TYPES_3D.has(engineType)) {
        return `/engines/unified-3d/index.html?engine=${encodeURIComponent(engineType)}&playtest=true&r=${r}`;
    }
    return `/engines/iso-pixel/player.html?r=${r}`;
}

export default function PreviewPlayer({ engineType, level, version = 0 }: Props) {
    const [reloadKey, setReloadKey] = useState(0);
    const src = useMemo(() => buildIframeSrc(engineType, level, reloadKey, version), [engineType, level, reloadKey, version]);
    const is3D = ENGINE_TYPES_3D.has(engineType);

    useEffect(() => {
        return () => {
            if (src.includes('levelBlob=')) {
                const match = src.match(/levelBlob=([^&]+)/);
                if (match) URL.revokeObjectURL(decodeURIComponent(match[1]));
            }
        };
    }, [src]);

    return (
        <div className="preview-player">
            <div className="preview-toolbar">
                <span className="preview-engine-label">
                    <a href="https://github.com/canmertdogan/redglitch-engine" target="_blank" rel="noopener noreferrer" className="engine-link">Redglitch Engine</a>
                    {' '}· {ENGINE_LABELS[engineType] || engineType} <span className="preview-live-dot" title="Gerçek motor, canlı çalışıyor">●</span>
                </span>
                {is3D && <span className="preview-hint">FPS modunda tıkla + WASD + fare, ESC ile duraklat</span>}
                <button className="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                    ↻ Yeniden Başlat
                </button>
            </div>
            <iframe
                key={reloadKey}
                className="preview-frame"
                src={src}
                sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                title="Oyun Önizlemesi"
            />
        </div>
    );
}
