const test = require('node:test');
const assert = require('node:assert/strict');
const { phoneNumberSchema } = require('../utils/phoneNumberSchema');

test('phone numbers must be exactly ten digits', () => {
  assert.equal(phoneNumberSchema.safeParse('1234567890').success, true);
  assert.equal(phoneNumberSchema.safeParse('123456789').success, false);
  assert.equal(phoneNumberSchema.safeParse('12345678901').success, false);
  assert.equal(phoneNumberSchema.safeParse('12345abc90').success, false);
});
