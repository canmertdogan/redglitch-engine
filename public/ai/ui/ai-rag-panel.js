/**
 * public/ai/ui/ai-rag-panel.js
 * RAG AI Panel Controller
 *
 * Dedicated RAG (Retrieval-Augmented Generation) panel, completely separate
 * from the Kai assistant panel. Provides a lightweight search interface over
 * the RAG corpus. Works in both Easy AI and Full AI modes.
 */

import { RAGEngine } from '../rag-engine.js';
import { AI_CONFIG } from '../config.js';
import { EventBus } from '../shim.js';
import { getAIMode, isEasyAIMode, isFullAIMode, isAIEnabled } from '../ai-mode.mjs';

export class RAGPanel {
    constructor() {
        this.ragEngine = null;
        this.isInitialized = false;
        this.isOpen = false;
        this.isRagReady = false;
        this.chunkCount = 0;
        this.currentFilter = '';
        this.results = [];

        // DOM refs (set in init)
        this.el = {
            btn: null,
            panel: null,
            input: null,
            searchBtn: null,
            results: null,
            loading: null,
            statusDot: null,
            statusText: null,
            statusMode: null,
            statusChunks: null,
            empty: null,
            filters: null,
        };

        this.init();
    }

    async init() {
        try {
            this._bindDOM();

            // Toggle button click
            this.el.btn.addEventListener('click', () => this.toggle());

            // Search input: Enter to search, auto-resize
            this.el.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.search();
                }
            });

            // Filter buttons
            document.querySelectorAll('.rag-filter-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.rag-filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.currentFilter = btn.dataset.filter || '';
                    this.renderResults(this.results);
                });
            });

            // Hit-zone broadcasting to parent (so clicks pass through when closed)
            this._startHitZoneBroadcast();

            // Expose globally for parent bridge
            window.RAGPanel = this;

            // Initialize RAG engine only if AI mode is enabled
            if (isAIEnabled()) {
                await this._initRAG();
            } else {
                this._setStatus('off', 'RAG: DISABLED', 0);
                this.el.statusDot.classList.remove('ready');
                this.el.statusDot.classList.add('off');
            }

            this.isInitialized = true;
            console.log('[RAGPanel] Initialized.', { mode: getAIMode() });
        } catch (err) {
            console.error('[RAGPanel] Init error:', err);
        }
    }

    _bindDOM() {
        this.el.btn = document.getElementById('rag-btn');
        this.el.panel = document.getElementById('rag-search-panel');
        this.el.input = document.getElementById('rag-search-input');
        this.el.searchBtn = document.getElementById('rag-search-btn');
        this.el.results = document.getElementById('rag-results');
        this.el.loading = document.getElementById('rag-loading');
        this.el.empty = this.el.results; // results container doubles as empty state host
        this.el.statusDot = document.getElementById('rag-status-dot');
        this.el.statusText = document.getElementById('rag-status-text');
        this.el.statusMode = document.getElementById('rag-status-mode');
        this.el.statusChunks = document.getElementById('rag-status-chunks');

        // Update mode badge
        const mode = getAIMode();
        if (this.el.statusMode) {
            this.el.statusMode.textContent = `MODE: ${mode === 'easy' ? 'EASY' : mode === true ? 'FULL' : 'OFF'}`;
        }
    }

    async _initRAG() {
        this._setStatus('connecting', 'RAG: YÜKLENIYOR...', 0);
        this.el.btn.classList.remove('off');

        this.ragEngine = new RAGEngine();
        await this.ragEngine.initialize();

        this.isRagReady = this.ragEngine.isLoaded;
        this.chunkCount = this.ragEngine.vectorStore ? this.ragEngine.vectorStore.size || 0 : 0;

        this._setStatus(this.isRagReady ? 'ready' : 'off',
            this.isRagReady ? 'RAG: HAZIR' : 'RAG: HATA',
            this.chunkCount);

        if (this.isRagReady) {
            this.el.btn.classList.remove('off');
            EventBus.emit('ai:rag:panel:ready', { chunkCount: this.chunkCount });
        } else {
            this.el.btn.classList.add('off');
        }
    }

    _setStatus(state, text, chunks) {
        if (!this.el.statusDot || !this.el.statusText || !this.el.statusChunks) return;
        this.el.statusDot.classList.remove('ready', 'off');
        if (state === 'ready') {
            this.el.statusDot.classList.add('ready');
        } else if (state === 'off') {
            this.el.statusDot.classList.add('off');
        }
        this.el.statusText.textContent = text;
        this.el.statusChunks.textContent = `CHUNKS: ${chunks}`;
    }

    /* ---- Public API ------------------------------------------------------- */

    toggle() {
        if (!this.isInitialized) return;
        if (this.isOpen) this.close();
        else this.open();
    }

    open() {
        if (!this.isRagReady && !isAIEnabled()) {
            this._showNotAvailable();
            return;
        }
        this.isOpen = true;
        this.el.panel.classList.add('show');
        this.el.input.focus();
        this.el.btn.classList.add('active');
    }

    close() {
        this.isOpen = false;
        this.el.panel.classList.remove('show');
        this.el.btn.classList.remove('active');
    }

    async search() {
        if (!this.ragEngine || !this.isRagReady) {
            this._appendResult({ text: 'RAG motoru henüz hazır değil. Lütfen AI modunu etkinleştirin.', cite: 'SYSTEM' });
            return;
        }

        const query = this.el.input.value.trim();
        if (!query) return;

        this._showLoading(true);
        this.el.results.innerHTML = '';

        try {
            const context = await this.ragEngine.retrieveContext(query, {
                limit: AI_CONFIG.limits?.maxRAGChunks || 5,
                useMultiQuery: false,
                useHyDE: false,
                filters: this.currentFilter ? { source: this.currentFilter } : {},
            });

            // Parse the formatted context back into readable result blocks
            this._displaySearchResults(query, context);
        } catch (err) {
            console.error('[RAGPanel] Search error:', err);
            this._appendResult({ text: `Arama hatası: ${err.message}`, cite: 'SYSTEM' });
        } finally {
            this._showLoading(false);
        }
    }

    _displaySearchResults(query, context) {
        // RAGEngine.retrieveContext returns a formatted string with citations.
        // Split into chunks for display.
        const blocks = context.split(/\n(?=\[\d+\] \()/);
        let anyResults = false;

        blocks.forEach((block, i) => {
            const trimmed = block.trim();
            if (!trimmed) return;
            anyResults = true;

            // Extract citation like [1] (path)
            const citeMatch = trimmed.match(/^\[(\d+)\] \((.*?)\)/);
            const cite = citeMatch ? citeMatch[2] : 'unknown';
            const text = citeMatch ? trimmed.replace(/^\[\d+\] \(.*?\)\n?/, '') : trimmed;

            this._appendResult({
                text: text,
                cite: cite,
                rank: i + 1,
            });
        });

        if (!anyResults) {
            this._appendResult({ text: `Sorgu için eşleşen RAG parçası bulunamadı: "${query}"`, cite: 'SYSTEM' });
        }

        // Broadcast results to parent window (studio can pick them up)
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'rag:search:results',
                query,
                results: this.results,
            }, '*');
        }
    }

    _appendResult({ text, cite, rank }) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'rag-result';

        const avatar = document.createElement('div');
        avatar.className = 'rag-result-avatar';
        avatar.textContent = rank || '?';

        const content = document.createElement('div');
        content.className = 'rag-result-content';

        const nameBar = document.createElement('div');
        nameBar.className = 'rag-result-name';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = 'RAG';
        const timeSpan = document.createElement('span');
        timeSpan.className = 'rag-result-time';
        timeSpan.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
        nameBar.appendChild(nameSpan);
        nameBar.appendChild(timeSpan);

        const bubble = document.createElement('div');
        bubble.className = 'rag-result-bubble';
        bubble.textContent = text;

        const citeEl = document.createElement('span');
        citeEl.className = 'rag-cite';
        citeEl.textContent = `[${cite}]`;

        content.appendChild(nameBar);
        content.appendChild(bubble);
        content.appendChild(citeEl);

        resultDiv.appendChild(avatar);
        resultDiv.appendChild(content);

        this.el.results.appendChild(resultDiv);
        this.el.results.scrollTop = this.el.results.scrollHeight;

        this.results.push({ text, cite, rank, timestamp: Date.now() });
        if (this.results.length > 50) this.results.shift();
    }

    clearResults() {
        this.el.results.innerHTML = '';
        this.results = [];
        // Re-show empty watermark is handled by CSS ::before
    }

    _showLoading(show) {
        if (this.el.loading) this.el.loading.style.display = show ? 'block' : 'none';
    }

    _showNotAvailable() {
        this._appendResult({
            text: 'RAG AI Panel şu anda kullanılamıyor. AI modunu (Easy veya Full) etkinleştirin.',
            cite: 'SYSTEM',
        });
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }

    toggleSettings() {
        // Placeholder for future settings (chunk size, top-K, etc.)
        console.log('[RAGPanel] Settings toggle (not yet implemented)');
    }

    /* ---- Hit-zone broadcast (pointer-event passthrough) ----------------- */

    _startHitZoneBroadcast() {
        this._hitZoneIntervalId = setInterval(() => {
            const zones = [];
            const ids = ['rag-container', 'rag-search-panel', 'rag-btn'];
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (el && el.style.display !== 'none') {
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                        const rect = el.getBoundingClientRect();
                        zones.push({ top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right });
                    }
                }
            });
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'rag:hitzones', zones }, '*');
            }
        }, 100);

        window.addEventListener('mousemove', (e) => {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'rag:mousemove', clientX: e.clientX, clientY: e.clientY }, '*');
            }
        });
        window.addEventListener('mousedown', (e) => {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'rag:mousemove', clientX: e.clientX, clientY: e.clientY }, '*');
            }
        });
    }
}

// Auto-instantiate when loaded in a browser
if (typeof window !== 'undefined') {
    // Defer init until DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new RAGPanel());
    } else {
        new RAGPanel();
    }
}
