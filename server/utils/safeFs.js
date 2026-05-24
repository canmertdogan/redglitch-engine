const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

function getRealPathSync(p) {
    let current = p;
    let suffix = '';
    while (current !== path.dirname(current)) {
        try {
            const real = fs.realpathSync(current);
            return path.join(real, suffix);
        } catch (e) {
            suffix = suffix ? path.join(path.basename(current), suffix) : path.basename(current);
            current = path.dirname(current);
        }
    }
    return p;
}

function isPathUnderRoot(rootDir, targetPath) {
  if (!rootDir || !targetPath) return false;
  const root = path.resolve(rootDir);
  const fullPath = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(root, targetPath);
  
  const realPath = getRealPathSync(fullPath);
  const rel = path.relative(root, realPath);
  
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('..' + path.sep));
}

async function safeWriteFile(rootDir, targetPath, data, options) {
  if (!isPathUnderRoot(rootDir, targetPath)) {
    throw new Error('safeWriteFile: target path is outside of allowed root');
  }
  const fullPath = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(rootDir, targetPath);
  await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
  return fsPromises.writeFile(fullPath, data, options);
}

function safeWriteFileSync(rootDir, targetPath, data, options) {
  if (!isPathUnderRoot(rootDir, targetPath)) {
    throw new Error('safeWriteFileSync: target path is outside of allowed root');
  }
  const fullPath = path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(rootDir, targetPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  return fs.writeFileSync(fullPath, data, options);
}

async function safeWriteFullPath(rootDir, fullPath, data, options) {
  if (!isPathUnderRoot(rootDir, fullPath)) {
    throw new Error('safeWriteFullPath: target path is outside of allowed root');
  }
  const full = path.resolve(fullPath);
  await fsPromises.mkdir(path.dirname(full), { recursive: true });
  return fsPromises.writeFile(full, data, options);
}

function safeWriteFullPathSync(rootDir, fullPath, data, options) {
  if (!isPathUnderRoot(rootDir, fullPath)) {
    throw new Error('safeWriteFullPathSync: target path is outside of allowed root');
  }
  const full = path.resolve(fullPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  return fs.writeFileSync(full, data, options);
}

module.exports = {
  isPathUnderRoot,
  safeWriteFile,
  safeWriteFileSync,
  safeWriteFullPath,
  safeWriteFullPathSync
};
