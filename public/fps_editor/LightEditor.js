/**
 * LightEditor.js — Phase 39
 * Point-light placement and emissive-block manager for the FPS Map Editor.
 *
 * Lights model (low-poly / real-time, no baking):
 *   - ONE directional sun + ambient (managed by fps_editor.js updateLighting())
 *   - N point lights: torches, lamps, portals, hazard glow
 *   - Distance-squared falloff: no PBR; THREE.PointLight with distance + decay=2
 *   - Color pulled from project 256-color palette for consistency
 *
 * Emissive blocks:
 *   - Any voxel can be flagged emissive (lava, glowstone, neon sign)
 *   - Stored as a flat object { "x,y,z": true } in map data
 *   - fps_editor.js _rebuild3d applies material.emissive to these voxels
 *
 * Public API:
 *   init(containerEl)             — mount UI
 *   addLight(x, y, z, color, intensity, radius, label) → light object
 *   removeLight(id)
 *   updateLight(id, props)        — partial update { color, intensity, radius, label }
 *   selectLight(id)
 *   getAll()                      → { lights[], emissiveBlocks{} }
 *   toData()                      → { lights[], emissiveBlocks{} } (JSON-safe)
 *   fromData(data)                — restore from saved map data
 *   toggleEmissive(key)           — toggle emissive flag for voxel key "x,y,z"
 *   isEmissive(key)               — bool
 *   clearEmissive()
 *   onChanged(cb)                 — callback() fired when any light or emissive changes
 */

/* global window, document */
const LightEditor = (() => {
    'use strict';

    // ── state ─────────────────────────────────────────────────────────────────

    let _lights         = [];          // [{ id, label, type, x, y, z, color, intensity, radius }]
    let _emissiveBlocks = {};          // { "x,y,z": true }
    let _selectedId     = null;
    let _onChanged      = null;
    let _container      = null;

    // DOM refs
    let _elList         = null;
    let _elProps        = null;

    const LIGHT_TYPES = ['point', 'torch', 'lamp', 'portal'];
    const DEFAULT_COLOR     = '#ffcc66';
    const DEFAULT_INTENSITY = 1.0;
    const DEFAULT_RADIUS    = 8;

    // ── helpers ───────────────────────────────────────────────────────────────

    function _uid() {
        return 'lt_' + Math.random().toString(36).slice(2, 9);
    }

    function _typeIcon(type) {
        return { point: 'fas fa-lightbulb', torch: 'fas fa-fire', lamp: 'fas fa-lightbulb', portal: 'fas fa-portal-exit' }[type] || 'fas fa-lightbulb';
    }

    function _fire() {
        if (_onChanged) _onChanged();
    }

    // ── UI builder ────────────────────────────────────────────────────────────

    function _buildUI(container) {
        _container = container;
        container.innerHTML = '';
        container.insertAdjacentHTML('beforeend', `
<div style="display:flex; gap:20px;">
    <div style="width:250px; display:flex; flex-direction:column;">
        <div class="section-header">POINT LIGHTS
            <button class="tool-btn" style="float:right;width:24px;height:24px;"
                onclick="LightEditor.addLight(0,1.5,0,'${DEFAULT_COLOR}',${DEFAULT_INTENSITY},${DEFAULT_RADIUS},'New Light')">+</button>
        </div>
        <div id="le-list" class="entity-list" style="min-height:32px;margin-bottom:6px"></div>
    </div>

    <div id="le-props" style="display:none; flex:1; border-left:1px solid var(--border); padding-left:20px;">
        <div class="section-header">LIGHT PROPERTIES</div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div>
                <div class="field-row">
                    <label>Label</label>
                    <input id="le-label" type="text" value="">
                </div>

                <div class="field-row">
                    <label>Type</label>
                    <select id="le-type">
                        ${LIGHT_TYPES.map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
                    </select>
                </div>

                <div class="field-row">
                    <label>Color</label>
                    <input id="le-color" type="color" value="${DEFAULT_COLOR}">
                    <span id="le-color-hex" style="color:var(--accent);font-size:.9rem;margin-left:4px">${DEFAULT_COLOR}</span>
                </div>
            </div>

            <div>
                <div class="field-row">
                    <label>Intensity</label>
                    <input id="le-intensity" type="range" min="0.1" max="5" step="0.1" value="${DEFAULT_INTENSITY}">
                    <span id="le-intensity-val" style="color:var(--accent);font-size:.9rem;min-width:28px;text-align:right">1.0</span>
                </div>

                <div class="field-row">
                    <label>Radius</label>
                    <input id="le-radius" type="range" min="1" max="50" step="1" value="${DEFAULT_RADIUS}">
                    <span id="le-radius-val" style="color:var(--accent);font-size:.9rem;min-width:28px;text-align:right">${DEFAULT_RADIUS}</span>
                </div>

                <div class="field-row">
                    <label>Position</label>
                    <div style="display:flex; gap:4px; flex:1;">
                        <input id="le-px" type="number" step="0.5" placeholder="X">
                        <input id="le-py" type="number" step="0.5" placeholder="Y">
                        <input id="le-pz" type="number" step="0.5" placeholder="Z">
                    </div>
                </div>
            </div>
        </div>

        <div style="display:flex;gap:4px;margin-top:10px">
            <button class="action-btn primary" style="flex:1" onclick="LightEditor._applyProps()"><i class="fas fa-check"></i> Apply</button>
            <button class="action-btn danger" style="flex:1" onclick="LightEditor._deleteSelected()"><i class="fas fa-trash"></i> Delete</button>
        </div>
    </div>

    <div style="width:200px; border-left:1px solid var(--border); padding-left:20px;">
        <div class="section-header">EMISSIVE BLOCKS</div>
        <div style="font-size:.85rem;color:#666;line-height:1.4;margin-bottom:10px">
            Select a block in 2D view, then toggle emissive.
        </div>
        <button class="action-btn" onclick="LightEditor.toggleSelectedEmissive()">Toggle Selected</button>
        <button class="action-btn" onclick="LightEditor.clearEmissive()">Clear All</button>
        <div id="le-emissive-count" style="font-size:.8rem;color:var(--accent);margin-top:8px">0 emissive blocks</div>
    </div>
</div>
`);

        _elList  = container.querySelector('#le-list');
        _elProps = container.querySelector('#le-props');

        _rebuildList();
        _bindEvents();
    }

    function _rebuildList() {
        if (!_elList) return;
        if (_lights.length === 0) {
            _elList.innerHTML = '<div style="color:#444;font-size:.8rem;padding:4px 0">No lights placed.</div>';
            return;
        }
        _elList.innerHTML = '';
        for (const lt of _lights) {
            const row = document.createElement('div');
            row.className = `entity-item ${lt.id === _selectedId ? 'active' : ''}`;
            
            row.innerHTML = `
                <span class="entity-icon" style="color:${lt.color}"><i class="${_typeIcon(lt.type)}"></i></span>
                <span class="entity-name">${lt.label || lt.type}</span>
                <span class="entity-badge">${lt.x.toFixed(1)},${lt.z.toFixed(1)}</span>
            `;
            row.addEventListener('click', () => selectLight(lt.id));
            _elList.appendChild(row);
        }
    }

    function _populateProps(lt) {
        if (!_elProps || !lt) return;
        _elProps.style.display = 'block';
        _elProps.querySelector('#le-label').value        = lt.label || '';
        _elProps.querySelector('#le-type').value         = lt.type;
        _elProps.querySelector('#le-color').value        = lt.color;
        _elProps.querySelector('#le-color-hex').textContent = lt.color;
        const intEl = _elProps.querySelector('#le-intensity');
        intEl.value = lt.intensity;
        _elProps.querySelector('#le-intensity-val').textContent = lt.intensity.toFixed(1);
        const radEl = _elProps.querySelector('#le-radius');
        radEl.value = lt.radius;
        _elProps.querySelector('#le-radius-val').textContent = lt.radius;
        _elProps.querySelector('#le-px').value = lt.x;
        _elProps.querySelector('#le-py').value = lt.y;
        _elProps.querySelector('#le-pz').value = lt.z;
    }

    function _updateEmissiveCount() {
        const el = _container?.querySelector('#le-emissive-count');
        if (el) el.textContent = `${Object.keys(_emissiveBlocks).length} emissive block(s)`;
    }

    function _bindEvents() {
        if (!_elProps) return;
        // live intensity label
        _elProps.querySelector('#le-intensity').addEventListener('input', e => {
            _elProps.querySelector('#le-intensity-val').textContent = parseFloat(e.target.value).toFixed(1);
        });
        // live radius label
        _elProps.querySelector('#le-radius').addEventListener('input', e => {
            _elProps.querySelector('#le-radius-val').textContent = e.target.value;
        });
        // color picker → sync hex label
        _elProps.querySelector('#le-color').addEventListener('input', e => {
            _elProps.querySelector('#le-color-hex').textContent = e.target.value;
        });
    }

    // ── public methods ────────────────────────────────────────────────────────

    function init(containerEl) {
        if (typeof containerEl === 'string') {
            containerEl = document.querySelector(containerEl);
        }
        if (!containerEl) { console.error('[LightEditor] init: container not found'); return; }
        _buildUI(containerEl);
    }

    function addLight(x, y, z, color, intensity, radius, label) {
        const lt = {
            id:        _uid(),
            label:     label || 'Point Light',
            type:      'point',
            x:         parseFloat(x)         || 0,
            y:         parseFloat(y)         || 1.5,
            z:         parseFloat(z)         || 0,
            color:     color                 || DEFAULT_COLOR,
            intensity: parseFloat(intensity) || DEFAULT_INTENSITY,
            radius:    parseFloat(radius)    || DEFAULT_RADIUS,
        };
        _lights.push(lt);
        selectLight(lt.id);
        _fire();
        return lt;
    }

    function removeLight(id) {
        const idx = _lights.findIndex(l => l.id === id);
        if (idx === -1) return;
        _lights.splice(idx, 1);
        if (_selectedId === id) {
            _selectedId = _lights.length ? _lights[_lights.length - 1].id : null;
        }
        _rebuildList();
        if (_selectedId) {
            _populateProps(_lights.find(l => l.id === _selectedId));
        } else {
            if (_elProps) _elProps.style.display = 'none';
        }
        _fire();
    }

    function updateLight(id, props) {
        const lt = _lights.find(l => l.id === id);
        if (!lt) return;
        Object.assign(lt, props);
        _rebuildList();
        if (id === _selectedId) _populateProps(lt);
        _fire();
    }

    function selectLight(id) {
        _selectedId = id;
        const lt = _lights.find(l => l.id === id);
        _rebuildList();
        _populateProps(lt);
    }

    /** Apply the properties form to the selected light. */
    function _applyProps() {
        const lt = _lights.find(l => l.id === _selectedId);
        if (!lt || !_elProps) return;
        lt.label     = _elProps.querySelector('#le-label').value.trim() || lt.label;
        lt.type      = _elProps.querySelector('#le-type').value;
        lt.color     = _elProps.querySelector('#le-color').value;
        lt.intensity = parseFloat(_elProps.querySelector('#le-intensity').value);
        lt.radius    = parseFloat(_elProps.querySelector('#le-radius').value);
        const px = parseFloat(_elProps.querySelector('#le-px').value);
        const py = parseFloat(_elProps.querySelector('#le-py').value);
        const pz = parseFloat(_elProps.querySelector('#le-pz').value);
        if (!isNaN(px)) lt.x = px;
        if (!isNaN(py)) lt.y = py;
        if (!isNaN(pz)) lt.z = pz;
        _rebuildList();
        _fire();
    }

    function _deleteSelected() {
        if (_selectedId) removeLight(_selectedId);
    }

    function getAll() {
        return { lights: _lights, emissiveBlocks: _emissiveBlocks };
    }

    function toData() {
        return {
            lights: _lights.map(l => ({ ...l })),
            emissiveBlocks: { ..._emissiveBlocks },
        };
    }

    function fromData(data) {
        if (!data) return;
        _lights         = Array.isArray(data.lights)  ? data.lights.map(l => ({ ...l })) : [];
        _emissiveBlocks = (data.emissiveBlocks && typeof data.emissiveBlocks === 'object')
            ? { ...data.emissiveBlocks } : {};
        _selectedId = null;
        _rebuildList();
        if (_elProps) _elProps.style.display = 'none';
        _updateEmissiveCount();
        _fire();
    }

    /**
     * Toggle emissive flag for a voxel identified by "x,y,z" key.
     * Fires onChanged so fps_editor.js can rebuild 3D.
     */
    function toggleEmissive(key) {
        if (_emissiveBlocks[key]) {
            delete _emissiveBlocks[key];
        } else {
            _emissiveBlocks[key] = true;
        }
        _updateEmissiveCount();
        _fire();
    }

    /** Called by toolbar button: toggles emissive for the currently hovered voxel (set externally). */
    function toggleSelectedEmissive() {
        // fps_editor exposes the last-hovered grid key via LightEditor._hoveredKey
        const key = LightEditor._hoveredKey;
        if (!key) {
            console.warn('[LightEditor] No block selected — hover a block in the 2D view first');
            return;
        }
        toggleEmissive(key);
    }

    function isEmissive(key) {
        return !!_emissiveBlocks[key];
    }

    function clearEmissive() {
        _emissiveBlocks = {};
        _updateEmissiveCount();
        _fire();
    }

    function onChanged(cb) { _onChanged = cb; }

    // ── public API ────────────────────────────────────────────────────────────
    return {
        init, addLight, removeLight, updateLight, selectLight, getAll, toData, fromData,
        toggleEmissive, toggleSelectedEmissive, isEmissive, clearEmissive, onChanged,
        // internal helpers exposed so _applyProps / _deleteSelected work via onclick
        _applyProps, _deleteSelected,
        // writable by fps_editor.js for emissive-select support
        _hoveredKey: null,
    };

})();

if (typeof window !== 'undefined') window.LightEditor = LightEditor;
