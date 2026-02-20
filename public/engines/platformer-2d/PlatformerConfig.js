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
    DEFAULT_ZOOM: 1.5,
    
    // Graphics
    SPRITE_SCALE: 1,
    DEFAULT_BG: '#87CEEB',
    
    // IRAB Aesthetic
    DEFAULT_PLAYER_MODE: 'WORM', // 'WORM' or 'SPRITE'
    
    // UI
    HUD_FONT: '24px VT323, monospace',
    HUD_COLOR: '#fff'
};

window.PlatformerConfig = PlatformerConfig;
