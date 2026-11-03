const r = require('express').Router(), { z } = require('zod'), AR = require('../models/AttendanceRecord'), CR = require('../models/CorrectionRequest'), U = require('../models/User'), En = require('../models/Enrollment');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), validate = require('../middleware/validate');
const { ah, fail, zid, oid, audit } = require('../utils/helpers'), svc = require('../services/attendance.service');
r.use(authenticate, authorize('student'));
r.get('/attendance', ah(async (req, res) => res.json({ success: true, data: await svc.summary({ student: req.user._id }) })));
r.get('/dashboard', ah(async (req, res) => {
  const s = await svc.summary({ student: req.user._id });
  s.recent = await AR.find({ student: req.user._id }).sort('-date').limit(6).populate('subject', 'code name').populate('session', 'period').select('date status subject session');
  res.json({ success: true, data: s });
}));
const hq = z.object({ subject: zid.optional(), status: z.enum(['present', 'absent', 'excused']).optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) });
r.get('/attendance/history', validate(hq, 'query'), ah(async (req, res) => {
  const q = req.validated, m = { student: req.user._id }, lim = 10;
  if (q.subject) m.subject = oid(q.subject); if (q.status) m.status = q.status;
  if (q.from || q.to) { m.date = {}; if (q.from) m.date.$gte = new Date(q.from + 'T00:00:00Z'); if (q.to) m.date.$lte = new Date(q.to + 'T00:00:00Z'); }
  const [rows, total] = await Promise.all([AR.find(m).sort('-date').skip((q.page - 1) * lim).limit(lim).populate('subject', 'code name').populate('session', 'period').select('date status subject session'), AR.countDocuments(m)]);
  res.json({ success: true, data: { rows, total, page: q.page, pages: Math.ceil(total / lim) } });
}));
const cr = z.object({ record: zid, requestedStatus: z.enum(['present', 'absent']), reason: z.string().trim().min(10).max(500) }).strict();
r.post('/correction-requests', validate(cr), ah(async (req, res) => {
  const rec = await AR.findOne({ _id: oid(req.body.record), student: req.user._id }); // ownership check
  if (!rec) throw fail(404, 'Attendance record not found');
  if (rec.status === req.body.requestedStatus) throw fail(422, 'Requested status is the same as the current status');
  const d = await CR.create({ record: rec._id, session: rec.session, student: rec.student, faculty: rec.faculty, department: rec.department, subject: rec.subject, date: rec.date, currentStatus: rec.status, requestedStatus: req.body.requestedStatus, reason: req.body.reason });
  audit(req, 'correction.request', 'CorrectionRequest', d._id, null, { record: rec._id });
  res.status(201).json({ success: true, data: d });
}));
r.get('/correction-requests', ah(async (req, res) => res.json({ success: true, data: await CR.find({ student: req.user._id }).sort('-createdAt').limit(100).populate('subject', 'code name') })));
r.get('/profile', ah(async (req, res) => {
  const u = await U.findById(req.user._id).populate('department', 'name code').populate('semester', 'name number'), en = await En.findOne({ student: u._id }).sort('-createdAt').populate({ path: 'section', populate: { path: 'semester', select: 'name number' } });
  res.json({ success: true, data: { user: u.toSafe(), department: u.department, section: en && en.section && en.section.name, semester: en && en.section && en.section.semester && en.section.semester.name || u.semester?.name, term: en && en.term } });
}));
module.exports = r;
