class IsoGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new IsoRenderer(this.canvas);
        this.running = false;
        
        // Initialize new FX and HUD systems (loaded via script tags)
        this.fx = null;
        this.hud = null;
        
        // Shader system (WebGL post-processing)
        this.shaders = null;
        this.shadersEnabled = false;  // Disabled by default until properly integrated
        this.offscreenCanvas = null;
        this.offscreenCtx = null;
        this.webglCanvas = null;
        
        // Caterpillar/worm sprites (loaded in init)
        this.playerHead = null;
        this.playerBody = null;
        
        this.player = { 
            x: 5, y: 5, z: 0, 
            // Render position for interpolation (smooth display)
            renderX: 5, renderY: 5, renderZ: 0,
            velocity: { x: 0, y: 0, z: 0 }, 
            color: '#f1c40f',
            // Size (matching 2D engine defaults)
            width: 16,
            height: 16,
            scale: 3,
            // Animation State
            animState: 'idle',
            direction: 'down',  // 4-directional: 'up', 'down', 'left', 'right'
            facing: 1,          // Legacy: 1 = Right, -1 = Left
            animTimer: 0,
            frame: 0,
            grounded: true,
            // Worm/Segment System (matching 2D engine defaults)
            history: [],
            segmentCount: 8,    // 2D default
            segmentSpacing: 4,  // 2D default
            glowColor: '#e74c3c',
            isWorm: true,  // Enable worm mode
            // Player Stats (for HUD)
            hp: 100, maxHp: 100,
            mana: 50, maxMana: 50,
            stamina: 100, maxStamina: 100,
            xp: 0, level: 1
        };
        this.map = [];
        this.entities = []; // Dynamic entities (NPCs, Enemies)
        this.keys = {};
        this.keysPressed = {}; // For detecting key press events
        this.levelMetadata = null;
        
        // Unified Audio System
        this.audio = window.Sound;
        if (this.audio && !this.audio.ctx) this.audio.init();

        // Physics constants (tuned for smooth 60fps feel)
        this.GRAVITY = 0.025;           // Gravity per physics tick
        this.JUMP_FORCE = 0.45;         // Initial jump velocity
        this.MAX_STEP_HEIGHT = 0.6;     // Max height player can auto-step
        this.MOVE_SPEED = 0.08;         // Base movement speed per tick
        this.ACCELERATION = 0.15;       // How fast player accelerates
        this.FRICTION = 0.12;           // Ground friction (deceleration)
        this.AIR_FRICTION = 0.02;       // Air friction (less control in air)
        
        // Fixed timestep settings
        this.TICK_RATE = 60;            // Physics updates per second
        this.TICK_MS = 1000 / this.TICK_RATE;
        this.accumulator = 0;
        this.maxAccumulator = 200;      // Cap to prevent spiral of death

        this._setupEngineListeners();
        this._startPerformanceMonitor();

        this.resizeHandler = () => this.resize();
        this.keydownHandler = e => {
            if (!this.keys[e.code]) this.keysPressed[e.code] = true;
            this.keys[e.code] = true;
        };
        this.keyupHandler = e => {
            this.keys[e.code] = false;
            this.keysPressed[e.code] = false;
        };
        this.mousemoveHandler = e => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        };

        window.addEventListener('keydown', this.keydownHandler);
        window.addEventListener('keyup', this.keyupHandler);
        
        // Mouse tracking for combat targeting
        this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };
        this.canvas.addEventListener('mousemove', this.mousemoveHandler);
        this.canvas.style.cursor = 'none';
        
        window.addEventListener('resize', this.resizeHandler);
        this.resize();
    }

    destroy() {
        this.running = false;
        if (this.perfInterval) clearInterval(this.perfInterval);
        
        window.removeEventListener('keydown', this.keydownHandler);
        window.removeEventListener('keyup', this.keyupHandler);
        window.removeEventListener('resize', this.resizeHandler);
        this.canvas.removeEventListener('mousemove', this.mousemoveHandler);
        
        // Unsubscribe from EventBus
        const eventBus = window.KetebeEventBus || (window.parent && window.parent.KetebeEventBus);
        if (eventBus && this.eventBusIds) {
            this.eventBusIds.forEach(id => eventBus.off('*', id));
        }

        console.log('[IsoEngine] Destroyed and cleaned up listeners.');
    }

    _setupEngineListeners() {
        const eventBus = window.KetebeEventBus || (window.parent && window.parent.KetebeEventBus);
        this.eventBusIds = [];
        if (eventBus) {
            const id1 = eventBus.on('engine:snapshot:request', (event) => {
                const snapshot = this.getSnapshot();
                eventBus.emit('engine:snapshot:result', { id: event.data.id, snapshot });
            });

            const id2 = eventBus.on('engine:input', (event) => {
                const { code, state } = event.data;
                this.keys[code] = (state === 'down');
                if (state === 'down') this.keysPressed[code] = true;
            });
            this.eventBusIds.push(id1, id2);
        }
    }

    _startPerformanceMonitor() {
        this.frameCount = 0;
        this.lastFpsCheck = performance.now();
        
        this.perfInterval = setInterval(() => {
            const now = performance.now();
            const elapsed = now - this.lastFpsCheck;
            const fps = Math.round((this.frameCount * 1000) / elapsed);
            this.frameCount = 0;
            this.lastFpsCheck = now;

            const eventBus = window.KetebeEventBus || (window.parent && window.parent.KetebeEventBus);
            if (eventBus) {
                eventBus.emit('system:metrics', {
                    fps,
                    entities: this.entities.length,
                    memory: window.performance?.memory ? Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024) : 'N/A',
                    engine: 'isopixel'
                });
            }
        }, 2000);
    }

    getSnapshot() {
        return {
            type: 'isopixel',
            player: {
                x: this.player.x.toFixed(2),
                y: this.player.y.toFixed(2),
                z: this.player.z.toFixed(2),
                hp: this.player.hp,
                state: this.player.animState,
                grounded: this.player.grounded
            },
            entities: this.entities.map(e => ({
                id: e.id,
                type: e.type,
                x: e.x.toFixed(2),
                y: e.y.toFixed(2),
                z: e.z.toFixed(2),
                health: e.hp
            })),
            world: {
                width: this.levelMetadata?.width || 0,
                height: this.levelMetadata?.height || 0,
                decorations: this.levelMetadata?.decorations?.length || 0,
                levelName: this.levelMetadata?.name || 'unknown'
            },
            performance: {
                entities: this.entities.length,
                status: this.running ? 'RUNNING' : 'STOPPED'
            }
        };
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.renderer && this.renderer.ctx) this.renderer.ctx.imageSmoothingEnabled = false;
        if (this.fx) this.fx.resize(this.canvas.width, this.canvas.height);
        
        // Resize offscreen canvas for shader system
        if (this.offscreenCanvas) {
            this.offscreenCanvas.width = this.canvas.width;
            this.offscreenCanvas.height = this.canvas.height;
        }
        // Resize WebGL canvas
        if (this.webglCanvas) {
            this.webglCanvas.width = this.canvas.width;
            this.webglCanvas.height = this.canvas.height;
        }
        if (this.shaders) {
            this.shaders.resize(this.canvas.width, this.canvas.height);
        }
    }
    
    initSystems() {
        // Initialize FX System (particles, weather, lighting)
        if (window.IsoFXSystem) {
            const projectFn = (worldX, worldY, worldZ) => {
                const dims = { w: this.config.tileSize * this.config.scale, h: this.config.tileSize * this.config.scale / 2 };
                return {
                    x: (worldX - worldY) * (dims.w / 2) - this.renderer.camera.x + this.canvas.width / 2,
                    y: (worldX + worldY) * (dims.h / 2) - (worldZ * dims.h) - this.renderer.camera.y + this.canvas.height / 4
                };
            };
            this.fx = new IsoFXSystem(this.renderer.ctx, this.canvas, projectFn);
            // Set initial weather/time
            this.fx.setTime(10); // 10am start
            this.fx.timeSpeed = 0.1; // Enable time cycle
        }
        
        // Initialize WebGL Shader System
        if (window.IsoShaderSystem) {
            try {
                // Create offscreen canvas for 2D rendering (shaders will process this)
                this.offscreenCanvas = document.createElement('canvas');
                this.offscreenCanvas.width = this.canvas.width;
                this.offscreenCanvas.height = this.canvas.height;
                this.offscreenCtx = this.offscreenCanvas.getContext('2d');
                
                // Create separate WebGL canvas (can't mix 2D and WebGL on same canvas)
                this.webglCanvas = document.createElement('canvas');
                this.webglCanvas.width = this.canvas.width;
                this.webglCanvas.height = this.canvas.height;
                this.webglCanvas.style.position = 'absolute';
                this.webglCanvas.style.top = '0';
                this.webglCanvas.style.left = '0';
                this.webglCanvas.style.pointerEvents = 'none';
                this.webglCanvas.style.display = 'none'; // Hidden until shaders enabled
                this.webglCanvas.id = 'webgl-canvas';
                this.canvas.parentElement.appendChild(this.webglCanvas);
                
                // Initialize shader system with WebGL canvas
                this.shaders = new IsoShaderSystem(this.webglCanvas);
                
                if (this.shaders.isSupported()) {
                    console.log('[IsoEngine] WebGL shader system initialized');
                    // Apply default subtle cinematic preset
                    this.shaders.applyPreset('none');
                    // Enable subtle bloom by default
                    this.shaders.setBloom({ enabled: true, intensity: 0.3, threshold: 0.7 });
                } else {
                    console.log('[IsoEngine] WebGL not supported, falling back to Canvas 2D');
                    this.canvas.parentElement.removeChild(this.webglCanvas);
                    this.webglCanvas = null;
                    this.shaders = null;
                    this.shadersEnabled = false;
                }
            } catch (e) {
                console.warn('[IsoEngine] Shader system init failed:', e);
                this.shaders = null;
                this.shadersEnabled = false;
            }
        }
        
        // Initialize Combat System
        if (window.IsoCombatSystem) {
            this.combat = new IsoCombatSystem(this);
            console.log('[IsoEngine] Combat system initialized');
        } else {
            console.warn('[IsoEngine] IsoCombatSystem class not found!');
        }
        
        // Initialize HUD System
        if (window.IsoHUDSystem) {
            this.hud = new IsoHUDSystem(this);
            
            // Hide HUD in campaign runtime mode (campaign has its own HUD)
            if (window.CAMPAIGN_RUNTIME_MODE) {
                this.hud.visible = false;
                console.log('[IsoEngine] HUD hidden in campaign runtime mode');
            } else {
                this.syncHUDStats();
                
                // Set up some demo skills
                this.hud.setSkill(0, { icon: '⚔', color: '#e74c3c', cooldown: 2 });
                this.hud.setSkill(1, { icon: '🔥', color: '#f39c12', cooldown: 5 });
                this.hud.setSkill(2, { icon: '❄', color: '#3498db', cooldown: 8 });
                this.hud.setSkill(3, { icon: '⚡', color: '#9b59b6', cooldown: 10 });
            }
        }
    }
    
    syncHUDStats() {
        if (this.hud) {
            this.hud.setStats({
                hp: this.player.hp,
                maxHp: this.player.maxHp,
                mana: this.player.mana,
                maxMana: this.player.maxMana,
                stamina: this.player.stamina,
                maxStamina: this.player.maxStamina,
                xp: this.player.xp,
                level: this.player.level
            });
        }
    }

    async init() {
        console.log("[IsoEngine] Initializing World...");
        if (typeof window.IsoStrategy === 'undefined') {
            throw new Error('IsoStrategy not found! Ensure strategies/IsoStrategy.js is loaded.');
        }
        this.strategy = new window.IsoStrategy();
        this.config = { tileSize: 16, scale: 2 }; 
        
        try {
            let levelData = null;
            
            // In campaign mode, use the levelMetadata that was set by the adapter
            if (window.CAMPAIGN_RUNTIME_MODE && this.levelMetadata) {
                console.log('[IsoEngine] Using pre-loaded campaign map');
                levelData = this.levelMetadata;
            } else {
                // Normal mode: load map from sessionStorage or default file
                const playtestData = sessionStorage.getItem('ketebe_playtest_data') || sessionStorage.getItem('ketebe_playtest_map');
                if (playtestData) {
                    levelData = JSON.parse(playtestData);
                } else {
                    // Try to fetch registry to find first available level
                    try {
                        const registryRes = await fetch('/api/assets');
                        const registry = await registryRes.json();
                        const levels = registry.assets.filter(a => a.type === 'data' && a.id.startsWith('dunyalar/'));
                        if (levels.length > 0) {
                            const firstLevelPath = levels[0].path.startsWith('/') ? levels[0].path : '/' + levels[0].path;
                            console.log(`[IsoEngine] No playtest map, falling back to registry level: ${firstLevelPath}`);
                            const res = await fetch(firstLevelPath);
                            if (res.ok) levelData = await res.json();
                        } else {
                            // Last ditch effort: legacy hardcoded level1
                            const res = await fetch('dunyalar/level1.json');
                            if(res.ok) levelData = await res.json();
                        }
                    } catch (err) {
                        const res = await fetch('dunyalar/level1.json');
                        if(res.ok) levelData = await res.json();
                    }
                }
            }

            // Initialize assets and map
            await this.loadLevelData(levelData);

        } catch(e) {
            console.error("Failed to load map:", e);
            this.generateDefaultMap();
        }

        // Initialize FX and HUD systems after everything is loaded
        this.initSystems();
        
        // Apply level-specific lighting/shader settings
        this.applyLevelFX();
        
        // Spawn Dynamic Entities (NPCs, Enemies)
        this.spawnEntities();

        this.running = true;
        requestAnimationFrame(t => this.loop(t));
        
        const loading = document.getElementById('loading-screen');
        if(loading) loading.classList.add('hidden');
        document.getElementById('game-container')?.classList.remove('hidden');
    }

    async loadLevelData(levelData) {
        if (!levelData) {
            this.generateDefaultMap();
            return;
        }

        this.levelMetadata = levelData;
        this.map = levelData; // Alias for compatibility
        
        // Load Character Sprites (4-directional)
        this.sprites = {};
        
        // Load ALL global sprites (props, etc.)
        if (window.SPRITES && window.createPixelImage) {
            for (const key in window.SPRITES) {
                this.sprites[key] = window.createPixelImage(key);
            }
            console.log(`[IsoEngine] Loaded ${Object.keys(this.sprites).length} sprites from registry`);
        }

        this.spriteConfig = {
            frameWidth: 16,
            frameHeight: 16,
            // Direction rows in spritesheet: 0=down, 1=left, 2=right, 3=up
            directions: { down: 0, left: 1, right: 2, up: 3 },
            animations: {
                idle: { frames: 1, row: 0 },  // First frame of each direction
                run: { frames: 4, row: 0 }    // All 4 frames for walking
            }
        };
        
        // Load Caterpillar/Worm sprites (matching 2D engine's "Ketebe Canavarı")
        if (window.createPixelImage) {
            this.playerHead = window.createPixelImage('caterpillar_head');
            this.playerBody = window.createPixelImage('caterpillar_body');
            this.sprites.caterpillar_head = this.playerHead;
            this.sprites.caterpillar_body = this.playerBody;
            console.log("[IsoEngine] Loaded caterpillar sprites from sprites.js");
        }
        
        // Load the 4-directional character sprite (fallback for non-worm mode)
        const characterPath = 'sprite-art/2D Pixel Dungeon Asset Pack v2.0/2D Pixel Dungeon Asset Pack/character and tileset/Dungeon_Character.png';
        this.sprites.character = new Image();
        this.sprites.character.src = characterPath;
        await new Promise((resolve) => {
            this.sprites.character.onload = resolve;
            this.sprites.character.onerror = () => {
                console.warn("Failed to load character sprite, falling back to Knight");
                resolve();
            };
        });
        
        // Fallback: also load Knight sprites for compatibility
        const spritePath = 'sprite-art/Knight/Knight/';
        const loadSprite = (name, file) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.src = spritePath + file;
                img.onload = () => { this.sprites[name] = img; resolve(); };
                img.onerror = () => { console.warn("Failed to load " + file); resolve(); };
            });
        };

        await Promise.all([
            loadSprite('idle', 'noBKG_KnightIdle_strip.png'),
            loadSprite('run', 'noBKG_KnightRun_strip.png'),
            loadSprite('jump', 'noBKG_KnightJumpAndFall_strip.png')
        ]);

        // Load Tileset
        this.tileset = new Image();
        if (levelData.tilesetPath === 'WORLD_PIXEL_ART') {
            this.tileset = await this.combineWorldPixelArt();
        } else {
            const tilesetPath = levelData.tilesetPath || 'base_game/assets/world_tileset.png';
            this.tileset.src = tilesetPath;
            await new Promise((r, reject) => {
                this.tileset.onload = r;
                this.tileset.onerror = () => reject(new Error("Tileset failed"));
            });
        }

        // Setup Player Spawn
        if (levelData.spawn) {
            this.player.x = levelData.spawn.x;
            this.player.y = levelData.spawn.y;
            this.player.z = this.getZAt(this.player.x, this.player.y);
            // Initialize render position to spawn (no interpolation lag at start)
            this.player.renderX = this.player.x;
            this.player.renderY = this.player.y;
            this.player.renderZ = this.player.z;
        }
        
        // Reset player history for worm movement
        this.player.history = [];
        for (let i = 0; i < 200; i++) {
            this.player.history.push({
                x: this.player.x,
                y: this.player.y,
                z: this.player.z,
                direction: this.player.direction
            });
        }
        
        this.strategy.prepareCache(this.tileset, this.config);
    }

    async combineWorldPixelArt() {
        const tempCanvas = document.createElement('canvas');
        const tSize = 16;
        const cols = 16;
        const totalTiles = 600; 
        const rows = Math.ceil(totalTiles / cols);
        tempCanvas.width = cols * tSize;
        tempCanvas.height = rows * tSize;
        const tCtx = tempCanvas.getContext('2d');
        
        tCtx.fillStyle = '#ff00ff';
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        let loadedCount = 0;
        const promises = [];
        
        const bar = document.getElementById('loading-bar');
        const txt = document.getElementById('loading-text');

        for (let i = 1; i <= totalTiles; i++) {
            promises.push(new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const x = ((i - 1) % cols) * tSize;
                    const y = Math.floor((i - 1) / cols) * tSize;
                    tCtx.clearRect(x, y, tSize, tSize);
                    tCtx.drawImage(img, x, y, tSize, tSize);
                    loadedCount++;
                    if (loadedCount % 10 === 0) { 
                        const pct = Math.floor((loadedCount / totalTiles) * 100);
                        if(bar) bar.style.width = pct + '%';
                        if(txt) txt.innerText = `Loading Assets... ${pct}%`;
                    }
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = `sprite-art/worldpixelart/texture_16px%20${i}.png`;
            }));
        }
        await Promise.all(promises);
        return tempCanvas;
    }

    generateDefaultMap() {
        this.levelMetadata = {
            width: 15, height: 15,
            layers: [new Array(15*15).fill(1)],
            z: [new Array(15*15).fill(0)],
            shapes: [new Array(15*15).fill(0)],
            decorations: []
        };
        this.tileset = new Image();
        this.tileset.src = 'base_game/assets/world_tileset.png';
    }

    getZAt(x, y) {
        if (!this.levelMetadata) return 0;
        const tx = Math.floor(x);
        const ty = Math.floor(y);
        const map = this.levelMetadata;
        
        if(tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return -100; // Void is deep
        const idx = ty * map.width + tx;

        // Find highest solid block
        let maxZ = -100;
        if (map.layers && map.z && map.shapes) {
            for(let l=0; l<map.layers.length; l++) {
                 if (map.layers[l] && map.layers[l][idx] !== null && map.layers[l][idx] !== undefined) {
                     // Safety check for z and shapes arrays
                     if (!map.z[l] || !map.shapes[l]) continue;
                     
                     const z = map.z[l][idx];
                     const shape = map.shapes[l][idx];
                     
                     // Skip if z is undefined/null
                     if (z === undefined || z === null) continue;
                     
                     // Shape 0 is solid block (height 1). Shape 5 is slab (height 0.5).
                     const height = (shape === 5) ? 0.5 : 1.0;
                     const top = z + height; 
                     
                     // Only collide with solid blocks
                     // TODO: Check transparency/passable flags
                     if (top > maxZ) maxZ = top;
                 }
            }
        }
        return maxZ;
    }

    // Fixed timestep physics update (called at TICK_RATE hz)
    fixedUpdate() {
        const p = this.player;
        
        // Check for level exit
        this.checkExits();

        // === INPUT HANDLING ===
        // Calculate target velocity from input (isometric directions)
        let inputX = 0, inputY = 0;
        if (this.keys['ArrowUp'] || this.keys['KeyW']) { inputX -= 1; inputY -= 1; }
        if (this.keys['ArrowDown'] || this.keys['KeyS']) { inputX += 1; inputY += 1; }
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) { inputX -= 1; inputY += 1; }
        if (this.keys['ArrowRight'] || this.keys['KeyD']) { inputX += 1; inputY -= 1; }
        
        // Normalize diagonal movement
        const inputLen = Math.sqrt(inputX * inputX + inputY * inputY);
        
        // Sprint with Shift key (consumes stamina)
        const sprinting = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && inputLen > 0;
        let moveSpeed = this.MOVE_SPEED;
        if (sprinting && p.stamina > 0) {
            moveSpeed *= 1.8;
            p.stamina -= 20 / this.TICK_RATE; // 20 stamina per second
            if (p.stamina < 0) p.stamina = 0;
        } else if (!sprinting && p.stamina < p.maxStamina) {
            // Regenerate stamina when not sprinting
            p.stamina += 10 / this.TICK_RATE; // 10 stamina per second
            if (p.stamina > p.maxStamina) p.stamina = p.maxStamina;
        }
        
        if (inputLen > 0) {
            inputX = (inputX / inputLen) * moveSpeed;
            inputY = (inputY / inputLen) * moveSpeed;
        }
        
        // === HORIZONTAL MOVEMENT (acceleration-based) ===
        const friction = p.grounded ? this.FRICTION : this.AIR_FRICTION;
        
        if (inputLen > 0) {
            // Accelerate towards input direction
            p.velocity.x += (inputX - p.velocity.x) * this.ACCELERATION;
            p.velocity.y += (inputY - p.velocity.y) * this.ACCELERATION;
        } else {
            // Apply friction when no input
            p.velocity.x *= (1 - friction);
            p.velocity.y *= (1 - friction);
            // Stop completely at very low speeds
            if (Math.abs(p.velocity.x) < 0.001) p.velocity.x = 0;
            if (Math.abs(p.velocity.y) < 0.001) p.velocity.y = 0;
        }
        
        // === JUMP INPUT ===
        if ((this.keysPressed['Space'] || this.keys['Space']) && p.grounded) {
            p.velocity.z = this.JUMP_FORCE;
            p.grounded = false;
            this.keysPressed['Space'] = false; // Consume the press
        }
        
        // === GRAVITY ===
        if (!p.grounded) {
            p.velocity.z -= this.GRAVITY;
            // Terminal velocity
            if (p.velocity.z < -0.8) p.velocity.z = -0.8;
        }
        
        // === COLLISION & MOVEMENT ===
        let nextX = p.x + p.velocity.x;
        let nextY = p.y + p.velocity.y;
        let nextZ = p.z + p.velocity.z;
        
        // Horizontal collision (wall check with sliding)
        const floorAtTarget = this.getZAt(nextX, nextY);
        const stepThreshold = p.z + this.MAX_STEP_HEIGHT;
        
        if (floorAtTarget > stepThreshold) {
            // Try X-only movement
            const floorAtX = this.getZAt(nextX, p.y);
            if (floorAtX <= stepThreshold) {
                nextY = p.y;
                p.velocity.y = 0;
            } else {
                // Try Y-only movement
                const floorAtY = this.getZAt(p.x, nextY);
                if (floorAtY <= stepThreshold) {
                    nextX = p.x;
                    p.velocity.x = 0;
                } else {
                    // Block both
                    nextX = p.x;
                    nextY = p.y;
                    p.velocity.x = 0;
                    p.velocity.y = 0;
                }
            }
        }
        
        // Map bounds
        if (nextX < 0.1) { nextX = 0.1; p.velocity.x = 0; }
        if (nextY < 0.1) { nextY = 0.1; p.velocity.y = 0; }
        if (this.levelMetadata) {
            if (nextX >= this.levelMetadata.width - 0.1) { nextX = this.levelMetadata.width - 0.1; p.velocity.x = 0; }
            if (nextY >= this.levelMetadata.height - 0.1) { nextY = this.levelMetadata.height - 0.1; p.velocity.y = 0; }
        }
        
        // Apply horizontal position
        p.x = nextX;
        p.y = nextY;
        
        // Vertical collision (floor)
        const floorHeight = this.getZAt(p.x, p.y);
        
        if (nextZ <= floorHeight) {
            nextZ = floorHeight;
            p.velocity.z = 0;
            p.grounded = true;
        } else {
            p.grounded = false;
        }
        
        p.z = nextZ;
        
        // === ANIMATION STATE ===
        const isMoving = Math.abs(p.velocity.x) > 0.005 || Math.abs(p.velocity.y) > 0.005;
        
        if (!p.grounded) {
            p.animState = 'jump';
        } else if (isMoving) {
            p.animState = 'run';
        } else {
            p.animState = 'idle';
        }
        
        // === 4-DIRECTIONAL FACING ===
        // In isometric: screen coords are rotated 45 degrees from world coords
        // Screen-X = worldX - worldY, Screen-Y = worldX + worldY
        if (isMoving) {
            const screenVelX = p.velocity.x - p.velocity.y;  // Horizontal on screen
            const screenVelY = p.velocity.x + p.velocity.y;  // Vertical on screen (+ = down)
            
            const absX = Math.abs(screenVelX);
            const absY = Math.abs(screenVelY);
            
            // Determine dominant direction (4-way)
            if (absX > absY) {
                // Horizontal movement dominates
                p.direction = screenVelX > 0 ? 'right' : 'left';
                p.facing = screenVelX > 0 ? 1 : -1;
            } else if (absY > 0.001) {
                // Vertical movement dominates  
                p.direction = screenVelY > 0 ? 'down' : 'up';
            }
            // If both are ~0, keep current direction
        }
        
        // === UPDATE POSITION HISTORY (for worm segments) ===
        if (p.isWorm && p.history) {
            const lastPos = p.history[0];
            const distMoved = lastPos ? 
                Math.sqrt((p.x - lastPos.x) ** 2 + (p.y - lastPos.y) ** 2 + (p.z - lastPos.z) ** 2) : 999;
            
            // Only record if moved enough (prevents bunching when stationary)
            if (distMoved > 0.05) {
                p.history.unshift({
                    x: p.x,
                    y: p.y, 
                    z: p.z,
                    direction: p.direction
                });
                // Limit history size
                if (p.history.length > 200) p.history.pop();
            }
        }
        
        // Animation frame cycling (at fixed rate)
        p.animTimer += this.TICK_MS;
        const animFPS = p.animState === 'run' ? 8 : 6;  // Slower for pixel art
        const msPerFrame = 1000 / animFPS;
        if (p.animTimer >= msPerFrame) {
            p.frame++;
            p.animTimer -= msPerFrame;
        }
    }
    
    checkExits() {
        if (!this.levelMetadata || !this.levelMetadata.decorations) return;
        if (this.levelComplete) return; // Already triggered

        // Find exits
        const exits = this.levelMetadata.decorations.filter(d => d.type === 'exit');
        if (exits.length === 0) return;
        
        for (const exit of exits) {
            // Distance check (center align)
            const dx = this.player.x - (exit.x + 0.5); 
            const dy = this.player.y - (exit.y + 0.5);
            const dz = this.player.z - (exit.z || 0);
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (dist < 1.0) {
                console.log("Exit reached!");
                this.handleLevelComplete();
                return; 
            }
        }
    }

    handleLevelComplete() {
        this.levelComplete = true;
        console.log("Level Complete!");
        
        // Visual feedback
        if (this.hud) this.hud.showNotification("Level Complete!", "success");
        
        // If running under adapter/campaign mode, let it handle the event
        // The adapter monitors 'levelComplete' flag, so we are good.
        if (window.CAMPAIGN_RUNTIME_MODE) return;

        // Basic next level logic for standalone mode
        setTimeout(async () => {
            // Try to determine next level
            const currentLevelName = this.levelMetadata?.name || 'level1.json';
            let nextLevelPath = null;
            
            // Extract level number and try next sequential level
            const match = currentLevelName.match(/level(\d+)/i);
            if (match) {
                const currentNum = parseInt(match[1]);
                const nextNum = currentNum + 1;
                nextLevelPath = `dunyalar/level${nextNum}.json`;
                
                // Check if next level exists
                try {
                    const response = await fetch(nextLevelPath);
                    if (response.ok) {
                        console.log(`Loading next level: ${nextLevelPath}`);
                        const levelData = await response.json();
                        this.running = false;
                        this.levelComplete = false;
                        await this.loadLevelData(levelData);
                        this.applyLevelFX();
                        this.spawnEntities();
                        this.running = true;
                        return;
                    }
                } catch (e) {
                    console.log(`No next level found at ${nextLevelPath}`);
                }
            }
            
            // No next level found - show completion message
            alert("Level Complete! No more levels available.");
            location.reload();
        }, 1000);
    }

    // Variable timestep update (called every frame, handles camera and interpolation)
    update(dt) {
        const p = this.player;
        
        // === INTERPOLATE RENDER POSITION ===
        // Smooth visual position towards actual physics position
        const interpSpeed = 0.25;
        p.renderX += (p.x - p.renderX) * interpSpeed;
        p.renderY += (p.y - p.renderY) * interpSpeed;
        p.renderZ += (p.z - p.renderZ) * interpSpeed;
        
        // Snap if very close (avoid micro-jitter)
        if (Math.abs(p.x - p.renderX) < 0.001) p.renderX = p.x;
        if (Math.abs(p.y - p.renderY) < 0.001) p.renderY = p.y;
        if (Math.abs(p.z - p.renderZ) < 0.001) p.renderZ = p.z;
        
        // === CAMERA FOLLOW ===
        const dims = this.strategy.getTileDims(this.config);
        const target = this.strategy.project(p.renderX, p.renderY, p.renderZ, dims);
        
        const desiredCamX = -target.x;
        const desiredCamY = -target.y;
        
        if (isNaN(desiredCamX) || isNaN(desiredCamY)) return;
        
        const cam = this.renderer.camera;
        const distX = desiredCamX - cam.x;
        const distY = desiredCamY - cam.y;
        const dist = Math.sqrt(distX * distX + distY * distY);
        
        // Snap camera if too far (teleport, initial load)
        if (dist > 400) {
            cam.x = desiredCamX;
            cam.y = desiredCamY;
        } else {
            // Smooth follow with deadzone
            const deadzone = 5;
            if (dist > deadzone) {
                const smoothing = 0.08;
                cam.x += distX * smoothing;
                cam.y += distY * smoothing;
            }
        }
        
        // FX System update (new isometric FX)
        if (this.fx) this.fx.update(dt / 1000);
        
        // Combat System update
        if (this.combat) this.combat.update(dt / 1000);
        
        // Entity Update
        if (this.entities) {
            for (const ent of this.entities) {
                ent.update(dt);
            }
        }
        
        // Player Regen Logic
        const regenRate = 5 * (dt / 1000); // 5 mana per second
        if (this.player.mana < this.player.maxMana) {
            this.player.mana = Math.min(this.player.maxMana, this.player.mana + regenRate);
        }
        if (this.player.stamina < this.player.maxStamina) {
            this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + (regenRate * 2));
        }
        
        // HUD System update
        if (this.hud) {
            this.hud.update(dt);
            this.syncHUDStats();
        }
    }

    draw() {
        // For now, always render directly to main canvas (shader integration needs refactoring)
        const ctx = this.renderer.ctx;
        const targetCanvas = this.canvas;
        
        // Ensure main canvas is visible
        this.canvas.style.display = 'block';
        if (this.webglCanvas) {
            this.webglCanvas.style.display = 'none';
        }
        
        // 0. FX Background layer (atmosphere, sky gradient)
        if (this.fx) {
            this.fx.renderBackground(ctx);
        } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
        }
        
        // 1. Render Map via Strategy (use interpolated render position for smooth display)
        const mockState = {
            camX: this.renderer.camera.x,
            camY: this.renderer.camera.y,
            zoom: 1,
            activeLayer: 0, 
            showGrid: false,  // Disable grid in gameplay for performance
            entities: [{
                ...this.player,
                x: this.player.renderX,
                y: this.player.renderY,
                z: this.player.renderZ
            }]
        };
        
        this.strategy.render(ctx, this.levelMetadata, mockState, this.config, this.tileset, this.sprites);
        
        // 1.5 Render Entities (NPCs/Enemies)
        if (this.entities) {
            ctx.save();
            ctx.translate(targetCanvas.width / 2 + mockState.camX, targetCanvas.height / 4 + mockState.camY);
            
            // Sort entities by depth (painter's algorithm)
            // Depth = (x + y) roughly in iso
            this.entities.sort((a, b) => (a.renderX + a.renderY) - (b.renderX + b.renderY));
            
            for (const ent of this.entities) {
                ent.draw(ctx, this.strategy, this.config, this.tileset, this.sprites);
            }
            ctx.restore();
        }
        
        // 1.6 Render Exit Decorations
        this._renderExits(ctx, mockState);

        // 2. FX World layer (particles in world space)
        if (this.fx) {
            ctx.save();
            ctx.translate(targetCanvas.width / 2 + mockState.camX, targetCanvas.height / 4 + mockState.camY);
            this.fx.renderWorld(ctx);
            ctx.restore();
        }
        
        // 2.5. Combat System (projectiles in world space)
        if (this.combat) {
            const dims = this.strategy.getTileDims(this.config);
            ctx.save();
            ctx.translate(targetCanvas.width / 2 + mockState.camX, targetCanvas.height / 4 + mockState.camY);
            this.combat.render(ctx, dims);
            ctx.restore();
        }
        
        // 2.7. Crosshair cursor
        this._drawCrosshair(ctx);
        
        // 3. FX Screen layer (weather, lighting overlay)
        if (this.fx) {
            this.fx.renderScreen(ctx);
        }

        // 4. HUD layer (always on top)
        if (this.hud) {
            this.hud.render();
        }
    }

    _drawCrosshair(ctx) {
        const mx = this.mouse.x;
        const my = this.mouse.y;
        if (mx === 0 && my === 0) return;
        
        const size = 12;
        const gap = 4;
        
        ctx.save();
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 6;
        
        // Top
        ctx.beginPath();
        ctx.moveTo(mx, my - size);
        ctx.lineTo(mx, my - gap);
        ctx.stroke();
        // Bottom
        ctx.beginPath();
        ctx.moveTo(mx, my + gap);
        ctx.lineTo(mx, my + size);
        ctx.stroke();
        // Left
        ctx.beginPath();
        ctx.moveTo(mx - size, my);
        ctx.lineTo(mx - gap, my);
        ctx.stroke();
        // Right
        ctx.beginPath();
        ctx.moveTo(mx + gap, my);
        ctx.lineTo(mx + size, my);
        ctx.stroke();
        
        // Center dot
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();
    }
    
    _renderExits(ctx, mockState) {
        if (!this.levelMetadata || !this.levelMetadata.decorations) return;
        
        const exits = this.levelMetadata.decorations.filter(d => d.type === 'exit');
        if (exits.length === 0) return;
        
        ctx.save();
        ctx.translate(this.canvas.width / 2 + mockState.camX, this.canvas.height / 4 + mockState.camY);
        
        const dims = this.strategy.getTileDims(this.config);
        
        for (const exit of exits) {
            const exitX = exit.x + 0.5;
            const exitY = exit.y + 0.5;
            const exitZ = exit.z || 0;
            
            const pos = this.strategy.project(exitX, exitY, exitZ, dims);
            
            // Draw exit sign with glow effect
            ctx.save();
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 15;
            
            // Draw base platform
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(pos.x - 16, pos.y - 8, 32, 16);
            
            // Draw door/portal symbol
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(pos.x - 12, pos.y - 24, 24, 24);
            
            // Draw highlight
            ctx.fillStyle = '#52ff52';
            ctx.fillRect(pos.x - 10, pos.y - 22, 4, 20);
            
            // Draw text
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px VT323, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('EXIT', pos.x, pos.y - 12);
            
            ctx.restore();
        }
        
        ctx.restore();
    }

    loop(time) {
        if(!this.running) return;
        
        if (!this.lastTime) this.lastTime = time;
        const dt = time - this.lastTime;
        this.lastTime = time;
        
        // === FIXED TIMESTEP PHYSICS ===
        // Accumulate time and run physics at fixed rate
        this.accumulator += dt;
        
        // Cap accumulator to prevent spiral of death on slow frames
        if (this.accumulator > this.maxAccumulator) {
            this.accumulator = this.maxAccumulator;
        }
        
        // Run physics updates at fixed rate
        while (this.accumulator >= this.TICK_MS) {
            this.fixedUpdate();
            this.accumulator -= this.TICK_MS;
        }
        
        // === VARIABLE TIMESTEP RENDERING ===
        // Camera and interpolation at frame rate
        this.frameCount++;
        this.update(dt);
        this.draw();
        
        requestAnimationFrame(t => this.loop(t));
    }

    login(username) {
        this.username = username;
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.classList.add('hidden');
        this.init();
    }
    
    // === SHADER API ===
    
    /** Enable or disable post-processing shaders */
    setShadersEnabled(enabled) {
        this.shadersEnabled = enabled;
        console.log(`[IsoEngine] Shaders ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /** Apply a shader preset (none, cinematic, retro, vibrant, dark, dreamy) */
    setShaderPreset(preset) {
        if (this.shaders) {
            this.shaders.applyPreset(preset);
            console.log(`[IsoEngine] Applied shader preset: ${preset}`);
        }
    }
    
    /** Configure bloom effect */
    setBloom(options) {
        if (this.shaders) this.shaders.setBloom(options);
    }
    
    /** Configure color grading */
    setColorGrade(options) {
        if (this.shaders) this.shaders.setColorGrade(options);
    }
    
    /** Configure vignette effect */
    setVignette(options) {
        if (this.shaders) this.shaders.setVignette(options);
    }
    
    /** Configure chromatic aberration */
    setChromaticAberration(options) {
        if (this.shaders) this.shaders.setChromaticAberration(options);
    }
    
    /** Configure film grain */
    setFilmGrain(options) {
        if (this.shaders) this.shaders.setFilmGrain(options);
    }
    
    /** Get shader capabilities */
    getShaderInfo() {
        return {
            supported: this.shaders ? this.shaders.isSupported() : false,
            enabled: this.shadersEnabled,
            currentSettings: this.shaders ? this.shaders.getSettings() : null
        };
    }
    
    // === LIGHTING API (shortcuts to FX system) ===
    
    /** Set lighting preset (day, dusk, night, dungeon, cave) */
    setLightingPreset(preset) {
        if (this.fx) {
            this.fx.applyLightingPreset(preset);
            console.log(`[IsoEngine] Applied lighting preset: ${preset}`);
        }
    }
    
    /** Add a soft light at world position */
    addLight(x, y, options = {}) {
        if (this.fx) {
            return this.fx.addSoftLight(x, y, options);
        }
        return null;
    }
    
    /** Remove a light by ID */
    removeLight(id) {
        if (this.fx) this.fx.removeSoftLight(id);
    }
    
    /** Configure player light (follows player) */
    setPlayerLight(options) {
        if (this.fx) this.fx.setPlayerLight(options);
    }
    
    // === LEVEL FX CONFIG ===
    
    /**
     * Apply level-specific lighting and shader settings from levelMetadata.fx
     * Level JSON can include:
     * {
     *   "fx": {
     *     "lighting": "night",           // preset name or object
     *     "shader": "cinematic",         // preset name or object
     *     "playerLight": { "radius": 120, "color": "#ffdd88" },
     *     "lights": [{ "x": 5, "y": 3, "radius": 100, "color": "#ff8800" }],
     *     "time": 22                      // 24h time for day/night cycle
     *   }
     * }
     */
    applyLevelFX() {
        if (!this.levelMetadata || !this.levelMetadata.fx) {
            // Apply sensible defaults
            this.setLightingPreset('day');
            return;
        }
        
        const fx = this.levelMetadata.fx;
        console.log('[IsoEngine] Applying level FX config:', fx);
        
        // Apply lighting preset or custom config
        if (fx.lighting) {
            if (typeof fx.lighting === 'string') {
                this.setLightingPreset(fx.lighting);
            } else if (typeof fx.lighting === 'object') {
                // Custom lighting config
                if (this.fx) {
                    if (fx.lighting.ambient) this.fx.ambientColor = fx.lighting.ambient;
                    if (fx.lighting.intensity !== undefined) this.fx.ambientIntensity = fx.lighting.intensity;
                }
            }
        }
        
        // Apply shader preset or custom config
        if (fx.shader) {
            if (typeof fx.shader === 'string') {
                this.setShaderPreset(fx.shader);
            } else if (typeof fx.shader === 'object') {
                // Custom shader config
                if (fx.shader.bloom) this.setBloom(fx.shader.bloom);
                if (fx.shader.colorGrade) this.setColorGrade(fx.shader.colorGrade);
                if (fx.shader.vignette) this.setVignette(fx.shader.vignette);
                if (fx.shader.chromaticAberration) this.setChromaticAberration(fx.shader.chromaticAberration);
                if (fx.shader.filmGrain) this.setFilmGrain(fx.shader.filmGrain);
            }
        }
        
        // Apply player light config
        if (fx.playerLight) {
            this.setPlayerLight(fx.playerLight);
        }
        
        // Apply static level lights
        if (fx.lights && Array.isArray(fx.lights)) {
            for (const light of fx.lights) {
                this.addLight(light.x, light.y, light);
            }
        }
        
        // Set time of day
        if (fx.time !== undefined && this.fx) {
            this.fx.setTime(fx.time);
        }
        
        // Apply weather
        if (fx.weather && this.fx) {
            this.fx.setWeather(fx.weather);
        }
    }
    
    /**
     * Parse map decorations and spawn dynamic entities
     * Called by IsoPixelAdapter after loading level
     */
    spawnEntities() {
        if (!this.levelMetadata || !this.levelMetadata.decorations) return;
        
        this.entities = [];
        console.log('[IsoGame] Spawning entities...');
        
        if (!window.IsoEntity) {
            console.error('IsoEntity class not loaded!');
            return;
        }

        const decorations = this.levelMetadata.decorations;
        
        for (const dec of decorations) {
            // Handle Start/Spawn Point
            if (dec.type === 'spawn') {
                const floorZ = this.getZAt(dec.x, dec.y);
                const spawnZ = Math.max(dec.z || 0, floorZ);
                // Offset by 0.5 to center player in the tile
                this.player.x = dec.x + 0.5;
                this.player.y = dec.y + 0.5;
                this.player.z = spawnZ;
                this.player.renderX = this.player.x;
                this.player.renderY = this.player.y;
                this.player.renderZ = spawnZ;
                
                // Reset camera to new spawn
                if (this.renderer && this.renderer.camera) {
                    this.renderer.camera.x = this.player.x;
                    this.renderer.camera.y = this.player.y;
                }
                console.log(`[IsoGame] Player spawn set to (${this.player.x}, ${this.player.y}, ${spawnZ})`);
                continue; // Don't create an entity for spawn point
            }

            if (dec.type === 'npc' || dec.type === 'enemy') {
                // Ensure z is at floor level if not specified or 0
                // We use getZAt to find the floor height at that tile
                const floorZ = this.getZAt(dec.x, dec.y);
                const spawnZ = Math.max(dec.z || 0, floorZ);
                
                const entity = new window.IsoEntity(this, {
                    ...dec,
                    // Offset by 0.5 to center NPC in the tile
                    x: dec.x + 0.5,
                    y: dec.y + 0.5,
                    z: spawnZ
                });
                
                this.entities.push(entity);
                console.log(`[IsoGame] Spawned ${dec.type} at (${dec.x + 0.5}, ${dec.y + 0.5}, ${spawnZ})`);
            }
        }
    }
    
    /**
     * Built-in scene presets combining lighting + shaders
     * Use: game.applyScenePreset('dungeon')
     */
    applyScenePreset(preset) {
        const presets = {
            // Bright outdoor daytime
            day: {
                lighting: 'day',
                shader: 'none',
                playerLight: { enabled: false }
            },
            // Warm sunset/dusk
            sunset: {
                lighting: 'dusk',
                shader: { 
                    bloom: { enabled: true, intensity: 0.3, threshold: 0.7 },
                    colorGrade: { enabled: true, contrast: 1.05, saturation: 1.1, tint: [1.05, 0.98, 0.9] },
                    vignette: { enabled: true, intensity: 0.15 }
                },
                playerLight: { enabled: false }
            },
            // Dark outdoor night
            night: {
                lighting: 'night',
                shader: {
                    bloom: { enabled: true, intensity: 0.4, threshold: 0.6 },
                    colorGrade: { enabled: true, contrast: 1.1, saturation: 0.8, tint: [0.95, 0.95, 1.05] },
                    vignette: { enabled: true, intensity: 0.25 }
                },
                playerLight: { radius: 150, color: '#ffffaa', intensity: 0.7 }
            },
            // Indoor dungeon/cave
            dungeon: {
                lighting: 'dungeon',
                shader: {
                    bloom: { enabled: true, intensity: 0.6, threshold: 0.4 },
                    colorGrade: { enabled: true, contrast: 1.2, saturation: 0.85, brightness: 0.95 },
                    vignette: { enabled: true, intensity: 0.5, softness: 0.4 },
                    filmGrain: { enabled: true, intensity: 0.03 }
                },
                playerLight: { radius: 120, color: '#ffcc66', intensity: 0.8, falloff: 'smooth' }
            },
            // Deep cave - very dark
            cave: {
                lighting: 'cave',
                shader: {
                    bloom: { enabled: true, intensity: 0.7, threshold: 0.3 },
                    colorGrade: { enabled: true, contrast: 1.3, saturation: 0.7, brightness: 0.9 },
                    vignette: { enabled: true, intensity: 0.6, softness: 0.3 }
                },
                playerLight: { radius: 100, color: '#ffaa44', intensity: 0.9, falloff: 'sharp' }
            },
            // Magical/ethereal area
            magical: {
                lighting: { ambient: '#1a1a2e', intensity: 0.7 },
                shader: {
                    bloom: { enabled: true, intensity: 0.8, threshold: 0.4 },
                    colorGrade: { enabled: true, contrast: 1.1, saturation: 1.3, tint: [0.95, 0.9, 1.15] },
                    chromaticAberration: { enabled: true, intensity: 0.002 }
                },
                playerLight: { radius: 130, color: '#aaccff', intensity: 0.6, falloff: 'soft' }
            },
            // Horror/spooky
            horror: {
                lighting: 'cave',
                shader: {
                    bloom: { enabled: true, intensity: 0.4, threshold: 0.6 },
                    colorGrade: { enabled: true, contrast: 1.4, saturation: 0.5, brightness: 0.85, tint: [0.95, 1.0, 0.95] },
                    vignette: { enabled: true, intensity: 0.7, softness: 0.25 },
                    filmGrain: { enabled: true, intensity: 0.08 },
                    chromaticAberration: { enabled: true, intensity: 0.004 }
                },
                playerLight: { radius: 80, color: '#ddddaa', intensity: 0.7, falloff: 'sharp' }
            },
            // Retro/nostalgic
            retro: {
                lighting: 'day',
                shader: 'retro',
                playerLight: { enabled: false }
            }
        };
        
        const config = presets[preset];
        if (!config) {
            console.warn(`[IsoEngine] Unknown scene preset: ${preset}`);
            return;
        }
        
        console.log(`[IsoEngine] Applying scene preset: ${preset}`);
        
        // Apply lighting
        if (config.lighting) {
            if (typeof config.lighting === 'string') {
                this.setLightingPreset(config.lighting);
            } else {
                if (this.fx && config.lighting.ambient) this.fx.ambientColor = config.lighting.ambient;
                if (this.fx && config.lighting.intensity !== undefined) this.fx.ambientIntensity = config.lighting.intensity;
            }
        }
        
        // Apply shaders
        if (config.shader) {
            if (typeof config.shader === 'string') {
                this.setShaderPreset(config.shader);
            } else {
                // Reset to baseline first
                this.setShaderPreset('none');
                if (config.shader.bloom) this.setBloom(config.shader.bloom);
                if (config.shader.colorGrade) this.setColorGrade(config.shader.colorGrade);
                if (config.shader.vignette) this.setVignette(config.shader.vignette);
                if (config.shader.chromaticAberration) this.setChromaticAberration(config.shader.chromaticAberration);
                if (config.shader.filmGrain) this.setFilmGrain(config.shader.filmGrain);
            }
        }
        
        // Apply player light
        if (config.playerLight) {
            this.setPlayerLight(config.playerLight);
        }
    }
}

window.onload = () => {
    // Skip auto-init in campaign runtime mode - adapter will handle it
    if (window.CAMPAIGN_RUNTIME_MODE) {
        console.log('[IsoEngine] Campaign runtime mode detected, skipping auto-init');
        return;
    }
    
    window.game = new IsoGame();
    if (document.getElementById('demo-title') || !document.getElementById('login-screen')) {
        window.game.init();
    }
};
