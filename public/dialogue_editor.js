// dialogue_editor.js - REDGLITCH DIALOGUE STUDIO v3.0
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

// Initialize integration
function initializeDialogueIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.RedGlitchEventBus;
        projectState = window.RedGlitchProjectState;
        assetManager = window.RedGlitchAssetManager;
        
        if (eventBus) {
            // Listen for NPC updates (dialogues reference NPCs as speakers)
            eventBus.on('npc:updated', (event) => {
                console.log('[DialogueEditor] NPC updated:', event.data.npcId);
                // Refresh character list
            });
            
            // Listen for character updates
            eventBus.on('character:updated', (event) => {
                console.log('[DialogueEditor] Character updated:', event.data.characterId);
            });
            
            // Listen for external dialogue load requests
            eventBus.on('dialogue:load', (event) => {
                if (event.data.dialogueId) {
                    const idx = data.conversations.findIndex(c => c.id === event.data.dialogueId);
                    if (idx >= 0) loadConversation(idx);
                }
            });
            
            console.log('[DialogueEditor] EventBus connected');
        }
    }
}

// Broadcast dialogue changes
function broadcastDialogueUpdate(dialogue, action = 'updated') {
    if (eventBus) {
        eventBus.emit(`dialogue:${action}`, {
            dialogueId: dialogue.id,
            dialogue: dialogue,
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set(`dialogues.${dialogue.id}`, dialogue);
    }
}

// Save all dialogues to project state
function saveDialoguesToState() {
    if (!projectState) return;
    
    const dialogueMap = {};
    data.conversations.forEach(conv => {
        dialogueMap[conv.id] = conv;
    });
    projectState.set('dialogues', dialogueMap);
}

let data = {
    characters: [],
    conversations: []
};

let currentConvIndex = 0;
let npcDefs = [];

// --- INIT ---
window.onload = async () => {
    // Initialize integration first
    initializeDialogueIntegration();
    
    await loadFromServer();
    
    // Default Hero if missing
    if (!data.characters.find(c => c.id === 'hero')) {
        data.characters.unshift({ id: 'hero', name: 'Hero', color: '#3498db', sprite: 'player' });
    }

    refreshCharList();
    refreshConvList();
    if (data.conversations.length > 0) loadConversation(0);
};

async function loadFromServer() {
    try {
        const res = await fetch('/dunyalar/definitions/dialogues.json');
        if (res.ok) data = await res.json();
        
        const nRes = await fetch('/dunyalar/definitions/npcs.json');
        if (nRes.ok) npcDefs = await nRes.json();
    } catch (e) {}
}

// --- CHARACTERS ---
function refreshCharList() {
    const list = document.getElementById('character-list');
    list.innerHTML = '';
    data.characters.forEach(c => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `<i class="fas fa-user"></i> ${c.name}`;
        list.appendChild(div);
    });
}

function syncNPCs() {
    npcDefs.forEach(npc => {
        if (!data.characters.find(c => c.id === npc.id)) {
            data.characters.push({ id: npc.id, name: npc.name, sprite: npc.sprite, color: '#f1c40f' });
        }
    });
    refreshCharList();
    alert("Actors synchronized.");
}

function addCharacter() {
    const name = prompt("Actor Name:");
    if (name) {
        data.characters.push({ id: name.toLowerCase().replace(' ', '_'), name, color: '#fff' });
        refreshCharList();
    }
}

// --- SCRIPTS ---
function refreshConvList() {
    const list = document.getElementById('conversation-list');
    list.innerHTML = '';
    data.conversations.forEach((conv, idx) => {
        const div = document.createElement('div');
        div.className = 'list-item' + (idx === currentConvIndex ? ' active' : '');
        div.innerHTML = `<i class="fas fa-scroll"></i> ${conv.id}`;
        div.onclick = () => loadConversation(idx);
        list.appendChild(div);
    });
}

function addConversation() {
    const id = prompt("Script ID:");
    if (id) {
        data.conversations.push({ id, nodes: [] });
        currentConvIndex = data.conversations.length - 1;
        refreshConvList();
        renderNodes();
    }
}

function loadConversation(idx) {
    currentConvIndex = idx;
    const conv = data.conversations[idx];
    document.getElementById('conv-id').value = conv.id;
    refreshConvList();
    renderNodes();
}

// --- LINES ---
function renderNodes() {
    const container = document.getElementById('nodes-container');
    container.innerHTML = '';
    const conv = data.conversations[currentConvIndex];
    if (!conv) return;

    conv.nodes.forEach((node, idx) => {
        const char = data.characters.find(c => c.id === node.speaker) || data.characters[0];
        const div = document.createElement('div');
        div.className = 'dialogue-line';
        
        let choicesHtml = '';
        if (node.choices) {
            node.choices.forEach((choice, cIdx) => {
                choicesHtml += `
                    <div class="choice-row">
                        <input type="text" value="${choice.text}" onchange="updateChoice(${idx}, ${cIdx}, 'text', this.value)" placeholder="Response text..." style="flex:2">
                        <input type="text" value="${choice.nextScript || ''}" onchange="updateChoice(${idx}, ${cIdx}, 'nextScript', this.value)" placeholder="Next Script ID" style="flex:1">
                        <button class="btn-mini danger" onclick="deleteChoice(${idx}, ${cIdx})">×</button>
                    </div>`;
            });
        }

        div.innerHTML = `
            <div class="line-header">
                <select onchange="updateNode(${idx}, 'speaker', this.value)" style="border:none; padding:2px; font-weight:bold;">
                    ${data.characters.map(c => `<option value="${c.id}" ${c.id===node.speaker?'selected':''}>${c.name.toUpperCase()}</option>`).join('')}
                </select>
                <button class="btn-mini danger" onclick="deleteNode(${idx})">DELETE LINE</button>
            </div>
            <div class="line-body">
                <div class="line-portrait" style="color:${char.color || 'var(--accent)'}">${char.name[0]}</div>
                <div class="line-main">
                    <textarea placeholder="Line text..." onchange="updateNode(${idx}, 'text', this.value)">${node.text || ''}</textarea>
                    <div id="choices-${idx}" style="margin-top:10px;">
                        <div style="font-size:0.8rem; color:#555; margin-bottom:5px;">PLAYER RESPONSES</div>
                        ${choicesHtml}
                        <button class="btn-mini" onclick="addChoice(${idx})" style="margin-top:5px;">+ ADD RESPONSE</button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function addNode() {
    const conv = data.conversations[currentConvIndex];
    if (!conv) return;
    conv.nodes.push({ speaker: 'hero', text: '', choices: [] });
    renderNodes();
}

function updateNode(idx, field, val) {
    data.conversations[currentConvIndex].nodes[idx][field] = val;
    if (field === 'speaker') renderNodes();
}

function deleteNode(idx) {
    if (!confirm("Delete this dialogue line?")) return;
    data.conversations[currentConvIndex].nodes.splice(idx, 1);
    renderNodes();
}

function addChoice(nIdx) {
    const node = data.conversations[currentConvIndex].nodes[nIdx];
    if (!node.choices) node.choices = [];
    node.choices.push({ text: 'Next...', nextScript: '' });
    renderNodes();
}

function updateChoice(nIdx, cIdx, field, val) {
    data.conversations[currentConvIndex].nodes[nIdx].choices[cIdx][field] = val;
}

function deleteChoice(nIdx, cIdx) {
    data.conversations[currentConvIndex].nodes[nIdx].choices.splice(cIdx, 1);
    renderNodes();
}

async function saveToServer() {
    try {
        const convId = document.getElementById('conv-id').value;
        if(data.conversations[currentConvIndex]) data.conversations[currentConvIndex].id = convId;

        await fetch('/api/dialogue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        // Save to shared state and broadcast
        saveDialoguesToState();
        data.conversations.forEach(conv => broadcastDialogueUpdate(conv, 'updated'));
        
        alert("Dialogue System Saved Successfully.");
        refreshConvList();
    } catch (e) { alert("Save failed."); }
}