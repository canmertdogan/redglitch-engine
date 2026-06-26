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
    connectToAlgorithmStudio(algorithmRuntime) {
        if (!algorithmRuntime) {
            if (window.AlgorithmRuntime && this.game) {
                algorithmRuntime = new window.AlgorithmRuntime(
                    { nodes: [], wires: [], variables: [] },
                    this.game,
                    { id: 'cutscene_engine', name: 'InteractiveCutsceneEngine' }
                );
            }
        }
        if (algorithmRuntime) {
            this.algorithmRuntime = algorithmRuntime;
            this.eventBus.addEventListener('cutscene:started', (e) => {
                if (this.algorithmRuntime) {
                    this.algorithmRuntime.execute('start', { cutsceneId: e.detail.cutsceneId });
                }
            });
            this.eventBus.addEventListener('branch:switched', (e) => {
                if (this.algorithmRuntime) {
                    this.algorithmRuntime.execute('branch_switch', { branchId: e.detail.branchId });
                }
            });
            this.eventBus.addEventListener('dialogue:choice_made', (e) => {
                if (this.algorithmRuntime) {
                    this.algorithmRuntime.execute('choice', { choice: e.detail });
                }
            });
            console.log("[InteractiveCutsceneEngine] Connected to Algorithm Studio");
        }
    }
    
    connectToCampaignEditor(campaignController) {
        if (!campaignController && this.game?.campaignSystem) {
            campaignController = this.game.campaignSystem;
        }
        if (campaignController) {
            this.campaignController = campaignController;
            this.eventBus.addEventListener('state:variable_changed', (e) => {
                if (this.campaignController?.setVariable) {
                    this.campaignController.setVariable(e.detail.name, e.detail.value);
                }
            });
            this.eventBus.addEventListener('cutscene:ended', (e) => {
                if (this.campaignController?.onCutsceneEnd) {
                    this.campaignController.onCutsceneEnd(e.detail.cutsceneId, this.getCurrentState());
                }
            });
            console.log("[InteractiveCutsceneEngine] Connected to Campaign Editor");
        }
    }
}

// Supporting component classes
class InteractiveCutsceneTimeline {
    constructor(engine) {
        this.engine = engine;
        this.tracks = [];
        this.actors = new Map();
        this.canvas = null;
        this.ctx = null;
        this.overlay = null;
    }
    
    async init(cutsceneData) {
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.id = 'cutscene-timeline-overlay';
            this.overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2000';
            document.body.appendChild(this.overlay);
        }
        this.overlay.innerHTML = '';
        this.tracks = [];
        this.actors.clear();
        if (cutsceneData.timeline?.tracks) {
            for (const track of cutsceneData.timeline.tracks) {
                this.tracks.push({
                    ...track,
                    currentKeyframe: 0,
                    activeActors: new Map()
                });
            }
        }
        if (cutsceneData.actors) {
            for (const actor of cutsceneData.actors) {
                this.actors.set(actor.id, actor);
            }
        }
    }
    
    update(currentTime) {
        for (const track of this.tracks) {
            if (!track.keyframes || track.keyframes.length === 0) continue;
            for (let i = 0; i < track.keyframes.length; i++) {
                const kf = track.keyframes[i];
                if (Math.abs(kf.time - currentTime) < 0.05) {
                    if (i > track.currentKeyframe || track.currentKeyframe !== i) {
                        this.executeKeyframe(kf);
                        track.currentKeyframe = i;
                    }
                }
                if (kf.time > currentTime) break;
            }
        }
    }
    
    executeKeyframe(keyframe) {
        if (!keyframe.data) return;
        const data = keyframe.data;
        switch (keyframe.type ?? data.type) {
            case 'actor_move': {
                const actorEl = this.overlay.querySelector(`[data-actor-id="${data.actorId}"]`);
                if (actorEl) {
                    actorEl.style.transition = `transform ${data.duration ?? 1}s ease-in-out`;
                    actorEl.style.transform = `translate(${data.x ?? 0}px, ${data.y ?? 0}px) scale(${data.scale ?? 1})`;
                }
                break;
            }
            case 'actor_show': {
                const actorDef = this.actors.get(data.actorId);
                if (actorDef && !this.overlay.querySelector(`[data-actor-id="${data.actorId}"]`)) {
                    const el = document.createElement('div');
                    el.dataset.actorId = data.actorId;
                    el.style.cssText = `position:absolute;${data.style ?? ''}`;
                    if (actorDef.image) el.innerHTML = `<img src="${actorDef.image}" style="width:${data.width ?? 100}px">`;
                    else el.textContent = actorDef.name ?? data.actorId;
                    el.style.left = `${data.x ?? 50}%`;
                    el.style.top = `${data.y ?? 50}%`;
                    this.overlay.appendChild(el);
                }
                break;
            }
            case 'actor_hide': {
                const el = this.overlay.querySelector(`[data-actor-id="${data.actorId}"]`);
                if (el) el.remove();
                break;
            }
            case 'camera_shake': {
                const intensity = data.intensity ?? 5;
                const duration = data.duration ?? 300;
                const game = this.engine.game;
                if (game?.camera?.shake) {
                    game.camera.shake(intensity, duration);
                } else if (game?.screenShake) {
                    game.screenShake(intensity, duration);
                } else {
                    const container = this.overlay.parentElement;
                    const orig = container.style.transform;
                    container.style.transition = `transform ${duration * 0.5}ms ease-out`;
                    container.style.transform = `translate(${(Math.random() - 0.5) * intensity}px, ${(Math.random() - 0.5) * intensity}px)`;
                    setTimeout(() => { container.style.transform = orig; }, duration);
                }
                break;
            }
            case 'audio': {
                const game = this.engine.game;
                if (game?.soundManager?.play) {
                    game.soundManager.play(data.soundId, { volume: data.volume ?? 1 });
                }
                break;
            }
            case 'wait': {
                break;
            }
            case 'particles': {
                const game = this.engine.game;
                if (game?.vfx?.emit) {
                    game.vfx.emit(data.effect, { x: data.x ?? 0, y: data.y ?? 0 });
                }
                break;
            }
        }
    }
    
    switchBranch(branchId, branchData) {
        this.tracks = [];
        if (branchData.tracks) {
            for (const track of branchData.tracks) {
                this.tracks.push({
                    ...track,
                    currentKeyframe: 0,
                    activeActors: new Map()
                });
            }
        }
        this.overlay.innerHTML = '';
    }
    
    cleanup() {
        if (this.overlay?.parentElement) {
            this.overlay.remove();
        }
        this.overlay = null;
        this.tracks = [];
        this.actors.clear();
    }
}

class InteractiveCutsceneDialogue {
    constructor(engine) {
        this.engine = engine;
        this.dialogueSystem = null;
        this.dialogueContainer = null;
        this.textTimer = null;
        this.charIndex = 0;
        this.currentText = '';
        this.displayedText = '';
        this.isAnimating = false;
    }
    
    async init(cutsceneData) {
        if (window.DialogueSystem) {
            this.dialogueSystem = this.engine.game.dialogueSystem || new DialogueSystem();
        }
        if (!this.dialogueContainer) {
            this.dialogueContainer = document.createElement('div');
            this.dialogueContainer.id = 'cutscene-dialogue';
            this.dialogueContainer.style.cssText = `
                position:absolute;bottom:60px;left:50%;transform:translateX(-50%);
                max-width:70%;min-width:300px;background:rgba(0,0,0,0.85);
                border:2px solid #ff4444;border-radius:10px;padding:16px 24px;
                display:none;z-index:2500;font-family:monospace;
            `;
            this.dialogueContainer.innerHTML = `
                <div id="cutscene-speaker" style="color:#ff4444;font-weight:bold;margin-bottom:6px"></div>
                <div id="cutscene-text" style="color:#eee;font-size:16px;line-height:1.5;min-height:48px"></div>
            `;
            document.body.appendChild(this.dialogueContainer);
        }
    }
    
    showDialogue(dialogueData) {
        if (this.dialogueSystem) {
            const dialogueQueue = [{
                speaker: dialogueData.speaker,
                text: dialogueData.text,
                choices: dialogueData.choices || []
            }];
            this.dialogueSystem.start(dialogueQueue, () => {
                this.engine.resumeTimeline();
            });
            return;
        }
        this.dialogueContainer.style.display = 'block';
        const speakerEl = document.getElementById('cutscene-speaker');
        const textEl = document.getElementById('cutscene-text');
        if (speakerEl) speakerEl.textContent = dialogueData.speaker ?? '';
        this.currentText = dialogueData.text ?? '';
        this.charIndex = 0;
        this.displayedText = '';
        this.isAnimating = true;
        this.animateText();
    }
    
    animateText() {
        if (!this.isAnimating) return;
        const textEl = document.getElementById('cutscene-text');
        if (!textEl) return;
        if (this.charIndex < this.currentText.length) {
            this.displayedText += this.currentText[this.charIndex++];
            textEl.textContent = this.displayedText;
            this.textTimer = setTimeout(() => this.animateText(), 25 + (this.currentText[this.charIndex - 1] === '.' ? 100 : 0));
        } else {
            this.isAnimating = false;
        }
    }
    
    finishTextAnimation() {
        if (this.isAnimating) {
            clearTimeout(this.textTimer);
            const textEl = document.getElementById('cutscene-text');
            if (textEl) textEl.textContent = this.currentText;
            this.isAnimating = false;
            this.charIndex = this.currentText.length;
        }
    }
    
    loadDialogue(dialogueId) {
        const cutsceneData = this.engine.currentData;
        if (!cutsceneData?.dialogues) {
            console.warn(`[InteractiveCutsceneDialogue] No dialogue definitions in cutscene`);
            return;
        }
        const dialogueDef = cutsceneData.dialogues[dialogueId];
        if (!dialogueDef) {
            console.warn(`[InteractiveCutsceneDialogue] Dialogue "${dialogueId}" not found in definitions`);
            return;
        }
        this.showDialogue({
            speaker: dialogueDef.speaker,
            text: dialogueDef.text,
            choices: dialogueDef.choices || []
        });
    }
    
    update(currentTime) {
        if (!this.isAnimating && this.dialogueContainer?.style.display === 'block') {
            const textEl = document.getElementById('cutscene-text');
            if (textEl) {
                const pulse = 0.9 + Math.sin(currentTime * 4) * 0.1;
                textEl.style.opacity = pulse;
            }
        }
    }
    
    cleanup() {
        if (this.dialogueSystem?.active) this.dialogueSystem.hide();
        if (this.dialogueContainer) {
            this.dialogueContainer.style.display = 'none';
            this.dialogueContainer.remove();
        }
        this.dialogueContainer = null;
        clearTimeout(this.textTimer);
        this.isAnimating = false;
    }
}

class InteractiveCutsceneChoices {
    constructor(engine) {
        this.engine = engine;
        this.choicesUI = null;
        this.choiceTimer = null;
        this.timeLimit = 0;
        this.onTimeout = null;
        this.choiceButtons = [];
        this.selectedIndex = -1;
    }
    
    async init(cutsceneData) {
        this.createChoicesUI();
    }
    
    createChoicesUI() {
        this.choicesUI = document.createElement('div');
        this.choicesUI.id = 'cutscene-choices';
        this.choicesUI.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            display:none;z-index:3000;
            background:rgba(0,0,0,0.6);
            justify-content:center;align-items:center;
        `;
        this.choicesUI.innerHTML = `
            <div id="cutscene-choices-panel" style="
                background:rgba(0,0,0,0.92);border:2px solid #ff4444;
                border-radius:12px;padding:28px;min-width:320px;max-width:480px;
                box-shadow:0 0 40px rgba(255,68,68,0.2);
            ">
                <div id="cutscene-choices-prompt" style="
                    color:#ff4444;font-size:18px;font-weight:bold;
                    margin-bottom:20px;text-align:center;
                "></div>
                <div id="cutscene-choices-timer" style="
                    height:4px;background:#333;border-radius:2px;
                    margin-bottom:16px;overflow:hidden;
                "><div id="cutscene-choices-timer-bar" style="
                    height:100%;width:100%;background:#ff4444;
                    transition:width 0.1s linear;border-radius:2px;
                "></div></div>
                <div id="cutscene-choices-list"></div>
            </div>
        `;
        document.body.appendChild(this.choicesUI);
    }
    
    showChoices(choiceData) {
        this.selectedIndex = -1;
        this.choiceButtons = [];
        const promptEl = document.getElementById('cutscene-choices-prompt');
        const listEl = document.getElementById('cutscene-choices-list');
        if (!promptEl || !listEl) return;
        promptEl.textContent = choiceData.prompt || 'Choose:';
        listEl.innerHTML = '';
        choiceData.choices.forEach((choice, index) => {
            const btn = document.createElement('button');
            btn.textContent = choice.text;
            btn.dataset.index = index;
            btn.style.cssText = `
                display:block;width:100%;margin:8px 0;padding:12px 16px;
                background:rgba(44,62,80,0.8);color:#eee;border:1px solid #555;
                border-radius:6px;cursor:pointer;font-size:15px;font-family:monospace;
                transition:background 0.2s,border-color 0.2s,transform 0.15s;
                text-align:left;
            `;
            btn.addEventListener('mouseenter', () => {
                if (this.selectedIndex === -1) {
                    btn.style.background = 'rgba(255,68,68,0.2)';
                    btn.style.borderColor = '#ff4444';
                    btn.style.transform = 'translateX(6px)';
                }
            });
            btn.addEventListener('mouseleave', () => {
                if (this.selectedIndex === -1) {
                    btn.style.background = 'rgba(44,62,80,0.8)';
                    btn.style.borderColor = '#555';
                    btn.style.transform = 'none';
                }
            });
            btn.addEventListener('click', () => this.selectChoice(choice, index));
            listEl.appendChild(btn);
            this.choiceButtons.push(btn);
        });
        this.choicesUI.style.display = 'flex';
        if (choiceData.timeLimit && choiceData.timeLimit > 0) {
            this.timeLimit = choiceData.timeLimit;
            this.onTimeout = choiceData.onTimeout ?? null;
            this.startChoiceTimer();
        }
    }
    
    selectChoice(choice, index = -1) {
        if (this.selectedIndex !== -1) return;
        this.selectedIndex = index;
        clearTimeout(this.choiceTimer);
        const timerBar = document.getElementById('cutscene-choices-timer-bar');
        if (timerBar) timerBar.style.width = '0%';
        this.choiceButtons.forEach((btn, i) => {
            btn.style.pointerEvents = 'none';
            if (i === index) {
                btn.style.background = 'rgba(255,68,68,0.3)';
                btn.style.borderColor = '#ff4444';
            } else {
                btn.style.opacity = '0.5';
            }
        });
        setTimeout(() => {
            this.choicesUI.style.display = 'none';
            this.engine.eventBus.dispatchEvent(new CustomEvent('dialogue:choice_made', {
                detail: choice
            }));
        }, 200);
    }
    
    startChoiceTimer() {
        const timerBar = document.getElementById('cutscene-choices-timer-bar');
        if (!timerBar) return;
        timerBar.style.width = '100%';
        const startTime = performance.now();
        const tick = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            const remaining = Math.max(0, this.timeLimit - elapsed);
            timerBar.style.width = `${(remaining / this.timeLimit) * 100}%`;
            if (remaining > 0 && this.selectedIndex === -1) {
                this.choiceTimer = requestAnimationFrame(tick);
            } else if (remaining <= 0 && this.selectedIndex === -1) {
                if (this.onTimeout) {
                    this.selectChoice({ action: this.onTimeout, text: '(timed out)' }, -1);
                } else {
                    this.selectChoice({ action: 'resume_timeline', text: '(timed out)' }, -1);
                }
            }
        };
        this.choiceTimer = requestAnimationFrame(tick);
    }
    
    update(currentTime) {
        if (this.choicesUI?.style.display === 'flex') {
            this.choiceButtons.forEach((btn, i) => {
                const bounce = 1 + Math.sin(currentTime * 3 + i * 0.8) * 0.02;
                btn.style.transform = this.selectedIndex === -1 ? `scale(${bounce})` : btn.style.transform;
            });
        }
    }
    
    cleanup() {
        if (this.choiceTimer) {
            cancelAnimationFrame(this.choiceTimer);
            this.choiceTimer = null;
        }
        if (this.choicesUI) {
            this.choicesUI.remove();
            this.choicesUI = null;
        }
        this.choiceButtons = [];
    }
}

class InteractiveCutsceneState {
    constructor(engine) {
        this.engine = engine;
        this.conditionHandlers = {
            'eq': (a, b) => a == b,
            'neq': (a, b) => a != b,
            'gt': (a, b) => Number(a) > Number(b),
            'gte': (a, b) => Number(a) >= Number(b),
            'lt': (a, b) => Number(a) < Number(b),
            'lte': (a, b) => Number(a) <= Number(b),
            'has_flag': (flag) => !!this.getVariable(flag),
            'not_flag': (flag) => !this.getVariable(flag),
            'in_range': (val, min, max) => Number(val) >= Number(min) && Number(val) <= Number(max)
        };
    }
    
    async init(cutsceneData) {
        this.conditionHandlers = {
            'eq': (a, b) => a == b,
            'neq': (a, b) => a != b,
            'gt': (a, b) => Number(a) > Number(b),
            'gte': (a, b) => Number(a) >= Number(b),
            'lt': (a, b) => Number(a) < Number(b),
            'lte': (a, b) => Number(a) <= Number(b),
            'has_flag': (flag) => !!this.getVariable(flag),
            'not_flag': (flag) => !this.getVariable(flag),
            'in_range': (val, min, max) => Number(val) >= Number(min) && Number(val) <= Number(max)
        };
    }
    
    setVariable(name, value) {
        const oldValue = this.engine.variables.get(name);
        this.engine.variables.set(name, value);
        this.engine.eventBus.dispatchEvent(new CustomEvent('state:variable_changed', {
            detail: { name, value, oldValue }
        }));
    }
    
    getVariable(name) {
        return this.engine.variables.get(name);
    }
    
    checkCondition(condition) {
        if (!condition) return true;
        if (typeof condition === 'boolean') return condition;
        if (typeof condition === 'function') return condition(this);
        
        if (typeof condition === 'object') {
            const op = condition.operator || condition.type || 'eq';
            const handler = this.conditionHandlers[op];
            if (!handler) {
                console.warn(`[InteractiveCutsceneState] Unknown condition operator: "${op}"`);
                return true;
            }
            const a = condition.a !== undefined ? condition.a : condition.lhs;
            const b = condition.b !== undefined ? condition.b : condition.rhs;
            const value = condition.value;
            const min = condition.min;
            const max = condition.max;
            if (op === 'has_flag' || op === 'not_flag') {
                return handler(a || value);
            }
            if (op === 'in_range') {
                return handler(a || value, condition.min, condition.max);
            }
            const resolvedA = typeof a === 'string' && a.startsWith('$') ? this.getVariable(a.slice(1)) : a;
            const resolvedB = typeof b === 'string' && b.startsWith('$') ? this.getVariable(b.slice(1)) : b;
            return handler(resolvedA, resolvedB);
        }
        return true;
    }
}

console.log("InteractiveCutsceneEngine loaded");