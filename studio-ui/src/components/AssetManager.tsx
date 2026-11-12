import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Image as ImageIcon, Music, Database, FileCode, Folder, Search, 
    Upload, Download, Trash2, RefreshCw, Filter, List, Grid as GridIcon,
    Info, HardDrive, CheckCircle2, AlertCircle, Zap
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import Toast, { ToastHandle } from './shared/Toast';

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

const normalizeAssetUrl = (p?: string): string => {
    if (!p) return '';
    return p.startsWith('/') || p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')
        ? p
        : '/' + p;
};

const detectUploadType = (file: File): Asset['type'] => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (['wav', 'mp3', 'ogg', 'flac', 'm4a'].includes(ext)) return 'audio';
    if (['frag', 'vert', 'glsl'].includes(ext)) return 'shader';
    if (['js', 'ts'].includes(ext)) return 'script';
    return 'data';
};

const AssetManager: React.FC = () => {
    const { isReady, subscribe } = useStudio();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [indexing, setIndexing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const toastRef = useRef<ToastHandle>(null);

    useEffect(() => {
        if (isReady) {
            loadAssets();
        }
    }, [isReady]);

    useEffect(() => {
        const unsub = subscribe('project:switched', () => {
            loadAssets();
        });
        return () => {
            unsub();
        };
    }, [subscribe]);

    const loadAssets = async () => {
        try {
            const res = await fetch('/api/assets');
            if (res.ok) {
                const data = await res.json();
                // /api/assets returns { assets: [...], updated, project }
                const list = Array.isArray(data) ? data : Array.isArray(data?.assets) ? data.assets : [];
                setAssets(list);
            }
        } catch (e) {
            console.error("Failed to load assets", e);
            toastRef.current?.show('FAILED TO LOAD ASSETS', 'error');
        }
    };

    const rebuildRegistry = async () => {
        setIndexing(true);
        try {
            const res = await fetch('/api/assets/rebuild', { method: 'POST' });
            if (res.ok) {
                await loadAssets();
                toastRef.current?.show('ASSET INDEX REBUILT', 'success');
            } else {
                toastRef.current?.show('REBUILD FAILED', 'error');
            }
        } catch (err) {
            console.warn("[studio-ui] swallowed error", err);
            toastRef.current?.show('REBUILD FAILED', 'error');
        }
        setIndexing(false);
    };

    const handleExportManifest = async () => {
        try {
            const res = await fetch('/api/assets/export', { method: 'POST' });
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'assets-export.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toastRef.current?.show('MANIFEST EXPORTED', 'success');
        } catch (err) {
            console.error('Export manifest error', err);
            toastRef.current?.show('EXPORT FAILED', 'error');
        }
    };

    const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;

        setUploading(true);
        let uploadedCount = 0;
        try {
            for (const file of files) {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ''));
                    reader.onerror = () => reject(reader.error || new Error('Read failed'));
                    reader.readAsDataURL(file);
                });
                const res = await fetch('/api/assets/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: file.name,
                        data: dataUrl,
                        type: detectUploadType(file),
                    }),
                });
                if (!res.ok) {
                    let errMsg = file.name;
                    try {
                        const errJson = await res.json();
                        if (errJson?.error) errMsg = errJson.error;
                    } catch {
                        const errText = await res.text().catch(() => '');
                        if (errText) errMsg = errText;
                    }
                    toastRef.current?.show(`UPLOAD FAILED: ${errMsg}`, 'error');
                } else {
                    uploadedCount++;
                }
            }
            if (uploadedCount > 0) {
                await loadAssets();
                toastRef.current?.show(`IMPORTED ${uploadedCount} ASSET(S)`, 'success');
            }
        } catch (err) {
            console.error('Upload error', err);
            toastRef.current?.show('ASSET UPLOAD FAILED', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleDownloadAsset = () => {
        if (!selectedAsset) return;
        const url = normalizeAssetUrl(selectedAsset.path);
        const link = document.createElement('a');
        link.href = url;
        link.download = selectedAsset.name || 'asset';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDeleteAsset = async () => {
        if (!selectedAsset) return;
        const isCoreAsset = selectedAsset.metadata?.source === 'engine' ||
            selectedAsset.path.startsWith('/engine/') ||
            selectedAsset.path.startsWith('engine/') ||
            selectedAsset.id.startsWith('engine/');
        if (isCoreAsset) {
            toastRef.current?.show('ENGINE CORE ASSETS CANNOT BE DELETED', 'error');
            return;
        }
        if (!confirm(`Delete asset "${selectedAsset.name}"?`)) return;
        try {
            const targetPath = (selectedAsset.id || selectedAsset.path).replace(/^\/+/, '');
            const res = await fetch('/api/ide/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: targetPath }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toastRef.current?.show(err.error || 'DELETE FAILED', 'error');
                return;
            }
            await fetch('/api/assets/rebuild', { method: 'POST' });
            setSelectedAssetId(null);
            await loadAssets();
            toastRef.current?.show('ASSET DELETED', 'success');
        } catch (err) {
            console.error('Delete error', err);
            toastRef.current?.show('DELETE FAILED', 'error');
        }
    };

    const renderAssetIcon = (asset: Asset, size = 32) => {
        if (asset.type === 'image') {
            return (
                <img
                    loading="lazy"
                    decoding="async"
                    src={normalizeAssetUrl(asset.path)}
                    alt={asset.name}
                    style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
                    onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                />
            );
        }
        if (asset.type === 'audio') return <Music size={size} color="#2ecc71" />;
        if (asset.type === 'shader') return <Zap size={size} color="#f39c12" />;
        if (asset.type === 'script') return <FileCode size={size} color="#a29bfe" />;
        return <Database size={size} color="#3498db" />;
    };

    const filteredAssets = useMemo(() => {
        return assets.filter(a => {
            const matchesCat = activeCategory === 'all' || a.type === activeCategory;
            const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 a.id.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });
    }, [assets, activeCategory, searchQuery]);

    // Progressive rendering: mounting 1,700+ <img> at once freezes the UI.
    const PAGE_SIZE = 150;
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activeCategory, searchQuery, assets]);

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
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleUploadFiles}
                    style={{ display: 'none' }}
                />
                <button
                    className="tool-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Import Asset"
                >
                    <Upload size={16} />
                </button>
                <button
                    className="tool-btn"
                    onClick={handleExportManifest}
                    title="Export Manifest"
                >
                    <Download size={16} />
                </button>
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
                                    background: activeCategory === cat.id ? 'rgba(255, 0, 0, 0.05)' : 'transparent',
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
                <div
                    onScroll={(e) => {
                        const el = e.currentTarget;
                        if (el.scrollTop + el.clientHeight > el.scrollHeight - 400) {
                            setVisibleCount(c => (c < filteredAssets.length ? c + PAGE_SIZE : c));
                        }
                    }}
                    style={{ 
                    flexGrow: 1, padding: '20px', overflowY: 'auto', 
                    background: 'var(--bg-deep)',
                    backgroundImage: 'radial-gradient(#222 1px, transparent 1px)',
                    backgroundSize: '25px 25px'
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '15px' }}>
                        {filteredAssets.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666', gridColumn: '1 / -1' }}>
                                <Folder size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                                <div style={{ fontSize: '1.1rem', color: '#aaa', marginBottom: '8px' }}>
                                    {searchQuery ? `NO ASSETS MATCHING "${searchQuery}"` : activeCategory !== 'all' ? `NO ${activeCategory.toUpperCase()} ASSETS FOUND` : 'NO ASSETS IN PROJECT'}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: '16px' }}>
                                    Import files or drag them directly into the asset repository.
                                </div>
                                <button
                                    className="tool-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 16px', background: '#111', border: '1px solid #333', color: '#fff', cursor: 'pointer' }}
                                >
                                    <Upload size={14} style={{ marginRight: '6px' }} /> IMPORT ASSET
                                </button>
                            </div>
                        ) : (
                            filteredAssets.slice(0, visibleCount).map(asset => (
                                <div 
                                    key={asset.id}
                                    onClick={() => setSelectedAssetId(asset.id)}
                                    style={{
                                        background: '#0a0a0f', border: `1px solid ${selectedAssetId === asset.id ? 'var(--accent)' : '#222'}`,
                                        padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
                                        cursor: 'pointer', position: 'relative', contentVisibility: 'auto', containIntrinsicSize: '120px 120px',
                                        boxShadow: selectedAssetId === asset.id ? '0 0 15px rgba(255, 0, 0, 0.2)' : 'none'
                                    }}
                                >
                                    <div style={{ 
                                        width: '64px', height: '64px', background: '#000', border: '1px solid #111',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                                    }}>
                                        {renderAssetIcon(asset, 32)}
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
                            ))
                        )}
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
                                    {renderAssetIcon(selectedAsset, 64)}
                                </div>
                                
                                <label>Asset ID</label>
                                <input type="text" value={selectedAsset.id} readOnly style={{ marginBottom: '15px', opacity: 0.7 }} />
                                
                                <label>Full Path</label>
                                <div style={{ fontSize: '0.8rem', color: '#555', wordBreak: 'break-all', fontFamily: 'monospace', background: '#000', padding: '8px', border: '1px solid #111', marginBottom: '15px' }}>
                                    {selectedAsset.path}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>
                                    <button className="tool-btn" onClick={handleDownloadAsset} title="Download Asset" style={{ width: '100%' }}><Download size={14} /></button>
                                    <button
                                        className="tool-btn"
                                        onClick={handleDeleteAsset}
                                        disabled={selectedAsset.metadata?.source === 'engine'}
                                        title={selectedAsset.metadata?.source === 'engine' ? 'Core engine asset (read-only)' : 'Delete Asset'}
                                        style={{ width: '100%', color: '#e74c3c', opacity: selectedAsset.metadata?.source === 'engine' ? 0.4 : 1 }}
                                    ><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#333', marginTop: '40px' }}>SELECT AN ASSET TO VIEW DETAILS</div>
                        )}
                    </div>
                </div>
            </div>

            <Toast ref={toastRef} />
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default AssetManager;
