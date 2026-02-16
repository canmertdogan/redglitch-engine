// input.js - Stable Legacy Controls

class InputHandler {
    constructor() {
        this.keys = {
            MoveUp: false,
            MoveDown: false,
            MoveLeft: false,
            MoveRight: false,
            Action: false,
            Shift: false,
            z: false, x: false, c: false, v: false,
            Inventory: false
        };
        this.mouse = { x: 0, y: 0, isDown: false };
        this.joystick = { x: 0, y: 0, active: false }; // Virtual Joystick State
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform)); // iPad Pro support
        
        this.setupListeners();
        
        if (this.isMobile) {
            this.setupTouchListeners();
            this.toggleMobileControls(true);
        }
    }

    toggleMobileControls(enable) {
        const el = document.getElementById('mobile-controls');
        if (el) {
            if (enable) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    }

    setupTouchListeners() {
        // --- ACTION BUTTONS ---
        const btns = document.querySelectorAll('.touch-btn');
        btns.forEach(btn => {
            const key = btn.dataset.key;
            if (!key) return; // Skip if no key (e.g. joystick parts if any accidentally selected)
            
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleKey(key, true);
                btn.classList.add('active');
            }, { passive: false });
            
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.handleKey(key, false);
                btn.classList.remove('active');
            }, { passive: false });
        });

        // --- VIRTUAL JOYSTICK ---
        const zone = document.getElementById('joystick-zone');
        const stick = document.getElementById('virtual-joystick-stick');
        const base = document.getElementById('virtual-joystick-base');
        
        if (zone && stick && base) {
            const maxRadius = 35; // Max stick travel distance
            
            const handleJoystick = (touch) => {
                const rect = base.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                let dx = touch.clientX - centerX;
                let dy = touch.clientY - centerY;
                
                const distance = Math.sqrt(dx*dx + dy*dy);
                
                // Clamp
                if (distance > maxRadius) {
                    const ratio = maxRadius / distance;
                    dx *= ratio;
                    dy *= ratio;
                }
                
                // Update Stick Visual
                stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
                
                // Update Input State (Normalized -1 to 1)
                this.joystick.x = dx / maxRadius;
                this.joystick.y = dy / maxRadius;
                this.joystick.active = true;
            };

            zone.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handleJoystick(e.changedTouches[0]);
            }, { passive: false });

            zone.addEventListener('touchmove', (e) => {
                e.preventDefault();
                handleJoystick(e.changedTouches[0]);
            }, { passive: false });

            const endJoystick = (e) => {
                e.preventDefault();
                this.joystick.active = false;
                this.joystick.x = 0;
                this.joystick.y = 0;
                stick.style.transform = `translate(-50%, -50%)`; // Reset visual
                stick.style.transition = 'transform 0.1s'; // Snap back
                setTimeout(() => stick.style.transition = 'none', 100);
            };

            zone.addEventListener('touchend', endJoystick, { passive: false });
            zone.addEventListener('touchcancel', endJoystick, { passive: false });
        }
    }

    setupListeners() {
        window.addEventListener('keydown', (e) => this.handleKey(e.code, true));
        window.addEventListener('keyup', (e) => this.handleKey(e.code, false));
        
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        window.addEventListener('mousedown', (e) => { 
            if(e.button === 0) {
                // Ignore clicks on UI elements
                const tag = e.target.tagName;
                const ignoredTags = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'];
                if (ignoredTags.includes(tag) || e.target.closest('.retro-panel') || e.target.closest('.inv-slot')) return;
                
                this.mouse.isDown = true; 
            }
        });
        window.addEventListener('mouseup', (e) => { if(e.button === 0) this.mouse.isDown = false; });
    }

    handleKey(code, isDown) {
        // Map keys to logical actions
        switch(code) {
            case 'MOUSE':                   this.mouse.isDown = isDown; break;
            case 'KeyW': case 'ArrowUp':    this.keys.MoveUp = isDown; break;
            case 'KeyS': case 'ArrowDown':  this.keys.MoveDown = isDown; break;
            case 'KeyA': case 'ArrowLeft':  this.keys.MoveLeft = isDown; break;
            case 'KeyD': case 'ArrowRight': this.keys.MoveRight = isDown; break;
            case 'Space':                   this.keys.Action = isDown; break;
            case 'ShiftLeft':               this.keys.Shift = isDown; break;
            case 'KeyZ':                    this.keys.z = isDown; break;
            case 'KeyX':                    this.keys.x = isDown; break;
            case 'KeyC':                    this.keys.c = isDown; break;
            case 'KeyV':                    this.keys.v = isDown; break;
            case 'KeyE':                    this.keys.Inventory = isDown; break;
        }
    }

    getAxis() {
        if (this.joystick.active) {
            return { x: this.joystick.x, y: this.joystick.y };
        }
        
        let x = 0;
        let y = 0;
        if (this.keys.MoveLeft) x -= 1;
        if (this.keys.MoveRight) x += 1;
        if (this.keys.MoveUp) y -= 1;
        if (this.keys.MoveDown) y += 1;
        return { x, y };
    }
}

window.InputHandler = InputHandler;