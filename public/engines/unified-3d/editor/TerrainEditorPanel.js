export default class TerrainEditorPanel {

    constructor() {
        this.editor       = null;
        this.container    = null;
        this._terrainMesh = null;
        this._waterMesh   = null;
        this._foliageGroup = null;
        this._sculptTool  = null;

        this._genW     = 129;
        this._genD     = 129;
        this._cellSize = 2;
        this._heightScale = 8;
        this._seed     = Math.floor(Math.random() * 99999);
        this._biome    = 'temperate';
        this._terrainStyle = 'lowpoly';

        this._waterLevel = 0.28;
        this._erosion    = false;
        this._vegDensity = 0.055;
        this._lakeCount  = 3;
        this._lakeSize   = 0.16;
        this._riverCount = 2;
        this._riverWidth = 2.2;
        this._waterfalls = true;
        this._grassDensity = 0.22;
        this._rockDensity  = 0.012;

        this._octaves    = 4;
        this._lacunarity = 2.0;
        this._gain       = 0.5;
        this._frequency  = 0.025;

        this._brushRadius   = 3;
        this._brushStrength = 0.5;
        this._paintColor    = '#4a7c3f';

        this._currentPalette = null;
        this._biomes = this._defineBiomes();
    }

    _defineBiomes() {
        return {
            temperate: {
                label: 'Temperate Forest',
                noiseType: 'perlin',
                heightScale: 8,
                waterLevel: 0.28,
                octaves: 4, lacunarity: 2.0, gain: 0.5, freq: 0.025,
                vegDensity: 0.065,
                vegTypes: ['pine', 'oak', 'bush', 'rock', 'grass'],
                palette: [
                    { threshold: 0.10, color: '#1a3a5c' },
                    { threshold: 0.20, color: '#2e6b8a' },
                    { threshold: 0.30, color: '#c2a86b' },
                    { threshold: 0.50, color: '#4a7c3f' },
                    { threshold: 0.70, color: '#6b6b5e' },
                    { threshold: 0.85, color: '#8a8a7a' },
                    { threshold: 1.00, color: '#e8e8e8' },
                ],
            },
            desert: {
                label: 'Desert',
                noiseType: 'hills',
                heightScale: 5,
                waterLevel: 0.18,
                octaves: 3, lacunarity: 2.5, gain: 0.4, freq: 0.015,
                vegDensity: 0.005,
                vegTypes: ['cactus', 'rock'],
                palette: [
                    { threshold: 0.10, color: '#8B7355' },
                    { threshold: 0.25, color: '#BDB76B' },
                    { threshold: 0.50, color: '#DEB887' },
                    { threshold: 0.75, color: '#D2B48C' },
                    { threshold: 1.00, color: '#A0522D' },
                ],
            },
            tundra: {
                label: 'Tundra',
                noiseType: 'hills',
                heightScale: 4,
                waterLevel: 0.22,
                octaves: 3, lacunarity: 2.0, gain: 0.45, freq: 0.02,
                vegDensity: 0.018,
                vegTypes: ['pine', 'bush', 'rock', 'grass'],
                palette: [
                    { threshold: 0.10, color: '#3a4a5c' },
                    { threshold: 0.20, color: '#5a6a7c' },
                    { threshold: 0.35, color: '#7a8a7a' },
                    { threshold: 0.60, color: '#9aaa8a' },
                    { threshold: 0.80, color: '#c0c0c0' },
                    { threshold: 1.00, color: '#f0f0f0' },
                ],
            },
            tropical: {
                label: 'Tropical',
                noiseType: 'perlin',
                heightScale: 10,
                waterLevel: 0.30,
                octaves: 5, lacunarity: 2.0, gain: 0.5, freq: 0.03,
                vegDensity: 0.095,
                vegTypes: ['palm', 'bush', 'rock', 'grass'],
                palette: [
                    { threshold: 0.10, color: '#1a4a5c' },
                    { threshold: 0.20, color: '#3a8a7a' },
                    { threshold: 0.30, color: '#c2a86b' },
                    { threshold: 0.50, color: '#2d8a3f' },
                    { threshold: 0.70, color: '#1a6a2f' },
                    { threshold: 0.85, color: '#4a6a3e' },
                    { threshold: 1.00, color: '#6a8a5a' },
                ],
            },
            volcanic: {
                label: 'Volcanic',
                noiseType: 'mountains',
                heightScale: 14,
                waterLevel: 0.16,
                octaves: 5, lacunarity: 2.2, gain: 0.55, freq: 0.035,
                vegDensity: 0.002,
                vegTypes: ['rock'],
                palette: [
                    { threshold: 0.10, color: '#1a0a0a' },
                    { threshold: 0.20, color: '#2a1a0a' },
                    { threshold: 0.35, color: '#3a2a1a' },
                    { threshold: 0.55, color: '#5a3a2a' },
                    { threshold: 0.75, color: '#7a4a3a' },
                    { threshold: 0.90, color: '#aa5a3a' },
                    { threshold: 1.00, color: '#cc6a4a' },
                ],
            },
            alpine: {
                label: 'Alpine',
                noiseType: 'mountains',
                heightScale: 18,
                waterLevel: 0.18,
                octaves: 5, lacunarity: 2.5, gain: 0.6, freq: 0.04,
                vegDensity: 0.028,
                vegTypes: ['pine', 'bush', 'rock', 'grass'],
                palette: [
                    { threshold: 0.10, color: '#1a2a3c' },
                    { threshold: 0.20, color: '#2e4a5a' },
                    { threshold: 0.30, color: '#5a7a5a' },
                    { threshold: 0.50, color: '#6a8a5a' },
                    { threshold: 0.70, color: '#8a9a7a' },
                    { threshold: 0.85, color: '#c0c8c0' },
                    { threshold: 1.00, color: '#ffffff' },
                ],
            },
            oceanic: {
                label: 'Oceanic / Atoll',
                noiseType: 'islands',
                heightScale: 6,
                waterLevel: 0.35,
                octaves: 4, lacunarity: 2.0, gain: 0.5, freq: 0.02,
                vegDensity: 0.04,
                vegTypes: ['palm', 'bush', 'rock', 'grass'],
                palette: [
                    { threshold: 0.10, color: '#0a1a3c' },
                    { threshold: 0.20, color: '#1a3a6a' },
                    { threshold: 0.30, color: '#2a5a8a' },
                    { threshold: 0.40, color: '#c2a86b' },
                    { threshold: 0.60, color: '#4a8a3f' },
                    { threshold: 0.80, color: '#6a6a5e' },
                    { threshold: 1.00, color: '#8a8a7a' },
                ],
            },
            marsh: {
                label: 'Marsh / Swamp',
                noiseType: 'perlin',
                heightScale: 4,
                waterLevel: 0.30,
                octaves: 3, lacunarity: 1.8, gain: 0.45, freq: 0.02,
                vegDensity: 0.085,
                vegTypes: ['bush', 'rock', 'grass'],
                palette: [
                    { threshold: 0.10, color: '#1a2a1a' },
                    { threshold: 0.20, color: '#2a4a2a' },
                    { threshold: 0.30, color: '#3a5a3a' },
                    { threshold: 0.50, color: '#4a7a3a' },
                    { threshold: 0.70, color: '#6a8a5a' },
                    { threshold: 0.85, color: '#8a9a7a' },
                    { threshold: 1.00, color: '#9aaa8a' },
                ],
            },
        };
    }

    async onAttach(editor) {
        this.editor = editor;
        this.container = document.getElementById('mode-tools');
        if (!this.container) return;
        this._renderToolbar();
        this._syncBiomeUI();
    }

    _renderToolbar() {
        if (!this.container) return;
        const biomeOpts = Object.entries(this._biomes).map(([k, v]) =>
            `<option value="${k}" ${this._biome === k ? 'selected' : ''}>${v.label}</option>`
        ).join('');

        this.container.innerHTML = `
            <div class="tool-section">
                <div class="tool-section-title" style="border-bottom-color:rgba(255,30,39,0.3);">🌍 BIOME</div>
                <div class="tool-buttons-col">
                    <div class="tool-row">
                        <label>Biome:</label>
                        <select id="terr-biome" class="tool-select-sm" style="flex:1;">${biomeOpts}</select>
                    </div>
                    <div class="tool-row">
                        <label>Style:</label>
                        <select id="terr-style" class="tool-select-sm" style="flex:1;">
                            <option value="lowpoly" ${this._terrainStyle === 'lowpoly' ? 'selected' : ''}>Low-Poly</option>
                            <option value="minecraft" ${this._terrainStyle === 'minecraft' ? 'selected' : ''}>Minecraft Voxel</option>
                            <option value="veloren" ${this._terrainStyle === 'veloren' ? 'selected' : ''}>Veloren Voxel</option>
                        </select>
                    </div>
                    <div class="tool-row">
                        <label>Seed:</label>
                        <input type="number" id="terr-gen-seed" value="${this._seed}" class="tool-input-sm" style="flex:1;">
                        <button class="kas-btn" id="terr-random-seed" title="Randomize" style="width:24px;height:24px;font-size:10px;"><i class="fas fa-dice"></i></button>
                    </div>
                    <button class="action-btn" id="terr-generate" style="margin-top:4px;">
                        <i class="fas fa-mountain"></i> GENERATE
                    </button>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">⚙️ PARAMETERS</div>
                <div class="tool-buttons-col">
                    <div class="tool-row">
                        <label>Size:</label>
                        <input type="number" id="terr-gen-w" value="${this._genW}" min="8" max="257" step="2" class="tool-input-sm" style="flex:1;">
                        <span style="color:rgba(255,30,39,0.4);margin:0 2px;">×</span>
                        <input type="number" id="terr-gen-d" value="${this._genD}" min="8" max="257" step="2" class="tool-input-sm" style="flex:1;">
                    </div>
                    <div class="tool-row">
                        <label>Scale:</label>
                        <input type="range" id="terr-cell-size" min="1" max="4" step="0.25" value="${this._cellSize}" style="flex:1;">
                        <span id="terr-cell-size-val" style="min-width:28px;text-align:center;">${this._cellSize}</span>
                    </div>
                    <div class="tool-row">
                        <label>Height:</label>
                        <input type="range" id="terr-gen-h" min="1" max="30" step="0.5" value="${this._heightScale}" style="flex:1;">
                        <span id="terr-h-val" style="min-width:28px;text-align:center;">${this._heightScale}</span>
                    </div>
                    <div class="tool-row">
                        <label>Water:</label>
                        <input type="range" id="terr-water-level" min="0" max="0.6" step="0.01" value="${this._waterLevel}" style="flex:1;">
                        <span id="terr-water-val" style="min-width:28px;text-align:center;">${(this._waterLevel * 100).toFixed(0)}%</span>
                    </div>
                    <div class="tool-row">
                        <label>Lakes:</label>
                        <input type="range" id="terr-lake-count" min="0" max="12" step="1" value="${this._lakeCount}" style="flex:1;">
                        <span id="terr-lake-val" style="min-width:28px;text-align:center;">${this._lakeCount}</span>
                    </div>
                    <div class="tool-row">
                        <label>Lake Size:</label>
                        <input type="range" id="terr-lake-size" min="0.05" max="0.35" step="0.01" value="${this._lakeSize}" style="flex:1;">
                        <span id="terr-lake-size-val" style="min-width:28px;text-align:center;">${(this._lakeSize * 100).toFixed(0)}%</span>
                    </div>
                    <div class="tool-row">
                        <label>Rivers:</label>
                        <input type="range" id="terr-river-count" min="0" max="6" step="1" value="${this._riverCount}" style="flex:1;">
                        <span id="terr-river-val" style="min-width:28px;text-align:center;">${this._riverCount}</span>
                    </div>
                    <div class="tool-row">
                        <label>River W:</label>
                        <input type="range" id="terr-river-width" min="0.8" max="6" step="0.2" value="${this._riverWidth}" style="flex:1;">
                        <span id="terr-river-width-val" style="min-width:28px;text-align:center;">${this._riverWidth.toFixed(1)}</span>
                    </div>
                    <div class="tool-row" style="gap:6px;">
                        <label style="min-width:auto;">Waterfalls:</label>
                        <input type="checkbox" id="terr-waterfalls" ${this._waterfalls ? 'checked' : ''} style="accent-color:#ff1e27;">
                    </div>
                    <div class="tool-row">
                        <label>Veg:</label>
                        <input type="range" id="terr-veg-density" min="0" max="0.22" step="0.005" value="${this._vegDensity}" style="flex:1;">
                        <span id="terr-veg-val" style="min-width:28px;text-align:center;">${(this._vegDensity * 100).toFixed(0)}%</span>
                    </div>
                    <div class="tool-row">
                        <label>Grass:</label>
                        <input type="range" id="terr-grass-density" min="0" max="0.55" step="0.005" value="${this._grassDensity}" style="flex:1;">
                        <span id="terr-grass-val" style="min-width:28px;text-align:center;">${(this._grassDensity * 100).toFixed(0)}%</span>
                    </div>
                    <div class="tool-row">
                        <label>Rocks:</label>
                        <input type="range" id="terr-rock-density" min="0" max="0.08" step="0.002" value="${this._rockDensity}" style="flex:1;">
                        <span id="terr-rock-val" style="min-width:28px;text-align:center;">${(this._rockDensity * 100).toFixed(1)}%</span>
                    </div>
                    <div class="tool-row" style="gap:6px;">
                        <label style="min-width:auto;">Erosion:</label>
                        <input type="checkbox" id="terr-erosion" ${this._erosion ? 'checked' : ''} style="accent-color:#ff1e27;">
                        <label style="min-width:auto;margin-left:8px;">Oct:</label>
                        <input type="number" id="terr-octaves" value="${this._octaves}" min="1" max="8" class="tool-input-sm" style="width:36px;">
                    </div>
                </div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">🔨 SCULPT</div>
                <div class="tool-buttons">
                    <button class="tool-btn" data-tool="raise" title="Raise">▲</button>
                    <button class="tool-btn" data-tool="lower" title="Lower">▼</button>
                    <button class="tool-btn" data-tool="smooth" title="Smooth">◎</button>
                    <button class="tool-btn" data-tool="flatten" title="Flatten">━</button>
                    <button class="tool-btn" data-tool="noise" title="Noise">≈</button>
                    <button class="tool-btn" data-tool="paint" title="Paint">🎨</button>
                </div>
                <div class="tool-row" style="margin-top:6px;">
                    <label>Radius:</label>
                    <input type="range" id="terr-brush-radius" min="0.5" max="20" step="0.5" value="${this._brushRadius}" style="flex:1;">
                    <span id="terr-radius-val" style="min-width:22px;text-align:center;">${this._brushRadius}</span>
                </div>
                <div class="tool-row">
                    <label>Strength:</label>
                    <input type="range" id="terr-brush-strength" min="0.05" max="1" step="0.05" value="${this._brushStrength}" style="flex:1;">
                    <span id="terr-strength-val" style="min-width:22px;text-align:center;">${this._brushStrength.toFixed(2)}</span>
                </div>
            </div>
        `;

        this._wireEvents();
    }

    _syncBiomeUI() {
        const biome = this._biomes[this._biome] || this._biomes.temperate;
        const hSlider = this.container?.querySelector('#terr-gen-h');
        const hVal    = this.container?.querySelector('#terr-h-val');
        const wSlider = this.container?.querySelector('#terr-water-level');
        const wVal    = this.container?.querySelector('#terr-water-val');
        const vSlider = this.container?.querySelector('#terr-veg-density');
        const vVal    = this.container?.querySelector('#terr-veg-val');
        const oct     = this.container?.querySelector('#terr-octaves');

        this._heightScale = biome.heightScale;
        this._waterLevel  = biome.waterLevel;
        this._vegDensity  = biome.vegDensity;
        this._octaves     = biome.octaves;
        this._lacunarity  = biome.lacunarity;
        this._gain        = biome.gain;
        this._frequency   = biome.freq;

        if (hSlider) { hSlider.value = biome.heightScale; hVal.textContent = biome.heightScale; }
        if (wSlider) { wSlider.value = biome.waterLevel; wVal.textContent = (biome.waterLevel * 100).toFixed(0) + '%'; }
        if (vSlider) { vSlider.value = biome.vegDensity; vVal.textContent = (biome.vegDensity * 100).toFixed(0) + '%'; }
        if (oct) oct.value = biome.octaves;
    }

    _wireEvents() {
        const c = this.container;

        c.querySelector('#terr-random-seed')?.addEventListener('click', () => {
            this._seed = Math.floor(Math.random() * 99999);
            c.querySelector('#terr-gen-seed').value = this._seed;
        });

        c.querySelector('#terr-biome')?.addEventListener('change', (e) => {
            this._biome = e.target.value;
            this._syncBiomeUI();
        });
        c.querySelector('#terr-style')?.addEventListener('change', (e) => {
            this._terrainStyle = e.target.value || 'lowpoly';
        });

        c.querySelector('#terr-generate')?.addEventListener('click', () => {
            this._readGenParams();
            this._generateTerrain();
        });

        c.querySelector('#terr-gen-h')?.addEventListener('input', () => {
            this._heightScale = parseFloat(c.querySelector('#terr-gen-h').value);
            c.querySelector('#terr-h-val').textContent = this._heightScale;
        });
        c.querySelector('#terr-cell-size')?.addEventListener('input', () => {
            this._cellSize = parseFloat(c.querySelector('#terr-cell-size').value) || 1;
            c.querySelector('#terr-cell-size-val').textContent = this._cellSize;
        });

        c.querySelector('#terr-water-level')?.addEventListener('input', () => {
            this._waterLevel = parseFloat(c.querySelector('#terr-water-level').value);
            c.querySelector('#terr-water-val').textContent = (this._waterLevel * 100).toFixed(0) + '%';
        });

        c.querySelector('#terr-veg-density')?.addEventListener('input', () => {
            this._vegDensity = parseFloat(c.querySelector('#terr-veg-density').value);
            c.querySelector('#terr-veg-val').textContent = (this._vegDensity * 100).toFixed(0) + '%';
        });
        c.querySelector('#terr-lake-count')?.addEventListener('input', () => {
            this._lakeCount = parseInt(c.querySelector('#terr-lake-count').value) || 0;
            c.querySelector('#terr-lake-val').textContent = this._lakeCount;
        });
        c.querySelector('#terr-lake-size')?.addEventListener('input', () => {
            this._lakeSize = parseFloat(c.querySelector('#terr-lake-size').value);
            c.querySelector('#terr-lake-size-val').textContent = (this._lakeSize * 100).toFixed(0) + '%';
        });
        c.querySelector('#terr-river-count')?.addEventListener('input', () => {
            this._riverCount = parseInt(c.querySelector('#terr-river-count').value) || 0;
            c.querySelector('#terr-river-val').textContent = this._riverCount;
        });
        c.querySelector('#terr-river-width')?.addEventListener('input', () => {
            this._riverWidth = parseFloat(c.querySelector('#terr-river-width').value);
            c.querySelector('#terr-river-width-val').textContent = this._riverWidth.toFixed(1);
        });
        c.querySelector('#terr-waterfalls')?.addEventListener('change', (e) => {
            this._waterfalls = e.target.checked;
        });
        c.querySelector('#terr-grass-density')?.addEventListener('input', () => {
            this._grassDensity = parseFloat(c.querySelector('#terr-grass-density').value);
            c.querySelector('#terr-grass-val').textContent = (this._grassDensity * 100).toFixed(0) + '%';
        });
        c.querySelector('#terr-rock-density')?.addEventListener('input', () => {
            this._rockDensity = parseFloat(c.querySelector('#terr-rock-density').value);
            c.querySelector('#terr-rock-val').textContent = (this._rockDensity * 100).toFixed(1) + '%';
        });

        c.querySelector('#terr-erosion')?.addEventListener('change', (e) => {
            this._erosion = e.target.checked;
        });

        c.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                c.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._sculptTool = btn.dataset.tool;
                this._updateSculptTool();
            });
        });

        const radiusSlider = c.querySelector('#terr-brush-radius');
        radiusSlider?.addEventListener('input', () => {
            this._brushRadius = parseFloat(radiusSlider.value);
            c.querySelector('#terr-radius-val').textContent = this._brushRadius;
            this._updateSculptTool();
        });

        const strengthSlider = c.querySelector('#terr-brush-strength');
        strengthSlider?.addEventListener('input', () => {
            this._brushStrength = parseFloat(strengthSlider.value);
            c.querySelector('#terr-strength-val').textContent = this._brushStrength.toFixed(2);
            this._updateSculptTool();
        });
    }

    _readGenParams() {
        const c = this.container;
        if (!c) return;
        const gW = c.querySelector('#terr-gen-w');
        const gD = c.querySelector('#terr-gen-d');
        const gS = c.querySelector('#terr-gen-seed');
        const cellSize = c.querySelector('#terr-cell-size');
        const gB = c.querySelector('#terr-biome');
        const style = c.querySelector('#terr-style');
        const oct = c.querySelector('#terr-octaves');
        const lakes = c.querySelector('#terr-lake-count');
        const lakeSize = c.querySelector('#terr-lake-size');
        const rivers = c.querySelector('#terr-river-count');
        const riverWidth = c.querySelector('#terr-river-width');
        const waterfalls = c.querySelector('#terr-waterfalls');
        const grass = c.querySelector('#terr-grass-density');
        const rocks = c.querySelector('#terr-rock-density');

        if (gW) this._genW = parseInt(gW.value) || 129;
        if (gD) this._genD = parseInt(gD.value) || 129;
        if (cellSize) this._cellSize = Math.max(1, parseFloat(cellSize.value) || 2);
        if (gS) this._seed = parseInt(gS.value) || 0;
        if (gB) this._biome = gB.value;
        if (style) this._terrainStyle = style.value || 'lowpoly';
        if (oct) this._octaves = parseInt(oct.value) || 4;
        if (lakes) this._lakeCount = parseInt(lakes.value) || 0;
        if (lakeSize) this._lakeSize = parseFloat(lakeSize.value) || 0.16;
        if (rivers) this._riverCount = parseInt(rivers.value) || 0;
        if (riverWidth) this._riverWidth = parseFloat(riverWidth.value) || 2.2;
        if (waterfalls) this._waterfalls = waterfalls.checked;
        if (grass) this._grassDensity = parseFloat(grass.value) || 0;
        if (rocks) this._rockDensity = parseFloat(rocks.value) || 0;
    }

    async _generateTerrain() {
        const editor = this.editor;
        if (!editor || !editor.THREE) return;

        this._readGenParams();
        const biome = this._biomes[this._biome] || this._biomes.temperate;
        const w = this._genW;
        const d = this._genD;

        const { elevation, moisture } = this._generateElevationWithMoisture(w, d);
        const lakeData = this._carveLakes(elevation, w, d);
        const riverData = this._carveRivers(elevation, lakeData.mask, w, d);

        if (this._erosion) {
            this._applyThermalErosion(elevation, w, d, 8);
        }

        const paletteColors = biome.palette.map(b => b.color);

        this._currentPalette = paletteColors;

        const tileSize = this._cellSize;
        const maxHeight = this._heightScale;

        const elevationOffset = this._waterLevel * maxHeight * 0.5;
        const elevOffset = new Float32Array(elevation.length);
        for (let i = 0; i < elevation.length; i++) {
            elevOffset[i] = Math.max(0, Math.min(1, elevation[i] * (1 - this._waterLevel * 0.3) + this._waterLevel * 0.15));
        }
        const filledWaterMask = this._fillWaterMask(lakeData.mask, elevOffset, w, d);
        this._deepenWaterBasins(elevOffset, filledWaterMask, w, d);

        let geo;
        if (this._terrainStyle === 'minecraft' || this._terrainStyle === 'veloren') {
            geo = this._buildVoxelTerrainGeometry(editor.THREE, elevOffset, w, d, tileSize, maxHeight, this._terrainStyle);
        } else {
            const { default: LowPolyTerrainGen } = await import('/engines/shared/LowPolyTerrainGen.js');
            const gen = new LowPolyTerrainGen();
            const { mesh } = gen.generate(elevOffset, w, d, {
                tileSize,
                maxHeight,
                jitter: 0.03,
                palette: null,
            });
            geo = mesh.geometry;
            const posAttr = geo.getAttribute('position');
            const colAttr = new Float32Array(posAttr.count * 3);

            for (let i = 0; i < posAttr.count; i++) {
                const y = posAttr.getY(i);
                const normY = y / maxHeight;
                const c = this._biomeColor(normY, paletteColors);
                colAttr[i * 3]     = c.r;
                colAttr[i * 3 + 1] = c.g;
                colAttr[i * 3 + 2] = c.b;
            }

            geo.setAttribute('color', new editor.THREE.BufferAttribute(colAttr, 3));
        }

        const mat = new editor.THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true,
        });

        editor.THREE.GeometryUtils?.mergeVertices?.(geo);
        geo.computeVertexNormals();

        const finalMesh = new editor.THREE.Mesh(geo, mat);
        const elevGrid = Array.from(elevOffset);

        finalMesh.name = `terrain_${Date.now().toString(36)}`;
        finalMesh.userData = {
            type: 'terrain',
            _isTerrain: true,
            elevationGrid: elevGrid,
            genWidth: w,
            genDepth: d,
            cellSize: tileSize,
            heightScale: maxHeight,
            biome: this._biome,
            biomePalette: biome.palette,
            terrainStyle: this._terrainStyle,
            waterLevel: this._waterLevel,
            waterColorHex: '#2a6a9a',
            waterOpacity: 0.82,
            waterMask: Array.from(filledWaterMask),
            riverPaths: riverData.paths,
            waterfallInstances: riverData.waterfalls,
            lakeCount: this._lakeCount,
            lakeSize: this._lakeSize,
            riverCount: this._riverCount,
            riverWidth: this._riverWidth,
            waterfallsEnabled: this._waterfalls,
        };
        finalMesh.receiveShadow = true;
        finalMesh.castShadow = false;

        editor._pushUndo();
        this._clearAllTerrainMeshes(editor);

        editor.scene.add(finalMesh);
        editor._terrainMeshes.push(finalMesh);
        this._terrainMesh = finalMesh;

        if (this._waterLevel > 0.02) {
            const waterY = this._waterLevel * maxHeight;
            const waterGeo = this._buildWaterGeometry(editor.THREE, filledWaterMask, elevOffset, w, d, tileSize, waterY);
            const waterMat = new editor.THREE.MeshLambertMaterial({
                color: 0x2a6a9a,
                transparent: true,
                opacity: 0.82,
                flatShading: true,
                side: editor.THREE.DoubleSide,
            });
            const water = new editor.THREE.Mesh(waterGeo, waterMat);
            water.name = `water_${Date.now().toString(36)}`;
            water.userData = {
                type: 'water',
                _isWater: true,
                waterLevelY: waterY,
                waterColorHex: '#2a6a9a',
                waterOpacity: 0.82,
                waterMask: Array.from(filledWaterMask),
                riverPaths: riverData.paths,
                genWidth: w,
                genDepth: d,
                cellSize: tileSize,
            };
            editor.scene.add(water);
            if (editor._waterMeshes) {
                for (const old of editor._waterMeshes) {
                    this._disposeObject(old);
                }
                editor._waterMeshes = [];
            }
            editor._waterMeshes.push(water);
            this._waterMesh = water;
        }

        if (this._waterfalls && riverData.waterfalls.length > 0) {
            const waterfallGroup = this._generateWaterfalls(editor, riverData.waterfalls, tileSize, maxHeight);
            finalMesh.userData.waterfallInstances = riverData.waterfalls;
            if (waterfallGroup) {
                editor._waterMeshes.push(waterfallGroup);
            }
        }

        if ((this._vegDensity > 0 || this._grassDensity > 0 || this._rockDensity > 0) && biome.vegTypes.length > 0) {
            const foliageInstances = this._generateVegetation(editor, elevOffset, w, d, tileSize, maxHeight, biome, moisture, filledWaterMask);
            finalMesh.userData.foliageInstances = foliageInstances;
        }

        editor._updateSceneTree();
        editor._markDirty();
        editor.select(finalMesh);
        this._initSculptTools();

        document.getElementById('status-info').textContent =
            `Terrain: ${w}×${d}  |  ${biome.label}  |  Seed: ${this._seed}  |  ${editor._terrainMeshes[0]?.name || ''}`;
    }

    _carveLakes(elevation, w, d) {
        const mask = new Float32Array(w * d);
        if (this._waterLevel <= 0.02) return { mask, lakes: [] };

        const rand = this._makeRand(this._seed + 4242);
        const lakes = [];
        const minDim = Math.min(w, d);
        const baseRadius = minDim * this._lakeSize;

        for (let i = 0; i < this._lakeCount; i++) {
            const cx = Math.floor(w * (0.15 + rand() * 0.7));
            const cz = Math.floor(d * (0.15 + rand() * 0.7));
            const rx = Math.max(3, baseRadius * (0.65 + rand() * 0.7));
            const rz = Math.max(3, baseRadius * (0.65 + rand() * 0.7));
            lakes.push({ cx, cz, rx, rz });

            for (let z = 1; z < d - 1; z++) {
                for (let x = 1; x < w - 1; x++) {
                    const nx = (x - cx) / rx;
                    const nz = (z - cz) / rz;
                    const dist = Math.sqrt(nx * nx + nz * nz);
                    if (dist > 1) continue;
                    const idx = z * w + x;
                    const falloff = 1 - this._fade(Math.min(1, dist));
                    const basin = this._waterLevel * 0.78 - falloff * 0.08;
                    elevation[idx] = Math.min(elevation[idx], basin);
                    mask[idx] = Math.max(mask[idx], falloff);
                }
            }
        }

        for (let i = 0; i < elevation.length; i++) {
            if (elevation[i] <= this._waterLevel * 0.92) {
                mask[i] = Math.max(mask[i], 0.35);
            }
        }

        return { mask, lakes };
    }

    _carveRivers(elevation, mask, w, d) {
        const paths = [];
        const waterfalls = [];
        if (this._waterLevel <= 0.02 || this._riverCount <= 0) return { paths, waterfalls };

        const rand = this._makeRand(this._seed + 5151);
        for (let r = 0; r < this._riverCount; r++) {
            const fromLeft = rand() > 0.5;
            let x = fromLeft ? 0 : Math.floor(rand() * w);
            let z = fromLeft ? Math.floor(rand() * d) : 0;
            const targetX = fromLeft ? w - 1 : Math.floor(rand() * w);
            const targetZ = fromLeft ? Math.floor(rand() * d) : d - 1;
            const points = [];
            const steps = Math.max(w, d) + Math.floor(rand() * Math.max(w, d) * 0.5);
            let prevNaturalHeight = null;
            let prevPoint = null;

            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const meander = Math.sin(t * Math.PI * (2 + rand() * 2) + r) * this._riverWidth * 2;
                const nx = x + (targetX - x) * t;
                const nz = z + (targetZ - z) * t;
                const px = Math.max(1, Math.min(w - 2, Math.round(nx + (fromLeft ? 0 : meander))));
                const pz = Math.max(1, Math.min(d - 2, Math.round(nz + (fromLeft ? meander : 0))));
                const naturalHeight = elevation[pz * w + px];
                points.push([px, pz]);
                this._stampRiver(elevation, mask, w, d, px, pz, this._riverWidth);

                if (i > 2 && i % 7 === 0 && prevNaturalHeight !== null && prevPoint) {
                    if (this._waterfalls && prevNaturalHeight - naturalHeight > 0.055) {
                        waterfalls.push({
                            position: [px, naturalHeight, pz],
                            height: Math.max(0.8, (prevNaturalHeight - naturalHeight) * this._heightScale),
                            width: this._riverWidth,
                            rotationY: Math.atan2(pz - prevPoint[1], px - prevPoint[0]) - Math.PI / 2,
                        });
                    }
                }
                prevNaturalHeight = naturalHeight;
                prevPoint = [px, pz];
            }
            paths.push(points);
        }

        return { paths, waterfalls: waterfalls.slice(0, 16) };
    }

    _stampRiver(elevation, mask, w, d, cx, cz, radius) {
        const r = Math.ceil(radius * 2);
        for (let z = Math.max(1, cz - r); z < Math.min(d - 1, cz + r); z++) {
            for (let x = Math.max(1, cx - r); x < Math.min(w - 1, cx + r); x++) {
                const dist = Math.hypot(x - cx, z - cz);
                if (dist > radius) continue;
                const idx = z * w + x;
                const falloff = 1 - this._fade(Math.min(1, dist / radius));
                const bed = this._waterLevel * 0.88 - falloff * 0.045;
                elevation[idx] = Math.min(elevation[idx], bed);
                mask[idx] = Math.max(mask[idx], 0.45 + falloff * 0.55);
            }
        }
    }

    _fillWaterMask(mask, elevation, w, d) {
        const filled = new Float32Array(mask);
        if (this._waterLevel <= 0.02) return filled;

        for (let i = 0; i < elevation.length; i++) {
            if (elevation[i] <= this._waterLevel + 0.015) {
                filled[i] = Math.max(filled[i], 0.55);
            }
        }

        for (let pass = 0; pass < 2; pass++) {
            const next = new Float32Array(filled);
            for (let z = 1; z < d - 1; z++) {
                for (let x = 1; x < w - 1; x++) {
                    const idx = z * w + x;
                    if (filled[idx] > 0.02) continue;
                    let wet = 0;
                    for (let dz = -1; dz <= 1; dz++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dz === 0) continue;
                            if (filled[(z + dz) * w + (x + dx)] > 0.02) wet++;
                        }
                    }
                    if (wet >= 5) next[idx] = 0.45;
                }
            }
            filled.set(next);
        }

        return filled;
    }

    _deepenWaterBasins(elevation, waterMask, w, d) {
        if (!waterMask || this._waterLevel <= 0.02) return;

        for (let z = 1; z < d - 1; z++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = z * w + x;
                const wet = Math.max(0, Math.min(1, Number(waterMask[idx] || 0)));
                if (wet <= 0.02) continue;

                let neighborDry = 0;
                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dz === 0) continue;
                        if ((waterMask[(z + dz) * w + (x + dx)] || 0) <= 0.02) neighborDry++;
                    }
                }

                const shoreBlend = Math.max(0, Math.min(1, neighborDry / 5));
                const targetDepth = 0.08 + wet * 0.30;
                const shoreShelf = shoreBlend * 0.12;
                const bed = Math.max(0.012, this._waterLevel - targetDepth + shoreShelf);
                elevation[idx] = Math.min(elevation[idx], bed);
            }
        }
    }

    _generateWaterfalls(editor, waterfalls, tileSize, maxHeight) {
        const THREE = editor.THREE;
        const group = new THREE.Group();
        group.name = `waterfalls_${Date.now().toString(36)}`;
        group.userData = { type: 'waterfalls', _isWater: true, instances: waterfalls };
        const mat = new THREE.MeshLambertMaterial({
            color: 0x9ddcff,
            transparent: true,
            opacity: 0.72,
            flatShading: true,
            side: THREE.DoubleSide,
        });

        for (let i = 0; i < waterfalls.length; i++) {
            const wf = waterfalls[i];
            const width = Math.max(0.8, wf.width);
            const height = Math.max(0.8, wf.height);
            const geo = new THREE.PlaneGeometry(width, height, 3, 6);
            const mesh = new THREE.Mesh(geo, mat.clone());
            mesh.name = `waterfall_${i}`;
            mesh.position.set(wf.position[0] * tileSize, wf.position[1] * maxHeight + height * 0.5, wf.position[2] * tileSize);
            mesh.rotation.y = wf.rotationY || 0;
            mesh.userData = { type: 'waterfall', _isWater: true };
            group.add(mesh);

            const mist = new THREE.Mesh(
                new THREE.SphereGeometry(width * 0.45, 6, 4),
                new THREE.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.22, depthWrite: false })
            );
            mist.name = `waterfall_mist_${i}`;
            mist.position.set(mesh.position.x, mesh.position.y - height * 0.45, mesh.position.z);
            mist.scale.set(1.4, 0.35, 0.8);
            group.add(mist);
        }

        editor.scene.add(group);
        return group;
    }

    _buildVoxelTerrainGeometry(THREE, elevation, w, d, tileSize, maxHeight, style) {
        const positions = [];
        const colors = [];
        const cellsX = w - 1;
        const cellsZ = d - 1;
        const quant = style === 'veloren' ? 2 : 1;
        const minStep = style === 'veloren' ? 0.5 : 1;

        const heightAt = (x, z) => {
            const v = elevation[Math.max(0, Math.min(d - 1, z)) * w + Math.max(0, Math.min(w - 1, x))] || 0;
            return Math.max(minStep, Math.round(v * maxHeight * quant) / quant);
        };

        const pushColor = (color, shade = 1) => {
            for (let i = 0; i < 6; i++) {
                colors.push(
                    Math.min(1, color.r * shade),
                    Math.min(1, color.g * shade),
                    Math.min(1, color.b * shade),
                );
            }
        };

        const addQuad = (verts, color, shade = 1) => {
            const [a, b, c, d0] = verts;
            positions.push(...a, ...b, ...c, ...a, ...c, ...d0);
            pushColor(color, shade);
        };

        for (let z = 0; z < cellsZ; z++) {
            for (let x = 0; x < cellsX; x++) {
                const h = heightAt(x, z);
                const c = this._biomeColor(Math.min(1, h / maxHeight));
                const x0 = x * tileSize;
                const x1 = (x + 1) * tileSize;
                const z0 = z * tileSize;
                const z1 = (z + 1) * tileSize;

                addQuad([[x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0]], c, 1.04);

                const neighbors = [
                    { h: z > 0 ? heightAt(x, z - 1) : 0, face: 'north' },
                    { h: z < cellsZ - 1 ? heightAt(x, z + 1) : 0, face: 'south' },
                    { h: x > 0 ? heightAt(x - 1, z) : 0, face: 'west' },
                    { h: x < cellsX - 1 ? heightAt(x + 1, z) : 0, face: 'east' },
                ];

                for (const n of neighbors) {
                    if (n.h >= h) continue;
                    const y0 = n.h;
                    const y1 = h;
                    const sideColor = this._biomeColor(Math.min(1, (h * 0.78) / maxHeight));
                    if (n.face === 'north') addQuad([[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]], sideColor, 0.72);
                    if (n.face === 'south') addQuad([[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], sideColor, 0.78);
                    if (n.face === 'west') addQuad([[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], sideColor, 0.68);
                    if (n.face === 'east') addQuad([[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], sideColor, 0.82);
                }
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geo.computeVertexNormals();
        return geo;
    }

    _buildWaterGeometry(THREE, mask, elevation, w, d, tileSize, waterY) {
        const positions = [];
        const addTri = (ax, az, bx, bz, cx, cz) => {
            positions.push(ax, waterY + 0.025, az, bx, waterY + 0.025, bz, cx, waterY + 0.025, cz);
        };
        for (let z = 0; z < d - 1; z++) {
            for (let x = 0; x < w - 1; x++) {
                const i00 = z * w + x;
                const i10 = z * w + x + 1;
                const i01 = (z + 1) * w + x;
                const i11 = (z + 1) * w + x + 1;
                const m = Math.max(mask[i00] || 0, mask[i10] || 0, mask[i01] || 0, mask[i11] || 0);
                const avgHeight = ((elevation?.[i00] || 0) + (elevation?.[i10] || 0) + (elevation?.[i01] || 0) + (elevation?.[i11] || 0)) / 4;
                const submerged = avgHeight <= this._waterLevel + 0.025;
                if (m <= 0.02 && !submerged) continue;
                const x0 = x * tileSize;
                const x1 = (x + 1) * tileSize;
                const z0 = z * tileSize;
                const z1 = (z + 1) * tileSize;
                addTri(x0, z0, x0, z1, x1, z1);
                addTri(x0, z0, x1, z1, x1, z0);
            }
        }
        if (positions.length === 0) {
            const cx = (w - 1) * tileSize * 0.5;
            const cz = (d - 1) * tileSize * 0.5;
            addTri(cx - 0.5, cz - 0.5, cx - 0.5, cz + 0.5, cx + 0.5, cz + 0.5);
            addTri(cx - 0.5, cz - 0.5, cx + 0.5, cz + 0.5, cx + 0.5, cz - 0.5);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.computeVertexNormals();
        return geo;
    }

    _clearAllTerrainMeshes(editor) {
        for (const list of [editor._terrainMeshes, editor._waterMeshes, editor._foliageMeshes]) {
            if (list) {
                for (const m of list) {
                    this._disposeObject(m);
                }
                list.length = 0;
            }
        }
        this._terrainMesh = null;
        this._waterMesh = null;
        this._foliageGroup = null;
    }

    _disposeObject(obj) {
        if (!obj) return;
        obj.parent?.remove(obj);
        obj.traverse?.(child => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
            else child.material?.dispose?.();
        });
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
        else obj.material?.dispose?.();
    }

    _generateElevationWithMoisture(width, depth) {
        const perm = this._buildPermTable(this._seed);
        const biome = this._biomes[this._biome] || this._biomes.temperate;
        const freq = this._frequency;
        const octaves = this._octaves;
        const lacunarity = this._lacunarity;
        const gain = this._gain;

        const grid = new Float32Array(width * depth);
        const moisture = new Float32Array(width * depth);
        const permM = this._buildPermTable(this._seed + 9999);

        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                let amp = 1;
                let fm = freq;
                let value = 0;
                let maxAmp = 0;

                for (let o = 0; o < octaves; o++) {
                    const nx = x * fm;
                    const nz = z * fm;
                    const n = this._perlin3D(nx, 0, nz, perm);
                    value += n * amp;
                    maxAmp += amp;
                    amp *= gain;
                    fm *= lacunarity;
                }

                let h = value / maxAmp;
                h = (h + 1) * 0.5;

                let mVal = 0;
                let mAmp = 1;
                let mFreq = freq * 0.5;
                for (let o = 0; o < 3; o++) {
                    mVal += this._perlin3D(x * mFreq, this._seed * 0.01, z * mFreq, permM) * mAmp;
                    mAmp *= 0.5;
                    mFreq *= 2;
                }
                moisture[z * width + x] = (mVal + 1) * 0.5;

                const noiseType = biome.noiseType || 'perlin';
                switch (noiseType) {
                    case 'hills':
                        h = Math.pow(h, 1.3);
                        break;
                    case 'mountains':
                        h = Math.pow(h, 0.6);
                        break;
                    case 'canyon': {
                        const ridge = 1 - Math.abs(h - 0.5) * 2;
                        h = Math.pow(ridge, 1.5) * 0.8 + 0.1;
                        break;
                    }
                    case 'islands': {
                        const dx = (x / width - 0.5) * 2;
                        const dz = (z / depth - 0.5) * 2;
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        const falloff = 1 - Math.min(1, dist * 1.4);
                        h = h * falloff;
                        h = Math.max(0, Math.pow(h, 1.8));
                        break;
                    }
                    case 'flat':
                        h = 0.15;
                        break;
                }

                grid[z * width + x] = Math.max(0, Math.min(1, h));
            }
        }

        return { elevation: grid, moisture };
    }

    _applyThermalErosion(grid, w, d, iterations) {
        const slopeThreshold = 0.03;
        const erosionRate = 0.05;
        const copy = new Float32Array(grid);

        for (let iter = 0; iter < iterations; iter++) {
            for (let z = 1; z < d - 1; z++) {
                for (let x = 1; x < w - 1; x++) {
                    const i = z * w + x;
                    const h = copy[i];
                    let maxDiff = 0;
                    let maxIdx = -1;

                    const neighbors = [
                        (z - 1) * w + x,
                        (z + 1) * w + x,
                        z * w + (x - 1),
                        z * w + (x + 1),
                    ];

                    for (const ni of neighbors) {
                        const diff = h - copy[ni];
                        if (diff > maxDiff) {
                            maxDiff = diff;
                            maxIdx = ni;
                        }
                    }

                    if (maxDiff > slopeThreshold && maxIdx !== -1) {
                        const move = maxDiff * erosionRate;
                        copy[i] -= move;
                        copy[maxIdx] += move;
                    }
                }
            }
        }

        for (let i = 0; i < grid.length; i++) {
            grid[i] = copy[i];
        }
    }

    _generateVegetation(editor, elevation, w, d, tileSize, maxHeight, biome, moisture, waterMask = null) {
        const THREE = editor.THREE;
        const perm = this._buildPermTable(this._seed + 777);
        const rand = this._makeRand(this._seed + 8888);
        const vegGroup = new THREE.Group();
        vegGroup.name = `foliage_${Date.now().toString(36)}`;

        const hasBushes = biome.vegTypes.includes('bush');
        const treeTarget = Math.floor(w * d * this._vegDensity * (hasBushes ? 0.72 : 1));
        const bushTarget = hasBushes ? Math.floor(w * d * this._vegDensity * 0.95) : 0;
        const shoreCells = this._collectShoreCells(elevation, w, d, maxHeight, waterMask);
        const waterEdgeCells = this._collectWaterEdgeCells(elevation, w, d, waterMask);
        const rockTarget = Math.floor(w * d * this._rockDensity);
        const shoreTarget = Math.min(shoreCells.length, Math.floor(shoreCells.length * 0.52));
        const aquaticTarget = Math.min(waterEdgeCells.length, Math.floor(waterEdgeCells.length * 0.62));
        const grassTarget = Math.floor(w * d * this._grassDensity);

        const treePositions = [];
        const bushPositions = [];
        const rockPositions = [];
        const shorePositions = [];
        const aquaticPositions = [];
        const grassPositions = [];
        const totalTarget = treeTarget + bushTarget + rockTarget + shoreTarget + aquaticTarget + grassTarget;

        for (let i = 0; i < totalTarget * 14; i++) {
            if (
                treePositions.length >= treeTarget &&
                bushPositions.length >= bushTarget &&
                rockPositions.length >= rockTarget &&
                shorePositions.length >= shoreTarget &&
                aquaticPositions.length >= aquaticTarget &&
                grassPositions.length >= grassTarget
            ) break;

            if (aquaticPositions.length < aquaticTarget && waterEdgeCells.length > 0 && rand() < 0.48) {
                const cell = waterEdgeCells[Math.floor(rand() * waterEdgeCells.length)];
                const jitter = tileSize * 0.55;
                const x = cell.gx * tileSize + (rand() - 0.5) * jitter;
                const z = cell.gz * tileSize + (rand() - 0.5) * jitter;
                const waterY = this._waterLevel * maxHeight;
                const roll = rand();
                const kind = roll < 0.50 ? 'lily' : roll < 0.86 ? 'reed' : 'rock';
                const y = kind === 'lily' ? waterY + 0.045 : waterY - 0.06;
                aquaticPositions.push({ x, z, y, kind, s: 0.28 + rand() * 0.45, r: rand() * Math.PI * 2 });
                continue;
            }

            if (shorePositions.length < shoreTarget && shoreCells.length > 0 && rand() < 0.34) {
                const cell = shoreCells[Math.floor(rand() * shoreCells.length)];
                const jitter = tileSize * 0.42;
                const x = cell.gx * tileSize + (rand() - 0.5) * jitter;
                const z = cell.gz * tileSize + (rand() - 0.5) * jitter;
                const y = cell.height * maxHeight;
                const roll = rand();
                const kind = roll < 0.58 ? 'reed' : roll < 0.82 ? 'bush' : 'rock';
                shorePositions.push({ x, z, y, kind, s: 0.22 + rand() * 0.42, r: rand() * Math.PI * 2 });
                continue;
            }

            const x = rand() * (w - 1) * tileSize;
            const z = rand() * (d - 1) * tileSize;
            const gx = Math.round(x / tileSize);
            const gz = Math.round(z / tileSize);
            if (gx <= 1 || gx >= w - 2 || gz <= 1 || gz >= d - 2) continue;
            if (waterMask && waterMask[gz * w + gx] > 0.03) continue;

            const h = elevation[gz * w + gx];
            const worldY = h * maxHeight;
            const waterY = this._waterLevel * maxHeight;

            if (worldY < waterY + 0.3 || worldY > maxHeight * 0.85) continue;

            const noiseVal = this._perlin3D(gx * 0.3, 0, gz * 0.3, perm);
            const groveNoise = this._perlin3D(gx * 0.08, 0, gz * 0.08, perm);
            const meadowNoise = this._perlin3D(gx * 0.16, 9.3, gz * 0.16, perm);
            const m = moisture[gz * w + gx] || 0.5;
            const slope = this._vegetationSlope(elevation, w, d, gx, gz);

            if (rockPositions.length < rockTarget && noiseVal < -0.08 && biome.vegTypes.includes('rock')) {
                rockPositions.push({ x, z, y: worldY, s: 0.3 + rand() * 0.5, r: rand() * Math.PI * 2 });
            } else if (treePositions.length < treeTarget && slope < 0.095 && groveNoise > -0.12 && noiseVal > -0.05 && m > 0.28) {
                const treeKinds = biome.vegTypes.filter(t => t === 'pine' || t === 'oak' || t === 'palm');
                const t = treeKinds.length > 0
                    ? treeKinds[Math.floor(rand() * treeKinds.length)]
                    : 'bush';
                treePositions.push({ x, z, y: worldY, type: t, s: 0.45 + rand() * 0.65, r: rand() * Math.PI * 2 });
            } else if (bushPositions.length < bushTarget && slope < 0.13 && noiseVal > -0.28 && m > 0.24) {
                bushPositions.push({ x, z, y: worldY, s: 0.35 + rand() * 0.5, r: rand() * Math.PI * 2 });
            } else if (grassPositions.length < grassTarget && slope < 0.16 && meadowNoise > -0.45 && m > 0.16 && biome.vegTypes.includes('grass')) {
                grassPositions.push({ x, z, y: worldY, s: 0.12 + rand() * 0.22, r: rand() * Math.PI * 2 });
            }
        }

        let vegIdx = 0;
        const instances = [];
        for (const t of treePositions) {
            const tree = this._makeTree(THREE, t.type, t.s);
            tree.position.set(t.x, t.y, t.z);
            tree.rotation.y = t.r;
            tree.name = `${t.type}_${vegIdx++}`;
            vegGroup.add(tree);
            instances.push({ kind: t.type, position: [t.x, t.y, t.z], scale: t.s, rotationY: t.r });
        }

        for (const r of rockPositions) {
            const rock = this._makeRock(THREE, r.s);
            rock.position.set(r.x, r.y, r.z);
            rock.rotation.set(0.2, r.r, 0.15);
            rock.name = `rock_${vegIdx++}`;
            vegGroup.add(rock);
            instances.push({ kind: 'rock', position: [r.x, r.y, r.z], scale: r.s, rotationY: r.r });
        }

        for (const s of shorePositions) {
            const obj = s.kind === 'reed'
                ? this._makeReed(THREE, s.s)
                : s.kind === 'rock'
                    ? this._makeRock(THREE, s.s)
                    : this._makeBush(THREE, s.s);
            obj.position.set(s.x, s.y, s.z);
            obj.rotation.y = s.r;
            obj.name = `${s.kind}_${vegIdx++}`;
            vegGroup.add(obj);
            instances.push({ kind: s.kind, position: [s.x, s.y, s.z], scale: s.s, rotationY: s.r });
        }

        for (const a of aquaticPositions) {
            const obj = a.kind === 'lily'
                ? this._makeLily(THREE, a.s)
                : a.kind === 'reed'
                    ? this._makeReed(THREE, a.s * 1.15)
                    : this._makeRock(THREE, a.s * 0.85);
            obj.position.set(a.x, a.y, a.z);
            obj.rotation.y = a.r;
            obj.name = `${a.kind}_${vegIdx++}`;
            vegGroup.add(obj);
            instances.push({ kind: a.kind, position: [a.x, a.y, a.z], scale: a.s, rotationY: a.r });
        }

        for (const b of bushPositions) {
            const bush = this._makeBush(THREE, b.s);
            bush.position.set(b.x, b.y, b.z);
            bush.rotation.y = b.r;
            bush.name = `bush_${vegIdx++}`;
            vegGroup.add(bush);
            instances.push({ kind: 'bush', position: [b.x, b.y, b.z], scale: b.s, rotationY: b.r });
        }

        for (const g of grassPositions) {
            const grass = this._makeGrass(THREE, g.s);
            grass.position.set(g.x, g.y, g.z);
            grass.rotation.y = g.r;
            grass.name = `grass_${vegIdx++}`;
            vegGroup.add(grass);
            instances.push({ kind: 'grass', position: [g.x, g.y, g.z], scale: g.s, rotationY: g.r });
        }

        if (editor._foliageMeshes) {
            for (const old of editor._foliageMeshes) {
                old.parent?.remove(old);
                old.traverse?.(c => { c.geometry?.dispose(); if (c.material) c.material.dispose(); });
            }
            editor._foliageMeshes = [];
        }
        editor._foliageMeshes = [vegGroup];
        editor.scene.add(vegGroup);
        this._foliageGroup = vegGroup;
        vegGroup.userData = { type: 'foliage', _isFoliage: true, instances };
        return instances;
    }

    _collectShoreCells(elevation, w, d, maxHeight, waterMask = null) {
        if (!waterMask || this._waterLevel <= 0.02) return [];
        const cells = [];
        const waterY = this._waterLevel * maxHeight;
        for (let gz = 2; gz < d - 2; gz++) {
            for (let gx = 2; gx < w - 2; gx++) {
                const idx = gz * w + gx;
                if (waterMask[idx] > 0.03) continue;
                const worldY = (elevation[idx] || 0) * maxHeight;
                if (worldY < waterY + 0.08 || worldY > waterY + 1.25) continue;
                let wetNeighbors = 0;
                for (let dz = -1; dz <= 1; dz++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dz === 0) continue;
                        if (waterMask[(gz + dz) * w + (gx + dx)] > 0.08) wetNeighbors++;
                    }
                }
                if (wetNeighbors > 0 && wetNeighbors < 7) {
                    cells.push({ gx, gz, height: elevation[idx] || 0, wetNeighbors });
                }
            }
        }
        return cells;
    }

    _collectWaterEdgeCells(elevation, w, d, waterMask = null) {
        if (!waterMask || this._waterLevel <= 0.02) return [];
        const cells = [];
        for (let gz = 2; gz < d - 2; gz++) {
            for (let gx = 2; gx < w - 2; gx++) {
                const idx = gz * w + gx;
                if (waterMask[idx] <= 0.08 || waterMask[idx] > 0.78) continue;
                let landNeighbors = 0;
                for (let dz = -2; dz <= 2; dz++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        if (dx === 0 && dz === 0) continue;
                        const n = (gz + dz) * w + (gx + dx);
                        if (waterMask[n] <= 0.03) landNeighbors++;
                    }
                }
                if (landNeighbors >= 2) cells.push({ gx, gz, height: elevation[idx] || 0, landNeighbors });
            }
        }
        return cells;
    }

    _vegetationSlope(elevation, w, d, gx, gz) {
        const c = elevation[gz * w + gx] || 0;
        const dx = Math.abs((elevation[gz * w + Math.min(w - 1, gx + 1)] || c) - (elevation[gz * w + Math.max(0, gx - 1)] || c));
        const dz = Math.abs((elevation[Math.min(d - 1, gz + 1) * w + gx] || c) - (elevation[Math.max(0, gz - 1) * w + gx] || c));
        return Math.max(dx, dz);
    }

    _makeTree(THREE, type, scale) {
        const group = new THREE.Group();
        const trunkH = scale * 1.2;
        const trunkR = scale * 0.08;

        if (type === 'palm') {
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(trunkR * 0.5, trunkR * 1.5, trunkH, 5),
                new THREE.MeshLambertMaterial({ color: 0x8B5A2B, flatShading: true })
            );
            trunk.position.y = trunkH / 2;
            group.add(trunk);

            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
                const frond = new THREE.Mesh(
                    new THREE.PlaneGeometry(scale * 0.8, scale * 0.25),
                    new THREE.MeshLambertMaterial({ color: 0x2d8a3f, side: THREE.DoubleSide, flatShading: true })
                );
                frond.position.set(Math.cos(angle) * scale * 0.3, trunkH - 0.1, Math.sin(angle) * scale * 0.3);
                frond.rotation.x = 0.6 + Math.random() * 0.3;
                frond.rotation.y = angle;
                group.add(frond);
            }
        } else {
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(trunkR, trunkR * 1.3, trunkH, 5),
                new THREE.MeshLambertMaterial({ color: 0x6B4226, flatShading: true })
            );
            trunk.position.y = trunkH / 2;
            group.add(trunk);

            const crownR = scale * 0.6;
            const crown = new THREE.Mesh(
                new THREE.SphereGeometry(crownR, 5, 4),
                new THREE.MeshLambertMaterial({ color: type === 'pine' ? 0x1a5a2f : 0x3a8a3f, flatShading: true })
            );
            crown.position.y = trunkH + crownR * 0.4;
            crown.scale.y = type === 'pine' ? 1.8 : 0.9;
            group.add(crown);

            if (type === 'oak') {
                const crown2 = crown.clone();
                crown2.position.x = crownR * 0.5;
                crown2.position.z = crownR * 0.3;
                crown2.scale.set(0.7, 0.7, 0.7);
                group.add(crown2);
            }
        }

        group.userData = { type: 'vegetation' };
        return group;
    }

    _makeRock(THREE, scale) {
        const geo = new THREE.DodecahedronGeometry(scale * 0.4);
        const mat = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(0.08, 0.05, 0.35 + Math.random() * 0.25),
            flatShading: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { type: 'vegetation' };
        return mesh;
    }

    _makeBush(THREE, scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(0.30 + Math.random() * 0.04, 0.58, 0.28 + Math.random() * 0.16),
            flatShading: true,
        });
        const core = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.46, 6, 4), mat);
        core.scale.set(1.2, 0.62, 1);
        core.position.y = scale * 0.28;
        group.add(core);
        const lobe = core.clone();
        lobe.scale.set(0.75, 0.5, 0.75);
        lobe.position.set(scale * 0.32, scale * 0.24, scale * 0.18);
        group.add(lobe);
        group.userData = { type: 'vegetation', kind: 'bush' };
        return group;
    }

    _makeReed(THREE, scale) {
        const group = new THREE.Group();
        const stemMat = new THREE.MeshLambertMaterial({ color: 0x6f8f3a, flatShading: true });
        const tipMat = new THREE.MeshLambertMaterial({ color: 0x8a5d2c, flatShading: true });
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const h = scale * (1.4 + Math.random() * 1.1);
            const a = (i / count) * Math.PI * 2 + Math.random() * 0.35;
            const off = scale * 0.12;
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.018, scale * 0.024, h, 4), stemMat);
            stem.position.set(Math.cos(a) * off, h * 0.5, Math.sin(a) * off);
            stem.rotation.z = (Math.random() - 0.5) * 0.16;
            group.add(stem);
            const tip = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.035, scale * 0.025, scale * 0.28, 5), tipMat);
            tip.position.set(stem.position.x, h + scale * 0.12, stem.position.z);
            group.add(tip);
        }
        group.userData = { type: 'vegetation', kind: 'reed' };
        return group;
    }

    _makeLily(THREE, scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(0.29 + Math.random() * 0.05, 0.54, 0.28 + Math.random() * 0.12),
            side: THREE.DoubleSide,
            flatShading: true,
        });
        const geo = new THREE.CircleGeometry(scale * 0.42, 7, 0.18, Math.PI * 1.72);
        const pad = new THREE.Mesh(geo, mat);
        pad.rotation.x = -Math.PI / 2;
        pad.position.y = 0.012;
        group.add(pad);
        if (Math.random() > 0.55) {
            const flower = new THREE.Mesh(
                new THREE.ConeGeometry(scale * 0.07, scale * 0.08, 5),
                new THREE.MeshLambertMaterial({ color: 0xd9b6d8, flatShading: true })
            );
            flower.position.set(scale * 0.08, scale * 0.06, scale * 0.02);
            group.add(flower);
        }
        group.userData = { type: 'vegetation', kind: 'lily' };
        return group;
    }

    _makeGrass(THREE, scale) {
        const group = new THREE.Group();
        const bladeH = scale * 1.8;
        const mat = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(0.28 + Math.random() * 0.08, 0.65, 0.28 + Math.random() * 0.18),
            side: THREE.DoubleSide,
            flatShading: true,
        });
        for (let i = 0; i < 5; i++) {
            const blade = new THREE.Mesh(new THREE.PlaneGeometry(scale * 0.18, bladeH), mat);
            const a = (i / 5) * Math.PI * 2;
            blade.position.set(Math.cos(a) * scale * 0.08, bladeH * 0.5, Math.sin(a) * scale * 0.08);
            blade.rotation.y = a;
            blade.rotation.x = 0.15 + Math.random() * 0.25;
            group.add(blade);
        }
        group.userData = { type: 'grass' };
        return group;
    }

    _biomeColor(normY, paletteHexes) {
        const bands = this._biomes[this._biome]?.palette || this._biomes.temperate.palette;
        let hex = '#888888';
        for (const band of bands) {
            if (normY <= band.threshold) { hex = band.color; break; }
        }
        const c = this._editor?.THREE?.Color ? new this.editor.THREE.Color(hex) : (() => {
            const r = parseInt(hex.slice(1,3), 16) / 255;
            const g = parseInt(hex.slice(3,5), 16) / 255;
            const b = parseInt(hex.slice(5,7), 16) / 255;
            return { r, g, b };
        })();
        return c;
    }

    _buildPermTable(seed) {
        const p = new Uint8Array(512);
        const arr = [];
        for (let i = 0; i < 256; i++) arr.push(i);
        let s = seed || 0;
        for (let i = 255; i > 0; i--) {
            s = (s * 16807 + 0) % 2147483647;
            const j = s % (i + 1);
            const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        for (let i = 0; i < 512; i++) p[i] = arr[i & 255];
        return p;
    }

    _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    _lerp(t, a, b) { return a + t * (b - a); }
    _grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    _perlin3D(x, y, z, perm) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const zf = z - Math.floor(z);
        const u = this._fade(xf);
        const v = this._fade(yf);
        const w = this._fade(zf);
        const p = perm;
        const A  = p[X] + Y;
        const AA = p[A] + Z;
        const AB = p[A + 1] + Z;
        const B  = p[X + 1] + Y;
        const BA = p[B] + Z;
        const BB = p[B + 1] + Z;
        return this._lerp(w,
            this._lerp(v,
                this._lerp(u, this._grad(p[AA], xf, yf, zf), this._grad(p[BA], xf - 1, yf, zf)),
                this._lerp(u, this._grad(p[AB], xf, yf - 1, zf), this._grad(p[BB], xf - 1, yf - 1, zf))),
            this._lerp(v,
                this._lerp(u, this._grad(p[AA + 1], xf, yf, zf - 1), this._grad(p[BA + 1], xf - 1, yf, zf - 1)),
                this._lerp(u, this._grad(p[AB + 1], xf, yf - 1, zf - 1), this._grad(p[BB + 1], xf - 1, yf - 1, zf - 1))));
    }

    _makeRand(seed) {
        let s = Math.max(1, Math.floor(seed || 1) % 2147483647);
        return () => {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    _initSculptTools() {
        if (!this.editor || !this._terrainMesh) return;
        if (this._sculptInstance) { this._sculptInstance.dispose(); this._sculptInstance = null; }

        import('/engines/shared/editor/TriSculptTools.js').then(mod => {
            const TriSculptTools = mod.default;
            this._sculptInstance = new TriSculptTools(
                this.editor.scene, this.editor.camera, this.editor.renderer.domElement
            );
            this._sculptInstance.setMesh(this._terrainMesh);
            const tool = this._sculptTool || 'raise';
            this._sculptInstance.setTool(tool === 'lower' ? 'elevate' : tool === 'raise' ? 'elevate' : tool);
            this._sculptInstance.setBrushRadius(this._brushRadius);
            this._sculptInstance.setBrushStrength(this._brushStrength);
        }).catch(e => console.warn('[TerrainEditorPanel] TriSculptTools not available:', e));
    }

    _updateSculptTool() {
        if (!this._sculptInstance) return;
        const tool = this._sculptTool || 'raise';
        this._sculptInstance.setTool(tool === 'lower' ? 'elevate' : tool === 'raise' ? 'elevate' : tool);
        this._sculptInstance.setBrushRadius(this._brushRadius);
        this._sculptInstance.setBrushStrength(this._brushStrength);
    }

    onSceneRebuilt(levelData) {
        if (this.editor) {
            const terrainMesh = this.editor._terrainMeshes?.[0];
            if (terrainMesh) {
                this._terrainMesh = terrainMesh;
                this._initSculptTools();
            }
            this._waterMesh = this.editor._waterMeshes?.[0] || null;
            this._foliageGroup = this.editor._foliageMeshes?.[0] || null;
        }
    }

    onSerialize(data) {
        data.terrain = data.terrain || {};
        data.terrain.genWidth = this._genW;
        data.terrain.genDepth = this._genD;
        data.terrain.cellSize = this._cellSize;
        data.terrain.heightScale = this._heightScale;
        data.terrain.seed = this._seed;
        data.terrain.biome = this._biome;
        data.terrain.style = this._terrainStyle;
        data.terrain.waterLevel = this._waterLevel;
        data.terrain.vegDensity = this._vegDensity;
        data.terrain.lakeCount = this._lakeCount;
        data.terrain.lakeSize = this._lakeSize;
        data.terrain.riverCount = this._riverCount;
        data.terrain.riverWidth = this._riverWidth;
        data.terrain.waterfalls = this._waterfalls;
        data.terrain.grassDensity = this._grassDensity;
        data.terrain.rockDensity = this._rockDensity;
        data.terrain.erosion = this._erosion;
    }

    onModeChanged(mode) {}

    getDrawState() {
        return {
            mode: 'pencil',
            tool: this._sculptTool || 'raise',
            block: 'terrain',
            width: 1, height: 1, depth: 1,
            snap: false,
        };
    }

    dispose() {
        if (this._sculptInstance) { this._sculptInstance.dispose(); this._sculptInstance = null; }
        this._terrainMesh = null;
        this._waterMesh = null;
        this._foliageGroup = null;
        if (this.container) this.container.innerHTML = '';
    }
}
