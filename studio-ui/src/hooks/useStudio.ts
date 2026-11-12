import { useCallback, useEffect, useMemo, useState } from 'react';

const scriptLoadCache = new Map<string, Promise<boolean>>();

function loadScript(src: string, isModule = false): Promise<boolean> {
    const cached = scriptLoadCache.get(src);
    if (cached) return cached;

    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
        if (existing.dataset.loaded === 'true') {
            return Promise.resolve(true);
        }
        if (existing.dataset.loaded === 'false') {
            return Promise.resolve(false);
        }
        const pending = new Promise<boolean>((resolve) => {
            existing.addEventListener('load', () => resolve(true), { once: true });
            existing.addEventListener('error', () => resolve(false), { once: true });
        });
        scriptLoadCache.set(src, pending);
        return pending;
    }

    const promise = new Promise<boolean>((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        if (isModule) {
            s.type = 'module';
        } else {
            s.async = false;
        }
        s.onload = () => {
            s.dataset.loaded = 'true';
            resolve(true);
        };
        s.onerror = () => {
            s.dataset.loaded = 'false';
            resolve(false);
        };
        document.body.appendChild(s);
    });

    scriptLoadCache.set(src, promise);
    return promise;
}

export function useStudio(namespace?: string) {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            // Start browser preloads in parallel so scripts arrive while EventBus executes first.
            if (typeof document !== 'undefined' && document.head) {
                const preloadTargets = [
                    '/shared/SharedProjectState.js',
                    '/shared/AssetManager.js',
                    '/base_game/sprites.js'
                ];
                for (const href of preloadTargets) {
                    if (!document.head.querySelector(`link[rel="preload"][href="${href}"]`)) {
                        const link = document.createElement('link');
                        link.rel = 'preload';
                        link.as = 'script';
                        link.href = href;
                        document.head.appendChild(link);
                    }
                }
            }

            // Load EventBus first so SharedProjectState and AssetManager attach to it on boot.
            await loadScript('/shared/EventBus.js');

            const secondaryScripts: Array<Promise<boolean>> = [
                loadScript('/shared/SharedProjectState.js'),
                loadScript('/shared/AssetManager.js'),
                loadScript('/base_game/sprites.js')
            ];
            if (!(window as any).StudioBridge) {
                secondaryScripts.push(loadScript('/ai/studio-bridge.js', true));
            }

            await Promise.all(secondaryScripts);
            if (!cancelled) setIsReady(true);
        };

        boot();

        return () => {
            cancelled = true;
        };
    }, []);

    const StudioBridgeClass = (window as any).StudioBridge;

    const createBridge = useCallback((ns: string) => {
        const SB = (window as any).StudioBridge;
        const eb = (window as any).RedglitchEventBus;
        return SB && eb ? new SB(ns, eb) : null;
    }, []);

    const bridge = useMemo(() => {
        if (!isReady || !namespace) return null;
        return createBridge(namespace);
    }, [isReady, namespace, createBridge]);

    const emit = useCallback((type: string, data: any = {}) => {
        const eb = (window as any).RedglitchEventBus;
        if (eb) eb.emit(type, { ...data, timestamp: Date.now() });
    }, []);

    const subscribe = useCallback((type: string, callback: (event: any) => void) => {
        const eb = (window as any).RedglitchEventBus;
        if (eb) {
            eb.on(type, callback);
            return () => eb.off(type, callback);
        }
        return () => {};
    }, []);

    return {
        isReady,
        eventBus: (window as any).RedglitchEventBus,
        projectState: (window as any).RedglitchProjectState,
        assetManager: (window as any).RedglitchAssetManager,
        sprites: (window as any).SPRITES,
        StudioBridge: StudioBridgeClass,
        bridge,
        createBridge,
        emit,
        subscribe
    };
}
