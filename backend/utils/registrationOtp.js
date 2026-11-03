const crypto = require('node:crypto');

exports.createOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
exports.hashOtp = (email, otp, secret) => crypto.createHmac('sha256', secret).update(`${email}:${otp}`).digest('hex');
exports.matchesOtp = (email, otp, hash, secret) => {
  const expected = Buffer.from(exports.hashOtp(email, otp, secret), 'hex');
  const actual = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
exports.expiryDate = () => {
  const configured = process.env.OTP_EXPIRY_MINUTES || '10';
  const minutes = Number(configured);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30) {
    throw new Error('OTP_EXPIRY_MINUTES must be an integer from 1 to 30.');
  }
  return new Date(Date.now() + minutes * 60_000);
};
