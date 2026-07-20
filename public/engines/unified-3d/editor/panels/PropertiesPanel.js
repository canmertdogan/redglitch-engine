import * as THREE from '/lib/three/three.module.js';
import { ShaderRegistry } from '/engines/shared/ShaderRegistry.js';

export default class PropertiesPanel {
    constructor(editor) {
        this.editor = editor;
    }

    _updatePropertiesPanel() {
        const panel = document.getElementById('properties-panel');
        if (!panel) return;

        if (this.editor._selected.length === 0) {
            panel.innerHTML = '<div class="panel-empty">No selection</div>';
            return;
        }

        const obj = this.editor._selected[0];

        if (obj._isEnvironment) {
            const sky = this.editor._levelData?.skybox || this.editor._getDefaultSkybox(this.editor._mode);
            panel.innerHTML = `
                <div class="prop-group">
                    <div class="prop-label">Mode</div>
                    <select class="prop-input" data-env-field="type">
                        <option value="solid" ${sky.type==='solid'?'selected':''}>Solid</option>
                        <option value="gradient" ${sky.type==='gradient'?'selected':''}>Gradient</option>
                        <option value="voxel" ${sky.type==='voxel'?'selected':''}>Voxel (Procedural)</option>
                    </select>
                </div>
                <div class="prop-group">
                    <div class="prop-label">Top Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${sky.topColor || '#000000'}" data-env-field="topColor">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Bottom Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${sky.bottomColor || '#000000'}" data-env-field="bottomColor">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group">
                    <div class="prop-label">Ambient Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${sky.ambientColor || '#ffffff'}" data-env-field="ambientColor">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Ambient Intensity</div>
                    <input type="number" step="0.05" class="prop-input" value="${sky.ambientIntensity !== undefined ? sky.ambientIntensity : 0.3}" data-env-field="ambientIntensity">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group">
                    <div class="prop-label">Fog Sync</div>
                    <input type="checkbox" ${sky.fogSync ? 'checked' : ''} data-env-field="fogSync">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Fog Density</div>
                    <input type="number" step="0.001" class="prop-input" value="${sky.fogDensity !== undefined ? sky.fogDensity : 0.02}" data-env-field="fogDensity">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group">
                    <div class="prop-label">Sun Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${sky.sun?.color || '#ffffff'}" data-env-field="sun.color">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Sun Intensity</div>
                    <input type="number" step="0.1" class="prop-input" value="${sky.sun?.intensity || 1.2}" data-env-field="sun.intensity">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Sun Azimuth</div>
                    <input type="number" step="1" class="prop-input" value="${sky.sun?.azimuth || 45}" data-env-field="sun.azimuth">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Sun Elevation</div>
                    <input type="number" step="1" class="prop-input" value="${sky.sun?.elevation || 45}" data-env-field="sun.elevation">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Moon</div>
                <div class="prop-group">
                    <div class="prop-label">Moon Enabled</div>
                    <input type="checkbox" ${sky.moon?.enabled !== false ? 'checked' : ''} data-env-field="moon.enabled">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Moon Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${sky.moon?.color || '#dce8ff'}" data-env-field="moon.color">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Moon Intensity</div>
                    <input type="number" step="0.05" class="prop-input" value="${sky.moon?.intensity !== undefined ? sky.moon.intensity : 0.25}" data-env-field="moon.intensity">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Moon Azimuth</div>
                    <input type="number" step="1" class="prop-input" value="${sky.moon?.azimuth !== undefined ? sky.moon.azimuth : 225}" data-env-field="moon.azimuth">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Moon Elevation</div>
                    <input type="number" step="1" class="prop-input" value="${sky.moon?.elevation !== undefined ? sky.moon.elevation : 25}" data-env-field="moon.elevation">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Weather</div>
                <div class="prop-group">
                    <div class="prop-label">Enabled</div>
                    <input type="checkbox" ${sky.weather?.enabled ? 'checked' : ''} data-env-field="weather.enabled">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Type</div>
                    <select class="prop-input" data-env-field="weather.type">
                        <option value="clear" ${(sky.weather?.type || 'clear') === 'clear' ? 'selected' : ''}>Clear</option>
                        <option value="rain" ${sky.weather?.type === 'rain' ? 'selected' : ''}>Rain</option>
                        <option value="snow" ${sky.weather?.type === 'snow' ? 'selected' : ''}>Snow</option>
                        <option value="fog" ${sky.weather?.type === 'fog' ? 'selected' : ''}>Fog</option>
                        <option value="ash" ${sky.weather?.type === 'ash' ? 'selected' : ''}>Ash</option>
                    </select>
                </div>
                <div class="prop-group">
                    <div class="prop-label">Intensity</div>
                    <input type="number" step="0.05" min="0" max="1" class="prop-input" value="${sky.weather?.intensity !== undefined ? sky.weather.intensity : 0.35}" data-env-field="weather.intensity">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Wind X</div>
                    <input type="number" step="0.1" class="prop-input" value="${sky.weather?.windX !== undefined ? sky.weather.windX : 0.4}" data-env-field="weather.windX">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Wind Z</div>
                    <input type="number" step="0.1" class="prop-input" value="${sky.weather?.windZ !== undefined ? sky.weather.windZ : 0.1}" data-env-field="weather.windZ">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group">
                    <div class="prop-label">Voxel Seed</div>
                    <input type="number" step="1" class="prop-input" value="${sky.seed || 1337}" data-env-field="seed">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Cloud Speed</div>
                    <input type="number" step="0.01" class="prop-input" value="${sky.cloudSpeed || 0.02}" data-env-field="cloudSpeed">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Post-Processing Stack</div>
                ${this._renderPostProcessingStack()}
            `;

            panel.querySelectorAll('input, select').forEach(input => {
                if (input.classList.contains('pp-input')) return; // handled separately
                input.addEventListener('change', () => {
                    const field = input.dataset.envField;
                    if (!field) return;
                    let val = input.type === 'checkbox' ? input.checked : input.value;
                    if (input.type === 'number') val = parseFloat(val);
                    this.editor._applyEnvironmentChange(field, val);
                });
            });

            this._bindPostProcessingEvents(panel);
            return;
        }

        if (obj._isMaterial) {
            const mat = (this.editor._levelData?.materials || []).find(m => m.id === obj.id);
            if (!mat) return;

            panel.innerHTML = `
                <div class="prop-group">
                    <div class="prop-label">Material Name</div>
                    <input type="text" class="prop-input" value="${mat.name || ''}" data-mat-field="name">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Shader Type</div>
                    <select class="prop-input" data-mat-field="shader_id">
                        ${ShaderRegistry.getAvailableShaders().map(s => 
                            `<option value="${s.id}" ${(mat.shader_id || 'standard') === s.id ? 'selected' : ''}>${s.name}</option>`
                        ).join('')}
                    </select>
                </div>
                ${(mat.shader_id && mat.shader_id !== 'standard') ? `
                <div class="prop-group" style="padding:4px 12px;">
                    <button class="kas-btn" id="btn-edit-shader" style="width:100%; border-color:var(--text-accent); color:var(--text-accent);"><i class="fas fa-code"></i> EDIT SHADER SOURCE</button>
                </div>
                ` : ''}
                ${this._renderShaderUniformsUI(mat)}
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Color Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${mat.channels?.color?.color || '#ffffff'}" data-mat-field="channels.color.color">
                </div>
                </div>
                ${this._renderLayersUI(mat)}
                <div class="prop-group">
                    <div class="prop-label">Tiling</div>
                    <div class="prop-vec3" style="grid-template-columns: 1fr 1fr;">
                        <input type="number" step="0.1" value="${mat.channels?.color?.tilingX ?? 1.0}" data-mat-field="channels.color.tilingX">
                        <input type="number" step="0.1" value="${mat.channels?.color?.tilingY ?? 1.0}" data-mat-field="channels.color.tilingY">
                    </div>
                </div>
                <div class="prop-group">
                    <div class="prop-label">Offset</div>
                    <div class="prop-vec3" style="grid-template-columns: 1fr 1fr;">
                        <input type="number" step="0.1" value="${mat.channels?.color?.offsetX ?? 0.0}" data-mat-field="channels.color.offsetX">
                        <input type="number" step="0.1" value="${mat.channels?.color?.offsetY ?? 0.0}" data-mat-field="channels.color.offsetY">
                    </div>
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Luminance Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Emission</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${mat.channels?.luminance?.value || '#000000'}" data-mat-field="channels.luminance.value">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Reflectance Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Roughness</div>
                    <input type="number" step="0.05" min="0" max="1" class="prop-input" value="${mat.channels?.reflectance?.roughness ?? 0.8}" data-mat-field="channels.reflectance.roughness">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Metalness</div>
                    <input type="number" step="0.05" min="0" max="1" class="prop-input" value="${mat.channels?.reflectance?.metalness ?? 0.0}" data-mat-field="channels.reflectance.metalness">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Normal Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Normal Map</div>
                    <input type="text" class="prop-input" placeholder="/assets/textures/normal.png" value="${mat.channels?.normal?.map || ''}" data-mat-field="channels.normal.map">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Intensity</div>
                    <input type="number" step="0.1" class="prop-input" value="${mat.channels?.normal?.intensity ?? 1.0}" data-mat-field="channels.normal.intensity">
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Transparency Channel</div>
                <div class="prop-group">
                    <div class="prop-label">Opacity</div>
                    <input type="number" step="0.1" min="0" max="1" class="prop-input" value="${mat.channels?.transparency?.opacity ?? 1.0}" data-mat-field="channels.transparency.opacity">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Alpha Map</div>
                    <input type="text" class="prop-input" placeholder="/assets/textures/alpha.png" value="${mat.channels?.transparency?.alphaMap || ''}" data-mat-field="channels.transparency.alphaMap">
                </div>
                ${this._renderMaterialPropertiesUI(mat)}
                <div class="prop-group" style="padding:12px;">
                    <button class="kas-btn" id="btn-delete-mat" style="width:100%; border-color:var(--kas-red); color:var(--kas-red);"><i class="fas fa-trash"></i> DELETE MATERIAL</button>
                </div>
            `;

            panel.querySelectorAll('input, select').forEach(input => {
                // Skip if it's a custom property key/value or inline shader uniform, we handle them separately
                if (input.classList.contains('custom-prop-key') || input.classList.contains('custom-prop-val') || input.classList.contains('inline-shader-uniform')) return;
                
                input.addEventListener('change', () => {
                    const field = input.dataset.matField;
                    let val = input.value;
                    if (input.type === 'number') val = parseFloat(val);
                    this.editor._applyMaterialChange(mat.id, field, val);
                });
            });

            panel.querySelectorAll('.inline-shader-uniform').forEach(input => {
                input.addEventListener('change', (e) => {
                    const key = e.target.dataset.key;
                    const matId = e.target.dataset.matId;
                    
                    const matDef = (this.editor._levelData?.materials || []).find(m => m.id === matId);
                    if (!matDef) return;
                    if (!matDef.shader_uniforms) matDef.shader_uniforms = {};
                    
                    this.editor._pushUndo();
                    
                    let parsed = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                    
                    const applyToLiveMaterial = (baseKey, axis, rawVal) => {
                        if (this.editor.scene) {
                            this.editor.scene.traverse(child => {
                                if (child.isMesh && child.material && child.material.userData.materialId === matId) {
                                    const uniforms = child.material.userData.shader_uniforms;
                                    if (uniforms && uniforms[baseKey] && uniforms[baseKey].value) {
                                        if (axis) {
                                            uniforms[baseKey].value[axis] = rawVal;
                                        } else if (uniforms[baseKey].value.isColor) {
                                            uniforms[baseKey].value.set(rawVal);
                                        } else {
                                            uniforms[baseKey].value = rawVal;
                                        }
                                    }
                                }
                            });
                        }
                    };

                    if (key.endsWith('_x') || key.endsWith('_y')) {
                        const baseKey = key.slice(0, -2);
                        const axis = key.slice(-1);
                        if (!matDef.shader_uniforms[baseKey]) matDef.shader_uniforms[baseKey] = {};
                        matDef.shader_uniforms[baseKey][axis] = parsed;
                        applyToLiveMaterial(baseKey, axis, parsed);
                    } else {
                        matDef.shader_uniforms[key] = parsed;
                        applyToLiveMaterial(key, null, parsed);
                    }
                    
                    this.editor._markDirty();
                });
            });

            panel.querySelectorAll('.custom-prop-key').forEach(input => {
                input.addEventListener('change', (e) => {
                    this.editor._updateMaterialPropertyKey(mat.id, e.target.dataset.oldKey, e.target.value);
                });
            });

            panel.querySelectorAll('.custom-prop-val').forEach(input => {
                input.addEventListener('change', (e) => {
                    this.editor._updateMaterialPropertyValue(mat.id, e.target.dataset.key, e.target.value);
                });
            });

            const btnAddProp = document.getElementById('btn-add-mat-prop');
            if (btnAddProp) {
                btnAddProp.addEventListener('click', () => {
                    this.editor._addMaterialProperty(mat.id);
                });
            }

            panel.querySelectorAll('.btn-del-mat-prop').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.editor._removeMaterialProperty(mat.id, e.target.dataset.key);
                });
            });

            const btnDel = document.getElementById('btn-delete-mat');
            if (btnDel) {
                btnDel.addEventListener('click', () => {
                    if (confirm('Delete this material?')) {
                        this.editor._deleteMaterial(mat.id);
                    }
                });
            }

            const btnEditShader = document.getElementById('btn-edit-shader');
            if (btnEditShader) {
                btnEditShader.addEventListener('click', () => {
                    if (this.editor.shaderEditorUI) {
                        this.editor.shaderEditorUI.open(mat.shader_id, mat.id);
                    }
                });
            }

            // Wire layer specific buttons
            panel.querySelectorAll('.btn-add-layer').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const channel = e.target.dataset.channel;
                    this.editor._addMaterialLayer(mat.id, channel);
                });
            });
            panel.querySelectorAll('.btn-del-layer').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const channel = e.target.dataset.channel;
                    const index = parseInt(e.target.dataset.index, 10);
                    this.editor._removeMaterialLayer(mat.id, channel, index);
                });
            });

            return;
        }

        if (obj.userData && obj.userData._isLight) {
            const ldata = this.editor._levelData.lights.find(l => l.id === obj.name);
            if (!ldata) return;

            const p = obj.position;
            panel.innerHTML = `
                <div style="padding:8px 12px 4px; display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-size:11px; font-weight:bold; color:var(--text-accent);">💡 Point Light</span>
                    <button class="kas-btn icon" id="btn-delete-selected" style="height:20px; width:20px; font-size:10px; border-color:var(--kas-red); color:var(--kas-red);" title="Delete Light (Del)"><i class="fas fa-trash"></i></button>
                </div>
                <div class="prop-group">
                    <div class="prop-label">Name</div>
                    <input type="text" class="prop-input" value="${obj.name || ''}" data-light-field="name">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Position</div>
                    <div class="prop-vec3">
                        <input type="number" step="0.1" value="${p.x.toFixed(2)}" data-light-field="px">
                        <input type="number" step="0.1" value="${p.y.toFixed(2)}" data-light-field="py">
                        <input type="number" step="0.1" value="${p.z.toFixed(2)}" data-light-field="pz">
                    </div>
                </div>
                <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
                <div class="prop-group">
                    <div class="prop-label">Color</div>
                    <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${ldata.colorHex || '#ffffff'}" data-light-field="colorHex">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Intensity</div>
                    <input type="number" step="0.1" class="prop-input" value="${ldata.intensity !== undefined ? ldata.intensity : 1.0}" data-light-field="intensity">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Radius / Dist</div>
                    <input type="number" step="1" class="prop-input" value="${ldata.distance !== undefined ? ldata.distance : 20}" data-light-field="distance">
                </div>
                <div class="prop-group">
                    <div class="prop-label">Cast Shadow</div>
                    <input type="checkbox" ${ldata.castShadow ? 'checked' : ''} data-light-field="castShadow">
                </div>
            `;

            panel.querySelectorAll('input').forEach(input => {
                input.addEventListener('change', () => {
                    const field = input.dataset.lightField;
                    if (!field) return;
                    let val = input.type === 'checkbox' ? input.checked : input.value;
                    if (input.type === 'number') val = parseFloat(val);
                    
                    this.editor._pushUndo();
                    if (field === 'name') {
                        ldata.id = val;
                        obj.name = val;
                    } else if (field === 'px') { ldata.position[0] = val; obj.position.x = val; }
                    else if (field === 'py') { ldata.position[1] = val; obj.position.y = val; }
                    else if (field === 'pz') { ldata.position[2] = val; obj.position.z = val; }
                    else {
                        ldata[field] = val;
                    }
                    
                    if (field === 'colorHex') obj.material.color.set(val);
                    
                    this.editor._markDirty();
                    if (field !== 'px' && field !== 'py' && field !== 'pz') {
                         this.editor._rebuildScene(this.editor._levelData);
                    } else {
                         this.editor._commitTransformToLevelData(obj);
                    }
                });
            });

            const delBtn = panel.querySelector('#btn-delete-selected');
            if (delBtn) {
                delBtn.addEventListener('click', () => {
                    this.editor._deleteSelected();
                });
            }

            return;
        }

        const p = obj.position;
        const r = obj.rotation;
        const s = obj.scale;

        const shapeType = obj.userData?.shape_type || 'box';
        const shapeLabel = { box: '📦 Box', sphere: '🔵 Sphere', cylinder: '🏛 Cylinder', cone: '△ Cone', plane: '▭ Plane', capsule: '💊 Capsule' }[shapeType] || '📦 Mesh';

        panel.innerHTML = `
            <div style="padding:8px 12px 4px; display:flex; align-items:center; justify-content:space-between;">
                <span style="font-size:11px; font-weight:bold; color:var(--text-accent);">${shapeLabel}</span>
                <button class="kas-btn icon" id="btn-delete-selected" style="height:20px; width:20px; font-size:10px; border-color:var(--kas-red); color:var(--kas-red);" title="Delete Object (Del)"><i class="fas fa-trash"></i></button>
            </div>
            <div class="prop-group">
                <div class="prop-label">Name</div>
                <input type="text" class="prop-input" value="${obj.name || ''}" data-field="name">
            </div>
            ${this._renderMaterialAssignmentsUI(obj)}
            <div class="prop-group">
                <div class="prop-label">Position</div>
                <div class="prop-vec3">
                    <input type="number" step="0.1" value="${p.x.toFixed(2)}" data-field="px">
                    <input type="number" step="0.1" value="${p.y.toFixed(2)}" data-field="py">
                    <input type="number" step="0.1" value="${p.z.toFixed(2)}" data-field="pz">
                </div>
            </div>
            <div class="prop-group">
                <div class="prop-label">Rotation (°)</div>
                <div class="prop-vec3">
                    <input type="number" step="1" value="${(r.x * 180/Math.PI).toFixed(1)}" data-field="rx">
                    <input type="number" step="1" value="${(r.y * 180/Math.PI).toFixed(1)}" data-field="ry">
                    <input type="number" step="1" value="${(r.z * 180/Math.PI).toFixed(1)}" data-field="rz">
                </div>
            </div>
            <div class="prop-group">
                <div class="prop-label">Scale</div>
                <div class="prop-vec3">
                    <input type="number" step="0.1" value="${s.x.toFixed(2)}" data-field="sx">
                    <input type="number" step="0.1" value="${s.y.toFixed(2)}" data-field="sy">
                    <input type="number" step="0.1" value="${s.z.toFixed(2)}" data-field="sz">
                </div>
            </div>
            
            <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
            <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Instance Overrides</div>
            <div class="prop-group">
                <div class="prop-label">Color</div>
                <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${obj.userData.material_overrides?.colorHex || obj.userData.colorHex || '#666666'}" data-override-field="colorHex">
            </div>
            <div class="prop-group">
                <div class="prop-label">Emission</div>
                <input type="color" class="prop-input" style="padding: 0; height: 28px;" value="${obj.userData.material_overrides?.emissive || obj.userData.material_overrides?.colorHex || obj.userData.colorHex || '#666666'}" data-override-field="emissive">
            </div>
            <div class="prop-group">
                <div class="prop-label">Roughness</div>
                <input type="number" step="0.05" min="0" max="1" class="prop-input" value="${obj.userData.material_overrides?.roughness !== undefined ? obj.userData.material_overrides.roughness : ''}" data-override-field="roughness" placeholder="Inherit">
            </div>
            <div class="prop-group" style="padding:12px;">
                <button class="kas-btn" id="btn-clear-overrides" style="width:100%;"><i class="fas fa-undo"></i> CLEAR OVERRIDES</button>
            </div>
        `;

        // Wire input changes
        panel.querySelectorAll('input, select').forEach(input => {
            if (input.classList.contains('custom-mat-assignment')) {
                input.addEventListener('change', () => {
                    const groupIndex = parseInt(input.dataset.groupIndex, 10);
                    this.editor._applySubMeshMaterialChange(obj, groupIndex, input.value);
                });
            } else if (input.dataset.overrideField) {
                input.addEventListener('change', () => {
                    const field = input.dataset.overrideField;
                    const val = input.type === 'number' ? parseFloat(input.value) : input.value;
                    this.editor._applyInstanceOverride(obj, field, val);
                });
            } else {
                input.addEventListener('change', () => {
                    const field = input.dataset.field;
                    if (!field) return;
                    const val = (field === 'name' || field === 'material_id') ? input.value : parseFloat(input.value);
                    this.editor._applyPropertyChange(obj, field, val);
                });
            }
        });

        const btnClearOverrides = document.getElementById('btn-clear-overrides');
        if (btnClearOverrides) {
            btnClearOverrides.addEventListener('click', () => {
                this.editor._clearInstanceOverrides(obj);
            });
        }

        const btnDelete = document.getElementById('btn-delete-selected');
        if (btnDelete) {
            btnDelete.addEventListener('click', () => this.editor._deleteSelected());
        }
    }

    _renderMaterialAssignmentsUI(obj) {
        let html = '';
        const materials = this.editor._levelData?.materials || [];
        if (obj.geometry && obj.geometry.groups && obj.geometry.groups.length > 0) {
            html += `<div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Material Assignments</div>`;
            const assignments = obj.userData.material_assignments || {};
            
            obj.geometry.groups.forEach((group, index) => {
                const matId = assignments[index] || '';
                html += `
                    <div class="prop-group">
                        <div class="prop-label">Group ${index} [${group.start}-${group.start+group.count}]</div>
                        <select class="prop-input custom-mat-assignment" data-group-index="${index}">
                            <option value="">(None)</option>
                            ${materials.map(m => `<option value="${m.id}" ${matId === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
                        </select>
                    </div>
                `;
            });
        } else {
            html += `
                <div class="prop-group">
                    <div class="prop-label">Material</div>
                    <select class="prop-input" data-field="material_id">
                        <option value="">(None)</option>
                        ${materials.map(m => `<option value="${m.id}" ${obj.userData?.material_id === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}
                    </select>
                </div>
            `;
        }
        return html;
    }

    _renderLayersUI(mat) {
        const layers = mat.channels?.color?.layers;
        if (!layers || layers.length === 0) {
            return `
                <div class="prop-group">
                    <div class="prop-label">Texture</div>
                    <input type="text" class="prop-input" placeholder="/assets/textures/..." value="${mat.channels?.color?.texture || ''}" data-mat-field="channels.color.texture">
                </div>
                <div class="prop-group">
                    <button class="kas-btn btn-add-layer" data-channel="color" style="width:100%; font-size:10px;"><i class="fas fa-layer-group"></i> ADD COMPOSITE LAYER</button>
                </div>
            `;
        }

        let html = `
            <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent); font-size:10px;">Compositing Stack</div>
        `;

        layers.forEach((layer, i) => {
            html += `
                <div style="background:var(--bg-card); padding:8px; margin:4px 12px; border-radius:4px; border:1px solid var(--border-subtle);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-size:10px; font-weight:bold;">Layer ${i}</span>
                        <button class="kas-btn btn-del-layer" data-channel="color" data-index="${i}" style="padding:2px 6px; font-size:10px; color:var(--kas-red);"><i class="fas fa-times" style="pointer-events:none;"></i></button>
                    </div>
                    
                    <div class="prop-group" style="margin-bottom:4px;">
                        <div class="prop-label" style="width:40px;">Type</div>
                        <select class="prop-input" data-mat-field="channels.color.layers.${i}.type">
                            <option value="color" ${layer.type === 'color' ? 'selected' : ''}>Solid Color</option>
                            <option value="image" ${layer.type === 'image' ? 'selected' : ''}>Image Map</option>
                        </select>
                    </div>

                    <div class="prop-group" style="margin-bottom:4px;">
                        <div class="prop-label" style="width:40px;">Value</div>
                        ${layer.type === 'color' ? 
                            `<input type="color" class="prop-input" style="padding:0; height:24px;" value="${layer.value || '#ffffff'}" data-mat-field="channels.color.layers.${i}.value">` : 
                            `<input type="text" class="prop-input" placeholder="/assets/textures/..." value="${layer.value || ''}" data-mat-field="channels.color.layers.${i}.value">`
                        }
                    </div>

                    <div class="prop-group" style="margin-bottom:4px;">
                        <div class="prop-label" style="width:40px;">Blend</div>
                        <select class="prop-input" data-mat-field="channels.color.layers.${i}.blendMode">
                            <option value="source-over" ${layer.blendMode === 'source-over' ? 'selected' : ''}>Normal</option>
                            <option value="multiply" ${layer.blendMode === 'multiply' ? 'selected' : ''}>Multiply</option>
                            <option value="screen" ${layer.blendMode === 'screen' ? 'selected' : ''}>Screen</option>
                            <option value="overlay" ${layer.blendMode === 'overlay' ? 'selected' : ''}>Overlay</option>
                        </select>
                    </div>

                    <div class="prop-group">
                        <div class="prop-label" style="width:40px;">Opacity</div>
                        <input type="number" step="0.1" min="0" max="1" class="prop-input" value="${layer.opacity !== undefined ? layer.opacity : 1.0}" data-mat-field="channels.color.layers.${i}.opacity">
                    </div>
                </div>
            `;
        });

        html += `
            <div class="prop-group">
                <button class="kas-btn btn-add-layer" data-channel="color" style="width:100%; font-size:10px;"><i class="fas fa-plus"></i> ADD LAYER</button>
            </div>
        `;

        return html;
    }

    _renderMaterialPropertiesUI(mat) {
        let html = `
            <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
            <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Gameplay Properties</div>
        `;

        if (mat.properties && Object.keys(mat.properties).length > 0) {
            for (const [key, value] of Object.entries(mat.properties)) {
                html += `
                    <div style="display:flex; gap:4px; margin:4px 12px; align-items:center;">
                        <input type="text" class="prop-input custom-prop-key" style="flex:1;" value="${key}" data-old-key="${key}">
                        <span style="color:var(--text-muted);">:</span>
                        <input type="text" class="prop-input custom-prop-val" style="flex:1;" value="${value}" data-key="${key}">
                        <button class="kas-btn btn-del-mat-prop" data-key="${key}" style="padding:2px 6px; font-size:10px; color:var(--kas-red);"><i class="fas fa-times" style="pointer-events:none;"></i></button>
                    </div>
                `;
            }
        } else {
            html += `
                <div class="prop-group" style="padding:4px 12px; color:var(--text-muted); font-size:10px; font-style:italic;">
                    No custom properties defined.
                </div>
            `;
        }

        html += `
            <div class="prop-group" style="padding:4px 12px;">
                <button class="kas-btn" id="btn-add-mat-prop" style="width:100%; font-size:10px;"><i class="fas fa-plus"></i> ADD PROPERTY</button>
            </div>
        `;
        return html;
    }

    _renderShaderUniformsUI(mat) {
        if (!mat.shader_id || mat.shader_id === 'standard') return '';
        const def = ShaderRegistry.shaders[mat.shader_id];
        if (!def || !def.uniforms) return '';

        let html = `
            <hr style="border:0; border-bottom:1px solid var(--border-subtle); margin: 8px 0;">
            <div class="prop-group" style="padding:4px 12px; font-weight:bold; color:var(--text-accent);">Shader Parameters</div>
        `;

        let count = 0;
        for (const [key, uniform] of Object.entries(def.uniforms)) {
            if (key === 'time' || key === 'uTime') continue; // skip globals
            count++;

            let val = uniform.value;
            // Override with material-specific variant value if available
            if (mat.shader_uniforms && mat.shader_uniforms[key] !== undefined) {
                const ov = mat.shader_uniforms[key];
                if (val && val.isColor && typeof ov === 'string') {
                    val = new THREE.Color(ov);
                } else if (val && typeof val === 'object' && val.isVector2) {
                    val = { x: ov.x ?? val.x, y: ov.y ?? val.y };
                } else {
                    val = ov;
                }
            }

            let inputHtml = '';
            if (typeof val === 'number') {
                inputHtml = `<input type="number" step="0.1" class="prop-input inline-shader-uniform" data-mat-id="${mat.id}" data-key="${key}" value="${val}" style="width:60px;">`;
            } else if (val && val.isColor) {
                const hex = '#' + val.getHexString();
                inputHtml = `<input type="color" class="prop-input inline-shader-uniform" data-mat-id="${mat.id}" data-key="${key}" value="${hex}" style="width:24px; height:24px; padding:0;">`;
            } else if (val && (val.isVector2 || typeof val.x === 'number')) {
                inputHtml = `
                    <div style="display:flex; gap:4px;">
                        <input type="number" step="0.1" class="prop-input inline-shader-uniform" data-mat-id="${mat.id}" data-key="${key}_x" value="${val.x}" style="width:40px;">
                        <input type="number" step="0.1" class="prop-input inline-shader-uniform" data-mat-id="${mat.id}" data-key="${key}_y" value="${val.y}" style="width:40px;">
                    </div>
                `;
            } else {
                inputHtml = `<span style="color:var(--text-muted); font-size:10px;">[Object]</span>`;
            }

            html += `
                <div class="prop-group" style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="prop-label" style="margin-bottom:0;">${key}</div>
                    ${inputHtml}
                </div>
            `;
        }

        if (count === 0) return '';
        return html;
    }

    _renderPostProcessingStack() {
        this.editor._levelData.postprocessing = this.editor._levelData.postprocessing || [];
        const stack = this.editor._levelData.postprocessing;

        let html = '<div style="display:flex; flex-direction:column; gap:8px; padding:0 12px; margin-bottom:8px;">';

        if (stack.length === 0) {
            html += '<div style="color:var(--text-muted); font-size:10px; font-style:italic;">No active passes.</div>';
        } else {
            stack.forEach((pass, i) => {
                let controls = '';
                if (pass.type === 'outline') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Thickness</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="edgeThickness" value="${pass.edgeThickness ?? 1.5}" style="width:40px;">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Strength</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="edgeStrength" value="${pass.edgeStrength ?? 3.0}" style="width:40px;">
                        </div>
                    `;
                } else if (pass.type === 'glow') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Intensity</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="intensity" value="${pass.intensity ?? 1.0}" style="width:40px;">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Threshold</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="threshold" value="${pass.threshold ?? 0.8}" style="width:40px;">
                        </div>
                    `;
                } else if (pass.type === 'cel') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Tones</span>
                            <input type="number" step="1" class="pp-input" data-index="${i}" data-key="tones" value="${pass.tones ?? 3.0}" style="width:40px;">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Min Brightness</span>
                            <input type="number" step="0.05" min="0" max="1" class="pp-input" data-index="${i}" data-key="minBright" value="${pass.minBright ?? 0.25}" style="width:40px;">
                        </div>
                    `;
                } else if (pass.type === 'color_grading') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Brightness</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="brightness" value="${pass.brightness ?? 1.0}" style="width:40px;">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Contrast</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="contrast" value="${pass.contrast ?? 1.0}" style="width:40px;">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Saturation</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="saturation" value="${pass.saturation ?? 1.0}" style="width:40px;">
                        </div>
                    `;
                } else if (pass.type === 'fog') {
                    controls = `
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Color</span>
                            <input type="color" class="pp-input" data-index="${i}" data-key="color" value="${pass.color || '#000000'}">
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Density</span>
                            <input type="number" step="0.1" class="pp-input" data-index="${i}" data-key="density" value="${pass.density ?? 0.5}" style="width:40px;">
                        </div>
                    `;
                }

                html += `
                    <div style="background:var(--bg-card); padding:8px; border-radius:4px; border:1px solid var(--border-subtle);">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:bold; font-size:11px; text-transform:uppercase;">${pass.type}</span>
                            <div style="display:flex; gap:4px;">
                                <button class="kas-btn btn-pp-up" data-index="${i}" style="padding:2px 6px; font-size:10px;" ${i===0?'disabled':''}><i class="fas fa-chevron-up"></i></button>
                                <button class="kas-btn btn-pp-down" data-index="${i}" style="padding:2px 6px; font-size:10px;" ${i===stack.length-1?'disabled':''}><i class="fas fa-chevron-down"></i></button>
                                <button class="kas-btn btn-pp-del" data-index="${i}" style="padding:2px 6px; font-size:10px; color:var(--kas-red);"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">
                            ${controls}
                        </div>
                    </div>
                `;
            });
        }

        html += `
            <div style="display:flex; gap:4px; margin-top:4px;">
                <select id="pp-new-type" class="prop-input" style="flex:1;">
                    <option value="glow">Glow (Bloom)</option>
                    <option value="outline">Outline</option>
                    <option value="cel">Toon/Cel</option>
                    <option value="color_grading">Color Grading</option>
                    <option value="fog">Screen Fog</option>
                </select>
                <button class="kas-btn" id="btn-add-pp" style="padding:4px 8px; font-size:10px;"><i class="fas fa-plus"></i> ADD</button>
            </div>
        </div>`;

        return html;
    }

    _bindPostProcessingEvents(panel) {
        panel.querySelectorAll('.pp-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                const key = e.target.dataset.key;
                let val = e.target.value;
                if (e.target.type === 'number') val = parseFloat(val);
                this.editor._levelData.postprocessing[idx][key] = val;
                this.editor._pushUndo();
                if (this.editor.renderer3d) this.editor.renderer3d.rebuildPostProcessing(this.editor._levelData.postprocessing);
                this.editor._markDirty();
            });
        });

        panel.querySelectorAll('.btn-pp-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                if (idx > 0) {
                    this.editor._pushUndo();
                    const stack = this.editor._levelData.postprocessing;
                    const temp = stack[idx - 1];
                    stack[idx - 1] = stack[idx];
                    stack[idx] = temp;
                    if (this.editor.renderer3d) this.editor.renderer3d.rebuildPostProcessing(this.editor._levelData.postprocessing);
                    this.editor._markDirty();
                    this._updatePropertiesPanel();
                }
            });
        });

        panel.querySelectorAll('.btn-pp-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                const stack = this.editor._levelData.postprocessing;
                if (idx < stack.length - 1) {
                    this.editor._pushUndo();
                    const temp = stack[idx + 1];
                    stack[idx + 1] = stack[idx];
                    stack[idx] = temp;
                    if (this.editor.renderer3d) this.editor.renderer3d.rebuildPostProcessing(this.editor._levelData.postprocessing);
                    this.editor._markDirty();
                    this._updatePropertiesPanel();
                }
            });
        });

        panel.querySelectorAll('.btn-pp-del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                this.editor._pushUndo();
                this.editor._levelData.postprocessing.splice(idx, 1);
                if (this.editor.renderer3d) this.editor.renderer3d.rebuildPostProcessing(this.editor._levelData.postprocessing);
                this.editor._markDirty();
                this._updatePropertiesPanel();
            });
        });

        const btnAdd = panel.querySelector('#btn-add-pp');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                const type = panel.querySelector('#pp-new-type').value;
                this.editor._pushUndo();
                let newPass = { type };
                if (type === 'cel') {
                    newPass = { type: 'cel', tones: 5.0, satBoost: 1.1, minBright: 0.25 };
                }
                this.editor._levelData.postprocessing.push(newPass);
                if (this.editor.renderer3d) this.editor.renderer3d.rebuildPostProcessing(this.editor._levelData.postprocessing);
                this.editor._markDirty();
                this._updatePropertiesPanel();
            });
        }
    }
}
