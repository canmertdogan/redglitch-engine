/**
 * PlayerStudioPanel.js - Player spawn and controller preset tools for 3D Studio.
 */

export default class PlayerStudioPanel {

    constructor() {
        this.editor = null;
        this.container = null;
        this._selected = 'adventurer';
        this._profiles = [
            { id: 'adventurer', label: 'Adventurer', type: 'player-spawn', camera: 'third-person', health: 100, speed: 6, jump: 8 },
            { id: 'fps-soldier', label: 'FPS Soldier', type: 'player-spawn', camera: 'fps', health: 125, speed: 6.5, jump: 6 },
            { id: 'platform-hero', label: 'Platform Hero', type: 'player-spawn', camera: 'side', health: 100, speed: 7, jump: 11 },
            { id: 'rpg-hero', label: 'RPG Hero', type: 'player-spawn', camera: 'topdown', health: 150, speed: 4.5, jump: 4 },
            { id: 'spectator', label: 'Spectator', type: 'player-spawn', camera: 'free', health: 1, speed: 10, jump: 0 },
        ];
    }

    async onAttach(editor) {
        this.editor = editor;
        this.container = document.getElementById('mode-tools');
        if (!this.container) return;
        this._renderToolbar();
    }

    _selectedProfile() {
        return this._profiles.find(p => p.id === this._selected) || this._profiles[0];
    }

    _renderToolbar() {
        if (!this.container) return;

        const cards = this._profiles.map(profile => {
            const active = profile.id === this._selected ? ' active' : '';
            return `
                <div class="prop-card${active}" data-player-profile="${profile.id}" title="${profile.label}">
                    <div class="prop-icon"><i class="fas fa-user"></i></div>
                    <div class="prop-label">${profile.label}</div>
                </div>
            `;
        }).join('');

        const profile = this._selectedProfile();
        this.container.innerHTML = `
            <div class="tool-section">
                <div class="tool-section-title">PLAYER STUDIO</div>
                <div class="prop-grid">${cards}</div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">CONTROLLER</div>
                <div class="tool-row">
                    <label class="prop-label">Camera</label>
                    <select id="player-camera-mode" class="tool-select-sm">
                        ${this._option('third-person', 'Third Person', profile.camera)}
                        ${this._option('fps', 'FPS', profile.camera)}
                        ${this._option('topdown', 'Top-Down', profile.camera)}
                        ${this._option('side', 'Side View', profile.camera)}
                        ${this._option('free', 'Free Cam', profile.camera)}
                    </select>
                </div>
                ${this._numberRow('player-health', 'Health', profile.health, 1, 999)}
                ${this._numberRow('player-speed', 'Speed', profile.speed, 0, 50, 0.5)}
                ${this._numberRow('player-jump', 'Jump', profile.jump, 0, 50, 0.5)}
            </div>
            <div class="tool-section">
                <div class="tool-section-title">PLACEMENT</div>
                <div class="tool-buttons-col">
                    <button class="action-btn active" id="player-place-cursor"><i class="fas fa-location-crosshairs"></i> Click to Place</button>
                    <button class="action-btn" id="player-place-origin"><i class="fas fa-crosshairs"></i> Place at Origin</button>
                </div>
            </div>
        `;

        this.container.querySelectorAll('[data-player-profile]').forEach(card => {
            card.addEventListener('click', () => {
                this._selected = card.dataset.playerProfile;
                this._renderToolbar();
                this.editor?.setActiveTool('draw');
            });
        });
        document.getElementById('player-place-cursor')?.addEventListener('click', () => this.editor?.setActiveTool('draw'));
        document.getElementById('player-place-origin')?.addEventListener('click', () => {
            if (!this.editor?.THREE) return;
            this.placeSelectedAt(new this.editor.THREE.Vector3(0, 0, 0));
        });
    }

    _option(value, label, current) {
        return `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`;
    }

    _numberRow(id, label, value, min, max, step = 1) {
        return `
            <div class="tool-row">
                <label class="prop-label">${label}</label>
                <input id="${id}" class="tool-input-sm" type="number" min="${min}" max="${max}" step="${step}" value="${value}">
            </div>
        `;
    }

    _readNumber(id, fallback) {
        const val = parseFloat(document.getElementById(id)?.value);
        return Number.isFinite(val) ? val : fallback;
    }

    _buildProperties() {
        const profile = this._selectedProfile();
        return {
            studio: 'player',
            profile: profile.id,
            label: profile.label,
            cameraMode: document.getElementById('player-camera-mode')?.value || profile.camera,
            health: this._readNumber('player-health', profile.health),
            speed: this._readNumber('player-speed', profile.speed),
            jump: this._readNumber('player-jump', profile.jump),
            primarySpawn: true,
        };
    }

    placeSelectedAt(position) {
        if (!this.editor || !position) return;
        const profile = this._selectedProfile();
        this.editor.placeEntityAt(position, profile.type, this._buildProperties());
    }

    onSerialize(data) {
        const spawn = (data.entities || []).find(ent =>
            ent.type === 'player-spawn' || ent.type === 'player_spawn' || ent.properties?.studio === 'player'
        );
        if (!spawn?.position) return;
        data.playerSpawn = { x: spawn.position[0], y: spawn.position[1], z: spawn.position[2] };
        data.player = { ...(data.player || {}), ...(spawn.properties || {}) };
    }

    onSceneRebuilt() {}
    onModeChanged() {}

    getDrawState() {
        return { mode: 'pencil', tool: 'player-studio', block: 'player-spawn', width: 1, height: 2, depth: 1, snap: true };
    }

    dispose() {
        if (this.container) this.container.innerHTML = '';
    }
}
