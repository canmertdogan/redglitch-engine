// uiRenderer.js - Shared UI Rendering & Geometry Logic for Game & Editor

const UIRenderer = class UIRenderer {
    static parseAnchor(anchor = 'top-left') {
        const raw = String(anchor || 'top-left').trim().toLowerCase();
        if (raw === 'center') return { v: 'center', h: 'center' };
        const [v = 'top', h = 'left'] = raw.split('-');
        return {
            v: (v === 'top' || v === 'center' || v === 'bottom') ? v : 'top',
            h: (h === 'left' || h === 'center' || h === 'right') ? h : 'left'
        };
    }

    static resolveRect(rect, anchor = 'top-left', resolution = { w: 800, h: 450 }) {
        const resW = Number(resolution?.w) || 800;
        const resH = Number(resolution?.h) || 450;
        const x = Number(rect?.x ?? 0);
        const y = Number(rect?.y ?? 0);
        const w = Number(rect?.w ?? 100);
        const h = Number(rect?.h ?? 40);
        const { v, h: hAlign } = this.parseAnchor(anchor);

        let left = x;
        if (hAlign === 'right') left = resW - w - x;
        else if (hAlign === 'center') left = (resW - w) / 2 + x;

        let top = y;
        if (v === 'bottom') top = resH - h - y;
        else if (v === 'center') top = (resH - h) / 2 + y;

        return {
            x, y, w, h,
            left: Math.round(left),
            top: Math.round(top)
        };
    }

    static screenToAnchorRect(left, top, w, h, anchor = 'top-left', resolution = { w: 800, h: 450 }) {
        const resW = Number(resolution?.w) || 800;
        const resH = Number(resolution?.h) || 450;
        const { v, h: hAlign } = this.parseAnchor(anchor);

        let x = left;
        if (hAlign === 'right') x = resW - w - left;
        else if (hAlign === 'center') x = left - (resW - w) / 2;

        let y = top;
        if (v === 'bottom') y = resH - h - top;
        else if (v === 'center') y = top - (resH - h) / 2;

        return {
            x: Math.round(x),
            y: Math.round(y),
            w: Math.round(w),
            h: Math.round(h)
        };
    }

    static convertAnchorRect(rect, fromAnchor = 'top-left', toAnchor = 'top-left', resolution = { w: 800, h: 450 }) {
        const resolved = this.resolveRect(rect, fromAnchor, resolution);
        return this.screenToAnchorRect(resolved.left, resolved.top, resolved.w, resolved.h, toAnchor, resolution);
    }

    static render(screenData, rootContainer, context = {}) {
        if (!screenData || !screenData.elements) return;

        // Clear if not strictly additive (usually we clear for screens)
        // rootContainer.innerHTML = ''; // Caller should handle clearing if needed

        screenData.elements.forEach(elData => {
            const dom = this.create(elData, context);
            rootContainer.appendChild(dom);
        });
    }

    static create(data, context = {}) {
        // Check condition - skip element if condition not met
        if (data.condition && !context.ignoreConditions) {
            let shouldShow = true;
            
            if (data.condition === 'campaign_mode') {
                shouldShow = window.CAMPAIGN_MODE === true;
            } else if (data.condition === '!campaign_mode') {
                shouldShow = !window.CAMPAIGN_MODE;
            }
            
            if (!shouldShow) {
                // Return empty div that won't be visible
                const empty = document.createElement('div');
                empty.style.display = 'none';
                return empty;
            }
        }
        
        // Wrapper for positioning
        const container = document.createElement('div');
        container.id = data.id || `el_${Math.random().toString(36).substr(2,9)}`;
        container.className = 'ui-element-wrapper';
        container.style.position = 'absolute';
        container.style.boxSizing = 'border-box';
        container.style.fontFamily = "'VT323', monospace";
        
        // Handle Rect using unified anchor solver
        const baseRect = data.rect || { x: data.x || 0, y: data.y || 0, w: data.w || 100, h: data.h || 40 };
        const anchor = data.anchor || 'top-left';
        const resolution = context.resolution || { w: 800, h: 450 };
        const resolved = this.resolveRect(baseRect, anchor, resolution);

        container.style.left = `${resolved.left}px`;
        container.style.top = `${resolved.top}px`;
        container.style.width = `${resolved.w}px`;
        container.style.height = `${resolved.h}px`;
        container.style.pointerEvents = 'auto'; // Enable interactions
        
        // Handle Z-Index
        if (data.style && data.style.zIndex !== undefined) {
            container.style.zIndex = data.style.zIndex;
        }

        // Inner Element (The actual component)
        let inner = null;
        const s = data.style || {};

        if (data.type === 'button') {
            inner = document.createElement('div');
            inner.className = 'retro-btn rg-ui-button'; 
            inner.innerText = this.interpolate(data.text || 'BTN', context);
            
            // Interaction
            if (context.onClick && (data.script || data.action)) {
                inner.onclick = (e) => context.onClick(data.script || data.action, e);
            }
            // Editor Selection Hook
            if (context.onInteract) {
                container.onmousedown = (e) => context.onInteract(data, e);
            }

            inner.style.display = 'flex'; 
            inner.style.alignItems = 'center'; 
            inner.style.justifyContent = s.textAlign === 'left' ? 'flex-start' : s.textAlign === 'right' ? 'flex-end' : 'center';
            inner.style.background = 'linear-gradient(180deg, rgba(255,30,39,0.1), rgba(0,0,0,0.2)), rgba(0,0,0,0.48)';
            inner.style.border = '1px solid rgba(255,30,39,0.38)';
            inner.style.color = '#ff1e27';
            inner.style.boxShadow = '0 8px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)';
            inner.style.textShadow = '0 0 10px rgba(255,30,39,0.24)';
            inner.style.textTransform = 'uppercase';
            inner.style.fontWeight = '700';
            inner.style.letterSpacing = '0';
            inner.style.cursor = 'pointer';
            inner.style.boxSizing = 'border-box';
            inner.style.userSelect = 'none';
            this.applyStyle(inner, s);
        } 
        else if (data.type === 'label') {
            inner = document.createElement('div');
            inner.className = 'retro-label'; 
            inner.style.display = 'flex';
            inner.style.alignItems = 'center';
            inner.style.justifyContent = s.textAlign === 'center' ? 'center' : s.textAlign === 'right' ? 'flex-end' : 'flex-start';
            inner.style.whiteSpace = 'pre-wrap';
            inner.style.lineHeight = '1.2';
            inner.style.boxSizing = 'border-box';
            
            // Data Binding (Simple)
            let text = data.text || 'LABEL';
            text = this.interpolate(text, context);
            inner.innerText = text;
            
            this.applyStyle(inner, s);
        } 
        else if (data.type === 'panel') {
            inner = document.createElement('div');
            inner.className = 'retro-panel';
            inner.style.boxSizing = 'border-box';
            this.applyStyle(inner, s);
        } 
        else if (data.type === 'image') {
            inner = document.createElement('div');
            inner.style.width = '100%'; inner.style.height = '100%';
            inner.style.boxSizing = 'border-box';
            if (data.src) inner.style.backgroundImage = `url('${data.src}')`; 
            inner.style.backgroundSize = 'contain'; 
            inner.style.backgroundRepeat = 'no-repeat';
            inner.style.backgroundPosition = 'center';
            this.applyStyle(inner, s);
        } 
        else if (data.type === 'bar') {
            inner = document.createElement('div');
            inner.className = 'bar-container';
            inner.style.background = 'rgba(10, 15, 26, 0.84)'; 
            inner.style.border = '1px solid rgba(148, 163, 184, 0.38)'; 
            inner.style.boxShadow = 'inset 1px 1px 0 rgba(0,0,0,0.40), 2px 2px 0 rgba(0,0,0,0.28)';
            inner.style.position = 'relative';
            inner.style.overflow = 'hidden';
            inner.style.boxSizing = 'border-box';
            
            this.applyStyle(inner, s);

            const fill = document.createElement('div'); 
            fill.className = 'bar-fill'; 
            fill.style.position = 'absolute';
            fill.style.top = '0';
            fill.style.left = '0';
            fill.style.width = '68%'; 
            fill.style.height = '100%';
            
            const fillColor = (data.props && data.props.fillColor) ? data.props.fillColor : '#e74c3c';
            fill.style.background = fillColor; 
            fill.style.boxShadow = 'inset 0 2px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.28)';
            fill.style.transition = 'width 0.2s';
            
            // Dynamic width when state variables exist
            if (data.props && data.props.variable && data.props.maxVariable) {
                const val = this.resolveValue(data.props.variable, context);
                const max = this.resolveValue(data.props.maxVariable, context);
                if (val !== undefined && max) {
                    const pct = Math.max(0, Math.min(100, (val / max) * 100));
                    fill.style.width = `${pct}%`;
                }
            }

            inner.appendChild(fill);

            if (data.props && Number(data.props.ticks) > 0) {
                const n = Number(data.props.ticks);
                const step = 100 / n;
                const ticks = document.createElement('div');
                ticks.className = 'bar-ticks';
                ticks.style.position = 'absolute';
                ticks.style.inset = '0';
                ticks.style.pointerEvents = 'none';
                ticks.style.zIndex = '1';
                ticks.style.background = `repeating-linear-gradient(90deg, transparent 0, transparent calc(${step}% - 2px), rgba(0,0,0,0.45) calc(${step}% - 2px), rgba(0,0,0,0.45) calc(${step}%))`;
                inner.appendChild(ticks);
            }

            const label = document.createElement('span'); 
            label.className = 'bar-label'; 
            label.innerText = this.interpolate(data.text || '', context);
            label.style.position = 'relative'; 
            label.style.zIndex = '2'; 
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.justifyContent = 'center';
            label.style.width = '100%';
            label.style.height = '100%';
            const barFs = s.fontSize ? Number(s.fontSize) : Math.max(10, Math.min(13, resolved.h - 4));
            label.style.fontSize = barFs + 'px'; 
            label.style.color = s.color || '#fff'; 
            label.style.textShadow = s.textShadow || '1px 1px 0 #000';
            label.style.fontWeight = s.fontWeight || (barFs <= 14 ? '400' : '700');
            
            inner.appendChild(label);
        }
        else if (data.type === 'slot') {
            inner = document.createElement('div');
            inner.className = 'retro-slot';
            inner.style.display = 'flex';
            inner.style.alignItems = 'center';
            inner.style.justifyContent = 'center';
            inner.style.background = 'rgba(15, 22, 36, 0.72)';
            inner.style.border = '1px solid rgba(255, 213, 115, 0.45)';
            inner.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.10), 2px 2px 0 rgba(0,0,0,0.32)';
            inner.style.color = '#ffd573';
            inner.style.fontWeight = '400';
            inner.style.boxSizing = 'border-box';
            this.applyStyle(inner, s);

            const keyCap = document.createElement('span');
            keyCap.className = 'slot-key';
            keyCap.textContent = this.interpolate(data.text || '', context);
            const capSize = Math.max(12, Number(s.fontSize || 14));
            keyCap.style.cssText = `position:absolute;top:2px;left:4px;font-size:${capSize}px;line-height:1;font-weight:${s.fontWeight || '400'};text-shadow:1px 1px 0 rgba(0,0,0,0.65);pointer-events:none;`;
            inner.appendChild(keyCap);
        }

        if (inner) {
            inner.style.width = '100%';
            inner.style.height = '100%';
            inner.style.position = 'absolute';
            // In editor, clicks should pass to container for selection
            if (context.editorMode) inner.style.pointerEvents = 'none'; 
            container.appendChild(inner);
        }

        // Editor Overlays
        if (context.editorMode && context.selection === data.id) {
            container.classList.add('selected'); // CSS class for border
            const h = document.createElement('div');
            h.className = `resize-handle se`;
            container.appendChild(h);
        }

        return container;
    }

    static applyStyle(el, style) {
        if (!style) return;
        if (style.color) el.style.color = style.color;
        if (style.backgroundColor) el.style.background = style.backgroundColor;
        if (style.backgroundImage) el.style.backgroundImage = style.backgroundImage;
        if (style.fontSize) el.style.fontSize = style.fontSize + 'px';
        if (style.borderWidth !== undefined) {
            const bw = Number(style.borderWidth) || 0;
            el.style.borderWidth = bw + 'px';
            el.style.borderStyle = bw > 0 ? (style.borderStyle || 'solid') : 'none';
        }
        if (style.borderColor) {
            el.style.borderColor = style.borderColor;
            if (!el.style.borderStyle && Number(style.borderWidth) > 0) el.style.borderStyle = style.borderStyle || 'solid';
        }
        if (style.textAlign) el.style.textAlign = style.textAlign;
        if (style.borderRadius !== undefined) el.style.borderRadius = style.borderRadius + 'px';
        if (style.boxShadow) el.style.boxShadow = style.boxShadow;
        if (style.textShadow) el.style.textShadow = style.textShadow;
        if (style.textTransform) el.style.textTransform = style.textTransform;
        if (style.letterSpacing !== undefined) el.style.letterSpacing = typeof style.letterSpacing === 'number' ? style.letterSpacing + 'px' : style.letterSpacing;
        if (style.fontWeight) el.style.fontWeight = style.fontWeight;
        if (style.opacity !== undefined) el.style.opacity = String(style.opacity);
        if (style.padding !== undefined) el.style.padding = typeof style.padding === 'number' ? `${style.padding}px` : style.padding;
        if (style.fontFamily) el.style.fontFamily = style.fontFamily;
        if (style.lineHeight) el.style.lineHeight = typeof style.lineHeight === 'number' ? `${style.lineHeight}px` : style.lineHeight;
        if (style.backgroundSize) el.style.backgroundSize = style.backgroundSize;
        if (style.backgroundPosition) el.style.backgroundPosition = style.backgroundPosition;
        if (style.backgroundRepeat) el.style.backgroundRepeat = style.backgroundRepeat;
    }

    static interpolate(text, context) {
        return String(text || '').replace(/{([^}]+)}/g, (_, path) => {
            const value = this.resolveValue(path.trim(), context);
            return value === undefined || value === null ? '?' : value;
        });
    }

    static resolveValue(path, context) {
        if (!path) return undefined;

        const sources = {
            player: context.player || context.variables || {},
            state: context.state || {},
            game: context.game || {},
            vars: context.variables || {},
            variables: context.variables || {}
        };

        const parts = String(path).split('.');
        let root = sources[parts[0]];
        let offset = 1;

        if (root === undefined) {
            root = context.variables || {};
            offset = 0;
        }

        let cur = root;
        for (let i = offset; i < parts.length; i++) {
            if (cur === undefined || cur === null) return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }
};

if (typeof window !== 'undefined') {
    window.UIRenderer = UIRenderer;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UIRenderer };
}
