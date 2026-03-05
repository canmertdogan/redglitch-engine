/**
 * ColorPalette.js — Phase 38
 * MagicaVoxel-style 256-color palette manager for the FPS Map Editor.
 *
 * Features:
 *   - 256-color palette stored as hex strings; procedurally generated default
 *   - 16×16 CSS swatch grid; click = select, double-click = edit
 *   - HSL slider picker (H/S/L range inputs with dynamic gradient backgrounds)
 *   - Hex input field for direct entry
 *   - Export palette as .pal JSON file
 *   - Import .pal JSON file
 *   - Export palette as 256×16 px PNG swatch strip (via offscreen canvas)
 *   - onColorSelected(cb) callback fired whenever active color changes
 *
 * Public API:
 *   init(containerEl)           — mounts full palette UI into containerEl
 *   getActive()                 — { hex: string, index: number }
 *   setColor(index, hex)        — edit one palette entry programmatically
 *   loadFromArray(colors[])     — replace full palette (16 or 256 entries)
 *   toArray()                   — returns current 256-color array
 *   onColorSelected(cb)         — register callback(hex, index)
 *   randomize()                 — fill palette with random colors
 *   exportPAL()                 — download .pal JSON
 *   importPAL(file)             — load from File object (returns Promise)
 *   exportPNG()                 — download 256-px-wide × 16-px swatch PNG
 */

/* global window, document */
const ColorPalette = (() => {
    'use strict';

    // ── HSL ↔ hex helpers ────────────────────────────────────────────────────

    function _hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / 30) % 12;
            const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
            return Math.round(255 * c).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    function _hexToHSL(hex) {
        let r = parseInt(hex.slice(1, 3), 16) / 255;
        let g = parseInt(hex.slice(3, 5), 16) / 255;
        let b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = d / (l > 0.5 ? 2 - max - min : max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function _hexValid(hex) {
        return /^#[0-9a-fA-F]{6}$/.test(hex);
    }

    // ── default 256-color palette ─────────────────────────────────────────────

    function _generateDefault() {
        const colors = new Array(256);
        // 15 chromatic rows (indices 0–239), 16 hue steps each (22.5° apart)
        const chromaProfiles = [
            { s: 100, l: 50 }, { s: 100, l: 65 }, { s: 100, l: 35 },
            { s: 100, l: 80 }, { s:  75, l: 50 }, { s:  75, l: 65 },
            { s:  75, l: 35 }, { s:  50, l: 50 }, { s:  50, l: 65 },
            { s:  50, l: 35 }, { s:  30, l: 50 }, { s:  30, l: 65 },
            { s:  30, l: 35 }, { s:  15, l: 50 }, { s:  15, l: 35 },
        ];
        for (let row = 0; row < 15; row++) {
            const { s, l } = chromaProfiles[row];
            for (let col = 0; col < 16; col++) {
                colors[row * 16 + col] = _hslToHex(col * 22.5, s, l);
            }
        }
        // Row 15 (indices 240–255): 16 grayscale steps (black → white)
        for (let i = 0; i < 16; i++) {
            const v = Math.round(i * 17).toString(16).padStart(2, '0');
            colors[240 + i] = `#${v}${v}${v}`;
        }
        return colors;
    }

    // ── state ────────────────────────────────────────────────────────────────

    let _colors    = _generateDefault();
    let _activeIdx = 0;
    let _onSelect  = null;
    let _container = null;

    // DOM refs (set by _buildUI)
    let _elGrid      = null;  // 256-swatch grid
    let _elSwatch    = null;  // large active-color preview
    let _elHex       = null;  // hex text input
    let _elHslH      = null;  // H range
    let _elHslS      = null;  // S range
    let _elHslL      = null;  // L range
    let _elHslHVal   = null;  // H value display
    let _elHslSVal   = null;
    let _elHslLVal   = null;
    let _elIdxLabel  = null;  // "Index: 042"
    let _elNativePicker = null; // hidden <input type=color>

    // ── UI builder ────────────────────────────────────────────────────────────

    function _buildUI(container) {
        _container = container;
        container.innerHTML = '';

        container.insertAdjacentHTML('beforeend', `
<div id="pal-active-section">
  <div class="section-header">ACTIVE COLOR <span id="pal-idx-label" style="float:right;color:#666;font-size:.75rem">IDX: 000</span></div>
  <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
    <div id="pal-active-swatch" title="Click to open picker" style="
      width:38px;height:38px;border:2px solid #555;border-radius:2px;cursor:pointer;flex-shrink:0;
      background:${_colors[_activeIdx]}"></div>
    <div style="flex:1;display:flex;flex-direction:column;gap:4px">
      <input id="pal-hex-input" type="text" value="${_colors[_activeIdx]}"
        maxlength="7" spellcheck="false"
        style="background:#000;border:1px solid #444;color:#ff6b35;font-family:inherit;
          font-size:1rem;padding:3px 6px;width:100%;outline:none">
      <input id="pal-native-picker" type="color" value="${_colors[_activeIdx]}"
        style="opacity:0;position:absolute;width:1px;height:1px;pointer-events:none">
    </div>
  </div>

  <div class="section-header">HSL PICKER</div>
  <div id="pal-hsl-section" style="margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <span style="color:#666;font-size:.8rem;min-width:14px">H</span>
      <input id="pal-hsl-h" type="range" min="0" max="359" value="0" style="flex:1;accent-color:#ff6b35">
      <span id="pal-hsl-h-val" style="color:#888;font-size:.8rem;min-width:24px;text-align:right">0</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <span style="color:#666;font-size:.8rem;min-width:14px">S</span>
      <input id="pal-hsl-s" type="range" min="0" max="100" value="0" style="flex:1;accent-color:#ff6b35">
      <span id="pal-hsl-s-val" style="color:#888;font-size:.8rem;min-width:24px;text-align:right">0</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <span style="color:#666;font-size:.8rem;min-width:14px">L</span>
      <input id="pal-hsl-l" type="range" min="0" max="100" value="0" style="flex:1;accent-color:#ff6b35">
      <span id="pal-hsl-l-val" style="color:#888;font-size:.8rem;min-width:24px;text-align:right">0</span>
    </div>
  </div>
</div>

<div class="section-header">PALETTE <span style="float:right;color:#666;font-size:.75rem">256 COLORS</span></div>
<div id="pal-grid" style="
  display:grid;grid-template-columns:repeat(16,1fr);gap:1px;
  margin-bottom:8px;image-rendering:pixelated"></div>

<div style="display:flex;gap:4px;flex-wrap:wrap">
  <button class="action-btn" style="flex:1" onclick="ColorPalette.randomize()">Rand</button>
  <button class="action-btn" style="flex:1" onclick="ColorPalette.importPAL()">Import</button>
  <button class="action-btn" style="flex:1" onclick="ColorPalette.exportPAL()">Export</button>
  <button class="action-btn" style="flex:1" onclick="ColorPalette.exportPNG()">PNG</button>
</div>
<div style="font-size:.75rem;color:#444;margin-top:6px;line-height:1.5">
  Click swatch to select.<br>Double-click to edit color.<br>Paint tool paints 2D &amp; 3D blocks.
</div>
`);

        _elGrid      = container.querySelector('#pal-grid');
        _elSwatch    = container.querySelector('#pal-active-swatch');
        _elHex       = container.querySelector('#pal-hex-input');
        _elHslH      = container.querySelector('#pal-hsl-h');
        _elHslS      = container.querySelector('#pal-hsl-s');
        _elHslL      = container.querySelector('#pal-hsl-l');
        _elHslHVal   = container.querySelector('#pal-hsl-h-val');
        _elHslSVal   = container.querySelector('#pal-hsl-s-val');
        _elHslLVal   = container.querySelector('#pal-hsl-l-val');
        _elIdxLabel  = container.querySelector('#pal-idx-label');
        _elNativePicker = container.querySelector('#pal-native-picker');

        _buildGrid();
        _syncPickerToActive();
        _bindEvents();
    }

    function _buildGrid() {
        if (!_elGrid) return;
        _elGrid.innerHTML = '';
        for (let i = 0; i < 256; i++) {
            const cell = document.createElement('div');
            cell.dataset.idx = i;
            cell.title       = `#${i.toString().padStart(3,'0')}: ${_colors[i]}`;
            cell.style.cssText = `
                width:100%;padding-top:100%;position:relative;cursor:pointer;
                background:${_colors[i]};
                outline:${i === _activeIdx ? '2px solid #fff' : '1px solid rgba(0,0,0,.3)'};
                outline-offset:${i === _activeIdx ? '-2px' : '-1px'};
                z-index:${i === _activeIdx ? 2 : 0};
            `;
            cell.addEventListener('click',       () => select(i));
            cell.addEventListener('dblclick',    () => _editCell(i));
            _elGrid.appendChild(cell);
        }
    }

    function _updateGridCell(idx) {
        if (!_elGrid) return;
        const cells = _elGrid.children;
        if (!cells[idx]) return;
        cells[idx].style.background  = _colors[idx];
        cells[idx].title              = `#${idx.toString().padStart(3,'0')}: ${_colors[idx]}`;
        cells[idx].style.outline      = `${idx === _activeIdx ? '2px solid #fff' : '1px solid rgba(0,0,0,.3)'}`;
        cells[idx].style.outlineOffset = idx === _activeIdx ? '-2px' : '-1px';
        cells[idx].style.zIndex       = idx === _activeIdx ? '2' : '0';
    }

    function _syncPickerToActive() {
        const hex = _colors[_activeIdx];
        if (_elSwatch)  _elSwatch.style.background = hex;
        if (_elHex)     _elHex.value               = hex;
        if (_elIdxLabel) _elIdxLabel.textContent   = `IDX: ${_activeIdx.toString().padStart(3,'0')}`;
        if (_elNativePicker) _elNativePicker.value  = hex;

        const { h, s, l } = _hexToHSL(hex);
        if (_elHslH) { _elHslH.value = h; _elHslHVal.textContent = h; }
        if (_elHslS) { _elHslS.value = s; _elHslSVal.textContent = s; }
        if (_elHslL) { _elHslL.value = l; _elHslLVal.textContent = l; }
        _updateSliderGradients(h, s, l);
    }

    function _updateSliderGradients(h, s, l) {
        if (!_elHslH) return;
        // H gradient: full hue rainbow (S and L fixed)
        const hStops = Array.from({ length: 13 }, (_, i) => _hslToHex(i * 30, s || 70, l || 50));
        _elHslH.style.background = `linear-gradient(to right,${hStops.join(',')})`;

        // S gradient: from desaturated to full saturation at current H,L
        const sFrom = _hslToHex(h, 0,   l || 50);
        const sTo   = _hslToHex(h, 100, l || 50);
        _elHslS.style.background = `linear-gradient(to right,${sFrom},${sTo})`;

        // L gradient: black → pure hue → white
        const lMid = _hslToHex(h, s || 100, 50);
        _elHslL.style.background = `linear-gradient(to right,#000,${lMid},#fff)`;
    }

    // ── events ────────────────────────────────────────────────────────────────

    function _bindEvents() {
        // Active swatch click → open native picker
        _elSwatch.addEventListener('click', () => {
            _elNativePicker.value  = _colors[_activeIdx];
            _elNativePicker.click();
        });

        // Native color picker change
        _elNativePicker.addEventListener('input', e => {
            _applyColorToActive(e.target.value);
        });

        // Hex input enter/blur
        _elHex.addEventListener('keydown', e => {
            if (e.key === 'Enter') _applyColorToActive(_elHex.value.trim());
        });
        _elHex.addEventListener('blur', () => _applyColorToActive(_elHex.value.trim()));

        // H slider
        _elHslH.addEventListener('input', () => {
            _elHslHVal.textContent = _elHslH.value;
            _applyHSLToActive();
        });
        // S slider
        _elHslS.addEventListener('input', () => {
            _elHslSVal.textContent = _elHslS.value;
            _applyHSLToActive();
        });
        // L slider
        _elHslL.addEventListener('input', () => {
            _elHslLVal.textContent = _elHslL.value;
            _applyHSLToActive();
        });
    }

    function _applyColorToActive(hex) {
        // Normalize hex
        if (!hex.startsWith('#')) hex = '#' + hex;
        if (!_hexValid(hex)) return;
        setColor(_activeIdx, hex);
    }

    function _applyHSLToActive() {
        const h = parseInt(_elHslH.value, 10);
        const s = parseInt(_elHslS.value, 10);
        const l = parseInt(_elHslL.value, 10);
        const hex = _hslToHex(h, s, l);
        setColor(_activeIdx, hex);
        if (_elHex)     _elHex.value               = hex;
        if (_elSwatch)  _elSwatch.style.background  = hex;
        if (_elNativePicker) _elNativePicker.value  = hex;
        _updateSliderGradients(h, s, l);
    }

    /** Open native color picker on a specific palette index. */
    function _editCell(idx) {
        select(idx);
        _elSwatch?.click();
    }

    // ── public methods ────────────────────────────────────────────────────────

    /**
     * Mount the full palette UI into a DOM element.
     * Must be called after DOMContentLoaded.
     */
    function init(containerEl) {
        if (typeof containerEl === 'string') {
            containerEl = document.querySelector(containerEl);
        }
        if (!containerEl) { console.error('[ColorPalette] init: container not found'); return; }
        _buildUI(containerEl);
    }

    /** Select the active palette index. Fires onColorSelected callback. */
    function select(idx) {
        idx = Math.max(0, Math.min(255, idx | 0));
        const prev = _activeIdx;
        _activeIdx  = idx;
        _syncPickerToActive();
        // Update old and new cells
        _updateGridCell(prev);
        _updateGridCell(idx);
        if (_onSelect) _onSelect(_colors[idx], idx);
    }

    /** @returns {{ hex: string, index: number }} */
    function getActive() {
        return { hex: _colors[_activeIdx], index: _activeIdx };
    }

    /** Set a single palette entry by index. Fires onColorSelected if it's the active one. */
    function setColor(idx, hex) {
        idx = Math.max(0, Math.min(255, idx | 0));
        if (!_hexValid(hex)) return;
        _colors[idx] = hex.toLowerCase();
        _updateGridCell(idx);
        if (idx === _activeIdx) {
            _syncPickerToActive();
            if (_onSelect) _onSelect(hex, idx);
        }
    }

    /**
     * Replace the full palette. Accepts 16, 32, or 256-entry arrays.
     * Shorter arrays are padded with existing colors.
     */
    function loadFromArray(arr) {
        if (!Array.isArray(arr)) return;
        const count = Math.min(arr.length, 256);
        for (let i = 0; i < count; i++) {
            if (_hexValid(arr[i])) _colors[i] = arr[i].toLowerCase();
        }
        _buildGrid();
        _syncPickerToActive();
        if (_onSelect) _onSelect(_colors[_activeIdx], _activeIdx);
    }

    /** @returns {string[]} 256-entry hex color array */
    function toArray() { return [..._colors]; }

    /** Register a callback fired whenever the active color changes. */
    function onColorSelected(cb) { _onSelect = cb; }

    /** Fill all 256 entries with random colors. */
    function randomize() {
        for (let i = 0; i < 256; i++) {
            _colors[i] = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
        }
        _buildGrid();
        _syncPickerToActive();
        if (_onSelect) _onSelect(_colors[_activeIdx], _activeIdx);
    }

    // ── import / export ───────────────────────────────────────────────────────

    /** Download current palette as .pal JSON. */
    function exportPAL() {
        const data = JSON.stringify({ version: 1, colors: _colors }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: 'palette.pal' });
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Import a .pal JSON from a File or from a file input dialog.
     * If no file is passed, opens a file picker.
     * @param {File|undefined} file
     * @returns {Promise<void>}
     */
    function importPAL(file) {
        return new Promise((resolve, reject) => {
            const doLoad = f => {
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        const parsed = JSON.parse(e.target.result);
                        if (parsed.colors && Array.isArray(parsed.colors)) {
                            loadFromArray(parsed.colors);
                            resolve();
                        } else {
                            alert('[ColorPalette] Invalid .pal file — missing "colors" array');
                            reject(new Error('invalid format'));
                        }
                    } catch (err) {
                        alert('[ColorPalette] Failed to parse file: ' + err.message);
                        reject(err);
                    }
                };
                reader.readAsText(f);
            };

            if (file instanceof File) {
                doLoad(file);
            } else {
                const input = Object.assign(document.createElement('input'), {
                    type: 'file', accept: '.pal,.json',
                });
                input.onchange = e => { if (e.target.files[0]) doLoad(e.target.files[0]); else reject(); };
                input.click();
            }
        });
    }

    /**
     * Export the palette as a 256-px wide × 16-px tall PNG swatch strip.
     * Each pixel column = one color (256 columns); 16 rows tall for visibility.
     */
    function exportPNG() {
        const canvas = document.createElement('canvas');
        canvas.width  = 256;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        for (let i = 0; i < 256; i++) {
            ctx.fillStyle = _colors[i];
            ctx.fillRect(i, 0, 1, 16);
        }
        const url = canvas.toDataURL('image/png');
        const a   = Object.assign(document.createElement('a'), { href: url, download: 'palette.png' });
        a.click();
    }

    // ── public API ────────────────────────────────────────────────────────────
    return {
        init, select, getActive, setColor,
        loadFromArray, toArray, onColorSelected,
        randomize, exportPAL, importPAL, exportPNG,
    };

})();

if (typeof window !== 'undefined') window.ColorPalette = ColorPalette;
