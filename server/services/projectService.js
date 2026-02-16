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
        this.activeProject = path.join(config.PROJECTS_ROOT, projectName);
        return projectName;
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
