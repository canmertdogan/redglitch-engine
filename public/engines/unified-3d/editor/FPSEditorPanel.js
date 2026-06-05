/**
 * FPSEditorPanel.js — FPS-specific editor tool panel for the Unified3D editor.
 *
 * Adapts existing FPS editor tools (BrushTools, EntitySpawner, LightEditor,
 * ColorPalette, MapExporter) into the Editor3DCore panel system.
 */

export default class FPSEditorPanel {

    constructor() {
        this.editor     = null;
        this.container  = null;

        // Lazy-loaded tool modules
        this.BrushTools    = null;
        this.EntitySpawner = null;
        this.LightEditor   = null;
        this.ColorPalette  = null;
        this.MapExporter   = null;

        // FPS-specific state
        this._activeBlock  = 'floor';
        this._drawMode     = 'pencil';
        this._activeY      = 0;
        this._voxelGrid    = {};
        this._entities     = [];
        this._lights       = [];
    }

    async onAttach(editor) {
        this.editor = editor;
        this.container = document.getElementById('mode-tools');
        if (!this.container) return;

        // Load FPS tool modules from existing fps_editor/ directory
        try {
            const [BT, ES, LE, CP, ME] = await Promise.all([
                import('/fps_editor/BrushTools.js').catch(() => null),
                import('/fps_editor/EntitySpawner.js').catch(() => null),
                import('/fps_editor/LightEditor.js').catch(() => null),
                import('/fps_editor/ColorPalette.js').catch(() => null),
                import('/fps_editor/MapExporter.js').catch(() => null),
            ]);
            if (BT) this.BrushTools    = BT.default ?? BT;
            if (ES) this.EntitySpawner = ES.default ?? ES;
            if (LE) this.LightEditor   = LE.default ?? LE;
            if (CP) this.ColorPalette  = CP.default ?? CP;
            if (ME) this.MapExporter   = ME.default ?? ME;
        } catch (e) {
            console.warn('[FPSEditorPanel] Failed to load tool modules:', e);
        }

        this._renderToolbar();
    }

    _renderToolbar() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="tool-section">
                <div class="tool-section-title">FPS TOOLS</div>
                <div class="tool-buttons">
                    <button class="tool-btn active" data-tool="draw-room" title="Draw Room">🏠</button>
                    <button class="tool-btn" data-tool="entity" title="Place Entity">👤</button>
                    <button class="tool-btn" data-tool="light" title="Place Light">💡</button>
                    <button class="tool-btn" data-tool="paint" title="Paint">🎨</button>
                    <button class="tool-btn" data-tool="trigger" title="Place Trigger">⚡</button>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">DRAW MODE</div>
                <div class="tool-buttons">
                    <button class="draw-btn active" data-draw="pencil">✏️ Pencil</button>
                    <button class="draw-btn" data-draw="rect">◻️ Rect</button>
                    <button class="draw-btn" data-draw="fill">🪣 Fill</button>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">BLOCK TYPE</div>
                <select id="fps-block-type" class="tool-select">
                    <option value="floor">Floor</option>
                    <option value="wall">Wall</option>
                    <option value="ceiling">Ceiling</option>
                    <option value="pillar">Pillar</option>
                    <option value="stairs">Stairs</option>
                    <option value="ramp">Ramp</option>
                    <option value="crate">Crate</option>
                </select>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">LAYER (Y)</div>
                <div class="tool-row">
                    <button id="fps-layer-down">▼</button>
                    <span id="fps-layer-val">0</span>
                    <button id="fps-layer-up">▲</button>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">ACTIONS</div>
                <div class="tool-buttons-col">
                    <button class="action-btn" id="fps-export-btn">📦 Export Map</button>
                    <button class="action-btn" id="fps-playtest-btn">▶ Playtest</button>
                </div>
            </div>
        `;

        // Wire events
        this.container.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        this.container.querySelectorAll('.draw-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.draw-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._drawMode = btn.dataset.draw;
            });
        });

        const layerUp   = document.getElementById('fps-layer-up');
        const layerDown = document.getElementById('fps-layer-down');
        const layerVal  = document.getElementById('fps-layer-val');
        layerUp?.addEventListener('click', () => { this._activeY++; layerVal.textContent = this._activeY; });
        layerDown?.addEventListener('click', () => { this._activeY = Math.max(0, this._activeY - 1); layerVal.textContent = this._activeY; });

        document.getElementById('fps-playtest-btn')?.addEventListener('click', () => this.editor?.playtest());
    }

    onSceneRebuilt(levelData) {
        this._voxelGrid = levelData?.voxelGrid || {};
        this._entities  = levelData?.entities  || [];
        this._lights    = levelData?.lights    || [];
    }

    onSerialize(data) {
        data.voxelGrid = this._voxelGrid;
    }

    onModeChanged(mode) {
        // Only active when mode is fps-3d
    }

    dispose() {
        if (this.container) this.container.innerHTML = '';
    }
}
