// interactive_cutscene_editor.js - Interactive Cutscene Editor for RedGlitch Studio
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

// Initialize integration system
function initializeIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedGlitchEventBus;
        projectState = window.RedGlitchProjectState || new SharedProjectState();
        assetManager = window.RedGlitchAssetManager || new AssetManager();
        
        if (eventBus) {
            // Listen for external cutscene requests
            eventBus.on('cutscene:load', (event) => {
                if (event.data.cutsceneId) {
                    loadCutsceneById(event.data.cutsceneId);
                }
            });
            
            // Listen for asset updates
            eventBus.on('asset:*', (event) => {
                if (event.type === 'asset:loaded' || event.type === 'asset:modified') {
                    refreshAssetLists();
                }
            });
            
            // Broadcast cutscene events
            eventBus.on('cutscene:save', () => {
                saveCutscene();
            });
        }
        
        console.log('[InteractiveCutscene] Integration system connected');
    }
}
// Phase 1: Core Framework Implementation

class InteractiveCutsceneEditor {
    constructor() {
        // Initialize integration first
        initializeIntegration();
        
        this.data = {
            id: 'new_cutscene',
            name: 'New Interactive Cutscene',
            version: '1.0',
            timeline: {
                duration: 30.0,
                fps: 60,
                tracks: [
                    {
                        id: 'background_track',
                        name: 'Background',
                        type: 'actor',
                        visible: true,
                        keyframes: [
                            {
                                time: 0,
                                properties: { sprite: 'forest_bg', x: 0, y: 0 }
                            }
                        ]
                    },
                    {
                        id: 'dialogue_track',
                        name: 'Dialogue',
                        type: 'interaction',
                        visible: true,
                        keyframes: [
                            {
                                time: 2.0,
                                type: 'dialogue',
                                data: { speaker: 'narrator', text: 'Welcome to Interactive Cutscenes!' }
                            }
                        ]
                    },
                    {
                        id: 'music_track',
                        name: 'Background Music',
                        type: 'audio',
                        visible: true,
                        keyframes: [
                            {
                                time: 0,
                                properties: { file: 'intro_music.ogg', volume: 0.7 }
                            }
                        ]
                    }
                ]
            },
            branches: {},
            dialogues: {},
            variables: [],
            settings: {
                pauseOnChoices: true,
                allowSkipping: false,
                allowRollback: true
            },
            integrations: {
                algorithmStudio: { enabled: false },
                campaignEditor: { enabled: true }
            }
        };
        
        this.playback = {
            currentTime: 0,
            isPlaying: false,
            zoom: 50, // pixels per second
            selectedTrack: null,
            selectedKeyframe: null
        };
        
        this.currentTool = 'select'; // Default tool
        this.selectedCharacter = null; // Currently selected character
        this.isDragging = false; // Drag state
        this.currentBranch = 'main';
        
        this.assets = {
            sprites: new Map([
                ['player', { name: 'Player', file: 'player.png' }],
                ['villager', { name: 'Villager', file: 'villager.png' }],
                ['door', { name: 'Door', file: 'door.png' }],
                ['forest_background', { name: 'Forest Background', file: 'forest_background.jpg' }]
            ]),
            audio: new Map([
                ['bg_music', { name: 'Background Music', file: 'bg_music.ogg' }],
                ['door_creak', { name: 'Door Creak', file: 'door_creak.wav' }]
            ]),
            characters: new Map([
                ['hero', { name: 'Hero', portrait: 'hero_portrait.png' }],
                ['blacksmith', { name: 'Blacksmith', portrait: 'blacksmith_portrait.png' }],
                ['baker', { name: 'Baker', portrait: 'baker_portrait.png' }],
                ['sir_alistair', { name: 'Sir Alistair', portrait: 'knight_portrait.png' }],
                ['alchemist', { name: 'Alchemist', portrait: 'alchemist_portrait.png' }],
                ['merchant', { name: 'Merchant', portrait: 'merchant_portrait.png' }],
                ['old_tom', { name: 'Old Tom', portrait: 'oldtom_portrait.png' }]
            ])
        };
        
        // Cache for background image to avoid reloading
        this.cachedBackgroundImage = null;
        this.backgroundImageLoaded = false;
        
        this.engine = null; // Will hold InteractiveCutsceneEngine instance
        
        this.init();
    }
    
    async init() {
        console.log("Interactive Cutscene Editor initializing...");
        
        // Load DOM references
        this.dom = {
            canvas: document.getElementById('preview-canvas'),
            ctx: document.getElementById('preview-canvas').getContext('2d'),
            trackHeaders: document.getElementById('track-headers'),
            trackLanes: document.getElementById('track-lanes'),
            playhead: document.getElementById('playhead'),
            timeDisplay: document.getElementById('time-display'),
            inspector: document.getElementById('inspector-content'),
            statusInfo: document.getElementById('status-info')
        };
        
        // Load example cutscene first
        await this.loadExampleCutscene();
        
        // Load assets
        await this.loadAssets();
        
        // Preload background image
        await this.preloadBackgroundImage();
        
        // Initialize UI
        this.updateUI();
        this.setupEventListeners();
        
        // Initialize engine (when available)
        this.initEngine();
        
        console.log("Interactive Cutscene Editor ready");
        this.updateStatus("LOADED FOREST ENCOUNTER DEMO - PRESS SPACE TO PLAY");
    }

    getActiveTimeline() {
        if (this.currentBranch && this.currentBranch !== 'main' && this.data.branches?.[this.currentBranch]) {
            const branch = this.data.branches[this.currentBranch];
            if (!Array.isArray(branch.tracks)) branch.tracks = [];
            if (typeof branch.duration !== 'number' || branch.duration <= 0) {
                branch.duration = this.data.timeline.duration || 30;
            }
            return branch;
        }
        if (!Array.isArray(this.data.timeline.tracks)) this.data.timeline.tracks = [];
        return this.data.timeline;
    }

    getActiveTracks() {
        return this.getActiveTimeline().tracks;
    }

    getActiveDuration() {
        const duration = this.getActiveTimeline().duration;
        return (typeof duration === 'number' && duration > 0) ? duration : (this.data.timeline.duration || 30);
    }

    getSelectedTrack() {
        if (this.playback.selectedTrack === null) return null;
        const tracks = this.getActiveTracks();
        return tracks[this.playback.selectedTrack] || null;
    }

    sanitizeCutsceneId(raw) {
        return String(raw || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '') || 'cutscene';
    }
    
    async loadExampleCutscene() {
        try {
            const response = await fetch('/dunyalar/definitions/interactive_cutscenes/forest_encounter_demo.json');
            if (response.ok) {
                this.data = await response.json();
                console.log("Loaded example cutscene:", this.data.name);
            }
        } catch (error) {
            console.warn("Could not load example cutscene, using defaults");
        }
    }
    
    async loadAssets() {
        try {
            // Load characters from dialogue definitions
            const dialogueRes = await fetch('/dunyalar/definitions/dialogues.json');
            if (dialogueRes.ok) {
                const dialogueData = await dialogueRes.json();
                if (dialogueData.characters) {
                    dialogueData.characters.forEach(char => {
                        this.assets.characters.set(char.id, char);
                    });
                }
            }
            
            // Load NPCs
            const npcRes = await fetch('/dunyalar/definitions/npcs.json');
            if (npcRes.ok) {
                const npcData = await npcRes.json();
                npcData.forEach(npc => {
                    if (!this.assets.characters.has(npc.id)) {
                        this.assets.characters.set(npc.id, {
                            id: npc.id,
                            name: npc.name,
                            sprite: npc.sprite,
                            color: '#ff0000'
                        });
                    }
                });
            }
            
            // Mock sprite data (TODO: Load from actual sprite definitions)
            const mockSprites = [
                { id: 'player', name: 'Player', file: 'sprites/player.png' },
                { id: 'npc_villager', name: 'Villager', file: 'sprites/villager.png' },
                { id: 'door', name: 'Door', file: 'sprites/door.png' }
            ];
            mockSprites.forEach(sprite => {
                this.assets.sprites.set(sprite.id, sprite);
            });
            
            // Mock audio data
            const mockAudio = [
                { id: 'bg_music', name: 'Background Music', file: 'audio/background.mp3' },
                { id: 'door_creak', name: 'Door Creak', file: 'audio/door_creak.wav' }
            ];
            mockAudio.forEach(audio => {
                this.assets.audio.set(audio.id, audio);
            });
            
        } catch (error) {
            console.error("Error loading assets:", error);
        }
        
        this.updateAssetLists();
    }
    
    async preloadBackgroundImage() {
        return new Promise((resolve) => {
            console.log('Preloading forest background image...');
            this.cachedBackgroundImage = new Image();
            
            this.cachedBackgroundImage.onload = () => {
                console.log('Forest background preloaded successfully!', this.cachedBackgroundImage.width, 'x', this.cachedBackgroundImage.height);
                this.backgroundImageLoaded = true;
                resolve();
            };
            
            this.cachedBackgroundImage.onerror = (error) => {
                console.error('Failed to preload forest background:', error);
                this.backgroundImageLoaded = false;
                resolve(); // Still resolve to continue loading
            };
            
            this.cachedBackgroundImage.src = '/sprite-art/forest_background.jpg';
        });
    }
    
    updateAssetLists() {
        // Update sprites list
        const spritesList = document.getElementById('sprites-list');
        spritesList.innerHTML = '';
        this.assets.sprites.forEach(sprite => {
            const item = document.createElement('div');
            item.className = 'list-item';
            
            // Create thumbnail for uploaded images
            let thumbnail = '';
            if (sprite.type === 'uploaded' && sprite.data) {
                thumbnail = `<img src="${sprite.data}" class="asset-thumbnail" alt="${sprite.name}">`;
            } else {
                thumbnail = `<div class="list-icon" style="background: var(--track-actor);"></div>`;
            }
            
            const removeBtn = sprite.type === 'uploaded' ? 
                `<button class="remove-asset-btn" onclick="editor.removeAsset('sprites', '${sprite.id}')" title="Remove Asset">
                    <i class="fas fa-times"></i>
                </button>` : '';
            
            item.innerHTML = `
                <div class="asset-item-content">
                    ${thumbnail}
                    <span class="asset-name">${sprite.name}</span>
                    ${removeBtn}
                </div>
            `;
            item.onclick = () => this.selectAsset('sprite', sprite);
            spritesList.appendChild(item);
        });
        
        // Update audio list
        const audioList = document.getElementById('audio-list');
        audioList.innerHTML = '';
        this.assets.audio.forEach(audio => {
            const item = document.createElement('div');
            item.className = 'list-item';
            
            const removeBtn = audio.type === 'uploaded' ? 
                `<button class="remove-asset-btn" onclick="editor.removeAsset('audio', '${audio.id}')" title="Remove Asset">
                    <i class="fas fa-times"></i>
                </button>` : '';
                
            item.innerHTML = `
                <div class="asset-item-content">
                    <div class="list-icon" style="background: var(--track-audio);"></div>
                    <span class="asset-name">${audio.name}</span>
                    ${removeBtn}
                </div>
            `;
            item.onclick = () => this.selectAsset('audio', audio);
            audioList.appendChild(item);
        });
        
        // Update characters list
        const charactersList = document.getElementById('characters-list');
        charactersList.innerHTML = '';
        this.assets.characters.forEach(char => {
            const item = document.createElement('div');
            item.className = 'list-item';
            
            // Create thumbnail for uploaded portraits
            let thumbnail = '';
            if (char.type === 'uploaded' && char.data) {
                thumbnail = `<img src="${char.data}" class="asset-thumbnail" alt="${char.name}">`;
            } else {
                thumbnail = `<div class="list-icon" style="background: var(--track-interaction);"></div>`;
            }
            
            const removeBtn = char.type === 'uploaded' ? 
                `<button class="remove-asset-btn" onclick="editor.removeAsset('characters', '${char.id}')" title="Remove Asset">
                    <i class="fas fa-times"></i>
                </button>` : '';
            
            item.innerHTML = `
                <div class="asset-item-content">
                    ${thumbnail}
                    <span class="asset-name">${char.name}</span>
                    ${removeBtn}
                </div>
            `;
            item.onclick = () => this.selectAsset('character', char);
            charactersList.appendChild(item);
        });
    }
    
    setupEventListeners() {
        // Canvas click for timeline navigation and character interaction
        this.dom.canvas.addEventListener('click', (e) => {
            const rect = this.dom.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check if clicking on timeline scrub area (bottom 50px)
            if (y > this.dom.canvas.height - 50) {
                const timePercentage = x / this.dom.canvas.width;
                const seekTime = timePercentage * this.getActiveDuration();
                this.seekTo(seekTime);
                this.updateStatus(`SEEKED TO ${seekTime.toFixed(1)}s`);
                return;
            }
            
            // Check for character selection
            const selectedCharacter = this.getCharacterAt(x, y);
            if (selectedCharacter) {
                this.selectedCharacter = selectedCharacter;
                this.updateStatus(`SELECTED CHARACTER: ${selectedCharacter.name}`);
                this.renderCanvasPreview(); // Refresh to show selection
                return;
            }
            
            // If no character selected and we have a selected character, move it
            if (this.selectedCharacter && this.currentTool === 'move') {
                this.moveCharacterTo(this.selectedCharacter, x, y);
            }
        });
        
        // Canvas mouse move for drag operations
        this.dom.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging && this.selectedCharacter) {
                const rect = this.dom.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                this.moveCharacterTo(this.selectedCharacter, x, y);
                e.preventDefault();
            }
        });
        
        // Canvas mouse down for drag start
        this.dom.canvas.addEventListener('mousedown', (e) => {
            const rect = this.dom.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const character = this.getCharacterAt(x, y);
            if (character && this.currentTool === 'move') {
                this.isDragging = true;
                this.selectedCharacter = character;
                this.dom.canvas.style.cursor = 'grabbing';
            }
        });
        
        // Canvas mouse up for drag end
        this.dom.canvas.addEventListener('mouseup', (e) => {
            if (this.isDragging) {
                this.isDragging = false;
                this.dom.canvas.style.cursor = 'default';
                
                if (this.selectedCharacter) {
                    this.createMovementKeyframe(this.selectedCharacter);
                }
            }
        });
        
        // Canvas mouse enter/leave for cursor management
        this.dom.canvas.addEventListener('mouseenter', (e) => {
            if (this.currentTool === 'move') {
                this.dom.canvas.style.cursor = 'grab';
            }
        });
        
        this.dom.canvas.addEventListener('mouseleave', (e) => {
            this.isDragging = false;
            this.dom.canvas.style.cursor = 'default';
        });
        
        // Timeline lane clicks
        this.dom.trackLanes.addEventListener('click', (e) => {
            this.handleTimelineClick(e);
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Prevent default for all our shortcuts
            const isShortcut = [' ', 'Delete', 'KeyK', 'KeyG', 'Equal', 'Minus', 'Digit0'].includes(e.code) || 
                              (e.ctrlKey && ['KeyN', 'KeyO', 'KeyS', 'KeyZ', 'KeyY'].includes(e.code));
            
            if (isShortcut) {
                e.preventDefault();
            }
            
            // Handle shortcuts
            if (e.key === ' ') { // Spacebar to play/pause
                this.togglePlayback();
            } else if (e.key === 'Delete') {
                this.deleteSelected();
            } else if (e.code === 'KeyK' && !e.ctrlKey) { // K to add keyframe
                this.addKeyframe();
            } else if (e.code === 'KeyG' && !e.ctrlKey) { // G to toggle grid
                this.toggleGrid();
            } else if (e.code === 'Equal' || e.code === 'NumpadAdd') { // + to zoom in
                this.zoomIn();
            } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') { // - to zoom out
                this.zoomOut();
            } else if (e.code === 'Digit0' && !e.ctrlKey) { // 0 to reset view
                this.resetView();
            } else if (e.key === 'F5') { // F5 to test
                this.testCutscene();
            } else if (e.code === 'KeyV' && !e.ctrlKey) { // V for select tool
                this.selectTool();
            } else if (e.code === 'KeyM' && !e.ctrlKey) { // M for move tool
                this.moveKeyframe();
            } else if (e.code === 'KeyD' && !e.ctrlKey) { // D for dialogue
                this.addDialogue();
            } else if (e.code === 'KeyB' && !e.ctrlKey) { // B for branch/choice
                this.addChoice();
            } else if (e.code === 'KeyT' && !e.ctrlKey) { // T for timeline toggle
                toggleTimeline();
            } else if (e.code === 'KeyP' && e.ctrlKey && this.selectedCharacter) { // Ctrl+P for movement path
                this.addMovementPath();
            } else if (e.key === 'Delete' || e.key === 'Backspace') { // Delete keyframe
                if (this.selectedCharacter) {
                    this.deleteMovementKeyframe();
                }
            }
            
            // Ctrl shortcuts
            if (e.ctrlKey) {
                switch (e.code) {
                    case 'KeyN': this.newCutscene(); break;
                    case 'KeyO': this.openCutscene(); break;
                    case 'KeyS': this.saveCutscene(); break;
                    case 'KeyZ': this.undo(); break;
                    case 'KeyY': this.redo(); break;
                    case 'KeyC': // Copy movement keyframe
                        if (this.selectedCharacter) this.copyMovementKeyframe();
                        break;
                    case 'KeyV': // Paste movement keyframe (if clipboard has data)
                        if (this.selectedCharacter && this.movementClipboard) {
                            this.pasteMovementKeyframe();
                        }
                        break;
                }
            }
        });
    }
    
    initEngine() {
        // Initialize the Interactive Cutscene Engine when available
        if (window.InteractiveCutsceneEngine) {
            this.engine = new InteractiveCutsceneEngine(this);
            console.log("Interactive Cutscene Engine connected to editor");
        } else {
            console.warn("InteractiveCutsceneEngine not found - loading...");
            // Try to load the engine
            const script = document.createElement('script');
            script.src = 'engines/rpg-topdown/InteractiveCutsceneEngine.js';
            script.onload = () => {
                this.engine = new InteractiveCutsceneEngine(this);
                console.log("Interactive Cutscene Engine loaded and connected");
            };
            document.head.appendChild(script);
        }
    }
    
    // UI Update Methods
    updateUI() {
        this.updateTimeline();
        this.updateTimeDisplay();
        this.updateBranches();
        this.updateInspector();
        this.renderCanvasPreview();
    }
    
    updateTimeline() {
        // Clear existing tracks
        this.dom.trackHeaders.innerHTML = '';
        this.dom.trackLanes.innerHTML = '<div id="playhead"></div>';
        
        // Add tracks
        this.getActiveTracks().forEach((track, index) => {
            this.addTrackToUI(track, index);
        });
    }
    
    addTrackToUI(track, index) {
        // Track header
        const header = document.createElement('div');
        header.className = 'track-header';
        
        const icon = track.type === 'actor' ? 'fa-user' : 
                    track.type === 'interaction' ? 'fa-comments' : 'fa-music';
        
        const trackColor = track.type === 'actor' ? 'var(--track-actor)' :
                          track.type === 'interaction' ? 'var(--track-interaction)' : 'var(--track-audio)';
        
        header.innerHTML = `
            <div class="list-icon" style="background: ${trackColor};"></div>
            <div>
                <div style="font-weight: bold; text-transform: uppercase;">${track.name || `${track.type} ${index + 1}`}</div>
                <div style="font-size: 0.8rem; color: #666; text-transform: uppercase;">${track.type}</div>
            </div>
        `;
        
        header.onclick = () => this.selectTrack(index);
        this.dom.trackHeaders.appendChild(header);
        
        // Track lane
        const lane = document.createElement('div');
        lane.className = 'track-lane';
        lane.style.borderLeft = `4px solid ${trackColor}`;
        
        // Add keyframes
        if (track.keyframes) {
            track.keyframes.forEach((keyframe, kfIndex) => {
                this.addKeyframeToUI(lane, keyframe, index, kfIndex, track.type);
            });
        }
        
        this.dom.trackLanes.appendChild(lane);
    }
    
    addKeyframeToUI(lane, keyframe, trackIndex, keyframeIndex, trackType) {
        const keyDiv = document.createElement('div');
        keyDiv.className = 'keyframe';
        keyDiv.dataset.type = trackType;
        keyDiv.style.left = `${keyframe.time * this.playback.zoom}px`;
        
        keyDiv.onclick = (e) => {
            e.stopPropagation();
            this.selectKeyframe(trackIndex, keyframeIndex);
        };
        
        // Add tooltip
        keyDiv.title = `${trackType} keyframe at ${keyframe.time.toFixed(1)}s`;
        
        lane.appendChild(keyDiv);
    }
    
    updateTimeDisplay() {
        const current = this.formatTime(this.playback.currentTime);
        const total = this.formatTime(this.getActiveDuration());
        this.dom.timeDisplay.textContent = `${current} / ${total}`;
    }
    
    updateBranches() {
        const branchesList = document.getElementById('branches-list');
        if (!branchesList) return;
        
        branchesList.innerHTML = '';
        
        // Ensure branches is an object
        if (!this.data.branches) {
            this.data.branches = {};
        }
        
        // Add main timeline
        const mainItem = document.createElement('div');
        mainItem.className = `list-item ${this.currentBranch === 'main' ? 'active' : ''}`;
        mainItem.innerHTML = '<i class="fas fa-code-branch"></i> Main Timeline';
        mainItem.onclick = () => this.selectBranch('main');
        branchesList.appendChild(mainItem);
        
        // Add other branches from object structure
        Object.keys(this.data.branches).forEach(branchId => {
            const branch = this.data.branches[branchId];
            const item = document.createElement('div');
            item.className = `list-item ${this.currentBranch === branchId ? 'active' : ''}`;
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fas fa-code-branch"></i> ${branchId}</span>
                    <button class="btn-small" onclick="editor.deleteBranch('${branchId}'); event.stopPropagation();" 
                            style="background: #e74c3c; padding: 2px 6px; font-size: 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            item.onclick = () => this.selectBranch(branchId);
            branchesList.appendChild(item);
        });
        
        // Add branch count info
        const branchCount = Object.keys(this.data.branches).length;
        const infoDiv = document.createElement('div');
        infoDiv.className = 'panel-info';
        infoDiv.innerHTML = `
            <small style="color: #888; padding: 8px; display: block;">
                <i class="fas fa-info-circle"></i> ${branchCount} branches + main timeline
                <br>Current: ${this.currentBranch === 'main' ? 'Main Timeline' : this.currentBranch}
            </small>
        `;
        branchesList.appendChild(infoDiv);
    }
    
    updateInspector() {
        const inspector = this.dom.inspector;
        
        if (this.playback.selectedKeyframe !== null && this.playback.selectedTrack !== null) {
            // Show keyframe properties
            const track = this.getSelectedTrack();
            if (!track) return;
            const keyframe = track.keyframes[this.playback.selectedKeyframe];
            
            inspector.innerHTML = `
                <h4><i class="fas fa-key"></i> Keyframe Properties</h4>
                <div class="form-group">
                    <label class="form-label">Time (seconds)</label>
                    <input type="number" class="form-input" value="${keyframe.time}" 
                           onchange="editor.updateKeyframeProperty('time', parseFloat(this.value))">
                </div>
                ${this.generatePropertiesUI(keyframe, track.type)}
            `;
        } else if (this.playback.selectedTrack !== null) {
            // Show track properties
            const track = this.getSelectedTrack();
            if (!track) return;
            
            inspector.innerHTML = `
                <h4><i class="fas fa-cog"></i> Track Properties</h4>
                <div class="form-group">
                    <label class="form-label">Name</label>
                    <input type="text" class="form-input" value="${track.name || ''}" 
                           onchange="editor.updateTrackProperty('name', this.value)">
                </div>
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" value="${track.type}" 
                            onchange="editor.updateTrackProperty('type', this.value)">
                        <option value="actor">Actor</option>
                        <option value="interaction">Interaction</option>
                        <option value="audio">Audio</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Visible</label>
                    <input type="checkbox" ${track.visible ? 'checked' : ''} 
                           onchange="editor.updateTrackProperty('visible', this.checked)">
                </div>
            `;
        } else if (this.selectedCharacter) {
            // Show character movement controls
            const character = this.selectedCharacter;
            const position = character.position || { x: 200, y: 200 };
            
            inspector.innerHTML = `
                <h4><i class="fas fa-user"></i> Character Movement</h4>
                <div class="character-info">
                    <h5><i class="fas fa-star"></i> ${character.name}</h5>
                    <p>Track: ${character.track.name}</p>
                </div>
                <div class="form-group">
                    <label class="form-label">X Position</label>
                    <input type="number" class="form-input" value="${position.x || 200}" 
                           onchange="editor.updateCharacterPosition('x', parseFloat(this.value))">
                </div>
                <div class="form-group">
                    <label class="form-label">Y Position</label>
                    <input type="number" class="form-input" value="${position.y || 200}" 
                           onchange="editor.updateCharacterPosition('y', parseFloat(this.value))">
                </div>
                <div class="form-group">
                    <label class="form-label">Scale</label>
                    <input type="number" class="form-input" value="${position.scale || 1}" step="0.1" min="0.1" max="3"
                           onchange="editor.updateCharacterPosition('scale', parseFloat(this.value))">
                </div>
                <div class="form-group">
                    <label class="form-label">Opacity</label>
                    <input type="number" class="form-input" value="${position.opacity || 1}" step="0.1" min="0" max="1"
                           onchange="editor.updateCharacterPosition('opacity', parseFloat(this.value))">
                </div>
                <div class="form-group">
                    <button class="form-btn" onclick="editor.createKeyframeAtCurrentTime()">
                        <i class="fas fa-key"></i> Create Movement Keyframe
                    </button>
                </div>
                <div class="movement-presets">
                    <h5>Quick Movements</h5>
                    <button class="preset-btn" onclick="editor.moveCharacterToPreset('center')">Center</button>
                    <button class="preset-btn" onclick="editor.moveCharacterToPreset('left')">Left</button>
                    <button class="preset-btn" onclick="editor.moveCharacterToPreset('right')">Right</button>
                </div>
                <div class="movement-tools">
                    <h5>Movement Tools</h5>
                    <button class="form-btn" onclick="editor.addMovementPath()">
                        <i class="fas fa-route"></i> Add Movement Path
                    </button>
                    <button class="form-btn" onclick="editor.copyMovementKeyframe()">
                        <i class="fas fa-copy"></i> Copy Keyframe
                    </button>
                    <button class="form-btn" onclick="editor.deleteMovementKeyframe()">
                        <i class="fas fa-trash"></i> Delete Keyframe
                    </button>
                </div>
                <div class="movement-animation">
                    <h5>Animation Settings</h5>
                    <div class="form-group">
                        <label class="form-label">Easing Type</label>
                        <select class="form-select" onchange="editor.updateMovementEasing(this.value)">
                            <option value="linear">Linear</option>
                            <option value="ease-in">Ease In</option>
                            <option value="ease-out">Ease Out</option>
                            <option value="ease-in-out">Ease In-Out</option>
                            <option value="bounce">Bounce</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Movement Speed</label>
                        <input type="range" class="form-range" min="0.1" max="3" step="0.1" value="1" 
                               onchange="editor.updateMovementSpeed(parseFloat(this.value))">
                        <span class="range-value">1x</span>
                    </div>
                </div>
            `;
        } else {
            // Show cutscene properties with demo info
            inspector.innerHTML = `
                <h4><i class="fas fa-film"></i> Cutscene Properties</h4>
                <div class="demo-info">
                    <h5><i class="fas fa-star"></i> DEMO: "${this.data.name}"</h5>
                    <p>${this.data.description}</p>
                    <div class="demo-stats">
                        <span><i class="fas fa-clock"></i> ${this.getActiveDuration()}s</span>
                        <span><i class="fas fa-code-branch"></i> ${this.data.branches ? Object.keys(this.data.branches).length : 0} branches</span>
                        <span><i class="fas fa-list"></i> ${this.data.variables ? Object.keys(this.data.variables).length : 0} variables</span>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Name</label>
                    <input type="text" class="form-input" value="${this.data.name}" 
                           onchange="editor.updateCutsceneProperty('name', this.value)">
                </div>
                <div class="form-group">
                    <label class="form-label">Duration (seconds)</label>
                    <input type="number" class="form-input" value="${this.getActiveDuration()}" 
                           onchange="editor.updateCutsceneProperty('duration', parseFloat(this.value))">
                </div>
                <div class="form-group">
                    <label class="form-label">FPS</label>
                    <input type="number" class="form-input" value="${this.data.timeline.fps}" 
                           onchange="editor.updateCutsceneProperty('timeline.fps', parseInt(this.value, 10))">
                </div>
            `;
        }
    }
    
    generatePropertiesUI(keyframe, trackType) {
        switch (trackType) {
            case 'actor':
                return `
                    <div class="form-group">
                        <label class="form-label">Sprite</label>
                        <select class="form-select" onchange="editor.updateKeyframeProperty('properties.sprite', this.value)">
                            ${Array.from(this.assets.sprites.values()).map(sprite => 
                                `<option value="${sprite.id}" ${keyframe.properties?.sprite === sprite.id ? 'selected' : ''}>${sprite.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">X Position</label>
                        <input type="number" class="form-input" value="${keyframe.properties?.x || 0}"
                               onchange="editor.updateKeyframeProperty('properties.x', parseFloat(this.value))">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Y Position</label>
                        <input type="number" class="form-input" value="${keyframe.properties?.y || 0}"
                               onchange="editor.updateKeyframeProperty('properties.y', parseFloat(this.value))">
                    </div>
                `;
            
            case 'interaction':
                return `
                    <div class="form-group">
                        <label class="form-label">Interaction Type</label>
                        <select class="form-select" onchange="editor.updateKeyframeProperty('type', this.value)">
                            <option value="dialogue" ${keyframe.type === 'dialogue' ? 'selected' : ''}>Dialogue</option>
                            <option value="choice" ${keyframe.type === 'choice' ? 'selected' : ''}>Choice</option>
                            <option value="variable_set" ${keyframe.type === 'variable_set' ? 'selected' : ''}>Set Variable</option>
                            <option value="branch" ${keyframe.type === 'branch' ? 'selected' : ''}>Branch</option>
                        </select>
                    </div>
                    ${keyframe.type === 'dialogue' ? this.generateDialogueUI(keyframe.data) : ''}
                `;
            
            case 'audio':
                return `
                    <div class="form-group">
                        <label class="form-label">Audio File</label>
                        <select class="form-select" onchange="editor.updateKeyframeProperty('properties.file', this.value)">
                            ${Array.from(this.assets.audio.values()).map(audio => 
                                `<option value="${audio.id}" ${(keyframe.properties?.file === audio.file || keyframe.properties?.file === audio.id) ? 'selected' : ''}>${audio.name}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Volume</label>
                        <input type="range" min="0" max="1" step="0.1" value="${keyframe.properties?.volume || 1}"
                               onchange="editor.updateKeyframeProperty('properties.volume', parseFloat(this.value))">
                    </div>
                `;
        }
        return '';
    }
    
    generateDialogueUI(data) {
        return `
            <div class="form-group">
                <label class="form-label">Speaker</label>
                <select class="form-select" onchange="editor.updateKeyframeProperty('data.speaker', this.value)">
                    ${Array.from(this.assets.characters.values()).map(char => 
                        `<option value="${char.id}" ${data?.speaker === char.id ? 'selected' : ''}>${char.name}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Text</label>
                <textarea class="form-input" rows="3" onchange="editor.updateKeyframeProperty('data.text', this.value)">${data?.text || ''}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Text Speed</label>
                <input type="number" class="form-input" value="${data?.textSpeed ?? 35}" min="1" max="120"
                       onchange="editor.updateKeyframeProperty('data.textSpeed', parseInt(this.value, 10))">
            </div>
            <div class="form-group">
                <label class="form-label">Auto Advance</label>
                <input type="checkbox" ${data?.autoAdvance ? 'checked' : ''}
                       onchange="editor.updateKeyframeProperty('data.autoAdvance', this.checked)">
            </div>
        `;
    }
    
    renderCanvasPreview() {
        const ctx = this.dom.ctx;
        const canvas = this.dom.canvas;
        
        // Clear canvas
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw scene based on current time
        this.drawSceneAt(this.playback.currentTime);
    }
    
    drawSceneAt(time) {
        const ctx = this.dom.ctx;
        const canvas = this.dom.canvas;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw background - use cached image if loaded, otherwise fallback
        if (this.backgroundImageLoaded && this.cachedBackgroundImage && this.cachedBackgroundImage.complete) {
            // Draw the cached forest background
            const imgAspect = this.cachedBackgroundImage.width / this.cachedBackgroundImage.height;
            const canvasAspect = canvas.width / canvas.height;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (imgAspect > canvasAspect) {
                // Image is wider - fit by height
                drawHeight = canvas.height;
                drawWidth = drawHeight * imgAspect;
                drawX = (canvas.width - drawWidth) / 2;
                drawY = 0;
            } else {
                // Image is taller - fit by width  
                drawWidth = canvas.width;
                drawHeight = drawWidth / imgAspect;
                drawX = 0;
                drawY = (canvas.height - drawHeight) / 2;
            }
            
            ctx.drawImage(this.cachedBackgroundImage, drawX, drawY, drawWidth, drawHeight);
        } else {
            // Fallback to procedural forest scene
            this.drawProceduralForestScene(ctx, canvas);
        }
        
        // Draw characters, dialogue, and UI on top
        this.drawCharactersAt(time);
        
        // Draw movement paths if a character is selected
        if (this.selectedCharacter) {
            this.drawMovementPath(this.selectedCharacter);
        }
        
        this.drawDialogueAt(time);
        this.drawPreviewOverlay(time);
    }
    
    drawMovementPath(character) {
        if (!character || !this.dom.ctx) return;
        
        const ctx = this.dom.ctx;
        const track = this.getActiveTracks()[character.trackIndex];
        if (!track || track.keyframes.length < 2) return;
        
        // Draw path line connecting all keyframes
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'; // Yellow path
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed line
        
        ctx.beginPath();
        let firstPoint = true;
        
        track.keyframes.forEach(keyframe => {
            if (keyframe.properties && keyframe.properties.x !== undefined && keyframe.properties.y !== undefined) {
                const x = keyframe.properties.x;
                const y = keyframe.properties.y;
                
                if (firstPoint) {
                    ctx.moveTo(x, y);
                    firstPoint = false;
                } else {
                    ctx.lineTo(x, y);
                }
                
                // Draw keyframe markers
                ctx.save();
                ctx.setLineDash([]); // Remove dashes for markers
                ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI);
                ctx.fill();
                
                // Draw time label
                ctx.fillStyle = '#fff';
                ctx.font = '10px VT323';
                ctx.textAlign = 'center';
                ctx.fillText(`${keyframe.time.toFixed(1)}s`, x, y - 8);
                ctx.restore();
            }
        });
        
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
    }
    
    drawProceduralForestScene(ctx, canvas) {
        // Draw forest clearing
        ctx.fillStyle = '#2d5a3d';
        ctx.beginPath();
        ctx.ellipse(canvas.width/2, canvas.height*0.8, 150, 60, 0, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw trees
        for (let i = 0; i < 5; i++) {
            const x = 50 + i * 80;
            const y = canvas.height * 0.3;
            this.drawSimpleTree(ctx, x, y);
        }
    }
    
    drawSimpleTree(ctx, x, y) {
        // Trunk
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(x-8, y, 16, 40);
        
        // Crown
        ctx.fillStyle = '#2d5016';
        ctx.beginPath();
        ctx.arc(x, y-10, 25, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    drawCharactersAt(time) {
        const ctx = this.dom.ctx;
        
        // Find active keyframes at this time with interpolation
        this.getActiveTracks().forEach(track => {
            if (track.type === 'actor') {
                const position = this.getInterpolatedPosition(track, time);
                if (position) {
                    this.drawCharacter(position, track.name);
                }
            }
        });
    }
    
    getInterpolatedPosition(track, time) {
        const keyframes = track.keyframes.sort((a, b) => a.time - b.time);
        
        // Find the two keyframes to interpolate between
        let currentKeyframe = null;
        let nextKeyframe = null;
        
        for (let i = 0; i < keyframes.length; i++) {
            if (keyframes[i].time <= time) {
                currentKeyframe = keyframes[i];
                if (i + 1 < keyframes.length) {
                    nextKeyframe = keyframes[i + 1];
                }
            } else {
                break;
            }
        }
        
        if (!currentKeyframe) return null;
        
        // If no next keyframe, use current position
        if (!nextKeyframe || nextKeyframe.time <= time) {
            return {
                ...currentKeyframe.properties,
                sprite: currentKeyframe.properties?.sprite || 'default',
                moving: false
            };
        }
        
        // Interpolate between current and next keyframe
        const progress = (time - currentKeyframe.time) / (nextKeyframe.time - currentKeyframe.time);
        const currentX = currentKeyframe.properties?.x || 0;
        const currentY = currentKeyframe.properties?.y || 0;
        const nextX = nextKeyframe.properties?.x || currentX;
        const nextY = nextKeyframe.properties?.y || currentY;
        
        return {
            x: currentX + (nextX - currentX) * progress,
            y: currentY + (nextY - currentY) * progress,
            sprite: currentKeyframe.properties?.sprite || 'default',
            scale: currentKeyframe.properties?.scale || 1,
            opacity: currentKeyframe.properties?.opacity || 1,
            moving: Math.abs(nextX - currentX) > 5 || Math.abs(nextY - currentY) > 5
        };
    }
    
    drawCharacter(position, name) {
        const ctx = this.dom.ctx;
        const x = position.x || 200;
        const y = position.y || 200;
        const scale = position.scale || 1;
        const opacity = position.opacity || 1;
        
        // Check if this character is selected
        const isSelected = this.selectedCharacter && this.selectedCharacter.name === name;
        
        ctx.globalAlpha = opacity;
        
        // Character shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 20, 12 * scale, 6 * scale, 0, 0, 2 * Math.PI);
        ctx.fill();
        
        // Selection highlight
        if (isSelected) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(x, y, (15 * scale) + 8, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.setLineDash([]); // Reset dash
            
            // Selection crosshairs
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 25, y);
            ctx.lineTo(x + 25, y);
            ctx.moveTo(x, y - 25);
            ctx.lineTo(x, y + 25);
            ctx.stroke();
        }
        
        // Character body
        const radius = 15 * scale;
        ctx.fillStyle = name.includes('Player') ? '#4a90e2' : 
                       name.includes('Merchant') ? '#e67e22' : '#e74c3c';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Character outline
        ctx.strokeStyle = isSelected ? '#ff0000' : '#000';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash([]);
        ctx.stroke();
        
        // Movement indicator
        if (position.moving) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(x - 25 - i*8, y + Math.sin(Date.now()/200 + i)*3, 2, 0, 2*Math.PI);
                ctx.fill();
            }
        }
        
        // Hover/interaction indicator
        if (this.currentTool === 'move') {
            ctx.fillStyle = 'rgba(255, 0, 0,0.3)';
            ctx.beginPath();
            ctx.arc(x, y, radius + 5, 0, 2 * Math.PI);
            ctx.fill();
        }
        
        // Character label
        ctx.fillStyle = isSelected ? '#ff0000' : '#ff0000';
        ctx.font = `${12 * scale}px VT323`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(name, x, y - 25 * scale);
        ctx.fillText(name, x, y - 25 * scale);
        
        // Position coordinates (when selected)
        if (isSelected) {
            ctx.fillStyle = '#ff0000';
            ctx.font = '10px VT323';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            const posText = `(${x.toFixed(0)}, ${y.toFixed(0)})`;
            ctx.strokeText(posText, x, y + 35 * scale);
            ctx.fillText(posText, x, y + 35 * scale);
        }
        
        ctx.globalAlpha = 1.0;
    }
    
    drawDialogueAt(time) {
        const ctx = this.dom.ctx;
        const canvas = this.dom.canvas;
        
        // Find active dialogue from interaction tracks
        const activeDialogue = this.getActiveDialogue(time);
        if (!activeDialogue) return;
        
        // Dialogue box background
        const boxHeight = 120;
        const boxY = canvas.height - boxHeight - 60;
        const margin = 20;
        
        // Main dialogue box
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(margin, boxY, canvas.width - margin*2, boxHeight);
        
        // Border
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.strokeRect(margin, boxY, canvas.width - margin*2, boxHeight);
        
        // Speaker name
        if (activeDialogue.speaker) {
            ctx.fillStyle = '#ff0000';
            ctx.font = '16px VT323';
            ctx.textAlign = 'left';
            ctx.fillText(activeDialogue.speaker.toUpperCase(), margin + 15, boxY + 25);
        }
        
        // Dialogue text
        ctx.fillStyle = '#fff';
        ctx.font = '14px VT323';
        const textY = boxY + (activeDialogue.speaker ? 50 : 25);
        this.wrapText(ctx, activeDialogue.text, margin + 15, textY, canvas.width - margin*3, 20);
        
        // Choices if available
        if (activeDialogue.choices && activeDialogue.choices.length > 0) {
            this.drawChoices(activeDialogue.choices, time);
        }
    }
    
    getActiveDialogue(time) {
        // Check interaction tracks for active dialogue
        for (const track of this.getActiveTracks()) {
            if (track.type === 'interaction') {
                const keyframe = this.findActiveKeyframe(track, time);
                if (keyframe && keyframe.type === 'dialogue') {
                    return {
                        speaker: keyframe.data.speaker,
                        text: keyframe.data.text,
                        choices: keyframe.data.choices || [],
                        style: keyframe.data.style
                    };
                }
            }
        }
        
        // Check branches for dialogue (ensure branches is an object)
        const branches = this.data.branches || {};
        for (const branchId of Object.keys(branches)) {
            const branch = branches[branchId];
            if (branch.trigger_time <= time && branch.trigger_time + 10 > time) {
                if (branch.dialogue) {
                    return {
                        speaker: branch.dialogue.speaker,
                        text: branch.dialogue.text,
                        choices: branch.choices || []
                    };
                }
            }
        }
        
        return null;
    }
    
    drawChoices(choices, time) {
        const ctx = this.dom.ctx;
        const canvas = this.dom.canvas;
        
        // Choice container
        const choiceY = canvas.height - 180;
        const choiceHeight = 25;
        const choiceSpacing = 5;
        
        ctx.fillStyle = 'rgba(20,20,20,0.95)';
        const totalHeight = choices.length * (choiceHeight + choiceSpacing) + 10;
        ctx.fillRect(canvas.width - 300, choiceY - totalHeight, 280, totalHeight);
        
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvas.width - 300, choiceY - totalHeight, 280, totalHeight);
        
        // Draw each choice
        choices.forEach((choice, index) => {
            const y = choiceY - totalHeight + 15 + index * (choiceHeight + choiceSpacing);
            
            // Choice background
            ctx.fillStyle = index === 0 ? 'rgba(255, 0, 0,0.2)' : 'rgba(50,50,50,0.8)';
            ctx.fillRect(canvas.width - 290, y - 15, 260, choiceHeight);
            
            // Choice border
            ctx.strokeStyle = index === 0 ? '#ff0000' : '#666';
            ctx.lineWidth = 1;
            ctx.strokeRect(canvas.width - 290, y - 15, 260, choiceHeight);
            
            // Choice text
            ctx.fillStyle = index === 0 ? '#ff0000' : '#ccc';
            ctx.font = '12px VT323';
            ctx.textAlign = 'left';
            ctx.fillText(`${index + 1}. ${choice.text}`, canvas.width - 280, y);
            
            // Show consequence preview
            if (choice.consequence) {
                ctx.fillStyle = '#888';
                ctx.font = '10px VT323';
                ctx.fillText(`→ ${choice.consequence}`, canvas.width - 280, y + 12);
            }
        });
        
        // Instructions
        ctx.fillStyle = '#888';
        ctx.font = '10px VT323';
        ctx.textAlign = 'right';
        ctx.fillText('USE NUMBER KEYS TO CHOOSE', canvas.width - 10, choiceY - totalHeight - 5);
    }
    
    wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        let currentY = y;
        
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, currentY);
    }
    
    findActiveKeyframe(track, time) {
        let activeKeyframe = null;
        
        for (const keyframe of track.keyframes) {
            if (keyframe.time <= time) {
                activeKeyframe = keyframe;
            } else {
                break;
            }
        }
        
        return activeKeyframe;
    }
    
    drawPreviewOverlay(time) {
        const ctx = this.dom.ctx;
        const canvas = this.dom.canvas;
        
        // Time indicator
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(10, 10, 120, 30);
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, 120, 30);
        
        ctx.fillStyle = '#ff0000';
        ctx.font = '14px VT323';
        ctx.textAlign = 'left';
        ctx.fillText(`TIME: ${time.toFixed(1)}s`, 20, 30);
        
        // Scene title
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(canvas.width-200, 10, 190, 30);
        ctx.strokeStyle = '#ff0000';
        ctx.strokeRect(canvas.width-200, 10, 190, 30);
        
        ctx.fillStyle = '#ff0000';
        ctx.textAlign = 'right';
        ctx.fillText('FOREST ENCOUNTER', canvas.width-10, 30);
        
        // Timeline scrub bar at bottom
        const scrubHeight = 20;
        const scrubY = canvas.height - scrubHeight - 10;
        const scrubWidth = canvas.width - 40;
        
        // Scrub background
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(20, scrubY, scrubWidth, scrubHeight);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.strokeRect(20, scrubY, scrubWidth, scrubHeight);
        
        // Progress bar
        const duration = this.getActiveDuration();
        const progress = duration > 0 ? time / duration : 0;
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(20, scrubY, scrubWidth * progress, scrubHeight);
        
        // Playhead indicator
        const playheadX = 20 + (scrubWidth * progress);
        ctx.fillStyle = '#fff';
        ctx.fillRect(playheadX - 1, scrubY, 2, scrubHeight);
        
        // Duration labels
        ctx.fillStyle = '#888';
        ctx.font = '10px VT323';
        ctx.textAlign = 'left';
        ctx.fillText('0s', 25, scrubY - 5);
        ctx.textAlign = 'right';
        ctx.fillText(`${duration}s`, scrubWidth + 15, scrubY - 5);
        
        // Click instruction
        ctx.textAlign = 'center';
        ctx.fillStyle = '#666';
        ctx.font = '10px VT323';
        
        if (this.currentTool === 'move') {
            ctx.fillText('CLICK & DRAG CHARACTERS TO MOVE', canvas.width/2, canvas.height - 5);
        } else if (this.selectedCharacter) {
            ctx.fillText(`SELECTED: ${this.selectedCharacter.name} - PRESS M TO MOVE`, canvas.width/2, canvas.height - 5);
        } else {
            ctx.fillText('CLICK TIMELINE TO SEEK', canvas.width/2, canvas.height - 5);
        }
        
        // Tool indicator
        if (this.currentTool !== 'select') {
            ctx.fillStyle = 'rgba(255, 0, 0,0.9)';
            ctx.fillRect(10, 50, 80, 20);
            ctx.strokeStyle = '#ff0000';
            ctx.strokeRect(10, 50, 80, 20);
            
            ctx.fillStyle = '#000';
            ctx.font = '12px VT323';
            ctx.textAlign = 'center';
            ctx.fillText(this.currentTool.toUpperCase(), 50, 64);
        }
    }
    
    // Event Handlers
    selectAsset(type, asset) {
        console.log(`Selected ${type}:`, asset);
    }
    
    selectTrack(index) {
        // Clear previous selection
        document.querySelectorAll('.track-header').forEach(h => h.classList.remove('selected'));
        document.querySelectorAll('.keyframe').forEach(k => k.classList.remove('selected'));
        
        // Select new track
        const headers = document.querySelectorAll('.track-header');
        if (headers[index]) {
            headers[index].classList.add('selected');
        }
        
        this.playback.selectedTrack = index;
        this.playback.selectedKeyframe = null;
        this.updateInspector();
        this.updateStatus(`Track selected: ${this.getActiveTracks()[index]?.name || `Track ${index + 1}`}`);
    }
    
    selectKeyframe(trackIndex, keyframeIndex) {
        // Clear previous selection
        document.querySelectorAll('.track-header').forEach(h => h.classList.remove('selected'));
        document.querySelectorAll('.keyframe').forEach(k => k.classList.remove('selected'));
        
        // Select keyframe
        const keyframes = document.querySelectorAll('.keyframe');
        let keyframeElement = null;
        let currentIndex = 0;
        
        this.getActiveTracks().forEach((track, tIdx) => {
            track.keyframes?.forEach((kf, kIdx) => {
                if (tIdx === trackIndex && kIdx === keyframeIndex) {
                    keyframeElement = keyframes[currentIndex];
                }
                currentIndex++;
            });
        });
        
        if (keyframeElement) {
            keyframeElement.classList.add('selected');
        }
        
        this.playback.selectedTrack = trackIndex;
        this.playback.selectedKeyframe = keyframeIndex;
        this.updateInspector();
        
        const keyframe = this.getActiveTracks()[trackIndex]?.keyframes[keyframeIndex];
        this.updateStatus(`Keyframe selected: ${keyframe?.type || 'keyframe'} at ${keyframe?.time?.toFixed(1)}s`);
    }
    
    selectBranch(branchId) {
        console.log("Selected branch:", branchId);
        
        const oldBranch = this.currentBranch;
        this.currentBranch = branchId;
        
        // Update visual selection
        this.updateBranches();
        
        if (branchId === 'main') {
            // Switch to main timeline
            this.updateStatus("Switched to Main Timeline");
            this.updateTimeline();
            this.renderCanvasPreview();
        } else if (this.data.branches && this.data.branches[branchId]) {
            // Switch to branch timeline
            const branch = this.data.branches[branchId];
            this.updateStatus(`Switched to Branch: ${branchId}`);
            
            // Update timeline to show branch tracks
            this.updateTimeline();
            this.renderCanvasPreview();
            
            // Show branch info in inspector
            this.updateInspector();
        } else {
            this.updateStatus(`Branch not found: ${branchId}`);
            this.currentBranch = oldBranch;
        }

        if (this.playback.selectedTrack !== null && !this.getSelectedTrack()) {
            this.playback.selectedTrack = null;
            this.playback.selectedKeyframe = null;
        }
        this.seekTo(this.playback.currentTime);
        this.updateUI();
    }
    
    deleteBranch(branchId) {
        if (confirm(`Delete branch "${branchId}"? This cannot be undone.`)) {
            if (this.data.branches && this.data.branches[branchId]) {
                delete this.data.branches[branchId];
                
                // Switch back to main if current branch was deleted
                if (this.currentBranch === branchId) {
                    this.currentBranch = 'main';
                }
                
                this.updateBranches();
                this.updateTimeline();
                this.updateStatus(`Branch deleted: ${branchId}`);
            }
        }
    }
    
    handleTimelineClick(e) {
        const rect = this.dom.trackLanes.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = x / this.playback.zoom;
        
        this.seekTo(time);
    }
    
    // Playback Methods
    togglePlayback() {
        if (this.playback.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    play() {
        this.playback.isPlaying = true;
        document.getElementById('play-icon').className = 'fas fa-pause';
        
        if (this.engine) {
            this.engine.loadCutscene(this.data).then(() => {
                this.engine.play();
            });
        }
        
        this.updateStatus("PLAYING CUTSCENE");
        this.animationLoop();
    }
    
    pause() {
        this.playback.isPlaying = false;
        document.getElementById('play-icon').className = 'fas fa-play';
        
        if (this.engine) {
            this.engine.pause();
        }
        
        this.updateStatus("PAUSED");
    }
    
    stop() {
        this.pause();
        this.seekTo(0);
        
        if (this.engine) {
            this.engine.stop();
        }
    }
    
    seekTo(time) {
        this.playback.currentTime = Math.max(0, Math.min(time, this.getActiveDuration()));
        this.updatePlayhead();
        this.updateTimeDisplay();
        this.renderCanvasPreview(); // Update canvas when seeking
    }
    
    animationLoop() {
        if (!this.playback.isPlaying) return;
        
        this.playback.currentTime += 1/60; // 60 FPS
        
        if (this.playback.currentTime >= this.getActiveDuration()) {
            this.stop();
            return;
        }
        
        this.updatePlayhead();
        this.updateTimeDisplay();
        this.renderCanvasPreview(); // Add canvas update during playback
        
        requestAnimationFrame(() => this.animationLoop());
    }
    
    updatePlayhead() {
        const playhead = document.getElementById('playhead');
        if (playhead) {
            playhead.style.left = `${this.playback.currentTime * this.playback.zoom}px`;
        }
    }
    
    // Utility Methods
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(1);
        return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
    }

    setValueAtPath(target, path, value) {
        const parts = String(path || '').split('.');
        if (!parts.length) return;
        let cursor = target;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (cursor[part] === undefined || cursor[part] === null || typeof cursor[part] !== 'object') {
                cursor[part] = {};
            }
            cursor = cursor[part];
        }
        cursor[parts[parts.length - 1]] = value;
    }

    updateKeyframeProperty(path, value) {
        const track = this.getSelectedTrack();
        if (!track || this.playback.selectedKeyframe === null) return;
        const keyframe = track.keyframes?.[this.playback.selectedKeyframe];
        if (!keyframe) return;

        this.setValueAtPath(keyframe, path, value);
        if (!keyframe.data && track.type === 'interaction') {
            keyframe.data = {};
        }
        this.updateUI();
        this.updateStatus(`UPDATED KEYFRAME ${path.toUpperCase()}`);
    }

    updateTrackProperty(path, value) {
        const track = this.getSelectedTrack();
        if (!track) return;

        this.setValueAtPath(track, path, value);
        this.updateUI();
        this.updateStatus(`UPDATED TRACK ${path.toUpperCase()}`);
    }

    updateCutsceneProperty(path, value) {
        if (path === 'duration') {
            this.getActiveTimeline().duration = Number(value) || 30;
        } else if (path === 'timeline.fps') {
            this.data.timeline.fps = Number(value) || 60;
        } else {
            this.setValueAtPath(this.data, path, value);
        }
        this.seekTo(this.playback.currentTime);
        this.updateUI();
        this.updateStatus(`UPDATED CUTSCENE ${path.toUpperCase()}`);
    }

    async listCutsceneFiles() {
        const response = await fetch('/api/ide/list?dir=dunyalar/definitions/interactive_cutscenes');
        if (!response.ok) {
            throw new Error('Could not list cutscene files');
        }
        const files = await response.json();
        return files
            .filter(file => !file.isDirectory && file.name.endsWith('.json'))
            .map(file => file.name)
            .sort((a, b) => a.localeCompare(b));
    }

    normalizeLoadedCutscene(data, fallbackId = 'cutscene') {
        const normalized = data && typeof data === 'object' ? data : {};
        normalized.id = this.sanitizeCutsceneId(normalized.id || normalized.name || fallbackId);
        normalized.name = normalized.name || normalized.id;
        if (!normalized.timeline || typeof normalized.timeline !== 'object') {
            normalized.timeline = { duration: 30, fps: 60, tracks: [] };
        }
        if (!Array.isArray(normalized.timeline.tracks)) normalized.timeline.tracks = [];
        if (!normalized.timeline.duration) normalized.timeline.duration = 30;
        if (!normalized.timeline.fps) normalized.timeline.fps = 60;
        if (!normalized.variables || typeof normalized.variables !== 'object') normalized.variables = {};
        if (!normalized.branches || typeof normalized.branches !== 'object') normalized.branches = {};
        return normalized;
    }

    normalizeTimelineSchema(timeline) {
        if (!timeline || !Array.isArray(timeline.tracks)) return;
        timeline.tracks.forEach(track => {
            if (!Array.isArray(track.keyframes)) track.keyframes = [];
            track.keyframes.forEach(keyframe => {
                if (typeof keyframe.time !== 'number') keyframe.time = Number(keyframe.time) || 0;
                if (track.type === 'interaction') {
                    if (!keyframe.data || typeof keyframe.data !== 'object') keyframe.data = {};
                    if (keyframe.type && !keyframe.data.type) keyframe.data.type = keyframe.type;
                    if (!keyframe.type && keyframe.data.type) keyframe.type = keyframe.data.type;
                }
            });
            track.keyframes.sort((a, b) => a.time - b.time);
        });
    }

    normalizeCutsceneSchema() {
        this.normalizeTimelineSchema(this.data.timeline);
        Object.keys(this.data.branches || {}).forEach(branchId => {
            this.normalizeTimelineSchema(this.data.branches[branchId]);
        });
    }

    async loadCutsceneFile(fileName) {
        const filePath = `dunyalar/definitions/interactive_cutscenes/${fileName}`;
        const response = await fetch(`/api/ide/read?file=${encodeURIComponent(filePath)}`);
        if (!response.ok) {
            throw new Error(`Could not read ${fileName}`);
        }
        const content = await response.text();
        const parsed = JSON.parse(content);
        const fallbackId = fileName.replace(/\.json$/i, '');
        this.data = this.normalizeLoadedCutscene(parsed, fallbackId);
        this.normalizeCutsceneSchema();
        this.currentBranch = 'main';
        this.playback.currentTime = 0;
        this.playback.selectedTrack = null;
        this.playback.selectedKeyframe = null;
        this.selectedCharacter = null;
        this.updateUI();
        this.updateStatus(`LOADED: ${this.data.name}`);
    }
    
    updateStatus(message) {
        document.getElementById('status-info').textContent = message.toUpperCase();
    }
    
    // Algorithm Studio style functions
    newCutscene() {
        if (confirm('CREATE NEW CUTSCENE? UNSAVED CHANGES WILL BE LOST.')) {
            location.reload();
        }
    }
    
    async openCutscene() {
        try {
            const files = await this.listCutsceneFiles();
            if (!files.length) {
                this.updateStatus('NO SAVED CUTSCENES FOUND');
                return;
            }

            const menu = files.map((name, idx) => `${idx + 1}. ${name}`).join('\n');
            const pick = prompt(`OPEN CUTSCENE:\n${menu}\n\nEnter number or filename:`);
            if (!pick) return;

            const trimmed = pick.trim();
            const index = Number.parseInt(trimmed, 10);
            let fileName = Number.isInteger(index) && index > 0 && index <= files.length
                ? files[index - 1]
                : trimmed;
            if (!fileName.endsWith('.json')) fileName += '.json';
            if (!files.includes(fileName)) {
                this.updateStatus(`CUTSCENE NOT FOUND: ${fileName}`);
                return;
            }

            await this.loadCutsceneFile(fileName);
        } catch (error) {
            console.error('[InteractiveCutscene] Open failed:', error);
            this.updateStatus('FAILED TO OPEN CUTSCENE');
        }
    }
    
    async saveCutscene(saveAs = false) {
        this.normalizeCutsceneSchema();
        const currentId = this.sanitizeCutsceneId(this.data.id || this.data.name);
        let fileStem = currentId;
        if (saveAs) {
            const input = prompt('SAVE CUTSCENE AS (without extension):', currentId);
            if (!input) return;
            fileStem = this.sanitizeCutsceneId(input);
        }

        this.data.id = fileStem;
        if (!this.data.name) this.data.name = fileStem;
        const fileName = `${fileStem}.json`;
        const filePath = `dunyalar/definitions/interactive_cutscenes/${fileName}`;

        const serialized = JSON.stringify(this.data, null, 2);
        let savedToFile = false;

        try {
            const response = await fetch('/api/ide/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: filePath, content: serialized })
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            savedToFile = true;
        } catch (error) {
            console.error('[InteractiveCutscene] Save to file failed:', error);
        }

        // Save to shared project state
        if (projectState) {
            projectState.set(`cutscenes.${this.data.id}`, this.data);
        }
        
        // Broadcast save event
        if (eventBus) {
            eventBus.emit('cutscene:saved', {
                cutsceneId: this.data.id,
                cutscene: this.data,
                timestamp: Date.now()
            });
        }
        
        if (!savedToFile && window.cutsceneAPI) {
            try {
                await window.cutsceneAPI.saveCutscene(this.data);
            } catch (error) {
                console.error('[InteractiveCutscene] Legacy save failed:', error);
            }
        }

        this.updateStatus(savedToFile
            ? `SAVED: ${this.data.name} (${fileName})`
            : `SAVED TO LOCAL STATE: ${this.data.name}`);
    }
    
    exportCutscene() {
        this.normalizeCutsceneSchema();
        const fileName = `${this.sanitizeCutsceneId(this.data.id || this.data.name)}.json`;
        const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        this.updateStatus(`EXPORTED: ${fileName}`);
    }
    
    undo() {
        if (projectState) {
            if (projectState.undo()) {
                // Reload cutscene from state
                const cutsceneData = projectState.get(`cutscenes.${this.data.id}`);
                if (cutsceneData) {
                    this.data = cutsceneData;
                    this.updateUI();
                    this.updateStatus("UNDONE");
                }
            } else {
                this.updateStatus("NOTHING TO UNDO");
            }
        } else {
            this.updateStatus("UNDO FEATURE COMING SOON");
        }
    }
    
    redo() {
        if (projectState) {
            if (projectState.redo()) {
                // Reload cutscene from state
                const cutsceneData = projectState.get(`cutscenes.${this.data.id}`);
                if (cutsceneData) {
                    this.data = cutsceneData;
                    this.updateUI();
                    this.updateStatus("REDONE");
                }
            } else {
                this.updateStatus("NOTHING TO REDO");
            }
        } else {
            this.updateStatus("REDO FEATURE COMING SOON");
        }
    }
    
    deleteSelected() {
        if (this.playback.selectedKeyframe !== null) {
            const track = this.getSelectedTrack();
            if (track && track.keyframes) {
                track.keyframes.splice(this.playback.selectedKeyframe, 1);
                this.playback.selectedKeyframe = null;
                this.updateUI();
                this.updateStatus("KEYFRAME DELETED");
            }
        } else if (this.playback.selectedTrack !== null) {
            if (confirm('DELETE SELECTED TRACK?')) {
                this.getActiveTracks().splice(this.playback.selectedTrack, 1);
                this.playback.selectedTrack = null;
                this.updateUI();
                this.updateStatus("TRACK DELETED");
            }
        }
    }
    
    clearTimeline() {
        if (confirm('CLEAR ENTIRE TIMELINE?')) {
            this.getActiveTimeline().tracks = [];
            this.playback.selectedTrack = null;
            this.playback.selectedKeyframe = null;
            this.updateUI();
            this.updateStatus("TIMELINE CLEARED");
        }
    }
    
    addKeyframe() {
        if (this.playback.selectedTrack !== null) {
            const track = this.getSelectedTrack();
            if (track) {
                const keyframe = {
                    time: this.playback.currentTime,
                    properties: {}
                };
                if (track.type === 'interaction') {
                    keyframe.type = 'dialogue';
                    keyframe.data = {
                        type: 'dialogue',
                        speaker: 'Character',
                        text: 'New dialogue text...',
                        textSpeed: 35,
                        autoAdvance: false,
                        choices: []
                    };
                }
                
                if (!track.keyframes) track.keyframes = [];
                track.keyframes.push(keyframe);
                track.keyframes.sort((a, b) => a.time - b.time);
                
                this.updateUI();
                this.updateStatus(`KEYFRAME ADDED AT ${keyframe.time.toFixed(1)}S`);
            }
        } else {
            this.updateStatus("SELECT TRACK FIRST");
        }
    }
    
    resetView() {
        this.playback.zoom = 50;
        document.getElementById('zoom-slider').value = 50;
        document.getElementById('zoom-display').textContent = '50px/s';
        this.updateTimeline();
        this.updateStatus("VIEW RESET");
    }
    
    toggleGrid() {
        // Toggle grid visibility in timeline
        const lanes = document.getElementById('track-lanes');
        if (lanes.style.backgroundImage.includes('linear-gradient')) {
            lanes.style.backgroundImage = 'none';
            this.updateStatus("GRID HIDDEN");
        } else {
            lanes.style.backgroundImage = `
                linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
            `;
            this.updateStatus("GRID SHOWN");
        }
    }
    
    zoomIn() {
        const slider = document.getElementById('zoom-slider');
        const newValue = Math.min(100, parseInt(slider.value) + 10);
        slider.value = newValue;
        this.updateZoom(newValue);
    }
    
    zoomOut() {
        const slider = document.getElementById('zoom-slider');
        const newValue = Math.max(10, parseInt(slider.value) - 10);
        slider.value = newValue;
        this.updateZoom(newValue);
    }
    
    testCutscene() {
        if (this.engine) {
            this.engine.loadCutscene(this.data).then(() => {
                this.engine.play();
                this.updateStatus("TESTING CUTSCENE");
            });
        } else {
            this.updateStatus("ENGINE NOT AVAILABLE");
        }
    }
    
    validateData() {
        if (window.cutsceneAPI) {
            const validation = window.cutsceneAPI.validateCutsceneData(this.data);
            if (validation.valid) {
                this.updateStatus("VALIDATION PASSED");
            } else {
                this.updateStatus(`VALIDATION FAILED: ${validation.errors.length} ERRORS`);
                console.error("Validation errors:", validation.errors);
            }
            return;
        }

        const hasTracks = Array.isArray(this.getActiveTracks());
        const hasDuration = typeof this.getActiveDuration() === 'number' && this.getActiveDuration() > 0;
        this.updateStatus(hasTracks && hasDuration ? 'VALIDATION PASSED' : 'VALIDATION FAILED');
    }
    
    showDocs() {
        window.open('docs.html', '_blank');
    }
    
    showAbout() {
        alert('INTERACTIVE CUTSCENE STUDIO v1.0\nBuilt with RedGlitch Engine\n\nPowered by REDGLITCH Technology');
    }
    
    // New editing tools
    addDialogue() {
        if (this.playback.selectedTrack !== null) {
            const track = this.getSelectedTrack();
            if (track && track.type === 'interaction') {
                const dialogueKeyframe = {
                    time: this.playback.currentTime,
                    type: 'dialogue',
                    data: {
                        type: 'dialogue',
                        speaker: 'Character',
                        text: 'New dialogue text...',
                        textSpeed: 35,
                        autoAdvance: false,
                        choices: []
                    }
                };
                
                if (!track.keyframes) track.keyframes = [];
                track.keyframes.push(dialogueKeyframe);
                track.keyframes.sort((a, b) => a.time - b.time);
                
                this.updateUI();
                this.updateStatus(`DIALOGUE ADDED AT ${dialogueKeyframe.time.toFixed(1)}S`);
            } else {
                this.updateStatus("SELECT INTERACTION TRACK FIRST");
            }
        } else {
            this.updateStatus("SELECT INTERACTION TRACK FIRST");
        }
    }
    
    addChoice() {
        if (this.playback.selectedTrack !== null && this.playback.selectedKeyframe !== null) {
            const track = this.getSelectedTrack();
            const keyframe = track.keyframes[this.playback.selectedKeyframe];
            
            if (keyframe && keyframe.type === 'dialogue') {
                if (!keyframe.data.choices) keyframe.data.choices = [];
                
                keyframe.data.choices.push({
                    text: 'New choice option',
                    consequence: 'Action result',
                    branch_to: 'main_path',
                    variables: {}
                });
                
                this.updateUI();
                this.updateStatus("CHOICE OPTION ADDED");
            } else {
                this.updateStatus("SELECT DIALOGUE KEYFRAME FIRST");
            }
        } else {
            this.updateStatus("SELECT DIALOGUE KEYFRAME FIRST");
        }
    }
    
    selectTool() {
        this.currentTool = 'select';
        this.updateToolButtons();
        this.updateStatus("SELECT TOOL ACTIVE");
    }
    
    moveKeyframe() {
        this.currentTool = 'move';
        this.updateToolButtons();
        this.updateStatus("MOVE TOOL ACTIVE - CLICK AND DRAG KEYFRAMES");
    }
    
    updateToolButtons() {
        // Visual feedback for active tool
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (this.currentTool === 'select') {
            document.querySelector('.tool-btn[onclick="selectTool()"]')?.classList.add('active');
        } else if (this.currentTool === 'move') {
            document.querySelector('.tool-btn[onclick="moveKeyframe()"]')?.classList.add('active');
        }
        
        // Update canvas cursor
        if (this.currentTool === 'move') {
            this.dom.canvas.style.cursor = 'grab';
        } else {
            this.dom.canvas.style.cursor = 'default';
        }
    }
    
    // Character movement methods
    getCharacterAt(x, y) {
        const tolerance = 20; // Click tolerance radius
        const tracks = this.getActiveTracks();
        
        // Check each actor track for characters at current time
        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            if (track.type === 'actor') {
                const position = this.getInterpolatedPosition(track, this.playback.currentTime);
                if (position) {
                    const charX = position.x || 200;
                    const charY = position.y || 200;
                    const distance = Math.sqrt((x - charX) ** 2 + (y - charY) ** 2);
                    
                    if (distance <= tolerance) {
                        return {
                            trackIndex: i,
                            track: track,
                            name: track.name,
                            position: position
                        };
                    }
                }
            }
        }
        
        return null;
    }
    
    moveCharacterTo(character, x, y) {
        if (!character) return;
        
        // Update the character's current position for real-time feedback
        const track = this.getActiveTracks()[character.trackIndex];
        if (track) {
            // Find or create keyframe at current time
            let keyframeIndex = -1;
            for (let i = 0; i < track.keyframes.length; i++) {
                if (Math.abs(track.keyframes[i].time - this.playback.currentTime) < 0.1) {
                    keyframeIndex = i;
                    break;
                }
            }
            
            if (keyframeIndex === -1) {
                // Create new keyframe
                const newKeyframe = {
                    time: this.playback.currentTime,
                    properties: {
                        x: x,
                        y: y,
                        sprite: character.position?.sprite || 'default',
                        scale: character.position?.scale || 1,
                        opacity: character.position?.opacity || 1
                    }
                };
                
                track.keyframes.push(newKeyframe);
                track.keyframes.sort((a, b) => a.time - b.time);
            } else {
                // Update existing keyframe
                track.keyframes[keyframeIndex].properties.x = x;
                track.keyframes[keyframeIndex].properties.y = y;
            }
            
            this.renderCanvasPreview();
            this.updateTimeline();
            this.updateStatus(`MOVED ${character.name} TO (${x.toFixed(0)}, ${y.toFixed(0)})`);
        }
    }
    
    createMovementKeyframe(character) {
        if (!character) return;
        
        const track = this.getActiveTracks()[character.trackIndex];
        if (track) {
            this.updateStatus(`MOVEMENT KEYFRAME CREATED FOR ${character.name} AT ${this.playback.currentTime.toFixed(1)}s`);
        }
    }
    
    // Character position update methods
    updateCharacterPosition(property, value) {
        if (!this.selectedCharacter) return;
        
        const character = this.selectedCharacter;
        
        // Update character position immediately
        if (!character.position) character.position = {};
        character.position[property] = value;
        
        // Also update or create keyframe
        this.moveCharacterTo(character, 
            character.position.x || 200, 
            character.position.y || 200);
            
        this.renderCanvasPreview();
        this.updateStatus(`${character.name} ${property.toUpperCase()}: ${value}`);
    }
    
    createKeyframeAtCurrentTime() {
        if (!this.selectedCharacter) return;
        
        this.createMovementKeyframe(this.selectedCharacter);
        this.updateTimeline();
    }
    
    moveCharacterToPreset(preset) {
        if (!this.selectedCharacter) return;
        
        const canvas = this.dom.canvas;
        let x, y;
        
        switch (preset) {
            case 'center':
                x = canvas.width / 2;
                y = canvas.height / 2;
                break;
            case 'left':
                x = canvas.width * 0.25;
                y = canvas.height * 0.7;
                break;
            case 'right':
                x = canvas.width * 0.75;
                y = canvas.height * 0.7;
                break;
            default:
                return;
        }
        
        this.moveCharacterTo(this.selectedCharacter, x, y);
        this.updateInspector(); // Refresh inspector to show new values
    }
    
    // Enhanced Movement Tools
    addMovementPath() {
        if (!this.selectedCharacter) {
            this.updateStatus('Please select a character first');
            return;
        }
        
        // Create keyframes for a curved movement path
        const character = this.selectedCharacter;
        const track = this.getActiveTracks()[character.trackIndex];
        if (!track) return;
        
        const canvas = this.dom.canvas;
        const startX = canvas.width * 0.2;
        const endX = canvas.width * 0.8;
        const centerY = canvas.height * 0.5;
        const currentTime = this.playback.currentTime;
        
        // Create 5 keyframes for smooth curved path
        const pathPoints = [
            { time: currentTime, x: startX, y: centerY },
            { time: currentTime + 1, x: startX + (endX - startX) * 0.25, y: centerY - 30 },
            { time: currentTime + 2, x: startX + (endX - startX) * 0.5, y: centerY },
            { time: currentTime + 3, x: startX + (endX - startX) * 0.75, y: centerY + 30 },
            { time: currentTime + 4, x: endX, y: centerY }
        ];
        
        pathPoints.forEach(point => {
            const keyframe = {
                time: point.time,
                properties: {
                    x: point.x,
                    y: point.y,
                    sprite: character.position?.sprite || 'default',
                    scale: character.position?.scale || 1,
                    opacity: character.position?.opacity || 1,
                    easing: 'ease-in-out'
                }
            };
            track.keyframes.push(keyframe);
        });
        
        track.keyframes.sort((a, b) => a.time - b.time);
        this.updateTimeline();
        this.updateStatus('Added curved movement path');
    }
    
    copyMovementKeyframe() {
        if (!this.selectedCharacter) {
            this.updateStatus('Please select a character first');
            return;
        }
        
        const character = this.selectedCharacter;
        const track = this.getActiveTracks()[character.trackIndex];
        if (!track) return;
        
        // Find keyframe at current time
        const currentKeyframe = track.keyframes.find(kf => 
            Math.abs(kf.time - this.playback.currentTime) < 0.1
        );
        
        if (currentKeyframe) {
            // Store in clipboard (simplified - could use actual clipboard API)
            this.movementClipboard = JSON.parse(JSON.stringify(currentKeyframe));
            this.updateStatus('Movement keyframe copied');
        } else {
            this.updateStatus('No keyframe found at current time');
        }
    }
    
    deleteMovementKeyframe() {
        if (!this.selectedCharacter) {
            this.updateStatus('Please select a character first');
            return;
        }
        
        const character = this.selectedCharacter;
        const track = this.getActiveTracks()[character.trackIndex];
        if (!track) return;
        
        // Find and remove keyframe at current time
        const keyframeIndex = track.keyframes.findIndex(kf => 
            Math.abs(kf.time - this.playback.currentTime) < 0.1
        );
        
        if (keyframeIndex !== -1) {
            track.keyframes.splice(keyframeIndex, 1);
            this.updateTimeline();
            this.updateStatus('Movement keyframe deleted');
        } else {
            this.updateStatus('No keyframe found at current time');
        }
    }
    
    updateMovementEasing(easingType) {
        if (!this.selectedCharacter) return;
        
        const character = this.selectedCharacter;
        const track = this.getActiveTracks()[character.trackIndex];
        if (!track) return;
        
        // Update easing for keyframe at current time
        const keyframe = track.keyframes.find(kf => 
            Math.abs(kf.time - this.playback.currentTime) < 0.1
        );
        
        if (keyframe && keyframe.properties) {
            keyframe.properties.easing = easingType;
            this.renderCanvasPreview();
            this.updateStatus(`Movement easing set to: ${easingType}`);
        }
    }
    
    updateMovementSpeed(speedMultiplier) {
        if (!this.selectedCharacter) return;
        
        const character = this.selectedCharacter;
        const track = this.getActiveTracks()[character.trackIndex];
        if (!track) return;
        
        // Update speed by adjusting time differences between keyframes
        const selectedTime = this.playback.currentTime;
        const keyframeIndex = track.keyframes.findIndex(kf => 
            Math.abs(kf.time - selectedTime) < 0.1
        );
        
        if (keyframeIndex !== -1 && keyframeIndex < track.keyframes.length - 1) {
            const currentKf = track.keyframes[keyframeIndex];
            const nextKf = track.keyframes[keyframeIndex + 1];
            const timeDiff = nextKf.time - currentKf.time;
            const newTimeDiff = timeDiff / speedMultiplier;
            
            nextKf.time = currentKf.time + newTimeDiff;
            
            // Update range display
            const rangeValue = document.querySelector('.range-value');
            if (rangeValue) rangeValue.textContent = speedMultiplier + 'x';
            
            this.updateTimeline();
            this.updateStatus(`Movement speed: ${speedMultiplier}x`);
        }
    }
    
    pasteMovementKeyframe() {
        if (!this.selectedCharacter || !this.movementClipboard) {
            this.updateStatus('No movement data to paste');
            return;
        }
        
        const character = this.selectedCharacter;
        const track = this.getActiveTracks()[character.trackIndex];
        if (!track) return;
        
        // Create new keyframe at current time with clipboard data
        const newKeyframe = JSON.parse(JSON.stringify(this.movementClipboard));
        newKeyframe.time = this.playback.currentTime;
        
        track.keyframes.push(newKeyframe);
        track.keyframes.sort((a, b) => a.time - b.time);
        this.updateTimeline();
        this.updateStatus('Movement keyframe pasted');
    }
    
    // Asset Management Methods
    removeAsset(assetType, assetId) {
        if (confirm(`REMOVE ASSET?`)) {
            this.assets[assetType].delete(assetId);
            this.updateAssetLists();
            this.updateStatus(`ASSET REMOVED: ${assetId.toUpperCase()}`);
        }
    }
    
    selectAsset(type, asset) {
        console.log(`Selected ${type}:`, asset);
        this.updateStatus(`SELECTED ${type.toUpperCase()}: ${asset.name.toUpperCase()}`);
    }
}

// Global editor instance
let editor;

// Global functions called by HTML - Algorithm Studio style
function newCutscene() {
    if (editor) editor.newCutscene();
}

function openCutscene() {
    if (editor) editor.openCutscene();
}

function saveCutscene() {
    if (editor) editor.saveCutscene();
}

function exportCutscene() {
    if (editor) editor.exportCutscene();
}

function saveCutsceneAs() {
    if (editor) editor.saveCutscene(true);
}

function undo() {
    if (editor) editor.undo();
}

function redo() {
    if (editor) editor.redo();
}

function deleteSelected() {
    if (editor) editor.deleteSelected();
}

function selectTool() {
    if (editor) editor.selectTool();
}

function moveKeyframe() {
    if (editor) editor.moveKeyframe();
}

function addDialogue() {
    if (editor) editor.addDialogue();
}

function addChoice() {
    if (editor) editor.addChoice();
}

function clearTimeline() {
    if (editor) editor.clearTimeline();
}

function resetView() {
    if (editor) editor.resetView();
}

function toggleGrid() {
    if (editor) editor.toggleGrid();
}

// Integration helper functions
async function loadCutsceneById(cutsceneId) {
    if (editor && projectState) {
        const cutsceneData = projectState.get(`cutscenes.${cutsceneId}`);
        if (cutsceneData) {
            editor.data = editor.normalizeLoadedCutscene(cutsceneData, cutsceneId);
            editor.normalizeCutsceneSchema();
            editor.currentBranch = 'main';
            editor.playback.currentTime = 0;
            editor.playback.selectedTrack = null;
            editor.playback.selectedKeyframe = null;
            editor.updateUI();
            editor.updateStatus(`LOADED: ${cutsceneData.name}`);
            
            // Broadcast load event
            if (eventBus) {
                eventBus.emit('cutscene:loaded', {
                    cutsceneId: cutsceneId,
                    cutscene: cutsceneData,
                    timestamp: Date.now()
                });
            }
        } else {
            try {
                await editor.loadCutsceneFile(`${editor.sanitizeCutsceneId(cutsceneId)}.json`);
            } catch {
                editor.updateStatus(`CUTSCENE NOT FOUND: ${cutsceneId}`);
            }
        }
    }
}

function refreshAssetLists() {
    if (!assetManager) return;
    
    // Refresh sprite dropdown
    const spriteDropdowns = document.querySelectorAll('select[data-type="sprite"]');
    spriteDropdowns.forEach(dropdown => {
        const currentValue = dropdown.value;
        dropdown.innerHTML = '<option value="">Select Sprite</option>';
        
        const spriteAssets = assetManager.getAssetsByType('image');
        spriteAssets.forEach(asset => {
            const option = document.createElement('option');
            option.value = asset.id;
            option.textContent = asset.name;
            dropdown.appendChild(option);
        });
        
        // Restore previous selection if it still exists
        if (currentValue && Array.from(dropdown.options).some(opt => opt.value === currentValue)) {
            dropdown.value = currentValue;
        }
    });
    
    // Refresh audio dropdown
    const audioDropdowns = document.querySelectorAll('select[data-type="audio"]');
    audioDropdowns.forEach(dropdown => {
        const currentValue = dropdown.value;
        dropdown.innerHTML = '<option value="">Select Audio</option>';
        
        const audioAssets = assetManager.getAssetsByType('audio');
        audioAssets.forEach(asset => {
            const option = document.createElement('option');
            option.value = asset.id;
            option.textContent = asset.name;
            dropdown.appendChild(option);
        });
        
        if (currentValue && Array.from(dropdown.options).some(opt => opt.value === currentValue)) {
            dropdown.value = currentValue;
        }
    });
    
    console.log('[InteractiveCutscene] Asset lists refreshed');
}

// Auto-save functionality
let autoSaveInterval;
function startAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    
    autoSaveInterval = setInterval(() => {
        if (editor && editor.data) {
            // Save to project state without showing status message
            if (projectState) {
                projectState.set(`cutscenes.${editor.data.id}`, editor.data, { silent: true });
            }
        }
    }, 30000); // Auto-save every 30 seconds
}

// Initialize auto-save when editor is ready
function initAutoSave() {
    startAutoSave();
    
    // Save on window unload
    window.addEventListener('beforeunload', () => {
        if (editor && editor.data && projectState) {
            projectState.set(`cutscenes.${editor.data.id}`, editor.data, { silent: true });
        }
    });
}

function zoomIn() {
    if (editor) editor.zoomIn();
}

function zoomOut() {
    if (editor) editor.zoomOut();
}

function testCutscene() {
    if (editor) editor.testCutscene();
}

function validateData() {
    if (editor) editor.validateData();
}

function showDocs() {
    if (editor) editor.showDocs();
}

function showAbout() {
    if (editor) editor.showAbout();
}

function togglePlayback() {
    if (editor) editor.togglePlayback();
}

function stopPlayback() {
    if (editor) editor.stop();
}

function addTrack(type) {
    if (!editor) return;
    
    const track = {
        id: `track_${Date.now()}`,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} Track`,
        type: type,
        visible: true,
        keyframes: []
    };
    
    editor.getActiveTracks().push(track);
    editor.updateUI();
    editor.updateStatus(`${type.toUpperCase()} TRACK ADDED`);
}

function addBranch() {
    if (!editor) return;
    
    const input = prompt('ENTER BRANCH NAME:');
    const branchId = input ? editor.sanitizeCutsceneId(input) : '';
    if (branchId && !editor.data.branches[branchId]) {
        editor.data.branches[branchId] = {
            duration: 10.0,
            tracks: []
        };
        editor.updateBranches();
        editor.updateStatus(`BRANCH ADDED: ${branchId.toUpperCase()}`);
    }
}

function addKeyframe() {
    if (editor) editor.addKeyframe();
}

// Asset Upload Functions
function addSprite() {
    document.getElementById('sprite-upload').click();
}

function addAudio() {
    document.getElementById('audio-upload').click();
}

function addCharacter() {
    document.getElementById('character-upload').click();
}

function handleSpriteUpload(event) {
    const files = Array.from(event.target.files);
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const id = generateAssetId(file.name);
                const sprite = {
                    id: id,
                    name: file.name.split('.')[0],
                    file: file.name,
                    data: e.target.result, // Base64 data URL
                    type: 'uploaded'
                };
                
                editor.assets.sprites.set(id, sprite);
                editor.updateAssetLists();
                editor.updateStatus(`SPRITE ADDED: ${sprite.name.toUpperCase()}`);
            };
            reader.readAsDataURL(file);
        }
    });
    event.target.value = ''; // Reset file input
}

function handleAudioUpload(event) {
    const files = Array.from(event.target.files);
    files.forEach(file => {
        if (file.type.startsWith('audio/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const id = generateAssetId(file.name);
                const audio = {
                    id: id,
                    name: file.name.split('.')[0],
                    file: file.name,
                    data: e.target.result, // Base64 data URL
                    type: 'uploaded'
                };
                
                editor.assets.audio.set(id, audio);
                editor.updateAssetLists();
                editor.updateStatus(`AUDIO ADDED: ${audio.name.toUpperCase()}`);
            };
            reader.readAsDataURL(file);
        }
    });
    event.target.value = ''; // Reset file input
}

function handleCharacterUpload(event) {
    const files = Array.from(event.target.files);
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const id = generateAssetId(file.name);
                const character = {
                    id: id,
                    name: file.name.split('.')[0],
                    portrait: file.name,
                    data: e.target.result, // Base64 data URL
                    type: 'uploaded'
                };
                
                editor.assets.characters.set(id, character);
                editor.updateAssetLists();
                editor.updateStatus(`CHARACTER ADDED: ${character.name.toUpperCase()}`);
            };
            reader.readAsDataURL(file);
        }
    });
    event.target.value = ''; // Reset file input
}

function generateAssetId(fileName) {
    const baseName = fileName.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${baseName}_${Date.now()}`;
}

async function importProjectAssets() {
    if (!editor) return;
    
    try {
        editor.updateStatus("IMPORTING PROJECT ASSETS...");

        const listDir = async (dir) => {
            const response = await fetch(`/api/ide/list?dir=${encodeURIComponent(dir)}`);
            if (!response.ok) return [];
            const entries = await response.json();
            return entries.filter(item => !item.isDirectory).map(item => item.name);
        };

        const spriteFiles = await listDir('sprite-art');
        const audioFiles = await listDir('muzikler');

        let importedCount = 0;
        spriteFiles
            .filter(name => /\.(png|jpe?g|gif|webp)$/i.test(name))
            .forEach(name => {
                const id = `project_sprite_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                if (!editor.assets.sprites.has(id)) {
                    editor.assets.sprites.set(id, {
                        id,
                        name: name.replace(/\.[^/.]+$/, ''),
                        file: name,
                        type: 'project'
                    });
                    importedCount++;
                }
            });

        audioFiles
            .filter(name => /\.(ogg|mp3|wav|m4a)$/i.test(name))
            .forEach(name => {
                const id = `project_audio_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                if (!editor.assets.audio.has(id)) {
                    editor.assets.audio.set(id, {
                        id,
                        name: name.replace(/\.[^/.]+$/, ''),
                        file: name,
                        type: 'project'
                    });
                    importedCount++;
                }
            });
        
        editor.updateAssetLists();
        editor.updateStatus(`PROJECT ASSETS IMPORTED: ${importedCount}`);
        
    } catch (error) {
        console.error("Error importing project assets:", error);
        editor.updateStatus("ERROR IMPORTING PROJECT ASSETS");
    }
}

function switchTab(tabIndex) {
    const tabs = document.querySelectorAll('.panel-tab');
    const panels = [
        document.getElementById('assets-panel'),
        document.getElementById('branches-panel')
    ];
    
    tabs.forEach((tab, index) => {
        tab.classList.toggle('active', index === tabIndex);
        panels[index].classList.toggle('hidden', index !== tabIndex);
    });
}

function updateZoom(value) {
    if (editor) {
        editor.playback.zoom = parseInt(value);
        document.getElementById('zoom-display').textContent = `${value}PX/S`;
        editor.updateTimeline();
        editor.updateStatus(`ZOOM: ${value}PX/S`);
    }
}

function toggleTimeline() {
    const timelineContent = document.getElementById('timeline-content');
    const toggleIcon = document.getElementById('timeline-toggle-icon');
    const previewArea = document.querySelector('.preview-area');
    
    if (timelineContent.classList.contains('collapsed')) {
        // Expand timeline
        timelineContent.classList.remove('collapsed');
        toggleIcon.className = 'fas fa-chevron-down';
        previewArea.classList.remove('timeline-collapsed');
        if (editor) editor.updateStatus('TIMELINE EXPANDED');
    } else {
        // Collapse timeline
        timelineContent.classList.add('collapsed');
        toggleIcon.className = 'fas fa-chevron-up';
        previewArea.classList.add('timeline-collapsed');
        if (editor) editor.updateStatus('TIMELINE COLLAPSED - MORE CANVAS SPACE');
    }
}

// Initialize when page loads
window.onload = () => {
    editor = new InteractiveCutsceneEditor();
    
    // Initialize integration features
    initAutoSave();
    refreshAssetLists();
    
    // Load cutscene from project state if available
    if (projectState) {
        const cutscenes = projectState.get('cutscenes', {});
        const cutsceneIds = Object.keys(cutscenes);
        if (cutsceneIds.length > 0) {
            // Load the most recent cutscene
            const latestCutsceneId = cutsceneIds[cutsceneIds.length - 1];
            loadCutsceneById(latestCutsceneId);
        }
    }
};

console.log("INTERACTIVE CUTSCENE STUDIO LOADED");
