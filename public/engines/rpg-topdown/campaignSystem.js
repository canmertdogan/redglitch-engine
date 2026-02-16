window.CampaignSystem = class CampaignSystem {
    constructor(game) {
        this.game = game;
        this.data = [];
        this.currentNodeId = null;
        
        // Multi-engine support: Use CampaignController if available
        this.useController = false;
        this.controller = null;
    }

    init(campaignData) {
        this.data = campaignData || [];
        
        // Check if running in multi-engine mode
        if (typeof CampaignController !== 'undefined' && this._isMultiEngineCampaign(campaignData)) {
            console.log('[CampaignSystem] Multi-engine campaign detected, using CampaignController');
            this.useController = true;
            this._initController();
        }
    }
    
    /**
     * Check if campaign contains multiple engine types
     * @private
     */
    _isMultiEngineCampaign(campaignData) {
        if (!campaignData || !Array.isArray(campaignData)) return false;
        
        const engineTypes = new Set();
        campaignData.forEach(node => {
            if (node.type === 'level' && node.engineType) {
                engineTypes.add(node.engineType);
            }
        });
        
        // Multi-engine if more than one type or explicitly set to non-topdown
        return engineTypes.size > 1 || 
               (engineTypes.size === 1 && !engineTypes.has('rpg-topdown'));
    }
    
    /**
     * Initialize CampaignController for multi-engine campaigns
     * @private
     */
    async _initController() {
        this.controller = new CampaignController();
        
        // Get username from game
        const username = this.game.currentUser || this.game.username || 'player';
        await this.controller.initialize(username);
        
        // Load campaign data
        this.controller.campaignData = this.data;
        
        // Bridge callbacks to game
        this.controller.onCampaignComplete = (data) => {
            console.log('[Campaign] Complete!', data);
            this.game.showVoidScreen('CAMPAIGN COMPLETE');
        };
        
        // Override UI methods to use game systems
        this.controller._showDialogue = (text, callback) => {
            if (this.game.dialogueSystem) {
                const tempId = `_campaign_dlg_${Date.now()}`;
                this.game.dialogueSystem.db.conversations.push({
                    id: tempId,
                    nodes: [{ speaker: "system", text }]
                });
                this.game.dialogueSystem.start(tempId, () => {
                    this.game.dialogueSystem.db.conversations = 
                        this.game.dialogueSystem.db.conversations.filter(c => c.id !== tempId);
                    callback();
                });
            } else {
                callback();
            }
        };
        
        this.controller._playCutscene = (cutsceneId, callback) => {
            if (this.game.dialogueSystem) {
                this.game.dialogueSystem.start(cutsceneId, callback);
            } else {
                callback();
            }
        };
        
        this.controller._showNotification = (message) => {
            if (this.game.log) {
                this.game.log(message, 'success');
            }
        };
        
        this.controller._showTransitionScreen = (engineType) => {
            console.log(`[Transition] Loading ${engineType} engine...`);
            // Could show custom transition UI here
        };
    }

    async start() {
        if (!this.data || this.data.length === 0) return;
        
        // Delegate to CampaignController if multi-engine
        if (this.useController && this.controller) {
            await this.controller.start();
            return;
        }
        
        // Original single-engine logic
        // 1. Try to find a specific 'start' node
        let startNode = this.data.find(n => n.type === 'start');
        
        // 2. If no start node, find the first node that is NOT a target of any other node
        if (!startNode) {
            const targets = new Set();
            this.data.forEach(n => {
                if (n.next) targets.add(n.next);
                if (n.nextTrue) targets.add(n.nextTrue);
                if (n.nextFalse) targets.add(n.nextFalse);
            });
            startNode = this.data.find(n => !targets.has(n.id));
        }

        // 3. Fallback to first element
        if (!startNode) startNode = this.data[0];

        if (startNode) {
            console.log("Campaign starting at:", startNode.id);
            this.processNode(startNode.id);
        }
    }

    async processNode(nodeId) {
        const node = this.data.find(n => n.id === nodeId);
        if (!node) {
            console.warn("Campaign node not found:", nodeId);
            return;
        }

        this.currentNodeId = nodeId;
        // console.log("Processing Campaign Node:", node.type, node.id);

        switch (node.type) {
            case 'start':
                this.processNode(node.next);
                break;

            case 'level':
                // The game stops here and plays the level. 
                // It waits for mapExit -> advance()
                if (this.game.loadLevel) {
                    const levelId = node.levelId || node.id;
                    try {
                        await this.game.loadLevel(levelId);
                        this.game.log(`Entered Level: ${levelId}`, 'info');
                    } catch (e) {
                        console.error("Failed to load level:", levelId, e);
                        this.game.showVoidScreen(`Error loading level: ${levelId}`);
                    }
                }
                break;

            case 'branch':
                const condition = node.condition; 
                // Check flags
                const val = this.game.flags ? this.game.flags[condition] : false;
                console.log(`Branch Check [${condition}]:`, val);
                
                if (val) {
                    if (node.nextTrue) this.processNode(node.nextTrue);
                    else console.warn("Branch TRUE path missing");
                } else {
                    if (node.nextFalse) this.processNode(node.nextFalse);
                    else console.warn("Branch FALSE path missing");
                }
                break;

            case 'reward':
                if (node.itemId) {
                    const item = this.game.itemDefs.find(i => i.id === node.itemId);
                    if (item) {
                        this.game.inventory.push({...item});
                        if (this.game.updateInventoryHUD) this.game.updateInventoryHUD();
                        this.game.log(`Reward: ${item.name}`, "success");
                        
                        // Show popup
                        if (this.game.dialogueSystem) {
                            this.game.dialogueSystem.db.conversations.push({
                                id: "_reward_temp",
                                nodes: [{ speaker: "system", text: `You received: ${item.name}!` }]
                            });
                            this.game.dialogueSystem.start("_reward_temp", () => {
                                // Continue after acknowledgment
                                this.continueFlow(node);
                            });
                            return; // Stop here, wait for callback
                        }
                    } else {
                        console.warn("Reward item not found:", node.itemId);
                    }
                }
                this.continueFlow(node);
                break;

            case 'variable':
                if (!this.game.flags) this.game.flags = {};
                this.game.flags[node.flag] = (node.value === 'true' || node.value === true);
                console.log(`Set Flag [${node.flag}] = ${this.game.flags[node.flag]}`);
                this.continueFlow(node);
                break;

            case 'dialogue':
                if (this.game.dialogueSystem) {
                    // Create temp conversation for simple dialogue node
                    const tempId = `_camp_dlg_${node.id}`;
                    this.game.dialogueSystem.db.conversations.push({
                        id: tempId,
                        nodes: [{ speaker: "system", text: node.text || "..." }]
                    });
                    
                    this.game.dialogueSystem.start(tempId, () => {
                         // Clean up
                         this.game.dialogueSystem.db.conversations = this.game.dialogueSystem.db.conversations.filter(c => c.id !== tempId);
                         this.continueFlow(node);
                    });
                } else {
                     this.continueFlow(node);
                }
                break;

            case 'note':
                // Just a comment, skip immediately
                this.continueFlow(node);
                break;

            case 'cutscene':
                if (this.game.dialogueSystem) {
                     this.game.dialogueSystem.start(node.cutsceneId, () => {
                         this.continueFlow(node);
                     });
                } else {
                     this.continueFlow(node);
                }
                break;

            case 'random':
                const chance = node.chance || 50;
                const roll = Math.random() * 100;
                this.game.log(`Random Roll: ${roll.toFixed(1)} vs ${chance}`);
                if (roll <= chance) {
                    if (node.nextTrue) this.processNode(node.nextTrue);
                    else console.warn("Random TRUE path missing");
                } else {
                    if (node.nextFalse) this.processNode(node.nextFalse);
                    else console.warn("Random FALSE path missing");
                }
                break;

            case 'wait':
                const duration = (node.duration || 1) * 1000;
                console.log(`Waiting ${duration}ms...`);
                setTimeout(() => {
                    this.continueFlow(node);
                }, duration);
                break;

            default:
                this.continueFlow(node);
                break;
        }
    }

    continueFlow(node) {
        if (node.next) {
            this.processNode(node.next);
        } else {
            console.log("Campaign flow ended at node:", node.id);
            // Only show void screen if we are not in a level (i.e. we just finished a sequence)
            // But usually 'level' nodes are the resting state. 
            // If we end on a non-level node, it might be Game Over or To Be Continued.
            if (node.type !== 'level') {
                this.game.showVoidScreen("TO BE CONTINUED...");
            }
        }
    }

    async advance() {
        // Delegate to CampaignController if multi-engine
        if (this.useController && this.controller) {
            await this.controller.advance();
            return;
        }
        
        // Original single-engine logic
        const node = this.data.find(n => n.id === this.currentNodeId);
        if (node && node.next) {
            this.processNode(node.next);
        } else {
            console.log("Campaign finished.");
            this.game.showVoidScreen("CAMPAIGN COMPLETE");
        }
    }
}