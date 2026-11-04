const mongoose = require('mongoose'), { z } = require('zod'), AuditLog = require('../models/AuditLog');
exports.ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
exports.fail = (status, message) => Object.assign(new Error(message), { status });
exports.oid = v => { if (!mongoose.isValidObjectId(v)) throw exports.fail(400, 'Invalid id'); return new mongoose.Types.ObjectId(String(v)); };
exports.zid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
exports.audit = (req, action, entity, entityId, before, after) => AuditLog.create({ actor: req.user && req.user._id, action, entity, entityId, before, after, ip: req.ip }).catch(() => {});
exports.dateIsFuture = (date, timezoneOffsetMinutes) => {
  const nowInLocalTime = new Date(Date.now() - timezoneOffsetMinutes * 60_000);
  const today = `${nowInLocalTime.getUTCFullYear()}-${String(nowInLocalTime.getUTCMonth() + 1).padStart(2, '0')}-${String(nowInLocalTime.getUTCDate()).padStart(2, '0')}`;
  return date > today;
};
// CSV escaping + spreadsheet formula-injection guard
exports.csvCell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
exports.pct = (p, a) => (p + a) ? Math.round(p / (p + a) * 1000) / 10 : null;
