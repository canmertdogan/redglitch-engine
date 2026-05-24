import React, { useState, useEffect, useRef } from 'react';
import { useStudio } from '../hooks/useStudio';
import { 
    Zap, Play, Save, Plus, Trash2, Box, ArrowRight, Settings, 
    Layers, Database, Cpu, Activity 
} from 'lucide-react';

interface Node {
    id: string;
    type: string;
    x: number;
    y: number;
    title: string;
    data: any;
}

interface Connection {
    id: string;
    fromId: string;
    toId: string;
}

const AlgorithmEditor: React.FC = () => {
    const { isReady } = useStudio();
    const [nodes, setNodes] = useState<Node[]>([]);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [dragOffset, setDraggingOffset] = useState({ x: 0, y: 0 });
    const graphRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isReady) {
            loadAlgorithm();
        }
    }, [isReady]);

    const loadAlgorithm = async () => {
        try {
            // Simplified fetch for demo
            const res = await fetch('/api/algorithms/default');
            if (res.ok) {
                const data = await res.json();
                setNodes(data.nodes || []);
                setConnections(data.connections || []);
            } else {
                setNodes([
                    { id: 'start', type: 'trigger', x: 100, y: 100, title: 'ON_START', data: {} },
                    { id: 'move', type: 'action', x: 350, y: 150, title: 'MOVE_ENTITY', data: { speed: 100 } }
                ]);
                setConnections([{ id: 'c1', fromId: 'start', toId: 'move' }]);
            }
        } catch (e) {
            console.error("Failed to load algorithm", e);
        }
    };

    const addNode = (type: string, title: string) => {
        const newNode: Node = {
            id: 'node_' + Date.now(),
            type,
            x: 200,
            y: 200,
            title,
            data: {}
        };
        setNodes([...nodes, newNode]);
    };

    const handleNodeMouseDown = (id: string, e: React.MouseEvent) => {
        const node = nodes.find(n => n.id === id);
        if (node) {
            setDraggingNodeId(id);
            setDraggingOffset({ x: e.clientX - node.x, y: e.clientY - node.y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (draggingNodeId) {
            setNodes(prev => prev.map(n => 
                n.id === draggingNodeId 
                ? { ...n, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } 
                : n
            ));
        }
    };

    const handleMouseUp = () => {
        setDraggingNodeId(null);
    };

    if (!isReady) return <div style={{ color: 'var(--accent)', padding: '20px' }}>BOOTING LOGIC ENGINE...</div>;

    return (
        <div 
            style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#050505' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* MENUBAR */}
            <div id="menubar" style={{ height: '32px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 15px' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '20px', letterSpacing: '2px' }}>
                    <Zap size={16} style={{ marginRight: '8px', display: 'inline' }} /> NODE LOGIC v2.0
                </div>
                <div className="menu-item">Project</div>
                <div className="menu-item">View</div>
            </div>

            {/* TOOLBAR */}
            <div id="toolbar" style={{ height: '44px', background: '#000', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '8px' }}>
                <button className="tool-btn" title="Save"><Save size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" onClick={() => addNode('trigger', 'NEW_TRIGGER')} title="Add Trigger"><Activity size={16} /></button>
                <button className="tool-btn" onClick={() => addNode('action', 'NEW_ACTION')} title="Add Action"><Cpu size={16} /></button>
                <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                <button className="tool-btn" style={{ color: '#2ecc71' }} title="Test Logic"><Play size={16} /></button>
            </div>

            <div style={{ flexGrow: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
                {/* NODE PALETTE (Floating) */}
                <div style={{ 
                    position: 'absolute', top: '20px', left: '20px', width: '200px', 
                    background: 'rgba(10, 10, 15, 0.95)', border: '1px solid #1f2b42', 
                    padding: '15px', zIndex: 10, borderRadius: '4px' 
                }}>
                    <div style={{ fontSize: '0.8rem', color: '#444', textTransform: 'uppercase', marginBottom: '10px' }}>Palette</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="tool-btn" style={{ width: '100%', justifyContent: 'flex-start', padding: '0 10px', fontSize: '0.85rem' }} onClick={() => addNode('trigger', 'ON_COLLIDE')}>
                            <Activity size={14} style={{ marginRight: '8px' }} /> ON_COLLIDE
                        </div>
                        <div className="tool-btn" style={{ width: '100%', justifyContent: 'flex-start', padding: '0 10px', fontSize: '0.85rem' }} onClick={() => addNode('action', 'PLAY_SOUND')}>
                            <Zap size={14} style={{ marginRight: '8px' }} /> PLAY_SOUND
                        </div>
                        <div className="tool-btn" style={{ width: '100%', justifyContent: 'flex-start', padding: '0 10px', fontSize: '0.85rem' }} onClick={() => addNode('action', 'SPAWM_FX')}>
                            <Box size={14} style={{ marginRight: '8px' }} /> SPAWN_FX
                        </div>
                    </div>
                </div>

                {/* GRAPH AREA */}
                <div 
                    ref={graphRef}
                    style={{ 
                        flexGrow: 1, position: 'relative', 
                        backgroundImage: 'radial-gradient(#222 1px, transparent 1px)', 
                        backgroundSize: '30px 30px',
                        overflow: 'hidden'
                    }}
                >
                    {/* SVG CONNECTIONS */}
                    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                        <defs>
                            <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
                            </marker>
                        </defs>
                        {connections.map(c => {
                            const from = nodes.find(n => n.id === c.fromId);
                            const to = nodes.find(n => n.id === c.toId);
                            if (!from || !to) return null;
                            
                            const x1 = from.x + 180;
                            const y1 = from.y + 40;
                            const x2 = to.x;
                            const y2 = to.y + 40;
                            
                            const dx = Math.abs(x1 - x2) / 2;
                            const path = `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
                            
                            return (
                                <path 
                                    key={c.id} 
                                    d={path} 
                                    stroke="var(--accent)" 
                                    strokeWidth="2" 
                                    fill="none" 
                                    markerEnd="url(#arrow)" 
                                />
                            );
                        })}
                    </svg>

                    {/* NODES */}
                    {nodes.map(node => (
                        <div 
                            key={node.id}
                            onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                            style={{
                                position: 'absolute', left: node.x, top: node.y,
                                width: '180px', background: '#0a0a0f', border: '1px solid #333',
                                borderRadius: '4px', cursor: 'grab', userSelect: 'none',
                                boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
                                zIndex: draggingNodeId === node.id ? 100 : 1
                            }}
                        >
                            <div style={{ 
                                background: node.type === 'trigger' ? '#2ecc71' : '#3498db', 
                                padding: '5px 10px', fontSize: '0.8rem', fontWeight: 'bold', 
                                color: '#000', borderRadius: '3px 3px 0 0', display: 'flex', justifyContent: 'space-between'
                            }}>
                                {node.type.toUpperCase()}
                                <Trash2 size={12} style={{ cursor: 'pointer' }} onClick={() => setNodes(nodes.filter(n => n.id !== node.id))} />
                            </div>
                            <div style={{ padding: '10px' }}>
                                <div style={{ color: 'var(--accent)', fontSize: '0.9rem', marginBottom: '8px' }}>{node.title}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ width: '8px', height: '8px', background: '#444', borderRadius: '50%' }} />
                                    <ArrowRight size={14} color="#444" />
                                    <div style={{ width: '8px', height: '8px', background: '#444', borderRadius: '50%' }} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* PROPERTY INSPECTOR */}
                <div className="panel" style={{ width: '280px', borderLeft: '1px solid #1f2b42', borderRight: 'none' }}>
                    <div className="panel-header"><Settings size={14} /> INSPECTOR</div>
                    <div className="panel-content">
                        <div style={{ color: '#444', textAlign: 'center', marginTop: '20px' }}>
                            SELECT A NODE TO VIEW PROPERTIES
                        </div>
                    </div>
                </div>
            </div>

            {/* STATUS BAR */}
            <footer style={{ height: '22px', background: '#000', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '0.75rem', color: '#444' }}>
                <span style={{ color: '#2ecc71', marginRight: '15px' }}>● LOGIC RUNTIME ACTIVE</span>
                <span>NODES: {nodes.length}</span>
                <span style={{ marginLeft: '15px' }}>CONNECTIONS: {connections.length}</span>
            </footer>
        </div>
    );
};

export default AlgorithmEditor;
