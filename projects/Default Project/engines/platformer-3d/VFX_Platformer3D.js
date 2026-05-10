/**
 * VFX_Platformer3D.js  — Phase 50
 * Voxel-aesthetic particle effects for the 3D platformer engine.
 * All particles use BoxGeometry (cubes) or OctahedronGeometry (diamonds).
 * No texture sheets. Flat-shaded MeshLambertMaterial throughout.
 */

import * as _THREE_MOD from '../../../lib/three/three.module.js';
const THREE = (typeof globalThis !== 'undefined' && globalThis.THREE) || _THREE_MOD;

// ─── Geometry cache (shared across all instances) ─────────────────────────────
const GEO_CUBE   = new THREE.BoxGeometry(1, 1, 1);
const GEO_DIAM   = new THREE.OctahedronGeometry(1, 0);

const _v3 = new THREE.Vector3();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mkMat(color) {
    return new THREE.MeshPhongMaterial({ color, shininess: 0, flatShading: true });
}

function rnd(min, max) { return min + Math.random() * (max - min); }

// ─── Particle / flash types ────────────────────────────────────────────────────
const TYPE_JUMP_DUST     = 'jumpDust';
const TYPE_LAND_DUST     = 'landDust';
const TYPE_DASH_TRAIL    = 'dashTrail';
const TYPE_COIN_BURST    = 'coinBurst';
const TYPE_WATER_SPLASH  = 'waterSplash';
const TYPE_ENV           = 'env';
const TYPE_GROUND_POUND  = 'groundPound';
const TYPE_WALL_JUMP     = 'wallJump';

// ─── Screen flash descriptors ─────────────────────────────────────────────────
const FLASH_DEATH       = { color: 0xff2222, alpha: 0.55, duration: 0.25, pulsate: false };
const FLASH_INVINC      = { color: 0xffffff, alpha: 0.18, duration: 0.10, pulsate: true  };
const FLASH_COMPLETE    = { color: 0xffd700, alpha: 0.45, duration: 0.45, pulsate: false };
const FLASH_CHECKPOINT  = { color: 0x00ff88, alpha: 0.30, duration: 0.20, pulsate: false };

// ─── Default palette fallbacks ────────────────────────────────────────────────
const PAL_YELLOW  = 0xf1c40f;
const PAL_BLUE    = 0x3498db;
const PAL_WHITE   = 0xffffff;
const PAL_BROWN   = 0x8B5E3C;
const PAL_GREEN   = 0x2ecc71;
const PAL_TEAL    = 0x1abc9c;

export default class VFX_Platformer3D {
    /**
     * @param {object} opts
     * @param {THREE.Scene}  opts.scene
     * @param {object}       [opts.palette]     — Ketebe palette (array of hex ints)
     * @param {HTMLElement}  [opts.hudContainer] — DIV to host screen flash overlay
     */
    constructor({ scene, palette = null, hudContainer = null }) {
        this._scene  = scene;
        this._pal    = palette;
        this._hud    = hudContainer;

        /** @type {Array<{mesh:THREE.Mesh, vel:THREE.Vector3, life:number, maxLife:number, spin:THREE.Vector3, type:string}>} */
        this._particles = [];

        /** @type {Array<{mesh:THREE.Mesh, life:number, maxLife:number, dir:THREE.Vector3}>} */
        this._dashTrail = [];

        /** Env zones: { pos, type, particles[] } */
        this._envZones = [];

        /** Screen flash overlay */
        this._flashEl  = null;
        this._flashTimer = 0;
        this._flashDesc  = null;
        this._flashPulsePhase = 0;

        this._buildFlashOverlay();
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /** Fire cube-puff when player leaves ground (takeoff) */
    jumpDust(pos) { this._spawnDust(pos, TYPE_JUMP_DUST, 8, 0.22); }

    /** Fire cube-puff on landing */
    landDust(pos) { this._spawnDust(pos, TYPE_LAND_DUST, 12, 0.28); }

    /** Called every frame during dash — leaves a flat diamond trail */
    dashTrailPoint(pos, paletteIndex = 1) {
        const color = this._palColor(paletteIndex, 0x00bfff);
        const mat   = mkMat(color);
        const mesh  = new THREE.Mesh(GEO_DIAM, mat);
        mesh.position.copy(pos);
        const scale = rnd(0.12, 0.22);
        mesh.scale.setScalar(scale);
        mesh.rotation.set(rnd(0, Math.PI), rnd(0, Math.PI), rnd(0, Math.PI));
        this._scene.add(mesh);
        this._dashTrail.push({ mesh, life: 0.22, maxLife: 0.22, dir: new THREE.Vector3() });
    }

    /** Spinning cube burst on coin collection */
    coinBurst(pos) {
        const color  = this._palColor(5, PAL_YELLOW);
        const count  = 10;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const speed = rnd(3.5, 6.0);
            const vel   = new THREE.Vector3(
                Math.cos(angle) * speed,
                rnd(2.0, 5.0),
                Math.sin(angle) * speed
            );
            this._spawnParticle(pos, vel, GEO_CUBE, color, 0.10, 0.80, TYPE_COIN_BURST);
        }
    }

    /** Diamond spray on entering water or water hazard */
    waterSplash(pos) {
        const color = this._palColor(3, PAL_BLUE);
        const count = 14;
        for (let i = 0; i < count; i++) {
            const vel = new THREE.Vector3(
                rnd(-4, 4),
                rnd(4, 9),
                rnd(-4, 4)
            );
            this._spawnParticle(pos, vel, GEO_DIAM, color, 0.08, 1.0, TYPE_WATER_SPLASH);
        }
    }

    /** Shockwave ring + shards on ground pound impact */
    groundPoundImpact(pos) {
        const color = this._palColor(2, 0xf39c12);
        // Central upward shards
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            const r     = rnd(3, 7);
            const vel   = new THREE.Vector3(
                Math.cos(angle) * r,
                rnd(1, 4),
                Math.sin(angle) * r
            );
            this._spawnParticle(pos, vel, GEO_CUBE, color, 0.15, 0.6, TYPE_GROUND_POUND);
        }
        // Small white burst
        for (let i = 0; i < 8; i++) {
            const vel = new THREE.Vector3(rnd(-6,6), rnd(3,8), rnd(-6,6));
            this._spawnParticle(pos, vel, GEO_CUBE, PAL_WHITE, 0.08, 0.4, TYPE_GROUND_POUND);
        }
    }

    /** Wall jump sparks */
    wallJumpSparks(pos, wallNormal) {
        const color = this._palColor(1, PAL_WHITE);
        for (let i = 0; i < 8; i++) {
            const vel = new THREE.Vector3(
                wallNormal.x * rnd(2, 5) + rnd(-2, 2),
                rnd(3, 7),
                wallNormal.z * rnd(2, 5) + rnd(-2, 2)
            );
            this._spawnParticle(pos, vel, GEO_DIAM, color, 0.06, 0.5, TYPE_WALL_JUMP);
        }
    }

    // ─── Environmental zones ─────────────────────────────────────────────────

    /**
     * Add a persistent ambient particle zone.
     * @param {THREE.Vector3} center
     * @param {number} radius — sphere radius for random spawning
     * @param {'magic'|'snow'|'leaves'} type
     */
    addEnvZone(center, radius, type) {
        const zone = { center: center.clone(), radius, type, particles: [], _emitTimer: 0 };
        this._envZones.push(zone);
        return zone;
    }

    removeEnvZone(zone) {
        const idx = this._envZones.indexOf(zone);
        if (idx !== -1) {
            // Dispose lingering particles
            zone.particles.forEach(p => {
                this._scene.remove(p.mesh);
                p.mesh.material.dispose();
            });
            zone.particles.length = 0;
            this._envZones.splice(idx, 1);
        }
    }

    // ─── Screen flashes ──────────────────────────────────────────────────────

    flashDeath()      { this._triggerFlash(FLASH_DEATH); }
    flashInvincible() { this._triggerFlash(FLASH_INVINC); }
    flashComplete()   { this._triggerFlash(FLASH_COMPLETE); }
    flashCheckpoint() { this._triggerFlash(FLASH_CHECKPOINT); }

    // ─── Update loop ─────────────────────────────────────────────────────────

    update(dt) {
        this._updateParticles(dt);
        this._updateDashTrail(dt);
        this._updateEnvZones(dt);
        this._updateFlash(dt);
    }

    destroy() {
        this._particles.forEach(p => { this._scene.remove(p.mesh); p.mesh.material.dispose(); });
        this._particles.length = 0;
        this._dashTrail.forEach(p => { this._scene.remove(p.mesh); p.mesh.material.dispose(); });
        this._dashTrail.length = 0;
        this._envZones.forEach(z => this.removeEnvZone(z));
        if (this._flashEl?.parentNode) this._flashEl.parentNode.removeChild(this._flashEl);
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    _buildFlashOverlay() {
        if (!this._hud) return;
        const el = document.createElement('div');
        el.style.cssText = [
            'position:absolute', 'inset:0', 'pointer-events:none',
            'background:transparent', 'z-index:900', 'opacity:0',
            'transition:opacity 0.05s',
        ].join(';');
        this._hud.appendChild(el);
        this._flashEl = el;
    }

    _triggerFlash(desc) {
        if (!this._flashEl) return;
        this._flashDesc  = desc;
        this._flashTimer = desc.duration;
        this._flashPulsePhase = 0;
        const hex = '#' + desc.color.toString(16).padStart(6, '0');
        this._flashEl.style.background = hex;
        this._flashEl.style.opacity    = String(desc.alpha);
    }

    _updateFlash(dt) {
        if (!this._flashEl || !this._flashDesc || this._flashTimer <= 0) return;
        this._flashTimer -= dt;
        if (this._flashTimer <= 0) {
            this._flashEl.style.opacity = '0';
            this._flashDesc = null;
            return;
        }
        if (this._flashDesc.pulsate) {
            this._flashPulsePhase += dt * 30;
            const a = this._flashDesc.alpha * (0.5 + 0.5 * Math.sin(this._flashPulsePhase));
            this._flashEl.style.opacity = String(a.toFixed(3));
        } else {
            // Fade out linearly
            const t = this._flashTimer / this._flashDesc.duration;
            this._flashEl.style.opacity = String((this._flashDesc.alpha * t).toFixed(3));
        }
    }

    _spawnDust(pos, type, count, size) {
        const color = this._palColor(7, PAL_BROWN);
        for (let i = 0; i < count; i++) {
            const vel = new THREE.Vector3(
                rnd(-3, 3),
                rnd(0.5, 3.0),
                rnd(-3, 3)
            );
            this._spawnParticle(pos, vel, GEO_CUBE, color, size * rnd(0.5, 1.2), 0.55, type);
        }
    }

    _spawnParticle(pos, vel, geo, color, size, life, type) {
        const mat  = mkMat(color);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        mesh.scale.setScalar(size);
        mesh.rotation.set(rnd(0, Math.PI), rnd(0, Math.PI), rnd(0, Math.PI));
        this._scene.add(mesh);
        this._particles.push({
            mesh,
            vel: vel.clone(),
            life,
            maxLife: life,
            spin: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)),
            type,
        });
    }

    _updateParticles(dt) {
        const GRAVITY = -18;
        for (let i = this._particles.length - 1; i >= 0; i--) {
            const p = this._particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this._scene.remove(p.mesh);
                p.mesh.material.dispose();
                this._particles.splice(i, 1);
                continue;
            }
            p.vel.y += GRAVITY * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.rotation.x += p.spin.x * dt;
            p.mesh.rotation.y += p.spin.y * dt;
            p.mesh.rotation.z += p.spin.z * dt;
            // Scale fade
            const t = p.life / p.maxLife;
            const base = p.mesh.scale.x;
            p.mesh.scale.setScalar(base * (0.95 + 0.05 * t)); // gentle shrink
            p.mesh.material.opacity = t; // optional — only visible if transparent
        }
    }

    _updateDashTrail(dt) {
        for (let i = this._dashTrail.length - 1; i >= 0; i--) {
            const p = this._dashTrail[i];
            p.life -= dt;
            if (p.life <= 0) {
                this._scene.remove(p.mesh);
                p.mesh.material.dispose();
                this._dashTrail.splice(i, 1);
                continue;
            }
            const t = p.life / p.maxLife;
            p.mesh.scale.setScalar(t * 0.2);
        }
    }

    _updateEnvZones(dt) {
        for (const zone of this._envZones) {
            zone._emitTimer -= dt;
            if (zone._emitTimer <= 0) {
                zone._emitTimer = this._envEmitRate(zone.type);
                this._emitEnvParticle(zone);
            }
            // Age existing particles
            for (let i = zone.particles.length - 1; i >= 0; i--) {
                const p = zone.particles[i];
                p.life -= dt;
                if (p.life <= 0) {
                    this._scene.remove(p.mesh);
                    p.mesh.material.dispose();
                    zone.particles.splice(i, 1);
                    continue;
                }
                p.mesh.position.addScaledVector(p.vel, dt);
                p.mesh.rotation.y += p.spinY * dt;
                const t = p.life / p.maxLife;
                p.mesh.scale.setScalar(p.baseScale * (0.6 + 0.4 * t));
            }
        }
    }

    _envEmitRate(type) {
        switch (type) {
            case 'magic':  return 0.04;
            case 'snow':   return 0.08;
            case 'leaves': return 0.12;
            default:       return 0.10;
        }
    }

    _emitEnvParticle(zone) {
        const r = zone.radius;
        const spawnPos = zone.center.clone().add(new THREE.Vector3(
            rnd(-r, r), rnd(-r * 0.5, r * 0.5), rnd(-r, r)
        ));
        let color, geo, life, vel;
        switch (zone.type) {
            case 'magic':
                color = this._palColor(1, PAL_TEAL);
                geo   = GEO_DIAM;
                life  = rnd(1.5, 3.0);
                vel   = new THREE.Vector3(rnd(-0.5,0.5), rnd(0.4,1.2), rnd(-0.5,0.5));
                break;
            case 'snow':
                color = PAL_WHITE;
                geo   = GEO_CUBE;
                life  = rnd(2.0, 4.0);
                vel   = new THREE.Vector3(rnd(-0.3,0.3), rnd(-0.8,-0.3), rnd(-0.3,0.3));
                break;
            case 'leaves':
            default:
                color = this._palColor(4, PAL_GREEN);
                geo   = GEO_CUBE;
                life  = rnd(1.5, 3.5);
                vel   = new THREE.Vector3(rnd(-1.0,1.0), rnd(-1.2,-0.3), rnd(-1.0,1.0));
                break;
        }
        const mat  = mkMat(color);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(spawnPos);
        const baseScale = rnd(0.06, 0.16);
        mesh.scale.setScalar(baseScale);
        mesh.rotation.set(rnd(0, Math.PI), rnd(0, Math.PI), rnd(0, Math.PI));
        this._scene.add(mesh);
        zone.particles.push({ mesh, vel, life, maxLife: life, spinY: rnd(-3, 3), baseScale });
    }

    _palColor(idx, fallback) {
        if (this._pal && Array.isArray(this._pal) && this._pal[idx] !== undefined) {
            return this._pal[idx];
        }
        return fallback;
    }
}
