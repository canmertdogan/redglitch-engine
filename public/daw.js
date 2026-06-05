/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  KETEBE AUDIO STUDIO (KAS) — AudioStudio Controller      ║
 * ║  Full rebuild of the Audio Director                       ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

// ─── CONSTANTS ──────────────────────────────────────────────

const MANIFEST = window.ENGINE_AUDIO_MANIFEST || {};

const DEFAULT_PLAYBACK = {
    mode: 'random', volume: 1.0, volumeVar: 0.05,
    pitchVar: 0.05, cooldown: 0.05, fadeIn: 0, fadeOut: 0
};

const DEFAULT_FILTER = { type: 'lowpass', freq: 20000 };

const PLUGIN_REGISTRY = {
    'KEQ3':   { name: 'EQ 3-Band',  icon: '📊', ctor: () => typeof KEQ3   !== 'undefined' ? new KEQ3(window.KAE?.ctx)   : null },
    'KComp':  { name: 'Compressor', icon: '🔊', ctor: () => typeof KComp  !== 'undefined' ? new KComp(window.KAE?.ctx)  : null },
    'KVerb':  { name: 'Reverb',     icon: '🌊', ctor: () => typeof KVerb  !== 'undefined' ? new KVerb(window.KAE?.ctx)  : null },
    'KDelay': { name: 'Delay',      icon: '🔄', ctor: () => typeof KDelay !== 'undefined' ? new KDelay(window.KAE?.ctx) : null },
    'KDrive': { name: 'Distortion', icon: '🎸', ctor: () => typeof KDrive !== 'undefined' ? new KDrive(window.KAE?.ctx) : null }
};

const SYNTH_TYPES = [
    { id: 'click',     name: 'Click',     icon: '👆', desc: 'Sharp UI click' },
    { id: 'thud',      name: 'Thud',      icon: '💥', desc: 'Impact / footstep' },
    { id: 'chime',     name: 'Chime',     icon: '🔔', desc: 'Success / pickup' },
    { id: 'buzz',      name: 'Buzz',      icon: '⚡', desc: 'Error / alarm' },
    { id: 'ambient',   name: 'Ambient',   icon: '🌊', desc: 'Atmospheric loop' },
    { id: 'explosion', name: 'Explosion', icon: '💣', desc: 'Explosion / boom' }
];

const DRUM_ROWS = ['Kick', 'Snare', 'Hi-Hat', 'Clap', 'Tom', 'Crash'];
const DRUM_SOUNDS = {
    Kick:   { type: 'thud',   params: { freq: 60, decay: 12 } },
    Snare:  { type: 'click',  params: { freq: 200, decay: 30 } },
    'Hi-Hat': { type: 'click', params: { freq: 8000, decay: 60 } },
    Clap:   { type: 'click',  params: { freq: 1200, decay: 40 } },
    Tom:    { type: 'thud',   params: { freq: 100, decay: 10 } },
    Crash:  { type: 'chime',  params: { freq: 3000, decay: 3 } }
};

// ─── MAIN CLASS ──────────────────────────────────────────────

class AudioStudio {

    constructor() {
        // Data
        this.audioMap    = { events: {}, buses: {} };
        this.musicConfig = { global: {}, levels: {}, events: {} };
        this.assets      = [];
        this.manifest    = MANIFEST;

        // UI state
        this.activeTab       = 'events';
        this.activeEventId   = null;
        this.activeContextKey = null;
        this.activeContextGroup = null;
        this.selectedAsset   = null;
        this.selectedMusicTrack = null;
        this.explorerSubTab  = 'event-tree';

        // Filter state
        this.eventSearch   = '';
        this.assetSearch   = '';
        this.contextSearch = '';
        this.categoryFilter = 'all';
        this.mappedOnly    = false;

        // Dirty / history
        this.isDirty      = false;
        this.autoSave     = false;
        this._autoTimer   = null;
        this.history      = [];
        this.future       = [];
        this.maxHistory   = 60;

        // Trigger log
        this.triggerLog = [];

        // Fader drag state
        this._faderDrag = null;

        // Drum machine
        this._drumPattern = {};
        DRUM_ROWS.forEach(r => { this._drumPattern[r] = new Array(16).fill(false); });
        this._drumBpm     = 120;
        this._drumPlaying = false;
        this._drumTimer   = null;
        this._drumStep    = 0;

        // Synth
        this._synthType   = null;
        this._synthBuf    = null;

        // Preview scenario
        this._previewTimer = null;

        // VU meter RAF
        this._meterRaf = null;

        this._init();
    }

    // ─────────────────────────────────────────────
    //  BOOT
    // ─────────────────────────────────────────────

    async _init() {
        console.log('%c[KAS] Audio Studio booting…', 'color:#e53e3e;font-weight:bold;font-size:14px;');
        await Promise.all([this._loadAudioMap(), this._loadMusicConfig(), this._loadAssets()]);
        this._normalizeMap();
        this._bindAllUI();
        this._recordHistory(false);
        this._renderAll();
        this._populateCategoryFilter();
        this._startMeterLoop();
        this._startAutoSave();
        this._syncStatus('STUDIO READY', 'green');
        console.log('%c[KAS] Boot complete.', 'color:#48bb78;font-weight:bold;');

        // Subscribe to EventBus for live trigger feedback
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.on('audio:trigger', (e) => {
                this._logTrigger(e.data?.name, e.data?.clip);
            });
        }
        window.addEventListener('audio:trigger', (e) => {
            this._logTrigger(e.detail?.name, e.detail?.clip);
        });
    }

    // ─────────────────────────────────────────────
    //  DATA LOADING
    // ─────────────────────────────────────────────

    async _loadAudioMap() {
        try {
            const r = await fetch('/api/audio/map');
            if (r.ok) this.audioMap = await r.json();
        } catch (e) { console.warn('[KAS] audioMap load failed'); }
    }

    async _loadMusicConfig() {
        try {
            const r = await fetch('/api/audio/music-config');
            if (r.ok) this.musicConfig = await r.json();
        } catch (e) { console.warn('[KAS] musicConfig load failed'); }
        if (!this.musicConfig.global) this.musicConfig.global = {};
        if (!this.musicConfig.levels) this.musicConfig.levels = {};
        if (!this.musicConfig.events) this.musicConfig.events = {};
    }

    async _loadAssets() {
        try {
            const r = await fetch('/api/audio/assets');
            if (r.ok) this.assets = await r.json();
        } catch(e) { console.warn('[KAS] assets load failed'); }
    }

    // ─────────────────────────────────────────────
    //  NORMALIZATION
    // ─────────────────────────────────────────────

    _normalizeMap() {
        const events = {};
        // Pull in manifest events first
        for (const [cat, list] of Object.entries(this.manifest)) {
            for (const ev of list) {
                if (!this.audioMap.events?.[ev.id]) {
                    this.audioMap.events[ev.id] = this._defaultEventCfg();
                }
            }
        }
        // Normalize each event
        for (const [id, raw] of Object.entries(this.audioMap.events || {})) {
            const cfg = raw || {};
            const clips = Array.isArray(cfg.clips) ? [...cfg.clips] : [];
            const clipMeta = {};
            clips.forEach(c => {
                clipMeta[c] = cfg.clipMeta?.[c] || { weight: 1, gain: 1 };
            });
            events[id] = {
                group:    cfg.group    || 'sfx',
                clips,
                clipMeta,
                priority: !!cfg.priority,
                reverb:   typeof cfg.reverb === 'number' ? cfg.reverb : 0,
                filter:   { type: cfg.filter?.type || 'lowpass', freq: cfg.filter?.freq ?? 20000 },
                playback: {
                    mode:      cfg.playback?.mode      || 'random',
                    volume:    cfg.playback?.volume    ?? 1.0,
                    volumeVar: cfg.playback?.volumeVar ?? 0.05,
                    pitchVar:  cfg.playback?.pitchVar  ?? 0.05,
                    cooldown:  cfg.playback?.cooldown  ?? 0.05,
                    fadeIn:    cfg.playback?.fadeIn    ?? 0,
                    fadeOut:   cfg.playback?.fadeOut   ?? 0
                }
            };
        }
        this.audioMap.events = events;

        // Default buses if missing
        const defaultBuses = {
            master:   { gain: 1.0 },
            music:    { gain: 0.7, parent: 'master', ducking: true },
            sfx:      { gain: 0.9, parent: 'master' },
            ambience: { gain: 0.6, parent: 'master', ducking: true },
            voice:    { gain: 1.0, parent: 'master' },
            ui:       { gain: 0.8, parent: 'master' }
        };
        this.audioMap.buses = { ...defaultBuses, ...(this.audioMap.buses || {}) };

        // Hot-load into KAE
        if (window.KAE) window.KAE.loadMap(this.audioMap);
    }

    _defaultEventCfg(group = 'sfx') {
        return {
            group,
            clips: [],
            clipMeta: {},
            priority: false,
            reverb: 0,
            filter: { ...DEFAULT_FILTER },
            playback: { ...DEFAULT_PLAYBACK }
        };
    }

    // ─────────────────────────────────────────────
    //  SAVE
    // ─────────────────────────────────────────────

    async save(opts = {}) {
        this._syncStatus('SAVING…');
        try {
            const [r1, r2] = await Promise.all([
                fetch('/api/audio/map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.audioMap) }),
                fetch('/api/audio/music-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.musicConfig) })
            ]);
            if (r1.ok && r2.ok) {
                this.isDirty = false;
                this._syncStatus('SYNCED', 'green');
                if (window.KAE) window.KAE.loadMap(this.audioMap);
                if (window.RedGlitchEventBus) window.RedGlitchEventBus.emit('audio:map_updated', this.audioMap);
                if (!opts.silent) this._updateStatusBar();
            } else {
                this._syncStatus('SYNC FAILED', 'red');
            }
        } catch (e) {
            console.error('[KAS] Save failed:', e);
            this._syncStatus('SYNC ERROR', 'red');
        }
    }

    // ─────────────────────────────────────────────
    //  HISTORY (Undo / Redo)
    // ─────────────────────────────────────────────

    _recordHistory(dirty = true) {
        const snap = JSON.stringify({ audioMap: this.audioMap, musicConfig: this.musicConfig });
        if (this.history[this.history.length - 1] === snap) return;
        this.history.push(snap);
        if (this.history.length > this.maxHistory) this.history.shift();
        this.future = [];
        if (dirty) { this.isDirty = true; this._updateStatusBar(); }
    }

    undo() {
        if (this.history.length < 2) return;
        const cur = this.history.pop();
        this.future.push(cur);
        const prev = JSON.parse(this.history[this.history.length - 1]);
        this.audioMap    = prev.audioMap;
        this.musicConfig = prev.musicConfig;
        this._normalizeMap();
        this.isDirty = true;
        this._renderAll();
        this._syncStatus('UNDO');
    }

    redo() {
        if (!this.future.length) return;
        const next = this.future.pop();
        this.history.push(next);
        const state = JSON.parse(next);
        this.audioMap    = state.audioMap;
        this.musicConfig = state.musicConfig;
        this._normalizeMap();
        this.isDirty = true;
        this._renderAll();
        this._syncStatus('REDO');
    }

    // ─────────────────────────────────────────────
    //  UI BINDING
    // ─────────────────────────────────────────────

    _bindAllUI() {
        const $ = id => document.getElementById(id);

        // Top-level tab buttons
        document.querySelectorAll('.kas-tab[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
        });

        // Sub-tab buttons in left panel (events/assets)
        document.querySelectorAll('.kas-tab[data-subtab]').forEach(btn => {
            btn.addEventListener('click', () => this._switchSubTab(btn.dataset.subtab));
        });

        // Sync button
        $('kas-btn-sync')?.addEventListener('click', () => this.save());

        // Auto-save toggle
        $('kas-autosave')?.addEventListener('change', e => {
            this.autoSave = e.target.checked;
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', e => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key === 's') { e.preventDefault(); this.save(); }
            if (e.key === 'z') { e.preventDefault(); this.undo(); }
            if (e.key === 'y') { e.preventDefault(); this.redo(); }
            if (e.key === ' ') { e.preventDefault(); this._auditionActiveEvent(); }
        });

        // Event tree search
        $('kas-event-search')?.addEventListener('input', e => {
            this.eventSearch = e.target.value.toLowerCase();
            this._renderEventTree();
        });

        // Category filter
        $('kas-category-filter')?.addEventListener('change', e => {
            this.categoryFilter = e.target.value;
            this._renderEventTree();
        });

        // Mapped only toggle
        $('kas-mapped-only')?.addEventListener('change', e => {
            this.mappedOnly = e.target.checked;
            this._renderEventTree();
        });

        // Asset search
        $('kas-asset-search')?.addEventListener('input', e => {
            this.assetSearch = e.target.value.toLowerCase();
            this._renderAssetList();
        });

        // Refresh assets
        $('kas-btn-refresh-assets')?.addEventListener('click', async () => {
            await this._loadAssets();
            this._renderAssetList();
        });

        // Create event
        $('kas-btn-create-event')?.addEventListener('click', () => this._createEvent());
        $('kas-new-event-id')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') this._createEvent();
        });

        // Collapse sidebars
        $('kas-btn-collapse-left')?.addEventListener('click', () => {
            $('kas-left')?.classList.toggle('collapsed');
        });
        $('kas-btn-collapse-right')?.addEventListener('click', () => {
            $('kas-right')?.classList.toggle('collapsed');
        });

        // Drop zone for clips
        const dropZone = $('ev-drop-zone');
        if (dropZone) {
            dropZone.addEventListener('dragover', e => {
                e.preventDefault();
                dropZone.querySelector('#ev-waveform-empty')?.classList.add('drag-over');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.querySelector('#ev-waveform-empty')?.classList.remove('drag-over');
            });
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                dropZone.querySelector('#ev-waveform-empty')?.classList.remove('drag-over');
                const asset = e.dataTransfer.getData('text/plain');
                if (asset && this.activeEventId) this._addClipToEvent(this.activeEventId, asset);
            });
        }

        // Event buttons
        $('ev-btn-test')?.addEventListener('click', () => this._auditionActiveEvent());
        $('ev-btn-delete')?.addEventListener('click', () => this._deleteActiveEvent());
        $('ev-btn-add-clip')?.addEventListener('click', () => this._switchSubTab('asset-list'));

        // Inspector sliders / selects
        this._bindInspectorControls();

        // Music tab
        this._bindMusicTab();

        // Synth tab
        this._buildSynthGrid();

        // Drum tab
        this._buildDrumGrid();
        $('drum-btn-play')?.addEventListener('click', () => this._drumPlay());
        $('drum-btn-stop')?.addEventListener('click', () => this._drumStop());
        $('drum-btn-clear')?.addEventListener('click', () => this._drumClear());
        $('drum-btn-randomize')?.addEventListener('click', () => this._drumRandomize());
        $('drum-bpm')?.addEventListener('change', e => {
            this._drumBpm = parseInt(e.target.value) || 120;
        });

        // Mixer
        $('mixer-btn-panic')?.addEventListener('click', () => {
            if (window.KAE) window.KAE.stopAll();
        });
        $('mixer-btn-reset')?.addEventListener('click', () => this._resetMixer());
        $('mixer-game-state')?.addEventListener('change', e => {
            if (window.KAE) window.KAE.setGameState(e.target.value);
            this._updateStatusBar();
        });
        $('mixer-environment')?.addEventListener('change', e => {
            if (window.KAE) window.KAE.setEnvironment(e.target.value);
            this._updateStatusBar();
        });

        // Context search
        $('kas-context-search')?.addEventListener('input', e => {
            this.contextSearch = e.target.value.toLowerCase();
            this._renderContextList();
        });

        // Add music context buttons
        $('kas-btn-add-level')?.addEventListener('click', () => {
            const id = prompt('Enter Level ID (e.g. level_3):');
            if (id && !this.musicConfig.levels[id]) {
                this.musicConfig.levels[id] = '';
                this._recordHistory();
                this._renderContextList();
            }
        });
        $('kas-btn-add-event')?.addEventListener('click', () => {
            const id = prompt('Enter Event ID (e.g. boss_fight):');
            if (id && !this.musicConfig.events[id]) {
                this.musicConfig.events[id] = '';
                this._recordHistory();
                this._renderContextList();
            }
        });

        // Preview scenarios
        $('prev-ui')?.addEventListener('click', () => this._runScenario('ui'));
        $('prev-traversal')?.addEventListener('click', () => this._runScenario('traversal'));
        $('prev-combat')?.addEventListener('click', () => this._runScenario('combat'));
        $('prev-stop')?.addEventListener('click', () => this._stopScenario());

        // Global mouse events for fader drag
        window.addEventListener('mousemove', e => this._onFaderMove(e));
        window.addEventListener('mouseup', () => this._onFaderUp());
    }

    _bindInspectorControls() {
        const $ = id => document.getElementById(id);
        const bind = (id, path, transform) => {
            $(id)?.addEventListener('input', e => {
                const val = transform ? transform(e.target.value) : e.target.value;
                this._setEventProp(path, val);
            });
        };

        bind('insp-group',        'group',           v => v);
        bind('insp-mode',         'playback.mode',   v => v);
        bind('insp-vol',          'playback.volume', parseFloat);
        bind('insp-volvar',       'playback.volumeVar', parseFloat);
        bind('insp-pitch',        'playback.pitchVar',  parseFloat);
        bind('insp-cooldown',     'playback.cooldown',  parseFloat);
        bind('insp-fadein',       'playback.fadeIn',    parseFloat);
        bind('insp-fadeout',      'playback.fadeOut',   parseFloat);
        bind('insp-filter-type',  'filter.type',    v => v);
        bind('insp-freq',         'filter.freq',    parseFloat);
        bind('insp-reverb',       'reverb',         parseFloat);

        $('insp-priority')?.addEventListener('change', e => {
            this._setEventProp('priority', e.target.checked);
        });

        // Slider display values (live)
        const sliderMap = [
            ['insp-vol',      'insp-vol-val',      v => Math.round(v * 100) + '%'],
            ['insp-volvar',   'insp-volvar-val',   v => Math.round(v * 100) + '%'],
            ['insp-pitch',    'insp-pitch-val',    v => Math.round(v * 100) + '%'],
            ['insp-cooldown', 'insp-cooldown-val', v => parseFloat(v).toFixed(2) + 's'],
            ['insp-fadein',   'insp-fadein-val',   v => parseFloat(v).toFixed(2) + 's'],
            ['insp-fadeout',  'insp-fadeout-val',  v => parseFloat(v).toFixed(2) + 's'],
            ['insp-freq',     'insp-freq-val',     v => (v >= 1000 ? (v/1000).toFixed(1) + 'kHz' : Math.round(v) + 'Hz')],
            ['insp-reverb',   'insp-reverb-val',   v => Math.round(v * 100) + '%']
        ];
        sliderMap.forEach(([sliderId, valId, fmt]) => {
            $(sliderId)?.addEventListener('input', e => {
                const el = $(valId);
                if (el) el.textContent = fmt(e.target.value);
            });
        });

        // FX insert chain
        $('insp-btn-add-fx')?.addEventListener('click', () => this._showAddFxMenu());
    }

    _bindMusicTab() {
        const $ = id => document.getElementById(id);

        $('music-btn-play')?.addEventListener('click', () => {
            if (this.selectedMusicTrack && window.KAE) {
                window.KAE.playMusic(this.selectedMusicTrack, { volume: parseFloat($('music-vol')?.value || '0.7') });
            }
        });
        $('music-btn-stop')?.addEventListener('click', () => {
            if (window.KAE) window.KAE.stopMusic();
        });

        $('music-btn-assign')?.addEventListener('click', () => this._assignMusicContext());
        $('music-btn-clear')?.addEventListener('click', () => this._clearMusicContext());

        $('music-asset-search')?.addEventListener('input', e => {
            this.assetSearch = e.target.value.toLowerCase();
            this._renderMusicAssets();
        });
        $('music-btn-refresh')?.addEventListener('click', async () => {
            await this._loadAssets();
            this._renderMusicAssets();
        });

        $('music-game-state')?.addEventListener('change', e => {
            if (window.KAE) window.KAE.setGameState(e.target.value);
        });
        $('music-environment')?.addEventListener('change', e => {
            if (window.KAE) window.KAE.setEnvironment(e.target.value);
        });
    }

    // ─────────────────────────────────────────────
    //  TAB ROUTING
    // ─────────────────────────────────────────────

    _switchTab(tab) {
        this.activeTab = tab;

        // Top tab buttons
        document.querySelectorAll('.kas-tab[data-tab]').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });

        // Left/center/right tab content panels
        const areas = ['left', 'center', 'right'];
        areas.forEach(area => {
            document.querySelectorAll(`[id^="${area}-"]`).forEach(el => {
                if (!el.dataset.subtab) {
                    el.classList.toggle('active', el.id === `${area}-${tab}`);
                }
            });
        });

        document.getElementById('left-panel-title').textContent =
            { events: 'Explorer', music: 'Music Contexts', buses: 'Bus Graph',
              synth: 'Synth', drum: 'Drum Machine' }[tab] || tab;
    }

    _switchSubTab(subtab) {
        this.explorerSubTab = subtab;

        document.querySelectorAll('.kas-tab[data-subtab]').forEach(b => {
            b.classList.toggle('active', b.dataset.subtab === subtab);
        });

        const panels = { 'event-tree': 'subtab-event-tree', 'asset-list': 'subtab-asset-list' };
        for (const [key, id] of Object.entries(panels)) {
            const el = document.getElementById(id);
            if (el) el.style.display = key === subtab ? 'flex' : 'none';
        }
    }

    // ─────────────────────────────────────────────
    //  RENDER ALL
    // ─────────────────────────────────────────────

    _renderAll() {
        this._renderEventTree();
        this._renderAssetList();
        this._renderEventEditor();
        this._renderInspector();
        this._renderMixer();
        this._renderContextList();
        this._renderMusicAssets();
        this._renderBusGraph();
        this._updateStatusBar();
    }

    // ─────────────────────────────────────────────
    //  EVENT TREE
    // ─────────────────────────────────────────────

    _renderEventTree() {
        const container = document.getElementById('kas-event-tree');
        if (!container) return;
        container.innerHTML = '';

        const search  = this.eventSearch;
        const catFilt = this.categoryFilter;

        let total = 0;

        for (const [cat, evList] of Object.entries(this.manifest)) {
            if (catFilt !== 'all' && cat !== catFilt) continue;

            const visible = evList.filter(ev => {
                const cfg    = this.audioMap.events[ev.id];
                const mapped = !!(cfg?.clips?.length);
                const text   = `${ev.id} ${ev.desc || ''}`.toLowerCase();
                if (search && !text.includes(search)) return false;
                if (this.mappedOnly && !mapped) return false;
                return true;
            });

            if (!visible.length) continue;

            const catEl = document.createElement('div');
            catEl.className = 'kas-tree-category';
            catEl.innerHTML = `<i class="fas fa-folder" style="opacity:0.5;font-size:10px;"></i> ${cat}
                <span class="kas-chip" style="margin-left:auto;">${visible.length}</span>`;
            container.appendChild(catEl);

            for (const ev of visible) {
                const cfg    = this.audioMap.events[ev.id];
                const mapped = !!(cfg?.clips?.length);
                total++;

                const item = document.createElement('div');
                item.className = 'kas-tree-item' + (this.activeEventId === ev.id ? ' active' : '');
                item.innerHTML = `
                    <i class="fas ${mapped ? 'fa-bolt' : 'fa-circle'}" style="font-size:9px;opacity:0.6;color:${mapped ? 'var(--kas-red)' : ''};"></i>
                    <span class="kas-tree-item-name">${ev.id}</span>
                    <div class="kas-tree-item-meta">
                        ${mapped ? `<span class="kas-chip mapped">${cfg.clips.length}</span>` : '<span class="kas-chip unmapped">—</span>'}
                    </div>
                `;
                item.title = ev.desc || ev.id;
                item.onclick = () => this._selectEvent(ev.id);
                container.appendChild(item);
            }
        }

        // Show custom events not in manifest
        const manifestIds = new Set(Object.values(this.manifest).flat().map(e => e.id));
        const customIds = Object.keys(this.audioMap.events).filter(id => !manifestIds.has(id) && (!search || id.includes(search)));
        if (customIds.length) {
            const catEl = document.createElement('div');
            catEl.className = 'kas-tree-category';
            catEl.innerHTML = `<i class="fas fa-star" style="opacity:0.5;font-size:10px;"></i> CUSTOM
                <span class="kas-chip" style="margin-left:auto;">${customIds.length}</span>`;
            container.appendChild(catEl);

            customIds.forEach(id => {
                const cfg    = this.audioMap.events[id];
                const mapped = !!(cfg?.clips?.length);
                total++;
                const item = document.createElement('div');
                item.className = 'kas-tree-item' + (this.activeEventId === id ? ' active' : '');
                item.innerHTML = `
                    <i class="fas ${mapped ? 'fa-bolt' : 'fa-circle'}" style="font-size:9px;opacity:0.6;"></i>
                    <span class="kas-tree-item-name">${id}</span>
                    <div class="kas-tree-item-meta">
                        ${mapped ? `<span class="kas-chip mapped">${cfg.clips.length}</span>` : '<span class="kas-chip unmapped">—</span>'}
                    </div>
                `;
                item.onclick = () => this._selectEvent(id);
                container.appendChild(item);
            });
        }

        if (total === 0) {
            container.innerHTML = `<div class="kas-empty-state"><div class="kas-empty-icon">🔍</div><div class="kas-empty-title">No events match</div></div>`;
        }
    }

    _populateCategoryFilter() {
        const sel = document.getElementById('kas-category-filter');
        if (!sel) return;
        const existing = new Set(Array.from(sel.options).map(o => o.value));
        for (const cat of Object.keys(this.manifest)) {
            if (!existing.has(cat)) {
                const opt = document.createElement('option');
                opt.value = cat; opt.textContent = cat;
                sel.appendChild(opt);
            }
        }
    }

    // ─────────────────────────────────────────────
    //  ASSET LIST
    // ─────────────────────────────────────────────

    _renderAssetList() {
        const container = document.getElementById('kas-asset-list');
        if (!container) return;
        container.innerHTML = '';

        const search = this.assetSearch;
        const filtered = this.assets.filter(a => !search || a.name.toLowerCase().includes(search));

        if (!filtered.length) {
            container.innerHTML = `<div class="kas-empty-state"><div class="kas-empty-icon">🔊</div><div class="kas-empty-title">No assets</div><div class="kas-empty-sub">Place audio files in muzikler/</div></div>`;
            return;
        }

        filtered.forEach(asset => {
            const item = document.createElement('div');
            item.className = 'kas-asset-item' + (this.selectedAsset === asset.name ? ' active' : '');
            item.draggable = true;

            const ext = asset.ext?.replace('.', '') || 'wav';
            const extIcons = { mp3: '🎵', ogg: '🎵', wav: '🎼', json: '📄', flac: '🎼' };
            const icon = extIcons[ext] || '🔊';

            item.innerHTML = `
                <div class="kas-asset-icon">${icon}</div>
                <span class="kas-asset-name">${asset.name}</span>
                ${asset.sizeMb ? `<span class="kas-asset-size">${asset.sizeMb}MB</span>` : ''}
            `;

            item.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', asset.name);
                e.dataTransfer.effectAllowed = 'copy';
            });
            item.addEventListener('click', () => {
                this.selectedAsset = asset.name;
                this._previewAsset(asset.name);
                this._renderAssetList();
            });
            item.addEventListener('dblclick', () => {
                if (this.activeEventId) this._addClipToEvent(this.activeEventId, asset.name);
            });

            container.appendChild(item);
        });

        this._updateStatusBar();
    }

    async _previewAsset(assetName) {
        if (!window.KAE) return;
        const buf = await window.KAE.loadBuffer(assetName);
        if (buf) {
            window.KAE._playBuffer(buf, { volume: 0.8, bus: 'sfx' });
            this._drawWaveformBuffer(buf);
        }
    }

    // ─────────────────────────────────────────────
    //  EVENT EDITOR (Center - Events tab)
    // ─────────────────────────────────────────────

    _selectEvent(id) {
        if (!this.audioMap.events[id]) {
            this.audioMap.events[id] = this._defaultEventCfg();
        }
        this.activeEventId = id;
        this._renderEventEditor();
        this._renderInspector();
        this._renderEventTree();
    }

    _renderEventEditor() {
        const empty  = document.getElementById('events-empty');
        const editor = document.getElementById('events-editor');
        if (!empty || !editor) return;

        if (!this.activeEventId || !this.audioMap.events[this.activeEventId]) {
            empty.style.display = 'flex';
            editor.classList.add('kas-hidden');
            return;
        }

        empty.style.display = 'none';
        editor.classList.remove('kas-hidden');

        const cfg = this.audioMap.events[this.activeEventId];
        const $ = id => document.getElementById(id);

        $('ev-name').textContent    = this.activeEventId;
        $('ev-bus-tag').innerHTML   = `⚡ ${(cfg.group || 'sfx').toUpperCase()} BUS`;

        // Waveform
        if (cfg.clips?.length) {
            $('ev-waveform-empty').style.display = 'none';
            this._loadAndDrawWaveform(cfg.clips[0]);
        } else {
            $('ev-waveform-empty').style.display = 'flex';
            this._clearWaveform();
        }

        // Clip stack
        const stack = $('ev-clip-stack');
        if (stack) {
            stack.innerHTML = (cfg.clips || []).map((clip, idx) => {
                const meta = cfg.clipMeta?.[clip] || { weight: 1, gain: 1 };
                return `
                    <div class="kas-clip-row" data-clip="${clip}" data-idx="${idx}">
                        <span class="kas-clip-row-icon">🎵</span>
                        <div style="flex:1;min-width:0;">
                            <div class="kas-clip-row-name">${clip}</div>
                            <div class="kas-clip-row-meta">weight: ${meta.weight?.toFixed(2)} | gain: ${meta.gain?.toFixed(2)}</div>
                        </div>
                        <div class="kas-clip-row-actions">
                            <button class="kas-btn icon" onclick="kas._auditionClip('${this.activeEventId}','${clip}')" title="Audition"><i class="fas fa-play"></i></button>
                            <button class="kas-btn icon" onclick="kas._editClipWeight('${this.activeEventId}','${clip}')" title="Edit weight"><i class="fas fa-balance-scale"></i></button>
                            <button class="kas-btn icon danger" onclick="kas._removeClip('${this.activeEventId}',${idx})" title="Remove"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        $('ev-clip-count').textContent = `${(cfg.clips || []).length} clip${(cfg.clips?.length !== 1) ? 's' : ''}`;
    }

    // ─────────────────────────────────────────────
    //  INSPECTOR
    // ─────────────────────────────────────────────

    _renderInspector() {
        const emptyEl   = document.getElementById('right-events-empty');
        const contentEl = document.getElementById('right-events-content');
        if (!emptyEl || !contentEl) return;

        if (!this.activeEventId || !this.audioMap.events[this.activeEventId]) {
            emptyEl.style.display  = 'flex';
            contentEl.classList.add('kas-hidden');
            return;
        }

        emptyEl.style.display = 'none';
        contentEl.classList.remove('kas-hidden');

        const cfg = this.audioMap.events[this.activeEventId];
        const $   = id => document.getElementById(id);

        // Identity
        $('insp-id').textContent = this.activeEventId;
        const desc = this._getManifestDesc(this.activeEventId);
        $('insp-desc').textContent = desc || 'Custom event — no manifest description.';

        // Routing
        const grpEl = $('insp-group');
        if (grpEl) grpEl.value = cfg.group || 'sfx';
        const priEl = $('insp-priority');
        if (priEl) priEl.checked = !!cfg.priority;

        // Playback
        const p = cfg.playback;
        const setSlider = (id, valId, val, fmt) => {
            const el = $(id); if (el) el.value = val;
            const ve = $(valId); if (ve) ve.textContent = fmt(val);
        };

        $('insp-mode') && ($('insp-mode').value = p.mode || 'random');
        setSlider('insp-vol',      'insp-vol-val',      p.volume,    v => Math.round(v * 100) + '%');
        setSlider('insp-volvar',   'insp-volvar-val',   p.volumeVar, v => Math.round(v * 100) + '%');
        setSlider('insp-pitch',    'insp-pitch-val',    p.pitchVar,  v => Math.round(v * 100) + '%');
        setSlider('insp-cooldown', 'insp-cooldown-val', p.cooldown,  v => parseFloat(v).toFixed(2) + 's');
        setSlider('insp-fadein',   'insp-fadein-val',   p.fadeIn,    v => parseFloat(v).toFixed(2) + 's');
        setSlider('insp-fadeout',  'insp-fadeout-val',  p.fadeOut,   v => parseFloat(v).toFixed(2) + 's');

        // Filter
        const fEl = $('insp-filter-type');
        if (fEl) fEl.value = cfg.filter?.type || 'lowpass';
        setSlider('insp-freq', 'insp-freq-val', cfg.filter?.freq ?? 20000,
            v => (v >= 1000 ? (v/1000).toFixed(1) + 'kHz' : Math.round(v) + 'Hz'));
        setSlider('insp-reverb', 'insp-reverb-val', cfg.reverb ?? 0, v => Math.round(v * 100) + '%');

        // Trigger history
        this._renderTriggerHistory();
    }

    _renderTriggerHistory() {
        const log = document.getElementById('insp-trigger-history');
        if (!log) return;
        const relevant = this.triggerLog.filter(h => h.name === this.activeEventId).slice(-10);
        if (!relevant.length) {
            log.innerHTML = '<div style="padding:8px;font-size:10px;color:var(--text-muted);text-align:center;">No triggers yet</div>';
            return;
        }
        log.innerHTML = relevant.reverse().map(h => `
            <div class="kas-history-row">
                <span class="kas-history-name">${h.name}</span>
                <span class="kas-history-clip">${h.clip || '—'}</span>
                <span class="kas-history-time">${h.time}</span>
            </div>
        `).join('');
    }

    _logTrigger(name, clip) {
        this.triggerLog.push({ name, clip, time: new Date().toLocaleTimeString() });
        if (this.triggerLog.length > 200) this.triggerLog.shift();
        if (name === this.activeEventId) this._renderTriggerHistory();
    }

    // ─────────────────────────────────────────────
    //  MIXER
    // ─────────────────────────────────────────────

    _renderMixer() {
        const container = document.getElementById('kas-mixer-strips');
        if (!container) return;
        container.innerHTML = '';

        const busOrder = ['master', 'music', 'sfx', 'ambience', 'voice', 'ui'];
        const extraBuses = Object.keys(this.audioMap.buses).filter(b => !busOrder.includes(b));
        const allBuses = [...busOrder, ...extraBuses];

        allBuses.forEach(name => {
            const bus = this.audioMap.buses[name];
            if (!bus) return;

            const gain    = bus.gain ?? 1.0;
            const pct     = Math.round(gain * 100);
            const isMaster = name === 'master';

            const strip = document.createElement('div');
            strip.className = 'kas-strip' + (isMaster ? ' master-strip' : '');
            strip.id = `mixer-strip-${name}`;

            strip.innerHTML = `
                <div class="kas-strip-name">${name.toUpperCase()}</div>
                <div class="kas-strip-meters">
                    <div class="kas-meter" id="meter-${name}-L">
                        ${Array(16).fill(0).map((_, i) => `<div class="kas-meter-seg" data-seg="${i}"></div>`).join('')}
                    </div>
                    <div class="kas-meter" id="meter-${name}-R">
                        ${Array(16).fill(0).map((_, i) => `<div class="kas-meter-seg" data-seg="${i}"></div>`).join('')}
                    </div>
                </div>
                <div class="kas-fader-track" id="fader-track-${name}" data-bus="${name}">
                    <div class="kas-fader-fill" id="fader-fill-${name}" style="height:${pct}%;"></div>
                    <div class="kas-fader-thumb" id="fader-thumb-${name}" style="bottom:${pct}%;"></div>
                </div>
                <div class="kas-strip-val" id="fader-val-${name}">${pct}%</div>
                ${!isMaster ? `
                    <div class="kas-strip-btns">
                        <button class="kas-strip-btn mute" id="strip-mute-${name}" data-bus="${name}" onclick="kas._toggleBusMute('${name}')">M</button>
                        <button class="kas-strip-btn solo" id="strip-solo-${name}" data-bus="${name}" onclick="kas._toggleBusSolo('${name}')">S</button>
                    </div>
                ` : ''}
            `;

            container.appendChild(strip);

            // Fader drag
            const track = strip.querySelector('.kas-fader-track');
            track?.addEventListener('mousedown', e => this._onFaderDown(e, name, track));
        });
    }

    _onFaderDown(e, busName, trackEl) {
        e.preventDefault();
        const rect = trackEl.getBoundingClientRect();
        this._faderDrag = { busName, trackEl, rect };
    }

    _onFaderMove(e) {
        if (!this._faderDrag) return;
        const { busName, trackEl, rect } = this._faderDrag;
        const relY  = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
        const gain  = parseFloat(relY.toFixed(2));
        const pct   = Math.round(gain * 100);

        // Update UI
        const fill  = document.getElementById(`fader-fill-${busName}`);
        const thumb = document.getElementById(`fader-thumb-${busName}`);
        const val   = document.getElementById(`fader-val-${busName}`);
        if (fill)  fill.style.height = pct + '%';
        if (thumb) thumb.style.bottom = pct + '%';
        if (val)   val.textContent = pct + '%';

        // Apply to engine and map
        if (window.KAE) window.KAE.setBusGain(busName, gain);
        if (this.audioMap.buses[busName]) this.audioMap.buses[busName].gain = gain;
        this.isDirty = true;
    }

    _onFaderUp() {
        if (this._faderDrag) {
            this._recordHistory();
            this._faderDrag = null;
        }
    }

    _toggleBusMute(name) {
        const btn = document.getElementById(`strip-mute-${name}`);
        if (!btn) return;
        const on = btn.classList.toggle('on');
        if (window.KAE) window.KAE.muteBus(name, on);
    }

    _toggleBusSolo(name) {
        document.getElementById(`strip-solo-${name}`)?.classList.toggle('on');
    }

    _resetMixer() {
        const defaults = { master: 1.0, music: 0.7, sfx: 0.9, ambience: 0.6, voice: 1.0, ui: 0.8 };
        for (const [name, gain] of Object.entries(defaults)) {
            this.audioMap.buses[name] = { ...(this.audioMap.buses[name] || {}), gain };
            if (window.KAE) window.KAE.setBusGain(name, gain);
        }
        this._renderMixer();
        this._recordHistory();
    }

    // ─────────────────────────────────────────────
    //  VU METERS (RAF Loop)
    // ─────────────────────────────────────────────

    _startMeterLoop() {
        const loop = () => {
            this._updateMeters();
            this._meterRaf = requestAnimationFrame(loop);
        };
        loop();
    }

    _updateMeters() {
        if (!window.KAE) return;
        const buses = Object.keys(this.audioMap.buses || {});

        buses.forEach(name => {
            const level = window.KAE.getBusLevel(name);
            const segs  = 16;
            const on    = Math.round(level * segs);

            ['L', 'R'].forEach(ch => {
                const meter = document.getElementById(`meter-${name}-${ch}`);
                if (!meter) return;
                const segEls = meter.querySelectorAll('.kas-meter-seg');
                segEls.forEach((seg, i) => {
                    seg.classList.remove('on-low', 'on-mid', 'on-high');
                    if (i < on) {
                        if (i >= segs - 2) seg.classList.add('on-high');
                        else if (i >= segs - 4) seg.classList.add('on-mid');
                        else seg.classList.add('on-low');
                    }
                });
            });
        });

        // Update voice count
        const voices = window.KAE.activeVoices?.size ?? 0;
        const el = document.getElementById('sb-voices');
        if (el) el.textContent = `voices: ${voices}`;
    }

    // ─────────────────────────────────────────────
    //  WAVEFORM RENDERING
    // ─────────────────────────────────────────────

    async _loadAndDrawWaveform(url) {
        if (!window.KAE) return;
        try {
            const buf = await window.KAE.loadBuffer(url);
            if (buf) this._drawWaveformBuffer(buf);
        } catch (e) {}
    }

    _drawWaveformBuffer(audioBuffer) {
        const canvas = document.getElementById('ev-waveform-canvas');
        if (!canvas || !audioBuffer) return;

        const ctx    = canvas.getContext('2d');
        const W      = canvas.offsetWidth || 600;
        const H      = canvas.offsetHeight || 120;
        canvas.width = W * (window.devicePixelRatio || 1);
        canvas.height = H * (window.devicePixelRatio || 1);
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

        ctx.clearRect(0, 0, W, H);

        // Background gradient
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, 'rgba(229,62,62,0.05)');
        bg.addColorStop(1, 'rgba(13,16,23,0.0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Center line
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();

        // Waveform
        const data       = audioBuffer.getChannelData(0);
        const step       = Math.ceil(data.length / W);
        const halfH      = H / 2;
        const amp        = halfH * 0.9;

        // Draw filled waveform
        ctx.beginPath();
        ctx.moveTo(0, halfH);
        for (let x = 0; x < W; x++) {
            let max = 0;
            for (let i = x * step; i < (x + 1) * step && i < data.length; i++) {
                if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
            }
            const y = halfH - max * amp;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        for (let x = W - 1; x >= 0; x--) {
            let max = 0;
            for (let i = x * step; i < (x + 1) * step && i < data.length; i++) {
                if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
            }
            const y = halfH + max * amp;
            ctx.lineTo(x, y);
        }
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, 'rgba(229,62,62,0.6)');
        grad.addColorStop(0.5, 'rgba(229,62,62,0.3)');
        grad.addColorStop(1, 'rgba(229,62,62,0.6)');
        ctx.fillStyle = grad;
        ctx.fill();

        // Outline
        ctx.strokeStyle = 'rgba(229,62,62,0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();

        document.getElementById('ev-waveform-empty').style.display = 'none';
    }

    _clearWaveform() {
        const canvas = document.getElementById('ev-waveform-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // ─────────────────────────────────────────────
    //  CLIP MANAGEMENT
    // ─────────────────────────────────────────────

    _addClipToEvent(eventId, assetName) {
        const cfg = this.audioMap.events[eventId];
        if (!cfg) return;
        if (!cfg.clips.includes(assetName)) {
            cfg.clips.push(assetName);
            cfg.clipMeta[assetName] = { weight: 1, gain: 1 };
            this._recordHistory();
            this._renderEventEditor();
            this._renderInspector();
            this._renderEventTree();
            this._syncStatus(`CLIP ADDED: ${assetName}`);
        }
    }

    _removeClip(eventId, idx) {
        const cfg = this.audioMap.events[eventId];
        if (!cfg?.clips) return;
        const removed = cfg.clips.splice(idx, 1)[0];
        delete cfg.clipMeta[removed];
        this._recordHistory();
        this._renderEventEditor();
        this._renderInspector();
        this._renderEventTree();
    }

    _editClipWeight(eventId, clipName) {
        const cfg = this.audioMap.events[eventId];
        if (!cfg) return;
        const meta    = cfg.clipMeta[clipName] || { weight: 1, gain: 1 };
        const newW    = parseFloat(prompt(`Weight for "${clipName}" (current: ${meta.weight}):`, meta.weight));
        if (!isNaN(newW) && newW > 0) {
            cfg.clipMeta[clipName] = { ...meta, weight: newW };
            this._recordHistory();
            this._renderEventEditor();
        }
    }

    async _auditionClip(eventId, clipName) {
        if (!window.KAE) return;
        const buf = await window.KAE.loadBuffer(clipName);
        if (buf) {
            window.KAE._playBuffer(buf, { volume: 0.9, bus: 'sfx' });
            this._drawWaveformBuffer(buf);
        }
    }

    async _auditionActiveEvent() {
        if (!this.activeEventId || !window.KAE) return;
        await window.KAE.playEvent(this.activeEventId);
    }

    // ─────────────────────────────────────────────
    //  EVENT CRUD
    // ─────────────────────────────────────────────

    _createEvent() {
        const input = document.getElementById('kas-new-event-id');
        const id    = input?.value.trim();
        if (!id) return;
        if (!this.audioMap.events[id]) {
            this.audioMap.events[id] = this._defaultEventCfg();
            this._recordHistory();
        }
        if (input) input.value = '';
        this._selectEvent(id);
        this._syncStatus(`EVENT CREATED: ${id}`);
    }

    _deleteActiveEvent() {
        if (!this.activeEventId) return;
        if (!confirm(`Delete event "${this.activeEventId}"?`)) return;
        delete this.audioMap.events[this.activeEventId];
        this.activeEventId = null;
        this._recordHistory();
        this._renderAll();
    }

    // ─────────────────────────────────────────────
    //  INSPECTOR PROP SETTER
    // ─────────────────────────────────────────────

    _setEventProp(path, value) {
        if (!this.activeEventId) return;
        const cfg   = this.audioMap.events[this.activeEventId];
        const parts = path.split('.');
        if (parts.length === 1) cfg[parts[0]] = value;
        else if (parts.length === 2) { if (!cfg[parts[0]]) cfg[parts[0]] = {}; cfg[parts[0]][parts[1]] = value; }

        this.isDirty = true;
        this._renderEventEditor();
        this._renderEventTree();
        this._updateStatusBar();
        if (window.KAE) window.KAE.loadMap(this.audioMap);
    }

    _getManifestDesc(id) {
        for (const list of Object.values(this.manifest)) {
            const hit = list.find(e => e.id === id);
            if (hit) return hit.desc;
        }
        return '';
    }

    // ─────────────────────────────────────────────
    //  MUSIC CONTEXTS TAB
    // ─────────────────────────────────────────────

    _renderContextList() {
        const container = document.getElementById('kas-context-list');
        if (!container) return;
        container.innerHTML = '';

        const search = this.contextSearch;

        const renderGroup = (groupName, groupData, icon) => {
            const header = document.createElement('div');
            header.className = 'kas-tree-category';
            header.innerHTML = `${icon} ${groupName.toUpperCase()}`;
            container.appendChild(header);

            for (const [key, val] of Object.entries(groupData || {})) {
                if (search && !key.toLowerCase().includes(search) && !(val || '').toLowerCase().includes(search)) continue;
                const isActive = this.activeContextGroup === groupName && this.activeContextKey === key;

                const card = document.createElement('div');
                card.className = 'kas-context-card' + (isActive ? ' active' : '');
                card.innerHTML = `
                    <div class="kas-context-icon">${icon}</div>
                    <div class="kas-context-info">
                        <div class="kas-context-name">${key}</div>
                        <div class="kas-context-track ${val ? 'assigned' : ''}">${val || 'No track assigned'}</div>
                    </div>
                    <button class="kas-btn icon danger" style="font-size:10px;padding:4px 6px;" onclick="event.stopPropagation();kas._deleteMusicContext('${groupName}','${key}')">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                card.onclick = () => {
                    this.activeContextGroup = groupName;
                    this.activeContextKey   = key;
                    this._renderContextList();
                    this._updateMusicAssignUI();
                };
                container.appendChild(card);
            }
        };

        renderGroup('global', this.musicConfig.global, '🌐');
        renderGroup('levels', this.musicConfig.levels, '🗺');
        renderGroup('events', this.musicConfig.events, '⚡');
    }

    _renderMusicAssets() {
        const container = document.getElementById('music-asset-list');
        if (!container) return;
        container.innerHTML = '';

        const search   = this.assetSearch;
        const allFiles = this.assets.filter(a => {
            const audioExts = ['.mp3', '.ogg', '.wav', '.m4a', '.json', '.flac'];
            if (!audioExts.includes(a.ext)) return false;
            return !search || a.name.toLowerCase().includes(search);
        });

        if (!allFiles.length) {
            container.innerHTML = '<div style="padding:10px;font-size:11px;color:var(--text-muted);">No music files found.</div>';
            return;
        }

        allFiles.forEach(asset => {
            const item = document.createElement('div');
            item.className = 'kas-asset-item' + (this.selectedMusicTrack === asset.name ? ' active' : '');
            item.innerHTML = `
                <div class="kas-asset-icon">🎵</div>
                <span class="kas-asset-name">${asset.name}</span>
            `;
            item.onclick = () => {
                this.selectedMusicTrack = asset.name;
                document.getElementById('music-now-playing').textContent = asset.name;
                this._renderMusicAssets();
                this._updateMusicAssignUI();
            };
            item.ondblclick = () => {
                this.selectedMusicTrack = asset.name;
                this._assignMusicContext();
            };
            container.appendChild(item);
        });
    }

    _updateMusicAssignUI() {
        const btn    = document.getElementById('music-btn-assign');
        const status = document.getElementById('music-assign-status');
        if (!btn || !status) return;

        if (this.activeContextKey && this.selectedMusicTrack) {
            btn.disabled = false;
            status.innerHTML = `Link <strong style="color:var(--kas-red)">${this.selectedMusicTrack}</strong> → <strong style="color:var(--text-primary)">${this.activeContextKey}</strong>?`;
        } else if (this.activeContextKey) {
            btn.disabled = true;
            status.textContent = 'Now select a track from the library.';
        } else {
            btn.disabled = true;
            status.textContent = 'Select a context on the left, then a track.';
        }
    }

    _assignMusicContext() {
        if (!this.activeContextGroup || !this.activeContextKey || !this.selectedMusicTrack) return;
        this.musicConfig[this.activeContextGroup][this.activeContextKey] = this.selectedMusicTrack;
        this._recordHistory();
        this._renderContextList();
        this._syncStatus(`LINKED: ${this.activeContextKey} → ${this.selectedMusicTrack}`);
    }

    _clearMusicContext() {
        if (!this.activeContextGroup || !this.activeContextKey) return;
        this.musicConfig[this.activeContextGroup][this.activeContextKey] = '';
        this._recordHistory();
        this._renderContextList();
    }

    _deleteMusicContext(group, key) {
        delete this.musicConfig[group][key];
        this._recordHistory();
        this._renderContextList();
    }

    // ─────────────────────────────────────────────
    //  BUS GRAPH (Buses Tab)
    // ─────────────────────────────────────────────

    _renderBusGraph() {
        const container = document.getElementById('kas-bus-graph');
        if (!container) return;
        container.innerHTML = '';

        for (const [name, cfg] of Object.entries(this.audioMap.buses || {})) {
            const level = window.KAE?.getBusLevel(name) ?? 0;
            const pct   = Math.round((cfg.gain ?? 1) * 100);

            const card = document.createElement('div');
            card.className = 'kas-bus-card';
            card.innerHTML = `
                <div class="kas-bus-card-header">
                    <div class="kas-bus-name">${name.toUpperCase()}</div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        ${cfg.parent ? `<span class="kas-chip">→ ${cfg.parent}</span>` : '<span class="kas-chip" style="color:var(--kas-red);">ROOT</span>'}
                        ${cfg.ducking ? '<span class="kas-chip mapped">duck</span>' : ''}
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <canvas class="kas-spectrum" id="bus-spectrum-${name}" height="48"></canvas>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:16px;font-weight:700;font-family:var(--font-mono);color:var(--kas-red);">${pct}%</div>
                        <div style="font-size:10px;color:var(--text-muted);">gain</div>
                    </div>
                </div>
                <div style="margin-top:8px;">
                    <input type="range" class="kas-range" min="0" max="1.5" step="0.01" value="${cfg.gain ?? 1}" 
                        oninput="kas._onBusGainInput('${name}', parseFloat(this.value))">
                </div>
            `;
            container.appendChild(card);
        }
    }

    _onBusGainInput(name, gain) {
        if (this.audioMap.buses[name]) this.audioMap.buses[name].gain = gain;
        if (window.KAE) window.KAE.setBusGain(name, gain);
        this.isDirty = true;
    }

    // ─────────────────────────────────────────────
    //  SYNTH TAB
    // ─────────────────────────────────────────────

    _buildSynthGrid() {
        const grid = document.getElementById('kas-synth-grid');
        if (!grid) return;
        grid.innerHTML = '';

        SYNTH_TYPES.forEach(st => {
            const card = document.createElement('div');
            card.className = 'kas-synth-card';
            card.innerHTML = `
                <div class="kas-synth-card-icon">${st.icon}</div>
                <div class="kas-synth-card-name">${st.name}</div>
                <div class="kas-synth-card-desc">${st.desc}</div>
            `;
            card.onclick = () => this._selectSynthType(st.id);
            grid.appendChild(card);
        });
    }

    _selectSynthType(type) {
        this._synthType = type;
        this._generateSynthPreview(type);

        const editorEl = document.getElementById('kas-synth-editor');
        const attachBtn = document.getElementById('synth-btn-attach');
        if (editorEl) {
            editorEl.classList.remove('kas-hidden');
            editorEl.innerHTML = `
                <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;">
                    <div class="kas-section-label" style="margin-bottom:12px;">⚙ ${type.toUpperCase()} GENERATOR</div>
                    <div class="kas-slider-row">
                        <div class="kas-slider-header"><span class="kas-slider-name">Frequency (Hz)</span><span class="kas-slider-val" id="synth-freq-val">440Hz</span></div>
                        <input type="range" class="kas-range" id="synth-freq" min="40" max="12000" step="10" value="440">
                    </div>
                    <div class="kas-slider-row">
                        <div class="kas-slider-header"><span class="kas-slider-name">Decay</span><span class="kas-slider-val" id="synth-decay-val">20</span></div>
                        <input type="range" class="kas-range" id="synth-decay" min="1" max="100" step="1" value="20">
                    </div>
                    <div class="kas-slider-row">
                        <div class="kas-slider-header"><span class="kas-slider-name">Duration (s)</span><span class="kas-slider-val" id="synth-dur-val">0.3s</span></div>
                        <input type="range" class="kas-range" id="synth-dur" min="0.05" max="3" step="0.05" value="0.3">
                    </div>
                </div>
            `;

            // Bind live preview on param change
            ['synth-freq', 'synth-decay', 'synth-dur'].forEach(id => {
                document.getElementById(id)?.addEventListener('input', e => {
                    const valId = id + '-val';
                    const valEl = document.getElementById(valId);
                    if (valEl) {
                        if (id === 'synth-freq')  valEl.textContent = Math.round(e.target.value) + 'Hz';
                        if (id === 'synth-decay')  valEl.textContent = e.target.value;
                        if (id === 'synth-dur')    valEl.textContent = parseFloat(e.target.value).toFixed(2) + 's';
                    }
                    this._generateSynthPreview(type);
                });
            });
        }

        if (attachBtn) attachBtn.disabled = !this.activeEventId;
    }

    _getSynthParams() {
        return {
            freq:     parseFloat(document.getElementById('synth-freq')?.value || '440'),
            decay:    parseFloat(document.getElementById('synth-decay')?.value || '20'),
            duration: parseFloat(document.getElementById('synth-dur')?.value || '0.3')
        };
    }

    _generateSynthPreview(type) {
        if (!window.KAE) return;
        const params = this._getSynthParams();
        const buf = window.KAE._generateSynthetic(type, params);
        this._synthBuf = buf;
        if (buf) this._drawSynthWaveform(buf);
    }

    _drawSynthWaveform(buf) {
        const canvas = document.getElementById('kas-synth-canvas');
        if (!canvas || !buf) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.offsetWidth || 800;
        const H = 80;
        canvas.width = W; canvas.height = H;
        ctx.clearRect(0, 0, W, H);

        const data = buf.getChannelData(0);
        const step = Math.ceil(data.length / W);
        const halfH = H / 2;

        ctx.strokeStyle = '#e53e3e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < W; x++) {
            let sum = 0;
            for (let i = x * step; i < (x + 1) * step && i < data.length; i++) sum += data[i];
            const avg = sum / step;
            const y = halfH - avg * halfH * 0.9;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Synth tab button bindings
    _bindSynthButtons() {
        document.getElementById('synth-btn-preview')?.addEventListener('click', () => {
            if (this._synthBuf && window.KAE) {
                window.KAE._playBuffer(this._synthBuf, { volume: 0.9, bus: 'sfx' });
            }
        });
        document.getElementById('synth-btn-export')?.addEventListener('click', () => {
            if (this._synthBuf) this._exportBufferAsWav(this._synthBuf, `${this._synthType || 'synth'}.wav`);
        });
        document.getElementById('synth-btn-attach')?.addEventListener('click', () => {
            if (this._synthType && this.activeEventId) {
                const assetName = `synth_${this._synthType}_${Date.now()}.wav`;
                alert(`In a full export flow, this WAV would be saved as:\n${assetName}\nand attached to "${this.activeEventId}"`);
            }
        });
    }

    _exportBufferAsWav(audioBuffer, filename) {
        if (!audioBuffer) return;
        const wav  = this._encodeWav(audioBuffer);
        const blob = new Blob([wav], { type: 'audio/wav' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    _encodeWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate  = buffer.sampleRate;
        const samples     = buffer.length;
        const byteLength  = 44 + samples * numChannels * 2;
        const arrayBuffer = new ArrayBuffer(byteLength);
        const view        = new DataView(arrayBuffer);

        const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
        writeStr(0, 'RIFF');
        view.setUint32(4, byteLength - 8, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true);
        view.setUint16(32, numChannels * 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, samples * numChannels * 2, true);

        let offset = 44;
        for (let i = 0; i < samples; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
                view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                offset += 2;
            }
        }
        return arrayBuffer;
    }

    // ─────────────────────────────────────────────
    //  DRUM MACHINE
    // ─────────────────────────────────────────────

    _buildDrumGrid() {
        const grid = document.getElementById('drum-grid');
        const labels = document.getElementById('drum-beat-labels');
        if (!grid) return;
        grid.innerHTML = '';

        if (labels) {
            labels.innerHTML = Array(16).fill(0).map((_, i) => `<div style="flex:1;text-align:center;font-size:9px;">${i + 1}</div>`).join('');
        }

        DRUM_ROWS.forEach(rowName => {
            const label = document.createElement('div');
            label.className = 'kas-drum-label';
            label.textContent = rowName;
            grid.appendChild(label);

            const pads = document.createElement('div');
            pads.style.cssText = 'display:flex;flex:1;gap:3px;';
            grid.appendChild(pads);

            for (let i = 0; i < 16; i++) {
                const pad = document.createElement('div');
                pad.className = 'kas-drum-pad' + (i % 4 === 0 ? ' beat-4' : '') + (this._drumPattern[rowName][i] ? ' on' : '');
                pad.dataset.row  = rowName;
                pad.dataset.step = i;
                pad.onclick = () => {
                    this._drumPattern[rowName][i] = !this._drumPattern[rowName][i];
                    pad.classList.toggle('on', this._drumPattern[rowName][i]);
                };
                pads.appendChild(pad);
            }
        });
    }

    _drumPlay() {
        if (this._drumPlaying) return;
        this._drumPlaying = true;
        this._drumStep    = 0;
        const bpm  = this._drumBpm || 120;
        const ms   = (60000 / bpm) / 4; // 16th note

        const tick = () => {
            if (!this._drumPlaying) return;
            const step = this._drumStep % 16;

            DRUM_ROWS.forEach(row => {
                if (this._drumPattern[row][step] && window.KAE) {
                    const snd = DRUM_SOUNDS[row];
                    const buf = window.KAE._generateSynthetic(snd.type, snd.params);
                    if (buf) window.KAE._playBuffer(buf, { volume: 0.85, bus: 'sfx' });
                }
            });

            // Highlight active column
            document.querySelectorAll('.kas-drum-pad').forEach(p => {
                p.style.outline = (parseInt(p.dataset.step) === step) ? '1px solid var(--kas-red)' : '';
            });

            this._drumStep++;
            this._drumTimer = setTimeout(tick, ms);
        };
        tick();
    }

    _drumStop() {
        this._drumPlaying = false;
        if (this._drumTimer) clearTimeout(this._drumTimer);
        document.querySelectorAll('.kas-drum-pad').forEach(p => { p.style.outline = ''; });
    }

    _drumClear() {
        this._drumStop();
        DRUM_ROWS.forEach(r => { this._drumPattern[r] = new Array(16).fill(false); });
        this._buildDrumGrid();
    }

    _drumRandomize() {
        DRUM_ROWS.forEach(r => {
            this._drumPattern[r] = Array(16).fill(0).map(() => Math.random() > 0.75);
        });
        this._buildDrumGrid();
    }

    // ─────────────────────────────────────────────
    //  PREVIEW SCENARIOS
    // ─────────────────────────────────────────────

    _runScenario(mode) {
        this._stopScenario();
        const el = document.getElementById('prev-state');
        if (el) el.textContent = `preview: ${mode}…`;

        const events = {
            ui:         ['ui:click', 'ui:hover', 'ui:open'],
            traversal:  ['player:footstep', 'player:jump', 'player:land'],
            combat:     ['player:attack', 'enemy:hurt', 'projectile:fire', 'enemy:death']
        }[mode] || [];

        let i = 0;
        const tick = () => {
            if (window.KAE && events.length) {
                window.KAE.playEvent(events[i % events.length]);
                i++;
            }
            this._previewTimer = setTimeout(tick, 300 + Math.random() * 400);
        };
        tick();
    }

    _stopScenario() {
        if (this._previewTimer) clearTimeout(this._previewTimer);
        const el = document.getElementById('prev-state');
        if (el) el.textContent = 'preview: idle';
    }

    // ─────────────────────────────────────────────
    //  FX PLUGIN CHOOSER
    // ─────────────────────────────────────────────

    _showAddFxMenu() {
        const names = Object.keys(PLUGIN_REGISTRY);
        const choice = prompt(`Choose a plugin:\n${names.map((n, i) => `${i + 1}. ${PLUGIN_REGISTRY[n].name}`).join('\n')}`);
        const idx = parseInt(choice) - 1;
        if (!isNaN(idx) && names[idx]) {
            this._syncStatus(`FX: ${PLUGIN_REGISTRY[names[idx]].name} (wired in full build)`);
        }
    }

    // ─────────────────────────────────────────────
    //  STATUS / AUTOSAVE
    // ─────────────────────────────────────────────

    _syncStatus(msg, color = null) {
        const label = document.getElementById('kas-sync-label');
        const dot   = document.getElementById('kas-sync-dot');
        if (label) label.textContent = msg;
        if (dot && color) {
            dot.style.background = color === 'green' ? 'var(--kas-green)'
                : color === 'red' ? 'var(--kas-red)' : 'var(--kas-amber)';
            dot.style.boxShadow = `0 0 6px ${dot.style.background}`;
        }
    }

    _updateStatusBar() {
        const all     = Object.keys(this.audioMap.events || {}).length;
        const mapped  = Object.values(this.audioMap.events || {}).filter(c => c.clips?.length).length;
        const assets  = this.assets.length;

        const sb = id => document.getElementById(id);
        if (sb('sb-events'))   sb('sb-events').textContent   = `events: ${all}`;
        if (sb('sb-mapped'))   sb('sb-mapped').textContent   = `mapped: ${mapped}`;
        if (sb('sb-unmapped')) sb('sb-unmapped').textContent = `unmapped: ${all - mapped}`;
        if (sb('sb-assets'))   sb('sb-assets').textContent   = `assets: ${assets}`;
        if (sb('sb-history'))  sb('sb-history').textContent  = `undo:${this.history.length} redo:${this.future.length}`;
        if (sb('sb-state'))    sb('sb-state').textContent    = `state: ${(window.KAE?.gameState || 'normal').toUpperCase()}`;
        if (sb('sb-env'))      sb('sb-env').textContent      = `env: ${(window.KAE?.environment || 'dry').toUpperCase()}`;
    }

    _startAutoSave() {
        setInterval(() => {
            if (this.autoSave && this.isDirty) {
                this.save({ silent: true });
            }
        }, 30000);
    }
}

// ─── GLOBAL BOOT ────────────────────────────────────────────

const kas = new AudioStudio();
window.kas = kas; // expose for inline onclick handlers

// Bind synth buttons after DOM is ready
window.addEventListener('load', () => { kas._bindSynthButtons(); });
