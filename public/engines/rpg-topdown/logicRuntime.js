// LogicRuntime.js - Comprehensive API for Logic Studio scripts
// 50+ methods covering all game systems

window.LogicRuntime = class LogicRuntime {
    constructor(game, owner) {
        this.game = game;
        this.owner = owner; // The entity running this script (e.g., NPC, Trigger)
        this.flags = this.game.logicFlags || (this.game.logicFlags = {}); // Global flags
    }

    // ============================================
    // ENTITY QUERIES
    // ============================================

    getNearbyEntities(range, type = null) {
        const entities = [...(this.game.enemies || []), ...(this.game.npcs || []), ...(this.game.entities || [])];
        const ox = this.owner.x || 0;
        const oy = this.owner.y || 0;
        
        return entities.filter(e => {
            if (type && e.type !== type) return false;
            const dx = e.x - ox;
            const dy = e.y - oy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return dist <= range;
        });
    }

    getEntityByName(name) {
        const entities = [...(this.game.enemies || []), ...(this.game.npcs || []), ...(this.game.entities || [])];
        return entities.find(e => e.name === name);
    }

    getEntityById(id) {
        const entities = [...(this.game.enemies || []), ...(this.game.npcs || []), ...(this.game.entities || [])];
        return entities.find(e => e.id === id);
    }

    getAllEnemies() {
        return this.game.enemies || [];
    }

    getAllNPCs() {
        return this.game.npcs || [];
    }

    getClosestEnemy() {
        const enemies = this.getAllEnemies();
        if (enemies.length === 0) return null;
        
        const ox = this.owner.x || 0;
        const oy = this.owner.y || 0;
        
        let closest = null;
        let minDist = Infinity;
        
        enemies.forEach(e => {
            const dx = e.x - ox;
            const dy = e.y - oy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                closest = e;
            }
        });
        
        return closest;
    }

    getEntitiesInRadius(x, y, radius) {
        const entities = [...(this.game.enemies || []), ...(this.game.npcs || []), ...(this.game.entities || [])];
        return entities.filter(e => {
            const dx = e.x - x;
            const dy = e.y - y;
            return Math.sqrt(dx * dx + dy * dy) <= radius;
        });
    }

    countEntitiesOfType(type) {
        const entities = [...(this.game.enemies || []), ...(this.game.npcs || []), ...(this.game.entities || [])];
        return entities.filter(e => e.type === type).length;
    }

    entityExists(id) {
        return this.getEntityById(id) !== undefined;
    }

    getEntityProperty(id, prop) {
        const entity = this.getEntityById(id);
        return entity ? entity[prop] : undefined;
    }

    // ============================================
    // PLAYER & INVENTORY
    // ============================================

    getPlayerPosition() {
        if (!this.game.player) return { x: 0, y: 0 };
        return { x: this.game.player.x, y: this.game.player.y };
    }

    getPlayerStat(stat) {
        if (!this.game.player) return 0;
        return this.game.player[stat] || 0;
    }

    setPlayerStat(stat, value) {
        if (!this.game.player) return;
        this.game.player[stat] = value;
        
        // Cap to max values
        if (stat === 'hp' && this.game.player.maxHp) {
            this.game.player.hp = Math.min(value, this.game.player.maxHp);
        }
        if (stat === 'mana' && this.game.player.maxMana) {
            this.game.player.mana = Math.min(value, this.game.player.maxMana);
        }
        if (stat === 'stamina' && this.game.player.maxStamina) {
            this.game.player.stamina = Math.min(value, this.game.player.maxStamina);
        }
    }

    hasItem(itemId) {
        if (!this.game.inventory) return false;
        return this.game.inventory.some(item => item.id === itemId);
    }

    getItemCount(itemId) {
        if (!this.game.inventory) return 0;
        const item = this.game.inventory.find(i => i.id === itemId);
        return item ? (item.count || 1) : 0;
    }

    addItem(itemId, count = 1) {
        if (!this.game.inventory) this.game.inventory = [];
        
        const existing = this.game.inventory.find(i => i.id === itemId);
        if (existing) {
            existing.count = (existing.count || 1) + count;
        } else {
            this.game.inventory.push({ id: itemId, count: count });
        }
        
        // Update HUD if method exists
        if (this.game.updateInventoryHUD) {
            this.game.updateInventoryHUD();
        }
        
        console.log(`[LogicRuntime] Added ${count}x ${itemId}`);
    }

    removeItem(itemId, count = 1) {
        if (!this.game.inventory) return false;
        
        const item = this.game.inventory.find(i => i.id === itemId);
        if (!item) return false;
        
        item.count = (item.count || 1) - count;
        
        if (item.count <= 0) {
            this.game.inventory = this.game.inventory.filter(i => i.id !== itemId);
        }
        
        // Update HUD
        if (this.game.updateInventoryHUD) {
            this.game.updateInventoryHUD();
        }
        
        console.log(`[LogicRuntime] Removed ${count}x ${itemId}`);
        return true;
    }

    getInventory() {
        return this.game.inventory || [];
    }

    equipItem(itemId, slot) {
        if (!this.game.activeSkills) this.game.activeSkills = [null, null, null, null];
        
        const slotIndex = parseInt(slot) || 0;
        if (slotIndex >= 0 && slotIndex < 4) {
            this.game.activeSkills[slotIndex] = itemId;
            console.log(`[LogicRuntime] Equipped ${itemId} to slot ${slotIndex}`);
        }
    }

    unequipItem(slot) {
        if (!this.game.activeSkills) return;
        const slotIndex = parseInt(slot) || 0;
        if (slotIndex >= 0 && slotIndex < 4) {
            this.game.activeSkills[slotIndex] = null;
        }
    }

    // ============================================
    // GAME STATE & FLAGS
    // ============================================

    getFlag(name) {
        return this.flags[name] || false;
    }

    setFlag(name, value) {
        this.flags[name] = value;
        console.log(`[LogicRuntime] Flag ${name} = ${value}`);
    }

    incrementFlag(name) {
        this.flags[name] = (this.flags[name] || 0) + 1;
        return this.flags[name];
    }

    checkAllFlags(flags) {
        // Check if all flags in array are true
        return flags.every(f => this.getFlag(f));
    }

    startQuest(questId) {
        if (!this.game.activeQuests) this.game.activeQuests = {};
        this.game.activeQuests[questId] = { id: questId, status: 'active', progress: 0 };
        console.log(`[LogicRuntime] Started quest: ${questId}`);
        
        // Trigger achievement system if exists
        if (this.game.achievementSystem) {
            this.game.achievementSystem.checkQuestStart(questId);
        }
    }

    completeQuest(questId) {
        if (!this.game.activeQuests) return;
        if (this.game.activeQuests[questId]) {
            this.game.activeQuests[questId].status = 'completed';
            console.log(`[LogicRuntime] Completed quest: ${questId}`);
            
            if (this.game.achievementSystem) {
                this.game.achievementSystem.checkQuestComplete(questId);
            }
        }
    }

    failQuest(questId) {
        if (!this.game.activeQuests) return;
        if (this.game.activeQuests[questId]) {
            this.game.activeQuests[questId].status = 'failed';
            console.log(`[LogicRuntime] Failed quest: ${questId}`);
        }
    }

    getQuestProgress(questId) {
        if (!this.game.activeQuests) return null;
        return this.game.activeQuests[questId] || null;
    }

    saveGameState(key, value) {
        if (!this.game.customData) this.game.customData = {};
        this.game.customData[key] = value;
    }

    loadGameState(key) {
        if (!this.game.customData) return undefined;
        return this.game.customData[key];
    }

    // ============================================
    // WORLD MANIPULATION
    // ============================================

    getTileAt(x, y) {
        if (!this.game.mapSystem) return null;
        return this.game.mapSystem.getTile(x, y);
    }

    setTileAt(x, y, tileId) {
        if (!this.game.mapSystem) return;
        this.game.mapSystem.setTile(x, y, tileId);
    }

    spawnEntity(type, x, y, data = {}) {
        // Generic entity spawner
        const entity = {
            id: `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: type,
            x: x,
            y: y,
            ...data
        };
        
        if (!this.game.entities) this.game.entities = [];
        this.game.entities.push(entity);
        
        console.log(`[LogicRuntime] Spawned ${type} at (${x}, ${y})`);
        return entity;
    }

    destroyEntity(id) {
        if (this.game.enemies) {
            this.game.enemies = this.game.enemies.filter(e => e.id !== id);
        }
        if (this.game.npcs) {
            this.game.npcs = this.game.npcs.filter(e => e.id !== id);
        }
        if (this.game.entities) {
            this.game.entities = this.game.entities.filter(e => e.id !== id);
        }
        
        console.log(`[LogicRuntime] Destroyed entity: ${id}`);
    }

    moveEntity(entity, x, y, speed = 100) {
        if (!entity) return;
        
        // Simple linear movement
        const dx = x - entity.x;
        const dy = y - entity.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 0) {
            entity.x += (dx / dist) * speed * (1/60); // Assume 60fps
            entity.y += (dy / dist) * speed * (1/60);
        }
    }

    // ============================================
    // CAMERA & EFFECTS
    // ============================================

    setCameraTarget(entity) {
        // Camera will follow this entity instead of player
        if (this.game.camera && entity) {
            this.game.cameraTarget = entity;
        }
    }

    shakeCamera(intensity = 10, duration = 0.5) {
        if (this.game.fx) {
            this.game.fx.shake(intensity, duration * 1000);
        } else {
            this.game.screenShake = intensity;
        }
    }

    flashScreen(color = '#ffffff', duration = 0.3) {
        if (this.game.fx) {
            this.game.fx.flash(color, duration * 1000);
        }
    }

    fadeScreen(toColor = '#000000', duration = 1.0) {
        if (this.game.fx) {
            this.game.fx.fade(toColor, duration * 1000);
        }
    }

    zoomCamera(scale = 1.0, duration = 1.0) {
        // Smooth zoom transition
        if (this.game.camera) {
            this.game.camera.targetZoom = scale;
            this.game.camera.zoomDuration = duration;
        }
    }

    // ============================================
    // AUDIO
    // ============================================

    playSound(name, volume = 1.0, loop = false) {
        if (this.game.audio) {
            this.game.audio.play(name, { volume, loop });
        }
    }

    stopSound(name) {
        if (this.game.audio) {
            this.game.audio.stop(name);
        }
    }

    fadeMusic(targetVolume = 0, duration = 2.0) {
        if (this.game.audio) {
            this.game.audio.fadeMusic(targetVolume, duration);
        }
    }

    // ============================================
    // DIALOGUE & UI
    // ============================================

    showDialogue(text, speaker = null, choices = null) {
        if (this.game.dialogueSystem) {
            if (choices) {
                // Show choice dialogue
                this.game.dialogueSystem.startWithChoices(text, speaker, choices);
            } else {
                // Simple text dialogue
                this.game.dialogueSystem.startCustom(text, speaker);
            }
        } else {
            console.log(`[DIALOGUE${speaker ? ' - ' + speaker : ''}] ${text}`);
        }
    }

    async waitForChoice() {
        // Wait for player to make a choice in dialogue
        if (!this.game.dialogueSystem) return null;
        
        return new Promise((resolve) => {
            this.game.dialogueSystem.onChoice = (choice) => {
                resolve(choice);
            };
        });
    }

    showNotification(text, duration = 3.0) {
        // Show temporary notification
        if (this.game.fx) {
            this.game.fx.showNotification(text, duration * 1000);
        } else {
            console.log(`[NOTIFICATION] ${text}`);
        }
    }

    // ============================================
    // TIME & WAITING
    // ============================================

    async wait(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    getGameTime() {
        return this.game.gameTime || 0;
    }

    // ============================================
    // COMBAT & PROJECTILES
    // ============================================

    shootProjectile(x, y, dirX, dirY, spriteName = 'fire_1') {
        if (this.game.spawnFireball) {
            const sprite = window.createPixelImage(spriteName);
            const fb = this.game.spawnFireball(x, y, dirX, dirY, sprite);
            if (fb) {
                fb.isEnemy = true;
                fb.speed = 200;
            }
            return fb;
        }
        return null;
    }

    spawnFX(name, x, y) {
        const tx = x !== undefined ? x : (this.owner.x || 0);
        const ty = y !== undefined ? y : (this.owner.y || 0);
        
        if (this.game.spawnCustomFX) {
            this.game.spawnCustomFX(name, tx, ty);
        } else if (this.game.fx) {
            this.game.fx.spawnEffect(name, tx, ty);
        }
    }

    // ============================================
    // PLAYER MOVEMENT (LEGACY SUPPORT)
    // ============================================

    playerMove(direction, speed) {
        const p = this.game.player;
        if (!p) return;
        
        const s = speed * (1/60);
        let dx = 0, dy = 0;
        
        if (direction === 'LEFT') dx = -1;
        if (direction === 'RIGHT') dx = 1;
        if (direction === 'UP') dy = -1;
        if (direction === 'DOWN') dy = 1;
        
        if (this.game.moveEntity) {
            this.game.moveEntity(p, dx, dy, speed, 1/60);
        } else {
            p.x += dx * s;
            p.y += dy * s;
        }
    }
}
