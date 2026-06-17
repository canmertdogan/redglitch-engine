export class UIRuntime {
    constructor() {
        this.container = null;
        this.data = null;
        this.currentScreen = null;
        this.elements = {}; // Map of id -> DOM element
        this.state = {};
        this.onActionCallback = null;
    }

    /**
     * Initialize the UI Runtime inside a target container.
     * @param {HTMLElement} parentContainer The container (e.g. #game-container) to overlay the UI onto.
     */
    init(parentContainer) {
        if (!parentContainer) {
            console.error('[UIRuntime] No parent container provided.');
            return;
        }

        // Create the root overlay
        this.container = document.createElement('div');
        this.container.id = 'ui-runtime-overlay';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.pointerEvents = 'none'; // Let clicks pass through unless on an element
        this.container.style.zIndex = '1000'; // Ensure it's above the canvas

        // Try to handle scaling. The UI Designer uses an 800x450 artboard by default.
        // For responsiveness, we can use a container that preserves aspect ratio,
        // or just rely on CSS transforms.
        this.uiScaleContainer = document.createElement('div');
        this.uiScaleContainer.style.position = 'absolute';
        this.uiScaleContainer.style.top = '50%';
        this.uiScaleContainer.style.left = '50%';
        this.uiScaleContainer.style.transform = 'translate(-50%, -50%)';
        this.uiScaleContainer.style.transformOrigin = 'center center';
        
        // Default designer resolution
        this.baseWidth = 800;
        this.baseHeight = 450;
        
        this.uiScaleContainer.style.width = this.baseWidth + 'px';
        this.uiScaleContainer.style.height = this.baseHeight + 'px';

        this.container.appendChild(this.uiScaleContainer);
        parentContainer.appendChild(this.container);

        // Setup resize listener
        window.addEventListener('resize', this.handleResize.bind(this));
        this.handleResize();
    }

    handleResize() {
        if (!this.container || !this.uiScaleContainer) return;
        const parentW = this.container.clientWidth;
        const parentH = this.container.clientHeight;
        if (parentW === 0 || parentH === 0) return;

        // Calculate scale to fit the window while maintaining aspect ratio
        const scaleX = parentW / this.baseWidth;
        const scaleY = parentH / this.baseHeight;
        const scale = Math.min(scaleX, scaleY);
        
        this.uiScaleContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    /**
     * Load a UI configuration JSON.
     * @param {Object} uiData The parsed JSON from .redui file
     */
    load(uiData) {
        this.data = uiData;
        if (uiData && uiData.resolution) {
            this.baseWidth = uiData.resolution.w || 800;
            this.baseHeight = uiData.resolution.h || 450;
            this.uiScaleContainer.style.width = this.baseWidth + 'px';
            this.uiScaleContainer.style.height = this.baseHeight + 'px';
            this.handleResize();
        }
    }

    /**
     * Display a specific screen.
     * @param {String} screenId 
     */
    showScreen(screenId) {
        if (!this.data || !this.data.screens || !this.data.screens[screenId]) {
            console.warn(`[UIRuntime] Screen '${screenId}' not found.`);
            return;
        }

        this.currentScreen = screenId;
        this.uiScaleContainer.innerHTML = '';
        this.elements = {};

        const screenData = this.data.screens[screenId];
        if (!screenData.elements) return;

        screenData.elements.forEach(elData => {
            const domEl = this.buildElement(elData);
            if (domEl) {
                this.elements[elData.id] = { dom: domEl, data: elData };
                this.uiScaleContainer.appendChild(domEl);
            }
        });

        // Initial sync
        this.sync(this.state);
    }

    /**
     * Internal method to construct an HTML element from designer data.
     */
    buildElement(data) {
        const wrapper = document.createElement('div');
        wrapper.id = `ui-el-${data.id}`;
        wrapper.style.position = 'absolute';
        wrapper.style.pointerEvents = 'auto'; // Make clickable
        wrapper.style.boxSizing = 'border-box';
        
        const r = data.rect || { x: 0, y: 0, w: 100, h: 100 };
        wrapper.style.left = r.x + 'px';
        wrapper.style.top = r.y + 'px';
        wrapper.style.width = r.w + 'px';
        wrapper.style.height = r.h + 'px';

        const s = data.style || {};
        if (s.zIndex) wrapper.style.zIndex = s.zIndex;

        // Apply visual styles
        if (s.color) wrapper.style.color = s.color;
        if (s.backgroundColor) wrapper.style.background = s.backgroundColor;
        if (s.backgroundImage) wrapper.style.backgroundImage = s.backgroundImage;
        if (s.fontSize) wrapper.style.fontSize = s.fontSize + 'px';
        if (s.borderWidth) {
            wrapper.style.borderWidth = s.borderWidth + 'px';
            wrapper.style.borderStyle = 'solid';
        }
        if (s.borderColor) wrapper.style.borderColor = s.borderColor;
        if (s.textAlign) wrapper.style.textAlign = s.textAlign;
        if (s.borderRadius !== undefined) wrapper.style.borderRadius = s.borderRadius + 'px';
        if (s.boxShadow) wrapper.style.boxShadow = s.boxShadow;
        if (s.textTransform) wrapper.style.textTransform = s.textTransform;
        if (s.letterSpacing !== undefined) wrapper.style.letterSpacing = s.letterSpacing;
        if (s.fontWeight) wrapper.style.fontWeight = s.fontWeight;

        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        
        // Justification based on text alignment
        if (s.textAlign === 'center') wrapper.style.justifyContent = 'center';
        else if (s.textAlign === 'right') wrapper.style.justifyContent = 'flex-end';
        else wrapper.style.justifyContent = 'flex-start';

        // Custom renderers per type
        if (data.type === 'label' || data.type === 'button') {
            wrapper.innerHTML = this.parseTextVariables(data.text || '', this.state);
            wrapper.style.userSelect = 'none';
            if (data.type === 'button') {
                wrapper.style.cursor = 'pointer';
            }
        } else if (data.type === 'image') {
            if (data.src) {
                wrapper.style.backgroundImage = `url('${data.src}')`;
                wrapper.style.backgroundSize = 'contain';
                wrapper.style.backgroundRepeat = 'no-repeat';
                wrapper.style.backgroundPosition = 'center';
            }
        } else if (data.type === 'bar') {
            const fill = document.createElement('div');
            fill.className = 'bar-fill';
            fill.style.position = 'absolute';
            fill.style.top = '0';
            fill.style.left = '0';
            fill.style.height = '100%';
            fill.style.background = (data.props && data.props.fillColor) || '#e74c3c';
            fill.style.width = '100%'; // Default full
            fill.style.transition = 'width 0.2s ease-out';
            wrapper.appendChild(fill);

            const label = document.createElement('div');
            label.className = 'bar-label';
            label.style.position = 'relative';
            label.style.zIndex = '1';
            label.style.width = '100%';
            label.innerHTML = this.parseTextVariables(data.text || '', this.state);
            wrapper.appendChild(label);
        } else if (data.type === 'slot') {
            wrapper.style.alignItems = 'flex-end';
            wrapper.style.justifyContent = 'flex-end';
            wrapper.style.padding = '4px';

            // Add background icon?
            const icon = document.createElement('div');
            icon.className = 'slot-icon';
            icon.style.position = 'absolute';
            icon.style.top = '50%';
            icon.style.left = '50%';
            icon.style.transform = 'translate(-50%, -50%)';
            icon.style.width = '60%';
            icon.style.height = '60%';
            icon.style.backgroundSize = 'contain';
            icon.style.backgroundRepeat = 'no-repeat';
            icon.style.backgroundPosition = 'center';
            icon.style.pointerEvents = 'none';
            wrapper.appendChild(icon);

            const count = document.createElement('div');
            count.className = 'slot-count';
            count.style.position = 'relative';
            count.style.zIndex = '1';
            count.innerHTML = this.parseTextVariables(data.text || '', this.state);
            wrapper.appendChild(count);

            wrapper.style.cursor = 'pointer';
        }

        // Attach event listeners
        if (data.script) {
            wrapper.addEventListener('click', () => {
                this.triggerAction(data.script);
            });
        }

        return wrapper;
    }

    onAction(callback) {
        this.onActionCallback = callback;
    }

    triggerAction(script) {
        if (!script) return;
        if (this.onActionCallback) {
            this.onActionCallback(script);
        }
    }

    /**
     * Resolve a dot-notated path against the state object.
     */
    resolvePath(path, obj) {
        if (!path) return undefined;
        // Allows paths like 'player.hp' or 'inventory.0.id'
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }
        return current;
    }

    /**
     * Replaces {path} templates with state values.
     */
    parseTextVariables(text, state) {
        return text.replace(/\{([\w.]+)\}/g, (match, path) => {
            const val = this.resolvePath(path, state);
            return val !== undefined ? val : match;
        });
    }

    /**
     * Sync the UI to the current game state.
     * @param {Object} newState The full state dictionary
     */
    sync(newState) {
        // Merge state
        this.state = { ...this.state, ...newState };

        // Update all elements based on dataBind
        Object.values(this.elements).forEach(({ dom, data }) => {
            const props = data.props || {};
            
            // 1. Text elements (Label, Button) with variables in their text
            if ((data.type === 'label' || data.type === 'button') && data.text) {
                dom.innerHTML = this.parseTextVariables(data.text, this.state);
            }

            // 2. Bar data binding
            if (data.type === 'bar') {
                const label = dom.querySelector('.bar-label');
                if (label && data.text) {
                    label.innerHTML = this.parseTextVariables(data.text, this.state);
                }

                if (props.variable && props.maxVariable) {
                    const currentVal = this.resolvePath(props.variable, this.state) || 0;
                    const maxVal = this.resolvePath(props.maxVariable, this.state) || 1;
                    const pct = Math.max(0, Math.min(100, (currentVal / maxVal) * 100));
                    
                    const fill = dom.querySelector('.bar-fill');
                    if (fill) fill.style.width = `${pct}%`;
                }
            }

            // 3. Slot data binding
            if (data.type === 'slot') {
                const count = dom.querySelector('.slot-count');
                if (count && data.text) {
                    count.innerHTML = this.parseTextVariables(data.text, this.state);
                }

                if (props.variable) {
                    const itemData = this.resolvePath(props.variable, this.state);
                    const icon = dom.querySelector('.slot-icon');
                    
                    if (itemData) {
                        // If itemData is an object with an icon, or just a string id
                        const iconId = itemData.icon || itemData.id || itemData;
                        // Use sprites mapping if available
                        if (window.SPRITES && window.SPRITES[iconId]) {
                            // Extract src from Image object if it's preloaded
                            const src = window.SPRITES[iconId].src || window.SPRITES[iconId];
                            icon.style.backgroundImage = `url('${src}')`;
                        } else {
                            // Fallback to checking assets path
                            icon.style.backgroundImage = `url('/dunyalar/assets/icons/${iconId}.png')`;
                        }
                        
                        if (count && itemData.count !== undefined) {
                            count.innerHTML = itemData.count > 1 ? itemData.count : '';
                        }
                    } else {
                        // Empty slot
                        icon.style.backgroundImage = 'none';
                        if (count) count.innerHTML = '';
                    }
                }
            }
        });
    }

    /**
     * Destroy the UI Runtime instance.
     */
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        window.removeEventListener('resize', this.handleResize.bind(this));
    }
}
