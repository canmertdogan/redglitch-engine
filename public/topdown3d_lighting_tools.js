/**
 * topdown3d_lighting_tools.js — Phase 24
 * Lighting & Sky Editor for the Topdown 3D Studio.
 * Self-installs as window.__topdown3dLightingTools.
 *
 * Features:
 *   - Sun directional light gizmo: hemisphere drag (azimuth + elevation)
 *   - Time-of-day presets: dawn, noon, dusk, night (palette-safe flat colors)
 *   - Sky dome: low-poly sphere mesh with 2-color vertical gradient
 *   - Ambient light color picker
 *   - Exponential fog: color + density
 *   - Emissive block helpers (glow via emissive material color, no baking)
 *   - All settings serialized into level JSON under { lighting: {} }
 *
 * No HDR, no lightmap baking, no PBR — flat / Lambert only.
 */
(function () {
    'use strict';

    /* ── Time-of-day presets (all palette-safe flat sRGB) ─────────────────── */
    const TOD_PRESETS = {
        dawn: {
            sunColor: '#ff9966', sunIntensity: 0.7,
            ambientColor: '#331122', ambientIntensity: 0.4,
            skyTop: '#1a0a22', skyHorizon: '#ff6644',
            fogColor: '#aa5533', fogDensity: 0.03
        },
        noon: {
            sunColor: '#ffffee', sunIntensity: 1.2,
            ambientColor: '#334455', ambientIntensity: 0.5,
            skyTop: '#1155aa', skyHorizon: '#6699cc',
            fogColor: '#8899aa', fogDensity: 0.01
        },
        dusk: {
            sunColor: '#ff8844', sunIntensity: 0.6,
            ambientColor: '#221133', ambientIntensity: 0.3,
            skyTop: '#110a22', skyHorizon: '#cc4422',
            fogColor: '#773322', fogDensity: 0.04
        },
        night: {
            sunColor: '#334466', sunIntensity: 0.15,
            ambientColor: '#080818', ambientIntensity: 0.2,
            skyTop: '#030310', skyHorizon: '#0a0a28',
            fogColor: '#060612', fogDensity: 0.06
        }
    };

    /* ── Emissive block presets (used by voxel terrain for glow types) ─────── */
    const EMISSIVE_PRESETS = {
        lava:      { color: '#ff4400', emissive: '#cc2200', emissiveIntensity: 0.8 },
        glowstone: { color: '#ffcc44', emissive: '#ffaa00', emissiveIntensity: 0.7 },
        neon_blue: { color: '#0088ff', emissive: '#0044cc', emissiveIntensity: 1.0 },
        neon_pink: { color: '#ff0088', emissive: '#cc0055', emissiveIntensity: 1.0 }
    };

    /* ── Sky Dome ─────────────────────────────────────────────────────────── */
    class SkyDome {
        constructor(THREE, scene) {
            this._THREE = THREE;
            this._scene = scene;
            this._mesh = null;
            this._topColor = '#1155aa';
            this._horizColor = '#6699cc';
            this._build();
        }

        _build() {
            const THREE = this._THREE;
            // Low-poly sphere — 8 lat × 8 lon segments for flat/faceted look
            const geo = new THREE.SphereGeometry(800, 8, 8);
            // Vertex-color gradient: top vertices → skyTop, equator+ → skyHorizon
            geo.computeBoundingBox();
            const posAttr = geo.attributes.position;
            const colorArr = new Float32Array(posAttr.count * 3);
            const cTop  = new THREE.Color(this._topColor);
            const cHorz = new THREE.Color(this._horizColor);
            for (let i = 0; i < posAttr.count; i++) {
                const y = posAttr.getY(i);
                const t = Math.max(0, Math.min(1, (y + 800) / 800)); // 0 at -800, 1 at top
                const c = new THREE.Color().lerpColors(cHorz, cTop, t * t);
                colorArr[i * 3]     = c.r;
                colorArr[i * 3 + 1] = c.g;
                colorArr[i * 3 + 2] = c.b;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
            const mat = new THREE.MeshBasicMaterial({
                vertexColors: true,
                side: THREE.BackSide,
                fog: false
            });
            this._mesh = new THREE.Mesh(geo, mat);
            this._mesh.name = '__skyDome';
            this._mesh.renderOrder = -1;
            this._scene.add(this._mesh);
        }

        setColors(topHex, horizHex) {
            this._topColor   = topHex;
            this._horizColor = horizHex;
            const THREE = this._THREE;
            const cTop  = new THREE.Color(topHex);
            const cHorz = new THREE.Color(horizHex);
            const posAttr   = this._mesh.geometry.attributes.position;
            const colorAttr = this._mesh.geometry.attributes.color;
            for (let i = 0; i < posAttr.count; i++) {
                const y = posAttr.getY(i);
                const t = Math.max(0, Math.min(1, (y + 800) / 800));
                const c = new THREE.Color().lerpColors(cHorz, cTop, t * t);
                colorAttr.setXYZ(i, c.r, c.g, c.b);
            }
            colorAttr.needsUpdate = true;
        }

        dispose() {
            this._mesh.geometry.dispose();
            this._mesh.material.dispose();
            this._scene.remove(this._mesh);
        }

        serialize() {
            return { topColor: this._topColor, horizColor: this._horizColor };
        }

        apply(data) {
            this.setColors(data.topColor, data.horizColor);
        }
    }

    /* ── Sun Gizmo (visual hemisphere arc) ────────────────────────────────── */
    class SunGizmo {
        constructor(THREE, scene) {
            this._THREE = THREE;
            this._scene = scene;
            this._mesh  = null;
            this._azimuth   = 45;  // degrees, 0 = +Z
            this._elevation = 45;  // degrees, 0 = horizon, 90 = zenith
            this._build();
        }

        _build() {
            const THREE = this._THREE;
            // Small icosahedron to represent the sun
            const geo = new THREE.IcosahedronGeometry(4, 0);
            const mat = new THREE.MeshBasicMaterial({ color: '#ffcc22', fog: false });
            this._mesh = new THREE.Mesh(geo, mat);
            this._mesh.name = '__sunGizmo';
            this._scene.add(this._mesh);
            this._updatePos();
        }

        _updatePos() {
            const az  = this._azimuth   * Math.PI / 180;
            const el  = this._elevation * Math.PI / 180;
            const r   = 200;
            this._mesh.position.set(
                r * Math.cos(el) * Math.sin(az),
                r * Math.sin(el),
                r * Math.cos(el) * Math.cos(az)
            );
        }

        setAzimuth(deg)   { this._azimuth   = deg;  this._updatePos(); }
        setElevation(deg) { this._elevation = deg;  this._updatePos(); }

        getSunDir() {
            const THREE = this._THREE;
            return new THREE.Vector3(
                -this._mesh.position.x,
                -this._mesh.position.y,
                -this._mesh.position.z
            ).normalize();
        }

        dispose() {
            this._mesh.geometry.dispose();
            this._mesh.material.dispose();
            this._scene.remove(this._mesh);
        }

        serialize() {
            return { azimuth: this._azimuth, elevation: this._elevation };
        }

        apply(data) {
            this.setAzimuth(data.azimuth ?? 45);
            this.setElevation(data.elevation ?? 45);
        }
    }

    /* ── LightingToolsPlugin ───────────────────────────────────────────────── */
    class LightingToolsPlugin {
        constructor(ed) {
            this._ed      = ed;
            this._THREE   = ed.THREE;
            this._scene   = ed.scene;

            // Managed lights
            this._sunLight  = null;   // THREE.DirectionalLight
            this._ambLight  = null;   // THREE.AmbientLight
            this._skyDome   = null;   // SkyDome instance
            this._sunGizmo  = null;   // SunGizmo instance

            // State
            this._state = {
                sunColor:       '#ffffee',
                sunIntensity:   1.2,
                sunAzimuth:     45,
                sunElevation:   45,
                ambientColor:   '#334455',
                ambientIntensity: 0.5,
                skyTop:         '#1155aa',
                skyHorizon:     '#6699cc',
                fogEnabled:     true,
                fogColor:       '#8899aa',
                fogDensity:     0.01,
                skyVisible:     true
            };

            this._buildScene();
            this._buildUI();
            this._patchApplyLevel();
            this._bindKeys();
        }

        /* ── Scene objects ──────────────────────────────────────────────────── */
        _buildScene() {
            const THREE = this._THREE;
            const scene = this._scene;

            // Remove any existing default lights (editor sets up some in init)
            scene.traverse(obj => {
                if (obj.isLight && obj.name !== '__userLight') {
                    // Keep user scene lights; replace phase-21 defaults
                    if (obj.name.startsWith('__default')) scene.remove(obj);
                }
            });

            // Directional (sun)
            this._sunLight = new THREE.DirectionalLight(this._state.sunColor, this._state.sunIntensity);
            this._sunLight.name = '__sunLight';
            scene.add(this._sunLight);

            // Ambient
            this._ambLight = new THREE.AmbientLight(this._state.ambientColor, this._state.ambientIntensity);
            this._ambLight.name = '__ambLight';
            scene.add(this._ambLight);

            // Sky dome
            this._skyDome = new SkyDome(THREE, scene);

            // Sun gizmo
            this._sunGizmo = new SunGizmo(THREE, scene);

            // Fog
            this._applyFog();
            this._applySunDirection();
        }

        _applyFog() {
            const THREE = this._THREE;
            const s = this._state;
            if (s.fogEnabled) {
                this._scene.fog = new THREE.FogExp2(s.fogColor, s.fogDensity);
            } else {
                this._scene.fog = null;
            }
        }

        _applySunDirection() {
            const dir = this._sunGizmo.getSunDir();
            this._sunLight.position.copy(dir.clone().negate().multiplyScalar(200));
            this._sunLight.target.position.set(0, 0, 0);
            if (!this._scene.children.includes(this._sunLight.target)) {
                this._scene.add(this._sunLight.target);
            }
        }

        /* ── UI ─────────────────────────────────────────────────────────────── */
        _buildUI() {
            const panel = document.getElementById('panel-lights');
            if (!panel) return;
            panel.innerHTML = this._html();
            this._bindUI();
            this._syncUIFromState();
        }

        _html() {
            return `
<!-- Time-of-Day Presets -->
<div class="section-header">TIME OF DAY</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px">
    <button class="btn tod-btn" data-tod="dawn"  title="Dawn">Dawn</button>
    <button class="btn tod-btn" data-tod="noon"  title="Noon">Noon</button>
    <button class="btn tod-btn" data-tod="dusk"  title="Dusk">Dusk</button>
    <button class="btn tod-btn" data-tod="night" title="Night">Night</button>
</div>

<!-- Sun / Directional Light -->
<div class="section-header">SUN LIGHT</div>
<div class="field-row">
    <label>COLOR</label>
    <input type="color" id="lt-sun-color" value="#ffffee">
</div>
<div class="field-row">
    <label>INTENSITY</label>
    <input type="range" id="lt-sun-intensity" min="0" max="3" step="0.05" value="1.2">
    <span class="val" id="lt-sun-intensity-val">1.20</span>
</div>
<div class="field-row">
    <label>AZIMUTH</label>
    <input type="range" id="lt-sun-az" min="0" max="360" step="1" value="45">
    <span class="val" id="lt-sun-az-val">45°</span>
</div>
<div class="field-row">
    <label>ELEVATION</label>
    <input type="range" id="lt-sun-el" min="5" max="90" step="1" value="45">
    <span class="val" id="lt-sun-el-val">45°</span>
</div>

<!-- Ambient -->
<div class="section-header">AMBIENT</div>
<div class="field-row">
    <label>COLOR</label>
    <input type="color" id="lt-amb-color" value="#334455">
</div>
<div class="field-row">
    <label>INTENSITY</label>
    <input type="range" id="lt-amb-intensity" min="0" max="2" step="0.05" value="0.5">
    <span class="val" id="lt-amb-intensity-val">0.50</span>
</div>

<!-- Sky Dome -->
<div class="section-header">SKY DOME
    <label style="float:right;font-size:.75rem;font-weight:normal">
        <input type="checkbox" id="lt-sky-visible" checked> VISIBLE
    </label>
</div>
<div class="field-row">
    <label>TOP COLOR</label>
    <input type="color" id="lt-sky-top" value="#1155aa">
</div>
<div class="field-row">
    <label>HORIZON</label>
    <input type="color" id="lt-sky-horizon" value="#6699cc">
</div>

<!-- Fog -->
<div class="section-header">FOG (EXPONENTIAL)
    <label style="float:right;font-size:.75rem;font-weight:normal">
        <input type="checkbox" id="lt-fog-enabled" checked> ENABLED
    </label>
</div>
<div class="field-row">
    <label>COLOR</label>
    <input type="color" id="lt-fog-color" value="#8899aa">
</div>
<div class="field-row">
    <label>DENSITY</label>
    <input type="range" id="lt-fog-density" min="0" max="0.2" step="0.001" value="0.01">
    <span class="val" id="lt-fog-density-val">0.010</span>
</div>

<!-- Emissive Helpers -->
<div class="section-header">EMISSIVE PRESETS</div>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-bottom:8px">
    <button class="btn emissive-btn" data-em="lava"      title="Lava glow" style="color:#ff6633">🔴 LAVA</button>
    <button class="btn emissive-btn" data-em="glowstone" title="Glowstone" style="color:#ffcc44">🟡 GLOW</button>
    <button class="btn emissive-btn" data-em="neon_blue" title="Neon blue" style="color:#0088ff">🔵 NEON</button>
    <button class="btn emissive-btn" data-em="neon_pink" title="Neon pink" style="color:#ff0088">🟣 NEON</button>
</div>
<div style="font-size:.75rem;color:#444;padding:0 0 6px 0">
    Click to apply emissive glow to selected prop
</div>

<!-- Scene Lights (legacy point/spot lights from Phase 21) -->
<div class="section-header" style="margin-top:4px">SCENE POINT LIGHTS</div>
<div style="display:flex;gap:4px;margin-bottom:6px">
    <select id="lt-type-select" style="flex:1">
        <option value="point">Point</option>
        <option value="spot">Spot</option>
        <option value="hemisphere">Hemisphere</option>
    </select>
    <input type="color" id="lt-pt-color" value="#ffffff" style="width:34px">
    <input type="number" id="lt-pt-intensity" value="1.0" step="0.1" min="0" style="width:52px">
    <button class="btn" id="lt-add-pt-btn" title="Add light"><i class="fa fa-plus"></i></button>
</div>
<div id="lights-list">
    <div style="color:#444;font-size:.85rem;padding:4px 0">No scene lights.</div>
</div>`;
        }

        _bindUI() {
            const g  = id => document.getElementById(id);
            const s  = this._state;

            // Time-of-day presets
            document.querySelectorAll('.tod-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const preset = TOD_PRESETS[btn.dataset.tod];
                    if (!preset) return;
                    Object.assign(s, preset);
                    this._applyAllToScene();
                    this._syncUIFromState();
                    this._ed.markDirty();
                });
            });

            // Sun color/intensity
            g('lt-sun-color').addEventListener('input', e => {
                s.sunColor = e.target.value;
                this._sunLight.color.set(s.sunColor);
                this._ed.markDirty();
            });
            this._makeRange('lt-sun-intensity', 'lt-sun-intensity-val', v => {
                s.sunIntensity = v;
                this._sunLight.intensity = v;
            }, v => v.toFixed(2));

            // Sun direction
            this._makeRange('lt-sun-az', 'lt-sun-az-val', v => {
                s.sunAzimuth = v;
                this._sunGizmo.setAzimuth(v);
                this._applySunDirection();
            }, v => v + '°');
            this._makeRange('lt-sun-el', 'lt-sun-el-val', v => {
                s.sunElevation = v;
                this._sunGizmo.setElevation(v);
                this._applySunDirection();
            }, v => v + '°');

            // Ambient
            g('lt-amb-color').addEventListener('input', e => {
                s.ambientColor = e.target.value;
                this._ambLight.color.set(s.ambientColor);
                this._ed.markDirty();
            });
            this._makeRange('lt-amb-intensity', 'lt-amb-intensity-val', v => {
                s.ambientIntensity = v;
                this._ambLight.intensity = v;
            }, v => v.toFixed(2));

            // Sky
            g('lt-sky-visible').addEventListener('change', e => {
                s.skyVisible = e.target.checked;
                if (this._skyDome._mesh) this._skyDome._mesh.visible = s.skyVisible;
                this._ed.markDirty();
            });
            g('lt-sky-top').addEventListener('input', e => {
                s.skyTop = e.target.value;
                this._skyDome.setColors(s.skyTop, s.skyHorizon);
                this._ed.markDirty();
            });
            g('lt-sky-horizon').addEventListener('input', e => {
                s.skyHorizon = e.target.value;
                this._skyDome.setColors(s.skyTop, s.skyHorizon);
                this._ed.markDirty();
            });

            // Fog
            g('lt-fog-enabled').addEventListener('change', e => {
                s.fogEnabled = e.target.checked;
                this._applyFog();
                this._ed.markDirty();
            });
            g('lt-fog-color').addEventListener('input', e => {
                s.fogColor = e.target.value;
                if (this._scene.fog) this._scene.fog.color.set(s.fogColor);
                this._ed.markDirty();
            });
            this._makeRange('lt-fog-density', 'lt-fog-density-val', v => {
                s.fogDensity = v;
                if (this._scene.fog) this._scene.fog.density = v;
                else this._applyFog();
            }, v => v.toFixed(3));

            // Emissive buttons
            document.querySelectorAll('.emissive-btn').forEach(btn => {
                btn.addEventListener('click', () => this._applyEmissive(btn.dataset.em));
            });

            // Legacy point/spot light add button
            g('lt-add-pt-btn').addEventListener('click', () => {
                const type  = g('lt-type-select').value;
                const color = g('lt-pt-color').value;
                const inten = parseFloat(g('lt-pt-intensity').value) || 1;
                this._ed.addSceneLight({ type, color, intensity: inten, position: { x: 0, y: 10, z: 0 } });
                this._refreshLightsList();
            });
        }

        _makeRange(id, valId, onChange, fmt) {
            const inp = document.getElementById(id);
            const lbl = document.getElementById(valId);
            if (!inp) return;
            const handler = () => {
                const v = parseFloat(inp.value);
                if (lbl) lbl.textContent = fmt ? fmt(v) : v;
                onChange(v);
                this._ed.markDirty();
            };
            inp.addEventListener('input', handler);
        }

        _syncUIFromState() {
            const s = this._state;
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
            const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

            set('lt-sun-color', s.sunColor);
            set('lt-sun-intensity', s.sunIntensity);     setTxt('lt-sun-intensity-val', s.sunIntensity.toFixed(2));
            set('lt-sun-az', s.sunAzimuth);              setTxt('lt-sun-az-val', s.sunAzimuth + '°');
            set('lt-sun-el', s.sunElevation);            setTxt('lt-sun-el-val', s.sunElevation + '°');
            set('lt-amb-color', s.ambientColor);
            set('lt-amb-intensity', s.ambientIntensity); setTxt('lt-amb-intensity-val', s.ambientIntensity.toFixed(2));
            set('lt-sky-top', s.skyTop);
            set('lt-sky-horizon', s.skyHorizon);
            setChk('lt-sky-visible', s.skyVisible);
            set('lt-fog-color', s.fogColor);
            set('lt-fog-density', s.fogDensity);         setTxt('lt-fog-density-val', s.fogDensity.toFixed(3));
            setChk('lt-fog-enabled', s.fogEnabled);
        }

        _applyAllToScene() {
            const s = this._state;
            this._sunLight.color.set(s.sunColor);
            this._sunLight.intensity = s.sunIntensity;
            this._ambLight.color.set(s.ambientColor);
            this._ambLight.intensity = s.ambientIntensity;
            this._sunGizmo.setAzimuth(s.sunAzimuth);
            this._sunGizmo.setElevation(s.sunElevation);
            this._applySunDirection();
            this._skyDome.setColors(s.skyTop, s.skyHorizon);
            if (this._skyDome._mesh) this._skyDome._mesh.visible = s.skyVisible;
            this._applyFog();
        }

        _refreshLightsList() {
            // Delegate to editor's built-in lights list rebuild if available
            if (typeof this._ed.state?.level?.lights !== 'undefined') {
                const list = document.getElementById('lights-list');
                if (!list) return;
                const lights = this._ed.state.level.lights ?? [];
                if (lights.length === 0) {
                    list.innerHTML = '<div style="color:#444;font-size:.85rem;padding:4px 0">No scene lights.</div>';
                    return;
                }
                list.innerHTML = lights.map((l, i) => `
                    <div class="light-item" data-idx="${i}">
                        <span class="light-color-dot" style="background:${l.color ?? '#fff'}"></span>
                        <span class="light-name">${l.type ?? 'point'} ${i + 1}</span>
                        <span class="light-type-badge">${l.type ?? ''}</span>
                        <button class="btn" style="padding:2px 5px;font-size:.7rem" data-del-light="${i}">✕</button>
                    </div>
                `).join('');
                list.querySelectorAll('[data-del-light]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = parseInt(btn.dataset.delLight);
                        const id  = lights[idx]?.id;
                        if (id) this._ed.removeSceneLight(id);
                        this._refreshLightsList();
                    });
                });
            }
        }

        /* ── Emissive application ──────────────────────────────────────────── */
        _applyEmissive(name) {
            const preset = EMISSIVE_PRESETS[name];
            if (!preset) return;
            // Apply to selected prop if one is selected
            const objTools = window.__topdown3dObjectTools;
            if (!objTools) {
                this._ed.setStatus(`Select a prop first to apply emissive: ${name}`);
                return;
            }
            const sel = objTools.placer?._selected;
            if (!sel) { this._ed.setStatus('Select a prop to apply emissive preset.'); return; }
            const entry = objTools.placer._props.get(sel);
            if (!entry) return;
            entry.obj.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material = child.material.clone();
                    child.material.color.set(preset.color);
                    child.material.emissive = new this._THREE.Color(preset.emissive);
                    child.material.emissiveIntensity = preset.emissiveIntensity;
                }
            });
            this._ed.markDirty();
            this._ed.setStatus(`Emissive "${name}" applied.`);
        }

        /* ── Serialization ─────────────────────────────────────────────────── */
        serialize() {
            return Object.assign({}, this._state);
        }

        deserialize(data) {
            if (!data) return;
            Object.assign(this._state, data);
            this._applyAllToScene();
            this._syncUIFromState();
        }

        /* ── Level JSON patch ──────────────────────────────────────────────── */
        _patchApplyLevel() {
            const ed   = this._ed;
            const self = this;
            const orig = ed.applyLevelJSON.bind(ed);
            ed.applyLevelJSON = function (lvlJson) {
                orig(lvlJson);
                if (lvlJson?.lighting) {
                    self.deserialize(lvlJson.lighting);
                }
            };

            // Also patch buildLevelJSON to include lighting
            const origBuild = ed.buildLevelJSON.bind(ed);
            ed.buildLevelJSON = function () {
                const json = origBuild();
                json.lighting = self.serialize();
                return json;
            };
        }

        /* ── Keyboard ─────────────────────────────────────────────────────── */
        _bindKeys() {
            document.addEventListener('keydown', e => {
                // Ctrl+L = apply noon preset quickly
                if (e.ctrlKey && e.key === 'l') {
                    e.preventDefault();
                    const preset = TOD_PRESETS.noon;
                    Object.assign(this._state, preset);
                    this._applyAllToScene();
                    this._syncUIFromState();
                    this._ed.markDirty();
                }
            });
        }
    }

    /* ── Auto-install ──────────────────────────────────────────────────────── */
    function install() {
        const ed = window.__topdown3dEditor;
        if (!ed || !ed.THREE || !ed.scene) {
            setTimeout(install, 200);
            return;
        }
        if (window.__topdown3dLightingTools) return; // already installed
        const plugin = new LightingToolsPlugin(ed);
        window.__topdown3dLightingTools = plugin;
        ed._lightingToolsPlugin = plugin;
        console.log('[LightingTools] Phase 24 installed — sun/sky/fog/emissive ready.');
    }

    install();
})();
