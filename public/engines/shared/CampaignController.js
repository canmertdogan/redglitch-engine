/**
 * CampaignController - Multi-Engine Campaign Orchestrator
 * 
 * Manages campaign flow across different engine types (rpg-topdown, iso-pixel, platformer-2d, etc.)
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
        this.variables = {}; 
        this.playerData = null;
        this.inventorySystem = new window.InventorySystem(); 
        this.questProgress = {};
        this.achievements = [];
        
        // Ability system
        this.equippedAbilities = [null, null, null, null];
        
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

        // Engine Manifests
        this.engineManifests = {
            'rpg-topdown': [
                'strategies/TopDownStrategy.js',
                'engines/rpg-topdown/localization.js',
                'engines/rpg-topdown/sprites.js',
                'engines/rpg-topdown/input.js',
                'engines/rpg-topdown/saveSystem.js',
                'engines/rpg-topdown/mapSystem.js',
                'engines/rpg-topdown/achievementSystem.js',
                'engines/rpg-topdown/fxSystem.js',
                'engines/rpg-topdown/audioSystem.js',
                'engines/rpg-topdown/console.js',
                'engines/rpg-topdown/postProcess.js',
                'engines/rpg-topdown/logicRuntime.js',
                'engines/rpg-topdown/BrainRuntime.js',
                'engines/rpg-topdown/AlgorithmRuntime.js',
                'engines/rpg-topdown/NPC.js',
                'engines/rpg-topdown/InteractiveCutsceneEngine.js',
                'engines/rpg-topdown/campaignSystem.js',
                'engines/rpg-topdown/spatialHash.js',
                'engines/rpg-topdown/stateMachine.js',
                'engines/rpg-topdown/main.js'
            ],
            'iso-pixel': [
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
                'engines/topdown-3d/TopDown3DAdapter.js'
            ],
            'fps-3d': [
                'engines/shared/Engine3DBase.js',
                'engines/shared/Engine3DAdapter.js',
                'engines/fps-3d/FPS3DAdapter.js'
            ],
            'platformer-3d': [
                'engines/shared/Engine3DBase.js',
                'engines/shared/Engine3DAdapter.js',
                'engines/platformer-3d/Platformer3DAdapter.js'
            ]
        };
        this.loadedEngines = new Set();
        
        this.slotId = null;
        this.playTimeStart = null;
        this.totalPlayTime = 0; 
        this._activeProjectName = null;
        this._activeProjectNameResolved = false;
    }

    setVariable(key, value) {
        this.variables[key] = value;
        console.log(`[Campaign] Variable set: ${key} = ${value}`);
    }

    getVariable(key) {
        return this.variables[key] || 0;
    }

    incrementVariable(key, amount = 1) {
        this.setVariable(key, this.getVariable(key) + amount);
    }

    checkCondition(condition) {
        if (!window.ConditionEvaluator) return true;
        const context = {
            variables: this.variables,
            flags: this.globalFlags,
            hasItem: (itemId, count) => this.inventorySystem.hasItem(itemId, count)
        };
        return window.ConditionEvaluator.evaluate(condition, context);
    }

    async initialize(username, slotId = null) {
        this.username = username;
        this.slotId = slotId;
        
        if (window.AbilityDefinitions && (!this.equippedAbilities || this.equippedAbilities.every(a => a === null))) {
            this.equippedAbilities = AbilityDefinitions.getStarterAbilities();
        }
        
        if (slotId) {
            this.playTimeStart = Date.now();
        }
    }

    async loadCampaign(campaignId, campaignPath = null) {
        this.campaignId = campaignId;
        const path = campaignPath || `/api/campaigns/${campaignId}`;
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.campaignData = data.nodes || data;
            this.campaignMetadata = data.nodes ? { name: data.name, description: data.description, project: data.project } : {};
            
            if (this.slotId) await this.loadFromSlot();
            else await this.loadCampaignState();
        } catch (error) {
            console.error('Failed to load campaign:', error);
            throw error;
        }
    }

    async start() {
        if (!this.campaignData || this.campaignData.length === 0) return;
        if (this.currentNodeId) {
            await this.processNode(this.currentNodeId);
            return;
        }
        let startNode = this.campaignData.find(n => n.type === 'start');
        if (!startNode) startNode = this.campaignData[0];
        if (startNode) await this.processNode(startNode.id);
    }

    async processNode(nodeId) {
        const node = this.campaignData.find(n => n.id === nodeId);
        if (!node) return;
        this.currentNodeId = nodeId;
        this.completedNodes.add(nodeId);
        if (this.onNodeChange) this.onNodeChange(node);
        await this.saveCampaignState();

        switch (node.type) {
            case 'start': await this.continueFlow(node); break;
            case 'level': await this._handleLevelNode(node); break;
            case 'branch':
            case 'if-statement': await this._handleBranchNode(node); break;
            case 'reward': await this._handleRewardNode(node); break;
            case 'variable': await this._handleVariableNode(node); break;
            case 'dialogue': await this._handleDialogueNode(node); break;
            case 'cutscene': await this._handleCutsceneNode(node); break;
            case 'wait': await this._handleWaitNode(node); break;
            default: await this.continueFlow(node); break;
        }
    }

    async _handleLevelNode(node) {
        const engineType = node.engineType || 'rpg-topdown';
        const levelId = node.levelId || node.id;
        const levelPath = node.levelPath || null;
        let projectName = node.projectName || node.project || this.campaignMetadata?.project || null;

        if (!projectName && !levelPath && this._is3DEngine(engineType)) {
            projectName = await this._resolveActiveProjectName();
        }

        try {
            if (this.currentEngineType !== engineType) {
                await this._switchEngine(engineType);
            }

            if (this.currentAdapter) {
                if (projectName && typeof this.currentAdapter.setProject === 'function') {
                    this.currentAdapter.setProject(projectName);
                }
                this.currentAdapter.onLevelComplete((data) => {
                    this.playerData = this.currentAdapter.getPlayerData();
                    this.advance();
                });
                await this.currentAdapter.loadLevel(levelId, levelPath);
                this.currentAdapter.start();
            }
        } catch (error) {
            console.error('Failed to load level:', error);
        }
    }

    _is3DEngine(type) {
        return ['topdown-3d', 'fps-3d', 'platformer-3d'].includes(type);
    }

    async _resolveActiveProjectName() {
        if (this._activeProjectNameResolved) return this._activeProjectName;
        this._activeProjectNameResolved = true;
        try {
            const res = await fetch('/api/projects/current');
            if (!res.ok) return null;
            const data = await res.json();
            this._activeProjectName = (data?.name && data.name !== 'ROOT') ? data.name : null;
            return this._activeProjectName;
        } catch (e) { return null; }
    }

    async _loadEngineScripts(engineType) {
        if (this.loadedEngines.has(engineType)) return;
        const scripts = this.engineManifests[engineType];
        if (!scripts) return;
        for (const src of scripts) {
            await new Promise((resolve) => {
                const script = document.createElement('script');
                // Add version/cache bust
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
        this.loadedEngines.add(engineType);
    }

    async _switchEngine(newEngineType) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        try {
            if (this.currentAdapter) {
                this.playerData = this.currentAdapter.getPlayerData();
                await this.currentAdapter.unloadLevel();
                this.currentAdapter.destroy();
                this.currentAdapter = null;
            }
            this._showTransitionScreen(newEngineType);
            await this._loadEngineScripts(newEngineType);

            let adapter;
            switch (newEngineType) {
                case 'rpg-topdown': adapter = new TopDownAdapter(); break;
                case 'iso-pixel': adapter = new IsoPixelAdapter(); break;
                case 'platformer-2d': adapter = new PlatformerAdapter(); break;
                case 'topdown-3d': adapter = new TopDown3DAdapter(); break;
                case 'fps-3d': adapter = new FPS3DAdapter(); break;
                case 'platformer-3d': adapter = new Platformer3DAdapter(); break;
                default: throw new Error(`Unknown engine: ${newEngineType}`);
            }

            if (adapter.setCampaignController) adapter.setCampaignController(this);
            await adapter.initialize();
            if (this.playerData) adapter.setPlayerData(this.playerData);
            this.currentAdapter = adapter;
            this.currentEngineType = newEngineType;
            if (this.onEngineSwitch) this.onEngineSwitch(newEngineType);
        } finally {
            this.isTransitioning = false;
        }
    }

    async advance() {
        const node = this.campaignData.find(n => n.id === this.currentNodeId);
        if (node && node.next) await this.processNode(node.next);
        else this._endCampaign();
    }

    async continueFlow(node) {
        if (node.next) await this.processNode(node.next);
        else if (node.type !== 'level') this._endCampaign();
    }

    async _handleBranchNode(node) {
        const value = this.globalFlags[node.condition || node.flag] || false;
        if (value && node.nextTrue) await this.processNode(node.nextTrue);
        else if (!value && node.nextFalse) await this.processNode(node.nextFalse);
        else await this.continueFlow(node);
    }

    async _handleRewardNode(node) {
        if (node.itemId) this.inventorySystem.addItem({ id: node.itemId });
        if (node.gold && this.playerData) this.playerData.gold = (this.playerData.gold || 0) + node.gold;
        await this.continueFlow(node);
    }

    async _handleVariableNode(node) {
        const flag = node.flag || node.variable;
        this.globalFlags[flag] = (node.value === 'true' || node.value === true);
        await this.continueFlow(node);
    }

    async _handleDialogueNode(node) {
        setTimeout(() => this.continueFlow(node), 1000);
    }

    async _handleCutsceneNode(node) {
        setTimeout(() => this.continueFlow(node), 1000);
    }

    async _handleWaitNode(node) {
        setTimeout(() => this.continueFlow(node), (node.duration || 1) * 1000);
    }

    async saveCampaignState() {
        if (!this.username) return;
        if (this.slotId) return await this.saveToSlot();
        const state = { campaignId: this.campaignId, currentNodeId: this.currentNodeId, completedNodes: Array.from(this.completedNodes), globalFlags: this.globalFlags, playerData: this.playerData };
        try {
            await fetch(`/api/campaign-state/${this.username}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
        } catch (e) {}
    }

    async loadCampaignState() {
        if (!this.username) return;
        if (this.slotId) return await this.loadFromSlot();
        try {
            const res = await fetch(`/api/campaign-state/${this.username}`);
            if (res.ok) {
                const state = await res.json();
                if (state.campaignId === this.campaignId) {
                    this.currentNodeId = state.currentNodeId;
                    this.completedNodes = new Set(state.completedNodes || []);
                    this.globalFlags = state.globalFlags || {};
                    this.playerData = state.playerData;
                }
            }
        } catch (e) {}
    }

    async saveToSlot() {
        if (!this.slotId) return;
        const slot = await SlotManager.getSlot(this.slotId);
        if (!slot) return;
        slot.campaign.currentNode = this.currentNodeId;
        slot.campaign.completedNodes = Array.from(this.completedNodes);
        slot.campaign.globalFlags = this.globalFlags;
        slot.player.stats = this.playerData;
        if (this.inventorySystem) {
            slot.player.inventoryData = { items: this.inventorySystem.serialize(), hotbar: this.inventorySystem.hotbarSlots };
        }
        await SlotManager.saveSlot(slot);
    }

    async loadFromSlot() {
        const slot = await SlotManager.getSlot(this.slotId);
        if (!slot || slot.isEmpty) return;
        this.currentNodeId = slot.campaign.currentNode;
        this.completedNodes = new Set(slot.campaign.completedNodes || []);
        this.globalFlags = slot.campaign.globalFlags || {};
        this.playerData = slot.player.stats;
        if (slot.player.inventoryData && this.inventorySystem) {
            if (slot.player.inventoryData.items) this.inventorySystem.deserialize(slot.player.inventoryData.items);
            if (slot.player.inventoryData.hotbar) this.inventorySystem.hotbarSlots = slot.player.inventoryData.hotbar;
        }
    }

    _endCampaign() {
        this._showCompletionScreen();
    }

    _showTransitionScreen(type) {
        const el = document.getElementById('engine-transition-screen');
        if (el) el.classList.remove('hidden');
        setTimeout(() => el && el.classList.add('hidden'), 2000);
    }

    _showCompletionScreen() {
        alert('Campaign Complete!');
    }

    async manualSave() {
        if (this.currentAdapter) this.playerData = this.currentAdapter.getPlayerData();
        await this.saveCampaignState();
    }

    async autoSave() {
        if (this.currentAdapter) this.playerData = this.currentAdapter.getPlayerData();
        await this.saveCampaignState();
    }

    giveItem(id, qty = 1) { return this.inventorySystem.addItem({id}, qty); }
    hasItem(id, qty = 1) { return this.inventorySystem.hasItem(id, qty); }
    useInventoryItem(itemId) {
        return this.inventorySystem.useItem(itemId, (item) => {
            if (this.currentAdapter && this.currentAdapter.applyItemEffect) this.currentAdapter.applyItemEffect(item);
        });
    }
    dropInventoryItem(itemId, quantity = 1) { return this.inventorySystem.removeItem(itemId, quantity); }
    getProgress() {
        const total = this.campaignData.length || 1;
        return { percentComplete: Math.round((this.completedNodes.size / total) * 100) };
    }
    getPlayTimeFormatted() {
        const total = Math.floor((Date.now() - (this.playTimeStart || Date.now())) / 1000) + (this.totalPlayTime || 0);
        return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
    }
    destroy() {
        if (this.currentAdapter) this.currentAdapter.destroy();
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = CampaignController;
if (typeof window !== 'undefined') window.CampaignController = CampaignController;
