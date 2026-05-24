const path = require('path');

module.exports = {
    PORT: process.env.PORT || 3000,
    HOST: '0.0.0.0',
    
    // Directories
    ROOT_DIR: path.join(__dirname, '..'),
    PUBLIC_DIR: path.join(__dirname, '..', 'public'),
    PROJECTS_ROOT: path.join(__dirname, '..', 'projects'),
    TEMPLATES_ROOT: path.join(__dirname, '..', 'templates'),
    DATA_DIR: path.join(__dirname, '..', 'data'),
    
    // Limits
    JSON_LIMIT: '50mb',
    
    // File watching
    WATCH_ENABLED: true,
    WATCH_PATHS: [path.join(__dirname, '..', 'public')],
    
    // Logging
    LOG_REQUESTS: false
};
