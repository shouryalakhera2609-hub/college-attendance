const AR = require('../models/AttendanceRecord'), { oid, fail, pct } = require('../utils/helpers'), { cnt, threshold } = require('./attendance.service');
// Scope is enforced here from the authenticated user; client filters can only narrow it.
exports.match = (u, q) => {
  const m = {};
  if (q.from || q.to) { m.date = {}; if (q.from) m.date.$gte = new Date(q.from + 'T00:00:00Z'); if (q.to) m.date.$lte = new Date(q.to + 'T00:00:00Z'); }
  for (const k of ['term', 'status']) if (q[k]) m[k] = q[k];
  for (const k of ['department', 'semester', 'section', 'subject', 'faculty', 'student']) if (q[k]) m[k] = oid(q[k]);
  if (u.role === 'student') m.student = u._id;
  else if (u.role === 'faculty') m.faculty = u._id;
  else if (u.role === 'hod') { if (!u.department) throw fail(403, 'No department assigned'); m.department = u.department; }
  return m;
};
exports.run = async (u, q) => {
  const rows = await AR.aggregate([{ $match: exports.match(u, q) }, { $group: { _id: { student: '$student', subject: '$subject' }, present: cnt('present'), absent: cnt('absent'), excused: cnt('excused') } },
    { $lookup: { from: 'users', localField: '_id.student', foreignField: '_id', as: 'u' } }, { $lookup: { from: 'subjects', localField: '_id.subject', foreignField: '_id', as: 's' } }, { $unwind: '$u' }, { $unwind: '$s' },
    { $project: { _id: 0, student: '$u.name', rollNo: '$u.rollNo', subject: '$s.code', present: 1, absent: 1, excused: 1 } }, { $sort: { rollNo: 1, subject: 1 } }, { $limit: 5000 }]);
  const th = await threshold();
  return { threshold: th, rows: rows.map(r => { const p = pct(r.present, r.absent); return { ...r, total: r.present + r.absent, percentage: p, low: p !== null && p < th }; }).filter(r => q.low !== '1' || r.low) };
};
