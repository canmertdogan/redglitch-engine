const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');

class GitService {
    constructor() {
        this.rootDir = config.ROOT_DIR;
    }

    isSafePath(filePath) {
        if (!filePath) return false;
        if (path.isAbsolute(filePath)) return false;
        const normalized = path.normalize(filePath);
        if (normalized.startsWith('..' + path.sep) || normalized === '..') return false;
        return true;
    }

    execute(args) {
        return new Promise((resolve, reject) => {
            const child = spawn('git', args, { cwd: this.rootDir });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            child.on('error', (error) => {
                reject({ error, stderr });
            });
            child.on('close', (code) => {
                if (code !== 0) {
                    reject({ error: new Error(`git exited with code ${code}`), stderr: stderr.trim() });
                    return;
                }
                resolve(stdout.trim());
            });
        });
    }

    async status() {
        try {
            const out = await this.execute(['status', '--short']);
            return out || 'Your branch is up to date.';
        } catch (e) {
            return 'Error: ' + e.stderr;
        }
    }

    async add(filePath = '.') {
        try {
            if (!this.isSafePath(filePath) && filePath !== '.') {
                return { success: false, error: 'Invalid file path' };
            }
            await this.execute(['add', filePath]);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.stderr };
        }
    }

    async commit(message) {
        try {
            if (!message || typeof message !== 'string') {
                return { success: false, error: 'Commit message required' };
            }
            const out = await this.execute(['commit', '-m', message]);
            return { success: true, output: out };
        } catch (e) {
            return { success: false, error: e.stderr };
        }
    }

    async diff() {
        try {
            return await this.execute(['diff']);
        } catch (e) {
            return 'Error: ' + e.stderr;
        }
    }
}

module.exports = new GitService();
