/**
 * IsoCombatSystem - Combat system for iso-pixel engine
 * Projectiles fly toward cursor, rendered in isometric projection
 */
class IsoCombatSystem {
    constructor(game) {
        this.game = game;
        this.projectiles = [];
        this.maxProjectiles = 100;
        
        // Pre-allocate projectile pool
        for (let i = 0; i < this.maxProjectiles; i++) {
            this.projectiles.push({
                active: false,
                x: 0, y: 0, z: 0,
                vx: 0, vy: 0,
                color: '#fff',
                damage: 0,
                lifetime: 0,
                maxLifetime: 0,
                isEnemy: false,
                trail: [],
                sprite: null
            });
        }
        
        this.projectileIndex = 0;
        
        // Create Arabic letter sprites (same as topdown engine)
        this.irabSprites = ['أ','ب','ت','ج','د','ر','س','ص','ط','ع','ف','ق','ك','ل','م','ن','هـ','و','ي']
            .map(text => this._createTextSprite(text));
        
        console.log('[IsoCombatSystem] Initialized with', this.maxProjectiles, 'projectile pool');
    }

    _createTextSprite(text) {
        const canvas = document.createElement('canvas');
        const fontSize = 14;
        const h = 20;
        const w = Math.max(20, text.length * 12 + 4);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const cx = w / 2, cy = h / 2;
        ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Red outline
        ctx.fillStyle = '#e74c3c';
        for (let ox = -1; ox <= 1; ox++)
            for (let oy = -1; oy <= 1; oy++)
                ctx.fillText(text, cx + ox, cy + oy);
        // Orange mid layer
        ctx.fillStyle = '#f39c12';
        ctx.fillText(text, cx, cy - 1);
        ctx.fillText(text, cx, cy + 1);
        ctx.fillText(text, cx - 1, cy);
        ctx.fillText(text, cx + 1, cy);
        // White center
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, cx, cy);
        return canvas;
    }

    /**
     * Get world direction from player toward mouse cursor
     */
    getDirectionToMouse() {
        const mouse = this.game.mouse;
        if (!mouse) return { x: 1, y: 0 };
        
        const canvas = this.game.canvas;
        const cam = this.game.renderer.camera;
        const strategy = this.game.strategy;
        const config = this.game.config;
        const dims = strategy.getTileDims(config);
        const halfW = dims.w / 2;
        const halfH = dims.h / 2;
        
        // Screen offset (same as strategy render translate)
        const offsetX = canvas.width / 2 + cam.x;
        const offsetY = canvas.height / 4 + cam.y;
        
        // Mouse position relative to iso origin
        const sx = mouse.x - offsetX;
        const sy = mouse.y - offsetY;
        
        // Player screen position
        const p = this.game.player;
        const px = (p.renderX - p.renderY) * halfW;
        const py = (p.renderX + p.renderY) * halfH - (p.renderZ * dims.h);
        
        // Direction in screen space
        const dsx = sx - px;
        const dsy = sy - py;
        
        // Convert screen direction to world direction (inverse isometric)
        const worldDX = dsx / halfW + dsy / halfH;
        const worldDY = dsy / halfH - dsx / halfW;
        
        // Normalize
        const len = Math.sqrt(worldDX * worldDX + worldDY * worldDY);
        if (len < 0.001) return { x: 1, y: 0 };
        return { x: worldDX / len, y: worldDY / len };
    }

    /**
     * Spawn a projectile
     */
    spawnProjectile(x, y, z, dirX, dirY, abilityDef, isEnemy = false) {
        const proj = this.projectiles[this.projectileIndex];
        this.projectileIndex = (this.projectileIndex + 1) % this.maxProjectiles;
        
        proj.active = true;
        proj.x = x;
        proj.y = y;
        proj.z = z + 0.15;
        
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len > 0) { dirX /= len; dirY /= len; }
        
        // ~8 tiles/sec for iso world
        const speed = 8;
        proj.vx = dirX * speed;
        proj.vy = dirY * speed;
        proj.damage = abilityDef.damage || 10;
        proj.color = abilityDef.color || '#ff6b6b';
        proj.lifetime = 0;
        proj.maxLifetime = abilityDef.lifetime || 3.0;
        proj.isEnemy = isEnemy;
        proj.trail = [];
        proj.sprite = this.irabSprites[Math.floor(Math.random() * this.irabSprites.length)];
        
        return proj;
    }

    /**
     * Update all active projectiles
     */
    update(dt) {
        for (let proj of this.projectiles) {
            if (!proj.active) continue;
            
            // Store trail position
            proj.trail.push({ x: proj.x, y: proj.y, z: proj.z });
            if (proj.trail.length > 8) proj.trail.shift();
            
            // Move
            proj.x += proj.vx * dt;
            proj.y += proj.vy * dt;
            proj.lifetime += dt;
            
            // Lifetime check
            if (proj.lifetime >= proj.maxLifetime) {
                proj.active = false;
                continue;
            }
            
            // Bounds check
            const map = this.game.levelMetadata;
            if (map && (proj.x < 0 || proj.x >= map.width || proj.y < 0 || proj.y >= map.height)) {
                proj.active = false;
                continue;
            }
            
            // Wall collision
            const floorZ = this.game.getZAt(Math.floor(proj.x), Math.floor(proj.y));
            if (floorZ > proj.z + 1) {
                proj.active = false;
                continue;
            }
            
            // Enemy projectile hits player
            if (proj.isEnemy && this.game.player) {
                const dx = proj.x - this.game.player.x;
                const dy = proj.y - this.game.player.y;
                if (Math.sqrt(dx * dx + dy * dy) < 0.5) {
                    this.game.player.hp = Math.max(0, this.game.player.hp - proj.damage);
                    proj.active = false;
                }
            } else if (!proj.isEnemy && this.game.entities) {
                // Player projectile hits enemies
                for (const ent of this.game.entities) {
                    if (ent.type === 'enemy' && ent.hp > 0) {
                        const dx = proj.x - ent.x;
                        const dy = proj.y - ent.y;
                        if (Math.sqrt(dx * dx + dy * dy) < 0.5) {
                            ent.hp = Math.max(0, ent.hp - proj.damage);
                            console.log(`[IsoCombat] Hit enemy! HP: ${ent.hp}`);
                            proj.active = false;
                            
                            // Visual feedback
                            if (this.game.spawnParticle) {
                                this.game.spawnParticle(ent.x, ent.y, 0, 0, '#ff0000', 0.5, 4);
                            }
                            
                            break; // One hit per projectile
                        }
                    }
                }
            }
        }
    }

    /**
     * Render projectiles in isometric coordinates
     * Called AFTER ctx.translate to iso origin (same as strategy)
     */
    render(ctx, dims) {
        const halfW = dims.w / 2;
        const halfH = dims.h / 2;
        
        for (let proj of this.projectiles) {
            if (!proj.active) continue;
            
            const sx = (proj.x - proj.y) * halfW;
            const sy = (proj.x + proj.y) * halfH - (proj.z * dims.h);
            
            // Draw trail (fading Arabic letters)
            for (let i = 0; i < proj.trail.length; i++) {
                const t = proj.trail[i];
                const tx = (t.x - t.y) * halfW;
                const ty = (t.x + t.y) * halfH - (t.z * dims.h);
                const alpha = (i / proj.trail.length) * 0.4;
                ctx.globalAlpha = alpha;
                if (proj.sprite) {
                    const s = 1.0 + (i / proj.trail.length) * 0.5;
                    ctx.drawImage(proj.sprite, tx - proj.sprite.width * s / 2, ty - proj.sprite.height * s / 2, proj.sprite.width * s, proj.sprite.height * s);
                }
            }
            
            // Fire glow behind the letter
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = proj.color;
            ctx.shadowColor = proj.color;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(sx, sy, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Draw the Arabic letter sprite (burning letter)
            ctx.globalAlpha = 1.0;
            if (proj.sprite) {
                const scale = 2.0;
                const sw = proj.sprite.width * scale;
                const sh = proj.sprite.height * scale;
                ctx.drawImage(proj.sprite, sx - sw / 2, sy - sh / 2, sw, sh);
            }
            
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
        }
    }

    /**
     * Use ability - direction is computed from mouse cursor
     */
    useAbility(abilityId, dirX, dirY) {
        if (!window.AbilityDefinitions) return false;
        
        const abilityDef = window.AbilityDefinitions.getAbility(abilityId);
        if (!abilityDef) return false;
        
        // Check mana (field is 'mana' in AbilityDefinitions)
        const manaCost = abilityDef.mana || abilityDef.manaCost || 0;
        if (this.game.player.mana < manaCost) {
            console.warn('[IsoCombatSystem] Not enough mana');
            return false;
        }
        
        switch (abilityDef.type) {
            case 'projectile':
                // Use mouse direction instead of passed direction
                const dir = this.getDirectionToMouse();
                this.spawnProjectile(
                    this.game.player.x, this.game.player.y, 
                    this.game.player.z || 0,
                    dir.x, dir.y, abilityDef, false
                );
                break;
            case 'heal':
                const heal = abilityDef.damage || 20;
                this.game.player.hp = Math.min(this.game.player.maxHp, this.game.player.hp + heal);
                console.log('[IsoCombatSystem] Healed for', heal, 'HP');
                break;
            case 'buff':
                console.log('[IsoCombatSystem] Buff:', abilityDef.name);
                break;
            case 'utility':
                console.log('[IsoCombatSystem] Utility:', abilityDef.name);
                break;
            default:
                return false;
        }
        
        // Consume mana
        this.game.player.mana = Math.max(0, this.game.player.mana - manaCost);
        
        // Force HUD update
        if (this.game.syncHUDStats) {
            this.game.syncHUDStats();
        }
        
        console.log('[IsoCombatSystem] Used ability:', abilityId);
        return true;
    }

    getActiveCount() {
        return this.projectiles.filter(p => p.active).length;
    }

    clear() {
        for (let proj of this.projectiles) {
            proj.active = false;
        }
    }
}

window.IsoCombatSystem = IsoCombatSystem;
