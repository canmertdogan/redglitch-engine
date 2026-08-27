/**
 * BrainRuntime - Async Generator Execution System
 * Handles brain script execution as coroutines
 */

window.BrainRuntime = class BrainRuntime {
    constructor(npc, brainFunction) {
        this.npc = npc;
        this.brainFunction = brainFunction;
        this.generator = null;
        this.isRunning = false;
        this.currentPromise = null;
        this.error = null;
        
        this.start();
    }
    
    start() {
        try {
            // Initialize generator with NPC context
            this.generator = this.brainFunction(this.npc, this.npc.game, this.npc.game.uiSystem);
            this.isRunning = true;
            
            // Start execution
            this.step();
        } catch(e) {
            console.error('[BrainRuntime] Failed to start:', e);
            this.error = e;
            this.isRunning = false;
        }
    }
    
    step() {
        if (!this.isRunning || !this.generator) return;
        
        try {
            const result = this.generator.next();
            
            if (result.done) {
                // Brain completed, restart from beginning
                this.restart();
            } else if (result.value && typeof result.value.then === 'function') {
                // If yielded a promise, wait for it
                this.currentPromise = result.value;
                result.value.then(() => {
                    this.currentPromise = null;
                    this.step();
                }).catch(err => {
                    console.error('[BrainRuntime] Promise rejected:', err);
                    this.currentPromise = null;
                });
            }
        } catch(e) {
            console.error('[BrainRuntime] Execution error:', e);
            this.error = e;
            this.stop();
        }
    }
    
    update(deltaTime) {
        // Step if no pending promise
        if (!this.currentPromise && this.isRunning) {
            // Only step every few frames to avoid infinite loops
            if (!this.stepDelay) this.stepDelay = 0;
            this.stepDelay += deltaTime;
            
            if (this.stepDelay > 0.016) { // ~60fps stepping
                this.stepDelay = 0;
                // Don't auto-step, let yields control flow
            }
        }
    }
    
    stop() {
        this.isRunning = false;
        this.generator = null;
        this.currentPromise = null;
    }
    
    restart() {
        console.log('[BrainRuntime] Restarting brain');
        this.stop();
        this.start();
    }
    
    pause() {
        this.isRunning = false;
    }
    
    resume() {
        this.isRunning = true;
        if (!this.currentPromise) {
            this.step();
        }
    }
};
