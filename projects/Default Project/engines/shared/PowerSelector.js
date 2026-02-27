/**
 * PowerSelector - UI component for managing equipped abilities
 * Allows players to view and equip abilities to hotkey slots
 */
class PowerSelector {
    constructor(campaignController) {
        this.controller = campaignController;
        this.visible = false;
        this.availableAbilities = [];
        this.selectedSlot = null; // Which slot is being changed
        
        this.createUI();
        console.log('[PowerSelector] Initialized');
    }

    createUI() {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'power-selector-modal';
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: 'VT323', monospace;
        `;
        
        // Create selector panel
        const panel = document.createElement('div');
        panel.className = 'power-selector-panel';
        panel.style.cssText = `
            background: #1a1a2e;
            border: 4px solid #ffd700;
            box-shadow: 0 0 0 2px #000, 0 0 20px rgba(255, 215, 0, 0.5);
            padding: 20px;
            max-width: 900px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            image-rendering: pixelated;
        `;
        
        panel.innerHTML = `
            <h2 style="color: #ffd700; text-align: center; font-size: 36px; margin: 0 0 20px 0; text-shadow: 3px 3px 0 #000;">
                ⚡ SPECIAL POWERS ⚡
            </h2>
            
            <!-- Instructions -->
            <div style="background: #0f3460; border: 3px solid #16213e; padding: 10px; margin-bottom: 20px; text-align: center;">
                <p style="color: #ffd700; font-size: 22px; margin: 0;">Click an ability below to equip it to a slot</p>
            </div>
            
            <!-- Equipped Slots -->
            <div style="margin-bottom: 30px;">
                <h3 style="color: #fff; font-size: 28px; margin-bottom: 10px; text-shadow: 2px 2px 0 #000;">EQUIPPED SLOTS</h3>
                <div id="equipped-slots" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                    ${['Q', 'F', 'R', 'T'].map((key, i) => `
                        <div class="ability-slot" data-slot="${i}" style="
                            background: #0f3460;
                            border: 4px solid #16213e;
                            padding: 12px;
                            text-align: center;
                            cursor: pointer;
                            transition: all 0.1s;
                            position: relative;
                        ">
                            <div style="color: #ffd700; font-size: 24px; margin-bottom: 8px; text-shadow: 2px 2px 0 #000;">[${key}]</div>
                            <div class="slot-content" style="min-height: 100px; display: flex; flex-direction: column; align-items: center; justify-content: center;"></div>
                        </div>
                    `).join('')}
                </div>
                <div style="color: #888; font-size: 20px; text-align: center; margin-top: 10px;">
                    Click a slot, then click an ability to equip it
                </div>
            </div>
            
            <!-- Available Abilities -->
            <div>
                <h3 style="color: #fff; font-size: 28px; margin-bottom: 10px; text-shadow: 2px 2px 0 #000;">AVAILABLE POWERS</h3>
                <div id="available-abilities" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 12px;
                    max-height: 400px;
                    overflow-y: auto;
                    padding: 5px;
                "></div>
            </div>
            
            <!-- Close Button -->
            <div style="text-align: center; margin-top: 25px;">
                <button id="close-power-selector" style="
                    background: #16213e;
                    border: 4px solid #ffd700;
                    color: #ffd700;
                    font-family: 'VT323', monospace;
                    font-size: 28px;
                    padding: 12px 40px;
                    cursor: pointer;
                    text-shadow: 2px 2px 0 #000;
                    transition: all 0.1s;
                ">CLOSE [ESC]</button>
            </div>
        `;
        
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        
        this.overlay = overlay;
        this.panel = panel;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Close button
        document.getElementById('close-power-selector').addEventListener('click', () => {
            this.hide();
        });
        
        // Close button hover
        const closeBtn = document.getElementById('close-power-selector');
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = '#ffd700';
            closeBtn.style.color = '#16213e';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = '#16213e';
            closeBtn.style.color = '#ffd700';
        });
        
        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.visible) {
                this.hide();
            }
        });
        
        // Click outside to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });
    }

    show() {
        this.loadAvailableAbilities();
        this.loadEquippedAbilities();
        this.overlay.style.display = 'flex';
        this.visible = true;
        this.selectedSlot = null;
        
        // Pause game
        if (this.controller.currentAdapter) {
            this.controller.currentAdapter.pause();
        }
        
        console.log('[PowerSelector] Opened');
    }

    hide() {
        this.overlay.style.display = 'none';
        this.visible = false;
        this.selectedSlot = null;
        
        // Resume game
        if (this.controller.currentAdapter) {
            this.controller.currentAdapter.resume();
        }
        
        console.log('[PowerSelector] Closed');
    }

    loadAvailableAbilities() {
        if (!window.AbilityDefinitions) {
            console.error('[PowerSelector] AbilityDefinitions not loaded');
            return;
        }
        
        this.availableAbilities = window.AbilityDefinitions.getAll();
        const container = document.getElementById('available-abilities');
        container.innerHTML = '';
        
        this.availableAbilities.forEach(ability => {
            const card = this.createAbilityCard(ability);
            container.appendChild(card);
        });
    }

    loadEquippedAbilities() {
        // Update UI
        document.querySelectorAll('.ability-slot').forEach((slot, idx) => {
            const content = slot.querySelector('.slot-content');
            const abilityId = this.controller.equippedAbilities[idx];
            
            // Remove previous click handler
            const oldSlot = slot.cloneNode(true);
            slot.parentNode.replaceChild(oldSlot, slot);
            
            // Add click handler to select slot
            oldSlot.addEventListener('click', () => {
                this.selectSlot(idx);
            });
            
            // Populate content
            const slotContent = oldSlot.querySelector('.slot-content');
            slotContent.innerHTML = '';
            
            if (abilityId) {
                const ability = window.AbilityDefinitions.getAbility(abilityId);
                if (ability) {
                    slotContent.innerHTML = this.createAbilityHTML(ability, true);
                }
            } else {
                slotContent.innerHTML = `
                    <div style="color: #666; font-size: 22px; text-shadow: 2px 2px 0 #000;">EMPTY</div>
                `;
            }
        });
    }

    selectSlot(slotIndex) {
        // Clear previous selection
        document.querySelectorAll('.ability-slot').forEach(slot => {
            slot.style.borderColor = '#16213e';
            slot.style.background = '#0f3460';
        });
        
        // Highlight selected slot
        const slot = document.querySelector(`.ability-slot[data-slot="${slotIndex}"]`);
        if (slot) {
            slot.style.borderColor = '#ffd700';
            slot.style.background = '#1a4d7a';
        }
        
        this.selectedSlot = slotIndex;
        console.log('[PowerSelector] Selected slot:', slotIndex);
    }

    createAbilityCard(ability) {
        const card = document.createElement('div');
        card.className = 'ability-card';
        card.style.cssText = `
            background: #0f3460;
            border: 4px solid #16213e;
            padding: 12px;
            cursor: pointer;
            transition: all 0.1s;
        `;
        
        card.innerHTML = this.createAbilityHTML(ability, false);
        
        // Hover effect
        card.addEventListener('mouseenter', () => {
            card.style.borderColor = '#ffd700';
            card.style.transform = 'scale(1.03)';
        });
        card.addEventListener('mouseleave', () => {
            card.style.borderColor = '#16213e';
            card.style.transform = 'scale(1)';
        });
        
        // Click to equip
        card.addEventListener('click', () => {
            this.equipAbility(ability.id);
        });
        
        return card;
    }

    createAbilityHTML(ability, compact = false) {
        const typeColors = {
            projectile: '#e74c3c',
            heal: '#2ecc71',
            buff: '#3498db',
            utility: '#9b59b6'
        };
        
        const typeIcons = {
            projectile: '⚔️',
            heal: '💚',
            buff: '✨',
            utility: '🔮'
        };
        
        const color = ability.color || typeColors[ability.type] || '#fff';
        const icon = typeIcons[ability.type] || '⚡';
        
        if (compact) {
            return `
                <div style="font-size: 42px; margin-bottom: 5px;">${icon}</div>
                <div style="color: ${color}; font-size: 20px; text-shadow: 2px 2px 0 #000;">${ability.name}</div>
            `;
        }
        
        return `
            <div style="text-align: center;">
                <div style="font-size: 48px; margin-bottom: 8px;">${icon}</div>
                <div style="color: ${color}; font-size: 24px; font-weight: bold; margin-bottom: 5px; text-shadow: 2px 2px 0 #000;">
                    ${ability.name}
                </div>
                <div style="color: #888; font-size: 18px; margin-bottom: 8px;">
                    ${ability.type.toUpperCase()}
                </div>
                <div style="color: #ffd700; font-size: 20px; margin-bottom: 5px;">
                    💧 ${ability.manaCost} Mana
                </div>
                ${ability.cooldown ? `<div style="color: #3498db; font-size: 18px;">⏱️ ${ability.cooldown}s</div>` : ''}
                <div style="color: #ccc; font-size: 18px; margin-top: 8px; line-height: 1.3;">
                    ${ability.description}
                </div>
            </div>
        `;
    }

    equipAbility(abilityId) {
        if (this.selectedSlot === null) {
            // No slot selected - auto-select first empty slot
            for (let i = 0; i < 4; i++) {
                if (!this.controller.equippedAbilities[i]) {
                    this.selectedSlot = i;
                    break;
                }
            }
            
            // If all slots full, use slot 0
            if (this.selectedSlot === null) {
                this.selectedSlot = 0;
            }
        }
        
        // Equip to selected slot
        this.controller.equippedAbilities[this.selectedSlot] = abilityId;
        
        const ability = window.AbilityDefinitions.getAbility(abilityId);
        console.log('[PowerSelector] Equipped', ability.name, 'to slot', this.selectedSlot);
        
        // Show notification
        if (window.showNotification) {
            window.showNotification(`Equipped ${ability.name} to slot ${this.selectedSlot + 1}`, 'success');
        }
        
        // Refresh UI
        this.loadEquippedAbilities();
        
        // Save to campaign controller (will be saved with next auto-save)
        console.log('[PowerSelector] Updated abilities:', this.controller.equippedAbilities);
    }

    unequipSlot(slotIndex) {
        this.controller.equippedAbilities[slotIndex] = null;
        this.loadEquippedAbilities();
        
        console.log('[PowerSelector] Unequipped slot', slotIndex);
    }
}
