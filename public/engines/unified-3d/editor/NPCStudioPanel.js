/**
 * NPCStudioPanel.js - NPC archetype placement tools for 3D Studio.
 */

export default class NPCStudioPanel {

    constructor() {
        this.editor = null;
        this.container = null;
        this._selected = 'villager';
        this._archetypes = [
            { id: 'villager', label: 'Villager', behavior: 'idle', faction: 'civilian', health: 50, speed: 2.5 },
            { id: 'merchant', label: 'Merchant', behavior: 'shop', faction: 'civilian', health: 60, speed: 2 },
            { id: 'guard', label: 'Guard', behavior: 'patrol', faction: 'ally', health: 120, speed: 3.5 },
            { id: 'quest-giver', label: 'Quest Giver', behavior: 'quest', faction: 'civilian', health: 80, speed: 1.5 },
            { id: 'companion', label: 'Companion', behavior: 'follow', faction: 'ally', health: 110, speed: 4 },
            { id: 'healer', label: 'Healer', behavior: 'support', faction: 'ally', health: 90, speed: 3 },
            { id: 'trainer', label: 'Trainer', behavior: 'dialogue', faction: 'civilian', health: 100, speed: 2.5 },
            { id: 'enemy-grunt', label: 'Enemy Grunt', behavior: 'hostile', faction: 'enemy', health: 80, speed: 4 },
            { id: 'boss', label: 'Boss', behavior: 'boss', faction: 'enemy', health: 500, speed: 3 },
        ];
    }

    async onAttach(editor) {
        this.editor = editor;
        this.container = document.getElementById('mode-tools');
        if (!this.container) return;
        this._renderToolbar();
    }

    _selectedArchetype() {
        return this._archetypes.find(a => a.id === this._selected) || this._archetypes[0];
    }

    _renderToolbar() {
        if (!this.container) return;
        const cards = this._archetypes.map(archetype => {
            const active = archetype.id === this._selected ? ' active' : '';
            return `
                <div class="prop-card${active}" data-npc-archetype="${archetype.id}" title="${archetype.label}">
                    <div class="prop-icon"><i class="fas fa-user-friends"></i></div>
                    <div class="prop-label">${archetype.label}</div>
                </div>
            `;
        }).join('');

        const archetype = this._selectedArchetype();
        this.container.innerHTML = `
            <div class="tool-section">
                <div class="tool-section-title">NPC STUDIO</div>
                <div class="prop-grid">${cards}</div>
            </div>
            <div class="tool-section">
                <div class="tool-section-title">AI DEFAULTS</div>
                <div class="tool-row">
                    <label class="prop-label">Behavior</label>
                    <select id="npc-behavior" class="tool-select-sm">
                        ${this._option('idle', 'Idle', archetype.behavior)}
                        ${this._option('patrol', 'Patrol', archetype.behavior)}
                        ${this._option('hostile', 'Hostile', archetype.behavior)}
                        ${this._option('follow', 'Follow', archetype.behavior)}
                        ${this._option('shop', 'Shop', archetype.behavior)}
                        ${this._option('quest', 'Quest', archetype.behavior)}
                        ${this._option('support', 'Support', archetype.behavior)}
                        ${this._option('boss', 'Boss', archetype.behavior)}
                    </select>
                </div>
                <div class="tool-row">
                    <label class="prop-label">Faction</label>
                    <select id="npc-faction" class="tool-select-sm">
                        ${this._option('civilian', 'Civilian', archetype.faction)}
                        ${this._option('ally', 'Ally', archetype.faction)}
                        ${this._option('enemy', 'Enemy', archetype.faction)}
                        ${this._option('neutral', 'Neutral', archetype.faction)}
                    </select>
                </div>
                ${this._numberRow('npc-health', 'Health', archetype.health, 1, 9999)}
                ${this._numberRow('npc-speed', 'Speed', archetype.speed, 0, 50, 0.5)}
                ${this._numberRow('npc-detection', 'Detect', 10, 0, 100, 1)}
            </div>
            <div class="tool-section">
                <div class="tool-section-title">PLACEMENT</div>
                <div class="tool-buttons-col">
                    <button class="action-btn active" id="npc-place-cursor"><i class="fas fa-location-crosshairs"></i> Click to Place</button>
                    <button class="action-btn" id="npc-place-origin"><i class="fas fa-crosshairs"></i> Place at Origin</button>
                </div>
            </div>
        `;

        this.container.querySelectorAll('[data-npc-archetype]').forEach(card => {
            card.addEventListener('click', () => {
                this._selected = card.dataset.npcArchetype;
                this._renderToolbar();
                this.editor?.setActiveTool('draw');
            });
        });
        document.getElementById('npc-place-cursor')?.addEventListener('click', () => this.editor?.setActiveTool('draw'));
        document.getElementById('npc-place-origin')?.addEventListener('click', () => {
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
        const archetype = this._selectedArchetype();
        return {
            studio: 'npc',
            archetype: archetype.id,
            label: archetype.label,
            behavior: document.getElementById('npc-behavior')?.value || archetype.behavior,
            faction: document.getElementById('npc-faction')?.value || archetype.faction,
            health: this._readNumber('npc-health', archetype.health),
            speed: this._readNumber('npc-speed', archetype.speed),
            detectionRadius: this._readNumber('npc-detection', 10),
        };
    }

    placeSelectedAt(position) {
        if (!this.editor || !position) return;
        const archetype = this._selectedArchetype();
        const type = archetype.id === 'enemy-grunt' || archetype.id === 'boss' ? 'enemy' : 'npc';
        this.editor.placeEntityAt(position, type, this._buildProperties());
    }

    onSerialize(data) {
        data.npcStudio = {
            count: (data.entities || []).filter(ent => ent.properties?.studio === 'npc').length
        };
    }

    onSceneRebuilt() {}
    onModeChanged() {}

    getDrawState() {
        return { mode: 'pencil', tool: 'npc-studio', block: 'npc', width: 1, height: 2, depth: 1, snap: true };
    }

    dispose() {
        if (this.container) this.container.innerHTML = '';
    }
}
