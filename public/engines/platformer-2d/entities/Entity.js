class PlatformerEntity {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.vx = 0;
        this.vy = 0;
        this.color = '#f0f';
        this.onGround = false;
        this.isDead = false;
        this.facingRight = true;
        
        // Animation 
        this.spriteName = null; 
        this.animator = new Animator(this);
        this.animator.add('idle', 1, 0.2);

        // Visual Effects
        this.light = null; // { radius, color, intensity }
    }

    update(dt, map) {
        this.animator.update(dt);
    }

    setAnimation(state, speed = 0.1) {
        // If state doesn't exist, we might need to add a dummy one or handle it
        if (!this.animator.animations[state]) {
            this.animator.add(state, 1, speed);
        }
        this.animator.play(state);
    }

    draw(renderer) {
        renderer.drawEntitySprite(this);
    }
}

window.PlatformerEntity = PlatformerEntity;
