/**
 * PlatformerConfig.js
 * Centralized configuration for the 2D Platformer Engine.
 */

const PlatformerConfig = {
    // Physics
    GRAVITY: 0.5,
    FRICTION: 0.8,
    MAX_WALK_SPEED: 4,
    MAX_RUN_SPEED: 6,
    JUMP_FORCE: -10,
    AIR_RESISTANCE: 0.95,
    
    // Mechanics
    COYOTE_TIME: 0.15, // Seconds
    JUMP_BUFFER: 0.1,  // Seconds
    WALL_SLIDE_SPEED: 2,
    WALL_JUMP_FORCE_X: 5,
    WALL_JUMP_FORCE_Y: -8,
    DASH_FORCE: 12,
    DASH_DURATION: 0.2,
    DASH_COOLDOWN: 0.5,
    
    // World
    TILE_SIZE: 32,
    CHUNK_SIZE: 16,
    SOURCE_TILE_SIZE: 16,
    DEFAULT_ZOOM: 1.5,
    MAX_RENDER_CHUNKS: 512,
    
    // Graphics
    SPRITE_SCALE: 1,
    DEFAULT_BG: '#000',
    ACCENT_COLOR: '#ff1e27',
    
    // Aesthetic
    DEFAULT_PLAYER_MODE: 'SPRITE', // 'WORM' or 'SPRITE'
    
    // UI
    HUD_FONT: '24px VT323, monospace',
    HUD_COLOR: '#fff'
};

window.PlatformerConfig = PlatformerConfig;
