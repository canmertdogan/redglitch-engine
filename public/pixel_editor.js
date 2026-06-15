// PIXEL STUDIO PRO - STABLE LOGIC v3.4 (ANIMATION FIX)
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

function initializePixelIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedGlitchEventBus;
        projectState = window.RedGlitchProjectState;
        assetManager = window.RedGlitchAssetManager;
        
        if (eventBus) {
            // Listen for sprite requests from other editors
            eventBus.on('sprite:request', (event) => {
                console.log('[PixelEditor] Sprite requested:', event.data.spriteId);
            });
            
            console.log('[PixelEditor] EventBus connected');
        }
    }
}

function broadcastSpriteUpdate(spriteName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`asset:sprite:${action}`, {
            spriteId: spriteName,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`assets.sprites.${spriteName}`, {
            name: spriteName,
            width: window.app.w,
            height: window.app.h,
            frames: window.app.frameCount,
            lastModified: Date.now()
        });
    }
}

// --- GLOBAL STATE ---
window.app = {
    w: 32, h: 32,
    tool: 'pen',
    color: { h: 0, s: 0, v: 0, hex: '#000000' },
    isDrawing: false,
    
    layers: [],
    currLayer: 0,
    currFrame: 0,
    frameCount: 1,
    
    anims: { 'idle': { start: 0, end: 0 } },
    currAnim: 'idle',
    isPlaying: false,
    fps: 8,
    lastTick: 0,
    
    onion: false,
    grid: false,
    previewFrame: 0,
    
    history: [],
    historyIndex: -1
};

// --- DOM REFERENCES ---
let canvas, ctx, pCanvas, pCtx;
let cpSvBox, cpHueStrip, cpSvCtx, cpHueCtx;

// --- UTILS ---
function rgbToHex(r, g, b) { return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

// --- RENDERING ---
function renderPalette() {
    const p = document.getElementById('palette-grid');
    if(!p) return;
    const colors = [
        '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
        '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
        '#2e222f', '#3e3546', '#625565', '#966c6c', '#ab947a', '#694f62', '#7f708a', '#9babb2',
        '#c7dcd0', '#ffffff', '#6e2727', '#b33831', '#ea4f36', '#f57d4a', '#ae2334', '#e83b3b'
    ];
    p.innerHTML = '';
    colors.forEach(c => {
        const d = document.createElement('div');
        d.className = 'swatch'; d.style.backgroundColor = c;
        d.onclick = () => window.setColor(c);
        p.appendChild(d);
    });
}

function renderCanvas() {
    if(!ctx) return;
    ctx.clearRect(0,0,app.w,app.h);
    if (app.grid) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for(let x=0; x<app.w; x++) for(let y=0; y<app.h; y++) if ((x+y)%2===0) ctx.fillRect(x,y,1,1);
    }
    if (app.onion && app.currFrame > 0) {
        ctx.globalAlpha = 0.3; 
        app.layers.forEach(l => { if(l.visible && l.frames[app.currFrame-1]) ctx.drawImage(l.frames[app.currFrame-1],0,0); });
        ctx.globalAlpha = 1.0;
    }
    app.layers.forEach(l => { if(l.visible && l.frames[app.currFrame]) ctx.drawImage(l.frames[app.currFrame],0,0); });
}

function updateUI() {
    if(!canvas) return;
    renderCanvas();
    
    document.querySelectorAll('#toolbar .btn').forEach(b => {
        b.classList.toggle('active', b.id === `tool-${app.tool}`);
    });
    
    document.getElementById('btn-onion').classList.toggle('active', app.onion);
    document.getElementById('btn-grid').classList.toggle('active', app.grid);
    document.getElementById('btn-play').innerText = app.isPlaying ? 'STOP' : 'PLAY';
    
    const strip = document.getElementById('frames-strip');
    if(strip) {
        strip.innerHTML = '';
        for(let i=0; i<app.frameCount; i++) {
            const d = document.createElement('div');
            d.className = `frame-thumb ${i===app.currFrame?'active':''}`;
            d.onclick = () => { app.currFrame = i; app.previewFrame = i; updateUI(); };
            d.innerHTML = `<div class="frame-number">${i+1}</div>`;
            const c = document.createElement('canvas');
            c.width = app.w; c.height = app.h;
            const tCtx = c.getContext('2d');
            app.layers.forEach(l => { if(l.visible && l.frames[i]) tCtx.drawImage(l.frames[i],0,0); });
            d.appendChild(c); strip.appendChild(d);
        }
    }
    document.getElementById('frame-counter').innerText = `${app.currFrame+1}/${app.frameCount}`;
    
    const lList = document.getElementById('layers-list');
    if(lList) {
        lList.innerHTML = '';
        app.layers.slice().reverse().forEach((l, idx) => {
            const realIdx = app.layers.length - 1 - idx;
            const d = document.createElement('div');
            d.className = `layer-item ${realIdx===app.currLayer?'active':''}`;
            d.onclick = () => { app.currLayer = realIdx; updateUI(); };
            d.innerHTML = `<i class="fas ${l.visible?'fa-eye':'fa-eye-slash'}" onclick="window.toggleVis(event, ${realIdx})"></i> <span>${l.name}</span>`;
            lList.appendChild(d);
        });
    }
    
    const aList = document.getElementById('anim-list');
    if(aList) {
        aList.innerHTML = '';
        Object.keys(app.anims).forEach(k => {
            const a = app.anims[k], d = document.createElement('div');
            d.style.cursor = 'pointer'; d.style.padding = '4px';
            d.style.color = (k===app.currAnim) ? 'var(--accent)' : '#888';
            d.innerText = `${k} (${a.start}-${a.end})`;
            d.onclick = () => { app.currAnim = k; app.previewFrame = a.start; updateUI(); };
            aList.appendChild(d);
        });
    }
}

// --- INITIALIZATION ---
window.onload = function() {
    // Initialize integration first
    initializePixelIntegration();
    
    try {
        canvas = document.getElementById('drawing-canvas');
        ctx = canvas.getContext('2d', { willReadFrequently: true });
        pCanvas = document.getElementById('preview-canvas');
        pCtx = pCanvas.getContext('2d');
        cpSvBox = document.getElementById('cp-sv-box');
        cpHueStrip = document.getElementById('cp-hue-strip');
        cpSvCtx = cpSvBox.getContext('2d');
        cpHueCtx = cpHueStrip.getContext('2d');
    } catch (e) { console.error("DOM Init Failed:", e); return; }

    resetProject(32, 32);
    setupInputs();
    setupColorPicker();
    renderPalette();
    updateUI();
    loop();
};

function resetProject(w, h) {
    app.w = w; app.h = h;
    canvas.width = w; canvas.height = h;
    app.layers = [{ name: 'Layer 1', visible: true, frames: [createFrame()] }];
    app.currLayer = 0; app.currFrame = 0; app.frameCount = 1;
    app.anims = { 'idle': { start: 0, end: 0 } }; app.currAnim = 'idle';
    app.history = []; app.historyIndex = -1;
    saveHistory();
    centerView();
}

function createFrame() {
    const c = document.createElement('canvas');
    c.width = app.w; c.height = app.h;
    return c;
}

// --- COLOR PICKER ---
function setupColorPicker() {
    cpSvBox.width = 200; cpSvBox.height = 150;
    cpHueStrip.width = 20; cpHueStrip.height = 150;
    drawHueStrip(); drawSvBox();
    
    let dragHue = false;
    const updateHue = (e) => {
        const rect = cpHueStrip.getBoundingClientRect();
        let y = e.clientY - rect.top;
        y = Math.max(0, Math.min(y, rect.height));
        app.color.h = (y / rect.height) * 360;
        drawSvBox(); updateColorFromHsv();
    };
    cpHueStrip.onmousedown = (e) => { dragHue = true; updateHue(e); };
    window.addEventListener('mousemove', (e) => { if(dragHue) updateHue(e); });
    window.addEventListener('mouseup', () => dragHue = false);
    
    let dragSv = false;
    const updateSv = (e) => {
        const rect = cpSvBox.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;
        x = Math.max(0, Math.min(x, rect.width)); y = Math.max(0, Math.min(y, rect.height));
        app.color.s = x / rect.width; app.color.v = 1 - (y / rect.height);
        updateColorFromHsv();
    };
    cpSvBox.onmousedown = (e) => { dragSv = true; updateSv(e); };
    window.addEventListener('mousemove', (e) => { if(dragSv) updateSv(e); });
    window.addEventListener('mouseup', () => dragSv = false);
}

function drawHueStrip() {
    const h = cpHueCtx.canvas.height;
    const grad = cpHueCtx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ff0000'); grad.addColorStop(0.17, '#ff00ff');
    grad.addColorStop(0.33, '#0000ff'); grad.addColorStop(0.5, '#00ffff');
    grad.addColorStop(0.67, '#00ff00'); grad.addColorStop(0.83, '#ffff00');
    grad.addColorStop(1, '#ff0000');
    cpHueCtx.fillStyle = grad; cpHueCtx.fillRect(0, 0, cpHueCtx.canvas.width, h);
}

function drawSvBox() {
    const w = cpSvCtx.canvas.width, h = cpSvCtx.canvas.height;
    cpSvCtx.fillStyle = `hsl(${app.color.h}, 100%, 50%)`;
    cpSvCtx.fillRect(0, 0, w, h);
    const whiteGrad = cpSvCtx.createLinearGradient(0, 0, w, 0);
    whiteGrad.addColorStop(0, '#fff'); whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    cpSvCtx.fillStyle = whiteGrad; cpSvCtx.fillRect(0, 0, w, h);
    const blackGrad = cpSvCtx.createLinearGradient(0, 0, 0, h);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)'); blackGrad.addColorStop(1, '#000');
    cpSvCtx.fillStyle = blackGrad; cpSvCtx.fillRect(0, 0, w, h);
    const cx = app.color.s * w, cy = (1 - app.color.v) * h;
    cpSvCtx.strokeStyle = app.color.v > 0.5 ? '#000' : '#fff';
    cpSvCtx.lineWidth = 2; cpSvCtx.beginPath(); cpSvCtx.arc(cx, cy, 5, 0, Math.PI*2); cpSvCtx.stroke();
}

function updateColorFromHsv() {
    const { h, s, v } = app.color;
    let r, g, b, i, f, p, q, t;
    i = Math.floor(h / 60) % 6; f = h / 60 - i; p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s);
    switch (i) {
        case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break; case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break; case 5: r = v; g = p; b = q; break;
    }
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    app.color.hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    document.getElementById('cp-current-color').style.backgroundColor = app.color.hex;
    document.getElementById('hex-input').value = app.color.hex;
}

window.setColor = function(hex) {
    app.color.hex = hex;
    const rgb = hexToRgb(hex);
    if(rgb) {
        let r = rgb.r/255, g = rgb.g/255, b = rgb.b/255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max, d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) h = 0;
        else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        app.color.h = h * 360; app.color.s = s; app.color.v = v;
        drawSvBox();
    }
    updateUI();
};

// --- HISTORY ---
function saveHistory() {
    const snapshot = {
        layers: app.layers.map(l => ({
            name: l.name, visible: l.visible,
            frames: l.frames.map(f => {
                const c = document.createElement('canvas'); c.width = f.width; c.height = f.height;
                c.getContext('2d').drawImage(f, 0, 0); return c;
            })
        })),
        anims: JSON.parse(JSON.stringify(app.anims)), currAnim: app.currAnim,
        frameCount: app.frameCount, w: app.w, h: app.h
    };
    if (app.historyIndex < app.history.length - 1) app.history = app.history.slice(0, app.historyIndex + 1);
    app.history.push(snapshot);
    if (app.history.length > 20) app.history.shift(); else app.historyIndex++;
}

window.undo = function() {
    if (app.historyIndex > 0) { app.historyIndex--; loadHistory(app.history[app.historyIndex]); }
};
window.redo = function() {
    if (app.historyIndex < app.history.length - 1) { app.historyIndex++; loadHistory(app.history[app.historyIndex]); }
};

function loadHistory(snap) {
    if(!snap) return;
    app.w = snap.w; app.h = snap.h; canvas.width = app.w; canvas.height = app.h;
    app.frameCount = snap.frameCount; app.anims = JSON.parse(JSON.stringify(snap.anims)); app.currAnim = snap.currAnim;
    app.layers = snap.layers.map(l => ({
        name: l.name, visible: l.visible,
        frames: l.frames.map(f => {
            const c = document.createElement('canvas'); c.width = f.width; c.height = f.height;
            c.getContext('2d').drawImage(f, 0, 0); return c;
        })
    }));
    updateUI();
}

function loop() {
    requestAnimationFrame(loop);
    if (app.isPlaying) {
        const now = Date.now();
        if (!app.lastTick || now - app.lastTick > (1000/app.fps)) { 
            app.lastTick = now; 
            advanceAnim(); 
            syncTimelineHighlight();
        }
    }
    renderPreview();
}

function syncTimelineHighlight() {
    const thumbs = document.querySelectorAll('.frame-thumb');
    thumbs.forEach((t, i) => {
        t.classList.toggle('active', i === app.previewFrame);
    });
    document.getElementById('frame-counter').innerText = `${app.previewFrame+1}/${app.frameCount}`;
}

function advanceAnim() {
    const a = app.anims[app.currAnim]; if (!a) return;
    app.previewFrame++;
    if (app.previewFrame > a.end || app.previewFrame < a.start || app.previewFrame >= app.frameCount) {
        app.previewFrame = a.start;
    }
}

window.togglePlay = function() {
    app.isPlaying = !app.isPlaying;
    if(app.isPlaying) {
        app.lastTick = Date.now();
        const a = app.anims[app.currAnim];
        app.previewFrame = (a) ? a.start : 0;
    }
    updateUI();
};

// --- TOOLS ---
function handleDraw(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
    if (x < 0 || x >= app.w || y < 0 || y >= app.h) return;
    const layer = app.layers[app.currLayer]; if (!layer || !layer.visible) return;
    const fCtx = layer.frames[app.currFrame].getContext('2d');
    if (app.tool === 'pen') { fCtx.fillStyle = app.color.hex; fCtx.fillRect(x,y,1,1); }
    else if (app.tool === 'eraser') { fCtx.clearRect(x,y,1,1); }
    else if (app.tool === 'picker') {
        const p = fCtx.getImageData(x,y,1,1).data;
        if(p[3]>0) window.setColor(rgbToHex(p[0],p[1],p[2]));
    }
    else if (app.tool === 'fill') { floodFill(fCtx, x, y, app.color.hex); }
    else if (app.tool === 'shape') { fCtx.fillStyle = app.color.hex; fCtx.fillRect(x-1, y-1, 3, 3); }
    renderCanvas();
}

function floodFill(ctx, startX, startY, color) {
    const w = app.w, h = app.h, img = ctx.getImageData(0,0,w,h), d = img.data;
    const target = getPixel(d, w, startX, startY), fill = hexToRgb(color);
    if (target.r===fill.r && target.g===fill.g && target.b===fill.b && target.a===255) return;
    const stack = [[startX, startY]];
    while(stack.length) {
        const [x,y] = stack.pop(); const c = getPixel(d, w, x, y);
        if (c.r===target.r && c.g===target.g && c.b===target.b && c.a===target.a) {
            setPixel(d, w, x, y, fill);
            if(x>0) stack.push([x-1, y]); if(x<w-1) stack.push([x+1, y]);
            if(y>0) stack.push([x, y-1]); if(y<h-1) stack.push([x, y+1]);
        }
    }
    ctx.putImageData(img, 0, 0);
}
function getPixel(d, w, x, y) { const i = (y*w+x)*4; return {r:d[i], g:d[i+1], b:d[i+2], a:d[i+3]}; }
function setPixel(d, w, x, y, c) { const i = (y*w+x)*4; d[i]=c.r; d[i+1]=c.g; d[i+2]=c.b; d[i+3]=255; }

// --- GLOBAL ACTIONS ---
window.addFrame = function() {
    app.layers.forEach(l => l.frames.splice(app.currFrame+1, 0, createFrame()));
    app.frameCount++; app.currFrame++;
    const a = app.anims[app.currAnim]; if(a && a.end === app.currFrame-1) a.end++;
    saveHistory(); updateUI();
};
window.duplicateFrame = function() {
    app.layers.forEach(l => {
        const src = l.frames[app.currFrame], clone = createFrame();
        clone.getContext('2d').drawImage(src,0,0); l.frames.splice(app.currFrame+1, 0, clone);
    });
    app.frameCount++; app.currFrame++; saveHistory(); updateUI();
};
window.deleteFrame = function() {
    if (app.frameCount <= 1) return;
    app.layers.forEach(l => l.frames.splice(app.currFrame, 1));
    app.frameCount--; if (app.currFrame >= app.frameCount) app.currFrame = app.frameCount-1;
    saveHistory(); updateUI();
};
window.addLayer = function() {
    const l = { name: `Layer ${app.layers.length+1}`, visible: true, frames: [] };
    for(let i=0; i<app.frameCount; i++) l.frames.push(createFrame());
    app.layers.push(l); app.currLayer = app.layers.length-1; saveHistory(); updateUI();
};
window.addAnimState = function() {
    const name = prompt("Anim Name:");
    if (name && !app.anims[name]) { app.anims[name] = { start: app.currFrame, end: app.currFrame }; app.currAnim = name; saveHistory(); updateUI(); }
};

window.saveProject = async function() {
    const name = prompt("Sprite Name:", "sprite"); if(!name) return;
    const s = document.createElement('canvas'); s.width = app.w * app.frameCount; s.height = app.h; const sx = s.getContext('2d');
    for(let i=0; i<app.frameCount; i++) {
        app.layers.forEach(l => { if(l.visible && l.frames[i]) sx.drawImage(l.frames[i], i*app.w, 0); });
    }
    const ac = {}; Object.keys(app.anims).forEach(k => { ac[k] = {...app.anims[k], loop:true, fps:app.fps}; });
    try {
        const base64Data = s.toDataURL('image/png');
        const res = await fetch('/api/assets/upload', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                path: `assets/sprites/${name}.png`,
                content: base64Data,
                isBase64: true
            })
        });
        
        if (res.ok) {
            if (window.RedGlitchEventBus) {
                window.RedGlitchEventBus.emit('file:changed', { path: `assets/sprites/${name}.png` });
            }
            alert("SAVED!");
        } else {
            alert("ERROR SAVING SPRITE");
        }
    } catch(e) { 
        console.error(e);
        alert("ERROR SAVING"); 
    }
};

window.importFile = function() { document.getElementById('file-input').click(); };

function renderPreview() {
    if(!pCanvas || !pCtx) return;
    let f = app.currFrame;
    if (app.isPlaying) f = app.previewFrame;
    if (f < 0 || f >= app.frameCount) f = 0;
    pCanvas.width = app.w; pCanvas.height = app.h;
    pCtx.clearRect(0,0,app.w,app.h);
    app.layers.forEach(l => { if(l.visible && l.frames[f]) pCtx.drawImage(l.frames[f],0,0); });
}

function setupInputs() {
    const onMove = (e) => { if(app.isDrawing) handleDraw(e); };
    const onUp = () => { if(app.isDrawing) { app.isDrawing = false; saveHistory(); } };
    document.getElementById('viewport').addEventListener('mousedown', (e) => { if(e.target === canvas) { app.isDrawing = true; handleDraw(e); } });
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    ['pen','eraser','fill','picker','move','shape'].forEach(t => { 
        const el = document.getElementById('tool-'+t);
        if(el) el.onclick = () => { app.tool = t; updateUI(); }; 
    });

    // FPS Input Sync
    const fpsInp = document.getElementById('anim-fps');
    if(fpsInp) {
        fpsInp.oninput = (e) => {
            app.fps = Math.max(1, parseInt(e.target.value) || 8);
        };
    }

    document.getElementById('btn-undo').onclick = window.undo;
    document.getElementById('btn-redo').onclick = window.redo;
    document.getElementById('btn-play').onclick = window.togglePlay;
    document.getElementById('btn-onion').onclick = () => { app.onion = !app.onion; updateUI(); };
    document.getElementById('btn-grid').onclick = () => { app.grid = !app.grid; updateUI(); };
    
    document.getElementById('file-input').onchange = (e) => {
        const f = e.target.files[0]; if(!f) return;
        const r = new FileReader();
        r.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const w = app.w; const h = img.height;
                resetProject(w, h);
                const cnt = Math.floor(img.width / w);
                app.frameCount = cnt;
                app.layers[0].frames = [];
                for(let i=0; i<cnt; i++) {
                    const c = createFrame();
                    c.getContext('2d').drawImage(img, i*w, 0, w, h, 0, 0, w, h);
                    app.layers[0].frames.push(c);
                }
                saveHistory(); updateUI();
            };
            img.src = ev.target.result;
        };
        r.readAsDataURL(f);
    };

    window.addEventListener('keydown', e => {
        if(e.ctrlKey && e.key === 'z') { e.preventDefault(); window.undo(); }
        if(e.ctrlKey && e.key === 'y') { e.preventDefault(); window.redo(); }
    });
}

function centerView() { canvas.style.width = (app.w*12)+'px'; canvas.style.height = (app.h*12)+'px'; }
window.toggleVis = function(e, i) { e.stopPropagation(); app.layers[i].visible = !app.layers[i].visible; updateUI(); };
window.resizeProject = function() {
    const w = parseInt(document.getElementById('canvas-w').value), h = parseInt(document.getElementById('canvas-h').value);
    if(w&&h) resetProject(w,h);
};