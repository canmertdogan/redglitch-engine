/**
 * REDGLITCH ENGINE — PREFAB BUILDER v5.0
 * Phases A–E: all plan items implemented.
 */
'use strict';

// ─── Integration globals ──────────────────────────────────────────────
let eventBus, projectState, assetManager;
function initIntegration() {
    eventBus     = window.RedGlitchEventBus;
    projectState = window.RedGlitchProjectState;
    assetManager = window.RedGlitchAssetManager;
    if (eventBus) {
        eventBus.on('asset:sprite:*', () => editor?.refreshSprites());
        console.log('[PrefabEditor v5] EventBus connected');
    }
}

// ─── Component metadata ───────────────────────────────────────────────
const COMP_META = {
    Transform:  { icon: 'fa-arrows-alt',    singleton: true  },
    Stats:      { icon: 'fa-heart',         singleton: true  },
    Collider:   { icon: 'fa-vector-square', singleton: true  },
    Animation:  { icon: 'fa-film',          singleton: true  },
    Script:     { icon: 'fa-code',          singleton: false },
    Behavior:   { icon: 'fa-brain',         singleton: false },
    Light:      { icon: 'fa-sun',           singleton: false },
    Loot:       { icon: 'fa-coins',         singleton: false },
    Particle:   { icon: 'fa-atom',          singleton: false },
    Prefab:     { icon: 'fa-cubes',         singleton: false },
};

const PARTICLE_SYSTEMS = ['fire','sparks','smoke','rain','blood','magic','dust','snow','explosion','heal'];
const BEHAVIOR_SCRIPTS = ['patrol','chase','idle','flee','guard','wander','roam'];
const LAYERS = ['entities','props','background','foreground','ui','fx','hazards'];

// ─── Prefab templates ─────────────────────────────────────────────────
const PREFAB_TEMPLATES = {
    'Player': {
        sprite: 'player', tags: ['player','controllable'], layer: 'entities',
        components: [
            { type: 'Transform', x:0, y:0, scale:3 },
            { type: 'Stats', hp:100, maxHp:100, damage:10, speed:80, xpValue:0 },
            { type: 'Collider', width:14, height:14, offsetX:0, offsetY:0, isTrigger:false },
            { type: 'Script', scriptId:'player_controller', onDeath:'respawn', onSpawn:'' },
            { type: 'Animation', set:'idle', fps:8, loop:true },
        ]
    },
    'Enemy': {
        sprite: 'skeleton', tags: ['enemy','npc'], layer: 'entities',
        components: [
            { type: 'Transform', x:0, y:0, scale:3 },
            { type: 'Stats', hp:40, maxHp:40, damage:8, speed:40, xpValue:20 },
            { type: 'Collider', width:12, height:14, offsetX:0, offsetY:0, isTrigger:false },
            { type: 'Loot', table:'common', chance:0.6, goldMin:0, goldMax:5 },
            { type: 'Behavior', aiScript:'patrol', detectionRange:80 },
        ]
    },
    'Chest': {
        sprite: 'chest_closed', tags: ['interactable'], layer: 'props',
        components: [
            { type: 'Transform', x:0, y:0, scale:3 },
            { type: 'Collider', width:16, height:12, offsetX:0, offsetY:2, isTrigger:true },
            { type: 'Loot', table:'treasure', chance:1.0, goldMin:5, goldMax:25 },
        ]
    },
    'Torch': {
        sprite: 'torch', tags: ['prop','light_source'], layer: 'props',
        components: [
            { type: 'Transform', x:0, y:0, scale:3 },
            { type: 'Light', radius:80, color:'#ff8833', intensity:0.9, pulse:true },
            { type: 'Particle', system:'fire', active:true, offset:{x:0,y:-8} },
        ]
    },
    'Static Prop': {
        sprite: 'barrel', tags: ['prop'], layer: 'props',
        components: [
            { type: 'Transform', x:0, y:0, scale:3 },
            { type: 'Collider', width:12, height:12, offsetX:0, offsetY:0, isTrigger:false },
        ]
    },
};

// ─── Default component data ───────────────────────────────────────────
function defaultComp(type) {
    switch (type) {
        case 'Transform':  return { x:0, y:0, scale:3 };
        case 'Stats':      return { hp:100, maxHp:100, damage:10, speed:50, xpValue:20 };
        case 'Collider':   return { width:16, height:16, offsetX:0, offsetY:0, isTrigger:false };
        case 'Script':     return { scriptId:'demo', onDeath:'', onSpawn:'' };
        case 'Light':      return { radius:100, color:'#ff6600', intensity:0.8, pulse:false };
        case 'Loot':       return { table:'common', chance:1.0, goldMin:0, goldMax:5 };
        case 'Particle':   return { system:'fire', active:true, offset:{x:0,y:0} };
        case 'Prefab':     return { ref:'', x:0, y:0, scale:1, rotation:0 };
        case 'Animation':  return { set:'idle', fps:8, loop:true };
        case 'Behavior':   return { aiScript:'patrol', detectionRange:60 };
        default: return {};
    }
}

// ─── Main Editor Class ────────────────────────────────────────────────
class PrefabEditor {
    constructor() {
        // Session state
        this.prefabs        = [];
        this.currentIdx     = -1;
        this.selectedComp   = 0;
        this.isDirty        = false;
        this.dirtySet       = new Set();
        this.jsonMode       = false;
        this.mode           = 'select';
        this.showGrid       = true;
        this.snapToGrid     = false;
        this.gridSize       = 16;
        this._refPickCb     = null; // Prefab.ref picker callback

        // Viewport
        this.zoom           = 2.0;
        this.offset         = { x:0, y:0 };
        this.isPanning      = false;
        this.lastMouse      = { x:0, y:0 };
        this.worldCursor    = { x:0, y:0 };

        // Gizmo drag
        this.isDraggingGizmo = false;
        this.gizmoDragStart  = null;

        // Collider resize
        this.isResizingCollider = false;
        this.resizeHandle       = null;
        this.resizeStart        = null;
        this.hoveredHandle      = null;

        // History (debounced)
        this.history        = [];
        this.histIdx        = -1;
        this._debHistTimer  = null;

        // Clipboard
        this.clipboard      = null;

        // Assets
        this.imageCache     = {};
        this.spriteDefs     = {};
        this.prefabCache    = {};
        this.knownSprites   = [];
        this._spriteBrowserCb = null;

        // Timers
        this._msgTimer   = null;
        this._toastTimer = null;

        // DOM
        this.canvas     = document.getElementById('editor-canvas');
        this.ctx        = this.canvas.getContext('2d');
        this.libEl      = document.getElementById('prefab-library');
        this.stackEl    = document.getElementById('modifier-stack');
        this.inspEl     = document.getElementById('inspector-content');
        this.jsonPanel  = document.getElementById('json-panel');
        this.jsonTA     = document.getElementById('json-textarea');
        this.nameInput  = document.getElementById('prefab-name-input');
        this.statusMsg  = document.getElementById('status-msg');

        this._init();
    }

    _init() {
        initIntegration();
        this._setupResizeObserver();
        this._setupListeners();
        this._loadSprites();
        this._buildAddCompGrid();

        const params = new URLSearchParams(window.location.search);
        if (params.get('load')) {
            this.loadPrefabFromDisk(params.get('load'));
        } else {
            this.newPrefab(true);
        }

        this._animate();
        this.setMsg('READY — v5.0');
    }

    // ── Resize Observer ───────────────────────────────────────────────
    _setupResizeObserver() {
        const vp = document.getElementById('viewport');
        const ro = new ResizeObserver(() => {
            this.canvas.width  = vp.clientWidth;
            this.canvas.height = vp.clientHeight;
        });
        ro.observe(vp);
        this.canvas.width  = vp.clientWidth;
        this.canvas.height = vp.clientHeight;
    }

    // ── Event Listeners ───────────────────────────────────────────────
    _setupListeners() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            const inInput = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
            if ((e.ctrlKey||e.metaKey)&&e.key==='s') { e.preventDefault(); this.save(); return; }
            if ((e.ctrlKey||e.metaKey)&&e.key==='z') { e.preventDefault(); this.undo(); return; }
            if ((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&e.key==='z'))) { e.preventDefault(); this.redo(); return; }
            if ((e.ctrlKey||e.metaKey)&&e.key==='n') { e.preventDefault(); this.newPrefab(); return; }
            if ((e.ctrlKey||e.metaKey)&&e.key==='d') { e.preventDefault(); this.duplicatePrefab(); return; }
            if (inInput) return;
            if (e.key==='g'||e.key==='G') this.toggleGrid();
            if (e.key==='f'||e.key==='F') this.resetView();
            if (e.key==='Tab') { e.preventDefault(); this.setMode(this.mode==='select'?'translate':'select'); }
            if (e.key==='Escape') { this._closeAllModals(); this._closeAllDropdowns(); }
            if (e.key==='Delete'||e.key==='Backspace') {
                const p=this.currentPrefab();
                if (p) { const c=p.components[this.selectedComp]; if(c&&c.type!=='Transform') this.removeComponent(this.selectedComp); }
            }
            if (e.key==='c'||e.key==='C') this.copyComponent();
            if (e.key==='v'||e.key==='V') this.pasteComponent();
        });

        // Scroll zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.zoom = Math.max(0.1, Math.min(20, this.zoom * (e.deltaY>0?0.9:1.1)));
        }, { passive: false });

        // Mousedown
        this.canvas.addEventListener('mousedown', (e) => {
            this.lastMouse = { x:e.clientX, y:e.clientY };
            if (e.button===1||(e.button===0&&e.altKey)) {
                this.isPanning=true; this.canvas.style.cursor='grabbing'; e.preventDefault(); return;
            }
            if (e.button===2) { e.preventDefault(); this._showCtxMenu(e.clientX,e.clientY); return; }
            if (e.button===0&&this.mode==='translate') {
                if (!this._tryStartColliderResize(e)) this._tryStartGizmoDrag(e);
            }
        });

        // Mousemove
        this.canvas.addEventListener('mousemove', (e) => {
            const w = this._screenToWorld(e.clientX,e.clientY);
            this.worldCursor = w;
            document.getElementById('s-cursor').textContent = `${Math.round(w.x)}, ${Math.round(w.y)}`;
            if (this.isPanning) {
                this.offset.x += e.clientX-this.lastMouse.x;
                this.offset.y += e.clientY-this.lastMouse.y;
                this.lastMouse = { x:e.clientX, y:e.clientY };
            } else if (this.isResizingCollider) {
                this._updateColliderResize(w);
            } else if (this.isDraggingGizmo) {
                this._updateGizmoDrag(w);
            } else {
                this._updateHoverCursor(e);
            }
        });

        // Mouseup
        this.canvas.addEventListener('mouseup', () => this._endDrag());
        window.addEventListener('mouseup',      () => this._endDrag());

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Name input
        this.nameInput.addEventListener('input', (e) => {
            const p=this.currentPrefab(); if (!p) return;
            p.name = e.target.value.replace(/[^a-zA-Z0-9_\-]/g,'');
            this.nameInput.value = p.name;
            this.setDirtyIdx(this.currentIdx);
            this.renderLibrary();
        });

        // Modifier stack drag-to-reorder
        this._setupStackDrag();
    }

    _endDrag() {
        if (this.isPanning) { this.isPanning=false; this.canvas.style.cursor='crosshair'; }
        if (this.isResizingCollider) {
            this.isResizingCollider=false; this.resizeHandle=null; this.resizeStart=null;
            this.pushHistory(); this.setDirtyIdx(this.currentIdx); this.renderInspector();
        }
        if (this.isDraggingGizmo) {
            this.isDraggingGizmo=false; this.gizmoDragStart=null;
            this.pushHistory(); this.setDirtyIdx(this.currentIdx); this.renderInspector();
        }
    }

    _setupStackDrag() {
        let srcIdx = null;
        this.stackEl.addEventListener('dragstart', (e) => {
            const el = e.target.closest('[data-comp-idx]');
            if (!el) return;
            srcIdx = parseInt(el.dataset.compIdx);
            e.dataTransfer.effectAllowed = 'move';
        });
        this.stackEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.stackEl.querySelectorAll('[data-comp-idx]').forEach(el=>el.classList.remove('drag-over'));
            const el = e.target.closest('[data-comp-idx]');
            if (el) el.classList.add('drag-over');
        });
        this.stackEl.addEventListener('drop', (e) => {
            e.preventDefault();
            const el = e.target.closest('[data-comp-idx]');
            if (!el || srcIdx===null) return;
            const destIdx = parseInt(el.dataset.compIdx);
            if (srcIdx===destIdx) return;
            const p=this.currentPrefab(); if (!p) return;
            if (p.components[srcIdx]?.type==='Transform') return;
            if (destIdx===0) return;
            const [removed] = p.components.splice(srcIdx,1);
            p.components.splice(destIdx,0,removed);
            this.selectedComp = destIdx;
            this.setDirtyIdx(this.currentIdx); this.pushHistory();
            this.renderStack();
            this.stackEl.querySelectorAll('[data-comp-idx]').forEach(el=>el.classList.remove('drag-over'));
        });
    }

    // ── Coords ────────────────────────────────────────────────────────
    _screenToWorld(sx, sy) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: ((sx-rect.left) - this.canvas.width/2  - this.offset.x) / this.zoom,
            y: ((sy-rect.top)  - this.canvas.height/2 - this.offset.y) / this.zoom,
        };
    }
    _worldToScreen(wx, wy) {
        return {
            x: wx*this.zoom + this.canvas.width/2  + this.offset.x,
            y: wy*this.zoom + this.canvas.height/2 + this.offset.y,
        };
    }

    // ── Collider resize handles ───────────────────────────────────────
    _getColliderHandles(comp, tx, ty, sc) {
        const cw=comp.width*sc, ch=comp.height*sc;
        const cx=tx-cw/2+comp.offsetX, cy=ty-ch/2+comp.offsetY;
        return {
            nw:{x:cx,       y:cy,       cursor:'nw-resize'},
            n: {x:cx+cw/2,  y:cy,       cursor:'n-resize'},
            ne:{x:cx+cw,    y:cy,       cursor:'ne-resize'},
            e: {x:cx+cw,    y:cy+ch/2,  cursor:'e-resize'},
            se:{x:cx+cw,    y:cy+ch,    cursor:'se-resize'},
            s: {x:cx+cw/2,  y:cy+ch,    cursor:'s-resize'},
            sw:{x:cx,       y:cy+ch,    cursor:'sw-resize'},
            w: {x:cx,       y:cy+ch/2,  cursor:'w-resize'},
        };
    }

    _tryStartColliderResize(e) {
        const p=this.currentPrefab(); if (!p) return false;
        const comp=p.components[this.selectedComp];
        if (!comp||comp.type!=='Collider'||comp._locked) return false;
        const t=p.components.find(c=>c.type==='Transform')||{x:0,y:0,scale:3};
        const handles=this._getColliderHandles(comp,t.x||0,t.y||0,t.scale||3);
        const w=this._screenToWorld(e.clientX,e.clientY);
        const thresh=8/this.zoom;
        for (const [name,h] of Object.entries(handles)) {
            if (Math.abs(w.x-h.x)<thresh&&Math.abs(w.y-h.y)<thresh) {
                this.isResizingCollider=true; this.resizeHandle=name;
                this.resizeStart={ w, origComp:{...comp}, tx:t.x||0, ty:t.y||0, sc:t.scale||3 };
                return true;
            }
        }
        return false;
    }

    _updateColliderResize(w) {
        const d=this.resizeStart, p=this.currentPrefab();
        if (!p||!d) return;
        const comp=p.components[this.selectedComp];
        if (!comp||comp.type!=='Collider') return;
        const dx=w.x-d.w.x, dy=w.y-d.w.y, sc=d.sc, orig=d.origComp, h=this.resizeHandle;
        const dxSp=dx/sc, dySp=dy/sc;
        if (h.includes('e')) comp.width  = Math.max(2, orig.width  + dxSp*2);
        if (h.includes('w')) comp.width  = Math.max(2, orig.width  - dxSp*2);
        if (h.includes('s')) comp.height = Math.max(2, orig.height + dySp*2);
        if (h.includes('n')) comp.height = Math.max(2, orig.height - dySp*2);
        if (this.snapToGrid&&this.gridSize>0) {
            comp.width  = Math.max(1, Math.round(comp.width *sc/this.gridSize)*this.gridSize/sc);
            comp.height = Math.max(1, Math.round(comp.height*sc/this.gridSize)*this.gridSize/sc);
        }
        this.setDirtyIdx(this.currentIdx);
    }

    // ── Gizmo drag ────────────────────────────────────────────────────
    _tryStartGizmoDrag(e) {
        const p=this.currentPrefab(); if (!p) return;
        const comp=p.components[this.selectedComp];
        if (!comp||comp._hidden||comp._locked) return;
        const w=this._screenToWorld(e.clientX,e.clientY);
        const t=p.components.find(c=>c.type==='Transform')||{x:0,y:0};
        let ox,oy,field;
        if (comp.type==='Collider')   { ox=(t.x||0)+comp.offsetX; oy=(t.y||0)+comp.offsetY; field={x:'offsetX',y:'offsetY'}; }
        else if (comp.type==='Prefab'){ ox=comp.x; oy=comp.y; field={x:'x',y:'y'}; }
        else if (comp.type==='Transform'){ ox=comp.x||0; oy=comp.y||0; field={x:'x',y:'y'}; }
        else return;
        if (Math.hypot(w.x-ox,w.y-oy)<18/this.zoom) {
            this.isDraggingGizmo=true;
            this.gizmoDragStart={ idx:this.selectedComp, field, startWorld:{x:w.x,y:w.y}, startComp:{x:comp[field.x]||0,y:comp[field.y]||0} };
        }
    }

    _updateGizmoDrag(w) {
        const d=this.gizmoDragStart, p=this.currentPrefab();
        if (!p||!d) return;
        const comp=p.components[d.idx]; if (!comp) return;
        let nx=d.startComp.x+(w.x-d.startWorld.x);
        let ny=d.startComp.y+(w.y-d.startWorld.y);
        if (this.snapToGrid&&this.gridSize>0) {
            nx=Math.round(nx/this.gridSize)*this.gridSize;
            ny=Math.round(ny/this.gridSize)*this.gridSize;
        }
        comp[d.field.x]=nx; comp[d.field.y]=ny;
        this.setDirtyIdx(this.currentIdx);
    }

    // ── Hover cursor ──────────────────────────────────────────────────
    _updateHoverCursor(e) {
        if (this.mode!=='translate') { this.canvas.style.cursor='crosshair'; return; }
        const p=this.currentPrefab(); if (!p) { this.canvas.style.cursor='crosshair'; return; }
        const comp=p.components[this.selectedComp];
        const w=this._screenToWorld(e.clientX,e.clientY);
        this.hoveredHandle=null;
        if (comp&&comp.type==='Collider') {
            const t=p.components.find(c=>c.type==='Transform')||{x:0,y:0,scale:3};
            const handles=this._getColliderHandles(comp,t.x||0,t.y||0,t.scale||3);
            const thresh=8/this.zoom;
            for (const [name,h] of Object.entries(handles)) {
                if (Math.abs(w.x-h.x)<thresh&&Math.abs(w.y-h.y)<thresh) {
                    this.canvas.style.cursor=h.cursor; this.hoveredHandle=name; return;
                }
            }
        }
        if (comp&&(comp.type==='Collider'||comp.type==='Prefab'||comp.type==='Transform')) {
            const t=p.components.find(c=>c.type==='Transform')||{x:0,y:0};
            const ox=comp.type==='Collider'?(t.x||0)+comp.offsetX:comp.type==='Prefab'?comp.x:t.x||0;
            const oy=comp.type==='Collider'?(t.y||0)+comp.offsetY:comp.type==='Prefab'?comp.y:t.y||0;
            if (Math.hypot(w.x-ox,w.y-oy)<18/this.zoom) { this.canvas.style.cursor='move'; return; }
        }
        this.canvas.style.cursor='crosshair';
    }

    // ── Context menu ──────────────────────────────────────────────────
    _showCtxMenu(x, y) {
        const m=document.getElementById('ctx-menu');
        m.style.display='block'; m.style.left=x+'px'; m.style.top=y+'px';
    }
    _closeAllModals() {
        document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
        document.getElementById('ctx-menu').style.display='none';
    }
    _closeAllDropdowns() {
        document.querySelectorAll('.menu-dropdown-content').forEach(d=>d.classList.remove('open'));
    }
    toggleMenuDropdown(id) {
        const d=document.getElementById(id); const was=d.classList.contains('open');
        this._closeAllDropdowns(); if (!was) d.classList.add('open');
    }

    // ── History ───────────────────────────────────────────────────────
    pushHistory() {
        const snap=JSON.stringify(this.prefabs);
        this.history=this.history.slice(0,this.histIdx+1);
        this.history.push(snap);
        if (this.history.length>50) this.history.shift();
        this.histIdx=this.history.length-1;
        this._updateUndoRedoBtns();
    }
    _debouncedPushHistory() {
        clearTimeout(this._debHistTimer);
        this._debHistTimer = setTimeout(()=>this.pushHistory(), 400);
    }
    undo() {
        if (this.histIdx<=0) return;
        this.histIdx--;
        this.prefabs=JSON.parse(this.history[this.histIdx]);
        this.currentIdx=Math.min(this.currentIdx,this.prefabs.length-1);
        this.setDirtyIdx(this.currentIdx); this.refresh(); this.setMsg('UNDO');
    }
    redo() {
        if (this.histIdx>=this.history.length-1) return;
        this.histIdx++;
        this.prefabs=JSON.parse(this.history[this.histIdx]);
        this.setDirtyIdx(this.currentIdx); this.refresh(); this.setMsg('REDO');
    }
    _updateUndoRedoBtns() {
        const u=document.getElementById('btn-undo'), r=document.getElementById('btn-redo');
        if (u) u.style.opacity=this.histIdx>0?'1':'0.35';
        if (r) r.style.opacity=this.histIdx<this.history.length-1?'1':'0.35';
    }

    // ── Dirty tracking ────────────────────────────────────────────────
    setDirtyIdx(idx) {
        this.isDirty=true; this.dirtySet.add(idx);
        const d=document.getElementById('status-dirty'), dl=document.getElementById('status-dirty-lbl');
        if (d)  d.style.display='inline';
        if (dl) dl.style.display='inline';
    }
    clearDirtyIdx() {
        this.dirtySet.delete(this.currentIdx);
        if (this.dirtySet.size===0) { this.isDirty=false; }
        if (this.dirtySet.size===0) {
            const d=document.getElementById('status-dirty'), dl=document.getElementById('status-dirty-lbl');
            if (d)  d.style.display='none';
            if (dl) dl.style.display='none';
        }
    }

    // ── Status / Toast ────────────────────────────────────────────────
    setMsg(msg, isError=false) {
        const el=this.statusMsg; if (!el) return;
        el.textContent=msg; el.style.color=isError?'var(--red)':'var(--accent)';
        clearTimeout(this._msgTimer);
        this._msgTimer=setTimeout(()=>{el.textContent='';},3500);
    }
    showToast(msg, type='success') {
        const t=document.getElementById('toast'); if (!t) return;
        t.textContent=msg; t.className='toast show'+(type==='error'?' error':'');
        clearTimeout(this._toastTimer);
        this._toastTimer=setTimeout(()=>{t.classList.remove('show');},2300);
    }

    // ── Prefab CRUD ───────────────────────────────────────────────────
    newPrefab(silent=false) {
        if (!silent&&this.isDirty&&!confirm('Unsaved changes exist. Create new anyway?')) return;
        // Open name modal
        document.getElementById('modal-newprefab').classList.add('open');
        const inp=document.getElementById('new-prefab-name');
        inp.value=''; setTimeout(()=>inp.focus(),50);
    }
    confirmNewPrefab() {
        const rawName = document.getElementById('new-prefab-name').value.trim();
        const name = (rawName||'New_Entity').replace(/[^a-zA-Z0-9_\-]/g,'') || 'New_Entity';
        const p = { name, sprite:'player', tags:[], layer:'entities', components:[{type:'Transform',x:0,y:0,scale:3}] };
        this.prefabs.push(p);
        this.currentIdx=this.prefabs.length-1; this.selectedComp=0;
        this.setDirtyIdx(this.currentIdx); this.pushHistory();
        this.closeModal('modal-newprefab'); this.refresh();
        this.setMsg('CREATED: '+name);
    }
    duplicatePrefab() {
        const p=this.currentPrefab(); if (!p) return;
        const clone=JSON.parse(JSON.stringify(p)); clone.name=p.name+'_copy';
        this.prefabs.push(clone); this.currentIdx=this.prefabs.length-1;
        this.setDirtyIdx(this.currentIdx); this.pushHistory(); this.refresh();
        this.showToast('DUPLICATED: '+clone.name);
    }
    deletePrefab() {
        if (this.prefabs.length<=1) { this.setMsg('CANNOT DELETE LAST',true); return; }
        if (!confirm(`Delete "${this.currentPrefab()?.name}" from session?`)) return;
        const idx=this.currentIdx;
        this.prefabs.splice(idx,1); this.dirtySet.delete(idx);
        this.currentIdx=Math.max(0,idx-1); this.pushHistory(); this.refresh();
        this.setMsg('REMOVED FROM SESSION');
    }
    currentPrefab() { return this.prefabs[this.currentIdx]||null; }
    selectPrefab(idx) { this.currentIdx=idx; this.selectedComp=0; this.refresh(); }

    // ── Templates ─────────────────────────────────────────────────────
    applyTemplate(name) {
        const tpl=PREFAB_TEMPLATES[name]; if (!tpl) return;
        const p=this.currentPrefab();
        if (p&&!confirm(`Apply template "${name}"?\nThis replaces current components.`)) return;
        if (!p) { this.prefabs.push({name:name.replace(/\s/g,'_'),sprite:'player',tags:[],layer:'entities',components:[]}); this.currentIdx=this.prefabs.length-1; }
        const cur=this.currentPrefab();
        cur.sprite=tpl.sprite; cur.tags=[...(tpl.tags||[])]; cur.layer=tpl.layer||'entities';
        cur.components=tpl.components.map(c=>({...c}));
        this.selectedComp=0; this.setDirtyIdx(this.currentIdx); this.pushHistory();
        this.getImage(cur.sprite); this.refresh(); this._closeAllDropdowns();
        this.showToast('TEMPLATE: '+name);
    }

    // ── Component CRUD ────────────────────────────────────────────────
    addComponent(type) {
        const p=this.currentPrefab(); if (!p) return;
        const meta=COMP_META[type];
        if (meta?.singleton&&p.components.find(c=>c.type===type)) { this.setMsg(`${type} IS SINGLETON`,true); return; }
        p.components.push({type,...defaultComp(type)});
        this.selectedComp=p.components.length-1;
        this.setDirtyIdx(this.currentIdx); this.pushHistory(); this.refresh();
        this.setMsg(`+ ${type}`);
    }
    removeComponent(idx) {
        const p=this.currentPrefab(); if (!p) return;
        if (p.components[idx]?.type==='Transform') { this.setMsg('TRANSFORM REQUIRED',true); return; }
        p.components.splice(idx,1);
        this.selectedComp=Math.max(0,Math.min(this.selectedComp,p.components.length-1));
        this.setDirtyIdx(this.currentIdx); this.pushHistory(); this.refresh();
    }
    moveComponent(idx, dir) {
        const p=this.currentPrefab(); if (!p) return;
        const ni=idx+dir;
        if (ni<0||ni>=p.components.length) return;
        if (p.components[idx]?.type==='Transform'||ni===0) return;
        [p.components[idx],p.components[ni]]=[p.components[ni],p.components[idx]];
        this.selectedComp=ni; this.setDirtyIdx(this.currentIdx); this.pushHistory(); this.refresh();
    }
    toggleCompHidden(idx) {
        const p=this.currentPrefab(); if (!p||!p.components[idx]) return;
        p.components[idx]._hidden=!p.components[idx]._hidden; this.renderStack();
    }
    toggleCompLocked(idx) {
        const p=this.currentPrefab(); if (!p||!p.components[idx]) return;
        p.components[idx]._locked=!p.components[idx]._locked; this.renderStack();
    }
    copyComponent() {
        const p=this.currentPrefab(); if (!p) return;
        const comp=p.components[this.selectedComp]; if (!comp) return;
        this.clipboard=JSON.parse(JSON.stringify(comp));
        delete this.clipboard._hidden; delete this.clipboard._locked;
        this.setMsg('COPIED: '+comp.type);
    }
    pasteComponent() {
        if (!this.clipboard) { this.setMsg('CLIPBOARD EMPTY',true); return; }
        this.addComponent(this.clipboard.type);
        const p=this.currentPrefab(); if (!p) return;
        const last=p.components[p.components.length-1];
        Object.assign(last,JSON.parse(JSON.stringify(this.clipboard)));
        this.renderStack(); this.renderInspector();
        this.setMsg('PASTED: '+this.clipboard.type);
    }

    // ── Auto-fit Collider ─────────────────────────────────────────────
    autoFitCollider() {
        const p=this.currentPrefab(); if (!p) return;
        const comp=p.components[this.selectedComp];
        if (!comp||comp.type!=='Collider') { this.setMsg('SELECT COLLIDER FIRST',true); return; }
        const imgEl=this.getImage(p.sprite);
        if (!imgEl||!imgEl.complete||imgEl.naturalWidth===0) { this.setMsg('SPRITE NOT LOADED',true); return; }
        const oc=document.createElement('canvas');
        oc.width=imgEl.naturalWidth; oc.height=imgEl.naturalHeight;
        try {
            const octx=oc.getContext('2d');
            octx.drawImage(imgEl,0,0);
            const id=octx.getImageData(0,0,oc.width,oc.height);
            let minX=oc.width,maxX=0,minY=oc.height,maxY=0,found=false;
            for (let y=0;y<oc.height;y++) for (let x=0;x<oc.width;x++) {
                if (id.data[(y*oc.width+x)*4+3]>10) {
                    if(x<minX)minX=x; if(x>maxX)maxX=x;
                    if(y<minY)minY=y; if(y>maxY)maxY=y; found=true;
                }
            }
            if (!found) { this.setMsg('NO VISIBLE PIXELS',true); return; }
            const t=p.components.find(c=>c.type==='Transform')||{scale:3};
            const sc=t.scale||3;
            comp.width   = (maxX-minX+1);
            comp.height  = (maxY-minY+1);
            comp.offsetX = ((minX+maxX)/2 - imgEl.naturalWidth /2)*sc;
            comp.offsetY = ((minY+maxY)/2 - imgEl.naturalHeight/2)*sc;
            this.setDirtyIdx(this.currentIdx); this.pushHistory();
            this.renderInspector(); this.showToast('COLLIDER AUTO-FITTED ✓');
        } catch(_) { this.setMsg('CORS ERROR — use local sprite',true); }
    }

    // ── Save / Load ───────────────────────────────────────────────────
    async save() {
        const p=this.currentPrefab(); if (!p) return;
        let name=p.name;
        if (!name||name==='New_Entity') {
            name=prompt('Enter prefab name:'); if (!name) return;
            p.name=name.replace(/[^a-zA-Z0-9_\-]/g,''); this.nameInput.value=p.name;
        }
        const data=JSON.parse(JSON.stringify(p));
        data.components=data.components.map(c=>{const o={...c};delete o._hidden;delete o._locked;return o;});
        try {
            const res=await fetch('/api/ide/write',{
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({file:`dunyalar/definitions/${data.name}.json`,content:JSON.stringify(data,null,2)})
            });
            if (res.ok) {
                this.clearDirtyIdx(); this.renderLibrary();
                this.showToast('SAVED ✓  ' + data.name);
                if (eventBus) eventBus.emit('prefab:saved',{prefabId:data.name});
                if (projectState) projectState.set(`prefabs.${data.name}`,{name:data.name,lastModified:Date.now()});
            } else { this.showToast('SAVE FAILED','error'); }
        } catch(_) { this.showToast('NETWORK ERROR','error'); }
    }

    openLoadModal() {
        const modal=document.getElementById('modal-load');
        const grid=document.getElementById('load-file-grid');
        modal.classList.add('open');
        grid.innerHTML='<div class="m-empty"><i class="fas fa-spinner fa-spin"></i><span>SCANNING...</span></div>';
        fetch('/api/ide/list?dir=dunyalar/definitions')
            .then(r=>r.ok?r.json():[])
            .then(files=>{
                const jsons=(files||[]).filter(f=>f.name?.endsWith('.json'));
                if (!jsons.length) { grid.innerHTML='<div class="m-empty"><i class="fas fa-box-open"></i><span>NO DEFINITIONS FOUND</span></div>'; return; }
                grid.innerHTML='';
                jsons.forEach(f=>{
                    const name=f.name.replace('.json','');
                    const card=document.createElement('div'); card.className='modal-card';
                    card.innerHTML=`<i class="fas fa-cube"></i><div class="mc-label">${name}</div>`;
                    card.onclick=()=>{
                        if (this._refPickCb) { this._refPickCb(name); this._refPickCb=null; }
                        else { this.loadPrefabFromDisk(name); }
                        this.closeModal('modal-load');
                    };
                    grid.appendChild(card);
                });
            })
            .catch(()=>{ grid.innerHTML='<div class="m-empty" style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i><span>API ERROR</span></div>'; });
    }

    async loadPrefabFromDisk(name) {
        try {
            const res=await fetch(`/api/ide/read?file=dunyalar/definitions/${name}.json`);
            if (!res.ok) { this.setMsg('LOAD FAILED',true); return; }
            const data=JSON.parse(await res.text());
            if (!data.tags)  data.tags=[];
            if (!data.layer) data.layer='entities';
            this.prefabs.push(data); this.currentIdx=this.prefabs.length-1; this.selectedComp=0;
            data.components.forEach(c=>{ if(c.type==='Prefab'&&c.ref) this._loadChildPrefab(c.ref); });
            this.getImage(data.sprite);
            this.pushHistory(); this.refresh(); this.showToast('LOADED: '+name);
        } catch(_) { this.setMsg('LOAD ERROR',true); }
    }

    async _loadChildPrefab(name) {
        if (this.prefabCache[name]) return;
        try {
            const res=await fetch(`/api/ide/read?file=dunyalar/definitions/${name}.json`);
            if (res.ok) { this.prefabCache[name]=JSON.parse(await res.text()); }
        } catch(_) {}
    }

    closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    // ── Sprite loading (Phase A fix) ──────────────────────────────────
    async _loadSprites() {
        const found=new Set();
        const scan=async(dir)=>{
            try {
                const res=await fetch(`/api/ide/list?dir=${dir}`);
                if (!res.ok) return;
                const files=await res.json();
                (files||[]).forEach(f=>{
                    if (f.name&&/\.(png|gif|jpg|webp)$/i.test(f.name)) {
                        const name=f.name.replace(/\.(png|gif|jpg|webp)$/i,'');
                        found.add(name);
                    }
                });
            } catch(_) {}
        };
        await scan('sprite-art');
        await scan('base_game/assets');
        try {
            const res=await fetch('/api/assets?type=sprite');
            if (res.ok) {
                const list=await res.json();
                (list||[]).forEach(s=>{ if(s.name){this.spriteDefs[s.name]=s;found.add(s.name);} });
            }
        } catch(_) {}
        this.knownSprites=[...found];
    }

    refreshSprites() { this.knownSprites=[]; this.spriteDefs={}; this._loadSprites().then(()=>this.setMsg('SPRITES REFRESHED')); }

    openSpriteBrowser(onSelect) {
        this._spriteBrowserCb=onSelect;
        document.getElementById('modal-sprites').classList.add('open');
        const grid=document.getElementById('sprite-grid');
        this._buildSpriteBrowserGrid(grid);
    }

    _rebuildSpriteBrowserGrid() {
        this._buildSpriteBrowserGrid(document.getElementById('sprite-grid'));
    }

    _buildSpriteBrowserGrid(grid) {
        grid.innerHTML='';
        const names=[...new Set([...this.knownSprites,...Object.keys(this.imageCache)])];
        if (!names.length) {
            grid.innerHTML='<div class="m-empty"><i class="fas fa-image"></i><span>NO SPRITES FOUND — click RESCAN</span></div>'; return;
        }
        names.forEach(name=>{
            const card=document.createElement('div'); card.className='modal-card';
            const c=document.createElement('canvas'); c.width=48; c.height=48; c.style.imageRendering='pixelated';
            const ctx=c.getContext('2d');
            // Checker bg
            for(let r=0;r<6;r++) for(let cl=0;cl<6;cl++){ctx.fillStyle=(r+cl)%2===0?'#333':'#555';ctx.fillRect(cl*8,r*8,8,8);}
            const def=this.spriteDefs[name];
            if (def?.data&&def?.palette) {
                const sc=Math.min(48/def.width,48/def.height);
                const ox=(48-def.width*sc)/2,oy=(48-def.height*sc)/2;
                def.data.forEach((row,y)=>{for(let x=0;x<row.length;x++){const col=def.palette[row[x]];if(col){ctx.fillStyle=col;ctx.fillRect(ox+x*sc,oy+y*sc,sc,sc);}}});
            } else {
                const img=this.getImage(name);
                const draw=()=>{ if(img.naturalWidth>0){for(let r=0;r<6;r++)for(let cl=0;cl<6;cl++){ctx.fillStyle=(r+cl)%2===0?'#333':'#555';ctx.fillRect(cl*8,r*8,8,8);}const sc=Math.min(48/img.naturalWidth,48/img.naturalHeight,3);ctx.imageSmoothingEnabled=false;ctx.drawImage(img,(48-img.naturalWidth*sc)/2,(48-img.naturalHeight*sc)/2,img.naturalWidth*sc,img.naturalHeight*sc);} };
                if(img.complete)draw(); else img.onload=draw;
            }
            const lbl=document.createElement('div'); lbl.className='mc-label'; lbl.textContent=name; lbl.title=name;
            card.appendChild(c); card.appendChild(lbl);
            card.onclick=()=>{ if(this._spriteBrowserCb)this._spriteBrowserCb(name); this.closeModal('modal-sprites'); this._spriteBrowserCb=null; };
            grid.appendChild(card);
        });
    }

    // ── JSON mode ─────────────────────────────────────────────────────
    toggleJsonMode() {
        this.jsonMode=!this.jsonMode;
        document.getElementById('btn-json').classList.toggle('accent-active',this.jsonMode);
        this.inspEl.classList.toggle('hidden',this.jsonMode);
        this.jsonPanel.classList.toggle('visible',this.jsonMode);
        if (this.jsonMode) this._syncJsonTA();
    }
    _syncJsonTA() {
        const p=this.currentPrefab(); if (!p) return;
        const d=JSON.parse(JSON.stringify(p));
        d.components=d.components.map(c=>{const o={...c};delete o._hidden;delete o._locked;return o;});
        this.jsonTA.value=JSON.stringify(d,null,2);
    }
    applyJsonEdit() {
        try {
            const data=JSON.parse(this.jsonTA.value);
            this.prefabs[this.currentIdx]=data;
            this.setDirtyIdx(this.currentIdx); this.pushHistory(); this.refresh();
            this.showToast('JSON APPLIED ✓');
        } catch(e) { this.setMsg('INVALID JSON: '+e.message,true); }
    }
    exportToClipboard() {
        const p=this.currentPrefab(); if (!p) return;
        const d=JSON.parse(JSON.stringify(p));
        d.components=d.components.map(c=>{const o={...c};delete o._hidden;delete o._locked;return o;});
        navigator.clipboard.writeText(JSON.stringify(d,null,2))
            .then(()=>this.showToast('JSON COPIED TO CLIPBOARD'))
            .catch(()=>this.setMsg('CLIPBOARD DENIED',true));
    }

    // ── Tools ─────────────────────────────────────────────────────────
    toggleGrid() {
        this.showGrid=!this.showGrid;
        document.getElementById('btn-grid')?.classList.toggle('accent-active',this.showGrid);
        this.setMsg('GRID '+(this.showGrid?'ON':'OFF'));
    }
    toggleSnap() {
        this.snapToGrid=!this.snapToGrid;
        document.getElementById('btn-snap')?.classList.toggle('accent-active',this.snapToGrid);
        this.setMsg('SNAP '+(this.snapToGrid?'ON':'OFF'));
    }
    setGridSize(v) { this.gridSize=Math.max(1,parseInt(v)||16); }
    setMode(m) {
        this.mode=m;
        document.getElementById('btn-mode-sel')?.classList.toggle('accent-active',m==='select');
        document.getElementById('btn-mode-tr')?.classList.toggle('accent-active',m==='translate');
        this.canvas.style.cursor='crosshair';
        this.setMsg('MODE: '+m.toUpperCase());
    }
    resetView() { this.zoom=2.0; this.offset={x:0,y:0}; this.setMsg('VIEW RESET'); }
    centerOrigin() { this.offset={x:0,y:0}; }

    menuFile()     { this.toggleMenuDropdown('dd-file'); }
    menuEdit()     { this.toggleMenuDropdown('dd-edit'); }
    menuView()     { this.toggleMenuDropdown('dd-view'); }
    menuTemplate() { this.toggleMenuDropdown('dd-template'); }
    showHelp()     { document.getElementById('modal-help').classList.add('open'); this._closeAllDropdowns(); }

    // ── UI Rendering ──────────────────────────────────────────────────
    refresh() {
        const p=this.currentPrefab();
        this.nameInput.value=p?p.name:'';
        this.renderLibrary(); this.renderStack(); this._buildAddCompGrid();
        this.renderInspector(); this._updateStatus();
        if (this.jsonMode) this._syncJsonTA();
    }

    renderLibrary() {
        this.libEl.innerHTML='';
        this.prefabs.forEach((p,i)=>{
            const div=document.createElement('div');
            div.className='lib-item'+(i===this.currentIdx?' active':'');
            div.style.display='flex'; div.style.alignItems='center'; div.style.gap='5px';
            const dirty=this.dirtySet.has(i);
            div.innerHTML=`<i class="fas fa-cube" style="font-size:10px;flex-shrink:0"></i><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name||'Unnamed'}</span>${dirty?'<span style="color:#cc4444;font-size:9px">●</span>':''}`;
            div.onclick=()=>this.selectPrefab(i);
            this.libEl.appendChild(div);
        });
    }

    renderStack() {
        const p=this.currentPrefab(); this.stackEl.innerHTML=''; if (!p) return;
        p.components.forEach((c,i)=>{
            const meta=COMP_META[c.type]||{};
            const sel=i===this.selectedComp, hid=!!c._hidden, lkd=!!c._locked;
            const row=document.createElement('div');
            row.className='mod-item'+(sel?' selected':'')+(hid?' hidden-comp':'');
            row.dataset.compIdx=i; row.draggable=(c.type!=='Transform');
            row.title=`${c.type}`;
            row.onclick=()=>{ this.selectedComp=i; this.renderStack(); this.renderInspector(); };
            row.innerHTML=`
                <i class="fas ${meta.icon||'fa-puzzle-piece'} mod-icon" style="color:${sel?'var(--accent)':'var(--text-dim)'}"></i>
                <span class="mod-name">${c.type}</span>
                <div class="mod-btns">
                    <button class="mod-btn" title="${hid?'Show':'Hide'}" onclick="event.stopPropagation();editor.toggleCompHidden(${i})"><i class="fas ${hid?'fa-eye-slash':'fa-eye'}"></i></button>
                    <button class="mod-btn" title="${lkd?'Unlock':'Lock'}" onclick="event.stopPropagation();editor.toggleCompLocked(${i})"><i class="fas ${lkd?'fa-lock':'fa-lock-open'}"></i></button>
                    ${i>0?`<button class="mod-btn" title="Move Up" onclick="event.stopPropagation();editor.moveComponent(${i},-1)"><i class="fas fa-arrow-up"></i></button>`:''}
                    <button class="mod-btn" title="Copy (C)" onclick="event.stopPropagation();editor.selectedComp=${i};editor.copyComponent()"><i class="fas fa-copy"></i></button>
                    ${c.type!=='Transform'?`<button class="mod-btn del" title="Delete" onclick="event.stopPropagation();editor.removeComponent(${i})"><i class="fas fa-times"></i></button>`:''}
                </div>
            `;
            this.stackEl.appendChild(row);
        });
    }

    _buildAddCompGrid() {
        const grid=document.getElementById('add-comp-grid');
        const filterInp=document.getElementById('comp-filter');
        const filter=(filterInp?.value||'').toLowerCase();
        grid.innerHTML='';
        const p=this.currentPrefab();
        Object.keys(COMP_META).forEach(type=>{
            if (filter&&!type.toLowerCase().includes(filter)) return;
            const meta=COMP_META[type];
            const exists=meta.singleton&&p&&p.components.find(c=>c.type===type);
            const btn=document.createElement('div');
            btn.className='add-comp-btn'+(exists?' disabled':'');
            btn.innerHTML=`<i class="fas ${meta.icon}"></i>${type}`;
            btn.title=exists?`${type} is singleton`:`Add ${type}`;
            if (!exists) btn.onclick=()=>this.addComponent(type);
            grid.appendChild(btn);
        });
    }

    renderInspector() {
        const p=this.currentPrefab(), comp=p?p.components[this.selectedComp]:null;
        const el=this.inspEl, typeEl=document.getElementById('insp-comp-type');
        el.innerHTML='';
        if (!comp) { typeEl.textContent=''; el.innerHTML='<div class="m-empty" style="margin-top:30px"><i class="fas fa-mouse-pointer"></i><span>Select a component</span></div>'; return; }
        typeEl.textContent=comp.type;
        if (comp._locked) { el.innerHTML='<div class="m-empty" style="margin-top:30px"><i class="fas fa-lock"></i><span>LOCKED</span></div>'; return; }

        // ── Transform: Sprite + Tags/Layer ──
        if (comp.type==='Transform') {
            // Sprite group
            const sg=this._makeGroup('SPRITE','fa-image'), sf=sg.querySelector('.insp-fields');
            const srow=document.createElement('div'); srow.className='field-row';
            srow.innerHTML='<div class="field-label">Sprite ID</div>';
            const sc=document.createElement('div'); sc.className='field-control';
            const sinp=document.createElement('input');
            sinp.className='f-input'; sinp.type='text'; sinp.value=p.sprite||''; sinp.style.flex='1';
            sinp.oninput=(e)=>{p.sprite=e.target.value;this.setDirtyIdx(this.currentIdx);this._debouncedPushHistory();this._updateSpriteThumb(p.sprite);};
            const sbtn=document.createElement('button');
            sbtn.className='f-spin'; sbtn.title='Browse sprites'; sbtn.style.width='22px';
            sbtn.innerHTML='<i class="fas fa-folder-open" style="font-size:9px"></i>';
            sbtn.onclick=()=>this.openSpriteBrowser(n=>{p.sprite=n;sinp.value=n;this.setDirtyIdx(this.currentIdx);this._updateSpriteThumb(n);});
            sc.appendChild(sinp); sc.appendChild(sbtn); srow.appendChild(sc); sf.appendChild(srow);
            const thwrap=document.createElement('div');
            thwrap.style.cssText='padding:4px;display:flex;justify-content:center;background:#000;border:1px solid var(--blo);margin:3px 0;';
            const tc=document.createElement('canvas'); tc.id='sprite-thumb-canvas'; tc.width=64; tc.height=64;
            thwrap.appendChild(tc); sf.appendChild(thwrap); this._updateSpriteThumb(p.sprite);
            el.appendChild(sg);

            // Tags & Layer group
            const tg=this._makeGroup('TAGS & LAYER','fa-tags'), tf=tg.querySelector('.insp-fields');
            // Layer select
            const lrow=document.createElement('div'); lrow.className='field-row';
            lrow.innerHTML='<div class="field-label">Layer</div>';
            const lc=document.createElement('div'); lc.className='field-control';
            const lsel=document.createElement('select'); lsel.className='f-input'; lsel.style.cursor='pointer';
            LAYERS.forEach(lay=>{ const o=document.createElement('option'); o.value=lay; o.textContent=lay; if(p.layer===lay)o.selected=true; lsel.appendChild(o); });
            lsel.onchange=(e)=>{p.layer=e.target.value;this.setDirtyIdx(this.currentIdx);this._debouncedPushHistory();};
            lc.appendChild(lsel); lrow.appendChild(lc); tf.appendChild(lrow);
            // Tag chips
            const tagwrap=document.createElement('div'); tagwrap.style.cssText='padding:4px 0;';
            const chips=document.createElement('div'); chips.style.cssText='display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;min-height:10px;';
            (p.tags||[]).forEach((tag,ti)=>{
                const chip=document.createElement('span');
                chip.style.cssText='background:var(--bg-item);border:1px solid var(--bmid);padding:2px 5px;font-size:9px;display:flex;align-items:center;gap:3px;color:var(--text-lbl);';
                chip.innerHTML=`${tag}<i class="fas fa-times" style="cursor:pointer;opacity:0.5;font-size:8px" onclick="editor.currentPrefab().tags.splice(${ti},1);editor.setDirtyIdx(editor.currentIdx);editor.renderInspector()"></i>`;
                chips.appendChild(chip);
            });
            const addrow=document.createElement('div'); addrow.style.cssText='display:flex;gap:3px;';
            const tinp=document.createElement('input');
            tinp.className='f-input'; tinp.placeholder='add tag…'; tinp.style.flex='1'; tinp.style.fontSize='10px';
            const addTag=()=>{ if(!tinp.value.trim())return; if(!p.tags)p.tags=[]; p.tags.push(tinp.value.trim()); tinp.value=''; this.setDirtyIdx(this.currentIdx); this._debouncedPushHistory(); this.renderInspector(); };
            tinp.onkeydown=(e)=>{ if(e.key==='Enter')addTag(); };
            const tbtn=document.createElement('button'); tbtn.className='f-spin'; tbtn.textContent='+'; tbtn.style.width='22px'; tbtn.onclick=addTag;
            addrow.appendChild(tinp); addrow.appendChild(tbtn);
            tagwrap.appendChild(chips); tagwrap.appendChild(addrow); tf.appendChild(tagwrap);
            el.appendChild(tg);
        }

        // ── Collider: tools group ──
        if (comp.type==='Collider') {
            const cg=this._makeGroup('TOOLS','fa-tools'), cf=cg.querySelector('.insp-fields');
            const btn=document.createElement('button'); btn.className='f-action-btn';
            btn.innerHTML='<i class="fas fa-compress-arrows-alt"></i> AUTO-FIT TO SPRITE';
            btn.onclick=()=>this.autoFitCollider();
            cf.appendChild(btn); el.appendChild(cg);
        }

        // ── Script: Code Forge shortcut ──
        if (comp.type==='Script') {
            const sg=this._makeGroup('ACTIONS','fa-tools'), sf=sg.querySelector('.insp-fields');
            const btn=document.createElement('button'); btn.className='f-action-btn';
            btn.innerHTML='<i class="fas fa-external-link-alt"></i> OPEN IN CODE FORGE';
            btn.onclick=()=>{
                const sid=comp.scriptId;
                if (window.parent) window.parent.postMessage({type:'openTool',tool:'script',scriptId:sid},'*');
                else window.open(`/script_editor.html?load=${sid}`, '_blank');
            };
            sf.appendChild(btn); el.appendChild(sg);
        }

        // ── Stats: HP bar preview ──
        if (comp.type==='Stats') {
            const sg=this._makeGroup('HP PREVIEW','fa-chart-bar'), sf=sg.querySelector('.insp-fields');
            const cv=document.createElement('canvas'); cv.width=200; cv.height=12;
            cv.style.cssText='width:100%;image-rendering:pixelated;display:block;';
            const ctx=cv.getContext('2d');
            const ratio=Math.max(0,Math.min(1,comp.hp/(comp.maxHp||1)));
            ctx.fillStyle='#300'; ctx.fillRect(0,0,200,12);
            const r=Math.round(255*(1-ratio)), g=Math.round(200*ratio);
            ctx.fillStyle=`rgb(${r},${g},0)`; ctx.fillRect(0,0,Math.round(200*ratio),12);
            ctx.strokeStyle='#555'; ctx.lineWidth=1; ctx.strokeRect(0.5,0.5,199,11);
            ctx.fillStyle='#fff'; ctx.font='bold 8px Tahoma'; ctx.textAlign='center';
            ctx.fillText(`${comp.hp} / ${comp.maxHp}`,100,9);
            sf.appendChild(cv); el.appendChild(sg);
        }

        // ── All component fields ──
        const fields=Object.keys(comp).filter(k=>!k.startsWith('_')&&k!=='type');
        if (fields.length>0) {
            const gr=this._makeGroup(comp.type.toUpperCase()+' SETTINGS',COMP_META[comp.type]?.icon||'fa-sliders-h');
            const body=gr.querySelector('.insp-fields');
            fields.forEach(key=>{
                const val=comp[key], t=typeof val;
                // Sub-object
                if (t==='object'&&val!==null&&!Array.isArray(val)) {
                    Object.keys(val).forEach(sk=>{
                        const row=this._makeFieldRow(`${key}.${sk}`);
                        this._wireField(row,val,sk,typeof val[sk],()=>{this.setDirtyIdx(this.currentIdx);this._debouncedPushHistory();});
                        body.appendChild(row);
                    }); return;
                }
                // Particle.system → dropdown
                if (comp.type==='Particle'&&key==='system') {
                    const row=this._makeFieldRow(key); const ctrl=row.querySelector('.field-control');
                    const sel=document.createElement('select'); sel.className='f-input'; sel.style.cursor='pointer';
                    PARTICLE_SYSTEMS.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;if(comp.system===s)o.selected=true;sel.appendChild(o);});
                    sel.onchange=(e)=>{comp.system=e.target.value;this.setDirtyIdx(this.currentIdx);this._debouncedPushHistory();};
                    ctrl.appendChild(sel); body.appendChild(row); return;
                }
                // Behavior.aiScript → dropdown
                if (comp.type==='Behavior'&&key==='aiScript') {
                    const row=this._makeFieldRow(key); const ctrl=row.querySelector('.field-control');
                    const sel=document.createElement('select'); sel.className='f-input'; sel.style.cursor='pointer';
                    BEHAVIOR_SCRIPTS.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;if(comp.aiScript===s)o.selected=true;sel.appendChild(o);});
                    sel.onchange=(e)=>{comp.aiScript=e.target.value;this.setDirtyIdx(this.currentIdx);this._debouncedPushHistory();};
                    ctrl.appendChild(sel); body.appendChild(row); return;
                }
                // Prefab.ref → picker button
                if (comp.type==='Prefab'&&key==='ref') {
                    const row=this._makeFieldRow(key); const ctrl=row.querySelector('.field-control');
                    const inp=document.createElement('input');
                    inp.className='f-input'; inp.type='text'; inp.value=val||''; inp.style.flex='1'; inp.readOnly=true;
                    const btn=document.createElement('button'); btn.className='f-spin'; btn.style.width='22px'; btn.title='Browse prefabs';
                    btn.innerHTML='<i class="fas fa-folder-open" style="font-size:9px"></i>';
                    btn.onclick=()=>{
                        this._refPickCb=(name)=>{comp.ref=name;inp.value=name;this._loadChildPrefab(name);this.setDirtyIdx(this.currentIdx);this._debouncedPushHistory();};
                        this.openLoadModal();
                    };
                    ctrl.appendChild(inp); ctrl.appendChild(btn); body.appendChild(row); return;
                }
                const row=this._makeFieldRow(key);
                this._wireField(row,comp,key,t,()=>{this.setDirtyIdx(this.currentIdx);this._debouncedPushHistory();});
                body.appendChild(row);
            });
            el.appendChild(gr);
        }
    }

    _makeGroup(title, icon) {
        const g=document.createElement('div'); g.className='insp-group';
        g.innerHTML=`<div class="insp-group-title"><i class="fas ${icon}"></i> ${title}</div><div class="insp-fields"></div>`;
        return g;
    }
    _makeFieldRow(key) {
        const row=document.createElement('div'); row.className='field-row';
        const lbl=document.createElement('div'); lbl.className='field-label';
        lbl.textContent=key.replace(/([A-Z])/g,' $1').trim(); lbl.title=key;
        const ctrl=document.createElement('div'); ctrl.className='field-control';
        row.appendChild(lbl); row.appendChild(ctrl); return row;
    }
    _wireField(row, obj, key, t, onChange) {
        const ctrl=row.querySelector('.field-control'), val=obj[key];
        if (t==='boolean') {
            const chk=document.createElement('input'); chk.type='checkbox'; chk.className='f-check'; chk.checked=val;
            chk.onchange=(e)=>{obj[key]=e.target.checked;onChange();}; ctrl.appendChild(chk);
        } else if (t==='string'&&key.toLowerCase().includes('color')) {
            const sw=document.createElement('div'); sw.className='f-color-swatch'; sw.style.background=val;
            const pk=document.createElement('input'); pk.type='color'; pk.className='f-color-hidden'; pk.value=val||'#000000';
            const inp=document.createElement('input'); inp.className='f-input'; inp.type='text'; inp.value=val||''; inp.style.flex='1';
            pk.oninput=(e)=>{obj[key]=e.target.value;sw.style.background=e.target.value;inp.value=e.target.value;onChange();};
            sw.onclick=()=>pk.click();
            inp.oninput=(e)=>{obj[key]=e.target.value;sw.style.background=e.target.value;try{pk.value=e.target.value;}catch(_){} onChange();};
            ctrl.appendChild(sw); ctrl.appendChild(pk); ctrl.appendChild(inp);
        } else if (t==='number') {
            const step=(key==='scale'||key.includes('chance')||key.includes('intensity')||key.includes('radius'))?0.1:1;
            const minus=document.createElement('button'); minus.className='f-spin'; minus.textContent='−';
            const inp=document.createElement('input'); inp.className='f-input'; inp.type='number'; inp.value=val; inp.step=step; inp.style.textAlign='right';
            const plus=document.createElement('button'); plus.className='f-spin'; plus.textContent='+';
            // Phase A fix: debounced history for number fields
            const update=()=>{obj[key]=parseFloat(inp.value)||0; onChange();};
            minus.onclick=()=>{inp.value=+(parseFloat(inp.value||0)-step).toFixed(4);update();};
            plus.onclick =()=>{inp.value=+(parseFloat(inp.value||0)+step).toFixed(4);update();};
            inp.oninput  =()=>update();
            ctrl.appendChild(minus); ctrl.appendChild(inp); ctrl.appendChild(plus);
        } else {
            const inp=document.createElement('input'); inp.className='f-input'; inp.type='text'; inp.value=val!=null?val:'';
            inp.oninput=(e)=>{obj[key]=e.target.value;onChange();}; ctrl.appendChild(inp);
        }
    }

    _updateSpriteThumb(name) {
        const tc=document.getElementById('sprite-thumb-canvas'); if (!tc) return;
        const ctx=tc.getContext('2d');
        // Checkerboard bg
        for(let r=0;r<8;r++) for(let c=0;c<8;c++){ctx.fillStyle=(r+c)%2===0?'#333':'#444';ctx.fillRect(c*8,r*8,8,8);}
        const def=this.spriteDefs[name];
        if (def?.data&&def?.palette) {
            const sc=Math.min(64/def.width,64/def.height);
            const ox=(64-def.width*sc)/2,oy=(64-def.height*sc)/2;
            def.data.forEach((row,y)=>{for(let x=0;x<row.length;x++){const col=def.palette[row[x]];if(col){ctx.fillStyle=col;ctx.fillRect(ox+x*sc,oy+y*sc,sc,sc);}}});
            return;
        }
        const img=this.getImage(name);
        const draw=()=>{
            if(img.naturalWidth>0){
                for(let r=0;r<8;r++)for(let c=0;c<8;c++){ctx.fillStyle=(r+c)%2===0?'#333':'#444';ctx.fillRect(c*8,r*8,8,8);}
                const sc=Math.min(64/img.naturalWidth,64/img.naturalHeight,4);
                ctx.imageSmoothingEnabled=false;
                ctx.drawImage(img,(64-img.naturalWidth*sc)/2,(64-img.naturalHeight*sc)/2,img.naturalWidth*sc,img.naturalHeight*sc);
            }
        };
        if(img.complete)draw(); else img.onload=draw;
    }

    _updateStatus() {
        const p=this.currentPrefab();
        document.getElementById('s-prefab').textContent=p?p.name:'—';
        document.getElementById('s-comps').textContent =p?p.components.length:0;
        document.getElementById('s-zoom').textContent  =this.zoom.toFixed(1);
    }

    // ── Canvas Rendering ──────────────────────────────────────────────
    _animate() { this._draw(); requestAnimationFrame(()=>this._animate()); }

    _draw() {
        const ctx=this.ctx, W=this.canvas.width, H=this.canvas.height;
        ctx.clearRect(0,0,W,H);
        // Phase E: Checkerboard background
        this._drawCheckerboard(ctx,W,H);
        ctx.save();
        ctx.translate(Math.floor(W/2+this.offset.x), Math.floor(H/2+this.offset.y));
        ctx.scale(this.zoom,this.zoom);
        if (this.showGrid) this._drawGrid(ctx);
        this._drawOriginCross(ctx);
        this._drawPrefab(ctx);
        ctx.restore();
        document.getElementById('hud-zoom').textContent=`ZOOM ${this.zoom.toFixed(2)}x`;
    }

    _drawCheckerboard(ctx, W, H) {
        const sz=20;
        for(let y=0;y<H;y+=sz) for(let x=0;x<W;x+=sz) {
            ctx.fillStyle=((x/sz+y/sz)%2===0)?'#1a1a1a':'#141414';
            ctx.fillRect(x,y,sz,sz);
        }
    }

    _drawGrid(ctx) {
        const sz=this.gridSize, size=3000;
        ctx.strokeStyle='rgba(255,255,255,0.035)'; ctx.lineWidth=1/this.zoom;
        ctx.beginPath();
        for(let x=-size;x<=size;x+=sz){ctx.moveTo(x,-size);ctx.lineTo(x,size);}
        for(let y=-size;y<=size;y+=sz){ctx.moveTo(-size,y);ctx.lineTo(size,y);}
        ctx.stroke();
    }

    // Phase E: origin crosshair
    _drawOriginCross(ctx) {
        const size=4000;
        ctx.strokeStyle='rgba(255,100,0,0.22)'; ctx.lineWidth=1/this.zoom;
        ctx.beginPath(); ctx.moveTo(-size,0); ctx.lineTo(size,0); ctx.stroke();
        ctx.strokeStyle='rgba(0,200,80,0.22)';
        ctx.beginPath(); ctx.moveTo(0,-size); ctx.lineTo(0,size); ctx.stroke();
        ctx.fillStyle='rgba(255,100,0,0.7)';
        ctx.beginPath(); ctx.arc(0,0,4/this.zoom,0,Math.PI*2); ctx.fill();
    }

    _drawPrefab(ctx) {
        const p=this.currentPrefab(); if (!p) return;
        const t=p.components.find(c=>c.type==='Transform')||{x:0,y:0,scale:3};
        const sc=t.scale||3, tx=t.x||0, ty=t.y||0;
        // Sprite
        const tWrap=p.components.find(c=>c.type==='Transform');
        if (!tWrap?._hidden) {
            const img=this.getImage(p.sprite);
            if (img.complete&&img.naturalWidth>0) {
                const sw=img.naturalWidth*sc, sh=img.naturalHeight*sc;
                ctx.imageSmoothingEnabled=false;
                ctx.drawImage(img,tx-sw/2,ty-sh/2,sw,sh);
                if (this.selectedComp===0) {
                    ctx.strokeStyle='#ff6600'; ctx.lineWidth=1.5/this.zoom;
                    ctx.strokeRect(tx-sw/2,ty-sh/2,sw,sh);
                }
            } else {
                const s=16*sc;
                ctx.fillStyle='rgba(80,80,80,0.2)'; ctx.strokeStyle='#555'; ctx.lineWidth=1/this.zoom;
                ctx.fillRect(tx-s/2,ty-s/2,s,s); ctx.strokeRect(tx-s/2,ty-s/2,s,s);
                ctx.fillStyle='#666'; ctx.font=`${9/this.zoom}px monospace`; ctx.textAlign='center';
                ctx.fillText(p.sprite||'?',tx,ty+3/this.zoom);
            }
        }
        // Component gizmos
        p.components.forEach((comp,idx)=>{
            if (comp._hidden) return;
            const isSel=idx===this.selectedComp, lw=2/this.zoom;
            if (comp.type==='Collider') {
                const cw=comp.width*sc, ch=comp.height*sc;
                const cx=tx-cw/2+comp.offsetX, cy=ty-ch/2+comp.offsetY;
                ctx.strokeStyle=isSel?'#33cc66':'rgba(51,204,102,0.28)';
                ctx.fillStyle=isSel?'rgba(51,204,102,0.06)':'transparent';
                ctx.lineWidth=lw;
                ctx.fillRect(cx,cy,cw,ch); ctx.strokeRect(cx,cy,cw,ch);
                if (isSel) {
                    if (this.mode==='translate') this._drawGizmo(ctx,tx+comp.offsetX,ty+comp.offsetY);
                    // Phase D: resize handles
                    this._drawColliderHandles(ctx,comp,tx,ty,sc);
                }
            }
            if (comp.type==='Light') {
                ctx.strokeStyle=isSel?comp.color:'rgba(255,255,255,0.1)';
                ctx.lineWidth=lw; ctx.setLineDash([5/this.zoom,4/this.zoom]);
                ctx.beginPath(); ctx.arc(tx,ty,comp.radius,0,Math.PI*2); ctx.stroke();
                ctx.setLineDash([]);
                if (comp.pulse) {
                    ctx.strokeStyle='rgba(255,200,0,0.12)'; ctx.lineWidth=lw*0.5;
                    ctx.setLineDash([3/this.zoom,5/this.zoom]);
                    ctx.beginPath(); ctx.arc(tx,ty,comp.radius*0.7,0,Math.PI*2); ctx.stroke();
                    ctx.setLineDash([]);
                }
                if (isSel) { ctx.fillStyle=comp.color; ctx.beginPath(); ctx.arc(tx,ty,5/this.zoom,0,Math.PI*2); ctx.fill(); }
            }
            if (comp.type==='Particle') {
                if (isSel) {
                    const px=tx+(comp.offset?.x||0), py=ty+(comp.offset?.y||0);
                    ctx.fillStyle='rgba(255,200,50,0.7)'; ctx.beginPath(); ctx.arc(px,py,5/this.zoom,0,Math.PI*2); ctx.fill();
                    ctx.strokeStyle='rgba(255,200,50,0.4)'; ctx.lineWidth=1/this.zoom;
                    ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(px,py); ctx.stroke();
                }
            }
            if (comp.type==='Prefab') {
                ctx.save(); ctx.translate(comp.x,comp.y);
                if (comp.rotation) ctx.rotate(comp.rotation*Math.PI/180);
                const cs=comp.scale||1;
                if (comp.ref&&this.prefabCache[comp.ref]) {
                    const child=this.prefabCache[comp.ref];
                    const ci=this.getImage(child.sprite);
                    const ct=child.components?.find(c=>c.type==='Transform');
                    const csc=(ct?.scale||3)*cs;
                    if (ci.complete&&ci.naturalWidth>0) { ctx.imageSmoothingEnabled=false; ctx.drawImage(ci,-ci.naturalWidth*csc/2,-ci.naturalHeight*csc/2,ci.naturalWidth*csc,ci.naturalHeight*csc); }
                }
                ctx.strokeStyle=isSel?'#ccaa00':'rgba(180,150,0,0.3)';
                ctx.lineWidth=lw; ctx.setLineDash([4/this.zoom,3/this.zoom]);
                ctx.strokeRect(-16*cs,-16*cs,32*cs,32*cs); ctx.setLineDash([]);
                ctx.restore();
                if (isSel&&this.mode==='translate') this._drawGizmo(ctx,comp.x,comp.y);
            }
            if (comp.type==='Transform'&&isSel&&this.mode==='translate') this._drawGizmo(ctx,tx,ty);
        });
    }

    // Phase D: Collider resize handles
    _drawColliderHandles(ctx, comp, tx, ty, sc) {
        const handles=this._getColliderHandles(comp,tx,ty,sc);
        const hs=5/this.zoom;
        Object.entries(handles).forEach(([name,h])=>{
            const hov=name===this.hoveredHandle;
            ctx.fillStyle=hov?'#ffcc00':'#33cc66';
            ctx.strokeStyle='#000'; ctx.lineWidth=1/this.zoom;
            ctx.fillRect(h.x-hs,h.y-hs,hs*2,hs*2);
            ctx.strokeRect(h.x-hs,h.y-hs,hs*2,hs*2);
        });
    }

    _drawGizmo(ctx, x, y) {
        const sz=20/this.zoom, lw=2/this.zoom, aw=3/this.zoom;
        ctx.strokeStyle='#ff3333'; ctx.fillStyle='#ff3333'; ctx.lineWidth=lw;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+sz,y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+sz,y-aw); ctx.lineTo(x+sz+aw*2.5,y); ctx.lineTo(x+sz,y+aw); ctx.fill();
        ctx.strokeStyle='#33ff66'; ctx.fillStyle='#33ff66';
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+sz); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x-aw,y+sz); ctx.lineTo(x,y+sz+aw*2.5); ctx.lineTo(x+aw,y+sz); ctx.fill();
        ctx.fillStyle='#ffff00'; ctx.fillRect(x-lw*1.5,y-lw*1.5,lw*3,lw*3);
    }

    // ── Image loading ─────────────────────────────────────────────────
    getImage(name) {
        if (!name) return new Image();
        if (this.imageCache[name]) return this.imageCache[name];
        const img=new Image(); img.crossOrigin='anonymous';
        const paths=[`/sprite-art/${name}.png`,`/sprite-art/${name}.gif`,`/base_game/assets/${name}.png`,`/base_game/assets/${name}.gif`];
        let i=0; const tryNext=()=>{if(i<paths.length)img.src=paths[i++];}; img.onerror=tryNext; tryNext();
        this.imageCache[name]=img; return img;
    }
}

// Boot
window.addEventListener('DOMContentLoaded', ()=>{
    window.editor=new PrefabEditor();
    document.getElementById('btn-grid').classList.add('accent-active');
    document.getElementById('btn-mode-sel').classList.add('accent-active');
    document.getElementById('btn-undo').style.opacity='0.35';
    document.getElementById('btn-redo').style.opacity='0.35';
});