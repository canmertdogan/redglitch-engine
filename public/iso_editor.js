// iso_editor.js - Dedicated IsoPixel Studio Logic
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager, studioBridge;

async function initializeIsoIntegration() {
    if (typeof window !== 'undefined') {
        // Wait for EventBus to be ready if needed
        if (!window.KetebeEventBus) {
            await new Promise(r => setTimeout(r, 500));
        }

        eventBus = window.KetebeEventBus;
        projectState = window.KetebeProjectState;
        assetManager = window.KetebeAssetManager;
        
        if (eventBus) {
            // Initialize StudioBridge for IRAB
            if (window.StudioBridge) {
                studioBridge = new window.StudioBridge('pixel', eventBus);
                registerPixelTools();
                // Ensure tools are announced
                studioBridge.announceAll();
            }

            // --- Phase 9: Thought Visualization ---
            eventBus.on('studio:visual:ghost', (data) => {
                state.aiGhost = data;
                render();
            });

            eventBus.on('studio:visual:clear', () => {
                state.aiGhost = null;
                render();
            });

            // Listen for tile/sprite updates
            eventBus.on('asset:sprite:*', (event) => {
                console.log('[IsoEditor] Sprite asset updated:', event.data);
            });
            
            // Listen for prefab updates
            eventBus.on('prefab:*', (event) => {
                console.log('[IsoEditor] Prefab updated:', event.data);
            });
            
            console.log('[IsoEditor] EventBus connected');
        }
    }
}

/**
 * Register IRAB tools for IsoPixel Studio
 */
function registerPixelTools() {
    // pixel.setPixel (Standardize as 'placeBlock')
    studioBridge.register({
        name: 'placeBlock',
        description: 'Place a specific tile/block at map coordinates.',
        securityLevel: 'low-risk',
        parameters: {
            type: 'object',
            properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number', default: 0 },
                tileID: { type: 'number', description: 'The texture ID to place.' },
                shape: { type: 'number', description: 'Shape ID (0=Block, 1=Half, 2-5=Slopes)', default: 0 }
            },
            required: ['x', 'y', 'tileID']
        },
        execute: async (args) => {
            const oldZ = state.currentZ;
            const oldTile = state.selectedTileID;
            const oldShape = state.selectedShape;
            
            state.currentZ = args.z || 0;
            state.selectedTileID = args.tileID;
            state.selectedShape = args.shape || 0;
            
            state.mouseMapPos = { x: args.x, y: args.y };
            paint(); // paint() uses mouseMapPos and state
            
            state.currentZ = oldZ;
            state.selectedTileID = oldTile;
            state.selectedShape = oldShape;
            render();
            return { success: true };
        }
    });

    // pixel.drawRect
    studioBridge.register({
        name: 'drawRect',
        description: 'Fill a rectangular area with a specific tile.',
        securityLevel: 'low-risk',
        parameters: {
            type: 'object',
            properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' },
                z: { type: 'number', default: 0 },
                tileID: { type: 'number' }
            },
            required: ['x', 'y', 'w', 'h', 'tileID']
        },
        execute: async (args) => {
            const oldZ = state.currentZ;
            const oldTile = state.selectedTileID;
            state.currentZ = args.z || 0;
            state.selectedTileID = args.tileID;
            
            for (let iy = args.y; iy < args.y + args.h; iy++) {
                for (let ix = args.x; ix < args.x + args.w; ix++) {
                    state.mouseMapPos = { x: ix, y: iy };
                    paint();
                }
            }
            
            state.currentZ = oldZ;
            state.selectedTileID = oldTile;
            render();
            return { success: true };
        }
    });

    // pixel.generateTerrain
    studioBridge.register({
        name: 'generateTerrain',
        description: 'Generate procedural terrain using Noise (Simplex/Perlin).',
        securityLevel: 'high-risk',
        parameters: {
            type: 'object',
            properties: {
                mode: { type: 'string', enum: ['terrain', 'islands', 'maze', 'flat'], default: 'terrain' },
                scale: { type: 'number', default: 0.05 },
                amplitude: { type: 'number', default: 10 }
            }
        },
        execute: async (args) => {
            // Set UI values so runGenerator sees them
            document.getElementById('gen-mode').value = args.mode || 'islands';
            document.getElementById('gen-scale').value = args.scale || 0.05;
            document.getElementById('gen-amp').value = args.amplitude || 10;
            
            // runGenerator has a confirm(), we'll bypass it for AI if we wanted, 
            // but for now we follow the plan's "supervised" logic.
            // Actually, execute() is already approved by the PermissionGate.
            const result = await generateTerrainAsync(map.width, map.height, { 
                mode: args.mode || 'islands', 
                scale: args.scale || 0.05, 
                amplitude: args.amplitude || 10,
                seaLevel: parseInt(document.getElementById('gen-sea').value),
                offset: parseInt(document.getElementById('gen-offset').value),
                bottomZ: parseInt(document.getElementById('gen-bottom').value)
            });
            
            map.layers = result.layers;
            map.z = result.z;
            map.shapes = result.shapes;
            map.occlusionDirty = true;
            if (state.strategy && state.strategy.invalidateChunks) state.strategy.invalidateChunks();
            state.activeLayer = 0;
            updateLayerList();
            render();
            return { success: true, message: 'Terrain generated' };
        }
    });

    // pixel.generateVegetation
    studioBridge.register({
        name: 'generateVegetation',
        description: 'Add procedural vegetation (trees, grass) to the current map.',
        securityLevel: 'low-risk',
        parameters: {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['forest', 'sparse', 'jungle'], default: 'forest' },
                density: { type: 'number', default: 0.1 }
            }
        },
        execute: async (args) => {
            const gen = new IsoGenerator();
            const result = gen.generateVegetation(map.width, map.height, map.layers, map.z, { 
                type: args.type || 'forest', 
                density: args.density || 0.1 
            });
            map.layers = result.layers;
            map.z = result.z;
            map.occlusionDirty = true;
            if (state.strategy && state.strategy.invalidateChunks) state.strategy.invalidateChunks();
            render();
            return { success: true, message: 'Vegetation generated' };
        }
    });

    // pixel.spawnNPC
    studioBridge.register({
        name: 'spawnNPC',
        description: 'Place an NPC at specific map coordinates.',
        securityLevel: 'low-risk',
        parameters: {
            type: 'object',
            properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number', default: 0 },
                npcID: { type: 'string', description: 'The ID of the NPC definition to use.' }
            },
            required: ['x', 'y', 'npcID']
        },
        execute: async (args) => {
            const { x, y, z, npcID } = args;
            map.decorations = map.decorations.filter(d => d.x !== x || d.y !== y);
            map.decorations.push({ x, y, z: z || 0, type: 'npc', id: npcID });
            render();
            return { success: true, message: `Spawned NPC ${npcID} at (${x}, ${y})` };
        }
    });

    // pixel.placePrefab
    studioBridge.register({
        name: 'placePrefab',
        description: 'Place a pre-defined structure (prefab) at map coordinates.',
        securityLevel: 'low-risk',
        parameters: {
            type: 'object',
            properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                prefabID: { type: 'string', description: 'The name of the prefab file.' }
            },
            required: ['x', 'y', 'prefabID']
        },
        execute: async (args) => {
            const { x, y, prefabID } = args;
            map.decorations = map.decorations.filter(d => d.x !== x || d.y !== y);
            map.decorations.push({ x, y, type: 'prefab', data: prefabID });
            render();
            return { success: true, message: `Placed prefab ${prefabID} at (${x}, ${y})` };
        }
    });
}

function broadcastMapUpdate(mapName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`map:${action}`, {
            mapId: mapName,
            width: map.width,
            height: map.height,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`maps.${mapName}`, {
            name: mapName,
            width: map.width,
            height: map.height,
            lastModified: Date.now()
        });
    }
}

const canvas = document.getElementById('isoCanvas');
const ctx = canvas.getContext('2d');

// --- CONFIG ---
const CONFIG = {
    tileSize: 16,
    scale: 2,
    minScale: 0.5,
    maxScale: 6,
    tilesetPath: 'WORLD_PIXEL_ART'
};

// Helper to get scaled tile dimensions
function getDims() {
    return {
        w: CONFIG.tileSize * CONFIG.scale,
        h: CONFIG.tileSize * CONFIG.scale / 2
    };
}

let map = {
    width: 30,
    height: 30,
    type: 'iso-pixel',
    layers: [new Array(30 * 30).fill(null)],
    z: [new Array(30 * 30).fill(0)],
    shapes: [new Array(30 * 30).fill(0)],
    decorations: []
};

let state = {
    camX: 0,
    camY: 0,
    zoom: 1.0,
    currentZ: 0,
    tool: 'block',
    selectedTileID: 1,
    selectedShape: 0,
    activeLayer: 0,
    isDrawing: false,
    isPanning: false,
    lastMouse: { x: 0, y: 0 },
    mouseMapPos: { x: -1, y: -1 },
    strategy: new IsoStrategy(),
    tilesetReady: false,
    mode: 'visual',
    // FX Preview state
    fxPreview: false,
    fx: {
        scenePreset: 'day',
        lighting: {
            preset: 'day',
            ambient: '#2a3a5a',
            intensity: 0.8,
            time: 10,
            playerLight: { enabled: false, radius: 100, color: '#ffffaa', intensity: 0.6, falloff: 'smooth' }
        },
        shader: {
            preset: 'none',
            bloom: { enabled: false, intensity: 0.5, threshold: 0.7 },
            colorGrade: { enabled: false, contrast: 1.0, saturation: 1.0, brightness: 1.0 },
            vignette: { enabled: false, intensity: 0.3 },
            filmGrain: { enabled: false, intensity: 0.05 },
            chromaticAberration: { enabled: false, intensity: 0.003 }
        },
        lights: []
    }
};

// FX Systems (initialized after DOM ready)
let fxSystem = null;
let shaderSystem = null;
let fxCanvas = null;  // Offscreen canvas for FX rendering
let fxCtx = null;

let tileset = new Image();

// --- FX SYSTEM INITIALIZATION ---
function initFXSystems() {
    // Create offscreen canvas for FX rendering
    fxCanvas = document.createElement('canvas');
    fxCanvas.width = canvas.width;
    fxCanvas.height = canvas.height;
    fxCtx = fxCanvas.getContext('2d');
    fxCtx.imageSmoothingEnabled = false;
    
    // Initialize IsoFXSystem if available
    if (window.IsoFXSystem) {
        const projectFn = (worldX, worldY, worldZ) => {
            const dims = getDims();
            return {
                x: (worldX - worldY) * (dims.w / 2) - state.camX + canvas.width / 2,
                y: (worldX + worldY) * (dims.h / 2) - (worldZ * dims.h) - state.camY + canvas.height / 4
            };
        };
        fxSystem = new IsoFXSystem(fxCtx, fxCanvas, projectFn);
        fxSystem.setTime(state.fx.lighting.time);
        fxSystem.applyLightingPreset(state.fx.lighting.preset);
        console.log('[IsoStudio] FX System initialized');
    } else {
        console.warn('[IsoStudio] IsoFXSystem not available');
    }
    
    // Initialize IsoShaderSystem if available
    // Note: WebGL requires canvas to be in DOM or use OffscreenCanvas
    if (window.IsoShaderSystem) {
        try {
            // Create a hidden canvas in DOM for WebGL (some browsers require this)
            const shaderCanvas = document.createElement('canvas');
            shaderCanvas.width = canvas.width;
            shaderCanvas.height = canvas.height;
            shaderCanvas.style.display = 'none';
            shaderCanvas.id = 'shader-canvas';
            document.body.appendChild(shaderCanvas);
            
            shaderSystem = new IsoShaderSystem(shaderCanvas);
            
            if (shaderSystem.isSupported()) {
                console.log('[IsoStudio] Shader System initialized (WebGL)');
            } else {
                console.log('[IsoStudio] WebGL not supported, shaders disabled');
                document.body.removeChild(shaderCanvas);
                shaderSystem = null;
            }
        } catch (e) {
            console.warn('[IsoStudio] Shader System init failed:', e);
            shaderSystem = null;
        }
    } else {
        console.warn('[IsoStudio] IsoShaderSystem not available');
    }
}

// Update FX systems on resize
function resizeFXSystems() {
    if (fxCanvas) {
        fxCanvas.width = canvas.width;
        fxCanvas.height = canvas.height;
    }
    if (fxSystem) {
        fxSystem.resize(canvas.width, canvas.height);
    }
    if (shaderSystem) {
        shaderSystem.resize(canvas.width, canvas.height);
    }
}

// Apply current FX state to systems
function applyFXState() {
    if (!fxSystem) return;
    
    const fx = state.fx;
    
    // Apply lighting settings
    fxSystem.applyLightingPreset(fx.lighting.preset);
    fxSystem.setTime(fx.lighting.time);
    
    // Apply player light
    if (fx.lighting.playerLight.enabled) {
        fxSystem.setPlayerLight({
            radius: fx.lighting.playerLight.radius,
            color: fx.lighting.playerLight.color,
            intensity: fx.lighting.playerLight.intensity,
            falloff: fx.lighting.playerLight.falloff
        });
    } else {
        fxSystem.setPlayerLight({ enabled: false });
    }
    
    // Apply shader settings
    if (shaderSystem) {
        const sh = fx.shader;
        shaderSystem.setBloom(sh.bloom);
        shaderSystem.setColorGrade(sh.colorGrade);
        shaderSystem.setVignette(sh.vignette);
        shaderSystem.setFilmGrain(sh.filmGrain);
        shaderSystem.setChromaticAberration(sh.chromaticAberration);
    }
}

// Scene presets - combined lighting + shader configurations
const SCENE_PRESETS = {
    day: {
        lighting: { preset: 'day', time: 12, playerLight: { enabled: false } },
        shader: { preset: 'none', bloom: { enabled: false }, colorGrade: { enabled: false }, vignette: { enabled: false }, filmGrain: { enabled: false }, chromaticAberration: { enabled: false } }
    },
    sunset: {
        lighting: { preset: 'dusk', time: 18, playerLight: { enabled: false } },
        shader: { 
            bloom: { enabled: true, intensity: 0.4, threshold: 0.6 },
            colorGrade: { enabled: true, contrast: 1.1, saturation: 1.2, brightness: 1.0 },
            vignette: { enabled: true, intensity: 0.25 },
            filmGrain: { enabled: false }, chromaticAberration: { enabled: false }
        }
    },
    night: {
        lighting: { preset: 'night', time: 22, playerLight: { enabled: true, radius: 150, color: '#ffffaa', intensity: 0.7, falloff: 'smooth' } },
        shader: {
            bloom: { enabled: true, intensity: 0.5, threshold: 0.5 },
            colorGrade: { enabled: true, contrast: 1.15, saturation: 0.9, brightness: 1.0 },
            vignette: { enabled: true, intensity: 0.4 },
            filmGrain: { enabled: false }, chromaticAberration: { enabled: false }
        }
    },
    dungeon: {
        lighting: { preset: 'dungeon', time: 20, playerLight: { enabled: true, radius: 120, color: '#ffcc66', intensity: 0.8, falloff: 'smooth' } },
        shader: {
            bloom: { enabled: true, intensity: 0.6, threshold: 0.4 },
            colorGrade: { enabled: true, contrast: 1.2, saturation: 0.85, brightness: 0.95 },
            vignette: { enabled: true, intensity: 0.5 },
            filmGrain: { enabled: true, intensity: 0.03 }, chromaticAberration: { enabled: false }
        }
    },
    cave: {
        lighting: { preset: 'cave', time: 0, playerLight: { enabled: true, radius: 100, color: '#ffaa44', intensity: 0.9, falloff: 'sharp' } },
        shader: {
            bloom: { enabled: true, intensity: 0.7, threshold: 0.3 },
            colorGrade: { enabled: true, contrast: 1.3, saturation: 0.7, brightness: 0.9 },
            vignette: { enabled: true, intensity: 0.6 },
            filmGrain: { enabled: false }, chromaticAberration: { enabled: false }
        }
    },
    magical: {
        lighting: { preset: 'night', time: 21, playerLight: { enabled: true, radius: 130, color: '#aaccff', intensity: 0.6, falloff: 'soft' } },
        shader: {
            bloom: { enabled: true, intensity: 0.8, threshold: 0.4 },
            colorGrade: { enabled: true, contrast: 1.1, saturation: 1.3, brightness: 1.0 },
            vignette: { enabled: false, intensity: 0.2 },
            filmGrain: { enabled: false }, chromaticAberration: { enabled: true, intensity: 0.002 }
        }
    },
    horror: {
        lighting: { preset: 'cave', time: 23, playerLight: { enabled: true, radius: 80, color: '#ddddaa', intensity: 0.7, falloff: 'sharp' } },
        shader: {
            bloom: { enabled: true, intensity: 0.4, threshold: 0.6 },
            colorGrade: { enabled: true, contrast: 1.4, saturation: 0.5, brightness: 0.85 },
            vignette: { enabled: true, intensity: 0.7 },
            filmGrain: { enabled: true, intensity: 0.08 }, chromaticAberration: { enabled: true, intensity: 0.004 }
        }
    },
    retro: {
        lighting: { preset: 'day', time: 14, playerLight: { enabled: false } },
        shader: {
            bloom: { enabled: true, intensity: 0.3, threshold: 0.8 },
            colorGrade: { enabled: true, contrast: 1.2, saturation: 0.8, brightness: 1.05 },
            vignette: { enabled: true, intensity: 0.15 },
            filmGrain: { enabled: true, intensity: 0.04 }, chromaticAberration: { enabled: false }
        }
    }
};

// Apply a scene preset
window.applyScenePreset = (presetName) => {
    if (presetName === 'custom') {
        // Custom mode - don't change anything, just enable manual controls
        console.log('[IsoStudio] Custom mode - use individual controls');
        return;
    }
    
    const preset = SCENE_PRESETS[presetName];
    if (!preset) {
        console.warn(`[IsoStudio] Unknown scene preset: ${presetName}`);
        return;
    }
    
    console.log(`[IsoStudio] Applying scene preset: ${presetName}`);
    state.fx.scenePreset = presetName;
    
    // Apply lighting config
    if (preset.lighting) {
        Object.assign(state.fx.lighting, preset.lighting);
        if (preset.lighting.playerLight) {
            Object.assign(state.fx.lighting.playerLight, preset.lighting.playerLight);
        }
    }
    
    // Apply shader config
    if (preset.shader) {
        if (preset.shader.bloom) Object.assign(state.fx.shader.bloom, preset.shader.bloom);
        if (preset.shader.colorGrade) Object.assign(state.fx.shader.colorGrade, preset.shader.colorGrade);
        if (preset.shader.vignette) Object.assign(state.fx.shader.vignette, preset.shader.vignette);
        if (preset.shader.filmGrain) Object.assign(state.fx.shader.filmGrain, preset.shader.filmGrain);
        if (preset.shader.chromaticAberration) Object.assign(state.fx.shader.chromaticAberration, preset.shader.chromaticAberration);
    }
    
    // Apply to systems
    applyFXState();
    
    // Sync UI controls to reflect new state
    syncLightingUI();
    syncShaderUI();
    
    // Auto-enable preview if not already
    if (!state.fxPreview) {
        state.fxPreview = true;
        document.getElementById('preview-fx').checked = true;
    }
    
    render();
};

// Apply weather effect
window.applyWeather = (weather) => {
    if (fxSystem) {
        fxSystem.setWeather(weather);
        console.log(`[IsoStudio] Weather set to: ${weather}`);
    }
};

// --- LIGHTING CONTROLS ---

window.setLightingPreset = (preset) => {
    state.fx.lighting.preset = preset;
    if (fxSystem) fxSystem.applyLightingPreset(preset);
    document.getElementById('scene-preset').value = 'custom';
    render();
};

window.setTimeOfDay = (time) => {
    time = parseFloat(time);
    state.fx.lighting.time = time;
    if (fxSystem) fxSystem.setTime(time);
    
    // Update display
    const hours = Math.floor(time);
    const mins = Math.round((time - hours) * 60);
    document.getElementById('time-display').textContent = `${hours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}`;
    
    // Update icon based on time
    let icon = '☀️';
    if (time >= 6 && time < 8) icon = '🌅';
    else if (time >= 8 && time < 17) icon = '☀️';
    else if (time >= 17 && time < 20) icon = '🌅';
    else if (time >= 20 || time < 6) icon = '🌙';
    document.getElementById('time-icon').textContent = icon;
    
    document.getElementById('scene-preset').value = 'custom';
    render();
};

window.setAmbientColor = (color) => {
    state.fx.lighting.ambient = color;
    if (fxSystem) fxSystem.ambientColor = color;
    document.getElementById('scene-preset').value = 'custom';
    render();
};

window.setAmbientIntensity = (intensity) => {
    intensity = parseFloat(intensity);
    state.fx.lighting.intensity = intensity;
    if (fxSystem) fxSystem.ambientIntensity = intensity;
    document.getElementById('ambient-intensity-val').textContent = intensity.toFixed(2);
    document.getElementById('scene-preset').value = 'custom';
    render();
};

window.togglePlayerLight = (enabled) => {
    state.fx.lighting.playerLight.enabled = enabled;
    document.getElementById('player-light-controls').style.display = enabled ? 'block' : 'none';
    applyFXState();
    document.getElementById('scene-preset').value = 'custom';
    render();
};

window.setPlayerLightRadius = (radius) => {
    radius = parseInt(radius);
    state.fx.lighting.playerLight.radius = radius;
    document.getElementById('player-light-radius-val').textContent = radius;
    applyFXState();
    render();
};

window.setPlayerLightColor = (color) => {
    state.fx.lighting.playerLight.color = color;
    applyFXState();
    render();
};

window.setPlayerLightIntensity = (intensity) => {
    state.fx.lighting.playerLight.intensity = parseFloat(intensity);
    applyFXState();
    render();
};

window.setPlayerLightFalloff = (falloff) => {
    state.fx.lighting.playerLight.falloff = falloff;
    applyFXState();
    render();
};

// Sync UI from state (used when loading levels or applying presets)
function syncLightingUI() {
    const l = state.fx.lighting;
    document.getElementById('lighting-preset').value = l.preset;
    document.getElementById('time-slider').value = l.time;
    setTimeOfDay(l.time); // Updates display and icon
    document.getElementById('ambient-color').value = l.ambient;
    document.getElementById('ambient-intensity').value = l.intensity;
    document.getElementById('ambient-intensity-val').textContent = l.intensity.toFixed(2);
    
    const pl = l.playerLight;
    document.getElementById('player-light-enabled').checked = pl.enabled;
    document.getElementById('player-light-controls').style.display = pl.enabled ? 'block' : 'none';
    document.getElementById('player-light-radius').value = pl.radius;
    document.getElementById('player-light-radius-val').textContent = pl.radius;
    document.getElementById('player-light-color').value = pl.color;
    document.getElementById('player-light-intensity').value = pl.intensity;
    document.getElementById('player-light-falloff').value = pl.falloff;
}

// --- SHADER CONTROLS ---

window.setShaderPreset = (preset) => {
    state.fx.shader.preset = preset;
    if (shaderSystem) shaderSystem.applyPreset(preset);
    document.getElementById('scene-preset').value = 'custom';
    syncShaderUI();
    render();
};

window.setBloomEnabled = (enabled) => {
    state.fx.shader.bloom.enabled = enabled;
    document.getElementById('bloom-controls').style.display = enabled ? 'block' : 'none';
    applyShaderState();
    document.getElementById('scene-preset').value = 'custom';
    render();
};

window.setBloomIntensity = (val) => {
    val = parseFloat(val);
    state.fx.shader.bloom.intensity = val;
    document.getElementById('bloom-intensity-val').textContent = val.toFixed(2);
    applyShaderState();
    render();
};

window.setBloomThreshold = (val) => {
    val = parseFloat(val);
    state.fx.shader.bloom.threshold = val;
    document.getElementById('bloom-threshold-val').textContent = val.toFixed(2);
    applyShaderState();
    render();
};

window.setColorGradeEnabled = (enabled) => {
    state.fx.shader.colorGrade.enabled = enabled;
    document.getElementById('colorgrade-controls').style.display = enabled ? 'block' : 'none';
    applyShaderState();
    document.getElementById('scene-preset').value = 'custom';
    render();
};

window.setColorGradeContrast = (val) => {
    val = parseFloat(val);
    state.fx.shader.colorGrade.contrast = val;
    document.getElementById('colorgrade-contrast-val').textContent = val.toFixed(2);
    applyShaderState();
    render();
};

window.setColorGradeSaturation = (val) => {
    val = parseFloat(val);
    state.fx.shader.colorGrade.saturation = val;
    document.getElementById('colorgrade-saturation-val').textContent = val.toFixed(2);
    applyShaderState();
    render();
};

window.setColorGradeBrightness = (val) => {
    val = parseFloat(val);
    state.fx.shader.colorGrade.brightness = val;
    document.getElementById('colorgrade-brightness-val').textContent = val.toFixed(2);
    applyShaderState();
    render();
};

window.setVignetteEnabled = (enabled) => {
    state.fx.shader.vignette.enabled = enabled;
    document.getElementById('vignette-controls').style.display = enabled ? 'block' : 'none';
    applyShaderState();
    document.getElementById('scene-preset').value = 'custom';
    render();
};

window.setVignetteIntensity = (val) => {
    val = parseFloat(val);
    state.fx.shader.vignette.intensity = val;
    document.getElementById('vignette-intensity-val').textContent = val.toFixed(2);
    applyShaderState();
    render();
};

window.setFilmGrainEnabled = (enabled) => {
    state.fx.shader.filmGrain.enabled = enabled;
    state.fx.shader.filmGrain.intensity = enabled ? 0.05 : 0;
    applyShaderState();
    document.getElementById('scene-preset').value = 'custom';
    render();
};

window.setChromaticEnabled = (enabled) => {
    state.fx.shader.chromaticAberration.enabled = enabled;
    state.fx.shader.chromaticAberration.intensity = enabled ? 0.003 : 0;
    applyShaderState();
    document.getElementById('scene-preset').value = 'custom';
    render();
};

// Apply shader state to system
function applyShaderState() {
    if (!shaderSystem) return;
    const sh = state.fx.shader;
    shaderSystem.setBloom(sh.bloom);
    shaderSystem.setColorGrade(sh.colorGrade);
    shaderSystem.setVignette(sh.vignette);
    shaderSystem.setFilmGrain(sh.filmGrain);
    shaderSystem.setChromaticAberration(sh.chromaticAberration);
}

// Sync shader UI from state
function syncShaderUI() {
    const sh = state.fx.shader;
    
    // Bloom
    document.getElementById('bloom-enabled').checked = sh.bloom.enabled;
    document.getElementById('bloom-controls').style.display = sh.bloom.enabled ? 'block' : 'none';
    document.getElementById('bloom-intensity').value = sh.bloom.intensity;
    document.getElementById('bloom-intensity-val').textContent = sh.bloom.intensity.toFixed(2);
    document.getElementById('bloom-threshold').value = sh.bloom.threshold;
    document.getElementById('bloom-threshold-val').textContent = sh.bloom.threshold.toFixed(2);
    
    // Color Grade
    document.getElementById('colorgrade-enabled').checked = sh.colorGrade.enabled;
    document.getElementById('colorgrade-controls').style.display = sh.colorGrade.enabled ? 'block' : 'none';
    document.getElementById('colorgrade-contrast').value = sh.colorGrade.contrast;
    document.getElementById('colorgrade-contrast-val').textContent = sh.colorGrade.contrast.toFixed(2);
    document.getElementById('colorgrade-saturation').value = sh.colorGrade.saturation;
    document.getElementById('colorgrade-saturation-val').textContent = sh.colorGrade.saturation.toFixed(2);
    document.getElementById('colorgrade-brightness').value = sh.colorGrade.brightness;
    document.getElementById('colorgrade-brightness-val').textContent = sh.colorGrade.brightness.toFixed(2);
    
    // Vignette
    document.getElementById('vignette-enabled').checked = sh.vignette.enabled;
    document.getElementById('vignette-controls').style.display = sh.vignette.enabled ? 'block' : 'none';
    document.getElementById('vignette-intensity').value = sh.vignette.intensity;
    document.getElementById('vignette-intensity-val').textContent = sh.vignette.intensity.toFixed(2);
    
    // Extra effects
    document.getElementById('filmgrain-enabled').checked = sh.filmGrain.enabled;
    document.getElementById('chromatic-enabled').checked = sh.chromaticAberration.enabled;
}

// --- LIGHT PLACEMENT ---

let nextLightId = 1;

// Place a light at map position
window.placeLight = (mapX, mapY) => {
    const type = document.getElementById('light-type').value;
    const color = document.getElementById('light-color').value;
    const radius = parseInt(document.getElementById('light-radius').value);
    const intensity = parseFloat(document.getElementById('light-intensity').value);
    const falloff = document.getElementById('light-falloff').value;
    
    const light = {
        id: nextLightId++,
        type: type,
        x: mapX,
        y: mapY,
        color: color,
        radius: radius,
        intensity: intensity,
        falloff: falloff
    };
    
    state.fx.lights.push(light);
    
    // Add to FX system for preview
    if (fxSystem && state.fxPreview) {
        fxSystem.addSoftLight(mapX, mapY, {
            id: light.id,
            radius: radius,
            color: color,
            intensity: intensity,
            falloff: falloff
        });
    }
    
    updateLightsList();
    render();
    console.log(`[IsoStudio] Placed ${type} light at (${mapX}, ${mapY})`);
};

// Remove a light by ID
window.removeLight = (id) => {
    const idx = state.fx.lights.findIndex(l => l.id === id);
    if (idx !== -1) {
        state.fx.lights.splice(idx, 1);
        if (fxSystem) fxSystem.removeSoftLight(id);
        updateLightsList();
        render();
    }
};

// Clear all lights
window.clearAllLights = () => {
    if (state.fx.lights.length === 0) return;
    if (!confirm('Remove all placed lights?')) return;
    
    state.fx.lights.forEach(l => {
        if (fxSystem) fxSystem.removeSoftLight(l.id);
    });
    state.fx.lights = [];
    updateLightsList();
    render();
};

// Update lights list UI
function updateLightsList() {
    const list = document.getElementById('lights-list');
    const count = document.getElementById('light-count');
    
    count.textContent = state.fx.lights.length;
    
    if (state.fx.lights.length === 0) {
        list.innerHTML = '<div style="font-size:11px; color:#555; padding:5px;">No lights placed yet</div>';
        return;
    }
    
    list.innerHTML = state.fx.lights.map(l => `
        <div style="display:flex; align-items:center; gap:5px; padding:4px; background:#111; margin-bottom:2px; border-left:3px solid ${l.color};">
            <span style="width:14px; height:14px; background:${l.color}; border-radius:50%;"></span>
            <span style="flex:1; font-size:10px; color:#aaa;">${l.type} (${l.x},${l.y})</span>
            <button onclick="removeLight(${l.id})" style="background:none; border:none; color:#666; cursor:pointer; font-size:10px;">✕</button>
        </div>
    `).join('');
}

// Sync lights to FX system (after loading level)
function syncLightsToFX() {
    if (!fxSystem) return;
    
    // Clear existing
    state.fx.lights.forEach(l => fxSystem.removeSoftLight(l.id));
    
    // Re-add all
    state.fx.lights.forEach(l => {
        fxSystem.addSoftLight(l.x, l.y, {
            id: l.id,
            radius: l.radius,
            color: l.color,
            intensity: l.intensity,
            falloff: l.falloff
        });
    });
    
    updateLightsList();
}

// --- MODES ---
window.setMode = (m) => {
    state.mode = m;
    
    // Update Rail UI
    document.querySelectorAll('#tool-rail .rail-btn').forEach(b => b.classList.remove('active'));
    // Tools (block/eraser etc) are separate from Mode (VIS/GEO/PRP), but modes might imply tools.
    // Let's say modes are highlighting the BUTTONS at the bottom of rail.
    document.getElementById(`mode-${m === 'props' ? 'props' : m === 'geo' ? 'geo' : 'visual'}`).classList.add('active');
    
    // Mode Logic - switch to appropriate bottom palette tab
    if (m === 'visual') {
        if (typeof setPaletteTab === 'function') setPaletteTab('tiles');
        if (state.tool !== 'eraser') setTool('block');
        toggleInspector(false); 
    } else if (m === 'geo') {
        // GEO mode: Focus on Geometry (Shapes).
        if (typeof setPaletteTab === 'function') setPaletteTab('shapes');
        if (state.tool !== 'eraser') setTool('block');
    } else if (m === 'props') {
        if (typeof setPaletteTab === 'function') setPaletteTab('prefabs');
    }
};

// --- SHAPE LOGIC ---
window.setShape = (id, btn) => {
    state.selectedShape = id;
    // Update UI
    if (!btn) {
        // Find button by index (0-5)
        const shapes = document.querySelectorAll('#shape-controls .tool-btn');
        if (shapes[id]) btn = shapes[id];
    }
    
    if (btn) {
        const parent = btn.parentElement;
        Array.from(parent.children).forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
    }
};

function changeZ(delta) {
    let val = state.currentZ + delta;
    val = Math.max(-32, Math.min(32, val));
    state.currentZ = val;
    
    const zSlider = document.getElementById('z-slider');
    if (zSlider) zSlider.value = val;
    
    const zInput = document.getElementById('z-input');
    if (zInput) zInput.value = val;
    
    const zDisplay = document.getElementById('z-display');
    if (zDisplay) zDisplay.innerText = val;
    
    render();
}

function rotateShape() {
    let s = state.selectedShape;
    if (s < 2) s = 2; // Start slopes
    else {
        s++;
        if (s > 5) s = 2;
    }
    setShape(s);
}

// --- PALETTE TABS (Bottom Palette) ---
// Note: setPaletteTab is defined inline in HTML for immediate availability
// These are the data loading functions called when switching tabs

window.onPaletteTabChange = (tabName) => {
    if (tabName === 'prefabs') loadPrefabs();
    if (tabName === 'worlds') refreshWorldsList();
    if (tabName === 'npcs') loadNPCs();
    console.log(`[IsoStudio] Switched to ${tabName} tab`);
};

// --- PROPS PANEL LOGIC ---
window.showPropCategory = (cat) => {
    document.querySelectorAll('.prop-category').forEach(el => el.style.display = 'none');
    document.getElementById(`cat-${cat}`).style.display = 'block';
    
    // Update active button state
    document.querySelectorAll('#bp-props .btn-full').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.toLowerCase() === cat);
    });
};

window.selectProp = (type) => {
    state.tool = 'prop';
    state.selectedProp = type;
    
    document.querySelectorAll('.prop-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    console.log(`[IsoStudio] Selected prop: ${type}`);
};

// --- COLLISION LOGIC ---
window.selectCollisionType = (type) => {
    state.tool = 'collision';
    state.selectedCollisionType = type;
    
    const display = document.getElementById('collision-type-display');
    if(display) display.innerText = `Type ${type}`;
    console.log(`[IsoStudio] Collision type set to: ${type}`);
};

// Hook into the tab switching (called from HTML)
const originalSetPaletteTab = window.setPaletteTab;
if (originalSetPaletteTab) {
    window.setPaletteTab = (tabName) => {
        originalSetPaletteTab(tabName);
        window.onPaletteTabChange(tabName);
    };
}

// --- PREFABS ---
state.prefabCache = {};

window.loadPrefabs = async () => {
    const list = document.getElementById('prefab-list');
    list.innerHTML = '<div style="color:#666; font-size:12px;">Scanning...</div>';
    
    try {
        const assetsRes = await fetch('/api/assets/list');
        const assets = await assetsRes.json();
        const prefabs = assets.filter(a => a.name.endsWith('.json') && (a.path.includes('definitions') || a.name.includes('prefab')));
        
        list.innerHTML = '';
        prefabs.forEach(p => {
            const name = p.name.replace('.json','');
            const d = document.createElement('div');
            d.className = 'asset-card';
            d.innerHTML = `
                <div class="asset-thumb"><i class="fas fa-cube"></i></div>
                <div class="asset-info">
                    <div class="asset-name">${name}</div>
                    <div class="asset-meta">PREFAB</div>
                </div>
            `;
            d.onclick = () => selectPrefab(p.name, d);
            list.appendChild(d);
        });
    } catch(e) { list.innerHTML = 'Error loading prefabs'; }
};

async function selectPrefab(name, el) {
    state.tool = 'prefab';
    state.selectedPrefab = name;
    document.querySelectorAll('#prefab-list .asset-card').forEach(e => e.classList.remove('active'));
    if(el) el.classList.add('active');
    
    if (!state.prefabCache[name]) {
        try {
            const res = await fetch(`/dunyalar/definitions/${name}`);
            if(res.ok) state.prefabCache[name] = await res.json();
        } catch(e) {}
    }
}

window.loadNPCs = async () => {
    const list = document.getElementById('npc-list');
    list.innerHTML = '<div style="color:#666; font-size:12px;">Loading NPCs...</div>';
    
    try {
        const assetsRes = await fetch('/api/assets/list');
        const assets = await assetsRes.json();
        // Filter for potential NPC definitions (JSON files in definitions that aren't other types)
        const npcFiles = assets.filter(a => 
            a.name.endsWith('.json') && 
            a.path.includes('definitions') && 
            !a.name.includes('prefab') && 
            !a.name.includes('quest') && 
            !a.name.includes('item') &&
            !a.name.includes('ui.json') &&
            !a.name.includes('music.json')
        );
        
        list.innerHTML = '';
        npcFiles.forEach(n => {
            const name = n.name.replace('.json','');
            const d = document.createElement('div');
            d.className = 'asset-card'; 
            d.innerHTML = `
                <div class="asset-thumb">
                    <i class="fas fa-user-secret" style="color:var(--accent);"></i>
                </div>
                <div class="asset-info">
                    <div class="asset-name">${name}</div>
                    <div class="asset-meta">NPC</div>
                </div>
            `;
            d.onclick = () => selectNPC(name, d);
            list.appendChild(d);
        });
    } catch(e) { list.innerHTML = 'Error loading NPCs'; }
};

window.selectNPC = (id, el) => {
    state.tool = 'npc';
    state.selectedNPC = id;
    document.querySelectorAll('#npc-list .asset-card').forEach(e => e.classList.remove('active'));
    if(el) el.classList.add('active');
    console.log(`[IsoStudio] Selected NPC: ${id}`);
};

// --- GENERATOR ---
window.runGenerator = async () => {
    if (!confirm("This will overwrite the ENTIRE map with new terrain. Proceed?")) return;
    
    const mode = document.getElementById('gen-mode').value;
    const scale = parseFloat(document.getElementById('gen-scale').value);
    const amplitude = parseInt(document.getElementById('gen-amp').value);
    const seaLevel = parseInt(document.getElementById('gen-sea').value);
    const offset = parseInt(document.getElementById('gen-offset').value);
    const bottomZ = parseInt(document.getElementById('gen-bottom').value);
    
    updateProgress(0, 'Generating terrain...');
    const result = await generateTerrainAsync(map.width, map.height, { mode, scale, amplitude, seaLevel, offset, bottomZ });
    
    // Replace Map Data
    map.layers = result.layers;
    map.z = result.z;
    map.shapes = result.shapes;
    map.occlusionDirty = true;
    
    // Flush chunk cache so new tile data is drawn
    if (state.strategy && state.strategy.invalidateChunks) state.strategy.invalidateChunks();
    
    state.activeLayer = 0;
    updateLayerList();
    render();
};

window.runVegetation = async () => {
    if (!confirm("Add vegetation to current map?")) return;
    
    const type = document.getElementById('veg-type').value;
    const density = parseFloat(document.getElementById('veg-density').value);
    
    updateProgress(0, 'Generating vegetation...');
    const result = await generateVegetationAsync(map.width, map.height, map.layers, map.z, { type, density });
    
    // Update Map (Vegetation generator returns updated arrays)
    map.layers = result.layers;
    map.z = result.z;
    map.occlusionDirty = true;
    // Shapes generally stay same for trees (blocks) but if we added ramps support later...
    
    // Flush chunk cache so new tile data is drawn
    if (state.strategy && state.strategy.invalidateChunks) state.strategy.invalidateChunks();
    
    render();
    console.log("Vegetation generated.");
};

// --- LOADING ---
function updateProgress(percent, text) {
    const bar = document.getElementById('loading-bar');
    const txt = document.getElementById('loading-text');
    const overlay = document.getElementById('loading-overlay');
    
    if (bar) bar.style.width = percent + '%';
    if (txt) txt.innerText = text;
    
    if (percent >= 100) {
        setTimeout(() => {
            if (overlay) {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.5s';
                setTimeout(() => overlay.style.display = 'none', 500);
            }
        }, 500);
    }
}

// --- INIT ---
window.onload = async () => {
    // Initialize integration first
    await initializeIsoIntegration();
    
    updateProgress(10, "INITIALIZING SYSTEM...");
    console.log("[IsoStudio] Initializing...");
    if (window.electronAPI) window.electronAPI.maximize();
    
    // Ensure Map Data Structure
    if (!map.lights) map.lights = [];

    // 1. Load Tileset
    updateProgress(30, "LOADING TILESET...");
    await loadTileset(CONFIG.tilesetPath);
    
    // 2. Initialize FX Systems
    updateProgress(50, "LOADING FX SYSTEMS...");
    initFXSystems();
    
    updateProgress(60, "PREPARING INPUTS...");
    // 3. Setup Inputs
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel);
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('resize', resize); // resize() now includes render()
    
    // Keyboard State
    window.keys = {};
    window.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (e.key.toLowerCase() === 'q') changeZ(1);
        if (e.key.toLowerCase() === 'e') changeZ(-1);
        if (e.key.toLowerCase() === 'r') rotateShape();
        if (e.key >= '1' && e.key <= '6') setShape(parseInt(e.key) - 1);
    });
    window.addEventListener('keyup', e => keys[e.code] = false);
    
    document.getElementById('z-slider').addEventListener('input', (e) => {
        state.currentZ = parseInt(e.target.value);
        document.getElementById('z-input').value = state.currentZ;
        render();
    });
    
    document.getElementById('z-input').addEventListener('change', (e) => {
        let val = parseInt(e.target.value);
        val = Math.max(-32, Math.min(32, val));
        state.currentZ = val;
        document.getElementById('z-slider').value = val;
        render();
    });

    document.getElementById('map-w').addEventListener('change', (e) => {
        const w = parseInt(e.target.value);
        if(w > 0) resizeMap(w, map.height);
    });

    document.getElementById('map-h').addEventListener('change', (e) => {
        const h = parseInt(e.target.value);
        if(h > 0) resizeMap(map.width, h);
    });
    
    // FX Preview toggle
    document.getElementById('preview-fx').addEventListener('change', (e) => {
        state.fxPreview = e.target.checked;
        console.log(`[IsoStudio] FX Preview: ${state.fxPreview ? 'ON' : 'OFF'}`);
        render();
    });

    updateProgress(80, "RENDERING INITIAL VIEW...");
    resize();
    centerView();
    updateLayerList();
    loop();
    updateProgress(100, "READY!");

    // --- AI Generation Helper ---
    window._isoAIGenerate = async (params) => {
        const mode = (params && params.mode) || 'terrain';
        const scale = (params && params.scale) || 0.05;
        const amplitude = (params && params.amplitude) || 10;
        console.log('[IsoStudio] AI generating terrain:', mode, { scale, amplitude });
        document.getElementById('gen-mode').value = mode;
        document.getElementById('gen-scale').value = scale;
        document.getElementById('gen-amp').value = amplitude;
        updateProgress(0, 'AI: Generating terrain...');
        const result = await generateTerrainAsync(map.width, map.height, {
            mode, scale, amplitude,
            seaLevel: parseInt(document.getElementById('gen-sea').value),
            offset: parseInt(document.getElementById('gen-offset').value),
            bottomZ: parseInt(document.getElementById('gen-bottom').value)
        });
        map.layers = result.layers;
        map.z = result.z;
        map.shapes = result.shapes;
        state.activeLayer = 0;
        updateLayerList();
        render();
        updateProgress(100, "READY!");
        console.log('[IsoStudio] AI terrain generated!');
    };

    // Check for pending AI action immediately
    _isoPendingCheck();
};

function _isoPendingCheck() {
    const raw = localStorage.getItem('ai_pending_action');
    if (!raw) return;
    try {
        const action = JSON.parse(raw);
        if (!action || !action.method) return;
        const age = Date.now() - (action.timestamp || 0);
        if (age > 60000) { localStorage.removeItem('ai_pending_action'); return; }
        if (action.method === 'pixel.generateTerrain' || action.method === 'isopixel.generateTerrain' || action.method === 'iso.generateTerrain') {
            localStorage.removeItem('ai_pending_action');
            console.log('[IsoStudio] Recovering AI pending action:', action.params);
            if (window._isoAIGenerate) {
                window._isoAIGenerate(action.params || {});
            }
        }
    } catch (e) {
        console.error('[IsoStudio] Pending action recovery failed:', e);
    }
}

// Listen for localStorage changes from other frames (assistant iframe sets it)
window.addEventListener('storage', (e) => {
    if (e.key === 'ai_pending_action' && e.newValue) {
        console.log('[IsoStudio] Storage event: new pending action detected');
        setTimeout(() => _isoPendingCheck(), 200);
    }
});

function updateLayerList() {
    const list = document.getElementById('layer-list');
    list.innerHTML = '';
    
    // Ensure data integrity
    while (map.z.length < map.layers.length) map.z.push(new Array(map.width*map.height).fill(0));
    while (map.shapes.length < map.layers.length) map.shapes.push(new Array(map.width*map.height).fill(0));

    for (let i = map.layers.length - 1; i >= 0; i--) {
        const div = document.createElement('div');
        div.className = `layer-item ${i === state.activeLayer ? 'active' : ''}`;
        div.innerHTML = `
            <div style="width:10px; height:10px; background:${i === state.activeLayer ? 'var(--accent)' : '#444'};"></div>
            <span style="font-size:12px; color:#fff;">LAYER ${i}</span>
            ${i > 0 ? `<i class="fas fa-trash" style="margin-left:auto; color:#666; cursor:pointer;" onclick="removeLayer(${i})"></i>` : ''}
        `;
        div.onclick = () => selectLayer(i);
        list.appendChild(div);
    }
}
window.updateLayerList = updateLayerList;

window.addLayer = () => {
    map.layers.push(new Array(map.width * map.height).fill(null));
    map.z.push(new Array(map.width * map.height).fill(0));
    map.shapes.push(new Array(map.width * map.height).fill(0));
    state.activeLayer = map.layers.length - 1;
    updateLayerList();
};

window.removeLayer = (i) => {
    if (map.layers.length <= 1) return;
    map.layers.splice(i, 1);
    map.z.splice(i, 1);
    map.shapes.splice(i, 1);
    state.activeLayer = Math.max(0, state.activeLayer - 1);
    updateLayerList();
    render(); // Force render to clear removed layer
};

window.selectLayer = (i) => {
    state.activeLayer = i;
    updateLayerList();
};

function updateBlockPreview(id) {
    const el = document.getElementById('selected-block-preview');
    const txt = document.getElementById('block-id-display');
    if(el && txt) {
        // Simple color approximation for now, or copy from tileset
        // Ideally we draw the tile to a canvas inside 'el'
        el.innerHTML = '';
        const c = document.createElement('canvas'); c.width=32; c.height=32;
        const cx = c.getContext('2d');
        const cols = tileset.width / 16;
        cx.imageSmoothingEnabled = false;
        cx.drawImage(tileset, (id % cols)*16, Math.floor(id/cols)*16, 16, 16, 0, 0, 32, 32);
        el.appendChild(c);
        txt.innerText = `ID: ${id}`;
    }
}

async function loadTileset(path) {
    if (path === 'WORLD_PIXEL_ART') {
        tileset = await combineWorldPixelArt();
    } else {
        tileset.src = path;
        await new Promise(r => tileset.onload = r);
    }
    state.tilesetReady = true;
    initPalette();
}

function initPalette() {
    const pal = document.getElementById('palette');
    pal.innerHTML = '';
    const cols = tileset.width / 16;
    const rows = tileset.height / 16;
    const total = cols * rows;

    for(let i=0; i<total; i++) {
        const d = document.createElement('div');
        d.className = 'palette-item';
        
        const c = document.createElement('canvas'); c.width=16; c.height=16;
        const cx = c.getContext('2d');
        cx.drawImage(tileset, (i % cols)*16, Math.floor(i/cols)*16, 16, 16, 0, 0, 16, 16);
        d.appendChild(c);

        const span = document.createElement('span');
        span.innerText = i;
        d.appendChild(span);

        d.onclick = () => {
            state.selectedTileID = i;
            document.querySelectorAll('.palette-item').forEach(el => el.classList.remove('selected'));
            d.classList.add('selected');
            updateBlockPreview(i);
        };
        pal.appendChild(d);
    }
}

// Copy the robust 2D-to-ISO caching from the Strategy
// Run heavy IsoGenerator tasks in a worker when available to avoid freezing the UI
async function generateTerrainAsync(width, height, config) {
    // Try Web Worker first for non-blocking generation
    if (window.Worker) {
        try {
            return await new Promise((resolve, reject) => {
                const w = new Worker('/iso_generator_worker.js');
                w.onmessage = (ev) => { w.terminate(); if (ev.data && ev.data.error) reject(new Error(ev.data.error)); else resolve(ev.data.result); };
                w.onerror = (err) => { w.terminate(); reject(new Error('Worker failed: ' + (err.message || 'unknown error'))); };
                w.postMessage({ action: 'terrain', width, height, config });
            });
        } catch (workerErr) {
            console.warn('[IsoGen] Worker failed, falling back to sync generation:', workerErr.message);
        }
    }
    // Fallback: synchronous generation on main thread
    const gen = new IsoGenerator();
    return gen.generate(width, height, config);
}

async function generateVegetationAsync(width, height, currentLayers, currentZ, config) {
    if (window.Worker) {
        try {
            return await new Promise((resolve, reject) => {
                const w = new Worker('/iso_generator_worker.js');
                w.onmessage = (ev) => { w.terminate(); if (ev.data && ev.data.error) reject(new Error(ev.data.error)); else resolve(ev.data.result); };
                w.onerror = (err) => { w.terminate(); reject(new Error('Worker failed: ' + (err.message || 'unknown error'))); };
                w.postMessage({ action: 'vegetation', width, height, currentLayers, currentZ, config });
            });
        } catch (workerErr) {
            console.warn('[IsoGen] Vegetation worker failed, falling back to sync:', workerErr.message);
        }
    }
    const gen = new IsoGenerator();
    return gen.generateVegetation(width, height, currentLayers, currentZ, config);
}

async function combineWorldPixelArt() {
    const tempCanvas = document.createElement('canvas');
    const tSize = 16;
    const cols = 16;
    const totalTiles = 600; 
    const rows = Math.ceil(totalTiles / cols);
    tempCanvas.width = cols * tSize;
    tempCanvas.height = rows * tSize;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.imageSmoothingEnabled = false;

    const promises = [];
    for (let i = 1; i <= totalTiles; i++) {
        promises.push(new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const x = ((i - 1) % cols) * tSize;
                const y = Math.floor((i - 1) / cols) * tSize;
                tCtx.drawImage(img, x, y, tSize, tSize);
                resolve();
            };
            img.onerror = () => resolve();
            img.src = `sprite-art/worldpixelart/texture_16px%20${i}.png`;
        }));
    }
    await Promise.all(promises);
    return tempCanvas;
}

// --- CORE RENDERER ---
function render() {
    if (!state.tilesetReady) return;

    // Determine target context based on FX preview state
    const targetCtx = (state.fxPreview && fxCanvas) ? fxCtx : ctx;
    const targetCanvas = (state.fxPreview && fxCanvas) ? fxCanvas : canvas;

    // Clear and render base scene
    targetCtx.fillStyle = '#080808';
    targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

    // FX Background (atmosphere/sky gradient)
    if (state.fxPreview && fxSystem) {
        fxSystem.renderBackground(targetCtx);
    }

    // Use IsoStrategy logic for map rendering
    state.strategy.render(targetCtx, map, {
        ...state,
        isoHeight: state.currentZ,
        showGrid: document.getElementById('show-grid').checked,
        show3DGuides: document.getElementById('show-guides').checked
    }, CONFIG, tileset, window.SPRITES);

    // Phase 9: AI Ghost Visualization
    if (state.aiGhost) {
        const { x, y, z } = state.aiGhost;
        const dims = getDims();
        const screen = state.strategy.project(x, y, z, CONFIG, state, canvas);
        
        targetCtx.save();
        targetCtx.globalAlpha = 0.5;
        targetCtx.fillStyle = '#f1c40f'; // IRAB Gold
        targetCtx.strokeStyle = '#fff';
        targetCtx.lineWidth = 2;
        targetCtx.setLineDash([2, 2]);
        
        // Draw simple iso diamond for ghost
        targetCtx.beginPath();
        targetCtx.moveTo(screen.x, screen.y - dims.h/2);
        targetCtx.lineTo(screen.x + dims.w/2, screen.y);
        targetCtx.lineTo(screen.x, screen.y + dims.h/2);
        targetCtx.lineTo(screen.x - dims.w/2, screen.y);
        targetCtx.closePath();
        targetCtx.fill();
        targetCtx.stroke();
        
        // Add "THINKING" text
        targetCtx.globalAlpha = 1.0;
        targetCtx.fillStyle = '#fff';
        targetCtx.font = '10px monospace';
        targetCtx.textAlign = 'center';
        targetCtx.fillText("IRAB INTENT", screen.x, screen.y - dims.h);
        
        targetCtx.restore();
    }
    
    // FX World layer (particles) and Screen layer (lighting/weather)
    if (state.fxPreview && fxSystem) {
        // Update FX system (for animations)
        fxSystem.update(16); // ~60fps delta
        
        // Render world-space effects
        targetCtx.save();
        targetCtx.translate(targetCanvas.width / 2 + state.camX, targetCanvas.height / 4 + state.camY);
        fxSystem.renderWorld(targetCtx);
        targetCtx.restore();
        
        // Render screen-space effects (lighting overlay)
        fxSystem.renderScreen(targetCtx);
    }
    
    // Apply WebGL shaders if preview enabled
    if (state.fxPreview && shaderSystem && shaderSystem.isSupported()) {
        // Render shaders from fxCanvas to main canvas
        shaderSystem.render(fxCanvas);
        
        // Copy shader output to main canvas
        ctx.drawImage(shaderSystem.canvas, 0, 0);
    } else if (state.fxPreview && fxCanvas) {
        // No shaders, just copy FX canvas to main
        ctx.drawImage(fxCanvas, 0, 0);
    }
}

function loop() {
    if (window.keys) {
        const speed = 10 / state.zoom;
        if (keys['KeyW'] || keys['ArrowUp']) state.camY += speed;
        if (keys['KeyS'] || keys['ArrowDown']) state.camY -= speed;
        if (keys['KeyA'] || keys['ArrowLeft']) state.camX += speed;
        if (keys['KeyD'] || keys['ArrowRight']) state.camX -= speed;
    }
    render();
    requestAnimationFrame(loop);
}

function toggleSection(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('i');
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.className = 'fas fa-chevron-down';
    } else {
        content.style.display = 'none';
        icon.className = 'fas fa-chevron-right';
    }
}
window.toggleSection = toggleSection;

window.toggleInspector = (force) => {
    const el = document.getElementById('inspector-container');
    const btn = document.getElementById('inspector-handle');
    const currentW = el.style.width; 
    // If width is empty, it's default (280px from CSS), so it's OPEN.
    const isCollapsed = el.style.width === '12px'; 
    
    let shouldOpen = isCollapsed;
    if (typeof force === 'boolean') shouldOpen = force;
    
    el.style.width = shouldOpen ? '280px' : '12px';
    btn.innerText = shouldOpen ? '⏵' : '⏴';
};
window.saveToServer = async () => {
    let nameInput = document.getElementById('level-name');
    let name = nameInput.value;
    if (!name || name.trim() === "") {
        name = prompt("Enter world name:", "iso_world_1");
        if (!name) return;
        nameInput.value = name;
    }
    
    // Ensure .json extension for logic consistency
    if (!name.endsWith('.json')) name += '.json';
    
    map.name = name.replace('.json', '');
    map.tilesetPath = CONFIG.tilesetPath;
    
    // Mark as iso-pixel engine type for campaign system
    map.engineType = 'iso-pixel';
    map.type = 'iso-pixel'; // Keep existing type field
    
    // Include FX configuration in save data
    map.fx = {
        scenePreset: state.fx.scenePreset,
        lighting: { ...state.fx.lighting },
        shader: { ...state.fx.shader }
    };
    
    // Include placed lights
    map.lights = state.fx.lights || [];
    
    // Add metadata
    map.savedAt = new Date().toISOString();

    try {
        const payload = JSON.stringify(map);
        const res = await fetch(`/api/levels/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        if (res.ok) {
            // Flash save button
            const btn = document.querySelector('button[title="Save"]');
            if(btn) {
                const oldHTML = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check" style="color:#2ecc71"></i>';
                setTimeout(() => btn.innerHTML = oldHTML, 1000);
            }
            // Refresh worlds list if visible
            refreshWorldsList();
            console.log(`Saved world: ${map.name}`);
        } else {
            alert("Save failed!");
        }
    } catch (e) { alert("Error saving: " + e.message); }
};

// === WORLD MANAGEMENT (New Bottom Palette) ===

window.refreshWorldsList = async () => {
    const list = document.getElementById('worlds-list');
    if(!list) return;
    list.innerHTML = '<div style="color:#666; font-size:12px;">Loading...</div>';
    try {
        console.log('[IsoEditor] Fetching worlds list...');
        const res = await fetch('/api/files/levels');
        console.log('[IsoEditor] Fetch response:', res.status, res.ok);
        
        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }
        
        const files = await res.json();
        console.log('[IsoEditor] Loaded files:', files);
        
        list.innerHTML = '';
        
        if (files.length === 0) {
            list.innerHTML = '<div style="color:#666; font-size:0.9rem; padding:10px;">No worlds yet. Create one!</div>';
            return;
        }
        
        const currentName = document.getElementById('level-name')?.value || '';
        
        files.forEach(f => {
            const name = f.replace('.json','');
            const card = document.createElement('div');
            card.className = 'asset-card' + (name === currentName ? ' active' : '');
            card.innerHTML = `
                <div class="asset-thumb"><i class="fas fa-globe"></i></div>
                <div class="asset-info">
                    <div class="asset-name">${name}</div>
                    <div class="asset-meta">WORLD</div>
                </div>
                <div class="asset-actions">
                    <button class="action-btn" title="Delete World" onclick="deleteWorld('${f}', event)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            card.onclick = () => loadWorld(f);
            list.appendChild(card);
        });
    } catch(e) { 
        console.error('[IsoEditor] Error refreshing worlds list:', e);
        list.innerHTML = '<div style="color:#c0392b;">Error loading worlds: ' + e.message + '</div>'; 
    }
};

window.deleteWorld = async (filename, e) => {
    if(e) e.stopPropagation();
    if(!confirm(`Are you sure you want to delete world '${filename}'? This cannot be undone.`)) return;
    
    try {
        const res = await fetch(`/api/levels/${filename}`, { method: 'DELETE' });
        if(res.ok) {
            refreshWorldsList();
        } else {
            alert("Failed to delete world.");
        }
    } catch(err) { console.error(err); alert("Error deleting world."); }
};

window.loadWorld = async (filename) => {
    try {
        const res = await fetch(`/dunyalar/${filename}`);
        if(res.ok) {
            const data = await res.json();
            map = data;
            document.getElementById('level-name').value = map.name || filename.replace('.json','');
            
            // Restore arrays if needed
            if(!map.z) map.z = [];
            if(!map.shapes) map.shapes = [];
            if(!map.lights) map.lights = [];
            
            while(map.layers.length > map.z.length) map.z.push(new Array(map.width*map.height).fill(0));
            while(map.layers.length > map.shapes.length) map.shapes.push(new Array(map.width*map.height).fill(0));
            
            // Load FX config if present
            if (map.fx && state.fx) {
                Object.assign(state.fx, map.fx);
                syncLightingUI();
                syncShaderUI();
            }
            
            // Load placed lights
            if (map.lights && map.lights.length > 0) {
                state.fx.lights = map.lights;
                updateLightsList();
            }
            
            state.activeLayer = 0;
            updateLayerList();
            render();
            
            // Update active card in worlds list
            document.querySelectorAll('.asset-card').forEach(card => {
                const cardName = card.querySelector('.asset-name')?.textContent;
                card.classList.toggle('active', cardName === map.name);
            });
            
            console.log("Loaded world:", map.name);
        }
    } catch(e) { console.error(e); alert("Failed to load world"); }
};

window.createNewWorld = () => {
    if(!confirm("Create new world? Unsaved changes will be lost.")) return;
    
    const name = prompt("World name:", "new_world_" + Date.now());
    if (!name) return;
    
    map = {
        name: name,
        width: 30, height: 30,
        type: 'iso-pixel',
        engineType: 'iso-pixel', // For campaign system
        layers: [new Array(30*30).fill(null)],
        z: [new Array(30*30).fill(0)],
        shapes: [new Array(30*30).fill(0)],
        decorations: [],
        lights: [],
        spawn: { x: 15, y: 15, z: 0 },
        fx: { ...state.fx }
    };
    
    document.getElementById('level-name').value = name;
    state.activeLayer = 0;
    state.fx.lights = [];
    updateLayerList();
    updateLightsList();
    render();
    console.log("Created new world:", name);
};

window.saveCurrentWorld = async () => {
    await saveToServer();
};

window.saveWorldAs = async () => {
    const name = prompt("Save world as:", document.getElementById('level-name')?.value || 'world');
    if (!name) return;
    
    document.getElementById('level-name').value = name;
    map.name = name;
    await saveToServer();
};

// Legacy function for backwards compat
window.loadLevelList = window.refreshWorldsList;
window.loadLevelFromServer = window.loadWorld;

window.playtest = () => {
    map.tilesetPath = CONFIG.tilesetPath;
    sessionStorage.setItem('ketebe_playtest_data', JSON.stringify(map));
    window.open('iso_play.html', '_blank', 'width=1280,height=720');
};

window.newMap = () => {
    if(!confirm("Create new map? Unsaved changes will be lost.")) return;
    map = {
        width: 30, height: 30,
        type: 'iso-pixel',
        engineType: 'iso-pixel', // For campaign system
        layers: [new Array(30*30).fill(null)],
        z: [new Array(30*30).fill(0)],
        shapes: [new Array(30*30).fill(0)],
        decorations: [], lights: []
    };
    document.getElementById('level-name').value = 'new_world';
    state.activeLayer = 0;
    updateLayerList();
    render();
};

window.downloadJSON = () => {
    const name = (map.name || 'iso_map') + '.json';
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
};

// --- RESIZE LOGIC ---
function resizeMap(newW, newH) {
    if (newW === map.width && newH === map.height) return;
    console.log(`[IsoStudio] Resizing map to ${newW}x${newH}`);

    const oldW = map.width;
    const oldH = map.height;

    // Resize all layer arrays
    for (let l = 0; l < map.layers.length; l++) {
        const newLayer = new Array(newW * newH).fill(null);
        const newZ = new Array(newW * newH).fill(0);
        const newShapes = new Array(newW * newH).fill(0);

        for (let y = 0; y < Math.min(oldH, newH); y++) {
            for (let x = 0; x < Math.min(oldW, newW); x++) {
                const oldIdx = y * oldW + x;
                const newIdx = y * newW + x;
                
                newLayer[newIdx] = map.layers[l][oldIdx];
                newZ[newIdx] = map.z[l][oldIdx];
                newShapes[newIdx] = map.shapes[l][oldIdx];
            }
        }
        map.layers[l] = newLayer;
        map.z[l] = newZ;
        map.shapes[l] = newShapes;
    }

    // Filter out of bounds entities
    if (map.decorations) {
        map.decorations = map.decorations.filter(d => d.x < newW && d.y < newH);
    }
    if (map.lights) {
        map.lights = map.lights.filter(l => l.x < newW && l.y < newH);
    }

    map.width = newW;
    map.height = newH;
    map.occlusionDirty = true;
    
    // Invalidate strategy caches
    if (state.strategy && state.strategy.invalidateChunks) {
        state.strategy.invalidateChunks();
    }
    
    render();
}

// --- HELPERS ---
function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    ctx.imageSmoothingEnabled = false;
    resizeFXSystems();
    render();
}
window.resize = resize; // Expose globally for toggle handlers

function centerView() {
    state.camX = 0;
    state.camY = 0;
    render();
}

function setTool(t) {
    state.tool = t;
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${t}`).classList.add('active');
}

// --- INPUTS ---
function onMouseDown(e) {
    if (e.button === 1 || e.button === 2) {
        state.isPanning = true;
        state.lastMouse = { x: e.clientX, y: e.clientY };
    } else if (e.button === 0) {
        state.isDrawing = true;
        paint();
    }
}

function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const coords = state.strategy.screenToMap(e.clientX, e.clientY, CONFIG, rect, state);
    state.mouseMapPos = coords;
    document.getElementById('coord-display').innerText = `X: ${coords.x}, Y: ${coords.y}, Z: ${state.currentZ}`;

    if (state.isPanning) {
        state.camX += e.clientX - state.lastMouse.x;
        state.camY += e.clientY - state.lastMouse.y;
        state.lastMouse = { x: e.clientX, y: e.clientY };
    } else if (state.isDrawing) {
        paint();
    }
}

function onMouseUp() {
    state.isDrawing = false;
    state.isPanning = false;
}

function placeAtLayer(layerIdx, idx) {
    // Ensure arrays exist for this layer
    while(map.layers.length <= layerIdx) {
        map.layers.push(new Array(map.width * map.height).fill(null));
        map.z.push(new Array(map.width * map.height).fill(0));
        map.shapes.push(new Array(map.width * map.height).fill(0));
    }
    
    if (state.mode === 'geo') {
        // GEO MODE: Update Z and Shape. Keep Texture if it exists.
        // If Texture is null, we must set it (otherwise it's invisible), so we set selectedTileID.
        if (map.layers[layerIdx][idx] === null || map.layers[layerIdx][idx] === undefined) {
            map.layers[layerIdx][idx] = state.selectedTileID;
        }
        map.z[layerIdx][idx] = state.currentZ;
        map.shapes[layerIdx][idx] = state.selectedShape;
    } else {
        // VIS MODE (Default): Update Everything
        map.layers[layerIdx][idx] = state.selectedTileID;
        map.z[layerIdx][idx] = state.currentZ;
        map.shapes[layerIdx][idx] = state.selectedShape;
    }
    map.occlusionDirty = true;
    if (state.strategy && state.strategy.invalidateChunks) {
        const { x, y } = state.mouseMapPos;
        state.strategy.invalidateChunks(x, y);
    }
}

function paint() {
    const { x, y } = state.mouseMapPos;
    if (x < 0 || x >= map.width || y < 0 || y >= map.height) return;

    const idx = y * map.width + x;

    if (state.tool === 'block') {
        // --- SMART LAYER LOGIC ---
        // 1. Try to place on the Active Layer first (if empty or same Z)
        let targetLayer = state.activeLayer;
        let currentTile = map.layers[targetLayer][idx];
        let currentZ = map.z[targetLayer][idx];

        // If active layer is empty OR has a block at the exact same Z (overwrite)
        if (currentTile === null || currentTile === undefined || currentZ === state.currentZ) {
            placeAtLayer(targetLayer, idx);
            return;
        }

        // 2. If Active Layer is occupied by a DIFFERENT Z, search other layers
        // Priority: Find a layer that already has a block at this Z (overwrite it)
        let bestLayer = -1;
        
        for (let l = 0; l < map.layers.length; l++) {
            if (l === state.activeLayer) continue;
            const t = map.layers[l][idx];
            const z = map.z[l][idx];
            if (t !== null && t !== undefined && z === state.currentZ) {
                bestLayer = l;
                break;
            }
        }

        // 3. If no overwrite candidate, find an EMPTY slot
        if (bestLayer === -1) {
             for (let l = 0; l < map.layers.length; l++) {
                if (l === state.activeLayer) continue;
                const t = map.layers[l][idx];
                if (t === null || t === undefined) {
                    bestLayer = l;
                    break;
                }
            }
        }

        // 4. If still no slot, create a NEW layer
        if (bestLayer === -1) {
            window.addLayer(); // Adds layer and updates UI
            bestLayer = map.layers.length - 1; 
        }

        placeAtLayer(bestLayer, idx);

    } else if (state.tool === 'prefab') {
        // Remove existing at this spot
        map.decorations = map.decorations.filter(d => d.x !== x || d.y !== y);
        map.decorations.push({ x, y, type: 'prefab', data: state.selectedPrefab });
    } else if (state.tool === 'npc') {
        // Remove existing at this spot
        map.decorations = map.decorations.filter(d => d.x !== x || d.y !== y);
        map.decorations.push({ x, y, z: state.currentZ, type: 'npc', id: state.selectedNPC });
    } else if (state.tool === 'prop') {
        // Place Prop
        map.decorations = map.decorations.filter(d => d.x !== x || d.y !== y);
        map.decorations.push({ x, y, z: state.currentZ, type: state.selectedProp });
    } else if (state.tool === 'collision') {
        // Init collision layer if missing
        if (!map.collision) map.collision = new Array(map.width * map.height).fill(0);
        map.collision[idx] = state.selectedCollisionType;
    } else if (state.tool === 'light') {
        // Use new soft light system
        placeLight(x, y);
    } else if (state.tool === 'eraser') {
        // Z-Aware Eraser: Only erase blocks at the current Z level across ALL layers
        // This is safer than indiscriminately erasing the active layer's block which might be at a different Z
        let erasedSomething = false;
        
        for (let l = 0; l < map.layers.length; l++) {
            const t = map.layers[l][idx];
            const z = map.z[l][idx];
            if (t !== null && t !== undefined && z === state.currentZ) {
                map.layers[l][idx] = null;
                map.z[l][idx] = 0;
                erasedSomething = true;
            }
        }
        if(erasedSomething) {
            map.occlusionDirty = true;
            if (state.strategy && state.strategy.invalidateChunks) {
                state.strategy.invalidateChunks(x, y);
            }
        }

        // If no block was found at this Z, maybe the user wants to erase decorations/lights?
        map.decorations = map.decorations.filter(d => d.x !== x || d.y !== y);
        if(map.lights) map.lights = map.lights.filter(l => l.x !== x || l.y !== y || l.z !== state.currentZ);
    }
}

function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    state.zoom = Math.max(0.2, Math.min(4, state.zoom + delta));
    document.getElementById('zoom-level').innerText = Math.round(state.zoom * 100) + '%';
}
