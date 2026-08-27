// Local shape/range validation for 2D levels. The heavier server-side
// normalizers (normalizeLevelPayload, inferEngineTypeFromLevelData in
// server/routes/levels.js) aren't exported, so this mirrors just enough of
// their shape checks to give the phase-3 retry loop a fast, local signal
// before round-tripping to the Redglitch server.

function validateTilemapLevel(level) {
    const errors = [];
    if (typeof level.width !== 'number' || level.width < 4 || level.width > 64) {
        errors.push('width must be a number between 4 and 64');
    }
    if (typeof level.height !== 'number' || level.height < 4 || level.height > 64) {
        errors.push('height must be a number between 4 and 64');
    }
    if (!Array.isArray(level.layers) || level.layers.length === 0) {
        errors.push('layers must be a non-empty array of tile-id arrays');
    } else {
        const expectedLen = level.width * level.height;
        level.layers.forEach((layer, i) => {
            if (!Array.isArray(layer)) {
                errors.push(`layers[${i}] must be an array`);
            } else if (layer.length !== expectedLen) {
                errors.push(`layers[${i}] length (${layer.length}) must equal width*height (${expectedLen})`);
            }
        });
    }
    if (errors.length) {
        throw new Error(errors.join('; '));
    }
    return level;
}

function validatePlatformerLevel(level) {
    const errors = [];
    if (typeof level.width !== 'number' || level.width < 4 || level.width > 64) {
        errors.push('width must be a number between 4 and 64');
    }
    if (typeof level.height !== 'number' || level.height < 4 || level.height > 64) {
        errors.push('height must be a number between 4 and 64');
    }
    if (!level.spawn || typeof level.spawn.x !== 'number' || typeof level.spawn.y !== 'number') {
        errors.push('spawn must be an object with numeric x and y');
    }
    if (!Array.isArray(level.collision)) {
        errors.push('collision must be an array of tile ids');
    } else if (level.collision.length !== level.width * level.height) {
        errors.push(`collision length (${level.collision.length}) must equal width*height (${level.width * level.height})`);
    }
    if (errors.length) {
        throw new Error(errors.join('; '));
    }
    return level;
}

// engineType -> validator. Only the MVP's supported 2D engines are handled;
// callers should have already normalized engineType via schemas/engineTypes.js.
function validateLevel2D(engineType, level) {
    if (!level || typeof level !== 'object') {
        throw new Error('level data must be an object');
    }
    if (engineType === 'platformer-2d') {
        return validatePlatformerLevel(level);
    }
    // rpg-topdown, iso-pixel
    return validateTilemapLevel(level);
}

module.exports = { validateLevel2D, validateTilemapLevel, validatePlatformerLevel };
