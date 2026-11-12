const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const TILE_SIZE = 16;
const ATLAS_COLS = 16;
const TOTAL_TILES = 600;
const ATLAS_ROWS = Math.ceil(TOTAL_TILES / ATLAS_COLS); // 38
const ATLAS_WIDTH = ATLAS_COLS * TILE_SIZE; // 256
const ATLAS_HEIGHT = ATLAS_ROWS * TILE_SIZE; // 608

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

/**
 * Decode an 8-bit non-interlaced PNG buffer into tightly packed RGBA pixels.
 */
function decodePngToRgba(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) {
        throw new Error('Invalid PNG signature');
    }

    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    let plte = null;
    let trns = null;
    const idatChunks = [];

    while (offset + 8 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > buf.length) break;
        const data = buf.subarray(dataStart, dataEnd);

        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'PLTE') {
            plte = data;
        } else if (type === 'tRNS') {
            trns = data;
        } else if (type === 'IDAT') {
            idatChunks.push(data);
        } else if (type === 'IEND') {
            break;
        }
        offset = dataEnd + 4;
    }

    if (width <= 0 || height <= 0) {
        throw new Error('PNG missing valid IHDR');
    }
    if (bitDepth !== 8 || interlace !== 0) {
        throw new Error(`Unsupported PNG format (bitDepth=${bitDepth}, interlace=${interlace})`);
    }

    const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
    const bpp = channelsByType[colorType];
    if (!bpp) {
        throw new Error(`Unsupported PNG colorType=${colorType}`);
    }

    const stride = width * bpp;
    const raw = zlib.inflateSync(Buffer.concat(idatChunks));
    if (raw.length < (stride + 1) * height) {
        throw new Error('Truncated PNG image data');
    }

    const unfiltered = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
        const srcRowStart = y * (stride + 1);
        const filterType = raw[srcRowStart];
        const dstRowStart = y * stride;
        const prevRowStart = (y - 1) * stride;

        for (let i = 0; i < stride; i++) {
            const x = raw[srcRowStart + 1 + i];
            const a = i >= bpp ? unfiltered[dstRowStart + i - bpp] : 0;
            const b = y > 0 ? unfiltered[prevRowStart + i] : 0;
            const c = (y > 0 && i >= bpp) ? unfiltered[prevRowStart + i - bpp] : 0;
            let val;
            switch (filterType) {
                case 0: val = x; break;
                case 1: val = (x + a) & 0xff; break;
                case 2: val = (x + b) & 0xff; break;
                case 3: val = (x + ((a + b) >> 1)) & 0xff; break;
                case 4: val = (x + paethPredictor(a, b, c)) & 0xff; break;
                default: throw new Error(`Invalid PNG scanline filter=${filterType}`);
            }
            unfiltered[dstRowStart + i] = val;
        }
    }

    if (colorType === 6) {
        return { width, height, rgba: unfiltered };
    }

    const rgba = Buffer.alloc(width * height * 4);
    const pixels = width * height;
    if (colorType === 2) {
        const hasKey = trns && trns.length >= 6;
        const kr = hasKey ? trns.readUInt16BE(0) & 0xff : -1;
        const kg = hasKey ? trns.readUInt16BE(2) & 0xff : -1;
        const kb = hasKey ? trns.readUInt16BE(4) & 0xff : -1;
        for (let i = 0; i < pixels; i++) {
            const s = i * 3;
            const d = i * 4;
            const r = unfiltered[s], g = unfiltered[s + 1], b = unfiltered[s + 2];
            rgba[d] = r;
            rgba[d + 1] = g;
            rgba[d + 2] = b;
            rgba[d + 3] = (hasKey && r === kr && g === kg && b === kb) ? 0 : 255;
        }
    } else if (colorType === 3) {
        if (!plte) throw new Error('Indexed PNG missing PLTE chunk');
        for (let i = 0; i < pixels; i++) {
            const idx = unfiltered[i];
            const pOff = idx * 3;
            const d = i * 4;
            rgba[d] = pOff + 2 < plte.length ? plte[pOff] : 0;
            rgba[d + 1] = pOff + 2 < plte.length ? plte[pOff + 1] : 0;
            rgba[d + 2] = pOff + 2 < plte.length ? plte[pOff + 2] : 0;
            rgba[d + 3] = (trns && idx < trns.length) ? trns[idx] : 255;
        }
    } else if (colorType === 0) {
        const hasKey = trns && trns.length >= 2;
        const key = hasKey ? trns.readUInt16BE(0) & 0xff : -1;
        for (let i = 0; i < pixels; i++) {
            const v = unfiltered[i];
            const d = i * 4;
            rgba[d] = v;
            rgba[d + 1] = v;
            rgba[d + 2] = v;
            rgba[d + 3] = (hasKey && v === key) ? 0 : 255;
        }
    } else if (colorType === 4) {
        for (let i = 0; i < pixels; i++) {
            const v = unfiltered[i * 2];
            const a = unfiltered[i * 2 + 1];
            const d = i * 4;
            rgba[d] = v;
            rgba[d + 1] = v;
            rgba[d + 2] = v;
            rgba[d + 3] = a;
        }
    }
    return { width, height, rgba };
}

/**
 * Encode tightly packed RGBA pixel data into an uncompressed-layout 8-bit RGBA PNG.
 */
function encodeRgbaToPng(width, height, rgba) {
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        const srcRow = y * stride;
        const dstRow = y * (stride + 1);
        raw[dstRow] = 1; // PNG Sub filter reduces size on pixel art tiles
        for (let i = 0; i < stride; i++) {
            const left = i >= 4 ? rgba[srcRow + i - 4] : 0;
            raw[dstRow + 1 + i] = (rgba[srcRow + i] - left) & 0xff;
        }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const idat = zlib.deflateSync(raw, { level: 6 });
    return Buffer.concat([
        PNG_SIG,
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', idat),
        makeChunk('IEND', Buffer.alloc(0)),
    ]);
}

/**
 * Pack texture_16px 1..600.png into a 256x608 (16x38 grid of 16x16 tiles) PNG buffer.
 */
function buildWorldTilesetAtlasBuffer(primaryTilesDir, fallbackTilesDir = null) {
    const atlasRgba = Buffer.alloc(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
    let tilesCount = 0;

    for (let i = 1; i <= TOTAL_TILES; i++) {
        const filename = `texture_16px ${i}.png`;
        let filePath = primaryTilesDir ? path.join(primaryTilesDir, filename) : null;
        if (!filePath || !fs.existsSync(filePath)) {
            filePath = fallbackTilesDir ? path.join(fallbackTilesDir, filename) : null;
        }
        if (!filePath || !fs.existsSync(filePath)) continue;

        const decoded = decodePngToRgba(fs.readFileSync(filePath));
        const tileCol = (i - 1) % ATLAS_COLS;
        const tileRow = Math.floor((i - 1) / ATLAS_COLS);
        const destX = tileCol * TILE_SIZE;
        const destY = tileRow * TILE_SIZE;
        const copyW = Math.min(TILE_SIZE, decoded.width);
        const copyH = Math.min(TILE_SIZE, decoded.height);

        for (let py = 0; py < copyH; py++) {
            const srcStart = (py * decoded.width) * 4;
            const srcEnd = srcStart + copyW * 4;
            const dstStart = ((destY + py) * ATLAS_WIDTH + destX) * 4;
            decoded.rgba.copy(atlasRgba, dstStart, srcStart, srcEnd);
        }
        tilesCount++;
    }

    const buffer = encodeRgbaToPng(ATLAS_WIDTH, ATLAS_HEIGHT, atlasRgba);
    return { buffer, width: ATLAS_WIDTH, height: ATLAS_HEIGHT, tilesCount };
}

function makeEtag(buffer) {
    return `"${crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16)}"`;
}

let cachedCoreEntry = null;
const projectAtlasCache = new Map();

function ensurePublicWorldAtlas(publicDir, { force = false } = {}) {
    const tilesDir = path.join(publicDir, 'sprite-art', 'worldpixelart');
    const outPath = path.join(publicDir, 'sprite-art', 'worldpixelart_atlas.png');

    let tilesDirMtime = 0;
    try { tilesDirMtime = fs.statSync(tilesDir).mtimeMs; } catch {}

    if (!force && cachedCoreEntry && cachedCoreEntry.outPath === outPath && cachedCoreEntry.tilesDirMtime >= tilesDirMtime) {
        return cachedCoreEntry;
    }

    if (!force && fs.existsSync(outPath)) {
        try {
            const outStat = fs.statSync(outPath);
            if (outStat.size > 100 && outStat.mtimeMs >= tilesDirMtime) {
                const buffer = fs.readFileSync(outPath);
                cachedCoreEntry = { outPath, buffer, etag: makeEtag(buffer), tilesDirMtime };
                return cachedCoreEntry;
            }
        } catch {}
    }

    const { buffer, tilesCount } = buildWorldTilesetAtlasBuffer(tilesDir);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const tmpPath = `${outPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, outPath);
    try { tilesDirMtime = fs.statSync(tilesDir).mtimeMs; } catch {}
    cachedCoreEntry = { outPath, buffer, etag: makeEtag(buffer), tilesDirMtime, tilesCount };
    return cachedCoreEntry;
}

function getLatestTileOverrideMtime(dir) {
    try {
        const entries = fs.readdirSync(dir);
        let maxMtime = 0;
        let hasTiles = false;
        for (const name of entries) {
            if (!name.startsWith('texture_16px ') || !name.endsWith('.png')) continue;
            hasTiles = true;
            try {
                const st = fs.statSync(path.join(dir, name));
                if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
            } catch {}
        }
        return hasTiles ? maxMtime : 0;
    } catch {
        return 0;
    }
}

/**
 * Resolve the atlas PNG buffer for the active project, merging project overrides
 * over the core public tileset cleanly in RAM when needed.
 */
function getProjectAwareWorldAtlas(publicDir, activeProjectDir = null) {
    if (activeProjectDir) {
        const customAtlasPath = path.join(activeProjectDir, 'sprite-art', 'worldpixelart_atlas.png');
        if (fs.existsSync(customAtlasPath)) {
            try {
                const st = fs.statSync(customAtlasPath);
                const cached = projectAtlasCache.get(customAtlasPath);
                if (cached && cached.mtimeMs === st.mtimeMs) return cached;
                const buffer = fs.readFileSync(customAtlasPath);
                const entry = { buffer, etag: makeEtag(buffer), mtimeMs: st.mtimeMs };
                projectAtlasCache.set(customAtlasPath, entry);
                return entry;
            } catch {}
        }

        const projTilesDir = path.join(activeProjectDir, 'sprite-art', 'worldpixelart');
        const overrideMtime = getLatestTileOverrideMtime(projTilesDir);
        if (overrideMtime > 0) {
            const cached = projectAtlasCache.get(projTilesDir);
            if (cached && cached.mtimeMs === overrideMtime) return cached;
            const coreTilesDir = path.join(publicDir, 'sprite-art', 'worldpixelart');
            const { buffer } = buildWorldTilesetAtlasBuffer(projTilesDir, coreTilesDir);
            const entry = { buffer, etag: makeEtag(buffer), mtimeMs: overrideMtime };
            if (projectAtlasCache.size > 16) projectAtlasCache.clear();
            projectAtlasCache.set(projTilesDir, entry);
            return entry;
        }
    }

    return ensurePublicWorldAtlas(publicDir);
}

if (require.main === module) {
    const publicDir = path.resolve(__dirname, '..', '..', 'public');
    const result = ensurePublicWorldAtlas(publicDir, { force: true });
    console.log(`[WorldTilesetAtlas] Built ${result.outPath} (${ATLAS_WIDTH}x${ATLAS_HEIGHT}, ${result.buffer.length} bytes, ${result.tilesCount} tiles)`);
}

module.exports = {
    TILE_SIZE,
    ATLAS_COLS,
    ATLAS_ROWS,
    TOTAL_TILES,
    ATLAS_WIDTH,
    ATLAS_HEIGHT,
    decodePngToRgba,
    encodeRgbaToPng,
    buildWorldTilesetAtlasBuffer,
    ensurePublicWorldAtlas,
    getProjectAwareWorldAtlas,
};
