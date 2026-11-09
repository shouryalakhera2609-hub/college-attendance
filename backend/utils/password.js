const { z } = require('zod');

exports.passwordSchema = z.string().length(6, 'Password must be exactly 6 characters.');
