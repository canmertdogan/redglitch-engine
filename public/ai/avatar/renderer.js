/**
 * avatar-renderer.js
 * Renders the "Alive" IRAB assistant
 */

class IrabAvatar {
    constructor() {
        this.state = 'IDLE';
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        
        this.initUI();
        this.loop();
    }

    initUI() {
        // Create floating container
        this.container = document.createElement('div');
        this.container.id = 'irab-avatar-container';
        this.container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 120px;
            height: 120px;
            z-index: 10000;
            cursor: pointer;
            pointer-events: auto;
            transition: transform 0.3s ease;
        `;

        this.canvas = document.createElement('canvas');
        this.canvas.width = 120;
        this.canvas.height = 120;
        this.canvas.style.imageRendering = 'pixelated';
        this.ctx = this.canvas.getContext('2d');
        
        // Thought Bubble Input
        this.bubble = document.createElement('div');
        this.bubble.style.cssText = `
            position: absolute;
            bottom: 130px;
            right: 0;
            width: 300px;
            background: #fff;
            border: 2px solid #000;
            border-radius: 15px;
            padding: 10px;
            display: none;
            box-shadow: 5px 5px 0 rgba(0,0,0,0.5);
            font-family: 'VT323', monospace;
        `;
        
        this.input = document.createElement('input');
        this.input.placeholder = "Tell IRAB what to do...";
        this.input.style.cssText = `
            width: 100%;
            border: none;
            outline: none;
            font-family: inherit;
            font-size: 18px;
        `;
        
        this.responseArea = document.createElement('div');
        this.responseArea.style.cssText = `
            margin-top: 5px;
            font-size: 16px;
            color: #333;
            max-height: 150px;
            overflow-y: auto;
            border-top: 1px solid #eee;
            padding-top: 5px;
            white-space: pre-wrap;
        `;

        this.input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const text = this.input.value.trim();
                if (text && window.irab) {
                    this.responseArea.innerText = "";
                    window.irab.prompt(text);
                    this.input.value = "";
                }
            }
        };

        this.bubble.appendChild(this.input);
        this.bubble.appendChild(this.responseArea);
        this.container.appendChild(this.bubble);
        this.container.appendChild(this.canvas);
        document.body.appendChild(this.container);

        // Toggle bubble on click
        this.canvas.onclick = (e) => {
            e.stopPropagation();
            this.bubble.style.display = this.bubble.style.display === 'none' ? 'block' : 'none';
            if (this.bubble.style.display === 'block') this.input.focus();
        };

        // Make draggable (modified to handle click vs drag)
        this.setupDragging();
    }

    setupDragging() {
        let isDragging = false;
        let startX, startY;
        let moved = false;

        this.container.addEventListener('mousedown', (e) => {
            isDragging = true;
            moved = false;
            startX = e.clientX - this.container.offsetLeft;
            startY = e.clientY - this.container.offsetTop;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            moved = true;
            this.container.style.left = (e.clientX - startX) + 'px';
            this.container.style.top = (e.clientY - startY) + 'px';
            this.container.style.bottom = 'auto';
            this.container.style.right = 'auto';
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    onToken(token) {
        this.responseArea.innerText += token;
        this.responseArea.scrollTop = this.responseArea.scrollHeight;
    }

    setState(newState) {
        this.state = newState;
        console.log(`[Avatar] State: ${newState}`);
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Procedural "Alive" logic
        const time = Date.now() * 0.002;
        const bob = Math.sin(time) * 5;
        const eyeSquint = Math.abs(Math.sin(time * 0.5)) > 0.98 ? 0 : 1;

        ctx.save();
        ctx.translate(60, 60 + bob);

        // Draw Body (Simple procedural shape for now)
        ctx.fillStyle = this.state === 'THINKING' ? '#f1c40f' : '#e74c3c';
        ctx.beginPath();
        ctx.arc(0, 0, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(-15, -10, 10, 10 * eyeSquint);
        ctx.fillRect(5, -10, 10, 10 * eyeSquint);
        
        // Pupil (follows mouse)
        // TODO: Mouse tracking

        // Mouth
        if (this.state === 'THINKING') {
            ctx.strokeStyle = '#000';
            ctx.beginPath();
            ctx.arc(0, 15, 10, 0, Math.PI, true);
            ctx.stroke();
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(-10, 15, 20, 4);
        }

        ctx.restore();
    }

    loop() {
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

// Hook into bridge
window.addEventListener('load', () => {
    window.avatar = new IrabAvatar();
    
    if (window.irab) {
        window.irab.onStateChange = (state) => window.avatar.setState(state);
        window.irab.onToken = (token) => window.avatar.onToken(token);
    }
});
