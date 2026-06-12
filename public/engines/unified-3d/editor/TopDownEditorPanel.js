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
                <div class="tool-section-title">TOPDOWN TOOLS</div>
                <div class="tool-buttons">
                    <button class="tool-btn active" data-tool="terrain" title="Terrain">🏔️</button>
                    <button class="tool-btn" data-tool="entity" title="Place Entity">👤</button>
                    <button class="tool-btn" data-tool="navmesh" title="Navmesh">🗺️</button>
                    <button class="tool-btn" data-tool="fog" title="Fog Config">🌫️</button>
                    <button class="tool-btn" data-tool="waypoint" title="Waypoints">📍</button>
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
                <div class="tool-section-title">ENTITY</div>
                <select id="td-entity-type" class="tool-select">
                    <option value="unit">Unit (Player)</option>
                    <option value="enemy">Enemy</option>
                    <option value="npc">NPC</option>
                    <option value="building">Building</option>
                    <option value="resource">Resource</option>
                    <option value="trigger">Trigger Zone</option>
                </select>
                <div class="tool-row">
                    <label>Team:</label>
                    <select id="td-team" class="tool-select-sm">
                        <option value="0">Team 0 (Player)</option>
                        <option value="1">Team 1 (Enemy)</option>
                        <option value="2">Team 2 (Neutral)</option>
                    </select>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">ACTIONS</div>
                <div class="tool-buttons-col">
                    <button class="action-btn" id="td-bake-nav">🗺️ Bake Navmesh</button>
                    <button class="action-btn" id="td-playtest-btn">▶ Playtest</button>
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

        this.container.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
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
        const activeBtn = this.container.querySelector('.tool-btn.active');
        const tool = activeBtn ? activeBtn.dataset.tool : 'terrain';
        
        let blockVal = 'terrain';
        if (tool === 'entity') {
            blockVal = document.getElementById('td-entity-type')?.value || this._entityType;
        } else {
            blockVal = tool; // 'terrain', 'navmesh', 'waypoint', 'fog'
        }

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
