const mongoose = require('mongoose'), { z } = require('zod'), AuditLog = require('../models/AuditLog');
exports.ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
exports.fail = (status, message) => Object.assign(new Error(message), { status });
exports.oid = v => { if (!mongoose.isValidObjectId(v)) throw exports.fail(400, 'Invalid id'); return new mongoose.Types.ObjectId(String(v)); };
exports.zid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const compareStudentsByRollNo = (a, b) => {
  const rollA = String(a.rollNo || '').trim();
  const rollB = String(b.rollNo || '').trim();
  if (!rollA && rollB) return 1;
  if (rollA && !rollB) return -1;
  return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' })
    || String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
};
exports.sortStudentsByRollNo = students => [...students].sort(compareStudentsByRollNo);
exports.sortStudentsByAttendanceSection = students => [...students].sort((a, b) => {
  const sectionOrder = { Birt: 0, Birts: 1 };
  const sectionA = sectionOrder[a.attendanceSection] ?? 2;
  const sectionB = sectionOrder[b.attendanceSection] ?? 2;
  return sectionA - sectionB || compareStudentsByRollNo(a, b);
});
exports.audit = (req, action, entity, entityId, before, after) => AuditLog.create({ actor: req.user && req.user._id, action, entity, entityId, before, after, ip: req.ip }).catch(() => {});
exports.dateIsFuture = (date, timezoneOffsetMinutes) => {
  const nowInLocalTime = new Date(Date.now() - timezoneOffsetMinutes * 60_000);
  const today = `${nowInLocalTime.getUTCFullYear()}-${String(nowInLocalTime.getUTCMonth() + 1).padStart(2, '0')}-${String(nowInLocalTime.getUTCDate()).padStart(2, '0')}`;
  return date > today;
};
// CSV escaping + spreadsheet formula-injection guard
exports.csvCell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
exports.pct = (p, a) => (p + a) ? Math.round(p / (p + a) * 1000) / 10 : null;
