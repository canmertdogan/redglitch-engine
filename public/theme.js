// theme.js - Unified Theme System for RedGlitch Engine

const THEMES = {
    'modern-dark': {
        'bg-root': '#050508',
        'bg-panel': 'rgba(12, 12, 20, 0.8)',
        'bg-header': 'rgba(0, 0, 0, 0.5)',
        'bg-canvas': '#050508',
        'bg-input': 'rgba(0, 0, 0, 0.4)',
        'bg-deep': '#050508',
        'bg-main': 'rgba(12, 12, 20, 0.82)',
        'bg-ui': 'rgba(20, 18, 30, 0.92)',
        'bg-widget': 'rgba(12, 12, 20, 0.8)',
        'border': 'rgba(255, 255, 255, 0.05)',
        'border-highlight': 'rgba(255, 30, 39, 0.3)',
        'edge-border': '1px solid rgba(255, 255, 255, 0.08)',
        'accent': '#ff1e27',
        'text-main': '#e0e0e0',
        'text-muted': '#777',
        'text': '#e0e0e0'
    },
    'cyberpunk': {
        'bg-root': '#0d0221',
        'bg-panel': '#0f081d',
        'bg-header': '#000000',
        'bg-canvas': '#000000',
        'bg-input': '#241734',
        'bg-deep': '#0d0221',
        'bg-main': '#0f081d',
        'bg-ui': '#1b1230',
        'bg-widget': '#130a24',
        'border': '#ff0055',
        'border-highlight': '#ff4d88',
        'edge-border': '2px solid #32041f',
        'accent': '#00f3ff',
        'text-main': '#00f3ff',
        'text-muted': '#ff0055',
        'text': '#c4fbff'
    },
    'classic-dungeon': {
        'bg-root': '#1a1a1a',
        'bg-panel': '#2c2c2c',
        'bg-header': '#000000',
        'bg-canvas': '#111111',
        'bg-input': '#000000',
        'bg-deep': '#1a1a1a',
        'bg-main': '#2c2c2c',
        'bg-ui': '#242424',
        'bg-widget': '#252525',
        'border': '#4a4a4a',
        'border-highlight': '#666666',
        'edge-border': '2px solid #111111',
        'accent': '#e67e22',
        'text-main': '#ccc',
        'text-muted': '#666',
        'text': '#d6d6d6'
    },
    'modern-light': {
        'bg-root': '#f3f6fb',
        'bg-panel': '#ffffff',
        'bg-header': '#e9eff7',
        'bg-canvas': '#f8fbff',
        'bg-input': '#ffffff',
        'bg-deep': '#f3f6fb',
        'bg-main': '#ffffff',
        'bg-ui': '#e9eff7',
        'bg-widget': '#ffffff',
        'border': '#b8c7db',
        'border-highlight': '#8ea6c5',
        'edge-border': '2px solid #b8c7db',
        'accent': '#2563eb',
        'text-main': '#1f2a37',
        'text-muted': '#4b5563',
        'text': '#1f2a37'
    }
};

function setTheme(themeId) {
    const theme = THEMES[themeId] || THEMES['modern-dark'];
    const root = document.documentElement;
    
    Object.keys(theme).forEach(key => {
        root.style.setProperty(`--${key}`, theme[key]);
    });
    root.setAttribute('data-theme', themeId);
    
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
window.REDGLITCH_THEMES = THEMES;
