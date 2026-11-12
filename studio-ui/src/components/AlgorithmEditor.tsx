import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '../hooks/useStudio';
import {
    Copy,
    Cpu,
    FilePlus,
    FolderOpen,
    Grid3x3,
    Layers,
    Plus,
    Redo2,
    Save,
    Search,
    Settings2,
    Trash2,
    Undo2,
    Variable,
    ZoomIn,
    ZoomOut
} from 'lucide-react';
import { NODE_LIBRARY, CATEGORY_COLORS, PORT_COLORS, getCategories, NodeDef, PortType } from '../data/algorithmNodes';

// ─── Data model (matches data/logic/*.json + server/routes/logic.js) ──────────

interface LogicNode {
    id: string;
    type: string;
    x: number;
    y: number;
    data: Record<string, any>;
}

interface LogicWire {
    id: string;
    fromNode: string;
    fromPort: string;
    toNode: string;
    toPort: string;
}

interface LogicVar {
    name: string;
    type: string;
    value: any;
}

interface LogicGraph {
    nodes: LogicNode[];
    wires: LogicWire[];
    vars: LogicVar[];
}

const THEME = {
    accent: '#ff0000',
    accentSoft: 'rgba(255, 0, 0, 0.08)',
    bgRoot: '#050608',
    bgDeep: '#080a0f',
    bgPanel: '#12151c',
    bgPanelAlt: '#0d0f14',
    bgHover: '#1a1d26',
    border: '#2a2f3a',
    borderMute: '#1a1d26',
    textMain: '#f0f2f5',
    textDim: '#8a8f9d',
    textMute: '#4f5565',
    danger: '#ff4d4d',
    ok: '#00cc66',
    retroIn: 'inset 2px 2px 0 rgba(0,0,0,0.5)',
    retroOut: '2px 2px 0 rgba(0,0,0,0.5)'
};

const NODE_WIDTH = 200;
const HEADER_H = 26;
const PORT_ROW_H = 22;
const PORT_PAD_TOP = 8;

function uid(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nodeBodyHeight(def: NodeDef | undefined): number {
    if (!def) return HEADER_H + PORT_PAD_TOP * 2 + PORT_ROW_H;
    const rows = Math.max((def.inputs?.length ?? 0) + (def.outputs?.length ?? 0), 1);
    return HEADER_H + PORT_PAD_TOP * 2 + rows * PORT_ROW_H;
}

function portPosition(node: LogicNode, def: NodeDef | undefined, side: 'in' | 'out', index: number): { x: number; y: number } {
    const rowIndex = side === 'out' ? (def?.inputs?.length ?? 0) + index : index;
    const y = node.y + HEADER_H + PORT_PAD_TOP + rowIndex * PORT_ROW_H + PORT_ROW_H / 2;
    return { x: side === 'in' ? node.x : node.x + NODE_WIDTH, y };
}

function inferInputType(current: any, field: { type?: string }, defaultVal?: any): 'checkbox' | 'number' | 'color' | 'dropdown' | 'text' {
    if (field.type === 'dropdown') return 'dropdown';
    if (field.type === 'color') return 'color';
    if (field.type === 'number') return 'number';
    if (typeof defaultVal === 'boolean' || typeof current === 'boolean') return 'checkbox';
    if (typeof defaultVal === 'number' || typeof current === 'number') return 'number';
    return 'text';
}

function emptyGraph(): LogicGraph {
    return { nodes: [], wires: [], vars: [] };
}

function demoGraph(): LogicGraph {
    const a: LogicNode = { id: uid('n'), type: 'evt_start', x: 80, y: 120, data: {} };
    const b: LogicNode = { id: uid('n'), type: 'eng_log', x: 380, y: 120, data: { msg: 'Hello, world!' } };
    return {
        nodes: [a, b],
        wires: [{ id: uid('w'), fromNode: a.id, fromPort: 'out', toNode: b.id, toPort: 'in' }],
        vars: []
    };
}

type PortRole = 'in' | 'out';

interface PortRef {
    nodeId: string;
    portId: string;
    portType: PortType;
    role: PortRole;
}

interface DragState {
    ids: string[];
    startClientX: number;
    startClientY: number;
    startPositions: Map<string, { x: number; y: number }>;
    moved: boolean;
}

interface WireDragState {
    from: PortRef;
    x: number;
    y: number;
}

interface MarqueeState {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    additive: boolean;
}

const AlgorithmEditor: React.FC = () => {
    const { isReady, eventBus } = useStudio();

    const [graph, setGraph] = useState<LogicGraph>(demoGraph);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [pan, setPan] = useState({ x: 80, y: 60 });
    const [zoom, setZoom] = useState(1);
    const [spaceHeld, setSpaceHeld] = useState(false);
    const [panning, setPanning] = useState<{ startClientX: number; startClientY: number; startPan: { x: number; y: number } } | null>(null);

    const [dragState, setDragState] = useState<DragState | null>(null);
    const [wireDrag, setWireDrag] = useState<WireDragState | null>(null);
    const [marquee, setMarquee] = useState<MarqueeState | null>(null);
    const [snapGrid, setSnapGrid] = useState(true);

    const [leftTab, setLeftTab] = useState<'palette' | 'scripts' | 'vars'>('palette');
    const [search, setSearch] = useState('');

    const [history, setHistory] = useState<LogicGraph[]>([demoGraph()]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [clipboard, setClipboard] = useState<{ nodes: LogicNode[]; wires: LogicWire[] } | null>(null);

    const [scriptName, setScriptName] = useState('untitled');
    const [scriptList, setScriptList] = useState<string[]>([]);
    const [projectSources, setProjectSources] = useState<{ sounds: string[]; prefabs: string[] }>({ sounds: [], prefabs: [] });
    const [statusLine, setStatusLine] = useState('READY');
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const canvasRef = useRef<HTMLDivElement>(null);

    // ─── History (undo/redo) ───────────────────────────────────────────────

    const commit = useCallback((next: LogicGraph) => {
        setGraph(next);
        setHistory(prev => {
            const trimmed = prev.slice(0, historyIndex + 1);
            trimmed.push(next);
            return trimmed.length > 100 ? trimmed.slice(trimmed.length - 100) : trimmed;
        });
        setHistoryIndex(idx => Math.min(idx + 1, 99));
        setIsDirty(true);
    }, [historyIndex]);

    const undo = useCallback(() => {
        setHistoryIndex(idx => {
            if (idx <= 0) return idx;
            const next = idx - 1;
            setGraph(history[next]);
            setStatusLine('UNDO');
            return next;
        });
    }, [history]);

    const redo = useCallback(() => {
        setHistoryIndex(idx => {
            if (idx >= history.length - 1) return idx;
            const next = idx + 1;
            setGraph(history[next]);
            setStatusLine('REDO');
            return next;
        });
    }, [history]);

    // ─── Load ───────────────────────────────────────────────────────────────

    const refreshScriptList = useCallback(async () => {
        try {
            const res = await fetch('/api/logic/list');
            if (res.ok) setScriptList(await res.json());
        } catch {
            /* list is best-effort UI sugar; save/load still work without it */
        }
    }, []);

    const refreshProjectSources = useCallback(async () => {
        try {
            const sounds = new Set<string>();
            const prefabs = new Set<string>();

            const [assetsRes, npcsRes, enemiesRes, defsRes] = await Promise.all([
                fetch('/api/assets').catch(() => null),
                fetch('/api/npcs').catch(() => null),
                fetch('/api/enemies').catch(() => null),
                fetch('/api/ide/list?dir=dunyalar/definitions').catch(() => null),
            ]);

            if (assetsRes?.ok) {
                const payload = await assetsRes.json();
                const list = Array.isArray(payload) ? payload : (payload?.assets || []);
                list.forEach((a: any) => {
                    if (a?.type === 'audio' && a?.name) sounds.add(String(a.name));
                });
            }
            if (npcsRes?.ok) {
                const npcs = await npcsRes.json();
                if (Array.isArray(npcs)) npcs.forEach((n: any) => { if (n?.id) prefabs.add(String(n.id)); });
            }
            if (enemiesRes?.ok) {
                const enemies = await enemiesRes.json();
                if (Array.isArray(enemies)) enemies.forEach((e: any) => { if (e?.id) prefabs.add(String(e.id)); });
            }
            if (defsRes?.ok) {
                const files = await defsRes.json();
                const ignored = new Set(['items.json', 'quests.json', 'enemies.json', 'npcs.json', 'dialogues.json', 'skills.json', 'achievements.json', 'variables.json', 'ui.json', 'campaign.json', 'locales.json', 'music.json']);
                if (Array.isArray(files)) {
                    files.forEach((f: any) => {
                        if (!f.isDirectory && typeof f.name === 'string' && f.name.endsWith('.json') && !ignored.has(f.name)) {
                            prefabs.add(f.name.replace(/\.json$/i, ''));
                        }
                    });
                }
            }
            setProjectSources({ sounds: Array.from(sounds).sort(), prefabs: Array.from(prefabs).sort() });
        } catch {
            /* best-effort dropdown population */
        }
    }, []);

    const loadScript = useCallback(async (name: string) => {
        try {
            setStatusLine('LOADING...');
            const res = await fetch(`/api/logic/${encodeURIComponent(name)}.algorithm`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const loaded: LogicGraph = {
                nodes: Array.isArray(data.nodes)
                    ? data.nodes.map((n: any) => ({
                        ...n,
                        data: { ...(NODE_LIBRARY[n.type]?.defaults || {}), ...(n.data || {}) }
                    }))
                    : [],
                wires: Array.isArray(data.wires) ? data.wires : [],
                vars: Array.isArray(data.vars) ? data.vars : []
            };
            setGraph(loaded);
            setHistory([loaded]);
            setHistoryIndex(0);
            setSelected(new Set());
            setScriptName(name);
            setIsDirty(false);
            setStatusLine(`LOADED: ${name}`);
        } catch (err) {
            console.error('[NodeLogic] load failed', err);
            setStatusLine('LOAD_FAILED');
        }
    }, []);

    useEffect(() => {
        if (!isReady) return;
        void refreshScriptList();
        void refreshProjectSources();
    }, [isReady, refreshScriptList, refreshProjectSources]);

    // ─── Save / New / Delete ────────────────────────────────────────────────

    const saveScript = useCallback(async (interactive = true) => {
        const cleanName = scriptName.trim();
        if (!cleanName || !/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
            if (interactive) {
                setStatusLine('INVALID SCRIPT NAME (USE a-z, 0-9, _, -)');
            }
            return;
        }
        setIsSaving(true);
        setStatusLine('SAVING...');
        try {
            const res = await fetch('/api/logic/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: cleanName, json: JSON.stringify(graph, null, 2) })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setIsDirty(false);
            setStatusLine('SAVED');
            eventBus?.emit('algorithm:saved', { scriptId: cleanName });
            eventBus?.emit('system:script:update', { scriptId: cleanName });
            void refreshScriptList();
        } catch (err) {
            console.error('[NodeLogic] save failed', err);
            setStatusLine('SAVE_FAILED');
        } finally {
            setIsSaving(false);
        }
    }, [graph, scriptName, refreshScriptList, eventBus]);

    const newScript = useCallback(() => {
        const input = prompt('Enter new script name:', 'new_script');
        if (input === null) return;
        const cleanName = input.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'untitled';
        const fresh = emptyGraph();
        setGraph(fresh);
        setHistory([fresh]);
        setHistoryIndex(0);
        setSelected(new Set());
        setScriptName(cleanName);
        setIsDirty(false);
        setStatusLine(`NEW SCRIPT: ${cleanName}`);
    }, []);

    const deleteScript = useCallback(async (targetName = scriptName) => {
        const cleanName = targetName.trim();
        if (!cleanName || !/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
            setStatusLine('INVALID SCRIPT NAME');
            return;
        }
        if (!confirm(`Delete logic script "${cleanName}"?`)) return;
        setStatusLine('DELETING...');
        try {
            const res = await fetch(`/api/logic/${encodeURIComponent(cleanName)}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
            if (cleanName === scriptName) {
                const fresh = emptyGraph();
                setGraph(fresh);
                setHistory([fresh]);
                setHistoryIndex(0);
                setSelected(new Set());
                setScriptName('untitled');
                setIsDirty(false);
            }
            setStatusLine(`DELETED: ${cleanName}`);
            void refreshScriptList();
        } catch (err) {
            console.error('[NodeLogic] delete failed', err);
            setStatusLine('DELETE_FAILED');
        }
    }, [scriptName, refreshScriptList]);

    // ─── Node / wire mutation helpers ──────────────────────────────────────

    const addNode = useCallback((type: string, atX?: number, atY?: number) => {
        const def = NODE_LIBRARY[type];
        if (!def) return;
        const node: LogicNode = {
            id: uid('n'),
            type,
            x: atX ?? (-pan.x + 320) / zoom,
            y: atY ?? (-pan.y + 200) / zoom,
            data: { ...(def.defaults || {}) }
        };
        commit({ ...graph, nodes: [...graph.nodes, node] });
        setSelected(new Set([node.id]));
        setStatusLine(`ADDED: ${def.title}`);
    }, [graph, pan, zoom, commit]);

    const deleteNodeById = useCallback((nodeId: string) => {
        commit({
            nodes: graph.nodes.filter(n => n.id !== nodeId),
            wires: graph.wires.filter(w => w.fromNode !== nodeId && w.toNode !== nodeId),
            vars: graph.vars
        });
        setSelected(prev => {
            if (!prev.has(nodeId)) return prev;
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
        });
        setStatusLine('DELETED');
    }, [graph, commit]);

    const deleteSelected = useCallback(() => {
        if (selected.size === 0) return;
        const ids = selected;
        commit({
            nodes: graph.nodes.filter(n => !ids.has(n.id)),
            wires: graph.wires.filter(w => !ids.has(w.fromNode) && !ids.has(w.toNode)),
            vars: graph.vars
        });
        setSelected(new Set());
        setStatusLine('DELETED');
    }, [graph, selected, commit]);

    const deleteWire = useCallback((wireId: string) => {
        commit({ ...graph, wires: graph.wires.filter(w => w.id !== wireId) });
    }, [graph, commit]);

    const updateNodeData = useCallback((nodeId: string, key: string, value: any, immediateCommit = false) => {
        const next = {
            ...graph,
            nodes: graph.nodes.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n))
        };
        if (immediateCommit) {
            commit(next);
        } else {
            setGraph(next);
            setIsDirty(true);
        }
    }, [graph, commit]);

    const commitNodeData = useCallback(() => {
        // Field edits update `graph` live for responsiveness; push one history
        // entry when the field loses focus rather than per-keystroke.
        commit(graph);
    }, [graph, commit]);

    const copySelection = useCallback(() => {
        const nodes = graph.nodes.filter(n => selected.has(n.id));
        if (nodes.length === 0) return;
        const ids = new Set(nodes.map(n => n.id));
        const wires = graph.wires.filter(w => ids.has(w.fromNode) && ids.has(w.toNode));
        setClipboard({ nodes, wires });
        setStatusLine(`COPIED ${nodes.length} NODE(S)`);
    }, [graph, selected]);

    const pasteClipboard = useCallback(() => {
        if (!clipboard || clipboard.nodes.length === 0) return;
        const idMap = new Map<string, string>();
        const newNodes = clipboard.nodes.map(n => {
            const newId = uid('n');
            idMap.set(n.id, newId);
            return { ...n, id: newId, x: n.x + 40, y: n.y + 40, data: { ...n.data } };
        });
        const newWires = clipboard.wires.map(w => ({
            id: uid('w'),
            fromNode: idMap.get(w.fromNode)!,
            fromPort: w.fromPort,
            toNode: idMap.get(w.toNode)!,
            toPort: w.toPort
        }));
        commit({ ...graph, nodes: [...graph.nodes, ...newNodes], wires: [...graph.wires, ...newWires] });
        setSelected(new Set(newNodes.map(n => n.id)));
        setStatusLine(`PASTED ${newNodes.length} NODE(S)`);
    }, [clipboard, graph, commit]);

    // ─── Variables panel ────────────────────────────────────────────────────

    const addVar = useCallback(() => {
        const name = `var_${graph.vars.length + 1}`;
        commit({ ...graph, vars: [...graph.vars, { name, type: 'num', value: 0 }] });
    }, [graph, commit]);

    const updateVar = useCallback((index: number, patch: Partial<LogicVar>) => {
        const vars = graph.vars.map((v, i) => (i === index ? { ...v, ...patch } : v));
        setGraph({ ...graph, vars });
        setIsDirty(true);
    }, [graph]);

    const deleteVar = useCallback((index: number) => {
        commit({ ...graph, vars: graph.vars.filter((_, i) => i !== index) });
    }, [graph, commit]);

    // ─── Coordinate helpers ─────────────────────────────────────────────────

    const clientToGraph = useCallback((clientX: number, clientY: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const left = rect?.left ?? 0;
        const top = rect?.top ?? 0;
        return { x: (clientX - left - pan.x) / zoom, y: (clientY - top - pan.y) / zoom };
    }, [pan, zoom]);

    // ─── Node drag ──────────────────────────────────────────────────────────

    const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
        if (spaceHeld) return;
        e.stopPropagation();
        const additive = e.ctrlKey || e.metaKey || e.shiftKey;
        let nextSelected = selected;
        if (additive) {
            nextSelected = new Set(selected);
            if (nextSelected.has(nodeId)) nextSelected.delete(nodeId); else nextSelected.add(nodeId);
            setSelected(nextSelected);
        } else if (!selected.has(nodeId)) {
            nextSelected = new Set([nodeId]);
            setSelected(nextSelected);
        }
        const ids = Array.from(nextSelected.size ? nextSelected : [nodeId]);
        const startPositions = new Map<string, { x: number; y: number }>();
        graph.nodes.forEach(n => { if (ids.includes(n.id)) startPositions.set(n.id, { x: n.x, y: n.y }); });
        setDragState({ ids, startClientX: e.clientX, startClientY: e.clientY, startPositions, moved: false });
    }, [graph, selected, spaceHeld]);

    // ─── Wire drag ──────────────────────────────────────────────────────────

    const handlePortMouseDown = useCallback((e: React.MouseEvent, ref: PortRef) => {
        e.stopPropagation();
        const g = clientToGraph(e.clientX, e.clientY);
        setWireDrag({ from: ref, x: g.x, y: g.y });
    }, [clientToGraph]);

    const tryCommitWire = useCallback((target: PortRef | null) => {
        setWireDrag(current => {
            if (current && target) {
                const from = current.from;
                let src = from, dst = target;
                if (src.role === dst.role) {
                    setStatusLine(src.role === 'in' ? 'INVALID: INPUT TO INPUT' : 'INVALID: OUTPUT TO OUTPUT');
                    return null;
                }
                if (src.role === 'in') { const tmp = src; src = dst; dst = tmp; }
                if (src.nodeId === dst.nodeId) {
                    setStatusLine('INVALID: SELF CONNECTION');
                    return null;
                }
                const typesCompatible = src.portType === dst.portType || src.portType === 'any' || dst.portType === 'any'
                    || (src.portType === 'exec') === (dst.portType === 'exec');
                if (!typesCompatible) {
                    setStatusLine(`TYPE MISMATCH: ${src.portType.toUpperCase()} -> ${dst.portType.toUpperCase()}`);
                    return null;
                }
                setGraph(g => {
                    // An input port can only receive one wire — replace any existing one.
                    const filtered = g.wires.filter(w => !(w.toNode === dst.nodeId && w.toPort === dst.portId));
                    const next = {
                        ...g,
                        wires: [...filtered, { id: uid('w'), fromNode: src.nodeId, fromPort: src.portId, toNode: dst.nodeId, toPort: dst.portId }]
                    };
                    commit(next);
                    return next;
                });
                setStatusLine('WIRE CONNECTED');
            }
            return null;
        });
    }, [commit]);

    // ─── Global mouse handlers (drag / pan / marquee / wire) ──────────────

    // Live snapshot of interaction state, read by the (once-bound) global mouse
    // listeners so they aren't torn down and re-added on every drag frame.
    const mouseLiveRef = useRef<{
        panning: any; dragState: any; wireDrag: any; marquee: any; zoom: number;
        snapGrid: boolean; graph: any; clientToGraph: (x: number, y: number) => any;
        commit: (g: any) => void; tryCommitWire: (t: any) => void;
    }>({ panning: null, dragState: null, wireDrag: null, marquee: null, zoom: 1, snapGrid: false, graph: { nodes: [] }, clientToGraph: (x: number, y: number) => ({ x, y }), commit: () => {}, tryCommitWire: () => {} });
    mouseLiveRef.current = { panning, dragState, wireDrag, marquee, zoom, snapGrid, graph, clientToGraph, commit, tryCommitWire };

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            const { panning, dragState, wireDrag, marquee, zoom, clientToGraph } = mouseLiveRef.current;
            const g = clientToGraph(e.clientX, e.clientY);
            setMousePos(g);

            if (panning) {
                setPan({ x: panning.startPan.x + (e.clientX - panning.startClientX), y: panning.startPan.y + (e.clientY - panning.startClientY) });
                return;
            }
            if (dragState) {
                const dx = (e.clientX - dragState.startClientX) / zoom;
                const dy = (e.clientY - dragState.startClientY) / zoom;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    setGraph(prev => ({
                        ...prev,
                        nodes: prev.nodes.map(n => {
                            const start = dragState.startPositions.get(n.id);
                            if (!start) return n;
                            return { ...n, x: start.x + dx, y: start.y + dy };
                        })
                    }));
                    dragState.moved = true;
                }
                return;
            }
            if (wireDrag) {
                setWireDrag(w => (w ? { ...w, x: g.x, y: g.y } : w));
                return;
            }
            if (marquee) {
                setMarquee(m => (m ? { ...m, x1: g.x, y1: g.y } : m));
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            const { panning, dragState, wireDrag, marquee, snapGrid, graph, commit, tryCommitWire } = mouseLiveRef.current;
            if (panning) setPanning(null);

            if (dragState) {
                if (dragState.moved) {
                    setGraph(prev => {
                        let next = prev;
                        if (snapGrid) {
                            next = {
                                ...prev,
                                nodes: prev.nodes.map(n => (dragState.startPositions.has(n.id)
                                    ? { ...n, x: Math.round(n.x / 20) * 20, y: Math.round(n.y / 20) * 20 }
                                    : n))
                            };
                        }
                        commit(next);
                        return next;
                    });
                }
                setDragState(null);
            }

            if (wireDrag) {
                const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
                const portEl = el?.closest('[data-port-role]') as HTMLElement | null;
                if (portEl) {
                    const target: PortRef = {
                        nodeId: portEl.dataset.nodeId!,
                        portId: portEl.dataset.portId!,
                        portType: portEl.dataset.portType as PortType,
                        role: portEl.dataset.portRole as PortRole
                    };
                    tryCommitWire(target);
                } else {
                    tryCommitWire(null);
                }
            }

            if (marquee) {
                const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1);
                const y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1);
                const moved = Math.abs(marquee.x1 - marquee.x0) > 3 || Math.abs(marquee.y1 - marquee.y0) > 3;
                if (moved) {
                    const hit = graph.nodes.filter(n => {
                        const def = NODE_LIBRARY[n.type];
                        const h = n.type === 'comment_box' ? (n.data.height ?? 200) : nodeBodyHeight(def);
                        const w = n.type === 'comment_box' ? (n.data.width ?? 300) : NODE_WIDTH;
                        return n.x < x1 && n.x + w > x0 && n.y < y1 && n.y + h > y0;
                    }).map(n => n.id);
                    setSelected(prev => {
                        const next = marquee.additive ? new Set(prev) : new Set<string>();
                        hit.forEach(id => next.add(id));
                        return next;
                    });
                } else if (!marquee.additive) {
                    setSelected(new Set());
                }
                setMarquee(null);
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        }, []);  // bind once; live values read via mouseLiveRef

    const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 || spaceHeld) {
            setPanning({ startClientX: e.clientX, startClientY: e.clientY, startPan: pan });
            return;
        }
        if (e.button !== 0) return;
        const g = clientToGraph(e.clientX, e.clientY);
        setMarquee({ x0: g.x, y0: g.y, x1: g.x, y1: g.y, additive: e.ctrlKey || e.metaKey || e.shiftKey });
    }, [spaceHeld, pan, clientToGraph]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        const cx = e.clientX - (rect?.left ?? 0);
        const cy = e.clientY - (rect?.top ?? 0);
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => {
            const next = Math.max(0.25, Math.min(2, z * factor));
            setPan(p => ({
                x: cx - ((cx - p.x) / z) * next,
                y: cy - ((cy - p.y) / z) * next
            }));
            return next;
        });
    }, []);

    // ─── Keyboard shortcuts ─────────────────────────────────────────────────

    // Bind the global key listeners exactly once; the live handlers are read
    // through a ref so rapidly-changing deps (undo/redo/graph state) don't cause
    // the window listeners to be torn down and re-added on every render.
    const keyboardRef = useRef<{ onKeyDown: (e: KeyboardEvent) => void; onKeyUp: (e: KeyboardEvent) => void }>({
        onKeyDown: () => {},
        onKeyUp: () => {}
    });
    keyboardRef.current = {
        onKeyDown: (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void saveScript(true);
                return;
            }
            const tag = (e.target as HTMLElement)?.tagName;
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
            if (e.code === 'Space' && !typing) { setSpaceHeld(true); }
            if (typing) return;

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); }
            else if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); }
        },
        onKeyUp: (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceHeld(false); }
    };
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => keyboardRef.current.onKeyDown(e);
        const onKeyUp = (e: KeyboardEvent) => keyboardRef.current.onKeyUp(e);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    // ─── StudioBridge & global save ─────────────────────────────────────────

    const saveScriptRef = useRef(saveScript);
    saveScriptRef.current = saveScript;

    const applyAIPatchRef = useRef((_nodes: any[], _wires: any[]): any => ({ changedResources: [], nodeCount: 0, wireCount: 0 }));
    applyAIPatchRef.current = (incomingNodes: any[] = [], incomingWires: any[] = []) => {
        const idMap = new Map<string, string>();
        const offsetX = (-pan.x + 260) / zoom;
        const offsetY = (-pan.y + 180) / zoom;
        const addedNodes: LogicNode[] = [];

        incomingNodes.forEach((nData: any, i: number) => {
            const def = NODE_LIBRARY[nData?.type];
            if (!def) return;
            const newId = uid('n');
            if (nData.id) idMap.set(String(nData.id), newId);
            addedNodes.push({
                id: newId,
                type: nData.type,
                x: (typeof nData.x === 'number' ? nData.x : i * 240) + offsetX,
                y: (typeof nData.y === 'number' ? nData.y : 0) + offsetY,
                data: {
                    ...(def.defaults || {}),
                    ...(nData.data && typeof nData.data === 'object' ? nData.data : {}),
                    ...(nData.value !== undefined ? { value: nData.value } : {}),
                    ...(nData.op !== undefined ? { op: nData.op } : {}),
                }
            });
        });

        const addedWires: LogicWire[] = [];
        incomingWires.forEach((wData: any) => {
            const rawFrom = wData.fromNode ?? wData.sourceId ?? wData.sourceNode;
            const rawTo = wData.toNode ?? wData.targetId ?? wData.targetNode;
            const fromNode = idMap.get(String(rawFrom)) ?? (graph.nodes.some(n => n.id === rawFrom) ? String(rawFrom) : undefined);
            const toNode = idMap.get(String(rawTo)) ?? (graph.nodes.some(n => n.id === rawTo) ? String(rawTo) : undefined);
            if (!fromNode || !toNode) return;
            addedWires.push({
                id: uid('w'),
                fromNode,
                fromPort: String(wData.fromPort ?? wData.sourcePort ?? 'out'),
                toNode,
                toPort: String(wData.toPort ?? wData.targetPort ?? 'in'),
            });
        });

        commit({
            ...graph,
            nodes: [...graph.nodes, ...addedNodes],
            wires: [...graph.wires, ...addedWires],
        });
        setStatusLine(`AI PATCH: +${addedNodes.length} NODES`);
        return {
            changedResources: ['algorithm:current'],
            nodeCount: addedNodes.length,
            wireCount: addedWires.length,
        };
    };

    useEffect(() => {
        if (!isReady) return;
        const unsubSave = eventBus?.on('system:global_save', () => {
            void saveScriptRef.current(false);
        });

        let bridge: any = null;
        const BridgeCtor = (window as any).StudioBridge;
        if (BridgeCtor) {
            bridge = new BridgeCtor('logic', eventBus);
            bridge.register({
                name: 'generate',
                description: 'Apply a validated node and wire patch to the current algorithm graph.',
                securityLevel: 'high-risk',
                parameters: {
                    type: 'object',
                    properties: {
                        nodes: { type: 'array', items: { type: 'object' } },
                        wires: { type: 'array', items: { type: 'object' } }
                    },
                    required: ['nodes', 'wires']
                },
                execute: async ({ nodes, wires }: { nodes: any[]; wires: any[] }) => {
                    return applyAIPatchRef.current(nodes, wires);
                }
            });
        }

        return () => {
            if (unsubSave && eventBus?.off) eventBus.off('system:global_save', unsubSave);
            bridge?.dispose?.();
        };
    }, [isReady, eventBus]);

    // ─── Derived / search ───────────────────────────────────────────────────

    const categories = useMemo(() => getCategories(), []);
    const filteredEntries = useMemo(() => {
        const q = search.trim().toLowerCase();
        return Object.entries(NODE_LIBRARY).filter(([type, def]) => {
            if (!q) return true;
            return type.includes(q) || def.title.toLowerCase().includes(q) || def.desc.toLowerCase().includes(q) || def.cat.toLowerCase().includes(q);
        });
    }, [search]);

    const selectedNode = selected.size === 1 ? graph.nodes.find(n => selected.has(n.id)) : undefined;
    const selectedDef = selectedNode ? NODE_LIBRARY[selectedNode.type] : undefined;

    if (!isReady) {
        return <div style={{ color: THEME.accent, padding: 20, background: THEME.bgRoot, height: '100vh', fontFamily: 'VT323, monospace' }}>BOOTING LOGIC ENGINE...</div>;
    }

    // ─── Render helpers ─────────────────────────────────────────────────────

    const btnStyle = (active = false): React.CSSProperties => ({
        background: active ? THEME.accent : THEME.bgPanel,
        color: active ? '#000' : THEME.textMain,
        border: `1px solid ${active ? THEME.accent : THEME.border}`,
        boxShadow: THEME.retroOut,
        padding: '4px 10px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 6
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: THEME.bgRoot, color: THEME.textMain, fontFamily: 'VT323, monospace', fontSize: 18, userSelect: dragState || panning || wireDrag || marquee ? 'none' : undefined }}>
            {/* HEADER */}
            <div style={{ height: 52, background: THEME.bgPanelAlt, borderBottom: '2px solid #000', boxShadow: '0 2px 0 rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 10 }}>
                <div style={{ color: THEME.accent, fontWeight: 'bold', letterSpacing: 2, display: 'flex', alignItems: 'center', gap: 12, fontSize: 20 }}>
                    <Cpu size={20} /> <span style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}>NODE LOGIC PRO</span>
                    <span style={{ color: THEME.textMute, fontSize: 12, letterSpacing: 0, opacity: 0.6 }}>v3.0</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 4, background: '#000', padding: 2, border: `1px solid ${THEME.border}` }}>
                        <span style={{ padding: '2px 10px', background: THEME.bgPanel, color: THEME.accent, fontSize: 13, fontWeight: 'bold' }}>NODES: {graph.nodes.length}</span>
                        <span style={{ padding: '2px 10px', background: THEME.bgPanel, color: THEME.textDim, fontSize: 13 }}>WIRES: {graph.wires.length}</span>
                        <span style={{ padding: '2px 10px', background: THEME.bgPanel, color: THEME.textDim, fontSize: 13 }}>VARS: {graph.vars.length}</span>
                    </div>
                    <div style={{ minWidth: 160, textAlign: 'right', color: statusLine.includes('FAILED') || statusLine.includes('INVALID') || statusLine.includes('MISMATCH') ? THEME.danger : statusLine.includes('SAVED') || statusLine.includes('CONNECTED') ? THEME.ok : THEME.textMute, fontSize: 13, fontFamily: 'monospace' }}>
                        {statusLine}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#000', border: `1px solid ${THEME.border}`, padding: '3px 8px' }}>
                        <span style={{ fontSize: 12, color: THEME.textMute }}>SCRIPT:</span>
                        <input
                            value={scriptName}
                            onChange={e => { setScriptName(e.target.value); setIsDirty(true); }}
                            placeholder="script_name"
                            aria-label="Script Name"
                            style={{ width: 140, background: 'transparent', border: 'none', color: THEME.textMain, fontFamily: 'inherit', fontSize: 14, padding: 0, boxShadow: 'none' }}
                        />
                    </div>
                    <button onClick={newScript} style={btnStyle()} title="New script"><FilePlus size={14} /> NEW</button>
                    <button
                        onClick={() => void saveScript(true)}
                        disabled={isSaving}
                        style={{ ...btnStyle(), background: isDirty ? THEME.accent : THEME.bgPanel, color: isDirty ? '#000' : THEME.textDim, borderColor: isDirty ? THEME.accent : THEME.border, boxShadow: isDirty ? '2px 2px 0 #9a0a0a' : THEME.retroOut, fontWeight: 'bold' }}
                    >
                        <Save size={14} /> {isSaving ? 'SAVING...' : isDirty ? 'SAVE*' : 'SAVED'}
                    </button>
                    <button
                        onClick={() => void deleteScript(scriptName)}
                        style={{ ...btnStyle(), color: THEME.danger }}
                        title="Delete script from disk"
                    >
                        <Trash2 size={14} /> DELETE
                    </button>
                </div>
            </div>

            {/* TOOLBAR */}
            <div style={{ height: 46, background: THEME.bgDeep, borderBottom: `1px solid ${THEME.border}`, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#000', border: `1px solid ${THEME.border}`, padding: '4px 8px', width: 260 }}>
                    <Search size={14} color={THEME.textMute} />
                    <input
                        value={search}
                        onChange={e => { setSearch(e.target.value); setLeftTab('palette'); }}
                        placeholder="Search node library..."
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: THEME.textMain, fontFamily: 'inherit', fontSize: 14, flexGrow: 1 }}
                    />
                </div>
                <div style={{ width: 1, height: 22, background: THEME.border }} />
                <button style={btnStyle()} onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
                <button style={btnStyle()} onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)"><Redo2 size={14} /></button>
                <button style={btnStyle()} onClick={copySelection} disabled={selected.size === 0} title="Copy (Ctrl+C)"><Copy size={14} /></button>
                <button style={btnStyle()} onClick={deleteSelected} disabled={selected.size === 0} title="Delete"><Trash2 size={14} /></button>
                <div style={{ width: 1, height: 22, background: THEME.border }} />
                <button style={btnStyle(snapGrid)} onClick={() => setSnapGrid(s => !s)} title="Snap to grid"><Grid3x3 size={14} /></button>
                <button style={btnStyle()} onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} title="Zoom out"><ZoomOut size={14} /></button>
                <span style={{ fontSize: 13, color: THEME.textDim, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <button style={btnStyle()} onClick={() => setZoom(z => Math.min(2, z + 0.1))} title="Zoom in"><ZoomIn size={14} /></button>
                <button style={btnStyle()} onClick={() => { setZoom(1); setPan({ x: 80, y: 60 }); }} title="Reset view">100%</button>
                <div style={{ flexGrow: 1 }} />
                <span style={{ fontSize: 12, color: THEME.textMute }}>SPACE+DRAG OR MIDDLE-CLICK TO PAN &middot; WHEEL TO ZOOM &middot; DRAG PORT TO WIRE</span>
            </div>

            {/* BODY */}
            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
                {/* LEFT PANEL */}
                <div style={{ width: 260, background: THEME.bgPanel, borderRight: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', borderBottom: `1px solid ${THEME.border}` }}>
                        {(['palette', 'scripts', 'vars'] as const).map(tab => (
                            <div
                                key={tab}
                                onClick={() => setLeftTab(tab)}
                                style={{ flex: 1, textAlign: 'center', padding: '8px 0', cursor: 'pointer', fontSize: 13, letterSpacing: 1, color: leftTab === tab ? THEME.accent : THEME.textDim, borderBottom: leftTab === tab ? `2px solid ${THEME.accent}` : '2px solid transparent', background: leftTab === tab ? THEME.bgHover : 'transparent' }}
                            >
                                {tab.toUpperCase()}
                            </div>
                        ))}
                    </div>

                    <div style={{ flexGrow: 1, overflowY: 'auto', padding: 8 }}>
                        {leftTab === 'palette' && categories.map(cat => {
                            const entries = filteredEntries.filter(([, def]) => def.cat === cat);
                            if (entries.length === 0) return null;
                            return (
                                <div key={cat} style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 11, color: CATEGORY_COLORS[cat] || THEME.textMute, letterSpacing: 1, marginBottom: 4, borderBottom: `1px solid ${THEME.borderMute}`, paddingBottom: 2 }}>{cat.toUpperCase()}</div>
                                    {entries.map(([type, def]) => (
                                        <div
                                            key={type}
                                            onClick={() => addNode(type)}
                                            title={def.desc}
                                            style={{ padding: '5px 8px', cursor: 'pointer', fontSize: 14, color: THEME.textMain, borderLeft: `3px solid ${CATEGORY_COLORS[cat] || THEME.border}`, marginBottom: 2, background: THEME.bgPanelAlt }}
                                            onMouseEnter={e => (e.currentTarget.style.background = THEME.bgHover)}
                                            onMouseLeave={e => (e.currentTarget.style.background = THEME.bgPanelAlt)}
                                        >
                                            {def.title}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}

                        {leftTab === 'scripts' && (
                            <div>
                                <div style={{ fontSize: 12, color: THEME.textMute, marginBottom: 8 }}>CURRENT: <span style={{ color: THEME.accent }}>{scriptName}</span></div>
                                {scriptList.length === 0 && <div style={{ color: THEME.textMute, fontSize: 13 }}>NO SAVED SCRIPTS</div>}
                                {scriptList.map(name => (
                                    <div
                                        key={name}
                                        onClick={() => void loadScript(name)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', fontSize: 14, background: THEME.bgPanelAlt, marginBottom: 2, color: name === scriptName ? THEME.accent : THEME.textMain }}
                                        onMouseEnter={e => (e.currentTarget.style.background = THEME.bgHover)}
                                        onMouseLeave={e => (e.currentTarget.style.background = THEME.bgPanelAlt)}
                                    >
                                        <FolderOpen size={13} /> {name}
                                    </div>
                                ))}
                            </div>
                        )}

                        {leftTab === 'vars' && (
                            <div>
                                <button onClick={addVar} style={{ ...btnStyle(), width: '100%', justifyContent: 'center', marginBottom: 8 }}><Plus size={14} /> ADD VARIABLE</button>
                                {graph.vars.map((v, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
                                        <Variable size={12} color={THEME.textMute} />
                                        <input value={v.name} onChange={e => updateVar(i, { name: e.target.value })} onBlur={() => commit(graph)} style={{ width: 70, background: '#000', border: `1px solid ${THEME.border}`, color: THEME.textMain, fontFamily: 'inherit', fontSize: 13, padding: '2px 4px' }} />
                                        <select value={v.type} onChange={e => updateVar(i, { type: e.target.value })} onBlur={() => commit(graph)} style={{ background: '#000', border: `1px solid ${THEME.border}`, color: THEME.textDim, fontFamily: 'inherit', fontSize: 12 }}>
                                            <option value="num">num</option>
                                            <option value="bool">bool</option>
                                            <option value="string">string</option>
                                            <option value="any">any</option>
                                        </select>
                                        <input value={String(v.value)} onChange={e => updateVar(i, { value: e.target.value })} onBlur={() => commit(graph)} style={{ width: 50, background: '#000', border: `1px solid ${THEME.border}`, color: THEME.textMain, fontFamily: 'inherit', fontSize: 13, padding: '2px 4px' }} />
                                        <Trash2 size={12} color={THEME.danger} style={{ cursor: 'pointer' }} onClick={() => deleteVar(i)} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* CANVAS */}
                <div
                    ref={canvasRef}
                    onMouseDown={handleCanvasMouseDown}
                    onWheel={handleWheel}
                    style={{
                        flexGrow: 1,
                        position: 'relative',
                        overflow: 'hidden',
                        background: THEME.bgRoot,
                        backgroundImage: `radial-gradient(${THEME.borderMute} 1px, transparent 1px)`,
                        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                        backgroundPosition: `${pan.x}px ${pan.y}px`,
                        cursor: spaceHeld ? 'grab' : 'default'
                    }}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
                        {/* Comment boxes render behind everything */}
                        {graph.nodes.filter(n => n.type === 'comment_box').map(n => (
                            <div
                                key={n.id}
                                onMouseDown={e => handleNodeMouseDown(e, n.id)}
                                style={{
                                    position: 'absolute', left: n.x, top: n.y,
                                    width: n.data.width ?? 300, height: n.data.height ?? 200,
                                    background: `${n.data.color || '#3498db'}22`,
                                    border: `2px solid ${selected.has(n.id) ? THEME.accent : (n.data.color || '#3498db')}`,
                                    borderRadius: 4, cursor: 'grab', zIndex: 0
                                }}
                            >
                                <div style={{ background: n.data.color || '#3498db', color: '#000', fontSize: 12, fontWeight: 'bold', padding: '3px 8px' }}>COMMENT</div>
                            </div>
                        ))}

                        {/* SVG wires */}
                        <svg style={{ position: 'absolute', top: -4000, left: -4000, width: 8000, height: 8000, pointerEvents: 'none', overflow: 'visible' }}>
                            <g transform="translate(4000,4000)">
                                {graph.wires.map(w => {
                                    const fromNode = graph.nodes.find(n => n.id === w.fromNode);
                                    const toNode = graph.nodes.find(n => n.id === w.toNode);
                                    if (!fromNode || !toNode) return null;
                                    const fromDef = NODE_LIBRARY[fromNode.type];
                                    const toDef = NODE_LIBRARY[toNode.type];
                                    const fromIdx = fromDef?.outputs?.findIndex(p => p.id === w.fromPort) ?? -1;
                                    const toIdx = toDef?.inputs?.findIndex(p => p.id === w.toPort) ?? -1;
                                    if (fromIdx < 0 || toIdx < 0) return null;
                                    const p1 = portPosition(fromNode, fromDef, 'out', fromIdx);
                                    const p2 = portPosition(toNode, toDef, 'in', toIdx);
                                    const portType = fromDef?.outputs?.[fromIdx]?.type ?? 'any';
                                    const dx = Math.max(40, Math.abs(p1.x - p2.x) / 2);
                                    const path = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y} ${p2.x - dx} ${p2.y} ${p2.x} ${p2.y}`;
                                    return (
                                        <path
                                            key={w.id}
                                            d={path}
                                            stroke={PORT_COLORS[portType]}
                                            strokeWidth={portType === 'exec' ? 3 : 2}
                                            fill="none"
                                            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                            onDoubleClick={() => deleteWire(w.id)}
                                        />
                                    );
                                })}
                                {wireDrag && (() => {
                                    const node = graph.nodes.find(n => n.id === wireDrag.from.nodeId);
                                    const def = node ? NODE_LIBRARY[node.type] : undefined;
                                    const list = wireDrag.from.role === 'out' ? def?.outputs : def?.inputs;
                                    const idx = list?.findIndex(p => p.id === wireDrag.from.portId) ?? -1;
                                    if (!node || idx < 0) return null;
                                    const p1 = portPosition(node, def, wireDrag.from.role === 'out' ? 'out' : 'in', idx);
                                    const dx = Math.max(40, Math.abs(p1.x - wireDrag.x) / 2);
                                    const path = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y} ${wireDrag.x - dx} ${wireDrag.y} ${wireDrag.x} ${wireDrag.y}`;
                                    return <path d={path} stroke={THEME.accent} strokeWidth={2} strokeDasharray="4 3" fill="none" />;
                                })()}
                            </g>
                        </svg>

                        {/* Nodes */}
                        {graph.nodes.filter(n => n.type !== 'comment_box').map(n => {
                            const def = NODE_LIBRARY[n.type];
                            const h = nodeBodyHeight(def);
                            const isSelected = selected.has(n.id);
                            return (
                                <div
                                    key={n.id}
                                    onMouseDown={e => handleNodeMouseDown(e, n.id)}
                                    style={{
                                        position: 'absolute', left: n.x, top: n.y, width: NODE_WIDTH, minHeight: h,
                                        background: THEME.bgPanel,
                                        border: `1px solid ${isSelected ? THEME.accent : THEME.border}`,
                                        boxShadow: isSelected ? `0 0 0 1px ${THEME.accent}, ${THEME.retroOut}` : THEME.retroOut,
                                        cursor: 'grab', zIndex: 1
                                    }}
                                >
                                    <div style={{ background: CATEGORY_COLORS[def?.cat ?? ''] || THEME.textMute, color: '#000', height: HEADER_H, boxSizing: 'border-box', padding: '0 8px', fontSize: 13, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def?.title ?? n.type}</span>
                                        <Trash2
                                            size={12}
                                            style={{ cursor: 'pointer', flexShrink: 0 }}
                                            onMouseDown={e => e.stopPropagation()}
                                            onClick={e => { e.stopPropagation(); deleteNodeById(n.id); }}
                                        />
                                    </div>
                                    <div style={{ padding: `${PORT_PAD_TOP}px 0`, fontSize: 13, position: 'relative' }}>
                                        {(def?.inputs ?? []).map((p, i) => (
                                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', height: PORT_ROW_H, paddingLeft: 4 }}>
                                                <div
                                                    data-port-role="in" data-node-id={n.id} data-port-id={p.id} data-port-type={p.type}
                                                    onMouseDown={e => handlePortMouseDown(e, { nodeId: n.id, portId: p.id, portType: p.type, role: 'in' })}
                                                    style={{ width: 10, height: 10, borderRadius: p.type === 'exec' ? 0 : '50%', background: PORT_COLORS[p.type], marginLeft: -5, marginRight: 6, cursor: 'crosshair', border: '1px solid #000' }}
                                                    title={`${p.name} (${p.type})`}
                                                />
                                                <span style={{ color: THEME.textDim, fontSize: 12 }}>{p.name}</span>
                                            </div>
                                        ))}
                                        {(def?.outputs ?? []).map((p, i) => (
                                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: PORT_ROW_H, paddingRight: 4 }}>
                                                <span style={{ color: THEME.textDim, fontSize: 12 }}>{p.name}</span>
                                                <div
                                                    data-port-role="out" data-node-id={n.id} data-port-id={p.id} data-port-type={p.type}
                                                    onMouseDown={e => handlePortMouseDown(e, { nodeId: n.id, portId: p.id, portType: p.type, role: 'out' })}
                                                    style={{ width: 10, height: 10, borderRadius: p.type === 'exec' ? 0 : '50%', background: PORT_COLORS[p.type], marginRight: -5, marginLeft: 6, cursor: 'crosshair', border: '1px solid #000' }}
                                                    title={`${p.name} (${p.type})`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {marquee && (
                        <div style={{
                            position: 'absolute',
                            left: pan.x + Math.min(marquee.x0, marquee.x1) * zoom,
                            top: pan.y + Math.min(marquee.y0, marquee.y1) * zoom,
                            width: Math.abs(marquee.x1 - marquee.x0) * zoom,
                            height: Math.abs(marquee.y1 - marquee.y0) * zoom,
                            border: `1px dashed ${THEME.accent}`, background: THEME.accentSoft, pointerEvents: 'none'
                        }} />
                    )}
                </div>

                {/* INSPECTOR */}
                <div style={{ width: 300, background: THEME.bgPanel, borderLeft: `1px solid ${THEME.border}`, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ height: 36, background: '#000', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8, borderBottom: `1px solid ${THEME.border}` }}>
                        <Settings2 size={14} color={THEME.accent} />
                        <span style={{ color: THEME.accent, fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>INSPECTOR</span>
                    </div>
                    <div style={{ flexGrow: 1, overflowY: 'auto', padding: 14 }}>
                        {!selectedNode && (
                            <div style={{ color: THEME.textMute, textAlign: 'center', marginTop: 30, fontSize: 14 }}>
                                {selected.size > 1 ? `${selected.size} NODES SELECTED` : 'SELECT A NODE TO VIEW PROPERTIES'}
                            </div>
                        )}
                        {selectedNode && selectedDef && (
                            <div>
                                <div style={{ color: THEME.accent, fontSize: 15, fontWeight: 'bold', marginBottom: 4 }}>{selectedDef.title}</div>
                                <div style={{ color: THEME.textMute, fontSize: 12, marginBottom: 4 }}>{selectedNode.type}</div>
                                <div style={{ color: THEME.textDim, fontSize: 13, marginBottom: 14, lineHeight: 1.4 }}>{selectedDef.desc}</div>

                                {(selectedDef.fields ?? []).length === 0 && (
                                    <div style={{ color: THEME.textMute, fontSize: 13 }}>NO CONFIGURABLE FIELDS</div>
                                )}

                                {(selectedDef.fields ?? []).map(field => {
                                    const defaultVal = selectedDef.defaults?.[field.key];
                                    const current = selectedNode.data[field.key] ?? defaultVal ?? '';
                                    const inputType = inferInputType(current, field, defaultVal);
                                    const rawOpts: string[] = (field as any).options
                                        ? (field as any).options
                                        : field.source === 'sounds'
                                            ? projectSources.sounds
                                            : field.source === 'prefabs'
                                                ? projectSources.prefabs
                                                : [];
                                    const dropdownOptions = Array.from(new Set([
                                        ...rawOpts,
                                        ...(defaultVal !== undefined && defaultVal !== '' ? [String(defaultVal)] : []),
                                        ...(current !== undefined && current !== '' ? [String(current)] : []),
                                    ]));
                                    return (
                                        <div key={field.key} style={{ marginBottom: 12 }}>
                                            <label style={{ display: 'block', fontSize: 12, color: THEME.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                {field.label}{field.source ? ` (${field.source})` : ''}
                                            </label>
                                            {inputType === 'checkbox' ? (
                                                <input type="checkbox" checked={!!current} onChange={e => updateNodeData(selectedNode.id, field.key, e.target.checked, true)} style={{ width: 'auto' }} />
                                            ) : inputType === 'color' ? (
                                                <input type="color" value={current || '#3498db'} onChange={e => updateNodeData(selectedNode.id, field.key, e.target.value)} onBlur={commitNodeData} style={{ width: '100%', height: 28, background: '#000', border: `1px solid ${THEME.border}` }} />
                                            ) : inputType === 'dropdown' ? (
                                                <select
                                                    value={String(current)}
                                                    onChange={e => updateNodeData(selectedNode.id, field.key, e.target.value, true)}
                                                    style={{ width: '100%', background: '#000', border: `1px solid ${THEME.border}`, color: THEME.textMain, fontFamily: 'inherit', fontSize: 14, padding: '5px 6px', boxShadow: THEME.retroIn }}
                                                >
                                                    <option value="">-- Select --</option>
                                                    {dropdownOptions.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type={inputType === 'number' ? 'number' : 'text'}
                                                    value={current}
                                                    onChange={e => updateNodeData(selectedNode.id, field.key, inputType === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                                                    onBlur={() => {
                                                        if (inputType === 'number' && (selectedNode.data[field.key] === '' || Number.isNaN(selectedNode.data[field.key]))) {
                                                            updateNodeData(selectedNode.id, field.key, typeof defaultVal === 'number' ? defaultVal : 0, true);
                                                        } else {
                                                            commitNodeData();
                                                        }
                                                    }}
                                                    style={{ width: '100%', background: '#000', border: `1px solid ${THEME.border}`, color: THEME.textMain, fontFamily: 'inherit', fontSize: 14, padding: '5px 6px', boxShadow: THEME.retroIn }}
                                                />
                                            )}
                                        </div>
                                    );
                                })}

                                <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${THEME.borderMute}` }}>
                                    <div style={{ fontSize: 12, color: THEME.textMute, marginBottom: 6 }}>PORTS</div>
                                    {(selectedDef.inputs ?? []).map(p => (
                                        <div key={p.id} style={{ fontSize: 12, color: THEME.textDim, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                            <div style={{ width: 8, height: 8, background: PORT_COLORS[p.type], borderRadius: '50%' }} /> IN &middot; {p.name || p.id} ({p.type})
                                        </div>
                                    ))}
                                    {(selectedDef.outputs ?? []).map(p => (
                                        <div key={p.id} style={{ fontSize: 12, color: THEME.textDim, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                            <div style={{ width: 8, height: 8, background: PORT_COLORS[p.type], borderRadius: '50%' }} /> OUT &middot; {p.name || p.id} ({p.type})
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* STATUS BAR */}
            <div style={{ height: 22, background: '#000', borderTop: `1px solid ${THEME.borderMute}`, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 12, color: THEME.textMute, gap: 16 }}>
                <span style={{ color: THEME.ok }}>&#9679; LOGIC EDITOR ACTIVE</span>
                <span>SELECTED: {selected.size}</span>
                <span>POS: {Math.round(mousePos.x)}, {Math.round(mousePos.y)}</span>
                <span>ZOOM: {Math.round(zoom * 100)}%</span>
                <div style={{ flexGrow: 1 }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Layers size={11} /> {scriptName}</span>
            </div>
        </div>
    );
};

export default AlgorithmEditor;
