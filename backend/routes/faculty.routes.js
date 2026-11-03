const r = require('express').Router(), { z } = require('zod'), FA = require('../models/FacultyAssignment'), En = require('../models/Enrollment'), S = require('../models/AttendanceSession'), CR = require('../models/CorrectionRequest'), U = require('../models/User'), Subject = require('../models/Subject'), Section = require('../models/Section'), HodFileUpload = require('../models/HodFileUpload'), FacultySubjectHistory = require('../models/FacultySubjectHistory');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), validate = require('../middleware/validate'), { ah, fail, oid } = require('../utils/helpers');
const { uploadedSubjectsFromFiles } = require('../utils/uploadedSubjects');
const { backfillHodFileCampuses } = require('../utils/hodFileCampus');
r.use(authenticate, authorize('faculty'));
const asg = req => FA.find({ faculty: req.user._id }).populate('subject', 'code name').populate('section', 'name');
r.get('/assignments', ah(async (req, res) => res.json({ success: true, data: await asg(req) })));
async function subjectsForCampus(campus) {
  if (!campus) return [];
  await backfillHodFileCampuses();
  const [departments, files] = await Promise.all([
    Section.distinct('department', { campus }),
    HodFileUpload.find({ campus }).select('fileName content department').populate('department', 'name').sort('-createdAt').limit(100).lean()
  ]);
  const databaseSubjects = departments.length ? await Subject.find({ department: { $in: departments } })
    .select('code name department semester')
    .populate('department', 'name')
    .populate('semester', 'number')
    .sort('code name')
    .lean() : [];
  const uploadedSubjects = uploadedSubjectsFromFiles({ files });
  const catalog = new Map();
  for (const subject of databaseSubjects) {
    const catalogId = `subject:${subject._id}`;
    catalog.set(catalogId, {
      id: catalogId,
      code: subject.code,
      name: subject.name,
      department: subject.department?.name || '',
      semester: subject.semester?.number
    });
  }
  for (const subject of uploadedSubjects) {
    const catalogId = `upload:${subject.code.toLowerCase()}`;
    const alreadyListed = [...catalog.values()].some(item => item.code.toLowerCase() === subject.code.toLowerCase());
    if (!alreadyListed && !catalog.has(catalogId)) catalog.set(catalogId, {
      id: catalogId,
      code: subject.code,
      name: subject.name,
      department: subject.department,
      semester: subject.semester
    });
  }
  return [...catalog.values()].sort((a, b) => a.code.localeCompare(b.code));
}
async function savedSubjectForFaculty(facultyId, catalogId) {
  const faculty = await U.findById(facultyId)
    .select('campus savedSubjects savedUploadedSubjects')
    .populate('savedSubjects', 'code')
    .lean();
  const subject = [
    ...(faculty?.savedSubjects || []).map(item => ({ catalogId: `subject:${item._id}`, code: item.code })),
    ...(faculty?.savedUploadedSubjects || [])
  ].find(item => item.catalogId === catalogId);
  return faculty && subject ? { faculty, subject } : null;
}
async function studentsForSavedSubject(faculty, subject) {
  if (!faculty.campus) return [];
  await backfillHodFileCampuses();
  const [files, students] = await Promise.all([
    HodFileUpload.find({ campus: faculty.campus })
      .select('fileName content department')
      .populate('department', 'name')
      .sort('-createdAt')
      .limit(100)
      .lean(),
    U.find({ role: 'student', campus: faculty.campus, active: true })
      .select('name rollNo branch semester')
      .populate('semester', 'number')
      .sort('name')
      .lean()
  ]);
  const eligibleGroups = new Map();
  const code = String(subject.code).replace(/[^a-z0-9]/gi, '').toLowerCase();
  return students.filter(student => {
    const semester = student.semester?.number;
    if (!student.branch || semester == null) return false;
    const key = `${student.branch.trim().toLowerCase()}:${semester}`;
    if (!eligibleGroups.has(key)) {
      const visibleSubjects = uploadedSubjectsFromFiles({ files, branch: student.branch, semester });
      eligibleGroups.set(key, visibleSubjects.some(item => item.code.replace(/[^a-z0-9]/gi, '').toLowerCase() === code));
    }
    return eligibleGroups.get(key);
  }).map(student => ({ id: String(student._id), name: student.name, rollNo: student.rollNo || '' }));
}
r.get('/subject-catalog', ah(async (req, res) => {
  res.json({ success: true, data: await subjectsForCampus(req.user.campus) });
}));
r.get('/subject-students', validate(z.object({
  subject: z.string().trim().min(1).max(100)
}).strict(), 'query'), ah(async (req, res) => {
  const saved = await savedSubjectForFaculty(req.user._id, req.validated.subject);
  if (!saved) throw fail(404, 'Subject not found in your saved subjects.');
  res.json({ success: true, data: await studentsForSavedSubject(saved.faculty, saved.subject) });
}));
r.get('/subject-history', validate(z.object({
  subject: z.string().trim().min(1).max(100)
}).strict(), 'query'), ah(async (req, res) => {
  if (!await savedSubjectForFaculty(req.user._id, req.validated.subject)) throw fail(404, 'Subject not found in your saved subjects.');
  const history = await FacultySubjectHistory.find({ faculty: req.user._id, catalogId: req.validated.subject })
    .select('code date')
    .sort({ date: -1 })
    .lean();
  res.json({ success: true, data: history });
}));
r.get('/subject-history/:id', validate(z.object({
  subject: z.string().trim().min(1).max(100)
}).strict(), 'query'), ah(async (req, res) => {
  const saved = await savedSubjectForFaculty(req.user._id, req.validated.subject);
  if (!saved) throw fail(404, 'Subject not found in your saved subjects.');
  const history = await FacultySubjectHistory.findOne({
    _id: oid(req.params.id),
    faculty: req.user._id,
    catalogId: req.validated.subject
  }).select('code date students createdAt').lean();
  if (!history) throw fail(404, 'Subject history not found.');
  res.json({ success: true, data: history });
}));
r.put('/subject-history/:id', validate(z.object({
  subject: z.string().trim().min(1).max(100),
  students: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(5000)
}).strict()), ah(async (req, res) => {
  const saved = await savedSubjectForFaculty(req.user._id, req.body.subject);
  if (!saved) throw fail(404, 'Subject not found in your saved subjects.');
  const history = await FacultySubjectHistory.findOne({
    _id: oid(req.params.id),
    faculty: req.user._id,
    catalogId: req.body.subject
  });
  if (!history) throw fail(404, 'Subject history not found.');
  const editWindowMs = 6 * 60 * 60 * 1000;
  if (Date.now() - history.createdAt.getTime() > editWindowMs) {
    throw fail(403, 'This history can only be edited within 6 hours of saving.');
  }
  const roster = await studentsForSavedSubject(saved.faculty, saved.subject);
  const rosterById = new Map(roster.map(student => [student.id, student]));
  const selectedIds = [...new Set(req.body.students)];
  if (selectedIds.some(id => !rosterById.has(id))) throw fail(422, 'Selected students must be from this subject roster.');
  history.students = selectedIds.map(id => ({
    id,
    name: rosterById.get(id).name,
    rollNo: rosterById.get(id).rollNo
  }));
  await history.save();
  res.json({ success: true, data: history });
}));
r.delete('/subject-history/:id', validate(z.object({
  subject: z.string().trim().min(1).max(100)
}).strict(), 'query'), ah(async (req, res) => {
  if (!await savedSubjectForFaculty(req.user._id, req.validated.subject)) throw fail(404, 'Subject not found in your saved subjects.');
  const history = await FacultySubjectHistory.findOneAndDelete({
    _id: oid(req.params.id),
    faculty: req.user._id,
    catalogId: req.validated.subject
  });
  if (!history) throw fail(404, 'Subject history not found.');
  res.json({ success: true, data: { deleted: true } });
}));
r.post('/subject-history', validate(z.object({
  subject: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  students: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(5000)
}).strict()), ah(async (req, res) => {
  const saved = await savedSubjectForFaculty(req.user._id, req.body.subject);
  if (!saved) throw fail(404, 'Subject not found in your saved subjects.');
  const roster = await studentsForSavedSubject(saved.faculty, saved.subject);
  const rosterById = new Map(roster.map(student => [student.id, student]));
  const selectedIds = [...new Set(req.body.students)];
  if (selectedIds.some(id => !rosterById.has(id))) throw fail(422, 'Selected students must be from this subject roster.');
  try {
    const history = await FacultySubjectHistory.create({
      faculty: req.user._id,
      catalogId: req.body.subject,
      code: saved.subject.code,
      date: req.body.date,
      students: selectedIds.map(id => ({
        id,
        name: rosterById.get(id).name,
        rollNo: rosterById.get(id).rollNo
      }))
    });
    res.status(201).json({ success: true, data: history });
  } catch (error) {
    if (error.code === 11000) throw fail(409, 'History for this subject and date has already been saved.');
    throw error;
  }
}));
r.put('/my-subjects', validate(z.object({
  subjects: z.array(z.string().min(1).max(100)).max(500)
}).strict()), ah(async (req, res) => {
  const subjects = [...new Set(req.body.subjects)];
  const allowed = await subjectsForCampus(req.user.campus);
  const allowedSubjects = new Map(allowed.map(subject => [subject.id, subject]));
  if (subjects.some(subject => !allowedSubjects.has(subject))) throw fail(422, 'Select subjects from your college subject list.');
  const selected = subjects.map(subject => allowedSubjects.get(subject));
  const user = await U.findById(req.user._id);
  if (!user) throw fail(404, 'Faculty account not found.');
  user.savedSubjects = selected
    .filter(subject => subject.id.startsWith('subject:'))
    .map(subject => subject.id.slice('subject:'.length));
  user.savedUploadedSubjects = selected
    .filter(subject => subject.id.startsWith('upload:'))
    .map(subject => ({
      catalogId: subject.id,
      code: subject.code,
      name: subject.name,
      department: subject.department,
      semester: subject.semester
    }));
  await user.save();
  await user.populate({ path: 'savedSubjects', select: 'code name department semester', populate: [{ path: 'department', select: 'name' }, { path: 'semester', select: 'number' }] });
  const savedSubjects = [
    ...user.savedSubjects.map(subject => ({
      catalogId: `subject:${subject._id}`,
      code: subject.code,
      name: subject.name,
      department: subject.department?.name || '',
      semester: subject.semester?.number
    })),
    ...user.savedUploadedSubjects
  ];
  res.json({ success: true, data: savedSubjects });
}));
r.get('/dashboard', ah(async (req, res) => {
  const a = await asg(req), recent = await S.find({ faculty: req.user._id }).sort('-date').limit(6).populate('subject', 'code name').populate('section', 'name');
  const user = await U.findById(req.user._id).populate({ path: 'savedSubjects', select: 'code name department semester', populate: [{ path: 'department', select: 'name' }, { path: 'semester', select: 'number' }] }).lean();
  const savedSubjects = [
    ...(user?.savedSubjects || []).map(subject => ({
      catalogId: `subject:${subject._id}`,
      code: subject.code,
      name: subject.name,
      department: subject.department?.name || '',
      semester: subject.semester?.number
    })),
    ...(user?.savedUploadedSubjects || [])
  ];
  const historyCounts = await FacultySubjectHistory.aggregate([
    { $match: { faculty: req.user._id } },
    { $group: { _id: '$catalogId', totalDays: { $sum: 1 } } }
  ]);
  const totalDaysBySubject = new Map(historyCounts.map(item => [item._id, item.totalDays]));
  savedSubjects.forEach(subject => {
    subject.totalDays = totalDaysBySubject.get(subject.catalogId) || 0;
  });
  res.json({ success: true, data: { subjects: new Set(a.map(x => String(x.subject._id))).size, sections: new Set(a.map(x => String(x.section._id))).size, sessions: await S.countDocuments({ faculty: req.user._id, status: 'submitted' }), pending: await CR.countDocuments({ faculty: req.user._id, status: 'pending' }), savedSubjects, recent } });
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
