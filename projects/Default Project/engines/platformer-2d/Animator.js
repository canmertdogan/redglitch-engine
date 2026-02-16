/**
 * Animator.js
 * Standardized animation controller for all platformer entities.
 */

class Animator {
    constructor(entity) {
        this.entity = entity;
        this.animations = {};
        this.currentState = 'idle';
        this.currentFrame = 0;
        this.timer = 0;
        this.speed = 0.1;
        this.loop = true;
    }

    /**
     * Add an animation definition
     * @param {string} name - State name (idle, walk, etc.)
     * @param {number} frameCount - Total frames in this sequence
     * @param {number} speed - Seconds per frame
     * @param {boolean} loop - Whether to loop
     */
    add(name, frameCount, speed = 0.1, loop = true) {
        this.animations[name] = { frameCount, speed, loop };
    }

    play(name, force = false) {
        if (this.currentState === name && !force) return;
        
        const anim = this.animations[name];
        if (!anim) {
            console.warn(`[Animator] Animation not found: ${name}`);
            return;
        }

        this.currentState = name;
        this.currentFrame = 0;
        this.timer = 0;
        this.speed = anim.speed;
        this.loop = anim.loop;
    }

    update(dt) {
        const anim = this.animations[this.currentState];
        if (!anim || this.speed <= 0) {
            // Still sync to entity even if not advancing
            this.entity.animState = this.currentState;
            this.entity.animFrame = this.currentFrame;
            return;
        }

        this.timer += dt;
        if (this.timer >= this.speed) {
            this.timer = 0;
            this.currentFrame++;
            
            if (this.currentFrame >= anim.frameCount) {
                if (this.loop) {
                    this.currentFrame = 0;
                } else {
                    this.currentFrame = anim.frameCount - 1;
                }
            }
        }

        // Sync to entity for renderer
        this.entity.animState = this.currentState;
        this.entity.animFrame = this.currentFrame;
    }
}

window.Animator = Animator;
