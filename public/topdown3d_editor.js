/**
 * topdown3d_editor.js
 * Phase 21 — Topdown 3D Map Editor scaffold
 *
 * Handles:
 *  - Three.js orbit viewport with grid overlay
 *  - Tool system: select / paint / place / erase / height
 *  - Sidebar panels: Terrain, Objects, Lights, NavMesh, Settings
 *  - Level JSON serialization (same schema as demo_level_01.json)
 *  - KetebeEventBus + KetebeProjectState integration
 *  - Undo/redo command stack
 *  - Launcher dashboard registration
 */

/* ────────────────────────────────────────────────────────────────────────────
   Defer setup until THREE.js CDN is loaded (we re-use the engine import map
   if available, otherwise dynamically import from /lib).
   ──────────────────────────────────────────────────────────────────────────── */
(async function () {
    'use strict';

    // ── 1. Acquire THREE ─────────────────────────────────────────────────────
    let THREE;
    try {
        // Engine import-map alias
        ({ default: THREE } = await import('/lib/three/three.module.js'));
    } catch (_) {
        try {
            ({ default: THREE } = await import('/lib/three.module.js'));
        } catch (__) {
            ({ default: THREE } = await import('https://unpkg.com/three@0.154.0/build/three.module.js'));
        }
    }

    let OrbitControls;
    try {
        ({ OrbitControls } = await import('/lib/three/addons/controls/OrbitControls.js'));
    } catch (_) {
        try {
            ({ OrbitControls } = await import('https://unpkg.com/three@0.154.0/examples/jsm/controls/OrbitControls.js'));
        } catch (__) {
            OrbitControls = null; // orbit disabled; pan/zoom still done below
        }
    }

    // ── 2. Globals ────────────────────────────────────────────────────────────
    let eventBus    = window.KetebeEventBus    ?? null;
    let projectState = window.KetebeProjectState ?? null;

    const DEFAULT_PALETTE = [
        '#2e7d32', '#388e3c', '#4caf50', '#81c784',  // greens
        '#795548', '#5d4037', '#4e342e', '#3e2723',  // browns
        '#546e7a', '#607d8b', '#78909c', '#90a4ae',  // greys
        '#1a237e', '#283593', '#303f9f', '#3949ab',  // navy
        '#f57f17', '#f9a825', '#fbc02d', '#fdd835',  // yellows
        '#b71c1c', '#c62828', '#d32f2f', '#e53935',  // reds
        '#4db6ac', '#4fc3f7', '#29b6f6', '#26c6da',  // cyans
        '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575',  // whites/greys
    ];

    // ── 3. Editor state ───────────────────────────────────────────────────────
    const state = {
        tool:           'select',
        terrainType:    'flat',
        brushSize:      3,
        brushStrength:  50,
        brushHeight:    0,
        paletteColor:   '#4db6ac',
        palette:        [...DEFAULT_PALETTE],
        showGrid:       true,
        showWireframe:  false,
        showNavmesh:    false,
        selectedIds:    new Set(),
        hoveredId:      null,
        level: {
            id:          'new_level',
            name:        'New Level',
            engineType:  'topdown-3d',
            worldW:      64,
            worldH:      64,
            skyColor:    '#101030',
            fogColor:    '#151530',
            fogNear:     40,
            fogFar:      120,
            physics:     { gravity: [0, -9.8, 0], fixedStep: 0.016, iterations: 10 },
            bounds:      { width: 64, height: 64 },
            terrain:     { type: 'flat', cellSize: 1, heightMap: [] },
            navmesh:     null,
            entities:    [],
            lights:      [],
            triggers:    [],
            waypoints:   [],
        },
        undoStack: [],
        redoStack: [],
        dirty:       false,
        projectName: null,
        levelFile:   null,
    };

    // ── 4. Three.js scene setup ───────────────────────────────────────────────
    const canvas = document.getElementById('three-canvas');
    const viewport = document.getElementById('viewport');

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x101030, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x151530, 40, 120);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    camera.position.set(0, 40, 40);
    camera.lookAt(0, 0, 0);

    // Orbit controls
    let controls = null;
    if (OrbitControls) {
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        controls.screenSpacePanning = true;
        controls.minDistance = 5;
        controls.maxDistance = 200;
        controls.maxPolarAngle = Math.PI / 2 - 0.05;
    }

    // ── 5. Grid ───────────────────────────────────────────────────────────────
    const gridHelper = new THREE.GridHelper(64, 64, 0x1a1a2e, 0x1a1a2e);
    scene.add(gridHelper);

    // Axis arrows
    const axesHelper = new THREE.AxesHelper(5);
    axesHelper.position.set(-30, 0.02, -30);
    scene.add(axesHelper);

    // Ground plane (clickable terrain cursor)
    const groundGeo  = new THREE.PlaneGeometry(256, 256);
    const groundMat  = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.userData.isGround = true;
    scene.add(groundPlane);

    // Cursor marker
    const cursorGeo = new THREE.BoxGeometry(1, 0.05, 1);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, wireframe: true });
    const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    cursorMesh.visible = false;
    scene.add(cursorMesh);

    // ── 6. Scene lights ───────────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff0e0, 1.2);
    sunLight.position.set(20, 40, 20);
    scene.add(sunLight);

    // ── 7. Raycaster ──────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse     = new THREE.Vector2();

    // ── 8. Objects registry (scene objects) ──────────────────────────────────
    // Maps object ID → { mesh, data }
    const sceneObjects = new Map();
    // Maps light ID → { light, helper, data }
    const sceneLights  = new Map();

    // ── 9. NavMesh overlay group ──────────────────────────────────────────────
    const navMeshGroup = new THREE.Group();
    navMeshGroup.visible = false;
    scene.add(navMeshGroup);

    // ── 10. Resize handling ───────────────────────────────────────────────────
    function resize() {
        const w = viewport.clientWidth;
        const h = viewport.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(viewport);
    resize();

    // ── 11. Render loop ───────────────────────────────────────────────────────
    function animate() {
        requestAnimationFrame(animate);
        if (controls) controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // ── 12. Terrain mesh builder ──────────────────────────────────────────────
    let terrainMesh = null;
    let wireframeMesh = null;

    function buildFlatTerrain(w, h, cellSize = 1) {
        if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); }
        if (wireframeMesh) { scene.remove(wireframeMesh); wireframeMesh.geometry.dispose(); }

        const geo = new THREE.PlaneGeometry(w, h, Math.floor(w / cellSize), Math.floor(h / cellSize));
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshLambertMaterial({ color: 0x2e7d32, flatShading: true });
        terrainMesh = new THREE.Mesh(geo, mat);
        terrainMesh.userData.isTerrain = true;
        scene.add(terrainMesh);

        const wMat = new THREE.MeshBasicMaterial({ color: 0x1a2a1a, wireframe: true });
        wireframeMesh = new THREE.Mesh(geo.clone(), wMat);
        wireframeMesh.visible = state.showWireframe;
        scene.add(wireframeMesh);

        gridHelper.scale.set(w / 64, 1, h / 64);
        gridHelper.position.set(0, 0.01, 0);

        state.level.terrain.cellSize = cellSize;
    }

    buildFlatTerrain(state.level.worldW, state.level.worldH);

    // ── 13. Object placement helpers ─────────────────────────────────────────
    function buildEntityMesh(data) {
        const geo = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
        const mat = new THREE.MeshLambertMaterial({ color: data.team === 0 ? 0x4fc3f7 : 0xff5252 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(data.position[0], 0.9, data.position[2] ?? data.position[1] ?? 0);
        mesh.userData.objId   = data.id;
        mesh.userData.objType = 'unit';
        return mesh;
    }

    function buildPropMesh(data) {
        const geo = new THREE.BoxGeometry(1, 2, 1);
        const mat = new THREE.MeshLambertMaterial({ color: 0x795548 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(data.position[0], 1, data.position[2] ?? 0);
        mesh.userData.objId   = data.id;
        mesh.userData.objType = 'prop';
        return mesh;
    }

    function buildTriggerMesh(data) {
        const geo = new THREE.PlaneGeometry(data.radius ?? 2, data.radius ?? 2);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(data.position[0], 0.02, data.position[2] ?? 0);
        mesh.userData.objId   = data.id;
        mesh.userData.objType = 'trigger';
        return mesh;
    }

    function addSceneObject(data) {
        let mesh;
        if      (data.type === 'unit')    mesh = buildEntityMesh(data);
        else if (data.type === 'trigger') mesh = buildTriggerMesh(data);
        else                              mesh = buildPropMesh(data);
        scene.add(mesh);
        sceneObjects.set(data.id, { mesh, data });
        refreshObjList();
        updateHUD();
    }

    function removeSceneObject(id) {
        const entry = sceneObjects.get(id);
        if (!entry) return;
        scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        sceneObjects.delete(id);
        state.selectedIds.delete(id);
        refreshObjList();
        updateHUD();
    }

    // ── 14. Light placement helpers ────────────────────────────────────────────
    let _lightIdx = 0;
    function addSceneLight(type, color, intensity) {
        const id = `light_${type}_${_lightIdx++}`;
        let light;
        const col = new THREE.Color(color);
        if      (type === 'ambient')     light = new THREE.AmbientLight(col, intensity);
        else if (type === 'directional') light = new THREE.DirectionalLight(col, intensity);
        else if (type === 'point')       light = new THREE.PointLight(col, intensity, 30);
        else if (type === 'spot')        light = new THREE.SpotLight(col, intensity);
        else                             light = new THREE.HemisphereLight(col, 0x333355, intensity);
        light.position.set(0, 10, 0);
        scene.add(light);

        let helper = null;
        if (type === 'directional') { helper = new THREE.DirectionalLightHelper(light, 2); scene.add(helper); }
        else if (type === 'point')  { helper = new THREE.PointLightHelper(light, 0.5); scene.add(helper); }

        const data = { id, type, color, intensity, position: [0, 10, 0] };
        sceneLights.set(id, { light, helper, data });
        state.level.lights.push(data);
        refreshLightsList();
        updateHUD();
        return id;
    }

    function removeSceneLight(id) {
        const entry = sceneLights.get(id);
        if (!entry) return;
        scene.remove(entry.light);
        if (entry.helper) scene.remove(entry.helper);
        sceneLights.delete(id);
        state.level.lights = state.level.lights.filter(l => l.id !== id);
        refreshLightsList();
        updateHUD();
    }

    // ── 15. Selection helpers ─────────────────────────────────────────────────
    function setSelected(ids) {
        // Clear previous highlight
        for (const [id, { mesh }] of sceneObjects) {
            const isBase = mesh.userData.objType === 'unit' ? 0 : -1;
            if (isBase >= 0) mesh.material.emissive?.setHex(0x000000);
        }
        state.selectedIds = new Set(ids);
        for (const id of ids) {
            const entry = sceneObjects.get(id);
            if (entry && entry.mesh.material.emissive) {
                entry.mesh.material.emissive.setHex(0x4fc3f7);
            }
        }
        refreshPropsPanel();
    }

    // ── 16. Pick object from viewport ─────────────────────────────────────────
    function pickObject(event) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const meshes = [...sceneObjects.values()].map(e => e.mesh);
        const hits = raycaster.intersectObjects(meshes, false);
        return hits.length ? hits[0].object.userData.objId : null;
    }

    // ── 17. Ground cursor projection ─────────────────────────────────────────
    function groundPos(event) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const targets = terrainMesh ? [terrainMesh, groundPlane] : [groundPlane];
        const hits = raycaster.intersectObjects(targets, false);
        if (hits.length) return hits[0].point;
        return null;
    }

    // ── 18. Placement action ──────────────────────────────────────────────────
    let _objIdx = 0;
    function placeObjectAt(worldPos) {
        const type = document.getElementById('obj-type-select').value;
        const team = parseInt(document.getElementById('obj-team').value, 10) || 0;
        const idInput = document.getElementById('obj-id').value.trim();
        const id = idInput || `${type}_${_objIdx++}`;
        const data = {
            id, type,
            team,
            position: [Math.round(worldPos.x * 2) / 2, 0, Math.round(worldPos.z * 2) / 2],
            stats:    type === 'unit' ? { hp: 100, maxHp: 100, speed: 5 } : undefined,
        };
        if (type !== 'unit') delete data.team;
        if (!data.stats) delete data.stats;

        pushUndo({ type: 'ADD_OBJECT', data: JSON.parse(JSON.stringify(data)) });

        if (type === 'unit') {
            state.level.entities.push(data);
        } else if (type === 'trigger') {
            state.level.triggers = state.level.triggers ?? [];
            state.level.triggers.push(data);
        } else {
            // prop / spawn / waypoint stored generically
            state.level.entities.push(data);
        }
        addSceneObject(data);
        markDirty();
    }

    // ── 19. Undo / Redo ───────────────────────────────────────────────────────
    function pushUndo(cmd) {
        state.undoStack.push(cmd);
        state.redoStack = [];
    }

    function undo() {
        const cmd = state.undoStack.pop();
        if (!cmd) return;
        state.redoStack.push(cmd);
        if (cmd.type === 'ADD_OBJECT')    removeSceneObject(cmd.data.id);
        else if (cmd.type === 'DEL_OBJECT') { addSceneObject(cmd.data); state.level.entities.push(cmd.data); }
        setStatus('Undo: ' + cmd.type);
    }

    function redo() {
        const cmd = state.redoStack.pop();
        if (!cmd) return;
        state.undoStack.push(cmd);
        if (cmd.type === 'ADD_OBJECT')    { addSceneObject(cmd.data); state.level.entities.push(cmd.data); }
        else if (cmd.type === 'DEL_OBJECT') removeSceneObject(cmd.data.id);
        setStatus('Redo: ' + cmd.type);
    }

    // ── 20. Level serialisation ───────────────────────────────────────────────
    function buildLevelJSON() {
        const lv = state.level;
        lv.bounds = { width: lv.worldW, height: lv.worldH };
        lv.entities = [...sceneObjects.values()]
            .map(e => e.data)
            .filter(d => d.type === 'unit');
        lv.lights = [...sceneLights.values()].map(e => e.data);
        return JSON.parse(JSON.stringify(lv));
    }

    function applyLevelJSON(json) {
        // Reset scene
        for (const id of [...sceneObjects.keys()]) removeSceneObject(id);
        for (const id of [...sceneLights.keys()])  removeSceneLight(id);

        state.level = { ...state.level, ...json };

        // Rebuild terrain
        buildFlatTerrain(json.worldW ?? 64, json.worldH ?? 64, json.terrain?.cellSize ?? 1);

        // Repopulate
        (json.entities ?? []).forEach(e => addSceneObject(e));
        (json.lights   ?? []).forEach(l => {
            // Reconstruct using stored data
            const id = `light_${l.type}_${_lightIdx++}`;
            let light;
            const col = new THREE.Color(l.color ?? '#ffffff');
            if      (l.type === 'ambient')     light = new THREE.AmbientLight(col, l.intensity ?? 1);
            else if (l.type === 'directional') light = new THREE.DirectionalLight(col, l.intensity ?? 1);
            else if (l.type === 'point')       light = new THREE.PointLight(col, l.intensity ?? 1, 30);
            else                               light = new THREE.HemisphereLight(col, 0x333355, l.intensity ?? 1);
            const pos = l.position ?? [0, 10, 0];
            light.position.set(...pos);
            scene.add(light);
            let helper = null;
            if (l.type === 'directional') { helper = new THREE.DirectionalLightHelper(light, 2); scene.add(helper); }
            else if (l.type === 'point')  { helper = new THREE.PointLightHelper(light, 0.5); scene.add(helper); }
            const data = { ...l, id };
            sceneLights.set(id, { light, helper, data });
        });

        // Apply env
        renderer.setClearColor(new THREE.Color(json.skyColor ?? '#101030'), 1);
        scene.fog = new THREE.Fog(
            new THREE.Color(json.fogColor ?? '#151530'),
            json.fogNear ?? 40,
            json.fogFar  ?? 120
        );

        refreshObjList();
        refreshLightsList();
        updateHUD();

        document.getElementById('hud-level').textContent = json.name ?? json.id ?? 'level';
        document.getElementById('stat-level').textContent = json.id ?? '—';
        setStatus(`Loaded: ${json.name ?? json.id}`);
    }

    // ── 21. Save / Load (project server API) ─────────────────────────────────
    async function saveLevel() {
        if (!state.projectName) { setStatus('No project open.'); return; }
        const filename = state.levelFile || `${state.level.id}.json`;
        const json = buildLevelJSON();
        try {
            const res = await fetch(`/api/project-file`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    project:  state.projectName,
                    path:     `dunyalar/${filename}`,
                    content:  JSON.stringify(json, null, 2),
                }),
            });
            if (res.ok) {
                state.dirty = false;
                updateTitle();
                setStatus(`Saved: dunyalar/${filename}`);
                if (eventBus) eventBus.emit('level:saved', { project: state.projectName, file: filename });
            } else {
                setStatus('Save failed: ' + res.status, true);
            }
        } catch (e) {
            setStatus('Save error: ' + e.message, true);
        }
    }

    async function loadLevel(projectName, filename) {
        try {
            const url = `/projects/${encodeURIComponent(projectName)}/dunyalar/${encodeURIComponent(filename)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(res.status);
            const json = await res.json();
            state.projectName = projectName;
            state.levelFile   = filename;
            applyLevelJSON(json);
            state.dirty = false;
            updateTitle();
        } catch (e) {
            setStatus('Load error: ' + e.message, true);
        }
    }

    // ── 22. New level ─────────────────────────────────────────────────────────
    function newLevel(name, w, h) {
        const id = name.toLowerCase().replace(/\s+/g, '_');
        const blank = {
            id, name, engineType: 'topdown-3d',
            worldW: w, worldH: h,
            skyColor: '#101030', fogColor: '#151530', fogNear: 40, fogFar: 120,
            physics: { gravity: [0, -9.8, 0], fixedStep: 0.016, iterations: 10 },
            bounds: { width: w, height: h },
            terrain: { type: 'flat', cellSize: 1, heightMap: [] },
            navmesh: null, entities: [], lights: [], triggers: [], waypoints: [],
        };
        applyLevelJSON(blank);
        state.dirty   = false;
        state.levelFile = null;
        updateTitle();
        setStatus(`New level: ${name}`);
    }

    // ── 23. Test-play ─────────────────────────────────────────────────────────
    function testPlay() {
        const json = buildLevelJSON();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const win  = window.open(`/engines/topdown-3d/index.html?levelBlob=${encodeURIComponent(url)}`, '_blank');
        if (!win) setStatus('Popup blocked — allow popups for test-play.', true);
    }

    // ── 24. NavMesh bake (stub — Phase 22+ provides real implementation) ───────
    function bakeNavMesh() {
        setStatus('NavMesh baking…');
        // Build a simple flat navmesh from terrain bounds as placeholder
        const { worldW: w, worldH: h } = state.level;
        const tris = [];
        // Two triangles for the ground plane
        tris.push(
            { id: 0, verts: [[-w/2,0,-h/2],[ w/2,0,-h/2],[ w/2,0, h/2]], area: 'WALKABLE' },
            { id: 1, verts: [[-w/2,0,-h/2],[ w/2,0, h/2],[-w/2,0, h/2]], area: 'WALKABLE' }
        );
        state.level.navmesh = { triangles: tris };

        // Update overlay
        rebuildNavMeshOverlay(tris);
        document.getElementById('nm-tris').textContent  = tris.length;
        document.getElementById('nm-walk').textContent  = tris.length;
        document.getElementById('nm-block').textContent = 0;
        document.getElementById('nm-status').textContent = 'OK';
        setStatus('NavMesh baked.');
        markDirty();
    }

    function rebuildNavMeshOverlay(tris) {
        while (navMeshGroup.children.length) navMeshGroup.remove(navMeshGroup.children[0]);
        if (!tris) return;
        for (const tri of tris) {
            const geo = new THREE.BufferGeometry();
            const verts = new Float32Array(tri.verts.flat());
            geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            geo.setIndex([0, 1, 2]);
            const mat = new THREE.MeshBasicMaterial({
                color: tri.area === 'BLOCKED' ? 0xff5252 : 0x4caf50,
                transparent: true, opacity: 0.3, side: THREE.DoubleSide, wireframe: false,
            });
            navMeshGroup.add(new THREE.Mesh(geo, mat));
        }
    }

    function clearNavMesh() {
        state.level.navmesh = null;
        while (navMeshGroup.children.length) navMeshGroup.remove(navMeshGroup.children[0]);
        document.getElementById('nm-tris').textContent  = 0;
        document.getElementById('nm-walk').textContent  = 0;
        document.getElementById('nm-block').textContent = 0;
        document.getElementById('nm-status').textContent = '—';
        setStatus('NavMesh cleared.');
        markDirty();
    }

    // ── 25. Palette swatches ───────────────────────────────────────────────────
    function buildPaletteSwatches() {
        const grid = document.getElementById('palette-swatches');
        grid.innerHTML = '';
        for (const color of state.palette) {
            const div = document.createElement('div');
            div.className = 'swatch' + (color === state.paletteColor ? ' active' : '');
            div.style.background = color;
            div.title = color;
            div.addEventListener('click', () => {
                state.paletteColor = color;
                document.querySelectorAll('#palette-swatches .swatch').forEach(s => s.classList.remove('active'));
                div.classList.add('active');
                if (terrainMesh) terrainMesh.material.color.set(color);
            });
            grid.appendChild(div);
        }
    }
    buildPaletteSwatches();

    // ── 26. Object list refresh ────────────────────────────────────────────────
    function refreshObjList() {
        const ul = document.getElementById('scene-obj-list');
        ul.innerHTML = '';
        if (!sceneObjects.size) {
            ul.innerHTML = '<div style="color:#444;font-size:.85rem;padding:8px 0">No objects placed yet.</div>';
            return;
        }
        for (const [id, { data }] of sceneObjects) {
            const div = document.createElement('div');
            div.className = 'obj-item' + (state.selectedIds.has(id) ? ' selected' : '');
            div.innerHTML = `<span class="obj-icon"><i class="fa ${data.type === 'unit' ? 'fa-user' : data.type === 'trigger' ? 'fa-bolt' : 'fa-cube'}"></i></span>
                <span class="obj-name">${id}</span>
                <span class="obj-team">${data.team !== undefined ? 'T' + data.team : ''}</span>
                <span class="obj-icon" style="cursor:pointer;color:#c0392b" data-del="${id}"><i class="fa fa-times"></i></span>`;
            div.querySelector('[data-del]').addEventListener('click', e => {
                e.stopPropagation();
                const del = e.currentTarget.dataset.del;
                const entry = sceneObjects.get(del);
                if (entry) pushUndo({ type: 'DEL_OBJECT', data: JSON.parse(JSON.stringify(entry.data)) });
                removeSceneObject(del);
                state.level.entities = state.level.entities.filter(e => e.id !== del);
                markDirty();
            });
            div.addEventListener('click', () => setSelected([id]));
            ul.appendChild(div);
        }
        document.getElementById('stat-objs').textContent = sceneObjects.size;
    }

    // ── 27. Lights list refresh ────────────────────────────────────────────────
    function refreshLightsList() {
        const ul = document.getElementById('lights-list');
        ul.innerHTML = '';
        if (!sceneLights.size) {
            ul.innerHTML = '<div style="color:#444;font-size:.85rem;padding:8px 0">No lights added yet.</div>';
            return;
        }
        for (const [id, { data }] of sceneLights) {
            const div = document.createElement('div');
            div.className = 'light-item';
            div.innerHTML = `<span class="light-color-dot" style="background:${data.color}"></span>
                <span class="light-name">${id}</span>
                <span class="light-type-badge">${data.type}</span>
                <span style="cursor:pointer;color:#c0392b;margin-left:4px" data-del-light="${id}"><i class="fa fa-times"></i></span>`;
            div.querySelector('[data-del-light]').addEventListener('click', e => {
                e.stopPropagation();
                removeSceneLight(e.currentTarget.dataset.delLight);
                markDirty();
            });
            ul.appendChild(div);
        }
        document.getElementById('stat-lights').textContent = sceneLights.size;
    }

    // ── 28. Properties inspector ───────────────────────────────────────────────
    function refreshPropsPanel() {
        const empty   = document.getElementById('props-empty');
        const content = document.getElementById('props-content');
        if (!state.selectedIds.size) {
            empty.style.display   = '';
            content.style.display = 'none';
            return;
        }
        const id = [...state.selectedIds][0];
        const entry = sceneObjects.get(id);
        if (!entry) { empty.style.display = ''; content.style.display = 'none'; return; }
        const d = entry.data;
        empty.style.display   = 'none';
        content.style.display = '';
        content.innerHTML = `
            <div class="prop-group">
                <div class="prop-group-title">IDENTITY</div>
                <div class="prop-row"><label>ID</label><input type="text" value="${d.id}" readonly></div>
                <div class="prop-row"><label>TYPE</label><input type="text" value="${d.type}" readonly></div>
                ${d.team !== undefined ? `<div class="prop-row"><label>TEAM</label><input type="number" value="${d.team}" id="prop-team"></div>` : ''}
            </div>
            <div class="prop-group">
                <div class="prop-group-title">TRANSFORM</div>
                <div class="prop-row"><label>X</label><input type="number" value="${d.position[0]}" id="prop-x" step="0.5"></div>
                <div class="prop-row"><label>Y</label><input type="number" value="${d.position[1] ?? 0}" id="prop-y" step="0.5"></div>
                <div class="prop-row"><label>Z</label><input type="number" value="${d.position[2] ?? 0}" id="prop-z" step="0.5"></div>
            </div>
            ${d.stats ? `
            <div class="prop-group">
                <div class="prop-group-title">STATS</div>
                <div class="prop-row"><label>HP</label><input type="number" value="${d.stats.maxHp ?? 100}" id="prop-hp"></div>
                <div class="prop-row"><label>SPEED</label><input type="number" value="${d.stats.speed ?? 5}" step="0.5" id="prop-speed"></div>
            </div>` : ''}
            <div style="margin-top:8px">
                <button class="btn" id="prop-apply" style="width:100%">APPLY</button>
            </div>`;

        document.getElementById('prop-apply')?.addEventListener('click', () => {
            d.position[0] = parseFloat(document.getElementById('prop-x').value) || 0;
            d.position[1] = parseFloat(document.getElementById('prop-y').value) || 0;
            d.position[2] = parseFloat(document.getElementById('prop-z').value) || 0;
            entry.mesh.position.set(d.position[0], 0.9, d.position[2]);
            if (d.team !== undefined) d.team = parseInt(document.getElementById('prop-team').value, 10) || 0;
            if (d.stats) {
                d.stats.maxHp = parseInt(document.getElementById('prop-hp').value, 10) || 100;
                d.stats.hp    = d.stats.maxHp;
                d.stats.speed = parseFloat(document.getElementById('prop-speed').value) || 5;
            }
            markDirty();
            setStatus('Properties applied.');
        });
    }

    // ── 29. HUD / title / status ───────────────────────────────────────────────
    function updateHUD() {
        document.getElementById('hud-objs').textContent  = sceneObjects.size + ' objects';
        document.getElementById('stat-objs').textContent  = sceneObjects.size;
        document.getElementById('stat-lights').textContent = sceneLights.size;
    }

    function updateTitle() {
        const dirty = state.dirty ? '• ' : '';
        document.title = `${dirty}${state.level.name ?? 'TOPDOWN-3D EDITOR'} — ketebe`;
    }

    function markDirty() {
        state.dirty = true;
        updateTitle();
    }

    function setStatus(msg, warn = false) {
        const el = document.getElementById('stat-msg');
        el.textContent = msg;
        el.style.color = warn ? '#ffb300' : '#888';
    }

    // ── 30. Settings panel apply ───────────────────────────────────────────────
    document.getElementById('btn-apply-settings').addEventListener('click', () => {
        const w   = parseInt(document.getElementById('set-world-w').value, 10) || 64;
        const h   = parseInt(document.getElementById('set-world-h').value, 10) || 64;
        const sky = document.getElementById('set-sky-color').value;
        const fog = document.getElementById('set-fog-color').value;
        const fn  = parseFloat(document.getElementById('set-fog-near').value) || 40;
        const ff  = parseFloat(document.getElementById('set-fog-far').value)  || 120;
        const grav = parseFloat(document.getElementById('set-gravity').value) || -9.8;

        state.level.worldW    = w;
        state.level.worldH    = h;
        state.level.skyColor  = sky;
        state.level.fogColor  = fog;
        state.level.fogNear   = fn;
        state.level.fogFar    = ff;
        state.level.physics.gravity[1] = grav;

        renderer.setClearColor(new THREE.Color(sky), 1);
        scene.fog = new THREE.Fog(new THREE.Color(fog), fn, ff);
        buildFlatTerrain(w, h, state.level.terrain?.cellSize ?? 1);
        markDirty();
        setStatus('Settings applied.');
    });

    // ── 31. Toolbar tool buttons ───────────────────────────────────────────────
    document.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.tool = btn.dataset.tool;
            document.getElementById('hud-mode').textContent  = state.tool.toUpperCase();
            document.getElementById('stat-tool').textContent = state.tool.toUpperCase();
            cursorMesh.visible = (state.tool === 'paint' || state.tool === 'place' || state.tool === 'height' || state.tool === 'erase');
        });
    });

    // ── 32. Viewport toggle buttons ────────────────────────────────────────────
    document.getElementById('btn-grid').addEventListener('click', () => {
        state.showGrid = !state.showGrid;
        gridHelper.visible = state.showGrid;
        document.getElementById('btn-grid').classList.toggle('active', state.showGrid);
    });
    document.getElementById('btn-wireframe').addEventListener('click', () => {
        state.showWireframe = !state.showWireframe;
        if (wireframeMesh) wireframeMesh.visible = state.showWireframe;
        document.getElementById('btn-wireframe').classList.toggle('active', state.showWireframe);
    });
    document.getElementById('btn-navmesh').addEventListener('click', () => {
        state.showNavmesh = !state.showNavmesh;
        navMeshGroup.visible = state.showNavmesh;
        document.getElementById('btn-navmesh').classList.toggle('active', state.showNavmesh);
    });
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-save').addEventListener('click', saveLevel);
    document.getElementById('btn-testplay').addEventListener('click', testPlay);

    // Zoom controls
    document.querySelectorAll('[data-zoom]').forEach(btn => {
        btn.addEventListener('click', () => {
            const z = btn.dataset.zoom;
            if (z === 'in')  camera.position.multiplyScalar(0.8);
            if (z === 'out') camera.position.multiplyScalar(1.25);
            if (z === 'fit') { camera.position.set(0, 40, 40); camera.lookAt(0, 0, 0); if (controls) controls.target.set(0, 0, 0); }
        });
    });

    // ── 33. Panel tabs ──────────────────────────────────────────────────────────
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const p = tab.dataset.panel;
            document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel-body').forEach(b => b.classList.remove('active'));
            tab.classList.add('active');
            const body = document.getElementById(`panel-${p}`);
            if (body) body.classList.add('active');
        });
    });

    // ── 34. Brush size / strength sliders ─────────────────────────────────────
    document.getElementById('brush-size').addEventListener('input', e => {
        state.brushSize = parseInt(e.target.value, 10);
        document.getElementById('brush-size-val').textContent = state.brushSize;
        cursorMesh.scale.set(state.brushSize, 1, state.brushSize);
    });
    document.getElementById('brush-str').addEventListener('input', e => {
        state.brushStrength = parseInt(e.target.value, 10);
        document.getElementById('brush-str-val').textContent = state.brushStrength;
    });

    // Terrain type brush cells
    document.querySelectorAll('[data-terrain]').forEach(cell => {
        cell.addEventListener('click', () => {
            document.querySelectorAll('[data-terrain]').forEach(c => c.classList.remove('active'));
            cell.classList.add('active');
            state.terrainType = cell.dataset.terrain;
        });
    });

    // ── 35. Custom palette color add ──────────────────────────────────────────
    document.getElementById('add-color-btn').addEventListener('click', () => {
        const c = document.getElementById('custom-color').value;
        if (!state.palette.includes(c)) {
            state.palette.unshift(c);
            buildPaletteSwatches();
        }
        state.paletteColor = c;
        buildPaletteSwatches();
        if (terrainMesh) terrainMesh.material.color.set(c);
    });

    // ── 36. Add light button ───────────────────────────────────────────────────
    document.getElementById('add-light-btn').addEventListener('click', () => {
        const type  = document.getElementById('light-type-select').value;
        const color = document.getElementById('light-color').value;
        const intens = parseFloat(document.getElementById('light-intensity').value) || 1;
        addSceneLight(type, color, intens);
        markDirty();
    });

    // NavMesh buttons
    document.getElementById('btn-bake-nm').addEventListener('click', bakeNavMesh);
    document.getElementById('btn-clear-nm').addEventListener('click', clearNavMesh);
    document.getElementById('btn-show-nm').addEventListener('click', () => {
        state.showNavmesh = !state.showNavmesh;
        navMeshGroup.visible = state.showNavmesh;
    });

    // ── 37. Menu bar actions ───────────────────────────────────────────────────
    document.querySelectorAll('[data-action]').forEach(el => {
        el.addEventListener('click', () => handleAction(el.dataset.action));
    });
    document.getElementById('btn-save').addEventListener('click', saveLevel);

    function handleAction(action) {
        switch (action) {
            case 'new-level':       openNewLevelModal(); break;
            case 'save-level':      saveLevel(); break;
            case 'save-level-as':   saveLevel(); break;
            case 'close-editor':    window.close(); break;
            case 'undo':            undo(); break;
            case 'redo':            redo(); break;
            case 'select-all':      setSelected([...sceneObjects.keys()]); break;
            case 'delete-selected': deleteSelected(); break;
            case 'toggle-grid':     gridHelper.visible = !gridHelper.visible; break;
            case 'toggle-wireframe': if(wireframeMesh) wireframeMesh.visible = !wireframeMesh.visible; break;
            case 'toggle-navmesh':  navMeshGroup.visible = !navMeshGroup.visible; break;
            case 'view-top':        camera.position.set(0, 80, 0.01); camera.lookAt(0,0,0); break;
            case 'view-iso':        camera.position.set(40, 40, 40); camera.lookAt(0,0,0); break;
            case 'view-front':      camera.position.set(0, 10, 60); camera.lookAt(0,0,0); break;
            case 'frame-all':       camera.position.set(0, 40, 40); camera.lookAt(0,0,0); if(controls) controls.target.set(0,0,0); break;
            case 'level-settings':  document.getElementById('modal-level-settings').classList.add('open'); break;
            case 'bake-navmesh':    bakeNavMesh(); break;
            case 'test-play':       testPlay(); break;
        }
    }

    function deleteSelected() {
        for (const id of [...state.selectedIds]) {
            const entry = sceneObjects.get(id);
            if (entry) pushUndo({ type: 'DEL_OBJECT', data: JSON.parse(JSON.stringify(entry.data)) });
            removeSceneObject(id);
            state.level.entities = state.level.entities.filter(e => e.id !== id);
        }
        markDirty();
    }

    // ── 38. New level modal ────────────────────────────────────────────────────
    function openNewLevelModal() {
        document.getElementById('modal-new-level').classList.add('open');
    }
    document.getElementById('modal-new-cancel').addEventListener('click', () => {
        document.getElementById('modal-new-level').classList.remove('open');
    });
    document.getElementById('modal-new-confirm').addEventListener('click', () => {
        const name = document.getElementById('new-level-name').value.trim() || 'new_level';
        const w    = parseInt(document.getElementById('new-level-w').value, 10) || 64;
        const h    = parseInt(document.getElementById('new-level-h').value, 10) || 64;
        newLevel(name, w, h);
        document.getElementById('modal-new-level').classList.remove('open');
    });

    // Level settings modal
    document.getElementById('modal-ls-cancel').addEventListener('click', () => {
        document.getElementById('modal-level-settings').classList.remove('open');
    });
    document.getElementById('modal-ls-confirm').addEventListener('click', () => {
        state.level.id   = document.getElementById('ls-id').value.trim()   || state.level.id;
        state.level.name = document.getElementById('ls-name').value.trim() || state.level.name;
        markDirty();
        setStatus('Level settings saved.');
        document.getElementById('modal-level-settings').classList.remove('open');
    });
    // Pre-fill modal
    document.getElementById('modal-level-settings').addEventListener('transitionend', () => {
        document.getElementById('ls-id').value   = state.level.id;
        document.getElementById('ls-name').value = state.level.name;
    });

    // ── 39. Keyboard shortcuts ─────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 's') { e.preventDefault(); saveLevel(); }
            if (e.key === 'z') { e.preventDefault(); undo(); }
            if (e.key === 'y') { e.preventDefault(); redo(); }
            if (e.key === 'n') { e.preventDefault(); openNewLevelModal(); }
            if (e.key === 'a') { e.preventDefault(); setSelected([...sceneObjects.keys()]); }
            if (e.key === 'b') { e.preventDefault(); bakeNavMesh(); }
            return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
        if (e.key === 'q' || e.key === 'Q') document.querySelector('[data-tool="select"]')?.click();
        if (e.key === 'p' || e.key === 'P') document.querySelector('[data-tool="paint"]')?.click();
        if (e.key === 'e' || e.key === 'E') document.querySelector('[data-tool="place"]')?.click();
        if (e.key === 'd' || e.key === 'D') document.querySelector('[data-tool="erase"]')?.click();
        if (e.key === 'h' || e.key === 'H') document.querySelector('[data-tool="height"]')?.click();
        if (e.key === 'g' || e.key === 'G') { gridHelper.visible = !gridHelper.visible; state.showGrid = gridHelper.visible; }
        if (e.key === 'w' || e.key === 'W') { if(wireframeMesh) wireframeMesh.visible = !wireframeMesh.visible; }
        if (e.key === 'n' || e.key === 'N') { navMeshGroup.visible = !navMeshGroup.visible; state.showNavmesh = navMeshGroup.visible; }
        if (e.key === 'F5') { e.preventDefault(); testPlay(); }
        if (e.key === 'Home') handleAction('frame-all');
    });

    // ── 40. Viewport mouse interactions ───────────────────────────────────────
    let isDragging = false;
    let dragStart  = null;
    let selRectDiv = document.getElementById('sel-rect');

    canvas.addEventListener('mousemove', e => {
        const pos = groundPos(e);
        if (pos) {
            const cx = Math.round(pos.x * 2) / 2;
            const cz = Math.round(pos.z * 2) / 2;
            document.getElementById('tool-coords').textContent = `X: ${cx.toFixed(1)}  Y: ${pos.y.toFixed(2)}  Z: ${cz.toFixed(1)}`;
            if (state.tool !== 'select') {
                cursorMesh.visible = true;
                cursorMesh.position.set(cx, pos.y + 0.03, cz);
            }
        }
        // Delegate to terrain tools plugin when in paint/height mode
        if ((state.tool === 'paint' || state.tool === 'height') && pos) {
            window.__topdown3dTerrainTools?.onMouseMove(e, pos);
        }

        // rubber-band selection rect
        if (isDragging && dragStart && state.tool === 'select') {
            const x0 = Math.min(dragStart.x, e.clientX - canvas.getBoundingClientRect().left);
            const y0 = Math.min(dragStart.y, e.clientY - canvas.getBoundingClientRect().top);
            const x1 = Math.max(dragStart.x, e.clientX - canvas.getBoundingClientRect().left);
            const y1 = Math.max(dragStart.y, e.clientY - canvas.getBoundingClientRect().top);
            selRectDiv.style.left   = x0 + 'px';
            selRectDiv.style.top    = y0 + 'px';
            selRectDiv.style.width  = (x1-x0) + 'px';
            selRectDiv.style.height = (y1-y0) + 'px';
            selRectDiv.style.display = 'block';
        }
    });

    canvas.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        dragStart  = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    });

    canvas.addEventListener('mouseup', e => {
        if (e.button !== 0) { isDragging = false; selRectDiv.style.display = 'none'; return; }
        const rect = canvas.getBoundingClientRect();
        const dx = Math.abs(e.clientX - rect.left - (dragStart?.x ?? 0));
        const dy = Math.abs(e.clientY - rect.top  - (dragStart?.y ?? 0));

        selRectDiv.style.display = 'none';
        isDragging = false;

        if (state.tool === 'select') {
            if (dx < 5 && dy < 5) {
                // single click pick
                const picked = pickObject(e);
                if (e.shiftKey && picked) {
                    state.selectedIds.add(picked);
                    setSelected([...state.selectedIds]);
                } else {
                    setSelected(picked ? [picked] : []);
                }
            }
            // box select handled by rubber-band rect; full implementation in Phase 22+
        } else if (state.tool === 'place') {
            const pos = groundPos(e);
            if (pos) placeObjectAt(pos);
        } else if (state.tool === 'paint' || state.tool === 'height') {
            const pos = groundPos(e);
            if (pos && window.__topdown3dTerrainTools) {
                window.__topdown3dTerrainTools.onCanvasClick(e, pos, state.tool);
            }
        } else if (state.tool === 'erase') {
            const picked = pickObject(e);
            if (picked) {
                const entry = sceneObjects.get(picked);
                if (entry) pushUndo({ type: 'DEL_OBJECT', data: JSON.parse(JSON.stringify(entry.data)) });
                removeSceneObject(picked);
                state.level.entities = state.level.entities.filter(ent => ent.id !== picked);
                markDirty();
            }
        }
    });

    canvas.addEventListener('mouseleave', () => {
        cursorMesh.visible = false;
        isDragging = false;
        selRectDiv.style.display = 'none';
    });

    // ── 41. KetebeEventBus integration ────────────────────────────────────────
    if (eventBus) {
        eventBus.on('project:loaded', ({ project }) => {
            state.projectName = project;
            document.getElementById('project-label').textContent = project;
        });
        eventBus.on('level:open', async ({ project, file }) => {
            await loadLevel(project, file);
        });
        eventBus.on('topdown3d:open-level', async ({ project, file }) => {
            await loadLevel(project, file);
        });
    }

    // ── 42. Register editor in launcher (if opened from launcher) ─────────────
    if (window.opener?.KetebeEventBus) {
        window.opener.KetebeEventBus.emit('editor:opened', {
            editorType: 'topdown3d',
            capabilities: ['level-editor', 'terrain', 'navmesh', 'entities', 'lights'],
        });
    }
    if (window.opener?.KetebeProjectState) {
        projectState = window.opener.KetebeProjectState;
        const pn = projectState.currentProject;
        if (pn) {
            state.projectName = pn;
            document.getElementById('project-label').textContent = pn;
        }
    }

    // ── 43. Initial state ─────────────────────────────────────────────────────
    updateHUD();
    setStatus('Ready. Open a level or create a new one (Ctrl+N).');
    document.getElementById('hud-level').textContent = '— new level —';

    // Populate settings panel from state
    document.getElementById('set-level-name').value  = state.level.name;
    document.getElementById('set-world-w').value      = state.level.worldW;
    document.getElementById('set-world-h').value      = state.level.worldH;
    document.getElementById('set-sky-color').value    = state.level.skyColor;
    document.getElementById('set-fog-color').value    = state.level.fogColor;
    document.getElementById('set-fog-near').value     = state.level.fogNear;
    document.getElementById('set-fog-far').value      = state.level.fogFar;
    document.getElementById('set-gravity').value      = state.level.physics.gravity[1];

    // Expose for debugging
    window.__topdown3dEditor = {
        state, scene, camera, renderer, THREE,
        saveLevel, loadLevel, newLevel, bakeNavMesh,
        applyLevelJSON, buildLevelJSON,
        addSceneObject, removeSceneObject,
        addSceneLight, removeSceneLight,
        getTerrainMesh: () => terrainMesh,
        groundPos,
        pushUndo, undo, redo,
        markDirty, setStatus,
        cursorMesh,
    };

})();
