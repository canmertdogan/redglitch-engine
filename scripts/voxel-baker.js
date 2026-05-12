const fs = require('fs');
const path = require('path');
const parseMagicaVoxel = require('parse-magica-voxel');

/**
 * Converts a MagicaVoxel .vox file to a binary GLTF (.glb) using a greedy mesh algorithm.
 * @param {string} voxPath 
 * @returns {Buffer|null}
 */
function bakeVoxToGlb(voxPath) {
    const voxData = fs.readFileSync(voxPath);
    const vox = parseMagicaVoxel(voxData);
    const { SIZE, XYZI, RGBA } = vox;
    const SX = SIZE.x, SY = SIZE.y, SZ = SIZE.z;

    // Build dense 3D grid (1-based palette index, 0 = empty)
    const grid = new Uint8Array(SX * SY * SZ);
    const cell = (x, y, z) => x + SX * (y + SY * z);
    for (const v of XYZI) {
        if (v.x < SX && v.y < SY && v.z < SZ) grid[cell(v.x, v.y, v.z)] = v.c;
    }

    const positions = [], normals = [], colors = [];

    // 6 face directions: [axis, direction (+1 or -1), outward normal]
    const FACE_DIRS = [
        [0, +1, [+1, 0, 0]], [0, -1, [-1, 0, 0]],
        [1, +1, [0, +1, 0]], [1, -1, [0, -1, 0]],
        [2, +1, [0, 0, +1]], [2, -1, [0, 0, -1]],
    ];

    for (const [axis, dir, normal] of FACE_DIRS) {
        const [a, b] = [0, 1, 2].filter(i => i !== axis);
        const sSlice = [SX, SY, SZ][axis];
        const sA     = [SX, SY, SZ][a];
        const sB     = [SX, SY, SZ][b];

        for (let slice = 0; slice < sSlice; slice++) {
            // Build 2D mask of exposed faces on this slice
            const mask = new Uint8Array(sA * sB);
            for (let j = 0; j < sA; j++) {
                for (let k = 0; k < sB; k++) {
                    const co = [0, 0, 0];
                    co[axis] = slice; co[a] = j; co[b] = k;
                    const c = grid[cell(...co)];
                    if (!c) continue;
                    const cn = [...co]; cn[axis] += dir;
                    const [nx, ny, nz] = cn;
                    const exposed = nx < 0 || ny < 0 || nz < 0 || nx >= SX || ny >= SY || nz >= SZ || !grid[cell(nx, ny, nz)];
                    if (exposed) mask[j + sA * k] = c;
                }
            }

            // Greedy merge rectangles of identical color
            const done = new Uint8Array(sA * sB);
            for (let k = 0; k < sB; k++) {
                for (let j = 0; j < sA; j++) {
                    const c = mask[j + sA * k];
                    if (!c || done[j + sA * k]) continue;
                    let dj = 1;
                    while (j + dj < sA && mask[(j + dj) + sA * k] === c && !done[(j + dj) + sA * k]) dj++;
                    let dk = 1;
                    outer: while (k + dk < sB) {
                        for (let jj = j; jj < j + dj; jj++) {
                            if (mask[jj + sA * (k + dk)] !== c || done[jj + sA * (k + dk)]) break outer;
                        }
                        dk++;
                    }
                    for (let kk = k; kk < k + dk; kk++)
                        for (let jj = j; jj < j + dj; jj++)
                            done[jj + sA * kk] = 1;

                    // Emit quad: 4 corners in (axis, a, b) space
                    const faceOffset = dir > 0 ? slice + 1 : slice;
                    const quad = [
                        [faceOffset, j,      k     ],
                        [faceOffset, j + dj, k     ],
                        [faceOffset, j + dj, k + dk],
                        [faceOffset, j,      k + dk],
                    ].map(co3 => { const xyz = [0,0,0]; xyz[axis] = co3[0]; xyz[a] = co3[1]; xyz[b] = co3[2]; return xyz; });

                    const rgba = RGBA[(c - 1) % RGBA.length] || { r: 255, g: 0, b: 255 };
                    const col  = [rgba.r / 255, rgba.g / 255, rgba.b / 255];
                    // Two triangles, CCW winding (flip for back-faces)
                    const tris = dir > 0
                        ? [quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]
                        : [quad[0], quad[2], quad[1], quad[0], quad[3], quad[2]];
                    for (const p of tris) { positions.push(...p); normals.push(...normal); colors.push(...col); }
                }
            }
        }
    }

    if (positions.length === 0) return null;

    const vc = positions.length / 3;
    const posF32  = new Float32Array(positions);
    const normF32 = new Float32Array(normals);
    const colF32  = new Float32Array(colors);
    const posBytes  = posF32.byteLength, normBytes = normF32.byteLength, colBytes = colF32.byteLength;
    const binRaw    = Buffer.concat([
        Buffer.from(posF32.buffer),
        Buffer.from(normF32.buffer),
        Buffer.from(colF32.buffer),
    ]);
    const binPad    = (4 - (binRaw.length % 4)) % 4;
    const binBuf    = binPad ? Buffer.concat([binRaw, Buffer.alloc(binPad)]) : binRaw;

    let minP = [Infinity,Infinity,Infinity], maxP = [-Infinity,-Infinity,-Infinity];
    for (let i = 0; i < positions.length; i += 3)
        for (let c = 0; c < 3; c++) { minP[c] = Math.min(minP[c], positions[i+c]); maxP[c] = Math.max(maxP[c], positions[i+c]); }

    const gltf = {
        asset: { version: '2.0', generator: 'Ketebe Build System Voxel Baker' },
        scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, mode: 4 }] }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: vc, type: 'VEC3', min: minP, max: maxP },
            { bufferView: 1, componentType: 5126, count: vc, type: 'VEC3' },
            { bufferView: 2, componentType: 5126, count: vc, type: 'VEC3' },
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0,                        byteLength: posBytes  },
            { buffer: 0, byteOffset: posBytes,                 byteLength: normBytes },
            { buffer: 0, byteOffset: posBytes + normBytes,     byteLength: colBytes  },
        ],
        buffers: [{ byteLength: binBuf.length }],
    };

    const jsonStr    = JSON.stringify(gltf);
    const jsonPadLen = Math.ceil(jsonStr.length / 4) * 4;
    const jsonBuf    = Buffer.alloc(jsonPadLen, 0x20); // pad with spaces
    jsonBuf.write(jsonStr, 'utf8');

    const totalLen   = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
    const glbHeader  = Buffer.alloc(12);
    glbHeader.writeUInt32LE(0x46546C67, 0); // magic 'glTF'
    glbHeader.writeUInt32LE(2, 4);           // version
    glbHeader.writeUInt32LE(totalLen, 8);
    const jsonChunkHdr = Buffer.alloc(8);
    jsonChunkHdr.writeUInt32LE(jsonBuf.length, 0); jsonChunkHdr.writeUInt32LE(0x4E4F534A, 4);
    const binChunkHdr  = Buffer.alloc(8);
    binChunkHdr.writeUInt32LE(binBuf.length,  0); binChunkHdr.writeUInt32LE(0x004E4942,  4);

    return Buffer.concat([glbHeader, jsonChunkHdr, jsonBuf, binChunkHdr, binBuf]);
}

module.exports = { bakeVoxToGlb };
