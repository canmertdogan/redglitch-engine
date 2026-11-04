        (function() {
            const output = document.getElementById('terminal-output');
            const input = document.getElementById('command-input');
            const statusChip = document.getElementById('status-chip');

            let unlocked = localStorage.getItem('redglitch_terminal_unlocked') === '1';
            let clueStep = 0;
            let history = [];
            let historyIndex = 0;

            function line(text, klass) {
                const span = document.createElement('span');
                span.className = klass ? "line " + klass : "line";
                span.textContent = text;
                output.appendChild(span);
                output.appendChild(document.createTextNode("\n"));
                output.scrollTop = output.scrollHeight;
            }

            function boot() {
                line("REDGLITCH SECURE NODE // RETRO TERMINAL INTERFACE", "warn");
                line("Build 1.0.43 // Session initialized.", "dim");
                line("Type 'help' to list commands.", "dim");
                line("");
                line("Puzzle objective: recover the passphrase and unlock hidden commands.", "warn");
                line("Hint: run 'clue' more than once.");
                if (unlocked) {
                    statusChip.textContent = "unlocked";
                    line("Welcome back, operator. Secret channel already unlocked.", "warn");
                }
            }

            function clearOutput() {
                output.textContent = "";
            }

            function unlock() {
                unlocked = true;
                localStorage.setItem('redglitch_terminal_unlocked', '1');
                statusChip.textContent = "unlocked";
                line("PASSCODE ACCEPTED. Secret channel unlocked.", "warn");
                line("Now available: run secret, run credits, run campaign, run quick, run editor, run tools");
            }

            function listHelp() {
                line("Available commands:", "dim");
                line("  help       - show this list");
                line("  clear      - clear terminal");
                line("  whoami     - show active profile");
                line("  clue       - reveal passphrase clues");
                line("  bootlog    - replay puzzle briefing");
                line("  run <cmd>  - open pages (more unlock after puzzle)");
                line("  reset      - lock terminal again");
            }

            function doRun(arg) {
                const map = {
                    credits: "credits.html",
                    campaign: "slot_selection.html",
                    quick: "campaign_launcher.html",
                    editor: "campaign_editor.html",
                    tools: "tools.html",
                    secret: "credits.html#decoded"
                };

                if (!arg) {
                    line("Usage: run <credits|campaign|quick|editor|tools|secret>", "error");
                    return;
                }

                if (!unlocked && arg !== "credits") {
                    line("Channel locked. Solve the puzzle first. Try: clue", "error");
                    return;
                }

                const target = map[arg];
                if (!target) {
                    line("Unknown run target: " + arg, "error");
                    return;
                }

                line("Launching: " + arg + "...", "dim");
                window.location.href = target;
            }

            function doClue() {
                clueStep += 1;
                if (clueStep === 1) {
                    line("CLUE[1]: The key starts with the engine core: V8", "warn");
                    return;
                }
                if (clueStep === 2) {
                    line("CLUE[2]: Add a separator, then the word 'EASTER'.", "warn");
                    return;
                }
                if (clueStep === 3) {
                    line("CLUE[3]: End with another separator and 'REDGLITCH'.", "warn");
                    line("Submit with: pass <phrase>", "dim");
                    return;
                }
                line("No more clues. Build the phrase from all parts.", "dim");
            }

            function resetLock() {
                unlocked = false;
                clueStep = 0;
                localStorage.removeItem('redglitch_terminal_unlocked');
                statusChip.textContent = "locked";
                line("Terminal lock restored.", "warn");
            }

            function runCommand(raw) {
                const command = raw.trim();
                if (!command) return;

                history.push(command);
                historyIndex = history.length;

                line("operator@redglitch:~$ " + command, "dim");
                const [cmd, ...rest] = command.split(/\s+/);
                const arg = rest.join(" ");

                if (cmd === "help") return listHelp();
                if (cmd === "clear") return clearOutput();
                if (cmd === "whoami") {
                    const user = localStorage.getItem('redglitch_username') || "guest";
                    line("active-profile: " + user);
                    return;
                }
                if (cmd === "clue") return doClue();
                if (cmd === "bootlog") return boot();
                if (cmd === "reset") return resetLock();
                if (cmd === "run") return doRun(arg.toLowerCase());
                if (cmd === "pass") {
                    if (arg.toUpperCase() === "V8-EASTER-REDGLITCH") unlock();
                    else line("Invalid passphrase.", "error");
                    return;
                }

                line("Unknown command: " + cmd + " (try 'help')", "error");
            }

            input.addEventListener('keydown', (event) => {
                if (event.key === "Enter") {
                    runCommand(input.value);
                    input.value = "";
                    return;
                }

                if (event.key === "ArrowUp") {
                    if (history.length === 0) return;
                    historyIndex = Math.max(0, historyIndex - 1);
                    input.value = history[historyIndex] || "";
                    event.preventDefault();
                    return;
                }

                if (event.key === "ArrowDown") {
                    if (history.length === 0) return;
                    historyIndex = Math.min(history.length, historyIndex + 1);
                    input.value = history[historyIndex] || "";
                    event.preventDefault();
                }
            });

            boot();
            input.focus();
        })();
