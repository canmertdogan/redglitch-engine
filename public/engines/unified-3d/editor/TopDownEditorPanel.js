/**
 * TopDownEditorPanel.js — TopDown-specific editor tool panel for the Unified3D editor.
 *
 * Provides terrain sculpting, entity placement, navmesh bake, fog config tools.
 */

export default class TopDownEditorPanel {

    constructor() {
        this.editor    = null;
        this.container = null;

        // TopDown-specific state
        this._terrainMode  = 'lowpoly';
        this._sculptTool   = 'raise';
        this._sculptRadius = 3;
        this._brushSize    = 1;
        this._entityType   = 'unit';
        this._teamId       = 0;
    }

    async onAttach(editor) {
        this.editor = editor;
        this.container = document.getElementById('mode-tools');
        if (!this.container) return;
        this._renderToolbar();
    }

    _renderToolbar() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="tool-section">
                <div class="tool-section-title">QUICK ACTIONS (TOP-DOWN)</div>
                <div class="tool-buttons-col">
                    <button class="action-btn" data-tool="camera" title="Set Camera Angle"><i class="fas fa-video"></i> Set Camera Angle</button>
                    <button class="action-btn" data-tool="npc" title="Place NPC"><i class="fas fa-user-friends"></i> Place NPC</button>
                    <button class="action-btn" data-tool="trigger" title="Add Trigger Zone"><i class="fas fa-vector-square"></i> Add Trigger Zone</button>
                    <button class="action-btn" data-tool="pathfinding" title="Configure Pathfinding"><i class="fas fa-project-diagram"></i> Configure Pathfinding</button>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">ENVIRONMENT</div>
                <div class="tool-buttons">
                    <button class="tool-btn active" data-tool="terrain" title="Terrain">🏔️</button>
                    <button class="tool-btn" data-tool="waypoint" title="Waypoints">📍</button>
                    <button class="tool-btn" data-tool="entity" title="Place Entity">👤</button>
                </div>
                <div class="tool-row" style="margin-top:8px">
                    <label>Team:</label>
                    <select id="td-team" class="tool-select-sm">
                        <option value="0" ${this._teamId === 0 ? 'selected' : ''}>Ally (0)</option>
                        <option value="1" ${this._teamId === 1 ? 'selected' : ''}>Enemy (1)</option>
                        <option value="2" ${this._teamId === 2 ? 'selected' : ''}>Neutral (2)</option>
                    </select>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">TERRAIN</div>
                <select id="td-terrain-mode" class="tool-select">
                    <option value="lowpoly" ${this._terrainMode === 'lowpoly' ? 'selected' : ''}>Low-Poly Terrain</option>
                    <option value="trimesh" ${this._terrainMode === 'trimesh' ? 'selected' : ''}>Tri-Mesh Import</option>
                    <option value="flat" ${this._terrainMode === 'flat' ? 'selected' : ''}>Flat Grid</option>
                </select>
                <div class="tool-row" style="margin-top:8px">
                    <label>Sculpt:</label>
                    <select id="td-sculpt-tool" class="tool-select-sm">
                        <option value="raise" ${this._sculptTool === 'raise' ? 'selected' : ''}>Raise</option>
                        <option value="lower" ${this._sculptTool === 'lower' ? 'selected' : ''}>Lower</option>
                        <option value="smooth" ${this._sculptTool === 'smooth' ? 'selected' : ''}>Smooth</option>
                        <option value="flatten" ${this._sculptTool === 'flatten' ? 'selected' : ''}>Flatten</option>
                        <option value="paint" ${this._sculptTool === 'paint' ? 'selected' : ''}>Paint</option>
                    </select>
                </div>
                <div class="tool-row">
                    <label>Radius:</label>
                    <input type="range" id="td-sculpt-radius" min="1" max="10" value="${this._sculptRadius}">
                    <span id="td-radius-val">${this._sculptRadius}</span>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">ACTIONS</div>
                <div class="tool-buttons-col">
                    <button class="action-btn" id="td-bake-nav"><i class="fas fa-map"></i> Bake Navmesh</button>
                    <button class="action-btn" id="td-playtest-btn"><i class="fas fa-play"></i> Playtest</button>
                </div>
            </div>
        `;

        // Wire events
        const terrainModeEl = document.getElementById('td-terrain-mode');
        terrainModeEl?.addEventListener('change', (e) => {
            this._terrainMode = e.target.value;
            if (this.editor?._levelData) {
                this.editor._levelData.terrain = this.editor._levelData.terrain || {};
                this.editor._levelData.terrain.mode = this._terrainMode;
                this.editor._markDirty();
            }
        });

        const sculptToolEl = document.getElementById('td-sculpt-tool');
        sculptToolEl?.addEventListener('change', (e) => {
            this._sculptTool = e.target.value;
        });

        const teamEl = document.getElementById('td-team');
        teamEl?.addEventListener('change', (e) => {
            this._teamId = parseInt(e.target.value, 10) || 0;
        });

        const radiusSlider = document.getElementById('td-sculpt-radius');
        const radiusVal    = document.getElementById('td-radius-val');
        radiusSlider?.addEventListener('input', () => {
            this._sculptRadius = parseInt(radiusSlider.value, 10);
            if (radiusVal) radiusVal.textContent = this._sculptRadius;
        });

        this.container.querySelectorAll('.tool-btn, .action-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.tool-btn, .action-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.editor) {
                    this.editor.setActiveTool('draw');
                }
            });
        });

        document.getElementById('td-bake-nav')?.addEventListener('click', () => this._bakeNavmesh());
        document.getElementById('td-playtest-btn')?.addEventListener('click', () => this.editor?.playtest());
    }

    _bakeNavmesh() {
        if (!this.editor?._levelData) return;
        const levelData = this.editor._levelData;
        const worldW = Math.max(8, Number(levelData.world?.width ?? 40));
        const worldH = Math.max(8, Number(levelData.world?.height ?? 40));
        const step = 2;

        // Collect solid obstacle footprints above floor height (excludes flat ground plates)
        const obstacles = [];
        for (const mesh of this.editor.meshGroup?.children || []) {
            const box = new this.editor.THREE.Box3().setFromObject(mesh);
            const h = box.max.y - box.min.y;
            if (h > 0.35 && box.max.y > 0.25 && box.min.y < 3.0) {
                obstacles.push(box);
            }
        }

        const isBlocked = (cx, cz) => obstacles.some(b =>
            cx >= b.min.x - 0.3 && cx <= b.max.x + 0.3 &&
            cz >= b.min.z - 0.3 && cz <= b.max.z + 0.3
        );

        const vertices = [];
        const indices = [];
        const areas = [];
        for (let z = 0; z < worldH; z += step) {
            for (let x = 0; x < worldW; x += step) {
                const cx = x + step * 0.5;
                const cz = z + step * 0.5;
                if (isBlocked(cx, cz)) continue;
                const base = vertices.length / 3;
                vertices.push(
                    x, 0.05, z,
                    x + step, 0.05, z,
                    x + step, 0.05, z + step,
                    x, 0.05, z + step
                );
                indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
                areas.push(0, 0);
            }
        }

        this.editor._pushUndo();
        levelData.navmesh = { vertices, indices, areas };
        this.editor._markDirty();

        const btn = document.getElementById('td-bake-nav');
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = `<i class="fas fa-check"></i> Baked (${areas.length} tris)`;
            setTimeout(() => { if (btn) btn.innerHTML = orig; }, 1800);
        }
    }

    onSceneRebuilt(levelData) {
        if (levelData?.terrain?.mode) {
            this._terrainMode = levelData.terrain.mode;
            const el = document.getElementById('td-terrain-mode');
            if (el) el.value = this._terrainMode;
        }
    }

    onSerialize(data) {
        data.terrain = data.terrain || {};
        data.terrain.mode = this._terrainMode;
    }

    onModeChanged(mode) {}

    getDrawState() {
        const activeBtn = this.container.querySelector('.tool-btn.active, .action-btn.active[data-tool]');
        const tool = activeBtn ? activeBtn.dataset.tool : 'terrain';
        
        let blockVal = 'terrain';
        if (tool === 'entity') blockVal = 'entity';
        else if (tool === 'npc') blockVal = 'npc';
        else if (tool === 'trigger') blockVal = 'trigger';
        else if (tool === 'camera') blockVal = 'camera';
        else if (tool === 'pathfinding') blockVal = 'pathfinding';
        else blockVal = tool;

        const team = parseInt(document.getElementById('td-team')?.value ?? this._teamId, 10) || 0;

        return {
            mode: 'pencil',
            tool: tool,
            block: blockVal,
            entity: blockVal,
            team: team,
            width: 1,
            height: 1,
            depth: 1,
            snap: tool === 'terrain'
        };
    }

    dispose() {
        if (this.container) this.container.innerHTML = '';
    }
}
