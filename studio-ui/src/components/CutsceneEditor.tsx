import React, { useState, useEffect, useRef } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Film, Play, Pause, Square, Save, Plus, Trash2, 
    Timeline as TimeIcon, MessageSquare, Music, User, 
    ChevronRight, ChevronDown, Settings, Sliders, Layers,
    Clock, SkipForward, SkipBack
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';

interface Keyframe {
    time: number;
    type?: string;
    data?: any;
    properties?: any;
}

interface Track {
    id: string;
    name: string;
    type: 'actor' | 'interaction' | 'audio' | 'camera';
    visible: boolean;
    keyframes: Keyframe[];
}

interface Cutscene {
    id: string;
    name: string;
    duration: number;
    tracks: Track[];
}

const CutsceneEditor: React.FC = () => {
    const { isReady, sprites } = useStudio();
    const [cutscenes, setCutscenes] = useState<Cutscene[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const timelineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isReady) {
            loadCutscenes();
        }
    }, [isReady]);

    useEffect(() => {
        if (isPlaying) {
            const interval = setInterval(() => {
                setCurrentTime(t => {
                    const next = t + 0.05;
                    if (next >= (cutscenes[currentIndex]?.duration || 30)) {
                        setIsPlaying(false);
                        return 0;
                    }
                    return next;
                });
            }, 50);
            return () => clearInterval(interval);
        }
    }, [isPlaying, cutscenes, currentIndex]);

    const loadCutscenes = async () => {
        try {
            const res = await fetch('/api/assets?type=cutscene');
            if (res.ok) {
                const data = await res.json();
                setCutscenes(data.length > 0 ? data : [getDefaultCutscene()]);
            }
        } catch (e) {
            setCutscenes([getDefaultCutscene()]);
        }
    };

    const getDefaultCutscene = (): Cutscene => ({
        id: 'cutscene_' + Date.now(),
        name: 'New Cinematic',
        duration: 30.0,
        tracks: [
            { id: 't1', name: 'Actors', type: 'actor', visible: true, keyframes: [{ time: 0, properties: { sprite: 'player' } }] },
            { id: 't2', name: 'Audio', type: 'audio', visible: true, keyframes: [] },
            { id: 't3', name: 'Events', type: 'interaction', visible: true, keyframes: [] }
        ]
    });

    const updateCurrentCutscene = (field: string, value: any) => {
        const newConvs = [...cutscenes];
        const conv = { ...newConvs[currentIndex] };
        const keys = field.split('.');
        let current: any = conv;
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = { ...current[keys[i]] };
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        newConvs[currentIndex] = conv;
        setCutscenes(newConvs);
    };

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>BOOTING CINEMATIC KERNEL...</div>;

    const currentCutscene = cutscenes[currentIndex] || getDefaultCutscene();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050505' }}>
            {/* MENUBAR */}
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px' }}>
                <div style={{ color: '#e74c3c', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <Film size={16} style={{ marginRight: '8px', display: 'inline' }} /> CUTSCENE STUDIO v2.0
                </div>
            </div>

            {/* TOOLBAR */}
            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" onClick={() => setIsPlaying(!isPlaying)}>
                    {isPlaying ? <Pause size={16} color="var(--accent)" /> : <Play size={16} />}
                </button>
                <button className="tool-btn" onClick={() => { setIsPlaying(false); setCurrentTime(0); }}><Square size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <div style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: '1rem', width: '80px', textAlign: 'center' }}>
                    {currentTime.toFixed(2)}s
                </div>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn"><Save size={16} /></button>
                <button className="tool-btn" onClick={() => setCutscenes([...cutscenes, getDefaultCutscene()])}><Plus size={16} /></button>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                {/* SIDEBAR: SEQUENCES */}
                <Sidebar 
                    title="SEQUENCES" 
                    items={cutscenes} 
                    currentIndex={currentIndex} 
                    onSelect={setCurrentIndex}
                    renderItem={(c, active) => (
                        <div style={{
                            padding: '10px', cursor: 'pointer', borderBottom: '1px solid #1a1a1a',
                            color: active ? '#e74c3c' : '#888',
                            background: active ? 'rgba(231, 76, 60, 0.05)' : 'transparent',
                            borderLeft: active ? '3px solid #e74c3c' : '3px solid transparent'
                        }}>
                            {c.name || 'Unnamed Cutscene'}
                        </div>
                    )}
                />

                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* PREVIEW VIEWPORT */}
                    <div style={{ height: '45%', background: '#000', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        <div style={{ width: '640px', height: '360px', background: '#080808', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            {/* Simple Sprite Preview */}
                            {currentCutscene.tracks[0]?.keyframes[0]?.properties?.sprite && (
                                <div style={{ color: 'var(--accent)', textAlign: 'center' }}>
                                    <User size={64} style={{ marginBottom: '10px', opacity: 0.5 }} />
                                    <div>ACTOR: {currentCutscene.tracks[0].keyframes[0].properties.sprite}</div>
                                </div>
                            )}
                            <div style={{ position: 'absolute', top: '10px', left: '10px', color: '#444', fontSize: '0.7rem' }}>
                                16:9 CINEMATIC VIEWPORT
                            </div>
                        </div>
                    </div>

                    {/* TIMELINE AREA */}
                    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', background: '#0a0a0f', overflow: 'hidden' }}>
                        {/* TIMELINE HEADER / RULER */}
                        <div style={{ height: '30px', background: '#000', borderBottom: '1px solid #222', display: 'flex', position: 'relative' }}>
                            <div style={{ width: '200px', flexShrink: 0, borderRight: '1px solid #222', padding: '5px 15px', fontSize: '0.7rem', color: '#444' }}>TRACKS</div>
                            <div style={{ flexGrow: 1, position: 'relative' }}>
                                {[0, 5, 10, 15, 20, 25, 30].map(s => (
                                    <div key={s} style={{ position: 'absolute', left: `${(s / 30) * 100}%`, borderLeft: '1px solid #222', height: '100%', paddingLeft: '5px', fontSize: '0.6rem', color: '#333' }}>
                                        {s}s
                                    </div>
                                ))}
                                {/* Playhead */}
                                <div style={{ position: 'absolute', left: `${(currentTime / 30) * 100}%`, width: '2px', height: '500px', background: 'var(--accent)', zIndex: 100 }}>
                                    <div style={{ width: '10px', height: '10px', background: 'var(--accent)', borderRadius: '50%', transform: 'translateX(-4px)' }} />
                                </div>
                            </div>
                        </div>

                        {/* TRACKS GRID */}
                        <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                            {currentCutscene.tracks.map(track => (
                                <div key={track.id} style={{ display: 'flex', borderBottom: '1px solid #111', minHeight: '40px' }}>
                                    <div style={{ width: '200px', flexShrink: 0, borderRight: '1px solid #222', background: '#000', padding: '10px 15px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                                        {track.type === 'actor' ? <User size={14} color="#3498db" /> : 
                                         track.type === 'audio' ? <Music size={14} color="#2ecc71" /> : <MessageSquare size={14} color="#ff0000" />}
                                        {track.name.toLowerCase()}
                                    </div>
                                    <div style={{ flexGrow: 1, background: 'rgba(0,0,0,0.2)', position: 'relative' }}>
                                        {track.keyframes.map((kf, ki) => (
                                            <div 
                                                key={ki} 
                                                style={{ 
                                                    position: 'absolute', left: `${(kf.time / 30) * 100}%`, top: '10px',
                                                    width: '12px', height: '20px', background: 'var(--accent)', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                                                    cursor: 'pointer'
                                                }} 
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* INSPECTOR */}
                <div className="panel" style={{ width: '300px', borderLeft: '1px solid #1f2b42', borderRight: 'none' }}>
                    <div className="panel-header"><Settings size={14} /> SEQUENCE SETTINGS</div>
                    <div className="panel-content">
                        <FormSection title="Composition">
                            <label>Internal Name</label>
                            <input type="text" value={currentCutscene.name} onChange={(e) => updateCurrentCutscene('name', e.target.value)} />
                            
                            <label style={{ marginTop: '15px' }}>Total Duration (sec)</label>
                            <input type="number" value={currentCutscene.duration} onChange={(e) => updateCurrentCutscene('duration', parseFloat(e.target.value))} />
                        </FormSection>

                        <FormSection title="Playback Rules">
                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <input type="checkbox" style={{ width: '18px' }} defaultChecked />
                                <label style={{ marginBottom: 0 }}>PAUSE ON CHOICES</label>
                             </div>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input type="checkbox" style={{ width: '18px' }} />
                                <label style={{ marginBottom: 0 }}>ALLOW SKIPPING</label>
                             </div>
                        </FormSection>

                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <button className="tool-btn" style={{ width: '100%', height: '40px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }}>
                                <Trash2 size={16} style={{ marginRight: '8px' }} /> DELETE SEQUENCE
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CutsceneEditor;
