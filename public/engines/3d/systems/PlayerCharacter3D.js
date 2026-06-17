/**
 * PlayerCharacter3D.js — Phase 46
 *
 * Low-poly player character for the platformer-3d engine.
 *
 * Features:
 *   - GLTF model load with flat-shaded MeshLambertMaterial fallback capsule
 *   - Animation state machine: idle → walk → run → jump → fall → land → hurt → die
 *   - IK foot placement: two ground raycasts snap feet to surface normals on blocky terrain
 *   - Cosmetic accessory slots: hat, cape, sword (GLTF pieces attached to named bones)
 *   - Health + invincibility flash: alternates between palette color and white
 *   - Death: fires onDeath callback; caller (engine) triggers VFX cube-burst
 *
 * Dependencies:
 *   - THREE.AnimationMixer for clip-based animation
 *   - AssetLoader3D for GLTF + palette assignment
 *   - CharacterController3D provides movement state (MoveState) + position
 *   - PaletteManager for toon material colors
 *
 * Usage:
 *   const pc = new PlayerCharacter3D({ scene, assets, palette, charController });
 *   await pc.init(opts);           // load model; add to scene
 *   pc.update(dt);                 // animation tick + IK + flash
 *   pc.takeDamage(amount);         // reduce health; trigger hurt anim + flash
 *   pc.die();                      // trigger die animation + onDeath callback
 *   pc.equipAccessory('hat', url); // async equip GLTF accessory
 *   pc.removeAccessory('hat');
 *   pc.setInvincible(frames);      // grant iframes (dash, checkpoint respawn)
 *   pc.destroy();
 */

import * as THREE from '/lib/three/three.module.js';
import { MoveState } from './CharacterController3D.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Low-poly fallback capsule segments. */
const CAP_RADIAL_SEGS  = 6;
const CAP_HEIGHT_SEGS  = 1;

/** Fallback capsule dimensions (metres). */
const FALLBACK_RADIUS  = 0.35;
const FALLBACK_HEIGHT  = 1.4;

/** IK ray length below foot bone (metres). */
const IK_RAY_LEN       = 0.6;
/** Max foot correction offset (metres). */
const IK_MAX_OFFSET    = 0.3;
/** IK blend speed (per-second lerp). */
const IK_BLEND         = 14;

/** Animation cross-fade duration (seconds). */
const ANIM_FADE        = 0.12;

/** Invincibility flash: alternate every N frames. */
const FLASH_PERIOD     = 6;

/** Health at full for a fresh life. */
const HEALTH_MAX       = 3;

// ── AnimState enum ────────────────────────────────────────────────────────────

export const AnimState = Object.freeze({
    IDLE:   'idle',
    WALK:   'walk',
    RUN:    'run',
    JUMP:   'jump',
    FALL:   'fall',
    LAND:   'land',
    HURT:   'hurt',
    DIE:    'die',
});

// ── Accessory slot names → bone name mapping ───────────────────────────────────

const ACCESSORY_BONE = {
    hat:   'head',
    cape:  'spine',
    sword: 'hand_R',
};

// ── PlayerCharacter3D ─────────────────────────────────────────────────────────

export default class PlayerCharacter3D {

    /**
     * @param {object}                   systems
     * @param {THREE.Scene}              systems.scene          Scene to add mesh
     * @param {AssetLoader3D}            systems.assets         Asset loader
     * @param {PaletteManager}           systems.palette        Color palette
     * @param {CharacterController3D}    systems.charController Movement controller
     * @param {AudioSpatial3D}           [systems.audio]        Spatial audio
     */
    constructor({ scene, assets, palette, charController, audio = null }) {
        this._scene    = scene;
        this._assets   = assets;
        this._palette  = palette;
        this._cc       = charController;
        this._audio    = audio;

        // Mesh & animation
        this._root     = null;    // THREE.Group — parent for model + accessories
        this._mixer    = null;    // THREE.AnimationMixer
        this._clips    = {};      // { [AnimState]: THREE.AnimationClip }
        this._actions  = {};      // { [AnimState]: THREE.AnimationAction }
        this._curAnim  = null;    // current AnimState string
        this._isGLTF   = false;   // true if loaded from GLTF, false = fallback

        // Bones (populated if GLTF has skeleton)
        this._bones    = {};      // { boneName: THREE.Bone }

        // Accessories
        this._accessories = {};   // { slot: THREE.Object3D }

        // Health & invincibility
        this._health       = HEALTH_MAX;
        this._invincFrames = 0;
        this._flashFrame   = 0;
        this._isDead       = false;

        // IK state
        this._footL        = null;   // THREE.Bone or null
        this._footR        = null;
        this._footLOffset  = 0;      // current Y correction
        this._footROffset  = 0;
        this._ikRayL       = new THREE.Raycaster();
        this._ikRayR       = new THREE.Raycaster();
        this._collisionMeshes = [];  // world geometry for IK raycasts

        // Callbacks
        this.onDeath       = null;   // () => void
        this.onHurt        = null;   // (health: number) => void
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {object}  [opts]
     * @param {string}  [opts.modelUrl]       GLTF URL for character model
     * @param {number}  [opts.paletteBodyIdx=0] Palette index for body color
     * @param {number}  [opts.paletteAccIdx=1]  Palette index for accent color
     * @param {boolean} [opts.ikEnabled=true]   Enable IK foot placement
     */
    async init(opts = {}) {
        this._ikEnabled = opts.ikEnabled ?? true;

        // ── Load model ──────────────────────────────────────────────────────
        if (opts.modelUrl && this._assets) {
            try {
                const gltf = await this._assets.loadGLTF(opts.modelUrl);
                this._root = new THREE.Group();
                this._root.add(gltf.scene);

                // Apply flat-shaded Lambert material to all meshes
                const bodyColor  = this._palette?.getHex?.(opts.paletteBodyIdx ?? 0) ?? '#4a9eff';
                const accentColor= this._palette?.getHex?.(opts.paletteAccIdx  ?? 1) ?? '#ffffff';
                this._applyMaterial(gltf.scene, bodyColor, accentColor);

                // Animation mixer
                if (gltf.animations?.length) {
                    this._mixer = new THREE.AnimationMixer(gltf.scene);
                    for (const clip of gltf.animations) {
                        const key = clip.name.toLowerCase();
                        this._clips[key] = clip;
                        this._actions[key] = this._mixer.clipAction(clip);
                    }
                }

                // Collect bones
                gltf.scene.traverse(obj => {
                    if (obj.isBone) this._bones[obj.name.toLowerCase()] = obj;
                });

                // IK foot bones
                this._footL = this._bones['foot_l'] ?? this._bones['leftfoot'] ?? null;
                this._footR = this._bones['foot_r'] ?? this._bones['rightfoot'] ?? null;

                this._isGLTF = true;
            } catch (e) {
                console.warn('[PlayerCharacter3D] GLTF load failed, using fallback:', e.message);
                this._root = this._buildFallback(opts.paletteBodyIdx ?? 0);
            }
        } else {
            this._root = this._buildFallback(opts.paletteBodyIdx ?? 0);
        }

        // Attach root to controller proxy mesh so it follows physics
        const proxy = this._cc?.getMesh?.();
        if (proxy) {
            proxy.add(this._root);
        } else {
            this._scene.add(this._root);
        }

        // Start idle animation
        this._playAnim(AnimState.IDLE, true);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fallback capsule (no GLTF)
    // ─────────────────────────────────────────────────────────────────────────

    _buildFallback(paletteIdx) {
        const group  = new THREE.Group();

        // Body cylinder
        const bodyGeo = new THREE.CylinderGeometry(
            FALLBACK_RADIUS, FALLBACK_RADIUS, FALLBACK_HEIGHT,
            CAP_RADIAL_SEGS, CAP_HEIGHT_SEGS
        );
        bodyGeo.computeVertexNormals();
        const color   = this._palette?.getHex?.(paletteIdx) ?? '#4a9eff';
        const bodyMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(color),
            flatShading: true,
        });
        const body    = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = FALLBACK_HEIGHT / 2;
        body.castShadow = true;
        group.add(body);

        // Head sphere
        const headGeo = new THREE.SphereGeometry(FALLBACK_RADIUS * 0.7, CAP_RADIAL_SEGS, 4);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffe0c0, flatShading: true });
        const head    = new THREE.Mesh(headGeo, headMat);
        head.position.y = FALLBACK_HEIGHT + FALLBACK_RADIUS * 0.5;
        head.castShadow = true;
        group.add(head);

        // Eye dots (palette accent color — subtle)
        const eyeGeo = new THREE.SphereGeometry(0.04, 4, 2);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        [-0.14, 0.14].forEach(x => {
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(x, FALLBACK_HEIGHT + FALLBACK_RADIUS * 0.65, FALLBACK_RADIUS * 0.62);
            group.add(eye);
        });

        return group;
    }

    _applyMaterial(obj, bodyColor, accentColor) {
        obj.traverse(child => {
            if (!child.isMesh) return;
            // Clone material per mesh to allow per-instance emissive flash
            const color = child.userData?.isAccent ? accentColor : bodyColor;
            child.material = new THREE.MeshLambertMaterial({
                color:       new THREE.Color(color),
                flatShading: true,
            });
            child.castShadow    = true;
            child.receiveShadow = false;
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Update (called every frame from engine._update)
    // ─────────────────────────────────────────────────────────────────────────

    update(dt) {
        if (!this._root || this._isDead) return;

        // ── Advance animation mixer ─────────────────────────────────────────
        this._mixer?.update(dt);

        // ── Drive animation from MoveState ──────────────────────────────────
        this._driveAnimation();

        // ── IK foot placement ────────────────────────────────────────────────
        if (this._ikEnabled && this._isGLTF) {
            this._updateIK(dt);
        }

        // ── Invincibility flash ──────────────────────────────────────────────
        if (this._invincFrames > 0) {
            this._invincFrames--;
            this._flashFrame++;
            const showWhite = (this._flashFrame % (FLASH_PERIOD * 2)) < FLASH_PERIOD;
            this._setFlash(showWhite);
        } else {
            this._setFlash(false);
        }

        // ── Face direction of movement ───────────────────────────────────────
        this._faceMovement(dt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Animation state machine
    // ─────────────────────────────────────────────────────────────────────────

    _driveAnimation() {
        if (!this._cc) return;

        const ms  = this._cc.moveState;
        const vel = this._cc.velocity;
        const xzSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

        let desired;

        if (ms === MoveState.DASHING)          desired = AnimState.RUN;
        else if (ms === MoveState.GROUND_POUNDING) desired = AnimState.FALL;
        else if (ms === MoveState.WALL_SLIDING) desired = AnimState.FALL;
        else if (!this._cc.isGrounded) {
            desired = this._cc._body?.velocity?.y > 0 ? AnimState.JUMP : AnimState.FALL;
        } else if (xzSpeed > 4.5)              desired = AnimState.RUN;
        else if (xzSpeed > 0.5)                desired = AnimState.WALK;
        else                                   desired = AnimState.IDLE;

        if (desired !== this._curAnim) {
            this._playAnim(desired);
        }
    }

    _playAnim(name, force = false) {
        if (!this._mixer) { this._curAnim = name; return; }
        if (name === this._curAnim && !force) return;

        const next = this._actions[name];
        if (!next) { this._curAnim = name; return; }

        const prev = this._curAnim ? this._actions[this._curAnim] : null;

        next.reset().setEffectiveWeight(1).play();
        if (prev && prev !== next) {
            next.crossFadeFrom(prev, ANIM_FADE, true);
        }

        this._curAnim = name;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IK foot placement
    // ─────────────────────────────────────────────────────────────────────────

    _updateIK(dt) {
        if (!this._footL && !this._footR) return;
        if (this._collisionMeshes.length === 0) return;
        if (!this._cc?.isGrounded) return;

        const pos = this._cc.getPosition();
        const lerpT = Math.min(1, IK_BLEND * dt);

        if (this._footL) {
            const worldL = new THREE.Vector3();
            this._footL.getWorldPosition(worldL);
            const targetL = this._getFootGroundY(worldL);
            this._footLOffset = THREE.MathUtils.lerp(this._footLOffset, targetL, lerpT);
            this._footL.position.y += Math.min(IK_MAX_OFFSET, this._footLOffset);
        }

        if (this._footR) {
            const worldR = new THREE.Vector3();
            this._footR.getWorldPosition(worldR);
            const targetR = this._getFootGroundY(worldR);
            this._footROffset = THREE.MathUtils.lerp(this._footROffset, targetR, lerpT);
            this._footR.position.y += Math.min(IK_MAX_OFFSET, this._footROffset);
        }
    }

    _getFootGroundY(footWorldPos) {
        const origin = new THREE.Vector3(footWorldPos.x, footWorldPos.y + 0.1, footWorldPos.z);
        this._ikRayL.set(origin, new THREE.Vector3(0, -1, 0));
        this._ikRayL.far = IK_RAY_LEN;
        const hits = this._ikRayL.intersectObjects(this._collisionMeshes, false);
        if (hits.length === 0) return 0;
        // Desired offset = ground Y - foot Y
        return hits[0].point.y - footWorldPos.y;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Face movement direction
    // ─────────────────────────────────────────────────────────────────────────

    _faceMovement(dt) {
        if (!this._root || !this._cc) return;
        const vel = this._cc.velocity;
        const xzSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        if (xzSpeed < 0.5) return;

        const targetYaw = Math.atan2(vel.x, vel.z);
        const curYaw    = this._root.rotation.y;
        let   diff      = targetYaw - curYaw;
        while (diff >  Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        this._root.rotation.y += diff * Math.min(1, 14 * dt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Invincibility flash
    // ─────────────────────────────────────────────────────────────────────────

    _setFlash(white) {
        if (!this._root) return;
        this._root.traverse(child => {
            if (!child.isMesh || !child.material) return;
            child.material.emissive?.set(white ? 0xffffff : 0x000000);
            child.material.emissiveIntensity = white ? 0.8 : 0;
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Health
    // ─────────────────────────────────────────────────────────────────────────

    takeDamage(amount = 1) {
        if (this._invincFrames > 0 || this._isDead) return;
        this._health -= amount;
        this._invincFrames = 60;   // ~1 second base invincibility
        this._flashFrame   = 0;

        this._playAnim(AnimState.HURT);
        this._audio?.playEffect?.('hurt', this._cc?.getPosition?.());
        this.onHurt?.(this._health);

        if (this._health <= 0) this.die();
    }

    setInvincible(frames) {
        this._invincFrames = Math.max(this._invincFrames, frames);
    }

    die() {
        if (this._isDead) return;
        this._isDead = true;
        this._playAnim(AnimState.DIE);
        this._audio?.playEffect?.('die', this._cc?.getPosition?.());
        this.onDeath?.();
    }

    revive() {
        this._isDead   = false;
        this._health   = HEALTH_MAX;
        this._invincFrames = 90;
        this._flashFrame   = 0;
        this._playAnim(AnimState.IDLE, true);
    }

    get health()   { return this._health; }
    get isDead()   { return this._isDead; }

    // ─────────────────────────────────────────────────────────────────────────
    // Accessory slots
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Attach a GLTF accessory to a named bone slot.
     * @param {'hat'|'cape'|'sword'} slot
     * @param {string} url  GLTF URL
     */
    async equipAccessory(slot, url) {
        this.removeAccessory(slot);  // remove existing first

        if (!this._assets) return;
        try {
            const gltf  = await this._assets.loadGLTF(url);
            const piece = gltf.scene;

            // Apply flat-shaded material
            piece.traverse(child => {
                if (!child.isMesh) return;
                child.material = new THREE.MeshLambertMaterial({
                    color: child.material?.color ?? new THREE.Color(0xffffff),
                    flatShading: true,
                });
                child.castShadow = true;
            });

            // Attach to bone if skeleton available, else attach to root
            const boneName  = ACCESSORY_BONE[slot];
            const bone      = boneName ? (this._bones[boneName] ?? this._bones[boneName + '_l'] ?? null) : null;
            const parent    = bone ?? this._root;
            parent?.add(piece);

            this._accessories[slot] = piece;
        } catch (e) {
            console.warn(`[PlayerCharacter3D] Accessory load failed (${slot}):`, e.message);
        }
    }

    removeAccessory(slot) {
        const piece = this._accessories[slot];
        if (!piece) return;
        piece.parent?.remove(piece);
        delete this._accessories[slot];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Collision meshes for IK
    // ─────────────────────────────────────────────────────────────────────────

    setCollisionMeshes(meshes) {
        this._collisionMeshes = meshes;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Accessors
    // ─────────────────────────────────────────────────────────────────────────

    get mesh()  { return this._root; }
    get bones() { return this._bones; }

    // ─────────────────────────────────────────────────────────────────────────
    // Destroy
    // ─────────────────────────────────────────────────────────────────────────

    destroy() {
        this._mixer?.stopAllAction();
        if (this._root) {
            this._root.parent?.remove(this._root);
            this._root.traverse(child => {
                child.geometry?.dispose();
                child.material?.dispose();
            });
        }
        this._root       = null;
        this._mixer      = null;
        this._bones      = {};
        this._accessories= {};
    }
}
