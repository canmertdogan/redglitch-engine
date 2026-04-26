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
        
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
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
            inner.className = 'retro-btn'; 
            inner.innerText = data.text || 'BTN';
            
            // Interaction
            if (context.onClick && (data.script || data.action)) {
                inner.onclick = (e) => context.onClick(data.script || data.action, e);
            }
            // Editor Selection Hook
            if (context.onInteract) {
                container.onmousedown = (e) => context.onInteract(data, e);
            }

            this.applyStyle(inner, data.style);
            
            // Flex layout for button text
            inner.style.display = 'flex'; 
            inner.style.alignItems = 'center'; 
            inner.style.justifyContent = 'center';
        } 
        else if (data.type === 'label') {
            inner = document.createElement('div');
            inner.className = 'retro-label'; 
            
            // Data Binding (Simple)
            let text = data.text || 'LABEL';
            if (context.variables && text.includes('{')) {
                text = text.replace(/{(\w+)}/g, (_, key) => context.variables[key] || '?');
            }
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
            if (context.variables && data.props && data.props.variable && data.props.maxVariable) {
                const val = context.variables[data.props.variable] || 0;
                const max = context.variables[data.props.maxVariable] || 100;
                const pct = Math.max(0, Math.min(100, (val / max) * 100));
                fill.style.width = `${pct}%`;
            }

            const label = document.createElement('span'); 
            label.className = 'bar-label'; 
            label.innerText = data.text || 'BAR';
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
        if (style.fontSize) el.style.fontSize = style.fontSize + 'px';
        if (style.borderWidth) el.style.borderWidth = style.borderWidth + 'px';
        if (style.borderColor) el.style.borderColor = style.borderColor;
        if (style.textAlign) el.style.textAlign = style.textAlign;
    }
}