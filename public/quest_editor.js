// quest_editor.js - REDGLITCH QUEST STUDIO
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

// Initialize integration
function initializeQuestIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedGlitchEventBus;
        projectState = window.RedGlitchProjectState;
        assetManager = window.RedGlitchAssetManager;
        
        if (eventBus) {
            // Listen for NPC updates (quests reference NPCs)
            eventBus.on('npc:updated', (event) => {
                console.log('[QuestEditor] NPC updated:', event.data.npcId);
                // Refresh NPC dropdown
            });
            
            // Listen for item updates (quests reward items)
            eventBus.on('item:updated', (event) => {
                console.log('[QuestEditor] Item updated:', event.data.itemId);
                // Refresh item dropdown
            });
            
            // Listen for character updates
            eventBus.on('character:updated', (event) => {
                console.log('[QuestEditor] Character updated:', event.data.characterId);
            });
            
            // Listen for external quest load requests
            eventBus.on('quest:load', (event) => {
                if (event.data.questId && window.questEditor) {
                    window.questEditor.selectQuest(event.data.questId);
                }
            });
            
            console.log('[QuestEditor] EventBus connected');
        }
    }
}

class QuestEditor {
    constructor() {
        this.quests = [];
        this.npcs = [];
        this.items = [];
        this.selectedId = null;
        
        this.dom = {
            list: document.getElementById('quest-list'),
            editor: document.getElementById('editor-view'),
            empty: document.getElementById('empty-view'),
            stages: document.getElementById('stages-container'),
            inputs: {
                id: document.getElementById('q-id'),
                title: document.getElementById('q-title'),
                desc: document.getElementById('q-desc'),
                giver: document.getElementById('q-giver'),
                auto: document.getElementById('q-auto'),
                xp: document.getElementById('rew-xp'),
                gold: document.getElementById('rew-gold')
            },
            prereqs: {
                list: document.getElementById('prereq-list'),
                select: document.getElementById('prereq-select')
            },
            rewards: {
                items: document.getElementById('rew-items'),
                select: document.getElementById('item-select')
            }
        };

        this.init();
    }

    async init() {
        // Initialize integration
        initializeQuestIntegration();
        
        await this.loadData();
        if (this.quests.length === 0) this.generateExamples();
        this.renderList();
    }
    
    // Broadcast quest changes
    broadcastUpdate(quest, action = 'updated') {
        if (eventBus) {
            eventBus.emit(`quest:${action}`, {
                questId: quest.id,
                quest: quest,
                timestamp: Date.now()
            });
        }
        
        if (projectState) {
            projectState.set(`quests.${quest.id}`, quest);
        }
    }
    
    // Save all quests to project state
    saveToState() {
        if (!projectState) return;
        
        const questMap = {};
        this.quests.forEach(quest => {
            questMap[quest.id] = quest;
        });
        projectState.set('quests', questMap);
    }

    generateExamples() {
        this.quests = [
            { id: "main_01", title: "The Awakening", description: "Wake up and find your sword.", type: "main", objectives: [{ text: "Find Sword", type: "collect", target: "sword_rusty", count: 1 }] },
            { id: "main_02", title: "Into the Wild", description: "Leave the village and explore.", type: "main", objectives: [{ text: "Reach Forest", type: "location", target: "forest_entrance" }] },
            { id: "side_rats", title: "Rat Problem", description: "Clear the cellar for the Innkeeper.", type: "side", objectives: [{ text: "Kill Rats", type: "kill", target: "rat_giant", count: 5 }] },
            { id: "side_herb", title: "Herbalist's Request", description: "Gather healing herbs.", type: "side", objectives: [{ text: "Collect Herbs", type: "collect", target: "herb_green", count: 3 }] },
            { id: "main_03", title: "The Dark Tower", description: "Infiltrate the enemy stronghold.", type: "main", objectives: [{ text: "Enter Tower", type: "location", target: "tower_gate" }] },
            { id: "side_lost", title: "Lost Dog", description: "Find the mayor's dog.", type: "side", objectives: [{ text: "Find Dog", type: "interact", target: "dog_spot" }] },
            { id: "tut_combat", title: "Combat Training", description: "Learn to fight at the barracks.", type: "tutorial", objectives: [{ text: "Hit Dummy", type: "kill", target: "training_dummy", count: 3 }] },
            { id: "side_ghost", title: "Restless Spirit", description: "Put the ghost to rest.", type: "side", objectives: [{ text: "Defeat Ghost", type: "kill", target: "ghost_miner", count: 1 }] },
            { id: "main_04", title: "Ancient Relic", description: "Retrieve the artifact.", type: "main", objectives: [{ text: "Get Relic", type: "collect", target: "relic_ancient", count: 1 }] },
            { id: "side_fish", title: "Fishing Trip", description: "Catch dinner.", type: "side", objectives: [{ text: "Catch Fish", type: "collect", target: "fish_trout", count: 5 }] }
        ];
    }

    async loadData() {
        try {
            const qRes = await fetch('/api/quests');
            if (qRes.ok) {
                const data = await qRes.json();
                if (Array.isArray(data) && data.length > 0) this.quests = data;
            }
            
            const nRes = await fetch('/api/npcs');
            this.npcs = nRes.ok ? await nRes.json() : [{id:'guard', name:'Guard'}, {id:'merchant', name:'Merchant'}];

            const iRes = await fetch('/api/items');
            this.items = iRes.ok ? await iRes.json() : [{id:'sword', name:'Sword'}, {id:'potion', name:'Potion'}];

        } catch(e) { console.error(e); }
    }

    async saveAll() {
        try {
            await fetch('/api/quests', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(this.quests)
            });
            
            // Save to shared state and broadcast
            this.saveToState();
            this.quests.forEach(quest => this.broadcastUpdate(quest, 'updated'));
            
            alert("Quests Saved!");
        } catch(e) { alert("Save failed"); }
    }

    // --- LIST ---

    renderList() {
        this.dom.list.innerHTML = '';
        this.quests.forEach(q => {
            const el = document.createElement('div');
            el.className = `list-item ${this.selectedId === q.id ? 'active' : ''}`;
            let icon = 'scroll';
            if (q.type === 'main') icon = 'crown';
            if (q.type === 'side') icon = 'exclamation-circle';
            
            el.innerHTML = `<i class="fas fa-${icon}"></i> ${q.title || q.id}`;
            el.onclick = () => this.select(q.id);
            this.dom.list.appendChild(el);
        });
        
        this.dom.prereqs.select.innerHTML = '<option value="">-- Prerequisite --</option>';
        this.quests.forEach(q => {
            if (q.id === this.selectedId) return;
            const opt = document.createElement('option');
            opt.value = q.id; opt.innerText = q.title;
            this.dom.prereqs.select.appendChild(opt);
        });
    }

    select(id) {
        this.selectedId = id;
        this.renderList();
        this.renderEditor();
    }

    newQuest() {
        const id = "quest_" + Date.now().toString().slice(-4);
        this.quests.push({
            id: id, title: "New Quest", description: "", type: "side",
            objectives: [], rewards: { xp: 0, gold: 0, items: [] }
        });
        this.select(id);
    }

    deleteQuest() {
        if (!this.selectedId || !confirm("Delete quest?")) return;
        this.quests = this.quests.filter(q => q.id !== this.selectedId);
        this.selectedId = null;
        this.renderList();
        this.renderEditor();
    }

    // --- EDITOR ---

    getQuest() { return this.quests.find(q => q.id === this.selectedId); }

    renderEditor() {
        const q = this.getQuest();
        if (!q) {
            this.dom.editor.style.display = 'none';
            this.dom.empty.style.display = 'flex';
            this.dom.stages.innerHTML = '';
            return;
        }

        this.dom.editor.style.display = 'flex';
        this.dom.empty.style.display = 'none';

        this.dom.inputs.id.value = q.id;
        this.dom.inputs.title.value = q.title;
        this.dom.inputs.desc.value = q.description || "";
        this.dom.inputs.auto.value = q.autoComplete ? "true" : "false";

        this.dom.inputs.giver.innerHTML = '<option value="">-- No Giver --</option>';
        this.npcs.forEach(npc => {
            const opt = document.createElement('option');
            opt.value = npc.id; opt.innerText = npc.name || npc.id;
            if(q.giverId === npc.id) opt.selected = true;
            this.dom.inputs.giver.appendChild(opt);
        });

        this.dom.inputs.xp.value = q.rewards?.xp || 0;
        this.dom.inputs.gold.value = q.rewards?.gold || 0;
        
        this.dom.rewards.select.innerHTML = '<option value="">-- Add Item --</option>';
        this.items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id; opt.innerText = item.name || item.id;
            this.dom.rewards.select.appendChild(opt);
        });

        this.renderPrereqs(q);
        this.renderRewardItems(q);
        this.renderStages(q);
    }

    // --- SUB-SECTIONS ---

    renderPrereqs(q) {
        const container = this.dom.prereqs.list;
        container.innerHTML = '';
        (q.prerequisites || []).forEach((pid, idx) => {
            const tag = document.createElement('div');
            tag.className = 'tag';
            const pQuest = this.quests.find(x => x.id === pid);
            tag.innerHTML = `${pQuest ? pQuest.title : pid} <span onclick="editor.removePrereq(${idx})">×</span>`;
            container.appendChild(tag);
        });
    }

    addPrereq() {
        const val = this.dom.prereqs.select.value;
        if (!val) return;
        const q = this.getQuest();
        if (!q.prerequisites) q.prerequisites = [];
        if (!q.prerequisites.includes(val)) {
            q.prerequisites.push(val);
            this.renderPrereqs(q);
        }
    }

    removePrereq(idx) {
        const q = this.getQuest();
        q.prerequisites.splice(idx, 1);
        this.renderPrereqs(q);
    }

    renderRewardItems(q) {
        const container = this.dom.rewards.items;
        container.innerHTML = '';
        (q.rewards?.items || []).forEach((iid, idx) => {
            const tag = document.createElement('div');
            tag.className = 'tag';
            const item = this.items.find(x => x.id === iid);
            tag.innerHTML = `${item ? item.name : iid} <span onclick="editor.removeItemReward(${idx})">×</span>`;
            container.appendChild(tag);
        });
    }

    addItemReward() {
        const val = this.dom.rewards.select.value;
        if (!val) return;
        const q = this.getQuest();
        if (!q.rewards) q.rewards = { xp: 0, gold: 0, items: [] };
        if (!q.rewards.items) q.rewards.items = [];
        q.rewards.items.push(val);
        this.renderRewardItems(q);
    }

    removeItemReward(idx) {
        const q = this.getQuest();
        q.rewards.items.splice(idx, 1);
        this.renderRewardItems(q);
    }

    update(field, val) {
        const q = this.getQuest();
        if (!q) return;
        q[field] = val;
        if (field === 'title') this.renderList();
    }

    updateReward(field, val) {
        const q = this.getQuest();
        if (!q.rewards) q.rewards = { xp: 0, gold: 0, items: [] };
        q.rewards[field] = parseInt(val);
    }

    // --- STAGES ---

    renderStages(q) {
        this.dom.stages.innerHTML = '';
        (q.objectives || []).forEach((stage, idx) => {
            const el = document.createElement('div');
            el.className = 'stage-card';
            
            el.innerHTML = `
                <div class="stage-header">
                    <span>OBJECTIVE ${idx + 1}</span>
                    <span class="btn-del-mini" style="color:#e74c3c; cursor:pointer;" onclick="editor.deleteStage(${idx})">DELETE</span>
                </div>
                <div class="form-group">
                    <input type="text" value="${stage.text || ''}" placeholder="Description (e.g. Kill Rats)" onchange="editor.updateStage(${idx}, 'text', this.value)">
                </div>
                <div class="stage-row">
                    <select onchange="editor.updateStage(${idx}, 'type', this.value)">
                        <option value="kill" ${stage.type==='kill'?'selected':''}>KILL</option>
                        <option value="collect" ${stage.type==='collect'?'selected':''}>COLLECT</option>
                        <option value="talk" ${stage.type==='talk'?'selected':''}>TALK</option>
                        <option value="location" ${stage.type==='location'?'selected':''}>GO TO</option>
                        <option value="interact" ${stage.type==='interact'?'selected':''}>INTERACT</option>
                    </select>
                    <input type="text" value="${stage.target || ''}" placeholder="Target ID" onchange="editor.updateStage(${idx}, 'target', this.value)">
                    <input type="number" style="width:50px" value="${stage.count || 1}" onchange="editor.updateStage(${idx}, 'count', this.value)">
                </div>
            `;
            this.dom.stages.appendChild(el);
        });
    }

    addStage() {
        const q = this.getQuest();
        if (!q.objectives) q.objectives = [];
        q.objectives.push({ text: "New Objective", type: "kill", target: "", count: 1 });
        this.renderStages(q);
    }

    deleteStage(idx) {
        const q = this.getQuest();
        q.objectives.splice(idx, 1);
        this.renderStages(q);
    }

    updateStage(idx, field, val) {
        const q = this.getQuest();
        const stage = q.objectives[idx];
        if (field === 'count') val = parseInt(val);
        stage[field] = val;
    }
}

window.editor = new QuestEditor();