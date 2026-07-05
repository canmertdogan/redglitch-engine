const http = require('http');

function request(app, method, url, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const opts = {
        hostname: '127.0.0.1',
        port,
        path: url,
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          server.close();
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

function createApp(router, basePath = '/api', middleware = []) {
  const express = require('express');
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  for (const mw of middleware) app.use(mw);
  app.use(basePath, router);
  return app;
}

module.exports = { request, createApp };
