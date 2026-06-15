/**
 * CampaignController - Multi-Engine Campaign Orchestrator
 * 
 * Manages campaign flow across different engine types (rpg-topdown, iso-pixel, platformer-2d)
 * Handles engine transitions, state persistence, and node graph traversal
 */
class CampaignController {
    constructor() {
        this.campaignData = [];
        this.campaignMetadata = {};
        this.currentNodeId = null;
        this.currentAdapter = null;
        this.currentEngineType = null;
        
        // Cross-engine persistent state
        this.globalFlags = {};
        this.variables = {}; // Numeric/String variables (score, coins, etc.)
        this.playerData = null;
        this.inventory = []; // Raw inventory data
        this.inventorySystem = new window.InventorySystem(); // Inventory manager
        this.questProgress = {};
        this.achievements = [];
        
        // Ability system (NEW)
        this.equippedAbilities = [null, null, null, null];
        this.abilityCooldowns = [0, 0, 0, 0];
        
        // Campaign metadata
        this.campaignId = null;
        this.completedNodes = new Set();
        this.username = null;
        
        // Callbacks
        this.onCampaignComplete = null;
        this.onNodeChange = null;
        this.onEngineSwitch = null;
        
        // Transition state
        this.isTransitioning = false;
        
        // Slot-based system
        this.slotId = null;
        this.currentSlot = null;
        this.playTimeStart = null;
        this.totalPlayTime = 0; // in seconds
        this._activeProjectName = null;
        this._activeProjectNameResolved = false;

        // Engine Manifests
        this.engineManifests = {
            'rpg-topdown': [
                'shared/InputSystem.js',
                'shared/AchievementSystem.js',
                'shared/Profiler.js',
                'shared/VFXBridge.js',
                'shared/LocalizationSystem.js',
                'shared/SoundManager.js',
                'strategies/TopDownStrategy.js',
                'engines/rpg-topdown/sprites.js',
                'engines/rpg-topdown/input.js',
                'engines/rpg-topdown/saveSystem.js',
                'engines/rpg-topdown/mapSystem.js',
                'engines/rpg-topdown/fxSystem.js',
                'engines/rpg-topdown/audioSystem.js',
                'engines/rpg-topdown/console.js',
                'engines/rpg-topdown/postProcess.js',
                'engines/rpg-topdown/logicRuntime.js',
                'engines/rpg-topdown/BrainRuntime.js',
                'engines/rpg-topdown/NPC.js',
                'engines/rpg-topdown/MenuSystem.js',
                'engines/rpg-topdown/Entities.js',
                'engines/rpg-topdown/WeatherSystem.js',
                'engines/rpg-topdown/InteractiveCutsceneEngine.js',
                'engines/rpg-topdown/campaignSystem.js',
                'engines/rpg-topdown/spatialHash.js',
                'engines/rpg-topdown/stateMachine.js',
                'engines/rpg-topdown/Core.js',
                'engines/rpg-topdown/main.js'
            ],
            'iso-pixel': [
                'shared/InputSystem.js',
                'shared/AchievementSystem.js',
                'shared/Profiler.js',
                'shared/VFXBridge.js',
                'shared/LocalizationSystem.js',
                'shared/SoundManager.js',
                'shared/LogicSystem.js',
                'shared/LogicInterpreter.js',
                'shared/BehaviorTreeRunner.js',
                'strategies/IsoStrategy.js',
                'engines/iso-pixel/renderer.js',
                'engines/iso-pixel/fxSystem.js',
                'engines/iso-pixel/hudSystem.js',
                'engines/iso-pixel/shaderSystem.js',
                'engines/iso-pixel/IsoCombatSystem.js',
                'engines/iso-pixel/IsoEntity.js',
                'engines/iso-pixel/main.js'
            ],
            'platformer-2d': [
                'shared/InputSystem.js',
                'shared/AchievementSystem.js',
                'shared/Profiler.js',
                'shared/VFXBridge.js',
                'shared/LocalizationSystem.js',
                'shared/SoundManager.js',
                'strategies/PlatformerStrategy.js',
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
            'topdown-3d': [
                'engines/shared/Engine3DBase.js',
                'engines/shared/Engine3DAdapter.js',
                'engines/3d/Unified3DAdapter.js'
            ],
            'fps-3d': [
                'engines/shared/Engine3DBase.js',
                'engines/shared/Engine3DAdapter.js',
                'engines/3d/Unified3DAdapter.js'
            ],
            'platformer-3d': [
                'engines/shared/Engine3DBase.js',
                'engines/shared/Engine3DAdapter.js',
                'engines/3d/Unified3DAdapter.js'
            ]
        };
        this.loadedEngines = new Set();

        // Phase 2: Live Memory Bridge Integration
        if (typeof window !== 'undefined' && window.RedGlitchEventBus) {
            window.RedGlitchEventBus.on('system:memory:request', (event) => {
                const namespace = event.data?.namespace || 'global';
                if (namespace === 'campaign' || namespace === 'global') {
                    window.RedGlitchEventBus.broadcastMemoryDiff('campaign', {
                        campaignId: this.campaignId,
                        currentNodeId: this.currentNodeId,
                        globalFlags: this.globalFlags,
                        variables: this.variables
                    });
                }
            });
            
            window.RedGlitchEventBus.on('system:memory:patch', (event) => {
                const { namespace, patch } = event.data || {};
                if (namespace === 'campaign' && patch) {
                    if (patch.variables) Object.assign(this.variables, patch.variables);
                    if (patch.globalFlags) Object.assign(this.globalFlags, patch.globalFlags);
                    console.log('[CampaignController] Campaign Memory patched by Data-Driven IDE');
                }
            });

            // Phase 4: Global Database Live-Patching
            window.RedGlitchEventBus.on('system:database:patch', (event) => {
                const { collection, data } = event.data || {};
                console.log(`[CampaignController] Live-patching database: ${collection}`);
                if (this.currentAdapter && typeof this.currentAdapter.handleDatabasePatch === 'function') {
                    this.currentAdapter.handleDatabasePatch(collection, data);
                } else if (typeof window.applyDatabasePatch === 'function') {
                    window.applyDatabasePatch(collection, data);
                }
            });
            
            // Phase 12: Data-Driven Trigger Dispatcher
            window.RedGlitchEventBus.on('system:trigger:fire', async (event) => {
                const triggerId = event.data?.triggerId;
                const payload = event.data?.payload || {};
                console.log(`[CampaignController] Firing IDE Manual Trigger: ${triggerId}`, payload);
                if (this.currentAdapter && typeof this.currentAdapter.handleTrigger === 'function') {
                    this.currentAdapter.handleTrigger(triggerId, payload);
                } else if (typeof window.fireCampaignEvent === 'function') {
                    window.fireCampaignEvent(triggerId, payload);
                } else {
                    console.warn(`[CampaignController] No trigger handler available for ${triggerId}`);
                }
            });
        }
    }

    /**
     * Set a campaign variable
     * @param {string} key 
     * @param {any} value 
     */
    setVariable(key, value) {
        this.variables[key] = value;
        console.log(`[Campaign] Variable set: ${key} = ${value}`);
        // Notify UI or adapters if needed
    }

    /**
     * Get a campaign variable
     * @param {string} key 
     * @returns {any}
     */
    getVariable(key) {
        return this.variables[key] || 0;
    }

    /**
     * Increment a numeric variable
     * @param {string} key 
     * @param {number} amount 
     */
    incrementVariable(key, amount = 1) {
        const val = this.getVariable(key);
        this.setVariable(key, val + amount);
    }

    /**
     * Check if a condition is met
     * @param {Object} condition 
     * @returns {boolean}
     */
    checkCondition(condition) {
        if (!window.ConditionEvaluator) return true;
        
        const context = {
            variables: this.variables,
            flags: this.globalFlags,
            hasItem: (itemId, count) => this.inventorySystem.hasItem(itemId, count)
        };
        
        return window.ConditionEvaluator.evaluate(condition, context);
    }

    /**
     * Initialize campaign controller
     * @param {string} username - Player username
     * @param {number} slotId - Optional slot ID for slot-based system
     */
    async initialize(username, slotId = null) {
        this.username = username;
        this.slotId = slotId;
        
        // Initialize with starter abilities if no abilities set
        if (!this.equippedAbilities || this.equippedAbilities.every(a => a === null)) {
            this.equippedAbilities = AbilityDefinitions.getStarterAbilities();
            console.log('[CampaignController] Initialized with starter abilities:', this.equippedAbilities);
        }
        
        if (slotId) {
            console.log(`CampaignController initialized with slot ${slotId} for user:`, username);
            // Start tracking play time
            this.playTimeStart = Date.now();
        } else {
            console.log('CampaignController initialized for user:', username);
        }
    }

    /**
     * Load campaign data
     * @param {string} campaignId - Campaign identifier
     * @param {string} campaignPath - Optional path to campaign JSON
     * @returns {Promise<void>}
     */
    async loadCampaign(campaignId, campaignPath = null) {
        console.log(`Loading campaign: ${campaignId}`);
        
        this.campaignId = campaignId;
        
        // Construct path - use API endpoint for proper project path resolution
        const path = campaignPath || `/api/campaigns/${campaignId}`;
        
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load campaign: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Store campaign metadata separately
            if (data.nodes) {
                this.campaignData = data.nodes;
                this.campaignMetadata = {
                    name: data.name,
                    description: data.description,
                    version: data.version,
                    author: data.author
                };
            } else {
                this.campaignData = data;
                this.campaignMetadata = {};
            }
            
            console.log(`Campaign loaded: ${this.campaignData.length} nodes`);
            
            // Try to restore saved campaign state
            if (this.slotId) {
                await this.loadFromSlot();
            } else {
                await this.loadCampaignState();
            }
            
        } catch (error) {
            console.error('Failed to load campaign:', error);
            throw error;
        }
    }

    /**
     * Start the campaign from beginning or saved position
     * @returns {Promise<void>}
     */
    async start() {
        if (!this.campaignData || this.campaignData.length === 0) {
            console.warn('No campaign data loaded');
            return;
        }

        // If resuming from saved state
        if (this.currentNodeId) {
            console.log('Resuming campaign from node:', this.currentNodeId);
            await this.processNode(this.currentNodeId);
            return;
        }

        // Find start node
        let startNode = this.campaignData.find(n => n.type === 'start');
        
        // If no start node, find first node not targeted by others
        if (!startNode) {
            const targets = new Set();
            this.campaignData.forEach(n => {
                if (n.next) targets.add(n.next);
                if (n.nextTrue) targets.add(n.nextTrue);
                if (n.nextFalse) targets.add(n.nextFalse);
            });
            startNode = this.campaignData.find(n => !targets.has(n.id));
        }

        // Fallback to first node
        if (!startNode) startNode = this.campaignData[0];

        if (startNode) {
            console.log('Campaign starting at node:', startNode.id);
            await this.processNode(startNode.id);
        }
    }

    /**
     * Process a campaign node
     * @param {string} nodeId - Node identifier
     * @returns {Promise<void>}
     */
    async processNode(nodeId) {
        const node = this.campaignData.find(n => n.id === nodeId);
        if (!node) {
            console.warn('Campaign node not found:', nodeId);
            return;
        }

        this.currentNodeId = nodeId;
        this.completedNodes.add(nodeId);
        
        console.log('Processing node:', node.type, nodeId);
        
        // Notify listeners
        if (this.onNodeChange) {
            this.onNodeChange(node);
        }

        // Save state after each node
        await this.saveCampaignState();

        switch (node.type) {
            case 'start':
                await this._handleStartNode(node);
                break;
            
            case 'level':
                await this._handleLevelNode(node);
                break;
            
            case 'branch':
                await this._handleBranchNode(node);
                break;
            
            case 'if-statement':
                await this._handleBranchNode(node); // Same as branch
                break;
            
            case 'reward':
                await this._handleRewardNode(node);
                break;
            
            case 'variable':
                await this._handleVariableNode(node);
                break;
            
            case 'dialogue':
                await this._handleDialogueNode(node);
                break;
            
            case 'cutscene':
                await this._handleCutsceneNode(node);
                break;
            
            case 'random':
                await this._handleRandomNode(node);
                break;
            
            case 'wait':
                await this._handleWaitNode(node);
                break;
            
            case 'note':
                await this._handleNoteNode(node);
                break;
            
            case 'mini-game':
                await this._handleMiniGameNode(node);
                break;
            
            case 'hub':
                await this._handleHubNode(node);
                break;
            
            case 'challenge-mode':
                await this._handleChallengeModeNode(node);
                break;
            
            case 'boss-rush':
                await this._handleBossRushNode(node);
                break;
            
            case 'exploration':
                await this._handleExplorationNode(node);
                break;
            
            default:
                console.warn('Unknown node type:', node.type);
                await this.continueFlow(node);
                break;
        }
    }

    /**
     * Handle start node
     * @private
     */
    async _handleStartNode(node) {
        console.log('Campaign started');
        await this.continueFlow(node);
    }

    /**
     * Handle level node (engine-aware)
     * @private
     */
    async _handleLevelNode(node) {
        const engineType = node.engineType || 'rpg-topdown';
        const levelId = node.levelId || node.id;
        const levelPath = node.levelPath || null;
        let projectName = node.projectName
            || node.project
            || this.campaignMetadata?.projectName
            || this.campaignMetadata?.project
            || null;

        // Backward compatibility: older campaigns often omit project for 3D nodes.
        // In that case, resolve the current active project from the server.
        if (!projectName && !levelPath && this._is3DEngine(engineType)) {
            projectName = await this._resolveActiveProjectName();
        }

        console.log(`Loading level: ${levelId} (engine: ${engineType})`);
        console.log(`[CampaignController] Current engine: ${this.currentEngineType}, Target engine: ${engineType}`);

        try {
            // Check if engine switch needed
            if (this.currentEngineType !== engineType) {
                console.log(`[CampaignController] Engine switch required: ${this.currentEngineType} → ${engineType}`);
                await this._switchEngine(engineType);
            } else {
                console.log('[CampaignController] Using existing engine adapter');
            }

            // Load level in current adapter
            if (this.currentAdapter) {
                if (projectName && typeof this.currentAdapter.setProject === 'function') {
                    this.currentAdapter.setProject(projectName);
                }
                console.log(`[CampaignController] Registering onLevelComplete callback for ${levelId}`);
                // Register completion callback BEFORE loading level
                this.currentAdapter.onLevelComplete((data) => {
                    console.log(`[CampaignController] Level completed callback received from ${data.engineType} for ${levelId}`);
                    // Save state
                    this.playerData = this.currentAdapter.getPlayerData();
                    this.advance();
                });
                
                await this.currentAdapter.loadLevel(levelId, levelPath);
                
                // Start the engine
                this.currentAdapter.start();
            }
            
        } catch (error) {
            console.error('Failed to load level:', error);
            this._showError(`Failed to load level: ${levelId}`);
        }
    }

    _is3DEngine(engineType) {
        return engineType === 'topdown-3d'
            || engineType === 'fps-3d'
            || engineType === 'platformer-3d';
    }

    async _resolveActiveProjectName() {
        if (this._activeProjectNameResolved) {
            return this._activeProjectName;
        }

        this._activeProjectNameResolved = true;
        this._activeProjectName = null;

        try {
            const res = await fetch('/api/projects/current');
            if (!res.ok) {
                console.warn(`[CampaignController] Failed to resolve active project (HTTP ${res.status})`);
                return null;
            }
            const data = await res.json();
            const name = (typeof data?.name === 'string') ? data.name : null;
            this._activeProjectName = (name && name !== 'ROOT') ? name : null;
            return this._activeProjectName;
        } catch (error) {
            console.warn('[CampaignController] Failed to resolve active project:', error);
            return null;
        }
    }

    /**
     * Dynamically load scripts for a specific engine type
     * @private
     * @param {string} engineType 
     * @returns {Promise<void>}
     */
    async _loadEngineScripts(engineType) {
        if (this.loadedEngines.has(engineType)) return;
        const scripts = this.engineManifests[engineType];
        if (!scripts) return;
        for (const src of scripts) {
            const isModule = (src.endsWith('Adapter.js') && this._is3DEngine(engineType)) || src.includes('Engine3D');
            
            if (isModule) {
                console.log(`[CampaignController] Importing module: ${src}`);
                try {
                    await import(`/${src}?v=${Date.now()}`);
                } catch (err) {
                    console.error(`[CampaignController] Module import failed for ${src}:`, err);
                }
            } else {
                const cleanSrc = src.split('?')[0];
                const alreadyLoaded = Array.from(document.scripts).some(s => {
                    const absSrc = s.src || '';
                    const attrSrc = s.getAttribute('src') || '';
                    return absSrc.includes(cleanSrc) || attrSrc.includes(cleanSrc);
                });
                if (alreadyLoaded) {
                    console.log(`[CampaignController] Script already loaded, skipping: ${src}`);
                    continue;
                }

                await new Promise((resolve) => {
                    const script = document.createElement('script');
                    const v = Date.now();
                    script.src = `${src}?v=${v}`;
                    script.onload = resolve;
                    script.onerror = () => {
                        console.error(`[CampaignController] Failed to load ${src}`);
                        resolve();
                    };
                    document.body.appendChild(script);
                });
            }
        }
        this.loadedEngines.add(engineType);
    }

    /**
     * Handle branch/if-statement node
     * @private
     */
    async _handleBranchNode(node) {
        const condition = node.condition || node.flag;
        const value = this.globalFlags[condition] || false;
        
        console.log(`Branch check [${condition}]:`, value);

        if (value) {
            if (node.nextTrue) {
                await this.processNode(node.nextTrue);
            } else {
                console.warn('Branch TRUE path missing');
            }
        } else {
            if (node.nextFalse) {
                await this.processNode(node.nextFalse);
            } else {
                console.warn('Branch FALSE path missing');
            }
        }
    }

    /**
     * Handle reward node
     * @private
     */
    async _handleRewardNode(node) {
        console.log('Reward node:', node);
        
        // Add item to inventory
        if (node.itemId) {
            this.inventory.push({
                id: node.itemId,
                name: node.itemName || node.itemId,
                receivedAt: Date.now()
            });
            
            console.log(`Reward received: ${node.itemId}`);
            
            // Show notification
            this._showNotification(`Received: ${node.itemName || node.itemId}`);
        }
        
        // Add gold
        if (node.gold) {
            if (!this.playerData) this.playerData = {};
            this.playerData.gold = (this.playerData.gold || 0) + node.gold;
            console.log(`Gold received: ${node.gold}`);
        }
        
        await this.continueFlow(node);
    }

    /**
     * Handle variable/flag node
     * @private
     */
    async _handleVariableNode(node) {
        const flag = node.flag || node.variable;
        const value = node.value === 'true' || node.value === true;
        
        this.globalFlags[flag] = value;
        console.log(`Flag set [${flag}] = ${value}`);
        
        await this.continueFlow(node);
    }

    /**
     * Handle dialogue node
     * @private
     */
    async _handleDialogueNode(node) {
        console.log('Dialogue:', node.text);
        
        // Show dialogue (implementation depends on UI)
        this._showDialogue(node.text || 'No text', () => {
            this.continueFlow(node);
        });
    }

    /**
     * Handle cutscene node
     * @private
     */
    async _handleCutsceneNode(node) {
        console.log('Cutscene:', node.cutsceneId);
        
        // Play cutscene (implementation depends on system)
        this._playCutscene(node.cutsceneId, () => {
            this.continueFlow(node);
        });
    }

    /**
     * Handle random node
     * @private
     */
    async _handleRandomNode(node) {
        const chance = node.chance || 50;
        const roll = Math.random() * 100;
        
        console.log(`Random roll: ${roll.toFixed(1)} vs ${chance}`);

        if (roll <= chance) {
            if (node.nextTrue) {
                await this.processNode(node.nextTrue);
            }
        } else {
            if (node.nextFalse) {
                await this.processNode(node.nextFalse);
            }
        }
    }

    /**
     * Handle wait node
     * @private
     */
    async _handleWaitNode(node) {
        const duration = (node.duration || 1) * 1000;
        console.log(`Waiting ${duration}ms...`);
        
        setTimeout(() => {
            this.continueFlow(node);
        }, duration);
    }

    /**
     * Handle note node (comment)
     * @private
     */
    async _handleNoteNode(node) {
        console.log('Note:', node.text);
        await this.continueFlow(node);
    }

    /**
     * Handle mini-game node
     * Loads a short challenge level in a specific engine
     * @private
     */
    async _handleMiniGameNode(node) {
        console.log('Starting mini-game:', node.name || node.id);
        
        // Mini-games are like levels but with special completion conditions
        const miniGameNode = {
            ...node,
            type: 'level',
            engineType: node.engineType || 'rpg-topdown',
            levelId: node.levelId,
            levelPath: node.levelPath,
            metadata: {
                name: node.name || 'Mini-Game',
                description: node.description || 'Complete the challenge!',
                isMiniGame: true,
                timeLimit: node.timeLimit,
                scoreTarget: node.scoreTarget,
                completionCondition: node.completionCondition
            }
        };
        
        // Set mini-game flags
        this.globalFlags._miniGameActive = true;
        this.globalFlags._miniGameType = node.gameType || 'challenge';
        
        // Store pre-mini-game state (optional restoration)
        if (node.restoreStateAfter) {
            this._miniGameBackupState = {
                playerData: this.playerData,
                flags: { ...this.globalFlags }
            };
        }
        
        // Load mini-game level
        await this._handleLevelNode(miniGameNode);
    }

    /**
     * Handle hub node
     * Safe area with shops, NPCs, quest givers - no combat
     * @private
     */
    async _handleHubNode(node) {
        console.log('Entering hub:', node.name || node.id);
        
        // Hub is a special level with hub-specific features
        const hubNode = {
            ...node,
            type: 'level',
            engineType: node.engineType || 'rpg-topdown',
            levelId: node.levelId,
            levelPath: node.levelPath,
            metadata: {
                name: node.name || 'Hub Area',
                description: node.description || 'Safe zone - shops, NPCs, and quests',
                isHub: true,
                hasShop: node.hasShop !== false,
                hasInn: node.hasInn !== false,
                hasQuestBoard: node.hasQuestBoard !== false,
                npcList: node.npcList || []
            }
        };
        
        // Set hub flags
        this.globalFlags._inHub = true;
        this.globalFlags._currentHub = node.id;
        
        // Hubs allow multiple exits (player choice)
        if (node.exits && node.exits.length > 0) {
            // Store exit options for level to access
            this.globalFlags._hubExits = node.exits;
        }
        
        // Heal player in hub (optional)
        if (node.healPlayer !== false) {
            if (this.playerData) {
                this.playerData.hp = this.playerData.maxHp;
                this.playerData.mana = this.playerData.maxMana;
                this.playerData.stamina = this.playerData.maxStamina;
            }
        }
        
        // Load hub level
        await this._handleLevelNode(hubNode);
    }

    /**
     * Handle challenge-mode node
     * Timed/scored variation of a level
     * @private
     */
    async _handleChallengeModeNode(node) {
        console.log('Starting challenge mode:', node.name || node.id);
        
        // Challenge mode adds constraints to a level
        const challengeNode = {
            ...node,
            type: 'level',
            engineType: node.engineType || 'rpg-topdown',
            levelId: node.levelId,
            levelPath: node.levelPath,
            metadata: {
                name: node.name || 'Challenge Mode',
                description: node.description || 'Complete under special conditions!',
                isChallenge: true,
                challengeType: node.challengeType || 'time_trial',
                timeLimit: node.timeLimit,
                scoreTarget: node.scoreTarget,
                restrictions: node.restrictions || [], // e.g., ['no_items', 'low_health']
                rewards: node.challengeRewards || []
            }
        };
        
        // Set challenge flags
        this.globalFlags._challengeActive = true;
        this.globalFlags._challengeType = node.challengeType;
        
        // Apply restrictions
        if (node.restrictions && this.playerData) {
            if (node.restrictions.includes('no_items')) {
                this._challengeBackupInventory = [...this.inventory];
                this.inventory = [];
            }
            if (node.restrictions.includes('low_health')) {
                this.playerData.hp = Math.floor(this.playerData.maxHp * 0.25);
            }
            if (node.restrictions.includes('no_mana')) {
                this.playerData.mana = 0;
            }
        }
        
        // Start challenge timer if specified
        if (node.timeLimit) {
            this._challengeStartTime = Date.now();
            this._challengeTimeLimit = node.timeLimit * 1000;
        }
        
        // Load challenge level
        await this._handleLevelNode(challengeNode);
    }

    /**
     * Handle boss-rush node
     * Sequential boss fights
     * @private
     */
    async _handleBossRushNode(node) {
        console.log('Starting boss rush:', node.name || node.id);
        
        // Boss rush loads multiple boss encounters in sequence
        const bossLevels = node.bossLevels || [];
        
        if (bossLevels.length === 0) {
            console.warn('Boss rush node has no boss levels');
            await this.continueFlow(node);
            return;
        }
        
        // Initialize boss rush state
        if (!this.globalFlags._bossRushActive) {
            this.globalFlags._bossRushActive = true;
            this.globalFlags._bossRushId = node.id;
            this.globalFlags._bossRushIndex = 0;
            this.globalFlags._bossRushTotal = bossLevels.length;
            this.globalFlags._bossRushStartTime = Date.now();
            
            // Optional: Health carries over between bosses or restore
            if (node.restoreHealthBetweenBosses) {
                this.globalFlags._bossRushRestoreHealth = true;
            }
        }
        
        const currentIndex = this.globalFlags._bossRushIndex || 0;
        
        if (currentIndex >= bossLevels.length) {
            // Boss rush complete!
            console.log('Boss rush completed!');
            
            // Calculate time taken
            const timeTaken = Date.now() - this.globalFlags._bossRushStartTime;
            const timeInSeconds = Math.floor(timeTaken / 1000);
            
            this._showNotification(`Boss Rush Complete! Time: ${timeInSeconds}s`);
            
            // Award boss rush rewards
            if (node.rushRewards) {
                for (const reward of node.rushRewards) {
                    await this._handleRewardNode(reward);
                }
            }
            
            // Clear boss rush state
            delete this.globalFlags._bossRushActive;
            delete this.globalFlags._bossRushId;
            delete this.globalFlags._bossRushIndex;
            delete this.globalFlags._bossRushTotal;
            delete this.globalFlags._bossRushStartTime;
            
            await this.continueFlow(node);
            return;
        }
        
        // Load current boss level
        const bossLevel = bossLevels[currentIndex];
        const bossNode = {
            id: `${node.id}_boss_${currentIndex}`,
            type: 'level',
            engineType: bossLevel.engineType || node.engineType || 'rpg-topdown',
            levelId: bossLevel.levelId,
            levelPath: bossLevel.levelPath,
            metadata: {
                name: bossLevel.name || `Boss ${currentIndex + 1}`,
                description: bossLevel.description || '',
                isBossRush: true,
                bossIndex: currentIndex,
                bossTotal: bossLevels.length
            },
            next: node.id // Loop back to boss-rush node to advance
        };
        
        this._showNotification(`Boss ${currentIndex + 1} of ${bossLevels.length}`);
        
        // Restore health if configured
        if (this.globalFlags._bossRushRestoreHealth && this.playerData) {
            this.playerData.hp = this.playerData.maxHp;
            this.playerData.mana = this.playerData.maxMana;
        }
        
        // Increment index for next boss
        this.globalFlags._bossRushIndex = currentIndex + 1;
        
        // Load boss level
        await this._handleLevelNode(bossNode);
    }

    /**
     * Handle exploration node
     * Open-world segment with optional objectives
     * @private
     */
    async _handleExplorationNode(node) {
        console.log('Starting exploration:', node.name || node.id);
        
        // Exploration mode allows free roaming
        const explorationNode = {
            ...node,
            type: 'level',
            engineType: node.engineType || 'rpg-topdown',
            levelId: node.levelId,
            levelPath: node.levelPath,
            metadata: {
                name: node.name || 'Exploration Area',
                description: node.description || 'Explore freely and discover secrets',
                isExploration: true,
                objectives: node.objectives || [],
                secrets: node.secrets || [],
                discoveryPoints: node.discoveryPoints || []
            }
        };
        
        // Set exploration flags
        this.globalFlags._explorationActive = true;
        this.globalFlags._explorationId = node.id;
        
        // Track discoveries
        if (!this.globalFlags._discoveries) {
            this.globalFlags._discoveries = {};
        }
        this.globalFlags._discoveries[node.id] = {
            started: Date.now(),
            found: [],
            objectives: []
        };
        
        // Exploration doesn't require completion - player can leave anytime
        if (node.allowEarlyExit) {
            this.globalFlags._explorationCanExit = true;
        }
        
        // Load exploration level
        await this._handleLevelNode(explorationNode);
    }

    /**
     * Continue flow to next node
     * @param {Object} node - Current node
     * @returns {Promise<void>}
     */
    async continueFlow(node) {
        if (node.next) {
            await this.processNode(node.next);
        } else {
            console.log('Campaign flow ended at node:', node.id);
            
            // Only end if not on a level node (levels are resting states)
            if (node.type !== 'level') {
                this._endCampaign();
            }
        }
    }

    /**
     * Advance to next node (called after level completion)
     */
    async advance() {
        console.log(`[CampaignController] Advancing from node: ${this.currentNodeId}`);
        const node = this.campaignData.find(n => n.id === this.currentNodeId);
        
        if (node) {
            console.log(`[CampaignController] Current node found: ${node.id}, Next: ${node.next}`);
            if (node.next) {
                await this.processNode(node.next);
            } else {
                console.log('[CampaignController] No next node defined. Campaign finished.');
                this._endCampaign();
            }
        } else {
            console.error(`[CampaignController] Current node ${this.currentNodeId} NOT found in campaign data!`);
            this._endCampaign();
        }
    }

    /**
     * Switch to different engine
     * @private
     * @param {string} newEngineType - Target engine type
     * @returns {Promise<void>}
     */
    async _switchEngine(newEngineType) {
        if (this.isTransitioning) {
            console.warn('Already transitioning engines');
            return;
        }

        this.isTransitioning = true;
        console.log(`Switching engine: ${this.currentEngineType} → ${newEngineType}`);

        try {
            // Save current state
            if (this.currentAdapter) {
                this.playerData = this.currentAdapter.getPlayerData();
                const engineState = this.currentAdapter.getState();
                
                // Merge engine-specific flags into global flags
                if (engineState.flags) {
                    this.globalFlags = { ...this.globalFlags, ...engineState.flags };
                }
                
                // Cleanup old engine
                await this.currentAdapter.unloadLevel();
                this.currentAdapter.destroy();
                this.currentAdapter = null;
            }

            // Show transition screen
            this._showTransitionScreen(newEngineType);

            // Dynamically load new engine scripts
            await this._loadEngineScripts(newEngineType);

            // Create new adapter
            let adapter;
            console.log(`[CampaignController] Creating adapter for: ${newEngineType}`);
            switch (newEngineType) {
                case 'rpg-topdown':
                    console.log('[CampaignController] Creating TopDownAdapter...');
                    adapter = new TopDownAdapter();
                    console.log('[CampaignController] TopDownAdapter created');
                    break;
                case 'iso-pixel':
                    adapter = new IsoPixelAdapter();
                    break;
                case 'platformer-2d':
                    adapter = new PlatformerAdapter();
                    break;
                case 'topdown-3d':
                    console.log('[CampaignController] Creating TopDown3DAdapter...');
                    adapter = new TopDown3DAdapter();
                    console.log('[CampaignController] TopDown3DAdapter created');
                    break;
                case 'fps-3d':
                    console.log('[CampaignController] Creating FPS3DAdapter...');
                    adapter = new FPS3DAdapter();
                    console.log('[CampaignController] FPS3DAdapter created');
                    break;
                case 'platformer-3d':
                    console.log('[CampaignController] Creating Platformer3DAdapter...');
                    adapter = new Platformer3DAdapter();
                    console.log('[CampaignController] Platformer3DAdapter created');
                    break;
                default:
                    throw new Error(`Unknown engine type: ${newEngineType}`);
            }

            // Link controller to adapter
            if (adapter.setCampaignController) {
                adapter.setCampaignController(this);
            }

            // Initialize new adapter
            console.log(`[CampaignController] Initializing ${newEngineType} adapter...`);
            await adapter.initialize();
            console.log(`[CampaignController] Adapter initialized`);
            
            // Restore player data
            if (this.playerData) {
                adapter.setPlayerData(this.playerData);
            }

            this.currentAdapter = adapter;
            this.currentEngineType = newEngineType;

            // Notify listeners
            if (this.onEngineSwitch) {
                this.onEngineSwitch(newEngineType);
            }

            console.log(`Engine switched to: ${newEngineType}`);
            
        } finally {
            this.isTransitioning = false;
        }
    }

    /**
     * Save campaign state to server
     * @returns {Promise<void>}
     */
    async saveCampaignState() {
        if (!this.username) return;

        // Use slot-based saving if slot ID is set
        if (this.slotId) {
            await this.saveToSlot();
            return;
        }

        // Legacy save method for backward compatibility
        const state = {
            campaignId: this.campaignId,
            currentNodeId: this.currentNodeId,
            completedNodes: Array.from(this.completedNodes),
            globalFlags: this.globalFlags,
            playerData: this.playerData,
            inventory: this.inventory,
            equippedAbilities: this.equippedAbilities,  // NEW: Save abilities
            questProgress: this.questProgress,
            achievements: this.achievements,
            currentEngineType: this.currentEngineType,
            savedAt: Date.now()
        };

        try {
            const response = await fetch(`/api/campaign-state/${this.username}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state)
            });

            if (!response.ok) {
                console.warn('Failed to save campaign state:', response.status);
            }
        } catch (error) {
            console.error('Error saving campaign state:', error);
        }
    }

    /**
     * Load campaign state from server
     * @returns {Promise<void>}
     */
    async loadCampaignState() {
        if (!this.username) return;

        // Use slot-based loading if slot ID is set
        if (this.slotId) {
            await this.loadFromSlot();
            return;
        }

        // Legacy load method for backward compatibility
        try {
            const response = await fetch(`/api/campaign-state/${this.username}`);
            if (!response.ok) {
                console.log('No saved campaign state found');
                return;
            }

            const state = await response.json();
            
            // Only restore if same campaign
            if (state.campaignId === this.campaignId) {
                this.currentNodeId = state.currentNodeId;
                this.completedNodes = new Set(state.completedNodes || []);
                this.globalFlags = state.globalFlags || {};
                this.playerData = state.playerData;
                this.inventory = state.inventory || [];
                this.equippedAbilities = state.equippedAbilities || AbilityDefinitions.getStarterAbilities();  // NEW: Load abilities
                this.questProgress = state.questProgress || {};
                this.achievements = state.achievements || [];
                this.currentEngineType = state.currentEngineType;
                
                console.log('Campaign state restored from save');
                console.log('[CampaignController] Loaded equipped abilities:', this.equippedAbilities);
            }
        } catch (error) {
            console.error('Error loading campaign state:', error);
        }
    }

    /**
     * Get campaign progress
     * @returns {Object}
     */
    getProgress() {
        const totalNodes = Array.isArray(this.campaignData)
            ? this.campaignData.length
            : (Array.isArray(this.campaignData?.nodes) ? this.campaignData.nodes.length : 0);
        const completedNodes = this.completedNodes.size;
        return {
            totalNodes,
            completedNodes,
            currentNode: this.currentNodeId,
            percentComplete: totalNodes > 0
                ? Math.round((completedNodes / totalNodes) * 100)
                : 0
        };
    }

    /**
     * End campaign
     * @private
     */
    _endCampaign() {
        console.log('Campaign complete!');
        
        if (this.onCampaignComplete) {
            this.onCampaignComplete({
                campaignId: this.campaignId,
                completedNodes: this.completedNodes.size,
                totalNodes: this.campaignData.length,
                finalPlayerData: this.playerData
            });
        }
        
        this._showCompletionScreen();
    }

    /**
     * UI helper methods (to be implemented by specific platform)
     */
    _showTransitionScreen(engineType) {
        const screen = document.getElementById('engine-transition-screen');
        const targetText = document.getElementById('transition-target-engine');
        const progressBar = document.getElementById('transition-progress-bar');
        const statusText = document.getElementById('transition-status-text');
        
        if (!screen) {
            console.log(`[UI] Transitioning to ${engineType}...`);
            return;
        }
        
        // Engine name mapping
        const engineNames = {
            'rpg-topdown': 'RPG Top-Down Engine',
            'iso-pixel': 'Isometric Pixel Engine',
            'platformer-2d': 'Platformer 2D Engine',
            'topdown-3d': 'Top-Down 3D Engine',
            'fps-3d': 'FPS 3D Engine',
            'platformer-3d': 'Platformer 3D Engine'
        };
        
        if (targetText) targetText.innerText = engineNames[engineType] || engineType;
        if (progressBar) progressBar.style.width = '0%';
        if (statusText) statusText.innerText = 'Preparing transition...';
        
        // Show screen
        screen.classList.remove('hidden');
        
        // Simulate progress
        setTimeout(() => {
            if (progressBar) progressBar.style.width = '30%';
            if (statusText) statusText.innerText = 'Saving current state...';
        }, 200);
        
        setTimeout(() => {
            if (progressBar) progressBar.style.width = '60%';
            if (statusText) statusText.innerText = 'Loading new engine...';
        }, 600);
        
        setTimeout(() => {
            if (progressBar) progressBar.style.width = '90%';
            if (statusText) statusText.innerText = 'Initializing...';
        }, 1200);
        
        // Hide after engine loads
        setTimeout(() => {
            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.innerText = 'Ready!';
            setTimeout(() => {
                screen.classList.add('hidden');
            }, 500);
        }, 2000);
    }

    _showDialogue(text, callback) {
        console.log(`[UI] Dialogue: ${text}`);
        // Override or implement with actual dialogue system
        setTimeout(callback, 1000);
    }

    _playCutscene(cutsceneId, callback) {
        console.log(`[UI] Playing cutscene: ${cutsceneId}`);
        // Override or implement with actual cutscene system
        setTimeout(callback, 1000);
    }

    _showNotification(message) {
        console.log(`[UI] Notification: ${message}`);
        // Override or implement with actual notification system
    }

    _showError(message) {
        console.error(`[UI] Error: ${message}`);
        // Override or implement with actual error display
    }

    _showCompletionScreen() {
        console.log('[UI] Campaign Complete!');
        
        // Create completion overlay
        const overlay = document.createElement('div');
        overlay.id = 'campaign-completion-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
            z-index: 10001;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-family: 'VT323', monospace;
            animation: fadeIn 1s;
        `;
        
        // Victory banner
        const banner = document.createElement('div');
        banner.style.cssText = 'font-size: 72px; color: #f1c40f; margin-bottom: 30px; text-shadow: 4px 4px #000; animation: pulse 2s infinite;';
        banner.innerHTML = '🏆 CAMPAIGN COMPLETE! 🏆';
        overlay.appendChild(banner);
        
        // Campaign name
        const campaignName = document.createElement('h2');
        campaignName.innerText = this.campaignMetadata?.name || 'Unnamed Campaign';
        campaignName.style.cssText = 'font-size: 48px; color: #3498db; margin-bottom: 40px; text-shadow: 2px 2px #000;';
        overlay.appendChild(campaignName);
        
        // Statistics
        const stats = document.createElement('div');
        stats.style.cssText = 'font-size: 28px; text-align: center; margin-bottom: 40px; line-height: 1.8;';
        const totalNodes = Array.isArray(this.campaignData)
            ? this.campaignData.length
            : (Array.isArray(this.campaignData?.nodes) ? this.campaignData.nodes.length : 0);
        const completedCount = this.completedNodes.size;
        const completionRate = totalNodes > 0 ? Math.floor((completedCount / totalNodes) * 100) : 0;
        const achievementsUnlocked = Array.isArray(this.achievements)
            ? this.achievements.length
            : (this.achievements?.size ?? 0);
        
        stats.innerHTML = `
            <div style="color: #2ecc71;">✓ Nodes Completed: ${completedCount}/${totalNodes} (${completionRate}%)</div>
            <div style="color: #e67e22;">★ Achievements Unlocked: ${achievementsUnlocked}</div>
            <div style="color: #9b59b6;">⚑ Flags Set: ${Object.keys(this.globalFlags).filter(k => this.globalFlags[k]).length}</div>
        `;
        overlay.appendChild(stats);
        
        // Thank you message
        const thankYou = document.createElement('div');
        thankYou.innerText = 'Thank you for playing!';
        thankYou.style.cssText = 'font-size: 32px; color: #ecf0f1; margin-bottom: 50px; font-style: italic;';
        overlay.appendChild(thankYou);
        
        // Buttons container
        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.cssText = 'display: flex; gap: 20px;';
        
        // Return to launcher button
        const returnBtn = document.createElement('button');
        returnBtn.innerText = 'RETURN TO LAUNCHER';
        returnBtn.style.cssText = `
            background: #3498db;
            color: #fff;
            border: none;
            padding: 20px 40px;
            font-size: 28px;
            font-family: 'VT323', monospace;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.3s;
        `;
        returnBtn.onmouseover = () => returnBtn.style.background = '#2980b9';
        returnBtn.onmouseout = () => returnBtn.style.background = '#3498db';
        returnBtn.onclick = async () => {
            // If using slot system, update slot as complete
            if (this.slotId) {
                try {
                    const slot = await SlotManager.getSlot(this.slotId);
                    slot.campaign.completionPercent = 100;
                    slot.metadata.lastPlayed = new Date().toISOString();
                    await SlotManager.saveSlot(this.slotId, slot);
                } catch (error) {
                    console.error('Failed to update slot completion:', error);
                }
                window.location.href = 'slot_selection.html';
            } else {
                window.location.href = 'campaign_launcher.html';
            }
        };
        buttonsDiv.appendChild(returnBtn);
        
        // Main menu button
        const mainMenuBtn = document.createElement('button');
        mainMenuBtn.innerText = 'MAIN MENU';
        mainMenuBtn.style.cssText = `
            background: #95a5a6;
            color: #fff;
            border: none;
            padding: 20px 40px;
            font-size: 28px;
            font-family: 'VT323', monospace;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.3s;
        `;
        mainMenuBtn.onmouseover = () => mainMenuBtn.style.background = '#7f8c8d';
        mainMenuBtn.onmouseout = () => mainMenuBtn.style.background = '#95a5a6';
        mainMenuBtn.onclick = () => {
            window.location.href = 'launcher.html';
        };
        buttonsDiv.appendChild(mainMenuBtn);
        
        overlay.appendChild(buttonsDiv);
        
        document.body.appendChild(overlay);
    }

    /**
     * Cleanup and destroy controller
     */
    destroy() {
        // Stop play time tracking
        if (this.playTimeStart) {
            this._updatePlayTime();
        }
        
        if (this.currentAdapter) {
            this.currentAdapter.destroy();
            this.currentAdapter = null;
        }
        
        this.campaignData = [];
        this.currentNodeId = null;
        this.globalFlags = {};
        this.playerData = null;
        this.completedNodes.clear();
    }

    /**
     * Save campaign state to slot
     * @returns {Promise<void>}
     */
    async saveToSlot() {
        if (!this.slotId) {
            console.warn('No slot ID set, cannot save to slot');
            return;
        }

        try {
            // Update play time before saving
            this._updatePlayTime();

            // Get or create slot
            let slot = await SlotManager.getSlot(this.slotId);
            
            if (!slot) {
                // Create new slot
                slot = new CampaignSlot(this.slotId);
                await slot.load(
                    this.campaignId,
                    this.campaignMetadata.name || this.campaignId,
                    this.username || 'Player'
                );
            }

            // Update campaign data
            slot.campaign.currentNode = this.currentNodeId;
            slot.campaign.completedNodes = Array.from(this.completedNodes);
            slot.campaign.globalFlags = this.globalFlags;
            slot.campaign.totalNodes = this.campaignData.length;

            // Calculate completion
            const completionPercent = this.getProgress().percentComplete;
            slot.campaign.completionPercent = completionPercent;

            // Update player data
            if (this.playerData) {
                slot.player = {
                    ...slot.player,
                    stats: this.playerData,
                    inventory: this.inventory,
                    equippedAbilities: this.equippedAbilities,  // NEW: Save abilities
                    quests: this.questProgress,
                    achievements: this.achievements
                };
            }

            // Save inventory system state
            if (this.inventorySystem) {
                if (!slot.player) slot.player = {};
                slot.player.inventoryData = {
                    items: this.inventorySystem.serialize(),
                    hotbar: this.inventorySystem.hotbarSlots,
                    filter: this.inventorySystem.currentFilter,
                    maxSlots: this.inventorySystem.maxSlots
                };
                console.log('[CampaignController] Saved inventory with', 
                    this.inventorySystem.getItemCount(), 'items');
            }

            // Update progress
            slot.updateProgress(
                this.currentNodeId,
                Array.from(this.completedNodes),
                this.globalFlags
            );

            // Update metadata
            slot.metadata.lastPlayed = new Date().toISOString();
            slot.metadata.playTime = this.totalPlayTime;
            slot.metadata.saves += 1;

            // Save to server
            await SlotManager.saveSlot(slot);
            
            console.log(`[CampaignController] Saved to slot ${this.slotId}`);
            this._showNotification(`Progress saved to Slot ${this.slotId}`);
            
        } catch (error) {
            console.error('[CampaignController] Failed to save to slot:', error);
            this._showError('Failed to save progress');
        }
    }

    /**
     * Load campaign state from slot
     * @returns {Promise<void>}
     */
    async loadFromSlot() {
        if (!this.slotId) {
            console.warn('No slot ID set, cannot load from slot');
            return;
        }

        try {
            const slot = await SlotManager.getSlot(this.slotId);
            
            if (!slot || slot.isEmpty) {
                console.log(`[CampaignController] Slot ${this.slotId} is empty, starting fresh`);
                return;
            }

            // Only restore if same campaign
            if (slot.campaign.name !== this.campaignId && slot.campaign.file !== this.campaignId) {
                console.warn('Slot contains different campaign, starting fresh');
                return;
            }

            // Restore campaign state
            this.currentNodeId = slot.campaign.currentNode;
            this.completedNodes = new Set(slot.campaign.completedNodes || []);
            this.globalFlags = slot.campaign.globalFlags || {};

            // Restore player data
            if (slot.player) {
                this.playerData = slot.player.stats;
                this.inventory = slot.player.inventory || [];
                this.equippedAbilities = slot.player.equippedAbilities || AbilityDefinitions.getStarterAbilities();  // NEW: Load abilities
                this.questProgress = slot.player.quests || {};
                this.achievements = slot.player.achievements || [];

                // Restore inventory system state
                if (slot.player.inventoryData && this.inventorySystem) {
                    if (slot.player.inventoryData.items) {
                        this.inventorySystem.deserialize(slot.player.inventoryData.items);
                        console.log('[CampaignController] Restored', 
                            this.inventorySystem.getItemCount(), 'items from save');
                    }
                    if (slot.player.inventoryData.hotbar) {
                        this.inventorySystem.hotbarSlots = slot.player.inventoryData.hotbar;
                        console.log('[CampaignController] Restored hotbar assignments');
                    }
                    if (slot.player.inventoryData.filter) {
                        this.inventorySystem.currentFilter = slot.player.inventoryData.filter;
                    }
                }
                
                console.log('[CampaignController] Loaded equipped abilities:', this.equippedAbilities);
            }

            // Restore play time
            this.totalPlayTime = slot.metadata.playTime || 0;
            this.playTimeStart = Date.now();

            console.log(`[CampaignController] Loaded from slot ${this.slotId}`);
            this._showNotification(`Loaded Slot ${this.slotId}`);
            
        } catch (error) {
            console.error('[CampaignController] Failed to load from slot:', error);
            this._showError('Failed to load progress');
        }
    }

    /**
     * Update play time (called internally)
     * @private
     */
    _updatePlayTime() {
        if (this.playTimeStart) {
            const elapsed = Math.floor((Date.now() - this.playTimeStart) / 1000);
            this.totalPlayTime += elapsed;
            this.playTimeStart = Date.now(); // Reset start time
        }
    }

    /**
     * Get current play time in seconds
     * @returns {number}
     */
    getPlayTime() {
        let currentTime = this.totalPlayTime;
        if (this.playTimeStart) {
            currentTime += Math.floor((Date.now() - this.playTimeStart) / 1000);
        }
        return currentTime;
    }

    /**
     * Format play time as human-readable string
     * @returns {string}
     */
    getPlayTimeFormatted() {
        const totalSeconds = this.getPlayTime();
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Manual save - called by user action
     * @returns {Promise<void>}
     */
    async manualSave() {
        console.log('[CampaignController] Manual save triggered');
        
        // Update player data from adapter
        if (this.currentAdapter) {
            this.playerData = this.currentAdapter.getPlayerData();
        }
        
        await this.saveCampaignState();
        this._showNotification('Game Saved!');
    }

    /**
     * Auto-save - called periodically
     * @returns {Promise<void>}
     */
    async autoSave() {
        console.log('[CampaignController] Auto-save triggered');
        
        // Update player data from adapter
        if (this.currentAdapter) {
            this.playerData = this.currentAdapter.getPlayerData();
        }
        
        await this.saveCampaignState();
        // Silent auto-save, no notification
    }

    /**
     * Inventory Management Methods
     */

    /**
     * Add item to inventory
     * @param {Object} itemData - Item definition
     * @param {number} quantity - Amount to add
     * @returns {boolean}
     */
    addItemToInventory(itemData, quantity = 1) {
        const success = this.inventorySystem.addItem(itemData, quantity);
        if (success) {
            // Sync with current adapter
            if (this.currentAdapter && this.currentAdapter.addItem) {
                this.currentAdapter.addItem(itemData, quantity);
            }
        }
        return success;
    }

    /**
     * Remove item from inventory
     * @param {string} itemId - Item ID
     * @param {number} quantity - Amount to remove
     * @returns {boolean}
     */
    removeItemFromInventory(itemId, quantity = 1) {
        const success = this.inventorySystem.removeItem(itemId, quantity);
        if (success) {
            // Sync with current adapter
            if (this.currentAdapter && this.currentAdapter.removeItem) {
                this.currentAdapter.removeItem(itemId, quantity);
            }
        }
        return success;
    }

    /**
     * Get inventory items
     * @param {string} filterType - Optional filter
     * @returns {Array}
     */
    getInventoryItems(filterType = 'all') {
        return this.inventorySystem.getItems(filterType);
    }

    /**
     * Use item from inventory
     * @param {string} itemId - Item ID
     * @returns {boolean}
     */
    useInventoryItem(itemId) {
        return this.inventorySystem.useItem(itemId, (item) => {
            // Apply item effects through adapter
            if (this.currentAdapter && this.currentAdapter.applyItemEffect) {
                this.currentAdapter.applyItemEffect(item);
            }
        });
    }

    /**
     * Drop item from inventory
     * @param {string} itemId - Item ID
     * @param {number} quantity - Amount to drop
     * @returns {boolean}
     */
    dropInventoryItem(itemId, quantity = 1) {
        return this.inventorySystem.dropItem(itemId, quantity);
    }

    /**
     * Sync inventory with current engine
     */
    syncInventory() {
        if (this.currentAdapter && this.currentAdapter.getInventory) {
            const engineInventory = this.currentAdapter.getInventory();
            // TODO: Implement proper sync logic
            console.log('[CampaignController] Syncing inventory with engine');
        }
    }

    /**
     * Item Management Helpers (using ItemDefinitions)
     */

    /**
     * Give item to player by ID (from ItemDefinitions)
     * @param {string} itemId - Item definition ID
     * @param {number} quantity - Amount to give
     * @returns {boolean} Success
     */
    giveItem(itemId, quantity = 1) {
        if (!window.ItemDefinitions) {
            console.error('[CampaignController] ItemDefinitions not loaded');
            return false;
        }
        
        const item = window.ItemDefinitions.createInstance(itemId, quantity);
        if (!item) {
            console.error(`[CampaignController] Item not found: ${itemId}`);
            return false;
        }
        
        const success = this.inventorySystem.addItem(item, quantity);
        if (success) {
            console.log(`[CampaignController] Gave ${quantity}x ${item.name}`);
        }
        return success;
    }

    /**
     * Give multiple items from an array
     * @param {Array} itemList - Array of {id, quantity} objects
     * @example giveItems([{id: 'health_potion', quantity: 5}, {id: 'iron_sword', quantity: 1}])
     */
    giveItems(itemList) {
        itemList.forEach(({id, quantity}) => {
            this.giveItem(id, quantity || 1);
        });
    }

    /**
     * Remove item by definition ID
     * @param {string} itemId - Item ID
     * @param {number} quantity - Amount to remove
     * @returns {boolean} Success
     */
    removeItemById(itemId, quantity = 1) {
        return this.inventorySystem.removeItem(itemId, quantity);
    }

    /**
     * Check if player has item
     * @param {string} itemId - Item ID
     * @param {number} minQuantity - Minimum quantity
     * @returns {boolean}
     */
    hasItem(itemId, minQuantity = 1) {
        const item = this.inventorySystem.getItem(itemId);
        return item && item.quantity >= minQuantity;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CampaignController;
}
