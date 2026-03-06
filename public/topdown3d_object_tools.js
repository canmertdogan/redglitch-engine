/**
 * topdown3d_object_tools.js
 * Phase 23 — Object & Prop Placement Tools
 *
 * Requires: topdown3d_editor.js loaded first (window.__topdown3dEditor)
 *
 * Provides:
 *  - AssetBrowser    : fetches /api/assets3d/:project manifest, renders thumbnail grid
 *  - PropPlacer      : click-to-place GLTF/GLB + fallback primitive props
 *                      drag-to-reposition, Y-rotate handle, scale handle
 *  - ScatterBrush    : paint-mode foliage/rock scatter with density + randomness
 *  - ObjectInspector : JSON metadata editor per placed prop
 *  - SceneHierarchy  : group/ungroup support, scene tree list
 *  - ObjectToolsPlugin: top-level coordinator, UI wiring, undo/redo (50 ops)
 */

(function () {
    'use strict';

    // ── 1. Built-in primitive catalog (used when no assets3d folder / GLTF missing) ──
    const PRIMITIVE_CATALOG = [
        { id: 'box_sm',      label: 'BOX SM',    icon: 'fa-cube',            geo: () => ({ type: 'box', w: 1,   h: 1,   d: 1   }) },
        { id: 'box_md',      label: 'BOX MD',    icon: 'fa-cube',            geo: () => ({ type: 'box', w: 2,   h: 2,   d: 2   }) },
        { id: 'box_lg',      label: 'BOX LG',    icon: 'fa-cube',            geo: () => ({ type: 'box', w: 4,   h: 4,   d: 4   }) },
        { id: 'cyl_sm',      label: 'CYL SM',    icon: 'fa-circle',          geo: () => ({ type: 'cyl', r: 0.5, h: 1.5, segs: 6 }) },
        { id: 'cyl_md',      label: 'CYL MD',    icon: 'fa-circle',          geo: () => ({ type: 'cyl', r: 1,   h: 3,   segs: 6 }) },
        { id: 'cone',        label: 'CONE',      icon: 'fa-play',            geo: () => ({ type: 'cone', r: 1,  h: 3,   segs: 5 }) },
        { id: 'sphere_sm',   label: 'SPHERE',    icon: 'fa-circle',          geo: () => ({ type: 'sphere', r: 0.8, segs: 5 }) },
        { id: 'tree_lp',     label: 'TREE',      icon: 'fa-tree',            geo: () => ({ type: 'tree' }) },
        { id: 'rock_sm',     label: 'ROCK SM',   icon: 'fa-mountain',        geo: () => ({ type: 'rock', scale: 0.6 }) },
        { id: 'rock_md',     label: 'ROCK MD',   icon: 'fa-mountain',        geo: () => ({ type: 'rock', scale: 1.2 }) },
        { id: 'barrel',      label: 'BARREL',    icon: 'fa-circle',          geo: () => ({ type: 'cyl', r: 0.4, h: 0.9, segs: 8 }) },
        { id: 'wall_1x2',    label: 'WALL',      icon: 'fa-border-none',     geo: () => ({ type: 'box', w: 2,   h: 3,   d: 0.25 }) },
    ];

    // ── 2. Geometry builder (returns THREE.Mesh for primitive catalog entries) ──
    function buildPrimitiveMesh(THREE, geoSpec, color = '#795548') {
        let geo;
        switch (geoSpec.type) {
            case 'box':
                geo = new THREE.BoxGeometry(geoSpec.w, geoSpec.h, geoSpec.d);
                break;
            case 'cyl':
                geo = new THREE.CylinderGeometry(geoSpec.r, geoSpec.r, geoSpec.h, geoSpec.segs ?? 6);
                break;
            case 'cone':
                geo = new THREE.ConeGeometry(geoSpec.r, geoSpec.h, geoSpec.segs ?? 5);
                break;
            case 'sphere':
                geo = new THREE.SphereGeometry(geoSpec.r, geoSpec.segs ?? 5, geoSpec.segs ?? 4);
                break;
            case 'tree': {
                // Two-mesh group: trunk cylinder + crown cone
                const group = new THREE.Group();
                const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.5, 5);
                const crownGeo = new THREE.ConeGeometry(1.0, 2.5, 5);
                const trunkMat = new THREE.MeshPhongMaterial({ color: 0x5d4037, flatShading: true });
                const crownMat = new THREE.MeshPhongMaterial({ color: 0x2e7d32, flatShading: true });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                const crown = new THREE.Mesh(crownGeo, crownMat);
                trunk.position.y = 0.75;
                crown.position.y = 2.75;
                group.add(trunk);
                group.add(crown);
                return group;
            }
            case 'rock': {
                // Icosahedron with vertex noise for organic look
                const sc = geoSpec.scale ?? 1;
                geo = new THREE.IcosahedronGeometry(sc, 0);
                // Displace vertices for rock-like shape
                const posArr = geo.attributes.position;
                for (let i = 0; i < posArr.count; i++) {
                    posArr.setXYZ(i,
                        posArr.getX(i) * (0.75 + Math.random() * 0.5),
                        posArr.getY(i) * (0.5 + Math.random() * 0.6),
                        posArr.getZ(i) * (0.75 + Math.random() * 0.5)
                    );
                }
                geo.computeVertexNormals();
                break;
            }
            default:
                geo = new THREE.BoxGeometry(1, 1, 1);
        }
        const mat = new THREE.MeshPhongMaterial({ color: new THREE.Color(color), flatShading: true });
        return new THREE.Mesh(geo, mat);
    }

    // ── 3. AssetBrowser ───────────────────────────────────────────────────────
    class AssetBrowser {
        constructor(containerEl, onSelect) {
            this._el        = containerEl;
            this._onSelect  = onSelect;
            this._manifest  = null;
            this._selected  = null;
            this._filter    = '';
        }

        async load(projectName) {
            if (!projectName) {
                this._renderPrimitives();
                return;
            }
            try {
                const res = await fetch(`/api/assets3d/${encodeURIComponent(projectName)}`);
                if (res.ok) {
                    this._manifest = await res.json();
                } else {
                    this._manifest = null;
                }
            } catch (_) {
                this._manifest = null;
            }
            this._render();
        }

        _render() {
            this._el.innerHTML = '';
            // Search bar
            const search = document.createElement('input');
            search.type = 'text';
            search.placeholder = 'Filter assets…';
            search.value = this._filter;
            search.style.cssText = 'width:100%;background:#000;border:1px solid #333;color:#e0e0ef;padding:4px 6px;font-family:inherit;font-size:.9rem;margin-bottom:6px;border-radius:2px';
            search.addEventListener('input', e => { this._filter = e.target.value; this._render(); });
            this._el.appendChild(search);

            // GLTF section
            const gltfList = (this._manifest?.gltf ?? []).filter(n =>
                !this._filter || n.toLowerCase().includes(this._filter.toLowerCase())
            );
            if (gltfList.length) {
                this._addSectionHeader('GLTF / GLB');
                const grid = this._makeGrid();
                for (const name of gltfList) {
                    grid.appendChild(this._makeCard({
                        id:    `gltf:${name}`,
                        label: name.replace(/\.[^.]+$/, ''),
                        icon:  'fa-cube',
                        src:   `gltf`,
                        raw:   name,
                    }));
                }
                this._el.appendChild(grid);
            }

            // Vox section
            const voxList = (this._manifest?.vox ?? []).filter(n =>
                !this._filter || n.toLowerCase().includes(this._filter.toLowerCase())
            );
            if (voxList.length) {
                this._addSectionHeader('VOXEL (.vox)');
                const grid = this._makeGrid();
                for (const name of voxList) {
                    grid.appendChild(this._makeCard({
                        id:    `vox:${name}`,
                        label: name.replace(/\.[^.]+$/, ''),
                        icon:  'fa-cube',
                        src:   'vox',
                        raw:   name,
                    }));
                }
                this._el.appendChild(grid);
            }

            // Primitives section (always shown)
            this._renderPrimitives();
        }

        _renderPrimitives() {
            const filter = this._filter.toLowerCase();
            const prims  = PRIMITIVE_CATALOG.filter(p => !filter || p.label.toLowerCase().includes(filter));
            if (!prims.length) return;
            this._addSectionHeader('PRIMITIVES');
            const grid = this._makeGrid();
            for (const p of prims) {
                grid.appendChild(this._makeCard({
                    id:    `prim:${p.id}`,
                    label: p.label,
                    icon:  p.icon,
                    src:   'prim',
                    raw:   p.id,
                }));
            }
            this._el.appendChild(grid);
        }

        _addSectionHeader(text) {
            const h = document.createElement('div');
            h.className = 'section-header';
            h.textContent = text;
            this._el.appendChild(h);
        }

        _makeGrid() {
            const g = document.createElement('div');
            g.className = 'asset-thumb-grid';
            return g;
        }

        _makeCard(item) {
            const div = document.createElement('div');
            div.className = 'asset-thumb-card' + (this._selected === item.id ? ' selected' : '');
            div.dataset.assetId = item.id;
            div.innerHTML = `<i class="fa ${item.icon}"></i><span>${item.label}</span>`;
            div.title = item.label;
            div.addEventListener('click', () => {
                document.querySelectorAll('.asset-thumb-card').forEach(c => c.classList.remove('selected'));
                div.classList.add('selected');
                this._selected = item.id;
                this._onSelect(item);
            });
            return div;
        }

        getSelected() { return this._selected; }
        refresh(projectName) { return this.load(projectName); }
    }

    // ── 4. PropPlacer ─────────────────────────────────────────────────────────
    class PropPlacer {
        /**
         * @param {object} THREE
         * @param {THREE.Scene} scene
         * @param {THREE.Camera} camera
         */
        constructor(THREE, scene, camera) {
            this._THREE  = THREE;
            this._scene  = scene;
            this._camera = camera;

            // Registry: propId → { mesh|group, data }
            this._props  = new Map();
            this._group  = new THREE.Group();
            this._group.name = 'prop_layer';
            scene.add(this._group);

            // Transform gizmo state
            this._selectedPropId = null;
            this._gizmo          = null;     // gizmo group in scene
            this._dragging       = false;
            this._dragMode       = null;     // 'move' | 'rotate' | 'scale'
            this._dragStart      = null;
            this._dragWorldStart = null;

            // Ghost preview mesh (shown while hovering before placement)
            this._ghost = null;

            // Raycaster for prop picking
            this._raycaster = new THREE.Raycaster();
            this._mouse     = new THREE.Vector2();

            // Shared plane for drag interaction
            this._dragPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            this._planeIntersect = new THREE.Vector3();

            this._propIdx = 0;
        }

        // ── Place a prop at worldPos using given asset descriptor ─────────────
        placeProp(worldPos, assetItem, meta = {}) {
            const THREE = this._THREE;
            const id    = `prop_${assetItem.raw ?? assetItem.id}_${this._propIdx++}`;

            let obj;
            if (assetItem.src === 'prim') {
                const spec = PRIMITIVE_CATALOG.find(p => p.id === assetItem.raw);
                obj = spec
                    ? buildPrimitiveMesh(THREE, spec.geo(), meta.color ?? '#795548')
                    : buildPrimitiveMesh(THREE, { type: 'box', w: 1, h: 1, d: 1 });
            } else {
                // GLTF/vox — use a placeholder box until async load completes
                obj = buildPrimitiveMesh(THREE, { type: 'box', w: 1, h: 1, d: 1 }, '#546e7a');
                obj.userData.loadPending = { src: assetItem.src, raw: assetItem.raw };
            }

            const snapY = worldPos.y ?? 0;
            obj.position.set(worldPos.x, snapY, worldPos.z);
            obj.userData.propId   = id;
            obj.userData.assetId  = assetItem.id;
            obj.userData.isProp   = true;

            this._group.add(obj);

            const data = {
                id, assetId: assetItem.id, src: assetItem.src, raw: assetItem.raw,
                position:  [worldPos.x, snapY, worldPos.z],
                rotation:  [0, 0, 0],
                scale:     [1, 1, 1],
                meta:      { ...meta },
                group:     null,
            };
            this._props.set(id, { obj, data });
            return { id, obj, data };
        }

        // ── Remove a prop ─────────────────────────────────────────────────────
        removeProp(propId) {
            const entry = this._props.get(propId);
            if (!entry) return null;
            this._group.remove(entry.obj);
            this._props.delete(propId);
            if (this._selectedPropId === propId) this._clearGizmo();
            return entry.data;
        }

        // ── Select + show transform gizmo ─────────────────────────────────────
        select(propId) {
            this._clearGizmo();
            if (!propId) { this._selectedPropId = null; return; }
            const entry = this._props.get(propId);
            if (!entry) { this._selectedPropId = null; return; }
            this._selectedPropId = propId;
            this._buildGizmo(entry.obj);
        }

        _buildGizmo(obj) {
            const THREE = this._THREE;
            this._clearGizmo();

            const gizmo = new THREE.Group();
            gizmo.name  = 'prop_gizmo';

            // Bounding box helper
            const bbox = new THREE.BoxHelper(obj, 0x4fc3f7);
            gizmo.add(bbox);

            // Rotate ring (flat torus at base)
            const rotRing = new THREE.Mesh(
                new THREE.TorusGeometry(1.2, 0.06, 6, 24),
                new THREE.MeshBasicMaterial({ color: 0xffcc00 })
            );
            rotRing.rotation.x = Math.PI / 2;
            rotRing.userData.gizmoHandle = 'rotate';
            gizmo.add(rotRing);

            // Scale cube (top)
            const scaleCube = new THREE.Mesh(
                new THREE.BoxGeometry(0.25, 0.25, 0.25),
                new THREE.MeshBasicMaterial({ color: 0x4caf50 })
            );
            scaleCube.position.y = 1.8;
            scaleCube.userData.gizmoHandle = 'scale';
            gizmo.add(scaleCube);

            gizmo.position.copy(obj.position);
            this._scene.add(gizmo);
            this._gizmo = gizmo;
        }

        _clearGizmo() {
            if (this._gizmo) {
                this._scene.remove(this._gizmo);
                this._gizmo = null;
            }
        }

        // ── Show ghost preview at worldPos ────────────────────────────────────
        showGhost(worldPos, assetItem) {
            if (!assetItem) { this._hideGhost(); return; }
            const THREE = this._THREE;
            if (!this._ghost) {
                const spec = PRIMITIVE_CATALOG.find(p => p.id === (assetItem.raw ?? '')) ?? { geo: () => ({ type: 'box', w: 1, h: 1, d: 1 }) };
                this._ghost = buildPrimitiveMesh(THREE, spec.geo(), '#4fc3f7');
                // Make ghost semi-transparent
                const setOpacity = obj => {
                    if (obj.material) { obj.material.transparent = true; obj.material.opacity = 0.5; }
                    obj.children?.forEach(setOpacity);
                };
                setOpacity(this._ghost);
                this._scene.add(this._ghost);
            }
            this._ghost.position.set(worldPos.x, worldPos.y, worldPos.z);
        }

        _hideGhost() {
            if (this._ghost) { this._scene.remove(this._ghost); this._ghost = null; }
        }

        // ── Pick prop from screen coords ──────────────────────────────────────
        pickProp(event, canvas) {
            const rect = canvas.getBoundingClientRect();
            this._mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
            this._mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
            this._raycaster.setFromCamera(this._mouse, this._camera);

            const objs = [...this._props.values()].map(e => e.obj);
            const hits  = this._raycaster.intersectObjects(objs, true);
            if (!hits.length) return null;
            // Traverse up to find the prop root
            let obj = hits[0].object;
            while (obj && !obj.userData.propId && obj.parent !== this._group) {
                obj = obj.parent;
            }
            return obj?.userData.propId ?? null;
        }

        // ── Pick gizmo handle from screen coords ──────────────────────────────
        pickGizmoHandle(event, canvas) {
            if (!this._gizmo) return null;
            const rect = canvas.getBoundingClientRect();
            this._mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
            this._mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
            this._raycaster.setFromCamera(this._mouse, this._camera);
            const hits = this._raycaster.intersectObjects(this._gizmo.children, true);
            for (const h of hits) {
                let obj = h.object;
                while (obj && !obj.userData.gizmoHandle) obj = obj.parent;
                if (obj?.userData.gizmoHandle) return obj.userData.gizmoHandle;
            }
            return null;
        }

        // ── Start drag (move, rotate, scale) ──────────────────────────────────
        startDrag(mode, event, canvas) {
            this._dragging = true;
            this._dragMode = mode;
            const rect = canvas.getBoundingClientRect();
            this._dragStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            // Compute world drag start point on Y-plane
            this._mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
            this._mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
            this._raycaster.setFromCamera(this._mouse, this._camera);
            this._raycaster.ray.intersectPlane(this._dragPlane, this._planeIntersect);
            this._dragWorldStart = this._planeIntersect.clone();
            const entry = this._props.get(this._selectedPropId);
            if (entry) {
                this._dragInitPos    = entry.obj.position.clone();
                this._dragInitRotY   = entry.obj.rotation.y;
                this._dragInitScale  = entry.obj.scale.clone();
            }
        }

        updateDrag(event, canvas) {
            if (!this._dragging || !this._selectedPropId) return;
            const entry = this._props.get(this._selectedPropId);
            if (!entry) return;
            const rect = canvas.getBoundingClientRect();
            this._mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
            this._mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
            this._raycaster.setFromCamera(this._mouse, this._camera);

            if (this._dragMode === 'move') {
                this._raycaster.ray.intersectPlane(this._dragPlane, this._planeIntersect);
                const delta = this._planeIntersect.clone().sub(this._dragWorldStart);
                entry.obj.position.copy(this._dragInitPos).add(delta);
                if (this._gizmo) this._gizmo.position.copy(entry.obj.position);
            } else if (this._dragMode === 'rotate') {
                const dx = event.clientX - rect.left - this._dragStart.x;
                entry.obj.rotation.y = this._dragInitRotY + dx * 0.01;
            } else if (this._dragMode === 'scale') {
                const dy = event.clientY - rect.top - this._dragStart.y;
                const s  = Math.max(0.1, 1 - dy * 0.005);
                entry.obj.scale.copy(this._dragInitScale).multiplyScalar(s);
            }
        }

        endDrag() {
            if (!this._dragging || !this._selectedPropId) {
                this._dragging = false;
                return null;
            }
            this._dragging = false;
            const entry = this._props.get(this._selectedPropId);
            if (!entry) return null;
            const obj  = entry.obj;
            const data = entry.data;
            const prevPos   = [...data.position];
            const prevRot   = [...data.rotation];
            const prevScale = [...data.scale];

            data.position = [obj.position.x, obj.position.y, obj.position.z];
            data.rotation = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
            data.scale    = [obj.scale.x,    obj.scale.y,    obj.scale.z];

            return {
                id: this._selectedPropId,
                prevPos, prevRot, prevScale,
                nextPos: [...data.position], nextRot: [...data.rotation], nextScale: [...data.scale],
            };
        }

        isDragging() { return this._dragging; }

        // ── Update prop transform (undo/redo) ─────────────────────────────────
        applyTransform(propId, pos, rot, scale) {
            const entry = this._props.get(propId);
            if (!entry) return;
            entry.obj.position.set(...pos);
            entry.obj.rotation.set(...rot);
            entry.obj.scale.set(...scale);
            entry.data.position = [...pos];
            entry.data.rotation = [...rot];
            entry.data.scale    = [...scale];
            if (this._gizmo && this._selectedPropId === propId) {
                this._gizmo.position.copy(entry.obj.position);
            }
        }

        // ── Group/ungroup ─────────────────────────────────────────────────────
        groupProps(propIds, groupName) {
            const group = { id: groupName, members: [...propIds] };
            for (const pid of propIds) {
                const entry = this._props.get(pid);
                if (entry) entry.data.group = groupName;
            }
            return group;
        }

        ungroupProps(propIds) {
            for (const pid of propIds) {
                const entry = this._props.get(pid);
                if (entry) entry.data.group = null;
            }
        }

        // ── Serialize / Deserialize ────────────────────────────────────────────
        serialize() {
            const props = [];
            for (const [id, { data }] of this._props) {
                props.push({ ...data });
            }
            return props;
        }

        deserialize(props, THREE) {
            for (const pid of [...this._props.keys()]) this.removeProp(pid);
            for (const data of (props ?? [])) {
                const assetItem = { id: data.assetId, src: data.src, raw: data.raw };
                const pos = { x: data.position[0], y: data.position[1], z: data.position[2] };
                const { id, obj } = this.placeProp(pos, assetItem, data.meta ?? {});
                obj.rotation.set(...(data.rotation ?? [0, 0, 0]));
                obj.scale.set(...(data.scale ?? [1, 1, 1]));
                this._props.get(id).data.group = data.group ?? null;
                // Remap to correct ID
                this._props.delete(id);
                obj.userData.propId = data.id;
                this._props.set(data.id, { obj, data: { ...data } });
            }
        }

        getAllProps() { return [...this._props.values()].map(e => e.data); }
        getPropById(id) { return this._props.get(id)?.data ?? null; }

        dispose() {
            this._scene.remove(this._group);
            this._clearGizmo();
            if (this._ghost) this._scene.remove(this._ghost);
        }
    }

    // ── 5. ScatterBrush ───────────────────────────────────────────────────────
    class ScatterBrush {
        constructor(THREE, placer) {
            this._THREE   = THREE;
            this._placer  = placer;
            this.radius   = 5;
            this.density  = 0.3;   // 0-1: probability per grid cell
            this.randomR  = 0.5;   // 0-1: randomness in position within cell
            this.scaleMin = 0.7;
            this.scaleMax = 1.3;
            this.rotRand  = true;   // random Y rotation
        }

        /**
         * Scatter props in a circle around worldPos.
         * @param {THREE.Vector3} worldPos
         * @param {object} assetItem  asset descriptor from AssetBrowser
         * @returns {Array} placed prop IDs for undo
         */
        scatter(worldPos, assetItem) {
            if (!assetItem) return [];
            const placed = [];
            const r = this.radius;
            const step = 1; // grid cell size = 1 world unit
            for (let dx = -r; dx <= r; dx += step) {
                for (let dz = -r; dz <= r; dz += step) {
                    if (dx*dx + dz*dz > r*r) continue;          // circle clamp
                    if (Math.random() > this.density) continue;  // density cull
                    const jx = dx + (Math.random() - 0.5) * this.randomR * 2;
                    const jz = dz + (Math.random() - 0.5) * this.randomR * 2;
                    const pos = { x: worldPos.x + jx, y: worldPos.y, z: worldPos.z + jz };
                    const sc  = this.scaleMin + Math.random() * (this.scaleMax - this.scaleMin);
                    const ry  = this.rotRand ? Math.random() * Math.PI * 2 : 0;
                    const { id, obj } = this._placer.placeProp(pos, assetItem, {});
                    obj.scale.set(sc, sc, sc);
                    obj.rotation.y = ry;
                    placed.push(id);
                }
            }
            return placed;
        }

        /** Remove all props placed in a scatter (for undo) */
        eraseAt(worldPos) {
            const erased = [];
            const r2 = this.radius * this.radius;
            for (const data of this._placer.getAllProps()) {
                const dx = data.position[0] - worldPos.x;
                const dz = data.position[2] - worldPos.z;
                if (dx*dx + dz*dz <= r2) {
                    this._placer.removeProp(data.id);
                    erased.push(data);
                }
            }
            return erased;
        }
    }

    // ── 6. ObjectInspector ───────────────────────────────────────────────────
    class ObjectInspector {
        constructor(containerEl) {
            this._el  = containerEl;
            this._pid = null;
        }

        show(propData, onUpdate) {
            if (!propData) { this.clear(); return; }
            this._pid = propData.id;
            this._el.innerHTML = '';

            const add = (label, value, type = 'text', onChange) => {
                const row = document.createElement('div');
                row.className = 'prop-row';
                row.innerHTML = `<label>${label}</label>`;
                const inp = document.createElement('input');
                inp.type  = type;
                inp.value = value ?? '';
                inp.style.flex = '1';
                inp.style.cssText += ';background:#000;border:1px solid #2a2a3a;color:#e0e0ef;padding:2px 5px;font-family:inherit;font-size:.9rem;border-radius:2px';
                if (onChange) inp.addEventListener('change', () => onChange(inp.value));
                row.appendChild(inp);
                this._el.appendChild(row);
                return inp;
            };

            const addHeader = text => {
                const h = document.createElement('div');
                h.className = 'prop-group-title';
                h.textContent = text;
                this._el.appendChild(h);
            };

            addHeader('IDENTITY');
            add('ID',     propData.id,       'text');
            add('ASSET',  propData.assetId,   'text');
            add('GROUP',  propData.group ?? '', 'text', v => { propData.group = v || null; onUpdate?.(); });

            addHeader('TRANSFORM');
            ['X','Y','Z'].forEach((axis, i) => {
                add(axis, propData.position[i]?.toFixed(2), 'number', v => {
                    propData.position[i] = parseFloat(v) || 0;
                    onUpdate?.();
                });
            });
            const rotDeg = propData.rotation.map(r => ((r * 180 / Math.PI) % 360).toFixed(1));
            ['RX','RY','RZ'].forEach((axis, i) => {
                add(axis + '°', rotDeg[i], 'number', v => {
                    propData.rotation[i] = parseFloat(v) * Math.PI / 180 || 0;
                    onUpdate?.();
                });
            });
            ['SX','SY','SZ'].forEach((axis, i) => {
                add(axis, propData.scale[i]?.toFixed(2), 'number', v => {
                    propData.scale[i] = parseFloat(v) || 1;
                    onUpdate?.();
                });
            });

            addHeader('METADATA');
            const metaStr = JSON.stringify(propData.meta ?? {}, null, 2);
            const metaArea = document.createElement('textarea');
            metaArea.value = metaStr;
            metaArea.style.cssText = 'width:100%;height:80px;background:#000;border:1px solid #2a2a3a;color:#e0e0ef;padding:4px;font-family:monospace;font-size:.75rem;resize:vertical;border-radius:2px';
            metaArea.addEventListener('change', () => {
                try {
                    propData.meta = JSON.parse(metaArea.value);
                    onUpdate?.();
                } catch (_) {
                    metaArea.style.borderColor = '#f44336';
                }
                metaArea.style.borderColor = '';
            });
            this._el.appendChild(metaArea);
        }

        clear() {
            this._el.innerHTML = '<div style="color:#444;font-size:.9rem;padding:12px 6px;text-align:center">Select a prop to inspect.</div>';
            this._pid = null;
        }
    }

    // ── 7. ObjectToolsPlugin ──────────────────────────────────────────────────
    class ObjectToolsPlugin {
        constructor(ed) {
            this._ed      = ed;
            this._THREE   = ed.THREE;
            this._state   = ed.state;
            this._scene   = ed.scene;
            this._camera  = ed.camera;

            this._currentAsset = null;  // selected in browser
            this._scatterMode  = false;
            this._canvas       = document.getElementById('three-canvas');

            // History (50 ops)
            this._history  = [];
            this._histIdx  = -1;
            this._MAX_HIST = 50;

            // Core systems
            this.browser   = null; // AssetBrowser — lazy init in _buildUI
            this.placer    = new PropPlacer(this._THREE, this._scene, this._camera);
            this.scatter   = new ScatterBrush(this._THREE, this.placer);
            this.inspector = null; // ObjectInspector — lazy init

            this._buildUI();
            this._bindKeys();
        }

        // ── 7a. Panel UI ──────────────────────────────────────────────────────
        _buildUI() {
            const panel = document.getElementById('panel-objects');
            if (!panel) return;

            panel.innerHTML = `
                <div class="section-header">ASSET BROWSER
                    <span id="obj-refresh-btn" style="float:right;font-size:.75rem;color:#555;cursor:pointer">↻ REFRESH</span>
                </div>
                <div id="asset-browser-container" style="overflow-y:auto;max-height:220px;margin-bottom:6px"></div>

                <div class="section-header">PLACEMENT MODE</div>
                <div class="terrain-mode-row" style="margin-bottom:6px">
                    <div class="terrain-mode-btn active" id="pmode-single" data-pmode="single">SINGLE</div>
                    <div class="terrain-mode-btn"         id="pmode-scatter" data-pmode="scatter">SCATTER</div>
                </div>

                <div id="scatter-controls" style="display:none">
                    <div class="section-header">SCATTER BRUSH</div>
                    <div class="field-row"><label>RADIUS</label>
                        <input type="range" id="sc-radius" min="1" max="20" value="5">
                        <span id="sc-radius-val" style="min-width:20px;text-align:right;color:var(--accent)">5</span>
                    </div>
                    <div class="field-row"><label>DENSITY</label>
                        <input type="range" id="sc-density" min="1" max="100" value="30">
                        <span id="sc-density-val" style="min-width:20px;text-align:right;color:var(--accent)">0.30</span>
                    </div>
                    <div class="field-row"><label>RNDM</label>
                        <input type="range" id="sc-rnd" min="0" max="100" value="50">
                        <span id="sc-rnd-val" style="min-width:20px;text-align:right;color:var(--accent)">0.50</span>
                    </div>
                    <div class="field-row"><label>SC MIN</label>
                        <input type="number" id="sc-smin" value="0.7" step="0.1" min="0.1" style="flex:1">
                        <label style="margin-left:8px">MAX</label>
                        <input type="number" id="sc-smax" value="1.3" step="0.1" min="0.1" style="flex:1">
                    </div>
                    <div class="field-row"><label>ROT RND</label>
                        <input type="checkbox" id="sc-rotrand" checked style="width:16px;height:16px">
                    </div>
                </div>

                <div class="section-header">SCENE OBJECTS</div>
                <div id="scene-obj-list">
                    <div style="color:#444;font-size:.85rem;padding:8px 0">No objects placed yet.</div>
                </div>

                <div style="display:flex;gap:6px;margin-top:8px">
                    <button class="btn" id="obj-group-btn"   style="flex:1;font-size:.8rem">GROUP</button>
                    <button class="btn" id="obj-ungroup-btn" style="flex:1;font-size:.8rem">UNGROUP</button>
                    <button class="btn" id="obj-del-btn"     style="flex:1;font-size:.8rem;color:#f44336">DEL</button>
                </div>`;

            // Asset browser
            const browserContainer = document.getElementById('asset-browser-container');
            this.browser = new AssetBrowser(browserContainer, item => {
                this._currentAsset = item;
            });
            this.browser.load(this._state.projectName);

            // Inspector (right sidebar)
            const propsBody = document.getElementById('props-body');
            if (propsBody) {
                this.inspector = new ObjectInspector(propsBody);
                this.inspector.clear();
            }

            // Refresh button
            document.getElementById('obj-refresh-btn')?.addEventListener('click', () => {
                this.browser.load(this._state.projectName);
            });

            // Placement mode toggle
            document.querySelectorAll('[data-pmode]').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('[data-pmode]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this._scatterMode = btn.dataset.pmode === 'scatter';
                    document.getElementById('scatter-controls').style.display =
                        this._scatterMode ? '' : 'none';
                });
            });

            // Scatter sliders
            document.getElementById('sc-radius')?.addEventListener('input', e => {
                this.scatter.radius = parseInt(e.target.value, 10);
                document.getElementById('sc-radius-val').textContent = this.scatter.radius;
            });
            document.getElementById('sc-density')?.addEventListener('input', e => {
                this.scatter.density = parseInt(e.target.value, 10) / 100;
                document.getElementById('sc-density-val').textContent = this.scatter.density.toFixed(2);
            });
            document.getElementById('sc-rnd')?.addEventListener('input', e => {
                this.scatter.randomR = parseInt(e.target.value, 10) / 100;
                document.getElementById('sc-rnd-val').textContent = this.scatter.randomR.toFixed(2);
            });
            document.getElementById('sc-smin')?.addEventListener('change', e => {
                this.scatter.scaleMin = parseFloat(e.target.value) || 0.7;
            });
            document.getElementById('sc-smax')?.addEventListener('change', e => {
                this.scatter.scaleMax = parseFloat(e.target.value) || 1.3;
            });
            document.getElementById('sc-rotrand')?.addEventListener('change', e => {
                this.scatter.rotRand = e.target.checked;
            });

            // Group / Ungroup / Delete
            document.getElementById('obj-group-btn')?.addEventListener('click', () => this._groupSelected());
            document.getElementById('obj-ungroup-btn')?.addEventListener('click', () => this._ungroupSelected());
            document.getElementById('obj-del-btn')?.addEventListener('click', () => this._deleteSelected());
        }

        // ── 7b. Mouse events (called by editor) ───────────────────────────────
        onMouseMove(event, worldPos) {
            // Show ghost preview in 'place' tool
            if (this._ed.state.tool === 'place' && this._currentAsset) {
                this.placer.showGhost(worldPos, this._currentAsset);
            }
            // Update drag if active
            if (this.placer.isDragging()) {
                this.placer.updateDrag(event, this._canvas);
            }
        }

        onCanvasMouseDown(event, worldPos) {
            if (this._ed.state.tool !== 'select') return;
            // Try gizmo handle first
            const handle = this.placer.pickGizmoHandle(event, this._canvas);
            if (handle) {
                this.placer.startDrag(handle, event, this._canvas);
                return;
            }
            // Pick prop
            const pid = this.placer.pickProp(event, this._canvas);
            if (pid) {
                this.placer.startDrag('move', event, this._canvas);
            }
        }

        onCanvasMouseUp(event, worldPos, tool) {
            // End drag if active
            if (this.placer.isDragging()) {
                const delta = this.placer.endDrag();
                if (delta) {
                    this._push({ type: 'PROP_TRANSFORM', delta });
                    this._ed.markDirty();
                    this._syncLevelProps();
                }
                return;
            }

            if (tool === 'place') {
                if (!this._currentAsset) {
                    this._ed.setStatus('Select an asset in the Objects panel first.', true);
                    return;
                }
                if (this._scatterMode) {
                    const ids = this.scatter.scatter(worldPos, this._currentAsset);
                    if (ids.length) {
                        this._push({ type: 'SCATTER_PLACE', ids });
                        this._ed.markDirty();
                        this._syncLevelProps();
                        this._refreshObjList();
                    }
                } else {
                    const { id, data } = this.placer.placeProp(worldPos, this._currentAsset);
                    this._push({ type: 'PROP_PLACE', id, data: { ...data } });
                    this._ed.markDirty();
                    this._syncLevelProps();
                    this._refreshObjList();
                    this._selectProp(id);
                }
            } else if (tool === 'erase') {
                if (this._scatterMode) {
                    const erased = this.scatter.eraseAt(worldPos);
                    if (erased.length) {
                        this._push({ type: 'SCATTER_ERASE', erased });
                        this._ed.markDirty();
                        this._syncLevelProps();
                        this._refreshObjList();
                    }
                } else {
                    const pid = this.placer.pickProp(event, this._canvas);
                    if (pid) {
                        const data = this.placer.removeProp(pid);
                        if (data) {
                            this._push({ type: 'PROP_REMOVE', data: { ...data } });
                            this._ed.markDirty();
                            this._syncLevelProps();
                            this._refreshObjList();
                        }
                    }
                }
            } else if (tool === 'select') {
                const pid = this.placer.pickProp(event, this._canvas);
                this._selectProp(pid);
            }
        }

        // ── 7c. Selection + inspector ─────────────────────────────────────────
        _selectProp(pid) {
            this.placer.select(pid);
            const data = pid ? this.placer.getPropById(pid) : null;
            if (this.inspector) {
                this.inspector.show(data, () => {
                    if (data) {
                        this.placer.applyTransform(data.id, data.position, data.rotation, data.scale);
                        this._ed.markDirty();
                        this._syncLevelProps();
                    }
                });
            }
            this._refreshObjList();
        }

        // ── 7d. Scene hierarchy list ──────────────────────────────────────────
        _refreshObjList() {
            const ul = document.getElementById('scene-obj-list');
            if (!ul) return;
            const props = this.placer.getAllProps();
            if (!props.length) {
                ul.innerHTML = '<div style="color:#444;font-size:.85rem;padding:8px 0">No objects placed yet.</div>';
                return;
            }

            // Group by group name
            const groups   = {};
            const noGroup  = [];
            for (const p of props) {
                if (p.group) (groups[p.group] = groups[p.group] ?? []).push(p);
                else noGroup.push(p);
            }

            ul.innerHTML = '';
            const makeItem = (p, indent = 0) => {
                const div = document.createElement('div');
                div.className = 'obj-item';
                div.style.paddingLeft = (6 + indent * 12) + 'px';
                div.innerHTML = `
                    <span class="obj-icon"><i class="fa fa-cube"></i></span>
                    <span class="obj-name">${p.id}</span>
                    <span class="obj-team" style="font-size:.7rem;color:#555">${p.src ?? ''}</span>
                    <span class="obj-icon" style="cursor:pointer;color:#c0392b" data-del-prop="${p.id}"><i class="fa fa-times"></i></span>`;
                div.addEventListener('click', e => {
                    if (e.target.closest('[data-del-prop]')) return;
                    this._selectProp(p.id);
                });
                div.querySelector('[data-del-prop]')?.addEventListener('click', e => {
                    e.stopPropagation();
                    const data = this.placer.removeProp(p.id);
                    if (data) {
                        this._push({ type: 'PROP_REMOVE', data });
                        this._ed.markDirty();
                        this._syncLevelProps();
                        this._refreshObjList();
                    }
                });
                ul.appendChild(div);
            };

            // Grouped
            for (const [gname, gprops] of Object.entries(groups)) {
                const header = document.createElement('div');
                header.style.cssText = 'padding:4px 6px;color:#4fc3f7;font-size:.8rem;letter-spacing:1px;border-bottom:1px solid #1a1a2a';
                header.innerHTML = `<i class="fa fa-folder"></i> ${gname}`;
                ul.appendChild(header);
                gprops.forEach(p => makeItem(p, 1));
            }
            for (const p of noGroup) makeItem(p, 0);
        }

        // ── 7e. Group / Ungroup ───────────────────────────────────────────────
        _groupSelected() {
            const sel = this.placer._selectedPropId;
            if (!sel) { this._ed.setStatus('Select props to group.', true); return; }
            const name = `group_${Date.now()}`;
            this.placer.groupProps([sel], name);
            this._refreshObjList();
            this._ed.markDirty();
        }

        _ungroupSelected() {
            const sel = this.placer._selectedPropId;
            if (!sel) return;
            this.placer.ungroupProps([sel]);
            this._refreshObjList();
            this._ed.markDirty();
        }

        _deleteSelected() {
            const sel = this.placer._selectedPropId;
            if (!sel) return;
            const data = this.placer.removeProp(sel);
            if (data) {
                this._push({ type: 'PROP_REMOVE', data });
                this._ed.markDirty();
                this._syncLevelProps();
                this._refreshObjList();
            }
        }

        // ── 7f. Undo/redo ─────────────────────────────────────────────────────
        _push(op) {
            if (this._histIdx < this._history.length - 1) {
                this._history.splice(this._histIdx + 1);
            }
            this._history.push(op);
            if (this._history.length > this._MAX_HIST) this._history.shift();
            else this._histIdx++;
        }

        undoProps() {
            if (this._histIdx < 0) return false;
            const op = this._history[this._histIdx--];
            if (op.type === 'PROP_PLACE') {
                this.placer.removeProp(op.id);
                this._refreshObjList();
            } else if (op.type === 'PROP_REMOVE') {
                const assetItem = { id: op.data.assetId, src: op.data.src, raw: op.data.raw };
                const pos = { x: op.data.position[0], y: op.data.position[1], z: op.data.position[2] };
                const { obj } = this.placer.placeProp(pos, assetItem, op.data.meta ?? {});
                obj.rotation.set(...(op.data.rotation ?? [0,0,0]));
                obj.scale.set(...(op.data.scale ?? [1,1,1]));
                this._refreshObjList();
            } else if (op.type === 'PROP_TRANSFORM') {
                const d = op.delta;
                this.placer.applyTransform(d.id, d.prevPos, d.prevRot, d.prevScale);
            } else if (op.type === 'SCATTER_PLACE') {
                for (const id of op.ids) this.placer.removeProp(id);
                this._refreshObjList();
            } else if (op.type === 'SCATTER_ERASE') {
                for (const data of op.erased) {
                    const ai  = { id: data.assetId, src: data.src, raw: data.raw };
                    const pos = { x: data.position[0], y: data.position[1], z: data.position[2] };
                    const { obj } = this.placer.placeProp(pos, ai, data.meta ?? {});
                    obj.rotation.set(...(data.rotation ?? [0,0,0]));
                    obj.scale.set(...(data.scale ?? [1,1,1]));
                }
                this._refreshObjList();
            }
            this._ed.markDirty();
            this._syncLevelProps();
            return true;
        }

        redoProps() {
            if (this._histIdx >= this._history.length - 1) return false;
            const op = this._history[++this._histIdx];
            if (op.type === 'PROP_PLACE') {
                const ai  = { id: op.data.assetId, src: op.data.src, raw: op.data.raw };
                const pos = { x: op.data.position[0], y: op.data.position[1], z: op.data.position[2] };
                this.placer.placeProp(pos, ai, op.data.meta ?? {});
                this._refreshObjList();
            } else if (op.type === 'PROP_REMOVE') {
                this.placer.removeProp(op.data.id);
                this._refreshObjList();
            } else if (op.type === 'PROP_TRANSFORM') {
                const d = op.delta;
                this.placer.applyTransform(d.id, d.nextPos, d.nextRot, d.nextScale);
            } else if (op.type === 'SCATTER_PLACE') {
                // Re-scatter: approximate by replaying original ids not available — skip for now
            } else if (op.type === 'SCATTER_ERASE') {
                for (const data of op.erased) this.placer.removeProp(data.id);
                this._refreshObjList();
            }
            this._ed.markDirty();
            this._syncLevelProps();
            return true;
        }

        // ── 7g. Level sync ────────────────────────────────────────────────────
        _syncLevelProps() {
            this._ed.state.level.props = this.placer.serialize();
        }

        // ── 7h. Keyboard shortcuts ────────────────────────────────────────────
        _bindKeys() {
            document.addEventListener('keydown', e => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
                if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                    if (this._histIdx >= 0) {
                        e.stopImmediatePropagation();
                        e.preventDefault();
                        this.undoProps();
                        this._ed.setStatus('Prop undo');
                    }
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                    if (this._histIdx < this._history.length - 1) {
                        e.stopImmediatePropagation();
                        e.preventDefault();
                        this.redoProps();
                        this._ed.setStatus('Prop redo');
                    }
                }
                if (e.key === 'Escape') {
                    this.placer.select(null);
                    this.inspector?.clear();
                }
            }, { capture: true });
        }

        // ── 7i. Load from level JSON ───────────────────────────────────────────
        loadProps(propsArray) {
            if (!propsArray?.length) return;
            this.placer.deserialize(propsArray);
            this._refreshObjList();
        }

        dispose() {
            this.placer.dispose();
        }
    }

    // ── 8. Auto-install ───────────────────────────────────────────────────────
    function install() {
        const ed = window.__topdown3dEditor;
        if (!ed || !ed.THREE) { setTimeout(install, 150); return; }

        const plugin = new ObjectToolsPlugin(ed);
        window.__topdown3dObjectTools = plugin;

        // Patch editor: mousemove/mousedown/mouseup delegation
        const origApply = ed.applyLevelJSON;
        ed.applyLevelJSON = function (json) {
            origApply(json);
            if (json.props) plugin.loadProps(json.props);
        };

        // Hook editor canvas events
        const canvas = document.getElementById('three-canvas');
        canvas.addEventListener('mousemove', e => {
            const pos = ed.groundPos(e);
            if (pos) plugin.onMouseMove(e, pos);
        });
        canvas.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            const pos = ed.groundPos(e);
            if (pos) plugin.onCanvasMouseDown(e, pos);
        });
        // mouseup is handled by editor routing to plugin.onCanvasMouseUp via __topdown3dObjectTools

        // Patch editor mouseup routing: extend existing handler
        const origGetTools = () => window.__topdown3dObjectTools;
        // Editor already routes tool==='place'|'erase' to __topdown3dTerrainTools for paint.
        // For 'place'/'erase'/'select' the editor also needs to route to object tools.
        // We patch the editor's state to intercept, using a late-binding onCanvasClick override.
        ed._objectToolsPlugin = plugin;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(install, 350));
    } else {
        setTimeout(install, 350);
    }

})();
