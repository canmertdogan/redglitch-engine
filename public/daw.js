/**
 * KETEBE AUDIO DIRECTOR PRO - ULTRA HD (v7.0)
 * Expanded authoring workflows, diagnostics, preview simulation, and mixer control.
 */

const DEFAULT_EVENT_PLAYBACK = {
    mode: 'random',
    volume: 1.0,
    volumeVar: 0.1,
    pitchVar: 0.05,
    cooldown: 0.1,
    fadeIn: 0.0,
    fadeOut: 0.0
};

const DEFAULT_EVENT_FILTER = {
    type: 'lowpass',
    freq: 2000
};

const DEFAULT_BUSES = {
    master: { gain: 1.0 },
    music: { gain: 0.7, parent: 'master', ducking: true },
    sfx: { gain: 0.9, parent: 'master' },
    ambience: { gain: 0.6, parent: 'master', ducking: true },
    voice: { gain: 0.9, parent: 'master' }
};

const EVENT_PRESETS = {
    sfx_punch: {
        group: 'sfx',
        playback: { mode: 'random', volume: 1.0, volumeVar: 0.15, pitchVar: 0.08, cooldown: 0.08, fadeIn: 0, fadeOut: 0 }
    },
    ui_micro: {
        group: 'sfx',
        playback: { mode: 'random', volume: 0.8, volumeVar: 0.02, pitchVar: 0.02, cooldown: 0.03, fadeIn: 0, fadeOut: 0 }
    },
    ambience_loop: {
        group: 'ambience',
        playback: { mode: 'loop', volume: 0.65, volumeVar: 0.03, pitchVar: 0.02, cooldown: 0, fadeIn: 0.5, fadeOut: 0.5 }
    },
    music_layer: {
        group: 'music',
        playback: { mode: 'loop', volume: 0.8, volumeVar: 0, pitchVar: 0, cooldown: 0, fadeIn: 0.7, fadeOut: 0.7 }
    },
    voice_dialogue: {
        group: 'voice',
        playback: { mode: 'sequential', volume: 1.0, volumeVar: 0, pitchVar: 0.01, cooldown: 0.05, fadeIn: 0, fadeOut: 0.05 }
    }
};

class AudioDirectorUltraHD {
    constructor() {
        this.audioMap = { events: {}, buses: {} };
        this.availableAssets = [];
        this.activeEventId = null;
        this.triggerHistory = [];
        this.activeExplorerTab = 'events';

        this.explorerSearch = '';
        this.assetSearch = '';
        this.categoryFilter = 'all';
        this.mappedOnly = false;
        this.isDirty = false;
        this.lastSavedAt = null;
        this.autoSaveEnabled = false;
        this.autoSaveIntervalMs = 30000;
        this.autoSaveTimer = null;

        this.historyStack = [];
        this.futureStack = [];
        this.maxHistoryEntries = 80;

        this.knobDrag = null;
        this.faderDrag = null;
        this.pendingDragDirty = false;

        this.busUiState = {};
        this.previewRunner = { mode: null, timer: null, step: 0 };
        this.loadedManifest = null;
        this.sidebarState = { left: false, right: false };

        try {
            const savedSidebarState = JSON.parse(localStorage.getItem('daw_sidebar_state') || '{}');
            this.sidebarState.left = !!savedSidebarState.left;
            this.sidebarState.right = !!savedSidebarState.right;
        } catch (e) {
            console.warn('[AudioPro:V7] Failed to restore sidebar state', e);
        }

        this.init();
    }

    async init() {
        console.log('%c[AudioDirector:V7] Booting Expanded Feature Set...', 'color:#f1c40f;font-weight:900;');
        await this.loadData();
        this.normalizeMap();
        this.ensureBusUiState();
        this.bindStaticUI();
        this.setupEventListeners();
        this.recordHistory(false);
        this.renderAll();
        this.applySidebarState();
        this.populateCategoryFilter();
        this.updateStatusBadges();
        this.updateConnectionStatus('KERNEL_ACTIVE: EXTENDED_MODE_READY');
        this.startAutoSaveLoop();
        requestAnimationFrame(() => this.meterLoop());
    }

    async loadData() {
        try {
            const [mapRes, assetRes] = await Promise.all([
                fetch('/api/audio/map'),
                fetch('/api/assets?type=audio')
            ]);

            if (mapRes.ok) {
                this.audioMap = await mapRes.json();
            }

            if (assetRes.ok) {
                const data = await assetRes.json();
                this.availableAssets = (data || []).map(a => a.id || a.name || a);
            }

            this.loadedManifest = window.ENGINE_AUDIO_MANIFEST || {};
            Object.values(this.loadedManifest).flat().forEach(ev => {
                if (!this.audioMap.events[ev.id]) {
                    this.audioMap.events[ev.id] = this.makeDefaultEventConfig();
                }
            });
        } catch (e) {
            console.error('[AudioPro:V7] loadData failed', e);
        }
    }

    makeDefaultEventConfig(group = 'sfx') {
        return {
            group,
            clips: [],
            priority: false,
            reverb: 0,
            filter: { ...DEFAULT_EVENT_FILTER },
            playback: { ...DEFAULT_EVENT_PLAYBACK },
            clipMeta: {}
        };
    }

    normalizeMap() {
        const normalizedEvents = {};
        Object.entries(this.audioMap.events || {}).forEach(([eventId, rawCfg]) => {
            const cfg = rawCfg || {};
            const clips = Array.isArray(cfg.clips) ? [...cfg.clips] : [];
            const clipMeta = cfg.clipMeta && typeof cfg.clipMeta === 'object' ? { ...cfg.clipMeta } : {};

            clips.forEach(clip => {
                if (!clipMeta[clip]) {
                    clipMeta[clip] = { weight: 1, gain: 1, start: 0, end: 1 };
                }
            });

            normalizedEvents[eventId] = {
                group: cfg.group || 'sfx',
                clips,
                priority: !!cfg.priority,
                reverb: typeof cfg.reverb === 'number' ? cfg.reverb : 0,
                filter: {
                    type: cfg.filter?.type || DEFAULT_EVENT_FILTER.type,
                    freq: typeof cfg.filter?.freq === 'number' ? cfg.filter.freq : DEFAULT_EVENT_FILTER.freq
                },
                playback: {
                    mode: cfg.playback?.mode || DEFAULT_EVENT_PLAYBACK.mode,
                    volume: typeof cfg.playback?.volume === 'number' ? cfg.playback.volume : DEFAULT_EVENT_PLAYBACK.volume,
                    volumeVar: typeof cfg.playback?.volumeVar === 'number' ? cfg.playback.volumeVar : DEFAULT_EVENT_PLAYBACK.volumeVar,
                    pitchVar: typeof cfg.playback?.pitchVar === 'number' ? cfg.playback.pitchVar : DEFAULT_EVENT_PLAYBACK.pitchVar,
                    cooldown: typeof cfg.playback?.cooldown === 'number' ? cfg.playback.cooldown : DEFAULT_EVENT_PLAYBACK.cooldown,
                    fadeIn: typeof cfg.playback?.fadeIn === 'number' ? cfg.playback.fadeIn : DEFAULT_EVENT_PLAYBACK.fadeIn,
                    fadeOut: typeof cfg.playback?.fadeOut === 'number' ? cfg.playback.fadeOut : DEFAULT_EVENT_PLAYBACK.fadeOut
                },
                clipMeta
            };
        });
        this.audioMap.events = normalizedEvents;

        const normalizedBuses = { ...DEFAULT_BUSES };
        Object.entries(this.audioMap.buses || {}).forEach(([name, bus]) => {
            normalizedBuses[name] = {
                gain: typeof bus.gain === 'number' ? bus.gain : 1.0,
                parent: bus.parent || (name === 'master' ? undefined : 'master'),
                ducking: !!bus.ducking
            };
        });
        this.audioMap.buses = normalizedBuses;

        if (!this.activeEventId) {
            this.activeEventId = Object.keys(this.audioMap.events)[0] || null;
        } else if (!this.audioMap.events[this.activeEventId]) {
            this.activeEventId = Object.keys(this.audioMap.events)[0] || null;
        }
    }

    ensureBusUiState() {
        Object.keys(this.audioMap.buses).forEach(name => {
            if (!this.busUiState[name]) this.busUiState[name] = { muted: false, solo: false };
        });
    }

    bindStaticUI() {
        const byId = (id) => document.getElementById(id);
        const searchInput = byId('event-search');
        const assetSearchInput = byId('asset-search');
        const categoryFilter = byId('category-filter');
        const mappedOnly = byId('mapped-only');
        const quickEventInput = byId('quick-event-id');
        const quickEventBtn = byId('quick-event-create');
        const autoSaveToggle = byId('auto-save-toggle');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.explorerSearch = e.target.value.toLowerCase();
                this.renderExplorer();
            });
        }

        if (assetSearchInput) {
            assetSearchInput.addEventListener('input', (e) => {
                this.assetSearch = e.target.value.toLowerCase();
                if (this.activeExplorerTab === 'assets') this.renderExplorer();
            });
        }

        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.categoryFilter = e.target.value;
                this.renderExplorer();
            });
        }

        if (mappedOnly) {
            mappedOnly.addEventListener('change', (e) => {
                this.mappedOnly = !!e.target.checked;
                this.renderExplorer();
            });
        }

        if (quickEventBtn) {
            quickEventBtn.addEventListener('click', () => this.createQuickEvent());
        }

        if (quickEventInput) {
            quickEventInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.createQuickEvent();
            });
        }

        if (autoSaveToggle) {
            autoSaveToggle.addEventListener('change', (e) => {
                this.autoSaveEnabled = !!e.target.checked;
                this.updateConnectionStatus(this.autoSaveEnabled ? 'AUTOSAVE_ENABLED' : 'AUTOSAVE_DISABLED');
            });
        }
    }

    setupEventListeners() {
        if (window.KetebeEventBus) {
            window.KetebeEventBus.on('audio:trigger', (event) => {
                this.addHistoryEntry(event.data?.name || 'unknown:event', event.data?.clip);
            });
        }

        window.addEventListener('mousemove', (e) => this.handleGlobalMove(e));
        window.addEventListener('mouseup', () => this.handleGlobalUp());
        window.addEventListener('keydown', (e) => this.handleKeyboardShortcut(e));
    }

    handleKeyboardShortcut(e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        const key = e.key.toLowerCase();
        if (key === 's') {
            e.preventDefault();
            this.saveMap();
            return;
        }
        if (key === 'z') {
            e.preventDefault();
            this.undo();
            return;
        }
        if (key === 'y') {
            e.preventDefault();
            this.redo();
        }
    }

    startAutoSaveLoop() {
        if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
        this.autoSaveTimer = setInterval(() => {
            if (!this.autoSaveEnabled || !this.isDirty) return;
            this.saveMap({ silent: true, source: 'autosave' });
        }, this.autoSaveIntervalMs);
    }

    updateConnectionStatus(text) {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) statusEl.textContent = `>> ${text}`;
    }

    async saveMap(options = {}) {
        try {
            const res = await fetch('/api/audio/map', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.audioMap)
            });
            if (!res.ok) {
                this.updateConnectionStatus('SYNC_FAILED');
                return;
            }

            if (window.KetebeEventBus) window.KetebeEventBus.emit('audio:map_updated', this.audioMap);
            this.isDirty = false;
            this.lastSavedAt = Date.now();
            this.updateStatusBadges();
            this.updateConnectionStatus(options.source === 'autosave' ? 'AUTOSAVE_OK' : 'ENGINE_SYNC_OK');
            if (!options.silent) console.log('[AudioPro:V7] Map synced');
        } catch (e) {
            console.error('[AudioPro:V7] saveMap failed', e);
            this.updateConnectionStatus('SYNC_FAILURE');
        }
    }

    recordHistory(markDirty = true) {
        const snap = JSON.stringify(this.audioMap);
        if (this.historyStack[this.historyStack.length - 1] !== snap) {
            this.historyStack.push(snap);
            if (this.historyStack.length > this.maxHistoryEntries) this.historyStack.shift();
            this.futureStack = [];
        }
        if (markDirty) this.isDirty = true;
        this.updateStatusBadges();
    }

    undo() {
        if (this.historyStack.length < 2) return;
        const current = this.historyStack.pop();
        this.futureStack.push(current);
        const prev = this.historyStack[this.historyStack.length - 1];
        this.audioMap = JSON.parse(prev);
        this.normalizeMap();
        this.ensureBusUiState();
        this.isDirty = true;
        this.renderAll();
        this.updateStatusBadges();
        this.updateConnectionStatus('UNDO_APPLIED');
    }

    redo() {
        if (this.futureStack.length === 0) return;
        const next = this.futureStack.pop();
        this.historyStack.push(next);
        this.audioMap = JSON.parse(next);
        this.normalizeMap();
        this.ensureBusUiState();
        this.isDirty = true;
        this.renderAll();
        this.updateStatusBadges();
        this.updateConnectionStatus('REDO_APPLIED');
    }

    renderAll() {
        this.renderExplorer();
        this.renderWorkspace();
        this.renderInspector();
        this.renderMixer();
        this.applySidebarState();
        this.updateStatusBadges();
    }

    toggleSidebar(side) {
        if (side !== 'left' && side !== 'right') return;
        this.sidebarState[side] = !this.sidebarState[side];
        localStorage.setItem('daw_sidebar_state', JSON.stringify(this.sidebarState));
        this.applySidebarState();
    }

    applySidebarState() {
        const left = document.getElementById('left-explorer');
        const right = document.getElementById('right-inspector');
        const leftBtn = document.getElementById('toggle-left-sidebar');
        const rightBtn = document.getElementById('toggle-right-sidebar');
        const leftHandle = document.getElementById('left-sidebar-handle');
        const rightHandle = document.getElementById('right-sidebar-handle');

        if (left) left.classList.toggle('sidebar-hidden', this.sidebarState.left);
        if (right) right.classList.toggle('sidebar-hidden', this.sidebarState.right);

        if (leftBtn) {
            leftBtn.textContent = this.sidebarState.left ? 'SHOW LEFT' : 'HIDE LEFT';
            leftBtn.classList.toggle('is-collapsed', this.sidebarState.left);
        }
        if (rightBtn) {
            rightBtn.textContent = this.sidebarState.right ? 'SHOW RIGHT' : 'HIDE RIGHT';
            rightBtn.classList.toggle('is-collapsed', this.sidebarState.right);
        }
        if (leftHandle) {
            leftHandle.textContent = this.sidebarState.left ? '▶' : '◀';
            leftHandle.classList.toggle('docked', !this.sidebarState.left);
        }
        if (rightHandle) {
            rightHandle.textContent = this.sidebarState.right ? '◀' : '▶';
            rightHandle.classList.toggle('docked', !this.sidebarState.right);
        }
    }

    switchExplorer(tab) {
        this.activeExplorerTab = tab;
        const btns = document.querySelectorAll('.tab-btn-v6');
        btns.forEach(b => b.classList.remove('active'));
        const activeIdx = tab === 'events' ? 0 : (tab === 'assets' ? 1 : 2);
        if (btns[activeIdx]) btns[activeIdx].classList.add('active');

        const eventSearchWrap = document.getElementById('event-search-wrap');
        const assetSearchWrap = document.getElementById('asset-search-wrap');
        if (eventSearchWrap) eventSearchWrap.style.display = tab === 'events' ? 'block' : 'none';
        if (assetSearchWrap) assetSearchWrap.style.display = tab === 'assets' ? 'block' : 'none';

        this.renderExplorer();
    }

    populateCategoryFilter() {
        const select = document.getElementById('category-filter');
        if (!select) return;
        const categories = Object.keys(this.loadedManifest || {});
        const existing = new Set(Array.from(select.options).map(o => o.value));
        categories.forEach(category => {
            if (existing.has(category)) return;
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
    }

    renderExplorer() {
        const container = document.getElementById('explorer-tree');
        if (!container) return;
        container.innerHTML = '';

        if (this.activeExplorerTab === 'events') {
            this.renderManifestTree();
            return;
        }

        if (this.activeExplorerTab === 'assets') {
            this.renderAssetsGrid();
            return;
        }

        container.innerHTML = `
            <div class="template-card">
                <div class="template-title">CLOUD_TEMPLATE_BANK</div>
                <div class="template-desc">Premium packs are simulated locally in this build.</div>
                <button class="btn-v6" onclick="pro.bootstrapTemplate()">APPLY_CORE_PACK</button>
            </div>
        `;
    }

    getManifestEntries() {
        const entries = [];
        Object.entries(this.loadedManifest || {}).forEach(([category, events]) => {
            (events || []).forEach(ev => {
                entries.push({ category, id: ev.id, desc: ev.desc || '' });
            });
        });
        return entries;
    }

    renderManifestTree() {
        const container = document.getElementById('explorer-tree');
        if (!container) return;

        const manifest = this.loadedManifest || {};
        const search = this.explorerSearch || '';
        const categoryFilter = this.categoryFilter;
        const mappedOnly = this.mappedOnly;

        Object.entries(manifest).forEach(([category, events]) => {
            if (categoryFilter !== 'all' && category !== categoryFilter) return;

            const visibleEvents = (events || []).filter(ev => {
                const config = this.audioMap.events[ev.id];
                const isMapped = !!(config?.clips?.length);
                const text = `${ev.id} ${ev.desc || ''}`.toLowerCase();
                if (search && !text.includes(search)) return false;
                if (mappedOnly && !isMapped) return false;
                return true;
            });

            if (visibleEvents.length === 0) return;

            const header = document.createElement('div');
            header.className = 'tree-item-v6 tree-category';
            header.innerHTML = `<i class="fas fa-folder"></i> ${category} <span class="tree-count">${visibleEvents.length}</span>`;
            container.appendChild(header);

            visibleEvents.forEach(ev => {
                const item = document.createElement('div');
                const config = this.audioMap.events[ev.id];
                const isMapped = !!(config?.clips?.length);
                item.className = `tree-item-v6 ${this.activeEventId === ev.id ? 'active' : ''}`;
                item.style.paddingLeft = '30px';
                item.innerHTML = `
                    <div class="tree-main">
                        <span><i class="fas ${isMapped ? 'fa-bolt' : 'fa-circle'} tree-icon"></i> ${ev.id}</span>
                        <span class="tree-tags">${isMapped ? `${config.clips.length} clip` : 'unmapped'}</span>
                    </div>
                    <div class="tree-sub">${ev.desc || 'No description'}</div>
                `;
                item.onclick = () => this.selectEvent(ev.id);
                container.appendChild(item);
            });
        });
    }

    renderAssetsGrid() {
        const container = document.getElementById('explorer-tree');
        if (!container) return;
        const search = this.assetSearch || '';

        const assets = this.availableAssets.filter(asset => asset.toLowerCase().includes(search));
        if (assets.length === 0) {
            container.innerHTML = '<div class="empty-note">No assets match current filter.</div>';
            return;
        }

        assets.forEach(asset => {
            const item = document.createElement('div');
            item.className = 'tree-item-v6';
            item.draggable = true;
            item.innerHTML = `
                <div class="tree-main">
                    <span><i class="fas fa-file-audio tree-icon"></i> ${asset}</span>
                    <span class="tree-tags">drag/link</span>
                </div>
            `;
            item.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', asset);
                e.dataTransfer.effectAllowed = 'copy';
            };
            item.onmousedown = () => window.Sound?.playEvent(asset, { direct: true });
            item.ondblclick = () => {
                if (!this.activeEventId) return;
                this.addClip(this.activeEventId, asset);
            };
            container.appendChild(item);
        });
    }

    renderWorkspace() {
        const empty = document.getElementById('empty-state');
        const view = document.getElementById('event-editor-view');
        const pathLabel = document.getElementById('active-event-path');
        const scenarioState = document.getElementById('scenario-state');

        if (!this.activeEventId || !this.audioMap.events[this.activeEventId]) {
            if (empty) empty.classList.remove('hidden');
            if (view) view.classList.add('hidden');
            if (pathLabel) pathLabel.textContent = 'IDLE';
            if (scenarioState) scenarioState.textContent = 'preview: idle';
            return;
        }

        if (empty) empty.classList.add('hidden');
        if (view) view.classList.remove('hidden');
        if (pathLabel) pathLabel.textContent = `VFS://AUDIO/STREAMS/${this.activeEventId.toUpperCase()}`;
        if (scenarioState) scenarioState.textContent = this.previewRunner.mode ? `preview: ${this.previewRunner.mode}` : 'preview: idle';

        const config = this.audioMap.events[this.activeEventId];
        const nameEl = document.getElementById('view-event-name');
        const groupEl = document.getElementById('view-event-group');
        if (nameEl) nameEl.textContent = this.activeEventId;
        if (groupEl) groupEl.textContent = (config.group || 'sfx').toUpperCase() + '_BUS';

        const stack = document.getElementById('variation-stack');
        if (stack) {
            stack.innerHTML = (config.clips || []).map((clip, idx) => {
                const meta = config.clipMeta?.[clip] || { weight: 1, gain: 1 };
                return `
                    <div class="variation-row" style="background: #000; border: 1px solid var(--border-premium); padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; box-shadow: 2px 2px 0 rgba(0,0,0,0.5);">
                        <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                            <i class="fas fa-file-audio" style="color:var(--gold); opacity: 0.6;"></i>
                            <div style="min-width:0;">
                                <div class="clip-name" style="font-size: 15px; font-weight: bold; color: #fff;">${clip}</div>
                                <div class="clip-meta" style="font-size: 11px; color: var(--text-dim); letter-spacing: 1px;">WEIGHT: ${(meta.weight || 1).toFixed(2)} | GAIN: ${(meta.gain || 1).toFixed(2)}</div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <button class="btn-icon-small" title="Audition clip" onclick="pro.auditionClip('${this.activeEventId}', '${clip}')" style="background: #111; border: 1px solid #333; color: var(--gold); padding: 4px 8px; cursor: pointer;"><i class="fas fa-play"></i></button>
                            <button class="btn-icon-small" title="Set weight" onclick="pro.setClipWeight('${this.activeEventId}', '${clip}')" style="background: #111; border: 1px solid #333; color: #aaa; padding: 4px 8px; cursor: pointer;"><i class="fas fa-balance-scale"></i></button>
                            <button class="btn-icon-small danger" title="Remove clip" onclick="pro.removeClip('${this.activeEventId}', ${idx})" style="background: #111; border: 1px solid #333; color: var(--danger); padding: 4px 8px; cursor: pointer;"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (config.clips && config.clips.length > 0) {
            this.drawWaveform(config.clips[0]);
        } else {
            this.clearWaveform();
        }
    }

    renderInspector() {
        const content = document.getElementById('inspector-pane-content');
        const empty = document.getElementById('inspector-empty');
        if (!content || !empty) return;

        if (!this.activeEventId || !this.audioMap.events[this.activeEventId]) {
            empty.classList.remove('hidden');
            content.classList.add('hidden');
            return;
        }

        const config = this.audioMap.events[this.activeEventId];
        const missingForEvent = (config.clips || []).filter(clip => !this.availableAssets.includes(clip));
        const desc = this.getManifestDescription(this.activeEventId);

        empty.classList.add('hidden');
        content.classList.remove('hidden');
        content.innerHTML = `
            <div class="inspector-block" style="border-bottom: 2px solid #000; padding-bottom: 16px;">
                <div class="inspector-title" style="font-size: 14px; opacity: 0.6; letter-spacing: 2px; margin-bottom: 8px;">EVENT_IDENTITY</div>
                <div style="font-size: 20px; color: var(--gold); font-weight: bold; margin-bottom: 4px; text-shadow: 2px 2px 0 #000;">${this.activeEventId}</div>
                <div class="inspector-help" style="font-size: 12px; color: #666; line-height: 1.4;">${desc || 'No manifest description available'}</div>
            </div>

            <div class="inspector-block" style="padding-top: 16px;">
                <div class="inspector-title" style="font-size: 13px; color: var(--gold); margin-bottom: 12px; letter-spacing: 1px;">ROUTING_&_MIX</div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <select onchange="pro.updateActiveEvent('group', this.value)" class="glass-panel inspector-input" style="background: #000; border: 1px solid #333; color: #fff;">
                        <option value="sfx" ${config.group === 'sfx' ? 'selected' : ''}>SFX_CORE</option>
                        <option value="music" ${config.group === 'music' ? 'selected' : ''}>MUSIC_ORCHESTRA</option>
                        <option value="ambience" ${config.group === 'ambience' ? 'selected' : ''}>ENV_AMBIENCE</option>
                        <option value="voice" ${config.group === 'voice' ? 'selected' : ''}>VOICE_OVER</option>
                    </select>
                    <label class="inline-toggle" style="font-size: 12px; color: #888;"><input type="checkbox" ${config.priority ? 'checked' : ''} onchange="pro.updateActiveEvent('priority', this.checked)"> ENABLE_SIDECHAIN_DUCKING</label>
                </div>
            </div>

            <div class="inspector-block" style="padding-top: 16px;">
                <div class="inspector-title" style="font-size: 13px; color: var(--gold); margin-bottom: 12px; letter-spacing: 1px;">PLAYBACK_ENGINE</div>
                <div class="inspector-grid" style="margin-bottom: 12px;">
                    <div>
                        <label style="font-size: 11px; color: #555;">MODE</label>
                        <select onchange="pro.updateActiveEvent('playback.mode', this.value)" class="glass-panel inspector-input" style="background: #000; border: 1px solid #333;">
                            <option value="random" ${config.playback.mode === 'random' ? 'selected' : ''}>RANDOM</option>
                            <option value="sequential" ${config.playback.mode === 'sequential' ? 'selected' : ''}>SEQUENTIAL</option>
                            <option value="loop" ${config.playback.mode === 'loop' ? 'selected' : ''}>LOOP</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #555;">FILTER</label>
                        <select onchange="pro.updateActiveEvent('filter.type', this.value)" class="glass-panel inspector-input" style="background: #000; border: 1px solid #333;">
                            <option value="lowpass" ${config.filter.type === 'lowpass' ? 'selected' : ''}>LOWPASS</option>
                            <option value="highpass" ${config.filter.type === 'highpass' ? 'selected' : ''}>HIGHPASS</option>
                            <option value="bandpass" ${config.filter.type === 'bandpass' ? 'selected' : ''}>BANDPASS</option>
                        </select>
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888;"><span>VOLUME</span><span>${Math.round(config.playback.volume * 100)}%</span></div>
                        <input type="range" min="0" max="2" step="0.01" value="${config.playback.volume}" oninput="pro.updateActiveEvent('playback.volume', parseFloat(this.value), true)" style="width: 100%;">
                    </div>
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888;"><span>VOL_VARIATION</span><span>${Math.round(config.playback.volumeVar * 100)}%</span></div>
                        <input type="range" min="0" max="0.5" step="0.01" value="${config.playback.volumeVar}" oninput="pro.updateActiveEvent('playback.volumeVar', parseFloat(this.value), true)" style="width: 100%;">
                    </div>
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888;"><span>PITCH_VARIATION</span><span>${Math.round(config.playback.pitchVar * 100)}%</span></div>
                        <input type="range" min="0" max="0.5" step="0.01" value="${config.playback.pitchVar}" oninput="pro.updateActiveEvent('playback.pitchVar', parseFloat(this.value), true)" style="width: 100%;">
                    </div>
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #888;"><span>COOLDOWN</span><span>${config.playback.cooldown.toFixed(2)}s</span></div>
                        <input type="range" min="0" max="1" step="0.01" value="${config.playback.cooldown}" oninput="pro.updateActiveEvent('playback.cooldown', parseFloat(this.value), true)" style="width: 100%;">
                    </div>
                </div>
            </div>

            <div class="inspector-block" style="padding-top: 16px; border-top: 1px solid #222; margin-top: 16px;">
                <div class="inspector-title" style="font-size: 13px; color: var(--gold); margin-bottom: 12px; letter-spacing: 1px;">TRIGGER_HISTORY</div>
                <div id="trigger-history" class="trigger-history" style="height: 140px; border: 1px solid #222; background: #000; box-shadow: inset 2px 2px 0 #000;"></div>
            </div>
        `;

        this.renderHistoryPanel();
    }

    renderHistoryPanel() {
        const log = document.getElementById('trigger-history');
        if (!log) return;
        log.innerHTML = this.triggerHistory.map(h => `
            <div class="history-row">
                <span style="color:var(--gold);">> ${h.name}</span>
                <span style="color:#444; font-size:10px;">${h.time}</span>
            </div>
        `).join('');
    }

    renderMixer() {
        const container = document.getElementById('mixer-lanes');
        if (!container) return;
        container.innerHTML = '';

        Object.entries(this.audioMap.buses).forEach(([name, bus]) => {
            const ui = this.busUiState[name] || { muted: false, solo: false };
            const strip = document.createElement('div');
            strip.className = `mixer-v6-strip ${name === 'master' ? 'master' : ''}`;
            strip.style.background = '#000';
            strip.style.border = `1px solid ${name === 'master' ? 'var(--gold)' : 'var(--border-premium)'}`;
            strip.style.boxShadow = '2px 2px 0 rgba(0,0,0,0.5)';
            
            strip.innerHTML = `
                <div class="mixer-name" style="font-size: 11px; letter-spacing: 1px; color: ${name === 'master' ? 'var(--gold)' : 'var(--text-dim)'};">${name.toUpperCase()}</div>
                <div class="meter-v6" id="meter-${name}" style="background: #000; border: 1px solid #222; padding: 2px; height: 120px; box-shadow: inset 1px 1px 0 #000;">
                    ${Array(20).fill('<div class="seg" style="height: 4px; margin-bottom: 2px; background: #111;"></div>').join('')}
                </div>
                <div class="fader-slot" style="background: #000; border: 1px solid #222; width: 6px; height: 100px; box-shadow: inset 1px 1px 0 #000;">
                    <div class="fader-knob" id="fader-${name}" style="bottom:${Math.round((bus.gain || 0) * 100)}%; background: #222; border: 2px solid var(--gold); border-radius: 2px;" onmousedown="pro.startFaderDrag(event, '${name}')"></div>
                </div>
                <div class="mixer-percent" style="font-family: monospace; font-size: 11px; color: var(--gold);">${Math.round((bus.gain || 0) * 100)}%</div>
                ${name === 'master' ? '' : `
                    <div class="mixer-btn-row" style="display: flex; gap: 4px; margin-top: 8px;">
                        <button class="mixer-mini ${ui.muted ? 'active danger' : ''}" onclick="pro.toggleBusMute('${name}')" style="width: 24px; height: 24px; background: #111; border: 1px solid #333; color: #888; cursor: pointer; font-size: 10px;">M</button>
                        <button class="mixer-mini ${ui.solo ? 'active' : ''}" onclick="pro.toggleBusSolo('${name}')" style="width: 24px; height: 24px; background: #111; border: 1px solid #333; color: #888; cursor: pointer; font-size: 10px;">S</button>
                    </div>
                `}
            `;
            container.appendChild(strip);
        });

        this.applyMixerState();
    }

    selectEvent(id) {
        if (!this.audioMap.events[id]) this.audioMap.events[id] = this.makeDefaultEventConfig();
        this.activeEventId = id;
        this.renderAll();
    }

    createQuickEvent() {
        const input = document.getElementById('quick-event-id');
        if (!input) return;
        const id = input.value.trim();
        if (!id) return;

        if (!this.audioMap.events[id]) {
            this.audioMap.events[id] = this.makeDefaultEventConfig();
            this.recordHistory(true);
        }

        this.activeEventId = id;
        input.value = '';
        this.renderAll();
        this.updateConnectionStatus(`EVENT_CREATED: ${id}`);
    }

    getManifestDescription(eventId) {
        for (const events of Object.values(this.loadedManifest || {})) {
            const hit = (events || []).find(ev => ev.id === eventId);
            if (hit) return hit.desc;
        }
        return '';
    }

    updateActiveEvent(path, value, live = false) {
        if (!this.activeEventId || !this.audioMap.events[this.activeEventId]) return;
        const cfg = this.audioMap.events[this.activeEventId];
        const parts = path.split('.');
        if (parts.length === 1) {
            cfg[parts[0]] = value;
        } else if (parts.length === 2) {
            const [root, leaf] = parts;
            if (!cfg[root]) cfg[root] = {};
            cfg[root][leaf] = value;
        }

        this.normalizeMap();
        if (live) {
            this.isDirty = true;
            this.renderInspector();
            this.renderWorkspace();
            this.updateStatusBadges();
            return;
        }

        this.recordHistory(true);
        this.renderWorkspace();
        this.renderInspector();
    }

    addClip(eventId, clip) {
        const cfg = this.audioMap.events[eventId];
        if (!cfg || !clip) return;
        if (!cfg.clips.includes(clip)) cfg.clips.push(clip);
        if (!cfg.clipMeta) cfg.clipMeta = {};
        if (!cfg.clipMeta[clip]) cfg.clipMeta[clip] = { weight: 1, gain: 1, start: 0, end: 1 };
        this.recordHistory(true);
        this.renderWorkspace();
        this.renderInspector();
    }

    addVariationPrompt() {
        if (!this.activeEventId) return;
        const suggestion = this.availableAssets[0] || '';
        const clip = prompt('ATTACH_SIGNAL_SOURCE (filename)', suggestion);
        if (!clip) return;
        this.addClip(this.activeEventId, clip.trim());
    }

    removeClip(eventId, idx) {
        const cfg = this.audioMap.events[eventId];
        if (!cfg || !cfg.clips[idx]) return;
        const [clip] = cfg.clips.splice(idx, 1);
        if (cfg.clipMeta && cfg.clipMeta[clip]) delete cfg.clipMeta[clip];
        this.recordHistory(true);
        this.renderWorkspace();
        this.renderInspector();
    }

    setClipWeight(eventId, clip) {
        const cfg = this.audioMap.events[eventId];
        if (!cfg || !clip) return;
        if (!cfg.clipMeta) cfg.clipMeta = {};
        if (!cfg.clipMeta[clip]) cfg.clipMeta[clip] = { weight: 1, gain: 1, start: 0, end: 1 };
        const current = cfg.clipMeta[clip].weight || 1;
        const val = prompt('Set clip weight (0.1 - 5.0)', String(current));
        if (val === null) return;
        const num = Math.max(0.1, Math.min(5, parseFloat(val)));
        if (Number.isNaN(num)) return;
        cfg.clipMeta[clip].weight = num;
        this.recordHistory(true);
        this.renderWorkspace();
    }

    auditionClip(eventId, clip) {
        if (!window.Sound) return;
        window.Sound.playEvent(clip, { direct: true });
        this.addHistoryEntry(`${eventId}::clip`, clip);
    }

    triggerTest() {
        if (!this.activeEventId || !window.Sound) return;
        window.Sound.playEvent(this.activeEventId);
        this.addHistoryEntry(this.activeEventId, 'manual_test');
    }

    addHistoryEntry(name, clip) {
        this.triggerHistory.unshift({ name, clip, time: new Date().toLocaleTimeString() });
        this.triggerHistory = this.triggerHistory.slice(0, 30);
        this.renderHistoryPanel();
    }

    applyPresetFromUI() {
        const sel = document.getElementById('preset-select');
        if (!sel || !sel.value) return;
        this.applyPreset(sel.value);
    }

    applyPreset(presetKey) {
        if (!this.activeEventId || !EVENT_PRESETS[presetKey]) return;
        const preset = EVENT_PRESETS[presetKey];
        const cfg = this.audioMap.events[this.activeEventId];
        cfg.group = preset.group || cfg.group;
        cfg.playback = { ...cfg.playback, ...(preset.playback || {}) };
        this.normalizeMap();
        this.recordHistory(true);
        this.renderWorkspace();
        this.renderInspector();
        this.updateConnectionStatus(`PRESET_APPLIED: ${presetKey.toUpperCase()}`);
    }

    handleDragOver(e) {
        e.preventDefault();
        const zone = document.getElementById('drop-zone');
        if (zone) zone.classList.add('drop-active');
    }

    handleDragLeave(e) {
        e.preventDefault();
        const zone = document.getElementById('drop-zone');
        if (zone) zone.classList.remove('drop-active');
    }

    handleDrop(e) {
        e.preventDefault();
        const zone = document.getElementById('drop-zone');
        if (zone) zone.classList.remove('drop-active');
        if (!this.activeEventId) return;
        const clip = e.dataTransfer.getData('text/plain');
        if (clip) this.addClip(this.activeEventId, clip);
    }

    startKnobDrag(e, prop) {
        if (!this.activeEventId) return;
        const playback = this.audioMap.events[this.activeEventId].playback;
        this.knobDrag = {
            prop,
            startY: e.clientY,
            startVal: playback[prop] || 0
        };
        this.pendingDragDirty = false;
        document.body.style.cursor = 'ns-resize';
    }

    startFaderDrag(e, busName) {
        if (!this.audioMap.buses[busName]) return;
        this.faderDrag = {
            busName,
            startY: e.clientY,
            startVal: this.audioMap.buses[busName].gain || 0
        };
        this.pendingDragDirty = false;
        document.body.style.cursor = 'ns-resize';
    }

    handleGlobalMove(e) {
        if (this.knobDrag && this.activeEventId) {
            const cfg = this.audioMap.events[this.activeEventId];
            const dy = this.knobDrag.startY - e.clientY;
            let val = this.knobDrag.startVal + dy * 0.005;

            if (this.knobDrag.prop === 'volume') val = Math.max(0, Math.min(2.0, val));
            if (this.knobDrag.prop === 'pitchVar') val = Math.max(0, Math.min(0.5, val));
            if (this.knobDrag.prop === 'cooldown') val = Math.max(0, Math.min(1.0, val));

            cfg.playback[this.knobDrag.prop] = val;
            this.pendingDragDirty = true;
            this.isDirty = true;
            this.renderInspector();
            this.renderWorkspace();
            this.updateStatusBadges();
        }

        if (this.faderDrag) {
            const dy = this.faderDrag.startY - e.clientY;
            const val = Math.max(0, Math.min(1.2, this.faderDrag.startVal + dy * 0.01));
            this.audioMap.buses[this.faderDrag.busName].gain = val;
            this.pendingDragDirty = true;
            this.isDirty = true;
            this.renderMixer();
            this.updateStatusBadges();
        }
    }

    handleGlobalUp() {
        const wasDragging = !!(this.knobDrag || this.faderDrag);
        this.knobDrag = null;
        this.faderDrag = null;
        document.body.style.cursor = 'default';
        if (wasDragging && this.pendingDragDirty) {
            this.recordHistory(true);
            this.pendingDragDirty = false;
        }
    }

    toggleBusMute(busName) {
        if (!this.busUiState[busName]) this.busUiState[busName] = { muted: false, solo: false };
        this.busUiState[busName].muted = !this.busUiState[busName].muted;
        this.applyMixerState();
        this.renderMixer();
    }

    toggleBusSolo(busName) {
        if (!this.busUiState[busName]) this.busUiState[busName] = { muted: false, solo: false };
        this.busUiState[busName].solo = !this.busUiState[busName].solo;
        this.applyMixerState();
        this.renderMixer();
    }

    applyMixerState() {
        const hasSolo = Object.entries(this.busUiState).some(([name, state]) => name !== 'master' && state.solo);

        Object.entries(this.audioMap.buses).forEach(([name, bus]) => {
            const state = this.busUiState[name] || { muted: false, solo: false };
            let targetGain = bus.gain || 0;

            if (name !== 'master') {
                if (state.muted) targetGain = 0;
                if (hasSolo && !state.solo) targetGain = 0;
            }

            if (window.Sound?.buses?.has(name)) {
                const gainNode = window.Sound.buses.get(name);
                gainNode.gain.setTargetAtTime(targetGain, window.Sound.ctx.currentTime, 0.03);
            }
        });
    }

    resetMixer() {
        Object.entries(DEFAULT_BUSES).forEach(([name, cfg]) => {
            if (!this.audioMap.buses[name]) this.audioMap.buses[name] = {};
            this.audioMap.buses[name].gain = cfg.gain;
            this.audioMap.buses[name].parent = cfg.parent;
            this.audioMap.buses[name].ducking = !!cfg.ducking;
        });
        Object.keys(this.busUiState).forEach(name => {
            this.busUiState[name] = { muted: false, solo: false };
        });
        this.recordHistory(true);
        this.renderMixer();
        this.updateConnectionStatus('MIXER_RESET');
    }

    panicStop() {
        try {
            if (window.Sound?.activeSources) {
                window.Sound.activeSources.forEach(source => {
                    try { source.stop(0); } catch (_) {}
                });
                window.Sound.activeSources.clear();
            }
            this.stopPreviewScenario();
            this.updateConnectionStatus('PANIC_STOP_EXECUTED');
        } catch (e) {
            console.error('[AudioPro:V7] panicStop failed', e);
        }
    }

    runPreviewScenario(mode) {
        this.stopPreviewScenario();
        this.previewRunner.mode = mode;
        this.previewRunner.step = 0;

        const sequences = {
            ui: ['ui:hover', 'ui:click', 'ui:open', 'ui:close', 'ui:success', 'ui:error'],
            traversal: ['player:footstep', 'player:footstep', 'player:jump', 'player:land', 'item:pickup'],
            combat: ['enemy:alert', 'enemy:attack', 'projectile:fire', 'projectile:hit', 'enemy:hurt', 'enemy:death']
        };

        const events = sequences[mode] || sequences.ui;
        const intervalMs = mode === 'combat' ? 260 : mode === 'traversal' ? 320 : 180;

        this.previewRunner.timer = setInterval(() => {
            const eventId = events[this.previewRunner.step % events.length];
            this.previewRunner.step += 1;
            if (window.Sound) window.Sound.playEvent(eventId);
            this.addHistoryEntry(eventId, `preview:${mode}`);
        }, intervalMs);

        this.updateConnectionStatus(`PREVIEW_RUNNING: ${mode.toUpperCase()}`);
        this.renderWorkspace();
    }

    stopPreviewScenario() {
        if (this.previewRunner.timer) clearInterval(this.previewRunner.timer);
        this.previewRunner = { mode: null, timer: null, step: 0 };
        this.updateConnectionStatus('PREVIEW_STOPPED');
        this.renderWorkspace();
    }

    clearWaveform() {
        const canvas = document.getElementById('waveform-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#020202';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    async drawWaveform(clipUrl) {
        const canvas = document.getElementById('waveform-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!window.Sound) return;
        const buffer = await window.Sound.load(clipUrl);
        if (!buffer) return;

        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.35)';
        ctx.lineWidth = 1;
        ctx.moveTo(0, amp);
        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const d = data[(i * step) + j];
                if (d < min) min = d;
                if (d > max) max = d;
            }
            ctx.lineTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        ctx.stroke();
    }

    drawSpectrum() {
        const canvas = document.getElementById('waveform-canvas');
        if (!canvas || !window.Sound) return;
        const ctx = canvas.getContext('2d');
        const data = window.Sound.getSpectrumData('master');
        if (!data) return;

        const barWidth = (canvas.width / data.length) * 1.5;
        let x = 0;
        for (let i = 0; i < data.length; i++) {
            const h = (data[i] / 255) * canvas.height;
            const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - h);
            grad.addColorStop(0, 'rgba(241, 196, 15, 0.0)');
            grad.addColorStop(1, 'rgba(241, 196, 15, 0.4)');
            ctx.fillStyle = grad;
            ctx.fillRect(x, canvas.height - h, barWidth, h);
            x += barWidth + 1;
        }
    }

    meterLoop() {
        Object.keys(this.audioMap.buses || {}).forEach(name => {
            const meter = document.getElementById(`meter-${name}`);
            if (!meter) return;
            const level = window.Sound ? window.Sound.getBusLevel(name) : 0;
            const segments = meter.children;
            const onCount = Math.floor(level * 25);
            for (let i = 0; i < segments.length; i++) {
                if (i < onCount) segments[i].classList.add('active');
                else segments[i].classList.remove('active');
                if (i > 18) segments[i].classList.add('warn');
                if (i > 22) segments[i].classList.add('clip');
            }
        });

        this.drawSpectrum();
        requestAnimationFrame(() => this.meterLoop());
    }

    bootstrapTemplate() {
        if (!confirm('RESTORE_MANIFEST_DEFAULTS.EXE - Populate all engine events?')) return;
        Object.values(this.loadedManifest || {}).flat().forEach(ev => {
            if (!this.audioMap.events[ev.id]) this.audioMap.events[ev.id] = this.makeDefaultEventConfig();
        });
        this.normalizeMap();
        this.recordHistory(true);
        this.renderAll();
        this.updateConnectionStatus('BOOTSTRAP_COMPLETE');
    }

    updateStatusBadges() {
        const manifestEntries = this.getManifestEntries();
        const manifestIds = new Set(manifestEntries.map(e => e.id));
        const eventEntries = Object.entries(this.audioMap.events || {});

        const mappedCount = eventEntries.filter(([, cfg]) => (cfg.clips || []).length > 0).length;
        const unmappedManifestCount = Array.from(manifestIds).filter(id => {
            const cfg = this.audioMap.events[id];
            return !cfg || !(cfg.clips || []).length;
        }).length;

        let missingClipCount = 0;
        eventEntries.forEach(([, cfg]) => {
            (cfg.clips || []).forEach(clip => {
                if (!this.availableAssets.includes(clip)) missingClipCount += 1;
            });
        });

        const mappedEl = document.getElementById('badge-mapped');
        const unmappedEl = document.getElementById('badge-unmapped');
        const missingEl = document.getElementById('badge-missing');
        const dirtyEl = document.getElementById('badge-dirty');
        const historyEl = document.getElementById('badge-history');

        if (mappedEl) mappedEl.textContent = `mapped:${mappedCount}`;
        if (unmappedEl) unmappedEl.textContent = `unmapped:${unmappedManifestCount}`;
        if (missingEl) missingEl.textContent = `missing:${missingClipCount}`;
        if (dirtyEl) dirtyEl.textContent = this.isDirty ? 'state:dirty' : 'state:synced';
        if (historyEl) historyEl.textContent = `undo:${Math.max(0, this.historyStack.length - 1)} redo:${this.futureStack.length}`;
    }
}

window.pro = new AudioDirectorUltraHD();
window.daw = window.pro;
