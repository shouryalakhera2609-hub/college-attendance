const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordSchema } = require('../utils/password');

test('new passwords must contain exactly six characters', () => {
  assert.equal(passwordSchema.safeParse('abc12').success, false);
  assert.equal(passwordSchema.safeParse('abc123').success, true);
  assert.equal(passwordSchema.safeParse('abc1234').success, false);
});
