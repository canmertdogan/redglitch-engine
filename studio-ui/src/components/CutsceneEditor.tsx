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
    const [selTrack, setSelTrack] = useState<string | null>(null);

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
                    const dur = cutscenes[currentIndex]?.duration || 30;
                    if (next >= dur) {
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
            const res = await fetch('/api/cutscenes/list');
            if (res.ok) {
                const data = await res.json();
                if (!Array.isArray(data) || data.length === 0) { setCutscenes([getDefaultCutscene()]); return; }
                const full = await Promise.all(data.map(async (item: any) => {
                    try { const r = await fetch(`/api/cutscenes/${encodeURIComponent(item.id)}`); if (r.ok) return normalizeCutscene(await r.json()); } catch {}
                    return normalizeCutscene({ id: item.id, name: item.name, duration: 30, tracks: defaultTracks() });
                }));
                setCutscenes(full);
            } else {
                setCutscenes([getDefaultCutscene()]);
            }
        } catch (e) {
            setCutscenes([getDefaultCutscene()]);
        }
    };

    const normalizeCutscene = (raw: any): Cutscene => {
        if (!raw || typeof raw !== 'object') return getDefaultCutscene();
        const timeline = raw.timeline || raw;
        const tracks = Array.isArray(timeline.tracks) ? timeline.tracks.map((tr: any, i: number) => ({
            id: tr.id || `t${i+1}`,
            name: tr.name || `Track ${i+1}`,
            type: (['actor','interaction','audio','camera'].includes(tr.type) ? tr.type : 'actor') as Track['type'],
            visible: tr.visible !== false,
            keyframes: Array.isArray(tr.keyframes) ? tr.keyframes : [],
        })) : defaultTracks();
        return { id: raw.id || 'cutscene_' + Date.now(), name: raw.name || 'New Cinematic', duration: Number(timeline.duration) || 30, tracks };
    };
    const defaultTracks = (): Track[] => ([
        { id: 't1', name: 'Actors', type: 'actor', visible: true, keyframes: [{ time: 0, properties: { sprite: 'player' } }] },
        { id: 't2', name: 'Audio', type: 'audio', visible: true, keyframes: [] },
        { id: 't3', name: 'Events', type: 'interaction', visible: true, keyframes: [] }
    ]);
    const buildCutscenePayload = (cs: Cutscene) => ({
        id: cs.id, name: cs.name, version: '1.0',
        timeline: { duration: cs.duration, fps: 60, tracks: cs.tracks },
        branches: {}, variables: {}, settings: { pauseOnChoices: true, allowSkipping: false, allowRollback: true }
    });
    const saveCurrent = async () => {
        const cs = cutscenes[currentIndex] || getDefaultCutscene();
        const fileStem = String(cs.id || 'cutscene').replace(/[^a-zA-Z0-9_-]+/g, '_');
        const payload = buildCutscenePayload({ ...cs, id: fileStem });
        const res = await fetch(`/api/cutscenes/${encodeURIComponent(fileStem)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
            const updated = cutscenes.map((c, i) => i === currentIndex ? { ...payload, duration: payload.timeline.duration, tracks: payload.timeline.tracks } as Cutscene : c);
            setCutscenes(updated);
            alert('Saved: ' + fileStem);
        } else { alert('Save failed: ' + res.status); }
    };
    const deleteCurrent = async () => {
        const cs = cutscenes[currentIndex]; if (!cs) return;
        if (!confirm(`Delete "${cs.name}"?`)) return;
        const res = await fetch(`/api/cutscenes/${encodeURIComponent(cs.id)}`, { method: 'DELETE' });
        if (res.ok || res.status === 404) {
            const next = cutscenes.filter((_, i) => i !== currentIndex);
            setCutscenes(next.length ? next : [getDefaultCutscene()]);
            setCurrentIndex(Math.max(0, currentIndex - 1));
        } else alert('Delete failed: ' + res.status);
    };
    const addKeyframeAtCurrent = (trackId: string) => {
        const cs = cutscenes[currentIndex]; if (!cs) return;
        const updated = cs.tracks.map(tr => tr.id === trackId ? { ...tr, keyframes: [...tr.keyframes, { time: Math.round(currentTime * 10) / 10, properties: { sprite: 'player', x: 100, y: 100 } }] } : tr);
        setCutscenes(cutscenes.map((c, i) => i === currentIndex ? { ...c, tracks: updated } : c));
    };
    const removeKeyframe = (trackId: string, kfIdx: number) => {
        const cs = cutscenes[currentIndex]; if (!cs) return;
        const updated = cs.tracks.map(tr => tr.id === trackId ? { ...tr, keyframes: tr.keyframes.filter((_, i) => i !== kfIdx) } : tr);
        setCutscenes(cutscenes.map((c, i) => i === currentIndex ? { ...c, tracks: updated } : c));
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
                <button className="tool-btn" onClick={saveCurrent} title="Save (Ctrl+S)"><Save size={16} /></button>
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
                            {/* Interpolated Actor Preview (x/y from keyframes, lerp between) */}
                            {(() => {
                                const actorTrack = currentCutscene.tracks.find(tr => tr.type === 'actor');
                                if (!actorTrack || !actorTrack.keyframes.length) return <div style={{ color: '#444' }}>No actor track</div>;
                                const kfs = [...actorTrack.keyframes].sort((a, b) => a.time - b.time);
                                let cur = kfs[0], nxt: any = null;
                                for (let i = 0; i < kfs.length; i++) { if (kfs[i].time <= currentTime) { cur = kfs[i]; nxt = kfs[i+1] || null; } else break; }
                                const prog = nxt && nxt.time > cur.time ? Math.min(1, Math.max(0, (currentTime - cur.time) / (nxt.time - cur.time))) : 0;
                                const cx = cur.properties?.x ?? 320, cy = cur.properties?.y ?? 180;
                                const nx = nxt?.properties?.x ?? cx, ny = nxt?.properties?.y ?? cy;
                                const xi = cx + (nx - cx) * prog, yi = cy + (ny - cy) * prog;
                                const sprite = cur.properties?.sprite || nxt?.properties?.sprite || 'player';
                                const spriteImg = (sprites as any)?.[sprite];
                                return (
                                    <div style={{ position: 'absolute', left: Math.max(0, Math.min(640-48, xi)), top: Math.max(0, Math.min(360-64, yi)), textAlign: 'center' }}>
                                        {spriteImg?.data?.[0] ? <img src={spriteImg.data[0]} alt={sprite} style={{ width: 48, height: 48, imageRendering: 'pixelated' }} /> : <User size={48} color="var(--accent)" />}
                                        <div style={{ color: '#fff', fontSize: '0.7rem', marginTop: 4 }}>{sprite} @ {currentTime.toFixed(1)}s</div>
                                    </div>
                                );
                            })()}
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
                            <div onClick={(e) => { const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const dur = currentCutscene.duration || 30; setCurrentTime(Math.round(((e.clientX - r.left) / r.width) * dur * 10) / 10); }} style={{ flexGrow: 1, position: 'relative', cursor: 'pointer' }}>
                                {Array.from({ length: 7 }, (_, i) => Math.round((currentCutscene.duration * i / 6) * 10) / 10).map(s => (
                                    <div key={s} style={{ position: 'absolute', left: `${(s / (currentCutscene.duration || 30)) * 100}%`, borderLeft: '1px solid #222', height: '100%', paddingLeft: '5px', fontSize: '0.6rem', color: '#333' }}>
                                        {s}s
                                    </div>
                                ))}
                                {/* Playhead */}
                                <div style={{ position: 'absolute', left: `${(currentTime / (currentCutscene.duration || 30)) * 100}%`, width: '2px', height: '500px', background: 'var(--accent)', zIndex: 100 }}>
                                    <div style={{ width: '10px', height: '10px', background: 'var(--accent)', borderRadius: '50%', transform: 'translateX(-4px)' }} />
                                </div>
                            </div>
                        </div>

                        {/* TRACKS GRID */}
                        <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                            {currentCutscene.tracks.map(track => (
                                <div key={track.id} style={{ display: 'flex', borderBottom: '1px solid #111', minHeight: '40px' }}>
                                    <div onClick={() => setSelTrack(track.id)} style={{ width: '200px', flexShrink: 0, borderRight: '1px solid #222', background: (selTrack===track.id ? '#1a1a1a' : '#000'), padding: '10px 15px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                        {track.type === 'actor' ? <User size={14} color="#3498db" /> : 
                                         track.type === 'audio' ? <Music size={14} color="#2ecc71" /> : <MessageSquare size={14} color="#ff0000" />}
                                        {track.name.toLowerCase()}
                                    </div>
                                    <div onClick={(e) => { const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const dur = currentCutscene.duration || 30; const tSec = Math.round(((e.clientX - r.left) / r.width) * dur * 10) / 10; setCurrentTime(Math.max(0, Math.min(dur, tSec))); if (selTrack === track.id) addKeyframeAtCurrent(track.id); }} style={{ flexGrow: 1, background: 'rgba(0,0,0,0.2)', position: 'relative', cursor: 'crosshair' }}>
                                        {track.keyframes.map((kf, ki) => (
                                            <div key={ki} onClick={(e) => { e.stopPropagation(); setCurrentTime(kf.time); if (e.altKey) removeKeyframe(track.id, ki); }} title={`${kf.time}s — click seek, Alt+click delete`} style={{ position: 'absolute', left: `${(kf.time / (currentCutscene.duration || 30)) * 100}%`, top: '10px', width: '12px', height: '20px', background: 'var(--accent)', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', cursor: 'pointer' }} />
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
                            <div style={{marginBottom: '12px', padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid #222'}}>
                                <div style={{fontSize: '0.75rem', color: '#666', marginBottom: '6px'}}>SELECTED TRACK: {selTrack || 'none — click a track header'}</div>
                                <button disabled={!selTrack} onClick={() => selTrack && addKeyframeAtCurrent(selTrack)} style={{marginRight: '6px', padding: '6px 10px'}}>＋ Keyframe at {currentTime.toFixed(1)}s</button>
                                <span style={{fontSize: '0.7rem', color: '#555'}}>Alt+click keyframe to delete</span>
                            </div>
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
