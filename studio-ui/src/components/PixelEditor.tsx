import React, { useState, useEffect, useRef } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Pencil, Eraser, PaintBucket, Pipette, Square, 
    Save, Download, Trash2, Layers, Film, Grid, Undo, Redo 
} from 'lucide-react';

const PixelEditor: React.FC = () => {
    const { isReady, eventBus, sprites } = useStudio();
    const [tool, setTool] = useState<'pen' | 'eraser' | 'bucket'>('pen');
    const [color, setColor] = useState('#ffffff');
    const [size, setSize] = useState({ w: 32, h: 32 });
    const [pixels, setPixels] = useState<string[][]>([]); // Row-major hex colors
    const [spriteName, setSpriteName] = useState('new_sprite');
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial Palette (Pico-8 Inspired)
    const palette = [
        '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
        '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'
    ];

    useEffect(() => {
        if (pixels.length === 0) {
            resetCanvas();
        }
    }, []);

    useEffect(() => {
        renderCanvas();
    }, [pixels, color, size]);

    const resetCanvas = () => {
        const newPixels = Array(size.h).fill(null).map(() => Array(size.w).fill(''));
        setPixels(newPixels);
    };

    const handlePixelAction = (x: number, y: number) => {
        if (x < 0 || x >= size.w || y < 0 || y >= size.h) return;
        
        const newPixels = [...pixels.map(row => [...row])];
        if (tool === 'pen') {
            newPixels[y][x] = color;
        } else if (tool === 'eraser') {
            newPixels[y][x] = '';
        } else if (tool === 'bucket') {
            floodFill(newPixels, x, y, newPixels[y][x], color);
        }
        setPixels(newPixels);
    };

    const floodFill = (grid: string[][], x: number, y: number, target: string, replacement: string) => {
        if (target === replacement) return;
        if (grid[y][x] !== target) return;
        
        grid[y][x] = replacement;
        
        if (y > 0) floodFill(grid, x, y - 1, target, replacement);
        if (y < size.h - 1) floodFill(grid, x, y + 1, target, replacement);
        if (x > 0) floodFill(grid, x - 1, y, target, replacement);
        if (x < size.w - 1) floodFill(grid, x + 1, y, target, replacement);
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

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || tool === 'bucket') return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * size.w);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * size.h);
        handlePixelAction(x, y);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDrawing(true);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = Math.floor(((e.clientX - rect.left) / rect.width) * size.w);
        const y = Math.floor(((e.clientY - rect.top) / rect.height) * size.h);
        handlePixelAction(x, y);
    };

    const saveToServer = async () => {
        if (!canvasRef.current || isSaving) return;
        setIsSaving(true);

        try {
            // Create a small canvas for the actual export (not the scaled preview)
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = size.w;
            exportCanvas.height = size.h;
            const eCtx = exportCanvas.getContext('2d');
            if (!eCtx) throw new Error("Could not get context");

            // Draw pixels to export canvas
            for (let y = 0; y < size.h; y++) {
                for (let x = 0; x < size.w; x++) {
                    const pColor = pixels[y][x];
                    if (pColor) {
                        eCtx.fillStyle = pColor;
                        eCtx.fillRect(x, y, 1, 1);
                    }
                }
            }

            const dataUrl = exportCanvas.toDataURL('image/png');
            
            const res = await fetch('/api/assets/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: `assets/sprites/${spriteName}.png`,
                    content: dataUrl,
                    isBase64: true
                })
            });

            if (res.ok) {
                console.log(`[PixelEditor] Saved sprite: ${spriteName}`);
                if (eventBus) eventBus.emit('file:changed', { path: `assets/sprites/${spriteName}.png` });
                alert("SPRITE SAVED SUCCESSFULLY");
            } else {
                alert("SAVE FAILED");
            }
        } catch (e) {
            console.error(e);
            alert("SAVE ERROR");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>INITIALIZING PIXEL KERNEL...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050505' }}>
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
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" title="Undo"><Undo size={16} /></button>
                <button className="tool-btn" title="Redo"><Redo size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input 
                        type="text" 
                        value={spriteName} 
                        onChange={(e) => setSpriteName(e.target.value)}
                        style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '4px 8px', fontSize: '0.8rem', width: '120px' }}
                        placeholder="sprite_name"
                    />
                    <button className="tool-btn" onClick={saveToServer} disabled={isSaving} title="Save Sprite"><Save size={16} /></button>
                </div>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                {/* LEFT: PALETTE */}
                <div className="panel" style={{ width: '60px' }}>
                    <div className="panel-header" style={{ justifyContent: 'center' }}><Square size={14} /></div>
                    <div className="panel-content" style={{ alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '32px', height: '32px', background: color, border: '2px solid #fff', marginBottom: '10px' }} />
                        {palette.map(c => (
                            <div 
                                key={c} 
                                onClick={() => setColor(c)}
                                style={{ width: '24px', height: '24px', background: c, border: '1px solid #222', cursor: 'pointer' }}
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
                            onMouseUp={() => setIsDrawing(false)}
                            onMouseLeave={() => setIsDrawing(false)}
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
                        <label>Dimensions</label>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                            <input type="number" value={size.w} readOnly style={{ width: '60px', opacity: 0.5 }} />
                            <span>x</span>
                            <input type="number" value={size.h} readOnly style={{ width: '60px', opacity: 0.5 }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PixelEditor;
