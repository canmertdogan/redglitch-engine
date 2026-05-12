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
        const assets = [];
        
        const scanDirs = [
            { dir: 'assets', type: 'image' },
            { dir: 'muzikler', type: 'audio' },
            { dir: 'dunyalar', type: 'data' },
            { dir: 'sprite-art', type: 'image' },
            { dir: 'data', type: 'data' }
        ];

        const baseScanPath = isRoot ? path.join(projectPath, 'public') : projectPath;

        for (const entry of scanDirs) {
            const fullPath = path.join(baseScanPath, entry.dir);
            try {
                const files = await this._walk(fullPath, entry.dir);
                for (const file of files) {
                    const ext = path.extname(file.dirent.name).toLowerCase();
                    let type = entry.type;
                    if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) type = 'image';
                    else if (['.mp3', '.wav', '.ogg'].includes(ext)) type = 'audio';
                    else if (['.json', '.algorithm', '.3dmap'].includes(ext)) type = 'data';

                    let assetPath = file.rel;
                    if (!isRoot) {
                        assetPath = `projects/${projectBase}/${assetPath}`;
                    } else {
                        assetPath = `/${assetPath}`;
                    }

                    let size = 0;
                    try { size = (await fs.stat(file.full)).size; } catch(e){}

                    assets.push({
                        id: file.rel.replace(/\\/g, '/'),
                        name: file.dirent.name,
                        path: assetPath,
                        type: type,
                        metadata: {
                            size: size,
                            ext: ext
                        }
                    });
                }
            } catch (e) {
                // Directory skip
            }
        }
        return assets;
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
