import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Atom, Box, Code, Cpu, Database, Film, Flag, Folder, Gamepad, Globe, 
    Hammer, Image as ImageIcon, Layout, LifeBuoy, List, MessageSquare, 
    Music, Play, Rocket, Save, Scroll, Settings, Skull, Terminal, 
    Trash2, User, UserPlus, Zap, X, Minus, Square, Columns, Maximize2,
    HardDrive, Activity, ChevronRight, ChevronDown, Clock, Search,
    Loader2, Monitor
} from 'lucide-react';
import Toast, { ToastHandle } from './shared/Toast';

// Icon Map for serializable state handling
const IconMap: Record<string, any> = {
    Rocket, Activity, Code, ImageIcon, UserPlus, Skull, Scroll, 
    Flag, MessageSquare, Music, Zap, Box, Folder, Layout, Settings, Monitor
};

interface Tool {
    id: string;
    category: string;
    title: string;
    iconName: string;
    src: string;
    w: number;
    h: number;
    betaStatus?: 'supported' | 'experimental' | 'optional';
}

interface WindowState {
    id: string;
    title: string;
    iconName: string;
    src: string;
    isOpen: boolean;
    isMinimized: boolean;
    isMaximized: boolean;
    zIndex: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

const StudioApp: React.FC = () => {
    const { isReady, eventBus, subscribe, projectState } = useStudio();
    const [activeProject, setActiveProject] = useState('LOADING...');
    const [windows, setWindows] = useState<Record<string, WindowState>>({});
    const [focusedWinId, setFocusedWinId] = useState<string | null>(null);
    const [zIndexCounter, setZIndexCounter] = useState(100);
    const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
    const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
    const [rightSidebarPane, setRightSidebarPane] = useState<'devops' | 'files'>('devops');
    const [systemStats, setSystemStats] = useState({ cpu: 0, mem: 0 });
    const toastRef = useRef<ToastHandle>(null);

    const tools: Tool[] = [
        { id: 'dashboard', category: 'SYSTEM', title: 'Launcher', iconName: 'Rocket', src: '../dashboard.html', w: 900, h: 700, betaStatus: 'supported' },
        { id: 'project_dashboard', category: 'SYSTEM', title: 'Command Center', iconName: 'Activity', src: '../project_dashboard.html', w: 1000, h: 600, betaStatus: 'supported' },
        { id: 'script', category: 'LOGIC & AI', title: 'Script Editor', iconName: 'Code', src: 'script_editor.html', w: 1000, h: 700 },
        { id: 'pixel', category: 'ASSETS', title: 'Pixel Art', iconName: 'ImageIcon', src: 'pixel_editor.html', w: 900, h: 650 },
        { id: 'npc', category: 'ENTITIES', title: 'NPC Editor', iconName: 'UserPlus', src: 'npc_editor.html', w: 700, h: 500 },
        { id: 'enemy', category: 'ENTITIES', title: 'Enemy Editor', iconName: 'Skull', src: 'enemy_editor.html', w: 700, h: 500 },
        { id: 'item', category: 'ENTITIES', title: 'Item Database', iconName: 'Scroll', src: 'item_editor.html', w: 700, h: 500 },
        { id: 'quests', category: 'LOGIC & AI', title: 'Quest Designer', iconName: 'Flag', src: 'quest_editor.html', w: 900, h: 600, betaStatus: 'experimental' },
        { id: 'dialogue', category: 'LOGIC & AI', title: 'Dialogues', iconName: 'MessageSquare', src: 'dialogue_editor.html', w: 800, h: 500, betaStatus: 'experimental' },
        { id: 'daw', category: 'ASSETS', title: 'Audio Studio', iconName: 'Music', src: 'daw_editor.html', w: 800, h: 500, betaStatus: 'experimental' },
        { id: 'fxpro', category: 'ASSETS', title: 'FX Master', iconName: 'Zap', src: 'fx_editor.html', w: 900, h: 650 },
        { id: 'shader', category: 'ASSETS', title: 'Shader Lab', iconName: 'Box', src: 'shader_lab.html', w: 1200, h: 800, betaStatus: 'optional' },
        { id: 'assets', category: 'ASSETS', title: 'File Manager', iconName: 'Folder', src: 'asset_manager.html', w: 900, h: 600 },
        { id: 'algorithm', category: 'LOGIC & AI', title: 'Node Logic', iconName: 'Layout', src: 'algorithm_editor.html', w: 1000, h: 700, betaStatus: 'experimental' },
        { id: 'ui_designer', category: 'INTERFACE', title: 'UI Designer', iconName: 'Monitor', src: 'ui_designer.html', w: 1200, h: 800, betaStatus: 'experimental' }
    ];

    useEffect(() => {
        if (isReady) {
            loadCurrentProject();
            const statsTimer = setInterval(updateStats, 3000);
            return () => clearInterval(statsTimer);
        }
    }, [isReady]);

    const loadCurrentProject = async () => {
        try {
            const res = await fetch('/api/projects/current');
            if (res.ok) {
                const data = await res.json();
                const name = data.name || 'UNKNOWN';
                setActiveProject(name.toUpperCase());
                if (data.isRoot) {
                    window.location.href = '../dashboard.html';
                } else {
                    const cmdCenter = tools.find(t => t.id === 'project_dashboard');
                    if (cmdCenter) openWindow(cmdCenter);
                }
            }
        } catch (e) {
            console.error("Failed to load project", e);
        }
    };

    const updateStats = async () => {
        try {
            const res = await fetch('/api/system/stats');
            if (res.ok) {
                const data = await res.json();
                setSystemStats({ cpu: Math.round(data.cpu || 0), mem: data.mem || 0 });
            }
        } catch (e) {}
    };

    const openWindow = (tool: Tool) => {
        const nextZ = zIndexCounter + 1;
        setZIndexCounter(nextZ);
        setFocusedWinId(tool.id);
        
        setWindows(prev => {
            if (prev[tool.id]) {
                return {
                    ...prev,
                    [tool.id]: { ...prev[tool.id], isOpen: true, isMinimized: false, zIndex: nextZ }
                };
            }
            const newWin: WindowState = {
                id: tool.id,
                title: tool.title,
                iconName: tool.iconName,
                src: tool.src,
                isOpen: true,
                isMinimized: false,
                isMaximized: true,
                zIndex: nextZ,
                x: 30, y: 30,
                w: tool.w, h: tool.h
            };
            return { ...prev, [tool.id]: newWin };
        });
    };

    const focusWindow = (id: string) => {
        const nextZ = zIndexCounter + 1;
        setZIndexCounter(nextZ);
        setFocusedWinId(id);
        setWindows(prev => ({
            ...prev,
            [id]: { ...prev[id], zIndex: nextZ }
        }));
    };

    const toggleMaximize = (id: string) => {
        setWindows(prev => ({
            ...prev,
            [id]: { ...prev[id], isMaximized: !prev[id].isMaximized }
        }));
    };

    if (!isReady) {
        return (
            <div style={{ 
                height: '100vh', width: '100vw', background: '#000', 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent)', fontFamily: 'VT323, monospace'
            }}>
                <Loader2 size={64} className="spin" style={{ marginBottom: '20px' }} />
                <div style={{ fontSize: '1.5rem', letterSpacing: '4px' }}>BOOTING REDGLITCH KERNEL...</div>
            </div>
        );
    }

    return (
        <div style={{ 
            display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', 
            background: '#050508', overflow: 'hidden', position: 'fixed', top: 0, left: 0 
        }}>
            <Toast ref={toastRef} />
            
            {/* TITLE BAR */}
            <header style={{ height: '36px', background: '#000', borderBottom: '1px solid #1f2b42', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0', zIndex: 10000, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '8px', minWidth: 0, paddingRight: '8px' }}>
                    <div style={{ width: '36px', height: '100%', background: '#020408', borderRight: '1px solid #1f2b42', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Atom size={18} color="var(--accent)" className="fa-spin" />
                    </div>
                    <span style={{ fontWeight: 'bold', letterSpacing: '2px', color: 'var(--accent)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        REDGLITCH STUDIO <span style={{ color: '#444', fontWeight: 'normal', margin: '0 6px' }}>|</span> {activeProject}
                    </span>
                </div>

                <div style={{ display: 'flex', height: '100%', flexShrink: 0 }}>
                    <div className="win-control-btn"><Minus size={13} /></div>
                    <div className="win-control-btn"><Square size={11} /></div>
                    <div className="win-control-btn close" onClick={() => window.location.href = '../dashboard.html'}><X size={15} /></div>
                </div>
            </header>

            {/* QUICK TOOLBAR */}
            <div style={{ height: '38px', background: '#000', borderBottom: '1px solid #1f2b42', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '5px' }}>
                <div style={{ display: 'flex', gap: '2px', borderRight: '1px solid #222', paddingRight: '10px' }}>
                    <button className="tool-btn-q" onClick={loadCurrentProject}><Folder size={16} /></button>
                    <button className="tool-btn-q"><Save size={16} /></button>
                </div>
                <div style={{ display: 'flex', gap: '2px', borderRight: '1px solid #222', paddingRight: '10px', paddingLeft: '5px' }}>
                    <button className="tool-btn-q" style={{ color: '#2ecc71' }}><Play size={16} /></button>
                    <button className="tool-btn-q"><Hammer size={16} /></button>
                </div>
                <div style={{ display: 'flex', gap: '2px', paddingLeft: '5px' }}>
                    <button className="tool-btn-q" onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}><Columns size={16} /></button>
                    <button className="tool-btn-q" onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}><Columns size={16} style={{ transform: 'scaleX(-1)' }} /></button>
                </div>
            </div>

            {/* MAIN AREA */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
                {/* LEFT SIDEBAR */}
                {!leftSidebarCollapsed && (
                    <aside style={{ width: '220px', background: '#080c18', borderRight: '2px solid #020408', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <div style={{ padding: '10px', color: 'var(--accent)', borderBottom: '1px solid #2c3e50', fontSize: '13px', letterSpacing: '1px' }}>PUBLIC BETA TOOLS</div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '5px' }} className="pixel-scroll">
                            {['SYSTEM', 'WORLD ARCHITECT', 'ENTITIES', 'LOGIC & AI', 'ASSETS'].map(cat => (
                                <div key={cat} style={{ marginBottom: '15px' }}>
                                    <div style={{ color: '#555', fontSize: '11px', padding: '5px', borderBottom: '1px solid #111', marginBottom: '5px', fontWeight: 'bold' }}>{cat}</div>
                                    {tools.filter(t => t.category === cat).map(tool => {
                                        const Icon = IconMap[tool.iconName] || Box;
                                        return (
                                            <div 
                                                key={tool.id} 
                                                className={`module-btn ${windows[tool.id]?.isOpen ? 'opened' : ''} ${focusedWinId === tool.id ? 'active' : ''}`}
                                                onClick={() => openWindow(tool)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <Icon size={16} color="var(--accent)" />
                                                    <span>{tool.title.toLowerCase()}</span>
                                                </div>
                                                {tool.betaStatus && tool.betaStatus !== 'supported' && (
                                                    <span className={`beta-status ${tool.betaStatus}`}>{tool.betaStatus}</span>
                                                )}
                                                {windows[tool.id]?.isOpen && <div className="opened-indicator" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </aside>
                )}

                {/* WORKSPACE */}
                <main style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#050508', backgroundImage: 'radial-gradient(#182236 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                    {Object.values(windows).map(win => {
                        const Icon = IconMap[win.iconName] || Box;
                        return (
                            <div 
                                key={win.id}
                                onMouseDown={() => focusWindow(win.id)}
                                style={{ 
                                    position: 'absolute',
                                    display: win.isOpen && !win.isMinimized ? 'flex' : 'none',
                                    flexDirection: 'column',
                                    zIndex: win.zIndex,
                                    top: win.isMaximized ? 0 : win.y,
                                    left: win.isMaximized ? 0 : win.x,
                                    width: win.isMaximized ? '100%' : win.w,
                                    height: win.isMaximized ? '100%' : win.h,
                                    background: '#080c18',
                                    border: win.isMaximized ? 'none' : '2px solid #34495e',
                                    boxShadow: win.isMaximized ? 'none' : '10px 10px 30px rgba(0,0,0,0.5)'
                                }}
                            >
                                <div 
                                    style={{ 
                                        height: '30px', background: focusedWinId === win.id ? '#000' : '#050505', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                                        padding: '0 10px', borderBottom: '1px solid #1f2b42', cursor: 'default',
                                        color: focusedWinId === win.id ? 'var(--accent)' : '#666'
                                    }}
                                    onDoubleClick={() => toggleMaximize(win.id)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                                        <Icon size={14} />
                                        {win.title.toLowerCase()}
                                    </div>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <button className="win-btn" onClick={(e) => { e.stopPropagation(); setWindows(prev => ({...prev, [win.id]: {...prev[win.id], isMinimized: true}})); }}>_</button>
                                        <button className="win-btn" onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}>□</button>
                                        <button className="win-btn close" onClick={(e) => { e.stopPropagation(); setWindows(prev => ({...prev, [win.id]: {...prev[win.id], isOpen: false}})); }}>×</button>
                                    </div>
                                </div>
                                <div style={{ flex: 1, background: '#000', position: 'relative' }}>
                                    <iframe 
                                        src={win.src} 
                                        style={{ width: '100%', height: '100%', border: 'none', background: '#000' }} 
                                        title={win.title}
                                    />
                                    {focusedWinId !== win.id && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />}
                                </div>
                            </div>
                        );
                    })}
                    
                    {Object.values(windows).filter(w => w.isOpen && !w.isMinimized).length === 0 && (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', opacity: 0.1 }}>
                            <Atom size={128} className="fa-spin" />
                            <div style={{ fontSize: '2rem', marginTop: '20px', letterSpacing: '5px' }}>KERNEL READY</div>
                        </div>
                    )}
                </main>

                {/* RIGHT SIDEBAR */}
                {!rightSidebarCollapsed && (
                    <aside style={{ width: '240px', background: '#0a0f1a', borderLeft: '2px solid #020408', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <div style={{ display: 'flex', background: '#000', borderBottom: '1px solid #1f2b42' }}>
                            <div className={`sidebar-tab ${rightSidebarPane === 'devops' ? 'active' : ''}`} onClick={() => setRightSidebarPane('devops')}>DEV OPS</div>
                            <div className={`sidebar-tab ${rightSidebarPane === 'files' ? 'active' : ''}`} onClick={() => setRightSidebarPane('files')}>FILES</div>
                        </div>
                        <div className="pixel-scroll" style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                            {rightSidebarPane === 'devops' ? (
                                <>
                                    <div className="cat-title" style={{ borderBottom: '1px solid #222', marginBottom: '10px' }}>RUNTIME CONTROL</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <button className="ops-btn-new"><Play size={14} color="#2ecc71" /> PLAY</button>
                                        <button className="ops-btn-new"><Terminal size={14} /> LOGS</button>
                                    </div>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', color: '#333', marginTop: '40px' }}>
                                    <HardDrive size={48} style={{ margin: '0 auto 10px', opacity: 0.2 }} />
                                    BEYOND THE KERNEL
                                </div>
                            )}
                        </div>
                    </aside>
                )}
            </div>

            {/* STATUS BAR */}
            <footer style={{ height: '25px', background: '#000', borderTop: '1px solid #1f2b42', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', fontSize: '12px', color: '#8fa0bc' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Folder size={12} /> {activeProject}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2ecc71' }}>● KERNEL ONLINE</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)' }}>PUBLIC BETA</div>
                </div>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div>CPU: {systemStats.cpu}%</div>
                    <div>MEM: {systemStats.mem}MB</div>
                    <div style={{ color: 'var(--accent)' }}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
            </footer>

            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                
                .win-control-btn { width: 36px; height: 100%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.1s; color: #555; }
                .win-control-btn:hover { background: #1f2b42; color: #fff; }
                .win-control-btn.close:hover { background: #e74c3c; }
                
                .tool-btn-q { width: 32px; height: 32px; background: transparent; border: 1px solid transparent; color: #555; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 3px; transition: all 0.1s; }
                .tool-btn-q:hover { background: #111; color: #fff; border-color: #222; }
                
                .module-btn { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; cursor: pointer; color: #8fa0bc; margin-bottom: 2px; transition: all 0.1s; position: relative; }
                .module-btn:hover { background: #1a243a; color: #fff; }
                .module-btn.active { background: #1f2b42; color: var(--accent); }
                .opened-indicator { width: 6px; height: 6px; background: var(--accent); border-radius: 50%; box-shadow: 0 0 8px var(--accent); }
                .beta-status { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; border: 1px solid #333; color: #777; padding: 2px 5px; }
                .beta-status.experimental { border-color: rgba(255, 30, 39, 0.28); color: #ff8f95; }
                .beta-status.optional { border-color: rgba(46, 204, 113, 0.25); color: #80c99a; }
                
                .sidebar-tab { flex: 1; padding: 10px; text-align: center; color: #444; font-size: 11px; cursor: pointer; border-bottom: 2px solid transparent; letter-spacing: 1px; }
                .sidebar-tab.active { color: var(--accent); border-bottom-color: var(--accent); background: #080c18; }
                
                .win-btn { width: 22px; height: 22px; background: #111; border: 1px solid #333; color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
                .win-btn:hover { background: #333; border-color: #555; }
                .win-btn.close:hover { background: #e74c3c; border-color: #e74c3c; }
                
                .ops-btn-new { background: #111; border: 1px solid #333; color: #8fa0bc; padding: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; border-radius: 4px; transition: all 0.1s; font-family: inherit; }
                .ops-btn-new:hover { background: #1f2b42; color: #fff; border-color: var(--accent); }
            `}</style>
        </div>
    );
};

export default StudioApp;
