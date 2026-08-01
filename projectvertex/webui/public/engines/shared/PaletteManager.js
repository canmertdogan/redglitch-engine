/**
 * PaletteManager.js — 256-color project palette for the 3D engines.
 *
 * Palette format (.pal JSON):
 *   { "colors": [ "#rrggbb", ... ] }   // exactly 256 entries
 *   OR
 *   { "colors": [ [r,g,b], ... ] }     // 0-255 integer triples
 *
 * Usage (ES module):
 *
 *   import PaletteManager from '/engines/shared/PaletteManager.js';
 *
 *   const pal = new PaletteManager();
 *   await pal.load('/api/assets3d/MyProject/palette.pal');
 *
 *   const color = pal.getColor(14);          // → THREE.Color
 *   const mat   = pal.getMaterial(14);       // → cached MeshLambertMaterial
 */

import * as THREE from '/lib/three/three.module.js';

// Default MagicaVoxel palette (first 8 entries shown; full 256-entry fallback)
// Source: https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt
const DEFAULT_PALETTE_HEX = [
    '#ffffff','#ffccff','#ff99ff','#ff66ff','#ff33ff','#ff00ff','#ffcccc','#ff99cc',
    '#ff66cc','#ff33cc','#ff00cc','#ffcc99','#ff9999','#ff6699','#ff3399','#ff0099',
    '#ffcc66','#ff9966','#ff6666','#ff3366','#ff0066','#ffcc33','#ff9933','#ff6633',
    '#ff3333','#ff0033','#ffcc00','#ff9900','#ff6600','#ff3300','#ff0000','#ccffff',
    '#ccccff','#cc99ff','#cc66ff','#cc33ff','#cc00ff','#ccffcc','#cccccc','#cc99cc',
    '#cc66cc','#cc33cc','#cc00cc','#ccff99','#cc9999','#cc6699','#cc3399','#cc0099',
    '#ccff66','#cc9966','#cc6666','#cc3366','#cc0066','#ccff33','#cc9933','#cc6633',
    '#cc3333','#cc0033','#ccff00','#cc9900','#cc6600','#cc3300','#cc0000','#99ffff',
    '#99ccff','#9999ff','#9966ff','#9933ff','#9900ff','#99ffcc','#99cccc','#9999cc',
    '#9966cc','#9933cc','#9900cc','#99ff99','#99cc99','#999999','#996699','#993399',
    '#990099','#99ff66','#99cc66','#999966','#996666','#993366','#990066','#99ff33',
    '#99cc33','#999933','#996633','#993333','#990033','#99ff00','#99cc00','#999900',
    '#996600','#993300','#990000','#66ffff','#66ccff','#6699ff','#6666ff','#6633ff',
    '#6600ff','#66ffcc','#66cccc','#6699cc','#6666cc','#6633cc','#6600cc','#66ff99',
    '#66cc99','#669999','#666699','#663399','#660099','#66ff66','#66cc66','#669966',
    '#666666','#663366','#660066','#66ff33','#66cc33','#669933','#666633','#663333',
    '#660033','#66ff00','#66cc00','#669900','#666600','#663300','#660000','#33ffff',
    '#33ccff','#3399ff','#3366ff','#3333ff','#3300ff','#33ffcc','#33cccc','#3399cc',
    '#3366cc','#3333cc','#3300cc','#33ff99','#33cc99','#339999','#336699','#333399',
    '#330099','#33ff66','#33cc66','#339966','#336666','#333366','#330066','#33ff33',
    '#33cc33','#339933','#336633','#333333','#330033','#33ff00','#33cc00','#339900',
    '#336600','#333300','#330000','#00ffff','#00ccff','#0099ff','#0066ff','#0033ff',
    '#0000ff','#00ffcc','#00cccc','#0099cc','#0066cc','#0033cc','#0000cc','#00ff99',
    '#00cc99','#009999','#006699','#003399','#000099','#00ff66','#00cc66','#009966',
    '#006666','#003366','#000066','#00ff33','#00cc33','#009933','#006633','#003333',
    '#000033','#00ff00','#00cc00','#009900','#006600','#003300','#000000','#111111',
    '#222222','#333333','#444444','#555555','#666666','#777777','#888888','#999999',
    '#aaaaaa','#bbbbbb','#cccccc','#dddddd','#eeeeee','#f2f2f2','#f5f5f5','#f8f8f8',
    '#fcfcfc','#fff8f0','#fff0e0','#ffe8c8','#ffd8a0','#ffc878','#ffb850','#ffa830',
    '#ff9818','#ff8800','#e07800','#c06800','#a05800','#804800','#603800','#402800',
    '#201800','#100c00','#080600','#040300','#020100','#010000','#000000','#ff7700',
];

class PaletteManager {
    constructor() {
        /** @type {THREE.Color[]} — 256 slots */
        this._colors = DEFAULT_PALETTE_HEX.map(h => new THREE.Color(h));

        /** @type {Map<number, THREE.MeshLambertMaterial>} — LRU-friendly material cache */
        this._materials = new Map();

        this.loaded = false;
        this.name   = 'default';
    }

    // ── Load ──────────────────────────────────────────────────────────────────

    /**
     * Fetch and parse a .pal JSON file, replacing the default palette.
     * Safe to call multiple times; clears material cache on reload.
     * @param {string} url  e.g. '/api/assets3d/MyProject/palette.pal'
     */
    async load(url) {
        try {
            const res  = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            this._parsePaletteData(data);
            this._materials.clear();
            this.loaded = true;
            this.name   = url.split('/').pop().replace('.pal', '');
            console.log(`[PaletteManager] loaded "${this.name}" (${this._colors.length} colors)`);
        } catch (err) {
            console.warn(`[PaletteManager] failed to load ${url}, using default palette:`, err.message);
        }
        return this;
    }

    /**
     * Load directly from a plain-object (e.g. already-fetched JSON).
     * @param {object} data  { colors: string[]|number[][] }
     */
    loadFromData(data) {
        this._parsePaletteData(data);
        this._materials.clear();
        this.loaded = true;
    }

    // ── Color API ─────────────────────────────────────────────────────────────

    /**
     * Get a THREE.Color for a palette index (0–255).
     * Index 0 is transparent/empty in MagicaVoxel convention.
     * @param {number} index
     * @returns {THREE.Color}
     */
    getColor(index) {
        const i = Math.max(0, Math.min(255, index | 0));
        return this._colors[i] ?? this._colors[0];
    }

    /**
     * Get (or create) a cached flat-shaded MeshLambertMaterial for a palette index.
     * @param {number} index
     * @returns {THREE.MeshLambertMaterial}
     */
    getMaterial(index) {
        if (this._materials.has(index)) return this._materials.get(index);
        const mat = new THREE.MeshLambertMaterial({
            color:       this.getColor(index),
            flatShading: true,
        });
        this._materials.set(index, mat);
        return mat;
    }

    /**
     * Export all 256 colors as hex strings.
     * @returns {string[]}
     */
    toHexArray() {
        return this._colors.map(c => '#' + c.getHexString());
    }

    // ── Private ───────────────────────────────────────────────────────────────

    _parsePaletteData(data) {
        const raw = data.colors ?? data;
        if (!Array.isArray(raw)) return;
        this._colors = raw.slice(0, 256).map(entry => {
            if (typeof entry === 'string') return new THREE.Color(entry);
            if (Array.isArray(entry))     return new THREE.Color(entry[0]/255, entry[1]/255, entry[2]/255);
            if (entry && 'r' in entry)    return new THREE.Color(entry.r/255,  entry.g/255,  entry.b/255);
            return new THREE.Color(0xffffff);
        });
        // Pad to 256 if fewer entries provided
        while (this._colors.length < 256) this._colors.push(new THREE.Color(0xffffff));
    }

    dispose() {
        this._materials.forEach(m => m.dispose());
        this._materials.clear();
    }
}

export default PaletteManager;
