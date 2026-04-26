/**
 * Trigger.js
 * An entity that detects player overlap and triggers a target entity.
 * Can be a switch, a pressure plate, or an invisible zone.
 */

class PlatformerTrigger extends PlatformerEntity {
    constructor(x, y, config = {}) {
        super(x * 32, y * 32, config.w || 32, config.h || 32);
        this.targetId = config.targetId || null;
        this.action = config.action || 'toggle';
        this.triggerType = config.triggerType || 'switch'; // 'switch', 'pressure_plate', 'zone'
        this.isToggle = config.isToggle !== false;
        this.questIdProgress = config.questIdProgress || null;
        
        this.isActive = false;
        this.cooldown = 0;
        this.cooldownMax = 0.5;

        this.color = '#f1c40f';
        this.spriteName = config.triggerType === 'switch' ? 'switch_off' : 'trigger_zone';
    }

    update(dt, map) {
        super.update(dt, map);
        if (this.cooldown > 0) this.cooldown -= dt;
    }

    onOverlap(player) {
        if (this.cooldown > 0) return;

        if (this.triggerType === 'switch') {
            // Switches need an action key? Or just overlap?
            // For now, let's use overlap but with a cooldown.
            this.toggle();
        } else if (this.triggerType === 'zone') {
            if (!this.isActive) {
                this.activate();
            }
        } else if (this.triggerType === 'pressure_plate') {
            if (!this.isActive) {
                this.activate();
            }
        }
    }

    toggle() {
        this.isActive = !this.isActive;
        this.cooldown = this.cooldownMax;
        this.spriteName = this.isActive ? 'switch_on' : 'switch_off';
        
        this._dispatch();
        
        if (window.game?.fx) {
            window.game.fx.spawnParticles(this.x + this.w/2, this.y + this.h/2, 'spark', 3);
        }
    }

    activate() {
        this.isActive = true;
        this.cooldown = this.cooldownMax;
        this._dispatch();
    }

    _dispatch() {
        if (this.targetId && window.game) {
            window.game.triggerEntity(this.targetId, this.action);
        }
        
        if (this.questIdProgress && window.game?.questSystem) {
            window.game.questSystem.onEvent('trigger', this.questIdProgress, 1);
        }
    }

    draw(renderer) {
        if (this.triggerType === 'zone') {
            // Don't draw zone in-game, only in editor (handled by EditorCore)
            if (window.DEBUG_MODE) {
                const ctx = renderer.ctx;
                ctx.strokeStyle = 'rgba(241, 196, 15, 0.5)';
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(this.x, this.y, this.w, this.h);
                ctx.setLineDash([]);
            }
            return;
        }
        
        // Try drawing sprite
        if (window.SPRITES && window.SPRITES[this.spriteName]) {
            super.draw(renderer);
        } else {
            // Fallback rect
            const ctx = renderer.ctx;
            ctx.fillStyle = this.isActive ? '#2ecc71' : '#e74c3c';
            ctx.fillRect(this.x + 4, this.y + 4, this.w - 8, this.h - 8);
        }
    }
}

window.PlatformerTrigger = PlatformerTrigger;
