// saveSystem.js - Handles saving/loading run progress via Backend API

window.SaveSystem = class SaveSystem {
    constructor() {
        // No longer using prefix for localStorage
    }

    async save(username, slotId, gameState) {
        const data = {
            timestamp: Date.now(),
            level: gameState.level,
            campaignNode: gameState.campaignNode,
            flags: gameState.flags || {},
            player: {
                x: gameState.player.x,
                y: gameState.player.y,
                hp: gameState.player.hp,
                maxHp: gameState.player.maxHp,
                mana: gameState.player.mana,
                stamina: gameState.player.stamina,
                direction: gameState.player.direction
            },
            inventory: gameState.inventory || [],
            activeSkills: gameState.activeSkills || []
        };
        
        try {
            const response = await fetch(`/api/save/${username}/${slotId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (response.ok) {
                console.log(`Game saved to backend for ${username}, slot ${slotId}`);
                return true;
            }
            throw new Error('Server responded with error');
        } catch (e) {
            console.error("Save failed", e);
            return false;
        }
    }

    async load(username, slotId) {
        try {
            const response = await fetch(`/api/save/${username}/${slotId}`);
            if (!response.ok) return null;
            return await response.json();
        } catch (e) {
            console.error("Load failed", e);
            return null;
        }
    }

    async hasSave(username, slotId) {
        const data = await this.load(username, slotId);
        return !!data;
    }
}