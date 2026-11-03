const r = require('express').Router(), bcrypt = require('bcrypt'), { z } = require('zod'), User = require('../models/User');
const { authenticate, clearSession } = require('../middleware/authenticate'), validate = require('../middleware/validate'), { ah, fail, audit } = require('../utils/helpers');
r.use(authenticate);
r.get('/', ah(async (req, res) => { await req.user.populate('department', 'name code'); res.json({ success: true, data: req.user.toSafe() }); }));
const studentProfile = z.object({
  name: z.string().trim().min(1).max(100),
  rollNo: z.string().trim().min(1).max(30),
  phone: z.union([z.string().trim().max(20), z.literal('')]).optional()
}).strict();
r.patch('/', validate(studentProfile), ah(async (req, res) => {
  if (req.user.role !== 'student') throw fail(403, 'Only students can edit their profile here.');
  const before = { name: req.user.name, rollNo: req.user.rollNo, phone: req.user.phone };
  req.user.name = req.body.name;
  req.user.rollNo = req.body.rollNo;
  req.user.phone = req.body.phone || undefined;
  await req.user.save();
  audit(req, 'student.profile.update', 'User', req.user._id, before, {
    name: req.user.name, rollNo: req.user.rollNo, phone: req.user.phone
  });
  res.json({ success: true, data: req.user.toSafe() });
}));
const pw = z.object({ current: z.string().min(1).max(128), next: z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/) }).strict();
r.patch('/password', validate(pw), ah(async (req, res) => {
  const u = await User.findById(req.user._id).select('+passwordHash');
  if (!await bcrypt.compare(req.body.current, u.passwordHash)) throw fail(400, 'Current password is incorrect');
  u.passwordHash = await bcrypt.hash(req.body.next, 12); u.tokenVersion += 1; await u.save();
  audit(req, 'password.change', 'User', u._id); clearSession(res);
  res.json({ success: true, message: 'Password changed. Please sign in again.' });
}));
module.exports = r;
