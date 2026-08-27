// public/base_game/fxSystem.js
// Shared FXSystem default used by editor.html, iso_editor.html, character_editor,
// dialogue_editor, item_editor and skill_editor. Engine-specific editors may load
// their own richer FXSystem afterwards (which overwrites window.FXSystem). This
// base implementation guarantees the global exists so `new FXSystem(...)` never
// throws with a 404 / ReferenceError.
window.FXSystem = class FXSystem {
    constructor(ctx, width, height) {
        this.ctx = ctx || null;
        this.width = width || 0;
        this.height = height || 0;
        this.time = 12;                 // 0-24h
        this.ambientColor = '#ffffff';
        this.ambientIntensity = 1.0;
        this.playerLight = null;
        this.weather = 'clear';
        this.softLights = new Map();
        this.lightingPreset = 'default';
    }

    resize(width, height) {
        if (width != null) this.width = width;
        if (height != null) this.height = height;
    }

    setTime(hour) { this.time = hour; }
    getTime() { return this.time; }

    applyLightingPreset(preset) { this.lightingPreset = preset || 'default'; }

    setPlayerLight(x, y, z, opts = {}) {
        this.playerLight = { x, y, z, ...opts };
    }

    setWeather(weather) { this.weather = weather || 'clear'; }

    get ambientColor() { return this._ambientColor || '#ffffff'; }
    set ambientColor(value) { this._ambientColor = value; }

    get ambientIntensity() { return this._ambientIntensity != null ? this._ambientIntensity : 1.0; }
    set ambientIntensity(value) { this._ambientIntensity = value; }

    addSoftLight(id, light) { this.softLights.set(id, light); }
    removeSoftLight(id) { this.softLights.delete(id); }

    update() { /* no-op base implementation */ }
    render() { /* no-op base implementation */ }
    dispose() { this.softLights.clear(); }
};
