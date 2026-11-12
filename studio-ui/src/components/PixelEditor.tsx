import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Pencil, Eraser, PaintBucket, Pipette, Square, 
    Save, Download, Trash2, Layers, Film, Grid, Undo, Redo, FolderOpen, Upload, X
} from 'lucide-react';

interface PixelSnapshot {
    pixels: string[][];
    w: number;
    h: number;
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function cloneGrid(grid: string[][]): string[][] {
    return grid.map(row => [...row]);
}

function createEmptyGrid(w: number, h: number): string[][] {
    return Array.from({ length: h }, () => Array.from({ length: w }, () => ''));
}

const PixelEditor: React.FC = () => {
    const { isReady, eventBus, sprites } = useStudio();
    const [tool, setTool] = useState<'pen' | 'eraser' | 'bucket' | 'pipette'>('pen');
    const [color, setColor] = useState('#ffffff');
    const [size, setSize] = useState({ w: 32, h: 32 });
    const [draftSize, setDraftSize] = useState({ w: 32, h: 32 });
    const [pixels, setPixels] = useState<string[][]>(() => createEmptyGrid(32, 32));
    const [spriteName, setSpriteName] = useState('new_sprite');
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [assetImages, setAssetImages] = useState<Array<{ id: string; name: string; path: string }>>([]);

    const [history, setHistory] = useState<PixelSnapshot[]>(() => [{ pixels: createEmptyGrid(32, 32), w: 32, h: 32 }]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const historyRef = useRef(history);
    const historyIndexRef = useRef(historyIndex);
    historyRef.current = history;
    historyIndexRef.current = historyIndex;

    const strokeMutatedRef = useRef(false);
    const pixelsRef = useRef(pixels);
    pixelsRef.current = pixels;
    const sizeRef = useRef(size);
    sizeRef.current = size;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Palette (Pico-8 Inspired)
    const palette = [
        '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
        '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'
    ];

    const pushHistory = useCallback((nextPixels: string[][], nextW: number, nextH: number) => {
        const snap: PixelSnapshot = {
            pixels: cloneGrid(nextPixels),
            w: nextW,
            h: nextH
        };
        const nextHist = historyRef.current.slice(0, historyIndexRef.current + 1);
        nextHist.push(snap);
        if (nextHist.length > 60) nextHist.shift();
        const nextIdx = nextHist.length - 1;
        historyRef.current = nextHist;
        historyIndexRef.current = nextIdx;
        setHistory(nextHist);
        setHistoryIndex(nextIdx);
    }, []);

    const undo = useCallback(() => {
        const idx = historyIndexRef.current;
        if (idx <= 0) return;
        const target = historyRef.current[idx - 1];
        if (!target) return;
        historyIndexRef.current = idx - 1;
        setHistoryIndex(idx - 1);
        setSize({ w: target.w, h: target.h });
        setDraftSize({ w: target.w, h: target.h });
        setPixels(cloneGrid(target.pixels));
    }, []);

    const redo = useCallback(() => {
        const idx = historyIndexRef.current;
        if (idx >= historyRef.current.length - 1) return;
        const target = historyRef.current[idx + 1];
        if (!target) return;
        historyIndexRef.current = idx + 1;
        setHistoryIndex(idx + 1);
        setSize({ w: target.w, h: target.h });
        setDraftSize({ w: target.w, h: target.h });
        setPixels(cloneGrid(target.pixels));
    }, []);

    useEffect(() => {
        renderCanvas();
    }, [pixels, color, size]);

    const resetCanvas = () => {
        if (!confirm('Clear canvas?')) return;
        const newPixels = createEmptyGrid(size.w, size.h);
        setPixels(newPixels);
        pushHistory(newPixels, size.w, size.h);
    };

    const resizeCanvas = (targetW: number, targetH: number) => {
        const w = Math.max(1, Math.min(128, Math.floor(targetW) || 32));
        const h = Math.max(1, Math.min(128, Math.floor(targetH) || 32));
        setDraftSize({ w, h });
        if (w === size.w && h === size.h) return;
        const next = createEmptyGrid(w, h);
        for (let y = 0; y < Math.min(h, pixels.length); y++) {
            for (let x = 0; x < Math.min(w, pixels[y]?.length || 0); x++) {
                next[y][x] = pixels[y][x] || '';
            }
        }
        setSize({ w, h });
        setPixels(next);
        pushHistory(next, w, h);
    };

    const loadImageIntoGrid = (img: HTMLImageElement, nextName?: string) => {
        const w = Math.max(1, Math.min(128, img.naturalWidth || img.width || 32));
        const h = Math.max(1, Math.min(128, img.naturalHeight || img.height || 32));
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const octx = off.getContext('2d');
        if (!octx) return;
        octx.imageSmoothingEnabled = false;
        octx.drawImage(img, 0, 0, w, h);
        const data = octx.getImageData(0, 0, w, h).data;
        const grid = createEmptyGrid(w, h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                if (data[i + 3] > 10) {
                    grid[y][x] = rgbToHex(data[i], data[i + 1], data[i + 2]);
                }
            }
        }
        setSize({ w, h });
        setDraftSize({ w, h });
        setPixels(grid);
        if (nextName) {
            setSpriteName(nextName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'imported_sprite');
        }
        pushHistory(grid, w, h);
    };

    const loadInlineSprite = (key: string) => {
        const sp = sprites?.[key];
        if (!sp || !Array.isArray(sp.data) || !sp.palette) return;
        const w = Math.max(1, Math.min(128, sp.width || sp.data[0]?.length || 16));
        const h = Math.max(1, Math.min(128, sp.height || sp.data.length || 16));
        const grid = createEmptyGrid(w, h);
        for (let y = 0; y < Math.min(h, sp.data.length); y++) {
            const row = sp.data[y] || '';
            for (let x = 0; x < Math.min(w, row.length); x++) {
                const col = sp.palette[row[x]];
                if (col) grid[y][x] = col;
            }
        }
        setSize({ w, h });
        setDraftSize({ w, h });
        setPixels(grid);
        setSpriteName(key.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprite');
        pushHistory(grid, w, h);
        setShowLoadModal(false);
    };

    const openLoadModal = async () => {
        setShowLoadModal(true);
        try {
            const res = await fetch('/api/assets');
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data?.assets || []);
                setAssetImages(list.filter((a: any) => a?.type === 'image'));
            }
        } catch {
            /* keep existing list */
        }
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => loadImageIntoGrid(img, file.name);
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handlePixelAction = (x: number, y: number, recordImmediately = false) => {
        if (x < 0 || x >= size.w || y < 0 || y >= size.h) return;

        if (tool === 'pipette') {
            const picked = pixels[y]?.[x];
            if (picked) setColor(picked);
            setTool('pen');
            return;
        }

        const newPixels = cloneGrid(pixels);
        let changed = false;
        if (tool === 'pen') {
            if (newPixels[y][x] !== color) {
                newPixels[y][x] = color;
                changed = true;
            }
        } else if (tool === 'eraser') {
            if (newPixels[y][x] !== '') {
                newPixels[y][x] = '';
                changed = true;
            }
        } else if (tool === 'bucket') {
            const target = newPixels[y][x];
            if (target !== color) {
                floodFill(newPixels, x, y, target, color);
                changed = true;
            }
        }
        if (changed) {
            setPixels(newPixels);
            strokeMutatedRef.current = true;
            if (recordImmediately) {
                pushHistory(newPixels, size.w, size.h);
                strokeMutatedRef.current = false;
            }
        }
    };

    const floodFill = (grid: string[][], x: number, y: number, target: string, replacement: string) => {
        if (target === replacement) return;
        const stack: Array<[number, number]> = [[x, y]];
        const visited = new Set<string>();
        while (stack.length > 0) {
            const [cx, cy] = stack.pop()!;
            if (cx < 0 || cx >= size.w || cy < 0 || cy >= size.h) continue;
            const k = `${cx},${cy}`;
            if (visited.has(k)) continue;
            visited.add(k);
            if (grid[cy][cx] !== target) continue;
            grid[cy][cx] = replacement;
            stack.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
        }
    };

    const renderCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const cellW = canvas.width / size.w;
        const cellH = canvas.height / size.h;

        // Draw transparent pattern
        for (let y = 0; y < size.h; y++) {
            for (let x = 0; x < size.w; x++) {
                ctx.fillStyle = (x + y) % 2 === 0 ? '#111' : '#0a0a0a';
                ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
                
                const pColor = pixels[y]?.[x];
                if (pColor) {
                    ctx.fillStyle = pColor;
                    ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
                }
            }
        }
    };

    const finishStroke = () => {
        if (isDrawing && strokeMutatedRef.current) {
            pushHistory(pixelsRef.current, sizeRef.current.w, sizeRef.current.h);
            strokeMutatedRef.current = false;
        }
        setIsDrawing(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || tool === 'bucket' || tool === 'pipette') return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * size.w);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * size.h);
        handlePixelAction(x, y, false);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDrawing(true);
        strokeMutatedRef.current = false;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * size.w);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * size.h);
        handlePixelAction(x, y, tool === 'bucket');
    };

    const buildExportDataUrl = (): string => {
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = size.w;
        exportCanvas.height = size.h;
        const eCtx = exportCanvas.getContext('2d');
        if (!eCtx) throw new Error('Could not get context');

        for (let y = 0; y < size.h; y++) {
            for (let x = 0; x < size.w; x++) {
                const pColor = pixels[y]?.[x];
                if (pColor) {
                    eCtx.fillStyle = pColor;
                    eCtx.fillRect(x, y, 1, 1);
                }
            }
        }
        return exportCanvas.toDataURL('image/png');
    };

    const downloadPng = () => {
        const cleanName = spriteName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprite';
        const dataUrl = buildExportDataUrl();
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${cleanName}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const saveToServer = async (interactive = true) => {
        if (!canvasRef.current || isSaving) return;
        const trimmed = spriteName.trim();
        const safeName = trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (!trimmed || !safeName) {
            if (interactive) alert('ENTER A VALID SPRITE NAME');
            return;
        }
        setIsSaving(true);

        try {
            const dataUrl = buildExportDataUrl();
            const filePath = `assets/sprites/${safeName}.png`;
            const res = await fetch('/api/assets/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: filePath,
                    content: dataUrl,
                    isBase64: true
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (interactive) alert(err?.error || `SAVE FAILED (${res.status})`);
                return;
            }

            setSpriteName(safeName);
            await fetch('/api/assets/rebuild', { method: 'POST' }).catch(() => {});
            if (eventBus) eventBus.emit('file:changed', { path: filePath });
            if (interactive) alert('SPRITE SAVED SUCCESSFULLY');
        } catch (e) {
            console.error(e);
            if (interactive) alert('SAVE ERROR');
        } finally {
            setIsSaving(false);
        }
    };

    const saveToServerRef = useRef(saveToServer);
    saveToServerRef.current = saveToServer;

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void saveToServerRef.current(true);
                return;
            }
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
            } else if (e.key.toLowerCase() === 'p') {
                setTool('pen');
            } else if (e.key.toLowerCase() === 'e') {
                setTool('eraser');
            } else if (e.key.toLowerCase() === 'b') {
                setTool('bucket');
            }
        };
        window.addEventListener('keydown', onKeyDown);
        const unsubSave = eventBus?.on('system:global_save', () => {
            void saveToServerRef.current(false);
        });
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            if (unsubSave && eventBus?.off) eventBus.off('system:global_save', unsubSave);
        };
    }, [eventBus, undo, redo]);

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>INITIALIZING PIXEL KERNEL...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050505' }}>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImportFile} style={{ display: 'none' }} />
            {/* MENUBAR */}
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px' }}>
                <div style={{ color: '#e67e22', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <Pencil size={16} style={{ marginRight: '8px', display: 'inline' }} /> PIXEL STUDIO v2.0
                </div>
            </div>

            {/* TOOLBAR */}
            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className={`tool-btn ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="Pencil (P)"><Pencil size={16} /></button>
                <button className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="Eraser (E)"><Eraser size={16} /></button>
                <button className={`tool-btn ${tool === 'bucket' ? 'active' : ''}`} onClick={() => setTool('bucket')} title="Paint Bucket (B)"><PaintBucket size={16} /></button>
                <button className={`tool-btn ${tool === 'pipette' ? 'active' : ''}`} onClick={() => setTool('pipette')} title="Eyedropper"><Pipette size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)" style={{ opacity: historyIndex > 0 ? 1 : 0.4 }}><Undo size={16} /></button>
                <button className="tool-btn" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)" style={{ opacity: historyIndex < history.length - 1 ? 1 : 0.4 }}><Redo size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => void openLoadModal()} title="Load Existing Sprite"><FolderOpen size={16} /></button>
                <button className="tool-btn" onClick={() => fileInputRef.current?.click()} title="Import Local Image"><Upload size={16} /></button>
                <button className="tool-btn" onClick={downloadPng} title="Download PNG"><Download size={16} /></button>
                <button className="tool-btn" onClick={resetCanvas} style={{ color: '#e74c3c' }} title="Clear Canvas"><Trash2 size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input 
                        type="text" 
                        value={spriteName} 
                        onChange={(e) => setSpriteName(e.target.value)}
                        style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '4px 8px', fontSize: '0.8rem', width: '140px' }}
                        placeholder="sprite_name"
                    />
                    <button className="tool-btn" onClick={() => void saveToServer(true)} disabled={isSaving} title="Save Sprite (Ctrl+S)"><Save size={16} /></button>
                </div>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                {/* LEFT: PALETTE */}
                <div className="panel" style={{ width: '60px' }}>
                    <div className="panel-header" style={{ justifyContent: 'center' }}><Square size={14} /></div>
                    <div className="panel-content" style={{ alignItems: 'center', gap: '8px' }}>
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            title="Custom Color"
                            style={{ width: '32px', height: '32px', padding: 0, background: color, border: '2px solid #fff', marginBottom: '10px', cursor: 'pointer' }}
                        />
                        {palette.map(c => (
                            <div 
                                key={c} 
                                onClick={() => setColor(c)}
                                style={{ width: '24px', height: '24px', background: c, border: color === c ? '2px solid #fff' : '1px solid #222', cursor: 'pointer' }}
                            />
                        ))}
                    </div>
                </div>

                {/* CENTER: DRAWING AREA */}
                <div 
                    ref={containerRef}
                    style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080808', overflow: 'hidden' }}
                >
                    <div style={{ position: 'relative', boxShadow: '0 0 100px rgba(0,0,0,0.5)', border: '1px solid #222' }}>
                        <canvas 
                            ref={canvasRef}
                            width={512}
                            height={512}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={finishStroke}
                            onMouseLeave={finishStroke}
                            style={{ width: '512px', height: '512px', cursor: 'crosshair', imageRendering: 'pixelated' }}
                        />
                    </div>
                </div>

                {/* RIGHT: LAYERS & ANIM */}
                <div className="panel" style={{ width: '240px', borderLeft: '1px solid #333', borderRight: 'none' }}>
                    <div className="panel-header"><Layers size={14} /> LAYERS</div>
                    <div className="panel-content">
                        <div style={{ padding: '10px', background: '#111', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: '0.9rem' }}>
                            Base Layer
                        </div>
                    </div>
                    
                    <div className="panel-header" style={{ borderTop: '1px solid #333' }}><Film size={14} /> ANIMATION</div>
                    <div className="panel-content">
                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                            {[1].map(f => (
                                <div key={f} style={{ aspectRatio: '1', background: '#000', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>
                                    {f}
                                </div>
                            ))}
                         </div>
                    </div>

                    <div className="panel-header" style={{ borderTop: '1px solid #333' }}><Grid size={14} /> PROPERTIES</div>
                    <div className="panel-content">
                        <label>Dimensions (1-128)</label>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                            <input
                                type="number"
                                min={1}
                                max={128}
                                value={draftSize.w}
                                onChange={(e) => setDraftSize(prev => ({ ...prev, w: parseInt(e.target.value, 10) || 1 }))}
                                style={{ width: '60px' }}
                            />
                            <span>x</span>
                            <input
                                type="number"
                                min={1}
                                max={128}
                                value={draftSize.h}
                                onChange={(e) => setDraftSize(prev => ({ ...prev, h: parseInt(e.target.value, 10) || 1 }))}
                                style={{ width: '60px' }}
                            />
                        </div>
                        <button
                            onClick={() => resizeCanvas(draftSize.w, draftSize.h)}
                            style={{ marginTop: '8px', padding: '4px 8px', fontSize: '0.85rem' }}
                        >
                            APPLY SIZE
                        </button>
                    </div>
                </div>
            </div>

            {showLoadModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '560px', maxHeight: '75vh', background: 'var(--bg-panel)', border: '2px solid #000', display: 'flex', flexDirection: 'column' }}>
                        <div className="panel-header">
                            <span>LOAD SPRITE</span>
                            <button className="tool-btn" onClick={() => setShowLoadModal(false)} style={{ width: '24px', height: '24px' }}><X size={14} /></button>
                        </div>
                        <div style={{ padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {sprites && Object.keys(sprites).length > 0 && (
                                <div>
                                    <label>CORE SPRITES</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                        {Object.keys(sprites).map(k => (
                                            <button key={k} onClick={() => loadInlineSprite(k)} style={{ fontSize: '0.85rem', textAlign: 'left' }}>{k}</button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {assetImages.length > 0 && (
                                <div>
                                    <label>IMAGE ASSETS</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                        {assetImages.map(a => {
                                            const url = a.path.startsWith('/') || a.path.startsWith('http') ? a.path : '/' + a.path;
                                            return (
                                                <button
                                                    key={a.id}
                                                    onClick={() => {
                                                        const img = new Image();
                                                        img.crossOrigin = 'anonymous';
                                                        img.onload = () => {
                                                            loadImageIntoGrid(img, a.name);
                                                            setShowLoadModal(false);
                                                        };
                                                        img.src = url;
                                                    }}
                                                    style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                >
                                                    <img src={url} alt={a.name} style={{ width: '20px', height: '20px', imageRendering: 'pixelated' }} />
                                                    <span>{a.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PixelEditor;
