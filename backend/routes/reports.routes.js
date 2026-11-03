const r = require('express').Router(), { z } = require('zod'), Subject = require('../models/Subject'), FA = require('../models/FacultyAssignment');
const { authenticate } = require('../middleware/authenticate'), validate = require('../middleware/validate'), { ah, zid, csvCell, audit } = require('../utils/helpers'), rep = require('../services/report.service');
r.use(authenticate);
const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const q = z.object({ from: d.optional(), to: d.optional(), term: z.string().max(20).optional(), status: z.enum(['present', 'absent', 'excused']).optional(), department: zid.optional(), semester: zid.optional(), section: zid.optional(), subject: zid.optional(), faculty: zid.optional(), student: zid.optional(), low: z.enum(['0', '1']).optional() });
r.get('/filters', ah(async (req, res) => {
  const u = req.user; let m = {};
  if (u.role === 'hod') m = { department: u.department };
  else if (u.role === 'faculty') m = { _id: { $in: (await FA.find({ faculty: u._id }).distinct('subject')) } };
  else if (u.role === 'student') return res.json({ success: true, data: { subjects: [] } });
  res.json({ success: true, data: { subjects: await Subject.find(m).select('code name').sort('code') } });
}));
r.get('/attendance', validate(q, 'query'), ah(async (req, res) => res.json({ success: true, data: await rep.run(req.user, req.validated) })));
r.get('/attendance/export.csv', validate(q, 'query'), ah(async (req, res) => {
  const { rows } = await rep.run(req.user, req.validated);
  const head = ['Student', 'Roll No', 'Subject', 'Present', 'Absent', 'Excused', 'Total', 'Percentage'];
  const csv = [head, ...rows.map(x => [x.student, x.rollNo, x.subject, x.present, x.absent, x.excused, x.total, x.percentage])].map(l => l.map(csvCell).join(',')).join('\r\n');
  audit(req, 'report.export', 'Report', null, null, { rows: rows.length });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="attendance-report.csv"', 'Cache-Control': 'no-store' }).send(csv);
}));
module.exports = r;
