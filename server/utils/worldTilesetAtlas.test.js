const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    ATLAS_WIDTH,
    ATLAS_HEIGHT,
    TILE_SIZE,
    ATLAS_COLS,
    decodePngToRgba,
    encodeRgbaToPng,
    buildWorldTilesetAtlasBuffer,
    getProjectAwareWorldAtlas,
} = require('./worldTilesetAtlas');
const { makeOverlayHandler } = require('./overlayHandler');

const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');
const TILES_DIR = path.join(PUBLIC_DIR, 'sprite-art', 'worldpixelart');

test('encodeRgbaToPng and decodePngToRgba roundtrip 16x16 pixels cleanly', () => {
    const rgba = Buffer.alloc(16 * 16 * 4);
    rgba[0] = 255; rgba[1] = 10; rgba[2] = 20; rgba[3] = 255;
    const end = (16 * 16 - 1) * 4;
    rgba[end] = 12; rgba[end + 1] = 200; rgba[end + 2] = 99; rgba[end + 3] = 128;

    const png = encodeRgbaToPng(16, 16, rgba);
    const decoded = decodePngToRgba(png);
    assert.equal(decoded.width, 16);
    assert.equal(decoded.height, 16);
    assert.deepEqual(decoded.rgba, rgba);
});

test('buildWorldTilesetAtlasBuffer packs 600 tiles matching individual tile pixels', () => {
    const { buffer, width, height, tilesCount } = buildWorldTilesetAtlasBuffer(TILES_DIR);
    assert.equal(width, ATLAS_WIDTH);
    assert.equal(height, ATLAS_HEIGHT);
    assert.equal(width, 256);
    assert.equal(height, 608);
    assert.equal(tilesCount, 600);

    const atlas = decodePngToRgba(buffer);
    for (const tileNum of [1, 16, 17, 287, 600]) {
        const tilePng = fs.readFileSync(path.join(TILES_DIR, `texture_16px ${tileNum}.png`));
        const tile = decodePngToRgba(tilePng);
        const col = (tileNum - 1) % ATLAS_COLS;
        const row = Math.floor((tileNum - 1) / ATLAS_COLS);
        for (let y = 0; y < TILE_SIZE; y++) {
            for (let x = 0; x < TILE_SIZE; x++) {
                const aOff = ((row * TILE_SIZE + y) * ATLAS_WIDTH + (col * TILE_SIZE + x)) * 4;
                const tOff = (y * TILE_SIZE + x) * 4;
                for (let c = 0; c < 4; c++) {
                    assert.equal(
                        atlas.rgba[aOff + c],
                        tile.rgba[tOff + c],
                        `pixel mismatch on tile ${tileNum} (${x},${y}) channel ${c}`
                    );
                }
            }
        }
    }
});

test('getProjectAwareWorldAtlas merges per-project tile overrides over core atlas', () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-proj-'));
    try {
        const overrideDir = path.join(tmpProject, 'sprite-art', 'worldpixelart');
        fs.mkdirSync(overrideDir, { recursive: true });
        const solidRed = Buffer.alloc(16 * 16 * 4);
        for (let i = 0; i < solidRed.length; i += 4) {
            solidRed[i] = 222;
            solidRed[i + 1] = 11;
            solidRed[i + 2] = 33;
            solidRed[i + 3] = 255;
        }
        fs.writeFileSync(path.join(overrideDir, 'texture_16px 1.png'), encodeRgbaToPng(16, 16, solidRed));

        const entry = getProjectAwareWorldAtlas(PUBLIC_DIR, tmpProject);
        const decoded = decodePngToRgba(entry.buffer);
        // Tile 1 at top-left (0,0) should match override pixel
        assert.equal(decoded.rgba[0], 222);
        assert.equal(decoded.rgba[1], 11);
        assert.equal(decoded.rgba[2], 33);
        assert.equal(decoded.rgba[3], 255);
        // Tile 2 at (16,0) should still come from core tileset
        const tile2 = decodePngToRgba(fs.readFileSync(path.join(TILES_DIR, 'texture_16px 2.png')));
        const t2Off = 16 * 4;
        assert.equal(decoded.rgba[t2Off], tile2.rgba[0]);
    } finally {
        fs.rmSync(tmpProject, { recursive: true, force: true });
    }
});

test('overlayHandler passes maxAge only when configured', () => {
    const tmpProj = fs.mkdtempSync(path.join(os.tmpdir(), 'ovr-cache-'));
    try {
        fs.mkdirSync(path.join(tmpProj, 'sprite-art'), { recursive: true });
        fs.writeFileSync(path.join(tmpProj, 'sprite-art', 'x.png'), 'png');
        const overlay = makeOverlayHandler({ getActiveProject: () => tmpProj });

        let observedArgs = null;
        overlay('sprite-art', 'sprite-art', false)(
            { path: '/x.png' },
            { headersSent: false, sendFile: (...args) => { observedArgs = args; } },
            () => {}
        );
        assert.equal(observedArgs.length, 2, 'default overlay preserves 2-arg sendFile(path, cb)');

        overlay('sprite-art', 'sprite-art', false, { maxAgeMs: 60000 })(
            { path: '/x.png' },
            { headersSent: false, sendFile: (...args) => { observedArgs = args; } },
            () => {}
        );
        assert.equal(observedArgs.length, 3, 'maxAgeMs option passes sendFile options object');
        assert.equal(observedArgs[1].maxAge, 60000);
    } finally {
        fs.rmSync(tmpProj, { recursive: true, force: true });
    }
});
