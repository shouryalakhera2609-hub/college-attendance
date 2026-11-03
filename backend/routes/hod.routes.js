const r = require('express').Router(), bcrypt = require('bcrypt'), { z } = require('zod'), CR = require('../models/CorrectionRequest'), AR = require('../models/AttendanceRecord'), U = require('../models/User'), S = require('../models/AttendanceSession');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), validate = require('../middleware/validate'), { ah, fail, zid, oid, audit, pct } = require('../utils/helpers');
const svc = require('../services/attendance.service'), rep = require('../services/report.service');
const { spreadsheetRows, writeSpreadsheetRows } = require('../utils/excel');
const HodFileUpload = require('../models/HodFileUpload');
r.use(authenticate, authorize('hod'), (req, res, next) => req.user.department ? next() : res.status(403).json({ success: false, message: 'No department assigned' }));
r.get('/dashboard', ah(async (req, res) => {
  const d = req.user.department;
  const [students, faculty, pending, sum, rows, recent] = await Promise.all([U.countDocuments({ role: 'student', department: d, active: true }), U.countDocuments({ role: 'faculty', department: d, active: true }), CR.countDocuments({ department: d, status: 'pending' }), svc.summary({ department: d }), rep.run(req.user, { low: '1' }), S.find({ department: d }).sort('-createdAt').limit(6).populate('subject', 'code').populate('faculty', 'name')]);
  res.json({ success: true, data: { students, faculty, pending, threshold: sum.threshold, overall: sum.overall, subjects: sum.subjects, lowStudents: new Set(rows.rows.map(x => x.rollNo)).size, recent } });
}));
r.get('/students', ah(async (req, res) => {
  const students = await U.find({ role: 'student', department: req.user.department })
    .select('name email instId rollNo branch active createdAt')
    .sort('name')
    .limit(1000)
    .lean();
  res.json({ success: true, data: students });
}));
r.get('/files', ah(async (req, res) => {
  const files = await HodFileUpload.find({ department: req.user.department })
    .select('fileName contentType size createdAt updatedAt')
    .sort('-createdAt')
    .limit(100)
    .lean();
  res.json({ success: true, data: files });
}));
r.get('/files/:id/preview', ah(async (req, res) => {
  const file = await HodFileUpload.findOne({ _id: oid(req.params.id), department: req.user.department }).select('fileName content');
  if (!file) throw fail(404, 'File not found in your department.');
  const extension = file.fileName.slice(file.fileName.lastIndexOf('.')).toLowerCase();
  const rows = spreadsheetRows(file.content, extension);
  res.json({ success: true, data: { fileName: file.fileName, rows: rows.slice(0, 500), totalRows: rows.length, truncated: rows.length > 500 } });
}));
r.post('/files', require('express').raw({ type: 'application/octet-stream', limit: '2mb' }), ah(async (req, res) => {
  const fileName = typeof req.query.fileName === 'string' ? req.query.fileName.trim() : '';
  if (!fileName || fileName.length > 255 || /[\\/\0-\x1f\x7f]/.test(fileName)) {
    throw fail(400, 'Provide a valid CSV or Excel file name.');
  }
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  const contentTypes = {
    '.csv': 'text/csv',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  if (!contentTypes[extension]) throw fail(400, 'Only .csv, .xls, or .xlsx files are allowed.');
  if (!Buffer.isBuffer(req.body)) throw fail(400, 'The selected file could not be read.');
  const upload = await HodFileUpload.create({
    department: req.user.department,
    fileName,
    contentType: contentTypes[extension],
    size: req.body.length,
    content: req.body
  });
  audit(req, 'hod.file.upload', 'HodFileUpload', upload._id, null, { fileName, department: req.user.department });
  res.status(201).json({ success: true, data: { _id: upload._id, fileName: upload.fileName, contentType: upload.contentType, createdAt: upload.createdAt } });
}));
r.put('/files/:id/rows/:rowIndex', require('express').raw({ type: 'application/octet-stream', limit: '2mb' }), ah(async (req, res) => {
  const rowIndex = Number(req.params.rowIndex);
  if (!Number.isSafeInteger(rowIndex) || rowIndex < 0) throw fail(400, 'Invalid row number.');
  let body;
  try {
    if (!Buffer.isBuffer(req.body)) throw new Error('Missing request body');
    body = JSON.parse(req.body.toString('utf8'));
  }
  catch { throw fail(400, 'Invalid row data.'); }
  const parsed = z.object({ cells: z.array(z.string().max(10000)).max(200) }).strict().safeParse(body);
  if (!parsed.success) throw fail(400, 'A row can contain up to 200 cells, each up to 10,000 characters.');
  const file = await HodFileUpload.findOne({ _id: oid(req.params.id), department: req.user.department }).select('fileName content');
  if (!file) throw fail(404, 'File not found in your department.');
  const extension = file.fileName.slice(file.fileName.lastIndexOf('.')).toLowerCase();
  const rows = spreadsheetRows(file.content, extension);
  if (rowIndex >= rows.length) throw fail(404, 'Row not found in this file.');
  rows[rowIndex] = parsed.data.cells;
  const content = writeSpreadsheetRows(rows, extension);
  if (content.length > 2 * 1024 * 1024) throw fail(400, 'Edited file must be 2 MB or smaller.');
  file.content = content;
  file.size = content.length;
  await file.save();
  audit(req, 'hod.file.row.update', 'HodFileUpload', file._id, { fileName: file.fileName, row: rowIndex + 1 }, { fileName: file.fileName, row: rowIndex + 1 });
  res.json({ success: true, data: { updated: true } });
}));
r.delete('/files/:id/rows/:rowIndex', ah(async (req, res) => {
  const rowIndex = Number(req.params.rowIndex);
  if (!Number.isSafeInteger(rowIndex) || rowIndex < 0) throw fail(400, 'Invalid row number.');
  const file = await HodFileUpload.findOne({ _id: oid(req.params.id), department: req.user.department }).select('fileName content');
  if (!file) throw fail(404, 'File not found in your department.');
  const extension = file.fileName.slice(file.fileName.lastIndexOf('.')).toLowerCase();
  const rows = spreadsheetRows(file.content, extension);
  if (rowIndex >= rows.length) throw fail(404, 'Row not found in this file.');
  rows.splice(rowIndex, 1);
  const content = writeSpreadsheetRows(rows, extension);
  if (content.length > 2 * 1024 * 1024) throw fail(400, 'Edited file must be 2 MB or smaller.');
  file.content = content;
  file.size = content.length;
  await file.save();
  audit(req, 'hod.file.row.delete', 'HodFileUpload', file._id, { fileName: file.fileName, row: rowIndex + 1 }, null);
  res.json({ success: true, data: { deleted: true } });
}));
r.get('/files/:id', ah(async (req, res) => {
  const file = await HodFileUpload.findOne({ _id: oid(req.params.id), department: req.user.department }).select('fileName contentType content');
  if (!file) throw fail(404, 'File not found in your department.');
  res.type(file.contentType).attachment(file.fileName).send(file.content);
}));
r.delete('/files/:id', ah(async (req, res) => {
  const file = await HodFileUpload.findOneAndDelete({ _id: oid(req.params.id), department: req.user.department });
  if (!file) throw fail(404, 'File not found in your department.');
  audit(req, 'hod.file.delete', 'HodFileUpload', file._id, { fileName: file.fileName }, null);
  res.json({ success: true });
}));
r.post('/students/import', validate(z.object({
  students: z.array(z.record(z.string(), z.unknown())).min(1).max(500)
}).strict()), ah(async (req, res) => {
  let imported = 0, skipped = 0;
  const errors = [];
  const field = (row, names) => {
    const entry = Object.entries(row).find(([key, value]) =>
      names.includes(key.toLowerCase().replace(/[\s-]+/g, '_')) && typeof value === 'string' && value.trim()
    );
    return entry ? entry[1].trim() : '';
  };
  for (const [index, row] of req.body.students.entries()) {
    const name = field(row, ['name', 'full_name', 'student_name']);
    const email = field(row, ['email', 'email_address', 'gmail']).toLowerCase();
    const instId = field(row, ['instid', 'institution_id', 'student_id', 'enrollment_number', 'enrollment_no']);
    const rollNo = field(row, ['rollno', 'roll_no', 'roll_number']);
    const password = field(row, ['password', 'pass']);
    const branch = field(row, ['branch']);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 128) {
      skipped++;
      errors.push(`Row ${index + 2}: provide a name, valid email, and password with at least 10 characters.`);
      continue;
    }
    if (await U.exists({ $or: [{ email }, ...(instId ? [{ instId }] : [])] })) {
      skipped++;
      errors.push(`Row ${index + 2}: email or institution ID already exists.`);
      continue;
    }
    try {
      await U.create({
        name: name.slice(0, 100),
        email,
        instId: instId.slice(0, 30) || undefined,
        rollNo: rollNo.slice(0, 30) || undefined,
        branch: branch.slice(0, 40) || undefined,
        campus: req.user.campus,
        department: req.user.department,
        role: 'student',
        active: true,
        passwordHash: await bcrypt.hash(password, 12)
      });
      imported++;
    } catch (error) {
      skipped++;
      errors.push(`Row ${index + 2}: ${error.message}`);
    }
  }
  audit(req, 'hod.student.import', 'User', null, null, { imported, skipped, department: req.user.department });
  res.json({ success: true, data: { imported, skipped, errors } });
}));
async function deleteSubjectRecords(subjectIds, session) {
  const sessions = await S.find({ subject: { $in: subjectIds } }).select('_id').session(session).lean();
  const records = await AR.find({ subject: { $in: subjectIds } }).select('_id').session(session).lean();
  const sessionIds = sessions.map(item => item._id);
  const recordIds = records.map(item => item._id);
  await CR.deleteMany({
    $or: [
      { subject: { $in: subjectIds } },
      { session: { $in: sessionIds } },
      { record: { $in: recordIds } }
    ]
  }, { session });
  await AR.deleteMany({ subject: { $in: subjectIds } }, { session });
  await S.deleteMany({ subject: { $in: subjectIds } }, { session });
  await require('../models/FacultyAssignment').deleteMany({ subject: { $in: subjectIds } }, { session });
}

r.get('/subjects', ah(async (req, res) => {
  const subjects = await require('../models/Subject').find({ department: req.user.department })
    .sort('code').limit(1000).populate('semester', 'name number');
  res.json({ success: true, data: subjects });
}));
r.patch('/subjects/:id', validate(z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  semesterNumber: z.number().int().min(1).max(12)
}).strict()), ah(async (req, res) => {
  const Subject = require('../models/Subject'), Semester = require('../models/Semester');
  const id = oid(req.params.id);
  const before = await Subject.findOne({ _id: id, department: req.user.department });
  if (!before) throw fail(404, 'Subject not found in your department');
  const semester = await Semester.findOne({ number: req.body.semesterNumber });
  if (!semester) throw fail(400, `Semester ${req.body.semesterNumber} does not exist`);
  const updated = await Subject.findOneAndUpdate(
    { _id: id, department: req.user.department },
    { code: req.body.code.toUpperCase(), name: req.body.name, semester: semester._id },
    { new: true, runValidators: true }
  ).populate('semester', 'name number');
  audit(req, 'hod.subject.update', 'Subject', id, before, updated);
  res.json({ success: true, data: updated });
}));
r.delete('/subjects/:id', ah(async (req, res) => {
  const Subject = require('../models/Subject'), id = oid(req.params.id);
  const subject = await Subject.findOne({ _id: id, department: req.user.department });
  if (!subject) throw fail(404, 'Subject not found in your department');
  const session = await Subject.startSession();
  try {
    await session.withTransaction(async () => {
      await deleteSubjectRecords([id], session);
      await Subject.deleteOne({ _id: id, department: req.user.department }, { session });
    });
  } finally {
    await session.endSession();
  }
  audit(req, 'hod.subject.delete', 'Subject', id, subject, null);
  res.json({ success: true });
}));
r.get('/correction-requests', ah(async (req, res) => {
  const m = { department: req.user.department }; if (['pending', 'approved', 'rejected'].includes(req.query.status)) m.status = req.query.status;
  res.json({ success: true, data: await CR.find(m).sort('-createdAt').limit(200).populate('subject', 'code name').populate('student', 'name rollNo') });
}));
const dec = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().trim().max(500).optional() }).strict().refine(d => d.decision !== 'rejected' || (d.reason && d.reason.length >= 5), { message: 'A reason is required when rejecting', path: ['reason'] });
r.patch('/correction-requests/:id', validate(dec), ah(async (req, res) => {
  const { decision, reason } = req.body;
  // Atomic claim restricted to the HOD's own department and pending status
  const c = await CR.findOneAndUpdate({ _id: oid(req.params.id), department: req.user.department, status: 'pending' }, { status: decision, reviewedBy: req.user._id, reviewReason: reason, reviewedAt: new Date() });
  if (!c) throw fail(404, 'Pending request not found in your department');
  if (decision === 'approved') await AR.updateOne({ _id: c.record }, { status: c.requestedStatus });
  audit(req, 'correction.' + decision, 'AttendanceRecord', c.record, { status: c.currentStatus }, { status: decision === 'approved' ? c.requestedStatus : c.currentStatus, reason, requestedBy: c.student });
  res.json({ success: true, message: 'Request ' + decision });
}));
r.get('/reports', ah(async (req, res) => res.json({ success: true, data: await rep.run(req.user, {}) })));
module.exports = r;
