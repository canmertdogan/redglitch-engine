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

async function safeWriteFullPath(rootDir, fullPath, data, options) {
  if (!isPathUnderRoot(rootDir, fullPath)) {
    throw new Error('safeWriteFullPath: target path is outside of allowed root');
  }
  const full = path.resolve(fullPath);
  await fsPromises.mkdir(path.dirname(full), { recursive: true });
  return fsPromises.writeFile(full, data, options);
}

module.exports = {
  safeWriteFullPath
};
