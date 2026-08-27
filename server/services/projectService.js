const path = require('path');
const config = require('../config');

class ProjectService {
    constructor() {
        this.activeProject = config.ROOT_DIR;
    }

    isRootProject() {
        return this.activeProject === config.ROOT_DIR || 
               path.resolve(this.activeProject) === path.resolve(config.ROOT_DIR);
    }

    setActiveProject(projectName) {
        if (!projectName || projectName === '[object Object]') {
            this.activeProject = config.ROOT_DIR;
            return 'ROOT';
        }
        // Sanitize: only allow a safe project-name charset (no path separators,
        // dots, etc.) so a crafted name can never traverse out of PROJECTS_ROOT.
        const safeName = (projectName || '').toString()
            .replace(/[^a-zA-Z0-9 \-_]/g, '')
            .trim();
        if (!safeName) {
            this.activeProject = config.ROOT_DIR;
            return 'ROOT';
        }
        const root = path.resolve(config.PROJECTS_ROOT);
        const resolved = path.resolve(root, safeName);
        // Defense in depth: the resolved path must stay inside PROJECTS_ROOT.
        if (resolved !== root && !resolved.startsWith(root + path.sep)) {
            console.warn(`[ProjectService] Rejected out-of-root active project: ${projectName}`);
            this.activeProject = config.ROOT_DIR;
            return 'ROOT';
        }
        this.activeProject = resolved;
        return safeName;
    }

    getActiveProject() {
        return this.activeProject;
    }

    getProjectPath(relativePath = '') {
        return this.isRootProject()
            ? path.join(config.ROOT_DIR, relativePath)
            : path.join(this.activeProject, relativePath);
    }

    getDunyalarPath() {
        return this.isRootProject()
            ? path.join(config.PUBLIC_DIR, 'dunyalar')
            : path.join(this.activeProject, 'dunyalar');
    }
}

// Singleton instance
const projectService = new ProjectService();

module.exports = projectService;
