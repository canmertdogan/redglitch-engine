import { useEffect, useRef, useState } from 'react';
import type { Level, EntityDesignResult } from '../api';

const ENGINE_TYPES_3D = ['fps-3d', 'topdown-3d', 'platformer-3d'];
const WORLD_UNIT_3D = 4;

// Placement entities are {type,x,y} (phase 5); the merged build uses
// {type,position} (3D projection). Both must render, so accept either shape.
type AnyEntity = { type: string; x?: number; y?: number; position?: number[] };

const PALETTE = {
    floor: '#1c1010',
    wall: '#ff2d4d',
    grid: 'rgba(255,45,77,0.10)',
    spawn: '#2ee6a0',
    exit: '#ffb020',
    hover: 'rgba(255,84,112,0.25)',
    text: '#f5eeee',
    selected: '#ffffff',
};

const CATEGORY_COLORS: Record<string, string> = {
    enemy: '#ff3b5c',
    npc: '#2ee6a0',
    item: '#ffb020',
};

interface Props {
    engineType: string;
    level: Level;
    entities?: AnyEntity[];
    entityDesign?: EntityDesignResult | null;
    editable?: boolean;
    placeType?: string;
    selectedIndex?: number | null;
    onPlace?: (x: number, y: number) => void;
    onSelect?: (index: number) => void;
    onMove?: (index: number, x: number, y: number) => void;
    onRemove?: (index: number) => void;
}

function categoryFor(id: string, entityDesign: EntityDesignResult | null): string {
    return entityDesign?.entities.find((d) => d.id === id)?.category || 'item';
}

function heatColor(t: number): string {
    // dark -> accent ramp (0 = low, 1 = high)
    const r = Math.round(255 * Math.min(1, 0.1 + t));
    const g = Math.round(20 + 30 * t);
    const b = Math.round(40 - 30 * t);
    return `rgb(${r},${g},${b})`;
}

export default function LevelMapEditor({
    engineType, level, entities = [], entityDesign = null,
    editable = false, placeType, selectedIndex = null,
    onPlace, onSelect, onMove, onRemove,
}: Props) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [wrapWidth, setWrapWidth] = useState(0);
    const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
    const is3D = ENGINE_TYPES_3D.includes(engineType);

    useEffect(() => {
        if (!wrapRef.current) return;
        const update = () => setWrapWidth(wrapRef.current?.clientWidth || 0);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(wrapRef.current);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !level.width || !level.height) return;
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(wrapWidth, 160);
        const height = is3D ? 320 : 360;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const gridW = level.width;
        const gridH = level.height;
        const cell = Math.max(6, Math.floor(Math.min((width - 16) / gridW, (height - 16) / gridH)));
        const ox = Math.floor((width - cell * gridW) / 2);
        const oy = Math.floor((height - cell * gridH) / 2);

        const collision = level.collision as number[] | undefined;

        if (is3D) {
            // Heightmap heatmap — no tilemap in 3D. Reuse a grid of cells
            // sized to the terrain grid.
            const heights = (level.terrain as { heightMap?: number[] } | undefined)?.heightMap || [];
            let min = Infinity, max = -Infinity;
            for (const h of heights) {
                if (h < min) min = h;
                if (h > max) max = h;
            }
            const span = max - min || 1;
            for (let gy = 0; gy < gridH; gy++) {
                for (let gx = 0; gx < gridW; gx++) {
                    const h = heights[gy * gridW + gx];
                    ctx.fillStyle = heatColor(((h ?? 0) - min) / span);
                    ctx.fillRect(ox + gx * cell, oy + gy * cell, cell, cell);
                    ctx.strokeStyle = PALETTE.grid;
                    ctx.strokeRect(ox + gx * cell, oy + gy * cell, cell, cell);
                }
            }
            for (const e of entities) {
                const gx = e.position?.[0] !== undefined ? e.position[0] / WORLD_UNIT_3D : (e.x ?? 0);
                const gz = e.position?.[2] !== undefined ? e.position[2] / WORLD_UNIT_3D : (e.y ?? 0);
                const px = ox + gx * cell + cell / 2;
                const py = oy + gz * cell + cell / 2;
                drawEntityMark(ctx, px, py, cell, e.type, categoryFor(e.type, entityDesign));
            }
            return;
        }

        const solid = (x: number, y: number) => {
            if (x < 0 || x >= gridW || y < 0 || y >= gridH) return true;
            const idx = y * gridW + x;
            if (collision && Array.isArray(collision)) return collision[idx] === 1;
            const layer = level.layers?.[0];
            return !layer || layer[idx] === 1;
        };

        for (let gy = 0; gy < gridH; gy++) {
            for (let gx = 0; gx < gridW; gx++) {
                ctx.fillStyle = solid(gx, gy) ? PALETTE.wall : PALETTE.floor;
                ctx.fillRect(ox + gx * cell, oy + gy * cell, cell, cell);
                ctx.strokeStyle = PALETTE.grid;
                ctx.strokeRect(ox + gx * cell, oy + gy * cell, cell, cell);
            }
        }

        // Spawn / exit / goal markers
        const mark = (pos: { x: number; y: number } | undefined, label: string, color: string) => {
            if (!pos || pos.x === undefined || pos.y === undefined) return;
            const px = ox + pos.x * cell + cell / 2;
            const py = oy + pos.y * cell + cell / 2;
            drawEntityMark(ctx, px, py, cell, label, color);
        };
        mark(level.spawn as { x: number; y: number } | undefined, 'S', PALETTE.spawn);
        mark(level.spawn, 'S', PALETTE.spawn);
        mark(level.exit, 'E', PALETTE.exit);
        mark(level.goal, 'G', PALETTE.exit);

        // Placed entities
        for (let i = 0; i < entities.length; i++) {
            const e = entities[i];
            if (e.x === undefined || e.y === undefined) continue;
            const px = ox + e.x * cell + cell / 2;
            const py = oy + e.y * cell + cell / 2;
            drawEntityMark(ctx, px, py, cell, e.type, categoryFor(e.type, entityDesign), i === selectedIndex);
        }

        // Hover highlight (editable mode)
        if (hover) {
            ctx.fillStyle = PALETTE.hover;
            ctx.fillRect(ox + hover.x * cell, oy + hover.y * cell, cell, cell);
        }

        // Legend
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = PALETTE.text;
        ctx.fillText(`S=başlangıç  E/G=çıkış  ${editable ? 'tıkla: yerleştir/taşı' : ''}`, 10, height - 4);
    }, [level, entities, entityDesign, editable, hover, selectedIndex, wrapWidth, is3D]);

    function cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
        const canvas = canvasRef.current;
        if (!canvas || !level.width || !level.height) return null;
        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const gridW = level.width;
        const gridH = level.height;
        const cell = Math.max(6, Math.floor(Math.min((width - 16) / gridW, (height - 16) / gridH)));
        const ox = Math.floor((width - cell * gridW) / 2);
        const oy = Math.floor((height - cell * gridH) / 2);
        const x = Math.floor((clientX - rect.left - ox) / cell);
        const y = Math.floor((clientY - rect.top - oy) / cell);
        if (x < 0 || x >= gridW || y < 0 || y >= gridH) return null;
        return { x, y };
    }

    function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
        if (!editable) return;
        const cell = cellAt(e.clientX, e.clientY);
        if (!cell) return;
        const idx = entities.findIndex((en) => en.x === cell.x && en.y === cell.y);
        if (idx >= 0) {
            onSelect?.(idx);
            return;
        }
        if (selectedIndex !== null && selectedIndex !== undefined) {
            onMove?.(selectedIndex, cell.x, cell.y);
            onSelect?.(selectedIndex);
            return;
        }
        if (placeType) onPlace?.(cell.x, cell.y);
    }

    return (
        <div className="map-editor" ref={wrapRef}>
            <canvas
                ref={canvasRef}
                onClick={handleClick}
                onMouseMove={(e) => editable && setHover(cellAt(e.clientX, e.clientY))}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: editable ? (placeType || selectedIndex !== null ? 'crosshair' : 'pointer') : 'default' }}
            />
            {editable && onRemove && selectedIndex !== null && selectedIndex !== undefined && (
                <div className="map-editor-toolbar">
                    <span className="field-hint" style={{ margin: 0 }}>
                        Seçili: {entities[selectedIndex]?.type || '?'} ({entities[selectedIndex]?.x}, {entities[selectedIndex]?.y})
                    </span>
                    <button className="secondary" onClick={() => onRemove(selectedIndex)}>Seçileni Kaldır ✕</button>
                </div>
            )}
        </div>
    );
}

function drawEntityMark(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    cell: number,
    label: string,
    color: string,
    selected = false,
) {
    const r = Math.max(3, cell * 0.34);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (selected) {
        ctx.strokeStyle = PALETTE.selected;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    ctx.fillStyle = '#000';
    ctx.font = `${Math.max(7, Math.floor(cell * 0.4))}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.slice(0, 2).toUpperCase(), px, py);
    ctx.textAlign = 'start';
}
