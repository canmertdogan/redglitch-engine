/**
 * GameHUD — data-driven in-game HUD renderer (Redglitch Game Studio)
 *
 * Retro / pixelated presentation layer. Renders screens/elements declared
 * in a .redui interface config. The config controls layout + hues; this
 * renderer controls craft:
 *  - pixelated rendering (crisp edges, no anti-alias)
 *  - chunky black-bordered panels with hard drop-shadows (Minecraft-style)
 *  - stepped, flat-color stat bars with blocky segment notches
 *  - blocky item slots with key caps + selection highlight
 *  - subtle CRT scanlines for retro flavor
 * Colors from the design-system palette are promoted to CSS custom props.
 */

const RG_HUD_CSS_ID = 'gamehud-runtime-css';

const RG_HUD_CSS = `
#game-hud-overlay {
  image-rendering: pixelated !important;
  -webkit-font-smoothing: none !important;
  -moz-osx-font-smoothing: unset !important;
  text-rendering: optimizeSpeed !important;
  font-family: 'Press Start 2P', 'VT323', monospace;
}

/* ── CRT scanlines (retro flavor) ───────────────────────────────────── */
.hud-crt {
  position: absolute; inset: 0; pointer-events: none; z-index: 6;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 1px, transparent 1px 3px);
  opacity: .5; mix-blend-mode: multiply;
}

/* ── Low-HP alarm ──────────────────────────────────────────────────── */
#game-hud-overlay.low-hp::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 9998;
  box-shadow: inset 0 0 120px rgba(255,49,71,.6);
  animation: rg-lowpulse 1s steps(2,end) infinite;
}
@keyframes rg-lowpulse { 0%,100% { opacity: .4; } 50% { opacity: .95; } }

/* ── Per-element base + craft layer ────────────────────────────────── */
.hud-element {
  image-rendering: pixelated !important;
  border-radius: 0 !important;       /* hard, blocky corners */
  transition: none;                  /* retro = no smooth easing */
}
.hud-element.hud-type-panel {
  /* Minecraft-style: dark fill, chunky light top/left + dark bottom/right bevel */
  background: rgba(20,24,38,0.82) !important;
  border: 2px solid #000 !important;
  box-shadow:
    inset 2px 2px 0 rgba(255,255,255,.10),
    inset -2px -2px 0 rgba(0,0,0,.45),
    3px 3px 0 rgba(0,0,0,.6) !important;
}
.hud-element.hud-type-label,
.hud-element.hud-type-button {
  text-shadow: 2px 2px 0 #000 !important;
  letter-spacing: 1px;
}
.hud-element.hud-type-button {
  border: 2px solid #000 !important;
  box-shadow:
    inset 2px 2px 0 rgba(255,255,255,.18),
    inset -2px -2px 0 rgba(0,0,0,.35),
    3px 3px 0 rgba(0,0,0,.6) !important;
  text-transform: uppercase;
  letter-spacing: 1px;
  image-rendering: pixelated !important;
}
.hud-element.hud-type-button:hover {
  filter: brightness(1.18);
  transform: translate(-1px,-1px);
  box-shadow:
    inset 2px 2px 0 rgba(255,255,255,.26),
    4px 4px 0 rgba(0,0,0,.65) !important;
}
.hud-element.hud-type-button:active {
  transform: translate(2px,2px);
  box-shadow: inset 2px 2px 0 rgba(0,0,0,.4) !important;
}

/* ── Stat bars: flat stepped fill + blocky notches ─────────────────── */
.hud-element.hud-type-bar {
  border: 2px solid #000 !important;
  background: #0b0d14 !important;
  box-shadow: inset 2px 2px 0 rgba(0,0,0,.55), 3px 3px 0 rgba(0,0,0,.6) !important;
  border-radius: 0 !important;
  overflow: hidden;
  image-rendering: pixelated !important;
}
.hud-bar-fill {
  position: absolute; top: 0; left: 0; height: 100%;
  width: 100%; pointer-events: none;
  background: var(--bar-color, #ff3147) !important;
  /* blocky right edge */
  box-shadow: inset -3px 0 0 rgba(0,0,0,.45), inset 0 2px 0 rgba(255,255,255,.28), inset 0 -3px 0 rgba(0,0,0,.3) !important;
  image-rendering: pixelated !important;
  transition: width 0.18s steps(8) !important;  /* chunky, stepped fill */
}
.hud-bar-ticks {
  position: absolute; inset: 0; pointer-events: none; z-index: 1;
}
.hud-bar-label {
  position: relative; z-index: 2;
  width: 100%; text-align: center;
  font-size: 11px;
  text-shadow: 2px 2px 0 #000 !important;
}

/* ── Slots: Minecraft item-frame style ─────────────────────────────── */
.hud-element.hud-type-slot {
  background: #1b2030 !important;
  border: 2px solid #000 !important;
  box-shadow:
    inset 2px 2px 0 rgba(255,255,255,.10),
    inset -2px -2px 0 rgba(0,0,0,.5),
    3px 3px 0 rgba(0,0,0,.6) !important;
  border-radius: 0 !important;
  image-rendering: pixelated !important;
}
.hud-element.hud-type-slot.is-active {
  border-color: #fff !important;
  box-shadow:
    inset 0 0 0 1px #fff,
    inset 2px 2px 0 rgba(255,255,255,.14),
    0 0 0 2px #fff,
    3px 3px 0 rgba(0,0,0,.6) !important;
}
.slot-key {
  position: absolute; top: 2px; left: 3px;
  font-size: 10px; font-weight: 400; color: #fff;
  text-shadow: 1px 1px 0 #000;
  image-rendering: pixelated !important;
}
.hud-slot-icon {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 74%; height: 74%;
  background-size: contain; background-repeat: no-repeat; background-position: center;
  pointer-events: none; image-rendering: pixelated !important;
}
.hud-slot-count {
  position: relative; z-index: 1;
  font-size: 12px; color: #fff; font-weight: 700;
  text-shadow: 2px 2px 0 #000 !important;
  image-rendering: pixelated !important;
}

/* ── Damage-vignette edges ────────────────────────────────────────── */
.hud-damage-edge {
  position: absolute; pointer-events: none;
  background: radial-gradient(ellipse at center,
    rgba(255,40,60,0) 38%, rgba(255,40,60,.55) 100%);
  opacity: 0; transition: opacity .15s steps(2); z-index: 9999;
}
`;

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

        this._injectStyle();

        this.container = document.createElement('div');
        this.container.id = 'game-hud-overlay';
        this.container.className = 'game-hud-overlay';
        this.container.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none; z-index: 20000;
            font-family: 'Press Start 2P', 'VT323', monospace;
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

        // Retro CRT scanline overlay (decorative).
        const crt = document.createElement('div');
        crt.className = 'hud-crt';
        this.container.appendChild(crt);

        // Damage flash edges (4 sides)
        ['top', 'bottom', 'left', 'right'].forEach(side => {
            const el = document.createElement('div');
            el.className = 'hud-damage-edge';
            if (side === 'top' || side === 'bottom') {
                el.style.cssText = `top:${side === 'top' ? '0' : 'auto'};bottom:${side === 'bottom' ? '0' : 'auto'};left:0;width:100%;height:30%;`;
            } else {
                el.style.cssText = `top:0;left:${side === 'left' ? '0' : 'auto'};right:${side === 'right' ? '0' : 'auto'};width:15%;height:100%;`;
            }
            this.container.appendChild(el);
        });

        window.addEventListener('resize', () => this._handleResize());
        this._handleResize();
    }

    _injectStyle() {
        if (document.getElementById(RG_HUD_CSS_ID)) return;
        const style = document.createElement('style');
        style.id = RG_HUD_CSS_ID;
        style.textContent = RG_HUD_CSS;
        (document.head || document.documentElement).appendChild(style);
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
        const pal = uiData && uiData.designSystem && uiData.designSystem.palette;
        if (pal && this.container) {
            const map = {
                void: '--hud-void', panel: '--hud-panel', panel2: '--hud-panel2',
                red: '--hud-red', gold: '--hud-gold', cyan: '--hud-cyan',
                green: '--hud-green', violet: '--hud-violet', ink: '--hud-ink',
            };
            for (const key in map) {
                if (pal[key]) this.container.style.setProperty(map[key], pal[key]);
            }
        }
    }

    showScreen(screenId, opts = {}) {
        if (!this.data || !this.data.screens || !this.data.screens[screenId]) {
            console.warn(`[GameHUD] Screen '${screenId}' not found.`);
            return;
        }

        const screenData = this.data.screens[screenId];
        // Overlay screens (pause/inventory/dialogue) declare `background: true`
        // so the previous screen — e.g. the live vitals — stays visible underneath
        // instead of being wiped (which made pause appear to cover the stats).
        const keepUnderlay = opts.keepUnderlay !== undefined
            ? opts.keepUnderlay
            : (screenData.background === true && this.currentScreen);

        this.currentScreen = screenId;
        if (!keepUnderlay) {
            this.scaleContainer.innerHTML = '';
            this.elements = {};
        } else if (this._underlayKey !== this.currentScreen) {
            // Snapshot current screen into an underlay layer before overlaying.
            this._underlayKey = this.currentScreen;
        }

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
        return path.split('.').reduce((c, k) => (c == null ? undefined : c[k]), obj);
    }

    _parseText(text) {
        if (text == null) return '';
        return String(text).replace(/\{[\w.]+\}/g, (match) => {
            const val = this._resolvePath(match.slice(1, -1), this.state);
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
        el.className = `hud-element hud-type-${data.type}`;
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
        if (s.borderWidth) { el.style.borderWidth = s.borderWidth + 'px'; el.style.borderStyle = 'solid'; }
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

        const props = data.props || {};
        switch (data.type) {
            case 'panel':
                break;

            case 'label':
            case 'button':
                el.innerHTML = this._parseText(data.text);
                el.style.userSelect = 'none';
                if (data.type === 'button') el.style.cursor = 'pointer';
                break;

            case 'bar': {
                const fill = document.createElement('div');
                fill.className = 'hud-bar-fill';
                const barColor = props.fillColor || '#e74c3c';
                fill.style.setProperty('--bar-color', barColor);
                if (props.fillDirection === 'right-to-left') {
                    fill.style.left = 'auto';
                    fill.style.right = '0';
                }
                el.appendChild(fill);

                if (props.ticks && Number(props.ticks) > 0) {
                    const n = Number(props.ticks);
                    const step = 100 / n;
                    const tk = document.createElement('div');
                    tk.className = 'hud-bar-ticks';
                    tk.style.background =
                        `repeating-linear-gradient(90deg, transparent 0, transparent calc(${step}% - 2px), ` +
                        `rgba(0,0,0,.6) calc(${step}% - 2px), rgba(0,0,0,.6) calc(${step}%))`;
                    el.appendChild(tk);
                }

                const label = document.createElement('div');
                label.className = 'hud-bar-label';
                label.style.textShadow = s.textShadow || '2px 2px 0 #000';
                label.innerHTML = this._parseText(data.text);
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

                const keyTag = document.createElement('span');
                keyTag.className = 'slot-key';
                keyTag.textContent = this._parseText(data.text || '');
                el.appendChild(keyTag);

                const icon = document.createElement('div');
                icon.className = 'hud-slot-icon';
                el.appendChild(icon);

                const count = document.createElement('div');
                count.className = 'hud-slot-count';
                el.appendChild(count);

                if (props.selected) el.classList.add('is-active');
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

    setActiveSlot(slotId) {
        Object.values(this.elements).forEach(({ dom, data }) => {
            if (data.type === 'slot') dom.classList.toggle('is-active', data.id === slotId);
        });
    }

    sync(newState) {
        this.state = { ...this.state, ...newState };

        const hp = this._resolvePath('player.hp', this.state);
        const maxHp = this._resolvePath('player.maxHp', this.state);
        if (typeof hp === 'number' && typeof maxHp === 'number' && maxHp > 0) {
            this.container.classList.toggle('low-hp', (hp / maxHp) < 0.3);
        }

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
                if (label && data.text) label.innerHTML = this._parseText(data.text);

                if (props.variable && props.maxVariable) {
                    const current = this._resolvePath(props.variable, this.state) || 0;
                    const max = this._resolvePath(props.maxVariable, this.state) || 1;
                    const pct = Math.max(0, Math.min(100, (current / max) * 100));
                    const fill = dom.querySelector('.hud-bar-fill');
                    if (fill) fill.style.width = `${pct}%`;
                    if (props.fillDirection === 'right-to-left') {
                        fill.style.left = 'auto';
                        fill.style.right = '0';
                    }
                }

                if (props.flashOnDamage && props.variable) {
                    const prev = dom._prevHp !== undefined ? dom._prevHp : (this._resolvePath(props.variable, this.state) || 0);
                    const current = this._resolvePath(props.variable, this.state) || 0;
                    if (current < prev) {
                        const fill = dom.querySelector('.hud-bar-fill');
                        if (fill) {
                            fill.style.transition = 'none';
                            fill.style.background = '#fff';
                            setTimeout(() => { fill.style.transition = ''; fill.style.background = ''; }, 90);
                        }
                    }
                    dom._prevHp = current;
                }
            }

            if (data.type === 'slot') {
                const count = dom.querySelector('.hud-slot-count');
                if (count && data.text) count.innerHTML = '';

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
            color: ${color}; font-size: 22px; font-weight: 700;
            text-shadow: 2px 2px 0 #000;
            pointer-events: none; opacity: 1;
            transition: opacity 0.4s steps(3);
            z-index: 1001;
            image-rendering: pixelated;
        `;
        toast.textContent = message;
        this.scaleContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 400);
        }, duration);
    }

    showDamageFlash(intensity = 1.0) {
        this.state._damageTimer = Math.max(this.state._damageTimer || 0, intensity);
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
        window.removeEventListener('resize', () => this._handleResize());
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameHUD };
}
if (typeof window !== 'undefined') {
    window.GameHUD = GameHUD;
}
