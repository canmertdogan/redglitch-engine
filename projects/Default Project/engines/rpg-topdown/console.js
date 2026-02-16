// console.js - Professional Grade Engine Console v2.0

class DebugConsole {
    constructor(game) {
        this.game = game;
        this.isOpen = false;
        this.history = JSON.parse(localStorage.getItem('ketebe_console_history')) || [];
        this.historyIdx = this.history.length;
        
        this.commands = {
            'help': { desc: 'List all available commands', usage: 'help', fn: () => this.printHelp() },
            'clear': { desc: 'Clear the console buffer', usage: 'clear', fn: () => this.clear() },
            'god': { desc: 'Toggle player invulnerability', usage: 'god', fn: () => this.toggleGod() },
            'noclip': { desc: 'Toggle collision bypass', usage: 'noclip', fn: () => this.toggleNoClip() },
            'give': { desc: 'Add item to inventory', usage: 'give [item_id] [qty]', fn: (args) => this.giveItem(args) },
            'spawn': { desc: 'Spawn entity at player position', usage: 'spawn [id]', fn: (args) => this.spawnEntity(args) },
            'teleport': { desc: 'Jump to specific level', usage: 'teleport [level_id]', fn: (args) => this.teleport(args) },
            'pos': { desc: 'Get or set player coordinates', usage: 'pos [x] [y]', fn: (args) => this.playerPos(args) },
            'speed': { desc: 'Modify player movement speed', usage: 'speed [val]', fn: (args) => this.setSpeed(args) },
            'entities': { desc: 'List all active entities in current level', usage: 'entities', fn: () => this.listEntities() },
            'map': { desc: 'Display current map metadata', usage: 'map', fn: () => this.showMapInfo() },
            'physics': { desc: 'Toggle physics debug wireframes', usage: 'physics', fn: () => this.togglePhysics() },
            'timescale': { desc: 'Slow down or speed up engine time', usage: 'timescale [val]', fn: (args) => this.setTimeScale(args) },
            'eval': { desc: 'Execute raw JavaScript in game context', usage: 'eval [code]', fn: (args) => this.evalJS(args) }
        };
        
        this.createDOM();
        this.setupInput();
        this.log("ONGONLUK ENGINE ALPHA // CONSOLE READY", 'system');
        this.log("Type 'help' for command list. Press [TAB] to autocomplete.", 'info');
    }

    createDOM() {
        this.el = document.createElement('div');
        this.el.id = 'ketebe-console';
        this.el.style.cssText = `
            position: fixed; bottom: 0; left: 0; width: 100%; height: 40%;
            background: rgba(5, 8, 15, 0.95); color: #cfd8dc;
            font-family: 'VT323', 'Consolas', monospace; font-size: 18px;
            z-index: 1000000; display: none; flex-direction: column;
            border-top: 3px solid #f1c40f; box-shadow: 0 -10px 30px rgba(0,0,0,0.8);
            backdrop-filter: blur(5px); transition: transform 0.2s ease-out;
            transform: translateY(100%);
        `;

        // Scrollable Buffer
        this.output = document.createElement('div');
        this.output.style.cssText = `
            flex-grow: 1; overflow-y: auto; padding: 15px;
            display: flex; flex-direction: column-reverse; gap: 4px;
            scrollbar-width: thin;
        `;
        
        // Autocomplete Hint
        this.hint = document.createElement('div');
        this.hint.style.cssText = `
            padding: 0 15px; color: #555; font-size: 14px; height: 20px;
        `;

        // Input Area
        const inputArea = document.createElement('div');
        inputArea.style.cssText = `
            display: flex; padding: 10px 15px; background: #000;
            border-top: 1px solid #1f2b42; align-items: center;
        `;
        
        const prompt = document.createElement('span');
        prompt.innerHTML = '<span style="color:#f1c40f">ongonluk</span>@<span style="color:#00f3ff">engine</span>:~$ ';
        prompt.style.marginRight = '10px';
        
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.style.cssText = `
            flex-grow: 1; background: transparent; border: none;
            color: #fff; font-family: inherit; font-size: inherit; outline: none;
        `;
        
        inputArea.appendChild(prompt);
        inputArea.appendChild(this.input);
        
        // REORDER: Output -> Hint -> Input (Standard Terminal Layout)
        this.el.appendChild(this.output);
        this.el.appendChild(this.hint);
        this.el.appendChild(inputArea);
        document.body.appendChild(this.el);
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            if (e.key === '`' || e.key === '~') {
                e.preventDefault();
                this.toggle();
            }
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = this.input.value.trim();
                if (cmd) {
                    this.history.push(cmd);
                    if (this.history.length > 50) this.history.shift();
                    localStorage.setItem('ketebe_console_history', JSON.stringify(this.history));
                    this.historyIdx = this.history.length;
                    this.exec(cmd);
                    this.input.value = '';
                    this.updateHint();
                }
            }
            
            if (e.key === 'Tab') {
                e.preventDefault();
                this.autocomplete();
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.historyIdx > 0) {
                    this.historyIdx--;
                    this.input.value = this.history[this.historyIdx];
                }
            }
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.historyIdx < this.history.length - 1) {
                    this.historyIdx++;
                    this.input.value = this.history[this.historyIdx];
                } else {
                    this.historyIdx = this.history.length;
                    this.input.value = '';
                }
            }
        });

        this.input.addEventListener('input', () => this.updateHint());
    }

    updateHint() {
        const val = this.input.value.trim().toLowerCase();
        if (!val) { this.hint.innerText = ''; return; }
        const match = Object.keys(this.commands).find(c => c.startsWith(val));
        if (match) {
            this.hint.innerHTML = `<span style="color:#f1c40f">Suggestion:</span> ${match} - ${this.commands[match].desc}`;
        } else {
            this.hint.innerText = '';
        }
    }

    autocomplete() {
        const val = this.input.value.trim().toLowerCase();
        const match = Object.keys(this.commands).find(c => c.startsWith(val));
        if (match) this.input.value = match;
    }

    toggle() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.el.style.display = 'flex';
            setTimeout(() => {
                this.el.style.transform = 'translateY(0)';
                this.input.focus();
            }, 10);
        } else {
            this.el.style.transform = 'translateY(100%)';
            setTimeout(() => { this.el.style.display = 'none'; }, 200);
            this.input.blur();
        }
    }

    log(msg, type='info') {
        const line = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString([], { hour12: false });
        
        let color = '#cfd8dc';
        let prefix = 'LOG';
        
        if (type === 'err') { color = '#ff5252'; prefix = 'ERR'; }
        if (type === 'warn') { color = '#ffd740'; prefix = 'WRN'; }
        if (type === 'success') { color = '#69f0ae'; prefix = 'OK '; }
        if (type === 'system') { color = '#40c4ff'; prefix = 'SYS'; }
        if (type === 'exec') { color = '#f1c40f'; prefix = 'EXE'; }

        line.style.color = color;
        line.innerHTML = `<span style="color:#555">[${timestamp}] [${prefix}]</span> ${msg}`;
        
        this.output.appendChild(line);
        this.output.scrollTop = this.output.scrollHeight;
    }

    clear() { this.output.innerHTML = ''; }

    exec(raw) {
        this.log(raw, 'exec');
        const [cmdName, ...args] = raw.split(' ');
        const cmd = cmdName.toLowerCase();

        if (this.commands[cmd]) {
            try {
                this.commands[cmd].fn(args);
            } catch (e) {
                this.log(`Runtime Error: ${e.message}`, 'err');
            }
        } else {
            this.log(`Command '${cmd}' not found. Type 'help' for list.`, 'err');
        }
    }

    // --- COMMAND IMPLEMENTATIONS ---

    printHelp() {
        this.log("AVAILABLE COMMANDS:", "system");
        Object.keys(this.commands).sort().forEach(key => {
            const c = this.commands[key];
            this.log(`<span style="color:#f1c40f">${key.padEnd(10)}</span> - ${c.desc} <span style="color:#555">(${c.usage})</span>`);
        });
    }

    toggleGod() {
        this.game.player.godMode = !this.game.player.godMode;
        this.log(`GOD MODE: ${this.game.player.godMode ? 'ENABLED' : 'DISABLED'}`, 'warn');
    }

    toggleNoClip() {
        this.game.player.noclip = !this.game.player.noclip;
        this.log(`NOCLIP: ${this.game.player.noclip ? 'ENABLED' : 'DISABLED'}`, 'warn');
    }

    playerPos(args) {
        if (args.length >= 2) {
            this.game.player.x = parseFloat(args[0]);
            this.game.player.y = parseFloat(args[1]);
            this.log(`Teleported player to ${args[0]}, ${args[1]}`, 'success');
        } else {
            this.log(`Player Position: X=${Math.round(this.game.player.x)} Y=${Math.round(this.game.player.y)}`, 'info');
        }
    }

    listEntities() {
        const eCount = this.game.enemies?.length || 0;
        const nCount = this.game.npcs?.length || 0;
        this.log(`ACTIVE ENTITIES: ${eCount} Enemies, ${nCount} NPCs`, 'system');
        this.game.enemies.forEach((e, i) => this.log(`  [E:${i}] ${e.def?.name || 'Enemy'} at ${Math.round(e.x)},${Math.round(e.y)}`));
    }

    showMapInfo() {
        const m = this.game.mapSystem;
        this.log(`MAP INFO:`, 'system');
        this.log(`  Name: ${m.currentMapName || 'unnamed'}`);
        this.log(`  Size: ${m.width}x${m.height}`);
        this.log(`  Tileset: ${m.tilesetPath}`);
    }

    setTimeScale(args) {
        const s = parseFloat(args[0]);
        if (isNaN(s)) return this.log("Usage: timescale [multiplier]", "err");
        window.engineTimeScale = s;
        this.log(`Engine TimeScale set to ${s}x`, 'warn');
    }

    togglePhysics() {
        window.DEBUG_PHYSICS = !window.DEBUG_PHYSICS;
        this.log(`PHYSICS DEBUG: ${window.DEBUG_PHYSICS ? 'ON' : 'OFF'}`, 'warn');
    }

    evalJS(args) {
        const code = args.join(' ');
        try {
            const result = eval(code);
            console.log("Console Eval Result:", result);
            this.log(`Result: ${JSON.stringify(result)}`, 'success');
        } catch(e) {
            this.log(`Eval Error: ${e.message}`, 'err');
        }
    }
}

window.DebugConsole = DebugConsole;