/**
 * assistant.js - IRAB: Classic MSN Messenger Style AI Assistant
 * Restored version that drives the MSN UI in tools.html and other editors.
 */

window.IRAB = {
    irabIsms: [
        "GRRR... NEED ASSISTANCE?",
        "HAVE YOU CHECKED THE COLLISION LAYER?",
        "I ATE THE HELP BUTTON.",
        "ADVICE: IF IT WORKS, DO NOT TOUCH IT.",
        "YOUR PIXEL ART HAS CHARM.",
        "A PIXEL IS JUST A SQUARE WITH DREAMS.",
        "SYSTEM STATUS: 100% READY TO PARTY.",
        "MAYBE THE REAL BUGS WERE THE FRIENDS WE MADE ALONG THE WAY.",
        "I'M NOT LAZY, I'M JUST IN STANDBY MODE.",
        "REMEMBER TO SAVE OFTEN. DATA IS DELICIOUS BUT FRAGILE.",
        "DO YOU EVER WONDER IF THE SPRITES ARE DREAMING?"
    ],
    sounds: {
        msg: "/ai/sounds/msg.mp3",
        nudge: "/ai/sounds/nudge.mp3",
        online: "/ai/sounds/online.mp3",
        wink: "/ai/sounds/wink.mp3"
    },
    balloonTimer: null,
    currentBotMsg: null,
    _readyAnnounced: false,
    _audioEnabled: true,
    currentSessionId: "latest",
    ismsInterval: null,
    tokenBuffer: "", 
    isHidingToolCall: false,

    _commandQueue: [],

    init() {
        console.log("[IRAB] Classic MSN UI Initializing...");
        
        // Connect to bridge if it exists
        if (window.irab) {
            window.irab.onToken = (token) => this.handleToken(token);
            window.irab.onStateChange = (state) => this.handleState(state);
            window.irab.onLoadProgress = (data) => this.handleLoadProgress(data);
            
            window.irab.onCommand = (cmdData) => {
                const { action, params } = cmdData;
                console.log("[IRAB] Received command from bridge:", action, params);
                
                // If Brain (Registry) is ready, execute immediately
                if (window.KetebeAIInstance && window.KetebeAIInstance.toolRegistry) {
                    window.KetebeAIInstance.toolRegistry.execute(action, params);
                } else {
                    // Brain not ready yet, queue the command
                    console.log("[IRAB] Brain (Registry) not ready. Queuing command...");
                    this._commandQueue.push(cmdData);
                    
                    // Start a polling interval to flush the queue once Brain is ready
                    if (!this._flushInterval) {
                        this._flushInterval = setInterval(() => {
                            if (window.KetebeAIInstance && window.KetebeAIInstance.toolRegistry) {
                                console.log("[IRAB] Brain detected! Flushing command queue...");
                                while (this._commandQueue.length > 0) {
                                    const next = this._commandQueue.shift();
                                    window.KetebeAIInstance.toolRegistry.execute(next.action, next.params);
                                }
                                clearInterval(this._flushInterval);
                                this._flushInterval = null;
                            }
                        }, 500);
                    }

                    // Emergency Fallback: If after 5s Brain still isn't here, try direct navigation
                    setTimeout(() => {
                        if (this._commandQueue.includes(cmdData)) {
                            console.warn("[IRAB] Brain initialization timeout. Attempting direct fallback.");
                            const [namespace] = action.split('.');
                            const NAMESPACE_MAP = {
                                'pixel': 'iso_studio',
                                'world': 'editor',
                                'code': 'script',
                                'npc': 'npc',
                                'dialogue': 'dialogue'
                            };
                            
                            const target = NAMESPACE_MAP[namespace] || params[0] || params.target;
                            if (target) {
                                this._directNavigate(target);
                            }
                        }
                    }, 5000);
                }
                if (window.KetebeEventBus) window.KetebeEventBus.emit('ai:command', cmdData);
            };
            
            window.irab.onReady = () => {
                this.playSound('online');
                this.updateSessionList();
                const checkInterval = setInterval(() => {
                    if (window.irab.socket && window.irab.socket.readyState === 1) {
                        window.irab.send({ type: "CHECK_STATUS" });
                        if (this._readyAnnounced) clearInterval(checkInterval);
                    } else {
                        clearInterval(checkInterval);
                    }
                }, 2000);
            };

            // Phase 10: Co-Pilot Integration
            if (window.KetebeEventBus) {
                window.KetebeEventBus.on('ai:suggestion', (data) => {
                    this.showBalloon(`💡 SUGGESTION: ${data.text}`);
                    // If there are actions, we can log them to chat or show them in a special way
                    if (data.actions && data.actions.length > 0) {
                        console.log("[IRAB] Proactive actions available:", data.actions);
                    }
                });

                window.KetebeEventBus.on('ai:thought', (data) => {
                    this.showBalloon(data.text);
                });
            }
        }

        // Setup UI hooks
        const avatar = document.getElementById('irab-avatar');
        if (avatar) avatar.onclick = () => this.toggleChat();

        const input = document.getElementById('irab-chat-input');
        if (input) {
            input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } };
        }

        this.loadSettings();
        this.updateSessionList();
        this.startIsms();
        
        // Expose to window.kbot for compatibility with some scripts
        window.kbot = {
            toggle: () => this.toggleChat(),
            send: () => this.send(),
            showBubble: (text) => this.showBalloon(text)
        };
        
        console.log("[IRAB] MSN UI Ready.");
    },

    _directNavigate(target) {
        if (!target) return;
        let hub = window;
        if (!hub.openWindow && window.parent && window.parent.openWindow) hub = window.parent;
        if (!hub.openWindow && window.top && window.top.openWindow) hub = window.top;

        if (hub.openWindow && hub.tools) {
            const tool = hub.tools.find(t => t.id === target);
            if (tool) {
                hub.openWindow(tool);
                return;
            }
        }
        
        const nav = {
            'dashboard': 'dashboard.html', 'project_dashboard': 'project_dashboard.html',
            'editor': 'editor.html', 'iso_studio': 'iso_editor.html',
            'platformer_studio': 'platformer_editor.html', 'script': 'script_editor.html',
            'npc': 'npc_editor.html', 'pixel': 'pixel_editor.html'
        };
        if (nav[target]) {
            if (window.top) window.top.location.href = nav[target];
            else window.location.href = nav[target];
        }
    },

    startIsms() {
        if (this.ismsInterval) clearInterval(this.ismsInterval);
        this.ismsInterval = setInterval(() => {
            if (Math.random() > 0.7) { 
                const ism = this.irabIsms[Math.floor(Math.random() * this.irabIsms.length)];
                this.showBalloon(ism);
            }
        }, 30000);
    },

    async updateSessionList() {
        const listEl = document.getElementById('irab-session-list');
        if (!listEl) return;
        try {
            const res = await fetch('/api/history/list');
            const sessions = await res.json();
            listEl.innerHTML = '';
            sessions.forEach(id => {
                const item = document.createElement('div');
                item.className = 'irab-quick-action';
                item.style.fontSize = '9px';
                item.textContent = `📅 ${id}`;
                item.onclick = () => this.switchSession(id);
                listEl.appendChild(item);
            });
        } catch(e) {}
    },

    newSession() {
        const now = new Date();
        const defaultName = "session_" + now.getTime();
        this.switchSession(defaultName, true);
    },

    async switchSession(id, isNew = false) {
        this.currentSessionId = id;
        const msgs = document.getElementById('irab-chat-messages');
        if (msgs) msgs.innerHTML = '';
        if (!isNew) await this.loadHistory();
        else {
            this.addMessage('bot', `GRRR... NEW SESSION STARTED!`);
            this.saveHistory();
        }
        this.updateSessionList();
    },

    async saveHistory() {
        const msgs = document.getElementById('irab-chat-messages');
        if (!msgs) return;
        const history = [];
        msgs.querySelectorAll('.irab-msg').forEach(msg => {
            const bubble = msg.querySelector('.irab-msg-bubble');
            if (bubble && !msg.id.includes('loading')) {
                history.push({ 
                    type: msg.classList.contains('user') ? 'user' : 'bot', 
                    text: bubble.textContent 
                });
            }
        });
        try {
            await fetch('/api/history/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ history, session_id: this.currentSessionId })
            });
        } catch(e) {}
    },

    async loadHistory() {
        try {
            const res = await fetch(`/api/history/load?session_id=${this.currentSessionId}`);
            const history = await res.json();
            const msgs = document.getElementById('irab-chat-messages');
            if (msgs && history.length > 0) {
                msgs.innerHTML = '';
                history.forEach(msg => this.addMessage(msg.type, msg.text, false));
            }
        } catch(e) {}
    },

    playSound(type) {
        if (!this._audioEnabled) return;
        const audio = new Audio(this.sounds[type]);
        audio.volume = 0.4;
        audio.play().catch(e => {});
    },

    handleToken(token) {
        if (token === null) {
            this.tokenBuffer = "";
            this.isHidingToolCall = false;
            return;
        }

        this.tokenBuffer += token;

        // Check for tool call start
        if (!this.isHidingToolCall && this.tokenBuffer.includes('```tool')) {
            this.isHidingToolCall = true;
            // When we start hiding, we might have already sent some text to the UI
            // but the ```tool part should be stripped if it was partially sent.
            // However, our logic below avoids sending if a backtick is present.
        }

        // Check for tool call end
        if (this.isHidingToolCall && this.tokenBuffer.includes('```', this.tokenBuffer.indexOf('```tool') + 7)) {
            this.tokenBuffer = "";
            this.isHidingToolCall = false;
            return;
        }

        // Only add to UI if not hiding
        if (!this.isHidingToolCall) {
            // If we see a backtick, we buffer but don't show yet, 
            // in case it's the start of a tool block
            if (this.tokenBuffer.includes('`') && !this.tokenBuffer.includes('```tool')) {
                // If it's been buffering for too long without seeing '```tool', 
                // it's probably just code or a backtick in text, so show it.
                if (this.tokenBuffer.length > 20) {
                    this._flushBuffer();
                }
                return;
            }

            this._appendTokenToUI(token);
        }

        if (token.includes(']]')) this.saveHistory();
    },

    _flushBuffer() {
        if (!this.tokenBuffer) return;
        this._appendTokenToUI(this.tokenBuffer);
        this.tokenBuffer = "";
    },

    _appendTokenToUI(text) {
        if (!this.currentBotMsg) {
            const c = document.getElementById('irab-chat');
            if (c) c.style.display = 'flex';
            this.currentBotMsg = this.addMessage('bot', "", false);
            this.playSound('msg');
        }
        const bubble = this.currentBotMsg.querySelector('.irab-msg-bubble');
        bubble.textContent += text;
        const msgs = document.getElementById('irab-chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    },

    handleState(state) {
        const dot = document.getElementById('irab-status-dot');
        const st = document.getElementById('irab-status-text');
        if (!dot || !st) return;

        if (state === 'THINKING') {
            dot.className = 'irab-status-dot thinking';
            st.textContent = 'IRAB is thinking...';
            this.currentBotMsg = null;
        } else if (state === 'OFFLINE' || state === 'CONNECTING') {
            dot.style.background = '#e74c3c';
            st.textContent = state === 'CONNECTING' ? 'Connecting...' : 'Offline';
        } else if (state === 'IDLE') {
            dot.className = 'irab-status-dot';
            dot.style.background = '#00CC00';
            st.textContent = 'Online';
            this.currentBotMsg = null;
        } else if (state === 'ONLINE') {
            dot.className = 'irab-status-dot';
            dot.style.background = '#00CC00';
            st.textContent = 'Online';
        }
    },

    handleLoadProgress(data) {
        const { percent, status } = data;
        let pMsg = document.getElementById('irab-loading-msg');
        const input = document.getElementById('irab-chat-input');
        
        if (input) {
            input.disabled = (percent < 100);
            input.placeholder = (percent < 100) ? `Initializing... (${percent}%)` : "Type a message...";
        }

        if (percent >= 100) {
            if (pMsg) {
                pMsg.querySelector('.irab-progress-fill').style.width = '100%';
                pMsg.querySelector('.irab-progress-text').textContent = "READY!";
                setTimeout(() => { if (pMsg) pMsg.remove(); }, 3000);
            }
            if (!this._readyAnnounced) {
                this._readyAnnounced = true;
                this.showBalloon("GRRR... SYSTEM ONLINE!");
            }
            return;
        }

        if (!pMsg) {
            const c = document.getElementById('irab-chat');
            if (c) c.style.display = 'flex';
            pMsg = this.addProgressMessage("WAKING UP...");
            pMsg.id = 'irab-loading-msg';
        }
        
        if (pMsg) {
            pMsg.querySelector('.irab-progress-fill').style.width = percent + '%';
            pMsg.querySelector('.irab-progress-text').textContent = `${status} (${percent}%)`;
        }
    },

    addProgressMessage(text) {
        const msgs = document.getElementById('irab-chat-messages');
        if (!msgs) return null;
        const msg = document.createElement('div');
        msg.className = 'irab-msg bot';
        msg.innerHTML = `
            <div class="irab-msg-avatar" style="background-image: url('/sprite-art/helper.png'); background-size: cover;"></div>
            <div class="irab-msg-body">
                <div class="irab-msg-bubble">
                    <div style="margin-bottom:5px;">${text}</div>
                    <div class="irab-progress-bar"><div class="irab-progress-fill" style="width: 0%"></div></div>
                    <div class="irab-progress-text" style="font-size:9px; color:#666;">Starting...</div>
                </div>
            </div>
        `;
        msgs.appendChild(msg);
        msgs.scrollTop = msgs.scrollHeight;
        return msg;
    },

    addMessage(type, text, save = true) {
        const msgs = document.getElementById('irab-chat-messages');
        if (!msgs) return;
        const msg = document.createElement('div');
        msg.className = 'irab-msg ' + type;
        const av = document.createElement('div');
        av.className = 'irab-msg-avatar';
        if (type === 'bot') { av.style.backgroundImage = "url('/sprite-art/helper.png')"; av.style.backgroundSize = 'cover'; }
        else { av.style.background = '#0066CC'; av.innerHTML = '<div style="color:#FFF;font-weight:bold;display:flex;height:100%;align-items:center;justify-content:center;">U</div>'; }
        
        const bd = document.createElement('div');
        bd.className = 'irab-msg-body';
        bd.innerHTML = `<div><span class="irab-msg-name">${type === 'user' ? 'You' : 'IRAB'}</span></div><div class="irab-msg-bubble">${text}</div>`;
        
        msg.appendChild(av); msg.appendChild(bd);
        msgs.appendChild(msg);
        msgs.scrollTop = msgs.scrollHeight;
        if (save) this.saveHistory();
        return msg;
    },

    send() {
        const input = document.getElementById('irab-chat-input');
        if (!input || !input.value.trim()) return;
        const text = input.value.trim();
        input.value = '';
        this.addMessage('user', text);
        if (window.irab) window.irab.prompt(text);
    },

    injectCode(code) {
        if (window.KetebeEventBus) {
            window.KetebeEventBus.emit('ai:inject-code', { code });
        }
    },

    showBalloon(text) {
        const b = document.getElementById('irab-balloon');
        const t = document.getElementById('irab-balloon-text');
        if (!b || !t) return;
        t.textContent = text;
        b.style.display = 'block';
        clearTimeout(this.balloonTimer);
        this.balloonTimer = setTimeout(() => b.style.display = 'none', 8000);
    },

    dismissBalloon() {
        const b = document.getElementById('irab-balloon');
        if (b) b.style.display = 'none';
    },

    clearHistory() {
        if (confirm("GRRR... CLEAR ALL CHAT HISTORY?")) {
            const msgs = document.getElementById('irab-chat-messages');
            if (msgs) msgs.innerHTML = '';
            this.saveHistory();
        }
    },

    openChat() {
        const c = document.getElementById('irab-chat');
        if (c) { 
            c.style.display = 'flex';
            this.loadHistory();
            setTimeout(() => document.getElementById('irab-chat-input')?.focus(), 200); 
        }
    },
    
    closeChat() { 
        const c = document.getElementById('irab-chat');
        if (c) c.style.display = 'none';
    },
    
    toggleChat() {
        const c = document.getElementById('irab-chat');
        if (c) {
            if (c.style.display === 'flex') this.closeChat();
            else this.openChat();
        }
    },

    toggleSettings() {
        const s = document.getElementById('irab-settings');
        if (s) s.style.display = (s.style.display === 'block') ? 'none' : 'block';
    },

    nudge(isAITriggered = false) {
        const c = document.getElementById('irab-chat');
        if (c) { 
            this.playSound('nudge');
            c.classList.add('nudge-animation');
            setTimeout(() => c.classList.remove('nudge-animation'), 500); 
        }
    },

    saveSettings() {
        const settings = {
            temperature: parseFloat(document.getElementById('irab-setting-temperature')?.value || 0.7),
            max_tokens: parseInt(document.getElementById('irab-setting-max-tokens')?.value || 512),
            gpu_layers: parseInt(document.getElementById('irab-setting-gpu-layers')?.value || 32),
            personality: document.getElementById('irab-setting-personality')?.checked ?? true,
            personality_text: document.getElementById('irab-setting-personality-text')?.value || "",
            audio: document.getElementById('irab-setting-audio')?.checked ?? true
        };
        this._audioEnabled = settings.audio;
        localStorage.setItem('irab_native_settings', JSON.stringify(settings));
        if (window.irab && window.irab.socket) window.irab.send({ type: 'UPDATE_CONFIG', data: settings });
        this.toggleSettings();
    },

    loadSettings() {
        const saved = localStorage.getItem('irab_native_settings');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                this._audioEnabled = s.audio ?? true;
                // UI updates would go here if settings inputs existed in current context
            } catch(e) {}
        }
    },

    playWink(type) {
        const overlay = document.getElementById('irab-wink-overlay');
        if (!overlay) return;
        this.playSound('wink');
        const icons = { 'heart': '❤️', 'laugh': '😂', 'thumb': '👍', 'rocket': '🚀', 'fire': '🔥' };
        overlay.innerHTML = `<div class="wink-image" style="font-size: 100px; display: flex; align-items: center; justify-content: center;">${icons[type] || '👍'}</div>`;
        overlay.style.opacity = 1;
        setTimeout(() => { overlay.style.opacity = 0; overlay.innerHTML = ''; }, 2500);
    },

    quickHelp() { if (window.irab) window.irab.prompt("How do I use Ketebe Studio?"); },
    quickTutorial() { if (window.irab) window.irab.prompt("Give me a quick tutorial on engine basics."); },
    quickTips() { if (window.irab) window.irab.prompt("Give me a random pro tip."); },
    tellJoke() { if (window.irab) window.irab.prompt("Tell me a funny developer joke."); },
    motivate() { if (window.irab) window.irab.prompt("I need some motivation to keep coding!"); },
    renderAsset(path) { this.addMessage('system', `Asset Preview: ${path}`); }
};

window.addEventListener('load', () => IRAB.init());
