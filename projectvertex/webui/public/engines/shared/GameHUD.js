class GameHUD {
    constructor() {
        this.container = null;
        this.data = null;
        this.currentScreen = null;
        this.elements = {};
        this.state = {};
        this.visible = false;
        this.baseWidth = 800;
        this.baseHeight = 450;
        this._animFrameId = null;
        this._damageFlashTimer = 0;
        this._toasts = [];
    }

    init(parentContainer) {
        if (!parentContainer) {
            console.error('[GameHUD] No parent container provided.');
            return;
        }

        this.container = document.createElement('div');
        this.container.id = 'game-hud-overlay';
        this.container.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none; z-index: 20000;
            font-family: 'VT323', monospace;
            image-rendering: pixelated;
        `;

        this.scaleContainer = document.createElement('div');
        this.scaleContainer.style.cssText = `
            position: absolute; top: 50%; left: 50%;
            transform-origin: center center;
            overflow: hidden;
            image-rendering: pixelated;
        `;
        this.scaleContainer.style.width = this.baseWidth + 'px';
        this.scaleContainer.style.height = this.baseHeight + 'px';

        this.container.appendChild(this.scaleContainer);
        parentContainer.appendChild(this.container);

        // Damage flash edges
        const edgeStyles = 'position:absolute;pointer-events:none;background:radial-gradient(ellipse at center, rgba(231,76,60,0) 40%, rgba(231,76,60,0.4) 100%);opacity:0;transition:opacity 0.15s ease-out;z-index:9999;';
        ['top','bottom','left','right'].forEach(side => {
            const el = document.createElement('div');
            el.className = 'hud-damage-edge';
            if (side === 'top' || side === 'bottom') {
                el.style.cssText = edgeStyles + `top:${side === 'top' ? '0' : 'auto'};bottom:${side === 'bottom' ? '0' : 'auto'};left:0;width:100%;height:30%;`;
            } else {
                el.style.cssText = edgeStyles + `top:0;left:${side === 'left' ? '0' : 'auto'};right:${side === 'right' ? '0' : 'auto'};width:15%;height:100%;`;
            }
            this.container.appendChild(el);
        });

        window.addEventListener('resize', () => this._handleResize());
        this._handleResize();
    }

    _handleResize() {
        if (!this.container || !this.scaleContainer) return;
        const pw = this.container.clientWidth;
        const ph = this.container.clientHeight;
        if (pw === 0 || ph === 0) {
            if (!this._resizePending) {
                this._resizePending = true;
                requestAnimationFrame(() => { this._resizePending = false; this._handleResize(); });
            }
            return;
        }
        const scale = Math.min(pw / this.baseWidth, ph / this.baseHeight);
        this.scaleContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    load(uiData) {
        this.data = uiData;
        if (uiData && uiData.resolution) {
            this.baseWidth = uiData.resolution.w || 800;
            this.baseHeight = uiData.resolution.h || 450;
            this.scaleContainer.style.width = this.baseWidth + 'px';
            this.scaleContainer.style.height = this.baseHeight + 'px';
            this._handleResize();
        }
    }

    showScreen(screenId) {
        if (!this.data || !this.data.screens || !this.data.screens[screenId]) {
            console.warn(`[GameHUD] Screen '${screenId}' not found.`);
            return;
        }

        this.currentScreen = screenId;
        this.scaleContainer.innerHTML = '';
        this.elements = {};

        const screenData = this.data.screens[screenId];
        if (!screenData.elements) return;

        screenData.elements.forEach(elData => {
            if (this._evaluateCondition(elData)) {
                const domEl = this._buildElement(elData);
                if (domEl) {
                    this.elements[elData.id] = { dom: domEl, data: elData };
                    this.scaleContainer.appendChild(domEl);
                }
            }
        });

        this.sync(this.state);
        this.visible = true;
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
            this.visible = false;
        }
    }

    show() {
        if (this.container) {
            this.container.style.display = '';
            this.visible = true;
        }
    }

    _resolvePath(path, obj) {
        if (!path) return undefined;
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }
        return current;
    }

    _parseText(text) {
        return text.replace(/\{([\w.]+)\}/g, (match, path) => {
            const val = this._resolvePath(path, this.state);
            return val !== undefined ? val : match;
        });
    }

    _evaluateCondition(elData) {
        if (!elData.condition) return true;
        try {
            return Function('state', `return ${elData.condition}`)(this.state);
        } catch (e) {
            return true;
        }
    }

    _getAnchorTransform(anchor) {
        const transforms = {
            'top-left':      { top: '0%', left: '0%',   transform: 'none' },
            'top-center':    { top: '0%', left: '50%',  transform: 'translateX(-50%)' },
            'top-right':     { top: '0%', left: '100%', transform: 'translateX(-100%)' },
            'bottom-left':   { top: '100%', left: '0%',   transform: 'translateY(-100%)' },
            'bottom-center': { top: '100%', left: '50%',  transform: 'translate(-50%, -100%)' },
            'bottom-right':  { top: '100%', left: '100%', transform: 'translate(-100%, -100%)' },
            'center':        { top: '50%', left: '50%',  transform: 'translate(-50%, -50%)' },
            'center-left':   { top: '50%', left: '0%',   transform: 'translateY(-50%)' },
            'center-right':  { top: '50%', left: '100%', transform: 'translate(-100%, -50%)' },
        };
        return transforms[anchor] || transforms['top-left'];
    }

    _buildElement(data) {
        const el = document.createElement('div');
        el.id = `hud-${data.id}`;
        el.style.position = 'absolute';
        el.style.boxSizing = 'border-box';
        el.style.pointerEvents = 'auto';

        const r = data.rect || { x: 0, y: 0, w: 100, h: 30 };
        const anchor = data.anchor || 'top-left';
        const at = this._getAnchorTransform(anchor);

        el.style.top = at.top;
        el.style.left = at.left;
        el.style.transform = at.transform;
        el.style.width = r.w + 'px';
        el.style.height = r.h + 'px';

        if (anchor === 'top-left' || anchor === 'center-left' || anchor === 'bottom-left') {
            el.style.marginLeft = r.x + 'px';
            el.style.marginTop = r.y + 'px';
        }
        if (anchor === 'top-right' || anchor === 'center-right' || anchor === 'bottom-right') {
            el.style.marginRight = r.x + 'px';
            el.style.marginTop = r.y + 'px';
        }
        if (anchor === 'top-center' || anchor === 'bottom-center' || anchor === 'center') {
            el.style.marginTop = r.y + 'px';
        }

        const s = data.style || {};
        if (s.zIndex) el.style.zIndex = s.zIndex;
        if (s.color) el.style.color = s.color;
        if (s.backgroundColor) el.style.background = s.backgroundColor;
        if (s.fontSize) el.style.fontSize = s.fontSize + 'px';
        if (s.fontWeight) el.style.fontWeight = s.fontWeight;
        if (s.textAlign) el.style.textAlign = s.textAlign;
        if (s.borderWidth) {
            el.style.borderWidth = s.borderWidth + 'px';
            el.style.borderStyle = 'solid';
        }
        if (s.borderColor) el.style.borderColor = s.borderColor;
        if (s.borderRadius !== undefined) el.style.borderRadius = s.borderRadius + 'px';
        if (s.boxShadow) el.style.boxShadow = s.boxShadow;
        if (s.textShadow) el.style.textShadow = s.textShadow;
        if (s.textTransform) el.style.textTransform = s.textTransform;
        if (s.letterSpacing !== undefined) el.style.letterSpacing = s.letterSpacing + 'px';
        if (s.opacity !== undefined) el.style.opacity = s.opacity;
        if (s.padding) el.style.padding = s.padding + 'px';

        el.style.display = 'flex';
        el.style.alignItems = 'center';
        if (s.textAlign === 'center') el.style.justifyContent = 'center';
        else if (s.textAlign === 'right') el.style.justifyContent = 'flex-end';
        else el.style.justifyContent = 'flex-start';

        switch (data.type) {
            case 'panel':
                break;

            case 'label':
            case 'button':
                el.innerHTML = this._parseText(data.text || '');
                el.style.userSelect = 'none';
                if (data.type === 'button') el.style.cursor = 'pointer';
                break;

            case 'bar': {
                const fill = document.createElement('div');
                fill.className = 'hud-bar-fill';
                fill.style.cssText = `
                    position: absolute; top: 0; left: 0;
                    height: 100%; pointer-events: none;
                    background: ${(data.props && data.props.fillColor) || '#e74c3c'};
                    width: 100%;
                    transition: width 0.25s steps(8);
                `;
                el.appendChild(fill);

                const label = document.createElement('div');
                label.className = 'hud-bar-label';
                label.style.cssText = `
                    position: relative; z-index: 1;
                    width: 100%; text-align: center;
                    text-shadow: ${(data.style && data.style.textShadow) || '2px 2px 0 #000'};
                `;
                label.innerHTML = this._parseText(data.text || '');
                el.appendChild(label);
                break;
            }

            case 'image':
                if (data.src) {
                    el.style.backgroundImage = `url('${data.src}')`;
                    el.style.backgroundSize = s.backgroundSize || 'contain';
                    el.style.backgroundRepeat = 'no-repeat';
                    el.style.backgroundPosition = 'center';
                }
                break;

            case 'slot': {
                el.style.alignItems = 'flex-end';
                el.style.justifyContent = 'flex-end';
                el.style.padding = '4px';

                const icon = document.createElement('div');
                icon.className = 'hud-slot-icon';
                icon.style.cssText = `
                    position: absolute; top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    width: 60%; height: 60%;
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center;
                    pointer-events: none;
                `;
                el.appendChild(icon);

                const count = document.createElement('div');
                count.className = 'hud-slot-count';
                count.style.cssText = `
                    position: relative; z-index: 1;
                    font-size: 12px; text-shadow: 1px 1px 1px rgba(0,0,0,0.8);
                `;
                count.innerHTML = this._parseText(data.text || '');
                el.appendChild(count);

                el.style.cursor = 'pointer';
                break;
            }
        }

        if (data.script) {
            el.addEventListener('click', () => this._triggerAction(data.script));
        }

        return el;
    }

    _triggerAction(script) {
        if (!script) return;
        if (this.onAction) this.onAction(script);
    }

    sync(newState) {
        this.state = { ...this.state, ...newState };

        Object.values(this.elements).forEach(({ dom, data }) => {
            if (!this._evaluateCondition(data)) {
                dom.style.display = 'none';
                return;
            }
            dom.style.display = '';

            const props = data.props || {};

            if ((data.type === 'label' || data.type === 'button') && data.text) {
                dom.innerHTML = this._parseText(data.text);
            }

            if (data.type === 'bar') {
                const label = dom.querySelector('.hud-bar-label');
                if (label && data.text) {
                    label.innerHTML = this._parseText(data.text);
                }

                if (props.variable && props.maxVariable) {
                    const current = this._resolvePath(props.variable, this.state) || 0;
                    const max = this._resolvePath(props.maxVariable, this.state) || 1;
                    const pct = Math.max(0, Math.min(100, (current / max) * 100));

                    const fill = dom.querySelector('.hud-bar-fill');
                    if (fill) fill.style.width = `${pct}%`;

                    const dir = props.fillDirection || 'left-to-right';
                    if (dir === 'right-to-left') {
                        fill.style.left = 'auto';
                        fill.style.right = '0';
                    }
                }

                if (props.flashOnDamage && props.variable) {
                    const prev = dom._prevHp || this._resolvePath(props.variable, this.state) || 0;
                    const current = this._resolvePath(props.variable, this.state) || 0;
                    if (current < prev) {
                        const fill = dom.querySelector('.hud-bar-fill');
                        if (fill) {
                            fill.style.transition = 'none';
                            fill.style.background = '#fff';
                            setTimeout(() => {
                                fill.style.transition = 'background 0.3s ease-out';
                                fill.style.background = props.fillColor || '#e74c3c';
                            }, 100);
                        }
                    }
                    dom._prevHp = current;
                }
            }

            if (data.type === 'slot') {
                const count = dom.querySelector('.hud-slot-count');
                if (count && data.text) {
                    count.innerHTML = this._parseText(data.text);
                }

                if (props.variable) {
                    const itemData = this._resolvePath(props.variable, this.state);
                    const icon = dom.querySelector('.hud-slot-icon');
                    if (itemData) {
                        const iconId = itemData.icon || itemData.id || itemData;
                        if (window.SPRITES && window.SPRITES[iconId]) {
                            const src = window.SPRITES[iconId].src || window.SPRITES[iconId];
                            icon.style.backgroundImage = `url('${src}')`;
                        } else {
                            icon.style.backgroundImage = `url('/dunyalar/assets/icons/${iconId}.png')`;
                        }
                        if (count && itemData.count !== undefined) {
                            count.innerHTML = itemData.count > 1 ? itemData.count : '';
                        }
                    } else {
                        icon.style.backgroundImage = 'none';
                        if (count) count.innerHTML = '';
                    }
                }
            }
        });

        this._updateDamageFlash();
    }

    _updateDamageFlash() {
        const edges = document.querySelectorAll('.hud-damage-edge');
        if (this.state._damageTimer && this.state._damageTimer > 0) {
            const intensity = Math.min(1, this.state._damageTimer / 0.5);
            edges.forEach(e => e.style.opacity = intensity * 0.6);
            this.state._damageTimer -= 0.016;
        } else {
            edges.forEach(e => e.style.opacity = '0');
        }
    }

    showToast(message, color = '#fff', duration = 2000) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            color: ${color}; font-size: 28px;
            text-shadow: 0 0 10px ${color};
            pointer-events: none; opacity: 1;
            transition: opacity 0.5s ease-out, transform 0.5s ease-out;
            z-index: 1001;
        `;
        toast.textContent = message;
        this.scaleContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -80%)';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 500);
        }, duration);
    }

    showDamageFlash(intensity = 1.0) {
        this.state._damageTimer = Math.max(this.state._damageTimer || 0, intensity);
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
        }
        window.removeEventListener('resize', () => this._handleResize());
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameHUD };
}
if (typeof window !== 'undefined') {
    window.GameHUD = GameHUD;
}
