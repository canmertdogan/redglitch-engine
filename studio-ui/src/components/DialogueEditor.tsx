import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import { Save, Plus, Trash, MessageSquare, User, CornerDownRight, Play, Edit3, Copy, Search } from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';
import Toast, { ToastHandle } from './shared/Toast';

interface DialogueLine {
    characterId: string;
    text: string;
    choices?: { text: string; nextId?: string }[];
    nextId?: string;
}

interface Conversation {
    id: string;
    title: string;
    lines: DialogueLine[];
}

interface Character {
    id: string;
    name: string;
    color: string;
    sprite: string;
}

const DialogueEditor: React.FC = () => {
    const { isReady, emit, subscribe, projectState, sprites } = useStudio();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [previewLineIdx, setPreviewLineIdx] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const toastRef = useRef<ToastHandle>(null);

    useEffect(() => {
        if (isReady) {
            loadData();

            const unsubLoad = subscribe('dialogue:load', (event: any) => {
                if (event.data.dialogueId) {
                    const idx = conversations.findIndex(c => c.id === event.data.dialogueId);
                    if (idx >= 0) setCurrentIndex(idx);
                }
            });

            const unsubNpc = subscribe('npc:updated', () => {
                loadData(); // Resync characters if NPCs change
            });

            return () => {
                unsubLoad();
                unsubNpc();
            };
        }
    }, [isReady]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveToServer();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                duplicateConversation();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [conversations, currentIndex]);

    const loadData = async () => {
        try {
            const res = await fetch('/api/dialogues');
            if (res.ok) {
                const data = await res.json();
                setConversations(data.conversations?.length > 0 ? data.conversations : [getDefaultConversation()]);
                
                // Merge NPC definitions into characters
                let loadedChars = data.characters || [];
                if (!loadedChars.find((c: any) => c.id === 'hero')) {
                    loadedChars.unshift({ id: 'hero', name: 'Hero', color: '#3498db', sprite: 'player' });
                }

                try {
                    const nRes = await fetch('/api/npcs');
                    if (nRes.ok) {
                        const npcs = await nRes.json();
                        npcs.forEach((npc: any) => {
                            if (!loadedChars.find((c: any) => c.id === npc.id)) {
                                loadedChars.push({ id: npc.id, name: npc.name || npc.id, sprite: npc.sprite || 'player', color: '#ff0000' });
                            }
                        });
                    }
                } catch (e) {}

                setCharacters(loadedChars);
            }
        } catch (e) {
            setConversations([getDefaultConversation()]);
        }
    };

    const getDefaultConversation = (): Conversation => ({
        id: 'conv_' + Date.now().toString().slice(-4),
        title: 'New Conversation',
        lines: [{ characterId: 'hero', text: 'Hello world!' }]
    });

    const updateCurrentConv = (field: string, value: any) => {
        const newConvs = [...conversations];
        const conv = { ...newConvs[currentIndex] };
        
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

    const saveToServer = async () => {
        try {
            const payload = { characters, conversations };
            const res = await fetch('/api/dialogues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setIsDirty(false);
                toastRef.current?.show('DIALOGUES SAVED', 'success');
                emit('dialogue:saved_all', { count: conversations.length });
                if (projectState) {
                    const map: any = {};
                    conversations.forEach(c => map[c.id] = c);
                    projectState.set('dialogues', map);
                }
            }
        } catch (e) {
            toastRef.current?.show('SAVE FAILED', 'error');
        }
    };

    const duplicateConversation = () => {
        const current = conversations[currentIndex];
        const clone = { ...JSON.parse(JSON.stringify(current)), id: current.id + '_COPY' };
        setConversations([...conversations, clone]);
        setCurrentIndex(conversations.length);
        setIsDirty(true);
        toastRef.current?.show('CONVERSATION DUPLICATED', 'info');
    };

    const deleteConversation = () => {
        if (conversations.length <= 1) return;
        const id = conversations[currentIndex].id;
        setConversations(conversations.filter((_, i) => i !== currentIndex));
        setCurrentIndex(Math.max(0, currentIndex - 1));
        setIsDirty(true);
        setPreviewLineIdx(0);
        toastRef.current?.show(`DELETED ${id}`, 'info');
    };

    const addLine = () => {
        const conv = conversations[currentIndex];
        updateCurrentConv('lines', [...conv.lines, { characterId: 'hero', text: '' }]);
    };

    const addChoice = (lineIdx: number) => {
        const conv = conversations[currentIndex];
        const lines = [...conv.lines];
        const choices = lines[lineIdx].choices || [];
        lines[lineIdx].choices = [...choices, { text: 'New Choice', nextId: '' }];
        updateCurrentConv('lines', lines);
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
                <button className="tool-btn" onClick={() => { setConversations([...conversations, getDefaultConversation()]); setCurrentIndex(conversations.length); setIsDirty(true); }} title="New Conversation"><Plus size={16} /></button>
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
                    currentIndex={conversations.indexOf(filteredConversations[currentIndex])} 
                    onSelect={(idx) => { setCurrentIndex(conversations.indexOf(filteredConversations[idx])); setPreviewLineIdx(0); }}
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
                                            onChange={(e) => {
                                                const newLines = [...currentConv.lines];
                                                newLines[lIdx].characterId = e.target.value;
                                                updateCurrentConv('lines', newLines);
                                            }}
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
                                    onChange={(e) => {
                                        const newLines = [...currentConv.lines];
                                        newLines[lIdx].text = e.target.value;
                                        updateCurrentConv('lines', newLines);
                                    }}
                                    placeholder="Enter dialogue text..."
                                    style={{ background: '#080808', padding: '10px', border: '1px solid #111' }}
                                />

                                {/* CHOICES */}
                                <div style={{ marginTop: '10px', borderLeft: '2px solid #222', paddingLeft: '15px' }}>
                                    {line.choices?.map((choice, cIdx) => (
                                        <div key={cIdx} style={{ display: 'flex', gap: '10px', marginBottom: '5px', alignItems: 'center' }}>
                                            <CornerDownRight size={14} color="#444" />
                                            <input 
                                                type="text" 
                                                value={choice.text} 
                                                onChange={(e) => {
                                                    const newLines = [...currentConv.lines];
                                                    newLines[lIdx].choices![cIdx].text = e.target.value;
                                                    updateCurrentConv('lines', newLines);
                                                }}
                                                placeholder="Choice text..."
                                                style={{ fontSize: '0.9rem', flex: 2 }}
                                            />
                                            <input 
                                                type="text" 
                                                value={choice.nextId || ''} 
                                                onChange={(e) => {
                                                    const newLines = [...currentConv.lines];
                                                    newLines[lIdx].choices![cIdx].nextId = e.target.value;
                                                    updateCurrentConv('lines', newLines);
                                                }}
                                                placeholder="Next Script ID"
                                                style={{ flex: 1, fontSize: '0.8rem' }}
                                            />
                                            <button className="tool-btn small danger" onClick={() => {
                                                const newLines = [...currentConv.lines];
                                                newLines[lIdx].choices!.splice(cIdx, 1);
                                                updateCurrentConv('lines', newLines);
                                            }}>×</button>
                                        </div>
                                    ))}
                                    <button className="tool-btn" style={{ width: 'auto', padding: '2px 10px', fontSize: '0.8rem', marginTop: '5px' }} onClick={() => addChoice(lIdx)}>
                                        + ADD CHOICE
                                    </button>
                                </div>
                            </div>
                        ))}
                        <button className="tool-btn" style={{ width: '100%' }} onClick={addLine}>
                            <Plus size={14} style={{ marginRight: '5px' }} /> APPEND NEW LINE
                        </button>
                    </FormSection>
                </div>

                <div className="panel" style={{ width: '350px', borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
                    <div className="panel-header">PREVIEW BOX</div>
                    <div className="panel-content" style={{ justifyContent: 'center' }}>
                        <div style={{ background: '#000', border: '2px solid #333', minHeight: '180px', position: 'relative', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                             <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
                                <div style={{ 
                                    width: '48px', height: '48px', background: '#111', border: '1px solid #444', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px',
                                    color: activePreviewCharacter?.color || '#3498db'
                                }}>
                                    {activePreviewCharacter?.name?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div style={{ fontWeight: 'bold', color: activePreviewCharacter?.color || '#3498db', fontSize: '1.2rem' }}>
                                    {activePreviewCharacter?.name || 'UNKNOWN'}
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
