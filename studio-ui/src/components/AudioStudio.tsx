import React, { useEffect, useMemo, useState } from 'react';
import { useStudio } from '../hooks/useStudio';
import {
    Activity,
    BarChart3,
    Clock,
    CloudDownload,
    FileAudio,
    FilePlus,
    Layers,
    List,
    Music,
    Play,
    Plus,
    Radio,
    Save,
    Search,
    Settings2,
    Sliders,
    Square,
    Terminal,
    Trash2,
    Zap
} from 'lucide-react';

type EventGroup = 'sfx' | 'music' | 'ambience' | 'voice';
type ExplorerTab = 'events' | 'assets' | 'templates';
type PlaybackMode = 'random' | 'sequential' | 'loop';
type FilterType = 'lowpass' | 'highpass' | 'bandpass';

interface AudioEvent {
    group: EventGroup;
    clips: string[];
    priority: boolean;
    reverb: number;
    filter: {
        type: FilterType;
        freq: number;
    };
    playback: {
        mode: PlaybackMode;
        volume: number;
        volumeVar: number;
        pitchVar: number;
        cooldown: number;
        fadeIn: number;
        fadeOut: number;
    };
}

interface AudioBus {
    gain: number;
    parent?: string;
    ducking?: boolean;
}

interface AudioMap {
    events: Record<string, AudioEvent>;
    buses: Record<string, AudioBus>;
}

interface TriggerLog {
    id: number;
    name: string;
    clip?: string;
    time: string;
}

const THEME = {
    accent: '#ff0000',
    accentSoft: 'rgba(255, 0, 0, 0.08)',
    bgRoot: '#050608',
    bgDeep: '#080a0f',
    bgPanel: '#12151c',
    bgPanelAlt: '#0d0f14',
    bgHover: '#1a1d26',
    border: '#2a2f3a',
    borderMute: '#1a1d26',
    textMain: '#f0f2f5',
    textDim: '#8a8f9d',
    textMute: '#4f5565',
    danger: '#ff4d4d',
    ok: '#00cc66',
    retroIn: 'inset 2px 2px 0 rgba(0,0,0,0.5)',
    retroOut: '2px 2px 0 rgba(0,0,0,0.5)'
};

const CanvasSpectrum: React.FC<{ isPlaying: boolean; color: string }> = ({ isPlaying, color }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frame = 0;
        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const barWidth = 4;
            const gap = 2;
            const bars = Math.floor(canvas.width / (barWidth + gap));
            
            for (let i = 0; i < bars; i++) {
                const height = isPlaying 
                    ? (Math.sin(frame * 0.2 + i * 0.5) * 20 + 30 + Math.random() * 20)
                    : (Math.sin(i * 0.8) * 5 + 10);
                
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.8;
                ctx.fillRect(i * (barWidth + gap), canvas.height - height, barWidth, height);
            }
            frame++;
            animationId = requestAnimationFrame(render);
        };

        let animationId = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animationId);
    }, [isPlaying, color]);

    return <canvas ref={canvasRef} width={600} height={80} style={{ width: '100%', height: '80px', display: 'block' }} />;
};

const CanvasWaveform: React.FC<{ clips: string[]; color: string }> = ({ clips, color }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (clips.length === 0) {
            ctx.strokeStyle = THEME.textMute;
            ctx.beginPath();
            ctx.moveTo(0, canvas.height / 2);
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
            return;
        }

        // Draw a stylized retro waveform
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        for (let i = 0; i < canvas.width; i++) {
            const h = Math.sin(i * 0.1) * 10 + Math.cos(i * 0.05) * 15 + Math.sin(i * 0.3) * 5;
            ctx.lineTo(i, canvas.height / 2 + h);
        }
        ctx.stroke();
        
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = color;
        ctx.fill();
    }, [clips, color]);

    return <canvas ref={canvasRef} width={1000} height={180} style={{ width: '100%', height: '180px', display: 'block' }} />;
};

const CanvasMeter: React.FC<{ level: number; isMaster?: boolean }> = ({ level, isMaster }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const segments = 15;
        const segHeight = (canvas.height - (segments - 1)) / segments;
        const activeSegs = Math.floor(level * segments);

        for (let i = 0; i < segments; i++) {
            const isActive = i < activeSegs;
            const isWarn = i > segments * 0.7;
            const isClip = i > segments * 0.9;
            
            ctx.fillStyle = isActive 
                ? (isClip ? THEME.danger : isWarn ? '#f39c12' : THEME.accent)
                : '#1a1d26';
            
            ctx.fillRect(0, canvas.height - (i + 1) * (segHeight + 1), canvas.width, segHeight);
            
            if (isActive) {
                ctx.shadowBlur = 4;
                ctx.shadowColor = ctx.fillStyle as string;
                ctx.fillRect(0, canvas.height - (i + 1) * (segHeight + 1), canvas.width, segHeight);
                ctx.shadowBlur = 0;
            }
        }
    }, [level]);

    return <canvas ref={canvasRef} width={20} height={120} style={{ width: '20px', height: '120px', display: 'block' }} />;
};

const CORE_EVENTS = [
    'player:jump',
    'player:land',
    'player:footstep',
    'player:hurt',
    'player:death',
    'player:attack',
    'enemy:spawn',
    'enemy:hurt',
    'enemy:death',
    'enemy:attack',
    'enemy:alert',
    'ui:click',
    'ui:hover',
    'ui:open',
    'ui:close',
    'ui:error',
    'ui:success',
    'item:pickup',
    'item:use',
    'level:start',
    'level:complete'
];

const DEFAULT_BUSES: Record<string, AudioBus> = {
    master: { gain: 1 },
    music: { gain: 0.7, parent: 'master' },
    sfx: { gain: 0.9, parent: 'master' },
    ambience: { gain: 0.65, parent: 'master' },
    voice: { gain: 0.85, parent: 'master' }
};

const withEventDefaults = (input?: Partial<AudioEvent>): AudioEvent => ({
    group: (input?.group || 'sfx') as EventGroup,
    clips: Array.isArray(input?.clips) ? [...(input.clips as string[])] : [],
    priority: !!input?.priority,
    reverb: typeof input?.reverb === 'number' ? input.reverb : 0,
    filter: {
        type: (input?.filter?.type || 'lowpass') as FilterType,
        freq: typeof input?.filter?.freq === 'number' ? input.filter.freq : 2000
    },
    playback: {
        mode: (input?.playback?.mode || 'random') as PlaybackMode,
        volume: typeof input?.playback?.volume === 'number' ? input.playback.volume : 1,
        volumeVar: typeof input?.playback?.volumeVar === 'number' ? input.playback.volumeVar : 0.1,
        pitchVar: typeof input?.playback?.pitchVar === 'number' ? input.playback.pitchVar : 0.05,
        cooldown: typeof input?.playback?.cooldown === 'number' ? input.playback.cooldown : 0.1,
        fadeIn: typeof input?.playback?.fadeIn === 'number' ? input.playback.fadeIn : 0,
        fadeOut: typeof input?.playback?.fadeOut === 'number' ? input.playback.fadeOut : 0
    }
});

const normalizeMap = (rawMap: any): AudioMap => {
    const events: Record<string, AudioEvent> = {};
    const rawEvents = rawMap?.events || {};

    Object.entries(rawEvents).forEach(([eventId, eventConfig]) => {
        events[eventId] = withEventDefaults(eventConfig as Partial<AudioEvent>);
    });

    const buses: Record<string, AudioBus> = { ...DEFAULT_BUSES };
    const rawBuses = rawMap?.buses || {};

    Object.entries(rawBuses).forEach(([busName, busConfig]) => {
        const typed = busConfig as AudioBus;
        buses[busName] = {
            gain: typeof typed.gain === 'number' ? typed.gain : 1,
            parent: typed.parent || (busName === 'master' ? undefined : 'master'),
            ducking: !!typed.ducking
        };
    });

    return { events, buses };
};

const createEventTemplate = (group: EventGroup): AudioEvent =>
    withEventDefaults({
        group,
        clips: [],
        playback: {
            mode: group === 'music' ? 'loop' : 'random',
            volume: group === 'music' ? 0.8 : 1,
            volumeVar: group === 'music' ? 0 : 0.1,
            pitchVar: group === 'music' ? 0 : 0.05,
            cooldown: group === 'music' ? 0 : 0.1,
            fadeIn: group === 'music' ? 0.4 : 0,
            fadeOut: group === 'music' ? 0.4 : 0
        }
    });

const AudioStudio: React.FC = () => {
    const { isReady, eventBus } = useStudio();

    const [audioMap, setAudioMap] = useState<AudioMap>({ events: {}, buses: { ...DEFAULT_BUSES } });
    const [availableAssets, setAvailableAssets] = useState<string[]>([]);
    const [discoveredEvents, setDiscoveredEvents] = useState<string[]>([]);
    const [activeExplorerTab, setExplorerTab] = useState<ExplorerTab>('events');
    const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [statusLine, setStatusLine] = useState('IDLE');
    const [triggerHistory, setTriggerHistory] = useState<TriggerLog[]>([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [eventSearch, setEventSearch] = useState('');
    const [assetSearch, setAssetSearch] = useState('');
    const [groupFilter, setGroupFilter] = useState<'all' | EventGroup>('all');
    const [newEventName, setNewEventName] = useState('');
    const [transportBpm, setTransportBpm] = useState(120);
    const [transportState, setTransportState] = useState<'normal' | 'combat' | 'stealth'>('normal');
    const [transportEnv, setTransportEnv] = useState<'dry' | 'cave' | 'hall'>('dry');

    useEffect(() => {
        if (!isReady) return;

        void loadAudioMap();
        void loadAssets();
        void discoverEvents();

        const unsub = eventBus?.on('audio:trigger', (event: any) => {
            const name = event?.data?.name || 'unknown:event';
            const clip = event?.data?.clip;
            addHistory(name, clip);
        });

        return () => unsub?.();
    }, [isReady]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void saveMap();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [audioMap, isReady]);

    useEffect(() => {
        if (!selectedEvent) {
            const firstEvent = Object.keys(audioMap.events)[0];
            if (firstEvent) setSelectedEvent(firstEvent);
            return;
        }
        if (!audioMap.events[selectedEvent]) {
            const fallback = Object.keys(audioMap.events)[0] || null;
            setSelectedEvent(fallback);
        }
    }, [audioMap.events, selectedEvent]);

    const addHistory = (name: string, clip?: string) => {
        setTriggerHistory(prev => [
            {
                id: Date.now() + Math.random(),
                name,
                clip,
                time: new Date().toLocaleTimeString()
            },
            ...prev
        ].slice(0, 24));
    };

    const loadAudioMap = async () => {
        try {
            const res = await fetch('/api/audio/map');
            if (!res.ok) {
                console.error('[AudioStudio] Failed to load /api/audio/map');
                return;
            }
            const map = await res.json();
            const normalized = normalizeMap(map);
            setAudioMap(normalized);
            setStatusLine('MAP_LOADED');
            setIsDirty(false);
        } catch (e) {
            console.error('[AudioStudio] loadAudioMap failed', e);
            setStatusLine('LOAD_FAILED');
        }
    };

    const loadAssets = async () => {
        try {
            const res = await fetch('/api/assets?type=audio');
            if (!res.ok) {
                console.error('[AudioStudio] Failed to load /api/assets?type=audio');
                return;
            }
            const data = await res.json();
            setAvailableAssets((data || []).map((a: any) => a.id || a.name || String(a)));
        } catch (e) {
            console.error('[AudioStudio] loadAssets failed', e);
        }
    };

    const discoverEvents = async () => {
        try {
            const res = await fetch('/api/audio/discover-events');
            if (res.ok) {
                const serverEvents = await res.json();
                setDiscoveredEvents([...new Set([...CORE_EVENTS, ...(serverEvents || [])])]);
                return;
            }
            setDiscoveredEvents(CORE_EVENTS);
        } catch (e) {
            console.error('[AudioStudio] discoverEvents failed', e);
            setDiscoveredEvents(CORE_EVENTS);
        }
    };

    const saveMap = async () => {
        setIsSaving(true);
        setStatusLine('SYNCING_ENGINE...');
        try {
            const res = await fetch('/api/audio/map', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(audioMap)
            });
            if (!res.ok) {
                setStatusLine('SYNC_FAILED');
                return;
            }
            eventBus?.emit('audio:map_updated', audioMap);
            setStatusLine('ENGINE_SYNC_OK');
            setIsDirty(false);
        } catch (e) {
            console.error('[AudioStudio] saveMap failed', e);
            setStatusLine('SYNC_FAILED');
        } finally {
            setIsSaving(false);
        }
    };

    const setDirty = () => setIsDirty(true);

    const ensureEvent = (eventId: string, group: EventGroup = 'sfx') => {
        const cleanId = eventId.trim();
        if (!cleanId) return;

        setAudioMap(prev => {
            if (prev.events[cleanId]) return prev;
            return {
                ...prev,
                events: {
                    ...prev.events,
                    [cleanId]: createEventTemplate(group)
                }
            };
        });
        setSelectedEvent(cleanId);
        setDirty();
    };

    const bootstrapTemplate = () => {
        const templates: Record<string, AudioEvent> = {
            'player:footstep': withEventDefaults({
                group: 'sfx',
                clips: ['step_01.wav', 'step_02.wav'],
                playback: {
                    mode: 'random',
                    volume: 0.7,
                    volumeVar: 0.1,
                    pitchVar: 0.1,
                    cooldown: 0.2,
                    fadeIn: 0,
                    fadeOut: 0
                }
            }),
            'player:jump': withEventDefaults({
                group: 'sfx',
                clips: ['jump.wav'],
                reverb: 0.2,
                playback: {
                    mode: 'random',
                    volume: 0.85,
                    volumeVar: 0.08,
                    pitchVar: 0.05,
                    cooldown: 0.1,
                    fadeIn: 0,
                    fadeOut: 0
                }
            }),
            'ui:click': withEventDefaults({
                group: 'sfx',
                clips: ['click.mp3'],
                priority: true,
                playback: {
                    mode: 'random',
                    volume: 1,
                    volumeVar: 0,
                    pitchVar: 0,
                    cooldown: 0.05,
                    fadeIn: 0,
                    fadeOut: 0
                }
            }),
            'level:start': withEventDefaults({
                group: 'music',
                clips: ['bgm_main_theme.ogg'],
                playback: {
                    mode: 'loop',
                    volume: 0.8,
                    volumeVar: 0,
                    pitchVar: 0,
                    cooldown: 0,
                    fadeIn: 0.6,
                    fadeOut: 0.6
                }
            })
        };

        setAudioMap(prev => ({
            ...prev,
            events: { ...prev.events, ...templates }
        }));
        setDirty();
        if (!selectedEvent) setSelectedEvent('player:footstep');
        setStatusLine('TEMPLATE_PACK_APPLIED');
    };

    const updateEventField = (eventId: string, path: string, value: any) => {
        setAudioMap(prev => {
            const eventConfig = withEventDefaults(prev.events[eventId]);
            const nextEvents = { ...prev.events };
            const parts = path.split('.');

            if (parts.length === 1) {
                (eventConfig as any)[parts[0]] = value;
            } else {
                const [root, leaf] = parts;
                (eventConfig as any)[root] = {
                    ...(eventConfig as any)[root],
                    [leaf]: value
                };
            }

            nextEvents[eventId] = eventConfig;
            return { ...prev, events: nextEvents };
        });
        setDirty();
    };

    const addClipToEvent = (eventId: string, assetId: string) => {
        if (!assetId) return;
        ensureEvent(eventId);
        setAudioMap(prev => {
            const eventConfig = withEventDefaults(prev.events[eventId]);
            return {
                ...prev,
                events: {
                    ...prev.events,
                    [eventId]: {
                        ...eventConfig,
                        clips: [...eventConfig.clips, assetId]
                    }
                }
            };
        });
        setDirty();
    };

    const removeClipFromEvent = (eventId: string, clipIndex: number) => {
        setAudioMap(prev => {
            const eventConfig = withEventDefaults(prev.events[eventId]);
            return {
                ...prev,
                events: {
                    ...prev.events,
                    [eventId]: {
                        ...eventConfig,
                        clips: eventConfig.clips.filter((_, i) => i !== clipIndex)
                    }
                }
            };
        });
        setDirty();
    };

    const updateBus = (busName: string, field: keyof AudioBus, value: any) => {
        setAudioMap(prev => ({
            ...prev,
            buses: {
                ...prev.buses,
                [busName]: {
                    ...(prev.buses[busName] || { gain: 1 }),
                    [field]: value
                }
            }
        }));
        setDirty();
    };

    const auditionEvent = (eventId: string, clip?: string) => {
        eventBus?.emit('audio:trigger', { name: eventId, clip, audition: true });
        addHistory(eventId, clip);
    };

    const handleDragStart = (e: React.DragEvent, assetId: string) => {
        e.dataTransfer.setData('text/plain', assetId);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDropOnEvent = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (!selectedEvent) return;
        const assetId = e.dataTransfer.getData('text/plain');
        if (assetId) addClipToEvent(selectedEvent, assetId);
    };

    const eventCatalog = useMemo(() => {
        const mapped = Object.keys(audioMap.events);
        return [...new Set([...mapped, ...discoveredEvents])].sort((a, b) => a.localeCompare(b));
    }, [audioMap.events, discoveredEvents]);

    const filteredEvents = useMemo(() => {
        return eventCatalog.filter(eventId => {
            const evt = audioMap.events[eventId];
            const normalized = eventId.toLowerCase();
            const query = eventSearch.trim().toLowerCase();
            if (query && !normalized.includes(query)) return false;
            if (groupFilter !== 'all' && evt?.group !== groupFilter) return false;
            return true;
        });
    }, [eventCatalog, audioMap.events, eventSearch, groupFilter]);

    const filteredAssets = useMemo(() => {
        const query = assetSearch.trim().toLowerCase();
        if (!query) return availableAssets;
        return availableAssets.filter(a => a.toLowerCase().includes(query));
    }, [availableAssets, assetSearch]);

    const mappedEventsCount = useMemo(
        () => Object.values(audioMap.events).filter(evt => evt.clips.length > 0).length,
        [audioMap.events]
    );

    const selectedConfig = selectedEvent ? audioMap.events[selectedEvent] : undefined;

    const busEntries = useMemo(() => {
        const order = ['master', 'music', 'sfx', 'ambience', 'voice'];
        const keys = [...new Set([...order, ...Object.keys(audioMap.buses)])];
        return keys.map(busName => [busName, audioMap.buses[busName] || { gain: 1 }] as const);
    }, [audioMap.buses]);

    const addCustomEvent = () => {
        const clean = newEventName.trim();
        if (!clean) return;
        ensureEvent(clean);
        setNewEventName('');
    };

    if (!isReady) {
        return (
            <div style={{ color: THEME.accent, padding: '20px', fontFamily: 'VT323', background: THEME.bgRoot, height: '100vh' }}>
                BOOTING_AUDIO_STUDIO_PRO...
            </div>
        );
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                background: THEME.bgRoot,
                color: THEME.textMain,
                fontFamily: 'VT323, monospace',
                fontSize: '18px'
            }}
        >
            <div
                style={{
                    height: '52px',
                    background: THEME.bgPanelAlt,
                    borderBottom: `2px solid #000`,
                    boxShadow: '0 2px 0 rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 16px',
                    zIndex: 10
                }}
            >
                <div style={{ color: THEME.accent, fontWeight: 'bold', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '20px' }}>
                    <Music size={20} /> <span style={{ textShadow: `2px 2px 0 rgba(0,0,0,0.5)` }}>AUDIO DIRECTOR PRO</span> 
                    <span style={{ color: THEME.textMute, fontSize: '12px', letterSpacing: '0', opacity: 0.6 }}>v7.1_STABLE</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '4px', background: '#000', padding: '2px', border: `1px solid ${THEME.border}` }}>
                        <span style={{ padding: '2px 10px', background: THEME.bgPanel, color: THEME.accent, fontSize: '13px', fontWeight: 'bold' }}>
                            MAP: {mappedEventsCount}/{eventCatalog.length}
                        </span>
                        <span style={{ padding: '2px 10px', background: THEME.bgPanel, color: THEME.textDim, fontSize: '13px' }}>
                            ASSETS: {availableAssets.length}
                        </span>
                    </div>
                    <div style={{ minWidth: '140px', textAlign: 'right', color: statusLine.includes('OK') ? THEME.ok : THEME.textMute, fontSize: '13px', fontFamily: 'monospace' }}>
                        {statusLine}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={bootstrapTemplate}
                        style={{
                            background: THEME.bgPanel,
                            border: `1px solid ${THEME.border}`,
                            boxShadow: THEME.retroOut,
                            color: THEME.textMain,
                            padding: '4px 14px',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: '14px'
                        }}
                    >
                        <Zap size={13} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> REBUILD
                    </button>
                    <button
                        onClick={() => void saveMap()}
                        disabled={isSaving}
                        style={{
                            background: isDirty ? THEME.accent : THEME.bgPanel,
                            color: isDirty ? '#000' : THEME.textDim,
                            border: `1px solid ${isDirty ? THEME.accent : THEME.border}`,
                            boxShadow: isDirty ? `2px 2px 0 #9a7d0a` : THEME.retroOut,
                            padding: '4px 16px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontFamily: 'inherit',
                            fontSize: '14px'
                        }}
                    >
                        <Save size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        {isSaving ? 'SYNCING...' : isDirty ? 'SYNC ENGINE' : 'ENGINE_SYNCED'}
                    </button>
                </div>
            </div>

            <div
                style={{
                    height: '50px',
                    background: THEME.bgDeep,
                    borderBottom: `1px solid ${THEME.border}`,
                    display: 'grid',
                    gridTemplateColumns: '320px 240px 1fr',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '0 12px'
                }}
            >
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: THEME.textMute }} />
                    <input
                        value={eventSearch}
                        onChange={e => setEventSearch(e.target.value)}
                        placeholder="SEARCH_EVENT_REGISTRY..."
                        style={{ 
                            paddingLeft: '32px', 
                            height: '32px', 
                            fontSize: '14px', 
                            background: '#000', 
                            border: `1px solid ${THEME.border}`,
                            color: THEME.accent,
                            width: '100%'
                        }}
                    />
                </div>
                
                <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                        value={newEventName}
                        onChange={e => setNewEventName(e.target.value)}
                        placeholder="new:event:id"
                        style={{ 
                            height: '32px', 
                            fontSize: '14px', 
                            background: '#000', 
                            border: `1px solid ${THEME.border}`,
                            flex: 1
                        }}
                    />
                    <button
                        onClick={addCustomEvent}
                        style={{
                            width: '32px',
                            height: '32px',
                            border: `1px solid ${THEME.border}`,
                            background: THEME.bgPanel,
                            color: THEME.accent,
                            cursor: 'pointer',
                            boxShadow: THEME.retroOut
                        }}
                    >
                        <Plus size={16} />
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '15px', fontSize: '13px', color: THEME.textDim }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>STATE</span>
                        <select
                            value={transportState}
                            onChange={e => setTransportState(e.target.value as any)}
                            style={{ width: '90px', height: '30px', fontSize: '12px', background: '#000', border: `1px solid ${THEME.border}` }}
                        >
                            <option value="normal">NORMAL</option>
                            <option value="combat">COMBAT</option>
                            <option value="stealth">STEALTH</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>ENV</span>
                        <select
                            value={transportEnv}
                            onChange={e => setTransportEnv(e.target.value as any)}
                            style={{ width: '80px', height: '30px', fontSize: '12px', background: '#000', border: `1px solid ${THEME.border}` }}
                        >
                            <option value="dry">DRY</option>
                            <option value="cave">CAVE</option>
                            <option value="hall">HALL</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#000', padding: '2px 10px', border: `1px solid ${THEME.border}` }}>
                        <span style={{ minWidth: '60px' }}>{transportBpm} BPM</span>
                        <input
                            type="range"
                            min="60"
                            max="180"
                            value={transportBpm}
                            onChange={e => setTransportBpm(parseInt(e.target.value, 10))}
                            style={{ width: '80px' }}
                        />
                    </div>
                </div>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                <div
                    style={{
                        width: '320px',
                        background: THEME.bgPanel,
                        borderRight: `2px solid #000`,
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '4px 0 10px rgba(0,0,0,0.2)',
                        zIndex: 5
                    }}
                >
                    <div style={{ display: 'flex', background: '#000', padding: '2px', gap: '2px' }}>
                        {(['events', 'assets', 'templates'] as ExplorerTab[]).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setExplorerTab(tab)}
                                style={{
                                    flex: 1,
                                    height: '38px',
                                    border: `1px solid ${activeExplorerTab === tab ? THEME.accent : THEME.border}`,
                                    background: activeExplorerTab === tab ? THEME.accentSoft : THEME.bgPanel,
                                    color: activeExplorerTab === tab ? THEME.accent : THEME.textMute,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    fontSize: '13px',
                                    fontWeight: 'bold',
                                    letterSpacing: '1px'
                                }}
                            >
                                {tab.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    <div style={{ padding: '12px', borderBottom: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt }}>
                        {activeExplorerTab === 'assets' ? (
                            <div style={{ position: 'relative' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: THEME.textMute }} />
                                <input
                                    value={assetSearch}
                                    onChange={e => setAssetSearch(e.target.value)}
                                    placeholder="FILTER_ASSET_VFS..."
                                    style={{ paddingLeft: '32px', height: '32px', fontSize: '13px', background: '#000', border: `1px solid ${THEME.border}`, width: '100%' }}
                                />
                            </div>
                        ) : (
                            <div style={{ color: THEME.textDim, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                                <List size={14} /> REGISTERED_EVENTS: {filteredEvents.length}
                            </div>
                        )}
                    </div>

                    <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', background: THEME.bgDeep }}>
                        {activeExplorerTab === 'events' && filteredEvents.map(eventId => {
                            const eventConfig = audioMap.events[eventId];
                            const isMapped = !!eventConfig && eventConfig.clips.length > 0;
                            const isActive = selectedEvent === eventId;
                            return (
                                <div
                                    key={eventId}
                                    onClick={() => {
                                        if (!eventConfig) ensureEvent(eventId);
                                        setSelectedEvent(eventId);
                                    }}
                                    style={{
                                        padding: '10px',
                                        border: `1px solid ${isActive ? THEME.accent : THEME.border}`,
                                        background: isActive ? THEME.accentSoft : THEME.bgPanel,
                                        cursor: 'pointer',
                                        boxShadow: isActive ? `2px 2px 0 ${THEME.accent}` : 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ color: isActive ? THEME.accent : (isMapped ? THEME.textMain : THEME.textMute), fontSize: '15px', fontWeight: isActive ? 'bold' : 'normal' }}>
                                            <Radio size={11} style={{ marginRight: '8px', verticalAlign: 'middle', color: isMapped ? THEME.accent : 'inherit' }} />
                                            {eventId}
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '6px', fontSize: '11px', color: THEME.textMute, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{isMapped ? `${eventConfig.clips.length} VARIATIONS` : 'UNMAPPED'}</span>
                                        <span style={{ opacity: 0.5 }}>{eventConfig?.group.toUpperCase() || 'SFX'}</span>
                                    </div>
                                </div>
                            );
                        })}

                        {activeExplorerTab === 'assets' && filteredAssets.map(asset => (
                            <div
                                key={asset}
                                draggable
                                onDragStart={(e) => handleDragStart(e, asset)}
                                style={{
                                    padding: '10px',
                                    border: `1px solid ${THEME.border}`,
                                    background: THEME.bgPanel,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    cursor: 'grab'
                                }}
                            >
                                <div style={{ color: THEME.textMain, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <FileAudio size={13} style={{ marginRight: '8px', verticalAlign: 'middle', color: THEME.textDim }} />
                                    {asset}
                                </div>
                                <button
                                    onClick={() => selectedEvent && addClipToEvent(selectedEvent, asset)}
                                    disabled={!selectedEvent}
                                    style={{
                                        border: `1px solid ${THEME.border}`,
                                        background: '#000',
                                        color: selectedEvent ? THEME.accent : THEME.textMute,
                                        fontFamily: 'inherit',
                                        fontSize: '11px',
                                        cursor: selectedEvent ? 'pointer' : 'not-allowed',
                                        padding: '2px 8px'
                                    }}
                                >
                                    LINK
                                </button>
                            </div>
                        ))}
                        {activeExplorerTab === 'templates' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ padding: '10px', border: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt }}>
                                    <div style={{ color: THEME.accent, fontSize: '16px' }}>CORE GAMEPLAY PACK</div>
                                    <div style={{ color: THEME.textDim, fontSize: '13px', marginBottom: '8px' }}>Footsteps, jump, click, level-start music.</div>
                                    <button
                                        onClick={bootstrapTemplate}
                                        style={{
                                            border: `1px solid ${THEME.border}`,
                                            background: '#0c1019',
                                            color: THEME.accent,
                                            fontFamily: 'inherit',
                                            fontSize: '14px',
                                            cursor: 'pointer',
                                            padding: '2px 8px'
                                        }}
                                    >
                                        APPLY
                                    </button>
                                </div>
                                <div style={{ padding: '16px', textAlign: 'center', border: `1px dashed ${THEME.border}`, color: THEME.textMute }}>
                                    <CloudDownload size={28} style={{ margin: '0 auto 8px' }} />
                                    PRO CLOUD LIBRARY<br />
                                    <span style={{ fontSize: '12px' }}>[SYNC REQUIRED]</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ flexGrow: 1, background: THEME.bgDeep, padding: '24px', overflowY: 'auto' }}>
                    {selectedConfig && selectedEvent ? (
                        <div
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDraggingOver(true);
                            }}
                            onDragLeave={() => setIsDraggingOver(false)}
                            onDrop={handleDropOnEvent}
                            style={{
                                border: `1px solid ${THEME.border}`,
                                background: THEME.bgPanel,
                                boxShadow: '12px 12px 0 #000',
                                padding: '24px',
                                position: 'relative'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '24px' }}>
                                <div>
                                    <h1 style={{ margin: 0, color: THEME.accent, fontSize: '48px', letterSpacing: '-2px', textShadow: '3px 3px 0 #000' }}>{selectedEvent}</h1>
                                    <div style={{ marginTop: '6px', color: THEME.textDim, fontSize: '15px', letterSpacing: '1px' }}>
                                        ROUTE: {selectedConfig.group.toUpperCase()}_BUS | MODE: {selectedConfig.playback.mode.toUpperCase()}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => auditionEvent(selectedEvent)}
                                        style={{
                                            width: '44px',
                                            height: '44px',
                                            border: `1px solid ${THEME.accent}`,
                                            background: THEME.accentSoft,
                                            color: THEME.accent,
                                            cursor: 'pointer',
                                            boxShadow: THEME.retroOut
                                        }}
                                    >
                                        <Play size={20} />
                                    </button>
                                    <button
                                        style={{
                                            width: '44px',
                                            height: '44px',
                                            border: `1px solid ${THEME.border}`,
                                            background: THEME.bgPanelAlt,
                                            color: THEME.textMute,
                                            cursor: 'pointer',
                                            boxShadow: THEME.retroOut
                                        }}
                                    >
                                        <Square size={18} />
                                    </button>
                                </div>
                            </div>

                            <div style={{ 
                                border: `1px solid ${THEME.border}`, 
                                background: '#000', 
                                padding: '2px',
                                marginBottom: '24px',
                                position: 'relative',
                                boxShadow: THEME.retroIn
                            }}>
                                <CanvasWaveform clips={selectedConfig.clips} color={THEME.accent} />
                                <div style={{ position: 'absolute', top: '10px', left: '10px', color: THEME.textDim, fontSize: '12px', background: 'rgba(0,0,0,0.8)', padding: '2px 8px' }}>
                                    WAVEFORM_ANALYZER_v7
                                </div>
                                {isDraggingOver && (
                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255, 0, 0, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${THEME.accent}` }}>
                                        <div style={{ background: '#000', padding: '10px 20px', color: THEME.accent, fontWeight: 'bold' }}>DROP TO ATTACH</div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                <div style={{ border: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt, padding: '16px', boxShadow: THEME.retroIn }}>
                                    <div style={{ color: THEME.accent, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                                        <Layers size={16} /> SIGNAL VARIATIONS ({selectedConfig.clips.length})
                                    </div>
                                    <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {selectedConfig.clips.length === 0 && (
                                            <div style={{ color: THEME.textMute, fontSize: '14px', padding: '20px', textAlign: 'center', border: `1px dashed ${THEME.border}` }}>
                                                DRAG ASSETS HERE
                                            </div>
                                        )}
                                        {selectedConfig.clips.map((clip, idx) => (
                                            <div
                                                key={`${clip}_${idx}`}
                                                style={{
                                                    border: `1px solid ${THEME.border}`,
                                                    background: THEME.bgPanel,
                                                    padding: '10px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    boxShadow: '2px 2px 0 rgba(0,0,0,0.3)'
                                                }}
                                            >
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ color: THEME.textMain, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        <FileAudio size={13} style={{ marginRight: '8px', verticalAlign: 'middle', color: THEME.textDim }} />
                                                        {clip}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button onClick={() => auditionEvent(selectedEvent, clip)} style={{ width: '30px', height: '30px', border: `1px solid ${THEME.border}`, background: '#000', color: THEME.accent, cursor: 'pointer' }}><Play size={12} /></button>
                                                    <button onClick={() => removeClipFromEvent(selectedEvent, idx)} style={{ width: '30px', height: '30px', border: `1px solid ${THEME.border}`, background: '#000', color: THEME.danger, cursor: 'pointer' }}><Trash2 size={12} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ border: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt, padding: '16px', boxShadow: THEME.retroIn }}>
                                    <div style={{ color: THEME.accent, marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                                        <Sliders size={16} /> PLAYBACK PROPERTIES
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div style={{ gridColumn: '1 / span 2' }}>
                                            <label style={{ fontSize: '12px', color: THEME.textMute }}>PLAYBACK MODE</label>
                                            <select
                                                value={selectedConfig.playback.mode}
                                                onChange={e => updateEventField(selectedEvent, 'playback.mode', e.target.value)}
                                                style={{ height: '32px', fontSize: '14px', background: '#000', border: `1px solid ${THEME.border}`, width: '100%' }}
                                            >
                                                <option value="random">RANDOM_VARIATION</option>
                                                <option value="sequential">SEQUENTIAL_VFS</option>
                                                <option value="loop">CONTINUOUS_LOOP</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '12px', color: THEME.textMute }}>VOLUME {Math.round(selectedConfig.playback.volume * 100)}%</label>
                                            <input type="range" min="0" max="1.5" step="0.01" value={selectedConfig.playback.volume} onChange={e => updateEventField(selectedEvent, 'playback.volume', parseFloat(e.target.value))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '12px', color: THEME.textMute }}>COOLDOWN {selectedConfig.playback.cooldown}s</label>
                                            <input type="range" min="0" max="1" step="0.01" value={selectedConfig.playback.cooldown} onChange={e => updateEventField(selectedEvent, 'playback.cooldown', parseFloat(e.target.value))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '12px', color: THEME.textMute }}>VOL VAR {Math.round(selectedConfig.playback.volumeVar * 100)}%</label>
                                            <input type="range" min="0" max="0.5" step="0.01" value={selectedConfig.playback.volumeVar} onChange={e => updateEventField(selectedEvent, 'playback.volumeVar', parseFloat(e.target.value))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '12px', color: THEME.textMute }}>PITCH VAR {Math.round(selectedConfig.playback.pitchVar * 100)}%</label>
                                            <input type="range" min="0" max="0.5" step="0.01" value={selectedConfig.playback.pitchVar} onChange={e => updateEventField(selectedEvent, 'playback.pitchVar', parseFloat(e.target.value))} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ border: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt, padding: '16px', boxShadow: THEME.retroIn }}>
                                <div style={{ color: THEME.accent, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px' }}>
                                    <BarChart3 size={16} /> SIGNAL MONITOR
                                </div>
                                <div style={{ background: '#000', border: `1px solid ${THEME.border}`, padding: '4px' }}>
                                    <CanvasSpectrum isPlaying={true} color={THEME.accent} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            style={{
                                height: '100%',
                                border: `1px dashed ${THEME.border}`,
                                background: THEME.bgPanel,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: THEME.textMute,
                                fontSize: '24px',
                                letterSpacing: '1px'
                            }}
                        >
                            SELECT OR MAP AN EVENT TO START
                        </div>
                    )}
                </div>

                <div
                    style={{
                        width: '360px',
                        background: THEME.bgPanel,
                        borderLeft: `2px solid #000`,
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '-4px 0 10px rgba(0,0,0,0.2)'
                    }}
                >
                    <div
                        style={{
                            height: '40px',
                            padding: '0 15px',
                            borderBottom: `1px solid ${THEME.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            color: THEME.accent,
                            background: '#0b0d13',
                            fontWeight: 'bold',
                            letterSpacing: '1px'
                        }}
                    >
                        <span>SIGNAL_PROPERTIES</span>
                        <Settings2 size={15} />
                    </div>

                    {selectedConfig && selectedEvent ? (
                        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ border: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt, padding: '12px', boxShadow: THEME.retroIn }}>
                                <div style={{ color: THEME.textDim, marginBottom: '10px', fontSize: '13px', fontWeight: 'bold' }}>BUS_ROUTING</div>
                                <select
                                    value={selectedConfig.group}
                                    onChange={e => updateEventField(selectedEvent, 'group', e.target.value)}
                                    style={{ height: '34px', fontSize: '14px', background: '#000', border: `1px solid ${THEME.border}`, width: '100%' }}
                                >
                                    <option value="sfx">SFX_CORE_VFS</option>
                                    <option value="music">MUSIC_ORCHESTRA</option>
                                    <option value="ambience">AMBIENCE_ENV</option>
                                    <option value="voice">VOICE_LAYER_01</option>
                                </select>
                            </div>

                            <div style={{ border: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt, padding: '12px', boxShadow: THEME.retroIn }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: THEME.accent, fontSize: '14px', fontWeight: 'bold' }}>PRIORITY_DUCKING</span>
                                    <input
                                        type="checkbox"
                                        checked={selectedConfig.priority}
                                        onChange={e => updateEventField(selectedEvent, 'priority', e.target.checked)}
                                    />
                                </div>
                                <div style={{ marginTop: '8px', fontSize: '11px', color: THEME.textMute, lineHeight: '1.4' }}>
                                    WHEN ENABLED, THIS SIGNAL WILL REDUCE VOLUME OF OTHER BUSES UPON TRIGGER.
                                </div>
                            </div>

                            <div style={{ border: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt, padding: '12px', boxShadow: THEME.retroIn }}>
                                <div style={{ color: THEME.textDim, marginBottom: '10px', fontSize: '13px', fontWeight: 'bold' }}>FILTER_CHAIN</div>
                                <select
                                    value={selectedConfig.filter.type}
                                    onChange={e => updateEventField(selectedEvent, 'filter.type', e.target.value)}
                                    style={{ height: '32px', fontSize: '14px', marginBottom: '10px', background: '#000', border: `1px solid ${THEME.border}`, width: '100%' }}
                                >
                                    <option value="lowpass">LOW_PASS_CUTOFF</option>
                                    <option value="highpass">HIGH_PASS_CUTOFF</option>
                                    <option value="bandpass">BAND_PASS_PEAK</option>
                                </select>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: THEME.textMute, marginBottom: '4px' }}>
                                    <span>FREQ</span>
                                    <span style={{ color: THEME.accent }}>{selectedConfig.filter.freq}Hz</span>
                                </div>
                                <input
                                    type="range"
                                    min="100"
                                    max="20000"
                                    step="100"
                                    value={selectedConfig.filter.freq}
                                    onChange={e => updateEventField(selectedEvent, 'filter.freq', parseInt(e.target.value, 10))}
                                />
                            </div>

                            <div style={{ border: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt, padding: '12px', boxShadow: THEME.retroIn }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <div style={{ color: THEME.textDim, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                                        <Terminal size={14} /> TRIGGER_LOG
                                    </div>
                                    <button
                                        onClick={() => setTriggerHistory([])}
                                        style={{
                                            border: `1px solid ${THEME.border}`,
                                            background: '#000',
                                            color: THEME.textMute,
                                            fontFamily: 'inherit',
                                            fontSize: '11px',
                                            cursor: 'pointer',
                                            padding: '2px 8px'
                                        }}
                                    >
                                        CLEAR
                                    </button>
                                </div>
                                <div style={{ 
                                    maxHeight: '200px', 
                                    overflowY: 'auto', 
                                    border: `1px solid #000`, 
                                    background: '#000', 
                                    padding: '10px',
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    boxShadow: THEME.retroIn
                                }}>
                                    {triggerHistory.length === 0 && (
                                        <div style={{ color: '#333' }}>LISTENING_FOR_SIGNALS...</div>
                                    )}
                                    {triggerHistory.map(log => (
                                        <div key={log.id} style={{ borderBottom: '1px solid #1a1d26', paddingBottom: '6px', marginBottom: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', color: THEME.accent }}>
                                                <span>&gt; {log.name}</span>
                                                <span style={{ color: THEME.textMute, fontSize: '10px' }}>{log.time}</span>
                                            </div>
                                            {log.clip && <div style={{ color: THEME.textMute, fontSize: '10px', marginLeft: '12px' }}>SOURCE: {log.clip}</div>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ border: `1px solid ${THEME.border}`, background: THEME.bgPanelAlt, padding: '12px', boxShadow: THEME.retroIn }}>
                                <div style={{ color: THEME.textDim, marginBottom: '8px', fontSize: '13px', fontWeight: 'bold' }}>VFS_VALIDATION</div>
                                <div style={{ color: selectedConfig.clips.length > 0 ? THEME.ok : THEME.danger, fontSize: '13px' }}>
                                    {selectedConfig.clips.length > 0 ? 'STATUS: READY' : 'STATUS: NO_CLIPS_LINKED'}
                                </div>
                                <div style={{ color: THEME.textMute, fontSize: '11px', marginTop: '4px', lineHeight: '1.4' }}>
                                    {selectedConfig.playback.mode === 'loop'
                                        ? 'LOOP MODE DETECTED. ENSURE AT LEAST ONE SEAMLESS VARIATION IS PRESENT.'
                                        : 'BURST MODE DETECTED. RANDOMIZED PITCH/VOL VAR IS RECOMMENDED.'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '24px', color: THEME.textMute, textAlign: 'center' }}>
                            <BarChart3 size={50} style={{ marginBottom: '12px', opacity: 0.35 }} />
                            Select an event to inspect signal chain details.
                        </div>
                    )}
                </div>
            </div>

            <div style={{ height: '240px', borderTop: `2px solid #000`, background: THEME.bgPanelAlt, display: 'flex', flexDirection: 'column', boxShadow: '0 -4px 10px rgba(0,0,0,0.3)' }}>
                <div
                    style={{
                        height: '38px',
                        borderBottom: `1px solid ${THEME.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 16px',
                        color: THEME.accent,
                        background: '#0b0d13'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 'bold' }}>
                        <Sliders size={15} /> MASTER_MIX_STATION
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: THEME.textMute, fontSize: '12px', fontFamily: 'monospace' }}>
                        <Clock size={12} /> {new Date().toLocaleTimeString()}
                    </div>
                </div>

                <div style={{ flexGrow: 1, display: 'flex', gap: '12px', padding: '16px', overflowX: 'auto', background: THEME.bgDeep }}>
                    {busEntries.map(([busName, bus]) => {
                        const meterLevel = Math.max(0.04, Math.min(1, bus.gain + (Math.random() * 0.05)));
                        return (
                            <div
                                key={busName}
                                style={{
                                    minWidth: '130px',
                                    border: `1px solid ${busName === 'master' ? THEME.accent : THEME.border}`,
                                    background: THEME.bgPanel,
                                    padding: '10px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '10px',
                                    boxShadow: THEME.retroOut
                                }}
                            >
                                <div style={{ color: busName === 'master' ? THEME.accent : THEME.textDim, fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>
                                    {busName.toUpperCase()}
                                </div>
                                
                                <div style={{ 
                                    background: '#000', 
                                    padding: '4px', 
                                    border: `1px solid ${THEME.border}`,
                                    boxShadow: THEME.retroIn
                                }}>
                                    <CanvasMeter level={meterLevel} />
                                </div>

                                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: THEME.textMute }}>
                                        <span>GAIN</span>
                                        <span style={{ color: THEME.accent }}>{Math.round(bus.gain * 100)}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1.2"
                                        step="0.01"
                                        value={bus.gain}
                                        onChange={e => updateBus(busName, 'gain', parseFloat(e.target.value))}
                                        style={{ width: '100%', height: '4px' }}
                                    />
                                </div>
                                {busName !== 'master' && (
                                    <div style={{ width: '100%', display: 'flex', gap: '4px' }}>
                                        <button 
                                            onClick={() => updateBus(busName, 'ducking', !bus.ducking)}
                                            style={{
                                                flex: 1,
                                                fontSize: '10px',
                                                background: bus.ducking ? THEME.accent : '#000',
                                                color: bus.ducking ? '#000' : THEME.textMute,
                                                border: `1px solid ${THEME.border}`,
                                                cursor: 'pointer',
                                                padding: '2px 0'
                                            }}
                                        >
                                            DUCK
                                        </button>
                                        <select
                                            value={bus.parent || 'master'}
                                            onChange={e => updateBus(busName, 'parent', e.target.value)}
                                            style={{ flex: 2, height: '18px', fontSize: '10px', background: '#000', border: `1px solid ${THEME.border}`, color: THEME.textDim }}
                                        >
                                            {busEntries.map(([parentName]) => (
                                                <option key={parentName} value={parentName}>
                                                    {parentName.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AudioStudio;
