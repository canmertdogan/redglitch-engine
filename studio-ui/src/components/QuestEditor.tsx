import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Save, Plus, PlusCircle, Trash, Scroll, List, Gift, User, 
    ShieldCheck, Copy, Search, Play, Pause, AlertCircle, 
    BookOpen, Check, Target, ChevronRight, X
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';
import Toast, { ToastHandle } from './shared/Toast';

interface QuestStage {
    id: string;
    text: string;
    type: 'talk' | 'kill' | 'collect' | 'location' | 'interact';
    target: string;
    count: number;
}

interface Quest {
    id: string;
    title: string;
    description: string;
    type: 'main' | 'side' | 'tutorial';
    giverId: string;
    autoComplete: boolean;
    prerequisites: string[];
    rewards: {
        xp: number;
        gold: number;
        items: string[]; // Array of Item IDs
    };
    objectives: QuestStage[];
}

const QuestEditor: React.FC = () => {
    const { isReady, emit, subscribe, projectState } = useStudio();
    const [quests, setQuests] = useState<Quest[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [availableNPCs, setAvailableNPCs] = useState<any[]>([]);
    const [availableItems, setAvailableItems] = useState<any[]>([]);
    const [isDirty, setIsDirty] = useState(false);
    const toastRef = useRef<ToastHandle>(null);

    useEffect(() => {
        if (isReady) {
            loadData();
            
            const unsub = subscribe('quest:load', (event: any) => {
                if (event.data.questId) {
                    const idx = quests.findIndex(q => q.id === event.data.questId);
                    if (idx >= 0) setCurrentIndex(idx);
                }
            });
            return unsub;
        }
    }, [isReady]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveToServer();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [quests, currentIndex]);

    const loadData = async () => {
        try {
            const [qRes, nRes, iRes] = await Promise.all([
                fetch('/api/quests'),
                fetch('/api/npcs'),
                fetch('/api/items')
            ]);
            
            if (qRes.ok) {
                const data = await qRes.json();
                setQuests(data.length > 0 ? data : [getDefaultQuest()]);
            }
            if (nRes.ok) setAvailableNPCs(await nRes.json());
            if (iRes.ok) setAvailableItems(await iRes.json());
            
        } catch (e) {
            setQuests([getDefaultQuest()]);
        }
    };

    const getDefaultQuest = (): Quest => ({
        id: 'quest_' + Date.now().toString().slice(-4),
        title: 'New Quest',
        description: 'Describe the journey...',
        type: 'side',
        giverId: '',
        autoComplete: false,
        prerequisites: [],
        rewards: { xp: 50, gold: 10, items: [] },
        objectives: [{ text: 'Talk to the giver', type: 'talk', target: '', count: 1 }]
    });

    const updateQuest = (field: string, value: any) => {
        const newQuests = [...quests];
        const quest = { ...newQuests[currentIndex] };
        
        const keys = field.split('.');
        let current: any = quest;
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = Array.isArray(current[keys[i]]) ? [...current[keys[i]]] : { ...current[keys[i]] };
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        
        newQuests[currentIndex] = quest;
        setQuests(newQuests);
        setIsDirty(true);
        emit('quest:updated', { questId: quest.id, quest });
    };

    const saveToServer = async () => {
        try {
            const res = await fetch('/api/quests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quests)
            });
            if (res.ok) {
                setIsDirty(false);
                toastRef.current?.show('JOURNAL UPDATED', 'success');
                emit('quest:saved_all', { count: quests.length });
                if (projectState) {
                    const map: any = {};
                    quests.forEach(q => map[q.id] = q);
                    projectState.set('quests', map);
                }
            }
        } catch (e) {
            toastRef.current?.show('SAVE FAILED', 'error');
        }
    };

    const addStage = () => {
        const quest = quests[currentIndex];
        updateQuest('objectives', [...quest.objectives, { text: '', type: 'kill', target: '', count: 1 }]);
    };

    const removeStage = (idx: number) => {
        const quest = quests[currentIndex];
        const newStages = quest.objectives.filter((_, i) => i !== idx);
        updateQuest('objectives', newStages);
    };

    const togglePrereq = (qId: string) => {
        const quest = quests[currentIndex];
        const next = [...(quest.prerequisites || [])];
        const idx = next.indexOf(qId);
        if (idx >= 0) next.splice(idx, 1);
        else next.push(qId);
        updateQuest('prerequisites', next);
    };

    const filteredQuests = useMemo(() => {
        if (!searchQuery) return quests;
        return quests.filter(q => 
            q.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
            q.title.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [quests, searchQuery]);

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>LOADING QUEST SYSTEMS...</div>;

    const currentQuest = quests[currentIndex] || getDefaultQuest();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <Toast ref={toastRef} />
            
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <Scroll size={16} style={{ marginRight: '8px', display: 'inline' }} /> QUEST STUDIO v2.1
                </div>
                <div style={{ fontSize: '0.75rem', color: isDirty ? 'var(--accent)' : '#444' }}>
                    {isDirty ? '● UNSAVED CHANGES' : '● SYNCED'}
                </div>
            </div>

            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" onClick={saveToServer} title="Save (Ctrl+S)"><Save size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => { setQuests([...quests, getDefaultQuest()]); setCurrentIndex(quests.length); }} title="New Quest"><Plus size={16} /></button>
                <button className="tool-btn" onClick={() => {
                    const clone = JSON.parse(JSON.stringify(currentQuest));
                    clone.id += '_COPY';
                    setQuests([...quests, clone]);
                    setCurrentIndex(quests.length);
                    setIsDirty(true);
                }} title="Duplicate"><Copy size={16} /></button>
                <button className="tool-btn" style={{ color: '#e74c3c' }} title="Delete"><Trash size={16} /></button>
                
                <div style={{ marginLeft: 'auto', display: 'flex', position: 'relative', width: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#444' }} />
                    <input 
                        type="text" 
                        placeholder="Search quests..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '30px', fontSize: '0.85rem', height: '30px' }}
                    />
                </div>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                <Sidebar 
                    title="ACTIVE QUESTS" 
                    items={filteredQuests} 
                    currentIndex={quests.indexOf(filteredQuests[currentIndex])} 
                    onSelect={(idx) => setCurrentIndex(quests.indexOf(filteredQuests[idx]))}
                    renderItem={(q, active) => (
                        <div style={{
                            padding: '10px', cursor: 'pointer', borderBottom: '1px solid #1a1a1a',
                            color: active ? 'var(--accent)' : '#888',
                            background: active ? 'rgba(255, 0, 0, 0.05)' : 'transparent',
                            borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent'
                        }}>
                            <div style={{ fontSize: '0.9rem' }}>{q.title.toUpperCase() || 'UNNAMED'}</div>
                            <div style={{ fontSize: '0.65rem', color: '#444' }}>{q.id} ({q.type})</div>
                        </div>
                    )}
                />

                <div style={{ flexGrow: 1, background: 'var(--bg-canvas)', overflowY: 'auto', padding: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <FormSection title="Quest Identity">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Registry ID</label>
                                        <input type="text" value={currentQuest.id} onChange={(e) => updateQuest('id', e.target.value)} />
                                    </div>
                                    <div>
                                        <label>Display Title</label>
                                        <input type="text" value={currentQuest.title} onChange={(e) => updateQuest('title', e.target.value)} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Quest Type</label>
                                        <select value={currentQuest.type} onChange={(e) => updateQuest('type', e.target.value)}>
                                            <option value="main">Main Story</option>
                                            <option value="side">Side Quest</option>
                                            <option value="tutorial">Tutorial</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label>Quest Giver (NPC)</label>
                                        <select value={currentQuest.giverId} onChange={(e) => updateQuest('giverId', e.target.value)}>
                                            <option value="">No Giver (Auto-start)</option>
                                            {availableNPCs.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <label>Journal Description</label>
                                <textarea rows={4} value={currentQuest.description} onChange={(e) => updateQuest('description', e.target.value)} />
                            </FormSection>

                            <FormSection title="Objectives & Steps">
                                {currentQuest.objectives?.map((stage, idx) => (
                                    <div key={idx} style={{ background: '#000', border: '1px solid #222', padding: '15px', marginBottom: '15px', borderRadius: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                            <span style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 'bold' }}>STEP #{idx + 1}</span>
                                            <Trash size={14} style={{ color: '#e74c3c', cursor: 'pointer' }} onClick={() => removeStage(idx)} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 80px', gap: '10px', marginBottom: '10px' }}>
                                            <select value={stage.type} onChange={(e) => {
                                                const next = [...currentQuest.objectives];
                                                next[idx].type = e.target.value as any;
                                                updateQuest('objectives', next);
                                            }}>
                                                <option value="talk">Talk To</option>
                                                <option value="kill">Exterminate</option>
                                                <option value="collect">Acquire</option>
                                                <option value="location">Reach Area</option>
                                                <option value="interact">Manipulate</option>
                                            </select>
                                            <input type="text" placeholder="Target ID" value={stage.target} onChange={(e) => {
                                                const next = [...currentQuest.objectives];
                                                next[idx].target = e.target.value;
                                                updateQuest('objectives', next);
                                            }} />
                                            <input type="number" value={stage.count} onChange={(e) => {
                                                const next = [...currentQuest.objectives];
                                                next[idx].count = parseInt(e.target.value);
                                                updateQuest('objectives', next);
                                            }} />
                                        </div>
                                        <input type="text" placeholder="Journal Instruction (e.g. 'Speak with the Elder')" value={stage.text} onChange={(e) => {
                                            const next = [...currentQuest.objectives];
                                            next[idx].text = e.target.value;
                                            updateQuest('objectives', next);
                                        }} />
                                    </div>
                                ))}
                                <button className="tool-btn" style={{ width: '100%', gap: '10px' }} onClick={addStage}>
                                    <PlusCircle size={16} /> ADD OBJECTIVE
                                </button>
                            </FormSection>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <FormSection title="Prerequisites">
                                <label>Required Quests</label>
                                <div style={{ background: '#000', border: '1px solid #111', maxHeight: '150px', overflowY: 'auto', padding: '10px' }}>
                                    {quests.map(q => q.id !== currentQuest.id && (
                                        <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={currentQuest.prerequisites?.includes(q.id)} 
                                                onChange={() => togglePrereq(q.id)}
                                                style={{ width: '16px' }}
                                            />
                                            <span style={{ fontSize: '0.85rem', color: currentQuest.prerequisites?.includes(q.id) ? '#fff' : '#444' }}>{q.title}</span>
                                        </div>
                                    ))}
                                </div>
                            </FormSection>

                            <FormSection title="Completion Rewards">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>XP Bonus</label>
                                        <input type="number" value={currentQuest.rewards.xp} onChange={(e) => updateQuest('rewards.xp', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label>Gold Reward</label>
                                        <input type="number" value={currentQuest.rewards.gold} onChange={(e) => updateQuest('rewards.gold', parseInt(e.target.value))} />
                                    </div>
                                </div>
                                <label>Bonus Items</label>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <select style={{ flex: 1 }} onChange={(e) => {
                                        if (e.target.value) {
                                            updateQuest('rewards.items', [...currentQuest.rewards.items, e.target.value]);
                                            e.target.value = '';
                                        }
                                    }}>
                                        <option value="">-- Add Reward Item --</option>
                                        {availableItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
                                    {currentQuest.rewards.items?.map((itemId, idx) => (
                                        <div key={idx} style={{ background: '#111', border: '1px solid #333', padding: '2px 10px', fontSize: '0.75rem', borderRadius: '15px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            {itemId}
                                            <X size={10} style={{ cursor: 'pointer', color: '#e74c3c' }} onClick={() => {
                                                const next = [...currentQuest.rewards.items];
                                                next.splice(idx, 1);
                                                updateQuest('rewards.items', next);
                                            }} />
                                        </div>
                                    ))}
                                </div>
                            </FormSection>

                            <FormSection title="Automation">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={currentQuest.autoComplete} 
                                        onChange={(e) => updateQuest('autoComplete', e.target.checked)}
                                        style={{ width: '20px' }}
                                    />
                                    <label style={{ marginBottom: 0 }}>AUTO-COMPLETE ON STEPS FINISHED</label>
                                </div>
                            </FormSection>
                        </div>
                    </div>
                </div>

                {/* PREVIEW */}
                <div className="panel" style={{ width: '350px', borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
                    <div className="panel-header">JOURNAL PREVIEW</div>
                    <div className="panel-content">
                        <div style={{ background: '#0a0a0f', border: '2px solid #333', padding: '25px', position: 'relative' }}>
                            <div style={{ 
                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                                opacity: 0.03, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg, #fff, #fff 1px, transparent 1px, transparent 2px)',
                                backgroundSize: '100% 2px'
                            }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                                <div style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '1.4rem', lineHeight: 1.1 }}>{currentQuest.title.toUpperCase()}</div>
                                <div style={{ background: 'var(--accent)', color: '#000', fontSize: '0.6rem', padding: '2px 6px', fontWeight: 'bold' }}>{currentQuest.type.toUpperCase()}</div>
                            </div>
                            <div style={{ color: '#888', fontSize: '0.9rem', fontStyle: 'italic', marginBottom: '20px' }}>"{currentQuest.description}"</div>
                            
                            <div style={{ borderTop: '1px solid #222', paddingTop: '15px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#444', marginBottom: '10px', letterSpacing: '1px' }}>OBJECTIVES:</div>
                                {currentQuest.objectives?.map((s, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px', color: '#fff', fontSize: '0.95rem' }}>
                                        <Target size={14} style={{ color: 'var(--accent)', marginTop: '4px', flexShrink: 0 }} />
                                        <span>{s.text || '...'}</span>
                                    </div>
                                ))}
                            </div>

                            <div style={{ borderTop: '1px solid #222', marginTop: '20px', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.75rem', color: '#444', letterSpacing: '1px' }}>REWARDS:</div>
                                <div style={{ display: 'flex', gap: '15px' }}>
                                    <span style={{ color: '#2ecc71', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px' }}><ShieldCheck size={14}/> {currentQuest.rewards.xp}</span>
                                    <span style={{ color: '#ff0000', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px' }}><Gift size={14}/> {currentQuest.rewards.gold}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuestEditor;
