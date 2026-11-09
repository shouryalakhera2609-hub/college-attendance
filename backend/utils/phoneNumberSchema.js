const { z } = require('zod');

exports.phoneNumberSchema = z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits.');
