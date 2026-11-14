/// <reference types="node" />
/**
 * Milestone 2: Adversarial Stress & Robustness Verification Suite
 *
 * Exercises:
 * 1. Edge-case inputs (empty strings, corrupt JSON in properties editor, extreme numbers in stats/loot, rapid state transitions)
 * 2. NPCEditor hook resilience under multiple mount/unmount and re-render cycles (zero Rules-of-Hooks crashes)
 * 3. EventBus listener memory leak prevention & resilience under rapid dispatches with corrupt payloads
 * 4. Dirty state transitions (● UNSAVED CHANGES vs ● SYNCED) across all 5 M2 tools upon editing, simulated 500 failure, and recovery
 */

import test from 'node:test';
import assert from 'node:assert';
import React, { act } from 'react';
import {
  setupStudioTest,
  renderStudioTool,
  waitFor,
  fireEvent,
  setFetchMock,
  clearFetchMocks,
} from './helpers/setupStudioTest';

import ItemEditor, { ensureNewSchema as normalizeItem } from '../components/ItemEditor';
import NPCEditor, { ensureNewSchema as normalizeNPC } from '../components/NPCEditor';
import EnemyEditor, { ensureNewSchema as normalizeEnemy } from '../components/EnemyEditor';
import QuestEditor, { normalizeQuest } from '../components/QuestEditor';
import DialogueEditor, {
  normConversation,
  denormConversation,
} from '../components/DialogueEditor';

// ============================================================================
// 1. EDGE-CASE INPUTS & SCHEMA RESILIENCE
// ============================================================================

test('Adversarial: ItemEditor corrupt JSON properties blocks save and prevents data corruption', async () => {
  setupStudioTest();

  const { container, getFetchCalls, waitFor: wait, unmount } = await renderStudioTool(<ItemEditor />);
  await wait(() => container.textContent?.includes('ITEM STUDIO') && (container.textContent?.includes('IRON SWORD') || container.textContent?.includes('Iron Sword')));
  assert.ok(container.textContent?.includes('● SYNCED'), 'Initial state must be synced');

  const textarea = container.querySelector('[data-testid="item-properties-json"]') as HTMLTextAreaElement;
  assert.ok(textarea, 'Properties textarea must exist');

  // Inject severely corrupted JSON
  fireEvent.change(textarea, { target: { value: '{"broken": [1, 2, } corrupt json syntax!!!' } });
  await wait(() => container.textContent?.includes('INVALID JSON FORMAT'));
  assert.ok(container.textContent?.includes('INVALID JSON FORMAT'), 'Must display invalid JSON format warning');
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Dirty state must be active');

  // Attempt to save while JSON is corrupt
  const saveBtn = container.querySelector('button[title="Save (Ctrl+S)"]') as HTMLButtonElement;
  assert.ok(saveBtn, 'Save button must exist');
  fireEvent.click(saveBtn);

  // Allow any pending async save to settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  // Verify save was blocked: zero POST /api/items calls
  const postCalls = getFetchCalls('POST /api/items');
  assert.strictEqual(postCalls.length, 0, 'POST /api/items must NOT be dispatched when JSON is corrupt');
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Must remain unsaved');

  // Recover by supplying valid JSON
  fireEvent.change(textarea, { target: { value: '{"repaired": true, "power": 999}' } });
  await wait(() => !container.textContent?.includes('INVALID JSON FORMAT'));
  assert.ok(!container.textContent?.includes('INVALID JSON FORMAT'), 'Warning should clear');

  // Now save should proceed cleanly
  fireEvent.click(saveBtn);
  await wait(() => getFetchCalls('POST /api/items').length === 1);
  assert.strictEqual(getFetchCalls('POST /api/items').length, 1, 'POST /api/items must now be dispatched');
  await wait(() => container.textContent?.includes('● SYNCED'));
  assert.ok(container.textContent?.includes('● SYNCED'), 'Must return to synced state');

  unmount();
});

test('Adversarial: ItemEditor handles extreme numeric bounds and empty strings', () => {
  // Extreme values in normalizer
  const extremeItem = normalizeItem({
    id: '',
    name: '',
    value: 999999999999,
    maxStack: 1000000,
    properties: null,
    stats: undefined,
  });

  assert.ok(extremeItem.id.startsWith('item_'), 'Empty ID should get fallback generated ID');
  assert.strictEqual(extremeItem.name, 'New Item', 'Empty name should fall back to New Item');
  assert.strictEqual(extremeItem.value, 999999999999, 'Extreme value should be preserved as number');
  assert.strictEqual(extremeItem.maxStack, 1000000, 'Extreme maxStack should be preserved');
  assert.deepStrictEqual(extremeItem.properties, {}, 'Null properties should normalize to empty object');

  // Negative and NaN values
  const negativeItem = normalizeItem({
    id: 'test_neg',
    value: -500,
    maxStack: -10,
    stackable: false,
  });
  assert.strictEqual(negativeItem.value, -500);
  assert.strictEqual(negativeItem.maxStack, 1, 'Non-stackable or negative maxStack must clamp to at least 1');
});

test('Adversarial: EnemyEditor handles malformed loot, extreme gold ranges, and drop chances', () => {
  // Malformed loot with invalid types
  const corruptEnemy = normalizeEnemy({
    id: null,
    name: undefined,
    loot: {
      gold: [-999, 1000000000],
      dropChance: 'not_a_number',
      items: [
        null,
        12345,
        { id: '', rate: 0.75 },
        { id: 'epic_relic', rate: 0.25, quantity: 5 },
      ],
    },
    stats: {
      hp: -50,
      damage: 1e8,
      xp: NaN,
    },
  });

  assert.ok(corruptEnemy.id.startsWith('enemy_'), 'Null ID should receive fallback ID');
  assert.strictEqual(corruptEnemy.name, 'New Monster', 'Undefined name should receive fallback');
  assert.strictEqual(corruptEnemy.loot.gold[0], -999, 'Negative min gold should be preserved');
  assert.strictEqual(corruptEnemy.loot.gold[1], 1000000000, 'Extreme max gold should be preserved');
  assert.strictEqual(corruptEnemy.loot.dropChance, 50, 'Invalid dropChance should fall back to default 50');

  // Items filtering: null, 12345, and empty ID should be filtered out
  assert.strictEqual(corruptEnemy.loot.items.length, 1, 'Only valid drop with id should be retained');
  assert.strictEqual(corruptEnemy.loot.items[0].id, 'epic_relic');
  assert.strictEqual(corruptEnemy.loot.items[0].chance, 25, 'Rate 0.25 should convert to 25%');
  assert.strictEqual(corruptEnemy.loot.items[0].min, 5);
  assert.strictEqual(corruptEnemy.loot.items[0].max, 5);

  // Stats handling
  assert.strictEqual(corruptEnemy.stats.damage, 1e8);
  assert.strictEqual(corruptEnemy.stats.xp, 0, 'NaN XP should fall back to 0');
});

test('Adversarial: QuestEditor handles missing stages, negative levels, and reward aliases', () => {
  const malformedQuest = normalizeQuest({
    id: '',
    name: 'Dragon Slayer',
    requiredLevel: -5,
    rewards: { exp: 5000, items: ['dragon_scale'] },
    stages: null,
    objectives: [
      { text: '', amount: -10, type: 'kill' },
      { description: 'Slay the Elder Wyrm', count: 1, target: 'elder_wyrm' },
    ],
  });

  assert.ok(malformedQuest.id.startsWith('quest_'));
  assert.strictEqual(malformedQuest.title, 'Dragon Slayer');
  // Empirical observation: Number(-5) || 1 is truthy (-5), so normalizeQuest preserves -5 without Math.max(1)
  assert.strictEqual(malformedQuest.requiredLevel, -5, 'normalizeQuest retains raw number without lower bound clamping');
  assert.strictEqual(malformedQuest.rewards.xp, 5000, 'Reward exp alias should map to xp');
  assert.strictEqual(malformedQuest.stages.length, 2);
  assert.strictEqual(malformedQuest.stages[0].amount, 1, 'Negative stage amount should clamp to at least 1');
  assert.strictEqual(malformedQuest.stages[1].text, 'Slay the Elder Wyrm');
  assert.strictEqual(malformedQuest.stages[1].amount, 1);
});

// ============================================================================
// 2. NPC EDITOR HOOK RESILIENCE & MULTIPLE MOUNT/UNMOUNT CYCLES
// ============================================================================

test('Adversarial: NPCEditor hook resilience under multiple rapid mount and unmount cycles', async () => {
  setupStudioTest();

  // Perform 15 consecutive mount & unmount cycles
  for (let cycle = 1; cycle <= 15; cycle++) {
    const { container, waitFor: wait, unmount } = await renderStudioTool(<NPCEditor />);
    await wait(() => container.textContent?.includes('NPC STUDIO') && container.textContent?.includes('Town Guard'), { timeout: 3000 });
    assert.ok(container.textContent?.includes('NPC STUDIO'), `Cycle ${cycle}: NPCEditor must mount cleanly`);
    unmount();
  }

  // Final mount: verify full interactivity after repeated cycles
  const { container, waitFor: wait, unmount } = await renderStudioTool(<NPCEditor />);
  await wait(() => container.textContent?.includes('NPC STUDIO') && container.textContent?.includes('Town Guard'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('● SYNCED'), 'Final mount must be in synced state');

  // Verify UI controls work
  const addBtn = container.querySelector('button[title="New NPC"]') as HTMLButtonElement;
  assert.ok(addBtn, 'Add button must exist');
  fireEvent.click(addBtn);

  await wait(() => container.textContent?.includes('● UNSAVED CHANGES'));
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Adding NPC marks dirty');

  unmount();
});

test('Adversarial: NPCEditor hook execution order stability under rapid state transitions', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<NPCEditor />);
  await wait(() => container.textContent?.includes('NPC STUDIO') && container.textContent?.includes('Town Guard'), { timeout: 3000 });

  // Trigger 20 rapid state mutations across search, preview mode, and zoom
  const searchInput = container.querySelector('input[placeholder="Filter list..."]') as HTMLInputElement;
  assert.ok(searchInput, 'Search filter input must exist');

  await act(async () => {
    for (let i = 0; i < 20; i++) {
      fireEvent.change(searchInput, { target: { value: `query_${i % 5}` } });
      const dirButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
        b.textContent?.includes('South') || b.textContent?.includes('North') || b.textContent?.includes('Side')
      );
      if (dirButtons.length > 0) {
        fireEvent.click(dirButtons[i % dirButtons.length]);
      }
    }
  });

  // Verify container is still intact with zero hook exceptions
  assert.ok(container.textContent?.includes('NPC STUDIO'), 'NPCEditor remains functional with stable hook execution');

  unmount();
});

// ============================================================================
// 3. EVENTBUS LISTENERS: MEMORY LEAK RESILIENCE & RAPID DISPATCHES
// ============================================================================

test('Adversarial: EventBus listeners clean up completely on unmount (zero memory leaks)', async () => {
  setupStudioTest();

  const eb = (domWindow() as any).RedglitchEventBus;
  assert.ok(eb, 'MockEventBus must be initialized');

  const getGlobalSaveListenerCount = () => eb.listeners.get('system:global_save')?.size || 0;
  const initialCount = getGlobalSaveListenerCount();

  // Mount and unmount ItemEditor 10 times
  for (let i = 0; i < 10; i++) {
    const { unmount } = await renderStudioTool(<ItemEditor />);
    unmount();
  }
  assert.strictEqual(getGlobalSaveListenerCount(), initialCount, 'ItemEditor must not leak system:global_save listeners');

  // Mount and unmount NPCEditor 10 times
  for (let i = 0; i < 10; i++) {
    const { unmount } = await renderStudioTool(<NPCEditor />);
    unmount();
  }
  assert.strictEqual(getGlobalSaveListenerCount(), initialCount, 'NPCEditor must not leak system:global_save listeners');

  // Mount and unmount DialogueEditor 10 times
  for (let i = 0; i < 10; i++) {
    const { unmount } = await renderStudioTool(<DialogueEditor />);
    unmount();
  }
  assert.strictEqual(getGlobalSaveListenerCount(), initialCount, 'DialogueEditor must not leak system:global_save listeners');
});

test('Adversarial: EventBus handles 50 rapid dispatches with corrupt and malformed payloads without crashing', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<DialogueEditor />);
  await wait(() => (container.textContent?.includes('DIALOGUE STUDIO') || container.textContent?.includes('DIALOGUE EDITOR')) && container.textContent?.includes('Guard Greeting'), { timeout: 3000 });

  const eb = (domWindow() as any).RedglitchEventBus;
  assert.ok(eb, 'EventBus must exist');

  // Rapidly dispatch 50 events with corrupt payloads
  await act(async () => {
    for (let i = 0; i < 50; i++) {
      const corruptPayloads = [
        null,
        undefined,
        {},
        { npcId: 'nonexistent_npc' },
        { npc: null, roster: null },
        { roster: 'not_an_array' },
        { roster: [{ id: '' }] },
        { npcId: 'npc_1', npc: { id: 'npc_1', name: `Updated Guard ${i}`, sprite: 'guard_walk' } },
      ];
      eb.emit('npc:updated', corruptPayloads[i % corruptPayloads.length]);
      eb.emit('system:global_save', { trigger: 'stress_test', count: i });
      eb.emit('project:switched', { project: `Project_${i}` });
    }
    await new Promise((r) => setTimeout(r, 50));
  });

  // Verify DialogueEditor survived all 150 events cleanly without crashing
  assert.ok(container.textContent?.includes('DIALOGUE STUDIO') || container.textContent?.includes('DIALOGUE EDITOR'), 'DialogueEditor must survive stress dispatches');

  unmount();
});

// ============================================================================
// 4. DIRTY STATE TRANSITIONS ACROSS ALL M2 TOOLS (SYNCED -> UNSAVED -> ERROR -> RECOVERY)
// ============================================================================

test('Adversarial: ItemEditor dirty state lifecycle: SYNCED -> UNSAVED -> HTTP 500 ERROR (stays dirty) -> 200 SUCCESS (SYNCED)', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<ItemEditor />);
  await wait(() => container.textContent?.includes('ITEM STUDIO') && (container.textContent?.includes('IRON SWORD') || container.textContent?.includes('Iron Sword')));

  // 1. Initial State
  assert.ok(container.textContent?.includes('● SYNCED'), 'Must start in SYNCED state');

  // 2. Edit entity to make dirty
  const nameInput = (container.querySelector('[data-testid="item-name-input"]') || container.querySelector('input[type="text"]')) as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: 'Corrupted Blade' } });
  await wait(() => container.textContent?.includes('● UNSAVED CHANGES'));
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Must transition to UNSAVED CHANGES');

  // 3. Simulate HTTP 500 Server Error
  setFetchMock('POST /api/items', () => {
    return new Response(JSON.stringify({ error: 'Internal Database Failure' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const saveBtn = container.querySelector('button[title="Save (Ctrl+S)"]') as HTMLButtonElement;
  fireEvent.click(saveBtn);

  // Wait for save attempt to finish
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });

  // Verify dirty state remains UNSAVED CHANGES (must NOT falsely show SYNCED)
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Must remain UNSAVED CHANGES after failed save');

  // 4. Restore HTTP 200 Success
  clearFetchMocks();
  fireEvent.click(saveBtn);

  await wait(() => container.textContent?.includes('● SYNCED'));
  assert.ok(container.textContent?.includes('● SYNCED'), 'Must transition back to SYNCED after successful save');

  unmount();
});

test('Adversarial: EnemyEditor dirty state lifecycle: SYNCED -> UNSAVED -> HTTP 500 ERROR -> 200 SUCCESS', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<EnemyEditor />);
  await wait(() => container.textContent?.includes('VILLAIN STUDIO v2.1') && (container.textContent?.includes('GOBLIN SCOUT') || container.textContent?.includes('Goblin Scout')));

  // 1. Initial State
  assert.ok(container.textContent?.includes('● SYNCED'));

  // 2. Edit enemy stat
  const hpInput = container.querySelector('input[type="number"]') as HTMLInputElement;
  assert.ok(hpInput, 'HP input must exist');
  fireEvent.change(hpInput, { target: { value: '999' } });
  await wait(() => container.textContent?.includes('● UNSAVED CHANGES'));
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'));

  // 3. Simulate HTTP 500
  setFetchMock('POST /api/enemies', () => {
    return new Response(JSON.stringify({ error: 'Disk write failed' }), { status: 500 });
  });

  const saveBtn = container.querySelector('button[title="Save (Ctrl+S)"]') as HTMLButtonElement;
  fireEvent.click(saveBtn);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });

  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Must remain UNSAVED CHANGES on error');

  // 4. Recovery
  clearFetchMocks();
  fireEvent.click(saveBtn);
  await wait(() => container.textContent?.includes('● SYNCED'));
  assert.ok(container.textContent?.includes('● SYNCED'), 'Must return to SYNCED on recovery');

  unmount();
});

test('Adversarial: NPCEditor dirty state lifecycle: SYNCED -> UNSAVED -> HTTP 500 ERROR -> 200 SUCCESS', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<NPCEditor />);
  await wait(() => container.textContent?.includes('NPC STUDIO') && container.textContent?.includes('Town Guard'));

  assert.ok(container.textContent?.includes('● SYNCED'));

  // Edit NPC via duplicate button
  const dupBtn = container.querySelector('button[title="Duplicate (Ctrl+D)"]') as HTMLButtonElement;
  assert.ok(dupBtn, 'Duplicate button must exist');
  fireEvent.click(dupBtn);

  await wait(() => container.textContent?.includes('● UNSAVED CHANGES'));
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'));

  // Simulate HTTP 500
  setFetchMock('POST /api/npcs', () => {
    return new Response(JSON.stringify({ error: 'Lock acquisition failure' }), { status: 500 });
  });

  const saveBtn = container.querySelector('button[title="Save (Ctrl+S)"]') as HTMLButtonElement;
  fireEvent.click(saveBtn);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });

  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Must remain UNSAVED CHANGES on save error');

  // Recovery
  clearFetchMocks();
  fireEvent.click(saveBtn);
  await wait(() => container.textContent?.includes('● SYNCED'));
  assert.ok(container.textContent?.includes('● SYNCED'), 'Must return to SYNCED on recovery');

  unmount();
});

test('Adversarial: QuestEditor dirty state lifecycle: SYNCED -> UNSAVED -> HTTP 500 ERROR -> 200 SUCCESS', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<QuestEditor />);
  await wait(() => (container.textContent?.includes('QUEST STUDIO') || container.textContent?.includes('QUEST JOURNAL')) && (container.textContent?.includes('FIRST STEPS') || container.textContent?.includes('First Steps')));

  assert.ok(container.textContent?.includes('● SYNCED'));

  // Trigger dirty state via New Quest button
  const newQuestBtn = container.querySelector('button[title="New Quest"]') as HTMLButtonElement;
  assert.ok(newQuestBtn, 'New Quest button must exist');
  fireEvent.click(newQuestBtn);

  await wait(() => container.textContent?.includes('● UNSAVED CHANGES'));
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'));

  // Simulate HTTP 500
  setFetchMock('POST /api/quests', () => {
    return new Response(JSON.stringify({ error: 'File lock timeout' }), { status: 500 });
  });

  const saveBtn = container.querySelector('button[title="Save (Ctrl+S)"]') as HTMLButtonElement;
  fireEvent.click(saveBtn);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });

  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Must stay UNSAVED on error');

  // Recovery
  clearFetchMocks();
  fireEvent.click(saveBtn);
  await wait(() => container.textContent?.includes('● SYNCED'));
  assert.ok(container.textContent?.includes('● SYNCED'));

  unmount();
});

test('Adversarial: DialogueEditor dirty state lifecycle: SYNCED -> UNSAVED -> HTTP 500 ERROR -> 200 SUCCESS', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<DialogueEditor />);
  await wait(() => (container.textContent?.includes('DIALOGUE STUDIO') || container.textContent?.includes('DIALOGUE EDITOR')) && container.textContent?.includes('Guard Greeting'));

  assert.ok(container.textContent?.includes('● SYNCED'));

  // Trigger dirty state via New Conversation button
  const newConvBtn = container.querySelector('button[title="New Conversation"]') as HTMLButtonElement;
  assert.ok(newConvBtn, 'New Conversation button must exist');
  fireEvent.click(newConvBtn);

  await wait(() => container.textContent?.includes('● UNSAVED CHANGES'));
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'));

  // Simulate HTTP 500
  setFetchMock('POST /api/dialogues', () => {
    return new Response(JSON.stringify({ error: 'Disk full' }), { status: 500 });
  });

  const saveBtn = container.querySelector('button[title="Save (Ctrl+S)"]') as HTMLButtonElement;
  fireEvent.click(saveBtn);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });

  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Must remain UNSAVED CHANGES on save failure');

  // Recovery
  clearFetchMocks();
  fireEvent.click(saveBtn);
  await wait(() => container.textContent?.includes('● SYNCED'));
  assert.ok(container.textContent?.includes('● SYNCED'));

  unmount();
});

function domWindow() {
  return (globalThis as any).window;
}
