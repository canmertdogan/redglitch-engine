
// input_editor.js
// Integrated with EventBus, SharedProjectState, and AssetManager

// Integration system references
let eventBus, projectState, assetManager;

function initializeInputIntegration() {
    if (typeof window !== 'undefined') {
        eventBus = window.VortexEventBus;
        projectState = window.VortexProjectState;
        assetManager = window.VortexAssetManager;
        
        if (eventBus) {
            console.log('[InputEditor] EventBus connected');
        }
    }
}

function broadcastInputUpdate(action = 'updated') {
    if (eventBus) {
        eventBus.emit(`input:${action}`, {
            inputMap: { ...inputMap },
            timestamp: Date.now()
        });
    }
    
    if (projectState) {
        projectState.set('input.map', {
            ...inputMap,
            lastModified: Date.now()
        });
    }
}

let inputMap = {
    "MoveUp": ["ArrowUp", "KeyW"],
    "MoveDown": ["ArrowDown", "KeyS"],
    "MoveLeft": ["ArrowLeft", "KeyA"],
    "MoveRight": ["ArrowRight", "KeyD"],
    "Jump": ["Space"],
    "Attack": ["KeyZ", "Click0"],
    "Interact": ["KeyE", "Enter"]
};

let activeAction = null;

// --- INIT ---
window.onload = async () => {
    // Initialize integration first
    initializeInputIntegration();
    
    await load();
    render();
    setupModal();
};

async function load() {
    try {
        const res = await fetch('/api/ide/read?file=data/input_map.json');
        if (res.ok) {
            inputMap = JSON.parse(await res.text());
        }
    } catch(e) { console.log("Using default inputs"); }
}

function render() {
    const container = document.getElementById('content');
    container.innerHTML = '';
    
    Object.keys(inputMap).forEach(action => {
        const card = document.createElement('div');
        card.className = 'action-card';
        
        // Header
        const header = document.createElement('div');
        header.className = 'action-header';
        header.innerHTML = `<span class="action-name">${action}</span>`;
        
        const delBtn = document.createElement('button');
        delBtn.innerText = 'DELETE';
        delBtn.style.cssText = "background:transparent; border:1px solid #e74c3c; color:#e74c3c; padding:4px 8px; font-size:0.8rem;";
        delBtn.onclick = () => deleteAction(action);
        header.appendChild(delBtn);
        
        card.appendChild(header);
        
        // Bindings
        const list = document.createElement('div');
        list.className = 'binding-list';
        
        inputMap[action].forEach((key, idx) => {
            const chip = document.createElement('div');
            chip.className = 'binding-chip';
            chip.innerHTML = `<span>${formatKey(key)}</span>`;
            
            const x = document.createElement('span');
            x.className = 'binding-remove';
            x.innerText = '×';
            x.onclick = () => removeBinding(action, idx);
            
            chip.appendChild(x);
            list.appendChild(chip);
        });
        
        // Add Btn
        const addBtn = document.createElement('div');
        addBtn.className = 'add-binding';
        addBtn.innerText = '+ Add Binding';
        addBtn.onclick = () => openBindModal(action);
        list.appendChild(addBtn);
        
        card.appendChild(list);
        container.appendChild(card);
    });
}

function formatKey(key) {
    return key.replace('Key', '').replace('Arrow', '');
}

// --- ACTIONS ---

function addAction() {
    const name = prompt("Action Name (e.g. Reload):");
    if (name && !inputMap[name]) {
        inputMap[name] = [];
        render();
    }
}

function deleteAction(name) {
    if(confirm(`Delete ${name}?`)) {
        delete inputMap[name];
        render();
    }
}

function removeBinding(action, idx) {
    inputMap[action].splice(idx, 1);
    render();
}

function openBindModal(action) {
    activeAction = action;
    document.getElementById('modal').style.display = 'flex';
    document.getElementById('detect-key').innerText = '...';
}

function setupModal() {
    window.addEventListener('keydown', (e) => {
        if (!activeAction) return;
        if (e.code === 'Escape') {
            activeAction = null;
            document.getElementById('modal').style.display = 'none';
            return;
        }
        
        // Bind
        e.preventDefault();
        bindKey(e.code);
    });
    
    window.addEventListener('mousedown', (e) => {
        if (!activeAction) return;
        bindKey(`Click${e.button}`);
    });
}

function bindKey(code) {
    if (!inputMap[activeAction].includes(code)) {
        inputMap[activeAction].push(code);
    }
    activeAction = null;
    document.getElementById('modal').style.display = 'none';
    render();
}

async function save() {
    try {
        await fetch('/api/ide/write', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                file: 'data/input_map.json',
                content: JSON.stringify(inputMap, null, 2)
            })
        });
        alert("Input Map Saved!");
    } catch(e) { alert("Save Failed"); }
}
