const test = require('node:test');
const assert = require('node:assert/strict');
const { stateMutationGuard, securityHeaders } = require('./logging');

function runGuard(origin) {
  const req = { method: 'POST', headers: origin === undefined ? {} : { origin } };
  let status = 200;
  let body = null;
  let nextCalled = false;
  const res = {
    status(code) { status = code; return this; },
    json(payload) { body = payload; return this; },
  };
  stateMutationGuard(req, res, () => { nextCalled = true; });
  return { status, body, nextCalled };
}

test('GET requests pass through untouched', () => {
  const req = { method: 'GET', headers: { origin: 'http://evil.example.com' } };
  let nextCalled = false;
  stateMutationGuard(req, {}, () => { nextCalled = true; });
  assert.ok(nextCalled);
});

test('allows loopback origins on any port', () => {
  for (const origin of ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3199', 'https://[::1]:8443', 'http://127.0.0.1:3001/path']) {
    const { nextCalled } = runGuard(origin);
    assert.ok(nextCalled, `expected loopback origin to pass: ${origin}`);
  }
});

test('allows missing origin (Electron debug) but rejects null origin (file:// untrusted)', () => {
  assert.ok(runGuard(undefined).nextCalled);
  assert.equal(runGuard('null').nextCalled, false);
  assert.equal(runGuard('null').status, 403);
});

test('rejects foreign origins with 403', () => {
  for (const origin of ['http://evil.example.com', 'http://localhost.evil.com', 'https://127.0.0.1.evil.com:3000', 'file:///etc/passwd']) {
    const { status, nextCalled } = runGuard(origin);
    assert.equal(nextCalled, false, `expected rejection: ${origin}`);
    assert.equal(status, 403);
  }
});

test('securityHeaders allows blob/HTTPS/local connect-src and blob worker-src in CSP', () => {
  const headers = {};
  let nextCalled = false;
  securityHeaders({}, {
    setHeader(name, value) { headers[name] = value; },
  }, () => { nextCalled = true; });

  assert.ok(nextCalled);
  const csp = headers['Content-Security-Policy'] || '';
  assert.match(csp, /connect-src[^;]*'self'/);
  assert.match(csp, /connect-src[^;]*blob:/);
  assert.match(csp, /connect-src[^;]*https:/);
  assert.match(csp, /connect-src[^;]*http:\/\/127\.0\.0\.1:\*/);
  assert.match(csp, /connect-src[^;]*http:\/\/localhost:\*/);
  assert.match(csp, /worker-src[^;]*'self'[^;]*blob:/);
});
