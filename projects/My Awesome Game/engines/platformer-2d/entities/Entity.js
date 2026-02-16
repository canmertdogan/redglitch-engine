class Entity {
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
        
        // Animation State
        this.spriteName = null; 
        this.animState = 'idle';
        this.animFrame = 0;
        this.animTimer = 0;
        this.animSpeed = 0.1;
    }

    update(dt, map) {
        // Animation tick
        this.animTimer += dt;
        if (this.animTimer >= this.animSpeed) {
            this.animTimer = 0;
            this.animFrame++;
        }
    }

    setAnimation(state, speed = 0.1) {
        if (this.animState !== state) {
            this.animState = state;
            this.animFrame = 0;
            this.animTimer = 0;
            this.animSpeed = speed;
        }
    }

    draw(renderer) {
        renderer.drawEntitySprite(this);
    }
}

window.Entity = Entity;
