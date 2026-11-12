import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { useMonaco, loader } from '@monaco-editor/react';
import { useStudio } from '../hooks/useStudio';
import { 
    FileCode, Folder, Search, Terminal, Save, X, ChevronRight, ChevronDown, 
    FileText, Code, Settings, Plus, Play, Info, AlertCircle 
} from 'lucide-react';
import Toast, { ToastHandle } from './shared/Toast';

loader.config({ paths: { vs: '/lib/monaco/vs' } });

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'dir';
    children?: FileNode[];
}

interface Tab {
    path: string;
    name: string;
    content: string;
    isDirty: boolean;
}

interface EditorSettings {
    fontSize: number;
    wordWrap: 'off' | 'on';
    minimap: boolean;
    tabSize: number;
}

const DEFAULT_SETTINGS: EditorSettings = {
    fontSize: 18,
    wordWrap: 'off',
    minimap: false,
    tabSize: 4
};

function getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
        case 'json': return 'json';
        case 'html':
        case 'htm': return 'html';
        case 'css': return 'css';
        case 'md':
        case 'markdown': return 'markdown';
        case 'ts':
        case 'tsx': return 'typescript';
        case 'py': return 'python';
        default: return 'javascript';
    }
}

function loadEditorSettings(): EditorSettings {
    try {
        const raw = localStorage.getItem('codeForgeSettings');
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                fontSize: Number(parsed.fontSize) || DEFAULT_SETTINGS.fontSize,
                wordWrap: parsed.wordWrap === 'on' || parsed.wordWrap === true ? 'on' : 'off',
                minimap: Boolean(parsed.minimap),
                tabSize: Number(parsed.tabSize) === 2 ? 2 : 4
            };
        }
    } catch {}
    return { ...DEFAULT_SETTINGS };
}

const ScriptEditor: React.FC = () => {
    const { isReady, eventBus, subscribe, emit } = useStudio();
    const monaco = useMonaco();
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const toastRef = useRef<ToastHandle>(null);

    const [fileTree, setFileTree] = useState<FileNode[]>([]);
    const [treeTruncated, setTreeTruncated] = useState(false);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [activeTabIdx, setActiveTabIdx] = useState(-1);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [activePanel, setActivePanel] = useState<'files' | 'search' | 'terminal'>('files');
    const [terminalOutput, setTerminalOutput] = useState<string[]>(['REDGLITCH CODE FORGE v7.0 INITIALIZED...', 'READY.']);
    const [terminalInput, setTerminalInput] = useState('');
    const [openMenu, setOpenMenu] = useState<'file' | 'edit' | 'selection' | null>(null);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [editorSettings, setEditorSettings] = useState<EditorSettings>(loadEditorSettings);

    const tabsRef = useRef<Tab[]>([]);
    const activeTabIdxRef = useRef<number>(-1);
    const savingRef = useRef(false);
    useEffect(() => { tabsRef.current = tabs; }, [tabs]);
    useEffect(() => { activeTabIdxRef.current = activeTabIdx; }, [activeTabIdx]);
    useEffect(() => { monacoRef.current = monaco; }, [monaco]);

    const appendTerminal = useCallback((line: string) => {
        setTerminalOutput(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString()}] ${line}`]);
    }, []);

    const openFile = useCallback(async (path: string) => {
        const existingIdx = tabsRef.current.findIndex(t => t.path === path);
        if (existingIdx >= 0) {
            setActiveTabIdx(existingIdx);
            return;
        }

        try {
            const res = await fetch(`/api/ide/read?file=${encodeURIComponent(path)}`);
            if (!res.ok) {
                let errMsg = `Failed to read ${path} (${res.status})`;
                try {
                    const errData = await res.json();
                    if (errData?.error) errMsg = errData.error;
                } catch {}
                appendTerminal(`[ERROR] ${errMsg}`);
                toastRef.current?.show(errMsg, 'error');
                return;
            }
            const content = await res.text();
            const newTab: Tab = {
                path,
                name: path.split('/').pop() || 'file',
                content,
                isDirty: false
            };
            setTabs(prev => {
                const idx = prev.findIndex(t => t.path === path);
                if (idx >= 0) {
                    setActiveTabIdx(idx);
                    return prev;
                }
                const next = [...prev, newTab];
                setActiveTabIdx(next.length - 1);
                return next;
            });
        } catch (e: any) {
            console.error("Failed to read file", e);
            toastRef.current?.show(e?.message || 'FAILED TO OPEN FILE', 'error');
        }
    }, [appendTerminal]);

    const saveSingleTab = useCallback(async (tab: Tab): Promise<{ ok: boolean; error?: string }> => {
        try {
            const res = await fetch('/api/ide/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: tab.path, content: tab.content })
            });
            if (res.ok) {
                return { ok: true };
            }
            let errMsg = `Save failed (${res.status})`;
            try {
                const errData = await res.json();
                if (errData?.error) errMsg = errData.error;
            } catch {}
            return { ok: false, error: errMsg };
        } catch (e: any) {
            return { ok: false, error: e?.message || 'Network error' };
        }
    }, []);

    const saveFile = useCallback(async () => {
        const idx = activeTabIdxRef.current;
        const tab = tabsRef.current[idx];
        if (!tab || savingRef.current) return;

        savingRef.current = true;
        try {
            const result = await saveSingleTab(tab);
            if (result.ok) {
                setTabs(prev => prev.map((t, i) => i === idx ? { ...t, isDirty: false } : t));
                appendTerminal(`[SUCCESS] Saved ${tab.path}`);
                toastRef.current?.show('FILE SAVED', 'success');
            } else {
                appendTerminal(`[ERROR] Save failed for ${tab.path}: ${result.error}`);
                toastRef.current?.show(result.error || 'SAVE FAILED', 'error');
            }
        } finally {
            savingRef.current = false;
        }
    }, [appendTerminal, saveSingleTab]);

    const saveAllFiles = useCallback(async (onlyDirty = true) => {
        const currentTabs = tabsRef.current;
        const targets = onlyDirty ? currentTabs.filter(t => t.isDirty) : currentTabs;
        if (targets.length === 0 || savingRef.current) return;

        savingRef.current = true;
        try {
            const savedPaths = new Set<string>();
            for (const tab of targets) {
                const res = await saveSingleTab(tab);
                if (res.ok) {
                    savedPaths.add(tab.path);
                    appendTerminal(`[SUCCESS] Saved ${tab.path}`);
                } else {
                    appendTerminal(`[ERROR] Save failed for ${tab.path}: ${res.error}`);
                    toastRef.current?.show(res.error || `SAVE FAILED: ${tab.name}`, 'error');
                }
            }
            if (savedPaths.size > 0) {
                setTabs(prev => prev.map(t => savedPaths.has(t.path) ? { ...t, isDirty: false } : t));
                toastRef.current?.show(savedPaths.size > 1 ? `SAVED ${savedPaths.size} FILES` : 'FILE SAVED', 'success');
            }
        } finally {
            savingRef.current = false;
        }
    }, [appendTerminal, saveSingleTab]);

    const saveAllRef = useRef(saveAllFiles);
    useEffect(() => { saveAllRef.current = saveAllFiles; }, [saveAllFiles]);
    const openFileRef = useRef(openFile);
    useEffect(() => { openFileRef.current = openFile; }, [openFile]);

    const injectCode = useCallback((code: string) => {
        const m = monacoRef.current || (window as any).monaco;
        if (!editorRef.current || !m) return;
        const model = editorRef.current.getModel();
        if (!model) return;
        const lineCount = model.getLineCount();
        const range = new m.Range(lineCount + 1, 1, lineCount + 1, 1);
        const text = "\n\n// --- AI Generated Snippet ---\n" + code + "\n";
        editorRef.current.executeEdits("IRAB-Inject", [{ range, text, forceMoveMarkers: true }]);
    }, []);

    useEffect(() => {
        if (!isReady) return;

        loadTree();
        const params = new URLSearchParams(window.location.search);
        const file = params.get('file');
        if (file) openFileRef.current(file);

        // Register with StudioBridge for IRAB integration
        let studioBridge: any = null;
        if ((window as any).StudioBridge && eventBus) {
            studioBridge = new (window as any).StudioBridge('code', eventBus);

            studioBridge.register({
                name: 'open',
                description: 'Open a specific file in the code editor.',
                securityLevel: 'safe',
                parameters: {
                    type: 'object',
                    properties: { path: { type: 'string', description: 'Path to the file to open.' } },
                    required: ['path']
                },
                execute: async (args: any) => {
                    await openFileRef.current(args.path);
                    return { success: true, message: `Opened ${args.path}` };
                }
            });

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
                execute: async (args: any) => {
                    const m = monacoRef.current || (window as any).monaco;
                    if (args.atEnd) {
                        injectCode(args.content);
                    } else {
                        if (!editorRef.current || !m) throw new Error("Editor not ready");
                        const position = editorRef.current.getPosition();
                        editorRef.current.executeEdits("IRAB-Insert", [
                            { range: new m.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: args.content, forceMoveMarkers: true }
                        ]);
                    }
                    return { success: true };
                }
            });

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
                                startLine: { type: 'number' }, startCol: { type: 'number' },
                                endLine: { type: 'number' }, endCol: { type: 'number' }
                            }
                        }
                    },
                    required: ['content']
                },
                execute: async (args: any) => {
                    const m = monacoRef.current || (window as any).monaco;
                    if (!editorRef.current || !m) throw new Error("Editor not ready");
                    const model = editorRef.current.getModel();
                    const range = args.range
                        ? new m.Range(args.range.startLine, args.range.startCol, args.range.endLine, args.range.endCol)
                        : model.getFullModelRange();
                    editorRef.current.executeEdits("IRAB-Replace", [{ range, text: args.content, forceMoveMarkers: true }]);
                    return { success: true };
                }
            });
        }

        const unsubCode = subscribe('ai:inject-code', (data: any) => {
            injectCode(data?.code || '');
            toastRef.current?.show('AI SNIPPET INJECTED', 'info');
        });

        const unsubScriptReq = subscribe('script:request', (event: any) => {
            if (event?.data?.scriptPath) openFileRef.current(event.data.scriptPath);
        });

        const unsubGlobalSave = subscribe('system:global_save', () => {
            saveAllRef.current(true);
        });

        const handleSaveMsg = (e: MessageEvent) => {
            if (e.data?.type === 'redglitch:save-request' && (e.origin === window.location.origin || e.source === window.parent || e.source === window.top)) {
                saveAllRef.current(true);
            }
        };
        window.addEventListener('message', handleSaveMsg);

        return () => {
            studioBridge?.dispose?.();
            unsubCode();
            unsubScriptReq();
            unsubGlobalSave();
            window.removeEventListener('message', handleSaveMsg);
        };
    }, [isReady, eventBus, subscribe, injectCode]);

    useEffect(() => {
        if (monaco) {
            monaco.editor.defineTheme('redglitch-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#050505',
                    'editor.lineHighlightBackground': '#111111',
                    'editorCursor.foreground': '#ff0000',
                    'editor.selectionBackground': '#ff000033',
                    'editorIndentGuide.background': '#222222',
                }
            });
            monaco.editor.setTheme('redglitch-dark');
        }
    }, [monaco]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveFile();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [saveFile]);

    const loadTree = async () => {
        try {
            const res = await fetch('/api/ide/tree');
            if (res.ok) {
                const data = await res.json();
                const tree = Array.isArray(data) ? data : (Array.isArray(data?.tree) ? data.tree : []);
                setFileTree(tree);
                const isTruncated = Boolean(!Array.isArray(data) && data?.truncated);
                setTreeTruncated(isTruncated);
                if (isTruncated) {
                    appendTerminal('[INFO] Workspace file tree truncated at entry limit.');
                }
            }
        } catch (err) { console.warn("[studio-ui] swallowed error", err); }
    };

    const closeTab = (idx: number, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const newTabs = tabs.filter((_, i) => i !== idx);
        setTabs(newTabs);
        if (newTabs.length === 0) {
            setActiveTabIdx(-1);
        } else if (activeTabIdx >= idx) {
            setActiveTabIdx(Math.max(0, activeTabIdx - 1));
        }
    };

    const handleSearch = async () => {
        if (!searchQuery) return;
        try {
            const res = await fetch(`/api/ide/search?query=${encodeURIComponent(searchQuery)}`);
            if (res.ok) setSearchResults(await res.json());
        } catch (err) { console.warn("[studio-ui] swallowed error", err); }
    };

    const runMonacoAction = (actionId: string) => {
        setOpenMenu(null);
        const ed = editorRef.current;
        if (!ed) {
            toastRef.current?.show('OPEN A FILE FIRST', 'info');
            return;
        }
        ed.focus();
        if (actionId === 'undo' || actionId === 'redo') {
            ed.trigger('toolbar', actionId, null);
            return;
        }
        const action = ed.getAction(actionId);
        if (action) action.run();
    };

    const handleRunScript = async () => {
        setActivePanel('terminal');
        const tab = tabsRef.current[activeTabIdxRef.current];
        if (!tab) {
            appendTerminal('[WARN] No active file selected to validate/run.');
            toastRef.current?.show('NO ACTIVE FILE', 'info');
            return;
        }

        if (tab.isDirty) {
            await saveFile();
        }

        const lang = getLanguageFromPath(tab.path);
        appendTerminal(`[RUN] Checking ${tab.path} (${lang})...`);

        if (lang === 'json') {
            try {
                const parsed = JSON.parse(tab.content);
                const summary = Array.isArray(parsed)
                    ? `Valid JSON array (${parsed.length} entries)`
                    : `Valid JSON object (${Object.keys(parsed || {}).length} keys)`;
                appendTerminal(`[OK] ${summary}`);
                toastRef.current?.show('JSON VALID', 'success');
            } catch (err: any) {
                appendTerminal(`[ERROR] Invalid JSON: ${err?.message || err}`);
                toastRef.current?.show('JSON SYNTAX ERROR', 'error');
            }
            return;
        }

        const m = monacoRef.current || (window as any).monaco;
        const model = editorRef.current?.getModel();
        if (m && model) {
            const markers = m.editor.getModelMarkers({ resource: model.uri }) || [];
            const errors = markers.filter((mk: any) => mk.severity >= 8);
            if (errors.length > 0) {
                errors.slice(0, 10).forEach((mk: any) => {
                    appendTerminal(`[DIAG L${mk.startLineNumber}:${mk.startColumn}] ${mk.message}`);
                });
                toastRef.current?.show(`${errors.length} DIAGNOSTIC ERROR(S)`, 'error');
                return;
            }
        }

        emit('script:executed', { path: tab.path, language: lang });
        appendTerminal(`[OK] No syntax errors in ${tab.name}. Dispatched script:executed.`);
        toastRef.current?.show(`CHECKED ${tab.name.toUpperCase()}`, 'success');
    };

    const handleTerminalCommand = async (rawCmd: string) => {
        const trimmed = rawCmd.trim();
        if (!trimmed) return;
        setTerminalInput('');
        appendTerminal(`$ ${trimmed}`);
        const [cmd, ...args] = trimmed.split(/\s+/);
        if (cmd === 'clear') {
            setTerminalOutput([]);
            return;
        }
        if (cmd === 'help') {
            appendTerminal('Commands: help, clear, pwd, ls [dir], save');
            return;
        }
        if (cmd === 'save') {
            await saveAllFiles(true);
            return;
        }
        if (cmd === 'pwd' || cmd === 'ls') {
            try {
                const res = await fetch('/api/ide/terminal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: cmd, args })
                });
                const data = await res.json();
                if (data.stderr) appendTerminal(`[ERR] ${data.stderr}`);
                else if (Array.isArray(data.stdout)) {
                    appendTerminal(data.stdout.map((f: any) => (f.isDirectory ? `${f.name}/` : f.name)).join('  '));
                } else {
                    appendTerminal(String(data.stdout || ''));
                }
            } catch {
                appendTerminal('[ERR] Terminal request failed');
            }
            return;
        }
        appendTerminal(`Unknown command "${cmd}". Type "help".`);
    };

    const updateSetting = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
        setEditorSettings(prev => {
            const next = { ...prev, [key]: value };
            try {
                localStorage.setItem('codeForgeSettings', JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    const toggleDir = (path: string) => {
        const next = new Set(expandedDirs);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        setExpandedDirs(next);
    };

    const renderTreeNodes = (nodes: FileNode[], depth = 0) => {
        return nodes.map(node => {
            const isExpanded = expandedDirs.has(node.path);
            const isDir = node.type === 'dir';
            
            return (
                <div key={node.path}>
                    <div 
                        className={`tree-item ${isDir ? 'dir' : 'file'}`}
                        onClick={() => isDir ? toggleDir(node.path) : openFile(node.path)}
                        style={{
                            padding: '4px 10px 4px ' + (10 + depth * 15) + 'px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: isDir ? '#3498db' : '#aaa',
                            fontSize: '0.9rem'
                        }}
                    >
                        {isDir ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <FileCode size={14} color="#ff0000" />}
                        {node.name.toLowerCase()}
                    </div>
                    {isDir && isExpanded && node.children && renderTreeNodes(node.children, depth + 1)}
                </div>
            );
        });
    };

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>BOOTING FORGE KERNEL...</div>;

    const currentTab = tabs[activeTabIdx];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050505' }} onClick={() => openMenu && setOpenMenu(null)}>
            <Toast ref={toastRef} />
            {/* HEADER */}
            <header style={{ height: '32px', background: '#000', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between', position: 'relative', zIndex: 50 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '2px', fontSize: '0.9rem' }}>
                        <Code size={16} style={{ marginRight: '8px', display: 'inline', verticalAlign: 'middle' }} /> CODE FORGE v7.1
                    </div>
                    <div style={{ display: 'flex', gap: '15px', color: '#888', fontSize: '0.85rem', position: 'relative' }}>
                        <div style={{ position: 'relative' }}>
                            <span onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'file' ? null : 'file'); }} style={{ cursor: 'pointer', color: openMenu === 'file' ? 'var(--accent)' : undefined }}>File</span>
                            {openMenu === 'file' && (
                                <div className="menu-dropdown" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '24px', left: 0, background: '#111', border: '1px solid #333', minWidth: '160px', zIndex: 100 }}>
                                    <div className="menu-opt" onClick={() => { setOpenMenu(null); saveFile(); }} style={{ padding: '6px 12px', cursor: 'pointer' }}>Save (Ctrl+S)</div>
                                    <div className="menu-opt" onClick={() => { setOpenMenu(null); saveAllFiles(false); }} style={{ padding: '6px 12px', cursor: 'pointer' }}>Save All</div>
                                    <div className="menu-opt" onClick={() => { setOpenMenu(null); if (activeTabIdx >= 0) closeTab(activeTabIdx); }} style={{ padding: '6px 12px', cursor: 'pointer' }}>Close Tab</div>
                                </div>
                            )}
                        </div>
                        <div style={{ position: 'relative' }}>
                            <span onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'edit' ? null : 'edit'); }} style={{ cursor: 'pointer', color: openMenu === 'edit' ? 'var(--accent)' : undefined }}>Edit</span>
                            {openMenu === 'edit' && (
                                <div className="menu-dropdown" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '24px', left: 0, background: '#111', border: '1px solid #333', minWidth: '160px', zIndex: 100 }}>
                                    <div className="menu-opt" onClick={() => runMonacoAction('undo')} style={{ padding: '6px 12px', cursor: 'pointer' }}>Undo</div>
                                    <div className="menu-opt" onClick={() => runMonacoAction('redo')} style={{ padding: '6px 12px', cursor: 'pointer' }}>Redo</div>
                                    <div className="menu-opt" onClick={() => runMonacoAction('actions.find')} style={{ padding: '6px 12px', cursor: 'pointer' }}>Find</div>
                                    <div className="menu-opt" onClick={() => runMonacoAction('editor.action.startFindReplaceAction')} style={{ padding: '6px 12px', cursor: 'pointer' }}>Replace</div>
                                </div>
                            )}
                        </div>
                        <div style={{ position: 'relative' }}>
                            <span onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === 'selection' ? null : 'selection'); }} style={{ cursor: 'pointer', color: openMenu === 'selection' ? 'var(--accent)' : undefined }}>Selection</span>
                            {openMenu === 'selection' && (
                                <div className="menu-dropdown" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: '24px', left: 0, background: '#111', border: '1px solid #333', minWidth: '180px', zIndex: 100 }}>
                                    <div className="menu-opt" onClick={() => runMonacoAction('editor.action.selectAll')} style={{ padding: '6px 12px', cursor: 'pointer' }}>Select All</div>
                                    <div className="menu-opt" onClick={() => runMonacoAction('editor.action.copyLinesDownAction')} style={{ padding: '6px 12px', cursor: 'pointer' }}>Duplicate Line Down</div>
                                    <div className="menu-opt" onClick={() => runMonacoAction('editor.action.insertCursorBelow')} style={{ padding: '6px 12px', cursor: 'pointer' }}>Add Cursor Below</div>
                                </div>
                            )}
                        </div>
                        <span onClick={() => { setOpenMenu(null); setActivePanel('terminal'); }} style={{ cursor: 'pointer', color: activePanel === 'terminal' ? 'var(--accent)' : undefined }}>Terminal</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="tool-btn" onClick={saveFile} title="Save (Ctrl+S)"><Save size={14} /></button>
                    <button className="tool-btn" onClick={handleRunScript} title="Validate / Run Script"><Play size={14} color="#2ecc71" /></button>
                </div>
            </header>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                {/* ACTIVITY BAR */}
                <div style={{ width: '48px', background: '#000', borderRight: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: '20px' }}>
                    <FileText 
                        size={24} 
                        color={activePanel === 'files' ? 'var(--accent)' : '#444'} 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => setActivePanel('files')}
                    />
                    <Search 
                        size={24} 
                        color={activePanel === 'search' ? 'var(--accent)' : '#444'} 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => setActivePanel('search')}
                    />
                    <Terminal 
                        size={24} 
                        color={activePanel === 'terminal' ? 'var(--accent)' : '#444'} 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => setActivePanel('terminal')}
                    />
                    <div style={{ marginTop: 'auto', cursor: 'pointer' }} onClick={() => setShowSettingsModal(true)} title="Editor Settings">
                        <Settings size={20} color={showSettingsModal ? 'var(--accent)' : '#666'} />
                    </div>
                </div>

                {/* SIDEBAR PANELS */}
                <div style={{ width: '250px', background: '#080808', borderRight: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column' }}>
                    {activePanel === 'files' && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ padding: '10px 15px', fontSize: '0.75rem', color: '#444', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #111', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Explorer</span>
                                {treeTruncated && <span style={{ color: '#e67e22', fontSize: '0.65rem' }}>TRUNCATED</span>}
                            </div>
                            <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px 0' }}>
                                {renderTreeNodes(fileTree)}
                            </div>
                        </div>
                    )}
                    {activePanel === 'search' && (
                        <div style={{ padding: '15px' }}>
                            <div style={{ fontSize: '0.75rem', color: '#444', textTransform: 'uppercase', marginBottom: '10px' }}>Global Search</div>
                            <input 
                                type="text" 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search all files..."
                                style={{ marginBottom: '15px', fontSize: '0.9rem' }}
                            />
                            <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 150px)' }}>
                                {searchResults.map((r, i) => (
                                    <div 
                                        key={i} 
                                        onClick={() => openFile(r.path)}
                                        style={{ padding: '8px 5px', borderBottom: '1px solid #111', cursor: 'pointer' }}
                                    >
                                        <div style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 'bold' }}>{r.path.split('/').pop()}</div>
                                        <div style={{ color: '#666', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.text}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {activePanel === 'terminal' && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                            <div style={{ flexGrow: 1, overflowY: 'auto', color: '#0f0', marginBottom: '8px' }}>
                                {terminalOutput.map((l, i) => <div key={i} style={{ marginBottom: '4px', wordBreak: 'break-word' }}>{l}</div>)}
                            </div>
                            <input
                                type="text"
                                value={terminalInput}
                                onChange={(e) => setTerminalInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleTerminalCommand(terminalInput)}
                                placeholder="help | pwd | ls | clear"
                                style={{ fontFamily: 'monospace', fontSize: '0.78rem', padding: '5px 8px' }}
                            />
                        </div>
                    )}
                </div>

                {/* EDITOR AREA */}
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* TABS */}
                    <div style={{ height: '35px', background: '#000', display: 'flex', borderBottom: '1px solid #1a1a1a', overflowX: 'auto' }}>
                        {tabs.map((tab, i) => (
                            <div 
                                key={tab.path}
                                onClick={() => setActiveTabIdx(i)}
                                style={{
                                    height: '100%', padding: '0 15px', display: 'flex', alignItems: 'center', gap: '10px',
                                    background: activeTabIdx === i ? '#080808' : '#000',
                                    borderRight: '1px solid #1a1a1a',
                                    color: activeTabIdx === i ? 'var(--accent)' : '#555',
                                    cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap'
                                }}
                            >
                                <FileCode size={14} />
                                {tab.name.toLowerCase()} {tab.isDirty && '*'}
                                <X size={12} onClick={(e) => closeTab(i, e)} style={{ marginLeft: '5px' }} />
                            </div>
                        ))}
                    </div>

                    {/* MONACO */}
                    <div style={{ flexGrow: 1 }}>
                        {activeTabIdx >= 0 && currentTab ? (
                            <Editor
                                height="100%"
                                path={currentTab.path}
                                language={getLanguageFromPath(currentTab.path)}
                                value={currentTab.content}
                                theme="redglitch-dark"
                                beforeMount={(m) => {
                                    m.editor.defineTheme('redglitch-dark', {
                                        base: 'vs-dark',
                                        inherit: true,
                                        rules: [],
                                        colors: {
                                            'editor.background': '#050505',
                                            'editor.lineHighlightBackground': '#111111',
                                            'editorCursor.foreground': '#ff0000',
                                            'editor.selectionBackground': '#ff000033',
                                            'editorIndentGuide.background': '#222222',
                                        }
                                    });
                                }}
                                onMount={(editor) => { editorRef.current = editor; }}
                                onChange={(val) => {
                                    const targetIdx = activeTabIdxRef.current;
                                    setTabs(prev => prev.map((t, i) => i === targetIdx ? { ...t, content: val ?? '', isDirty: true } : t));
                                }}
                                options={{
                                    fontSize: editorSettings.fontSize,
                                    fontFamily: 'VT323, monospace',
                                    minimap: { enabled: editorSettings.minimap },
                                    wordWrap: editorSettings.wordWrap,
                                    scrollBeyondLastLine: false,
                                    lineNumbers: 'on',
                                    renderLineHighlight: 'all',
                                    tabSize: editorSettings.tabSize,
                                    automaticLayout: true
                                }}
                            />
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#222' }}>
                                <Code size={64} style={{ marginBottom: '20px', opacity: 0.1 }} />
                                <div style={{ fontSize: '1.2rem', letterSpacing: '2px' }}>CODE FORGE READY</div>
                                <div style={{ fontSize: '0.8rem', marginTop: '10px' }}>SELECT A FILE TO START FORGING</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showSettingsModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="panel" style={{ width: '380px', height: 'auto', border: '2px solid var(--accent)' }}>
                        <div className="panel-header">
                            <span>EDITOR SETTINGS</span>
                            <button className="tool-btn" onClick={() => setShowSettingsModal(false)}>×</button>
                        </div>
                        <div className="panel-content">
                            <div>
                                <label>Font Size</label>
                                <input type="number" min={10} max={32} value={editorSettings.fontSize} onChange={(e) => updateSetting('fontSize', Math.max(10, Math.min(32, parseInt(e.target.value, 10) || 18)))} />
                            </div>
                            <div>
                                <label>Tab Size</label>
                                <select value={editorSettings.tabSize} onChange={(e) => updateSetting('tabSize', parseInt(e.target.value, 10) === 2 ? 2 : 4)}>
                                    <option value={2}>2 Spaces</option>
                                    <option value={4}>4 Spaces</option>
                                </select>
                            </div>
                            <div>
                                <label>Word Wrap</label>
                                <select value={editorSettings.wordWrap} onChange={(e) => updateSetting('wordWrap', e.target.value === 'on' ? 'on' : 'off')}>
                                    <option value="off">Off</option>
                                    <option value="on">On</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input type="checkbox" checked={editorSettings.minimap} onChange={(e) => updateSetting('minimap', e.target.checked)} style={{ width: '18px' }} />
                                <label style={{ marginBottom: 0 }}>Show Minimap</label>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STATUS BAR */}
            <footer style={{ height: '22px', background: '#000', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', padding: '0 10px', justifyContent: 'space-between', fontSize: '0.75rem', color: '#444' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <span style={{ color: '#2ecc71' }}>● KERNEL ONLINE</span>
                    <span>UTF-8</span>
                    {currentTab && <span>{getLanguageFromPath(currentTab.path).toUpperCase()}</span>}
                </div>
                <div>
                    {activeTabIdx >= 0 && currentTab && <span>PATH: {currentTab.path}</span>}
                </div>
            </footer>
        </div>
    );
};

export default ScriptEditor;
