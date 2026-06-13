// ide.js - RedGlitch Code Studio Logic

let editor = null;
let openTabs = new Map(); // path -> { model, state }
let activeTab = null; // path
let fileTreeData = [];
let expandedDirs = new Set();
let isSearchOpen = false;

// --- SEARCH LOGIC ---
function toggleSearch() {
    isSearchOpen = !isSearchOpen;
    const header = document.querySelector('#sidebar-header span');
    const container = document.getElementById('file-tree');
    
    if (isSearchOpen) {
        header.innerText = 'SEARCH';
        container.innerHTML = `
            <div style="padding:10px;">
                <input type="text" id="global-search-input" placeholder="Search project..." 
                    style="width:100%; background:#000; color:var(--accent); border:1px solid var(--border); padding:5px; font-family:monospace;">
                <div id="search-results" style="margin-top:10px; font-size:12px;"></div>
            </div>
        `;
        const input = document.getElementById('global-search-input');
        input.focus();
        input.onkeydown = (e) => {
            if (e.key === 'Enter') performSearch(input.value);
        };
    } else {
        header.innerText = 'EXPLORER';
        renderTree();
    }
}

async function performSearch(query) {
    if (!query) return;
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '<div style="opacity:0.5">Searching...</div>';
    
    try {
        const res = await fetch(`/api/ide/search?query=${encodeURIComponent(query)}`);
        const results = await res.json();
        
        if (results.length === 0) {
            resultsContainer.innerHTML = '<div style="opacity:0.5">No results found.</div>';
            return;
        }

        resultsContainer.innerHTML = results.map(r => `
            <div class="search-result-item" onclick="openAndJump('${r.file}', ${r.line})" 
                style="padding:5px; border-bottom:1px solid #222; cursor:pointer;">
                <div style="color:var(--accent); text-overflow:ellipsis; overflow:hidden;">${r.file}</div>
                <div style="opacity:0.6; font-size:11px;">Line ${r.line}: ${r.text.replace(/</g, '&lt;')}</div>
            </div>
        `).join('');
    } catch (e) {
        resultsContainer.innerHTML = '<div style="color:red">Search failed.</div>';
    }
}

async function openAndJump(path, line) {
    await openFile(path);
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
}

// --- DOCK LOGIC ---
function switchDock(pane) {
    document.querySelectorAll('.dock-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dock-tab').forEach(t => {
        if (t.innerText.toLowerCase().includes(pane)) t.classList.add('active');
    });

    document.getElementById('terminal-pane').style.display = pane === 'terminal' ? 'block' : 'none';
    document.getElementById('stats-pane').style.display = pane === 'stats' ? 'block' : 'none';
    document.getElementById('memory-pane').style.display = pane === 'memory' ? 'block' : 'none';
}

// Terminal Logic
const termInput = document.getElementById('terminal-input');
const termLog = document.getElementById('terminal-log');

if (termInput) {
    termInput.onkeydown = async (e) => {
        if (e.key === 'Enter') {
            const cmd = termInput.value;
            termInput.value = '';
            appendLog(`$ ${cmd}`, '#ff0000');
            
            try {
                const res = await fetch('/api/ide/terminal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: cmd })
                });
                const data = await res.json();
                if (data.stdout) appendLog(data.stdout);
                if (data.stderr) appendLog(data.stderr, '#ff5555');
                if (data.error) appendLog(`Error: ${data.error}`, '#ff5555');
            } catch (err) {
                appendLog(`Failed to execute: ${err.message}`, '#ff5555');
            }
        }
    };
}

function appendLog(text, color = '#aaa') {
    const div = document.createElement('div');
    div.style.color = color;
    div.innerText = text;
    termLog.appendChild(div);
    termLog.scrollTop = termLog.scrollHeight;
}

// Stats Logic
async function updateStats() {
    if (document.getElementById('stats-pane').style.display === 'none') return;
    try {
        const res = await fetch('/api/system/stats');
        const data = await res.json();
        document.getElementById('stat-mem').innerText = data.mem || 0;
        document.getElementById('stat-cpu').innerText = data.cpu || 0;
        document.getElementById('stat-uptime').innerText = data.uptime || 0;
    } catch (e) {
        console.warn('IDE stats update failed:', e);
    }
}
setInterval(updateStats, 2000);

// --- MEMORY BRIDGE LOGIC ---
window.requestMemoryDump = function() {
    if (window.RedGlitchEventBus) {
        document.getElementById('live-memory-display').innerText = "Requesting dump from engine...";
        window.RedGlitchEventBus.requestMemoryDump('campaign');
    }
};

// Listen for memory diffs
if (typeof window !== 'undefined' && window.RedGlitchEventBus) {
    window.RedGlitchEventBus.on('system:memory:diff', (event) => {
        const { namespace, diff } = event.data;
        if (namespace === 'campaign' && document.getElementById('live-memory-display')) {
            document.getElementById('live-memory-display').innerText = JSON.stringify(diff, null, 2);
        }
    });
}

// --- MONACO INIT ---
require.config({ paths: { 'vs': 'lib/monaco/vs' }});

window.editorInit = function() {
    require(['vs/editor/editor.main'], async function() {
        // Load RedGlitch Type Definitions
        try {
            const dtsRes = await fetch('lib/monaco/redglitch.d.ts');
            if (dtsRes.ok) {
                const dtsContent = await dtsRes.text();
                monaco.languages.typescript.javascriptDefaults.addExtraLib(dtsContent, 'redglitch.d.ts');
                console.log("RedGlitch intelligence loaded.");
            }
        } catch (e) { console.error("Failed to load type definitions", e); }

        editor = monaco.editor.create(document.getElementById('monaco-editor'), {
            theme: 'vs-dark',
            automaticLayout: true,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            minimap: { enabled: false },
            padding: { top: 10 },
            bracketPairColorization: { enabled: true },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: true
        });

        // Add save action
        editor.addAction({
            id: 'save-file',
            label: 'Save File',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
            run: saveCurrentFile
        });

        // Update cursor position in status bar
        editor.onDidChangeCursorPosition(e => {
            document.getElementById('status-right').innerText = `Line: ${e.position.lineNumber}, Col: ${e.position.column}`;
        });

        // --- AI INTEGRATION: Ghost-Text Autocomplete ---
        try {
            const { RedGlitchAI } = await import('/ai/redglitch-ai.js');
            const { EventBus } = await import('/ai/shim.js');
            const ai = new RedGlitchAI();
            window.RedGlitchAIInstance = ai;

            monaco.languages.registerInlineCompletionsProvider('javascript', {
                provideInlineCompletions: async (model, position, context, token) => {
                    if (token.isCancellationRequested) return;

                    // Only trigger on typing (not on cursor move only)
                    if (context.triggerKind === monaco.languages.InlineCompletionTriggerKind.Automatic) {
                        // Small delay to debounce
                        await new Promise(r => setTimeout(r, 500));
                        if (token.isCancellationRequested) return;
                    }

                    const prefix = model.getValueInRange({
                        startLineNumber: Math.max(1, position.lineNumber - 5),
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    });

                    const suffix = model.getValueInRange({
                        startLineNumber: position.lineNumber,
                        startColumn: position.column,
                        endLineNumber: Math.min(model.getLineCount(), position.lineNumber + 5),
                        endColumn: model.getLineMaxColumn(Math.min(model.getLineCount(), position.lineNumber + 5))
                    });

                    try {
                        const completion = await ai.getCompletions(prefix, suffix);
                        if (!completion) return;

                        return {
                            items: [{
                                insertText: completion,
                                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
                            }]
                        };
                    } catch (e) {
                        console.warn('[AI:Autocomplete] Error:', e);
                        return;
                    }
                },
                freeInlineCompletions: () => {}
            });
            console.log("RedGlitch AI Ghost-Text enabled.");
        } catch (e) {
            console.error("Failed to initialize AI Ghost-Text:", e);
        }

        // --- AI INTEGRATION: Code Injection ---
        if (window.RedGlitchEventBus) {
            window.RedGlitchEventBus.on('ai:inject-code', (data) => {
                if (!editor) return;
                const model = editor.getModel();
                if (!model) return;

                const lineCount = model.getLineCount();
                const range = new monaco.Range(lineCount + 1, 1, lineCount + 1, 1);
                const text = "\n\n// --- AI Generated Snippet ---\n" + data.code + "\n";
                
                const op = {
                    range: range,
                    text: text,
                    forceMoveMarkers: true
                };
                
                editor.executeEdits("AI-Injector", [op]);
                editor.revealLine(model.getLineCount());
                console.log('[IDE] AI Code Injected.');
            });
        }

        loadTree();
    });
};

async function loadTree() {
    try {
        const res = await fetch('/api/ide/tree');
        fileTreeData = await res.json();
        renderTree();
    } catch (e) { 
        console.error("Tree load failed", e); 
        document.getElementById('file-tree').innerHTML = '<div style="color:red">Failed to load project tree.</div>';
    }
}

function renderTree() {
    const leftContainer = document.getElementById('file-tree');
    const rightContainer = document.getElementById('file-tree-right');
    
    const renderTo = (container) => {
        if (!container) return;
        container.innerHTML = '';
        
        function buildNode(node, depth) {
            const div = document.createElement('div');
            div.className = `tree-item ${node.type}`;
            div.style.paddingLeft = (depth * 15) + 'px';
            
            let icon = node.type === 'dir' ? (expandedDirs.has(node.path) ? '📂' : '📁') : '📄';
            
            if (node.type === 'file') {
                const ext = node.name.split('.').pop();
                if (ext === 'js') icon = '📜';
                if (ext === 'json') icon = '⚙️';
                if (ext === 'html') icon = '🌐';
                if (ext === 'css') icon = '🎨';
                if (ext === 'md') icon = '📝';
            }

            div.innerHTML = `<span style="opacity:0.6; margin-right:5px; font-size: 12px;">${icon}</span>${node.name}`;
            
            if (node.path === activeTab) div.classList.add('active');
            
            div.onclick = (e) => {
                e.stopPropagation();
                if (node.type === 'file') {
                    openFile(node.path);
                } else {
                    if (expandedDirs.has(node.path)) {
                        expandedDirs.delete(node.path);
                    } else {
                        expandedDirs.add(node.path);
                    }
                    renderTree();
                }
            };
            
            container.appendChild(div);

            if (node.type === 'dir' && expandedDirs.has(node.path) && node.children) {
                const sorted = [...node.children].sort((a,b) => {
                    if (a.type === b.type) return a.name.localeCompare(b.name);
                    return a.type === 'dir' ? -1 : 1;
                });
                sorted.forEach(c => buildNode(c, depth + 1));
            }
        }

        fileTreeData.forEach(root => buildNode(root, 0));
    };

    renderTo(leftContainer);
    renderTo(rightContainer);
}

// --- RIGHT SIDEBAR TABS ---
function switchRightSidebar(pane) {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(`tab-${pane}`);
    if (tab) tab.classList.add('active');

    document.querySelectorAll('.sidebar-content-pane').forEach(p => p.classList.add('hidden'));
    const paneEl = document.getElementById(`pane-${pane}`);
    if (paneEl) paneEl.classList.remove('hidden');
    
    if (pane === 'files') renderTree();
}

async function createNewFile() {
    const name = prompt("Enter file name (e.g. script.js):");
    if (!name) return;
    
    try {
        const res = await fetch('/api/ide/write', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ file: name, content: "// New File\n" })
        });
        if (res.ok) loadTree();
        else throw new Error("Create failed");
    } catch (e) { alert(e.message); }
}

async function createNewFolder() {
    alert("Folder creation logic arriving in next update!");
}

async function openFile(path) {
    // If already open, just switch
    if (openTabs.has(path)) {
        switchTab(path);
        return;
    }

    try {
        const res = await fetch(`/api/ide/read?file=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error("Could not read file");
        const content = await res.text();
        
        // Detect language
        const extension = path.split('.').pop();
        let language = 'javascript';
        if (['html', 'css', 'json', 'markdown', 'typescript'].includes(extension)) {
            language = extension === 'md' ? 'markdown' : extension;
        }
        
        const model = monaco.editor.createModel(content, language);
        
        // Track the tab
        openTabs.set(path, {
            model: model,
            state: null
        });
        
        switchTab(path);
    } catch (e) { 
        console.error("Read failed", e);
        alert("Failed to open file: " + path);
    }
}

function switchTab(path) {
    if (!openTabs.has(path)) return;

    // Save current view state if we have an active tab
    if (activeTab && openTabs.has(activeTab)) {
        openTabs.get(activeTab).state = editor.saveViewState();
    }

    activeTab = path;
    const tabData = openTabs.get(path);
    
    editor.setModel(tabData.model);
    if (tabData.state) {
        editor.restoreViewState(tabData.state);
    }
    
    editor.focus();
    
    document.getElementById('status-left').innerText = `Editing: ${path}`;
    updateTabsUI();
    renderTree();
}

function closeTab(path, e) {
    if (e) e.stopPropagation();
    
    if (!openTabs.has(path)) return;
    
    const tabData = openTabs.get(path);
    tabData.model.dispose();
    openTabs.delete(path);
    
    if (activeTab === path) {
        activeTab = openTabs.size > 0 ? Array.from(openTabs.keys())[openTabs.size - 1] : null;
        if (activeTab) {
            switchTab(activeTab);
        } else {
            editor.setModel(null);
            document.getElementById('status-left').innerText = `Ready`;
        }
    }
    
    updateTabsUI();
    renderTree();
}

function updateTabsUI() {
    const bar = document.getElementById('tabs-bar');
    bar.innerHTML = '';
    
    openTabs.forEach((data, path) => {
        const name = path.split(/[/\]/).pop();
        const tab = document.createElement('div');
        tab.className = `tab ${path === activeTab ? 'active' : ''}`;
        
        tab.innerHTML = `
            <span>${name}</span>
            <span class="close-btn" onclick="closeTab('${path}', event)">×</span>
        `;
        
        tab.onclick = () => switchTab(path);
        bar.appendChild(tab);
    });
}

async function saveCurrentFile() {
    if (!activeTab) return;
    const content = editor.getValue();
    const savingPath = activeTab;
    
    document.getElementById('status-left').innerText = `Saving ${savingPath}...`;
    
    try {
        const res = await fetch('/api/ide/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: savingPath, content })
        });
        
        if (res.ok) {
            document.getElementById('status-left').innerText = `Saved: ${savingPath}`;
            setTimeout(() => {
                if (activeTab === savingPath) {
                    document.getElementById('status-left').innerText = `Editing: ${savingPath}`;
                }
            }, 2000);
        } else {
            throw new Error("Save failed");
        }
    } catch (e) { 
        alert("Save failed! Check server console."); 
        document.getElementById('status-left').innerText = `ERROR SAVING`;
    }
}

// --- REAL-TIME SYNC ---
function initRealTimeSync() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (['file:changed', 'file:added', 'file:deleted'].includes(msg.type)) {
                console.log('[IDE] Real-time file sync triggered:', msg.type);
                loadTree(); // Refresh the tree
            }
        } catch (e) {}
    };

    ws.onclose = () => {
        console.warn('[IDE] Real-time sync lost. Retrying in 5s...');
        setTimeout(initRealTimeSync, 5000);
    };
}

// Kick off init
window.editorInit();
initRealTimeSync();