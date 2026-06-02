import React, { useState, useEffect, useRef } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    MagicWand as MagicIcon, Play, Square, Save, Plus, Trash2, 
    Zap, Wind, Droplets, Flame, Settings, Sliders, Layers
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';

interface FXConfig {
    id: string;
    name: string;
    mode: 'burst' | 'stream' | 'loop';
    count: number;
    duration: number;
    sprite: string;
    blend: string;
    life: { min: number; max: number };
    speed: { min: number; max: number };
    size: { start: number; end: number };
    color: { start: string; end: string };
    physics: {
        gravity: number;
        drag: number;
        spread: number;
    };
}

class Particle {
    x: number = 0;
    y: number = 0;
    vx: number = 0;
    vy: number = 0;
    life: number = 0;
    lifeMax: number = 0;
    active: boolean = false;

    reset(canvasW: number, canvasH: number, config: FXConfig) {
        this.x = canvasW / 2;
        this.y = canvasH / 2;
        const angle = (Math.random() * config.physics.spread - config.physics.spread / 2 - 90) * (Math.PI / 180);
        const speed = config.speed.min + Math.random() * (config.speed.max - config.speed.min);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.lifeMax = config.life.min + Math.random() * (config.life.max - config.life.min);
        this.life = this.lifeMax;
        this.active = true;
    }

    update(dt: number, config: FXConfig) {
        if (!this.active) return;
        this.vx *= config.physics.drag;
        this.vy *= config.physics.drag;
        this.vy += config.physics.gravity * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx: CanvasRenderingContext2D, config: FXConfig) {
        if (!this.active) return;
        const progress = 1 - (this.life / this.lifeMax);
        const size = config.size.start + (config.size.end - config.size.start) * progress;
        
        ctx.fillStyle = progress < 0.5 ? config.color.start : config.color.end;
        ctx.globalAlpha = 1 - progress;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.1, size), 0, Math.PI * 2);
        ctx.fill();
    }
}

const FXEditor: React.FC = () => {
    const { isReady, sprites: spriteLib } = useStudio();
    const [effects, setEffects] = useState<FXConfig[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);

    useEffect(() => {
        if (isReady) {
            loadEffects();
        }
    }, [isReady]);

    const loadEffects = async () => {
        try {
            const res = await fetch('/api/fx/list');
            if (res.ok) {
                const names = await res.json();
                if (names.length > 0) {
                    const loaded = await Promise.all(names.map(async (n: string) => {
                        const r = await fetch(`/api/data/fx/${n}.json`);
                        return r.ok ? await r.json() : null;
                    }));
                    setEffects(loaded.filter(l => l !== null));
                } else {
                    setEffects([getDefaultFX()]);
                }
            }
        } catch (e) {
            setEffects([getDefaultFX()]);
        }
    };

    const saveToServer = async () => {
        const config = effects[currentIndex];
        if (!config) return;
        setIsSaving(true);
        try {
            await fetch('/api/assets/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: `data/fx/${config.name}.json`,
                    content: JSON.stringify(config, null, 2)
                })
            });
            if (eventBus) eventBus.emit('fx:updated', { id: config.id, config });
            alert("FX SAVED");
        } catch (e) {
            alert("SAVE FAILED");
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        if (!isPlaying) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let lastTime = performance.now();
        let frame: number;

        const loop = (time: number) => {
            const dt = (time - lastTime) / 1000;
            lastTime = time;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = (effects[currentIndex]?.blend as any) || 'lighter';

            // Update & Spawn
            const config = effects[currentIndex];
            if (config) {
                // Auto-spawn for loop/stream
                if (config.mode !== 'burst' && particlesRef.current.filter(p => p.active).length < config.count) {
                    const inactive = particlesRef.current.find(p => !p.active);
                    if (inactive) inactive.reset(canvas.width, canvas.height, config);
                    else {
                        const p = new Particle();
                        p.reset(canvas.width, canvas.height, config);
                        particlesRef.current.push(p);
                    }
                }

                particlesRef.current.forEach(p => {
                    p.update(dt, config);
                    p.draw(ctx, config);
                });
            }

            frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frame);
    }, [isPlaying, effects, currentIndex]);


    const getDefaultFX = (): FXConfig => ({
        id: 'fx_' + Date.now(),
        name: 'New Effect',
        mode: 'burst',
        count: 50,
        duration: 2.0,
        sprite: '',
        blend: 'lighter',
        life: { min: 0.5, max: 1.0 },
        speed: { min: 100, max: 200 },
        size: { start: 5, end: 0 },
        color: { start: '#ff0000', end: '#e74c3c' },
        physics: { gravity: 500, drag: 0.98, spread: 45 }
    });

    const updateFX = (path: string, value: any) => {
        const newEffects = [...effects];
        const fx = { ...newEffects[currentIndex] };
        const keys = path.split('.');
        let current: any = fx;
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = { ...current[keys[i]] };
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        newEffects[currentIndex] = fx;
        setEffects(newEffects);
    };

    const triggerBurst = () => {
        const canvas = canvasRef.current;
        const config = effects[currentIndex];
        if (!canvas || !config) return;
        
        particlesRef.current = [];
        for (let i = 0; i < config.count; i++) {
            const p = new Particle();
            p.reset(canvas.width, canvas.height, config);
            particlesRef.current.push(p);
        }
        setIsPlaying(true);
    };

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>BOOTING VFX KERNEL...</div>;

    const currentFX = effects[currentIndex] || getDefaultFX();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <Zap size={16} style={{ marginRight: '8px', display: 'inline' }} /> FX MASTER v2.0
                </div>
            </div>
            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" onClick={triggerBurst} title="Play Effect"><Play size={16} /></button>
                <button className="tool-btn" onClick={() => setIsPlaying(false)} title="Stop"><Square size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={saveToServer} disabled={isSaving} title="Save Effect"><Save size={16} /></button>
                <button className="tool-btn" onClick={() => setEffects([...effects, getDefaultFX()])} title="New Effect"><Plus size={16} /></button>
                <button className="tool-btn" style={{ color: '#e74c3c' }} title="Delete Effect"><Trash2 size={16} /></button>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                <Sidebar 
                    title="VFX LIBRARY" 
                    items={effects} 
                    currentIndex={currentIndex} 
                    onSelect={setCurrentIndex}
                    renderItem={(f, active) => (
                        <div style={{
                            padding: '10px', cursor: 'pointer', borderBottom: '1px solid #1a1a1a',
                            color: active ? 'var(--accent)' : '#888',
                            background: active ? 'rgba(255, 0, 0, 0.05)' : 'transparent',
                            borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent'
                        }}>
                            {f.name || 'Unnamed FX'}
                        </div>
                    )}
                />

                <div style={{ flexGrow: 1, background: 'var(--bg-canvas)', overflowY: 'auto', padding: '20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
                        <div>
                            <FormSection title="Emitter Config">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Effect Name</label>
                                        <input type="text" value={currentFX.name} onChange={(e) => updateFX('name', e.target.value)} />
                                    </div>
                                    <div>
                                        <label>Mode</label>
                                        <select value={currentFX.mode} onChange={(e) => updateFX('mode', e.target.value)}>
                                            <option value="burst">Burst</option>
                                            <option value="stream">Stream</option>
                                            <option value="loop">Continuous Loop</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Particle Count ({currentFX.count})</label>
                                        <input type="range" min="1" max="500" value={currentFX.count} onChange={(e) => updateFX('count', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label>Blend Mode</label>
                                        <select value={currentFX.blend} onChange={(e) => updateFX('blend', e.target.value)}>
                                            <option value="lighter">Additive (Lighter)</option>
                                            <option value="source-over">Normal</option>
                                            <option value="multiply">Multiply</option>
                                            <option value="screen">Screen</option>
                                        </select>
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection title="Particle Dynamics">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Min Speed</label>
                                        <input type="number" value={currentFX.speed.min} onChange={(e) => updateFX('speed.min', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label>Max Speed</label>
                                        <input type="number" value={currentFX.speed.max} onChange={(e) => updateFX('speed.max', parseInt(e.target.value))} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Start Size</label>
                                        <input type="number" value={currentFX.size.start} onChange={(e) => updateFX('size.start', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label>End Size</label>
                                        <input type="number" value={currentFX.size.end} onChange={(e) => updateFX('size.end', parseInt(e.target.value))} />
                                    </div>
                                </div>
                            </FormSection>
                        </div>

                        <div>
                            <FormSection title="Physics & Color">
                                <label>Spread Angle ({currentFX.physics.spread}°)</label>
                                <input type="range" min="0" max="360" value={currentFX.physics.spread} onChange={(e) => updateFX('physics.spread', parseInt(e.target.value))} />
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
                                    <div>
                                        <label>Gravity</label>
                                        <input type="number" value={currentFX.physics.gravity} onChange={(e) => updateFX('physics.gravity', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label>Air Drag</label>
                                        <input type="number" step="0.01" value={currentFX.physics.drag} onChange={(e) => updateFX('physics.drag', parseFloat(e.target.value))} />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
                                    <div>
                                        <label>Start Color</label>
                                        <input type="color" value={currentFX.color.start} onChange={(e) => updateFX('color.start', e.target.value)} style={{ height: '40px' }} />
                                    </div>
                                    <div>
                                        <label>End Color</label>
                                        <input type="color" value={currentFX.color.end} onChange={(e) => updateFX('color.end', e.target.value)} style={{ height: '40px' }} />
                                    </div>
                                </div>
                            </FormSection>
                        </div>
                    </div>
                </div>

                <div className="panel" style={{ width: '320px', borderLeft: '1px solid #1f2b42', borderRight: 'none' }}>
                    <div className="panel-header"><Play size={14} /> LIVE PREVIEW</div>
                    <div className="panel-content">
                        <div style={{ 
                            width: '100%', aspectRatio: '1', background: '#000', border: '1px solid #333', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)',
                            backgroundSize: '20px 20px'
                        }}>
                            <canvas ref={canvasRef} width={256} height={256} style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />
                        </div>
                        <div style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', marginTop: '10px' }}>
                            VFX SIMULATION KERNEL
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FXEditor;
