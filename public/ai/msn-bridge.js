/**
 * irab-msn-bridge.js
 * SESSION VERSION: Handles UI, Progress, Thinking, and Multi-session History.
 */

window.IRAB = {
    irabIsms: [
        "GRRR... NEED ASSISTANCE?",
        "HAVE YOU CHECKED THE COLLISION LAYER?",
        "I ATE THE HELP BUTTON.",
        "ADVICE: IF IT WORKS, DO NOT TOUCH IT.",
        "YOUR PIXEL ART HAS CHARM.",
        "A PIXEL IS JUST A SQUARE WITH DREAMS.",
        "SYSTEM STATUS: 100% READY TO PARTY."
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
    _retryCount: 0,
    currentSessionId: "latest",
    ismsInterval: null,

    getApiUrl(path) {
        return path; 
    },

    init() {
        if (window.irab) {
            window.irab.onToken = (token) => this.handleToken(token);
            window.irab.onStateChange = (state) => this.handleState(state);
            
            // Initial Check: If not connected in 1.5s, show "Waiting" balloon
            setTimeout(() => {
                if (window.irab && !window.irab.isConnected) {
                    this.showBalloon("GRRR... SEARCHING FOR MY BRAIN...");
                }
            }, 1500);

            window.irab.onReady = () => {
                this.playSound('online');
                
                // Don't show balloon yet, let handleLoadProgress decide
                // Keep checking status until brain is READY
                const checkInterval = setInterval(() => {
                    if (window.irab.socket && window.irab.socket.readyState === 1) {
                        window.irab.send({ type: "CHECK_STATUS" });
                        if (this._readyAnnounced) {
                            clearInterval(checkInterval);
                        }
                    } else {
                        clearInterval(checkInterval);
                    }
                }, 2000);
            };
            
            window.irab.socket.addEventListener('message', (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'LOAD_PROGRESS') this.handleLoadProgress(msg.data);
                    if (msg.type === 'SYSTEM_GREETING') this.addMessage('system', msg.data);
                    if (msg.type === 'COMMAND') {
                        const { action, params } = msg.data;
                        console.log("[IRAB] Executing action:", action, params);
                        
                        if (action === 'nudge') this.nudge(true);
                        else if (action === 'wink') this.playWink(params[0] || 'thumb');
                        else if (action === 'showAsset') this.renderAsset(params[0]);
                        else if (action === 'injectCode') this.injectCode(params[0]);
                        else if (action === 'navigateTo') {
                            const target = (params && (params.target || params[0])) || null;
                            if (target && window.tools && window.openWindow) {
                                const tool = window.tools.find(t => t.id === target);
                                if (tool) window.openWindow(tool);
                                else console.warn("[IRAB] navigateTo target not found:", target);
                            }
                        }
                        else if (action === 'openTool') {
                            if (window.openWindow) {
                                const tool = window.tools?.find(t => t.id === params[0]);
                                if (tool) window.openWindow(tool);
                                else console.warn("[IRAB] Tool not found:", params[0]);
                            }
                        }
                        
                        // Broadcast via EventBus
                        if (window.RedGlitchEventBus) {
                            window.RedGlitchEventBus.emit('ai:command', msg.data);
                        }
                    }
                } catch(e) {
                    console.error("[IRAB] Socket message error:", e);
                }
            });
        }

        const avatar = document.getElementById('irab-avatar');
        if (avatar) avatar.onclick = () => this.toggleChat();

        const input = document.getElementById('irab-chat-input');
        if (input) {
            input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); } };
        }

        this.loadSettings();
        this.updateSessionList();
        this.startIsms();
    },

    startIsms() {
        if (this.ismsInterval) clearInterval(this.ismsInterval);
        this.ismsInterval = setInterval(() => {
            if (Math.random() > 0.5) { 
                const ism = this.irabIsms[Math.floor(Math.random() * this.irabIsms.length)];
                this.showBalloon(ism);
            }
        }, 10000); // Check every 10s
    },

    // --- SESSION MANAGEMENT ---
    async updateSessionList() {
        const listEl = document.getElementById('irab-session-list');
        if (!listEl) return;
        try {
            const res = await fetch(this.getApiUrl('/api/history/list'));
            const sessions = await res.json();
            listEl.innerHTML = '';
            sessions.forEach(id => {
                const item = document.createElement('div');
                item.className = 'irab-quick-action';
                item.style.fontSize = '9px';
                item.style.textAlign = 'left';
                item.style.padding = '2px 5px';
                if (id === this.currentSessionId) item.style.borderLeft = '3px solid #0054E3';
                item.textContent = `📅 ${id}`;
                item.onclick = () => this.switchSession(id);
                listEl.appendChild(item);
            });
        } catch(e) {}
    },

    newSession() {
        // window.prompt is often unsupported in Electron/Sandbox
        const now = new Date();
        const defaultName = "session_" + now.getFullYear() + (now.getMonth()+1) + now.getDate() + "_" + now.getHours() + now.getMinutes();
        this.switchSession(defaultName, true);
    },

    async switchSession(id, isNew = false) {
        this.currentSessionId = id;
        const msgs = document.getElementById('irab-chat-messages');
        if (msgs) msgs.innerHTML = '';
        if (!isNew) {
            await this.loadHistory();
        } else {
            this.addMessage('bot', `GRRR... NEW SESSION [${id}] STARTED!`);
            this.saveHistory();
        }
        this.updateSessionList();
    },

    async saveHistory() {
        const msgs = document.getElementById('irab-chat-messages');
        if (!msgs) return;
        const history = [];
        msgs.querySelectorAll('.irab-msg').forEach(msg => {
            const type = msg.classList.contains('user') ? 'user' : 'bot';
            const bubble = msg.querySelector('.irab-msg-bubble');
            if (bubble && !msg.id.includes('loading')) {
                history.push({ type, text: bubble.textContent });
            }
        });
        try {
            await fetch(this.getApiUrl('/api/history/save'), {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    history, 
                    session_id: this.currentSessionId 
                })
            });
        } catch(e) {}
    },

    async loadHistory() {
        try {
            const res = await fetch(this.getApiUrl(`/api/history/load?session_id=${this.currentSessionId}`));
            const history = await res.json();
            const msgs = document.getElementById('irab-chat-messages');
            if (msgs) {
                msgs.innerHTML = '';
                if (history.length > 0) {
                    history.forEach(msg => this.addMessage(msg.type, msg.text, false));
                }
            }
        } catch(e) {}
    },

    // --- VISUAL & AUDIO ---
    playSound(type) {
        if (!this._audioEnabled) return;
        const audio = new Audio(this.sounds[type]);
        audio.volume = 0.4;
        audio.play().catch(e => {});
    },

    handleToken(token) {
        if (token === null) {
            this.currentBotMsg = null;
            this.saveHistory();
            return;
        }

        if (!this.currentBotMsg) {
            this.openChat(); // Auto-open on first token
            this.currentBotMsg = this.addMessage('bot', "", false);
            this.playSound('msg');
            
            // UI Persona Enforcement: If model starts without GRRR, add it.
            if (token && !token.startsWith("GRRR")) {
                const bubble = this.currentBotMsg.querySelector('.irab-msg-bubble');
                bubble.textContent = "GRRR... ";
            }
        }
        const bubble = this.currentBotMsg.querySelector('.irab-msg-bubble');
        bubble.textContent += token;
        const msgs = document.getElementById('irab-chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
        if (token.includes(']]')) this.saveHistory();
    },

    handleState(state) {
        const dot = document.getElementById('irab-status-dot');
        const st = document.getElementById('irab-status-text');
        if (!dot || !st) return;

        if (state === 'THINKING') {
            dot.className = 'irab-status-dot thinking';
            st.textContent = 'IRAB is thinking...';
            this.currentBotMsg = null; // Ensure new bubble for prompt response
        } else if (state === 'CONNECTING') {
            dot.className = 'irab-status-dot';
            dot.style.background = '#f1c40f'; // Yellow
            st.textContent = 'Connecting...';
        } else if (state === 'OFFLINE') {
            dot.className = 'irab-status-dot';
            dot.style.background = '#e74c3c'; // Red
            st.textContent = 'Offline (Reconnecting)';
        } else {
            dot.className = 'irab-status-dot';
            dot.style.background = '#00CC00'; // Green
            st.textContent = 'Online';
            this.currentBotMsg = null;
            this.saveHistory();
        }
    },

    handleLoadProgress(data) {
        const { percent, status } = data;
        let pMsg = document.getElementById('irab-loading-msg');
        const input = document.getElementById('irab-chat-input');
        
        // Disable input while loading
        if (input) {
            input.disabled = (percent < 100);
            input.placeholder = (percent < 100) ? `Initializing... (${percent}%)` : "Type a message...";
        }

        // If brain is already 100%, just announce it once and return
        if (percent >= 100) {
            if (pMsg) {
                pMsg.querySelector('.irab-progress-fill').style.width = '100%';
                pMsg.querySelector('.irab-progress-text').textContent = "GRRR... READY!";
                setTimeout(() => { 
                    if (pMsg) pMsg.remove(); 
                }, 3000);
            }
            
            if (!this._readyAnnounced) {
                this._readyAnnounced = true;
                this.showBalloon("GRRR... SYSTEM ONLINE!");
                // Final greeting if chat is empty
                const msgs = document.getElementById('irab-chat-messages');
                if (msgs && msgs.children.length <= 1) {
                    this.addMessage('system', "IRAB is fully awake and ready to pixelate!");
                }
            }
            return;
        }

        // Below 100%: Ensure loading UI exists
        if (!pMsg) {
            this.openChat();
            pMsg = this.addProgressMessage("GRRR... INITIALIZING ENGINE...");
            pMsg.id = 'irab-loading-msg';
            this.showBalloon("GRRR... WAKING UP...");
            
            // Add initial system message to chat
            this.addMessage('system', "IRAB is currently loading its neural networks. Please wait...");
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
                <div class="irab-msg-name bot">IRAB</div>
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
        else if (type === 'user') { av.style.background = '#0066CC'; av.innerHTML = '<div style="color:#FFF;font-weight:bold;display:flex;height:100%;align-items:center;justify-content:center;">U</div>'; }
        else { av.style.background = '#FFB300'; av.innerHTML = '<div style="color:#FFF;display:flex;height:100%;align-items:center;justify-content:center;">ℹ</div>'; }
        const bd = document.createElement('div');
        bd.className = 'irab-msg-body';
        const nr = document.createElement('div');
        nr.innerHTML = `<span class="irab-msg-name ${type}">${type === 'user' ? 'You' : 'IRAB'}</span><span class="irab-msg-time">${new Date().toLocaleTimeString()}</span>`;
        const bb = document.createElement('div');
        bb.className = 'irab-msg-bubble';
        bb.textContent = text;
        bd.appendChild(nr); bd.appendChild(bb);
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
        
        // --- PHASE 4 FIX: Always force new bubble for AI response ---
        this.currentBotMsg = null;
        
        if (window.irab) window.irab.prompt(text);
    },

    showBalloon(text) {
        const b = document.getElementById('irab-balloon');
        const t = document.getElementById('irab-balloon-text');
        if (!b || !t) return;
        t.textContent = text;
        b.classList.add('show');
        clearTimeout(this.balloonTimer);
        this.balloonTimer = setTimeout(() => b.classList.remove('show'), 8000);
    },

    dismissBalloon() {
        const b = document.getElementById('irab-balloon');
        if (b) b.classList.remove('show');
        clearTimeout(this.balloonTimer);
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
            c.classList.add('show'); 
            this.loadSettings(); 
            const m = document.getElementById('irab-chat-messages');
            if (m && m.children.length === 0) this.loadHistory();
            setTimeout(() => document.getElementById('irab-chat-input').focus(), 200); 
        }
    },
    
    closeChat() { document.getElementById('irab-chat').classList.remove('show'); },
    toggleChat() { document.getElementById('irab-chat').classList.contains('show') ? this.closeChat() : this.openChat(); },
    toggleSettings() { document.getElementById('irab-settings').classList.toggle('show'); },
    nudge(isAITriggered = false) {
        const c = document.getElementById('irab-chat');
        if (c) { 
            this.playSound('nudge');
            c.style.animation = 'irabNudge 0.5s'; 
            setTimeout(() => c.style.animation = '', 500); 
            if (!isAITriggered && window.irab) window.irab.send({ type: "PROMPT", data: "*NUDGE*" });
        }
    },

    saveSettings() {
        const settings = {
            temperature: parseFloat(document.getElementById('irab-setting-temperature').value),
            max_tokens: parseInt(document.getElementById('irab-setting-max-tokens').value),
            gpu_layers: parseInt(document.getElementById('irab-setting-gpu-layers').value),
            personality: document.getElementById('irab-setting-personality').checked,
            personality_text: document.getElementById('irab-setting-personality-text').value,
            audio: document.getElementById('irab-setting-audio')?.checked ?? true
        };
        this._audioEnabled = settings.audio;
        localStorage.setItem('irab_native_settings', JSON.stringify(settings));
        if (window.irab && window.irab.socket) window.irab.socket.send(JSON.stringify({ type: 'UPDATE_CONFIG', data: settings }));
        this.toggleSettings();
    },

    loadSettings() {
        const saved = localStorage.getItem('irab_native_settings');
        if (saved) {
            try {
                const s = JSON.parse(saved);
                this._audioEnabled = s.audio ?? true;
                if (document.getElementById('irab-setting-temperature')) {
                    document.getElementById('irab-setting-temperature').value = s.temperature;
                    document.getElementById('irab-setting-temperature-val').textContent = s.temperature;
                }
                if (document.getElementById('irab-setting-max-tokens')) document.getElementById('irab-setting-max-tokens').value = s.max_tokens;
                if (document.getElementById('irab-setting-gpu-layers')) document.getElementById('irab-setting-gpu-layers').value = s.gpu_layers;
                if (document.getElementById('irab-setting-personality')) document.getElementById('irab-setting-personality').checked = s.personality;
                if (document.getElementById('irab-setting-personality-text')) document.getElementById('irab-setting-personality-text').value = s.personality_text || "";
                if (document.getElementById('irab-setting-audio')) document.getElementById('irab-setting-audio').checked = this._audioEnabled;
            } catch(e) {}
        }
    },

    takeScreenshot() { this.addMessage('system', "📸 Studio captured!"); },
    
    injectCode(code) {
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.emit('ai:inject-code', { code });
            this.showBalloon("GRRR... CODE INJECTED!");
            this.playSound('msg');
        } else {
            this.addMessage('system', "COULD NOT INJECT CODE: EVENTBUS MISSING.");
        }
    },

    renderAsset(path) {
        const msgs = document.getElementById('irab-chat-messages');
        if (!msgs) return;
        const msg = document.createElement('div');
        msg.className = 'irab-msg bot';
        msg.innerHTML = `
            <div class="irab-msg-avatar" style="background-image: url('/sprite-art/helper.png'); background-size: cover;"></div>
            <div class="irab-msg-body">
                <div class="irab-msg-name bot">IRAB <span class="irab-msg-time">${new Date().toLocaleTimeString()}</span></div>
                <div class="irab-msg-bubble" style="text-align:center;">
                    <div style="font-size:9px; margin-bottom:5px; color:#666;">Asset Preview: ${path}</div>
                    <img src="${path}" style="max-width: 100%; border: 1px solid #808080; background: #FFF; image-rendering: pixelated;">
                </div>
            </div>
        `;
        msgs.appendChild(msg);
        msgs.scrollTop = msgs.scrollHeight;
        this.saveHistory();
    },

    showWinks() { const wink = prompt("Wink: thumb, heart, laugh"); if (wink) this.playWink(wink); },
    playWink(type) {
        const overlay = document.getElementById('irab-wink-overlay');
        if (!overlay) return;
        this.playSound('wink');
        const icons = {
            'heart': '❤️',
            'laugh': '😂',
            'thumb': '👍',
            'rocket': '🚀',
            'fire': '🔥'
        };
        const icon = icons[type] || '👍';
        overlay.innerHTML = `<div class="wink-image" style="background: url('/sprite-art/helper.png') center/contain no-repeat; font-size: 100px; display: flex; align-items: center; justify-content: center;">${icon}</div>`;
        overlay.classList.add('show');
        setTimeout(() => { overlay.classList.remove('show'); overlay.innerHTML = ''; }, 2500);
    },
    showEmoticons() { const icons = ["😊", "😂", "😎"]; const input = document.getElementById('irab-chat-input'); if (input) input.value += icons[Math.floor(Math.random() * icons.length)]; },
    formatText(fmt) { this.addMessage('system', `Formatting [${fmt}] is not supported in this version of MSN.`); },
    changeBackground() { this.addMessage('system', "Feature coming soon!"); },
    
    // --- QUICK ACTIONS ---
    quickHelp() { if (window.irab) window.irab.prompt("How do I use RedGlitch Studio?"); },
    quickTutorial() { if (window.irab) window.irab.prompt("Give me a quick tutorial on engine basics."); },
    quickTips() { if (window.irab) window.irab.prompt("Give me a random pro tip."); },
    
    // --- FUN ZONE ---
    tellJoke() { if (window.irab) window.irab.prompt("Tell me a funny developer joke."); },
    motivate() { if (window.irab) window.irab.prompt("I need some motivation to keep coding!"); }
};

window.addEventListener('load', () => IRAB.init());