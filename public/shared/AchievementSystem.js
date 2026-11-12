// AchievementSystem.js - Cross-engine achievements, target triggers, rewards & persistence

const _achEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

window.AchievementSystem = class AchievementSystem {
    constructor() {
        this.definitions = [];
        this.unlocked = [];
        this.unlockedAchievements = this.unlocked;
        this.username = null;
        this.toast = null;
        this._toastTimer = null;

        try {
            const defs = typeof localStorage !== 'undefined' && localStorage.getItem('redglitch_achievements_data');
            if (defs) {
                const parsed = JSON.parse(defs);
                if (Array.isArray(parsed)) this.definitions = parsed;
            }
        } catch (e) {
            console.warn('[AchievementSystem] Failed to parse achievement definitions from localStorage:', e);
        }

        if (typeof document !== 'undefined' && document.body) {
            this.createUI();
        }

        if (typeof window !== 'undefined' && window.RedglitchEventBus) {
            window.RedglitchEventBus.on('achievements:updated', (event) => {
                if (Array.isArray(event.data)) {
                    this.definitions = event.data;
                    try {
                        localStorage.setItem('redglitch_achievements_data', JSON.stringify(this.definitions));
                    } catch (_) {}
                    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('redglitch:achievements-changed'));
                    }
                }
            });
        }
    }

    _syncUnlocked(list) {
        const clean = [];
        const seen = new Set();
        for (const id of Array.isArray(list) ? list : []) {
            if (typeof id === 'string' && id && !seen.has(id)) {
                seen.add(id);
                clean.push(id);
            }
        }
        this.unlocked = clean;
        this.unlockedAchievements = clean;
    }

    async init(username = 'PLAYER') {
        this.username = username || 'PLAYER';

        // Load Definitions from server (project overlay takes precedence)
        if (typeof fetch === 'function') {
            try {
                const defRes = await fetch('/dunyalar/definitions/achievements.json');
                if (defRes.ok) {
                    const loaded = await defRes.json();
                    if (Array.isArray(loaded)) {
                        this.definitions = loaded;
                        try {
                            localStorage.setItem('redglitch_achievements_data', JSON.stringify(loaded));
                        } catch (_) {}
                    }
                }
            } catch (e) {
                console.warn('[AchievementSystem] Failed to load definitions from server, using cached:', e);
            }

            // Load progress from backend, fallback to localStorage on network/offline errors
            try {
                const response = await fetch(`/api/achievements/${encodeURIComponent(this.username)}`);
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data.unlocked)) {
                        this._syncUnlocked(data.unlocked);
                    }
                }
            } catch (e) {
                console.warn('[AchievementSystem] Backend progress load failed, using localStorage');
                this._loadLocalProgress();
            }
        } else {
            this._loadLocalProgress();
        }
    }

    _loadLocalProgress() {
        try {
            const prog = typeof localStorage !== 'undefined' && localStorage.getItem('redglitch_achievements_progress');
            if (prog) {
                const parsed = JSON.parse(prog);
                if (Array.isArray(parsed)) this._syncUnlocked(parsed);
            }
        } catch (parseErr) {
            console.warn('[AchievementSystem] Corrupt local progress, ignoring:', parseErr);
        }
    }

    createUI() {
        if (this.toast && this.toast.parentNode) return this.toast;
        if (typeof document === 'undefined' || !document.body) return null;

        this.toast = document.createElement('div');
        this.toast.id = 'ach-toast';
        this.toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-200px);
            background: #141826; border: 2px solid #ffd36a;
            color: #f4f7ff; padding: 14px 18px; font-family: 'VT323', monospace;
            display: flex; align-items: center; gap: 14px;
            transition: transform 0.35s ease; z-index: 99999; pointer-events: none;
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.75);
            min-width: 310px; max-width: 440px;
        `;
        document.body.appendChild(this.toast);
        return this.toast;
    }

    _matchesTrigger(ach, triggerCode, meta = {}) {
        if (!ach) return false;
        const trig = String(ach.trigger || '').trim();
        const code = String(triggerCode || '').trim();
        if (!code) return false;

        let matched = (trig === code);
        // Support direct manual/scripted unlocks by achievement ID
        if (!matched && (!trig || trig === 'MANUAL') && ach.id === code) {
            matched = true;
        }
        // Support QUEST_START / QUEST_COMPLETE configured with Target Filter or prefixed codes
        if (!matched && code.startsWith('QUEST_START_') && trig === 'QUEST_START') {
            const qId = code.slice('QUEST_START_'.length);
            if (!ach.target || String(ach.target).trim().toLowerCase() === qId.toLowerCase()) {
                return true;
            }
        }
        if (!matched && code.startsWith('QUEST_COMPLETE_') && trig === 'QUEST_COMPLETE') {
            const qId = code.slice('QUEST_COMPLETE_'.length);
            if (!ach.target || String(ach.target).trim().toLowerCase() === qId.toLowerCase()) {
                return true;
            }
        }
        if (!matched) return false;

        // Enforce optional Target Filter when specified on the achievement
        const reqTarget = ach.target != null ? String(ach.target).trim() : '';
        if (reqTarget) {
            const candidate = meta.target ?? meta.id ?? meta.enemyId ?? meta.itemId ?? meta.questId ?? meta.level;
            if (candidate == null) return false;
            return String(candidate).trim().toLowerCase() === reqTarget.toLowerCase();
        }
        return true;
    }

    async unlock(triggerCode, meta = {}) {
        if (!Array.isArray(this.definitions) || this.definitions.length === 0) return [];
        const matches = this.definitions.filter(a => this._matchesTrigger(a, triggerCode, meta));
        const newlyUnlocked = [];

        for (const ach of matches) {
            if (ach.prereq && !this.unlocked.includes(ach.prereq)) continue;
            if (!this.unlocked.includes(ach.id)) {
                this.unlocked.push(ach.id);
                this.unlockedAchievements = this.unlocked;
                newlyUnlocked.push(ach);
                this.grantReward(ach);
                await this.saveProgress();
                this.showToast(ach);
                if (typeof window !== 'undefined' && typeof CustomEvent === 'function' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('redglitch:achievement-unlocked', { detail: ach }));
                }
            }
        }
        return newlyUnlocked;
    }

    grantReward(ach) {
        if (!ach.rewardType || ach.rewardType === 'NONE') return;

        const campaign = typeof window !== 'undefined' ? window.campaignController : null;
        const game = typeof window !== 'undefined' ? window.game : null;
        const val = ach.rewardValue;

        if (ach.rewardType === 'XP') {
            const amount = parseInt(val, 10) || 0;
            if (campaign && typeof campaign.incrementVariable === 'function') {
                campaign.incrementVariable('xp', amount);
            }
            const adapterPlayer = campaign?.currentAdapter?.engine?.player;
            const targetPlayer = adapterPlayer || game?.player;
            if (targetPlayer) {
                targetPlayer.xp = (targetPlayer.xp || 0) + amount;
            }
            this._popText(`+${amount} XP`, '#ffd36a');
        } else if (ach.rewardType === 'STAT') {
            const parts = String(val || '').trim().split(/\s+/);
            if (parts.length === 2) {
                const stat = parts[0];
                const amount = parseInt(parts[1], 10) || 0;
                const targetPlayer = campaign?.currentAdapter?.engine?.player || game?.player;
                if (targetPlayer && targetPlayer[stat] !== undefined) {
                    targetPlayer[stat] += amount;
                    if (stat.includes('max')) {
                        const baseStat = stat.replace('max', '').toLowerCase();
                        if (targetPlayer[baseStat] !== undefined) targetPlayer[baseStat] += amount;
                    }
                }
                this._popText(`+${amount} ${stat.toUpperCase()}`, '#2ecc71');
            }
        } else if (ach.rewardType === 'ITEM') {
            const itemId = String(val || '').trim();
            if (!itemId) return;
            if (campaign && typeof campaign.giveItem === 'function') {
                campaign.giveItem(itemId, 1, { silentAchievement: true });
            } else if (game && Array.isArray(game.itemDefs)) {
                const def = game.itemDefs.find(i => i.id === itemId);
                if (def && Array.isArray(game.inventory)) {
                    game.inventory.push({ ...def });
                    if (game.updateInventoryHUD) game.updateInventoryHUD();
                }
            }
            this._popText(`GOT ${itemId}`, '#fff');
        }
    }

    _popText(text, color) {
        const game = typeof window !== 'undefined' ? window.game : null;
        if (game && game.fx && game.fx.popText && game.player) {
            game.fx.popText(game.player.x, game.player.y, text, color);
        } else if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
            window.showNotification(text, 'success');
        }
    }

    showToast(ach) {
        const toast = this.createUI();
        if (!toast) return;

        toast.innerHTML = `
            <div style="font-size: 2.6rem; line-height: 1;">${_achEsc(ach.icon || '🏆')}</div>
            <div style="text-align: left;">
                <div style="color: #ffd36a; font-size: 1rem; letter-spacing: 1px;">ACHIEVEMENT UNLOCKED</div>
                <div style="font-size: 1.4rem; color: #fff;">${_achEsc(ach.title || ach.id)}</div>
                <div style="font-size: 0.95rem; color: #94a3b8;">${_achEsc(ach.desc || '')}</div>
            </div>
        `;

        toast.style.transform = 'translateX(-50%) translateY(0)';
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            if (this.toast) this.toast.style.transform = 'translateX(-50%) translateY(-200px)';
        }, 4000);
    }

    getDisplayList() {
        const defs = Array.isArray(this.definitions) ? this.definitions : [];
        const unlockedSet = new Set(this.unlocked || []);
        const items = defs.map((ach) => {
            const isUnlocked = unlockedSet.has(ach.id);
            const hideSecret = Boolean(ach.secret) && !isUnlocked;
            return {
                id: ach.id,
                icon: hideSecret ? '🔒' : (ach.icon || '🏆'),
                title: hideSecret ? '??? (Secret Achievement)' : (ach.title || ach.id),
                desc: hideSecret ? 'Keep playing to discover this trophy.' : (ach.desc || ''),
                trigger: ach.trigger || 'MANUAL',
                rewardType: ach.rewardType || 'NONE',
                rewardValue: ach.rewardValue || '',
                unlocked: isUnlocked,
                secret: Boolean(ach.secret)
            };
        });
        return {
            unlockedCount: items.filter(i => i.unlocked).length,
            totalCount: items.length,
            items
        };
    }

    async saveProgress() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('redglitch_achievements_progress', JSON.stringify(this.unlocked));
            }
        } catch (_) {}

        if (this.username && typeof fetch === 'function') {
            try {
                await fetch(`/api/achievements/${encodeURIComponent(this.username)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ unlocked: this.unlocked })
                });
            } catch (e) {
                console.error('[AchievementSystem] Failed to save achievements to backend:', e);
            }
        }
    }

    async reset() {
        this._syncUnlocked([]);
        await this.saveProgress();
        if (typeof window !== 'undefined' && typeof CustomEvent === 'function' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('redglitch:achievements-changed'));
        }
    }
};
