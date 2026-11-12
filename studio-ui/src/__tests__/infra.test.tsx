/// <reference types="node" />
/**
 * Redglitch Game Studio - Studio UI Infra & Test Harness Verification
 *
 * Smoke test verifying:
 * 1. setupStudioTest environment initialization and JSDOM globals (including getComputedStyle).
 * 2. Canvas 2D and WebGL stubs work and don't throw.
 * 3. Web Audio and KAE engine mocks.
 * 4. Mock fetch interceptor intercepts /api/items, records calls, and supports custom mocks & HTTP error statuses (500).
 * 5. Mock Monaco editor, useMonaco hook, getModel().setValue synchronous flush, and line/range inspection methods.
 * 6. Rendering an actual React studio tool (ItemEditor) with renderStudioTool.
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
import MockEditor, { useMonaco, mockMonacoInstance } from './helpers/mockMonaco';
import ItemEditor from '../components/ItemEditor';

test('infra: setupStudioTest initializes JSDOM globals and browser APIs', () => {
  setupStudioTest();

  assert.ok(globalThis.window, 'window should be defined');
  assert.ok(globalThis.document, 'document should be defined');
  assert.strictEqual(window.location.origin, 'http://localhost:3000', 'origin should be http://localhost:3000');
  assert.strictEqual((globalThis as any).IS_REACT_ACT_ENVIRONMENT, true, 'IS_REACT_ACT_ENVIRONMENT must be true');
  assert.strictEqual(typeof window.requestAnimationFrame, 'function', 'requestAnimationFrame should be available');
  assert.strictEqual(typeof window.cancelAnimationFrame, 'function', 'cancelAnimationFrame should be available');
  assert.strictEqual(typeof window.ResizeObserver, 'function', 'ResizeObserver should be available');
  assert.strictEqual(typeof window.IntersectionObserver, 'function', 'IntersectionObserver should be available');
  assert.strictEqual(typeof window.localStorage, 'object', 'localStorage should be available');
});

test('infra: getComputedStyle is available on globalThis and window for styling helpers', () => {
  setupStudioTest();

  assert.strictEqual(typeof (globalThis as any).getComputedStyle, 'function', 'getComputedStyle should exist on globalThis');
  assert.strictEqual(typeof window.getComputedStyle, 'function', 'getComputedStyle should exist on window');

  const style = getComputedStyle(document.documentElement);
  assert.ok(style, 'getComputedStyle should return CSSStyleDeclaration');
  assert.strictEqual(typeof style.getPropertyValue, 'function', 'getPropertyValue should be a function');
});

test('infra: Canvas 2D and WebGL stubs function cleanly with non-zero dimensions', () => {
  setupStudioTest();

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  document.body.appendChild(canvas);

  // Check non-zero getBoundingClientRect to prevent division-by-zero crashes
  const rect = canvas.getBoundingClientRect();
  assert.strictEqual(rect.width, 320, 'canvas rect width should match canvas width');
  assert.strictEqual(rect.height, 240, 'canvas rect height should match canvas height');

  // Check 2D context
  const ctx2d = canvas.getContext('2d');
  assert.ok(ctx2d, '2D context should be returned');
  assert.doesNotThrow(() => {
    ctx2d!.clearRect(0, 0, 320, 240);
    ctx2d!.fillRect(10, 10, 50, 50);
    ctx2d!.beginPath();
    ctx2d!.arc(100, 100, 20, 0, Math.PI * 2);
    ctx2d!.stroke();
    const metrics = ctx2d!.measureText('Redglitch Engine');
    assert.ok(metrics.width > 0, 'measureText width should be positive');
    const imgData = ctx2d!.getImageData(0, 0, 10, 10);
    assert.strictEqual(imgData.data.length, 10 * 10 * 4, 'ImageData should have correct byte length');
  }, '2D canvas operations should not throw');

  // Check WebGL context
  const gl = canvas.getContext('webgl');
  assert.ok(gl, 'WebGL context should be returned');
  assert.doesNotThrow(() => {
    gl!.viewport(0, 0, 320, 240);
    gl!.clearColor(0, 0, 0, 1);
    gl!.clear(16384);
    const shader = gl!.createShader(gl!.VERTEX_SHADER);
    gl!.shaderSource(shader, 'void main(){}');
    gl!.compileShader(shader);
    const compiled = gl!.getShaderParameter(shader, gl!.COMPILE_STATUS);
    assert.strictEqual(compiled, true, 'Shader COMPILE_STATUS should return true');
    const program = gl!.createProgram();
    gl!.attachShader(program, shader);
    gl!.linkProgram(program);
    const linked = gl!.getProgramParameter(program, gl!.LINK_STATUS);
    assert.strictEqual(linked, true, 'Program LINK_STATUS should return true');
  }, 'WebGL operations should not throw');

  // Check canvas toDataURL
  const dataUrl = canvas.toDataURL('image/png');
  assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'toDataURL should return png data url');
  canvas.remove();
});

test('infra: Web Audio and KAE engine stubs initialize without error', () => {
  setupStudioTest();

  assert.ok(window.AudioContext, 'AudioContext should exist on window');
  const actx = new window.AudioContext();
  assert.strictEqual(actx.state, 'running', 'AudioContext should be running');

  const osc = actx.createOscillator();
  const gain = actx.createGain();
  assert.doesNotThrow(() => {
    osc.frequency.setValueAtTime(440, 0);
    gain.gain.setValueAtTime(0.5, 0);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop();
  }, 'Web Audio oscillator graph operations should succeed');

  assert.ok((window as any).KAE, 'window.KAE should be defined');
  assert.strictEqual(typeof (window as any).KAE.playEvent, 'function', 'KAE.playEvent should be a function');
  assert.ok((window as any).KAE.buses.has('master'), 'KAE should have master bus');
});

test('infra: hermetic fetch interceptor intercepts /api/items and records calls', async () => {
  setupStudioTest();

  const res = await fetch('/api/items');
  assert.strictEqual(res.status, 200, 'fetch should return status 200');
  const items = await res.json();
  assert.ok(Array.isArray(items), '/api/items should return array');
  assert.ok(items.length >= 2, '/api/items should contain default items');
  assert.strictEqual(items[0].name, 'Iron Sword', 'first item should be Iron Sword');

  // Verify custom mock override
  let customCalled = false;
  const toolResult = await renderStudioTool(<div data-testid="test-div">Mock Fetch Test</div>);
  toolResult.setFetchMock('GET /api/custom-test', () => {
    customCalled = true;
    return { mocked: true, timestamp: 12345 };
  });

  const customRes = await fetch('/api/custom-test');
  const customData = await customRes.json();
  assert.strictEqual(customCalled, true, 'custom fetch mock handler should be invoked');
  assert.strictEqual(customData.mocked, true, 'custom fetch mock should return custom data');

  // Check call recording
  const calls = toolResult.getFetchCalls('/api/custom-test');
  assert.ok(calls.length >= 1, 'getFetchCalls should record /api/custom-test call');
  assert.strictEqual(calls[0].path, '/api/custom-test');
  toolResult.unmount();
});

test('infra: setFetchMock supports HTTP 500 error simulation via Response and descriptor', async () => {
  setupStudioTest();

  const tool = await renderStudioTool(<div data-testid="error-test">Error Test</div>);

  // 1. Custom mock returning Response with status 500
  tool.setFetchMock('GET /api/test-error-500', () => {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const res1 = await fetch('/api/test-error-500');
  assert.strictEqual(res1.status, 500, 'res1.status should be 500');
  assert.strictEqual(res1.ok, false, 'res1.ok should be false for 500');
  const data1 = await res1.json();
  assert.strictEqual(data1.error, 'Internal Server Error');

  // 2. Custom mock returning object descriptor with status 500
  tool.setFetchMock('GET /api/test-descriptor-500', () => {
    return {
      status: 500,
      body: { error: 'Database Connection Failed' },
    };
  });

  const res2 = await fetch('/api/test-descriptor-500');
  assert.strictEqual(res2.status, 500, 'res2.status should be 500');
  assert.strictEqual(res2.ok, false, 'res2.ok should be false for 500');
  const data2 = await res2.json();
  assert.strictEqual(data2.error, 'Database Connection Failed');

  tool.unmount();
});

test('infra: Monaco mock editor renders and integrates with useMonaco', async () => {
  setupStudioTest();

  let mountedEditor: any = null;
  let mountedMonaco: any = null;

  const Harness = () => {
    const monaco = useMonaco();
    return (
      <div>
        <div data-testid="monaco-ready">{monaco ? 'READY' : 'PENDING'}</div>
        <MockEditor
          defaultValue="const answer = 42;"
          language="javascript"
          onMount={(ed, m) => {
            mountedEditor = ed;
            mountedMonaco = m;
          }}
        />
      </div>
    );
  };

  const { getByTestId, unmount } = await renderStudioTool(<Harness />);
  const statusEl = getByTestId('monaco-ready');
  assert.strictEqual(statusEl.textContent, 'READY', 'useMonaco should return ready mock immediately');

  const textarea = getByTestId('monaco-editor') as HTMLTextAreaElement;
  assert.strictEqual(textarea.value, 'const answer = 42;', 'textarea should contain default value');

  assert.ok(mountedEditor, 'onMount should provide editor instance');
  assert.ok(mountedMonaco, 'onMount should provide monaco instance');
  assert.strictEqual(mountedEditor.getValue(), 'const answer = 42;');

  // Simulate updating content via editor instance
  mountedEditor.setValue('const modified = true;');
  assert.strictEqual(textarea.value, 'const modified = true;', 'textarea should update on setValue');

  unmount();
});

test('infra: mockMonaco getModel().setValue updates synchronously without act() warnings', async () => {
  setupStudioTest();

  let mountedEditor: any = null;

  const Harness = () => {
    return (
      <MockEditor
        defaultValue={"line 1\nline 2\nline 3"}
        language="javascript"
        onMount={(ed) => {
          mountedEditor = ed;
        }}
      />
    );
  };

  const { getByTestId, unmount } = await renderStudioTool(<Harness />);
  const textarea = getByTestId('monaco-editor') as HTMLTextAreaElement;

  assert.ok(mountedEditor, 'editor should be mounted');
  const model = mountedEditor.getModel();
  assert.ok(model, 'model should be available');

  // Verify line count and full model range
  assert.strictEqual(model.getLineCount(), 3, 'initial line count should be 3');
  const range = model.getFullModelRange();
  assert.strictEqual(range.startLineNumber, 1);
  assert.strictEqual(range.startColumn, 1);
  assert.strictEqual(range.endLineNumber, 3);
  assert.strictEqual(range.endColumn, 7); // 'line 3'.length + 1 = 7

  // Verify getPosition
  const pos = mountedEditor.getPosition();
  assert.strictEqual(pos.lineNumber, 1);
  assert.strictEqual(pos.column, 1);

  // Verify synchronous update via getModel().setValue without React 19 act() warning
  model.setValue('updated_from_model_setValue');
  assert.strictEqual(textarea.value, 'updated_from_model_setValue', 'textarea should update immediately on getModel().setValue');
  assert.strictEqual(model.getValue(), 'updated_from_model_setValue');
  assert.strictEqual(model.getLineCount(), 1);

  // Verify executeEdits
  mountedEditor.executeEdits('test-insert', [
    { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: '// Header\n' },
  ]);
  assert.strictEqual(textarea.value, '// Header\nupdated_from_model_setValue');

  unmount();
});

test('infra: renderStudioTool mounts ItemEditor cleanly and loads items', async () => {
  setupStudioTest();

  const { container, getByText, waitFor: wait, unmount } = await renderStudioTool(<ItemEditor />);

  // Wait for ItemEditor to transition from "MOUNTING ITEM REGISTRY..." and load items from /api/items
  await wait(() => {
    return container.textContent?.includes('ITEM STUDIO') && container.textContent?.includes('IRON SWORD');
  }, { timeout: 3000 });

  assert.ok(container.textContent?.includes('ITEM STUDIO'), 'ItemEditor header should display ITEM STUDIO');
  assert.ok(container.textContent?.includes('IRON SWORD'), 'ItemEditor should display loaded Iron Sword');

  // Verify UI interaction works
  const swordEl = getByText(/Iron Sword/i);
  assert.ok(swordEl, 'Iron Sword element should be present in the document');

  unmount();
});
