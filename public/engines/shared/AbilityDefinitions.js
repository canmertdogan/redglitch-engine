/**
 * AbilityDefinitions - Unified ability system for all engines
 * Defines all available abilities/powers that can be equipped and used
 */

class AbilityDefinitions {
    static abilities = {
        // === PROJECTILE ABILITIES ===
        'fireball': {
            id: 'fireball',
            name: 'Fireball',
            description: 'Launch a blazing fireball',
            type: 'projectile',
            mana: 10,
            cooldown: 0.5,
            damage: 25,
            sprite: 'skillIcon_fireball',
            projectileSprite: 'projectile_fire',
            color: '#ff6b35',
            speed: 300,
            lifetime: 3.0,
            icon: '🔥'
        },
        
        'ice_shard': {
            id: 'ice_shard',
            name: 'Ice Shard',
            description: 'Shoot a freezing ice shard',
            type: 'projectile',
            mana: 12,
            cooldown: 0.7,
            damage: 20,
            sprite: 'skillIcon_ice',
            projectileSprite: 'projectile_ice',
            color: '#3498db',
            speed: 250,
            lifetime: 2.5,
            slow: 0.5,  // Slows enemies by 50%
            icon: '❄️'
        },
        
        'lightning_bolt': {
            id: 'lightning_bolt',
            name: 'Lightning Bolt',
            description: 'Strike with electric energy',
            type: 'projectile',
            mana: 15,
            cooldown: 1.0,
            damage: 35,
            sprite: 'skillIcon_lightning',
            projectileSprite: 'projectile_lightning',
            color: '#ff0000',
            speed: 400,
            lifetime: 2.0,
            icon: '⚡'
        },
        
        'poison_dart': {
            id: 'poison_dart',
            name: 'Poison Dart',
            description: 'Shoot a venomous dart',
            type: 'projectile',
            mana: 8,
            cooldown: 0.4,
            damage: 15,
            sprite: 'skillIcon_poison',
            projectileSprite: 'projectile_poison',
            color: '#27ae60',
            speed: 280,
            lifetime: 2.5,
            dot: { damage: 5, duration: 3.0 },  // Damage over time
            icon: '🧪'
        },
        
        'shadow_bolt': {
            id: 'shadow_bolt',
            name: 'Shadow Bolt',
            description: 'Dark energy projectile',
            type: 'projectile',
            mana: 18,
            cooldown: 1.2,
            damage: 40,
            sprite: 'skillIcon_shadow',
            projectileSprite: 'projectile_shadow',
            color: '#8e44ad',
            speed: 320,
            lifetime: 3.5,
            icon: '🌑'
        },
        
        'arcane_missile': {
            id: 'arcane_missile',
            name: 'Arcane Missile',
            description: 'Magical seeking projectile',
            type: 'projectile',
            mana: 20,
            cooldown: 1.5,
            damage: 30,
            sprite: 'skillIcon_arcane',
            projectileSprite: 'projectile_arcane',
            color: '#9b59b6',
            speed: 200,
            lifetime: 4.0,
            homing: true,  // Tracks nearest enemy
            icon: '✨'
        },
        
        // === HEALING ABILITIES ===
        'heal': {
            id: 'heal',
            name: 'Heal',
            description: 'Restore HP instantly',
            type: 'heal',
            mana: 15,
            cooldown: 2.0,
            healAmount: 30,
            sprite: 'skillIcon_heal',
            color: '#2ecc71',
            icon: '💚'
        },
        
        'greater_heal': {
            id: 'greater_heal',
            name: 'Greater Heal',
            description: 'Restore large amount of HP',
            type: 'heal',
            mana: 30,
            cooldown: 5.0,
            healAmount: 60,
            sprite: 'skillIcon_greater_heal',
            color: '#27ae60',
            icon: '💖'
        },
        
        'regeneration': {
            id: 'regeneration',
            name: 'Regeneration',
            description: 'Heal over time',
            type: 'heal',
            mana: 20,
            cooldown: 8.0,
            healAmount: 5,
            duration: 10.0,  // 5 HP per second for 10 seconds
            sprite: 'skillIcon_regen',
            color: '#16a085',
            icon: '🌿'
        },
        
        // === BUFF ABILITIES ===
        'speed_boost': {
            id: 'speed_boost',
            name: 'Speed Boost',
            description: 'Increase movement speed',
            type: 'buff',
            mana: 12,
            cooldown: 10.0,
            duration: 5.0,
            speedMultiplier: 1.5,
            sprite: 'skillIcon_speed',
            color: '#3498db',
            icon: '💨'
        },
        
        'damage_boost': {
            id: 'damage_boost',
            name: 'Damage Boost',
            description: 'Increase damage dealt',
            type: 'buff',
            mana: 18,
            cooldown: 15.0,
            duration: 8.0,
            damageMultiplier: 1.5,
            sprite: 'skillIcon_damage',
            color: '#e74c3c',
            icon: '⚔️'
        },
        
        'shield': {
            id: 'shield',
            name: 'Shield',
            description: 'Absorb incoming damage',
            type: 'buff',
            mana: 25,
            cooldown: 12.0,
            duration: 6.0,
            shieldAmount: 50,
            sprite: 'skillIcon_shield',
            color: '#95a5a6',
            icon: '🛡️'
        },
        
        // === UTILITY ABILITIES ===
        'teleport': {
            id: 'teleport',
            name: 'Teleport',
            description: 'Instantly teleport to cursor',
            type: 'utility',
            mana: 30,
            cooldown: 8.0,
            maxDistance: 10,  // tiles
            sprite: 'skillIcon_teleport',
            color: '#9b59b6',
            icon: '🌀'
        },
        
        'mana_potion': {
            id: 'mana_potion',
            name: 'Mana Restore',
            description: 'Restore mana instantly',
            type: 'utility',
            mana: -30,  // Negative = restores
            cooldown: 20.0,
            sprite: 'skillIcon_mana',
            color: '#3498db',
            icon: '💙'
        }
    };

    /**
     * Get ability definition by ID
     * @param {string} id - Ability ID
     * @returns {Object|null} Ability definition or null if not found
     */
    static getAbility(id) {
        return this.abilities[id] || null;
    }

    /**
     * Get all abilities
     * @returns {Array} Array of all ability definitions
     */
    static getAll() {
        return Object.values(this.abilities);
    }

    /**
     * Get abilities by type
     * @param {string} type - Ability type (projectile, heal, buff, utility)
     * @returns {Array} Array of abilities of specified type
     */
    static getByType(type) {
        return Object.values(this.abilities).filter(a => a.type === type);
    }

    /**
     * Get abilities that player can afford with current mana
     * @param {number} currentMana - Player's current mana
     * @returns {Array} Array of affordable abilities
     */
    static getAffordable(currentMana) {
        return Object.values(this.abilities).filter(a => a.mana <= currentMana);
    }

    /**
     * Check if ability exists
     * @param {string} id - Ability ID
     * @returns {boolean} True if ability exists
     */
    static exists(id) {
        return id in this.abilities;
    }

    /**
     * Register a new ability (for modding/custom abilities)
     * @param {Object} ability - Ability definition
     */
    static register(ability) {
        if (!ability.id) {
            console.error('[AbilityDefinitions] Cannot register ability without ID');
            return false;
        }
        
        this.abilities[ability.id] = ability;
        console.log(`[AbilityDefinitions] Registered ability: ${ability.id}`);
        return true;
    }

    /**
     * Get default starter abilities (for new players)
     * @returns {Array} Array of starter ability IDs
     */
    static getStarterAbilities() {
        return ['fireball', 'heal', null, null];
    }

    /**
     * Get ability count
     * @returns {number} Total number of abilities
     */
    static getCount() {
        return Object.keys(this.abilities).length;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AbilityDefinitions;
}

// Make globally available
window.AbilityDefinitions = AbilityDefinitions;

// Log initialization
console.log(`[AbilityDefinitions] System initialized with ${AbilityDefinitions.getCount()} abilities`);
