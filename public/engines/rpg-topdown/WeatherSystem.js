window.WeatherSystem = class WeatherSystem {
    constructor() { this.particles = []; this.type = 'ash'; }
    update(deltaTime, width, height) {
        if (this.type === 'ash' && this.particles.length < 50) { this.particles.push({ x: Math.random() * width, y: -10, vx: (Math.random() - 0.5) * 50, vy: 20 + Math.random() * 30, size: 1 + Math.random() * 2 }); } 
        for (let i = this.particles.length - 1; i >= 0; i--) { const p = this.particles[i]; p.x += p.vx * deltaTime; p.y += p.vy * deltaTime; if (p.y > height || p.x < 0 || p.x > width) this.particles.splice(i, 1); }
    }
    draw(ctx) {
        if (this.type === 'ash') { ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; this.particles.forEach(p => ctx.fillRect(p.x, p.y, p.size, p.size)); }
        if (this.type === 'heat') { const offset = Math.sin(Date.now() * 0.005) * 5; ctx.fillStyle = 'rgba(231, 76, 60, 0.05)'; ctx.fillRect(offset, 0, ctx.canvas.width, ctx.canvas.height); }
    }
}
