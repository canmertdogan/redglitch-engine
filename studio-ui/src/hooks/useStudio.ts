import { useEffect, useState } from 'react';

export function useStudio() {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Load legacy scripts if not present
        const scripts = [
            '/shared/EventBus.js',
            '/shared/SharedProjectState.js',
            '/shared/AssetManager.js',
            '/base_game/sprites.js'
        ];

        const loadScript = (src: string) => {
            return new Promise((resolve) => {
                if (document.querySelector(`script[src="${src}"]`)) {
                    resolve(true);
                    return;
                }
                const s = document.createElement('script');
                s.src = src;
                s.onload = () => resolve(true);
                document.body.appendChild(s);
            });
        };

        Promise.all(scripts.map(loadScript)).then(() => {
            setIsReady(true);
        });
    }, []);

    return {
        isReady,
        eventBus: (window as any).RedGlitchEventBus,
        projectState: (window as any).RedGlitchProjectState,
        assetManager: (window as any).RedGlitchAssetManager,
        sprites: (window as any).SPRITES,
        emit: (type: string, data: any) => {
            const eb = (window as any).RedGlitchEventBus;
            if (eb) eb.emit(type, { ...data, timestamp: Date.now() });
        },
        subscribe: (type: string, callback: (event: any) => void) => {
            const eb = (window as any).RedGlitchEventBus;
            if (eb) {
                eb.on(type, callback);
                return () => eb.off(type, callback);
            }
            return () => {};
        }
    };
}
