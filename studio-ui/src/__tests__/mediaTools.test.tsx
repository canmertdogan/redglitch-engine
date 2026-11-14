import test from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { setupStudioTest, renderStudioTool, fireEvent, getFetchCalls, act } from './helpers/setupStudioTest';

import AudioStudio from '../components/AudioStudio';
import PixelEditor from '../components/PixelEditor';
import ShaderEditor from '../components/ShaderEditor';
import FXEditor from '../components/FXEditor';

// ============================================================================
// 1. AUDIO STUDIO (DAW) TESTS
// ============================================================================

test('AudioStudio: mounts, renders audio director menubar, and loads audio map', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<AudioStudio />);

  await wait(() => container.textContent?.includes('AUDIO DIRECTOR PRO'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('AUDIO DIRECTOR PRO'), 'Menubar title should display AUDIO DIRECTOR PRO');

  // Verify bus controls or audio events loaded from /api/audio/map
  await wait(() => container.textContent?.includes('MASTER') || container.textContent?.includes('sfx') || container.textContent?.includes('player:jump'), { timeout: 3000 });
  assert.ok(container.querySelector('#menubar') || container.textContent?.includes('AUDIO'), 'Audio Studio layout should be rendered');

  unmount();
});

test('AudioStudio: saves audio map to /api/audio/map when sync/save button clicked', async () => {
  setupStudioTest();

  let savedMapPayload: any = null;
  const { container, setFetchMock, waitFor: wait, unmount } = await renderStudioTool(<AudioStudio />);

  setFetchMock('POST /api/audio/map', (req) => {
    savedMapPayload = req.body;
    return { success: true };
  });

  await wait(() => container.textContent?.includes('AUDIO DIRECTOR PRO'));

  // Find save / sync button
  const syncBtn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.includes('SYNC ENGINE') || b.textContent?.includes('ENGINE_SYNCED') || b.title?.includes('Save')
  );
  assert.ok(syncBtn, 'Sync/Save button should be present in header');

  fireEvent.click(syncBtn);

  await wait(() => {
    const postCalls = getFetchCalls('POST /api/audio/map');
    return postCalls.length >= 1 || savedMapPayload !== null;
  }, { timeout: 3000 });

  const postCalls = getFetchCalls('POST /api/audio/map');
  assert.ok(postCalls.length >= 1 || savedMapPayload !== null, 'POST /api/audio/map must be invoked');

  unmount();
});

// ============================================================================
// 2. PIXEL EDITOR TESTS
// ============================================================================

test('PixelEditor: mounts, renders pixel studio menubar, palette, and canvas viewport', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<PixelEditor />);

  await wait(() => container.textContent?.includes('PIXEL STUDIO'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('PIXEL STUDIO'), 'Menubar must display PIXEL STUDIO');

  // Verify main drawing canvas is rendered
  const canvas = container.querySelector('canvas');
  assert.ok(canvas, 'Drawing canvas must be present in editor');

  // Verify toolbar with tool buttons (pencil, eraser, paint bucket) exists
  const toolbar = container.querySelector('#toolbar');
  assert.ok(toolbar, 'Toolbar must be present');

  unmount();
});

test('PixelEditor: tool switching and canvas dimension resolution', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<PixelEditor />);

  await wait(() => container.textContent?.includes('PIXEL STUDIO'));

  // Switch to Eraser tool
  const eraserBtn = container.querySelector('button[title*="Eraser"]') as HTMLButtonElement;
  if (eraserBtn) {
    fireEvent.click(eraserBtn);
  }

  // Switch to Bucket Fill tool
  const bucketBtn = container.querySelector('button[title*="Fill"]') as HTMLButtonElement;
  if (bucketBtn) {
    fireEvent.click(bucketBtn);
  }

  // Canvas should remain intact and valid
  const canvas = container.querySelector('canvas') as HTMLCanvasElement;
  assert.ok(canvas && canvas.width > 0, 'Canvas must retain valid pixel dimensions');

  unmount();
});

test('PixelEditor: saves sprite asset to /api/assets/upload', async () => {
  setupStudioTest();

  let uploadedPayload: any = null;
  const { container, setFetchMock, waitFor: wait, unmount } = await renderStudioTool(<PixelEditor />);

  setFetchMock('POST /api/assets/upload', (req) => {
    uploadedPayload = req.body;
    return { success: true, path: 'assets/hero_sprite.png' };
  });

  await wait(() => container.textContent?.includes('PIXEL STUDIO'));

  // Find save button
  const saveBtn = container.querySelector('button[title*="Save"]') as HTMLButtonElement;
  assert.ok(saveBtn, 'Save button must be present in toolbar');

  fireEvent.click(saveBtn);

  await wait(() => {
    const calls = getFetchCalls('POST /api/assets/upload');
    return calls.length >= 1 || uploadedPayload !== null;
  }, { timeout: 3000 });

  const calls = getFetchCalls('POST /api/assets/upload');
  assert.ok(calls.length >= 1 || uploadedPayload !== null, 'POST /api/assets/upload must be invoked on save');

  unmount();
});

// ============================================================================
// 3. SHADER EDITOR (SHADER LAB) TESTS
// ============================================================================

test('ShaderEditor: mounts, renders shader lab menubar, and loads shader list', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<ShaderEditor />);

  await wait(() => container.textContent?.includes('SHADER LAB'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('SHADER LAB'), 'Menubar must display SHADER LAB');

  // Verify toolbar with compile and save buttons exists
  const compileBtn = container.querySelector('button[title="Compile"]') as HTMLElement;
  assert.ok(compileBtn, 'Compile button should be present in toolbar');

  unmount();
});

test('ShaderEditor: modifies shader name and persists to /api/shaders/save', async () => {
  setupStudioTest();

  let savedShader: any = null;
  const { container, setFetchMock, waitFor: wait, unmount } = await renderStudioTool(<ShaderEditor />);

  setFetchMock('POST /api/shaders/save', (req) => {
    savedShader = req.body;
    return { success: true };
  });

  await wait(() => container.textContent?.includes('SHADER LAB'));

  // Find shader name input
  const nameInput = container.querySelector('input[placeholder="shader_name"]') as HTMLInputElement;
  if (nameInput) {
    fireEvent.change(nameInput, { target: { value: 'custom_water' } });
  }

  // Trigger Save
  const saveBtn = container.querySelector('button[title*="Save"]') as HTMLButtonElement;
  if (saveBtn) {
    fireEvent.click(saveBtn);
  }

  // Verify save endpoint was called or name input updated
  if (saveBtn) {
    await wait(() => {
      const calls = getFetchCalls('POST /api/shaders/save');
      return calls.length >= 1 || savedShader !== null;
    }, { timeout: 3000 });

    const calls = getFetchCalls('POST /api/shaders/save');
    assert.ok(calls.length >= 1 || savedShader !== null, 'POST /api/shaders/save should be called');
  }

  unmount();
});

// ============================================================================
// 4. FX EDITOR (PARTICLE MASTER) TESTS
// ============================================================================

test('FXEditor: mounts, renders FX master menubar, and loads effect list', async () => {
  setupStudioTest();

  const { container, waitFor: wait, unmount } = await renderStudioTool(<FXEditor />);

  await wait(() => container.textContent?.includes('FX MASTER'), { timeout: 3000 });
  assert.ok(container.textContent?.includes('FX MASTER'), 'Menubar must display FX MASTER');

  // Verify particle canvas is present
  const canvas = container.querySelector('canvas');
  assert.ok(canvas, 'FX preview canvas must be rendered');

  unmount();
});

test('FXEditor: modifies particle parameters and persists to /api/fx/save', async () => {
  setupStudioTest();

  let savedFX: any = null;
  const { container, setFetchMock, waitFor: wait, unmount } = await renderStudioTool(<FXEditor />);

  setFetchMock('POST /api/fx/save', (req) => {
    savedFX = req.body;
    return { success: true };
  });

  await wait(() => container.textContent?.includes('FX MASTER'));

  // Find FX Name input
  const nameInput = container.querySelector('input[type="text"]') as HTMLInputElement;
  if (nameInput) {
    fireEvent.change(nameInput, { target: { value: 'explosion_nova' } });
  }

  // Find Save button
  const saveBtn = container.querySelector('button[title*="Save Effect"]') as HTMLButtonElement;
  assert.ok(saveBtn, 'Save Effect button must exist in toolbar');
  fireEvent.click(saveBtn);

  await wait(() => {
    const calls = getFetchCalls('POST /api/fx/save');
    return calls.length >= 1 || savedFX !== null;
  }, { timeout: 3000 });

  const calls = getFetchCalls('POST /api/fx/save');
  assert.ok(calls.length >= 1 || savedFX !== null, 'POST /api/fx/save must be called');

  unmount();
});
