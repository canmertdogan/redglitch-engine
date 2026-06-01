/**
 * RedGlitch Engine - Shared UI System
 * Dynamically renders UI screens based on JSON definitions
 */
window.UISystem = class UISystem {
    constructor(game) { 
        this.game = game; 
        this.config = {}; 
        this.activeScreen = null; 
    }
    
    async init() { 
        try { 
            const res = await fetch('/dunyalar/definitions/ui.json'); 
            if (res.ok) { 
                const data = await res.json(); 
                this.config = data.screens || {}; 
            } 
        } catch (e) { 
            console.warn("UI Config load failed"); 
        } 
    }
    
    showScreen(screenId) {
        const old = document.getElementById('dynamic-ui-root'); if (old) old.remove();
        if (!this.config[screenId]) return; 
        this.activeScreen = screenId;
        
        // Find or create the active screen's scaler
        let activeContainer = document.querySelector('.screen.active');
        let scaler = null;

        if (activeContainer) {
            scaler = activeContainer.querySelector('.ui-scaler');
        } else {
            // Check for game-container if we are in-game (HUD)
            const gameContainer = document.getElementById('game-container');
            if (gameContainer && !gameContainer.classList.contains('hidden')) {
                scaler = gameContainer.querySelector('.ui-scaler');
            }
        }

        if (!scaler) {
            // Fallback
            scaler = document.body;
        }

        const root = document.createElement('div'); root.id = 'dynamic-ui-root';
        root.style.width = '100%'; root.style.height = '100%';
        root.style.zIndex = '2000'; root.style.position = 'absolute'; root.style.top = '0'; root.style.left = '0'; root.style.pointerEvents = 'none';

        // Use Shared Renderer
        if (window.UIRenderer) {
            window.UIRenderer.render(this.config[screenId], root, {
                onClick: (action, e) => this.handleAction(action, e),
                variables: this.game.player // For {hp} bindings
            });
        }

        scaler.appendChild(root);

        // --- Post-Render Population ---
        if (screenId === 'skill_selector') this.populateSkillSelector();
        if (screenId === 'inventory') this.populateInventoryGrid();
    }

    populateSkillSelector() {
        const container = document.getElementById('skill_container');
        if (!container) return;
        container.style.display = 'grid'; container.style.gridTemplateColumns = 'repeat(4, 1fr)'; container.style.padding = '20px'; container.style.gap = '15px';
        
        const skills = this.game.skillDefs || [];
        skills.forEach(skill => {
            const card = document.createElement('div');
            card.className = 'retro-panel'; 
            card.style.padding = '10px'; 
            card.style.cursor = 'pointer'; 
            card.style.display = 'flex'; 
            card.style.flexDirection = 'column'; 
            card.style.alignItems = 'center';
            card.style.pointerEvents = 'auto'; // FIX: Enable clicking
            
            if (window.createPixelImage) {
                const icon = window.createPixelImage(skill.sprite);
                icon.style.width = '64px'; icon.style.height = '64px';
                card.appendChild(icon);
            }
            
            const name = document.createElement('div');
            name.innerText = skill.name; name.style.marginTop = '10px'; name.style.color = '#f1c40f';
            
            card.appendChild(name);
            
            // Selection logic (ID-based for robustness)
            const isSelected = this.game.activeSkills.some(s => s && s.id === skill.id);
            if (isSelected) card.style.borderColor = '#2ecc71';
            
            // Force high Z-Index and explicit cursor
            card.style.zIndex = '5000';
            card.style.cursor = 'pointer';

            card.onclick = (e) => {
                e.stopPropagation(); // Prevent bubbling
                console.log("Skill Clicked:", skill.name);
                const idx = this.game.activeSkills.findIndex(s => s && s.id === skill.id);
                if (idx !== -1) {
                    console.log("Deselecting at index", idx);
                    this.game.activeSkills[idx] = null;
                    card.style.borderColor = '#333';
                } else {
                    const emptySlot = this.game.activeSkills.indexOf(null);
                    if (emptySlot !== -1) {
                        console.log("Selecting at slot", emptySlot);
                        this.game.activeSkills[emptySlot] = skill;
                        card.style.borderColor = '#2ecc71';
                    } else if (window.showNotification) {
                        window.showNotification("ONLY 4 SKILLS ALLOWED!", "error");
                    } else {
                        alert("ONLY 4 SKILLS ALLOWED!");
                    }
                }
                if (this.game.updateSkillHUD) this.game.updateSkillHUD();
            };
            container.appendChild(card);
        });
        console.log("Skill Selector Populated with", skills.length, "skills.");
    }

    populateInventoryGrid() {
        const grid = document.getElementById('inv_grid');
        if (!grid) return;
        grid.style.display = 'grid'; grid.style.gridTemplateColumns = 'repeat(6, 1fr)'; grid.style.padding = '20px'; grid.style.gap = '10px';
        
        // 24 Slots
        for (let i = 0; i < 24; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-grid-slot'; 
            
            const item = this.game.inventory[i];
            if (item) {
                if (window.createPixelImage) {
                    const icon = window.createPixelImage(item.sprite);
                    icon.style.width = '48px'; icon.style.height = '48px'; // Slightly smaller to fit padding
                    slot.appendChild(icon);
                }
                
                // Add count badge if needed (optional)
                if (item.count && item.count > 1) {
                    const badge = document.createElement('span');
                    badge.className = 'count-badge';
                    badge.innerText = item.count;
                    slot.appendChild(badge);
                }

                slot.onclick = () => {
                    if (this.game.useItem) this.game.useItem(i);
                    this.populateInventoryGrid(); // Refresh
                };
            }
            grid.appendChild(slot);
        }
    }

    async handleAction(scriptName, e) {
        if (!scriptName) return;
        const menu = window.menuSystem;

        // Dynamic navigate: prefix — navigate to any UI screen
        if (scriptName.startsWith('navigate:')) {
            const targetScreen = scriptName.substring(9);
            if (targetScreen && this.config[targetScreen]) {
                if (menu && menu.showDynamicScreen) menu.showDynamicScreen(targetScreen);
                else this.showScreen(targetScreen);
            } else {
                console.warn('[UI] Navigate target not found:', targetScreen);
            }
            return;
        }

        // Structured action: prefix — strip and fall through to switch
        let action = scriptName;
        if (scriptName.startsWith('action:')) {
            action = scriptName.substring(7);
        }

        if (menu && menu.handleAction) {
            menu.handleAction(action, e);
        } else {
            console.log("Action Triggered (no MenuSystem):", action);
        }
    }
};