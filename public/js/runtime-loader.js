(async function() {
    // --- SPLASH SCREEN LOGIC ---
    const SPLASH_SCREEN = document.getElementById('splash-screen');
    if (SPLASH_SCREEN) {
        // Wait 2 seconds, then fade out
        setTimeout(() => {
            SPLASH_SCREEN.classList.add('fade-out');
            // Remove from DOM or hide completely after animation (1s)
            setTimeout(() => {
                SPLASH_SCREEN.style.display = 'none';
            }, 1000);
        }, 2000);
    }

    const LOADING_SCREEN = document.getElementById('loading-screen');
    const LOADING_BAR = document.getElementById('game-loading-bar');
    const LOADING_TEXT = document.getElementById('game-loading-text');

    function setProgress(p, text) {
        if(LOADING_BAR) LOADING_BAR.style.width = p + '%';
        if(LOADING_TEXT) LOADING_TEXT.innerText = text;
    }

    setProgress(10, "Initializing Core...");

    // 1. Determine Engine Type
    let engineType = 'rpg-topdown'; // Default

    // Check URL Params first (for testing)
    const urlParams = new URLSearchParams(window.location.search);
    const forcedEngine = urlParams.get('engine');
    
    if (forcedEngine && ['rpg-topdown', 'iso-pixel', 'platformer-2d', 'fps-3d', 'topdown-3d', 'platformer-3d'].includes(forcedEngine)) {
        engineType = forcedEngine;
        console.log(`[Runtime] Engine Override via URL: ${engineType}`);
    } else {
        try {
            // We try to fetch the project config. 
            // In a built game, this file should exist at root or via API.
            // In dev mode, we might hit the API.
            let res = await fetch('/api/projects/current');
            if(!res.ok) res = await fetch('redglitch.json'); // Fallback for static build
            
            if (res.ok) {
                const config = await res.json();
                
                // --- Apply Project Branding ---
                if (config.name) {
                    document.title = config.name;
                    const terminalHeader = document.querySelector('.terminal-window h1');
                    if (terminalHeader) terminalHeader.innerText = config.name.toUpperCase();
                }

                if (config.engineType) {
                    engineType = config.engineType;
                } else if (config.template) {
                    // Map templates to engines (Simple mapping for now)
                    if (config.template.includes('iso')) engineType = 'iso-pixel';
                    else if (config.template.includes('platformer')) engineType = 'platformer-2d';
                    else engineType = 'rpg-topdown';
                }
            }
        } catch(e) {
            console.warn("Could not load project config, defaulting to RPG engine.");
        }
    }

    console.log(`[Runtime] Booting Engine: ${engineType}`);
    
    // --- CAMPAIGN MODE DETECTION ---
    const isCampaignMode = urlParams.get('mode') === 'campaign';
    let campaignData = null;
    let campaignSettings = null;
    
    if (isCampaignMode) {
        console.log('[Runtime] Campaign mode detected');
        
        // Read campaign settings from sessionStorage
        const campaignId = sessionStorage.getItem('redglitch_campaign_id');
        const shouldContinue = sessionStorage.getItem('redglitch_campaign_continue') === '1';
        const saveSlot = sessionStorage.getItem('redglitch_save_slot') || '0';
        
        if (!campaignId) {
            console.error('[Runtime] Campaign mode but no campaign ID found');
            alert('Campaign not found. Returning to launcher.');
            window.location.href = 'campaign_launcher.html';
            throw new Error('No campaign ID');
        }
        
        campaignSettings = {
            campaignId,
            shouldContinue,
            saveSlot
        };
        
        console.log(`[Runtime] Loading campaign: ${campaignId}, continue: ${shouldContinue}, slot: ${saveSlot}`);
        
        // Load campaign JSON
        try {
            setProgress(15, `Loading campaign: ${campaignId}...`);
            const response = await fetch(`/api/campaigns/${campaignId}`);
            if (!response.ok) throw new Error('Campaign not found');
            
            campaignData = await response.json();
            console.log('[Runtime] Campaign loaded:', campaignData);
            
            // Store campaign data globally for engine access
            window.CAMPAIGN_MODE = true;
            window.CAMPAIGN_DATA = campaignData;
            window.CAMPAIGN_SETTINGS = campaignSettings;
            
            // If this is a multi-engine campaign, engine type will be set by controller
            // For now, we'll use the first level's engine type or default
            if (campaignData.nodes && campaignData.nodes.length > 0) {
                const startNode = campaignData.nodes.find(n => n.type === 'start');
                if (startNode && startNode.next) {
                    const firstLevelNode = campaignData.nodes.find(n => n.id === startNode.next);
                    if (firstLevelNode && firstLevelNode.engineType) {
                        engineType = firstLevelNode.engineType;
                        console.log(`[Runtime] Campaign first level engine: ${engineType}`);
                    }
                }
            }
        } catch (error) {
            console.error('[Runtime] Failed to load campaign:', error);
            alert('Failed to load campaign: ' + error.message);
            window.location.href = 'campaign_launcher.html';
            throw error;
        }
        
        setProgress(20, `Loading campaign engine: ${engineType}...`);
    } else {
        setProgress(20, `Loading ${engineType}...`);
    }

    // 2. Adjust UI for Engine Type
    if (engineType !== 'rpg-topdown') {
        const statusBars = document.getElementById('status-bars');
        const skillBar = document.getElementById('skill-bar');
        const inventoryBar = document.getElementById('inventory-bar');
        const clock = document.getElementById('game-clock');
        
        if (statusBars) statusBars.style.display = 'none';
        if (skillBar) skillBar.style.display = 'none';
        if (inventoryBar) inventoryBar.style.display = 'none';
        if (clock) clock.style.display = 'none';
    } else {
        // Ensure they are visible for RPG mode
        const statusBars = document.getElementById('status-bars');
        if (statusBars) statusBars.style.display = 'flex';
    }

    // 3. Define Manifests
    const manifests = {
        'rpg-topdown': [
            'shared/LoggerHook.js',
            'shared/EventBus.js',
            'shared/AssetManager.js',
            'shared/DialogueSystem.js',
            'shared/QuestSystem.js',
            'shared/LogicSystem.js',
            'shared/UISystem.js',
            'shared/UIRenderer.js',
            'shared/LocalizationSystem.js',
            'shared/SoundManager.js',
            'engines/rpg-topdown/sprites.js',
            'engines/rpg-topdown/input.js',
            'engines/rpg-topdown/saveSystem.js',
            'engines/rpg-topdown/mapSystem.js',
            'shared/AchievementSystem.js',
            'engines/rpg-topdown/fxSystem.js',
            'engines/rpg-topdown/audioSystem.js',
            'engines/rpg-topdown/console.js',
            'engines/rpg-topdown/campaignSystem.js',
            'engines/rpg-topdown/spatialHash.js',
            'engines/rpg-topdown/stateMachine.js',
            'engines/rpg-topdown/BrainRuntime.js',
            'engines/rpg-topdown/NPC.js',
            'engines/rpg-topdown/MenuSystem.js',
            'engines/rpg-topdown/Entities.js',
            'engines/rpg-topdown/WeatherSystem.js',
            'engines/rpg-topdown/Core.js',
            'engines/rpg-topdown/main.js'
        ],
        'iso-pixel': [
            'shared/LoggerHook.js',
            'shared/EventBus.js',
            'shared/AssetManager.js',
            'shared/LogicSystem.js',
            'shared/UISystem.js',
            'shared/UIRenderer.js',
            'shared/LocalizationSystem.js',
            'shared/SoundManager.js',
            'engines/iso-pixel/renderer.js',
            'engines/iso-pixel/fxSystem.js',
            'engines/iso-pixel/hudSystem.js',
            'engines/iso-pixel/shaderSystem.js',
            'engines/iso-pixel/IsoCombatSystem.js',
            'engines/iso-pixel/IsoEntity.js',
            'engines/iso-pixel/main.js'
        ],
        'platformer-2d': [
            'shared/LoggerHook.js',
            'shared/EventBus.js',
            'shared/AssetManager.js',
            'shared/DialogueSystem.js',
            'shared/QuestSystem.js',
            'shared/LogicSystem.js',
            'shared/UISystem.js',
            'shared/UIRenderer.js',
            'shared/LocalizationSystem.js',
            'shared/SoundManager.js',
            'engines/platformer-2d/PlatformerConfig.js',
            'engines/platformer-2d/PlatformerAssetManager.js',
            'engines/platformer-2d/ParallaxSystem.js',
            'engines/platformer-2d/Animator.js',
            'engines/platformer-2d/CombatSystem.js',
            'engines/platformer-2d/entities/Entity.js',
            'engines/platformer-2d/entities/Player.js',
            'engines/platformer-2d/entities/Enemy.js',
            'engines/platformer-2d/entities/FlyingEnemy.js',
            'engines/platformer-2d/entities/ShooterEnemy.js',
            'engines/platformer-2d/entities/Projectile.js',
            'engines/platformer-2d/entities/PushableBlock.js',
            'engines/platformer-2d/entities/MovingPlatform.js',
            'engines/platformer-2d/entities/Trigger.js',
            'engines/platformer-2d/PhysicsSystem.js',
            'engines/platformer-2d/renderer.js',
            'engines/platformer-2d/generator/SmartGenerator.js',
            'engines/platformer-2d/main.js'
        ],
        'fps-3d': [
            'shared/LoggerHook.js',
            'shared/EventBus.js',
            'shared/AssetManager.js',
            'engines/3d/main.js'
        ],
        'topdown-3d': [
            'shared/LoggerHook.js',
            'shared/EventBus.js',
            'shared/AssetManager.js',
            'engines/3d/main.js'
        ],
        'platformer-3d': [
            'shared/LoggerHook.js',
            'shared/EventBus.js',
            'shared/AssetManager.js',
            'engines/3d/main.js'
        ]
    };

    let scripts = manifests[engineType] || manifests['rpg-topdown'];
    
    // If campaign mode, prepend campaign controller and adapters
    if (isCampaignMode) {
        const campaignScripts = [
            'engines/shared/CrossEngineSerializer.js',  // Load first - used by adapters
            'engines/shared/EngineAdapter.legacy.js',
            'engines/shared/TopDownAdapter.js',
            'engines/shared/IsoPixelAdapter.js',
            'engines/shared/PlatformerAdapter.js',
            'engines/3d/Unified3DAdapter.js',           // Merged 3D adapter
            'engines/shared/CampaignController.js'
        ];
        scripts = [...campaignScripts, ...scripts];
    }

    // 3. Load Scripts Sequentially
    let loaded = 0;
    for (const src of scripts) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            // Handle special case for sprites.js which server.js might intercept
            // If server.js serves /base_game/sprites.js, we might need to adjust or update server.js
            // For now, we request the new path.
            script.src = src;
            script.onload = resolve;
            script.onerror = () => {
                console.error(`Failed to load ${src}`);
                // Continue anyway? Or halt?
                resolve(); 
            };
            document.body.appendChild(script);
        });
        loaded++;
        setProgress(20 + (loaded / scripts.length) * 80, "Loading Assets...");
    }

    console.log("[Runtime] Engine Loaded.");
    // The main.js of the engine usually handles hiding the loading screen
})();
