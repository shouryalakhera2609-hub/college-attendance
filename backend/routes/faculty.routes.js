const r = require('express').Router(), { z } = require('zod'), bcrypt = require('bcrypt'), FA = require('../models/FacultyAssignment'), En = require('../models/Enrollment'), S = require('../models/AttendanceSession'), AR = require('../models/AttendanceRecord'), CR = require('../models/CorrectionRequest'), U = require('../models/User'), AuditLog = require('../models/AuditLog'), Subject = require('../models/Subject'), Section = require('../models/Section'), HodFileUpload = require('../models/HodFileUpload'), FacultySubjectHistory = require('../models/FacultySubjectHistory');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), validate = require('../middleware/validate'), { ah, fail, oid, dateIsFuture, sortStudentsByRollNo } = require('../utils/helpers');
const { uploadedSubjectsFromFiles } = require('../utils/uploadedSubjects');
const { backfillHodFileCampuses } = require('../utils/hodFileCampus');
const { averageAttendance, averageRecentAttendance } = require('../utils/facultyAttendance');
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
async function facultySubjectOwners(campus, excludeFacultyId) {
  if (!campus) return new Map();
  const faculty = await U.find({ role: 'faculty', campus, active: true })
    .select('name phone savedSubjects savedUploadedSubjects')
    .lean();
  const owners = new Map();
  const addOwner = (catalogId, member) => {
    if (!owners.has(catalogId)) owners.set(catalogId, []);
    owners.get(catalogId).push({ name: member.name, phone: member.phone || '' });
  };
  for (const member of faculty) {
    if (String(member._id) === String(excludeFacultyId)) continue;
    for (const subjectId of member.savedSubjects || []) addOwner(`subject:${subjectId}`, member);
    for (const subject of member.savedUploadedSubjects || []) addOwner(subject.catalogId, member);
  }
  return owners;
}
async function facultyIdsForCampus(campus) {
  if (!campus) return [];
  return U.find({ role: 'faculty', campus }).distinct('_id');
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
  const roster = students.filter(student => {
    const semester = student.semester?.number;
    if (!student.branch || semester == null) return false;
    const key = `${student.branch.trim().toLowerCase()}:${semester}`;
    if (!eligibleGroups.has(key)) {
      const visibleSubjects = uploadedSubjectsFromFiles({ files, branch: student.branch, semester });
      eligibleGroups.set(key, visibleSubjects.some(item => item.code.replace(/[^a-z0-9]/gi, '').toLowerCase() === code));
    }
    return eligibleGroups.get(key);
  }).map(student => ({ id: String(student._id), name: student.name, rollNo: student.rollNo || '' }));
  return sortStudentsByRollNo(roster);
}
r.get('/subject-catalog', ah(async (req, res) => {
  const [catalog, owners] = await Promise.all([
    subjectsForCampus(req.user.campus),
    facultySubjectOwners(req.user.campus, req.user._id)
  ]);
  res.json({ success: true, data: catalog.map(subject => ({
    ...subject,
    assignedTo: owners.get(subject.id) || []
  })) });
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
  const saved = await savedSubjectForFaculty(req.user._id, req.validated.subject);
  if (!saved) throw fail(404, 'Subject not found in your saved subjects.');
  const [roster, history] = await Promise.all([
    studentsForSavedSubject(saved.faculty, saved.subject),
    FacultySubjectHistory.find({
      faculty: { $in: await facultyIdsForCampus(saved.faculty.campus) },
      catalogId: req.validated.subject
    })
      .select('code date lectureNo totalStudents students faculty')
      .populate('faculty', 'name phone')
      .sort({ date: -1 })
      .lean()
  ]);
  res.json({ success: true, data: history.map(item => ({
    _id: item._id,
    code: item.code,
    date: item.date,
    lectureNo: item.lectureNo,
    presentCount: item.students.length,
    totalCount: item.totalStudents ?? roster.length,
    facultyName: item.faculty?.name || 'Faculty',
    isOwner: String(item.faculty?._id) === String(req.user._id)
  })) });
}));
r.get('/subject-history/:id', validate(z.object({
  subject: z.string().trim().min(1).max(100)
}).strict(), 'query'), ah(async (req, res) => {
  const saved = await savedSubjectForFaculty(req.user._id, req.validated.subject);
  if (!saved) throw fail(404, 'Subject not found in your saved subjects.');
  const history = await FacultySubjectHistory.findOne({
    _id: oid(req.params.id),
    faculty: { $in: await facultyIdsForCampus(saved.faculty.campus) },
    catalogId: req.validated.subject
  }).select('code date lectureNo totalStudents students createdAt faculty').populate('faculty', 'name phone').lean();
  if (!history) throw fail(404, 'Subject history not found.');
  res.json({ success: true, data: {
    ...history,
    faculty: undefined,
    facultyName: history.faculty?.name || 'Faculty',
    facultyPhone: history.faculty?.phone || '',
    isOwner: String(history.faculty?._id) === String(req.user._id)
  } });
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
  history.totalStudents = roster.length;
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
  timezoneOffsetMinutes: z.number().int().min(-840).max(840),
  lectureNo: z.number().int().min(1).max(12),
  students: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(5000)
}).strict()), ah(async (req, res) => {
  if (dateIsFuture(req.body.date, req.body.timezoneOffsetMinutes)) {
    throw fail(422, 'Attendance cannot be marked for a future date');
  }
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
      lectureNo: req.body.lectureNo,
      totalStudents: roster.length,
      students: selectedIds.map(id => ({
        id,
        name: rosterById.get(id).name,
        rollNo: rosterById.get(id).rollNo
      }))
    });
    res.status(201).json({ success: true, data: history });
  } catch (error) {
    if (error.code === 11000) throw fail(409, 'History for this subject, date, and lecture has already been saved.');
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
  const currentSubjectIds = new Set([
    ...user.savedSubjects.map(subject => `subject:${subject}`),
    ...user.savedUploadedSubjects.map(subject => subject.catalogId)
  ]);
  const owners = await facultySubjectOwners(req.user.campus, user._id);
  const conflicts = selected
    .filter(subject => !currentSubjectIds.has(subject.id) && owners.has(subject.id))
    .map(subject => ({ id: subject.id, code: subject.code, faculty: owners.get(subject.id) }));
  if (conflicts.length) {
    const error = fail(409, 'You cannot add a subject until the faculty member who saved it removes it.');
    error.details = conflicts;
    throw error;
  }
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
r.delete('/my-subjects', validate(z.object({
  subjects: z.array(z.string().min(1).max(100)).min(1).max(500)
}).strict()), ah(async (req, res) => {
  const subjects = [...new Set(req.body.subjects)];
  const user = await U.findById(req.user._id);
  if (!user) throw fail(404, 'Faculty account not found.');
  const savedSubjectIds = new Set(user.savedSubjects.map(subject => `subject:${subject}`));
  const savedUploadedSubjectIds = new Set(user.savedUploadedSubjects.map(subject => subject.catalogId));
  if (subjects.some(subject => !savedSubjectIds.has(subject) && !savedUploadedSubjectIds.has(subject))) {
    throw fail(422, 'Select subjects from your saved subjects.');
  }
  user.savedSubjects = user.savedSubjects.filter(subject => !subjects.includes(`subject:${subject}`));
  user.savedUploadedSubjects = user.savedUploadedSubjects.filter(subject => !subjects.includes(subject.catalogId));
  await user.save();
  res.json({ success: true, data: { removed: subjects.length } });
}));
r.delete('/reset-data', validate(z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  confirmation: z.literal('RESET')
}).strict()), ah(async (req, res) => {
  const user = await U.findById(req.user._id).select('+passwordHash');
  const emailMatches = user && user.email === req.body.email.toLowerCase();
  const passwordMatches = user && await bcrypt.compare(req.body.password, user.passwordHash);
  if (!emailMatches || !passwordMatches) throw fail(401, 'Email or password is incorrect.');

  const session = await U.startSession();
  let deleted;
  try {
    await session.withTransaction(async () => {
      const savedCatalogIds = [...new Set([
        ...user.savedSubjects.map(subject => `subject:${subject}`),
        ...user.savedUploadedSubjects.map(subject => subject.catalogId)
      ])];
      const campusFacultyIds = user.campus
        ? await U.distinct('_id', { role: 'faculty', campus: user.campus }).session(session)
        : [];
      const sessionIds = await S.distinct('_id', { faculty: user._id }).session(session);
      const recordMatch = { $or: [{ faculty: user._id }, { session: { $in: sessionIds } }] };
      const recordIds = await AR.distinct('_id', recordMatch).session(session);
      const correctionMatch = {
        $or: [
          { faculty: user._id },
          { session: { $in: sessionIds } },
          { record: { $in: recordIds } }
        ]
      };
      const correctionRequests = await CR.deleteMany(correctionMatch, { session });
      const attendanceRecords = await AR.deleteMany(recordMatch, { session });
      const attendanceSessions = await S.deleteMany({ faculty: user._id }, { session });
      const subjectHistory = await FacultySubjectHistory.deleteMany({
        $or: [
          { faculty: user._id },
          { faculty: { $in: campusFacultyIds }, catalogId: { $in: savedCatalogIds } }
        ]
      }, { session });
      const assignments = await FA.deleteMany({ faculty: user._id }, { session });
      await U.updateOne(
        { _id: user._id },
        { $set: { savedSubjects: [], savedUploadedSubjects: [] } },
        { session }
      );
      deleted = {
        correctionRequests: correctionRequests.deletedCount,
        attendanceRecords: attendanceRecords.deletedCount,
        attendanceSessions: attendanceSessions.deletedCount,
        subjectHistory: subjectHistory.deletedCount,
        clearedSharedSubjects: savedCatalogIds.length,
        assignments: assignments.deletedCount
      };
      await AuditLog.create([{
        actor: user._id,
        action: 'faculty.data.reset',
        entity: 'User',
        entityId: user._id,
        before: deleted,
        after: { savedSubjects: 0, savedUploadedSubjects: 0 },
        ip: req.ip
      }], { session });
    });
  } finally {
    await session.endSession();
  }
  res.json({ success: true, data: { reset: true, deleted } });
}));
r.get('/dashboard', ah(async (req, res) => {
  const a = await asg(req), cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const campusFacultyIds = await facultyIdsForCampus(req.user.campus);
  const [recentSessions, recentSubjectHistory] = await Promise.all([
    S.find({ faculty: req.user._id, status: 'submitted', submittedAt: { $gte: cutoff } })
      .sort({ submittedAt: -1 })
      .limit(50)
      .populate('subject', 'code name')
      .populate('section', 'name')
      .lean(),
    FacultySubjectHistory.find({ faculty: req.user._id, createdAt: { $gte: cutoff } })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('catalogId code date lectureNo totalStudents students createdAt faculty')
      .populate('faculty', 'name phone')
      .lean()
  ]);
  const sessionCounts = recentSessions.length ? await AR.aggregate([
    { $match: { session: { $in: recentSessions.map(session => session._id) } } },
    { $group: {
      _id: '$session',
      presentCount: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
      totalCount: { $sum: 1 }
    } }
  ]) : [];
  const sessionCountsById = new Map(sessionCounts.map(count => [String(count._id), count]));
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
  const recentSubjectCatalogIds = [...new Set(recentSubjectHistory.map(history => history.catalogId))];
  const recentSectionsBySubject = new Map(await Promise.all(recentSubjectCatalogIds.map(async catalogId => {
    const subject = savedSubjects.find(item => item.catalogId === catalogId);
    if (!subject) return [catalogId, '-'];
    const roster = await studentsForSavedSubject(user, subject);
    if (!roster.length) return [catalogId, '-'];
    const enrollments = await En.find({ student: { $in: roster.map(student => student.id) } })
      .select('student section createdAt')
      .populate('section', 'name')
      .sort({ createdAt: -1 })
      .lean();
    const latestSectionByStudent = new Map();
    for (const enrollment of enrollments) {
      const studentId = String(enrollment.student);
      if (!latestSectionByStudent.has(studentId) && enrollment.section?.name) {
        latestSectionByStudent.set(studentId, enrollment.section.name);
      }
    }
    const sectionNames = [...new Set(latestSectionByStudent.values())].sort((a, b) => a.localeCompare(b));
    return [catalogId, sectionNames.length ? sectionNames.join(', ') : '-'];
  })));
  const legacyRosterCounts = new Map();
  const legacyCatalogIds = [...new Set(recentSubjectHistory
    .filter(history => history.totalStudents == null)
    .map(history => history.catalogId))];
  await Promise.all(legacyCatalogIds.map(async catalogId => {
    const savedSubject = savedSubjects.find(subject => subject.catalogId === catalogId);
    if (savedSubject) {
      legacyRosterCounts.set(catalogId, (await studentsForSavedSubject(user, savedSubject)).length);
    }
  }));
  const recent = [
    ...recentSessions.map(session => {
      const count = sessionCountsById.get(String(session._id));
      return {
        date: session.date,
        subject: session.subject,
        section: session.section,
        lecture: session.period,
        presentCount: count?.presentCount || 0,
        totalCount: count?.totalCount || 0,
        recordedAt: session.submittedAt
      };
    }),
    ...recentSubjectHistory.map(history => ({
      date: new Date(`${history.date}T00:00:00Z`),
      subject: { code: history.code },
      section: { name: recentSectionsBySubject.get(history.catalogId) || '-' },
      lecture: history.lectureNo,
      presentCount: history.students.length,
      totalCount: history.totalStudents ?? legacyRosterCounts.get(history.catalogId) ?? history.students.length,
      recordedAt: history.createdAt,
      facultyName: history.faculty?.name || 'Faculty'
    }))
  ].sort((left, right) => new Date(right.recordedAt) - new Date(left.recordedAt)).slice(0, 50);
  const historyCounts = await FacultySubjectHistory.aggregate([
    { $match: { faculty: { $in: campusFacultyIds }, catalogId: { $in: savedSubjects.map(subject => subject.catalogId) } } },
    { $group: {
      _id: '$catalogId',
      totalDays: { $sum: 1 }
    } }
  ]);
  const historyCountsBySubject = new Map(historyCounts.map(item => [item._id, item]));
  await Promise.all(savedSubjects.map(async subject => {
    const counts = historyCountsBySubject.get(subject.catalogId);
    subject.totalDays = counts?.totalDays || 0;
    const recentHistory = await FacultySubjectHistory.find({
      faculty: { $in: campusFacultyIds },
      catalogId: subject.catalogId
    })
      .sort({ date: -1, createdAt: -1 })
      .limit(5)
      .select('date createdAt students totalStudents')
      .lean();
    const legacyRosterSize = recentHistory.some(history => history.totalStudents == null)
      ? (await studentsForSavedSubject(user, subject)).length
      : 0;
    subject.averagePresent = averageRecentAttendance(recentHistory, legacyRosterSize);
  }));
  res.json({ success: true, data: { subjects: new Set(a.map(x => String(x.subject._id))).size, sections: new Set(a.map(x => String(x.section._id))).size, sessions: await S.countDocuments({ faculty: req.user._id, status: 'submitted' }), pending: await CR.countDocuments({ faculty: req.user._id, status: 'pending' }), savedBy: { name: req.user.name, phone: req.user.phone || '' }, savedSubjects, recent } });
}));
r.get('/sections/:sectionId/students', ah(async (req, res) => {
  const section = oid(req.params.sectionId), term = req.query.term ? String(req.query.term) : null;
  if (!await FA.exists({ faculty: req.user._id, section, ...(term && { term }) })) throw fail(403, 'Not assigned to this section');
  const en = await En.find({ section, ...(term && { term }) }).populate('student', 'name rollNo instId');
  res.json({ success: true, data: sortStudentsByRollNo(en.map(e => e.student).filter(Boolean)) });
}));
r.get('/sessions', ah(async (req, res) => res.json({ success: true, data: await S.find({ faculty: req.user._id }).sort('-date').limit(100).populate('subject', 'code name').populate('section', 'name') })));
r.get('/correction-requests', ah(async (req, res) => res.json({ success: true, data: await CR.find({ faculty: req.user._id }).sort('-createdAt').limit(100).populate('subject', 'code name').populate('student', 'name rollNo') })));
module.exports = r;
