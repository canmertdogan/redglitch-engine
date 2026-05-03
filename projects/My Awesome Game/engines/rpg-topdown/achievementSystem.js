// achievementSystem.js

window.AchievementSystem = class AchievementSystem {
    constructor() {
        this.definitions = [];
        this.unlocked = [];
        this.username = null;
        
        // Load Definitions from localStorage (Editor might have set them)
        const defs = localStorage.getItem('ketebe_achievements_data');
        if (defs) this.definitions = JSON.parse(defs);
        
        this.createUI();

        // Hot Reload Listener
        if (window.VortexEventBus) {
            window.VortexEventBus.on('achievements:updated', (event) => {
                console.log("[AchievementSystem] Definitions Updated!");
                this.definitions = event.data;
            });
        }
    }

    async init(username) {
        this.username = username;
        
        // Load Definitions from server
        try {
            const defRes = await fetch('/dunyalar/definitions/achievements.json');
            if (defRes.ok) {
                this.definitions = await defRes.json();
                console.log("Achievement definitions loaded from server");
            }
        } catch (e) {
            console.warn("Failed to load achievement definitions from server, using local");
        }

        // Try load progress from backend
        try {
            const response = await fetch(`/api/achievements/${username}`);
            if (response.ok) {
                const data = await response.json();
                this.unlocked = data.unlocked || [];
                console.log("Achievements progress loaded from backend");
            }
        } catch (e) {
            console.warn("Backend achievements load failed, using local if available");
            const prog = localStorage.getItem('ketebe_achievements_progress');
            if (prog) this.unlocked = JSON.parse(prog);
        }
    }

    createUI() {
        // Notification Toast
        this.toast = document.createElement('div');
        this.toast.id = 'ach-toast';
        this.toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-200px);
            background: #222; border: 2px solid #f1c40f;
            color: white; padding: 15px; font-family: 'VT323', monospace;
            display: flex; align-items: center; gap: 15px;
            transition: transform 0.5s; z-index: 9999; pointer-events: none;
            box-shadow: 0 0 20px rgba(241, 196, 15, 0.5);
            min-width: 300px;
        `;
        document.body.appendChild(this.toast);
    }

    async unlock(triggerCode) {
        if (!this.definitions) return;
        // Find matching achievements by trigger code
        const matches = this.definitions.filter(a => a.trigger === triggerCode);
        
        for (const ach of matches) {
            // Check Prerequisites
            if (ach.prereq && !this.unlocked.includes(ach.prereq)) continue;

            if (!this.unlocked.includes(ach.id)) {
                this.unlocked.push(ach.id);
                this.grantReward(ach);
                await this.saveProgress();
                this.showToast(ach);
            }
        }
    }

    grantReward(ach) {
        if (!ach.rewardType || ach.rewardType === 'NONE') return;
        
        const game = window.game;
        if (!game || !game.player) return;

        const val = ach.rewardValue;

        if (ach.rewardType === 'XP') {
            const amount = parseInt(val) || 0;
            if (!game.player.xp) game.player.xp = 0;
            game.player.xp += amount;
            if(game.fx) game.fx.popText(game.player.x, game.player.y, `+${amount} XP`, '#f1c40f');
        }
        else if (ach.rewardType === 'STAT') {
            // value format: "statName:amount" or just assume stat name in type?
            // Editor allows "STAT" type and "Value".
            // Let's assume Value is "hp:10" or just "hp".
            // Simplified: We assume value is the amount, but which stat?
            // The editor only has one value field. 
            // Implementation: Value should be "hp 10"
            const parts = val.split(' ');
            if (parts.length === 2) {
                const stat = parts[0];
                const amount = parseInt(parts[1]);
                if (game.player[stat] !== undefined) {
                    game.player[stat] += amount;
                    if (stat.includes('max')) game.player[stat.replace('max','').toLowerCase()] += amount; // Heal if max increased
                    if(game.fx) game.fx.popText(game.player.x, game.player.y, `+${amount} ${stat.toUpperCase()}`, '#2ecc71');
                }
            }
        }
        else if (ach.rewardType === 'ITEM') {
            const itemId = val;
            const def = game.itemDefs.find(i => i.id === itemId);
            if (def) {
                game.inventory.push({...def});
                if(game.updateInventoryHUD) game.updateInventoryHUD();
                if(game.fx) game.fx.popText(game.player.x, game.player.y, `GOT ${def.name}`, '#fff');
            }
        }
    }

    showToast(ach) {
        this.toast.innerHTML = `
            <div style="font-size: 3rem;">${ach.icon}</div>
            <div style="text-align: left;">
                <div style="color: #f1c40f; font-size: 1.2rem;">ACHIEVEMENT UNLOCKED!</div>
                <div style="font-size: 1.5rem;">${ach.title}</div>
                <div style="font-size: 1rem; color: #aaa;">${ach.desc}</div>
            </div>
        `;
        
        // Slide down
        this.toast.style.transform = 'translateX(-50%) translateY(0)';
        
        // Hide after 4s
        setTimeout(() => {
            this.toast.style.transform = 'translateX(-50%) translateY(-200px)';
        }, 4000);
    }

    async saveProgress() {
        localStorage.setItem('ketebe_achievements_progress', JSON.stringify(this.unlocked));
        
        if (this.username) {
            try {
                await fetch(`/api/achievements/${this.username}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ unlocked: this.unlocked })
                });
            } catch (e) {
                console.error("Failed to save achievements to backend", e);
            }
        }
    }
    
    async reset() {
        this.unlocked = [];
        await this.saveProgress();
    }
}