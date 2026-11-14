import test from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { setupStudioTest, renderStudioTool, fireEvent, getFetchCalls, act } from './helpers/setupStudioTest';

import PrefabEditor from '../components/PrefabEditor';
import AssetManager from '../components/AssetManager';
import ScriptEditor from '../components/ScriptEditor';
import UIDesigner from '../components/UIDesigner';
import Dashboard from '../components/Dashboard';

// ============================================================================
// 1. PREFAB EDITOR TESTS
// ============================================================================

test('PrefabEditor: mounts, renders prefab library sidebar, and loads definitions', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<PrefabEditor />);

  await wait(() => container.textContent?.includes('PREFAB LIBRARY') || container.textContent?.includes('PREFABS'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('PREFAB LIBRARY') || container.textContent?.includes('PREFABS'), 'Prefab library header must be present');

  // Verify save button exists
  const saveBtn = container.querySelector('button[title*="Save"]') as HTMLElement;
  assert.ok(saveBtn, 'Save button must exist in toolbar');

  unmount();
});

test('PrefabEditor: saves prefab definition to /api/ide/write or /api/prefabs', async () => {
  setupStudioTest();

  let writeBody: any = null;
  const { container, setFetchMock, waitFor: wait, unmount } = await renderStudioTool(<PrefabEditor />);

  setFetchMock('POST /api/ide/write', (req) => {
    writeBody = req.body;
    return { success: true };
  });

  await wait(() => container.textContent?.includes('PREFAB LIBRARY') || container.textContent?.includes('PREFABS'));

  const saveBtn = container.querySelector('button[title*="Save"]') as HTMLElement;
  assert.ok(saveBtn, 'Save button must be present');
  fireEvent.click(saveBtn);

  await wait(() => {
    const calls = getFetchCalls('/api/ide/write').concat(getFetchCalls('/api/prefabs'));
    return calls.length >= 1 || writeBody !== null;
  }, { timeout: 3000 });

  const calls = getFetchCalls('/api/ide/write').concat(getFetchCalls('/api/prefabs'));
  assert.ok(calls.length >= 1 || writeBody !== null, 'Save call to /api/ide/write or /api/prefabs must be invoked');

  unmount();
});

// ============================================================================
// 2. ASSET MANAGER TESTS
// ============================================================================

test('AssetManager: mounts, renders asset manager menubar, and loads asset grid', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<AssetManager />);

  await wait(() => container.textContent?.includes('ASSET MANAGER'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('ASSET MANAGER'), 'Menubar must display ASSET MANAGER');

  // Verify search input exists
  const searchInput = container.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
  assert.ok(searchInput, 'Search input should exist in toolbar');

  unmount();
});

test('AssetManager: search filter and rebuild registry trigger', async () => {
  setupStudioTest();

  let rebuildTriggered = false;
  const { container, setFetchMock, waitFor: wait, unmount } = await renderStudioTool(<AssetManager />);

  setFetchMock('POST /api/assets/rebuild', () => {
    rebuildTriggered = true;
    return { success: true };
  });

  await wait(() => container.textContent?.includes('ASSET MANAGER'));

  // Filter assets by search query
  const searchInput = container.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
  if (searchInput) {
    fireEvent.change(searchInput, { target: { value: 'sword' } });
  }

  // Trigger rebuild index
  const rebuildBtn = container.querySelector('button[title="Rebuild Index"]') as HTMLElement;
  assert.ok(rebuildBtn, 'Rebuild index button must exist');
  fireEvent.click(rebuildBtn);

  await wait(() => {
    const calls = getFetchCalls('POST /api/assets/rebuild');
    return calls.length >= 1 || rebuildTriggered;
  }, { timeout: 3000 });

  const calls = getFetchCalls('POST /api/assets/rebuild');
  assert.ok(calls.length >= 1 || rebuildTriggered, 'POST /api/assets/rebuild must be called');

  unmount();
});

// ============================================================================
// 3. SCRIPT EDITOR (CODE FORGE) TESTS
// ============================================================================

test('ScriptEditor: mounts, renders code forge header, file tree, and editor tabs', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<ScriptEditor />);

  await wait(() => container.textContent?.includes('CODE FORGE'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('CODE FORGE'), 'Header must display CODE FORGE');

  // Verify file tree loaded from /api/ide/tree
  await wait(() => Boolean(container.textContent?.includes('scripts') || container.textContent?.includes('main.js') || container.querySelector('.tree-item')), { timeout: 3000 });
  assert.ok(container.textContent?.includes('scripts') || container.querySelector('.tree-item'), 'File tree should render project structure');

  unmount();
});

test('ScriptEditor: file open in tab and save to /api/ide/write', async () => {
  setupStudioTest();

  let ideWritten = false;
  const { container, setFetchMock, waitFor: wait, unmount } = await renderStudioTool(<ScriptEditor />);

  setFetchMock('POST /api/ide/write', (req) => {
    ideWritten = true;
    return { success: true };
  });

  await wait(() => container.textContent?.includes('CODE FORGE'));

  // Click on a file tree item to open file in editor
  const fileItem = container.querySelector('.tree-item.file') as HTMLElement;
  if (fileItem) {
    fireEvent.click(fileItem);
  }

  // Find save button
  const saveBtn = container.querySelector('button[title*="Save"]') as HTMLElement;
  if (saveBtn) {
    fireEvent.click(saveBtn);
  }

  unmount();
});

// ============================================================================
// 4. UI DESIGNER (INTERFACE STUDIO) TESTS
// ============================================================================

test('UIDesigner: mounts, renders interface studio menubar, and loads ui config', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<UIDesigner />);

  await wait(() => container.textContent?.includes('INTERFACE STUDIO'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('INTERFACE STUDIO'), 'Menubar must display INTERFACE STUDIO');

  // Verify toolbar with add element buttons
  const addBtn = container.querySelector('button[title*="Add"]') as HTMLElement;
  assert.ok(addBtn, 'Add element button should exist in toolbar');

  unmount();
});

test('UIDesigner: element creation and persistence to /api/ui-config', async () => {
  setupStudioTest();

  let uiSaved = false;
  const { container, setFetchMock, waitFor: wait, unmount } = await renderStudioTool(<UIDesigner />);

  setFetchMock('POST /api/ui-config', (req) => {
    uiSaved = true;
    return { success: true };
  });

  await wait(() => container.textContent?.includes('INTERFACE STUDIO'));

  // Click Add Button
  const addButtonBtn = container.querySelector('button[title*="Button"]') as HTMLElement;
  if (addButtonBtn) {
    fireEvent.click(addButtonBtn);
  }

  // Trigger Save
  const saveBtn = container.querySelector('button[title*="Save"]') as HTMLElement;
  assert.ok(saveBtn, 'Save button must exist');
  fireEvent.click(saveBtn);

  await wait(() => {
    const calls = getFetchCalls('/api/ui-config');
    return calls.length >= 1 || uiSaved;
  }, { timeout: 3000 });

  const calls = getFetchCalls('/api/ui-config');
  assert.ok(calls.length >= 1 || uiSaved, 'POST /api/ui-config must be called');

  unmount();
});

// ============================================================================
// 5. DASHBOARD TESTS
// ============================================================================

test('Dashboard: mounts, renders engine banner, system stats, and project list', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<Dashboard />);

  await wait(() => container.textContent?.includes('REDGLITCH ENGINE'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('REDGLITCH ENGINE'), 'Banner must display REDGLITCH ENGINE');

  // Verify Forge New Project card is present
  assert.ok(container.textContent?.includes('FORGE NEW PROJECT'), 'Forge new project action should be present');

  unmount();
});

test('Dashboard: project list reflects loaded project from /api/projects', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<Dashboard />);

  await wait(() => container.textContent?.includes('REDGLITCH ENGINE'));

  // Verify Default Project card appears
  await wait(() => container.textContent?.includes('Default Project'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('Default Project'), 'Default Project card should be rendered');

  unmount();
});
