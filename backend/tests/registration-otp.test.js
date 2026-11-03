const test = require('node:test');
const assert = require('node:assert/strict');
const { createOtp, hashOtp, matchesOtp } = require('../utils/registrationOtp');

test('registration OTP is six digits', () => {
  assert.match(createOtp(), /^\d{6}$/);
});

test('registration OTP hash only verifies for the matching email and code', () => {
  const secret = 'test-secret-with-enough-entropy';
  const hash = hashOtp('student@example.com', '012345', secret);
  assert.equal(matchesOtp('student@example.com', '012345', hash, secret), true);
  assert.equal(matchesOtp('student@example.com', '012346', hash, secret), false);
  assert.equal(matchesOtp('other@example.com', '012345', hash, secret), false);
});
