
class Terminal {
    constructor() {
        this.input = document.getElementById('input');
        this.output = document.getElementById('output');
        this.history = JSON.parse(localStorage.getItem('redglitch_terminal_history')) || [];
        this.historyIdx = this.history.length;

        this.init();
        
        // Expose API for parent window
        window.logSystem = this;
    }

    init() {
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = this.input.value.trim();
                if (cmd) {
                    this.history.push(cmd);
                    if (this.history.length > 100) this.history.shift();
                    localStorage.setItem('redglitch_terminal_history', JSON.stringify(this.history));
                    this.historyIdx = this.history.length;
                    this.execute(cmd);
                    this.input.value = '';
                }
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

        // Focus input on click anywhere
        document.addEventListener('click', () => this.input.focus());
    }

    // New Enhanced Log Method
    log(msg, type = 'info', source = 'SYS') {
        const line = document.createElement('div');
        line.className = `line ${type}`;
        
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        let icon = '';
        
        switch(type) {
            case 'error': icon = '<i class="fas fa-times-circle"></i>'; break;
            case 'warning': icon = '<i class="fas fa-exclamation-triangle"></i>'; break;
            case 'success': icon = '<i class="fas fa-check-circle"></i>'; break;
            case 'system': icon = '<i class="fas fa-cog"></i>'; break;
            case 'input-line': icon = '<i class="fas fa-chevron-right"></i>'; break;
            default: icon = '<i class="fas fa-info-circle"></i>';
        }

        // If message is an object, stringify it
        if (typeof msg === 'object') {
            try { msg = JSON.stringify(msg, null, 2); } catch(e) {}
        }

        line.innerHTML = `
            <span class="ts">[${timestamp}]</span>
            <span class="src">[${source}]</span>
            <span class="icon">${icon}</span>
            <span class="msg">${msg}</span>
        `;
        
        this.output.appendChild(line);
        this.output.scrollTop = this.output.scrollHeight;
    }

    async execute(raw) {
        this.log(raw, 'input-line', 'USR');

        if (raw.toLowerCase() === 'help') {
            this.log("AVAILABLE COMMANDS:", "system");
            this.log("  help          - Show this help");
            this.log("  clear         - Clear terminal buffer");
            this.log("  sh [cmd]      - Execute system shell command (NodeJS)");
            this.log("  [js code]     - Execute JS in IDE context");
            this.log("  exit          - Close console window");
            return;
        }

        if (raw.toLowerCase() === 'clear') {
            this.output.innerHTML = '';
            return;
        }

        if (raw.toLowerCase() === 'exit') {
            if (window.parent && window.parent.closeWindow) {
                window.parent.closeWindow('win-console');
            } else {
                window.close();
            }
            return;
        }

        // System Shell Command
        if (raw.startsWith('sh ')) {
            const command = raw.substring(3);
            try {
                const res = await fetch('/api/ide/terminal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command })
                });
                
                if (!res.ok) {
                    this.log(`Backend error: ${res.status} ${res.statusText}`, "error");
                    if (res.status === 404) this.log("TIP: Restart the NodeJS server to activate new endpoints.", "warning");
                    return;
                }

                const data = await res.json();
                if (data.stdout) this.log(data.stdout, 'info', 'SHELL');
                if (data.stderr) this.log(data.stderr, 'warning', 'SHELL');
                if (data.error) this.log(data.error, 'error', 'SHELL');
            } catch (e) {
                this.log("CRITICAL: Could not reach backend logic.", "error");
                this.log("Ensure the local server is running and you have restarted it since the terminal update.", "warning");
            }
            return;
        }

        // JavaScript Execution
        try {
            // Attempt to access parent IDE context if available
            const context = window.parent || window;
            const result = eval.call(context, raw);
            if (result !== undefined) {
                this.log(String(result), 'success', 'JS');
            }
        } catch (e) {
            this.log(e.message, 'error', 'JS');
        }
    }
}

const terminal = new Terminal();

// Listen for messages from parent
window.addEventListener('message', (e) => {
    const data = e.data;
    if (data.type === 'log') {
        terminal.log(data.message, data.level, data.source);
    }
});
