/**
 * Shared loader for the 600-tile World Pixel Art spritesheet.
 * Replaces 600 individual PNG fetches with a single pre-packed 256x608 atlas
 * and provides zero-canvas CSS sprite thumbnail helpers for editor palettes.
 */
(function (root) {
    const TILE_SIZE = 16;
    const COLS = 16;
    const TOTAL_TILES = 600;
    const ROWS = Math.ceil(TOTAL_TILES / COLS); // 38
    const DEFAULT_ATLAS_URL = 'sprite-art/worldpixelart_atlas.png';

    let activeVersionTag = '';
    let atlasImagePromise = null;
    const canvasCache = new Map();

    function getAtlasUrl() {
        return activeVersionTag ? `${DEFAULT_ATLAS_URL}?v=${activeVersionTag}` : DEFAULT_ATLAS_URL;
    }

    function invalidateCache() {
        atlasImagePromise = null;
        canvasCache.clear();
        activeVersionTag = String(Date.now());
    }

    if (root && root.RedglitchEventBus && typeof root.RedglitchEventBus.on === 'function') {
        root.RedglitchEventBus.on('system:project:loaded', () => invalidateCache());
    }

    function loadAtlasImage() {
        if (atlasImagePromise) return atlasImagePromise;
        const url = getAtlasUrl();
        atlasImagePromise = new Promise((resolve, reject) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
                if (img.naturalWidth >= COLS * TILE_SIZE && img.naturalHeight >= ROWS * TILE_SIZE) {
                    resolve(img);
                } else {
                    atlasImagePromise = null;
                    reject(new Error(`Unexpected atlas dimensions: ${img.naturalWidth}x${img.naturalHeight}`));
                }
            };
            img.onerror = () => {
                atlasImagePromise = null;
                reject(new Error(`Failed to load tileset atlas: ${url}`));
            };
            img.src = url;
        });
        return atlasImagePromise;
    }

    async function fallbackLoadIndividualTiles(targetTileSize) {
        const canvas = document.createElement('canvas');
        canvas.width = COLS * targetTileSize;
        canvas.height = ROWS * targetTileSize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        let loaded = 0;
        const batchSize = 50;
        for (let i = 1; i <= TOTAL_TILES; i += batchSize) {
            const batch = [];
            for (let j = i; j < i + batchSize && j <= TOTAL_TILES; j++) {
                batch.push(new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const x = ((j - 1) % COLS) * targetTileSize;
                        const y = Math.floor((j - 1) / COLS) * targetTileSize;
                        ctx.drawImage(img, x, y, targetTileSize, targetTileSize);
                        loaded++;
                        resolve();
                    };
                    img.onerror = () => resolve();
                    img.src = `sprite-art/worldpixelart/texture_16px%20${j}.png`;
                }));
            }
            await Promise.all(batch);
        }
        return { canvas, loaded };
    }

    /**
     * Load the combined 600-tile spritesheet into an offscreen HTMLCanvasElement.
     * Reuses a cached canvas per requested tileSize when no custom progress callback needs streaming.
     */
    async function loadWorldTilesetCanvas(options = {}) {
        const tileSize = Number(options.tileSize) > 0 ? Number(options.tileSize) : TILE_SIZE;
        const fallbackUrl = options.fallbackUrl || null;
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

        const cacheKey = `${tileSize}:${activeVersionTag}`;
        if (canvasCache.has(cacheKey)) {
            const existing = canvasCache.get(cacheKey);
            if (onProgress) onProgress(100);
            return existing;
        }

        const pending = (async () => {
            try {
                const img = await loadAtlasImage();
                if (onProgress) onProgress(100);
                const canvas = document.createElement('canvas');
                canvas.width = COLS * tileSize;
                canvas.height = ROWS * tileSize;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                return canvas;
            } catch (atlasErr) {
                console.warn('[WorldTilesetLoader] Atlas unavailable, falling back to individual tiles:', atlasErr.message);
                const { canvas, loaded } = await fallbackLoadIndividualTiles(tileSize);
                if (fallbackUrl && (loaded < 50 || canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 0)) {
                    await new Promise((resolve) => {
                        const fb = new Image();
                        fb.onload = () => {
                            canvas.width = fb.width;
                            canvas.height = fb.height;
                            const ctx = canvas.getContext('2d');
                            ctx.imageSmoothingEnabled = false;
                            ctx.drawImage(fb, 0, 0);
                            resolve();
                        };
                        fb.onerror = () => resolve();
                        fb.src = fallbackUrl;
                    });
                }
                if (onProgress) onProgress(100);
                return canvas;
            }
        })();

        canvasCache.set(cacheKey, pending);
        try {
            return await pending;
        } catch (err) {
            canvasCache.delete(cacheKey);
            throw err;
        }
    }

    /**
     * Resolve a CSS background-image URL for an already-loaded tileset (HTMLImageElement or HTMLCanvasElement).
     */
    function getPaletteSpriteUrl(tileset) {
        if (tileset && typeof HTMLImageElement !== 'undefined' && tileset instanceof HTMLImageElement && tileset.src) {
            return tileset.src;
        }
        return getAtlasUrl();
    }

    /**
     * Style a palette thumbnail element using CSS sprites instead of allocating a 2D <canvas> per tile.
     */
    function applyTileSpriteStyle(el, tileIndex, cols = COLS, rows = ROWS, spriteUrl = getAtlasUrl()) {
        const col = tileIndex % cols;
        const row = Math.floor(tileIndex / cols);
        const posX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
        const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0;
        el.style.backgroundImage = `url("${spriteUrl}")`;
        el.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
        el.style.backgroundPosition = `${posX}% ${posY}%`;
        el.style.backgroundRepeat = 'no-repeat';
        el.style.imageRendering = 'pixelated';
        return el;
    }

    const api = {
        TILE_SIZE,
        COLS,
        ROWS,
        TOTAL_TILES,
        ATLAS_URL: DEFAULT_ATLAS_URL,
        getAtlasUrl,
        invalidateCache,
        loadAtlasImage,
        loadWorldTilesetCanvas,
        getPaletteSpriteUrl,
        applyTileSpriteStyle,
    };

    if (root) {
        root.RedglitchWorldTileset = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
