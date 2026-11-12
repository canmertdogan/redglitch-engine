import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import { Save, Plus, Trash, MessageSquare, User, CornerDownRight, Play, Edit3, Copy, Search } from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';
import Toast, { ToastHandle } from './shared/Toast';

export interface DialogueChoice {
    text: string;
    nextId?: string;
    nextScript?: string;
    action?: 'none' | 'accept_quest' | 'complete_quest' | 'close' | string;
    questId?: string;
    condition?: {
        type: 'variable' | 'flag' | 'item' | string;
        key: string;
        operator?: '==' | '!=' | '>' | '>=' | '<' | '<=' | string;
        value: any;
    };
}

export interface DialogueLine {
    id?: string;
    characterId: string;
    text: string;
    choices?: DialogueChoice[];
    nextId?: string;
}

export interface Conversation {
    id: string;
    title: string;
    lines: DialogueLine[];
}

export interface Character {
    id: string;
    name: string;
    color: string;
    sprite: string;
}

// The engine stores conversations as { nodes: [...] } with
// speaker/text/choices[{ text, nextScript }]. This editor works on a flat
// `lines` model — normalize on load, denormalize on save, preserving conditions and actions.
export const normConversation = (c: any): Conversation => {
    const rawLines = Array.isArray(c?.lines) ? c.lines
        : Array.isArray(c?.nodes) ? c.nodes
        : [];
    return {
        ...c,
        id: String(c?.id ?? `conv_${Date.now()}`),
        title: c?.title ?? String(c?.id ?? 'Conversation'),
        lines: rawLines.map((n: any, idx: number) => ({
            id: n.id ? String(n.id) : (n.nodeId ? String(n.nodeId) : `line_${idx}`),
            characterId: n.characterId ?? n.speaker ?? 'hero',
            text: n.text ?? '',
            nextId: n.nextId ? String(n.nextId) : undefined,
            choices: (Array.isArray(n.choices) ? n.choices : []).map((ch: any) => ({
                text: ch.text ?? '',
                nextId: ch.nextId ?? ch.nextScript ?? '',
                nextScript: ch.nextScript ?? ch.nextId ?? '',
                action: ch.action ?? 'none',
                questId: ch.questId ?? '',
                condition: ch.condition && typeof ch.condition === 'object' ? { ...ch.condition } : undefined,
            })),
        })),
    };
};
export const ensureNewSchema = normConversation;

export const denormConversation = (c: Conversation): any => {
    const { lines, ...rest } = c as any;
    return {
        ...rest,
        nodes: c.lines.map(l => ({
            ...(l.id ? { id: l.id } : {}),
            speaker: l.characterId,
            text: l.text,
            ...(l.nextId ? { nextId: l.nextId } : {}),
            choices: (l.choices || []).map(ch => ({
                text: ch.text,
                nextScript: ch.nextId ?? ch.nextScript ?? '',
                ...(ch.action && ch.action !== 'none' ? { action: ch.action } : {}),
                ...(ch.questId ? { questId: ch.questId } : {}),
                ...(ch.condition ? { condition: ch.condition } : {}),
            })),
        })),
    };
};

export const getNpcPortraitSprite = (npc: any): string =>
    npc?.portrait || npc?.portraitSprite || npc?.animations?.idle?.down || npc?.sprite || 'player';

const mergeNpcsIntoCharacters = (baseChars: Character[], npcs: any[]): Character[] => {
    const merged = [...baseChars];
    if (!merged.find(c => c.id === 'hero')) {
        merged.unshift({ id: 'hero', name: 'Hero', color: '#3498db', sprite: 'player' });
    }
    npcs.forEach((npc: any) => {
        if (!npc?.id) return;
        const portraitSprite = getNpcPortraitSprite(npc);
        const existingIdx = merged.findIndex(c => c.id === npc.id);
        if (existingIdx >= 0) {
            merged[existingIdx] = {
                ...merged[existingIdx],
                name: npc.name || merged[existingIdx].name || npc.id,
                sprite: portraitSprite || merged[existingIdx].sprite || 'player',
            };
        } else {
            merged.push({
                id: npc.id,
                name: npc.name || npc.id,
                sprite: portraitSprite,
                color: '#ff0000',
            });
        }
    });
    return merged;
};

const generateUniqueCopyId = (baseId: string, existingIds: Set<string>): string => {
    const stem = baseId.replace(/_COPY(?:_\d+)?$/, '');
    let index = 1;
    let candidate = `${stem}_COPY_${index}`;
    while (existingIds.has(candidate)) {
        index += 1;
        candidate = `${stem}_COPY_${index}`;
    }
    return candidate;
};

const DialogueEditor: React.FC = () => {
    const { isReady, emit, subscribe, projectState } = useStudio();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [previewLineIdx, setPreviewLineIdx] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const toastRef = useRef<ToastHandle>(null);

    // Always-current refs so EventBus subscriptions, shortcuts, and global save
    // never read stale closures captured at mount time.
    const conversationsRef = useRef<Conversation[]>([]);
    const charactersRef = useRef<Character[]>([]);
    const isDirtyRef = useRef(false);
    const savingRef = useRef(false);
    const pendingCharSyncRef = useRef(false);
    const saveRef = useRef<() => Promise<boolean>>(async () => false);
    const duplicateRef = useRef<() => void>(() => {});

    useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
    useEffect(() => { charactersRef.current = characters; }, [characters]);
    useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

    const syncCharactersOnly = async () => {
        try {
            const nRes = await fetch('/api/npcs');
            if (!nRes.ok) return;
            const npcs = await nRes.json();
            if (!Array.isArray(npcs)) return;
            setCharacters(prev => {
                const next = mergeNpcsIntoCharacters(prev, npcs);
                charactersRef.current = next;
                return next;
            });
        } catch (err) {
            console.warn('[studio-ui] failed syncing NPCs into dialogue characters', err);
        }
    };

    useEffect(() => {
        if (!isReady) return;

        loadData();

        const unsubLoad = subscribe('dialogue:load', (event: any) => {
            const targetId = event?.data?.dialogueId;
            if (targetId) {
                const idx = conversationsRef.current.findIndex(c => c.id === targetId);
                if (idx >= 0) {
                    setCurrentIndex(idx);
                    setPreviewLineIdx(0);
                }
            }
        });

        const unsubNpc = subscribe('npc:updated', (event: any) => {
            const updatedNpc = event?.data?.npc || (event?.data?.id ? event?.data : undefined);
            if (updatedNpc?.id) {
                setCharacters(prev => {
                    const next = mergeNpcsIntoCharacters(prev, [updatedNpc]);
                    charactersRef.current = next;
                    return next;
                });
                return;
            }
            if (isDirtyRef.current) {
                pendingCharSyncRef.current = true;
                return;
            }
            syncCharactersOnly();
        });

        const unsubNpcSaved = subscribe('npc:saved_all', () => {
            if (isDirtyRef.current) {
                pendingCharSyncRef.current = true;
                return;
            }
            syncCharactersOnly();
        });

        const unsubGlobalSave = subscribe('system:global_save', () => {
            if (isDirtyRef.current) saveRef.current();
        });

        const unsubProjectSwitched = subscribe('project:switched', () => {
            loadData();
        });
        const unsubProjectSwitch = subscribe('project:switch', () => {
            loadData();
        });

        const onWindowMessage = (e: MessageEvent) => {
            if (e.origin !== window.location.origin && e.origin !== 'null') return;
            if (e.data?.type === 'redglitch:save-request' && isDirtyRef.current) {
                saveRef.current();
            }
        };
        window.addEventListener('message', onWindowMessage);

        return () => {
            unsubLoad();
            unsubNpc();
            unsubNpcSaved();
            unsubGlobalSave();
            unsubProjectSwitched();
            unsubProjectSwitch();
            window.removeEventListener('message', onWindowMessage);
        };
    }, [isReady]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveRef.current();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                duplicateRef.current();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const getDefaultConversation = (existingIds?: Set<string>): Conversation => {
        let candidate = 'conv_' + Date.now().toString().slice(-4);
        if (existingIds && existingIds.has(candidate)) {
            let n = 1;
            while (existingIds.has(`${candidate}_${n}`)) n += 1;
            candidate = `${candidate}_${n}`;
        }
        return {
            id: candidate,
            title: 'New Conversation',
            lines: [{ characterId: 'hero', text: 'Hello world!' }]
        };
    };

    const loadData = async (preserveId?: string) => {
        try {
            const res = await fetch('/api/dialogues');
            if (res.ok) {
                const data = await res.json();
                const rawConvs = Array.isArray(data?.conversations)
                    ? data.conversations
                    : (Array.isArray(data) ? data : []);
                const normalizedConvs = rawConvs.length > 0 ? rawConvs.map(normConversation) : [getDefaultConversation()];
                setConversations(normalizedConvs);
                conversationsRef.current = normalizedConvs;

                const requestedId = preserveId || new URLSearchParams(window.location.search).get('id');
                if (requestedId) {
                    const matchedIdx = normalizedConvs.findIndex(c => c.id === requestedId);
                    if (matchedIdx >= 0) {
                        setCurrentIndex(matchedIdx);
                        setPreviewLineIdx(0);
                    }
                }

                // Merge NPC definitions into characters using directional/default portrait extraction
                let loadedChars: Character[] = Array.isArray(data?.characters) ? [...data.characters] : [];
                let npcs: any[] = [];
                try {
                    const nRes = await fetch('/api/npcs');
                    if (nRes.ok) {
                        const rawNpcs = await nRes.json();
                        if (Array.isArray(rawNpcs)) npcs = rawNpcs;
                    }
                } catch (err) {
                    console.warn('[studio-ui] failed loading NPCs', err);
                }

                loadedChars = mergeNpcsIntoCharacters(loadedChars, npcs);
                setCharacters(loadedChars);
                charactersRef.current = loadedChars;
            }
        } catch (e) {
            const fallback = [getDefaultConversation()];
            setConversations(fallback);
            conversationsRef.current = fallback;
        }
    };

    const updateCurrentConv = (field: string, value: any) => {
        const newConvs = [...conversations];
        const base = newConvs[currentIndex];
        if (!base) return;
        const conv = { ...base };

        const keys = field.split('.');
        let current: any = conv;
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = Array.isArray(current[keys[i]]) ? [...current[keys[i]]] : { ...current[keys[i]] };
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;

        newConvs[currentIndex] = conv;
        setConversations(newConvs);
        setIsDirty(true);
        emit('dialogue:updated', { dialogueId: conv.id, dialogue: conv });
    };

    const saveToServer = async (): Promise<boolean> => {
        if (savingRef.current) return false;
        savingRef.current = true;
        try {
            const latestConvs = conversationsRef.current;
            const latestChars = charactersRef.current;
            const payload = { characters: latestChars, conversations: latestConvs.map(denormConversation) };
            const res = await fetch('/api/dialogues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                let errMsg = `HTTP ${res.status}`;
                try {
                    const errBody = await res.json();
                    if (errBody?.error) errMsg = errBody.error;
                } catch { /* ignore non-JSON error body */ }
                toastRef.current?.show(`SAVE FAILED: ${errMsg}`, 'error');
                return false;
            }
            setIsDirty(false);
            isDirtyRef.current = false;
            toastRef.current?.show('DIALOGUES SAVED', 'success');
            emit('dialogue:saved_all', { count: latestConvs.length });
            if (projectState) {
                const map: any = {};
                latestConvs.forEach(c => { map[c.id] = denormConversation(c); });
                projectState.set('dialogues', map);
            }
            const currentId = conversationsRef.current[currentIndex]?.id;
            await loadData(currentId);
            if (pendingCharSyncRef.current) {
                pendingCharSyncRef.current = false;
                syncCharactersOnly();
            }
            return true;
        } catch (e: any) {
            toastRef.current?.show(`SAVE FAILED: ${e?.message || 'Network error'}`, 'error');
            return false;
        } finally {
            savingRef.current = false;
        }
    };
    saveRef.current = saveToServer;

    const duplicateConversation = () => {
        const current = conversations[currentIndex];
        if (!current) return;
        const newId = generateUniqueCopyId(current.id, new Set(conversations.map(c => c.id)));
        const clone = { ...JSON.parse(JSON.stringify(current)), id: newId };
        setConversations([...conversations, clone]);
        setCurrentIndex(conversations.length);
        setPreviewLineIdx(0);
        setIsDirty(true);
        toastRef.current?.show(`CONVERSATION DUPLICATED AS ${newId}`, 'info');
    };
    duplicateRef.current = duplicateConversation;

    const deleteConversation = () => {
        if (conversations.length <= 1) {
            toastRef.current?.show('CANNOT DELETE LAST CONVERSATION', 'info');
            return;
        }
        const id = conversations[currentIndex].id;
        const nextConvs = conversations.filter((_, i) => i !== currentIndex);
        setConversations(nextConvs);
        conversationsRef.current = nextConvs;
        setCurrentIndex(Math.max(0, currentIndex - 1));
        setIsDirty(true);
        setPreviewLineIdx(0);
        toastRef.current?.show(`DELETED ${id}`, 'info');
    };

    const addLine = () => {
        const conv = conversations[currentIndex];
        if (!conv) return;
        updateCurrentConv('lines', [...conv.lines, { characterId: 'hero', text: '' }]);
    };

    const updateLine = (lineIdx: number, updater: (line: DialogueLine) => DialogueLine) => {
        const conv = conversations[currentIndex];
        if (!conv) return;
        const lines = conv.lines.map((l, idx) => (idx === lineIdx ? updater(l) : l));
        updateCurrentConv('lines', lines);
    };

    const addChoice = (lineIdx: number) => {
        updateLine(lineIdx, line => ({
            ...line,
            choices: [...(line.choices || []), { text: 'New Choice', nextId: '' }]
        }));
    };

    const filteredConversations = useMemo(() => {
        if (!searchQuery) return conversations;
        return conversations.filter(c => 
            c.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
            c.title.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [conversations, searchQuery]);

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>BOOTING DIALOGUE ENGINE...</div>;

    const currentConv = conversations[currentIndex] || getDefaultConversation();
    const activePreviewCharacter = characters.find(c => c.id === currentConv.lines[previewLineIdx]?.characterId);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <Toast ref={toastRef} />
            
            {/* MENUBAR */}
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between' }}>
                <div style={{ color: '#3498db', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <MessageSquare size={16} style={{ marginRight: '8px', display: 'inline' }} /> DIALOGUE STUDIO v2.1
                </div>
                <div style={{ fontSize: '0.75rem', color: isDirty ? '#3498db' : '#444' }}>
                    {isDirty ? '● UNSAVED CHANGES' : '● SYNCED'}
                </div>
            </div>

            {/* TOOLBAR */}
            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" onClick={saveToServer} title="Save (Ctrl+S)"><Save size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => { const created = getDefaultConversation(new Set(conversations.map(c => c.id))); setConversations([...conversations, created]); setCurrentIndex(conversations.length); setPreviewLineIdx(0); setIsDirty(true); }} title="New Conversation"><Plus size={16} /></button>
                <button className="tool-btn" onClick={duplicateConversation} title="Duplicate"><Copy size={16} /></button>
                <button className="tool-btn" style={{ color: '#e74c3c' }} onClick={deleteConversation} title="Delete"><Trash size={16} /></button>
                
                <div style={{ marginLeft: 'auto', display: 'flex', position: 'relative', width: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#444' }} />
                    <input 
                        type="text" 
                        placeholder="Search dialogs..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '30px', fontSize: '0.85rem', height: '30px' }}
                    />
                </div>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                <Sidebar 
                    title="CONVERSATIONS" 
                    items={filteredConversations} 
                    currentIndex={filteredConversations.indexOf(conversations[currentIndex])} 
                    onSelect={(idx) => {
                        const realIdx = conversations.indexOf(filteredConversations[idx]);
                        if (realIdx >= 0) {
                            setCurrentIndex(realIdx);
                            setPreviewLineIdx(0);
                        }
                    }}
                    renderItem={(c, active) => (
                        <div style={{
                            padding: '10px', cursor: 'pointer', borderBottom: '1px solid #1a1a1a',
                            color: active ? '#3498db' : '#888',
                            background: active ? 'rgba(52, 152, 219, 0.05)' : 'transparent',
                            borderLeft: active ? '3px solid #3498db' : '3px solid transparent'
                        }}>
                            <div style={{ fontSize: '0.9rem' }}>{c.title || 'Unnamed Conversation'}</div>
                            <div style={{ fontSize: '0.65rem', color: '#444' }}>{c.id}</div>
                        </div>
                    )}
                />

                <div style={{ flexGrow: 1, background: 'var(--bg-canvas)', overflowY: 'auto', padding: '20px' }}>
                    <FormSection title="Conversation Config">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px' }}>
                            <div>
                                <label>Conv ID</label>
                                <input type="text" value={currentConv.id} onChange={(e) => updateCurrentConv('id', e.target.value)} />
                            </div>
                            <div>
                                <label>Internal Title</label>
                                <input type="text" value={currentConv.title} onChange={(e) => updateCurrentConv('title', e.target.value)} />
                            </div>
                        </div>
                    </FormSection>

                    <FormSection title="Dialogue Script">
                        {currentConv.lines.map((line, lIdx) => (
                            <div key={lIdx} style={{ background: '#000', border: '1px solid #222', padding: '15px', marginBottom: '15px', borderRadius: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <select 
                                            value={line.characterId} 
                                            onChange={(e) => updateLine(lIdx, prev => ({ ...prev, characterId: e.target.value }))}
                                            style={{ width: '150px', border: 'none', background: '#111' }}
                                        >
                                            {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                        <span style={{ color: '#444', fontSize: '0.8rem' }}>LINE #{lIdx + 1}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button className="tool-btn small" onClick={() => setPreviewLineIdx(lIdx)} title="Preview this line"><Play size={12} /></button>
                                        <Trash size={14} style={{ color: '#e74c3c', cursor: 'pointer', marginTop: '2px' }} onClick={() => {
                                            const newLines = currentConv.lines.filter((_, i) => i !== lIdx);
                                            updateCurrentConv('lines', newLines);
                                            if (previewLineIdx >= newLines.length) setPreviewLineIdx(Math.max(0, newLines.length - 1));
                                        }} />
                                    </div>
                                </div>
                                
                                <textarea 
                                    rows={2} 
                                    value={line.text} 
                                    onChange={(e) => updateLine(lIdx, prev => ({ ...prev, text: e.target.value }))}
                                    placeholder="Enter dialogue text..."
                                    style={{ background: '#080808', padding: '10px', border: '1px solid #111' }}
                                />

                                {/* CHOICES */}
                                <div style={{ marginTop: '10px', borderLeft: '2px solid #222', paddingLeft: '15px' }}>
                                    {line.choices?.map((choice, cIdx) => (
                                        <div key={cIdx} style={{ marginBottom: '8px', background: '#0a0a0a', padding: '6px', borderRadius: '4px', border: '1px solid #1a1a1a' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <CornerDownRight size={14} color="#444" />
                                                <input 
                                                    type="text" 
                                                    value={choice.text} 
                                                    onChange={(e) => updateLine(lIdx, prev => ({
                                                        ...prev,
                                                        choices: (prev.choices || []).map((ch, idx) => idx === cIdx ? { ...ch, text: e.target.value } : ch)
                                                    }))}
                                                    placeholder="Choice text..."
                                                    style={{ fontSize: '0.85rem', flex: 2 }}
                                                />
                                                <input 
                                                    type="text" 
                                                    list="conversation-ids"
                                                    value={choice.nextId || ''} 
                                                    onChange={(e) => updateLine(lIdx, prev => ({
                                                        ...prev,
                                                        choices: (prev.choices || []).map((ch, idx) => idx === cIdx ? { ...ch, nextId: e.target.value } : ch)
                                                    }))}
                                                    placeholder="Next Script ID"
                                                    style={{ flex: 1.2, fontSize: '0.8rem' }}
                                                />
                                                <select
                                                    value={choice.action || 'none'}
                                                    onChange={(e) => updateLine(lIdx, prev => ({
                                                        ...prev,
                                                        choices: (prev.choices || []).map((ch, idx) => idx === cIdx ? { ...ch, action: e.target.value as any } : ch)
                                                    }))}
                                                    style={{ fontSize: '0.75rem', width: '105px' }}
                                                >
                                                    <option value="none">No Action</option>
                                                    <option value="accept_quest">Accept Quest</option>
                                                    <option value="complete_quest">Complete Quest</option>
                                                    <option value="close">Close</option>
                                                </select>
                                                {(choice.action === 'accept_quest' || choice.action === 'complete_quest') && (
                                                    <input 
                                                        type="text" 
                                                        placeholder="Quest ID" 
                                                        value={choice.questId || ''} 
                                                        onChange={(e) => updateLine(lIdx, prev => ({
                                                            ...prev,
                                                            choices: (prev.choices || []).map((ch, idx) => idx === cIdx ? { ...ch, questId: e.target.value } : ch)
                                                        }))}
                                                        style={{ fontSize: '0.75rem', width: '80px' }}
                                                    />
                                                )}
                                                <button className="tool-btn small danger" onClick={() => updateLine(lIdx, prev => ({
                                                    ...prev,
                                                    choices: (prev.choices || []).filter((_, idx) => idx !== cIdx)
                                                }))}>×</button>
                                            </div>

                                            {/* Choice Condition */}
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '5px', paddingLeft: '22px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.7rem', color: '#666' }}>Condition:</span>
                                                <select 
                                                    value={choice.condition?.type || ''} 
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        updateLine(lIdx, prev => ({
                                                            ...prev,
                                                            choices: (prev.choices || []).map((ch, idx) => idx === cIdx ? {
                                                                ...ch,
                                                                condition: val ? { type: val, key: ch.condition?.key || '', operator: ch.condition?.operator || '==', value: ch.condition?.value ?? true } : undefined
                                                            } : ch)
                                                        }));
                                                    }}
                                                    style={{ fontSize: '0.75rem', width: '85px' }}
                                                >
                                                    <option value="">None</option>
                                                    <option value="variable">Variable</option>
                                                    <option value="flag">Flag</option>
                                                    <option value="item">Item</option>
                                                </select>
                                                {choice.condition && (
                                                    <>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Key" 
                                                            value={choice.condition.key || ''} 
                                                            onChange={(e) => updateLine(lIdx, prev => ({
                                                                ...prev,
                                                                choices: (prev.choices || []).map((ch, idx) => idx === cIdx ? {
                                                                    ...ch,
                                                                    condition: { ...ch.condition!, key: e.target.value }
                                                                } : ch)
                                                            }))}
                                                            style={{ fontSize: '0.75rem', width: '80px' }}
                                                        />
                                                        <select 
                                                            value={choice.condition.operator || '=='} 
                                                            onChange={(e) => updateLine(lIdx, prev => ({
                                                                ...prev,
                                                                choices: (prev.choices || []).map((ch, idx) => idx === cIdx ? {
                                                                    ...ch,
                                                                    condition: { ...ch.condition!, operator: e.target.value as any }
                                                                } : ch)
                                                            }))}
                                                            style={{ fontSize: '0.75rem', width: '50px' }}
                                                        >
                                                            <option value="==">==</option>
                                                            <option value="!=">!=</option>
                                                            <option value=">">&gt;</option>
                                                            <option value=">=">&gt;=</option>
                                                            <option value="<">&lt;</option>
                                                            <option value="<=">&lt;=</option>
                                                        </select>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Value" 
                                                            value={String(choice.condition.value ?? '')} 
                                                            onChange={(e) => updateLine(lIdx, prev => ({
                                                                ...prev,
                                                                choices: (prev.choices || []).map((ch, idx) => idx === cIdx ? {
                                                                    ...ch,
                                                                    condition: { ...ch.condition!, value: e.target.value }
                                                                } : ch)
                                                            }))}
                                                            style={{ fontSize: '0.75rem', width: '70px' }}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <button className="tool-btn" style={{ width: 'auto', padding: '2px 10px', fontSize: '0.8rem', marginTop: '5px' }} onClick={() => addChoice(lIdx)}>
                                        + ADD CHOICE
                                    </button>
                                </div>

                                {(!line.choices || line.choices.length === 0) && (
                                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#666' }}>Next Script / Node ID:</span>
                                        <input 
                                            type="text" 
                                            list="conversation-ids" 
                                            placeholder="Next Conversation / Script ID (Optional)" 
                                            value={line.nextId || ''} 
                                            onChange={(e) => updateLine(lIdx, prev => ({ ...prev, nextId: e.target.value || undefined }))} 
                                            style={{ flex: 1, fontSize: '0.8rem' }}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                        <datalist id="conversation-ids">
                            {conversations.map(c => <option key={c.id} value={c.id}>{c.title || c.id}</option>)}
                        </datalist>
                        <button className="tool-btn" style={{ width: '100%' }} onClick={addLine}>
                            <Plus size={14} style={{ marginRight: '5px' }} /> APPEND NEW LINE
                        </button>
                    </FormSection>
                </div>

                <div className="panel" style={{ width: '350px', borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
                    <div className="panel-header">PREVIEW BOX</div>
                    <div className="panel-content" style={{ justifyContent: 'center' }}>
                        <div style={{ background: '#000', border: '2px solid #333', minHeight: '180px', position: 'relative', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                             <div style={{ display: 'flex', gap: '15px', marginBottom: '10px', alignItems: 'center' }}>
                                <div
                                    title={activePreviewCharacter?.sprite || 'player'}
                                    style={{ 
                                        width: '48px', height: '48px', background: '#111', border: '1px solid #444', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
                                        color: activePreviewCharacter?.color || '#3498db', overflow: 'hidden', flexShrink: 0
                                    }}
                                >
                                    {activePreviewCharacter?.sprite && (activePreviewCharacter.sprite.startsWith('/') || /\.(png|jpe?g|webp|gif)$/i.test(activePreviewCharacter.sprite)) ? (
                                        <img
                                            src={activePreviewCharacter.sprite.startsWith('/') ? activePreviewCharacter.sprite : `/${activePreviewCharacter.sprite}`}
                                            alt={activePreviewCharacter.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
                                        />
                                    ) : (
                                        activePreviewCharacter?.name?.[0]?.toUpperCase() || '?'
                                    )}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 'bold', color: activePreviewCharacter?.color || '#3498db', fontSize: '1.2rem' }}>
                                        {activePreviewCharacter?.name || 'UNKNOWN'}
                                    </div>
                                    <div style={{ fontSize: '0.65rem', color: '#555' }}>
                                        {activePreviewCharacter?.sprite || 'player'}
                                    </div>
                                </div>
                             </div>
                             <div style={{ flexGrow: 1, fontSize: '1rem', color: '#fff', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                {currentConv.lines[previewLineIdx]?.text || '...'}
                             </div>
                             
                             {currentConv.lines[previewLineIdx]?.choices && currentConv.lines[previewLineIdx].choices!.length > 0 && (
                                 <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                     {currentConv.lines[previewLineIdx].choices!.map((c, i) => (
                                         <div key={i} style={{ background: 'rgba(52, 152, 219, 0.2)', border: '1px solid #3498db', padding: '5px 10px', color: '#fff', fontSize: '0.85rem', cursor: 'pointer' }}>
                                             ► {c.text}
                                         </div>
                                     ))}
                                 </div>
                             )}

                             <div style={{ position: 'absolute', bottom: '10px', right: '10px' }}>
                                <button className="tool-btn" onClick={() => setPreviewLineIdx((previewLineIdx + 1) % Math.max(1, currentConv.lines.length))}>
                                    <Play size={12} />
                                </button>
                             </div>
                        </div>
                        <div style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', marginTop: '10px' }}>
                            LIVE CONVERSATION EMULATOR
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DialogueEditor;
