import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Save, Plus, PlusCircle, Trash, Skull, Brain, Swords, 
    Copy, Search, Play, Pause, ZoomIn, ZoomOut, Shield, Gift, Zap, X 
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';
import Toast, { ToastHandle } from './shared/Toast';

export interface Enemy {
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

export function ensureNewSchema(en: any): Enemy {
    const anim = en?.animations || {};
    const fallbackSprite =
        anim.idle?.down ||
        anim.idle?.sprite ||
        anim.idle?.base ||
        en?.sprite ||
        'monster';
    const aiObj = typeof en?.ai === 'object' && en.ai !== null ? en.ai : {};
    const aiType = typeof en?.ai === 'string' ? en.ai : (aiObj.type || 'patrol');
    const aiScript = String(aiObj.script || aiObj.brain || en?.brain || en?.script || '');

    const rawGold = en?.loot?.gold;
    const goldMin = Array.isArray(rawGold) ? (Number(rawGold[0]) || 0) : (Number(en?.loot?.goldMin) || 0);
    const goldMax = Array.isArray(rawGold) ? (Number(rawGold[1]) || 0) : (Number(en?.loot?.goldMax) ?? 10);
    const rawChance = en?.loot?.dropChance ?? (Number.isFinite(en?.loot?.chance) ? Math.round(en.loot.chance * 100) : 50);

    const rawDrops = Array.isArray(en?.loot?.items)
        ? en.loot.items
        : Array.isArray(en?.loot)
            ? en.loot
            : Array.isArray(en?.drops)
                ? en.drops
                : [];
    const normalizedItems = rawDrops.map((entry: any) => {
        if (typeof entry === 'string') return { id: entry, chance: 100, min: 1, max: 1 };
        const id = String(entry?.id || entry?.itemId || '');
        const chance = entry?.chance ?? (Number.isFinite(entry?.rate) ? Math.round(entry.rate * 100) : 100);
        const min = Number(entry?.min ?? entry?.quantity ?? 1) || 1;
        const max = Number(entry?.max ?? entry?.quantity ?? min) || min;
        return { id, chance, min, max };
    }).filter((it: any) => Boolean(it.id));

    const hpVal = Number(en?.stats?.hp ?? en?.hp ?? 50) || 50;
    const speedVal = Number(en?.stats?.speed ?? en?.speed ?? 80) || 80;
    const damageVal = Number(en?.stats?.damage ?? en?.stats?.atk ?? en?.damage ?? en?.atk ?? 10) || 10;
    const xpVal = Number(en?.stats?.xp ?? en?.stats?.xpValue ?? en?.xp ?? en?.xpValue ?? 20) || 0;
    const armorVal = Number(en?.resistances?.armor ?? en?.stats?.def ?? en?.def ?? 0) || 0;

    return {
        id: String(en?.id || 'enemy_' + Date.now().toString().slice(-4)),
        name: String(en?.name || en?.id || 'New Monster'),
        type: 'enemy',
        category: String(en?.category || 'normal'),
        tags: Array.isArray(en?.tags) ? en.tags.filter(Boolean) : [],
        stats: {
            hp: hpVal,
            speed: speedVal,
            damage: damageVal,
            xp: xpVal
        },
        ai: {
            type: aiType,
            range: Number(aiObj.range ?? en?.range ?? 250) || 250,
            attackRange: Number(aiObj.attackRange ?? 40) || 40,
            patrolRadius: Number(aiObj.patrolRadius ?? 100) || 100,
            cooldown: Number(aiObj.cooldown ?? 1.5) || 1.5,
            script: aiScript
        },
        loot: {
            gold: [goldMin, goldMax],
            dropChance: Number.isFinite(Number(rawChance)) ? Number(rawChance) : 50,
            items: normalizedItems
        },
        resistances: {
            armor: armorVal,
            magicResist: Number(en?.resistances?.magicResist ?? 0) || 0,
            resist: Array.isArray(en?.resistances?.resist) ? en.resistances.resist : [],
            weakness: Array.isArray(en?.resistances?.weakness) ? en.resistances.weakness : []
        },
        animations: {
            idle: {
                down: anim.idle?.down || anim.idle?.sprite || fallbackSprite,
                up: anim.idle?.up || anim.idle?.sprite || fallbackSprite,
                side: anim.idle?.side || anim.idle?.sprite || fallbackSprite,
                speed: Number(anim.idle?.speed ?? 0.15) || 0.15
            },
            run: {
                down: anim.run?.down || anim.run?.sprite || fallbackSprite,
                up: anim.run?.up || anim.run?.sprite || fallbackSprite,
                side: anim.run?.side || anim.run?.sprite || fallbackSprite,
                speed: Number(anim.run?.speed ?? 0.15) || 0.15
            },
            attack: {
                base: anim.attack?.base || anim.attack?.down || anim.attack?.sprite || fallbackSprite,
                speed: Number(anim.attack?.speed ?? 0.15) || 0.15
            },
            death: {
                base: anim.death?.base || anim.death?.down || anim.death?.sprite || fallbackSprite,
                speed: Number(anim.death?.speed ?? 0.15) || 0.15
            }
        }
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
    const [availableItems, setAvailableItems] = useState<any[]>([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    
    // Animation Preview State
    const [previewState, setPreviewState] = useState<'idle' | 'run' | 'attack' | 'death'>('idle');
    const [previewDir, setPreviewDir] = useState<'down' | 'up' | 'side'>('down');
    const [previewZoom, setPreviewZoom] = useState(4);
    
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const toastRef = useRef<ToastHandle>(null);
    const enemiesRef = useRef<Enemy[]>([]);
    const isDirtyRef = useRef(false);
    const savingRef = useRef(false);
    const saveRef = useRef<() => Promise<void>>(async () => {});

    useEffect(() => { enemiesRef.current = enemies; }, [enemies]);
    useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

    useEffect(() => {
        if (!isReady) return;
        loadEnemies();
        loadTemplates();
        loadBrains();
        loadItems();

        const unsubLoad = subscribe('enemy:load', (event: any) => {
            const enemyId = event?.data?.enemyId;
            if (enemyId) {
                const idx = enemiesRef.current.findIndex(e => e.id === enemyId);
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
                duplicateEnemy();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enemies, currentIndex]);

    useEffect(() => {
        renderPreview();
    }, [enemies, currentIndex, previewState, previewDir, previewZoom, sprites]);

    const loadEnemies = async (preserveId?: string) => {
        try {
            const res = await fetch('/api/enemies');
            if (res.ok) {
                const data = await res.json();
                const migrated = Array.isArray(data) ? data.map(ensureNewSchema) : [];
                const nextList = migrated.length > 0 ? migrated : [getDefaultEnemy()];
                setEnemies(nextList);
                enemiesRef.current = nextList;
                if (preserveId) {
                    const foundIdx = nextList.findIndex(e => e.id === preserveId);
                    if (foundIdx >= 0) setCurrentIndex(foundIdx);
                }
            } else {
                const def = [getDefaultEnemy()];
                setEnemies(def);
                enemiesRef.current = def;
            }
        } catch (e) {
            const def = [getDefaultEnemy()];
            setEnemies(def);
            enemiesRef.current = def;
        }
    };

    const loadTemplates = async () => {
        try {
            const res = await fetch('/api/templates/enemy');
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

    const loadItems = async () => {
        try {
            const res = await fetch('/api/items');
            if (res.ok) {
                const data = await res.json();
                setAvailableItems(Array.isArray(data) ? data : []);
            }
        } catch (err) { setAvailableItems([]); }
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
        const prev = newEnemies[currentIndex];
        if (!prev) return;
        const enemy = { ...prev };
        
        const keys = path.split('.');
        let current: any = enemy;
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = Array.isArray(current[keys[i]]) ? [...current[keys[i]]] : { ...current[keys[i]] };
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        
        newEnemies[currentIndex] = enemy;
        setEnemies(newEnemies);
        enemiesRef.current = newEnemies;
        setIsDirty(true);
        emit('enemy:updated', { enemyId: enemy.id, enemy });
    };

    const saveToServer = async () => {
        if (savingRef.current) return;
        savingRef.current = true;
        try {
            const payload = enemiesRef.current;
            const res = await fetch('/api/enemies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setIsDirty(false);
                toastRef.current?.show('DATABASE SAVED', 'success');
                emit('enemy:saved_all', { count: payload.length });
                if (projectState) {
                    const map: any = {};
                    payload.forEach(e => map[e.id] = e);
                    projectState.set('enemies', map);
                }
                const currentId = enemiesRef.current[currentIndex]?.id;
                await loadEnemies(currentId);
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

    const duplicateEnemy = () => {
        const current = enemies[currentIndex];
        if (!current) return;
        const clone = JSON.parse(JSON.stringify(current));
        clone.id = makeUniqueCloneId(current.id, new Set(enemies.map(e => e.id)));
        clone.name = `${current.name || current.id} (COPY)`;
        setEnemies([...enemies, clone]);
        setCurrentIndex(enemies.length);
        setIsDirty(true);
        toastRef.current?.show('VILLAIN DUPLICATED', 'info');
    };

    const deleteEnemy = () => {
        if (enemies.length <= 1) {
            toastRef.current?.show('CANNOT DELETE LAST ENEMY', 'info');
            return;
        }
        const id = enemies[currentIndex].id;
        setEnemies(enemies.filter((_, i) => i !== currentIndex));
        setCurrentIndex(Math.max(0, currentIndex - 1));
        setIsDirty(true);
        toastRef.current?.show(`DELETED ${id}`, 'info');
    };

    const openBrainEditor = (scriptName?: string) => {
        const current = enemies[currentIndex];
        if (!current) return;
        const brainName = scriptName || current.ai.script || `${current.id}_ai`;
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

    const filteredEnemies = useMemo(() => {
        if (!searchQuery) return enemies;
        return enemies.filter(e => 
            e.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
            e.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [enemies, searchQuery]);

    const renderPreview = () => {
        const canvas = previewCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const enemy = enemies[currentIndex];
        if (!enemy) return;

        let spriteKey = '';
        if (previewState === 'attack') spriteKey = enemy.animations?.attack?.base || enemy.animations?.idle?.down || 'monster';
        else if (previewState === 'death') spriteKey = enemy.animations?.death?.base || enemy.animations?.idle?.down || 'monster';
        else spriteKey = (enemy.animations as any)?.[previewState]?.[previewDir] || enemy.animations?.idle?.down || 'monster';

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

    if (!isReady) return <div style={{ color: 'var(--accent-villain)', padding: '20px' }}>BOOTING VILLAIN PROTOCOL...</div>;

    const currentEnemy = enemies[currentIndex] || getDefaultEnemy();
    const spriteKeys = sprites ? Object.keys(sprites) : [];
    const renderSpriteSelect = (value: string, onChange: (val: string) => void) => {
        const hasCustom = Boolean(value && !spriteKeys.includes(value));
        return (
            <select value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1 }}>
                {hasCustom && <option value={value}>{value}</option>}
                {spriteKeys.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
        );
    };

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
                <button className="tool-btn" onClick={() => { setEnemies([...enemies, getDefaultEnemy()]); setCurrentIndex(enemies.length); setIsDirty(true); }} title="New Villain"><Plus size={16} /></button>
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
                    currentIndex={filteredEnemies.indexOf(enemies[currentIndex])} 
                    onSelect={(idx) => {
                        const actualIdx = enemies.indexOf(filteredEnemies[idx]);
                        if (actualIdx >= 0) setCurrentIndex(actualIdx);
                    }}
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
                                        <input type="text" value={currentEnemy.tags.join(', ')} onChange={(e) => updateCurrentEnemy('tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="Combat Stats">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Health (HP)</label>
                                        <input type="number" value={currentEnemy.stats.hp} onChange={(e) => updateCurrentEnemy('stats.hp', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                    <div>
                                        <label>Base Damage</label>
                                        <input type="number" value={currentEnemy.stats.damage} onChange={(e) => updateCurrentEnemy('stats.damage', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Move Speed</label>
                                        <input type="number" value={currentEnemy.stats.speed} onChange={(e) => updateCurrentEnemy('stats.speed', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                    <div>
                                        <label>Kill Reward (XP)</label>
                                        <input type="number" value={currentEnemy.stats.xp} onChange={(e) => updateCurrentEnemy('stats.xp', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="Resistances & Armor">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Physical Armor</label>
                                        <input type="number" value={currentEnemy.resistances.armor} onChange={(e) => updateCurrentEnemy('resistances.armor', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                    <div>
                                        <label>Magic Resistance</label>
                                        <input type="number" value={currentEnemy.resistances.magicResist} onChange={(e) => updateCurrentEnemy('resistances.magicResist', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                </div>
                                <div style={{ marginBottom: '10px' }}>
                                    <label>Immune To (e.g. fire, poison)</label>
                                    <input type="text" value={currentEnemy.resistances.resist.join(', ')} onChange={(e) => updateCurrentEnemy('resistances.resist', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
                                </div>
                                <div>
                                    <label>Weakness (e.g. ice, holy)</label>
                                    <input type="text" value={currentEnemy.resistances.weakness.join(', ')} onChange={(e) => updateCurrentEnemy('resistances.weakness', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
                                </div>
                            </FormSection>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <FormSection title="Loot & Drops">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Min Gold</label>
                                        <input type="number" value={currentEnemy.loot.gold[0]} onChange={(e) => updateCurrentEnemy('loot.gold', [parseInt(e.target.value, 10) || 0, currentEnemy.loot.gold[1]])} />
                                    </div>
                                    <div>
                                        <label>Max Gold</label>
                                        <input type="number" value={currentEnemy.loot.gold[1]} onChange={(e) => updateCurrentEnemy('loot.gold', [currentEnemy.loot.gold[0], parseInt(e.target.value, 10) || 0])} />
                                    </div>
                                    <div>
                                        <label>Drop Chance (%)</label>
                                        <input type="number" min={0} max={100} value={currentEnemy.loot.dropChance} onChange={(e) => updateCurrentEnemy('loot.dropChance', Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))} />
                                    </div>
                                </div>
                                <label>Loot Items</label>
                                <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
                                    <select
                                        style={{ flex: 1 }}
                                        value=""
                                        onChange={(e) => {
                                            if (!e.target.value) return;
                                            updateCurrentEnemy('loot.items', [...(currentEnemy.loot.items || []), { id: e.target.value, chance: 50, min: 1, max: 1 }]);
                                        }}
                                    >
                                        <option value="">-- Add Item Drop --</option>
                                        {(Array.isArray(availableItems) ? availableItems : []).map((it: any) => (
                                            <option key={it.id} value={it.id}>{it.name || it.id}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {(currentEnemy.loot.items || []).map((entry: any, idx: number) => {
                                        const itemObj = typeof entry === 'string' ? { id: entry, chance: 100, min: 1, max: 1 } : entry;
                                        return (
                                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 65px 55px 28px', gap: '6px', alignItems: 'center', background: '#000', padding: '6px 8px', border: '1px solid #222' }}>
                                                <span style={{ fontSize: '0.8rem', color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemObj.id}</span>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    title="Chance %"
                                                    value={itemObj.chance ?? 100}
                                                    onChange={(e) => {
                                                        const next = [...(currentEnemy.loot.items || [])];
                                                        next[idx] = { ...itemObj, chance: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) };
                                                        updateCurrentEnemy('loot.items', next);
                                                    }}
                                                    style={{ padding: '3px 6px', fontSize: '0.8rem' }}
                                                />
                                                <input
                                                    type="number"
                                                    min={1}
                                                    title="Max Qty"
                                                    value={itemObj.max ?? 1}
                                                    onChange={(e) => {
                                                        const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
                                                        const next = [...(currentEnemy.loot.items || [])];
                                                        next[idx] = { ...itemObj, min: Math.min(itemObj.min ?? 1, qty), max: qty };
                                                        updateCurrentEnemy('loot.items', next);
                                                    }}
                                                    style={{ padding: '3px 6px', fontSize: '0.8rem' }}
                                                />
                                                <button
                                                    className="tool-btn small"
                                                    style={{ color: '#e74c3c' }}
                                                    onClick={() => {
                                                        const next = (currentEnemy.loot.items || []).filter((_: any, i: number) => i !== idx);
                                                        updateCurrentEnemy('loot.items', next);
                                                    }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        );
                                    })}
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
                                        <input type="number" value={currentEnemy.ai.range} onChange={(e) => updateCurrentEnemy('ai.range', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                    <div>
                                        <label>Attack Range</label>
                                        <input type="number" value={currentEnemy.ai.attackRange} onChange={(e) => updateCurrentEnemy('ai.attackRange', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                </div>
                                <label>AI Brain Override</label>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <select value={currentEnemy.ai.script} onChange={(e) => updateCurrentEnemy('ai.script', e.target.value)} style={{ flex: 1 }}>
                                        <option value="">Standard Engine AI</option>
                                        {Boolean(currentEnemy.ai.script && !availableBrains.includes(currentEnemy.ai.script)) && (
                                            <option value={currentEnemy.ai.script}>{currentEnemy.ai.script}</option>
                                        )}
                                        {(Array.isArray(availableBrains) ? availableBrains : []).map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                    <button className="tool-btn" onClick={() => openBrainEditor()} title="Open AI Brain Editor"><Brain size={14} /></button>
                                </div>
                            </FormSection>

                            <FormSection title="Animations (Directional & Base)">
                                {(['idle', 'run'] as const).map(state => (
                                    <div key={state} style={{ marginBottom: '15px' }}>
                                        <label style={{ color: 'var(--accent-villain)' }}>{state.toUpperCase()} SPRITES</label>
                                        {(['down', 'up', 'side'] as const).map(dir => (
                                            <div key={dir} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                                                <span style={{ width: '50px', fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>{dir}</span>
                                                {renderSpriteSelect(currentEnemy.animations[state][dir], (val) => updateCurrentEnemy(`animations.${state}.${dir}`, val))}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ width: '50px', fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>Attack</span>
                                    {renderSpriteSelect(currentEnemy.animations.attack.base, (val) => updateCurrentEnemy('animations.attack.base', val))}
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span style={{ width: '50px', fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>Death</span>
                                    {renderSpriteSelect(currentEnemy.animations.death.base, (val) => updateCurrentEnemy('animations.death.base', val))}
                                </div>
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
                            {(Array.isArray(templates) ? templates : []).map(t => (
                                <div key={t.id} className="template-item" onClick={() => {
                                    const { components, sprite: tplSprite, ...restData } = (t.data || {});
                                    const statsComp = Array.isArray(components) ? components.find((c: any) => c?.type === 'Stats') : null;
                                    const scriptComp = Array.isArray(components) ? components.find((c: any) => c?.type === 'Script') : null;
                                    const base = getDefaultEnemy();
                                    const spriteChoice = tplSprite || base.animations.idle.down;
                                    const templateCandidate = {
                                        ...base,
                                        ...restData,
                                        id: makeUniqueCloneId(`${t.id}_${Date.now().toString().slice(-4)}`, new Set(enemies.map(e => e.id))),
                                        name: t.name || restData.name || t.id,
                                        stats: {
                                            ...base.stats,
                                            ...(restData.stats || {}),
                                            ...(statsComp ? {
                                                hp: statsComp.hp ?? base.stats.hp,
                                                speed: statsComp.speed ?? base.stats.speed,
                                                damage: statsComp.damage ?? base.stats.damage,
                                                xp: statsComp.xpValue ?? statsComp.xp ?? base.stats.xp
                                            } : {})
                                        },
                                        ai: {
                                            ...base.ai,
                                            ...(typeof restData.ai === 'object' && restData.ai !== null ? restData.ai : {}),
                                            ...(scriptComp?.scriptId ? { script: scriptComp.scriptId } : {})
                                        },
                                        animations: restData.animations || {
                                            idle: { down: spriteChoice, up: spriteChoice, side: spriteChoice, speed: 0.2 },
                                            run: { down: spriteChoice, up: spriteChoice, side: spriteChoice, speed: 0.15 },
                                            attack: { base: spriteChoice, speed: 0.1 },
                                            death: { base: spriteChoice, speed: 0.2 }
                                        }
                                    };
                                    setEnemies([...enemies, ensureNewSchema(templateCandidate)]);
                                    setCurrentIndex(enemies.length);
                                    setShowTemplateModal(false);
                                    setIsDirty(true);
                                }}
                                style={{ padding: '15px', margin: '8px 0', background: '#111', border: '1px solid #333', cursor: 'pointer', borderRadius: '4px' }}
                                >
                                    <div style={{ fontWeight: 'bold', color: 'var(--accent-villain)', fontSize: '1.1rem' }}>{t.name?.toUpperCase() ?? ''}</div>
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
