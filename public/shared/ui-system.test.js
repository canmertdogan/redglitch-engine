const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { UIRenderer } = require('./UIRenderer.js');
const UITemplates = require('./UITemplates.js');

const ROOT = path.resolve(__dirname, '../..');

const ALL_ANCHORS = [
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right'
];

function createDomStub() {
    const makeEl = (tag) => {
        const node = {
            tagName: String(tag || 'div').toUpperCase(),
            children: [],
            dataset: {},
            className: '',
            _classes: new Set(),
            style: {
                setProperty(k, v) { this[k] = v; }
            },
            classList: {
                add(c) { node._classes.add(c); },
                remove(c) { node._classes.delete(c); },
                contains(c) { return node._classes.has(c); }
            },
            appendChild(child) {
                if (child.parentNode && Array.isArray(child.parentNode.children)) {
                    const idx = child.parentNode.children.indexOf(child);
                    if (idx !== -1) child.parentNode.children.splice(idx, 1);
                }
                child.parentNode = node;
                node.children.push(child);
                return child;
            },
            remove() {
                if (node.parentNode && Array.isArray(node.parentNode.children)) {
                    const idx = node.parentNode.children.indexOf(node);
                    if (idx !== -1) node.parentNode.children.splice(idx, 1);
                }
                node.parentNode = null;
            },
            addEventListener() {},
            set innerHTML(val) {
                if (val === '') {
                    node.children.forEach(c => { c.parentNode = null; });
                    node.children = [];
                }
                node._innerHTML = val;
            },
            get innerHTML() { return node._innerHTML || ''; },
            textContent: '',
            innerText: '',
            clientWidth: 800,
            clientHeight: 450,
            querySelectorAll(sel) {
                const cls = String(sel || '').startsWith('.') ? sel.slice(1) : null;
                const matches = [];
                const stack = [...node.children];
                while (stack.length) {
                    const cur = stack.shift();
                    if (cls && (cur._classes.has(cls) || String(cur.className || '').split(/\s+/).includes(cls))) {
                        matches.push(cur);
                    }
                    if (Array.isArray(cur.children)) stack.push(...cur.children);
                }
                return matches;
            },
            querySelector(sel) { return node.querySelectorAll(sel)[0] || null; }
        };
        return node;
    };

    const head = makeEl('head');
    const body = makeEl('body');
    return {
        head,
        body,
        createElement: makeEl,
        getElementById(id) {
            const stack = [head, body];
            while (stack.length) {
                const cur = stack.shift();
                if (cur.id === id) return cur;
                if (Array.isArray(cur.children)) stack.push(...cur.children);
            }
            return null;
        },
        querySelectorAll() { return []; }
    };
}

function withBrowserStubs(fn) {
    const prevDoc = global.document;
    const prevWin = global.window;
    const prevRaf = global.requestAnimationFrame;
    const prevCaf = global.cancelAnimationFrame;

    const dom = createDomStub();
    global.document = dom;
    global.window = { addEventListener() {}, removeEventListener() {} };
    global.requestAnimationFrame = () => 1;
    global.cancelAnimationFrame = () => {};

    try {
        return fn(dom);
    } finally {
        if (prevDoc === undefined) delete global.document; else global.document = prevDoc;
        if (prevWin === undefined) delete global.window; else global.window = prevWin;
        if (prevRaf === undefined) delete global.requestAnimationFrame; else global.requestAnimationFrame = prevRaf;
        if (prevCaf === undefined) delete global.cancelAnimationFrame; else global.cancelAnimationFrame = prevCaf;
    }
}

test('UIRenderer & UITemplates resolveRect distinguish center-left / top-center from center and round-trip all 9 anchors', () => {
    const res = { w: 800, h: 450 };

    // Regression guard: center-left must pin x from left edge and center Y vertically
    const cl = UIRenderer.resolveRect({ x: 20, y: 0, w: 120, h: 50 }, 'center-left', res);
    assert.deepEqual(cl, { x: 20, y: 0, w: 120, h: 50, left: 20, top: 200 });

    // Regression guard: top-center must pin y from top edge and center X horizontally
    const tc = UIRenderer.resolveRect({ x: 0, y: 16, w: 200, h: 30 }, 'top-center', res);
    assert.deepEqual(tc, { x: 0, y: 16, w: 200, h: 30, left: 300, top: 16 });

    for (const anchor of ALL_ANCHORS) {
        const orig = { x: 24, y: 18, w: 160, h: 44 };
        const box = UIRenderer.resolveRect(orig, anchor, res);
        const tmplBox = UITemplates.resolveRect(orig, anchor, res);
        assert.deepEqual(box, tmplBox, `UITemplates.resolveRect should match UIRenderer for ${anchor}`);

        const back = UIRenderer.screenToAnchorRect(box.left, box.top, box.w, box.h, anchor, res);
        assert.deepEqual(back, orig, `Round-trip failed for anchor ${anchor}`);
    }

    // Cross-anchor conversion must preserve pixel rect across all 9x9 pairs
    const seed = { x: 30, y: 22, w: 140, h: 40 };
    for (const from of ALL_ANCHORS) {
        const expected = UIRenderer.resolveRect(seed, from, res);
        for (const to of ALL_ANCHORS) {
            const converted = UIRenderer.convertAnchorRect(seed, from, to, res);
            const resolvedAfter = UIRenderer.resolveRect(converted, to, res);
            assert.equal(resolvedAfter.left, expected.left, `left mismatch ${from} -> ${to}`);
            assert.equal(resolvedAfter.top, expected.top, `top mismatch ${from} -> ${to}`);
            assert.equal(resolvedAfter.w, expected.w, `w mismatch ${from} -> ${to}`);
            assert.equal(resolvedAfter.h, expected.h, `h mismatch ${from} -> ${to}`);
        }
    }
});

test('GameHUD _resolveElementPosition matches UIRenderer.resolveRect across all 9 anchors and cleanly replaces overlay layers', () => {
    withBrowserStubs((dom) => {
        const { GameHUD } = require('../engines/shared/GameHUD.js');
        const hud = new GameHUD();
        hud.init(dom.body);

        for (const res of [{ w: 800, h: 450 }, { w: 1280, h: 720 }]) {
            hud.baseWidth = res.w;
            hud.baseHeight = res.h;
            for (const anchor of ALL_ANCHORS) {
                const rect = { x: 16, y: 12, w: 180, h: 36 };
                const hudPos = hud._resolveElementPosition(rect, anchor);
                const uiPos = UIRenderer.resolveRect(rect, anchor, res);
                assert.equal(hudPos.left, uiPos.left, `${res.w}x${res.h} ${anchor} left mismatch`);
                assert.equal(hudPos.top, uiPos.top, `${res.w}x${res.h} ${anchor} top mismatch`);
                assert.equal(hudPos.w, uiPos.w);
                assert.equal(hudPos.h, uiPos.h);
            }
        }

        // Overlay stack replacement check: main_hud persists, switching pause_menu -> inventory never stacks pause widgets
        const kit = UITemplates.buildKitDocument('redglitch_ops');
        hud.load(kit);
        hud.showScreen('main_hud');
        assert.ok(hud.elements.hud_hp_bar, 'main_hud HP bar should mount');

        hud.showScreen('pause_menu');
        assert.ok(hud.elements.hud_hp_bar, 'pause_menu overlay keeps main_hud underlay visible');
        assert.ok(hud.elements.pause_resume, 'pause_menu mounts pause_resume');
        assert.equal(hud.elements.pause_resume.dom.dataset.hudOverlay, '1');

        hud.showScreen('inventory');
        assert.ok(hud.elements.hud_hp_bar, 'inventory overlay preserves main_hud underlay');
        assert.ok(hud.elements.inv_panel, 'inventory mounts inv_panel');
        assert.equal(hud.elements.pause_resume, undefined, 'switching overlay cleanly removes prior overlay widgets');
    });
});

test('All UITemplates INTERFACE_KITS (800x450 & 1280x720) and SCREEN_PRESETS pass layout audit with zero overlaps/OOB', () => {
    assert.ok(UITemplates.INTERFACE_KITS.length >= 15, `Expected >= 15 UI Kits, found ${UITemplates.INTERFACE_KITS.length}`);
    assert.ok(UITemplates.SCREEN_PRESETS.length >= 15, `Expected >= 15 Screen Presets, found ${UITemplates.SCREEN_PRESETS.length}`);

    for (const kit of UITemplates.INTERFACE_KITS) {
        for (const res of [{ w: 800, h: 450 }, { w: 1280, h: 720 }]) {
            const doc = kit.build(res);
            assert.equal(doc.format, 'redglitch-ui');
            assert.equal(doc.designSystem?.typography?.fontFamily, 'VT323, monospace');
            for (const [sid, screen] of Object.entries(doc.screens)) {
                const audit = UITemplates.validateScreenLayout(screen, res);
                assert.deepEqual(audit.outOfBounds, [], `${kit.id} ${res.w}x${res.h} ${sid} OOB`);
                assert.deepEqual(audit.overlaps, [], `${kit.id} ${res.w}x${res.h} ${sid} overlaps`);
            }

            // Every overlay screen (background: true) must stack strictly above main_hud so HUD widgets never clip over modals
            const maxHudZ = Math.max(...doc.screens.main_hud.elements.map(e => Number(e.style?.zIndex || 0)));
            for (const [sid, screen] of Object.entries(doc.screens)) {
                if (screen.background !== true) continue;
                const minOverlayZ = Math.min(...screen.elements.map(e => Number(e.style?.zIndex || 0)));
                assert.ok(minOverlayZ > maxHudZ, `${kit.id} [${sid}] min zIndex (${minOverlayZ}) must exceed main_hud max (${maxHudZ})`);
            }

            // Dialogue overlay sits cleanly above the HUD hotbar even when composited together
            const composedDialogue = {
                elements: [...doc.screens.main_hud.elements, ...doc.screens.dialogue_box.elements]
            };
            const dlgAudit = UITemplates.validateScreenLayout(composedDialogue, res);
            assert.deepEqual(dlgAudit.overlaps, [], `${kit.id} ${res.w}x${res.h} dialogue + main_hud overlap`);
        }
    }

    for (const preset of UITemplates.SCREEN_PRESETS) {
        for (const res of [{ w: 800, h: 450 }, { w: 1280, h: 720 }]) {
            const screen = preset.build('minimal_modern', res);
            const audit = UITemplates.validateScreenLayout(screen, res);
            assert.deepEqual(audit.outOfBounds, [], `Preset ${preset.id} ${res.w}x${res.h} OOB`);
            assert.deepEqual(audit.overlaps, [], `Preset ${preset.id} ${res.w}x${res.h} overlaps`);
        }
    }
});

test('Disk main.redui and ui.json configs have zero layout errors and preserve required engine hooks', () => {
    const reduiPaths = [
        path.join(ROOT, 'public/interfaces/main.redui'),
        path.join(ROOT, 'projects/Default Project/interfaces/main.redui')
    ];

    for (const filePath of reduiPaths) {
        const cfg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const res = cfg.resolution || { w: 800, h: 450 };
        for (const [sid, screen] of Object.entries(cfg.screens || {})) {
            const audit = UITemplates.validateScreenLayout(screen, res);
            assert.deepEqual(audit.outOfBounds, [], `${filePath} [${sid}] OOB`);
            assert.deepEqual(audit.overlaps, [], `${filePath} [${sid}] overlaps`);
        }

        const hudIds = new Set((cfg.screens.main_hud?.elements || []).map(e => e.id));
        for (let i = 1; i <= 8; i++) assert.ok(hudIds.has(`inv_${i}`), `${filePath} missing inv_${i}`);
        for (const reqId of ['hud_hp_bar', 'hud_mp_bar', 'hud_st_bar', 'hud_time']) {
            assert.ok(hudIds.has(reqId), `${filePath} missing ${reqId}`);
        }
        assert.equal(cfg.screens.pause_menu?.background, true);
        assert.equal(cfg.screens.inventory?.background, true);
        assert.equal(cfg.screens.dialogue_box?.background, true);
        assert.ok(cfg.screens.ui_kit_palette, `${filePath} missing ui_kit_palette`);
    }

    const uiJsonPaths = [
        path.join(ROOT, 'public/dunyalar/definitions/ui.json'),
        path.join(ROOT, 'projects/Default Project/dunyalar/definitions/ui.json')
    ];
    for (const filePath of uiJsonPaths) {
        const cfg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const res = cfg.resolution || { w: 800, h: 450 };
        for (const [sid, screen] of Object.entries(cfg.screens || {})) {
            const audit = UITemplates.validateScreenLayout(screen, res);
            assert.deepEqual(audit.outOfBounds, [], `${filePath} [${sid}] OOB`);
            assert.deepEqual(audit.overlaps, [], `${filePath} [${sid}] overlaps`);
        }

        const idsFor = (sid) => new Set((cfg.screens[sid]?.elements || []).map(e => e.id));
        assert.ok(idsFor('main_menu').has('btn_new'));
        assert.ok(idsFor('main_menu').has('btn_load'));
        assert.ok(idsFor('pause_menu').has('btn_resume'));
        assert.ok(idsFor('pause_menu').has('btn_quit'));
        assert.ok(idsFor('achievements_screen').has('achievements_container'));
        if (filePath.includes(`${path.sep}public${path.sep}`)) {
            assert.ok(idsFor('main_menu').has('btn_campaign'));
            assert.ok(idsFor('pause_menu').has('btn_campaign_map'));
            assert.ok(idsFor('pause_menu').has('btn_quit_normal'));
        }
        assert.ok(idsFor('skill_selector').has('skill_container'));
        assert.ok(idsFor('inventory').has('inv_grid'));
        for (const reqId of ['hp_bar', 'stamina_bar', 'mana_bar', 'clock']) {
            assert.ok(idsFor('hud').has(reqId), `${filePath} [hud] missing ${reqId}`);
        }
    }

    const badAudit = UITemplates.validateScreenLayout({
        elements: [
            { id: 'a', type: 'button', rect: { x: 20, y: 20, w: 120, h: 40 }, anchor: 'top-left' },
            { id: 'b', type: 'button', rect: { x: 80, y: 30, w: 120, h: 40 }, anchor: 'top-left' },
            { id: 'c', type: 'label', rect: { x: 750, y: 10, w: 100, h: 20 }, anchor: 'top-left' }
        ]
    }, { w: 800, h: 450 });
    assert.equal(badAudit.ok, false);
    assert.equal(badAudit.overlaps.length, 1);
    assert.equal(badAudit.outOfBounds.length, 1);
});
