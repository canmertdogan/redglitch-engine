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
    // Theme Definitions & Screen Builders
    // ═══════════════════════════════════════════
    const THEMES = {
        redglitch_ops: {
            id: 'redglitch_ops',
            name: 'RedGlitch Tactical HUD',
            badge: 'TACTICAL RETRO',
            description: 'Sharp pixel frames, high-contrast HP/MP/ST telemetry bars, aligned 8-slot hotbar, and clean overlay menus.',
            accent: '#ff3147',
            palette: {
                void: '#05070d',
                panel: 'rgba(13, 18, 30, 0.90)',
                panelInner: 'rgba(6, 9, 16, 0.72)',
                scrim: 'rgba(4, 6, 12, 0.72)',
                border: '#000000',
                accent: '#ff3147',
                gold: '#ffd36a',
                cyan: '#49e3ff',
                green: '#62ff9a',
                violet: '#b86cff',
                ink: '#f4f7ff',
                muted: '#94a3b8',
                barTrack: '#0b0d14',
                hp: '#e23b4e',
                mp: '#3aa6e0',
                st: '#54c46a',
                radius: 0,
                panelBorderWidth: 2,
                ticks: 10,
                panelShadow: 'inset 2px 2px 0 rgba(255,255,255,0.08), inset -2px -2px 0 rgba(0,0,0,0.45), 3px 3px 0 rgba(0,0,0,0.65)',
                btnRadius: 0
            }
        },
        minimal_modern: {
            id: 'minimal_modern',
            name: 'Modern Clean Slate',
            badge: 'CLEAN STUDIO',
            description: 'Rounded translucent cards, balanced whitespace, and crisp typography built for modern action games.',
            accent: '#38bdf8',
            palette: {
                void: '#090d16',
                panel: 'rgba(15, 23, 42, 0.86)',
                panelInner: 'rgba(10, 15, 28, 0.76)',
                scrim: 'rgba(5, 8, 16, 0.68)',
                border: 'rgba(148, 163, 184, 0.28)',
                accent: '#38bdf8',
                gold: '#f8fafc',
                cyan: '#38bdf8',
                green: '#34d399',
                violet: '#a78bfa',
                ink: '#f8fafc',
                muted: '#94a3b8',
                barTrack: 'rgba(15, 23, 42, 0.95)',
                hp: '#f43f5e',
                mp: '#38bdf8',
                st: '#34d399',
                radius: 8,
                panelBorderWidth: 1,
                ticks: 0,
                panelShadow: '0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                btnRadius: 6
            }
        },
        pixel_fantasy: {
            id: 'pixel_fantasy',
            name: 'Dungeon RPG Gold',
            badge: 'FANTASY RPG',
            description: 'Antique gold trims, deep obsidian stone panels, and structured slot & dialogue framing for RPG worlds.',
            accent: '#e2b659',
            palette: {
                void: '#120d16',
                panel: 'rgba(24, 18, 28, 0.93)',
                panelInner: 'rgba(13, 10, 16, 0.82)',
                scrim: 'rgba(10, 7, 14, 0.74)',
                border: '#d4a84f',
                accent: '#e2b659',
                gold: '#f5d076',
                cyan: '#5eead4',
                green: '#86efac',
                violet: '#c084fc',
                ink: '#fef9ef',
                muted: '#b8a99a',
                barTrack: '#120d16',
                hp: '#dc2626',
                mp: '#2563eb',
                st: '#16a34a',
                radius: 2,
                panelBorderWidth: 2,
                ticks: 8,
                panelShadow: 'inset 0 0 0 1px rgba(245,208,118,0.18), 4px 4px 0 rgba(0,0,0,0.72)',
                btnRadius: 2
            }
        },
        cyber_visor: {
            id: 'cyber_visor',
            name: 'CyberOps Telemetry',
            badge: 'SCI-FI VISOR',
            description: 'Neon cyan visor frames, high-visibility telemetry strips, and compact FPS / Sci-Fi combat HUD layout.',
            accent: '#22d3ee',
            palette: {
                void: '#030b12',
                panel: 'rgba(6, 20, 32, 0.88)',
                panelInner: 'rgba(4, 13, 22, 0.80)',
                scrim: 'rgba(2, 8, 14, 0.74)',
                border: '#22d3ee',
                accent: '#22d3ee',
                gold: '#fbbf24',
                cyan: '#22d3ee',
                green: '#4ade80',
                violet: '#c084fc',
                ink: '#ecfeff',
                muted: '#7dd3fc',
                barTrack: '#04101a',
                hp: '#fb7185',
                mp: '#22d3ee',
                st: '#facc15',
                radius: 4,
                panelBorderWidth: 1,
                ticks: 12,
                panelShadow: '0 0 20px rgba(34,211,238,0.14), inset 0 1px 0 rgba(34,211,238,0.18)',
                btnRadius: 4
            }
        }
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
        const fs = (overrides && overrides.fontSize) || 15;
        return Object.assign({
            backgroundColor: p.panelInner,
            color: color,
            borderWidth: 2,
            borderColor: color,
            borderRadius: p.btnRadius,
            fontSize: 15,
            fontWeight: fs >= 15 ? '700' : '400',
            textAlign: 'center',
            letterSpacing: 1,
            zIndex: zIndex
        }, overrides || {});
    }

    function labelStyle(color, fontSize, zIndex, overrides) {
        return Object.assign({
            backgroundColor: 'transparent',
            color: color,
            fontSize: fontSize,
            fontWeight: fontSize >= 18 ? '700' : '400',
            borderWidth: 0,
            borderColor: 'transparent',
            textShadow: '2px 2px 0 #000',
            zIndex: zIndex
        }, overrides || {});
    }

    function buildHudScreen(themeId) {
        const t = THEMES[themeId] || THEMES.redglitch_ops;
        const p = t.palette;
        const slots = [];
        const keys = ['1', '2', '3', '4', 'Q', 'E', 'R', 'ULT'];
        // 8 centered slots inside bottom bar (w: 416 -> -168..+168 step 48)
        for (let i = 0; i < 8; i++) {
            const x = -168 + i * 48;
            const isSkill = i >= 4 && i <= 6;
            const isUlt = i === 7;
            const slotBorder = isUlt ? p.violet : isSkill ? p.cyan : p.gold;
            slots.push({
                id: 'inv_' + (i + 1),
                type: 'slot',
                text: keys[i],
                rect: { x: x, y: 19, w: 42, h: 42 },
                anchor: 'bottom-center',
                style: {
                    backgroundColor: p.panelInner,
                    color: slotBorder,
                    borderWidth: 2,
                    borderColor: slotBorder,
                    borderRadius: p.btnRadius,
                    fontSize: isUlt ? 10 : 12,
                    fontWeight: '400',
                    zIndex: 11
                },
                props: Object.assign({ variable: 'player.inventory.' + i }, i === 1 ? { selected: true } : {})
            });
        }

        return {
            elements: [
                // Top-left vitals card (12..268, 12..112)
                { id: 'hud_vitals_panel', type: 'panel', rect: { x: 12, y: 12, w: 256, h: 100 }, anchor: 'top-left', style: panelStyle(p, 10) },
                { id: 'hud_player_name', type: 'label', text: 'LV {player.level}', rect: { x: 22, y: 18, w: 132, h: 18 }, anchor: 'top-left', style: labelStyle(p.gold, 14, 11, { letterSpacing: 1 }) },
                { id: 'hud_xp_chip', type: 'label', text: 'XP {player.xp}', rect: { x: 160, y: 18, w: 98, h: 18 }, anchor: 'top-left', style: labelStyle(p.violet, 11, 11, { backgroundColor: 'rgba(167,139,250,0.14)', borderWidth: 1, borderColor: p.violet, borderRadius: p.btnRadius, textAlign: 'center' }) },
                { id: 'hud_hp_bar', type: 'bar', text: 'HP {player.hp}/{player.maxHp}', rect: { x: 22, y: 42, w: 236, h: 18 }, anchor: 'top-left', style: { backgroundColor: p.barTrack, borderWidth: 2, borderColor: p.border, borderRadius: p.btnRadius, fontSize: 12, fontWeight: '400', color: '#ffffff', zIndex: 11 }, props: { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: p.hp, ticks: p.ticks, flashOnDamage: true } },
                { id: 'hud_mp_bar', type: 'bar', text: 'MP {player.mana}/{player.maxMana}', rect: { x: 22, y: 66, w: 236, h: 14 }, anchor: 'top-left', style: { backgroundColor: p.barTrack, borderWidth: 2, borderColor: p.border, borderRadius: p.btnRadius, fontSize: 11, fontWeight: '400', color: '#ffffff', zIndex: 11 }, props: { variable: 'player.mana', maxVariable: 'player.maxMana', fillColor: p.mp, ticks: Math.max(0, p.ticks - 2) } },
                { id: 'hud_st_bar', type: 'bar', text: 'ST {player.stamina}/{player.maxStamina}', rect: { x: 22, y: 86, w: 236, h: 14 }, anchor: 'top-left', style: { backgroundColor: p.barTrack, borderWidth: 2, borderColor: p.border, borderRadius: p.btnRadius, fontSize: 11, fontWeight: '400', color: '#ffffff', zIndex: 11 }, props: { variable: 'player.stamina', maxVariable: 'player.maxStamina', fillColor: p.st, ticks: Math.max(0, p.ticks - 2) } },

                // Top-left objective card (below vitals, 8px clear gap)
                { id: 'hud_objective_panel', type: 'panel', rect: { x: 12, y: 120, w: 256, h: 42 }, anchor: 'top-left', style: panelStyle(p, 10) },
                { id: 'hud_objective_label', type: 'label', text: 'OBJ // FIND THE EXIT', rect: { x: 22, y: 126, w: 236, h: 14 }, anchor: 'top-left', style: labelStyle(p.ink, 13, 11) },
                { id: 'hud_objective_sub', type: 'label', text: 'HOSTILES DETECTED NEARBY', rect: { x: 22, y: 142, w: 236, h: 12 }, anchor: 'top-left', style: labelStyle(p.accent, 11, 11) },

                // Top-right comms + pause card (588..788, 12..80) — zero internal overlap!
                { id: 'hud_comms_panel', type: 'panel', rect: { x: 12, y: 12, w: 200, h: 68 }, anchor: 'top-right', style: panelStyle(p, 10) },
                { id: 'hud_pause_btn', type: 'button', text: '||', rect: { x: 20, y: 20, w: 28, h: 28 }, anchor: 'top-right', style: btnStyle(p, p.gold, 12, { fontSize: 12, letterSpacing: 0 }), script: 'togglePause', props: {} },
                { id: 'hud_time', type: 'label', text: '{gameTimeFormatted}', rect: { x: 56, y: 20, w: 144, h: 16 }, anchor: 'top-right', style: labelStyle(p.gold, 15, 11, { textAlign: 'right' }) },
                { id: 'hud_coins', type: 'label', text: '{player.coins} CR', rect: { x: 56, y: 38, w: 144, h: 14 }, anchor: 'top-right', style: labelStyle(p.green, 13, 11, { textAlign: 'right' }) },
                { id: 'hud_zone', type: 'label', text: 'ZONE // ACTIVE', rect: { x: 20, y: 56, w: 180, h: 14 }, anchor: 'top-right', style: labelStyle(p.cyan, 12, 11, { textAlign: 'right' }) },

                // Bottom-center hotbar (194..606, 382..438 — 12px above bottom edge)
                { id: 'hud_invbar_panel', type: 'panel', rect: { x: 0, y: 12, w: 412, h: 56 }, anchor: 'bottom-center', style: panelStyle(p, 10, { backgroundColor: p.panelInner }) },
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
                { id: 'pause_panel', type: 'panel', rect: { x: 0, y: 0, w: 292, h: 276 }, anchor: 'center', style: panelStyle(p, 50, { borderWidth: 2, borderColor: p.gold }) },
                { id: 'pause_title', type: 'label', text: 'SYSTEM PAUSED', rect: { x: 0, y: -98, w: 248, h: 28 }, anchor: 'center', style: labelStyle(p.gold, 24, 51, { textAlign: 'center', letterSpacing: 1 }) },
                { id: 'pause_sub', type: 'label', text: 'GAME STANDBY', rect: { x: 0, y: -70, w: 248, h: 16 }, anchor: 'center', style: labelStyle(p.muted, 11, 51, { textAlign: 'center', fontWeight: '400' }) },
                { id: 'pause_resume', type: 'button', text: 'RESUME', rect: { x: 0, y: -24, w: 220, h: 36 }, anchor: 'center', style: btnStyle(p, p.green, 52), script: 'RESUME_GAME' },
                { id: 'pause_inventory', type: 'button', text: 'INVENTORY', rect: { x: 0, y: 22, w: 220, h: 36 }, anchor: 'center', style: btnStyle(p, p.cyan, 52), script: 'navigate:inventory' },
                { id: 'pause_quit', type: 'button', text: 'QUIT TO MENU', rect: { x: 0, y: 68, w: 220, h: 36 }, anchor: 'center', style: btnStyle(p, p.accent, 52), script: 'QUIT' }
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
                style: { backgroundColor: p.panelInner, color: p.gold, borderWidth: 2, borderColor: p.gold, borderRadius: p.btnRadius, fontSize: 12, fontWeight: '400', zIndex: 52 },
                props: { variable: 'inventory.' + i }
            });
        }
        return {
            background: true,
            elements: [
                { id: 'inv_scrim', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', borderRadius: 0, boxShadow: 'none', zIndex: 40 } },
                { id: 'inv_panel', type: 'panel', rect: { x: 0, y: 0, w: 560, h: 340 }, anchor: 'center', style: panelStyle(p, 50, { borderWidth: 2, borderColor: p.cyan }) },
                { id: 'inv_title', type: 'label', text: 'INVENTORY CACHE', rect: { x: -130, y: -138, w: 260, h: 24 }, anchor: 'center', style: labelStyle(p.cyan, 20, 51) },
                { id: 'inv_close', type: 'button', text: 'CLOSE', rect: { x: 210, y: -138, w: 96, h: 24 }, anchor: 'center', style: btnStyle(p, p.accent, 52, { fontSize: 12 }), script: 'CLOSE_MENU' },
                { id: 'inv_grid', type: 'panel', rect: { x: -94, y: 18, w: 332, h: 264 }, anchor: 'center', style: panelStyle(p, 51, { backgroundColor: p.panelInner, borderColor: p.border }) },
                { id: 'inv_info', type: 'panel', rect: { x: 170, y: 18, w: 176, h: 264 }, anchor: 'center', style: panelStyle(p, 51, { backgroundColor: p.panelInner, borderColor: p.border }) },
                { id: 'inv_hint', type: 'label', text: 'SELECT ITEM', rect: { x: 170, y: -90, w: 150, h: 20 }, anchor: 'center', style: labelStyle(p.gold, 14, 52, { textAlign: 'center' }) },
                { id: 'inv_desc', type: 'label', text: 'Inspect stats, equip gear, or consume restorative supplies.', rect: { x: 170, y: -34, w: 150, h: 64 }, anchor: 'center', style: labelStyle(p.muted, 11, 52, { textAlign: 'center', fontWeight: '400' }) },
                ...previewSlots
            ]
        };
    }

    function buildDialogueScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            background: true,
            elements: [
                { id: 'dialogue_panel', type: 'panel', rect: { x: 0, y: 80, w: 744, h: 112 }, anchor: 'bottom-center', style: panelStyle(p, 50, { borderWidth: 2, borderColor: p.gold }) },
                { id: 'dialogue_name', type: 'label', text: 'TRANSMISSION', rect: { x: 44, y: 158, w: 184, h: 24 }, anchor: 'bottom-left', style: { backgroundColor: p.gold, color: '#05070d', borderWidth: 0, borderRadius: p.btnRadius, fontSize: 14, fontWeight: '700', textAlign: 'center', zIndex: 51 } },
                { id: 'dialogue_text', type: 'label', text: 'The tactical link is online. Proceed toward the extraction beacon.', rect: { x: 44, y: 106, w: 712, h: 46 }, anchor: 'bottom-left', style: labelStyle(p.ink, 18, 51, { fontWeight: '400' }) },
                { id: 'dialogue_continue', type: 'label', text: 'PRESS E TO CONTINUE', rect: { x: 44, y: 86, w: 170, h: 18 }, anchor: 'bottom-right', style: labelStyle(p.green, 12, 51, { textAlign: 'right' }) }
            ]
        };
    }

    function buildGameOverScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            elements: [
                { id: 'gameover_overlay', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: 'rgba(6,4,10,0.88)', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, boxShadow: 'none', zIndex: 100 } },
                { id: 'gameover_panel', type: 'panel', rect: { x: 0, y: 0, w: 356, h: 252 }, anchor: 'center', style: panelStyle(p, 100, { borderWidth: 2, borderColor: p.accent }) },
                { id: 'gameover_title', type: 'label', text: 'SIGNAL LOST', rect: { x: 0, y: -74, w: 312, h: 44 }, anchor: 'center', style: labelStyle(p.accent, 36, 101, { textAlign: 'center', textShadow: '3px 3px 0 #000' }) },
                { id: 'gameover_stats', type: 'label', text: 'TIME {gameTimeFormatted} // LV {player.level}', rect: { x: 0, y: -26, w: 312, h: 22 }, anchor: 'center', style: labelStyle(p.gold, 15, 101, { textAlign: 'center' }) },
                { id: 'gameover_retry', type: 'button', text: 'RETRY LEVEL', rect: { x: 0, y: 28, w: 224, h: 36 }, anchor: 'center', style: btnStyle(p, p.green, 101), script: 'retryLevel' },
                { id: 'gameover_quit', type: 'button', text: 'QUIT TO MENU', rect: { x: 0, y: 74, w: 224, h: 34 }, anchor: 'center', style: btnStyle(p, p.accent, 101), script: 'quitToMenu' }
            ]
        };
    }

    function buildMainMenuScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            elements: [
                { id: 'menu_bg', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.void, borderWidth: 0, borderColor: 'transparent', zIndex: 1 } },
                { id: 'menu_card', type: 'panel', rect: { x: 0, y: 8, w: 416, h: 346 }, anchor: 'center', style: panelStyle(p, 2, { borderWidth: 2, borderColor: p.accent }) },
                { id: 'menu_title', type: 'label', text: 'REDGLITCH ENGINE', rect: { x: 0, y: -120, w: 360, h: 42 }, anchor: 'center', style: labelStyle(p.gold, 34, 3, { textAlign: 'center', letterSpacing: 2 }) },
                { id: 'menu_subtitle', type: 'label', text: 'CAMPAIGN & SANDBOX EDITION', rect: { x: 0, y: -86, w: 360, h: 18 }, anchor: 'center', style: labelStyle(p.muted, 12, 3, { textAlign: 'center', fontWeight: '400' }) },
                { id: 'menu_btn_new', type: 'button', text: 'NEW GAME', rect: { x: 0, y: -32, w: 260, h: 38 }, anchor: 'center', style: btnStyle(p, p.green, 4, { fontSize: 16 }), script: 'action:START_GAME' },
                { id: 'menu_btn_continue', type: 'button', text: 'CONTINUE', rect: { x: 0, y: 16, w: 260, h: 36 }, anchor: 'center', style: btnStyle(p, p.cyan, 4, { fontSize: 15 }), script: 'action:LOAD_LEVEL' },
                { id: 'menu_btn_settings', type: 'button', text: 'SETTINGS', rect: { x: -68, y: 66, w: 124, h: 34 }, anchor: 'center', style: btnStyle(p, p.gold, 4, { fontSize: 13 }), script: 'navigate:settings_menu' },
                { id: 'menu_btn_quit', type: 'button', text: 'QUIT', rect: { x: 68, y: 66, w: 124, h: 34 }, anchor: 'center', style: btnStyle(p, p.accent, 4, { fontSize: 13 }), script: 'action:QUIT' },
                { id: 'menu_footer', type: 'label', text: 'SIGNED IN: GUEST // BUILD v1.0', rect: { x: 0, y: 124, w: 360, h: 18 }, anchor: 'center', style: labelStyle(p.muted, 11, 3, { textAlign: 'center', fontWeight: '400' }) }
            ]
        };
    }

    function buildSettingsScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            background: true,
            elements: [
                { id: 'set_scrim', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', zIndex: 40 } },
                { id: 'set_panel', type: 'panel', rect: { x: 0, y: 0, w: 420, h: 296 }, anchor: 'center', style: panelStyle(p, 50, { borderWidth: 2, borderColor: p.cyan }) },
                { id: 'set_title', type: 'label', text: 'SYSTEM SETTINGS', rect: { x: 0, y: -114, w: 360, h: 28 }, anchor: 'center', style: labelStyle(p.cyan, 22, 51, { textAlign: 'center' }) },
                { id: 'set_audio', type: 'bar', text: 'MASTER AUDIO {settings.volume}%', rect: { x: 0, y: -58, w: 320, h: 26 }, anchor: 'center', style: { backgroundColor: p.barTrack, borderWidth: 2, borderColor: p.border, borderRadius: p.btnRadius, fontSize: 13, fontWeight: '400', color: '#fff', zIndex: 51 }, props: { fillColor: p.cyan, ticks: p.ticks } },
                { id: 'set_touch_btn', type: 'button', text: 'TOUCH CONTROLS: AUTO', rect: { x: 0, y: -12, w: 320, h: 36 }, anchor: 'center', style: btnStyle(p, p.gold, 52, { fontSize: 13 }), script: 'toggle_touch' },
                { id: 'set_gfx_btn', type: 'button', text: 'CRT SCANLINES: ON', rect: { x: 0, y: 34, w: 320, h: 36 }, anchor: 'center', style: btnStyle(p, p.ink, 52, { fontSize: 13 }), script: 'toggle_crt' },
                { id: 'set_back_btn', type: 'button', text: 'BACK', rect: { x: 0, y: 98, w: 180, h: 36 }, anchor: 'center', style: btnStyle(p, p.accent, 52, { fontSize: 14 }), script: 'navigate:pause_menu' }
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
            rowEls.push({ id: row.id + '_name', type: 'label', text: row.title, rect: { x: -126, y: row.y, w: 204, h: 24 }, anchor: 'center', style: labelStyle(p.ink, 14, 52) });
            rowEls.push({ id: row.id + '_cost', type: 'label', text: row.price, rect: { x: 46, y: row.y, w: 84, h: 24 }, anchor: 'center', style: labelStyle(p.gold, 13, 52, { textAlign: 'right' }) });
            rowEls.push({ id: row.id + '_buy', type: 'button', text: 'BUY', rect: { x: 170, y: row.y, w: 108, h: 28 }, anchor: 'center', style: btnStyle(p, row.btnColor, 52, { fontSize: 12 }), script: 'action:BUY_' + row.id.toUpperCase() });
        });
        return {
            background: true,
            elements: [
                { id: 'shop_scrim', type: 'panel', rect: { x: 0, y: 0, w: 800, h: 450 }, anchor: 'top-left', style: { backgroundColor: p.scrim, borderWidth: 0, borderColor: 'transparent', zIndex: 40 } },
                { id: 'shop_panel', type: 'panel', rect: { x: 0, y: 0, w: 536, h: 316 }, anchor: 'center', style: panelStyle(p, 50, { borderWidth: 2, borderColor: p.gold }) },
                { id: 'shop_title', type: 'label', text: 'FIELD SUPPLY VENDOR', rect: { x: -120, y: -124, w: 250, h: 24 }, anchor: 'center', style: labelStyle(p.gold, 20, 51) },
                { id: 'shop_credits', type: 'label', text: 'CREDITS: {player.coins}', rect: { x: 84, y: -124, w: 112, h: 24 }, anchor: 'center', style: labelStyle(p.green, 13, 51, { textAlign: 'right' }) },
                { id: 'shop_close', type: 'button', text: 'X', rect: { x: 224, y: -124, w: 40, h: 24 }, anchor: 'center', style: btnStyle(p, p.accent, 52, { fontSize: 13 }), script: 'CLOSE_MENU' },
                ...rowEls,
                { id: 'shop_hint', type: 'label', text: 'SELECT SUPPLY MODULE TO PURCHASE', rect: { x: 0, y: 118, w: 440, h: 18 }, anchor: 'center', style: labelStyle(p.muted, 11, 51, { textAlign: 'center', fontWeight: '400' }) }
            ]
        };
    }

    function buildKitPaletteScreen(themeId) {
        const p = (THEMES[themeId] || THEMES.redglitch_ops).palette;
        return {
            elements: [
                { id: 'kit_title', type: 'label', text: 'REDGLITCH UI KIT', rect: { x: 24, y: 20, w: 280, h: 30 }, anchor: 'top-left', style: labelStyle(p.gold, 24, 1) },
                { id: 'kit_panel_gold', type: 'panel', rect: { x: 24, y: 66, w: 224, h: 74 }, anchor: 'top-left', style: panelStyle(p, 1, { borderColor: p.gold }) },
                { id: 'kit_panel_cyan', type: 'panel', rect: { x: 272, y: 66, w: 224, h: 74 }, anchor: 'top-left', style: panelStyle(p, 1, { borderColor: p.cyan }) },
                { id: 'kit_panel_red', type: 'panel', rect: { x: 520, y: 66, w: 224, h: 74 }, anchor: 'top-left', style: panelStyle(p, 1, { borderColor: p.accent }) },
                { id: 'kit_label_header', type: 'label', text: 'MISSION HEADER', rect: { x: 36, y: 88, w: 200, h: 24 }, anchor: 'top-left', style: labelStyle(p.gold, 18, 2, { textAlign: 'center' }) },
                { id: 'kit_label_body', type: 'label', text: 'COMPACT BODY LABEL', rect: { x: 284, y: 92, w: 200, h: 18 }, anchor: 'top-left', style: labelStyle(p.ink, 14, 2, { textAlign: 'center', fontWeight: '400' }) },
                { id: 'kit_label_alert', type: 'label', text: 'ALERT STATE', rect: { x: 532, y: 90, w: 200, h: 20 }, anchor: 'top-left', style: labelStyle(p.accent, 16, 2, { textAlign: 'center' }) },
                { id: 'kit_hp', type: 'bar', text: 'HP {player.hp}/{player.maxHp}', rect: { x: 24, y: 172, w: 224, h: 20 }, anchor: 'top-left', style: { backgroundColor: p.barTrack, borderWidth: 2, borderColor: p.border, borderRadius: p.btnRadius, fontSize: 12, fontWeight: '400', color: '#fff', zIndex: 1 }, props: { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: p.hp, ticks: p.ticks } },
                { id: 'kit_mp', type: 'bar', text: 'MP {player.mana}/{player.maxMana}', rect: { x: 272, y: 172, w: 224, h: 20 }, anchor: 'top-left', style: { backgroundColor: p.barTrack, borderWidth: 2, borderColor: p.border, borderRadius: p.btnRadius, fontSize: 12, fontWeight: '400', color: '#fff', zIndex: 1 }, props: { variable: 'player.mana', maxVariable: 'player.maxMana', fillColor: p.mp, ticks: p.ticks } },
                { id: 'kit_st', type: 'bar', text: 'ST {player.stamina}/{player.maxStamina}', rect: { x: 520, y: 172, w: 224, h: 20 }, anchor: 'top-left', style: { backgroundColor: p.barTrack, borderWidth: 2, borderColor: p.border, borderRadius: p.btnRadius, fontSize: 12, fontWeight: '400', color: '#fff', zIndex: 1 }, props: { variable: 'player.stamina', maxVariable: 'player.maxStamina', fillColor: p.st, ticks: p.ticks } },
                { id: 'kit_primary_button', type: 'button', text: 'PRIMARY', rect: { x: 24, y: 224, w: 164, h: 36 }, anchor: 'top-left', style: btnStyle(p, p.green, 1), script: 'action:PRIMARY' },
                { id: 'kit_secondary_button', type: 'button', text: 'SECONDARY', rect: { x: 204, y: 224, w: 164, h: 36 }, anchor: 'top-left', style: btnStyle(p, p.cyan, 1), script: 'action:SECONDARY' },
                { id: 'kit_danger_button', type: 'button', text: 'DANGER', rect: { x: 384, y: 224, w: 164, h: 36 }, anchor: 'top-left', style: btnStyle(p, p.accent, 1), script: 'action:DANGER' },
                { id: 'kit_slot_gold', type: 'slot', text: '1', rect: { x: 24, y: 300, w: 48, h: 48 }, anchor: 'top-left', style: { backgroundColor: p.panelInner, color: p.gold, borderColor: p.gold, borderWidth: 2, borderRadius: p.btnRadius, fontSize: 12, fontWeight: '400', zIndex: 1 } },
                { id: 'kit_slot_cyan', type: 'slot', text: 'Q', rect: { x: 88, y: 300, w: 48, h: 48 }, anchor: 'top-left', style: { backgroundColor: p.panelInner, color: p.cyan, borderColor: p.cyan, borderWidth: 2, borderRadius: p.btnRadius, fontSize: 12, fontWeight: '400', zIndex: 1 } },
                { id: 'kit_slot_red', type: 'slot', text: '!', rect: { x: 152, y: 300, w: 48, h: 48 }, anchor: 'top-left', style: { backgroundColor: p.panelInner, color: p.accent, borderColor: p.accent, borderWidth: 2, borderRadius: p.btnRadius, fontSize: 12, fontWeight: '400', zIndex: 1 } },
                { id: 'kit_tip', type: 'label', text: 'Copy or duplicate these pre-styled building blocks into any screen.', rect: { x: 24, y: 380, w: 680, h: 22 }, anchor: 'top-left', style: labelStyle(p.muted, 13, 1, { fontWeight: '400' }) }
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
        { id: 'main_hud', name: 'In-Game HUD', category: 'HUD', description: 'HP/MP/ST vitals, mission objective card, clock/credits/pause panel, and centered 8-slot hotbar.', build: (themeId, res) => scaleScreen(buildHudScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'main_menu', name: 'Title / Main Menu', category: 'MENU', description: 'Centered title card with New Game, Continue, Settings, and Quit actions.', build: (themeId, res) => scaleScreen(buildMainMenuScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'pause_menu', name: 'Pause Overlay', category: 'OVERLAY', description: 'Translucent dimmed pause modal that keeps the live gameplay HUD visible underneath.', build: (themeId, res) => scaleScreen(buildPauseScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'inventory', name: 'Inventory Cache', category: 'OVERLAY', description: 'Two-column backpack overlay with left gear grid and right item inspector panel.', build: (themeId, res) => scaleScreen(buildInventoryScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'dialogue_box', name: 'Dialogue Transmission', category: 'OVERLAY', description: 'Bottom-anchored transmission frame with speaker badge, message text, and prompt.', build: (themeId, res) => scaleScreen(buildDialogueScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'shop_menu', name: 'Merchant / Shop', category: 'OVERLAY', description: 'Clean 3-row vendor catalog with live credit counter, pricing, and buy actions.', build: (themeId, res) => scaleScreen(buildShopScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'settings_menu', name: 'Settings Menu', category: 'MENU', description: 'Master audio bar, touch control & CRT display toggles, and navigation back button.', build: (themeId, res) => scaleScreen(buildSettingsScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) },
        { id: 'gameover', name: 'Game Over Screen', category: 'MENU', description: 'Centered SIGNAL LOST summary card displaying run telemetry with Retry and Quit actions.', build: (themeId, res) => scaleScreen(buildGameOverScreen(themeId || 'redglitch_ops'), BASE_RES, res || BASE_RES) }
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
