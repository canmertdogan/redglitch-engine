const config = require('../config');

// Fills {{WIDTH}}/{{HEIGHT}}/{{GRID_SIZE}}/{{WIDTH_MAX}}/{{HEIGHT_MAX}} in a
// prompt template. width/height are caller-supplied (defaulting to config's
// values) so a run can override the world grid size.
function fillGridPlaceholders(template, width = config.WORLD_WIDTH, height = config.WORLD_HEIGHT) {
    return template
        .replace(/{{WIDTH_MAX}}/g, String(width - 1))
        .replace(/{{HEIGHT_MAX}}/g, String(height - 1))
        .replace(/{{GRID_SIZE}}/g, String(width * height))
        .replace(/{{WIDTH}}/g, String(width))
        .replace(/{{HEIGHT}}/g, String(height));
}

module.exports = { fillGridPlaceholders };
