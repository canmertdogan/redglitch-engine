/**
 * Deferred conditional mount for the standalone Kai AI Assistant overlay.
 * Inside Studio workspace iframes (window.parent !== window), tools.html already
 * owns the single shared Kai AI panel, so spawning duplicate child iframes is skipped.
 */
(function () {
    if (typeof window === 'undefined' || window.parent !== window) return;

    function mountKaiPanel() {
        if (document.getElementById('kai-ai-panel')) return;

        const iframe = document.createElement('iframe');
        iframe.id = 'kai-ai-panel';
        iframe.src = 'ai/ui/assistant-panel.html';
        iframe.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none; pointer-events: none; z-index: 9999;';

        let hitZones = [];
        const checkHit = (coords) => {
            const { clientX: x, clientY: y } = coords;
            let hit = false;
            for (const zone of hitZones) {
                if (x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom) {
                    hit = true;
                    break;
                }
            }
            iframe.style.pointerEvents = hit ? 'auto' : 'none';
        };

        window.addEventListener('message', (e) => {
            if (!e.data) return;
            if (e.data.type === 'kai:hitzones') {
                hitZones = e.data.zones || [];
            } else if (e.data.type === 'kai:mousemove') {
                checkHit(e.data);
            }
        });

        window.addEventListener('mousemove', checkHit);
        window.addEventListener('mousedown', checkHit);

        iframe.addEventListener('load', () => {
            try {
                const doc = iframe.contentWindow.document;
                doc.body.style.background = 'transparent';
                doc.body.style.pointerEvents = 'none';
                const clickable = doc.querySelectorAll('#ai-assistant-container, #ai-chat-panel, #xp-ai-loading, #xp-settings');
                clickable.forEach((el) => { if (el) el.style.pointerEvents = 'auto'; });
            } catch (e) {
                console.warn('Kai: Could not access iframe:', e);
                iframe.style.pointerEvents = 'auto';
            }
        });

        document.body.appendChild(iframe);
    }

    const scheduleMount = () => {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(mountKaiPanel, { timeout: 600 });
        } else {
            setTimeout(mountKaiPanel, 80);
        }
    };

    if (document.readyState === 'complete') {
        scheduleMount();
    } else {
        window.addEventListener('load', scheduleMount, { once: true });
    }
})();
