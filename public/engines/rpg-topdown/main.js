async function initRPGEngine() {
    // Check if another engine already claimed window.game
    if (window.game && !(window.game instanceof window.Core)) {
        return;
    }

    // Check URL for engine override to be safe
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('engine') && urlParams.get('engine') !== 'rpg-topdown') {
        return;
    }

    window.LOCALE.setLanguage(localStorage.getItem('redglitch_lang') || 'EN'); 
    
    try { 
        const res = await fetch('dunyalar/definitions/music.json'); 
        if(res.ok) window.MUSIC_CONFIG = await res.json(); 
    } catch(e) { console.warn("Music config not loaded"); }
    
    // Skip auto-initialization in campaign runtime mode
    if (window.CAMPAIGN_RUNTIME_MODE) {
        return;
    }
    
    if (!window.game) window.game = new window.Core(); 
    if (!window.menuSystem) window.menuSystem = new window.MenuSystem(window.game);

    // V2.0: Reflection System (Dev Mode Only)
    // In a real build, this JSON would be pre-generated.
    import('./ReflectionSystem.js').then(m => {
        if (!window.game) return;
        const reflector = new m.ReflectionSystem(window.game);
        const schema = reflector.generateSchema();
        // Expose for Algorithm Studio to read
        window.GAME_API_SCHEMA = schema;
    });
}

if (document.readyState === 'complete') {
    initRPGEngine();
} else {
    window.addEventListener('load', initRPGEngine);
}

window.attemptLogin = () => { 
    const input = document.getElementById('username-input'); 
    if (input && input.value.trim()) {
        const username = input.value.trim().toUpperCase();
        
        // Priority 1: MenuSystem (Polished RPG Flow)
        if (window.menuSystem) {
            window.menuSystem.login(username);
        } 
        // Priority 2: Direct Game Login (New Standalone Demos)
        else if (window.game && typeof window.game.login === 'function') {
            window.game.login(username);
        } 
        else {
            console.error("[Runtime] No engine found to handle login. (Game:", !!window.game, "Menu:", !!window.menuSystem, ")");
        }
    } 
};

// PHASE B: Listen for test commands from Algorithm Studio
window.addEventListener('message', async (event) => {
    if (event.data.type === 'testAlgorithm') {
        
        const { scriptName, eventName } = event.data;
        
        // Create or get test entity
        if (!window.testEntity) {
            window.testEntity = {
                id: 'test_entity',
                name: 'Test Entity',
                x: 320,
                y: 240,
                type: 'test'
            };
        }
        
        // Get game instance
        const game = window.game || window.menuSystem?.game;
        if (!game || !game.logicSystem) {
            console.error('[AlgorithmTest] Game or LogicSystem not available');
            if (window.opener) {
                window.opener.postMessage({
                    type: 'algorithmLog',
                    message: '✗ Game not initialized. Please start a game first.'
                }, window.location.origin);
            }
            return;
        }
        
        try {
            // Attach algorithm to test entity
            await game.logicSystem.attachToEntity(window.testEntity, scriptName, [eventName]);
            
            // Trigger the event
            await game.logicSystem.trigger(window.testEntity, eventName);
            
            if (window.opener) {
                window.opener.postMessage({
                    type: 'algorithmLog',
                    message: `✓ Script executed successfully`
                }, window.location.origin);
            }
        } catch (error) {
            console.error('[AlgorithmTest] Error:', error);
            if (window.opener) {
                window.opener.postMessage({
                    type: 'algorithmError',
                    scriptName: scriptName,
                    eventName: eventName,
                    error: error.message,
                    stack: error.stack
                }, window.location.origin);
            }
        }
    }
});
