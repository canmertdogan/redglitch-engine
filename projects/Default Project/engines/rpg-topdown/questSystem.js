// questSystem.js - RedGlitch Quest Runtime

window.QuestSystem = class QuestSystem {
    constructor(game) {
        this.game = game;
        this.definitions = {}; // Loaded from JSON
        this.active = {};      // { questId: { stage: 0, progress: 0 } }
        this.completed = [];   // [questId, ...]
        this.failed = [];      // [questId, ...]
    }

    async init(saveData) {
        // 1. Load Definitions
        try {
            const res = await fetch('/dunyalar/definitions/quests.json');
            if (res.ok) {
                const quests = await res.json();
                quests.forEach(q => this.definitions[q.id] = q);
            }
        } catch (e) { console.warn("Quest definitions load failed", e); }

        // 2. Load State
        if (saveData) {
            this.active = saveData.active || {};
            this.completed = saveData.completed || [];
            this.failed = saveData.failed || [];
        }
    }

    getState() {
        return {
            active: this.active,
            completed: this.completed,
            failed: this.failed
        };
    }

    // --- CORE API ---

    accept(questId) {
        const def = this.definitions[questId];
        if (!def) return false;
        
        // Validation: Already active or completed?
        if (this.active[questId] || this.completed.includes(questId)) return false;

        // Validation: Prerequisites met?
        if (def.prerequisites) {
            for (const pid of def.prerequisites) {
                if (!this.completed.includes(pid)) {
                    this.game.uiSystem.showNotification(`Missing Prerequisite: ${pid}`, 'error');
                    return false;
                }
            }
        }

        // Start Quest
        this.active[questId] = { stage: 0, progress: 0 };
        this.game.uiSystem.showNotification(`Quest Accepted: ${def.title}`, 'success');
        this.game.audio.play('quest_accept'); // Assuming generic sound exists or fallback
        return true;
    }

    complete(questId) {
        if (!this.active[questId]) return;
        const def = this.definitions[questId];

        // Grant Rewards
        if (def.rewards) {
            if (def.rewards.xp) this.game.player.xp = (this.game.player.xp || 0) + def.rewards.xp; // Assuming player has XP
            if (def.rewards.gold) this.game.player.gold = (this.game.player.gold || 0) + def.rewards.gold;
            if (def.rewards.items) {
                def.rewards.items.forEach(itemId => {
                    this.game.addItemToInventory(itemId);
                });
            }
        }

        // Move state
        delete this.active[questId];
        this.completed.push(questId);
        
        this.game.uiSystem.showNotification(`Quest Complete: ${def.title}`, 'gold');
        this.game.audio.play('quest_complete');
    }

    // --- EVENT HANDLING ---

    onEvent(type, targetId, amount = 1) {
        // Check all active quests
        for (const [qid, state] of Object.entries(this.active)) {
            const def = this.definitions[qid];
            if (!def || !def.stages) continue;

            const stage = def.stages[state.stage];
            if (!stage) continue;

            // Check if this event matches the current stage objective
            if (stage.type === type && stage.target === targetId) {
                state.progress += amount;
                
                // Check completion of stage
                if (state.progress >= (stage.amount || 1)) {
                    this.advanceStage(qid);
                } else {
                    // Update UI Notification for progress (optional, maybe too spammy for kills)
                    // this.game.uiSystem.showNotification(`${def.title}: ${state.progress}/${stage.amount}`, 'info');
                }
            }
        }
    }

    advanceStage(questId) {
        const state = this.active[questId];
        const def = this.definitions[questId];
        
        state.stage++;
        state.progress = 0; // Reset progress for next stage

        // Check if all stages done
        if (state.stage >= def.stages.length) {
            if (def.autoComplete) {
                this.complete(questId);
            } else {
                this.game.uiSystem.showNotification(`${def.title}: Return to Giver`, 'info');
                // Quest stays active but in "Return" state (stage index out of bounds indicates pending turn-in)
            }
        } else {
            const newStage = def.stages[state.stage];
            this.game.uiSystem.showNotification(`${def.title}: ${newStage.text}`, 'info');
        }
    }

    // --- UTILS ---
    
    canTalkTo(npcId) {
        // Check if any active quest requires talking to this NPC
        for (const [qid, state] of Object.entries(this.active)) {
            const def = this.definitions[qid];
            if (!def || state.stage >= def.stages.length) {
                // If waiting for turn-in
                if (def.giverId === npcId) return { type: 'turn_in', questId: qid };
                continue;
            }
            
            const stage = def.stages[state.stage];
            if (stage.type === 'talk' && stage.target === npcId) {
                return { type: 'objective', questId: qid };
            }
        }
        
        // Check available quests from this NPC
        for (const [qid, def] of Object.entries(this.definitions)) {
            if (def.giverId === npcId && !this.active[qid] && !this.completed.includes(qid)) {
                // Check prereqs
                let prereqMet = true;
                if(def.prerequisites) {
                    for(const pid of def.prerequisites) if(!this.completed.includes(pid)) prereqMet = false;
                }
                if(prereqMet) return { type: 'offer', questId: qid };
            }
        }
        
        return null;
    }
};