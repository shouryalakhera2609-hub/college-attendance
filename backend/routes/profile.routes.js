const r = require('express').Router(), bcrypt = require('bcrypt'), { z } = require('zod'), User = require('../models/User');
const { authenticate, clearSession } = require('../middleware/authenticate'), validate = require('../middleware/validate'), { ah, fail, audit } = require('../utils/helpers');
const { passwordSchema } = require('../utils/password');
const { phoneNumberSchema } = require('../utils/phoneNumberSchema');
const Department = require('../models/Department');
const Section = require('../models/Section');
const Semester = require('../models/Semester');
const Enrollment = require('../models/Enrollment');
const { branchMatches } = require('../utils/uploadedSubjects');
r.use(authenticate);
r.get('/', ah(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('department', 'name code')
    .populate('semester', 'name number');
  const enrollment = user.role === 'student'
    ? await Enrollment.findOne({ student: user._id }).sort('-createdAt')
      .populate({ path: 'section', populate: [{ path: 'department', select: 'name code' }, { path: 'semester', select: 'name number' }] })
    : null;
  res.json({ success: true, data: {
    ...user.toSafe(),
    department: user.department,
    semester: enrollment?.section?.semester || user.semester,
    section: enrollment?.section || null
  } });
}));
const editableProfile = z.object({
  name: z.string().trim().min(1).max(100),
  instId: z.union([z.string().trim().min(1).max(30), z.literal('')]).optional(),
  rollNo: z.string().trim().min(1).max(30).optional(),
  phone: z.union([phoneNumberSchema, z.literal('')]).optional(),
  campus: z.enum(['BIRT', 'BIRTS', 'BIST']),
  department: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid department'),
  branch: z.string().trim().min(1).max(40).optional(),
  attendanceSection: z.enum(['Birt', 'Birts']).optional(),
  semester: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid semester').optional(),
  section: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid class').optional()
}).strict();
const studentProfileFields = z.object({
  rollNo: z.string().trim().min(1).max(30),
  branch: z.string().trim().min(1).max(40),
  attendanceSection: z.enum(['Birt', 'Birts']).optional(),
  semester: z.string().regex(/^[a-f\d]{24}$/i),
  section: z.string().regex(/^[a-f\d]{24}$/i)
});
r.patch('/', validate(editableProfile), ah(async (req, res) => {
  if (!['student', 'faculty', 'hod'].includes(req.user.role)) throw fail(403, 'Profile editing is not available for this account.');
  const data = req.body;
  const student = req.user.role === 'student';
  if (student && !studentProfileFields.safeParse(data).success) {
    throw fail(400, 'Provide a roll number, branch, semester, and class.');
  }
  if (!student && (!data.instId || !data.instId.trim())) throw fail(400, 'Employee ID is required.');
  if (student && ['BIRT', 'BIRTS'].includes(data.campus) && !data.attendanceSection) {
    throw fail(400, 'Select an attendance section.');
  }
  if (student && data.campus === 'BIST' && data.attendanceSection) {
    throw fail(400, 'Attendance section is not required for this college.');
  }
  if (data.instId) {
    const duplicate = await User.exists({ instId: data.instId.trim().toLowerCase(), _id: { $ne: req.user._id } });
    if (duplicate) throw fail(409, 'This institution ID is already in use.');
  }
  if (!await Department.exists({ _id: data.department }) ||
      !await Section.exists({ campus: data.campus, department: data.department })) {
    throw fail(400, 'Select a department uploaded for the selected college.');
  }
  let selectedClass;
  if (student) {
    const semester = await Semester.exists({ _id: data.semester });
    if (!semester) throw fail(400, 'Select a valid semester.');
    const sections = await Section.find({ campus: data.campus, department: data.department })
      .select('branch')
      .lean();
    if (!sections.some(section => section.branch && branchMatches(section.branch, data.branch))) {
      throw fail(400, 'Select a branch uploaded for the selected college and department.');
    }
    selectedClass = await Section.findOne({
      _id: data.section,
      campus: data.campus,
      department: data.department,
      semester: data.semester
    }).select('_id branch').lean();
    if (!selectedClass || (selectedClass.branch && !branchMatches(selectedClass.branch, data.branch))) {
      throw fail(400, 'Select a class matching the selected college, department, semester, and branch.');
    }
  }

  const session = await User.startSession();
  let updated;
  let before;
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.user._id).session(session);
      before = {
        name: user.name, instId: user.instId, rollNo: user.rollNo, phone: user.phone,
        campus: user.campus, department: user.department, branch: user.branch,
        attendanceSection: user.attendanceSection, semester: user.semester
      };
      user.name = data.name;
      user.instId = data.instId?.trim() || undefined;
      user.phone = data.phone?.trim() || undefined;
      user.campus = data.campus;
      user.department = data.department;
      if (student) {
        user.rollNo = data.rollNo;
        user.branch = data.branch;
        user.attendanceSection = data.attendanceSection;
        user.semester = data.semester;
        const enrollment = await Enrollment.findOne({ student: user._id }).sort('-createdAt').session(session);
        const now = new Date();
        const term = enrollment?.term || `${now.getFullYear()}-${now.getMonth() >= 6 ? 'ODD' : 'EVEN'}`;
        await Enrollment.findOneAndUpdate(
          { student: user._id, term },
          { $set: { section: selectedClass._id } },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }
        );
      }
      await user.save({ session });
      updated = user;
    });
  } finally {
    await session.endSession();
  }
  audit(req, `${req.user.role}.profile.update`, 'User', updated._id, before, {
    name: updated.name, instId: updated.instId, rollNo: updated.rollNo, phone: updated.phone,
    campus: updated.campus, department: updated.department, branch: updated.branch,
    attendanceSection: updated.attendanceSection, semester: updated.semester
  });
  await updated.populate([{ path: 'department', select: 'name code' }, { path: 'semester', select: 'name number' }]);
  const enrollment = student
    ? await Enrollment.findOne({ student: updated._id }).sort('-createdAt')
      .populate({ path: 'section', populate: [{ path: 'department', select: 'name code' }, { path: 'semester', select: 'name number' }] })
    : null;
  res.json({ success: true, data: {
    ...updated.toSafe(),
    department: updated.department,
    semester: enrollment?.section?.semester || updated.semester,
    section: enrollment?.section || null
  } });
}));
const pw = z.object({ current: z.string().min(1).max(128), next: passwordSchema }).strict();
r.patch('/password', validate(pw), ah(async (req, res) => {
  const u = await User.findById(req.user._id).select('+passwordHash');
  if (!await bcrypt.compare(req.body.current, u.passwordHash)) throw fail(400, 'Current password is incorrect');
  u.passwordHash = await bcrypt.hash(req.body.next, 12); u.tokenVersion += 1; await u.save();
  audit(req, 'password.change', 'User', u._id); clearSession(res);
  res.json({ success: true, message: 'Password changed. Please sign in again.' });
}));
module.exports = r;
