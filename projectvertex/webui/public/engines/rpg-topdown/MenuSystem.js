window.MenuSystem = class MenuSystem {
    constructor(gameInstance) {
        this.game = gameInstance; this.currentUser = "GUEST";  this.music = document.getElementById('menu-music');
        this.uiSystem = this.game.uiSystem; // Shared instance
        this.screens = { 
            login: document.getElementById('login-screen'), 
            mainMenu: document.getElementById('main-menu'), 
            overlay: document.getElementById('overlay-screen'), 
            game: document.getElementById('game-container'), 
            pause: document.getElementById('pause-menu'),
            skill_selector: document.getElementById('skill-selector-screen'),
            inventory: document.getElementById('inventory-screen'),
            settings: document.getElementById('settings-screen')
        };
        this.pauseState = { main: document.getElementById('pause-main'), options: document.getElementById('pause-options') };
        this.init();
    }
    async init() { 
        await this.uiSystem.init(); 
        this.setupEventListeners(); 
        
        // Preload Definitions for UI (Skills, etc.)
        await this.game.loadDefinitions();

        // Check for campaign mode first
        if (window.CAMPAIGN_MODE && window.CAMPAIGN_DATA && window.CAMPAIGN_SETTINGS) {
            await this.startCampaignMode();
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const isPlaytest = urlParams.get('playtest') === 'true' || urlParams.get('playtest') === '1';
        if (isPlaytest) {
            await this.startTestMode(urlParams);
            return;
        }

        const savedName = localStorage.getItem('redglitch_username'); 
        if (savedName) this.login(savedName); 
    }
    async startTestMode(urlParams = new URLSearchParams(window.location.search)) {
        // Phase 28: Unified playtest data from sessionStorage
        const raw = sessionStorage.getItem('redglitch_playtest_data') || 
                   localStorage.getItem('redglitch_test_map') || 
                   localStorage.getItem('temp_playtest');
        if (!raw) {
            console.error('[RPG Playtest] No map data found in localStorage.');
            return;
        }

        const requestedSession = urlParams.get('session');
        const latestSession = localStorage.getItem('redglitch_test_session');
        if (requestedSession && latestSession && requestedSession !== latestSession) {
            console.log(`[RPG Playtest] Ignoring stale playtest session: ${requestedSession}`);
            return;
        }

        let mapData = null;
        try {
            mapData = JSON.parse(raw);
        } catch (error) {
            console.error('[RPG Playtest] Invalid playtest map payload:', error);
            return;
        }

        this.screens.login.classList.add('hidden');
        this.screens.mainMenu.classList.add('hidden');
        const loadScreen = document.getElementById('loading-screen');
        if (loadScreen) loadScreen.classList.remove('hidden');

        await this.game.start("DEV_TESTER", true, { skipInitialLevelLoad: true });
        await this.game.loadLevelFromData(mapData);

        if (loadScreen) loadScreen.classList.add('hidden');
        this.switchScreen('game');
    }
    setupEventListeners() {
        const bindClick = (id, fn) => { 
            const el = document.getElementById(id); 
            if (el) el.addEventListener('click', fn); 
        };

        const clickHandlers = {
            'login-btn': () => {
                const input = document.getElementById('username-input');
                const name = input?.value.trim().toUpperCase();
                if (name && name.length > 0) { this.login(name); this.playMusic(); }
                else alert("PLEASE ENTER A NAME!");
            },
            'btn-new-game': () => this.startGame(true),
            'btn-load-game': () => this.startGame(false),
            'btn-engine': () => window.location.href = '/tools.html',
            'btn-cheats': () => this.showOverlay('CHEATS', 'God Mode: OFF\nInfinite Gold: OFF'),
            'btn-settings': () => this.showOverlay('SETTINGS', 'Use In-Game Menu for Settings'),
            'btn_credits': () => window.location.href = 'credits.html',
            'btn-logout': () => this.logout(),
            'btn-close-overlay': () => { this.screens.overlay.classList.add('hidden'); this.screens.overlay.classList.remove('active'); },
            'pause-btn': () => this.togglePause(),
            'btn-resume': () => this.togglePause(),
            'btn-options': () => { if(this.pauseState.main) this.pauseState.main.classList.add('hidden'); if(this.pauseState.options) this.pauseState.options.classList.remove('hidden'); },
            'btn-quit': () => this.quitGame(),
            'btn-options-back': () => { if(this.pauseState.options) this.pauseState.options.classList.add('hidden'); if(this.pauseState.main) this.pauseState.main.classList.remove('hidden'); }
        };

        for (const [id, handler] of Object.entries(clickHandlers)) {
            bindClick(id, handler);
        }

        const langSelect = document.getElementById('lang-select'); 
        if (langSelect) { 
            langSelect.value = localStorage.getItem('redglitch_lang') || 'EN'; 
            langSelect.addEventListener('change', (e) => { window.LOCALE.setLanguage(e.target.value); }); 
        }

        const touchBtn = document.getElementById('opt-touch-toggle'); 
        if (touchBtn) { 
            touchBtn.addEventListener('click', () => { 
                const mc = document.getElementById('mobile-controls'); 
                if (touchBtn.textContent === "ON") { 
                    touchBtn.textContent = "OFF"; 
                    if(mc) mc.classList.add('hidden'); 
                } else { 
                    touchBtn.textContent = "ON"; 
                    if(mc) mc.classList.remove('hidden'); 
                } 
            }); 
        }

        const invSlots = document.querySelectorAll('.inv-slot'); 
        invSlots.forEach((slot, idx) => { 
            slot.addEventListener('click', () => { 
                const item = this.game.inventory[idx]; 
                if (item) this.game.useItem(idx); 
                else { invSlots.forEach(s => s.classList.remove('selected')); slot.classList.add('selected'); } 
            }); 
        });

        window.addEventListener('keydown', (e) => { 
            if (e.key === 'Escape' && this.game.isRunning) this.togglePause(); 
            if (e.key === 'e' && this.game.isRunning && (!this.game.isPaused || this.uiSystem.activeScreen === 'inventory')) this.toggleInventory();
        });
    }
    async playMusic() { }
    stopMusic() { if (this.music) { this.music.pause(); this.music.currentTime = 0; } if (this.game && this.game.audio) this.game.audio.stopAll(); }
    async login(name) { this.currentUser = name; localStorage.setItem('redglitch_username', name); const display = document.getElementById('current-user-display'); if (display) display.textContent = name; localStorage.removeItem('redglitch_character'); try { const res = await fetch(`/api/profile/${name}`); if (res.ok) { const p = await res.json(); localStorage.setItem('redglitch_character', JSON.stringify(p)); if (this.game) this.game.loadProfileData(p); } } catch (e) {} this.switchScreen('mainMenu'); }
    logout() { this.currentUser = "GUEST"; localStorage.removeItem('redglitch_username'); localStorage.removeItem('redglitch_character'); document.getElementById('username-input').value = ""; this.switchScreen('login'); }
    switchScreen(screenName) {
        Object.values(this.screens).forEach(el => { if (el) { el.classList.remove('active'); el.classList.add('hidden'); } });
        const target = this.screens[screenName]; if (target) { target.classList.remove('hidden'); target.classList.add('active'); }

        // FIX: Ensure game is visible behind pause menu (needed when returning from Settings)
        if (screenName === 'pause') {
            if (this.screens.game) this.screens.game.classList.remove('hidden');
        }

        if (screenName === 'mainMenu') { this.uiSystem.showScreen('main_menu'); }
        else if (screenName === 'pause') { this.uiSystem.showScreen('pause_menu'); }
        else if (screenName === 'skill_selector') { this.uiSystem.showScreen('skill_selector'); }
        else if (screenName === 'inventory') { this.uiSystem.showScreen('inventory'); }
        else if (screenName === 'settings') { this.uiSystem.showScreen('settings_menu'); }
        else { const old = document.getElementById('dynamic-ui-root'); if (old) old.remove(); }
        
        if (screenName === 'game') {
            this.screens.game.style.display = 'block'; 
            this.screens.game.classList.remove('hidden'); 
            this.stopMusic(); 
            this.uiSystem.showScreen('hud'); 
            if(this.game.refreshUI) this.game.refreshUI();
        } else { if (this.currentUser !== "GUEST") this.playMusic(); }
    }
    showOverlay(title, body) { document.getElementById('overlay-title').textContent = title; document.getElementById('overlay-body').textContent = body; this.screens.overlay.classList.remove('hidden'); this.screens.overlay.classList.add('active'); } 
    async startGame(isNew) { 
        const loadScreen = document.getElementById('loading-screen'); const bar = document.getElementById('game-loading-bar'); const text = document.getElementById('game-loading-text');
        loadScreen.classList.remove('hidden'); if(this.screens.mainMenu) this.screens.mainMenu.classList.add('hidden');
        
        let loadProgress = 0;
        const progressInterval = setInterval(() => {
            if (loadProgress < 90) {
                loadProgress += Math.random() * 5;
                if (loadProgress > 90) loadProgress = 90;
                bar.style.width = `${Math.floor(loadProgress)}%`; 
                text.textContent = `${Math.floor(loadProgress)}%`;
            }
        }, 50);

        try {
            await this.game.start(this.currentUser, isNew);
        } finally {
            clearInterval(progressInterval);
            bar.style.width = '100%'; 
            text.textContent = '100%'; 
            await new Promise(r => setTimeout(r, 200));
            loadScreen.classList.add('hidden'); 
            this.switchScreen('game'); 
        }
    }
    togglePause() { 
        const hud = document.getElementById('game-hud'); 
        if (this.game.isPaused) { 
            // RESUME
            this.game.isPaused = false; 
            this.switchScreen('game'); // Proper cleanup
        } else { 
            // PAUSE
            this.game.isPaused = true; 
            this.switchScreen('pause'); // Use switchScreen for pause too for consistency?
            // But existing logic was manual. Let's keep manual for PAUSE to avoid full redraw if desired, 
            // BUT for RESUME we must use switchScreen to clear Inventory/Settings overlays.
        } 
    }
    toggleInventory() {
        if (this.uiSystem.activeScreen === 'inventory') {
            this.game.isPaused = false;
            this.switchScreen('game');
        } else {
            this.game.isPaused = true;
            this.switchScreen('inventory');
        }
    }
    showDynamicScreen(screenId) {
        // For user-defined screens from ui.json, dynamically create a container if needed
        if (!this.screens[screenId]) {
            const container = document.createElement('div');
            container.id = `dynamic-screen-${screenId}`;
            container.className = 'screen hidden';
            container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1500;';
            document.body.appendChild(container);
            this.screens[screenId] = container;
        }
        // Hide all screens, show target + render UI
        Object.values(this.screens).forEach(el => { if (el) { el.classList.remove('active'); el.classList.add('hidden'); } });
        // Keep game visible behind overlay screens
        if (this.screens.game && this.game.isRunning) this.screens.game.classList.remove('hidden');
        const target = this.screens[screenId];
        if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
        this.uiSystem.showScreen(screenId);
    }
    quitGame() { 
        // Check if campaign mode and quit to launcher
        if (window.CAMPAIGN_MODE) {
            window.location.href = 'campaign_launcher.html';
        } else {
            this.game.stop(); 
            this.game.isPaused = false; 
            this.screens.pause.classList.add('hidden'); 
            this.switchScreen('mainMenu'); 
        }
    }
    
    async startCampaignMode() {
        console.log('[MenuSystem] Starting campaign mode...');
        
        const { campaignId, shouldContinue, saveSlot } = window.CAMPAIGN_SETTINGS;
        const campaignData = window.CAMPAIGN_DATA;
        
        // Auto-login with username (use saved or default)
        let username = sessionStorage.getItem('redglitch_username');
        if (!username) {
            username = localStorage.getItem('redglitch_username') || 'PLAYER';
        }
        
        this.currentUser = username;
        localStorage.setItem('redglitch_username', username);
        
        // Skip login screen, go straight to loading
        this.screens.login.classList.add('hidden');
        this.screens.mainMenu.classList.add('hidden');
        
        const loadScreen = document.getElementById('loading-screen');
        const bar = document.getElementById('game-loading-bar');
        const text = document.getElementById('game-loading-text');
        
        loadScreen.classList.remove('hidden');
        bar.style.width = '10%';
        text.textContent = 'Initializing Campaign...';
        
        try {
            // Initialize game
            await this.game.start(this.currentUser, !shouldContinue);
            bar.style.width = '40%';
            text.textContent = 'Loading Campaign Data...';
            
            // Set campaign data in the CampaignSystem
            if (this.game.campaign) {
                this.game.campaign.data = campaignData;
                
                // Check if multi-engine and initialize controller
                if (this.game.campaign._isMultiEngineCampaign()) {
                    await this.game.campaign._initController();
                    bar.style.width = '60%';
                    text.textContent = 'Starting Campaign...';
                    
                    // Start or continue campaign
                    if (shouldContinue) {
                        // Load campaign state
                        const stateResponse = await fetch(`/api/campaign-state/${username}`);
                        if (stateResponse.ok) {
                            const state = await stateResponse.json();
                            if (state.campaignId === campaignId && this.game.campaign.controller) {
                                await this.game.campaign.controller.loadCampaignState(state);
                                bar.style.width = '80%';
                                text.textContent = 'Resuming Campaign...';
                                // Resume from saved node
                                await this.game.campaign.controller.processNode(state.currentNodeId);
                            } else {
                                // State mismatch, start fresh
                                await this.game.campaign.start();
                            }
                        } else {
                            // No save found, start fresh
                            await this.game.campaign.start();
                        }
                    } else {
                        // New campaign
                        await this.game.campaign.start();
                    }
                } else {
                    // Single engine campaign - use normal flow
                    await this.game.campaign.start();
                }
                
                bar.style.width = '100%';
                text.textContent = 'Campaign Ready!';
                await new Promise(r => setTimeout(r, 500));
                
                loadScreen.classList.add('hidden');
                this.switchScreen('game');
                
            } else {
                throw new Error('Campaign system not available');
            }
        } catch (error) {
            console.error('[MenuSystem] Campaign start failed:', error);
            alert('Failed to start campaign: ' + error.message);
            window.location.href = 'campaign_launcher.html';
        }
    }
}
