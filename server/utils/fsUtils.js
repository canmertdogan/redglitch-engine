const fs = require('fs').promises;

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') {
            throw e;
        }
    }
}

module.exports = {
    ensureDir
};
