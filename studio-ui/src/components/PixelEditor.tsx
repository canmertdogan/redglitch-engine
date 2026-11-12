import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Pencil, Eraser, PaintBucket, Pipette, Square, 
    Save, Download, Trash2, Layers, Film, Grid, Undo, Redo, FolderOpen, Upload, X,
    Play, Pause, Plus, Copy
} from 'lucide-react';
import Toast, { ToastHandle } from './shared/Toast';

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
    const [frames, setFrames] = useState<string[][][]>(() => [createEmptyGrid(32, 32)]);
    const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
    const [isPlayingAnim, setIsPlayingAnim] = useState(false);
    const [fps, setFps] = useState(8);
    const [animFrame, setAnimFrame] = useState(0);
    const [showGrid, setShowGrid] = useState(true);

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
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const toastRef = useRef<ToastHandle>(null);

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
        const restored = cloneGrid(target.pixels);
        pixelsRef.current = restored;
        setPixels(restored);
        setFrames(prev => {
            const next = [...prev];
            next[currentFrameIndex] = restored;
            return next;
        });
    }, [currentFrameIndex]);

    const redo = useCallback(() => {
        const idx = historyIndexRef.current;
        if (idx >= historyRef.current.length - 1) return;
        const target = historyRef.current[idx + 1];
        if (!target) return;
        historyIndexRef.current = idx + 1;
        setHistoryIndex(idx + 1);
        setSize({ w: target.w, h: target.h });
        setDraftSize({ w: target.w, h: target.h });
        const restored = cloneGrid(target.pixels);
        pixelsRef.current = restored;
        setPixels(restored);
        setFrames(prev => {
            const next = [...prev];
            next[currentFrameIndex] = restored;
            return next;
        });
    }, [currentFrameIndex]);

    useEffect(() => {
        if (!isPlayingAnim || frames.length <= 1) return;
        const interval = setInterval(() => {
            setAnimFrame(prev => (prev + 1) % frames.length);
        }, 1000 / Math.max(1, fps));
        return () => clearInterval(interval);
    }, [isPlayingAnim, frames.length, fps]);

    useEffect(() => {
        const pCanvas = previewCanvasRef.current;
        if (!pCanvas) return;
        const ctx = pCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, pCanvas.width, pCanvas.height);
        const fIdx = isPlayingAnim ? animFrame : currentFrameIndex;
        const targetFrame = frames[fIdx] || pixels;
        const cw = pCanvas.width / Math.max(1, size.w);
        const ch = pCanvas.height / Math.max(1, size.h);
        for (let y = 0; y < size.h; y++) {
            for (let x = 0; x < size.w; x++) {
                const col = targetFrame[y]?.[x];
                if (col) {
                    ctx.fillStyle = col;
                    ctx.fillRect(x * cw, y * ch, cw, ch);
                }
            }
        }
    }, [isPlayingAnim, animFrame, currentFrameIndex, frames, pixels, size]);

    useEffect(() => {
        renderCanvas();
    }, [pixels, color, size, showGrid]);

    const resetCanvas = () => {
        const newPixels = createEmptyGrid(size.w, size.h);
        pixelsRef.current = newPixels;
        setPixels(newPixels);
        setFrames(prev => {
            const next = [...prev];
            next[currentFrameIndex] = newPixels;
            return next;
        });
        pushHistory(newPixels, size.w, size.h);
        toastRef.current?.show('CANVAS CLEARED', 'info');
    };

    const resizeCanvas = (targetW: number, targetH: number) => {
        const w = Math.max(1, Math.min(128, Math.floor(targetW) || 32));
        const h = Math.max(1, Math.min(128, Math.floor(targetH) || 32));
        setDraftSize({ w, h });
        if (w === size.w && h === size.h) return;
        const resizeGrid = (grid: string[][]) => {
            const next = createEmptyGrid(w, h);
            for (let y = 0; y < Math.min(h, grid.length); y++) {
                for (let x = 0; x < Math.min(w, grid[y]?.length || 0); x++) {
                    next[y][x] = grid[y][x] || '';
                }
            }
            return next;
        };
        const nextFrames = frames.map(f => resizeGrid(f));
        const nextPixels = resizeGrid(pixelsRef.current);
        setSize({ w, h });
        setFrames(nextFrames);
        pixelsRef.current = nextPixels;
        setPixels(nextPixels);
        pushHistory(nextPixels, w, h);
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
        pixelsRef.current = grid;
        setPixels(grid);
        setFrames([grid]);
        setCurrentFrameIndex(0);
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
        pixelsRef.current = grid;
        setPixels(grid);
        setFrames([grid]);
        setCurrentFrameIndex(0);
        setSpriteName(key.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprite');
        pushHistory(grid, w, h);
        setShowLoadModal(false);
    };

    const selectFrame = (targetIdx: number) => {
        if (targetIdx < 0 || targetIdx >= frames.length || targetIdx === currentFrameIndex) return;
        const updatedFrames = [...frames];
        updatedFrames[currentFrameIndex] = cloneGrid(pixelsRef.current);
        const targetGrid = cloneGrid(updatedFrames[targetIdx]);
        setFrames(updatedFrames);
        setCurrentFrameIndex(targetIdx);
        pixelsRef.current = targetGrid;
        setPixels(targetGrid);
    };

    const addFrame = () => {
        const newGrid = createEmptyGrid(size.w, size.h);
        const updatedFrames = [...frames];
        updatedFrames[currentFrameIndex] = cloneGrid(pixelsRef.current);
        updatedFrames.push(newGrid);
        setFrames(updatedFrames);
        setCurrentFrameIndex(updatedFrames.length - 1);
        pixelsRef.current = newGrid;
        setPixels(newGrid);
        toastRef.current?.show('FRAME ADDED', 'success');
    };

    const duplicateFrame = () => {
        const dupGrid = cloneGrid(pixelsRef.current);
        const updatedFrames = [...frames];
        updatedFrames[currentFrameIndex] = cloneGrid(pixelsRef.current);
        updatedFrames.push(dupGrid);
        setFrames(updatedFrames);
        setCurrentFrameIndex(updatedFrames.length - 1);
        pixelsRef.current = dupGrid;
        setPixels(dupGrid);
        toastRef.current?.show('FRAME DUPLICATED', 'success');
    };

    const deleteFrame = (indexToDelete: number) => {
        if (frames.length <= 1) {
            toastRef.current?.show('CANNOT DELETE ONLY FRAME', 'error');
            return;
        }
        const updatedFrames = frames.filter((_, i) => i !== indexToDelete);
        const nextIdx = Math.min(currentFrameIndex, updatedFrames.length - 1);
        const targetGrid = cloneGrid(updatedFrames[nextIdx]);
        setFrames(updatedFrames);
        setCurrentFrameIndex(nextIdx);
        pixelsRef.current = targetGrid;
        setPixels(targetGrid);
        toastRef.current?.show('FRAME DELETED', 'info');
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
            const picked = pixelsRef.current[y]?.[x];
            if (picked) setColor(picked);
            setTool('pen');
            return;
        }

        const newPixels = cloneGrid(pixelsRef.current);
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
            pixelsRef.current = newPixels;
            setPixels(newPixels);
            setFrames(prev => {
                const next = [...prev];
                next[currentFrameIndex] = newPixels;
                return next;
            });
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
        
        const sw = Math.max(1, size.w);
        const sh = Math.max(1, size.h);
        const cellW = canvas.width / sw;
        const cellH = canvas.height / sh;

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

        // Draw grid overlay
        if (showGrid && size.w <= 64 && size.h <= 64) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            for (let x = 0; x <= size.w; x++) {
                ctx.beginPath();
                ctx.moveTo(x * cellW, 0);
                ctx.lineTo(x * cellW, canvas.height);
                ctx.stroke();
            }
            for (let y = 0; y <= size.h; y++) {
                ctx.beginPath();
                ctx.moveTo(0, y * cellH);
                ctx.lineTo(canvas.width, y * cellH);
                ctx.stroke();
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
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        
        const x = Math.max(0, Math.min(size.w - 1, Math.floor(((e.clientX - rect.left) / rect.width) * size.w)));
        const y = Math.max(0, Math.min(size.h - 1, Math.floor(((e.clientY - rect.top) / rect.height) * size.h)));
        handlePixelAction(x, y, false);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDrawing(true);
        strokeMutatedRef.current = false;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        const x = Math.max(0, Math.min(size.w - 1, Math.floor(((e.clientX - rect.left) / rect.width) * size.w)));
        const y = Math.max(0, Math.min(size.h - 1, Math.floor(((e.clientY - rect.top) / rect.height) * size.h)));
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

    const buildSpritesheetDataUrl = (): string => {
        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = size.w * frames.length;
        sheetCanvas.height = size.h;
        const sCtx = sheetCanvas.getContext('2d');
        if (!sCtx) throw new Error('Could not get context');

        frames.forEach((frameGrid, fIdx) => {
            const currentGrid = fIdx === currentFrameIndex ? pixelsRef.current : frameGrid;
            for (let y = 0; y < size.h; y++) {
                for (let x = 0; x < size.w; x++) {
                    const pColor = currentGrid[y]?.[x];
                    if (pColor) {
                        sCtx.fillStyle = pColor;
                        sCtx.fillRect(fIdx * size.w + x, y, 1, 1);
                    }
                }
            }
        });
        return sheetCanvas.toDataURL('image/png');
    };

    const downloadSpritesheet = () => {
        const cleanName = spriteName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'sprite';
        const dataUrl = buildSpritesheetDataUrl();
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${cleanName}_spritesheet.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toastRef.current?.show('SPRITESHEET DOWNLOADED', 'success');
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
        toastRef.current?.show('PNG DOWNLOADED', 'success');
    };

    const saveToServer = async (interactive = true) => {
        if (!canvasRef.current || isSaving) return;
        const trimmed = spriteName.trim();
        const safeName = trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (!trimmed || !safeName) {
            if (interactive) toastRef.current?.show('ENTER A VALID SPRITE NAME', 'error');
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
                if (interactive) toastRef.current?.show(err?.error || `SAVE FAILED (${res.status})`, 'error');
                return;
            }

            setSpriteName(safeName);
            await fetch('/api/assets/rebuild', { method: 'POST' }).catch(() => {});
            if (eventBus) eventBus.emit('file:changed', { path: filePath });
            if (interactive) toastRef.current?.show('SPRITE SAVED SUCCESSFULLY', 'success');
        } catch (e) {
            console.error(e);
            if (interactive) toastRef.current?.show('SAVE ERROR', 'error');
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
                <button className={`tool-btn ${showGrid ? 'active' : ''}`} onClick={() => setShowGrid(g => !g)} title="Toggle Grid Overlay"><Grid size={16} /></button>
                <button className="tool-btn" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)" style={{ opacity: historyIndex > 0 ? 1 : 0.4 }}><Undo size={16} /></button>
                <button className="tool-btn" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)" style={{ opacity: historyIndex < history.length - 1 ? 1 : 0.4 }}><Redo size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => void openLoadModal()} title="Load Existing Sprite"><FolderOpen size={16} /></button>
                <button className="tool-btn" onClick={() => fileInputRef.current?.click()} title="Import Local Image"><Upload size={16} /></button>
                <button className="tool-btn" onClick={downloadPng} title="Download PNG"><Download size={16} /></button>
                {frames.length > 1 && (
                    <button className="tool-btn" onClick={downloadSpritesheet} title="Download Spritesheet"><Layers size={16} /></button>
                )}
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
                    
                    <div className="panel-header" style={{ borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Film size={14} /> ANIMATION</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="tool-btn" onClick={addFrame} title="Add Frame" style={{ padding: '2px 4px', height: '22px' }}><Plus size={12} /></button>
                            <button className="tool-btn" onClick={duplicateFrame} title="Duplicate Frame" style={{ padding: '2px 4px', height: '22px' }}><Copy size={12} /></button>
                            <button className="tool-btn" onClick={() => deleteFrame(currentFrameIndex)} disabled={frames.length <= 1} title="Delete Frame" style={{ padding: '2px 4px', height: '22px', opacity: frames.length > 1 ? 1 : 0.4 }}><Trash2 size={12} /></button>
                        </div>
                    </div>
                    <div className="panel-content" style={{ gap: '10px' }}>
                        {/* Preview canvas & Playback controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#000', padding: '8px', border: '1px solid #222' }}>
                            <canvas
                                ref={previewCanvasRef}
                                width={64}
                                height={64}
                                style={{ width: '64px', height: '64px', background: '#111', border: '1px solid #333', imageRendering: 'pixelated' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                        className="tool-btn"
                                        onClick={() => setIsPlayingAnim(p => !p)}
                                        title={isPlayingAnim ? 'Pause' : 'Play'}
                                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                    >
                                        {isPlayingAnim ? <Pause size={12} /> : <Play size={12} />}
                                    </button>
                                    <span style={{ fontSize: '0.75rem', color: '#888' }}>{fps} FPS</span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={24}
                                    value={fps}
                                    onChange={e => setFps(parseInt(e.target.value, 10) || 8)}
                                    style={{ width: '100%', height: '4px' }}
                                />
                            </div>
                        </div>

                        {/* Frames timeline */}
                        <label style={{ fontSize: '0.75rem', color: '#888' }}>FRAMES ({frames.length})</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px', maxHeight: '140px', overflowY: 'auto' }}>
                            {frames.map((_, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => selectFrame(idx)}
                                    style={{
                                        aspectRatio: '1',
                                        background: idx === currentFrameIndex ? '#222' : '#000',
                                        border: `1px solid ${idx === currentFrameIndex ? 'var(--accent)' : '#333'}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.8rem',
                                        color: idx === currentFrameIndex ? 'var(--accent)' : '#888',
                                        cursor: 'pointer',
                                        position: 'relative'
                                    }}
                                >
                                    {idx + 1}
                                </div>
                            ))}
                        </div>

                        {frames.length > 1 && (
                            <button
                                onClick={downloadSpritesheet}
                                style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#111', border: '1px solid #333', color: '#aaa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                            >
                                <Download size={12} /> DOWNLOAD SPRITESHEET
                            </button>
                        )}
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
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                            <button
                                onClick={() => resizeCanvas(16, 16)}
                                style={{ flex: 1, padding: '4px 6px', fontSize: '0.8rem', background: size.w === 16 && size.h === 16 ? 'var(--accent)' : '#111', color: size.w === 16 && size.h === 16 ? '#000' : '#fff', border: '1px solid #333', cursor: 'pointer' }}
                            >
                                16x16
                            </button>
                            <button
                                onClick={() => resizeCanvas(32, 32)}
                                style={{ flex: 1, padding: '4px 6px', fontSize: '0.8rem', background: size.w === 32 && size.h === 32 ? 'var(--accent)' : '#111', color: size.w === 32 && size.h === 32 ? '#000' : '#fff', border: '1px solid #333', cursor: 'pointer' }}
                            >
                                32x32
                            </button>
                            <button
                                onClick={() => resizeCanvas(draftSize.w, draftSize.h)}
                                style={{ flex: 1.5, padding: '4px 6px', fontSize: '0.8rem', background: '#222', color: '#fff', border: '1px solid #444', cursor: 'pointer' }}
                            >
                                APPLY
                            </button>
                        </div>
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
            <Toast ref={toastRef} />
        </div>
    );
};

export default PixelEditor;
