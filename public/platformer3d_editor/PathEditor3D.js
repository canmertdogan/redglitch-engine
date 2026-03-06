/**
 * PathEditor3D.js  — Phase 54
 * Moving-platform path editor for the Platformer-3D Map Editor.
 * Exposes window.PathEditor3D (IIFE, classic script).
 *
 * Supported motion types:
 *   spline    – CatmullRom waypoint path (loop / ping-pong / one-shot)
 *   pendulum  – pivot + arc angle + speed
 *   rotate    – rotates in place (axis, rpm, startAngle)
 *   elevator  – vertical segment list with pause-at-waypoint durations
 *
 * Usage:
 *   PathEditor3D.init(scene, camera, raycaster, editorState, meshMap, genId)
 *   PathEditor3D.startPath(platformId)   — begin placing waypoints for a platform
 *   PathEditor3D.cancelPath()
 *   PathEditor3D.finalizePath()
 *   PathEditor3D.getPathsForLevel()      — returns serialisable paths[]
 *   PathEditor3D.loadPaths(paths[])      — restore from saved level
 *   PathEditor3D.setMotionType(id, type, config)
 *   PathEditor3D.previewStart(dt)  / previewStop()
 *   PathEditor3D.update(dt)        — call from editor animation loop
 *   PathEditor3D.destroy()
 */
window.PathEditor3D = (function () {
    'use strict';

    // ── Injected references ───────────────────────────────────────────────────
    let _scene, _camera, _raycaster, _editorState, _meshMap, _genId;

    // ── Internal state ─────────────────────────────────────────────────────────
    // paths: Map<platformId, PathRecord>
    // PathRecord = { id, platformId, motionType, config, waypoints:[], loopMode }
    const _paths = new Map();

    // Editing state for the "spline" tool
    let _activePathId  = null;   // platformId being edited
    let _draggingWpIdx = null;   // waypoint index being dragged
    const _waypointMeshes = new Map();   // pathId → THREE.Group of sphere meshes
    const _curveMeshes    = new Map();   // pathId → THREE.Line

    // Preview
    let _previewing  = false;
    let _previewT    = {};   // pathId → t [0..1]

    // Ghost sphere for new waypoint hover
    let _ghostWp = null;

    // ── Geometry helpers ──────────────────────────────────────────────────────
    const WP_GEO  = () => new THREE.SphereGeometry(0.22, 8, 8);
    const WP_MAT  = () => new THREE.MeshLambertMaterial({ color: 0x00ff88, flatShading: true });
    const WP_MAT_SEL = () => new THREE.MeshLambertMaterial({ color: 0xffff00, flatShading: true });

    function _wpMesh(pos) {
        const m = new THREE.Mesh(WP_GEO(), WP_MAT());
        m.position.set(pos.x, pos.y, pos.z);
        m.userData.isWaypoint = true;
        return m;
    }

    // ── Curve line ────────────────────────────────────────────────────────────
    function _buildCurveLine(points) {
        if (points.length < 2) return null;
        const verts = [];
        if (points.length >= 2) {
            const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, p.y, p.z)));
            const pts = curve.getPoints(Math.max(60, points.length * 20));
            pts.forEach(p => verts.push(p.x, p.y, p.z));
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 });
        return new THREE.Line(geo, mat);
    }

    function _refreshCurve(platformId) {
        const rec = _paths.get(platformId);
        if (!rec) return;
        const old = _curveMeshes.get(platformId);
        if (old) { _scene.remove(old); old.geometry.dispose(); }
        if (rec.waypoints.length < 2) { _curveMeshes.delete(platformId); return; }
        const line = _buildCurveLine(rec.waypoints);
        if (line) { _scene.add(line); _curveMeshes.set(platformId, line); }
    }

    function _refreshWaypointMeshes(platformId) {
        const rec = _paths.get(platformId);
        const old = _waypointMeshes.get(platformId);
        if (old) { _scene.remove(old); }
        if (!rec) { _waypointMeshes.delete(platformId); return; }
        const group = new THREE.Group();
        rec.waypoints.forEach((wp, i) => {
            const m = _wpMesh(wp);
            m.userData.wpIndex  = i;
            m.userData.pathOwner = platformId;
            group.add(m);
        });
        _scene.add(group);
        _waypointMeshes.set(platformId, group);
    }

    // ── Pendulum helper objects ───────────────────────────────────────────────
    const _pendulumHelpers = new Map();  // platformId → { pivotMesh, arcLine }

    function _buildPendulumHelper(platformId) {
        const rec = _paths.get(platformId);
        if (!rec || rec.motionType !== 'pendulum') return;
        _removePendulumHelper(platformId);
        const cfg = rec.config;
        const pivot = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 8, 8),
            new THREE.MeshLambertMaterial({ color: 0xff8800, flatShading: true })
        );
        pivot.position.set(cfg.pivotX || 0, cfg.pivotY || 5, cfg.pivotZ || 0);

        // Draw arc line
        const arcPts = [];
        const rad    = cfg.radius || 4;
        const half   = (cfg.arcAngle || 60) * Math.PI / 180 / 2;
        const steps  = 32;
        for (let i = 0; i <= steps; i++) {
            const a = -half + (i / steps) * half * 2;
            arcPts.push(
                pivot.position.x + Math.sin(a) * rad,
                pivot.position.y - Math.cos(a) * rad,
                pivot.position.z
            );
        }
        const arcGeo = new THREE.BufferGeometry();
        arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(arcPts, 3));
        const arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0xff8800 }));

        _scene.add(pivot);
        _scene.add(arcLine);
        _pendulumHelpers.set(platformId, { pivotMesh: pivot, arcLine });
    }

    function _removePendulumHelper(platformId) {
        const h = _pendulumHelpers.get(platformId);
        if (!h) return;
        _scene.remove(h.pivotMesh); h.pivotMesh.geometry.dispose();
        _scene.remove(h.arcLine);   h.arcLine.geometry.dispose();
        _pendulumHelpers.delete(platformId);
    }

    // ── Elevator helper ───────────────────────────────────────────────────────
    const _elevatorHelpers = new Map();  // platformId → THREE.Group of stop spheres + lines

    function _buildElevatorHelper(platformId) {
        _removeElevatorHelper(platformId);
        const rec = _paths.get(platformId);
        if (!rec || rec.motionType !== 'elevator') return;
        const group = new THREE.Group();
        const stops = rec.config.stops || [];
        stops.forEach((stop, i) => {
            const m = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.2, 0.4),
                new THREE.MeshLambertMaterial({ color: 0x88aaff, flatShading: true })
            );
            m.position.set(stop.x || 0, stop.y || i * 3, stop.z || 0);
            group.add(m);
            if (i > 0) {
                const prev = stops[i - 1];
                const pts  = [
                    prev.x || 0, prev.y || (i - 1) * 3, prev.z || 0,
                    stop.x || 0, stop.y || i * 3,        stop.z || 0,
                ];
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
                group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x88aaff })));
            }
        });
        _scene.add(group);
        _elevatorHelpers.set(platformId, group);
    }

    function _removeElevatorHelper(platformId) {
        const g = _elevatorHelpers.get(platformId);
        if (!g) return;
        _scene.remove(g);
        _elevatorHelpers.delete(platformId);
    }

    // ── Ghost waypoint ────────────────────────────────────────────────────────
    function _ensureGhost() {
        if (_ghostWp) return;
        _ghostWp = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 8),
            new THREE.MeshLambertMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.5, flatShading: true })
        );
        _ghostWp.visible = false;
        _scene.add(_ghostWp);
    }

    // ── Placement plane (Y = 0 by default, adjusted per tool) ─────────────────
    const _placePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────

    function init(scene, camera, raycaster, editorState, meshMap, genId) {
        _scene       = scene;
        _camera      = camera;
        _raycaster   = raycaster;
        _editorState = editorState;
        _meshMap     = meshMap;
        _genId       = genId;
        _ensureGhost();
    }

    /** Begin placing waypoints for a platform's spline path. */
    function startPath(platformId) {
        _activePathId = platformId;
        if (!_paths.has(platformId)) {
            _paths.set(platformId, {
                id: _genId('path'),
                platformId,
                motionType: 'spline',
                loopMode:   'ping-pong',
                config:     { speed: 3 },
                waypoints:  [],
            });
        }
        // Add origin waypoint from platform current position
        const mesh = _meshMap.get(platformId);
        if (mesh && _paths.get(platformId).waypoints.length === 0) {
            const pos = mesh.position;
            _paths.get(platformId).waypoints.push({ x: pos.x, y: pos.y, z: pos.z });
            _refreshWaypointMeshes(platformId);
        }
        document.body.style.cursor = 'crosshair';
    }

    function cancelPath() {
        _activePathId   = null;
        _draggingWpIdx  = null;
        document.body.style.cursor = '';
        if (_ghostWp) _ghostWp.visible = false;
    }

    function finalizePath() {
        const id = _activePathId;
        _activePathId  = null;
        _draggingWpIdx = null;
        document.body.style.cursor = '';
        if (_ghostWp) _ghostWp.visible = false;
        if (id) {
            _refreshCurve(id);
            _refreshWaypointMeshes(id);
        }
    }

    /** Place a waypoint at canvas NDC coordinates (called from editor mouse handler). */
    function handleClick(nx, ny, shiftHeld) {
        if (_activePathId === null) return false;
        _raycaster.setFromCamera({ x: nx, y: ny }, _camera);
        const hit = new THREE.Vector3();
        if (!_raycaster.ray.intersectPlane(_placePlane, hit)) return false;

        const rec = _paths.get(_activePathId);
        if (!rec) return false;

        if (shiftHeld && rec.waypoints.length > 0) {
            // Shift+click = remove last waypoint
            rec.waypoints.pop();
        } else {
            const snap = _editorState.snapSize || 0;
            const sx = snap > 0 ? Math.round(hit.x / snap) * snap : hit.x;
            const sz = snap > 0 ? Math.round(hit.z / snap) * snap : hit.z;
            rec.waypoints.push({ x: sx, y: hit.y, z: sz });
        }
        _refreshWaypointMeshes(_activePathId);
        _refreshCurve(_activePathId);
        return true;
    }

    /** Update ghost waypoint position to track mouse (called from editor mousemove). */
    function handleMouseMove(nx, ny) {
        if (_activePathId === null) { if (_ghostWp) _ghostWp.visible = false; return; }
        _raycaster.setFromCamera({ x: nx, y: ny }, _camera);
        const hit = new THREE.Vector3();
        if (!_raycaster.ray.intersectPlane(_placePlane, hit)) return;
        if (_ghostWp) {
            _ghostWp.visible = true;
            _ghostWp.position.copy(hit);
        }
    }

    /** Set (or update) the motion type and config for a platform's path. */
    function setMotionType(platformId, motionType, config = {}) {
        if (!_paths.has(platformId)) {
            _paths.set(platformId, {
                id: _genId('path'), platformId, motionType,
                loopMode: 'ping-pong', config, waypoints: [],
            });
        } else {
            const rec = _paths.get(platformId);
            rec.motionType = motionType;
            rec.config     = Object.assign(rec.config || {}, config);
        }
        // Show/hide helpers
        _removePendulumHelper(platformId);
        _removeElevatorHelper(platformId);
        if (motionType === 'pendulum')  _buildPendulumHelper(platformId);
        if (motionType === 'elevator')  _buildElevatorHelper(platformId);
    }

    function setLoopMode(platformId, mode) {
        const rec = _paths.get(platformId);
        if (rec) rec.loopMode = mode;
    }

    function removePath(platformId) {
        _paths.delete(platformId);
        const wg = _waypointMeshes.get(platformId);
        if (wg) { _scene.remove(wg); _waypointMeshes.delete(platformId); }
        const cl = _curveMeshes.get(platformId);
        if (cl) { _scene.remove(cl); cl.geometry.dispose(); _curveMeshes.delete(platformId); }
        _removePendulumHelper(platformId);
        _removeElevatorHelper(platformId);
    }

    /** Returns array of serialisable path records (for level export). */
    function getPathsForLevel() {
        const out = [];
        _paths.forEach(rec => out.push(JSON.parse(JSON.stringify(rec))));
        return out;
    }

    /** Restore paths from a saved level. */
    function loadPaths(paths) {
        paths.forEach(rec => {
            _paths.set(rec.platformId, JSON.parse(JSON.stringify(rec)));
            _refreshWaypointMeshes(rec.platformId);
            _refreshCurve(rec.platformId);
            if (rec.motionType === 'pendulum') _buildPendulumHelper(rec.platformId);
            if (rec.motionType === 'elevator') _buildElevatorHelper(rec.platformId);
        });
    }

    // ── Preview animation ──────────────────────────────────────────────────────
    function previewStart() {
        _previewing = true;
        _paths.forEach((rec, pid) => { _previewT[pid] = 0; });
    }

    function previewStop() {
        _previewing = false;
        // Reset platform meshes back to first waypoint
        _paths.forEach((rec, pid) => {
            if (rec.waypoints.length === 0) return;
            const mesh = _meshMap.get(pid);
            if (!mesh) return;
            const wp0 = rec.waypoints[0];
            mesh.position.set(wp0.x, wp0.y, wp0.z);
        });
    }

    function update(dt) {
        if (!_previewing) return;
        _paths.forEach((rec, pid) => {
            const mesh = _meshMap.get(pid);
            if (!mesh) return;
            const speed = rec.config.speed || 3;

            if (rec.motionType === 'spline' && rec.waypoints.length >= 2) {
                _previewT[pid] = (_previewT[pid] || 0) + dt * speed * 0.1;
                const curve = new THREE.CatmullRomCurve3(
                    rec.waypoints.map(p => new THREE.Vector3(p.x, p.y, p.z))
                );
                let t = _previewT[pid];
                if (rec.loopMode === 'loop') {
                    t = t % 1;
                } else if (rec.loopMode === 'ping-pong') {
                    const tt = t % 2;
                    t = tt > 1 ? 2 - tt : tt;
                } else {
                    t = Math.min(t, 1);
                }
                const pos = curve.getPoint(t);
                mesh.position.copy(pos);

            } else if (rec.motionType === 'pendulum') {
                const cfg = rec.config;
                _previewT[pid] = (_previewT[pid] || 0) + dt * (cfg.speed || 1);
                const half = ((cfg.arcAngle || 60) * Math.PI / 180) / 2;
                const angle = Math.sin(_previewT[pid]) * half;
                const rad   = cfg.radius || 4;
                const px    = (cfg.pivotX || 0) + Math.sin(angle) * rad;
                const py    = (cfg.pivotY || 5) - Math.cos(angle) * rad;
                const pz    = (cfg.pivotZ || 0);
                mesh.position.set(px, py, pz);

            } else if (rec.motionType === 'rotate') {
                const cfg = rec.config;
                const rpm = cfg.rpm || 1;
                mesh.rotation[cfg.axis || 'y'] += (rpm * Math.PI * 2 / 60) * dt;

            } else if (rec.motionType === 'elevator' && rec.config.stops && rec.config.stops.length >= 2) {
                const stops   = rec.config.stops;
                const n       = stops.length;
                const totalT  = n - 1;
                _previewT[pid] = (_previewT[pid] || 0) + dt * speed * 0.1;
                let t = _previewT[pid];
                const tt = t % (totalT * 2);
                const tp = tt > totalT ? totalT * 2 - tt : tt;
                const seg  = Math.min(Math.floor(tp), n - 2);
                const frac = tp - seg;
                const a    = stops[seg];
                const b    = stops[seg + 1];
                mesh.position.set(
                    a.x + (b.x - a.x) * frac,
                    a.y + (b.y - a.y) * frac,
                    a.z + (b.z - a.z) * frac
                );
            }
        });
    }

    /** Remove all scene objects; call before level clear or editor destroy. */
    function destroy() {
        _waypointMeshes.forEach((g, id) => { _scene.remove(g); });
        _waypointMeshes.clear();
        _curveMeshes.forEach((l, id) => { _scene.remove(l); l.geometry.dispose(); });
        _curveMeshes.clear();
        _pendulumHelpers.forEach((h) => {
            _scene.remove(h.pivotMesh); h.pivotMesh.geometry.dispose();
            _scene.remove(h.arcLine);   h.arcLine.geometry.dispose();
        });
        _pendulumHelpers.clear();
        _elevatorHelpers.forEach((g) => _scene.remove(g));
        _elevatorHelpers.clear();
        if (_ghostWp) { _scene.remove(_ghostWp); _ghostWp.geometry.dispose(); _ghostWp = null; }
        _paths.clear();
        _previewing = false;
    }

    return {
        init,
        startPath, cancelPath, finalizePath,
        handleClick, handleMouseMove,
        setMotionType, setLoopMode, removePath,
        getPathsForLevel, loadPaths,
        previewStart, previewStop,
        update, destroy,
    };
})();
