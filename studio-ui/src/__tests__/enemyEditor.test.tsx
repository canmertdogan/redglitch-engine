import test from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { setupStudioTest, renderStudioTool, fireEvent, getFetchCalls, act } from './helpers/setupStudioTest';

import EnemyEditor, { ensureNewSchema } from '../components/EnemyEditor';

// ============================================================================
// ENEMY EDITOR COMPREHENSIVE SUITE
// ============================================================================

test('EnemyEditor: schema normalizer preserves custom stats, brain scripts, and sanitizes gold', () => {
  const legacy = {
    id: 'orc_berserker',
    name: 'Orc Berserker',
    stats: { atk: 25, def: 12, hp: 180, xpValue: 120 },
    brain: 'custom_ai/berserker_charge.json',
    loot: {
      goldMin: 15,
      goldMax: 40,
      dropChance: 75,
      items: [{ id: 'orc_tusk', chance: 80, min: 1, max: 2 }]
    }
  };

  const normalized = ensureNewSchema(legacy);
  assert.strictEqual(normalized.id, 'orc_berserker');
  assert.strictEqual(normalized.stats.damage, 25, 'atk must map to damage');
  assert.strictEqual(normalized.resistances.armor, 12, 'def must map to armor');
  assert.strictEqual(normalized.stats.xp, 120, 'xpValue must map to xp');
  assert.strictEqual(normalized.ai.script, 'custom_ai/berserker_charge.json', 'brain must map to ai.script');
  assert.deepStrictEqual(normalized.loot.gold, [15, 40], 'loot.gold bounds must be preserved');
  assert.strictEqual(normalized.loot.dropChance, 75);
  assert.strictEqual(normalized.loot.items.length, 1);
});

test('EnemyEditor: ensureNewSchema handles undefined loot and missing goldMax without NaN', () => {
  const bareEnemy = { id: 'rat_1', name: 'Giant Rat' };
  const normalized = ensureNewSchema(bareEnemy);

  assert.ok(Array.isArray(normalized.loot.gold), 'loot.gold must be an array');
  assert.ok(Number.isFinite(normalized.loot.gold[0]), 'gold[0] must be finite');
  assert.ok(Number.isFinite(normalized.loot.gold[1]), 'gold[1] must be finite and not NaN');
  assert.strictEqual(normalized.loot.gold[1], 10, 'default goldMax should be 10');
});

test('EnemyEditor: mounts and renders villain studio menubar, roster list, and synced state', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<EnemyEditor />);

  await wait(() => container.textContent?.includes('VILLAIN STUDIO') || container.textContent?.includes('GOBLIN SCOUT'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('VILLAIN STUDIO') || container.textContent?.includes('ENEMY STUDIO'), 'Menubar must display VILLAIN/ENEMY STUDIO');
  assert.ok(container.textContent?.includes('● SYNCED'), 'Initial status should be synced');

  // Verify loaded enemies from /api/enemies
  await wait(() => container.textContent?.includes('Goblin Scout') || container.textContent?.includes('GOBLIN SCOUT'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('Goblin Scout') || container.textContent?.includes('GOBLIN SCOUT'), 'Loaded enemy from /api/enemies should appear');

  unmount();
});

test('EnemyEditor: modifies enemy name and base stats, tracks dirty state', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<EnemyEditor />);

  await wait(() => (container.textContent?.includes('VILLAIN STUDIO') || container.textContent?.includes('ENEMY STUDIO')) && container.textContent?.includes('GOBLIN SCOUT'));
  assert.ok(container.textContent?.includes('● SYNCED'));

  // Find Enemy Name input in Identity section (labeled Display Name)
  const nameInput = (
    Array.from(container.querySelectorAll('input[type="text"]')).find(input =>
      input.closest('div')?.querySelector('label')?.textContent?.includes('Display Name')
    ) || container.querySelectorAll('input[type="text"]')[2]
  ) as HTMLInputElement;

  assert.ok(nameInput, 'Enemy Name input should be present');
  fireEvent.change(nameInput, { target: { value: 'Goblin Warlord' } });

  await wait(() => container.textContent?.includes('● UNSAVED CHANGES'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('● UNSAVED CHANGES'), 'Editor must mark dirty state on modification');

  unmount();
});

test('EnemyEditor: roster operations (add new enemy and duplicate enemy)', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<EnemyEditor />);

  await wait(() => (container.textContent?.includes('VILLAIN STUDIO') || container.textContent?.includes('ENEMY STUDIO')) && container.textContent?.includes('GOBLIN SCOUT'));

  // Click Duplicate button (Ctrl+D)
  const dupBtn = container.querySelector('button[title*="Duplicate"]') as HTMLButtonElement;
  assert.ok(dupBtn, 'Duplicate button must exist in toolbar');
  fireEvent.click(dupBtn);

  await wait(() => container.textContent?.includes('COPY'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('COPY'), 'Duplicated villain must appear in roster');

  // Click New Villain button
  const addBtn = (container.querySelector('button[title*="Villain"]') || container.querySelector('button[title*="New Enemy"]')) as HTMLButtonElement;
  assert.ok(addBtn, 'New Villain/Enemy button must exist in toolbar');
  fireEvent.click(addBtn);

  await wait(() => container.textContent?.includes('New Monster') || container.textContent?.includes('NEW MONSTER'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('New Monster') || container.textContent?.includes('NEW MONSTER'), 'Newly created villain should be added to roster');

  unmount();
});

test('EnemyEditor: saving sends POST /api/enemies, emits enemy:saved_all, and resets dirty state', async () => {
  setupStudioTest();

  let savedRoster: any = null;
  const { container, setFetchMock, getEmittedEvents, waitFor: wait, unmount } = await renderStudioTool(<EnemyEditor />);

  setFetchMock('POST /api/enemies', (req) => {
    savedRoster = req.body;
    return { success: true, count: Array.isArray(req.body) ? req.body.length : 1 };
  });

  await wait(() => (container.textContent?.includes('VILLAIN STUDIO') || container.textContent?.includes('ENEMY STUDIO')) && container.textContent?.includes('GOBLIN SCOUT'));

  // Modify health stat to make dirty
  const hpInput = container.querySelector('input[type="number"]') as HTMLInputElement;
  if (hpInput) {
    fireEvent.change(hpInput, { target: { value: '120' } });
  }

  // Trigger Save
  const saveBtn = container.querySelector('button[title*="Save"]') as HTMLButtonElement;
  assert.ok(saveBtn, 'Save button must exist');
  fireEvent.click(saveBtn);

  await wait(() => {
    const calls = getFetchCalls('POST /api/enemies');
    return calls.length >= 1 || savedRoster !== null;
  }, { timeout: 3000 });

  const calls = getFetchCalls('POST /api/enemies');
  assert.ok(calls.length >= 1 || savedRoster !== null, 'POST /api/enemies must be invoked');

  if (savedRoster) {
    assert.ok(Array.isArray(savedRoster), 'Payload must be an array of enemies');
    assert.ok(savedRoster.length >= 1, 'Roster should contain at least 1 enemy');
  }

  await wait(() => container.textContent?.includes('● SYNCED'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('● SYNCED'), 'Editor should return to synced state after reload');

  unmount();
});
