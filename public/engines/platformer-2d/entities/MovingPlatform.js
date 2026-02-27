class PlatformerMovingPlatform extends PlatformerEntity {
    constructor(x, y, w = 64, h = 16) {
        super(x, y, w, h);
        this.color = '#3498db';
        
        this.waypoints = [];
        this.currentWaypointIndex = 0;
        this.speed = 2;
        this.isMoving = true;
        
        // Internal state
        this.lastX = this.x;
        this.lastY = this.y;
    }

    addWaypoint(x, y) {
        this.waypoints.push({ x: x, y: y });
    }

    update(dt, map) {
        // Record previous position so consumers can compute deltas reliably
        this.lastX = this.x;
        this.lastY = this.y;

        if (!this.isMoving || this.waypoints.length === 0) {
            this.vx = 0;
            this.vy = 0;
            // Ensure last position reflects current to avoid duplicated deltas
            this.lastX = this.x;
            this.lastY = this.y;
            return;
        }

        const target = this.waypoints[this.currentWaypointIndex];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.speed) {
            this.x = target.x;
            this.y = target.y;
            this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
        } else {
            this.vx = (dx / dist) * this.speed;
            this.vy = (dy / dist) * this.speed;
            this.x += this.vx;
            this.y += this.vy;
        }
    }

    trigger(action, data) {
        if (action === 'toggle') this.isMoving = !this.isMoving;
        else if (action === 'start') this.isMoving = true;
        else if (action === 'stop') this.isMoving = false;
    }

    getVelocity() {
        return {
            x: this.x - this.lastX,
            y: this.y - this.lastY
        };
    }

    draw(renderer) {
        const ctx = renderer.ctx;
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.floor(this.x), Math.floor(this.y), this.w, this.h);
        
        // Draw some details
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.floor(this.x), Math.floor(this.y), this.w, this.h);
    }
}

window.PlatformerMovingPlatform = PlatformerMovingPlatform;
