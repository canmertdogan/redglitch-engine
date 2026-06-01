// localization.js - Dynamic Language System

class LocalizationSystem {
    constructor() {
        this.currentLang = localStorage.getItem('redglitch_lang') || 'EN';
        this.data = {};
        this.loaded = false;
        this.init();
    }

    async init() {
        try {
            const res = await fetch('/dunyalar/definitions/locales.json');
            if (res.ok) {
                this.data = await res.json();
                this.loaded = true;
                this.apply();
            }
        } catch(e) { console.warn("Localization load failed", e); }
    }

    setLanguage(lang) {
        this.currentLang = lang;
        localStorage.setItem('redglitch_lang', lang);
        this.apply();
        // Update document direction for Arabic
        document.body.dir = (lang === 'AR') ? 'rtl' : 'ltr';
    }

    get(key) {
        if (!this.data[key]) return key;
        return this.data[key][this.currentLang] || this.data[key]['EN'] || key;
    }

    apply() {
        if (!this.loaded) return;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            el.innerText = this.get(key);
        });
        
        // Special case for buttons in main menu if they don't have data-i18n tags yet
        // We can manually map IDs or update HTML to use tags.
        // For now, let's look for common IDs
        const map = {
            'btn-new-game': 'ui.start_game',
            'btn-load-game': 'ui.continue',
            'btn-settings': 'ui.settings',
            'btn-credits': 'ui.credits',
            'btn-quit': 'ui.quit'
        };
        
        Object.keys(map).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = this.get(map[id]);
        });
    }
}

window.LOCALE = new LocalizationSystem();