// dialogueSystem.js - Handles in-game text display

window.DialogueSystem = class DialogueSystem {
    constructor() {
        this.active = false;
        this.queue = [];
        this.callback = null;
        this.justStarted = false; 
        
        // Create UI Overlay
        this.overlay = document.createElement('div');
        this.overlay.id = 'dialogue-overlay';
        this.overlay.style.cssText = `
            position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
            width: 80%; min-height: 160px; max-height: 250px;
            background: rgba(10, 15, 25, 0.98);
            border: 3px solid #ff0000; border-radius: 8px;
            color: #fff; padding: 20px; z-index: 2000;
            display: none; font-family: 'VT323', monospace;
            box-shadow: 0 0 20px rgba(0,0,0,0.8);
            pointer-events: auto;
        `;
        
        const flexContainer = document.createElement('div');
        flexContainer.style.cssText = `display: flex; gap: 25px; align-items: flex-start;`;

        this.portrait = document.createElement('div');
        this.portrait.id = 'dialogue-portrait';
        this.portrait.style.cssText = `
            width: 120px; height: 120px;
            background: #000; border: 2px solid #ff0000;
            image-rendering: pixelated; flex-shrink: 0;
            display: none; border-radius: 4px;
            overflow: hidden;
        `;

        const textCol = document.createElement('div');
        textCol.style.cssText = `flex-grow: 1; display: flex; flex-direction: column; gap: 8px;`;

        this.nameTag = document.createElement('div');
        this.nameTag.id = 'dialogue-nametag';
        this.nameTag.style.cssText = `
            font-size: 1.8rem; font-weight: bold; color: #ff0000;
            text-transform: uppercase; letter-spacing: 1px;
            border-bottom: 1px solid rgba(255, 0, 0, 0.3);
            padding-bottom: 5px;
        `;
        
        this.textBox = document.createElement('div');
        this.textBox.id = 'dialogue-text';
        this.textBox.style.cssText = `
            font-size: 1.6rem; line-height: 1.3; color: #eee;
            min-height: 60px;
        `;

        this.choicesContainer = document.createElement('div');
        this.choicesContainer.id = 'dialogue-choices';
        this.choicesContainer.style.cssText = `
            display: flex; flex-direction: column; gap: 8px; margin-top: 15px;
        `;
        
        textCol.appendChild(this.nameTag);
        textCol.appendChild(this.textBox);
        textCol.appendChild(this.choicesContainer);
        
        flexContainer.appendChild(this.portrait);
        flexContainer.appendChild(textCol);
        
        this.overlay.appendChild(flexContainer);
        document.body.appendChild(this.overlay); 
        
        this.overlay.onclick = (e) => {
            e.stopPropagation();
            if (this.choicesContainer.innerHTML === '') this.next();
        };
        
        this.db = { characters: [], conversations: [] };
    }

    async init() {
        try {
            const response = await fetch('/dunyalar/definitions/dialogues.json');
            if (!response.ok) throw new Error("Failed to load dialogues");
            this.db = await response.json();
        } catch (e) {
            const saved = localStorage.getItem('redglitch_dialogue');
            if (saved) this.db = JSON.parse(saved);
        }
    }

    start(conversationId, onComplete) {
        // Quest Check Hook
        if (window.game && window.game.questSystem) {
            // Check if this conversation ID corresponds to an NPC with a quest status
            const questStatus = window.game.questSystem.canTalkTo(conversationId);
            
            if (questStatus) {
                if (questStatus.type === 'offer') {
                    const qDef = window.game.questSystem.definitions[questStatus.questId];
                    this.queue = [{
                        speaker: conversationId, // NPC speaks
                        text: `[QUEST OFFER] ${qDef.title}\n\n${qDef.description}\n\nWill you accept this task?`,
                        choices: [
                            { text: "✅ Accept Quest", action: "accept_quest", questId: questStatus.questId },
                            { text: "❌ Decline", action: "close" }
                        ]
                    }];
                    this.active = true;
                    this.justStarted = true;
                    this.overlay.style.display = 'block';
                    this.next();
                    return;
                }
                else if (questStatus.type === 'turn_in') {
                    const qDef = window.game.questSystem.definitions[questStatus.questId];
                    this.queue = [{
                        speaker: conversationId,
                        text: `[QUEST COMPLETE] ${qDef.title}\n\nYou have completed the task! Here is your reward.`,
                        choices: [
                            { text: "🎁 Collect Reward", action: "complete_quest", questId: questStatus.questId }
                        ]
                    }];
                    this.active = true;
                    this.justStarted = true;
                    this.overlay.style.display = 'block';
                    this.next();
                    return;
                }
            }
        }

        if (!this.db || !this.db.conversations) return;
        const conv = this.db.conversations.find(c => c.id === conversationId);
        if (!conv) return;
        
        this.queue = [...conv.nodes];
        this.callback = onComplete;
        this.active = true;
        this.justStarted = true;
        this.overlay.style.display = 'block';
        
        setTimeout(() => { this.justStarted = false; }, 200);
        this.next();
    }

    next() {
        if (this.queue.length === 0) {
            this.end();
            return;
        }
        
        const node = this.queue.shift();
        // Fallback for speaker lookup if character DB is missing ID
        const char = (this.db.characters && this.db.characters.find(c => c.id === node.speaker)) || { name: node.speaker || "???", color: "#ff0000" };
        
        this.nameTag.innerText = char.name;
        this.nameTag.style.color = char.color || "#ff0000";
        this.textBox.innerText = node.text;

        // Portrait
        if (char && char.sprite) {
            this.portrait.innerHTML = '';
            const img = window.createPixelImage(char.sprite);
            img.style.width = '100%'; img.style.height = '100%';
            this.portrait.appendChild(img);
            this.portrait.style.display = 'block';
        } else {
            this.portrait.style.display = 'none';
        }

        // Choices
        this.choicesContainer.innerHTML = '';
        if (node.choices && node.choices.length > 0) {
            node.choices.forEach(choice => {
                const btn = document.createElement('button');
                btn.className = 'retro-btn small';
                btn.innerText = choice.text;
                btn.style.position = 'relative'; // Override absolute from retro-btn
                btn.style.width = '100%';
                btn.style.height = 'auto';
                btn.style.padding = '8px';
                btn.style.fontSize = '1.2rem';
                
                btn.onclick = (e) => {
                    e.stopPropagation();
                    if (choice.action === 'accept_quest') {
                        window.game.questSystem.accept(choice.questId);
                        this.end();
                    }
                    else if (choice.action === 'complete_quest') {
                        window.game.questSystem.complete(choice.questId);
                        this.end();
                    }
                    else if (choice.action === 'close') {
                        this.end();
                    }
                    else if (choice.nextScript) this.start(choice.nextScript, this.callback);
                    else this.next();
                };
                this.choicesContainer.appendChild(btn);
            });
        }
    }

    end() {
        this.active = false;
        this.overlay.style.display = 'none';
        if (this.callback) this.callback();
    }
}