import React, { useState, useEffect, useRef } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Wand2 as MagicIcon, Play, Square, Save, Plus, Trash2, 
    Zap
} from 'lucide-react';
import Sidebar from './shared/Sidebar';
import FormSection from './shared/FormSection';
import Toast, { ToastHandle } from './shared/Toast';

interface FXConfig {
    id: string;
    name: string;
    mode: 'burst' | 'continuous' | 'stream' | 'loop';
    count: number;
    duration: number;
    sprite: string;
    blend: string;
    emitterShape: 'point' | 'circle' | 'box' | 'line';
    emitterRadius: number;
    emitterWidth: number;
    emitterHeight: number;
    angle: number;
    life: { min: number; max: number };
    speed: { min: number; max: number };
    size: { start: number; end: number };
    color: { start: string; mid?: string; end: string };
    physics: {
        gravity: number;
        drag: number;
        spread: number;
    };
}

const VALID_MODES = new Set(['burst', 'continuous', 'stream', 'loop']);

function makeDefaultFX(name = 'new_effect'): FXConfig {
    return {
        id: 'fx_' + Date.now(),
        name,
        mode: 'burst',
        count: 50,
        duration: 2.0,
        sprite: '',
        blend: 'lighter',
        emitterShape: 'point',
        emitterRadius: 30,
        emitterWidth: 60,
        emitterHeight: 40,
        angle: -90,
        life: { min: 0.5, max: 1.0 },
        speed: { min: 100, max: 200 },
        size: { start: 5, end: 0 },
        color: { start: '#ff3300', mid: '#ffaa00', end: '#555555' },
        physics: { gravity: 500, drag: 0.98, spread: 45 }
    };
}

function normalizeFX(raw: any, fallbackName = 'new_effect'): FXConfig {
    const def = makeDefaultFX(fallbackName);
    if (!raw || typeof raw !== 'object') return def;
    const mode = VALID_MODES.has(raw.mode) ? raw.mode : def.mode;
    const validShapes = new Set(['point', 'circle', 'box', 'line']);
    const emitterShape = validShapes.has(raw.emitterShape) ? raw.emitterShape : def.emitterShape;
    return {
        id: raw.id || def.id,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallbackName,
        mode,
        count: Number.isFinite(Number(raw.count)) ? Number(raw.count) : def.count,
        duration: Number.isFinite(Number(raw.duration)) ? Number(raw.duration) : def.duration,
        sprite: typeof raw.sprite === 'string' ? raw.sprite : def.sprite,
        blend: typeof raw.blend === 'string' ? raw.blend : def.blend,
        emitterShape,
        emitterRadius: Number.isFinite(Number(raw.emitterRadius)) ? Number(raw.emitterRadius) : def.emitterRadius,
        emitterWidth: Number.isFinite(Number(raw.emitterWidth)) ? Number(raw.emitterWidth) : def.emitterWidth,
        emitterHeight: Number.isFinite(Number(raw.emitterHeight)) ? Number(raw.emitterHeight) : def.emitterHeight,
        angle: Number.isFinite(Number(raw.angle)) ? Number(raw.angle) : def.angle,
        life: {
            min: Number.isFinite(Number(raw.life?.min)) ? Number(raw.life.min) : def.life.min,
            max: Number.isFinite(Number(raw.life?.max)) ? Number(raw.life.max) : def.life.max,
        },
        speed: {
            min: Number.isFinite(Number(raw.speed?.min)) ? Number(raw.speed.min) : def.speed.min,
            max: Number.isFinite(Number(raw.speed?.max)) ? Number(raw.speed.max) : def.speed.max,
        },
        size: {
            start: Number.isFinite(Number(raw.size?.start)) ? Number(raw.size.start) : def.size.start,
            end: Number.isFinite(Number(raw.size?.end)) ? Number(raw.size.end) : def.size.end,
        },
        color: {
            start: typeof raw.color?.start === 'string' ? raw.color.start : def.color.start,
            mid: typeof raw.color?.mid === 'string' ? raw.color.mid : def.color.mid,
            end: typeof raw.color?.end === 'string' ? raw.color.end : def.color.end,
        },
        physics: {
            gravity: Number.isFinite(Number(raw.physics?.gravity)) ? Number(raw.physics.gravity) : def.physics.gravity,
            drag: Number.isFinite(Number(raw.physics?.drag)) ? Number(raw.physics.drag) : def.physics.drag,
            spread: Number.isFinite(Number(raw.physics?.spread)) ? Number(raw.physics.spread) : def.physics.spread,
        },
    };
}

function interpolateColor(hex1: string, hex2: string, t: number): string {
    const parseHex = (h: string) => {
        const clean = (h || '#ffffff').replace('#', '');
        if (clean.length === 3) {
            return [
                parseInt(clean[0] + clean[0], 16),
                parseInt(clean[1] + clean[1], 16),
                parseInt(clean[2] + clean[2], 16)
            ];
        }
        return [
            parseInt(clean.slice(0, 2), 16) || 0,
            parseInt(clean.slice(2, 4), 16) || 0,
            parseInt(clean.slice(4, 6), 16) || 0
        ];
    };
    const [r1, g1, b1] = parseHex(hex1);
    const [r2, g2, b2] = parseHex(hex2);
    const clampedT = Math.max(0, Math.min(1, t));
    const r = Math.round(r1 + (r2 - r1) * clampedT);
    const g = Math.round(g1 + (g2 - g1) * clampedT);
    const b = Math.round(b1 + (b2 - b1) * clampedT);
    return `rgb(${r},${g},${b})`;
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
        const cx = canvasW / 2;
        const cy = canvasH / 2;
        if (config.emitterShape === 'circle') {
            const r = Math.sqrt(Math.random()) * (config.emitterRadius || 30);
            const theta = Math.random() * Math.PI * 2;
            this.x = cx + r * Math.cos(theta);
            this.y = cy + r * Math.sin(theta);
        } else if (config.emitterShape === 'box') {
            const w = config.emitterWidth || 60;
            const h = config.emitterHeight || 40;
            this.x = cx + (Math.random() - 0.5) * w;
            this.y = cy + (Math.random() - 0.5) * h;
        } else if (config.emitterShape === 'line') {
            const len = config.emitterWidth || 60;
            this.x = cx + (Math.random() - 0.5) * len;
            this.y = cy;
        } else { // 'point'
            this.x = cx;
            this.y = cy;
        }

        const baseAngle = Number.isFinite(config.angle) ? config.angle : -90;
        const angleRad = (baseAngle + (Math.random() - 0.5) * config.physics.spread) * (Math.PI / 180);
        const speed = config.speed.min + Math.random() * (config.speed.max - config.speed.min);
        this.vx = Math.cos(angleRad) * speed;
        this.vy = Math.sin(angleRad) * speed;
        this.lifeMax = Math.max(0.01, config.life.min + Math.random() * (config.life.max - config.life.min));
        this.life = this.lifeMax;
        this.active = true;
    }

    update(dt: number, config: FXConfig) {
        if (!this.active) return;
        const dragClamped = Math.max(0, Math.min(1, config.physics.drag));
        const damping = Math.pow(dragClamped, dt * 60);
        this.vx *= damping;
        this.vy *= damping;
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
        
        const c = config.color;
        let colorStr: string;
        if (c.mid) {
            if (progress < 0.5) {
                colorStr = interpolateColor(c.start, c.mid, progress * 2);
            } else {
                colorStr = interpolateColor(c.mid, c.end, (progress - 0.5) * 2);
            }
        } else {
            colorStr = interpolateColor(c.start, c.end, progress);
        }
        ctx.fillStyle = colorStr;
        ctx.globalAlpha = Math.max(0, Math.min(1, 1 - progress));
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.1, size), 0, Math.PI * 2);
        ctx.fill();
    }
}

const FXEditor: React.FC = () => {
    const { isReady, sprites: spriteLib, eventBus } = useStudio();
    const [effects, setEffects] = useState<FXConfig[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const toastRef = useRef<ToastHandle>(null);

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
                if (Array.isArray(names) && names.length > 0) {
                    const loaded = await Promise.all(names.map(async (n: string) => {
                        const r = await fetch(`/api/fx/${encodeURIComponent(n)}`);
                        return r.ok ? normalizeFX(await r.json(), n) : null;
                    }));
                    const valid = loaded.filter((l): l is FXConfig => l !== null);
                    setEffects(valid.length > 0 ? valid : [getDefaultFX()]);
                } else {
                    setEffects([getDefaultFX()]);
                }
            } else {
                setEffects([getDefaultFX()]);
            }
        } catch (e) {
            setEffects([getDefaultFX()]);
        }
    };

    const saveToServer = async (interactive = true) => {
        const config = effects[currentIndex];
        if (!config) return;
        const safeName = (config.name || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
        if (!safeName) {
            if (interactive) toastRef.current?.show('INVALID EFFECT NAME', 'error');
            return;
        }
        const payload = { ...config, name: safeName };
        setIsSaving(true);
        try {
            // Use dedicated FX route so file lands in <project>/data/fx/ (engine reads /api/fx/list there),
            // not <project>/assets/data/fx/ (assets/upload forces assets/ prefix and engine never finds it).
            const res = await fetch('/api/fx/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: safeName, config: payload })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (interactive) toastRef.current?.show(err?.error || `SAVE FAILED (${res.status})`, 'error');
                return;
            }
            setEffects(prev => prev.map((fx, i) => (i === currentIndex ? payload : fx)));
            if (eventBus) eventBus.emit('fx:updated', { id: payload.id, config: payload });
            if (interactive) toastRef.current?.show('FX SAVED', 'success');
        } catch (e) {
            if (interactive) toastRef.current?.show('SAVE FAILED', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const deleteCurrentFX = async () => {
        const config = effects[currentIndex];
        if (!config) return;
        try {
            const res = await fetch(`/api/fx/${encodeURIComponent(config.name)}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 404) {
                toastRef.current?.show(`DELETE FAILED (${res.status})`, 'error');
                return;
            }
            const next = effects.filter((_, i) => i !== currentIndex);
            setEffects(next.length > 0 ? next : [getDefaultFX()]);
            setCurrentIndex(Math.max(0, currentIndex - 1));
            toastRef.current?.show('FX DELETED', 'info');
        } catch {
            toastRef.current?.show('DELETE FAILED', 'error');
        }
    };

    const saveToServerRef = useRef(saveToServer);
    saveToServerRef.current = saveToServer;

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void saveToServerRef.current(true);
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
    }, [eventBus]);

    useEffect(() => {
        if (!isPlaying) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let lastTime = performance.now();
        let frame: number;

        const loop = (time: number) => {
            const dt = Math.min((time - lastTime) / 1000, 0.1);
            lastTime = time;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = (effects[currentIndex]?.blend as any) || 'lighter';

            // Update & Spawn
            const config = effects[currentIndex];
            if (config) {
                if (config.mode === 'burst') {
                    if (particlesRef.current.length > 0 && particlesRef.current.every(p => !p.active)) {
                        setIsPlaying(false);
                        return;
                    }
                } else {
                    const activeCount = particlesRef.current.filter(p => p.active).length;
                    if (activeCount < config.count) {
                        const lifeAvg = Math.max(0.1, (config.life.min + config.life.max) / 2);
                        const spawnRate = Math.max(1, Math.ceil((config.count / lifeAvg) * dt));
                        for (let s = 0; s < spawnRate; s++) {
                            if (particlesRef.current.filter(p => p.active).length >= config.count) break;
                            const inactive = particlesRef.current.find(p => !p.active);
                            if (inactive) inactive.reset(canvas.width, canvas.height, config);
                            else {
                                const p = new Particle();
                                p.reset(canvas.width, canvas.height, config);
                                particlesRef.current.push(p);
                            }
                        }
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


    const getDefaultFX = (): FXConfig => makeDefaultFX('new_effect');

    const updateFX = (path: string, value: any) => {
        const newEffects = [...effects];
        const fx = normalizeFX(newEffects[currentIndex]);
        const keys = path.split('.');
        let current: any = fx;
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = { ...(current[keys[i]] || {}) };
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
                <button className="tool-btn" onClick={() => void saveToServer(true)} disabled={isSaving} title="Save Effect (Ctrl+S)"><Save size={16} /></button>
                <button className="tool-btn" onClick={() => setEffects([...effects, getDefaultFX()])} title="New Effect"><Plus size={16} /></button>
                <button className="tool-btn" onClick={() => void deleteCurrentFX()} style={{ color: '#e74c3c' }} title="Delete Effect"><Trash2 size={16} /></button>
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

                <div style={{ flexGrow: 1, background: 'var(--bg-deep)', overflowY: 'auto', padding: '20px' }}>
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
                                            <option value="continuous">Continuous</option>
                                            <option value="stream">Stream</option>
                                            <option value="loop">Continuous Loop</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                    <div>
                                        <label>Emitter Shape</label>
                                        <select value={currentFX.emitterShape || 'point'} onChange={(e) => updateFX('emitterShape', e.target.value)}>
                                            <option value="point">Point</option>
                                            <option value="circle">Circle / Ring</option>
                                            <option value="box">Box / Area</option>
                                            <option value="line">Line</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label>Emitter Angle ({currentFX.angle ?? -90}°)</label>
                                        <input type="range" min="-180" max="180" value={currentFX.angle ?? -90} onChange={(e) => updateFX('angle', parseInt(e.target.value, 10) || -90)} />
                                    </div>
                                </div>

                                {currentFX.emitterShape === 'circle' && (
                                    <div style={{ marginBottom: '15px' }}>
                                        <label>Emitter Radius ({currentFX.emitterRadius || 30}px)</label>
                                        <input type="range" min="1" max="120" value={currentFX.emitterRadius || 30} onChange={(e) => updateFX('emitterRadius', parseInt(e.target.value, 10) || 30)} />
                                    </div>
                                )}

                                {(currentFX.emitterShape === 'box' || currentFX.emitterShape === 'line') && (
                                    <div style={{ display: 'grid', gridTemplateColumns: currentFX.emitterShape === 'box' ? '1fr 1fr' : '1fr', gap: '15px', marginBottom: '15px' }}>
                                        <div>
                                            <label>Emitter Width ({currentFX.emitterWidth || 60}px)</label>
                                            <input type="range" min="1" max="240" value={currentFX.emitterWidth || 60} onChange={(e) => updateFX('emitterWidth', parseInt(e.target.value, 10) || 60)} />
                                        </div>
                                        {currentFX.emitterShape === 'box' && (
                                            <div>
                                                <label>Emitter Height ({currentFX.emitterHeight || 40}px)</label>
                                                <input type="range" min="1" max="240" value={currentFX.emitterHeight || 40} onChange={(e) => updateFX('emitterHeight', parseInt(e.target.value, 10) || 40)} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Particle Count ({currentFX.count})</label>
                                        <input type="range" min="1" max="500" value={currentFX.count} onChange={(e) => updateFX('count', parseInt(e.target.value, 10) || 1)} />
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
                                        <input type="number" value={currentFX.speed.min} onChange={(e) => updateFX('speed.min', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                    <div>
                                        <label>Max Speed</label>
                                        <input type="number" value={currentFX.speed.max} onChange={(e) => updateFX('speed.max', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div>
                                        <label>Start Size</label>
                                        <input type="number" value={currentFX.size.start} onChange={(e) => updateFX('size.start', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                    <div>
                                        <label>End Size</label>
                                        <input type="number" value={currentFX.size.end} onChange={(e) => updateFX('size.end', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                </div>
                            </FormSection>
                        </div>

                        <div>
                            <FormSection title="Physics & Color">
                                <label>Spread Angle ({currentFX.physics.spread}°)</label>
                                <input type="range" min="0" max="360" value={currentFX.physics.spread} onChange={(e) => updateFX('physics.spread', parseInt(e.target.value, 10) || 0)} />
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
                                    <div>
                                        <label>Gravity</label>
                                        <input type="number" value={currentFX.physics.gravity} onChange={(e) => updateFX('physics.gravity', parseInt(e.target.value, 10) || 0)} />
                                    </div>
                                    <div>
                                        <label>Air Drag</label>
                                        <input type="number" step="0.01" value={currentFX.physics.drag} onChange={(e) => updateFX('physics.drag', parseFloat(e.target.value) || 0)} />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '15px' }}>
                                    <div>
                                        <label>Start Color</label>
                                        <input type="color" value={currentFX.color.start} onChange={(e) => updateFX('color.start', e.target.value)} style={{ height: '40px' }} />
                                    </div>
                                    <div>
                                        <label>Mid Color</label>
                                        <input type="color" value={currentFX.color.mid || '#ffaa00'} onChange={(e) => updateFX('color.mid', e.target.value)} style={{ height: '40px' }} />
                                    </div>
                                    <div>
                                        <label>End Color</label>
                                        <input type="color" value={currentFX.color.end} onChange={(e) => updateFX('color.end', e.target.value)} style={{ height: '40px' }} />
                                    </div>
                                </div>
                                <div style={{ marginTop: '8px', height: '12px', borderRadius: '2px', border: '1px solid #333', background: `linear-gradient(to right, ${currentFX.color.start}, ${currentFX.color.mid || currentFX.color.start}, ${currentFX.color.end})` }} />
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
            <Toast ref={toastRef} />
        </div>
    );
};

export default FXEditor;
