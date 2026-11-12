import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStudio } from '../hooks/useStudio';
import {
  Save, Plus, Trash2, Copy, Eye, Code, Layout, Maximize2, Edit3, Square,
  Image as ImageIcon, List, Check, Columns, Monitor, Layers, X, ZoomIn, ZoomOut,
  AlertTriangle, CheckCircle2, Grid as GridIcon, ArrowUp, ArrowDown
} from 'lucide-react';
import Toast, { ToastHandle } from './shared/Toast';
// @ts-ignore — shared UMD module imported cleanly via @shared alias
import UITemplates from '@shared/UITemplates.js';

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
interface ScreenData {
  elements: ElementData[];
  background?: boolean | string;
  [key: string]: any;
}
interface UiDocument {
  format?: string;
  formatVersion?: number | string;
  designSystem?: Record<string, any>;
  resolution: { w: number; h: number };
  screens: Record<string, ScreenData>;
  fileName?: string;
  [key: string]: any;
}

const ANCHORS = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
] as const;

const ELEMENT_TYPES = [
  { type: 'panel', label: 'Panel' },
  { type: 'label', label: 'Label' },
  { type: 'button', label: 'Button' },
  { type: 'bar', label: 'Bar' },
  { type: 'image', label: 'Image' },
  { type: 'slot', label: 'Slot' },
] as const;

const SAMPLE_PREVIEW_STATE: Record<string, any> = {
  player: {
    level: 7,
    hp: 74,
    maxHp: 100,
    mana: 52,
    maxMana: 100,
    stamina: 84,
    maxStamina: 100,
    coins: 1340,
    xp: 4820,
    inventory: [null, null, null, null, null, null, null, null]
  },
  settings: { volume: 80 },
  gameTimeFormatted: '04:21',
  USERNAME: 'DEV_TESTER'
};

function resolveSamplePath(path: string): any {
  return String(path || '').trim().split('.').reduce((acc: any, k: string) => (acc == null ? undefined : acc[k]), SAMPLE_PREVIEW_STATE);
}

function interpolateSampleText(text: string): string {
  return String(text || '').replace(/\{([^}]+)\}/g, (_, p) => {
    const val = resolveSamplePath(p);
    return val === undefined || val === null ? '?' : String(val);
  });
}

const DEFAULT_RES = { w: 800, h: 450 };

function getDefaultElement(type: ElementData['type']): ElementData {
  const base: ElementData = {
    id: `${type}_${Date.now().toString(36).slice(-5)}`,
    type,
    rect: { x: 40, y: 40, w: type === 'slot' ? 44 : 180, h: type === 'bar' ? 20 : type === 'label' ? 26 : type === 'slot' ? 44 : 38 },
    anchor: 'top-left',
    style: {
      color: type === 'button' ? '#6ee7a8' : '#f1f5f9',
      backgroundColor: type === 'label' || type === 'image' ? 'transparent' : 'rgba(15, 22, 36, 0.78)',
      borderWidth: type === 'label' || type === 'image' ? 0 : 1,
      borderColor: type === 'button' ? '#6ee7a8' : type === 'slot' ? '#ffd573' : 'rgba(148, 163, 184, 0.36)',
      borderRadius: 2,
      fontSize: type === 'bar' || type === 'slot' ? 14 : 18,
      fontWeight: type === 'bar' || type === 'slot' ? '400' : '700',
      textAlign: type === 'button' ? 'center' : 'left',
      zIndex: type === 'panel' ? 10 : 12
    },
  };
  if (type === 'label') base.text = 'TEXT LABEL';
  if (type === 'button') base.text = 'BUTTON';
  if (type === 'bar') {
    base.text = 'HP {player.hp}/{player.maxHp}';
    base.rect.w = 220;
    base.style!.backgroundColor = '#0b0d14';
    base.props = { variable: 'player.hp', maxVariable: 'player.maxHp', fillColor: '#e23b4e', ticks: 10 };
  }
  if (type === 'image') base.src = '';
  if (type === 'slot') {
    base.text = '1';
    base.props = { variable: 'player.inventory.0' };
  }
  return base;
}

function getDefaultDoc(): UiDocument {
  if (UITemplates && typeof UITemplates.buildKitDocument === 'function') {
    return UITemplates.buildKitDocument('redglitch_ops');
  }
  return {
    resolution: { ...DEFAULT_RES },
    screens: { main_hud: { elements: [] } },
  };
}

const MiniWireframe: React.FC<{ screen: ScreenData; res: { w: number; h: number }; accent: string; voidBg?: string }> = ({ screen, res, accent, voidBg }) => {
  const rw = res.w || 800;
  const rh = res.h || 450;
  const items = (screen?.elements || []).filter((el) => {
    const b = UITemplates.resolveRect(el.rect, el.anchor || 'top-left', { w: rw, h: rh });
    return !(el.type === 'panel' && b.w >= rw * 0.9 && b.h >= rh * 0.9);
  });
  return (
    <div style={{
      width: '100%', height: '94px', background: voidBg || '#06080f',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px',
      position: 'relative', overflow: 'hidden'
    }}>
      {items.map((el) => {
        const b = UITemplates.resolveRect(el.rect, el.anchor || 'top-left', { w: rw, h: rh });
        const borderCol = el.style?.borderColor && el.style.borderColor !== 'transparent'
          ? el.style.borderColor
          : (el.type === 'bar' ? (el.props?.fillColor || accent) : accent);
        const bg = el.type === 'bar'
          ? (el.props?.fillColor || accent)
          : el.type === 'button'
            ? (el.style?.backgroundColor && el.style.backgroundColor !== 'transparent' ? el.style.backgroundColor : 'rgba(255,255,255,0.12)')
            : el.type === 'slot'
              ? (el.style?.backgroundColor && el.style.backgroundColor !== 'transparent' ? el.style.backgroundColor : 'rgba(255,211,106,0.18)')
              : el.type === 'label'
                ? 'rgba(148,163,184,0.22)'
                : (el.style?.backgroundColor && el.style.backgroundColor !== 'transparent' ? el.style.backgroundColor : 'rgba(255,255,255,0.06)');
        return (
          <div key={el.id} style={{
            position: 'absolute',
            left: `${(b.left / rw) * 100}%`,
            top: `${(b.top / rh) * 100}%`,
            width: `${Math.max(1.5, (b.w / rw) * 100)}%`,
            height: `${Math.max(2, (b.h / rh) * 100)}%`,
            background: bg,
            border: `1px solid ${borderCol}`,
            boxSizing: 'border-box',
            borderRadius: '1px'
          }} />
        );
      })}
    </div>
  );
};

const UIDesigner: React.FC = () => {
  const { isReady, emit, subscribe } = useStudio();
  const [doc, setDoc] = useState<UiDocument>(getDefaultDoc());
  const [currentScreen, setCurrentScreen] = useState('main_hud');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [showJson, setShowJson] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [snapSize, setSnapSize] = useState(4);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(false);
  const [zoom, setZoom] = useState<number>(1);
  const [autoFit, setAutoFit] = useState<boolean>(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tplTab, setTplTab] = useState<'kits' | 'screens'>('kits');
  const [tplThemeId, setTplThemeId] = useState<string>('redglitch_ops');
  const [tplCategory, setTplCategory] = useState<'ALL' | 'HUD' | 'MENU' | 'OVERLAY'>('ALL');

  const [dragOp, setDragOp] = useState<{
    kind: 'move' | 'resize';
    dir?: string;
    id: string;
    startX: number;
    startY: number;
    initBox: { left: number; top: number; w: number; h: number };
    anchor: string;
  } | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<ToastHandle>(null);
  const docRef = useRef<UiDocument>(doc);
  docRef.current = doc;
  const saveDocRef = useRef<() => void>(() => {});
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  const resW = Number(doc.resolution?.w ?? (doc.resolution as any)?.width) || DEFAULT_RES.w;
  const resH = Number(doc.resolution?.h ?? (doc.resolution as any)?.height) || DEFAULT_RES.h;

  const activeScreenObj = doc.screens[currentScreen];
  const elements = activeScreenObj?.elements || [];

  const moveElement = (dir: 1 | -1) => {
    if (!selectedId) return;
    const idx = elements.findIndex(e => e.id === selectedId);
    if (idx === -1 || idx + dir < 0 || idx + dir >= elements.length) return;
    const next = [...elements];
    const temp = next[idx];
    next[idx] = next[idx + dir];
    next[idx + dir] = temp;
    setElements(next);
  };

  useEffect(() => {
    fetch('/api/ui-config/actions')
      .then(r => r.ok ? r.json() : [])
      .then(actions => { if (Array.isArray(actions)) setAvailableActions(actions); })
      .catch(() => {});
  }, []);

  const recalcFitZoom = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const availW = Math.max(240, vp.clientWidth - 48);
    const availH = Math.max(180, vp.clientHeight - 48);
    const fit = Math.min(availW / resW, availH / resH, 1.15);
    setZoom(Math.max(0.25, Math.floor(fit * 20) / 20));
  }, [resW, resH]);

  useEffect(() => {
    if (!autoFit) return;
    recalcFitZoom();
    const vp = viewportRef.current;
    if (!vp || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => recalcFitZoom());
    obs.observe(vp);
    return () => obs.disconnect();
  }, [autoFit, recalcFitZoom]);

  const setElements = useCallback((newEls: ElementData[]) => {
    setDoc(prev => ({
      ...prev,
      screens: {
        ...prev.screens,
        [currentScreen]: {
          ...(prev.screens[currentScreen] || {}),
          elements: newEls,
        },
      },
    }));
    setIsDirty(true);
  }, [currentScreen]);

  useEffect(() => {
    if (isReady) loadDoc();
  }, [isReady]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveDocRef.current(); }
      if (e.key === 'Escape') setShowTemplates(false);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'SELECT') {
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
          const normRes = {
            w: Number(data.resolution?.w ?? data.resolution?.width) || DEFAULT_RES.w,
            h: Number(data.resolution?.h ?? data.resolution?.height) || DEFAULT_RES.h,
          };
          setDoc({
            ...data,
            resolution: normRes,
            screens: data.screens,
            fileName: data.fileName || 'main.redui',
          });
          setCurrentScreen(Object.keys(data.screens)[0]);
          setIsDirty(false);
          return;
        }
      }
    } catch (e) { /* fallback to default */ }
    setDoc(getDefaultDoc());
  };

  const saveDoc = async () => {
    let currentDoc = docRef.current;
    if (showJson) {
      try {
        const parsed = JSON.parse(jsonText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.screens && Object.keys(parsed.screens).length > 0) {
          const normRes = {
            w: Number(parsed.resolution?.w ?? parsed.resolution?.width) || currentDoc.resolution?.w || DEFAULT_RES.w,
            h: Number(parsed.resolution?.h ?? parsed.resolution?.height) || currentDoc.resolution?.h || DEFAULT_RES.h,
          };
          currentDoc = {
            ...currentDoc,
            ...parsed,
            resolution: normRes,
          };
          setDoc(currentDoc);
          setJsonError(false);
        } else {
          setJsonError(true);
          toastRef.current?.show('CANNOT SAVE: INVALID JSON FORMAT', 'error');
          return;
        }
      } catch {
        setJsonError(true);
        toastRef.current?.show('CANNOT SAVE: INVALID JSON', 'error');
        return;
      }
    }
    const fileName = currentDoc.fileName || 'main.redui';
    try {
      const res = await fetch(`/api/ui-config?file=${encodeURIComponent(fileName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentDoc, fileName }),
      });
      if (res.ok) {
        setIsDirty(false);
        toastRef.current?.show('HUD CONFIG SAVED', 'success');
        emit('ui:saved', { fileName });
      } else {
        const err = await res.json().catch(() => ({}));
        toastRef.current?.show(err.error || 'SAVE FAILED', 'error');
      }
    } catch (e) {
      toastRef.current?.show('SAVE FAILED', 'error');
    }
  };
  saveDocRef.current = saveDoc;

  useEffect(() => {
    const unsubGlobal = subscribe?.('system:global_save', () => saveDocRef.current());
    const unsubProject = subscribe?.('project:switched', () => {
      void loadDoc();
    });
    return () => {
      if (typeof unsubGlobal === 'function') unsubGlobal();
      if (typeof unsubProject === 'function') unsubProject();
    };
  }, [subscribe]);

  const addElement = (type: ElementData['type']) => {
    const el = getDefaultElement(type);
    el.rect.x = 40 + (elements.length * 16) % Math.max(80, resW - 260);
    el.rect.y = 40 + (elements.length * 16) % Math.max(80, resH - 120);
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
    const clone: ElementData = { ...JSON.parse(JSON.stringify(el)), id: `${el.type}_${Date.now().toString(36).slice(-5)}` };
    const box = UITemplates.resolveRect(el.rect, el.anchor || 'top-left', { w: resW, h: resH });
    clone.rect = UITemplates.screenToAnchorRect(box.left + 16, box.top + 16, box.w, box.h, el.anchor || 'top-left', { w: resW, h: resH });
    setElements([...elements, clone]);
    setSelectedId(clone.id);
  };

  const updateElement = (id: string, updates: Partial<ElementData>) => {
    setElements(elements.map(e => e.id === id ? { ...e, ...updates } as ElementData : e));
  };

  const selectedEl = elements.find(e => e.id === selectedId) || null;

  const updateStyle = (id: string, key: string, value: any) => {
    setElements(elements.map(e => e.id === id ? { ...e, style: { ...(e.style || {}), [key]: value } } : e));
  };

  const updateProp = (id: string, key: string, value: any) => {
    setElements(elements.map(e => e.id === id ? { ...e, props: { ...(e.props || {}), [key]: value } } : e));
  };

  const handleAnchorSwitch = (el: ElementData, nextAnchor: string) => {
    const oldAnchor = el.anchor || 'top-left';
    const nextRect = UITemplates.convertAnchorRect(el.rect, oldAnchor, nextAnchor, { w: resW, h: resH });
    updateElement(el.id, { anchor: nextAnchor, rect: nextRect });
  };

  const handleElementMouseDown = (e: React.MouseEvent, el: ElementData, kind: 'move' | 'resize' = 'move', dir?: string) => {
    if (mode !== 'design') return;
    e.stopPropagation();
    setSelectedId(el.id);
    const box = UITemplates.resolveRect(el.rect, el.anchor || 'top-left', { w: resW, h: resH });
    setDragOp({
      kind,
      dir,
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      initBox: { left: box.left, top: box.top, w: box.w, h: box.h },
      anchor: el.anchor || 'top-left',
    });
  };

  useEffect(() => {
    if (!dragOp) return;
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragOp.startX) / zoom;
      const dy = (e.clientY - dragOp.startY) / zoom;
      const step = Math.max(1, snapSize);
      const snap = (v: number) => Math.round(v / step) * step;

      let nextRect: Rect;
      if (dragOp.kind === 'move') {
        const nextLeft = snap(dragOp.initBox.left + dx);
        const nextTop = snap(dragOp.initBox.top + dy);
        nextRect = UITemplates.screenToAnchorRect(nextLeft, nextTop, dragOp.initBox.w, dragOp.initBox.h, dragOp.anchor, { w: resW, h: resH });
      } else {
        const d = dragOp.dir || 'br';
        let nl = dragOp.initBox.left;
        let nt = dragOp.initBox.top;
        let nw = dragOp.initBox.w;
        let nh = dragOp.initBox.h;
        if (d.includes('r')) nw = snap(dragOp.initBox.w + dx);
        if (d.includes('l')) { nw = snap(dragOp.initBox.w - dx); nl = dragOp.initBox.left + (dragOp.initBox.w - Math.max(12, nw)); }
        if (d.includes('b')) nh = snap(dragOp.initBox.h + dy);
        if (d.includes('t')) { nh = snap(dragOp.initBox.h - dy); nt = dragOp.initBox.top + (dragOp.initBox.h - Math.max(12, nh)); }
        nw = Math.max(12, nw);
        nh = Math.max(12, nh);
        nextRect = UITemplates.screenToAnchorRect(nl, nt, nw, nh, dragOp.anchor, { w: resW, h: resH });
      }

      setDoc(prev => {
        const screen = prev.screens[currentScreen];
        if (!screen) return prev;
        return {
          ...prev,
          screens: {
            ...prev.screens,
            [currentScreen]: {
              ...screen,
              elements: screen.elements.map(el => (el.id === dragOp.id ? { ...el, rect: nextRect } : el)),
            },
          },
        };
      });
      setIsDirty(true);
    };
    const handleUp = () => setDragOp(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragOp, currentScreen, zoom, snapSize, resW, resH]);

  const addScreen = (screenName?: string) => {
    let name = screenName;
    if (!name) {
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        name = window.prompt('Screen ID:', 'screen_' + Date.now().toString(36).slice(-4)) || undefined;
      }
      if (!name) name = 'screen_' + Date.now().toString(36).slice(-4);
    }
    const id = name.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id || doc.screens[id]) { toastRef.current?.show('INVALID OR DUPLICATE SCREEN ID', 'error'); return; }
    setDoc(prev => ({ ...prev, screens: { ...prev.screens, [id]: { elements: [] } } }));
    setCurrentScreen(id);
    setSelectedId(null);
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

  const changeResolution = (val: string) => {
    const [w, h] = val.split('x').map(Number);
    if (!w || !h) return;
    setDoc(prev => ({ ...prev, resolution: { w, h } }));
    setIsDirty(true);
    setAutoFit(true);
  };

  const applyFullKit = (kitId: string) => {
    const kit = UITemplates.INTERFACE_KITS.find((k: any) => k.id === kitId);
    if (!kit) return;
    const built = kit.build({ w: resW, h: resH });
    setDoc(prev => ({
      ...prev,
      format: 'redglitch-ui',
      formatVersion: 1,
      resolution: built.resolution,
      designSystem: built.designSystem,
      screens: built.screens,
    }));
    const nextScreen = built.screens[currentScreen] ? currentScreen : Object.keys(built.screens)[0];
    setCurrentScreen(nextScreen);
    setSelectedId(null);
    setIsDirty(true);
    setShowTemplates(false);
    toastRef.current?.show(`APPLIED KIT: ${kit.name}`, 'success');
  };

  const applyScreenPreset = (presetId: string, createNew: boolean) => {
    const preset = UITemplates.SCREEN_PRESETS.find((p: any) => p.id === presetId);
    if (!preset) return;
    const screenObj = preset.build(tplThemeId, { w: resW, h: resH });
    let targetId = currentScreen || preset.id;
    if (createNew) {
      targetId = preset.id;
      let idx = 2;
      while (doc.screens[targetId]) {
        targetId = `${preset.id}_${idx++}`;
      }
    }
    setDoc(prev => ({
      ...prev,
      screens: {
        ...prev.screens,
        [targetId]: screenObj,
      },
    }));
    setCurrentScreen(targetId);
    setSelectedId(null);
    setIsDirty(true);
    setShowTemplates(false);
    toastRef.current?.show(`${createNew ? 'ADDED' : 'APPLIED'}: ${preset.name}`, 'success');
  };

  const layoutAudit = useMemo(() => {
    if (!activeScreenObj || !UITemplates?.validateScreenLayout) return null;
    return UITemplates.validateScreenLayout(activeScreenObj, { w: resW, h: resH });
  }, [activeScreenObj, resW, resH]);

  const renderElementNode = (el: ElementData, interactive: boolean) => {
    const box = UITemplates.resolveRect(el.rect, el.anchor || 'top-left', { w: resW, h: resH });
    const isSelected = interactive && selectedId === el.id;
    const s = el.style || {};
    const bw = s.borderWidth !== undefined ? Number(s.borderWidth) : (el.type === 'panel' || el.type === 'button' || el.type === 'bar' || el.type === 'slot' ? 1 : 0);
    const bc = s.borderColor && s.borderColor !== 'transparent'
      ? s.borderColor
      : (el.type === 'button' ? '#ff3147' : el.type === 'slot' ? '#ffd36a' : 'rgba(255,255,255,0.16)');

    const imgUrl = el.src
      ? (el.src.startsWith('/') || el.src.startsWith('http://') || el.src.startsWith('https://') || el.src.startsWith('data:')
        ? el.src
        : '/' + el.src)
      : '';

    const displayText = mode === 'preview' ? interpolateSampleText(el.text || '') : (el.text || '');

    let fillPct = 68;
    if (mode === 'preview' && el.type === 'bar') {
      if (el.props?.variable && el.props?.maxVariable) {
        const cur = resolveSamplePath(el.props.variable);
        const max = resolveSamplePath(el.props.maxVariable);
        if (typeof cur === 'number' && typeof max === 'number' && max > 0) {
          fillPct = Math.max(0, Math.min(100, (cur / max) * 100));
        }
      } else if (el.props?.variable) {
        const cur = resolveSamplePath(el.props.variable);
        if (typeof cur === 'number') {
          const max = (cur <= 100 && cur >= 0) ? 100 : Math.max(100, cur);
          fillPct = Math.max(0, Math.min(100, (cur / max) * 100));
        }
      }
    }

    const handleClickPreview = () => {
      if (mode !== 'preview' || el.type !== 'button' || !el.script) return;
      if (el.script.startsWith('navigate:')) {
        const tgt = el.script.slice(9).trim();
        if (doc.screens[tgt]) setCurrentScreen(tgt);
      } else if ((el.script === 'RESUME_GAME' || el.script === 'CLOSE_MENU') && doc.screens.main_hud) {
        setCurrentScreen('main_hud');
      }
    };

    const RESIZE_DIRS = [
      { dir: 'tl', style: { top: -4, left: -4, cursor: 'nwse-resize' } },
      { dir: 'tc', style: { top: -4, left: '50%', marginLeft: -4, cursor: 'ns-resize' } },
      { dir: 'tr', style: { top: -4, right: -4, cursor: 'nesw-resize' } },
      { dir: 'ml', style: { top: '50%', marginTop: -4, left: -4, cursor: 'ew-resize' } },
      { dir: 'mr', style: { top: '50%', marginTop: -4, right: -4, cursor: 'ew-resize' } },
      { dir: 'bl', style: { bottom: -4, left: -4, cursor: 'nesw-resize' } },
      { dir: 'bc', style: { bottom: -4, left: '50%', marginLeft: -4, cursor: 'ns-resize' } },
      { dir: 'br', style: { bottom: -4, right: -4, cursor: 'nwse-resize' } },
    ];

    return (
      <div
        key={`${interactive ? 'active' : 'underlay'}_${el.id}`}
        onMouseDown={interactive ? (e) => handleElementMouseDown(e, el, 'move') : undefined}
        onClick={!interactive ? undefined : handleClickPreview}
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          width: box.w,
          height: box.h,
          cursor: interactive ? (mode === 'design' ? 'move' : el.type === 'button' ? 'pointer' : 'default') : 'default',
          pointerEvents: interactive ? 'auto' : 'none',
          border: bw > 0 ? `${bw}px solid ${bc}` : 'none',
          background: s.backgroundColor || (el.type === 'panel' ? 'rgba(13,18,30,0.88)' : el.type === 'slot' ? 'rgba(10,14,24,0.85)' : 'transparent'),
          borderRadius: (s.borderRadius || 0) + 'px',
          color: s.color || '#ffffff',
          fontSize: (s.fontSize || 14) + 'px',
          fontFamily: "'VT323', monospace",
          display: 'flex',
          alignItems: 'center',
          justifyContent: el.type === 'button'
            ? (s.textAlign === 'left' ? 'flex-start' : s.textAlign === 'right' ? 'flex-end' : 'center')
            : (el.type === 'slot' || s.textAlign === 'center' ? 'center' : s.textAlign === 'right' ? 'flex-end' : 'flex-start'),
          padding: el.type === 'image' ? '0' : '0 2px',
          boxSizing: 'border-box',
          overflow: 'visible',
          opacity: s.opacity !== undefined ? Number(s.opacity) : 1,
          boxShadow: isSelected
            ? '0 0 0 2px #49e3ff, 0 0 14px rgba(73,227,255,0.4)'
            : (s.boxShadow || 'none'),
          textShadow: s.textShadow || 'none',
          zIndex: s.zIndex ?? (interactive ? 10 : 1),
          textTransform: (s.textTransform as any) || (el.type === 'button' ? 'uppercase' : 'none'),
          letterSpacing: s.letterSpacing !== undefined ? (typeof s.letterSpacing === 'number' ? `${s.letterSpacing}px` : s.letterSpacing) : 'normal',
          fontWeight: s.fontWeight || (el.type === 'bar' || el.type === 'slot' ? '400' : 'normal'),
          whiteSpace: el.type === 'label' && String(el.text || '').includes('\n') ? 'pre-wrap' : (el.type === 'label' || el.type === 'button' ? 'pre' : 'pre-wrap'),
          lineHeight: 1.2,
          userSelect: 'none',
        }}
      >
        {el.type === 'bar' && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: Math.max(0, (s.borderRadius || 0) - 1) + 'px' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, height: '100%',
              width: `${fillPct}%`, background: el.props?.fillColor || '#e23b4e',
              boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.25)',
              transition: 'width 0.2s',
            }} />
            {Number(el.props?.ticks) > 0 && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / Number(el.props!.ticks)}% - 2px), rgba(0,0,0,0.45) calc(${100 / Number(el.props!.ticks)}% - 2px), rgba(0,0,0,0.45) ${100 / Number(el.props!.ticks)}%)`
              }} />
            )}
          </div>
        )}
        {el.type === 'image' && (
          imgUrl ? (
            <img
              src={imgUrl}
              alt={el.id}
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', imageRendering: 'pixelated' }}
            />
          ) : (
            <span style={{ fontSize: '11px', opacity: 0.5 }}>{el.id}</span>
          )
        )}
        {el.type === 'slot' ? (
          <span style={{ position: 'absolute', top: 2, left: 4, fontSize: Math.max(10, Number(s.fontSize || 12)), lineHeight: 1 }}>
            {displayText}
          </span>
        ) : (el.type === 'label' || el.type === 'button') ? (
          <span style={{ width: '100%', textAlign: s.textAlign || (el.type === 'button' ? 'center' : 'left') }}>{displayText}</span>
        ) : el.type === 'bar' ? (
          <span style={{ position: 'relative', zIndex: 2, width: '100%', textAlign: 'center' }}>{displayText}</span>
        ) : null}

        {isSelected && mode === 'design' && RESIZE_DIRS.map(h => (
          <div
            key={h.dir}
            onMouseDown={(e) => handleElementMouseDown(e, el, 'resize', h.dir)}
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              background: '#49e3ff',
              border: '1px solid #05070d',
              borderRadius: '1px',
              zIndex: 1002,
              ...h.style
            }}
          />
        ))}
      </div>
    );
  };

  if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px', fontFamily: "'VT323', monospace", fontSize: '20px' }}>LOADING UI DESIGNER...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#070910', color: '#eef2ff', fontFamily: "'VT323', monospace", fontSize: '16px', letterSpacing: '0.2px' }}>
      <Toast ref={toastRef} />

      {/* Menu Bar */}
      <div id="menubar" style={{ height: '38px', background: '#0a0d16', borderBottom: '1px solid rgba(255,77,99,0.22)', display: 'flex', alignItems: 'center', padding: '0 14px', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ color: '#ff4d63', fontWeight: 700, letterSpacing: '1.5px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' }}>
          <Monitor size={16} /> INTERFACE STUDIO
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '15px' }}>
          <span style={{ color: isDirty ? '#fbbf24' : '#34d399' }}>{isDirty ? '● UNSAVED' : '● SYNCED'}</span>
          <span style={{ color: '#94a3b8' }}>{resW}×{resH}</span>
          <span style={{ color: '#cbd5e1', fontFamily: "'VT323', monospace" }}>{currentScreen}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div id="toolbar" style={{ minHeight: '42px', background: '#0b0e18', borderBottom: '1px solid rgba(255,77,99,0.2)', display: 'flex', alignItems: 'center', padding: '4px 10px', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
        <button className="tool-btn" onClick={saveDoc} title="Save (Ctrl+S)"><Save size={15} /></button>
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
        {ELEMENT_TYPES.map(et => (
          <button key={et.type} className="tool-btn" onClick={() => addElement(et.type)} title={`Add ${et.label}`} style={{ width: 'auto', padding: '0 9px' }}>
            {et.type === 'panel' ? <Square size={13} /> : et.type === 'label' ? <Edit3 size={13} /> : et.type === 'button' ? <Check size={13} /> : et.type === 'bar' ? <List size={13} /> : et.type === 'image' ? <ImageIcon size={13} /> : <Layout size={13} />}
            <span style={{ fontSize: '15px', marginLeft: '5px' }}>{et.label}</span>
          </button>
        ))}
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
        <button className="tool-btn" onClick={duplicateElement} disabled={!selectedId} title="Duplicate"><Copy size={14} /></button>
        <button className="tool-btn" style={{ color: '#f87171' }} onClick={() => selectedId && deleteElement(selectedId)} disabled={!selectedId} title="Delete"><Trash2 size={14} /></button>
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
        <button
          className="tool-btn"
          onClick={() => setShowTemplates(true)}
          title="Interface Templates & UI Kits"
          style={{ width: 'auto', padding: '0 10px', background: 'rgba(34,211,238,0.14)', borderColor: 'rgba(34,211,238,0.45)', color: '#67e8f9', fontSize: '15px', gap: '5px' }}
        >
          <Layers size={14} /> TEMPLATES ({UITemplates.INTERFACE_KITS.length})
        </button>
        <button className={`tool-btn ${mode === 'preview' ? 'active' : ''}`} onClick={() => setMode(mode === 'preview' ? 'design' : 'preview')} title="Toggle Preview" style={{ width: 'auto', padding: '0 9px' }}>
          <Eye size={14} /> <span style={{ fontSize: '15px', marginLeft: '5px' }}>{mode === 'preview' ? 'DESIGN' : 'PREVIEW'}</span>
        </button>
        <button className={`tool-btn ${showGrid ? 'active' : ''}`} onClick={() => setShowGrid(v => !v)} title="Toggle Grid"><GridIcon size={14} /></button>
        <button
          className={`tool-btn ${showJson ? 'active' : ''}`}
          onClick={() => {
            const nextOpen = !showJson;
            if (nextOpen) {
              setJsonText(JSON.stringify(doc, null, 2));
              setJsonError(false);
            }
            setShowJson(nextOpen);
          }}
          title="JSON View"
        >
          <Code size={14} />
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button className="tool-btn" onClick={() => { setAutoFit(false); setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2))); }} title="Zoom Out"><ZoomOut size={13} /></button>
          <span style={{ fontSize: '15px', color: '#cbd5e1', minWidth: '38px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button className="tool-btn" onClick={() => { setAutoFit(false); setZoom(z => Math.min(2, +(z + 0.1).toFixed(2))); }} title="Zoom In"><ZoomIn size={13} /></button>
          <button className="tool-btn" onClick={() => { setAutoFit(true); recalcFitZoom(); }} title="Fit Artboard" style={{ width: 'auto', padding: '0 8px', fontSize: '14px' }}><Maximize2 size={12} /></button>
          <select value={`${resW}x${resH}`} onChange={e => changeResolution(e.target.value)} style={selectCompactStyle}>
            <option value="800x450">800×450</option>
            <option value="1280x720">1280×720</option>
            <option value="1920x1080">1920×1080</option>
          </select>
          <select
            value={currentScreen}
            onChange={e => { setCurrentScreen(e.target.value); setSelectedId(null); }}
            style={{ ...selectCompactStyle, minWidth: '120px' }}
          >
            {Object.keys(doc.screens).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="tool-btn" onClick={() => addScreen()} title="Add Screen"><Plus size={14} /></button>
          <button className="tool-btn" style={{ color: '#f87171' }} onClick={deleteScreen} title="Delete Screen"><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Element List */}
        <div style={{ width: '212px', background: '#0b0e17', borderRight: '1px solid rgba(255,77,99,0.2)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ borderBottom: '1px solid rgba(255,77,99,0.2)', padding: '8px 12px', fontSize: '15px', color: '#94a3b8', letterSpacing: '0.8px', display: 'flex', alignItems: 'center' }}>
            <Columns size={13} style={{ marginRight: '6px', color: '#ff4d63' }} /> ELEMENTS ({elements.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {elements.map(el => (
              <div
                key={el.id}
                onClick={() => setSelectedId(el.id)}
                style={{
                  padding: '5px 12px', cursor: 'pointer', fontSize: '16px',
                  borderLeft: selectedId === el.id ? '3px solid #49e3ff' : '3px solid transparent',
                  background: selectedId === el.id ? 'rgba(73,227,255,0.1)' : 'transparent',
                  color: selectedId === el.id ? '#fff' : '#94a3b8',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <span style={{ fontSize: '14px', opacity: 0.75, fontFamily: "'VT323', monospace", color: '#ff4d63' }}>{el.type[0].toUpperCase()}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.id}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas Viewport */}
        <div
          ref={viewportRef}
          onClick={() => setSelectedId(null)}
          style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#0b0d14',
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            overflow: 'auto', position: 'relative', padding: '24px'
          }}
        >
          <div
            style={{
              width: Math.round(resW * zoom),
              height: Math.round(resH * zoom),
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <div
              ref={canvasRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: resW,
                height: resH,
                background: typeof activeScreenObj?.background === 'string'
                  ? activeScreenObj.background
                  : (mode === 'preview'
                    ? 'radial-gradient(circle at 50% 35%, #162033 0%, #070a12 75%)'
                    : '#070a12'),
                border: '1px solid rgba(255,255,255,0.22)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.75)',
                overflow: 'hidden',
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              {/* Grid */}
              {mode === 'design' && showGrid && Array.from({ length: 16 }).map((_, i) => (
                <div key={`v${i}`} style={{ position: 'absolute', left: `${(i / 16) * 100}%`, top: 0, width: '1px', height: '100%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
              ))}
              {mode === 'design' && showGrid && Array.from({ length: 9 }).map((_, i) => (
                <div key={`h${i}`} style={{ position: 'absolute', left: 0, top: `${(i / 9) * 100}%`, width: '100%', height: '1px', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
              ))}

              {/* Underlay HUD in preview mode when overlay flag is enabled */}
              {mode === 'preview' && activeScreenObj?.background === true && currentScreen !== 'main_hud' && doc.screens.main_hud && (
                (doc.screens.main_hud.elements || []).map(el => renderElementNode(el, false))
              )}

              {/* Active Screen Elements */}
              {elements.map(el => renderElementNode(el, true))}
            </div>
          </div>
        </div>

        {/* Property Inspector + JSON */}
        <div style={{ width: '286px', background: '#0b0d14', borderLeft: '1px solid rgba(255,49,71,0.2)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {showJson ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '9px 12px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>RAW JSON</span>
                <button
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(jsonText);
                      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.screens || Object.keys(parsed.screens).length === 0) {
                        setJsonError(true);
                        return;
                      }
                      setDoc(prev => ({
                        ...prev,
                        ...parsed,
                        resolution: parsed.resolution || prev.resolution || { ...DEFAULT_RES },
                      }));
                      if (!parsed.screens[currentScreen]) {
                        setCurrentScreen(Object.keys(parsed.screens)[0]);
                        setSelectedId(null);
                      }
                      setJsonError(false);
                      setIsDirty(true);
                      toastRef.current?.show('JSON APPLIED', 'success');
                    } catch {
                      setJsonError(true);
                    }
                  }}
                  style={{ background: '#1e293b', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '4px', fontSize: '11px', padding: '3px 8px', cursor: 'pointer' }}
                >
                  APPLY
                </button>
              </div>
              <textarea
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                style={{
                  flex: 1, background: '#07090f', color: '#e2e8f0', border: 'none', padding: '12px',
                  fontFamily: "'VT323', monospace", fontSize: '15px', resize: 'none', outline: 'none',
                  borderBottom: jsonError ? '2px solid #e74c3c' : 'none',
                }}
              />
              {jsonError && <div style={{ padding: '6px 12px', color: '#f87171', fontSize: '14px' }}>INVALID JSON</div>}
            </div>
          ) : selectedEl ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ borderBottom: '1px solid rgba(255,77,99,0.2)', padding: '8px 12px', fontSize: '15px', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>PROPERTIES — {selectedEl.type.toUpperCase()}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="tool-btn small" onClick={() => moveElement(-1)} title="Move Backward (Down in z-order)" style={{ padding: '2px 5px' }}><ArrowDown size={12} /></button>
                    <button className="tool-btn small" onClick={() => moveElement(1)} title="Move Forward (Up in z-order)" style={{ padding: '2px 5px' }}><ArrowUp size={12} /></button>
                  </div>
                </div>
                <span style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: '#64748b' }}>{selectedEl.id}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Element ID</label>
                  <input value={selectedEl.id} onChange={e => updateElement(selectedId!, { id: e.target.value })} style={inputStyle} />
                </div>

                {/* Anchor 3x3 Visual Grid */}
                <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: '2px' }}>Anchor</label>
                    <div style={{ fontSize: '14px', color: '#67e8f9', fontFamily: "'VT323', monospace" }}>{selectedEl.anchor || 'top-left'}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 18px)', gap: '2px', background: '#07090e', padding: '3px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px' }}>
                    {ANCHORS.map(a => {
                      const active = (selectedEl.anchor || 'top-left') === a;
                      return (
                        <button
                          key={a}
                          type="button"
                          title={a}
                          onClick={() => handleAnchorSwitch(selectedEl, a)}
                          style={{
                            width: 18, height: 18, borderRadius: '2px', cursor: 'pointer', padding: 0,
                            border: `1px solid ${active ? '#49e3ff' : 'rgba(255,255,255,0.1)'}`,
                            background: active ? 'rgba(73,227,255,0.25)' : '#141826',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#49e3ff' : '#475569' }} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={labelStyle}>Position &amp; Size (Snap: {snapSize}px)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {(['x', 'y', 'w', 'h'] as const).map(f => (
                      <div key={f}>
                        <span style={{ fontSize: '13px', color: '#64748b' }}>{f.toUpperCase()}</span>
                        <input
                          type="number"
                          value={selectedEl.rect[f]}
                          onChange={e => updateElement(selectedId!, { rect: { ...selectedEl.rect, [f]: parseInt(e.target.value) || 0 } })}
                          style={{ ...inputStyle, padding: '4px 6px' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {(selectedEl.type === 'label' || selectedEl.type === 'button' || selectedEl.type === 'bar' || selectedEl.type === 'slot') && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Text</label>
                    <input value={selectedEl.text || ''} onChange={e => updateElement(selectedId!, { text: e.target.value })} style={inputStyle} />
                  </div>
                )}

                {selectedEl.type === 'button' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Action / Script</label>
                    <input
                      list="ui-actions"
                      value={selectedEl.script || ''}
                      onChange={e => updateElement(selectedId!, { script: e.target.value })}
                      placeholder="e.g. navigate:inventory or RESUME_GAME"
                      style={inputStyle}
                    />
                    <datalist id="ui-actions">
                      {availableActions.map(act => <option key={act} value={act} />)}
                    </datalist>
                  </div>
                )}

                {selectedEl.type === 'image' && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>Image Source</label>
                    <input value={selectedEl.src || ''} onChange={e => updateElement(selectedId!, { src: e.target.value })} style={inputStyle} />
                  </div>
                )}

                {selectedEl.type === 'bar' && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px', marginBottom: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Variable</span>
                      <input value={selectedEl.props?.variable || ''} onChange={e => updateProp(selectedId!, 'variable', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Max Variable</span>
                      <input value={selectedEl.props?.maxVariable || ''} onChange={e => updateProp(selectedId!, 'maxVariable', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Fill Color</span>
                      <input value={selectedEl.props?.fillColor || '#e23b4e'} onChange={e => updateProp(selectedId!, 'fillColor', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Segments</span>
                      <input type="number" value={selectedEl.props?.ticks || 0} onChange={e => updateProp(selectedId!, 'ticks', Math.max(0, parseInt(e.target.value) || 0))} style={inputStyle} />
                    </div>
                  </div>
                )}

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px', marginBottom: '12px' }}>
                  <label style={{ ...labelStyle, color: '#cbd5e1' }}>Style</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Color</span>
                      <input value={selectedEl.style?.color || '#ffffff'} onChange={e => updateStyle(selectedId!, 'color', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Font Size</span>
                      <input type="number" value={selectedEl.style?.fontSize || 16} onChange={e => updateStyle(selectedId!, 'fontSize', parseInt(e.target.value) || 16)} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>BG Color</span>
                      <input value={selectedEl.style?.backgroundColor || ''} onChange={e => updateStyle(selectedId!, 'backgroundColor', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Border W</span>
                      <input type="number" value={selectedEl.style?.borderWidth ?? 0} onChange={e => updateStyle(selectedId!, 'borderWidth', Math.max(0, parseInt(e.target.value) || 0))} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Border Color</span>
                      <input value={selectedEl.style?.borderColor || ''} onChange={e => updateStyle(selectedId!, 'borderColor', e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Radius</span>
                      <input type="number" value={selectedEl.style?.borderRadius || 0} onChange={e => updateStyle(selectedId!, 'borderRadius', Math.max(0, parseInt(e.target.value) || 0))} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Opacity</span>
                      <input type="number" step="0.1" min="0" max="1" value={selectedEl.style?.opacity ?? 1} onChange={e => updateStyle(selectedId!, 'opacity', parseFloat(e.target.value) || 1)} style={inputStyle} />
                    </div>
                    <div>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Z-Index</span>
                      <input type="number" value={selectedEl.style?.zIndex || 0} onChange={e => updateStyle(selectedId!, 'zIndex', parseInt(e.target.value) || 0)} style={inputStyle} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>Font Weight</span>
                      <select
                        value={String(selectedEl.style?.fontWeight || '400')}
                        onChange={e => updateStyle(selectedId!, 'fontWeight', e.target.value)}
                        style={inputStyle}
                      >
                        <option value="400">Regular (400)</option>
                        <option value="700">Bold (700)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px', gap: '14px', overflowY: 'auto' }}>
              <div style={{ fontSize: '15px', color: '#94a3b8', letterSpacing: '0.8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}>
                SCREEN — {currentScreen.toUpperCase()}
              </div>
              <div>
                <label style={labelStyle}>Overlay Mode</label>
                <select
                  value={activeScreenObj?.background === true ? 'true' : 'false'}
                  onChange={e => {
                    const isOverlay = e.target.value === 'true';
                    setDoc(prev => ({
                      ...prev,
                      screens: {
                        ...prev.screens,
                        [currentScreen]: { ...prev.screens[currentScreen], background: isOverlay },
                      },
                    }));
                    setIsDirty(true);
                  }}
                  style={inputStyle}
                >
                  <option value="false">Standalone Screen</option>
                  <option value="true">Overlay (Keep HUD Visible)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Grid Snap</label>
                <select value={snapSize} onChange={e => setSnapSize(Number(e.target.value))} style={inputStyle}>
                  <option value={1}>1px (Free)</option>
                  <option value={4}>4px Grid</option>
                  <option value={8}>8px Grid</option>
                  <option value={10}>10px Grid</option>
                </select>
              </div>
              {layoutAudit && (
                <div style={{
                  padding: '10px',
                  borderRadius: '5px',
                  fontSize: '15px',
                  lineHeight: 1.3,
                  border: `1px solid ${layoutAudit.ok ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.45)'}`,
                  background: layoutAudit.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.1)',
                  color: layoutAudit.ok ? '#86efac' : '#fda4af',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: layoutAudit.ok ? 0 : '4px' }}>
                    {layoutAudit.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    {layoutAudit.ok ? `Layout temiz (${elements.length} öğe)` : `${layoutAudit.overlaps.length} çakışma, ${layoutAudit.outOfBounds.length} taşma`}
                  </div>
                  {!layoutAudit.ok && (
                    <div>
                      {layoutAudit.overlaps.slice(0, 3).map((o: any, idx: number) => (
                        <div key={idx}>• {o.a} × {o.b}</div>
                      ))}
                      {layoutAudit.outOfBounds.slice(0, 3).map((b: any, idx: number) => (
                        <div key={`oob_${idx}`}>• Taşan: {b.id}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>ELEMENTS ({elements.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                  {elements.map((el, i) => (
                    <div
                      key={el.id}
                      onClick={() => setSelectedId(el.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px',
                        cursor: 'pointer', fontSize: '12px', border: '1px solid rgba(255,255,255,0.06)'
                      }}
                    >
                      <span style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.id} ({el.type})</span>
                      <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
                        <button className="tool-btn small" disabled={i === 0} onClick={() => { const next = [...elements]; const t = next[i]; next[i] = next[i-1]; next[i-1] = t; setElements(next); }} title="Move Down" style={{ padding: '1px 4px' }}><ArrowDown size={10} /></button>
                        <button className="tool-btn small" disabled={i === elements.length - 1} onClick={() => { const next = [...elements]; const t = next[i]; next[i] = next[i+1]; next[i+1] = t; setElements(next); }} title="Move Up" style={{ padding: '1px 4px' }}><ArrowUp size={10} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => { setTplTab('screens'); setShowTemplates(true); }}
                style={{
                  marginTop: 'auto', padding: '9px 12px', borderRadius: '5px', cursor: 'pointer',
                  background: 'rgba(34,211,238,0.14)', border: '1px solid rgba(34,211,238,0.45)',
                  color: '#67e8f9', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Layers size={15} /> APPLY SCREEN TEMPLATE
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Templates & UI Kits Modal */}
      {showTemplates && (
        <div
          onClick={() => setShowTemplates(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(4,6,12,0.86)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 'min(860px, 94vw)', maxHeight: 'min(680px, 90vh)', background: '#0b0e17', border: '1px solid rgba(73,227,255,0.38)', borderRadius: '8px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 72px rgba(0,0,0,0.8)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#080b12', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '19px', letterSpacing: '0.8px', whiteSpace: 'nowrap' }}>
                <Layers size={16} color="#22d3ee" /> INTERFACE TEMPLATES &amp; RETRO PRESETS
              </div>
              <button onClick={() => setShowTemplates(false)} style={{ width: 'auto', padding: '4px', flexShrink: 0, background: 'transparent', border: 'none', boxShadow: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#0a0e18', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setTplTab('kits')}
                  style={{
                    width: 'auto', whiteSpace: 'nowrap', flexShrink: 0,
                    padding: '5px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px',
                    border: `1px solid ${tplTab === 'kits' ? '#22d3ee' : 'rgba(255,255,255,0.14)'}`,
                    background: tplTab === 'kits' ? 'rgba(34,211,238,0.16)' : '#111524',
                    color: tplTab === 'kits' ? '#67e8f9' : '#94a3b8'
                  }}
                >
                  Full UI Kits ({UITemplates.INTERFACE_KITS.length})
                </button>
                <button
                  onClick={() => setTplTab('screens')}
                  style={{
                    width: 'auto', whiteSpace: 'nowrap', flexShrink: 0,
                    padding: '5px 14px', borderRadius: '4px', cursor: 'pointer', fontSize: '16px',
                    border: `1px solid ${tplTab === 'screens' ? '#22d3ee' : 'rgba(255,255,255,0.14)'}`,
                    background: tplTab === 'screens' ? 'rgba(34,211,238,0.16)' : '#111524',
                    color: tplTab === 'screens' ? '#67e8f9' : '#94a3b8'
                  }}
                >
                  Screen Presets ({UITemplates.SCREEN_PRESETS.length})
                </button>
              </div>
              {tplTab === 'screens' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['ALL', 'HUD', 'MENU', 'OVERLAY'] as const).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setTplCategory(cat)}
                        style={{
                          width: 'auto', padding: '3px 9px', borderRadius: '3px', cursor: 'pointer', fontSize: '14px',
                          border: `1px solid ${tplCategory === cat ? '#ffd573' : 'rgba(255,255,255,0.12)'}`,
                          background: tplCategory === cat ? 'rgba(255,213,115,0.14)' : 'transparent',
                          color: tplCategory === cat ? '#ffd573' : '#94a3b8'
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '14px', color: '#64748b' }}>THEME:</span>
                  <select value={tplThemeId} onChange={e => setTplThemeId(e.target.value)} style={{ ...selectCompactStyle, minWidth: '170px' }}>
                    {UITemplates.INTERFACE_KITS.map((k: any) => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
              {tplTab === 'kits' ? UITemplates.INTERFACE_KITS.map((kit: any) => {
                const sample = kit.build({ w: resW, h: resH });
                const pal = kit.palette || {};
                const swatches = [pal.void, pal.panel, kit.accent, pal.gold, pal.green].filter(Boolean);
                return (
                  <div key={kit.id} style={{ background: '#101524', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '18px', color: '#f8fafc' }}>{kit.name}</span>
                      <span style={{ fontSize: '13px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', color: kit.accent || '#94a3b8' }}>{kit.badge}</span>
                    </div>
                    <MiniWireframe screen={sample.screens.main_hud} res={{ w: resW, h: resH }} accent={kit.accent} voidBg={pal.void} />
                    <div style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.25, minHeight: '32px' }}>{kit.description}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {swatches.map((col, idx) => (
                        <span key={idx} style={{ width: '14px', height: '14px', borderRadius: '2px', background: col, border: '1px solid rgba(255,255,255,0.22)' }} />
                      ))}
                      <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#64748b' }}>{Object.keys(sample.screens).length} screens</span>
                    </div>
                    <button
                      onClick={() => applyFullKit(kit.id)}
                      style={{ marginTop: 'auto', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', background: 'rgba(255,77,99,0.16)', border: '1px solid rgba(255,77,99,0.50)', color: '#fecdd3', fontSize: '15px' }}
                    >
                      Apply Full UI Kit
                    </button>
                  </div>
                );
              }) : UITemplates.SCREEN_PRESETS.filter((p: any) => tplCategory === 'ALL' || p.category === tplCategory).map((preset: any) => {
                const theme = UITemplates.THEMES[tplThemeId] || UITemplates.THEMES.redglitch_ops;
                const sampleScreen = preset.build(tplThemeId, { w: resW, h: resH });
                return (
                  <div key={preset.id} style={{ background: '#101524', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '18px', color: '#f8fafc' }}>{preset.name}</span>
                      <span style={{ fontSize: '13px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', color: theme.accent || '#94a3b8' }}>{preset.category}</span>
                    </div>
                    <MiniWireframe screen={sampleScreen} res={{ w: resW, h: resH }} accent={theme.accent} voidBg={theme.palette?.void} />
                    <div style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.25, minHeight: '32px' }}>{preset.description}</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}>
                      <button
                        onClick={() => applyScreenPreset(preset.id, false)}
                        style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', background: 'rgba(255,77,99,0.16)', border: '1px solid rgba(255,77,99,0.50)', color: '#fecdd3', fontSize: '15px' }}
                      >
                        Apply Current
                      </button>
                      <button
                        onClick={() => applyScreenPreset(preset.id, true)}
                        style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', background: '#161b2d', border: '1px solid rgba(255,255,255,0.15)', color: '#e2e8f0', fontSize: '15px' }}
                      >
                        Add Screen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '14px', color: '#94a3b8', marginBottom: '3px',
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#10131d', color: '#eef2ff', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '4px', padding: '4px 8px', fontSize: '16px', outline: 'none',
  fontFamily: "'VT323', monospace", boxSizing: 'border-box',
};
const selectCompactStyle: React.CSSProperties = {
  height: '28px', fontSize: '15px', background: '#10131d', color: '#e2e8f0',
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: '4px', padding: '0 8px',
  fontFamily: "'VT323', monospace",
};

export default UIDesigner;
