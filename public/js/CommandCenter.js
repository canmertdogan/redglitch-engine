/**
 * RedGlitch Engine - Project Command Center Logic
 * Handles telemetry, latest activities, dev scratchpad, and system logs.
 */

// --- LOG SYSTEM ---
const Log = {
    feed: document.getElementById('log-feed'),
    autoScroll: true,
    
    add: (msg, type = 'INFO') => {
        const line = document.createElement('div');
        line.className = 'log-line';
        const time = new Date().toLocaleTimeString('en-US', {hour12:false});
        line.innerHTML = `
            <span class="log-ts">[${time}]</span>
            <span class="log-tag ${type}">${type}</span>
            <span class="log-msg">${msg}</span>
        `;
        if (Log.feed) {
            Log.feed.appendChild(line);
            if (Log.autoScroll) Log.feed.scrollTop = Log.feed.scrollHeight;
        }
    },
    
    clear: () => {
        if (Log.feed) {
            Log.feed.innerHTML = '';
            Log.add('Log cleared.', 'INFO');
        }
    },
    
    info: (msg) => Log.add(msg, 'INFO'),
    warn: (msg) => Log.add(msg, 'WARN'),
    error: (msg) => Log.add(msg, 'ERROR'),
    success: (msg) => Log.add(msg, 'SUCCESS')
};

function toggleAutoScroll() {
    Log.autoScroll = !Log.autoScroll;
    const stateEl = document.getElementById('as-state');
    if (stateEl) {
        stateEl.innerText = Log.autoScroll ? 'ON' : 'OFF';
        stateEl.style.color = Log.autoScroll ? 'var(--green)' : '#555';
    }
}

// --- COMMAND INPUT & TERMINAL ---
const Terminal = {
    history: JSON.parse(localStorage.getItem('redglitch_cmd_history') || '[]'),
    historyIndex: -1,
    currentInput: '',
    aliases: {
        'ls': 'list',
        'cls': 'clear',
        'exit': 'close',
        'q': 'close',
        'h': 'help',
        '?': 'help'
    },
    
    saveHistory() {
        localStorage.setItem('redglitch_cmd_history', JSON.stringify(this.history.slice(-50)));
    },
    
    addToHistory(cmd) {
        if (cmd && cmd !== this.history[this.history.length - 1]) {
            this.history.push(cmd);
            this.saveHistory();
        }
        this.historyIndex = -1;
    },
    
    getPreviousCommand() {
        if (this.history.length === 0) return null;
        const cmdInput = document.getElementById('cmd-input');
        if (this.historyIndex === -1) {
            this.currentInput = cmdInput ? cmdInput.value : '';
            this.historyIndex = this.history.length - 1;
        } else if (this.historyIndex > 0) {
            this.historyIndex--;
        }
        return this.history[this.historyIndex];
    },
    
    getNextCommand() {
        if (this.historyIndex === -1) return null;
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            return this.history[this.historyIndex];
        } else {
            this.historyIndex = -1;
            return this.currentInput;
        }
    },
    
    getCompletions(partial) {
        const commands = Object.keys(commandRegistry);
        const matches = commands.filter(c => c.startsWith(partial.toLowerCase()));
        return matches;
    }
};

// Command Registry
const commandRegistry = {
    help: {
        desc: 'Show available commands',
        usage: 'help [command]',
        exec: (args) => {
            if (args[0]) {
                const cmd = commandRegistry[args[0]];
                if (cmd) {
                    Log.info(`${args[0]} - ${cmd.desc}`);
                    Log.info(`Usage: ${cmd.usage}`);
                } else {
                    Log.error(`No help available for: ${args[0]}`);
                }
            } else {
                Log.info('=== REDGLITCH TERMINAL COMMANDS ===');
                Object.keys(commandRegistry).sort().forEach(cmd => {
                    Log.info(`  ${cmd.padEnd(15)} - ${commandRegistry[cmd].desc}`);
                });
                Log.info('');
                Log.info('Tips: Use UP/DOWN for history, TAB for completion, Ctrl+L to clear, Ctrl+C to cancel');
            }
        }
    },
    
    clear: {
        desc: 'Clear terminal output',
        usage: 'clear',
        exec: () => Log.clear()
    },
    
    history: {
        desc: 'Show command history',
        usage: 'history',
        exec: () => {
            if (Terminal.history.length === 0) {
                Log.info('No command history yet.');
                return;
            }
            Terminal.history.forEach((cmd, i) => {
                Log.info(`  ${(i+1).toString().padStart(3)} | ${cmd}`);
            });
        }
    },
    
    scan: {
        desc: 'Scan and index project assets',
        usage: 'scan',
        exec: () => scanAssets()
    },
    
    run: {
        desc: 'Launch game runtime',
        usage: 'run',
        exec: () => {
            if(window.parent && window.parent.playGame) {
                Log.success("Launching game runtime...");
                window.parent.playGame();
            } else {
                Log.error("Game runtime not available.");
            }
        }
    },
    
    open: {
        desc: 'Open a tool/editor',
        usage: 'open <tool_id>',
        exec: (args) => {
            if (!args[0]) {
                Log.warn("Usage: open <tool_id>");
                Log.info("Available tools: editor, script, pixel, audio, npc, iso, daw, prefab, logic, asset_manager");
                return;
            }
            openTool(args[0]);
        }
    },
    
    list: {
        desc: 'List project resources',
        usage: 'list [type]',
        exec: async (args) => {
            const type = args[0] || 'all';
            try {
                if (type === 'all' || type === 'tools') {
                    Log.info('=== AVAILABLE TOOLS ===');
                    if (window.parent && window.parent.tools) {
                        window.parent.tools.forEach(t => {
                            Log.info(`  ${t.id.padEnd(15)} - ${t.title}`);
                        });
                    }
                }
                if (type === 'all' || type === 'assets') {
                    Log.info('=== PROJECT ASSETS ===');
                    const data = await fetch('/api/assets').then(r=>r.json()).catch(()=>({assets:[]}));
                    const assets = data.assets || [];
                    assets.slice(0, 20).forEach(a => {
                        Log.info(`  ${a.type.padEnd(10)} | ${a.name}`);
                    });
                    if (assets.length > 20) Log.info(`  ... and ${assets.length - 20} more`);
                }
                if (type === 'all' || type === 'scripts') {
                    Log.info('=== LOGIC SCRIPTS ===');
                    const scripts = await fetch('/api/logic/list').then(r=>r.json()).catch(()=>[]);
                    scripts.forEach(s => Log.info(`  ${s}`));
                }
            } catch(e) {
                Log.error(`Failed to list ${type}: ${e.message}`);
            }
        }
    },
    
    info: {
        desc: 'Show project information',
        usage: 'info',
        exec: async () => {
            try {
                const res = await fetch('/api/projects/current');
                const data = await res.json();
                Log.info('=== PROJECT INFO ===');
                Log.info(`  Name:       ${data.name}`);
                Log.info(`  Author:     ${data.author || 'Unknown'}`);
                Log.info(`  Version:    ${data.version || '1.0.0'}`);
                Log.info(`  Engine:     ${data.engineType || 'rpg-topdown'}`);
                if (data.description) Log.info(`  Desc:       ${data.description}`);
            } catch(e) {
                Log.error('Failed to load project info.');
            }
        }
    },
    
    status: {
        desc: 'Show system status',
        usage: 'status',
        exec: async () => {
            try {
                const stats = await fetch('/api/system/stats').then(r=>r.json());
                Log.info('=== SYSTEM STATUS ===');
                Log.info(`  Memory:     ${stats.mem || 0} MB`);
                const uptime = stats.uptime || 0;
                Log.info(`  Uptime:     ${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m`);
                Log.info(`  Platform:   ${stats.platform || 'Web'}`);
            } catch(e) {
                Log.warn('System stats unavailable.');
            }
        }
    },
    
    search: {
        desc: 'Search in project',
        usage: 'search <query>',
        exec: (args) => {
            if (!args[0]) {
                Log.warn("Usage: search <query>");
                return;
            }
            const query = args.join(' ');
            Log.info(`Searching for: "${query}"...`);
            openTool('search_tool');
        }
    },
    
    alias: {
        desc: 'Show command aliases',
        usage: 'alias',
        exec: () => {
            Log.info('=== COMMAND ALIASES ===');
            Object.entries(Terminal.aliases).forEach(([alias, cmd]) => {
                Log.info(`  ${alias.padEnd(10)} => ${cmd}`);
            });
        }
    },
    
    echo: {
        desc: 'Print text to terminal',
        usage: 'echo <text>',
        exec: (args) => {
            Log.info(args.join(' '));
        }
    },
    
    time: {
        desc: 'Show current date/time',
        usage: 'time',
        exec: () => {
            const now = new Date();
            Log.info(now.toLocaleString());
        }
    },
    
    theme: {
        desc: 'Change UI theme',
        usage: 'theme [name]',
        exec: (args) => {
            if (!args[0]) {
                const current = localStorage.getItem('redglitch_theme') || 'modern-dark';
                Log.info(`Current theme: ${current}`);
                Log.info('Available: modern-light, modern-dark, cyberpunk, classic-dungeon');
                return;
            }
            setTheme(args[0]);
            Log.success(`Theme changed to: ${args[0]}`);
        }
    },
    
    export: {
        desc: 'Export project data',
        usage: 'export <type>',
        exec: (args) => {
            if (!args[0]) {
                Log.warn("Usage: export <state|logs|history>");
                return;
            }
            if (args[0] === 'state') {
                if (window.RedGlitchProjectState) {
                    const data = window.RedGlitchProjectState.export();
                    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'project-state.json';
                    a.click();
                    Log.success('State exported.');
                }
            } else if (args[0] === 'logs') {
                const logs = Log.feed ? Log.feed.innerText : '';
                const blob = new Blob([logs], {type: 'text/plain'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'terminal-logs.txt';
                a.click();
                Log.success('Logs exported.');
            } else if (args[0] === 'history') {
                const hist = Terminal.history.join('\n');
                const blob = new Blob([hist], {type: 'text/plain'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'command-history.txt';
                a.click();
                Log.success('History exported.');
            }
        }
    },
    
    reload: {
        desc: 'Reload dashboard',
        usage: 'reload',
        exec: () => {
            Log.info('Reloading...');
            setTimeout(() => location.reload(), 500);
        }
    },
    
    close: {
        desc: 'Close dashboard window',
        usage: 'close',
        exec: () => {
            if (window.parent && window.parent.closeWindow) {
                Log.info('Closing dashboard...');
                setTimeout(() => window.parent.closeWindow('win-dashboard'), 500);
            } else {
                Log.warn('Cannot close dashboard from here.');
            }
        }
    }
};

function executeCommand(cmdStr) {
    Log.add(`> ${cmdStr}`, 'INFO');
    
    const parts = cmdStr.trim().split(/\s+/);
    let cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    if (Terminal.aliases[cmd]) {
        cmd = Terminal.aliases[cmd];
    }
    
    if (commandRegistry[cmd]) {
        try {
            commandRegistry[cmd].exec(args);
        } catch(e) {
            Log.error(`Command failed: ${e.message}`);
        }
    } else {
        Log.error(`Unknown command: ${cmd}. Type 'help' for available commands.`);
    }
}

// --- DATA LOADERS ---
async function loadTelemetry() {
    try {
        const res = await fetch('/api/projects/current');
        const data = await res.json();
        
        const projEl = document.getElementById('proj-name');
        if (projEl) {
            let display = data.name.toUpperCase();
            if (display.length > 15) display = display.substring(0, 15) + "...";
            projEl.innerText = display;
        }
    } catch(e) {}
    
    try {
        const res = await fetch('/api/system/stats');
        const stats = await res.json();
        
        const memEl = document.getElementById('mem-usage');
        if (memEl) memEl.innerText = (stats.mem || 0) + ' MB';
        
        const uptimeEl = document.getElementById('uptime');
        if (uptimeEl) {
            const sec = stats.uptime || 0;
            const h = Math.floor(sec / 3600).toString().padStart(2,'0');
            const m = Math.floor((sec % 3600) / 60).toString().padStart(2,'0');
            uptimeEl.innerText = `${h}:${m}`;
        }
    } catch(e) {}
    
    updateAIMetrics();
}

async function updateAIMetrics() {
    const setOffline = () => {
        const memEl = document.getElementById('ai-mem-usage');
        const cpuEl = document.getElementById('ai-cpu-usage');
        if (memEl) memEl.innerText = 'OFFLINE';
        if (cpuEl) {
            cpuEl.innerText = '0%';
            cpuEl.style.color = '#444';
        }
    };

    try {
        const res = await fetch('/api/ai/metrics');
        if (!res.ok) throw new Error('Offline');
        const metrics = await res.json();
        const status = String(metrics.status || '').toLowerCase();
        if (metrics.error || metrics.offline || status === 'offline') {
            setOffline();
            return;
        }

        const memEl = document.getElementById('ai-mem-usage');
        const cpuEl = document.getElementById('ai-cpu-usage');
        if (memEl) memEl.innerText = `${metrics.mem_usage_mb} MB`;
        if (cpuEl) {
            cpuEl.innerText = `${metrics.cpu_usage_percent}%`;
            const aiCpu = metrics.cpu_usage_percent;
            if (aiCpu > 80) cpuEl.style.color = 'var(--red)';
            else if (aiCpu > 30) cpuEl.style.color = 'var(--accent)';
            else if (aiCpu > 0) cpuEl.style.color = 'var(--green)';
            else cpuEl.style.color = '#666';
        }
    } catch(e) {
        setOffline();
    }
}

async function renderActivities() {
    const list = document.getElementById('activity-list');
    if (!list) return;
    list.innerHTML = '';
    
    let activities = [];
    if (window.RedGlitchProjectState) {
        activities = window.RedGlitchProjectState.get('activities', []);
    }
    
    if (activities.length === 0) {
        const legacy = JSON.parse(localStorage.getItem('redglitch_recent_files') || '[]');
        activities = legacy.map(f => ({ type: 'file', name: f.name, data: { path: f.path }, timestamp: Date.now() }));
    }

    if (activities.length === 0) {
        list.innerHTML = '<div style="color:#555; text-align:center; margin-top:20px;">No recent activity.</div>';
        return;
    }

    activities.slice(0, 15).forEach(act => {
        const div = document.createElement('div');
        div.className = 'file-item';
        let icon = 'fa-circle', color = '#ccc';
        
        if (act.type === 'tool') { icon = 'fa-hammer'; color = 'var(--accent)'; }
        else if (act.type === 'file') {
            icon = 'fa-file';
            if (act.name.endsWith('.json')) icon = 'fa-code';
            if (act.name.endsWith('.png')) icon = 'fa-image';
            color = 'var(--cyan)';
        }
        
        div.onclick = () => {
            if (act.type === 'tool') openTool(act.data.id || act.name.toLowerCase().replace(/ /g,'_'));
            else if (act.type === 'file') openFileInParent(act.data.path);
        };
        
        div.innerHTML = `
            <div class="file-icon"><i class="fas ${icon}" style="color:${color}"></i></div>
            <div class="file-info">
                <span class="file-name">${act.name}</span>
                <span class="file-path">${getRelativeTime(act.timestamp)}</span>
            </div>
        `;
        list.appendChild(div);
    });
}

function getRelativeTime(ts) {
    const now = Date.now();
    const diff = Math.floor((now - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return new Date(ts).toLocaleDateString();
}

async function scanAssets() {
    Log.info("Initiating asset index scan...");
    try {
        const res = await fetch('/api/assets/rebuild', { method: 'POST' });
        if(res.ok) {
            const data = await res.json();
            Log.success(`Scan complete. Indexed ${data.count} assets.`);
            loadCounts();
        } else {
            Log.error("Asset scan failed.");
        }
    } catch(e) { Log.error("Network error during scan."); }
}

async function loadCounts() {
    try {
        const [levels, data, scripts] = await Promise.all([
            fetch('/api/levels').then(r=>r.json()).catch(()=>({levels:[]})),
            fetch('/api/assets').then(r=>r.json()).catch(()=>({assets:[]})),
            fetch('/api/logic/list').then(r=>r.json()).catch(()=>[])
        ]);
        
        const countLevels = document.getElementById('count-levels');
        if (countLevels) countLevels.innerText = (levels.levels || []).length;
        
        const countSprites = document.getElementById('count-sprites');
        if (countSprites) {
            const sprites = (data.assets || []).filter(a => a.type === 'image').length;
            countSprites.innerText = sprites;
        }
        
        const countScripts = document.getElementById('count-scripts');
        if (countScripts) countScripts.innerText = scripts.length;
        
    } catch(e) { Log.warn("Failed to update asset counts."); }
}

function openTool(id) {
    if (window.parent && window.parent.openWindow) {
        const tool = window.parent.tools.find(t => t.id === id);
        if (tool) {
            window.parent.openWindow(tool);
            Log.info(`Opened tool: ${id}`);
            if (window.RedGlitchProjectState) {
                window.RedGlitchProjectState.logActivity('tool', tool.title, { id: tool.id });
            }
        }
    }
}

function openFileInParent(path) {
    Log.info(`Request to open: ${path}`);
    if (window.RedGlitchProjectState) {
        window.RedGlitchProjectState.logActivity('file', path.split('/').pop(), { path: path });
    }
}

const DASHBOARD_THEME_FALLBACKS = {
    'modern-dark': { 'bg-root': '#050508', 'bg-widget': '#0a0e14', 'bg-input': '#000000', 'border': '#1f2b42', 'border-highlight': '#34495e', 'accent': '#ff0000', 'cyan': '#40e0d0', 'green': '#2ecc71', 'red': '#e74c3c' },
    'cyberpunk': { 'bg-root': '#0d0221', 'bg-widget': '#130a24', 'bg-input': '#241734', 'border': '#ff0055', 'border-highlight': '#ff4d88', 'accent': '#00f3ff', 'cyan': '#00f3ff', 'green': '#39ff88', 'red': '#ff3366' },
    'classic-dungeon': { 'bg-root': '#1a1a1a', 'bg-widget': '#252525', 'bg-input': '#0f0f0f', 'border': '#4a4a4a', 'border-highlight': '#666666', 'accent': '#e67e22', 'cyan': '#a2c4c9', 'green': '#7cb342', 'red': '#c0392b' },
    'modern-light': { 'bg-root': '#f3f6fb', 'bg-widget': '#ffffff', 'bg-input': '#ffffff', 'border': '#b8c7db', 'border-highlight': '#8ea6c5', 'accent': '#2563eb', 'cyan': '#0ea5e9', 'green': '#16a34a', 'red': '#dc2626' }
};

function setTheme(themeName, options = {}) {
    const sourceThemes = (window.parent && window.parent !== window && window.parent.REDGLITCH_THEMES) || window.REDGLITCH_THEMES || DASHBOARD_THEME_FALLBACKS;
    const theme = sourceThemes[themeName] || sourceThemes['modern-dark'] || DASHBOARD_THEME_FALLBACKS['modern-dark'];
    Object.keys(theme).forEach(key => { document.documentElement.style.setProperty(`--${key}`, theme[key]); });
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('redglitch_theme', themeName);
    const selector = document.getElementById('theme-selector');
    if (selector) selector.value = themeName;
    if (window.RedGlitchEventBus && options.source !== 'parent') window.RedGlitchEventBus.emit('theme:changed', { theme: themeName });
    if (options.source !== 'parent' && window.parent && window.parent.applyTheme) window.parent.applyTheme(themeName);
}

// Boot Command Center
window.addEventListener('DOMContentLoaded', () => {
    Log.info("Command Center initialized.");
    Log.info("Connecting to RedGlitch Core...");
    Log.info("Terminal ready. Type 'help' for available commands.");
    
    const cmdInput = document.getElementById('cmd-input');
    if (cmdInput) {
        cmdInput.focus();
        document.getElementById('log-feed').addEventListener('click', () => cmdInput.focus());
        cmdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = cmdInput.value.trim();
                if (cmd) { Terminal.addToHistory(cmd); executeCommand(cmd); }
                cmdInput.value = '';
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = Terminal.getPreviousCommand();
                if (prev) cmdInput.value = prev;
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = Terminal.getNextCommand();
                if (next !== null) cmdInput.value = next;
            } else if (e.key === 'Tab') {
                e.preventDefault();
                const parts = cmdInput.value.split(' ');
                const partial = parts[0];
                const completions = Terminal.getCompletions(partial);
                if (completions.length === 1) { parts[0] = completions[0]; cmdInput.value = parts.join(' '); }
                else if (completions.length > 1) Log.info(`Options: ${completions.join(', ')}`);
            } else if (e.ctrlKey && e.key === 'c') { e.preventDefault(); cmdInput.value = ''; Log.warn('Operation cancelled.'); }
            else if (e.ctrlKey && e.key === 'l') { e.preventDefault(); Log.clear(); }
        });
    }
    
    const scratchpad = document.getElementById('scratchpad');
    if (scratchpad) {
        scratchpad.value = localStorage.getItem('redglitch_scratchpad') || '';
        scratchpad.addEventListener('input', () => localStorage.setItem('redglitch_scratchpad', scratchpad.value));
    }

    if (window.RedGlitchEventBus) window.RedGlitchEventBus.on('activity:logged', () => renderActivities());
    
    const savedTheme = localStorage.getItem('redglitch_theme') || 'modern-dark';
    setTheme(savedTheme, { source: 'parent' });

    loadTelemetry();
    loadCounts();
    setTimeout(renderActivities, 500); 
    setInterval(loadTelemetry, 5000);
    setInterval(renderActivities, 60000);
});
