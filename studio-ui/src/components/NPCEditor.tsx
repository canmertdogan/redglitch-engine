import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Save, Plus, PlusCircle, Trash, User, Brain, MessageSquare, 
    Copy, Search, Play, Pause, ZoomIn, ZoomOut, Check, AlertTriangle, Scroll 
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';
import Toast, { ToastHandle } from './shared/Toast';

export interface NPC {
    id: string;
    name: string;
    type: string;
    dialogue?: string; // Legacy
    dialogueId?: string;
    questId?: string;
    interaction: {
        dialogue: string;
        range: number;
        questId?: string;
        giverQuestId?: string;
        turnInQuestId?: string;
    };
    stats: {
        speed: number;
        hp?: number;
        maxHp?: number;
        [key: string]: any;
    };
    behavior: {
        type: string;
        range: number;
        idleTime: number;
        script: string;
    };
    animations: {
        idle: { down: string; up: string; side: string; speed: number };
        walk: { down: string; up: string; side: string; speed: number };
        talk: { base: string; speed: number };
    };
}

export const STANDARD_NPC_SPRITES = [
    'player', 'npc_blacksmith', 'npc_farmer', 'npc_knight', 'npc_merchant',
    'npc_guard', 'npc_innkeeper', 'npc_alchemist', 'npc_villager_woman',
    'npc_old_man', 'npc_baker'
];

function makeUniqueCloneId(sourceId: string, existingIds: Set<string>): string {
    const base = sourceId.replace(/_COPY(?:_\d+)?$/, '') + '_COPY';
    let idx = 1;
    while (existingIds.has(`${base}_${idx}`)) idx++;
    return `${base}_${idx}`;
}

function resolveSpriteImageUrl(key: string): string | null {
    if (!key || (!key.includes('/') && !key.endsWith('.png'))) return null;
    if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:') || key.startsWith('/')) {
        return key;
    }
    if (key.startsWith('sprite-art/') || key.startsWith('assets/')) return '/' + key;
    return `/sprite-art/${key}`;
}

export const ensureNewSchema = (n: any): NPC => {
    const anim = n?.animations || {};
    const fallbackSprite =
        anim.idle?.down ||
        anim.idle?.sprite ||
        anim.idle?.base ||
        n?.sprite ||
        'player';

    const rawStats = typeof n?.stats === 'object' && n?.stats !== null ? n.stats : {};
    const hpVal = Number(rawStats.hp ?? n?.hp ?? 100) || 100;
    const speedVal = Number(rawStats.speed ?? n?.speed ?? 50) || 50;

    const dialogueVal = String(n?.interaction?.dialogue ?? n?.dialogueId ?? n?.dialogue ?? '');
    const questIdVal = String(n?.interaction?.questId ?? n?.questId ?? '');
    const giverQuestIdVal = String(n?.interaction?.giverQuestId ?? n?.giverQuestId ?? questIdVal ?? '');
    const turnInQuestIdVal = String(n?.interaction?.turnInQuestId ?? n?.turnInQuestId ?? '');

    return {
        id: String(n?.id || 'npc_' + Date.now().toString().slice(-4)),
        name: String(n?.name || n?.id || 'New Villager'),
        type: 'npc',
        dialogue: dialogueVal,
        dialogueId: dialogueVal,
        questId: questIdVal || undefined,
        stats: {
            ...rawStats,
            speed: speedVal,
            hp: hpVal
        },
        interaction: {
            dialogue: dialogueVal,
            range: Number(n?.interaction?.range ?? n?.range ?? 60) || 60,
            questId: questIdVal,
            giverQuestId: giverQuestIdVal,
            turnInQuestId: turnInQuestIdVal
        },
        behavior: {
            type: String(n?.behavior?.type || 'wander'),
            range: Number(n?.behavior?.range ?? 100) || 0,
            idleTime: Number(n?.behavior?.idleTime ?? 3.0) || 0,
            script: String(n?.behavior?.script || '')
        },
        animations: {
            idle: {
                down: anim.idle?.down || anim.idle?.sprite || fallbackSprite,
                up: anim.idle?.up || anim.idle?.sprite || fallbackSprite,
                side: anim.idle?.side || anim.idle?.sprite || fallbackSprite,
                speed: Number(anim.idle?.speed ?? 0.2) || 0.2
            },
            walk: {
                down: anim.walk?.down || anim.walk?.sprite || fallbackSprite,
                up: anim.walk?.up || anim.walk?.sprite || fallbackSprite,
                side: anim.walk?.side || anim.walk?.sprite || fallbackSprite,
                speed: Number(anim.walk?.speed ?? 0.15) || 0.15
            },
            talk: {
                base: anim.talk?.base || anim.talk?.sprite || fallbackSprite,
                speed: Number(anim.talk?.speed ?? 0.2) || 0.2
            }
        }
    };
};

const NPCEditor: React.FC = () => {
    const { isReady, sprites, emit, projectState, subscribe } = useStudio();
    const [npcs, setNpcs] = useState<NPC[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [templates, setTemplates] = useState<any[]>([]);
    const [availableBrains, setAvailableBrains] = useState<string[]>([]);
    const [availableDialogues, setAvailableDialogues] = useState<string[]>([]);
    const [availableQuests, setAvailableQuests] = useState<Array<{ id: string; title: string }>>([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    
    // Animation Preview State
    const [previewState, setPreviewState] = useState<'idle' | 'walk' | 'talk'>('idle');
    const [previewDir, setPreviewDir] = useState<'down' | 'up' | 'side'>('down');
    const [previewFrame, setPreviewFrame] = useState(0);
    const [previewZoom, setPreviewZoom] = useState(4);
    const [isPlaying, setIsPlaying] = useState(true);
    
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const toastRef = useRef<ToastHandle>(null);
    const npcsRef = useRef<NPC[]>([]);
    const isDirtyRef = useRef(false);
    const savingRef = useRef(false);
    const saveRef = useRef<() => Promise<void>>(async () => {});

    useEffect(() => { npcsRef.current = npcs; }, [npcs]);
    useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

    useEffect(() => {
        if (!isReady) return;
        loadNPCs();
        loadTemplates();
        loadBrains();
        loadDialogues();
        loadQuests();

        const unsubLoad = subscribe('npc:load', (event: any) => {
            const npcId = event?.data?.npcId;
            if (npcId) {
                const idx = npcsRef.current.findIndex(n => n.id === npcId);
                if (idx >= 0) setCurrentIndex(idx);
            }
        });
        const unsubSave = subscribe('system:global_save', () => {
            if (isDirtyRef.current) saveRef.current();
        });
        const handleSaveMessage = (e: MessageEvent) => {
            if (e.data?.type === 'redglitch:save-request' && (e.origin === window.location.origin || e.source === window.parent || e.source === window.top)) {
                if (isDirtyRef.current) saveRef.current();
            }
        };
        window.addEventListener('message', handleSaveMessage);

        return () => {
            unsubLoad();
            unsubSave();
            window.removeEventListener('message', handleSaveMessage);
        };
    }, [isReady, subscribe]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveToServer();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                duplicateNPC();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [npcs, currentIndex]);

    useEffect(() => {
        if (!isPlaying) return;
        const timer = setInterval(() => {
            setPreviewFrame(f => (f + 1) % 4);
        }, 200);
        return () => clearInterval(timer);
    }, [isPlaying]);

    useEffect(() => {
        renderPreview();
    }, [npcs, currentIndex, previewState, previewDir, previewFrame, previewZoom, sprites]);

    const loadNPCs = async (preserveId?: string) => {
        try {
            const res = await fetch('/api/npcs');
            if (res.ok) {
                const data = await res.json();
                const migrated = Array.isArray(data) ? data.map(ensureNewSchema) : [];
                const nextList = migrated.length > 0 ? migrated : [getDefaultNPC()];
                setNpcs(nextList);
                npcsRef.current = nextList;
                if (preserveId) {
                    const foundIdx = nextList.findIndex(n => n.id === preserveId);
                    if (foundIdx >= 0) setCurrentIndex(foundIdx);
                }
            } else {
                const def = [getDefaultNPC()];
                setNpcs(def);
                npcsRef.current = def;
            }
        } catch (e) {
            const def = [getDefaultNPC()];
            setNpcs(def);
            npcsRef.current = def;
        }
    };

    const loadTemplates = async () => {
        try {
            const res = await fetch('/api/templates/npc');
            if (res.ok) {
                const data = await res.json();
                const arr = Array.isArray(data)
                    ? data
                    : data && typeof data === 'object'
                        ? Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...(typeof val === 'object' ? val : {}) }))
                        : [];
                setTemplates(arr);
            }
        } catch (err) { console.warn("[studio-ui] swallowed error", err); }
    };

    const loadBrains = async () => {
        try {
            const res = await fetch('/api/brains/list');
            if (res.ok) {
                const data = await res.json();
                setAvailableBrains(Array.isArray(data) ? data : []);
            }
        } catch (err) { setAvailableBrains([]); }
    };

    const loadDialogues = async () => {
        try {
            const res = await fetch('/api/dialogues');
            if (res.ok) {
                const data = await res.json();
                const convs = Array.isArray(data?.conversations) ? data.conversations : (Array.isArray(data) ? data : []);
                setAvailableDialogues(convs.map((c: any) => String(c?.id || '')).filter(Boolean));
            }
        } catch (err) { console.warn("[studio-ui] failed loading dialogues", err); }
    };

    const loadQuests = async () => {
        try {
            const res = await fetch('/api/quests');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setAvailableQuests(data.map((q: any) => ({
                        id: String(q?.id || ''),
                        title: String(q?.title || q?.name || q?.id || '')
                    })).filter(q => Boolean(q.id)));
                }
            }
        } catch (err) { console.warn("[studio-ui] failed loading quests", err); }
    };

    const getDefaultNPC = (): NPC => ({
        id: 'npc_' + Date.now().toString().slice(-4),
        name: 'New Villager',
        type: 'npc',
        stats: { speed: 50, hp: 100 },
        interaction: { dialogue: '', range: 60, questId: '', giverQuestId: '', turnInQuestId: '' },
        behavior: { type: 'static', range: 0, idleTime: 0, script: '' },
        animations: {
            idle: { down: 'player', up: 'player', side: 'player', speed: 0.2 },
            walk: { down: 'player', up: 'player', side: 'player', speed: 0.15 },
            talk: { base: 'player', speed: 0.2 }
        }
    });

    const updateCurrentNPC = (path: string, value: any) => {
        const newNpcs = [...npcs];
        if (!newNpcs[currentIndex]) return;
        const npc = { ...newNpcs[currentIndex] };
        
        const keys = path.split('.');
        let current: any = npc;
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = { ...current[keys[i]] };
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        
        newNpcs[currentIndex] = npc;
        setNpcs(newNpcs);
        npcsRef.current = newNpcs;
        setIsDirty(true);
        
        // Broadcast to engine & studio tools
        emit('npc:updated', { npcId: npc.id, npc, roster: newNpcs });
    };

    const saveToServer = async () => {
        if (savingRef.current) return;
        savingRef.current = true;
        try {
            const payload = npcsRef.current;
            const res = await fetch('/api/npcs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setIsDirty(false);
                toastRef.current?.show('DATABASE SAVED', 'success');
                emit('npc:saved_all', { count: payload.length });
                if (projectState) {
                    const map: any = {};
                    payload.forEach(n => map[n.id] = n);
                    projectState.set('npcs', map);
                }
                const currentId = npcsRef.current[currentIndex]?.id;
                await loadNPCs(currentId);
                const activeNpc = npcsRef.current.find(n => n.id === currentId) || npcsRef.current[0];
                if (activeNpc) {
                    emit('npc:updated', { npcId: activeNpc.id, npc: activeNpc, roster: npcsRef.current });
                }
            } else {
                let errMsg = `SAVE FAILED (${res.status})`;
                try {
                    const errData = await res.json();
                    if (errData?.error) errMsg = errData.error;
                } catch {}
                toastRef.current?.show(errMsg, 'error');
            }
        } catch (e: any) {
            toastRef.current?.show(e?.message || 'SAVE FAILED', 'error');
        } finally {
            savingRef.current = false;
        }
    };
    saveRef.current = saveToServer;

    const duplicateNPC = () => {
        const current = npcs[currentIndex];
        if (!current) return;
        const clone = JSON.parse(JSON.stringify(current));
        clone.id = makeUniqueCloneId(current.id, new Set(npcs.map(n => n.id)));
        clone.name = `${current.name || current.id} (COPY)`;
        const updatedRoster = [...npcs, clone];
        setNpcs(updatedRoster);
        npcsRef.current = updatedRoster;
        setCurrentIndex(npcs.length);
        setIsDirty(true);
        toastRef.current?.show('NPC DUPLICATED', 'info');
        emit('npc:updated', { npcId: clone.id, npc: clone, roster: updatedRoster });
    };

    const deleteNPC = () => {
        if (npcs.length <= 1) {
            toastRef.current?.show('CANNOT DELETE LAST NPC', 'info');
            return;
        }
        const deletedNpc = npcs[currentIndex];
        const newNpcs = npcs.filter((_, i) => i !== currentIndex);
        setNpcs(newNpcs);
        npcsRef.current = newNpcs;
        const nextIdx = Math.max(0, currentIndex - 1);
        setCurrentIndex(nextIdx);
        setIsDirty(true);
        toastRef.current?.show(`DELETED ${deletedNpc.id}`, 'info');
        emit('npc:updated', { npcId: deletedNpc.id, npc: newNpcs[nextIdx], roster: newNpcs });
    };

    const openQuestTool = (questId?: string) => {
        emit('studio:open_tool', { toolId: 'quest', params: { id: questId } });
    };

    const openDialogueEditor = () => {
        const current = npcs[currentIndex];
        if (!current) return;
        const dialogueId = current.interaction.dialogue || `${current.id}_dialogue`;
        if (!current.interaction.dialogue) {
            updateCurrentNPC('interaction.dialogue', dialogueId);
        }
        emit('dialogue:load', { dialogueId });
        emit('studio:open_tool', {
            toolId: 'dialogue',
            params: { id: dialogueId }
        });
        const parentWin = window.parent as any;
        if (parentWin && parentWin !== window) {
            if (typeof parentWin.openDialogueEditor === 'function') {
                parentWin.openDialogueEditor(dialogueId);
                return;
            }
            if (typeof parentWin.openWindow === 'function' && Array.isArray(parentWin.tools)) {
                const tool = parentWin.tools.find((t: any) => t.id === 'dialogue');
                if (tool) {
                    parentWin.openWindow({ ...tool, src: `${tool.src}?id=${encodeURIComponent(dialogueId)}` });
                    return;
                }
            }
        }
        window.open(`/studio-dist/dialogue_editor.html?id=${encodeURIComponent(dialogueId)}`, '_blank');
    };

    const openBrainEditor = () => {
        const current = npcs[currentIndex];
        if (!current) return;
        const brainName = current.behavior.script || `${current.id}_ai`;
        emit('studio:open_tool', {
            toolId: 'behavior',
            src: `../behavior_editor.html?script=${encodeURIComponent(brainName)}`,
            title: 'AI Brains'
        });
        const parentWin = window.parent as any;
        if (parentWin && parentWin !== window) {
            if (typeof parentWin.openBehaviorEditor === 'function') {
                parentWin.openBehaviorEditor(brainName);
                return;
            }
            if (typeof parentWin.openWindow === 'function' && Array.isArray(parentWin.tools)) {
                const tool = parentWin.tools.find((t: any) => t.id === 'behavior');
                if (tool) {
                    parentWin.openWindow({ ...tool, src: `${tool.src}?script=${encodeURIComponent(brainName)}` });
                    return;
                }
            }
        }
        window.open(`/behavior_editor.html?script=${encodeURIComponent(brainName)}`, '_blank');
    };

    const filteredNPCs = useMemo(() => {
        if (!searchQuery) return npcs;
        return npcs.filter(n => 
            n.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
            n.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [npcs, searchQuery]);

    const renderPreview = () => {
        const canvas = previewCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const npc = npcs[currentIndex];
        if (!npc) return;

        let spriteKey = '';
        if (previewState === 'talk') spriteKey = npc.animations?.talk?.base || npc.animations?.idle?.down || 'player';
        else spriteKey = (npc.animations as any)?.[previewState]?.[previewDir] || npc.animations?.idle?.down || 'player';

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        const sprite = sprites ? sprites[spriteKey] : null;
        if (sprite) {
            const scale = previewZoom;
            const offsetX = (canvas.width - sprite.width * scale) / 2;
            const offsetY = (canvas.height - sprite.height * scale) / 2;

            sprite.data.forEach((row: string, y: number) => {
                for (let x = 0; x < row.length; x++) {
                    const color = sprite.palette[row[x]];
                    if (color) {
                        ctx.fillStyle = color;
                        ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
                    }
                }
            });
            return;
        }

        const imgUrl = resolveSpriteImageUrl(spriteKey);
        if (imgUrl) {
            const img = new Image();
            img.onload = () => {
                if (!previewCanvasRef.current) return;
                const c = previewCanvasRef.current.getContext('2d');
                if (!c) return;
                c.clearRect(0, 0, canvas.width, canvas.height);
                c.imageSmoothingEnabled = false;
                const drawW = Math.min(canvas.width * 0.85, (img.width || 32) * previewZoom);
                const drawH = Math.min(canvas.height * 0.85, (img.height || 32) * previewZoom);
                c.drawImage(img, (canvas.width - drawW) / 2, (canvas.height - drawH) / 2, drawW, drawH);
            };
            img.src = imgUrl;
        }
    };

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>INITIALIZING STUDIO KERNEL...</div>;

    const addNewNPC = () => {
        const newNpc = getDefaultNPC();
        const updatedRoster = [...npcs, newNpc];
        setNpcs(updatedRoster);
        npcsRef.current = updatedRoster;
        setCurrentIndex(npcs.length);
        setIsDirty(true);
        emit('npc:updated', { npcId: newNpc.id, npc: newNpc, roster: updatedRoster });
    };

    const currentNPC = npcs[currentIndex] || getDefaultNPC();
    const availableSpriteKeys = useMemo(() => {
        const studioSprites = sprites ? Object.keys(sprites) : [];
        return Array.from(new Set([...STANDARD_NPC_SPRITES, ...studioSprites]));
    }, [sprites]);

    const renderSpriteSelect = (value: string, onChange: (val: string) => void) => {
        const options = Array.from(new Set([value, ...availableSpriteKeys])).filter(Boolean);
        return (
            <select value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1 }}>
                {options.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
        );
    };

    const DIR_LABELS: Record<'down' | 'up' | 'side', string> = {
        down: 'South (Down)',
        up: 'North (Up)',
        side: 'Side (East/West)'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <Toast ref={toastRef} />
            
            {/* MENUBAR */}
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <i className="fas fa-user-friends" style={{ marginRight: '8px' }}></i> NPC STUDIO v2.1
                </div>
                <div style={{ fontSize: '0.75rem', color: isDirty ? 'var(--accent)' : '#444' }}>
                    {isDirty ? '● UNSAVED CHANGES' : '● SYNCED'}
                </div>
            </div>

            {/* TOOLBAR */}
            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" onClick={saveToServer} title="Save (Ctrl+S)"><Save size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => setShowTemplateModal(true)} title="New from Template"><PlusCircle size={16} /></button>
                <button className="tool-btn" onClick={addNewNPC} title="New NPC"><Plus size={16} /></button>
                <button className="tool-btn" onClick={duplicateNPC} title="Duplicate (Ctrl+D)"><Copy size={16} /></button>
                <button className="tool-btn" style={{ color: '#e74c3c' }} onClick={deleteNPC} title="Delete"><Trash size={16} /></button>
                
                <div style={{ marginLeft: 'auto', display: 'flex', position: 'relative', width: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#444' }} />
                    <input 
                        type="text" 
                        placeholder="Filter list..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '30px', fontSize: '0.85rem', height: '30px' }}
                    />
                </div>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                <Sidebar 
                    title="CHARACTERS" 
                    items={filteredNPCs} 
                    currentIndex={filteredNPCs.indexOf(npcs[currentIndex])} 
                    onSelect={(idx) => {
                        const actualIdx = npcs.indexOf(filteredNPCs[idx]);
                        if (actualIdx >= 0) setCurrentIndex(actualIdx);
                    }}
                    renderItem={(item, active) => (
                        <div style={{
                            padding: '10px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #1a1a1a',
                            color: active ? 'var(--accent)' : '#888',
                            background: active ? 'rgba(255, 0, 0, 0.05)' : 'transparent',
                            borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent'
                        }}>
                            <div style={{ fontSize: '1rem' }}>{item.name || 'Unnamed NPC'}</div>
                            <div style={{ fontSize: '0.7rem', color: '#444' }}>{item.id}</div>
                        </div>
                    )}
                />

                {/* MAIN EDITOR */}
                <div style={{ flexGrow: 1, background: 'var(--bg-canvas)', overflowY: 'auto', padding: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                        <div>
                            <FormSection title="Identity">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Registry ID</label>
                                        <input type="text" value={currentNPC.id} onChange={(e) => updateCurrentNPC('id', e.target.value)} />
                                    </div>
                                    <div>
                                        <label>Display Name</label>
                                        <input type="text" value={currentNPC.name} onChange={(e) => updateCurrentNPC('name', e.target.value)} />
                                    </div>
                                </div>
                                <label>Dialogue Script</label>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <input 
                                        type="text" 
                                        list="npc-dialogue-list"
                                        value={currentNPC.interaction.dialogue} 
                                        onChange={(e) => updateCurrentNPC('interaction.dialogue', e.target.value)} 
                                        style={{ flex: 1 }} 
                                    />
                                    <datalist id="npc-dialogue-list">
                                        {availableDialogues.map(d => <option key={d} value={d} />)}
                                    </datalist>
                                    <button className="tool-btn" onClick={openDialogueEditor} title="Open Dialogue Editor"><MessageSquare size={14} /></button>
                                </div>
                            </FormSection>

                            <FormSection title="Quest Linkage">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '10px' }}>
                                    <div>
                                        <label>Giver Quest</label>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <select 
                                                value={currentNPC.interaction.questId || currentNPC.interaction.giverQuestId || ''} 
                                                onChange={(e) => {
                                                    updateCurrentNPC('interaction.questId', e.target.value);
                                                    updateCurrentNPC('interaction.giverQuestId', e.target.value);
                                                }}
                                                style={{ flex: 1 }}
                                            >
                                                <option value="">None</option>
                                                {availableQuests.map(q => <option key={q.id} value={q.id}>{q.title} ({q.id})</option>)}
                                            </select>
                                            <button 
                                                className="tool-btn" 
                                                onClick={() => openQuestTool(currentNPC.interaction.questId || currentNPC.interaction.giverQuestId)} 
                                                title="Open Quest Tool"
                                            >
                                                <Scroll size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label>Turn-in Quest</label>
                                        <select 
                                            value={currentNPC.interaction.turnInQuestId || ''} 
                                            onChange={(e) => updateCurrentNPC('interaction.turnInQuestId', e.target.value)}
                                            style={{ width: '100%' }}
                                        >
                                            <option value="">None</option>
                                            {availableQuests.map(q => <option key={q.id} value={q.id}>{q.title} ({q.id})</option>)}
                                        </select>
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="Stats & Logic">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Hit Points (HP)</label>
                                        <input type="number" value={currentNPC.stats.hp ?? 100} onChange={(e) => updateCurrentNPC('stats.hp', parseInt(e.target.value, 10) || 1)} />
                                    </div>
                                    <div>
                                        <label>Walk Speed</label>
                                        <input type="number" value={currentNPC.stats.speed} onChange={(e) => updateCurrentNPC('stats.speed', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                </div>
                                <div style={{ marginBottom: '15px' }}>
                                    <label>Interaction Range</label>
                                    <input type="number" value={currentNPC.interaction.range} onChange={(e) => updateCurrentNPC('interaction.range', parseInt(e.target.value, 10) || 0)} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Behavior Type</label>
                                        <select value={currentNPC.behavior.type} onChange={(e) => updateCurrentNPC('behavior.type', e.target.value)}>
                                            <option value="static">Static (Stationary)</option>
                                            <option value="wander">Wander (Random)</option>
                                            <option value="patrol">Patrol (Path)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label>AI Brain</label>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <select value={currentNPC.behavior.script} onChange={(e) => updateCurrentNPC('behavior.script', e.target.value)} style={{ flex: 1 }}>
                                                <option value="">None</option>
                                                {availableBrains.map(b => <option key={b} value={b}>{b}</option>)}
                                            </select>
                                            <button className="tool-btn" onClick={openBrainEditor} title="Open AI Brain Editor"><Brain size={14} /></button>
                                        </div>
                                    </div>
                                </div>
                            </FormSection>
                        </div>

                        <FormSection title="Animations (Directional)">
                            {(['idle', 'walk'] as const).map(state => (
                                <div key={state} style={{ marginBottom: '15px' }}>
                                    <label style={{ color: 'var(--accent)' }}>{state.toUpperCase()} SPRITES</label>
                                    {(['down', 'up', 'side'] as const).map(dir => (
                                        <div key={dir} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ width: '130px', fontSize: '0.75rem', color: '#888' }}>{DIR_LABELS[dir]}</span>
                                            {renderSpriteSelect(currentNPC.animations[state][dir], (val) => updateCurrentNPC(`animations.${state}.${dir}`, val))}
                                        </div>
                                    ))}
                                </div>
                            ))}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <span style={{ width: '130px', fontSize: '0.75rem', color: '#888' }}>Talk (Base)</span>
                                {renderSpriteSelect(currentNPC.animations.talk.base, (val) => updateCurrentNPC('animations.talk.base', val))}
                            </div>
                        </FormSection>
                    </div>
                </div>

                {/* PREVIEW PANEL */}
                <div className="panel" style={{ width: '350px', borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
                    <div className="panel-header">LIVE PREVIEW</div>
                    <div className="panel-content">
                        <div style={{ 
                            width: '100%', aspectRatio: '1', background: '#000', border: '1px solid #333', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                            backgroundImage: 'radial-gradient(#111 1px, transparent 1px)', backgroundSize: '15px 15px'
                        }}>
                            <canvas ref={previewCanvasRef} width={256} height={256} style={{ width: '256px', height: '256px', imageRendering: 'pixelated' }} />
                            
                            <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', gap: '5px' }}>
                                <button className="tool-btn small" onClick={() => setPreviewZoom(z => Math.max(1, z-1))}><ZoomOut size={12}/></button>
                                <button className="tool-btn small" onClick={() => setPreviewZoom(z => Math.min(8, z+1))}><ZoomIn size={12}/></button>
                            </div>
                            
                            <div style={{ position: 'absolute', bottom: '10px', right: '10px' }}>
                                <button className="tool-btn small" onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause size={12}/> : <Play size={12}/>}</button>
                            </div>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px', padding: '0 15px' }}>
                            <div>
                                <label>State</label>
                                <select value={previewState} onChange={(e) => setPreviewState(e.target.value as any)}>
                                    <option value="idle">Idle</option>
                                    <option value="walk">Walk</option>
                                    <option value="talk">Talk</option>
                                </select>
                            </div>
                            <div>
                                <label>Facing</label>
                                <select value={previewDir} onChange={(e) => setPreviewDir(e.target.value as any)}>
                                    <option value="down">Front (Down)</option>
                                    <option value="up">Back (Up)</option>
                                    <option value="side">Profile (Side)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* TEMPLATE MODAL */}
            {showTemplateModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="panel" style={{ width: '450px', height: 'auto', maxHeight: '80vh', border: '2px solid var(--accent)', boxShadow: '0 0 50px rgba(0,0,0,1)' }}>
                        <div className="panel-header">
                            FORGE FROM MODEL
                            <button className="tool-btn" onClick={() => setShowTemplateModal(false)}>×</button>
                        </div>
                        <div className="panel-content" style={{ padding: '15px' }}>
                            {(Array.isArray(templates) ? templates : []).map(t => (
                                <div key={t.id} className="template-item" onClick={() => {
                                    const { components, sprite: tplSprite, ...restData } = (t.data || {});
                                    const statsComp = Array.isArray(components) ? components.find((c: any) => c?.type === 'Stats') : null;
                                    const scriptComp = Array.isArray(components) ? components.find((c: any) => c?.type === 'Script') : null;
                                    const base = getDefaultNPC();
                                    const spriteChoice = tplSprite || base.animations.idle.down;
                                    const templateCandidate = {
                                        ...base,
                                        ...restData,
                                        id: makeUniqueCloneId(`${t.id}_${Date.now().toString().slice(-4)}`, new Set(npcs.map(n => n.id))),
                                        name: t.name || restData.name || t.id,
                                        stats: {
                                            ...base.stats,
                                            ...(restData.stats || {}),
                                            ...(statsComp?.speed !== undefined ? { speed: statsComp.speed } : {})
                                        },
                                        behavior: {
                                            ...base.behavior,
                                            ...(restData.behavior || {}),
                                            ...(scriptComp?.scriptId ? { script: scriptComp.scriptId } : {})
                                        },
                                        animations: restData.animations || {
                                            idle: { down: spriteChoice, up: spriteChoice, side: spriteChoice, speed: 0.2 },
                                            walk: { down: spriteChoice, up: spriteChoice, side: spriteChoice, speed: 0.15 },
                                            talk: { base: spriteChoice, speed: 0.2 }
                                        }
                                    };
                                    const newNpc = ensureNewSchema(templateCandidate);
                                    const updatedRoster = [...npcs, newNpc];
                                    setNpcs(updatedRoster);
                                    npcsRef.current = updatedRoster;
                                    setCurrentIndex(npcs.length);
                                    setShowTemplateModal(false);
                                    setIsDirty(true);
                                    emit('npc:updated', { npcId: newNpc.id, npc: newNpc, roster: updatedRoster });
                                }}
                                style={{ padding: '15px', margin: '8px 0', background: '#111', border: '1px solid #333', cursor: 'pointer', borderRadius: '4px' }}
                                >
                                    <div style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '1.1rem' }}>{t.name?.toUpperCase() ?? ''}</div>
                                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>{t.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NPCEditor;
