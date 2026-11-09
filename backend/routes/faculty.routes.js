const r = require('express').Router(), { z } = require('zod'), bcrypt = require('bcrypt'), FA = require('../models/FacultyAssignment'), En = require('../models/Enrollment'), S = require('../models/AttendanceSession'), AR = require('../models/AttendanceRecord'), CR = require('../models/CorrectionRequest'), U = require('../models/User'), AuditLog = require('../models/AuditLog'), Subject = require('../models/Subject'), Section = require('../models/Section'), HodFileUpload = require('../models/HodFileUpload'), FacultySubjectHistory = require('../models/FacultySubjectHistory');
const { authenticate } = require('../middleware/authenticate'), authorize = require('../middleware/authorize'), validate = require('../middleware/validate'), { ah, fail, oid, dateIsFuture, sortStudentsByRollNo, sortStudentsByAttendanceSection } = require('../utils/helpers');
const { uploadedSubjectsFromFiles } = require('../utils/uploadedSubjects');
const { backfillHodFileCampuses } = require('../utils/hodFileCampus');
const { averageAttendance, averageRecentAttendance, averageAttendanceBySection } = require('../utils/facultyAttendance');
const { assertAttendanceWithinCollegeHours } = require('../utils/collegeAttendanceHours');
const releaseInactiveFacultySubjects = require('../utils/releaseInactiveFacultySubjects');
r.use(authenticate, authorize('faculty', 'hod'));
const asg = req => FA.find({ faculty: req.user._id }).populate('subject', 'code name').populate('section', 'name campus');
const catalogIdFor = (campus, subjectId) => `${campus}:${subjectId}`;
const parseCatalogId = catalogId => {
  const match = /^(BIRT|BIRTS|BIST):(subject|upload):(.+)$/i.exec(catalogId);
  if (!match) return null;
  return { campus: match[1].toUpperCase(), source: `${match[2].toLowerCase()}:${match[3]}` };
};
const facultyCampusScope = campus => ['BIRT', 'BIRTS'].includes(campus) ? { $in: ['BIRT', 'BIRTS'] } : campus;
function subjectCampusForFaculty(facultyCampus, requestedCampus) {
  const campus = requestedCampus || facultyCampus;
  const allowed = ['BIRT', 'BIRTS'].includes(facultyCampus) ? ['BIRT', 'BIRTS'] : [facultyCampus];
  if (!campus || !allowed.includes(campus)) throw fail(403, 'You cannot select subjects from this college.');
  return campus;
}
function savedDatabaseSubjectCatalog(faculty, subjects) {
  if (!faculty) return [];
  const mappings = faculty.savedSubjectCampuses || [];
  return subjects.flatMap(subject => {
    const subjectId = String(subject._id || subject);
    const source = `subject:${subjectId}`;
    const mapped = mappings.filter(item => item.catalogId.endsWith(`:${source}`));
    const campuses = mapped.length ? mapped.map(item => item.campus) : [faculty.campus].filter(Boolean);
    return campuses.map(campus => ({
      catalogId: catalogIdFor(campus, source),
      legacyCatalogId: source,
      campus,
      code: subject.code,
      name: subject.name,
      department: subject.department?.name || '',
      semester: subject.semester?.number
    }));
  });
}
r.get('/assignments', ah(async (req, res) => res.json({ success: true, data: await asg(req) })));
async function subjectsForCampus(campus) {
  if (!campus) return [];
  await backfillHodFileCampuses();
  const [departments, files] = await Promise.all([
    Section.distinct('department', { campus }),
    HodFileUpload.find({ campus, kind: { $ne: 'student-list' } }).select('fileName content department').populate('department', 'name').sort('-createdAt').limit(100).lean()
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
    const catalogId = catalogIdFor(campus, `subject:${subject._id}`);
    catalog.set(catalogId, {
      id: catalogId,
      campus,
      code: subject.code,
      name: subject.name,
      department: subject.department?.name || '',
      semester: subject.semester?.number
    });
  }
  for (const subject of uploadedSubjects) {
    const catalogId = catalogIdFor(campus, `upload:${subject.code.toLowerCase()}`);
    const alreadyListed = [...catalog.values()].some(item => item.code.toLowerCase() === subject.code.toLowerCase());
    if (!alreadyListed && !catalog.has(catalogId)) catalog.set(catalogId, {
      id: catalogId,
      campus,
      code: subject.code,
      name: subject.name,
      department: subject.department,
      semester: subject.semester
    });
  }
  return [...catalog.values()].sort((a, b) => a.code.localeCompare(b.code));
}
async function availableUploadedSubjectCatalogIds(campuses) {
  const catalogs = await Promise.all([...new Set(campuses.filter(Boolean))].map(subjectsForCampus));
  return new Set(catalogs.flat()
    .filter(subject => parseCatalogId(subject.id)?.source.startsWith('upload:'))
    .map(subject => subject.id));
}
async function facultySubjectOwners(campus, excludeFacultyId) {
  if (!campus) return new Map();
  const [faculty, availableUploadedIds] = await Promise.all([
    U.find({ role: { $in: ['faculty', 'hod'] }, campus: facultyCampusScope(campus), active: true })
    .select('name phone campus savedSubjects savedSubjectCampuses savedUploadedSubjects')
    .lean(),
    availableUploadedSubjectCatalogIds([campus])
  ]);
  const owners = new Map();
  const addOwner = (catalogId, member) => {
    if (!owners.has(catalogId)) owners.set(catalogId, []);
    owners.get(catalogId).push({ name: member.name, phone: member.phone || '' });
  };
  for (const member of faculty) {
    if (String(member._id) === String(excludeFacultyId)) continue;
    for (const subject of savedDatabaseSubjectCatalog(member, member.savedSubjects || [])) {
      if (subject.campus === campus) addOwner(subject.catalogId, member);
    }
    for (const subject of member.savedUploadedSubjects || []) {
      const subjectCampus = subject.campus || member.campus;
      const parsed = parseCatalogId(subject.catalogId);
      if (subjectCampus === campus) {
        const catalogId = parsed?.campus === campus ? subject.catalogId : catalogIdFor(campus, subject.catalogId);
        if (availableUploadedIds.has(catalogId)) addOwner(catalogId, member);
      }
    }
  }
  return owners;
}
async function facultyIdsForCampus(campus) {
  if (!campus) return [];
  return U.find({ role: { $in: ['faculty', 'hod'] }, campus: facultyCampusScope(campus) }).distinct('_id');
}
async function facultyIdsForExactCampus(campus) {
  if (!campus) return [];
  return U.find({ role: { $in: ['faculty', 'hod'] }, campus }).distinct('_id');
}
async function subjectHistoryFilter(saved) {
  const campus = saved.subject.campus || saved.faculty.campus;
  const conditions = [{
    faculty: { $in: await facultyIdsForCampus(campus) },
    catalogId: saved.subject.catalogId
  }];
  if (campus === saved.faculty.campus && saved.subject.legacyCatalogId && saved.subject.legacyCatalogId !== saved.subject.catalogId) {
    conditions.push({
      faculty: { $in: await facultyIdsForExactCampus(campus) },
      catalogId: saved.subject.legacyCatalogId
    });
  }
  return { $or: conditions };
}
async function savedSubjectForFaculty(facultyId, catalogId) {
  const faculty = await U.findById(facultyId)
    .select('campus savedSubjects savedSubjectCampuses savedUploadedSubjects')
    .populate('savedSubjects', 'code')
    .lean();
  if (!faculty) return null;
  const mapping = (faculty.savedSubjectCampuses || []).find(item => item.catalogId === catalogId);
  const subject = [
    ...savedDatabaseSubjectCatalog(faculty, faculty.savedSubjects || []),
    ...(faculty.savedUploadedSubjects || []).map(item => {
      const campus = item.campus || faculty.campus;
      const parsed = parseCatalogId(item.catalogId);
      return {
        ...item,
        campus,
        catalogId: parsed?.campus === campus ? item.catalogId : catalogIdFor(campus, item.catalogId),
        legacyCatalogId: parsed?.source || item.catalogId
      };
    })
  ].find(item => item.catalogId === catalogId && (!mapping || mapping.campus === item.campus));
  if (subject && parseCatalogId(subject.catalogId)?.source.startsWith('upload:')) {
    const availableUploadedIds = await availableUploadedSubjectCatalogIds([subject.campus]);
    if (!availableUploadedIds.has(subject.catalogId)) return null;
  }
  return subject ? { faculty, subject } : null;
}
async function studentsForSavedSubject(faculty, subject) {
  const campus = subject.campus || faculty.campus;
  if (!campus) return [];
  const groupedByAttendanceSection = ['BIRT', 'BIRTS'].includes(faculty.campus) && ['BIRT', 'BIRTS'].includes(campus);
  const campuses = groupedByAttendanceSection ? ['BIRT', 'BIRTS'] : [campus];
  await backfillHodFileCampuses();
  const [filesByCampus, students] = await Promise.all([
    Promise.all(campuses.map(campusName => HodFileUpload.find({ campus: campusName, kind: { $ne: 'student-list' } })
      .select('fileName content department campus')
      .populate('department', 'name')
      .sort('-createdAt')
      .limit(100)
      .lean())),
    U.find({
      role: 'student',
      campus: { $in: campuses },
      active: true,
      ...(groupedByAttendanceSection ? { attendanceSection: { $in: ['Birt', 'Birts'] } } : {})
    })
      .select('name rollNo branch semester campus attendanceSection')
      .populate('semester', 'number')
      .sort('name')
      .lean()
  ]);
  const filesByCampusMap = new Map(campuses.map((campusName, index) => [campusName, filesByCampus[index]]));
  const eligibleGroups = new Map();
  const code = String(subject.code).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const roster = students.filter(student => {
    const semester = student.semester?.number;
    if (!student.branch || semester == null) return false;
    const key = `${student.campus}:${student.branch.trim().toLowerCase()}:${semester}`;
    if (!eligibleGroups.has(key)) {
      const visibleSubjects = uploadedSubjectsFromFiles({
        files: filesByCampusMap.get(student.campus) || [],
        branch: student.branch,
        semester
      });
      eligibleGroups.set(key, visibleSubjects.some(item => item.code.replace(/[^a-z0-9]/gi, '').toLowerCase() === code));
    }
    return eligibleGroups.get(key);
  }).map(student => ({
    id: String(student._id),
    name: student.name,
    rollNo: student.rollNo || '',
    ...(groupedByAttendanceSection ? { attendanceSection: student.attendanceSection } : {})
  }));
  return groupedByAttendanceSection ? sortStudentsByAttendanceSection(roster) : sortStudentsByRollNo(roster);
}
r.get('/subject-catalog', ah(async (req, res) => {
  const query = z.object({ campus: z.enum(['BIRT', 'BIRTS', 'BIST']).optional() }).strict().safeParse(req.query);
  if (!query.success) throw fail(400, 'Select a valid college.');
  const campus = subjectCampusForFaculty(req.user.campus, query.data.campus);
  const [catalog, owners] = await Promise.all([
    subjectsForCampus(campus),
    facultySubjectOwners(campus, req.user._id)
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
    FacultySubjectHistory.find(await subjectHistoryFilter(saved))
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
    ...await subjectHistoryFilter(saved)
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
  await assertAttendanceWithinCollegeHours(saved.subject.campus || saved.faculty.campus);
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
    rollNo: rosterById.get(id).rollNo,
    attendanceSection: rosterById.get(id).attendanceSection
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
  await assertAttendanceWithinCollegeHours(saved.subject.campus || saved.faculty.campus);
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
        rollNo: rosterById.get(id).rollNo,
        attendanceSection: rosterById.get(id).attendanceSection
      }))
    });
    res.status(201).json({ success: true, data: history });
  } catch (error) {
    if (error.code === 11000) throw fail(409, 'History for this subject, date, and lecture has already been saved.');
    throw error;
  }
}));
r.put('/my-subjects', validate(z.object({
  campus: z.enum(['BIRT', 'BIRTS', 'BIST']).optional(),
  subjects: z.array(z.string().min(1).max(100)).max(500)
}).strict()), ah(async (req, res) => {
  const campus = subjectCampusForFaculty(req.user.campus, req.body.campus);
  const subjects = [...new Set(req.body.subjects)];
  const allowed = await subjectsForCampus(campus);
  const allowedSubjects = new Map(allowed.map(subject => [subject.id, subject]));
  if (subjects.some(subject => !allowedSubjects.has(subject))) throw fail(422, 'Select subjects from your college subject list.');
  const selected = subjects.map(subject => allowedSubjects.get(subject));
  const user = await U.findById(req.user._id);
  if (!user) throw fail(404, 'Faculty account not found.');
  const currentMappings = [...(user.savedSubjectCampuses || [])];
  for (const id of user.savedSubjects) {
    const source = `subject:${id}`;
    if (!currentMappings.some(item => parseCatalogId(item.catalogId)?.source === source)) {
      currentMappings.push({ catalogId: catalogIdFor(user.campus, source), campus: user.campus });
    }
  }
  const currentUploaded = user.savedUploadedSubjects.map(subject => {
    const savedCampus = subject.campus || user.campus;
    const parsed = parseCatalogId(subject.catalogId);
    return {
      ...subject.toObject(),
      campus: savedCampus,
      catalogId: parsed?.campus === savedCampus ? subject.catalogId : catalogIdFor(savedCampus, subject.catalogId)
    };
  });
  const currentSubjectIds = new Set([
    ...currentMappings.filter(item => item.campus === campus).map(item => item.catalogId),
    ...currentUploaded.filter(subject => subject.campus === campus).map(subject => subject.catalogId)
  ]);
  const owners = await facultySubjectOwners(campus, user._id);
  const conflicts = selected
    .filter(subject => !currentSubjectIds.has(subject.id) && owners.has(subject.id))
    .map(subject => ({ id: subject.id, code: subject.code, faculty: owners.get(subject.id) }));
  if (conflicts.length) {
    const error = fail(409, 'You cannot add a subject until the faculty member who saved it removes it.');
    error.details = conflicts;
    throw error;
  }
  const retainedMappings = currentMappings.filter(item => item.campus !== campus || subjects.includes(item.catalogId));
  const selectedDatabaseMappings = selected
    .filter(subject => parseCatalogId(subject.id)?.source.startsWith('subject:'))
    .map(subject => ({ catalogId: subject.id, campus }));
  user.savedSubjectCampuses = [...new Map([...retainedMappings, ...selectedDatabaseMappings].map(item => [item.catalogId, item])).values()];
  user.savedSubjects = [...new Set(user.savedSubjectCampuses
    .map(item => parseCatalogId(item.catalogId))
    .filter(item => item?.source.startsWith('subject:'))
    .map(item => item.source.slice('subject:'.length)))];
  const retainedUploaded = currentUploaded.filter(subject => subject.campus !== campus);
  const selectedUploaded = selected
    .filter(subject => parseCatalogId(subject.id)?.source.startsWith('upload:'))
    .map(subject => ({
      catalogId: subject.id,
      code: subject.code,
      name: subject.name,
      department: subject.department,
      semester: subject.semester,
      campus
    }));
  user.savedUploadedSubjects = [...retainedUploaded, ...selectedUploaded];
  await user.save();
  const newlyClaimed = selected
    .filter(subject => !currentSubjectIds.has(subject.id))
    .map(subject => subject.id);
  if (newlyClaimed.length) {
    const inactiveFaculty = await U.find({
      role: { $in: ['faculty', 'hod'] },
      campus: facultyCampusScope(campus),
      active: false,
      _id: { $ne: user._id }
    }).select('campus savedSubjects savedSubjectCampuses savedUploadedSubjects').lean();
    const updates = inactiveFaculty.flatMap(member => {
      const released = releaseInactiveFacultySubjects(member, campus, newlyClaimed);
      return released.changed ? [{
        updateOne: {
          filter: { _id: member._id, active: false },
          update: {
            $set: {
              savedSubjects: released.savedSubjects,
              savedSubjectCampuses: released.savedSubjectCampuses,
              savedUploadedSubjects: released.savedUploadedSubjects
            }
          }
        }
      }] : [];
    });
    if (updates.length) await U.bulkWrite(updates);
  }
  await user.populate({ path: 'savedSubjects', select: 'code name department semester', populate: [{ path: 'department', select: 'name' }, { path: 'semester', select: 'number' }] });
  const savedSubjects = [
    ...savedDatabaseSubjectCatalog(user, user.savedSubjects),
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
  const mappings = [...(user.savedSubjectCampuses || [])];
  for (const id of user.savedSubjects) {
    const source = `subject:${id}`;
    if (!mappings.some(item => parseCatalogId(item.catalogId)?.source === source)) {
      mappings.push({ catalogId: catalogIdFor(user.campus, source), campus: user.campus });
    }
  }
  const uploaded = user.savedUploadedSubjects.map(subject => {
    const campus = subject.campus || user.campus;
    const parsed = parseCatalogId(subject.catalogId);
    return { ...subject.toObject(), campus, catalogId: parsed?.campus === campus ? subject.catalogId : catalogIdFor(campus, subject.catalogId) };
  });
  const savedIds = new Set([...mappings.map(item => item.catalogId), ...uploaded.map(subject => subject.catalogId)]);
  if (subjects.some(subject => !savedIds.has(subject))) {
    throw fail(422, 'Select subjects from your saved subjects.');
  }
  user.savedSubjectCampuses = mappings.filter(item => !subjects.includes(item.catalogId));
  user.savedSubjects = [...new Set(user.savedSubjectCampuses
    .map(item => parseCatalogId(item.catalogId))
    .filter(item => item?.source.startsWith('subject:'))
    .map(item => item.source.slice('subject:'.length)))];
  user.savedUploadedSubjects = uploaded.filter(subject => !subjects.includes(subject.catalogId));
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
      const savedCatalogs = [
        ...savedDatabaseSubjectCatalog(user, user.savedSubjects),
        ...user.savedUploadedSubjects.map(subject => {
          const campus = subject.campus || user.campus;
          const parsed = parseCatalogId(subject.catalogId);
          return {
            campus,
            catalogId: parsed?.campus === campus ? subject.catalogId : catalogIdFor(campus, subject.catalogId),
            legacyCatalogId: parsed?.source || subject.catalogId
          };
        })
      ];
      const savedCatalogIds = [...new Set(savedCatalogs.map(subject => subject.catalogId))];
      const historyConditions = [{ faculty: user._id }];
      for (const campus of new Set(savedCatalogs.map(subject => subject.campus).filter(Boolean))) {
        const subjects = savedCatalogs.filter(subject => subject.campus === campus);
        const facultyIds = await U.distinct('_id', { role: { $in: ['faculty', 'hod'] }, campus: facultyCampusScope(campus) }).session(session);
        historyConditions.push({ faculty: { $in: facultyIds }, catalogId: { $in: subjects.map(subject => subject.catalogId) } });
        const legacyIds = [...new Set(subjects
          .filter(subject => campus === user.campus && subject.legacyCatalogId)
          .map(subject => subject.legacyCatalogId))];
        if (legacyIds.length) {
          const exactCampusFacultyIds = await U.distinct('_id', { role: { $in: ['faculty', 'hod'] }, campus }).session(session);
          historyConditions.push({ faculty: { $in: exactCampusFacultyIds }, catalogId: { $in: legacyIds } });
        }
      }
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
        $or: historyConditions
      }, { session });
      const assignments = await FA.deleteMany({ faculty: user._id }, { session });
      await U.updateOne(
        { _id: user._id },
        { $set: { savedSubjects: [], savedSubjectCampuses: [], savedUploadedSubjects: [] } },
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
        after: { savedSubjects: 0, savedSubjectCampuses: 0, savedUploadedSubjects: 0 },
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
  const uploadedCatalogIds = await availableUploadedSubjectCatalogIds([
    user?.campus,
    ...(user?.savedUploadedSubjects || []).map(subject => subject.campus || user?.campus)
  ]);
  const savedSubjects = [
    ...savedDatabaseSubjectCatalog(user, user?.savedSubjects || []),
    ...(user?.savedUploadedSubjects || []).map(subject => {
      const campus = subject.campus || user.campus;
      const parsed = parseCatalogId(subject.catalogId);
      return {
        ...subject,
        campus,
        catalogId: parsed?.campus === campus ? subject.catalogId : catalogIdFor(campus, subject.catalogId),
        legacyCatalogId: parsed?.source || subject.catalogId
      };
    }).filter(subject => uploadedCatalogIds.has(subject.catalogId))
  ];
  const savedCampuses = [...new Set(savedSubjects.map(subject => subject.campus).filter(Boolean))];
  const savedFiles = savedCampuses.length
    ? await HodFileUpload.find({ campus: { $in: savedCampuses }, kind: { $ne: 'student-list' } })
      .select('fileName content campus')
      .sort('-createdAt')
      .limit(100)
      .lean()
    : [];
  const savedCodes = [...new Set(savedSubjects.map(subject => String(subject.code || '').trim().toUpperCase()).filter(Boolean))];
  const databaseSubjectsByCode = savedCodes.length
    ? await Subject.find({ code: { $in: savedCodes } }).select('code name department semester').lean()
    : [];
  const uploadedNamesByCampusAndCode = new Map();
  for (const campus of savedCampuses) {
    const uploaded = uploadedSubjectsFromFiles({ files: savedFiles.filter(file => file.campus === campus) });
    uploaded.forEach(subject => uploadedNamesByCampusAndCode.set(`${campus}:${String(subject.code || '').trim().toUpperCase()}`, subject.name || subject.code));
  }
  for (const subject of savedSubjects) {
    if (!subject.name) {
      const databaseSubject = databaseSubjectsByCode.find(item => String(item.code).trim().toUpperCase() === String(subject.code || '').trim().toUpperCase());
      subject.name = databaseSubject?.name || uploadedNamesByCampusAndCode.get(`${subject.campus}:${String(subject.code || '').trim().toUpperCase()}`) || '';
    }
    if (!subject.department) {
      const databaseSubject = databaseSubjectsByCode.find(item => String(item.code).trim().toUpperCase() === String(subject.code || '').trim().toUpperCase());
      subject.department = databaseSubject?.department?.name || '';
    }
  }
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
  const historyFilters = await Promise.all(savedSubjects.map(subject => subjectHistoryFilter({ faculty: user, subject })));
  const historyCounts = savedSubjects.length ? await FacultySubjectHistory.aggregate([
    { $match: { $or: historyFilters.flatMap(filter => filter.$or) } },
    { $group: { _id: '$catalogId', totalDays: { $sum: 1 } } }
  ]) : [];
  const historyCountsBySubject = new Map();
  historyCounts.forEach(item => {
    const subject = savedSubjects.find(saved => saved.catalogId === item._id
      || (saved.campus === user.campus && saved.legacyCatalogId === item._id));
    if (subject) historyCountsBySubject.set(subject.catalogId, item);
  });
  await Promise.all(savedSubjects.map(async subject => {
    const counts = historyCountsBySubject.get(subject.catalogId);
    subject.totalDays = counts?.totalDays || 0;
    const recentHistory = await FacultySubjectHistory.find(await subjectHistoryFilter({ faculty: user, subject }))
      .sort({ date: -1, createdAt: -1 })
      .limit(3)
      .select('date createdAt students totalStudents')
      .lean();
    const legacyRosterSize = recentHistory.some(history => history.totalStudents == null)
      ? (await studentsForSavedSubject(user, subject)).length
      : 0;
    subject.averagePresent = averageRecentAttendance(recentHistory, legacyRosterSize);
    if (['BIRT', 'BIRTS'].includes(user.campus) && ['BIRT', 'BIRTS'].includes(subject.campus)) {
      const roster = await studentsForSavedSubject(user, subject);
      subject.averageByAttendanceSection = averageAttendanceBySection(recentHistory, roster);
    }
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
