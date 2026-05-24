class PlatformerGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new PlatformerRenderer(this.canvas);
        
        this.physics = new PhysicsSystem();
        this.tileSize = this.physics.tileSize || (window.PlatformerConfig && window.PlatformerConfig.TILE_SIZE) || 32;
        this.combat = new PlatformerCombatSystem(this);
        this.player = new PlatformerPlayer(50, 50);
        
        this.map = null;
        this.currentLevelId = null;
        this.keys = {};
        this.entities = [];
        this.platforms = []; // List of MovingPlatforms
        this.collectibles = [];
        this.checkpoints = [];
        this.dialogueSystem = new window.DialogueSystem();
        this.questSystem = new window.QuestSystem(this);
        this.lastCheckpoint = null;
        
        // Dependencies for systems (Quest, Dialogue)
        this.uiSystem = {
            showNotification: (msg, type) => {
                if (this.fx && this.fx.popText) {
                    this.fx.popText(this.player.x, this.player.y - 50, msg, type === 'error' ? '#e74c3c' : '#f1c40f');
                }
                console.log(`[Notification:${type}] ${msg}`);
            }
        };

        this.audio = window.Sound;
        if (this.audio && !this.audio.ctx) this.audio.init();
        
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
        const w = window.innerWidth;
        const h = window.innerHeight;
        
        this.renderer.resize(w, h);
        if (this.fx) this.fx.resize(w, h);
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

        await this.dialogueSystem.init();
        await this.questSystem.init();
        
        // Force worm mode for the IRAB aesthetic if config says so
        if (this.player && window.PlatformerConfig) {
            this.player.isWorm = window.PlatformerConfig.DEFAULT_PLAYER_MODE === 'WORM';
        }

        const loading = document.getElementById('loading-screen');
        if(loading) loading.classList.add('hidden');
        const container = document.getElementById('game-container');
        if(container) container.classList.remove('hidden');
        
        this.resize();

    }

    async loadLevel(levelId, levelPath = null) {
        const cleanLevelId = String(levelId || 'level').replace(/\.json$/i, '');
        this.currentLevelId = cleanLevelId;
        this.levelComplete = false;

        const paths = levelPath
            ? [levelPath]
            : [
                `dunyalar/${cleanLevelId}.json`,
                `dunyalar/${cleanLevelId}.json`,
            ];

        let loaded = null;
        let lastError = null;
        for (const path of paths) {
            try {
                const res = await fetch(path);
                if (res.ok) {
                    loaded = await res.json();
                    break;
                }
                lastError = new Error(`HTTP ${res.status} for ${path}`);
            } catch (e) {
                lastError = e;
            }
        }

        if (!loaded) {
            console.error('[PlatformerEngine] Level load failed, using fallback:', lastError?.message || 'unknown');
            loaded = this._createFallbackLevel();
        }

        this.map = this._normalizeMapData(loaded);
        await this._setupLevel();
        this.isRunning = true;
        this._lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    async loadLevelFromData(levelData) {
        this.currentLevelId = levelData.name || 'playtest';
        this.levelComplete = false;
        this.map = this._normalizeMapData(levelData);
        await this._setupLevel();
        this.isRunning = true;
        this._lastTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    _createFallbackLevel() {
        const width = 50;
        const height = 20;
        const collision = new Array(width * height).fill(0);
        for (let x = 0; x < width; x++) {
            collision[(height - 2) * width + x] = 1;
            collision[(height - 1) * width + x] = 1;
        }
        return {
            width,
            height,
            layers: [new Array(width * height).fill(0)],
            collision,
            spawn: { x: 2, y: height - 4 },
            goal: { x: width - 5, y: height - 4 },
            collectibles: [],
            entities: [],
            background: '#87CEEB',
        };
    }

    _normalizeMapData(raw) {
        const map = (raw && typeof raw === 'object') ? { ...raw } : this._createFallbackLevel();
        const width = Math.max(4, Number(map.width || 50) | 0);
        const height = Math.max(4, Number(map.height || 20) | 0);
        const total = width * height;

        map.width = width;
        map.height = height;

        if (!Array.isArray(map.layers) || map.layers.length === 0) {
            map.layers = [new Array(total).fill(0)];
        } else {
            map.layers = map.layers.map((layer) => {
                if (!Array.isArray(layer)) return new Array(total).fill(0);
                if (layer.length === total) return layer;
                const normalized = new Array(total).fill(0);
                for (let i = 0; i < Math.min(total, layer.length); i++) normalized[i] = Number(layer[i] || 0);
                return normalized;
            });
        }

        if (!Array.isArray(map.collision) || map.collision.length !== total) {
            const src = map.layers[0] || [];
            map.collision = new Array(total).fill(0);
            for (let i = 0; i < total; i++) {
                map.collision[i] = Number(src[i] || 0) > 0 ? 1 : 0;
            }
        }

        if (!map.spawn || typeof map.spawn !== 'object') {
            map.spawn = { x: 2, y: Math.max(1, height - 4) };
        }
        if (!map.goal || typeof map.goal !== 'object') {
            map.goal = { x: Math.max(2, width - 5), y: Math.max(1, height - 4) };
        }

        map.collectibles = Array.isArray(map.collectibles) ? map.collectibles : [];
        map.entities = Array.isArray(map.entities) ? map.entities : [];
        map.checkpoints = Array.isArray(map.checkpoints) ? map.checkpoints : [];
        map.decorations = Array.isArray(map.decorations) ? map.decorations : [];
        return map;
    }

    async _setupLevel() {
        this.entities = [];
        this.platforms = [];
        this.collectibles = [];
        this.checkpoints = [];
        
        // Reset Parallax
        this.renderer.parallax.clear();
        
        // 1. Try map-defined layers first
        if (this.map.parallaxLayers && this.map.parallaxLayers.length > 0) {
            for (const layer of this.map.parallaxLayers) {
                if (!layer.image) continue;
                const img = new Image();
                img.src = layer.image;
                // Note: We might want to await these for perfect sync, but parallax usually loads fine asynchronously
                this.renderer.addParallaxLayer(img, layer.scrollX, layer.scrollY || layer.scrollX, layer.opacity);
            }
        } 
        // 2. Fallback to default
        else if (window.PlatformerAssetManager) {
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
            this.player.x = (this.map.spawn.x || 0) * this.tileSize;
            this.player.y = (this.map.spawn.y || 0) * this.tileSize;
        } else if (this.map.spawnX !== undefined) {
            this.player.x = this.map.spawnX;
            this.player.y = this.map.spawnY;
        } else {
            // Safe fallback
            this.player.x = 100; 
            this.player.y = 100;
        }
        
        // Snap camera immediately
        this.renderer.setCameraToPlayer(this.player, this.map.width, this.map.height);
        
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
        const plat = new PlatformerMovingPlatform(d.x * this.tileSize, d.y * this.tileSize);
        // Add a simple back-and-forth waypoint if none exist
        plat.addWaypoint(d.x * this.tileSize, d.y * this.tileSize);
        plat.addWaypoint((d.x + 5) * this.tileSize, d.y * this.tileSize);
        this.platforms.push(plat);
    }

    _addCollectible(c) {
        this.collectibles.push({ ...c, x: c.x * this.tileSize, y: c.y * this.tileSize, w: 16, h: 16, collected: false, type: c.type || 'coin' });
    }

    _addCheckpoint(cp) {
        this.checkpoints.push({ x: cp.x * this.tileSize, y: cp.y * this.tileSize, w: this.tileSize, h: this.tileSize * 2, activated: false });
    }

    _addEntity(e) {
        // Normalize entity coordinates to world pixels using tileSize
        const ex = (typeof e.x === 'number') ? e.x * this.tileSize : 0;
        const ey = (typeof e.y === 'number') ? e.y * this.tileSize : 0;

        if (e.type === 'enemy') {
            const enemy = new PlatformerEnemy(ex, ey, e.sprite || 'slime');
            if (e.behavior) enemy.behavior = e.behavior;
            enemy.id = e.id || enemy.id;
            enemy.hp = e.hp || enemy.hp;
            enemy.speed = e.speed || enemy.speed;
            this.entities.push(enemy);
        } else if (e.type === 'enemy_flying') {
            const enemy = new PlatformerFlyingEnemy(ex, ey, e.sprite || 'bat');
            enemy.id = e.id || enemy.id;
            if (e.behavior) enemy.behavior = e.behavior;
            this.entities.push(enemy);
        } else if (e.type === 'enemy_shooter') {
            const enemy = new PlatformerShooterEnemy(ex, ey, e.sprite || 'goblin');
            enemy.id = e.id || enemy.id;
            this.entities.push(enemy);
        } else if (e.type === 'pushable') {
            const push = new PlatformerPushableBlock(ex, ey, e.w || this.tileSize, e.h || this.tileSize);
            push.id = e.id || push.id;
            this.entities.push(push);
        } else if (['switch', 'pressure_plate', 'zone'].includes(e.type)) {
            const trigger = new PlatformerTrigger(ex, ey, {
                triggerType: e.type,
                targetId: e.targetId,
                action: e.action,
                questIdProgress: e.questIdProgress,
                id: e.id
            });
            this.entities.push(trigger);
        } else {
            const ent = { ...e, x: ex, y: ey, w: 24, h: this.tileSize, vx: 0, vy: 0, behavior: e.behavior || 'static' };
            if (e.dialogueId) ent.dialogueId = e.dialogueId;
            ent.id = e.id || ent.id;
            this.entities.push(ent);
        }
    }

    _handleInteractions() {
        if (this.dialogueSystem.active) return;

        const interactPressed = this.keys['KeyE'] || this.keys['Enter'];
        if (!interactPressed) return;

        // Check for nearby NPCs with dialogues
        const range = 64;
        const px = this.player.x + this.player.w/2;
        const py = this.player.y + this.player.h/2;

        for (const ent of this.entities) {
            if (ent.dialogueId) {
                const ex = ent.x + (ent.w || this.tileSize)/2;
                const ey = ent.y + (ent.h || this.tileSize)/2;
                const dist = Math.sqrt((px - ex)**2 + (py - ey)**2);

                if (dist < range) {
                    console.log(`[Game] Starting dialogue: ${ent.dialogueId}`);
                    this.dialogueSystem.start(ent.dialogueId);
                    this.keys['KeyE'] = false; // Consume input
                    this.keys['Enter'] = false;
                    break;
                }
            }
        }
    }

    triggerEntity(targetId, action, data) {
        console.log(`[Game] Routing trigger to ${targetId}: ${action}`);
        const targets = this.entities.filter(ent => ent.id === targetId);
        if (targets.length === 0 && this.player.id === targetId) targets.push(this.player);
        
        targets.forEach(t => {
            if (t.trigger) t.trigger(action, data);
        });
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

    update(dtArg) {
        if(this.isPaused || this.levelComplete) return;

        const dt = (typeof dtArg === 'number') ? dtArg : (1/60);
        // Scale factor to keep existing velocity units (which were per-1/60 tick)
        const scale = Math.max(0, Math.min(dt * 60, 4));

        // 1. Update Platforms First
        this.platforms.forEach(p => p.update(dt, this.map));

        // 2. Handle Player
        this.player.handleInput(this.keys);
        this.player.update(dt, this.map);
        this.physics.apply(this.player, this.map, this.platforms, dt);
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
        this._updateEntities(dt);
        this._handleInteractions();
        this._checkCollectibles();
        this._checkCheckpoints();
        this._checkGoal();
        this._checkDeathZones();
    }

    _updateEntities(dt) {
        this.entities.forEach(ent => {
            if (ent.update) {
                ent.update(dt, this.map);
            } else if(ent.behavior === 'patrol') {
                if(!ent.patrolDir) ent.patrolDir = 1;
                ent.vx = ent.patrolDir * 0.5;
                const nextX = ent.x + ent.vx * 5;
                const tileX = Math.floor(nextX / this.tileSize);
                const tileY = Math.floor(ent.y / this.tileSize);
                if(this.physics.getTile(this.map, tileX, tileY) === 1) ent.patrolDir *= -1;
            }
            this.physics.apply(ent, this.map, this.platforms, dt);

            // Quest trigger for kills
            if (ent.isDead && !ent._questLogged) {
                ent._questLogged = true;
                if (this.questSystem) this.questSystem.onEvent('kill', ent.type, 1);
            }
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

                // Quest trigger
                if (this.questSystem) this.questSystem.onEvent('collect', item.type, 1);
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
        const goal = { x: goalData.x * this.tileSize, y: goalData.y * this.tileSize, w: this.tileSize, h: this.tileSize * 2 };
        if(this._collision(this.player, goal)) this.completeLevel();
    }

    _checkDeathZones() {
        if(this.player.y > this.map.height * this.tileSize) this.respawn();
    }

    _collision(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    respawn() {
        if(this.lastCheckpoint) {
            this.player.x = this.lastCheckpoint.x;
            this.player.y = this.lastCheckpoint.y;
        } else if(this.map.spawn) {
            this.player.x = this.map.spawn.x * this.tileSize;
            this.player.y = this.map.spawn.y * this.tileSize;
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

    loop(now) {
        if(!this.isRunning) return;
        const nowTime = typeof now === 'number' ? now : performance.now();
        if (!this._lastTime) this._lastTime = nowTime;
        let dt = (nowTime - this._lastTime) / 1000;
        // Clamp dt to avoid big jumps (e.g., when tab was hidden)
        const minDt = (window.PlatformerConfig && window.PlatformerConfig.MIN_DT) || (1/120);
        const maxDt = (window.PlatformerConfig && window.PlatformerConfig.MAX_DT) || 0.1;
        dt = Math.max(minDt, Math.min(dt, maxDt));
        this._lastTime = nowTime;

        this.update(dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
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
});
