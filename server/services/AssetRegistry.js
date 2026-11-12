const fs = require('fs').promises;
const path = require('path');
const projectService = require('./projectService');

class AssetRegistry {
    constructor() {
        this.cache = null;
        this.cachedProjectPath = null;
    }

    async getRegistry() {
        const activeProject = projectService.getActiveProject();
        if (!this.cache || this.cachedProjectPath !== activeProject) await this.rebuild();
        return this.cache;
    }

    async rebuild() {
        const activeProject = projectService.getActiveProject();
        console.log(`[AssetRegistry] Rebuilding for: ${activeProject}`);
        
        const assets = await this._scanProject(activeProject);
        this.cachedProjectPath = activeProject;
        this.cache = { 
            assets,
            updated: Date.now(),
            project: path.basename(activeProject)
        };
        
        return this.cache;
    }

    async _scanProject(projectPath) {
        const isRoot = projectService.isRootProject();
        const projectBase = path.basename(projectPath);
        const assets = new Map(); // Use Map to handle overrides (project wins)
        
        const scanDirs = [
            { dir: 'assets', type: 'image' },
            { dir: 'muzikler', type: 'audio' },
            { dir: 'dunyalar', type: 'data' },
            { dir: 'sprite-art', type: 'image' },
            { dir: 'data', type: 'data' },
            { dir: 'scripts', type: 'script' }
        ];

        // 1. Scan CORE ENGINE (public/) if we are in a sub-project
        if (!isRoot) {
            const corePublic = path.join(__dirname, '..', '..', 'public');
            for (const entry of scanDirs) {
                const fullPath = path.join(corePublic, entry.dir);
                try {
                    const files = await this._walk(fullPath, entry.dir);
                    for (const file of files) {
                        const asset = this._mapFileToAsset(file, entry.type, true);
                        assets.set(asset.id, asset);
                    }
                } catch (e) {
                    if (e.code !== 'ENOENT') console.error('[AssetRegistry] Error scanning core engine dir:', e);
                }
            }
        }

        // 2. Scan PROJECT (or public/ if root)
        const baseScanPath = isRoot ? path.join(projectPath, 'public') : projectPath;
        for (const entry of scanDirs) {
            const fullPath = path.join(baseScanPath, entry.dir);
            try {
                const files = await this._walk(fullPath, entry.dir);
                for (const file of files) {
                    const asset = this._mapFileToAsset(file, entry.type, false, isRoot, projectBase);
                    // Project asset overrides core if ID is the same
                    assets.set(asset.id, asset);
                }
            } catch (e) {
                if (e.code !== 'ENOENT') console.error('[AssetRegistry] Error scanning project dir:', e);
            }
        }

        return Array.from(assets.values());
    }

    _mapFileToAsset(file, defaultType, isEngineCore, isRoot = true, projectBase = '') {
        const ext = path.extname(file.dirent.name).toLowerCase();
        const relNorm = String(file.rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
        let type = defaultType;
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) type = 'image';
        else if (['.mp3', '.wav', '.ogg', '.flac'].includes(ext)) type = 'audio';
        else if (['.frag', '.vert', '.glsl'].includes(ext)) type = 'shader';
        else if (
            ext === '.js' &&
            (relNorm.startsWith('data/logic/') ||
                relNorm.startsWith('data/brains/') ||
                relNorm.startsWith('scripts/') ||
                defaultType === 'script')
        ) {
            type = 'script';
        } else if (['.json', '.algorithm', '.3dmap', '.psd', '.ai', '.xcf', '.aseprite'].includes(ext)) {
            type = 'data';
        }

        let assetPath = relNorm;
        if (isEngineCore) {
            // Engine core files are served from / (e.g. /assets/foo.png)
            assetPath = `/${relNorm}`;
        } else if (!isRoot) {
            // Project files are served from /projects/Name/ (e.g. /projects/my-game/assets/foo.png)
            assetPath = `/projects/${projectBase}/${relNorm}`;
        } else {
            // Root project (main engine) files are served from /
            assetPath = `/${relNorm}`;
        }

        return {
            id: relNorm,
            name: file.dirent.name,
            path: assetPath,
            type: type,
            metadata: {
                ext: ext,
                source: isEngineCore ? 'engine' : 'project'
            }
        };
    }

    async _walk(dir, rel) {
        const found = [];
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (e) { return []; }

        for (const d of entries) {
            if (d.name === 'node_modules' || d.name === '.git' || d.name.startsWith('.')) continue;
            if (d.name.endsWith('.bak') || d.name.includes('.tmp.')) continue;
            const childFull = path.join(dir, d.name);
            const childRel = path.join(rel, d.name).replace(/\\/g, '/');
            if (d.isDirectory()) {
                found.push(...(await this._walk(childFull, childRel)));
            } else {
                found.push({ dirent: d, full: childFull, rel: childRel });
            }
        }
        return found;
    }
}

module.exports = new AssetRegistry();
