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

  // Keep a backup of the previous content (if any) so a crash/partial write
  // can't destroy the only good copy.
  try {
    const stat = await fsPromises.stat(full);
    if (stat.isFile()) {
      await fsPromises.copyFile(full, full + '.bak');
    }
  } catch (e) {
    // No existing file to back up — fine.
  }

  // Atomic write: write to a temp sibling, then rename over the target so a
  // mid-write crash never leaves a half-written/truncated file behind.
  const tmpPath = full + '.tmp.' + process.pid + '.' + Date.now() + '.tmp';
  try {
    await fsPromises.writeFile(tmpPath, data, options);
    await fsPromises.rename(tmpPath, full);
  } catch (e) {
    try { await fsPromises.unlink(tmpPath); } catch (_) {}
    throw e;
  }
  return undefined;
}

module.exports = {
  safeWriteFullPath
};
