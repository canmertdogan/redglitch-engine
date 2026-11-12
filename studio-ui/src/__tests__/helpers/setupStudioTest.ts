/**
 * Redglitch Game Studio - studio-ui E2E Test Harness
 * Hermetic JSDOM + React 19 test environment, canvas/webgl stubs,
 * web audio mocks, event bus, and fetch interceptor.
 */

import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import ReactDOMClient from 'react-dom/client';
import { mockMonacoInstance } from './mockMonaco';

// ---------------------------------------------------------------------------
// 1. GLOBAL JSDOM & BROWSER APIS INITIALIZATION
// ---------------------------------------------------------------------------

let dom: JSDOM;
let currentRoot: ReactDOMClient.Root | null = null;
let currentContainer: HTMLElement | null = null;

export interface FetchCallRecord {
  method: string;
  url: string;
  path: string;
  search: string;
  body?: any;
  headers?: Record<string, string>;
}

const recordedFetchCalls: FetchCallRecord[] = [];
const customFetchMocks = new Map<string, (req: { method: string; url: string; path: string; search: string; body?: any }) => any>();

export function setFetchMock(routeKey: string, handler: (req: any) => any) {
  customFetchMocks.set(routeKey, handler);
}

export function clearFetchMocks() {
  customFetchMocks.clear();
}

export function getFetchCalls(filterPattern?: string) {
  if (!filterPattern) return [...recordedFetchCalls];
  return recordedFetchCalls.filter((c) => c.url.includes(filterPattern) || c.path.includes(filterPattern));
}

export function clearFetchCalls() {
  recordedFetchCalls.length = 0;
}

/**
 * Initializes the full browser DOM environment under Node.js.
 * Safe to call in beforeEach or at the top of test files.
 */
export function setupStudioTest() {
  dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
  });

  const { window } = dom;

  // Bind globals
  (globalThis as any).window = window;
  (globalThis as any).document = window.document;
  (globalThis as any).setFetchMock = setFetchMock;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: window.navigator,
      configurable: true,
      writable: true,
    });
  } catch {
    (globalThis as any).navigator = window.navigator;
  }
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).HTMLCanvasElement = window.HTMLCanvasElement;
  (globalThis as any).HTMLInputElement = window.HTMLInputElement;
  (globalThis as any).HTMLTextAreaElement = window.HTMLTextAreaElement;
  (globalThis as any).HTMLSelectElement = window.HTMLSelectElement;
  (globalThis as any).Event = window.Event;
  (globalThis as any).CustomEvent = window.CustomEvent;
  (globalThis as any).MouseEvent = window.MouseEvent;
  (globalThis as any).KeyboardEvent = window.KeyboardEvent;
  (globalThis as any).Node = window.Node;
  (globalThis as any).localStorage = window.localStorage;
  (globalThis as any).sessionStorage = window.sessionStorage;
  (globalThis as any).getComputedStyle = window.getComputedStyle;

  // Enable React 19 act() environment
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  // Animation frame stubs
  window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as any;
  window.cancelAnimationFrame = (id: number) => clearTimeout(id);
  (globalThis as any).requestAnimationFrame = window.requestAnimationFrame;
  (globalThis as any).cancelAnimationFrame = window.cancelAnimationFrame;

  // Observer stubs
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = MockResizeObserver as any;
  window.IntersectionObserver = MockIntersectionObserver as any;
  (globalThis as any).ResizeObserver = MockResizeObserver;
  (globalThis as any).IntersectionObserver = MockIntersectionObserver;

  // URL stubs
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = (_blob: any) => `blob:http://localhost:3000/${Math.random().toString(36).slice(2)}`;
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = () => {};
  }

  // Window dialog & scroll stubs
  window.scrollTo = () => {};
  window.alert = () => {};
  window.confirm = () => true;
  window.prompt = () => null;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};

  // matchMedia stub
  window.matchMedia = window.matchMedia || function (query: string) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  };

  // Canvas getBoundingClientRect stub (non-zero width/height prevents division-by-zero crashes)
  window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    const w = this.width || 300;
    const h = this.height || 150;
    return {
      top: 0,
      left: 0,
      right: w,
      bottom: h,
      width: w,
      height: h,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };

  // Canvas 2D & WebGL stubs
  setupCanvasStubs(window);

  // Web Audio & KAE stubs
  setupAudioStubs(window);

  // Script injection hook & preloads
  setupScriptPreloads(window);

  // Redglitch EventBus & Project State stubs
  setupEventBusAndState(window);

  // Monaco global stub
  (window as any).monaco = mockMonacoInstance;
  (globalThis as any).monaco = mockMonacoInstance;

  // Hermetic fetch router
  setupFetchInterceptor(window);

  recordedFetchCalls.length = 0;
  customFetchMocks.clear();
}

// ---------------------------------------------------------------------------
// 2. CANVAS 2D & WEBGL CONTEXT STUBS
// ---------------------------------------------------------------------------

function setupCanvasStubs(window: any) {
  const canvas2DStub = {
    canvas: null as any,
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: (text: string) => ({ width: (text || '').length * 8 }),
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    arcTo: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    rect: () => {},
    fill: () => {},
    stroke: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    rotate: () => {},
    translate: () => {},
    transform: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    drawImage: () => {},
    createImageData: (w: number, h: number) => ({
      width: Math.max(0, Math.abs(w)),
      height: Math.max(0, Math.abs(h)),
      data: new Uint8ClampedArray(Math.max(0, Math.abs(w)) * Math.max(0, Math.abs(h)) * 4),
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      width: Math.max(0, Math.abs(w)),
      height: Math.max(0, Math.abs(h)),
      data: new Uint8ClampedArray(Math.max(0, Math.abs(w)) * Math.max(0, Math.abs(h)) * 4),
    }),
    putImageData: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({ setTransform: () => {} }),
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
  };

  const webglStub = {
    canvas: null as any,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,
    FLOAT: 5126,
    UNSIGNED_BYTE: 5121,
    DEPTH_TEST: 2929,
    TEXTURE_2D: 3553,
    RGBA: 6408,
    TEXTURE0: 33984,
    COLOR_ATTACHMENT0: 36064,
    FRAMEBUFFER: 36160,
    viewport: () => {},
    clearColor: () => {},
    clear: () => {},
    enable: () => {},
    disable: () => {},
    createShader: (type: number) => ({ type, id: Math.random() }),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: (_shader: any, _pname: number) => true,
    getShaderInfoLog: () => '',
    deleteShader: () => {},
    createProgram: () => ({ id: Math.random() }),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: (_prog: any, _pname: number) => true,
    getProgramInfoLog: () => '',
    useProgram: () => {},
    deleteProgram: () => {},
    createBuffer: () => ({ id: Math.random() }),
    bindBuffer: () => {},
    bufferData: () => {},
    deleteBuffer: () => {},
    createTexture: () => ({ id: Math.random() }),
    bindTexture: () => {},
    texParameteri: () => {},
    texImage2D: () => {},
    generateMipmap: () => {},
    activeTexture: () => {},
    deleteTexture: () => {},
    createFramebuffer: () => ({ id: Math.random() }),
    bindFramebuffer: () => {},
    framebufferTexture2D: () => {},
    deleteFramebuffer: () => {},
    getAttribLocation: () => 0,
    enableVertexAttribArray: () => {},
    disableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    getUniformLocation: (_prog: any, name: string) => ({ name, id: Math.random() }),
    uniform1f: () => {},
    uniform2f: () => {},
    uniform3f: () => {},
    uniform4f: () => {},
    uniform1i: () => {},
    uniform2i: () => {},
    uniformMatrix4fv: () => {},
    drawArrays: () => {},
    drawElements: () => {},
    getExtension: (_name?: string) => ({
      loseContext: () => {},
      restoreContext: () => {},
    }),
  };

  window.HTMLCanvasElement.prototype.getContext = function (type: string) {
    if (type === '2d') {
      canvas2DStub.canvas = this;
      return canvas2DStub;
    }
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      webglStub.canvas = this;
      return webglStub;
    }
    return null;
  };

  window.HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  };

  window.HTMLCanvasElement.prototype.toBlob = function (cb: (blob: Blob | null) => void) {
    cb(new window.Blob([], { type: 'image/png' }));
  };
}

// ---------------------------------------------------------------------------
// 3. WEB AUDIO & KAE STUBS
// ---------------------------------------------------------------------------

function setupAudioStubs(window: any) {
  class MockAudioParam {
    value = 1;
    setValueAtTime(v: number) { this.value = v; return this; }
    linearRampToValueAtTime(v: number) { this.value = v; return this; }
    exponentialRampToValueAtTime(v: number) { this.value = v; return this; }
    setTargetAtTime(v: number) { this.value = v; return this; }
  }

  class MockAudioNode {
    connect(dest: any) { return dest; }
    disconnect() {}
  }

  class MockGainNode extends MockAudioNode {
    gain = new MockAudioParam();
  }

  class MockOscillatorNode extends MockAudioNode {
    type = 'sine';
    frequency = new MockAudioParam();
    detune = new MockAudioParam();
    onended: any = null;
    start() {}
    stop() {
      if (typeof this.onended === 'function') {
        queueMicrotask(() => this.onended(new window.Event('ended')));
      }
    }
  }

  class MockBiquadFilterNode extends MockAudioNode {
    type = 'lowpass';
    frequency = new MockAudioParam();
    Q = new MockAudioParam();
    gain = new MockAudioParam();
  }

  class MockAnalyserNode extends MockAudioNode {
    fftSize = 2048;
    frequencyBinCount = 1024;
    getByteFrequencyData(arr: Uint8Array) { arr.fill(50); }
    getByteTimeDomainData(arr: Uint8Array) { arr.fill(128); }
  }

  class MockAudioContext {
    state = 'running';
    currentTime = 0;
    sampleRate = 44100;
    destination = new MockAudioNode();
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    createGain() { return new MockGainNode(); }
    createOscillator() { return new MockOscillatorNode(); }
    createBiquadFilter() { return new MockBiquadFilterNode(); }
    createBufferSource() {
      return {
        ...new MockAudioNode(),
        buffer: null,
        loop: false,
        playbackRate: new MockAudioParam(),
        start: () => {},
        stop: () => {},
      };
    }
    createAnalyser() { return new MockAnalyserNode(); }
  }

  window.AudioContext = MockAudioContext;
  window.webkitAudioContext = MockAudioContext;
  (globalThis as any).AudioContext = MockAudioContext;

  // window.KAE (Ketebe Audio Engine) mock
  window.KAE = {
    ctx: new MockAudioContext(),
    loadMap: () => {},
    setGameState: () => {},
    setEnvironment: () => {},
    getBusLevel: () => 0.5,
    stopEvent: () => {},
    stopAll: () => {},
    init: async () => {},
    playEvent: async () => ({ stop: () => {} }),
    buses: new Map([
      ['master', new MockGainNode()],
      ['sfx', new MockGainNode()],
      ['music', new MockGainNode()],
    ]),
  };
}

// ---------------------------------------------------------------------------
// 4. SCRIPT PRELOADS & APPEND HOOK
// ---------------------------------------------------------------------------

function setupScriptPreloads(window: any) {
  const preloadedScripts = [
    '/shared/EventBus.js',
    '/shared/SharedProjectState.js',
    '/shared/AssetManager.js',
    '/base_game/sprites.js',
    '/ai/studio-bridge.js',
    '/shared/SoundManager.js',
  ];

  for (const src of preloadedScripts) {
    const s = window.document.createElement('script');
    s.src = src;
    s.dataset.loaded = 'true';
    window.document.head.appendChild(s);
  }

  // Hook appendChild so any dynamically added scripts resolve onload immediately
  const origAppendChild = window.Node.prototype.appendChild;
  window.Node.prototype.appendChild = function (child: any) {
    const result = origAppendChild.call(this, child);
    if (child && child.tagName === 'SCRIPT') {
      child.dataset.loaded = 'true';
      queueMicrotask(() => {
        if (typeof child.onload === 'function') {
          child.onload(new window.Event('load'));
        }
        child.dispatchEvent(new window.Event('load'));
      });
    }
    return result;
  };
}

// ---------------------------------------------------------------------------
// 5. EVENTBUS & SHARED STATE STUBS
// ---------------------------------------------------------------------------

export class MockEventBus {
  listeners = new Map<string, Set<(e: any) => void>>();
  emitted: Array<{ type: string; data: any; timestamp: number }> = [];

  on(type: string, cb: (e: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
    return cb;
  }

  off(type: string, cb: (e: any) => void) {
    this.listeners.get(type)?.delete(cb);
  }

  emit(type: string, data: any = {}) {
    const event = { type, data, timestamp: Date.now() };
    this.emitted.push(event);
    const cbs = this.listeners.get(type);
    if (cbs) {
      cbs.forEach((cb) => {
        try { cb(event); } catch (e) { console.error(e); }
      });
    }
  }

  clear() {
    this.listeners.clear();
    this.emitted = [];
  }
}

function setupEventBusAndState(window: any) {
  const eb = new MockEventBus();
  window.RedglitchEventBus = eb;
  (globalThis as any).RedglitchEventBus = eb;

  window.RedglitchProjectState = {
    projectName: 'Default Project',
    get: (_key: string) => undefined,
    set: (_key: string, _val: any) => {},
    subscribe: () => () => {},
  };

  window.RedglitchAssetManager = {
    getAssets: () => [],
    refresh: async () => {},
  };

  window.SPRITES = {};
}

// ---------------------------------------------------------------------------
// 6. HERMETIC FETCH INTERCEPTOR & DEFAULT REST RESPONSES
// ---------------------------------------------------------------------------

const DEFAULT_ROUTES: Record<string, any> = {
  // Items
  'GET /api/items': [
    { id: 'item_1', name: 'Iron Sword', category: 'WEAPON', rarity: 'COMMON', stats: { atk: 10 }, description: 'A sturdy sword.' },
    { id: 'item_2', name: 'Health Potion', category: 'CONSUMABLE', rarity: 'COMMON', stats: { hp: 50 }, description: 'Restores 50 HP.' }
  ],
  'GET /api/templates/item': { base: { name: 'New Item', category: 'MISC', rarity: 'COMMON', value: 1, maxStack: 99, stats: {}, flags: {} } },
  'POST /api/items': { success: true, count: 1 },

  // NPCs
  'GET /api/npcs': [
    { id: 'npc_1', name: 'Town Guard', sprite: 'guard_idle', role: 'guard', dialogueId: 'dlg_1', questId: 'quest_1', stats: { hp: 100 } }
  ],
  'GET /api/templates/npc': { base: { name: 'New NPC', sprite: 'villager', role: 'civilian', stats: { hp: 100 } } },
  'POST /api/npcs': { success: true, count: 1 },
  'GET /api/brains/list': ['patrol.json', 'guard.json', 'chase.json'],

  // Enemies
  'GET /api/enemies': [
    { id: 'enemy_1', name: 'Goblin Scout', stats: { hp: 50, atk: 5 }, brain: 'patrol.json', drops: [] }
  ],
  'GET /api/templates/enemy': { base: { name: 'New Enemy', stats: { hp: 50, atk: 5, def: 2 }, drops: [] } },
  'POST /api/enemies': { success: true, count: 1 },

  // Quests
  'GET /api/quests': [
    { id: 'quest_1', name: 'First Steps', description: 'Begin your journey', stages: [{ id: 's1', description: 'Talk to guard', objectives: [] }], rewards: { exp: 100, gold: 50 } }
  ],
  'POST /api/quests': { success: true, count: 1 },

  // Dialogues
  'GET /api/dialogues': {
    characters: [{ id: 'npc_1', name: 'Town Guard' }],
    conversations: [{ id: 'dlg_1', title: 'Guard Greeting', nodes: [{ id: 'n1', text: 'Halt, who goes there?', choices: [] }] }]
  },
  'POST /api/dialogues': { success: true },

  // Assets
  'GET /api/assets': {
    assets: [{ id: 'a1', name: 'sword.png', type: 'image', path: 'assets/sword.png', metadata: { source: 'local' } }],
    updated: '2026-11-12T00:00:00Z',
    project: 'Default Project'
  },
  'POST /api/assets/rebuild': { success: true },
  'POST /api/assets/import': { success: true, path: 'assets/imported.png' },
  'POST /api/assets/upload': { success: true, path: 'assets/uploaded.png' },

  // Audio Map
  'GET /api/audio/map': {
    events: { 'player:jump': { group: 'sfx', playback: { volume: 0.8 } } },
    buses: { master: { volume: 1, pan: 0 }, sfx: { volume: 0.8, pan: 0 }, music: { volume: 0.7, pan: 0 } }
  },
  'GET /api/audio/assets': ['jump.wav', 'hit.wav', 'theme.mp3'],
  'GET /api/audio/discover-events': ['player:jump', 'enemy:hit'],
  'POST /api/audio/map': { success: true },

  // FX Editor
  'GET /api/fx/list': ['fireball', 'sparkle'],
  'POST /api/fx/save': { success: true },

  // Shader Editor
  'GET /api/shaders/list': ['toon_outline', 'water_surface'],
  'POST /api/shaders/save': { success: true },

  // Algorithm / Logic Editor
  'GET /api/logic/list': ['player_controller.algorithm'],
  'POST /api/logic/save': { success: true, compiled: true, events: [] },

  // Cutscenes
  'GET /api/cutscenes/list': [{ id: 'intro_cutscene', name: 'Intro Cutscene' }],
  'POST /api/cutscenes/intro_cutscene': { success: true },

  // Projects & System
  'GET /api/projects': [{ name: 'Default Project', currentProject: 'Default Project', isRoot: false }],
  'GET /api/projects/current': { name: 'Default Project', currentProject: 'Default Project', isRoot: false },
  'POST /api/projects/create': { success: true, project: 'New Project' },
  'POST /api/projects/switch': { success: true, project: 'Default Project' },
  'POST /api/projects/reveal': { success: true },
  'GET /api/system/stats': { cpu: 12, memory: 256, os: 'mac', uptime: 3600 },
  'POST /api/build': { success: true, message: 'Build succeeded' },

  // IDE & File Service
  'GET /api/ide/tree': [
    { name: 'scripts', path: 'scripts', type: 'dir', children: [{ name: 'main.js', path: 'scripts/main.js', type: 'file' }] }
  ],
  'GET /api/ide/read': { success: true, content: '// sample script code\nconsole.log("Ready");' },
  'POST /api/ide/write': { success: true },
  'POST /api/ide/delete': { success: true },
  'GET /api/ide/search': [],
  'POST /api/ide/terminal': { success: true, output: 'Command executed.', stdout: 'Command executed.' },
  'GET /api/ide/list': [{ name: 'player.json', isDirectory: false }, { name: 'definitions', isDirectory: true }],

  // Prefabs
  'GET /api/prefabs': [{ id: 'player', name: 'Player Prefab', components: {} }],
  'POST /api/prefabs': { success: true },

  // UI Designer
  'GET /api/ui-config': {
    screens: {
      main_hud: { elements: [] },
    },
    resolution: { w: 1280, h: 720, width: 1280, height: 720 },
    fileName: 'main.redui',
  },
  'POST /api/ui-config': { success: true },
};

function setupFetchInterceptor(window: any) {
  const fetchHandler = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url;
    const urlObj = new URL(rawUrl, 'http://localhost:3000');
    const method = (init.method || 'GET').toUpperCase();
    const path = urlObj.pathname;
    const search = urlObj.search;

    let parsedBody: any = undefined;
    if (init.body) {
      try {
        parsedBody = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      } catch {
        parsedBody = init.body;
      }
    }

    recordedFetchCalls.push({
      method,
      url: rawUrl,
      path,
      search,
      body: parsedBody,
      headers: init.headers as Record<string, string>,
    });

    const routeKey = `${method} ${path}`;

    // 1. Check custom overrides
    if (customFetchMocks.has(routeKey)) {
      const handler = customFetchMocks.get(routeKey)!;
      const res = await handler({ method, url: rawUrl, path, search, body: parsedBody });

      // 1a. Return Response directly if instance of Response or duck-typed Response
      const isResponse =
        (typeof Response !== 'undefined' && res instanceof Response) ||
        ((dom.window as any).Response && res instanceof (dom.window as any).Response) ||
        (Boolean(res) &&
          typeof res === 'object' &&
          typeof (res as any).clone === 'function' &&
          typeof (res as any).json === 'function' &&
          typeof (res as any).status === 'number');

      if (isResponse) {
        return res as Response;
      }

      // 1b. Object with { status: number, body?: any, headers?: any }
      if (
        res &&
        typeof res === 'object' &&
        typeof (res as any).status === 'number' &&
        ('body' in res || 'headers' in res || Object.keys(res).length === 1)
      ) {
        const status = (res as any).status;
        const bodyVal = (res as any).body;
        const customHeaders = (res as any).headers;

        let responseBody: any;
        const defaultHeaders: Record<string, string> = {};

        if (bodyVal === undefined || bodyVal === null) {
          responseBody = (status === 204 || status === 205 || status === 304) ? null : '';
        } else if (typeof bodyVal === 'string') {
          responseBody = bodyVal;
          defaultHeaders['Content-Type'] = 'text/plain';
        } else {
          responseBody = JSON.stringify(bodyVal);
          defaultHeaders['Content-Type'] = 'application/json';
        }

        return new Response(responseBody, {
          status,
          headers: customHeaders || defaultHeaders,
        });
      }

      // 1c. String response
      if (typeof res === 'string') {
        return new Response(res, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // 1d. Plain data object or array
      return new Response(JSON.stringify(res), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Specialized endpoint logic
    if (path === '/api/ide/list') {
      const dir = urlObj.searchParams.get('dir') || '';
      if (dir.includes('definitions')) {
        return new Response(JSON.stringify([{ name: 'player.json', isDirectory: false }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (dir.includes('Pixel_Mart')) {
        return new Response(JSON.stringify([{ name: 'sword.png', isDirectory: false }, { name: 'potion.png', isDirectory: false }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify([{ name: 'main.js', isDirectory: false }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/api/ide/read') {
      const file = urlObj.searchParams.get('file') || '';
      if (file.endsWith('.json') || file.includes('definitions')) {
        const prefabJson = JSON.stringify({
          id: 'player',
          name: 'Player Prefab',
          components: [
            { id: 'c1', type: 'Transform', properties: { x: 0, y: 0, scale: 1 } },
          ],
        });
        return new Response(prefabJson, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('// sample script code\nconsole.log("Ready");', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // 3. Check default routes table
    if (routeKey in DEFAULT_ROUTES) {
      return new Response(JSON.stringify(DEFAULT_ROUTES[routeKey]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Fallback pattern matching
    if (path.startsWith('/api/logic/') && method === 'GET') {
      return new Response(JSON.stringify({ name: 'player_controller', nodes: [], connections: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path.startsWith('/api/cutscenes/') && method === 'GET') {
      return new Response(JSON.stringify({ id: 'intro', name: 'Intro', duration: 10, tracks: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path.startsWith('/api/shaders/') && method === 'GET') {
      return new Response(JSON.stringify({ name: 'default', vertex: 'void main(){}', fragment: 'void main(){}' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path.startsWith('/api/fx/') && method === 'GET') {
      return new Response(JSON.stringify({ id: 'fireball', name: 'fireball', mode: 'burst', count: 20, color: { start: '#f00', end: '#ff0' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (path.startsWith('/api/projects/') && method === 'DELETE') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (method === 'DELETE') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Default safe fallback
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  (globalThis as any).fetch = fetchHandler;
  window.fetch = fetchHandler;
}

// ---------------------------------------------------------------------------
// 7. USER EVENT HELPERS (SYNTHETIC EVENTS FOR REACT 19)
// ---------------------------------------------------------------------------

export const fireEvent = {
  click: (el: Element, init: MouseEventInit = {}) => {
    act(() => {
      el.dispatchEvent(new (globalThis as any).MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    });
  },
  change: (el: HTMLElement, init: { target: { value?: any; [k: string]: any } }) => {
    act(() => {
      const val = init.target.value;
      if (el instanceof (globalThis as any).HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor((globalThis as any).HTMLInputElement.prototype, 'value')?.set;
        setter?.call(el, val);
      } else if (el instanceof (globalThis as any).HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor((globalThis as any).HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(el, val);
      } else if (el instanceof (globalThis as any).HTMLSelectElement) {
        const setter = Object.getOwnPropertyDescriptor((globalThis as any).HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(el, val);
      } else {
        (el as any).value = val;
      }
      el.dispatchEvent(new (globalThis as any).Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new (globalThis as any).Event('change', { bubbles: true, cancelable: true }));
    });
  },
  input: (el: Element, init: EventInit = {}) => {
    act(() => {
      el.dispatchEvent(new (globalThis as any).Event('input', { bubbles: true, cancelable: true, ...init }));
    });
  },
  keyDown: (el: Element, init: KeyboardEventInit = {}) => {
    act(() => {
      el.dispatchEvent(new (globalThis as any).KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    });
  },
  keyUp: (el: Element, init: KeyboardEventInit = {}) => {
    act(() => {
      el.dispatchEvent(new (globalThis as any).KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...init }));
    });
  },
  mouseDown: (el: Element, init: MouseEventInit = {}) => {
    act(() => {
      el.dispatchEvent(new (globalThis as any).MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init }));
    });
  },
  mouseMove: (el: Element, init: MouseEventInit = {}) => {
    act(() => {
      el.dispatchEvent(new (globalThis as any).MouseEvent('mousemove', { bubbles: true, cancelable: true, ...init }));
    });
  },
  mouseUp: (el: Element, init: MouseEventInit = {}) => {
    act(() => {
      el.dispatchEvent(new (globalThis as any).MouseEvent('mouseup', { bubbles: true, cancelable: true, ...init }));
    });
  },
  submit: (el: Element, init: EventInit = {}) => {
    act(() => {
      el.dispatchEvent(new (globalThis as any).Event('submit', { bubbles: true, cancelable: true, ...init }));
    });
  },
};

// ---------------------------------------------------------------------------
// 8. ASYNC WAIT HELPER (REACT 19 FLUSH)
// ---------------------------------------------------------------------------

export async function waitFor(
  callback: () => boolean | void | Promise<boolean | void>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 2000, interval = 20 } = options;
  const startTime = Date.now();
  let lastError: any = null;

  while (Date.now() - startTime < timeout) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, interval));
    });

    try {
      const res = await callback();
      if (res !== false) return;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

// ---------------------------------------------------------------------------
// 9. RENDER STUDIO TOOL HELPER
// ---------------------------------------------------------------------------

export interface RenderStudioToolResult {
  container: HTMLElement;
  unmount: () => void;
  rerender: (el: React.ReactElement) => Promise<void>;
  getByText: (matcher: string | RegExp) => HTMLElement;
  queryByText: (matcher: string | RegExp) => HTMLElement | null;
  getByRole: (role: string, options?: { name?: string | RegExp }) => HTMLElement;
  getByTestId: (testId: string) => HTMLElement;
  queryByTestId: (testId: string) => HTMLElement | null;
  getByPlaceholderText: (matcher: string | RegExp) => HTMLElement;
  waitFor: typeof waitFor;
  fireEvent: typeof fireEvent;
  getFetchCalls: (filterPattern?: string) => FetchCallRecord[];
  clearFetchCalls: () => void;
  setFetchMock: (routeKey: string, handler: (req: any) => any) => void;
  getEmittedEvents: () => Array<{ type: string; data: any; timestamp: number }>;
  emitStudioEvent: (type: string, data?: any) => void;
  emitEvent: (type: string, data?: any) => void;
}

export async function renderStudioTool(
  element: React.ReactElement,
  options: { container?: HTMLElement } = {}
): Promise<RenderStudioToolResult> {
  if (!dom) {
    setupStudioTest();
  }

  // Cleanup any previous root and container
  if (currentRoot) {
    await act(async () => {
      currentRoot?.unmount();
    });
    currentRoot = null;
  }
  if (currentContainer && currentContainer.parentElement) {
    currentContainer.parentElement.removeChild(currentContainer);
    currentContainer = null;
  }

  const container = options.container || dom.window.document.createElement('div');
  if (!options.container) {
    dom.window.document.body.appendChild(container);
  }
  currentContainer = container;

  const root = ReactDOMClient.createRoot(container);
  currentRoot = root;

  await act(async () => {
    root.render(element);
  });

  // Flush initial microtasks & effects
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

  const getByText = (matcher: string | RegExp): HTMLElement => {
    const el = queryByText(matcher);
    if (!el) throw new Error(`Unable to find element with text matching: ${matcher}\nContainer HTML:\n${container.innerHTML.slice(0, 500)}`);
    return el;
  };

  const queryByText = (matcher: string | RegExp): HTMLElement | null => {
    const walker = dom.window.document.createTreeWalker(container, dom.window.NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode as HTMLElement;
    while (node) {
      const text = node.textContent || '';
      const matches = typeof matcher === 'string' ? text.includes(matcher) : matcher.test(text);
      if (matches) {
        // Return leaf node matching if possible
        const children = Array.from(node.children) as HTMLElement[];
        const childMatch = children.find((c) => (typeof matcher === 'string' ? (c.textContent || '').includes(matcher) : matcher.test(c.textContent || '')));
        if (!childMatch) return node;
      }
      node = walker.nextNode() as HTMLElement;
    }
    return null;
  };

  const getByRole = (role: string, opts?: { name?: string | RegExp }): HTMLElement => {
    const selector = role === 'button' ? 'button, [role="button"]' : `[role="${role}"]`;
    const elements = Array.from(container.querySelectorAll(selector)) as HTMLElement[];
    if (opts?.name) {
      const found = elements.find((el) => {
        const text = el.textContent || el.getAttribute('aria-label') || '';
        return typeof opts.name === 'string' ? text.includes(opts.name) : opts.name!.test(text);
      });
      if (found) return found;
    } else if (elements.length > 0) {
      return elements[0];
    }
    throw new Error(`Unable to find element with role "${role}"${opts?.name ? ` and name "${opts.name}"` : ''}`);
  };

  const getByTestId = (testId: string): HTMLElement => {
    const el = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
    if (!el) throw new Error(`Unable to find element with data-testid: "${testId}"`);
    return el;
  };

  const queryByTestId = (testId: string): HTMLElement | null => {
    return container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  };

  const getByPlaceholderText = (matcher: string | RegExp): HTMLElement => {
    const inputs = Array.from(container.querySelectorAll('input, textarea')) as HTMLElement[];
    const found = inputs.find((el) => {
      const p = el.getAttribute('placeholder') || '';
      return typeof matcher === 'string' ? p.includes(matcher) : matcher.test(p);
    });
    if (!found) throw new Error(`Unable to find input with placeholder matching: ${matcher}`);
    return found;
  };

  const getFetchCalls = (filterPattern?: string) => {
    if (!filterPattern) return [...recordedFetchCalls];
    return recordedFetchCalls.filter((c) => c.url.includes(filterPattern) || c.path.includes(filterPattern));
  };

  const clearFetchCalls = () => {
    recordedFetchCalls.length = 0;
  };

  const setFetchMock = (routeKey: string, handler: (req: any) => any) => {
    customFetchMocks.set(routeKey, handler);
  };

  const getEmittedEvents = () => {
    return [...((dom.window as any).RedglitchEventBus?.emitted || [])];
  };

  const emitStudioEvent = (type: string, data?: any) => {
    (dom.window as any).RedglitchEventBus?.emit(type, data);
  };

  const unmount = () => {
    if (currentRoot) {
      act(() => {
        currentRoot?.unmount();
      });
      currentRoot = null;
    }
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
    if (currentContainer === container) {
      currentContainer = null;
    }
  };

  const rerender = async (el: React.ReactElement) => {
    await act(async () => {
      root.render(el);
    });
  };

  return {
    container,
    unmount,
    rerender,
    getByText,
    queryByText,
    getByRole,
    getByTestId,
    queryByTestId,
    getByPlaceholderText,
    waitFor,
    fireEvent,
    getFetchCalls,
    clearFetchCalls,
    setFetchMock,
    getEmittedEvents,
    emitStudioEvent,
    emitEvent: emitStudioEvent,
  };
}
