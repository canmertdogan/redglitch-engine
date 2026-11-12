import React, { useState, useEffect, useRef } from 'react';
import { Rocket, Layout, ShoppingBag, GraduationCap, Users, Settings, Plus, FolderOpen, Trash2, Cpu, HardDrive, Clock, ImageIcon, Swords, CheckCircle2, Box } from 'lucide-react';
import Background from './Dashboard/Background';
import Toast, { ToastHandle } from './shared/Toast';

interface Project {
    name: string;
    path: string;
    engineType: string;
    lastModified?: string;
}

const BLUEPRINTS = [
    { id: 'rpg-topdown', name: 'RPG CORE', icon: Swords, desc: 'Top-down 2D RPG with quests, combat, and dialogue.' },
    { id: 'platformer-2d', name: 'PLATFORMER 2D', icon: Rocket, desc: 'Side-scrolling physics, slopes, and action combat.' },
    { id: 'iso-pixel', name: 'ISO PIXEL', icon: Layout, desc: '2.5D isometric perspective with depth-sorting.' },
    { id: 'unified-3d', name: 'UNIFIED 3D', icon: Box, desc: '3D FPS, platformer, and top-down worlds with Three.js.' },
] as const;

const Dashboard: React.FC = () => {
    const [activeView, setActiveView] = useState('projects');
    const [projects, setProjects] = useState<Project[]>([]);
    const [stats, setStats] = useState({ cpu: 0, mem: 0 });
    const [perfMode, setPerfMode] = useState(localStorage.getItem('redglitch_perf_mode') === 'true');
    const [username, setUsername] = useState(localStorage.getItem('redglitch_username') || 'Developer');

    const [wizardStep, setWizardStep] = useState(1);
    const [newProjectData, setNewProjectData] = useState({ name: '', author: '', blueprint: 'rpg-topdown' });
    const [wizardError, setWizardError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const toastRef = useRef<ToastHandle>(null);

    useEffect(() => {
        loadProjects();
        const statsTimer = setInterval(loadStats, 3000);
        return () => clearInterval(statsTimer);
    }, []);

    const loadProjects = async () => {
        try {
            const res = await fetch('/api/projects');
            if (res.ok) setProjects(await res.json());
        } catch (e) { console.error("Failed to load projects", e); }
    };

    const loadStats = async () => {
        try {
            const res = await fetch('/api/system/stats');
            if (res.ok) {
                const data = await res.json();
                setStats({ cpu: Math.round(data.cpu), mem: data.mem });
            }
        } catch (err) { console.warn("[studio-ui] swallowed error", err); }
    };

    const launchProject = async (name: string) => {
        try {
            const res = await fetch('/api/projects/switch', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ name }) 
            });
            if (!res.ok) {
                let errMsg = `Failed to open project (${res.status})`;
                try {
                    const data = await res.json();
                    if (data?.error) errMsg = data.error;
                } catch {}
                toastRef.current?.show(errMsg, 'error');
                return;
            }
            (window.top || window).location.href = '../tools.html';
        } catch (err: any) {
            console.warn("[studio-ui] launchProject failed", err);
            toastRef.current?.show(err?.message || 'FAILED TO LAUNCH PROJECT', 'error');
        }
    };

    const revealProject = async (name: string) => {
        try {
            const res = await fetch('/api/projects/reveal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (!res.ok) {
                let errMsg = `Reveal failed (${res.status})`;
                try {
                    const data = await res.json();
                    if (data?.error) errMsg = data.error;
                } catch {}
                toastRef.current?.show(errMsg, 'error');
            }
        } catch (err: any) {
            toastRef.current?.show(err?.message || 'REVEAL FAILED', 'error');
        }
    };

    const deleteProject = async (name: string) => {
        if (!window.confirm(`Delete project "${name}"? This action cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, {
                method: 'DELETE'
            });
            if (!res.ok) {
                let errMsg = `Delete failed (${res.status})`;
                try {
                    const data = await res.json();
                    if (data?.error) errMsg = data.error;
                } catch {}
                toastRef.current?.show(errMsg, 'error');
                return;
            }
            toastRef.current?.show(`DELETED ${name}`, 'info');
            await loadProjects();
        } catch (err: any) {
            toastRef.current?.show(err?.message || 'DELETE FAILED', 'error');
        }
    };

    const validateProjectName = (rawName: string): string | null => {
        const trimmed = rawName.trim();
        if (!trimmed) return 'Project name is required.';
        if (!/^[a-zA-Z0-9 \-_]+$/.test(trimmed)) {
            return 'Project name may only contain letters, numbers, spaces, hyphens, and underscores.';
        }
        return null;
    };

    const handleProceedStep1 = () => {
        const err = validateProjectName(newProjectData.name);
        if (err) {
            setWizardError(err);
            return;
        }
        setWizardError(null);
        setWizardStep(2);
    };

    const handleForgeProject = async () => {
        if (isCreating) return;
        const err = validateProjectName(newProjectData.name);
        if (err) {
            setWizardError(err);
            return;
        }

        setWizardError(null);
        setIsCreating(true);
        try {
            const payload: Record<string, any> = {
                name: newProjectData.name.trim(),
                author: newProjectData.author.trim() || username || 'Developer',
                engineType: newProjectData.blueprint,
                template: 'blank'
            };
            if (newProjectData.blueprint === 'unified-3d') {
                payload.mode = 'fps-3d';
            }

            const res = await fetch('/api/projects/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                let errMsg = `Failed to create project (${res.status})`;
                try {
                    const data = await res.json();
                    if (data?.error) errMsg = data.error;
                } catch {}
                setWizardError(errMsg);
                toastRef.current?.show(errMsg, 'error');
                return;
            }

            await loadProjects();
            toastRef.current?.show('PROJECT CREATED', 'success');
            setWizardStep(3);
        } catch (e: any) {
            const msg = e?.message || 'Network error creating project';
            setWizardError(msg);
            toastRef.current?.show(msg, 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const openExternalSafe = (url: string) => {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.openExternal) {
            electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const renderProjectGrid = () => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '25px', marginTop: '20px' }}>
            {/* New Project Card - Premium Style */}
            <div 
                className="project-card new-project" 
                onClick={() => {
                    setNewProjectData({ name: '', author: username, blueprint: 'rpg-topdown' });
                    setWizardError(null);
                    setWizardStep(1);
                    setActiveView('create');
                }}
                style={{ 
                    borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', 
                    opacity: 0.8, background: 'rgba(255, 0, 0, 0.02)',
                    borderColor: 'rgba(255, 0, 0, 0.3)'
                }}
            >
                <div className="plus-icon-container">
                    <Plus size={48} color="var(--accent)" />
                </div>
                <div style={{ fontSize: '18px', marginTop: '15px', letterSpacing: '2px', fontWeight: 'bold', color: 'var(--accent)' }}>FORGE NEW PROJECT</div>
            </div>

            {projects.map(p => (
                <div key={p.name} className="project-card premium" onClick={() => launchProject(p.name)}>
                    <div className="card-glow"></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', position: 'relative', zIndex: 2 }}>
                        <div className="engine-badge">
                             <Rocket size={14} color="var(--accent)" />
                             <span>{p.engineType?.toUpperCase() || 'RPG'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="tool-btn small" title="Reveal in Folder" onClick={(e) => { e.stopPropagation(); revealProject(p.name); }}><FolderOpen size={12} /></button>
                            <button className="tool-btn small danger" title="Delete Project" onClick={(e) => { e.stopPropagation(); deleteProject(p.name); }}><Trash2 size={12} /></button>
                        </div>
                    </div>
                    
                    <div className="project-info" style={{ position: 'relative', zIndex: 2, flexGrow: 1 }}>
                        <div className="project-title">{p.name.toUpperCase()}</div>
                        <div className="project-path">{p.path}</div>
                    </div>

                    <div className="project-meta" style={{ position: 'relative', zIndex: 2 }}>
                        <div className="meta-item">
                            <Clock size={12} />
                            <span>{p.lastModified && !isNaN(Date.parse(p.lastModified)) ? new Date(p.lastModified).toLocaleDateString() : '—'}</span>
                        </div>
                        <div className="launch-tag">READY TO FORGE</div>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gridTemplateRows: '40px 1fr', height: '100vh', background: 'var(--bg-root)' }}>
            <Toast ref={toastRef} />
            <Background enabled={!perfMode} />

            {/* HEADER */}
            <header style={{ gridArea: '1 / 1 / 2 / 3', background: 'rgba(0,0,0,0.8)', borderBottom: '1px solid #1f2b42', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', zIndex: 10 }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ borderRight: '1px solid var(--accent)', paddingRight: '10px' }}>REDGLITCH ENGINE</div>
                    <span style={{ fontSize: '14px', color: '#555', fontWeight: 'normal' }}>v7.0 CORE STUDIO</span>
                </div>
                <div style={{ display: 'flex', gap: '20px', fontSize: '16px', color: '#666' }}>
                    <span><Cpu size={14} style={{ marginRight: '4px' }} /> {stats.cpu}%</span>
                    <span><HardDrive size={14} style={{ marginRight: '4px' }} /> {stats.mem}MB</span>
                    <span><Clock size={14} style={{ marginRight: '4px' }} /> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </header>

            {/* SIDEBAR */}
            <aside style={{ gridArea: '2 / 1 / 3 / 2', background: 'rgba(8, 12, 24, 0.95)', borderRight: '1px solid #1f2b42', padding: '15px 0', zIndex: 10 }}>
                <div style={{ padding: '0 15px 10px', fontSize: '12px', color: '#444', textTransform: 'uppercase' }}>Navigation</div>
                {[
                    { id: 'projects', label: 'Projects', icon: Layout },
                    { id: 'assets', label: 'Assets', icon: ShoppingBag },
                    { id: 'marketplace', label: 'Marketplace', icon: Rocket },
                    { id: 'tutorials', label: 'Tutorials', icon: GraduationCap },
                    { id: 'community', label: 'Community', icon: Users },
                    { id: 'settings', label: 'Settings', icon: Settings },
                ].map(item => (
                    <div 
                        key={item.id}
                        onClick={() => setActiveView(item.id)}
                        style={{
                            padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                            color: activeView === item.id ? 'var(--accent)' : '#888',
                            background: activeView === item.id ? 'rgba(255, 0, 0, 0.05)' : 'transparent',
                            borderLeft: `2px solid ${activeView === item.id ? 'var(--accent)' : 'transparent'}`,
                            transition: 'all 0.1s'
                        }}
                    >
                        <item.icon size={18} /> {item.label}
                    </div>
                ))}
                <div style={{ marginTop: 'auto', padding: '20px', fontSize: '11px', color: '#333', textAlign: 'center' }}>
                    LOGGED AS: {username.toUpperCase()}
                </div>
            </aside>

            {/* CONTENT */}
            <main style={{ gridArea: '2 / 2 / 3 / 3', padding: '30px', overflowY: 'auto', background: 'rgba(5, 5, 8, 0.4)' }}>
                {activeView === 'projects' && (
                    <div className="view-section active">
                        <h1 style={{ borderBottom: '1px solid #1f2b42', paddingBottom: '10px', color: '#fff', fontSize: '24px' }}>PROJECT EXPLORER</h1>
                        {renderProjectGrid()}
                    </div>
                )}

                {activeView === 'assets' && (
                    <div className="view-section active">
                        <h1 style={{ borderBottom: '1px solid #1f2b42', paddingBottom: '10px', color: '#fff', fontSize: '24px' }}>ASSET LIBRARY</h1>
                        <div style={{ maxWidth: '900px', margin: '20px auto', textAlign: 'center', background: 'rgba(10, 14, 20, 0.95)', border: '1px solid #1f2b42', padding: '40px' }}>
                            <ShoppingBag size={64} color="var(--accent)" style={{ marginBottom: '20px' }} />
                            <h2 style={{ color: 'var(--accent)', marginBottom: '15px' }}>GLOBAL ASSET MANAGER</h2>
                            <p style={{ color: '#888', marginBottom: '30px' }}>Access and synchronize your shared engine assets.</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                                <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid #1f2b42', padding: '20px' }}>
                                    <ImageIcon size={32} color="var(--accent)" />
                                    <div style={{ color: '#fff', marginTop: '10px' }}>SPRITES</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid #1f2b42', padding: '20px' }}>
                                    <Rocket size={32} color="#2ecc71" />
                                    <div style={{ color: '#fff', marginTop: '10px' }}>AUDIO</div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid #1f2b42', padding: '20px' }}>
                                    <Layout size={32} color="#3498db" />
                                    <div style={{ color: '#fff', marginTop: '10px' }}>SCENES</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeView === 'marketplace' && (
                    <div className="view-section active">
                        <h1 style={{ borderBottom: '1px solid #1f2b42', paddingBottom: '10px', color: '#fff', fontSize: '24px' }}>MARKETPLACE</h1>
                        <div style={{ maxWidth: '800px', margin: '20px auto', textAlign: 'center', background: 'rgba(10, 14, 20, 0.95)', border: '1px solid #1f2b42', padding: '40px' }}>
                            <ShoppingBag size={64} color="var(--accent)" style={{ marginBottom: '20px' }} />
                            <h2 style={{ color: 'var(--accent)', marginBottom: '15px' }}>EXTENSIONS & ASSETS</h2>
                            <p style={{ color: '#888' }}>Marketplace integration coming in v7.1</p>
                        </div>
                    </div>
                )}

                {activeView === 'community' && (
                    <div className="view-section active">
                        <h1 style={{ borderBottom: '1px solid #1f2b42', paddingBottom: '10px', color: '#fff', fontSize: '24px' }}>COMMUNITY & DOCS</h1>
                        <div style={{ maxWidth: '800px', margin: '20px auto', background: 'rgba(10, 14, 20, 0.95)', border: '1px solid #1f2b42', padding: '30px' }}>
                            <h2 style={{ color: 'var(--accent)', marginTop: 0 }}>RESOURCES & SOURCE</h2>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '20px' }}>
                                <button className="tool-btn" style={{ padding: '15px', width: '100%' }} onClick={() => window.open('../docs.html', '_blank', 'noopener,noreferrer')}>DOCUMENTATION</button>
                                <button className="tool-btn" style={{ padding: '15px', width: '100%' }} onClick={() => openExternalSafe('https://github.com/canmertdogan/redglitch-engine')}>GITHUB REPO</button>
                                <button className="tool-btn" style={{ padding: '15px', width: '100%' }} onClick={() => window.open('../credits.html', '_blank', 'noopener,noreferrer')}>ENGINE CREDITS</button>
                                <button className="tool-btn" style={{ padding: '15px', width: '100%' }} onClick={() => window.open('../launcher.html', '_blank', 'noopener,noreferrer')}>GAME LAUNCHER</button>
                            </div>
                        </div>
                    </div>
                )}

                {activeView === 'create' && (
                    <div className="view-section active">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', borderBottom: '1px solid #1f2b42', paddingBottom: '15px', marginBottom: '30px' }}>
                            <h1 style={{ color: '#fff', fontSize: '24px', margin: 0 }}>FORGE PROJECT</h1>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {[1, 2, 3].map(s => (
                                    <div key={s} style={{ 
                                        width: '24px', height: '24px', borderRadius: '50%', background: wizardStep >= s ? 'var(--accent)' : '#111',
                                        color: wizardStep >= s ? '#000' : '#444', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '12px', fontWeight: 'bold'
                                    }}>{s}</div>
                                ))}
                            </div>
                        </div>

                        <div style={{ maxWidth: '800px', margin: '0 auto', background: 'rgba(10, 14, 20, 0.95)', border: '1px solid #1f2b42', padding: '40px', borderRadius: '4px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                             {wizardError && (
                                <div style={{ background: 'rgba(231, 76, 60, 0.12)', border: '1px solid #e74c3c', color: '#ff8f95', padding: '10px 14px', marginBottom: '20px', fontSize: '14px' }}>
                                    {wizardError}
                                </div>
                             )}

                             {wizardStep === 1 && (
                                <div className="wizard-step">
                                    <h2 style={{ color: 'var(--accent)', marginTop: 0, letterSpacing: '1px' }}>PROJECT IDENTITY</h2>
                                    <p style={{ color: '#666', marginBottom: '30px' }}>Specify the internal registry name and primary author for this project.</p>
                                    <div style={{ marginBottom: '25px' }}>
                                        <label>PROJECT NAME</label>
                                        <input 
                                            type="text" 
                                            placeholder="MY_NEW_WORLD" 
                                            value={newProjectData.name}
                                            onChange={(e) => { setWizardError(null); setNewProjectData({...newProjectData, name: e.target.value}); }}
                                            style={{ fontSize: '24px', padding: '15px' }} 
                                        />
                                    </div>
                                    <div style={{ marginBottom: '40px' }}>
                                        <label>PRIMARY AUTHOR</label>
                                        <input 
                                            type="text" 
                                            placeholder="NAME_OR_STUDIO_ID" 
                                            value={newProjectData.author}
                                            onChange={(e) => setNewProjectData({...newProjectData, author: e.target.value})}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
                                        <button className="tool-btn" onClick={() => setActiveView('projects')} style={{ padding: '10px 30px' }}>ABORT</button>
                                        <button className="tool-btn primary" onClick={handleProceedStep1} style={{ padding: '10px 50px' }}>PROCEED</button>
                                    </div>
                                </div>
                             )}

                             {wizardStep === 2 && (
                                <div className="wizard-step">
                                    <h2 style={{ color: 'var(--accent)', marginTop: 0 }}>SELECT ENGINE CORE</h2>
                                    <p style={{ color: '#666', marginBottom: '30px' }}>Choose the foundational architecture for your game logic.</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                                        {BLUEPRINTS.map(b => (
                                            <div 
                                                key={b.id}
                                                className={`project-card premium ${newProjectData.blueprint === b.id ? 'active' : ''}`}
                                                onClick={() => setNewProjectData({...newProjectData, blueprint: b.id})}
                                                style={{ textAlign: 'center', height: '160px', borderColor: newProjectData.blueprint === b.id ? 'var(--accent)' : '#222' }}
                                            >
                                                <b.icon size={32} color={newProjectData.blueprint === b.id ? 'var(--accent)' : '#444'} style={{ margin: '0 auto 15px' }} />
                                                <div style={{ fontSize: '16px', fontWeight: 'bold', color: newProjectData.blueprint === b.id ? '#fff' : '#666' }}>{b.name}</div>
                                                <div style={{ fontSize: '11px', color: '#666', marginTop: '10px' }}>{b.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
                                        <button className="tool-btn" onClick={() => setWizardStep(1)} disabled={isCreating} style={{ padding: '10px 30px' }}>BACK</button>
                                        <button className="tool-btn primary" onClick={handleForgeProject} disabled={isCreating} style={{ padding: '10px 50px' }}>
                                            {isCreating ? 'FORGING...' : 'FORGE PROJECT'}
                                        </button>
                                    </div>
                                </div>
                             )}

                             {wizardStep === 3 && (
                                <div className="wizard-step" style={{ textAlign: 'center' }}>
                                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                        <CheckCircle2 size={48} />
                                    </div>
                                    <h2 style={{ color: '#fff' }}>FORGING COMPLETE</h2>
                                    <p style={{ color: '#666' }}>Project <b>{newProjectData.name.trim().toUpperCase()}</b> has been registered to the engine core.</p>
                                    <button className="tool-btn primary" onClick={() => { setWizardStep(1); setWizardError(null); setActiveView('projects'); }} style={{ marginTop: '40px', padding: '15px 60px', width: 'auto' }}>ENTER PROJECT EXPLORER</button>
                                </div>
                             )}
                        </div>
                    </div>
                )}

                {activeView === 'settings' && (
                    <div className="view-section active">
                        <h1 style={{ borderBottom: '1px solid #1f2b42', paddingBottom: '10px', color: '#fff', fontSize: '24px' }}>STUDIO SETTINGS</h1>
                        <div style={{ maxWidth: '600px', margin: '20px auto', background: 'rgba(10, 14, 20, 0.95)', border: '1px solid #1f2b42', padding: '30px' }}>
                            <div style={{ marginBottom: '25px' }}>
                                <label>Developer Name</label>
                                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '20px', border: '1px solid #222' }}>
                                <div>
                                    <div style={{ color: '#fff', fontSize: '1.1rem' }}>Performance Mode</div>
                                    <div style={{ color: '#666', fontSize: '0.9rem' }}>Disable Blackhole WebGL Background</div>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={perfMode} 
                                    onChange={(e) => {
                                        setPerfMode(e.target.checked);
                                        localStorage.setItem('redglitch_perf_mode', String(e.target.checked));
                                    }}
                                    style={{ width: '40px', height: '20px' }}
                                />
                            </div>
                            <button className="tool-btn" style={{ width: '100%', marginTop: '30px', padding: '10px' }} onClick={() => {
                                localStorage.setItem('redglitch_username', username);
                                toastRef.current?.show('SETTINGS SAVED', 'success');
                            }}>SAVE CONFIGURATION</button>
                        </div>
                    </div>
                )}

                {activeView === 'tutorials' && (
                    <div className="view-section active">
                        <h1 style={{ borderBottom: '1px solid #1f2b42', paddingBottom: '10px', color: '#fff', fontSize: '24px' }}>TUTORIALS</h1>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginTop: '20px' }}>
                            <div className="project-card" onClick={() => window.open('../docs.html', '_blank', 'noopener,noreferrer')}>
                                <GraduationCap size={32} color="var(--accent)" />
                                <div style={{ fontSize: '20px', fontWeight: 'bold', margin: '10px 0' }}>GETTING STARTED</div>
                                <div style={{ color: '#666' }}>Open the studio manual and engine reference.</div>
                            </div>
                            <div className="project-card" onClick={() => { setNewProjectData({ name: '', author: username, blueprint: 'rpg-topdown' }); setWizardError(null); setWizardStep(1); setActiveView('create'); }}>
                                <GraduationCap size={32} color="#2ecc71" />
                                <div style={{ fontSize: '20px', fontWeight: 'bold', margin: '10px 0' }}>FORGE FIRST WORLD</div>
                                <div style={{ color: '#666' }}>Launch the project creation wizard now.</div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
            <style>{`
                .project-card {
                    background: rgba(10, 14, 20, 0.9);
                    border: 1px solid #1f2b42;
                    padding: 25px;
                    display: flex;
                    flex-direction: column;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    height: 200px;
                }

                .project-card.premium:hover {
                    border-color: var(--accent);
                    background: rgba(20, 26, 40, 0.95);
                    transform: translateY(-5px) scale(1.02);
                    box-shadow: 0 15px 40px rgba(0,0,0,0.8), 0 0 20px rgba(255, 0, 0, 0.1);
                }

                .project-card.premium.active {
                    border-color: var(--accent);
                    background: rgba(255, 0, 0, 0.05);
                }

                .project-card.premium:hover .card-glow {
                    opacity: 1;
                }

                .card-glow {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: radial-gradient(circle at top right, rgba(255, 0, 0, 0.1), transparent 70%);
                    opacity: 0;
                    transition: opacity 0.3s;
                    pointer-events: none;
                }

                .engine-badge {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(0,0,0,0.5);
                    padding: 4px 10px;
                    border-radius: 20px;
                    border: 1px solid #222;
                    font-size: 11px;
                    color: #888;
                }

                .project-title {
                    font-size: 24px;
                    font-weight: 800;
                    color: #fff;
                    letter-spacing: 1px;
                    margin-bottom: 5px;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.5);
                }

                .project-path {
                    font-size: 12px;
                    color: #444;
                    font-family: monospace;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .project-meta {
                    margin-top: auto;
                    padding-top: 15px;
                    border-top: 1px solid rgba(255,255,255,0.03);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #555;
                    font-size: 13px;
                }

                .launch-tag {
                    font-size: 10px;
                    color: var(--accent);
                    opacity: 0.6;
                    letter-spacing: 1px;
                    font-weight: bold;
                }

                .plus-icon-container {
                    transition: transform 0.3s;
                }

                .project-card.new-project:hover .plus-icon-container {
                    transform: rotate(90deg) scale(1.1);
                }

                .view-section { animation: fadeIn 0.3s ease-out; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
                
                .tool-btn.small { width: 24px; height: 24px; font-size: 10px; }
                .tool-btn.primary { background: var(--accent); color: #000; border-color: var(--accent); font-weight: bold; letter-spacing: 1px; }
                .tool-btn.primary:hover { background: #fff; border-color: #fff; }
                .tool-btn.danger:hover { background: #c0392b; border-color: #c0392b; color: #fff; }

                input[type="text"], input[type="number"], select, textarea {
                    width: 100%;
                    background: rgba(0,0,0,0.5);
                    border: 1px solid #222;
                    color: #fff;
                    padding: 12px 15px;
                    font-family: inherit;
                    outline: none;
                    transition: all 0.2s;
                }
                input:focus { border-color: var(--accent); background: rgba(255, 0, 0, 0.05); }
                label { display: block; color: #555; margin-bottom: 8px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; }
                
                .wizard-step { animation: slideIn 0.3s ease-out; }
                @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
            `}</style>
        </div>
    );
};

export default Dashboard;
