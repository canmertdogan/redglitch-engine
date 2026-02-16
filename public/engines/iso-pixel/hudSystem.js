// hudSystem.js - Isometric Game HUD (Matching 2D Engine Style)

window.IsoHUDSystem = class IsoHUDSystem {
    constructor(game) {
        this.game = game;
        this.ctx = game.renderer.ctx;
        this.canvas = game.canvas;
        
        // HUD state
        this.visible = true;
        this.fadeAlpha = 1.0;
        
        // Player stats (linked to game.player)
        this.stats = {
            hp: 100, maxHp: 100,
            mana: 50, maxMana: 50,
            stamina: 100, maxStamina: 100,
            xp: 0, level: 1
        };
        
        // Game clock (matches 2D engine)
        this.gameHour = 8;
        this.gameMinute = 0;
        
        // Skills (4 slots like 2D engine)
        this.skills = [null, null, null, null];
        this.skillCooldowns = [0, 0, 0, 0];
        
        // Inventory
        this.inventory = [];
        this.maxInventory = 24;  // Match 2D engine's 24 slots
        
        // Toast messages
        this.toasts = [];
        
        // Notifications
        this.notifications = [];
    }

    update(dt) {
        // Update cooldowns
        for (let i = 0; i < this.skillCooldowns.length; i++) {
            if (this.skillCooldowns[i] > 0) {
                this.skillCooldowns[i] -= dt;
                if (this.skillCooldowns[i] < 0) this.skillCooldowns[i] = 0;
            }
        }
        
        // Update toasts
        for (let i = this.toasts.length - 1; i >= 0; i--) {
            this.toasts[i].life -= dt;
            if (this.toasts[i].life <= 0) {
                this.toasts.splice(i, 1);
            }
        }
        
        // Update notifications
        for (let i = this.notifications.length - 1; i >= 0; i--) {
            this.notifications[i].life -= dt;
            if (this.notifications[i].life <= 0) {
                this.notifications.splice(i, 1);
            }
        }
    }

    render() {
        if (!this.visible) return;
        
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        ctx.save();
        ctx.globalAlpha = this.fadeAlpha;
        
        // === 2D ENGINE STYLE HUD ===
        // Top-left: HP, Stamina, Mana bars (like ui.json hud definition)
        this.renderStatBars(ctx, 20, 20);
        
        // Top-left below bars: Clock
        this.renderClock(ctx, 20, 120);
        
        // Bottom center: Skill bar (4 slots)
        this.renderSkillBar(ctx, w/2 - 120, h - 80);
        
        // Notifications (top center)
        this.renderNotifications(ctx, w/2, 80);
        
        // Toasts (center screen)
        this.renderToasts(ctx, w/2, h/2 - 100);
        
        ctx.restore();
    }

    renderStatBars(ctx, x, y) {
        const barWidth = 220;
        const barHeight = 24;
        const gap = 8;
        
        // HP Bar - "AL-HAYAT" (red #e74c3c)
        this.drawBar2D(ctx, x, y, barWidth, barHeight, 
            this.stats.hp, this.stats.maxHp, 
            '#e74c3c', 'AL-HAYAT');
        
        // Stamina Bar - "SAAF TA'ISH" (green #2ecc71)
        this.drawBar2D(ctx, x, y + barHeight + gap, barWidth, barHeight,
            this.stats.stamina, this.stats.maxStamina,
            '#2ecc71', "SAAF TA'ISH");
        
        // Mana Bar - "IRAB POWER" (blue #3498db)
        this.drawBar2D(ctx, x, y + (barHeight + gap) * 2, barWidth, barHeight,
            this.stats.mana, this.stats.maxMana,
            '#3498db', 'IRAB POWER');
    }

    drawBar2D(ctx, x, y, width, height, value, maxValue, fillColor, label) {
        const pct = Math.max(0, Math.min(1, value / maxValue));
        
        // Background (black with border - matches 2D ui.json)
        ctx.fillStyle = '#000';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        
        // Fill bar
        const fillWidth = (width - 4) * pct;
        if (fillWidth > 0) {
            ctx.fillStyle = fillColor;
            ctx.fillRect(x + 2, y + 2, fillWidth, height - 4);
        }
        
        // Label text (left side)
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px "VT323", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 8, y + height/2);
        
        // Value text (right side)
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.floor(value)}/${maxValue}`, x + width - 8, y + height/2);
    }

    renderClock(ctx, x, y) {
        const width = 100;
        const height = 30;
        
        // Background (matches 2D ui.json clock style)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        
        // Time text
        const hours = String(this.gameHour).padStart(2, '0');
        const mins = String(this.gameMinute).padStart(2, '0');
        
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 24px "VT323", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${hours}:${mins}`, x + width/2, y + height/2);
    }

    renderSkillBar(ctx, x, y) {
        const slotSize = 50;
        const gap = 10;
        const keys = ['1', '2', '3', '4'];
        
        // Background panel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        const totalWidth = (slotSize + gap) * 4 - gap + 20;
        ctx.fillRect(x - 10, y - 10, totalWidth, slotSize + 20);
        ctx.strokeRect(x - 10, y - 10, totalWidth, slotSize + 20);
        
        for (let i = 0; i < 4; i++) {
            const sx = x + i * (slotSize + gap);
            const skill = this.skills[i];
            const cooldown = this.skillCooldowns[i];
            
            // Slot background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.strokeStyle = skill ? '#f1c40f' : '#333';
            ctx.lineWidth = 2;
            ctx.fillRect(sx, y, slotSize, slotSize);
            ctx.strokeRect(sx, y, slotSize, slotSize);
            
            // Skill icon/color
            if (skill) {
                ctx.fillStyle = skill.color || '#3498db';
                ctx.fillRect(sx + 4, y + 4, slotSize - 8, slotSize - 8);
                
                // Skill symbol
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 20px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(skill.icon || '?', sx + slotSize/2, y + slotSize/2);
            }
            
            // Cooldown overlay
            if (cooldown > 0) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                const cooldownPct = cooldown / (skill?.cooldown || 1);
                const cooldownHeight = slotSize * cooldownPct;
                ctx.fillRect(sx, y + slotSize - cooldownHeight, slotSize, cooldownHeight);
                
                // Cooldown text
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px "VT323", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cooldown.toFixed(1), sx + slotSize/2, y + slotSize/2);
            }
            
            // Key hint
            ctx.fillStyle = '#888';
            ctx.font = 'bold 10px "VT323", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(keys[i], sx + 4, y + 4);
        }
    }

    renderNotifications(ctx, centerX, y) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        this.notifications.forEach((notif, i) => {
            const alpha = Math.min(1, notif.life * 2);
            const yOffset = i * 35;
            
            ctx.globalAlpha = alpha;
            
            // Background
            ctx.font = 'bold 16px "VT323", monospace';
            const textWidth = ctx.measureText(notif.text).width;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.strokeStyle = notif.borderColor || '#f1c40f';
            ctx.lineWidth = 2;
            ctx.fillRect(centerX - textWidth/2 - 15, y + yOffset - 15, textWidth + 30, 30);
            ctx.strokeRect(centerX - textWidth/2 - 15, y + yOffset - 15, textWidth + 30, 30);
            
            // Text
            ctx.fillStyle = notif.color || '#fff';
            ctx.fillText(notif.text, centerX, y + yOffset);
        });
        
        ctx.globalAlpha = 1;
    }

    renderToasts(ctx, centerX, y) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        this.toasts.forEach((toast, i) => {
            const alpha = Math.min(1, toast.life * 2);
            const yOffset = i * 30 + (1 - alpha) * -20;  // Float up as fading
            
            ctx.globalAlpha = alpha;
            
            // Text with shadow
            ctx.font = 'bold 18px "VT323", monospace';
            ctx.fillStyle = '#000';
            ctx.fillText(toast.text, centerX + 2, y + yOffset + 2);
            ctx.fillStyle = toast.color || '#fff';
            ctx.fillText(toast.text, centerX, y + yOffset);
        });
        
        ctx.globalAlpha = 1;
    }

    // --- API Methods (matching 2D engine UISystem) ---

    setStats(stats) {
        Object.assign(this.stats, stats);
    }
    
    setTime(hour, minute = 0) {
        this.gameHour = Math.floor(hour) % 24;
        this.gameMinute = Math.floor(minute) % 60;
    }

    setSkill(slot, skill) {
        if (slot >= 0 && slot < 4) {
            this.skills[slot] = skill;
        }
    }

    triggerCooldown(slot, duration) {
        if (slot >= 0 && slot < 4) {
            this.skillCooldowns[slot] = duration;
        }
    }

    showNotification(text, type = 'info') {
        const colors = {
            success: { color: '#2ecc71', border: '#27ae60' },
            error: { color: '#e74c3c', border: '#c0392b' },
            gold: { color: '#f1c40f', border: '#f39c12' },
            info: { color: '#fff', border: '#3498db' }
        };
        const style = colors[type] || colors.info;
        
        this.notifications.unshift({
            text,
            color: style.color,
            borderColor: style.border,
            life: 3.0
        });
        if (this.notifications.length > 5) this.notifications.pop();
    }

    toast(text, color = '#fff', duration = 2.0) {
        this.toasts.unshift({ text, color, life: duration });
        if (this.toasts.length > 5) this.toasts.pop();
    }

    show() { this.visible = true; }
    hide() { this.visible = false; }
    toggle() { this.visible = !this.visible; }
};
