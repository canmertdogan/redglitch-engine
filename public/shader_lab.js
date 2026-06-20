// REDGLITCH SHADER LAB v2 — Full-featured GLSL editor with live WebGL preview
// ======================== GLOBALS ========================
let gl;
let monacoEditor;
let currentTab = 'frag';
let fragSource = '';
let vertSource = '';
let program = null;
let meshCache = {};
let textureCache = {};
let animFrameId = null;
let startTime = Date.now();
let compileTimeout = null;
let currentShaderName = 'untitled';
let autoCompile = true;
let uniformsPanelCollapsed = false;
let uniforms = [];
let uniformValues = {};
let bgColor = [0.02, 0.02, 0.04, 1];
let rotationAngle = 0;
let fps = 0, frameCount = 0, lastFpsTime = 0;
let mouseX = 0.5, mouseY = 0.5;
let timePaused = false;
let pausedTime = 0;
let cameraDist = 3.2;
let wireframeMode = false;
let rotationPaused = false;
let customTextureData = null;
let resMult = 1;
let projectIs3D = true;
let projectEngineType = 'fps-3d';

// ======================== PROJECT TYPE DETECTION ========================
const VALID_3D_ENGINES = new Set(['unified-3d', 'topdown-3d', 'fps-3d', 'platformer-3d']);
const ENGINE_LABELS = {
    'rpg-topdown': '2D RPG Top-Down', 'platformer-2d': '2D Platformer', 'iso-pixel': '2D Isometric',
    'unified-3d': '3D Unified', 'topdown-3d': '3D Top-Down', 'fps-3d': '3D FPS', 'platformer-3d': '3D Platformer'
};

async function detectProjectType() {
    projectIs3D = true;
    try {
        const metaRes = await fetch(`/api/projects`);
        if (metaRes.ok) {
            const projects = await metaRes.json();
            let activeProjName = window.RedGlitchProjectState?.projectName || '';
            // Fallback: try the current project endpoint
            if (!activeProjName) {
                try {
                    const cur = await fetch('/api/projects/current');
                    const curData = await cur.json();
                    if (!curData.isRoot) activeProjName = curData.name;
                } catch(e) {}
            }
            const proj = Array.isArray(projects) ? projects.find(p => p.name === activeProjName) : null;
            if (proj && proj.engineType) {
                projectEngineType = proj.engineType;
                projectIs3D = VALID_3D_ENGINES.has(proj.engineType);
                if (proj.engineType === 'unified-3d' && proj.mode) projectEngineType = proj.mode;
            }
        }
    } catch (e) { /* keep defaults */ }
}

function getProjectModeLabel() { return projectIs3D ? '3D' : '2D'; }

const DEFAULT_VERT = `attribute vec3 aPosition;
attribute vec2 aTexCoord;
attribute vec3 aNormal;
uniform mat4 uModelViewProjection;
uniform mat4 uModelMatrix;
uniform mat4 uNormalMatrix;
varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;

void main() {
    gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
    vTexCoord = aTexCoord;
    vNormal = normalize(mat3(uNormalMatrix) * aNormal);
    vPosition = aPosition;
    vWorldPosition = (uModelMatrix * vec4(aPosition, 1.0)).xyz;
}`;

const DEFAULT_FRAG = `precision highp float;
varying vec2 vTexCoord;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;

void main() {
    vec2 uv = vTexCoord;
    vec4 tex = texture2D(uTexture, uv);
    vec3 light = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(vNormal, light), 0.0);
    vec3 col = tex.rgb * (0.3 + 0.7 * diff);
    float glow = 0.02 / distance(uv, uMouse);
    col += vec3(glow * 0.3, glow * 0.1, glow * 0.5);
    gl_FragColor = vec4(col, 1.0);
}`;

// ======================== MATRIX MATH ========================
// All matrices are column-major 4x4 (index = col*4 + row)
function mat4Identity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }

function mat4Multiply(a, b) {
    const r = new Array(16);
    for (let col = 0; col < 4; col++)
        for (let row = 0; row < 4; row++)
            r[col*4+row] = a[row]*b[col*4] + a[4+row]*b[col*4+1] + a[8+row]*b[col*4+2] + a[12+row]*b[col*4+3];
    return r;
}

function mat4Perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY * 0.5);
    const rangeInv = 1 / (near - far);
    return [
        f/aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far+near)*rangeInv, -1,
        0, 0, 2*far*near*rangeInv, 0
    ];
}

function mat4LookAt(eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ) {
    let fX = centerX - eyeX, fY = centerY - eyeY, fZ = centerZ - eyeZ;
    const fLen = Math.sqrt(fX*fX + fY*fY + fZ*fZ) || 1;
    fX /= fLen; fY /= fLen; fZ /= fLen;
    let sX = fY*upZ - fZ*upY, sY = fZ*upX - fX*upZ, sZ = fX*upY - fY*upX;
    const sLen = Math.sqrt(sX*sX + sY*sY + sZ*sZ) || 1;
    sX /= sLen; sY /= sLen; sZ /= sLen;
    const uX = sY*fZ - sZ*fY, uY = sZ*fX - sX*fZ, uZ = sX*fY - sY*fX;
    return [
        sX, sY, sZ, 0,
        uX, uY, uZ, 0,
        -fX, -fY, -fZ, 0,
        -(sX*eyeX + sY*eyeY + sZ*eyeZ),
        -(uX*eyeX + uY*eyeY + uZ*eyeZ),
        fX*eyeX + fY*eyeY + fZ*eyeZ,
        1
    ];
}

function mat4RotateY(m, a) {
    const c=Math.cos(a), s=Math.sin(a);
    const r = [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
    return mat4Multiply(m, r);
}
function mat4RotateX(m, a) {
    const c=Math.cos(a), s=Math.sin(a);
    const r = [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
    return mat4Multiply(m, r);
}

function mat4Inverse(m) {
    const a=m; const inv=new Array(16);
    inv[0]=a[5]*a[10]*a[15]-a[5]*a[11]*a[14]-a[9]*a[6]*a[15]+a[9]*a[7]*a[14]+a[13]*a[6]*a[11]-a[13]*a[7]*a[10];
    inv[1]=-a[1]*a[10]*a[15]+a[1]*a[11]*a[14]+a[9]*a[2]*a[15]-a[9]*a[3]*a[14]-a[13]*a[2]*a[11]+a[13]*a[3]*a[10];
    inv[2]=a[1]*a[6]*a[15]-a[1]*a[7]*a[14]-a[5]*a[2]*a[15]+a[5]*a[3]*a[14]+a[13]*a[2]*a[7]-a[13]*a[3]*a[6];
    inv[3]=-a[1]*a[6]*a[11]+a[1]*a[7]*a[10]+a[5]*a[2]*a[11]-a[5]*a[3]*a[10]-a[9]*a[2]*a[7]+a[9]*a[3]*a[6];
    inv[4]=-a[4]*a[10]*a[15]+a[4]*a[11]*a[14]+a[8]*a[6]*a[15]-a[8]*a[7]*a[14]-a[12]*a[6]*a[11]+a[12]*a[7]*a[10];
    inv[5]=a[0]*a[10]*a[15]-a[0]*a[11]*a[14]-a[8]*a[2]*a[15]+a[8]*a[3]*a[14]+a[12]*a[2]*a[11]-a[12]*a[3]*a[10];
    inv[6]=-a[0]*a[6]*a[15]+a[0]*a[7]*a[14]+a[4]*a[2]*a[15]-a[4]*a[3]*a[14]-a[12]*a[2]*a[7]+a[12]*a[3]*a[6];
    inv[7]=a[0]*a[6]*a[11]-a[0]*a[7]*a[10]-a[4]*a[2]*a[11]+a[4]*a[3]*a[10]+a[8]*a[2]*a[7]-a[8]*a[3]*a[6];
    inv[8]=a[4]*a[9]*a[15]-a[4]*a[11]*a[13]-a[8]*a[5]*a[15]+a[8]*a[7]*a[13]+a[12]*a[5]*a[11]-a[12]*a[7]*a[9];
    inv[9]=-a[0]*a[9]*a[15]+a[0]*a[11]*a[13]+a[8]*a[1]*a[15]-a[8]*a[3]*a[13]-a[12]*a[1]*a[11]+a[12]*a[3]*a[9];
    inv[10]=a[0]*a[5]*a[15]-a[0]*a[7]*a[13]-a[4]*a[1]*a[15]+a[4]*a[3]*a[13]+a[12]*a[1]*a[7]-a[12]*a[3]*a[5];
    inv[11]=-a[0]*a[5]*a[11]+a[0]*a[7]*a[9]+a[4]*a[1]*a[11]-a[4]*a[3]*a[9]-a[8]*a[1]*a[7]+a[8]*a[3]*a[5];
    inv[12]=-a[4]*a[9]*a[14]+a[4]*a[10]*a[13]+a[8]*a[5]*a[14]-a[8]*a[6]*a[13]-a[12]*a[5]*a[10]+a[12]*a[6]*a[9];
    inv[13]=a[0]*a[9]*a[14]-a[0]*a[10]*a[13]-a[8]*a[1]*a[14]+a[8]*a[2]*a[13]+a[12]*a[1]*a[10]-a[12]*a[2]*a[9];
    inv[14]=-a[0]*a[5]*a[14]+a[0]*a[6]*a[13]+a[4]*a[1]*a[14]-a[4]*a[2]*a[13]-a[12]*a[1]*a[6]+a[12]*a[2]*a[5];
    inv[15]=a[0]*a[5]*a[10]-a[0]*a[6]*a[9]-a[4]*a[1]*a[10]+a[4]*a[2]*a[9]+a[8]*a[1]*a[6]-a[8]*a[2]*a[5];
    const det = a[0]*inv[0] + a[4]*inv[4] + a[8]*inv[8] + a[12]*inv[12];
    if (Math.abs(det) < 1e-12) return mat4Identity();
    for (let i = 0; i < 16; i++) inv[i] /= det;
    return inv;
}

function mat4Transpose(m) { return [m[0],m[4],m[8],m[12], m[1],m[5],m[9],m[13], m[2],m[6],m[10],m[14], m[3],m[7],m[11],m[15]]; }

// ======================== MESH GENERATORS ========================
function generateQuad() {
    return { vertices: new Float32Array([-1,-1,0, 1,-1,0, -1,1,0, -1,1,0, 1,-1,0, 1,1,0]),
        uvs: new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]),
        normals: new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1]), count: 6 };
}
function generateSphere(r, ws, hs) {
    const verts=[], uvs=[], norms=[], idx=[];
    for (let y=0;y<=hs;y++) for (let x=0;x<=ws;x++) {
        const u=x/ws, v=y/hs, theta=u*Math.PI*2, phi=v*Math.PI;
        verts.push(r*Math.sin(phi)*Math.cos(theta), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(theta));
        uvs.push(u, v); norms.push(Math.sin(phi)*Math.cos(theta), Math.cos(phi), Math.sin(phi)*Math.sin(theta));
    }
    for (let y=0;y<hs;y++) for (let x=0;x<ws;x++) { const a=y*(ws+1)+x, b=a+ws+1; idx.push(a,b,a+1,b,b+1,a+1); }
    return { vertices: new Float32Array(verts), uvs: new Float32Array(uvs), normals: new Float32Array(norms), count: idx.length, indices: idx };
}
function generateCube() {
    const d=1, verts=[], uvs=[], norms=[], idx=[];
    const faces=[[0,0,1,[[-d,-d,d],[d,-d,d],[d,d,d],[-d,d,d]]],[0,0,-1,[[d,-d,-d],[-d,-d,-d],[-d,d,-d],[d,d,-d]]],
        [1,0,0,[[d,-d,d],[d,-d,-d],[d,d,-d],[d,d,d]]],[-1,0,0,[[-d,-d,-d],[-d,-d,d],[-d,d,d],[-d,d,-d]]],
        [0,1,0,[[-d,d,d],[d,d,d],[d,d,-d],[-d,d,-d]]],[0,-1,0,[[-d,-d,-d],[d,-d,-d],[d,-d,d],[-d,-d,d]]]];
    const fuvs=[[0,0],[1,0],[1,1],[0,1]];
    faces.forEach(f=>{for(let i=0;i<4;i++){verts.push(...f[3][i]);uvs.push(...fuvs[i]);norms.push(f[0],f[1],f[2]);}
        const base=verts.length/3-4;idx.push(base,base+1,base+2,base,base+2,base+3);});
    return { vertices: new Float32Array(verts), uvs: new Float32Array(uvs), normals: new Float32Array(norms), count: idx.length, indices: idx };
}
function generateCylinder(r, h, seg) {
    const verts=[], uvs=[], norms=[], idx=[], hh=h/2;
    for (let i=0;i<=seg;i++){const t=i/seg*Math.PI*2, cx=Math.cos(t), sz=Math.sin(t);
        verts.push(cx*r,-hh,sz*r);uvs.push(i/seg,0);norms.push(cx,0,sz);
        verts.push(cx*r,hh,sz*r);uvs.push(i/seg,1);norms.push(cx,0,sz);}
    for (let i=0;i<seg;i++){const a=i*2,b=a+1,c=a+2,d=a+3;idx.push(a,c,b,b,c,d);}
    return { vertices: new Float32Array(verts), uvs: new Float32Array(uvs), normals: new Float32Array(norms), count: idx.length, indices: idx };
}
function generateTorus(R, tube, rSeg, tSeg) {
    const verts=[], uvs=[], norms=[], idx=[];
    for (let i=0;i<=rSeg;i++){const u=i/rSeg*Math.PI*2, cu=Math.cos(u), su=Math.sin(u);
        for (let j=0;j<=tSeg;j++){const v=j/tSeg*Math.PI*2, cv=Math.cos(v), sv=Math.sin(v);
            verts.push((R+tube*cv)*cu, tube*sv, (R+tube*cv)*su);uvs.push(i/rSeg,j/tSeg);
            norms.push(cv*cu, sv, cv*su);}}
    for (let i=0;i<rSeg;i++) for (let j=0;j<tSeg;j++){const a=i*(tSeg+1)+j,b=a+tSeg+1;idx.push(a,b,a+1,b,b+1,a+1);}
    return { vertices: new Float32Array(verts), uvs: new Float32Array(uvs), normals: new Float32Array(norms), count: idx.length, indices: idx };
}

function getOrCreateMesh(type) {
    if (meshCache[type]) return meshCache[type];
    let mesh;
    switch (type) {
        case 'quad': mesh = generateQuad(); break;
        case 'sphere': mesh = generateSphere(1, 32, 24); break;
        case 'cube': mesh = generateCube(); break;
        case 'cylinder': mesh = generateCylinder(1, 2, 32); break;
        case 'torus': mesh = generateTorus(1, 0.35, 32, 24); break;
        default: mesh = generateSphere(1, 32, 24);
    }
    mesh.type = type; mesh.vao = setupMeshBuffers(mesh); meshCache[type] = mesh; return mesh;
}

function setupMeshBuffers(mesh) {
    const vao = {};
    vao.pos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vao.pos); gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    vao.uv = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vao.uv); gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
    vao.norm = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vao.norm); gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    if (mesh.indices) { vao.index = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vao.index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW); }
    return vao;
}

// ======================== TEXTURE GENERATORS ========================
function generateTexture(type) {
    if (textureCache[type]) return textureCache[type];
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const w = 256, h = 256, data = new Uint8Array(w * h * 4);

    if (type === 'synthwave') {
        // Vaporwave synthwave sun + grid
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const u = x / w, v = y / h;
            // Grid lines
            const gridX = (Math.abs((x % 16) - 8) < 1) ? 0.15 : 0;
            const gridY = (Math.abs((y % 16) - 8) < 1) ? 0.15 : 0;
            const grid = Math.max(gridX, gridY);
            // Sun
            const dx = u - 0.5, dy = v - 0.7;
            const sunDist = Math.sqrt(dx*dx + dy*dy*3);
            const sun = Math.max(0, 1 - sunDist * 2.5);
            const sunGlow = Math.max(0, 1 - sunDist * 1.2) * 0.5;
            // Gradient sky
            const sky = v * 0.6;
            // Stripes
            const stripe = (Math.abs((y % 8) - 4) < 1) ? 0.08 : 0;
            // Compose
            const r = Math.min(1, sky * 0.6 + grid * 0.8 + sun * 1.0 + sunGlow * 1.0 + stripe * 0.3);
            const g = Math.min(1, sky * 0.05 + grid * 0.4 + sun * 0.3 + sunGlow * 0.1 + stripe * 0.1);
            const b = Math.min(1, sky * 0.8 + grid * 0.6 + sun * 0.15 + sunGlow * 0.5 + stripe * 0.6);
            data[i] = r * 255 | 0; data[i+1] = g * 255 | 0; data[i+2] = b * 255 | 0; data[i+3] = 255;
        }
    } else if (type === 'grid') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, val = ((x>>4)+(y>>4))%2===0 ? 200 : 100;
            data[i]=val; data[i+1]=val; data[i+2]=val; data[i+3]=255;
        }
    } else if (type === 'noise') {
        for (let i = 0; i < data.length; i += 4) { const v = Math.random()*255|0; data[i]=v; data[i+1]=v; data[i+2]=v; data[i+3]=255; }
    } else if (type === 'checker') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4, ck = (x/16|0)%2===(y/16|0)%2;
            if (ck) { data[i]=255; data[i+1]=40; data[i+2]=80; data[i+3]=255; }
            else { data[i]=20; data[i+1]=20; data[i+2]=40; data[i+3]=255; }
        }
    } else if (type === 'gradient') {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            data[i] = (x/w)*255|0; data[i+1] = (y/h)*255|0; data[i+2] = 128+(Math.sin(x/w*6.28)*64|0); data[i+3]=255;
        }
    } else if (type === 'custom' && customTextureData) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, customTextureData);
        gl.generateMipmap(gl.TEXTURE_2D);
        textureCache['custom'] = tex;
        return tex;
    } else {
        // fallback to synthwave
        gl.deleteTexture(tex);
        return generateTexture('synthwave');
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D);
    textureCache[type] = tex;
    return tex;
}

// ======================== INIT WEBGL ========================
function initGL(canvas) {
    gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) gl = canvas.getContext('experimental-webgl');
    if (!gl) { alert('WebGL not supported'); return false; }
    applyResolution();
    return true;
}

function applyResolution() {
    const sel = document.getElementById('res-select');
    resMult = parseInt(sel ? sel.value : '768');
    resizeCanvas();
}

function resizeCanvas() {
    const container = document.getElementById('viewport-container');
    const canvas = document.getElementById('gl-canvas');
    let w = container.clientWidth - 20;
    let h = container.clientHeight - 20;
    const maxDim = resMult;
    if (w > maxDim) w = maxDim;
    if (h > maxDim) h = maxDim;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}

// ======================== MONACO EDITOR ========================
function initMonaco() {
    return new Promise((resolve) => {
        require.config({ paths: { 'vs': 'lib/monaco/vs' } });
        require(['vs/editor/editor.main'], () => {
            monaco.editor.defineTheme('redglitch-unified', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '7a3438', fontStyle: 'italic' },
                    { token: 'keyword', foreground: 'ff4a52' },
                    { token: 'number', foreground: 'ffc2c5' },
                    { token: 'string', foreground: 'd78286' },
                    { token: 'type', foreground: 'ff777e' }
                ],
                colors: {
                    'editor.background': '#030303',
                    'editor.foreground': '#d8c8c9',
                    'editorLineNumber.foreground': '#572226',
                    'editorLineNumber.activeForeground': '#ff1e27',
                    'editorCursor.foreground': '#ff1e27',
                    'editor.selectionBackground': '#5f171d88',
                    'editor.inactiveSelectionBackground': '#35101466',
                    'editor.lineHighlightBackground': '#140708',
                    'editorIndentGuide.background1': '#241012',
                    'editorIndentGuide.activeBackground1': '#7c252a',
                    'editorGutter.background': '#030303'
                }
            });
            monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
                value: DEFAULT_FRAG, language: 'cpp', theme: 'redglitch-unified',
                minimap: { enabled: false }, fontSize: 13,
                fontFamily: "'JetBrains Mono', Consolas, monospace", automaticLayout: true,
                scrollBeyondLastLine: false, renderWhitespace: 'selection',
                cursorBlinking: 'smooth', cursorSmoothCaretAnimation: true,
                smoothScrolling: true, padding: { top: 8 },
                bracketPairColorization: { enabled: true }, lineNumbers: 'on',
                tabSize: 4, wordWrap: 'off'
            });
            monacoEditor.getModel().onDidChangeContent(() => { if (autoCompile) onEditorChange(); });
            resolve();
        });
    });
}

// ======================== SHADER COMPILATION ========================
function getActiveSource() { return monacoEditor ? monacoEditor.getValue() : DEFAULT_FRAG; }
function setActiveSource(src) { if (monacoEditor) monacoEditor.setValue(src); }

function onEditorChange() {
    document.getElementById('compile-dot').className = 'dot compiling';
    document.getElementById('compile-status').textContent = 'Waiting...';
    clearTimeout(compileTimeout);
    compileTimeout = setTimeout(compileAndRun, 600);
}

function getFullFragmentSource(src) {
    if (!src) src = getActiveSource();
    if (!src.includes('#version') && !src.includes('precision')) src = 'precision highp float;\n' + src;
    return src;
}

function compileAndRun() {
    const t0 = performance.now();
    const dot = document.getElementById('compile-dot');
    const status = document.getElementById('compile-status');
    const msEl = document.getElementById('compile-ms');
    dot.className = 'dot compiling';
    status.textContent = 'Compiling...';

    const fragSrc = getFullFragmentSource();
    const vertSrc = currentTab === 'vert' ? getActiveSource() : DEFAULT_VERT;
    const vs = compileGLSL(gl.VERTEX_SHADER, vertSrc);
    const fs = compileGLSL(gl.FRAGMENT_SHADER, fragSrc);
    clearMarkers();
    if (!vs || !fs) { dot.className = 'dot err'; status.textContent = 'COMPILE ERROR'; msEl.textContent = ''; return; }

    const newProg = gl.createProgram();
    gl.attachShader(newProg, vs); gl.attachShader(newProg, fs); gl.linkProgram(newProg);
    if (!gl.getProgramParameter(newProg, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(newProg); showError(log); addMarker(log);
        dot.className = 'dot err'; status.textContent = 'LINK ERROR'; msEl.textContent = ''; return;
    }
    if (program) gl.deleteProgram(program);
    program = newProg;
    hideError(); dot.className = 'dot ok'; status.textContent = 'Ready';
    msEl.textContent = `${(performance.now() - t0).toFixed(1)}ms`;
    parseUniforms(fragSrc); updateCompileBadge(true);
}

function compileGLSL(type, source) {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        if (type === gl.FRAGMENT_SHADER || type === gl.VERTEX_SHADER) { showError(log); addMarker(log); updateCompileBadge(false); }
        return null;
    }
    return s;
}

function clearMarkers() { if (monacoEditor) monaco.editor.setModelMarkers(monacoEditor.getModel(), 'shader', []); }
function addMarker(log) {
    if (!monacoEditor || !log) return;
    const markers = [], lines = log.split('\n');
    lines.forEach(line => {
        const m = line.match(/ERROR:\s*\d+:(\d+)/);
        if (m) markers.push({ severity: monaco.MarkerSeverity.Error, message: line, startLineNumber: parseInt(m[1])||1, startColumn: 1, endLineNumber: parseInt(m[1])||1, endColumn: 100 });
    });
    if (!markers.length) markers.push({ severity: monaco.MarkerSeverity.Error, message: log, startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 100 });
    monaco.editor.setModelMarkers(monacoEditor.getModel(), 'shader', markers);
}
function updateCompileBadge(ok) {
    const el = document.querySelector(`.code-tab[data-shader="${currentTab}"] .badge`);
    if (el) el.className = 'badge ' + (ok ? 'ok' : 'err');
}
function showError(msg) { const el = document.getElementById('error-overlay'); el.textContent = msg; el.style.display = 'block'; }
function hideError() { document.getElementById('error-overlay').style.display = 'none'; }

// ======================== UNIFORM PARSING & UI ========================
function parseUniforms(source) {
    uniforms = []; uniformValues = {};
    const regex = /uniform\s+(float|vec[234]|int|bool|sampler2D|samplerCube)\s+(\w+)\s*(?:=\s*([^;]+))?\s*;\s*(?:\/\/\s*\[([^\]]*)\])?/g;
    let match;
    while ((match = regex.exec(source)) !== null) {
        const type = match[1], name = match[2], defaultValue = match[3], hint = match[4];
        if (['uTime','uResolution','uTexture','uMouse','uModelViewProjection','uModelMatrix','uViewMatrix','uNormalMatrix'].includes(name)) continue;
        if (name.startsWith('uTexture') && !isNaN(name.charAt(8))) continue; // uTexture2, uTexture3, etc.
        uniforms.push({ type, name, defaultValue, hint });
    }
    renderUniformUI();
}

function renderUniformUI() {
    const body = document.getElementById('uniforms-body');
    if (uniforms.length === 0) {
        body.innerHTML = '<div class="uniform-empty">No custom uniforms detected.<br><small>Add uniform float/vec3/etc in your shader.</small></div>';
        return;
    }
    body.innerHTML = '';
    uniforms.forEach(u => {
        const row = document.createElement('div'); row.className = 'uniform-row';
        if (u.type === 'float') {
            let min = 0, max = 1, step = 0.01;
            if (u.hint) { const p = u.hint.split(',').map(s => parseFloat(s.trim())); if (p.length>=2 && !isNaN(p[0]) && !isNaN(p[1])) { min=p[0]; max=p[1]; } }
            if (u.defaultValue !== undefined) { const p = parseFloat(u.defaultValue); if (!isNaN(p)) uniformValues[u.name] = p; }
            if (uniformValues[u.name] === undefined) uniformValues[u.name] = (min+max)/2;
            const val = uniformValues[u.name];
            const label = document.createElement('label'); label.textContent = u.name; label.title = `${u.type} [${min},${max}]`;
            const input = document.createElement('input'); input.type='range'; input.min=min; input.max=max; input.step=step; input.value=val;
            const span = document.createElement('span'); span.className='val'; span.textContent=val.toFixed(2);
            input.oninput = () => { const v = parseFloat(input.value); uniformValues[u.name]=v; span.textContent=v.toFixed(2); };
            row.append(label, input, span);
        } else if (u.type === 'vec3' || u.type === 'vec4') {
            if (uniformValues[u.name] === undefined) uniformValues[u.name] = [1,1,1,u.type==='vec4'?1:undefined].filter(v=>v!==undefined);
            const val = uniformValues[u.name];
            const label = document.createElement('label'); label.textContent = u.name;
            const ci = document.createElement('input'); ci.type='color';
            const toHex = (r,g,b) => '#'+[r,g,b].map(v=>(Math.round(v*255)).toString(16).padStart(2,'0')).join('');
            ci.value = toHex(val[0],val[1],val[2]);
            const span = document.createElement('span'); span.className='val'; span.textContent=val.map(v=>v.toFixed(2)).join(',');
            ci.oninput = () => { const h=ci.value; const r=parseInt(h.slice(1,3),16)/255; const g=parseInt(h.slice(3,5),16)/255; const b=parseInt(h.slice(5,7),16)/255; uniformValues[u.name]=u.type==='vec4'?[r,g,b,uniformValues[u.name][3]||1]:[r,g,b]; span.textContent=uniformValues[u.name].map(v=>v.toFixed(2)).join(','); };
            row.append(label, ci, span);
        } else if (u.type === 'int') {
            let min=0, max=10; if (u.hint) { const p=u.hint.split(',').map(s=>parseInt(s.trim())); if (p.length>=2 && !isNaN(p[0])&&!isNaN(p[1])) { min=p[0]; max=p[1]; } }
            if (uniformValues[u.name]===undefined) uniformValues[u.name]=Math.round((min+max)/2);
            const label=document.createElement('label'); label.textContent=u.name;
            const input=document.createElement('input'); input.type='range'; input.min=min; input.max=max; input.step=1; input.value=uniformValues[u.name];
            const span=document.createElement('span'); span.className='val'; span.textContent=uniformValues[u.name];
            input.oninput=()=>{uniformValues[u.name]=parseInt(input.value); span.textContent=uniformValues[u.name];};
            row.append(label, input, span);
        } else if (u.type === 'bool') {
            if (uniformValues[u.name]===undefined) uniformValues[u.name]=u.defaultValue==='true'?1:0;
            const label=document.createElement('label'); label.textContent=u.name;
            const input=document.createElement('input'); input.type='checkbox'; input.checked=uniformValues[u.name]===1;
            input.onchange=()=>{uniformValues[u.name]=input.checked?1:0;};
            row.append(label, input);
        }
        body.appendChild(row);
    });
}

// ======================== RENDER LOOP ========================
function render() {
    animFrameId = requestAnimationFrame(render);
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime > 500) {
        fps = Math.round(frameCount / ((now - lastFpsTime) / 1000));
        document.getElementById('fps-val').textContent = fps;
        frameCount = 0; lastFpsTime = now;
    }
    if (!program || !gl) return;

    const canvas = document.getElementById('gl-canvas');
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const meshType = document.getElementById('mesh-select').value;
    if (meshType === 'quad') gl.disable(gl.DEPTH_TEST);
    else gl.enable(gl.DEPTH_TEST);

    gl.useProgram(program);
    const mesh = getOrCreateMesh(meshType);

    // Wireframe: build line indices if needed
    let drawMode = gl.TRIANGLES;
    let drawCount = mesh.count;
    let drawBuffer = null;
    if (wireframeMode && mesh.indices) {
        if (!mesh.lineIndices) {
            const li = [];
            for (let i = 0; i < mesh.indices.length; i += 3) {
                li.push(mesh.indices[i], mesh.indices[i+1]);
                li.push(mesh.indices[i+1], mesh.indices[i+2]);
                li.push(mesh.indices[i+2], mesh.indices[i]);
            }
            mesh.lineIndices = new Uint16Array(li);
            mesh.lineCount = li.length;
            const lb = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lb);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.lineIndices, gl.STATIC_DRAW);
            mesh.lineBuffer = lb;
        }
        drawMode = gl.LINES;
        drawCount = mesh.lineCount;
        drawBuffer = mesh.lineBuffer;
    }
    const vao = mesh.vao;

    const pl = gl.getAttribLocation(program, 'aPosition');
    if (pl>=0) { gl.bindBuffer(gl.ARRAY_BUFFER, vao.pos); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl,3,gl.FLOAT,false,0,0); }
    const ul = gl.getAttribLocation(program, 'aTexCoord');
    if (ul>=0) { gl.bindBuffer(gl.ARRAY_BUFFER, vao.uv); gl.enableVertexAttribArray(ul); gl.vertexAttribPointer(ul,2,gl.FLOAT,false,0,0); }
    const nl = gl.getAttribLocation(program, 'aNormal');
    if (nl>=0) { gl.bindBuffer(gl.ARRAY_BUFFER, vao.norm); gl.enableVertexAttribArray(nl); gl.vertexAttribPointer(nl,3,gl.FLOAT,false,0,0); }

    const isQuad = meshType === 'quad';
    let mvp, model, view, nm;
    if (isQuad) {
        // 2D fullscreen: identity MVP (quad at [-1,1] fills NDC)
        model = mat4Identity();
        view = mat4Identity();
        mvp = mat4Identity();
        nm = mat4Identity();
    } else {
        // 3D world: perspective camera with orbit rotation
        if (!rotationPaused) rotationAngle += 0.008;
        const aspect = canvas.width / canvas.height;
        const proj = mat4Perspective(0.8, aspect, 0.1, 10);
        view = mat4LookAt(0, 0.3, cameraDist, 0, 0, 0, 0, 1, 0);
        model = mat4Identity();
        model = mat4RotateY(model, rotationAngle);
        model = mat4RotateX(model, Math.sin(rotationAngle * 0.3) * 0.15);
        mvp = mat4Multiply(proj, mat4Multiply(view, model));
        nm = mat4Transpose(mat4Inverse(model));
    }

    setUniformMatrix('uModelViewProjection', mvp);
    setUniformMatrix('uModelMatrix', model);
    setUniformMatrix('uViewMatrix', view);
    setUniformMatrix('uNormalMatrix', nm);

    const time = timePaused ? pausedTime : (Date.now() - startTime) / 1000;
    document.getElementById('time-val').textContent = time.toFixed(2);
    setUniform1f('uTime', time);
    setUniform2f('uResolution', canvas.width, canvas.height);
    setUniform2f('uMouse', mouseX, mouseY);

    // Main texture (uTexture)
    const texName = document.getElementById('texture-select').value;
    const tex = generateTexture(texName);
    if (tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); setUniform1i('uTexture', 0); }

    // Additional samplers: uTexture2, uTexture3 (reuse same tex for now)
    for (let i = 2; i <= 4; i++) {
        const loc = gl.getUniformLocation(program, `uTexture${i}`);
        if (loc) { gl.activeTexture(gl.TEXTURE0 + i - 1); gl.bindTexture(gl.TEXTURE_2D, generateTexture(texName)); gl.uniform1i(loc, i - 1); }
    }

    // Dynamic uniforms
    uniforms.forEach(u => {
        const loc = gl.getUniformLocation(program, u.name);
        if (loc === null) return;
        const val = uniformValues[u.name];
        if (val === undefined) return;
        if (u.type === 'float') gl.uniform1f(loc, val);
        else if (u.type === 'int') gl.uniform1i(loc, val);
        else if (u.type === 'bool') gl.uniform1i(loc, val ? 1 : 0);
        else if (u.type === 'vec2') gl.uniform2fv(loc, val);
        else if (u.type === 'vec3') gl.uniform3fv(loc, val);
        else if (u.type === 'vec4') gl.uniform4fv(loc, val);
    });

    // Draw
    if (wireframeMode && mesh.indices) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, drawBuffer);
        gl.drawElements(drawMode, drawCount, gl.UNSIGNED_SHORT, 0);
    } else if (mesh.indices) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vao.index);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    } else {
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }

    document.getElementById('vert-count').textContent = mesh.count;

    // Fullscreen sync (copy frame)
    const fsCanvas = document.getElementById('fs-canvas');
    const overlay = document.getElementById('fullscreen-overlay');
    if (overlay.classList.contains('active') && fsCanvas) {
        fsCanvas.width = canvas.width; fsCanvas.height = canvas.height;
        const fsCtx = fsCanvas.getContext('2d');
        if (fsCtx) fsCtx.drawImage(canvas, 0, 0);
    }
}

function setUniform1f(name, val) { const l = gl.getUniformLocation(program, name); if (l) gl.uniform1f(l, val); }
function setUniform2f(name, a, b) { const l = gl.getUniformLocation(program, name); if (l) gl.uniform2f(l, a, b); }
function setUniform1i(name, val) { const l = gl.getUniformLocation(program, name); if (l) gl.uniform1i(l, val); }
function setUniformMatrix(name, mat) { const l = gl.getUniformLocation(program, name); if (l) gl.uniformMatrix4fv(l, false, mat); }

// ======================== SHADER TABS ========================
function switchShaderTab(tab) {
    if (tab === currentTab) return;
    const src = getActiveSource();
    if (currentTab === 'frag') fragSource = src; else vertSource = src;
    currentTab = tab;
    document.querySelectorAll('.code-tab').forEach(el => el.classList.remove('active'));
    document.querySelector(`.code-tab[data-shader="${tab}"]`).classList.add('active');
    setActiveSource(tab === 'frag' ? (fragSource || DEFAULT_FRAG) : (vertSource || DEFAULT_VERT));
    if (autoCompile) compileAndRun();
}

// ======================== TEMPLATES ========================
const TEMPLATES = {
    'basic': { frag: DEFAULT_FRAG },
    'crt': { frag: `precision highp float;
varying vec2 vTexCoord; varying vec3 vNormal;
uniform sampler2D uTexture; uniform float uTime; uniform vec2 uResolution;
void main() {
    vec2 uv=vTexCoord; vec4 c=texture2D(uTexture,uv);
    float s=sin(uv.y*uResolution.y*0.5)*0.08;
    float vn=1.0-length(uv-0.5)*0.6;
    gl_FragColor=vec4((c.rgb-s)*vn,1.0);
}`},
    'wave': { frag: `precision highp float;
varying vec2 vTexCoord; varying vec3 vNormal;
uniform sampler2D uTexture; uniform float uTime;
uniform float uSpeed; // [0,20]
uniform float uStrength; // [0,0.1]
void main() {
    vec2 uv=vTexCoord; uv.x+=sin(uv.y*uSpeed+uTime*2.0)*uStrength; uv.y+=cos(uv.x*uSpeed+uTime*1.7)*uStrength*0.7;
    gl_FragColor=texture2D(uTexture,uv);
}`},
    'chromatic': { frag: `precision highp float;
varying vec2 vTexCoord; uniform sampler2D uTexture;
uniform float uOffset; // [0,0.05]
void main(){
    vec2 uv=vTexCoord;
    float r=texture2D(uTexture,uv+vec2(uOffset,0)).r;
    float g=texture2D(uTexture,uv).g;
    float b=texture2D(uTexture,uv-vec2(uOffset,0)).b;
    gl_FragColor=vec4(r,g,b,1.0);
}`},
    'glitch': { frag: `precision highp float;
varying vec2 vTexCoord; uniform sampler2D uTexture; uniform float uTime;
uniform float uIntensity; // [0,1]
uniform vec3 uColor; // color
void main(){
    vec2 uv=vTexCoord; float g=sin(uv.y*200.0+uTime*15.0)*uIntensity;
    if(g>0.7) uv.x+=uIntensity*0.08*sin(uTime*10.0);
    vec4 t=texture2D(uTexture,uv);
    if(g>0.85) t.rgb=uColor;
    gl_FragColor=t;
}`},
    'toon': { frag: `precision highp float;
varying vec2 vTexCoord; varying vec3 vNormal;
uniform sampler2D uTexture; uniform vec3 uLightDir; // color
void main(){
    vec3 l=normalize(uLightDir); float d=max(dot(vNormal,l),0.0);
    float t=floor(d*3.0)/3.0; vec4 tx=texture2D(uTexture,vTexCoord);
    vec3 rim=vec3(pow(1.0-max(dot(vNormal,vec3(0,0,1)),0.0),2.0));
    gl_FragColor=vec4(tx.rgb*(0.4+0.6*t)+rim*0.3,1.0);
}`},
    'edge-detection': { frag: `precision highp float;
varying vec2 vTexCoord; uniform sampler2D uTexture; uniform vec2 uResolution;
uniform float uThreshold; // [0,1]
void main(){
    vec2 px=1.0/uResolution;
    float c=texture2D(uTexture,vTexCoord).r;
    float l=texture2D(uTexture,vTexCoord+vec2(-px.x,0)).r;
    float r=texture2D(uTexture,vTexCoord+vec2(px.x,0)).r;
    float u=texture2D(uTexture,vTexCoord+vec2(0,px.y)).r;
    float d=texture2D(uTexture,vTexCoord+vec2(0,-px.y)).r;
    float e=length(vec2(l-r,u-d)); e=smoothstep(uThreshold,1.0,e);
    vec4 col=texture2D(uTexture,vTexCoord);
    gl_FragColor=vec4(mix(col.rgb,vec3(1),e*0.5),1.0);
}`},
    'fog': { frag: `precision highp float;
varying vec2 vTexCoord; varying vec3 vNormal; varying vec3 vWorldPosition;
uniform sampler2D uTexture; uniform vec3 uFogColor; // color
uniform float uFogDensity; // [0,2]
void main(){
    vec4 t=texture2D(uTexture,vTexCoord); float d=length(vWorldPosition);
    float f=1.0-exp(-uFogDensity*d*d);
    gl_FragColor=vec4(mix(t.rgb,uFogColor,f),1.0);
}`},
    'pixelate': { frag: `precision highp float;
varying vec2 vTexCoord; uniform sampler2D uTexture; uniform vec2 uResolution;
uniform float uPixelSize; // [1,64]
void main(){
    vec2 uv=floor(vTexCoord*uResolution/uPixelSize)*uPixelSize/uResolution;
    gl_FragColor=texture2D(uTexture,uv);
}`},
    'kaleidoscope': { frag: `precision highp float;
varying vec2 vTexCoord; uniform sampler2D uTexture;
uniform float uSegments; // [1,12]
void main(){
    vec2 uv=vTexCoord-0.5; float a=atan(uv.y,uv.x); float r=length(uv);
    float seg=6.2832/uSegments; a=mod(a,seg); a=abs(a-seg*0.5);
    uv=vec2(cos(a),sin(a))*r+0.5;
    gl_FragColor=texture2D(uTexture,uv);
}`},
    'bloom': { frag: `precision highp float;
varying vec2 vTexCoord; uniform sampler2D uTexture; uniform vec2 uResolution;
uniform float uIntensity; // [0,3]
void main(){
    vec4 c=texture2D(uTexture,vTexCoord);
    vec2 px=1.0/uResolution; vec4 b=vec4(0);
    for(int x=-2;x<=2;x++) for(int y=-2;y<=2;y++){
        vec2 off=vec2(x,y)*px*2.0; float w=1.0-length(vec2(x,y))/2.0;
        b+=texture2D(uTexture,vTexCoord+off)*w;
    }
    b/=25.0; gl_FragColor=vec4(mix(c.rgb,b.rgb*uIntensity,0.5),1.0);
}`},
};

function applyTemplate() {
    const names = Object.keys(TEMPLATES);
    const menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0d0d14;border:1px solid #2a2a3a;border-radius:8px;z-index:10000;padding:14px;min-width:180px;max-height:60vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
    menu.innerHTML = '<div style="color:var(--accent);font-size:0.85rem;margin-bottom:8px;">SELECT TEMPLATE</div>' +
        names.map(n => `<div class="tpl-opt" data-n="${n}" style="padding:5px 10px;cursor:pointer;border-radius:4px;font-size:0.75rem;">${n}</div>`).join('') +
        '<div style="margin-top:6px;text-align:right;"><button class="btn" onclick="this.closest(\'div\').remove()">CANCEL</button></div>';
    document.body.appendChild(menu);
    menu.querySelectorAll('.tpl-opt').forEach(el => {
        el.onmouseenter = () => el.style.background = '#1a1a2a';
        el.onmouseleave = () => el.style.background = 'transparent';
        el.onclick = () => {
            const tpl = TEMPLATES[el.dataset.n];
            if (tpl) {
                if (tpl.frag) { fragSource = tpl.frag; if (currentTab==='frag') setActiveSource(tpl.frag); }
                if (tpl.vert) { vertSource = tpl.vert; if (currentTab==='vert') setActiveSource(tpl.vert); }
                if (autoCompile) compileAndRun();
            }
            menu.remove();
        };
    });
}

// ======================== SAVE / LOAD ========================
async function saveShader() {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0d0d14;border:1px solid #2a2a3a;border-radius:8px;z-index:10000;padding:14px;min-width:280px;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
    div.innerHTML = `<div style="color:var(--accent);font-size:0.85rem;margin-bottom:8px;">SAVE SHADER</div>
        <input id="sv-name" value="${currentShaderName}" style="width:100%;background:#0a0a12;border:1px solid #2a2a3a;color:var(--text);padding:5px 8px;font-family:inherit;font-size:0.75rem;border-radius:4px;margin-bottom:8px;">
        <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn" onclick="this.closest('div').parentElement.remove()">CANCEL</button>
            <button class="btn green" id="sv-cfm">SAVE</button>
        </div>`;
    document.body.appendChild(div);
    document.getElementById('sv-name').focus();
    document.getElementById('sv-cfm').onclick = async () => {
        const name = document.getElementById('sv-name').value.trim();
        if (!name) return;
        currentShaderName = name;
        const fc = getFullFragmentSource(), vc = currentTab==='vert' ? getActiveSource() : DEFAULT_VERT;
        try {
            const r = await fetch('/api/shaders/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,content:fc})});
            if (r.ok) {
                if (vc !== DEFAULT_VERT) await fetch('/api/shaders/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name+'_vert',content:vc})});
                broadcastUpdate(name,'saved'); statusMsg('SAVED: '+name);
            } else statusMsg('SAVE FAILED');
        } catch(e) { statusMsg('ERROR: '+e.message); }
        div.remove();
    };
}

async function loadShaderFromProject() {
    try {
        const r = await fetch('/api/shaders/list'); const list = await r.json();
        if (!list || !list.length) { statusMsg('No shaders in project'); return; }
        const menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0d0d14;border:1px solid #2a2a3a;border-radius:8px;z-index:10000;padding:14px;min-width:220px;max-height:60vh;overflow-y:auto;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
        menu.innerHTML = '<div style="color:var(--accent);font-size:0.85rem;margin-bottom:8px;">LOAD SHADER</div>' +
            list.filter(n=>!n.endsWith('_vert')).map(n => `<div class="ld-opt" data-n="${n}" style="padding:5px 10px;cursor:pointer;border-radius:4px;font-size:0.75rem;">${n}</div>`).join('') +
            '<div style="margin-top:6px;text-align:right;"><button class="btn" onclick="this.closest(\'div\').remove()">CANCEL</button></div>';
        document.body.appendChild(menu);
        menu.querySelectorAll('.ld-opt').forEach(el => {
            el.onmouseenter = () => el.style.background = '#1a1a2a';
            el.onmouseleave = () => el.style.background = 'transparent';
            el.onclick = async () => {
                const name = el.dataset.n;
                try {
                    const r = await fetch('/api/shaders/'+name);
                    if (r.ok) {
                        const content = await r.text(); currentShaderName = name; fragSource = content;
                        if (currentTab==='frag') setActiveSource(content); else { switchShaderTab('frag'); setActiveSource(content); }
                        const rv = await fetch('/api/shaders/'+name+'_vert');
                        if (rv.ok) vertSource = await rv.text();
                        if (autoCompile) compileAndRun();
                        broadcastUpdate(name,'loaded'); statusMsg('LOADED: '+name);
                    }
                } catch(e) { statusMsg('LOAD FAILED'); }
                menu.remove();
            };
        });
    } catch(e) { statusMsg('Failed to list shaders'); }
}

function statusMsg(msg) {
    const el = document.getElementById('compile-status');
    if (el) el.textContent = msg;
    setTimeout(() => { if (el && program) el.textContent = 'Ready'; else if (el) el.textContent = 'Idle'; }, 2500);
}

// ======================== NEW FEATURES ========================

function toggleShaderTime() {
    timePaused = !timePaused;
    if (timePaused) pausedTime = (Date.now() - startTime) / 1000;
    document.getElementById('btn-play').classList.toggle('active', timePaused);
    document.getElementById('btn-play').innerHTML = timePaused ? '&#9654; TIME' : '&#9208; TIME';
}

function resetShaderTime() {
    startTime = Date.now();
    pausedTime = 0;
    timePaused = false;
    document.getElementById('btn-play').classList.remove('active');
    document.getElementById('btn-play').innerHTML = '&#9208; TIME';
}

function takeScreenshot() {
    const canvas = document.getElementById('gl-canvas');
    const link = document.createElement('a');
    link.download = `shader_${currentShaderName}_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    statusMsg('Screenshot saved');
}

function copyShaderSource() {
    const src = getActiveSource();
    navigator.clipboard.writeText(src).then(() => statusMsg('Shader code copied')).catch(() => statusMsg('Copy failed'));
}

function showShortcuts() {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#0d0d14;border:1px solid #2a2a3a;border-radius:8px;z-index:10000;padding:14px;min-width:240px;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
    div.innerHTML = `<div style="color:var(--accent);font-size:0.85rem;margin-bottom:8px;">KEYBOARD SHORTCUTS</div>
        <div style="font-size:0.7rem;line-height:1.8;">
        <kbd style="background:#1a1a2a;padding:1px 5px;border-radius:3px;">Ctrl+S</kbd> Save shader<br>
        <kbd style="background:#1a1a2a;padding:1px 5px;border-radius:3px;">Ctrl+Enter</kbd> Compile<br>
        <kbd style="background:#1a1a2a;padding:1px 5px;border-radius:3px;">Esc</kbd> Exit fullscreen<br>
        <kbd style="background:#1a1a2a;padding:1px 5px;border-radius:3px;">Scroll</kbd> Zoom camera<br>
        </div>
        <div style="margin-top:8px;text-align:right;"><button class="btn" onclick="this.closest('div').remove()">OK</button></div>`;
    document.body.appendChild(div);
}

// ======================== VIEWPORT CONTROLS ========================
function toggleFullscreenPreview() {
    const overlay = document.getElementById('fullscreen-overlay');
    overlay.classList.toggle('active');
}

function toggleUniforms() {
    uniformsPanelCollapsed = !uniformsPanelCollapsed;
    document.getElementById('uniforms-header').classList.toggle('collapsed');
    document.getElementById('uniforms-body').classList.toggle('collapsed');
}

function onAutoCompileChange() { autoCompile = document.getElementById('auto-compile').checked; }

// ======================== THEME ========================
let themeDark = true;
function toggleTheme() { themeDark = !themeDark; if (monacoEditor) monaco.editor.setTheme(themeDark ? 'redglitch-unified' : 'vs'); }

// ======================== CUSTOM TEXTURE UPLOAD ========================
document.getElementById('texture-select').addEventListener('change', (e) => {
    if (e.target.value === 'custom') document.getElementById('upload-tex-input').click();
    else { textureCache = {}; }
});
document.getElementById('upload-tex-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
        customTextureData = img;
        textureCache = {};
        generateTexture('custom');
        statusMsg('Custom texture loaded');
    };
    img.src = URL.createObjectURL(file);
});
document.getElementById('bg-color').addEventListener('input', (e) => {
    const h = e.target.value;
    bgColor = [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255, 1];
});
document.getElementById('res-select').addEventListener('change', () => {
    applyResolution();
});
document.getElementById('wireframe-toggle').addEventListener('change', (e) => {
    wireframeMode = e.target.checked;
});
document.getElementById('pause-rotation').addEventListener('change', (e) => {
    rotationPaused = e.target.checked;
});
document.getElementById('mesh-select').addEventListener('change', () => {});
document.getElementById('fs-canvas').addEventListener('click', toggleFullscreenPreview);

// Mouse tracking
const viewport = document.getElementById('viewport-container');
viewport.addEventListener('mousemove', (e) => {
    const canvas = document.getElementById('gl-canvas');
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        mouseX = (e.clientX - rect.left) / rect.width;
        mouseY = 1 - (e.clientY - rect.top) / rect.height;
    }
});
viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraDist = Math.max(1.5, Math.min(8, cameraDist + e.deltaY * 0.003));
}, { passive: false });

// ======================== EVENTBUS INTEGRATION ========================
function initEventBus() {
    const eb = window.RedGlitchEventBus;
    if (!eb) return;
    eb.on('ai:context_query', () => {
        eb.emit('ai:context_response', {
            source: 'ShaderLab',
            details: `ShaderLab active. Shader: ${currentShaderName}. Mesh: ${document.getElementById('mesh-select').value}. Program: ${!!program}. Uniforms: ${uniforms.map(u=>u.name).join(',')||'none'}`
        });
    });
    eb.on('shader:request', (ev) => { if (ev.data && ev.data.shaderId) loadExternalShader(ev.data.shaderId); });
    console.log('[ShaderLab] EventBus connected');
}

function broadcastUpdate(name, action) {
    const eb = window.RedGlitchEventBus;
    if (eb) eb.emit(`asset:shader:${action}`, { shaderId: name, timestamp: Date.now() });
    const ps = window.RedGlitchProjectState;
    if (ps) ps.set(`assets.shaders.${name}`, { name, lastModified: Date.now() });
}

async function loadExternalShader(shaderId) {
    try {
        const r = await fetch(`/api/shaders/${shaderId}`);
        if (r.ok) { const c = await r.text(); currentShaderName = shaderId; fragSource = c; if (currentTab==='frag') setActiveSource(c); if (autoCompile) compileAndRun(); }
    } catch(e) {}
}

// ======================== KEYBOARD SHORTCUTS ========================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.getElementById('fullscreen-overlay').classList.remove('active');
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveShader(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); compileAndRun(); }
});

// ======================== WINDOW EVENTS ========================
window.addEventListener('resize', resizeCanvas);

// ======================== INIT ========================
async function init() {
    const canvas = document.getElementById('gl-canvas');
    if (!initGL(canvas)) return;
    startTime = Date.now(); lastFpsTime = performance.now();

    await detectProjectType();

    // Show mode badge
    const badge = document.getElementById('mode-badge');
    if (badge) {
        badge.textContent = getProjectModeLabel();
        badge.style.display = 'inline';
        badge.style.background = projectIs3D ? 'rgba(255,30,39,0.12)' : 'rgba(255,200,50,0.12)';
        badge.style.color = projectIs3D ? 'var(--accent)' : 'var(--gold)';
        badge.style.borderColor = projectIs3D ? 'var(--accent)' : 'var(--gold)';
    }

    // Set default mesh based on project type
    const meshSelect = document.getElementById('mesh-select');
    if (meshSelect) {
        if (!projectIs3D) meshSelect.value = 'quad';
        else meshSelect.value = 'cube';
    }

    await initMonaco();
    initEventBus();
    fragSource = DEFAULT_FRAG; vertSource = DEFAULT_VERT;
    compileAndRun(); render();
}

document.addEventListener('DOMContentLoaded', init);
