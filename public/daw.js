/**
 * VORTEX AUDIO STUDIO Pro - Core Engine v10.0
 * Complete DAW with 8-bit/32-bit synthesis, sampler, and full project management
 * Fixed: Piano roll, timeline, MIDI patterns, panel resizing
 * Integrated with EventBus, SharedProjectState, and AssetManager
 */

// Integration system references
let eventBus, projectState, assetManager;

function initializeDAWIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.VortexEventBus;
        projectState = window.VortexProjectState;
        assetManager = window.VortexAssetManager;
        
        if (eventBus) {
            // Listen for audio requests from cutscene editor
            eventBus.on('audio:request', (event) => {
                console.log('[DAW] Audio requested:', event.data.audioId);
            });
            
            // Listen for skill FX audio requests
            eventBus.on('skill:audio:request', (event) => {
                console.log('[DAW] Skill audio requested:', event.data.skillId);
            });
            
            console.log('[DAW] EventBus connected');
        }
    }
}

function broadcastAudioUpdate(audioName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`asset:audio:${action}`, {
            audioId: audioName,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`assets.audio.${audioName}`, {
            name: audioName,
            lastModified: Date.now()
        });
    }
}

// ============= GLOBAL CONSTANTS =============
const DAW_CONSTANTS = {
    BEAT_WIDTH: 64,          // Pixels per beat
    SIXTEENTH_WIDTH: 16,     // Pixels per 16th note
    NOTE_HEIGHT: 16,         // Pixels per piano roll row
    KEYS_COUNT: 72,          // C2 (36) to B7 (107) = 72 keys
    BARS_COUNT: 32,          // Default timeline length
    MIN_PITCH: 36,           // C2
    MAX_PITCH: 107,          // B7
    TRACK_HEIGHT: 48,        // Height of track lanes
};

class DAW {
    constructor() {
        // Initialize integration first
        initializeDAWIntegration();
        
        // Initialize audio engine
        this.engine = new AudioEngine();
        this.ctx = this.engine.ctx;
        
        this.recorder = new AudioRecorder(this.ctx);
        
        // State
        this.tracks = [];
        this.activeTrackId = 0;
        
        // Controllers
        this.prController = null;
        
        this.activeTab = 'piano';
        this.tool = 'pencil';
        this.snap = 0.25; // Quarter note snap
        this.loopEnabled = false;
        this.loopStart = 0;
        this.loopEnd = 16;
        
        this.dragState = null;
        this.resizeState = null;

        // Project manager
        this.projectManager = new ProjectManager(this);
        
        // Panel states
        this.panelStates = {
            left: { collapsed: false, width: 260 },
            right: { collapsed: false, width: 280 },
            bottom: { height: 320 }
        };
        
        // DOM elements
        this.dom = {
            trackList: document.getElementById('track-list'),
            lanes: document.getElementById('lanes'),
            pianoKeys: document.getElementById('pr-keys'),
            pianoGrid: document.getElementById('pr-grid'),
            pianoGridInner: document.getElementById('pr-grid-inner'),
            mixer: document.getElementById('mixer'),
            playhead: document.getElementById('playhead'),
            prPlayhead: document.getElementById('pr-playhead'),
            lcdTime: document.getElementById('lcd-time'),
            lcdBPM: document.getElementById('lcd-bpm'),
            activeTrackLabel: document.getElementById('active-track-label'),
            timelineRuler: document.getElementById('timeline-ruler'),
            velocityLane: document.getElementById('pr-velocity'),
            trackLanes: document.getElementById('track-lanes')
        };

        this.init();
        this.bindEvents();
    }

    init() {
        console.log('VORTEX Audio Studio Pro v10.0 - Initializing...');
        
        // Create default tracks
        this.addTrack('synth', 'Lead 8-Bit', '8bit');
        this.addTrack('synth', 'Bass 32-Bit', '32bit');
        this.addTrack('sampler', 'Drums');
        
        console.log('Created ' + this.tracks.length + ' tracks');
        
        // Select first track
        if (this.tracks.length > 0) {
            this.selectTrack(0);
        }
        
        this.renderAll();
        this.renderPianoKeys();
        this.renderTimelineRuler();
        
        // Initialize Piano Roll Controller
        if (window.PianoRollController) {
            this.prController = new PianoRollController(this);
        }
        
        // Initialize preset list
        this.updatePresetList();
        this.populateBrowserPresets();
        
        // Set default tool
        this.setTool('pencil');
        
        // Load panel states from localStorage
        this.loadPanelStates();
        
        requestAnimationFrame(() => this.drawLoop());
        
        console.log('DAW initialized successfully');
        
        // Check for auto-save
        setTimeout(() => {
            const hasAutoSave = localStorage.getItem('ketebe_daw_autosave');
            if (hasAutoSave && confirm('Load auto-saved project?')) {
                this.projectManager.loadAutoSave();
                this.renderAll();
            }
        }, 500);
    }

    bindEvents() {
        window.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));
        
        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Prevent context menu on grid
        if (this.dom.pianoGrid) {
            this.dom.pianoGrid.addEventListener('contextmenu', (e) => e.preventDefault());
            
            // Sync scroll between keys and grid
            this.dom.pianoGrid.addEventListener('scroll', () => {
                if (this.dom.pianoKeys) {
                    this.dom.pianoKeys.scrollTop = this.dom.pianoGrid.scrollTop;
                }
                this.renderVelocityLane();
            });
        }
        
        // Sync scroll between track headers and lanes
        if (this.dom.trackLanes) {
            this.dom.trackLanes.addEventListener('scroll', () => {
                const headers = document.getElementById('track-headers');
                if (headers) {
                    headers.scrollTop = this.dom.trackLanes.scrollTop;
                }
                // Sync timeline ruler scroll
                if (this.dom.timelineRuler) {
                    this.dom.timelineRuler.scrollLeft = this.dom.trackLanes.scrollLeft;
                }
            });
        }
        
        // Setup resize handles
        this.setupResizeHandles();
        
        // Setup timeline ruler for seeking
        this.setupTimelineSeek();
        
        this.setupKnobs();
    }
    
    // ============= TIMELINE SEEKING =============
    
    setupTimelineSeek() {
        const ruler = this.dom.timelineRuler;
        if (!ruler) return;
        
        let isDragging = false;
        
        const seekFromEvent = (e) => {
            const rect = ruler.getBoundingClientRect();
            const x = e.clientX - rect.left + ruler.scrollLeft;
            const beat = Math.max(0, x / DAW_CONSTANTS.BEAT_WIDTH);
            this.seekToBeat(beat);
        };
        
        ruler.addEventListener('mousedown', (e) => {
            if (e.target.closest('.ruler-bar')) {
                isDragging = true;
                seekFromEvent(e);
                e.preventDefault();
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                seekFromEvent(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        // Also make playhead in track lanes clickable
        const trackLanes = this.dom.trackLanes;
        if (trackLanes) {
            trackLanes.addEventListener('mousedown', (e) => {
                // Only seek if clicking directly on lanes background (not on clips)
                if (e.target === trackLanes || e.target.id === 'lanes') {
                    const rect = trackLanes.getBoundingClientRect();
                    const x = e.clientX - rect.left + trackLanes.scrollLeft;
                    const beat = Math.max(0, x / DAW_CONSTANTS.BEAT_WIDTH);
                    this.seekToBeat(beat);
                }
            });
        }
    }
    
    // ============= RESIZE & PANEL MANAGEMENT =============
    
    setupResizeHandles() {
        const leftHandle = document.getElementById('resize-left');
        const rightHandle = document.getElementById('resize-right');
        const bottomHandle = document.getElementById('resize-bottom');
        
        if (leftHandle) {
            leftHandle.addEventListener('mousedown', (e) => this.startPanelResize(e, 'left'));
        }
        if (rightHandle) {
            rightHandle.addEventListener('mousedown', (e) => this.startPanelResize(e, 'right'));
        }
        if (bottomHandle) {
            bottomHandle.addEventListener('mousedown', (e) => this.startPanelResize(e, 'bottom'));
        }
    }
    
    startPanelResize(e, panel) {
        e.preventDefault();
        const panelEl = document.getElementById(panel + '-panel');
        if (!panelEl) return;
        
        this.resizeState = {
            panel: panel,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: panelEl.offsetWidth,
            startHeight: panelEl.offsetHeight
        };
        
        document.body.style.cursor = panel === 'bottom' ? 'row-resize' : 'col-resize';
        document.getElementById('resize-' + panel)?.classList.add('active');
    }
    
    handlePanelResize(e) {
        if (!this.resizeState) return;
        
        const { panel, startX, startY, startWidth, startHeight } = this.resizeState;
        const panelEl = document.getElementById(panel + '-panel');
        if (!panelEl) return;
        
        if (panel === 'left') {
            const newWidth = Math.max(180, Math.min(400, startWidth + (e.clientX - startX)));
            panelEl.style.width = newWidth + 'px';
            this.panelStates.left.width = newWidth;
            // Update timeline ruler margin
            if (this.dom.timelineRuler) {
                this.dom.timelineRuler.style.marginLeft = (newWidth + 4) + 'px';
            }
        } else if (panel === 'right') {
            const newWidth = Math.max(180, Math.min(400, startWidth - (e.clientX - startX)));
            panelEl.style.width = newWidth + 'px';
            this.panelStates.right.width = newWidth;
        } else if (panel === 'bottom') {
            const newHeight = Math.max(200, Math.min(600, startHeight - (e.clientY - startY)));
            panelEl.style.height = newHeight + 'px';
            this.panelStates.bottom.height = newHeight;
        }
    }
    
    endPanelResize() {
        if (this.resizeState) {
            document.body.style.cursor = '';
            document.getElementById('resize-' + this.resizeState.panel)?.classList.remove('active');
            this.resizeState = null;
            this.savePanelStates();
        }
    }
    
    togglePanel(panel) {
        const panelEl = document.getElementById(panel + '-panel');
        const btn = panelEl?.querySelector('.collapse-btn i');
        if (!panelEl) return;
        
        this.panelStates[panel].collapsed = !this.panelStates[panel].collapsed;
        
        if (this.panelStates[panel].collapsed) {
            panelEl.classList.add('collapsed');
            if (btn) {
                btn.className = panel === 'left' ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
            }
        } else {
            panelEl.classList.remove('collapsed');
            panelEl.style.width = this.panelStates[panel].width + 'px';
            if (btn) {
                btn.className = panel === 'left' ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
            }
        }
        
        this.savePanelStates();
    }
    
    savePanelStates() {
        localStorage.setItem('ketebe_daw_panels', JSON.stringify(this.panelStates));
    }
    
    loadPanelStates() {
        const saved = localStorage.getItem('ketebe_daw_panels');
        if (saved) {
            try {
                const states = JSON.parse(saved);
                Object.assign(this.panelStates, states);
                
                // Apply saved states
                ['left', 'right'].forEach(panel => {
                    const el = document.getElementById(panel + '-panel');
                    if (el) {
                        el.style.width = this.panelStates[panel].width + 'px';
                        if (this.panelStates[panel].collapsed) {
                            el.classList.add('collapsed');
                        }
                    }
                });
                
                const bottomEl = document.getElementById('bottom-panel');
                if (bottomEl) {
                    bottomEl.style.height = this.panelStates.bottom.height + 'px';
                }
                
                // Update timeline ruler margin
                if (this.dom.timelineRuler) {
                    this.dom.timelineRuler.style.marginLeft = (this.panelStates.left.width + 4) + 'px';
                }
            } catch (e) {
                console.warn('Failed to load panel states:', e);
            }
        }
    }
    
    setSnap(value) {
        this.snap = parseFloat(value);
        if (this.prController) {
            this.prController.snap = this.snap;
            this.prController.snapEnabled = this.snap > 0;
        }
        console.log('Snap set to:', this.snap || 'Off');
    }
    
    handleKeyDown(e) {
        // Don't trigger if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        
        const isMod = e.ctrlKey || e.metaKey;

        switch(e.code) {
            case 'Space':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'KeyZ':
                if (isMod) {
                    e.preventDefault();
                    if (e.shiftKey) this.redo();
                    else this.undo();
                }
                break;
            case 'KeyY':
                if (isMod) {
                    e.preventDefault();
                    this.redo();
                }
                break;
            case 'KeyC':
                if (isMod && this.prController) {
                    e.preventDefault();
                    this.prController.copySelection();
                }
                break;
            case 'KeyV':
                if (isMod && this.prController) {
                    e.preventDefault();
                    this.prController.paste();
                }
                break;
            case 'Delete':
            case 'Backspace':
                if (this.prController) {
                    this.prController.deleteSelection();
                }
                break;
            case 'KeyD':
                this.setTool('pencil');
                break;
            case 'KeyE':
                this.setTool('erase');
                break;
            case 'KeyS':
                this.setTool('select');
                break;
            case 'KeyL':
                this.toggleLoop();
                break;
        }
    }

    // --- TRACKS & CLIPS ---

    addTrack(type, name, synthType = '32bit') {
        if (this.tracks.length >= 12) {
            alert('Maximum 12 tracks supported!');
            return null;
        }
        
        const id = this.tracks.length;
        
        if (!name) {
            if (type === 'synth') {
                if (synthType === '8bit') name = '8-Bit ' + (id + 1);
                else if (synthType === 'wavetable') name = 'Wavetable ' + (id + 1);
                else name = 'Synth ' + (id + 1);
            } else if (type === 'drum') {
                name = 'Drum Machine ' + (id + 1);
            } else {
                name = 'Sampler ' + (id + 1);
            }
        }
        
        const track = new Track(id, name, type, this.engine);
        
        let instrument = null;
        if (type === 'synth') {
            if (synthType === '8bit') {
                instrument = new Synth8Bit(this.ctx);
                InstrumentPresets.applyPreset(instrument, 'Lead (Square)', '8bit');
            } else if (synthType === 'wavetable') {
                instrument = new SynthWavetable(this.ctx);
                InstrumentPresets.applyPreset(instrument, 'Digital Edge', 'wavetable');
            } else {
                instrument = new Synth32Bit(this.ctx);
                InstrumentPresets.applyPreset(instrument, 'Analog Lead', '32bit');
            }
        } else if (type === 'drum') {
            instrument = new DrumMachine(this.ctx);
        } else if (type === 'sampler') {
            instrument = new Sampler(this.ctx);
        }
        
        if (instrument) {
            track.setInstrument(instrument);
        }
        
        this.tracks.push(track);
        this.selectTrack(id);
        this.renderAll();
        return track;
    }
    
    clearAllTracks() {
        this.tracks.forEach(track => track.dispose());
        this.tracks = [];
        this.activeTrackId = 0;
    }

    selectTrack(id) {
        if (id < 0 || id >= this.tracks.length) return;
        this.activeTrackId = id;
        const track = this.tracks[id];
        
        this.dom.activeTrackLabel.innerText = track.name.toUpperCase();
        
        this.renderTracks();
        this.renderTimeline();
        this.renderMixer();
        this.updateDevicePanel();
        this.renderPianoGrid();
        
        console.log('Selected track ' + id + ': ' + track.name);
    }

    // --- RENDERING ---

    renderAll() {
        this.renderTracks();
        this.renderTimeline();
        this.renderMixer();
        this.renderPianoGrid();
    }
    
    renderTimelineRuler() {
        if (!this.dom.timelineRuler) return;
        this.dom.timelineRuler.innerHTML = '';
        
        const { BEAT_WIDTH, BARS_COUNT } = DAW_CONSTANTS;
        const barWidth = BEAT_WIDTH * 4; // 4 beats per bar = 256px
        
        // Calculate total width based on bars
        const totalWidth = BARS_COUNT * barWidth;
        this.dom.timelineRuler.style.minWidth = totalWidth + 'px';
        
        for (let i = 1; i <= BARS_COUNT; i++) {
            const bar = document.createElement('div');
            bar.className = 'ruler-bar';
            bar.innerHTML = `<span>${i}</span>`;
            
            // Add beat markers
            for (let b = 1; b < 4; b++) {
                const beatMark = document.createElement('div');
                beatMark.className = 'ruler-beat';
                bar.appendChild(beatMark);
            }
            
            this.dom.timelineRuler.appendChild(bar);
        }
    }
    
    populateBrowserPresets() {
        const container = document.getElementById('browser-presets');
        if (!container) return;
        
        container.innerHTML = '';
        const presets8bit = Object.keys(InstrumentPresets.get8BitPresets()).slice(0, 5);
        const presets32bit = Object.keys(InstrumentPresets.get32BitPresets()).slice(0, 5);
        
        presets8bit.forEach(name => {
            const item = document.createElement('div');
            item.className = 'browser-item';
            item.innerHTML = '<i class="fas fa-music"></i> ' + name;
            container.appendChild(item);
        });
        
        presets32bit.forEach(name => {
            const item = document.createElement('div');
            item.className = 'browser-item';
            item.innerHTML = '<i class="fas fa-music"></i> ' + name;
            container.appendChild(item);
        });
    }

    renderTracks() {
        this.dom.trackList.innerHTML = '';
        // Pixel Palette Colors
        const colors = ['var(--px-blue)', 'var(--px-green)', 'var(--px-yellow)', 'var(--px-magenta)', 'var(--px-red)', 'var(--px-cyan)'];
        
        this.tracks.forEach(t => {
            const el = document.createElement('div');
            el.className = 'pixel-track-header' + (t.id === this.activeTrackId ? ' active' : '');
            
            // Determine icon
            let iconClass = 'fa-wave-square';
            if (t.type === 'drum' || (t.instrument && t.instrument.constructor.name === 'DrumMachine')) iconClass = 'fa-drum';
            else if (t.type === 'sampler') iconClass = 'fa-th';
            else if (t.type === 'audio') iconClass = 'fa-microphone';
            
            // Meter
            const meterLevel = Math.min(100, t.getRMSLevel() * 100); 
            // Use RMS from track (updated in drawLoop)
            
            el.innerHTML = `
                <div class="pixel-track-icon">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="pixel-track-info">
                    <div class="pixel-track-name">${t.name}</div>
                    <div class="pixel-track-controls">
                        <div class="pixel-toggle mute ${t.muted ? 'active' : ''}" onclick="daw.toggleMute(${t.id}, event)">M</div>
                        <div class="pixel-toggle solo ${t.solo ? 'active' : ''}" onclick="daw.toggleSolo(${t.id}, event)">S</div>
                        <div class="pixel-toggle" onclick="daw.deleteTrack(${t.id}, event)" title="Delete" style="color:var(--px-red); border-color:var(--px-red);"><i class="fas fa-times"></i></div>
                    </div>
                    <div class="health-meter-bg">
                        <div class="health-meter-fill" id="meter-${t.id}" style="width: ${meterLevel}%"></div>
                    </div>
                </div>
            `;
            
            el.onclick = (e) => {
                if (!e.target.classList.contains('pixel-toggle')) {
                    this.selectTrack(t.id);
                }
            };
            this.dom.trackList.appendChild(el);
        });
    }

    renderTimeline() {
        this.dom.lanes.innerHTML = '';
        const colors = ['#2980b9', '#27ae60', '#f39c12', '#9b59b6', '#e74c3c', '#1abc9c'];
        const { BEAT_WIDTH, BARS_COUNT, TRACK_HEIGHT } = DAW_CONSTANTS;
        
        // Set lanes container width to match timeline
        const totalWidth = BARS_COUNT * 4 * BEAT_WIDTH;
        this.dom.lanes.style.minWidth = totalWidth + 'px';

        this.tracks.forEach(t => {
            const lane = document.createElement('div');
            lane.className = 'pixel-track-lane';
            lane.dataset.trackId = t.id;
            lane.style.minWidth = totalWidth + 'px';
            
            // Double-click to add pattern
            lane.ondblclick = (e) => {
                if (e.target === lane) {
                    this.selectTrack(t.id);
                    // Calculate beat position
                    const rect = lane.getBoundingClientRect();
                    const x = e.clientX - rect.left + this.dom.trackLanes.scrollLeft;
                    const beat = Math.floor(x / BEAT_WIDTH / 4) * 4; // Snap to bar
                    console.log('Double-clicked at bar:', Math.floor(beat / 4) + 1);
                }
            };
            
            lane.onclick = (e) => {
                if (e.target === lane) {
                    this.selectTrack(t.id);
                }
            };
            
            // Render MIDI Clips (group notes into clips by proximity)
            if (t.notes && t.notes.length > 0) {
                const color = colors[t.id % colors.length];
                
                // Simple grouping: find min/max to create single clip
                let minStart = Infinity;
                let maxEnd = 0;
                let minPitch = 127;
                let maxPitch = 0;
                
                t.notes.forEach(n => {
                    if (n.startBeat < minStart) minStart = n.startBeat;
                    if (n.startBeat + n.lengthBeats > maxEnd) maxEnd = n.startBeat + n.lengthBeats;
                    if (n.pitch < minPitch) minPitch = n.pitch;
                    if (n.pitch > maxPitch) maxPitch = n.pitch;
                });
                
                if (minStart === Infinity) minStart = 0;
                
                const startPx = minStart * BEAT_WIDTH;
                const widthPx = Math.max(BEAT_WIDTH, (maxEnd - minStart) * BEAT_WIDTH);
                
                const clip = document.createElement('div');
                clip.className = 'pixel-clip' + (t.id === this.activeTrackId ? ' selected' : '');
                clip.style.left = startPx + 'px';
                clip.style.width = widthPx + 'px';
                clip.style.borderColor = color;
                clip.style.background = color.replace(')', ', 0.25)').replace('rgb', 'rgba');
                
                // Mini note visualization
                const clipHeight = TRACK_HEIGHT - 18; // Subtract header height
                const pitchRange = Math.max(1, maxPitch - minPitch);
                
                let miniNotesHtml = '';
                t.notes.forEach(n => {
                    const nLeft = (n.startBeat - minStart) * BEAT_WIDTH;
                    const nWidth = Math.max(2, n.lengthBeats * BEAT_WIDTH - 1);
                    // Map pitch to vertical position within clip
                    const pitchRatio = (n.pitch - minPitch) / (pitchRange || 1);
                    const nTop = (1 - pitchRatio) * (clipHeight - 4);
                    miniNotesHtml += `<div class="pixel-clip-note" style="left:${nLeft}px; width:${nWidth}px; top:${nTop}px;"></div>`;
                });

                clip.innerHTML = `
                    <div class="pixel-clip-header" style="background:${color};">${t.name}</div>
                    <div class="pixel-clip-content">${miniNotesHtml}</div>
                `;
                
                clip.dataset.trackId = t.id;
                clip.dataset.clipType = 'midi';
                
                clip.onclick = (e) => {
                    e.stopPropagation();
                    this.selectTrack(t.id);
                };
                
                // Make clip draggable
                clip.onmousedown = (e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    
                    const rect = lane.getBoundingClientRect();
                    const startX = e.clientX;
                    const clipStartLeft = parseFloat(clip.style.left);
                    
                    const onMove = (moveE) => {
                        const dx = moveE.clientX - startX;
                        const newLeft = Math.max(0, clipStartLeft + dx);
                        const snappedBeat = this.snapToBeat(newLeft / BEAT_WIDTH);
                        clip.style.left = (snappedBeat * BEAT_WIDTH) + 'px';
                    };
                    
                    const onUp = (upE) => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        
                        // Calculate new start position
                        const newLeft = parseFloat(clip.style.left);
                        const newStartBeat = newLeft / BEAT_WIDTH;
                        const oldStartBeat = minStart;
                        const delta = newStartBeat - oldStartBeat;
                        
                        // Move all notes by delta
                        if (Math.abs(delta) > 0.01) {
                            t.notes.forEach(n => {
                                n.startBeat += delta;
                            });
                            this.renderTimeline();
                            this.renderPianoRoll();
                        }
                    };
                    
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                };
                
                lane.appendChild(clip);
            }

            // Render Audio Clips
            if (t.audioClips && t.audioClips.length > 0) {
                t.audioClips.forEach(ac => {
                    const startPx = ac.startBeat * BEAT_WIDTH;
                    const widthPx = Math.max(BEAT_WIDTH, ac.durationBeats * BEAT_WIDTH);
                    
                    const clip = document.createElement('div');
                    clip.className = 'pixel-clip';
                    clip.style.left = startPx + 'px';
                    clip.style.width = widthPx + 'px';
                    clip.style.borderColor = '#1abc9c';
                    clip.style.background = 'rgba(26, 188, 156, 0.25)';
                    
                    // Simulated Waveform
                    let waveHtml = '<div style="display:flex; align-items:center; height:100%; padding:0 2px;">';
                    const bars = Math.max(10, Math.floor(widthPx / 8));
                    for (let i = 0; i < bars; i++) {
                        const h = 20 + Math.random() * 60;
                        waveHtml += `<div style="flex:1; margin:0 1px; background:#1abc9c; height:${h}%;"></div>`;
                    }
                    waveHtml += '</div>';

                    clip.innerHTML = `
                        <div class="pixel-clip-header" style="background:#1abc9c;">AUDIO</div>
                        <div class="pixel-clip-content">${waveHtml}</div>
                    `;
                    lane.appendChild(clip);
                });
            }
            
            this.dom.lanes.appendChild(lane);
        });
    }

    renderMixer() {
        this.dom.mixer.innerHTML = '';
        
        // Render Tracks
        this.tracks.forEach(t => {
            const strip = document.createElement('div');
            strip.className = 'pixel-mixer-channel' + (t.id === this.activeTrackId ? ' active' : '');
            
            // Meter Segments
            let meterHtml = '';
            for(let i=0; i<20; i++) {
                let segClass = 'pixel-meter-seg';
                if (i >= 14) segClass += ' warn';
                if (i >= 18) segClass += ' clip';
                meterHtml += `<div class="${segClass}" id="meter-seg-${t.id}-${i}"></div>`;
            }

            strip.innerHTML = `
                <div class="pixel-mixer-name">${t.name}</div>
                <div style="flex:1; display:flex; justify-content:center; gap:8px;">
                    <div class="pixel-meter-strip">${meterHtml}</div>
                    <input type="range" class="pixel-fader" min="0" max="1" step="0.01" 
                        value="${t.volume}" oninput="daw.setTrackVolume(${t.id}, this.value)">
                </div>
                <div class="pixel-track-controls" style="justify-content:center; margin-top:8px;">
                    <div class="pixel-toggle mute ${t.muted ? 'active' : ''}" onclick="daw.toggleMute(${t.id}, event)">M</div>
                    <div class="pixel-toggle solo ${t.solo ? 'active' : ''}" onclick="daw.toggleSolo(${t.id}, event)">S</div>
                </div>
            `;
            
            strip.onclick = (e) => {
                if(e.target.tagName !== 'INPUT' && !e.target.classList.contains('pixel-toggle')) {
                    this.selectTrack(t.id);
                }
            };
            this.dom.mixer.appendChild(strip);
        });

        // Master Channel
        const master = document.createElement('div');
        master.className = 'pixel-mixer-channel master';
        let masterMeterHtml = '';
        for(let i=0; i<20; i++) {
            let segClass = 'pixel-meter-seg';
            if (i >= 14) segClass += ' warn';
            if (i >= 18) segClass += ' clip';
            masterMeterHtml += `<div class="${segClass}" id="meter-seg-master-${i}"></div>`;
        }
        
        master.innerHTML = `
            <div class="pixel-mixer-name" style="color:var(--px-red)">MASTER</div>
            <div style="flex:1; display:flex; justify-content:center; gap:8px;">
                <div class="pixel-meter-strip">${masterMeterHtml}</div>
                <input type="range" class="pixel-fader" min="0" max="1" step="0.01" 
                    value="${this.engine.getMasterVolume()}" oninput="daw.engine.setMasterVolume(this.value)">
            </div>
        `;
        this.dom.mixer.appendChild(master);
    }
    
    setTrackVolume(id, val) {
        this.tracks[id].setVolume(parseFloat(val));
    }
    
    addInsertPrompt(trackId) {
        const type = prompt("Add Effect:\n1. Reverb (K-Verb)\n2. Delay (K-Delay)\n3. Compressor (K-Comp)\n4. Distortion (K-Drive)\n5. EQ (K-EQ3)");
        if(!type) return;

        const track = this.tracks[trackId];
        let plugin = null;

        switch(type) {
            case '1': plugin = new KVerb(this.ctx); break;
            case '2': plugin = new KDelay(this.ctx); break;
            case '3': plugin = new KComp(this.ctx); break;
            case '4': plugin = new KDrive(this.ctx); break;
            case '5': plugin = new KEQ3(this.ctx); break;
        }

        if(plugin) {
            track.mixerChannel.addInsert(plugin);
            this.renderMixer();
            this.editInsert(trackId, track.mixerChannel.inserts.length - 1);
        }
    }

    editInsert(trackId, insertIndex) {
        const track = this.tracks[trackId];
        const plugin = track.mixerChannel.inserts[insertIndex];
        
        const panel = document.getElementById('device-panel');
        panel.innerHTML = '';
        panel.style.display = 'block'; // Ensure visibility
        
        // Rack Container
        const rack = document.createElement('div');
        rack.className = 'pixel-rack';
        
        // The Pedal
        const pedal = document.createElement('div');
        pedal.className = 'pixel-pedal';
        
        pedal.innerHTML = `
            <div class="pixel-pedal-title">${plugin.name}</div>
            <div class="pixel-pedal-body"></div>
        `;
        
        // Append plugin interface to body
        // Note: Plugin interface currently returns a div with sliders. 
        // To make it truly pixel, we'd need to update AudioPlugin.js to return .pixel-knob structures.
        // For now, we wrap the existing interface.
        const body = pedal.querySelector('.pixel-pedal-body');
        body.appendChild(plugin.getInterface());
        
        rack.appendChild(pedal);
        panel.appendChild(rack);
        
        // Controls
        const controls = document.createElement('div');
        controls.style.padding = '8px';
        
        const backBtn = document.createElement('button');
        backBtn.className = 'pixel-btn';
        backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> BACK';
        backBtn.onclick = () => {
             this.selectTrack(this.activeTrackId);
        };
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'pixel-btn record'; // Red button
        removeBtn.style.marginLeft = '8px';
        removeBtn.innerHTML = '<i class="fas fa-trash"></i> REMOVE';
        removeBtn.onclick = () => {
            track.mixerChannel.removeInsert(insertIndex);
            this.renderMixer();
            this.selectTrack(trackId);
        };
        
        controls.appendChild(backBtn);
        controls.appendChild(removeBtn);
        
        panel.prepend(controls);
    }

    // --- PIANO ROLL ---

    renderPianoKeys() {
        this.dom.pianoKeys.innerHTML = '';
        const notes = ['B','A#','A','G#','G','F#','F','E','D#','D','C#','C'];
        // 6 octaves: C2 to B7 = 72 keys
        for (let oct = 7; oct >= 2; oct--) {
            notes.forEach(n => {
                const key = document.createElement('div');
                const isBlack = n.includes('#');
                const isC = n === 'C';
                key.className = 'pr-key ' + (isBlack ? 'black' : 'white') + (isC ? ' c-note' : '');
                key.dataset.note = n + oct;
                key.dataset.pitch = this.noteToPitch(n, oct);
                
                // Show note name for all white keys
                if (!isBlack) {
                    key.textContent = n + oct;
                }
                
                // Click to preview note
                key.onmousedown = () => {
                    const track = this.tracks[this.activeTrackId];
                    if (track) {
                        const pitch = parseInt(key.dataset.pitch);
                        track.playNote(pitch, 100, 0.3);
                        key.classList.add('playing');
                        setTimeout(() => key.classList.remove('playing'), 300);
                    }
                };
                
                this.dom.pianoKeys.appendChild(key);
            });
        }
    }
    
    noteToPitch(note, octave) {
        const noteMap = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11};
        return (octave + 1) * 12 + noteMap[note];
    }
    
    pitchToNoteInfo(pitch) {
        const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        const octave = Math.floor(pitch / 12) - 1;
        const note = noteNames[pitch % 12];
        return { note, octave, name: note + octave };
    }

    renderPianoGrid() {
        const { BEAT_WIDTH, NOTE_HEIGHT, KEYS_COUNT, BARS_COUNT, MIN_PITCH, MAX_PITCH, SIXTEENTH_WIDTH } = DAW_CONSTANTS;
        
        // Get or create the grid inner container
        let gridInner = this.dom.pianoGridInner || this.dom.pianoGrid?.querySelector('#pr-grid-inner');
        if (!gridInner) {
            gridInner = document.createElement('div');
            gridInner.id = 'pr-grid-inner';
            if (this.dom.pianoGrid) {
                this.dom.pianoGrid.appendChild(gridInner);
            }
        }
        this.dom.pianoGridInner = gridInner;
        
        // Clear existing notes
        gridInner.innerHTML = '';
        
        // Set grid dimensions
        const gridWidth = BARS_COUNT * 4 * BEAT_WIDTH; // 32 bars * 4 beats * 64px = 8192px
        const gridHeight = KEYS_COUNT * NOTE_HEIGHT;   // 72 keys * 16px = 1152px
        
        gridInner.style.width = gridWidth + 'px';
        gridInner.style.height = gridHeight + 'px';
        gridInner.style.position = 'relative';
        
        // Add black key row highlighting
        const blackKeyOffsets = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A# within octave
        for (let oct = 7; oct >= 2; oct--) {
            blackKeyOffsets.forEach(offset => {
                const pitch = (oct + 1) * 12 + offset;
                if (pitch >= MIN_PITCH && pitch <= MAX_PITCH) {
                    const row = document.createElement('div');
                    row.className = 'pr-grid-row-black';
                    row.style.top = ((MAX_PITCH - pitch) * NOTE_HEIGHT) + 'px';
                    gridInner.appendChild(row);
                }
            });
        }
        
        const track = this.tracks[this.activeTrackId];
        if (!track) return;
        
        // Add click handler to grid (not notes)
        gridInner.onmousedown = (e) => {
            // Only handle clicks on the grid itself, not on notes
            if (e.target === gridInner || e.target.classList.contains('pr-grid-row-black')) {
                this.handleGridClick(e);
            }
        };
        
        // Render notes
        if (track.notes && track.notes.length > 0) {
            track.notes.forEach((n) => {
                const el = document.createElement('div');
                el.className = 'note';
                el.dataset.noteId = n.id;
                
                // Check if note is selected
                if (this.prController && this.prController.selection.selectedNotes.has(n.id)) {
                    el.classList.add('selected');
                }
                
                // Calculate position - pitch 107 = B7 at top (row 0), pitch 36 = C2 at bottom
                const pitchOffset = MAX_PITCH - n.pitch;
                const top = pitchOffset * NOTE_HEIGHT + 1; // +1 for visual centering
                const left = n.startBeat * BEAT_WIDTH;
                const width = Math.max(SIXTEENTH_WIDTH, n.lengthBeats * BEAT_WIDTH) - 2; // -2 for visual margin
                
                el.style.top = top + 'px';
                el.style.left = left + 'px';
                el.style.width = width + 'px';
                el.style.height = (NOTE_HEIGHT - 2) + 'px';
                
                // Velocity indicator (opacity based on velocity)
                const velocityRatio = n.velocity / 127;
                el.style.opacity = 0.6 + velocityRatio * 0.4;
                
                // Resize handle
                const resize = document.createElement('div');
                resize.className = 'note-resize';
                resize.onmousedown = (e) => {
                    e.stopPropagation();
                    this.startNoteDrag(e, n, 'resize');
                };
                el.appendChild(resize);
                
                // Note click/drag handling
                el.onmousedown = (e) => {
                    if (e.target.classList.contains('note-resize')) return;
                    e.stopPropagation();
                    
                    // Right-click or eraser tool = delete
                    if (this.tool === 'erase' || e.button === 2) {
                        track.removeNote(n.id);
                        this.renderPianoGrid();
                        this.renderVelocityLane();
                        this.renderTimeline();
                    } else if (this.tool === 'select') {
                        // Selection logic
                        if (e.shiftKey) {
                            // Toggle selection
                            if (this.prController) {
                                this.prController.toggleSelection(n.id);
                            }
                        } else {
                            // Select and start drag
                            if (this.prController && !this.prController.selection.selectedNotes.has(n.id)) {
                                this.prController.clearSelection();
                                this.prController.selectNote(n.id);
                            }
                            this.startNoteDrag(e, n, 'move');
                        }
                    } else {
                        // Pencil tool - move note
                        this.startNoteDrag(e, n, 'move');
                    }
                };
                
                gridInner.appendChild(el);
            });
        }
        
        // Append selection box if exists
        if (this.prController && this.prController.selectionBox) {
            gridInner.appendChild(this.prController.selectionBox);
        }
        
        this.renderVelocityLane();
    }
    
    renderVelocityLane() {
        const velContainer = this.dom.velocityLane || document.getElementById('pr-velocity');
        if (!velContainer) return;
        
        velContainer.innerHTML = '';
        
        const track = this.tracks[this.activeTrackId];
        if (!track || !track.notes || track.notes.length === 0) return;
        
        const { BEAT_WIDTH } = DAW_CONSTANTS;
        const scrollLeft = this.dom.pianoGrid ? this.dom.pianoGrid.scrollLeft : 0;
        const keyWidth = 60;
        
        track.notes.forEach(n => {
            const bar = document.createElement('div');
            bar.className = 'velocity-bar';
            bar.style.left = (n.startBeat * BEAT_WIDTH + keyWidth - scrollLeft) + 'px';
            bar.style.height = Math.max(4, (n.velocity / 127) * 50) + 'px';
            bar.dataset.noteId = n.id;
            
            bar.onmousedown = (e) => {
                e.stopPropagation();
                this.startVelocityDrag(e, n);
            };
            
            velContainer.appendChild(bar);
        });
    }
    
    startVelocityDrag(e, note) {
        const startY = e.clientY;
        const startVel = note.velocity;
        
        this.dragState = {
            type: 'velocity',
            note: note,
            startY: startY,
            startVel: startVel
        };
    }

    handleGridClick(e) {
        if (this.dragState) return;
        
        const { BEAT_WIDTH, NOTE_HEIGHT, MAX_PITCH, MIN_PITCH } = DAW_CONSTANTS;
        const track = this.tracks[this.activeTrackId];
        if (!track) return;
        
        // Get click position relative to grid inner
        const gridInner = this.dom.pianoGridInner;
        if (!gridInner) return;
        
        const rect = gridInner.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Calculate beat and pitch from position
        let beat = x / BEAT_WIDTH;
        const pitchOffset = Math.floor(y / NOTE_HEIGHT);
        const pitch = MAX_PITCH - pitchOffset;
        
        // Validate pitch range
        if (pitch < MIN_PITCH || pitch > MAX_PITCH) return;
        
        if (this.tool === 'pencil') {
            // Snap to grid
            const snapValue = this.snap > 0 ? this.snap : 0.0625; // Default to 1/16 if snap is off
            beat = Math.floor(beat / snapValue) * snapValue;
            
            // Check if there's already a note at this position
            const existingNote = track.notes.find(n => 
                n.pitch === pitch && 
                beat >= n.startBeat && 
                beat < n.startBeat + n.lengthBeats
            );
            
            if (existingNote) {
                // Click on existing note area - do nothing (handled by note's own handler)
                return;
            }
            
            // Create new note
            const noteLength = this.snap > 0 ? this.snap : 0.25; // Default to quarter note
            const note = track.addNote(pitch, beat, noteLength, 100);
            
            // Play preview
            track.playNote(pitch, 100, 0.2);
            
            console.log(`Created note: ${this.pitchToNoteInfo(pitch).name} at beat ${beat.toFixed(2)}`);
            
            // Re-render
            this.renderPianoGrid();
            this.renderTimeline();
            
            // Start drag immediately to allow resizing the new note
            this.startNoteDrag(e, note, 'resize');
            
        } else if (this.tool === 'select') {
            // Start selection box
            if (this.prController) {
                this.prController.startSelectionBox(e);
            }
        } else if (this.tool === 'erase') {
            // Eraser on empty space - do nothing
        }
    }

    // --- INTERACTION ---

    setupKnobs() {
        document.querySelectorAll('.knob').forEach(k => {
            k.onmousedown = (e) => {
                e.stopPropagation();
                const track = this.tracks[this.activeTrackId];
                if (!track || !track.instrument) return;
                
                const param = k.dataset.p;
                const startVal = track.instrument.getParam(param) || 0;
                this.dragState = { 
                    type: 'knob', 
                    param, 
                    startY: e.clientY, 
                    startVal, 
                    el: k 
                };
            };
        });
    }

    startFaderDrag(e, trackId) {
        e.stopPropagation();
        this.dragState = { type: 'fader', trackId, startY: e.clientY, startVol: this.tracks[trackId].volume };
    }

    startNoteDrag(e, note, action) {
        e.stopPropagation();
        this.dragState = { 
            type: action, 
            note, 
            startX: e.clientX, 
            startY: e.clientY, 
            startStart: note.startBeat, 
            startLen: note.lengthBeats, 
            startPitch: note.pitch 
        };
    }

    handleGlobalMouseMove(e) {
        // Handle panel resize
        if (this.resizeState) {
            this.handlePanelResize(e);
            return;
        }
        
        // Delegate selection update
        if (this.prController && this.prController.selection.active) {
            this.prController.updateSelectionDrag(e);
        }
    
        if (!this.dragState) return;
        const s = this.dragState;
        const dy = s.startY - e.clientY;
        const dx = e.clientX - s.startX;

        const { BEAT_WIDTH, NOTE_HEIGHT, MIN_PITCH, MAX_PITCH } = DAW_CONSTANTS;
        
        // Snap helper
        const snapBeat = (beat) => {
            if (this.snap <= 0) return beat;
            return Math.round(beat / this.snap) * this.snap;
        };

        if (s.type === 'knob') {
            const val = Math.max(0, Math.min(1, s.startVal + dy * 0.01));
            this.tracks[this.activeTrackId].instrument.setParam(s.param, val);
            this.updateKnobVisual(s.el, val);
        } else if (s.type === 'fader') {
            const val = Math.max(0, Math.min(1, s.startVol + dy * 0.01));
            this.tracks[s.trackId].setVolume(val);
            this.renderMixer();
        } else if (s.type === 'move') {
            const beatDelta = dx / BEAT_WIDTH;
            const pitchDelta = Math.round(dy / NOTE_HEIGHT);
            
            // If dragging a selected note, move ALL selected notes
            if (this.prController && this.prController.selection.selectedNotes.has(s.note.id)) {
                if (!s.groupState) {
                    s.groupState = new Map();
                    this.prController.selection.selectedNotes.forEach(id => {
                        const note = this.tracks[this.activeTrackId].notes.find(n => n.id === id);
                        if (note) {
                            s.groupState.set(id, { startBeat: note.startBeat, startPitch: note.pitch });
                        }
                    });
                }
                
                s.groupState.forEach((state, id) => {
                    const note = this.tracks[this.activeTrackId].notes.find(n => n.id === id);
                    if (note) {
                        note.startBeat = Math.max(0, snapBeat(state.startBeat + beatDelta));
                        note.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, state.startPitch + pitchDelta));
                    }
                });
            } else {
                // Single note move
                s.note.startBeat = Math.max(0, snapBeat(s.startStart + beatDelta));
                s.note.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, s.startPitch + pitchDelta));
            }
            
            this.renderPianoGrid();
        } else if (s.type === 'resize') {
            const beatDelta = dx / BEAT_WIDTH;
            const newLen = s.startLen + beatDelta;
            const minLen = this.snap > 0 ? this.snap : 0.0625;
            s.note.lengthBeats = Math.max(minLen, snapBeat(newLen));
            this.renderPianoGrid();
        } else if (s.type === 'velocity') {
            const velDelta = dy * 2;
            s.note.velocity = Math.max(1, Math.min(127, Math.round(s.startVel + velDelta)));
            this.renderVelocityLane();
            this.renderPianoGrid();
        }
    }

    handleGlobalMouseUp() {
        // End panel resize
        if (this.resizeState) {
            this.endPanelResize();
        }
        
        // Delegate selection end
        if (this.prController && this.prController.selection.active) {
            this.prController.endSelectionBox();
        }
    
        if (this.dragState) {
            if (this.dragState.type === 'move') {
                const track = this.tracks[this.activeTrackId];
                if (track && this.dragState.note) {
                    track.playNote(this.dragState.note.pitch, 100, 0.2);
                }
                this.renderTimeline(); // Update clips after note move
            } else if (this.dragState.type === 'resize') {
                this.renderTimeline();
            }
            this.renderVelocityLane();
        }
        this.dragState = null;
    }
    
    updateKnobVisual(el, val) {
        const deg = (val * 270) - 135;
        el.style.transform = 'rotate(' + deg + 'deg)';
    }

    updatePresetList() {
        const categorySelect = document.getElementById('preset-category');
        const presetSelect = document.getElementById('preset-select');
        if (!presetSelect || !categorySelect) return;
        
        const category = categorySelect.value;
        presetSelect.innerHTML = '<option value="">Select Preset...</option>';
        
        let presets = {};
        if (category === '8bit') {
            presets = InstrumentPresets.get8BitPresets();
        } else if (category === '32bit') {
            presets = InstrumentPresets.get32BitPresets();
        } else if (category === 'wavetable') {
            presets = InstrumentPresets.getWavetablePresets();
        } else if (category === 'drums') {
            presets = InstrumentPresets.getDrumKitMappings();
        }
        
        Object.keys(presets).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.text = name;
            presetSelect.appendChild(option);
        });
    }
    
    changePreset() {
        const presetSelect = document.getElementById('preset-select');
        const categorySelect = document.getElementById('preset-category');
        if (!presetSelect || !categorySelect) return;

        const presetName = presetSelect.value;
        const category = categorySelect.value;
        if (!presetName) return;
        
        const track = this.tracks[this.activeTrackId];
        if (!track) return;
        
        const needsNewInstrument = 
            (category === '8bit' && !(track.instrument instanceof Synth8Bit)) ||
            (category === '32bit' && !(track.instrument instanceof Synth32Bit)) ||
            (category === 'wavetable' && !(track.instrument instanceof SynthWavetable)) ||
            (category === 'drums' && !(track.instrument instanceof DrumMachine));

        if (needsNewInstrument) {
            if (track.instrument) track.instrument.dispose();
            
            let newInstrument;
            if (category === '8bit') newInstrument = new Synth8Bit(this.ctx);
            else if (category === '32bit') newInstrument = new Synth32Bit(this.ctx);
            else if (category === 'wavetable') newInstrument = new SynthWavetable(this.ctx);
            else if (category === 'drums') newInstrument = new DrumMachine(this.ctx);
            
            track.setInstrument(newInstrument);
        }
        
        InstrumentPresets.applyPreset(track.instrument, presetName, category);
        this.updateDevicePanel();
        
        console.log('Applied preset: ' + presetName + ' (' + category + ')');
    }
    
    updateDevicePanel() {
        const t = this.tracks[this.activeTrackId];
        const panel = document.getElementById('device-panel');
        if (!t || !panel) return;
        
        panel.innerHTML = '';
        panel.style.display = 'block';

        // --- 1. TRACK PROPERTIES ---
        const propsDiv = document.createElement('div');
        propsDiv.className = 'device';
        propsDiv.innerHTML = `
            <div class="device-title">TRACK PROPERTIES</div>
            <div class="device-body" style="flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="param-label" style="text-align:left;">NAME</span>
                    <input type="text" value="${t.name}" style="background:#000; border:1px solid #444; color:#fff; width:120px;" 
                        onchange="daw.tracks[${t.id}].name = this.value; daw.renderTracks();">
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="param-label" style="text-align:left;">STATUS</span>
                    <div style="display:flex; gap:5px;">
                        <div class="pixel-toggle mute ${t.muted ? 'active' : ''}" onclick="daw.toggleMute(${t.id}, event)">M</div>
                        <div class="pixel-toggle solo ${t.solo ? 'active' : ''}" onclick="daw.toggleSolo(${t.id}, event)">S</div>
                    </div>
                </div>
            </div>
        `;
        panel.appendChild(propsDiv);

        // --- 2. EFFECTS CHAIN (INSERTS) ---
        const fxDiv = document.createElement('div');
        fxDiv.className = 'device';
        fxDiv.innerHTML = `<div class="device-title">EFFECTS CHAIN</div>`;
        const fxBody = document.createElement('div');
        fxBody.className = 'device-body';
        fxBody.style.flexDirection = 'column';
        fxBody.style.gap = '4px';

        if (t.mixerChannel.inserts.length === 0) {
            fxBody.innerHTML = '<div style="font-size:12px; color:#666; text-align:center; padding:5px;">No Effects</div>';
        } else {
            t.mixerChannel.inserts.forEach((plugin, idx) => {
                const slot = document.createElement('div');
                slot.className = 'insert-slot';
                slot.style.display = 'flex';
                slot.style.justifyContent = 'space-between';
                slot.style.padding = '6px 8px';
                slot.style.background = '#222';
                slot.style.border = '1px solid #333';
                slot.style.cursor = 'pointer';
                slot.innerHTML = `
                    <span>${plugin.name}</span>
                    <i class="fas fa-edit"></i>
                `;
                slot.onclick = () => daw.editInsert(t.id, idx);
                fxBody.appendChild(slot);
            });
        }

        const addBtn = document.createElement('button');
        addBtn.className = 'pixel-btn';
        addBtn.style.width = '100%';
        addBtn.style.marginTop = '5px';
        addBtn.style.fontSize = '12px';
        addBtn.innerHTML = '<i class="fas fa-plus"></i> ADD FX';
        addBtn.onclick = () => daw.addInsertPrompt(t.id);
        fxBody.appendChild(addBtn);

        fxDiv.appendChild(fxBody);
        panel.appendChild(fxDiv);

        // --- 3. INSTRUMENT ---
        if (t.instrument) {
            if (t.instrument instanceof DrumMachine) {
                this.renderDrumMachineUI(t.instrument, panel);
            } else {
                const synthDiv = document.createElement('div');
                synthDiv.className = 'device';
                synthDiv.innerHTML = `<div class="device-title">INSTRUMENT</div>`;
                const synthBody = document.createElement('div');
                synthBody.className = 'device-body';

                const params = ['attack', 'decay', 'sustain', 'release', 'filterFreq', 'filterQ', 'volume'];
                params.forEach(p => {
                    const val = t.instrument.getParam(p);
                    if (val !== undefined) {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'param-control';
                        wrapper.innerHTML = `
                            <div class="knob" data-p="${p}"></div>
                            <span class="param-label">${p.substring(0,4).toUpperCase()}</span>
                        `;
                        synthBody.appendChild(wrapper);
                    }
                });

                synthDiv.appendChild(synthBody);
                panel.appendChild(synthDiv);
                
                this.setupKnobs();
                document.querySelectorAll('.knob').forEach(k => {
                    const v = t.instrument.getParam(k.dataset.p);
                    this.updateKnobVisual(k, v || 0);
                });
            }
        }
    }

    renderDrumMachineUI(drumMachine, parent) {
        const container = document.createElement('div');
        container.className = 'device';
        container.innerHTML = '<div class="device-title">DRUM MACHINE</div>';
        
        const body = document.createElement('div');
        body.className = 'drum-machine-ui';

        // 1. Pad Grid
        const padGrid = document.createElement('div');
        padGrid.className = 'pad-grid';
        for (let i = 0; i < 16; i++) {
            const pad = document.createElement('div');
            pad.className = 'pixel-pad';
            pad.textContent = drumMachine.pads[i].name || (i+1);
            pad.onmousedown = () => {
                drumMachine.triggerPad(i);
                pad.classList.add('triggered');
                setTimeout(() => pad.classList.remove('triggered'), 100);
            };
            padGrid.appendChild(pad);
        }
        body.appendChild(padGrid);
        container.appendChild(body);
        
        if (parent) parent.appendChild(container);
        else document.getElementById('device-panel').appendChild(container);
    }
    
    // ... rest of the file ...
    
    openAddTrackModal() {
        if (this.tracks.length >= 12) {
            alert('Maximum 12 tracks reached!');
            return;
        }
        
        const modal = document.getElementById('add-track-modal');
        if (modal) {
            modal.classList.add('active');
        }
    }
    
    closeAddTrackModal() {
        const modal = document.getElementById('add-track-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    addTrackWithPreset(type, presetName) {
        this.closeAddTrackModal();
        
        let synthType = '32bit';
        if (type === '8bit') synthType = '8bit';
        else if (type === 'wavetable') synthType = 'wavetable';
        
        let trackType = 'synth';
        if (type === 'drums') trackType = 'drum';
        else if (type === 'sampler') trackType = 'sampler';
        else if (type === 'audio') trackType = 'audio';
        
        const track = this.addTrack(trackType, null, synthType);
        
        if (track && track.instrument && !['Drum Sampler', 'Drum Machine', 'Audio Track'].includes(presetName)) {
            setTimeout(() => {
                InstrumentPresets.applyPreset(track.instrument, presetName, type);
                track.name = presetName;
                this.renderTracks();
            }, 50);
        } else if (track) {
            track.name = presetName;
            this.renderTracks();
        }
        
        console.log('Added track:', presetName, '(' + type + ')');
    }
    
    // --- AUDIO ENGINE & PLAYBACK ---

    async toggleRecord() {
        const btn = document.getElementById('btn-record');
        
        if (this.recorder.isRecording) {
            // Stop recording
            const buffer = await this.recorder.stopRecording();
            btn.classList.remove('active');
            
            if (buffer) {
                // Add to current track if it supports audio
                const track = this.tracks[this.activeTrackId];
                // Ideally we check track.type or if it has addAudioClip
                // For now, let's attach to any track, but really it should be an audio track
                
                // Use current playhead position or where recording started?
                // For simplicity, let's just place it at the start beat of when recording began?
                // Or just at 0 for now since we don't track record-start-time cleanly yet.
                const startBeat = this.engine.currentBeat; // This is where we stopped.
                // We should track where we started.
                
                // Let's assume user starts recording at playhead.
                // We need to store recStartBeat when starting.
                if (this._recStartBeat !== undefined) {
                    track.addAudioClip(this._recStartBeat, buffer);
                    this.renderTimeline();
                    console.log('Audio clip added to track ' + track.name);
                }
            }
            this.togglePlay(); // Stop playback when recording stops
            
        } else {
            // Start recording
            const success = await this.recorder.initInput();
            if (success) {
                // Start playback if not playing
                if (!this.engine.isPlaying) this.togglePlay();
                
                this._recStartBeat = this.engine.getSmoothedBeat();
                this.recorder.startRecording();
                btn.classList.add('active');
            }
        }
    }

    togglePlay() {
        // Ensure audio context is resumed (browsers require user interaction)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                console.log('AudioContext resumed');
            });
        }
        
        if (this.engine.isPlaying) {
            this.engine.pause();
            document.getElementById('btn-play').classList.remove('active');
        } else {
            console.log('Starting playback...');
            console.log('Tracks:', this.tracks.length);
            this.tracks.forEach((t, i) => {
                console.log(`Track ${i}: ${t.name}, notes: ${t.notes.length}, instrument: ${t.instrument ? 'yes' : 'no'}`);
            });
            
            this.engine.play();
            document.getElementById('btn-play').classList.add('active');
            this.startScheduler();
        }
    }

    stop() {
        this.engine.stop();
        document.getElementById('btn-play').classList.remove('active');
        this.updatePlayheadPosition(0);
    }
    
    // Called on double-click stop or manual seek
    resetPlayhead() {
        this.engine.currentBeat = 0;
        this.updatePlayheadPosition(0);
    }
    
    // Seek to specific beat
    seekToBeat(beat) {
        this.engine.currentBeat = Math.max(0, beat);
        this.engine.nextNoteTime = this.engine.ctx.currentTime + 0.05;
        this.updatePlayheadPosition(beat);
    }
    
    // Update playhead visual position
    updatePlayheadPosition(beat) {
        const { BEAT_WIDTH } = DAW_CONSTANTS;
        const x = beat * BEAT_WIDTH;
        
        if (this.dom.playhead) {
            this.dom.playhead.style.left = x + 'px';
        }
        if (this.dom.prPlayhead) {
            this.dom.prPlayhead.style.left = x + 'px';
        }
        
        // Update LCD
        const bar = Math.floor(beat / 4) + 1;
        const beatNum = Math.floor(beat % 4) + 1;
        const sub = Math.floor((beat % 1) * 4) + 1;
        if (this.dom.lcdTime) {
            this.dom.lcdTime.innerText = String(bar).padStart(2, '0') + '.' + beatNum + '.' + sub;
        }
    }
    
    toggleLoop() {
        this.loopEnabled = !this.loopEnabled;
        const btn = document.getElementById('btn-loop');
        if (this.loopEnabled) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }
    
    startScheduler() {
        this.engine.schedule((beat, time) => {
            this.scheduleNotesAtBeat(beat, time);
        });
    }
    
    scheduleNotesAtBeat(beat, time) {
        // Handle loop mode
        let playBeat = beat;
        if (this.loopEnabled && this.loopEnd > this.loopStart) {
            const loopLen = this.loopEnd - this.loopStart;
            playBeat = this.loopStart + ((beat - this.loopStart) % loopLen);
            if (playBeat < this.loopStart) playBeat += loopLen;
        }
        
        this.tracks.forEach(track => {
            if (track.muted) return;
            
            // 1. Schedule Notes - check for notes that should play at this beat
            track.notes.forEach(note => {
                const noteStart = note.startBeat;
                
                // Check if this note should trigger now (within small tolerance)
                if (Math.abs(noteStart - playBeat) < 0.01) {
                    const duration = this.engine.beatsToSeconds(note.lengthBeats);
                    console.log(`Playing note: pitch=${note.pitch}, beat=${playBeat.toFixed(2)}, dur=${duration.toFixed(2)}s`);
                    track.scheduleNote(note.pitch, note.velocity, time, duration);
                }
            });
            
            // 1.5 Schedule Audio Clips
            if (track.audioClips) {
                track.audioClips.forEach(clip => {
                     const clipStart = clip.startBeat;
                     
                     if (Math.abs(clipStart - playBeat) < 0.01) {
                         track.playAudioClip(clip, time);
                     }
                });
            }

            // 2. Schedule Automation
            if (track.automation) {
                Object.keys(track.automation).forEach(param => {
                    const val = track.getAutomationValueAt(param, playBeat);
                    if (val !== null) {
                        if (param === 'volume') {
                            track.mixerChannel.faderNode.gain.cancelScheduledValues(time);
                            track.mixerChannel.faderNode.gain.linearRampToValueAtTime(val, time + 0.05);
                        } else if (param === 'pan') {
                            track.mixerChannel.panNode.pan.cancelScheduledValues(time);
                            track.mixerChannel.panNode.pan.linearRampToValueAtTime(val, time + 0.05);
                        } else if (track.instrument) {
                            track.instrument.setParam(param, val);
                        }
                    }
                });
            }

            // 3. Drum Machine Sequencer
            if (track.instrument instanceof DrumMachine && track.instrument.playStep) {
                // Determine 16th note step index (0-15)
                const stepIndex = Math.floor(playBeat * 4) % 16;
                
                // If we are exactly on a 16th note grid
                if (Math.abs((playBeat * 4) % 1 - 0) < 0.05) {
                   track.instrument.playStep(stepIndex, time);
                }
            }
        });
    }

    drawLoop() {
        const { BEAT_WIDTH } = DAW_CONSTANTS;
        
        if (this.engine.isPlaying) {
            const smoothBeat = this.engine.getSmoothedBeat();
            const x = smoothBeat * BEAT_WIDTH;
            
            // Update timeline playhead
            if (this.dom.playhead) {
                this.dom.playhead.style.left = x + 'px';
            }
            
            // Update piano roll playhead
            if (this.dom.prPlayhead) {
                this.dom.prPlayhead.style.display = 'block';
                this.dom.prPlayhead.style.left = x + 'px';
            }
            
            // Update LCD time display (Bar.Beat.16th)
            const bar = Math.floor(smoothBeat / 4) + 1;
            const beat = Math.floor(smoothBeat % 4) + 1;
            const sub = Math.floor((smoothBeat % 1) * 4) + 1;
            if (this.dom.lcdTime) {
                this.dom.lcdTime.innerText = String(bar).padStart(2, '0') + '.' + beat + '.' + sub;
            }
        }
        // Show playhead even when stopped (at current position)
        if (this.dom.prPlayhead) {
            this.dom.prPlayhead.style.display = 'block';
        }
        
        // Helper to update segmented meter
        const updateSegmentedMeter = (idPrefix, value) => {
            const segments = 20;
            const litSegments = Math.floor(Math.pow(value, 0.7) * segments);
            
            for (let i = 0; i < segments; i++) {
                const el = document.getElementById(idPrefix + i);
                if (el) {
                    if (i < litSegments) el.classList.add('on');
                    else el.classList.remove('on');
                }
            }
        };

        // Update track meters
        this.tracks.forEach(t => {
            t.updateMeters();
            const rms = t.getRMSLevel();
            
            // Track List Meter (Horizontal Bar)
            const m = document.getElementById('meter-' + t.id);
            if (m) m.style.width = (rms * 100) + '%';

            // Mixer Meter (Segmented)
            updateSegmentedMeter('meter-seg-' + t.id + '-', rms);
        });

        // Update Master Meter
        if (this.engine.masterChannel) {
            const rms = this.engine.masterChannel.getRMSLevel();
            updateSegmentedMeter('meter-seg-master-', rms);
        }

        requestAnimationFrame(() => this.drawLoop());
    }

    // --- UI HELPERS ---
    
    // Snap beat value to current grid
    snapToBeat(beat) {
        if (this.snap <= 0) return beat;
        return Math.round(beat / this.snap) * this.snap;
    }

    setTool(toolName) {
        this.tool = toolName;
        
        // Update toolbar button states
        document.querySelectorAll('#pr-toolbar .tool-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tool === toolName) {
                btn.classList.add('active');
            }
        });
        
        // Update controller tool
        if (this.prController) {
            this.prController.setTool(toolName);
        }
        
        // Update cursor
        const grid = this.dom.pianoGridInner || document.getElementById('pr-grid-inner');
        if (grid) {
            switch (toolName) {
                case 'pencil':
                    grid.style.cursor = 'crosshair';
                    break;
                case 'erase':
                    grid.style.cursor = 'not-allowed';
                    break;
                case 'select':
                    grid.style.cursor = 'default';
                    break;
                default:
                    grid.style.cursor = 'default';
            }
        }
        
        console.log('Tool changed to:', toolName);
    }

    switchTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.dock-tab').forEach(el => el.classList.remove('active'));
        const tabEl = document.getElementById('tab-' + tab);
        if (tabEl) tabEl.classList.add('active');
        
        // Hide all tab content
        document.querySelectorAll('#bottom-panel .tab-content').forEach(el => {
            el.style.display = 'none';
        });
        
        // Show selected tab content
        if (tab === 'piano') {
            const pianoRoll = document.getElementById('piano-roll');
            if (pianoRoll) {
                pianoRoll.style.display = 'flex';
                this.renderPianoGrid();
            }
        } else if (tab === 'mixer') {
            const mixer = document.getElementById('mixer');
            if (mixer) {
                mixer.style.display = 'flex';
                this.renderMixer();
            }
        } else if (tab === 'device') {
            const devicePanel = document.getElementById('device-panel-tab');
            if (devicePanel) {
                devicePanel.style.display = 'block';
                this.updateDevicePanel();
            }
        }
        this.activeTab = tab;
    }

    toggleMute(id, e) { 
        if(e) e.stopPropagation(); 
        this.tracks[id].setMute(!this.tracks[id].muted); 
        this.renderTracks(); 
    }
    
    toggleSolo(id, e) { 
        if(e) e.stopPropagation(); 
        this.tracks[id].setSolo(!this.tracks[id].solo); 
        this.renderTracks(); 
    }
    
    deleteTrack(id, e) {
        if(e) e.stopPropagation();
        if (confirm('Delete track "' + this.tracks[id].name + '"?')) {
            const track = this.tracks[id];
            track.dispose();
            this.tracks.splice(id, 1);
            this.tracks.forEach((t, idx) => t.id = idx);
            if (this.activeTrackId >= this.tracks.length) this.activeTrackId = Math.max(0, this.tracks.length - 1);
            if (this.tracks.length > 0) this.selectTrack(this.activeTrackId);
            this.renderAll();
        }
    }
    
    // --- PROJECT MANAGEMENT ---
    
    newProject() { 
        if (confirm('Create new project? Unsaved changes will be lost.')) {
            this.stop();
            this.clearAllTracks();
            this.projectManager.setProjectName('Untitled Project');
            this.init();
        }
    }
    
    saveProject() {
        const name = prompt('Project name:', this.projectManager.projectName);
        if (name) {
            this.projectManager.setProjectName(name);
            this.projectManager.saveProject();
        }
    }
    
    loadProject() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.kbdaw';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.projectManager.loadProject(file);
            }
        };
        input.click();
    }
    
    setBPM() {
        const bpm = prompt('Enter BPM (20-300):', this.engine.bpm);
        if (bpm) {
            const val = parseInt(bpm);
            if (val >= 20 && val <= 300) {
                this.engine.setBPM(val);
                this.dom.lcdBPM.innerHTML = '<span style="font-size:0.6rem; color:#444; margin-right:5px;">BPM</span> ' + val;
            }
        }
    }

    undo() { 
        console.log('Undo system coming soon...'); 
    }
    
    redo() {
        console.log('Redo system coming soon...');
    }
}

window.daw = new DAW();
