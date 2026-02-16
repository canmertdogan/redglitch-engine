/**
 * IRAB AI Assistant - UI Controller
 * Manages chat interface, Clippy mode, and tutorial overlays
 */

// Remove module import - load dependencies globally instead
// import { IRABAssistant } from '../ketebe-ai-assistant.js';

class IRABChatUIController {
    constructor() {
        this.assistant = null;
        this.isInitialized = false;
        this.currentTutorial = null;
        this.tutorialStep = 0;
        
        // AI Loading progress tracking
        this.loadingInProgress = false;
        this.loadingShown = false;
        
        // Sound system
        this.sounds = {
            messageReceived: new Audio('/ai/sounds/message-received.mp3'),
            messageSent: new Audio('/ai/sounds/message-sent.mp3'),
            online: new Audio('/ai/sounds/online.mp3'),
            nudge: new Audio('/ai/sounds/nudge.mp3'),
            error: new Audio('/ai/sounds/error.mp3'),
            typing: new Audio('/ai/sounds/typing.mp3')
        };
        
        // Set volume for all sounds
        Object.values(this.sounds).forEach(sound => {
            sound.volume = 0.5;
            // Suppress errors if sound files don't exist
            sound.addEventListener('error', () => {
                console.log('IRAB: Sound file not found (optional)');
            });
        });
        
        this.soundsEnabled = localStorage.getItem('irab_sounds_enabled') !== 'false';
    }
    
    showLoadingProgress() {
        const loading = document.getElementById('msn-ai-loading');
        if (loading && !this.loadingShown) {
            loading.style.display = 'flex';
            this.loadingShown = true;
            this.loadingInProgress = true;
        }
    }
    
    hideLoadingProgress() {
        const loading = document.getElementById('msn-ai-loading');
        if (loading) {
            setTimeout(() => {
                loading.style.display = 'none';
                this.loadingShown = false;
                this.loadingInProgress = false;
            }, 1000); // Keep visible for 1 second after completion
        }
    }
    
    updateLoadingProgress(data) {
        const { percent, status, loaded, total } = data;
        
        // Show loading UI if not visible
        if (!this.loadingShown) {
            this.showLoadingProgress();
        }
        
        // Update progress bar
        const fill = document.getElementById('msn-progress-fill');
        const percentText = document.getElementById('msn-progress-percent');
        const sizeText = document.getElementById('msn-progress-size');
        const statusText = document.getElementById('msn-loading-status');
        const detailsText = document.getElementById('msn-loading-details');
        
        if (fill) fill.style.width = `${percent}%`;
        if (percentText) percentText.textContent = `${percent}%`;
        
        // Format size text
        if (loaded && total && sizeText) {
            const loadedMB = (loaded / 1024 / 1024).toFixed(1);
            const totalMB = (total / 1024 / 1024).toFixed(1);
            sizeText.textContent = `${loadedMB} / ${totalMB} MB`;
        }
        
        // Update status text
        if (statusText) {
            const statusMessages = {
                'initializing': 'INITIALIZING AI BRAIN...',
                'downloading': 'DOWNLOADING AI MODEL...',
                'loading': 'LOADING INTO MEMORY...',
                'ready': 'AI READY!'
            };
            statusText.textContent = statusMessages[status] || status.toUpperCase();
        }
        
        if (detailsText) {
            if (status === 'downloading') {
                detailsText.textContent = 'GRRR... DOWNLOADING INTELLIGENCE FROM THE CLOUD';
            } else if (status === 'loading') {
                detailsText.textContent = 'COMPILING NEURAL PATHWAYS...';
            } else if (status === 'ready') {
                detailsText.textContent = 'IRAB IS NOW FULLY OPERATIONAL!';
            }
        }
        
        // Hide when complete
        if (percent >= 100 || status === 'ready') {
            this.hideLoadingProgress();
        }
    }
    
    playSound(soundName) {
        if (!this.soundsEnabled) return;
        
        const sound = this.sounds[soundName];
        if (sound) {
            // Reset and play
            sound.currentTime = 0;
            sound.play().catch(() => {
                // Silently fail if sound can't play
            });
        }
    }
    
    toggleSounds(enabled) {
        this.soundsEnabled = enabled;
        localStorage.setItem('irab_sounds_enabled', enabled);
    }

    async initialize() {
        if (this.isInitialized) return;

        console.log('IRAB: Starting initialization...');

        // Check if IRABAssistant is available globally
        if (typeof IRABAssistantSimple === 'undefined') {
            console.error('IRAB: IRABAssistantSimple class not loaded! Check if irab-assistant-simple.js is included.');
            this.isInitialized = true; // Mark as "initialized" to prevent retry loops
            return;
        }

        try {
            this.assistant = new IRABAssistantSimple();
            
            // Connect progress callback to UI (if supported)
            if (this.assistant.setProgressCallback) {
                this.assistant.setProgressCallback((progressData) => {
                    this.updateLoadingProgress(progressData);
                });
            }
            
            // Simple assistant doesn't need async initialization
            
            this.setupEventListeners();
            this.isInitialized = true;

            console.log('IRAB: Initialization complete!');

            // Show IRAB welcome message
            this.showSpeechBubble(
                this.assistant.personality ? 
                this.assistant.personality.getRandomGreeting() : 
                "GRRR... IRAB IS READY!"
            );
        } catch (error) {
            console.error('IRAB: Initialization error:', error);
            this.isInitialized = true; // Mark as done to prevent retry loops
            throw error;
        }
    }

    setupEventListeners() {
        // Enter key in chat input
        const chatInput = document.getElementById('ai-chat-input');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendMessage();
                }
            });
        }

        // Clippy click
        const clippy = document.getElementById('ai-clippy');
        if (clippy) {
            clippy.addEventListener('click', () => {
                this.openChat();
            });
        }

        // Global keyboard shortcut: Ctrl+Shift+A
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                this.toggleChat();
            }
        });
    }

    showSpeechBubble(text, actions = []) {
        const bubble = document.getElementById('ai-speech-bubble');
        const textEl = document.getElementById('ai-speech-text');
        const actionsEl = document.getElementById('ai-speech-actions');

        if (!bubble || !textEl) return;

        textEl.textContent = text;

        // Clear and rebuild actions
        actionsEl.innerHTML = '';
        if (actions.length === 0) {
            // Default actions
            actionsEl.innerHTML = `
                <button class="ai-action-btn" onclick="AIChatUI.openChat()">Open Chat</button>
                <button class="ai-action-btn secondary" onclick="AIChatUI.dismiss()">Dismiss</button>
            `;
        } else {
            actions.forEach(action => {
                const btn = document.createElement('button');
                btn.className = `ai-action-btn ${action.secondary ? 'secondary' : ''}`;
                btn.textContent = action.label;
                btn.onclick = action.callback;
                actionsEl.appendChild(btn);
            });
        }

        bubble.classList.add('show');

        // Auto-hide after 10 seconds
        setTimeout(() => {
            this.dismiss();
        }, 10000);
    }

    dismiss() {
        const bubble = document.getElementById('ai-speech-bubble');
        if (bubble) {
            bubble.classList.remove('show');
        }
    }

    openChat() {
        const panel = document.getElementById('ai-chat-panel');
        if (panel) {
            panel.classList.add('show');
            this.dismiss();
            
            // Play online sound
            this.playSound('online');
            
            // Focus input
            setTimeout(() => {
                const input = document.getElementById('ai-chat-input');
                if (input) input.focus();
            }, 300);

            // Show welcome message if chat is empty and assistant is ready
            const messages = document.getElementById('ai-chat-messages');
            if (messages && messages.children.length === 0) {
                // Check if assistant is initialized
                if (this.assistant && this.assistant.personality) {
                    this.addMessage('assistant', 
                        "GRRR... " + this.assistant.personality.getRandomGreeting() + "\n\n" +
                        "I CAN:\n\n" +
                        "📚 ANSWER QUESTIONS (I ATE THE DOCS)\n" +
                        "🎓 PROVIDE TUTORIALS (STEP-BY-STEP)\n" +
                        "🤖 AUTOMATE TASKS (WITH YOUR PERMISSION)\n" +
                        "🔧 HELP CREATE NPCs, QUESTS, AND MORE\n\n" +
                        "WHAT DO YOU NEED? SPEAK UP!");
                } else {
                    // Show basic welcome if not initialized yet
                    this.addMessage('system', 
                        "GRRR... IRAB IS WAKING UP!\n\n" +
                        "Loading AI capabilities... This might take a moment.\n\n" +
                        "Press Ctrl+K to close and try again in a few seconds!");
                    
                    // Try to initialize if not already
                    if (!this.isInitialized) {
                        this.initialize().catch(err => {
                            console.error('IRAB: Failed to initialize:', err);
                            this.addMessage('error', 
                                "OOPS! IRAB FAILED TO WAKE UP.\n\n" +
                                "Check console for errors. You might need to refresh the page.");
                        });
                    }
                }
            }
        }
    }

    closeChat() {
        const panel = document.getElementById('ai-chat-panel');
        if (panel) {
            panel.classList.remove('show');
        }
    }

    toggleChat() {
        const panel = document.getElementById('ai-chat-panel');
        if (panel && panel.classList.contains('show')) {
            this.closeChat();
        } else {
            this.openChat();
        }
    }

    async sendMessage() {
        const input = document.getElementById('ai-chat-input');
        if (!input || !input.value.trim()) return;

        const query = input.value.trim();
        input.value = '';

        // Reset char counter
        const counter = document.getElementById('msn-char-count');
        if (counter) counter.textContent = '0/500';

        // Show user message
        this.addMessage('user', query);
        
        // Play message sent sound
        this.playSound('messageSent');

        // Check if assistant is ready
        if (!this.assistant || !this.isInitialized) {
            this.playSound('error');
            this.addMessage('error', 
                "IRAB is still loading... Try again in a moment!");
            
            // Try to initialize
            if (!this.isInitialized) {
                this.initialize().catch(err => {
                    console.error('IRAB: Initialization failed:', err);
                });
            }
            return;
        }

        // Show thinking state
        const statusDot = document.querySelector('.msn-status-dot');
        const statusText = document.getElementById('msn-status-text');
        if (statusDot) statusDot.classList.add('thinking');
        if (statusText) statusText.textContent = '🤔 IRAB is thinking...';
        
        // Play typing sound
        this.playSound('typing');

        try {
            // Process query
            const response = await this.assistant.processQuery(query);

            // Remove thinking state
            if (statusDot) statusDot.classList.remove('thinking');
            if (statusText) statusText.textContent = 'Online - Ready to help!';

            // Show assistant response
            this.addMessage('assistant', response.text);
            
            // Play message received sound
            this.playSound('messageReceived');

            // Handle special response types
            if (response.type === 'tutorial' && response.tutorial) {
                this.startTutorial(response.tutorial);
            } else if (response.type === 'confirmation' && response.pendingAction) {
                this.showActionConfirmation(response.pendingAction);
            }

        } catch (error) {
            if (statusDot) statusDot.classList.remove('thinking');
            if (statusText) statusText.textContent = 'Error occurred';
            this.playSound('error');
            this.addMessage('error', `Error: ${error.message}`);
        }
    }

    addMessage(type, text) {
        const messagesContainer = document.getElementById('ai-chat-messages');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${type}`;

        // MSN-style message with avatar
        const avatar = document.createElement('div');
        avatar.className = 'ai-message-avatar';
        
        // Set avatar based on message type
        if (type === 'user') {
            avatar.style.background = '#0066CC';
            avatar.innerHTML = '<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">U</div>';
        } else if (type === 'assistant') {
            avatar.style.backgroundImage = 'url(/sprite-art/helper.png)';
            avatar.style.backgroundSize = 'cover';
        } else if (type === 'system') {
            avatar.style.background = '#FFAA00';
            avatar.innerHTML = '<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px;">ℹ</div>';
        } else if (type === 'error') {
            avatar.style.background = '#FF0000';
            avatar.innerHTML = '<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">!</div>';
        }

        const content = document.createElement('div');
        content.className = 'ai-message-content';

        // Name and timestamp
        const nameBar = document.createElement('div');
        const nameName = document.createElement('span');
        nameName.className = 'ai-message-name';
        nameName.textContent = type === 'user' ? 'You' : 
                               type === 'assistant' ? 'IRAB' :
                               type === 'system' ? 'System' : 'Error';
        
        const timestamp = document.createElement('span');
        timestamp.className = 'ai-message-timestamp';
        timestamp.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        nameBar.appendChild(nameName);
        nameBar.appendChild(timestamp);
        content.appendChild(nameBar);

        // Message bubble
        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';
        bubble.textContent = text;

        content.appendChild(bubble);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        messagesContainer.appendChild(messageDiv);

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Update status
        const statusDot = document.querySelector('.msn-status-dot');
        const statusText = document.getElementById('msn-status-text');
        
        if (type === 'assistant' && statusDot && statusText) {
            statusDot.classList.remove('thinking');
            statusText.textContent = 'Online - Ready to help!';
        }
    }

    showActionConfirmation(action) {
        const actionsHTML = `
            <button class="ai-action-btn" onclick="AIChatUI.executeAction(${JSON.stringify(action)})">
                ✓ Execute
            </button>
            <button class="ai-action-btn secondary" onclick="AIChatUI.addMessage('system', 'Action cancelled')">
                ✗ Cancel
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
        this.addMessage('system', 'Executing action...');

        try {
            const result = await this.assistant.editorTools[action.type](
                ...Object.values(action.params)
            );

            if (result.success) {
                this.addMessage('system', '✅ Action completed successfully!');
            } else {
                this.addMessage('error', `❌ Failed: ${result.reason}`);
            }
        } catch (error) {
            this.addMessage('error', `❌ Error: ${error.message}`);
        }
    }

    startTutorial(tutorial) {
        this.currentTutorial = tutorial;
        this.tutorialStep = 0;
        this.showTutorialStep();
    }

    showTutorialStep() {
        if (!this.currentTutorial) return;

        const step = this.currentTutorial.steps[this.tutorialStep];
        if (!step) {
            this.endTutorial();
            return;
        }

        const overlay = document.getElementById('ai-tutorial-overlay');
        const progressEl = document.getElementById('ai-tutorial-progress');
        const stepEl = document.getElementById('ai-tutorial-step');

        if (!overlay || !progressEl || !stepEl) return;

        progressEl.textContent = `Step ${this.tutorialStep + 1} of ${this.currentTutorial.steps.length}`;
        stepEl.textContent = step.instruction;

        overlay.classList.add('show');

        // Highlight target element
        if (step.selector) {
            this.highlightElement(step.selector);
        }
    }

    highlightElement(selector) {
        // Remove previous highlights
        document.querySelectorAll('.ai-highlight').forEach(el => {
            el.classList.remove('ai-highlight');
        });

        // Add new highlight
        const element = document.querySelector(selector);
        if (element) {
            element.classList.add('ai-highlight');
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    nextTutorialStep() {
        this.tutorialStep++;
        
        // Remove highlights
        document.querySelectorAll('.ai-highlight').forEach(el => {
            el.classList.remove('ai-highlight');
        });

        if (this.tutorialStep < this.currentTutorial.steps.length) {
            this.showTutorialStep();
        } else {
            this.endTutorial();
        }
    }

    skipTutorial() {
        this.endTutorial();
        this.addMessage('system', 'Tutorial skipped');
    }

    endTutorial() {
        const overlay = document.getElementById('ai-tutorial-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }

        // Remove highlights
        document.querySelectorAll('.ai-highlight').forEach(el => {
            el.classList.remove('ai-highlight');
        });

        if (this.currentTutorial) {
            this.addMessage('system', `✅ Tutorial "${this.currentTutorial.title}" completed!`);
        }

        this.currentTutorial = null;
        this.tutorialStep = 0;
    }
}

// Global instance
window.AIChatUI = new IRABChatUIController();

// Expose functions for parent window integration
window.openChat = () => window.AIChatUI.openChat();
window.closeChat = () => window.AIChatUI.closeChat();

// Expose updateLoadingProgress for external use
window.updateAIProgress = (progressData) => {
    if (window.AIChatUI) {
        window.AIChatUI.updateLoadingProgress(progressData);
    }
};

// Tutorial controller
window.AITutorial = {
    next: () => window.AIChatUI.nextTutorialStep(),
    skip: () => window.AIChatUI.skipTutorial()
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.AIChatUI.initialize().catch(console.error);
        // Signal to parent that we're ready
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'IRAB_READY' }, '*');
        }
    });
} else {
    window.AIChatUI.initialize().catch(console.error);
    // Signal to parent that we're ready
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'IRAB_READY' }, '*');
    }
}

// Debug: Log when functions are available
console.log('IRAB: Functions exposed -', {
    openChat: typeof window.openChat,
    closeChat: typeof window.closeChat,
    AIChatUI: typeof window.AIChatUI
});

// Settings Controller
class AISettingsController {
    constructor() {
        this.settings = this.loadSettings();
    }

    loadSettings() {
        const saved = localStorage.getItem('irab_settings');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        }
        
        // Defaults
        return {
            provider: 'local',
            irabPersonality: true,
            tips: true,
            autoSuggestions: true,
            requirePermission: false,
            useDocs: true,
            useTutorials: true,
            cerebrasKey: '',
            maxTokens: 500,
            soundsEnabled: true
        };
    }

    saveSettings() {
        localStorage.setItem('irab_settings', JSON.stringify(this.settings));
    }

    toggle() {
        const panel = document.getElementById('msn-settings');
        if (panel) {
            panel.classList.toggle('show');
        }
    }

    save() {
        // Read from form
        this.settings.provider = document.getElementById('setting-provider')?.value || 'local';
        this.settings.irabPersonality = document.getElementById('setting-irab-personality')?.checked || false;
        this.settings.tips = document.getElementById('setting-tips')?.checked || false;
        this.settings.autoSuggestions = document.getElementById('setting-auto-suggestions')?.checked || false;
        this.settings.requirePermission = document.getElementById('setting-require-permission')?.checked || false;
        this.settings.useDocs = document.getElementById('setting-use-docs')?.checked || false;
        this.settings.useTutorials = document.getElementById('setting-use-tutorials')?.checked || false;
        this.settings.cerebrasKey = document.getElementById('setting-cerebras-key')?.value || '';
        this.settings.maxTokens = parseInt(document.getElementById('setting-max-tokens')?.value) || 500;
        this.settings.soundsEnabled = document.getElementById('setting-sounds')?.checked !== false;

        this.saveSettings();
        
        // Apply sound settings immediately
        if (window.AIChatUI) {
            window.AIChatUI.toggleSounds(this.settings.soundsEnabled);
            window.AIChatUI.addMessage('system', '⚙ Settings saved successfully!');
        }
        
        this.toggle();
    }

    reset() {
        if (confirm('Reset all settings to defaults?')) {
            this.settings = {
                provider: 'local',
                irabPersonality: true,
                tips: true,
                autoSuggestions: true,
                requirePermission: false,
                useDocs: true,
                useTutorials: true,
                cerebrasKey: '',
                maxTokens: 500
            };
            
            this.saveSettings();
            this.loadToForm();
            
            if (window.AIChatUI) {
                window.AIChatUI.addMessage('system', '⚙ Settings reset to defaults!');
            }
        }
    }

    loadToForm() {
        // Populate form with current settings
        const provider = document.getElementById('setting-provider');
        if (provider) provider.value = this.settings.provider;
        
        const irabPersonality = document.getElementById('setting-irab-personality');
        if (irabPersonality) irabPersonality.checked = this.settings.irabPersonality;
        
        const tips = document.getElementById('setting-tips');
        if (tips) tips.checked = this.settings.tips;
        
        const autoSuggestions = document.getElementById('setting-auto-suggestions');
        if (autoSuggestions) autoSuggestions.checked = this.settings.autoSuggestions;
        
        const requirePermission = document.getElementById('setting-require-permission');
        if (requirePermission) requirePermission.checked = this.settings.requirePermission;
        
        const useDocs = document.getElementById('setting-use-docs');
        if (useDocs) useDocs.checked = this.settings.useDocs;
        
        const useTutorials = document.getElementById('setting-use-tutorials');
        if (useTutorials) useTutorials.checked = this.settings.useTutorials;
        
        const cerebrasKey = document.getElementById('setting-cerebras-key');
        if (cerebrasKey) cerebrasKey.value = this.settings.cerebrasKey;
        
        const maxTokens = document.getElementById('setting-max-tokens');
        if (maxTokens) maxTokens.value = this.settings.maxTokens;
    }
}

// Global settings instance
window.AISettings = new AISettingsController();

// Load settings to form on page load
setTimeout(() => {
    if (window.AISettings) {
        window.AISettings.loadToForm();
    }
}, 500);

// Character counter for input
const inputBox = document.getElementById('ai-chat-input');
if (inputBox) {
    inputBox.addEventListener('input', () => {
        const counter = document.getElementById('msn-char-count');
        if (counter) {
            counter.textContent = `${inputBox.value.length}/500`;
        }
    });
    
    // Enter to send (Shift+Enter for new line)
    inputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (window.AIChatUI) {
                window.AIChatUI.sendMessage();
            }
        }
    });
}

console.log('IRAB: MSN Messenger UI loaded!');
