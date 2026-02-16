class PlatformerGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.physics = new PlatformerPhysics();
        
        this.player = { x: 50, y: 50, w: 24, h: 32, vx: 0, vy: 0, color: '#e74c3c', onGround: false };
        this.map = [];
        this.keys = {};

        window.addEventListener('keydown', e => this.keys[e.code] = true);
        window.addEventListener('keyup', e => this.keys[e.code] = false);
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    async init() {
        console.log("[PlatformerEngine] Initializing...");
        
        try {
            // Load Demo Level
            const res = await fetch('dunyalar/level1.json');
            if(res.ok) {
                this.map = await res.json();
            } else {
                console.warn("level1.json not found, using empty map.");
                this.map = { width: 50, height: 20, collision: new Array(50*20).fill(0) };
            }
        } catch(e) {
            console.error("Failed to load map:", e);
            this.map = { width: 50, height: 20, collision: new Array(50*20).fill(0) };
        }
        
        // Spawn Point
        if(this.map.spawn) {
            this.player.x = this.map.spawn.x * 32;
            this.player.y = this.map.spawn.y * 32;
        }

        this.running = true;
        this.loop();
        
        const loading = document.getElementById('loading-screen');
        if(loading) loading.classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');
    }

    update() {
        const moveSpeed = 1.5;
        if(this.keys['ArrowLeft'] || this.keys['KeyA']) this.player.vx -= moveSpeed;
        if(this.keys['ArrowRight'] || this.keys['KeyD']) this.player.vx += moveSpeed;
        if((this.keys['ArrowUp'] || this.keys['Space'] || this.keys['KeyW']) && this.player.onGround) {
            this.player.vy = this.physics.jumpForce;
            this.player.onGround = false;
        }

        this.physics.apply(this.player, this.map);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const tileSize = 32;
        
        // Draw Collision Map (Debug View)
        this.ctx.fillStyle = '#2ecc71';
        if (this.map && this.map.collision) {
            for(let i=0; i<this.map.collision.length; i++) {
                if(this.map.collision[i] === 1) {
                    const x = i % this.map.width;
                    const y = Math.floor(i / this.map.width);
                    this.ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
                }
            }
        }

        // Draw Player
        this.ctx.fillStyle = this.player.color;
        this.ctx.fillRect(this.player.x, this.player.y, this.player.w, this.player.h);
    }

    loop() {
        if(!this.running) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    login(username) {
        console.log(`[PlatformerEngine] User logged in: ${username}`);
        this.username = username;
        document.getElementById('login-screen').classList.add('hidden');
        this.init();
    }
}

window.attemptLogin = () => {
    const input = document.getElementById('username-input');
    if (input && input.value.trim()) {
        window.game.login(input.value.trim().toUpperCase());
    }
};

window.onload = () => {
    window.game = new PlatformerGame();
    if (document.getElementById('demo-title')) {
        window.game.init();
    } else if (window.AtmosphereSystem) {
        window.atmosphere = new window.AtmosphereSystem();
        window.atmosphere.start();
    }
};
