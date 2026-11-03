const path = require('path');

module.exports = {
    PORT: process.env.PORT || 3000,
    // Bind loopback by default: the API has no authentication (arbitrary file
    // write via /api/ide/write, /api/git/commit, /api/build, ...), so exposing it
    // on 0.0.0.0 hands those endpoints to every host on the LAN.
    // Set REDGLITCH_HOST=0.0.0.0 to opt in when testing from a phone/tablet.
    HOST: process.env.REDGLITCH_HOST || '127.0.0.1',
    
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
