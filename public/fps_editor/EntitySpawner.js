/**
 * EntitySpawner.js — Phase 40
 * Entity instance manager and property editor for the FPS Map Editor.
 *
 * Responsibilities:
 *   - Live list of all placed entities with select / delete
 *   - Per-instance property editor (type-specific + custom JSON key-value pairs)
 *   - Patrol waypoint chain editor for enemy-patrol entities
 *   - Door ↔ trigger link editor (switch triggers door animation)
 *   - Enhanced trigger instance list with event type, action, and W/H/D resize
 *   - Level exit zone: auto-tags entity in the list
 *
 * Integration:
 *   - init(entityMount, triggerMount) — mounts two independent UI sections
 *   - syncEntities(entities[])        — call whenever _state.entities changes
 *   - syncTriggers(triggers[])        — call whenever _state.triggers changes
 *   - onEntityChanged(cb)             — cb(type, id, data) — 'update'/'remove'
 *   - onTriggerChanged(cb)            — cb(type, id, data)
 *
 * Public API:
 *   init, syncEntities, syncTriggers, onEntityChanged, onTriggerChanged,
 *   selectEntity, selectTrigger, addWaypoint, removeWaypoint
 */

/* global window, document */
const EntitySpawner = (() => {
    'use strict';

    // ── state ─────────────────────────────────────────────────────────────────

    let _entities      = [];
    let _triggers      = [];
    let _selEntityId   = null;
    let _selTriggerId  = null;
    let _onEntityCh    = null;
    let _onTriggerCh   = null;

    // DOM mounts
    let _entMount = null;
    let _trgMount = null;

    // DOM refs (entity side)
    let _elEntList   = null;
    let _elEntProps  = null;

    // DOM refs (trigger side)
    let _elTrgList   = null;
    let _elTrgProps  = null;

    // ── entity display helpers ────────────────────────────────────────────────

    const ENT_META = {
        'player-spawn':  { icon: '👤', label: 'Player Spawn',  color: '#27ae60', cat: 'player'  },
        'enemy-grunt':   { icon: '💀', label: 'Grunt',         color: '#e74c3c', cat: 'enemy'   },
        'enemy-shooter': { icon: '🎯', label: 'Shooter',       color: '#c0392b', cat: 'enemy'   },
        'enemy-patrol':  { icon: '🚶', label: 'Patrol Route',  color: '#922b21', cat: 'enemy'   },
        'pickup-health': { icon: '❤️',  label: 'Health Pack',   color: '#2ecc71', cat: 'pickup'  },
        'pickup-ammo':   { icon: '📦', label: 'Ammo Crate',    color: '#f1c40f', cat: 'pickup'  },
        'pickup-armor':  { icon: '🛡️',  label: 'Armor Shard',  color: '#3498db', cat: 'pickup'  },
        'pickup-weapon': { icon: '🔫', label: 'Weapon Spawn',  color: '#9b59b6', cat: 'pickup'  },
        'door':          { icon: '🚪', label: 'Door',          color: '#e67e22', cat: 'prop'    },
        'switch':        { icon: '🔘', label: 'Switch',        color: '#f39c12', cat: 'prop'    },
        'level-exit':    { icon: '🚀', label: 'Level Exit',    color: '#ff6b35', cat: 'prop'    },
    };

    const TRG_META = {
        'onEnter':        { icon: '→', color: '#3498db' },
        'onExit':         { icon: '←', color: '#9b59b6' },
        'onStay':         { icon: '⏸', color: '#1abc9c' },
        'levelComplete':  { icon: '🏁', color: '#f39c12' },
        'cutscene':       { icon: '🎬', color: '#e74c3c' },
    };

    function _meta(type)    { return ENT_META[type] || { icon: '●', label: type, color: '#aaa', cat: 'misc' }; }
    function _trgMeta(evt)  { return TRG_META[evt]  || { icon: '⚡', color: '#888' }; }
    function _shortId(id)   { return id ? id.slice(-6) : '???'; }

    // ── entity UI ─────────────────────────────────────────────────────────────

    function _buildEntUI(container) {
        _entMount = container;
        container.innerHTML = `
<div class="section-header" style="margin-top:10px">IN MAP
    <span id="es-ent-count" style="float:right;color:#555;font-size:.75rem">0 entities</span>
</div>
<div id="es-ent-list" style="min-height:24px;margin-bottom:6px"></div>
<div id="es-ent-props" style="display:none">
    <div class="section-header">PROPERTIES</div>

    <div class="field-row">
        <label style="min-width:56px;color:#666;font-size:.8rem">Type</label>
        <span id="es-ep-type" style="color:#ff6b35;font-size:.85rem"></span>
    </div>
    <div class="field-row">
        <label style="min-width:56px;color:#666;font-size:.8rem">X / Z</label>
        <input id="es-ep-x" type="number" step="0.25" style="
            width:52px;background:#000;border:1px solid #333;color:#ccc;
            font-size:.8rem;padding:2px 4px;outline:none">
        <input id="es-ep-z" type="number" step="0.25" style="
            width:52px;background:#000;border:1px solid #333;color:#ccc;
            font-size:.8rem;padding:2px 4px;outline:none;margin-left:3px">
    </div>
    <div class="field-row">
        <label style="min-width:56px;color:#666;font-size:.8rem">Yaw °</label>
        <input id="es-ep-yaw" type="number" step="45" min="0" max="359" value="0" style="
            width:60px;background:#000;border:1px solid #333;color:#ccc;
            font-size:.8rem;padding:2px 4px;outline:none">
    </div>

    <!-- door link (only shown for door entities) -->
    <div id="es-door-section" style="display:none">
        <div class="section-header" style="margin-top:8px">DOOR LINK</div>
        <div class="field-row">
            <label style="min-width:56px;color:#666;font-size:.8rem">Linked Trigger</label>
            <input id="es-ep-linked-trigger" type="text" placeholder="trigger ID or 'none'"
                style="flex:1;background:#000;border:1px solid #333;color:#ccc;
                font-size:.78rem;padding:2px 4px;outline:none">
        </div>
        <div class="field-row">
            <label style="min-width:56px;color:#666;font-size:.8rem">Axis</label>
            <select id="es-ep-door-axis" style="
                flex:1;background:#000;border:1px solid #333;color:#ccc;
                font-size:.8rem;padding:2px">
                <option value="y">Slide Up (Y)</option>
                <option value="x">Slide X</option>
                <option value="z">Slide Z</option>
            </select>
        </div>
    </div>

    <!-- patrol waypoints (only shown for enemy-patrol) -->
    <div id="es-patrol-section" style="display:none">
        <div class="section-header" style="margin-top:8px">PATROL WAYPOINTS</div>
        <div id="es-waypoints" style="margin-bottom:4px"></div>
        <button class="action-btn" style="width:100%;font-size:.78rem"
            onclick="EntitySpawner.addWaypoint()">+ Add Waypoint</button>
    </div>

    <!-- pickup weapon type (only shown for pickup-weapon) -->
    <div id="es-weapon-section" style="display:none">
        <div class="section-header" style="margin-top:8px">WEAPON TYPE</div>
        <div class="field-row">
            <label style="min-width:56px;color:#666;font-size:.8rem">Weapon</label>
            <select id="es-ep-weapon" style="
                flex:1;background:#000;border:1px solid #333;color:#ccc;
                font-size:.8rem;padding:2px">
                <option value="pistol">Pistol</option>
                <option value="shotgun">Shotgun</option>
                <option value="rifle">Rifle</option>
                <option value="rocket">Rocket Launcher</option>
                <option value="plasma">Plasma Gun</option>
            </select>
        </div>
    </div>

    <!-- pickup amount (health/ammo/armor) -->
    <div id="es-pickup-section" style="display:none">
        <div class="section-header" style="margin-top:8px">PICKUP AMOUNT</div>
        <div class="field-row">
            <label style="min-width:56px;color:#666;font-size:.8rem">Amount</label>
            <input id="es-ep-amount" type="number" min="1" max="999" value="25" style="
                width:60px;background:#000;border:1px solid #333;color:#ccc;
                font-size:.8rem;padding:2px 4px;outline:none">
        </div>
    </div>

    <!-- enemy settings (grunt / shooter) -->
    <div id="es-enemy-section" style="display:none">
        <div class="section-header" style="margin-top:8px">ENEMY SETTINGS</div>
        <div class="field-row">
            <label style="min-width:56px;color:#666;font-size:.8rem">HP</label>
            <input id="es-ep-hp" type="number" min="1" max="9999" value="100" style="
                width:60px;background:#000;border:1px solid #333;color:#ccc;
                font-size:.8rem;padding:2px 4px;outline:none">
        </div>
        <div class="field-row">
            <label style="min-width:56px;color:#666;font-size:.8rem">Alert Radius</label>
            <input id="es-ep-alert-radius" type="number" min="1" max="100" value="10" style="
                width:60px;background:#000;border:1px solid #333;color:#ccc;
                font-size:.8rem;padding:2px 4px;outline:none">
        </div>
    </div>

    <!-- custom JSON props -->
    <div class="section-header" style="margin-top:8px">CUSTOM PROPS
        <button class="action-btn" style="float:right;padding:1px 6px;font-size:.7rem"
            onclick="EntitySpawner._addCustomProp()">+</button>
    </div>
    <div id="es-custom-props" style="margin-bottom:4px"></div>

    <div style="display:flex;gap:4px;margin-top:6px">
        <button class="action-btn" style="flex:1" onclick="EntitySpawner._applyEntProps()">Apply</button>
        <button class="action-btn" style="flex:1;color:#e74c3c" onclick="EntitySpawner._deleteEnt()">Delete</button>
    </div>
</div>
`;
        _elEntList  = container.querySelector('#es-ent-list');
        _elEntProps = container.querySelector('#es-ent-props');
    }

    function _buildTrgUI(container) {
        _trgMount = container;
        // Replace the entire "In Map" section
        container.innerHTML = `
<div class="section-header" style="margin-top:10px">IN MAP
    <span id="es-trg-count" style="float:right;color:#555;font-size:.75rem">0 triggers</span>
</div>
<div id="es-trg-list" style="min-height:24px;margin-bottom:6px"></div>
<div id="es-trg-props" style="display:none">
    <div class="section-header">TRIGGER PROPERTIES</div>
    <div class="field-row">
        <label style="min-width:52px;color:#666;font-size:.8rem">Event</label>
        <select id="es-tp-event" style="flex:1;background:#000;border:1px solid #333;
            color:#ccc;font-family:inherit;font-size:.8rem;padding:2px">
            <option value="onEnter">onEnter</option>
            <option value="onExit">onExit</option>
            <option value="onStay">onStay</option>
            <option value="levelComplete">levelComplete</option>
            <option value="cutscene">cutscene</option>
        </select>
    </div>
    <div class="field-row">
        <label style="min-width:52px;color:#666;font-size:.8rem">Action</label>
        <input id="es-tp-action" type="text" placeholder="e.g. openDoor:door_abc123"
            style="flex:1;background:#000;border:1px solid #333;color:#ccc;
            font-size:.78rem;padding:2px 4px;outline:none">
    </div>
    <div class="field-row">
        <label style="min-width:52px;color:#666;font-size:.8rem">W / H / D</label>
        <input id="es-tp-w" type="number" step="0.5" min="0.5" value="2" style="
            width:40px;background:#000;border:1px solid #333;color:#ccc;
            font-size:.8rem;padding:2px 3px;outline:none">
        <input id="es-tp-h" type="number" step="0.5" min="0.5" value="2.5" style="
            width:40px;background:#000;border:1px solid #333;color:#ccc;
            font-size:.8rem;padding:2px 3px;outline:none;margin:0 2px">
        <input id="es-tp-d" type="number" step="0.5" min="0.5" value="2" style="
            width:40px;background:#000;border:1px solid #333;color:#ccc;
            font-size:.8rem;padding:2px 3px;outline:none">
    </div>
    <div class="field-row">
        <label style="min-width:52px;color:#666;font-size:.8rem">X / Z</label>
        <input id="es-tp-x" type="number" step="0.5" style="
            width:52px;background:#000;border:1px solid #333;color:#ccc;
            font-size:.8rem;padding:2px 3px;outline:none">
        <input id="es-tp-z" type="number" step="0.5" style="
            width:52px;background:#000;border:1px solid #333;color:#ccc;
            font-size:.8rem;padding:2px 3px;outline:none;margin-left:3px">
    </div>
    <div style="display:flex;gap:4px;margin-top:6px">
        <button class="action-btn" style="flex:1" onclick="EntitySpawner._applyTrgProps()">Apply</button>
        <button class="action-btn" style="flex:1;color:#e74c3c" onclick="EntitySpawner._deleteTrg()">Delete</button>
    </div>
</div>
`;
        _elTrgList  = container.querySelector('#es-trg-list');
        _elTrgProps = container.querySelector('#es-trg-props');
    }

    // ── entity list rebuild ───────────────────────────────────────────────────

    function _rebuildEntList() {
        if (!_elEntList) return;
        const countEl = _entMount?.querySelector('#es-ent-count');
        if (countEl) countEl.textContent = `${_entities.length} entit${_entities.length === 1 ? 'y' : 'ies'}`;

        if (!_entities.length) {
            _elEntList.innerHTML = '<div style="color:#444;font-size:.8rem;padding:4px 0">No entities placed.</div>';
            return;
        }
        _elEntList.innerHTML = '';
        for (const ent of _entities) {
            const m   = _meta(ent.type);
            const row = document.createElement('div');
            const sel = ent.id === _selEntityId;
            row.style.cssText = `
                display:flex;align-items:center;gap:5px;padding:3px 6px;cursor:pointer;
                border-left:3px solid ${sel ? m.color : 'transparent'};
                background:${sel ? '#180e06' : 'transparent'};
            `;
            const wpLabel = (ent.type === 'enemy-patrol' && ent.props?.waypoints?.length)
                ? ` <span style="color:#555;font-size:.7rem">[${ent.props.waypoints.length} wp]</span>`
                : '';
            const exitTag = ent.type === 'level-exit'
                ? ' <span style="color:#ff6b35;font-size:.7rem">EXIT</span>' : '';
            row.innerHTML = `
                <span style="font-size:.9rem">${m.icon}</span>
                <span style="flex:1;font-size:.82rem;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${m.label}${wpLabel}${exitTag}
                </span>
                <span style="font-size:.7rem;color:#555">${ent.x?.toFixed(1)},${ent.z?.toFixed(1)}</span>
            `;
            row.addEventListener('click', () => selectEntity(ent.id));
            _elEntList.appendChild(row);
        }
    }

    function _populateEntProps(ent) {
        if (!_elEntProps || !ent) return;
        _elEntProps.style.display = 'block';
        const m = _meta(ent.type);
        _elEntProps.querySelector('#es-ep-type').textContent = `${m.icon} ${m.label}`;
        _elEntProps.querySelector('#es-ep-x').value   = ent.x?.toFixed(2) ?? 0;
        _elEntProps.querySelector('#es-ep-z').value   = ent.z?.toFixed(2) ?? 0;
        _elEntProps.querySelector('#es-ep-yaw').value = ent.props?.yaw ?? 0;

        // section visibility
        const isDoor    = ent.type === 'door';
        const isPatrol  = ent.type === 'enemy-patrol';
        const isWeapon  = ent.type === 'pickup-weapon';
        const isPickup  = ['pickup-health','pickup-ammo','pickup-armor'].includes(ent.type);
        const isEnemy   = ['enemy-grunt','enemy-shooter'].includes(ent.type);

        _elEntProps.querySelector('#es-door-section').style.display    = isDoor   ? '' : 'none';
        _elEntProps.querySelector('#es-patrol-section').style.display  = isPatrol ? '' : 'none';
        _elEntProps.querySelector('#es-weapon-section').style.display  = isWeapon ? '' : 'none';
        _elEntProps.querySelector('#es-pickup-section').style.display  = isPickup ? '' : 'none';
        _elEntProps.querySelector('#es-enemy-section').style.display   = isEnemy  ? '' : 'none';

        if (isDoor) {
            _elEntProps.querySelector('#es-ep-linked-trigger').value = ent.props?.linkedTrigger || '';
            _elEntProps.querySelector('#es-ep-door-axis').value      = ent.props?.doorAxis      || 'y';
        }
        if (isWeapon) {
            _elEntProps.querySelector('#es-ep-weapon').value = ent.props?.weapon || 'pistol';
        }
        if (isPickup) {
            _elEntProps.querySelector('#es-ep-amount').value = ent.props?.amount ?? 25;
        }
        if (isEnemy) {
            _elEntProps.querySelector('#es-ep-hp').value           = ent.props?.hp          ?? 100;
            _elEntProps.querySelector('#es-ep-alert-radius').value = ent.props?.alertRadius ?? 10;
        }
        if (isPatrol) {
            _rebuildWaypoints(ent);
        }

        _rebuildCustomProps(ent);
    }

    // ── patrol waypoints ──────────────────────────────────────────────────────

    function _rebuildWaypoints(ent) {
        const el = _elEntProps?.querySelector('#es-waypoints');
        if (!el) return;
        const wps = ent.props?.waypoints || [];
        if (!wps.length) {
            el.innerHTML = '<div style="color:#444;font-size:.78rem">No waypoints.</div>';
            return;
        }
        el.innerHTML = wps.map((wp, i) => `
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
                <span style="color:#666;font-size:.75rem;min-width:18px">${i + 1}.</span>
                <input type="number" step="0.5" value="${wp.x?.toFixed(2) ?? 0}"
                    data-wp="${i}" data-axis="x"
                    onchange="EntitySpawner._updateWaypoint(${i},'x',this.value)"
                    style="width:44px;background:#000;border:1px solid #333;color:#ccc;
                    font-size:.78rem;padding:2px 3px;outline:none">
                <input type="number" step="0.5" value="${wp.z?.toFixed(2) ?? 0}"
                    data-wp="${i}" data-axis="z"
                    onchange="EntitySpawner._updateWaypoint(${i},'z',this.value)"
                    style="width:44px;background:#000;border:1px solid #333;color:#ccc;
                    font-size:.78rem;padding:2px 3px;outline:none">
                <button class="action-btn" style="padding:1px 5px;color:#e74c3c;font-size:.75rem"
                    onclick="EntitySpawner.removeWaypoint(${i})">✕</button>
            </div>
        `).join('');
    }

    function addWaypoint() {
        const ent = _entities.find(e => e.id === _selEntityId);
        if (!ent || ent.type !== 'enemy-patrol') return;
        if (!ent.props) ent.props = {};
        if (!ent.props.waypoints) ent.props.waypoints = [];
        ent.props.waypoints.push({ x: ent.x || 0, z: ent.z || 0 });
        _rebuildWaypoints(ent);
        _rebuildEntList();
        if (_onEntityCh) _onEntityCh('update', ent.id, ent);
    }

    function removeWaypoint(idx) {
        const ent = _entities.find(e => e.id === _selEntityId);
        if (!ent?.props?.waypoints) return;
        ent.props.waypoints.splice(idx, 1);
        _rebuildWaypoints(ent);
        _rebuildEntList();
        if (_onEntityCh) _onEntityCh('update', ent.id, ent);
    }

    function _updateWaypoint(idx, axis, val) {
        const ent = _entities.find(e => e.id === _selEntityId);
        if (!ent?.props?.waypoints?.[idx]) return;
        ent.props.waypoints[idx][axis] = parseFloat(val) || 0;
        if (_onEntityCh) _onEntityCh('update', ent.id, ent);
    }

    // ── custom props ──────────────────────────────────────────────────────────

    function _rebuildCustomProps(ent) {
        const el = _elEntProps?.querySelector('#es-custom-props');
        if (!el) return;
        const custom = ent.props?.custom || {};
        const keys   = Object.keys(custom);
        if (!keys.length) {
            el.innerHTML = '<div style="color:#444;font-size:.78rem">None.</div>';
            return;
        }
        el.innerHTML = keys.map(k => `
            <div style="display:flex;align-items:center;gap:3px;margin-bottom:3px">
                <input type="text" value="${k}" readonly
                    style="width:70px;background:#0a0a0a;border:1px solid #222;color:#777;
                    font-size:.75rem;padding:2px 4px;outline:none">
                <input type="text" value="${String(custom[k])}"
                    onchange="EntitySpawner._updateCustomProp('${k}',this.value)"
                    style="flex:1;background:#000;border:1px solid #333;color:#ccc;
                    font-size:.75rem;padding:2px 4px;outline:none">
                <button class="action-btn" style="padding:1px 5px;color:#e74c3c;font-size:.75rem"
                    onclick="EntitySpawner._deleteCustomProp('${k}')">✕</button>
            </div>
        `).join('');
    }

    function _addCustomProp() {
        const ent = _entities.find(e => e.id === _selEntityId);
        if (!ent) return;
        const key = prompt('Property key:');
        if (!key || !key.trim()) return;
        if (!ent.props) ent.props = {};
        if (!ent.props.custom) ent.props.custom = {};
        ent.props.custom[key.trim()] = '';
        _rebuildCustomProps(ent);
        if (_onEntityCh) _onEntityCh('update', ent.id, ent);
    }

    function _updateCustomProp(key, val) {
        const ent = _entities.find(e => e.id === _selEntityId);
        if (!ent?.props?.custom) return;
        ent.props.custom[key] = val;
        if (_onEntityCh) _onEntityCh('update', ent.id, ent);
    }

    function _deleteCustomProp(key) {
        const ent = _entities.find(e => e.id === _selEntityId);
        if (!ent?.props?.custom) return;
        delete ent.props.custom[key];
        _rebuildCustomProps(ent);
        if (_onEntityCh) _onEntityCh('update', ent.id, ent);
    }

    // ── apply / delete entity ─────────────────────────────────────────────────

    function _applyEntProps() {
        const ent = _entities.find(e => e.id === _selEntityId);
        if (!ent || !_elEntProps) return;
        ent.x = parseFloat(_elEntProps.querySelector('#es-ep-x').value) || 0;
        ent.z = parseFloat(_elEntProps.querySelector('#es-ep-z').value) || 0;
        if (!ent.props) ent.props = {};
        ent.props.yaw = parseFloat(_elEntProps.querySelector('#es-ep-yaw').value) || 0;

        if (ent.type === 'door') {
            ent.props.linkedTrigger = _elEntProps.querySelector('#es-ep-linked-trigger').value.trim();
            ent.props.doorAxis      = _elEntProps.querySelector('#es-ep-door-axis').value;
        }
        if (ent.type === 'pickup-weapon') {
            ent.props.weapon = _elEntProps.querySelector('#es-ep-weapon').value;
        }
        if (['pickup-health','pickup-ammo','pickup-armor'].includes(ent.type)) {
            ent.props.amount = parseInt(_elEntProps.querySelector('#es-ep-amount').value) || 25;
        }
        if (['enemy-grunt','enemy-shooter'].includes(ent.type)) {
            ent.props.hp          = parseInt(_elEntProps.querySelector('#es-ep-hp').value) || 100;
            ent.props.alertRadius = parseFloat(_elEntProps.querySelector('#es-ep-alert-radius').value) || 10;
        }
        _rebuildEntList();
        if (_onEntityCh) _onEntityCh('update', ent.id, ent);
    }

    function _deleteEnt() {
        if (!_selEntityId) return;
        const id = _selEntityId;
        _entities = _entities.filter(e => e.id !== id);
        _selEntityId = null;
        if (_elEntProps) _elEntProps.style.display = 'none';
        _rebuildEntList();
        if (_onEntityCh) _onEntityCh('remove', id, null);
    }

    // ── trigger list rebuild ──────────────────────────────────────────────────

    function _rebuildTrgList() {
        if (!_elTrgList) return;
        const countEl = _trgMount?.querySelector('#es-trg-count');
        if (countEl) countEl.textContent = `${_triggers.length} trigger${_triggers.length === 1 ? '' : 's'}`;

        if (!_triggers.length) {
            _elTrgList.innerHTML = '<div style="color:#444;font-size:.8rem;padding:4px 0">No triggers placed.</div>';
            return;
        }
        _elTrgList.innerHTML = '';
        for (const trg of _triggers) {
            const m   = _trgMeta(trg.event);
            const sel = trg.id === _selTriggerId;
            const row = document.createElement('div');
            row.style.cssText = `
                display:flex;align-items:center;gap:5px;padding:3px 6px;cursor:pointer;
                border-left:3px solid ${sel ? m.color : 'transparent'};
                background:${sel ? '#180e06' : 'transparent'};
            `;
            row.innerHTML = `
                <span style="color:${m.color};font-size:.9rem">${m.icon}</span>
                <span style="flex:1;font-size:.82rem;color:#aaa">${trg.event}</span>
                ${trg.action ? `<span style="font-size:.7rem;color:#555;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${trg.action}</span>` : ''}
                <span style="font-size:.7rem;color:#444">${_shortId(trg.id)}</span>
            `;
            row.addEventListener('click', () => selectTrigger(trg.id));
            _elTrgList.appendChild(row);
        }
    }

    function _populateTrgProps(trg) {
        if (!_elTrgProps || !trg) return;
        _elTrgProps.style.display = 'block';
        _elTrgProps.querySelector('#es-tp-event').value  = trg.event  || 'onEnter';
        _elTrgProps.querySelector('#es-tp-action').value = trg.action || '';
        _elTrgProps.querySelector('#es-tp-w').value      = trg.w      ?? 2;
        _elTrgProps.querySelector('#es-tp-h').value      = trg.h      ?? 2.5;
        _elTrgProps.querySelector('#es-tp-d').value      = trg.d      ?? 2;
        _elTrgProps.querySelector('#es-tp-x').value      = trg.x?.toFixed(2) ?? 0;
        _elTrgProps.querySelector('#es-tp-z').value      = trg.z?.toFixed(2) ?? 0;
    }

    function _applyTrgProps() {
        const trg = _triggers.find(t => t.id === _selTriggerId);
        if (!trg || !_elTrgProps) return;
        trg.event  = _elTrgProps.querySelector('#es-tp-event').value;
        trg.action = _elTrgProps.querySelector('#es-tp-action').value.trim();
        trg.w      = parseFloat(_elTrgProps.querySelector('#es-tp-w').value) || 2;
        trg.h      = parseFloat(_elTrgProps.querySelector('#es-tp-h').value) || 2.5;
        trg.d      = parseFloat(_elTrgProps.querySelector('#es-tp-d').value) || 2;
        trg.x      = parseFloat(_elTrgProps.querySelector('#es-tp-x').value) || 0;
        trg.z      = parseFloat(_elTrgProps.querySelector('#es-tp-z').value) || 0;
        _rebuildTrgList();
        if (_onTriggerCh) _onTriggerCh('update', trg.id, trg);
    }

    function _deleteTrg() {
        if (!_selTriggerId) return;
        const id = _selTriggerId;
        _triggers = _triggers.filter(t => t.id !== id);
        _selTriggerId = null;
        if (_elTrgProps) _elTrgProps.style.display = 'none';
        _rebuildTrgList();
        if (_onTriggerCh) _onTriggerCh('remove', id, null);
    }

    // ── public API ────────────────────────────────────────────────────────────

    /**
     * Mount entity and trigger UIs into their respective containers.
     * @param {Element|string} entityMount    — container for entity instance list
     * @param {Element|string} triggerMount   — container for trigger instance list
     */
    function init(entityMount, triggerMount) {
        if (typeof entityMount  === 'string') entityMount  = document.querySelector(entityMount);
        if (typeof triggerMount === 'string') triggerMount = document.querySelector(triggerMount);
        if (entityMount)  _buildEntUI(entityMount);
        if (triggerMount) _buildTrgUI(triggerMount);
    }

    /** Refresh entity list from current _state.entities snapshot. */
    function syncEntities(entities) {
        _entities = entities || [];
        _rebuildEntList();
        if (_selEntityId) {
            const ent = _entities.find(e => e.id === _selEntityId);
            if (ent) _populateEntProps(ent);
            else { _selEntityId = null; if (_elEntProps) _elEntProps.style.display = 'none'; }
        }
    }

    /** Refresh trigger list from current _state.triggers snapshot. */
    function syncTriggers(triggers) {
        _triggers = triggers || [];
        _rebuildTrgList();
        if (_selTriggerId) {
            const trg = _triggers.find(t => t.id === _selTriggerId);
            if (trg) _populateTrgProps(trg);
            else { _selTriggerId = null; if (_elTrgProps) _elTrgProps.style.display = 'none'; }
        }
    }

    function selectEntity(id) {
        _selEntityId = id;
        const ent = _entities.find(e => e.id === id);
        _rebuildEntList();
        _populateEntProps(ent);
    }

    function selectTrigger(id) {
        _selTriggerId = id;
        const trg = _triggers.find(t => t.id === id);
        _rebuildTrgList();
        _populateTrgProps(trg);
    }

    /**
     * Register callback fired when an entity changes.
     * cb(type: 'update'|'remove', id: string, data: object|null)
     */
    function onEntityChanged(cb) { _onEntityCh = cb; }

    /**
     * Register callback fired when a trigger changes.
     * cb(type: 'update'|'remove', id: string, data: object|null)
     */
    function onTriggerChanged(cb) { _onTriggerCh = cb; }

    // ── public API ────────────────────────────────────────────────────────────
    return {
        init, syncEntities, syncTriggers,
        selectEntity, selectTrigger,
        onEntityChanged, onTriggerChanged,
        addWaypoint, removeWaypoint,
        // internal onclick helpers
        _applyEntProps, _deleteEnt,
        _applyTrgProps, _deleteTrg,
        _addCustomProp, _updateCustomProp, _deleteCustomProp,
        _updateWaypoint,
    };

})();

if (typeof window !== 'undefined') window.EntitySpawner = EntitySpawner;
