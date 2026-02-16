// menu_editor.js — UI STUDIO 3.0
// Complete WYSIWYG Game UI Editor Engine

// ═══════════════════════════════════════════
// Integration bootstrap
// ═══════════════════════════════════════════
let eventBus, projectState, assetManager;
function initUIStudioIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.KetebeEventBus;
        projectState = window.KetebeProjectState;
        assetManager = window.KetebeAssetManager;
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
    bar: 'fas fa-battery-half'
};

// ═══════════════════════════════════════════
// Default element templates
// ═══════════════════════════════════════════
const ELEMENT_DEFAULTS = {
    panel: {
        rect: { x: 50, y: 50, w: 300, h: 200 },
        style: { backgroundColor: 'rgba(10,10,20,0.9)', borderColor: '#444', borderWidth: 2, color: '#fff', fontSize: 16, textAlign: 'left' },
        props: {}
    },
    label: {
        text: 'TEXT LABEL',
        rect: { x: 50, y: 50, w: 200, h: 40 },
        style: { backgroundColor: 'transparent', color: '#f1c40f', fontSize: 24, textAlign: 'left', borderWidth: 0, borderColor: 'transparent' },
        props: {}
    },
    button: {
        text: 'BUTTON',
        rect: { x: 50, y: 50, w: 140, h: 44 },
        style: { backgroundColor: '#333', color: '#f1c40f', borderWidth: 2, borderColor: '#fff', fontSize: 20, textAlign: 'center' },
        script: '',
        props: {}
    },
    image: {
        src: '',
        rect: { x: 50, y: 50, w: 120, h: 120 },
        style: { backgroundColor: 'transparent', color: '#fff', fontSize: 16, borderWidth: 0, borderColor: 'transparent', textAlign: 'left' },
        props: {}
    },
    bar: {
        text: 'HP',
        rect: { x: 50, y: 50, w: 200, h: 30 },
        style: { backgroundColor: '#000', borderWidth: 2, borderColor: '#fff', color: '#fff', fontSize: 18, textAlign: 'center' },
        props: { fillColor: '#e74c3c', variable: 'hp', maxVariable: 'maxHp' }
    }
};

class UIStudio {
    constructor() {
        // ── Data ──
        this.data = { screens: {} };
        this.activeScreen = null;
        this.dirty = false;
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

        this.loadData();
        this.setupInput();
        this.setupDragDrop();
        this.setupKeyboard();

        console.log('[UIStudio] v3.0 Ready');
    }

    // ═══════════════════════════════════════
    // DATA — Load / Save
    // ═══════════════════════════════════════
    async loadData() {
        let loaded = false;

        // Try the API endpoint first
        try {
            const res = await fetch('/api/ui-config');
            if (res.ok) {
                const json = await res.json();
                if (json && json.screens && Object.keys(json.screens).length > 0) {
                    this.data = json;
                    loaded = true;
                }
            }
        } catch (e) {}

        // Fallback: load directly from static file path
        if (!loaded) {
            try {
                const res = await fetch('/dunyalar/definitions/ui.json');
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
            if (res.ok) this.knownActions = await res.json();
        } catch (e) { this.knownActions = []; }

        if (Object.keys(this.data.screens).length === 0) {
            this.data.screens['main_hud'] = { elements: [] };
        }

        this.updateScreenList();
        const first = Object.keys(this.data.screens)[0];
        this.switchScreen(first);
        this.showLoadFeedback();
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
        this.pushUndo();
        try {
            const res = await fetch('/api/ui-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.data)
            });
            if (res.ok) {
                this.dirty = false;
                this.showSaveIndicator();
                broadcastUIUpdate('saved');
            } else {
                alert('SAVE FAILED');
            }
        } catch (e) { alert('NETWORK ERROR'); }
    }

    exportJSON() {
        const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ui-config.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    showSaveIndicator() {
        const el = document.createElement('div');
        el.className = 'save-indicator';
        el.innerHTML = '<i class="fas fa-check"></i> SAVED';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2500);
    }

    markDirty() {
        this.dirty = true;
    }

    // ═══════════════════════════════════════
    // UNDO / REDO
    // ═══════════════════════════════════════
    pushUndo() {
        this.undoStack.push(JSON.stringify(this.data));
        if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(JSON.stringify(this.data));
        this.data = JSON.parse(this.undoStack.pop());
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
        this.data = JSON.parse(this.redoStack.pop());
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

        // Apply resolution + zoom
        ab.style.width = this.resolution.w + 'px';
        ab.style.height = this.resolution.h + 'px';
        ab.style.transform = `scale(${this.scale})`;
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

    createElementDOM(data) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ui-el';
        wrapper.dataset.id = data.id;

        const r = data.rect;
        wrapper.style.left = r.x + 'px';
        wrapper.style.top = r.y + 'px';
        wrapper.style.width = r.w + 'px';
        wrapper.style.height = r.h + 'px';

        if (data.style && data.style.zIndex) wrapper.style.zIndex = data.style.zIndex;

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
            this._applyPreviewStyle(inner, s);
            inner.style.display = 'flex'; inner.style.alignItems = 'center'; inner.style.justifyContent = 'center';

            // Navigate indicator badge
            if (data.script && data.script.startsWith('navigate:')) {
                const target = data.script.substring(9);
                if (target) {
                    const badge = document.createElement('div');
                    badge.className = 'navigate-badge';
                    badge.innerHTML = `<i class="fas fa-link"></i> ${target}`;
                    wrapper.appendChild(badge);
                }
            }
        } else if (data.type === 'label') {
            inner = document.createElement('div');
            inner.className = 'preview-label';
            let text = data.text || 'LABEL';
            // Highlight data bindings
            inner.innerHTML = text.replace(/\{(\w+)\}/g, '<span style="color:#3498db;text-decoration:underline;">{$1}</span>');
            this._applyPreviewStyle(inner, s);
        } else if (data.type === 'panel') {
            inner = document.createElement('div');
            inner.className = 'preview-panel';
            this._applyPreviewStyle(inner, s);
        } else if (data.type === 'image') {
            inner = document.createElement('div');
            if (data.src) {
                inner.className = 'preview-image';
                inner.style.backgroundImage = `url('${data.src}')`;
            } else {
                inner.className = 'preview-image empty';
            }
        } else if (data.type === 'bar') {
            inner = document.createElement('div');
            inner.className = 'preview-bar';
            this._applyPreviewStyle(inner, s);

            const fill = document.createElement('div');
            fill.className = 'preview-bar-fill';
            fill.style.background = (data.props && data.props.fillColor) || '#e74c3c';
            fill.style.width = '65%'; // preview at 65%
            inner.appendChild(fill);

            const label = document.createElement('div');
            label.className = 'preview-bar-label';
            label.textContent = data.text || 'BAR';
            inner.appendChild(label);
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
        if (s.color) el.style.color = s.color;
        if (s.backgroundColor) el.style.background = s.backgroundColor;
        if (s.fontSize) el.style.fontSize = s.fontSize + 'px';
        if (s.borderWidth) el.style.borderWidth = s.borderWidth + 'px';
        if (s.borderColor) el.style.borderColor = s.borderColor;
        if (s.textAlign) el.style.textAlign = s.textAlign;
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
            node.innerHTML = `<i class="${icon}"></i> ${el.id} <span class="tree-type">${el.type}</span>`;

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
            container.innerHTML = '<div class="inspector-empty"><i class="fas fa-hand-pointer"></i><div>SELECT AN ELEMENT</div></div>';
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

        // Geometry
        const gGeo = this._addGroup(container, 'GEOMETRY');
        this._addProp(gGeo, 'X', el.rect.x, 'number', v => { this.pushUndo(); el.rect.x = v; this.markDirty(); this.renderCanvas(); });
        this._addProp(gGeo, 'Y', el.rect.y, 'number', v => { this.pushUndo(); el.rect.y = v; this.markDirty(); this.renderCanvas(); });
        this._addProp(gGeo, 'W', el.rect.w, 'number', v => { this.pushUndo(); el.rect.w = Math.max(10, v); this.markDirty(); this.renderCanvas(); });
        this._addProp(gGeo, 'H', el.rect.h, 'number', v => { this.pushUndo(); el.rect.h = Math.max(10, v); this.markDirty(); this.renderCanvas(); });

        // Bar-specific data binding
        if (el.type === 'bar') {
            const gBind = this._addGroup(container, 'DATA BINDING');
            this._addProp(gBind, 'VARIABLE', el.props?.variable || '', 'text', v => { if (!el.props) el.props = {}; el.props.variable = v; this.markDirty(); });
            this._addProp(gBind, 'MAX VAR', el.props?.maxVariable || '', 'text', v => { if (!el.props) el.props = {}; el.props.maxVariable = v; this.markDirty(); });
            this._addColorProp(gBind, 'FILL COLOR', el.props?.fillColor || '#e74c3c', v => { if (!el.props) el.props = {}; el.props.fillColor = v; this.markDirty(); this.renderCanvas(); });
        }
    }

    _renderStyleTab(container, el) {
        if (!el.style) el.style = {};

        const gColor = this._addGroup(container, 'COLORS');
        this._addColorProp(gColor, 'BACKGROUND', el.style.backgroundColor || 'transparent', v => { el.style.backgroundColor = v; this.markDirty(); this.renderCanvas(); });
        this._addColorProp(gColor, 'TEXT COLOR', el.style.color || '#ffffff', v => { el.style.color = v; this.markDirty(); this.renderCanvas(); });

        const gBorder = this._addGroup(container, 'BORDER');
        this._addProp(gBorder, 'WIDTH', parseInt(el.style.borderWidth) || 0, 'number', v => { el.style.borderWidth = v; this.markDirty(); this.renderCanvas(); });
        this._addColorProp(gBorder, 'COLOR', el.style.borderColor || 'transparent', v => { el.style.borderColor = v; this.markDirty(); this.renderCanvas(); });

        const gFont = this._addGroup(container, 'TYPOGRAPHY');
        this._addProp(gFont, 'SIZE (px)', parseInt(el.style.fontSize) || 16, 'number', v => { el.style.fontSize = v; this.markDirty(); this.renderCanvas(); });
        this._addAlignProp(gFont, el.style.textAlign || 'left', v => { el.style.textAlign = v; this.markDirty(); this.renderCanvas(); this.renderInspector(); });

        const gLayout = this._addGroup(container, 'LAYOUT');
        this._addProp(gLayout, 'Z-INDEX', parseInt(el.style.zIndex) || 0, 'number', v => { el.style.zIndex = v; this.markDirty(); this.renderCanvas(); });
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
                        hint.innerHTML = `<i class="fas fa-link"></i> This button navigates to <strong>${parsed.value}</strong>`;
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
            copy.rect.x += 20;
            copy.rect.y += 20;
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
    // ALIGNMENT
    // ═══════════════════════════════════════
    alignElements(direction) {
        if (this.selection.length < 2) return;
        this.pushUndo();
        const selected = this.selection.map(id => this.getElement(id)).filter(Boolean);

        let ref;
        switch (direction) {
            case 'left':     ref = Math.min(...selected.map(e => e.rect.x)); selected.forEach(e => e.rect.x = ref); break;
            case 'right':    ref = Math.max(...selected.map(e => e.rect.x + e.rect.w)); selected.forEach(e => e.rect.x = ref - e.rect.w); break;
            case 'top':      ref = Math.min(...selected.map(e => e.rect.y)); selected.forEach(e => e.rect.y = ref); break;
            case 'bottom':   ref = Math.max(...selected.map(e => e.rect.y + e.rect.h)); selected.forEach(e => e.rect.y = ref - e.rect.h); break;
            case 'center-h': ref = selected.reduce((s, e) => s + e.rect.x + e.rect.w / 2, 0) / selected.length; selected.forEach(e => e.rect.x = Math.round(ref - e.rect.w / 2)); break;
            case 'center-v': ref = selected.reduce((s, e) => s + e.rect.y + e.rect.h / 2, 0) / selected.length; selected.forEach(e => e.rect.y = Math.round(ref - e.rect.h / 2)); break;
        }
        this.markDirty();
        this.renderCanvas();
        this.renderInspector();
    }

    // ═══════════════════════════════════════
    // ZOOM / PAN / VIEW
    // ═══════════════════════════════════════
    setZoom(level) {
        this.scale = Math.max(0.1, Math.min(4, level));
        this.dom.artboard.style.transform = `scale(${this.scale})`;
        this.dom.zoomIndicator.textContent = Math.round(this.scale * 100) + '%';
        document.getElementById('status-zoom').textContent = `Zoom: ${Math.round(this.scale * 100)}%`;
        this.hideZoomMenu();
    }

    zoomIn() { this.setZoom(this.scale + 0.1); }
    zoomOut() { this.setZoom(this.scale - 0.1); }

    resetView() {
        this.setZoom(1.0);
        this.panOffset = { x: 0, y: 0 };
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
        this.renderCanvas();
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

        // Click on empty artboard → deselect
        ab.addEventListener('mousedown', (e) => {
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
        e.stopPropagation();

        // Check if clicking a resize handle
        const handleDir = e.target.dataset.dir;
        if (handleDir) {
            this.pushUndo();
            const el = this.getElement(data.id);
            this.dragState = {
                mode: 'resize',
                ids: [data.id],
                startX: e.clientX,
                startY: e.clientY,
                initials: { [data.id]: { ...el.rect } },
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

        // Start move drag
        this.pushUndo();
        const initials = {};
        this.selection.forEach(id => {
            const el = this.getElement(id);
            if (el) initials[id] = { ...el.rect };
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

            // Live selection update
            const elements = this.getElements();
            this.selection = elements.filter(el => {
                return el.rect.x < sx + sw && el.rect.x + el.rect.w > sx &&
                       el.rect.y < sy + sh && el.rect.y + el.rect.h > sy;
            }).map(el => el.id);

            this.renderHierarchy();
            this.renderInspector();
            return;
        }

        if (!this.dragState) return;

        const dx = (e.clientX - this.dragState.startX) / this.scale;
        const dy = (e.clientY - this.dragState.startY) / this.scale;

        if (this.dragState.mode === 'move') {
            this.dragState.moved = true;
            this.dragState.ids.forEach(id => {
                const el = this.getElement(id);
                const init = this.dragState.initials[id];
                if (!el || !init) return;

                let nx = init.x + dx;
                let ny = init.y + dy;
                if (this.snapping) {
                    nx = Math.round(nx / this.snapSize) * this.snapSize;
                    ny = Math.round(ny / this.snapSize) * this.snapSize;
                }
                el.rect.x = Math.round(nx);
                el.rect.y = Math.round(ny);
            });
            this.renderCanvas();
        }
        else if (this.dragState.mode === 'resize') {
            const id = this.dragState.ids[0];
            const el = this.getElement(id);
            const init = this.dragState.initials[id];
            if (!el || !init) return;

            const dir = this.dragState.handleDir;
            let nx = init.x, ny = init.y, nw = init.w, nh = init.h;

            // Handle direction
            if (dir.includes('r')) nw = init.w + dx;
            if (dir.includes('l')) { nw = init.w - dx; nx = init.x + dx; }
            if (dir.includes('b')) nh = init.h + dy;
            if (dir.includes('t')) { nh = init.h - dy; ny = init.y + dy; }

            // Snap
            if (this.snapping) {
                nw = Math.round(nw / this.snapSize) * this.snapSize;
                nh = Math.round(nh / this.snapSize) * this.snapSize;
                nx = Math.round(nx / this.snapSize) * this.snapSize;
                ny = Math.round(ny / this.snapSize) * this.snapSize;
            }

            // Min size
            nw = Math.max(10, nw);
            nh = Math.max(10, nh);

            el.rect = { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) };
            this.renderCanvas();
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
            if (this.dragState.moved || this.dragState.mode === 'resize') {
                this.markDirty();
            } else {
                // No actual move — undo the push
                this.undoStack.pop();
            }
            this.dragState = null;
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
            if (ctrl && e.key === 's') { e.preventDefault(); this.save(); return; }
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
            if (e.key === 'Escape') { this.clearSelection(); this.closeQuickSearch(); return; }

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
        ['panel', 'label', 'button', 'image', 'bar'].forEach(type => {
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
                <div class="search-item-icon"><i class="${item.icon}"></i></div>
                <span class="search-item-name">${item.name}</span>
                <span class="search-item-type">${item.type}</span>
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
                <div class="smc-header"><i class="fas fa-desktop"></i> ${sid}</div>
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
    // PREVIEW MODE (stub)
    // ═══════════════════════════════════════
    togglePreview() {
        alert('Preview mode coming soon — will simulate UI interactions without launching the game.');
    }
}

// ═══════════════════════════════════════════
// Boot
// ═══════════════════════════════════════════
window.studio = new UIStudio();
