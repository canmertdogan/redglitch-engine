/**
 * PlatformerEditorPanel.js — Platformer-specific editor tool panel for the Unified3D editor.
 *
 * Adapts existing platformer3d_editor tools (BlockTools, HazardEditor, PathEditor3D)
 * into the Editor3DCore panel system.
 */

export default class PlatformerEditorPanel {

    constructor() {
        this.editor    = null;
        this.container = null;

        // Lazy-loaded tool modules
        this.BlockTools   = null;
        this.HazardEditor = null;
        this.PathEditor   = null;

        // Platformer-specific state
        this._blockType    = 'platform';
        this._blockW       = 4;
        this._blockH       = 1;
        this._blockD       = 4;
        this._hazardType   = 'spike';
        this._snapToGrid   = true;
    }

    async onAttach(editor) {
        this.editor = editor;
        this.container = document.getElementById('mode-tools');
        if (!this.container) return;

        // Load existing platformer editor modules
        try {
            const [BT, HE, PE] = await Promise.all([
                import('/platformer3d_editor/BlockTools.js').catch(() => null),
                import('/platformer3d_editor/HazardEditor.js').catch(() => null),
                import('/platformer3d_editor/PathEditor3D.js').catch(() => null),
            ]);
            if (BT) this.BlockTools   = BT.default ?? BT;
            if (HE) this.HazardEditor = HE.default ?? HE;
            if (PE) this.PathEditor   = PE.default ?? PE;
        } catch (e) {
            console.warn('[PlatformerEditorPanel] Failed to load tool modules:', e);
        }

        this._renderToolbar();
    }

    _renderToolbar() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="tool-section">
                <div class="tool-section-title">PLATFORMER TOOLS</div>
                <div class="tool-buttons">
                    <button class="tool-btn active" data-tool="block" title="Place Block">📦</button>
                    <button class="tool-btn" data-tool="hazard" title="Place Hazard">⚠️</button>
                    <button class="tool-btn" data-tool="path" title="Moving Platform Path">🛤️</button>
                    <button class="tool-btn" data-tool="checkpoint" title="Checkpoint">🚩</button>
                    <button class="tool-btn" data-tool="collectible" title="Collectible">⭐</button>
                    <button class="tool-btn" data-tool="enemy" title="Enemy">👾</button>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">BLOCK</div>
                <select id="plat-block-type" class="tool-select">
                    <option value="platform">Platform</option>
                    <option value="wall">Wall</option>
                    <option value="moving">Moving Platform</option>
                    <option value="breakable">Breakable</option>
                    <option value="bounce">Bounce Pad</option>
                    <option value="ice">Ice</option>
                    <option value="conveyor">Conveyor</option>
                </select>
                <div class="tool-row" style="margin-top:8px">
                    <label>W:</label>
                    <input type="number" id="plat-block-w" value="4" min="0.5" step="0.5" class="tool-input-sm">
                    <label>H:</label>
                    <input type="number" id="plat-block-h" value="1" min="0.5" step="0.5" class="tool-input-sm">
                    <label>D:</label>
                    <input type="number" id="plat-block-d" value="4" min="0.5" step="0.5" class="tool-input-sm">
                </div>
                <div class="tool-row">
                    <label><input type="checkbox" id="plat-snap" checked> Snap to Grid</label>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">HAZARD</div>
                <select id="plat-hazard-type" class="tool-select">
                    <option value="spike">Spikes</option>
                    <option value="lava">Lava</option>
                    <option value="saw">Circular Saw</option>
                    <option value="laser">Laser</option>
                    <option value="crusher">Crusher</option>
                </select>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">LEVEL SETTINGS</div>
                <div class="tool-row">
                    <label>Death Y:</label>
                    <input type="number" id="plat-death-y" value="-20" step="1" class="tool-input-sm">
                </div>
                <div class="tool-row">
                    <label>Gravity:</label>
                    <input type="number" id="plat-gravity" value="-20" step="1" class="tool-input-sm">
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">ACTIONS</div>
                <div class="tool-buttons-col">
                    <button class="action-btn" id="plat-playtest-btn">▶ Playtest</button>
                </div>
            </div>
        `;

        // Wire events
        this.container.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (this.editor) {
                    this.editor.setActiveTool('draw');
                }
            });
        });

        document.getElementById('plat-playtest-btn')?.addEventListener('click', () => this.editor?.playtest());

        // Block size inputs
        const blockW = document.getElementById('plat-block-w');
        const blockH = document.getElementById('plat-block-h');
        const blockD = document.getElementById('plat-block-d');
        blockW?.addEventListener('change', () => { this._blockW = parseFloat(blockW.value) || 4; });
        blockH?.addEventListener('change', () => { this._blockH = parseFloat(blockH.value) || 1; });
        blockD?.addEventListener('change', () => { this._blockD = parseFloat(blockD.value) || 4; });

        const platSnap = document.getElementById('plat-snap');
        platSnap?.addEventListener('change', () => { this._snapToGrid = platSnap.checked; });
    }

    onSceneRebuilt(levelData) {
        // Set death-Y from level data
        const deathY = document.getElementById('plat-death-y');
        if (deathY && levelData?.deathY != null) deathY.value = levelData.deathY;
    }

    onSerialize(data) {
        const deathY = document.getElementById('plat-death-y');
        if (deathY) data.deathY = parseFloat(deathY.value) || -20;
        const gravity = document.getElementById('plat-gravity');
        if (gravity) {
            data.physics = data.physics || {};
            data.physics.gravity = [0, parseFloat(gravity.value) || -20, 0];
        }
    }

    onModeChanged(mode) {}

    getDrawState() {
        const activeBtn = this.container.querySelector('.tool-btn.active');
        const tool = activeBtn ? activeBtn.dataset.tool : 'block';
        
        let blockVal = 'box';
        if (tool === 'block') {
            blockVal = document.getElementById('plat-block-type')?.value || this._blockType;
        } else if (tool === 'hazard') {
            blockVal = document.getElementById('plat-hazard-type')?.value || this._hazardType;
        } else {
            blockVal = tool; // 'checkpoint', 'collectible', 'enemy', 'path'
        }

        return {
            mode: 'pencil',
            tool: tool,
            block: blockVal,
            width: this._blockW,
            height: this._blockH,
            depth: this._blockD,
            snap: this._snapToGrid
        };
    }

    dispose() {
        if (this.container) this.container.innerHTML = '';
    }
}
