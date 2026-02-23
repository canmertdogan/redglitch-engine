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
        const { percent, status, loaded, total } = data;
        
        if (!this.loadingShown) this.showLoadingProgress();
        
        const fill = document.getElementById('xp-progress-fill');
        const percentText = document.getElementById('xp-progress-percent');
        const sizeText = document.getElementById('xp-progress-size');
        const statusText = document.getElementById('xp-loading-status');
        const detailsText = document.getElementById('xp-loading-details');
        
        if (fill) fill.style.width = `${percent}%`;
        if (percentText) percentText.textContent = `${percent}%`;
        
        if (loaded && total && sizeText) {
            const loadedMB = (loaded / 1024 / 1024).toFixed(1);
            const totalMB = (total / 1024 / 1024).toFixed(1);
            sizeText.textContent = `[${loadedMB}/${totalMB} MB]`;
        }
        
        if (statusText) {
            const statusMessages = {
                'initializing': 'BOOTING KERNEL...',
                'downloading': 'DOWNLOADING NEURAL MATRIX...',
                'loading': 'LOADING INTO MEMORY...',
                'ready': 'SYSTEM ONLINE'
            };
            statusText.textContent = statusMessages[status] || status.toUpperCase();
        }
        
        if (detailsText) {
            if (status === 'downloading') detailsText.textContent = '>> ESTABLISHING SECURE DATALINK...';
            else if (status === 'loading') detailsText.textContent = '>> PARSING SYNTAX TREES...';
            else if (status === 'ready') detailsText.textContent = '>> READY FOR INPUT.';
        }
        
        if (percent >= 100 || status === 'ready') {
            this.hideLoadingProgress();
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

    async initialize() {
        if (this.isInitialized) return;
        console.log('Kai: Initializing System...');

        try {
            // Bind to window early for hit detection bridge
            window.AIChatUI = this;

            this.assistant = new IRABAssistantSimple();
            
            if (this.assistant.setProgressCallback) {
                this.assistant.setProgressCallback((data) => this.updateLoadingProgress(data));
            }
            
            this.setupEventListeners();
            this.isInitialized = true;

            console.log('Kai: Initialization Complete.');
            
            // Override personality name if needed
            if (this.assistant.personality) {
                this.assistant.personality.name = "Kai";
            }

            this.showSpeechBubble(
                this.assistant.personality ? 
                this.assistant.personality.getRandomGreeting() : 
                ">> SYSTEM ONLINE. READY."
            );
        } catch (error) {
            console.error('Kai: Init Error:', error);
            this.isInitialized = true;
            throw error;
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
        
        this.playSound('typing');

        try {
            const response = await this.assistant.processQuery(query);

            if (statusDot) statusDot.classList.remove('thinking');
            if (statusText) statusText.textContent = 'ONLINE';

            this.addMessage('assistant', response.text);
            this.playSound('messageReceived');

            if (response.type === 'tutorial' && response.tutorial) {
                this.startTutorial(response.tutorial);
            } else if (response.type === 'confirmation' && response.pendingAction) {
                this.showActionConfirmation(response.pendingAction);
            }

        } catch (error) {
            if (statusDot) statusDot.classList.remove('thinking');
            if (statusText) statusText.textContent = 'ERROR';
            this.playSound('error');
            this.addMessage('error', `>> EXCEPTION: ${error.message}`);
        }
    }

    addMessage(type, text) {
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!messagesContainer) return;

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
        bubble.textContent = text;

        content.appendChild(bubble);
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
}

// Global instance
window.AIChatUI = new KaiChatUIController();
// Compatibility aliases
window.openChat = () => window.AIChatUI.openChat();
window.closeChat = () => window.AIChatUI.closeChat();
window.dismiss = () => window.AIChatUI.dismiss();
window.updateAIProgress = (data) => window.AIChatUI.updateLoadingProgress(data);

// Settings Controller
class KaiSettingsController {
    constructor() {
        this.settings = this.loadSettings();
    }

    loadSettings() {
        const saved = localStorage.getItem('kai_settings');
        if (saved) return JSON.parse(saved);
        return {
            provider: 'local',
            irabPersonality: true,
            soundsEnabled: true
        };
    }

    saveSettings() {
        localStorage.setItem('kai_settings', JSON.stringify(this.settings));
    }

    toggle() {
        const panel = document.getElementById('xp-settings');
        if (panel) panel.classList.toggle('show');
    }

    save() {
        this.settings.provider = document.getElementById('setting-provider')?.value || 'local';
        this.settings.irabPersonality = document.getElementById('setting-irab-personality')?.checked || false;
        this.settings.soundsEnabled = document.getElementById('setting-sounds')?.checked !== false;

        this.saveSettings();
        if (window.AIChatUI) {
            window.AIChatUI.toggleSounds(this.settings.soundsEnabled);
            window.AIChatUI.addMessage('system', '>> SETTINGS SAVED.');
        }
        this.toggle();
    }
}

window.AISettings = new KaiSettingsController();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.AIChatUI.initialize().catch(console.error));
} else {
    window.AIChatUI.initialize().catch(console.error);
}

console.log('KAI UI LOADED.');
