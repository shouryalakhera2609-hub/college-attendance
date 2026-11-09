const r = require('express').Router(), bcrypt = require('bcrypt'), { z } = require('zod');
const M = n => require('../models/' + n), U = M('User'), AR = M('AttendanceRecord'), AL = M('AuditLog'), Setting = M('Setting');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), validate = require('../middleware/validate'), { ah, fail, zid, oid, audit } = require('../utils/helpers'), svc = require('../services/attendance.service');
const excelRows = require('../utils/excel').excelRows;
const { planClassSync } = require('../utils/classSync');
const uniqueUploadedDepartments = require('../utils/registrationDepartments');
const { passwordSchema } = require('../utils/password');
const { settingKey: collegeHoursSettingKey, getCollegeAttendanceHours, timeToMinutes } = require('../utils/collegeAttendanceHours');
const ClassUpload = M('ClassUpload');
r.use(authenticate, authorize('admin'));
const classUploadKey = campus => `admin-classes-${campus}`;
async function getCampusDepartments(campus) {
  const sections = await M('Section').find({ campus }).select('department').populate('department', 'name code').lean();
  return uniqueUploadedDepartments(sections);
}
async function getCampusClassUpload(campus) {
  if (!campus) throw fail(400, 'Sign in with a selected college to manage classes.');
  let upload = await ClassUpload.findOne({ key: classUploadKey(campus) });
  if (upload) return upload;

  upload = await ClassUpload.findOne({ key: 'admin-classes' });
  if (upload) {
    await M('Section').updateMany({ _id: { $in: upload.sections } }, { $set: { campus } });
    upload.key = classUploadKey(campus);
    await upload.save();
    return upload;
  }

  const legacySections = await M('Section').find({ campus: { $exists: false } }).select('_id').lean();
  if (!legacySections.length) return null;
  await M('Section').updateMany({ _id: { $in: legacySections.map(section => section._id) } }, { $set: { campus } });
  return ClassUpload.create({
    key: classUploadKey(campus),
    fileName: 'Existing classes (previous upload)',
    legacy: true,
    sections: legacySections.map(section => section._id)
  });
}
async function deleteSectionsOnly(sectionIds, session) {
  await M('Section').deleteMany({ _id: { $in: sectionIds } }, { session });
  await ClassUpload.updateOne({ sections: { $in: sectionIds } }, { $pull: { sections: { $in: sectionIds } } }, { session });
}
r.get('/dashboard', ah(async (req, res) => {
  if (!req.user.campus) throw fail(400, 'Sign in with a selected college to view the dashboard.');
  const [students, faculty, departments, subjects, active, sum, recent] = await Promise.all([U.countDocuments({ role: 'student' }), U.countDocuments({ role: 'hod', campus: req.user.campus, active: true }), getCampusDepartments(req.user.campus).then(list => list.length), M('Subject').countDocuments(), U.countDocuments({ active: true }), svc.summary({}), AL.find().sort('-createdAt').limit(8).populate('actor', 'name')]);
  res.json({ success: true, data: { students, faculty, departments, subjects, active, threshold: sum.threshold, overall: sum.overall, subjectStats: sum.subjects, recent } });
}));
r.get('/active-hods', ah(async (req, res) => {
  if (!req.user.campus) throw fail(400, 'Sign in with a selected college to view active HODs.');
  const hods = await U.find({ role: 'hod', campus: req.user.campus, active: true })
    .select('name department campus')
    .populate('department', 'name')
    .sort({ name: 1 })
    .lean();
  const data = hods.map(hod => ({
    id: String(hod._id),
    name: hod.name,
    department: hod.department?.name || ''
  }));
  res.json({ success: true, data });
}));
r.delete('/active-hods/:id', ah(async (req, res) => {
  if (!req.user.campus) throw fail(400, 'Sign in with a selected college to manage HODs.');
  const hod = await U.findOne({
    _id: oid(req.params.id),
    role: 'hod',
    campus: req.user.campus,
    active: true
  });
  if (!hod) throw fail(404, 'Active HOD not found in your college.');
  const before = { role: hod.role, active: hod.active, campus: hod.campus, department: hod.department };
  await U.deleteOne({ _id: hod._id });
  audit(req, 'user.delete', 'User', hod._id, before, null);
  res.json({ success: true });
}));
const wrap = p => p ? [].concat(p) : [];
function crud(path, Model, sch, pop) {
  r.get(path, ah(async (req, res) => res.json({ success: true, data: await Model.find().sort('-createdAt').limit(500).populate(wrap(pop)) })));
  r.post(path, validate(sch), ah(async (req, res) => { const d = await Model.create(req.body); audit(req, 'create', Model.modelName, d._id, null, req.body); res.status(201).json({ success: true, data: d }); }));
  r.patch(path + '/:id', validate(sch.partial()), ah(async (req, res) => {
    const id = oid(req.params.id), b = await Model.findById(id); if (!b) throw fail(404, 'Not found');
    if (Model.modelName === 'Section' && (req.body.department || req.body.semester)) {
      const movesSection = (req.body.department && String(req.body.department) !== String(b.department))
        || (req.body.semester && String(req.body.semester) !== String(b.semester));
      if (movesSection) {
        const related = await Promise.all([M('FacultyAssignment').exists({ section: id }), M('Enrollment').exists({ section: id }), M('AttendanceSession').exists({ section: id }), M('AttendanceRecord').exists({ section: id })]);
        if (related.some(Boolean)) throw fail(409, 'Cannot change the department or semester of a class used by existing records.');
      }
    }
    const d = await Model.findByIdAndUpdate(id, req.body, { new: true, runValidators: true }); audit(req, 'update', Model.modelName, id, b, d); res.json({ success: true, data: d });
  }));
  r.delete(path + '/:id', ah(async (req, res) => {
    const id = oid(req.params.id), b = await Model.findById(id); if (!b) throw fail(404, 'Not found');
    if (Model.modelName === 'Section') {
      const session = await Model.startSession();
      try {
        await session.withTransaction(async () => {
          if (!await Model.exists({ _id: id }).session(session)) throw fail(404, 'Not found');
          await deleteSectionsOnly([id], session);
        });
      } finally {
        await session.endSession();
      }
    } else {
      const related = Model.modelName === 'Subject'
        ? await Promise.all([M('FacultyAssignment').exists({ subject: id }), M('AttendanceSession').exists({ subject: id }), M('AttendanceRecord').exists({ subject: id }), M('CorrectionRequest').exists({ subject: id })])
        : [];
      if (related.some(Boolean)) throw fail(409, `Cannot delete this ${Model.modelName.toLowerCase()} because it is used by existing records.`);
      await Model.findByIdAndDelete(id);
    }
    audit(req, 'delete', Model.modelName, id, b, null); res.json({ success: true });
  }));
}
const t = (n = 100) => z.string().trim().min(1).max(n);
crud('/departments', M('Department'), z.object({ name: t(), code: t(12) }).strict());
crud('/semesters', M('Semester'), z.object({ name: t(40), number: z.number().int().min(1).max(12) }).strict());
crud('/sections', M('Section'), z.object({ name: t(20), department: zid, semester: zid, branch: t(40).optional() }).strict(), ['department', 'semester']);
crud('/subjects', M('Subject'), z.object({ code: t(20), name: t(120), department: zid, semester: zid }).strict(), ['department', 'semester']);
crud('/assignments', M('FacultyAssignment'), z.object({ faculty: zid, subject: zid, section: zid, term: t(20) }).strict(), ['faculty', 'subject', 'section']);
crud('/enrollments', M('Enrollment'), z.object({ student: zid, section: zid, term: t(20) }).strict(), ['student', 'section']);
r.get('/classes/upload', ah(async (req, res) => {
  let upload = await getCampusClassUpload(req.user.campus);
  if (!upload) {
    const sections = await M('Section').find({ campus: req.user.campus }).select('_id').lean();
    if (sections.length) {
      await ClassUpload.findOneAndUpdate(
        { key: classUploadKey(req.user.campus) },
        { $setOnInsert: { fileName: 'Existing classes (previous upload)', legacy: true, sections: sections.map(section => section._id) } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }
  upload = await ClassUpload.findOne({ key: classUploadKey(req.user.campus) })
    .select('key fileName originalFile legacy sections createdAt updatedAt')
    .populate({ path: 'sections', populate: [{ path: 'department', select: 'name code' }, { path: 'semester', select: 'name number' }] })
    .lean();
  if (upload) {
    upload.hasOriginalFile = Boolean(upload.originalFile?.length);
    delete upload.originalFile;
  }
  res.json({ success: true, data: upload });
}));
r.get('/registration-departments', ah(async (req, res) => {
  if (!req.user.campus) throw fail(400, 'Sign in with a selected college to view departments.');
  res.json({ success: true, data: await getCampusDepartments(req.user.campus) });
}));
r.get('/classes/upload/original', ah(async (req, res) => {
  const upload = await ClassUpload.findOne({ key: classUploadKey(req.user.campus) }).select('fileName originalFile').lean();
  if (!upload) throw fail(404, 'No uploaded class file found.');
  if (!upload.originalFile?.length) throw fail(404, 'The original CSV is not available for this older upload. Replace it with a CSV to enable exact downloads.');
  res.type('text/csv').attachment(upload.fileName).send(upload.originalFile);
}));
r.delete('/classes/upload', ah(async (req, res) => {
  const upload = await getCampusClassUpload(req.user.campus);
  if (!upload) throw fail(404, 'No uploaded class file found.');
  const session = await ClassUpload.startSession();
  try {
    await session.withTransaction(async () => {
      const sectionIds = upload.sections;
      await deleteSectionsOnly(sectionIds, session);
      await ClassUpload.deleteOne({ _id: upload._id }, { session });
    });
  } finally {
    await session.endSession();
  }
  audit(req, 'delete', 'ClassUpload', upload._id, upload, null);
  res.json({ success: true });
}));
r.post('/classes/import', validate(z.object({
  fileName: t(255),
  classes: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
  originalFile: z.string().min(1).max(2_796_204)
}).strict()), ah(async (req, res) => {
  const Department = M('Department'), Semester = M('Semester'), Section = M('Section');
  if (!req.body.fileName.toLowerCase().endsWith('.csv')) throw fail(400, 'Only CSV files can be saved as the original upload.');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(req.body.originalFile)) {
    throw fail(400, 'The original CSV could not be read.');
  }
  const originalFile = Buffer.from(req.body.originalFile, 'base64');
  if (!originalFile.length || originalFile.length > 2 * 1024 * 1024 || originalFile.toString('base64') !== req.body.originalFile) {
    throw fail(400, 'The original CSV must be 2 MB or smaller.');
  }
  const currentUpload = await getCampusClassUpload(req.user.campus);
  const departmentCache = new Map(), semesterCache = new Map();
  const desired = [], errors = [];
  let imported = 0, existing = 0, removed = 0;
  const textFrom = (row, keys) => Object.entries(row).find(([name, value]) =>
    keys.includes(name.toLowerCase().replace(/[\s-]+/g, '_')) && typeof value === 'string' && value.trim()
  )?.[1]?.trim();

  for (const [index, row] of req.body.classes.entries()) {
    const rowNumber = Number.isInteger(row.rowNumber) && row.rowNumber > 0 ? row.rowNumber : index + 2;
    try {
      const allText = Object.values(row).find(value => typeof value === 'string' && value.trim())?.trim() || '';
      const className = textFrom(row, ['class_name', 'section_name', 'section', 'class', 'name'])
        || (Object.hasOwn(row, 'class_name') ? '' : allText);
      if (!className) {
        errors.push(`Row ${rowNumber}: could not find a class or section name.`);
        continue;
      }

      const branch = textFrom(row, ['branch', 'branch_name', 'branch_code', 'branchcode']);
      if (branch && branch.length > 40) throw new Error('Branch name must be 40 characters or fewer.');
      const departmentName = textFrom(row, ['department_name', 'department', 'dept', 'course'])
        || textFrom(row, ['branch_name', 'branch'])
        || 'General';
      const departmentCode = (textFrom(row, ['department_code', 'department', 'dept', 'code'])
        || textFrom(row, ['branch_code', 'branch'])
        || departmentName).replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase() || 'GEN';
      const semesterValue = textFrom(row, ['semester_number', 'semester', 'sem']) || '1';
      const parsedSemester = Number.parseInt(String(semesterValue).match(/\d+/)?.[0] || '1', 10);
      const semesterNumber = Math.min(12, Math.max(1, parsedSemester || 1));

      let department = departmentCache.get(departmentCode);
      if (!department) {
        department = await Department.findOneAndUpdate(
          { code: departmentCode },
          { $set: { name: departmentName } },
          { upsert: true, new: true, runValidators: true }
        );
        departmentCache.set(departmentCode, department);
      }

      let semester = semesterCache.get(semesterNumber);
      if (!semester) {
        semester = await Semester.findOneAndUpdate(
          { number: semesterNumber },
          { $set: { name: `Semester ${semesterNumber}` } },
          { upsert: true, new: true, runValidators: true }
        );
        semesterCache.set(semesterNumber, semester);
      }

      desired.push({
        name: className.slice(0, 20),
        department: department._id,
        semester: semester._id,
        ...(branch ? { branch } : {}),
        campus: req.user.campus,
        rowNumber
      });
    } catch (error) {
      errors.push(`Row ${rowNumber}: ${error.message}`);
    }
  }

  if (!desired.length) {
    audit(req, 'classes.import', 'Section', null, null, { imported, existing, removed, errors: errors.length });
    return res.json({ success: true, data: { imported, existing, removed, skipped: errors.length, errors } });
  }
  if (errors.length) {
    errors.push('No changes were saved. Fix the invalid rows and upload the file again.');
    audit(req, 'classes.import', 'Section', null, null, { imported, existing, removed, errors: errors.length });
    return res.json({ success: true, data: { imported, existing, removed, skipped: errors.length, errors } });
  }

  const previous = await Section.find({ campus: req.user.campus }).select('_id name department semester branch campus').lean();
  const previousIds = previous.map(section => section._id);
  const plan = planClassSync(previous, desired);
  const toCreate = plan.toCreate;
  const desiredSectionIds = [...plan.desiredSectionIds];
  const obsoleteIds = plan.obsoleteIds;
  existing = plan.retained;

  if (toCreate.length) {
    try {
      const created = await Section.insertMany(toCreate, { ordered: true });
      imported = created.length;
      let createdIndex = 0;
      for (let index = 0; index < desiredSectionIds.length; index++) {
        if (desiredSectionIds[index] == null) desiredSectionIds[index] = created[createdIndex++]._id;
      }
    } catch (error) {
      errors.push(`Could not save new classes: ${error.message}`);
    }
  }
  const session = await Section.startSession();
  try {
    await session.withTransaction(async () => {
      if (obsoleteIds.length) {
        await deleteSectionsOnly(obsoleteIds, session);
        removed = obsoleteIds.length;
      }
      for (const section of plan.toUpdate) {
        const update = section.branch ? { $set: { branch: section.branch } } : { $unset: { branch: 1 } };
        await Section.updateOne({ _id: section._id }, update, { session });
      }
      const upload = currentUpload
        ? await ClassUpload.findOne({ _id: currentUpload._id, key: classUploadKey(req.user.campus) }).session(session)
        : null;
      if (currentUpload && !upload) throw fail(409, 'The uploaded class file changed during import. Please upload the CSV again.');
      if (upload) {
        upload.fileName = req.body.fileName;
        upload.originalFile = originalFile;
        upload.legacy = false;
        upload.sections = desiredSectionIds;
        await upload.save({ session });
      } else {
        await ClassUpload.create([{
          key: classUploadKey(req.user.campus),
          fileName: req.body.fileName,
          originalFile,
          legacy: false,
          sections: desiredSectionIds
        }], { session });
      }
    });
  } finally {
    await session.endSession();
  }
  audit(req, 'classes.import', 'Section', null, null, { imported, existing, removed, errors: errors.length });
  res.json({ success: true, data: {
    imported,
    existing,
    removed,
    skipped: errors.length,
    errors,
    replaced: Boolean(currentUpload)
  } });
}));
r.post('/classes/excel-preview', require('express').raw({ type: 'application/octet-stream', limit: '2mb' }), ah(async (req, res) => {
  res.json({ success: true, data: { rows: excelRows(req.body) } });
}));
// ---- users (explicit field whitelist; admin controls role assignment) ----
const user = z.object({ name: t(), email: z.string().trim().toLowerCase().email(), instId: t(30).optional(), role: z.enum(['student', 'faculty', 'hod', 'admin']), campus: z.enum(['BIRT', 'BIRTS', 'BIST']).optional(), department: zid.optional(), rollNo: t(30).optional(), active: z.boolean().optional(), password: passwordSchema }).strict();
const lastAdmin = async u => { if (u.role === 'admin' && u.active && !await U.exists({ role: 'admin', active: true, _id: { $ne: u._id } })) throw fail(400, 'Cannot remove or deactivate the last active admin'); };
r.get('/users', ah(async (req, res) => res.json({ success: true, data: await U.find().sort('-createdAt').limit(1000).populate('department', 'name code') })));
r.post('/students/import', validate(z.object({ students: z.array(z.object({
  name: t(), email: z.string().trim().toLowerCase().email(), instid: t(30).optional(),
  instId: t(30).optional(), rollno: t(30).optional(), rollNo: t(30).optional(),
  department: t(120).optional(), password: passwordSchema
}).strict()).min(1).max(500) }).strict()), ah(async (req, res) => {
  const Department = M('Department');
  let imported = 0, skipped = 0;
  const errors = [];
  for (const [index, row] of req.body.students.entries()) {
    if (await U.exists({ email: row.email })) { skipped++; errors.push(`Row ${index + 2}: email already exists`); continue; }
    let department;
    if (row.department) {
      const escaped = row.department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      department = await Department.findOne({
        $or: [{ code: row.department }, { name: new RegExp(`^${escaped}$`, 'i') }]
      });
    }
    try {
      await U.create({
        name: row.name,
        email: row.email,
        instId: row.instId || row.instid || undefined,
        rollNo: row.rollNo || row.rollno || undefined,
        department: department?._id,
        role: 'student',
        active: true,
        passwordHash: await bcrypt.hash(row.password, 12)
      });
      imported++;
    } catch (error) {
      skipped++;
      errors.push(`Row ${index + 2}: ${error.message}`);
    }
  }
  audit(req, 'student.import', 'User', null, null, { imported, skipped });
  res.json({ success: true, data: { imported, skipped, errors } });
}));
r.post('/users', validate(user), ah(async (req, res) => {
  const { password, ...b } = req.body, d = await U.create({ ...b, passwordHash: await bcrypt.hash(password, 12) });
  audit(req, 'user.create', 'User', d._id, null, { email: d.email, role: d.role }); res.status(201).json({ success: true, data: d });
}));
r.patch('/users/:id', validate(user.partial()), ah(async (req, res) => {
  const u = await U.findById(oid(req.params.id)).select('+passwordHash'); if (!u) throw fail(404, 'Not found');
  const { password, ...b } = req.body, before = { role: u.role, active: u.active };
  if ((b.role && b.role !== 'admin') || b.active === false) await lastAdmin(u);
  Object.assign(u, b); if (password) u.passwordHash = await bcrypt.hash(password, 12);
  if (password || b.active === false || b.role) u.tokenVersion += 1; // force re-login
  await u.save(); audit(req, 'user.update', 'User', u._id, before, { role: u.role, active: u.active }); res.json({ success: true, data: u });
}));
r.delete('/users/:id', ah(async (req, res) => { // soft delete = deactivate
  const u = await U.findById(oid(req.params.id)); if (!u) throw fail(404, 'Not found');
  await lastAdmin(u); u.active = false; u.tokenVersion += 1; await u.save(); audit(req, 'user.deactivate', 'User', u._id); res.json({ success: true });
}));
r.get('/settings/threshold', ah(async (req, res) => res.json({ success: true, data: { value: await svc.threshold() } })));
r.put('/settings/threshold', validate(z.object({ value: z.number().int().min(1).max(100) }).strict()), ah(async (req, res) => {
  const old = await svc.threshold(); await Setting.updateOne({ key: 'threshold' }, { value: req.body.value }, { upsert: true }); audit(req, 'settings.threshold', 'Setting', 'threshold', old, req.body.value); res.json({ success: true, data: req.body });
}));
r.get('/settings/college-hours', ah(async (req, res) => {
  if (!req.user.campus) throw fail(400, 'Sign in with a selected college to manage attendance timings.');
  res.json({ success: true, data: { campus: req.user.campus, ...await getCollegeAttendanceHours(req.user.campus) } });
}));
const collegeHoursSchema = z.object({
  openTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid opening time.'),
  closeTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid closing time.')
}).strict().superRefine((value, ctx) => {
  if (timeToMinutes(value.openTime) >= timeToMinutes(value.closeTime)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['closeTime'], message: 'Closing time must be later than opening time.' });
  }
});
r.put('/settings/college-hours', validate(collegeHoursSchema), ah(async (req, res) => {
  const campus = req.user.campus;
  if (!campus) throw fail(400, 'Sign in with a selected college to manage attendance timings.');
  const key = collegeHoursSettingKey(campus);
  const old = await Setting.findOne({ key }).select('value').lean();
  await Setting.updateOne({ key }, { value: req.body }, { upsert: true });
  audit(req, 'settings.college-attendance-hours', 'Setting', key, old?.value, req.body);
  res.json({ success: true, data: { campus, configured: true, ...req.body } });
}));
r.get('/audit-logs', ah(async (req, res) => res.json({ success: true, data: await AL.find().sort('-createdAt').limit(200).populate('actor', 'name email') })));
module.exports = r;
