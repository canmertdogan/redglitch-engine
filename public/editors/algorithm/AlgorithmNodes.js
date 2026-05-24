export const LIB = {
    // EVENTS
    evt_start: { cat: 'Event', title: 'On Start', desc: 'Triggered once when the entity is loaded.', outputs: [{id:'out', name:'Exec', type:'exec'}] },
    evt_tick: { cat: 'Event', title: 'On Update', desc: 'Triggered every frame. Use sparingly.', outputs: [{id:'out', name:'Exec', type:'exec'}, {id:'dt', name:'DeltaTime', type:'num'}] },
    evt_input: { cat: 'Event', title: 'On Key', desc: 'Triggered when a specific key is pressed.', outputs: [{id:'out', name:'Exec', type:'exec'}], fields: [{key:'key', label:'Key Code (e.g. A)'}] },
    evt_collision: { cat: 'Event', title: 'On Hit', desc: 'Triggered when this entity touches another.', outputs: [{id:'out', name:'Exec', type:'exec'}, {id:'other', name:'Other Entity', type:'entity'}] },

    // FLOW
    flow_branch: { cat: 'Flow', title: 'Branch', desc: 'If True, take top path. If False, bottom.', inputs: [{id:'in', name:'Exec', type:'exec'}, {id:'cond', name:'Condition', type:'bool'}], outputs: [{id:'true', name:'True', type:'exec'}, {id:'false', name:'False', type:'exec'}] },
    flow_wait: { cat: 'Flow', title: 'Wait', desc: 'Pause execution for X seconds.', inputs: [{id:'in', name:'Exec', type:'exec'}, {id:'time', name:'Seconds', type:'num'}], outputs: [{id:'out', name:'Exec', type:'exec'}], defaults: {time: 1.0}, fields: [{key:'time', label:'Duration'}] },
    flow_reroute: { cat: 'Flow', title: 'Reroute', desc: 'Organize wires.', inputs: [{id:'in', name:'', type:'any'}], outputs: [{id:'out', name:'', type:'any'}] },
    comment_box: { cat: 'Flow', title: 'Comment', desc: 'Group nodes together.', inputs: [], outputs: [], defaults: { width: 300, height: 200, color: '#3498db' }, fields: [{key:'color', label:'Color', type:'color'}] },
    flow_for: { cat: 'Flow', title: 'Loop', desc: 'Repeat X times or iterate array.', inputs: [{id:'in', name:'Exec', type:'exec'}, {id:'count', name:'Count', type:'num'}], outputs: [{id:'loop', name:'Body', type:'exec'}, {id:'index', name:'Index', type:'num'}, {id:'out', name:'Done', type:'exec'}] },
    
    // MATH
    math_add: { cat: 'Math', title: 'Add', desc: 'A + B', inputs: [{id:'a', name:'A', type:'num'}, {id:'b', name:'B', type:'num'}], outputs: [{id:'res', name:'Result', type:'num'}] },
    math_expression: { 
        cat: 'Math', 
        title: 'Expression', 
        desc: 'Custom math (e.g. (a+b)*c)', 
        inputs: [{id:'a', name:'A', type:'num'}, {id:'b', name:'B', type:'num'}, {id:'c', name:'C', type:'num'}], 
        outputs: [{id:'res', name:'Result', type:'num'}],
        fields: [{key:'expression', label:'Formula'}]
    },
    vec2_dist: {
        cat: 'Math',
        title: 'Distance (V2)',
        desc: 'Distance between two points.',
        inputs: [{id:'x1', name:'X1', type:'num'}, {id:'y1', name:'Y1', type:'num'}, {id:'x2', name:'X2', type:'num'}, {id:'y2', name:'Y2', type:'num'}],
        outputs: [{id:'res', name:'Dist', type:'num'}]
    },
    vec2_split: {
        cat: 'Math',
        title: 'Split Vector2',
        desc: 'Extract X and Y from a Vector2.',
        inputs: [{id:'vec', name:'Vector', type:'any'}],
        outputs: [{id:'x', name:'X', type:'num'}, {id:'y', name:'Y', type:'num'}]
    },
    vec2_combine: {
        cat: 'Math',
        title: 'Make Vector2',
        desc: 'Create a Vector2 from X and Y.',
        inputs: [{id:'x', name:'X', type:'num'}, {id:'y', name:'Y', type:'num'}],
        outputs: [{id:'vec', name:'Vector', type:'any'}]
    },
    math_rand: { cat: 'Math', title: 'Random', desc: 'Random number between Min and Max.', inputs: [{id:'min', name:'Min', type:'num'}, {id:'max', name:'Max', type:'num'}], outputs: [{id:'res', name:'Result', type:'num'}] },
    
    // LOGIC
    logic_eq: { cat: 'Math', title: 'Equal', desc: 'Returns true if A equals B.', inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}], outputs: [{id:'res', name:'Bool', type:'bool'}] },
    
    // VARS & ENV
    var_get: { cat: 'Var', title: 'Get Var', desc: 'Read a global variable.', outputs: [{id:'val', name:'Value', type:'any'}], fields: [{key:'name', label:'Variable Name'}] },
    var_set: { cat: 'Var', title: 'Set Var', desc: 'Write to a global variable.', inputs: [{id:'in', name:'Exec', type:'exec'}, {id:'val', name:'Value', type:'any'}], outputs: [{id:'out', name:'Exec', type:'exec'}], fields: [{key:'name', label:'Variable Name'}] },
    env_time: { cat: 'Var', title: 'Time', desc: 'Get current Game Time.', outputs: [{id:'time', name:'Time', type:'num'}] },

    // ENGINE
    eng_log: { cat: 'Engine', title: 'Log', desc: 'Print a message to the browser console.', inputs: [{id:'in', name:'Exec', type:'exec'}, {id:'msg', name:'Message', type:'string'}], outputs: [{id:'out', name:'Exec', type:'exec'}], fields: [{key:'msg', label:'Message'}] },
    eng_move: { cat: 'Engine', title: 'Move To', desc: 'Teleport Self to X, Y.', inputs: [{id:'in', name:'Exec', type:'exec'}, {id:'x', name:'X', type:'num'}, {id:'y', name:'Y', type:'num'}], outputs: [{id:'out', name:'Exec', type:'exec'}] },
    data_self: { cat: 'Var', title: 'Self', desc: 'Reference to this entity.', outputs: [{id:'val', name:'Self', type:'entity'}] },
    data_player: { cat: 'Var', title: 'Player', desc: 'Reference to the player.', outputs: [{id:'val', name:'Player', type:'entity'}] },
    
    // ENTITY QUERIES (Phase 1.1 - NEW)
    entity_get_nearby: { 
        cat: 'Entity', 
        title: 'Get Nearby Entities', 
        desc: 'Find entities within radius, optionally filtered by type.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'range', name:'Range', type:'num'},
            {id:'type', name:'Type', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'entities', name:'Entities', type:'array'}
        ],
        defaults: {range: 200, type: ''},
        fields: [{key:'range', label:'Range (pixels)'}, {key:'type', label:'Entity Type (optional)'}]
    },
    
    entity_get_by_name: {
        cat: 'Entity',
        title: 'Get Entity By Name',
        desc: 'Find entity by its name property.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'name', name:'Name', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'entity', name:'Entity', type:'entity'}
        ],
        defaults: {name: ''},
        fields: [{key:'name', label:'Entity Name'}]
    },
    
    entity_get_closest_enemy: {
        cat: 'Entity',
        title: 'Get Closest Enemy',
        desc: 'Returns nearest enemy entity to this entity.',
        inputs: [{id:'in', name:'Exec', type:'exec'}],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'entity', name:'Enemy', type:'entity'}
        ]
    },
    
    entity_get_all_enemies: {
        cat: 'Entity',
        title: 'Get All Enemies',
        desc: 'Returns array of all enemy entities.',
        inputs: [{id:'in', name:'Exec', type:'exec'}],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'entities', name:'Enemies', type:'array'}
        ]
    },
    
    entity_count_type: {
        cat: 'Entity',
        title: 'Count Entities',
        desc: 'Count how many entities of this type exist.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'type', name:'Type', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'count', name:'Count', type:'num'}
        ],
        defaults: {type: ''},
        fields: [{key:'type', label:'Entity Type'}]
    },
    
    entity_exists: {
        cat: 'Entity',
        title: 'Entity Exists',
        desc: 'Check if entity with this ID exists.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'entityId', name:'Entity ID', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'exists', name:'Exists', type:'bool'}
        ],
        defaults: {entityId: ''},
        fields: [{key:'entityId', label:'Entity ID'}]
    },
    
    entity_get_property: {
        cat: 'Entity',
        title: 'Get Entity Property',
        desc: 'Get any property from an entity (hp, x, y, etc).',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'entity', name:'Entity', type:'entity'},
            {id:'property', name:'Property', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'value', name:'Value', type:'any'}
        ],
        defaults: {property: 'hp'},
        fields: [{key:'property', label:'Property Name'}]
    },
    
    entity_spawn: {
        cat: 'Entity',
        title: 'Spawn Entity',
        desc: 'Create new entity at position.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'type', name:'Type', type:'string'},
            {id:'x', name:'X', type:'num'},
            {id:'y', name:'Y', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'entity', name:'Entity', type:'entity'}
        ],
        defaults: {type: 'enemy', x: 0, y: 0},
        fields: [{key:'type', label:'Entity Prefab', type:'dropdown', source: 'prefabs'}, {key:'x', label:'X Position'}, {key:'y', label:'Y Position'}]
    },
    
    entity_destroy: {
        cat: 'Entity',
        title: 'Destroy Entity',
        desc: 'Remove entity from game.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'entity', name:'Entity', type:'entity'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ]
    },
    
    entity_move_to: {
        cat: 'Entity',
        title: 'Move Entity To',
        desc: 'Move entity toward target position at speed.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'entity', name:'Entity', type:'entity'},
            {id:'x', name:'X', type:'num'},
            {id:'y', name:'Y', type:'num'},
            {id:'speed', name:'Speed', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {speed: 100},
        fields: [{key:'speed', label:'Movement Speed'}]
    },
    
    // PLAYER & INVENTORY (Phase 1.2 - NEW)
    player_get_position: {
        cat: 'Player',
        title: 'Get Player Position',
        desc: 'Get player X or Y coordinate.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'axis', name:'Axis', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'value', name:'Value', type:'num'}
        ],
        defaults: {axis: 'x'},
        fields: [{key:'axis', label:'Axis (x or y)'}]
    },
    
    player_get_stat: {
        cat: 'Player',
        title: 'Get Player Stat',
        desc: 'Get player stat (hp, mana, stamina, etc).',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'stat', name:'Stat', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'value', name:'Value', type:'num'}
        ],
        defaults: {stat: 'hp'},
        fields: [{key:'stat', label:'Stat Name (hp, mana, stamina, maxHp, maxMana, maxStamina)'}]
    },
    
    player_set_stat: {
        cat: 'Player',
        title: 'Set Player Stat',
        desc: 'Set player stat value (auto-capped to max).',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'stat', name:'Stat', type:'string'},
            {id:'value', name:'Value', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {stat: 'hp', value: 100},
        fields: [{key:'stat', label:'Stat Name'}, {key:'value', label:'New Value'}]
    },
    
    player_damage: {
        cat: 'Player',
        title: 'Damage Player',
        desc: 'Deal damage to player (reduces HP).',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'damage', name:'Damage', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {damage: 10},
        fields: [{key:'damage', label:'Damage Amount'}]
    },
    
    player_heal: {
        cat: 'Player',
        title: 'Heal Player',
        desc: 'Restore player HP.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'amount', name:'Amount', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {amount: 20},
        fields: [{key:'amount', label:'Heal Amount'}]
    },
    
    inventory_has_item: {
        cat: 'Inventory',
        title: 'Has Item',
        desc: 'Check if player has this item in inventory.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'itemId', name:'Item ID', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'hasIt', name:'Has Item', type:'bool'}
        ],
        defaults: {itemId: ''},
        fields: [{key:'itemId', label:'Item ID'}]
    },
    
    inventory_get_count: {
        cat: 'Inventory',
        title: 'Get Item Count',
        desc: 'Get quantity of item in inventory.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'itemId', name:'Item ID', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'count', name:'Count', type:'num'}
        ],
        defaults: {itemId: ''},
        fields: [{key:'itemId', label:'Item ID'}]
    },
    
    inventory_add_item: {
        cat: 'Inventory',
        title: 'Add Item',
        desc: 'Add items to player inventory.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'itemId', name:'Item ID', type:'string'},
            {id:'count', name:'Count', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {itemId: '', count: 1},
        fields: [{key:'itemId', label:'Item ID'}, {key:'count', label:'Quantity'}]
    },
    
    inventory_remove_item: {
        cat: 'Inventory',
        title: 'Remove Item',
        desc: 'Remove items from player inventory.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'itemId', name:'Item ID', type:'string'},
            {id:'count', name:'Count', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {itemId: '', count: 1},
        fields: [{key:'itemId', label:'Item ID'}, {key:'count', label:'Quantity'}]
    },
    
    inventory_equip: {
        cat: 'Inventory',
        title: 'Equip Item',
        desc: 'Equip item to skill slot (0-3).',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'itemId', name:'Item ID', type:'string'},
            {id:'slot', name:'Slot', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {itemId: '', slot: 0},
        fields: [{key:'itemId', label:'Item ID'}, {key:'slot', label:'Slot (0-3)'}]
    },
    
    inventory_unequip: {
        cat: 'Inventory',
        title: 'Unequip Item',
        desc: 'Remove item from skill slot.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'slot', name:'Slot', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {slot: 0},
        fields: [{key:'slot', label:'Slot (0-3)'}]
    },
    
    inventory_get_all: {
        cat: 'Inventory',
        title: 'Get All Items',
        desc: 'Returns array of all items in inventory.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'items', name:'Items', type:'array'}
        ]
    },
    
    // GAME STATE (Phase 1.3 - NEW)
    flag_set: {
        cat: 'GameState',
        title: 'Set Flag',
        desc: 'Set a global game flag (true or value).',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'name', name:'Flag Name', type:'string'},
            {id:'value', name:'Value', type:'any'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {name: '', value: true},
        fields: [{key:'name', label:'Flag Name'}, {key:'value', label:'Value (true/false/num/string)'}]
    },
    
    flag_get: {
        cat: 'GameState',
        title: 'Get Flag',
        desc: 'Get value of a global flag.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'name', name:'Flag Name', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'value', name:'Value', type:'any'}
        ],
        defaults: {name: ''},
        fields: [{key:'name', label:'Flag Name'}]
    },
    
    flag_check: {
        cat: 'GameState',
        title: 'Check Flag',
        desc: 'Check if flag exists and is true.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'name', name:'Flag Name', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'result', name:'Is True', type:'bool'}
        ],
        defaults: {name: ''},
        fields: [{key:'name', label:'Flag Name'}]
    },
    
    flag_clear: {
        cat: 'GameState',
        title: 'Clear Flag',
        desc: 'Remove a global flag.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'name', name:'Flag Name', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {name: ''},
        fields: [{key:'name', label:'Flag Name'}]
    },
    
    quest_start: {
        cat: 'GameState',
        title: 'Start Quest',
        desc: 'Begin a quest by ID.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'questId', name:'Quest ID', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {questId: ''},
        fields: [{key:'questId', label:'Quest ID'}]
    },
    
    quest_complete: {
        cat: 'GameState',
        title: 'Complete Quest',
        desc: 'Mark quest as completed.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'questId', name:'Quest ID', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {questId: ''},
        fields: [{key:'questId', label:'Quest ID'}]
    },
    
    quest_is_active: {
        cat: 'GameState',
        title: 'Is Quest Active',
        desc: 'Check if quest is currently active.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'questId', name:'Quest ID', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'active', name:'Active', type:'bool'}
        ],
        defaults: {questId: ''},
        fields: [{key:'questId', label:'Quest ID'}]
    },
    
    data_save: {
        cat: 'GameState',
        title: 'Save Data',
        desc: 'Save custom data to persistent storage.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'key', name:'Key', type:'string'},
            {id:'value', name:'Value', type:'any'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {key: '', value: ''},
        fields: [{key:'key', label:'Save Key'}, {key:'value', label:'Data to Save'}]
    },
    
    data_load: {
        cat: 'GameState',
        title: 'Load Data',
        desc: 'Load custom data from persistent storage.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'key', name:'Key', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'value', name:'Value', type:'any'}
        ],
        defaults: {key: ''},
        fields: [{key:'key', label:'Save Key'}]
    },
    
    data_delete: {
        cat: 'GameState',
        title: 'Delete Data',
        desc: 'Remove saved data by key.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'key', name:'Key', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {key: ''},
        fields: [{key:'key', label:'Save Key'}]
    },
    
    // WORLD MANIPULATION (Phase 1.4 - NEW)
    world_get_tile: {
        cat: 'World',
        title: 'Get Tile',
        desc: 'Get tile type at grid position.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'x', name:'Grid X', type:'num'},
            {id:'y', name:'Grid Y', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'tile', name:'Tile Type', type:'string'}
        ],
        defaults: {x: 0, y: 0},
        fields: [{key:'x', label:'Grid X'}, {key:'y', label:'Grid Y'}]
    },
    
    world_set_tile: {
        cat: 'World',
        title: 'Set Tile',
        desc: 'Change tile at grid position.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'x', name:'Grid X', type:'num'},
            {id:'y', name:'Grid Y', type:'num'},
            {id:'tile', name:'Tile Type', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {x: 0, y: 0, tile: 'floor'},
        fields: [{key:'x', label:'Grid X'}, {key:'y', label:'Grid Y'}, {key:'tile', label:'Tile Type'}]
    },
    
    world_remove_tile: {
        cat: 'World',
        title: 'Remove Tile',
        desc: 'Delete tile at grid position (makes empty).',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'x', name:'Grid X', type:'num'},
            {id:'y', name:'Grid Y', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {x: 0, y: 0},
        fields: [{key:'x', label:'Grid X'}, {key:'y', label:'Grid Y'}]
    },
    
    world_spawn_at: {
        cat: 'World',
        title: 'Spawn At Tile',
        desc: 'Spawn entity at tile coordinates (converts to pixel coords).',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'type', name:'Entity Type', type:'string'},
            {id:'tileX', name:'Tile X', type:'num'},
            {id:'tileY', name:'Tile Y', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'entity', name:'Entity', type:'entity'}
        ],
        defaults: {type: '', tileX: 0, tileY: 0},
        fields: [{key:'type', label:'Entity Type'}, {key:'tileX', label:'Tile X'}, {key:'tileY', label:'Tile Y'}]
    },
    
    world_get_spawn_point: {
        cat: 'World',
        title: 'Get Spawn Point',
        desc: 'Get named spawn point position from level data.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'name', name:'Spawn Name', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'x', name:'X', type:'num'},
            {id:'y', name:'Y', type:'num'}
        ],
        defaults: {name: 'player_start'},
        fields: [{key:'name', label:'Spawn Point Name'}]
    },
    
    // CAMERA/FX (Phase 1.5 - NEW)
    camera_shake: {
        cat: 'Camera',
        title: 'Camera Shake',
        desc: 'Shake the camera/screen for impact effects.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'duration', name:'Duration', type:'num'},
            {id:'intensity', name:'Intensity', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {duration: 0.3, intensity: 5},
        fields: [{key:'duration', label:'Duration (seconds)'}, {key:'intensity', label:'Intensity (pixels)'}]
    },
    
    camera_flash: {
        cat: 'Camera',
        title: 'Camera Flash',
        desc: 'Flash the screen with color.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'duration', name:'Duration', type:'num'},
            {id:'r', name:'Red', type:'num'},
            {id:'g', name:'Green', type:'num'},
            {id:'b', name:'Blue', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {duration: 0.2, r: 255, g: 255, b: 255},
        fields: [{key:'duration', label:'Duration (sec)'}, {key:'r', label:'Red (0-255)'}, {key:'g', label:'Green (0-255)'}, {key:'b', label:'Blue (0-255)'}]
    },
    
    camera_fade_in: {
        cat: 'Camera',
        title: 'Fade In',
        desc: 'Fade from black to clear view.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'duration', name:'Duration', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {duration: 1.0},
        fields: [{key:'duration', label:'Duration (seconds)'}]
    },
    
    camera_fade_out: {
        cat: 'Camera',
        title: 'Fade Out',
        desc: 'Fade from clear view to black.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'duration', name:'Duration', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {duration: 1.0},
        fields: [{key:'duration', label:'Duration (seconds)'}]
    },
    
    camera_zoom: {
        cat: 'Camera',
        title: 'Set Zoom',
        desc: 'Change camera zoom level.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'zoom', name:'Zoom', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {zoom: 1.0},
        fields: [{key:'zoom', label:'Zoom Level (1.0 = normal)'}]
    },
    
    camera_follow: {
        cat: 'Camera',
        title: 'Follow Entity',
        desc: 'Set camera to follow an entity.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'entity', name:'Entity', type:'entity'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {},
        fields: []
    },
    
    fx_particle: {
        cat: 'FX',
        title: 'Spawn Particle',
        desc: 'Create particle effect at position.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'type', name:'Effect Type', type:'string'},
            {id:'x', name:'X', type:'num'},
            {id:'y', name:'Y', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {type: 'explosion', x: 0, y: 0},
        fields: [{key:'type', label:'Effect Type'}, {key:'x', label:'X Position'}, {key:'y', label:'Y Position'}]
    },
    
    fx_tint: {
        cat: 'FX',
        title: 'Screen Tint',
        desc: 'Apply color tint to entire screen.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'r', name:'Red', type:'num'},
            {id:'g', name:'Green', type:'num'},
            {id:'b', name:'Blue', type:'num'},
            {id:'alpha', name:'Alpha', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {r: 255, g: 0, b: 0, alpha: 0.3},
        fields: [{key:'r', label:'Red (0-255)'}, {key:'g', label:'Green (0-255)'}, {key:'b', label:'Blue (0-255)'}, {key:'alpha', label:'Alpha (0-1)'}]
    },
    
    // AUDIO (Phase 1.6 - NEW)
    audio_play: {
        cat: 'Audio',
        title: 'Play Audio',
        desc: 'Play sound effect or music track.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'audioId', name:'Audio ID', type:'string'},
            {id:'loop', name:'Loop', type:'bool'},
            {id:'volume', name:'Volume', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {audioId: '', loop: false, volume: 1.0},
        fields: [{key:'audioId', label:'Audio Asset', type:'dropdown', source: 'sounds'}, {key:'loop', label:'Loop (true/false)'}, {key:'volume', label:'Volume (0-1)'}]
    },
    
    audio_stop: {
        cat: 'Audio',
        title: 'Stop Audio',
        desc: 'Stop specific audio or all audio.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'audioId', name:'Audio ID', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {audioId: 'all'},
        fields: [{key:'audioId', label:'Audio Asset', type:'dropdown', source: 'sounds'}]
    },
    
    audio_fade: {
        cat: 'Audio',
        title: 'Fade Audio',
        desc: 'Fade audio volume over time.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'audioId', name:'Audio ID', type:'string'},
            {id:'targetVolume', name:'Target Volume', type:'num'},
            {id:'duration', name:'Duration', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {audioId: '', targetVolume: 0, duration: 1.0},
        fields: [{key:'audioId', label:'Audio ID'}, {key:'targetVolume', label:'Target Volume (0-1)'}, {key:'duration', label:'Duration (seconds)'}]
    },
    
    // DIALOGUE (Phase 1.7 - NEW)
    dialogue_show: {
        cat: 'Dialogue',
        title: 'Show Dialogue',
        desc: 'Display dialogue box with text.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'speaker', name:'Speaker', type:'string'},
            {id:'text', name:'Text', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {speaker: 'NPC', text: 'Hello, adventurer!'},
        fields: [{key:'speaker', label:'Speaker Name'}, {key:'text', label:'Dialogue Text'}]
    },
    
    dialogue_choice: {
        cat: 'Dialogue',
        title: 'Show Choices',
        desc: 'Show multiple choice dialogue options.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'options', name:'Options', type:'string'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'choice', name:'Choice Index', type:'num'}
        ],
        defaults: {options: 'Yes,No,Maybe'},
        fields: [{key:'options', label:'Options (comma separated)'}]
    },
    
    dialogue_wait: {
        cat: 'Dialogue',
        title: 'Wait for Dialogue',
        desc: 'Wait until dialogue box is closed.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ]
    },
    
    dialogue_close: {
        cat: 'Dialogue',
        title: 'Close Dialogue',
        desc: 'Force close dialogue box.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ]
    },
    
    // TIME (Phase 1.8 - NEW)
    time_wait: {
        cat: 'Time',
        title: 'Wait',
        desc: 'Delay execution for specified seconds.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'seconds', name:'Seconds', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'}
        ],
        defaults: {seconds: 1.0},
        fields: [{key:'seconds', label:'Duration (seconds)'}]
    },
    
    time_get: {
        cat: 'Time',
        title: 'Get Time',
        desc: 'Get current game time (elapsed since start).',
        inputs: [
            {id:'in', name:'Exec', type:'exec'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'time', name:'Time', type:'num'}
        ]
    },
    
    // ADVANCED FLOW (Phase 1.9 - NEW)
    flow_for_loop: {
        cat: 'Flow',
        title: 'For Loop',
        desc: 'Iterate a specific number of times.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'count', name:'Count', type:'num'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'body', name:'Loop Body', type:'exec'},
            {id:'index', name:'Index', type:'num'}
        ],
        defaults: {count: 10},
        fields: [{key:'count', label:'Iteration Count'}]
    },
    
    flow_while: {
        cat: 'Flow',
        title: 'While Loop',
        desc: 'Loop while condition is true.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'condition', name:'Condition', type:'bool'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'body', name:'Loop Body', type:'exec'}
        ],
        defaults: {condition: true},
        fields: [{key:'condition', label:'Condition'}]
    },
    
    flow_foreach: {
        cat: 'Flow',
        title: 'For Each',
        desc: 'Iterate over each item in array.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'array', name:'Array', type:'array'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'body', name:'Loop Body', type:'exec'},
            {id:'item', name:'Item', type:'any'},
            {id:'index', name:'Index', type:'num'}
        ],
        defaults: {array: []},
        fields: []
    },
    
    flow_sequence: {
        cat: 'Flow',
        title: 'Sequence',
        desc: 'Execute nodes in sequence with delays.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'step1', name:'Step 1', type:'exec'},
            {id:'step2', name:'Step 2', type:'exec'},
            {id:'step3', name:'Step 3', type:'exec'}
        ]
    },
    
    flow_switch: {
        cat: 'Flow',
        title: 'Switch',
        desc: 'Multi-way branch based on value.',
        inputs: [
            {id:'in', name:'Exec', type:'exec'},
            {id:'value', name:'Value', type:'any'}
        ],
        outputs: [
            {id:'out', name:'Exec', type:'exec'},
            {id:'case0', name:'Case 0', type:'exec'},
            {id:'case1', name:'Case 1', type:'exec'},
            {id:'case2', name:'Case 2', type:'exec'},
            {id:'default', name:'Default', type:'exec'}
        ],
        defaults: {value: 0},
        fields: [{key:'value', label:'Switch Value'}]
    }
};


