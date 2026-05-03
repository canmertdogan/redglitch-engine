// background_editor.js - GIF Studio Logic
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

function initializeBackgroundIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.VortexEventBus;
        projectState = window.VortexProjectState;
        assetManager = window.VortexAssetManager;
        
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
    
    // Initial Load
    await loadInitialBackground();
};

// --- CORE: LOADING & PARSING ---

async function loadInitialBackground() {
    const url = `sprite-art/gamebackground.gif?t=${Date.now()}`;
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        await parseGifFile(blob);
    } catch (e) {
        console.warn("Failed to load existing background, creating blank.", e);
        createBlankProject(320, 180);
    }
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.type === 'image/gif') {
        parseGifFile(file);
    } else {
        // Handle PNG/JPG as single frame
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                resizeProject(img.width, img.height);
                ctx.drawImage(img, 0, 0);
                frames = [ctx.getImageData(0, 0, img.width, img.height)];
                currentFrameIndex = 0;
                renderTimeline();
                renderCanvas();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function createBlankProject(w, h) {
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    frames = [ctx.getImageData(0, 0, w, h)];
    currentFrameIndex = 0;
    renderTimeline();
}

async function parseGifFile(fileBlob) {
    const arrayBuffer = await fileBlob.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);
    
    // Use omggif to parse
    // Note: gif.js is for encoding, omggif/libgif is for decoding.
    // Assuming omggif is loaded globally via script tag
    try {
        // Check for different global export names
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
        
        // Extract frames
        const frameInfo = [];
        // Canvas to draw frames onto
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = gr.width;
        tempCanvas.height = gr.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Prepare pixel buffer
        const pixels = new Uint8ClampedArray(gr.width * gr.height * 4);
        
        for (let i = 0; i < gr.numFrames(); i++) {
            gr.decodeAndBlitFrameRGBA(i, pixels);
            
            // Create ImageData
            const imgData = new ImageData(new Uint8ClampedArray(pixels), gr.width, gr.height);
            frames.push(imgData);
        }
        
        currentFrameIndex = 0;
        renderTimeline();
        renderCanvas();
        
    } catch (e) {
        console.error("GIF Parse Error:", e);
        alert("Could not parse GIF. Ensure it is a valid format.");
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
    // Clone current frame or blank? Clone is usually better
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
    const w = parseInt(document.getElementById('c-w').value);
    const h = parseInt(document.getElementById('c-h').value);
    canvas.width = w;
    canvas.height = h;
    // Resizing clears canvas, need to resize all frames?
    // This is complex. For now, simple resize resets.
    if(confirm("Resizing will clear current animation. Continue?")) {
        createBlankProject(w, h);
    }
}

function saveToHistory() {
    // Simple 1-step undo for now
    // history.push(ctx.getImageData(0,0,canvas.width, canvas.height));
}

function undo() {
    // Restore from history
}

// --- EXPORT ---

async function saveGif() {
    if (!confirm("Overwrite existing background?")) return;
    
    const fps = parseInt(document.getElementById('fps-input').value) || 10;
    const delay = 1000 / fps;
    
    const gif = new GIF({
        workers: 2,
        quality: 10,
        width: canvas.width,
        height: canvas.height,
        workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
    });
    
    frames.forEach(frame => {
        gif.addFrame(frame, {delay: delay});
    });
    
    gif.on('finished', async (blob) => {
        // Convert to Base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = reader.result;
            
            try {
                const res = await fetch('/api/background/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64data })
                });
                if (res.ok) alert("Saved successfully!");
                else alert("Save failed.");
            } catch (e) {
                console.error(e);
                alert("Save error: " + e.message);
            }
        };
    });
    
    gif.render();
}
