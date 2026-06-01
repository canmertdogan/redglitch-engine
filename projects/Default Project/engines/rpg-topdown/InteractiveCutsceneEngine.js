// InteractiveCutsceneEngine.js - Unified Interactive Cutscene System for RedGlitch
// Combines timeline-based animation with interactive dialogue and player choices

window.InteractiveCutsceneEngine = class InteractiveCutsceneEngine {
    constructor(game) {
        this.game = game;
        this.active = false;
        this.currentData = null;
        this.timeline = {
            currentTime: 0,
            duration: 0,
            isPlaying: false,
            isPaused: false,
            pauseReason: null,
            playbackSpeed: 1.0
        };
        
        // Event system for communication between components
        this.eventBus = new EventTarget();
        
        // Component systems
        this.timelineRenderer = new InteractiveCutsceneTimeline(this);
        this.dialogueIntegrator = new InteractiveCutsceneDialogue(this);
        this.choiceHandler = new InteractiveCutsceneChoices(this);
        this.stateManager = new InteractiveCutsceneState(this);
        
        // Tracking systems
        this.branches = new Map(); // Branch data by ID
        this.currentBranch = 'main';
        this.history = []; // Choice history for rollback
        this.variables = new Map(); // Scene-local variables
        
        this.init();
    }
    
    init() {
        console.log("Interactive Cutscene Engine initialized");
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Listen for timeline events
        this.eventBus.addEventListener('timeline:pause', (e) => {
            this.pauseTimeline(e.detail.reason, e.detail.data);
        });
        
        this.eventBus.addEventListener('timeline:resume', () => {
            this.resumeTimeline();
        });
        
        // Listen for dialogue events
        this.eventBus.addEventListener('dialogue:choice_made', (e) => {
            this.handleChoiceResult(e.detail);
        });
        
        // Listen for state change events
        this.eventBus.addEventListener('state:variable_changed', (e) => {
            this.handleVariableChange(e.detail);
        });
    }
    
    // Main playback methods
    async loadCutscene(cutsceneData) {
        console.log("Loading interactive cutscene:", cutsceneData.id);
        
        this.currentData = cutsceneData;
        this.timeline.duration = cutsceneData.timeline.duration;
        this.timeline.currentTime = 0;
        
        // Initialize branches
        this.branches.clear();
        this.branches.set('main', cutsceneData.timeline);
        
        if (cutsceneData.branches) {
            Object.entries(cutsceneData.branches).forEach(([branchId, branchData]) => {
                this.branches.set(branchId, branchData);
            });
        }
        
        // Initialize variables
        this.variables.clear();
        if (cutsceneData.variables) {
            cutsceneData.variables.forEach(varDef => {
                this.variables.set(varDef.name, varDef.default);
            });
        }
        
        // Initialize components
        await this.timelineRenderer.init(cutsceneData);
        await this.dialogueIntegrator.init(cutsceneData);
        await this.choiceHandler.init(cutsceneData);
        await this.stateManager.init(cutsceneData);
        
        this.active = true;
    }
    
    play() {
        if (!this.active || !this.currentData) return;
        
        console.log("Starting interactive cutscene playback");
        this.timeline.isPlaying = true;
        this.timeline.isPaused = false;
        
        this.eventBus.dispatchEvent(new CustomEvent('cutscene:started', {
            detail: { cutsceneId: this.currentData.id }
        }));
        
        this.gameLoop();
    }
    
    pause() {
        this.timeline.isPlaying = false;
        this.timeline.isPaused = true;
    }
    
    stop() {
        this.timeline.isPlaying = false;
        this.timeline.isPaused = false;
        this.active = false;
        
        // Cleanup components
        this.timelineRenderer.cleanup();
        this.dialogueIntegrator.cleanup();
        this.choiceHandler.cleanup();
        
        this.eventBus.dispatchEvent(new CustomEvent('cutscene:ended', {
            detail: { cutsceneId: this.currentData?.id }
        }));
    }
    
    // Core game loop
    gameLoop() {
        if (!this.timeline.isPlaying || this.timeline.isPaused) return;
        
        const deltaTime = 1/60; // 60 FPS target
        this.timeline.currentTime += deltaTime * this.timeline.playbackSpeed;
        
        // Check if we've reached the end
        if (this.timeline.currentTime >= this.timeline.duration) {
            this.stop();
            return;
        }
        
        // Update all components
        this.timelineRenderer.update(this.timeline.currentTime);
        this.dialogueIntegrator.update(this.timeline.currentTime);
        this.choiceHandler.update(this.timeline.currentTime);
        
        // Check for interaction points
        this.checkInteractionPoints();
        
        requestAnimationFrame(() => this.gameLoop());
    }
    
    checkInteractionPoints() {
        const currentTimeline = this.branches.get(this.currentBranch);
        if (!currentTimeline || !currentTimeline.tracks) return;
        
        // Find interaction tracks
        const interactionTracks = currentTimeline.tracks.filter(track => track.type === 'interaction');
        
        interactionTracks.forEach(track => {
            track.keyframes.forEach(keyframe => {
                if (Math.abs(keyframe.time - this.timeline.currentTime) < 0.1) {
                    this.handleInteractionPoint(keyframe);
                }
            });
        });
    }
    
    handleInteractionPoint(keyframe) {
        console.log("Handling interaction point:", keyframe);
        
        switch (keyframe.data.type) {
            case 'dialogue':
                this.pauseTimeline('dialogue', keyframe.data);
                this.dialogueIntegrator.showDialogue(keyframe.data);
                break;
            
            case 'choice':
                this.pauseTimeline('choice', keyframe.data);
                this.choiceHandler.showChoices(keyframe.data);
                break;
            
            case 'variable_set':
                this.stateManager.setVariable(keyframe.data.variable, keyframe.data.value);
                break;
            
            case 'branch':
                this.switchBranch(keyframe.data.target);
                break;
        }
    }
    
    pauseTimeline(reason, data) {
        this.timeline.isPaused = true;
        this.timeline.pauseReason = reason;
        
        this.eventBus.dispatchEvent(new CustomEvent('timeline:paused', {
            detail: { reason, data }
        }));
    }
    
    resumeTimeline() {
        this.timeline.isPaused = false;
        this.timeline.pauseReason = null;
        
        this.eventBus.dispatchEvent(new CustomEvent('timeline:resumed'));
        
        // Resume the game loop
        this.gameLoop();
    }
    
    switchBranch(branchId) {
        if (!this.branches.has(branchId)) {
            console.warn("Branch not found:", branchId);
            return;
        }
        
        console.log("Switching to branch:", branchId);
        this.currentBranch = branchId;
        
        // Reset timeline for new branch
        const branchData = this.branches.get(branchId);
        this.timeline.duration = branchData.duration;
        this.timeline.currentTime = 0;
        
        // Update components for new branch
        this.timelineRenderer.switchBranch(branchId, branchData);
        
        this.eventBus.dispatchEvent(new CustomEvent('branch:switched', {
            detail: { branchId, branchData }
        }));
    }
    
    handleChoiceResult(choiceResult) {
        // Record choice in history
        this.history.push({
            time: this.timeline.currentTime,
            branch: this.currentBranch,
            choice: choiceResult
        });
        
        // Process choice action
        switch (choiceResult.action) {
            case 'branch_timeline':
                this.switchBranch(choiceResult.target);
                break;
            
            case 'dialogue_continue':
                this.dialogueIntegrator.loadDialogue(choiceResult.target);
                break;
            
            case 'set_variable':
                this.stateManager.setVariable(choiceResult.variable, choiceResult.value);
                break;
            
            case 'resume_timeline':
                this.resumeTimeline();
                break;
        }
    }
    
    handleVariableChange(variableData) {
        this.variables.set(variableData.name, variableData.value);
        
        // Notify campaign system if connected
        if (this.game.campaignSystem) {
            this.game.campaignSystem.setVariable(variableData.name, variableData.value);
        }
    }
    
    // API methods for external integration
    getVariable(name) {
        return this.variables.get(name);
    }
    
    setVariable(name, value) {
        this.stateManager.setVariable(name, value);
    }
    
    getCurrentState() {
        return {
            cutsceneId: this.currentData?.id,
            currentTime: this.timeline.currentTime,
            currentBranch: this.currentBranch,
            variables: Object.fromEntries(this.variables),
            history: [...this.history]
        };
    }
    
    // Integration methods
    connectToAlgorithmStudio() {
        // TODO: Phase 6 - Algorithm Studio integration
        console.log("Algorithm Studio integration placeholder");
    }
    
    connectToCampaignEditor() {
        // TODO: Phase 7 - Campaign Editor integration
        console.log("Campaign Editor integration placeholder");
    }
}

// Supporting component classes
class InteractiveCutsceneTimeline {
    constructor(engine) {
        this.engine = engine;
        this.tracks = [];
        this.actors = new Map();
    }
    
    async init(cutsceneData) {
        console.log("Initializing timeline renderer");
        // TODO: Initialize timeline rendering system
    }
    
    update(currentTime) {
        // TODO: Update timeline animations, audio, etc.
    }
    
    switchBranch(branchId, branchData) {
        console.log("Timeline switching to branch:", branchId);
        // TODO: Switch timeline tracks to new branch
    }
    
    cleanup() {
        console.log("Timeline cleanup");
    }
}

class InteractiveCutsceneDialogue {
    constructor(engine) {
        this.engine = engine;
        this.dialogueSystem = null;
    }
    
    async init(cutsceneData) {
        console.log("Initializing dialogue integrator");
        // Connect to existing dialogue system
        if (window.DialogueSystem) {
            this.dialogueSystem = this.engine.game.dialogueSystem || new DialogueSystem();
        }
    }
    
    showDialogue(dialogueData) {
        console.log("Showing dialogue:", dialogueData);
        
        if (this.dialogueSystem) {
            // Convert interaction dialogue format to DialogueSystem format
            const dialogueQueue = [{
                speaker: dialogueData.speaker,
                text: dialogueData.text,
                choices: dialogueData.choices || []
            }];
            
            this.dialogueSystem.start(dialogueQueue, () => {
                this.engine.resumeTimeline();
            });
        }
    }
    
    loadDialogue(dialogueId) {
        console.log("Loading dialogue:", dialogueId);
        // TODO: Load dialogue from dialogue definitions
    }
    
    update(currentTime) {
        // TODO: Update dialogue animations, text effects
    }
    
    cleanup() {
        if (this.dialogueSystem && this.dialogueSystem.active) {
            this.dialogueSystem.hide();
        }
    }
}

class InteractiveCutsceneChoices {
    constructor(engine) {
        this.engine = engine;
        this.choicesUI = null;
    }
    
    async init(cutsceneData) {
        console.log("Initializing choice handler");
        this.createChoicesUI();
    }
    
    createChoicesUI() {
        // Create choice UI overlay
        this.choicesUI = document.createElement('div');
        this.choicesUI.id = 'cutscene-choices';
        this.choicesUI.style.cssText = `
            position: absolute; top: 50%; left: 50%; 
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #f1c40f;
            border-radius: 8px;
            padding: 20px;
            display: none;
            z-index: 3000;
        `;
        document.body.appendChild(this.choicesUI);
    }
    
    showChoices(choiceData) {
        console.log("Showing choices:", choiceData);
        
        this.choicesUI.innerHTML = `
            <h3 style="color: #f1c40f; margin-top: 0;">${choiceData.prompt || 'Choose:'}</h3>
        `;
        
        choiceData.choices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.textContent = choice.text;
            button.style.cssText = `
                display: block; width: 100%; margin: 10px 0;
                padding: 10px; background: #2c3e50; color: white;
                border: 1px solid #f1c40f; cursor: pointer;
            `;
            
            button.addEventListener('click', () => {
                this.selectChoice(choice);
            });
            
            this.choicesUI.appendChild(button);
        });
        
        this.choicesUI.style.display = 'block';
    }
    
    selectChoice(choice) {
        this.choicesUI.style.display = 'none';
        
        this.engine.eventBus.dispatchEvent(new CustomEvent('dialogue:choice_made', {
            detail: choice
        }));
    }
    
    update(currentTime) {
        // TODO: Update choice animations, timers
    }
    
    cleanup() {
        if (this.choicesUI) {
            this.choicesUI.style.display = 'none';
        }
    }
}

class InteractiveCutsceneState {
    constructor(engine) {
        this.engine = engine;
    }
    
    async init(cutsceneData) {
        console.log("Initializing state manager");
    }
    
    setVariable(name, value) {
        const oldValue = this.engine.variables.get(name);
        this.engine.variables.set(name, value);
        
        console.log(`Variable changed: ${name} = ${value} (was: ${oldValue})`);
        
        this.engine.eventBus.dispatchEvent(new CustomEvent('state:variable_changed', {
            detail: { name, value, oldValue }
        }));
    }
    
    getVariable(name) {
        return this.engine.variables.get(name);
    }
    
    checkCondition(condition) {
        // TODO: Implement condition checking system
        return true;
    }
}

console.log("InteractiveCutsceneEngine loaded");