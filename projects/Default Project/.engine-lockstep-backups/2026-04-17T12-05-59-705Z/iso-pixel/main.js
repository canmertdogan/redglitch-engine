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
        this.keys = {};
        this.keysPressed = {}; // For detecting key press events
        this.levelMetadata = null;
        
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

        window.addEventListener('keydown', e => {
            if (!this.keys[e.code]) this.keysPressed[e.code] = true;
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
            this.keysPressed[e.code] = false;
        });
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
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
        
        // Initialize HUD System
        if (window.IsoHUDSystem) {
            this.hud = new IsoHUDSystem(this);
            this.syncHUDStats();
            
            // Set up some demo skills
            this.hud.setSkill(0, { icon: '⚔', color: '#e74c3c', cooldown: 2 });
            this.hud.setSkill(1, { icon: '🔥', color: '#f39c12', cooldown: 5 });
            this.hud.setSkill(2, { icon: '❄', color: '#3498db', cooldown: 8 });
            this.hud.setSkill(3, { icon: '⚡', color: '#9b59b6', cooldown: 10 });
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
        this.strategy = new IsoStrategy();
        this.config = { tileSize: 16, scale: 2 }; 
        
        try {
            let levelData = null;
            const playtestData = sessionStorage.getItem('ketebe_playtest_map');
            if (playtestData) {
                levelData = JSON.parse(playtestData);
            } else {
                const res = await fetch('dunyalar/level1.json');
                if(res.ok) levelData = await res.json();
            }

            if(levelData) {
                this.levelMetadata = levelData;
                
                // Load Character Sprites (4-directional)
                this.sprites = {};
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
                
                // Load Caterpillar/Worm sprites (matching 2D engine's "Vortex Canavarı")
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
                
                // Initialize worm history with spawn position
                for (let i = 0; i < 200; i++) {
                    this.player.history.push({
                        x: this.player.x,
                        y: this.player.y,
                        z: this.player.z,
                        direction: this.player.direction
                    });
                }
                
                this.strategy.prepareCache(this.tileset, this.config);
            } else {
                this.generateDefaultMap();
            }
        } catch(e) {
            console.error("Failed to load map:", e);
            this.generateDefaultMap();
        }

        // Initialize FX and HUD systems after everything is loaded
        this.initSystems();
        
        // Apply level-specific lighting/shader settings
        this.applyLevelFX();

        this.running = true;
        requestAnimationFrame(t => this.loop(t));
        
        const loading = document.getElementById('loading-screen');
        if(loading) loading.classList.add('hidden');
        document.getElementById('game-container')?.classList.remove('hidden');
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
        if (map.layers) {
            for(let l=0; l<map.layers.length; l++) {
                 if (map.layers[l][idx] !== null && map.layers[l][idx] !== undefined) {
                     const z = map.z[l][idx];
                     const shape = map.shapes[l][idx];
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
        
        // === INPUT HANDLING ===
        // Calculate target velocity from input (isometric directions)
        let inputX = 0, inputY = 0;
        if (this.keys['ArrowUp'] || this.keys['KeyW']) { inputX -= 1; inputY -= 1; }
        if (this.keys['ArrowDown'] || this.keys['KeyS']) { inputX += 1; inputY += 1; }
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) { inputX -= 1; inputY += 1; }
        if (this.keys['ArrowRight'] || this.keys['KeyD']) { inputX += 1; inputY -= 1; }
        
        // Normalize diagonal movement
        const inputLen = Math.sqrt(inputX * inputX + inputY * inputY);
        if (inputLen > 0) {
            inputX = (inputX / inputLen) * this.MOVE_SPEED;
            inputY = (inputY / inputLen) * this.MOVE_SPEED;
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

        // 2. FX World layer (particles in world space)
        if (this.fx) {
            ctx.save();
            ctx.translate(targetCanvas.width / 2 + mockState.camX, targetCanvas.height / 4 + mockState.camY);
            this.fx.renderWorld(ctx);
            ctx.restore();
        }
        
        // 3. FX Screen layer (weather, lighting overlay)
        if (this.fx) {
            this.fx.renderScreen(ctx);
        }

        // 4. HUD layer (always on top)
        if (this.hud) {
            this.hud.render();
        }
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
                    bloom: { enabled: true, intensity: 0.4, threshold: 0.6 },
                    colorGrade: { enabled: true, contrast: 1.1, saturation: 1.2, tint: [1.1, 0.95, 0.85] },
                    vignette: { enabled: true, intensity: 0.25 }
                },
                playerLight: { enabled: false }
            },
            // Dark outdoor night
            night: {
                lighting: 'night',
                shader: {
                    bloom: { enabled: true, intensity: 0.5, threshold: 0.5 },
                    colorGrade: { enabled: true, contrast: 1.15, saturation: 0.9, tint: [0.9, 0.95, 1.1] },
                    vignette: { enabled: true, intensity: 0.4 }
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
    window.game = new IsoGame();
    if (document.getElementById('demo-title') || !document.getElementById('login-screen')) {
        window.game.init();
    }
};
