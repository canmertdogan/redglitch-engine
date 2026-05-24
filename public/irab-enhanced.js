/**
 * Enhanced IRAB Assistant with Progress Bar, Jokes, and API Integration
 * For tools.html and dashboard.html
 */

window.IRAB = {
    chatOpen: false,
    settings: {
        provider: 'local',
        personality: true,
        tips: true,
        saveHistory: true,
        apiKey: '',
        // Local AI settings
        localModel: 'onnx-community/Qwen2.5-Coder-3B-Instruct',
        temperature: 0.7,
        maxTokens: 128,
        topP: 0.9,
        repetitionPenalty: 1.1
    },
    
    // Loading jokes for progress bar
    loadingJokes: [
        "Downloading pixels one by one...",
        "Teaching IRAB to count to potato...",
        "GRRR... MUNCHING ON DATA BYTES!",
        "Loading... This better be worth the wait!",
        "Consulting the ancient game dev scrolls...",
        "Asking the rubber duck for advice...",
        "Compiling witty response...",
        "Summoning the AI spirits...",
        "GRRR... WHERE'S MY COFFEE?!",
        "Defragmenting brain neurons...",
        "Running on hamster power...",
        "Calculating pixel perfect answers...",
        "Downloading more RAM... wait, that's illegal!",
        "Teaching AI to think... this might take a while!",
        "LOADING: Because instant gratification is overrated!"
    ],
    
    assistant: null,
    currentProgressMsg: null,
    
    init() {
        console.log('🔧 IRAB Enhanced: Initializing...');
        this.loadSettings();
        console.log('📋 Settings loaded:', this.settings);
        this.loadHistory();
        console.log('📜 History loaded');
        this.initAssistant();
        console.log('🤖 Assistant initialized:', !!this.assistant);
        this.setupEventListeners();
        console.log('👂 Event listeners setup');
        console.log('✅ Enhanced IRAB initialized successfully!');
        
        // Check DOM elements
        const elements = {
            avatar: !!document.getElementById('irab-avatar'),
            balloon: !!document.getElementById('irab-balloon'),
            chat: !!document.getElementById('irab-chat'),
            messages: !!document.getElementById('irab-chat-messages'),
            input: !!document.getElementById('irab-chat-input')
        };
        console.log('🎯 DOM Elements:', elements);
    },
    
    initAssistant() {
        // Initialize IRABAssistantSimple if available
        if (window.IRABAssistantSimple) {
            this.assistant = new window.IRABAssistantSimple({
                provider: this.settings.provider,
                model: {
                    modelId: this.settings.localModel,
                    backend: 'wasm',
                    wasmThreads: navigator.hardwareConcurrency || 4
                },
                maxTokens: this.settings.maxTokens,
                temperature: this.settings.temperature,
                topP: this.settings.topP,
                repetitionPenalty: this.settings.repetitionPenalty
            });
            
            // Hook progress callback
            this.assistant.onProgress = (progress) => {
                this.updateProgress(progress.percent, progress.status);
            };
        }
    },
    
    setupEventListeners() {
        const input = document.getElementById('irab-chat-input');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.send();
                }
                
                // Update char count
                setTimeout(() => {
                    const count = input.value.length;
                    const counter = document.getElementById('irab-char-count');
                    if (counter) counter.textContent = `${count}/500`;
                }, 0);
            });
        }
        
        // Avatar click handler
        const avatar = document.getElementById('irab-avatar');
        if (avatar) {
            avatar.addEventListener('click', () => this.openChat());
        }
        
        // Global shortcut: Ctrl/Cmd+K
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.toggleChat();
            }
        });
        
        // Show initial balloon after delay
        setTimeout(() => {
            const messages = [
                "GRRR... IRAB IS READY TO HELP!",
                "CLICK ME FOR ASSISTANCE!",
                "NEED HELP? I'M HERE!",
                "READY TO CODE? LET'S GO!"
            ];
            this.showBalloon(messages[Math.floor(Math.random() * messages.length)]);
        }, 2000);
    },
    
    toggleChat() {
        this.chatOpen = !this.chatOpen;
        const chat = document.getElementById('irab-chat');
        const avatar = document.getElementById('irab-avatar');
        
        if (this.chatOpen) {
            chat.style.display = 'flex';
            if (avatar) avatar.style.display = 'none';
            this.loadHistory();
            document.getElementById('irab-chat-input')?.focus();
        } else {
            chat.style.display = 'none';
            if (avatar) avatar.style.display = 'block';
        }
    },
    
    openChat() {
        this.chatOpen = true;
        const chat = document.getElementById('irab-chat');
        const avatar = document.getElementById('irab-avatar');
        const balloon = document.getElementById('irab-balloon');
        
        chat.style.display = 'flex';
        if (avatar) avatar.style.display = 'none';
        if (balloon) balloon.style.display = 'none';
        this.loadHistory();
        document.getElementById('irab-chat-input')?.focus();
    },
    
    closeChat() {
        this.chatOpen = false;
        const chat = document.getElementById('irab-chat');
        const avatar = document.getElementById('irab-avatar');
        
        chat.style.display = 'none';
        if (avatar) avatar.style.display = 'block';
    },
    
    dismissBalloon() {
        const balloon = document.getElementById('irab-balloon');
        if (balloon) balloon.style.display = 'none';
    },
    
    async send() {
        const input = document.getElementById('irab-chat-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        // Add user message
        this.addMessage('user', message);
        input.value = '';
        document.getElementById('irab-char-count').textContent = '0/500';
        
        // Show progress message with joke
        const joke = this.loadingJokes[Math.floor(Math.random() * this.loadingJokes.length)];
        this.currentProgressMsg = this.addProgressMessage(joke);
        
        try {
            let response;
            
            // Use cloud API if available
            if (this.settings.provider === 'cerebras' && this.settings.apiKey) {
                response = await this.queryCloud(message);
            }
            // Use local API endpoint
            else if (this.settings.provider === 'local') {
                response = await this.queryLocal(message);
            }
            // Fallback
            else {
                response = "⚠️ Please configure AI settings first! Click the ⚙ button.";
            }
            
            // Remove progress message
            if (this.currentProgressMsg) {
                this.currentProgressMsg.remove();
                this.currentProgressMsg = null;
            }
            
            // Add AI response
            this.addMessage('assistant', response);
            
            // Save to history
            if (this.settings.saveHistory) {
                this.saveHistory();
            }
            
        } catch (error) {
            console.error('IRAB Error:', error);
            
            if (this.currentProgressMsg) {
                this.currentProgressMsg.remove();
                this.currentProgressMsg = null;
            }
            
            this.addMessage('error', `GRRR... ERROR: ${error.message}`);
        }
    },
    
    async queryCloud(message) {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                context: { file: 'Unknown' },
                history: []
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.response || data.text || 'No response';
    },
    
    async queryLocal(message) {
        // If assistant is available, use it
        if (this.assistant && this.assistant.workerReady) {
            const result = await this.assistant.processQuery(message);
            return result.text;
        }
        
        // Otherwise use server endpoint
        return await this.queryCloud(message);
    },
    
    addProgressMessage(joke) {
        const container = document.getElementById('irab-chat-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'irab-message assistant-message';
        msgDiv.innerHTML = `
            <div class="irab-message-content">
                <div style="margin-bottom: 8px;">${joke}</div>
                <div class="irab-progress-bar">
                    <div class="irab-progress-fill" id="irab-progress-fill"></div>
                </div>
                <div class="irab-progress-text" id="irab-progress-text">Loading AI... 0%</div>
            </div>
        `;
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
        return msgDiv;
    },
    
    updateProgress(percent, status) {
        const fill = document.getElementById('irab-progress-fill');
        const text = document.getElementById('irab-progress-text');
        
        if (fill) fill.style.width = percent + '%';
        if (text) text.textContent = `${status || 'Loading'}... ${Math.round(percent)}%`;
    },
    
    addMessage(role, content) {
        const container = document.getElementById('irab-chat-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `irab-message ${role}-message`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'irab-message-content';
        contentDiv.textContent = content;
        
        msgDiv.appendChild(contentDiv);
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    },
    
    toggleSettings() {
        const settings = document.getElementById('irab-settings');
        if (settings.style.display === 'block') {
            settings.style.display = 'none';
        } else {
            this.loadSettingsUI();
            settings.style.display = 'block';
        }
    },
    
    loadSettingsUI() {
        document.getElementById('irab-setting-provider').value = this.settings.provider;
        document.getElementById('irab-setting-personality').checked = this.settings.personality;
        document.getElementById('irab-setting-tips').checked = this.settings.tips;
        document.getElementById('irab-setting-save-history').checked = this.settings.saveHistory;
        document.getElementById('irab-setting-api-key').value = this.settings.apiKey;
        
        // Local AI settings
        document.getElementById('irab-setting-model').value = this.settings.localModel;
        document.getElementById('irab-setting-temperature').value = this.settings.temperature;
        document.getElementById('irab-setting-temperature-val').textContent = this.settings.temperature;
        document.getElementById('irab-setting-max-tokens').value = this.settings.maxTokens;
        document.getElementById('irab-setting-top-p').value = this.settings.topP;
        document.getElementById('irab-setting-top-p-val').textContent = this.settings.topP;
    },
    
    saveSettings() {
        this.settings.provider = document.getElementById('irab-setting-provider').value;
        this.settings.personality = document.getElementById('irab-setting-personality').checked;
        this.settings.tips = document.getElementById('irab-setting-tips').checked;
        this.settings.saveHistory = document.getElementById('irab-setting-save-history').checked;
        this.settings.apiKey = document.getElementById('irab-setting-api-key').value;
        
        // Local AI settings
        this.settings.localModel = document.getElementById('irab-setting-model').value;
        this.settings.temperature = parseFloat(document.getElementById('irab-setting-temperature').value);
        this.settings.maxTokens = parseInt(document.getElementById('irab-setting-max-tokens').value);
        this.settings.topP = parseFloat(document.getElementById('irab-setting-top-p').value);
        
        localStorage.setItem('irab_settings', JSON.stringify(this.settings));
        
        // Reinitialize assistant with new settings
        this.initAssistant();
        
        // Send config to server if cloud provider
        if (this.settings.provider === 'cerebras' && this.settings.apiKey) {
            fetch('/api/ai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: 'cerebras',
                    cerebrasKey: this.settings.apiKey
                })
            });
        }
        
        this.toggleSettings();
        this.addMessage('system', '✅ Settings saved!');
    },
    
    loadSettings() {
        const saved = localStorage.getItem('irab_settings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
    },
    
    loadHistory() {
        const saved = localStorage.getItem('irab_chat_history');
        if (!saved) return;
        
        const history = JSON.parse(saved);
        const container = document.getElementById('irab-chat-messages');
        container.innerHTML = '';
        
        history.forEach(msg => {
            this.addMessage(msg.role, msg.content);
        });
    },
    
    saveHistory() {
        const messages = document.querySelectorAll('.irab-message');
        const history = [];
        
        messages.forEach(msg => {
            const role = msg.classList.contains('user-message') ? 'user' : 
                        msg.classList.contains('assistant-message') ? 'assistant' : 'system';
            const content = msg.querySelector('.irab-message-content')?.textContent || '';
            
            if (content && !content.includes('Loading AI')) {
                history.push({ role, content, timestamp: Date.now() });
            }
        });
        
        localStorage.setItem('irab_chat_history', JSON.stringify(history));
    },
    
    clearHistory() {
        if (confirm('Clear all chat history?')) {
            localStorage.removeItem('irab_chat_history');
            document.getElementById('irab-chat-messages').innerHTML = '';
            this.addMessage('system', 'Chat history cleared!');
        }
    },
    
    showBalloon(message) {
        const balloon = document.getElementById('irab-balloon');
        const text = document.getElementById('irab-balloon-text');
        
        text.textContent = message;
        balloon.style.display = 'block';
        
        setTimeout(() => {
            balloon.style.display = 'none';
        }, 5000);
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => IRAB.init());
} else {
    IRAB.init();
}
