import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Save, Plus, PlusCircle, Trash, Box, Download, Upload, 
    Image as ImageIcon, Search, Copy, AlertCircle, Edit3, Check 
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';
import Toast, { ToastHandle } from './shared/Toast';

interface Item {
    id: string;
    name: string;
    sprite: string;
    type: string;
    value: number;
    desc: string;
    description?: string;
    icon: string;
    rarity: string;
    stackable: boolean;
    maxStack: number;
    properties: any;
}

const KNOWN_PIXEL_MART_FALLBACK = [
    'aluminum_foil.png', 'apple.png', 'bacon.png', 'banana.png', 'bandage_box.png',
    'butter.png', 'cabbage.png', 'cookies.png', 'egg_white.png', 'fish.png',
    'meat1.png', 'milk_bottle.png', 'orange_juice.png', 'potato.png', 'red_apple.png',
    'salmon.png', 'salt.png', 'soap.png', 'soft_drink_blue.png', 'soft_drink_red.png',
    'strawberry.png', 'sugar.png', 'water.png', 'watermelon1.png', 'wine_red.png'
];

const RARITY_COLORS: Record<string, string> = {
    common: '#444',
    uncommon: '#2ecc71',
    rare: '#3498db',
    epic: '#9b59b6',
    legendary: '#f1c40f'
};

function makeUniqueCloneId(sourceId: string, existingIds: Set<string>): string {
    const base = sourceId.replace(/_COPY(?:_\d+)?$/, '') + '_COPY';
    let idx = 1;
    while (existingIds.has(`${base}_${idx}`)) idx++;
    return `${base}_${idx}`;
}

function resolveItemSpriteUrl(spriteKey: string): string | null {
    if (!spriteKey) return null;
    if (spriteKey.startsWith('http://') || spriteKey.startsWith('https://') || spriteKey.startsWith('data:') || spriteKey.startsWith('/')) {
        return spriteKey;
    }
    if (spriteKey.startsWith('sprite-art/') || spriteKey.startsWith('assets/')) {
        return '/' + spriteKey;
    }
    if (spriteKey.endsWith('.png') || spriteKey.includes('/')) {
        return `/sprite-art/Pixel_Mart/${spriteKey}`;
    }
    return null;
}

function normalizeItem(raw: any): Item {
    const descVal = String(raw?.desc ?? raw?.description ?? '');
    const spriteVal = String(raw?.sprite || 'irab_dhammah');
    return {
        id: String(raw?.id || 'item_' + Date.now().toString().slice(-6)),
        name: String(raw?.name || raw?.id || 'New Item'),
        sprite: spriteVal,
        type: String(raw?.type || 'misc'),
        value: Number(raw?.value ?? 0) || 0,
        desc: descVal,
        description: descVal,
        icon: String(raw?.icon || spriteVal),
        rarity: String(raw?.rarity || 'common'),
        stackable: raw?.stackable !== false,
        maxStack: Math.max(1, Number(raw?.maxStack ?? 99) || 99),
        properties: raw?.properties && typeof raw.properties === 'object'
            ? JSON.parse(JSON.stringify(raw.properties))
            : {}
    };
}

const ItemEditor: React.FC = () => {
    const { isReady, sprites, emit, projectState, subscribe } = useStudio();
    const [items, setItems] = useState<Item[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [templates, setTemplates] = useState<any[]>([]);
    const [pixelMartSprites, setPixelMartSprites] = useState<string[]>(KNOWN_PIXEL_MART_FALLBACK);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [propsJson, setPropsJson] = useState('');
    const [jsonError, setJsonError] = useState(false);
    const [imgLoadError, setImgLoadError] = useState(false);

    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const toastRef = useRef<ToastHandle>(null);
    const itemsRef = useRef<Item[]>([]);
    const isDirtyRef = useRef(false);
    const savingRef = useRef(false);
    const jsonErrorRef = useRef(false);
    const saveRef = useRef<() => Promise<void>>(async () => {});

    useEffect(() => { itemsRef.current = items; }, [items]);
    useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
    useEffect(() => { jsonErrorRef.current = jsonError; }, [jsonError]);

    useEffect(() => {
        if (!isReady) return;
        loadItems();
        loadTemplates();
        loadPixelMartSprites();

        const unsubLoad = subscribe('item:load', (event: any) => {
            const itemId = event?.data?.itemId;
            if (itemId) {
                const idx = itemsRef.current.findIndex(i => i.id === itemId);
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

    // Sync properties editor & reset JSON error cleanly when switching items
    useEffect(() => {
        const current = items[currentIndex];
        if (current) {
            setJsonError(false);
            setImgLoadError(false);
            setPropsJson(JSON.stringify(current.properties || {}, null, 2));
        }
    }, [currentIndex, items.length]);

    useEffect(() => {
        if (items[currentIndex]) {
            setImgLoadError(false);
            renderPreview();
        }
    }, [items, currentIndex, sprites]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                saveToServer();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [items]);

    const loadItems = async () => {
        try {
            const res = await fetch('/api/items');
            if (res.ok) {
                const data = await res.json();
                const normalized = Array.isArray(data) ? data.map(normalizeItem) : [];
                const nextList = normalized.length > 0 ? normalized : [getDefaultItem()];
                setItems(nextList);

                const itemPngs = nextList
                    .map(it => it.sprite)
                    .filter(s => s && s.endsWith('.png') && !s.includes('/'));
                if (itemPngs.length > 0) {
                    setPixelMartSprites(prev => Array.from(new Set([...prev, ...itemPngs])).sort());
                }
            } else {
                setItems([getDefaultItem()]);
            }
        } catch (e) {
            setItems([getDefaultItem()]);
        }
    };

    const loadPixelMartSprites = async () => {
        try {
            const res = await fetch('/api/ide/list?dir=sprite-art/Pixel_Mart');
            if (res.ok) {
                const files = await res.json();
                if (Array.isArray(files)) {
                    const pngs = files
                        .filter((f: any) => !f.isDirectory && typeof f.name === 'string' && f.name.toLowerCase().endsWith('.png'))
                        .map((f: any) => f.name);
                    if (pngs.length > 0) {
                        setPixelMartSprites(prev => Array.from(new Set([...prev, ...pngs])).sort());
                    }
                }
            }
        } catch (err) { console.warn("[studio-ui] Pixel Mart list failed", err); }
    };

    const loadTemplates = async () => {
        try {
            const res = await fetch('/api/templates/item');
            if (res.ok) {
                setTemplates(await res.json());
            }
        } catch (err) { console.warn("[studio-ui] swallowed error", err); }
    };

    const getDefaultItem = (): Item => ({
        id: 'item_' + Date.now().toString().slice(-6),
        name: 'New Item',
        sprite: 'irab_dhammah',
        type: 'misc',
        value: 0,
        desc: '',
        description: '',
        icon: 'irab_dhammah',
        rarity: 'common',
        stackable: true,
        maxStack: 99,
        properties: {}
    });

    const saveToServer = async () => {
        if (savingRef.current) return;
        if (jsonErrorRef.current) {
            toastRef.current?.show('FIX INVALID PROPERTIES JSON BEFORE SAVING', 'error');
            return;
        }
        savingRef.current = true;
        try {
            const payload = itemsRef.current.map(it => ({
                ...it,
                desc: it.desc ?? it.description ?? '',
                description: it.desc ?? it.description ?? ''
            }));
            const res = await fetch('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setIsDirty(false);
                toastRef.current?.show('DATABASE SAVED', 'success');
                emit('item:saved_all', { count: payload.length });
                
                if (projectState) {
                    const map: any = {};
                    payload.forEach(i => map[i.id] = i);
                    projectState.set('items', map);
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

    const addNewItem = () => {
        const newItem = getDefaultItem();
        setItems([...items, newItem]);
        setCurrentIndex(items.length);
        setIsDirty(true);
    };

    const duplicateItem = () => {
        const current = items[currentIndex];
        if (!current) return;
        const clone = JSON.parse(JSON.stringify(current));
        clone.id = makeUniqueCloneId(current.id, new Set(items.map(i => i.id)));
        clone.name = `${current.name} (COPY)`;
        setItems([...items, clone]);
        setCurrentIndex(items.length);
        setIsDirty(true);
        toastRef.current?.show('ITEM DUPLICATED', 'info');
    };

    const deleteItem = () => {
        if (items.length <= 1) {
            toastRef.current?.show('CANNOT DELETE LAST ITEM', 'info');
            return;
        }
        const id = items[currentIndex].id;
        const newItems = items.filter((_, i) => i !== currentIndex);
        setItems(newItems);
        setCurrentIndex(Math.max(0, currentIndex - 1));
        setIsDirty(true);
        toastRef.current?.show(`DELETED ${id}`, 'info');
    };

    const updateCurrentItem = (field: keyof Item, value: any) => {
        const newItems = [...items];
        const prev = newItems[currentIndex];
        if (!prev) return;
        const updated: Item = { ...prev, [field]: value };

        if (field === 'desc' || field === 'description') {
            updated.desc = value;
            updated.description = value;
        }
        if (field === 'sprite' && (!prev.icon || prev.icon === prev.sprite)) {
            updated.icon = value;
        }

        newItems[currentIndex] = updated;
        setItems(newItems);
        setIsDirty(true);
        emit('item:updated', { itemId: updated.id, item: updated });
    };

    const handlePropsChange = (val: string) => {
        setPropsJson(val);
        try {
            const parsed = val.trim() ? JSON.parse(val) : {};
            setJsonError(false);
            const newItems = [...items];
            if (!newItems[currentIndex]) return;
            newItems[currentIndex] = { ...newItems[currentIndex], properties: parsed };
            setItems(newItems);
            setIsDirty(true);
        } catch (e) {
            setJsonError(true);
        }
    };

    const openPixelSourceEditor = (spriteKey: string) => {
        emit('studio:open_tool', {
            toolId: 'pixel',
            params: { sprite: spriteKey }
        });
        const parentWin = window.parent as any;
        if (parentWin && parentWin !== window) {
            if (typeof parentWin.editSpriteInStudio === 'function') {
                parentWin.editSpriteInStudio(spriteKey);
                return;
            }
            if (typeof parentWin.openPixelEditor === 'function') {
                parentWin.openPixelEditor(spriteKey);
                return;
            }
            if (typeof parentWin.openWindow === 'function' && Array.isArray(parentWin.tools)) {
                const tool = parentWin.tools.find((t: any) => t.id === 'pixel');
                if (tool) {
                    parentWin.openWindow({ ...tool, src: `${tool.src}?sprite=${encodeURIComponent(spriteKey)}` });
                    return;
                }
            }
        }
        window.open(`/studio-dist/pixel_editor.html?sprite=${encodeURIComponent(spriteKey)}`, '_blank');
    };

    const filteredItems = useMemo(() => {
        if (!searchQuery) return items;
        return items.filter(i => 
            i.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
            i.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [items, searchQuery]);

    const renderPreview = () => {
        const canvas = previewCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const item = items[currentIndex];
        if (!item) return;

        const sprite = sprites ? sprites[item.sprite] : null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = RARITY_COLORS[item.rarity] || '#444';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

        if (sprite) {
            const scale = Math.min(canvas.width / sprite.width, canvas.height / sprite.height) * 0.7;
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

        ctx.fillStyle = RARITY_COLORS[item.rarity] || '#888';
        ctx.font = 'bold 14px VT323';
        ctx.textAlign = 'right';
        ctx.fillText(String(item.rarity || 'COMMON').toUpperCase(), canvas.width - 10, 25);
        
        if (item.stackable) {
            ctx.textAlign = 'left';
            ctx.fillStyle = 'var(--accent-item)';
            ctx.fillText(`MAX: ${item.maxStack}`, 10, canvas.height - 10);
        }
    };

    if (!isReady) return <div style={{ color: 'var(--accent-item)', padding: '20px' }}>MOUNTING ITEM REGISTRY...</div>;

    const currentItem = items[currentIndex] || getDefaultItem();
    const proceduralKeys = sprites ? Object.keys(sprites) : [];
    const previewImgUrl = resolveItemSpriteUrl(currentItem.sprite);
    const knownSelectValues = new Set([...proceduralKeys, ...pixelMartSprites]);
    const isCustomSpriteValue = Boolean(currentItem.sprite && !knownSelectValues.has(currentItem.sprite));
    const standardTypes = ['consumable', 'equipment', 'key', 'quest', 'material', 'misc', 'mana', 'heal', 'stamina'];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <Toast ref={toastRef} />
            
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between' }}>
                <div style={{ color: 'var(--accent-item)', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <i className="fas fa-box-open" style={{ marginRight: '8px' }}></i> ITEM STUDIO v2.1
                </div>
                <div style={{ fontSize: '0.75rem', color: isDirty ? 'var(--accent-item)' : '#444' }}>
                    {isDirty ? '● UNSAVED CHANGES' : '● SYNCED'}
                </div>
            </div>

            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" onClick={saveToServer} title="Save (Ctrl+S)"><Save size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => setShowTemplateModal(true)} title="New from Template"><PlusCircle size={16} /></button>
                <button className="tool-btn" onClick={addNewItem} title="New Item"><Plus size={16} /></button>
                <button className="tool-btn" onClick={duplicateItem} title="Duplicate"><Copy size={16} /></button>
                <button className="tool-btn" style={{ color: '#e74c3c' }} onClick={deleteItem} title="Delete"><Trash size={16} /></button>
                
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
                    title="INVENTORY" 
                    items={filteredItems} 
                    currentIndex={filteredItems.indexOf(items[currentIndex])} 
                    onSelect={(idx) => {
                        const actualIdx = items.indexOf(filteredItems[idx]);
                        if (actualIdx >= 0) setCurrentIndex(actualIdx);
                    }}
                    renderItem={(item, active) => (
                        <div style={{
                            padding: '10px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #1a1a1a',
                            color: active ? 'var(--accent-item)' : '#888',
                            background: active ? 'rgba(46, 204, 113, 0.05)' : 'transparent',
                            borderLeft: active ? '3px solid var(--accent-item)' : '3px solid transparent'
                        }}>
                            <div style={{ fontSize: '0.9rem' }}>{item.name?.toUpperCase() || 'UNNAMED'}</div>
                            <div style={{ fontSize: '0.65rem', color: '#444' }}>{item.id}</div>
                        </div>
                    )}
                />

                <div style={{ flexGrow: 1, background: 'var(--bg-canvas)', overflowY: 'auto', padding: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <FormSection title="Identity">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Registry ID</label>
                                        <input type="text" value={currentItem.id} onChange={(e) => updateCurrentItem('id', e.target.value)} />
                                    </div>
                                    <div>
                                        <label>Item Name</label>
                                        <input type="text" value={currentItem.name} onChange={(e) => updateCurrentItem('name', e.target.value)} />
                                    </div>
                                </div>
                                <label>Description</label>
                                <textarea rows={3} value={currentItem.desc} onChange={(e) => updateCurrentItem('desc', e.target.value)} />
                            </FormSection>

                            <FormSection title="Base Stats">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Category</label>
                                        <select value={currentItem.type} onChange={(e) => updateCurrentItem('type', e.target.value)}>
                                            {!standardTypes.includes(currentItem.type) && (
                                                <option value={currentItem.type}>{currentItem.type}</option>
                                            )}
                                            <option value="consumable">Consumable</option>
                                            <option value="equipment">Equipment</option>
                                            <option value="mana">Mana</option>
                                            <option value="heal">Heal</option>
                                            <option value="stamina">Stamina</option>
                                            <option value="key">Key Item</option>
                                            <option value="quest">Quest Item</option>
                                            <option value="material">Material</option>
                                            <option value="misc">Miscellaneous</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label>Base Value (G)</label>
                                        <input type="number" value={currentItem.value} onChange={(e) => updateCurrentItem('value', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="Advanced Properties (JSON)">
                                <textarea 
                                    rows={8} 
                                    value={propsJson} 
                                    onChange={(e) => handlePropsChange(e.target.value)} 
                                    style={{ 
                                        fontFamily: 'monospace', fontSize: '0.85rem', 
                                        borderColor: jsonError ? '#e74c3c' : '#222' 
                                    }}
                                />
                                {jsonError && <div style={{ color: '#e74c3c', fontSize: '0.7rem', marginTop: '5px' }}>INVALID JSON FORMAT</div>}
                            </FormSection>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <FormSection title="Rarity & Stacking">
                                <div style={{ marginBottom: '15px' }}>
                                    <label>Rarity Level</label>
                                    <select value={currentItem.rarity} onChange={(e) => updateCurrentItem('rarity', e.target.value)}>
                                        <option value="common">Common (White)</option>
                                        <option value="uncommon">Uncommon (Green)</option>
                                        <option value="rare">Rare (Blue)</option>
                                        <option value="epic">Epic (Purple)</option>
                                        <option value="legendary">Legendary (Gold)</option>
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Stackable</label>
                                        <select value={String(currentItem.stackable)} onChange={(e) => updateCurrentItem('stackable', e.target.value === 'true')}>
                                            <option value="true">Yes</option>
                                            <option value="false">No</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label>Max Stack</label>
                                        <input type="number" value={currentItem.maxStack} onChange={(e) => updateCurrentItem('maxStack', Math.max(1, parseInt(e.target.value, 10) || 1))} />
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="Visuals">
                                <div style={{ marginBottom: '12px' }}>
                                    <label>Sprite Picker</label>
                                    <select value={currentItem.sprite} onChange={(e) => updateCurrentItem('sprite', e.target.value)}>
                                        {isCustomSpriteValue && (
                                            <option value={currentItem.sprite}>{currentItem.sprite}</option>
                                        )}
                                        {proceduralKeys.length > 0 && (
                                            <optgroup label="Pixel Art Sprites">
                                                {proceduralKeys.map(key => (
                                                    <option key={key} value={key}>[PIXEL] {String(key).toUpperCase()}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        {pixelMartSprites.length > 0 && (
                                            <optgroup label="Pixel Mart PNGs">
                                                {pixelMartSprites.map(png => (
                                                    <option key={png} value={png}>[MART] {png}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                    <label>Custom Sprite Path / Key</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. banana.png or assets/sprites/gem.png"
                                        value={currentItem.sprite}
                                        onChange={(e) => updateCurrentItem('sprite', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label>UI Icon</label>
                                    <input
                                        type="text"
                                        placeholder="Icon key or PNG path"
                                        value={currentItem.icon}
                                        onChange={(e) => updateCurrentItem('icon', e.target.value)}
                                    />
                                </div>
                            </FormSection>
                        </div>
                    </div>
                </div>

                <div className="panel" style={{ width: '320px', borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
                    <div className="panel-header">OBJECT PREVIEW</div>
                    <div className="panel-content">
                        <div style={{ 
                            width: '100%', aspectRatio: '1', background: '#000', border: '1px solid #333', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                            backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)',
                            backgroundSize: '15px 15px'
                        }}>
                            <canvas ref={previewCanvasRef} width={256} height={256} style={{ width: '192px', height: '192px', imageRendering: 'pixelated' }} />
                            {previewImgUrl && !imgLoadError && (
                                <img
                                    src={previewImgUrl}
                                    alt={currentItem.name}
                                    onError={() => setImgLoadError(true)}
                                    style={{
                                        position: 'absolute',
                                        width: '128px',
                                        height: '128px',
                                        objectFit: 'contain',
                                        imageRendering: 'pixelated',
                                        pointerEvents: 'none'
                                    }}
                                />
                            )}
                        </div>
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <div style={{ color: '#444', fontSize: '0.8rem', letterSpacing: '1px' }}>REDGLITCH ITEM RENDERER</div>
                            <button className="tool-btn" style={{ width: '100%', marginTop: '20px', gap: '8px' }} onClick={() => openPixelSourceEditor(currentItem.sprite)}>
                                <Edit3 size={14} /> EDIT SOURCE
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showTemplateModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="panel" style={{ width: '450px', height: 'auto', maxHeight: '80vh', border: '2px solid var(--accent-item)', boxShadow: '0 0 50px rgba(0,0,0,1)' }}>
                        <div className="panel-header">
                            ITEM MODELS
                            <button className="tool-btn" onClick={() => setShowTemplateModal(false)}>×</button>
                        </div>
                        <div className="panel-content" style={{ padding: '15px' }}>
                            {templates.map(t => (
                                <div key={t.id} className="template-item" onClick={() => {
                                    const { components: _comp, ...restData } = (t.data || {});
                                    const newItem = normalizeItem({
                                        ...getDefaultItem(),
                                        ...restData,
                                        id: makeUniqueCloneId(`${t.id}_${Date.now().toString().slice(-4)}`, new Set(items.map(i => i.id))),
                                        name: t.name || restData.name || t.id
                                    });
                                    setItems([...items, newItem]);
                                    setCurrentIndex(items.length);
                                    setShowTemplateModal(false);
                                    setIsDirty(true);
                                }}
                                style={{ padding: '15px', margin: '8px 0', background: '#111', border: '1px solid #333', cursor: 'pointer', borderRadius: '4px' }}
                                >
                                    <div style={{ fontWeight: 'bold', color: 'var(--accent-item)', fontSize: '1.1rem' }}>{t.name?.toUpperCase() ?? ''}</div>
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

export default ItemEditor;
