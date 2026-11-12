// menu_editor.js — UI STUDIO 3.0
// Complete WYSIWYG Game UI Editor Engine
const _escapeHtml = window.escapeHtml || function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

// ═══════════════════════════════════════════
// Integration bootstrap
// ═══════════════════════════════════════════
let eventBus, projectState, assetManager;
function initUIStudioIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedglitchEventBus;
        projectState = window.RedglitchProjectState;
        assetManager = window.RedglitchAssetManager;
        if (eventBus) {
            eventBus.on('ui:request', (e) => console.log('[UIStudio] UI requested:', e.data));
            console.log('[UIStudio] EventBus connected');
        }
    }
}
function broadcastUIUpdate(action = 'updated') {
    if (eventBus) eventBus.emit(`ui:${action}`, { timestamp: Date.now() });
    if (projectState) projectState.set('ui.lastModified', Date.now());
}

// ═══════════════════════════════════════════
// Element type icons
// ═══════════════════════════════════════════
const TYPE_ICONS = {
    panel: 'far fa-square',
    label: 'fas fa-font',
    button: 'fas fa-mouse-pointer',
    image: 'far fa-image',
    bar: 'fas fa-battery-half',
    slot: 'fas fa-box'
};

// ═══════════════════════════════════════════
// Default element templates
// ═══════════════════════════════════════════
const ELEMENT_DEFAULTS = {
    panel: {
        anchor: 'top-left',
        rect: { x: 40, y: 40, w: 280, h: 180 },
        style: {
            backgroundColor: 'rgba(13, 18, 30, 0.90)',
            borderColor: '#000000',
            borderWidth: 2,
            borderRadius: 0,
            boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.08), 3px 3px 0 rgba(0,0,0,0.6)',
            color: '#f4f7ff',
            fontSize: 14,
            textAlign: 'left',
            zIndex: 10
        },
        props: {}
    },
    label: {
        anchor: 'top-left',
        text: 'TEXT LABEL',
        rect: { x: 40, y: 40, w: 200, h: 28 },
        style: {
            backgroundColor: 'transparent',
            color: '#ffd36a',
            fontSize: 18,
            fontWeight: '700',
            textAlign: 'left',
            borderWidth: 0,
            borderColor: 'transparent',
            textShadow: '2px 2px 0 #000',
            zIndex: 12
        },
        props: {}
    },
    button: {
        anchor: 'top-left',
        text: 'BUTTON',
        rect: { x: 40, y: 40, w: 180, h: 38 },
        style: {
            backgroundColor: 'rgba(10, 14, 24, 0.9)',
            color: '#62ff9a',
            borderWidth: 2,
            borderColor: '#62ff9a',
            borderRadius: 0,
            fontSize: 15,
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: '700',
            zIndex: 12
        },
        script: '',
        props: {}
    },
    image: {
        anchor: 'top-left',
        src: '',
        rect: { x: 40, y: 40, w: 120, h: 120 },
        style: { backgroundColor: 'transparent', color: '#fff', fontSize: 14, borderWidth: 0, borderColor: 'transparent', textAlign: 'left', zIndex: 12 },
        props: {}
    },
    bar: {
        anchor: 'top-left',
        text: 'HP {player.hp}/{player.maxHp}',
        rect: { x: 40, y: 40, w: 220, h: 20 },
        style: { backgroundColor: '#0b0d14', borderWidth: 2, borderColor: '#000000', color: '#ffffff', fontSize: 11, fontWeight: '700', textAlign: 'center', zIndex: 12 },
        props: { fillColor: '#e23b4e', variable: 'player.hp', maxVariable: 'player.maxHp', ticks: 10 }
    },
    slot: {
        anchor: 'top-left',
        text: '1',
        rect: { x: 40, y: 40, w: 44, h: 44 },
        style: { backgroundColor: 'rgba(10, 14, 24, 0.9)', borderWidth: 2, borderColor: '#ffd36a', color: '#ffd36a', fontSize: 14, fontWeight: '700', textAlign: 'center', zIndex: 12 },
        props: { variable: 'player.inventory.0' }
    }
};

class UIStudio {
    constructor() {
        // ── Data ──
        this.data = { screens: {} };
        this.interfaceFileName = 'main.redui';
        this.interfacePath = 'interfaces/main.redui';
        this.activeScreen = null;
        this.dirty = false;
        this._savePromise = null;
        this.knownActions = []; // populated from /api/ui-config/actions
        this.screenMapVisible = false;

        // ── Selection ──
        this.selection = [];        // array of IDs (multi-select)
        this.inspectorTab = 'props';

        // ── View ──
        this.scale = 1.0;
        this.panOffset = { x: 0, y: 0 };
        this.resolution = { w: 800, h: 450 };
        this.gridEnabled = false;
        this.snapping = true;
        this.snapSize = 10;

        // ── Tools ──
        this.activeTool = 'pointer';

        // ── Drag state ──
        this.dragState = null;   // { mode, ids, startX, startY, initials, handleDir }
        this.marquee = null;     // { startX, startY, el }

        // ── Undo/Redo ──
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndo = 50;

        // ── Layout ──
        this.layoutState = { leftPanel: 'expanded', rightPanel: 'expanded' };

        // ── DOM refs ──
        this.dom = {
            screenSelect: document.getElementById('screen-selector'),
            fileStatus: document.getElementById('interface-file-status'),
            hierarchy: document.getElementById('hierarchy-list'),
            artboard: document.getElementById('artboard'),
            artboardLabel: document.getElementById('artboard-label'),
            canvasArea: document.getElementById('canvas-area'),
            inspector: document.getElementById('inspector'),
            inspectorTabs: document.getElementById('inspector-tabs'),
            zoomIndicator: document.getElementById('zoom-indicator'),
            zoomMenu: document.getElementById('zoom-menu'),
            searchOverlay: document.getElementById('quick-search-overlay'),
            searchInput: document.getElementById('search-input'),
            searchResults: document.getElementById('search-results')
        };

        this.init();
    }

    // ═══════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════
    init() {
        initUIStudioIntegration();

        const saved = localStorage.getItem('ui_studio_layout');
        if (saved) try { this.layoutState = { ...this.layoutState, ...JSON.parse(saved) }; } catch(e) {}
        this.applyLayoutState();

        this._userZoomed = false;
        this._templateTab = 'kits';

        this.loadData();
        this.setupInput();
        this.setupDragDrop();
        this.setupKeyboard();

        if (typeof ResizeObserver !== 'undefined' && this.dom.canvasArea) {
            this._canvasResizeObserver = new ResizeObserver(() => {
                if (!this._userZoomed) this.fitToScreen(false);
            });
            this._canvasResizeObserver.observe(this.dom.canvasArea);
        }

        console.log('[UIStudio] v3.1 Ready');
    }

    // ═══════════════════════════════════════
    // DATA — Load / Save
    // ═══════════════════════════════════════
    async loadData() {
        let loaded = false;

        // Try the project interface document first.
        try {
            const res = await fetch(`/api/ui-config?file=${encodeURIComponent(this.interfaceFileName)}`);
            if (res.ok) {
                const json = await res.json();
                if (json && json.screens && Object.keys(json.screens).length > 0) {
                    this.interfaceFileName = json.fileName || this.interfaceFileName;
                    this.interfacePath = json.path || `interfaces/${this.interfaceFileName}`;
                    delete json.fileName;
                    delete json.path;
                    delete json.migratedFrom;
                    this.data = json;
                    loaded = true;
                }
            }
        } catch (e) {}

        // Fallback for projects opened statically without the API.
        if (!loaded) {
            try {
                const res = await fetch(`/interfaces/${this.interfaceFileName}`);
                if (res.ok) {
                    const json = await res.json();
                    if (json && json.screens && Object.keys(json.screens).length > 0) {
                        this.data = json;
                        loaded = true;
                    }
                }
            } catch (e) { console.warn('[UIStudio] Static fallback also failed'); }
        }

        // Also fetch known engine actions for the action editor
        try {
            const res = await fetch('/api/ui-config/actions');
            if (res.ok) {
                const actions = await res.json();
                this.knownActions = actions.map(action => {
                    if (typeof action === 'string') {
                        return { id: action, label: action.replace(/_/g, ' '), category: 'engine' };
                    }
                    return {
                        id: action.id,
                        label: action.label || action.id,
                        category: action.category || 'engine'
                    };
                }).filter(action => action.id);
            }
        } catch (e) { this.knownActions = []; }

        if (Object.keys(this.data.screens).length === 0) {
            this.data.screens['main_hud'] = { elements: [] };
        }
        if (this.data.resolution && this.data.resolution.w && this.data.resolution.h) {
            this.resolution = { w: Number(this.data.resolution.w), h: Number(this.data.resolution.h) };
        }
        const resSel = document.getElementById('resolution-selector');
        if (resSel) {
            const key = `${this.resolution.w}x${this.resolution.h}`;
            if (Array.from(resSel.options).some(o => o.value === key)) resSel.value = key;
        }
        this.upgradeLegacyButtonStyles();

        this.updateScreenList();
        const first = Object.keys(this.data.screens)[0];
        this.switchScreen(first);
        this.fitToScreen(false);
        this.updateFileStatus();
        this.showLoadFeedback();
    }

    upgradeLegacyButtonStyles() {
        const defaultButton = ELEMENT_DEFAULTS.button.style;
        Object.values(this.data.screens || {}).forEach(screen => {
            (screen.elements || []).forEach(element => {
                if (element.type !== 'button' || !element.style) return;
                const style = element.style;
                const usesLegacyButtonStyle =
                    style.backgroundColor === '#333' &&
                    style.borderColor === '#fff' &&
                    Number(style.borderWidth) === 2 &&
                    (style.color === '#ff0000' || style.color === '#fff');
                if (!usesLegacyButtonStyle) return;
                element.rect = element.rect || {};
                element.rect.h = Math.max(element.rect.h || 0, ELEMENT_DEFAULTS.button.rect.h);
                element.style = { ...style, ...defaultButton };
            });
        });
    }

    async reloadFromDisk() {
        if (this.dirty && !confirm('You have unsaved changes. Reload anyway?')) return;
        this.data = { screens: {} };
        this.dirty = false;
        this.undoStack = [];
        this.redoStack = [];
        await this.loadData();
    }

    showLoadFeedback() {
        const screenCount = Object.keys(this.data.screens).length;
        const totalElements = Object.values(this.data.screens).reduce((s, sc) => s + (sc.elements?.length || 0), 0);
        const el = document.createElement('div');
        el.className = 'save-indicator';
        el.style.background = '#1a1a2e';
        el.innerHTML = `<i class="fas fa-download"></i> LOADED ${screenCount} screens, ${totalElements} elements`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    async save() {
        if (this._savePromise) return this._savePromise;
        this._savePromise = (async () => {
            this.pushUndo();
            try {
                const payload = {
                    ...this.data,
                    name: this.data.name || 'Main Interface',
                    format: 'redglitch-ui',
                    formatVersion: 1,
                    resolution: this.resolution
                };
                const res = await fetch(`/api/ui-config?file=${encodeURIComponent(this.interfaceFileName)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    const result = await res.json();
                    this.interfaceFileName = result.fileName || this.interfaceFileName;
                    this.interfacePath = result.path || this.interfacePath;
                    this.dirty = false;
                    this.updateFileStatus();
                    this.showSaveIndicator();
                    broadcastUIUpdate('saved');
                } else {
                    alert('SAVE FAILED');
                }
            } catch (e) { alert('NETWORK ERROR'); }
        })();
        try {
            return await this._savePromise;
        } finally {
            this._savePromise = null;
        }
    }

    exit() {
        if (this.dirty && !confirm('You have unsaved changes. Close anyway?')) return;
        if (window.parent && typeof window.parent.closeWindow === 'function') {
            window.parent.closeWindow('win-menu');
        } else {
            window.close();
        }
    }

    exportJSON() {
        const document = {
            ...this.data,
            name: this.data.name || 'Main Interface',
            format: 'redglitch-ui',
            formatVersion: 1,
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = this.interfaceFileName;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    showSaveIndicator() {
        const el = document.createElement('div');
        el.className = 'save-indicator';
        el.innerHTML = `<i class="fas fa-check"></i> SAVED ${this.interfaceFileName}`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2500);
    }

    markDirty() {
        this.dirty = true;
        this.updateFileStatus();
    }

    updateFileStatus() {
        if (this.dom.fileStatus) {
            this.dom.fileStatus.textContent = `${this.dirty ? '*' : ''}${this.interfacePath}`;
        }
        const statusFile = document.getElementById('status-file');
        if (statusFile) {
            statusFile.textContent = `${this.dirty ? 'Unsaved' : 'Saved'}: ${this.interfaceFileName}`;
        }
    }

    // ═══════════════════════════════════════
    // UNDO / REDO
    // ═══════════════════════════════════════
    pushUndo() {
        const snap = JSON.stringify(this.data);
        if (typeof snap !== 'string') return;
        this.undoStack.push(snap);
        if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(JSON.stringify(this.data));
        try {
            this.data = JSON.parse(this.undoStack.pop());
        } catch (e) {
            console.error('[MenuEditor] Undo failed:', e);
            this.redoStack.pop();
            return;
        }
        this.selection = [];
        this.updateScreenList();
        if (this.activeScreen && this.data.screens[this.activeScreen]) {
            this.render();
        } else {
            const k = Object.keys(this.data.screens);
            if (k.length) this.switchScreen(k[0]); else { this.activeScreen = null; this.render(); }
        }
    }

    redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push(JSON.stringify(this.data));
        try {
            this.data = JSON.parse(this.redoStack.pop());
        } catch (e) {
            console.error('[MenuEditor] Redo failed:', e);
            this.undoStack.pop();
            return;
        }
        this.selection = [];
        this.updateScreenList();
        if (this.activeScreen && this.data.screens[this.activeScreen]) {
            this.render();
        } else {
            const k = Object.keys(this.data.screens);
            if (k.length) this.switchScreen(k[0]); else { this.activeScreen = null; this.render(); }
        }
    }

    // ═══════════════════════════════════════
    // SCREEN SYSTEM
    // ═══════════════════════════════════════
    updateScreenList() {
        const sel = this.dom.screenSelect;
        sel.innerHTML = '';
        Object.keys(this.data.screens).forEach(id => {
            const count = this.data.screens[id].elements?.length || 0;
            const opt = document.createElement('option');
            opt.value = id; opt.textContent = `${id} (${count})`;
            if (id === this.activeScreen) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    switchScreen(id) {
        if (!this.data.screens[id]) return;
        this.activeScreen = id;
        this.selection = [];
        this.dom.screenSelect.value = id;
        this.render();
        this.updateStatusBar();
    }

    addScreen() {
        const name = prompt("New Screen ID (e.g., 'shop_menu'):");
        if (!name || this.data.screens[name]) return;
        this.pushUndo();
        this.data.screens[name] = { elements: [] };
        this.updateScreenList();
        this.switchScreen(name);
        this.markDirty();
    }

    duplicateScreen() {
        if (!this.activeScreen) return;
        const name = prompt("Duplicate name:", this.activeScreen + '_copy');
        if (!name || this.data.screens[name]) return;
        this.pushUndo();
        this.data.screens[name] = JSON.parse(JSON.stringify(this.data.screens[this.activeScreen]));
        this.updateScreenList();
        this.switchScreen(name);
        this.markDirty();
    }

    deleteScreen() {
        if (!this.activeScreen) return;
        if (!confirm(`Delete screen '${this.activeScreen}'?`)) return;
        this.pushUndo();
        delete this.data.screens[this.activeScreen];
        this.updateScreenList();
        const ids = Object.keys(this.data.screens);
        if (ids.length > 0) this.switchScreen(ids[0]);
        else { this.activeScreen = null; this.render(); }
        this.markDirty();
    }

    getElements() {
        if (!this.activeScreen || !this.data.screens[this.activeScreen]) return [];
        return this.data.screens[this.activeScreen].elements;
    }

    getElement(id) {
        return this.getElements().find(e => e.id === id);
    }

    // ═══════════════════════════════════════
    // RENDER — Master
    // ═══════════════════════════════════════
    render() {
        this.renderCanvas();
        this.renderHierarchy();
        this.renderInspector();
        this.updateStatusBar();
    }

    // ═══════════════════════════════════════
    // RENDER — Canvas (Artboard)
    // ═══════════════════════════════════════
    renderCanvas() {
        const ab = this.dom.artboard;
        // Remove old element wrappers, keep artboard label
        ab.querySelectorAll('.ui-el').forEach(e => e.remove());
        ab.querySelectorAll('.snap-guide').forEach(e => e.remove());

        // Apply resolution + zoom + pan
        ab.style.width = this.resolution.w + 'px';
        ab.style.height = this.resolution.h + 'px';
        this.applyArtboardTransform();
        this.dom.artboardLabel.textContent = `${this.resolution.w} × ${this.resolution.h}`;

        // Grid overlay
        if (this.gridEnabled) {
            const gs = this.snapSize;
            ab.style.backgroundImage =
                `linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)`;
            ab.style.backgroundSize = `${gs}px ${gs}px`;
        } else {
            ab.style.backgroundImage = 'none';
        }

        const elements = this.getElements();
        elements.forEach(elData => {
            const wrapper = this.createElementDOM(elData);
            ab.appendChild(wrapper);
        });
    }

    _resolveElementRect(data) {
        const r = data?.rect || { x: 0, y: 0, w: 100, h: 40 };
        if (window.UIRenderer && typeof window.UIRenderer.resolveRect === 'function') {
            return window.UIRenderer.resolveRect(r, data.anchor || 'top-left', this.resolution);
        }
        return { x: r.x || 0, y: r.y || 0, w: r.w || 100, h: r.h || 40, left: r.x || 0, top: r.y || 0 };
    }

    _screenToAnchor(left, top, w, h, anchor) {
        if (window.UIRenderer && typeof window.UIRenderer.screenToAnchorRect === 'function') {
            return window.UIRenderer.screenToAnchorRect(left, top, w, h, anchor || 'top-left', this.resolution);
        }
        return { x: Math.round(left), y: Math.round(top), w: Math.round(w), h: Math.round(h) };
    }

    createElementDOM(data) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ui-el';
        wrapper.dataset.id = data.id;

        const pos = this._resolveElementRect(data);
        wrapper.style.left = pos.left + 'px';
        wrapper.style.top = pos.top + 'px';
        wrapper.style.width = pos.w + 'px';
        wrapper.style.height = pos.h + 'px';

        if (data.style && data.style.zIndex !== undefined) wrapper.style.zIndex = data.style.zIndex;

        // Selection state
        if (this.selection.includes(data.id)) {
            wrapper.classList.add(this.selection.length > 1 ? 'multi-selected' : 'selected');
        }

        // Inner preview
        let inner = null;
        const s = data.style || {};

        if (data.type === 'button') {
            inner = document.createElement('div');
            inner.className = 'preview-btn';
            inner.textContent = data.text || 'BTN';
            inner.style.display = 'flex';
            inner.style.alignItems = 'center';
            inner.style.justifyContent = s.textAlign === 'left' ? 'flex-start' : s.textAlign === 'right' ? 'flex-end' : 'center';
            inner.style.boxSizing = 'border-box';
            this._applyPreviewStyle(inner, s);

            // Navigate indicator badge
            if (data.script && data.script.startsWith('navigate:')) {
                const target = data.script.substring(9);
                if (target) {
                    const badge = document.createElement('div');
                    badge.className = 'navigate-badge';
                    badge.innerHTML = `<i class="fas fa-link"></i> ${_escapeHtml(target)}`;
                    wrapper.appendChild(badge);
                }
            }
        } else if (data.type === 'label') {
            inner = document.createElement('div');
            inner.className = 'preview-label';
            inner.style.display = 'flex';
            inner.style.alignItems = 'center';
            inner.style.justifyContent = s.textAlign === 'center' ? 'center' : s.textAlign === 'right' ? 'flex-end' : 'flex-start';
            inner.style.whiteSpace = 'pre-wrap';
            inner.style.lineHeight = '1.2';
            inner.style.boxSizing = 'border-box';
            let text = data.text || 'LABEL';
            // Highlight data bindings
            inner.innerHTML = _escapeHtml(text).replace(/\{([^}]+)\}/g, '<span style="color:#49e3ff;text-decoration:underline;">{$1}</span>');
            this._applyPreviewStyle(inner, s);
        } else if (data.type === 'panel') {
            inner = document.createElement('div');
            inner.className = 'preview-panel';
            inner.style.boxSizing = 'border-box';
            this._applyPreviewStyle(inner, s);
        } else if (data.type === 'image') {
            inner = document.createElement('div');
            inner.style.boxSizing = 'border-box';
            if (data.src) {
                inner.className = 'preview-image';
                inner.style.backgroundImage = `url('${data.src}')`;
            } else {
                inner.className = 'preview-image empty';
            }
            this._applyPreviewStyle(inner, s);
        } else if (data.type === 'bar') {
            inner = document.createElement('div');
            inner.className = 'preview-bar';
            inner.style.overflow = 'hidden';
            inner.style.boxSizing = 'border-box';
            inner.style.background = '#0b0d14';
            inner.style.border = '2px solid #000';
            this._applyPreviewStyle(inner, s);

            const fill = document.createElement('div');
            fill.className = 'preview-bar-fill';
            fill.style.background = (data.props && data.props.fillColor) || '#e23b4e';
            fill.style.width = '68%';
            fill.style.boxShadow = 'inset 0 2px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.25)';
            inner.appendChild(fill);

            if (data.props && Number(data.props.ticks) > 0) {
                const n = Number(data.props.ticks);
                const step = 100 / n;
                const tk = document.createElement('div');
                tk.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:1;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(${step}% - 2px),rgba(0,0,0,0.45) calc(${step}% - 2px),rgba(0,0,0,0.45) ${step}%)`;
                inner.appendChild(tk);
            }

            const label = document.createElement('div');
            label.className = 'preview-bar-label';
            label.textContent = data.text || 'BAR';
            label.style.zIndex = '2';
            const barFs = s.fontSize ? Number(s.fontSize) : Math.max(10, Math.min(13, pos.h - 4));
            label.style.fontSize = barFs + 'px';
            label.style.color = s.color || '#ffffff';
            label.style.fontWeight = s.fontWeight || (barFs <= 14 ? '400' : '700');
            label.style.textShadow = s.textShadow || '1px 1px 0 #000';
            inner.appendChild(label);
        } else if (data.type === 'slot') {
            inner = document.createElement('div');
            inner.className = 'preview-slot';
            inner.style.width = '100%';
            inner.style.height = '100%';
            inner.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.52))';
            inner.style.border = '2px solid rgba(255,211,106,0.55)';
            inner.style.color = '#ffd36a';
            inner.style.fontFamily = "'VT323', monospace";
            inner.style.fontWeight = '400';
            inner.style.boxSizing = 'border-box';
            this._applyPreviewStyle(inner, s);
            inner.style.display = 'flex';
            inner.style.alignItems = 'center';
            inner.style.justifyContent = 'center';
            if (data.props?.selected) {
                inner.style.boxShadow = 'inset 0 0 0 1px #fff, 0 0 0 1px #fff';
            }

            const keyCap = document.createElement('span');
            keyCap.textContent = data.text || '';
            const capSize = Math.max(10, Number(s.fontSize || 11));
            keyCap.style.cssText = `position:absolute;top:2px;left:4px;font-size:${capSize}px;line-height:1;font-weight:${s.fontWeight || '400'};opacity:0.95;text-shadow:1px 1px 0 #000;`;
            inner.appendChild(keyCap);
        }

        if (inner) {
            inner.style.pointerEvents = 'none';
            wrapper.appendChild(inner);
        }

        // Resize handles (8-directional)
        ['tl','tc','tr','ml','mr','bl','bc','br'].forEach(dir => {
            const h = document.createElement('div');
            h.className = `resize-handle rh-${dir}`;
            h.dataset.dir = dir;
            wrapper.appendChild(h);
        });

        // Mouse interaction
        wrapper.addEventListener('mousedown', (e) => this.onElementDown(e, data));

        return wrapper;
    }

    _applyPreviewStyle(el, s) {
        if (!s) return;
        if (s.color) el.style.color = s.color;
        if (s.backgroundColor) el.style.background = s.backgroundColor;
        if (s.backgroundImage) el.style.backgroundImage = s.backgroundImage;
        if (s.fontSize) el.style.fontSize = s.fontSize + 'px';
        if (s.borderWidth !== undefined) {
            const bw = Number(s.borderWidth) || 0;
            el.style.borderWidth = bw + 'px';
            el.style.borderStyle = bw > 0 ? (s.borderStyle || 'solid') : 'none';
        }
        if (s.borderColor) {
            el.style.borderColor = s.borderColor;
            if (!el.style.borderStyle && Number(s.borderWidth) > 0) el.style.borderStyle = s.borderStyle || 'solid';
        }
        if (s.textAlign) el.style.textAlign = s.textAlign;
        if (s.borderRadius !== undefined) el.style.borderRadius = s.borderRadius + 'px';
        if (s.boxShadow) el.style.boxShadow = s.boxShadow;
        if (s.textShadow) el.style.textShadow = s.textShadow;
        if (s.textTransform) el.style.textTransform = s.textTransform;
        if (s.letterSpacing !== undefined) el.style.letterSpacing = typeof s.letterSpacing === 'number' ? s.letterSpacing + 'px' : s.letterSpacing;
        if (s.fontWeight) el.style.fontWeight = s.fontWeight;
        if (s.opacity !== undefined) el.style.opacity = String(s.opacity);
        if (s.padding !== undefined) el.style.padding = typeof s.padding === 'number' ? `${s.padding}px` : s.padding;
        if (s.lineHeight) el.style.lineHeight = typeof s.lineHeight === 'number' ? `${s.lineHeight}px` : s.lineHeight;
    }

    // ═══════════════════════════════════════
    // RENDER — Hierarchy
    // ═══════════════════════════════════════
    renderHierarchy() {
        const list = this.dom.hierarchy;
        list.innerHTML = '';
        const elements = this.getElements();

        if (elements.length === 0) {
            list.innerHTML = '<div style="padding:15px; text-align:center; color:#555; font-size:0.85rem;">NO ELEMENTS</div>';
            return;
        }

        elements.forEach((el, idx) => {
            const node = document.createElement('div');
            node.className = 'tree-node';
            if (this.selection.includes(el.id)) node.classList.add('selected');

            const icon = TYPE_ICONS[el.type] || 'fas fa-cube';
            node.innerHTML = `<i class="${_escapeHtml(icon)}"></i> ${_escapeHtml(el.id)} <span class="tree-type">${_escapeHtml(el.type)}</span>`;

            node.addEventListener('click', (e) => {
                if (e.shiftKey) {
                    this.toggleSelection(el.id);
                } else {
                    this.select(el.id);
                }
            });

            list.appendChild(node);
        });
    }

    // ═══════════════════════════════════════
    // RENDER — Inspector
    // ═══════════════════════════════════════
    renderInspector() {
        const container = this.dom.inspector;
        container.innerHTML = '';

        // Update tab styling
        this.dom.inspectorTabs.querySelectorAll('.inspector-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === this.inspectorTab);
        });

        if (this.selection.length === 0) {
            this._renderScreenProps(container);
            return;
        }

        // Multi-selection: show count
        if (this.selection.length > 1) {
            container.innerHTML = `<div class="inspector-empty"><i class="fas fa-layer-group"></i><div>${this.selection.length} ELEMENTS SELECTED</div></div>`;
            // Could add bulk edit here in future
            return;
        }

        const el = this.getElement(this.selection[0]);
        if (!el) return;

        if (this.inspectorTab === 'props') this._renderPropsTab(container, el);
        else if (this.inspectorTab === 'style') this._renderStyleTab(container, el);
        else if (this.inspectorTab === 'events') this._renderEventsTab(container, el);

        // Delete button
        const footer = document.createElement('div');
        footer.style.padding = '12px';
        const delBtn = document.createElement('button');
        delBtn.className = 'editor-btn danger';
        delBtn.textContent = 'DELETE ELEMENT';
        delBtn.onclick = () => this.deleteSelected();
        footer.appendChild(delBtn);
        container.appendChild(footer);
    }

    _renderScreenProps(container) {
        if (!this.activeScreen || !this.data.screens[this.activeScreen]) {
            container.innerHTML = '<div class="inspector-empty"><i class="fas fa-desktop"></i><div>SELECT A SCREEN</div></div>';
            return;
        }
        const screen = this.data.screens[this.activeScreen];

        const gProps = this._addGroup(container, 'SCREEN PROPERTIES');
        this._addProp(gProps, 'NAME', this.activeScreen, 'text', null);

        // Overlay (keep HUD visible behind) toggle
        const bgRow = document.createElement('div'); bgRow.className = 'prop-row';
        const bgLbl = document.createElement('span'); bgLbl.className = 'prop-label'; bgLbl.textContent = 'OVERLAY MODE';
        const bgSelect = document.createElement('select'); bgSelect.className = 'prop-input';
        bgSelect.innerHTML = `
            <option value="false"${!screen.background ? ' selected' : ''}>Standalone Screen</option>
            <option value="true"${screen.background === true ? ' selected' : ''}>Overlay (Keep HUD)</option>
        `;
        bgSelect.onchange = () => {
            screen.background = (bgSelect.value === 'true');
            this.markDirty();
        };
        bgRow.appendChild(bgLbl);
        bgRow.appendChild(bgSelect);
        gProps.appendChild(bgRow);

        // Templates quick action
        const tplGroup = this._addGroup(container, 'TEMPLATES & LAYOUT');
        const tplBtn = document.createElement('button');
        tplBtn.className = 'editor-btn';
        tplBtn.innerHTML = '<i class="fas fa-swatchbook"></i> APPLY SCREEN TEMPLATE...';
        tplBtn.onclick = () => this.openTemplatesModal('screens');
        tplGroup.appendChild(tplBtn);

        // Layout validation audit
        if (window.RedglitchUITemplates && typeof window.RedglitchUITemplates.validateScreenLayout === 'function') {
            const audit = window.RedglitchUITemplates.validateScreenLayout(screen, this.resolution);
            const gAudit = this._addGroup(container, 'LAYOUT CHECK');
            const badge = document.createElement('div');
            badge.style.cssText = `padding:8px;border-radius:4px;font-size:11px;line-height:1.45;border:1px solid ${audit.ok ? 'rgba(46,204,113,0.4)' : 'rgba(255,49,71,0.45)'};background:${audit.ok ? 'rgba(46,204,113,0.08)' : 'rgba(255,49,71,0.1)'};color:${audit.ok ? '#86efac' : '#fda4af'};`;
            if (audit.ok) {
                badge.innerHTML = `<i class="fas fa-check-circle"></i> Layout temiz — taşma veya çakışma yok (${(screen.elements || []).length} öğe).`;
            } else {
                const issues = [
                    ...audit.overlaps.slice(0, 3).map(o => `• Çakışma: ${o.a} × ${o.b}`),
                    ...audit.outOfBounds.slice(0, 3).map(b => `• Taşma: ${b.id}`)
                ].join('<br>');
                badge.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${audit.overlaps.length} çakışma, ${audit.outOfBounds.length} taşma:<br>${issues}`;
            }
            gAudit.appendChild(badge);
        }
    }

    _renderPropsTab(container, el) {
        // Identity
        const gId = this._addGroup(container, 'IDENTITY');
        this._addProp(gId, 'ID', el.id, 'text', v => { el.id = v; this.selection = [v]; this.markDirty(); this.render(); });
        this._addProp(gId, 'TYPE', el.type, 'text', null); // read-only

        if (el.text !== undefined) {
            this._addProp(gId, 'TEXT', el.text, 'text', v => { el.text = v; this.markDirty(); this.renderCanvas(); });
        }
        if (el.type === 'image') {
            this._addProp(gId, 'IMAGE SRC', el.src || '', 'text', v => { el.src = v; this.markDirty(); this.renderCanvas(); });
        }

        // Anchor (3x3 visual grid + preserves screen position)
        const gAnchor = this._addGroup(container, 'ANCHOR & ALIGN');
        const anchorRow = document.createElement('div'); anchorRow.className = 'prop-row';
        const anchorLbl = document.createElement('span'); anchorLbl.className = 'prop-label'; anchorLbl.textContent = (el.anchor || 'top-left').toUpperCase();
        const anchorGrid = document.createElement('div'); anchorGrid.className = 'anchor-grid';
        const ANCHORS = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];
        ANCHORS.forEach(a => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'anchor-cell' + ((el.anchor || 'top-left') === a ? ' active' : '');
            cell.title = a;
            cell.onclick = () => {
                this.pushUndo();
                const oldAnchor = el.anchor || 'top-left';
                if (window.UIRenderer && typeof window.UIRenderer.convertAnchorRect === 'function') {
                    el.rect = window.UIRenderer.convertAnchorRect(el.rect, oldAnchor, a, this.resolution);
                }
                el.anchor = a;
                this.markDirty();
                this.renderCanvas();
                this.renderInspector();
            };
            anchorGrid.appendChild(cell);
        });
        anchorRow.appendChild(anchorLbl);
        anchorRow.appendChild(anchorGrid);
        gAnchor.appendChild(anchorRow);

        // Geometry
        const gGeo = this._addGroup(container, 'GEOMETRY');
        this._addProp(gGeo, 'X', el.rect.x, 'number', v => { this.pushUndo(); el.rect.x = v; this.markDirty(); this.renderCanvas(); });
        this._addProp(gGeo, 'Y', el.rect.y, 'number', v => { this.pushUndo(); el.rect.y = v; this.markDirty(); this.renderCanvas(); });
        this._addProp(gGeo, 'W', el.rect.w, 'number', v => { this.pushUndo(); el.rect.w = Math.max(10, v); this.markDirty(); this.renderCanvas(); });
        this._addProp(gGeo, 'H', el.rect.h, 'number', v => { this.pushUndo(); el.rect.h = Math.max(10, v); this.markDirty(); this.renderCanvas(); });

        // Data Binding (Universal)
        const gBind = this._addGroup(container, 'DATA BINDING');
        this._addProp(gBind, 'BIND VAR', el.props?.variable || '', 'text', v => { if (!el.props) el.props = {}; el.props.variable = v; this.markDirty(); });
        
        // Bar-specific data binding
        if (el.type === 'bar') {
            this._addProp(gBind, 'MAX VAR', el.props?.maxVariable || '', 'text', v => { if (!el.props) el.props = {}; el.props.maxVariable = v; this.markDirty(); });
            this._addColorProp(gBind, 'FILL COLOR', el.props?.fillColor || '#e23b4e', v => { if (!el.props) el.props = {}; el.props.fillColor = v; this.markDirty(); this.renderCanvas(); });
            this._addProp(gBind, 'SEGMENTS', el.props?.ticks || 0, 'number', v => { if (!el.props) el.props = {}; el.props.ticks = Math.max(0, v); this.markDirty(); this.renderCanvas(); });
        }
    }

    _renderStyleTab(container, el) {
        if (!el.style) el.style = {};

        const gColor = this._addGroup(container, 'COLORS');
        this._addColorProp(gColor, 'BACKGROUND', el.style.backgroundColor || 'transparent', v => { el.style.backgroundColor = v; this.markDirty(); this.renderCanvas(); });
        this._addColorProp(gColor, 'TEXT COLOR', el.style.color || '#ffffff', v => { el.style.color = v; this.markDirty(); this.renderCanvas(); });

        const gBorder = this._addGroup(container, 'BORDER & SHAPE');
        this._addProp(gBorder, 'BORDER W', el.style.borderWidth !== undefined ? parseInt(el.style.borderWidth) : 0, 'number', v => { el.style.borderWidth = Math.max(0, v); this.markDirty(); this.renderCanvas(); });
        this._addColorProp(gBorder, 'BORDER CLR', el.style.borderColor || 'transparent', v => { el.style.borderColor = v; this.markDirty(); this.renderCanvas(); });
        this._addProp(gBorder, 'RADIUS (px)', parseInt(el.style.borderRadius) || 0, 'number', v => { el.style.borderRadius = Math.max(0, v); this.markDirty(); this.renderCanvas(); });

        const gFont = this._addGroup(container, 'TYPOGRAPHY');
        this._addProp(gFont, 'SIZE (px)', parseInt(el.style.fontSize) || 14, 'number', v => { el.style.fontSize = Math.max(8, v); this.markDirty(); this.renderCanvas(); });
        this._addSelectProp(gFont, 'WEIGHT', String(el.style.fontWeight || '400'), [
            { value: '400', label: 'Regular (400)' },
            { value: '700', label: 'Bold (700)' }
        ], v => { el.style.fontWeight = v; this.markDirty(); this.renderCanvas(); });
        this._addAlignProp(gFont, el.style.textAlign || 'left', v => { el.style.textAlign = v; this.markDirty(); this.renderCanvas(); this.renderInspector(); });

        const gLayout = this._addGroup(container, 'LAYERING');
        this._addProp(gLayout, 'Z-INDEX', parseInt(el.style.zIndex) || 0, 'number', v => { el.style.zIndex = v; this.markDirty(); this.renderCanvas(); });
        this._addProp(gLayout, 'OPACITY', el.style.opacity !== undefined ? el.style.opacity : 1, 'number', v => { el.style.opacity = Math.max(0, Math.min(1, v)); this.markDirty(); this.renderCanvas(); });
    }

    _renderEventsTab(container, el) {
        const gEvt = this._addGroup(container, 'INTERACTIONS');

        if (el.type === 'button') {
            // Parse current action
            const parsed = this._parseAction(el.script || '');

            // Action Type selector
            const typeRow = document.createElement('div'); typeRow.className = 'prop-row';
            const typeLbl = document.createElement('span'); typeLbl.className = 'prop-label'; typeLbl.textContent = 'ACTION TYPE';
            const typeSelect = document.createElement('select'); typeSelect.className = 'prop-input';
            ['navigate', 'engine_action', 'custom_script'].forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t === 'navigate' ? '🔗 Navigate to Screen' : t === 'engine_action' ? '⚙️ Engine Action' : '📝 Custom Script';
                if (t === parsed.type) opt.selected = true;
                typeSelect.appendChild(opt);
            });
            typeRow.appendChild(typeLbl); typeRow.appendChild(typeSelect);
            gEvt.appendChild(typeRow);

            // Value container (changes based on type)
            const valueContainer = document.createElement('div');
            gEvt.appendChild(valueContainer);

            const renderValueField = (actionType) => {
                valueContainer.innerHTML = '';

                if (actionType === 'navigate') {
                    // Screen picker dropdown
                    const row = document.createElement('div'); row.className = 'prop-row';
                    const lbl = document.createElement('span'); lbl.className = 'prop-label'; lbl.textContent = 'TARGET SCREEN';
                    const sel = document.createElement('select'); sel.className = 'prop-input';

                    const emptyOpt = document.createElement('option');
                    emptyOpt.value = ''; emptyOpt.textContent = '— Select Screen —';
                    sel.appendChild(emptyOpt);

                    Object.keys(this.data.screens).forEach(sid => {
                        const opt = document.createElement('option');
                        opt.value = sid; opt.textContent = sid;
                        if (parsed.type === 'navigate' && parsed.value === sid) opt.selected = true;
                        sel.appendChild(opt);
                    });

                    sel.onchange = () => {
                        el.script = sel.value ? `navigate:${sel.value}` : '';
                        this.markDirty();
                        this.renderCanvas();
                    };
                    row.appendChild(lbl); row.appendChild(sel);
                    valueContainer.appendChild(row);

                    // Connection hint
                    if (parsed.type === 'navigate' && parsed.value) {
                        const hint = document.createElement('div');
                        hint.style.cssText = 'padding:6px 10px; color:#3498db; font-size:0.8rem; display:flex; align-items:center; gap:6px;';
                        hint.innerHTML = `<i class="fas fa-link"></i> This button navigates to <strong>${_escapeHtml(parsed.value)}</strong>`;
                        valueContainer.appendChild(hint);
                    }
                } else if (actionType === 'engine_action') {
                    // Known actions dropdown
                    const row = document.createElement('div'); row.className = 'prop-row';
                    const lbl = document.createElement('span'); lbl.className = 'prop-label'; lbl.textContent = 'ENGINE ACTION';
                    const sel = document.createElement('select'); sel.className = 'prop-input';

                    const emptyOpt = document.createElement('option');
                    emptyOpt.value = ''; emptyOpt.textContent = '— Select Action —';
                    sel.appendChild(emptyOpt);

                    let lastCat = '';
                    (this.knownActions || []).forEach(act => {
                        if (act.category !== lastCat) {
                            const optGroup = document.createElement('optgroup');
                            optGroup.label = act.category.toUpperCase();
                            sel.appendChild(optGroup);
                            lastCat = act.category;
                        }
                        const opt = document.createElement('option');
                        opt.value = act.id; opt.textContent = `${act.label} (${act.id})`;
                        if (parsed.type === 'engine_action' && parsed.value === act.id) opt.selected = true;
                        sel.appendChild(opt);
                    });

                    sel.onchange = () => {
                        el.script = sel.value ? `action:${sel.value}` : '';
                        this.markDirty();
                        this.renderCanvas();
                    };
                    row.appendChild(lbl); row.appendChild(sel);
                    valueContainer.appendChild(row);
                } else {
                    // Custom script text field
                    const row = document.createElement('div'); row.className = 'prop-row';
                    const lbl = document.createElement('span'); lbl.className = 'prop-label'; lbl.textContent = 'SCRIPT NAME';
                    const inp = document.createElement('input'); inp.className = 'prop-input';
                    inp.value = parsed.type === 'custom_script' ? parsed.value : (el.script || '');
                    inp.placeholder = 'e.g., my_custom_handler';
                    inp.onchange = () => {
                        el.script = inp.value;
                        this.markDirty();
                        this.renderCanvas();
                    };
                    row.appendChild(lbl); row.appendChild(inp);
                    valueContainer.appendChild(row);
                }
            };

            typeSelect.onchange = () => {
                // When switching type, clear the script and re-render value field
                const newType = typeSelect.value;
                if (newType === 'navigate') el.script = 'navigate:';
                else if (newType === 'engine_action') el.script = 'action:';
                else el.script = '';
                this.markDirty();
                renderValueField(newType);
            };

            renderValueField(parsed.type);

        } else {
            gEvt.innerHTML += '<div style="padding:10px; color:#555; font-size:0.85rem;">No events for this element type.</div>';
        }
    }

    _parseAction(script) {
        if (!script) return { type: 'custom_script', value: '' };
        if (script.startsWith('navigate:')) return { type: 'navigate', value: script.substring(9) };
        if (script.startsWith('action:')) return { type: 'engine_action', value: script.substring(7) };
        // Legacy: check if it matches a known engine action
        if (this.knownActions && this.knownActions.some(a => a.id === script)) {
            return { type: 'engine_action', value: script };
        }
        return { type: 'custom_script', value: script };
    }

    setInspectorTab(tab) {
        this.inspectorTab = tab;
        this.renderInspector();
    }

    // ── Inspector helpers ──

    _addGroup(container, title) {
        const div = document.createElement('div');
        div.className = 'prop-group';
        div.innerHTML = `<div class="prop-group-title">${title}</div>`;
        container.appendChild(div);
        return div;
    }

    _addProp(container, label, value, type, callback) {
        const row = document.createElement('div'); row.className = 'prop-row';
        const lbl = document.createElement('span'); lbl.className = 'prop-label'; lbl.textContent = label;

        const inp = document.createElement('input');
        inp.className = 'prop-input';
        inp.type = type === 'number' ? 'number' : 'text';
        inp.value = value;

        if (!callback) {
            inp.disabled = true; inp.style.opacity = '0.5';
        } else {
            inp.onchange = (e) => {
                const v = type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value;
                callback(v);
            };
        }

        row.appendChild(lbl);
        row.appendChild(inp);
        container.appendChild(row);
    }

    _addColorProp(container, label, value, callback) {
        const row = document.createElement('div'); row.className = 'prop-row';
        const lbl = document.createElement('span'); lbl.className = 'prop-label'; lbl.textContent = label;

        const wrap = document.createElement('div'); wrap.className = 'color-row';

        const colorIn = document.createElement('input');
        colorIn.type = 'color'; colorIn.className = 'color-swatch';
        if (value.startsWith('#')) colorIn.value = value.substring(0, 7);

        const textIn = document.createElement('input');
        textIn.className = 'prop-input color-text';
        textIn.value = value;

        colorIn.oninput = (e) => { textIn.value = e.target.value; callback(e.target.value); };
        textIn.onchange = (e) => { callback(e.target.value); if (e.target.value.startsWith('#')) colorIn.value = e.target.value.substring(0, 7); };

        wrap.appendChild(colorIn);
        wrap.appendChild(textIn);
        row.appendChild(lbl);
        row.appendChild(wrap);
        container.appendChild(row);
    }

    _addAlignProp(container, current, callback) {
        const row = document.createElement('div'); row.className = 'prop-row';
        const lbl = document.createElement('span'); lbl.className = 'prop-label'; lbl.textContent = 'ALIGN';

        const wrap = document.createElement('div'); wrap.className = 'align-btns';
        ['left', 'center', 'right'].forEach(a => {
            const btn = document.createElement('button');
            btn.className = 'align-btn' + (current === a ? ' active' : '');
            btn.innerHTML = `<i class="fas fa-align-${a}"></i>`;
            btn.onclick = () => callback(a);
            wrap.appendChild(btn);
        });

        row.appendChild(lbl);
        row.appendChild(wrap);
        container.appendChild(row);
    }

    _addSelectProp(container, label, value, options, callback) {
        const row = document.createElement('div'); row.className = 'prop-row';
        const lbl = document.createElement('span'); lbl.className = 'prop-label'; lbl.textContent = label;
        const sel = document.createElement('select'); sel.className = 'prop-input';
        options.forEach(optDef => {
            const opt = document.createElement('option');
            opt.value = optDef.value;
            opt.textContent = optDef.label;
            if (String(value) === String(optDef.value)) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.onchange = (e) => callback(e.target.value);
        row.appendChild(lbl);
        row.appendChild(sel);
        container.appendChild(row);
    }

    // ═══════════════════════════════════════
    // STATUS BAR
    // ═══════════════════════════════════════
    updateStatusBar() {
        const toolNames = { pointer: 'Pointer', pan: 'Pan' };
        document.getElementById('status-tool').innerHTML = `<i class="fas fa-mouse-pointer"></i> ${toolNames[this.activeTool] || this.activeTool}`;
        document.getElementById('status-screen').textContent = this.activeScreen || 'No Screen';
        document.getElementById('status-elements').textContent = `${this.getElements().length} elements`;

        const selCount = this.selection.length;
        document.getElementById('status-selection').textContent =
            selCount === 0 ? 'No selection' :
            selCount === 1 ? this.selection[0] :
            `${selCount} selected`;

        document.getElementById('status-zoom').textContent = `Zoom: ${Math.round(this.scale * 100)}%`;
        this.updateFileStatus();
    }

    // ═══════════════════════════════════════
    // SELECTION
    // ═══════════════════════════════════════
    select(id) {
        this.selection = id ? [id] : [];
        this.render();
    }

    toggleSelection(id) {
        const idx = this.selection.indexOf(id);
        if (idx >= 0) this.selection.splice(idx, 1);
        else this.selection.push(id);
        this.render();
    }

    selectAll() {
        this.selection = this.getElements().map(e => e.id);
        this.render();
    }

    clearSelection() {
        this.selection = [];
        this.render();
    }

    // ═══════════════════════════════════════
    // ELEMENT CRUD
    // ═══════════════════════════════════════
    addElement(type, x, y) {
        if (!this.activeScreen) return;
        this.pushUndo();

        if (this.snapping) {
            x = Math.round(x / this.snapSize) * this.snapSize;
            y = Math.round(y / this.snapSize) * this.snapSize;
        }

        const id = `${type}_${Date.now().toString(36).slice(-5)}`;
        const defaults = JSON.parse(JSON.stringify(ELEMENT_DEFAULTS[type] || ELEMENT_DEFAULTS.panel));
        const newEl = { id, type, ...defaults };
        newEl.rect.x = Math.round(x);
        newEl.rect.y = Math.round(y);

        this.data.screens[this.activeScreen].elements.push(newEl);
        this.selection = [id];
        this.markDirty();
        this.render();

        // Spawn animation
        requestAnimationFrame(() => {
            const dom = this.dom.artboard.querySelector(`[data-id="${id}"]`);
            if (dom) { dom.classList.add('spawning'); setTimeout(() => dom.classList.remove('spawning'), 300); }
        });
    }

    quickAdd(type) {
        const cx = this.resolution.w / 2 - (ELEMENT_DEFAULTS[type]?.rect?.w || 100) / 2;
        const cy = this.resolution.h / 2 - (ELEMENT_DEFAULTS[type]?.rect?.h || 40) / 2;
        this.addElement(type, cx, cy);
    }

    deleteSelected() {
        if (this.selection.length === 0) return;
        this.pushUndo();
        const elements = this.getElements();
        this.selection.forEach(id => {
            const idx = elements.findIndex(e => e.id === id);
            if (idx >= 0) elements.splice(idx, 1);
        });
        this.selection = [];
        this.markDirty();
        this.render();
    }

    duplicateSelected() {
        if (this.selection.length === 0) return;
        this.pushUndo();
        const newIds = [];
        this.selection.forEach(id => {
            const el = this.getElement(id);
            if (!el) return;
            const copy = JSON.parse(JSON.stringify(el));
            copy.id = `${el.type}_${Date.now().toString(36).slice(-5)}`;
            const cur = this._resolveElementRect(el);
            copy.rect = this._screenToAnchor(cur.left + 16, cur.top + 16, cur.w, cur.h, el.anchor || 'top-left');
            this.getElements().push(copy);
            newIds.push(copy.id);
        });
        this.selection = newIds;
        this.markDirty();
        this.render();
    }

    // ═══════════════════════════════════════
    // Z-ORDER
    // ═══════════════════════════════════════
    bringToFront() {
        if (this.selection.length === 0) return;
        this.pushUndo();
        const elements = this.getElements();
        this.selection.forEach(id => {
            const idx = elements.findIndex(e => e.id === id);
            if (idx >= 0) {
                const [el] = elements.splice(idx, 1);
                elements.push(el);
            }
        });
        this.markDirty();
        this.render();
    }

    sendToBack() {
        if (this.selection.length === 0) return;
        this.pushUndo();
        const elements = this.getElements();
        const toMove = [];
        for (let i = elements.length - 1; i >= 0; i--) {
            if (this.selection.includes(elements[i].id)) {
                toMove.unshift(elements.splice(i, 1)[0]);
            }
        }
        elements.unshift(...toMove);
        this.markDirty();
        this.render();
    }

    // ═══════════════════════════════════════
    // ALIGNMENT (Anchor-Aware)
    // ═══════════════════════════════════════
    alignElements(direction) {
        if (this.selection.length < 2) return;
        this.pushUndo();
        const selected = this.selection.map(id => this.getElement(id)).filter(Boolean);
        const resolved = selected.map(el => ({ el, box: this._resolveElementRect(el) }));

        let ref;
        switch (direction) {
            case 'left':
                ref = Math.min(...resolved.map(x => x.box.left));
                resolved.forEach(({ el, box }) => { el.rect = this._screenToAnchor(ref, box.top, box.w, box.h, el.anchor); });
                break;
            case 'right':
                ref = Math.max(...resolved.map(x => x.box.left + x.box.w));
                resolved.forEach(({ el, box }) => { el.rect = this._screenToAnchor(ref - box.w, box.top, box.w, box.h, el.anchor); });
                break;
            case 'top':
                ref = Math.min(...resolved.map(x => x.box.top));
                resolved.forEach(({ el, box }) => { el.rect = this._screenToAnchor(box.left, ref, box.w, box.h, el.anchor); });
                break;
            case 'bottom':
                ref = Math.max(...resolved.map(x => x.box.top + x.box.h));
                resolved.forEach(({ el, box }) => { el.rect = this._screenToAnchor(box.left, ref - box.h, box.w, box.h, el.anchor); });
                break;
            case 'center-h':
                ref = resolved.reduce((s, x) => s + x.box.left + x.box.w / 2, 0) / resolved.length;
                resolved.forEach(({ el, box }) => { el.rect = this._screenToAnchor(Math.round(ref - box.w / 2), box.top, box.w, box.h, el.anchor); });
                break;
            case 'center-v':
                ref = resolved.reduce((s, x) => s + x.box.top + x.box.h / 2, 0) / resolved.length;
                resolved.forEach(({ el, box }) => { el.rect = this._screenToAnchor(box.left, Math.round(ref - box.h / 2), box.w, box.h, el.anchor); });
                break;
        }
        this.markDirty();
        this.renderCanvas();
        this.renderInspector();
    }

    // ═══════════════════════════════════════
    // ZOOM / PAN / VIEW
    // ═══════════════════════════════════════
    applyArtboardTransform() {
        this.dom.artboard.style.transform = `translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${this.scale})`;
    }

    setZoom(level, markUser = true) {
        if (markUser) this._userZoomed = true;
        this.scale = Math.max(0.15, Math.min(4, level));
        this.applyArtboardTransform();
        this.dom.zoomIndicator.textContent = Math.round(this.scale * 100) + '%';
        document.getElementById('status-zoom').textContent = `Zoom: ${Math.round(this.scale * 100)}%`;
        this.hideZoomMenu();
    }

    zoomIn() { this.setZoom(this.scale + 0.1, true); }
    zoomOut() { this.setZoom(this.scale - 0.1, true); }

    fitToScreen(markReset = true) {
        const area = this.dom.canvasArea;
        if (!area) return;
        const cw = area.clientWidth || 700;
        const ch = area.clientHeight || 420;
        const pad = 64;
        const fit = Math.min((cw - pad) / this.resolution.w, (ch - pad) / this.resolution.h, 1.0);
        const clamped = Math.max(0.25, Math.floor(fit * 20) / 20);
        this.panOffset = { x: 0, y: 0 };
        if (markReset) this._userZoomed = false;
        this.setZoom(clamped, false);
    }

    resetView() {
        this.fitToScreen(true);
    }

    showZoomPresets() {
        const menu = this.dom.zoomMenu;
        if (menu.style.display === 'block') { menu.style.display = 'none'; return; }
        const btn = this.dom.zoomIndicator;
        const r = btn.getBoundingClientRect();
        menu.style.left = r.left + 'px';
        menu.style.top = (r.bottom + 4) + 'px';
        menu.style.display = 'block';
    }

    hideZoomMenu() { this.dom.zoomMenu.style.display = 'none'; }

    // ═══════════════════════════════════════
    // GRID / SNAP
    // ═══════════════════════════════════════
    toggleSnapping() {
        this.snapping = !this.snapping;
        const btn = document.getElementById('btn-snap');
        btn.classList.toggle('active', this.snapping);
    }

    toggleGrid() {
        this.gridEnabled = !this.gridEnabled;
        const btn = document.getElementById('btn-grid');
        btn.classList.toggle('active', this.gridEnabled);
        this.renderCanvas();
    }

    setSnapSize(size) {
        this.snapSize = size;
        if (this.gridEnabled) this.renderCanvas();
    }

    setResolution(val) {
        const [w, h] = val.split('x').map(Number);
        this.resolution = { w, h };
        this.data.resolution = { w, h };
        this.markDirty();
        this.renderCanvas();
        this.fitToScreen(false);
    }

    // ═══════════════════════════════════════
    // TOOL SYSTEM
    // ═══════════════════════════════════════
    setTool(name) {
        this.activeTool = name;
        document.querySelectorAll('#tool-rail .rail-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === name);
        });
        const area = this.dom.canvasArea;
        area.className = area.className.replace(/tool-\w+/g, '');
        area.classList.add(`tool-${name}`);
        this.updateStatusBar();
    }

    // ═══════════════════════════════════════
    // LAYOUT — Collapsible Panels
    // ═══════════════════════════════════════
    togglePanel(panelId) {
        const panel = document.getElementById(`${panelId}-panel`);
        if (!panel) return;
        const isCollapsed = panel.classList.contains('collapsed');
        panel.classList.toggle('collapsed');
        this.layoutState[`${panelId}Panel`] = isCollapsed ? 'expanded' : 'collapsed';

        const btn = panel.querySelector('.collapse-btn i');
        if (btn) {
            if (panelId === 'left') btn.className = `fas fa-chevron-${isCollapsed ? 'left' : 'right'}`;
            else btn.className = `fas fa-chevron-${isCollapsed ? 'right' : 'left'}`;
        }
        this.saveLayoutState();
    }

    applyLayoutState() {
        ['left', 'right'].forEach(id => {
            const panel = document.getElementById(`${id}-panel`);
            if (!panel) return;
            if (this.layoutState[`${id}Panel`] === 'collapsed') {
                panel.classList.add('collapsed');
                const btn = panel.querySelector('.collapse-btn i');
                if (btn) btn.className = `fas fa-chevron-${id === 'left' ? 'right' : 'left'}`;
            }
        });
    }

    saveLayoutState() {
        try { localStorage.setItem('ui_studio_layout', JSON.stringify(this.layoutState)); } catch(e) {}
    }

    // ═══════════════════════════════════════
    // INPUT — Mouse
    // ═══════════════════════════════════════
    setupInput() {
        const area = this.dom.canvasArea;
        const ab = this.dom.artboard;

        // Pan drag on canvas area when pan tool active or middle mouse button
        area.addEventListener('mousedown', (e) => {
            if (this.activeTool === 'pan' || e.button === 1) {
                e.preventDefault();
                this.dragState = {
                    mode: 'pan',
                    startX: e.clientX,
                    startY: e.clientY,
                    startPanX: this.panOffset.x,
                    startPanY: this.panOffset.y
                };
            }
        });

        // Click on empty artboard → deselect (or pan if pan tool active)
        ab.addEventListener('mousedown', (e) => {
            if (this.activeTool === 'pan' || e.button === 1) return;
            if (e.target === ab || e.target === this.dom.artboardLabel) {
                if (this.activeTool === 'pointer') {
                    // Start marquee
                    const rect = ab.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / this.scale;
                    const y = (e.clientY - rect.top) / this.scale;
                    this.marquee = { startX: x, startY: y, el: null };
                    this.selection = [];
                    this.render();
                }
            }
        });

        // Zoom with mouse wheel
        area.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            this.setZoom(this.scale + delta);
        }, { passive: false });

        // Global move/up
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // Track cursor position on artboard
        ab.addEventListener('mousemove', (e) => {
            const rect = ab.getBoundingClientRect();
            const x = Math.round((e.clientX - rect.left) / this.scale);
            const y = Math.round((e.clientY - rect.top) / this.scale);
            document.getElementById('status-cursor').textContent = `X: ${x}, Y: ${y}`;
        });

        // Close menus on click outside
        window.addEventListener('mousedown', (e) => {
            const zm = this.dom.zoomMenu;
            if (zm.style.display === 'block' && !zm.contains(e.target) && e.target !== this.dom.zoomIndicator) {
                zm.style.display = 'none';
            }
        });
    }

    onElementDown(e, data) {
        if (this.activeTool === 'pan' || e.button === 1) return;
        e.stopPropagation();

        // Check if clicking a resize handle
        const handleDir = e.target.dataset.dir;
        if (handleDir) {
            this.pushUndo();
            const el = this.getElement(data.id);
            const resolved = this._resolveElementRect(el);
            this.dragState = {
                mode: 'resize',
                ids: [data.id],
                startX: e.clientX,
                startY: e.clientY,
                initials: { [data.id]: { ...resolved } },
                handleDir: handleDir
            };
            return;
        }

        // Selection logic
        if (e.shiftKey) {
            this.toggleSelection(data.id);
        } else if (!this.selection.includes(data.id)) {
            this.selection = [data.id];
            this.render();
        }

        // Start move drag (store visual artboard coordinates so every anchor drags intuitively)
        this.pushUndo();
        const initials = {};
        this.selection.forEach(id => {
            const el = this.getElement(id);
            if (el) initials[id] = { ...this._resolveElementRect(el) };
        });

        this.dragState = {
            mode: 'move',
            ids: [...this.selection],
            startX: e.clientX,
            startY: e.clientY,
            initials: initials,
            moved: false
        };
    }

    onMouseMove(e) {
        // Marquee selection
        if (this.marquee) {
            const ab = this.dom.artboard;
            const rect = ab.getBoundingClientRect();
            const mx = (e.clientX - rect.left) / this.scale;
            const my = (e.clientY - rect.top) / this.scale;

            if (!this.marquee.el) {
                this.marquee.el = document.createElement('div');
                this.marquee.el.className = 'marquee';
                ab.appendChild(this.marquee.el);
            }

            const sx = Math.min(this.marquee.startX, mx);
            const sy = Math.min(this.marquee.startY, my);
            const sw = Math.abs(mx - this.marquee.startX);
            const sh = Math.abs(my - this.marquee.startY);

            Object.assign(this.marquee.el.style, {
                left: sx + 'px', top: sy + 'px', width: sw + 'px', height: sh + 'px'
            });

            // Live selection update using resolved artboard bounds
            const elements = this.getElements();
            this.selection = elements.filter(el => {
                const b = this._resolveElementRect(el);
                return b.left < sx + sw && b.left + b.w > sx &&
                       b.top < sy + sh && b.top + b.h > sy;
            }).map(el => el.id);

            this.renderHierarchy();
            this.renderInspector();
            return;
        }

        if (!this.dragState) return;

        if (this.dragState.mode === 'pan') {
            this.panOffset.x = this.dragState.startPanX + (e.clientX - this.dragState.startX);
            this.panOffset.y = this.dragState.startPanY + (e.clientY - this.dragState.startY);
            this.applyArtboardTransform();
            return;
        }

        const dx = (e.clientX - this.dragState.startX) / this.scale;
        const dy = (e.clientY - this.dragState.startY) / this.scale;
        let guideX = null;
        let guideY = null;

        if (this.dragState.mode === 'move') {
            this.dragState.moved = true;
            this.dragState.ids.forEach(id => {
                const el = this.getElement(id);
                const init = this.dragState.initials[id];
                if (!el || !init) return;

                let nLeft = init.left + dx;
                let nTop = init.top + dy;
                if (this.snapping) {
                    nLeft = Math.round(nLeft / this.snapSize) * this.snapSize;
                    nTop = Math.round(nTop / this.snapSize) * this.snapSize;
                    if (id === this.dragState.ids[0]) {
                        const midX = this.resolution.w / 2;
                        const midY = this.resolution.h / 2;
                        if (Math.abs((nLeft + init.w / 2) - midX) <= 6) {
                            nLeft = Math.round(midX - init.w / 2);
                            guideX = midX;
                        }
                        if (Math.abs((nTop + init.h / 2) - midY) <= 6) {
                            nTop = Math.round(midY - init.h / 2);
                            guideY = midY;
                        }
                    }
                }
                el.rect = this._screenToAnchor(nLeft, nTop, init.w, init.h, el.anchor || 'top-left');
            });
            this.renderCanvas();
            this._renderSnapGuides(guideX, guideY);
        }
        else if (this.dragState.mode === 'resize') {
            const id = this.dragState.ids[0];
            const el = this.getElement(id);
            const init = this.dragState.initials[id];
            if (!el || !init) return;

            const dir = this.dragState.handleDir;
            let nLeft = init.left, nTop = init.top, nw = init.w, nh = init.h;

            // Handle direction
            if (dir.includes('r')) nw = init.w + dx;
            if (dir.includes('l')) { nw = init.w - dx; nLeft = init.left + dx; }
            if (dir.includes('b')) nh = init.h + dy;
            if (dir.includes('t')) { nh = init.h - dy; nTop = init.top + dy; }

            // Snap
            if (this.snapping) {
                nw = Math.round(nw / this.snapSize) * this.snapSize;
                nh = Math.round(nh / this.snapSize) * this.snapSize;
                if (dir.includes('l')) nLeft = init.left + (init.w - Math.max(10, nw));
                if (dir.includes('t')) nTop = init.top + (init.h - Math.max(10, nh));
            }

            // Min size
            nw = Math.max(10, Math.round(nw));
            nh = Math.max(10, Math.round(nh));

            el.rect = this._screenToAnchor(nLeft, nTop, nw, nh, el.anchor || 'top-left');
            this.renderCanvas();
        }
    }

    _renderSnapGuides(x, y) {
        const ab = this.dom.artboard;
        if (!ab) return;
        ab.querySelectorAll('.snap-guide').forEach(e => e.remove());
        if (x !== null) {
            const v = document.createElement('div');
            v.className = 'snap-guide snap-guide-v';
            v.style.left = x + 'px';
            v.style.background = '#49e3ff';
            ab.appendChild(v);
        }
        if (y !== null) {
            const h = document.createElement('div');
            h.className = 'snap-guide snap-guide-h';
            h.style.top = y + 'px';
            h.style.background = '#49e3ff';
            ab.appendChild(h);
        }
    }

    onMouseUp(e) {
        // Marquee end
        if (this.marquee) {
            if (this.marquee.el) this.marquee.el.remove();
            this.marquee = null;
            this.renderCanvas(); // repaint selection state
            this.renderInspector();
            return;
        }

        if (this.dragState) {
            if (this.dragState.mode === 'pan') {
                this.dragState = null;
                return;
            }
            if (this.dragState.moved || this.dragState.mode === 'resize') {
                this.markDirty();
            } else {
                // No actual move — undo the push
                this.undoStack.pop();
            }
            this.dragState = null;
            this.dom.artboard.querySelectorAll('.snap-guide').forEach(g => g.remove());
            this.renderInspector();
        }
    }

    // ═══════════════════════════════════════
    // INPUT — Drag & Drop from palette
    // ═══════════════════════════════════════
    setupDragDrop() {
        document.querySelectorAll('.comp-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('comp-type', card.dataset.type);
            });
        });

        this.dom.canvasArea.addEventListener('dragover', (e) => e.preventDefault());

        this.dom.canvasArea.addEventListener('drop', (e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData('comp-type');
            if (!type || !this.activeScreen) return;

            const rect = this.dom.artboard.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.scale;
            const y = (e.clientY - rect.top) / this.scale;
            this.addElement(type, x, y);
        });
    }

    // ═══════════════════════════════════════
    // INPUT — Keyboard
    // ═══════════════════════════════════════
    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't intercept if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                if (e.key === 'Escape') e.target.blur();
                return;
            }

            const ctrl = e.ctrlKey || e.metaKey;

            // Ctrl+S — save
            if (ctrl && e.key === 's') { 
                e.preventDefault(); 
                this.save(); 
                if (window.parent && window.parent.RedglitchEventBus) {
                    window.parent.RedglitchEventBus.emit('system:project:save_request');
                }
                return; 
            }
            // Ctrl+Z — undo
            if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
            // Ctrl+Y or Ctrl+Shift+Z — redo
            if ((ctrl && e.key === 'y') || (ctrl && e.shiftKey && e.key === 'z')) { e.preventDefault(); this.redo(); return; }
            // Ctrl+D — duplicate
            if (ctrl && e.key === 'd') { e.preventDefault(); this.duplicateSelected(); return; }
            // Ctrl+A — select all
            if (ctrl && e.key === 'a') { e.preventDefault(); this.selectAll(); return; }
            // Ctrl+N — new screen
            if (ctrl && e.key === 'n') { e.preventDefault(); this.addScreen(); return; }
            // Ctrl+K — quick search
            if (ctrl && e.key === 'k') { e.preventDefault(); this.showQuickSearch(); return; }
            // Ctrl+M — screen map
            if (ctrl && e.key === 'm') { e.preventDefault(); this.toggleScreenMap(); return; }
            // Ctrl+1 — toggle left panel
            if (ctrl && e.key === '1') { e.preventDefault(); this.togglePanel('left'); return; }
            // Ctrl+2 — toggle right panel
            if (ctrl && e.key === '2') { e.preventDefault(); this.togglePanel('right'); return; }

            // Delete / Backspace
            if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelected(); return; }
            // Escape — deselect
            if (e.key === 'Escape') { this.clearSelection(); this.closeQuickSearch(); this.closeTemplatesModal(); return; }

            // Arrow keys — nudge
            const nudge = this.snapping ? this.snapSize : 1;
            if (e.key === 'ArrowLeft')  { this._nudgeSelection(-nudge, 0); e.preventDefault(); return; }
            if (e.key === 'ArrowRight') { this._nudgeSelection(nudge, 0);  e.preventDefault(); return; }
            if (e.key === 'ArrowUp')    { this._nudgeSelection(0, -nudge); e.preventDefault(); return; }
            if (e.key === 'ArrowDown')  { this._nudgeSelection(0, nudge);  e.preventDefault(); return; }

            // Tool shortcuts
            if (e.key === 'v' || e.key === 'V') { this.setTool('pointer'); return; }
            if (e.key === 'h' || e.key === 'H') { this.setTool('pan'); return; }
            if (e.key === 'g' || e.key === 'G') { this.toggleGrid(); return; }
            if (e.key === '0') { this.resetView(); return; }
            if (e.key === '=' || e.key === '+') { this.zoomIn(); return; }
            if (e.key === '-') { this.zoomOut(); return; }
        });
    }

    _nudgeSelection(dx, dy) {
        if (this.selection.length === 0) return;
        this.pushUndo();
        this.selection.forEach(id => {
            const el = this.getElement(id);
            if (el) { el.rect.x += dx; el.rect.y += dy; }
        });
        this.markDirty();
        this.renderCanvas();
        this.renderInspector();
    }

    // ═══════════════════════════════════════
    // QUICK SEARCH
    // ═══════════════════════════════════════
    showQuickSearch() {
        this.dom.searchOverlay.style.display = 'flex';
        this.dom.searchInput.value = '';
        this.dom.searchInput.focus();
        this._searchIndex = 0;
        this._updateSearchResults('');

        this.dom.searchInput.oninput = () => {
            this._searchIndex = 0;
            this._updateSearchResults(this.dom.searchInput.value);
        };
        this.dom.searchInput.onkeydown = (e) => {
            if (e.key === 'Escape') { this.closeQuickSearch(); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); this._searchIndex++; this._updateSearchResults(this.dom.searchInput.value); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); this._searchIndex--; this._updateSearchResults(this.dom.searchInput.value); }
            if (e.key === 'Enter') {
                e.preventDefault();
                const items = this._getSearchItems(this.dom.searchInput.value);
                if (items[this._searchIndex]) {
                    const item = items[this._searchIndex];
                    if (item.action) item.action();
                    this.closeQuickSearch();
                }
            }
        };
    }

    closeQuickSearch() {
        this.dom.searchOverlay.style.display = 'none';
    }

    _getSearchItems(query) {
        const items = [];
        const q = query.toLowerCase();

        // Component types
        ['panel', 'label', 'button', 'image', 'bar', 'slot'].forEach(type => {
            if (!q || type.includes(q) || `add ${type}`.includes(q)) {
                items.push({
                    icon: TYPE_ICONS[type],
                    name: `Add ${type.toUpperCase()}`,
                    type: 'action',
                    action: () => this.quickAdd(type)
                });
            }
        });

        // Existing elements
        this.getElements().forEach(el => {
            if (!q || el.id.toLowerCase().includes(q) || el.type.includes(q)) {
                items.push({
                    icon: TYPE_ICONS[el.type],
                    name: el.id,
                    type: el.type,
                    action: () => this.select(el.id)
                });
            }
        });

        return items;
    }

    _updateSearchResults(query) {
        const items = this._getSearchItems(query);
        if (this._searchIndex < 0) this._searchIndex = items.length - 1;
        if (this._searchIndex >= items.length) this._searchIndex = 0;

        const container = this.dom.searchResults;
        container.innerHTML = '';

        if (items.length === 0) {
            container.innerHTML = '<div class="search-empty"><i class="fas fa-search"></i><div>No results</div></div>';
            return;
        }

        items.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'search-item' + (idx === this._searchIndex ? ' selected' : '');
            row.innerHTML = `
                <div class="search-item-icon"><i class="${_escapeHtml(item.icon)}"></i></div>
                <span class="search-item-name">${_escapeHtml(item.name)}</span>
                <span class="search-item-type">${_escapeHtml(item.type)}</span>
            `;
            row.onclick = () => { if (item.action) item.action(); this.closeQuickSearch(); };
            container.appendChild(row);
        });
    }

    // ═══════════════════════════════════════
    // SCREEN MAP
    // ═══════════════════════════════════════
    toggleScreenMap() {
        this.screenMapVisible = !this.screenMapVisible;
        const overlay = document.getElementById('screen-map-overlay');
        if (!overlay) return;
        overlay.style.display = this.screenMapVisible ? 'flex' : 'none';
        if (this.screenMapVisible) this.renderScreenMap();
    }

    renderScreenMap() {
        const container = document.getElementById('screen-map-cards');
        const svg = document.getElementById('screen-map-svg');
        if (!container || !svg) return;
        container.innerHTML = '';

        const screenIds = Object.keys(this.data.screens);
        if (screenIds.length === 0) {
            container.innerHTML = '<div style="color:#555;font-size:1.2rem;">No screens yet. Add one!</div>';
            return;
        }

        // Layout: grid of cards
        const cardPositions = {};
        const cols = Math.min(screenIds.length, 4);
        const cardW = 220, cardH = 150, gapX = 60, gapY = 80;
        const startX = 40, startY = 40;

        screenIds.forEach((sid, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = startX + col * (cardW + gapX);
            const y = startY + row * (cardH + gapY);
            cardPositions[sid] = { x, y, w: cardW, h: cardH };

            const screen = this.data.screens[sid];
            const elCount = screen.elements?.length || 0;
            const btnCount = (screen.elements || []).filter(e => e.type === 'button').length;
            const navCount = (screen.elements || []).filter(e => e.script && e.script.startsWith('navigate:')).length;

            const card = document.createElement('div');
            card.className = 'screen-map-card' + (sid === this.activeScreen ? ' active' : '');
            card.style.left = x + 'px';
            card.style.top = y + 'px';
            card.style.width = cardW + 'px';
            card.style.height = cardH + 'px';

            card.innerHTML = `
                <div class="smc-header"><i class="fas fa-desktop"></i> ${_escapeHtml(sid)}</div>
                <div class="smc-body">
                    <div class="smc-stat"><i class="fas fa-layer-group"></i> ${elCount} elements</div>
                    <div class="smc-stat"><i class="fas fa-mouse-pointer"></i> ${btnCount} buttons</div>
                    <div class="smc-stat"><i class="fas fa-link"></i> ${navCount} links</div>
                </div>
                <div class="smc-footer">Click to edit</div>
            `;

            card.onclick = () => {
                this.switchScreen(sid);
                this.toggleScreenMap();
            };

            container.appendChild(card);
        });

        // Draw connection arrows in SVG
        const totalW = startX * 2 + cols * (cardW + gapX);
        const totalH = startY * 2 + (Math.ceil(screenIds.length / cols)) * (cardH + gapY);
        svg.setAttribute('width', totalW);
        svg.setAttribute('height', totalH);
        svg.innerHTML = '<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#3498db" /></marker></defs>';

        // Find navigate connections
        screenIds.forEach(sid => {
            const screen = this.data.screens[sid];
            (screen.elements || []).forEach(el => {
                if (el.script && el.script.startsWith('navigate:')) {
                    const target = el.script.substring(9);
                    if (target && cardPositions[target] && cardPositions[sid]) {
                        const from = cardPositions[sid];
                        const to = cardPositions[target];

                        const x1 = from.x + from.w / 2;
                        const y1 = from.y + from.h;
                        const x2 = to.x + to.w / 2;
                        const y2 = to.y;

                        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        const midY = (y1 + y2) / 2;
                        line.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
                        line.setAttribute('stroke', '#3498db');
                        line.setAttribute('stroke-width', '2');
                        line.setAttribute('fill', 'none');
                        line.setAttribute('marker-end', 'url(#arrowhead)');
                        line.setAttribute('opacity', '0.7');
                        svg.appendChild(line);

                        // Label on arrow
                        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        label.setAttribute('x', (x1 + x2) / 2);
                        label.setAttribute('y', midY - 6);
                        label.setAttribute('text-anchor', 'middle');
                        label.setAttribute('fill', '#3498db');
                        label.setAttribute('font-size', '11');
                        label.setAttribute('font-family', 'VT323, monospace');
                        label.textContent = el.text || el.id;
                        svg.appendChild(label);
                    }
                }
            });
        });

        // Set container size
        container.style.minWidth = totalW + 'px';
        container.style.minHeight = totalH + 'px';
    }

    getScreenConnections() {
        const connections = [];
        Object.keys(this.data.screens).forEach(sid => {
            const screen = this.data.screens[sid];
            (screen.elements || []).forEach(el => {
                if (el.script && el.script.startsWith('navigate:')) {
                    const target = el.script.substring(9);
                    if (target) connections.push({ from: sid, to: target, via: el.id, label: el.text || el.id });
                }
            });
        });
        return connections;
    }

    // ═══════════════════════════════════════
    // TEMPLATES & UI KITS MODAL
    // ═══════════════════════════════════════
    openTemplatesModal(defaultTab = 'kits') {
        const overlay = document.getElementById('templates-overlay');
        if (!overlay) return;
        if (!overlay._backdropBound) {
            overlay._backdropBound = true;
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.closeTemplatesModal();
            });
        }
        this.setTemplateTab(defaultTab || 'kits');
        overlay.style.display = 'flex';
    }

    closeTemplatesModal() {
        const overlay = document.getElementById('templates-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    setTemplateTab(tab) {
        this._templateTab = tab;
        document.querySelectorAll('[data-tpl-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tplTab === tab);
        });
        const themeRow = document.getElementById('tpl-theme-row');
        if (themeRow) themeRow.style.display = tab === 'screens' ? 'flex' : 'none';
        this.renderTemplatesGrid();
    }

    _renderMiniWireframeHTML(screen, res, accent) {
        const T = window.RedglitchUITemplates;
        if (!T || !screen || !Array.isArray(screen.elements)) return '';
        const w = Number(res?.w) || 800;
        const h = Number(res?.h) || 450;
        return screen.elements
            .filter(el => {
                const r = T.resolveRect(el.rect, el.anchor, { w, h });
                return !(el.type === 'panel' && r.w >= w * 0.9 && r.h >= h * 0.9);
            })
            .map(el => {
                const r = T.resolveRect(el.rect, el.anchor, { w, h });
                const leftPct = (r.left / w) * 100;
                const topPct = (r.top / h) * 100;
                const wPct = Math.max(1.5, (r.w / w) * 100);
                const hPct = Math.max(2, (r.h / h) * 100);
                const borderCol = el.style?.borderColor && el.style.borderColor !== 'transparent'
                    ? el.style.borderColor
                    : (el.type === 'bar' ? (el.props?.fillColor || accent) : accent);
                const bg = el.type === 'bar'
                    ? (el.props?.fillColor || accent)
                    : el.type === 'button'
                        ? 'rgba(255,255,255,0.12)'
                        : el.type === 'slot'
                            ? 'rgba(255,211,106,0.18)'
                            : el.type === 'label'
                                ? 'rgba(255,255,255,0.22)'
                                : 'rgba(255,255,255,0.06)';
                return `<div style="position:absolute;left:${leftPct.toFixed(1)}%;top:${topPct.toFixed(1)}%;width:${wPct.toFixed(1)}%;height:${hPct.toFixed(1)}%;background:${bg};border:1px solid ${borderCol};box-sizing:border-box;border-radius:1px;"></div>`;
            }).join('');
    }

    renderTemplatesGrid() {
        const grid = document.getElementById('templates-grid');
        const T = window.RedglitchUITemplates;
        if (!grid || !T) return;
        grid.innerHTML = '';

        if (this._templateTab === 'kits') {
            T.INTERFACE_KITS.forEach(kit => {
                const sampleDoc = kit.build(this.resolution);
                const card = document.createElement('div');
                card.className = 'tpl-card';
                const swatches = [kit.palette.panel, kit.palette.accent, kit.palette.gold, kit.palette.cyan, kit.palette.green]
                    .map(c => `<span class="tpl-swatch" style="background:${_escapeHtml(c)}"></span>`).join('');
                card.innerHTML = `
                    <div class="tpl-card-head">
                        <span class="tpl-card-name">${_escapeHtml(kit.name)}</span>
                        <span class="tpl-badge">${_escapeHtml(kit.badge)}</span>
                    </div>
                    <div class="tpl-wireframe">${this._renderMiniWireframeHTML(sampleDoc.screens.main_hud, this.resolution, kit.accent)}</div>
                    <div class="tpl-desc">${_escapeHtml(kit.description)}</div>
                    <div class="tpl-swatches">${swatches} <span style="margin-left:auto;font-size:10px;color:#64748b;">${Object.keys(sampleDoc.screens).length} ekran</span></div>
                `;
                const actions = document.createElement('div');
                actions.className = 'tpl-actions';
                const btnApply = document.createElement('button');
                btnApply.className = 'tpl-action-btn primary';
                btnApply.textContent = 'Apply Full UI Kit';
                btnApply.onclick = () => this.applyFullKit(kit.id);
                actions.appendChild(btnApply);
                card.appendChild(actions);
                grid.appendChild(card);
            });
        } else {
            const themeSel = document.getElementById('tpl-theme-select');
            const themeId = themeSel?.value || 'redglitch_ops';
            const theme = T.THEMES[themeId] || T.THEMES.redglitch_ops;
            T.SCREEN_PRESETS.forEach(preset => {
                const sampleScreen = preset.build(themeId, this.resolution);
                const card = document.createElement('div');
                card.className = 'tpl-card';
                card.innerHTML = `
                    <div class="tpl-card-head">
                        <span class="tpl-card-name">${_escapeHtml(preset.name)}</span>
                        <span class="tpl-badge">${_escapeHtml(preset.category)}</span>
                    </div>
                    <div class="tpl-wireframe">${this._renderMiniWireframeHTML(sampleScreen, this.resolution, theme.accent)}</div>
                    <div class="tpl-desc">${_escapeHtml(preset.description)}</div>
                `;
                const actions = document.createElement('div');
                actions.className = 'tpl-actions';

                const btnCur = document.createElement('button');
                btnCur.className = 'tpl-action-btn primary';
                btnCur.textContent = 'Apply to Current';
                btnCur.onclick = () => this.applyScreenPreset(preset.id, themeId, false);

                const btnNew = document.createElement('button');
                btnNew.className = 'tpl-action-btn';
                btnNew.textContent = 'Add Screen';
                btnNew.onclick = () => this.applyScreenPreset(preset.id, themeId, true);

                actions.appendChild(btnCur);
                actions.appendChild(btnNew);
                card.appendChild(actions);
                grid.appendChild(card);
            });
        }
    }

    applyFullKit(kitId) {
        const T = window.RedglitchUITemplates;
        const kit = T?.INTERFACE_KITS.find(k => k.id === kitId);
        if (!kit) return;
        this.pushUndo();
        const built = kit.build(this.resolution);
        this.data = {
            ...this.data,
            format: 'redglitch-ui',
            formatVersion: 1,
            resolution: built.resolution,
            designSystem: built.designSystem,
            screens: built.screens
        };
        this.selection = [];
        this.updateScreenList();
        const nextScreen = this.data.screens[this.activeScreen] ? this.activeScreen : Object.keys(this.data.screens)[0];
        this.switchScreen(nextScreen);
        this.markDirty();
        this.closeTemplatesModal();
        this._toast(`Applied Kit: ${kit.name}`);
    }

    applyScreenPreset(presetId, themeId, createNew = false) {
        const T = window.RedglitchUITemplates;
        const preset = T?.SCREEN_PRESETS.find(p => p.id === presetId);
        if (!preset) return;
        this.pushUndo();
        const screenObj = preset.build(themeId, this.resolution);
        let targetId = this.activeScreen || preset.id;
        if (createNew) {
            targetId = preset.id;
            let idx = 2;
            while (this.data.screens[targetId]) {
                targetId = `${preset.id}_${idx++}`;
            }
        }
        this.data.screens[targetId] = screenObj;
        this.selection = [];
        this.updateScreenList();
        this.switchScreen(targetId);
        this.markDirty();
        this.closeTemplatesModal();
        this._toast(`${createNew ? 'Added' : 'Applied'} ${preset.name} -> ${targetId}`);
    }

    _toast(msg) {
        const el = document.createElement('div');
        el.className = 'save-indicator';
        el.innerHTML = `<i class="fas fa-check"></i> ${_escapeHtml(msg)}`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2500);
    }

    // ═══════════════════════════════════════
    // PREVIEW MODE (Live UIRenderer)
    // ═══════════════════════════════════════
    togglePreview() {
        let overlay = document.getElementById('menu-preview-overlay');
        if (overlay) {
            if (typeof this._closePreview === 'function') this._closePreview();
            else { overlay.remove(); this._previewOn = false; }
            return;
        }
        const screens = this.data?.screens || {};
        const ids = Object.keys(screens);
        if (!ids.length) { alert('No screens to preview.'); return; }
        this._previewScreen = (this.activeScreen && screens[this.activeScreen]) ? this.activeScreen : ids[0];

        const maxW = Math.max(360, window.innerWidth * 0.86);
        const maxH = Math.max(240, window.innerHeight * 0.78);
        const scale = Math.min(maxW / this.resolution.w, maxH / this.resolution.h, 1.15);
        const boxW = Math.round(this.resolution.w * scale);
        const boxH = Math.round(this.resolution.h * scale);

        overlay = document.createElement('div');
        overlay.id = 'menu-preview-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(4,6,12,0.92);z-index:10060;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;';

        const bar = document.createElement('div');
        bar.style.cssText = `width:${boxW}px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#e2e8f0;font-size:12px;`;
        const pillsWrap = document.createElement('div');
        pillsWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
        const closeBtn = document.createElement('button');
        closeBtn.id = 'menu-preview-close';
        closeBtn.textContent = 'ESC / CLOSE';
        closeBtn.style.cssText = 'background:#1e293b;color:#f8fafc;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:700;';
        bar.appendChild(pillsWrap);
        bar.appendChild(closeBtn);

        const stageWrap = document.createElement('div');
        stageWrap.style.cssText = `position:relative;width:${boxW}px;height:${boxH}px;background:radial-gradient(circle at 50% 35%, #162033 0%, #070a12 75%);border:1px solid rgba(73,227,255,0.4);border-radius:4px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.8);`;
        const stage = document.createElement('div');
        stage.className = 'preview-stage';
        stage.style.cssText = `position:relative;width:${this.resolution.w}px;height:${this.resolution.h}px;transform:scale(${scale});transform-origin:top left;font-family:'VT323',monospace;image-rendering:pixelated;`;
        stageWrap.appendChild(stage);

        overlay.appendChild(bar);
        overlay.appendChild(stageWrap);
        document.body.appendChild(overlay);
        this._previewOn = true;

        const sampleState = {
            player: { level: 7, hp: 74, maxHp: 100, mana: 52, maxMana: 100, stamina: 84, maxStamina: 100, coins: 1340, xp: 4820, inventory: [null, null, null, null, null, null, null, null] },
            settings: { volume: 80 },
            gameTimeFormatted: '04:21',
            USERNAME: 'DEV_TESTER'
        };

        const renderPreview = () => {
            pillsWrap.innerHTML = '';
            ids.forEach(sid => {
                const pill = document.createElement('button');
                pill.textContent = sid;
                const active = sid === this._previewScreen;
                pill.style.cssText = `padding:4px 9px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid ${active ? '#22d3ee' : 'rgba(255,255,255,0.14)'};background:${active ? 'rgba(34,211,238,0.18)' : '#0f172a'};color:${active ? '#67e8f9' : '#94a3b8'};`;
                pill.onclick = () => { this._previewScreen = sid; renderPreview(); };
                pillsWrap.appendChild(pill);
            });

            stage.innerHTML = '';
            const activeSc = screens[this._previewScreen] || { elements: [] };
            const ctx = {
                resolution: this.resolution,
                ignoreConditions: true,
                player: sampleState.player,
                variables: sampleState,
                state: sampleState,
                onClick: (script) => {
                    if (script && script.startsWith('navigate:')) {
                        const tgt = script.slice(9).trim();
                        if (screens[tgt]) {
                            this._previewScreen = tgt;
                            renderPreview();
                        }
                    } else if (script === 'RESUME_GAME' || script === 'CLOSE_MENU') {
                        if (screens.main_hud) {
                            this._previewScreen = 'main_hud';
                            renderPreview();
                        }
                    }
                }
            };
            if (window.UIRenderer) {
                if (activeSc.background === true && this._previewScreen !== 'main_hud' && screens.main_hud) {
                    window.UIRenderer.render(screens.main_hud, stage, ctx);
                }
                window.UIRenderer.render(activeSc, stage, ctx);
            }
        };
        renderPreview();

        const onEscape = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePreview();
            }
        };
        const closePreview = () => {
            if (overlay.parentNode) overlay.remove();
            this._previewOn = false;
            this._closePreview = null;
            window.removeEventListener('keydown', onEscape, true);
        };
        this._closePreview = closePreview;

        closeBtn.onclick = closePreview;
        overlay.onclick = (e) => { if (e.target === overlay) closePreview(); };
        window.addEventListener('keydown', onEscape, true);
    }
}

// ═══════════════════════════════════════════
// Boot
// ═══════════════════════════════════════════
window.studio = new UIStudio();

// Listen for global save
if (window.parent && window.parent.RedglitchEventBus) {
    window.parent.RedglitchEventBus.on('system:global_save', () => {
        if (window.studio && window.studio.dirty) {
            window.studio.save();
        }
    });
}
