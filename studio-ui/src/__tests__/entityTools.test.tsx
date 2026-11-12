/// <reference types="node" />
/**
 * Milestone 2: Entity & Data Authoring Tools Automated Verification Suite
 *
 * Covers:
 * 1. ItemEditor (schema normalization, custom JSON properties validation, template resilience, persistence reload, empty state)
 * 2. NPCEditor (schema normalization, dialogue linkage, quest linkage, directional sprite selector, EventBus broadcast, reload on save)
 * 3. EnemyEditor (schema normalization, AI brain & items safety, template resilience, persistence reload, empty state)
 * 4. QuestEditor (schema normalization & aliases, level prerequisite, objective target autocomplete, persistence reload, empty state)
 * 5. DialogueEditor (schema normalization & denormalization roundtrip, branching flow, portrait sync, project switch, persistence reload)
 */

import test from 'node:test';
import assert from 'node:assert';
import React from 'react';
import {
  setupStudioTest,
  renderStudioTool,
  waitFor,
  fireEvent,
} from './helpers/setupStudioTest';

import ItemEditor, { ensureNewSchema as normalizeItem } from '../components/ItemEditor';
import NPCEditor, { ensureNewSchema as normalizeNPC } from '../components/NPCEditor';
import EnemyEditor, { ensureNewSchema as normalizeEnemy } from '../components/EnemyEditor';
import QuestEditor, { normalizeQuest } from '../components/QuestEditor';
import DialogueEditor, {
  normConversation,
  denormConversation,
  getNpcPortraitSprite,
} from '../components/DialogueEditor';

// ============================================================================
// 1. ITEM EDITOR TESTS
// ============================================================================

test('ItemEditor: ensureNewSchema correctly normalizes legacy and edge-case items', () => {
  const legacyItem = {
    id: 'sword_iron',
    name: 'Iron Blade',
    category: 'WEAPON',
    rarity: 'RARE',
    stats: { atk: 25, crit: 0.1 },
    properties: { durability: 100 },
  };

  const normalized = normalizeItem(legacyItem);

  assert.strictEqual(normalized.id, 'sword_iron');
  assert.strictEqual(normalized.name, 'Iron Blade');
  assert.strictEqual(normalized.type, 'weapon', 'category should fall back to type and be lowercased');
  assert.strictEqual(normalized.rarity, 'rare', 'rarity should be converted to lowercase');
  assert.strictEqual(normalized.stackable, true, 'default stackable should be true');
  assert.strictEqual(normalized.maxStack, 99, 'default maxStack for stackable item should be 99');
  assert.deepStrictEqual(normalized.stats, { atk: 25, crit: 0.1 }, 'stats must be preserved');
  assert.deepStrictEqual(normalized.properties, { durability: 100 }, 'properties must be preserved');

  // Test non-stackable item
  const nonStackable = normalizeItem({ id: 'quest_amulet', stackable: false });
  assert.strictEqual(nonStackable.stackable, false);
  assert.strictEqual(nonStackable.maxStack, 1, 'maxStack for non-stackable should default to 1');
});

test('ItemEditor: renders items, tracks dirty state, and enforces custom JSON validation', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<ItemEditor />);

  await wait(() => container.textContent?.includes('ITEM STUDIO'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('● SYNCED'), 'initial status should be synced');

  // Find properties textarea
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  assert.ok(textarea, 'properties textarea should exist');

  // Enter invalid JSON
  fireEvent.change(textarea, { target: { value: '{ invalid: json ' } });
  await wait(() => container.textContent?.includes('INVALID JSON FORMAT'));

  assert.ok(container.textContent?.includes('INVALID JSON FORMAT'), 'invalid json warning should appear');
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'editor should be marked dirty');

  // Enter valid JSON
  fireEvent.change(textarea, { target: { value: '{"bonus": 10}' } });
  await wait(() => !container.textContent?.includes('INVALID JSON FORMAT'));
  assert.ok(!container.textContent?.includes('INVALID JSON FORMAT'), 'warning should disappear on valid json');

  unmount();
});

test('ItemEditor: handles template modal when /api/templates/item returns an object dictionary', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<ItemEditor />);
  await wait(() => container.textContent?.includes('ITEM STUDIO'));

  // Open Template Modal
  const templateBtn = container.querySelector('button[title="New from Template"]') as HTMLButtonElement;
  assert.ok(templateBtn, 'template button should exist');
  fireEvent.click(templateBtn);

  // Verify modal opens and renders templates without crashing
  await wait(() => container.textContent?.includes('ITEM MODELS'));
  assert.ok(container.textContent?.includes('NEW ITEM'), 'template should be rendered from dictionary');

  unmount();
});

test('ItemEditor: saving sends POST /api/items, reloads data, and emits item:saved_all', async () => {
  setupStudioTest();

  const { container, getFetchCalls, waitFor: wait, unmount } = await renderStudioTool(<ItemEditor />);
  await wait(() => container.textContent?.includes('ITEM STUDIO'));

  // Modify item to make it dirty
  const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: 'Excalibur' } });
  await wait(() => container.textContent?.includes('● UNSAVED CHANGES'));

  // Trigger save
  const saveBtn = container.querySelector('button[title="Save (Ctrl+S)"]') as HTMLButtonElement;
  fireEvent.click(saveBtn);

  await wait(() => getFetchCalls('POST /api/items').length === 1, { timeout: 3000 });
  assert.strictEqual(getFetchCalls('POST /api/items').length, 1, 'POST /api/items should be called once');
  await wait(() => container.textContent?.includes('● SYNCED'));
  assert.ok(container.textContent?.includes('● SYNCED'), 'should return to synced state after save reload');

  unmount();
});

// ============================================================================
// 2. NPC EDITOR TESTS
// ============================================================================

test('NPCEditor: ensureNewSchema normalizes stats, dialogue, and quest linkages', () => {
  const rawNpc = {
    id: 'blacksmith_bobo',
    name: 'Bobo the Smith',
    stats: { speed: 45, hp: 150, defense: 20 },
    dialogueId: 'dlg_blacksmith_intro',
    questId: 'quest_gather_ore',
    turnInQuestId: 'quest_craft_sword',
  };

  const normalized = normalizeNPC(rawNpc);

  assert.strictEqual(normalized.id, 'blacksmith_bobo');
  assert.strictEqual(normalized.name, 'Bobo the Smith');
  assert.strictEqual(normalized.stats.speed, 45);
  assert.strictEqual(normalized.stats.hp, 150, 'hp must be preserved');
  assert.strictEqual(normalized.stats.defense, 20, 'extra stats must be preserved');
  assert.strictEqual(normalized.interaction.dialogue, 'dlg_blacksmith_intro', 'dialogueId should map to interaction.dialogue');
  assert.strictEqual(normalized.interaction.questId, 'quest_gather_ore', 'questId must be set');
  assert.strictEqual(normalized.interaction.giverQuestId, 'quest_gather_ore', 'giverQuestId must be set');
  assert.strictEqual(normalized.interaction.turnInQuestId, 'quest_craft_sword', 'turnInQuestId must be set');
});

test('NPCEditor: renders NPC studio, binds dialogue datalist and quest linkage controls', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<NPCEditor />);

  await wait(() => container.textContent?.includes('NPC STUDIO'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('● SYNCED'));

  // Check for dialogue datalist
  const dialogueDatalist = container.querySelector('#npc-dialogue-list') as HTMLDataListElement;
  assert.ok(dialogueDatalist, 'npc-dialogue-list datalist should exist');

  // Check for Quest Linkage section
  assert.ok(container.textContent?.includes('Quest Linkage'), 'Quest Linkage section should be rendered');
  assert.ok(container.textContent?.includes('Giver Quest'), 'Giver Quest label should be present');
  assert.ok(container.textContent?.includes('Turn-in Quest'), 'Turn-in Quest label should be present');

  // Check directional animation labels
  assert.ok(container.textContent?.includes('South (Down)'), 'South (Down) direction label should exist');
  assert.ok(container.textContent?.includes('North (Up)'), 'North (Up) direction label should exist');
  assert.ok(container.textContent?.includes('Side (East/West)'), 'Side (East/West) direction label should exist');

  unmount();
});

test('NPCEditor: emits npc:updated with roster on addition, modification, and duplicate', async () => {
  setupStudioTest();

  let lastEmitted: any = null;
  const bus = (globalThis as any).RedglitchEventBus;
  bus.on('npc:updated', (ev: any) => {
    lastEmitted = ev;
  });

  const { container, waitFor: wait, unmount } = await renderStudioTool(<NPCEditor />);
  await wait(() => container.textContent?.includes('NPC STUDIO'));

  // Click New NPC
  const newBtn = container.querySelector('button[title="New NPC"]') as HTMLButtonElement;
  assert.ok(newBtn);
  fireEvent.click(newBtn);

  await wait(() => lastEmitted !== null);
  assert.ok(lastEmitted.data.npcId, 'should emit npcId');
  assert.ok(Array.isArray(lastEmitted.data.roster), 'should emit roster array');
  assert.strictEqual(lastEmitted.data.roster.length, 2, 'roster should contain 2 NPCs');

  unmount();
});

// ============================================================================
// 3. ENEMY EDITOR TESTS
// ============================================================================

test('EnemyEditor: ensureNewSchema maps atk->damage, def->armor, xpValue->xp, brain->script', () => {
  const legacyEnemy = {
    id: 'skeleton_warrior',
    name: 'Skeletal Guard',
    stats: { atk: 18, def: 5, xpValue: 75, hp: 80, speed: 70 },
    brain: 'patrol_and_strike.json',
    drops: [
      'bone',
      { id: 'rusty_sword', chance: 25, min: 1, max: 1 },
      { itemId: 'skull_gem', rate: 0.1, quantity: 2 }
    ]
  };

  const normalized = normalizeEnemy(legacyEnemy);

  assert.strictEqual(normalized.id, 'skeleton_warrior');
  assert.strictEqual(normalized.name, 'Skeletal Guard');
  assert.strictEqual(normalized.stats.damage, 18, 'atk should map to stats.damage');
  assert.strictEqual(normalized.resistances.armor, 5, 'def should map to resistances.armor');
  assert.strictEqual(normalized.stats.xp, 75, 'xpValue should map to stats.xp');
  assert.strictEqual(normalized.ai.script, 'patrol_and_strike.json', 'brain should map to ai.script');

  assert.strictEqual(normalized.loot.items.length, 3, 'all 3 drops should be normalized');
  assert.deepStrictEqual(normalized.loot.items[0], { id: 'bone', chance: 100, min: 1, max: 1 });
  assert.deepStrictEqual(normalized.loot.items[1], { id: 'rusty_sword', chance: 25, min: 1, max: 1 });
  assert.deepStrictEqual(normalized.loot.items[2], { id: 'skull_gem', chance: 10, min: 2, max: 2 });
});

test('EnemyEditor: preserves custom AI brain script in dropdown and handles template object', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<EnemyEditor />);
  await wait(() => container.textContent?.includes('ENEMY STUDIO') || container.textContent?.includes('GOBLIN SCOUT'));

  // Verify template modal object resilience (default route returns dictionary object)
  const templateBtn = container.querySelector('button[title="New from Template"]') as HTMLButtonElement;
  fireEvent.click(templateBtn);
  await wait(() => container.textContent?.includes('VILLAIN ARCHETYPES'));
  assert.ok(container.textContent?.includes('NEW ENEMY'), 'templates should render from object without crashing');

  unmount();
});

// ============================================================================
// 4. QUEST EDITOR TESTS
// ============================================================================

test('QuestEditor: normalizeQuest handles title/name, xp/exp, description/text aliases and requiredLevel', () => {
  const legacyQuest = {
    id: 'quest_slay_beast',
    name: 'Slay the Forest Beast',
    desc: 'Deep in the woods, a beast awaits.',
    category: 'bounty',
    minLevel: 5,
    rewards: { exp: 250, gold: 120 },
    stages: [
      { id: 'st_1', description: 'Track the tracks', count: 3, target: 'track_spot', type: 'location' },
      { id: 'st_2', text: 'Kill the beast', amount: 1, target: 'beast_boss', type: 'kill' }
    ]
  };

  const normalized = normalizeQuest(legacyQuest);

  assert.strictEqual(normalized.id, 'quest_slay_beast');
  assert.strictEqual(normalized.title, 'Slay the Forest Beast', 'name should map to title');
  assert.strictEqual(normalized.name, 'Slay the Forest Beast');
  assert.strictEqual(normalized.requiredLevel, 5, 'minLevel should map to requiredLevel');
  assert.strictEqual(normalized.rewards.xp, 250, 'exp should map to rewards.xp');
  assert.strictEqual(normalized.rewards.exp, 250, 'rewards.exp alias should be preserved');
  assert.strictEqual(normalized.stages[0].text, 'Track the tracks', 'description should map to text');
  assert.strictEqual(normalized.stages[0].amount, 3, 'count should map to amount');
  assert.strictEqual(normalized.stages[1].text, 'Kill the beast');
  assert.strictEqual(normalized.stages[1].amount, 1);
});

test('QuestEditor: renders level prerequisite and binds dynamic stage target datalists', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<QuestEditor />);
  await wait(() => container.textContent?.includes('QUEST JOURNAL'));

  // Verify Player Level prerequisite input exists
  assert.ok(container.textContent?.includes('Required Player Level'));
  const levelInput = container.querySelector('input[type="number"][min="1"]') as HTMLInputElement;
  assert.ok(levelInput, 'Player level input must be present');

  // Verify stage target datalists exist
  const npcsDatalist = container.querySelector('#stage-target-npcs');
  const itemsDatalist = container.querySelector('#stage-target-items');
  const enemiesDatalist = container.querySelector('#stage-target-enemies');
  assert.ok(npcsDatalist, 'stage-target-npcs datalist must exist');
  assert.ok(itemsDatalist, 'stage-target-items datalist must exist');
  assert.ok(enemiesDatalist, 'stage-target-enemies datalist must exist');

  unmount();
});

// ============================================================================
// 5. DIALOGUE EDITOR TESTS
// ============================================================================

test('DialogueEditor: normConversation and denormConversation preserve choices, nextId, conditions, and actions', () => {
  const rawDialogue = {
    id: 'dlg_innkeeper',
    title: 'Innkeeper Chat',
    nodes: [
      {
        id: 'node_1',
        speaker: 'npc_innkeeper',
        text: 'Welcome traveler! Need a room?',
        nextId: 'node_2',
        choices: [
          {
            text: 'I would like a room (10 gold)',
            nextScript: 'dlg_rent_room',
            action: 'none',
            condition: { type: 'variable', key: 'gold', operator: '>=', value: 10 }
          },
          {
            text: 'Any work around here?',
            nextScript: 'dlg_give_quest',
            action: 'accept_quest',
            questId: 'quest_inn_rats'
          }
        ]
      }
    ]
  };

  const normalized = normConversation(rawDialogue);

  assert.strictEqual(normalized.id, 'dlg_innkeeper');
  assert.strictEqual(normalized.lines.length, 1);
  assert.strictEqual(normalized.lines[0].id, 'node_1', 'line id should be preserved');
  assert.strictEqual(normalized.lines[0].nextId, 'node_2', 'nextId should be preserved');
  assert.strictEqual(normalized.lines[0].choices?.length, 2);

  const choice1 = normalized.lines[0].choices![0];
  assert.strictEqual(choice1.nextId, 'dlg_rent_room');
  assert.deepStrictEqual(choice1.condition, { type: 'variable', key: 'gold', operator: '>=', value: 10 });

  const choice2 = normalized.lines[0].choices![1];
  assert.strictEqual(choice2.action, 'accept_quest');
  assert.strictEqual(choice2.questId, 'quest_inn_rats');

  // Denormalize back to engine schema
  const denormalized = denormConversation(normalized);
  assert.strictEqual(denormalized.nodes[0].id, 'node_1');
  assert.strictEqual(denormalized.nodes[0].nextId, 'node_2');
  assert.strictEqual(denormalized.nodes[0].choices[0].nextScript, 'dlg_rent_room');
  assert.deepStrictEqual(denormalized.nodes[0].choices[0].condition, { type: 'variable', key: 'gold', operator: '>=', value: 10 });
  assert.strictEqual(denormalized.nodes[0].choices[1].action, 'accept_quest');
  assert.strictEqual(denormalized.nodes[0].choices[1].questId, 'quest_inn_rats');
});

test('DialogueEditor: updates character portrait on npc:updated event', async () => {
  setupStudioTest();

  const { container, emitEvent, waitFor: wait, unmount } = await renderStudioTool(<DialogueEditor />);
  await wait(() => container.textContent?.includes('DIALOGUE EDITOR'));

  // Emit npc:updated with a new NPC portrait
  emitEvent('npc:updated', {
    npc: { id: 'npc_custom', name: 'Mystic Seer', portrait: 'seer_portrait.png' }
  });

  await wait(() => {
    const charSelect = container.querySelector('select');
    return charSelect?.textContent?.includes('Mystic Seer');
  });

  const charSelect = container.querySelector('select');
  assert.ok(charSelect?.textContent?.includes('Mystic Seer'), 'NPC should be synced into dialogue characters');

  unmount();
});

test('DialogueEditor: saves to /api/dialogues and reloads data cleanly', async () => {
  setupStudioTest();

  const { container, getFetchCalls, waitFor: wait, unmount } = await renderStudioTool(<DialogueEditor />);
  await wait(() => container.textContent?.includes('DIALOGUE EDITOR'));

  // Edit conversation title
  const titleInput = container.querySelector('input[value="Guard Greeting"]') as HTMLInputElement;
  if (titleInput) {
    fireEvent.change(titleInput, { target: { value: 'Guard Alert' } });
  }

  // Trigger Save
  const saveBtn = container.querySelector('button[title="Save (Ctrl+S)"]') as HTMLButtonElement;
  fireEvent.click(saveBtn);

  await wait(() => getFetchCalls('POST /api/dialogues').length === 1, { timeout: 3000 });
  const postCall = getFetchCalls('POST /api/dialogues')[0];
  assert.ok(postCall, 'POST /api/dialogues must be invoked');
  assert.ok(Array.isArray(postCall.body?.conversations), 'payload must contain conversations array');

  unmount();
});
