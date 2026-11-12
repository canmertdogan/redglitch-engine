/**
 * Redglitch Engine - Game Studio IDE Core
 * Orchestrates window management, tools, projects, and system status.
 */

const _escapeHtml = window.escapeHtml || function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
};

const tools = [
    // SYSTEM
    { id: 'dashboard_legacy', category: 'SYSTEM', title: 'Launcher', icon: 'fa-rocket', src: 'dashboard.html', w: 900, h: 700, status: 'hidden' },
    { id: 'dashboard', category: 'SYSTEM', title: 'Launcher', icon: 'fa-rocket', src: 'studio-dist/dashboard.html', w: 900, h: 700 },
    { id: 'project_dashboard', category: 'SYSTEM', title: 'Command Center', icon: 'fa-tachometer-alt', src: 'project_dashboard.html', w: 1000, h: 600 },
    { id: 'menu', category: 'SYSTEM', title: 'Interface (UI)', icon: 'fa-window-restore', src: 'menu_editor.html', w: 1280, h: 760 },
    { id: 'ui_designer', category: 'SYSTEM', title: 'UI Designer', icon: 'fa-th-large', src: 'studio-dist/ui_designer.html', w: 1000, h: 700 },
    { id: 'loc', category: 'SYSTEM', title: 'Localization', icon: 'fa-globe', src: 'localization_editor.html', w: 900, h: 600 },
    { id: 'localization', category: 'SYSTEM', title: 'Localization', icon: 'fa-globe', src: 'localization_editor.html', w: 900, h: 600, status: 'hidden', aliasOf: 'loc' },
    { id: 'input', category: 'SYSTEM', title: 'Input Map', icon: 'fa-gamepad', src: 'input_editor.html', w: 600, h: 600 },
    { id: 'console', category: 'SYSTEM', title: 'System Logs', icon: 'fa-terminal', src: 'console.html', w: 800, h: 500 },

    // WORLD ARCHITECT
    { id: 'editor', category: 'WORLD ARCHITECT', title: 'Level Editor', icon: 'fa-map', src: 'editor.html', w: 1000, h: 700 },
    { id: 'studio_3d', category: 'WORLD ARCHITECT', title: '3D Studio', icon: 'fa-cube', src: 'editor3d.html', w: 1400, h: 900 },
    { id: 'iso_studio', category: 'WORLD ARCHITECT', title: 'IsoPixel Studio', icon: 'fa-cubes', src: 'iso_editor.html', w: 1000, h: 700 },
    { id: 'platformer_studio', category: 'WORLD ARCHITECT', title: 'Platformer Studio', icon: 'fa-running', src: 'platformer_editor.html', w: 1200, h: 800 },
    { id: 'background', category: 'WORLD ARCHITECT', title: 'Backgrounds', icon: 'fa-image', src: 'background_editor.html', w: 900, h: 600 },
    { id: 'campaign', category: 'WORLD ARCHITECT', title: 'Campaign Flow', icon: 'fa-flag', src: 'campaign_editor.html', w: 1100, h: 750 },

    // ENTITIES
    { id: 'prefab_legacy', category: 'ENTITIES', title: 'Prefab Builder', icon: 'fa-cubes', src: 'prefab_editor.html', w: 800, h: 600, status: 'hidden' },
    { id: 'prefab', category: 'ENTITIES', title: 'Prefab Builder', icon: 'fa-cubes', src: 'studio-dist/prefab_editor.html', w: 800, h: 600 },
    { id: 'npc_legacy', category: 'ENTITIES', title: 'NPC Editor', icon: 'fa-user-friends', src: 'npc_editor.html', w: 700, h: 500, status: 'hidden' },
    { id: 'npc', category: 'ENTITIES', title: 'NPC Editor', icon: 'fa-user-friends', src: 'studio-dist/npc_editor.html', w: 700, h: 500 },
    { id: 'enemy_legacy', category: 'ENTITIES', title: 'Enemy Editor', icon: 'fa-skull', src: 'enemy_editor.html', w: 700, h: 500, status: 'hidden' },
    { id: 'enemy', category: 'ENTITIES', title: 'Enemy Editor', icon: 'fa-skull', src: 'studio-dist/enemy_editor.html', w: 700, h: 500 },
    { id: 'item_legacy', category: 'ENTITIES', title: 'Item Database', icon: 'fa-scroll', src: 'item_editor.html', w: 700, h: 500, status: 'hidden' },
    { id: 'item', category: 'ENTITIES', title: 'Item Database', icon: 'fa-scroll', src: 'studio-dist/item_editor.html', w: 700, h: 500 },
    { id: 'character', category: 'ENTITIES', title: 'Player Profiles', icon: 'fa-user-ninja', src: 'character_editor.html', w: 700, h: 500 },
    { id: 'skill', category: 'ENTITIES', title: 'Skills', icon: 'fa-bolt', src: 'skill_editor.html', w: 700, h: 500 },
    { id: 'achievements', category: 'ENTITIES', title: 'Trophies', icon: 'fa-trophy', src: 'achievements_editor.html', w: 700, h: 500 },

    // LOGIC & AI
    { id: 'script_legacy', category: 'LOGIC & AI', title: 'Script Editor', icon: 'fa-code', src: 'script_editor.html', w: 1000, h: 700, status: 'hidden' },
    { id: 'script', category: 'LOGIC & AI', title: 'Script Editor', icon: 'fa-code', src: 'studio-dist/script_editor.html', w: 1000, h: 700 },
    { id: 'algorithm_legacy', category: 'LOGIC & AI', title: 'Node Logic', icon: 'fa-project-diagram', src: 'algorithm_editor.html', w: 1000, h: 700, status: 'hidden' },
    { id: 'algorithm', category: 'LOGIC & AI', title: 'Node Logic', icon: 'fa-project-diagram', src: 'studio-dist/algorithm_editor.html', w: 1000, h: 700 },
    { id: 'logic', category: 'LOGIC & AI', title: 'Logic Editor', icon: 'fa-project-diagram', src: 'logic_editor.html', w: 1000, h: 700, status: 'hidden' },
    { id: 'behavior', category: 'LOGIC & AI', title: 'AI Brains', icon: 'fa-brain', src: 'behavior_editor.html', w: 900, h: 600 },
    { id: 'quests_legacy', category: 'LOGIC & AI', title: 'Quest Designer', icon: 'fa-exclamation-circle', src: 'quest_editor.html', w: 900, h: 600, status: 'hidden' },
    { id: 'quests', category: 'LOGIC & AI', title: 'Quest Designer', icon: 'fa-exclamation-circle', src: 'studio-dist/quest_editor.html', w: 900, h: 600 },
    { id: 'quest', category: 'LOGIC & AI', title: 'Quest Designer', icon: 'fa-exclamation-circle', src: 'studio-dist/quest_editor.html', w: 900, h: 600, status: 'hidden', aliasOf: 'quests' },
    { id: 'dialogue_legacy', category: 'LOGIC & AI', title: 'Dialogues', icon: 'fa-comments', src: 'dialogue_editor.html', w: 800, h: 500, status: 'hidden' },
    { id: 'dialogue', category: 'LOGIC & AI', title: 'Dialogues', icon: 'fa-comments', src: 'studio-dist/dialogue_editor.html', w: 800, h: 500 },
    { id: 'interactive_cutscene_legacy', category: 'LOGIC & AI', title: 'Cutscene Studio', icon: 'fa-theater-masks', src: 'interactive_cutscene_editor.html', w: 1200, h: 800, status: 'hidden' },
    { id: 'interactive_cutscene', category: 'LOGIC & AI', title: 'Cutscene Studio', icon: 'fa-theater-masks', src: 'studio-dist/interactive_cutscene_editor.html', w: 1200, h: 800 },
    { id: 'cutscene', category: 'LOGIC & AI', title: 'Cutscene Studio', icon: 'fa-theater-masks', src: 'studio-dist/interactive_cutscene_editor.html', w: 1200, h: 800, status: 'hidden', aliasOf: 'interactive_cutscene' },

    // ASSETS
    { id: 'daw_legacy', category: 'ASSETS', title: 'Audio Studio', icon: 'fa-music', src: 'daw.html', w: 800, h: 500, status: 'hidden' },
    { id: 'daw', category: 'ASSETS', title: 'Audio Studio', icon: 'fa-music', src: 'studio-dist/daw_editor.html', w: 800, h: 500 },
    { id: 'pixel_legacy', category: 'ASSETS', title: 'Pixel Art', icon: 'fa-paint-brush', src: 'pixel_editor.html', w: 900, h: 650, status: 'hidden' },
    { id: 'pixel', category: 'ASSETS', title: 'Pixel Art', icon: 'fa-paint-brush', src: 'studio-dist/pixel_editor.html', w: 900, h: 650 },
    { id: 'fxpro_legacy', category: 'ASSETS', title: 'FX Master', icon: 'fa-magic', src: 'fx_editor.html', w: 900, h: 650, status: 'hidden' },
    { id: 'fxpro', category: 'ASSETS', title: 'FX Master', icon: 'fa-magic', src: 'studio-dist/fx_editor.html', w: 900, h: 650 },
    { id: 'fx', category: 'ASSETS', title: 'FX Master', icon: 'fa-magic', src: 'studio-dist/fx_editor.html', w: 900, h: 650, status: 'hidden', aliasOf: 'fxpro' },
    { id: 'shader_legacy', category: 'ASSETS', title: 'Shader Lab', icon: 'fa-eye', src: 'shader_lab.html', w: 1200, h: 800, status: 'hidden' },
    { id: 'shader', category: 'ASSETS', title: 'Shader Lab', icon: 'fa-eye', src: 'studio-dist/shader_editor.html', w: 1200, h: 800 },
    { id: 'assets_legacy', category: 'ASSETS', title: 'File Manager', icon: 'fa-folder', src: 'asset_manager.html', w: 900, h: 600, status: 'hidden' },
    { id: 'assets', category: 'ASSETS', title: 'File Manager', icon: 'fa-folder', src: 'studio-dist/asset_manager.html', w: 900, h: 600 },
    { id: 'asset_manager', category: 'ASSETS', title: 'File Manager', icon: 'fa-folder', src: 'studio-dist/asset_manager.html', w: 900, h: 600, status: 'hidden', aliasOf: 'assets' }
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

// The background is a faint decorative grid; ~15fps is visually identical and
// frees the main thread for the (often heavy) editor iframes on top of it.
const BG_FRAME_MS = 66;
let _bgLastFrame = 0;

function workspaceLoop(ts = 0) {
    requestAnimationFrame(workspaceLoop);

    // Skip when the tab is hidden, when a maximized window completely covers
    // the canvas, or when the frame budget hasn't elapsed yet.
    if (document.hidden) return;
    if (ts - _bgLastFrame < BG_FRAME_MS) return;
    if (document.querySelector('#window-container .window.maximized:not([style*="display: none"])')) return;
    _bgLastFrame = ts;

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
            p.y += p.speed * 3; // compensate for the lower frame rate
            if(p.y > bgCanvas.height) p.y = 0;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        });
    }
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

let currentBuildTarget = 'windows';
let selectedTemplateId = null;
let fileTreeData = [];
let expandedDirs = new Set();
let dragTarget = null;
let offX, offY;
let runtimeWindow = null;
let runtimeWatchTimer = null;

// --- BUILD WIZARD STATE ---
let bwTarget = 'windows';
let bwSSE = null;
let bwProgress = 0;
let bwProgressInterval = null;
let bwAbortRequested = false;
const VALID_BUILD_TARGETS = ['windows', 'macos', 'android', 'ios', 'web', 'electron'];
const ALL_BUILD_TARGETS = ['windows', 'macos', 'android', 'ios', 'web'];

function normalizeBuildTarget(target) {
    if (!target || target === 'win') return 'windows';
    return target;
}

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

        // React (studio-dist) builds are surfaced via the "NEW BUILDS" dropdown
        // above the sidebar instead of cluttering the main category lists.
        const isReactTool = t => t.src.startsWith('studio-dist/');

        tools.filter(t => !isReactTool(t) && t.status !== 'hidden').forEach(t => {
            if(!grouped[t.category]) grouped[t.category] = [];
            grouped[t.category].push(t);
        });

        const reactSelect = document.getElementById('react-tools-select');
        if (reactSelect) {
            reactSelect.innerHTML = '<option value="">NEW BUILDS ▾</option>';
            tools.filter(t => isReactTool(t) && t.status !== 'hidden').forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.title.toUpperCase();
                reactSelect.appendChild(opt);
            });
        }
        
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

    const startupReady = await determineStartupWindow();
    if (!startupReady) return;

    setInterval(updateSystemMeter, 3000);
    updateSystemMeter();
    
    initWorkspaceV2();
    initDragAndDropBroker();
    
    hookConsole();
    refreshGitStatus();
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
            return false;
        } else {
            if (window.RedglitchProjectState && window.RedglitchProjectState.projectName !== projName) {
                await window.RedglitchProjectState.switchProject(projName);
            }
            console.log("[Studio] Project active, opening Command Center...");
            const dashboardTool = tools.find(t => t.id === 'project_dashboard');
            if (dashboardTool) {
                openWindow(dashboardTool);
            } else {
                console.warn("[Studio] project_dashboard tool not found in registry.");
            }
            return true;
        }

    } catch(e) {
        console.error("[Studio] Startup error:", e);
        console.log("[Studio] Redirecting to dashboard due to error...");
        window.location.href = 'dashboard.html';
        return false;
    }
}

window.onProjectLoaded = async function(name) {
    if (!name) return;
    window._redglitchActiveProject = name;

    const launcherId = 'win-dashboard';
    const launcherWin = document.getElementById(launcherId);
    if (launcherWin) closeWindow(launcherId);

    const projNameEl = document.getElementById('sb-project-name');
    if (projNameEl) projNameEl.innerText = formatProjectName(name);
    updateTitlebarProjectLabel(name, false);

    if (window.RedglitchProjectState) {
        try {
            await window.RedglitchProjectState.switchProject(name);
        } catch (err) {
            console.warn('[Studio] RedglitchProjectState switch failed:', err);
        }
    }

    // Reload open editor iframes cleanly with the switched project parameter.
    document.querySelectorAll('#window-container iframe').forEach(frame => {
        const currentSrc = frame.getAttribute('src');
        if (!currentSrc) return;
        try {
            const url = new URL(currentSrc, window.location.href);
            url.searchParams.set('project', name);
            url.searchParams.set('v', String(Date.now()));
            frame.src = url.pathname.replace(/^\//, '') + url.search;
        } catch (err) {
            console.warn('[Studio] Could not reload editor frame:', err);
        }
    });

    if (typeof window.loadTree === 'function') window.loadTree();
    refreshGitStatus();

    const cmdCenter = tools.find(t => t.id === 'project_dashboard');
    if (cmdCenter) openWindow(cmdCenter);
    showStatusMessage(`PROJECT LOADED: ${name.toUpperCase()}`);
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
        if (window.RedglitchEventBus) window.RedglitchEventBus.emit('editor:error', { message: msg });
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
    } else if (data.type === 'openTool' && (data.tool || data.target || data.src)) {
        openTool(data.tool || data.target || data.src, {
            file: data.file,
            script: data.scriptId || data.script,
            sprite: data.sprite
        });
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
    if (document.hidden) return;
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
function buildToolIframeUrl(tool) {
    let url = tool.src || '';
    if (window._redglitchActiveProject && !/[?&]project=/.test(url)) {
        url += (url.includes('?') ? '&' : '?') + 'project=' + encodeURIComponent(window._redglitchActiveProject);
    }
    url += (url.includes('?') ? '&' : '?') + 'v=cachebustLayout';
    return url;
}

function openWindow(tool) {
    if (!tool) return;
    if (tool.aliasOf) {
        const canonical = tools.find(t => t.id === tool.aliasOf);
        if (canonical) {
            tool = { ...canonical, src: tool.src || canonical.src, requestedFile: tool.requestedFile };
        }
    }

    const winId = 'win-' + tool.id;
    let win = document.getElementById(winId);

    if (!win) {
        win = document.createElement('div');
        win.id = winId;
        win.className = 'window maximized';
        const iframeSrc = buildToolIframeUrl(tool);

        win.innerHTML = `
            <div class="window-title" 
                 onmousedown="startDrag(event, '${_escapeHtml(winId)}')"
                 ondblclick="toggleMaximize('${_escapeHtml(winId)}')">
                <div><i class="fas ${_escapeHtml(tool.icon)}"></i> ${_escapeHtml(tool.title.toLowerCase())}</div>
                <div class="window-controls">
                    <div class="window-btn" onclick="minimizeWindow('${_escapeHtml(winId)}')">_</div>
                    <div class="window-btn" onclick="toggleMaximize('${_escapeHtml(winId)}')">□</div>
                    <div class="window-btn close" onclick="closeWindow('${_escapeHtml(winId)}')">×</div>
                </div>
            </div>
            <div class="window-content">
                <iframe id="frame-${_escapeHtml(tool.id)}" src="${_escapeHtml(iframeSrc)}"></iframe>
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

        const queryPart = tool.src && tool.src.includes('?') ? tool.src.split('?')[1] : '';
        const requestedFile = tool.requestedFile || new URLSearchParams(queryPart).get('file');
        if ((tool.id === 'script' || tool.id === 'script_legacy') && requestedFile) {
            const existingFrame = win.querySelector('iframe');
            const existingSrc = existingFrame ? existingFrame.getAttribute('src') || '' : '';
            if (existingFrame && existingSrc.startsWith('studio-dist/') && !tool.src.startsWith('studio-dist/')) {
                existingFrame.src = buildToolIframeUrl(tool);
            } else if (window.RedglitchEventBus) {
                window.RedglitchEventBus.emit('script:request', { scriptPath: requestedFile });
            }
        }
    }
    
    if (window.RedglitchProjectState) {
        window.RedglitchProjectState.logActivity('tool', tool.title, { id: tool.id });
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

function notifyWindowVisibility(winEl, visible) {
    if (!winEl) return;
    const flag = visible ? 'true' : 'false';
    if (winEl.dataset.studioVisible === flag) return;
    winEl.dataset.studioVisible = flag;
    const iframe = winEl.querySelector('iframe');
    if (iframe) {
        if (!winEl._studioVisLoadHooked) {
            winEl._studioVisLoadHooked = true;
            iframe.addEventListener('load', () => {
                const cur = winEl.dataset.studioVisible === 'true';
                try { iframe.contentWindow?.postMessage({ type: 'studio:visibility', visible: cur }, '*'); } catch (_) {}
            });
        }
        try {
            iframe.contentWindow?.postMessage({ type: 'studio:visibility', visible }, '*');
        } catch (_) {}
    }
}

function syncAllWindowVisibility() {
    const wins = document.querySelectorAll('.window');
    let maximizedWin = null;
    for (const w of wins) {
        if (w.style.display !== 'none' && w.classList.contains('maximized')) {
            maximizedWin = w;
        }
    }
    for (const w of wins) {
        const isOpen = w.style.display !== 'none';
        const visible = isOpen && (!maximizedWin || w === maximizedWin);
        notifyWindowVisibility(w, visible);
    }
}

function ensureWindowVisibilityObserver() {
    if (window._studioVisObserver) return;
    const ws = document.getElementById('workspace') || document.body;
    if (!ws || typeof MutationObserver === 'undefined') return;
    window._studioVisObserver = new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.type === 'attributes' && m.target.classList?.contains('window')) {
                syncAllWindowVisibility();
                break;
            }
            if (m.type === 'childList' && m.target === ws) {
                syncAllWindowVisibility();
                break;
            }
        }
    });
    window._studioVisObserver.observe(ws, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });
}

function closeWindow(id) {
    const win = document.getElementById(id);
    if (win) {
        win.style.display = 'none'; // Keep-Alive: just hide the element
        win.classList.remove('focused');
        if (focusedWinId === id) focusedWinId = null;
        notifyWindowVisibility(win, false);
    }
    const toolId = id.replace('win-', '');
    const btn = document.getElementById('btn-' + toolId);
    if (btn) { 
        btn.classList.remove('opened'); 
        btn.classList.remove('active'); 
    }
    syncAllWindowVisibility();
}

function minimizeWindow(id) {
    const win = document.getElementById(id);
    if (win) {
        win.style.display = 'none';
        win.classList.remove('focused');
        if (focusedWinId === id) focusedWinId = null;
        notifyWindowVisibility(win, false);
    }
    const btn = document.getElementById('btn-' + id.replace('win-',''));
    if (btn) btn.classList.remove('active');
    syncAllWindowVisibility();
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
    ensureWindowVisibilityObserver();
    if (focusedWinId === id) {
        syncAllWindowVisibility();
        return; // Skip if already focused
    }
    
    document.querySelectorAll('.window').forEach(w => w.classList.remove('focused'));
    document.querySelectorAll('.tool-btn-sidebar').forEach(b => b.classList.remove('active'));
    
    const win = document.getElementById(id);
    if(win) {
        focusedWinId = id;
        win.style.display = 'flex'; 
        win.classList.add('focused');
        notifyWindowVisibility(win, true);
        win.style.zIndex = ++zIndexCounter;
        const toolId = id.replace('win-', '');
        const btn = document.getElementById('btn-' + toolId);
        if (btn) btn.classList.add('active');
    }
    syncAllWindowVisibility();
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
    // Open Project List Shortcut (Ctrl+O / Cmd+O)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openProjectManager('open');
        return;
    }

    // Global Save Shortcut (Ctrl+S / Cmd+S)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveGlobalProject();
        return;
    }

    // Workspace Panning (Shift + W/A/S/D)
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

let _globalSaveInFlight = null;
const GLOBAL_SAVE_LISTENER_IDS = new Set([
    'studio_3d',
    'iso_studio',
    'menu',
    'editor',
    'loc',
    'localization',
    'script_legacy'
]);

async function runFrameSave(frameWindow, options = {}) {
    const saveHooks = [
        () => (typeof frameWindow.saveToServer === 'function' ? frameWindow.saveToServer.bind(frameWindow) : null),
        () => (typeof frameWindow.saveAllFiles === 'function' ? frameWindow.saveAllFiles.bind(frameWindow) : null),
        () => (typeof frameWindow.saveProject === 'function' ? frameWindow.saveProject.bind(frameWindow) : null),
        () => (typeof frameWindow.saveEffect === 'function' ? frameWindow.saveEffect.bind(frameWindow) : null),
        () => (typeof frameWindow.saveCutscene === 'function' ? frameWindow.saveCutscene.bind(frameWindow) : null),
        () => (typeof frameWindow.saveLogic === 'function' ? frameWindow.saveLogic.bind(frameWindow) : null),
        () => (typeof frameWindow.saveShader === 'function' ? frameWindow.saveShader.bind(frameWindow) : null),
        () => (typeof frameWindow.editor?.saveLevel === 'function' ? frameWindow.editor.saveLevel.bind(frameWindow.editor) : null),
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
            await Promise.resolve(invoke(options.silent ? { silent: true } : undefined));
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

function frameUsesGlobalSaveBus(frame) {
    if (!window.RedglitchEventBus || !frame) return false;
    const toolId = (frame.id || '').replace(/^frame-/, '');
    if (GLOBAL_SAVE_LISTENER_IDS.has(toolId)) return true;
    if (toolId === 'script') {
        const src = frame.getAttribute('src') || '';
        return !src.startsWith('studio-dist/');
    }
    return false;
}

async function saveGlobalProject(options = {}) {
    if (_globalSaveInFlight) {
        return _globalSaveInFlight;
    }

    _globalSaveInFlight = (async () => {
        const silent = !!options.silent;
        if (!silent) showStatusMessage("SAVING PROJECT...");

        let saved = 0;
        let warned = 0;
        
        // Save Central Project State
        if (window.RedglitchProjectState && window.RedglitchProjectState.isDirty) {
            await window.RedglitchProjectState.saveProject();
            saved++;
        }

        const frames = getOpenEditorFrames();

        // Broadcast global save event once for editors subscribed to system:global_save
        if (window.RedglitchEventBus) {
            window.RedglitchEventBus.emit('system:global_save', { timestamp: Date.now(), silent });
        }

        if (frames.length === 0 && saved === 0) {
            if (!silent) showStatusMessage("NO OPEN TOOLS TO SAVE");
            return { total: 0, saved: 0, warned: 0 };
        }

        for (const frame of frames) {
            if (frameUsesGlobalSaveBus(frame)) {
                // Already handled by the system:global_save broadcast above; avoid concurrent double-save.
                saved++;
                continue;
            }
            const ok = await runFrameSave(frame.contentWindow, { silent });
            if (ok) saved++;
            else warned++;
        }

        if (!silent) {
            if (warned > 0) showStatusMessage(`PROJECT SAVED (${saved}/${frames.length}, ${warned} PARTIAL)`);
            else showStatusMessage(`PROJECT SAVED (${saved} TOOLS)`);
        }

        return { total: frames.length, saved, warned };
    })();

    try {
        return await _globalSaveInFlight;
    } finally {
        _globalSaveInFlight = null;
    }
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

window.openReactTool = function(toolId) {
    if (!toolId) return;
    const tool = tools.find(t => t.id === toolId);
    if (tool) openWindow(tool);
    const select = document.getElementById('react-tools-select');
    if (select) select.value = '';
};

const TOOL_OPEN_ALIASES = {
    'asset-manager': 'assets',
    asset_manager: 'assets',
    'asset_manager.html': 'assets',
    'studio-dist/asset_manager.html': 'assets',
    pixel_editor: 'pixel',
    'pixel_editor.html': 'pixel',
    audio_tool: 'daw',
    'daw.html': 'daw',
    prefab_editor: 'prefab',
    script_editor: 'script',
    'script_editor.html': 'script_legacy',
    quest: 'quests',
    achievement: 'achievements',
    cutscene: 'interactive_cutscene',
    localization: 'loc',
    fx: 'fxpro',
    algorithm_studio: 'algorithm'
};

function openTool(targetOrSrc, params = {}) {
    if (!targetOrSrc) return null;
    let raw = typeof targetOrSrc === 'object' ? (targetOrSrc.target || targetOrSrc.id || targetOrSrc.src) : targetOrSrc;
    if (!raw) return null;

    const normalized = String(raw).trim();
    const mappedId = TOOL_OPEN_ALIASES[normalized] || TOOL_OPEN_ALIASES[normalized.toLowerCase()] || normalized;
    let tool = tools.find(t => t.id === mappedId || t.src === normalized || t.id === normalized);
    if (!tool) return null;

    if (tool.aliasOf) {
        const canonical = tools.find(t => t.id === tool.aliasOf);
        if (canonical) tool = canonical;
    }

    if (params && typeof params === 'object') {
        const query = new URLSearchParams();
        if (params.file) query.set('file', params.file);
        if (params.script) query.set('script', params.script);
        if (params.sprite) query.set('sprite', params.sprite);
        const qs = query.toString();
        if (qs) {
            const sep = tool.src.includes('?') ? '&' : '?';
            tool = { ...tool, src: `${tool.src}${sep}${qs}`, requestedFile: params.file };
        }
    }

    openWindow(tool);
    return tool;
}

function openProjectSettings() {
    const cmdCenter = tools.find(t => t.id === 'project_dashboard');
    if (cmdCenter) {
        openWindow(cmdCenter);
        showStatusMessage("OPENED PROJECT COMMAND CENTER");
    }
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

// Phase 20: Final QA & Stress Testing
function qaStressTest() {
    if (window.RedglitchEventBus) {
        console.log('[Studio] Firing qa_stress_test...');
        window.RedglitchEventBus.emit('debug:spawn_stress_test', { amount: 500 });
        
        // Show brief UI feedback
        const msgEl = document.getElementById('sb-message');
        if (msgEl) {
            const oldMsg = msgEl.textContent;
            msgEl.textContent = 'STRESS TEST INITIATED: 500 ENTITIES';
            msgEl.style.color = '#ff3366';
            setTimeout(() => {
                msgEl.textContent = oldMsg;
                msgEl.style.color = '';
            }, 3000);
        }
    }
}

// --- PROJECT WIZARD & ASSET SCAN ---
function switchProjectModalTab(mode = 'open') {
    const openPane = document.getElementById('pm-pane-open');
    const newPane = document.getElementById('pm-pane-new');
    const tabOpen = document.getElementById('pm-tab-open');
    const tabNew = document.getElementById('pm-tab-new');
    const isNew = mode === 'new';

    if (openPane) openPane.style.display = isNew ? 'none' : 'flex';
    if (newPane) newPane.style.display = isNew ? 'flex' : 'none';
    if (tabOpen) {
        tabOpen.classList.toggle('bw-btn-primary', !isNew);
        tabOpen.classList.toggle('bw-btn-cancel', isNew);
    }
    if (tabNew) {
        tabNew.classList.toggle('bw-btn-primary', isNew);
        tabNew.classList.toggle('bw-btn-cancel', !isNew);
    }

    if (isNew) {
        loadProjectTemplates();
        setTimeout(() => document.getElementById('new-proj-name')?.focus(), 50);
    } else {
        loadExistingProjects();
    }
}

async function loadExistingProjects() {
    const container = document.getElementById('existing-projects-list');
    if (!container) return;
    container.innerHTML = '<div style="color:#555; padding:20px;">Loading projects...</div>';
    try {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('Failed to list projects');
        const projects = await res.json();
        container.innerHTML = '';
        if (!Array.isArray(projects) || projects.length === 0) {
            container.innerHTML = '<div style="color:#888; padding:20px;">No projects found. Switch to NEW PROJECT to create one.</div>';
            return;
        }
        projects.forEach(p => {
            const card = document.createElement('div');
            const isActive = window._redglitchActiveProject && p.name === window._redglitchActiveProject;
            card.className = 'template-card' + (isActive ? ' active' : '');
            card.onclick = () => switchToProject(p.name);
            const icon = p.metadata?.is3D ? '🧊' : (p.engineType === 'platformer-2d' ? '🏃' : (p.engineType === 'iso-pixel' ? '💠' : '⚔️'));
            const metaLine = [p.engineType || 'rpg-topdown', p.version || '0.1.0'].join(' • ');
            card.innerHTML = `
                <div class="template-thumb">${icon}</div>
                <div class="template-info">
                    <div class="template-name">${_escapeHtml(p.name)}${isActive ? ' (ACTIVE)' : ''}</div>
                    <div class="template-cat">${_escapeHtml(metaLine)}</div>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        container.innerHTML = '<div style="color:var(--red); padding:20px;">Failed to load projects.</div>';
    }
}

async function switchToProject(name) {
    if (!name) return;
    showStatusMessage(`SWITCHING TO ${name.toUpperCase()}...`);
    try {
        const res = await fetch('/api/projects/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Switch failed');
        closeProjectModal();
        await window.onProjectLoaded(data.active || name);
    } catch (e) {
        alert("Failed to open project: " + e.message);
        showStatusMessage("PROJECT SWITCH FAILED");
    }
}

async function loadProjectTemplates() {
    const savedAuthor = localStorage.getItem('redglitch_author');
    if (savedAuthor) {
        const authorEl = document.getElementById('new-proj-author');
        if (authorEl) authorEl.value = savedAuthor;
    }
    const container = document.getElementById('template-list');
    if (!container) return;
    container.innerHTML = '<div style="color:#555; padding:20px;">Loading templates...</div>';
    try {
        const res = await fetch('/api/templates');
        if (!res.ok) throw new Error('Failed to fetch templates');
        renderTemplates(await res.json());
    } catch (e) {
        container.innerHTML = '<div style="color:var(--red);">Failed to load templates.</div>';
    }
}

async function openProjectManager(mode = 'open') {
    const modal = document.getElementById('project-modal');
    if (modal) modal.style.display = 'flex';
    switchProjectModalTab(mode === 'new' ? 'new' : 'open');
}

function renderTemplates(list) {
    const container = document.getElementById('template-list');
    container.innerHTML = '';
    list.forEach(t => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.onclick = () => selectTemplate(t, card);
        let icon = t.category === 'RPG' ? '⚔️' : (t.category === 'Platformer' ? '🏃' : '📦');
        card.innerHTML = `<div class="template-thumb">${icon}</div><div class="template-info"><div class="template-name">${_escapeHtml(t.name)}</div><div class="template-cat">${_escapeHtml(t.category)}</div></div>`;
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
        const switchRes = await fetch('/api/projects/switch', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: data.name }) });
        if (!switchRes.ok) throw new Error('Failed to activate new project');
        closeProjectModal();
        await window.onProjectLoaded(data.name);
        btn.innerHTML = '<span>+</span> CREATE PROJECT'; btn.disabled = false;
    } catch (e) { alert("Creation failed: " + e.message); btn.innerHTML = '<span>+</span> CREATE PROJECT'; btn.disabled = false; }
}

async function scanAssets(labelPrefix = 'INDEXED') {
    showStatusMessage("INDEXING ASSETS...");
    try {
        const res = await fetch('/api/assets/rebuild', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Index failed');
        if (typeof window.loadTree === 'function') await window.loadTree();
        showStatusMessage(`${labelPrefix} ${data.count ?? 0} ASSETS`);
    } catch(e) { showStatusMessage("INDEX FAILED"); }
}

async function crunchAssets() {
    showStatusMessage("REBUILDING ASSET REGISTRY...");
    return scanAssets('CRUNCHED / INDEXED');
}

async function probeAssets() {
    showStatusMessage("PROBING ASSET REGISTRY...");
    try {
        const res = await fetch('/api/assets');
        if (!res.ok) throw new Error('Probe failed');
        const data = await res.json();
        const assets = Array.isArray(data.assets) ? data.assets : [];
        const imgs = assets.filter(a => a.type === 'image').length;
        const audio = assets.filter(a => a.type === 'audio').length;
        showStatusMessage(`ASSETS: ${assets.length} TOTAL (${imgs} IMG, ${audio} AUDIO)`);
    } catch (e) {
        showStatusMessage("ASSET PROBE FAILED");
    }
}

async function refreshGitStatus() {
    const branchEl = document.getElementById('git-branch-name');
    const summaryEl = document.getElementById('git-changes-summary');
    const sbGit = document.getElementById('sb-git-branch');
    try {
        const res = await fetch('/api/git/status');
        if (!res.ok) throw new Error('Git status failed');
        const data = await res.json();
        const raw = String(data.status || '').trim();
        if (!raw || raw === 'Your branch is up to date.') {
            if (branchEl) branchEl.textContent = 'clean';
            if (summaryEl) summaryEl.innerHTML = '<span style="color:var(--green)">0+</span> <span style="color:var(--red)">0Δ</span>';
            if (sbGit) sbGit.textContent = 'git';
            return;
        }
        if (raw.startsWith('Error:')) {
            if (branchEl) branchEl.textContent = 'unavailable';
            if (summaryEl) summaryEl.innerHTML = '<span style="color:#888">--</span>';
            if (sbGit) sbGit.textContent = 'git?';
            return;
        }
        const lines = raw.split('\n').filter(Boolean);
        let added = 0;
        let changed = 0;
        lines.forEach(line => {
            if (line.startsWith('??') || line.startsWith('A')) added++;
            else changed++;
        });
        if (branchEl) branchEl.textContent = `${lines.length} pending`;
        if (summaryEl) summaryEl.innerHTML = `<span style="color:var(--green)">${added}+</span> <span style="color:var(--red)">${changed}Δ</span>`;
        if (sbGit) sbGit.textContent = `git* (${lines.length})`;
    } catch (e) {
        if (branchEl) branchEl.textContent = 'offline';
    }
}

async function commitGitChanges() {
    const message = prompt('Commit message:');
    if (!message || !message.trim()) return;
    showStatusMessage("STAGING & COMMITTING...");
    try {
        const addRes = await fetch('/api/git/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: '.' })
        });
        const addData = await addRes.json().catch(() => ({}));
        if (!addRes.ok || addData.success === false) {
            throw new Error(addData.error || 'git add failed');
        }
        const commitRes = await fetch('/api/git/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message.trim() })
        });
        const commitData = await commitRes.json().catch(() => ({}));
        if (!commitRes.ok || commitData.success === false) {
            throw new Error(commitData.error || 'git commit failed');
        }
        await refreshGitStatus();
        showStatusMessage("GIT COMMIT COMPLETE");
    } catch (e) {
        showStatusMessage("GIT COMMIT FAILED");
        alert("Git commit failed: " + e.message);
    }
}

async function wipeSaves() {
    if (!confirm('Wipe all save slots? This cannot be undone.')) return;
    showStatusMessage("WIPING SAVE SLOTS...");
    try {
        const res = await fetch('/api/slots');
        if (!res.ok) throw new Error('Failed to fetch save slots');
        const slots = await res.json();
        const occupied = Array.isArray(slots) ? slots.filter(s => s && !s.isEmpty) : [];
        if (occupied.length === 0) {
            showStatusMessage("NO SAVE SLOTS TO WIPE");
            return;
        }
        await Promise.all(occupied.map(async s => {
            const del = await fetch(`/api/slots/${encodeURIComponent(s.slotId)}`, { method: 'DELETE' });
            if (!del.ok) throw new Error(`Failed to clear slot ${s.slotId}`);
        }));
        showStatusMessage(`WIPED ${occupied.length} SAVE SLOT(S)`);
    } catch (e) {
        console.error('[Studio] wipeSaves failed:', e);
        showStatusMessage("WIPE SAVES FAILED");
    }
}

async function dumpProjectDatabase() {
    showStatusMessage("EXPORTING PROJECT SUMMARY...");
    try {
        const [projRes, assetsRes, treeRes] = await Promise.all([
            fetch('/api/projects/current'),
            fetch('/api/assets').catch(() => null),
            fetch('/api/ide/tree').catch(() => null)
        ]);
        const project = projRes.ok ? await projRes.json() : { name: window._redglitchActiveProject || 'Default Project' };
        const assets = assetsRes && assetsRes.ok ? await assetsRes.json() : { assets: [] };
        const rawTree = treeRes && treeRes.ok ? await treeRes.json() : [];
        const tree = Array.isArray(rawTree) ? rawTree : (rawTree?.tree || []);
        const summary = {
            exportedAt: new Date().toISOString(),
            project,
            sharedState: window.RedglitchProjectState ? window.RedglitchProjectState.export() : null,
            assetCount: Array.isArray(assets.assets) ? assets.assets.length : 0,
            assets: assets.assets || [],
            tree
        };
        const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (window._redglitchActiveProject || project.name || 'project').replace(/[^a-zA-Z0-9_-]+/g, '_');
        a.download = `${safeName}_db_dump.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showStatusMessage("EXPORTED PROJECT DB SUMMARY");
    } catch (e) {
        console.error('[Studio] dumpProjectDatabase failed:', e);
        showStatusMessage("DB EXPORT FAILED");
    }
}

// --- FILE TREE ---
window.loadTree = async function() {
    const container = document.getElementById('file-tree-right');
    if (!container) return;
    container.innerHTML = '<div style="padding:10px; opacity:0.5;">SCANNING...</div>';
    try {
        const res = await fetch('/api/ide/tree');
        if (!res.ok) throw new Error('Tree fetch failed');
        const data = await res.json();
        fileTreeData = Array.isArray(data) ? data : (data?.tree || []);
        const footer = document.getElementById('file-manager-footer');
        if (footer) {
            footer.textContent = (data && data.truncated) ? 'REAL-TIME SYNC ACTIVE (TREE TRUNCATED)' : 'REAL-TIME SYNC ACTIVE';
        }
        window.renderTree();
    } catch (e) { container.innerHTML = '<div style="color:var(--red); padding:10px;">FAILED TO LOAD TREE</div>'; }
};

window.renderTree = function() {
    const container = document.getElementById('file-tree-right');
    if (!container) return;
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
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
        div.innerHTML = `<span style="width:16px; text-align:center;">${icon}</span><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${_escapeHtml(node.name.toLowerCase())}</span>`;
        div.onclick = (e) => {
            e.stopPropagation();
            if (node.type === 'file') {
                const tool = tools.find(t => t.id === 'script');
                if (tool) openWindow({...tool, src: `script_editor.html?file=${encodeURIComponent(node.path)}`, requestedFile: node.path});
            } else {
                if (expandedDirs.has(node.path)) expandedDirs.delete(node.path);
                else expandedDirs.add(node.path);
                window.renderTree();
            }
        };
        frag.appendChild(div);
        if (isDir && expandedDirs.has(node.path) && node.children) {
            const sorted = [...node.children].sort((a,b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'dir' ? -1 : 1;
            });
            sorted.forEach(c => buildNode(c, depth + 1));
        }
    }
    fileTreeData.forEach(root => buildNode(root, 0));
    container.appendChild(frag);
};

window.createNewFile = async function() {
    const name = prompt("New file name:");
    if (!name) return;
    try {
        const res = await fetch('/api/ide/write', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ file: name.trim(), content: "// Redglitch Script\n" }) });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to create file');
        }
        await window.loadTree();
        showStatusMessage(`CREATED FILE: ${name.trim()}`);
    } catch (e) { alert("Failed to create file: " + e.message); }
};

window.createNewFolder = async function() {
    const raw = prompt("New folder path (relative to project):");
    if (!raw) return;
    const folder = raw.trim().replace(/^\/+|\/+$/g, '');
    if (!folder || folder.includes('..')) {
        alert("Invalid folder path.");
        return;
    }
    try {
        const res = await fetch('/api/ide/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: `${folder}/.keep`, content: '' })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to create folder');
        }
        expandedDirs.add(folder);
        await window.loadTree();
        showStatusMessage(`CREATED FOLDER: ${folder}`);
    } catch (e) {
        alert("Failed to create folder: " + e.message);
    }
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

function runBuildStream(target, projName) {
    return new Promise((resolve) => {
        bwSSE = new EventSource(`/api/build/stream?target=${encodeURIComponent(target)}&project=${encodeURIComponent(projName)}`);
        bwSSE.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === 'log' || msg.type === 'error') bwAppendLog(msg.text);
            else if (msg.type === 'done') {
                if (bwSSE) { bwSSE.close(); bwSSE = null; }
                resolve({ success: !!msg.success, path: msg.path || '' });
            }
        };
        bwSSE.onerror = () => {
            if (bwSSE) { bwSSE.close(); bwSSE = null; }
            bwAppendLog(`\n[ERROR] Connection lost while building ${target}.\n`);
            resolve({ success: false, path: '' });
        };
    });
}

async function bwStartBuild() {
    bwShowStep(2);
    bwAbortRequested = false;
    document.getElementById('bw-footer').innerHTML = `<button class="bw-btn bw-btn-danger" onclick="closeBuildWizard()">ABORT</button>`;
    const log = document.getElementById('bw-log');
    log.innerHTML = '';
    document.getElementById('bw-progress').style.width = '0%';
    document.getElementById('bw-pct').innerText = '0%';
    document.getElementById('bw-spinner').style.display = '';

    const projName = window._redglitchActiveProject || 'Default Project';
    const target = normalizeBuildTarget(bwTarget);
    bwProgress = 0;
    bwProgressInterval = setInterval(() => {
        if (bwProgress < 89) {
            bwProgress += Math.random() * (90 - bwProgress) * 0.04;
            document.getElementById('bw-progress').style.width = bwProgress + '%';
            document.getElementById('bw-pct').innerText = Math.round(bwProgress) + '%';
        }
    }, 800);

    const targetsToRun = target === 'all' ? ALL_BUILD_TARGETS : [target];
    let overallSuccess = true;
    let lastPath = '';

    for (let i = 0; i < targetsToRun.length; i++) {
        if (bwAbortRequested) {
            overallSuccess = false;
            break;
        }
        const t = targetsToRun[i];
        if (targetsToRun.length > 1) {
            bwAppendLog(`\n[WIZARD] === Target ${i + 1}/${targetsToRun.length}: ${t.toUpperCase()} ===\n`);
        }
        const result = await runBuildStream(t, projName);
        if (result.path) lastPath = result.path;
        if (!result.success) {
            overallSuccess = false;
            if (targetsToRun.length > 1) {
                bwAppendLog(`[ERROR] Target ${t.toUpperCase()} failed.\n`);
            }
            break;
        }
    }

    clearInterval(bwProgressInterval);
    document.getElementById('bw-progress').style.width = '100%';
    document.getElementById('bw-pct').innerText = '100%';
    document.getElementById('bw-spinner').style.display = 'none';
    if (!bwAbortRequested) {
        setTimeout(() => bwShowResult(overallSuccess, lastPath), 400);
    }
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
    bwTarget = normalizeBuildTarget(target || currentBuildTarget);
    ['windows','macos','android','ios','web','electron','all'].forEach(t => document.getElementById('bwtc-' + t)?.classList.toggle('selected', t === bwTarget));
    document.getElementById('bw-project-name').innerText = window._redglitchActiveProject || 'Default Project';
    const labelMap = { windows:'WINDOWS', macos:'MACOS', android:'ANDROID', ios:'IOS', web:'WEB', electron:'ELECTRON', all:'ALL CI' };
    document.getElementById('bw-target-label').innerText = labelMap[bwTarget] || bwTarget.toUpperCase();
    bwShowStep(1);
    document.getElementById('bw-footer').innerHTML = `<button class="bw-btn bw-btn-cancel" onclick="closeBuildWizard()">CANCEL</button><button class="bw-btn bw-btn-primary" id="bw-btn-start" onclick="bwStartBuild()">START BUILD</button>`;
    document.getElementById('build-wizard').style.display = 'flex';
}

function closeBuildWizard() {
    bwAbortRequested = true;
    if (bwSSE) { bwSSE.close(); bwSSE = null; }
    clearInterval(bwProgressInterval);
    document.getElementById('build-wizard').style.display = 'none';
}

function bwSelectTarget(t) {
    bwTarget = normalizeBuildTarget(t);
    ['windows','macos','android','ios','web','electron','all'].forEach(id => document.getElementById('bwtc-' + id)?.classList.toggle('selected', id === bwTarget));
    const labelMap = { windows:'WINDOWS', macos:'MACOS', android:'ANDROID', ios:'IOS', web:'WEB', electron:'ELECTRON', all:'ALL CI' };
    document.getElementById('bw-target-label').innerText = labelMap[bwTarget] || bwTarget.toUpperCase();
}

function setBuildTarget(target) {
    const normalized = normalizeBuildTarget(target);
    currentBuildTarget = normalized;
    const selectEl = document.getElementById('build-target');
    if (selectEl) selectEl.value = normalized;
    
    const labelMap = {
        windows: 'Windows (EXE)',
        macos: 'macOS (.app)',
        android: 'Android (APK)',
        ios: 'iOS (Xcode)',
        web: 'Web (HTML5)',
        electron: 'Electron (Desktop)',
        all: 'All targets'
    };
    const sbEl = document.getElementById('sb-build-target');
    if (sbEl) sbEl.innerText = labelMap[normalized] || normalized.toUpperCase();
    
    showStatusMessage(`BUILD TARGET SET: ${normalized.toUpperCase()}`);
}

function buildGame(target) {
    openBuildWizard(normalizeBuildTarget(target || currentBuildTarget));
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

// Listen for cross-frame save requests
if (window.RedglitchEventBus) {
    window.RedglitchEventBus.on('system:project:save_request', () => {
        saveGlobalProject();
    });
}
window.confirmClose = confirmClose;
window.toggleConsole = toggleConsole;
window.dispatchGlobalCommand = dispatchGlobalCommand;
window.qaStressTest = qaStressTest;
window.toggleFullscreen = toggleFullscreen;
window.scanAssets = scanAssets;
window.crunchAssets = crunchAssets;
window.probeAssets = probeAssets;
window.refreshGitStatus = refreshGitStatus;
window.commitGitChanges = commitGitChanges;
window.wipeSaves = wipeSaves;
window.dumpProjectDatabase = dumpProjectDatabase;
window.openProjectSettings = openProjectSettings;
window.openProjectManager = openProjectManager;
window.switchProjectModalTab = switchProjectModalTab;
window.loadExistingProjects = loadExistingProjects;
window.switchToProject = switchToProject;
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
    if (window.RedglitchEventBus) {
        window.RedglitchEventBus.emit('system:memory:request', { namespace: 'campaign' });
        showStatusMessage("REQUESTING CAMPAIGN STATE...");
    }
}

function takeCampaignSnapshot() {
    if (!window.RedglitchEventBus) return;
    
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
        if (window.RedglitchEventBus) {
            window.RedglitchEventBus.emit('system:memory:patch', {
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
                
                const safeKey = _escapeHtml(k);
                const safeArg = JSON.stringify(k).replace(/"/g, '&quot;');
                row.innerHTML = `
                    <span style="font-family:VT323; font-size:16px; color:#aaa;">${safeKey}</span>
                    <input type="number" value="${_escapeHtml(v)}" style="width:60px; background:#111; color:var(--accent); border:1px solid #333; font-family:VT323; font-size:16px; text-align:right;" 
                        onchange="patchCampaignVariable(${safeArg}, this.value)">
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
                
                const safeKey = _escapeHtml(k);
                const safeArg = JSON.stringify(k).replace(/"/g, '&quot;');
                row.innerHTML = `
                    <span style="font-family:VT323; font-size:16px; color:#aaa;">${safeKey}</span>
                    <input type="checkbox" ${v ? 'checked' : ''} onchange="patchCampaignFlag(${safeArg}, this.checked)">
                `;
                flagList.appendChild(row);
            }
        }
    }
}

window.patchCampaignVariable = function(key, val) {
    if (window.RedglitchEventBus) {
        window.RedglitchEventBus.emit('system:memory:patch', {
            namespace: 'campaign',
            patch: {
                variables: { [key]: parseFloat(val) || 0 }
            }
        });
    }
};

window.patchCampaignFlag = function(key, val) {
    if (window.RedglitchEventBus) {
        window.RedglitchEventBus.emit('system:memory:patch', {
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
        if (window.RedglitchEventBus) {
            const handleMemoryUpdate = (e) => {
                const data = e.data || {};
                const payload = data.diff || data.patch;
                if (data.namespace === 'campaign' && payload) {
                    updateLiveStateUI(payload);
                }
            };
            window.RedglitchEventBus.on('system:memory:diff', handleMemoryUpdate);
            window.RedglitchEventBus.on('system:memory:update', handleMemoryUpdate);
            
            // PHASE 11: Multi-Engine Level Streaming Sync
            window.RedglitchEventBus.on('system:engine:switch', (e) => {
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
    if (window.RedglitchEventBus) {
        window.RedglitchEventBus.emit('system:trigger:fire', {
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
    if (window.RedglitchEventBus) {
        window.RedglitchEventBus.emit('system:engine:inspect', {});
        showStatusMessage("REQUESTED ENGINE METRICS");
    }
};

if (typeof window !== 'undefined') {
    setTimeout(() => {
        if (window.RedglitchEventBus) {
            window.RedglitchEventBus.on('system:engine:inspect:response', (e) => {
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
            window.RedglitchEventBus.on('system:engine:metrics', (e) => {
                const metrics = e.data?.metrics;
                if (metrics) {
                    const fpsEl = document.getElementById('sb-engine-fps');
                    const entsEl = document.getElementById('sb-engine-ents');
                    const drawsEl = document.getElementById('sb-engine-draws');
                    const memEl = document.getElementById('sb-engine-mem');
                    
                    if (fpsEl) fpsEl.textContent = `${Math.round(metrics.fps || 0)} FPS`;
                    if (entsEl) entsEl.textContent = `${metrics.entityCount || 0} ENTS`;
                    if (drawsEl) drawsEl.textContent = `${metrics.drawCalls || 0} DRAWS`;
                    if (memEl) memEl.textContent = `${metrics.memoryMB || 0} MB`;
                }
            });
        }
    }, 1200);
}
// --- PHASE 15 & 16: GHOST MODE AND TIME DILATION ---
window.toggleGhostMode = function(enabled) {
    if (window.RedglitchEventBus) {
        window.RedglitchEventBus.emit('system:camera:mode', { mode: enabled ? 'ghost' : 'normal' });
        window.RedglitchEventBus.emit('system:engine:flag', { flag: 'ghostMode', enabled: !!enabled });
        showStatusMessage(`GHOST MODE: ${enabled ? 'ON' : 'OFF'}`);
    }
};

window.toggleEngineFlag = function(flag, enabled) {
    if (!flag) return;
    if (window.RedglitchEventBus) {
        window.RedglitchEventBus.emit('system:engine:flag', { flag, enabled: !!enabled });
    }
    showStatusMessage(`FLAG ${String(flag).toUpperCase()}: ${enabled ? 'ON' : 'OFF'}`);
};

window.setTimeScale = function(value) {
    const scale = parseFloat(value);
    const label = document.getElementById('time-scale-val');
    if (label) label.textContent = `${scale.toFixed(1)}x`;
    
    if (window.RedglitchEventBus) {
        window.RedglitchEventBus.emit('system:engine:timeScale', { scale });
    }
};

window.stepFrame = function() {
    if (window.RedglitchEventBus) {
        window.RedglitchEventBus.emit('system:engine:stepFrame', {});
        showStatusMessage("STEPPED 1 FRAME");
    }
};

// PHASE 8: Unified Drag-and-Drop Broker
function initDragAndDropBroker() {
    if (!window.RedglitchEventBus) return;
    
    const ghost = document.getElementById('global-drag-ghost');
    let currentDragPayload = null;
    let isDragging = false;
    
    window.RedglitchEventBus.on('drag:start', (e) => {
        if (!e.data || !e.data.payload) return;
        isDragging = true;
        currentDragPayload = e.data.payload;
        
        if (ghost) {
            ghost.style.display = 'block';
            ghost.innerText = e.data.label || 'Dragging...';
        }
        
        // Disable pointer events on all iframes so mouse events bubble to Studio
        document.querySelectorAll('iframe').forEach(f => f.style.pointerEvents = 'none');
        
        if (e.data.clientX && e.data.clientY) {
            updateGhostPosition(e.data.clientX, e.data.clientY, e.source);
        }
    });
    
    window.RedglitchEventBus.on('drag:move', (e) => {
        if (!isDragging) return;
        if (e.data.clientX && e.data.clientY) {
            updateGhostPosition(e.data.clientX, e.data.clientY, e.source);
        }
    });
    
    window.RedglitchEventBus.on('drag:end', (e) => {
        if (!isDragging) return;
        
        if (ghost) {
            ghost.style.display = 'none';
        }
        
        let absX = e.data.clientX;
        let absY = e.data.clientY;
        
        // If the end event was fired by an iframe, adjust coordinates
        if (e.source && !e.source.includes('tools.html')) {
            const iframes = document.querySelectorAll('iframe');
            for (const f of iframes) {
                try {
                    const srcPath = new URL(f.src, window.location.href).pathname;
                    if (e.source.includes(srcPath)) {
                        const rect = f.getBoundingClientRect();
                        absX += rect.left;
                        absY += rect.top;
                        break;
                    }
                } catch(err) {}
            }
        }
        
        // Restore pointer events temporarily to check what element we drop on
        document.querySelectorAll('iframe').forEach(f => f.style.pointerEvents = 'auto');
        
        const elements = document.elementsFromPoint(absX, absY);
        let droppedOnIframe = null;
        for (const el of elements) {
            if (el.tagName === 'IFRAME') {
                droppedOnIframe = el;
                break;
            }
        }
        
        if (droppedOnIframe) {
            const rect = droppedOnIframe.getBoundingClientRect();
            window.RedglitchEventBus.emit('drag:drop', {
                payload: currentDragPayload,
                targetId: droppedOnIframe.id.replace('frame-', ''), 
                localX: absX - rect.left,
                localY: absY - rect.top
            });
        }
        
        isDragging = false;
        currentDragPayload = null;
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            if (ghost) {
                ghost.style.left = e.clientX + 'px';
                ghost.style.top = e.clientY + 'px';
            }
            // Emit to sync coordinates if parent handles the move
            window.RedglitchEventBus.emit('drag:move', { clientX: e.clientX, clientY: e.clientY });
        }
    });
    
    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            window.RedglitchEventBus.emit('drag:end', { clientX: e.clientX, clientY: e.clientY });
        }
    });

    function updateGhostPosition(clientX, clientY, source) {
        if (!ghost) return;
        let absX = clientX;
        let absY = clientY;
        
        if (source && !source.includes('tools.html')) {
            const iframes = document.querySelectorAll('iframe');
            for (const f of iframes) {
                try {
                    const srcPath = new URL(f.src, window.location.href).pathname;
                    if (source.includes(srcPath)) {
                        const rect = f.getBoundingClientRect();
                        absX += rect.left;
                        absY += rect.top;
                        break;
                    }
                } catch(err) {}
            }
        }
        
        ghost.style.left = absX + 'px';
        ghost.style.top = absY + 'px';
    }
}
