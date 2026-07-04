/**
 * SculptStudioPanel.js - Blender-style brush sculpting for 3D Studio meshes.
 */

export default class SculptStudioPanel {

    constructor() {
        this.editor = null;
        this.container = null;
        this._tool = 'raise';
        this._radius = 2.5;
        this._strength = 0.45;
        this._paintColor = '#4a7c3f';
        this._targetMode = 'auto';
        this._isStroke = false;
        this._strokeMesh = null;
        this._brushRing = null;
    }

    async onAttach(editor) {
        this.editor = editor;
        this.container = document.getElementById('mode-tools');
        this._createBrushRing();
        this._renderToolbar();
    }

    _renderToolbar() {
        if (!this.container) return;
        const tools = [
            ['raise', 'Raise', 'fa-arrow-up'],
            ['lower', 'Lower', 'fa-arrow-down'],
            ['smooth', 'Smooth', 'fa-water'],
            ['flatten', 'Flatten', 'fa-grip-lines'],
            ['inflate', 'Inflate', 'fa-expand-arrows-alt'],
            ['pinch', 'Pinch', 'fa-compress-arrows-alt'],
            ['noise', 'Noise', 'fa-wave-square'],
            ['paint', 'Paint', 'fa-palette'],
        ];
        const toolButtons = tools.map(([id, label, icon]) => {
            const active = id === this._tool ? ' active' : '';
            return `<button class="tool-btn${active}" data-sculpt-tool="${id}" title="${label}"><i class="fas ${icon}"></i></button>`;
        }).join('');

        this.container.innerHTML = `
            <div class="tool-section">
                <div class="tool-section-title">SCULPT STUDIO</div>
                <div class="tool-buttons">${toolButtons}</div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">BRUSH</div>
                <div class="tool-row">
                    <label class="prop-label">Target</label>
                    <select id="sculpt-target" class="tool-select-sm">
                        ${this._option('auto', 'Auto Hit', this._targetMode)}
                        ${this._option('selected', 'Selected', this._targetMode)}
                        ${this._option('terrain', 'Terrain', this._targetMode)}
                        ${this._option('meshes', 'Meshes', this._targetMode)}
                    </select>
                </div>
                <div class="tool-row">
                    <label class="prop-label">Radius</label>
                    <input type="range" id="sculpt-radius" min="0.25" max="16" step="0.25" value="${this._radius}" style="flex:1;">
                    <span id="sculpt-radius-val" style="min-width:26px;text-align:center;">${this._radius}</span>
                </div>
                <div class="tool-row">
                    <label class="prop-label">Power</label>
                    <input type="range" id="sculpt-strength" min="0.02" max="1" step="0.02" value="${this._strength}" style="flex:1;">
                    <span id="sculpt-strength-val" style="min-width:26px;text-align:center;">${this._strength.toFixed(2)}</span>
                </div>
                <div class="tool-row">
                    <label class="prop-label">Color</label>
                    <input type="color" id="sculpt-color" value="${this._paintColor}" style="width:42px;height:24px;background:#111;border:1px solid rgba(255,30,39,0.25);">
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">EDITING</div>
                <div class="tool-buttons-col">
                    <button class="action-btn active" id="sculpt-enable"><i class="fas fa-hand-pointer"></i> Click + Drag Sculpt</button>
                    <button class="action-btn" id="sculpt-make-editable"><i class="fas fa-vector-square"></i> Make Selected Editable</button>
                </div>
            </div>
        `;

        this.container.querySelectorAll('[data-sculpt-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._tool = btn.dataset.sculptTool;
                this.container.querySelectorAll('[data-sculpt-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.editor?.setActiveTool('draw');
            });
        });
        this.container.querySelector('#sculpt-target')?.addEventListener('change', e => {
            this._targetMode = e.target.value || 'auto';
        });
        this.container.querySelector('#sculpt-radius')?.addEventListener('input', e => {
            this._radius = parseFloat(e.target.value) || 2.5;
            this.container.querySelector('#sculpt-radius-val').textContent = this._radius;
            this._updateBrushScale();
        });
        this.container.querySelector('#sculpt-strength')?.addEventListener('input', e => {
            this._strength = parseFloat(e.target.value) || 0.45;
            this.container.querySelector('#sculpt-strength-val').textContent = this._strength.toFixed(2);
        });
        this.container.querySelector('#sculpt-color')?.addEventListener('input', e => {
            this._paintColor = e.target.value || '#4a7c3f';
        });
        this.container.querySelector('#sculpt-enable')?.addEventListener('click', () => this.editor?.setActiveTool('draw'));
        this.container.querySelector('#sculpt-make-editable')?.addEventListener('click', () => this._makeSelectedEditable());
    }

    _option(value, label, current) {
        return `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`;
    }

    _createBrushRing() {
        if (!this.editor?.THREE || this._brushRing) return;
        const THREE = this.editor.THREE;
        const points = [];
        for (let i = 0; i <= 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            points.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0xff1e27, transparent: true, opacity: 0.85, depthTest: false });
        this._brushRing = new THREE.LineLoop(geo, mat);
        this._brushRing.name = '__sculpt_brush';
        this._brushRing.visible = false;
        this._brushRing.renderOrder = 999;
        this.editor.scene.add(this._brushRing);
        this._updateBrushScale();
    }

    _updateBrushScale() {
        if (this._brushRing) this._brushRing.scale.setScalar(this._radius);
    }

    _sculptTargets() {
        if (!this.editor) return [];
        const selected = (this.editor._selected || []).filter(obj => obj?.isMesh && obj.geometry?.getAttribute?.('position'));
        if (this._targetMode === 'selected' && selected.length > 0) return selected;
        if (this._targetMode === 'terrain') return [...(this.editor._terrainMeshes || [])];
        if (this._targetMode === 'meshes') return [...(this.editor.meshGroup?.children || [])];
        if (selected.length > 0) return selected;
        return [
            ...(this.editor._terrainMeshes || []),
            ...(this.editor.meshGroup?.children || []),
        ].filter(obj => obj?.isMesh && obj.geometry?.getAttribute?.('position'));
    }

    _raycast(event) {
        const raycaster = this.editor?._getRaycaster?.(event);
        if (!raycaster) return null;
        return raycaster.intersectObjects(this._sculptTargets(), true)
            .filter(hit => hit.object?.isMesh && hit.object.geometry?.getAttribute?.('position'))[0] || null;
    }

    handlePointerDown(event) {
        if (!this.editor || event.button !== 0 || event.altKey || this.editor._activeTool !== 'draw') return false;
        const hit = this._raycast(event);
        if (!hit) {
            event.preventDefault();
            event.stopPropagation();
            return true;
        }
        event.preventDefault();
        event.stopPropagation();
        this._isStroke = true;
        this._strokeMesh = hit.object;
        this.editor._pushUndo?.();
        this._ensureEditable(this._strokeMesh);
        this._applyBrush(hit);
        this._updateBrushRing(hit);
        return true;
    }

    handlePointerMove(event) {
        if (!this.editor || this.editor._activeTool !== 'draw') return false;
        if (event.buttons && !(event.buttons & 1)) return false;
        const hit = this._raycast(event);
        if (hit) this._updateBrushRing(hit);
        else if (this._brushRing) this._brushRing.visible = false;
        if (!this._isStroke) return true;
        event.preventDefault();
        event.stopPropagation();
        if (hit) {
            this._strokeMesh = hit.object;
            this._ensureEditable(this._strokeMesh);
            this._applyBrush(hit);
        }
        return true;
    }

    handlePointerUp(event) {
        if (!this._isStroke) return event.button === 0 && this.editor?._activeTool === 'draw';
        event.preventDefault();
        event.stopPropagation();
        if (this._strokeMesh) this._commitMesh(this._strokeMesh);
        this._isStroke = false;
        this._strokeMesh = null;
        this.editor?._updateSceneTree?.();
        this.editor?._updatePropertiesPanel?.();
        this.editor?._markDirty?.();
        return true;
    }

    _updateBrushRing(hit) {
        if (!this._brushRing || !hit) return;
        const THREE = this.editor.THREE;
        const normal = (hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone().normalize();
        this._brushRing.position.copy(hit.point).add(normal.clone().multiplyScalar(0.035));
        this._brushRing.lookAt(hit.point.clone().add(normal));
        this._brushRing.visible = true;
    }

    _ensureEditable(mesh) {
        if (!mesh?.geometry) return;
        if (mesh.geometry.index) {
            const next = mesh.geometry.toNonIndexed();
            mesh.geometry.dispose();
            mesh.geometry = next;
        }
        const pos = mesh.geometry.getAttribute('position');
        if (pos) pos.setUsage(this.editor.THREE.DynamicDrawUsage);
        if (!mesh.userData?._isTerrain && mesh.userData?.type !== 'prop') mesh.userData.type = 'trimesh';
    }

    _makeSelectedEditable() {
        const selected = (this.editor?._selected || []).filter(obj => obj?.isMesh && obj.geometry);
        for (const mesh of selected) {
            this._ensureEditable(mesh);
            this._commitMesh(mesh);
        }
        this.editor?._markDirty?.();
    }

    _applyBrush(hit) {
        const mesh = hit.object;
        const THREE = this.editor.THREE;
        const geometry = mesh.geometry;
        const pos = geometry.getAttribute('position');
        if (!pos) return;

        const localCenter = mesh.worldToLocal(hit.point.clone());
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        const localFaceNormal = (hit.face?.normal || new THREE.Vector3(0, 1, 0)).clone().normalize();
        const worldFaceNormal = localFaceNormal.clone().applyMatrix3(normalMatrix).normalize();
        const color = new THREE.Color(this._paintColor);
        let colorAttr = geometry.getAttribute('color');
        if (this._tool === 'paint' && !colorAttr) {
            colorAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
            geometry.setAttribute('color', colorAttr);
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
                if (mat) {
                    mat.vertexColors = true;
                    mat.needsUpdate = true;
                }
            }
        }

        const affected = [];
        const local = new THREE.Vector3();
        const world = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            local.fromBufferAttribute(pos, i);
            world.copy(local).applyMatrix4(mesh.matrixWorld);
            const dist = world.distanceTo(hit.point);
            if (dist <= this._radius) affected.push({ index: i, dist, local: local.clone() });
        }
        if (affected.length === 0) return;

        const strength = this._strength;
        const amount = Math.max(0.005, strength * 0.12);
        const avg = new THREE.Vector3();
        for (const v of affected) avg.add(v.local);
        avg.multiplyScalar(1 / affected.length);
        const targetPlane = localFaceNormal.dot(localCenter);

        for (const v of affected) {
            const falloff = this._falloff(v.dist);
            const next = v.local.clone();
            if (this._tool === 'raise' || this._tool === 'inflate') {
                next.add(localFaceNormal.clone().multiplyScalar(amount * falloff));
            } else if (this._tool === 'lower') {
                next.add(localFaceNormal.clone().multiplyScalar(-amount * falloff));
            } else if (this._tool === 'smooth') {
                next.lerp(avg, strength * falloff * 0.65);
            } else if (this._tool === 'flatten') {
                const delta = targetPlane - localFaceNormal.dot(next);
                next.add(localFaceNormal.clone().multiplyScalar(delta * strength * falloff));
            } else if (this._tool === 'pinch') {
                next.lerp(localCenter, strength * falloff * 0.08);
            } else if (this._tool === 'noise') {
                next.add(localFaceNormal.clone().multiplyScalar((Math.random() * 2 - 1) * amount * falloff));
            } else if (this._tool === 'paint' && colorAttr) {
                colorAttr.setXYZ(v.index, color.r, color.g, color.b);
                continue;
            }
            pos.setXYZ(v.index, next.x, next.y, next.z);
        }

        pos.needsUpdate = true;
        if (colorAttr) colorAttr.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        mesh.userData.lastSculptNormal = [worldFaceNormal.x, worldFaceNormal.y, worldFaceNormal.z];
    }

    _falloff(dist) {
        const t = Math.max(0, Math.min(1, 1 - dist / Math.max(0.001, this._radius)));
        return t * t * (3 - 2 * t);
    }

    _commitMesh(mesh) {
        if (!mesh?.geometry) return;
        const pos = mesh.geometry.getAttribute('position');
        const nrm = mesh.geometry.getAttribute('normal');
        const col = mesh.geometry.getAttribute('color');
        if (!pos) return;

        const positions = Array.from(pos.array);
        const normals = nrm ? Array.from(nrm.array) : null;
        const colors = col ? Array.from(col.array) : null;

        if (mesh.userData?._isTerrain) {
            mesh.userData.sculptedPositions = positions;
            if (normals) mesh.userData.sculptedNormals = normals;
            if (colors) mesh.userData.sculptedColors = colors;
            this.editor?._syncProceduralTerrainToLevelData?.();
            return;
        }

        mesh.userData.type = mesh.userData.type === 'prop' ? 'prop' : 'trimesh';
        if (!this.editor._levelData) this.editor._levelData = { geometry: [], entities: [], lights: [], materials: [] };
        if (!Array.isArray(this.editor._levelData.geometry)) this.editor._levelData.geometry = [];
        let def = this.editor._levelData.geometry.find(g => g.id === mesh.name);
        if (!def) {
            def = { id: mesh.name, type: mesh.userData.type || 'trimesh' };
            this.editor._levelData.geometry.push(def);
        }
        Object.assign(def, {
            type: mesh.userData.type || 'trimesh',
            width: mesh.userData.width || def.width || 1,
            height: mesh.userData.height || def.height || 1,
            depth: mesh.userData.depth || def.depth || 1,
            position: [mesh.position.x, mesh.position.y, mesh.position.z],
            rotation: [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w],
            scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
            colorHex: mesh.userData.colorHex || def.colorHex || '#888888',
            material_id: mesh.userData.material_id || def.material_id || null,
            positions,
            normals,
            colors,
            castShadow: true,
            receiveShadow: true,
        });
        if (mesh.userData.propId) {
            def.propId = mesh.userData.propId;
            def.propGroup = mesh.userData.propGroup || null;
        }
    }

    onSceneRebuilt() {}
    onModeChanged() {}

    getDrawState() {
        return { mode: 'pencil', tool: 'sculpt', block: 'sculpt', width: this._radius * 2, height: 0.1, depth: this._radius * 2, snap: false };
    }

    dispose() {
        if (this._brushRing) {
            this._brushRing.parent?.remove(this._brushRing);
            this._brushRing.geometry?.dispose();
            this._brushRing.material?.dispose();
            this._brushRing = null;
        }
        if (this.container) this.container.innerHTML = '';
    }
}
