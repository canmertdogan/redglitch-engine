const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const crypto = require('crypto');

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
  // Drop the preliminary stat() to eliminate the TOCTOU window between
  // "does it exist?" and "copy it": copyFile itself will fail with ENOENT
  // if there is nothing to back up, which we silently ignore.
  try {
    // FINDING-09: random .bak name + root check (prevents predictable symlink clobber / static leak)
    const bakPath = full + '.' + crypto.randomUUID() + '.bak';
    if (!isPathUnderRoot(rootDir, bakPath)) throw new Error('backup path outside root');
    await fsPromises.copyFile(full, bakPath);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('[safeFs] Backup failed:', e.message);
    }
  }

  // Atomic write: write to a temp sibling, then rename over the target so a
  // mid-write crash never leaves a half-written/truncated file behind.
  const tmpPath = full + '.tmp.' + crypto.randomUUID() + '.tmp';
  try {
    await fsPromises.writeFile(tmpPath, data, options);
    await fsPromises.rename(tmpPath, full);
  } catch (e) {
    try { await fsPromises.unlink(tmpPath); } catch (cleanupErr) {
      console.error('[safeFs] Failed to cleanup temp file:', cleanupErr.message);
    }
    throw e;
  }
  // Prune stale .bak/.tmp files older than 7 days in dir
  try {
    const dir = path.dirname(full);
    const entries = await fsPromises.readdir(dir);
    const cutoff = Date.now() - 7*24*60*60*1000;
    for (const e of entries) {
      if (e.endsWith('.bak') || e.includes('.tmp.')) {
        try { const st = await fsPromises.stat(path.join(dir, e)); if (st.mtimeMs < cutoff) await fsPromises.unlink(path.join(dir, e)); } catch {}
      }
    }
  } catch {}
  return undefined;
}

module.exports = {
  safeWriteFullPath
};
