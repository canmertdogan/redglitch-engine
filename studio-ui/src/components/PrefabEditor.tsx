import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useStudio } from '../hooks/useStudio';
import {
    Box, Save, Plus, Trash2, Copy, Search,
    ChevronRight, ChevronDown, Layers, Settings, FolderOpen, Grid3x3,
    ZoomIn, ZoomOut, X, FileCode, Heart, Clipboard, ClipboardPaste,
    Move, Sun, Coins, Atom, Boxes, Code2, Target, Eye, EyeOff, Lock, Unlock,
    Undo, Redo, ArrowUp, ArrowDown, Image as ImageIcon, Crosshair, MapPin, Minimize
} from 'lucide-react';
import Toast, { ToastHandle } from './shared/Toast';

// Component Interfaces
interface TransformComp { type: 'Transform'; x: number; y: number; scale: number; }
interface StatsComp { type: 'Stats'; hp: number; maxHp: number; damage: number; speed: number; xpValue: number; }
interface ColliderComp { type: 'Collider'; width: number; height: number; offsetX: number; offsetY: number; isTrigger: boolean; }
interface ScriptComp { type: 'Script'; scriptId: string; onDeath: string; onSpawn: string; }
interface LightComp { type: 'Light'; radius: number; color: string; intensity: number; pulse: boolean; }
interface LootComp { type: 'Loot'; table: string; chance: number; goldMin: number; goldMax: number; }
interface ParticleComp { type: 'Particle'; system: string; active: boolean; offset: { x: number; y: number }; }
interface PrefabComp { type: 'Prefab'; ref: string; x: number; y: number; scale: number; rotation: number; }

type Component = TransformComp | StatsComp | ColliderComp | ScriptComp | LightComp | LootComp | ParticleComp | PrefabComp;

interface ComponentWrapper {
    id: string;
    hidden: boolean;
    locked: boolean;
    data: Component;
}

interface Prefab {
    id: string;
    name: string;
    sprite: string;
    components: ComponentWrapper[];
}

const COMPONENT_TYPES: Record<string, any> = {
    Transform: { name: 'Transform', label: 'TRANSFORM', icon: <Move size={14} />, singleton: true, defaults: { x: 0, y: 0, scale: 3 } },
    Stats: { name: 'Stats', label: 'STATS', icon: <Heart size={14} />, singleton: true, defaults: { hp: 100, maxHp: 100, damage: 10, speed: 50, xpValue: 20 } },
    Collider: { name: 'Collider', label: 'COLLIDER', icon: <Target size={14} />, singleton: true, defaults: { width: 16, height: 16, offsetX: 0, offsetY: 0, isTrigger: false } },
    Script: { name: 'Script', label: 'SCRIPT', icon: <Code2 size={14} />, singleton: false, defaults: { scriptId: 'demo', onDeath: '', onSpawn: '' } },
    Light: { name: 'Light', label: 'LIGHT', icon: <Sun size={14} />, singleton: false, defaults: { radius: 100, color: '#ff0000', intensity: 0.5, pulse: false } },
    Loot: { name: 'Loot', label: 'LOOT', icon: <Coins size={14} />, singleton: false, defaults: { table: 'common', chance: 1.0, goldMin: 0, goldMax: 5 } },
    Particle: { name: 'Particle', label: 'PARTICLE', icon: <Atom size={14} />, singleton: false, defaults: { system: 'fire', active: true, offset: { x: 0, y: 0 } } },
    Prefab: { name: 'Prefab', label: 'PREFAB', icon: <Boxes size={14} />, singleton: false, defaults: { ref: '', x: 0, y: 0, scale: 1, rotation: 0 } },
};

let _globalClipboard: Component | null = null;

const RetroButton: React.FC<{ onClick: () => void; active?: boolean; danger?: boolean; title?: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ onClick, active, danger, title, children, style }) => (
    <button
        onClick={onClick}
        title={title}
        style={{
            background: active ? 'var(--accent)' : 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderBottomColor: '#000',
            borderRightColor: '#000',
            borderTopColor: '#3a3f4a',
            borderLeftColor: '#3a3f4a',
            color: active ? '#000' : (danger ? 'var(--danger)' : 'var(--text-main)'),
            padding: '4px',
            minWidth: '28px', height: '28px',
            cursor: 'pointer',
            display: 'inline-flex', justifyContent: 'center', alignItems: 'center',
            fontFamily: 'var(--font-pixel)', fontSize: '16px',
            ...style
        }}
        onMouseDown={(e) => {
            e.currentTarget.style.borderTopColor = '#000';
            e.currentTarget.style.borderLeftColor = '#000';
            e.currentTarget.style.borderBottomColor = '#3a3f4a';
            e.currentTarget.style.borderRightColor = '#3a3f4a';
        }}
        onMouseUp={(e) => {
            e.currentTarget.style.borderTopColor = '#3a3f4a';
            e.currentTarget.style.borderLeftColor = '#3a3f4a';
            e.currentTarget.style.borderBottomColor = '#000';
            e.currentTarget.style.borderRightColor = '#000';
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.borderTopColor = '#3a3f4a';
            e.currentTarget.style.borderLeftColor = '#3a3f4a';
            e.currentTarget.style.borderBottomColor = '#000';
            e.currentTarget.style.borderRightColor = '#000';
        }}
    >
        {children}
    </button>
);

const RetroInput: React.FC<{ value: any; onChange: (v: any) => void; type?: string; readOnly?: boolean; style?: React.CSSProperties }> = ({ value, onChange, type = 'text', readOnly, style }) => (
    <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        style={{
            background: 'var(--bg-deep)',
            border: '1px solid #000',
            borderBottomColor: '#3a3f4a',
            borderRightColor: '#3a3f4a',
            color: 'var(--accent)',
            padding: '2px 6px',
            fontFamily: 'var(--font-pixel)',
            fontSize: '16px',
            width: '100%',
            outline: 'none',
            opacity: readOnly ? 0.7 : 1,
            ...style
        }}
        onFocus={(e) => { if (!readOnly) e.currentTarget.style.background = '#000'; }}
        onBlur={(e) => { if (!readOnly) e.currentTarget.style.background = 'var(--bg-deep)'; }}
    />
);

const SpriteThumbnail: React.FC<{ spriteData: any, scale?: number }> = ({ spriteData, scale = 2 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    useEffect(() => {
        if (!canvasRef.current || !spriteData) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        const data = spriteData.data;
        const pal = spriteData.palette;
        
        data.forEach((row: string, y: number) => {
            for (let x = 0; x < row.length; x++) {
                if (pal[row[x]]) {
                    ctx.fillStyle = pal[row[x]];
                    ctx.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        });
    }, [spriteData, scale]);

    if (!spriteData) return <div style={{width: 32, height: 32, border: '1px dashed #444'}} />;
    return <canvas ref={canvasRef} width={spriteData.width * scale} height={spriteData.height * scale} style={{imageRendering: 'pixelated'}} />;
};

const PrefabEditor: React.FC = () => {
    const { isReady, sprites, emit, projectState } = useStudio();
    
    // Core State
    const [prefabs, setPrefabs] = useState<Prefab[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedCompIdx, setSelectedCompIdx] = useState(0);
    const [isDirty, setIsDirty] = useState(false);
    
    // History
    const [history, setHistory] = useState<Prefab[][]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Viewport State
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const zoomRef = useRef(2.0);
    const offsetRef = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const isDraggingGizmo = useRef(false);
    const dragTarget = useRef<{idx: number, type: string, startX: number, startY: number, startCompX: number, startCompY: number} | null>(null);
    const lastMouse = useRef({ x: 0, y: 0 });
    
    // Tools State
    const [showGrid, setShowGrid] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(false);
    const [gridSize, setGridSize] = useState(16);
    const [gizmoMode, setGizmoMode] = useState<'select'|'translate'>('translate');
    const [rawMode, setRawMode] = useState(false);
    
    // UI Panels
    const [showFileBrowser, setShowFileBrowser] = useState(false);
    const [showSpriteBrowser, setShowSpriteBrowser] = useState(false);
    const [availablePrefabs, setAvailablePrefabs] = useState<string[]>([]);
    const toastRef = useRef<ToastHandle>(null);

    const compOrder = Object.keys(COMPONENT_TYPES);

    useEffect(() => {
        if (isReady) loadPrefabs();
    }, [isReady]);

    useEffect(() => {
        renderPreview();
    }, [prefabs, currentIndex, sprites, showGrid, gridSize, selectedCompIdx, gizmoMode]);

    // History System
    const pushHistory = (newState: Prefab[]) => {
        const newHist = history.slice(0, historyIndex + 1);
        newHist.push(JSON.parse(JSON.stringify(newState)));
        if (newHist.length > 50) newHist.shift(); // Max 50 undos
        setHistory(newHist);
        setHistoryIndex(newHist.length - 1);
    };

    const undo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
            setPrefabs(JSON.parse(JSON.stringify(history[historyIndex - 1])));
            setIsDirty(true);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
            setPrefabs(JSON.parse(JSON.stringify(history[historyIndex + 1])));
            setIsDirty(true);
        }
    };

    const updateCurrentPrefab = (path: string, value: any, recordHistory = true) => {
        const newPrefabs = JSON.parse(JSON.stringify(prefabs));
        const prefab = newPrefabs[currentIndex];

        const keys = path.split('.');
        let current: any = prefab;
        for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;

        setPrefabs(newPrefabs);
        setIsDirty(true);
        if (recordHistory) pushHistory(newPrefabs);
    };

    const loadPrefabs = async () => {
        try {
            const res = await fetch('/api/assets?type=prefab');
            let initialData = [];
            if (res.ok) {
                const data = await res.json();
                initialData = data.length > 0 ? data.map((d: any) => ensureSchema(d)) : [getDefaultPrefab()];
            } else {
                initialData = [getDefaultPrefab()];
            }
            setPrefabs(initialData);
            pushHistory(initialData);
        } catch (e) {
            const def = [getDefaultPrefab()];
            setPrefabs(def);
            pushHistory(def);
        }
    };

    const ensureSchema = (d: any): Prefab => {
        let comps = Array.isArray(d.components) ? d.components : [{ type: 'Transform', ...COMPONENT_TYPES.Transform.defaults }];
        if (comps.length > 0 && !comps[0].id) {
            comps = comps.map((c: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                hidden: false,
                locked: false,
                data: { type: c.type || 'Transform', ...COMPONENT_TYPES[c.type || 'Transform']?.defaults, ...c }
            }));
        }
        return {
            id: d.id || d.name || 'prefab_' + Date.now(),
            name: d.name || d.id || 'New_Entity',
            sprite: d.sprite || 'player',
            components: comps
        };
    };

    const getDefaultPrefab = (): Prefab => ({
        id: 'prefab_' + Date.now(),
        name: 'New_Entity',
        sprite: 'player',
        components: [{
            id: 'root_transform', hidden: false, locked: false,
            data: { type: 'Transform', ...COMPONENT_TYPES.Transform.defaults }
        }]
    });

    const addComponent = (type: string) => {
        const meta = COMPONENT_TYPES[type];
        if (!meta) return;

        if (meta.singleton && prefabs[currentIndex].components.find(c => c.data.type === type)) {
            toastRef.current?.show(`${type} ALREADY EXISTS`, 'error');
            return;
        }

        const newComps = [...prefabs[currentIndex].components, {
            id: Math.random().toString(36).substr(2, 9),
            hidden: false, locked: false,
            data: { type, ...JSON.parse(JSON.stringify(meta.defaults)) } as Component
        }];
        updateCurrentPrefab('components', newComps);
        setSelectedCompIdx(newComps.length - 1);
    };

    const removeComponent = (idx: number) => {
        const comp = prefabs[currentIndex].components[idx];
        if (comp.data.type === 'Transform') return;
        const newComps = prefabs[currentIndex].components.filter((_, i) => i !== idx);
        updateCurrentPrefab('components', newComps);
        setSelectedCompIdx(Math.max(0, Math.min(selectedCompIdx, newComps.length - 1)));
    };
    
    const moveComponent = (idx: number, dir: 1 | -1) => {
        if (idx + dir < 0 || idx + dir >= prefabs[currentIndex].components.length) return;
        const newComps = [...prefabs[currentIndex].components];
        const temp = newComps[idx];
        newComps[idx] = newComps[idx + dir];
        newComps[idx + dir] = temp;
        updateCurrentPrefab('components', newComps);
        setSelectedCompIdx(idx + dir);
    };

    const duplicateComponent = (idx: number) => {
        const comp = prefabs[currentIndex].components[idx];
        if (COMPONENT_TYPES[comp.data.type]?.singleton) {
            toastRef.current?.show('CANNOT DUPLICATE SINGLETON', 'error');
            return;
        }
        const clone = JSON.parse(JSON.stringify(comp));
        clone.id = Math.random().toString(36).substr(2, 9);
        const newComps = [...prefabs[currentIndex].components, clone];
        updateCurrentPrefab('components', newComps);
        setSelectedCompIdx(newComps.length - 1);
    };
    
    const copyComponentToClipboard = (idx: number) => {
        _globalClipboard = JSON.parse(JSON.stringify(prefabs[currentIndex].components[idx].data));
        toastRef.current?.show(`COPIED ${_globalClipboard?.type}`, 'info');
    };

    const pasteComponentFromClipboard = () => {
        if (!_globalClipboard) return;
        const type = _globalClipboard.type;
        const meta = COMPONENT_TYPES[type];
        if (meta?.singleton && prefabs[currentIndex].components.find(c => c.data.type === type)) {
            toastRef.current?.show(`${type} ALREADY EXISTS IN THIS PREFAB`, 'error');
            return;
        }
        const cloneData = JSON.parse(JSON.stringify(_globalClipboard));
        const newComps = [...prefabs[currentIndex].components, {
            id: Math.random().toString(36).substr(2, 9),
            hidden: false, locked: false,
            data: cloneData
        }];
        updateCurrentPrefab('components', newComps);
        setSelectedCompIdx(newComps.length - 1);
        toastRef.current?.show(`PASTED ${type}`, 'success');
    };

    const newPrefab = () => {
        const def = getDefaultPrefab();
        setPrefabs([...prefabs, def]);
        setCurrentIndex(prefabs.length);
        setIsDirty(true);
        pushHistory([...prefabs, def]);
    };

    const duplicatePrefab = () => {
        const current = prefabs[currentIndex];
        const clone = JSON.parse(JSON.stringify(current));
        clone.id = current.id + '_copy_' + Date.now().toString().slice(-4);
        clone.name = current.name + ' COPY';
        const newArr = [...prefabs, clone];
        setPrefabs(newArr);
        setCurrentIndex(newArr.length - 1);
        setIsDirty(true);
        pushHistory(newArr);
    };

    const deletePrefab = () => {
        if (prefabs.length <= 1) return;
        const newPrefabs = prefabs.filter((_, i) => i !== currentIndex);
        setPrefabs(newPrefabs);
        setCurrentIndex(Math.max(0, currentIndex - 1));
        setIsDirty(true);
        pushHistory(newPrefabs);
    };

    const saveToServer = async () => {
        const prefab = prefabs[currentIndex];
        if (!prefab) return;

        let name = prefab.name;
        if (!name || name === 'New_Entity') {
            const n = prompt('Enter unique prefab name:');
            if (!n) return;
            updateCurrentPrefab('name', n, false);
            name = n;
        }

        try {
            const engineFormat = {
                name: prefab.name,
                sprite: prefab.sprite,
                components: prefab.components.map(c => c.data)
            };

            const res = await fetch('/api/ide/write', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: `dunyalar/definitions/${name}.json`,
                    content: JSON.stringify(engineFormat, null, 2)
                })
            });

            if (res.ok) {
                setIsDirty(false);
                toastRef.current?.show('SAVED TO DISK', 'success');
                emit('prefab:saved', { prefabId: prefab.id });
                if (projectState) projectState.set(`prefabs.${name}`, { name, lastModified: Date.now() });
            } else {
                toastRef.current?.show('SAVE FAILED', 'error');
            }
        } catch (e) {
            toastRef.current?.show('IO ERROR', 'error');
        }
    };
    
    const autoFitCollider = () => {
        const prefab = prefabs[currentIndex];
        const spriteData = sprites && sprites[prefab.sprite];
        if (!spriteData) {
            toastRef.current?.show('NO SPRITE SELECTED', 'error');
            return;
        }
        
        let minX = spriteData.width, maxX = 0, minY = spriteData.height, maxY = 0;
        let found = false;
        
        spriteData.data.forEach((row: string, y: number) => {
            for (let x = 0; x < row.length; x++) {
                if (spriteData.palette[row[x]]) {
                    found = true;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        });

        if (!found) return;

        const transform = prefab.components.find(c => c.data.type === 'Transform')?.data as TransformComp;
        const scale = transform?.scale || 3;

        const w = (maxX - minX + 1);
        const h = (maxY - minY + 1);

        const ox = scale * (minX - spriteData.width / 2 + w / 2);
        const oy = scale * (minY - spriteData.height / 2 + h / 2);

        const compWrap = prefab.components[selectedCompIdx];
        if (compWrap && compWrap.data.type === 'Collider') {
            const newCol = { ...compWrap.data as ColliderComp };
            newCol.width = w;
            newCol.height = h;
            newCol.offsetX = ox;
            newCol.offsetY = oy;
            updateCurrentPrefab(`components.${selectedCompIdx}.data`, newCol);
            toastRef.current?.show('COLLIDER AUTO-FITTED', 'success');
        }
    };

    // Viewport Interactions
    const screenToWorld = (sx: number, sy: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return {x:0, y:0};
        const rect = canvas.getBoundingClientRect();
        const cx = sx - rect.left;
        const cy = sy - rect.top;
        const w = canvas.width;
        const h = canvas.height;
        return {
            x: (cx - w/2 - offsetRef.current.x) / zoomRef.current,
            y: (cy - h/2 - offsetRef.current.y) / zoomRef.current
        };
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            zoomRef.current = Math.max(0.2, Math.min(20, zoomRef.current * delta));
            renderPreview();
        };

        const onMouseDown = (e: MouseEvent) => {
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                isDragging.current = true;
                lastMouse.current = { x: e.clientX, y: e.clientY };
                return;
            }

            if (e.button === 0 && gizmoMode === 'translate') {
                const wpos = screenToWorld(e.clientX, e.clientY);
                const prefab = prefabs[currentIndex];
                if (!prefab) return;

                const comp = prefab.components[selectedCompIdx];
                if (comp && !comp.locked && !comp.hidden) {
                    if (comp.data.type === 'Transform' || comp.data.type === 'Collider' || comp.data.type === 'Prefab') {
                        const cx = (comp.data as any).x || (comp.data.type === 'Collider' ? (comp.data as ColliderComp).offsetX : 0);
                        const cy = (comp.data as any).y || (comp.data.type === 'Collider' ? (comp.data as ColliderComp).offsetY : 0);
                        
                        const dist = Math.sqrt(Math.pow(wpos.x - cx, 2) + Math.pow(wpos.y - cy, 2));
                        if (dist < 20 / zoomRef.current) {
                            isDraggingGizmo.current = true;
                            dragTarget.current = {
                                idx: selectedCompIdx,
                                type: comp.data.type,
                                startX: wpos.x,
                                startY: wpos.y,
                                startCompX: cx,
                                startCompY: cy
                            };
                            return;
                        }
                    }
                }
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (isDragging.current) {
                offsetRef.current.x += e.clientX - lastMouse.current.x;
                offsetRef.current.y += e.clientY - lastMouse.current.y;
                lastMouse.current = { x: e.clientX, y: e.clientY };
                renderPreview();
            } else if (isDraggingGizmo.current && dragTarget.current) {
                const wpos = screenToWorld(e.clientX, e.clientY);
                let dx = wpos.x - dragTarget.current.startX;
                let dy = wpos.y - dragTarget.current.startY;
                
                let nx = dragTarget.current.startCompX + dx;
                let ny = dragTarget.current.startCompY + dy;

                if (snapToGrid) {
                    nx = Math.round(nx / gridSize) * gridSize;
                    ny = Math.round(ny / gridSize) * gridSize;
                }

                const newPrefabs = [...prefabs];
                const comp = newPrefabs[currentIndex].components[dragTarget.current.idx].data as any;
                
                if (comp.type === 'Collider') {
                    comp.offsetX = nx;
                    comp.offsetY = ny;
                } else {
                    comp.x = nx;
                    comp.y = ny;
                }
                
                setPrefabs(newPrefabs); 
            }
        };

        const onMouseUp = () => { 
            isDragging.current = false; 
            if (isDraggingGizmo.current) {
                isDraggingGizmo.current = false;
                dragTarget.current = null;
                pushHistory(prefabs);
                setIsDirty(true);
            }
        };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [prefabs, currentIndex, selectedCompIdx, gizmoMode, snapToGrid, gridSize]);

    const renderPreview = () => {
        const canvas = canvasRef.current;
        if (!canvas || !sprites) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const prefab = prefabs[currentIndex];
        if (!prefab) return;

        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'var(--bg-root)';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(Math.floor(w / 2 + offsetRef.current.x), Math.floor(h / 2 + offsetRef.current.y));
        ctx.scale(zoomRef.current, zoomRef.current);

        // Draw World Grid
        if (showGrid) {
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1 / zoomRef.current;
            const size = 1000;
            ctx.beginPath();
            for (let x = -size; x <= size; x += gridSize) { ctx.moveTo(x, -size); ctx.lineTo(x, size); }
            for (let y = -size; y <= size; y += gridSize) { ctx.moveTo(-size, y); ctx.lineTo(size, y); }
            ctx.stroke();

            // Origin lines
            ctx.strokeStyle = 'rgba(255,0,0,0.3)';
            ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.stroke();
            ctx.strokeStyle = 'rgba(0,255,0,0.3)';
            ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(0, size); ctx.stroke();
        }

        const transformWrapper = prefab.components.find(c => c.data.type === 'Transform');
        const transform = transformWrapper?.data as TransformComp | undefined;
        const scale = transform?.scale || 3;
        const tX = transform?.x || 0;
        const tY = transform?.y || 0;

        // Draw Sprite
        if (prefab.sprite && sprites[prefab.sprite] && (!transformWrapper || !transformWrapper.hidden)) {
            const sprite = sprites[prefab.sprite];
            const sw = sprite.width * scale;
            const sh = sprite.height * scale;

            sprite.data.forEach((row: string, y: number) => {
                for (let x = 0; x < row.length; x++) {
                    const color = sprite.palette[row[x]];
                    if (color) {
                        ctx.fillStyle = color;
                        ctx.fillRect(
                            tX + x * scale - sw / 2,
                            tY + y * scale - sh / 2,
                            scale, scale
                        );
                    }
                }
            });
            
            if (selectedCompIdx === prefab.components.indexOf(transformWrapper!)) {
                ctx.strokeStyle = 'var(--accent)';
                ctx.lineWidth = 1 / zoomRef.current;
                ctx.strokeRect(tX - sw/2, tY - sh/2, sw, sh);
            }
        }

        // Draw Components
        prefab.components.forEach((compWrap, idx) => {
            if (compWrap.hidden) return;
            const comp = compWrap.data;
            const isSelected = selectedCompIdx === idx;
            const lineW = 2 / zoomRef.current;

            if (comp.type === 'Collider') {
                ctx.strokeStyle = isSelected ? '#00cc66' : 'rgba(0, 204, 102, 0.4)';
                ctx.lineWidth = lineW;
                const cw = comp.width * scale;
                const ch = comp.height * scale;
                ctx.strokeRect(tX - cw/2 + comp.offsetX, tY - ch/2 + comp.offsetY, cw, ch);
                
                if (isSelected && gizmoMode === 'translate') {
                    drawGizmo(ctx, tX + comp.offsetX, tY + comp.offsetY, zoomRef.current);
                }
            }

            if (comp.type === 'Light') {
                ctx.strokeStyle = isSelected ? comp.color : 'rgba(255,255,255,0.2)';
                ctx.lineWidth = lineW;
                ctx.beginPath();
                ctx.arc(tX, tY, comp.radius, 0, Math.PI * 2);
                ctx.stroke();
            }

            if (comp.type === 'Prefab') {
                ctx.save();
                ctx.translate(comp.x, comp.y);
                if (comp.rotation) ctx.rotate(comp.rotation * Math.PI / 180);

                ctx.strokeStyle = isSelected ? '#ffcc00' : '#888';
                ctx.lineWidth = lineW;
                ctx.strokeRect(-16*comp.scale, -16*comp.scale, 32*comp.scale, 32*comp.scale);
                ctx.restore();
                
                if (isSelected && gizmoMode === 'translate') {
                    drawGizmo(ctx, comp.x, comp.y, zoomRef.current);
                }
            }
        });

        ctx.restore();
    };

    const drawGizmo = (ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number) => {
        const size = 15 / zoom;
        const lw = 2 / zoom;
        ctx.strokeStyle = '#ff0000'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + size, y); ctx.stroke();
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); ctx.moveTo(x + size, y - lw*2); ctx.lineTo(x + size + lw*4, y); ctx.lineTo(x + size, y + lw*2); ctx.fill();
        
        ctx.strokeStyle = '#00ff00';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + size); ctx.stroke();
        ctx.fillStyle = '#00ff00';
        ctx.beginPath(); ctx.moveTo(x - lw*2, y + size); ctx.lineTo(x, y + size + lw*4); ctx.lineTo(x + lw*2, y + size); ctx.fill();
        
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(x - lw*2, y - lw*2, lw*4, lw*4);
    };

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px', fontFamily: 'var(--font-pixel)', fontSize: '20px' }}>INITIALIZING STUDIO...</div>;

    const currentPrefab = prefabs[currentIndex] || getDefaultPrefab();
    const currentCompWrap = currentPrefab.components[selectedCompIdx];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-root)', color: 'var(--text-main)', fontFamily: 'var(--font-pixel)', fontSize: '18px', userSelect: 'none' }}>
            <Toast ref={toastRef} />
            <style>
                {`
                ::-webkit-scrollbar { width: 12px; height: 12px; }
                ::-webkit-scrollbar-track { background: var(--bg-deep); border-left: 1px solid var(--border); }
                ::-webkit-scrollbar-thumb { background: #3a3f4a; border: 1px solid var(--border); }
                ::-webkit-scrollbar-thumb:hover { background: #4a4f5a; }
                `}
            </style>

            {/* TOP MENU BAR */}
            <div style={{ background: 'var(--bg-panel)', borderBottom: '2px solid #000', display: 'flex', padding: '4px', alignItems: 'center', gap: '8px' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Box size={18} /> REDGLITCH 3D STUDIO v3.2
                </div>
                
                <RetroButton onClick={() => setShowFileBrowser(true)} title="Open"><FolderOpen size={16}/></RetroButton>
                <RetroButton onClick={saveToServer} title="Save (Ctrl+S)" active={isDirty}><Save size={16}/></RetroButton>
                <div style={{ width: '2px', height: '24px', background: '#000', margin: '0 4px' }} />
                <RetroButton onClick={undo} title="Undo" style={{ opacity: historyIndex > 0 ? 1 : 0.3 }}><Undo size={16}/></RetroButton>
                <RetroButton onClick={redo} title="Redo" style={{ opacity: historyIndex < history.length - 1 ? 1 : 0.3 }}><Redo size={16}/></RetroButton>
                <div style={{ width: '2px', height: '24px', background: '#000', margin: '0 4px' }} />
                <RetroButton onClick={() => setRawMode(!rawMode)} active={rawMode} title="Toggle JSON Code Mode"><Code2 size={16}/></RetroButton>
                
                <div style={{ flexGrow: 1 }} />
                
                <span style={{ fontSize: '14px', color: 'var(--text-dim)' }}>GRID:</span>
                <RetroInput type="number" value={gridSize} onChange={v => setGridSize(parseFloat(v)||16)} style={{ width: '50px', height: '28px' }} />
                <RetroButton onClick={() => setShowGrid(!showGrid)} active={showGrid} title="Toggle Grid"><Grid3x3 size={16}/></RetroButton>
                <RetroButton onClick={() => setSnapToGrid(!snapToGrid)} active={snapToGrid} title="Snap to Grid"><MapPin size={16}/></RetroButton>
                <div style={{ width: '2px', height: '24px', background: '#000', margin: '0 4px' }} />
                <RetroButton onClick={() => setGizmoMode('select')} active={gizmoMode === 'select'} title="Select Tool"><Crosshair size={16}/></RetroButton>
                <RetroButton onClick={() => setGizmoMode('translate')} active={gizmoMode === 'translate'} title="Translate Tool"><Move size={16}/></RetroButton>
                <div style={{ width: '2px', height: '24px', background: '#000', margin: '0 4px' }} />
                <div style={{ padding: '0 10px', color: isDirty ? 'var(--danger)' : '#00cc66' }}>{isDirty ? 'UNSAVED' : 'SYNCED'}</div>
            </div>

            <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
                
                {/* LEFT TOOLBAR: PREFABS */}
                <div style={{ width: '240px', background: 'var(--bg-panel)', borderRight: '2px solid #000', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ background: '#000', color: 'var(--accent)', padding: '4px 8px', fontWeight: 'bold', borderBottom: '1px solid #3a3f4a', display: 'flex', justifyContent: 'space-between' }}>
                        PREFAB LIBRARY
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <RetroButton onClick={newPrefab} style={{ width: '20px', height: '20px', padding: 0 }}><Plus size={12}/></RetroButton>
                            <RetroButton onClick={duplicatePrefab} style={{ width: '20px', height: '20px', padding: 0 }}><Copy size={12}/></RetroButton>
                            <RetroButton danger onClick={deletePrefab} style={{ width: '20px', height: '20px', padding: 0 }}><Trash2 size={12}/></RetroButton>
                        </div>
                    </div>
                    
                    <div style={{ flexGrow: 1, overflowY: 'auto', padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {prefabs.map((p, idx) => (
                            <div
                                key={p.id}
                                onClick={() => setCurrentIndex(idx)}
                                style={{
                                    padding: '6px 8px',
                                    background: currentIndex === idx ? 'var(--bg-deep)' : 'transparent',
                                    border: `1px solid ${currentIndex === idx ? 'var(--accent)' : 'transparent'}`,
                                    color: currentIndex === idx ? 'var(--accent)' : 'var(--text-main)',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}
                            >
                                <Boxes size={14} /> {p.name}
                            </div>
                        ))}
                    </div>
                </div>

                {/* CENTER: VIEWPORT */}
                <div style={{ flexGrow: 1, position: 'relative', background: '#000' }}>
                    <canvas
                        ref={canvasRef}
                        width={800} height={600}
                        style={{ width: '100%', height: '100%', display: 'block', cursor: gizmoMode === 'translate' ? 'move' : 'default' }}
                    />
                    
                    <div style={{ position: 'absolute', top: '10px', left: '10px', color: 'var(--accent)', textShadow: '1px 1px 0 #000' }}>
                        [{currentPrefab.name}] - Zoom: {zoomRef.current.toFixed(1)}x
                    </div>
                </div>

                {/* RIGHT TOOLBAR: PROPERTIES & HIERARCHY */}
                <div style={{ width: rawMode ? '600px' : '320px', transition: 'width 0.2s', background: 'var(--bg-panel)', borderLeft: '2px solid #000', display: 'flex', flexDirection: 'column' }}>
                    
                    {rawMode ? (
                        // RAW JSON MODE
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ background: '#000', color: 'var(--accent)', padding: '4px 8px', fontWeight: 'bold', borderBottom: '1px solid #3a3f4a', display: 'flex', justifyContent: 'space-between' }}>
                                RAW JSON CODE VIEW
                                <RetroButton onClick={() => setRawMode(false)} style={{ width: '20px', height: '20px', padding: 0 }}><X size={12}/></RetroButton>
                            </div>
                            <textarea 
                                style={{ 
                                    flexGrow: 1, background: 'var(--bg-deep)', color: '#00ffcc', 
                                    fontFamily: 'monospace', fontSize: '14px', border: 'none', 
                                    padding: '10px', outline: 'none', resize: 'none'
                                }}
                                value={JSON.stringify({ name: currentPrefab.name, sprite: currentPrefab.sprite, components: currentPrefab.components.map(c => c.data) }, null, 2)}
                                onChange={(e) => {
                                    try {
                                        const parsed = JSON.parse(e.target.value);
                                        const reconstructed = {
                                            id: currentPrefab.id,
                                            name: parsed.name || currentPrefab.name,
                                            sprite: parsed.sprite || currentPrefab.sprite,
                                            components: (parsed.components || []).map((c:any, i:number) => ({
                                                id: currentPrefab.components[i]?.id || Math.random().toString(36).substr(2, 9),
                                                hidden: currentPrefab.components[i]?.hidden || false,
                                                locked: currentPrefab.components[i]?.locked || false,
                                                data: c
                                            }))
                                        };
                                        const newArr = [...prefabs];
                                        newArr[currentIndex] = reconstructed;
                                        setPrefabs(newArr);
                                        setIsDirty(true);
                                    } catch(err) {
                                        // Ignore parse errors while typing
                                    }
                                }}
                            />
                        </div>
                    ) : (
                        // VISUAL EDITOR
                        <>
                            {/* HIERARCHY */}
                            <div style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column', borderBottom: '2px solid #000' }}>
                                <div style={{ background: '#000', color: 'var(--accent)', padding: '4px 8px', fontWeight: 'bold', borderBottom: '1px solid #3a3f4a', display: 'flex', justifyContent: 'space-between' }}>
                                    MODIFIER STACK
                                    <RetroButton onClick={pasteComponentFromClipboard} title="Paste Component" style={{ width: '20px', height: '20px', padding: 0 }}><ClipboardPaste size={12}/></RetroButton>
                                </div>
                                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {currentPrefab.components.map((c, i) => (
                                        <div
                                            key={c.id}
                                            style={{
                                                background: selectedCompIdx === i ? 'var(--bg-deep)' : '#1a1d26',
                                                border: `1px solid ${selectedCompIdx === i ? 'var(--accent)' : '#3a3f4a'}`,
                                                color: c.hidden ? '#555' : (selectedCompIdx === i ? 'var(--accent)' : 'var(--text-main)'),
                                                display: 'flex', alignItems: 'center', padding: '4px 8px', gap: '8px'
                                            }}
                                            onClick={() => setSelectedCompIdx(i)}
                                        >
                                            <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                {COMPONENT_TYPES[c.data.type]?.icon} {c.data.type}
                                            </div>
                                            <div style={{ display: 'flex', gap: '2px' }}>
                                                <RetroButton onClick={(e) => { e.stopPropagation(); updateCurrentPrefab(`components.${i}.hidden`, !c.hidden); }} style={{ width: '20px', height: '20px', padding: 0 }}>
                                                    {c.hidden ? <EyeOff size={12}/> : <Eye size={12}/>}
                                                </RetroButton>
                                                <RetroButton onClick={(e) => { e.stopPropagation(); updateCurrentPrefab(`components.${i}.locked`, !c.locked); }} style={{ width: '20px', height: '20px', padding: 0 }}>
                                                    {c.locked ? <Lock size={12}/> : <Unlock size={12}/>}
                                                </RetroButton>
                                                {c.data.type !== 'Transform' && (
                                                    <>
                                                        <RetroButton onClick={(e) => { e.stopPropagation(); moveComponent(i, -1); }} style={{ width: '20px', height: '20px', padding: 0 }}><ArrowUp size={12}/></RetroButton>
                                                        <RetroButton onClick={(e) => { e.stopPropagation(); copyComponentToClipboard(i); }} style={{ width: '20px', height: '20px', padding: 0 }}><Clipboard size={12}/></RetroButton>
                                                        <RetroButton danger onClick={(e) => { e.stopPropagation(); removeComponent(i); }} style={{ width: '20px', height: '20px', padding: 0 }}><Trash2 size={12}/></RetroButton>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                
                                {/* ADD COMPONENT GRID */}
                                <div style={{ padding: '4px', borderTop: '1px solid #3a3f4a', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                    {compOrder.map(type => {
                                        const meta = COMPONENT_TYPES[type];
                                        const exists = meta.singleton && currentPrefab.components.find(c => c.data.type === type);
                                        return (
                                            <RetroButton 
                                                key={type} 
                                                onClick={() => !exists && addComponent(type)}
                                                style={{ height: '24px', fontSize: '14px', opacity: exists ? 0.3 : 1, justifyContent: 'flex-start', paddingLeft: '8px' }}
                                            >
                                                {meta.icon} <span style={{marginLeft: '6px'}}>{meta.label}</span>
                                            </RetroButton>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* PROPERTIES */}
                            <div style={{ flex: '1 1 50%', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ background: '#000', color: 'var(--accent)', padding: '4px 8px', fontWeight: 'bold', borderBottom: '1px solid #3a3f4a' }}>
                                    PROPERTIES
                                </div>
                                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ color: 'var(--text-dim)', fontSize: '14px' }}>PREFAB NAME</label>
                                        <RetroInput value={currentPrefab.name} onChange={(v) => updateCurrentPrefab('name', v)} />
                                    </div>

                                    {currentCompWrap?.data.type === 'Transform' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                                            <label style={{ color: 'var(--text-dim)', fontSize: '14px', display: 'flex', justifyContent: 'space-between' }}>
                                                BASE SPRITE
                                                <RetroButton onClick={() => setShowSpriteBrowser(!showSpriteBrowser)} style={{ height: '18px', padding: '0 4px', fontSize: '12px' }}>
                                                    <ImageIcon size={10} style={{marginRight:'4px'}}/> BROWSE
                                                </RetroButton>
                                            </label>
                                            <RetroInput value={currentPrefab.sprite} onChange={(v) => updateCurrentPrefab('sprite', v)} />
                                        </div>
                                    )}

                                    {currentCompWrap?.data.type === 'Collider' && (
                                        <div style={{ marginTop: '8px' }}>
                                            <RetroButton onClick={autoFitCollider} style={{ width: '100%', height: '24px', fontSize: '14px' }}>
                                                <Minimize size={12} style={{marginRight: '8px'}} /> AUTO-FIT TO SPRITE
                                            </RetroButton>
                                        </div>
                                    )}

                                    {currentCompWrap && !currentCompWrap.locked && (
                                        <div style={{ marginTop: '12px', borderTop: '1px dashed #3a3f4a', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {Object.keys(currentCompWrap.data).filter(k => k !== 'type').map(key => {
                                                const val = (currentCompWrap.data as any)[key];
                                                const t = typeof val;
                                                
                                                if (t === 'boolean') {
                                                    return (
                                                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={val} 
                                                                onChange={(e) => updateCurrentPrefab(`components.${selectedCompIdx}.data.${key}`, e.target.checked)}
                                                                style={{ width: '16px', height: '16px' }}
                                                            />
                                                            <label style={{ margin: 0, color: 'var(--text-main)' }}>{key.toUpperCase()}</label>
                                                        </div>
                                                    );
                                                }

                                                if (t === 'object' && val !== null) {
                                                    return (
                                                        <div key={key} style={{ display: 'flex', gap: '4px' }}>
                                                            <div style={{ flex: 1 }}><label style={{fontSize:'12px'}}>{key.toUpperCase()} X</label><RetroInput type="number" value={val.x} onChange={v => updateCurrentPrefab(`components.${selectedCompIdx}.data.${key}.x`, parseFloat(v)||0)} /></div>
                                                            <div style={{ flex: 1 }}><label style={{fontSize:'12px'}}>{key.toUpperCase()} Y</label><RetroInput type="number" value={val.y} onChange={v => updateCurrentPrefab(`components.${selectedCompIdx}.data.${key}.y`, parseFloat(v)||0)} /></div>
                                                        </div>
                                                    )
                                                }

                                                return (
                                                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <label style={{ color: 'var(--text-dim)', fontSize: '14px' }}>{key.toUpperCase()}</label>
                                                        <RetroInput 
                                                            type={t === 'number' ? 'number' : 'text'} 
                                                            value={val} 
                                                            onChange={v => updateCurrentPrefab(`components.${selectedCompIdx}.data.${key}`, t === 'number' ? (parseFloat(v)||0) : v)} 
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {currentCompWrap?.locked && (
                                        <div style={{ color: 'var(--danger)', textAlign: 'center', padding: '20px 0' }}>
                                            <Lock size={24} style={{ marginBottom: '8px' }} />
                                            <div>COMPONENT LOCKED</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* SPRITE BROWSER MODAL */}
            {showSpriteBrowser && (
                <div style={{ position: 'absolute', top: '50px', right: '330px', width: '400px', height: '400px', background: 'var(--bg-panel)', border: '2px solid #000', display: 'flex', flexDirection: 'column', boxShadow: '-10px 10px 0 rgba(0,0,0,0.5)', zIndex: 100 }}>
                    <div style={{ background: '#000', color: 'var(--accent)', padding: '4px 8px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                        ASSET BROWSER
                        <RetroButton onClick={() => setShowSpriteBrowser(false)} style={{ width: '20px', height: '20px', padding: 0 }}><X size={12}/></RetroButton>
                    </div>
                    <div style={{ padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', overflowY: 'auto' }}>
                        {sprites && Object.keys(sprites).map(s => (
                            <div 
                                key={s} 
                                onClick={() => { updateCurrentPrefab('sprite', s); setShowSpriteBrowser(false); }}
                                style={{ background: 'var(--bg-deep)', border: '1px solid #3a3f4a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px', cursor: 'pointer' }}
                            >
                                <SpriteThumbnail spriteData={sprites[s]} scale={2} />
                                <div style={{ fontSize: '12px', marginTop: '8px', textAlign: 'center', wordBreak: 'break-all' }}>{s}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FILE BROWSER MODAL */}
            {showFileBrowser && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '500px', background: 'var(--bg-panel)', border: '2px solid #000', display: 'flex', flexDirection: 'column', boxShadow: '10px 10px 0 rgba(0,0,0,0.5)' }}>
                        <div style={{ background: '#000', color: 'var(--accent)', padding: '4px 8px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>OPEN DEFINITION</span>
                            <RetroButton onClick={() => setShowFileBrowser(false)} style={{ width: '20px', height: '20px', padding: 0 }}><X size={12}/></RetroButton>
                        </div>
                        <div style={{ padding: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', overflowY: 'auto', maxHeight: '400px' }}>
                            <RetroButton onClick={async () => {
                                const res = await fetch('/api/ide/list?dir=dunyalar/definitions');
                                if (res.ok) setAvailablePrefabs((await res.json()).filter((f:any)=>f.name.endsWith('.json')).map((f:any)=>f.name.replace('.json','')));
                            }} style={{ gridColumn: '1/-1', height: '32px' }}>REFRESH LIST</RetroButton>
                            
                            {availablePrefabs.map(name => (
                                <RetroButton 
                                    key={name} 
                                    onClick={async () => {
                                        try {
                                            const res = await fetch(`/api/ide/read?file=dunyalar/definitions/${name}.json`);
                                            if (res.ok) {
                                                const data = JSON.parse(await res.text());
                                                const p = ensureSchema(data);
                                                setPrefabs([...prefabs, p]);
                                                setCurrentIndex(prefabs.length);
                                                setShowFileBrowser(false);
                                                pushHistory([...prefabs, p]);
                                            }
                                        } catch(e) {}
                                    }}
                                    style={{ height: '32px', justifyContent: 'flex-start', paddingLeft: '8px' }}
                                >
                                    <FileCode size={14} style={{marginRight:'8px'}}/> {name}
                                </RetroButton>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PrefabEditor;
