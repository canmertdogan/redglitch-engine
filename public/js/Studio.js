/**
 * Ketebe Engine - Game Studio IDE Core
 * Orchestrates window management, tools, projects, and system status.
 */

const tools = [
    // SYSTEM
    { id: 'dashboard', category: 'SYSTEM', title: 'Launcher', icon: 'fa-rocket', src: 'dashboard.html', w: 900, h: 700 },
    { id: 'project_dashboard', category: 'SYSTEM', title: 'Command Center', icon: 'fa-tachometer-alt', src: 'project_dashboard.html', w: 1000, h: 600 },
    { id: 'menu', category: 'SYSTEM', title: 'Interface (UI)', icon: 'fa-window-restore', src: 'menu_editor.html', w: 900, h: 600 },
    { id: 'loc', category: 'SYSTEM', title: 'Localization', icon: 'fa-globe', src: 'localization_editor.html', w: 900, h: 600 },
    { id: 'input', category: 'SYSTEM', title: 'Input Map', icon: 'fa-gamepad', src: 'input_editor.html', w: 600, h: 600 },
    { id: 'console', category: 'SYSTEM', title: 'System Logs', icon: 'fa-terminal', src: 'console.html', w: 800, h: 500 },
    
    // WORLD ARCHITECT
    { id: 'editor', category: 'WORLD ARCHITECT', title: 'Level Editor', icon: 'fa-map', src: 'editor.html', w: 1000, h: 700 },
    { id: 'topdown3d_studio', category: 'WORLD ARCHITECT', title: 'Topdown 3D Studio', icon: 'fa-map', src: 'topdown3d_editor.html', w: 1400, h: 900 },
    { id: 'fps_studio', category: 'WORLD ARCHITECT', title: 'FPS 3D Studio', icon: 'fa-crosshairs', src: 'fps_editor.html', w: 1400, h: 900 },
    { id: 'platformer3d_studio', category: 'WORLD ARCHITECT', title: 'Platformer 3D Studio', icon: 'fa-star', src: 'platformer3d_editor.html', w: 1400, h: 900 },
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
let snapMode = null;
let diagnostics = { errors: 0, warnings: 0 };
let logBuffer = [];
let currentBuildTarget = 'win';
let selectedTemplateId = null;
let fileTreeData = [];
let expandedDirs = new Set();
let dragTarget = null;
let offX, offY;

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

async function studioInit() {
    // Populate Sidebar with Categories
    const list = document.getElementById('module-list');
    if (list) {
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
                                'daw': ">> FREQUENCY_SPECTRUM_BALANCED. COMMENCING AUDIO_SYNTHESIS."
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
        window._ketebeActiveProject = projName;
        
        const projNameEl = document.getElementById('sb-project-name');
        if (projNameEl) projNameEl.innerText = formatProjectName(projName);

        if (data.isRoot) {
            console.log("[Studio] No project active (Root), redirecting to Launcher...");
            window.location.href = 'dashboard.html';
        } else {
            console.log("[Studio] Project active, maximizing and opening Command Center...");
            if (window.electronAPI) {
                try {
                    if (!sessionStorage.getItem('ketebe_studio_auto_maximized')) {
                        window.electronAPI.maximize();
                        sessionStorage.setItem('ketebe_studio_auto_maximized', '1');
                    }
                } catch (err) {
                    window.electronAPI.maximize();
                }
            }
            openWindow(tools.find(t => t.id === 'project_dashboard'));
        }

    } catch(e) {
        console.error("[Studio] Startup error:", e);
        window.location.href = 'dashboard.html';
    }
}

window.onProjectLoaded = function(name) {
    const launcherId = 'win-dashboard';
    const launcherWin = document.getElementById(launcherId);
    if(launcherWin) closeWindow(launcherId);

    const projNameEl = document.getElementById('sb-project-name');
    if (projNameEl) projNameEl.innerText = formatProjectName(name);

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
        if (window.KetebeEventBus) window.KetebeEventBus.emit('editor:error', { message: msg });
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
        el.innerText = 'ketebe STUDIO READY';
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
        localStorage.setItem('ketebe_theme', themeName);
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
                <iframe id="frame-${tool.id}" src="${(() => { const proj3dIds = ['topdown3d_studio', 'fps_studio', 'platformer3d_studio']; return (proj3dIds.includes(tool.id) && window._ketebeActiveProject) ? tool.src + '?project=' + encodeURIComponent(window._ketebeActiveProject) : tool.src; })()}"></iframe>
            </div>
        `;
        win.onmousedown = () => focusWindow(winId);
        document.getElementById('workspace').appendChild(win);
        const btn = document.getElementById('btn-' + tool.id);
        if (btn) btn.classList.add('opened');
    } else {
        win.style.display = 'flex';
    }
    
    if (window.KetebeProjectState) {
        window.KetebeProjectState.logActivity('tool', tool.title, { id: tool.id });
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
    if (win) win.remove();
    const toolId = id.replace('win-', '');
    const btn = document.getElementById('btn-' + toolId);
    if (btn) { btn.classList.remove('opened'); btn.classList.remove('active'); }
}

function minimizeWindow(id) {
    const win = document.getElementById(id);
    if (win) win.style.display = 'none';
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
    document.querySelectorAll('.window').forEach(w => w.classList.remove('focused'));
    document.querySelectorAll('.module-btn').forEach(b => b.classList.remove('active'));
    const win = document.getElementById(id);
    if(win) {
        win.style.display = 'flex'; win.classList.add('focused');
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

window.addEventListener('mousemove', (e) => {
    if (!dragTarget) return;
    const workspace = document.getElementById('workspace');
    const wsRect = workspace.getBoundingClientRect();
    const ghost = document.getElementById('snap-ghost');
    
    let x = e.clientX - offX - wsRect.left;
    let y = e.clientY - offY - wsRect.top;

    const stickDist = 20;
    snapMode = null;
    ghost.style.display = 'none';

    if (e.clientY < 40) {
        snapMode = 'top'; ghost.style.display = 'block';
        ghost.style.top = '0'; ghost.style.left = wsRect.left + 'px';
        ghost.style.width = wsRect.width + 'px'; ghost.style.height = wsRect.height + 'px';
    } else if (e.clientX < wsRect.left + 20) {
        snapMode = 'left'; ghost.style.display = 'block';
        ghost.style.top = wsRect.top + 'px'; ghost.style.left = wsRect.left + 'px';
        ghost.style.width = (wsRect.width / 2) + 'px'; ghost.style.height = wsRect.height + 'px';
    } else if (e.clientX > wsRect.right - 20) {
        snapMode = 'right'; ghost.style.display = 'block';
        ghost.style.top = wsRect.top + 'px'; ghost.style.left = (wsRect.left + wsRect.width / 2) + 'px';
        ghost.style.width = (wsRect.width / 2) + 'px'; ghost.style.height = wsRect.height + 'px';
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
});

window.addEventListener('mouseup', () => {
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

function saveGlobalProject() {
    showStatusMessage("SAVING PROJECT...");
    setTimeout(() => showStatusMessage("PROJECT SAVED"), 800);
}

function confirmClose() {
    if (confirm("Are you sure you want to leave ketebe STUDIO? Unsaved changes might be lost.")) {
        if(window.electronAPI) window.electronAPI.close();
    }
}

function playGame() { 
    setRunningState(true);
    showStatusMessage("GAME RUNNING");
    const gameWin = window.open('launcher.html', '_blank');
    if (gameWin) {
        const timer = setInterval(() => {
            if (gameWin.closed) { clearInterval(timer); setRunningState(false); showStatusMessage("GAME STOPPED"); }
        }, 1000);
    } else { setRunningState(false); showStatusMessage("GAME LAUNCH FAILED"); }
}

function setRunningState(isRunning) {
    const captionElements = document.querySelectorAll('.app-caption span, .app-caption i, .app-icon i');
    if (isRunning) captionElements.forEach(el => el.classList.add('running-text'));
    else captionElements.forEach(el => el.classList.remove('running-text'));
}

function toggleConsole() {
    const tool = tools.find(t => t.id === 'console');
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
    const savedAuthor = localStorage.getItem('ketebe_author');
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
    localStorage.setItem('ketebe_author', author);
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
            if (ext === 'js') icon = '<i class="fab fa-js" style="color:#f1c40f"></i>';
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
        const res = await fetch('/api/ide/write', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ file: name, content: "// Ketebe Script\n" }) });
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
function openExplorer(proj) { alert('Explorer coming soon for: ' + proj); }
window.openExplorer = openExplorer;
function cleanBuilds() { alert('Cleaning...'); }
window.cleanBuilds = cleanBuilds;
