/**
 * TextureAtlas3D.js  — Shared tileset/texture-atlas system for all 3D engines.
 *
 * Features
 * --------
 * • Loads a PNG atlas + JSON block-config (or uses the bundled procedural default).
 * • Provides getMaterial(THREE) → one shared MeshStandardMaterial using the atlas.
 * • Provides applyBlockUVs(geometry, blockType) → writes UV attrs on any
 *   BufferGeometry that has 6 face groups (BoxGeometry layout).
 * • Static generateDefaultCanvas() → draws a 256×256 pixel-art atlas in memory
 *   so the engine works without any external image file.
 *
 * Usage (optional toggle)
 * -----------------------
 *   const atlas = new TextureAtlas3D();          // uses built-in default
 *   await atlas.loadAsync(THREE);
 *   const mat = atlas.getMaterial(THREE);        // one material for all blocks
 *   atlas.applyBlockUVs(boxGeo, 'GRASS');        // sets UV per face on a BoxGeometry
 *
 * The atlas is purely opt-in. All engines still work with solid palette colors
 * when TextureAtlas3D is not used.
 */

// ─── Three.js — prefer the globally-loaded UMD build (three.min.js) ─────────
import * as _THREE_MOD from '/lib/three/three.module.js';

export default class TextureAtlas3D {
  /**
   * @param {string|null} imagePath  URL to atlas PNG (null → procedural default)
   * @param {string|null} configPath URL to block-config JSON (null → built-in)
   */
  constructor(imagePath = null, configPath = null) {
    this._imagePath  = imagePath;
    this._configPath = configPath;
    this._config     = null;   // parsed JSON
    this._texture    = null;   // THREE.Texture
    this._material   = null;   // THREE.MeshStandardMaterial (cached)
    this._tileSize   = 16;
    this._atlasW     = 256;
    this._atlasH     = 256;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Load the atlas texture + config.  Must be awaited before use. */
  async loadAsync(THREE) {
    THREE = THREE || (typeof globalThis !== 'undefined' && globalThis.THREE) || _THREE_MOD;

    // 1. Load config
    if (this._configPath) {
      const res = await fetch(this._configPath);
      this._config = await res.json();
    } else {
      this._config = TextureAtlas3D.DEFAULT_CONFIG;
    }
    this._tileSize = this._config.tileSize || 16;
    this._atlasW   = this._config.atlasWidth  || 256;
    this._atlasH   = this._config.atlasHeight || 256;

    // 2. Load texture
    if (this._imagePath) {
      this._texture = await this._loadTexture(this._imagePath, THREE);
    } else {
      const canvas  = TextureAtlas3D.generateDefaultCanvas();
      this._texture = new THREE.CanvasTexture(canvas);
      this._texture.magFilter = THREE.NearestFilter;
      this._texture.minFilter = THREE.NearestFilter;
    }
    
    // Explicitly set color space for modern Three.js
    this._texture.colorSpace = THREE.SRGBColorSpace;
    
    this._texture.needsUpdate = true;
    return this;
  }

  /** Returns a shared MeshPhongMaterial using the atlas. */
  getMaterial(THREE) {
    THREE = THREE || (typeof globalThis !== 'undefined' && globalThis.THREE) || _THREE_MOD;
    if (!this._material) {
      this._material = new THREE.MeshPhongMaterial({
        map:          this._texture,
        flatShading:  true,
        shininess:    0,
      });
    }
    return this._material;
  }

  /** Returns list of all valid texture keys in the atlas. */
  getAvailableKeys() {
    return Object.keys(this._config?.blocks || _DEFAULT_CONFIG.blocks);
  }

  /**
   * Writes the UV attribute on a BoxGeometry (or any BufferGeometry with 6×4
   * vertices in BoxGeometry face order) for the given block type.
   *
   * Three.js BoxGeometry face vertex layout (24 vertices total):
   *   0-3  : +x (right)   → side
   *   4-7  : -x (left)    → side
   *   8-11 : +y (top)
   *   12-15: -y (bottom)
   *   16-19: +z (front)   → side
   *   20-23: -z (back)    → side
   *
   * @param {THREE.BufferGeometry} geo
   * @param {string} blockType  e.g. 'GRASS', 'wall', 'flat'
   */
  applyBlockUVs(geo, blockType) {
    const cfg   = this._config && this._config.blocks && this._config.blocks[blockType];
    const top    = this._getUVRect(cfg ? cfg.top    : null);
    const bottom = this._getUVRect(cfg ? cfg.bottom : null);
    const side   = this._getUVRect(cfg ? cfg.side   : null);

    const uvAttr = geo.attributes.uv;
    if (!uvAttr) return;
    const uv = uvAttr.array;

    // Helper: write one face's 4 UV pairs (quad) at offset `base` in the array.
    // Three.js BoxGeometry winds each face as two triangles sharing (u0,v1)→(u1,v1)→(u1,v0) etc.
    const writeFace = (base, rect) => {
      const { u0, v0, u1, v1 } = rect;
      uv[base + 0] = u1; uv[base + 1] = v1;  // vertex 0
      uv[base + 2] = u0; uv[base + 3] = v1;  // vertex 1
      uv[base + 4] = u1; uv[base + 5] = v0;  // vertex 2
      uv[base + 6] = u0; uv[base + 7] = v0;  // vertex 3
    };

    writeFace(0,  side);    // +x right
    writeFace(8,  side);    // -x left
    writeFace(16, top);     // +y top
    writeFace(24, bottom);  // -y bottom
    writeFace(32, side);    // +z front
    writeFace(40, side);    // -z back

    uvAttr.needsUpdate = true;
  }

  /**
   * Returns UV rect for a tile name.
   * @param {string|null} tileName
   * @returns {{u0,v0,u1,v1}}
   */
  getUVRect(tileName) {
    return this._getUVRect(tileName);
  }

  // ── Procedural default atlas ──────────────────────────────────────────────

  /**
   * Draws a 256×256 pixel-art block atlas onto a new canvas.
   * Row 0: grass_top, grass_side, dirt, stone, sand, wood_plank, water, lava,
   *        snow, ice, glass, brick, concrete, metal, crate, bouncy
   * @returns {HTMLCanvasElement}
   */
  static generateDefaultCanvas() {
    const TILE  = 16;
    const COLS  = 16;
    const ROWS  = 16;
    const W     = TILE * COLS;  // 256
    const H     = TILE * ROWS;  // 256

    const canvas = (typeof document !== 'undefined')
      ? document.createElement('canvas')
      : { width: 0, height: 0, getContext: () => null };  // SSR guard

    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    // Utility: draw one 16×16 tile at column cx, row cy
    const tile = (cx, cy, fn) => {
      const ox = cx * TILE, oy = cy * TILE;
      ctx.save();
      ctx.translate(ox, oy);
      fn(ctx);
      ctx.restore();
    };

    // ── Row 0 ──────────────────────────────────────────────────────────────
    // Col 0: grass_top
    tile(0, 0, c => {
      c.fillStyle = '#4caf50'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#388e3c';
      for (let i = 0; i < 6; i++) {
        c.fillRect((i * 3) % 14, (i * 5) % 14, 2, 2);
      }
    });

    // Col 1: grass_side
    tile(1, 0, c => {
      c.fillStyle = '#795548'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#4caf50'; c.fillRect(0, 0, 16, 4);
      c.fillStyle = '#388e3c'; c.fillRect(2, 0, 2, 4); c.fillRect(9, 1, 2, 3);
    });

    // Col 2: dirt
    tile(2, 0, c => {
      c.fillStyle = '#795548'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#6d4c41';
      for (let i = 0; i < 5; i++) c.fillRect((i*4+1)%14, (i*3+1)%14, 2, 2);
    });

    // Col 3: stone
    tile(3, 0, c => {
      c.fillStyle = '#78909c'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#546e7a';
      c.fillRect(0, 7, 16, 1); c.fillRect(8, 0, 1, 7); c.fillRect(0, 0, 1, 7);
      c.fillRect(4, 8, 1, 8);  c.fillRect(12, 8, 1, 8);
    });

    // Col 4: sand
    tile(4, 0, c => {
      c.fillStyle = '#f9a825'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#f57f17';
      for (let i = 0; i < 8; i++) c.fillRect((i*5)%15, (i*3+2)%15, 1, 1);
    });

    // Col 5: wood_plank
    tile(5, 0, c => {
      c.fillStyle = '#a1887f'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#8d6e63';
      c.fillRect(0, 4, 16, 1); c.fillRect(0, 9, 16, 1); c.fillRect(0, 14, 16, 1);
      c.fillRect(8, 0, 1, 4);  c.fillRect(4, 5, 1, 4); c.fillRect(12, 10, 1, 4);
    });

    // Col 6: water
    tile(6, 0, c => {
      c.fillStyle = '#1565c0'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#1976d2';
      c.fillRect(0, 3, 6, 2); c.fillRect(8, 8, 5, 2); c.fillRect(2, 12, 8, 2);
      c.fillStyle = '#42a5f5';
      c.fillRect(3, 4, 2, 1); c.fillRect(10, 9, 2, 1);
    });

    // Col 7: lava
    tile(7, 0, c => {
      c.fillStyle = '#bf360c'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#e64a19';
      c.fillRect(1, 2, 5, 4); c.fillRect(9, 5, 4, 5); c.fillRect(3, 10, 6, 4);
      c.fillStyle = '#ff8f00';
      c.fillRect(3, 3, 2, 2); c.fillRect(10, 6, 2, 3); c.fillRect(5, 11, 2, 2);
    });

    // Col 8: snow
    tile(8, 0, c => {
      c.fillStyle = '#eceff1'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#cfd8dc';
      c.fillRect(3, 3, 2, 2); c.fillRect(10, 6, 2, 2);
      c.fillRect(6, 11, 3, 2); c.fillRect(1, 13, 2, 2);
    });

    // Col 9: ice
    tile(9, 0, c => {
      c.fillStyle = '#b3e5fc'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#81d4fa';
      c.fillRect(0, 5, 16, 1); c.fillRect(0, 11, 16, 1);
      c.fillRect(5, 0, 1, 16); c.fillRect(11, 0, 1, 16);
      c.fillStyle = '#e1f5fe'; c.fillRect(7, 7, 2, 2);
    });

    // Col 10: glass
    tile(10, 0, c => {
      c.fillStyle = '#b2dfdb'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#80cbc4'; c.fillRect(0, 0, 16, 1); c.fillRect(0, 0, 1, 16);
      c.fillRect(15, 0, 1, 16); c.fillRect(0, 15, 16, 1);
      c.fillStyle = '#e0f7fa'; c.fillRect(3, 3, 4, 3); c.fillRect(9, 9, 4, 3);
    });

    // Col 11: brick
    tile(11, 0, c => {
      c.fillStyle = '#c62828'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#b71c1c';
      for (let r = 0; r < 3; r++) {
        const off = (r % 2) * 4;
        for (let i = 0; i < 3; i++) c.fillRect(off + i * 8, r * 5 + 4, 7, 4);
      }
      c.fillStyle = '#8d6e63';
      c.fillRect(0, 4, 16, 1); c.fillRect(0, 9, 16, 1); c.fillRect(0, 14, 16, 1);
      c.fillRect(4, 0, 1, 4); c.fillRect(8, 5, 1, 4); c.fillRect(4, 10, 1, 4);
    });

    // Col 12: concrete
    tile(12, 0, c => {
      c.fillStyle = '#90a4ae'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#78909c';
      for (let i = 0; i < 3; i++) c.fillRect(i*6, i*6, 3, 1);
    });

    // Col 13: metal
    tile(13, 0, c => {
      c.fillStyle = '#455a64'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#546e7a';
      c.fillRect(0, 0, 16, 2); c.fillRect(0, 7, 16, 2); c.fillRect(0, 14, 16, 2);
      c.fillStyle = '#37474f';
      c.fillRect(1, 1, 2, 2); c.fillRect(13, 1, 2, 2);
      c.fillRect(1, 8, 2, 2); c.fillRect(13, 8, 2, 2);
    });

    // Col 14: crate
    tile(14, 0, c => {
      c.fillStyle = '#8d6e63'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#6d4c41';
      c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1);
      c.fillRect(0, 0, 1, 16); c.fillRect(15, 0, 1, 16);
      c.fillRect(7, 0, 2, 16); c.fillRect(0, 7, 16, 2);
      c.fillStyle = '#a1887f';
      c.fillRect(2, 2, 4, 4); c.fillRect(10, 2, 4, 4);
      c.fillRect(2, 10, 4, 4); c.fillRect(10, 10, 4, 4);
    });

    // Col 15: bouncy
    tile(15, 0, c => {
      c.fillStyle = '#ffd600'; c.fillRect(0, 0, 16, 16);
      c.fillStyle = '#f9a825';
      c.fillRect(0, 6, 16, 4); c.fillRect(5, 0, 6, 16);
      c.fillStyle = '#fff'; c.fillRect(6, 7, 4, 2);
      c.fillStyle = '#ff8f00';
      c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1);
    });

    return canvas;
  }

  // ── Default config (mirrors block_atlas_default.json) ────────────────────
  static get DEFAULT_CONFIG() {
    return {
      tileSize: 16, atlasWidth: 256, atlasHeight: 256,
      tiles: {
        grass_top:  { col: 0,  row: 0 }, grass_side: { col: 1,  row: 0 },
        dirt:       { col: 2,  row: 0 }, stone:      { col: 3,  row: 0 },
        sand:       { col: 4,  row: 0 }, wood_plank: { col: 5,  row: 0 },
        water:      { col: 6,  row: 0 }, lava:       { col: 7,  row: 0 },
        snow:       { col: 8,  row: 0 }, ice:        { col: 9,  row: 0 },
        glass:      { col: 10, row: 0 }, brick:      { col: 11, row: 0 },
        concrete:   { col: 12, row: 0 }, metal:      { col: 13, row: 0 },
        crate:      { col: 14, row: 0 }, bouncy:     { col: 15, row: 0 },
      },
      blocks: {
        // topdown-3d
        GRASS:    { top: 'grass_top',  side: 'grass_side', bottom: 'dirt'      },
        DIRT:     { top: 'dirt',       side: 'dirt',       bottom: 'dirt'      },
        STONE:    { top: 'stone',      side: 'stone',      bottom: 'stone'     },
        SAND:     { top: 'sand',       side: 'sand',       bottom: 'sand'      },
        WOOD:     { top: 'wood_plank', side: 'wood_plank', bottom: 'wood_plank'},
        WATER:    { top: 'water',      side: 'water',      bottom: 'water'     },
        LAVA:     { top: 'lava',       side: 'lava',       bottom: 'lava'      },
        SNOW:     { top: 'snow',       side: 'snow',       bottom: 'stone'     },
        // fps-3d
        floor:    { top: 'concrete', side: 'concrete',  bottom: 'concrete' },
        wall:     { top: 'brick',    side: 'brick',     bottom: 'brick'    },
        ceiling:  { top: 'concrete', side: 'concrete',  bottom: 'concrete' },
        crate:    { top: 'crate',    side: 'crate',     bottom: 'crate'    },
        door:     { top: 'metal',    side: 'metal',     bottom: 'metal'    },
        window:   { top: 'glass',    side: 'glass',     bottom: 'glass'    },
        water_fps:{ top: 'water',    side: 'water',     bottom: 'water'    },
        // platformer-3d
        flat:     { top: 'stone',    side: 'stone',     bottom: 'stone'    },
        slope:    { top: 'stone',    side: 'stone',     bottom: 'stone'    },
        moving:   { top: 'metal',    side: 'metal',     bottom: 'metal'    },
        bouncy:   { top: 'bouncy',   side: 'bouncy',    bottom: 'bouncy'   },
        icy:      { top: 'ice',      side: 'ice',       bottom: 'ice'      },
        lava_pf:  { top: 'lava',     side: 'lava',      bottom: 'lava'     },
        crate_pf: { top: 'crate',    side: 'crate',     bottom: 'crate'    },
      },
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  _getUVRect(tileName) {
    const fallback = { u0: 0, v0: 0, u1: 1/16, v1: 1/16 };
    if (!tileName || !this._config) return fallback;
    const tDef = this._config.tiles[tileName];
    if (!tDef) return fallback;
    const cols = this._atlasW / this._tileSize;
    const rows = this._atlasH / this._tileSize;
    const u0 =  tDef.col       / cols;
    const u1 = (tDef.col + 1)  / cols;
    const v0 = 1 - (tDef.row + 1) / rows;
    const v1 = 1 -  tDef.row      / rows;
    return { u0, v0, u1, v1 };
  }

  _loadTexture(url, THREE) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        tex => {
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }
}
