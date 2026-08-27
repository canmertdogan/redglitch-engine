// uiRenderer.js - Shared UI Rendering Logic for Game & Editor

window.UIRenderer = class UIRenderer {
    static render(screenData, rootContainer, context = {}) {
        if (!screenData || !screenData.elements) return;

        // Clear if not strictly additive (usually we clear for screens)
        // rootContainer.innerHTML = ''; // Caller should handle clearing if needed

        screenData.elements.forEach(elData => {
            const dom = this.create(elData, context);
            rootContainer.appendChild(dom);
        });
    }

    static create(data, context) {
        // Check condition - skip element if condition not met
        if (data.condition) {
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
        
        // Handle Rect
        const x = data.rect ? data.rect.x : (data.x || 0);
        const y = data.rect ? data.rect.y : (data.y || 0);
        const w = data.rect ? data.rect.w : (data.w || 100);
        const h = data.rect ? data.rect.h : (data.h || 40);
        
        const anchor = data.anchor || 'top-left';
        const resolution = context.resolution || { w: 800, h: 450 };
        let left = x;
        let top = y;
        if (anchor.includes('right')) left = resolution.w - w - x;
        else if (anchor.includes('center')) left = (resolution.w / 2) - (w / 2) + x;
        if (anchor.includes('bottom')) top = resolution.h - h - y;
        else if (anchor.includes('center')) top = (resolution.h / 2) - (h / 2) + y;

        container.style.left = `${left}px`;
        container.style.top = `${top}px`;
        container.style.width = `${w}px`;
        container.style.height = `${h}px`;
        container.style.pointerEvents = 'auto'; // Enable interactions
        
        // Handle Z-Index
        if (data.style && data.style.zIndex) {
            container.style.zIndex = data.style.zIndex;
        }

        // Inner Element (The actual component)
        let inner = null;

        if (data.type === 'button') {
            inner = document.createElement('div');
            inner.className = 'retro-btn rg-ui-button'; 
            inner.innerText = data.text || 'BTN';
            
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
            inner.style.justifyContent = 'center';
            inner.style.background = 'linear-gradient(180deg, rgba(255,30,39,0.1), rgba(0,0,0,0.2)), rgba(0,0,0,0.48)';
            inner.style.border = '1px solid rgba(255,30,39,0.38)';
            inner.style.color = '#ff1e27';
            inner.style.boxShadow = '0 8px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)';
            inner.style.textShadow = '0 0 10px rgba(255,30,39,0.24)';
            inner.style.textTransform = 'uppercase';
            inner.style.fontWeight = '700';
            inner.style.letterSpacing = '0';
            this.applyStyle(inner, data.style);
        } 
        else if (data.type === 'label') {
            inner = document.createElement('div');
            inner.className = 'retro-label'; 
            
            // Data Binding (Simple)
            let text = data.text || 'LABEL';
            text = this.interpolate(text, context);
            inner.innerText = text;
            
            this.applyStyle(inner, data.style);
        } 
        else if (data.type === 'panel') {
            inner = document.createElement('div');
            inner.className = 'retro-panel';
            this.applyStyle(inner, data.style);
        } 
        else if (data.type === 'image') {
            inner = document.createElement('div');
            inner.style.width = '100%'; inner.style.height = '100%';
            inner.style.backgroundImage = `url('${data.src}')`; 
            inner.style.backgroundSize = 'contain'; 
            inner.style.backgroundRepeat = 'no-repeat';
            inner.style.backgroundPosition = 'center';
            this.applyStyle(inner, data.style);
        } 
        else if (data.type === 'bar') {
            inner = document.createElement('div');
            inner.className = 'bar-container';
            inner.style.background = '#000'; 
            inner.style.border = '2px solid #444'; 
            inner.style.boxShadow = '3px 3px 0 #000';
            
            this.applyStyle(inner, data.style);

            const fill = document.createElement('div'); 
            fill.className = 'bar-fill'; 
            fill.style.width = '100%'; 
            fill.style.height = '100%';
            
            const fillColor = (data.props && data.props.fillColor) ? data.props.fillColor : '#fff';
            fill.style.background = fillColor; 
            fill.style.transition = 'width 0.2s';
            
            // Dynamic width
            if (data.props && data.props.variable && data.props.maxVariable) {
                const val = this.resolveValue(data.props.variable, context) || 0;
                const max = this.resolveValue(data.props.maxVariable, context) || 100;
                const pct = Math.max(0, Math.min(100, (val / max) * 100));
                fill.style.width = `${pct}%`;
            }

            const label = document.createElement('span'); 
            label.className = 'bar-label'; 
            label.innerText = this.interpolate(data.text || 'BAR', context);
            label.style.position = 'absolute'; 
            label.style.left = '8px'; 
            label.style.top = '-2px';
            label.style.fontSize = '18px'; 
            label.style.color = '#fff'; 
            label.style.textShadow = '2px 2px 0 #000';
            label.style.zIndex = '2'; 
            label.style.fontWeight = 'bold';
            
            inner.appendChild(fill); 
            inner.appendChild(label);
        }
        else if (data.type === 'slot') {
            inner = document.createElement('div');
            inner.className = 'retro-slot';
            inner.style.display = 'flex';
            inner.style.alignItems = 'center';
            inner.style.justifyContent = 'center';
            inner.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.52))';
            inner.style.border = '2px solid rgba(255,204,0,0.45)';
            inner.style.boxShadow = 'inset 0 0 0 2px rgba(0,0,0,0.55), 3px 3px 0 rgba(0,0,0,0.65)';
            inner.style.color = '#ffd36a';
            inner.style.fontWeight = '700';
            inner.innerText = this.interpolate(data.text || '', context);
            this.applyStyle(inner, data.style);
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
        if (style.borderWidth) {
            el.style.borderWidth = style.borderWidth + 'px';
            el.style.borderStyle = style.borderStyle || 'solid';
        }
        if (style.borderColor) {
            el.style.borderColor = style.borderColor;
            if (!el.style.borderStyle) el.style.borderStyle = style.borderStyle || 'solid';
        }
        if (style.textAlign) el.style.textAlign = style.textAlign;
        if (style.borderRadius !== undefined) el.style.borderRadius = style.borderRadius + 'px';
        if (style.boxShadow) el.style.boxShadow = style.boxShadow;
        if (style.textTransform) el.style.textTransform = style.textTransform;
        if (style.letterSpacing !== undefined) el.style.letterSpacing = style.letterSpacing;
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
}
