document.addEventListener('DOMContentLoaded', () => {
    // 0. BOOTLOADER SEQUENCE
    const bootloader = document.getElementById('bootloader');
    const bootProgress = document.getElementById('boot-progress');
    if (bootloader && bootProgress) {
        const steps = [
            'MOUNTING_VFS...',
            'LOADING_NEURAL_WEIGHTS...',
            'LINKING_WEB_GPU...',
            'INITIALIZING_ISO_BUS...',
            'SYSTEM_READY'
        ];
        let step = 0;
        const interval = setInterval(() => {
            bootProgress.textContent = steps[step];
            step++;
            if (step >= steps.length) {
                clearInterval(interval);
                setTimeout(() => {
                    bootloader.classList.add('loaded');
                }, 500);
            }
        }, 300);
    }

    // 1. DYNAMIC HERO LOG
    const heroLog = document.getElementById('hero-log');
    if (heroLog) {
        const logs = [
            'INIT_CORE_BOOTLOADER...',
            'MEMORY_MAP: 0x00FF88',
            'NEURAL_LINK_STABLE',
            'ISO_RENDERER: RUNNING',
            'AABB_COLLISION: OK',
            'DAW_SEQ_ACTIVE',
            'SYSTEM_READY'
        ];
        let i = 0;
        setInterval(() => {
            const line = document.createElement('div');
            line.textContent = '> ' + logs[i];
            heroLog.appendChild(line);
            if (heroLog.childNodes.length > 8) heroLog.removeChild(heroLog.firstChild);
            i = (i + 1) % logs.length;
        }, 1200);
    }

    // 2. HERO MINI-ISO RENDERER
    const canvas = document.getElementById('heroCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;

        function resize() {
            width = canvas.parentElement.offsetWidth;
            height = canvas.parentElement.offsetHeight;
            canvas.width = width;
            canvas.height = height;
        }
        window.addEventListener('resize', resize);
        resize();

        const tileSize = 28;
        const grid = [];
        for (let x = 0; x < 6; x++) {
            for (let y = 0; y < 6; y++) {
                grid.push({ x, y, z: Math.random() * 0.4, color: Math.random() > 0.8 ? '#f1c40f' : '#333' });
            }
        }

        function drawCube(x, y, z, color) {
            const isoX = (x - y) * tileSize;
            const isoY = (x + y) * (tileSize / 2) - (z * tileSize);
            const screenX = width / 2 + isoX;
            const screenY = height / 2 + isoY;

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY - tileSize / 2);
            ctx.lineTo(screenX + tileSize, screenY);
            ctx.lineTo(screenX, screenY + tileSize / 2);
            ctx.lineTo(screenX - tileSize, screenY);
            ctx.fill();

            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.moveTo(screenX, screenY + tileSize / 2);
            ctx.lineTo(screenX + tileSize, screenY);
            ctx.lineTo(screenX + tileSize, screenY + tileSize);
            ctx.lineTo(screenX, screenY + tileSize + tileSize / 2);
            ctx.fill();
        }

        let time = 0;
        let freq = 4;
        canvas.addEventListener('mousedown', () => freq = 12);
        canvas.addEventListener('mouseup', () => freq = 4);
        
        function animate() {
            time += 0.04;
            ctx.clearRect(0, 0, width, height);
            grid.forEach(tile => {
                const wave = Math.sin(time + tile.x + tile.y) * freq;
                drawCube(tile.x - 2.5, tile.y - 2.5, tile.z + wave/tileSize, tile.color);
            });
            requestAnimationFrame(animate);
        }
        animate();
    }

    // 3. TYPEWRITER EFFECT (PRO)
    const typeEls = document.querySelectorAll('.typewriter');
    typeEls.forEach(el => {
        const text = el.textContent;
        el.textContent = '';
        let i = 0;
        const type = () => {
            if (i < text.length) {
                el.textContent += text.charAt(i);
                i++;
                setTimeout(type, 15);
            }
        };
        setTimeout(type, 1000);
    });

    // 4. NUDGE INTERACTION
    const nudgeBtn = document.getElementById('nudgeBtn');
    const msnChat = document.getElementById('msnChat');
    if (nudgeBtn && msnChat) {
        nudgeBtn.addEventListener('click', () => {
            msnChat.style.animation = 'nudge 0.1s infinite';
            setTimeout(() => msnChat.style.animation = '', 500);
        });
    }

    // 6. VISUAL PROTOCOL SWITCHER
    document.querySelectorAll('.btn-switcher').forEach(btn => {
        btn.addEventListener('click', () => {
            const fx = btn.getAttribute('data-fx');
            const theme = btn.getAttribute('data-theme');
            
            if (fx) {
                document.body.classList.toggle(fx + '-off');
                btn.classList.toggle('active');
            }
            
            if (theme) {
                document.body.classList.remove('amber-theme', 'green-theme');
                document.querySelectorAll('[data-theme]').forEach(b => b.classList.remove('active'));
                if (theme !== 'default') {
                    document.body.classList.add(theme + '-theme');
                    btn.classList.add('active');
                }
            }
        });
    });

    // 7. SYSTEM CONSOLE
    const consoleInput = document.getElementById('console-input');
    const consoleOutput = document.getElementById('console-output');
    const linkLed = document.querySelector('.led-dot.link');

    if (consoleInput) {
        // Auto-focus console on click anywhere in the bezel
        document.querySelector('.console-bezel').addEventListener('click', () => {
            consoleInput.focus();
        });

        consoleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = consoleInput.value.toLowerCase().trim();
                const out = document.createElement('div');
                out.style.marginTop = '5px';
                
                // Blink Link LED on enter
                if (linkLed) {
                    linkLed.style.animation = 'none';
                    void linkLed.offsetWidth; // trigger reflow
                    linkLed.style.animation = 'led-blink 0.2s 3';
                }

                if (cmd === 'help') {
                    out.innerHTML = '<span style="color:#f1c40f">AVAILABLE_COMMANDS:</span> ABOUT, ENGINES, STATUS, SYSTEM_CHECK, PROJECT_SCAN, VEGETATION, DAYNIGHT, EVENTBUS, ENGINE_LOGS, CLEAR';
                } else if (cmd === 'about') {
                    out.textContent = 'KETEBE_ENGINE: V1.0.0 PIXEL_ART_ECOSYSTEM. DEVELOPED_BY_NORTHSTAR. POWERED_BY_NEURAL_LOGIC.';
                } else if (cmd === 'engines') {
                    out.textContent = 'ACTIVE_CORES: ISOPIXEL[v0.7], RPG_TOPDOWN[v0.9], PLATFORMER_2D[v1.0].';
                } else if (cmd === 'status') {
                    out.textContent = 'SYSTEM_OPTIMAL. ALL_CORES_NOMINAL. IRAB_ONLINE. LOCAL_MEMORY_SECURE.';
                } else if (cmd === 'system_check') {
                    out.innerHTML = 'RUNNING_DIAGNOSTICS...<br>[OK] GPU_ACCELERATION_ACTIVE<br>[OK] NEURAL_GATE_STABLE<br>[OK] V8_RENDER_BUS_LINKED<br>ALL_SYSTEMS_GO.';
                } else if (cmd === 'project_scan') {
                    out.innerHTML = 'SCANNING_LOCAL_PROJECTS...<br>> "Iso Pixel Demo" [ID: 0x442]<br>> "My Awesome Game" [ID: 0x981]<br>> "Platformer Demo" [ID: 0x112]<br>SCAN_COMPLETE.';
                } else if (cmd === 'vegetation') {
                    out.innerHTML = 'PROCEDURAL_VEGETATION_PROTOCOL: ACTIVE<br>GENERATING_LINDENMAYER_SYSTEMS...<br>CACHE_STATUS: [FLUSHED]<br>PLANT_DIVERSITY_SET: 0.84';
                } else if (cmd === 'daynight') {
                    out.innerHTML = 'TIME_PROTOCOL_V2: ENABLED<br>CURRENT_TINT: 0x334466 (NIGHT)<br>STEP_SPEED: 0.002s/f<br>ATMOSPHERE_LUT: [LOADED]';
                } else if (cmd === 'eventbus') {
                    out.innerHTML = 'EVENTBUS_STATUS: CONNECTED<br>CLIENT_PIDS: 0x82, 0x12, 0x99<br>PACKET_LOSS: 0.00%<br>SYNC_STATE: [IN_PHASE]';
                } else if (cmd === 'engine_logs') {
                    out.innerHTML = 'TAILING_KERN_LOG...<br>[08:34:12] ISO_STRATEGY: DEPTH_SORT_COMPLETE (1.2ms)<br>[08:34:13] IRAB: RAG_QUERY: "NPC_AI_LOGIC" -> 4 HITS<br>[08:34:14] WEBSOCKET: BROADCAST: FILE_CHANGE_EVENT';
                } else if (cmd === 'easter_egg') {
                    out.innerHTML = '<span style="color:#e0e0e0">YOU FOUND IT: "THE_CAKE_IS_A_PIXEL"</span>';
                } else if (cmd === 'clear') {
                    consoleOutput.innerHTML = '';
                    consoleInput.value = '';
                    return;
                } else if (cmd === '') {
                    return;
                } else {
                    out.innerHTML = '<span style="color:#e74c3c">ERROR:</span> COMMAND_NOT_FOUND: ' + cmd;
                }
                
                consoleOutput.appendChild(out);
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
                consoleInput.value = '';
            }
        });
    }

    // 9. ARCHITECTURE INTERROGATION
    const archDesc = document.getElementById('architecture-desc');
    document.querySelectorAll('.node').forEach(node => {
        node.addEventListener('mouseenter', () => {
            const info = node.getAttribute('data-info');
            if (archDesc) archDesc.textContent = '> INTERROGATING_' + node.textContent + ': ' + info;
        });
        node.addEventListener('mouseleave', () => {
            if (archDesc) archDesc.textContent = '> HOVER OVER A SYSTEM MODULE TO INTERROGATE...';
        });
    });

    // 10. HOT-RELOAD MOCKUP
    window.updateMockup = (type, val) => {
        const sprite = document.getElementById('mockup-sprite');
        const codeScale = document.getElementById('code-scale');
        const codeTint = document.getElementById('code-tint');
        
        if (type === 'scale') {
            sprite.style.transform = `scale(${val})`;
            codeScale.textContent = val.toFixed(1);
        } else if (type === 'tint') {
            sprite.style.color = val;
            codeTint.textContent = `"${val}"`;
        } else if (type === 'reset') {
            sprite.style.transform = 'scale(1)';
            sprite.style.color = '#fff';
            codeScale.textContent = '1.0';
            codeTint.textContent = '"#f1c40f"';
        }
    };

    // 12. MOBILE MENU
    const menuToggle = document.getElementById('menuToggle');
    const menuClose = document.getElementById('menuClose');
    const mobileMenu = document.getElementById('mobileMenu');
    const menuItems = document.querySelectorAll('.menu-item');

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => mobileMenu.classList.add('active'));
        if (menuClose) menuClose.addEventListener('click', () => mobileMenu.classList.remove('active'));
        
        menuItems.forEach(item => {
            item.addEventListener('click', () => mobileMenu.classList.remove('active'));
        });
    }
});
