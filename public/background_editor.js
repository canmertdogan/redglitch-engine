// background_editor.js - GIF Studio Logic
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

function initializeBackgroundIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedglitchEventBus;
        projectState = window.RedglitchProjectState;
        assetManager = window.RedglitchAssetManager;
        
        if (eventBus) {
            // Listen for background requests from other editors
            eventBus.on('background:request', (event) => {
                console.log('[BackgroundEditor] Background requested:', event.data.backgroundId);
            });
            
            console.log('[BackgroundEditor] EventBus connected');
        }
    }
}

function broadcastBackgroundUpdate(bgName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`asset:background:${action}`, {
            backgroundId: bgName,
            frameCount: frames.length,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`assets.backgrounds.${bgName}`, {
            name: bgName,
            frames: frames.length,
            lastModified: Date.now()
        });
    }
}

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const timelineContainer = document.getElementById('frames-container');

// State
let frames = []; // Array of ImageData
let currentFrameIndex = 0;
let isPlaying = false;
let playInterval = null;
let tool = 'pen';
let color = '#ffffff';
let brushSize = 1;
let history = []; // Undo stack (simplified: snapshot of current frame)

// Canvas State
let scale = 1;
let isDrawing = false;

// --- INIT ---
window.onload = async () => {
    // Initialize integration first
    initializeBackgroundIntegration();
    
    // Setup UI
    document.getElementById('color-picker').addEventListener('input', (e) => color = e.target.value);
    document.getElementById('file-input').addEventListener('change', handleFileUpload);
    
    // Canvas Events
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseout', stopDraw);

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            const tag = e.target?.tagName?.toUpperCase() || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            e.preventDefault();
            undo();
        }
    });

    // Initial Load
    await loadInitialBackground();
};

// --- CORE: LOADING & PARSING ---

async function loadInitialBackground() {
    let hasProjectBackground = false;
    try {
        const listRes = await fetch('/api/assets/list?scope=assets');
        if (listRes.ok) {
            const list = await listRes.json();
            if (Array.isArray(list)) {
                hasProjectBackground = list.some(a => a && (a.path === 'assets/background.gif' || a.path === '/assets/background.gif' || a.name === 'background.gif'));
            }
        }
    } catch (_) { /* fallback below */ }

    const candidates = [
        ...(hasProjectBackground ? [`/assets/background.gif?t=${Date.now()}`] : []),
        `/sprite-art/gamebackground.gif?t=${Date.now()}`
    ];
    for (const url of candidates) {
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const blob = await res.blob();
            if (blob.size > 0) {
                const parsed = await parseGifFile(blob);
                if (parsed) return;
            }
        } catch (e) {
            console.warn("Failed to load background from", url, e);
        }
    }
    createBlankProject(320, 180);
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
        parseGifFile(file);
    } else {
        // Handle PNG/JPG/WEBP as single frame
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                saveToHistory();
                canvas.width = img.width;
                canvas.height = img.height;
                const wEl = document.getElementById('c-w');
                const hEl = document.getElementById('c-h');
                if (wEl) wEl.value = img.width;
                if (hEl) hEl.value = img.height;
                ctx.clearRect(0, 0, img.width, img.height);
                ctx.drawImage(img, 0, 0);
                frames = [ctx.getImageData(0, 0, img.width, img.height)];
                currentFrameIndex = 0;
                renderTimeline();
                renderCanvas();
            };
            img.onerror = () => alert('Could not load selected image file.');
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function createBlankProject(w, h) {
    canvas.width = w;
    canvas.height = h;
    const wEl = document.getElementById('c-w');
    const hEl = document.getElementById('c-h');
    if (wEl) wEl.value = w;
    if (hEl) hEl.value = h;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    frames = [ctx.getImageData(0, 0, w, h)];
    currentFrameIndex = 0;
    history = [];
    renderTimeline();
}

async function parseGifFile(fileBlob) {
    const arrayBuffer = await fileBlob.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);

    try {
        const Reader = (typeof omggif !== 'undefined' ? omggif.GifReader : (typeof Omggif !== 'undefined' ? Omggif.GifReader : window.GifReader));

        if (!Reader) {
            throw new Error("omggif library not loaded correctly.");
        }

        const gr = new Reader(byteArray);

        canvas.width = gr.width;
        canvas.height = gr.height;
        document.getElementById('c-w').value = gr.width;
        document.getElementById('c-h').value = gr.height;

        frames = [];

        // Canvas-sized RGBA accumulation buffer
        const pixels = new Uint8ClampedArray(gr.width * gr.height * 4);

        for (let i = 0; i < gr.numFrames(); i++) {
            gr.decodeAndBlitFrameRGBA(i, pixels);

            const imgData = new ImageData(new Uint8ClampedArray(pixels), gr.width, gr.height);
            frames.push(imgData);
        }

        if (frames.length === 0) {
            throw new Error("GIF contained 0 frames.");
        }

        currentFrameIndex = 0;
        history = [];
        renderTimeline();
        renderCanvas();
        return true;
    } catch (e) {
        console.error("GIF Parse Error:", e);
        return false;
    }
}

// --- RENDER & UI ---

function renderCanvas() {
    if (!frames[currentFrameIndex]) return;
    ctx.putImageData(frames[currentFrameIndex], 0, 0);
}

function renderTimeline() {
    timelineContainer.innerHTML = '';
    
    frames.forEach((frame, idx) => {
        const thumb = document.createElement('div');
        thumb.className = `frame-thumb ${idx === currentFrameIndex ? 'active' : ''}`;
        thumb.onclick = () => selectFrame(idx);
        
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = canvas.height;
        c.getContext('2d').putImageData(frame, 0, 0);
        
        thumb.innerHTML = `<div class="frame-idx">${idx+1}</div>`;
        thumb.appendChild(c);
        
        timelineContainer.appendChild(thumb);
    });
}

function selectFrame(idx) {
    // Save current state before switching? 
    // Already updating `frames` array on draw end.
    currentFrameIndex = idx;
    renderCanvas();
    
    // Highlight active
    const thumbs = document.querySelectorAll('.frame-thumb');
    thumbs.forEach((t, i) => {
        t.classList.toggle('active', i === idx);
    });
}

// --- TOOLS ---

function setTool(t) {
    tool = t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`t-${t}`).classList.add('active');
}

function startDraw(e) {
    if (isPlaying) return;
    isDrawing = true;
    saveToHistory(); // Undo point
    draw(e);
}

function stopDraw() {
    if (!isDrawing) return;
    isDrawing = false;
    // Save modifications to frames array
    frames[currentFrameIndex] = ctx.getImageData(0, 0, canvas.width, canvas.height);
    renderTimeline(); // Update thumbnail
}

function draw(e) {
    if (!isDrawing) return;
    
    const rect = canvas.getBoundingClientRect();
    // Calculate scaling if CSS resizes canvas
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
    
    ctx.fillStyle = (tool === 'eraser') ? '#00000000' : color; // Transparent for eraser? GIF doesn't support alpha well usually, assume black bg? 
    // Let's assume transparency is black for backgrounds usually, OR use global alpha. 
    // For now, Eraser = Black or Transparent. Let's do clear.
    
    if (tool === 'pen' || tool === 'eraser') {
        if (tool === 'eraser') ctx.clearRect(x, y, 1, 1);
        else ctx.fillRect(x, y, 1, 1);
    } else if (tool === 'fill') {
        // Implement flood fill later if needed, simple fill rect for now
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (tool === 'picker') {
        const p = ctx.getImageData(x, y, 1, 1).data;
        const hex = "#" + ((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1);
        color = hex;
        document.getElementById('color-picker').value = hex;
        setTool('pen');
    }
}

// --- FRAMES OPS ---

function addFrame() {
    saveToHistory();
    const current = frames[currentFrameIndex];
    const newFrame = new ImageData(new Uint8ClampedArray(current.data), current.width, current.height);
    frames.splice(currentFrameIndex + 1, 0, newFrame);
    currentFrameIndex++;
    renderTimeline();
    renderCanvas();
}

function duplicateFrame() {
    addFrame(); // Logic is same as clone
}

function deleteFrame() {
    if (frames.length <= 1) return alert("Cannot delete last frame.");
    saveToHistory();
    frames.splice(currentFrameIndex, 1);
    if (currentFrameIndex >= frames.length) currentFrameIndex = frames.length - 1;
    renderTimeline();
    renderCanvas();
}

// --- PLAYBACK ---

function togglePlay() {
    if (isPlaying) {
        clearInterval(playInterval);
        isPlaying = false;
        document.getElementById('play-icon').className = 'fas fa-play';
    } else {
        const fps = parseInt(document.getElementById('fps-input').value) || 10;
        playInterval = setInterval(() => {
            currentFrameIndex = (currentFrameIndex + 1) % frames.length;
            renderCanvas();
            // Don't render timeline every frame during playback for perf
        }, 1000 / fps);
        isPlaying = true;
        document.getElementById('play-icon').className = 'fas fa-stop';
    }
}

// --- FILTERS ---

function applyFilter(type) {
    saveToHistory();
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    
    for (let i = 0; i < d.length; i += 4) {
        if (type === 'grayscale') {
            const avg = (d[i] + d[i+1] + d[i+2]) / 3;
            d[i] = avg; d[i+1] = avg; d[i+2] = avg;
        } else if (type === 'invert') {
            d[i] = 255 - d[i];
            d[i+1] = 255 - d[i+1];
            d[i+2] = 255 - d[i+2];
        } else if (type === 'noise') {
            const n = (Math.random() - 0.5) * 50;
            d[i] += n; d[i+1] += n; d[i+2] += n;
        }
    }
    
    ctx.putImageData(id, 0, 0);
    frames[currentFrameIndex] = id;
    renderTimeline();
}

function resizeCanvas() {
    const w = parseInt(document.getElementById('c-w').value, 10);
    const h = parseInt(document.getElementById('c-h').value, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > 4096 || h > 4096) {
        alert("Invalid canvas dimensions.");
        return;
    }
    if (!confirm("Resizing will clear current animation. Continue?")) {
        return;
    }
    saveToHistory();
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    frames = [ctx.getImageData(0, 0, w, h)];
    currentFrameIndex = 0;
    renderTimeline();
}

function saveToHistory() {
    if (!frames || frames.length === 0) return;
    history.push({
        width: canvas.width,
        height: canvas.height,
        currentFrameIndex,
        frames: frames.map(f => new ImageData(new Uint8ClampedArray(f.data), f.width, f.height))
    });
    if (history.length > 20) history.shift();
}

function undo() {
    if (history.length === 0) return;
    const snap = history.pop();
    canvas.width = snap.width;
    canvas.height = snap.height;
    const wEl = document.getElementById('c-w');
    const hEl = document.getElementById('c-h');
    if (wEl) wEl.value = snap.width;
    if (hEl) hEl.value = snap.height;
    frames = snap.frames;
    currentFrameIndex = Math.max(0, Math.min(snap.currentFrameIndex, frames.length - 1));
    renderCanvas();
    renderTimeline();
}

// --- EXPORT ---

function _quantizeFrameForGif(frame) {
    const data = frame.data;
    const pixelCount = frame.width * frame.height;
    const indices = new Uint8Array(pixelCount);

    // Try lossless palette first (up to 255 opaque colors + index 0 reserved)
    const exactMap = new Map();
    const paletteList = [0x000000];
    let hasTransparent = false;
    let exactOverflow = false;

    for (let i = 0; i < pixelCount; i++) {
        const off = i * 4;
        const a = data[off + 3];
        if (a < 128) {
            hasTransparent = true;
            indices[i] = 0;
            continue;
        }
        const rgb = (data[off] << 16) | (data[off + 1] << 8) | data[off + 2];
        let idx = exactMap.get(rgb);
        if (idx === undefined) {
            if (paletteList.length >= 256) {
                exactOverflow = true;
                break;
            }
            idx = paletteList.length;
            paletteList.push(rgb);
            exactMap.set(rgb, idx);
        }
        indices[i] = idx;
    }

    if (!exactOverflow) {
        let size = 2;
        while (size < paletteList.length) size *= 2;
        while (paletteList.length < size) paletteList.push(0x000000);
        return { palette: paletteList, indices, hasTransparent };
    }

    // Fallback uniform RGB cube (8 x 8 x 4 = 256 entries, reserving index 0 for transparency)
    const palette = new Array(256);
    for (let r = 0; r < 8; r++) {
        for (let g = 0; g < 8; g++) {
            for (let b = 0; b < 4; b++) {
                const idx = (r << 5) | (g << 2) | b;
                const rr = Math.round((r / 7) * 255);
                const gg = Math.round((g / 7) * 255);
                const bb = Math.round((b / 3) * 255);
                palette[idx] = (rr << 16) | (gg << 8) | bb;
            }
        }
    }
    palette[0] = 0x000000;
    hasTransparent = false;

    for (let i = 0; i < pixelCount; i++) {
        const off = i * 4;
        if (data[off + 3] < 128) {
            hasTransparent = true;
            indices[i] = 0;
            continue;
        }
        const r = data[off] >> 5;
        const g = data[off + 1] >> 5;
        const b = data[off + 2] >> 6;
        let idx = (r << 5) | (g << 2) | b;
        if (idx === 0) idx = 1; // avoid colliding with transparent index 0
        indices[i] = idx;
    }

    return { palette, indices, hasTransparent };
}

function _bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function saveGif() {
    if (!confirm("Overwrite existing background?")) return;
    if (!frames || frames.length === 0) {
        alert("No frames to export.");
        return;
    }

    const Writer = (typeof omggif !== 'undefined' ? omggif.GifWriter : (typeof Omggif !== 'undefined' ? Omggif.GifWriter : window.GifWriter));
    if (!Writer) {
        alert("GIF encoder (omggif) is not loaded.");
        return;
    }

    try {
        const fps = Math.max(1, parseInt(document.getElementById('fps-input').value, 10) || 10);
        const delayCs = Math.max(2, Math.round(100 / fps));
        const w = canvas.width;
        const h = canvas.height;
        const buf = new Uint8Array(Math.max(4096, frames.length * (w * h * 2 + 2048)));
        const writer = new Writer(buf, w, h, { loop: 0 });

        for (const frame of frames) {
            const { palette, indices, hasTransparent } = _quantizeFrameForGif(frame);
            const opts = {
                palette,
                delay: delayCs,
                disposal: hasTransparent ? 2 : 1
            };
            if (hasTransparent) opts.transparent = 0;
            writer.addFrame(0, 0, frame.width, frame.height, indices, opts);
        }

        const len = writer.end();
        const base64data = 'data:image/gif;base64,' + _bytesToBase64(buf.subarray(0, len));

        const res = await fetch('/api/assets/background/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64data })
        });
        if (res.ok) {
            broadcastBackgroundUpdate('background', 'saved');
            alert("Saved successfully!");
        } else {
            alert("Save failed.");
        }
    } catch (e) {
        console.error(e);
        alert("Save error: " + e.message);
    }
}
