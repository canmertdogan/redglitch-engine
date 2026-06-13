/**
 * RedGlitch Engine - Game Studio IDE Core
 * Orchestrates window management, tools, projects, and system status.
 */

const tools = [
    // SYSTEM
    { id: 'dashboard', category: 'SYSTEM', title: 'Launcher', icon: 'fa-rocket', src: 'dashboard.html', w: 900, h: 700 },
    { id: 'project_dashboard', category: 'SYSTEM', title: 'Command Center', icon: 'fa-tachometer-alt', src: 'project_dashboard.html', w: 1000, h: 600 },
    { id: 'menu', category: 'SYSTEM', title: 'Interface (UI)', icon: 'fa-window-restore', src: 'menu_editor.html', w: 1280, h: 760 },
    { id: 'loc', category: 'SYSTEM', title: 'Localization', icon: 'fa-globe', src: 'localization_editor.html', w: 900, h: 600 },
    { id: 'input', category: 'SYSTEM', title: 'Input Map', icon: 'fa-gamepad', src: 'input_editor.html', w: 600, h: 600 },
    { id: 'console', category: 'SYSTEM', title: 'System Logs', icon: 'fa-terminal', src: 'console.html', w: 800, h: 500 },
    
    // WORLD ARCHITECT
    { id: 'editor', category: 'WORLD ARCHITECT', title: 'Level Editor', icon: 'fa-map', src: 'editor.html', w: 1000, h: 700 },
    { id: 'studio_3d', category: 'WORLD ARCHITECT', title: '3D Studio', icon: 'fa-cube', src: 'editor3d.html', w: 1400, h: 900 },
    { id: 'iso_studio', category: 'WORLD ARCHITECT', title: 'IsoPixel Studio', icon: 'fa-cubes', src: 'iso_editor.html', w: 1000, h: 700 },
    { id: 'platformer_studio', category: 'WORLD ARCHITECT', title: 'Platformer Studio', icon: 'fa-running', src: 'platformer_editor.html', w: 1200, h: 800 },
    { id: 'background', category: 'WORLD ARCHITECT', title: 'Backgrounds', icon: 'fa-image', src: 'background_editor.html', w: 900, h: 600 },
    { id: 'campaign', category: 'WORLD ARCHITECT', title: 'Campaign Flow', icon: 'fa-flag', src: 'campaign_editor.html', w: 800, h: 500 },
    
    // ENTITIES
    { id: 'prefab', category: 'ENTITIES', title: 'Prefab Builder', icon: 'fa-cubes', src: 'prefab_editor.html', w: 800, h: 600 },
    { id: 'npc', category: 'ENTITIES', title: 'NPC Editor', icon: 'fa-user-friends', src: 'npc_editor.html', w: 700, h: 500 },
    { id: 'enemy', category: 'ENTITIES', title: 'Enemy Editor', icon: 'fa-skull', src: 'enemy_editor.html', w: 700, h: 500 },
    { id: 'item', category: 'ENTITIES', title: 'Item Database', icon: 'fa-scroll', src: 'item_editor.html', w: 700, h: 500 },
    { id: 'character', category: 'ENTITIES', title: 'Player Profiles', icon: 'fa-user-ninja', src: 'character_editor.html', w: 700, h: 500 },
    { id: 'skill', category: 'ENTITIES', title: 'Skills', icon: 'fa-bolt', src: 'skill_editor.html', w: 700, h: 500 },
    { id: 'achievements', category: 'ENTITIES', title: 'Trophies', icon: 'fa-trophy', src: 'achievements_editor.html', w: 700, h: 500 },
    
    // LOGIC & AI
    { id: 'script', category: 'LOGIC & AI', title: 'Script Editor', icon: 'fa-code', src: 'script_editor.html', w: 1000, h: 700 },
    { id: 'algorithm', category: 'LOGIC & AI', title: 'Node Logic', icon: 'fa-project-diagram', src: 'algorithm_editor.html', w: 1000, h: 700 },
    { id: 'behavior', category: 'LOGIC & AI', title: 'AI Brains', icon: 'fa-brain', src: 'behavior_editor.html', w: 900, h: 600 },
    { id: 'quests', category: 'LOGIC & AI', title: 'Quest Designer', icon: 'fa-exclamation-circle', src: 'quest_editor.html', w: 900, h: 600 },
    { id: 'dialogue', category: 'LOGIC & AI', title: 'Dialogues', icon: 'fa-comments', src: 'dialogue_editor.html', w: 800, h: 500 },
    { id: 'interactive_cutscene', category: 'LOGIC & AI', title: 'Cutscene Studio', icon: 'fa-theater-masks', src: 'interactive_cutscene_editor.html', w: 1200, h: 800 },
    
    // ASSETS
    { id: 'daw', category: 'ASSETS', title: 'Audio Studio', icon: 'fa-music', src: 'daw.html', w: 800, h: 500 },
    { id: 'pixel', category: 'ASSETS', title: 'Pixel Art', icon: 'fa-paint-brush', src: 'pixel_editor.html', w: 900, h: 650 },
    { id: 'fxpro', category: 'ASSETS', title: 'FX Master', icon: 'fa-magic', src: 'fx_editor.html', w: 900, h: 650 },
    { id: 'shader', category: 'ASSETS', title: 'Shader Lab', icon: 'fa-eye', src: 'shader_editor.html', w: 1000, h: 700 },
    { id: 'assets', category: 'ASSETS', title: 'File Manager', icon: 'fa-folder', src: 'asset_manager.html', w: 900, h: 600 }
];

let zIndexCounter = 100;
let focusedWinId = null;
let snapMode = null;
let diagnostics = { errors: 0, warnings: 0 };
let logBuffer = [];

// --- DRAGGABLE WORKSPACE STATE ---
let workspacePan = { x: 0, y: 0 };
let isPanning = false;
let lastPanX, lastPanY;

function updateWorkspaceTransform() {
    const canvas = document.getElementById('workspace-canvas');
    if (canvas) {
        canvas.style.transform = `translate3d(${workspacePan.x}px, ${workspacePan.y}px, 0)`;
    }
}

// --- WORKSPACE V2.0 (High Performance) ---
let backgroundParticles = [];
function initWorkspaceV2() {
    const bgCanvas = document.getElementById('studio-bg-canvas');
    if (bgCanvas) {
        window.addEventListener('resize', () => {
            bgCanvas.width = bgCanvas.offsetWidth;
            bgCanvas.height = bgCanvas.offsetHeight;
        });
        bgCanvas.width = bgCanvas.offsetWidth;
        bgCanvas.height = bgCanvas.offsetHeight;
        
        for(let i=0; i<50; i++) {
            backgroundParticles.push({
                x: Math.random() * bgCanvas.width,
                y: Math.random() * bgCanvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 0.5 + 0.2
            });
        }
        requestAnimationFrame(workspaceLoop);
    }
}

function workspaceLoop() {
    const bgCanvas = document.getElementById('studio-bg-canvas');
    
    if (bgCanvas) {
        const ctx = bgCanvas.getContext('2d');
        ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        
        const gridSize = 60;
        const offsetX = workspacePan.x % gridSize;
        const offsetY = workspacePan.y % gridSize;
        
        ctx.strokeStyle = 'rgba(255, 30, 39, 0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let x = offsetX; x < bgCanvas.width; x += gridSize) {
            ctx.moveTo(x, 0); ctx.lineTo(x, bgCanvas.height);
        }
        for(let y = offsetY; y < bgCanvas.height; y += gridSize) {
            ctx.moveTo(0, y); ctx.lineTo(bgCanvas.width, y);
        }
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 30, 39, 0.06)';
        backgroundParticles.forEach(p => {
            p.y += p.speed;
            if(p.y > bgCanvas.height) p.y = 0;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
    }
    
    requestAnimationFrame(workspaceLoop);
}

function tileWindows() {
    const windows = Array.from(document.querySelectorAll('.window')).filter(w => w.style.display !== 'none');
    if (windows.length === 0) return;
    
    const cols = Math.ceil(Math.sqrt(windows.length));
    const gutter = 40;
    const winW = (window.innerWidth - (cols + 1) * gutter) / cols;
    const winH = (window.innerHeight - (Math.ceil(windows.length / cols) + 1) * gutter) / Math.ceil(windows.length / cols);
    
    windows.forEach((w, i) => {
        w.classList.remove('maximized');
        const col = i % cols;
        const row = Math.floor(i / cols);
        w.style.width = Math.max(400, winW) + 'px';
        w.style.height = Math.max(300, winH) + 'px';
        w.style.left = (gutter + col * (winW + gutter)) - workspacePan.x + 'px';
        w.style.top = (gutter + row * (winH + gutter)) - workspacePan.y + 'px';
    });
}

let currentBuildTarget = 'win';
let selectedTemplateId = null;
let fileTreeData = [];
let expandedDirs = new Set();
let dragTarget = null;
let offX, offY;
let runtimeWindow = null;
let runtimeWatchTimer = null;

// --- BUILD WIZARD STATE ---
let bwTarget = 'win';
let bwSSE = null;
let bwProgress = 0;
let bwProgressInterval = null;

function formatProjectName(name) {
    if (!name) return "";
    let display = name.toUpperCase();
    if (display.length > 15) {
        display = display.substring(0, 15) + "...";
    }
    return display;
}

function updateTitlebarProjectLabel(name, isRoot = false) {
    const el = document.getElementById('titlebar-project');
    if (!el) return;
    el.textContent = isRoot ? 'COMMAND CENTER' : `PROJECT • ${formatProjectName(name)}`;
}

async function studioInit() {
    console.log("[Studio] Initializing Legacy Kernel...");
    // Populate Sidebar with Categories
    const list = document.getElementById('module-list');
    if (list) {
        console.log("[Studio] Populating sidebar...");
        list.innerHTML = '';
        const categories = ['WORLD ARCHITECT', 'ENTITIES', 'LOGIC & AI', 'ASSETS', 'SYSTEM'];
        const grouped = {};
        
        tools.forEach(t => {
            if(!grouped[t.category]) grouped[t.category] = [];
            grouped[t.category].push(t);
        });
        
        categories.forEach(cat => {
            if(grouped[cat]) {
                const catDiv = document.createElement('div');
                catDiv.className = 'tool-category';
                catDiv.innerHTML = `<div class="cat-title">${cat}</div>`;
                
                grouped[cat].forEach(tool => {
                    const btn = document.createElement('div');
                    btn.className = 'tool-btn-sidebar';
                    btn.id = 'btn-' + tool.id;
                    btn.innerHTML = `<div><i class="fas ${tool.icon}"></i> ${tool.title.toLowerCase()}</div>`;
                    btn.onclick = () => {
                        openWindow(tool);
                        if (window.KAI && window.KAI.showBalloon) {
                            const tips = {
                                'platformer_studio': ">> SUGGESTION: EXECUTE PROCEDURAL_LEVEL_GENERATOR.EXE",
                                'script': ">> ANALYZING CODE... SYNTAX_EFFICIENCY: 84%. NEED OPTIMIZATION?",
                                'pixel': ">> PIXEL_DENSITY_OPTIMAL. READY FOR MASTERPIECE_INIT.SH",
                                'npc': ">> DETECTED VACANT_NPC_BRAINS. UPLOADING HEURISTICS...",
                                'daw': ">> DISCOVERING GAME EVENTS... AUDIO_MAPPINGS OPTIMIZED. READY FOR SPATIAL_MIXING."
                            };
                            if (tips[tool.id]) window.KAI.showBalloon(tips[tool.id]);
                        }
                    };
                    catDiv.appendChild(btn);
                });
                list.appendChild(catDiv);
            }
        });
    }

    updateClock();
    setInterval(updateClock, 60000);

    await determineStartupWindow();

    setInterval(updateSystemMeter, 3000);
    updateSystemMeter();
    
    initWorkspaceV2();
    
    hookConsole();
    window.addEventListener('message', handleChildMessage);
}

async function determineStartupWindow() {
    console.log("[Studio] Determining startup window...");
    try {
        const res = await fetch('/api/projects/current');
        if (!res.ok) throw new Error("API not ready");
        const data = await res.json();
        const projName = data.name;
        console.log("[Studio] Active Project:", projName);
        window._redglitchActiveProject = projName;
        updateTitlebarProjectLabel(projName, data.isRoot);
        
        const projNameEl = document.getElementById('sb-project-name');
        if (projNameEl) projNameEl.innerText = formatProjectName(projName);

        if (data.isRoot || !projName || projName === 'ROOT') {
            console.log("[Studio] No project active (Root), redirecting to Launcher...");
            window.location.href = 'dashboard.html';
        } else {
            console.log("[Studio] Project active, opening Command Center...");
            const dashboardTool = tools.find(t => t.id === 'project_dashboard');
            if (dashboardTool) {
                openWindow(dashboardTool);
            } else {
                console.warn("[Studio] project_dashboard tool not found in registry.");
            }
        }

    } catch(e) {
        console.error("[Studio] Startup error:", e);
        console.log("[Studio] Redirecting to dashboard due to error...");
        window.location.href = 'dashboard.html';
    }
}

window.onProjectLoaded = function(name) {
    const launcherId = 'win-dashboard';
    const launcherWin = document.getElementById(launcherId);
    if(launcherWin) closeWindow(launcherId);

    const projNameEl = document.getElementById('sb-project-name');
    if (projNameEl) projNameEl.innerText = formatProjectName(name);
    updateTitlebarProjectLabel(name, false);

    const cmdCenter = tools.find(t => t.id === 'project_dashboard');
    if(cmdCenter) openWindow(cmdCenter);
};

function hookConsole() {
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalLog = console.log;
    
    function capture(msg, level, source='IDE') {
        const entry = { message: msg, level: level, source: source, timestamp: Date.now() };
        logBuffer.push(entry);
        if (logBuffer.length > 500) logBuffer.shift();
        
        const consoleFrame = document.getElementById('frame-console');
        if (consoleFrame && consoleFrame.contentWindow) {
            consoleFrame.contentWindow.postMessage({ type: 'log', ...entry }, '*');
        }
    }
    
    console.error = function(...args) {
        diagnostics.errors++;
        updateDiagnosticsUI();
        const msg = args.map(a => String(a)).join(' ');
        capture(msg, 'error');
        if (window.RedGlitchEventBus) window.RedGlitchEventBus.emit('editor:error', { message: msg });
        originalError.apply(console, args);
    };
    
    console.warn = function(...args) {
        diagnostics.warnings++;
        updateDiagnosticsUI();
        capture(args.map(a => String(a)).join(' '), 'warning');
        originalWarn.apply(console, args);
    };
    
    console.log = function(...args) {
        capture(args.map(a => String(a)).join(' '), 'info');
        originalLog.apply(console, args);
    };
}

function updateDiagnosticsUI() {
    const errEl = document.getElementById('sb-errors');
    const warnEl = document.getElementById('sb-warnings');
    if (errEl) errEl.innerText = diagnostics.errors;
    if (warnEl) warnEl.innerText = diagnostics.warnings;
}

function handleChildMessage(event) {
    const data = event.data;
    if (!data) return;
    
    if (data.type === 'cursor-update') {
        const curEl = document.getElementById('sb-cursor-pos');
        if (curEl) curEl.innerText = `Ln ${data.line}, Col ${data.col}`;
    } else if (data.type === 'status-message') {
        showStatusMessage(data.message);
    } else if (data.type === 'log') {
        if (data.level === 'error') { diagnostics.errors++; updateDiagnosticsUI(); }
        else if (data.level === 'warning') { diagnostics.warnings++; updateDiagnosticsUI(); }
        
        const entry = { message: data.message, level: data.level, source: 'GAME', timestamp: Date.now() };
        logBuffer.push(entry);
        if (logBuffer.length > 500) logBuffer.shift();

        const consoleFrame = document.getElementById('frame-console');
        if (consoleFrame && consoleFrame.contentWindow) {
            consoleFrame.contentWindow.postMessage({ type: 'log', ...entry }, '*');
        }
    }
}

function showStatusMessage(msg) {
    const el = document.getElementById('sb-message');
    if (!el) return;
    el.innerText = msg;
    el.style.opacity = '1';
    setTimeout(() => {
        el.innerText = 'redglitch STUDIO READY';
        el.style.opacity = '0.8';
    }, 3000);
}

async function updateSystemMeter() {
    try {
        const res = await fetch('/api/system/stats');
        const stats = await res.json();
        const cpuEl = document.getElementById('sb-cpu');
        const memEl = document.getElementById('sb-mem');
        if (cpuEl) cpuEl.innerText = Math.round(stats.cpu || 0) + '%';
        if (memEl) memEl.innerText = (stats.mem || 0) + 'M';
    } catch(e) {}
}

function applyTheme(themeName, options = {}) {
    if (typeof window.setTheme === 'function') {
        window.setTheme(themeName);
    } else {
        localStorage.setItem('redglitch_theme', themeName);
    }

    if (options.broadcast !== false) {
        document.querySelectorAll('#window-container iframe').forEach(frame => {
            const child = frame.contentWindow;
            if (child && typeof child.setTheme === 'function') {
                child.setTheme(themeName, { source: 'parent' });
            }
        });
    }
    showStatusMessage(`THEME SET: ${themeName.toUpperCase()}`);
}

// --- WINDOW MANAGEMENT ---
function openWindow(tool) {
    if (!tool) return;
    const winId = 'win-' + tool.id;
    let win = document.getElementById(winId);

    if (!win) {
        win = document.createElement('div');
        win.id = winId;
        win.className = 'window maximized';
        
        win.innerHTML = `
            <div class="window-title" 
                 onmousedown="startDrag(event, '${winId}')"
                 ondblclick="toggleMaximize('${winId}')">
                <div><i class="fas ${tool.icon}"></i> ${tool.title.toLowerCase()}</div>
                <div class="window-controls">
                    <div class="window-btn" onclick="minimizeWindow('${winId}')">_</div>
                    <div class="window-btn" onclick="toggleMaximize('${winId}')">□</div>
                    <div class="window-btn close" onclick="closeWindow('${winId}')">×</div>
                </div>
            </div>
            <div class="window-content">
                <iframe id="frame-${tool.id}" src="${(() => { const proj3dIds = ['studio_3d']; return (proj3dIds.includes(tool.id) && window._redglitchActiveProject) ? tool.src + '?project=' + encodeURIComponent(window._redglitchActiveProject) + '&v=cachebustLayout' : tool.src + '?v=cachebustLayout'; })()}"></iframe>
            </div>
        `;
        win.onmousedown = () => focusWindow(winId);
        
        const container = document.getElementById('workspace-canvas') || document.getElementById('workspace');
        if (container) container.appendChild(win);
        
        const btn = document.getElementById('btn-' + tool.id);
        if (btn) btn.classList.add('opened');
    } else {
        win.style.display = 'flex'; // Restore visibility for Keep-Alive
        const btn = document.getElementById('btn-' + tool.id);
        if (btn) btn.classList.add('opened');
    }
    
    if (window.RedGlitchProjectState) {
        window.RedGlitchProjectState.logActivity('tool', tool.title, { id: tool.id });
    }
    
    if (tool.id === 'console') {
        setTimeout(() => {
            const consoleFrame = document.getElementById('frame-console');
            if (consoleFrame && consoleFrame.contentWindow) {
                logBuffer.forEach(entry => consoleFrame.contentWindow.postMessage({ type: 'log', ...entry }, '*'));
            }
        }, 500);
    }
    
    focusWindow(winId);
}

function closeWindow(id) {
    const win = document.getElementById(id);
    if (win) {
        win.style.display = 'none'; // Keep-Alive: just hide the element
        win.classList.remove('focused');
    }
    const toolId = id.replace('win-', '');
    const btn = document.getElementById('btn-' + toolId);
    if (btn) { 
        btn.classList.remove('opened'); 
        btn.classList.remove('active'); 
    }
}

function minimizeWindow(id) {
    const win = document.getElementById(id);
    if (win) {
        win.style.display = 'none';
        win.classList.remove('focused');
    }
    const btn = document.getElementById('btn-' + id.replace('win-',''));
    if (btn) btn.classList.remove('active');
}

function toggleMaximize(id) {
    const win = document.getElementById(id);
    if (!win) return;
    win.classList.toggle('maximized');
    if (!win.classList.contains('maximized')) {
        win.style.width = '800px'; win.style.height = '600px';
        win.style.top = '50px'; win.style.left = '50px';
    }
}

function focusWindow(id) {
    if (focusedWinId === id) return; // Skip if already focused
    
    document.querySelectorAll('.window').forEach(w => w.classList.remove('focused'));
    document.querySelectorAll('.tool-btn-sidebar').forEach(b => b.classList.remove('active'));
    
    const win = document.getElementById(id);
    if(win) {
        focusedWinId = id;
        win.style.display = 'flex'; 
        win.classList.add('focused');
        win.style.zIndex = ++zIndexCounter;
        const toolId = id.replace('win-', '');
        const btn = document.getElementById('btn-' + toolId);
        if (btn) btn.classList.add('active');
    }
}

// --- DRAG & SNAP ---
function startDrag(e, id) {
    const win = document.getElementById(id);
    if (e.target.classList.contains('window-btn')) return;
    if (win.classList.contains('maximized')) {
        toggleMaximize(id);
        offX = 400; offY = 15;
    } else {
        const rect = win.getBoundingClientRect();
        offX = e.clientX - rect.left;
        offY = e.clientY - rect.top;
    }
    dragTarget = win;
    dragTarget.classList.add('dragging');
    focusWindow(id);
}

window.addEventListener('keydown', (e) => {
    if (e.shiftKey) {
        const speed = 40;
        const key = e.key.toLowerCase();
        let changed = false;
        if (key === 'w') { workspacePan.y += speed; changed = true; }
        if (key === 'a') { workspacePan.x += speed; changed = true; }
        if (key === 's') { workspacePan.y -= speed; changed = true; }
        if (key === 'd') { workspacePan.x -= speed; changed = true; }
        if (changed) {
            e.preventDefault();
            updateWorkspaceTransform();
        }
    }
});

window.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        if (e.target.closest('.window')) return;
        isPanning = true;
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        document.body.style.cursor = 'grabbing';
    }
});

let animationFrameId = null;

window.addEventListener('mousemove', (e) => {
    if (isPanning) {
        const dx = e.clientX - lastPanX;
        const dy = e.clientY - lastPanY;
        workspacePan.x += dx;
        workspacePan.y += dy;
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        updateWorkspaceTransform();
        return;
    }
    
    if (!dragTarget) return;
    
    if (animationFrameId) return;
    
    animationFrameId = requestAnimationFrame(() => {
        if (!dragTarget) {
            animationFrameId = null;
            return;
        }
        const workspace = document.getElementById('workspace');
        const wsRect = workspace.getBoundingClientRect();
        const ghost = document.getElementById('snap-ghost');
        
        let x = e.clientX - offX - wsRect.left;
        let y = e.clientY - offY - wsRect.top;

        const stickDist = 20;
        snapMode = null;
        if (ghost) ghost.style.display = 'none';

        if (e.clientY < 40) {
            snapMode = 'top'; 
            if (ghost) {
                ghost.style.display = 'block';
                ghost.style.top = '0'; ghost.style.left = wsRect.left + 'px';
                ghost.style.width = wsRect.width + 'px'; ghost.style.height = wsRect.height + 'px';
            }
        } else if (e.clientX < wsRect.left + 20) {
            snapMode = 'left';
            if (ghost) {
                ghost.style.display = 'block';
                ghost.style.top = wsRect.top + 'px'; ghost.style.left = wsRect.left + 'px';
                ghost.style.width = (wsRect.width / 2) + 'px'; ghost.style.height = wsRect.height + 'px';
            }
        } else if (e.clientX > wsRect.right - 20) {
            snapMode = 'right';
            if (ghost) {
                ghost.style.display = 'block';
                ghost.style.top = wsRect.top + 'px'; ghost.style.left = (wsRect.left + wsRect.width / 2) + 'px';
                ghost.style.width = (wsRect.width / 2) + 'px'; ghost.style.height = wsRect.height + 'px';
            }
        } 

        if (!snapMode) {
            const others = Array.from(document.querySelectorAll('.window')).filter(w => w !== dragTarget && w.style.display !== 'none');
            others.forEach(other => {
                const r = other.getBoundingClientRect();
                const orX = r.left - wsRect.left, orY = r.top - wsRect.top;
                if (Math.abs(x + dragTarget.offsetWidth - orX) < stickDist) x = orX - dragTarget.offsetWidth;
                if (Math.abs(x - (orX + r.width)) < stickDist) x = orX + r.width;
                if (Math.abs(y + dragTarget.offsetHeight - orY) < stickDist) y = orY - dragTarget.offsetHeight;
                if (Math.abs(y - (orY + r.height)) < stickDist) y = orY + r.height;
            });
            if (Math.abs(x) < stickDist) x = 0;
            if (Math.abs(y) < stickDist) y = 0;
            if (Math.abs(x + dragTarget.offsetWidth - wsRect.width) < stickDist) x = wsRect.width - dragTarget.offsetWidth;
            if (Math.abs(y + dragTarget.offsetHeight - wsRect.height) < stickDist) y = wsRect.height - dragTarget.offsetHeight;
        }
        dragTarget.style.left = x + 'px';
        dragTarget.style.top = y + 'px';
        animationFrameId = null;
    });
});

window.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        document.body.style.cursor = 'default';
    }
    if (dragTarget) {
        dragTarget.classList.remove('dragging');
        if (snapMode) {
            if (snapMode === 'top') toggleMaximize(dragTarget.id);
            else if (snapMode === 'left') {
                dragTarget.classList.remove('maximized');
                dragTarget.style.top = '0'; dragTarget.style.left = '0';
                dragTarget.style.width = '50%'; dragTarget.style.height = '100%';
            } else if (snapMode === 'right') {
                dragTarget.classList.remove('maximized');
                dragTarget.style.top = '0'; dragTarget.style.left = '50%';
                dragTarget.style.width = '50%'; dragTarget.style.height = '100%';
            }
        }
    }
    dragTarget = null; snapMode = null;
    const ghost = document.getElementById('snap-ghost');
    if (ghost) ghost.style.display = 'none';
});

// --- TOOLBAR & UI HELPERS ---
function toggleDropdown(e, id) {
    e.stopPropagation();
    const el = document.getElementById(id);
    const isActive = el.classList.contains('active');
    closeAllDropdowns();
    if (!isActive) el.classList.add('active');
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
}

window.addEventListener('click', () => closeAllDropdowns());

function updateClock() {
    const el = document.getElementById('sb-clock');
    if (el) el.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getOpenEditorFrames() {
    return Array.from(document.querySelectorAll('#window-container iframe'))
        .filter(frame => frame && frame.contentWindow && frame.closest('.window')?.style.display !== 'none');
}

async function runFrameSave(frameWindow) {
    const saveHooks = [
        () => (typeof frameWindow.saveToServer === 'function' ? frameWindow.saveToServer.bind(frameWindow) : null),
        () => (typeof frameWindow.editor?.save === 'function' ? frameWindow.editor.save.bind(frameWindow.editor) : null),
        () => (typeof frameWindow.studio?.save === 'function' ? frameWindow.studio.save.bind(frameWindow.studio) : null),
        () => (typeof frameWindow.app?.save === 'function' ? frameWindow.app.save.bind(frameWindow.app) : null),
        () => (typeof frameWindow.saveActiveFile === 'function' ? frameWindow.saveActiveFile.bind(frameWindow) : null),
        () => (typeof frameWindow.save === 'function' ? frameWindow.save.bind(frameWindow) : null)
    ];

    for (const resolveHook of saveHooks) {
        const invoke = resolveHook();
        if (!invoke) continue;
        try {
            await Promise.resolve(invoke());
            return true;
        } catch (err) {
            console.warn('[Studio] Save hook failed:', err?.message || err);
        }
    }

    // Fallback for editors that only support command dispatch.
    try {
        frameWindow.postMessage({ type: 'execCommand', command: 'save' }, '*');
        frameWindow.postMessage({ type: 'redglitch:save-request' }, '*');
    } catch (err) {
        console.warn('[Studio] Save fallback postMessage failed:', err?.message || err);
    }

    return false;
}

async function saveGlobalProject(options = {}) {
    const silent = !!options.silent;
    if (!silent) showStatusMessage("SAVING PROJECT...");

    const frames = getOpenEditorFrames();
    if (frames.length === 0) {
        if (!silent) showStatusMessage("NO OPEN TOOLS TO SAVE");
        return { total: 0, saved: 0, warned: 0 };
    }

    let saved = 0;
    let warned = 0;
    for (const frame of frames) {
        const ok = await runFrameSave(frame.contentWindow);
        if (ok) saved++;
        else warned++;
    }

    if (!silent) {
        if (warned > 0) showStatusMessage(`PROJECT SAVED (${saved}/${frames.length}, ${warned} PARTIAL)`);
        else showStatusMessage(`PROJECT SAVED (${saved} TOOLS)`);
    }

    return { total: frames.length, saved, warned };
}

function confirmClose() {
    if (confirm("Are you sure you want to leave redglitch STUDIO? Unsaved changes might be lost.")) {
        if(window.electronAPI) window.electronAPI.close();
    }
}

async function playGame() {
    const saveResult = await saveGlobalProject({ silent: true });

    if (runtimeWindow && !runtimeWindow.closed) {
        runtimeWindow.focus();
        setRunningState(true);
        showStatusMessage(`GAME RUNNING (${saveResult.saved}/${saveResult.total} TOOLS SYNCED)`);
        return;
    }

    const launchUrl = `launcher.html?studio_run=1&t=${Date.now()}`;
    runtimeWindow = window.open(launchUrl, 'redglitch-runtime');

    if (!runtimeWindow) {
        setRunningState(false);
        showStatusMessage("GAME LAUNCH FAILED");
        return;
    }

    setRunningState(true);
    showStatusMessage(`GAME RUNNING (${saveResult.saved}/${saveResult.total} TOOLS SYNCED)`);
    if (runtimeWatchTimer) clearInterval(runtimeWatchTimer);
    runtimeWatchTimer = setInterval(() => {
        if (!runtimeWindow || runtimeWindow.closed) {
            clearInterval(runtimeWatchTimer);
            runtimeWatchTimer = null;
            runtimeWindow = null;
            setRunningState(false);
            showStatusMessage("GAME STOPPED");
        }
    }, 1000);
}

function pauseGame() {
    if (!runtimeWindow || runtimeWindow.closed) {
        showStatusMessage("NO ACTIVE GAME WINDOW");
        return;
    }
    try {
        runtimeWindow.postMessage({ type: 'redglitch:runtime-pause-toggle' }, '*');
        runtimeWindow.focus();
        showStatusMessage("PAUSE SIGNAL SENT");
    } catch (err) {
        console.warn('[Studio] Pause signal failed:', err?.message || err);
        showStatusMessage("PAUSE FAILED");
    }
}

function stopGame() {
    if (!runtimeWindow || runtimeWindow.closed) {
        setRunningState(false);
        showStatusMessage("GAME NOT RUNNING");
        return;
    }
    try {
        runtimeWindow.close();
    } catch (err) {
        console.warn('[Studio] Stop failed:', err?.message || err);
    }
    runtimeWindow = null;
    if (runtimeWatchTimer) {
        clearInterval(runtimeWatchTimer);
        runtimeWatchTimer = null;
    }
    setRunningState(false);
    showStatusMessage("GAME STOPPED");
}

function setRunningState(isRunning) {
    const captionElements = document.querySelectorAll(
        '.app-caption span, .app-caption i, .app-icon i, .app-icon .brand-red, .app-icon .brand-glitch'
    );
    if (isRunning) captionElements.forEach(el => el.classList.add('running-text'));
    else captionElements.forEach(el => el.classList.remove('running-text'));
}

function toggleConsole() {
    const tool = tools.find(t => t.id === 'console');
    if (tool) openWindow(tool);
}

function openTool(src) {
    if (!src) return;
    const tool = tools.find(t => t.src === src);
    if (tool) openWindow(tool);
}

function dispatchGlobalCommand(cmd) {
    const focusedWin = document.querySelector('.window.focused iframe');
    if (focusedWin) focusedWin.contentWindow.postMessage({ type: 'execCommand', command: cmd }, '*');
    else document.execCommand(cmd); 
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

// --- PROJECT WIZARD & ASSET SCAN ---
async function openProjectManager() {
    document.getElementById('project-modal').style.display = 'flex';
    const savedAuthor = localStorage.getItem('redglitch_author');
    if(savedAuthor) document.getElementById('new-proj-author').value = savedAuthor;
    const container = document.getElementById('template-list');
    container.innerHTML = '<div style="color:#555; padding:20px;">Loading templates...</div>';
    try {
        const res = await fetch('/api/templates');
        renderTemplates(await res.json());
    } catch(e) { container.innerHTML = '<div style="color:var(--red);">Failed to load templates.</div>'; }
}

function renderTemplates(list) {
    const container = document.getElementById('template-list');
    container.innerHTML = '';
    list.forEach(t => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.onclick = () => selectTemplate(t, card);
        let icon = t.category === 'RPG' ? '⚔️' : (t.category === 'Platformer' ? '🏃' : '📦');
        card.innerHTML = `<div class="template-thumb">${icon}</div><div class="template-info"><div class="template-name">${t.name}</div><div class="template-cat">${t.category}</div></div>`;
        container.appendChild(card);
    });
    if(list.length > 0) {
        const def = list.find(t => t.id === 'base-rpg') || list[0];
        selectTemplate(def, container.children[list.indexOf(def)]);
    }
}

function selectTemplate(t, cardEl) {
    selectedTemplateId = t.id;
    document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
    cardEl.classList.add('active');
    document.getElementById('sel-name').innerText = t.name;
    document.getElementById('sel-desc').innerText = t.description;
    document.getElementById('sel-icon').innerText = t.category === 'RPG' ? '⚔️' : (t.category === 'Platformer' ? '🏃' : '📦');
    document.getElementById('btn-create-proj').disabled = false;
}

function closeProjectModal() { document.getElementById('project-modal').style.display = 'none'; }

async function createNewProject() {
    const name = document.getElementById('new-proj-name').value.trim();
    const author = document.getElementById('new-proj-author').value.trim();
    if(!name) return alert("Project name is required.");
    if(!/^[a-zA-Z0-9 \-_]+$/.test(name)) return alert("Invalid name.");
    if(!selectedTemplateId) return alert("Select a template.");
    localStorage.setItem('redglitch_author', author);
    const btn = document.getElementById('btn-create-proj');
    btn.innerHTML = '<span>⏳</span> FORGING...'; btn.disabled = true;
    try {
        const res = await fetch('/api/projects', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, template: selectedTemplateId, metadata: { author } }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await fetch('/api/projects/switch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: data.name }) });
        location.reload();
    } catch (e) { alert("Creation failed: " + e.message); btn.innerHTML = '<span>+</span> CREATE PROJECT'; btn.disabled = false; }
}

async function scanAssets() {
    showStatusMessage("INDEXING ASSETS...");
    try {
        const res = await fetch('/api/assets/rebuild', { method: 'POST' });
        const data = await res.json();
        if(data.success) showStatusMessage(`INDEXED ${data.count || ''} ASSETS`);
    } catch(e) { showStatusMessage("INDEX FAILED"); }
}

// --- FILE TREE ---
window.loadTree = async function() {
    const container = document.getElementById('file-tree-right');
    if (!container) return;
    container.innerHTML = '<div style="padding:10px; opacity:0.5;">SCANNINC...</div>';
    try {
        const res = await fetch('/api/ide/tree');
        fileTreeData = await res.json();
        window.renderTree();
    } catch (e) { container.innerHTML = '<div style="color:var(--red); padding:10px;">FAILED TO LOAD TREE</div>'; }
};

window.renderTree = function() {
    const container = document.getElementById('file-tree-right');
    if (!container) return;
    container.innerHTML = '';
    function buildNode(node, depth) {
        const div = document.createElement('div');
        div.className = `tree-item ${node.type}`;
        div.style.padding = `4px 10px 4px ${10 + depth * 12}px`;
        let isDir = node.type === 'dir' || node.type === 'directory';
        let icon = isDir ? `<i class="fas ${expandedDirs.has(node.path) ? 'fa-folder-open' : 'fa-folder'}" style="color:#3498db"></i>` : '<i class="far fa-file"></i>';
        if (node.type === 'file') {
            const ext = node.name.split('.').pop();
            if (ext === 'js') icon = '<i class="fab fa-js" style="color:#ff0000"></i>';
            else if (ext === 'json') icon = '<i class="fas fa-cog" style="color:#aaa"></i>';
            else if (ext === 'html') icon = '<i class="fas fa-code" style="color:#e44d26"></i>';
        }
        div.innerHTML = `<span style="width:16px; text-align:center;">${icon}</span><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${node.name.toLowerCase()}</span>`;
        div.onclick = (e) => {
            e.stopPropagation();
            if (node.type === 'file') {
                const tool = tools.find(t => t.id === 'script');
                if (tool) openWindow({...tool, src: `script_editor.html?file=${encodeURIComponent(node.path)}`});
            } else {
                if (expandedDirs.has(node.path)) expandedDirs.delete(node.path);
                else expandedDirs.add(node.path);
                window.renderTree();
            }
        };
        container.appendChild(div);
        if (isDir && expandedDirs.has(node.path) && node.children) {
            const sorted = [...node.children].sort((a,b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'dir' ? -1 : 1;
            });
            sorted.forEach(c => buildNode(c, depth + 1));
        }
    }
    fileTreeData.forEach(root => buildNode(root, 0));
};

window.createNewFile = async function() {
    const name = prompt("New file name:");
    if (!name) return;
    try {
        const res = await fetch('/api/ide/write', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ file: name, content: "// RedGlitch Script\n" }) });
        if (res.ok) window.loadTree();
    } catch (e) { alert("Failed to create file"); }
};

// --- BUILD WIZARD LOGIC ---
function bwShowStep(n) {
    document.getElementById('bw-step1').style.display = n === 1 ? '' : 'none';
    document.getElementById('bw-step2').style.display = n === 2 ? '' : 'none';
    document.getElementById('bw-step3').style.display = n === 3 ? '' : 'none';
    [1,2,3].forEach(i => {
        const el = document.getElementById('bw-s' + i);
        el.classList.remove('active','done');
        if (i < n) el.classList.add('done');
        else if (i === n) el.classList.add('active');
    });
}

function bwAppendLog(text) {
    const log = document.getElementById('bw-log');
    const colored = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/(✓|✔|SUCCESS|COMPLETE|Done|done|OK)/g, '<span class="log-ok">$1</span>')
        .replace(/(ERROR|FAILED|Error|error|failed|✗)/g, '<span class="log-err">$1</span>')
        .replace(/(\[BUILDER\]|\[WIZARD\])/g, '<span class="log-acc">$1</span>');
    log.innerHTML += colored; log.scrollTop = log.scrollHeight;
}

async function bwStartBuild() {
    bwShowStep(2);
    document.getElementById('bw-footer').innerHTML = `<button class="bw-btn bw-btn-danger" onclick="closeBuildWizard()">ABORT</button>`;
    const log = document.getElementById('bw-log');
    log.innerHTML = '';
    document.getElementById('bw-progress').style.width = '0%';
    document.getElementById('bw-pct').innerText = '0%';
    document.getElementById('bw-spinner').style.display = '';

    const projName = document.getElementById('sb-project-name')?.innerText || 'Default';
    bwProgress = 0;
    bwProgressInterval = setInterval(() => {
        if (bwProgress < 89) {
            bwProgress += Math.random() * (90 - bwProgress) * 0.04;
            document.getElementById('bw-progress').style.width = bwProgress + '%';
            document.getElementById('bw-pct').innerText = Math.round(bwProgress) + '%';
        }
    }, 800);

    bwSSE = new EventSource(`/api/build/stream?target=${encodeURIComponent(bwTarget)}&project=${encodeURIComponent(projName)}`);
    bwSSE.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'log' || msg.type === 'error') bwAppendLog(msg.text);
        else if (msg.type === 'done') {
            bwSSE.close(); bwSSE = null; clearInterval(bwProgressInterval);
            document.getElementById('bw-progress').style.width = '100%'; document.getElementById('bw-pct').innerText = '100%';
            document.getElementById('bw-spinner').style.display = 'none';
            setTimeout(() => bwShowResult(msg.success, msg.path), 400);
        }
    };
    bwSSE.onerror = () => { clearInterval(bwProgressInterval); bwSSE.close(); bwSSE = null; document.getElementById('bw-spinner').style.display = 'none'; bwAppendLog('\n[ERROR] Connection lost.\n'); bwShowResult(false, ''); };
}

function bwShowResult(success, outputPath) {
    bwShowStep(3);
    document.getElementById('bw-result-icon').innerText = success ? '✅' : '❌';
    document.getElementById('bw-result-title').innerText = success ? 'BUILD COMPLETE' : 'BUILD FAILED';
    document.getElementById('bw-result-path').innerText = outputPath || 'See log';
    document.getElementById('bw-footer').innerHTML = success
        ? `<button class="bw-btn bw-btn-cancel" onclick="closeBuildWizard()">CLOSE</button><button class="bw-btn bw-btn-primary" onclick="closeBuildWizard(); showStatusMessage('Build complete!')">DONE</button>`
        : `<button class="bw-btn bw-btn-cancel" onclick="bwShowStep(2)">SEE LOG</button><button class="bw-btn bw-btn-primary" onclick="bwStartBuild()">RETRY</button>`;
}

function openBuildWizard(target) {
    bwTarget = target || currentBuildTarget;
    ['win','macos','android','ios','web','all'].forEach(t => document.getElementById('bwtc-' + t)?.classList.toggle('selected', t === bwTarget));
    document.getElementById('bw-project-name').innerText = document.getElementById('sb-project-name')?.innerText || 'Default';
    const labelMap = { win:'WINDOWS', macos:'MACOS', android:'ANDROID', ios:'IOS', web:'WEB', all:'ALL CI' };
    document.getElementById('bw-target-label').innerText = labelMap[bwTarget] || bwTarget.toUpperCase();
    bwShowStep(1);
    document.getElementById('bw-footer').innerHTML = `<button class="bw-btn bw-btn-cancel" onclick="closeBuildWizard()">CANCEL</button><button class="bw-btn bw-btn-primary" id="bw-btn-start" onclick="bwStartBuild()">START BUILD</button>`;
    document.getElementById('build-wizard').style.display = 'flex';
}

function closeBuildWizard() { if (bwSSE) { bwSSE.close(); bwSSE = null; } clearInterval(bwProgressInterval); document.getElementById('build-wizard').style.display = 'none'; }

function bwSelectTarget(t) {
    bwTarget = t;
    ['win','macos','android','ios','web','all'].forEach(id => document.getElementById('bwtc-' + id)?.classList.toggle('selected', id === t));
    const labelMap = { win:'WINDOWS', macos:'MACOS', android:'ANDROID', ios:'IOS', web:'WEB', all:'ALL CI' };
    document.getElementById('bw-target-label').innerText = labelMap[t] || t.toUpperCase();
}

function setBuildTarget(target) {
    currentBuildTarget = target;
    const selectEl = document.getElementById('build-target');
    if (selectEl) selectEl.value = target;
    
    const labelMap = {
        win: 'Windows (EXE)',
        macos: 'macOS (.app)',
        android: 'Android (APK)',
        ios: 'iOS (Xcode)',
        web: 'Web (HTML5)',
        all: 'All targets'
    };
    const sbEl = document.getElementById('sb-build-target');
    if (sbEl) sbEl.innerText = labelMap[target] || target.toUpperCase();
    
    showStatusMessage(`BUILD TARGET SET: ${target.toUpperCase()}`);
}

function buildGame(target) {
    openBuildWizard(target || currentBuildTarget);
}

// --- BOOT ---
window.addEventListener('DOMContentLoaded', studioInit);
window.tools = tools;
window.openWindow = openWindow;
window.closeWindow = closeWindow;
window.minimizeWindow = minimizeWindow;
window.toggleMaximize = toggleMaximize;
window.focusWindow = focusWindow;
window.applyTheme = applyTheme;
window.playGame = playGame;
window.saveGlobalProject = saveGlobalProject;
window.confirmClose = confirmClose;
window.toggleConsole = toggleConsole;
window.dispatchGlobalCommand = dispatchGlobalCommand;
window.toggleFullscreen = toggleFullscreen;
window.scanAssets = scanAssets;
window.openProjectManager = openProjectManager;
window.createNewProject = createNewProject;
window.closeProjectModal = closeProjectModal;
window.bwSelectTarget = bwSelectTarget;
window.bwStartBuild = bwStartBuild;
window.closeBuildWizard = closeBuildWizard;
window.setBuildTarget = setBuildTarget;
window.buildGame = buildGame;
window.openBuildWizard = openBuildWizard;
window.pauseGame = pauseGame;
window.stopGame = stopGame;
window.openTool = openTool;
window.tileWindows = tileWindows;
async function openExplorer() {
    try {
        const res = await fetch('/api/projects/explore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        if (!res.ok) throw new Error(`Explorer failed (${res.status})`);
        showStatusMessage("OPENED PROJECT FOLDER");
    } catch (err) {
        console.error('[Studio] openExplorer failed:', err);
        showStatusMessage("EXPLORER FAILED");
    }
}
window.openExplorer = openExplorer;
async function cleanBuilds() {
    showStatusMessage("CLEANING BUILDS...");
    try {
        const res = await fetch('/api/build/clean', { method: 'POST' });
        if (!res.ok) throw new Error(`Clean failed (${res.status})`);
        showStatusMessage("BUILDS CLEANED");
    } catch (err) {
        console.error('[Studio] cleanBuilds failed:', err);
        showStatusMessage("CLEAN FAILED");
    }
}
window.cleanBuilds = cleanBuilds;

// --- PHASE 9: LIVE CAMPAIGN STATE INSPECTOR ---
let currentCampaignSnapshot = null;

function refreshCampaignState() {
    if (window.RedGlitchEventBus) {
        window.RedGlitchEventBus.emit('system:memory:request', { namespace: 'campaign' });
        showStatusMessage("REQUESTING CAMPAIGN STATE...");
    }
}

function takeCampaignSnapshot() {
    if (!window.RedGlitchEventBus) return;
    
    // We request state, and wait for the response to save it.
    // A more robust way is if we already have the cached state from the last update.
    // But since the IDE is just a viewer, we can request a fresh one and snapshot it on arrival.
    window._pendingSnapshot = true;
    refreshCampaignState();
}

function restoreCampaignSnapshot() {
    if (!currentCampaignSnapshot) {
        alert("No snapshot available to restore.");
        return;
    }
    if (confirm("Restore campaign state to the last snapshot?")) {
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.emit('system:memory:patch', {
                namespace: 'campaign',
                patch: {
                    variables: currentCampaignSnapshot.variables,
                    globalFlags: currentCampaignSnapshot.globalFlags
                }
            });
            showStatusMessage("SNAPSHOT RESTORED");
            setTimeout(refreshCampaignState, 500);
        }
    }
}

function updateLiveStateUI(data) {
    if (window._pendingSnapshot) {
        window._pendingSnapshot = false;
        currentCampaignSnapshot = JSON.parse(JSON.stringify(data)); // Deep copy
        showStatusMessage("CAMPAIGN SNAPSHOT SAVED");
    }

    const varList = document.getElementById('live-variables-list');
    const flagList = document.getElementById('live-flags-list');
    
    if (varList && data.variables) {
        varList.innerHTML = '';
        if (Object.keys(data.variables).length === 0) {
            varList.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center;">No variables defined.</div>';
        } else {
            for (const [k, v] of Object.entries(data.variables)) {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.padding = '4px';
                row.style.background = 'rgba(255,255,255,0.05)';
                row.style.borderRadius = '2px';
                
                row.innerHTML = `
                    <span style="font-family:VT323; font-size:16px; color:#aaa;">${k}</span>
                    <input type="number" value="${v}" style="width:60px; background:#111; color:var(--accent); border:1px solid #333; font-family:VT323; font-size:16px; text-align:right;" 
                        onchange="patchCampaignVariable('${k}', this.value)">
                `;
                varList.appendChild(row);
            }
        }
    }
    
    if (flagList && data.globalFlags) {
        flagList.innerHTML = '';
        if (Object.keys(data.globalFlags).length === 0) {
            flagList.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center;">No flags defined.</div>';
        } else {
            for (const [k, v] of Object.entries(data.globalFlags)) {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.padding = '4px';
                row.style.background = 'rgba(255,255,255,0.05)';
                row.style.borderRadius = '2px';
                
                row.innerHTML = `
                    <span style="font-family:VT323; font-size:16px; color:#aaa;">${k}</span>
                    <input type="checkbox" ${v ? 'checked' : ''} onchange="patchCampaignFlag('${k}', this.checked)">
                `;
                flagList.appendChild(row);
            }
        }
    }
}

window.patchCampaignVariable = function(key, val) {
    if (window.RedGlitchEventBus) {
        window.RedGlitchEventBus.emit('system:memory:patch', {
            namespace: 'campaign',
            patch: {
                variables: { [key]: parseFloat(val) || 0 }
            }
        });
    }
};

window.patchCampaignFlag = function(key, val) {
    if (window.RedGlitchEventBus) {
        window.RedGlitchEventBus.emit('system:memory:patch', {
            namespace: 'campaign',
            patch: {
                globalFlags: { [key]: !!val }
            }
        });
    }
};

window.refreshCampaignState = refreshCampaignState;
window.takeCampaignSnapshot = takeCampaignSnapshot;
window.restoreCampaignSnapshot = restoreCampaignSnapshot;

// Listen for updates from CampaignController
if (typeof window !== 'undefined') {
    // Wait for EventBus to be ready
    setTimeout(() => {
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.on('system:memory:update', (e) => {
                const data = e.data || {};
                if (data.namespace === 'campaign' && data.patch) {
                    updateLiveStateUI(data.patch);
                }
            });
            
            // PHASE 11: Multi-Engine Level Streaming Sync
            window.RedGlitchEventBus.on('system:engine:switch', (e) => {
                console.log('[Studio] Engine switched, refreshing campaign state...');
                const varList = document.getElementById('live-variables-list');
                const flagList = document.getElementById('live-flags-list');
                if (varList) varList.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center;">Syncing new engine...</div>';
                if (flagList) flagList.innerHTML = '<div style="color:#666; font-size:0.8rem; text-align:center;">Syncing new engine...</div>';
                
                // Request state from the new engine instance
                setTimeout(refreshCampaignState, 500);
            });
        }
    }, 1000);
}

// --- PHASE 12: TRIGGER DISPATCHER ---
window.dispatchManualTrigger = function() {
    const nameEl = document.getElementById('manual-trigger-name');
    const payloadEl = document.getElementById('manual-trigger-payload');
    if (!nameEl) return;
    
    const triggerId = nameEl.value.trim();
    if (!triggerId) {
        showStatusMessage("TRIGGER ID REQUIRED");
        return;
    }
    
    let payload = {};
    if (payloadEl && payloadEl.value.trim()) {
        try {
            payload = JSON.parse(payloadEl.value.trim());
        } catch(e) {
            showStatusMessage("INVALID PAYLOAD JSON");
            return;
        }
    }
    
    fireQuickTrigger(triggerId, payload);
};

window.fireQuickTrigger = function(triggerId, payload = {}) {
    if (window.RedGlitchEventBus) {
        window.RedGlitchEventBus.emit('system:trigger:fire', {
            triggerId: triggerId,
            payload: payload
        });
        showStatusMessage(`TRIGGER FIRED: ${triggerId}`);
    } else {
        showStatusMessage("EVENT BUS NOT READY");
    }
};

// --- PHASE 13 & 14: LIVE ENGINE INSPECTION ---
window.requestEngineInspect = function() {
    if (window.RedGlitchEventBus) {
        window.RedGlitchEventBus.emit('system:engine:inspect', {});
        showStatusMessage("REQUESTED ENGINE METRICS");
    }
};

if (typeof window !== 'undefined') {
    setTimeout(() => {
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.on('system:engine:inspect:response', (e) => {
                const metrics = e.data?.metrics;
                if (metrics) {
                    const metricsList = document.getElementById('engine-metrics-list');
                    if (metricsList) {
                        let html = '';
                        for (const [key, val] of Object.entries(metrics)) {
                            if (key === 'timestamp') continue;
                            html += `
                                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #222; padding-bottom:4px;">
                                    <span style="color:#aaa">${key.toUpperCase()}</span>
                                    <span style="color:var(--green); font-family:'VT323', monospace;">${val}</span>
                                </div>
                            `;
                        }
                        metricsList.innerHTML = html;
                    }
                }
            });
            
            // Also listen to periodic metrics
            window.RedGlitchEventBus.on('system:engine:metrics', (e) => {
                const metrics = e.data?.metrics;
                if (metrics) {
                    const fpsEl = document.getElementById('sb-engine-fps');
                    const entsEl = document.getElementById('sb-engine-ents');
                    const drawsEl = document.getElementById('sb-engine-draws');
                    
                    if (fpsEl) fpsEl.textContent = `${Math.round(metrics.fps || 0)} FPS`;
                    if (entsEl) entsEl.textContent = `${metrics.entityCount || 0} ENTS`;
                    if (drawsEl) drawsEl.textContent = `${metrics.drawCalls || 0} DRAWS`;
                }
            });
        }
    }, 1200);
}
// --- PHASE 15 & 16: GHOST MODE AND TIME DILATION ---
window.toggleGhostMode = function(enabled) {
    if (window.RedGlitchEventBus) {
        window.RedGlitchEventBus.emit('system:camera:mode', { mode: enabled ? 'ghost' : 'normal' });
        showStatusMessage(`GHOST MODE: ${enabled ? 'ON' : 'OFF'}`);
    }
};

window.setTimeScale = function(value) {
    const scale = parseFloat(value);
    const label = document.getElementById('time-scale-val');
    if (label) label.textContent = `${scale.toFixed(1)}x`;
    
    if (window.RedGlitchEventBus) {
        window.RedGlitchEventBus.emit('system:engine:timeScale', { scale });
    }
};

window.stepFrame = function() {
    if (window.RedGlitchEventBus) {
        window.RedGlitchEventBus.emit('system:engine:stepFrame', {});
        showStatusMessage("STEPPED 1 FRAME");
    }
};
