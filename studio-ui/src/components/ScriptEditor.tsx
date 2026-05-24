import React, { useState, useEffect, useRef } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useStudio } from '../hooks/useStudio';
import { 
    FileCode, Folder, Search, Terminal, Save, X, ChevronRight, ChevronDown, 
    FileText, Code, Settings, Plus, Play, Info, AlertCircle 
} from 'lucide-react';
import Toast, { ToastHandle } from './shared/Toast';

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

const ScriptEditor: React.FC = () => {
    const { isReady, eventBus, subscribe } = useStudio();
    const monaco = useMonaco();
    const editorRef = useRef<any>(null);
    const toastRef = useRef<ToastHandle>(null);

    const [fileTree, setFileTree] = useState<FileNode[]>([]);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [activeTabIdx, setActiveTabIdx] = useState(-1);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [activePanel, setActivePanel] = useState<'files' | 'search' | 'terminal'>('files');
    const [terminalOutput, setTerminalOutput] = useState<string[]>(['KETEBE CODE FORGE v7.0 INITIALIZED...', 'READY.']);

    // Expose openFile to be used by IRAB
    const openFileRef = useRef((path: string) => {});
    const injectCodeRef = useRef((code: string) => {});

    useEffect(() => {
        openFileRef.current = openFile;
    }, [tabs, activeTabIdx]);

    useEffect(() => {
        injectCodeRef.current = (code: string) => {
            if (!editorRef.current || !monaco) return;
            const model = editorRef.current.getModel();
            if (!model) return;
            const lineCount = model.getLineCount();
            const range = new monaco.Range(lineCount + 1, 1, lineCount + 1, 1);
            const text = "\n\n// --- AI Generated Snippet ---\n" + code + "\n";
            editorRef.current.executeEdits("IRAB-Inject", [{ range, text, forceMoveMarkers: true }]);
        };
    }, [monaco, activeTabIdx]);

    useEffect(() => {
        if (isReady) {
            loadTree();
            const params = new URLSearchParams(window.location.search);
            const file = params.get('file');
            if (file) openFile(file);

            // Register with StudioBridge for IRAB integration
            if ((window as any).StudioBridge && eventBus) {
                const studioBridge = new (window as any).StudioBridge('code', eventBus);
                
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
                        if (args.atEnd) {
                            injectCodeRef.current(args.content);
                        } else {
                            if (!editorRef.current) throw new Error("Editor not ready");
                            const position = editorRef.current.getPosition();
                            editorRef.current.executeEdits("IRAB-Insert", [
                                { range: new monaco!.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: args.content, forceMoveMarkers: true }
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
                        if (!editorRef.current || !monaco) throw new Error("Editor not ready");
                        const model = editorRef.current.getModel();
                        let range;
                        if (args.range) {
                            range = new monaco.Range(args.range.startLine, args.range.startCol, args.range.endLine, args.range.endCol);
                        } else {
                            range = model.getFullModelRange();
                        }
                        editorRef.current.executeEdits("IRAB-Replace", [{ range, text: args.content, forceMoveMarkers: true }]);
                        return { success: true };
                    }
                });
            }

            const unsubCode = subscribe('ai:inject-code', (data: any) => {
                injectCodeRef.current(data.code);
                toastRef.current?.show('AI SNIPPET INJECTED', 'info');
            });

            return () => {
                unsubCode();
            };
        }
    }, [isReady, monaco]);

    useEffect(() => {
        if (monaco) {
            monaco.editor.defineTheme('ketebe-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#050505',
                    'editor.lineHighlightBackground': '#111111',
                    'editorCursor.foreground': '#f1c40f',
                    'editor.selectionBackground': '#f1c40f33',
                    'editorIndentGuide.background': '#222222',
                }
            });
            monaco.editor.setTheme('ketebe-dark');
        }
    }, [monaco]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveFile();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tabs, activeTabIdx]);

    const loadTree = async () => {
        try {
            const res = await fetch('/api/ide/tree');
            if (res.ok) setFileTree(await res.json());
        } catch (e) {}
    };

    const openFile = async (path: string) => {
        const existingIdx = tabs.findIndex(t => t.path === path);
        if (existingIdx >= 0) {
            setActiveTabIdx(existingIdx);
            return;
        }

        try {
            const res = await fetch(`/api/ide/read?file=${encodeURIComponent(path)}`);
            if (res.ok) {
                const content = await res.text();
                const newTab: Tab = {
                    path,
                    name: path.split('/').pop() || 'file',
                    content,
                    isDirty: false
                };
                setTabs(prev => {
                    const next = [...prev, newTab];
                    setActiveTabIdx(next.length - 1);
                    return next;
                });
            }
        } catch (e) {
            console.error("Failed to read file", e);
        }
    };

    const saveFile = async () => {
        const tab = tabs[activeTabIdx];
        if (!tab) return;

        try {
            const res = await fetch('/api/ide/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: tab.path, content: tab.content })
            });
            if (res.ok) {
                const newTabs = [...tabs];
                newTabs[activeTabIdx].isDirty = false;
                setTabs(newTabs);
                appendTerminal(`[SUCCESS] Saved ${tab.path}`);
                toastRef.current?.show('FILE SAVED', 'success');
            }
        } catch (e) {
            appendTerminal(`[ERROR] Save failed for ${tab.path}`);
            toastRef.current?.show('SAVE FAILED', 'error');
        }
    };

    const closeTab = (idx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const newTabs = tabs.filter((_, i) => i !== idx);
        setTabs(newTabs);
        if (activeTabIdx >= idx) {
            setActiveTabIdx(Math.max(0, activeTabIdx - 1));
        }
        if (newTabs.length === 0) setActiveTabIdx(-1);
    };

    const handleSearch = async () => {
        if (!searchQuery) return;
        try {
            const res = await fetch(`/api/ide/search?query=${encodeURIComponent(searchQuery)}`);
            if (res.ok) setSearchResults(await res.json());
        } catch (e) {}
    };

    const appendTerminal = (line: string) => {
        setTerminalOutput(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString()}] ${line}`]);
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
                        {isDir ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <FileCode size={14} color="#f1c40f" />}
                        {node.name.toLowerCase()}
                    </div>
                    {isDir && isExpanded && node.children && renderTreeNodes(node.children, depth + 1)}
                </div>
            );
        });
    };

    if (!isReady) return <div style={{ color: '#f1c40f', padding: '20px' }}>BOOTING FORGE KERNEL...</div>;

    const currentTab = tabs[activeTabIdx];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050505' }}>
            <Toast ref={toastRef} />
            {/* HEADER */}
            <header style={{ height: '32px', background: '#000', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '2px', fontSize: '0.9rem' }}>
                        <Code size={16} style={{ marginRight: '8px', display: 'inline', verticalAlign: 'middle' }} /> CODE FORGE v7.1
                    </div>
                    <div style={{ display: 'flex', gap: '15px', color: '#444', fontSize: '0.85rem' }}>
                        <span onClick={saveFile} style={{ cursor: 'pointer' }}>File</span>
                        <span>Edit</span>
                        <span>Selection</span>
                        <span>Terminal</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="tool-btn" onClick={saveFile} title="Save (Ctrl+S)"><Save size={14} /></button>
                    <button className="tool-btn" title="Run Script"><Play size={14} color="#2ecc71" /></button>
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
                    <div style={{ marginTop: 'auto' }}>
                        <Settings size={20} color="#333" />
                    </div>
                </div>

                {/* SIDEBAR PANELS */}
                <div style={{ width: '250px', background: '#080808', borderRight: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column' }}>
                    {activePanel === 'files' && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <div style={{ padding: '10px 15px', fontSize: '0.75rem', color: '#444', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #111' }}>Explorer</div>
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
                        <div style={{ padding: '15px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#0f0' }}>
                            {terminalOutput.map((l, i) => <div key={i} style={{ marginBottom: '4px' }}>{l}</div>)}
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
                        {activeTabIdx >= 0 ? (
                            <Editor
                                height="100%"
                                path={currentTab.path}
                                defaultLanguage="javascript"
                                value={currentTab.content}
                                theme="ketebe-dark"
                                onMount={(editor) => { editorRef.current = editor; }}
                                onChange={(val) => {
                                    const newTabs = [...tabs];
                                    newTabs[activeTabIdx].content = val || '';
                                    newTabs[activeTabIdx].isDirty = true;
                                    setTabs(newTabs);
                                }}
                                options={{
                                    fontSize: 18,
                                    fontFamily: 'VT323, monospace',
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    lineNumbers: 'on',
                                    renderLineHighlight: 'all',
                                    tabSize: 4,
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

            {/* STATUS BAR */}
            <footer style={{ height: '22px', background: '#000', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', padding: '0 10px', justifyContent: 'space-between', fontSize: '0.75rem', color: '#444' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <span style={{ color: '#2ecc71' }}>● KERNEL ONLINE</span>
                    <span>UTF-8</span>
                </div>
                <div>
                    {activeTabIdx >= 0 && <span>PATH: {currentTab.path}</span>}
                </div>
            </footer>
        </div>
    );
};

export default ScriptEditor;
