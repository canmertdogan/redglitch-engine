/**
 * UITemplates.js — Shared UI geometry helpers & curated Interface Templates
 * Compatible with classic <script> (window.RedglitchUITemplates), Vite/ESM (@shared), and Node.
 */
(function (root) {
    'use strict';

    const BASE_RES = { w: 800, h: 450 };

    function parseAnchor(anchor) {
        const raw = String(anchor || 'top-left').trim().toLowerCase();
        if (raw === 'center') return { v: 'center', h: 'center' };
        const parts = raw.split('-');
        const v = parts[0] || 'top';
        const h = parts[1] || 'left';
        return {
            v: (v === 'top' || v === 'center' || v === 'bottom') ? v : 'top',
            h: (h === 'left' || h === 'center' || h === 'right') ? h : 'left'
        };
    }

    function resolveRect(rect, anchor, resolution) {
        const resW = Number(resolution && resolution.w) || BASE_RES.w;
        const resH = Number(resolution && resolution.h) || BASE_RES.h;
        const x = Number(rect && rect.x !== undefined ? rect.x : 0);
        const y = Number(rect && rect.y !== undefined ? rect.y : 0);
        const w = Math.max(1, Number(rect && rect.w !== undefined ? rect.w : 100));
        const h = Math.max(1, Number(rect && rect.h !== undefined ? rect.h : 40));
        const a = parseAnchor(anchor);

        let left = x;
        if (a.h === 'right') left = resW - w - x;
        else if (a.h === 'center') left = (resW - w) / 2 + x;

        let top = y;
        if (a.v === 'bottom') top = resH - h - y;
        else if (a.v === 'center') top = (resH - h) / 2 + y;

        return {
            x, y, w, h,
            left: Math.round(left),
            top: Math.round(top)
        };
    }

    function screenToAnchorRect(left, top, w, h, anchor, resolution) {
        const resW = Number(resolution && resolution.w) || BASE_RES.w;
        const resH = Number(resolution && resolution.h) || BASE_RES.h;
        const a = parseAnchor(anchor);

        let x = left;
        if (a.h === 'right') x = resW - w - left;
        else if (a.h === 'center') x = left - (resW - w) / 2;

        let y = top;
        if (a.v === 'bottom') y = resH - h - top;
        else if (a.v === 'center') y = top - (resH - h) / 2;

        return {
            x: Math.round(x),
            y: Math.round(y),
            w: Math.round(w),
            h: Math.round(h)
        };
    }

    function convertAnchorRect(rect, fromAnchor, toAnchor, resolution) {
        const resolved = resolveRect(rect, fromAnchor, resolution);
        return screenToAnchorRect(resolved.left, resolved.top, resolved.w, resolved.h, toAnchor, resolution);
    }

    function clone(val) {
        return JSON.parse(JSON.stringify(val));
    }

    function scaleElement(el, sx, sy) {
        const next = clone(el);
        const avg = (sx + sy) / 2;
        if (next.rect) {
            next.rect = {
                x: Math.round((next.rect.x || 0) * sx),
                y: Math.round((next.rect.y || 0) * sy),
                w: Math.max(10, Math.round((next.rect.w || 100) * sx)),
                h: Math.max(10, Math.round((next.rect.h || 40) * sy))
            };
        }
        if (next.style) {
            if (typeof next.style.fontSize === 'number') {
                next.style.fontSize = Math.max(9, Math.round(next.style.fontSize * avg));
            }
            if (typeof next.style.borderRadius === 'number') {
                next.style.borderRadius = Math.round(next.style.borderRadius * avg);
            }
        }
        return next;
    }

    function scaleScreen(screen, fromRes, toRes) {
        const fw = Number(fromRes && fromRes.w) || BASE_RES.w;
        const fh = Number(fromRes && fromRes.h) || BASE_RES.h;
        const tw = Number(toRes && toRes.w) || BASE_RES.w;
        const th = Number(toRes && toRes.h) || BASE_RES.h;
        const copied = clone(screen);
        if (fw === tw && fh === th) return copied;
        const sx = tw / fw;
        const sy = th / fh;
        copied.elements = (copied.elements || []).map((el) => scaleElement(el, sx, sy));
        return copied;
    }

    function scaleDocument(doc, toRes) {
        const fromRes = doc.resolution || BASE_RES;
        const tw = Number(toRes && toRes.w) || fromRes.w;
        const th = Number(toRes && toRes.h) || fromRes.h;
        const out = clone(doc);
        out.resolution = { w: tw, h: th };
        if (fwDiffers(fromRes, out.resolution)) {
            for (const sid of Object.keys(out.screens || {})) {
                out.screens[sid] = scaleScreen(out.screens[sid], fromRes, out.resolution);
            }
        }
        return out;
    }

    function fwDiffers(a, b) {
        return Number(a.w) !== Number(b.w) || Number(a.h) !== Number(b.h);
    }

    // ═══════════════════════════════════════════
    // Theme Definitions (18 Light & Retro Presets) & Screen Builders
    // ═══════════════════════════════════════════
    function makeTheme(id, name, badge, description, overrides) {
        const p = Object.assign({
            void: '#080c16',
            panel: 'rgba(15, 22, 36, 0.78)',
            panelInner: 'rgba(9, 14, 24, 0.58)',
            scrim: 'rgba(5, 8, 16, 0.62)',
            border: 'rgba(148, 163, 184, 0.34)',
            accent: '#ff4d63',
            gold: '#ffd573',
            cyan: '#5ce1ff',
            green: '#6ee7a8',
            violet: '#c49bff',
            ink: '#f1f5f9',
            muted: '#94a3b8',
            barTrack: 'rgba(10, 15, 26, 0.84)',
            barText: '#ffffff',
            textShadow: '1px 1px 0 rgba(0, 0, 0, 0.55)',
            hp: '#f4516c',
            mp: '#38bdf8',
            st: '#4ade80',
            radius: 2,
            panelBorderWidth: 1,
            ticks: 8,
            panelShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 2px 2px 0 rgba(0,0,0,0.34)',
            btnRadius: 2
        }, (overrides && overrides.palette) || {});
        return {
            id: id,
            name: name,
            badge: badge,
            description: description,
            accent: (overrides && overrides.accent) || p.accent,
            palette: p
        };
    }

    const THEMES = {
        redglitch_ops: makeTheme(
            'redglitch_ops',
            'RedGlitch Air HUD',
            'TACTICAL LITE',
            'Airy translucent obsidian-slate cards, thin crimson pixel hairlines, and crisp VT323 telemetry bars.',
            {
                accent: '#ff4d63',
                palette: {
                    void: '#080b14',
                    panel: 'rgba(14, 19, 32, 0.78)',
                    panelInner: 'rgba(9, 13, 24, 0.56)',
                    scrim: 'rgba(4, 7, 14, 0.60)',
                    border: 'rgba(255, 77, 99, 0.42)',
                    accent: '#ff4d63',
                    gold: '#ffd670',
                    cyan: '#5eead4',
                    green: '#6ee7a8',
                    violet: '#c4b5fd',
                    ink: '#f8fafc',
                    muted: '#94a3b8',
                    barTrack: 'rgba(12, 16, 28, 0.85)',
                    hp: '#fb566c',
                    mp: '#38bdf8',
                    st: '#4ade80',
                    radius: 2,
                    ticks: 8
                }
            }
        ),
        minimal_modern: makeTheme(
            'minimal_modern',
            'Frost Slate Studio',
            'CLEAN RETRO',
            'Soft frosted slate cards, balanced sky-cyan trim, and calm pastel stat bars for distraction-free HUDs.',
            {
                accent: '#38bdf8',
                palette: {
                    void: '#0b1120',
                    panel: 'rgba(20, 30, 48, 0.74)',
                    panelInner: 'rgba(13, 21, 36, 0.56)',
                    scrim: 'rgba(7, 11, 22, 0.56)',
                    border: 'rgba(148, 163, 184, 0.34)',
                    accent: '#38bdf8',
                    gold: '#f8fafc',
                    cyan: '#38bdf8',
                    green: '#34d399',
                    violet: '#a78bfa',
                    ink: '#f8fafc',
                    muted: '#cbd5e1',
                    barTrack: 'rgba(15, 23, 42, 0.82)',
                    hp: '#fb7185',
                    mp: '#38bdf8',
                    st: '#34d399',
                    radius: 6,
                    ticks: 0,
                    panelShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 20px rgba(0,0,0,0.28)',
                    btnRadius: 4
                }
            }
        ),
        pixel_fantasy: makeTheme(
            'pixel_fantasy',
            'Obsidian Gold RPG',
            'FANTASY RPG',
            'Delicate antique gold borders over lightened plum-stone frames crafted for fantasy & RPG worlds.',
            {
                accent: '#eab354',
                palette: {
                    void: '#16101e',
                    panel: 'rgba(30, 22, 38, 0.80)',
                    panelInner: 'rgba(20, 14, 26, 0.62)',
                    scrim: 'rgba(12, 8, 16, 0.62)',
                    border: 'rgba(234, 179, 84, 0.58)',
                    accent: '#eab354',
                    gold: '#fde08d',
                    cyan: '#67e8f9',
                    green: '#86efac',
                    violet: '#d8b4fe',
                    ink: '#fef9ef',
                    muted: '#cabaa8',
                    barTrack: 'rgba(18, 13, 24, 0.86)',
                    hp: '#ef4444',
                    mp: '#3b82f6',
                    st: '#22c55e',
                    radius: 2,
                    ticks: 8,
                    panelShadow: 'inset 0 0 0 1px rgba(253,224,141,0.16), 2px 2px 0 rgba(0,0,0,0.45)',
                    btnRadius: 2
                }
            }
        ),
        cyber_visor: makeTheme(
            'cyber_visor',
            'CyberOps Visor',
            'SCI-FI VISOR',
            'Translucent neon-cyan visor HUD with airy telemetry strips built for FPS and cyberpunk levels.',
            {
                accent: '#22d3ee',
                palette: {
                    void: '#040e17',
                    panel: 'rgba(8, 26, 40, 0.72)',
                    panelInner: 'rgba(5, 18, 28, 0.56)',
                    scrim: 'rgba(3, 10, 18, 0.58)',
                    border: 'rgba(34, 211, 238, 0.48)',
                    accent: '#22d3ee',
                    gold: '#fcd34d',
                    cyan: '#22d3ee',
                    green: '#4ade80',
                    violet: '#c084fc',
                    ink: '#ecfeff',
                    muted: '#7dd3fc',
                    barTrack: 'rgba(4, 18, 28, 0.84)',
                    hp: '#fb7185',
                    mp: '#22d3ee',
                    st: '#a3e635',
                    radius: 4,
                    ticks: 10,
                    panelShadow: '0 0 14px rgba(34,211,238,0.12), inset 0 1px 0 rgba(34,211,238,0.20)',
                    btnRadius: 4
                }
            }
        ),
        gameboy_olive: makeTheme(
            'gameboy_olive',
            'Pocket DMG Olive',
            '8-BIT HANDHELD',
            'Warm sage-olive dot-matrix cartridge aesthetic with soft moss backing and clean pixel framing.',
            {
                accent: '#a3be67',
                palette: {
                    void: '#1c2617',
                    panel: 'rgba(39, 54, 32, 0.84)',
                    panelInner: 'rgba(28, 40, 23, 0.68)',
                    scrim: 'rgba(18, 26, 15, 0.62)',
                    border: '#8bac0f',
                    accent: '#9bbc0f',
                    gold: '#d9eb82',
                    cyan: '#9bd3ae',
                    green: '#9bbc0f',
                    violet: '#b7cf7e',
                    ink: '#e8f5c8',
                    muted: '#a3be67',
                    barTrack: 'rgba(21, 31, 17, 0.88)',
                    hp: '#8bac0f',
                    mp: '#6b9d78',
                    st: '#b5d645',
                    radius: 0,
                    ticks: 8,
                    panelShadow: '2px 2px 0 rgba(12, 20, 10, 0.55)',
                    btnRadius: 0
                }
            }
        ),
        gameboy_light: makeTheme(
            'gameboy_light',
            'Pocket Paper Light',
            'LIGHT HANDHELD',
            'Bright cream-paper handheld retro panels with ink-charcoal typography and gentle pastel fills.',
            {
                accent: '#2d6a4f',
                palette: {
                    void: '#e9efe4',
                    panel: 'rgba(244, 248, 238, 0.88)',
                    panelInner: 'rgba(232, 240, 224, 0.78)',
                    scrim: 'rgba(30, 44, 34, 0.42)',
                    border: '#52796f',
                    accent: '#2d6a4f',
                    gold: '#1b4332',
                    cyan: '#2b6cb0',
                    green: '#2d6a4f',
                    violet: '#6b46c1',
                    ink: '#1f2d24',
                    muted: '#526b5c',
                    barTrack: 'rgba(42, 58, 47, 0.80)',
                    barText: '#ffffff',
                    textShadow: 'none',
                    hp: '#e05a6d',
                    mp: '#3b82f6',
                    st: '#40916c',
                    radius: 2,
                    ticks: 6,
                    panelShadow: '2px 2px 0 rgba(45, 74, 58, 0.22)',
                    btnRadius: 2
                }
            }
        ),
        parchment_tactics: makeTheme(
            'parchment_tactics',
            'Parchment Chronicle',
            'LIGHT TACTICS',
            'Warm sunlit parchment windows with sepia ink outlines for tactical RPGs and strategy adventures.',
            {
                accent: '#b45309',
                palette: {
                    void: '#f3ead8',
                    panel: 'rgba(250, 242, 224, 0.90)',
                    panelInner: 'rgba(240, 229, 204, 0.80)',
                    scrim: 'rgba(48, 34, 18, 0.46)',
                    border: '#9c7850',
                    accent: '#b45309',
                    gold: '#78350f',
                    cyan: '#0f766e',
                    green: '#15803d',
                    violet: '#6d28d9',
                    ink: '#2d2013',
                    muted: '#78624a',
                    barTrack: 'rgba(66, 48, 30, 0.82)',
                    barText: '#fffaf0',
                    textShadow: 'none',
                    hp: '#dc2626',
                    mp: '#0284c7',
                    st: '#16a34a',
                    radius: 3,
                    ticks: 6,
                    panelShadow: '2px 2px 0 rgba(120, 90, 50, 0.24)',
                    btnRadius: 2
                }
            }
        ),
        famicom_pop: makeTheme(
            'famicom_pop',
            'Famicom Arcade 85',
            '8-BIT CONSOLE',
            'Classic plum-indigo translucent frames accented with lively arcade coral, ivory, and lemon.',
            {
                accent: '#ff595e',
                palette: {
                    void: '#161124',
                    panel: 'rgba(34, 24, 52, 0.80)',
                    panelInner: 'rgba(24, 17, 38, 0.64)',
                    scrim: 'rgba(12, 8, 22, 0.58)',
                    border: 'rgba(255, 202, 58, 0.55)',
                    accent: '#ff595e',
                    gold: '#ffca3a',
                    cyan: '#66d9ef',
                    green: '#8ac926',
                    violet: '#c77dff',
                    ink: '#fff8ee',
                    muted: '#c5b8da',
                    barTrack: 'rgba(18, 12, 30, 0.86)',
                    hp: '#ff595e',
                    mp: '#1982c4',
                    st: '#8ac926',
                    radius: 0,
                    ticks: 8,
                    panelShadow: '2px 2px 0 rgba(0, 0, 0, 0.48)',
                    btnRadius: 0
                }
            }
        ),
        amber_crt: makeTheme(
            'amber_crt',
            'Amber Phosphor CRT',
            'RETRO TERMINAL',
            'Low-glare smoked charcoal panels lit by warm monochrome amber phosphor beams.',
            {
                accent: '#f59e0b',
                palette: {
                    void: '#120d06',
                    panel: 'rgba(28, 20, 10, 0.80)',
                    panelInner: 'rgba(20, 14, 7, 0.64)',
                    scrim: 'rgba(10, 7, 3, 0.64)',
                    border: 'rgba(245, 158, 11, 0.50)',
                    accent: '#f59e0b',
                    gold: '#fde68a',
                    cyan: '#fbbf24',
                    green: '#fcd34d',
                    violet: '#fdba74',
                    ink: '#fef3c7',
                    muted: '#d97706',
                    barTrack: 'rgba(16, 11, 4, 0.88)',
                    hp: '#ea580c',
                    mp: '#f59e0b',
                    st: '#fbbf24',
                    radius: 2,
                    ticks: 10,
                    panelShadow: '0 0 12px rgba(245, 158, 11, 0.12)',
                    btnRadius: 2
                }
            }
        ),
        phosphor_mint: makeTheme(
            'phosphor_mint',
            'Mint Phosphor VDT',
            'PHOSPHOR UNIX',
            'Cool deep-pine terminal glass with legible seafoam mint strokes and clean tabular gauges.',
            {
                accent: '#34d399',
                palette: {
                    void: '#071411',
                    panel: 'rgba(10, 30, 25, 0.78)',
                    panelInner: 'rgba(7, 22, 18, 0.60)',
                    scrim: 'rgba(4, 12, 10, 0.62)',
                    border: 'rgba(52, 211, 153, 0.45)',
                    accent: '#34d399',
                    gold: '#a7f3d0',
                    cyan: '#5eead4',
                    green: '#4ade80',
                    violet: '#6ee7b7',
                    ink: '#ecfdf5',
                    muted: '#6ee7b7',
                    barTrack: 'rgba(6, 18, 15, 0.86)',
                    hp: '#fb7185',
                    mp: '#2dd4bf',
                    st: '#34d399',
                    radius: 2,
                    ticks: 10,
                    panelShadow: '0 0 12px rgba(52, 211, 153, 0.10)',
                    btnRadius: 2
                }
            }
        ),
        sakura_pixel: makeTheme(
            'sakura_pixel',
            'Sakura Blossom Pixel',
            'PASTEL RETRO',
            'Dreamy twilight plum panels trimmed with cherry-blossom pink and soft cream accents.',
            {
                accent: '#f9a8d4',
                palette: {
                    void: '#1a111c',
                    panel: 'rgba(38, 22, 42, 0.76)',
                    panelInner: 'rgba(26, 15, 30, 0.58)',
                    scrim: 'rgba(16, 8, 20, 0.56)',
                    border: 'rgba(249, 168, 212, 0.48)',
                    accent: '#f472b6',
                    gold: '#fde68a',
                    cyan: '#93c5fd',
                    green: '#86efac',
                    violet: '#ddd6fe',
                    ink: '#fdf2f8',
                    muted: '#d8b4cb',
                    barTrack: 'rgba(24, 14, 28, 0.84)',
                    hp: '#f472b6',
                    mp: '#a78bfa',
                    st: '#6ee7b7',
                    radius: 4,
                    ticks: 6,
                    panelShadow: '0 4px 14px rgba(244, 114, 182, 0.14)',
                    btnRadius: 4
                }
            }
        ),
        sunset_vapor: makeTheme(
            'sunset_vapor',
            'Sunset 84 Pastel',
            'SYNTH PIXEL',
            'Dusk indigo translucent cards paired with peach-coral highlights and electric aqua.',
            {
                accent: '#fb923c',
                palette: {
                    void: '#140f24',
                    panel: 'rgba(30, 21, 52, 0.76)',
                    panelInner: 'rgba(20, 14, 36, 0.58)',
                    scrim: 'rgba(12, 8, 24, 0.58)',
                    border: 'rgba(251, 146, 60, 0.46)',
                    accent: '#fb923c',
                    gold: '#fde047',
                    cyan: '#22d3ee',
                    green: '#6ee7b7',
                    violet: '#e879f9',
                    ink: '#fff7ed',
                    muted: '#cbbbe6',
                    barTrack: 'rgba(18, 12, 34, 0.85)',
                    hp: '#fb7185',
                    mp: '#38bdf8',
                    st: '#facc15',
                    radius: 3,
                    ticks: 8,
                    panelShadow: '2px 2px 0 rgba(232, 121, 249, 0.22)',
                    btnRadius: 3
                }
            }
        ),
        cobalt_jrpg: makeTheme(
            'cobalt_jrpg',
            'Cobalt 16-Bit Window',
            '16-BIT JRPG',
            'Nostalgic royal-cobalt translucent dialog & status windows bordered with silver-white pixel bevels.',
            {
                accent: '#93c5fd',
                palette: {
                    void: '#0c1836',
                    panel: 'rgba(21, 46, 102, 0.82)',
                    panelInner: 'rgba(14, 32, 74, 0.68)',
                    scrim: 'rgba(6, 12, 32, 0.56)',
                    border: '#dbeafe',
                    accent: '#60a5fa',
                    gold: '#fde047',
                    cyan: '#67e8f9',
                    green: '#6ee7b7',
                    violet: '#c4b5fd',
                    ink: '#ffffff',
                    muted: '#bfdbfe',
                    barTrack: 'rgba(10, 22, 52, 0.88)',
                    hp: '#f87171',
                    mp: '#60a5fa',
                    st: '#4ade80',
                    radius: 3,
                    panelBorderWidth: 2,
                    ticks: 0,
                    panelShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22), 2px 2px 0 rgba(0,0,0,0.45)',
                    btnRadius: 2
                }
            }
        ),
        glacier_frost: makeTheme(
            'glacier_frost',
            'Glacier Paper Aero',
            'LIGHT FROST',
            'Crisp ice-blue daylight panels with deep navy typography and cool cerulean borders.',
            {
                accent: '#0284c7',
                palette: {
                    void: '#e2f1fa',
                    panel: 'rgba(236, 246, 253, 0.90)',
                    panelInner: 'rgba(219, 236, 249, 0.82)',
                    scrim: 'rgba(15, 36, 56, 0.40)',
                    border: '#38bdf8',
                    accent: '#0284c7',
                    gold: '#0f172a',
                    cyan: '#0284c7',
                    green: '#059669',
                    violet: '#7c3aed',
                    ink: '#0f172a',
                    muted: '#475569',
                    barTrack: 'rgba(30, 52, 74, 0.82)',
                    barText: '#ffffff',
                    textShadow: 'none',
                    hp: '#ef4444',
                    mp: '#0ea5e9',
                    st: '#10b981',
                    radius: 4,
                    ticks: 0,
                    panelShadow: '0 4px 12px rgba(14, 116, 144, 0.14)',
                    btnRadius: 3
                }
            }
        ),
        matcha_cozy: makeTheme(
            'matcha_cozy',
            'Matcha Meadow Cozy',
            'LIGHT COZY',
            'Soft sage-oatmeal cards with warm cocoa text designed for cozy sims and farming adventures.',
            {
                accent: '#65a30d',
                palette: {
                    void: '#eef3e6',
                    panel: 'rgba(247, 250, 240, 0.90)',
                    panelInner: 'rgba(234, 241, 221, 0.82)',
                    scrim: 'rgba(38, 48, 30, 0.42)',
                    border: '#84a955',
                    accent: '#c2410c',
                    gold: '#3f6212',
                    cyan: '#0d9488',
                    green: '#4d7c0f',
                    violet: '#7c3aed',
                    ink: '#2d3a24',
                    muted: '#667858',
                    barTrack: 'rgba(54, 68, 44, 0.80)',
                    barText: '#ffffff',
                    textShadow: 'none',
                    hp: '#e11d48',
                    mp: '#0d9488',
                    st: '#65a30d',
                    radius: 5,
                    ticks: 0,
                    panelShadow: '2px 2px 0 rgba(92, 116, 62, 0.20)',
                    btnRadius: 4
                }
            }
        ),
        synth_indigo: makeTheme(
            'synth_indigo',
            'Cassette Lo-Fi Indigo',
            'LO-FI PIXEL',
            'Gentle midnight-cassette glass with pastel lilac & seafoam gauges and featherlight shadows.',
            {
                accent: '#a78bfa',
                palette: {
                    void: '#111322',
                    panel: 'rgba(25, 29, 50, 0.78)',
                    panelInner: 'rgba(17, 20, 36, 0.58)',
                    scrim: 'rgba(8, 10, 20, 0.58)',
                    border: 'rgba(167, 139, 250, 0.42)',
                    accent: '#a78bfa',
                    gold: '#fde68a',
                    cyan: '#5eead4',
                    green: '#6ee7b7',
                    violet: '#c4b5fd',
                    ink: '#eef2ff',
                    muted: '#a5b4fc',
                    barTrack: 'rgba(15, 18, 34, 0.85)',
                    hp: '#fb7185',
                    mp: '#60a5fa',
                    st: '#5eead4',
                    radius: 4,
                    ticks: 6,
                    panelShadow: '0 4px 16px rgba(12, 14, 30, 0.35)',
                    btnRadius: 4
                }
            }
        ),
        crimson_cream: makeTheme(
            'crimson_cream',
            'Famicom Cream Light',
            'LIGHT ARCADE',
            'Clean ivory-cream HUD cards with sharp arcade-crimson borders and high-contrast ink lettering.',
            {
                accent: '#dc2626',
                palette: {
                    void: '#f7f2ea',
                    panel: 'rgba(255, 251, 245, 0.90)',
                    panelInner: 'rgba(245, 238, 226, 0.82)',
                    scrim: 'rgba(40, 24, 24, 0.42)',
                    border: '#dc2626',
                    accent: '#dc2626',
                    gold: '#b45309',
                    cyan: '#0284c7',
                    green: '#15803d',
                    violet: '#7c3aed',
                    ink: '#1e1b18',
                    muted: '#6b5e54',
                    barTrack: 'rgba(44, 34, 30, 0.82)',
                    barText: '#ffffff',
                    textShadow: 'none',
                    hp: '#ef4444',
                    mp: '#2563eb',
                    st: '#16a34a',
                    radius: 2,
                    ticks: 8,
                    panelShadow: '2px 2px 0 rgba(180, 40, 40, 0.20)',
                    btnRadius: 2
                }
            }
        ),
        brass_clockwork: makeTheme(
            'brass_clockwork',
            'Clockwork Brass Lite',
            'STEAMPUNK LITE',
            'Warm smoked bronze cards trimmed in brushed copper hairlines with turquoise steam gauges.',
            {
                accent: '#d97706',
                palette: {
                    void: '#16110e',
                    panel: 'rgba(34, 25, 20, 0.80)',
                    panelInner: 'rgba(24, 17, 14, 0.62)',
                    scrim: 'rgba(12, 8, 6, 0.60)',
                    border: 'rgba(217, 119, 6, 0.52)',
                    accent: '#f59e0b',
                    gold: '#fcd34d',
                    cyan: '#2dd4bf',
                    green: '#84cc16',
                    violet: '#fdba74',
                    ink: '#fef3e2',
                    muted: '#c2a68a',
                    barTrack: 'rgba(20, 14, 11, 0.86)',
                    hp: '#e11d48',
                    mp: '#14b8a6',
                    st: '#eab308',
                    radius: 2,
                    ticks: 8,
                    panelShadow: 'inset 0 1px 0 rgba(252,211,77,0.12), 2px 2px 0 rgba(0,0,0,0.40)',
                    btnRadius: 2
                }
            }
        )
    };

    function panelStyle(p, zIndex, overrides) {
        return Object.assign({
            backgroundColor: p.panel,
            borderWidth: p.panelBorderWidth,
            borderColor: p.border,
            borderRadius: p.radius,
            boxShadow: p.panelShadow,
            zIndex: zIndex
        }, overrides || {});
    }

    function btnStyle(p, color, zIndex, overrides) {
        const fs = (overrides && overrides.fontSize) || 17;
        return Object.assign({
            backgroundColor: p.panelInner,
            color: color,
            borderWidth: 1,
            borderColor: color,
            borderRadius: p.btnRadius,
            fontSize: 17,
            fontWeight: fs >= 17 ? '700' : '400',
            textAlign: 'center',
            letterSpacing: 1,
            textShadow: p.textShadow || 'none',
            zIndex: zIndex
        }, overrides || {});
    }

    function labelStyle(pOrColor, fontSize, zIndex, overrides) {
        const isPalette = pOrColor && typeof pOrColor === 'object';
        const color = isPalette ? pOrColor.ink : pOrColor;
        const ts = isPalette && pOrColor.textShadow !== undefined ? pOrColor.textShadow : '1px 1px 0 rgba(0,0,0,0.55)';
        return Object.assign({
            backgroundColor: 'transparent',
            color: color,
            fontSize: fontSize,
            fontWeight: fontSize >= 20 ? '700' : '400',
            borderWidth: 0,
            borderColor: 'transparent',
            textShadow: ts,
            zIndex: zIndex
        }, overrides || {});
    }

    function tLabel(p, color, fontSize, zIndex, overrides) {
        return labelStyle(color, fontSize, zIndex, Object.assign({ textShadow: p.textShadow !== undefined ? p.textShadow : '1px 1px 0 rgba(0,0,0,0.55)' }, overrides || {}));
    }

    function barStyle(p, zIndex, overrides) {
        return Object.assign({
            backgroundColor: p.barTrack,
            borderWidth: 1,
            borderColor: p.border,
            borderRadius: p.btnRadius,
            fontSize: 14,
            fontWeight: '400',
            color: p.barText || '#ffffff',
            zIndex: zIndex
        }, overrides || {});
    }

    function buildHudScreen(themeId) {
        const t = THEMES[themeId] || THEMES.redglitch_ops;
        const p = t.palette;
        const slots = [];
        const keys = ['1', '2', '3', '4', 'Q', 'E', 'R', 'ULT'];
        for (let i = 0; i < 8; i++) {
            const x = -168 + i * 48;
            const isSkill = i >= 4 && i <= 6;
            const isUlt = i === 7;
            const slotBorder = isUlt ? p.violet : isSkill ? p.cyan : p.gold;
            slots.push({
                id: 'inv_' + (i + 1),
                type: 'slot',
                text: keys[i],
                rect: { x: x, y: 18, w: 42, h: 42 },
                anchor: 'bottom-center',
                style: {
                    backgroundColor: p.panelInner,
                    color: slotBorder,
                    borderWidth: 1,
                    borderColor: slotBorder,
                    borderRadius: p.btnRadius,
                    fontSize: isUlt ? 13 : 15,
                    fontWeight: '400',
                    zIndex: 11
                },
                props: Object.assign({ variable: 'player.inventory.' + i }, i === 1 ? { selected: true } : {})
            });
        }

        return {
            elements: [
                { id: 'hud_vitals_panel', type: 'panel', rect: { x: 14, y: 14, w: 248, h: 98 }, anchor: 'top-left', style: panelStyle(p, 10) },
                { id: 'hud_player_name', type: 'label', text: 'LV {player.level}', rect: { x: 24, y: 18, w: 126, h: 20 }, anchor: 'top-left', style: tLabel(p, p.gold, 18, 11, { letterSpacing: 1 }) },
                { id: 'hud_xp_chip', type: 'label', text: 'XP {player.xp}', rect: { x: 156, y: 18, w: 96, h: 20 }, anchor: 'top-left', style: tLabel(p, p.violet, 14, 11, { backgroundColor: p.panelInner, borderWidth: 1, borderColor: p.violet, borderRadius: p.btnRadius, textAlign: 'center' }) },
                { id: 'hud_hp_bar', type: 'bar', text: 'HP {player.hp}/{player.maxHp}', rect: { x: 24, y: 42, w: 228, h: 18 }, anchor: 'top-left', style: barStyle(p, 11, { fontSize: 15 }), props: { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: p.hp, ticks: p.ticks, flashOnDamage: true } },
                { id: 'hud_mp_bar', type: 'bar', text: 'MP {player.mana}/{player.maxMana}', rect: { x: 24, y: 66, w: 228, h: 15 }, anchor: 'top-left', style: barStyle(p, 11, { fontSize: 13 }), props: { variable: 'player.mana', maxVariable: 'player.maxMana', fillColor: p.mp, ticks: Math.max(0, p.ticks - 2) } },
                { id: 'hud_st_bar', type: 'bar', text: 'ST {player.stamina}/{player.maxStamina}', rect: { x: 24, y: 86, w: 228, h: 15 }, anchor: 'top-left', style: barStyle(p, 11, { fontSize: 13 }), props: { variable: 'player.stamina', maxVariable: 'player.maxStamina', fillColor: p.st, ticks: Math.max(0, p.ticks - 2) } },

                { id: 'hud_objective_panel', type: 'panel', rect: { x: 14, y: 120, w: 248, h: 44 }, anchor: 'top-left', style: panelStyle(p, 10) },
                { id: 'hud_objective_label', type: 'label', text: 'OBJ // FIND THE EXIT', rect: { x: 24, y: 126, w: 228, h: 16 }, anchor: 'top-left', style: tLabel(p, p.ink, 16, 11) },
                { id: 'hud_objective_sub', type: 'label', text: 'SECTOR STATUS: ACTIVE', rect: { x: 24, y: 144, w: 228, h: 14 }, anchor: 'top-left', style: tLabel(p, p.accent, 14, 11) },

                { id: 'hud_comms_panel', type: 'panel', rect: { x: 14, y: 14, w: 196, h: 68 }, anchor: 'top-right', style: panelStyle(p, 10) },
                { id: 'hud_pause_btn', type: 'button', text: '||', rect: { x: 22, y: 22, w: 28, h: 28 }, anchor: 'top-right', style: btnStyle(p, p.gold, 12, { fontSize: 15, letterSpacing: 0 }), script: 'togglePause', props: {} },
                { id: 'hud_time', type: 'label', text: '{gameTimeFormatted}', rect: { x: 58, y: 21, w: 140, h: 18 }, anchor: 'top-right', style: tLabel(p, p.gold, 18, 11, { textAlign: 'right' }) },
                { id: 'hud_coins', type: 'label', text: '{player.coins} CR', rect: { x: 58, y: 40, w: 140, h: 16 }, anchor: 'top-right', style: tLabel(p, p.green, 15, 11, { textAlign: 'right' }) },
                { id: 'hud_zone', type: 'label', text: 'ZONE // ACTIVE', rect: { x: 22, y: 59, w: 176, h: 16 }, anchor: 'top-right', style: tLabel(p, p.cyan, 14, 11, { textAlign: 'right' }) },

                { id: 'hud_invbar_panel', type: 'panel', rect: { x: 0, y: 11, w: 408, h: 56 }, anchor: 'bottom-center', style: panelStyle(p, 10, { backgroundColor: p.panelInner }) },
                ...slots
            ]
        };
    }

    function buildMinimalHudScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        const slots = [];
        const keys = ['1', '2', 'Q', 'E'];
        for (let i = 0; i < 4; i++) {
            const x = -75 + i * 50;
            slots.push({
                id: 'min_slot_' + (i + 1),
                type: 'slot',
                text: keys[i],
                rect: { x: x, y: 20, w: 42, h: 42 },
                anchor: 'bottom-center',
                style: { backgroundColor: p.panelInner, color: i >= 2 ? p.cyan : p.gold, borderWidth: 1, borderColor: i >= 2 ? p.cyan : p.gold, borderRadius: p.btnRadius, fontSize: 15, fontWeight: '400', zIndex: 11 },
                props: Object.assign({ variable: 'player.inventory.' + i }, i === 0 ? { selected: true } : {})
            });
        }
        return {
            elements: [
                { id: 'min_vitals_panel', type: 'panel', rect: { x: 14, y: 14, w: 212, h: 56 }, anchor: 'top-left', style: panelStyle(p, 10) },
                { id: 'min_lv_label', type: 'label', text: 'LV {player.level}', rect: { x: 24, y: 18, w: 92, h: 20 }, anchor: 'top-left', style: tLabel(p, p.gold, 17, 11) },
                { id: 'min_coins_label', type: 'label', text: '{player.coins} CR', rect: { x: 120, y: 18, w: 96, h: 20 }, anchor: 'top-left', style: tLabel(p, p.green, 15, 11, { textAlign: 'right' }) },
                { id: 'min_hp_bar', type: 'bar', text: 'HP {player.hp}/{player.maxHp}', rect: { x: 24, y: 42, w: 192, h: 18 }, anchor: 'top-left', style: barStyle(p, 11, { fontSize: 15 }), props: { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: p.hp, ticks: p.ticks, flashOnDamage: true } },

                { id: 'min_clock_panel', type: 'panel', rect: { x: 14, y: 14, w: 96, h: 32 }, anchor: 'top-right', style: panelStyle(p, 10) },
                { id: 'min_clock_label', type: 'label', text: '{gameTimeFormatted}', rect: { x: 50, y: 18, w: 52, h: 24 }, anchor: 'top-right', style: tLabel(p, p.ink, 17, 11, { textAlign: 'right' }) },
                { id: 'min_pause_btn', type: 'button', text: '||', rect: { x: 18, y: 17, w: 26, h: 26 }, anchor: 'top-right', style: btnStyle(p, p.gold, 12, { fontSize: 14, letterSpacing: 0 }), script: 'togglePause' },

                { id: 'min_hotbar_panel', type: 'panel', rect: { x: 0, y: 14, w: 212, h: 54 }, anchor: 'bottom-center', style: panelStyle(p, 10, { backgroundColor: p.panelInner }) },
                ...slots
            ]
        };
    }

    function buildBossArenaHudScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        const slots = [];
        const keys = ['1', '2', 'Q', 'R'];
        for (let i = 0; i < 4; i++) {
            const x = 168 - i * 50;
            slots.push({
                id: 'boss_skill_' + (i + 1),
                type: 'slot',
                text: keys[i],
                rect: { x: x, y: 20, w: 42, h: 42 },
                anchor: 'bottom-right',
                style: { backgroundColor: p.panelInner, color: p.cyan, borderWidth: 1, borderColor: p.cyan, borderRadius: p.btnRadius, fontSize: 15, fontWeight: '400', zIndex: 11 },
                props: { variable: 'player.inventory.' + i }
            });
        }
        return {
            elements: [
                { id: 'boss_bar_panel', type: 'panel', rect: { x: 0, y: 14, w: 440, h: 50 }, anchor: 'top-center', style: panelStyle(p, 10, { borderColor: p.accent }) },
                { id: 'boss_name_label', type: 'label', text: 'APEX WARDEN // PHASE II', rect: { x: 0, y: 18, w: 416, h: 18 }, anchor: 'top-center', style: tLabel(p, p.accent, 17, 11, { textAlign: 'center', letterSpacing: 1 }) },
                { id: 'boss_hp_bar', type: 'bar', text: 'BOSS {boss.hp}/{boss.maxHp}', rect: { x: 0, y: 38, w: 416, h: 18 }, anchor: 'top-center', style: barStyle(p, 11, { fontSize: 15 }), props: { variable: 'boss.hp', maxVariable: 'boss.maxHp', fillColor: p.hp, ticks: p.ticks } },

                { id: 'boss_player_panel', type: 'panel', rect: { x: 14, y: 14, w: 224, h: 62 }, anchor: 'bottom-left', style: panelStyle(p, 10) },
                { id: 'boss_player_label', type: 'label', text: 'LV {player.level} // SHIELD {player.stamina}', rect: { x: 24, y: 54, w: 204, h: 16 }, anchor: 'bottom-left', style: tLabel(p, p.gold, 15, 11) },
                { id: 'boss_player_hp', type: 'bar', text: 'HP {player.hp}/{player.maxHp}', rect: { x: 24, y: 26, w: 204, h: 20 }, anchor: 'bottom-left', style: barStyle(p, 11, { fontSize: 15 }), props: { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: p.green, ticks: 6 } },

                { id: 'boss_skills_panel', type: 'panel', rect: { x: 14, y: 14, w: 212, h: 54 }, anchor: 'bottom-right', style: panelStyle(p, 10, { backgroundColor: p.panelInner }) },
                ...slots
            ]
        };
    }

    function buildQuestHudScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        const slots = [];
        for (let i = 0; i < 6; i++) {
            const x = -125 + i * 50;
            slots.push({
                id: 'quest_slot_' + (i + 1),
                type: 'slot',
                text: String(i + 1),
                rect: { x: x, y: 20, w: 42, h: 42 },
                anchor: 'bottom-center',
                style: { backgroundColor: p.panelInner, color: p.gold, borderWidth: 1, borderColor: p.gold, borderRadius: p.btnRadius, fontSize: 15, fontWeight: '400', zIndex: 11 },
                props: { variable: 'player.inventory.' + i }
            });
        }
        return {
            elements: [
                { id: 'qhud_vitals_panel', type: 'panel', rect: { x: 14, y: 14, w: 236, h: 84 }, anchor: 'top-left', style: panelStyle(p, 10) },
                { id: 'qhud_name', type: 'label', text: 'LV {player.level} // EXPLORER', rect: { x: 24, y: 20, w: 216, h: 18 }, anchor: 'top-left', style: tLabel(p, p.gold, 17, 11) },
                { id: 'qhud_hp', type: 'bar', text: 'HP {player.hp}/{player.maxHp}', rect: { x: 24, y: 42, w: 216, h: 18 }, anchor: 'top-left', style: barStyle(p, 11, { fontSize: 15 }), props: { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: p.hp, ticks: p.ticks } },
                { id: 'qhud_mp', type: 'bar', text: 'MP {player.mana}/{player.maxMana}', rect: { x: 24, y: 66, w: 216, h: 16 }, anchor: 'top-left', style: barStyle(p, 11, { fontSize: 14 }), props: { variable: 'player.mana', maxVariable: 'player.maxMana', fillColor: p.mp, ticks: Math.max(0, p.ticks - 2) } },

                { id: 'qhud_tracker_panel', type: 'panel', rect: { x: 14, y: 14, w: 224, h: 114 }, anchor: 'top-right', style: panelStyle(p, 10) },
                { id: 'qhud_tracker_title', type: 'label', text: 'ACTIVE QUESTS', rect: { x: 24, y: 22, w: 204, h: 18 }, anchor: 'top-right', style: tLabel(p, p.cyan, 16, 11, { textAlign: 'right' }) },
                { id: 'qhud_q1', type: 'label', text: '[*] SPEAK WITH ELDER (1/1)', rect: { x: 24, y: 48, w: 204, h: 20 }, anchor: 'top-right', style: tLabel(p, p.green, 14, 11, { textAlign: 'right' }) },
                { id: 'qhud_q2', type: 'label', text: '[ ] RECOVER RELIC (0/3)', rect: { x: 24, y: 72, w: 204, h: 20 }, anchor: 'top-right', style: tLabel(p, p.ink, 14, 11, { textAlign: 'right' }) },
                { id: 'qhud_q3', type: 'label', text: '[ ] UNLOCK NORTH GATE', rect: { x: 24, y: 96, w: 204, h: 20 }, anchor: 'top-right', style: tLabel(p, p.muted, 14, 11, { textAlign: 'right' }) },

                { id: 'qhud_bar_panel', type: 'panel', rect: { x: 0, y: 14, w: 308, h: 54 }, anchor: 'bottom-center', style: panelStyle(p, 10, { backgroundColor: p.panelInner }) },
                ...slots
            ]
        };
    }

    function buildPauseScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            background: true,
            elements: [
                { id: 'pause_scrim', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', borderRadius: 0, boxShadow: 'none', zIndex: 40 } },
                { id: 'pause_panel', type: 'panel', rect: { x: 0, y: 0, w: 296, h: 276 }, anchor: 'center', style: panelStyle(p, 50, { borderWidth: 1, borderColor: p.gold }) },
                { id: 'pause_title', type: 'label', text: 'SYSTEM PAUSED', rect: { x: 0, y: -96, w: 256, h: 30 }, anchor: 'center', style: tLabel(p, p.gold, 28, 51, { textAlign: 'center', letterSpacing: 1 }) },
                { id: 'pause_sub', type: 'label', text: 'GAME STANDBY', rect: { x: 0, y: -66, w: 256, h: 18 }, anchor: 'center', style: tLabel(p, p.muted, 15, 51, { textAlign: 'center', fontWeight: '400' }) },
                { id: 'pause_resume', type: 'button', text: 'RESUME', rect: { x: 0, y: -22, w: 224, h: 36 }, anchor: 'center', style: btnStyle(p, p.green, 52), script: 'RESUME_GAME' },
                { id: 'pause_inventory', type: 'button', text: 'INVENTORY', rect: { x: 0, y: 24, w: 224, h: 36 }, anchor: 'center', style: btnStyle(p, p.cyan, 52), script: 'navigate:inventory' },
                { id: 'pause_quit', type: 'button', text: 'QUIT TO MENU', rect: { x: 0, y: 70, w: 224, h: 36 }, anchor: 'center', style: btnStyle(p, p.accent, 52), script: 'QUIT' }
            ]
        };
    }

    function buildInventoryScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        const previewSlots = [];
        const labels = ['A', 'B', 'C', 'D'];
        for (let i = 0; i < 4; i++) {
            previewSlots.push({
                id: 'inv_slot_' + labels[i].toLowerCase(),
                type: 'slot',
                text: labels[i],
                rect: { x: -222 + i * 56, y: -78, w: 46, h: 46 },
                anchor: 'center',
                style: { backgroundColor: p.panelInner, color: p.gold, borderWidth: 1, borderColor: p.gold, borderRadius: p.btnRadius, fontSize: 15, fontWeight: '400', zIndex: 52 },
                props: { variable: 'inventory.' + i }
            });
        }
        return {
            background: true,
            elements: [
                { id: 'inv_scrim', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', borderRadius: 0, boxShadow: 'none', zIndex: 40 } },
                { id: 'inv_panel', type: 'panel', rect: { x: 0, y: 0, w: 560, h: 340 }, anchor: 'center', style: panelStyle(p, 50, { borderWidth: 1, borderColor: p.cyan }) },
                { id: 'inv_title', type: 'label', text: 'INVENTORY CACHE', rect: { x: -130, y: -138, w: 260, h: 26 }, anchor: 'center', style: tLabel(p, p.cyan, 24, 51) },
                { id: 'inv_close', type: 'button', text: 'CLOSE', rect: { x: 210, y: -138, w: 96, h: 26 }, anchor: 'center', style: btnStyle(p, p.accent, 52, { fontSize: 15 }), script: 'CLOSE_MENU' },
                { id: 'inv_grid', type: 'panel', rect: { x: -94, y: 18, w: 332, h: 264 }, anchor: 'center', style: panelStyle(p, 51, { backgroundColor: p.panelInner, borderColor: p.border }) },
                { id: 'inv_info', type: 'panel', rect: { x: 170, y: 18, w: 176, h: 264 }, anchor: 'center', style: panelStyle(p, 51, { backgroundColor: p.panelInner, borderColor: p.border }) },
                { id: 'inv_hint', type: 'label', text: 'SELECT ITEM', rect: { x: 170, y: -90, w: 150, h: 22 }, anchor: 'center', style: tLabel(p, p.gold, 17, 52, { textAlign: 'center' }) },
                { id: 'inv_desc', type: 'label', text: 'Inspect stats, equip gear, or consume restorative supplies.', rect: { x: 170, y: -32, w: 150, h: 68 }, anchor: 'center', style: tLabel(p, p.muted, 14, 52, { textAlign: 'center', fontWeight: '400' }) },
                ...previewSlots
            ]
        };
    }

    function buildCharStatsScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        const attrs = [
            { id: 'stat_str', text: 'STRENGTH // 18', y: -76, color: p.hp },
            { id: 'stat_agi', text: 'AGILITY // 24', y: -36, color: p.st },
            { id: 'stat_int', text: 'INTELLECT // 15', y: 4, color: p.mp },
            { id: 'stat_luk', text: 'FORTUNE // 12', y: 44, color: p.gold }
        ];
        return {
            background: true,
            elements: [
                { id: 'stats_scrim', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', zIndex: 40 } },
                { id: 'stats_panel', type: 'panel', rect: { x: 0, y: 0, w: 580, h: 336 }, anchor: 'center', style: panelStyle(p, 50, { borderColor: p.gold }) },
                { id: 'stats_title', type: 'label', text: 'CHARACTER SHEET', rect: { x: -120, y: -138, w: 280, h: 28 }, anchor: 'center', style: tLabel(p, p.gold, 24, 51) },
                { id: 'stats_close', type: 'button', text: 'CLOSE', rect: { x: 220, y: -138, w: 96, h: 26 }, anchor: 'center', style: btnStyle(p, p.accent, 52, { fontSize: 15 }), script: 'CLOSE_MENU' },
                { id: 'stats_profile_box', type: 'panel', rect: { x: -178, y: 14, w: 184, h: 250 }, anchor: 'center', style: panelStyle(p, 51, { backgroundColor: p.panelInner }) },
                { id: 'stats_avatar_slot', type: 'slot', text: 'HERO', rect: { x: -178, y: -42, w: 92, h: 92 }, anchor: 'center', style: { backgroundColor: p.panel, color: p.gold, borderWidth: 1, borderColor: p.gold, borderRadius: p.btnRadius, fontSize: 16, fontWeight: '400', zIndex: 52 } },
                { id: 'stats_class_lbl', type: 'label', text: 'LV {player.level} VANGUARD', rect: { x: -178, y: 34, w: 164, h: 22 }, anchor: 'center', style: tLabel(p, p.ink, 16, 52, { textAlign: 'center' }) },
                { id: 'stats_perk_lbl', type: 'label', text: 'PASSIVE: SWIFT STEP (+10% SPD)', rect: { x: -178, y: 76, w: 164, h: 42 }, anchor: 'center', style: tLabel(p, p.muted, 14, 52, { textAlign: 'center' }) },
                { id: 'stats_attr_box', type: 'panel', rect: { x: 94, y: 14, w: 336, h: 250 }, anchor: 'center', style: panelStyle(p, 51, { backgroundColor: p.panelInner }) },
                ...attrs.map(a => ({
                    id: a.id,
                    type: 'bar',
                    text: a.text,
                    rect: { x: 94, y: a.y, w: 300, h: 26 },
                    anchor: 'center',
                    style: barStyle(p, 52, { fontSize: 15 }),
                    props: { fillColor: a.color, ticks: p.ticks }
                })),
                { id: 'stats_footer', type: 'label', text: 'AVAILABLE ATTRIBUTE POINTS: 3', rect: { x: 94, y: 96, w: 300, h: 22 }, anchor: 'center', style: tLabel(p, p.cyan, 15, 52, { textAlign: 'center' }) }
            ]
        };
    }

    function buildDialogueScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            background: true,
            elements: [
                { id: 'dialogue_panel', type: 'panel', rect: { x: 0, y: 80, w: 744, h: 112 }, anchor: 'bottom-center', style: panelStyle(p, 50, { borderWidth: 1, borderColor: p.gold }) },
                { id: 'dialogue_name', type: 'label', text: 'TRANSMISSION', rect: { x: 44, y: 158, w: 184, h: 24 }, anchor: 'bottom-left', style: { backgroundColor: p.gold, color: p.void, borderWidth: 0, borderRadius: p.btnRadius, fontSize: 16, fontWeight: '700', textAlign: 'center', zIndex: 51 } },
                { id: 'dialogue_text', type: 'label', text: 'The tactical link is online. Proceed toward the extraction beacon.', rect: { x: 44, y: 108, w: 712, h: 44 }, anchor: 'bottom-left', style: tLabel(p, p.ink, 20, 51, { fontWeight: '400' }) },
                { id: 'dialogue_continue', type: 'label', text: 'PRESS E TO CONTINUE', rect: { x: 44, y: 86, w: 170, h: 18 }, anchor: 'bottom-right', style: tLabel(p, p.green, 15, 51, { textAlign: 'right' }) }
            ]
        };
    }

    function buildDialogueChoicesScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            background: true,
            elements: [
                { id: 'dlg_ch_panel', type: 'panel', rect: { x: 0, y: 20, w: 740, h: 116 }, anchor: 'bottom-center', style: panelStyle(p, 50, { borderColor: p.gold }) },
                { id: 'dlg_ch_portrait', type: 'slot', text: 'NPC', rect: { x: 44, y: 34, w: 88, h: 88 }, anchor: 'bottom-left', style: { backgroundColor: p.panelInner, color: p.gold, borderWidth: 1, borderColor: p.gold, borderRadius: p.btnRadius, fontSize: 16, zIndex: 51 } },
                { id: 'dlg_ch_name', type: 'label', text: 'ARCHIVIST LYRA', rect: { x: 148, y: 96, w: 196, h: 24 }, anchor: 'bottom-left', style: { backgroundColor: p.gold, color: p.void, borderWidth: 0, borderRadius: p.btnRadius, fontSize: 16, fontWeight: '700', textAlign: 'center', zIndex: 51 } },
                { id: 'dlg_ch_text', type: 'label', text: 'The bridge mechanism is sealed. How would you like to proceed?', rect: { x: 148, y: 46, w: 592, h: 44 }, anchor: 'bottom-left', style: tLabel(p, p.ink, 19, 51) },
                { id: 'dlg_ch_hint', type: 'label', text: 'CHOOSE A RESPONSE', rect: { x: 44, y: 26, w: 180, h: 16 }, anchor: 'bottom-right', style: tLabel(p, p.muted, 14, 51, { textAlign: 'right' }) },
                { id: 'dlg_opt_1', type: 'button', text: '[1] OVERRIDE TERMINAL LOCK', rect: { x: 34, y: 230, w: 300, h: 34 }, anchor: 'bottom-right', style: btnStyle(p, p.cyan, 52, { fontSize: 16 }), script: 'action:CHOICE_1' },
                { id: 'dlg_opt_2', type: 'button', text: '[2] ASK ABOUT THE KEYCARD', rect: { x: 34, y: 188, w: 300, h: 34 }, anchor: 'bottom-right', style: btnStyle(p, p.gold, 52, { fontSize: 16 }), script: 'action:CHOICE_2' },
                { id: 'dlg_opt_3', type: 'button', text: '[3] LEAVE CONVERSATION', rect: { x: 34, y: 146, w: 300, h: 34 }, anchor: 'bottom-right', style: btnStyle(p, p.accent, 52, { fontSize: 16 }), script: 'CLOSE_MENU' }
            ]
        };
    }

    function buildGameOverScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            elements: [
                { id: 'gameover_overlay', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', borderRadius: 0, boxShadow: 'none', zIndex: 100 } },
                { id: 'gameover_panel', type: 'panel', rect: { x: 0, y: 0, w: 356, h: 252 }, anchor: 'center', style: panelStyle(p, 100, { borderWidth: 1, borderColor: p.accent }) },
                { id: 'gameover_title', type: 'label', text: 'SIGNAL LOST', rect: { x: 0, y: -74, w: 312, h: 44 }, anchor: 'center', style: tLabel(p, p.accent, 38, 101, { textAlign: 'center' }) },
                { id: 'gameover_stats', type: 'label', text: 'TIME {gameTimeFormatted} // LV {player.level}', rect: { x: 0, y: -24, w: 312, h: 22 }, anchor: 'center', style: tLabel(p, p.gold, 17, 101, { textAlign: 'center' }) },
                { id: 'gameover_retry', type: 'button', text: 'RETRY LEVEL', rect: { x: 0, y: 28, w: 224, h: 36 }, anchor: 'center', style: btnStyle(p, p.green, 101), script: 'retryLevel' },
                { id: 'gameover_quit', type: 'button', text: 'QUIT TO MENU', rect: { x: 0, y: 74, w: 224, h: 34 }, anchor: 'center', style: btnStyle(p, p.accent, 101), script: 'quitToMenu' }
            ]
        };
    }

    function buildVictoryScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            elements: [
                { id: 'vic_overlay', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', zIndex: 100 } },
                { id: 'vic_panel', type: 'panel', rect: { x: 0, y: 0, w: 400, h: 284 }, anchor: 'center', style: panelStyle(p, 100, { borderColor: p.green }) },
                { id: 'vic_title', type: 'label', text: 'STAGE CLEAR!', rect: { x: 0, y: -98, w: 350, h: 36 }, anchor: 'center', style: tLabel(p, p.green, 34, 101, { textAlign: 'center', letterSpacing: 1 }) },
                { id: 'vic_rank', type: 'label', text: 'RANK S', rect: { x: 0, y: -46, w: 160, h: 42 }, anchor: 'center', style: tLabel(p, p.gold, 26, 101, { backgroundColor: p.panelInner, borderWidth: 1, borderColor: p.gold, borderRadius: p.btnRadius, textAlign: 'center' }) },
                { id: 'vic_stats', type: 'label', text: 'TIME {gameTimeFormatted} // CREDITS +{player.coins}', rect: { x: 0, y: 8, w: 340, h: 24 }, anchor: 'center', style: tLabel(p, p.ink, 17, 101, { textAlign: 'center' }) },
                { id: 'vic_next', type: 'button', text: 'NEXT STAGE', rect: { x: -88, y: 78, w: 164, h: 38 }, anchor: 'center', style: btnStyle(p, p.green, 101), script: 'action:NEXT_LEVEL' },
                { id: 'vic_menu', type: 'button', text: 'MAIN MENU', rect: { x: 88, y: 78, w: 164, h: 38 }, anchor: 'center', style: btnStyle(p, p.cyan, 101), script: 'quitToMenu' }
            ]
        };
    }

    function buildMainMenuScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            elements: [
                { id: 'menu_bg', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.void, borderWidth: 0, borderColor: 'transparent', zIndex: 1 } },
                { id: 'menu_card', type: 'panel', rect: { x: 0, y: 8, w: 416, h: 346 }, anchor: 'center', style: panelStyle(p, 2, { borderWidth: 1, borderColor: p.accent }) },
                { id: 'menu_title', type: 'label', text: 'REDGLITCH ENGINE', rect: { x: 0, y: -120, w: 360, h: 42 }, anchor: 'center', style: tLabel(p, p.gold, 36, 3, { textAlign: 'center', letterSpacing: 2 }) },
                { id: 'menu_subtitle', type: 'label', text: 'CAMPAIGN & SANDBOX EDITION', rect: { x: 0, y: -84, w: 360, h: 20 }, anchor: 'center', style: tLabel(p, p.muted, 16, 3, { textAlign: 'center', fontWeight: '400' }) },
                { id: 'menu_btn_new', type: 'button', text: 'NEW GAME', rect: { x: 0, y: -32, w: 260, h: 38 }, anchor: 'center', style: btnStyle(p, p.green, 4, { fontSize: 19 }), script: 'action:START_GAME' },
                { id: 'menu_btn_continue', type: 'button', text: 'CONTINUE', rect: { x: 0, y: 16, w: 260, h: 36 }, anchor: 'center', style: btnStyle(p, p.cyan, 4, { fontSize: 18 }), script: 'action:LOAD_LEVEL' },
                { id: 'menu_btn_settings', type: 'button', text: 'SETTINGS', rect: { x: -68, y: 66, w: 124, h: 34 }, anchor: 'center', style: btnStyle(p, p.gold, 4, { fontSize: 16 }), script: 'navigate:settings_menu' },
                { id: 'menu_btn_quit', type: 'button', text: 'QUIT', rect: { x: 68, y: 66, w: 124, h: 34 }, anchor: 'center', style: btnStyle(p, p.accent, 4, { fontSize: 16 }), script: 'action:QUIT' },
                { id: 'menu_footer', type: 'label', text: 'SIGNED IN: GUEST // BUILD v1.0', rect: { x: 0, y: 124, w: 360, h: 20 }, anchor: 'center', style: tLabel(p, p.muted, 14, 3, { textAlign: 'center', fontWeight: '400' }) }
            ]
        };
    }

    function buildLevelSelectScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        const stages = [
            { title: '01 // OUTPOST', col: -206, row: -44, accent: p.green },
            { title: '02 // TRANSIT', col: 0, row: -44, accent: p.cyan },
            { title: '03 // FOUNDRY', col: 206, row: -44, accent: p.gold },
            { title: '04 // CANOPY', col: -206, row: 64, accent: p.cyan },
            { title: '05 // CITADEL', col: 0, row: 64, accent: p.violet },
            { title: '06 // CORE', col: 206, row: 64, accent: p.accent }
        ];
        const stageEls = [];
        stages.forEach((st, idx) => {
            const num = idx + 1;
            stageEls.push({ id: 'lvl_card_' + num, type: 'panel', rect: { x: st.col, y: st.row, w: 190, h: 92 }, anchor: 'center', style: panelStyle(p, 3, { backgroundColor: p.panelInner, borderColor: st.accent }) });
            stageEls.push({ id: 'lvl_name_' + num, type: 'label', text: st.title, rect: { x: st.col, y: st.row - 22, w: 170, h: 22 }, anchor: 'center', style: tLabel(p, st.accent, 17, 4, { textAlign: 'center' }) });
            stageEls.push({ id: 'lvl_play_' + num, type: 'button', text: 'LAUNCH', rect: { x: st.col, y: st.row + 16, w: 140, h: 28 }, anchor: 'center', style: btnStyle(p, st.accent, 4, { fontSize: 15 }), script: 'action:LOAD_LEVEL_' + num });
        });
        return {
            elements: [
                { id: 'lvl_bg', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.void, borderWidth: 0, borderColor: 'transparent', zIndex: 1 } },
                { id: 'lvl_panel', type: 'panel', rect: { x: 0, y: 0, w: 660, h: 368 }, anchor: 'center', style: panelStyle(p, 2, { borderColor: p.cyan }) },
                { id: 'lvl_title', type: 'label', text: 'CHAPTER SELECT', rect: { x: -170, y: -150, w: 280, h: 30 }, anchor: 'center', style: tLabel(p, p.gold, 26, 3) },
                { id: 'lvl_stars', type: 'label', text: 'UNLOCKED: 6 / 6', rect: { x: 96, y: -150, w: 150, h: 24 }, anchor: 'center', style: tLabel(p, p.green, 16, 3, { textAlign: 'right' }) },
                { id: 'lvl_back', type: 'button', text: 'BACK', rect: { x: 254, y: -150, w: 96, h: 28 }, anchor: 'center', style: btnStyle(p, p.accent, 4, { fontSize: 15 }), script: 'navigate:main_menu' },
                ...stageEls
            ]
        };
    }

    function buildSettingsScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            background: true,
            elements: [
                { id: 'set_scrim', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', zIndex: 40 } },
                { id: 'set_panel', type: 'panel', rect: { x: 0, y: 0, w: 420, h: 296 }, anchor: 'center', style: panelStyle(p, 50, { borderWidth: 1, borderColor: p.cyan }) },
                { id: 'set_title', type: 'label', text: 'SYSTEM SETTINGS', rect: { x: 0, y: -114, w: 360, h: 28 }, anchor: 'center', style: tLabel(p, p.cyan, 26, 51, { textAlign: 'center' }) },
                { id: 'set_audio', type: 'bar', text: 'MASTER AUDIO {settings.volume}%', rect: { x: 0, y: -58, w: 320, h: 26 }, anchor: 'center', style: barStyle(p, 51, { fontSize: 15 }), props: { fillColor: p.cyan, ticks: p.ticks } },
                { id: 'set_touch_btn', type: 'button', text: 'TOUCH CONTROLS: AUTO', rect: { x: 0, y: -12, w: 320, h: 36 }, anchor: 'center', style: btnStyle(p, p.gold, 52, { fontSize: 16 }), script: 'toggle_touch' },
                { id: 'set_gfx_btn', type: 'button', text: 'CRT SCANLINES: ON', rect: { x: 0, y: 34, w: 320, h: 36 }, anchor: 'center', style: btnStyle(p, p.ink, 52, { fontSize: 16 }), script: 'toggle_crt' },
                { id: 'set_back_btn', type: 'button', text: 'BACK', rect: { x: 0, y: 98, w: 180, h: 36 }, anchor: 'center', style: btnStyle(p, p.accent, 52, { fontSize: 17 }), script: 'navigate:pause_menu' }
            ]
        };
    }

    function buildShopScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        const rows = [
            { id: 'shop_item_1', title: 'MEDKIT (+50 HP)', price: '120 CR', y: -56, btnColor: p.green },
            { id: 'shop_item_2', title: 'MANA BATTERY', price: '180 CR', y: -4, btnColor: p.cyan },
            { id: 'shop_item_3', title: 'ARMOR PLATING', price: '350 CR', y: 48, btnColor: p.gold }
        ];
        const rowEls = [];
        rows.forEach((row) => {
            rowEls.push({ id: row.id + '_row', type: 'panel', rect: { x: 0, y: row.y, w: 480, h: 44 }, anchor: 'center', style: panelStyle(p, 51, { backgroundColor: p.panelInner, borderColor: p.border }) });
            rowEls.push({ id: row.id + '_name', type: 'label', text: row.title, rect: { x: -126, y: row.y, w: 204, h: 24 }, anchor: 'center', style: tLabel(p, p.ink, 17, 52) });
            rowEls.push({ id: row.id + '_cost', type: 'label', text: row.price, rect: { x: 46, y: row.y, w: 84, h: 24 }, anchor: 'center', style: tLabel(p, p.gold, 16, 52, { textAlign: 'right' }) });
            rowEls.push({ id: row.id + '_buy', type: 'button', text: 'BUY', rect: { x: 170, y: row.y, w: 108, h: 28 }, anchor: 'center', style: btnStyle(p, row.btnColor, 52, { fontSize: 15 }), script: 'action:BUY_' + row.id.toUpperCase() });
        });
        return {
            background: true,
            elements: [
                { id: 'shop_scrim', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', zIndex: 40 } },
                { id: 'shop_panel', type: 'panel', rect: { x: 0, y: 0, w: 536, h: 316 }, anchor: 'center', style: panelStyle(p, 50, { borderWidth: 1, borderColor: p.gold }) },
                { id: 'shop_title', type: 'label', text: 'FIELD SUPPLY VENDOR', rect: { x: -120, y: -124, w: 250, h: 26 }, anchor: 'center', style: tLabel(p, p.gold, 24, 51) },
                { id: 'shop_credits', type: 'label', text: 'CREDITS: {player.coins}', rect: { x: 84, y: -124, w: 112, h: 24 }, anchor: 'center', style: tLabel(p, p.green, 16, 51, { textAlign: 'right' }) },
                { id: 'shop_close', type: 'button', text: 'X', rect: { x: 224, y: -124, w: 40, h: 26 }, anchor: 'center', style: btnStyle(p, p.accent, 52, { fontSize: 16 }), script: 'CLOSE_MENU' },
                ...rowEls,
                { id: 'shop_hint', type: 'label', text: 'SELECT SUPPLY MODULE TO PURCHASE', rect: { x: 0, y: 118, w: 440, h: 20 }, anchor: 'center', style: tLabel(p, p.muted, 14, 51, { textAlign: 'center', fontWeight: '400' }) }
            ]
        };
    }

    function buildAchievementsViewScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        const rows = [
            { id: 'ach_1', title: 'FIRST STEPS // ENTER SECTOR 1', state: 'UNLOCKED', y: -76, color: p.gold },
            { id: 'ach_2', title: 'SHARPSHOOTER // 25 TAKEDOWNS', state: 'UNLOCKED', y: -20, color: p.green },
            { id: 'ach_3', title: 'CARTOGRAPHER // FIND 3 RELICS', state: '2 / 3', y: 36, color: p.cyan },
            { id: 'ach_4', title: 'UNTOUCHABLE // CLEAR NO-DAMAGE', state: 'LOCKED', y: 92, color: p.muted }
        ];
        const rowEls = [];
        rows.forEach((r) => {
            rowEls.push({ id: r.id + '_row', type: 'panel', rect: { x: 0, y: r.y, w: 548, h: 46 }, anchor: 'center', style: panelStyle(p, 51, { backgroundColor: p.panelInner, borderColor: r.color }) });
            rowEls.push({ id: r.id + '_name', type: 'label', text: r.title, rect: { x: -80, y: r.y, w: 348, h: 24 }, anchor: 'center', style: tLabel(p, p.ink, 17, 52) });
            rowEls.push({ id: r.id + '_state', type: 'label', text: r.state, rect: { x: 186, y: r.y, w: 140, h: 22 }, anchor: 'center', style: tLabel(p, r.color, 16, 52, { textAlign: 'right' }) });
        });
        return {
            background: true,
            elements: [
                { id: 'ach_scrim', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', zIndex: 40 } },
                { id: 'ach_panel', type: 'panel', rect: { x: 0, y: 0, w: 596, h: 348 }, anchor: 'center', style: panelStyle(p, 50, { borderColor: p.gold }) },
                { id: 'ach_title', type: 'label', text: 'TROPHIES & ACHIEVEMENTS', rect: { x: -136, y: -142, w: 280, h: 28 }, anchor: 'center', style: tLabel(p, p.gold, 24, 51) },
                { id: 'ach_progress', type: 'label', text: 'PROGRESS: 50%', rect: { x: 96, y: -142, w: 140, h: 24 }, anchor: 'center', style: tLabel(p, p.green, 16, 51, { textAlign: 'right' }) },
                { id: 'ach_close', type: 'button', text: 'CLOSE', rect: { x: 236, y: -142, w: 84, h: 26 }, anchor: 'center', style: btnStyle(p, p.accent, 52, { fontSize: 15 }), script: 'CLOSE_MENU' },
                ...rowEls
            ]
        };
    }

    function buildKitPaletteScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            elements: [
                { id: 'kit_title', type: 'label', text: 'REDGLITCH UI KIT', rect: { x: 24, y: 20, w: 280, h: 30 }, anchor: 'top-left', style: tLabel(p, p.gold, 28, 1) },
                { id: 'kit_panel_gold', type: 'panel', rect: { x: 24, y: 66, w: 224, h: 74 }, anchor: 'top-left', style: panelStyle(p, 1, { borderColor: p.gold }) },
                { id: 'kit_panel_cyan', type: 'panel', rect: { x: 272, y: 66, w: 224, h: 74 }, anchor: 'top-left', style: panelStyle(p, 1, { borderColor: p.cyan }) },
                { id: 'kit_panel_red', type: 'panel', rect: { x: 520, y: 66, w: 224, h: 74 }, anchor: 'top-left', style: panelStyle(p, 1, { borderColor: p.accent }) },
                { id: 'kit_label_header', type: 'label', text: 'MISSION HEADER', rect: { x: 36, y: 88, w: 200, h: 24 }, anchor: 'top-left', style: tLabel(p, p.gold, 20, 2, { textAlign: 'center' }) },
                { id: 'kit_label_body', type: 'label', text: 'COMPACT BODY LABEL', rect: { x: 284, y: 92, w: 200, h: 18 }, anchor: 'top-left', style: tLabel(p, p.ink, 16, 2, { textAlign: 'center', fontWeight: '400' }) },
                { id: 'kit_label_alert', type: 'label', text: 'ALERT STATE', rect: { x: 532, y: 90, w: 200, h: 20 }, anchor: 'top-left', style: tLabel(p, p.accent, 18, 2, { textAlign: 'center' }) },
                { id: 'kit_hp', type: 'bar', text: 'HP {player.hp}/{player.maxHp}', rect: { x: 24, y: 172, w: 224, h: 20 }, anchor: 'top-left', style: barStyle(p, 1, { fontSize: 15 }), props: { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: p.hp, ticks: p.ticks } },
                { id: 'kit_mp', type: 'bar', text: 'MP {player.mana}/{player.maxMana}', rect: { x: 272, y: 172, w: 224, h: 20 }, anchor: 'top-left', style: barStyle(p, 1, { fontSize: 15 }), props: { variable: 'player.mana', maxVariable: 'player.maxMana', fillColor: p.mp, ticks: p.ticks } },
                { id: 'kit_st', type: 'bar', text: 'ST {player.stamina}/{player.maxStamina}', rect: { x: 520, y: 172, w: 224, h: 20 }, anchor: 'top-left', style: barStyle(p, 1, { fontSize: 15 }), props: { variable: 'player.stamina', maxVariable: 'player.maxStamina', fillColor: p.st, ticks: p.ticks } },
                { id: 'kit_primary_button', type: 'button', text: 'PRIMARY', rect: { x: 24, y: 224, w: 164, h: 36 }, anchor: 'top-left', style: btnStyle(p, p.green, 1), script: 'action:PRIMARY' },
                { id: 'kit_secondary_button', type: 'button', text: 'SECONDARY', rect: { x: 204, y: 224, w: 164, h: 36 }, anchor: 'top-left', style: btnStyle(p, p.cyan, 1), script: 'action:SECONDARY' },
                { id: 'kit_danger_button', type: 'button', text: 'DANGER', rect: { x: 384, y: 224, w: 164, h: 36 }, anchor: 'top-left', style: btnStyle(p, p.accent, 1), script: 'action:DANGER' },
                { id: 'kit_slot_gold', type: 'slot', text: '1', rect: { x: 24, y: 300, w: 48, h: 48 }, anchor: 'top-left', style: { backgroundColor: p.panelInner, color: p.gold, borderColor: p.gold, borderWidth: 1, borderRadius: p.btnRadius, fontSize: 16, fontWeight: '400', zIndex: 1 } },
                { id: 'kit_slot_cyan', type: 'slot', text: 'Q', rect: { x: 88, y: 300, w: 48, h: 48 }, anchor: 'top-left', style: { backgroundColor: p.panelInner, color: p.cyan, borderColor: p.cyan, borderWidth: 1, borderRadius: p.btnRadius, fontSize: 16, fontWeight: '400', zIndex: 1 } },
                { id: 'kit_slot_red', type: 'slot', text: '!', rect: { x: 152, y: 300, w: 48, h: 48 }, anchor: 'top-left', style: { backgroundColor: p.panelInner, color: p.accent, borderColor: p.accent, borderWidth: 1, borderRadius: p.btnRadius, fontSize: 16, fontWeight: '400', zIndex: 1 } },
                { id: 'kit_tip', type: 'label', text: 'Copy or duplicate these pre-styled building blocks into any screen.', rect: { x: 24, y: 380, w: 680, h: 22 }, anchor: 'top-left', style: tLabel(p, p.muted, 16, 1, { fontWeight: '400' }) }
            ]
        };
    }

    function buildKitDocument(themeId, targetRes) {
        const t = THEMES[themeId] || THEMES.redglitch_ops;
        const doc = {
            format: 'redglitch-ui',
            formatVersion: 1,
            resolution: { w: BASE_RES.w, h: BASE_RES.h },
            designSystem: {
                name: t.name,
                themeId: t.id,
                grid: 4,
                palette: clone(t.palette),
                typography: { fontFamily: 'VT323, monospace', letterSpacing: 0 }
            },
            screens: {
                main_hud: buildHudScreen(themeId),
                pause_menu: buildPauseScreen(themeId),
                inventory: buildInventoryScreen(themeId),
                dialogue_box: buildDialogueScreen(themeId),
                gameover: buildGameOverScreen(themeId),
                main_menu: buildMainMenuScreen(themeId),
                settings_menu: buildSettingsScreen(themeId),
                ui_kit_palette: buildKitPaletteScreen(themeId)
            }
        };
        return targetRes ? scaleDocument(doc, targetRes) : doc;
    }

    const INTERFACE_KITS = Object.keys(THEMES).map((id) => ({
        id: id,
        name: THEMES[id].name,
        badge: THEMES[id].badge,
        description: THEMES[id].description,
        accent: THEMES[id].accent,
        palette: clone(THEMES[id].palette),
        build: function (targetRes) { return buildKitDocument(id, targetRes); }
    }));

    const SCREEN_PRESETS = [
        { id: 'main_hud', name: 'Tactical Full HUD', category: 'HUD', description: 'HP/MP/ST vitals, mission objective card, clock/credits/pause panel, and 8-slot hotbar.', build: (themeId, res) => scaleScreen(buildHudScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'hud_minimal', name: 'Featherweight Corner HUD', category: 'HUD', description: 'Minimal corner HP/coin pill, slim clock button, and compact 4-slot bar with wide open view.', build: (themeId, res) => scaleScreen(buildMinimalHudScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'hud_boss_arena', name: 'Boss Arena HUD', category: 'HUD', description: 'Centered Boss Health strip paired with compact player shield card and 4-skill dock.', build: (themeId, res) => scaleScreen(buildBossArenaHudScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'hud_quest_tracker', name: 'RPG Quest Tracker HUD', category: 'HUD', description: 'Explorer vitals card, live top-right quest checklist, and centered 6-slot action hotbar.', build: (themeId, res) => scaleScreen(buildQuestHudScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'main_menu', name: 'Title / Main Menu', category: 'MENU', description: 'Centered title card with New Game, Continue, Settings, and Quit actions.', build: (themeId, res) => scaleScreen(buildMainMenuScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'level_select', name: 'Chapter / Stage Select', category: 'MENU', description: 'Clean 2x3 stage grid showing chapter badges, unlock count, and launch buttons.', build: (themeId, res) => scaleScreen(buildLevelSelectScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'settings_menu', name: 'Settings Menu', category: 'MENU', description: 'Master audio bar, touch control & CRT display toggles, and navigation back button.', build: (themeId, res) => scaleScreen(buildSettingsScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'victory_screen', name: 'Stage Clear / Victory', category: 'MENU', description: 'Centered Stage Clear celebratory modal with Rank badge, run stats, and Next Stage action.', build: (themeId, res) => scaleScreen(buildVictoryScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'gameover', name: 'Game Over Screen', category: 'MENU', description: 'Centered SIGNAL LOST summary card displaying run telemetry with Retry and Quit actions.', build: (themeId, res) => scaleScreen(buildGameOverScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'pause_menu', name: 'Pause Overlay', category: 'OVERLAY', description: 'Translucent dimmed pause modal that keeps the live gameplay HUD visible underneath.', build: (themeId, res) => scaleScreen(buildPauseScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'inventory', name: 'Inventory Cache', category: 'OVERLAY', description: 'Two-column backpack overlay with left gear grid and right item inspector panel.', build: (themeId, res) => scaleScreen(buildInventoryScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'character_stats', name: 'Hero Stats & Perks', category: 'OVERLAY', description: 'Character sheet showing portrait frame, core STR/AGI/INT/LUK gauges, and active perks.', build: (themeId, res) => scaleScreen(buildCharStatsScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'dialogue_box', name: 'Dialogue Transmission', category: 'OVERLAY', description: 'Bottom-anchored transmission frame with speaker badge, message text, and prompt.', build: (themeId, res) => scaleScreen(buildDialogueScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'dialogue_choices', name: 'Branching Dialogue Card', category: 'OVERLAY', description: 'NPC portrait dialogue box paired with 3 stacked selectable conversation choice buttons.', build: (themeId, res) => scaleScreen(buildDialogueChoicesScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'shop_menu', name: 'Merchant / Shop', category: 'OVERLAY', description: 'Clean 3-row vendor catalog with live credit counter, pricing, and buy actions.', build: (themeId, res) => scaleScreen(buildShopScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'achievements_view', name: 'Trophies / Achievements', category: 'OVERLAY', description: 'Structured trophy progress list showing unlocked milestones and completion percentage.', build: (themeId, res) => scaleScreen(buildAchievementsViewScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) }
    ];

    /**
     * Audits a single screen's geometry for out-of-bounds widgets or accidental overlaps.
     * Intentionally enclosing container panels (e.g. a card holding interior labels/bars with higher/equal zIndex)
     * and fullscreen scrims/backgrounds are allowed. Partial protrusion or sibling collisions are flagged.
     */
    function validateScreenLayout(screen, resolution) {
        const resW = Number(resolution && resolution.w) || BASE_RES.w;
        const resH = Number(resolution && resolution.h) || BASE_RES.h;
        const els = (screen && screen.elements) || [];
        const boxes = els.map((el) => {
            const r = resolveRect(el.rect, el.anchor || 'top-left', { w: resW, h: resH });
            const z = Number(el.style && el.style.zIndex) || 0;
            const isFullBg = (el.type === 'panel') && r.w >= resW * 0.92 && r.h >= resH * 0.92;
            return {
                id: el.id,
                type: el.type,
                x1: r.left,
                y1: r.top,
                x2: r.left + r.w,
                y2: r.top + r.h,
                w: r.w,
                h: r.h,
                z: z,
                condition: String(el.condition || '').trim(),
                isFullBg: isFullBg
            };
        });

        const outOfBounds = [];
        boxes.forEach((b) => {
            if (b.x1 < 0 || b.y1 < 0 || b.x2 > resW || b.y2 > resH) {
                outOfBounds.push({ id: b.id, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 });
            }
        });

        const overlaps = [];
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const A = boxes[i];
                const B = boxes[j];
                if (A.isFullBg || B.isFullBg) continue;
                if (A.condition && B.condition && (A.condition === '!' + B.condition || B.condition === '!' + A.condition)) continue;
                const ix = Math.max(0, Math.min(A.x2, B.x2) - Math.max(A.x1, B.x1));
                const iy = Math.max(0, Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1));
                if (ix <= 0 || iy <= 0) continue;

                const aContainsB = A.type === 'panel' && B.x1 >= A.x1 && B.y1 >= A.y1 && B.x2 <= A.x2 && B.y2 <= A.y2 && (B.z >= A.z || B.type !== 'panel');
                const bContainsA = B.type === 'panel' && A.x1 >= B.x1 && A.y1 >= B.y1 && A.x2 <= B.x2 && A.y2 <= B.y2 && (A.z >= B.z || A.type !== 'panel');
                if (aContainsB || bContainsA) continue;

                overlaps.push({ a: A.id, b: B.id, ix: ix, iy: iy });
            }
        }

        return {
            ok: outOfBounds.length === 0 && overlaps.length === 0,
            outOfBounds: outOfBounds,
            overlaps: overlaps
        };
    }

    const exported = {
        BASE_RES,
        THEMES,
        INTERFACE_KITS,
        SCREEN_PRESETS,
        parseAnchor,
        resolveRect,
        screenToAnchorRect,
        convertAnchorRect,
        scaleScreen,
        scaleDocument,
        buildKitDocument,
        validateScreenLayout
    };

    if (typeof root !== 'undefined' && root) {
        root.RedglitchUITemplates = exported;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exported;
    }
})(typeof window !== 'undefined' ? window : globalThis);
