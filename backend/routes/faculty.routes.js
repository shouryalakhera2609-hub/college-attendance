const r = require('express').Router(), FA = require('../models/FacultyAssignment'), En = require('../models/Enrollment'), S = require('../models/AttendanceSession'), CR = require('../models/CorrectionRequest');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), { ah, fail, oid } = require('../utils/helpers');
r.use(authenticate, authorize('faculty'));
const asg = req => FA.find({ faculty: req.user._id }).populate('subject', 'code name').populate('section', 'name');
r.get('/assignments', ah(async (req, res) => res.json({ success: true, data: await asg(req) })));
r.get('/dashboard', ah(async (req, res) => {
  const a = await asg(req), recent = await S.find({ faculty: req.user._id }).sort('-date').limit(6).populate('subject', 'code name').populate('section', 'name');
  res.json({ success: true, data: { subjects: new Set(a.map(x => String(x.subject._id))).size, sections: new Set(a.map(x => String(x.section._id))).size, sessions: await S.countDocuments({ faculty: req.user._id, status: 'submitted' }), pending: await CR.countDocuments({ faculty: req.user._id, status: 'pending' }), recent } });
}));
r.get('/sections/:sectionId/students', ah(async (req, res) => {
  const section = oid(req.params.sectionId), term = req.query.term ? String(req.query.term) : null;
  if (!await FA.exists({ faculty: req.user._id, section, ...(term && { term }) })) throw fail(403, 'Not assigned to this section');
  const en = await En.find({ section, ...(term && { term }) }).populate('student', 'name rollNo instId');
  res.json({ success: true, data: en.map(e => e.student).filter(Boolean) });
}));
r.get('/sessions', ah(async (req, res) => res.json({ success: true, data: await S.find({ faculty: req.user._id }).sort('-date').limit(100).populate('subject', 'code name').populate('section', 'name') })));
r.get('/correction-requests', ah(async (req, res) => res.json({ success: true, data: await CR.find({ faculty: req.user._id }).sort('-createdAt').limit(100).populate('subject', 'code name').populate('student', 'name rollNo') })));
module.exports = r;
