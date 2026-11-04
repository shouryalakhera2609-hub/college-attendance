const r = require('express').Router(), { z } = require('zod'), FA = require('../models/FacultyAssignment'), En = require('../models/Enrollment'), S = require('../models/AttendanceSession'), AR = require('../models/AttendanceRecord');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), validate = require('../middleware/validate'), { ah, fail, zid, oid, audit, dateIsFuture } = require('../utils/helpers');
r.use(authenticate);
const create = z.object({ subject: zid, section: zid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timezoneOffsetMinutes: z.number().int().min(-840).max(840), period: z.number().int().min(1).max(12), term: z.string().trim().min(3).max(20) }).strict();
r.post('/sessions', authorize('faculty'), validate(create), ah(async (req, res) => {
  const b = req.body, a = await FA.findOne({ faculty: req.user._id, subject: b.subject, section: b.section, term: b.term }).populate('subject', 'department semester');
  if (!a) throw fail(403, 'You are not assigned to this subject and section');
  const date = new Date(b.date + 'T00:00:00Z');
  if (isNaN(date) || dateIsFuture(b.date, b.timezoneOffsetMinutes)) throw fail(422, 'Attendance cannot be marked for a future date');
  const key = { subject: b.subject, section: b.section, date, period: b.period, term: b.term };
  let s = await S.findOne(key);
  if (s && (String(s.faculty) !== String(req.user._id) || s.status !== 'open')) throw fail(409, 'Attendance for this class and lecture is already recorded');
  if (!s) { s = await S.create({ ...key, faculty: req.user._id, department: a.subject.department, semester: a.subject.semester }); audit(req, 'session.create', 'AttendanceSession', s._id, null, key); }
  const en = await En.find({ section: b.section, term: b.term }).populate({ path: 'student', match: { active: true }, select: 'name rollNo instId' });
  res.status(201).json({ success: true, data: { session: s, students: en.map(e => e.student).filter(Boolean) } });
}));
const rec = z.object({ records: z.array(z.object({ student: zid, status: z.enum(['present', 'absent', 'excused']) }).strict()).min(1).max(500) }).strict();
r.post('/sessions/:id/records', authorize('faculty'), validate(rec), ah(async (req, res) => {
  // Atomic claim: only an open session owned by this faculty can be submitted, exactly once.
  const s = await S.findOneAndUpdate({ _id: oid(req.params.id), faculty: req.user._id, status: 'open' }, { status: 'submitted', submittedAt: new Date() });
  if (!s) throw fail(409, 'Session not found, not yours, or already submitted');
  try {
    const want = new Set((await En.find({ section: s.section, term: s.term }).select('student')).map(e => String(e.student))), got = req.body.records.map(x => x.student);
    if (got.length !== want.size || new Set(got).size !== got.length || !got.every(x => want.has(x))) throw fail(422, 'Submission must include every enrolled student exactly once');
    await AR.insertMany(req.body.records.map(x => ({ session: s._id, student: x.student, status: x.status, subject: s.subject, section: s.section, department: s.department, semester: s.semester, faculty: s.faculty, term: s.term, date: s.date })));
  } catch (e) { await AR.deleteMany({ session: s._id }); await S.updateOne({ _id: s._id }, { status: 'open', $unset: { submittedAt: 1 } }); throw e; }
  audit(req, 'attendance.submit', 'AttendanceSession', s._id, null, { count: req.body.records.length });
  res.json({ success: true, message: 'Attendance saved' });
}));
r.get('/sessions/:id', authorize('faculty', 'hod', 'admin'), ah(async (req, res) => {
  const s = await S.findById(oid(req.params.id)).populate('subject', 'code name').populate('section', 'name').populate('faculty', 'name'), u = req.user;
  if (!s) throw fail(404, 'Not found');
  if ((u.role === 'faculty' && String(s.faculty._id) !== String(u._id)) || (u.role === 'hod' && String(s.department) !== String(u.department))) throw fail(403, 'Forbidden');
  res.json({ success: true, data: { session: s, records: await AR.find({ session: s._id }).populate('student', 'name rollNo') } });
}));
module.exports = r;
