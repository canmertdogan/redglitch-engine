// shader_editor.js - REDGLITCH SHADER LAB PRO
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

function initializeShaderIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedGlitchEventBus;
        projectState = window.RedGlitchProjectState;
        assetManager = window.RedGlitchAssetManager;
        
        if (eventBus) {
            // Listen for shader requests
            eventBus.on('shader:request', (event) => {
                console.log('[ShaderEditor] Shader requested:', event.data.shaderId);
            });
            
            console.log('[ShaderEditor] EventBus connected');
        }
    }
}

function broadcastShaderUpdate(shaderName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`asset:shader:${action}`, {
            shaderId: shaderName,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`assets.shaders.${shaderName}`, {
            name: shaderName,
            lastModified: Date.now()
        });
    }
}

const canvas = document.getElementById('gl-canvas');
const gl = canvas.getContext('webgl');
const editor = document.getElementById('editor');
const errorLog = document.getElementById('error-log');
const statusBadge = document.getElementById('status-badge');
const dynamicParams = document.getElementById('dynamic-params');

let program;
let positionBuffer;
let texCoordBuffer;
let activeTexture;
let startTime = Date.now();
let currentShaderName = "new_shader";
let compileTimeout = null;

// Track dynamic uniform values
const uniformValues = {
    uTime: 0,
    uTexture: 0
};

const templates = {
    default: `precision mediump float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;

void main() {
    gl_FragColor = texture2D(uTexture, vTexCoord);
}`,
    crt: `precision mediump float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uScanlineIntensity; // [0, 1]

void main() {
    vec2 uv = vTexCoord;
    vec4 color = texture2D(uTexture, uv);
    float scanline = sin(uv.y * 800.0 + uTime * 10.0) * (uScanlineIntensity * 0.2);
    gl_FragColor = vec4(color.rgb - scanline, 1.0);
}`,
    wave: `precision mediump float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uWaveSpeed; // [0, 20]
uniform float uWaveStrength; // [0, 0.05]

void main() {
    vec2 uv = vTexCoord;
    uv.x += sin(uv.y * uWaveSpeed + uTime) * uWaveStrength;
    gl_FragColor = texture2D(uTexture, uv);
}`,
    chromatic: `precision mediump float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uOffset; // [0, 0.02]

void main() {
    vec2 uv = vTexCoord;
    float r = texture2D(uTexture, uv + vec2(uOffset, 0.0)).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv - vec2(uOffset, 0.0)).b;
    gl_FragColor = vec4(r, g, b, 1.0);
}`,
    glitch: `precision mediump float;
varying vec2 vTexCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uGlitchAmount; // [0, 1]

void main() {
    vec2 uv = vTexCoord;
    float noise = sin(uTime * 10.0) * uGlitchAmount;
    if (sin(uv.y * 100.0 + uTime * 20.0) > 0.98 - uGlitchAmount * 0.1) {
        uv.x += noise * 0.05;
    }
    gl_FragColor = texture2D(uTexture, uv);
}`
};

const vertexShaderSource = `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    void main() {
        gl_Position = vec4(aPosition, 0, 1);
        vTexCoord = aTexCoord;
    }
`;

// --- INITIALIZATION ---

function initGL() {
    // Initialize integration first
    initializeShaderIntegration();
    
    canvas.width = 512;
    canvas.height = 512;
    gl.viewport(0, 0, canvas.width, canvas.height);

    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1, 1,1, 0,0, 0,0, 1,1, 1,0]), gl.STATIC_DRAW);

    loadPreviewTexture('helper');
    refreshList();
    
    // Bind Events
    editor.addEventListener('input', () => {
        statusBadge.innerText = "TYPING...";
        statusBadge.className = "status-badge";
        clearTimeout(compileTimeout);
        compileTimeout = setTimeout(compileShader, 500);
    });

    document.querySelectorAll('input[name="preview-img"]').forEach(input => {
        input.onchange = (e) => loadPreviewTexture(e.target.value);
    });

    document.getElementById('template-select').onchange = (e) => {
        if (templates[e.target.value]) {
            editor.value = templates[e.target.value];
            compileShader();
        }
    };

    compileShader();
    render();
}

async function loadPreviewTexture(type) {
    if (activeTexture) gl.deleteTexture(activeTexture);
    activeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, activeTexture);

    if (type === 'grid') {
        const pixels = new Uint8Array(256 * 256 * 4);
        for(let i=0; i<256*256; i++) {
            const x = i % 256; const y = Math.floor(i/256);
            const val = ((x>>4) + (y>>4)) % 2 === 0 ? 200 : 100;
            pixels[i*4]=val; pixels[i*4+1]=val; pixels[i*4+2]=val; pixels[i*4+3]=255;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else if (type === 'noise') {
        const pixels = new Uint8Array(256 * 256 * 4);
        for(let i=0; i<pixels.length; i+=4) {
            const v = Math.random() * 255;
            pixels[i] = pixels[i+1] = pixels[i+2] = v; pixels[i+3] = 255;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } else {
        const img = new Image();
        img.src = "sprite-art/helper.png";
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, activeTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
        };
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

// --- COMPILATION & PARSING ---

function compileShader() {
    const fragmentShaderSource = editor.value;
    const vs = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vs || !fs) return; // Errors handled in createShader

    const newProgram = gl.createProgram();
    gl.attachShader(newProgram, vs);
    gl.attachShader(newProgram, fs);
    gl.linkProgram(newProgram);

    if (!gl.getProgramParameter(newProgram, gl.LINK_STATUS)) {
        showError(gl.getProgramInfoLog(newProgram));
        return;
    }

    program = newProgram;
    errorLog.style.display = 'none';
    statusBadge.innerText = "COMPILED";
    statusBadge.className = "status-badge";
    
    parseUniforms(fragmentShaderSource);
}

function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        if (type === gl.FRAGMENT_SHADER) showError(gl.getShaderInfoLog(shader));
        return null;
    }
    return shader;
}

function showError(msg) {
    errorLog.innerText = msg;
    errorLog.style.display = 'block';
    statusBadge.innerText = "ERROR";
    statusBadge.className = "status-badge error";
}

function parseUniforms(source) {
    const lines = source.split('\n');
    const detected = [];
    
    lines.forEach(line => {
        // Match: uniform float uName; // [min, max]
        const match = line.match(/uniform\s+float\s+(\w+)\s*;\s*(\/\/\s*\[(.*?)(\s*,.*?)?\])?/);
        if (match) {
            const name = match[1];
            if (name === 'uTime') return; // Skip internal
            
            let min = 0, max = 1;
            if (match[3]) {
                const range = match[3].split(',').map(n => parseFloat(n.trim()));
                if (range.length === 2) { min = range[0]; max = range[1]; }
            }
            detected.push({ name, min, max });
        }
    });

    renderUniformUI(detected);
}

function renderUniformUI(uniforms) {
    if (uniforms.length === 0) {
        dynamicParams.innerHTML = '<div style="color:#666; font-style:italic; text-align:center;">No custom uniforms detected.</div>';
        return;
    }

    dynamicParams.innerHTML = '';
    uniforms.forEach(u => {
        if (uniformValues[u.name] === undefined) uniformValues[u.name] = (u.min + u.max) / 2;
        
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
            <label style="width:100px; font-size:0.9rem;">${u.name}</label>
            <input type="range" min="${u.min}" max="${u.max}" step="0.001" value="${uniformValues[u.name]}">
            <span style="width:40px; font-size:0.8rem; color:var(--accent); text-align:right;">${uniformValues[u.name].toFixed(2)}</span>
        `;
        
        const input = row.querySelector('input');
        const display = row.querySelector('span');
        input.oninput = (e) => {
            const val = parseFloat(e.target.value);
            uniformValues[u.name] = val;
            display.innerText = val.toFixed(2);
        };
        
        dynamicParams.appendChild(row);
    });
}

// --- RENDER LOOP ---

function render() {
    requestAnimationFrame(render);
    if (!program) return;
    
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    const posLoc = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texLoc = gl.getAttribLocation(program, "aTexCoord");
    gl.enableVertexAttribArray(texLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    // Standard Uniforms
    const timeLoc = gl.getUniformLocation(program, "uTime");
    if (timeLoc) gl.uniform1f(timeLoc, (Date.now() - startTime) / 1000);

    // Dynamic Uniforms
    for (const [name, val] of Object.entries(uniformValues)) {
        const loc = gl.getUniformLocation(program, name);
        if (loc) gl.uniform1f(loc, val);
    }

    if (activeTexture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, activeTexture);
        const texUni = gl.getUniformLocation(program, "uTexture");
        gl.uniform1i(texUni, 0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// --- IO ---

async function saveShader() {
    const name = prompt("Shader Name:", currentShaderName);
    if (!name) return;
    
    try {
        const res = await fetch('/api/shaders/save', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, content: editor.value })
        });
        if (res.ok) {
            alert("SHADER SAVED TO PROJECT");
            refreshList();
        } else alert("SAVE FAILED");
    } catch(e) { alert("ERROR: " + e); }
}

async function refreshList() {
    try {
        const res = await fetch('/api/shaders/list');
        const list = await res.json();
        const sel = document.getElementById('file-list');
        sel.innerHTML = '<option value="">-- Load Project --</option>';
        list.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.innerText = f;
            sel.appendChild(opt);
        });
    } catch(e) {}
}

async function loadShader() {
    const name = document.getElementById('file-list').value;
    if (!name) return;
    
    try {
        const res = await fetch(`/api/shaders/${name}`);
        if(res.ok) {
            const data = await res.json();
            editor.value = data.content;
            currentShaderName = name;
            compileShader();
        }
    } catch(e) {}
}

initGL();
