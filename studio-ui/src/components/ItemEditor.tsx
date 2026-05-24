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
    icon: string;
    rarity: string;
    stackable: boolean;
    maxStack: number;
    properties: any;
}

const ItemEditor: React.FC = () => {
    const { isReady, sprites, emit, projectState, subscribe } = useStudio();
    const [items, setItems] = useState<Item[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [templates, setTemplates] = useState<any[]>([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [propsJson, setPropsJson] = useState('');
    const [jsonError, setJsonError] = useState(false);

    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const toastRef = useRef<ToastHandle>(null);

    useEffect(() => {
        if (isReady) {
            loadItems();
            loadTemplates();
            
            // Listen for external load requests
            const unsub = subscribe('item:load', (event: any) => {
                if (event.data.itemId) {
                    const idx = items.findIndex(i => i.id === event.data.itemId);
                    if (idx >= 0) setCurrentIndex(idx);
                }
            });
            return unsub;
        }
    }, [isReady]);

    useEffect(() => {
        if (items[currentIndex]) {
            renderPreview();
            setPropsJson(JSON.stringify(items[currentIndex].properties || {}, null, 2));
        }
    }, [items, currentIndex, sprites]);

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
    }, [items]);

    const loadItems = async () => {
        try {
            const res = await fetch('/api/items');
            if (res.ok) {
                const data = await res.json();
                setItems(data.length > 0 ? data : [getDefaultItem()]);
            }
        } catch (e) {
            setItems([getDefaultItem()]);
        }
    };

    const loadTemplates = async () => {
        try {
            const res = await fetch('/api/templates/item');
            if (res.ok) {
                setTemplates(await res.json());
            }
        } catch (e) {}
    };

    const getDefaultItem = (): Item => ({
        id: 'item_' + Date.now().toString().slice(-6),
        name: 'New Item',
        sprite: 'irab_dhammah',
        type: 'misc',
        value: 0,
        desc: '',
        icon: 'irab_dhammah',
        rarity: 'common',
        stackable: true,
        maxStack: 99,
        properties: {}
    });

    const saveToServer = async () => {
        try {
            const res = await fetch('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(items)
            });
            if (res.ok) {
                setIsDirty(false);
                toastRef.current?.show('DATABASE SAVED', 'success');
                emit('item:saved_all', { count: items.length });
                
                if (projectState) {
                    const map: any = {};
                    items.forEach(i => map[i.id] = i);
                    projectState.set('items', map);
                }
            }
        } catch (e) {
            toastRef.current?.show('SAVE FAILED', 'error');
        }
    };

    const addNewItem = () => {
        const newItem = getDefaultItem();
        setItems([...items, newItem]);
        setCurrentIndex(items.length);
        setIsDirty(true);
    };

    const duplicateItem = () => {
        const current = items[currentIndex];
        const clone = { ...JSON.parse(JSON.stringify(current)), id: current.id + '_COPY' };
        setItems([...items, clone]);
        setCurrentIndex(items.length);
        setIsDirty(true);
        toastRef.current?.show('ITEM DUPLICATED', 'info');
    };

    const deleteItem = () => {
        if (items.length <= 1) return;
        const id = items[currentIndex].id;
        const newItems = items.filter((_, i) => i !== currentIndex);
        setItems(newItems);
        setCurrentIndex(Math.max(0, currentIndex - 1));
        setIsDirty(true);
        toastRef.current?.show(`DELETED ${id}`, 'info');
    };

    const updateCurrentItem = (field: keyof Item, value: any) => {
        const newItems = [...items];
        newItems[currentIndex] = { ...newItems[currentIndex], [field]: value };
        setItems(newItems);
        setIsDirty(true);
        emit('item:updated', { itemId: newItems[currentIndex].id, item: newItems[currentIndex] });
    };

    const handlePropsChange = (val: string) => {
        setPropsJson(val);
        try {
            const parsed = JSON.parse(val);
            setJsonError(false);
            const newItems = [...items];
            newItems[currentIndex].properties = parsed;
            setItems(newItems);
            setIsDirty(true);
        } catch (e) {
            setJsonError(true);
        }
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
        if (!canvas || !sprites) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const item = items[currentIndex];
        const sprite = sprites[item.sprite];

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const rarityBorder: any = {
            common: '#444',
            uncommon: '#2ecc71',
            rare: '#3498db',
            epic: '#9b59b6',
            legendary: '#f1c40f'
        };
        
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = rarityBorder[item.rarity] || '#444';
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

        ctx.fillStyle = rarityBorder[item.rarity] || '#888';
        ctx.font = 'bold 14px VT323';
        ctx.textAlign = 'right';
        ctx.fillText(item.rarity.toUpperCase(), canvas.width - 10, 25);
        
        if (item.stackable) {
            ctx.textAlign = 'left';
            ctx.fillStyle = 'var(--accent-item)';
            ctx.fillText(`MAX: ${item.maxStack}`, 10, canvas.height - 10);
        }
    };

    if (!isReady) return <div style={{ color: 'var(--accent-item)', padding: '20px' }}>MOUNTING ITEM REGISTRY...</div>;

    const currentItem = items[currentIndex] || getDefaultItem();

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
                    currentIndex={items.indexOf(filteredItems[currentIndex])} 
                    onSelect={(idx) => setCurrentIndex(items.indexOf(filteredItems[idx]))}
                    renderItem={(item, active) => (
                        <div style={{
                            padding: '10px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #1a1a1a',
                            color: active ? 'var(--accent-item)' : '#888',
                            background: active ? 'rgba(46, 204, 113, 0.05)' : 'transparent',
                            borderLeft: active ? '3px solid var(--accent-item)' : '3px solid transparent'
                        }}>
                            <div style={{ fontSize: '0.9rem' }}>{item.name.toUpperCase() || 'UNNAMED'}</div>
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
                                        <input type="text" value={currentItem.id} onChange={(e) => updateCurrentNPC('id', e.target.value)} />
                                    </div>
                                    <div>
                                        <label>Item Name</label>
                                        <input type="text" value={currentItem.name} onChange={(e) => updateCurrentNPC('name', e.target.value)} />
                                    </div>
                                </div>
                                <label>Description</label>
                                <textarea rows={3} value={currentItem.desc} onChange={(e) => updateCurrentNPC('desc', e.target.value)} />
                            </FormSection>

                            <FormSection title="Base Stats">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Category</label>
                                        <select value={currentItem.type} onChange={(e) => updateCurrentNPC('type', e.target.value)}>
                                            <option value="consumable">Consumable</option>
                                            <option value="equipment">Equipment</option>
                                            <option value="key">Key Item</option>
                                            <option value="quest">Quest Item</option>
                                            <option value="material">Material</option>
                                            <option value="misc">Miscellaneous</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label>Base Value (G)</label>
                                        <input type="number" value={currentItem.value} onChange={(e) => updateCurrentNPC('value', parseInt(e.target.value))} />
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
                                    <select value={currentItem.rarity} onChange={(e) => updateCurrentNPC('rarity', e.target.value)}>
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
                                        <select value={String(currentItem.stackable)} onChange={(e) => updateCurrentNPC('stackable', e.target.value === 'true')}>
                                            <option value="true">Yes</option>
                                            <option value="false">No</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label>Max Stack</label>
                                        <input type="number" value={currentItem.maxStack} onChange={(e) => updateCurrentNPC('maxStack', parseInt(e.target.value))} />
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="Visuals">
                                <label>Sprite Key</label>
                                <select value={currentItem.sprite} onChange={(e) => updateCurrentNPC('sprite', e.target.value)}>
                                    {sprites && Object.keys(sprites).map(key => (
                                        <option key={key} value={key}>{key.toUpperCase()}</option>
                                    ))}
                                </select>
                            </FormSection>
                        </div>
                    </div>
                </div>

                <div className="panel" style={{ width: '320px', borderLeft: '1px solid var(--border)', borderRight: 'none' }}>
                    <div className="panel-header">OBJECT PREVIEW</div>
                    <div className="panel-content">
                        <div style={{ 
                            width: '100%', aspectRatio: '1', background: '#000', border: '1px solid #333', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)',
                            backgroundSize: '15px 15px'
                        }}>
                            <canvas ref={previewCanvasRef} width={256} height={256} style={{ width: '192px', height: '192px', imageRendering: 'pixelated' }} />
                        </div>
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <div style={{ color: '#444', fontSize: '0.8rem', letterSpacing: '1px' }}>KETEBE ITEM RENDERER</div>
                            <button className="tool-btn" style={{ width: '100%', marginTop: '20px', gap: '8px' }} onClick={() => {
                                if (window.parent && window.parent.editSpriteInStudio) {
                                    window.parent.editSpriteInStudio(currentItem.sprite);
                                }
                            }}>
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
                                    const newItem = {
                                        ...getDefaultItem(),
                                        id: t.id + "_" + Date.now().toString().slice(-4),
                                        name: t.name,
                                        ...t.data
                                    };
                                    setItems([...items, newItem]);
                                    setCurrentIndex(items.length);
                                    setShowTemplateModal(false);
                                    setIsDirty(true);
                                }}
                                style={{ padding: '15px', margin: '8px 0', background: '#111', border: '1px solid #333', cursor: 'pointer', borderRadius: '4px' }}
                                >
                                    <div style={{ fontWeight: 'bold', color: 'var(--accent-item)', fontSize: '1.1rem' }}>{t.name.toUpperCase()}</div>
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
