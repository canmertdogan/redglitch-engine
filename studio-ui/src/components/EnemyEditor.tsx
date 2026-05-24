import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Save, Plus, PlusCircle, Trash, Skull, Brain, Swords, 
    Copy, Search, Play, Pause, ZoomIn, ZoomOut, Shield, Gift, Zap
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';
import Toast, { ToastHandle } from './shared/Toast';

interface Enemy {
    id: string;
    name: string;
    type: string;
    category: string;
    tags: string[];
    stats: {
        hp: number;
        speed: number;
        damage: number;
        xp: number;
    };
    ai: {
        type: string;
        range: number;
        attackRange: number;
        patrolRadius: number;
        cooldown: number;
        script: string;
    };
    loot: {
        gold: [number, number];
        dropChance: number;
        items: any[];
    };
    resistances: {
        armor: number;
        magicResist: number;
        resist: string[];
        weakness: string[];
    };
    animations: {
        idle: { down: string; up: string; side: string; speed: number };
        run: { down: string; up: string; side: string; speed: number };
        attack: { base: string; speed: number };
        death: { base: string; speed: number };
    };
}

const EnemyEditor: React.FC = () => {
    const { isReady, sprites, emit, projectState, subscribe } = useStudio();
    const [enemies, setEnemies] = useState<Enemy[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const [templates, setTemplates] = useState<any[]>([]);
    const [availableBrains, setAvailableBrains] = useState<string[]>([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    
    // Animation Preview State
    const [previewState, setPreviewState] = useState<'idle' | 'run' | 'attack' | 'death'>('idle');
    const [previewDir, setPreviewDir] = useState<'down' | 'up' | 'side'>('down');
    const [previewZoom, setPreviewZoom] = useState(4);
    const [isPlaying, setIsPlaying] = useState(true);
    
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const toastRef = useRef<ToastHandle>(null);

    // Schema Migration Helper
    const ensureNewSchema = (en: any): Enemy => {
        if (!en.animations || !en.animations.idle.down) {
            const oldSprite = (en.animations && en.animations.idle) ? en.animations.idle.sprite : (en.sprite || 'monster');
            return {
                id: en.id,
                name: en.name || en.id,
                type: 'enemy',
                category: en.category || 'normal',
                tags: en.tags || [],
                stats: en.stats || { hp: 50, speed: 80, damage: 10, xp: 20 },
                ai: en.ai || { type: 'patrol', range: 250, attackRange: 40, patrolRadius: 100, cooldown: 1.5, script: '' },
                loot: en.loot || { gold: [0, 10], items: [], dropChance: 50 },
                resistances: en.resistances || { resist: [], weakness: [], armor: 0, magicResist: 0 },
                animations: {
                    idle: { down: oldSprite, up: oldSprite, side: oldSprite, speed: 0.15 },
                    run: { down: oldSprite, up: oldSprite, side: oldSprite, speed: 0.15 },
                    attack: { base: oldSprite, speed: 0.15 },
                    death: { base: oldSprite, speed: 0.15 }
                }
            };
        }
        return en;
    };

    useEffect(() => {
        if (isReady) {
            loadEnemies();
            loadTemplates();
            loadBrains();
            
            const unsub = subscribe('enemy:load', (event: any) => {
                if (event.data.enemyId) {
                    const idx = enemies.findIndex(e => e.id === event.data.enemyId);
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
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                duplicateEnemy();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enemies, currentIndex]);

    useEffect(() => {
        renderPreview();
    }, [enemies, currentIndex, previewState, previewDir, previewZoom, sprites]);

    const loadEnemies = async () => {
        try {
            const res = await fetch('/api/enemies');
            if (res.ok) {
                const data = await res.json();
                const migrated = data.map(ensureNewSchema);
                setEnemies(migrated.length > 0 ? migrated : [getDefaultEnemy()]);
            }
        } catch (e) {
            setEnemies([getDefaultEnemy()]);
        }
    };

    const loadTemplates = async () => {
        try {
            const res = await fetch('/api/templates/enemy');
            if (res.ok) setTemplates(await res.json());
        } catch (e) {}
    };

    const loadBrains = async () => {
        try {
            const res = await fetch('/api/brains/list');
            if (res.ok) setAvailableBrains(await res.json());
        } catch (e) {}
    };

    const getDefaultEnemy = (): Enemy => ({
        id: 'enemy_' + Date.now().toString().slice(-4),
        name: 'New Monster',
        type: 'enemy',
        category: 'normal',
        tags: [],
        stats: { hp: 50, speed: 80, damage: 10, xp: 20 },
        ai: { type: 'chase', range: 200, attackRange: 40, patrolRadius: 100, cooldown: 1.0, script: '' },
        loot: { gold: [5, 15], items: [], dropChance: 50 },
        resistances: { armor: 0, magicResist: 0, resist: [], weakness: [] },
        animations: {
            idle: { down: 'monster', up: 'monster', side: 'monster', speed: 0.2 },
            run: { down: 'monster', up: 'monster', side: 'monster', speed: 0.15 },
            attack: { base: 'monster', speed: 0.1 },
            death: { base: 'monster', speed: 0.2 }
        }
    });

    const updateCurrentEnemy = (path: string, value: any) => {
        const newEnemies = [...enemies];
        const enemy = { ...newEnemies[currentIndex] };
        
        const keys = path.split('.');
        let current: any = enemy;
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = Array.isArray(current[keys[i]]) ? [...current[keys[i]]] : { ...current[keys[i]] };
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        
        newEnemies[currentIndex] = enemy;
        setEnemies(newEnemies);
        setIsDirty(true);
        emit('enemy:updated', { enemyId: enemy.id, enemy });
    };

    const saveToServer = async () => {
        try {
            const res = await fetch('/api/enemies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enemies)
            });
            if (res.ok) {
                setIsDirty(false);
                toastRef.current?.show('DATABASE SAVED', 'success');
                emit('enemy:saved_all', { count: enemies.length });
                if (projectState) {
                    const map: any = {};
                    enemies.forEach(e => map[e.id] = e);
                    projectState.set('enemies', map);
                }
            }
        } catch (e) {
            toastRef.current?.show('SAVE FAILED', 'error');
        }
    };

    const duplicateEnemy = () => {
        const current = enemies[currentIndex];
        const clone = { ...JSON.parse(JSON.stringify(current)), id: current.id + '_COPY' };
        setEnemies([...enemies, clone]);
        setCurrentIndex(enemies.length);
        setIsDirty(true);
        toastRef.current?.show('VILLAIN DUPLICATED', 'info');
    };

    const deleteEnemy = () => {
        if (enemies.length <= 1) return;
        const id = enemies[currentIndex].id;
        setEnemies(enemies.filter((_, i) => i !== currentIndex));
        setCurrentIndex(Math.max(0, currentIndex - 1));
        setIsDirty(true);
        toastRef.current?.show(`DELETED ${id}`, 'info');
    };

    const filteredEnemies = useMemo(() => {
        if (!searchQuery) return enemies;
        return enemies.filter(e => 
            e.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
            e.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [enemies, searchQuery]);

    const renderPreview = () => {
        const canvas = previewCanvasRef.current;
        if (!canvas || !sprites) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const enemy = enemies[currentIndex];
        if (!enemy) return;

        let spriteKey = '';
        if (previewState === 'attack') spriteKey = enemy.animations.attack.base;
        else if (previewState === 'death') spriteKey = enemy.animations.death.base;
        else spriteKey = (enemy.animations as any)[previewState][previewDir];

        const sprite = sprites[spriteKey];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
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
        }
    };

    if (!isReady) return <div style={{ color: 'var(--accent-villain)', padding: '20px' }}>BOOTING VILLAIN PROTOCOL...</div>;

    const currentEnemy = enemies[currentIndex] || getDefaultEnemy();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <Toast ref={toastRef} />
            
            {/* MENUBAR */}
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between' }}>
                <div style={{ color: 'var(--accent-villain)', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <i className="fas fa-dragon" style={{ marginRight: '8px' }}></i> VILLAIN STUDIO v2.1
                </div>
                <div style={{ fontSize: '0.75rem', color: isDirty ? 'var(--accent-villain)' : '#444' }}>
                    {isDirty ? '● UNSAVED CHANGES' : '● SYNCED'}
                </div>
            </div>

            {/* TOOLBAR */}
            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" onClick={saveToServer} title="Save (Ctrl+S)"><Save size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => setShowTemplateModal(true)} title="New from Template"><PlusCircle size={16} /></button>
                <button className="tool-btn" onClick={() => { setEnemies([...enemies, getDefaultEnemy()]); setCurrentIndex(enemies.length); }} title="New Villain"><Plus size={16} /></button>
                <button className="tool-btn" onClick={duplicateEnemy} title="Duplicate (Ctrl+D)"><Copy size={16} /></button>
                <button className="tool-btn" style={{ color: '#e74c3c' }} onClick={deleteEnemy} title="Delete"><Trash size={16} /></button>
                
                <div style={{ marginLeft: 'auto', display: 'flex', position: 'relative', width: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#444' }} />
                    <input 
                        type="text" 
                        placeholder="Search villains..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '30px', fontSize: '0.85rem', height: '30px' }}
                    />
                </div>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                <Sidebar 
                    title="ENEMIES" 
                    items={filteredEnemies} 
                    currentIndex={enemies.indexOf(filteredEnemies[currentIndex])} 
                    onSelect={(idx) => setCurrentIndex(enemies.indexOf(filteredEnemies[idx]))}
                    renderItem={(item, active) => (
                        <div style={{
                            padding: '10px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #1a1a1a',
                            color: active ? 'var(--accent-villain)' : '#888',
                            background: active ? 'rgba(192, 57, 43, 0.05)' : 'transparent',
                            borderLeft: active ? '3px solid var(--accent-villain)' : '3px solid transparent'
                        }}>
                            <div style={{ fontSize: '1rem' }}>{item.name.toUpperCase() || 'UNNAMED'}</div>
                            <div style={{ fontSize: '0.7rem', color: '#444' }}>{item.id}</div>
                        </div>
                    )}
                />

                {/* MAIN EDITOR */}
                <div style={{ flexGrow: 1, background: 'var(--bg-canvas)', overflowY: 'auto', padding: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <FormSection title="Identity">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Registry ID</label>
                                        <input type="text" value={currentEnemy.id} onChange={(e) => updateCurrentEnemy('id', e.target.value)} />
                                    </div>
                                    <div>
                                        <label>Display Name</label>
                                        <input type="text" value={currentEnemy.name} onChange={(e) => updateCurrentEnemy('name', e.target.value)} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Category</label>
                                        <select value={currentEnemy.category} onChange={(e) => updateCurrentEnemy('category', e.target.value)}>
                                            <option value="normal">Normal (Mob)</option>
                                            <option value="elite">Elite (Veteran)</option>
                                            <option value="boss">Boss (Legendary)</option>
                                            <option value="construct">Construct / Summon</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label>Tags (Comma separated)</label>
                                        <input type="text" value={currentEnemy.tags.join(', ')} onChange={(e) => updateCurrentEnemy('tags', e.target.value.split(',').map(s => s.trim()))} />
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="Combat Stats">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Health (HP)</label>
                                        <input type="number" value={currentEnemy.stats.hp} onChange={(e) => updateCurrentEnemy('stats.hp', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label>Base Damage</label>
                                        <input type="number" value={currentEnemy.stats.damage} onChange={(e) => updateCurrentEnemy('stats.damage', parseInt(e.target.value))} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Move Speed</label>
                                        <input type="number" value={currentEnemy.stats.speed} onChange={(e) => updateCurrentEnemy('stats.speed', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label>Kill Reward (XP)</label>
                                        <input type="number" value={currentEnemy.stats.xp} onChange={(e) => updateCurrentEnemy('stats.xp', parseInt(e.target.value))} />
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="Resistances & Armor">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Physical Armor</label>
                                        <input type="number" value={currentEnemy.resistances.armor} onChange={(e) => updateCurrentEnemy('resistances.armor', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label>Magic Resistance</label>
                                        <input type="number" value={currentEnemy.resistances.magicResist} onChange={(e) => updateCurrentEnemy('resistances.magicResist', parseInt(e.target.value))} />
                                    </div>
                                </div>
                                <label>Immune To (e.g. fire, poison)</label>
                                <input type="text" value={currentEnemy.resistances.resist.join(', ')} onChange={(e) => updateCurrentEnemy('resistances.resist', e.target.value.split(',').map(s => s.trim()))} />
                            </FormSection>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <FormSection title="Loot & Drops">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Base Gold</label>
                                        <input type="number" value={currentEnemy.loot.gold[0]} onChange={(e) => updateCurrentEnemy('loot.gold', [parseInt(e.target.value), currentEnemy.loot.gold[1]])} />
                                    </div>
                                    <div>
                                        <label>Max Gold</label>
                                        <input type="number" value={currentEnemy.loot.gold[1]} onChange={(e) => updateCurrentEnemy('loot.gold', [currentEnemy.loot.gold[0], parseInt(e.target.value)])} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Drop Chance (%)</label>
                                        <input type="number" value={currentEnemy.loot.dropChance} onChange={(e) => updateCurrentEnemy('loot.dropChance', parseInt(e.target.value))} />
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="AI & Behavior">
                                <div style={{ marginBottom: '15px' }}>
                                    <label>Logic Type</label>
                                    <select value={currentEnemy.ai.type} onChange={(e) => updateCurrentEnemy('ai.type', e.target.value)}>
                                        <option value="patrol">Patrol & Chase</option>
                                        <option value="chase">Immediate Chase</option>
                                        <option value="sniper">Ranged Sniper</option>
                                        <option value="static">Guardian (Turret)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Detection Range</label>
                                        <input type="number" value={currentEnemy.ai.range} onChange={(e) => updateCurrentEnemy('ai.range', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label>Attack Range</label>
                                        <input type="number" value={currentEnemy.ai.attackRange} onChange={(e) => updateCurrentEnemy('ai.attackRange', parseInt(e.target.value))} />
                                    </div>
                                </div>
                                <label>AI Brain Override</label>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <select value={currentEnemy.ai.script} onChange={(e) => updateCurrentEnemy('ai.script', e.target.value)} style={{ flex: 1 }}>
                                        <option value="">Standard Engine AI</option>
                                        {availableBrains.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                    <button className="tool-btn"><Brain size={14} /></button>
                                </div>
                            </FormSection>

                            <FormSection title="Animations (Directional)">
                                {['idle', 'run'].map(state => (
                                    <div key={state} style={{ marginBottom: '15px' }}>
                                        <label style={{ color: 'var(--accent-villain)' }}>{state.toUpperCase()} SPRITES</label>
                                        {['down', 'up', 'side'].map(dir => (
                                            <div key={dir} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                                                <span style={{ width: '50px', fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>{dir}</span>
                                                <select value={(currentEnemy.animations as any)[state][dir]} onChange={(e) => updateCurrentEnemy(`animations.${state}.${dir}`, e.target.value)} style={{ flex: 1 }}>
                                                    {sprites && Object.keys(sprites).map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </FormSection>
                        </div>
                    </div>
                </div>

                {/* PREVIEW PANEL */}
                <div className="panel" style={{ width: '350px', borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
                    <div className="panel-header">COMBAT PREVIEW</div>
                    <div className="panel-content">
                        <div style={{ 
                            width: '100%', aspectRatio: '1', background: '#000', border: '1px solid #333', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                            backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)', backgroundSize: '20px 20px'
                        }}>
                            <canvas ref={previewCanvasRef} width={256} height={256} style={{ width: '224px', height: '224px', imageRendering: 'pixelated' }} />
                            <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', gap: '5px' }}>
                                <button className="tool-btn small" onClick={() => setPreviewZoom(z => Math.max(1, z-1))}><ZoomOut size={12}/></button>
                                <button className="tool-btn small" onClick={() => setPreviewZoom(z => Math.min(8, z+1))}><ZoomIn size={12}/></button>
                            </div>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px', padding: '0 15px' }}>
                            <div>
                                <label>Action</label>
                                <select value={previewState} onChange={(e) => setPreviewState(e.target.value as any)}>
                                    <option value="idle">Idle Loop</option>
                                    <option value="run">Running</option>
                                    <option value="attack">Attack Mode</option>
                                    <option value="death">Death Anim</option>
                                </select>
                            </div>
                            <div>
                                <label>Facing</label>
                                <select value={previewDir} onChange={(e) => setPreviewDir(e.target.value as any)}>
                                    <option value="down">Front</option>
                                    <option value="up">Back</option>
                                    <option value="side">Side</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* TEMPLATE MODAL */}
            {showTemplateModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="panel" style={{ width: '450px', height: 'auto', maxHeight: '80vh', border: '2px solid var(--accent-villain)', boxShadow: '0 0 50px rgba(0,0,0,1)' }}>
                        <div className="panel-header">
                            VILLAIN ARCHETYPES
                            <button className="tool-btn" onClick={() => setShowTemplateModal(false)}>×</button>
                        </div>
                        <div className="panel-content" style={{ padding: '15px' }}>
                            {templates.map(t => (
                                <div key={t.id} className="template-item" onClick={() => {
                                    const newEnemy = { ...getDefaultEnemy(), id: t.id + "_" + Date.now().toString().slice(-4), name: t.name, ...t.data };
                                    setEnemies([...enemies, ensureNewSchema(newEnemy)]);
                                    setCurrentIndex(enemies.length);
                                    setShowTemplateModal(false);
                                    setIsDirty(true);
                                }}
                                style={{ padding: '15px', margin: '8px 0', background: '#111', border: '1px solid #333', cursor: 'pointer', borderRadius: '4px' }}
                                >
                                    <div style={{ fontWeight: 'bold', color: 'var(--accent-villain)', fontSize: '1.1rem' }}>{t.name.toUpperCase()}</div>
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

export default EnemyEditor;
