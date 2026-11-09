const test = require('node:test');
const assert = require('node:assert/strict');
const { csrf } = require('../middleware/authenticate');

test('password reset OTP endpoints are available before login without a CSRF cookie', () => {
  for (const path of ['/auth/password/request-reset', '/auth/password/reset']) {
    let continued = false;
    csrf(
      { method: 'POST', path, cookies: {}, get: () => undefined },
      { status: () => { throw new Error('Expected request to continue'); } },
      () => { continued = true; }
    );
    assert.equal(continued, true);
  }
});

test('other state-changing requests still require a matching CSRF token', () => {
  let responseStatus;
  let responseBody;
  csrf(
    { method: 'POST', path: '/profile/password', cookies: {}, get: () => undefined },
    {
      status(status) {
        responseStatus = status;
        return this;
      },
      json(body) {
        responseBody = body;
      }
    },
    () => assert.fail('Request should be rejected')
  );
  assert.equal(responseStatus, 403);
  assert.deepEqual(responseBody, { success: false, message: 'Invalid CSRF token' });
});
