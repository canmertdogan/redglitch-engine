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
            </div>
            <div class="tool-section">
                <div class="tool-section-title">TERRAIN</div>
                <select id="td-terrain-mode" class="tool-select">
                    <option value="lowpoly">Low-Poly Terrain</option>
                    <option value="trimesh">Tri-Mesh Import</option>
                    <option value="flat">Flat Grid</option>
                </select>
                <div class="tool-row" style="margin-top:8px">
                    <label>Sculpt:</label>
                    <select id="td-sculpt-tool" class="tool-select-sm">
                        <option value="raise">Raise</option>
                        <option value="lower">Lower</option>
                        <option value="smooth">Smooth</option>
                        <option value="flatten">Flatten</option>
                        <option value="paint">Paint</option>
                    </select>
                </div>
                <div class="tool-row">
                    <label>Radius:</label>
                    <input type="range" id="td-sculpt-radius" min="1" max="10" value="3">
                    <span id="td-radius-val">3</span>
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
        const radiusSlider = document.getElementById('td-sculpt-radius');
        const radiusVal    = document.getElementById('td-radius-val');
        radiusSlider?.addEventListener('input', () => {
            this._sculptRadius = parseInt(radiusSlider.value);
            radiusVal.textContent = this._sculptRadius;
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

        document.getElementById('td-playtest-btn')?.addEventListener('click', () => this.editor?.playtest());
    }

    onSceneRebuilt(levelData) {
        // Hydrate topdown-specific data
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

        const team = parseInt(document.getElementById('td-team')?.value) || 0;

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
