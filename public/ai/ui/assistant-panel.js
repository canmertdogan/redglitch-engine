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
            }, 800);
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
            
            // --- DEEP BOOT: Hook into Native Cortex (Local Cluster) ---
            const irab = window.irab || (window.parent && window.parent.irab);
            if (irab) {
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
            const eventBus = window.KetebeEventBus || (window.parent && window.parent.KetebeEventBus);
            if (eventBus) {
                // Live Debug Logs
                eventBus.on('*', (eventData) => {
                    const stream = document.getElementById('debug-stream');
                    if (stream) {
                        const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
                        const line = document.createElement('div');
                        const event = eventData.type || 'unknown';
                        const data = eventData.data || {};
                        line.innerHTML = `[${time}] <span style="color: #ffd700">${event}</span>: ${JSON.stringify(data).substring(0, 100)}...`;
                        stream.appendChild(line);
                        stream.scrollTop = stream.scrollHeight;
                        if (stream.children.length > 50) stream.removeChild(stream.firstChild);
                    }
                });

                // PROACTIVE ERROR WATCHER
                eventBus.on('system:error', (event) => {
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
                });
            }

            this.isInitialized = true;
            this.setAvatarState('idle');
            console.log('Kai: Initialization Complete.');
        } catch (error) {
            console.error('Kai: Init Error:', error);
            this.isInitialized = true;
            throw error;
        }
    }

    addBootLog(message) {
        const logs = document.getElementById('boot-logs');
        if (logs) {
            const line = document.createElement('div');
            const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
            line.innerHTML = `<span style="color: #444;">[${time}]</span> >> ${message.toUpperCase()}`;
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

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                this.toggleChat();
            }
        });

        // Broadcast hit zones to parent for pointer-events passthrough
        setInterval(() => {
            const zones = [];
            const elements = [
                'ai-assistant-container', 
                'ai-chat-panel', 
                'xp-ai-loading', 
                'xp-settings', 
                'ai-speech-bubble'
            ];
            
            elements.forEach(id => {
                const el = document.getElementById(id);
                if (el && (el.style.display !== 'none' && !el.classList.contains('hidden') || el.classList.contains('show'))) {
                    // Check computed style for visibility
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                        const rect = el.getBoundingClientRect();
                        zones.push({
                            top: rect.top,
                            left: rect.left,
                            bottom: rect.bottom,
                            right: rect.right
                        });
                    }
                }
            });

            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'kai:hitzones', zones }, '*');
            }
        }, 100);
    }

    showSpeechBubble(text, actions = []) {
        const bubble = document.getElementById('ai-speech-bubble');
        const textEl = document.getElementById('ai-speech-text');
        const actionsEl = document.getElementById('ai-speech-actions');

        if (!bubble || !textEl) return;

        textEl.textContent = text;
        actionsEl.innerHTML = '';
        
        if (actions.length === 0) {
            actionsEl.innerHTML = `
                <button class="xp-button" onclick="AIChatUI.openChat()">ACCESS</button>
                <button class="xp-button secondary" onclick="AIChatUI.dismiss()">DISMISS</button>
            `;
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

    openChat() {
        const panel = document.getElementById('ai-chat-panel');
        if (panel) {
            panel.classList.add('show');
            this.dismiss();
            this.playSound('online');
            
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

        if (!this.assistant || !this.isInitialized) {
            this.playSound('error');
            this.addMessage('error', ">> SYSTEM BUSY. LOADING MODULES...");
            if (!this.isInitialized) {
                this.initialize().catch(err => console.error('Kai: Init Failed', err));
            }
            return;
        }

        const statusDot = document.querySelector('.xp-status-dot');
        const statusText = document.getElementById('xp-status-text');
        if (statusDot) statusDot.classList.add('thinking');
        if (statusText) statusText.textContent = 'PROCESSING...';
        
        this.setAvatarState('working');
        this.playSound('typing');

        try {
            const response = await this.assistant.processQuery(query);

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
            }

        } catch (error) {
            if (statusDot) statusDot.classList.remove('thinking');
            if (statusText) statusText.textContent = 'ERROR';
            this.setAvatarState('error');
            this.playSound('error');
            this.addMessage('error', `>> EXCEPTION: ${error.message}`);
        }
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
                suggestedFiles.add(filePath);
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
        const nameName = document.createElement('span');
        nameName.className = 'ai-message-name';
        nameName.textContent = type === 'user' ? 'USER' : 
                               type === 'assistant' ? 'KAI' :
                               type === 'system' ? 'SYSTEM' : 'ERROR';
        
        nameBar.appendChild(nameName);
        content.appendChild(nameBar);

        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';
        
        // Clean up the text (hide the RAG headers for a cleaner UI, but keep for logic)
        const cleanText = text.replace(/--- FILE: .*? ---/g, '').trim();
        bubble.textContent = cleanText;

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
                btn.innerHTML = `📂 OPEN ${path.split('/').pop()}`;
                btn.onclick = () => {
                    const eventBus = window.KetebeEventBus || (window.parent && window.parent.KetebeEventBus);
                    if (eventBus) {
                        eventBus.emit('ai:command:request', {
                            method: path.includes('world') ? 'iso_studio.open' : 'open',
                            params: { path: path }
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
        const actionsHTML = `
            <button class="xp-button" onclick="AIChatUI.executeAction(${JSON.stringify(action)})">
                [EXECUTE]
            </button>
            <button class="xp-button secondary" onclick="AIChatUI.addMessage('system', '>> ABORTED.')">
                [ABORT]
            </button>
        `;
        
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!messagesContainer) return;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'ai-message system';
        actionsDiv.innerHTML = `<div class="ai-message-bubble">${actionsHTML}</div>`;
        messagesContainer.appendChild(actionsDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async executeAction(action) {
        this.addMessage('system', '>> EXECUTING...');

        try {
            const result = await this.assistant.editorTools[action.type](
                ...Object.values(action.params)
            );

            if (result.success) {
                this.addMessage('system', '>> ACTION COMPLETED SUCCESSFULLY.');
            } else {
                this.addMessage('error', `>> FAILED: ${result.reason}`);
            }
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
            const res = await fetch('/api/ai/rag/reindex');
            const data = await res.json();
            if (data.success) {
                this.addMessage('system', '>> RAG_INDEXER: BACKGROUND SCAN STARTED.');
            } else {
                this.addMessage('error', `>> RAG_ERROR: ${data.error}`);
            }
        } catch (e) {
            this.addMessage('error', '>> RAG_ERROR: CLUSTER UNREACHABLE.');
        }
    }

    clearHistory() {
        if (confirm(">> WARNING: WIPE NEURAL BUFFER? (CANNOT BE UNDONE)")) {
            const messages = document.getElementById('ai-chat-messages');
            if (messages) messages.innerHTML = '';
            if (window.KetebeAIInstance) window.KetebeAIInstance.clearHistory();
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
        const saved = localStorage.getItem('kai_settings');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Kai: Failed to parse settings", e);
            }
        }
        return {
            provider: 'native',
            temp: 0.7,
            topP: 0.9,
            maxTokens: 512,
            contextWindow: 2048,
            quantization: 'q4f16',
            ragEnabled: true,
            historyLimit: 6,
            crtEnabled: true,
            soundsEnabled: true,
            glowEnabled: true
        };
    }

    applyToUI() {
        const s = this.settings;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') el.checked = !!val;
                else el.value = val;
                
                // Update sibling value displays (for sliders)
                const valDisp = document.getElementById('val-' + id.replace('setting-', ''));
                if (valDisp) valDisp.textContent = val;
            }
        };

        setVal('setting-provider', s.provider);
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
    }

    saveSettings() {
        localStorage.setItem('kai_settings', JSON.stringify(this.settings));
        
        // Push to global AI_CONFIG if available
        if (window.KetebeAIInstance && window.KetebeAIInstance.config) {
            const cfg = window.KetebeAIInstance.config;
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

        this.settings = {
            provider: getVal('setting-provider'),
            temp: parseFloat(getVal('setting-temp')),
            topP: parseFloat(getVal('setting-top-p')),
            maxTokens: parseInt(getVal('setting-max-tokens')),
            contextWindow: parseInt(getVal('setting-context-window')),
            quantization: getVal('setting-quantization'),
            ragEnabled: getVal('setting-rag'),
            historyLimit: parseInt(getVal('setting-history-limit')),
            crtEnabled: getVal('setting-crt'),
            soundsEnabled: getVal('setting-sounds'),
            glowEnabled: getVal('setting-glow')
        };

        this.saveSettings();
        
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
        }
        
        this.toggle();
    }
}

// Global instances
window.AIChatUI = new KaiChatUIController();
window.AISettings = new KaiSettingsController();

// Compatibility aliases
window.openChat = () => window.AIChatUI.openChat();
window.closeChat = () => window.AIChatUI.closeChat();
window.dismiss = () => window.AIChatUI.dismiss();
window.updateAIProgress = (data) => window.AIChatUI.updateLoadingProgress(data);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.AIChatUI.initialize().catch(console.error));
} else {
    window.AIChatUI.initialize().catch(console.error);
}

console.log('KAI UI LOADED.');
