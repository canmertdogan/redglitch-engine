// script_editor.js - RedGlitch Code Forge Logic
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager, studioBridge;

function initializeScriptIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedGlitchEventBus;
        projectState = window.RedGlitchProjectState;
        assetManager = window.RedGlitchAssetManager;
        
        if (eventBus) {
            // Initialize StudioBridge for IRAB
            if (window.StudioBridge) {
                studioBridge = new window.StudioBridge('code', eventBus);
                registerCodeTools();
            }

            // Listen for script requests from other editors
            eventBus.on('script:request', (event) => {
                console.log('[ScriptEditor] Script requested:', event.data.scriptPath);
                if (typeof openFile === 'function') {
                    openFile(event.data.scriptPath);
                }
            });

            // --- AI INTEGRATION: Code Injection (Legacy Support) ---
            eventBus.on('ai:inject-code', (data) => {
                injectCodeAtBottom(data.code);
            });
            
            // --- Phase 10: Global AI Context Bounds ---
            eventBus.on('ai:context_query', () => {
                let contextStr = 'Code Forge is idle. No file open.';
                if (window.currentFile) {
                    contextStr = `Editing file: ${window.currentFile}`;
                    if (window.editor) {
                        const code = window.editor.getValue();
                        contextStr += `\nSnippet (first 100 chars): ${code.substring(0, 100).replace(/\n/g, ' ')}...`;
                    }
                }
                eventBus.emit('ai:context_response', {
                    source: 'Code Forge',
                    details: contextStr
                });
            });
            
            console.log('[ScriptEditor] EventBus connected');
        }
    }
}

/**
 * Register IRAB tools for Code Forge
 */
function registerCodeTools() {
    // editor.open
    studioBridge.register({
        name: 'open',
        description: 'Open a specific file in the code editor.',
        securityLevel: 'safe',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to the file to open.' }
            },
            required: ['path']
        },
        execute: async (args) => {
            await openFile(args.path);
            return { success: true, message: `Opened ${args.path}` };
        }
    });

    // editor.insert
    studioBridge.register({
        name: 'insert',
        description: 'Insert code at the current cursor position or at the end of the file.',
        securityLevel: 'low-risk',
        parameters: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The code to insert.' },
                atEnd: { type: 'boolean', description: 'If true, inserts at the end of the file.', default: false }
            },
            required: ['content']
        },
        execute: async (args) => {
            if (args.atEnd) {
                injectCodeAtBottom(args.content);
            } else {
                insertCodeAtCursor(args.content);
            }
            return { success: true };
        }
    });

    // editor.replace
    studioBridge.register({
        name: 'replace',
        description: 'Replace a specific range of code or the entire file content.',
        securityLevel: 'low-risk',
        parameters: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The new code content.' },
                range: { 
                    type: 'object', 
                    description: 'Optional range to replace. If omitted, replaces entire file.',
                    properties: {
                        startLine: { type: 'number' },
                        startCol: { type: 'number' },
                        endLine: { type: 'number' },
                        endCol: { type: 'number' }
                    }
                }
            },
            required: ['content']
        },
        execute: async (args) => {
            if (!editor) throw new Error("Editor not ready");
            const model = editor.getModel();
            
            let range;
            if (args.range) {
                range = new monaco.Range(args.range.startLine, args.range.startCol, args.range.endLine, args.range.endCol);
            } else {
                range = model.getFullModelRange();
            }

            const op = { range: range, text: args.content, forceMoveMarkers: true };
            editor.executeEdits("IRAB-Replace", [op]);
            return { success: true };
        }
    });

    // code.document
    studioBridge.register({
        name: 'document',
        description: 'Add JSDoc documentation to the code.',
        securityLevel: 'low-risk',
        parameters: {
            type: 'object',
            properties: {
                documentation: { type: 'string', description: 'The JSDoc string to insert.' },
                line: { type: 'number', description: 'The line number to insert documentation above.' }
            },
            required: ['documentation', 'line']
        },
        execute: async (args) => {
            if (!editor) throw new Error("Editor not ready");
            const range = new monaco.Range(args.line, 1, args.line, 1);
            const op = { range: range, text: args.documentation + "\n", forceMoveMarkers: true };
            editor.executeEdits("IRAB-Doc", [op]);
            return { success: true };
        }
    });
}

function injectCodeAtBottom(code) {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const range = new monaco.Range(lineCount + 1, 1, lineCount + 1, 1);
    const text = "\n\n// --- AI Generated Snippet ---\n" + code + "\n";
    
    const op = {
        range: range,
        text: text,
        forceMoveMarkers: true
    };
    
    editor.executeEdits("AI-Injector", [op]);
    editor.revealLine(model.getLineCount());
    console.log('[ScriptEditor] Code Injected at bottom.');
}

function insertCodeAtCursor(code) {
    if (!editor) return;
    const selection = editor.getSelection();
    const op = {
        range: selection,
        text: code,
        forceMoveMarkers: true
    };
    editor.executeEdits("AI-Injector", [op]);
}

// --- State ---
let editor = null;
let fileTreeData = [];
const openTabs = []; // { path, model, viewState }
let activeTabPath = null;
const expandedPaths = new Set();
let autoSaveTimer = null;
let currentProject = null; // Track active project for path correction

async function loadProjectInfo() {
    try {
        const res = await fetch('/api/projects/current');
        const data = await res.json();
        currentProject = data.name;
        console.log('[ScriptEditor] Active Project:', currentProject);
    } catch(e) {
        console.warn('Failed to load project info', e);
    }
}

// --- Settings Manager ---
const SettingsManager = {
    defaults: {
        theme: 'vs-dark',
        fontFamily: "'JetBrains Mono', Consolas, monospace",
        fontSize: 14,
        wordWrap: false,
        minimap: true,
        autoSave: false
    },
    current: {},
    
    init() {
        const stored = localStorage.getItem('codeForgeSettings');
        this.current = stored ? { ...this.defaults, ...JSON.parse(stored) } : { ...this.defaults };
        this.applyUI();
    },

    save() {
        localStorage.setItem('codeForgeSettings', JSON.stringify(this.current));
    },

    update(key, value) {
        this.current[key] = value;
        this.save();
        this.applyToEditor();
        this.applyUI();
    },

    applyToEditor() {
        if (!editor) return;
        
        monaco.editor.setTheme(this.current.theme);
        editor.updateOptions({
            fontFamily: this.current.fontFamily,
            fontSize: parseInt(this.current.fontSize),
            wordWrap: this.current.wordWrap ? 'on' : 'off',
            minimap: { enabled: this.current.minimap }
        });
        
        // Handle Auto-Save logic update
        if (this.current.autoSave) {
            startAutoSave();
        } else {
            stopAutoSave();
        }
    },

    applyUI() {
        // Update modal inputs to match state
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') el.checked = val;
                else el.value = val;
            }
        };

        setVal('set-theme', this.current.theme);
        setVal('set-font', this.current.fontFamily);
        setVal('set-fontsize', this.current.fontSize);
        setVal('set-wordwrap', this.current.wordWrap);
        setVal('set-minimap', this.current.minimap);
        setVal('set-autosave', this.current.autoSave);
        
        // Update Status Bar info (Indentation is usually hardcoded to spaces:4 for now, but could be dynamic)
        const indentEl = document.getElementById('indent-status');
        if (indentEl) indentEl.innerText = "Spaces: 4"; 
    }
};

// --- Monaco Setup ---
require.config({ paths: { 'vs': 'lib/monaco/vs'}});

window.onload = async () => {
    // Initialize integration first
    initializeScriptIntegration();
    SettingsManager.init();
    
    // Load Project Info for path fix
    await loadProjectInfo();
    
    require(['vs/editor/editor.main'], function() {
        // Create Editor
        editor = monaco.editor.create(document.getElementById('monaco-editor'), {
            theme: SettingsManager.current.theme,
            automaticLayout: true,
            fontFamily: SettingsManager.current.fontFamily,
            fontSize: SettingsManager.current.fontSize,
            fontLigatures: true,
            minimap: { enabled: SettingsManager.current.minimap },
            wordWrap: SettingsManager.current.wordWrap ? 'on' : 'off',
            padding: { top: 15 },
            scrollBeyondLastLine: false,
            renderWhitespace: "selection",
            cursorBlinking: "phase",
            cursorSmoothCaretAnimation: true,
            smoothScrolling: true
        });

        // Add Keybindings
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            saveActiveFile();
        });

        // Cursor Position Update
        editor.onDidChangeCursorPosition(e => {
            document.getElementById('cursor-pos').innerText = `LN ${e.position.lineNumber}, COL ${e.position.column}`;
        });
        
        // Auto-Save Hook (Debounced)
        editor.onDidChangeModelContent(() => {
            if (SettingsManager.current.autoSave) {
                if (autoSaveTimer) clearTimeout(autoSaveTimer);
                autoSaveTimer = setTimeout(() => {
                    saveActiveFile(true); // silent save
                }, 2000);
            }
        });

        // Initial Load
        loadTree();
        
        // Default expand useful folders
        expandedPaths.add('public');
        expandedPaths.add('public/base_game');
        
        // Apply Welcome Screen Logic
        updateLayoutState();

        // --- AI Ghost Text Provider ---
        monaco.languages.registerInlineCompletionsProvider('javascript', {
            provideInlineCompletions: async (model, position, context, token) => {
                // Only trigger if RedGlitchAI is ready
                if (!window.RedGlitchAI || !window.RedGlitchAI.isInitialized) return { items: [] };
                
                // Debounce simple typing
                if (context.triggerKind === monaco.languages.InlineCompletionTriggerKind.Automatic) {
                    // Optional: Check a global flag or wait for explicit trigger
                    // return { items: [] }; 
                }

                const textUntilPosition = model.getValueInRange({
                    startLineNumber: 1, startColumn: 1,
                    endLineNumber: position.lineNumber, endColumn: position.column
                });
                
                const textAfterPosition = model.getValueInRange({
                    startLineNumber: position.lineNumber, startColumn: position.column,
                    endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount())
                });

                try {
                    const suggestion = await window.RedGlitchAI.suggest(textUntilPosition, textAfterPosition, activeTabPath || 'script.js');
                    if (suggestion) {
                        return {
                            items: [{
                                insertText: suggestion,
                                range: new monaco.Range(
                                    position.lineNumber, position.column,
                                    position.lineNumber, position.column
                                )
                            }]
                        };
                    }
                } catch (e) {
                    console.warn('[GhostText] Failed:', e);
                }
                return { items: [] };
            },
            freeInlineCompletions: () => {}
        });
    });
};

// --- File Explorer ---

async function loadTree() {
    try {
        const res = await fetch('/api/ide/tree');
        fileTreeData = await res.json();
        renderTree();
    } catch (e) {
        console.error(e);
        document.getElementById('status-msg').innerText = "TREE LOAD FAILED";
        document.getElementById('status-msg').style.color = '#e74c3c';
    }
}

function renderTree() {
    const container = document.getElementById('file-tree');
    container.innerHTML = '';

    function sortNodes(nodes) {
        return nodes.sort((a,b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'dir' ? -1 : 1;
        });
    }

    function build(node, depth) {
        // Skip hidden/system folders
        if (node.name === 'node_modules' || node.name === '.git' || node.name === '.gemini') return;

        const div = document.createElement('div');
        div.className = 'tree-node';
        if (node.path === activeTabPath) div.classList.add('active');
        div.style.paddingLeft = `${10 + depth * 15}px`;

        // Icons
        let icon = '';
        let arrow = '';
        if (node.type === 'dir') {
            const isExpanded = expandedPaths.has(node.path);
            icon = isExpanded ? '📂' : '📁';
            // Pixel arrow
            arrow = `<span style="font-size:12px; width:12px; display:inline-block; color:#666;">${isExpanded ? '▼' : '▶'}</span>`;
        } else {
            icon = getIconForFile(node.name);
            arrow = `<span style="width:12px; display:inline-block;"></span>`; // spacer
        }

        div.innerHTML = `${arrow} <span class="icon">${icon}</span><span>${node.name}</span>`;

        // Interactions
        if (node.type === 'dir') {
            div.onclick = (e) => {
                e.stopPropagation();
                if (expandedPaths.has(node.path)) {
                    expandedPaths.delete(node.path);
                } else {
                    expandedPaths.add(node.path);
                }
                renderTree();
            };
        } else {
            div.onclick = () => openFile(node.path);
        }

        container.appendChild(div);

        // Render Children if expanded
        if (node.type === 'dir' && expandedPaths.has(node.path) && node.children) {
            sortNodes(node.children).forEach(c => build(c, depth + 1));
        }
    }

    sortNodes(fileTreeData).forEach(n => build(n, 0));
}

function getIconForFile(name) {
    if (name.endsWith('.js')) return '📄'; // JS
    if (name.endsWith('.html')) return '🌐'; // HTML
    if (name.endsWith('.css')) return '#'; // CSS
    if (name.endsWith('.json')) return '{}'; // JSON
    if (name.endsWith('.md')) return 'ℹ️'; // MD
    return '📄';
}

// --- Tab System ---

async function openFile(path) {
    // Check if already open
    const existing = openTabs.find(t => t.path === path);
    if (existing) {
        setActiveTab(path);
        return;
    }

    // Fix for project paths when active project is set
    let requestPath = path;
    if (currentProject && path.startsWith(`projects/${currentProject}/`)) {
        requestPath = path.replace(`projects/${currentProject}/`, '');
        console.log(`[ScriptEditor] Adjusted path: ${path} -> ${requestPath}`);
    }

    // Load Content
    try {
        const res = await fetch(`/api/ide/read?file=${encodeURIComponent(requestPath)}`);
        if (!res.ok) throw new Error("Load failed");
        const text = await res.text();

        // Create Model
        const ext = path.split('.').pop();
        const lang = getMonacoLanguage(ext);
        const model = monaco.editor.createModel(text, lang);

        openTabs.push({ path, model, viewState: null });
        renderTabs();
        setActiveTab(path);
    } catch (e) {
        setStatus("ERROR LOADING FILE", true);
    }
}

function setActiveTab(path) {
    if (activeTabPath === path) return;

    // Save view state of current
    const currentTab = openTabs.find(t => t.path === activeTabPath);
    if (currentTab) {
        currentTab.viewState = editor.saveViewState();
    }

    activeTabPath = path;
    const newTab = openTabs.find(t => t.path === path);
    
    if (newTab) {
        editor.setModel(newTab.model);
        if (newTab.viewState) editor.restoreViewState(newTab.viewState);
        editor.focus();
        
        setStatus(`EDITING: ${path}`);
        
        // Update Lang Status
        const ext = path.split('.').pop().toUpperCase();
        document.getElementById('lang-status').innerText = ext || 'TXT';
    }

    renderTabs();
    updateLayoutState();
    
    // Update Tree Highlight
    document.querySelectorAll('.tree-node').forEach(n => n.classList.remove('active'));
    renderTree(); 
}

function closeTab(path, e) {
    if (e) e.stopPropagation();
    
    const idx = openTabs.findIndex(t => t.path === path);
    if (idx === -1) return;

    const tab = openTabs[idx];
    tab.model.dispose(); // Cleanup model
    openTabs.splice(idx, 1);

    if (activeTabPath === path) {
        // Switch to neighbor
        if (openTabs.length > 0) {
            const next = openTabs[Math.max(0, idx - 1)];
            setActiveTab(next.path);
        } else {
            activeTabPath = null;
            editor.setModel(null);
            setStatus("READY");
        }
    }
    renderTabs();
    updateLayoutState();
}

function closeAllTabs() {
    // Close in reverse to avoid index issues
    for (let i = openTabs.length - 1; i >= 0; i--) {
        openTabs[i].model.dispose();
    }
    openTabs.length = 0;
    activeTabPath = null;
    editor.setModel(null);
    setStatus("READY");
    renderTabs();
    updateLayoutState();
}

function closeActiveTab() {
    if (activeTabPath) closeTab(activeTabPath);
}

function renderTabs() {
    const container = document.getElementById('tabs');
    container.innerHTML = '';

    openTabs.forEach(t => {
        const div = document.createElement('div');
        div.className = `tab ${t.path === activeTabPath ? 'active' : ''}`;
        div.onclick = () => setActiveTab(t.path);
        
        const name = t.path.split(/[/\\]/).pop();
        const safePath = t.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        div.innerHTML = `
            <span>${name}</span>
            <span class="tab-close" onclick="window.scriptEditor.closeTab('${safePath}', event)">×</span>
        `;
        container.appendChild(div);
    });
}

function updateLayoutState() {
    const welcome = document.getElementById('welcome-screen');
    const hasTabs = openTabs.length > 0;
    
    if (hasTabs) {
        welcome.style.display = 'none';
        if (editor) editor.layout(); // Refresh layout when showing
    } else {
        welcome.style.display = 'flex';
    }
}

// --- Actions ---

async function saveActiveFile(silent = false) {
    if (!activeTabPath) return;
    
    const tab = openTabs.find(t => t.path === activeTabPath);
    const content = tab.model.getValue();

    if (!silent) setStatus("SAVING...", false, true);

    try {
        const res = await fetch('/api/ide/write', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ file: activeTabPath, content })
        });
        
        if (res.ok) {
            if (!silent) setStatus("SAVED SUCCESSFULLY");
        } else throw new Error("Save failed");
    } catch (e) {
        setStatus("SAVE FAILED", true);
        console.error(e);
    }
}

function triggerEditorAction(actionId) {
    if (!editor) return;
    
    if (actionId === 'undo') editor.trigger('keyboard', 'undo', null);
    else if (actionId === 'redo') editor.trigger('keyboard', 'redo', null);
    else {
        const action = editor.getAction(actionId);
        if (action) action.run();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isHidden = sidebar.style.display === 'none';
    sidebar.style.display = isHidden ? 'flex' : 'none';
    if (editor) editor.layout();
}

function showSettings() {
    document.getElementById('settings-modal').classList.add('active');
    document.getElementById('modal-overlay').classList.add('active');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('active');
    document.getElementById('modal-overlay').classList.remove('active');
}

// Global update setting function called by HTML inputs
window.updateSetting = function(key, value) {
    SettingsManager.update(key, value);
};

window.toggleMinimap = function() {
    updateSetting('minimap', !SettingsManager.current.minimap);
};

window.toggleWordWrap = function() {
    updateSetting('wordWrap', !SettingsManager.current.wordWrap);
};

window.changeFontSize = function(delta) {
    const newSize = Math.max(8, Math.min(32, parseInt(SettingsManager.current.fontSize) + delta));
    updateSetting('fontSize', newSize);
};

window.showShortcuts = function() {
    editor.getAction('editor.action.showAccessibilityHelp').run();
};

function startAutoSave() {
    // Logic handled in model change listener
}

function stopAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
}

function setStatus(msg, isError = false, isWarn = false) {
    const el = document.getElementById('status-msg');
    el.innerText = msg;
    el.style.color = isError ? '#e74c3c' : (isWarn ? '#ff0000' : 'var(--accent)');
}

function getMonacoLanguage(ext) {
    switch (ext) {
        case 'js': return 'javascript';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'json': return 'json';
        case 'md': return 'markdown';
        case 'xml': return 'xml';
        default: return 'plaintext';
    }
}

// Global hook
window.scriptEditor = { closeTab };
window.loadTree = loadTree;
window.saveActiveFile = saveActiveFile;
window.closeActiveTab = closeActiveTab;
window.closeAllTabs = closeAllTabs;
window.triggerEditorAction = triggerEditorAction;
window.toggleSidebar = toggleSidebar;
window.showSettings = showSettings;
window.closeSettings = closeSettings;