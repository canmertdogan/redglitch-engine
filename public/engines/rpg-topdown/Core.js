window.Core = class Core {
    constructor() {
        this.canvas = document.getElementById('gameCanvas'); this.ctx = this.canvas.getContext('2d');
        this.input = window.RedGlitchInput || new window.InputHandler(this.canvas); 
        this.mapSystem = new window.MapSystem(this.ctx);
        this.dialogueSystem = new window.DialogueSystem(); this.achievementSystem = new window.AchievementSystem(); this.saveSystem = new window.SaveSystem();
        this.questSystem = new window.QuestSystem(this);
        this.campaign = new window.CampaignSystem(this); 
        this.uiSystem = new window.UISystem(this);
        
        // Initialize Logic System
        this.logicSystem = new window.LogicSystem(this);
        
        // V2.0: Initialize Visual Script Runtime
        if (window.VisualScriptEngine) {
            this.vsl = new window.VisualScriptEngine(this);
            console.log("[Core] VisualScriptEngine initialized (v2.0)");
        } else {
            // Lazy load if not present (Phase 1)
            import('./VisualScriptEngine.js').then(m => {
                window.VisualScriptEngine = m.VisualScriptEngine;
                this.vsl = new m.VisualScriptEngine(this);
                console.log("[Core] VisualScriptEngine lazy-loaded (v2.0)");
            });
        }
        
        // Initialize Interactive Cutscene Engine (Phase 1)
        if (window.InteractiveCutsceneEngine) {
            this.interactiveCutsceneEngine = new window.InteractiveCutsceneEngine(this);
            console.log("Interactive Cutscene Engine initialized");
        } 
        
        this.isRunning = false; this.isPaused = false;
        this.player = {
            x: 0, y: 0, width: 16, height: 16, scale: 3, speed: 250, direction: 1, hp: 100, maxHp: 100, mana: 50, maxMana: 50, stamina: 100, maxStamina: 100,
            state: 'idle', frame: 0, timer: 0, animSpeed: 0.15, shootCooldown: 0, vy: 0, onGround: false, jumpForce: -600, gravity: 1500, manaDepleted: false,
            history: [], segmentCount: 8, segmentSpacing: 4, glowColor: '#e74c3c'
        };
        this.playerHead = window.createPixelImage('caterpillar_head'); this.playerBody = window.createPixelImage('caterpillar_body'); this.targetSprite = window.createPixelImage('target');
        this.fireFrames = [window.createPixelImage('fire_1'), window.createPixelImage('fire_2'), window.createPixelImage('fire_3')];
        
        const createTextSprite = (text) => { const canvas = document.createElement('canvas'); const fontSize = 14; const h = 20; const w = Math.max(20, text.length * 12 + 4); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; const cx = w / 2; const cy = h / 2; ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e74c3c'; for(let ox=-1; ox<=1; ox++) for(let oy=-1; oy<=1; oy++) ctx.fillText(text, cx + ox, cy + oy); ctx.fillStyle = '#f39c12'; ctx.fillText(text, cx, cy - 1); ctx.fillText(text, cx, cy + 1); ctx.fillText(text, cx - 1, cy); ctx.fillText(text, cx + 1, cy); ctx.fillStyle = '#ffffff'; ctx.fillText(text, cx, cy); return canvas; };
        this.irabSprites = ['أ','ب','ت','ج','د','ر','س','ص','ط','ع','ف','ق','ك','ل','م','ن','هـ','و','ي'].map(createTextSprite);
        this.ultimateSprites = ['فعل','فاعل','مفعول به','رفع','نصب','جر','مبتدأ','خبر'].map(createTextSprite);
        
        this.fireballs = []; 
        for(let i=0; i<200; i++) this.fireballs.push(new window.Fireball()); // Pool init
        this.fireballIndex = 0;
        this.collisionCandidates = []; // GC Optimization
        this.renderLights = []; // GC Optimization

        // --- HOT RELOADING (Phase 2) ---
        this.setupHotReloading();

        this.enemies = []; this.npcs = []; this.particles = []; this.weather = new window.WeatherSystem(); this.screenShake = 0;
        this.fx = new window.FXSystem(this.ctx, this.canvas.width, this.canvas.height); 
        this.audio = window.Sound; 
        if (this.audio && !this.audio.ctx) this.audio.init();

        this.console = new window.DebugConsole(this); 
        this.gameTime = 8.0; this.timeSpeed = 0.1; 

        this.entities = []; this.camera = { x: 0, y: 0 }; this.prevCamera = { x: 0, y: 0 }; this.currentLevel = 1; this.currentLevelId = 'level1';
        this.spatialHash = new window.SpatialHash(128); // Cell Size 128
        this.enemyDefs = {}; this.npcDefs = {}; this.itemDefs = []; this.skillDefs = []; this.inventory = []; this.activeSkills = [null, null, null, null];
        
        this.revives = 5;
        this.respawns = 3;
        this.uiBars = { 
            hp: document.querySelector('.bar-fill.hp') || document.getElementById('hp_bar_fill'), 
            stamina: document.querySelector('.bar-fill.stamina') || document.getElementById('stamina_bar_fill'), 
            mana: document.querySelector('.bar-fill.mana') || document.getElementById('mana_bar_fill') 
        };
        this.interactionHint = document.getElementById('interaction-hint');
        this.lastTime = performance.now();
        this.accumulator = 0;
        this.fixedTimeStep = 1 / 60;
        this.loadProfileData(); this.setupDeathEvents(); this.resize(); window.addEventListener('resize', () => this.resize());
        
        const fsBtn = document.getElementById('fullscreen-btn'); if (fsBtn) fsBtn.addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); });
        const isoBtn = document.getElementById('debug-iso-btn'); if (isoBtn) isoBtn.addEventListener('click', () => { this.mapSystem.type = (this.mapSystem.type === 'isometric') ? 'topdown' : 'isometric'; });
        const saveBtn = document.getElementById('btn-save'); if (saveBtn) saveBtn.addEventListener('click', async () => { if (this.isRunning && this.playerName) { const gameState = { level: this.currentLevel, player: this.player, inventory: this.inventory, activeSkills: this.activeSkills }; if (await this.saveSystem.save(this.playerName, 1, gameState)) alert("GAME SAVED!"); else alert("SAVE FAILED!"); } });
    }

    setupHotReloading() {
        if (!window.RedGlitchEventBus) return;

        // Listen for asset updates
        window.RedGlitchEventBus.on('file:changed', async (event) => {
            const filePath = event.data.path;
            console.log('[Core:HotReload] File changed:', filePath);

            if (filePath.endsWith('.png')) {
                // Force reload of any images using this path
                const img = new Image();
                img.src = `${filePath}?t=${Date.now()}`;
                await new Promise(r => img.onload = r);
                console.log(`[Core:HotReload] Image reloaded: ${filePath}`);
                
                // Update all entities that might be using this sprite
                this.npcs.concat(this.enemies).forEach(entity => {
                    if (entity.def && (entity.def.sprite === filePath || JSON.stringify(entity.def).includes(filePath))) {
                        if (entity.refreshSprites) entity.refreshSprites();
                    }
                });
            }
        });

        // Listen for FX updates
        window.RedGlitchEventBus.on('fx:updated', async (event) => {
            console.log('[Core:HotReload] FX updated:', event.data.id);
            if (this.fxSystem && this.fxSystem.reloadEffect) {
                this.fxSystem.reloadEffect(event.data.id, event.data.config);
            }
        });

        // Phase 27: VFX Bridge registration
        if (window.VFX) window.VFX.setSystem(this.fx, '2d');
        
        // Phase 26: Performance Profiler
        this.profiler = window.RedGlitchProfiler;
    }

    login(username) {
        console.log(`[RPG Core] Login requested for: ${username}`);
        if (window.menuSystem) {
            window.menuSystem.login(username);
        } else {
            console.warn("[RPG Core] MenuSystem not ready for login.");
        }
    }

    refreshUI() {
        this.uiBars = { 
            hp: document.querySelector('.bar-fill.hp') || document.getElementById('hp_bar_fill'), 
            stamina: document.querySelector('.bar-fill.stamina') || document.getElementById('stamina_bar_fill'), 
            mana: document.querySelector('.bar-fill.mana') || document.getElementById('mana_bar_fill') 
        };
    }

    log(msg, type = 'info') { const color = type === 'error' ? 'red' : (type === 'success' ? 'green' : 'white'); console.log(`%c[GAME] ${msg}`, `color: ${color}`); if (this.console && this.console.log) this.console.log(msg, type); }

    setupDeathEvents() {
        const btnRevive = document.getElementById('btn-revive'); const btnRespawn = document.getElementById('btn-respawn'); const btnQuit = document.getElementById('btn-death-quit');
        if (btnRevive) btnRevive.onclick = () => this.revive();
        if (btnRespawn) btnRespawn.onclick = () => this.respawn();
        if (btnQuit) btnQuit.onclick = () => { document.getElementById('death-screen').classList.add('hidden'); window.menuSystem.switchScreen('mainMenu'); this.stop(); };
    }
    die() { this.isRunning = false; const deathScreen = document.getElementById('death-screen'); if (deathScreen) { deathScreen.classList.remove('hidden'); document.getElementById('revive-count').innerText = this.revives; document.getElementById('respawn-count').innerText = this.respawns; document.getElementById('btn-revive').style.display = this.revives > 0 ? 'block' : 'none'; document.getElementById('btn-respawn').style.display = this.respawns > 0 ? 'block' : 'none'; } }
    revive() { if (this.revives > 0) { this.revives--; this.player.hp = this.player.maxHp; this.isRunning = true; document.getElementById('death-screen').classList.add('hidden'); this.lastTime = performance.now(); requestAnimationFrame(this.gameLoop.bind(this)); } }
    async respawn() { if (this.respawns > 0) { this.respawns--; this.inventory = []; this.updateInventoryHUD(); this.player.hp = this.player.maxHp; this.player.mana = this.player.maxMana; this.player.stamina = this.player.maxStamina; await this.loadLevel(this.currentLevelId || 'level1'); this.isRunning = true; document.getElementById('death-screen').classList.add('hidden'); this.lastTime = performance.now(); requestAnimationFrame(this.gameLoop.bind(this)); } }
    loadProfileData(data) { 
        let p = data;
        if (!p) {
            try {
                p = JSON.parse(localStorage.getItem('redglitch_character')); 
            } catch(e) {
                console.error("Failed to parse redglitch_character", e);
            }
        }
        if (p) { 
            if(p.hp) { this.player.hp = p.hp; this.player.maxHp = p.hp; } 
            if(p.stamina) { this.player.stamina = p.stamina; this.player.maxStamina = p.stamina; } 
            if(p.mana) { this.player.mana = p.mana; this.player.maxMana = p.mana; } 
            if(p.speed) this.player.speed = p.speed; 
            if(p.jumpForce) this.player.jumpForce = -p.jumpForce; 
            if(p.segmentCount) this.player.segmentCount = p.segmentCount; 
            if(p.segmentSpacing) this.player.segmentSpacing = p.segmentSpacing; 
            this.player.glowColor = p.glowColor || '#e74c3c'; 
            if (p.headData && p.headData.startsWith('data:image')) { const img = new Image(); img.src = p.headData; this.playerHead = img; } 
            if (p.bodyData && p.bodyData.startsWith('data:image')) { const img = new Image(); img.src = p.bodyData; this.playerBody = img; } 
        } 
    }
    
    spawnFireball(x, y, dx, dy, sprite) {
        // Ring Buffer Strategy: O(1) and never fails
        const fb = this.fireballs[this.fireballIndex];
        this.fireballIndex = (this.fireballIndex + 1) % this.fireballs.length;
        
        fb.reset(x, y, dx, dy, sprite);
        return fb;
    }

    // --- PHYSICS HELPER (Sliding) ---
    moveEntity(entity, dx, dy, speed, dt) {
        const sw = (entity.width || 16) * (entity.scale || 3);
        const sh = (entity.height || 16) * (entity.scale || 3);
        const padding = 10; // Hitbox padding

        // X Axis
        if (dx !== 0) {
            const moveX = dx * speed * dt;
            const nextX = entity.x + moveX;
            const direction = dx > 0 ? 'right' : 'left';
            // Check corners with directional collision
            if (!this.mapSystem.isSolid(nextX + padding, entity.y + padding, direction) && 
                !this.mapSystem.isSolid(nextX + sw - padding, entity.y + sh - padding, direction) &&
                !this.mapSystem.isSolid(nextX + padding, entity.y + sh - padding, direction) && 
                !this.mapSystem.isSolid(nextX + sw - padding, entity.y + padding, direction)) {
                entity.x = nextX;
                
                // Check trigger zones
                if (entity === this.player) {
                    this.checkTriggerZones(entity);
                }
            }
        }

        // Y Axis
        if (dy !== 0) {
            const moveY = dy * speed * dt;
            const nextY = entity.y + moveY;
            const direction = dy > 0 ? 'down' : 'up';
            // Check corners with directional collision
            if (!this.mapSystem.isSolid(entity.x + padding, nextY + padding, direction) && 
                !this.mapSystem.isSolid(entity.x + sw - padding, nextY + sh - padding, direction) &&
                !this.mapSystem.isSolid(entity.x + padding, nextY + sh - padding, direction) && 
                !this.mapSystem.isSolid(entity.x + sw - padding, nextY + padding, direction)) {
                entity.y = nextY;
                
                // Check trigger zones
                if (entity === this.player) {
                    this.checkTriggerZones(entity);
                }
            }
        }
    }
    
    checkTriggerZones(entity) {
        const cx = entity.x + (entity.width || 16) * (entity.scale || 3) / 2;
        const cy = entity.y + (entity.height || 16) * (entity.scale || 3) / 2;
        
        if (this.mapSystem.isTriggerZone(cx, cy)) {
            const ts = this.mapSystem.tileSize * this.mapSystem.scale;
            const tileX = Math.floor(cx / ts);
            const tileY = Math.floor(cy / ts);
            const triggerId = `trigger_${tileX}_${tileY}`;
            
            // Fire trigger event only once per entry
            if (!this.activeTriggers) this.activeTriggers = new Set();
            if (!this.activeTriggers.has(triggerId)) {
                this.activeTriggers.add(triggerId);
                console.log(`[Trigger] Entered zone at (${tileX}, ${tileY})`);
                
                // Fire custom event for game logic to hook into
                if (this.onTriggerEnter) {
                    this.onTriggerEnter(tileX, tileY);
                }
            }
        } else {
            // Clear triggers when not in zone
            if (this.activeTriggers) this.activeTriggers.clear();
        }
    }

    // Updated to use FXSystem
    spawnParticle(x, y, vx, vy, color, life, size = 4, spriteFrames = null) { 
        // Map legacy params to new config
        const config = {
            physics: { gravity: 0, drag: 0.95, spread: 0 },
            life: { min: life, max: life },
            size: { start: size, end: 0 },
            color: { start: color || '#fff', end: color || '#fff' },
            speed: { min: 0, max: 0 } // handled by vx/vy override
        };
        
        // Manual spawn on FXSystem
        const p = this.fx.pool.find(p => !p.active);
        if (p) {
            p.init(x, y, 0, config, spriteFrames ? spriteFrames[0] : null);
            p.vx = vx;
            p.vy = vy;
        }
    }

    createExplosion(x, y, color, count = 8) { for (let i = 0; i < count; i++) { const angle = Math.random() * Math.PI * 2; const speed = 50 + Math.random() * 100; this.spawnParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, 0.5 + Math.random() * 0.5, 3 + Math.random() * 3); } }    async start(playerName, isNewGame, options = {}) {
        this.playerName = playerName; this.isRunning = true; this.isPaused = false;
        const skipInitialLevelLoad = !!options.skipInitialLevelLoad;
        await this.loadDefinitions(); this.assignSkills(); 
        await this.achievementSystem.init(playerName); 
        await this.dialogueSystem.init();
        await this.questSystem.init();
        this.achievementSystem.unlock('START_GAME');
        if (isNewGame) { this.player.hp = 100; this.player.mana = 50; this.player.stamina = 100; this.currentLevel = 1; if (!skipInitialLevelLoad) await this.loadLevel(this.currentLevel); } 
        else { const data = await this.saveSystem.load(playerName, 1); if (data) { this.currentLevel = data.level; this.player.hp = data.player.hp; this.player.maxHp = data.player.maxHp; this.player.mana = data.player.mana; this.player.stamina = data.player.stamina; this.inventory = data.inventory || []; this.activeSkills = data.activeSkills || [null,null,null,null]; await this.loadLevel(this.currentLevel); this.player.x = data.player.x; this.player.y = data.player.y; this.updateInventoryHUD(); this.updateSkillHUD(); } else await this.start(playerName, true, options); }
        requestAnimationFrame(this.gameLoop.bind(this)); for(let i=0; i<300; i++) this.player.history.push({ x: this.player.x, y: this.player.y, dir: this.player.direction });
    }
    async loadDefinitions() {
        try {
            const [eRes, nRes, iRes, cRes, sRes] = await Promise.all([fetch('/dunyalar/definitions/enemies.json'), fetch('/dunyalar/definitions/npcs.json'), fetch('/dunyalar/definitions/items.json'), fetch('/dunyalar/definitions/campaign.json'), fetch('/dunyalar/definitions/skills.json')]);
            if (eRes.ok) (await eRes.json()).forEach(def => this.enemyDefs[def.id] = def);
            if (nRes.ok) (await nRes.json()).forEach(def => this.npcDefs[def.id] = def);
            if (iRes.ok) this.itemDefs = await iRes.json();
            if (sRes.ok) this.skillDefs = await sRes.json();
            if (cRes.ok) this.campaign.data = await cRes.json(); else this.campaign.data = [{ id: 'level1', next: 'level2' }];
        } catch (e) {}
    }
    triggerUltimate() { console.log("SERIOUS IRAB BURST!"); this.screenShake = 0.5; this.achievementSystem.unlock('IRAB_BURST'); const rings = 3; const bulletsPerRing = 32; const sw = this.player.width * this.player.scale, sh = this.player.height * this.player.scale; const sx = this.player.x + sw/2, sy = this.player.y + sh/2; for (let r = 0; r < rings; r++) { const rot = (r * Math.PI) / 8; const speed = 250 + (r * 75); for (let i = 0; i < bulletsPerRing; i++) { const ang = (i / bulletsPerRing) * Math.PI * 2 + rot; const spr = this.ultimateSprites[Math.floor(Math.random() * this.ultimateSprites.length)]; const fb = this.spawnFireball(sx - (spr.width * 1.5)/2, sy - (spr.height * 1.5)/2, Math.cos(ang), Math.sin(ang), spr); if(fb) { fb.speed = speed; fb.life = 4.0; fb.scale = 1.5; } } } }

    destroy() {
        this.isRunning = false;
        
        // Cleanup Input
        if (this.input && this.input.destroy) {
            this.input.destroy();
        }

        // Remove Resize Listener
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
        } else {
            // Since we didn't store the bound function in constructor (legacy code),
            // we can't easily remove it. We rely on the fact that arrow functions
            // in addEventListener might be hard to remove.
            // Future improvement: Store bound handlers in constructor.
        }

        // Cleanup any systems that need it
        if (this.audio && this.audio.stopAll) {
            this.audio.stopAll();
        }

        // Clear Canvas
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        console.log('[RPG Core] Destroyed');
    }

    async loadLevelFromData(dungeonData) {
        try {
            await this.mapSystem.loadMap(dungeonData); this.enemies = []; this.npcs = [];
            const loadDecorations = async () => {
                for (const d of this.mapSystem.decorations) {
                    if (d.type === 'enemy') this.enemies.push(new window.Enemy(d.x * 48, d.y * 48, d.data, this));
                    else if (d.type === 'npc') this.npcs.push(new window.NPC(d.x * 48, d.y * 48, d.data, this));
                    else if (d.type === 'prefab') {
                        try { const res = await fetch(`dunyalar/definitions/${d.data}`); if (res.ok) { const prefab = await res.json(); const hasStats = prefab.components.some(c => c.type === 'Stats'); const script = prefab.components.find(c => c.type === 'Script'); const id = script ? script.scriptId : 'demo'; if (hasStats) { const en = new window.Enemy(d.x * 48, d.y * 48, id, this); en.def.name = prefab.name; if(prefab.sprite) { en.def.animations.idle.sprite = prefab.sprite; en.sprites.idle = window.createPixelImage(prefab.sprite); } this.enemies.push(en); } else { const npc = new window.NPC(d.x * 48, d.y * 48, id, this); if(prefab.sprite) { npc.def.animations.idle.sprite = prefab.sprite; npc.sprites.idle = window.createPixelImage(prefab.sprite); } this.npcs.push(npc); } } } catch(e) { console.warn("Prefab error", e); }
                    }
                }
            };
            await loadDecorations();
            if (this.fx) {
                if (dungeonData.ambience && !dungeonData.weather) { if (['rain', 'fog'].includes(dungeonData.ambience)) dungeonData.weather = dungeonData.ambience; if (dungeonData.ambience === 'night') dungeonData.lighting = 'night'; } 
                this.fx.setWeather(dungeonData.weather || 'none'); this.fx.setLighting(dungeonData.lighting || 'day');
            }

            // Apply Post-Process Shader
            if (this.postProcess) {
                this.postProcess.setShader(dungeonData.shader || 'default');
            }

            // Set player spawn position - support both formats
            if (dungeonData.spawnX !== undefined) { 
                this.player.x = dungeonData.spawnX; 
                this.player.y = dungeonData.spawnY; 
            } else if (dungeonData.spawn) {
                // Support editor format: spawn: {x, y}
                this.player.x = dungeonData.spawn.x * 48; // Convert tile to pixel coordinates
                this.player.y = dungeonData.spawn.y * 48;
            }
        } catch (err) { console.error(err); }
    }
    async loadLevel(levelId) {
        const path = (typeof levelId === 'number') ? `dunyalar/level${levelId}.json` : `dunyalar/${levelId}.json`;
        try {
            const res = await fetch(path); if (!res.ok) throw new Error(`Level not found`);
            const dungeonData = await res.json(); await this.mapSystem.loadMap(dungeonData);
            this.enemies = []; this.npcs = [];
            const name = String(dungeonData.name || levelId);
            const banner = document.createElement('div'); banner.style.cssText = `position: fixed; top: 20%; left: 50%; transform: translate(-50%, -50%); color: var(--gold); font-size: 4rem; text-shadow: 4px 4px 0 #000; z-index: 200; pointer-events: none; animation: fadeOut 3s forwards;`;
            banner.innerText = name.toUpperCase(); document.body.appendChild(banner); setTimeout(() => banner.remove(), 3000);
            
            const loadDecorations = async () => {
                for (const d of this.mapSystem.decorations) {
                    if (d.type === 'enemy') this.enemies.push(new window.Enemy(d.x * 48, d.y * 48, d.data, this));
                    else if (d.type === 'npc') this.npcs.push(new window.NPC(d.x * 48, d.y * 48, d.data, this));
                    else if (d.type === 'prefab') {
                        try { const res = await fetch(`dunyalar/definitions/${d.data}`); if (res.ok) { const prefab = await res.json(); const hasStats = prefab.components.some(c => c.type === 'Stats'); const script = prefab.components.find(c => c.type === 'Script'); const id = script ? script.scriptId : 'demo'; if (hasStats) { const en = new window.Enemy(d.x * 48, d.y * 48, id, this); en.def.name = prefab.name; if(prefab.sprite) { en.def.animations.idle.sprite = prefab.sprite; en.sprites.idle = window.createPixelImage(prefab.sprite); } this.enemies.push(en); } else { const npc = new window.NPC(d.x * 48, d.y * 48, id, this); if(prefab.sprite) { npc.def.animations.idle.sprite = prefab.sprite; npc.sprites.idle = window.createPixelImage(prefab.sprite); } this.npcs.push(npc); } } } catch(e) { console.warn("Prefab error", e); }
                    }
                }
            };
            await loadDecorations();
            
            if (this.fx) {
                if (dungeonData.ambience && !dungeonData.weather) { if (['rain', 'fog'].includes(dungeonData.ambience)) dungeonData.weather = dungeonData.ambience; if (dungeonData.ambience === 'night') dungeonData.lighting = 'night'; } 
                this.fx.setWeather(dungeonData.weather || 'none'); this.fx.setLighting(dungeonData.lighting || 'day');
            }
            
            // Set player spawn position - support both formats
            if (dungeonData.spawnX !== undefined) { 
                this.player.x = dungeonData.spawnX; 
                this.player.y = dungeonData.spawnY; 
            } else if (dungeonData.spawn) {
                // Support editor format: spawn: {x, y}
                this.player.x = dungeonData.spawn.x * 48; // Convert tile to pixel coordinates
                this.player.y = dungeonData.spawn.y * 48;
            }
            
            let musicToPlay = dungeonData.music; if (window.MUSIC_CONFIG && window.MUSIC_CONFIG.levels && window.MUSIC_CONFIG.levels[levelId]) { musicToPlay = window.MUSIC_CONFIG.levels[levelId]; } 
            if (musicToPlay) { this.playSong(musicToPlay); }
        } catch (err) { this.showVoidScreen(err.message); }
    }
    
    async playSong(songName) { 
        try { 
            if (songName.endsWith('.json')) { 
                const res = await fetch(`muzikler/${songName}`); 
                if (res.ok) { 
                    const songData = await res.json(); 
                    if(this.audio.playTracker) this.audio.playTracker(songData); 
                } 
            } else {
                // Assume Audio File
                this.audio.playMusic(`muzikler/${songName}`);
            }
        } catch (e) { console.warn("Failed to load song:", songName); } 
    } 
    
    showVoidScreen(msg) { 
        this.isRunning = false; 
        this.canvas.style.display = 'none'; 
        const hud = document.getElementById('game-hud') || document.getElementById('campaign-hud');
        if (hud) hud.classList.add('hidden'); 
        let voidScreen = document.getElementById('void-screen'); 
        if (!voidScreen) { 
            voidScreen = document.createElement('div'); 
            voidScreen.id = 'void-screen'; 
            voidScreen.style.cssText = `position: absolute; top:0; left:0; width:100%; height:100%; background: #100; color: #e74c3c; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: 'VT323', monospace; z-index: 9999;`; 
            document.body.appendChild(voidScreen); 
        } 
        voidScreen.innerHTML = `<h1>VOID</h1><p>${msg}</p><button onclick="location.reload()">RESTART</button>`; 
    } 
    stop() { this.isRunning = false; }
    resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; this.ctx.imageSmoothingEnabled = false; if (this.fx) this.fx.resize(this.canvas.width, this.canvas.height); }
    update(deltaTime) {
        this.gameTime += deltaTime * this.timeSpeed; if (this.gameTime >= 24) this.gameTime = 0;
        if (this.fx) { this.fx.update(deltaTime); this.fx.setTime(this.gameTime); }
        
        // Capture previous camera state for interpolation
        this.prevCamera.x = this.camera.x;
        this.prevCamera.y = this.camera.y;

        const input = window.RedGlitchInput || this.input;
        if (this.dialogueSystem && this.dialogueSystem.active) { 
            if (input.actions.action && !this.dialogueSystem.justStarted) { 
                if (this.dialogueSystem.choicesContainer.innerHTML === '') {
                    this.dialogueSystem.next(); 
                }
                input.actions.action = false; 
            } 
            return; 
        }

        if (!this.isRunning || this.isPaused) return;
        const sw = this.player.width * this.player.scale, sh = this.player.height * this.player.scale;
        
        // --- CAMERA JUICE (Look-Ahead + Smoothing) ---
        if (!this.ghostMode) {
            // 1. Calculate Target: Player Center + Mouse Offset (capped)
            const mouseXRel = input.mouse.x - (this.canvas.width / 2);
            const mouseYRel = input.mouse.y - (this.canvas.height / 2);
            const lookAheadFactor = 0.15; // How much it peeks towards mouse
            
            const targetCamX = (this.player.x + sw/2) - (this.canvas.width / 2) + (mouseXRel * lookAheadFactor);
            const targetCamY = (this.player.y + sh/2) - (this.canvas.height / 2) + (mouseYRel * lookAheadFactor);

            // 2. Smooth Lerp (0.1 = fast, 0.05 = heavy)
            const smoothSpeed = 5 * deltaTime;
            this.camera.x += (targetCamX - this.camera.x) * smoothSpeed;
            this.camera.y += (targetCamY - this.camera.y) * smoothSpeed;
        }
        
        // 3. Shake is handled by FXSystem now
        
        const axis = input.getAxis();
        const isMoving = (axis.x !== 0 || axis.y !== 0);
        if (isMoving) { const lastPos = this.player.history[0]; const distMoved = lastPos ? Math.sqrt((this.player.x - lastPos.x) ** 2 + (this.player.y - lastPos.y) ** 2) : 999; if (distMoved > 2) { this.player.history.unshift({ x: this.player.x, y: this.player.y, dir: this.player.direction }); if (this.player.history.length > 300) this.player.history.pop(); } }        if (!this.mapSystem || !this.mapSystem.width || !this.player) return;
        if (this.player.shootCooldown > 0) this.player.shootCooldown -= deltaTime;
        const pxS = this.player.x - this.camera.x + sw / 2, pyS = this.player.y - this.camera.y + sh / 2;
        const dx = input.mouse.x - pxS, dy = input.mouse.y - pyS, dist = Math.sqrt(dx * dx + dy * dy);
        this.aimCursor = { x: input.mouse.x, y: input.mouse.y };

        // AUTO-AIM
        if (input.joystick?.active) {
            let closest = null;
            let minDst = 400;
            this.enemies.forEach(en => {
                const d = Math.sqrt((en.x - this.player.x)**2 + (en.y - this.player.y)**2);
                if (d < minDst) { minDst = d; closest = en; }
            });
            if (closest) {
                const csw = closest.width * closest.scale;
                const csh = closest.height * closest.scale;
                this.aimCursor = {
                    x: (closest.x + csw/2) - this.camera.x,
                    y: (closest.y + csh/2) - this.camera.y
                };
            }
        }

        if (input.actions.skill1) this.useSkill(0); if (input.actions.skill2) this.useSkill(1); if (input.actions.skill3) this.useSkill(2); if (input.actions.skill4) this.useSkill(3);
        if (input.mouse.isDown && this.player.shootCooldown <= 0 && dist > 0 && this.player.mana >= 2) this.useSkill(-1); 
        if (!isMoving) { if (Math.random() > 0.8) this.spawnParticle(this.player.x + 24, this.player.y + 24, (Math.random()-0.5)*20, -Math.random()*40, '#f39c12', 0.6, 2); if (Math.random() > 0.85) this.spawnParticle(this.player.x + 10 + Math.random()*28, this.player.y + Math.random()*20, 0, -30 - Math.random()*20, null, 0.8, 20, this.fireFrames); } 
        if (this.player.mana <= 0.05 && !this.player.manaDepleted) { this.player.mana = 0; this.player.manaDepleted = true; this.triggerUltimate(); }
        if (this.player.mana < this.player.maxMana) { this.player.mana += 2 * deltaTime; if (this.player.mana >= 10) this.player.manaDepleted = false; }
        
        if (input.actions.inventory) {
            input.actions.inventory = false;
            if(this.uiSystem) this.uiSystem.showScreen('inventory');
        }
        
        this.enemies.forEach(en => { try { en.update(deltaTime); } catch(e) { console.warn("Enemy Error:", e); } }); 
        this.npcs.forEach(npc => { try { npc.update(deltaTime); } catch(e) { console.warn("NPC Error:", e); } });
        this.weather.update(deltaTime, this.canvas.width, this.canvas.height);
        
        // Update Logic System
        if (this.logicSystem) {
            try {
                this.logicSystem.updateAll(deltaTime);
            } catch(e) {
                console.error("Logic System Error:", e);
            }
        }

        // Update Spatial Audio Listener
        if (this.audio && this.player) {
            this.audio.updateListener(this.player.x, this.player.y);
        }

        // Update Spatial Hash
        this.spatialHash.clear();
        this.spatialHash.insert(this.player);
        this.enemies.forEach(en => this.spatialHash.insert(en));

        for (let i = 0; i < this.fireballs.length; i++) { 
            const fb = this.fireballs[i]; 
            if (!fb.active) continue;

            fb.update(deltaTime, this.mapSystem); 
            let removed = false; 
            
            if (fb.isEnemy) { 
                // Check against Player
                if (Math.sqrt((fb.x - this.player.x - 24) ** 2 + (fb.y - this.player.y - 24) ** 2) < 25) { 
                    this.player.hp -= 10; fb.life = 0; 
                    if(this.fx) {
                        this.fx.shake(5, 20);
                        this.fx.popText(this.player.x + 24, this.player.y, "10", "#e74c3c");
                    }
                    this.createExplosion(this.player.x + 24, this.player.y + 24, '#8e44ad', 5); fb.active = false; removed = true; 
                } 
            } else { 
                // Spatial Hash Query for Enemies
                this.collisionCandidates.length = 0;
                const candidates = this.spatialHash.retrieve(fb, this.collisionCandidates);
                for (const entity of candidates) {
                    if (entity === this.player) continue; 
                    if (entity.hp !== undefined && entity.maxHp !== undefined) {
                        if (Math.sqrt((fb.x - entity.x - 24) ** 2 + (fb.y - entity.y - 24) ** 2) < 30) { 
                            entity.hp -= 25; fb.life = 0; 
                            if(this.fx) this.fx.popText(entity.x + 24, entity.y, "25", "#ff0000");
                            this.createExplosion(fb.x, fb.y, '#ff0000', 5); 
                            if (entity.hp <= 0) { 
                                this.createExplosion(entity.x + 24, entity.y + 24, '#e74c3c', 15); 
                                const idx = this.enemies.indexOf(entity);
                                if (idx > -1) this.enemies.splice(idx, 1); 
                            } 
                            fb.active = false; removed = true; break; 
                        } 
                    }
                }
            } 
            if (!removed && fb.life <= 0) { 
                this.createExplosion(fb.x + (fb.width * fb.scale) / 2, fb.y + (fb.height * fb.scale) / 2, '#f39c12', 10); 
                fb.active = false; 
            } 
        } 
        
        if (this.player.hp <= 0) { this.player.hp = 0; this.updateHUD(); this.die(); return; }
        const sprinting = input.actions.shift && isMoving; let speed = this.player.speed;
        if (sprinting && this.player.stamina > 0) { this.player.stamina -= 20 * deltaTime; speed *= 1.8; this.player.animSpeed = 0.08; } 
        else { this.player.animSpeed = 0.15; if (this.player.stamina < this.player.maxStamina) this.player.stamina += 10 * deltaTime; }
        let nearNPC = false; this.npcs.forEach(npc => { 
            const dx = (this.player.x + 24) - (npc.x + 24);
            const dy = (this.player.y + 24) - (npc.y + 24);
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 80) { 
                nearNPC = true; 
                if (input.actions.action && !this.dialogueSystem.active) { 
                    const dialogueId = (npc.def && npc.def.interaction) ? npc.def.interaction.dialogue : npc.id; 
                    this.dialogueSystem.start(dialogueId); 
                    this.achievementSystem.unlock('TALK_NPC'); 
                    input.actions.action = false; 
                } 
            } 
        });
        this.mapSystem.decorations.forEach(deco => { if (deco.type === 'sign') { const dx = deco.x * 48 + 24; const dy = deco.y * 48 + 24; if (Math.sqrt((this.player.x + 24 - dx) ** 2 + (this.player.y + 24 - dy) ** 2) < 80) { nearNPC = true; if (input.actions.action && !this.dialogueSystem.active) { this.dialogueSystem.db.conversations.push({ id: "_sign_temp", nodes: [{ speaker: "sign", text: deco.data || "A blank sign." }] }); this.dialogueSystem.start("_sign_temp", () => { this.dialogueSystem.db.conversations = this.dialogueSystem.db.conversations.filter(c => c.id !== "_sign_temp"); }); input.actions.action = false; } } } if (deco.type === 'chest' && !deco.opened) { const dx = deco.x * 48 + 24; const dy = deco.y * 48 + 24; if (Math.sqrt((this.player.x + 24 - dx) ** 2 + (this.player.y + 24 - dy) ** 2) < 80) { nearNPC = true; if (input.actions.action && !this.dialogueSystem.active) { deco.opened = true; this.createExplosion(dx, dy, '#ff0000', 20); const itemIds = deco.data ? deco.data.split(',').map(s => s.trim()) : ["apple"]; itemIds.forEach(id => { const itemDef = this.itemDefs.find(i => i.id === id) || this.itemDefs[Math.floor(Math.random()*this.itemDefs.length)]; if (itemDef) { this.inventory.push({...itemDef}); console.log("Gained item:", itemDef.name); } }); this.updateInventoryHUD(); this.dialogueSystem.db.conversations.push({ id: "_chest_temp", nodes: [{ speaker: "hero", text: `You found: ${itemIds.join(", ")}!` }] }); this.dialogueSystem.start("_chest_temp", () => { this.dialogueSystem.db.conversations = this.dialogueSystem.db.conversations.filter(c => c.id !== "_chest_temp"); }); input.actions.action = false; } } } });
        if (this.interactionHint) { if (nearNPC && !this.dialogueSystem.active) { this.interactionHint.classList.remove('hidden'); } else { this.interactionHint.classList.add('hidden'); } }
        let mx = axis.x, my = axis.y; if (this.mapSystem.type === 'isometric') { mx = axis.x + axis.y; my = axis.y - axis.x; } 
        if (mx > 0) this.player.direction = 1; if (mx < 0) this.player.direction = -1;
        
        const len = Math.sqrt(mx*mx + my*my); 
        if (len > 0) { 
            // Normalize
            const ndx = mx / len;
            const ndy = my / len;
            this.moveEntity(this.player, ndx, ndy, speed, deltaTime);
        } 
        
        this.player.state = isMoving ? 'run' : 'idle'; 
        this.player.timer += deltaTime; 
        if (this.player.timer >= this.player.animSpeed) { 
            this.player.timer = 0; 
            this.player.frame++; 
        } 
        
        // Check for exit door to load next level
        if (this.mapSystem.mapExit) { 
            const exitX = this.mapSystem.mapExit.x * 48;
            const exitY = this.mapSystem.mapExit.y * 48;
            const distance = Math.sqrt((this.player.x - exitX) ** 2 + (this.player.y - exitY) ** 2);
            
            // Show hint when near exit
            if (distance < 80) {
                nearNPC = true; // Trigger interaction hint
            }
            
            // Enter exit when close enough
            if (distance < 50) {
                // In campaign runtime mode, the adapter handles progression
                if (window.CAMPAIGN_RUNTIME_MODE) {
                    console.log('[RPG Core] Exit reached - signaling levelComplete');
                    this.levelComplete = true;
                    return;
                }
                
                // Standalone mode: Try campaign system first
                const node = this.campaign && this.campaign.data && this.campaign.data.find(n => n.id === this.currentLevelId);
                if (node && node.next) {
                    this.currentLevelId = node.next;
                    this.loadLevel(this.currentLevelId);
                } else if (typeof this.currentLevel === 'number') {
                    // Fallback: increment level number
                    this.currentLevel++;
                    this.currentLevelId = this.currentLevel;
                    this.loadLevel(this.currentLevel).catch(() => {
                        // No more levels
                        alert("CONGRATULATIONS! YOU COMPLETED ALL LEVELS!");
                        this.isRunning = false;
                        window.location.reload();
                    });
                } else {
                    // Try to extract number from level name and increment
                    const match = String(this.currentLevelId).match(/(\d+)/);
                    if (match) {
                        const num = parseInt(match[0]) + 1;
                        const nextLevel = String(this.currentLevelId).replace(/\d+/, num);
                        this.currentLevelId = nextLevel;
                        this.loadLevel(nextLevel).catch(() => {
                            alert("CONGRATULATIONS! YOU COMPLETED ALL LEVELS!");
                            this.isRunning = false;
                            window.location.reload();
                        });
                    } else {
                        // No way to determine next level
                        alert("LEVEL COMPLETE! (No next level configured)");
                    }
                }
            }
        }
        
        this.updateHUD();
    }
    updateHUD() { 
        if (!this.player || !this.uiBars) return; if (this.uiBars.hp) this.uiBars.hp.style.width = `${(this.player.hp/this.player.maxHp)*100}%`; if (this.uiBars.stamina) this.uiBars.stamina.style.width = `${(this.player.stamina/this.player.maxStamina)*100}%`; if (this.uiBars.mana) this.uiBars.mana.style.width = `${(this.player.mana/this.player.maxMana)*100}%`; 
        const hours = Math.floor(this.gameTime); const minutes = Math.floor((this.gameTime - hours) * 60); const clockEl = document.getElementById('game-clock') || document.getElementById('clock'); if (clockEl) { clockEl.innerText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`; }
    }
    useItem(idx) { const item = this.inventory[idx]; if (!item) return; if (item.type === 'heal') this.player.hp = Math.min(this.player.maxHp, this.player.hp + item.value); if (item.type === 'mana') this.player.mana = Math.min(this.player.maxMana, this.player.mana + item.value); if (item.type === 'stamina') this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + item.value); this.createExplosion(this.player.x + 24, this.player.y + 24, '#fff', 10); this.inventory.splice(idx, 1); this.updateInventoryHUD(); }
    useSkill(slotIdx) {
        if (this.player.shootCooldown > 0) return; let skill = this.activeSkills[slotIdx]; if (slotIdx === -1) skill = { type: 'projectile', mana: 2, cooldown: 0.15, name: 'Arabic Fire' }; if (!skill || this.player.mana < skill.mana) return;
        this.player.mana -= skill.mana; this.player.shootCooldown = skill.cooldown || 0.5;
        const sw = this.player.width * this.player.scale, sh = this.player.height * this.player.scale;
        const pxS = this.player.x - this.camera.x + sw / 2, pyS = this.player.y - this.camera.y + sh / 2;
        const dx = this.aimCursor.x - pxS, dy = this.aimCursor.y - pyS, dist = Math.sqrt(dx * dx + dy * dy);
        let dirX = dx / dist, dirY = dy / dist;
        if (this.mapSystem.type === 'isometric') { const wx = dirY + dirX / 2; const wy = dirY - dirX / 2; const wl = Math.sqrt(wx*wx + wy*wy); dirX = wx/wl; dirY = wy/wl; }
        if (skill.type === 'projectile') { const spr = (slotIdx === -1) ? this.irabSprites[Math.floor(Math.random() * this.irabSprites.length)] : window.createPixelImage(skill.sprite); const scale = (slotIdx === -1) ? 1.5 : 2;
            const fb = this.spawnFireball(this.player.x + sw/2 - (spr.width * scale)/2, this.player.y + sh/2 - (spr.height * scale)/2, dirX, dirY, spr);
            if(fb) fb.scale = scale;
        }
        if (skill.type === 'heal') { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20); for(let i=0; i<15; i++) this.spawnParticle(this.player.x + sw/2, this.player.y + sh/2, (Math.random()-0.5)*100, -Math.random()*100, '#2ecc71', 0.8, 4); }
    }
    assignSkills() { for (let i = 0; i < 4; i++) { if (this.skillDefs && this.skillDefs[i]) { this.activeSkills[i] = this.skillDefs[i]; } else { this.activeSkills[i] = null; } } this.updateSkillHUD(); }
    updateSkillHUD() {
        const slots = document.querySelectorAll('#skill-bar .skill-slot');
        slots.forEach((slot, idx) => {
            const label = slot.innerText[0]; // Preserve Z,X,C,V
            slot.innerHTML = ''; // Clear but we will rebuild safely
            
            const labelSpan = document.createElement('span');
            labelSpan.style.cssText = 'position:absolute; top:2px; left:2px; font-size:10px; pointer-events:none;';
            labelSpan.textContent = label;
            slot.appendChild(labelSpan);

            const skill = this.activeSkills[idx];
            if (skill) {
                const icon = window.createPixelImage(skill.sprite);
                icon.style.width = '32px';
                icon.style.height = '32px';
                slot.appendChild(icon);
            }
        });
    }

    updateInventoryHUD() {
        const slots = document.querySelectorAll('.inv-slot');
        slots.forEach((slot, idx) => {
            slot.innerHTML = '';
            const item = this.inventory[idx];
            if (item) {
                const icon = window.createPixelImage(item.sprite);
                icon.style.width = '32px';
                icon.style.height = '32px';
                slot.appendChild(icon);
            }
        });
    }
    draw(alpha) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); 
        this.ctx.imageSmoothingEnabled = false;
        
        // Interpolate Camera
        const camX = this.prevCamera.x + (this.camera.x - this.prevCamera.x) * alpha;
        const camY = this.prevCamera.y + (this.camera.y - this.prevCamera.y) * alpha;
        
        // Shake is handled by FXSystem's render wrapper or manually here if needed
        // Since FXSystem now handles offsets in its own render, we need to pass camera-shake 
        // to mapSystem and others.
        
        let sx = 0, sy = 0;
        if (this.fx && this.fx.shakeTime > 0) {
             sx = (Math.random()-0.5) * this.fx.shakeIntensity; 
             sy = (Math.random()-0.5) * this.fx.shakeIntensity; 
        }

        const viewX = camX - sx;
        const viewY = camY - sy;

        // Draw Map with Shake
        this.mapSystem.draw(viewX, viewY, this.canvas.width, this.canvas.height);
        
        if (this.fx) this.fx.renderShadows(this.mapSystem, viewX, viewY, 3);
        if (this.fx) this.fx.render(viewX, viewY);

        const viewW = this.canvas.width;
        const viewH = this.canvas.height;
        const buffer = 100;

        const isVisible = (e) => {
            return (e.x + 50 > viewX - buffer && 
                    e.x - 50 < viewX + viewW + buffer && 
                    e.y + 50 > viewY - buffer && 
                    e.y - 50 < viewY + viewH + buffer);
        };

        this.enemies.forEach(en => { if(isVisible(en)) en.draw(this.ctx, viewX, viewY); });
        this.npcs.forEach(npc => { if(isVisible(npc)) npc.draw(this.ctx, viewX, viewY); });
        
        this.fireballs.forEach(fb => { 
            if(!fb.active) return;
            if (fb.x > viewX - buffer && fb.x < viewX + viewW + buffer && fb.y > viewY - buffer && fb.y < viewY + viewH + buffer) {
                const fsw = fb.width * fb.scale, fsh = fb.height * fb.scale; 
                this.ctx.drawImage(fb.sprite, Math.floor(fb.x - viewX), Math.floor(fb.y - viewY), fsw, fsh); 
            }
        });

        // Player is always visible (center)
        const sw = this.player.width * this.player.scale, sh = this.player.height * this.player.scale;
        const axis = this.input.getAxis(), isMoving = (axis.x !== 0 || axis.y !== 0);
        
        this.ctx.shadowColor = this.player.glowColor || '#e74c3c'; 
        this.ctx.shadowBlur = isMoving ? 10 : 25;
        
        // Draw Player Segments
        for (let i = this.player.segmentCount; i > 0; i--) { 
            const hIdx = i * this.player.segmentSpacing; 
            const pos = this.player.history[hIdx] || { x: this.player.x, y: this.player.y, dir: this.player.direction }; 
            const taper = 1.0 - (i / (this.player.segmentCount + 2)) * 0.8; 
            const segW = sw * taper, segH = sh * taper;
            
            this.ctx.save(); 
            this.ctx.translate(Math.floor(pos.x - viewX + sw/2), Math.floor(pos.y - viewY + sh/2)); 
            this.ctx.scale(pos.dir, 1);
            const wobble = isMoving ? Math.sin(Date.now() * 0.012 + i * 0.8) * (12 * (1-taper)) : 0;
            this.ctx.drawImage(this.playerBody, -segW/2, -segH/2 + wobble, segW, segH); 
            this.ctx.restore();
        }

        // Draw Player Head
        const headWobble = isMoving ? Math.sin(Date.now() * 0.012) * 5 : 0;
        this.ctx.save(); 
        this.ctx.translate(Math.floor(this.player.x - viewX + sw/2), Math.floor(this.player.y - viewY + sh/2 + headWobble)); 
        this.ctx.scale(this.player.direction, 1);
        this.ctx.drawImage(this.playerHead, -sw/2, -sh/2, sw, sh); 
        this.ctx.restore();
        
        this.ctx.shadowBlur = 0; 
        if (this.aimCursor) { const cs = 40; this.ctx.drawImage(this.targetSprite, this.aimCursor.x - cs/2, this.aimCursor.y - cs/2, cs, cs); }
        
        if (this.fx) {
            this.fx.renderWeather(viewX, viewY);
            
            // Lighting
            const lights = this.renderLights;
            lights.length = 0;
            
            lights.push({
                x: this.player.x + sw/2,
                y: this.player.y + sh/2,
                radius: 150 + Math.sin(Date.now() * 0.005) * 10,
                color: 'rgba(231, 76, 60, 0.4)',
                intensity: 0.6
            });
            this.fireballs.forEach(fb => {
                if(!fb.active) return;
                lights.push({
                    x: fb.x + (fb.width*fb.scale)/2,
                    y: fb.y + (fb.height*fb.scale)/2,
                    radius: 80,
                    color: fb.isEnemy ? 'rgba(142, 68, 173, 0.5)' : 'rgba(255, 0, 0, 0.5)',
                    intensity: 0.8
                });
            });
            if (this.mapSystem && this.mapSystem.decorations) { 
                this.mapSystem.decorations.forEach(d => {
                    const lx = d.x * 48 + 24;
                    const ly = d.y * 48 + 24;
                    // Culling lights
                    if (lx > viewX - 200 && lx < viewX + viewW + 200 && ly > viewY - 200 && ly < viewY + viewH + 200) {
                        if (d.type === 'torch') { lights.push({ x: lx, y: ly, radius: 120 + Math.random()*5, color: 'rgba(230, 126, 34, 0.3)', intensity: 0.5 }); }
                        if (d.type === 'candle') { lights.push({ x: lx, y: ly, radius: 60 + Math.random()*2, color: 'rgba(255, 0, 0, 0.2)', intensity: 0.4 }); }
                    }
                }); 
            } 
            this.fx.renderSoftLighting(viewX, viewY, lights);
        }
        this.weather.draw(this.ctx);
    }
    gameLoop(ts) { 
        if (!this.isRunning) return; 
        
        // Phase 26: Begin profiling
        if (this.profiler) this.profiler.beginFrame();

        let dt = (ts - this.lastTime) / 1000;
        this.lastTime = ts;
        
        // Phase 16: Time Scale
        if (this.timeScale !== undefined) {
            dt *= this.timeScale;
        }

        // Safety cap to prevent "Spiral of Death" on lag spikes (e.g. tab switching)
        if (dt > 0.25) dt = 0.25;

        if (dt > 0) {
            this.accumulator += dt;
            
            while (this.accumulator >= this.fixedTimeStep) {
                this.update(this.fixedTimeStep);
                this.accumulator -= this.fixedTimeStep;
            }
        } else if (this.ghostMode) {
            // Keep ghost camera moving
            const ghostDt = 1/60;
            const input = window.RedGlitchInput || this.input;
            const ghostSpeed = 500 * ghostDt;
            if (input.keys && (input.keys['KeyW'] || input.keys['ArrowUp'])) this.camera.y -= ghostSpeed;
            if (input.keys && (input.keys['KeyS'] || input.keys['ArrowDown'])) this.camera.y += ghostSpeed;
            if (input.keys && (input.keys['KeyA'] || input.keys['ArrowLeft'])) this.camera.x -= ghostSpeed;
            if (input.keys && (input.keys['KeyD'] || input.keys['ArrowRight'])) this.camera.x += ghostSpeed;
        }

        const alpha = (dt > 0) ? (this.accumulator / this.fixedTimeStep) : 1.0;
        this.draw(alpha);
        
        // Phase 26: End profiling
        if (this.profiler) {
            this.profiler.updateStats({
                entities: this.entities.length + this.npcs.length + this.enemies.length
            });
            this.profiler.endFrame();
        }

        requestAnimationFrame(this.gameLoop.bind(this)); 
    }

    stepFrame() {
        // Phase 16: Manual step
        this.update(this.fixedTimeStep);
        this.draw(1.0);
    }
}
