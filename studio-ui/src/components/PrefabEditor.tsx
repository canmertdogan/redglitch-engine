import React, { useState, useEffect, useRef } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Box, Layers, Settings, Save, Plus, Trash2, ChevronRight, 
    ChevronDown, Cubes, Activity, Cpu, MousePointer2 
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';

interface Component {
    type: string;
    [key: string]: any;
}

interface Prefab {
    id: string;
    name: string;
    sprite: string;
    components: Component[];
}

const PrefabEditor: React.FC = () => {
    const { isReady, sprites } = useStudio();
    const [prefabs, setPrefabs] = useState<Prefab[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedCompIdx, setSelectedCompIdx] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (isReady) {
            loadPrefabs();
        }
    }, [isReady]);

    useEffect(() => {
        renderPreview();
    }, [prefabs, currentIndex, sprites]);

    const loadPrefabs = async () => {
        try {
            const res = await fetch('/api/assets?type=prefab');
            if (res.ok) {
                const data = await res.json();
                setPrefabs(data.length > 0 ? data : [getDefaultPrefab()]);
            }
        } catch (e) {
            setPrefabs([getDefaultPrefab()]);
        }
    };

    const getDefaultPrefab = (): Prefab => ({
        id: 'prefab_' + Date.now(),
        name: 'New_Entity',
        sprite: 'player',
        components: [
            { type: 'Transform', x: 0, y: 0, scale: 3 },
            { type: 'Physics', mass: 1, dynamic: true }
        ]
    });

    const updateCurrentPrefab = (field: string, value: any) => {
        const newPrefabs = [...prefabs];
        const prefab = { ...newPrefabs[currentIndex] };
        
        const keys = field.split('.');
        let current: any = prefab;
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = { ...current[keys[i]] };
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        
        newPrefabs[currentIndex] = prefab;
        setPrefabs(newPrefabs);
    };

    const addComponent = (type: string) => {
        const newComps = [...prefabs[currentIndex].components, { type, enabled: true }];
        updateCurrentPrefab('components', newComps);
        setSelectedCompIdx(newComps.length - 1);
    };

    const renderPreview = () => {
        const canvas = canvasRef.current;
        if (!canvas || !sprites) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const prefab = prefabs[currentIndex];
        if (!prefab) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw Grid
        ctx.strokeStyle = '#222';
        ctx.beginPath();
        for(let i=0; i<=canvas.width; i+=40) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
        for(let i=0; i<=canvas.height; i+=40) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); }
        ctx.stroke();

        const sprite = sprites[prefab.sprite];
        if (sprite) {
            const transform = prefab.components.find(c => c.type === 'Transform') || { x:0, y:0, scale: 4 };
            const scale = transform.scale || 4;
            const offsetX = canvas.width / 2 - (sprite.width * scale) / 2 + (transform.x || 0);
            const offsetY = canvas.height / 2 - (sprite.height * scale) / 2 + (transform.y || 0);

            sprite.data.forEach((row: string, y: number) => {
                for (let x = 0; x < row.length; x++) {
                    const color = sprite.palette[row[x]];
                    if (color) {
                        ctx.fillStyle = color;
                        ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
                    }
                }
            });
        }
    };

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>BOOTING CONSTRUCTOR...</div>;

    const currentPrefab = prefabs[currentIndex] || getDefaultPrefab();
    const currentComp = currentPrefab.components[selectedCompIdx];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <Box size={16} style={{ marginRight: '8px', display: 'inline' }} /> PREFAB BUILDER v2.0
                </div>
            </div>

            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" title="Save"><Save size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => setPrefabs([...prefabs, getDefaultPrefab()])} title="New Prefab"><Plus size={16} /></button>
                <button className="tool-btn" style={{ color: '#e74c3c' }} title="Delete"><Trash2 size={16} /></button>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                <Sidebar 
                    title="PREFABS" 
                    items={prefabs} 
                    currentIndex={currentIndex} 
                    onSelect={setCurrentIndex}
                    renderItem={(p, active) => (
                        <div style={{
                            padding: '10px', cursor: 'pointer', borderBottom: '1px solid #1a1a1a',
                            color: active ? 'var(--accent)' : '#888',
                            background: active ? 'rgba(241, 196, 15, 0.05)' : 'transparent',
                            borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent'
                        }}>
                            {p.name || 'Unnamed Prefab'}
                        </div>
                    )}
                />

                {/* VIEWPORT */}
                <div style={{ flexGrow: 1, background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <canvas ref={canvasRef} width={600} height={600} style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />
                    <div style={{ position: 'absolute', bottom: '20px', left: '20px', color: '#444', fontSize: '0.8rem' }}>
                        VIEWPORT: PIXEL-PERFECT PREVIEW
                    </div>
                </div>

                {/* INSPECTOR & HIERARCHY */}
                <div className="panel" style={{ width: '320px', borderLeft: '1px solid #1f2b42', borderRight: 'none' }}>
                    <div className="panel-header"><Layers size={14} /> HIERARCHY</div>
                    <div className="panel-content" style={{ padding: 0, flexGrow: 0, height: '40%' }}>
                        {currentPrefab.components.map((c, i) => (
                            <div 
                                key={i} 
                                onClick={() => setSelectedCompIdx(i)}
                                style={{ 
                                    padding: '8px 15px', borderBottom: '1px solid #111', cursor: 'pointer',
                                    color: selectedCompIdx === i ? 'var(--accent)' : '#666',
                                    background: selectedCompIdx === i ? 'rgba(241, 196, 15, 0.05)' : 'transparent'
                                }}
                            >
                                <ChevronRight size={12} style={{ marginRight: '8px', display: 'inline' }} /> {c.type}
                            </div>
                        ))}
                        <button className="tool-btn" style={{ width: '100%', borderRadius: 0, border: 'none', background: '#111' }} onClick={() => addComponent('NewComponent')}>
                            <Plus size={14} style={{ marginRight: '5px' }} /> ADD COMPONENT
                        </button>
                    </div>

                    <div className="panel-header" style={{ borderTop: '1px solid #333' }}><Settings size={14} /> INSPECTOR</div>
                    <div className="panel-content">
                        {currentComp ? (
                            <div>
                                <label>Component Type</label>
                                <input type="text" value={currentComp.type} readOnly style={{ opacity: 0.5, marginBottom: '15px' }} />
                                
                                {currentComp.type === 'Transform' && (
                                    <>
                                        <label>Position X/Y</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <input type="number" value={currentComp.x} onChange={(e) => {
                                                const newComps = [...currentPrefab.components];
                                                newComps[selectedCompIdx].x = parseInt(e.target.value);
                                                updateCurrentPrefab('components', newComps);
                                            }} />
                                            <input type="number" value={currentComp.y} onChange={(e) => {
                                                const newComps = [...currentPrefab.components];
                                                newComps[selectedCompIdx].y = parseInt(e.target.value);
                                                updateCurrentPrefab('components', newComps);
                                            }} />
                                        </div>
                                    </>
                                )}

                                <label style={{ marginTop: '15px' }}>Visual Template (Sprite)</label>
                                <select value={currentPrefab.sprite} onChange={(e) => updateCurrentPrefab('sprite', e.target.value)}>
                                    {sprites && Object.keys(sprites).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#333', marginTop: '20px' }}>SELECT A COMPONENT</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrefabEditor;
