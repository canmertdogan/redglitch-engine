/**
 * HazardEditor.js  — Phase 55
 * Hazard, trigger zone, coin, checkpoint and collectible placement for
 * the Platformer-3D Map Editor.
 * Exposes window.HazardEditor (IIFE, classic script).
 *
 * Hazard types:   spike | lava | void | fire-jet | crusher | laser
 * Trigger events: spawn-enemy | play-sound | move-camera | unlock-door
 * Collectibles:   coin | coin-arc | coin-ring | coin-line | star | key | powerup
 * Checkpoints:    orient-dir configurable
 *
 * Usage:
 *   HazardEditor.init(scene, camera, raycaster, editorState, meshMap, genId)
 *   HazardEditor.getHazardsForLevel()       → hazards[]
 *   HazardEditor.getTriggersForLevel()      → triggers[]
 *   HazardEditor.getCollectiblesForLevel()  → collectibles[]
 *   HazardEditor.getCheckpointsForLevel()   → checkpoints[]
 *   HazardEditor.loadHazards(data)          → restore from .pf3d.json
 *   HazardEditor.placeHazard(worldPos, type, config)
 *   HazardEditor.placeTrigger(worldPos, size, event, config)
 *   HazardEditor.placeCollectible(worldPos, type, config)
 *   HazardEditor.placeCheckpoint(worldPos, yaw)
 *   HazardEditor.placePattern(worldPos, pattern, coinType)
 *   HazardEditor.removeById(id)
 *   HazardEditor.update(dt)    — called from render loop (animator hazards)
 *   HazardEditor.destroy()
 */
window.HazardEditor = (function () {
    'use strict';

    // ── Injected refs ─────────────────────────────────────────────────────────
    let _scene, _camera, _raycaster, _editorState, _meshMap, _genId;

    // ── Records ───────────────────────────────────────────────────────────────
    const _hazards     = new Map();   // id → HazardRecord
    const _triggers    = new Map();   // id → TriggerRecord
    const _collectibles = new Map();  // id → CollectibleRecord
    const _checkpoints = new Map();   // id → CheckpointRecord
    const _meshes      = new Map();   // id → THREE.Object3D (any category)

    // ── Timing preview state ──────────────────────────────────────────────────
    let _time = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // GEOMETRY / MATERIAL FACTORIES
    // ─────────────────────────────────────────────────────────────────────────

    const HAZARD_COLORS = {
        'spike':    0xcccccc,
        'lava':     0xff4400,
        'void':     0x110011,
        'fire-jet': 0xff8800,
        'crusher':  0x885522,
        'laser':    0xff0044,
    };

    const COLLECTIBLE_COLORS = {
        'coin':    0xffcc00,
        'star':    0xffff44,
        'key':     0x44ddff,
        'powerup': 0x44ff88,
    };

    function _hazardMesh(type, cfg) {
        const color = HAZARD_COLORS[type] || 0xff0000;
        const mat   = new THREE.MeshPhongMaterial({ color, flatShading: true });

        if (type === 'spike') {
            const geo = new THREE.ConeGeometry(0.25, 0.9, 4);
            const m   = new THREE.Mesh(geo, mat);
            m.rotation.y = Math.PI / 4;
            return m;
        }
        if (type === 'lava') {
            const geo = new THREE.BoxGeometry(cfg.w || 2, 0.2, cfg.d || 2);
            return new THREE.Mesh(geo, mat);
        }
        if (type === 'void') {
            // Translucent dark slab
            const geo = new THREE.BoxGeometry(cfg.w || 4, 0.1, cfg.d || 4);
            mat.transparent = true; mat.opacity = 0.5;
            return new THREE.Mesh(geo, mat);
        }
        if (type === 'fire-jet') {
            const group = new THREE.Group();
            const base  = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.5, 8), new THREE.MeshPhongMaterial({ color: 0x885522, flatShading: true }));
            group.add(base);
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 6), new THREE.MeshPhongMaterial({ color: 0xff6600, flatShading: true, transparent: true, opacity: 0.85 }));
            flame.position.y = 0.6;
            flame.userData.isFlame = true;
            group.add(flame);
            return group;
        }
        if (type === 'crusher') {
            const group = new THREE.Group();
            const body  = new THREE.Mesh(new THREE.BoxGeometry(cfg.w || 2, cfg.h || 1.5, cfg.d || 2), mat);
            group.add(body);
            // Downward arrow hint
            const arr   = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), new THREE.MeshPhongMaterial({ color: 0xffaa00, flatShading: true }));
            arr.position.y = -(cfg.h || 1.5) / 2 - 0.35;
            arr.rotation.z = Math.PI;
            group.add(arr);
            return group;
        }
        if (type === 'laser') {
            const group = new THREE.Group();
            const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8), new THREE.MeshPhongMaterial({ color: 0x222222, flatShading: true }));
            group.add(emitter);
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, cfg.range || 6, 6), new THREE.MeshPhongMaterial({ color: 0xff0044, flatShading: true, transparent: true, opacity: 0.75 }));
            beam.position.y = (cfg.range || 6) / 2 + 0.2;
            beam.userData.isBeam = true;
            group.add(beam);
            return group;
        }
        // Fallback
        return new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat);
    }

    function _triggerMesh(size) {
        const w = size?.w || 2, h = size?.h || 2, d = size?.d || 2;
        const geo  = new THREE.BoxGeometry(w, h, d);
        const mat  = new THREE.MeshLambertMaterial({ color: 0x00aaff, wireframe: true, transparent: true, opacity: 0.5 });
        const mesh = new THREE.Mesh(geo, mat);
        // Solid face tint
        const solid = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
            new THREE.MeshPhongMaterial({ color: 0x0066cc, transparent: true, opacity: 0.12, flatShading: true }));
        const g = new THREE.Group();
        g.add(mesh); g.add(solid);
        return g;
    }

    function _collectibleMesh(type) {
        const color = COLLECTIBLE_COLORS[type] || 0xffcc00;
        const mat   = new THREE.MeshPhongMaterial({ color, flatShading: true });
        if (type === 'coin') return new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 12), mat);
        if (type === 'star') return new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), mat);
        if (type === 'key')  return new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.07, 6, 12), mat);
        if (type === 'powerup') return new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat);
        return new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), mat);
    }

    function _checkpointMesh(yaw) {
        const group = new THREE.Group();
        const pole  = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6),
            new THREE.MeshPhongMaterial({ color: 0x888888, flatShading: true }));
        group.add(pole);
        const flag  = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05),
            new THREE.MeshPhongMaterial({ color: 0x00ff88, flatShading: true }));
        flag.position.set(0.35, 1.1, 0);
        group.add(flag);
        group.rotation.y = yaw || 0;
        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PLACEMENT
    // ─────────────────────────────────────────────────────────────────────────

    function placeHazard(worldPos, type, config = {}) {
        const id  = _genId('haz');
        const rec = { id, type, pos: { x: worldPos.x, y: worldPos.y, z: worldPos.z }, config };
        _hazards.set(id, rec);
        const mesh = _hazardMesh(type, config);
        mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
        mesh.userData.id    = id;
        mesh.userData.group = 'hazard';
        _scene.add(mesh);
        _meshes.set(id, mesh);
        return rec;
    }

    function placeTrigger(worldPos, size, eventType, config = {}) {
        const id  = _genId('trg');
        const rec = { id, pos: { x: worldPos.x, y: worldPos.y, z: worldPos.z }, size: size || { w: 2, h: 2, d: 2 }, event: eventType, config };
        _triggers.set(id, rec);
        const mesh = _triggerMesh(size);
        mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
        mesh.userData.id    = id;
        mesh.userData.group = 'trigger';
        _scene.add(mesh);
        _meshes.set(id, mesh);
        return rec;
    }

    function placeCollectible(worldPos, type, config = {}) {
        const id  = _genId('col');
        const rec = { id, type, pos: { x: worldPos.x, y: worldPos.y, z: worldPos.z }, config };
        _collectibles.set(id, rec);
        const mesh = _collectibleMesh(type);
        mesh.position.set(worldPos.x, worldPos.y + 0.5, worldPos.z);
        mesh.userData.id    = id;
        mesh.userData.group = 'collectible';
        _scene.add(mesh);
        _meshes.set(id, mesh);
        return rec;
    }

    function placeCheckpoint(worldPos, yaw = 0) {
        const id  = _genId('chk');
        const rec = { id, pos: { x: worldPos.x, y: worldPos.y, z: worldPos.z }, yaw };
        _checkpoints.set(id, rec);
        const mesh = _checkpointMesh(yaw);
        mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
        mesh.userData.id    = id;
        mesh.userData.group = 'checkpoint';
        _scene.add(mesh);
        _meshes.set(id, mesh);
        return rec;
    }

    /**
     * Place a coin pattern.
     * pattern: 'single' | 'arc' | 'ring' | 'line'
     * Returns array of placed collectible records.
     */
    function placePattern(worldPos, pattern, coinType = 'coin', config = {}) {
        const placed = [];
        const count  = config.count || 8;
        const radius = config.radius || 3;
        const spacing = config.spacing || 1.2;
        const height  = config.height  || 1.5;

        if (pattern === 'single') {
            placed.push(placeCollectible(worldPos, coinType, config));
        } else if (pattern === 'arc') {
            const arc    = (config.arc || 120) * Math.PI / 180;
            const start  = -(arc / 2);
            for (let i = 0; i < count; i++) {
                const a   = start + (arc / (count - 1)) * i;
                const pos = { x: worldPos.x + Math.sin(a) * radius, y: worldPos.y + height, z: worldPos.z + Math.cos(a) * radius };
                placed.push(placeCollectible(pos, coinType, config));
            }
        } else if (pattern === 'ring') {
            for (let i = 0; i < count; i++) {
                const a   = (i / count) * Math.PI * 2;
                const pos = { x: worldPos.x + Math.sin(a) * radius, y: worldPos.y + height, z: worldPos.z + Math.cos(a) * radius };
                placed.push(placeCollectible(pos, coinType, config));
            }
        } else if (pattern === 'line') {
            const dir = config.dir || 'x';
            for (let i = 0; i < count; i++) {
                const pos = { ...worldPos };
                if (dir === 'x')  pos.x += i * spacing;
                else if (dir === 'z') pos.z += i * spacing;
                else pos.y += i * spacing * 0.6;
                placed.push(placeCollectible(pos, coinType, config));
            }
        }
        return placed;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REMOVE
    // ─────────────────────────────────────────────────────────────────────────

    function removeById(id) {
        _hazards.delete(id);
        _triggers.delete(id);
        _collectibles.delete(id);
        _checkpoints.delete(id);
        const mesh = _meshes.get(id);
        if (mesh) { _scene.remove(mesh); }
        _meshes.delete(id);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SERIALIZATION
    // ─────────────────────────────────────────────────────────────────────────

    function getHazardsForLevel() {
        const out = [];
        _hazards.forEach(rec => out.push(JSON.parse(JSON.stringify(rec))));
        return out;
    }

    function getTriggersForLevel() {
        const out = [];
        _triggers.forEach(rec => out.push(JSON.parse(JSON.stringify(rec))));
        return out;
    }

    function getCollectiblesForLevel() {
        const out = [];
        _collectibles.forEach(rec => out.push(JSON.parse(JSON.stringify(rec))));
        return out;
    }

    function getCheckpointsForLevel() {
        const out = [];
        _checkpoints.forEach(rec => out.push(JSON.parse(JSON.stringify(rec))));
        return out;
    }

    /** Load all hazard/trigger/collectible/checkpoint data from a saved level. */
    function loadHazards(data) {
        destroy();
        if (!data) return;
        (data.hazards     || []).forEach(h  => placeHazard(h.pos,      h.type,  h.config  || {}));
        (data.triggers    || []).forEach(t  => placeTrigger(t.pos,     t.size,  t.event,  t.config || {}));
        (data.collectibles|| []).forEach(c  => placeCollectible(c.pos, c.type,  c.config  || {}));
        (data.checkpoints || []).forEach(cp => placeCheckpoint(cp.pos  || { x: cp.x||0, y: cp.y||0, z: cp.z||0 }, cp.yaw || 0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ANIMATION UPDATE
    // ─────────────────────────────────────────────────────────────────────────

    function update(dt) {
        _time += dt;

        // Animate fire-jet flames (flicker opacity)
        _hazards.forEach((rec, id) => {
            if (rec.type !== 'fire-jet' && rec.type !== 'laser') return;
            const mesh = _meshes.get(id);
            if (!mesh) return;

            if (rec.type === 'fire-jet') {
                const cfg    = rec.config;
                const period = cfg.period || 2;
                const offset = cfg.offset || 0;
                const t      = ((_time + offset) % period) / period;
                const on     = t < (cfg.dutyCycle || 0.5);
                mesh.traverse(c => {
                    if (c.userData.isFlame) c.visible = on;
                });
            }

            if (rec.type === 'laser') {
                const cfg = rec.config;
                if (cfg.rotating) {
                    const rpm = cfg.rpm || 1;
                    mesh.rotation.y += (rpm * Math.PI * 2 / 60) * dt;
                }
                // Beam flicker for timed lasers
                if (cfg.period) {
                    const t  = ((_time + (cfg.offset || 0)) % cfg.period) / cfg.period;
                    const on = t < (cfg.dutyCycle || 0.5);
                    mesh.traverse(c => { if (c.userData.isBeam) c.visible = on; });
                }
            }
        });

        // Rotate coins slowly
        _collectibles.forEach((rec, id) => {
            if (rec.type !== 'coin' && rec.type !== 'star') return;
            const mesh = _meshes.get(id);
            if (mesh) mesh.rotation.y += dt * 1.8;
        });

        // Crusher bob
        _hazards.forEach((rec, id) => {
            if (rec.type !== 'crusher') return;
            const mesh = _meshes.get(id);
            if (!mesh) return;
            const cfg    = rec.config;
            const period = cfg.period || 2;
            const travel = cfg.travel || 2;
            const offset = cfg.offset || 0;
            const t      = ((_time + offset) % period) / period;
            const frac   = t < 0.5 ? t * 2 : 2 - t * 2;
            mesh.position.y = rec.pos.y + frac * travel;
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIMING CONFIG HELPERS (used by editor UI)
    // ─────────────────────────────────────────────────────────────────────────

    function setHazardTiming(id, period, offset, dutyCycle) {
        const rec = _hazards.get(id);
        if (!rec) return;
        rec.config.period    = period    ?? rec.config.period;
        rec.config.offset    = offset    ?? rec.config.offset;
        rec.config.dutyCycle = dutyCycle ?? rec.config.dutyCycle;
    }

    function setTriggerEvent(id, event, config) {
        const rec = _triggers.get(id);
        if (!rec) return;
        rec.event  = event;
        rec.config = Object.assign(rec.config || {}, config || {});
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DESTROY
    // ─────────────────────────────────────────────────────────────────────────

    function destroy() {
        _meshes.forEach((mesh, id) => {
            _scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
        });
        _meshes.clear();
        _hazards.clear();
        _triggers.clear();
        _collectibles.clear();
        _checkpoints.clear();
        _time = 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────────────

    function init(scene, camera, raycaster, editorState, meshMap, genId) {
        _scene       = scene;
        _camera      = camera;
        _raycaster   = raycaster;
        _editorState = editorState;
        _meshMap     = meshMap;
        _genId       = genId;
    }

    return {
        init,
        placeHazard, placeTrigger, placeCollectible, placeCheckpoint, placePattern,
        removeById,
        setHazardTiming, setTriggerEvent,
        getHazardsForLevel, getTriggersForLevel, getCollectiblesForLevel, getCheckpointsForLevel,
        loadHazards,
        update, destroy,
    };
})();
