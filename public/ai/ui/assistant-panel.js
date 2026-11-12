/**
 * KAI AI Assistant - UI Controller
 * Manages the Retro-Futuristic Terminal Interface
 */

class KaiChatUIController {
    constructor() {
        this.assistant = null;
        this.isInitialized = false;
        this.currentTutorial = null;
        this.tutorialStep = 0;
        
        // Avatar States & Boredom Timer
        this.avatarState = 'idle';
        this.boredTimer = null;
        this.BOREDOM_TIMEOUT = 12000; // 12 seconds
        
        // AI Loading progress tracking
        this.loadingInProgress = false;
        this.loadingShown = false;
        
        // Sound system (Retro Synth/Bleeps)
        this.sounds = {
            messageReceived: new Audio('/ai/sounds/msg.mp3'),
            messageSent: new Audio('/ai/sounds/msg.mp3'),
            online: new Audio('/ai/sounds/online.mp3'),
            nudge: new Audio('/ai/sounds/nudge.mp3'),
            error: new Audio('/ai/sounds/nudge.mp3'),
            typing: new Audio('/ai/sounds/msg.mp3')
        };
        
        Object.values(this.sounds).forEach(sound => {
            sound.volume = 0.4;
            sound.addEventListener('error', () => console.log('Kai: Audio asset missing (non-critical)'));
        });
        
        this.soundsEnabled = localStorage.getItem('kai_sounds_enabled') !== 'false';

        // Agentic Planner & Workspace State
        this.currentWorkspace = 'chat';
        this.previousWorkspace = 'chat';
        this.activePlannerRole = 'architect';
        this.activePlan = null;
        this.isExecutingPlan = false;
        this.diffHistory = [];
        this.activeDiffs = [];
        this.isMaximized = false;
        this.roles = {
            architect: {
                id: 'architect',
                name: 'Lead Architect',
                icon: '🏛️',
                desc: 'System architecture, module orchestration & game loop decomposition.',
                tools: ['project.getInfo', 'project.updateManifesto', 'fs.list', 'fs.search', 'workflow.run']
            },
            gameplay: {
                id: 'gameplay',
                name: 'Gameplay Engineer',
                icon: '⚡',
                desc: 'Combat formulas, player physics, items, abilities & algorithm graphs.',
                tools: ['data.list', 'data.update', 'fs.read', 'fs.write', 'fs.edit_file', 'saveScript']
            },
            world: {
                id: 'world',
                name: 'World Builder',
                icon: '🗺️',
                desc: '2D/3D level environments, tilemaps, prefabs, terrain & lighting.',
                tools: ['iso.spawn_prefab', 'navigateTo', 'fs.read', 'fs.write', 'asset.generate']
            },
            narrative: {
                id: 'narrative',
                name: 'Narrative Designer',
                icon: '📜',
                desc: 'NPCs, branching dialogues, questlines, cutscenes & lore items.',
                tools: ['data.list', 'data.update', 'navigateTo', 'fs.read', 'fs.write']
            },
            qa: {
                id: 'qa',
                name: 'QA Sentinel',
                icon: '🛡️',
                desc: 'Data schema audits, regression testing, physics checks & stability.',
                tools: ['fs.read', 'fs.search', 'data.list', 'git.status', 'git.stage', 'git.commit']
            }
        };

        // Tracked timers, observers and listeners for cleanup
        this._hitZoneInterval = null;
        this._hitZoneRaf = null;
        this._hitZoneObserver = null;
        this._hitZoneResizeObserver = null;
        this._lastHitZoneSig = null;
        this._mouseMoveRaf = null;
        this._sessionClockInterval = null;
        this._listeners = [];      // EventBus listeners
        this._windowListeners = []; // window event listeners (keydown)
        this._documentListeners = []; // document event listeners
    }
    
    showLoadingProgress() {
        const loading = document.getElementById('xp-ai-loading');
        if (loading && !this.loadingShown) {
            loading.style.display = 'flex';
            this.loadingShown = true;
            this.loadingInProgress = true;
        }
    }
    
    hideLoadingProgress() {
        const loading = document.getElementById('xp-ai-loading');
        if (loading) {
            setTimeout(() => {
                loading.style.display = 'none';
                this.loadingShown = false;
                this.loadingInProgress = false;
                
                // Restore focus to input
                const input = document.getElementById('ai-chat-input');
                if (input) {
                    input.focus();
                }
            }, 300); // Reduced from 800ms to 300ms
        }
    }
    
    updateLoadingProgress(data) {
        const { percent, status } = data;
        
        if (!this.loadingShown) this.showLoadingProgress();
        this.setAvatarState('working');
        
        const fill = document.getElementById('xp-progress-fill');
        const percentText = document.getElementById('xp-progress-percent');
        const statusText = document.getElementById('xp-loading-status');
        const detailsText = document.getElementById('xp-loading-details');
        
        if (fill) fill.style.width = `${percent}%`;
        if (percentText) percentText.textContent = `${percent}%`;
        
        if (statusText) {
            statusText.textContent = status.toUpperCase();
        }
        
        if (detailsText) {
            detailsText.textContent = `>> ATTACHING NEURAL_SYNAPSES... [${percent}%]`;
        }
        
        if (percent >= 100 || status === 'READY' || status === 'ready') {
            this.hideLoadingProgress();
            
            // Show welcome message after boot
            setTimeout(() => {
                this.setAvatarState('idle');
                this.showSpeechBubble(
                    this.assistant.personality ? 
                    this.assistant.personality.getRandomGreeting() : 
                    ">> SYSTEM ONLINE. READY."
                );
            }, 1000);
        }
    }
    
    playSound(soundName) {
        if (!this.soundsEnabled) return;
        const sound = this.sounds[soundName];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(() => {});
        }
    }
    
    toggleSounds(enabled) {
        this.soundsEnabled = enabled;
        localStorage.setItem('kai_sounds_enabled', enabled);
    }

    setAvatarState(state) {
        const clippy = document.getElementById('ai-clippy');
        if (!clippy) return;

        this.avatarState = state;
        clippy.className = `state-${state}`;
        
        // Map to status bar if needed
        const statusText = document.getElementById('xp-status-text');
        if (statusText) {
            if (state === 'working') statusText.textContent = 'PROCESSING...';
            else if (state === 'error') statusText.textContent = 'SYSTEM_ERROR';
            else statusText.textContent = 'ONLINE';
        }

        if (state === 'idle') {
            this.resetBoredomTimer();
        } else {
            this.clearBoredomTimer();
        }
    }

    resetBoredomTimer() {
        this.clearBoredomTimer();
        this.boredTimer = setTimeout(() => {
            this.setAvatarState('bored');
        }, this.BOREDOM_TIMEOUT);
    }

    clearBoredomTimer() {
        if (this.boredTimer) {
            clearTimeout(this.boredTimer);
            this.boredTimer = null;
        }
    }

    async initialize() {
        if (this.isInitialized) return;
        console.log('Kai: Initializing System...');

        try {
            // Bind to window early for hit detection bridge
            window.AIChatUI = this;

            this.assistant = new IRABAssistantSimple();
            
            // --- Hook into Native Cortex only if native provider is explicitly selected ---
            const activeProvider = window.AISettings?.settings?.provider || 'openrouter';
            const irab = window.irab || (window.parent && window.parent.irab);
            if (irab && activeProvider === 'native') {
                console.log('Kai: Connected to Native Cortex Bridge.');
                
                // Hook Progress
                irab.onLoadProgress = (data) => {
                    this.updateLoadingProgress(data);
                    this.addBootLog(data.status);
                    if (data.percent === 100 || data.status === 'READY') {
                        this.playSound('online');
                        this.addBootLog("KERNEL READY. STARTING SESSION...");
                    }
                };

                // Initial Status Check
                if (irab.isConnected) {
                    // Check if it's already loading
                    fetch('/api/ai/status').then(r => r.json()).then(data => {
                        if (data.status === 'LOADING') {
                            this.showLoadingProgress();
                            this.updateLoadingProgress({ percent: data.progress, status: 'RESUMING BOOT...' });
                        }
                    });
                }
            }
            
            this.setupEventListeners();
            
            // Hook into EventBus for Debug tab & Error Watcher
            const eventBus = window.RedglitchEventBus || (window.parent && window.parent.RedglitchEventBus);
            if (eventBus) {
                const onToggleChat = () => this.toggleChat();
                this._listeners.push({ event: 'ai:toggle_chat', handler: onToggleChat });
                eventBus.on('ai:toggle_chat', onToggleChat);
                
                // Live Debug Logs
                const onDebugLog = (eventData) => {
                    const stream = document.getElementById('debug-stream');
                    if (stream) {
                        const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
                        const line = document.createElement('div');
                        const event = eventData.type || 'unknown';
                        const data = eventData.data || {};
                        const timeSpan = document.createElement('span');
                        timeSpan.textContent = `[${time}] `;
                        const eventSpan = document.createElement('span');
                        eventSpan.style.color = '#ffd700';
                        eventSpan.textContent = event;
                        const separator = document.createTextNode(': ');
                        const dataText = document.createTextNode(JSON.stringify(data).substring(0, 100) + '...');
                        line.appendChild(timeSpan);
                        line.appendChild(eventSpan);
                        line.appendChild(separator);
                        line.appendChild(dataText);
                        stream.appendChild(line);
                        stream.scrollTop = stream.scrollHeight;
                        if (stream.children.length > 50) stream.removeChild(stream.firstChild);
                    }
                };
                this._listeners.push({ event: '*', handler: onDebugLog });
                eventBus.on('*', onDebugLog);

                // PROACTIVE ERROR WATCHER
                const onSystemError = (event) => {
                    if (!isAIModeOn(getStoredKaiMode())) return;
                    const error = event.data;
                    console.log('Kai: Proactive Help triggered for error:', error.message);
                    
                    this.setAvatarState('error');
                    this.playSound('error');

                    const shortMsg = error.message.length > 60 ? error.message.substring(0, 60) + '...' : error.message;
                    
                    this.showSpeechBubble(
                        `GRRR... I detect a glitch! "${shortMsg}". Want me to analyze the stack and fix it?`,
                        [
                            { 
                                label: 'ANALYZE & FIX', 
                                callback: () => {
                                    this.openChat();
                                    this.analyzeAndFixError(error);
                                }
                            },
                            { 
                                label: 'DISMISS', 
                                secondary: true, 
                                callback: () => {
                                    this.dismiss();
                                    setTimeout(() => this.setAvatarState('idle'), 2000);
                                }
                            }
                        ]
                    );
                };
                this._listeners.push({ event: 'system:error', handler: onSystemError });
                eventBus.on('system:error', onSystemError);

                // PROACTIVE PERFORMANCE SENTINEL
                this.lastMetricWarning = 0;
                const onSystemMetrics = (event) => {
                    if (!isAIModeOn(getStoredKaiMode())) return;
                    const { fps, entities, memory } = event.data;
                    const now = Date.now();
                    
                    // Only warn every 60 seconds to avoid spam
                    if (now - this.lastMetricWarning < 60000) return;

                    if (fps < 30 && fps > 0) {
                        this.lastMetricWarning = now;
                        this.setAvatarState('working');
                        this.showSpeechBubble(
                            `GRRR... Performance is dropping! FPS: ${fps}. I detect ${entities} entities. Should I analyze your update loops for optimization?`,
                            [
                                { label: 'OPTIMIZE', callback: () => { this.openChat(); this.addMessage('user', 'How can I optimize my game performance?'); this.sendMessage(); } },
                                { label: 'IGNORE', secondary: true, callback: () => this.dismiss() }
                            ]
                        );
                    }
                };
                this._listeners.push({ event: 'system:metrics', handler: onSystemMetrics });
                eventBus.on('system:metrics', onSystemMetrics);

                // AGENTIC PLANNER TELEMETRY & MUTATION EVENTS
                const onPlannerStepStart = (event) => {
                    const { step, index, total } = event.data || {};
                    if (step) {
                        this.onPlanStepProgress({ step, index, total, status: 'running' });
                    }
                };
                this._listeners.push({ event: 'ai:planner:step_start', handler: onPlannerStepStart });
                eventBus.on('ai:planner:step_start', onPlannerStepStart);

                const onPlannerStepFinish = (event) => {
                    const { step, index, total } = event.data || {};
                    if (step) {
                        this.onPlanStepProgress({ step, index, total, status: step.status });
                    }
                };
                this._listeners.push({ event: 'ai:planner:step_finish', handler: onPlannerStepFinish });
                eventBus.on('ai:planner:step_finish', onPlannerStepFinish);

                const onPlannerDiff = (event) => {
                    const { diff } = event.data || {};
                    if (diff) {
                        this.activeDiffs.push(diff);
                        if (this.currentWorkspace === 'diff') {
                            this.renderDiffs();
                        }
                    }
                };
                this._listeners.push({ event: 'ai:planner:diff_generated', handler: onPlannerDiff });
                eventBus.on('ai:planner:diff_generated', onPlannerDiff);
            }

            this.isInitialized = true;
            this.setAvatarState('idle');
            this.updatePlannerRoleUI();
            console.log('Kai: Initialization Complete.');
        } catch (error) {
            console.error('Kai: Init Error:', error);
            this.isInitialized = true;
            throw error;
        }
    }

    _scheduleFrame(fn) {
        return typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(fn)
            : setTimeout(fn, 16);
    }

    _cancelFrame(id) {
        if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(id);
        } else {
            clearTimeout(id);
        }
    }

    /**
     * Remove all intervals, window/document listeners, and EventBus subscriptions.
     * Call when the panel is being torn down or AI is being disabled.
     */
    destroy() {
        // Clear intervals / observers / RAFs
        if (this._hitZoneInterval) {
            clearInterval(this._hitZoneInterval);
            this._hitZoneInterval = null;
        }
        if (this._hitZoneRaf) {
            this._cancelFrame(this._hitZoneRaf);
            this._hitZoneRaf = null;
        }
        if (this._mouseMoveRaf) {
            this._cancelFrame(this._mouseMoveRaf);
            this._mouseMoveRaf = null;
        }
        if (this._hitZoneObserver) {
            this._hitZoneObserver.disconnect();
            this._hitZoneObserver = null;
        }
        if (this._hitZoneResizeObserver) {
            this._hitZoneResizeObserver.disconnect();
            this._hitZoneResizeObserver = null;
        }
        if (this._sessionClockInterval) {
            clearInterval(this._sessionClockInterval);
            this._sessionClockInterval = null;
        }

        // Remove window listeners
        for (const { event, handler } of this._windowListeners) {
            window.removeEventListener(event, handler);
        }
        this._windowListeners = [];

        // Remove document listeners
        for (const { event, handler } of this._documentListeners) {
            document.removeEventListener(event, handler);
        }
        this._documentListeners = [];

        // Remove EventBus listeners
        const eventBus = window.RedglitchEventBus || (window.parent && window.parent.RedglitchEventBus);
        if (eventBus) {
            for (const { event, handler } of this._listeners) {
                eventBus.off(event, handler);
            }
        }
        this._listeners = [];

        // Clear boredom timer
        this.clearBoredomTimer();
    }

    addBootLog(message) {
        const logs = document.getElementById('boot-logs');
        if (logs) {
            const line = document.createElement('div');
            const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
            
            const timeSpan = document.createElement('span');
            timeSpan.style.color = '#444';
            timeSpan.textContent = `[${time}] `;
            line.appendChild(timeSpan);
            
            const msgText = document.createTextNode(`>> ${message.toUpperCase()}`);
            line.appendChild(msgText);
            
            logs.appendChild(line);
            logs.scrollTop = logs.scrollHeight;
            this.playSound('typing');
        }
    }

    setupEventListeners() {
        const chatInput = document.getElementById('ai-chat-input');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        const clippy = document.getElementById('ai-clippy');
        if (clippy) {
            clippy.addEventListener('click', () => this.openChat());
        }

        const onKeydown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.toggleChat();
            }
            
            // Omni-Box Hotkey (Ctrl + Space)
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                this.toggleOmniBox();
            }
            
            if (e.key === 'Escape') {
                this.closeOmniBox();
            }
        };
        this._windowListeners.push({ event: 'keydown', handler: onKeydown });
        window.addEventListener('keydown', onKeydown);

        const omniInput = document.getElementById('omni-input');
        if (omniInput) {
            omniInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.processOmniCommand(omniInput.value);
                    omniInput.value = '';
                    this.closeOmniBox();
                }
            });
        }

        // Broadcast hit zones to parent ONLY when DOM/size changes (instead of 10Hz polling reflows)
        const hitZoneIds = [
            'ai-assistant-container',
            'ai-chat-panel',
            'xp-ai-loading',
            'xp-settings',
            'ai-speech-bubble',
            'ai-permission-gate',
            'kai-mode-toggle',
            'kai-mode-choice'
        ];
        const hitZoneHandler = () => {
            try {
                if (window.parent === window) return;
                const zones = [];
                for (let i = 0; i < hitZoneIds.length; i++) {
                    const el = document.getElementById(hitZoneIds[i]);
                    if (!el) continue;
                    // Fast visibility check before invoking getComputedStyle / getBoundingClientRect
                    if (el.style.display === 'none' || el.classList.contains('hidden')) continue;
                    if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') continue;
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            zones.push({
                                top: Math.round(rect.top),
                                left: Math.round(rect.left),
                                bottom: Math.round(rect.bottom),
                                right: Math.round(rect.right)
                            });
                        }
                    }
                }
                const sig = JSON.stringify(zones);
                if (sig === this._lastHitZoneSig) return;
                this._lastHitZoneSig = sig;
                window.parent.postMessage({ type: 'kai:hitzones', zones }, '*');
            } catch (e) {
                console.warn('[AssistantPanel] Hit-zone broadcast error:', e);
            }
        };
        const scheduleHitZoneSync = () => {
            if (this._hitZoneRaf) return;
            this._hitZoneRaf = this._scheduleFrame(() => {
                this._hitZoneRaf = null;
                hitZoneHandler();
            });
        };
        this._scheduleHitZoneSync = scheduleHitZoneSync;
        scheduleHitZoneSync();

        if (typeof MutationObserver !== 'undefined') {
            this._hitZoneObserver = new MutationObserver(scheduleHitZoneSync);
            hitZoneIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    this._hitZoneObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
                }
            });
        }
        if (typeof ResizeObserver !== 'undefined') {
            this._hitZoneResizeObserver = new ResizeObserver(scheduleHitZoneSync);
            hitZoneIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) this._hitZoneResizeObserver.observe(el);
            });
        }
        this._windowListeners.push({ event: 'resize', handler: scheduleHitZoneSync });
        window.addEventListener('resize', scheduleHitZoneSync);

        // Throttle mousemove forwarding to parent (max once per animation frame)
        let pendingMove = null;
        const onMouseMove = (e) => {
            if (window.parent === window) return;
            pendingMove = { clientX: e.clientX, clientY: e.clientY };
            if (this._mouseMoveRaf) return;
            this._mouseMoveRaf = this._scheduleFrame(() => {
                this._mouseMoveRaf = null;
                if (!pendingMove) return;
                window.parent.postMessage({
                    type: 'kai:mousemove',
                    clientX: pendingMove.clientX,
                    clientY: pendingMove.clientY
                }, '*');
                pendingMove = null;
            });
        };
        this._windowListeners.push({ event: 'mousemove', handler: onMouseMove });
        window.addEventListener('mousemove', onMouseMove);

        const onMouseDown = (e) => {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ 
                    type: 'kai:mousemove', // Trigger hit check on click too
                    clientX: e.clientX, 
                    clientY: e.clientY 
                }, '*');
            }
        };
        this._windowListeners.push({ event: 'mousedown', handler: onMouseDown });
        window.addEventListener('mousedown', onMouseDown);
    }

    showSpeechBubble(text, actions = []) {
        const bubble = document.getElementById('ai-speech-bubble');
        const textEl = document.getElementById('ai-speech-text');
        const actionsEl = document.getElementById('ai-speech-actions');

        if (!bubble || !textEl) return;

        textEl.textContent = text;
        actionsEl.innerHTML = '';
        
        if (actions.length === 0) {
            const accessBtn = document.createElement('button');
            accessBtn.className = 'xp-button';
            accessBtn.textContent = 'ACCESS';
            accessBtn.onclick = () => { if (window.AIChatUI) window.AIChatUI.openChat(); };
            
            const dismissBtn = document.createElement('button');
            dismissBtn.className = 'xp-button secondary';
            dismissBtn.textContent = 'DISMISS';
            dismissBtn.onclick = () => { if (window.AIChatUI) window.AIChatUI.dismiss(); };
            
            actionsEl.appendChild(accessBtn);
            actionsEl.appendChild(dismissBtn);
        } else {
            actions.forEach(action => {
                const btn = document.createElement('button');
                btn.className = `xp-button ${action.secondary ? 'secondary' : ''}`;
                btn.textContent = action.label;
                btn.onclick = action.callback;
                actionsEl.appendChild(btn);
            });
        }

        bubble.classList.add('show');
        setTimeout(() => this.dismiss(), 10000);
    }

    dismiss() {
        const bubble = document.getElementById('ai-speech-bubble');
        if (bubble) bubble.classList.remove('show');
    }

    updateChatMeta() {
        const modelLabels = {
            native: 'NATIVE_CORTEX',
            openrouter: 'OPENROUTER_CLOUD',
            'google-ai-studio': 'GOOGLE_AI_STUDIO',
            openai: 'OPENAI_DIRECT',
            anthropic: 'ANTHROPIC_CLAUDE',
            gemini: 'GOOGLE_GEMINI',
            groq: 'GROQ_LPU',
            deepseek: 'DEEPSEEK_AI',
            mistral: 'MISTRAL_AI',
            ollama: 'OLLAMA_LOCAL',
            custom: 'CUSTOM_ENDPOINT'
        };
        const settings = (window.AISettings && window.AISettings.settings) || {};
        const provider = settings.provider || 'openrouter';

        const modelEl = document.getElementById('ai-chat-meta-model');
        if (modelEl) modelEl.textContent = modelLabels[provider] || provider.toUpperCase();

        const irab = window.irab || (window.parent && window.parent.irab);
        const connected = provider !== 'native' || (irab && irab.isConnected);
        const dot = document.getElementById('ai-chat-meta-dot');
        if (dot) dot.classList.toggle('live', !!connected);

        const ragEl = document.getElementById('ai-chat-meta-rag');
        if (ragEl) ragEl.textContent = 'RAG: ' + (settings.ragEnabled === false ? 'OFF' : 'ENABLED');
    }

    startSessionClock() {
        if (this._sessionClockInterval) return; // already running
        this._sessionStart = Date.now();
        this._sessionClockInterval = setInterval(() => {
            const el = document.getElementById('ai-chat-meta-session');
            if (!el) return;
            const sec = Math.floor((Date.now() - this._sessionStart) / 1000);
            const m = String(Math.floor(sec / 60)).padStart(2, '0');
            const s = String(sec % 60).padStart(2, '0');
            el.textContent = 'SESSION: ' + m + ':' + s;
        }, 1000);
    }

    openChat() {
        const panel = document.getElementById('ai-chat-panel');
        if (panel) {
            panel.classList.add('show');
            this.dismiss();
            this.playSound('online');
            this.updateChatMeta();
            this.startSessionClock();

            setTimeout(() => {
                const input = document.getElementById('ai-chat-input');
                if (input) input.focus();
            }, 300);

            const messages = document.getElementById('ai-chat-messages');
            if (messages && messages.children.length === 0) {
                if (this.assistant && this.assistant.personality) {
                    this.addMessage('assistant', 
                        ">> " + this.assistant.personality.getRandomGreeting() + "\n\n" +
                        "CAPABILITIES:\n" +
                        "[1] QUERY DOCUMENTATION (CACHED)\n" +
                        "[2] EXECUTE CODE TUTORIALS\n" +
                        "[3] GENERATE ASSETS (EXPERIMENTAL)\n\n" +
                        "AWAITING COMMAND..."
                    );
                } else {
                    this.addMessage('system', 
                        ">> WAKING UP KAI...\n" +
                        "Loading modules... Press Ctrl+K to close."
                    );
                    if (!this.isInitialized) {
                        this.initialize().catch(err => {
                            console.error('Kai: Init Failed:', err);
                            this.addMessage('error', "CRITICAL ERROR: SYSTEM FAILURE.");
                        });
                    }
                }
            }
        }
    }

    closeChat() {
        const panel = document.getElementById('ai-chat-panel');
        if (panel) panel.classList.remove('show');
    }

    switchWorkspace(viewName) {
        if (!['chat', 'planner', 'diff', 'config'].includes(viewName)) return;
        this.previousWorkspace = this.currentWorkspace;
        this.currentWorkspace = viewName;

        // Update Nav Tabs
        document.querySelectorAll('.workspace-tab').forEach(tab => {
            tab.classList.toggle('active', tab.id === `tab-nav-${viewName}`);
        });

        // Update View Panes
        document.querySelectorAll('.ai-view-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `view-${viewName}`);
        });

        this.playSound('online');

        if (viewName === 'planner') {
            this.updatePlannerRoleUI();
            this.updateChatMeta();
            const goalInput = document.getElementById('planner-goal-input');
            if (goalInput && !goalInput.value) {
                setTimeout(() => goalInput.focus(), 100);
            }
        } else if (viewName === 'diff') {
            this.renderDiffs();
        } else if (viewName === 'config') {
            if (window.AISettings) window.AISettings.applyToUI();
        } else if (viewName === 'chat') {
            setTimeout(() => document.getElementById('ai-chat-input')?.focus(), 100);
        }
    }

    toggleMaximize() {
        const panel = document.getElementById('ai-chat-panel');
        if (!panel) return;
        this.isMaximized = !this.isMaximized;
        panel.classList.toggle('maximized', this.isMaximized);
        const maxBtn = panel.querySelector('.xp-control-btn.maximize');
        if (maxBtn) maxBtn.textContent = this.isMaximized ? '[🗗]' : '[⛶]';
    }

    selectRole(roleId) {
        if (!this.roles[roleId]) return;
        this.activePlannerRole = roleId;
        this.updatePlannerRoleUI();
        this.playSound('typing');
    }

    updatePlannerRoleUI() {
        const role = this.roles[this.activePlannerRole] || this.roles.architect;
        
        // Update role buttons
        document.querySelectorAll('#planner-role-selector .role-chip').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.role === role.id);
        });

        // Update description banner
        const descEl = document.getElementById('planner-role-desc');
        if (descEl) {
            descEl.innerHTML = `<span class="role-desc-title">${this.escapeHTML((role.name || '').toUpperCase())}:</span> ${this.escapeHTML(role.desc || '')}`;
        }

        // Update status bar indicator
        const roleInd = document.getElementById('xp-role-indicator');
        if (roleInd) {
            roleInd.textContent = `ROLE: ${role.name.toUpperCase()}`;
        }
    }

    setPlannerGoal(text) {
        const input = document.getElementById('planner-goal-input');
        if (input) {
            input.value = text;
            input.focus();
        }

        // Context-aware auto-role assignment based on goal keywords
        const q = text.toLowerCase();
        if (q.includes('boss') || q.includes('combat') || q.includes('item') || q.includes('loot') || q.includes('skill')) {
            this.selectRole('gameplay');
        } else if (q.includes('level') || q.includes('map') || q.includes('dungeon') || q.includes('terrain') || q.includes('prefab')) {
            this.selectRole('world');
        } else if (q.includes('quest') || q.includes('dialogue') || q.includes('npc') || q.includes('lore')) {
            this.selectRole('narrative');
        } else if (q.includes('audit') || q.includes('qa') || q.includes('test') || q.includes('stability')) {
            this.selectRole('qa');
        } else {
            this.selectRole('architect');
        }
    }

    async decomposePlannerGoal() {
        const input = document.getElementById('planner-goal-input');
        const goal = input ? input.value.trim() : '';

        if (!goal) {
            if (input) {
                input.style.borderColor = '#ff2255';
                setTimeout(() => input.style.borderColor = '', 1000);
            }
            this.showSpeechBubble("GRRR... Please enter an objective before decomposing!", [
                { label: 'OKAY', secondary: true, callback: () => this.dismiss() }
            ]);
            this.playSound('error');
            return;
        }

        const btnDecompose = document.getElementById('btn-decompose-plan');
        const btnExecute = document.getElementById('btn-execute-plan');
        const badge = document.getElementById('blueprint-status-badge');
        const titleEl = document.getElementById('blueprint-goal-title');

        if (btnDecompose) {
            btnDecompose.disabled = true;
            btnDecompose.textContent = 'DECOMPOSING...';
        }
        if (badge) {
            badge.className = 'blueprint-status-badge running';
            badge.textContent = 'ANALYZING...';
        }
        if (titleEl) {
            titleEl.textContent = goal;
        }

        this.setAvatarState('working');
        this.playSound('typing');

        try {
            if (!this.assistant) {
                this.assistant = new IRABAssistantSimple();
            }
            const plan = await this.assistant.planGoal(goal, { role: this.activePlannerRole });
            this.activePlan = plan;

            this.renderBlueprintSteps(plan);

            if (badge) {
                badge.className = 'blueprint-status-badge ready';
                badge.textContent = 'BLUEPRINT READY';
            }
            if (btnExecute) {
                btnExecute.disabled = false;
            }

            // Update Progress Bar
            const fill = document.getElementById('planner-progress-fill');
            const percent = document.getElementById('planner-progress-percent');
            const text = document.getElementById('planner-progress-text');
            if (fill) fill.style.width = '0%';
            if (percent) percent.textContent = '0%';
            if (text) text.textContent = `0 / ${plan.steps.length} STEPS COMPLETED`;

            this.setAvatarState('idle');
            this.playSound('online');
        } catch (err) {
            console.error('[AssistantPanel] Decompose error:', err);
            if (badge) {
                badge.className = 'blueprint-status-badge failed';
                badge.textContent = 'DECOMPOSE FAILED';
            }
            this.setAvatarState('error');
            this.playSound('error');
        } finally {
            if (btnDecompose) {
                btnDecompose.disabled = false;
                btnDecompose.textContent = '⚡ DECOMPOSE OBJECTIVE';
            }
        }
    }

    renderBlueprintSteps(plan) {
        const container = document.getElementById('planner-steps-list');
        if (!container) return;

        if (!plan || !plan.steps || plan.steps.length === 0) {
            container.innerHTML = `
                <div class="planner-empty-state">
                    <div class="empty-icon">🎯</div>
                    <div class="empty-text">ENTER AN OBJECTIVE ABOVE AND CLICK "DECOMPOSE OBJECTIVE" TO GENERATE AN AUTONOMOUS MULTI-STEP BLUEPRINT.</div>
                </div>`;
            return;
        }

        container.innerHTML = '';
        plan.steps.forEach((step, idx) => {
            const card = document.createElement('div');
            card.id = `step-card-${step.id || idx + 1}`;
            card.className = `planner-step-card ${step.status || 'pending'}`;

            const role = this.roles[step.role] || { name: step.role || 'ARCHITECT', icon: '⚡' };
            const statusClass = step.status || 'pending';
            const statusLabel = step.status ? step.status.toUpperCase() : 'PENDING';

            card.innerHTML = `
                <div class="step-card-header">
                    <div class="step-card-left">
                        <span class="step-num">#${String(idx + 1).padStart(2, '0')}</span>
                        <span class="step-role-badge">${role.icon} ${role.name.toUpperCase()}</span>
                        <span class="step-title">${this.escapeHTML(step.title || 'Step ' + (idx + 1))}</span>
                    </div>
                    <span class="step-status-tag ${statusClass}">${statusLabel}</span>
                </div>
                <div class="step-card-desc">${this.escapeHTML(step.description || '')}</div>
                <div class="step-card-footer">
                    <span class="step-tool-badge">tool: ${this.escapeHTML(step.tool || 'none')}</span>
                    <button type="button" class="step-output-toggle" onclick="AIChatUI.toggleStepOutput(${step.id || idx + 1})">LOGS</button>
                </div>
                <div id="step-output-${step.id || idx + 1}" class="step-output-console" style="display: none;">${step.output ? this.escapeHTML(JSON.stringify(step.output, null, 2)) : '// Awaiting execution...'}</div>
            `;
            container.appendChild(card);
        });
    }

    toggleStepOutput(stepId) {
        const out = document.getElementById(`step-output-${stepId}`);
        if (out) {
            out.style.display = out.style.display === 'none' ? 'block' : 'none';
        }
    }

    async executeActivePlan() {
        if (!this.activePlan || this.isExecutingPlan) return;
        this.isExecutingPlan = true;

        const btnExecute = document.getElementById('btn-execute-plan');
        const btnDecompose = document.getElementById('btn-decompose-plan');
        const btnAbort = document.getElementById('btn-abort-plan');
        const badge = document.getElementById('blueprint-status-badge');
        const missionMeta = document.getElementById('ai-chat-meta-mission');

        if (btnExecute) btnExecute.disabled = true;
        if (btnDecompose) btnDecompose.style.display = 'none';
        if (btnAbort) btnAbort.style.display = 'inline-flex';
        if (badge) {
            badge.className = 'blueprint-status-badge running';
            badge.textContent = 'EXECUTING MISSION...';
        }
        if (missionMeta) missionMeta.textContent = 'MISSION: EXECUTING';

        this.setAvatarState('working');
        this.playSound('typing');

        try {
            const executionResult = await this.assistant.executePlan(this.activePlan, {
                onStepProgress: (progress) => this.onPlanStepProgress(progress)
            });

            this.isExecutingPlan = false;
            if (btnAbort) btnAbort.style.display = 'none';
            if (btnDecompose) btnDecompose.style.display = 'inline-flex';
            if (btnExecute) btnExecute.disabled = false;

            if (executionResult && executionResult.success) {
                if (badge) {
                    badge.className = 'blueprint-status-badge completed';
                    badge.textContent = 'MISSION ACCOMPLISHED ✓';
                }
                if (missionMeta) missionMeta.textContent = 'MISSION: SUCCESS ✓';
                this.setAvatarState('success');
                this.playSound('online');

                // Archive in diff history
                this.diffHistory.unshift(this.activePlan);
                this.updateDiffHistorySelect();

                if (this.activePlan.diffs && this.activePlan.diffs.length > 0) {
                    this.activeDiffs = [...this.activePlan.diffs];
                    this.renderDiffs();
                    this.showSpeechBubble(`MISSION COMPLETE! Generated ${this.activePlan.diffs.length} mutations. Switch to DIFF INSPECTOR to review.`, [
                        { label: 'VIEW DIFFS', callback: () => { this.switchWorkspace('diff'); this.dismiss(); } },
                        { label: 'DISMISS', secondary: true, callback: () => this.dismiss() }
                    ]);
                }
            } else {
                if (badge) {
                    badge.className = 'blueprint-status-badge failed';
                    badge.textContent = this.activePlan.status === 'aborted' ? 'MISSION ABORTED' : 'MISSION FAILED ✗';
                }
                if (missionMeta) missionMeta.textContent = 'MISSION: HALTED';
                this.setAvatarState('error');
                this.playSound('error');
            }
        } catch (err) {
            console.error('[AssistantPanel] Execution error:', err);
            this.isExecutingPlan = false;
            if (btnAbort) btnAbort.style.display = 'none';
            if (btnDecompose) btnDecompose.style.display = 'inline-flex';
            if (btnExecute) btnExecute.disabled = false;
            if (badge) {
                badge.className = 'blueprint-status-badge failed';
                badge.textContent = 'EXECUTION ERROR';
            }
            this.setAvatarState('error');
            this.playSound('error');
        }
    }

    onPlanStepProgress(progress) {
        const { step, index, total, status } = progress;
        const card = document.getElementById(`step-card-${step.id || index + 1}`);
        if (card) {
            card.className = `planner-step-card ${status}`;
            const tag = card.querySelector('.step-status-tag');
            if (tag) {
                tag.className = `step-status-tag ${status}`;
                tag.textContent = status.toUpperCase();
            }
            if (step.durationMs) {
                const badge = card.querySelector('.step-tool-badge');
                if (badge && !badge.textContent.includes('ms')) {
                    badge.textContent += ` (${step.durationMs}ms)`;
                }
            }
            const consoleEl = document.getElementById(`step-output-${step.id || index + 1}`);
            if (consoleEl && step.output) {
                consoleEl.textContent = JSON.stringify(step.output, null, 2);
            }
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Update Progress Bar
        const completedCount = index + (status === 'completed' ? 1 : 0);
        const pct = Math.round((completedCount / total) * 100);
        const fill = document.getElementById('planner-progress-fill');
        const percent = document.getElementById('planner-progress-percent');
        const text = document.getElementById('planner-progress-text');

        if (fill) fill.style.width = `${pct}%`;
        if (percent) percent.textContent = `${pct}%`;
        if (text) text.textContent = `${completedCount} / ${total} STEPS COMPLETED`;
    }

    abortActivePlan() {
        if (this.assistant) {
            this.assistant.abortPlan();
        }
        const badge = document.getElementById('blueprint-status-badge');
        if (badge) {
            badge.textContent = 'ABORTING MISSION...';
        }
        this.playSound('error');
    }

    resetPlanner() {
        const input = document.getElementById('planner-goal-input');
        if (input) input.value = '';

        this.activePlan = null;
        this.renderBlueprintSteps(null);

        const badge = document.getElementById('blueprint-status-badge');
        if (badge) {
            badge.className = 'blueprint-status-badge';
            badge.textContent = 'STANDBY';
        }
        const titleEl = document.getElementById('blueprint-goal-title');
        if (titleEl) titleEl.textContent = 'AWAITING OBJECTIVE...';

        const btnExecute = document.getElementById('btn-execute-plan');
        if (btnExecute) btnExecute.disabled = true;

        const fill = document.getElementById('planner-progress-fill');
        const percent = document.getElementById('planner-progress-percent');
        const text = document.getElementById('planner-progress-text');
        if (fill) fill.style.width = '0%';
        if (percent) percent.textContent = '0%';
        if (text) text.textContent = '0 / 0 STEPS COMPLETED';
    }

    renderDiffs(diffs) {
        const targetDiffs = diffs || this.activeDiffs || (this.activePlan ? this.activePlan.diffs : []);
        const viewport = document.getElementById('diff-viewport');
        const filesEl = document.getElementById('diff-summary-files');
        const addsEl = document.getElementById('diff-summary-adds');
        const delsEl = document.getElementById('diff-summary-dels');
        const statusEl = document.getElementById('diff-summary-msg');

        if (!viewport) return;

        if (!targetDiffs || targetDiffs.length === 0) {
            viewport.innerHTML = `
                <div class="diff-empty-state">
                    <div class="empty-icon">🔍</div>
                    <div class="empty-title">NO ACTIVE MUTATIONS</div>
                    <div class="empty-text">Changes made by the Agentic Planner or AI tools will appear here in unified diff format with syntax highlighting and audit logs.</div>
                </div>`;
            if (filesEl) filesEl.textContent = 'FILES: 0';
            if (addsEl) addsEl.textContent = '+0 ADDITIONS';
            if (delsEl) delsEl.textContent = '-0 DELETIONS';
            if (statusEl) statusEl.textContent = 'NO PENDING MUTATIONS';
            return;
        }

        let totalAdd = 0;
        let totalDel = 0;
        viewport.innerHTML = '';

        targetDiffs.forEach(diff => {
            totalAdd += diff.additions || 0;
            totalDel += diff.deletions || 0;

            const block = document.createElement('div');
            block.className = 'diff-file-block';

            const header = document.createElement('div');
            header.className = 'diff-file-header';
            header.innerHTML = `<span>📁 ${this.escapeHTML(diff.filePath || 'mutated_asset')}</span><span>${this.escapeHTML(diff.summary || `+${diff.additions} / -${diff.deletions}`)}</span>`;
            block.appendChild(header);

            if (diff.diffLines && diff.diffLines.length > 0) {
                diff.diffLines.forEach(dl => {
                    const line = document.createElement('div');
                    line.className = `diff-line ${dl.type}`;
                    const marker = dl.type === 'add' ? '+' : dl.type === 'del' ? '-' : ' ';
                    line.innerHTML = `
                        <span class="diff-line-no">${dl.lineNo || ''}</span>
                        <span class="diff-line-marker">${marker}</span>
                        <span class="diff-line-content">${this.escapeHTML(dl.line || '')}</span>`;
                    block.appendChild(line);
                });
            }

            viewport.appendChild(block);
        });

        if (filesEl) filesEl.textContent = `FILES: ${targetDiffs.length}`;
        if (addsEl) addsEl.textContent = `+${totalAdd} ADDITIONS`;
        if (delsEl) delsEl.textContent = `-${totalDel} DELETIONS`;
        if (statusEl) statusEl.textContent = `${targetDiffs.length} MUTATIONS AUDITED`;
    }

    onDiffHistorySelect(selectedIndex) {
        if (selectedIndex === '' || selectedIndex === null) {
            this.renderDiffs(this.activeDiffs);
            return;
        }
        const plan = this.diffHistory[selectedIndex];
        if (plan && plan.diffs) {
            this.renderDiffs(plan.diffs);
        }
    }

    updateDiffHistorySelect() {
        const sel = document.getElementById('diff-history-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Active Plan Mutations --</option>';
        this.diffHistory.forEach((plan, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = `[${plan.role.toUpperCase()}] ${plan.title.slice(0, 30)} (${plan.diffs?.length || 0} diffs)`;
            sel.appendChild(opt);
        });
    }

    clearDiffs() {
        this.activeDiffs = [];
        this.renderDiffs([]);
    }

    escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    toggleOmniBox() {
        const box = document.getElementById('xp-omni-box');
        if (box) {
            const isShowing = box.classList.toggle('show');
            if (isShowing) {
                this.playSound('online');
                setTimeout(() => document.getElementById('omni-input')?.focus(), 50);
            }
        }
    }

    closeOmniBox() {
        const box = document.getElementById('xp-omni-box');
        if (box) box.classList.remove('show');
    }

    async processOmniCommand(input) {
        if (!input.trim()) return;
        
        // 1. Check for quick shortcuts
        if (input.startsWith('/')) {
            const parts = input.substring(1).split(' ');
            const cmd = parts[0];
            const args = parts.slice(1).join(' ');
            
            this.addMessage('user', `COMMAND: ${input}`);
            
            if (cmd === 'open') {
                this.executeAction({ type: 'openFile', params: { path: args.trim() } });
                return;
            }
            if (cmd === 'status') {
                const res = await fetch('/api/git/status');
                const data = await res.json();
                this.showSpeechBubble(`GIT STATUS: ${data.status}`);
                return;
            }
        }

        // 2. Default: Quick Prompt
        this.addMessage('user', input);
        this.setAvatarState('working');
        this.playSound('typing');

        try {
            const response = await this.assistant.processQuery(input);
            this.addMessage('assistant', response.text);
            this.setAvatarState('success');
            this.showSpeechBubble(response.text.substring(0, 100) + '...');
            this.playSound('messageReceived');
        } catch (e) {
            this.setAvatarState('error');
            this.addMessage('error', e.message);
        }
    }

    toggleChat() {
        const panel = document.getElementById('ai-chat-panel');
        if (panel && panel.classList.contains('show')) this.closeChat();
        else this.openChat();
    }

    async sendMessage() {
        const input = document.getElementById('ai-chat-input');
        if (!input || !input.value.trim()) return;

        const query = input.value.trim();
        input.value = '';

        const counter = document.getElementById('xp-char-count');
        if (counter) counter.textContent = '0/500';

        this.addMessage('user', query);
        this.playSound('messageSent');

        // Quick Slash Commands for Agentic Deck
        if (query.startsWith('/plan')) {
            const goal = query.replace(/^\/plan\s*/i, '').trim();
            if (goal) {
                this.addMessage('system', `>> DISPATCHING AGENTIC MISSION: "${goal}"`);
                this.switchWorkspace('planner');
                this.setPlannerGoal(goal);
                this.decomposePlannerGoal();
            } else {
                this.switchWorkspace('planner');
            }
            return;
        }

        if (query.startsWith('/role')) {
            const roleKey = query.replace(/^\/role\s*/i, '').trim().toLowerCase();
            if (this.roles[roleKey]) {
                this.selectRole(roleKey);
                this.addMessage('system', `>> ACTIVE AGENT ROLE: ${this.roles[roleKey].name.toUpperCase()}`);
            } else {
                const available = Object.keys(this.roles).join(', ');
                this.addMessage('system', `>> AVAILABLE ROLES: ${available}`);
            }
            return;
        }

        if (query === '/diff' || query === '/inspector') {
            this.switchWorkspace('diff');
            return;
        }

        if (query === '/config' || query === '/settings') {
            this.switchWorkspace('config');
            return;
        }

        if (!this.assistant || !this.isInitialized) {
            this.playSound('error');
            this.addMessage('error', ">> SYSTEM BUSY. LOADING MODULES...");
            if (!this.isInitialized) {
                this.initialize().catch(err => console.error('Kai: Init Failed', err));
            }
            input.focus(); // Restore focus even on error
            return;
        }

        const statusDot = document.querySelector('.xp-status-dot');
        const statusText = document.getElementById('xp-status-text');
        if (statusDot) statusDot.classList.add('thinking');
        if (statusText) statusText.textContent = 'THINKING...';
        
        this.setAvatarState('working');
        this.playSound('typing');

        let streamMsg = null;

        try {
            const response = await this.assistant.processQuery(query, {
                onToken: (token) => {
                    if (statusText && statusText.textContent !== 'KAI IS TYPING...') {
                        statusText.textContent = 'KAI IS TYPING...';
                    }
                    if (!streamMsg) streamMsg = this.createStreamingMessage();
                    if (streamMsg) streamMsg.appendToken(token);
                }
            });

            if (streamMsg) {
                streamMsg.finish();
            }

            if (statusDot) statusDot.classList.remove('thinking');
            if (statusText) statusText.textContent = 'ONLINE';

            this.addMessage('assistant', response.text);
            this.playSound('messageReceived');

            // Success animation
            this.setAvatarState('success');
            setTimeout(() => {
                if (this.avatarState === 'success') this.setAvatarState('idle');
            }, 3000);

            if (response.type === 'tutorial' && response.tutorial) {
                this.startTutorial(response.tutorial);
            } else if (response.type === 'confirmation' && response.pendingAction) {
                this.showActionConfirmation(response.pendingAction);
            } else if (response.type === 'choices' && response.intent) {
                this.showChoices(response.intent);
            }

        } catch (error) {
            if (statusDot) statusDot.classList.remove('thinking');
            if (statusText) statusText.textContent = 'ERROR';
            this.setAvatarState('error');
            this.playSound('error');
            this.addMessage('error', `>> EXCEPTION: ${error.message}`);
        } finally {
            // Always restore focus after processing
            input.focus();
        }
    }

    queryContext() {
        const eventBus = window.RedglitchEventBus || (window.parent && window.parent.RedglitchEventBus);
        if (!eventBus) {
            this.addMessage('error', '>> EVENT_BUS NOT FOUND. CANNOT QUERY CONTEXT.');
            return;
        }

        this.addMessage('system', '>> GATHERING WORKSPACE TELEMETRY...');
        this.setAvatarState('working');
        
        const contexts = [];
        const handler = (e) => {
            contexts.push(e.data);
        };
        eventBus.on('ai:context_response', handler);

        eventBus.emit('ai:context_query', { timestamp: Date.now() });

        setTimeout(() => {
            // A simple implementation of off(), assuming EventBus supports it, else we just ignore.
            if (eventBus.off) eventBus.off('ai:context_response', handler);
            
            if (contexts.length === 0) {
                this.addMessage('system', '>> NO ACTIVE TOOLS RESPONDED WITH CONTEXT.');
            } else {
                let report = '>> CONTEXT REPORT:\n';
                contexts.forEach(ctx => {
                    report += `[${ctx.source.toUpperCase()}]: ${ctx.details}\n`;
                });
                this.addMessage('system', report);
                
                const input = document.getElementById('ai-chat-input');
                if (input && input.value === '') {
                    input.value = `Given the following context:\n${contexts.map(c => `- ${c.source}: ${c.details}`).join('\n')}\n\n`;
                    input.focus();
                }
            }
            this.setAvatarState('idle');
        }, 800);
    }

    renderMarkdownToBubble(text, bubble) {
        bubble.innerHTML = ''; // Clear previous content
        
        const cleanText = text.replace(/--- FILE: .*? ---/g, '').trim();

        if (cleanText.includes('```')) {
            // Support unclosed code blocks for streaming
            let parsingText = cleanText;
            const openTags = (parsingText.match(/```/g) || []).length;
            if (openTags % 2 !== 0) {
                parsingText += '\n```'; // Auto-close for rendering
            }

            const parts = parsingText.split(/(```[\s\S]*?```)/g);
            parts.forEach(part => {
                if (part.startsWith('```')) {
                    const lines = part.replace(/```\w*\n?/, '').replace(/```$/, '').split('\n');
                    const codeBlock = document.createElement('div');
                    codeBlock.style.background = '#000';
                    codeBlock.style.border = '1px solid #333';
                    codeBlock.style.padding = '8px';
                    codeBlock.style.margin = '6px 0';
                    codeBlock.style.whiteSpace = 'pre-wrap';
                    codeBlock.style.fontFamily = 'var(--kai-font-mono)';
                    codeBlock.style.fontSize = '0.9em';
                    codeBlock.style.overflowX = 'auto';
                    const codeText = lines.join('\n');
                    codeBlock.textContent = codeText;

                    const codeCopyBtn = document.createElement('button');
                    codeCopyBtn.textContent = '[COPY]';
                    codeCopyBtn.style.cssText = 'background:transparent;border:1px solid #444;color:#666;cursor:pointer;font-size:11px;font-family:inherit;padding:1px 6px;float:right;margin-bottom:4px; margin-left: 4px;';
                    codeCopyBtn.onclick = (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(codeText).then(() => {
                            codeCopyBtn.textContent = '[COPIED]';
                            setTimeout(() => { codeCopyBtn.textContent = '[COPY]'; }, 2000);
                        }).catch(() => {});
                    };

                    const applyBtn = document.createElement('button');
                    applyBtn.textContent = '[APPLY TO EDITOR]';
                    applyBtn.style.cssText = 'background:transparent;border:1px solid var(--kai-accent);color:var(--kai-accent);cursor:pointer;font-size:11px;font-family:inherit;padding:1px 6px;float:right;margin-bottom:4px; font-weight: bold;';
                    applyBtn.onclick = (e) => {
                        e.stopPropagation();
                        const eventBus = window.RedglitchEventBus || (window.parent && window.parent.RedglitchEventBus);
                        if (eventBus) {
                            eventBus.emit('ai:command:request', {
                                id: `ui_insert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                method: 'code.insert',
                                params: { content: codeText }
                            });
                            applyBtn.textContent = '[APPLIED]';
                            setTimeout(() => { applyBtn.textContent = '[APPLY TO EDITOR]'; }, 2000);
                        }
                    };

                    const wrapper = document.createElement('div');
                    wrapper.style.overflow = 'hidden';
                    wrapper.appendChild(codeCopyBtn);
                    wrapper.appendChild(applyBtn);
                    wrapper.appendChild(codeBlock);
                    bubble.appendChild(wrapper);
                } else if (part.trim()) {
                    const textNode = document.createElement('span');
                    textNode.textContent = part;
                    bubble.appendChild(textNode);
                }
            });
        } else {
            bubble.textContent = cleanText;
        }
    }

    createStreamingMessage() {
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!messagesContainer) return null;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'ai-message assistant';

        const avatar = document.createElement('div');
        avatar.className = 'ai-message-avatar';
        avatar.textContent = 'K';

        const content = document.createElement('div');
        content.className = 'ai-message-content';

        const nameBar = document.createElement('div');
        nameBar.style.display = 'flex';
        nameBar.style.alignItems = 'center';
        nameBar.style.justifyContent = 'space-between';
        
        const nameName = document.createElement('span');
        nameName.className = 'ai-message-name';
        nameName.textContent = 'KAI';
        
        nameBar.appendChild(nameName);
        content.appendChild(nameBar);

        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';
        content.appendChild(bubble);

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        let fullText = "";

        return {
            appendToken: (token) => {
                fullText += token;
                this.renderMarkdownToBubble(fullText, bubble);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            },
            finish: () => {
                messageDiv.remove();
                return fullText;
            }
        };
    }

    addMessage(type, text) {
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!messagesContainer) return;

        // --- RAG 2.0: Proactive File Suggestions ---
        const fileRegex = /--- FILE: (.*?) \(Relevance: (.*?)%\) ---/g;
        let fileMatch;
        const suggestedFiles = new Set();
        
        while ((fileMatch = fileRegex.exec(text)) !== null) {
            const filePath = fileMatch[1];
            const relevance = parseInt(fileMatch[2]);
            if (relevance > 40) {
                const safePath = String(filePath || '').replace(/[^a-zA-Z0-9_./-]/g, '').replace(/\.\.\//g, '');
                if (safePath && !safePath.includes('..') && suggestedFiles.size < 20) suggestedFiles.add(safePath);
            }
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${type}`;

        const avatar = document.createElement('div');
        avatar.className = 'ai-message-avatar';
        
        if (type === 'user') avatar.textContent = 'U';
        else if (type === 'assistant') avatar.textContent = 'K';
        else if (type === 'system') avatar.textContent = 'i';
        else if (type === 'error') avatar.textContent = '!';

        const content = document.createElement('div');
        content.className = 'ai-message-content';

        const nameBar = document.createElement('div');
        nameBar.style.display = 'flex';
        nameBar.style.alignItems = 'center';
        nameBar.style.justifyContent = 'space-between';
        const nameName = document.createElement('span');
        nameName.className = 'ai-message-name';
        nameName.textContent = type === 'user' ? 'USER' :
                               type === 'assistant' ? 'KAI' :
                               type === 'system' ? 'SYSTEM' : 'ERROR';

        const timeStamp = document.createElement('span');
        timeStamp.className = 'ai-message-time';
        timeStamp.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
        nameName.appendChild(timeStamp);

        nameBar.appendChild(nameName);

        // Copy button for assistant messages
        if (type === 'assistant') {
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '[COPY]';
            copyBtn.style.background = 'transparent';
            copyBtn.style.border = '1px solid #444';
            copyBtn.style.color = '#666';
            copyBtn.style.cursor = 'pointer';
            copyBtn.style.fontSize = '11px';
            copyBtn.style.fontFamily = 'inherit';
            copyBtn.style.padding = '1px 6px';
            copyBtn.title = 'Copy response';
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                const clean = text.replace(/--- FILE: .*? ---/g, '').trim();
                navigator.clipboard.writeText(clean).then(() => {
                    copyBtn.textContent = '[COPIED]';
                    setTimeout(() => { copyBtn.textContent = '[COPY]'; }, 2000);
                }).catch(() => {});
            };
            nameBar.appendChild(copyBtn);
        }

        content.appendChild(nameBar);

        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';
        
        // Clean up the text (hide the RAG headers for a cleaner UI, but keep for logic)
        const hasManifesto = text.includes('[MANIFESTO]');

        if (type === 'assistant') {
            this.renderMarkdownToBubble(text, bubble);
        } else {
            const cleanText = text.replace(/--- FILE: .*? ---/g, '').trim();
            bubble.textContent = cleanText;
        }

        if (hasManifesto && type === 'assistant') {
            const badge = document.createElement('div');
            badge.style.fontSize = '10px';
            badge.style.color = '#ffd700';
            badge.style.marginTop = '4px';
            badge.style.opacity = '0.7';
            
            const icon = document.createElement('i');
            icon.className = 'fas fa-eye';
            badge.appendChild(icon);
            badge.appendChild(document.createTextNode(' VISION_ALIGNED'));
            
            content.appendChild(badge);
        }

        content.appendChild(bubble);

        // Add suggestion buttons if files found
        if (suggestedFiles.size > 0 && type === 'assistant') {
            const suggestDiv = document.createElement('div');
            suggestDiv.style.marginTop = '8px';
            suggestDiv.style.display = 'flex';
            suggestDiv.style.gap = '5px';
            suggestDiv.style.flexWrap = 'wrap';

            suggestedFiles.forEach(path => {
                const btn = document.createElement('button');
                btn.className = 'xp-button';
                btn.style.fontSize = '12px';
                btn.style.padding = '2px 8px';
                btn.textContent = `📂 OPEN ${path.split('/').pop()}`;
                btn.onclick = () => {
                    const eventBus = window.RedglitchEventBus || (window.parent && window.parent.RedglitchEventBus);
                    if (eventBus) {
                        const isCodePath = /\.(?:c?js|mjs|ts|tsx|jsx|md|txt|html|css|glsl|wgsl|yaml|yml|xml|shader|json)$/i.test(path);
                        let target = 'asset_manager';
                        if (/iso|isopixel/i.test(path)) target = 'iso_studio';
                        else if (/platformer/i.test(path)) target = 'platformer_studio';
                        else if (/world|level|map/i.test(path)) target = 'editor';
                        else if (/\.(?:wav|mp3|ogg|flac)$/i.test(path)) target = 'daw';
                        else if (/3d|\.(?:glb|gltf|obj|fbx)$/i.test(path)) target = 'studio_3d';
                        eventBus.emit('ai:command:request', {
                            id: `ui_open_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                            method: isCodePath ? 'code.open' : 'navigateTo',
                            params: isCodePath ? { path: path } : { target }
                        });
                    }
                };
                suggestDiv.appendChild(btn);
            });
            content.appendChild(suggestDiv);
        }

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    showActionConfirmation(action) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'ai-message system';

        const executeBtn = document.createElement('button');
        executeBtn.className = 'xp-button';
        executeBtn.textContent = '[EXECUTE]';
        executeBtn.onclick = () => {
            this.executeAction(action);
            actionsDiv.remove();
        };

        const abortBtn = document.createElement('button');
        abortBtn.className = 'xp-button secondary';
        abortBtn.textContent = '[ABORT]';
        abortBtn.onclick = () => {
            this.addMessage('system', '>> ABORTED.');
            actionsDiv.remove();
        };

        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';
        bubble.appendChild(executeBtn);
        bubble.appendChild(abortBtn);

        actionsDiv.appendChild(bubble);

        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!messagesContainer) return;

        messagesContainer.appendChild(actionsDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    showChoices(intent) {
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!messagesContainer) return;

        const choicesDiv = document.createElement('div');
        choicesDiv.className = 'ai-message system';

        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';
        bubble.style.display = 'flex';
        bubble.style.flexWrap = 'wrap';
        bubble.style.gap = '6px';
        bubble.style.padding = '10px';

        intent.choices.forEach((choice) => {
            const btn = document.createElement('button');
            btn.className = 'xp-button';
            btn.style.fontSize = '13px';
            btn.style.padding = '6px 14px';
            btn.style.cursor = 'pointer';
            btn.textContent = choice.label;
            btn.onclick = async () => {
                // Disable all choice buttons
                bubble.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
                btn.style.opacity = '1';
                btn.style.border = '2px solid #ffd700';

                this.addMessage('user', choice.label);
                this.addMessage('system', `>> GENERATING ${choice.label.toUpperCase()}...`);
                this.setAvatarState('working');

                try {
                    await this.assistant._dispatchIntent(intent, choice.params);
                } catch (e) {
                    this.addMessage('error', `>> ERROR: ${e.message}`);
                    this.setAvatarState('error');
                }
            };
            bubble.appendChild(btn);
        });

        choicesDiv.appendChild(bubble);
        messagesContainer.appendChild(choicesDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async executeAction(action) {
        this.addMessage('system', '>> EXECUTING...');

        try {
            const toolFn = this.assistant?.editorTools?.[action.type]
                || (action.type === 'open' ? this.assistant?.editorTools?.openFile : null);
            if (typeof toolFn !== 'function') {
                throw new Error(`Unknown editor action: ${action.type}`);
            }
            const response = await toolFn(
                ...Object.values(action.params || {})
            );

            if (response && typeof response.then === 'function') {
                throw new Error('editor tool returned a Promise instead of a value');
            }

            if (response?.success === false) {
                this.addMessage('error', `>> FAILED: ${response.reason || response.error?.message || 'Unknown error'}`);
                return;
            }

            this.addMessage('system', '>> ACTION COMPLETED SUCCESSFULLY.');
        } catch (error) {
            this.addMessage('error', `>> RUNTIME ERROR: ${error.message}`);
        }
    }

    async analyzeAndFixError(error) {
        this.addMessage('system', `>> INITIATING DIAGNOSTIC ON: ${error.type.toUpperCase()}...`);
        this.setAvatarState('working');
        
        const prompt = `I am getting this error: "${error.message}" in ${error.source} at line ${error.line}. 
Full details: ${JSON.stringify(error)}. 
Please analyze why this is happening and suggest a fix. If it's in a script I can edit, please provide the corrected code.`;

        // We use the standard sendMessage flow but with a specialized prompt
        const input = document.getElementById('ai-chat-input');
        if (input) input.value = prompt;
        this.sendMessage();
    }

    startTutorial(tutorial) {
        this.currentTutorial = tutorial;
        this.tutorialStep = 0;
        this.showTutorialStep();
    }

    showTutorialStep() {
        // Tutorial overlay logic here (simplified for now)
        if (!this.currentTutorial) return;
        const step = this.currentTutorial.steps[this.tutorialStep];
        this.addMessage('system', `>> TUTORIAL STEP ${this.tutorialStep + 1}: ${step.instruction}`);
    }

    async reindexCodebase() {
        this.addMessage('system', '>> INITIATING FULL CODEBASE SCAN...');
        this.playSound('typing');
        try {
            const ai = window.RedglitchAIInstance || window.parent?.RedglitchAIInstance;
            if (!ai?.rebuildContextIndex) throw new Error('AI context index is unavailable.');
            await ai.rebuildContextIndex();
            this.addMessage('system', '>> RAG_INDEXER: ENGINE DOCS REBUILT. ACTIVE PROJECT CONTEXT REFRESHES ON EVERY QUERY.');
        } catch (e) {
            this.addMessage('error', `>> RAG_ERROR: ${e.message}`);
        }
    }

    clearHistory() {
        if (confirm(">> WARNING: WIPE NEURAL BUFFER? (CANNOT BE UNDONE)")) {
            const messages = document.getElementById('ai-chat-messages');
            if (messages) messages.innerHTML = '';
            const ai = window.RedglitchAIInstance || window.parent?.RedglitchAIInstance;
            if (ai?.clearHistory) ai.clearHistory();
            this.addMessage('system', '>> MEMORY_WIPE_COMPLETE.');
            this.playSound('nudge');
        }
    }
}

// Settings Controller
class KaiSettingsController {
    constructor() {
        this.settings = this.loadSettings();
    }

    loadSettings() {
        const defaults = {
            aiEnabled: isAIModeOn(getStoredKaiMode()),
            provider: 'openrouter',
            temp: 0.7,
            topP: 0.9,
            maxTokens: 1024,
            contextWindow: 128000,
            quantization: 'q4f16',
            ragEnabled: false,
            historyLimit: 6,
            crtEnabled: true,
            soundsEnabled: true,
            glowEnabled: true,
            fontSize: 'medium',
            openrouterKey: '',
            openrouterModel: 'anthropic/claude-3.7-sonnet',
            openrouterBaseUrl: 'https://openrouter.ai/api/v1',
            googleAiStudioKey: '',
            googleAiStudioModel: 'gemini-2.0-flash',
            googleAiStudioBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
            'google-ai-studioKey': '',
            'google-ai-studioModel': 'gemini-2.0-flash',
            'google-ai-studioBaseUrl': 'https://generativelanguage.googleapis.com/v1beta/openai',
            openaiKey: '',
            openaiModel: 'gpt-4o-mini',
            openaiBaseUrl: 'https://api.openai.com/v1',
            anthropicKey: '',
            anthropicModel: 'claude-3-7-sonnet-20250219',
            anthropicBaseUrl: 'https://api.anthropic.com/v1',
            geminiKey: '',
            geminiModel: 'gemini-2.0-flash',
            geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
            groqKey: '',
            groqModel: 'llama-3.3-70b-versatile',
            groqBaseUrl: 'https://api.groq.com/openai/v1',
            deepseekKey: '',
            deepseekModel: 'deepseek-chat',
            deepseekBaseUrl: 'https://api.deepseek.com/v1',
            mistralKey: '',
            mistralModel: 'codestral-latest',
            mistralBaseUrl: 'https://api.mistral.ai/v1',
            ollamaModel: 'llama3.3',
            ollamaBaseUrl: 'http://127.0.0.1:11434/v1',
            customKey: '',
            customModel: 'default',
            customBaseUrl: 'http://127.0.0.1:1234/v1',
            embeddingsProvider: 'openai',
            embeddingsBaseUrl: 'https://api.openai.com/v1',
            embeddingsApiKey: '',
            embeddingsModel: 'text-embedding-3-small'
        };
        const saved = localStorage.getItem('kai_settings');
        if (saved) {
            try {
                return { ...defaults, ...JSON.parse(saved) };
            } catch (e) {
                console.error("Kai: Failed to parse settings", e);
            }
        }
        return defaults;
    }

    applyToUI() {
        const s = this.settings;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') el.checked = !!val;
                else el.value = val !== undefined && val !== null ? val : '';
                
                // Update sibling value displays (for sliders)
                const valDisp = document.getElementById('val-' + id.replace('setting-', ''));
                if (valDisp) valDisp.textContent = val;
            }
        };

        setVal('setting-provider', s.provider || 'openrouter');
        setVal('setting-ai-enabled', isAIModeOn(getStoredKaiMode()));
        setVal('setting-temp', s.temp);
        setVal('setting-top-p', s.topP);
        setVal('setting-max-tokens', s.maxTokens);
        setVal('setting-context-window', s.contextWindow);
        setVal('setting-quantization', s.quantization);
        setVal('setting-rag', s.ragEnabled);
        setVal('setting-history-limit', s.historyLimit);
        setVal('setting-crt', s.crtEnabled);
        setVal('setting-sounds', s.soundsEnabled);
        setVal('setting-glow', s.glowEnabled);
        setVal('setting-font-size', s.fontSize);
        setVal('setting-embeddings-provider', s.embeddingsProvider);
        setVal('setting-embeddings-base-url', s.embeddingsBaseUrl);
        setVal('setting-embeddings-api-key', s.embeddingsApiKey);
        setVal('setting-embeddings-model', s.embeddingsModel);

        this.onProviderChange(s.provider || 'openrouter', true);
    }

    onProviderChange(providerId, isInitial = false) {
        if (!isInitial && providerId !== 'native') {
            const parentWin = window.parent || window;
            if (parentWin.destroyIrabBridge) {
                parentWin.destroyIrabBridge();
            }
        }

        const presets = window.PROVIDER_PRESETS || {};
        const preset = presets[providerId] || presets.openrouter || {
            name: providerId,
            tagline: 'Custom provider',
            baseUrl: '',
            defaultModel: '',
            requiresKey: true,
            models: []
        };

        const descEl = document.getElementById('provider-description');
        if (descEl) descEl.textContent = preset.tagline || preset.name;

        const titleEl = document.getElementById('provider-config-title');
        if (titleEl) titleEl.textContent = `${(preset.name || providerId).toUpperCase()} CONFIGURATION`;

        // Update API Key field
        const keyProp = `${providerId}Key`;
        const camelCaseProvider = providerId.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const camelKeyProp = `${camelCaseProvider}Key`;
        const isGoogleFamily = providerId === 'google-ai-studio' || providerId === 'gemini';
        const keyVal = this.settings[keyProp] ||
                       this.settings[camelKeyProp] ||
                       (isGoogleFamily ? (this.settings.googleAiStudioKey || this.settings['google-ai-studioKey'] || this.settings.geminiKey) : '') ||
                       (providerId === 'openrouter' ? this.settings.openrouterKey : '') || '';
        const keyInput = document.getElementById('setting-api-key');
        if (keyInput) {
            keyInput.value = keyVal;
            keyInput.placeholder = preset.keyPlaceholder || 'Enter API key...';
        }

        const keyRow = document.getElementById('row-api-key');
        if (keyRow) {
            keyRow.style.display = providerId === 'native' ? 'none' : 'flex';
        }

        // Update Base URL field
        const baseProp = `${providerId}BaseUrl`;
        const camelBaseProp = `${camelCaseProvider}BaseUrl`;
        const baseVal = this.settings[baseProp] ||
                        this.settings[camelBaseProp] ||
                        (isGoogleFamily ? (this.settings.googleAiStudioBaseUrl || this.settings['google-ai-studioBaseUrl'] || this.settings.geminiBaseUrl) : '') ||
                        preset.baseUrl || '';
        const baseInput = document.getElementById('setting-base-url');
        if (baseInput) {
            baseInput.value = baseVal;
            baseInput.placeholder = preset.baseUrl || 'https://...';
        }

        const baseRow = document.getElementById('row-base-url');
        if (baseRow) {
            baseRow.style.display = providerId === 'native' ? 'none' : 'flex';
        }

        // Update Model ID field
        const modelProp = `${providerId}Model`;
        const camelModelProp = `${camelCaseProvider}Model`;
        const modelVal = this.settings[modelProp] ||
                         this.settings[camelModelProp] ||
                         (isGoogleFamily ? (this.settings.googleAiStudioModel || this.settings['google-ai-studioModel'] || this.settings.geminiModel) : '') ||
                         preset.defaultModel || '';
        const modelInput = document.getElementById('setting-model-id');
        if (modelInput) {
            modelInput.value = modelVal;
            modelInput.placeholder = preset.defaultModel || 'Enter model ID...';
        }

        // Populate presets select and datalist
        const selectPreset = document.getElementById('setting-quick-model');
        const datalist = document.getElementById('ai-models-datalist');
        if (selectPreset) selectPreset.innerHTML = '<option value="">-- Quick Select Preset --</option>';
        if (datalist) datalist.innerHTML = '';

        (preset.models || []).forEach(m => {
            if (selectPreset) {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = `${m.name}${m.tag ? ' [' + m.tag + ']' : ''}`;
                selectPreset.appendChild(opt);
            }
            if (datalist) {
                const dOpt = document.createElement('option');
                dOpt.value = m.id;
                datalist.appendChild(dOpt);
            }
        });

        // Hide test status on provider change
        const statusEl = document.getElementById('connection-test-status');
        if (statusEl) statusEl.style.display = 'none';

        if (!isInitial) {
            this.settings.provider = providerId;
            this.saveSettings();
            window.AIChatUI?.updateChatMeta();
        }
    }

    selectPresetModel(modelId) {
        if (!modelId) return;
        const input = document.getElementById('setting-model-id');
        if (input) {
            input.value = modelId;
            const provider = document.getElementById('setting-provider')?.value || this.settings.provider;
            this.settings[`${provider}Model`] = modelId;
            this.saveSettings();
        }
    }

    toggleKeyVisibility() {
        const input = document.getElementById('setting-api-key');
        const btn = document.getElementById('btn-toggle-key');
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            if (btn) btn.textContent = 'HIDE';
        } else {
            input.type = 'password';
            if (btn) btn.textContent = 'SHOW';
        }
    }

    async refreshModelCatalog() {
        const provider = document.getElementById('setting-provider')?.value || this.settings.provider || 'openrouter';
        const apiKey = document.getElementById('setting-api-key')?.value || '';
        const baseUrl = document.getElementById('setting-base-url')?.value || '';

        const statusEl = document.getElementById('connection-test-status');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = '#222';
            statusEl.style.color = '#ffcc00';
            statusEl.textContent = '>> Fetching model catalog...';
        }

        try {
            const { MultiProviderAdapter } = await import('../openrouter-adapter.js');
            const adapter = new MultiProviderAdapter({ provider, apiKey, baseUrl });
            const models = await adapter.listModels();

            const datalist = document.getElementById('ai-models-datalist');
            const selectPreset = document.getElementById('setting-quick-model');
            if (datalist) datalist.innerHTML = '';
            if (selectPreset) selectPreset.innerHTML = '<option value="">-- Quick Select Preset --</option>';

            models.forEach(m => {
                if (datalist) {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    datalist.appendChild(opt);
                }
                if (selectPreset) {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = `${m.name || m.id}${m.tag ? ' [' + m.tag + ']' : ''}`;
                    selectPreset.appendChild(opt);
                }
            });

            if (statusEl) {
                statusEl.style.background = '#0a3311';
                statusEl.style.color = '#44ff44';
                statusEl.textContent = `✓ Loaded ${models.length} models for ${provider.toUpperCase()}`;
            }
            window.KAI?.showBalloon?.(`Loaded ${models.length} models for ${provider}.`);
        } catch (err) {
            if (statusEl) {
                statusEl.style.background = '#331111';
                statusEl.style.color = '#ff4444';
                statusEl.textContent = `✗ Failed to fetch models: ${err?.message || err}`;
            }
        }
    }

    async testCurrentConnection() {
        const provider = document.getElementById('setting-provider')?.value || this.settings.provider || 'openrouter';
        const apiKey = document.getElementById('setting-api-key')?.value || '';
        const baseUrl = document.getElementById('setting-base-url')?.value || '';
        const model = document.getElementById('setting-model-id')?.value || '';

        const statusEl = document.getElementById('connection-test-status');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.background = '#222';
            statusEl.style.color = '#ffcc00';
            statusEl.textContent = `>> Testing connection to ${provider.toUpperCase()} (${model || 'default'})...`;
        }

        try {
            const { MultiProviderAdapter } = await import('../openrouter-adapter.js');
            const adapter = new MultiProviderAdapter({ provider, apiKey, baseUrl, model });
            const probe = await adapter.testConnection();

            if (statusEl) {
                statusEl.style.background = '#0a3311';
                statusEl.style.color = '#44ff44';
                statusEl.textContent = `✓ Success! Connected in ${probe.latencyMs}ms. Model: ${probe.model}`;
            }
            window.KAI?.showBalloon?.(`✓ ${provider} connected in ${probe.latencyMs}ms.`);
        } catch (err) {
            if (statusEl) {
                statusEl.style.background = '#331111';
                statusEl.style.color = '#ff4444';
                statusEl.textContent = `✗ Connection failed: ${err?.message || err}`;
            }
            window.KAI?.showBalloon?.(`✗ ${provider} connection failed: ${err?.message || err}`);
        }
    }

    saveSettings() {
        localStorage.setItem('kai_settings', JSON.stringify(this.settings));
        
        // Push to global AI_CONFIG if available
        const ai = window.RedglitchAIInstance || window.parent?.RedglitchAIInstance;
        if (ai && ai.config) {
            const cfg = ai.config;
            cfg.models.llm.temperature = parseFloat(this.settings.temp);
            cfg.models.llm.topP = parseFloat(this.settings.topP);
            cfg.models.llm.maxNewTokens = parseInt(this.settings.maxTokens);
            cfg.limits.contextWindow = parseInt(this.settings.contextWindow);
            cfg.limits.maxHistoryMessages = parseInt(this.settings.historyLimit);
            cfg.features.enableRAG = !!this.settings.ragEnabled;
        }
    }

    switchTab(tabId, el) {
        // Update tabs
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        el.classList.add('active');

        // Update panes
        document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
        const target = document.getElementById('pane-' + tabId);
        if (target) target.classList.add('active');
        
        if (window.AIChatUI) window.AIChatUI.playSound('typing');
    }

    toggle() {
        if (window.AIChatUI) {
            if (window.AIChatUI.currentWorkspace === 'config') {
                window.AIChatUI.switchWorkspace(window.AIChatUI.previousWorkspace || 'chat');
            } else {
                window.AIChatUI.switchWorkspace('config');
            }
            return;
        }
        const panel = document.getElementById('xp-settings');
        if (panel) {
            const isShowing = panel.classList.toggle('show');
            if (isShowing) {
                this.applyToUI();
                if (window.AIChatUI) window.AIChatUI.playSound('online');
            }
        }
    }

    save() {
        const getVal = (id) => {
            const el = document.getElementById(id);
            if (!el) return null;
            return el.type === 'checkbox' ? el.checked : el.value;
        };

        const activeProvider = getVal('setting-provider') || this.settings.provider || 'openrouter';
        const apiKey = getVal('setting-api-key') || '';
        const baseUrl = getVal('setting-base-url') || '';
        const modelId = getVal('setting-model-id') || '';

        this.settings = {
            ...this.settings,
            aiEnabled: getVal('setting-ai-enabled'),
            provider: activeProvider,
            temp: parseFloat(getVal('setting-temp')),
            topP: parseFloat(getVal('setting-top-p')),
            maxTokens: parseInt(getVal('setting-max-tokens')),
            contextWindow: parseInt(getVal('setting-context-window')),
            quantization: getVal('setting-quantization'),
            ragEnabled: getVal('setting-rag'),
            historyLimit: parseInt(getVal('setting-history-limit')),
            crtEnabled: getVal('setting-crt'),
            soundsEnabled: getVal('setting-sounds'),
            glowEnabled: getVal('setting-glow'),
            fontSize: getVal('setting-font-size') || 'medium',
            embeddingsProvider: getVal('setting-embeddings-provider') || 'local',
            embeddingsBaseUrl: getVal('setting-embeddings-base-url') || 'https://api.openai.com/v1',
            embeddingsApiKey: getVal('setting-embeddings-api-key') || '',
            embeddingsModel: getVal('setting-embeddings-model') || 'text-embedding-3-small',
            // Store provider-specific config
            [`${activeProvider}Key`]: apiKey,
            [`${activeProvider}BaseUrl`]: baseUrl,
            [`${activeProvider}Model`]: modelId,
        };

        if (activeProvider === 'openrouter') {
            this.settings.openrouterKey = apiKey;
            this.settings.openrouterModel = modelId;
            this.settings.openrouterBaseUrl = baseUrl;
        }

        if (activeProvider === 'google-ai-studio' || activeProvider === 'gemini') {
            this.settings.googleAiStudioKey = apiKey;
            this.settings['google-ai-studioKey'] = apiKey;
            this.settings.geminiKey = apiKey;
            this.settings.googleAiStudioModel = modelId;
            this.settings['google-ai-studioModel'] = modelId;
            this.settings.geminiModel = modelId;
            this.settings.googleAiStudioBaseUrl = baseUrl;
            this.settings['google-ai-studioBaseUrl'] = baseUrl;
            this.settings.geminiBaseUrl = baseUrl;
        }

        this.saveSettings();
        // Persist AI on/off from settings checkbox (Easy/Full chosen via mode dialog/toggle)
        window.setKaiMode?.(this.settings.aiEnabled ? (getStoredKaiMode() === 'easy' ? 'easy' : 'full') : 'off');
        window.AIChatUI?.updateChatMeta();

        const irab = window.irab || (window.parent && window.parent.irab);
        if (irab && irab.socket) {
            try {
                irab.socket.send(JSON.stringify({ 
                    type: 'UPDATE_CONFIG', 
                    data: { 
                        context_window: this.settings.contextWindow,
                        max_tokens: this.settings.maxTokens,
                        temperature: this.settings.temp 
                    } 
                }));
            } catch(e) {}
        }
        
        if (window.AIChatUI) {
            window.AIChatUI.toggleSounds(this.settings.soundsEnabled);
            window.AIChatUI.addMessage('system', '>> KERNEL CONFIGURATION UPDATED.');
            
            // Visual effects
            const panel = document.getElementById('ai-chat-panel');
            if (panel) {
                panel.style.filter = this.settings.crtEnabled ? 'contrast(1.1) brightness(1.1)' : 'none';
                if (this.settings.glowEnabled) panel.style.boxShadow = '0 0 30px rgba(255, 215, 0, 0.4)';
                else panel.style.boxShadow = 'none';
            }
            document.body.setAttribute('data-kai-size', this.settings.fontSize || 'medium');
        }
        
        this.toggle();
    }
}

// Global instances
window.AIChatUI = new KaiChatUIController();
window.AISettings = new KaiSettingsController();

// Apply saved font size on load
(function applySavedSize() {
    const s = window.AISettings.settings;
    document.body.setAttribute('data-kai-size', s.fontSize || 'medium');
})();

// Compatibility aliases
window.openChat = () => window.AIChatUI.openChat();
window.closeChat = () => window.AIChatUI.closeChat();
window.dismiss = () => window.AIChatUI.dismiss();
window.updateAIProgress = (data) => window.AIChatUI.updateLoadingProgress(data);

function getStoredKaiMode() {
    if (window.KAIMode) return window.KAIMode.getAIMode();
    const value = localStorage.getItem('kai_ai_enabled');
    return value === 'true' ? true : value === 'easy' ? 'easy' : value === 'false' ? false : null;
}

function isAIModeOn(mode) {
    return mode === true || mode === 'easy';
}

function applyKaiModeUI(mode) {
    const enabled = isAIModeOn(mode);
    const toggle = document.getElementById('kai-mode-toggle');
    const assistant = document.getElementById('ai-assistant-container');
    const chat = document.getElementById('ai-chat-panel');
    const omni = document.getElementById('xp-omni-box');
    if (toggle) {
        toggle.textContent = mode === 'easy' ? 'AI: EASY' : (enabled ? 'AI: ON' : 'AI: OFF');
        toggle.classList.toggle('off', !enabled);
    }
    if (assistant) assistant.style.display = enabled ? '' : 'none';
    if (!enabled) {
        chat?.classList.remove('show');
        omni?.classList.remove('show');
    }
    const frame = window.frameElement;
    if (frame && !enabled) {
        frame.style.width = '130px';
        frame.style.height = '104px';
        frame.style.left = 'auto';
        frame.style.right = '0';
        frame.style.pointerEvents = 'auto';
    } else if (frame) {
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.left = '0';
        frame.style.right = 'auto';
        setTimeout(() => { frame.style.pointerEvents = 'none'; }, 50);
    }

    // Note: the parent toolbar button (#parent-kai-mode-toggle in tools.html) owns its own
    // off/connecting/online/thinking/offline state machine driven by the IrabBridge directly
    // (see tools.html's setupAIKillswitch). We intentionally don't touch its DOM from here
    // anymore -- doing so used to clobber that state machine's classes/markup on every toggle.
}

function showKaiModeChoice() {
    const frame = window.frameElement;
    if (frame) {
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.left = '0';
        frame.style.right = 'auto';
        frame.style.pointerEvents = 'auto';
    }
    document.getElementById('kai-mode-choice')?.classList.add('show');
}

window.setKaiMode = async (mode) => {
    // Accept 'full' (true), 'easy', or 'off' (false)
    if (mode === 'full' || mode === true) mode = true;
    else if (mode === 'easy') mode = 'easy';
    else if (mode === 'off' || mode === false) mode = false;
    else throw new Error(`Invalid AI mode: ${mode}`);

    if (window.KAIMode) window.KAIMode.storeAIMode(mode);
    else localStorage.setItem('kai_ai_enabled', mode === true ? 'true' : mode === 'easy' ? 'easy' : 'false');
    document.getElementById('kai-mode-choice')?.classList.remove('show');
    applyKaiModeUI(mode);

    const hasParentHub = window.parent && window.parent !== window;
    let ai = (hasParentHub ? window.parent.RedglitchAIInstance : null) || window.RedglitchAIInstance;
    if (isAIModeOn(mode)) {
        // Local AI is not forced: only ensure native bridge if native provider is explicitly configured
        const parentWin = window.parent || window;
        const currentProvider = window.AISettings?.settings?.provider || 'openrouter';
        if (currentProvider === 'native' && parentWin.ensureIrabBridge) {
            parentWin.ensureIrabBridge();
        } else if (parentWin.destroyIrabBridge) {
            parentWin.destroyIrabBridge();
        }

        const { RedglitchAI } = await import('../redglitch-ai.js');
        ai = (hasParentHub ? window.parent.RedglitchAIInstance : null) || window.RedglitchAIInstance || ai;
        if (!ai) {
            ai = new RedglitchAI();
        }
        window.RedglitchAIInstance = ai;
        if (hasParentHub) {
            try { window.parent.RedglitchAIInstance = ai; } catch (_) {}
        }
        window.AIChatUI.assistant = new IRABAssistantSimple();
        await window.AIChatUI.initialize();
        await ai.setEnabled(true);
    } else {
        // Shut down everything
        if (ai?.setEnabled) {
            await ai.setEnabled(false);
        }
        const parentWin = window.parent || window;
        if (parentWin.destroyIrabBridge) {
            parentWin.destroyIrabBridge();
        }
        // Kill any local AI instance and keep parent unified
        window.RedglitchAIInstance = null;
        if (hasParentHub && window.parent.RedglitchAIInstance === ai) {
            try { window.parent.RedglitchAIInstance = null; } catch (_) {}
        }
    }
    if (hasParentHub) {
        try { window.parent.KAI?.syncStatus?.(); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('kai:mode-change', { detail: { mode, enabled: isAIModeOn(mode) } }));
    return mode;
};

window.chooseKaiMode = (mode) => window.setKaiMode(mode).catch((error) => {
    console.error('Kai mode change failed:', error);
    window.AIChatUI?.addMessage('error', `>> AI MODE ERROR: ${error.message}`);
});

window.toggleKaiMode = () => {
    const current = getStoredKaiMode();
    // Cycle: off -> easy -> full -> off
    if (current === false || current === null) window.chooseKaiMode('easy');
    else if (current === 'easy') window.chooseKaiMode(true);
    else window.chooseKaiMode(false);
};

async function bootstrapKaiMode() {
    let mode = getStoredKaiMode();
    if (mode === null) {
        showKaiModeChoice();
        return;
    }
    applyKaiModeUI(mode);
    if (isAIModeOn(mode)) await window.setKaiMode(mode);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrapKaiMode().catch(console.error));
} else {
    bootstrapKaiMode().catch(console.error);
}

window.copyLastKaiResponse = () => {
    const msgs = document.querySelectorAll('.ai-message.assistant .ai-message-bubble');
    const last = msgs[msgs.length - 1];
    if (!last) return;
    const text = last.textContent || last.innerText || '';
    navigator.clipboard.writeText(text.trim()).then(() => {
        if (window.AIChatUI) window.AIChatUI.addMessage('system', '>> LAST_RESPONSE_COPIED.');
    }).catch(() => {});
};

console.log('KAI UI LOADED.');
