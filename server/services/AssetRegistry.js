const fs = require('fs').promises;
const path = require('path');
const projectService = require('./projectService');

class AssetRegistry {
    constructor() {
        this.cache = null;
    }

    async getRegistry() {
        if (!this.cache) await this.rebuild();
        return this.cache;
    }

    async rebuild() {
        const activeProject = projectService.getActiveProject();
        console.log(`[AssetRegistry] Rebuilding for: ${activeProject}`);
        
        const assets = await this._scanProject(activeProject);
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
            { dir: 'data', type: 'data' }
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
        let type = defaultType;
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';
        else if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio';
        else if (['.json', '.algorithm', '.3dmap'].includes(ext)) type = 'data';

        let assetPath = file.rel;
        if (isEngineCore) {
            // Engine core files are served from / (e.g. /assets/foo.png)
            assetPath = `/${assetPath}`;
        } else if (!isRoot) {
            // Project files are served from /projects/Name/ (e.g. /projects/my-game/assets/foo.png)
            assetPath = `projects/${projectBase}/${assetPath}`;
        } else {
            // Root project (main engine) files are served from /
            assetPath = `/${assetPath}`;
        }

        return {
            id: file.rel.replace(/\\/g, '/'),
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
