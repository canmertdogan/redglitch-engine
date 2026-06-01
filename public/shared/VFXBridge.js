/**
 * RedGlitch Engine - Unified VFX API
 * Bridges 2D (Canvas) and 3D (Three.js) particle systems.
 */
class VFXBridge {
    constructor() {
        this.activeSystem = null;
        this.systemType = 'none'; // '2d' | '3d'
    }

    /**
     * Unified system registration
     * @param {Object} system - The FX system instance (IsoFXSystem or VFXSystem3D)
     * @param {string} type - '2d' or '3d'
     */
    setSystem(system, type) {
        this.activeSystem = system;
        this.systemType = type;
        console.log(`[VFX] Unified bridge connected to: ${type}`);
    }

    /**
     * Unified effect spawn
     * @param {string} type - Preset name (hit, explosion, etc)
     * @param {number} x, y, z - World coordinates
     * @param {Object} options - Custom options (scale, color, etc)
     */
    spawnEffect(type, x, y, z = 0, options = {}) {
        if (!this.activeSystem) return;

        if (this.systemType === '2d') {
            if (this.activeSystem.play) {
                this.activeSystem.play(type, x, y, z);
            }
        } else if (this.systemType === '3d') {
            if (this.activeSystem.spawnEffect) {
                const origin = (typeof THREE !== 'undefined') ? new THREE.Vector3(x, y, z) : {x, y, z};
                this.activeSystem.spawnEffect(type, origin, options);
            }
        }
    }

    /**
     * Legacy/Simplified wrapper
     */
    spawnExplosion(x, y, z = 0, color = '#ff0') {
        this.spawnEffect('hit', x, y, z, { color });
    }

    /**
     * Unified text pop
     */
    popText(x, y, z = 0, text, color = '#fff') {
        if (!this.activeSystem) return;
        if (this.activeSystem.popText) {
            this.activeSystem.popText(x, y, z, text, color);
        }
    }
    
    /**
     * Unified screen shake
     */
    shake(intensity = 5, duration = 30) {
        if (!this.activeSystem) return;
        if (this.activeSystem.shake) {
            this.activeSystem.shake(intensity, duration);
        }
    }
}

// Make globally available
window.VFX = new VFXBridge();
