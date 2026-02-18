class PlatformerGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new PlatformerRenderer(this.canvas);
        
        this.physics = new PhysicsSystem();
        this.combat = new PlatformerCombatSystem(this);
        this.player = new PlatformerPlayer(50, 50);
        
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

        // Regenerate Level
        if(e.code === 'KeyG' && window.SmartGenerator) {
            console.log('[PlatformerEngine] Regenerating level...');
            const newLevel = window.SmartGenerator.generate({
                width: 100,
                height: 20,
                theme: 'flow',
                difficulty: 5
            });
            this.loadLevelFromData(newLevel);
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
        
        // 1. Pre-load assets
        if (window.PlatformerAssetManager) {
            await window.PlatformerAssetManager.load();
        }

        // 2. Load caterpillar sprites (matching RPG core)
        if (window.createPixelImage) {
            this.playerHead = window.createPixelImage('caterpillar_head');
            this.playerBody = window.createPixelImage('caterpillar_body');
            console.log("[PlatformerEngine] Caterpillar sprites loaded");
        }

        if (typeof window.FXSystem !== 'undefined') {
            const ctx = this.canvas.getContext('2d');
            this.fx = new window.FXSystem(ctx, this.canvas.width, this.canvas.height);
            // Ensure popText exists or add a dummy to prevent crashes
            if (!this.fx.popText) {
                this.fx.popText = (x, y, text, color) => console.log(`[FX Pop] ${text} at ${x},${y}`);
            }
        }
        
        if (typeof window.CampaignSystem !== 'undefined') {
            this.campaignSystem = new window.CampaignSystem(this);
        }
        
        // Force worm mode for the IRAB aesthetic if config says so
        if (this.player && window.PlatformerConfig) {
            this.player.isWorm = window.PlatformerConfig.DEFAULT_PLAYER_MODE === 'WORM';
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
        
        // Reset Parallax
        this.renderer.parallax.clear();
        if (window.PlatformerAssetManager) {
            const bgForest = window.PlatformerAssetManager.get('bg_forest');
            if (bgForest) {
                this.renderer.addParallaxLayer(bgForest, 0.2, 0.1, 1.0);
            }
        }

        // Default tileset for platformer if not specified
        const tilesetPath = this.map.tilesetPath || 'WORLD_PIXEL_ART';
        await this.renderer.loadTileset(tilesetPath);
        
        // Robust Spawn Detection (handles multiple formats)
        if(this.map.spawn) {
            this.player.x = (this.map.spawn.x || 0) * 32;
            this.player.y = (this.map.spawn.y || 0) * 32;
        } else if (this.map.spawnX !== undefined) {
            this.player.x = this.map.spawnX;
            this.player.y = this.map.spawnY;
        } else {
            // Safe fallback
            this.player.x = 100; 
            this.player.y = 100;
        }
        
        // Force worm mode and sprites
        this.player.isWorm = true;
        this.player.playerHead = this.playerHead;
        this.player.playerBody = this.playerBody;
        
        this.player.vx = 0; this.player.vy = 0;
        this.player.history = [];
        
        if(this.map.collectibles) this.map.collectibles.forEach(c => this._addCollectible(c));
        if(this.map.checkpoints) this.map.checkpoints.forEach(cp => this._addCheckpoint(cp));
        if(this.map.entities) this.map.entities.forEach(e => this._addEntity(e));

        // Unified Decoration & Object Loader
        if (this.map.decorations) {
            this.map.decorations.forEach(d => {
                if (d.type === 'coin' || d.type === 'item') this._addCollectible(d);
                else if (d.type === 'checkpoint') this._addCheckpoint(d);
                else if (d.type === 'platform_moving') this._addMovingPlatform(d);
                else if (d.type === 'enemy' || d.type === 'npc' || d.type === 'hazard') this._addEntity(d);
                // Note: prefabs and static deco tiles stay in this.map.decorations for the renderer
            });
        }
        
        // Finalize
        console.log(`[PlatformerEngine] Level "${this.currentLevelId}" setup complete.`);
    }

    _addMovingPlatform(d) {
        const plat = new PlatformerMovingPlatform(d.x, d.y);
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
        if (e.type === 'enemy') {
            const enemy = new PlatformerEnemy(e.x, e.y, e.sprite || 'slime');
            if (e.behavior) enemy.behavior = e.behavior;
            this.entities.push(enemy);
        } else if (e.type === 'enemy_flying') {
            const enemy = new PlatformerFlyingEnemy(e.x, e.y, e.sprite || 'bat');
            if (e.behavior) enemy.behavior = e.behavior;
            this.entities.push(enemy);
        } else if (e.type === 'enemy_shooter') {
            const enemy = new PlatformerShooterEnemy(e.x, e.y, e.sprite || 'goblin');
            this.entities.push(enemy);
        } else if (e.type === 'pushable') {
            this.entities.push(new PlatformerPushableBlock(e.x, e.y, e.w || 32, e.h || 32));
        } else {
            this.entities.push({ ...e, x: e.x * 32, y: e.y * 32, w: 24, h: 32, vx: 0, vy: 0, behavior: e.behavior || 'static' });
        }
    }

    _handlePushing() {
        this.entities.forEach(ent => {
            if (ent instanceof PlatformerPushableBlock) {
                // Horizontal push
                const footY = this.player.y + this.player.h;
                const headY = this.player.y;
                const blockFootY = ent.y + ent.h;
                const blockHeadY = ent.y;

                // Vertical overlap
                if (footY > blockHeadY + 4 && headY < blockFootY - 4) {
                    const dist = Math.abs((this.player.x + this.player.w/2) - (ent.x + ent.w/2));
                    const minDist = (this.player.w + ent.w) / 2;

                    if (dist < minDist + 2) {
                        const dir = Math.sign((ent.x + ent.w/2) - (this.player.x + this.player.w/2));
                        const playerPushing = (dir > 0 && (this.keys['ArrowRight'] || this.keys['KeyD'])) ||
                                              (dir < 0 && (this.keys['ArrowLeft'] || this.keys['KeyA']));
                        
                        if (playerPushing) {
                            ent.vx = this.player.vx * 0.8;
                            this.player.vx *= 0.5;
                        }
                    }
                }
            }
        });
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
        this._handlePushing();
        
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
        
        this.combat.update(dt);
        this._updateEntities();
        this._checkCollectibles();
        this._checkCheckpoints();
        this._checkGoal();
        this._checkDeathZones();
    }

    _updateEntities() {
        this.entities.forEach(ent => {
            if (ent.update) {
                ent.update(1/60, this.map);
            } else if(ent.behavior === 'patrol') {
                if(!ent.patrolDir) ent.patrolDir = 1;
                ent.vx = ent.patrolDir * 0.5;
                const nextX = ent.x + ent.vx * 5;
                const tileX = Math.floor(nextX / 32);
                const tileY = Math.floor(ent.y / 32);
                if(this.physics.getTile(this.map, tileX, tileY) === 1) ent.patrolDir *= -1;
            }
            this.physics.apply(ent, this.map, this.platforms);
        });
        
        // Remove dead entities
        this.entities = this.entities.filter(ent => !ent.isDead);
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
        this.combat.draw(this.renderer);
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

// Auto-init logic (Skip if in Campaign mode)
window.addEventListener('load', () => {
    if (window.CAMPAIGN_RUNTIME_MODE) {
        console.log('[PlatformerEngine] Campaign mode detected, skipping auto-init');
        return;
    }

    if (!window.game) window.game = new PlatformerGame();
    if (document.getElementById('demo-title')) window.game.init();
    else if (window.AtmosphereSystem) {
        window.atmosphere = new window.AtmosphereSystem();
        window.atmosphere.start();
    }
});
