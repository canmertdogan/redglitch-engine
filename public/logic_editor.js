// logic_editor.js
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

function initializeLogicIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedGlitchEventBus;
        projectState = window.RedGlitchProjectState;
        assetManager = window.RedGlitchAssetManager;
        
        if (eventBus) {
            console.log('[LogicEditor] EventBus connected');
        }
    }
}

function broadcastLogicUpdate(logicName, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`logic:${action}`, {
            logicId: logicName,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`logic.${logicName}`, {
            name: logicName,
            lastModified: Date.now()
        });
    }
}

// Initialize integration on document ready
document.addEventListener('DOMContentLoaded', initializeLogicIntegration);

// --- CUSTOM BLOCK DEFINITIONS ---

// ============================================================
// EVENTS (3 blocks) - Color: #e74c3c (red)
// ============================================================

Blockly.Blocks['event_on_start'] = {
  init: function() {
    this.appendDummyInput().appendField("⚡ When Game Starts");
    this.appendStatementInput("STACK").setCheck(null);
    this.setColour('#e74c3c');
    this.setTooltip("Run once when entity spawns or level loads");
  }
};

Blockly.Blocks['event_on_update'] = {
  init: function() {
    this.appendDummyInput().appendField("🔄 Every Frame");
    this.appendStatementInput("STACK").setCheck(null);
    this.setColour('#e74c3c');
    this.setTooltip("Run continuously 60 times per second");
  }
};

Blockly.Blocks['event_on_interact'] = {
  init: function() {
    this.appendDummyInput().appendField("👆 When Player Interacts");
    this.appendStatementInput("STACK").setCheck(null);
    this.setColour('#e74c3c');
    this.setTooltip("Run when player presses interact key near this entity");
  }
};

// ============================================================
// ENTITY QUERIES (10 blocks) - Color: #9b59b6 (purple)
// ============================================================

Blockly.Blocks['entity_get_nearby'] = {
  init: function() {
    this.appendValueInput("RANGE").setCheck("Number").appendField("🔍 Get entities within");
    this.appendDummyInput().appendField("pixels of type")
        .appendField(new Blockly.FieldTextInput("enemy"), "TYPE");
    this.setOutput(true, "Array");
    this.setColour('#9b59b6');
    this.setTooltip("Returns array of entities near this entity");
  }
};

Blockly.Blocks['entity_get_by_name'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("🎯 Get entity named")
        .appendField(new Blockly.FieldTextInput("Boss"), "NAME");
    this.setOutput(true, "Entity");
    this.setColour('#9b59b6');
    this.setTooltip("Find entity by its name property");
  }
};

Blockly.Blocks['entity_get_closest_enemy'] = {
  init: function() {
    this.appendDummyInput().appendField("⚔️ Get closest enemy");
    this.setOutput(true, "Entity");
    this.setColour('#9b59b6');
    this.setTooltip("Returns nearest enemy entity to this entity");
  }
};

Blockly.Blocks['entity_count_type'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("📊 Count entities of type")
        .appendField(new Blockly.FieldTextInput("chest"), "TYPE");
    this.setOutput(true, "Number");
    this.setColour('#9b59b6');
    this.setTooltip("Count how many entities of this type exist");
  }
};

Blockly.Blocks['entity_exists'] = {
  init: function() {
    this.appendValueInput("ID").setCheck(["String", "Number"])
        .appendField("❓ Entity exists with ID");
    this.setOutput(true, "Boolean");
    this.setColour('#9b59b6');
    this.setTooltip("Check if entity with this ID exists");
  }
};

Blockly.Blocks['entity_get_property'] = {
  init: function() {
    this.appendValueInput("ID").setCheck(["String", "Number"])
        .appendField("📦 Get property");
    this.appendDummyInput()
        .appendField(new Blockly.FieldTextInput("hp"), "PROP")
        .appendField("from entity ID");
    this.setOutput(true, null);
    this.setColour('#9b59b6');
    this.setTooltip("Get any property from an entity");
  }
};

Blockly.Blocks['entity_spawn'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("✨ Spawn")
        .appendField(new Blockly.FieldTextInput("enemy"), "TYPE");
    this.appendValueInput("X").setCheck("Number").appendField("at X");
    this.appendValueInput("Y").setCheck("Number").appendField("Y");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#9b59b6');
    this.setTooltip("Create new entity at position");
  }
};

Blockly.Blocks['entity_destroy'] = {
  init: function() {
    this.appendValueInput("ID").setCheck(["String", "Number", "Entity"])
        .appendField("💀 Destroy entity");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#9b59b6');
    this.setTooltip("Remove entity from game");
  }
};

Blockly.Blocks['entity_move_to'] = {
  init: function() {
    this.appendValueInput("ENTITY").setCheck("Entity")
        .appendField("🚶 Move entity");
    this.appendValueInput("X").setCheck("Number").appendField("to X");
    this.appendValueInput("Y").setCheck("Number").appendField("Y");
    this.appendValueInput("SPEED").setCheck("Number").appendField("speed");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#9b59b6');
    this.setTooltip("Move entity toward target position");
  }
};

Blockly.Blocks['entity_get_all_enemies'] = {
  init: function() {
    this.appendDummyInput().appendField("⚔️ Get all enemies");
    this.setOutput(true, "Array");
    this.setColour('#9b59b6');
    this.setTooltip("Returns array of all enemy entities");
  }
};

// ============================================================
// PLAYER & INVENTORY (12 blocks) - Color: #3498db (blue)
// ============================================================

Blockly.Blocks['player_get_position'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("📍 Player")
        .appendField(new Blockly.FieldDropdown([["X","x"], ["Y","y"]]), "AXIS");
    this.setOutput(true, "Number");
    this.setColour('#3498db');
    this.setTooltip("Get player X or Y coordinate");
  }
};

Blockly.Blocks['player_get_stat'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("❤️ Player")
        .appendField(new Blockly.FieldDropdown([
            ["HP","hp"], 
            ["Max HP","maxHp"], 
            ["Mana","mana"], 
            ["Max Mana","maxMana"],
            ["Stamina","stamina"],
            ["Max Stamina","maxStamina"]
        ]), "STAT");
    this.setOutput(true, "Number");
    this.setColour('#3498db');
    this.setTooltip("Get player stat value");
  }
};

Blockly.Blocks['player_set_stat'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("❤️ Set Player")
        .appendField(new Blockly.FieldDropdown([
            ["HP","hp"], 
            ["Mana","mana"], 
            ["Stamina","stamina"]
        ]), "STAT");
    this.appendValueInput("VALUE").setCheck("Number").appendField("to");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#3498db');
    this.setTooltip("Set player stat (auto-capped to max)");
  }
};

Blockly.Blocks['inventory_has_item'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("🎒 Has item")
        .appendField(new Blockly.FieldTextInput("key"), "ITEM");
    this.setOutput(true, "Boolean");
    this.setColour('#3498db');
    this.setTooltip("Check if player has this item");
  }
};

Blockly.Blocks['inventory_get_count'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("🔢 Count of item")
        .appendField(new Blockly.FieldTextInput("gold"), "ITEM");
    this.setOutput(true, "Number");
    this.setColour('#3498db');
    this.setTooltip("Get quantity of item in inventory");
  }
};

Blockly.Blocks['inventory_add_item'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("➕ Add item")
        .appendField(new Blockly.FieldTextInput("potion"), "ITEM");
    this.appendValueInput("COUNT").setCheck("Number").appendField("×");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#3498db');
    this.setTooltip("Add items to player inventory");
  }
};

Blockly.Blocks['inventory_remove_item'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("➖ Remove item")
        .appendField(new Blockly.FieldTextInput("key"), "ITEM");
    this.appendValueInput("COUNT").setCheck("Number").appendField("×");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#3498db');
    this.setTooltip("Remove items from inventory");
  }
};

Blockly.Blocks['inventory_equip'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("⚡ Equip item")
        .appendField(new Blockly.FieldTextInput("sword"), "ITEM");
    this.appendValueInput("SLOT").setCheck("Number").appendField("to slot");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#3498db');
    this.setTooltip("Equip item to skill slot (0-3)");
  }
};

// ============================================================
// FLAGS & GAME STATE (10 blocks) - Color: #e67e22 (orange)
// ============================================================

Blockly.Blocks['flag_get'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("🚩 Get flag")
        .appendField(new Blockly.FieldTextInput("door_open"), "NAME");
    this.setOutput(true, null);
    this.setColour('#e67e22');
    this.setTooltip("Get flag value (boolean or number)");
  }
};

Blockly.Blocks['flag_set'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("🚩 Set flag")
        .appendField(new Blockly.FieldTextInput("door_open"), "NAME");
    this.appendValueInput("VALUE").setCheck(null).appendField("to");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#e67e22');
    this.setTooltip("Set flag to any value");
  }
};

Blockly.Blocks['flag_increment'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("➕ Increment flag")
        .appendField(new Blockly.FieldTextInput("kills"), "NAME");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#e67e22');
    this.setTooltip("Add 1 to numeric flag");
  }
};

Blockly.Blocks['flag_check_all'] = {
  init: function() {
    this.appendValueInput("FLAGS").setCheck("Array")
        .appendField("✅ All flags true:");
    this.setOutput(true, "Boolean");
    this.setColour('#e67e22');
    this.setTooltip("Check if all flags in array are true");
  }
};

Blockly.Blocks['quest_start'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("📜 Start quest")
        .appendField(new Blockly.FieldTextInput("main_quest"), "ID");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#e67e22');
    this.setTooltip("Begin quest with ID");
  }
};

Blockly.Blocks['quest_complete'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("✅ Complete quest")
        .appendField(new Blockly.FieldTextInput("main_quest"), "ID");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#e67e22');
    this.setTooltip("Mark quest as completed");
  }
};

Blockly.Blocks['quest_fail'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("❌ Fail quest")
        .appendField(new Blockly.FieldTextInput("main_quest"), "ID");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#e67e22');
    this.setTooltip("Mark quest as failed");
  }
};

Blockly.Blocks['quest_get_status'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("📋 Quest status")
        .appendField(new Blockly.FieldTextInput("main_quest"), "ID");
    this.setOutput(true, "String");
    this.setColour('#e67e22');
    this.setTooltip("Returns 'active', 'completed', 'failed', or null");
  }
};

Blockly.Blocks['data_save'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("💾 Save data")
        .appendField(new Blockly.FieldTextInput("myData"), "KEY");
    this.appendValueInput("VALUE").setCheck(null).appendField("value");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#e67e22');
    this.setTooltip("Store custom game data");
  }
};

Blockly.Blocks['data_load'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("📂 Load data")
        .appendField(new Blockly.FieldTextInput("myData"), "KEY");
    this.setOutput(true, null);
    this.setColour('#e67e22');
    this.setTooltip("Retrieve stored game data");
  }
};

// ============================================================
// WORLD (5 blocks) - Color: #27ae60 (green)
// ============================================================

Blockly.Blocks['world_get_tile'] = {
  init: function() {
    this.appendValueInput("X").setCheck("Number").appendField("🌍 Tile at X");
    this.appendValueInput("Y").setCheck("Number").appendField("Y");
    this.setOutput(true, "Number");
    this.setColour('#27ae60');
    this.setTooltip("Get tile ID at world position");
  }
};

Blockly.Blocks['world_set_tile'] = {
  init: function() {
    this.appendValueInput("X").setCheck("Number").appendField("🌍 Set tile at X");
    this.appendValueInput("Y").setCheck("Number").appendField("Y");
    this.appendValueInput("TILE").setCheck("Number").appendField("to tile");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#27ae60');
    this.setTooltip("Change tile at position");
  }
};

// ============================================================
// CAMERA & EFFECTS (8 blocks) - Color: #16a085 (teal)
// ============================================================

Blockly.Blocks['camera_target'] = {
  init: function() {
    this.appendValueInput("ENTITY").setCheck("Entity")
        .appendField("📷 Camera follow");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#16a085');
    this.setTooltip("Make camera follow entity");
  }
};

Blockly.Blocks['camera_shake'] = {
  init: function() {
    this.appendValueInput("INTENSITY").setCheck("Number").appendField("📳 Shake camera");
    this.appendValueInput("DURATION").setCheck("Number").appendField("for");
    this.appendDummyInput().appendField("sec");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#16a085');
    this.setTooltip("Screen shake effect");
  }
};

Blockly.Blocks['camera_zoom'] = {
  init: function() {
    this.appendValueInput("SCALE").setCheck("Number").appendField("🔍 Zoom camera");
    this.appendValueInput("DURATION").setCheck("Number").appendField("over");
    this.appendDummyInput().appendField("sec");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#16a085');
    this.setTooltip("Zoom camera (1.0 = normal)");
  }
};

Blockly.Blocks['screen_flash'] = {
  init: function() {
    this.appendValueInput("COLOR").setCheck("String").appendField("⚡ Flash screen");
    this.appendValueInput("DURATION").setCheck("Number").appendField("for");
    this.appendDummyInput().appendField("sec");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#16a085');
    this.setTooltip("Flash screen with color (#ffffff)");
  }
};

Blockly.Blocks['screen_fade'] = {
  init: function() {
    this.appendValueInput("COLOR").setCheck("String").appendField("🌑 Fade to");
    this.appendValueInput("DURATION").setCheck("Number").appendField("over");
    this.appendDummyInput().appendField("sec");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#16a085');
    this.setTooltip("Fade screen to color");
  }
};

Blockly.Blocks['fx_spawn'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("✨ Spawn FX")
        .appendField(new Blockly.FieldTextInput("explosion"), "NAME");
    this.appendValueInput("X").setCheck("Number").appendField("at X");
    this.appendValueInput("Y").setCheck("Number").appendField("Y");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#16a085');
    this.setTooltip("Create visual effect");
  }
};

// ============================================================
// AUDIO (3 blocks) - Color: #f1c40f (yellow)
// ============================================================

Blockly.Blocks['audio_play_sound'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("🔊 Play sound")
        .appendField(new Blockly.FieldTextInput("hit.mp3"), "NAME");
    this.appendValueInput("VOLUME").setCheck("Number").appendField("volume");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#f1c40f');
    this.setTooltip("Play sound effect (0.0-1.0)");
  }
};

Blockly.Blocks['audio_stop_sound'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("🔇 Stop sound")
        .appendField(new Blockly.FieldTextInput("music"), "NAME");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#f1c40f');
    this.setTooltip("Stop playing sound");
  }
};

Blockly.Blocks['audio_fade_music'] = {
  init: function() {
    this.appendValueInput("VOLUME").setCheck("Number").appendField("🎵 Fade music to");
    this.appendValueInput("DURATION").setCheck("Number").appendField("over");
    this.appendDummyInput().appendField("sec");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#f1c40f');
    this.setTooltip("Fade music volume");
  }
};

// ============================================================
// DIALOGUE & UI (4 blocks) - Color: #95a5a6 (gray)
// ============================================================

Blockly.Blocks['dialogue_show'] = {
  init: function() {
    this.appendValueInput("TEXT").setCheck("String").appendField("💬 Say");
    this.appendDummyInput()
        .appendField("speaker")
        .appendField(new Blockly.FieldTextInput("NPC"), "SPEAKER");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#95a5a6');
    this.setTooltip("Show dialogue text");
  }
};

Blockly.Blocks['dialogue_show_choices'] = {
  init: function() {
    this.appendValueInput("TEXT").setCheck("String").appendField("❓ Ask");
    this.appendValueInput("CHOICES").setCheck("Array").appendField("choices");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#95a5a6');
    this.setTooltip("Show dialogue with choices");
  }
};

Blockly.Blocks['dialogue_wait_choice'] = {
  init: function() {
    this.appendDummyInput().appendField("⏸ Wait for choice");
    this.setOutput(true, "Number");
    this.setColour('#95a5a6');
    this.setTooltip("Wait for player choice (async, returns index)");
  }
};

Blockly.Blocks['ui_notification'] = {
  init: function() {
    this.appendValueInput("TEXT").setCheck("String").appendField("📢 Show");
    this.appendValueInput("DURATION").setCheck("Number").appendField("for");
    this.appendDummyInput().appendField("sec");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#95a5a6');
    this.setTooltip("Show temporary notification");
  }
};

// ============================================================
// TIME & CONTROL (2 blocks) - Color: #34495e (dark gray)
// ============================================================

Blockly.Blocks['time_wait'] = {
  init: function() {
    this.appendValueInput("SECONDS").setCheck("Number").appendField("⏱ Wait");
    this.appendDummyInput().appendField("seconds");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#34495e');
    this.setTooltip("Pause execution (async)");
  }
};

Blockly.Blocks['time_get_game_time'] = {
  init: function() {
    this.appendDummyInput().appendField("🕐 Game time (0-24)");
    this.setOutput(true, "Number");
    this.setColour('#34495e');
    this.setTooltip("Get current in-game time");
  }
};

// --- CODE GENERATORS ---

const javascriptGenerator = Blockly.JavaScript;

// ============================================================
// EVENTS
// ============================================================

javascriptGenerator['event_on_start'] = function(block) {
  const statements = javascriptGenerator.statementToCode(block, 'STACK');
  return `export async function onStart(runtime) {\n${statements}}\n`;
};

javascriptGenerator['event_on_update'] = function(block) {
  const statements = javascriptGenerator.statementToCode(block, 'STACK');
  return `export async function onUpdate(runtime, dt) {\n${statements}}\n`;
};

javascriptGenerator['event_on_interact'] = function(block) {
  const statements = javascriptGenerator.statementToCode(block, 'STACK');
  return `export async function onInteract(runtime, player) {\n${statements}}\n`;
};

// ============================================================
// ENTITY QUERIES
// ============================================================

javascriptGenerator['entity_get_nearby'] = function(block) {
  const range = javascriptGenerator.valueToCode(block, 'RANGE', javascriptGenerator.ORDER_ATOMIC) || '100';
  const type = block.getFieldValue('TYPE');
  return [`runtime.getNearbyEntities(${range}, "${type}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['entity_get_by_name'] = function(block) {
  const name = block.getFieldValue('NAME');
  return [`runtime.getEntityByName("${name}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['entity_get_closest_enemy'] = function(block) {
  return [`runtime.getClosestEnemy()`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['entity_count_type'] = function(block) {
  const type = block.getFieldValue('TYPE');
  return [`runtime.countEntitiesOfType("${type}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['entity_exists'] = function(block) {
  const id = javascriptGenerator.valueToCode(block, 'ID', javascriptGenerator.ORDER_ATOMIC) || '""';
  return [`runtime.entityExists(${id})`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['entity_get_property'] = function(block) {
  const id = javascriptGenerator.valueToCode(block, 'ID', javascriptGenerator.ORDER_ATOMIC) || '""';
  const prop = block.getFieldValue('PROP');
  return [`runtime.getEntityProperty(${id}, "${prop}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['entity_spawn'] = function(block) {
  const type = block.getFieldValue('TYPE');
  const x = javascriptGenerator.valueToCode(block, 'X', javascriptGenerator.ORDER_ATOMIC) || '0';
  const y = javascriptGenerator.valueToCode(block, 'Y', javascriptGenerator.ORDER_ATOMIC) || '0';
  return `runtime.spawnEntity("${type}", ${x}, ${y}, {});\n`;
};

javascriptGenerator['entity_destroy'] = function(block) {
  const id = javascriptGenerator.valueToCode(block, 'ID', javascriptGenerator.ORDER_ATOMIC) || '""';
  return `runtime.destroyEntity(${id});\n`;
};

javascriptGenerator['entity_move_to'] = function(block) {
  const entity = javascriptGenerator.valueToCode(block, 'ENTITY', javascriptGenerator.ORDER_ATOMIC) || 'null';
  const x = javascriptGenerator.valueToCode(block, 'X', javascriptGenerator.ORDER_ATOMIC) || '0';
  const y = javascriptGenerator.valueToCode(block, 'Y', javascriptGenerator.ORDER_ATOMIC) || '0';
  const speed = javascriptGenerator.valueToCode(block, 'SPEED', javascriptGenerator.ORDER_ATOMIC) || '100';
  return `runtime.moveEntity(${entity}, ${x}, ${y}, ${speed});\n`;
};

javascriptGenerator['entity_get_all_enemies'] = function(block) {
  return [`runtime.getAllEnemies()`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

// ============================================================
// PLAYER & INVENTORY
// ============================================================

javascriptGenerator['player_get_position'] = function(block) {
  const axis = block.getFieldValue('AXIS');
  return [`runtime.getPlayerPosition().${axis}`, javascriptGenerator.ORDER_MEMBER];
};

javascriptGenerator['player_get_stat'] = function(block) {
  const stat = block.getFieldValue('STAT');
  return [`runtime.getPlayerStat("${stat}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['player_set_stat'] = function(block) {
  const stat = block.getFieldValue('STAT');
  const value = javascriptGenerator.valueToCode(block, 'VALUE', javascriptGenerator.ORDER_ATOMIC) || '0';
  return `runtime.setPlayerStat("${stat}", ${value});\n`;
};

javascriptGenerator['inventory_has_item'] = function(block) {
  const item = block.getFieldValue('ITEM');
  return [`runtime.hasItem("${item}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['inventory_get_count'] = function(block) {
  const item = block.getFieldValue('ITEM');
  return [`runtime.getItemCount("${item}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['inventory_add_item'] = function(block) {
  const item = block.getFieldValue('ITEM');
  const count = javascriptGenerator.valueToCode(block, 'COUNT', javascriptGenerator.ORDER_ATOMIC) || '1';
  return `runtime.addItem("${item}", ${count});\n`;
};

javascriptGenerator['inventory_remove_item'] = function(block) {
  const item = block.getFieldValue('ITEM');
  const count = javascriptGenerator.valueToCode(block, 'COUNT', javascriptGenerator.ORDER_ATOMIC) || '1';
  return `runtime.removeItem("${item}", ${count});\n`;
};

javascriptGenerator['inventory_equip'] = function(block) {
  const item = block.getFieldValue('ITEM');
  const slot = javascriptGenerator.valueToCode(block, 'SLOT', javascriptGenerator.ORDER_ATOMIC) || '0';
  return `runtime.equipItem("${item}", ${slot});\n`;
};

// ============================================================
// FLAGS & GAME STATE
// ============================================================

javascriptGenerator['flag_get'] = function(block) {
  const name = block.getFieldValue('NAME');
  return [`runtime.getFlag("${name}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['flag_set'] = function(block) {
  const name = block.getFieldValue('NAME');
  const value = javascriptGenerator.valueToCode(block, 'VALUE', javascriptGenerator.ORDER_ATOMIC) || 'true';
  return `runtime.setFlag("${name}", ${value});\n`;
};

javascriptGenerator['flag_increment'] = function(block) {
  const name = block.getFieldValue('NAME');
  return `runtime.incrementFlag("${name}");\n`;
};

javascriptGenerator['flag_check_all'] = function(block) {
  const flags = javascriptGenerator.valueToCode(block, 'FLAGS', javascriptGenerator.ORDER_ATOMIC) || '[]';
  return [`runtime.checkAllFlags(${flags})`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['quest_start'] = function(block) {
  const id = block.getFieldValue('ID');
  return `runtime.startQuest("${id}");\n`;
};

javascriptGenerator['quest_complete'] = function(block) {
  const id = block.getFieldValue('ID');
  return `runtime.completeQuest("${id}");\n`;
};

javascriptGenerator['quest_fail'] = function(block) {
  const id = block.getFieldValue('ID');
  return `runtime.failQuest("${id}");\n`;
};

javascriptGenerator['quest_get_status'] = function(block) {
  const id = block.getFieldValue('ID');
  const code = `(runtime.getQuestProgress("${id}") || {}).status`;
  return [code, javascriptGenerator.ORDER_MEMBER];
};

javascriptGenerator['data_save'] = function(block) {
  const key = block.getFieldValue('KEY');
  const value = javascriptGenerator.valueToCode(block, 'VALUE', javascriptGenerator.ORDER_ATOMIC) || 'null';
  return `runtime.saveGameState("${key}", ${value});\n`;
};

javascriptGenerator['data_load'] = function(block) {
  const key = block.getFieldValue('KEY');
  return [`runtime.loadGameState("${key}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

// ============================================================
// WORLD
// ============================================================

javascriptGenerator['world_get_tile'] = function(block) {
  const x = javascriptGenerator.valueToCode(block, 'X', javascriptGenerator.ORDER_ATOMIC) || '0';
  const y = javascriptGenerator.valueToCode(block, 'Y', javascriptGenerator.ORDER_ATOMIC) || '0';
  return [`runtime.getTileAt(${x}, ${y})`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator['world_set_tile'] = function(block) {
  const x = javascriptGenerator.valueToCode(block, 'X', javascriptGenerator.ORDER_ATOMIC) || '0';
  const y = javascriptGenerator.valueToCode(block, 'Y', javascriptGenerator.ORDER_ATOMIC) || '0';
  const tile = javascriptGenerator.valueToCode(block, 'TILE', javascriptGenerator.ORDER_ATOMIC) || '0';
  return `runtime.setTileAt(${x}, ${y}, ${tile});\n`;
};

// ============================================================
// CAMERA & EFFECTS
// ============================================================

javascriptGenerator['camera_target'] = function(block) {
  const entity = javascriptGenerator.valueToCode(block, 'ENTITY', javascriptGenerator.ORDER_ATOMIC) || 'null';
  return `runtime.setCameraTarget(${entity});\n`;
};

javascriptGenerator['camera_shake'] = function(block) {
  const intensity = javascriptGenerator.valueToCode(block, 'INTENSITY', javascriptGenerator.ORDER_ATOMIC) || '10';
  const duration = javascriptGenerator.valueToCode(block, 'DURATION', javascriptGenerator.ORDER_ATOMIC) || '0.5';
  return `runtime.shakeCamera(${intensity}, ${duration});\n`;
};

javascriptGenerator['camera_zoom'] = function(block) {
  const scale = javascriptGenerator.valueToCode(block, 'SCALE', javascriptGenerator.ORDER_ATOMIC) || '1.0';
  const duration = javascriptGenerator.valueToCode(block, 'DURATION', javascriptGenerator.ORDER_ATOMIC) || '1.0';
  return `runtime.zoomCamera(${scale}, ${duration});\n`;
};

javascriptGenerator['screen_flash'] = function(block) {
  const color = javascriptGenerator.valueToCode(block, 'COLOR', javascriptGenerator.ORDER_ATOMIC) || '"#ffffff"';
  const duration = javascriptGenerator.valueToCode(block, 'DURATION', javascriptGenerator.ORDER_ATOMIC) || '0.2';
  return `runtime.flashScreen(${color}, ${duration});\n`;
};

javascriptGenerator['screen_fade'] = function(block) {
  const color = javascriptGenerator.valueToCode(block, 'COLOR', javascriptGenerator.ORDER_ATOMIC) || '"#000000"';
  const duration = javascriptGenerator.valueToCode(block, 'DURATION', javascriptGenerator.ORDER_ATOMIC) || '1.0';
  return `runtime.fadeScreen(${color}, ${duration});\n`;
};

javascriptGenerator['fx_spawn'] = function(block) {
  const name = block.getFieldValue('NAME');
  const x = javascriptGenerator.valueToCode(block, 'X', javascriptGenerator.ORDER_ATOMIC) || '0';
  const y = javascriptGenerator.valueToCode(block, 'Y', javascriptGenerator.ORDER_ATOMIC) || '0';
  return `runtime.spawnFX("${name}", ${x}, ${y});\n`;
};

// ============================================================
// AUDIO
// ============================================================

javascriptGenerator['audio_play_sound'] = function(block) {
  const name = block.getFieldValue('NAME');
  const volume = javascriptGenerator.valueToCode(block, 'VOLUME', javascriptGenerator.ORDER_ATOMIC) || '1.0';
  return `runtime.playSound("${name}", ${volume}, false);\n`;
};

javascriptGenerator['audio_stop_sound'] = function(block) {
  const name = block.getFieldValue('NAME');
  return `runtime.stopSound("${name}");\n`;
};

javascriptGenerator['audio_fade_music'] = function(block) {
  const volume = javascriptGenerator.valueToCode(block, 'VOLUME', javascriptGenerator.ORDER_ATOMIC) || '1.0';
  const duration = javascriptGenerator.valueToCode(block, 'DURATION', javascriptGenerator.ORDER_ATOMIC) || '1.0';
  return `runtime.fadeMusic(${volume}, ${duration});\n`;
};

// ============================================================
// DIALOGUE & UI
// ============================================================

javascriptGenerator['dialogue_show'] = function(block) {
  const text = javascriptGenerator.valueToCode(block, 'TEXT', javascriptGenerator.ORDER_ATOMIC) || '""';
  const speaker = block.getFieldValue('SPEAKER');
  return `runtime.showDialogue(${text}, "${speaker}");\n`;
};

javascriptGenerator['dialogue_show_choices'] = function(block) {
  const text = javascriptGenerator.valueToCode(block, 'TEXT', javascriptGenerator.ORDER_ATOMIC) || '""';
  const choices = javascriptGenerator.valueToCode(block, 'CHOICES', javascriptGenerator.ORDER_ATOMIC) || '[]';
  return `runtime.showDialogue(${text}, "", ${choices});\n`;
};

javascriptGenerator['dialogue_wait_choice'] = function(block) {
  return [`await runtime.waitForChoice()`, javascriptGenerator.ORDER_AWAIT];
};

javascriptGenerator['ui_notification'] = function(block) {
  const text = javascriptGenerator.valueToCode(block, 'TEXT', javascriptGenerator.ORDER_ATOMIC) || '""';
  const duration = javascriptGenerator.valueToCode(block, 'DURATION', javascriptGenerator.ORDER_ATOMIC) || '2';
  return `runtime.showNotification(${text}, ${duration});\n`;
};

// ============================================================
// TIME & CONTROL
// ============================================================

javascriptGenerator['time_wait'] = function(block) {
  const seconds = javascriptGenerator.valueToCode(block, 'SECONDS', javascriptGenerator.ORDER_ATOMIC) || '1';
  return `await runtime.wait(${seconds});\n`;
};

javascriptGenerator['time_get_game_time'] = function(block) {
  return [`runtime.getGameTime()`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

// --- WORKSPACE SETUP ---

const RedGlitchStudioTheme = Blockly.Theme.defineTheme('redglitch_studio', {
  'base': Blockly.Themes.Dark,
  'blockStyles': {
    'logic_blocks': { 'colourPrimary': '#5b67a5' },
    'loop_blocks': { 'colourPrimary': '#5ba55b' },
    'math_blocks': { 'colourPrimary': '#5b67a5' }
  },
  'categoryStyles': {
    'logic_category': { 'colour': '#5b67a5' },
    'loop_category': { 'colour': '#5ba55b' }
  },
  'componentStyles': {
    'workspaceBackgroundColour': '#05050a',
    'toolboxBackgroundColour': '#111',
    'toolboxForegroundColour': '#888',
    'flyoutBackgroundColour': '#0a0a0a',
    'flyoutForegroundColour': '#ccc',
    'insertionMarkerColour': '#fff',
    'insertionMarkerOpacity': 0.3,
    'scrollbarColour': '#222',
    'cursorColour': '#f1c40f'
  }
});

const workspace = Blockly.inject('blockly-div', {
  toolbox: document.getElementById('toolbox'),
  theme: RedGlitchStudioTheme,
  grid: { spacing: 40, length: 2, colour: '#1a1a2e', snap: true },
  zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
  trashcan: true
});

async function saveLogic() {
  const name = document.getElementById('logic-name').value;
  const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
  const js = javascriptGenerator.workspaceToCode(workspace);
  
  try {
    const res = await fetch('/api/logic/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, xml, js })
    });
    if (res.ok) alert("Logic Studio: Code generated and saved!");
  } catch (e) { alert("Save failed"); }
}

async function loadLogic(name) {
  try {
    const res = await fetch(`/api/logic/${name}`);
    if (res.ok) {
        const data = await res.json();
        const xml = Blockly.Xml.textToDom(data.xml);
        Blockly.Xml.domToWorkspace(xml, workspace);
    }
  } catch (e) {}
}

function clearWorkspace() {
    if (confirm("Clear all blocks?")) workspace.clear();
}

function generateJS() {
    const code = javascriptGenerator.workspaceToCode(workspace);
    alert("GENERATED CODE:\n\n" + code);
}
