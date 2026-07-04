import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStudio } from '../hooks/useStudio';
import { Save, Plus, Trash2, Copy, Eye, Code, Layout, Maximize2, Edit3, Square, Image as ImageIcon, List, Check, X, Columns, Monitor } from 'lucide-react';
import Toast, { ToastHandle } from './shared/Toast';

interface Rect { x: number; y: number; w: number; h: number }
interface Style { [key: string]: any }
interface ElementData {
  id: string;
  type: 'panel' | 'label' | 'button' | 'bar' | 'image' | 'slot';
  text?: string;
  rect: Rect;
  anchor?: string;
  style?: Style;
  props?: Record<string, any>;
  script?: string;
  condition?: string;
  src?: string;
}
interface ScreenData { elements: ElementData[] }
interface UiDocument {
  resolution: { w: number; h: number };
  screens: Record<string, ScreenData>;
  fileName?: string;
}

const ANCHORS = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];
const ELEMENT_TYPES = [
  { type: 'panel', label: 'Panel', icon: 'Square' },
  { type: 'label', label: 'Label', icon: 'Type' },
  { type: 'button', label: 'Button', icon: 'Check' },
  { type: 'bar', label: 'Bar', icon: 'Table' },
  { type: 'image', label: 'Image', icon: 'Image' },
  { type: 'slot', label: 'Slot', icon: 'Grid' },
] as const;

const RES_W = 800;
const RES_H = 450;
const CANVAS_SCALE = 0.75;

function getDefaultElement(type: ElementData['type']): ElementData {
  const base: ElementData = {
    id: `${type}_${Date.now().toString(36)}`,
    type,
    rect: { x: 50, y: 50, w: 160, h: type === 'bar' ? 20 : type === 'label' ? 24 : 40 },
    anchor: 'top-left',
    style: { color: '#fff', fontSize: type === 'bar' ? 11 : 14 },
  };
  if (type === 'label' || type === 'button') base.text = type.toUpperCase();
  if (type === 'bar') { base.text = '{player.hp}/{player.maxHp}'; base.props = { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: '#e74c3c' }; }
  if (type === 'image') base.src = '/assets/ui/placeholder.png';
  if (type === 'slot') { base.text = '1'; base.props = { variable: 'inventory.0' }; }
  return base;
}

function getDefaultDoc(): UiDocument {
  return {
    resolution: { w: RES_W, h: RES_H },
    screens: { main_hud: { elements: [] } },
  };
}

const UIDesigner: React.FC = () => {
  const { isReady, emit, subscribe } = useStudio();
  const [doc, setDoc] = useState<UiDocument>(getDefaultDoc());
  const [currentScreen, setCurrentScreen] = useState('main_hud');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(false);
  const [dragEl, setDragEl] = useState<{ id: string; startX: number; startY: number; elStartX: number; elStartY: number } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<ToastHandle>(null);

  const elements = doc.screens[currentScreen]?.elements || [];

  const setElements = useCallback((newEls: ElementData[]) => {
    setDoc(prev => ({
      ...prev,
      screens: { ...prev.screens, [currentScreen]: { elements: newEls } },
    }));
    setIsDirty(true);
  }, [currentScreen]);

  useEffect(() => {
    if (isReady) loadDoc();
  }, [isReady]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveDoc(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          deleteElement(selectedId);
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [selectedId, elements]);

  const loadDoc = async () => {
    try {
      const res = await fetch('/api/ui-config?file=main.redui');
      if (res.ok) {
        const data = await res.json();
        if (data.screens && Object.keys(data.screens).length > 0) {
          setDoc({
            resolution: data.resolution || { w: RES_W, h: RES_H },
            screens: data.screens,
            fileName: data.fileName,
          });
          setCurrentScreen(Object.keys(data.screens)[0]);
          return;
        }
      }
    } catch (e) { /* fallback to default */ }
    setDoc(getDefaultDoc());
  };

  const saveDoc = async () => {
    try {
      const res = await fetch('/api/ui-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      if (res.ok) {
        setIsDirty(false);
        toastRef.current?.show('HUD CONFIG SAVED', 'success');
        emit('ui:saved', { fileName: doc.fileName || 'main.redui' });
      } else {
        toastRef.current?.show('SAVE FAILED', 'error');
      }
    } catch (e) {
      toastRef.current?.show('SAVE FAILED', 'error');
    }
  };

  const addElement = (type: ElementData['type']) => {
    const el = getDefaultElement(type);
    el.rect.x = 50 + (elements.length * 15) % 300;
    el.rect.y = 50 + (elements.length * 15) % 200;
    setElements([...elements, el]);
    setSelectedId(el.id);
    toastRef.current?.show(`ADDED ${type.toUpperCase()}`, 'info');
  };

  const deleteElement = (id: string) => {
    setElements(elements.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateElement = () => {
    if (!selectedId) return;
    const el = elements.find(e => e.id === selectedId);
    if (!el) return;
    const clone: ElementData = { ...JSON.parse(JSON.stringify(el)), id: `${el.type}_${Date.now().toString(36)}` };
    clone.rect.x += 20;
    clone.rect.y += 20;
    setElements([...elements, clone]);
    setSelectedId(clone.id);
  };

  const updateElement = (id: string, updates: Partial<ElementData>) => {
    setElements(elements.map(e => e.id === id ? { ...e, ...updates } as ElementData : e));
  };

  const moveElement = (id: string, dx: number, dy: number) => {
    setElements(elements.map(e => e.id === id ? { ...e, rect: { ...e.rect, x: e.rect.x + dx, y: e.rect.y + dy } } : e));
  };

  const selectedEl = elements.find(e => e.id === selectedId) || null;

  const updateStyle = (id: string, key: string, value: any) => {
    setElements(elements.map(e => e.id === id ? { ...e, style: { ...(e.style || {}), [key]: value } } : e));
  };

  const updateProp = (id: string, key: string, value: any) => {
    setElements(elements.map(e => e.id === id ? { ...e, props: { ...(e.props || {}), [key]: value } } : e));
  };

  const handleCanvasMouseDown = (e: React.MouseEvent, elId: string) => {
    if (mode !== 'design') return;
    const el = elements.find(el => el.id === elId);
    if (!el) return;
    setSelectedId(elId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = CANVAS_SCALE;
    setDragEl({
      id: elId,
      startX: e.clientX,
      startY: e.clientY,
      elStartX: el.rect.x,
      elStartY: el.rect.y,
    });
  };

  useEffect(() => {
    if (!dragEl) return;
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragEl.startX) / CANVAS_SCALE;
      const dy = (e.clientY - dragEl.startY) / CANVAS_SCALE;
      moveElement(dragEl.id, Math.round(dx / 4) * 4, Math.round(dy / 4) * 4);
    };
    const handleUp = () => setDragEl(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragEl]);

  const addScreen = () => {
    const name = prompt('Screen ID:', 'screen_' + Date.now().toString(36));
    if (!name) return;
    const id = name.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id || doc.screens[id]) { toastRef.current?.show('INVALID OR DUPLICATE SCREEN ID', 'error'); return; }
    setDoc(prev => ({ ...prev, screens: { ...prev.screens, [id]: { elements: [] } } }));
    setCurrentScreen(id);
    setIsDirty(true);
  };

  const deleteScreen = () => {
    const keys = Object.keys(doc.screens);
    if (keys.length <= 1) { toastRef.current?.show('CANNOT DELETE LAST SCREEN', 'error'); return; }
    const next = keys.find(k => k !== currentScreen) || keys[0];
    setDoc(prev => {
      const { [currentScreen]: _, ...rest } = prev.screens;
      return { ...prev, screens: rest };
    });
    setCurrentScreen(next);
    setSelectedId(null);
    setIsDirty(true);
  };

  if (!isReady) return <div style={{ color: 'var(--accent-ui)', padding: '20px' }}>LOADING UI DESIGNER...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      <Toast ref={toastRef} />

      {/* Menu Bar */}
      <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between' }}>
        <div style={{ color: 'var(--accent-ui)', fontWeight: 'bold', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Monitor size={14} /> UI DESIGNER v1.0
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.75rem' }}>
          <span style={{ color: isDirty ? 'var(--accent-ui)' : '#444' }}>{isDirty ? '● UNSAVED' : '● SYNCED'}</span>
          <span style={{ color: '#666' }}>{currentScreen}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '6px' }}>
        <button className="tool-btn" onClick={saveDoc} title="Save (Ctrl+S)"><Save size={16} /></button>
        <div style={{ width: '1px', height: '20px', background: '#333' }} />
        {ELEMENT_TYPES.map(et => (
          <button key={et.type} className="tool-btn" onClick={() => addElement(et.type)} title={`Add ${et.label}`}>
            {et.type === 'panel' ? <Square size={16} /> : et.type === 'label' ? <Edit3 size={16} /> : et.type === 'button' ? <Check size={16} /> : et.type === 'bar' ? <List size={16} /> : et.type === 'image' ? <ImageIcon size={16} /> : <Layout size={16} />}
            <span style={{ fontSize: '0.6rem', marginLeft: '4px' }}>{et.label}</span>
          </button>
        ))}
        <div style={{ width: '1px', height: '20px', background: '#333' }} />
        <button className="tool-btn" onClick={duplicateElement} disabled={!selectedId} title="Duplicate"><Copy size={16} /></button>
        <button className="tool-btn" style={{ color: '#e74c3c' }} onClick={() => selectedId && deleteElement(selectedId)} disabled={!selectedId} title="Delete"><Trash2 size={16} /></button>
        <div style={{ width: '1px', height: '20px', background: '#333' }} />
        <button className={`tool-btn ${mode === 'preview' ? 'active' : ''}`} onClick={() => setMode(mode === 'preview' ? 'design' : 'preview')} title="Toggle Preview">
          <Eye size={16} /> <span style={{ fontSize: '0.6rem', marginLeft: '4px' }}>{mode === 'preview' ? 'DESIGN' : 'PREVIEW'}</span>
        </button>
        <button className={`tool-btn ${showJson ? 'active' : ''}`} onClick={() => setShowJson(!showJson)} title="JSON View">
          <Code size={16} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <select
            value={currentScreen}
            onChange={e => { setCurrentScreen(e.target.value); setSelectedId(null); }}
            style={{ height: '28px', fontSize: '0.75rem', background: '#111', color: '#ccc', border: '1px solid #333', borderRadius: '3px', padding: '0 8px' }}
          >
            {Object.keys(doc.screens).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="tool-btn" onClick={addScreen} title="Add Screen"><Plus size={14} /></button>
          <button className="tool-btn" style={{ color: '#e74c3c' }} onClick={deleteScreen} title="Delete Screen"><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Element List */}
        <div style={{ width: '200px', background: '#000', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header" style={{ borderBottom: '1px solid #333', padding: '8px 12px', fontSize: '0.7rem', color: '#888', letterSpacing: '1px' }}>
            <Columns size={12} style={{ marginRight: '6px' }} /> ELEMENTS ({elements.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {elements.map(el => (
              <div
                key={el.id}
                onClick={() => setSelectedId(el.id)}
                style={{
                  padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem',
                  borderLeft: selectedId === el.id ? '3px solid var(--accent-ui)' : '3px solid transparent',
                  background: selectedId === el.id ? 'rgba(52,152,219,0.08)' : 'transparent',
                  color: selectedId === el.id ? 'var(--accent-ui)' : '#888',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <span style={{ fontSize: '0.6rem', opacity: 0.5, fontFamily: 'monospace' }}>{el.type[0].toUpperCase()}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.id}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', overflow: 'hidden', position: 'relative' }}>
          <div
            ref={canvasRef}
            style={{
              position: 'relative',
              width: RES_W * CANVAS_SCALE,
              height: RES_H * CANVAS_SCALE,
              background: '#111',
              border: '1px solid #333',
              boxShadow: '0 0 60px rgba(0,0,0,0.8)',
              overflow: 'hidden',
              transform: 'scale(1)',
              transformOrigin: 'center center',
            }}
          >
            {/* Grid */}
            {mode === 'design' && Array.from({ length: 16 }).map((_, i) => (
              <div key={`v${i}`} style={{ position: 'absolute', left: `${(i / 16) * 100}%`, top: 0, width: '1px', height: '100%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
            ))}
            {mode === 'design' && Array.from({ length: 9 }).map((_, i) => (
              <div key={`h${i}`} style={{ position: 'absolute', left: 0, top: `${(i / 9) * 100}%`, width: '100%', height: '1px', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
            ))}

            {/* Elements */}
            {elements.map(el => {
              const sx = el.rect.x * CANVAS_SCALE;
              const sy = el.rect.y * CANVAS_SCALE;
              const sw = el.rect.w * CANVAS_SCALE;
              const sh = el.rect.h * CANVAS_SCALE;
              const isSelected = selectedId === el.id;

              let anchorOff = { left: 0, top: 0 };
              const a = el.anchor || 'top-left';
              if (a.includes('right')) anchorOff.left = RES_W * CANVAS_SCALE - sw - sx;
              else if (a.includes('center')) anchorOff.left = RES_W * CANVAS_SCALE / 2 - sw / 2 + sx;
              else anchorOff.left = sx;
              if (a.includes('bottom')) anchorOff.top = RES_H * CANVAS_SCALE - sh - sy;
              else if (a.includes('center')) anchorOff.top = RES_H * CANVAS_SCALE / 2 - sh / 2 + sy;
              else anchorOff.top = sy;

              return (
                <div
                  key={el.id}
                  onMouseDown={e => handleCanvasMouseDown(e, el.id)}
                  style={{
                    position: 'absolute',
                    left: anchorOff.left,
                    top: anchorOff.top,
                    width: sw,
                    height: sh,
                    cursor: mode === 'design' ? 'move' : 'default',
                    border: isSelected ? '2px solid var(--accent-ui)' : '1px solid rgba(255,255,255,0.1)',
                    background: el.style?.backgroundColor || (el.type === 'panel' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)'),
                    borderRadius: (el.style?.borderRadius || 0) * CANVAS_SCALE + 'px',
                    color: el.style?.color || '#fff',
                    fontSize: (el.style?.fontSize || 14) * CANVAS_SCALE * 0.8 + 'px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: el.style?.textAlign === 'center' ? 'center' : el.style?.textAlign === 'right' ? 'flex-end' : 'flex-start',
                    padding: '0 4px',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    opacity: mode === 'preview' ? (el.condition ? 0.6 : 1) : 1,
                    boxShadow: isSelected ? '0 0 12px rgba(52,152,219,0.3)' : 'none',
                    zIndex: el.style?.zIndex || 0,
                    textTransform: el.style?.textTransform as any || 'none',
                    letterSpacing: (el.style?.letterSpacing || 0) + 'px',
                    fontWeight: el.style?.fontWeight || 'normal',
                  }}
                >
                  {el.type === 'bar' && (
                    <div style={{
                      position: 'absolute', left: 0, top: 0, height: '100%',
                      width: '60%', background: el.props?.fillColor || '#e74c3c',
                      borderRadius: ((el.style?.borderRadius || 0) - 1) * CANVAS_SCALE + 'px',
                      opacity: 0.7, transition: 'width 0.25s',
                    }} />
                  )}
                  {el.type === 'label' || el.type === 'button' ? (el.text || el.id) : el.type === 'bar' ? (el.text || '') : ''}
                  {isSelected && mode === 'design' && (
                    <div style={{
                      position: 'absolute', right: -4, bottom: -4, width: 8, height: 8,
                      background: 'var(--accent-ui)', borderRadius: '50%', border: '1px solid #fff',
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Property Inspector + JSON */}
        <div style={{ width: '320px', background: '#000', borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
          {showJson ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header" style={{ borderBottom: '1px solid #333', padding: '8px 12px', fontSize: '0.7rem', color: '#888' }}>RAW JSON</div>
              <textarea
                value={jsonText}
                onChange={e => {
                  setJsonText(e.target.value);
                  try { const parsed = JSON.parse(e.target.value); setDoc(prev => ({ ...prev, ...parsed })); setJsonError(false); setIsDirty(true); }
                  catch (err) { setJsonError(true); }
                }}
                style={{
                  flex: 1, background: '#0a0a0a', color: '#ccc', border: 'none', padding: '12px',
                  fontFamily: 'monospace', fontSize: '0.7rem', resize: 'none', outline: 'none',
                  borderBottom: jsonError ? '2px solid #e74c3c' : 'none',
                }}
              />
              {jsonError && <div style={{ padding: '6px 12px', color: '#e74c3c', fontSize: '0.65rem' }}>INVALID JSON</div>}
            </div>
          ) : selectedEl ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="panel-header" style={{ borderBottom: '1px solid #333', padding: '8px 12px', fontSize: '0.7rem', color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                <span>PROPERTIES — {selectedEl.type.toUpperCase()}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#555' }}>{selectedEl.id}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {/* Identity */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Element ID</label>
                  <input value={selectedEl.id} onChange={e => updateElement(selectedId!, { id: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Type</label>
                  <select value={selectedEl.type} onChange={e => updateElement(selectedId!, { type: e.target.value as any })} style={inputStyle}>
                    {ELEMENT_TYPES.map(et => <option key={et.type} value={et.type}>{et.label}</option>)}
                  </select>
                </div>

                {/* Position */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Position & Size</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {(['x', 'y', 'w', 'h'] as const).map(f => (
                      <div key={f}>
                        <span style={{ fontSize: '0.6rem', color: '#666' }}>{f.toUpperCase()}</span>
                        <input
                          type="number"
                          value={selectedEl.rect[f]}
                          onChange={e => updateElement(selectedId!, { rect: { ...selectedEl.rect, [f]: parseInt(e.target.value) || 0 } })}
                          style={{ ...inputStyle, padding: '4px' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Anchor */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Anchor</label>
                  <select value={selectedEl.anchor || 'top-left'} onChange={e => updateElement(selectedId!, { anchor: e.target.value })} style={inputStyle}>
                    {ANCHORS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                {/* Text */}
                {(selectedEl.type === 'label' || selectedEl.type === 'button' || selectedEl.type === 'bar') && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Text</label>
                    <input value={selectedEl.text || ''} onChange={e => updateElement(selectedId!, { text: e.target.value })} style={inputStyle} />
                  </div>
                )}

                {/* Script (buttons) */}
                {selectedEl.type === 'button' && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Action Script</label>
                    <input value={selectedEl.script || ''} onChange={e => updateElement(selectedId!, { script: e.target.value })} style={inputStyle} />
                  </div>
                )}

                {/* Image src */}
                {selectedEl.type === 'image' && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Image Source</label>
                    <input value={selectedEl.src || ''} onChange={e => updateElement(selectedId!, { src: e.target.value })} style={inputStyle} />
                  </div>
                )}

                {/* Bar props */}
                {selectedEl.type === 'bar' && (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={labelStyle}>Variable (current value path)</label>
                      <input value={selectedEl.props?.variable || ''} onChange={e => updateProp(selectedId!, 'variable', e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={labelStyle}>Max Variable</label>
                      <input value={selectedEl.props?.maxVariable || ''} onChange={e => updateProp(selectedId!, 'maxVariable', e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={labelStyle}>Fill Color</label>
                      <input value={selectedEl.props?.fillColor || '#e74c3c'} onChange={e => updateProp(selectedId!, 'fillColor', e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={labelStyle}>Flash on Damage</label>
                      <select value={String(!!selectedEl.props?.flashOnDamage)} onChange={e => updateProp(selectedId!, 'flashOnDamage', e.target.value === 'true')} style={inputStyle}>
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Style */}
                <div style={{ borderTop: '1px solid #222', paddingTop: '16px', marginBottom: '16px' }}>
                  <label style={{ ...labelStyle, color: '#888', fontSize: '0.65rem', letterSpacing: '1px' }}>STYLE</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.6rem', color: '#666' }}>Color</span>
                      <input value={selectedEl.style?.color || '#ffffff'} onChange={e => updateStyle(selectedId!, 'color', e.target.value)} style={{ ...inputStyle, padding: '4px' }} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.6rem', color: '#666' }}>Font Size</span>
                      <input type="number" value={selectedEl.style?.fontSize || 14} onChange={e => updateStyle(selectedId!, 'fontSize', parseInt(e.target.value) || 14)} style={{ ...inputStyle, padding: '4px' }} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.6rem', color: '#666' }}>BG Color</span>
                      <input value={selectedEl.style?.backgroundColor || ''} onChange={e => updateStyle(selectedId!, 'backgroundColor', e.target.value)} style={{ ...inputStyle, padding: '4px' }} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.6rem', color: '#666' }}>Border Radius</span>
                      <input type="number" value={selectedEl.style?.borderRadius || 0} onChange={e => updateStyle(selectedId!, 'borderRadius', parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '4px' }} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.6rem', color: '#666' }}>Opacity</span>
                      <input type="number" step="0.1" min="0" max="1" value={selectedEl.style?.opacity ?? 1} onChange={e => updateStyle(selectedId!, 'opacity', parseFloat(e.target.value) || 1)} style={{ ...inputStyle, padding: '4px' }} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.6rem', color: '#666' }}>Z-Index</span>
                      <input type="number" value={selectedEl.style?.zIndex || 0} onChange={e => updateStyle(selectedId!, 'zIndex', parseInt(e.target.value) || 0)} style={{ ...inputStyle, padding: '4px' }} />
                    </div>
                  </div>
                </div>

                {/* Condition */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Visibility Condition</label>
                  <input value={selectedEl.condition || ''} onChange={e => updateElement(selectedId!, { condition: e.target.value })} placeholder="e.g. state.player.hp > 0" style={inputStyle} />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: '0.75rem', letterSpacing: '1px' }}>
              SELECT AN ELEMENT
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.65rem', color: '#888', marginBottom: '4px', letterSpacing: '0.5px',
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#111', color: '#ccc', border: '1px solid #333',
  borderRadius: '3px', padding: '6px 8px', fontSize: '0.75rem', outline: 'none',
  boxSizing: 'border-box',
};

export default UIDesigner;
