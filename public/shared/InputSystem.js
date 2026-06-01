/**
 * RedGlitch Engine - Unified Input System
 * Handles Keyboard, Mouse, Touch, and Gamepad input across all engines.
 */
class InputSystem {
    constructor() {
        this.keys = {};
        this.mouse = { x: 0, y: 0, isDown: false, worldX: 0, worldY: 0 };
        this.gamepads = {};
        this.joystick = { x: 0, y: 0, active: false };
        
        // Standard Action Mapping
        this.actions = {
            moveX: 0,
            moveY: 0,
            jump: false,
            action: false,
            shift: false,
            inventory: false,
            skill1: false,
            skill2: false,
            skill3: false,
            skill4: false
        };

        this._setupListeners();
        this._startPolling();
        console.log('[InputSystem] Initialized with Gamepad support');
    }

    _setupListeners() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            this._handleGlobalShortcuts(e);
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Mouse
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        window.addEventListener('mousedown', (e) => { if(e.button === 0) this.mouse.isDown = true; });
        window.addEventListener('mouseup', (e) => { if(e.button === 0) this.mouse.isDown = false; });
        
        // Gamepad Events
        window.addEventListener("gamepadconnected", (e) => {
            console.log("[InputSystem] Gamepad connected:", e.gamepad.id);
            this.gamepads[e.gamepad.index] = e.gamepad;
        });
        window.addEventListener("gamepaddisconnected", (e) => {
            console.log("[InputSystem] Gamepad disconnected");
            delete this.gamepads[e.gamepad.index];
        });
    }

    _handleGlobalShortcuts(e) {
        // Example: F11 for Fullscreen
        if (e.code === 'F11') {
            e.preventDefault();
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else if (document.exitFullscreen) document.exitFullscreen();
        }
    }

    _startPolling() {
        const loop = () => {
            this._pollGamepads();
            this._updateActions();
            requestAnimationFrame(loop);
        };
        loop();
    }

    _pollGamepads() {
        const gps = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let i = 0; i < gps.length; i++) {
            if (gps[i]) this.gamepads[i] = gps[i];
        }
    }

    _updateActions() {
        // Reset actions
        this.actions.moveX = 0;
        this.actions.moveY = 0;
        
        // 1. Keyboard Input
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.actions.moveX -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) this.actions.moveX += 1;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) this.actions.moveY -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) this.actions.moveY += 1;

        this.actions.jump = !!(this.keys['Space'] || this.keys['ArrowUp']);
        this.actions.action = !!(this.keys['KeyE'] || this.keys['Enter'] || this.mouse.isDown);
        this.actions.shift = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
        this.actions.inventory = !!this.keys['KeyI'];
        
        this.actions.skill1 = !!this.keys['KeyZ'];
        this.actions.skill2 = !!this.keys['KeyX'];
        this.actions.skill3 = !!this.keys['KeyC'];
        this.actions.skill4 = !!this.keys['KeyV'];

        // 2. Virtual Joystick Input (Mobile)
        if (this.joystick.active) {
            this.actions.moveX = this.joystick.x;
            this.actions.moveY = this.joystick.y;
        }

        // 3. Gamepad Input
        for (const index in this.gamepads) {
            const gp = this.gamepads[index];
            if (!gp) continue;

            // Left Stick
            const axisX = gp.axes[0];
            const axisY = gp.axes[1];
            const deadzone = 0.15;

            if (Math.abs(axisX) > deadzone) this.actions.moveX += axisX;
            if (Math.abs(axisY) > deadzone) this.actions.moveY += axisY;

            // Buttons (Standard Mapping)
            if (gp.buttons[0].pressed) this.actions.jump = true;   // A / Cross
            if (gp.buttons[2].pressed) this.actions.action = true; // X / Square
            if (gp.buttons[3].pressed) this.actions.skill1 = true; // Y / Triangle
            if (gp.buttons[1].pressed) this.actions.skill2 = true; // B / Circle
            if (gp.buttons[9].pressed) this.actions.inventory = true; // Start / Menu
        }

        // Clamp Move Axes
        this.actions.moveX = Math.max(-1, Math.min(1, this.actions.moveX));
        this.actions.moveY = Math.max(-1, Math.min(1, this.actions.moveY));
    }

    /**
     * Compatibility helper for older engines expecting getAxis()
     */
    getAxis() {
        return { x: this.actions.moveX, y: this.actions.moveY };
    }
}

// Make globally available
window.RedGlitchInput = new InputSystem();
