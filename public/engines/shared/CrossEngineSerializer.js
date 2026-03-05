/**
 * CrossEngineSerializer.js
 * Shared serialization utilities for cross-engine data persistence
 */

window.CrossEngineSerializer = class CrossEngineSerializer {
    /**
     * Serialize inventory items to cross-engine format
     * @param {Array} inventory - Engine-specific inventory array
     * @returns {Array} Standardized inventory data
     */
    static serializeInventory(inventory) {
        if (!inventory || !Array.isArray(inventory)) return [];
        
        return inventory.map(item => {
            if (!item) return null;
            return {
                id: item.id || item.type,
                name: item.name,
                type: item.type,
                quantity: item.quantity || 1,
                properties: item.properties || {},
                icon: item.icon,
                description: item.description
            };
        }).filter(item => item !== null);
    }
    
    /**
     * Deserialize inventory items
     * @param {Array} items - Standardized inventory data
     * @returns {Array} Engine-compatible inventory
     */
    static deserializeInventory(items) {
        if (!items || !Array.isArray(items)) return [];
        
        return items.map(itemData => ({
            id: itemData.id,
            name: itemData.name,
            type: itemData.type,
            quantity: itemData.quantity,
            properties: itemData.properties,
            icon: itemData.icon,
            description: itemData.description
        }));
    }
    
    /**
     * Serialize equipment
     * @param {Object} equipment - Engine-specific equipment object
     * @returns {Object} Standardized equipment data
     */
    static serializeEquipment(equipment) {
        if (!equipment || typeof equipment !== 'object') return {};
        
        const serialized = {};
        for (const slot in equipment) {
            const item = equipment[slot];
            if (item) {
                serialized[slot] = {
                    id: item.id,
                    name: item.name,
                    stats: item.stats || {},
                    properties: item.properties || {}
                };
            }
        }
        return serialized;
    }
    
    /**
     * Deserialize equipment
     * @param {Object} equipment - Standardized equipment data
     * @returns {Object} Engine-compatible equipment
     */
    static deserializeEquipment(equipment) {
        if (!equipment || typeof equipment !== 'object') return {};
        
        const deserialized = {};
        for (const slot in equipment) {
            deserialized[slot] = { ...equipment[slot] };
        }
        return deserialized;
    }
    
    /**
     * Serialize quests
     * @param {Object} questSystem - Quest system instance
     * @returns {Object} Standardized quest data
     */
    static serializeQuests(questSystem) {
        if (!questSystem) return {};
        
        const quests = {};
        
        // Active quests
        if (questSystem.activeQuests && Array.isArray(questSystem.activeQuests)) {
            questSystem.activeQuests.forEach(quest => {
                quests[quest.id] = {
                    status: quest.status || 'active',
                    progress: quest.progress || {},
                    completedObjectives: quest.completedObjectives || [],
                    startTime: quest.startTime
                };
            });
        }
        
        // Completed quests
        if (questSystem.completedQuests && Array.isArray(questSystem.completedQuests)) {
            questSystem.completedQuests.forEach(questId => {
                if (!quests[questId]) {
                    quests[questId] = { status: 'completed' };
                }
            });
        }
        
        return quests;
    }
    
    /**
     * Deserialize quests
     * @param {Object} quests - Standardized quest data
     * @param {Object} questSystem - Quest system instance to populate
     */
    static deserializeQuests(quests, questSystem) {
        if (!questSystem || !quests) return;
        
        if (!questSystem.activeQuests) {
            questSystem.activeQuests = [];
        }
        
        if (!questSystem.completedQuests) {
            questSystem.completedQuests = [];
        }
        
        // Clear existing
        questSystem.activeQuests = [];
        questSystem.completedQuests = [];
        
        // Restore quests
        for (const questId in quests) {
            const questData = quests[questId];
            
            if (questData.status === 'completed') {
                questSystem.completedQuests.push(questId);
            } else {
                questSystem.activeQuests.push({
                    id: questId,
                    status: questData.status,
                    progress: questData.progress,
                    completedObjectives: questData.completedObjectives,
                    startTime: questData.startTime
                });
            }
        }
    }
    
    /**
     * Serialize achievements
     * @param {Object} achievementSystem - Achievement system instance
     * @returns {Array} Unlocked achievement IDs
     */
    static serializeAchievements(achievementSystem) {
        if (!achievementSystem) return [];
        
        if (Array.isArray(achievementSystem.unlockedAchievements)) {
            return [...achievementSystem.unlockedAchievements];
        }
        
        if (Array.isArray(achievementSystem.unlocked)) {
            return [...achievementSystem.unlocked];
        }
        
        return [];
    }
    
    /**
     * Deserialize achievements
     * @param {Array} achievements - Achievement IDs
     * @param {Object} achievementSystem - Achievement system instance to populate
     */
    static deserializeAchievements(achievements, achievementSystem) {
        if (!achievementSystem || !achievements) return;
        
        if (!achievementSystem.unlockedAchievements) {
            achievementSystem.unlockedAchievements = [];
        }
        
        achievementSystem.unlockedAchievements = [...achievements];
        
        // Also set unlocked if that's the property name
        if (achievementSystem.unlocked !== undefined) {
            achievementSystem.unlocked = [...achievements];
        }
    }
    
    /**
     * Serialize skills/abilities
     * @param {Array} skills - Player skills array
     * @returns {Array} Standardized skill data
     */
    static serializeSkills(skills) {
        if (!skills || !Array.isArray(skills)) return [];
        
        return skills.map(skill => ({
            id: skill.id,
            name: skill.name,
            level: skill.level || 1,
            experience: skill.experience || 0,
            // Don't persist cooldowns or active status
        }));
    }
    
    /**
     * Deserialize skills
     * @param {Array} skills - Standardized skill data
     * @returns {Array} Engine-compatible skills
     */
    static deserializeSkills(skills) {
        if (!skills || !Array.isArray(skills)) return [];
        
        return skills.map(skillData => ({
            id: skillData.id,
            name: skillData.name,
            level: skillData.level,
            experience: skillData.experience,
            cooldown: 0,
            active: false
        }));
    }
    
    /**
     * Serialize flags (story/progress markers)
     * @param {Object} flags - Engine flags object
     * @returns {Object} Copy of flags
     */
    static serializeFlags(flags) {
        if (!flags || typeof flags !== 'object') return {};
        
        // Deep copy to avoid reference issues
        return JSON.parse(JSON.stringify(flags));
    }
    
    /**
     * Deserialize flags
     * @param {Object} flags - Standardized flags
     * @returns {Object} Engine-compatible flags
     */
    static deserializeFlags(flags) {
        if (!flags || typeof flags !== 'object') return {};
        
        return JSON.parse(JSON.stringify(flags));
    }
    
    /**
     * Serialize complete player state
     * @param {Object} engine - Game engine instance
     * @returns {Object} Complete serialized state
     */
    static serializePlayerState(engine) {
        if (!engine || !engine.player) return null;
        
        const player = engine.player;
        
        return {
            // Core stats (always persist)
            hp: player.hp,
            maxHp: player.maxHp,
            mana: player.mana || 0,
            maxMana: player.maxMana || 0,
            stamina: player.stamina || 0,
            maxStamina: player.maxStamina || 0,
            level: player.level || 1,
            experience: player.experience || 0,
            gold: player.gold || 0,
            
            // Position (for same-engine transitions, ignored for cross-engine)
            x: player.x,
            y: player.y,
            z: player.z || 0,
            direction: player.direction || 'down',
            
            // Cross-engine data
            inventory: this.serializeInventory(engine.inventory),
            equipment: this.serializeEquipment(player.equipment),
            quests: this.serializeQuests(engine.questSystem),
            achievements: this.serializeAchievements(engine.achievementSystem),
            skills: this.serializeSkills(player.skills),
            flags: this.serializeFlags(engine.flags)
        };
    }
    
    /**
     * Deserialize complete player state
     * @param {Object} engine - Game engine instance
     * @param {Object} playerData - Serialized player state
     * @param {boolean} restorePosition - Whether to restore position (false for cross-engine)
     */
    static deserializePlayerState(engine, playerData, restorePosition = false) {
        if (!engine || !engine.player || !playerData) return;
        
        const player = engine.player;
        
        // Core stats
        if (playerData.hp !== undefined) player.hp = playerData.hp;
        if (playerData.maxHp !== undefined) player.maxHp = playerData.maxHp;
        if (playerData.mana !== undefined) player.mana = playerData.mana;
        if (playerData.maxMana !== undefined) player.maxMana = playerData.maxMana;
        if (playerData.stamina !== undefined) player.stamina = playerData.stamina;
        if (playerData.maxStamina !== undefined) player.maxStamina = playerData.maxStamina;
        if (playerData.level !== undefined) player.level = playerData.level;
        if (playerData.experience !== undefined) player.experience = playerData.experience;
        if (playerData.gold !== undefined) player.gold = playerData.gold;
        
        // Position (only if requested)
        if (restorePosition) {
            if (playerData.x !== undefined) player.x = playerData.x;
            if (playerData.y !== undefined) player.y = playerData.y;
            if (playerData.z !== undefined) player.z = playerData.z;
        }
        
        // Direction
        if (playerData.direction !== undefined) player.direction = playerData.direction;
        
        // Inventory
        if (playerData.inventory) {
            engine.inventory = this.deserializeInventory(playerData.inventory);
        }
        
        // Equipment
        if (playerData.equipment) {
            if (!player.equipment) player.equipment = {};
            Object.assign(player.equipment, this.deserializeEquipment(playerData.equipment));
        }
        
        // Quests
        if (playerData.quests && engine.questSystem) {
            this.deserializeQuests(playerData.quests, engine.questSystem);
        }
        
        // Achievements
        if (playerData.achievements && engine.achievementSystem) {
            this.deserializeAchievements(playerData.achievements, engine.achievementSystem);
        }
        
        // Skills
        if (playerData.skills) {
            if (!player.skills) player.skills = [];
            player.skills = this.deserializeSkills(playerData.skills);
        }
        
        // Flags
        if (playerData.flags) {
            if (!engine.flags) engine.flags = {};
            Object.assign(engine.flags, this.deserializeFlags(playerData.flags));
        }
        
        // Refresh UI if available
        if (engine.updateHUD) {
            engine.updateHUD();
        }
        
        if (engine.refreshUI) {
            engine.refreshUI();
        }
    }

    // ── 3D Transform Serialization ────────────────────────────────────────────

    /**
     * Serialize a THREE.Object3D transform to a portable 3D format.
     * @param {THREE.Object3D} obj - Three.js object with position/quaternion/scale
     * @returns {{ position: number[], rotation: number[], scale: number[] }}
     */
    static serializeTransform3D(obj) {
        if (!obj) return { position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] };
        const p = obj.position || { x:0, y:0, z:0 };
        const q = obj.quaternion || { x:0, y:0, z:0, w:1 };
        const s = obj.scale || { x:1, y:1, z:1 };
        return {
            position: [p.x, p.y, p.z],
            rotation: [q.x, q.y, q.z, q.w],   // quaternion xyzw
            scale:    [s.x, s.y, s.z],
        };
    }

    /**
     * Apply serialized transform data back to a THREE.Object3D.
     * @param {{ position: number[], rotation: number[], scale: number[] }} data
     * @param {THREE.Object3D} obj
     */
    static deserializeTransform3D(data, obj) {
        if (!data || !obj) return;
        if (Array.isArray(data.position) && data.position.length === 3) {
            obj.position.set(data.position[0], data.position[1], data.position[2]);
        }
        if (Array.isArray(data.rotation) && data.rotation.length === 4) {
            obj.quaternion.set(data.rotation[0], data.rotation[1], data.rotation[2], data.rotation[3]);
        }
        if (Array.isArray(data.scale) && data.scale.length === 3) {
            obj.scale.set(data.scale[0], data.scale[1], data.scale[2]);
        }
    }

    /**
     * Serialize a 3D entity (position, rotation, scale + properties).
     * @param {{ id, type, position, quaternion, scale, properties }} entity
     * @returns {object}
     */
    static serializeEntity3D(entity) {
        if (!entity) return null;
        return {
            id:         entity.id   || entity.name || '',
            type:       entity.type || 'entity',
            transform:  CrossEngineSerializer.serializeTransform3D(entity),
            properties: { ...(entity.properties || entity.userData || {}) },
        };
    }

    /**
     * Deserialize a 3D entity definition.
     * @param {object} data - Serialized entity
     * @returns {{ id, type, position, rotation, scale, properties }}
     */
    static deserializeEntity3D(data) {
        if (!data) return null;
        const t = data.transform || {};
        return {
            id:         data.id   || '',
            type:       data.type || 'entity',
            position:   t.position || [0,0,0],
            rotation:   t.rotation || [0,0,0,1],
            scale:      t.scale    || [1,1,1],
            properties: { ...(data.properties || {}) },
        };
    }

    /**
     * Serialize a complete 3D level for persistence.
     * Strips runtime-only fields (bounding spheres, internal refs).
     * @param {object} levelData - Live level data from Engine3DAdapter
     * @returns {object} JSON-safe level snapshot
     */
    static serializeLevel3D(levelData) {
        if (!levelData || typeof levelData !== 'object') return null;
        return {
            version:    levelData.version    || '1.0',
            engineType: levelData.engineType || 'topdown-3d',
            name:       levelData.name       || 'Untitled',
            geometry:   (levelData.geometry  || []).map(g => ({
                id:            g.id,
                type:          g.type,
                position:      g.position || [0,0,0],
                rotation:      g.rotation || [0,0,0,1],
                scale:         g.scale    || [1,1,1],
                palette_index: g.palette_index ?? null,
                colorHex:      g.colorHex      || null,
                castShadow:    g.castShadow    || false,
                receiveShadow: g.receiveShadow || true,
                mesh_ref:      g.mesh_ref      || null,
                chunk_data:    g.chunk_data    || null,
            })),
            entities: (levelData.entities || []).map(e => CrossEngineSerializer.serializeEntity3D(e)),
            lights:   (levelData.lights   || []).map(l => ({
                id:          l.id,
                type:        l.type,
                intensity:   l.intensity    ?? 1.0,
                palette_index: l.palette_index ?? null,
                colorHex:    l.colorHex     || null,
                position:    l.position     || null,
                target:      l.target       || null,
                castShadow:  l.castShadow   || false,
                distance:    l.distance     || null,
                angle:       l.angle        || null,
                penumbra:    l.penumbra     || null,
            })),
            navmesh: levelData.navmesh || null,
            skybox:  levelData.skybox  || null,
            physics: { ...(levelData.physics || {}) },
        };
    }

    /**
     * Deserialize a 3D level snapshot (returns normalized level object).
     * @param {object} data
     * @returns {object}
     */
    static deserializeLevel3D(data) {
        if (!data || typeof data !== 'object') return null;
        return {
            version:    data.version    || '1.0',
            engineType: data.engineType || 'topdown-3d',
            name:       data.name       || 'Untitled',
            geometry:   Array.isArray(data.geometry) ? data.geometry : [],
            entities:   Array.isArray(data.entities) ? data.entities.map(e => CrossEngineSerializer.deserializeEntity3D(e)) : [],
            lights:     Array.isArray(data.lights)   ? data.lights   : [],
            navmesh:    data.navmesh    || null,
            skybox:     data.skybox     || null,
            physics:    { ...(data.physics || {}) },
        };
    }
};
