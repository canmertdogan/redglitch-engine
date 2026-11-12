const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const assets3dRouter = require('../assets3d');
const config = require('../../config');
const { request, createApp } = require('../../__tests__/helpers/route-test');
const {
  testProjectName, createTestProject, cleanupTestProjects,
} = require('../../__tests__/helpers/setup');

test.after(cleanupTestProjects);

function multipartUpload(app, url, fields) {
  return new Promise((resolve, reject) => {
    const boundary = '----RedglitchTestBoundary' + Date.now();
    const chunks = [];
    for (const f of fields) {
      chunks.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`
      ));
      chunks.push(Buffer.from(f.content));
      chunks.push(Buffer.from('\r\n'));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(chunks);

    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: url,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          server.close();
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, data: parsed });
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      req.write(body);
      req.end();
    });
  });
}

test('GET /api/assets3d/:project accepts project names with spaces and blocks traversal', async () => {
  await cleanupTestProjects();
  const spacedProject = testProjectName('spaced project');
  await fs.mkdir(path.join(config.PROJECTS_ROOT, spacedProject, 'assets3d'), { recursive: true });
  await fs.writeFile(path.join(config.PROJECTS_ROOT, spacedProject, 'assets3d', 'cube.glb'), 'glb');

  const app = createApp(assets3dRouter, '/api/assets3d');
  const res = await request(app, 'GET', `/api/assets3d/${encodeURIComponent(spacedProject)}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.gltf, ['cube.glb']);

  const assetRes = await request(
    app,
    'GET',
    `/api/assets3d/${encodeURIComponent(spacedProject)}/cube.glb`,
  );
  assert.equal(assetRes.status, 200);

  for (const bad of ['..', '../etc', 'a%2Fb', 'a%5Cb', '.']) {
    const badRes = await request(app, 'GET', `/api/assets3d/${bad}`);
    assert.equal(badRes.status, 400, `Expected 400 for ${bad}`);
  }
});

test('POST /api/assets3d/:project uploads .obj and .mtl using multer file.originalname', async () => {
  await cleanupTestProjects();
  const projectName = await createTestProject('assets3d upload');
  const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
  const app = createApp(assets3dRouter, '/api/assets3d', [
    upload.fields([{ name: 'file', maxCount: 1 }, { name: 'mtl', maxCount: 1 }]),
  ]);

  const res = await multipartUpload(app, `/api/assets3d/${encodeURIComponent(projectName)}`, [
    { field: 'file', filename: 'crate.obj', content: 'v 0 0 0\nv 1 0 0\nv 0 1 0\n' },
    { field: 'mtl', filename: 'crate.mtl', content: 'newmtl crateMat\n' },
  ]);

  assert.equal(res.status, 200);
  assert.equal(res.data.success, true);
  assert.equal(res.data.asset.name, 'crate.obj');
  assert.equal(res.data.asset.mtlName, 'crate.mtl');

  const assetsDir = path.join(config.PROJECTS_ROOT, projectName, 'assets3d');
  await fs.access(path.join(assetsDir, 'crate.obj'));
  await fs.access(path.join(assetsDir, 'crate.mtl'));
});
