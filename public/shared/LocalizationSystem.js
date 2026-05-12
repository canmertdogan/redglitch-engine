/**
 * Ketebe Engine - Unified Localization (i18n) System
 * Provides multi-language support across all engine types.
 */
class LocalizationSystem {
    constructor() {
        this.currentLang = localStorage.getItem('ketebe_lang') || 'EN';
        this.data = {};
        this.loaded = false;
        
        // Auto-initialize
        this.init();
    }

    /**
     * Load locale definitions
     */
    async init() {
        try {
            // Standardized path for locale definitions
            const res = await fetch('/dunyalar/definitions/locales.json');
            if (res.ok) {
                this.data = await res.json();
                this.loaded = true;
                this.apply();
                console.log(`[I18N] Loaded ${Object.keys(this.data).length} translation keys.`);
            }
        } catch(e) { 
            console.warn("[I18N] Localization file not found or corrupted."); 
        }
    }

    /**
     * Switch active language
     * @param {string} lang - 'EN' | 'TR' | 'AR' | etc.
     */
    setLanguage(lang) {
        if (!lang) return;
        this.currentLang = lang.toUpperCase();
        localStorage.setItem('ketebe_lang', this.currentLang);
        
        // Update document direction for Right-to-Left support
        document.body.dir = (this.currentLang === 'AR') ? 'rtl' : 'ltr';
        
        this.apply();

        // Broadcast change for engines that need to re-render text
        if (window.KetebeEventBus) {
            window.KetebeEventBus.emit('ui:language_changed', { lang: this.currentLang });
        }
    }

    /**
     * Get translated text for a key
     * @param {string} key 
     * @returns {string}
     */
    get(key) {
        if (!this.data || !this.data[key]) return key;
        return this.data[key][this.currentLang] || this.data[key]['EN'] || key;
    }

    /**
     * Update all DOM elements with [data-i18n] attribute
     */
    apply() {
        if (!this.loaded) return;
        
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const translation = this.get(key);
            
            // Check if element is an input with a placeholder
            if (el.tagName === 'INPUT' && el.placeholder) {
                el.placeholder = translation;
            } else {
                el.innerText = translation;
            }
        });
        
        // Helper map for common launcher/dashboard IDs that might lack tags
        const legacyMap = {
            'btn-new-game': 'ui.start_game',
            'btn-load-game': 'ui.continue',
            'btn-settings': 'ui.settings',
            'btn-credits': 'ui.credits',
            'btn-quit': 'ui.quit'
        };
        
        Object.keys(legacyMap).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = this.get(legacyMap[id]);
        });
    }
}

// Export global instance
window.I18N = new LocalizationSystem();
// Maintain backward compatibility for older RPG scripts
window.LOCALE = window.I18N;
