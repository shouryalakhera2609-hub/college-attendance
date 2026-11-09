const r = require('express').Router(), bcrypt = require('bcrypt'), crypto = require('node:crypto'), rateLimit = require('express-rate-limit'), { z } = require('zod');
const User = require('../models/User'), { authenticate, setSession, clearSession } = require('../middleware/authenticate');
const validate = require('../middleware/validate'), { ah, fail, audit } = require('../utils/helpers');
const RegistrationOtp = require('../models/RegistrationOtp');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const Department = require('../models/Department');
const Semester = require('../models/Semester');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const { createOtp, hashOtp, matchesOtp, expiryDate } = require('../utils/registrationOtp');
const { sendRegistrationOtp } = require('../services/email.service');
const { branchMatches } = require('../utils/uploadedSubjects');
const uniqueUploadedDepartments = require('../utils/registrationDepartments');
const uniqueUploadedBranches = require('../utils/registrationBranches');
const { passwordSchema } = require('../utils/password');
const { phoneNumberSchema } = require('../utils/phoneNumberSchema');
const DUMMY = bcrypt.hashSync('timing-equalizer', 12);
const limiter = rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many attempts. Try again later.' } });
const registrationLimiter = rateLimit({ windowMs: 15 * 60000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many registration attempts. Try again later.' } });
const verificationLimiter = rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many verification attempts. Try again later.' } });
const passwordResetRequestLimiter = rateLimit({ windowMs: 15 * 60000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many password reset requests. Try again later.' } });
const schema = z.object({
  identifier: z.string().trim().min(3).max(100),
  password: z.string().min(1).max(128),
  campus: z.enum(['BIRT', 'BIRTS', 'BIST']).optional()
}).strict();
const emailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
const passwordResetRequestSchema = z.object({ identifier: z.string().trim().min(3).max(100) }).strict();
const registrationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  phone: phoneNumberSchema,
  instId: z.string().trim().min(1).max(30).optional(),
  rollNo: z.string().trim().min(1).max(30),
  branch: z.string().trim().min(1).max(40),
  campus: z.enum(['BIRT', 'BIRTS', 'BIST']),
  attendanceSection: z.enum(['Birt', 'Birts']).optional(),
  department: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid department'),
  semester: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid semester'),
  section: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid class')
}).strict().superRefine((data, ctx) => {
  if (['BIRT', 'BIRTS'].includes(data.campus) && !data.attendanceSection) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attendanceSection'], message: 'Select an attendance section.' });
  }
  if (data.campus === 'BIST' && data.attendanceSection) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attendanceSection'], message: 'Attendance section is not required for this college.' });
  }
});
const otpSchema = emailSchema.extend({ otp: z.string().regex(/^\d{6}$/, 'Enter the six-digit verification code') }).strict();
const passwordResetSchema = z.object({
  identifier: z.string().trim().min(3).max(100),
  otp: z.string().regex(/^\d{6}$/, 'Enter the six-digit verification code'),
  password: passwordSchema,
  confirmPassword: passwordSchema
}).strict().refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});
const staffRegistrationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  instId: z.string().trim().min(1).max(30),
  department: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid department'),
  campus: z.enum(['BIRT', 'BIRTS', 'BIST']),
  phone: phoneNumberSchema,
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  confirmPassword: passwordSchema
}).strict().refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});
const RESEND_DELAY_MS = 60_000;

r.get('/register/options', ah(async (req, res) => {
  const campus = req.query.campus;
  if (campus && !['BIRT', 'BIRTS', 'BIST'].includes(campus)) throw fail(400, 'Select a valid college.');
  const [sections, semesters] = await Promise.all([
    campus
      ? Section.find({ campus }).select('department').populate('department', 'name code').lean()
      : Promise.resolve([]),
    Semester.find().select('name number').sort('number').lean()
  ]);
  const departments = uniqueUploadedDepartments(sections);
  res.json({ success: true, data: { departments, semesters } });
}));
r.get('/register/branches', ah(async (req, res) => {
  const query = z.object({
    campus: z.enum(['BIRT', 'BIRTS', 'BIST']),
    department: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid department')
  }).safeParse(req.query);
  if (!query.success) throw fail(400, 'Select a valid college and department.');
  const sections = await Section.find({ campus: query.data.campus, department: query.data.department })
    .select('branch')
    .lean();
  res.json({ success: true, data: uniqueUploadedBranches(sections) });
}));
r.get('/register/classes', ah(async (req, res) => {
  const query = z.object({
    campus: z.enum(['BIRT', 'BIRTS', 'BIST']),
    department: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid department'),
    semester: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid semester'),
    branch: z.string().trim().min(1).max(40)
  }).safeParse(req.query);
  if (!query.success) throw fail(400, 'Select a valid college, department, semester, and branch.');
  const sections = await Section.find({
    campus: query.data.campus,
    department: query.data.department,
    semester: query.data.semester
  })
    .select('name branch')
    .sort('name')
    .lean();
  const classes = sections.filter(section => !section.branch || branchMatches(section.branch, query.data.branch));
  res.json({ success: true, data: classes });
}));

async function deliverRegistrationOtp(challenge) {
  if (Date.now() - challenge.lastSentAt.getTime() < RESEND_DELAY_MS) throw fail(429, 'Wait one minute before requesting another code.');
  const otp = createOtp();
  challenge.otpHash = hashOtp(challenge.email, otp, process.env.JWT_SECRET);
  challenge.expiresAt = expiryDate();
  challenge.attempts = 0;
  challenge.lastSentAt = new Date();
  await challenge.save();
  try {
    await sendRegistrationOtp(challenge.email, challenge.name, otp, Number(process.env.OTP_EXPIRY_MINUTES || 10));
  } catch (error) {
    await RegistrationOtp.deleteOne({ _id: challenge._id });
    console.error('Registration OTP email delivery failed:', error.message);
    throw fail(503, 'Could not send the verification email. Please try again later.');
  }
}

r.post('/register/request-otp', registrationLimiter, validate(registrationSchema), ah(async (req, res) => {
  const { name, email, password, phone, instId, rollNo, branch, campus, attendanceSection, department, semester, section } = req.body;
  if (await User.exists({ $or: [{ email }, ...(instId ? [{ instId }] : [])] })) throw fail(409, 'An account with this email or institution ID already exists.');
  if (!await Section.exists({ campus, department, branch: { $regex: `^${branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })) {
    throw fail(400, 'Select a branch uploaded for the selected college and department.');
  }
  const selectedClass = await Section.findOne({ _id: section, campus, department, semester }).select('_id branch').lean();
  if (!selectedClass || (selectedClass.branch && !branchMatches(selectedClass.branch, branch))) {
    throw fail(400, 'Choose a class matching the selected college, department, semester, and branch.');
  }
  const currentDate = new Date();
  const term = `${currentDate.getFullYear()}-${currentDate.getMonth() >= 6 ? 'ODD' : 'EVEN'}`;
  let challenge = await RegistrationOtp.findOne({ email });
  if (challenge && Date.now() - challenge.lastSentAt.getTime() < RESEND_DELAY_MS) throw fail(429, 'Wait one minute before requesting another code.');
  const now = new Date();
  const otp = createOtp();
  const challengeData = {
    name,
    email,
    phone,
    instId,
    rollNo,
    department,
    branch,
    campus,
    attendanceSection,
    role: 'student',
    semester,
    section: selectedClass._id,
    term,
    passwordHash: await bcrypt.hash(password, 12),
    otpHash: hashOtp(email, otp, process.env.JWT_SECRET),
    expiresAt: expiryDate(),
    attempts: 0,
    lastSentAt: now
  };
  challenge = await RegistrationOtp.findOneAndUpdate({ email }, challengeData, { upsert: true, new: true, runValidators: true });
  try {
    await sendRegistrationOtp(email, name, otp, Number(process.env.OTP_EXPIRY_MINUTES || 10));
  } catch (error) {
    await RegistrationOtp.deleteOne({ _id: challenge._id });
    console.error('Registration OTP email delivery failed:', error.message);
    throw fail(503, 'Could not send the verification email. Please try again later.');
  }
  res.json({ success: true, message: 'A verification code has been sent to your email.' });
}));

r.post('/register/resend-otp', registrationLimiter, validate(emailSchema), ah(async (req, res) => {
  const challenge = await RegistrationOtp.findOne({ email: req.body.email });
  if (!challenge || challenge.expiresAt <= new Date()) throw fail(400, 'Registration request expired. Start again.');
  await deliverRegistrationOtp(challenge);
  res.json({ success: true, data: { message: 'A new verification code has been sent to your email.' } });
}));

r.post('/register/verify-otp', verificationLimiter, validate(otpSchema), ah(async (req, res) => {
  const challenge = await RegistrationOtp.findOne({ email: req.body.email }).select('+passwordHash');
  if (!challenge || challenge.expiresAt <= new Date()) {
    if (challenge) await RegistrationOtp.deleteOne({ _id: challenge._id });
    throw fail(400, 'Registration request expired. Start again.');
  }
  if (challenge.attempts >= 5) throw fail(429, 'Too many incorrect codes. Request a new code.');
  if (!matchesOtp(req.body.email, req.body.otp, challenge.otpHash, process.env.JWT_SECRET)) {
    await RegistrationOtp.updateOne({ _id: challenge._id, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } });
    throw fail(400, 'Invalid verification code.');
  }
  const user = await User.create({
    name: challenge.name,
    email: challenge.email,
    instId: challenge.instId,
    rollNo: challenge.rollNo,
    department: challenge.department,
    branch: challenge.branch,
    campus: challenge.campus,
    attendanceSection: challenge.attendanceSection,
    phone: challenge.phone,
    semester: challenge.semester,
    section: challenge.section,
    term: challenge.term,
    passwordHash: challenge.passwordHash,
    role: challenge.role || 'student'
  });
  if (challenge.section && challenge.term) {
    try {
      await Enrollment.create({ student: user._id, section: challenge.section, term: challenge.term });
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }
  }
  await RegistrationOtp.deleteOne({ _id: challenge._id });
  setSession(res, user);
  req.user = user;
  audit(req, `${user.role}.register`, 'User', user._id, null, { email: user.email, role: user.role });
  res.status(201).json({ success: true, data: user.toSafe() });
}));

const requestStaffRegistrationOtp = role => ah(async (req, res) => {
  const { name, instId, department, campus, phone, email, password } = req.body;
  if (await User.exists({ $or: [{ email }, { instId }] })) {
    throw fail(409, 'An account with this email or employee ID already exists.');
  }
  if (!await Department.exists({ _id: department }) ||
      !await Section.exists({ campus, department })) {
    throw fail(400, 'Select a department uploaded for the selected college.');
  }
  const existingChallenge = await RegistrationOtp.findOne({ email });
  if (existingChallenge && Date.now() - existingChallenge.lastSentAt.getTime() < RESEND_DELAY_MS) {
    throw fail(429, 'Wait one minute before requesting another code.');
  }
  const otp = createOtp();
  const now = new Date();
  const challengeData = {
    name,
    email,
    instId,
    phone,
    department,
    campus,
    role,
    passwordHash: await bcrypt.hash(password, 12),
    otpHash: hashOtp(email, otp, process.env.JWT_SECRET),
    expiresAt: expiryDate(),
    attempts: 0,
    lastSentAt: now
  };
  const challenge = await RegistrationOtp.findOneAndUpdate(
    { email },
    challengeData,
    { upsert: true, new: true, runValidators: true }
  );
  try {
    await sendRegistrationOtp(email, name, otp, Number(process.env.OTP_EXPIRY_MINUTES || 10));
  } catch (error) {
    await RegistrationOtp.deleteOne({ _id: challenge._id });
    console.error('Staff registration OTP email delivery failed:', error.message);
    throw fail(503, 'Could not send the verification email. Please try again later.');
  }
  res.json({ success: true, data: { message: 'A verification code has been sent to your email.' } });
});

r.post('/register/hod/request-otp', registrationLimiter, validate(staffRegistrationSchema), requestStaffRegistrationOtp('hod'));
r.post('/register/faculty/request-otp', registrationLimiter, validate(staffRegistrationSchema), requestStaffRegistrationOtp('faculty'));

r.post('/password/request-reset', passwordResetRequestLimiter, validate(passwordResetRequestSchema), ah(async (req, res) => {
  const identifier = req.body.identifier.toLowerCase();
  const user = await User.findOne({
    $or: [{ email: identifier }, { instId: identifier }]
  }).select('name email active').lean();
  if (!user) return res.json({
    success: true,
    data: { canReset: false, message: 'Your account has not been created. Please create an account first.' }
  });
  if (user.active === false) return res.json({
    success: true,
    data: { canReset: false, message: 'This account is inactive. Please contact your college administrator.' }
  });
  const email = user.email;
  const message = 'A password reset code has been sent to your registered email.';

  let challenge = await PasswordResetOtp.findOne({ email });
  if (challenge && Date.now() - challenge.lastSentAt.getTime() < RESEND_DELAY_MS) {
    return res.json({ success: true, data: { canReset: true, message } });
  }
  const otp = createOtp();
  const now = new Date();
  challenge = await PasswordResetOtp.findOneAndUpdate(
    { email },
    {
      email,
      otpHash: hashOtp(email, otp, process.env.JWT_SECRET),
      expiresAt: expiryDate(),
      attempts: 0,
      lastSentAt: now
    },
    { upsert: true, new: true, runValidators: true }
  );
  try {
    await sendPasswordResetOtp(email, user.name, otp, Number(process.env.OTP_EXPIRY_MINUTES || 10));
  } catch (error) {
    await PasswordResetOtp.deleteOne({ _id: challenge._id });
    console.error('Password reset OTP email delivery failed:', error.message);
    throw fail(503, 'Could not send the verification email. Please try again later.');
  }
  res.json({ success: true, data: { canReset: true, message } });
}));

r.post('/password/reset', verificationLimiter, validate(passwordResetSchema), ah(async (req, res) => {
  const { identifier, otp, password } = req.body;
  const user = await User.findOne({
    active: true,
    $or: [{ email: identifier.toLowerCase() }, { instId: identifier.toLowerCase() }]
  }).select('_id email');
  if (!user) throw fail(400, 'The verification code is invalid or expired. Request a new code.');
  const email = user.email;
  const challenge = await PasswordResetOtp.findOne({ email });
  if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
    throw fail(400, 'The verification code is invalid or expired. Request a new code.');
  }
  if (!matchesOtp(email, otp, challenge.otpHash, process.env.JWT_SECRET)) {
    await PasswordResetOtp.updateOne(
      { _id: challenge._id, attempts: { $lt: 5 } },
      { $inc: { attempts: 1 } }
    );
    throw fail(400, 'The verification code is invalid or expired. Request a new code.');
  }

  const consumed = await PasswordResetOtp.findOneAndDelete({
    _id: challenge._id,
    otpHash: challenge.otpHash,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: 5 }
  });
  if (!consumed) throw fail(400, 'The verification code is invalid or expired. Request a new code.');

  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id, active: true },
    {
      $set: { passwordHash: await bcrypt.hash(password, 12), failedLogins: 0 },
      $inc: { tokenVersion: 1 },
      $unset: { lockUntil: 1 }
    },
    { new: true }
  );
  if (!updatedUser) throw fail(400, 'The verification code is invalid or expired. Request a new code.');
  audit(req, 'password.reset', 'User', updatedUser._id);
  res.json({ success: true, data: { message: 'Password reset. Please sign in with your new password.' } });
}));

r.post('/login', limiter, validate(schema), ah(async (req, res) => {
  const id = req.body.identifier.toLowerCase();
  const u = await User.findOne({ $or: [{ email: id }, { instId: id }] }).select('+passwordHash');
  if (u && u.role === 'admin' && !req.body.campus) throw fail(400, 'Select a campus before signing in.');
  if (u && u.role === 'admin' && req.body.campus && u.campus && u.campus !== req.body.campus) {
    throw fail(401, 'Invalid credentials for the selected campus');
  }
  const ok = await bcrypt.compare(req.body.password, u ? u.passwordHash : DUMMY); // constant-time-ish: always hash
  if (u && u.lockUntil && u.lockUntil > new Date()) throw fail(423, 'Account temporarily locked. Try again in 15 minutes.');
  if (!u || !ok) {
    if (u) { u.failedLogins += 1; if (u.failedLogins >= 5) { u.lockUntil = new Date(Date.now() + 15 * 60000); u.failedLogins = 0; } await u.save(); }
    throw fail(401, 'Invalid credentials');
  }
  if (!u.active) {
    if (u.deactivationNotice) throw fail(403, u.deactivationNotice);
    throw fail(401, 'Invalid credentials');
  }
  if (u.role === 'admin' && !u.campus) u.campus = req.body.campus;
  u.failedLogins = 0; u.lockUntil = null; await u.save();
  setSession(res, u); req.user = u; audit(req, 'login', 'User', u._id);
  res.json({ success: true, data: u.toSafe() });
}));
r.post('/logout', authenticate, ah(async (req, res) => { req.user.tokenVersion += 1; await req.user.save(); clearSession(res); res.json({ success: true }); }));
r.get('/me', authenticate, ah(async (req, res) => { await req.user.populate('department', 'name code'); res.json({ success: true, data: req.user.toSafe() }); }));
module.exports = r;
