/**
 * Pathfinding3D.js — Phase 15
 * NavMesh A* pathfinding with funnel (string-pulling) smoothing and
 * ORCA multi-unit collision avoidance for the topdown-3d engine.
 *
 * NavMesh data format (stored in level JSON under `navmesh`):
 *   { vertices: Float32Array | number[],   // flat [x,y,z, x,y,z, ...]
 *     indices:  Uint16Array  | number[],   // triangle indices (triplets)
 *     areas:    Uint8Array   | number[] }  // area type per triangle (0=walk, 1=water, 2=blocked)
 *
 * Usage:
 *   const pf = new Pathfinding3D(scene);
 *   pf.buildFromLevel(levelData);                       // or buildFromTerrain()
 *   const path = pf.findPath({x,y,z}, {x,y,z});        // sync, returns Vec3[]
 *   pf.update(dt, agents);                              // ORCA tick
 *   pf.setDebug(true);                                  // show overlay
 *   pf.dispose();
 */

import * as THREE from '../../lib/three/three.module.js';

// ─── Area cost table ──────────────────────────────────────────────────────────
export const AreaType = Object.freeze({
    WALK:    0,
    WATER:   1,
    BLOCKED: 2,
});

const AREA_COST = [1.0, 2.5, Infinity]; // cost multiplier per AreaType

// ─── Vec2 helpers (XZ plane) ─────────────────────────────────────────────────
function v2(x, z) { return { x, z }; }
function v2sub(a, b) { return v2(a.x - b.x, a.z - b.z); }
function v2add(a, b) { return v2(a.x + b.x, a.z + b.z); }
function v2scale(v, s) { return v2(v.x * s, v.z * s); }
function v2dot(a, b) { return a.x * b.x + a.z * b.z; }
function v2cross(a, b) { return a.x * b.z - a.z * b.x; }
function v2len(v) { return Math.sqrt(v.x * v.x + v.z * v.z); }
function v2norm(v) { const l = v2len(v) || 1e-9; return v2(v.x / l, v.z / l); }
function v2lerp(a, b, t) { return v2(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t); }

// ─── Triangle helpers ─────────────────────────────────────────────────────────
/** Centroid of a navmesh triangle (XZ). */
function triCentroid(tri) {
    return v2(
        (tri.a.x + tri.b.x + tri.c.x) / 3,
        (tri.a.z + tri.b.z + tri.c.z) / 3,
    );
}

/** True if point p is inside triangle (a,b,c) in XZ. */
function pointInTriangle2D(p, a, b, c) {
    const d1 = v2cross(v2sub(b, a), v2sub(p, a));
    const d2 = v2cross(v2sub(c, b), v2sub(p, b));
    const d3 = v2cross(v2sub(a, c), v2sub(p, c));
    const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(neg && pos);
}

/** Closest point on segment AB to P (XZ). */
function closestPointOnSegment2D(p, a, b) {
    const ab = v2sub(b, a);
    const ap = v2sub(p, a);
    const t  = Math.max(0, Math.min(1, v2dot(ap, ab) / (v2dot(ab, ab) || 1e-9)));
    return v2add(a, v2scale(ab, t));
}

// ─── NavMesh ──────────────────────────────────────────────────────────────────
/**
 * Parsed navmesh: array of NavTri.
 * NavTri = { id, a, b, c (THREE.Vector3), centroid (v2), area, cost,
 *            neighbours: [ { triId, edgeA (v2), edgeB (v2) } ] }
 */
class NavMesh {
    constructor() {
        this.tris = [];     // NavTri[]
        this._triCount = 0;
    }

    /** Build from flat arrays (from level JSON). */
    build(vertices, indices, areas) {
        this.tris = [];
        const n = Math.floor(indices.length / 3);
        for (let i = 0; i < n; i++) {
            const ia = indices[i * 3],
                  ib = indices[i * 3 + 1],
                  ic = indices[i * 3 + 2];
            const a = new THREE.Vector3(vertices[ia*3], vertices[ia*3+1], vertices[ia*3+2]);
            const b = new THREE.Vector3(vertices[ib*3], vertices[ib*3+1], vertices[ib*3+2]);
            const c = new THREE.Vector3(vertices[ic*3], vertices[ic*3+1], vertices[ic*3+2]);
            const area = areas ? (areas[i] ?? 0) : 0;
            this.tris.push({
                id: i, a, b, c,
                centroid: triCentroid({ a, b, c }),
                area,
                cost: AREA_COST[area] ?? 1.0,
                neighbours: [],
            });
        }
        this._triCount = this.tris.length;
        this._buildAdjacency();
    }

    /** Build a flat walkable navmesh from terrain grid (fallback). */
    buildFromGrid(gridW, gridH, cellSize, heightFn) {
        const verts = [];
        const idxArr = [];
        const areaArr = [];
        for (let z = 0; z <= gridH; z++) {
            for (let x = 0; x <= gridW; x++) {
                const wx = x * cellSize;
                const wz = z * cellSize;
                const wy = heightFn(wx, wz);
                verts.push(wx, wy, wz);
            }
        }
        const stride = gridW + 1;
        for (let z = 0; z < gridH; z++) {
            for (let x = 0; x < gridW; x++) {
                const tl = z * stride + x;
                const tr = tl + 1;
                const bl = tl + stride;
                const br = bl + 1;
                idxArr.push(tl, bl, tr);   // tri 0
                idxArr.push(tr, bl, br);   // tri 1
                areaArr.push(0, 0);
            }
        }
        this.build(verts, idxArr, areaArr);
    }

    /** Build shared-edge adjacency list. O(n²) but navmeshes are small. */
    _buildAdjacency() {
        const { tris } = this;
        const edges = (tri) => [
            [tri.a, tri.b],
            [tri.b, tri.c],
            [tri.c, tri.a],
        ];
        for (let i = 0; i < tris.length; i++) {
            for (let j = i + 1; j < tris.length; j++) {
                const edgesI = edges(tris[i]);
                const edgesJ = edges(tris[j]);
                for (const [ai, bi] of edgesI) {
                    for (const [aj, bj] of edgesJ) {
                        if (this._edgesMatch(ai, bi, aj, bj)) {
                            // shared edge — store portal verts in XZ
                            const portal = {
                                triId: tris[j].id,
                                edgeA: v2(ai.x, ai.z),
                                edgeB: v2(bi.x, bi.z),
                            };
                            const portalRev = {
                                triId: tris[i].id,
                                edgeA: v2(aj.x, aj.z),
                                edgeB: v2(bj.x, bj.z),
                            };
                            tris[i].neighbours.push(portal);
                            tris[j].neighbours.push(portalRev);
                        }
                    }
                }
            }
        }
    }

    _edgesMatch(a1, b1, a2, b2) {
        const EPS = 0.01;
        const match = (p, q) =>
            Math.abs(p.x - q.x) < EPS && Math.abs(p.z - q.z) < EPS;
        return (match(a1, a2) && match(b1, b2)) ||
               (match(a1, b2) && match(b1, a2));
    }

    /** Return the triangle id that contains point (XZ), or -1. */
    findTriangle(wx, wz) {
        const p = v2(wx, wz);
        for (const tri of this.tris) {
            if (tri.area === AreaType.BLOCKED) continue;
            if (pointInTriangle2D(p, v2(tri.a.x, tri.a.z), v2(tri.b.x, tri.b.z), v2(tri.c.x, tri.c.z))) {
                return tri.id;
            }
        }
        return -1;
    }

    /** Interpolate Y at XZ position inside triId. */
    sampleY(wx, wz, triId) {
        if (triId < 0 || triId >= this.tris.length) return 0;
        const tri = this.tris[triId];
        // Barycentric interpolation
        const v0 = new THREE.Vector3().subVectors(tri.b, tri.a);
        const v1 = new THREE.Vector3().subVectors(tri.c, tri.a);
        const v2v = new THREE.Vector3(wx - tri.a.x, 0, wz - tri.a.z);
        const d00 = v0.dot(v0), d01 = v0.dot(v1), d11 = v1.dot(v1);
        const d20 = v2v.dot(v0), d21 = v2v.dot(v1);
        const denom = d00 * d11 - d01 * d01 || 1e-9;
        const v = (d11 * d20 - d01 * d21) / denom;
        const w = (d00 * d21 - d01 * d20) / denom;
        const u = 1 - v - w;
        return u * tri.a.y + v * tri.b.y + w * tri.c.y;
    }
}

// ─── A* on NavMesh ────────────────────────────────────────────────────────────
function astar(navmesh, startTriId, endTriId) {
    if (startTriId === endTriId) return [startTriId];
    if (startTriId < 0 || endTriId < 0) return null;

    const tris = navmesh.tris;
    const endCen = tris[endTriId].centroid;

    const open  = new Map(); // triId → { g, f, parent }
    const closed = new Set();

    const heuristic = (id) => {
        const c = tris[id].centroid;
        return Math.sqrt((c.x - endCen.x) ** 2 + (c.z - endCen.z) ** 2);
    };

    open.set(startTriId, { g: 0, f: heuristic(startTriId), parent: -1 });

    while (open.size > 0) {
        // Pop lowest f
        let curId = -1, curNode = null;
        for (const [id, node] of open) {
            if (curId === -1 || node.f < curNode.f) { curId = id; curNode = node; }
        }
        open.delete(curId);
        closed.add(curId);

        if (curId === endTriId) {
            // Reconstruct
            const path = [];
            let id = curId;
            const parents = new Map();
            // Re-run to collect parents
            // (stored in open remnants — rebuild via closed trace)
            // Simpler: store in a separate map during search
            // We stored parent in `curNode` — need a parents map
            // Patch: store all nodes in a combined map
            return path; // handled below via allNodes
        }

        const tri = tris[curId];
        for (const nb of tri.neighbours) {
            const nbTri = tris[nb.triId];
            if (nbTri.area === AreaType.BLOCKED) continue;
            if (closed.has(nb.triId)) continue;
            const edgeMid = v2lerp(nb.edgeA, nb.edgeB, 0.5);
            const dist = Math.sqrt((edgeMid.x - tri.centroid.x) ** 2 + (edgeMid.z - tri.centroid.z) ** 2);
            const g = curNode.g + dist * nbTri.cost;
            const existing = open.get(nb.triId);
            if (!existing || g < existing.g) {
                open.set(nb.triId, { g, f: g + heuristic(nb.triId), parent: curId });
            }
        }
    }
    return null;
}

/**
 * Full A* that tracks parent pointers correctly.
 */
function findTriPath(navmesh, startTriId, endTriId) {
    if (startTriId < 0 || endTriId < 0) return null;
    if (startTriId === endTriId) return [startTriId];

    const tris = navmesh.tris;
    const endCen = tris[endTriId].centroid;
    const heuristic = (id) => {
        const c = tris[id].centroid;
        return Math.sqrt((c.x - endCen.x) ** 2 + (c.z - endCen.z) ** 2);
    };

    const allNodes = new Map(); // triId → { g, f, parent }
    const open  = new Set();
    const closed = new Set();

    allNodes.set(startTriId, { g: 0, f: heuristic(startTriId), parent: -1 });
    open.add(startTriId);

    while (open.size > 0) {
        let curId = -1;
        let curF  = Infinity;
        for (const id of open) {
            const f = allNodes.get(id).f;
            if (f < curF) { curF = f; curId = id; }
        }
        open.delete(curId);
        closed.add(curId);

        if (curId === endTriId) {
            const path = [];
            let id = curId;
            while (id !== -1) {
                path.unshift(id);
                id = allNodes.get(id).parent;
            }
            return path;
        }

        const tri = tris[curId];
        const curG = allNodes.get(curId).g;
        for (const nb of tri.neighbours) {
            const nbTri = tris[nb.triId];
            if (nbTri.area === AreaType.BLOCKED) continue;
            if (closed.has(nb.triId)) continue;
            const edgeMid = v2lerp(nb.edgeA, nb.edgeB, 0.5);
            const dx = edgeMid.x - tri.centroid.x;
            const dz = edgeMid.z - tri.centroid.z;
            const g = curG + Math.sqrt(dx*dx + dz*dz) * nbTri.cost;
            const existing = allNodes.get(nb.triId);
            if (!existing || g < existing.g) {
                allNodes.set(nb.triId, { g, f: g + heuristic(nb.triId), parent: curId });
                open.add(nb.triId);
            }
        }
    }
    return null; // no path
}

// ─── Funnel / String-pulling ──────────────────────────────────────────────────
/**
 * Simple funnel algorithm over a triangle corridor.
 * Returns smoothed Vec3 waypoints.
 */
function funnelSmooth(navmesh, triPath, startPt, endPt) {
    const tris = navmesh.tris;
    if (triPath.length === 1) {
        return [
            new THREE.Vector3(startPt.x, navmesh.sampleY(startPt.x, startPt.z, triPath[0]), startPt.z),
            new THREE.Vector3(endPt.x,   navmesh.sampleY(endPt.x,   endPt.z,   triPath[triPath.length-1]), endPt.z),
        ];
    }

    // Build portal list (each portal = left/right vertex of shared edge)
    const portals = [];
    portals.push({ left: v2(startPt.x, startPt.z), right: v2(startPt.x, startPt.z) });

    for (let i = 0; i < triPath.length - 1; i++) {
        const curTri = tris[triPath[i]];
        const nb = curTri.neighbours.find(n => n.triId === triPath[i + 1]);
        if (!nb) continue;
        // Determine left/right relative to path direction
        const dir = v2sub(tris[triPath[i+1]].centroid, curTri.centroid);
        const cross = v2cross(dir, v2sub(nb.edgeB, nb.edgeA));
        if (cross >= 0) {
            portals.push({ left: nb.edgeA, right: nb.edgeB });
        } else {
            portals.push({ left: nb.edgeB, right: nb.edgeA });
        }
    }
    portals.push({ left: v2(endPt.x, endPt.z), right: v2(endPt.x, endPt.z) });

    // Funnel walk
    const path2d = [v2(startPt.x, startPt.z)];
    let apexIdx  = 0;
    let leftIdx  = 0, rightIdx = 0;
    let apex   = portals[0].left;
    let left   = portals[0].left;
    let right  = portals[0].right;

    for (let i = 1; i < portals.length; i++) {
        const pLeft  = portals[i].left;
        const pRight = portals[i].right;

        // Update right
        if (v2cross(v2sub(pRight, apex), v2sub(right, apex)) >= 0) {
            if (v2cross(v2sub(pRight, apex), v2sub(left, apex)) < 0) {
                // Over left — add left as waypoint and restart
                path2d.push(left);
                apex = left; apexIdx = leftIdx;
                left = apex; right = apex;
                leftIdx = apexIdx; rightIdx = apexIdx;
                i = apexIdx;
                continue;
            }
            right = pRight; rightIdx = i;
        }
        // Update left
        if (v2cross(v2sub(pLeft, apex), v2sub(left, apex)) <= 0) {
            if (v2cross(v2sub(pLeft, apex), v2sub(right, apex)) > 0) {
                path2d.push(right);
                apex = right; apexIdx = rightIdx;
                left = apex; right = apex;
                leftIdx = apexIdx; rightIdx = apexIdx;
                i = apexIdx;
                continue;
            }
            left = pLeft; leftIdx = i;
        }
    }
    path2d.push(v2(endPt.x, endPt.z));

    // Lift 2D path back to 3D with Y from navmesh
    return path2d.map((p, idx) => {
        const triId = triPath[Math.min(idx, triPath.length - 1)];
        const y = navmesh.sampleY(p.x, p.z, triId);
        return new THREE.Vector3(p.x, y, p.z);
    });
}

// ─── ORCA ─────────────────────────────────────────────────────────────────────
const ORCA_TIME_HORIZON   = 2.0;   // seconds to look ahead
const ORCA_TIME_HORIZON_OBS = 0.5; // wall look-ahead
const ORCA_EPSILON        = 1e-6;

/**
 * Compute ORCA velocity for one agent given all others.
 * @param {Object} agent  { pos(v2), vel(v2), prefVel(v2), radius, maxSpeed }
 * @param {Array}  others Array of same shape
 * @returns {v2} new velocity (clamped to maxSpeed)
 */
function orcaSolve(agent, others) {
    const orcaLines = [];

    for (const other of others) {
        if (other === agent) continue;

        const relPos = v2sub(other.pos, agent.pos);
        const relVel = v2sub(agent.vel, other.vel);
        const combinedR = agent.radius + other.radius;
        const distSq = relPos.x * relPos.x + relPos.z * relPos.z;
        const dist   = Math.sqrt(distSq);

        let u, lineDir;

        if (distSq > combinedR * combinedR) {
            // No collision yet — compute VO
            const invTimeHorizon = 1.0 / ORCA_TIME_HORIZON;
            const w = v2sub(relVel, v2scale(relPos, invTimeHorizon));
            const wLenSq = w.x*w.x + w.z*w.z;
            const dot = v2dot(w, relPos);
            const leg = Math.sqrt(Math.max(0, distSq - combinedR * combinedR));

            if (dot < 0 && dot * dot > combinedR * combinedR * wLenSq) {
                // Project on cut-off circle
                const wLen = Math.sqrt(wLenSq) || ORCA_EPSILON;
                const wUnit = v2(w.x / wLen, w.z / wLen);
                lineDir = v2(wUnit.z, -wUnit.x);
                u = v2scale(wUnit, combinedR * invTimeHorizon - wLen);
            } else {
                // Project on legs
                if (v2cross(relPos, w) > 0) {
                    const sinA = combinedR / dist;
                    const cosA = leg / dist;
                    lineDir = v2(relPos.x * cosA - relPos.z * sinA, relPos.x * sinA + relPos.z * cosA);
                } else {
                    const sinA = combinedR / dist;
                    const cosA = leg / dist;
                    lineDir = v2(-relPos.x * cosA - relPos.z * sinA, relPos.x * sinA - relPos.z * cosA);
                }
                const lineLen = v2len(lineDir) || ORCA_EPSILON;
                lineDir = v2(lineDir.x / lineLen, lineDir.z / lineLen);
                u = v2scale(lineDir, v2dot(relVel, lineDir) - v2dot(v2scale(relPos, invTimeHorizon), lineDir));
            }
        } else {
            // Penetrating — push apart
            const invDT = 1.0 / (1.0 / 60.0);
            const w = v2sub(relVel, v2scale(relPos, invDT));
            const wLen = v2len(w) || ORCA_EPSILON;
            lineDir = v2(w.z / wLen, -w.x / wLen);
            u = v2scale(v2norm(w), combinedR * invDT - wLen);
        }

        orcaLines.push({
            point: v2add(agent.vel, v2scale(u, 0.5)),
            dir:   lineDir,
        });
    }

    // Linear program — find closest velocity to prefVel satisfying all ORCA half-planes
    let newVel = { ...agent.prefVel };
    for (const line of orcaLines) {
        if (v2dot(v2sub(newVel, line.point), v2(line.dir.z, -line.dir.x)) >= 0) continue;
        // Project newVel onto line
        const t = v2dot(v2sub(agent.prefVel, line.point), line.dir);
        const candidate = v2add(line.point, v2scale(line.dir, t));
        // Clamp to maxSpeed disk
        const spd = v2len(candidate);
        if (spd > agent.maxSpeed) {
            newVel = v2scale(v2norm(candidate), agent.maxSpeed);
        } else {
            newVel = candidate;
        }
    }
    const finalSpd = v2len(newVel);
    if (finalSpd > agent.maxSpeed) newVel = v2scale(v2norm(newVel), agent.maxSpeed);
    return newVel;
}

// ─── Pathfinding3D ────────────────────────────────────────────────────────────
export default class Pathfinding3D {
    /**
     * @param {THREE.Scene} scene  — for debug visualisation
     */
    constructor(scene) {
        this._scene   = scene;
        this._navmesh = new NavMesh();
        this._ready   = false;

        // Debug overlay
        this._debugEnabled = false;
        this._debugGroup   = new THREE.Group();
        this._debugGroup.name = 'pathfinding_debug';
        this._debugGroup.visible = false;
        scene.add(this._debugGroup);

        // Path cache: agentId → THREE.Vector3[]
        this._pathCache = new Map();

        // ORCA agent table: agentId → OrcaAgent
        this._orcaAgents = new Map();
    }

    // ── Build ─────────────────────────────────────────────────────────────────
    /** Build navmesh from level JSON data. */
    buildFromLevel(levelData) {
        const nm = levelData?.navmesh;
        if (!nm?.vertices || !nm?.indices) {
            console.warn('[Pathfinding3D] No navmesh in level data — building from flat plane');
            this.buildFlatFallback();
            return;
        }
        this._navmesh.build(nm.vertices, nm.indices, nm.areas);
        this._ready = true;
        if (this._debugEnabled) this._rebuildDebugMesh();
    }

    /** Build navmesh from terrain's sampleHeight function (fallback). */
    buildFromTerrain(terrain, gridW = 32, gridH = 32, cellSize = 2) {
        const heightFn = terrain?.sampleHeight
            ? (x, z) => terrain.sampleHeight(x, z)
            : () => 0;
        this._navmesh.buildFromGrid(gridW, gridH, cellSize, heightFn);
        this._ready = true;
        if (this._debugEnabled) this._rebuildDebugMesh();
    }

    /** Minimal 20×20 flat fallback. */
    buildFlatFallback(size = 40, cellSize = 2) {
        const cells = Math.floor(size / cellSize);
        this._navmesh.buildFromGrid(cells, cells, cellSize, () => 0);
        this._ready = true;
        if (this._debugEnabled) this._rebuildDebugMesh();
    }

    // ── Pathfinding API ───────────────────────────────────────────────────────
    /**
     * Find a smoothed path from `start` to `end` (THREE.Vector3-like).
     * Returns Array<THREE.Vector3> or empty array if no path.
     */
    findPath(start, end) {
        if (!this._ready) return [];

        const startTri = this._navmesh.findTriangle(start.x, start.z);
        let   endTri   = this._navmesh.findTriangle(end.x,   end.z);

        if (startTri < 0) return [];
        if (endTri   < 0) endTri = this._nearestWalkable(end.x, end.z);
        if (endTri   < 0) return [];

        const triPath = findTriPath(this._navmesh, startTri, endTri);
        if (!triPath) return [];

        return funnelSmooth(this._navmesh, triPath, start, end);
    }

    /**
     * Convenience: set a path for an entity by world position.
     * Returns smoothed THREE.Vector3 waypoints.
     */
    requestPath(agentId, startPos, endPos) {
        const path = this.findPath(startPos, endPos);
        this._pathCache.set(agentId, path);
        if (this._debugEnabled && path.length) this._drawDebugPath(agentId, path);
        return path;
    }

    /** Remove cached path for agent. */
    clearPath(agentId) {
        this._pathCache.delete(agentId);
        this._orcaAgents.delete(agentId);
        if (this._debugEnabled) this._clearDebugPath(agentId);
    }

    /** Get current cached path for agent. */
    getPath(agentId) {
        return this._pathCache.get(agentId) ?? [];
    }

    // ── ORCA ──────────────────────────────────────────────────────────────────
    /**
     * Register an agent for ORCA avoidance.
     * @param {string} id
     * @param {Object} opts  { radius=0.5, maxSpeed=5 }
     */
    registerAgent(id, opts = {}) {
        this._orcaAgents.set(id, {
            id,
            pos:      v2(0, 0),
            vel:      v2(0, 0),
            prefVel:  v2(0, 0),
            radius:   opts.radius   ?? 0.5,
            maxSpeed: opts.maxSpeed ?? 5,
        });
    }

    unregisterAgent(id) {
        this._orcaAgents.delete(id);
    }

    /**
     * Update all ORCA agents.
     * @param {number} dt
     * @param {Array}  entities  Array of entity objects with { id, position:{x,y,z}, velocity:{x,z} }
     */
    updateAgents(dt, entities) {
        if (!this._orcaAgents.size) return;

        // Sync positions + preferred velocities from entity data
        for (const ent of entities) {
            const agent = this._orcaAgents.get(ent.id);
            if (!agent) continue;
            agent.pos.x = ent.position.x;
            agent.pos.z = ent.position.z;
            agent.vel.x = ent.velocity?.x ?? 0;
            agent.vel.z = ent.velocity?.z ?? 0;
            // prefVel = direction towards next waypoint
            const path = this._pathCache.get(ent.id);
            if (path && path.length > 0) {
                const target = path[0];
                const dx = target.x - ent.position.x;
                const dz = target.z - ent.position.z;
                const len = Math.sqrt(dx*dx + dz*dz) || ORCA_EPSILON;
                const spd = Math.min(agent.maxSpeed, len / dt);
                agent.prefVel = v2(dx / len * spd, dz / len * spd);
                // Advance waypoint if close enough
                if (len < 0.3) path.shift();
            } else {
                agent.prefVel = v2(0, 0);
            }
        }

        const agentList = [...this._orcaAgents.values()];

        // Compute new velocities
        const newVels = new Map();
        for (const agent of agentList) {
            const nv = orcaSolve(agent, agentList);
            newVels.set(agent.id, nv);
        }

        // Apply
        for (const agent of agentList) {
            const nv = newVels.get(agent.id);
            if (nv) agent.vel = nv;
        }

        // Write back to entity velocity (caller reads agent.vel)
        for (const ent of entities) {
            const agent = this._orcaAgents.get(ent.id);
            if (agent && ent.velocity) {
                ent.velocity.x = agent.vel.x;
                ent.velocity.z = agent.vel.z;
            }
        }
    }

    /** Get current ORCA velocity for an agent. */
    getAgentVelocity(id) {
        const agent = this._orcaAgents.get(id);
        return agent ? { x: agent.vel.x, z: agent.vel.z } : null;
    }

    // ── Debug ─────────────────────────────────────────────────────────────────
    setDebug(enabled) {
        this._debugEnabled = enabled;
        this._debugGroup.visible = enabled;
        if (enabled && this._ready) this._rebuildDebugMesh();
    }

    _rebuildDebugMesh() {
        this._clearDebugGroup();
        const tris = this._navmesh.tris;
        if (!tris.length) return;

        const geo = new THREE.BufferGeometry();
        const positions = [];
        const colors    = [];
        const AREA_COLORS = [
            [0.2, 0.8, 0.2],   // WALK — green
            [0.2, 0.4, 0.9],   // WATER — blue
            [0.8, 0.2, 0.2],   // BLOCKED — red
        ];
        for (const tri of tris) {
            const col = AREA_COLORS[tri.area] ?? AREA_COLORS[0];
            for (const v of [tri.a, tri.b, tri.c]) {
                positions.push(v.x, v.y + 0.05, v.z);
                colors.push(...col);
            }
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
        const mat  = new THREE.MeshBasicMaterial({
            vertexColors: true, side: THREE.DoubleSide,
            transparent: true, opacity: 0.3, depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name  = 'navmesh_overlay';
        this._debugGroup.add(mesh);

        // Wireframe edges
        const wgeo = new THREE.WireframeGeometry(geo);
        const wmat = new THREE.LineBasicMaterial({ color: 0x00ff00, opacity: 0.5, transparent: true });
        const wire = new THREE.LineSegments(wgeo, wmat);
        wire.name  = 'navmesh_wire';
        this._debugGroup.add(wire);
    }

    _drawDebugPath(agentId, path) {
        this._clearDebugPath(agentId);
        if (path.length < 2) return;
        const points = path;
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
        const line = new THREE.Line(geo, mat);
        line.name  = `path_${agentId}`;
        // Lift slightly above navmesh
        line.position.y = 0.1;
        this._debugGroup.add(line);

        // Draw dots at waypoints
        for (let i = 0; i < path.length; i++) {
            const dotGeo = new THREE.SphereGeometry(0.12, 4, 4);
            const dotMat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0x00ff00 : 0xffaa00 });
            const dot    = new THREE.Mesh(dotGeo, dotMat);
            dot.position.copy(path[i]).add(new THREE.Vector3(0, 0.15, 0));
            dot.name = `pathDot_${agentId}_${i}`;
            this._debugGroup.add(dot);
        }
    }

    _clearDebugPath(agentId) {
        const toRemove = this._debugGroup.children.filter(
            c => c.name === `path_${agentId}` || c.name.startsWith(`pathDot_${agentId}_`)
        );
        for (const obj of toRemove) {
            obj.geometry?.dispose();
            obj.material?.dispose();
            this._debugGroup.remove(obj);
        }
    }

    _clearDebugGroup() {
        while (this._debugGroup.children.length) {
            const c = this._debugGroup.children[0];
            c.geometry?.dispose();
            c.material?.dispose();
            this._debugGroup.remove(c);
        }
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    _nearestWalkable(wx, wz) {
        let best = -1, bestDist = Infinity;
        for (const tri of this._navmesh.tris) {
            if (tri.area === AreaType.BLOCKED) continue;
            const dx = tri.centroid.x - wx;
            const dz = tri.centroid.z - wz;
            const d  = dx*dx + dz*dz;
            if (d < bestDist) { bestDist = d; best = tri.id; }
        }
        return best;
    }

    /** True if a point (XZ) lies on any walkable navmesh triangle. */
    isWalkable(wx, wz) {
        const id = this._navmesh.findTriangle(wx, wz);
        return id >= 0 && this._navmesh.tris[id]?.area !== AreaType.BLOCKED;
    }

    /** Clamp a world position to the nearest walkable navmesh point. */
    clampToNavMesh(wx, wz) {
        if (this.isWalkable(wx, wz)) return { x: wx, z: wz };
        // Find nearest edge point across all triangles
        let best = { x: wx, z: wz }, bestDist = Infinity;
        for (const tri of this._navmesh.tris) {
            if (tri.area === AreaType.BLOCKED) continue;
            const edges = [
                [v2(tri.a.x, tri.a.z), v2(tri.b.x, tri.b.z)],
                [v2(tri.b.x, tri.b.z), v2(tri.c.x, tri.c.z)],
                [v2(tri.c.x, tri.c.z), v2(tri.a.x, tri.a.z)],
            ];
            for (const [ea, eb] of edges) {
                const cp  = closestPointOnSegment2D(v2(wx, wz), ea, eb);
                const dx  = cp.x - wx;
                const dz  = cp.z - wz;
                const d   = dx*dx + dz*dz;
                if (d < bestDist) { bestDist = d; best = cp; }
            }
        }
        return best;
    }

    get isReady() { return this._ready; }

    get navmeshTriCount() { return this._navmesh.tris.length; }

    // ── Dispose ───────────────────────────────────────────────────────────────
    dispose() {
        this._clearDebugGroup();
        this._scene.remove(this._debugGroup);
        this._pathCache.clear();
        this._orcaAgents.clear();
        this._navmesh.tris = [];
        this._ready = false;
    }
}
