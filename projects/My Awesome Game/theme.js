// theme.js - Unified Theme System for RedGlitch Engine

const THEMES = {
    'modern-dark': {
        'bg-root': '#050508',
        'bg-panel': '#080c18',
        'bg-header': '#000000',
        'bg-canvas': '#080808',
        'bg-input': '#000000',
        'border': '#1f2b42',
        'accent': '#f1c40f',
        'text-main': '#e0e0e0',
        'text-muted': '#888'
    },
    'cyberpunk': {
        'bg-root': '#0d0221',
        'bg-panel': '#0f081d',
        'bg-header': '#000000',
        'bg-canvas': '#000000',
        'bg-input': '#241734',
        'border': '#ff0055',
        'accent': '#00f3ff',
        'text-main': '#00f3ff',
        'text-muted': '#ff0055'
    },
    'classic-dungeon': {
        'bg-root': '#1a1a1a',
        'bg-panel': '#2c2c2c',
        'bg-header': '#000000',
        'bg-canvas': '#111111',
        'bg-input': '#000000',
        'border': '#4a4a4a',
        'accent': '#e67e22',
        'text-main': '#ccc',
        'text-muted': '#666'
    }
};

function setTheme(themeId) {
    const theme = THEMES[themeId] || THEMES['modern-dark'];
    const root = document.documentElement;
    
    Object.keys(theme).forEach(key => {
        root.style.setProperty(`--${key}`, theme[key]);
    });
    
    localStorage.setItem('redglitch_theme', themeId);
    console.log(`[Theme] Switched to ${themeId}`);
}

function loadSavedTheme() {
    const saved = localStorage.getItem('redglitch_theme') || 'modern-dark';
    setTheme(saved);
}

// Auto-load on script execution
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSavedTheme);
} else {
    loadSavedTheme();
}

window.setTheme = setTheme;
window.loadSavedTheme = loadSavedTheme;
