const { exec } = require('child_process');
const path = require('path');
const config = require('../config');

class GitService {
    constructor() {
        this.rootDir = config.ROOT_DIR;
    }

    execute(command) {
        return new Promise((resolve, reject) => {
            exec(command, { cwd: this.rootDir }, (error, stdout, stderr) => {
                if (error) {
                    reject({ error, stderr });
                    return;
                }
                resolve(stdout.trim());
            });
        });
    }

    async status() {
        try {
            const out = await this.execute('git status --short');
            return out || 'Your branch is up to date.';
        } catch (e) {
            return 'Error: ' + e.stderr;
        }
    }

    async add(filePath = '.') {
        try {
            await this.execute(`git add "${filePath}"`);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.stderr };
        }
    }

    async commit(message) {
        try {
            const out = await this.execute(`git commit -m "${message.replace(/"/g, '"')}"`);
            return { success: true, output: out };
        } catch (e) {
            return { success: false, error: e.stderr };
        }
    }

    async diff() {
        try {
            return await this.execute('git diff');
        } catch (e) {
            return 'Error: ' + e.stderr;
        }
    }
}

module.exports = new GitService();
