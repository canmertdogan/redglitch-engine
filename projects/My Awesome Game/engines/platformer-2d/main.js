class PlatformerGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new PlatformerRenderer(this.canvas);
        
        this.physics = new PhysicsSystem();
        this.player = new Player(50, 50);
        
        this.map = null;
        this.currentLevelId = null;
        this.keys = {};
        this.entities = [];
        this.platforms = []; // List of MovingPlatforms
        this.collectibles = [];
        this.checkpoints = [];
        this.lastCheckpoint = null;
        
        this.fx = null;
        this.campaignSystem = null;
        this.username = null;
        
        this.isRunning = false;
        this.isPaused = false;
        this.levelComplete = false;
        
        this.time = 12; 
        this.timeSpeed = 0.1; 

        this.onLevelComplete = null;

        window.addEventListener('keydown', e => this.handleKeyDown(e));
        window.addEventListener('keyup', e => this.handleKeyUp(e));
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }

    handleKeyDown(e) {
        this.keys[e.code] = true;
        if(e.code === 'Escape' && !this.isPaused) this.pause();
        
        // Mode Toggle
        if(e.code === 'KeyM') {
            this.player.isWorm = !this.player.isWorm;
            console.log(`[PlatformerEngine] Player Mode: ${this.player.isWorm ? 'WORM' : 'SPRITE'}`);
        }
    }

    handleKeyUp(e) {
        this.keys[e.code] = false;
    }

    resize() {
        this.renderer.resize(window.innerWidth, window.innerHeight);
    }

    pause() {
        this.isPaused = true;
        console.log('[PlatformerEngine] Paused');
    }

    resume() {
        this.isPaused = false;
        console.log('[PlatformerEngine] Resumed');
    }

    async init() {
        console.log("[PlatformerEngine] Initializing...");
        if (typeof window.FXSystem !== 'undefined') {
            this.fx = new window.FXSystem(this.canvas.getContext('2d'), this.canvas.width, this.canvas.height);
        }
        if (typeof window.CampaignSystem !== 'undefined') {
            this.campaignSystem = new window.CampaignSystem(this);
        }
        const loading = document.getElementById('loading-screen');
        if(loading) loading.classList.add('hidden');
        const container = document.getElementById('game-container');
        if(container) container.classList.remove('hidden');
    }

    async loadLevel(levelId, levelPath = null) {
        this.currentLevelId = levelId;
        this.levelComplete = false;
        try {
            const path = levelPath || `dunyalar/platformer/${levelId}.json`;
            const res = await fetch(path);
            if(res.ok) {
                this.map = await res.json();
            } else {
                this.map = this._createFallbackLevel();
            }
        } catch(e) {
            this.map = this._createFallbackLevel();
        }
        await this._setupLevel();
        this.isRunning = true;
        this.loop();
    }

    async loadLevelFromData(levelData) {
        this.currentLevelId = levelData.name || 'playtest';
        this.levelComplete = false;
        this.map = levelData;
        await this._setupLevel();
        this.isRunning = true;
        this.loop();
    }

    _createFallbackLevel() {
        return { width: 50, height: 20, collision: new Array(50 * 20).fill(0), spawn: { x: 2, y: 15 }, goal: { x: 45, y: 15 }, collectibles: [], entities: [] };
    }

    async _setupLevel() {
        this.entities = [];
        this.platforms = [];
        this.collectibles = [];
        this.checkpoints = [];
        
        if (this.map.tilesetPath) {
            await this.renderer.loadTileset(this.map.tilesetPath);
        }
        
        if(this.map.spawn) {
            this.player.x = this.map.spawn.x * 32;
            this.player.y = this.map.spawn.y * 32;
        } else {
            this.player.x = 64; this.player.y = 64;
        }
        
        this.player.vx = 0; this.player.vy = 0;
        this.player.history = [];
        
        if(this.map.collectibles) this.map.collectibles.forEach(c => this._addCollectible(c));
        if(this.map.checkpoints) this.map.checkpoints.forEach(cp => this._addCheckpoint(cp));
        if(this.map.entities) this.map.entities.forEach(e => this._addEntity(e));

        if (this.map.decorations) {
            this.map.decorations.forEach(d => {
                if (d.type === 'coin' || d.type === 'item') this._addCollectible(d);
                else if (d.type === 'checkpoint') this._addCheckpoint(d);
                else if (d.type === 'platform_moving') this._addMovingPlatform(d);
                else if (d.type === 'enemy' || d.type === 'npc' || d.type === 'hazard') this._addEntity(d);
            });
        }
    }

    _addMovingPlatform(d) {
        const plat = new MovingPlatform(d.x, d.y);
        // Add a simple back-and-forth waypoint if none exist
        plat.addWaypoint(d.x, d.y);
        plat.addWaypoint(d.x + 5, d.y);
        this.platforms.push(plat);
    }

    _addCollectible(c) {
        this.collectibles.push({ ...c, x: c.x * 32, y: c.y * 32, w: 16, h: 16, collected: false, type: c.type || 'coin' });
    }

    _addCheckpoint(cp) {
        this.checkpoints.push({ x: cp.x * 32, y: cp.y * 32, w: 32, h: 64, activated: false });
    }

    _addEntity(e) {
        this.entities.push({ ...e, x: e.x * 32, y: e.y * 32, w: 24, h: 32, vx: 0, vy: 0, behavior: e.behavior || (e.type === 'enemy' ? 'patrol' : 'static') });
    }

    update() {
        if(this.isPaused || this.levelComplete) return;

        const dt = 1/60;

        // 1. Update Platforms First
        this.platforms.forEach(p => p.update(dt, this.map));

        // 2. Handle Player
        this.player.handleInput(this.keys);
        this.player.update(dt, this.map);
        this.physics.apply(this.player, this.map, this.platforms);
        
        // 3. Environment & Effects
        if (this.fx) {
            this.time = (this.time + this.timeSpeed * dt) % 24;
            this.fx.setTime(this.time);
            this.fx.setWeather(this.map?.weather || 'none');
            this.fx.update(dt);
        }

        if (this.map && this.map.width) {
            this.renderer.updateCamera(this.player, this.map.width, this.map.height);
        }
        
        this._updateEntities();
        this._checkCollectibles();
        this._checkCheckpoints();
        this._checkGoal();
        this._checkDeathZones();
    }

    _updateEntities() {
        this.entities.forEach(ent => {
            if(ent.behavior === 'patrol') {
                if(!ent.patrolDir) ent.patrolDir = 1;
                ent.vx = ent.patrolDir * 0.5;
                const nextX = ent.x + ent.vx * 5;
                const tileX = Math.floor(nextX / 32);
                const tileY = Math.floor(ent.y / 32);
                if(this.physics.getTile(this.map, tileX, tileY) === 1) ent.patrolDir *= -1;
            }
            this.physics.apply(ent, this.map, this.platforms);
        });
    }

    _checkCollectibles() {
        this.collectibles.forEach(item => {
            if(item.collected) return;
            if(this._collision(this.player, item)) {
                item.collected = true;
                if(item.type === 'coin') this.player.coins++;
                if(this.campaignSystem) this.campaignSystem.incrementVariable('coins', 1);
            }
        });
    }

    _checkCheckpoints() {
        this.checkpoints.forEach(cp => {
            if(cp.activated) return;
            if(this._collision(this.player, cp)) {
                cp.activated = true;
                this.lastCheckpoint = { x: cp.x, y: cp.y };
            }
        });
    }

    _checkGoal() {
        const goalData = this.map.exit || this.map.goal;
        if(!goalData) return;
        const goal = { x: goalData.x * 32, y: goalData.y * 32, w: 32, h: 64 };
        if(this._collision(this.player, goal)) this.completeLevel();
    }

    _checkDeathZones() {
        if(this.player.y > this.map.height * 32) this.respawn();
    }

    _collision(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    respawn() {
        if(this.lastCheckpoint) {
            this.player.x = this.lastCheckpoint.x;
            this.player.y = this.lastCheckpoint.y;
        } else if(this.map.spawn) {
            this.player.x = this.map.spawn.x * 32;
            this.player.y = this.map.spawn.y * 32;
        }
        this.player.vx = 0; this.player.vy = 0;
        this.player.history = [];
    }

    completeLevel() {
        this.levelComplete = true;
        if(this.onLevelComplete) {
            setTimeout(() => {
                this.onLevelComplete({ levelId: this.currentLevelId, coinsCollected: this.player.coins });
            }, 1000);
        }
    }

    draw() {
        this.renderer.render(this.map, this.player, [...this.entities, ...this.platforms], this.collectibles, this.checkpoints);
    }

    loop() {
        if(!this.isRunning) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    login(username) {
        this.username = username;
        const loginScreen = document.getElementById('login-screen');
        if(loginScreen) loginScreen.classList.add('hidden');
        this.init();
    }
}

window.PlatformerGame = PlatformerGame;

window.attemptLogin = () => {
    const input = document.getElementById('username-input');
    if (input && input.value.trim()) {
        window.game.login(input.value.trim().toUpperCase());
    }
};

window.onload = () => {
    if (!window.game) window.game = new PlatformerGame();
    if (document.getElementById('demo-title')) window.game.init();
    else if (window.AtmosphereSystem) {
        window.atmosphere = new window.AtmosphereSystem();
        window.atmosphere.start();
    }
};
