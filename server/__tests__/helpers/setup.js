const path = require('path');
const fs = require('fs').promises;
const projectService = require('../../services/projectService');
const config = require('../../config');

const TEST_PROJECT_PREFIX = '__test_project_';

function testProjectName(label) {
  return `${TEST_PROJECT_PREFIX}${label}`;
}

function isTestProject(name) {
  return name.startsWith(TEST_PROJECT_PREFIX);
}

function testProjectPath(label) {
  return path.join(config.PROJECTS_ROOT, testProjectName(label));
}

async function createTestProject(label, overrides = {}) {
  const name = testProjectName(label);
  const projectPath = path.join(config.PROJECTS_ROOT, name);
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, 'redglitch.json'),
    JSON.stringify({
      name,
      author: 'test',
      version: '0.1.0',
      description: 'Test project',
      engineType: overrides.engineType || 'rpg-topdown',
      template: 'blank',
      created: new Date().toISOString(),
      engineVersion: '7.0.1',
      metadata: { is3D: false, renderQuality: 'medium', physics3D: false, shadowQuality: false },
    }, null, 2),
    'utf8',
  );
  return name;
}

async function projectExists(label) {
  try {
    await fs.access(testProjectPath(label));
    return true;
  } catch {
    return false;
  }
}

async function cleanupTestProjects() {
  const entries = await fs.readdir(config.PROJECTS_ROOT).catch(() => []);
  for (const entry of entries) {
    if (isTestProject(entry)) {
      await fs.rm(path.join(config.PROJECTS_ROOT, entry), { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function activateTestProject(label) {
  projectService.setActiveProject(testProjectName(label));
}

function resetActiveProject() {
  projectService.setActiveProject(null);
}

module.exports = {
  TEST_PROJECT_PREFIX,
  testProjectName,
  isTestProject,
  testProjectPath,
  createTestProject,
  projectExists,
  cleanupTestProjects,
  activateTestProject,
  resetActiveProject,
};
