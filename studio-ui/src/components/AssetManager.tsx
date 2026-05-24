import React, { useState, useEffect, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Image as ImageIcon, Music, Database, FileCode, Folder, Search, 
    Upload, Download, Trash2, RefreshCw, Filter, List, Grid as GridIcon,
    Info, HardDrive, CheckCircle2, AlertCircle
} from 'lucide-react';
import Sidebar from './shared/Sidebar';

interface Asset {
    id: string;
    name: string;
    path: string;
    type: 'image' | 'audio' | 'data' | 'shader' | 'script';
    metadata: {
        ext: string;
        size?: number;
        source: 'engine' | 'project';
    };
}

const AssetManager: React.FC = () => {
    const { isReady } = useStudio();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [indexing, setIndexing] = useState(false);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

    useEffect(() => {
        if (isReady) {
            loadAssets();
        }
    }, [isReady]);

    const loadAssets = async () => {
        try {
            const res = await fetch('/api/assets');
            if (res.ok) setAssets(await res.json());
        } catch (e) {
            console.error("Failed to load assets", e);
        }
    };

    const rebuildRegistry = async () => {
        setIndexing(true);
        try {
            const res = await fetch('/api/assets/rebuild', { method: 'POST' });
            if (res.ok) loadAssets();
        } catch (e) {}
        setIndexing(false);
    };

    const filteredAssets = useMemo(() => {
        return assets.filter(a => {
            const matchesCat = activeCategory === 'all' || a.type === activeCategory;
            const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 a.id.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [assets, activeCategory, searchQuery]);

    const categories = [
        { id: 'all', label: 'All Assets', icon: HardDrive },
        { id: 'image', label: 'Images', icon: ImageIcon },
        { id: 'audio', label: 'Audio', icon: Music },
        { id: 'data', label: 'Data', icon: Database },
        { id: 'shader', label: 'Shaders', icon: Zap },
        { id: 'script', label: 'Scripts', icon: FileCode },
    ];

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>MOUNTING FILESYSTEM...</div>;

    const selectedAsset = assets.find(a => a.id === selectedAssetId);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050505' }}>
            {/* MENUBAR */}
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <Folder size={16} style={{ marginRight: '8px', display: 'inline' }} /> ASSET MANAGER v2.0
                </div>
            </div>

            {/* TOOLBAR */}
            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '10px' }}>
                <div style={{ display: 'flex', flexGrow: 1, position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#444' }} />
                    <input 
                        type="text" 
                        placeholder="Search project assets..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '35px', background: '#080808' }}
                    />
                </div>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={rebuildRegistry} title="Rebuild Index">
                    <RefreshCw size={16} className={indexing ? 'spin' : ''} />
                </button>
                <button className="tool-btn"><Upload size={16} /></button>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                {/* SIDEBAR: CATEGORIES */}
                <div className="panel" style={{ width: '220px' }}>
                    <div className="panel-header">CATEGORIES</div>
                    <div className="panel-content">
                        {categories.map(cat => (
                            <div 
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                style={{
                                    padding: '10px 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px',
                                    color: activeCategory === cat.id ? 'var(--accent)' : '#888',
                                    background: activeCategory === cat.id ? 'rgba(241, 196, 15, 0.05)' : 'transparent',
                                    borderLeft: activeCategory === cat.id ? '3px solid var(--accent)' : '3px solid transparent',
                                    borderBottom: '1px solid #111'
                                }}
                            >
                                <cat.icon size={16} />
                                {cat.label}
                                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.5 }}>
                                    {assets.filter(a => cat.id === 'all' || a.type === cat.id).length}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* GRID: ASSETS */}
                <div style={{ 
                    flexGrow: 1, padding: '20px', overflowY: 'auto', 
                    background: 'var(--bg-canvas)',
                    backgroundImage: 'radial-gradient(#222 1px, transparent 1px)',
                    backgroundSize: '25px 25px'
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '15px' }}>
                        {filteredAssets.map(asset => (
                            <div 
                                key={asset.id}
                                onClick={() => setSelectedAssetId(asset.id)}
                                style={{
                                    background: '#0a0a0f', border: `1px solid ${selectedAssetId === asset.id ? 'var(--accent)' : '#222'}`,
                                    padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                                    cursor: 'pointer', transition: 'all 0.1s', position: 'relative',
                                    boxShadow: selectedAssetId === asset.id ? '0 0 15px rgba(241, 196, 15, 0.2)' : 'none'
                                }}
                            >
                                <div style={{ 
                                    width: '64px', height: '64px', background: '#000', border: '1px solid #111',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                                }}>
                                    {asset.type === 'image' ? (
                                        <img src={asset.path} style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }} />
                                    ) : (
                                        asset.type === 'audio' ? <Music size={32} color="#2ecc71" /> : <Database size={32} color="#3498db" />
                                    )}
                                </div>
                                <div style={{ 
                                    fontSize: '0.8rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', 
                                    whiteSpace: 'nowrap', width: '100%', color: selectedAssetId === asset.id ? '#fff' : '#666' 
                                }}>
                                    {asset.name}
                                </div>
                                {asset.metadata.source === 'engine' && (
                                    <div style={{ position: 'absolute', top: '5px', right: '5px', fontSize: '0.6rem', background: '#333', color: '#fff', padding: '1px 4px', borderRadius: '2px' }}>CORE</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* INSPECTOR */}
                <div className="panel" style={{ width: '300px', borderLeft: '1px solid #1f2b42', borderRight: 'none' }}>
                    <div className="panel-header"><Info size={14} /> INSPECTOR</div>
                    <div className="panel-content">
                        {selectedAsset ? (
                            <div style={{ padding: '15px' }}>
                                <div style={{ 
                                    width: '100%', aspectRatio: '1', background: '#000', border: '1px solid #222', 
                                    marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                }}>
                                    {selectedAsset.type === 'image' ? (
                                        <img src={selectedAsset.path} style={{ maxWidth: '90%', maxHeight: '90%', imageRendering: 'pixelated' }} />
                                    ) : (
                                        selectedAsset.type === 'audio' ? <Music size={64} color="#2ecc71" /> : <Database size={64} color="#3498db" />
                                    )}
                                </div>
                                
                                <label>Asset ID</label>
                                <input type="text" value={selectedAsset.id} readOnly style={{ marginBottom: '15px', opacity: 0.7 }} />
                                
                                <label>Full Path</label>
                                <div style={{ fontSize: '0.8rem', color: '#555', wordBreak: 'break-all', fontFamily: 'monospace', background: '#000', padding: '8px', border: '1px solid #111', marginBottom: '15px' }}>
                                    {selectedAsset.path}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>
                                    <button className="tool-btn" style={{ width: '100%' }}><Download size={14} /></button>
                                    <button className="tool-btn" style={{ width: '100%', color: '#e74c3c' }}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#333', marginTop: '40px' }}>SELECT AN ASSET TO VIEW DETAILS</div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default AssetManager;
