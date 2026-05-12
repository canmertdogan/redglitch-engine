        const tools = [
            // SYSTEM
            { id: 'dashboard', category: 'SYSTEM', title: 'Launcher', icon: 'fa-rocket', src: 'dashboard.html', w: 900, h: 700 },
            { id: 'project_dashboard', category: 'SYSTEM', title: 'Command Center', icon: 'fa-tachometer-alt', src: 'project_dashboard.html', w: 1000, h: 600 },
            { id: 'menu', category: 'SYSTEM', title: 'Interface (UI)', icon: 'fa-window-restore', src: 'menu_editor.html', w: 900, h: 600 },
            { id: 'loc', category: 'SYSTEM', title: 'Localization', icon: 'fa-globe', src: 'localization_editor.html', w: 900, h: 600 },
            { id: 'input', category: 'SYSTEM', title: 'Input Map', icon: 'fa-gamepad', src: 'input_editor.html', w: 600, h: 600 },
            { id: 'console', category: 'SYSTEM', title: 'System Logs', icon: 'fa-terminal', src: 'console.html', w: 800, h: 500 },
            
            // WORLD ARCHITECT
            { id: 'editor', category: 'WORLD ARCHITECT', title: 'Level Editor', icon: 'fa-map', src: 'editor.html', w: 1000, h: 700 },
            { id: 'topdown3d_studio', category: 'WORLD ARCHITECT', title: 'Topdown 3D Studio', icon: 'fa-map', src: 'topdown3d_editor.html', w: 1400, h: 900 },
            { id: 'fps_studio', category: 'WORLD ARCHITECT', title: 'FPS 3D Studio', icon: 'fa-crosshairs', src: 'fps_editor.html', w: 1400, h: 900 },
            { id: 'platformer3d_studio', category: 'WORLD ARCHITECT', title: 'Platformer 3D Studio', icon: 'fa-star', src: 'platformer3d_editor.html', w: 1400, h: 900 },
            { id: 'iso_studio', category: 'WORLD ARCHITECT', title: 'IsoPixel Studio', icon: 'fa-cubes', src: 'iso_editor.html', w: 1000, h: 700 },
            { id: 'platformer_studio', category: 'WORLD ARCHITECT', title: 'Platformer Studio', icon: 'fa-running', src: 'platformer_editor.html', w: 1200, h: 800 },
            { id: 'background', category: 'WORLD ARCHITECT', title: 'Backgrounds', icon: 'fa-image', src: 'background_editor.html', w: 900, h: 600 },
            { id: 'campaign', category: 'WORLD ARCHITECT', title: 'Campaign Flow', icon: 'fa-flag', src: 'campaign_editor.html', w: 800, h: 500 },
            
            // ENTITIES
            { id: 'prefab', category: 'ENTITIES', title: 'Prefab Builder', icon: 'fa-cubes', src: 'prefab_editor.html', w: 800, h: 600 },
            { id: 'npc', category: 'ENTITIES', title: 'NPC Editor', icon: 'fa-user-friends', src: 'npc_editor.html', w: 700, h: 500 },
            { id: 'enemy', category: 'ENTITIES', title: 'Enemy Editor', icon: 'fa-skull', src: 'enemy_editor.html', w: 700, h: 500 },
            { id: 'item', category: 'ENTITIES', title: 'Item Database', icon: 'fa-scroll', src: 'item_editor.html', w: 700, h: 500 },
            { id: 'character', category: 'ENTITIES', title: 'Player Profiles', icon: 'fa-user-ninja', src: 'character_editor.html', w: 700, h: 500 },
            { id: 'skill', category: 'ENTITIES', title: 'Skills', icon: 'fa-bolt', src: 'skill_editor.html', w: 700, h: 500 },
            { id: 'achievements', category: 'ENTITIES', title: 'Trophies', icon: 'fa-trophy', src: 'achievements_editor.html', w: 700, h: 500 },
            
            // LOGIC & AI
            { id: 'script', category: 'LOGIC & AI', title: 'Script Editor', icon: 'fa-code', src: 'script_editor.html', w: 1000, h: 700 },
            { id: 'algorithm', category: 'LOGIC & AI', title: 'Node Logic', icon: 'fa-project-diagram', src: 'algorithm_editor.html', w: 1000, h: 700 },
            { id: 'behavior', category: 'LOGIC & AI', title: 'AI Brains', icon: 'fa-brain', src: 'behavior_editor.html', w: 900, h: 600 },
            { id: 'quests', category: 'LOGIC & AI', title: 'Quest Designer', icon: 'fa-exclamation-circle', src: 'quest_editor.html', w: 900, h: 600 },
            { id: 'dialogue', category: 'LOGIC & AI', title: 'Dialogues', icon: 'fa-comments', src: 'dialogue_editor.html', w: 800, h: 500 },
            { id: 'interactive_cutscene', category: 'LOGIC & AI', title: 'Cutscene Studio', icon: 'fa-theater-masks', src: 'interactive_cutscene_editor.html', w: 1200, h: 800 },
            
            // ASSETS
            { id: 'daw', category: 'ASSETS', title: 'Audio Studio', icon: 'fa-music', src: 'daw.html', w: 800, h: 500 },
            { id: 'pixel', category: 'ASSETS', title: 'Pixel Art', icon: 'fa-paint-brush', src: 'pixel_editor.html', w: 900, h: 650 },
            { id: 'fxpro', category: 'ASSETS', title: 'FX Master', icon: 'fa-magic', src: 'fx_editor.html', w: 900, h: 650 },
            { id: 'shader', category: 'ASSETS', title: 'Shader Lab', icon: 'fa-eye', src: 'shader_editor.html', w: 1000, h: 700 },
            { id: 'assets', category: 'ASSETS', title: 'File Manager', icon: 'fa-folder', src: 'asset_manager.html', w: 900, h: 600 }
        ];

        let zIndexCounter = 100;
        let snapMode = null;
        let diagnostics = { errors: 0, warnings: 0 };

        function formatProjectName(name) {
            if (!name) return "";
            let display = name.toUpperCase();
            if (display.length > 15) {
                display = display.substring(0, 15) + "...";
            }
            return display;
        }

        async function init() {
            // Populate Sidebar with Categories
            const list = document.getElementById('module-list');
            list.innerHTML = '';
            
            const categories = ['WORLD ARCHITECT', 'ENTITIES', 'LOGIC & AI', 'ASSETS', 'SYSTEM'];
            const grouped = {};
            
            tools.forEach(t => {
                if(!grouped[t.category]) grouped[t.category] = [];
                grouped[t.category].push(t);
            });
            
            categories.forEach(cat => {
                if(grouped[cat]) {
                    const catDiv = document.createElement('div');
                    catDiv.className = 'tool-category';
                    catDiv.innerHTML = `<div class="cat-title">${cat}</div>`;
                    
                    grouped[cat].forEach(tool => {
                        const btn = document.createElement('div');
                        btn.className = 'tool-btn-sidebar';
                        btn.id = 'btn-' + tool.id;
                        btn.innerHTML = `<div><i class="fas ${tool.icon}"></i> ${tool.title.toLowerCase()}</div>`;
                        btn.onclick = () => {
                            openWindow(tool);
                            // Proactive Kai Tip
                            if (window.KAI && window.KAI.showBalloon) {
                                const tips = {
                                    'platformer_studio': ">> SUGGESTION: EXECUTE PROCEDURAL_LEVEL_GENERATOR.EXE",
                                    'script': ">> ANALYZING CODE... SYNTAX_EFFICIENCY: 84%. NEED OPTIMIZATION?",
                                    'pixel': ">> PIXEL_DENSITY_OPTIMAL. READY FOR MASTERPIECE_INIT.SH",
                                    'npc': ">> DETECTED VACANT_NPC_BRAINS. UPLOADING HEURISTICS...",
                                    'daw': ">> FREQUENCY_SPECTRUM_BALANCED. COMMENCING AUDIO_SYNTHESIS."
                                };
                                if (tips[tool.id]) window.KAI.showBalloon(tips[tool.id]);
                            }
                        };
                        catDiv.appendChild(btn);
                    });
                    list.appendChild(catDiv);
                }
            });

            // Clock
            updateClock();
            setInterval(updateClock, 60000);

            // Check Project & Determine Startup Window
            await determineStartupWindow();

            // System Meter update
            setInterval(updateSystemMeter, 3000);
            updateSystemMeter();
            
            // Console Hooks
            hookConsole();
            
            // Setup PostMessage listener for child windows
            window.addEventListener('message', handleChildMessage);
        }

        async function determineStartupWindow() {
            console.log("[Studio] Determining startup window...");
            try {
                const res = await fetch('/api/projects/current');
                if (!res.ok) throw new Error("API not ready");
                const data = await res.json();
                const projName = data.name;
                console.log("[Studio] Active Project:", projName);
                window._ketebeActiveProject = projName;
                
                // Update Status Bar
                document.getElementById('sb-project-name').innerText = formatProjectName(projName);

                // If no specific project is active (ROOT), go back to Launcher
                if (data.isRoot) {
                    console.log("[Studio] No project active (Root), redirecting to Launcher...");
                    window.location.href = 'dashboard.html';
                } else {
                    console.log("[Studio] Project active, maximizing and opening Command Center...");
                    // Maximize window if in Electron — only once per session to avoid reload toggles
                    if (window.electronAPI) {
                        try {
                            if (!sessionStorage.getItem('ketebe_studio_auto_maximized')) {
                                window.electronAPI.maximize();
                                sessionStorage.setItem('ketebe_studio_auto_maximized', '1');
                            } else {
                                console.log('[Studio] Auto-maximize skipped (already applied this session)');
                            }
                        } catch (err) {
                            // If sessionStorage unavailable, still attempt maximize but avoid crashing
                            window.electronAPI.maximize();
                        }
                    }
                    // Specific project active, show Command Center
                    openWindow(tools.find(t => t.id === 'project_dashboard'));
                }

            } catch(e) {
                console.error("[Studio] Startup error:", e);
                window.location.href = 'dashboard.html';
            }
        }

        // Called by Launcher when a project is selected
        window.onProjectLoaded = function(name) {
            // Close Launcher
            const launcherId = 'win-dashboard';
            const launcherWin = document.getElementById(launcherId);
            if(launcherWin) closeWindow(launcherId);

            // Update Status Bar
            document.getElementById('sb-project-name').innerText = formatProjectName(name);

            // Open Command Center
            const cmdCenter = tools.find(t => t.id === 'project_dashboard');
            if(cmdCenter) openWindow(cmdCenter);
        };
        
        let logBuffer = [];
        
        function hookConsole() {
            const originalError = console.error;
            const originalWarn = console.warn;
            const originalLog = console.log;
            
            function capture(msg, level, source='IDE') {
                const entry = { message: msg, level: level, source: source, timestamp: Date.now() };
                logBuffer.push(entry);
                if (logBuffer.length > 500) logBuffer.shift(); // Keep last 500
                
                // If console window is open, send immediately
                const consoleFrame = document.getElementById('frame-console');
                if (consoleFrame && consoleFrame.contentWindow) {
                    consoleFrame.contentWindow.postMessage({ type: 'log', ...entry }, '*');
                }
            }
            
            console.error = function(...args) {
                diagnostics.errors++;
                updateDiagnosticsUI();
                const msg = args.map(a => String(a)).join(' ');
                capture(msg, 'error');
                
                // Phase 10: Emit to EventBus for AI Co-Pilot
                if (window.KetebeEventBus) {
                    window.KetebeEventBus.emit('editor:error', { message: msg });
                }
                
                originalError.apply(console, args);
            };
            
            console.warn = function(...args) {
                diagnostics.warnings++;
                updateDiagnosticsUI();
                capture(args.map(a => String(a)).join(' '), 'warning');
                originalWarn.apply(console, args);
            };
            
            console.log = function(...args) {
                capture(args.map(a => String(a)).join(' '), 'info');
                originalLog.apply(console, args);
            };
        }
        
        function updateDiagnosticsUI() {
            document.getElementById('sb-errors').innerText = diagnostics.errors;
            document.getElementById('sb-warnings').innerText = diagnostics.warnings;
        }
        
        function handleChildMessage(event) {
            const data = event.data;
            if (!data) return;
            
            if (data.type === 'cursor-update') {
                document.getElementById('sb-cursor-pos').innerText = `Ln ${data.line}, Col ${data.col}`;
            } else if (data.type === 'status-message') {
                showStatusMessage(data.message);
            } else if (data.type === 'log') {
                // Log from child window (game)
                if (data.level === 'error') {
                    diagnostics.errors++;
                    updateDiagnosticsUI();
                } else if (data.level === 'warning') {
                    diagnostics.warnings++;
                    updateDiagnosticsUI();
                }
                
                // Add to buffer and forward to console window
                const entry = { message: data.message, level: data.level, source: 'GAME', timestamp: Date.now() };
                logBuffer.push(entry);
                if (logBuffer.length > 500) logBuffer.shift();

                const consoleFrame = document.getElementById('frame-console');
                if (consoleFrame && consoleFrame.contentWindow) {
                    consoleFrame.contentWindow.postMessage({ type: 'log', ...entry }, '*');
                }
            }
        }
        
        // When console is opened, flush buffer
        const originalOpenWindow = openWindow;
        openWindow = function(tool) {
            originalOpenWindow(tool);
            if (tool.id === 'console') {
                setTimeout(() => {
                    const consoleFrame = document.getElementById('frame-console');
                    if (consoleFrame && consoleFrame.contentWindow) {
                        logBuffer.forEach(entry => {
                            consoleFrame.contentWindow.postMessage({ type: 'log', ...entry }, '*');
                        });
                    }
                }, 500); // Wait for load
            }
        };
        
        function showStatusMessage(msg) {
            const el = document.getElementById('sb-message');
            el.innerText = msg;
            el.style.opacity = '1';
            setTimeout(() => {
                el.innerText = 'ketebe STUDIO READY';
                el.style.opacity = '0.8';
            }, 3000);
        }

        async function updateSystemMeter() {
            try {
                const res = await fetch('/api/system/stats');
                const stats = await res.json();
                
                // Update Status Bar
                const cpu = stats.cpu || 0;
                const mem = stats.mem || 0;
                document.getElementById('sb-cpu').innerText = Math.round(cpu) + '%';
                document.getElementById('sb-mem').innerText = mem + 'M';
                
            } catch(e) {
                console.warn('System meter update failed:', e);
            }
        }

        async function checkActiveProject() {
            try {
                const res = await fetch('/api/projects/current');
                if (!res.ok) throw new Error("API not ready");
                const data = await res.json();
                const projName = data.name;
                // Update Status Bar Project Name
                document.getElementById('sb-project-name').innerText = formatProjectName(projName);
            } catch(e) {
                document.getElementById('sb-project-name').innerText = "DEFAULT";
            }
        }
        
        let currentBuildTarget = 'win';
        function setBuildTarget(target) {
            currentBuildTarget = target;
            const map = {
                'win': 'Windows (EXE)',
                'macos': 'macOS (.app)',
                'android': 'Android (APK)',
                'ios': 'iOS (Xcode)',
                'web': 'Web (HTML5)',
                'all': 'CI (All Targets)'
            };
            const label = map[target] || 'Unknown';
            document.getElementById('sb-build-target').innerText = label;
            document.getElementById('build-target').value = target;
            showStatusMessage(`Build Target Set: ${label}`);
            openBuildWizard(target);
        }

        function applyTheme(themeName, options = {}) {
            if (typeof window.setTheme === 'function') {
                window.setTheme(themeName);
            } else {
                localStorage.setItem('ketebe_theme', themeName);
            }

            if (options.broadcast !== false) {
                document.querySelectorAll('#window-container iframe').forEach(frame => {
                    const child = frame.contentWindow;
                    if (child && typeof child.setTheme === 'function') {
                        child.setTheme(themeName, { source: 'parent' });
                    }
                });
            }

            showStatusMessage(`THEME SET: ${themeName.toUpperCase()}`);
        }

        // --- BUILD WIZARD ---
        let bwTarget = 'win';
        let bwSSE = null;
        let bwProgress = 0;
        let bwProgressInterval = null;

        function openBuildWizard(target) {
            bwTarget = target || currentBuildTarget;
            // sync target cards
            ['win','macos','android','ios','web','all'].forEach(t => {
                const el = document.getElementById('bwtc-' + t);
                if (el) el.classList.toggle('selected', t === bwTarget);
            });
            // update info
            const projName = document.getElementById('sb-project-name')?.innerText || 'Default Project';
            document.getElementById('bw-project-name').innerText = projName;
            const labelMap = { win:'WINDOWS', macos:'MACOS', android:'ANDROID', ios:'IOS', web:'WEB', all:'ALL CI' };
            document.getElementById('bw-target-label').innerText = labelMap[bwTarget] || bwTarget.toUpperCase();
            // reset to step 1
            bwShowStep(1);
            document.getElementById('bw-footer').innerHTML = `
                <button class="bw-btn bw-btn-cancel" onclick="closeBuildWizard()">CANCEL</button>
                <button class="bw-btn bw-btn-primary" id="bw-btn-start" onclick="bwStartBuild()">START BUILD</button>`;
            document.getElementById('build-wizard').style.display = 'flex';
        }

        function closeBuildWizard() {
            if (bwSSE) { bwSSE.close(); bwSSE = null; }
            clearInterval(bwProgressInterval);
            document.getElementById('build-wizard').style.display = 'none';
        }

        function bwSelectTarget(t) {
            bwTarget = t;
            ['win','macos','android','ios','web','all'].forEach(id => {
                document.getElementById('bwtc-' + id)?.classList.toggle('selected', id === t);
            });
            const labelMap = { win:'WINDOWS', macos:'MACOS', android:'ANDROID', ios:'IOS', web:'WEB', all:'ALL CI' };
            document.getElementById('bw-target-label').innerText = labelMap[t] || t.toUpperCase();
        }

        function bwShowStep(n) {
            document.getElementById('bw-step1').style.display = n === 1 ? '' : 'none';
            document.getElementById('bw-step2').style.display = n === 2 ? '' : 'none';
            document.getElementById('bw-step3').style.display = n === 3 ? '' : 'none';
            [1,2,3].forEach(i => {
                const el = document.getElementById('bw-s' + i);
                el.classList.remove('active','done');
                if (i < n) el.classList.add('done');
                else if (i === n) el.classList.add('active');
            });
        }

        function bwAppendLog(text) {
            const log = document.getElementById('bw-log');
            // Colorize
            const colored = text
                .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                .replace(/(✓|✔|SUCCESS|COMPLETE|Done|done|OK)/g, '<span class="log-ok">$1</span>')
                .replace(/(ERROR|FAILED|Error|error|failed|✗)/g, '<span class="log-err">$1</span>')
                .replace(/(\[BUILDER\]|\[WIZARD\])/g, '<span class="log-acc">$1</span>');
            log.innerHTML += colored;
            log.scrollTop = log.scrollHeight;
        }

        async function bwStartBuild() {
            bwShowStep(2);
            document.getElementById('bw-footer').innerHTML = `
                <button class="bw-btn bw-btn-danger" onclick="closeBuildWizard()">ABORT</button>`;
            document.getElementById('bw-log').innerHTML = '';
            document.getElementById('bw-progress').style.width = '0%';
            document.getElementById('bw-pct').innerText = '0%';
            document.getElementById('bw-spinner').style.display = '';

            const projName = document.getElementById('sb-project-name')?.innerText || 'Default Project';

            // Fake progress pulse while building — asymptotic: fast start, slows near 90%
            bwProgress = 0;
            bwProgressInterval = setInterval(() => {
                if (bwProgress < 89) {
                    const remaining = 90 - bwProgress;
                    bwProgress += Math.random() * remaining * 0.04;
                    const p = Math.min(bwProgress, 89);
                    document.getElementById('bw-progress').style.width = p + '%';
                    document.getElementById('bw-pct').innerText = Math.round(p) + '%';
                }
            }, 800);

            const url = `/api/build/stream?target=${encodeURIComponent(bwTarget)}&project=${encodeURIComponent(projName)}`;
            bwSSE = new EventSource(url);

            bwSSE.onmessage = (e) => {
                const msg = JSON.parse(e.data);
                if (msg.type === 'log' || msg.type === 'error') {
                    bwAppendLog(msg.text);
                } else if (msg.type === 'done') {
                    bwSSE.close(); bwSSE = null;
                    clearInterval(bwProgressInterval);
                    document.getElementById('bw-progress').style.width = '100%';
                    document.getElementById('bw-pct').innerText = '100%';
                    document.getElementById('bw-spinner').style.display = 'none';
                    setTimeout(() => bwShowResult(msg.success, msg.path), 400);
                }
            };

            bwSSE.onerror = () => {
                clearInterval(bwProgressInterval);
                bwSSE.close(); bwSSE = null;
                document.getElementById('bw-spinner').style.display = 'none';
                bwAppendLog('\n[ERROR] Connection lost to build server.\n');
                bwShowResult(false, '');
            };
        }

        function bwShowResult(success, outputPath) {
            bwShowStep(3);
            document.getElementById('bw-result-icon').innerText = success ? '✅' : '❌';
            document.getElementById('bw-result-title').innerText = success ? 'BUILD COMPLETE' : 'BUILD FAILED';
            document.getElementById('bw-result-path').innerText = outputPath || 'See log for details';
            document.getElementById('bw-footer').innerHTML = success
                ? `<button class="bw-btn bw-btn-cancel" onclick="closeBuildWizard()">CLOSE</button>
                   <button class="bw-btn bw-btn-primary" onclick="closeBuildWizard(); showStatusMessage('Build complete!')">DONE</button>`
                : `<button class="bw-btn bw-btn-cancel" onclick="bwShowStep(2)">SEE LOG</button>
                   <button class="bw-btn bw-btn-primary" onclick="bwStartBuild()">RETRY</button>`;
            showStatusMessage(success ? 'BUILD COMPLETE' : 'BUILD FAILED');
        }

        function buildGame() { openBuildWizard(currentBuildTarget); }

        async function cleanBuilds() {
            if(!confirm("Wipe all previous builds from the 'builds' folder?")) return;
            try {
                const res = await fetch('/api/build/clean', { method: 'POST' });
                const data = await res.json();
                if(data.success) showStatusMessage("BUILDS FOLDER CLEANED");
            } catch(e) { console.error(e); }
        }

        // --- DROPDOWN MANAGEMENT ---
        function toggleDropdown(e, id) {
            e.stopPropagation();
            const el = document.getElementById(id);
            const isActive = el.classList.contains('active');
            closeAllDropdowns();
            if (!isActive) el.classList.add('active');
        }

        function closeAllDropdowns() {
            document.querySelectorAll('.dropdown').forEach(d => d.classList.remove('active'));
        }

        window.addEventListener('click', () => {
            closeAllDropdowns();
        });

        // --- PROJECTS & WIZARD ---
        let selectedTemplateId = null;

        async function openProjectManager() {
            document.getElementById('project-modal').style.display = 'flex';
            
            // Restore Author
            const savedAuthor = localStorage.getItem('ketebe_author');
            if(savedAuthor) document.getElementById('new-proj-author').value = savedAuthor;

            const container = document.getElementById('template-list');
            container.innerHTML = '<div style="color:#555; padding:20px;">Loading templates...</div>';
            
            try {
                // 1. Fetch Templates
                const tRes = await fetch('/api/templates');
                const templates = await tRes.json();
                
                renderTemplates(templates);
                
            } catch(e) {
                container.innerHTML = '<div style="color:#e74c3c;">Failed to load templates.</div>';
            }
        }

        function renderTemplates(list) {
            const container = document.getElementById('template-list');
            container.innerHTML = '';
            
            if (list.length === 0) {
                container.innerHTML = '<div style="color:#8fa0bc; padding:20px;">No templates found in archives.</div>';
                return;
            }
            
            list.forEach(t => {
                const card = document.createElement('div');
                card.className = 'template-card';
                card.onclick = () => selectTemplate(t, card);
                
                // Icon based on category
                let icon = '📦';
                if(t.category === 'RPG') icon = '⚔️';
                if(t.category === 'Platformer') icon = '🏃';
                if(t.category === 'Basic') icon = '📄';

                card.innerHTML = `
                    <div class="template-thumb">${icon}</div>
                    <div class="template-info">
                        <div class="template-name">${t.name}</div>
                        <div class="template-cat">${t.category}</div>
                    </div>
                `;
                container.appendChild(card);
            });
            
            // Auto-select first
            if(list.length > 0) {
                // Find base-rpg or first
                const def = list.find(t => t.id === 'base-rpg') || list[0];
                // Simulate click
                const cards = container.children;
                // Find index
                const index = list.indexOf(def);
                if(index >= 0) selectTemplate(def, cards[index]);
            }
        }

        function selectTemplate(t, cardEl) {
            selectedTemplateId = t.id;
            
            // UI Highlight
            document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
            cardEl.classList.add('active');
            
            // Update Info Panel
            document.getElementById('sel-name').innerText = t.name;
            document.getElementById('sel-desc').innerText = t.description;
            
            let icon = '📦';
            if(t.category === 'RPG') icon = '⚔️';
            if(t.category === 'Platformer') icon = '🏃';
            if(t.category === 'Basic') icon = '📄';
            document.getElementById('sel-icon').innerText = icon;
            
            // Enable Create Button
            document.getElementById('btn-create-proj').disabled = false;
        }

        function closeProjectModal() {
            document.getElementById('project-modal').style.display = 'none';
        }

        async function createNewProject() {
            const nameInput = document.getElementById('new-proj-name');
            const name = nameInput.value.trim();
            const author = document.getElementById('new-proj-author').value.trim();
            
            if(!name) return alert("Project name is required.");
            
            // Validation
            const nameRegex = /^[a-zA-Z0-9 \-_]+$/;
            if(!nameRegex.test(name)) return alert("Invalid name. Use letters, numbers, spaces, hyphens, or underscores.");

            if(!selectedTemplateId) return alert("Please select a template.");
            
            // Persist Author
            localStorage.setItem('ketebe_author', author);
            
            const btn = document.getElementById('btn-create-proj');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span>⏳</span> FORGING...';
            btn.disabled = true;

            try {
                // 1. Create Project
                const res = await fetch('/api/projects', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        name, 
                        template: selectedTemplateId,
                        metadata: { author } 
                    })
                });
                
                const data = await res.json();
                
                if (!res.ok) throw new Error(data.error || "Unknown error");
                
                // 2. Switch Context (Use the sanitized name returned by server)
                await fetch('/api/projects/switch', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name: data.name })
                });
                
                closeProjectModal();
                location.reload();
                
            } catch (e) {
                alert("Creation failed: " + e.message);
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }

        // --- BUILD ---
        async function scanAssets() {
            showStatusMessage("INDEXING ASSETS...");
            try {
                const res = await fetch('/api/assets/rebuild', { method: 'POST' });
                const data = await res.json();
                if(data.success) showStatusMessage(`INDEXED ${data.count || ''} ASSETS`);
            } catch(e) { showStatusMessage("INDEX FAILED"); }
        }

        function exportProject() {
            alert("Export functionality coming in v0.2. Check 'builds' folder for manual zip.");
        }

        // --- LAYOUT ---
        function toggleSidebar() {
            const sb = document.getElementById('sidebar');
            const handle = document.getElementById('sidebar-handle');
            sb.classList.toggle('collapsed');
            handle.innerText = sb.classList.contains('collapsed') ? '⏵' : '⏴';
        }

        function toggleRightSidebar() {
            const sb = document.getElementById('right-sidebar');
            const handle = document.getElementById('right-sidebar-handle');
            sb.classList.toggle('collapsed');
            handle.innerText = sb.classList.contains('collapsed') ? '⏴' : '⏵';
        }

        // --- RIGHT SIDEBAR PANE SWITCHING ---
        function switchRightSidebar(pane) {
            console.log('[Studio] Switching right sidebar to:', pane);
            document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
            const tab = document.getElementById(`tab-${pane}`);
            if (tab) tab.classList.add('active');

            document.querySelectorAll('.sidebar-content-pane').forEach(p => p.classList.add('hidden'));
            const paneEl = document.getElementById(`pane-${pane}`);
            if (paneEl) paneEl.classList.remove('hidden');
            
            if (pane === 'files') loadTree();
        }

        let fileTreeData = [];
        let expandedDirs = new Set();

        async function loadTree() {
            const container = document.getElementById('file-tree-right');
            if (!container) return;
            
            container.innerHTML = '<div style="padding:10px; opacity:0.5;">SCANNINC...</div>';
            try {
                const res = await fetch('/api/ide/tree');
                fileTreeData = await res.json();
                renderTree();
            } catch (e) {
                console.error("Tree load failed", e);
                container.innerHTML = '<div style="color:var(--red); padding:10px;">FAILED TO LOAD TREE</div>';
            }
        }

        function renderTree() {
            const container = document.getElementById('file-tree-right');
            if (!container) return;
            container.innerHTML = '';
            
            function buildNode(node, depth) {
                const div = document.createElement('div');
                div.className = `tree-item ${node.type}`;
                div.style.padding = `4px 10px 4px ${10 + depth * 12}px`;
                div.style.fontSize = '13px';
                div.style.cursor = 'pointer';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.gap = '8px';
                
                let isDir = node.type === 'dir' || node.type === 'directory';
                let icon = isDir ? (expandedDirs.has(node.path) ? '📂' : '📁') : '📄';
                if (node.type === 'file') {
                    const ext = node.name.split('.').pop();
                    if (ext === 'js') icon = '<i class="fab fa-js" style="color:#f1c40f"></i>';
                    else if (ext === 'json') icon = '<i class="fas fa-cog" style="color:#aaa"></i>';
                    else if (ext === 'html') icon = '<i class="fas fa-code" style="color:#e44d26"></i>';
                    else icon = '<i class="far fa-file"></i>';
                } else {
                    icon = `<i class="fas ${expandedDirs.has(node.path) ? 'fa-folder-open' : 'fa-folder'}" style="color:#3498db"></i>`;
                }

                div.innerHTML = `<span style="width:16px; text-align:center;">${icon}</span><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${node.name.toLowerCase()}</span>`;
                
                div.onclick = (e) => {
                    e.stopPropagation();
                    if (node.type === 'file') {
                        // Open in script editor
                        const scriptTool = tools.find(t => t.id === 'script_editor');
                        if (scriptTool) {
                            openWindow({...scriptTool, src: `script_editor.html?file=${encodeURIComponent(node.path)}`});
                        }
                    } else {
                        if (expandedDirs.has(node.path)) expandedDirs.delete(node.path);
                        else expandedDirs.add(node.path);
                        renderTree();
                    }
                };
                
                container.appendChild(div);

                if (isDir && expandedDirs.has(node.path) && node.children) {
                    const sorted = [...node.children].sort((a,b) => {
                        if (a.type === b.type) return a.name.localeCompare(b.name);
                        return a.type === 'dir' ? -1 : 1;
                    });
                    sorted.forEach(c => buildNode(c, depth + 1));
                }
            }

            fileTreeData.forEach(root => buildNode(root, 0));
        }

        async function createNewFile() {
            const name = prompt("New file name (inside active project):");
            if (!name) return;
            try {
                const res = await fetch('/api/ide/write', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ file: name, content: "// Ketebe Script\n" })
                });
                if (res.ok) loadTree();
            } catch (e) { alert("Failed to create file"); }
        }

        async function createNewFolder() { alert("Folder support coming soon!"); }


        function openWindow(tool) {
            const winId = 'win-' + tool.id;
            let win = document.getElementById(winId);

            if (!win) {
                win = document.createElement('div');
                win.id = winId;
                win.className = 'window maximized';
                
                win.innerHTML = `
                    <div class="window-title" 
                         onmousedown="startDrag(event, '${winId}')"
                         ondblclick="toggleMaximize('${winId}')">
                        <div><i class="fas ${tool.icon}"></i> ${tool.title.toLowerCase()}</div>
                        <div class="window-controls">
                            <div class="window-btn" onclick="minimizeWindow('${winId}')">_</div>
                            <div class="window-btn" onclick="toggleMaximize('${winId}')">□</div>
                            <div class="window-btn close" onclick="closeWindow('${winId}')">×</div>
                        </div>
                    </div>
                    <div class="window-content">
                        <iframe id="frame-${tool.id}" src="${(() => { const proj3dIds = ['topdown3d_studio', 'fps_studio', 'platformer3d_studio']; return (proj3dIds.includes(tool.id) && window._ketebeActiveProject) ? tool.src + '?project=' + encodeURIComponent(window._ketebeActiveProject) : tool.src; })()}"></iframe>
                    </div>
                `;
                win.onmousedown = () => focusWindow(winId);
                document.getElementById('workspace').appendChild(win);
                const btn = document.getElementById('btn-' + tool.id);
                if (btn) btn.classList.add('opened');
            } else {
                win.style.display = 'flex';
            }
            
            // Log activity
            if (window.KetebeProjectState) {
                window.KetebeProjectState.logActivity('tool', tool.title, { id: tool.id });
            }
            
            focusWindow(winId);
        }

        function closeWindow(id) {
            document.getElementById(id).remove();
            const toolId = id.replace('win-', '');
            const btn = document.getElementById('btn-' + toolId);
            if (btn) {
                btn.classList.remove('opened');
                btn.classList.remove('active');
            }
        }

        function minimizeWindow(id) {
            document.getElementById(id).style.display = 'none';
            const btn = document.getElementById('btn-' + id.replace('win-',''));
            if (btn) btn.classList.remove('active');
        }

        function toggleMaximize(id) {
            const win = document.getElementById(id);
            if (!win) return;
            win.classList.toggle('maximized');
            if (!win.classList.contains('maximized')) {
                win.style.width = '800px';
                win.style.height = '600px';
                win.style.top = '50px';
                win.style.left = '50px';
            }
        }

        function focusWindow(id) {
            document.querySelectorAll('.window').forEach(w => w.classList.remove('focused'));
            document.querySelectorAll('.module-btn').forEach(b => b.classList.remove('active'));
            
            const win = document.getElementById(id);
            if(win) {
                win.style.display = 'flex';
                win.classList.add('focused');
                zIndexCounter++;
                win.style.zIndex = zIndexCounter;
                const toolId = id.replace('win-', '');
                const btn = document.getElementById('btn-' + toolId);
                if (btn) btn.classList.add('active');
            }
        }

        // --- Dragging & Snapping ---
        let dragTarget = null;
        let offX, offY;

        function startDrag(e, id) {
            const win = document.getElementById(id);
            if (e.target.classList.contains('window-btn')) return;

            // If dragging a maximized window, restore it first
            if (win.classList.contains('maximized')) {
                toggleMaximize(id);
                // Adjust offX/offY so the window doesn't jump
                offX = 400; // Half of 800px default
                offY = 15;  // Half of title bar
            } else {
                const rect = win.getBoundingClientRect();
                offX = e.clientX - rect.left;
                offY = e.clientY - rect.top;
            }

            dragTarget = win;
            dragTarget.classList.add('dragging');
            focusWindow(id);
        }

        window.onmousemove = (e) => {
            if (!dragTarget) return;

            const workspace = document.getElementById('workspace');
            const wsRect = workspace.getBoundingClientRect();
            const ghost = document.getElementById('snap-ghost');
            
            let x = e.clientX - offX - wsRect.left;
            let y = e.clientY - offY - wsRect.top;

            // --- STICKY / SNAPPING LOGIC ---
            const stickDist = 20;
            snapMode = null;
            ghost.style.display = 'none';

            // 1. Screen Edge Snapping (Ghost Preview)
            if (e.clientY < 40) {
                snapMode = 'top';
                ghost.style.display = 'block';
                ghost.style.top = '0'; ghost.style.left = wsRect.left + 'px';
                ghost.style.width = wsRect.width + 'px'; ghost.style.height = wsRect.height + 'px';
            } else if (e.clientX < wsRect.left + 20) {
                snapMode = 'left';
                ghost.style.display = 'block';
                ghost.style.top = wsRect.top + 'px'; ghost.style.left = wsRect.left + 'px';
                ghost.style.width = (wsRect.width / 2) + 'px'; ghost.style.height = wsRect.height + 'px';
            } else if (e.clientX > wsRect.right - 20) {
                snapMode = 'right';
                ghost.style.display = 'block';
                ghost.style.top = wsRect.top + 'px'; ghost.style.left = (wsRect.left + wsRect.width / 2) + 'px';
                ghost.style.width = (wsRect.width / 2) + 'px'; ghost.style.height = wsRect.height + 'px';
            } 

            // 2. Window-to-Window Sticking (Direct X/Y manipulation)
            if (!snapMode) {
                const others = Array.from(document.querySelectorAll('.window')).filter(w => w !== dragTarget && w.style.display !== 'none');
                
                others.forEach(other => {
                    const r = other.getBoundingClientRect();
                    const orX = r.left - wsRect.left;
                    const orY = r.top - wsRect.top;
                    const orW = r.width;
                    const orH = r.height;

                    // Stick to Left/Right of others
                    if (Math.abs(x + dragTarget.offsetWidth - orX) < stickDist) x = orX - dragTarget.offsetWidth;
                    if (Math.abs(x - (orX + orW)) < stickDist) x = orX + orW;
                    
                    // Stick to Top/Bottom of others
                    if (Math.abs(y + dragTarget.offsetHeight - orY) < stickDist) y = orY - dragTarget.offsetHeight;
                    if (Math.abs(y - (orY + orH)) < stickDist) y = orY + orH;
                });

                // Workspace Edge Sticking (Soft snap)
                if (Math.abs(x) < stickDist) x = 0;
                if (Math.abs(y) < stickDist) y = 0;
                if (Math.abs(x + dragTarget.offsetWidth - wsRect.width) < stickDist) x = wsRect.width - dragTarget.offsetWidth;
                if (Math.abs(y + dragTarget.offsetHeight - wsRect.height) < stickDist) y = wsRect.height - dragTarget.offsetHeight;
            }

            dragTarget.style.left = x + 'px';
            dragTarget.style.top = y + 'px';
        };

        window.onmouseup = () => {
            if (dragTarget) {
                dragTarget.classList.remove('dragging');
                if (snapMode) {
                    if (snapMode === 'top') {
                        toggleMaximize(dragTarget.id);
                    } else if (snapMode === 'left') {
                        dragTarget.classList.remove('maximized');
                        dragTarget.style.top = '0'; dragTarget.style.left = '0';
                        dragTarget.style.width = '50%'; dragTarget.style.height = '100%';
                    } else if (snapMode === 'right') {
                        dragTarget.classList.remove('maximized');
                        dragTarget.style.top = '0'; dragTarget.style.left = '50%';
                        dragTarget.style.width = '50%'; dragTarget.style.height = '100%';
                    }
                }
            }
            dragTarget = null;
            snapMode = null;
            document.getElementById('snap-ghost').style.display = 'none';
        };

        function updateClock() {
            const now = new Date();
            document.getElementById('sb-clock').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        function saveGlobalProject() {
            // In this engine, most things save instantly, but we provide a visual feedback
            const status = document.getElementById('active-project-name');
            const original = status.innerText;
            status.innerText = "SAVING PROJECT...";
            status.style.color = "var(--accent)";
            showStatusMessage("SAVING PROJECT...");
            
            setTimeout(() => {
                status.innerText = original;
                status.style.color = "#fff";
                showStatusMessage("PROJECT SAVED");
            }, 1000);
        }

        function confirmClose() {
            if (confirm("Are you sure you want to leave ketebe STUDIO? Unsaved changes in specific tools might be lost.")) {
                if(window.electronAPI) window.electronAPI.close();
            }
        }

        function playGame() { 
            // Visuals ON
            setRunningState(true);
            showStatusMessage("GAME RUNNING");

            const gameWin = window.open('launcher.html', '_blank');

            if (gameWin) {
                const timer = setInterval(() => {
                    if (gameWin.closed) {
                        clearInterval(timer);
                        // Visuals OFF
                        setRunningState(false);
                        showStatusMessage("GAME STOPPED");
                    }
                }, 1000);
            } else {
                 // Blocked or failed
                 setRunningState(false);
                 showStatusMessage("GAME LAUNCH FAILED");
            }
        }

        function setRunningState(isRunning) {
            const captionElements = document.querySelectorAll('.app-caption span, .app-caption i, .app-icon i');
            const sidebarBtn = document.getElementById('sidebar-launch-btn');

            if (isRunning) {
                captionElements.forEach(el => el.classList.add('running-text'));
                if(sidebarBtn) {
                    sidebarBtn.innerHTML = '<span class="action-icon">⏳</span> RUNNING...';
                    sidebarBtn.classList.add('running-btn');
                }
            } else {
                captionElements.forEach(el => el.classList.remove('running-text'));
                if(sidebarBtn) {
                    sidebarBtn.innerHTML = '<span class="action-icon">▶</span> LAUNCH GAME';
                    sidebarBtn.classList.remove('running-btn');
                }
            }
        }

        function toggleConsole() {
            const consoleTool = tools.find(t => t.id === 'console');
            if (consoleTool) openWindow(consoleTool);
        }

        function editSpriteInStudio(key) {
            const pixelTool = tools.find(t => t.id === 'pixel');
            openWindow(pixelTool);
            setTimeout(() => {
                const frame = document.getElementById('frame-pixel');
                if (frame && frame.contentWindow.loadSprite) frame.contentWindow.loadSprite(key);
            }, 200);
        }

        // --- NEW TOOLBAR FUNCTIONS ---
        function dispatchGlobalCommand(cmd) {
            // Find focused window iframe
            const focusedWin = document.querySelector('.window.focused iframe');
            if (focusedWin) {
                // Post message to the iframe to handle the command
                focusedWin.contentWindow.postMessage({ type: 'execCommand', command: cmd }, '*');
                console.log(`Dispatched ${cmd} to focused window.`);
            } else {
                // Fallback for main window focus if applicable, or generic alert
                document.execCommand(cmd); 
            }
        }

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        }

        // Expose tools for dashboard iframe access
        window.tools = tools;

