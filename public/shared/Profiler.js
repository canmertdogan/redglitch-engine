/**
 * RedGlitch Engine - Performance Profiler
 * Lightweight real-time monitoring for all engines.
 */
class PerformanceProfiler {
    constructor() {
        this.enabled = false;
        this.stats = {
            fps: 0,
            frameTime: 0,
            drawCalls: 0,
            entities: 0,
            vslTime: 0,
            memory: 0
        };
        
        this.lastTime = performance.now();
        this.frames = 0;
        
        this.ui = null;
        this._setupUI();
        
        // Listen for debug toggle
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.on('debug:toggle_profiler', () => this.toggle());
        }
        
        // Check URL params
        if (window.location.search.includes('debug=1')) {
            this.toggle(true);
        }
    }

    _setupUI() {
        this.ui = document.createElement('div');
        this.ui.id = 'redglitch-profiler';
        this.ui.style.cssText = `
            position: fixed; top: 10px; right: 10px;
            background: rgba(0, 0, 0, 0.8); color: #00ff00;
            padding: 10px; font-family: 'Courier New', monospace;
            font-size: 12px; z-index: 10000; pointer-events: none;
            border: 1px solid #333; display: none;
            min-width: 150px;
        `;
        document.body.appendChild(this.ui);
    }

    toggle(force) {
        this.enabled = force !== undefined ? force : !this.enabled;
        this.ui.style.display = this.enabled ? 'block' : 'none';
        console.log(`[Profiler] ${this.enabled ? 'Enabled' : 'Disabled'}`);
    }

    beginFrame() {
        if (!this.enabled) return;
        this.frameStart = performance.now();
    }

    endFrame() {
        if (!this.enabled) return;
        const now = performance.now();
        this.frames++;
        
        if (now > this.lastTime + 1000) {
            this.stats.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
            this.lastTime = now;
            this.frames = 0;
            this._updateUI();
            this._broadcast();
        }
        
        this.stats.frameTime = (now - this.frameStart).toFixed(2);
    }

    updateStats(data = {}) {
        Object.assign(this.stats, data);
    }

    _updateUI() {
        if (!this.ui) return;
        let html = `<b>REDGLITCH PROFILER</b><br>`;
        html += `FPS: ${this.stats.fps}<br>`;
        html += `Frame: ${this.stats.frameTime}ms<br>`;
        if (this.stats.drawCalls) html += `Draws: ${this.stats.drawCalls}<br>`;
        if (this.stats.entities) html += `Ents: ${this.stats.entities}<br>`;
        if (this.stats.vslTime) html += `VSL: ${this.stats.vslTime}ms<br>`;
        
        if (window.performance && window.performance.memory) {
            const mem = Math.round(window.performance.memory.usedJSHeapSize / 1048576);
            html += `Mem: ${mem}MB`;
        }
        
        this.ui.innerHTML = html;
    }

    _broadcast() {
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.emit('engine:performance_metrics', this.stats);
        }
    }
}

// Make globally available
window.RedGlitchProfiler = new PerformanceProfiler();
