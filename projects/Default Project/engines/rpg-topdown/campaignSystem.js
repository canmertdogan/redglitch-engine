window.CampaignSystem = class CampaignSystem {
    constructor(game) {
        this.game = game;
        this.data = [];
        this.currentNodeId = null;
    }

    init(campaignData) {
        this.data = campaignData || [];
    }

    start() {
        if (!this.data || this.data.length === 0) return;
        
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

    advance() {
        const node = this.data.find(n => n.id === this.currentNodeId);
        if (node && node.next) {
            this.processNode(node.next);
        } else {
            console.log("Campaign finished.");
            this.game.showVoidScreen("CAMPAIGN COMPLETE");
        }
    }
}